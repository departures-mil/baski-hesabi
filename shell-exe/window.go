package main

// Pencere düğmeleri (Küçült · Orta · Tam ekran · Kapat) için yerel API. Pencere Edge/Chrome'un uygulama penceresidir;
// kabuk onu Windows API'siyle bulur (sayfa başlığına bir kerelik iz koyarak) ve yönetir (win.go).
//   POST /__shell/pencere/kaydet {iz}   → pencereyi bul (başlığında "BH-<iz>" olan)
//   POST /__shell/pencere/kucult | orta | tam | tam-ac | kapat | one
//   GET  /__shell/pencere/durum         → {bulundu, tamEkran, orta, kucuk}

import (
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"sync"
	"time"
)

type winState struct {
	Found      bool `json:"bulundu"`
	Fullscreen bool `json:"fullscreen"`
	Half       bool `json:"half"`
	Minimized  bool `json:"minimized"`
}

var (
	winMu   sync.Mutex
	winHalf bool
)

var nonceRe = regexp.MustCompile(`^[A-Za-z0-9]{6,32}$`)

func windowAPI(w http.ResponseWriter, r *http.Request, op string) {
	if op != "durum" && r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "yok")
		return
	}
	winMu.Lock()
	defer winMu.Unlock()
	switch op {
	case "kaydet":
		var body struct{ Iz string }
		_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)
		if !nonceRe.MatchString(body.Iz) {
			fail(w, http.StatusBadRequest, "iz")
			return
		}
		ok := false
		for i := 0; i < 30 && !ok; i++ {
			ok = findWindow("BH-" + body.Iz)
			if !ok {
				time.Sleep(100 * time.Millisecond)
			}
		}
		writeJSON(w, map[string]any{"bulundu": ok})
		return
	case "kucult":
		minimizeWindow()
	case "orta":
		if winHalf {
			winHalf = false
			setFullscreen(true)
		} else {
			setFullscreen(false)
			halfWindow()
			winHalf = true
		}
	case "tam":
		// Tam ekran düğmesi: tam ekrandaysa büyütülmüş pencereye, değilse tam ekrana.
		if isFullscreen() {
			setFullscreen(false)
			maximizeWindow()
		} else {
			setFullscreen(true)
		}
		winHalf = false
	case "tam-ac":
		// Açılış: her zaman tam ekran (zaten tam ekransa dokunmaz).
		if !isFullscreen() {
			setFullscreen(true)
		}
		winHalf = false
	case "kapat":
		closeWindow()
		go func() { time.Sleep(1500 * time.Millisecond); quitSoon() }()
	case "one":
		bringToFront()
	case "durum":
	default:
		fail(w, http.StatusNotFound, "yok")
		return
	}
	full := isFullscreen()
	if full {
		winHalf = false
	}
	writeJSON(w, winState{Found: windowFound(), Fullscreen: full, Half: winHalf, Minimized: isMinimized()})
}
