//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

// Edge ya da Chrome'u uygulama kipinde açar: sekme ve adres çubuğu olmaz,
// kendi görev çubuğu simgesiyle ayrı bir pencere olarak görünür.
func openWindow(addr string) *exec.Cmd {
	profile := filepath.Join(dataDir, "pencere")
	args := []string{
		"--app=" + addr,
		"--user-data-dir=" + profile,
		"--start-maximized",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-features=Translate,msEdgeAutofill,TabHoverCards",
	}

	for _, exe := range browsers() {
		if _, err := os.Stat(exe); err != nil {
			continue
		}
		cmd := exec.Command(exe, args...)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		if err := cmd.Start(); err == nil {
			return cmd
		}
	}

	// Hiçbiri yoksa varsayılan tarayıcıda aç.
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", addr)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Start()
	return nil
}

func browsers() []string {
	var out []string
	envs := []string{
		os.Getenv("ProgramFiles(x86)"),
		os.Getenv("ProgramFiles"),
		os.Getenv("LOCALAPPDATA"),
	}
	rels := []string{
		`Microsoft\Edge\Application\msedge.exe`,
		`Google\Chrome\Application\chrome.exe`,
		`BraveSoftware\Brave-Browser\Application\brave.exe`,
	}
	for _, e := range envs {
		if e == "" {
			continue
		}
		for _, r := range rels {
			out = append(out, filepath.Join(e, r))
		}
	}
	return out
}

func revealInExplorer(path string) {
	cmd := exec.Command("explorer", "/select,"+path)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Start()
}

func fatal(msg string) {
	cmd := exec.Command("mshta",
		"javascript:alert('"+strings.ReplaceAll(msg, "'", " ")+"');close()")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Run()
}
