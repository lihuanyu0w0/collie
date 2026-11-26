package collie

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
)

// herdrConn is a minimal client for one herdr socket API: newline-delimited
// JSON requests of the form {"id","method","params"} answered by
// {"id","result"} or {"id","error":{"code","message"}}. dial reaches the socket
// either directly (this machine) or through a node tunnel (another machine).
type herdrConn struct {
	dial func(ctx context.Context) (net.Conn, error)
	seq  atomic.Uint64
}

func unixDialer(socket string) func(ctx context.Context) (net.Conn, error) {
	return func(ctx context.Context) (net.Conn, error) {
		c, err := dialHerdr(ctx, socket)
		if err != nil {
			return nil, fmt.Errorf("herdr socket unavailable (is `herdr server` running?): %w", err)
		}
		return c, nil
	}
}

// dialHerdr connects to this computer's herdr. Nothing there (a restart, a
// logout: herdr stopped with the session, Collie's service came back on its
// own): start herdr's server in the background and try again.
func dialHerdr(ctx context.Context, socket string) (net.Conn, error) {
	var d net.Dialer
	c, err := d.DialContext(ctx, "unix", socket)
	if err == nil || !startHerdrServer() {
		return c, err
	}
	for i := 0; i < 40; i++ {
		select {
		case <-ctx.Done():
			return nil, err
		case <-time.After(250 * time.Millisecond):
		}
		if c, err2 := d.DialContext(ctx, "unix", socket); err2 == nil {
			return c, nil
		}
	}
	return nil, err
}

var herdrStarted atomic.Int64 // unix seconds of the last start we made

// startHerdrServer runs `herdr server` detached, at most once in 30s.
func startHerdrServer() bool {
	now := time.Now().Unix()
	last := herdrStarted.Load()
	if now-last < 30 || !herdrStarted.CompareAndSwap(last, now) {
		return false
	}
	home, _ := os.UserHomeDir()
	bin := findBin("herdr", home)
	if bin == "" {
		return false
	}
	cmd := exec.Command(bin, "server")
	cmd.Dir = home
	// herdr starts agents by name in a shell that inherits its PATH.
	if codex := desktopCodex(home); codex != "" {
		dirs := append(filepath.SplitList(os.Getenv("PATH")), filepath.Dir(codex))
		cmd.Env = append(cmd.Environ(), "PATH="+strings.Join(dirs, string(os.PathListSeparator)))
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true} // outlives us, like the one a terminal starts
	if err := cmd.Start(); err != nil {
		log.Printf("start herdr server: %v", err)
		return false
	}
	log.Printf("herdr was not running: started `herdr server` (pid %d)", cmd.Process.Pid)
	go cmd.Wait()
	return true
}

type HerdrError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *HerdrError) Error() string { return e.Code + ": " + e.Message }

// call sends one request on a fresh connection and returns the raw result.
func (h *herdrConn) call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	if params == nil {
		params = map[string]any{}
	}
	conn, err := h.dial(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	if dl, ok := ctx.Deadline(); ok {
		conn.SetDeadline(dl)
	} else {
		conn.SetDeadline(time.Now().Add(30 * time.Second))
	}

	id := "co-" + strconv.FormatUint(h.seq.Add(1), 10)
	req, _ := json.Marshal(map[string]any{"id": id, "method": method, "params": params})
	if _, err := conn.Write(append(req, '\n')); err != nil {
		return nil, err
	}

	r := bufio.NewReaderSize(conn, 256*1024)
	for {
		line, err := r.ReadBytes('\n')
		if err != nil {
			return nil, fmt.Errorf("herdr %s: %w", method, err)
		}
		var env struct {
			ID     string          `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *HerdrError     `json:"error"`
		}
		if json.Unmarshal(line, &env) != nil || env.ID != id {
			continue
		}
		if env.Error != nil {
			return nil, env.Error
		}
		return env.Result, nil
	}
}

// ---- typed views over the parts of the API Collie uses ----

type Workspace struct {
	ID          string `json:"workspace_id"`
	Label       string `json:"label"`
	Number      int    `json:"number"`
	AgentStatus string `json:"agent_status"`
	PaneCount   int    `json:"pane_count"`
	Focused     bool   `json:"focused"`
}

type Pane struct {
	ID            string  `json:"pane_id"`
	WorkspaceID   string  `json:"workspace_id"`
	TabID         string  `json:"tab_id"`
	Agent         *string `json:"agent"`
	DisplayAgent  *string `json:"display_agent"`
	AgentStatus   string  `json:"agent_status"`
	Cwd           *string `json:"cwd"`
	ForegroundCwd *string `json:"foreground_cwd"`
	Title         *string `json:"terminal_title_stripped"`
	Revision      uint64  `json:"revision"`
	Focused       bool    `json:"focused"`
}

type Agent struct {
	Name          *string `json:"name"`
	PaneID        string  `json:"pane_id"`
	WorkspaceID   string  `json:"workspace_id"`
	Agent         *string `json:"agent"`
	DisplayAgent  *string `json:"display_agent"`
	AgentStatus   string  `json:"agent_status"`
	Cwd           *string `json:"cwd"`
	Ready         bool    `json:"interactive_ready"`
	LaunchPending bool    `json:"launch_pending"`
	StateSeq      uint64  `json:"state_change_seq"`
	TerminalTitle string  `json:"terminal_title_stripped"`
	Session       *struct {
		Kind  string `json:"kind"`
		Value string `json:"value"`
	} `json:"agent_session"`
}

type ReadResult struct {
	Text      string `json:"text"`
	Revision  uint64 `json:"revision"`
	Truncated bool   `json:"truncated"`
}

type Rect struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

func (h *Herdr) Workspaces(ctx context.Context) ([]Workspace, error) {
	var r struct {
		Workspaces []Workspace `json:"workspaces"`
	}
	err := h.Call(ctx, "workspace.list", nil, &r)
	return r.Workspaces, err
}

func (h *Herdr) Panes(ctx context.Context) ([]Pane, error) {
	var r struct {
		Panes []Pane `json:"panes"`
	}
	err := h.Call(ctx, "pane.list", nil, &r)
	return r.Panes, err
}

func (h *Herdr) Agents(ctx context.Context) ([]Agent, error) {
	var r struct {
		Agents []Agent `json:"agents"`
	}
	err := h.Call(ctx, "agent.list", nil, &r)
	return r.Agents, err
}

func (h *Herdr) Read(ctx context.Context, paneID, source, format string, lines int) (ReadResult, error) {
	p := map[string]any{"pane_id": paneID, "source": source, "format": format, "strip_ansi": format != "ansi"}
	if lines > 0 {
		p["lines"] = lines
	}
	var r struct {
		Read ReadResult `json:"read"`
	}
	err := h.Call(ctx, "pane.read", p, &r)
	return r.Read, err
}

func (h *Herdr) PaneSize(ctx context.Context, paneID string) (Rect, error) {
	var r struct {
		Layout struct {
			Panes []struct {
				ID   string `json:"pane_id"`
				Rect Rect   `json:"rect"`
			} `json:"panes"`
		} `json:"layout"`
	}
	if err := h.Call(ctx, "pane.layout", map[string]any{"pane_id": paneID}, &r); err != nil {
		return Rect{}, err
	}
	for _, p := range r.Layout.Panes {
		if p.ID == paneID {
			return p.Rect, nil
		}
	}
	return Rect{Width: 120, Height: 40}, nil
}

// CreateWorkspace opens a new workspace (one shell pane) without stealing the
// TUI user's focus and returns its root pane id.
func (h *Herdr) CreateWorkspace(ctx context.Context, machine, cwd, label string) (workspaceID, paneID string, err error) {
	var r struct {
		Workspace struct {
			ID string `json:"workspace_id"`
		} `json:"workspace"`
		RootPane struct {
			ID string `json:"pane_id"`
		} `json:"root_pane"`
	}
	p := map[string]any{"label": label, "focus": false, "_machine": machine}
	if cwd != "" {
		p["cwd"] = cwd
	}
	err = h.Call(ctx, "workspace.create", p, &r)
	return r.Workspace.ID, r.RootPane.ID, err
}
