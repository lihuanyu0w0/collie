package collie

import (
	"context"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// tmux reports the process that started each pane. Its children keep that
// association even when several shells and Codex clients share a directory.
func tmuxPaneTitles() map[int]string {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "tmux", "list-panes", "-a", "-F", "#{pane_pid}\t#{pane_title}").Output()
	if err != nil {
		return nil
	}
	titles := make(map[int]string)
	for _, line := range strings.Split(string(out), "\n") {
		pid, title, ok := strings.Cut(line, "\t")
		if n, err := strconv.Atoi(pid); ok && err == nil {
			titles[n] = title
		}
	}
	return titles
}

func tmuxProcessTitle(ps map[int]*proc, p *proc, titles map[int]string) string {
	for n := 0; p != nil && n < 30; n++ {
		if title, ok := titles[p.pid]; ok {
			return codexTitlePart(title)
		}
		if strings.HasPrefix(p.name, "tmux") {
			break
		}
		p = ps[p.ppid]
	}
	return ""
}

// Use only current, unique names: renames and duplicate thread names cannot
// identify the conversation in a terminal.
func (s *Server) uniqueCodexThreadNames() map[string]string {
	s.loadCodexNames()
	codexNames.Lock()
	defer codexNames.Unlock()
	byName := make(map[string]string)
	for id, name := range codexNames.m {
		if _, exists := byName[name]; exists {
			byName[name] = ""
		} else {
			byName[name] = id
		}
	}
	return byName
}

// Recognize a UUID in the resume subcommand's positional argument, not a
// UUID inside a prompt or an option value.
func codexResumeID(args []string) string {
	if len(args) < 2 {
		return ""
	}
	program := filepath.Base(args[0])
	args = args[1:]
	if (program == "node" || program == "bun") && len(args) > 0 {
		args = args[1:]
	}
	resume := false
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-c", "--config", "-C", "--cd", "-m", "--model", "-p", "--profile", "--remote", "--enable", "--disable":
			i++
		case "--no-alt-screen", "--dangerously-bypass-approvals-and-sandbox", "--all", "--full-auto":
		case "resume":
			if resume {
				return ""
			}
			resume = true
		default:
			if strings.HasPrefix(args[i], "--") && strings.Contains(args[i], "=") {
				continue
			}
			if resume && len(args[i]) == 36 && uuidRe.MatchString(args[i]) {
				return args[i]
			}
			return ""
		}
	}
	return ""
}

// locateTmuxCodex returns false when ordinary directory-based discovery is safe.
func (s *Server) locateTmuxCodex(e *External, p *proc, title string, names map[string]string, sharedDir bool) bool {
	if id := codexResumeID(p.args); id != "" {
		e.Session = id
		e.path, e.format = s.findTranscript("codex", "id", id, "", "")
		e.Title = s.codexThreadName(id)
		return true
	}
	if id := names[title]; len(id) == 36 && uuidRe.MatchString(id) {
		path, format := s.findTranscript("codex", "id", id, "", "")
		if path != "" {
			metaID, cwd := codexMeta(path)
			if metaID == id && sameDir(cwd, e.Cwd) {
				e.Session, e.path, e.format, e.Title = id, path, format, title
				return true
			}
		}
	}
	if !sharedDir && e.Cwd != "" {
		return false
	}
	e.Title = cleanTitle(title)
	e.ReadOnly = "无法确定这个 tmux 窗格对应的 Codex 会话"
	return true
}
