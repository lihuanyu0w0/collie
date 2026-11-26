package collie

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAgyCLIHistory(t *testing.T) {
	home := t.TempDir()
	root := filepath.Join(home, ".gemini", "antigravity-cli")
	project := filepath.Join(home, "project")
	if err := os.MkdirAll(project, 0700); err != nil {
		t.Fatal(err)
	}
	const open = "11111111-1111-1111-1111-111111111111"
	const missing = "22222222-2222-2222-2222-222222222222"
	const nested = "33333333-3333-3333-3333-333333333333"
	const killed = "44444444-4444-4444-4444-444444444444"
	const stale = "55555555-5555-5555-5555-555555555555"
	const noState = "66666666-6666-6666-6666-666666666666"
	initAgySummaryDB(t, root, []struct {
		id, title, uri, status string
		notIdle                int
	}{
		{open, "", "file://" + project, "CASCADE_RUN_STATUS_RUNNING", 0},
		{missing, "Gone", "file://" + project + "/removed", "", 0},
		{nested, "Child", "", "", 0}, {killed, "Killed", "", "", 0},
		{stale, "Old", "", "", 0}, {noState, "Transcript only", "file://" + project, "", 0},
	})
	db, err := sql.Open("sqlite", filepath.Join(root, "conversation_summaries.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{
		"UPDATE conversation_summaries SET nesting_depth=1 WHERE conversation_id='" + nested + "'",
		"UPDATE conversation_summaries SET killed=1 WHERE conversation_id='" + killed + "'",
		"UPDATE conversation_summaries SET last_modified_time='0001-01-01' WHERE conversation_id='" + open + "'",
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(root, "conversations"), 0700); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{open, missing, nested, killed, stale, noState} {
		path := filepath.Join(root, "brain", id, ".system_generated", "logs", "transcript.jsonl")
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("{\"type\":\"USER_INPUT\",\"content\":\"original question\"}\n"), 0600); err != nil {
			t.Fatal(err)
		}
		if id != noState {
			if err := os.WriteFile(filepath.Join(root, "conversations", id+".db"), []byte("test"), 0600); err != nil {
				t.Fatal(err)
			}
		}
		if id == stale {
			at := time.Now().Add(-desktopWindow - time.Hour)
			if err := os.Chtimes(path, at, at); err != nil {
				t.Fatal(err)
			}
		}
	}
	forgetDesktopRows()
	t.Cleanup(forgetDesktopRows)
	s := &Server{home: home}
	rows := s.desktopSessions(nil, map[string]bool{}, time.Now())
	byID := map[string]*External{}
	for _, e := range rows {
		byID[e.Session] = e
	}
	if len(rows) != 3 {
		t.Fatalf("got %d rows, want 3", len(rows))
	}
	e := byID[open]
	if e == nil || e.ID != "ag-cli-"+open || e.App != appAgyCLI || e.Title != "original question" || e.Live || e.CanSend || !e.CanTakeOver || e.Cwd != project {
		t.Fatalf("wrong CLI history row: %+v", e)
	}
	tr := newTranscript(e.path, e.format)
	tr.openTail()
	if len(tr.msgs) != 1 || tr.msgs[0].Text != "original question" {
		t.Fatal("could not read historical transcript")
	}
	if byID[missing] == nil || byID[missing].CanTakeOver || !strings.Contains(byID[missing].ReadOnly, "工作目录") {
		t.Fatal("missing workspace must remain readable")
	}
	if byID[noState] == nil || byID[noState].CanTakeOver {
		t.Fatal("transcript without native state must remain read-only")
	}
	if got := s.desktopSessions(nil, map[string]bool{open: true}, time.Now()); len(got) != 2 {
		t.Fatalf("live conversation duplicated: %d rows", len(got))
	}
	// A desktop thread may have been imported into the CLI. While the
	// desktop is working, keep its live row. Keep just one row when idle too.
	initAgySummaryDB(t, filepath.Join(home, ".gemini", "antigravity"), []struct {
		id, title, uri, status string
		notIdle                int
	}{
		{open, "Desktop turn", "file://" + project, "CASCADE_RUN_STATUS_RUNNING", 0},
		{missing, "Imported conversation", "file://" + project, "CASCADE_RUN_STATUS_IDLE", 0},
	})
	forgetDesktopRows()
	merged, _ := s.desktopRows()
	if len(merged) != 3 {
		t.Fatalf("desktop and CLI indexes produced %d rows, want 3", len(merged))
	}
	for _, d := range merged {
		if d.session == open && (d.app != appAgy || !d.running) {
			t.Fatalf("running desktop conversation was replaced: %+v", d)
		}
		if d.session == missing && (d.app != appAgyCLI || d.path == "") {
			t.Fatalf("readable imported CLI transcript was hidden: %+v", d)
		}
	}
}

func TestAgyCLIWorkspace(t *testing.T) {
	for raw, want := range map[string]string{
		"/work":    "/work",
		"file:///": "/",
		"file://localhost/projects/spaces%20and%20a%2520literal": "/projects/spaces and a%20literal",
		"file://other-host/work":                                 "",
		"vscode-remote://ssh-remote+host/work":                   "",
	} {
		if got := agyCLIWorkspace(raw); got != want {
			t.Errorf("agyCLIWorkspace(%q) = %q, want %q", raw, got, want)
		}
	}
}
