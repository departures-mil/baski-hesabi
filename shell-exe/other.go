//go:build !windows

// Yalnızca sınama içindir (Linux CI); ürün Windows'ta çalışır. Pencere durumu benzetilir.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

var sim = struct{ found, full, min bool }{}

func setDPIAware()                     {}
func openWindow(addr string) *exec.Cmd { fmt.Println("pencere:", addr); return nil }
func revealInExplorer(path string)     {}
func openURL(u string)                 { fmt.Println("dis-adres:", u) }
func startDetached(cmd *exec.Cmd) error {
	if os.Getenv("BASKI_KURULUM_CALISTIR") == "" {
		fmt.Println("kurulum (calistirilmadi):", cmd.Path)
		return nil
	}
	return cmd.Start()
}
func fatal(msg string)                { fmt.Println("HATA:", msg) }
func askRetry(title, msg string) bool { fmt.Println("SORU:", title); return false }
func searchRootList() []searchRoot {
	if h, err := os.UserHomeDir(); err == nil {
		return []searchRoot{{h, 3}}
	}
	return nil
}
func findWindow(mark string) bool { sim.found = true; sim.full = true; return true }
func windowFound() bool           { return sim.found }
func isMinimized() bool           { return sim.min }
func isFullscreen() bool          { return sim.found && sim.full && !sim.min }
func setFullscreen(on bool)       { sim.min = false; sim.full = on }
func minimizeWindow()             { sim.min = true }
func maximizeWindow()             { sim.min = false; sim.full = false }
func halfWindow()                 { sim.min = false; sim.full = false }
func closeWindow()                { sim.found = false }
func bringToFront()               { sim.min = false }

func hideWindow(cmd *exec.Cmd) {}
func waitPid(pid int, d time.Duration) {
	end := time.Now().Add(d)
	for pid > 0 && time.Now().Before(end) {
		if p, err := os.FindProcess(pid); err != nil || p.Signal(syscall.Signal(0)) != nil {
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
}
