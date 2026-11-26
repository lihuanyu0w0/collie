package collie

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

type Server struct {
	seen  seenPanes // panes you have opened here since they finished
	herdr *Herdr
	token string
	home  string
	web   fs.FS
	sup   *Super
	auths *Auth // hub only: paired devices and computers
	node  bool  // serving the node API inside a tunnel (no auth, no super)

	port       int      // hub only: listening port, for addresses
	localAddr  string   // hub only: local host:port for CLI and loopback links
	publicURLs []string // hub only: addresses given with -url, shown first

	startMu sync.Mutex
	started map[string]time.Time // pane → when Collie started an agent there
}

func (s *Server) markStarted(pane string) {
	local, _ := split(pane)
	now := time.Now()
	s.startMu.Lock()
	if s.started == nil {
		s.started = map[string]time.Time{}
	}
	s.started[local] = now
	if pane != local {
		s.started[pane] = now
	}
	s.startMu.Unlock()

	// Retire any transcript previously claimed by this pane id (herdr reuses
	// pane ids) while keeping it marked taken so a fast restart won't steal it.
	claimed.Lock()
	for p, owner := range claimed.m {
		if owner != "" && (owner == pane || owner == local) {
			claimed.m[p] = ""
		}
	}
	claimed.Unlock()
	forgetAgySession(pane)
}

func (s *Server) startedAt(pane string) (time.Time, bool) {
	local, _ := split(pane)
	s.startMu.Lock()
	defer s.startMu.Unlock()
	if t, ok := s.started[pane]; ok {
		return t, true
	}
	t, ok := s.started[local]
	return t, ok
}

// Agent kinds Collie offers in its launcher, mapped to herdr's --kind values.
// resumeArgs open an agent on an earlier conversation of its own.
func resumeArgs(agent, session string) []string {
	if session == "" {
		return nil
	}
	switch agent {
	case "claude":
		return []string{"--resume", session}
	case "codex":
		return []string{"resume", session}
	case "agy":
		return []string{"--conversation", session}
	case "doubao":
		return []string{"--resume", session}
	}
	return nil
}

var kinds = map[string]string{
	"claude":      "claude",
	"codex":       "codex",
	"antigravity": "agy",
	"agy":         "agy",
	"doubao":      "doubao",
}

var nameRe = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,31}$`)

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /", s.static())
	mux.HandleFunc("POST /api/login", s.login)
	mux.HandleFunc("POST /api/logout", s.logout)

	api := func(pattern string, h http.HandlerFunc) { mux.Handle(pattern, s.auth(h)) }
	api("GET /api/session", func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(cookieName); err == nil && c.Value != "" {
			setTokenCookie(w, r, c.Value)
		}
		writeJSON(w, 200, map[string]any{"ok": true})
	})
	api("GET /api/events", s.streamState)
	s.machineRoutes(mux, func(h http.HandlerFunc) http.Handler { return s.auth(s.routed(h)) })
	s.superRoutes(mux)
	s.hubRoutes(mux)
	return securityHeaders(cors(mux))
}

// machineRoutes are the endpoints about one machine's panes. The hub serves
// them for its own machine and forwards the rest to the right node; a node
// serves them for itself inside the tunnel.
func (s *Server) machineRoutes(mux *http.ServeMux, wrap func(http.HandlerFunc) http.Handler) {
	mux.Handle("GET /api/state", wrap(s.getState))
	mux.Handle("GET /api/dirs", wrap(s.listDirs))
	mux.Handle("GET /api/file", wrap(s.readFile))
	mux.Handle("POST /api/agents", wrap(s.launchAgent))
	mux.Handle("POST /api/agents/{target}/prompt", wrap(s.promptAgent))
	mux.Handle("GET /api/panes/{id}/stream", wrap(s.streamPane))
	mux.Handle("GET /api/panes/{id}/chat", wrap(s.streamChat))
	mux.Handle("GET /api/panes/{id}/earlier", wrap(s.paneEarlier))
	mux.Handle("GET /api/panes/{id}/last", wrap(s.lastMessage))
	mux.Handle("GET /api/panes/{id}/ask", wrap(s.paneAsk))
	mux.Handle("POST /api/panes/{id}/text", wrap(s.sendText))
	mux.Handle("POST /api/panes/{id}/keys", wrap(s.sendKeys))
	mux.Handle("POST /api/workspaces/{id}/close", wrap(s.closeWorkspace))
	mux.Handle("POST /api/uploads", wrap(s.upload))
	mux.Handle("GET /api/titles", wrap(s.getTitles))
	mux.Handle("GET /api/models", wrap(s.listModels))
	mux.Handle("POST /api/trust", wrap(s.trustFolder))
	mux.Handle("POST /api/update", wrap(s.selfUpdate))
	mux.Handle("GET /api/transcript", wrap(s.getTranscript))
	mux.Handle("POST /api/seen", wrap(s.seenPane))
	mux.Handle("GET /api/external", wrap(s.listExternal))
	mux.Handle("GET /api/external/{id}/chat", wrap(s.streamExternal))
	mux.Handle("GET /api/external/{id}/snapshot", wrap(s.externalSnapshot))
	mux.Handle("GET /api/external/{id}/earlier", wrap(s.externalEarlier))
	mux.Handle("POST /api/external/{id}/takeover", wrap(s.takeOverExternal))
	mux.Handle("POST /api/external/{id}/send", wrap(s.sendExternal))
	mux.Handle("POST /api/codex/interrupt", wrap(s.interruptCodex))
	mux.Handle("POST /api/external/{id}/reveal", wrap(s.revealExternal))
}

// NodeRoutes is what a node serves to its hub through the tunnel.
func (s *Server) NodeRoutes() http.Handler {
	mux := http.NewServeMux()
	s.machineRoutes(mux, func(h http.HandlerFunc) http.Handler { return h })
	mux.HandleFunc("POST /api/update/relay", s.relayUpdate)
	return mux
}

// ---------------------------------------------------------------- auth

const cookieName = "collie_token"

// authed lets in the master token and paired phones/browsers everywhere, and
// paired computers (their node and the CLI their agents run) only where the
// CLI needs to go.
func (s *Server) authed(r *http.Request) bool {
	master, d := s.identity(r)
	if master {
		return true
	}
	if d == nil {
		return false
	}
	return d.Kind == "browser" || strings.HasPrefix(r.URL.Path, "/api/super/") || strings.HasPrefix(r.URL.Path, "/api/memory/")
}

func (s *Server) auth(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.authed(r) {
			writeJSON(w, 401, map[string]any{"error": "unauthorized"})
			return
		}
		if !s.node {
			// Which web app the hub serves: an open page that sees it change offers to reload.
			w.Header().Set("X-Collie-Web", s.webBuild())
		}
		h.ServeHTTP(w, r)
	})
}

var webBuildOnce struct {
	sync.Once
	v string
}

// webBuild fingerprints the web app's files.
func (s *Server) webBuild() string {
	webBuildOnce.Do(func() {
		h := sha256.New()
		for _, p := range []string{"index.html", "app.js", "app.css"} {
			b, _ := fs.ReadFile(s.web, p)
			h.Write(b)
		}
		webBuildOnce.v = hex.EncodeToString(h.Sum(nil)[:6])
	})
	return webBuildOnce.v
}

var authFailDelay = 400 * time.Millisecond

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var body struct{ Token string }
	json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body)
	tok := strings.TrimSpace(body.Token)
	ok := false
	if tok != "" {
		if s.auths != nil {
			master, d := s.auths.who(tok)
			if master {
				ok = true
			} else if d != nil && d.Kind == "browser" {
				ok = true
				go s.auths.save()
			}
		} else {
			a, b := sha256.Sum256([]byte(tok)), sha256.Sum256([]byte(s.token))
			ok = subtle.ConstantTimeCompare(a[:], b[:]) == 1
		}
	}
	if !ok {
		if authFailDelay > 0 {
			time.Sleep(authFailDelay)
		}
		writeJSON(w, 401, map[string]any{"error": "invalid token"})
		return
	}
	setTokenCookie(w, r, tok)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: "", Path: "/", HttpOnly: true,
		SameSite: http.SameSiteLaxMode, MaxAge: -1, Expires: time.Unix(0, 0), Secure: r.TLS != nil,
	})
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------------------------------------------------------------- state

type AgentView struct {
	PaneID         string     `json:"pane_id"`
	WorkspaceID    string     `json:"workspace_id"`
	WorkspaceLabel string     `json:"workspace_label"`
	Name           string     `json:"name"`
	Kind           string     `json:"kind"`
	Status         string     `json:"status"`
	Cwd            string     `json:"cwd"`
	Title          string     `json:"title"`
	Topic          string     `json:"topic,omitempty"`   // the session's own title
	Session        string     `json:"session,omitempty"` // id to resume it by
	IsAgent        bool       `json:"is_agent"`
	Machine        string     `json:"machine"`
	Run            *[2]string `json:"run,omitempty"` // model, effort Collie started it with
}

type PaneState struct {
	OK              bool        `json:"ok"`
	Error           string      `json:"error,omitempty"`
	Agents          []AgentView `json:"agents"`
	Shells          []AgentView `json:"shells"`
	Machines        []Machine   `json:"machines"`
	LastReadEntryID string      `json:"last_read_entry_id,omitempty"`
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (s *Server) state(ctx context.Context) PaneState {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	lastRead := ""
	if s.sup != nil {
		lastRead = s.sup.LastReadEntryID()
	}
	machines := s.herdr.Machines()
	ws, err := s.herdr.Workspaces(ctx)
	if err != nil {
		return PaneState{Error: err.Error(), Agents: []AgentView{}, Shells: []AgentView{}, Machines: machines, LastReadEntryID: lastRead}
	}
	panes, err := s.herdr.Panes(ctx)
	if err != nil {
		return PaneState{Error: err.Error(), Agents: []AgentView{}, Shells: []AgentView{}, Machines: machines, LastReadEntryID: lastRead}
	}
	agents, _ := s.herdr.Agents(ctx)

	labels := map[string]string{}
	order := map[string]int{}
	for _, w := range ws {
		labels[w.ID] = w.Label
		order[w.ID] = w.Number
	}
	names := map[string]string{}
	for _, a := range agents {
		names[a.PaneID] = deref(a.Name)
	}

	st := PaneState{OK: true, Agents: []AgentView{}, Shells: []AgentView{}, Machines: machines, LastReadEntryID: lastRead}
	topics := map[string]map[string]paneSession{"": s.titlesFor("", ctx)}
	for _, m := range machines {
		if !m.Local && m.Online {
			topics[m.ID] = s.titlesFor(m.ID, ctx)
		}
	}
	for _, p := range panes {
		cwd := deref(p.ForegroundCwd)
		if cwd == "" {
			cwd = deref(p.Cwd)
		}
		v := AgentView{
			PaneID: p.ID, WorkspaceID: p.WorkspaceID, WorkspaceLabel: labels[p.WorkspaceID],
			Kind: deref(p.Agent), Status: p.AgentStatus, Cwd: cwd, Title: deref(p.Title),
			Name: names[p.ID], IsAgent: p.Agent != nil,
		}
		var local string
		local, v.Machine = split(p.ID)
		if v.IsAgent {
			ps := topics[v.Machine][local]
			v.Topic, v.Session = ps.Title, ps.Session
			if r, ok := s.herdr.Run(p.ID); ok {
				v.Run = r // started from here
			} else {
				v.Run = ps.Run // started by that machine's own node
			}
		}
		if v.Name == "" {
			v.Name = v.WorkspaceLabel
		}
		if v.IsAgent {
			v.Status = s.seen.status(p.ID, v.Status)
		}
		if v.IsAgent && s.waiting(p.ID, v.Status) {
			v.Status = "waiting"
		}
		if v.IsAgent {
			st.Agents = append(st.Agents, v)
		} else {
			v.Status = "shell"
			st.Shells = append(st.Shells, v)
		}
	}
	less := func(list []AgentView) func(i, j int) bool {
		return func(i, j int) bool {
			if list[i].Machine != list[j].Machine {
				return list[i].Machine < list[j].Machine
			}
			if order[list[i].WorkspaceID] != order[list[j].WorkspaceID] {
				return order[list[i].WorkspaceID] < order[list[j].WorkspaceID]
			}
			return list[i].PaneID < list[j].PaneID
		}
	}
	alive := map[string]bool{}
	for _, p := range panes { // shells too: an agent may not show as one yet
		alive[p.ID] = true
	}
	online := map[string]bool{"": true}
	for _, m := range machines {
		online[m.ID] = m.Local || m.Online
	}
	s.herdr.pruneRuns(alive, func(m string) bool { return online[m] })
	sort.SliceStable(st.Agents, less(st.Agents))
	sort.SliceStable(st.Shells, less(st.Shells))
	return st
}

func (s *Server) getState(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.state(r.Context()))
}

// streamState pushes the herdr session state and the super-agent view over one
// SSE connection. Browsers allow ~6 HTTP/1.1 connections per origin, so every
// stream a tab opens counts.
func (s *Server) streamState(w http.ResponseWriter, r *http.Request) {
	sse, ok := newSSE(w)
	if !ok {
		return
	}
	var ch chan struct{}
	if s.sup != nil {
		c, done := s.sup.subscribe()
		defer done()
		ch = c
	}
	var lastState, lastSuper string
	tick := time.NewTicker(1 * time.Second)
	defer tick.Stop()
	beat := time.NewTicker(15 * time.Second)
	defer beat.Stop()
	for {
		// Collie's chat first: it is quick, and a message just sent should
		// show before the slower look across every computer's sessions.
		if s.sup != nil {
			b, _ := json.Marshal(s.superState(r.Context()))
			if string(b) != lastSuper {
				lastSuper = string(b)
				if sse.send("super", b) != nil {
					return
				}
			}
		}
		b, _ := json.Marshal(s.state(r.Context()))
		if string(b) != lastState {
			lastState = string(b)
			if sse.send("state", b) != nil {
				return
			}
		}
		select {
		case <-r.Context().Done():
			return
		case <-beat.C:
			sse.comment()
		case <-ch:
		case <-tick.C:
		}
	}
}

// streamPane mirrors one pane over SSE.
//
//	mode=screen: recent output with ANSI styling, for a scrollable terminal render.
//	mode=log:    recent output with soft wraps joined, for reading on narrow screens.
const screenLines = 500

func (s *Server) streamPane(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	mode := r.URL.Query().Get("mode")
	sse, ok := newSSE(w)
	if !ok {
		return
	}
	interval := 200 * time.Millisecond
	if mode == "log" {
		interval = 700 * time.Millisecond
	}
	var lastText string
	var lastSize Rect
	var sizeAt time.Time
	beat := time.Now()
	for {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		var (
			res ReadResult
			err error
		)
		if mode == "log" {
			res, err = s.herdr.Read(ctx, id, "recent_unwrapped", "text", 600)
		} else {
			if time.Since(sizeAt) > 2*time.Second {
				if sz, e := s.herdr.PaneSize(ctx, id); e == nil {
					lastSize = sz
				}
				sizeAt = time.Now()
			}
			res, err = s.herdr.Read(ctx, id, "recent", "ansi", screenLines)
		}
		cancel()
		if err != nil {
			var he *HerdrError
			if errors.As(err, &he) && strings.Contains(he.Code, "not_found") {
				b, _ := json.Marshal(map[string]any{"error": he.Message})
				sse.send("gone", b)
				return
			}
		} else {
			text := res.Text
			if mode != "log" {
				text = trimScreenBlankTail(text)
			}
			if text != lastText {
				lastText = text
				b, _ := json.Marshal(map[string]any{
					"text": text, "revision": res.Revision, "truncated": res.Truncated,
					"cols": lastSize.Width, "rows": lastSize.Height,
				})
				if sse.send("frame", b) != nil {
					return
				}
				beat = time.Now()
			}
		}
		if time.Since(beat) > 15*time.Second {
			sse.comment()
			beat = time.Now()
		}
		select {
		case <-r.Context().Done():
			return
		case <-time.After(interval):
		}
	}
}

// trimScreenBlankTail drops unpainted blank rows at the bottom of an ANSI
// snapshot while keeping internal blank rows and background-styled bars.
func trimScreenBlankTail(s string) string {
	for len(s) > 0 {
		i := strings.LastIndexByte(s, '\n')
		line := s[i+1:]
		if !isUnpaintedBlankRow(line) {
			break
		}
		if i < 0 {
			return ""
		}
		if i > 0 && s[i-1] == '\r' {
			i--
		}
		s = s[:i]
	}
	return s
}

func isUnpaintedBlankRow(line string) bool {
	rest := strings.ReplaceAll(line, "\x1b[0m", "")
	rest = strings.ReplaceAll(rest, "\x1b[m", "")
	for i := 0; i < len(rest); i++ {
		if rest[i] != ' ' && rest[i] != '\r' {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------- actions

func (s *Server) sendText(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text  string `json:"text"`
		Enter bool   `json:"enter"`
	}
	if !decode(w, r, &body) {
		return
	}
	id := r.PathValue("id")
	ctx := r.Context()
	if body.Text != "" {
		if err := s.herdr.Call(ctx, "pane.send_text", map[string]any{"pane_id": id, "text": body.Text}, nil); err != nil {
			fail(w, err)
			return
		}
	}
	if body.Enter {
		if err := s.herdr.Call(ctx, "pane.send_keys", map[string]any{"pane_id": id, "keys": []string{"enter"}}, nil); err != nil {
			fail(w, err)
			return
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) sendKeys(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Keys []string `json:"keys"`
	}
	if !decode(w, r, &body) {
		return
	}
	if len(body.Keys) == 0 || len(body.Keys) > 64 {
		writeJSON(w, 400, map[string]any{"error": "keys required"})
		return
	}
	if err := s.herdr.Call(r.Context(), "pane.send_keys", map[string]any{"pane_id": r.PathValue("id"), "keys": body.Keys}, nil); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) promptAgent(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text string `json:"text"`
	}
	if !decode(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.Text) == "" {
		writeJSON(w, 400, map[string]any{"error": "empty prompt"})
		return
	}
	if err := s.herdr.Prompt(r.Context(), r.PathValue("target"), body.Text); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// launchAgent opens a fresh herdr workspace in cwd and starts an agent in its
// shell pane, optionally handing it a first task.
func (s *Server) launchAgent(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Kind   string   `json:"kind"`
		Name   string   `json:"name"`
		Cwd    string   `json:"cwd"`
		Prompt string   `json:"prompt"`
		Label  string   `json:"label"`
		Args   []string `json:"args"`
		Model  string   `json:"model"`  // "" = the agent's own default
		Effort string   `json:"effort"` // likewise
	}
	if !decode(w, r, &body) {
		return
	}
	if !modelNameRe.MatchString(body.Model) || !modelNameRe.MatchString(body.Effort) {
		writeJSON(w, 400, map[string]any{"error": "invalid model or effort"})
		return
	}
	if body.Kind == "shell" {
		s.openShell(w, r, body.Cwd, body.Label)
		return
	}
	kind, ok := kinds[body.Kind]
	if !ok {
		writeJSON(w, 400, map[string]any{"error": "unsupported agent kind"})
		return
	}
	if body.Name == "" {
		body.Name = s.freeName(r.Context(), body.Kind)
	}
	if !nameRe.MatchString(body.Name) || (body.Name == routerName && !s.node) {
		writeJSON(w, 400, map[string]any{"error": "name must be lowercase letters, digits, - or _ (max 32), starting with a letter; 'collie' is reserved"})
		return
	}
	cwd := s.expand(body.Cwd)
	if !isDir(cwd) {
		writeJSON(w, 400, map[string]any{"error": "directory not found: " + cwd})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	label := body.Label
	if label == "" {
		label = body.Name
	}
	effort := effectiveEffort(body.Kind, body.Model, body.Effort)
	var mArgs []string
	if !(kind == "doubao" && body.Model == "" && body.Effort == "" && contains(body.Args, "--resume")) {
		mArgs = modelArgs(body.Kind, body.Model, effort)
	}
	args := append(mArgs, body.Args...)
	paneID, wsID, err := s.startAgent(ctx, "", kind, body.Name, cwd, label, args)
	if paneID != "" {
		s.herdr.RememberRun(paneID, body.Model, effort)
	}
	if err != nil {
		var he *HerdrError
		if errors.As(err, &he) && he.Code == "agent_not_ready" {
			writeJSON(w, 202, map[string]any{"pane_id": paneID, "workspace_id": wsID, "warning": "agent 启动时停在了一个对话框上，请在页面里处理"})
			return
		}
		writeJSON(w, 502, map[string]any{"error": err.Error(), "pane_id": paneID, "workspace_id": wsID})
		return
	}
	if p := strings.TrimSpace(body.Prompt); p != "" {
		// A fresh agent takes a few seconds before it takes input.
		var err error
		for wait := time.Now().Add(20 * time.Second); ; {
			err = s.herdr.Prompt(ctx, paneID, p)
			var he *HerdrError
			if err == nil || !errors.As(err, &he) || (he.Code != "agent_not_ready" && he.Code != "agent_not_found") || time.Now().After(wait) || ctx.Err() != nil {
				break
			}
			time.Sleep(1500 * time.Millisecond)
		}
		if err != nil {
			writeJSON(w, 202, map[string]any{"pane_id": paneID, "workspace_id": wsID, "warning": "已启动，但第一个任务发送失败：" + err.Error()})
			return
		}
	}
	writeJSON(w, 200, map[string]any{"pane_id": paneID, "workspace_id": wsID})
}

// openShell opens a plain terminal: a herdr workspace in cwd, no agent.
func (s *Server) openShell(w http.ResponseWriter, r *http.Request, dir, label string) {
	cwd := s.expand(dir)
	if !isDir(cwd) {
		writeJSON(w, 400, map[string]any{"error": "directory not found: " + cwd})
		return
	}
	if label == "" {
		label = filepath.Base(cwd)
		if cwd == s.home {
			label = "~"
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	wsID, paneID, err := s.herdr.CreateWorkspace(ctx, "", cwd, label)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"pane_id": paneID, "workspace_id": wsID})
}

// startAgent creates a workspace in cwd and starts a herdr agent in its pane.
// An "agent_not_ready" error means the agent is up but sitting on a dialog.
func (s *Server) startAgent(ctx context.Context, machine, herdrKind, name, cwd, label string, args []string) (paneID, wsID string, err error) {
	if err := s.agentMissing(machine, herdrKind); err != nil {
		return "", "", err
	}
	if herdrKind == "doubao" {
		return s.startDoubaoAgent(ctx, machine, name, cwd, label, args)
	}
	s.trustForStart(ctx, machine, herdrKind, cwd, args)
	wsID, paneID, err = s.herdr.CreateWorkspace(ctx, machine, cwd, label)
	if err != nil {
		return "", "", err
	}
	// A brand-new shell needs a moment to reach its prompt; retry until herdr
	// accepts the pane or we run out of patience.
	params := map[string]any{"name": name, "kind": herdrKind, "pane_id": paneID, "timeout_ms": 60000}
	if len(args) > 0 {
		params["args"] = args
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		err = s.herdr.Call(ctx, "agent.start", params, nil)
		var he *HerdrError
		if err == nil || !errors.As(err, &he) || he.Code == "agent_not_ready" || time.Now().After(deadline) ||
			strings.Contains(he.Code, "name") {
			break
		}
		time.Sleep(600 * time.Millisecond)
	}
	var he *HerdrError
	if err == nil || (errors.As(err, &he) && he.Code == "agent_not_ready") {
		s.markStarted(paneID)
		if machine == "" && herdrKind == "codex" && len(args) >= 2 && args[0] == "resume" && args[1] != "" {
			if p, _ := s.findTranscript("codex", "id", args[1], paneID, cwd); p != "" {
				claimTranscript(p, paneID)
			}
		}
		if machine == "" && herdrKind == "agy" {
			if sess := agyConversationArg(args); sess != "" {
				s.rememberAgySession(paneID, sess)
			}
		}
		s.herdr.Remember(paneID, name)
	}
	return paneID, wsID, err
}

func (s *Server) collieBinFor(machine string) string {
	if machine != "" {
		if mc, err := s.herdr.machine(machine); err == nil && mc.Bin != "" {
			return mc.Bin
		}
		return "collie"
	}
	if s.sup != nil && s.sup.bin != "" {
		return s.sup.bin
	}
	bin, _ := os.Executable()
	if r, err := filepath.EvalSymlinks(bin); err == nil {
		bin = r
	}
	if bin == "" {
		return "collie"
	}
	return stableBin(bin, collieDir())
}

func (s *Server) doubaoTranscriptDir() string {
	if s != nil && s.sup != nil && s.sup.dir != "" {
		return filepath.Join(s.sup.dir, "transcripts", "doubao")
	}
	return filepath.Join(collieDir(), "transcripts", "doubao")
}

// startDoubaoAgent starts `collie _bridge doubao` inside a fresh Herdr pane
// without modifying Herdr's built-in agent kinds. The bridge drives
// `doubao acp serve` and reports lifecycle state back to Herdr via
// `pane.report_agent`.
func (s *Server) startDoubaoAgent(ctx context.Context, machine, name, cwd, label string, args []string) (paneID, wsID string, err error) {
	wsID, paneID, err = s.herdr.CreateWorkspace(ctx, machine, cwd, label)
	if err != nil {
		return "", "", err
	}
	cmdArgs := []string{s.collieBinFor(machine), "_bridge", "doubao", "--name", name}
	if machine == "" {
		if dir := s.doubaoTranscriptDir(); dir != "" {
			if home := filepath.Dir(filepath.Dir(dir)); home != "" {
				cmdArgs = append(cmdArgs, "--collie-home", home)
			}
		}
	}
	cmdArgs = append(cmdArgs, args...)
	quoted := make([]string, len(cmdArgs))
	for i, a := range cmdArgs {
		quoted[i] = shellQuote(a)
	}
	cmdLine := strings.Join(quoted, " ")

	// Wait briefly for the shell PTY to initialize, then launch the bridge.
	time.Sleep(150 * time.Millisecond)
	sendErr := s.herdr.Call(ctx, "pane.send_input", map[string]any{
		"pane_id": paneID,
		"text":    cmdLine,
		"keys":    []string{"Enter"},
	}, nil)
	if sendErr != nil {
		if e1 := s.herdr.Call(ctx, "pane.send_text", map[string]any{"pane_id": paneID, "text": cmdLine}, nil); e1 != nil {
			return paneID, wsID, e1
		}
		if e2 := s.herdr.Call(ctx, "pane.send_keys", map[string]any{"pane_id": paneID, "keys": []string{"enter"}}, nil); e2 != nil {
			return paneID, wsID, e2
		}
	}

	deadline := time.Now().Add(45 * time.Second)
	for poll := 0; ; poll++ {
		var info struct {
			Agent struct {
				Agent  *string `json:"agent"`
				Status string  `json:"agent_status"`
			} `json:"agent"`
		}
		if callErr := s.herdr.Call(ctx, "agent.get", map[string]any{"target": paneID}, &info); callErr == nil &&
			info.Agent.Agent != nil && *info.Agent.Agent == "doubao" {
			_ = s.herdr.Call(ctx, "agent.rename", map[string]any{"target": paneID, "name": name}, nil)
			s.markStarted(paneID)
			s.herdr.Remember(paneID, name)
			if info.Agent.Status == "blocked" {
				return paneID, wsID, &HerdrError{Code: "agent_not_ready", Message: "doubao agent blocked on startup"}
			}
			return paneID, wsID, nil
		}
		if poll > 0 && poll%6 == 0 {
			if rr, rerr := s.herdr.Read(ctx, paneID, "recent_unwrapped", "text", 20); rerr == nil {
				for _, l := range strings.Split(rr.Text, "\n") {
					if i := strings.Index(l, "[doubao-bridge] fatal:"); i >= 0 {
						return paneID, wsID, errors.New(strings.TrimSpace(l[i:]))
					}
				}
			}
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			if rr, rerr := s.herdr.Read(ctx, paneID, "recent_unwrapped", "text", 20); rerr == nil {
				if why := deathReason(rr.Text); why != "" {
					return paneID, wsID, errors.New(why)
				}
			}
			return paneID, wsID, errors.New("doubao bridge did not become ready in time")
		}
		select {
		case <-ctx.Done():
			return paneID, wsID, ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
}

func (s *Server) closeWorkspace(w http.ResponseWriter, r *http.Request) {
	if err := s.herdr.Call(r.Context(), "workspace.close", map[string]any{"workspace_id": r.PathValue("id")}, nil); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------------------------------------------------------------- helpers

func (s *Server) expand(p string) string { return expandIn(s.home, p) }

// expandIn resolves "~", "~/x" and relative paths against a home directory.
// It uses "/" so it works for paths on another (Unix) machine too.
func expandIn(home, p string) string {
	p = strings.TrimSpace(p)
	switch {
	case p == "" || p == "~":
		return home
	case strings.HasPrefix(p, "~/"):
		return path.Join(home, p[2:])
	case !strings.HasPrefix(p, "/"):
		return path.Join(home, p)
	}
	return path.Clean(p)
}

func (s *Server) tilde(p string) string {
	if p == s.home {
		return "~"
	}
	if strings.HasPrefix(p, s.home+"/") {
		return "~" + p[len(s.home):]
	}
	return p
}

func isDir(p string) bool { fi, err := os.Stat(p); return err == nil && fi.IsDir() }

func init() {
	_ = mime.AddExtensionType(".woff2", "font/woff2")
	_ = mime.AddExtensionType(".png", "image/png")
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
}

func (s *Server) static() http.Handler {
	files := http.FileServerFS(s.web)
	// Embedded files have no modification time, so browsers would guess how
	// long to keep them and run an old app.js after an upgrade. Tag each file
	// by its content and have the browser revalidate every time.
	var etags sync.Map
	etag := func(p string) string {
		if v, ok := etags.Load(p); ok {
			return v.(string)
		}
		b, err := fs.ReadFile(s.web, p)
		if err != nil {
			return ""
		}
		sum := sha256.Sum256(b)
		tag := `"` + hex.EncodeToString(sum[:8]) + `"`
		etags.Store(p, tag)
		return tag
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if tag := etag(p); tag != "" {
			w.Header().Set("ETag", tag)
			w.Header().Set("Cache-Control", "no-cache")
			if r.Header.Get("If-None-Match") == tag {
				w.WriteHeader(http.StatusNotModified)
				return
			}
		}
		files.ServeHTTP(w, r)
	})
}

// crossSite reports a request made by a page from another origin: another
// hub's web app showing this hub's sessions.
func crossSite(r *http.Request) bool {
	o := r.Header.Get("Origin")
	if o == "" || o == "null" {
		return false
	}
	u, err := url.Parse(o)
	return err != nil || u.Host != r.Host
}

// cors lets another hub's page (the browser shows several hubs in one
// sidebar) call this hub's API. Such calls carry the token themselves. No
// Access-Control-Allow-Credentials: a page asking to send our cookie fails
// the preflight, so allowing any origin hands nothing to a page that doesn't
// already hold a token.
func cors(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if crossSite(r) && strings.HasPrefix(r.URL.Path, "/api/") {
			hd := w.Header()
			hd.Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
			hd.Add("Vary", "Origin")
			hd.Set("Access-Control-Expose-Headers", "X-Collie-Web, X-File-Kind, X-File-Size, X-File-Path, Content-Disposition")
			if r.Method == http.MethodOptions {
				hd.Set("Access-Control-Allow-Methods", "GET, POST")
				hd.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				hd.Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		h.ServeHTTP(w, r)
	})
}

func securityHeaders(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		h.ServeHTTP(w, r)
	})
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(v); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid JSON body"})
		return false
	}
	return true
}

func fail(w http.ResponseWriter, err error) {
	code := 502
	var he *HerdrError
	if errors.As(err, &he) {
		code = 409
		if strings.Contains(he.Code, "not_found") {
			code = 404
		}
	}
	writeJSON(w, code, map[string]any{"error": err.Error()})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

type sseWriter struct {
	w http.ResponseWriter
	f http.Flusher
}

func newSSE(w http.ResponseWriter) (*sseWriter, bool) {
	f, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", 500)
		return nil, false
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(200)
	f.Flush()
	return &sseWriter{w, f}, true
}

func (s *sseWriter) send(event string, data []byte) error {
	if _, err := fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", event, data); err != nil {
		return err
	}
	s.f.Flush()
	return nil
}

func (s *sseWriter) comment() { fmt.Fprint(s.w, ": ping\n\n"); s.f.Flush() }
