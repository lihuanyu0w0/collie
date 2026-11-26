package collie

import (
	"os"
	"testing"
	"time"
)

func TestParseEtime(t *testing.T) {
	for in, want := range map[string]time.Duration{
		"05:07":      5*time.Minute + 7*time.Second,
		"01:06:25":   time.Hour + 6*time.Minute + 25*time.Second,
		"2-03:00:01": 51*time.Hour + time.Second,
	} {
		if got := parseEtime(in); got != want {
			t.Errorf("%s: %v, want %v", in, got, want)
		}
	}
}

func TestProgName(t *testing.T) {
	for want, args := range map[string][]string{
		"claude": {"/Users/x/.local/bin/claude", "--resume", "id"},
		"codex":  {"node", "/usr/lib/node_modules/@openai/codex/bin/codex.js"},
		"zsh":    {"-zsh"},
	} {
		if got := progName(args); got != want {
			t.Errorf("%v: %q, want %q", args, got, want)
		}
	}
}

// COLLIE_EXTERNAL=1 go test -run TestExternalLive -v prints what this machine finds.
func TestExternalLive(t *testing.T) {
	if os.Getenv("COLLIE_EXTERNAL") == "" {
		t.Skip("set COLLIE_EXTERNAL=1")
	}
	home, _ := os.UserHomeDir()
	s := &Server{home: home}
	for _, e := range s.externalSessions() {
		t.Logf("%s app=%q cwd=%s session=%s title=%q path=%s", e.ID, e.App, e.Cwd, e.Session, e.Title, e.path)
	}
}

func TestLocateExternalCodex(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CODEX_HOME", root)
	now := time.Now().Truncate(time.Second)
	writeRollout(t, root, "old", "/a", now, now.Add(-time.Minute), "")
	pathA := writeRollout(t, root, "current", "/a", now, now, "")
	pathB := writeRollout(t, root, "other", "/b", now, now.Add(time.Minute), "")
	tests := []struct {
		cwd              string
		start            time.Time
		wantPath, wantID string
	}{
		{"/a", now.Add(-time.Hour), pathA, "current"},
		{"/a", now.Add(5 * time.Second), pathA, "current"},
		{"/a", now.Add(6 * time.Second), "", ""},
		{"/b", now, pathB, "other"},
		{"/missing", now, "", ""},
	}
	var sessions []*External
	for _, tc := range tests {
		sessions = append(sessions, &External{Kind: "codex", Cwd: tc.cwd, Started: tc.start})
	}
	s := &Server{}
	s.locateExternalCodex(sessions)
	for i, tc := range tests {
		e := sessions[i]
		if e.path != tc.wantPath || e.Session != tc.wantID || (e.format == "codex") != (tc.wantPath != "") {
			t.Errorf("cwd %s, start %v: got (%q, %q, %q), want path %q and session %q",
				tc.cwd, tc.start, e.path, e.Session, e.format, tc.wantPath, tc.wantID)
		}
	}
}
