// Baskı Hesabı — taşınabilir masaüstü kabuğu.
//
// Tek bir exe: arayüz içine gömülüdür, yerel bir adreste sunulur ve
// kendi penceresinde açılır. Kurulum, çalışma zamanı, ek dosya yoktur.
// Güncelleme indiğinde exe'nin yanındaki veri klasörüne yazılır ve
// bundan sonra oradan açılır.

package main

import (
	"embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const appName = "Baski Hesabi"
const appVersion = "1.2"

//go:embed all:app
var bundled embed.FS

var (
	dataDir  string // exe'nin yanı: kayıtlar, güncel paket, pencere profili
	liveDir  string // indirilen güncelleme
	outDir   string // dışa aktarmalar
	lastPing = time.Now()
	pingMu   sync.Mutex
)

func main() {
	exe, err := os.Executable()
	if err != nil {
		exe = os.Args[0]
	}
	base := filepath.Dir(exe)

	dataDir = filepath.Join(base, "BaskiHesabi-veri")
	liveDir = filepath.Join(dataDir, "app")
	outDir = filepath.Join(base, "BaskiHesabi-ciktilar")
	for _, d := range []string{dataDir, outDir} {
		_ = os.MkdirAll(d, 0o755)
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fatal("Yerel sunucu acilamadi: " + err.Error())
		return
	}
	port := ln.Addr().(*net.TCPAddr).Port
	addr := fmt.Sprintf("http://127.0.0.1:%d/", port)

	mux := http.NewServeMux()
	mux.HandleFunc("/__shell/", shellAPI)
	mux.HandleFunc("/", serveApp)
	go http.Serve(ln, mux)

	cmd := openWindow(addr)
	done := make(chan struct{})
	if cmd != nil {
		go func() { _ = cmd.Wait(); close(done) }()
	} else {
		close(done) // pencere bizim sürecimiz değil; yaşam işaretine bakarız
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	grace := time.Now().Add(40 * time.Second) // açılışa süre tanı

	for {
		select {
		case <-done:
			if cmd != nil {
				return // pencere kapandı
			}
			done = nil
		case <-ticker.C:
			pingMu.Lock()
			last := lastPing
			pingMu.Unlock()
			if time.Now().After(grace) && time.Since(last) > 25*time.Second {
				return // sayfa kapanmış
			}
		}
	}
}

// ---------------------------------------------------------------- sunum

func rootFS() fs.FS {
	if st, err := os.Stat(filepath.Join(liveDir, "index.html")); err == nil && !st.IsDir() {
		return os.DirFS(liveDir)
	}
	sub, err := fs.Sub(bundled, "app")
	if err != nil {
		return bundled
	}
	return sub
}

func serveApp(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/")
	if name == "" {
		name = "index.html"
	}
	if strings.Contains(name, "..") {
		http.Error(w, "yok", http.StatusNotFound)
		return
	}
	data, err := fs.ReadFile(rootFS(), name)
	if err != nil {
		http.Error(w, "yok", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", mimeOf(name))
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(data)
}

func mimeOf(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".html":
		return "text/html; charset=utf-8"
	case ".js":
		return "application/javascript; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".json":
		return "application/json; charset=utf-8"
	case ".svg":
		return "image/svg+xml"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".woff2":
		return "font/woff2"
	}
	return "application/octet-stream"
}

// ---------------------------------------------------------------- köprü

func shellAPI(w http.ResponseWriter, r *http.Request) {
	switch strings.TrimPrefix(r.URL.Path, "/__shell/") {

	case "info":
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"kind": "desktop", "version": appVersion,
			"dataDir": dataDir, "outDir": outDir,
		})

	case "ping":
		pingMu.Lock()
		lastPing = time.Now()
		pingMu.Unlock()
		fmt.Fprint(w, "ok")

	case "save":
		var body struct{ Name, Data string }
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bozuk istek", http.StatusBadRequest)
			return
		}
		path, err := saveOut(body.Name, body.Data)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		revealInExplorer(path)
		fmt.Fprint(w, path)

	case "update":
		var body struct {
			Version string            `json:"version"`
			Files   map[string]string `json:"files"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bozuk paket", http.StatusBadRequest)
			return
		}
		if err := applyUpdate(body.Version, body.Files); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		fmt.Fprint(w, "ok")

	case "restart":
		fmt.Fprint(w, "ok") // sayfa kendini yeniler, sunucu yeni paketi verir

	default:
		http.Error(w, "yok", http.StatusNotFound)
	}
}

func saveOut(name, dataURL string) (string, error) {
	if name == "" {
		name = "dosya"
	}
	name = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`\/:*?"<>|`, r) {
			return '_'
		}
		return r
	}, name)

	var raw []byte
	if i := strings.Index(dataURL, ","); strings.HasPrefix(dataURL, "data:") && i > 0 {
		head, body := dataURL[:i], dataURL[i+1:]
		if strings.Contains(head, ";base64") {
			b, err := base64.StdEncoding.DecodeString(body)
			if err != nil {
				return "", err
			}
			raw = b
		} else {
			s, err := url.QueryUnescape(body)
			if err != nil {
				return "", err
			}
			raw = []byte(s)
		}
	} else {
		raw = []byte(dataURL)
	}

	path := filepath.Join(outDir, name)
	return path, os.WriteFile(path, raw, 0o644)
}

func applyUpdate(version string, files map[string]string) error {
	if len(files) == 0 {
		return fmt.Errorf("paket bos")
	}
	if _, ok := files["index.html"]; !ok {
		return fmt.Errorf("index.html yok")
	}
	tmp := liveDir + ".yeni"
	_ = os.RemoveAll(tmp)
	for rel, content := range files {
		rel = strings.ReplaceAll(rel, `\`, "/")
		rel = strings.TrimLeft(rel, "/")
		if strings.Contains(rel, "..") {
			continue
		}
		dst := filepath.Join(tmp, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(dst, []byte(content), 0o644); err != nil {
			return err
		}
	}
	_ = os.RemoveAll(liveDir)
	if err := os.Rename(tmp, liveDir); err != nil {
		return err
	}
	_ = os.WriteFile(filepath.Join(dataDir, "surum.txt"), []byte(version), 0o644)
	return nil
}
