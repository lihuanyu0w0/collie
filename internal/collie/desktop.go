package collie

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The desktop apps (Claude, Codex, Antigravity) keep their own lists of
// conversations. Collie reads those lists, so a conversation shows whether or
// not it runs right now, the way the app's own sidebar shows it: the running
// ones, and the rest of the last week. Each app is read its own way, read-only:
//
//   - Claude: the desktop app's session index, one JSON per session under
//     ~/Library/Application Support/Claude/claude-code-sessions (title,
//     directory, archived, which transcript it runs).
//   - Codex: the App's thread table in <CODEX_HOME>/state_<n>.sqlite (source
//     "vscode" is the App); a message goes through the App's local message bus,
//     so it runs in the App window that owns the thread.
//   - Antigravity: its conversation index, ~/.gemini/antigravity/conversation_summaries.db.

const (
	desktopWindow = 7 * 24 * time.Hour
	desktopMax    = 20 // per app
)

const (
	appClaude = "Claude 桌面版"
	appCodex  = "Codex 桌面版"
	appAgy    = "Antigravity 桌面版"
	appAgyCLI = "Antigravity CLI"
)

// desktopRow is one conversation as an app's index lists it.
type desktopRow struct {
	id, kind, app       string
	session, title, cwd string
	path, format        string
	created, updated    time.Time
	running             bool // the app says a turn is running (Codex, Antigravity)
	waiting             bool // stopped, with something still to come (an Antigravity timer)
}

var desktopCache struct {
	sync.Mutex
	at   time.Time
	rows []desktopRow
	app  bool // the Codex App is up
}

// desktopRows reads the apps' indexes, at most every 10 seconds.
func (s *Server) desktopRows() ([]desktopRow, bool) {
	desktopCache.Lock()
	defer desktopCache.Unlock()
	if time.Since(desktopCache.at) < 5*time.Second && desktopCache.rows != nil {
		return desktopCache.rows, desktopCache.app
	}
	var rows []desktopRow
	rows = append(rows, s.claudeDesktopRows()...)
	rows = append(rows, s.codexAppRows()...)
	agyRows := s.agyDesktopRows()
	for _, cli := range s.recentAgyCLI() {
		// A CLI can import a desktop conversation with the same ID. Keep a
		// running desktop turn, otherwise prefer the latest readable copy.
		i := slices.IndexFunc(agyRows, func(r desktopRow) bool { return r.session == cli.session })
		if i < 0 {
			agyRows = append(agyRows, cli)
		} else if d := agyRows[i]; !d.running && !d.waiting && (d.path == "" || !d.updated.After(cli.updated)) {
			agyRows[i] = cli
		}
	}
	rows = append(rows, agyRows...)
	desktopCache.at, desktopCache.rows, desktopCache.app = time.Now(), rows, s.codexAppUp()
	return rows, desktopCache.app
}

func forgetDesktopRows() {
	desktopCache.Lock()
	desktopCache.at = time.Time{}
	desktopCache.Unlock()
}

// desktopSessions turns the apps' rows into sessions, joined with what runs
// now: Claude desktop processes (regs) and terminal agents already listed.
func (s *Server) desktopSessions(regs map[int]*claudeReg, listed map[string]bool, now time.Time) []*External {
	rows, appUp := s.desktopRows()
	bySession := map[string]*claudeReg{}
	for _, r := range regs {
		if strings.HasPrefix(r.Entrypoint, "claude-desktop") {
			bySession[r.SessionID] = r
		}
	}
	var out []*External
	for _, d := range rows {
		if listed[d.session] {
			continue
		}
		e := &External{ID: d.id, Kind: d.kind, Cwd: d.cwd, App: d.app, Started: d.created, Session: d.session, Title: d.title, Updated: d.updated, path: d.path, format: d.format, desktop: true}
		if e.path != "" {
			if fi, err := os.Stat(e.path); err == nil && fi.ModTime().After(e.Updated) {
				e.Updated = fi.ModTime()
			}
		}
		switch d.kind {
		case "claude":
			if r := bySession[d.session]; r != nil {
				e.reg, e.PID, e.Live = r, r.PID, true
				s.reachable(e)
			} else {
				e.ReadOnly = "这个会话现在没在运行：在 Claude 桌面版里打开它，就能从这里发消息"
				e.CanTakeOver = e.path != "" && e.Cwd != ""
			}
		case "codex":
			e.Live = d.running
			if d.running {
				e.Status = "working"
			}
			switch {
			case appUp:
				e.CanSend, e.via = true, "app"
			case s.codexDaemonHas(d.session):
				// A thread the App opened on this machine from another
				// computer runs in Codex's shared background service.
				e.CanSend = true
			case isCodexApp(d.app) && !d.running && s.codexDaemonSock() != "":
				// The new App (and a closed one) can't be written to; the
				// shared daemon continues the thread instead.
				e.CanSend, e.via = true, "bg"
				// The CLI shares ~/.codex with the App: `codex resume` picks
				// the thread up in a herdr pane too.
				e.CanTakeOver = e.Session != "" && e.Cwd != ""
			case isCodexApp(d.app) && d.running:
				e.ReadOnly = "Codex 正在跑这个对话：等它这一轮跑完再发，或直接在 Codex 里说"
			case isCodexApp(d.app):
				e.ReadOnly = "这台电脑上没有 Codex 后台：在 Codex 里接着说，或在 herdr 里接管"
				e.CanTakeOver = e.Session != "" && e.Cwd != ""
			default:
				e.ReadOnly = "这个对话现在没有在 Codex 里打开：在 Codex App 里点开它，就能从这里发消息"
			}
		case "agy":
			if d.app == appAgyCLI {
				switch {
				case !filepath.IsAbs(d.cwd) || !isDir(d.cwd):
					e.ReadOnly = "原工作目录不可用，可以在这里查看历史记录"
				case !s.agyCLIResumeData(d.session):
					e.ReadOnly = "只找到了聊天记录，缺少恢复会话所需的数据"
				default:
					e.CanTakeOver = true
					e.ReadOnly = "这个 CLI 会话已退出"
				}
				break
			}
			e.Live = d.running || d.waiting
			if d.running {
				e.Status = "working"
			} else if d.waiting {
				e.Status = "waiting"
			}
			if len(s.agyDesktopServers()) > 0 {
				e.CanSend, e.via = true, "app"
			} else {
				e.ReadOnly = "Antigravity 没有打开：打开它之后就能从这里发消息"
			}
			if !e.Live && e.Session != "" && e.Cwd != "" {
				e.CanTakeOver = true
			}
		}
		out = append(out, e)
	}
	// Desktop processes the index does not know yet (just created) still show.
	for pid, r := range regs {
		if !strings.HasPrefix(r.Entrypoint, "claude-desktop") || listed[r.SessionID] || rowsHave(rows, r.SessionID) {
			continue
		}
		e := &External{ID: fmt.Sprintf("claude-%d", pid), Kind: "claude", PID: pid, Cwd: r.Cwd, App: appClaude, Session: r.SessionID, reg: r, Live: true, desktop: true, Started: now}
		if path, format := s.findTranscript("claude", "id", r.SessionID, "", ""); path != "" {
			e.path, e.format = path, format
			if fi, err := os.Stat(path); err == nil {
				e.Updated = fi.ModTime()
			}
			e.Title = firstUserLine(path, format)
		}
		s.reachable(e)
		out = append(out, e)
	}
	return out
}

func rowsHave(rows []desktopRow, session string) bool {
	for _, d := range rows {
		if d.session == session {
			return true
		}
	}
	return false
}

// firstUserLine is a conversation's first message, as a title. It reads from
// the top only until that message (a session's log can be tens of MB, and the
// session list asks for every running one every few seconds), and remembers it.
var firstUserCache = struct {
	sync.Mutex
	m map[string]string
}{m: map[string]string{}}

func firstUserLine(path, format string) string {
	firstUserCache.Lock()
	t, ok := firstUserCache.m[path]
	firstUserCache.Unlock()
	if ok {
		return t
	}
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	tr := newTranscript(path, format)
	r := bufio.NewReaderSize(f, 1<<20)
	read := 0
	for read < 8<<20 && t == "" {
		line, err := r.ReadBytes('\n')
		if err != nil {
			break
		}
		read += len(line)
		tr.line(line)
		for _, m := range tr.msgs {
			if m.Kind == "user" && strings.TrimSpace(m.Text) != "" && !strings.HasPrefix(m.Text, "[collie]") {
				t = messageTitle(m.Text)
				break
			}
		}
		tr.msgs = tr.msgs[:0]
	}
	if t != "" {
		firstUserCache.Lock()
		if len(firstUserCache.m) > 2000 {
			firstUserCache.m = map[string]string{}
		}
		firstUserCache.m[path] = t
		firstUserCache.Unlock()
	}
	return t
}

// ---------------------------------------------------------------- Claude

// claudeDesktopDirs are the desktop apps' data directories (the build on a
// third-party provider keeps its own). Only macOS's layout is known.
func (s *Server) claudeDesktopDirs() []string {
	if runtime.GOOS != "darwin" {
		return nil
	}
	base := filepath.Join(s.home, "Library", "Application Support")
	return []string{filepath.Join(base, "Claude"), filepath.Join(base, "Claude-3p")}
}

type claudeDesktopJSON struct {
	SessionID    string `json:"sessionId"`
	CliSessionID string `json:"cliSessionId"`
	Cwd          string `json:"cwd"`
	Title        string `json:"title"`
	Archived     bool   `json:"isArchived"`
	Created      int64  `json:"createdAt"`
	Activity     int64  `json:"lastActivityAt"`
}

// Index files are read again only when they change.
var claudeDesktopFiles = struct {
	sync.Mutex
	m map[string]struct {
		mod time.Time
		v   claudeDesktopJSON
	}
}{m: map[string]struct {
	mod time.Time
	v   claudeDesktopJSON
}{}}

func (s *Server) claudeDesktopRows() []desktopRow {
	var rows []desktopRow
	cutoff := time.Now().Add(-desktopWindow)
	claudeDesktopFiles.Lock()
	defer claudeDesktopFiles.Unlock()
	for _, dir := range s.claudeDesktopDirs() {
		files, _ := filepath.Glob(filepath.Join(dir, "claude-code-sessions", "*", "*", "local_*.json"))
		for _, f := range files {
			fi, err := os.Stat(f)
			if err != nil {
				continue
			}
			c, ok := claudeDesktopFiles.m[f]
			if !ok || !c.mod.Equal(fi.ModTime()) {
				c.mod = fi.ModTime()
				c.v = claudeDesktopJSON{}
				if b, err := os.ReadFile(f); err == nil {
					json.Unmarshal(b, &c.v)
				}
				claudeDesktopFiles.m[f] = c
			}
			v := c.v
			last := time.UnixMilli(v.Activity)
			if v.Activity == 0 {
				last = fi.ModTime()
			}
			if v.CliSessionID == "" || v.Archived || last.Before(cutoff) {
				continue
			}
			local := strings.TrimPrefix(v.SessionID, "local_")
			if local == "" {
				local = v.CliSessionID
			}
			d := desktopRow{id: "cd-" + local, kind: "claude", app: appClaude, session: v.CliSessionID, title: v.Title, cwd: v.Cwd, created: time.UnixMilli(v.Created), updated: last}
			d.path, d.format = s.findTranscript("claude", "id", v.CliSessionID, "", "")
			rows = append(rows, d)
		}
	}
	return newestRows(rows)
}

func newestRows(rows []desktopRow) []desktopRow {
	sort.Slice(rows, func(i, j int) bool { return rows[i].updated.After(rows[j].updated) })
	if len(rows) > desktopMax {
		rows = rows[:desktopMax]
	}
	return rows
}

// ---------------------------------------------------------------- Codex App

// codexStateDB is the newest of the App's state databases (its number goes up with its schema).
func (s *Server) codexStateDB() string {
	paths, _ := filepath.Glob(filepath.Join(s.codexHome(), "state_*.sqlite"))
	best, bestN := "", -1
	for _, p := range paths {
		n, err := strconv.Atoi(strings.TrimSuffix(strings.TrimPrefix(filepath.Base(p), "state_"), ".sqlite"))
		if err == nil && n > bestN {
			best, bestN = p, n
		}
	}
	return best
}

func (s *Server) codexAppRows() []desktopRow {
	path := s.codexStateDB()
	if path == "" {
		return nil
	}
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro&_pragma=busy_timeout(2000)")
	if err != nil {
		return nil
	}
	defer db.Close()
	q := `SELECT id, COALESCE(NULLIF(name,''), NULLIF(title,''), first_user_message), cwd, rollout_path,
		COALESCE(created_at_ms, created_at*1000), COALESCE(updated_at_ms, updated_at*1000), COALESCE(originator, '')
		FROM threads WHERE archived = 0 AND source = 'vscode' AND updated_at > ? ORDER BY updated_at DESC LIMIT ?`
	res, err := db.Query(q, time.Now().Add(-desktopWindow).Unix(), desktopMax)
	if err != nil {
		return nil
	}
	defer res.Close()
	var rows []desktopRow
	for res.Next() {
		var id, title, cwd, rollout, originator string
		var created, updated int64
		if res.Scan(&id, &title, &cwd, &rollout, &created, &updated, &originator) != nil {
			continue
		}
		app := codexClient(originator, cwd)
		d := desktopRow{id: "cx-" + id, kind: "codex", app: app, session: id, title: messageTitle(title), cwd: cwd, created: time.UnixMilli(created), updated: time.UnixMilli(updated)}
		if isFile(rollout) {
			d.path, d.format = rollout, "codex"
			d.running = codexTurnRunning(rollout)
		}
		rows = append(rows, d)
	}
	return rows
}

// codexTurnRunning: the rollout's last turn has started and not ended. A turn
// silent for 20 minutes is taken as over (the App may have died mid-turn).
// A long turn's start can sit megabytes back, so read backwards a chunk at a
// time until a start or an end turns up.
func codexTurnRunning(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil || time.Since(fi.ModTime()) > 20*time.Minute {
		return false
	}
	return lastTurnOpen(f, fi.Size())
}

func lastTurnOpen(r io.ReaderAt, size int64) bool {
	const chunk, overlap = 512 << 10, 64
	for end := size; end > 0; end -= chunk - overlap {
		off := max(end-chunk, 0)
		b := make([]byte, end-off)
		if _, err := r.ReadAt(b, off); err != nil && err != io.EOF {
			return false
		}
		started := bytes.LastIndex(b, []byte(`"type":"task_started"`))
		ended := max(bytes.LastIndex(b, []byte(`"type":"task_complete"`)), bytes.LastIndex(b, []byte(`"type":"turn_aborted"`)))
		if started >= 0 || ended >= 0 {
			return started > ended
		}
		if off == 0 {
			break
		}
	}
	return false
}

// The Codex App's local message bus: its windows ask each other to run a turn
// in a thread one of them owns; Collie joins as one more client. Frames are a
// 4-byte little-endian length and a JSON object; each request carries the
// version the App expects for its method.
func (s *Server) codexAppSock() string { return filepath.Join(s.codexHome(), "ipc", "ipc.sock") }

func (s *Server) codexAppUp() bool {
	c, err := net.DialTimeout("unix", s.codexAppSock(), 300*time.Millisecond)
	if err != nil {
		return false
	}
	c.Close()
	return true
}

var codexAppVersions = map[string]int{"thread-owner-discovery": 1, "thread-follower-start-turn": 2, "thread-follower-steer-turn": 1}

type codexAppFrame struct {
	Type            string          `json:"type"`
	RequestID       string          `json:"requestId,omitempty"`
	Method          string          `json:"method,omitempty"`
	ResultType      string          `json:"resultType,omitempty"`
	Error           string          `json:"error,omitempty"`
	HandledByClient string          `json:"handledByClientId,omitempty"`
	Params          any             `json:"params,omitempty"`
	Version         int             `json:"version,omitempty"`
	TargetClientID  string          `json:"targetClientId,omitempty"`
	Response        any             `json:"response,omitempty"`
	Result          json.RawMessage `json:"result,omitempty"`
}

type codexApp struct{ conn net.Conn }

func (c *codexApp) write(f codexAppFrame) error {
	b, err := json.Marshal(f)
	if err != nil {
		return err
	}
	buf := make([]byte, 4+len(b))
	binary.LittleEndian.PutUint32(buf, uint32(len(b)))
	copy(buf[4:], b)
	_, err = c.conn.Write(buf)
	return err
}

func (c *codexApp) read() (codexAppFrame, error) {
	var f codexAppFrame
	var head [4]byte
	if _, err := io.ReadFull(c.conn, head[:]); err != nil {
		return f, err
	}
	n := binary.LittleEndian.Uint32(head[:])
	if n == 0 || n > 64<<20 {
		return f, fmt.Errorf("Codex App 消息格式不对（%d 字节）", n)
	}
	b := make([]byte, n)
	if _, err := io.ReadFull(c.conn, b); err != nil {
		return f, err
	}
	return f, json.Unmarshal(b, &f)
}

// request sends one request and waits for its answer. When the bus asks
// whether Collie handles someone else's request, it says no at once.
func (c *codexApp) request(method string, params any, target string) (codexAppFrame, error) {
	id := uuid4()
	if err := c.write(codexAppFrame{Type: "request", RequestID: id, Method: method, Params: params, Version: codexAppVersions[method], TargetClientID: target}); err != nil {
		return codexAppFrame{}, err
	}
	for {
		f, err := c.read()
		if err != nil {
			return f, err
		}
		switch f.Type {
		case "client-discovery-request":
			if err := c.write(codexAppFrame{Type: "client-discovery-response", RequestID: f.RequestID, Response: map[string]any{"canHandle": false}}); err != nil {
				return f, err
			}
		case "response":
			if f.RequestID != id {
				continue
			}
			if f.ResultType != "success" {
				return f, fmt.Errorf("Codex App %s: %s", method, f.Error)
			}
			return f, nil
		}
	}
}

var errCodexNotLoaded = errors.New("Codex App 没能打开这个对话：在电脑上的 Codex App 里点开它一次再发")

func (c *codexApp) owner(thread string) (string, error) {
	f, err := c.request("thread-owner-discovery", map[string]any{"hostId": "local", "conversationId": thread}, "")
	if err == nil && f.HandledByClient == "" {
		err = errCodexNotLoaded
	}
	return f.HandledByClient, err
}

// codexAppSend runs a turn in the App window that owns the thread. A thread
// the App has not loaded is opened in it first (the App comes forward).
func (s *Server) codexAppSend(ctx context.Context, thread, text string) error {
	var d net.Dialer
	conn, err := d.DialContext(ctx, "unix", s.codexAppSock())
	if err != nil {
		return errors.New("连不上电脑上的 Codex App：它可能没有打开")
	}
	defer conn.Close()
	if dl, ok := ctx.Deadline(); ok {
		conn.SetDeadline(dl)
	}
	c := &codexApp{conn: conn}
	if _, err := c.request("initialize", map[string]any{"clientType": "collie"}, ""); err != nil {
		return err
	}
	owner, err := c.owner(thread)
	if err != nil && exec.Command("open", "codex://threads/"+thread).Run() == nil {
		for deadline := time.Now().Add(30 * time.Second); err != nil && time.Now().Before(deadline) && ctx.Err() == nil; {
			time.Sleep(time.Second)
			owner, err = c.owner(thread)
		}
	}
	if err != nil {
		return errCodexNotLoaded
	}
	turn := map[string]any{
		"conversationId": thread,
		"turnStart": map[string]any{
			"request": map[string]any{"threadId": thread, "clientUserMessageId": uuid4(), "input": []map[string]any{{"type": "text", "text": text, "text_elements": []any{}}}},
			"context": map[string]any{},
		},
	}
	_, err = c.request("thread-follower-start-turn", turn, owner)
	forgetDesktopRows()
	return err
}

// ---------------------------------------------------------------- Antigravity

func (s *Server) agyDesktopRows() []desktopRow {
	root := filepath.Join(s.home, ".gemini", "antigravity")
	path := filepath.Join(root, "conversation_summaries.db")
	if !isFile(path) {
		return nil
	}
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro&_pragma=busy_timeout(2000)")
	if err != nil {
		return nil
	}
	defer db.Close()
	// not_fully_idle: the turn is over but the agent will be back on its own
	// (it set a timer, or a command runs in the background).
	res, err := db.Query(`SELECT conversation_id, title, preview, workspace_uris, status, not_fully_idle, last_modified_time, last_user_input_time
		FROM conversation_summaries WHERE nesting_depth = 0 AND killed = 0 AND last_modified_time > ?
		ORDER BY last_modified_time DESC LIMIT ?`, time.Now().Add(-desktopWindow).UTC().Format("2006-01-02 15:04:05"), desktopMax)
	if err != nil {
		return nil
	}
	defer res.Close()
	var rows []desktopRow
	for res.Next() {
		var id, title, preview, uris, status string
		var notIdle bool
		var mod, input any
		if res.Scan(&id, &title, &preview, &uris, &status, &notIdle, &mod, &input) != nil {
			continue
		}
		if title == "" {
			title = preview
		}
		var ws []string
		json.Unmarshal([]byte(uris), &ws)
		cwd := ""
		if len(ws) > 0 {
			cwd = fileURIToPath(ws[0])
		}
		d := desktopRow{id: "ag-" + id, kind: "agy", app: appAgy, session: id, title: messageTitle(title), cwd: cwd,
			created: sqlTime(input), updated: sqlTime(mod), running: status == "CASCADE_RUN_STATUS_RUNNING"}
		d.waiting = !d.running && notIdle
		if f := filepath.Join(root, "brain", id, ".system_generated", "logs", "transcript.jsonl"); isFile(f) {
			d.path, d.format = f, "agy"
		}
		rows = append(rows, d)
	}
	return rows
}

// sqlTime reads a datetime column, which the driver may hand back as a time or as text.
func sqlTime(v any) time.Time {
	switch t := v.(type) {
	case time.Time:
		return t
	case string:
		for _, layout := range []string{"2006-01-02 15:04:05.999999999-07:00", "2006-01-02 15:04:05.999999999Z07:00", "2006-01-02 15:04:05"} {
			if p, err := time.Parse(layout, t); err == nil {
				return p
			}
		}
	}
	return time.Time{}
}

// leadingTag is a block of context a tool put before the message itself
// (<persona-context>…</persona-context> and the like).
var leadingTag = regexp.MustCompile(`(?s)^\s*<([A-Za-z][\w:-]*)[^>]*>.*?</([A-Za-z][\w:-]*)>`)

// messageTitle is a conversation's title as one short line, without the context
// blocks some tools put before the message.
var imageMark = regexp.MustCompile(`\[image(:[^\]\s]*)?\]\s*`)

func messageTitle(t string) string {
	t = imageMark.ReplaceAllString(t, "") // a picture says nothing as a title
	for i := 0; i < 4; i++ {
		m := leadingTag.FindStringSubmatchIndex(t)
		if m == nil || t[m[2]:m[3]] != t[m[4]:m[5]] {
			break
		}
		t = t[m[1]:]
	}
	return clip(oneLine(t), 80)
}

// codexDaemonHas: Codex's shared background service has the thread loaded.
func (s *Server) codexDaemonHas(thread string) bool {
	ids, err := s.codexLoaded()
	return err == nil && ids[thread]
}

const appCodexRemote = "Codex App（远程）"

func isCodexApp(app string) bool { return app == appCodex || app == appCodexRemote }

// codexClient names what started a "vscode" thread: the Codex App, or another
// program driving Codex's app-server.
func codexClient(originator, cwd string) string {
	// The Mac's shared Codex service stamps every thread it runs with the
	// program that started the service, so "persona" says nothing about who
	// asked: these are the App's.
	if originator == "persona" {
		originator = ""
	}
	switch originator {
	case "", "Codex Desktop", "codex_work_desktop":
		if runtime.GOOS != "darwin" {
			return appCodexRemote // the App on another computer opened it here over SSH
		}
		return appCodex
	case "codex-tui":
		return "Codex 终端"
	}
	return originator + "（Codex）"
}
