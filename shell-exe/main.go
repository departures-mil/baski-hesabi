// Baskı Hesabı — masaüstü kabuğu (kabuk 2, v1.14.0'dan beri).
//
// Tek exe: arayüz paketi (app.zip, ortak çekirdekle birlikte) içine gömülüdür, SABİT bir yerel adreste
// (http://127.0.0.1:41731) sunulur ve Edge/Chrome uygulama kipinde, her açılışta tam ekran açılır.
//
// Veriler: exe'nin yanındaki BaskiHesabi-veri klasörü (değişmedi). Kayıtlar tarayıcı profilinin
// (BaskiHesabi-veri/pencere) IndexedDB'sindedir; IndexedDB adrese (porta) bağlıdır. Kabuk 1 her açılışta
// RASTGELE port kullanıyordu → her oturumun kayıtları ayrı bir köken klasöründe kaldı. Kabuk 2 sabit port
// kullanır ve eski kökenleri "kurtarma" ile birleştirir (recover.go). Kurulumlu sürüm ilk açılışta eski
// taşınabilir klasörü bulup profili kopyalar (migrate.go). Hiçbir eski dosya silinmez.
//
// Güncelleme: ortak çekirdek (GitHub Releases + latest.json). win-app = arayüz paketi app.zip (FCD1 yaması
// ya da tam dosya; bundle.go), win-setup = NSIS kurulum (kabuk değiştiğinde).
package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const appName = "Baski Hesabi"
const appID = "baski-hesabi"

// appVersion derlemede -ldflags "-X main.appVersion=X.Y.Z" ile verilir; araclar/surum.js burayı da yazar.
var appVersion = "1.14.1"

// FixedPort: veriler bu kökene (http://127.0.0.1:41731) bağlıdır — DEĞİŞTİRMEYİN.
const FixedPort = 41731

var (
	exeDir   string
	dataDir  string // exe'nin yanı: BaskiHesabi-veri (pencere profili, paket, kurtarma kayıtları)
	outDir   string // dışa aktarmalar: BaskiHesabi-ciktilar
	listenAt int
	fixed    bool

	lastPing = time.Now()
	pingSeen bool
	pingMu   sync.Mutex
	quitCh   = make(chan struct{}, 1)
)

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func main() {
	if helperMain(os.Args[1:]) { // güncelleme bekleyicisi (--kur): pencere yok
		return
	}
	setDPIAware()
	exe, err := os.Executable()
	if err != nil {
		exe = os.Args[0]
	}
	exeDir = filepath.Dir(exe)
	dataDir = env("BASKI_VERI", filepath.Join(exeDir, "BaskiHesabi-veri"))
	outDir = env("BASKI_CIKTI", filepath.Join(exeDir, "BaskiHesabi-ciktilar"))
	port := FixedPort
	if p, err := strconv.Atoi(os.Getenv("BASKI_PORT")); err == nil && p > 0 {
		port = p
	}

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		// Aynı program zaten açıksa onun penceresini öne getir.
		if otherInstance(port) {
			return
		}
		// Port başka bir programda: bu oturum rastgele portla açılır (kayıtları sonraki açılışta kurtarılır).
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			fatal("Yerel sunucu acilamadi: " + err.Error())
			return
		}
	}
	listenAt = ln.Addr().(*net.TCPAddr).Port
	fixed = listenAt == port

	for _, d := range []string{dataDir, outDir} {
		_ = os.MkdirAll(d, 0o755)
	}
	// Kurulumlu sürümün ilk açılışı: eski taşınabilir klasörden profil kopyası (pencere açılmadan önce).
	migrateOnStart()

	if err := loadBundle(); err != nil {
		fatal("Arayuz paketi okunamadi: " + err.Error())
		return
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/__shell/", shellAPI)
	mux.HandleFunc("/", serveApp)
	srv := &http.Server{Handler: localOnly(mux), ReadHeaderTimeout: 20 * time.Second}
	go srv.Serve(ln)

	addr := fmt.Sprintf("http://127.0.0.1:%d/", listenAt)
	if os.Getenv("BASKI_PENCERE_YOK") == "" {
		openWindow(addr)
	} else {
		fmt.Println("adres:", addr)
	}
	waitForPage()
	applyOnExit()
}

// otherInstance: portta Baskı Hesabı çalışıyorsa penceresini öne getirir.
func otherInstance(port int) bool {
	cli := &http.Client{Timeout: 2 * time.Second}
	res, err := cli.Get(fmt.Sprintf("http://127.0.0.1:%d/__shell/info", port))
	if err != nil {
		return false
	}
	defer res.Body.Close()
	var info map[string]any
	if json.NewDecoder(res.Body).Decode(&info) != nil || info["app"] != appID {
		return false
	}
	r2, err := cli.Post(fmt.Sprintf("http://127.0.0.1:%d/__shell/pencere/one", port), "application/json", strings.NewReader("{}"))
	if err == nil {
		r2.Body.Close()
	}
	return true
}

// localOnly: yalnız 127.0.0.1'den ve kendi adresimizden gelen istekler (DNS rebinding'e karşı Host denetimi).
func localOnly(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if hst, _, err := net.SplitHostPort(host); err == nil {
			host = hst
		}
		if host != "127.0.0.1" && host != "localhost" {
			http.Error(w, "yok", http.StatusForbidden)
			return
		}
		// Kabuk API'si yalnız kendi sayfamızdan çağrılabilir (başka sitelerden POST'a karşı).
		if strings.HasPrefix(r.URL.Path, "/__shell/") && r.Method != http.MethodGet {
			if o := r.Header.Get("Origin"); o != "" && o != fmt.Sprintf("http://127.0.0.1:%d", listenAt) && o != fmt.Sprintf("http://localhost:%d", listenAt) {
				http.Error(w, "yasak", http.StatusForbidden)
				return
			}
		}
		h.ServeHTTP(w, r)
	})
}

func waitForPage() {
	const (
		tick     = 2 * time.Second
		idleStop = 30 * time.Second // sayfa bu kadar susarsa kapandı say
		firstMax = 3 * time.Minute  // sayfa hiç açılmadıysa boşuna bekleme
	)
	started := time.Now()
	ticker := time.NewTicker(tick)
	defer ticker.Stop()
	for {
		select {
		case <-quitCh:
			time.Sleep(300 * time.Millisecond)
			return
		case <-ticker.C:
		}
		pingMu.Lock()
		seen, last := pingSeen, lastPing
		pingMu.Unlock()
		if busyInstalling() {
			continue
		}
		if seen {
			if time.Since(last) > idleStop {
				return
			}
			continue
		}
		if time.Since(started) > firstMax && os.Getenv("BASKI_PENCERE_YOK") == "" {
			return
		}
	}
}

func quitSoon() {
	select {
	case quitCh <- struct{}{}:
	default:
	}
}

// ---------------------------------------------------------------- yardımcılar

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Cache-Control", "no-store")
	http.Error(w, msg, code)
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
	case ".ico":
		return "image/x-icon"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".woff2":
		return "font/woff2"
	case ".txt":
		return "text/plain; charset=utf-8"
	}
	return "application/octet-stream"
}

// ---------------------------------------------------------------- köprü

func shellAPI(w http.ResponseWriter, r *http.Request) {
	p := strings.TrimPrefix(r.URL.Path, "/__shell/")
	switch {
	case p == "info":
		writeJSON(w, map[string]any{
			"kind": "desktop", "app": appID, "version": appVersion, "shell": 2,
			"bundle": bundleVersion(), "dataDir": dataDir, "outDir": outDir,
			"port": listenAt, "fixedPort": fixed, "platform": runtime.GOOS,
			"tasima": migrationStatus(),
		})

	case p == "host.js":
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		fmt.Fprint(w, hostJS())

	case p == "ping":
		pingMu.Lock()
		lastPing = time.Now()
		pingSeen = true
		pingMu.Unlock()
		fmt.Fprint(w, "ok")

	case p == "save":
		var body struct{ Name, Data string }
		if err := json.NewDecoder(io.LimitReader(r.Body, 200<<20)).Decode(&body); err != nil {
			fail(w, http.StatusBadRequest, "bozuk istek")
			return
		}
		path, err := saveOut(body.Name, body.Data)
		if err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		revealInExplorer(path)
		fmt.Fprint(w, path)

	case p == "update":
		// Kabuk 1'in eski "bütün dosyalar JSON içinde" güncellemesi artık kullanılmaz (imzasız, SHA'sız).
		fail(w, http.StatusGone, "ESKI_GUNCELLEME_KAPALI")

	case p == "getir":
		getir(w, r)

	case p == "indir":
		download(w, r)

	case p == "guncelle/yama":
		installUpdate(w, r, true)

	case p == "guncelle/tam":
		installUpdate(w, r, false)

	case p == "guncelle/uygula":
		applyStaged(w)

	case p == "ac":
		var body struct{ URL string }
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body)
		u, err := url.Parse(body.URL)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			fail(w, http.StatusBadRequest, "URL_NOT_ALLOWED")
			return
		}
		openURL(u.String())
		fmt.Fprint(w, "ok")

	case p == "restart":
		fmt.Fprint(w, "ok") // sayfa kendini yeniler, sunucu etkin paketi verir

	case p == "kapat":
		closeWindow()
		fmt.Fprint(w, "ok")
		quitSoon()

	case strings.HasPrefix(p, "pencere/"):
		windowAPI(w, r, strings.TrimPrefix(p, "pencere/"))

	case p == "agent":
		agentAPI(w, r)

	case strings.HasPrefix(p, "kurtar/"):
		recoverAPI(w, r, strings.TrimPrefix(p, "kurtar/"))

	case p == "tasima":
		writeJSON(w, migrationStatus())

	default:
		fail(w, http.StatusNotFound, "yok")
	}
}

func getir(w http.ResponseWriter, r *http.Request) {
	/* Sayfa başka sitelere doğrudan erişemez (CORS). Kabuk onun adına okur. Yalnız https, 10 sn, 1 MB. */
	raw := r.URL.Query().Get("url")
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		fail(w, http.StatusBadRequest, "gecersiz adres")
		return
	}
	cli := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", u.String(), nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 BaskiHesabi/"+appVersion)
	req.Header.Set("Accept-Language", "tr,en;q=0.8,ar;q=0.6")
	resp, err := cli.Do(req)
	if err != nil {
		fail(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Kaynak-Durum", fmt.Sprint(resp.StatusCode))
	_, _ = io.Copy(w, io.LimitReader(resp.Body, 1<<20))
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
	return path, writeAtomic(path, raw)
}

// writeAtomic: geçici dosyaya yazar, diske işler, yerine taşır.
func writeAtomic(path string, data []byte) error {
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

// ---------------------------------------------------------------- Asistan Agent paylaşımı
// Aynı bilgisayardaki uygulamalar sayaçlarını %APPDATA%/FalconCekirdek/agent/*.json içinde paylaşır (yalnız sayılar).

func agentDir() string {
	base, err := os.UserConfigDir()
	if err != nil {
		base = dataDir
	}
	return filepath.Join(base, "FalconCekirdek", "agent")
}

func agentFile(key string) string {
	clean := strings.Map(func(r rune) rune {
		if r == '@' || r == '.' || r == '-' || r == '_' || (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			return r
		}
		return '_'
	}, key)
	if len(clean) > 120 {
		clean = clean[:120]
	}
	return filepath.Join(agentDir(), clean+".json")
}

func agentAPI(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		out := map[string]string{}
		ents, _ := os.ReadDir(agentDir())
		n := 0
		for _, e := range ents {
			if n >= 200 || !strings.HasSuffix(e.Name(), ".json") {
				continue
			}
			if b, err := os.ReadFile(filepath.Join(agentDir(), e.Name())); err == nil {
				out[strings.TrimSuffix(e.Name(), ".json")] = string(b)
				n++
			}
		}
		writeJSON(w, out)
	case http.MethodPost:
		var body struct {
			Key, JSON string
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&body); err != nil || body.Key == "" {
			fail(w, http.StatusBadRequest, "bozuk istek")
			return
		}
		if len(body.JSON) > 2e6 || !json.Valid([]byte(body.JSON)) {
			fail(w, http.StatusBadRequest, "TOO_BIG")
			return
		}
		_ = os.MkdirAll(agentDir(), 0o755)
		if err := writeAtomic(agentFile(body.Key), []byte(body.JSON)); err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, true)
	case http.MethodDelete:
		_ = os.Remove(agentFile(r.URL.Query().Get("key")))
		writeJSON(w, true)
	default:
		fail(w, http.StatusMethodNotAllowed, "yok")
	}
}
