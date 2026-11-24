package main

// Arayüz paketi (win-app kanalı): app.zip. Exe'ye gömülü paket + indirilen güncel paket
// (BaskiHesabi-veri/paket/app.zip). Hangisinin sürümü büyükse o sunulur. Yama (FCD1) etkin paketin
// BAYTLARINA uygulanır; CI'daki release asset'i gömülü paketle aynı dosyadır.

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"baskihesabi/fcd1"
)

//go:embed app.zip
var embeddedZip []byte

type bundle struct {
	raw     []byte
	files   map[string]*zip.File
	version string
	source  string // "gomulu" | "indirilen"
}

var (
	bundleMu   sync.RWMutex
	active     *bundle
	installing atomic.Bool
)

func busyInstalling() bool { return installing.Load() }

func paketDir() string { return filepath.Join(dataDir, "paket") }

func openBundle(raw []byte, source string) (*bundle, error) {
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return nil, err
	}
	b := &bundle{raw: raw, files: map[string]*zip.File{}, source: source}
	for _, f := range zr.File {
		b.files[f.Name] = f
	}
	if b.files["index.html"] == nil {
		return nil, errors.New("index.html yok")
	}
	sf := b.files["surum.json"]
	if sf == nil {
		return nil, errors.New("surum.json yok")
	}
	rc, err := sf.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	var s struct{ Version string }
	if err := json.NewDecoder(rc).Decode(&s); err != nil || parseVer(s.Version) == nil {
		return nil, errors.New("surum.json bozuk")
	}
	b.version = s.Version
	return b, nil
}

var verRe = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)$`)

func parseVer(v string) []int {
	m := verRe.FindStringSubmatch(strings.TrimSpace(v))
	if m == nil {
		return nil
	}
	out := make([]int, 3)
	for i := 0; i < 3; i++ {
		out[i], _ = strconv.Atoi(m[i+1])
	}
	return out
}

func cmpVer(a, b string) int {
	x, y := parseVer(a), parseVer(b)
	if x == nil || y == nil {
		return 0
	}
	for i := 0; i < 3; i++ {
		if x[i] != y[i] {
			if x[i] < y[i] {
				return -1
			}
			return 1
		}
	}
	return 0
}

// loadBundle: gömülü paket ile indirilmiş paketten sürümü büyük olanı etkin yapar.
func loadBundle() error {
	emb, err := openBundle(embeddedZip, "gomulu")
	if err != nil {
		return fmt.Errorf("gomulu paket: %w", err)
	}
	chosen := emb
	if raw, err := os.ReadFile(filepath.Join(paketDir(), "app.zip")); err == nil {
		if dl, err := openBundle(raw, "indirilen"); err == nil && cmpVer(dl.version, emb.version) > 0 {
			chosen = dl
		}
	}
	bundleMu.Lock()
	active = chosen
	bundleMu.Unlock()
	return nil
}

func bundleVersion() string {
	bundleMu.RLock()
	defer bundleMu.RUnlock()
	if active == nil {
		return ""
	}
	return active.version
}

func serveApp(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/")
	if name == "" {
		name = "index.html"
	}
	bundleMu.RLock()
	b := active
	bundleMu.RUnlock()
	f := b.files[name]
	if f == nil || strings.HasSuffix(name, "/") {
		fail(w, http.StatusNotFound, "yok")
		return
	}
	rc, err := f.Open()
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rc.Close()
	w.Header().Set("Content-Type", mimeOf(name))
	w.Header().Set("Cache-Control", "no-store")
	_, _ = io.Copy(w, rc)
}

// ---------------------------------------------------------------- indirme (CORS'suz, yalnız GitHub)

var allowedHost = regexp.MustCompile(`^(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com|raw\.githubusercontent\.com|codeload\.github\.com)$`)

func allowedURL(u *url.URL) bool { return u.Scheme == "https" && allowedHost.MatchString(u.Hostname()) }

func download(w http.ResponseWriter, r *http.Request) {
	u, err := url.Parse(r.URL.Query().Get("url"))
	if err != nil || !allowedURL(u) {
		fail(w, http.StatusBadRequest, "URL_NOT_ALLOWED")
		return
	}
	cli := &http.Client{
		Timeout: 30 * time.Minute,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 10 || !allowedURL(req.URL) {
				return errors.New("URL_NOT_ALLOWED")
			}
			return nil
		},
	}
	req, _ := http.NewRequestWithContext(r.Context(), "GET", u.String(), nil)
	req.Header.Set("User-Agent", "BaskiHesabi/"+appVersion)
	req.Header.Set("Cache-Control", "no-cache")
	resp, err := cli.Do(req)
	if err != nil {
		fail(w, http.StatusBadGateway, "NET_ERROR")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		fail(w, resp.StatusCode, fmt.Sprintf("HTTP_%d", resp.StatusCode))
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	if resp.ContentLength >= 0 {
		w.Header().Set("X-Toplam", strconv.FormatInt(resp.ContentLength, 10))
		w.Header().Set("Content-Length", strconv.FormatInt(resp.ContentLength, 10))
	}
	_, _ = io.Copy(w, resp.Body)
}

// ---------------------------------------------------------------- kurulum

type updateMeta struct {
	Version      string `json:"version"`
	Channel      string `json:"channel"`
	TargetSha256 string `json:"targetSha256"`
	TargetSize   int64  `json:"targetSize"`
	File         string `json:"file"`
	PatchSha256  string `json:"patchSha256"`
	Deferred     bool   `json:"deferred"` // otomatik güncelleme: yalnız hazırla, program kapanınca / bir sonraki açılışta geçerli olsun
}

func shaHex(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }

func isSetup(m updateMeta) bool {
	return strings.Contains(strings.ToLower(m.Channel), "setup") || strings.HasSuffix(strings.ToLower(m.File), ".exe")
}

func installUpdate(w http.ResponseWriter, r *http.Request, patch bool) {
	if r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "yok")
		return
	}
	var meta updateMeta
	mraw, _ := url.QueryUnescape(r.Header.Get("X-Meta"))
	if err := json.Unmarshal([]byte(mraw), &meta); err != nil || !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(strings.ToLower(meta.TargetSha256)) {
		fail(w, http.StatusBadRequest, "BAD_META")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 300<<20))
	if err != nil {
		fail(w, http.StatusBadRequest, "BAD_BODY")
		return
	}
	installing.Store(true)
	defer installing.Store(false)

	if !patch && isSetup(meta) {
		if err := runSetup(body, meta); err != nil {
			fail(w, http.StatusInternalServerError, errCode(err))
			return
		}
		if meta.Deferred {
			fmt.Fprint(w, "staged")
			return
		}
		fmt.Fprint(w, "restarting")
		return
	}

	var out []byte
	if patch {
		if meta.PatchSha256 != "" && shaHex(body) != strings.ToLower(meta.PatchSha256) {
			fail(w, http.StatusBadRequest, "BAD_HASH")
			return
		}
		bundleMu.RLock()
		src := active.raw
		bundleMu.RUnlock()
		out, err = fcd1.Apply(src, body)
		if err != nil {
			fail(w, http.StatusConflict, errCode(err))
			return
		}
	} else {
		out = body
	}
	if err := stageBundle(out, meta); err != nil {
		fail(w, http.StatusInternalServerError, errCode(err))
		return
	}
	if meta.Deferred {
		fmt.Fprint(w, "staged")
		return
	}
	fmt.Fprint(w, "restarting")
}

func errCode(err error) string {
	s := err.Error()
	if regexp.MustCompile(`^[A-Z_0-9]+$`).MatchString(s) {
		return s
	}
	return "ERR: " + s
}

// stageBundle: SHA-256 + zip denetimi → paket/app.zip (atomik); önceki paket app.zip.bak olarak kalır.
func stageBundle(out []byte, meta updateMeta) error {
	if shaHex(out) != strings.ToLower(meta.TargetSha256) {
		return errors.New("BAD_HASH")
	}
	if meta.TargetSize > 0 && int64(len(out)) != meta.TargetSize {
		return errors.New("BAD_SIZE")
	}
	nb, err := openBundle(out, "indirilen")
	if err != nil {
		return errors.New("BAD_BUNDLE")
	}
	if err := os.MkdirAll(paketDir(), 0o755); err != nil {
		return errors.New("NO_WRITE")
	}
	dst := filepath.Join(paketDir(), "app.zip")
	if old, err := os.ReadFile(dst); err == nil {
		_ = writeAtomic(dst+".bak", old)
	}
	if err := writeAtomic(dst, out); err != nil {
		return errors.New("NO_WRITE")
	}
	if chk, err := os.ReadFile(dst); err != nil || shaHex(chk) != shaHex(out) {
		return errors.New("STAGE_VERIFY")
	}
	if meta.Deferred { // yeni paket diske yazıldı; bir sonraki açılışta (ya da Güncelle → uygula) etkin olur
		stagedMu.Lock()
		stagedBundle = nb
		stagedMu.Unlock()
		return nil
	}
	bundleMu.Lock()
	active = nb
	bundleMu.Unlock()
	return nil
}

var (
	stagedMu     sync.Mutex
	stagedBundle *bundle // hazır (arka planda indirilmiş) arayüz paketi
	pendingSetup string  // hazır kurulum exe'si: program kapanınca sessiz kurulur
)

// applyStaged: Güncelle → hazır güncellemeyi hemen uygular. Döner "restarting" (paket: sayfa yenilenir; kurulum: program kapanır).
func applyStaged(w http.ResponseWriter) {
	stagedMu.Lock()
	nb, ps := stagedBundle, pendingSetup
	stagedBundle, pendingSetup = nil, ""
	stagedMu.Unlock()
	switch {
	case ps != "":
		if err := startSetupHelper(ps, true); err != nil {
			fail(w, http.StatusInternalServerError, "SETUP_START_FAILED")
			return
		}
		go func() { time.Sleep(700 * time.Millisecond); closeWindow(); quitSoon() }()
		fmt.Fprint(w, "setup")
	case nb != nil:
		bundleMu.Lock()
		active = nb
		bundleMu.Unlock()
		fmt.Fprint(w, "restarting")
	default:
		fail(w, http.StatusConflict, "NOTHING_STAGED")
	}
}

// applyOnExit: program kapanırken hazır kurulumu sessiz çalıştırır (program yeniden açılmaz).
func applyOnExit() {
	stagedMu.Lock()
	ps := pendingSetup
	pendingSetup = ""
	stagedMu.Unlock()
	if ps != "" {
		_ = startSetupHelper(ps, false)
	}
}

// startSetupHelper: kurulumu SESSİZ (/S) ve penceresiz çalıştırır. Kurulum program dosyasını değiştireceği için bekleyici,
// programın geçici klasöre kopyalanmış hâlidir (--kur): program kapanınca kurulumu bekler, ac → bitince programı açar.
func startSetupHelper(setup string, ac bool) error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	tmp := filepath.Join(filepath.Dir(setup), "bekleyici.exe")
	if b, err := os.ReadFile(self); err == nil && os.WriteFile(tmp, b, 0o755) == nil {
		self = tmp
	}
	args := []string{"--kur", setup, "--pid", strconv.Itoa(os.Getpid())}
	if ac {
		args = append(args, "--ac", filepath.Join(exeDir, filepath.Base(os.Args[0])))
	}
	return startDetached(exec.Command(self, args...))
}

// helperMain: "--kur" kipinde çalışır (pencere yok): bekle → kurulum /S → (isteğe bağlı) programı aç.
func helperMain(args []string) bool {
	var setup, ac string
	pid := 0
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--kur":
			if i+1 < len(args) {
				setup = args[i+1]
				i++
			}
		case "--pid":
			if i+1 < len(args) {
				pid, _ = strconv.Atoi(args[i+1])
				i++
			}
		case "--ac":
			if i+1 < len(args) {
				ac = args[i+1]
				i++
			}
		}
	}
	if setup == "" {
		return false
	}
	waitPid(pid, 60*time.Second)
	cmd := exec.Command(setup, "/S")
	hideWindow(cmd)
	_ = cmd.Run()
	if ac != "" {
		if _, err := os.Stat(ac); err == nil {
			_ = startDetached(exec.Command(ac))
		}
	}
	return true
}

// runSetup: win-setup kanalı — NSIS kurulumu doğrulanır, geçici klasöre yazılır, çalıştırılır, program kapanır.
func runSetup(buf []byte, meta updateMeta) error {
	if shaHex(buf) != strings.ToLower(meta.TargetSha256) {
		return errors.New("BAD_HASH")
	}
	if meta.TargetSize > 0 && int64(len(buf)) != meta.TargetSize {
		return errors.New("BAD_SIZE")
	}
	name := regexp.MustCompile(`[^\w.-]`).ReplaceAllString(filepath.Base(meta.File), "_")
	if !strings.HasSuffix(strings.ToLower(name), ".exe") {
		name += ".exe"
	}
	dir := filepath.Join(os.TempDir(), fmt.Sprintf("baski-hesabi-kurulum-%d", os.Getpid()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return errors.New("NO_WRITE")
	}
	exe := filepath.Join(dir, name)
	if err := writeAtomic(exe, buf); err != nil {
		return errors.New("NO_WRITE")
	}
	if chk, err := os.ReadFile(exe); err != nil || shaHex(chk) != shaHex(buf) {
		return errors.New("STAGE_VERIFY")
	}
	if meta.Deferred {
		stagedMu.Lock()
		pendingSetup = exe
		stagedMu.Unlock()
		return nil
	}
	if err := startSetupHelper(exe, true); err != nil {
		return errors.New("SETUP_START_FAILED")
	}
	go func() {
		time.Sleep(700 * time.Millisecond)
		closeWindow()
		quitSoon()
	}()
	return nil
}
