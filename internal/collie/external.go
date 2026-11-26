package collie

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// External sessions are claude / codex / agy running in an ordinary terminal
// (iTerm, VS Code, tmux, an SSH session…) rather than inside herdr. Collie
// cannot type into those terminals, but every agent keeps its conversation on
// disk, so it can show them read-only, and take one over: stop the original
// process and resume the same conversation in a herdr pane, where it becomes
// a normal agent you can talk to from anywhere.
type External struct {
	ID      string    `json:"id"` // "<kind>-<pid>", plus "@machine" on the hub
	Kind    string    `json:"kind"`
	PID     int       `json:"pid"`
	Cwd     string    `json:"cwd"`
	App     string    `json:"app,omitempty"` // the terminal it runs in
	Started time.Time `json:"started"`
	Session string    `json:"session,omitempty"`
	Title   string    `json:"title,omitempty"`
	Updated time.Time `json:"updated,omitempty"`
	Machine string    `json:"machine,omitempty"`
	Status  string    `json:"status,omitempty"` // working | idle | blocked, when the agent says
	// CanSend: a message can go to it where it runs (Claude's peer inbox, the
	// Codex daemon); otherwise ReadOnly says why.
	CanSend  bool   `json:"can_send,omitempty"`
	ReadOnly string `json:"read_only,omitempty"`
	// Live: it runs right now (a process, or a turn the app is running). A
	// desktop app's conversation is listed while it rests too.
	Live bool `json:"live"`
	// CanTakeOver: it can be continued in a herdr pane from here.
	CanTakeOver bool `json:"can_take_over,omitempty"`

	path, format string
	reg          *claudeReg
	desktop      bool   // listed from a desktop app's index (desktop.go)
	via          string // "app": a message goes through the Codex App's message bus
}

type proc struct {
	pid, ppid int
	tty       string
	age       time.Duration
	args      []string
	name      string // what the process is, by its program name
}

// externalKinds maps program names to agent kinds.
var externalKinds = map[string]string{"claude": "claude", "codex": "codex", "agy": "agy", "antigravity": "agy"}

func listProcs() (map[int]*proc, error) {
	out, err := exec.Command("ps", "-axww", "-o", "pid=,ppid=,tty=,etime=,command=").Output()
	if err != nil {
		return nil, err
	}
	ps := map[int]*proc{}
	sc := bufio.NewScanner(strings.NewReader(string(out)))
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) < 5 {
			continue
		}
		pid, _ := strconv.Atoi(f[0])
		ppid, _ := strconv.Atoi(f[1])
		p := &proc{pid: pid, ppid: ppid, tty: f[2], age: parseEtime(f[3]), args: f[4:]}
		p.name = progName(p.args)
		ps[pid] = p
	}
	return ps, nil
}

// progName is the program a command line runs; for "node …/codex.js" it is
// the script.
func progName(args []string) string {
	n := strings.TrimPrefix(filepath.Base(args[0]), "-")
	if (n == "node" || n == "bun") && len(args) > 1 && !strings.HasPrefix(args[1], "-") {
		n = filepath.Base(args[1])
	}
	return strings.TrimSuffix(strings.TrimSuffix(n, ".js"), ".mjs")
}

// parseEtime reads ps's [[dd-]hh:]mm:ss.
func parseEtime(s string) time.Duration {
	var d, h, m, sec int
	if i := strings.IndexByte(s, '-'); i >= 0 {
		d, _ = strconv.Atoi(s[:i])
		s = s[i+1:]
	}
	parts := strings.Split(s, ":")
	switch len(parts) {
	case 3:
		h, _ = strconv.Atoi(parts[0])
		m, _ = strconv.Atoi(parts[1])
		sec, _ = strconv.Atoi(parts[2])
	case 2:
		m, _ = strconv.Atoi(parts[0])
		sec, _ = strconv.Atoi(parts[1])
	}
	return time.Duration(((d*24+h)*60+m)*60+sec) * time.Second
}

var shells = map[string]bool{"zsh": true, "bash": true, "fish": true, "sh": true, "login": true, "sudo": true, "su": true, "nu": true, "env": true, "script": true}

// terminalApp names what an agent process runs in, from its ancestors.
func terminalApp(ps map[int]*proc, p *proc) (app string, inHerdr bool) {
	for q, n := ps[p.ppid], 0; q != nil && n < 30; q, n = ps[q.ppid], n+1 {
		name := strings.ToLower(q.name)
		if strings.HasPrefix(name, "herdr") {
			return "", true
		}
		if app == "" && !shells[name] && externalKinds[name] == "" {
			app = q.name
			switch {
			case strings.HasPrefix(name, "sshd"):
				app = "SSH"
			case strings.HasPrefix(name, "tmux"):
				app = "tmux"
			case strings.HasPrefix(name, "code") || strings.Contains(name, "electron"):
				app = "VS Code"
			case name == "iterm2":
				app = "iTerm2"
			}
		}
		if q.ppid <= 1 {
			break
		}
	}
	return app, false
}

func cwdOf(pids []int) map[int]string {
	m := map[int]string{}
	if runtime.GOOS == "linux" {
		for _, pid := range pids {
			if c, err := os.Readlink(fmt.Sprintf("/proc/%d/cwd", pid)); err == nil {
				m[pid] = c
			}
		}
		return m
	}
	if len(pids) == 0 {
		return m
	}
	ids := make([]string, len(pids))
	for i, p := range pids {
		ids[i] = strconv.Itoa(p)
	}
	out, _ := exec.Command("lsof", "-a", "-d", "cwd", "-p", strings.Join(ids, ","), "-Fpn").Output()
	pid := 0
	for _, l := range strings.Split(string(out), "\n") {
		switch {
		case strings.HasPrefix(l, "p"):
			pid, _ = strconv.Atoi(l[1:])
		case strings.HasPrefix(l, "n") && pid != 0:
			m[pid] = l[1:]
		}
	}
	return m
}

// externalCache keeps discovery cheap when several viewers poll.
var externalCache struct {
	sync.Mutex
	at   time.Time
	list []*External
}

// externalSessions finds interactive agents on this machine outside herdr.
func (s *Server) externalSessions() []*External {
	externalCache.Lock()
	defer externalCache.Unlock()
	if time.Since(externalCache.at) < 4*time.Second && externalCache.list != nil {
		return externalCache.list
	}
	ps, err := listProcs()
	if err != nil {
		return []*External{}
	}
	var cands []*proc
	for _, p := range ps {
		kind := externalKinds[p.name]
		if kind == "" || p.tty == "" || strings.HasPrefix(p.tty, "?") {
			continue
		}
		// One agent can be a wrapper plus its real process; keep the outer one.
		if parent := ps[p.ppid]; parent != nil && externalKinds[parent.name] == kind {
			continue
		}
		cands = append(cands, p)
	}
	pids := make([]int, 0, len(cands))
	for _, p := range cands {
		pids = append(pids, p.pid)
	}
	cwds := cwdOf(pids)
	now := time.Now()
	list := []*External{}
	// Claude registers each interactive process (maybe a wrapper's child).
	regs := s.claudeRegs()
	regOf := map[int]*claudeReg{}
	for pid, r := range regs {
		for q, n := ps[pid], 0; q != nil && n < 4; q, n = ps[q.ppid], n+1 {
			if externalKinds[q.name] == "claude" {
				regOf[q.pid] = r
			}
		}
	}
	used := map[int]bool{}
	var codex []*External
	for _, p := range cands {
		app, inHerdr := terminalApp(ps, p)
		if r := regOf[p.pid]; r != nil {
			used[r.PID] = true
		}
		if inHerdr {
			continue
		}
		kind := externalKinds[p.name]
		e := &External{ID: fmt.Sprintf("%s-%d", kind, p.pid), Kind: kind, PID: p.pid, Cwd: cwds[p.pid], App: app, Started: now.Add(-p.age), Live: true}
		if kind == "codex" {
			codex = append(codex, e)
		} else {
			s.locateExternal(e, p)
		}
		e.reg = regOf[p.pid]
		list = append(list, e)
	}
	s.locateExternalCodex(codex)
	listed := map[string]bool{}
	for _, e := range list {
		s.reachable(e)
		if e.path != "" {
			if fi, err := os.Stat(e.path); err == nil {
				e.Updated = fi.ModTime()
			}
			e.Title = firstUserLine(e.path, e.format)
		}
		e.CanTakeOver = e.Session != ""
		if e.Session != "" {
			listed[e.Session] = true
		}
	}
	// The desktop apps' conversations, running or resting (desktop.go).
	list = append(list, s.desktopSessions(regs, listed, now)...)
	// Collie's own workers (a herdr pane while they run, its history after)
	// are listed as Collie's, not as the computer's other sessions.
	kept := list[:0]
	for _, e := range list {
		if !collieSession(e.Title) {
			kept = append(kept, e)
		}
	}
	list = kept
	sortSessions(list)
	externalCache.at, externalCache.list = time.Now(), list
	return list
}

// reachable works out whether a message can reach e where it runs.
func (s *Server) reachable(e *External) {
	switch e.Kind {
	case "claude":
		if e.reg == nil {
			e.ReadOnly = "找不到这个 Claude 会话的登记信息，只能看"
			return
		}
		e.Status = e.reg.state()
		if e.Session == "" {
			e.Session = e.reg.SessionID
		}
		e.CanSend, e.ReadOnly = e.reg.canSend()
	case "codex":
		if e.Session == "" {
			e.ReadOnly = "这个 Codex 还没开始对话：先在那边说第一句，之后就能从这里发消息"
			return
		}
		ids, err := s.codexLoaded()
		switch {
		case err != nil:
			e.ReadOnly = err.Error()
		case !ids[e.Session]:
			e.ReadOnly = "这个 Codex 会话没有在共享后台里运行（旧版本，或用了独立的后台），只能看"
		default:
			e.CanSend = true
		}
	default:
		e.ReadOnly = "Antigravity 不支持从外面发消息；要对话可以在 herdr 里接管"
	}
}

var conversationRe = regexp.MustCompile(`^[0-9a-f-]{16,}$`)

// locateExternal finds the conversation file an external agent is writing.
func (s *Server) locateExternal(e *External, p *proc) {
	since := e.Started.Add(-5 * time.Second)
	switch e.Kind {
	case "claude":
		root := envOr("CLAUDE_CONFIG_DIR", filepath.Join(s.home, ".claude"))
		// Claude Code registers each interactive process with its session id.
		var reg struct {
			SessionID string `json:"sessionId"`
		}
		if b, err := os.ReadFile(filepath.Join(root, "sessions", strconv.Itoa(p.pid)+".json")); err == nil && json.Unmarshal(b, &reg) == nil && reg.SessionID != "" {
			e.Session = reg.SessionID
			if m, _ := filepath.Glob(filepath.Join(root, "projects", "*", reg.SessionID+".jsonl")); len(m) > 0 {
				e.path, e.format = m[0], "claude"
				return
			}
		}
		if e.Cwd != "" {
			slug := strings.NewReplacer("/", "-", ".", "-", "_", "-").Replace(e.Cwd)
			if f := newestSince(filepath.Join(root, "projects", slug, "*.jsonl"), since); f != "" {
				e.path, e.format = f, "claude"
				e.Session = strings.TrimSuffix(filepath.Base(f), ".jsonl")
			}
		}
	case "agy":
		brain := filepath.Join(s.agyCLIHome(), "brain")
		if id := agyConversationArg(p.args); id != "" {
			if f := s.agyTranscriptByID(brain, id); f != "" {
				e.Session, e.path, e.format = id, f, "agy"
				return
			}
			// Even before the transcript file appears, record the explicit
			// conversation id so the session remains identifiable/takeoverable.
			e.Session = id
		}
		if e.Cwd == "" {
			return
		}
		wantCwd := normPath(e.Cwd)
		index := agyWorkspaces(filepath.Dir(brain))
		var bestAt time.Time
		for id, wss := range index {
			match := false
			for _, w := range wss {
				if normPath(w) == wantCwd {
					match = true
					break
				}
			}
			if !match {
				continue
			}
			f := filepath.Join(brain, id, ".system_generated", "logs", "transcript.jsonl")
			fi, err := os.Stat(f)
			if err != nil || fi.ModTime().Before(since) || fi.ModTime().Before(bestAt) {
				continue
			}
			e.Session, e.path, e.format, bestAt = id, f, "agy", fi.ModTime()
		}
	}
}

// locateExternalCodex scans rollout headers once per discovery pass. Each
// process uses the newest rollout in its cwd active since its own start.
func (s *Server) locateExternalCodex(sessions []*External) {
	if len(sessions) == 0 {
		return
	}
	const slack = 5 * time.Second
	oldest := sessions[0].Started
	for _, e := range sessions {
		if e.Started.Before(oldest) {
			oldest = e.Started
		}
	}
	cutoff := oldest.Add(-slack)
	type rollout struct {
		path, id string
		updated  time.Time
	}
	latest := map[string]rollout{}
	files, _ := filepath.Glob(filepath.Join(s.codexHome(), "sessions", "*", "*", "*", "rollout-*.jsonl"))
	for _, f := range files {
		fi, err := os.Stat(f)
		if err != nil || fi.ModTime().Before(cutoff) {
			continue
		}
		id, cwd := codexMeta(f)
		if !fi.ModTime().Before(latest[cwd].updated) {
			latest[cwd] = rollout{f, id, fi.ModTime()}
		}
	}
	for _, e := range sessions {
		if r, ok := latest[e.Cwd]; ok && !r.updated.Before(e.Started.Add(-slack)) {
			e.path, e.format, e.Session = r.path, "codex", r.id
		}
	}
}

func newestSince(glob string, since time.Time) string {
	files, _ := filepath.Glob(glob)
	var best string
	var at time.Time
	for _, f := range files {
		if fi, err := os.Stat(f); err == nil && !fi.ModTime().Before(since) && fi.ModTime().After(at) {
			best, at = f, fi.ModTime()
		}
	}
	return best
}

// codexMeta reads a rollout's session id and cwd from its first line.
func codexMeta(path string) (id, cwd string) {
	f, err := os.Open(path)
	if err != nil {
		return "", ""
	}
	defer f.Close()
	r := bufio.NewReaderSize(f, 64<<10)
	line, _ := r.ReadBytes('\n')
	var m struct {
		Payload struct {
			ID  string `json:"id"`
			Cwd string `json:"cwd"`
		} `json:"payload"`
	}
	json.Unmarshal(line, &m)
	return m.Payload.ID, m.Payload.Cwd
}

// externalByID looks a session up in a list at most a few seconds old.
func (s *Server) externalByID(id string) *External {
	for _, e := range s.externalSessions() {
		if e.ID == id {
			return e
		}
	}
	return nil
}

// viewableByID is for reading only: the list the page just showed is almost
// always still there, so use it rather than look at every process again.
func (s *Server) viewableByID(id string) *External {
	externalCache.Lock()
	cached, at := externalCache.list, externalCache.at
	externalCache.Unlock()
	if time.Since(at) < time.Minute {
		for _, e := range cached {
			if e.ID == id {
				return e
			}
		}
	}
	for _, e := range s.externalSessions() {
		if e.ID == id {
			return e
		}
	}
	return nil
}

func alive(pid int) bool { return syscall.Kill(pid, 0) == nil }

// ---------------------------------------------------------------- HTTP

// listExternal answers for this machine; the hub adds every connected node's.
func (s *Server) listExternal(w http.ResponseWriter, r *http.Request) {
	list := s.externalSessions()
	if s.node {
		writeJSON(w, 200, map[string]any{"sessions": list})
		return
	}
	all := append([]*External{}, list...)
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, m := range s.herdr.Machines() {
		if m.Local || !m.Online {
			continue
		}
		// Answer from the last copy and refresh it behind the scenes: the
		// link to a computer can take a good part of a second each way.
		if cached, fresh := remoteExternal.get(m.ID); cached != nil {
			all = append(all, cached...)
			if !fresh {
				go s.refreshRemoteExternal(m)
			}
			continue
		}
		wg.Add(1)
		go func(m Machine) {
			defer wg.Done()
			got := s.refreshRemoteExternal(m)
			mu.Lock()
			all = append(all, got...)
			mu.Unlock()
		}(m)
	}
	wg.Wait()
	sortSessions(all)
	writeJSON(w, 200, map[string]any{"sessions": all})
}

// remoteExternal is the hub's last copy of each computer's session list.
var remoteExternal = &remoteLists{m: map[string]*remoteList{}}

type remoteLists struct {
	sync.Mutex
	m map[string]*remoteList
}

type remoteList struct {
	at   time.Time
	list []*External
	busy bool
}

const (
	remoteFresh = 2 * time.Second  // younger copies are served as they are
	remoteStale = 60 * time.Second // older ones are not served at all
)

// get: the copy (nil if there is none or it is too old) and whether it is fresh.
func (r *remoteLists) get(machine string) ([]*External, bool) {
	r.Lock()
	defer r.Unlock()
	c := r.m[machine]
	if c == nil || c.list == nil || time.Since(c.at) > remoteStale {
		return nil, false
	}
	return c.list, time.Since(c.at) < remoteFresh || c.busy
}

// refreshRemoteExternal asks a computer for its sessions and keeps the answer.
func (s *Server) refreshRemoteExternal(m Machine) []*External {
	r := remoteExternal
	r.Lock()
	c := r.m[m.ID]
	if c == nil {
		c = &remoteList{}
		r.m[m.ID] = c
	}
	if c.busy {
		list := c.list
		r.Unlock()
		return list
	}
	c.busy = true
	r.Unlock()
	list := s.fetchRemoteExternal(m)
	r.Lock()
	c.busy = false
	if list != nil {
		c.at, c.list = time.Now(), list
	}
	r.Unlock()
	return list
}

func (s *Server) fetchRemoteExternal(m Machine) []*External {
	client, err := s.herdr.Client(m.ID)
	if err != nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", "http://node/api/external", nil)
	resp, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	var body struct {
		Sessions []*External `json:"sessions"`
	}
	if json.NewDecoder(resp.Body).Decode(&body) != nil {
		return nil
	}
	for _, e := range body.Sessions {
		e.ID, e.Machine = join(e.ID, m.ID), m.ID
	}
	if body.Sessions == nil {
		body.Sessions = []*External{}
	}
	return body.Sessions
}

// streamExternal follows an external agent's conversation, read-only.
func (s *Server) streamExternal(w http.ResponseWriter, r *http.Request) {
	e := s.viewableByID(r.PathValue("id"))
	if e == nil {
		writeJSON(w, 404, map[string]any{"error": "这个会话已经结束了"})
		return
	}
	sse, ok := newSSE(w)
	if !ok {
		return
	}
	send := func(ev string, v any) bool { b, _ := json.Marshal(v); return sse.send(ev, b) == nil }
	if !send("meta", map[string]any{"structured": e.path != ""}) {
		return
	}
	var tr *transcript
	var ms msgSync
	if e.path != "" {
		tr = newTranscript(e.path, e.format)
		tr.openTail()
	}
	first, beat := true, time.Now()
	checked := time.Now()
	for {
		if tr != nil && (tr.update() || first) {
			if p := ms.patch(tr); p != nil {
				if !send("patch", p) {
					return
				}
				beat = time.Now()
			}
		}
		first = false
		if time.Since(checked) >= time.Second {
			checked = time.Now()
			if !e.desktop && !alive(e.PID) {
				send("gone", map[string]any{})
				return
			}
		}
		if time.Since(beat) > 15*time.Second {
			sse.comment()
			beat = time.Now()
		}
		select {
		case <-r.Context().Done():
			return
		case <-time.After(250 * time.Millisecond):
		}
	}
}

// takeOverExternal stops an external agent and resumes its conversation in a
// new herdr pane on the same machine, in the same directory.
func (s *Server) takeOverExternal(w http.ResponseWriter, r *http.Request) {
	e := s.externalByID(r.PathValue("id"))
	if e == nil {
		writeJSON(w, 404, map[string]any{"error": "这个会话已经结束了"})
		return
	}
	if e.Session == "" || e.Cwd == "" {
		writeJSON(w, 409, map[string]any{"error": "找不到这个会话的记录，没法在 herdr 里续上"})
		return
	}
	if !e.CanTakeOver {
		writeJSON(w, 409, map[string]any{"error": "这个会话要在 " + e.App + " 里继续"})
		return
	}
	args := resumeArgs(e.Kind, e.Session)
	// Two processes writing one conversation would garble it: stop the
	// original first, the way Ctrl-C would, and give it a moment to save.
	if e.PID > 0 && alive(e.PID) {
		syscall.Kill(e.PID, syscall.SIGINT)
		for i := 0; i < 30 && alive(e.PID); i++ {
			if i == 10 {
				syscall.Kill(e.PID, syscall.SIGTERM)
			}
			time.Sleep(200 * time.Millisecond)
		}
		if alive(e.PID) {
			writeJSON(w, 409, map[string]any{"error": "原来的进程没有退出（PID " + strconv.Itoa(e.PID) + "），请先在那个终端里退出它"})
			return
		}
	}
	externalCache.Lock()
	externalCache.at = time.Time{}
	externalCache.Unlock()
	name := e.Kind + "-" + strconv.Itoa(e.PID)
	if e.PID == 0 {
		name = e.Kind + "-" + strings.SplitN(e.Session, "-", 2)[0]
	}
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	pane, ws, err := s.startAgent(ctx, "", kinds[e.Kind], name, e.Cwd, name, args)
	var he *HerdrError
	if err != nil && !(errors.As(err, &he) && he.Code == "agent_not_ready") {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"pane_id": pane, "workspace_id": ws, "name": name})
}

// sortSessions puts running sessions first, then the most recently active.
func sortSessions(list []*External) {
	sort.SliceStable(list, func(i, j int) bool {
		if list[i].Live != list[j].Live {
			return list[i].Live
		}
		return lastActive(list[i]).After(lastActive(list[j]))
	})
}

func lastActive(e *External) time.Time {
	if e.Updated.After(e.Started) {
		return e.Updated
	}
	return e.Started
}

// collieSession: a conversation Collie started, recognised by its first
// message (a worker's brief, or the event batches Collie delivers).
func collieSession(title string) bool {
	t := strings.TrimSpace(title)
	return strings.HasPrefix(t, "[collie]") || strings.HasPrefix(t, "You are worker ")
}

// revealExternal brings the session up in the app it runs in, on this
// computer: Claude's desktop app opens it where it waits for you (its own
// dialogs can only be answered there), the Codex App opens the thread.
func (s *Server) revealExternal(w http.ResponseWriter, r *http.Request) {
	e := s.viewableByID(r.PathValue("id"))
	if e == nil {
		writeJSON(w, 404, map[string]any{"error": "这个会话已经结束了"})
		return
	}
	if runtime.GOOS != "darwin" {
		writeJSON(w, 409, map[string]any{"error": "只能在 Mac 上打开 " + e.App})
		return
	}
	var link string
	switch {
	case e.Kind == "claude" && strings.HasPrefix(e.ID, "cd-"):
		link = "claude://code/needs-input?source=collie&session=" + url.QueryEscape("local_"+strings.TrimPrefix(e.ID, "cd-"))
	case e.Kind == "codex" && e.via == "app" && e.Session != "":
		link = "codex://threads/" + url.PathEscape(e.Session)
	default:
		writeJSON(w, 409, map[string]any{"error": "这个会话没法从这里在 " + e.App + " 里打开"})
		return
	}
	if err := exec.CommandContext(r.Context(), "open", link).Run(); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
