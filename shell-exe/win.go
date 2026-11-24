//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32                    = syscall.NewLazyDLL("user32.dll")
	pEnumWindows              = user32.NewProc("EnumWindows")
	pGetWindowTextW           = user32.NewProc("GetWindowTextW")
	pGetClassNameW            = user32.NewProc("GetClassNameW")
	pIsWindow                 = user32.NewProc("IsWindow")
	pIsIconic                 = user32.NewProc("IsIconic")
	pShowWindow               = user32.NewProc("ShowWindow")
	pSetWindowPos             = user32.NewProc("SetWindowPos")
	pGetWindowRect            = user32.NewProc("GetWindowRect")
	pGetWindowLongW           = user32.NewProc("GetWindowLongW")
	pMonitorFromWindow        = user32.NewProc("MonitorFromWindow")
	pGetMonitorInfoW          = user32.NewProc("GetMonitorInfoW")
	pSetForegroundWindow      = user32.NewProc("SetForegroundWindow")
	pGetForegroundWindow      = user32.NewProc("GetForegroundWindow")
	pPostMessageW             = user32.NewProc("PostMessageW")
	pKeybdEvent               = user32.NewProc("keybd_event")
	pMessageBoxW              = user32.NewProc("MessageBoxW")
	pSetProcessDpiAwarenessCt = user32.NewProc("SetProcessDpiAwarenessContext")
	pSetProcessDPIAware       = user32.NewProc("SetProcessDPIAware")
)

const (
	swMaximize = 3
	swMinimize = 6
	swRestore  = 9
	wmClose    = 0x0010
	wmKeyDown  = 0x0100
	wmKeyUp    = 0x0101
	vkF11      = 0x7A
	keyUp      = 0x0002
	gwlStyle   = -16
	wsThick    = 0x00040000
	monNearest = 2
)

type rect struct{ L, T, R, B int32 }
type monitorInfo struct {
	Size    uint32
	Monitor rect
	Work    rect
	Flags   uint32
}

var hwnd uintptr

func setDPIAware() {
	// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4; eski Windows'ta SetProcessDPIAware.
	if pSetProcessDpiAwarenessCt.Find() == nil {
		if r, _, _ := pSetProcessDpiAwarenessCt.Call(^uintptr(3)); r != 0 {
			return
		}
	}
	if pSetProcessDPIAware.Find() == nil {
		pSetProcessDPIAware.Call()
	}
}

// Edge ya da Chrome'u uygulama kipinde, tam ekran açar: sekme, adres çubuğu ve tarayıcı düğmeleri olmaz.
// Profil klasörü (BaskiHesabi-veri/pencere) kabuk 1 ile aynıdır — kayıtlar oradadır.
func openWindow(addr string) *exec.Cmd {
	profile := filepath.Join(dataDir, "pencere")
	args := []string{
		"--app=" + addr,
		"--user-data-dir=" + profile,
		"--start-fullscreen",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-session-crashed-bubble",
		"--hide-crash-restore-bubble",
		"--disable-backgrounding-occluded-windows",
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
	openURL(addr)
	return nil
}

func browsers() []string {
	var out []string
	envs := []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")}
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

func openURL(u string) {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", u)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Start()
}

func startDetached(cmd *exec.Cmd) error {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x00000200} // CREATE_NEW_PROCESS_GROUP
	return cmd.Start()
}

func utf16(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }

func fatal(msg string) {
	pMessageBoxW.Call(0, uintptr(unsafe.Pointer(utf16(msg))), uintptr(unsafe.Pointer(utf16("Baskı Hesabı"))), 0x10|0x40000)
}

// askRetry: "Yeniden Dene / İptal" penceresi; Yeniden Dene → true.
func askRetry(title, msg string) bool {
	r, _, _ := pMessageBoxW.Call(0, uintptr(unsafe.Pointer(utf16(msg))), uintptr(unsafe.Pointer(utf16(title))), 0x5|0x30|0x40000)
	return r == 4
}

func searchRootList() []searchRoot {
	var out []searchRoot
	if h := os.Getenv("USERPROFILE"); h != "" {
		out = append(out, searchRoot{h, 4})
	}
	for _, d := range "CDEFGHIJKLMNOPQRSTUVWXYZ" {
		root := string(d) + `:\`
		if _, err := os.Stat(root); err == nil {
			out = append(out, searchRoot{filepath.Join(root, "Claude Programlarım"), 3}, searchRoot{root, 2})
		}
	}
	return out
}

// ---------------------------------------------------------------- pencere

func windowText(h uintptr) string {
	buf := make([]uint16, 512)
	n, _, _ := pGetWindowTextW.Call(h, uintptr(unsafe.Pointer(&buf[0])), 512)
	return syscall.UTF16ToString(buf[:n])
}

func className(h uintptr) string {
	buf := make([]uint16, 256)
	n, _, _ := pGetClassNameW.Call(h, uintptr(unsafe.Pointer(&buf[0])), 256)
	return syscall.UTF16ToString(buf[:n])
}

func findWindow(mark string) bool {
	var found uintptr
	cb := syscall.NewCallback(func(h, _ uintptr) uintptr {
		if strings.HasPrefix(className(h), "Chrome_WidgetWin") && strings.Contains(windowText(h), mark) {
			found = h
			return 0
		}
		return 1
	})
	pEnumWindows.Call(cb, 0)
	if found != 0 {
		hwnd = found
		return true
	}
	return false
}

func windowFound() bool {
	if hwnd == 0 {
		return false
	}
	r, _, _ := pIsWindow.Call(hwnd)
	return r != 0
}

func isMinimized() bool {
	if !windowFound() {
		return false
	}
	r, _, _ := pIsIconic.Call(hwnd)
	return r != 0
}

func monitorOf(h uintptr) monitorInfo {
	mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
	m, _, _ := pMonitorFromWindow.Call(h, monNearest)
	pGetMonitorInfoW.Call(m, uintptr(unsafe.Pointer(&mi)))
	return mi
}

// isFullscreen: Chromium tam ekranda pencere çerçevesini (WS_THICKFRAME) kaldırır ve ekranın tamamını kaplar.
func isFullscreen() bool {
	if !windowFound() || isMinimized() {
		return false
	}
	var rc rect
	pGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&rc)))
	mon := monitorOf(hwnd).Monitor
	gi := int32(gwlStyle)
	style, _, _ := pGetWindowLongW.Call(hwnd, uintptr(gi))
	covers := rc.L <= mon.L && rc.T <= mon.T && rc.R >= mon.R && rc.B >= mon.B
	return covers && style&wsThick == 0
}

func sendF11() {
	fg, _, _ := pGetForegroundWindow.Call()
	if fg != hwnd {
		pSetForegroundWindow.Call(hwnd)
		time.Sleep(60 * time.Millisecond)
		fg, _, _ = pGetForegroundWindow.Call()
	}
	if fg == hwnd {
		pKeybdEvent.Call(vkF11, 0, 0, 0)
		pKeybdEvent.Call(vkF11, 0, keyUp, 0)
		return
	}
	pPostMessageW.Call(hwnd, wmKeyDown, vkF11, 0x00570001)
	pPostMessageW.Call(hwnd, wmKeyUp, vkF11, 0xC0570001)
}

func waitFull(want bool) bool {
	for i := 0; i < 20; i++ {
		if isFullscreen() == want {
			return true
		}
		time.Sleep(75 * time.Millisecond)
	}
	return false
}

func setFullscreen(on bool) {
	if !windowFound() {
		return
	}
	if isMinimized() {
		pShowWindow.Call(hwnd, swRestore)
		time.Sleep(150 * time.Millisecond)
	}
	if isFullscreen() == on {
		return
	}
	sendF11()
	if !waitFull(on) {
		// İkinci yol: doğrudan pencereye tuş iletisi.
		pPostMessageW.Call(hwnd, wmKeyDown, vkF11, 0x00570001)
		pPostMessageW.Call(hwnd, wmKeyUp, vkF11, 0xC0570001)
		waitFull(on)
	}
}

func minimizeWindow() {
	if windowFound() {
		pShowWindow.Call(hwnd, swMinimize)
	}
}

func maximizeWindow() {
	if windowFound() {
		pShowWindow.Call(hwnd, swMaximize)
	}
}

// halfWindow: çalışma alanının %50 × %50'si, ortalanmış.
func halfWindow() {
	if !windowFound() {
		return
	}
	pShowWindow.Call(hwnd, swRestore)
	time.Sleep(80 * time.Millisecond)
	wa := monitorOf(hwnd).Work
	w, h := (wa.R-wa.L)/2, (wa.B-wa.T)/2
	x, y := wa.L+(wa.R-wa.L-w)/2, wa.T+(wa.B-wa.T-h)/2
	pSetWindowPos.Call(hwnd, 0, uintptr(x), uintptr(y), uintptr(w), uintptr(h), 0x0004|0x0040) // NOZORDER|SHOWWINDOW
}

func closeWindow() {
	if windowFound() {
		pPostMessageW.Call(hwnd, wmClose, 0, 0)
	}
}

func bringToFront() {
	if !windowFound() {
		return
	}
	if isMinimized() {
		pShowWindow.Call(hwnd, swRestore)
	}
	pSetForegroundWindow.Call(hwnd)
}
