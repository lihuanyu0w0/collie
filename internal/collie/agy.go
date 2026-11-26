package collie

import (
	"database/sql"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Antigravity does not tell herdr which conversation a pane is running, so we
// pair them ourselves. Showing the wrong conversation would leak an unrelated
// session into this pane, so a candidate must be provably this pane's:
//
//   - Collie itself started the pane with --conversation/--resume <id>; or
//   - agy's own index (conversation_summaries.db) lists the pane's cwd as the
//     conversation's workspace (after resolving symlinks), and the conversation
//     was born after the agent started (or within the last few hours).
//
// Each transcript is claimed by at most one pane.

var agyIndex struct {
	sync.Mutex
	root string
	at   time.Time
	ws   map[string][]string // conversation id → workspace paths
}

// agyPaneSessions remembers the conversation id Collie explicitly passed to
// `agy --conversation <id>` (e.g., when taking over an idle Antigravity app
// session or resuming from history) so the pane maps directly to its transcript
// even when the conversation is older than the pane or lives in the app dir.
var agyPaneSessions = struct {
	sync.Mutex
	m map[string]string // pane id → conversation id
}{m: map[string]string{}}

func (s *Server) rememberAgySession(pane, session string) {
	if pane == "" || session == "" {
		return
	}
	local, _ := split(pane)
	agyPaneSessions.Lock()
	agyPaneSessions.m[local] = session
	if pane != local {
		agyPaneSessions.m[pane] = session
	}
	agyPaneSessions.Unlock()
}

func forgetAgySession(pane string) {
	local, _ := split(pane)
	agyPaneSessions.Lock()
	delete(agyPaneSessions.m, local)
	delete(agyPaneSessions.m, pane)
	agyPaneSessions.Unlock()
}

func agySessionForPane(pane string) string {
	if pane == "" {
		return ""
	}
	local, _ := split(pane)
	agyPaneSessions.Lock()
	defer agyPaneSessions.Unlock()
	if id := agyPaneSessions.m[pane]; id != "" {
		return id
	}
	return agyPaneSessions.m[local]
}

// normPath canonicalizes a filesystem path, resolving symlinks when possible
// so e.g. /home/<user>/... and /data00/home/<user>/... compare equal.
func normPath(p string) string {
	if p == "" {
		return ""
	}
	p = filepath.Clean(p)
	if r, err := filepath.EvalSymlinks(p); err == nil {
		p = r
	}
	return strings.TrimSuffix(p, string(filepath.Separator))
}

func fileURIToPath(raw string) string {
	if strings.HasPrefix(raw, "file://") {
		if u, err := url.Parse(raw); err == nil && u.Path != "" {
			if p, err := url.PathUnescape(u.Path); err == nil {
				return strings.TrimSuffix(p, "/")
			}
			return strings.TrimSuffix(u.Path, "/")
		}
		raw = strings.TrimPrefix(raw, "file://")
	}
	return strings.TrimSuffix(raw, "/")
}

// agyConversationArg extracts the conversation id from agy CLI arguments
// (--conversation, --resume, -r, and legacy -c when followed by an id).
func agyConversationArg(args []string) string {
	for i, a := range args {
		switch {
		case a == "--conversation" || a == "--resume" || a == "-r" || a == "-c":
			if i+1 < len(args) && conversationRe.MatchString(args[i+1]) {
				return args[i+1]
			}
		case strings.HasPrefix(a, "--conversation="):
			if v := strings.TrimPrefix(a, "--conversation="); conversationRe.MatchString(v) {
				return v
			}
		case strings.HasPrefix(a, "--resume="):
			if v := strings.TrimPrefix(a, "--resume="); conversationRe.MatchString(v) {
				return v
			}
		case strings.HasPrefix(a, "-r="):
			if v := strings.TrimPrefix(a, "-r="); conversationRe.MatchString(v) {
				return v
			}
		}
	}
	return ""
}

func agyWorkspaces(root string) map[string][]string {
	agyIndex.Lock()
	defer agyIndex.Unlock()
	if agyIndex.root == root && time.Since(agyIndex.at) < 3*time.Second && agyIndex.ws != nil {
		return agyIndex.ws
	}
	agyIndex.root, agyIndex.at = root, time.Now()
	m := map[string][]string{}
	path := filepath.Join(root, "conversation_summaries.db")
	if !isFile(path) {
		agyIndex.ws = m
		return m
	}
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro&_pragma=busy_timeout(2000)")
	if err != nil {
		agyIndex.ws = m
		return m
	}
	defer db.Close()
	rows, err := db.Query(`SELECT conversation_id, workspace_uris FROM conversation_summaries WHERE last_modified_time > ?`,
		time.Now().Add(-48*time.Hour).UTC().Format("2006-01-02 15:04:05"))
	if err != nil {
		agyIndex.ws = m
		return m
	}
	defer rows.Close()
	for rows.Next() {
		var id, raw string
		if rows.Scan(&id, &raw) != nil {
			continue
		}
		var uris []string
		json.Unmarshal([]byte(raw), &uris)
		for _, u := range uris {
			m[id] = append(m[id], fileURIToPath(u))
		}
	}
	agyIndex.ws = m
	return m
}

func (s *Server) agyTranscriptByID(brain, id string) string {
	if id == "" {
		return ""
	}
	for _, b := range []string{brain, filepath.Join(s.home, ".gemini", "antigravity", "brain")} {
		if p := filepath.Join(b, id, ".system_generated", "logs", "transcript.jsonl"); isFile(p) {
			return p
		}
	}
	return ""
}

func (s *Server) guessAgy(brain, pane, cwd string) string {
	if sess := agySessionForPane(pane); sess != "" {
		if p := s.agyTranscriptByID(brain, sess); p != "" {
			return p
		}
	}
	claimed.Lock()
	defer claimed.Unlock()
	for p, owner := range claimed.m {
		if owner == pane && isFile(p) {
			return p
		}
	}
	if cwd == "" {
		return ""
	}
	cwd = normPath(cwd)
	since, known := s.startedAt(pane)
	if !known {
		since = time.Now().Add(-6 * time.Hour)
	}
	index := agyWorkspaces(filepath.Dir(brain))

	files, _ := filepath.Glob(filepath.Join(brain, "*", ".system_generated", "logs", "transcript.jsonl"))
	type cand struct {
		path string
		born time.Time
	}
	var cs []cand
	for _, f := range files {
		if _, taken := claimed.m[f]; taken {
			continue
		}
		dir := filepath.Dir(filepath.Dir(filepath.Dir(f)))
		match := false
		for _, w := range index[filepath.Base(dir)] {
			if normPath(w) == cwd {
				match = true
				break
			}
		}
		if !match {
			continue
		}
		di, err := os.Stat(dir)
		if err != nil {
			continue
		}
		born := di.ModTime()
		if bt := birthTime(di); !bt.IsZero() {
			born = bt
		}
		if born.Before(since.Add(-10 * time.Second)) {
			continue
		}
		cs = append(cs, cand{f, born})
	}
	if len(cs) == 0 {
		return ""
	}
	// The earliest conversation after the start is the one the agent opened.
	sort.Slice(cs, func(i, j int) bool { return cs[i].born.Before(cs[j].born) })
	claimed.m[cs[0].path] = pane
	return cs[0].path
}

// agyCLIHome is where the agy CLI keeps its conversations. The desktop app
// keeps its own in ~/.gemini/antigravity (desktop.go); the CLI, in a
// terminal or a herdr pane, uses antigravity-cli (older ones used the app's).
func (s *Server) agyCLIHome() string {
	if d := filepath.Join(s.home, ".gemini", "antigravity-cli"); isDir(d) {
		return d
	}
	return filepath.Join(s.home, ".gemini", "antigravity")
}

// Only resume in a local workspace. A file URI for another host may have
// the same path as an unrelated directory on this computer.
func agyCLIWorkspace(raw string) string {
	if filepath.IsAbs(raw) {
		return raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "file" || u.User != nil ||
		(u.Host != "" && !strings.EqualFold(u.Host, "localhost")) || !filepath.IsAbs(u.Path) {
		return ""
	}
	return u.Path
}

func (s *Server) agyCLIResumeData(id string) bool {
	base := filepath.Join(s.home, ".gemini", "antigravity-cli", "conversations", id)
	return isFile(base+".db") || isFile(base+".pb")
}

// recentAgyCLI uses transcript activity because early CLI sessions can have
// zero timestamps in the summary index, even after the first user message.
func (s *Server) recentAgyCLI() []desktopRow {
	root := filepath.Join(s.home, ".gemini", "antigravity-cli")
	brain := filepath.Join(root, "brain")
	entries, err := os.ReadDir(brain)
	if err != nil {
		return nil
	}
	cutoff := time.Now().Add(-desktopWindow)
	var candidates []desktopRow
	for _, entry := range entries {
		id := entry.Name()
		if !entry.IsDir() || !conversationRe.MatchString(id) {
			continue
		}
		path := filepath.Join(brain, id, ".system_generated", "logs", "transcript.jsonl")
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() || info.Size() == 0 || info.ModTime().Before(cutoff) {
			continue
		}
		candidates = append(candidates, desktopRow{id: "ag-cli-" + id, session: id, kind: "agy", app: appAgyCLI,
			path: path, format: "agy", updated: info.ModTime()})
	}
	if len(candidates) == 0 {
		return nil
	}
	sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].updated.After(candidates[j].updated) })
	var meta *sql.Stmt
	if index := filepath.Join(root, "conversation_summaries.db"); isFile(index) {
		db, err := sql.Open("sqlite", "file:"+index+"?mode=ro&_pragma=busy_timeout(2000)")
		if err != nil {
			return nil
		}
		defer db.Close()
		meta, err = db.Prepare(`SELECT title, preview, workspace_uris, nesting_depth, killed
			FROM conversation_summaries WHERE conversation_id = ?`)
		if err != nil {
			return nil
		}
		defer meta.Close()
	}
	var rows []desktopRow
	for _, d := range candidates {
		if meta != nil {
			var title, preview, raw sql.NullString
			var depth, killed int
			err := meta.QueryRow(d.session).Scan(&title, &preview, &raw, &depth, &killed)
			if (err != nil && err != sql.ErrNoRows) || depth != 0 || killed != 0 {
				continue
			}
			d.title = messageTitle(title.String)
			var uris []string
			if json.Unmarshal([]byte(raw.String), &uris) == nil && len(uris) > 0 {
				d.cwd = agyCLIWorkspace(uris[0])
			}
			if d.title == "" {
				d.title = messageTitle(preview.String)
			}
		}
		if d.title == "" {
			d.title = firstUserLine(d.path, d.format)
		}
		rows = append(rows, d)
		if len(rows) == desktopMax {
			break
		}
	}
	return rows
}
