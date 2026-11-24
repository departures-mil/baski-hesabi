package main

// Taşınabilir sürümden kuruluma geçiş.
//
// Kabuk 1 taşınabilirdi: veriler exe'nin yanındaki BaskiHesabi-veri klasöründeydi (exe nereye konduysa: İndirilenler,
// Masaüstü…). Kurulumlu sürüm %LOCALAPPDATA%\Programs\BaskiHesabi altında çalışır ve kendi BaskiHesabi-veri'sini
// kullanır. İlk açılışta (kendi profili yoksa) eski taşınabilir klasörleri arar ve EN SON kullanılanın tarayıcı
// profilini kendi klasörüne KOPYALAR (önbellekler hariç). Eski klasör olduğu gibi kalır (silinmez).
// Eski pencere hâlâ açıksa (profil kilitli) kopyalamadan önce kapatılması istenir.
// Profil zaten varsa ve başka eski klasör bulunursa: yalnız eksik IndexedDB köken klasörleri eklenir.

import (
	"encoding/json"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type migration struct {
	Durum    string   `json:"durum"` // "yok" | "tamam" | "atlandi" | "hata" | "gerek-yok"
	Kaynak   string   `json:"kaynak,omitempty"`
	Diger    []string `json:"diger,omitempty"`
	Zaman    string   `json:"zaman,omitempty"`
	Hata     string   `json:"hata,omitempty"`
	Kopyalan int      `json:"kopyalanan,omitempty"`
}

var migrated migration

func migrationFile() string { return filepath.Join(dataDir, "tasima.json") }

func migrationStatus() migration { return migrated }

func readMigration() (migration, bool) {
	var m migration
	b, err := os.ReadFile(migrationFile())
	if err != nil {
		return m, false
	}
	return m, json.Unmarshal(b, &m) == nil
}

func saveMigration(m migration) {
	m.Zaman = time.Now().UTC().Format(time.RFC3339)
	migrated = m
	b, _ := json.MarshalIndent(m, "", " ")
	_ = writeAtomic(migrationFile(), b)
}

func migrateOnStart() {
	if os.Getenv("BASKI_TASIMA_YOK") != "" {
		migrated = migration{Durum: "gerek-yok"}
		return
	}
	if m, ok := readMigration(); ok && (m.Durum == "tamam" || m.Durum == "gerek-yok" || (m.Durum == "yok" && dirExists(profileDir()))) {
		migrated = m
		return
	}
	ownProfile := dirExists(profileDir())
	// Taşınabilir kullanım (exe eski klasöründe çalışıyor) → zaten kendi verisinde.
	if ownProfile && dirHasIDB(profileDir()) && !installedLayout() {
		saveMigration(migration{Durum: "gerek-yok"})
		return
	}
	cands := findPortableDataDirs()
	if len(cands) == 0 {
		if installedLayout() {
			saveMigration(migration{Durum: "yok"}) // bir dahaki açılışta yine bakılır
		} else {
			saveMigration(migration{Durum: "gerek-yok"})
		}
		return
	}
	src := cands[0]
	m := migration{Kaynak: src}
	for _, c := range cands[1:] {
		m.Diger = append(m.Diger, c)
	}
	srcProfile := filepath.Join(src, "pencere")
	for profileLocked(srcProfile) {
		if !askRetry("Baskı Hesabı — eski sürüm açık",
			"Eski Baskı Hesabı penceresi hâlâ açık.\n\nKayıtlarınızı yeni sürüme taşıyabilmek için eski pencereyi kapatın, sonra \"Yeniden Dene\"ye basın.\n\n(Vazgeçerseniz taşıma bir sonraki açılışta yeniden denenir.)\n\nEski klasör: "+src) {
			m.Durum = "atlandi"
			saveMigration(m)
			return
		}
	}
	var n int
	var err error
	if !dirExists(profileDir()) {
		n, err = copyProfile(srcProfile, profileDir())
	} else {
		n, err = copyMissingOrigins(srcProfile, profileDir())
	}
	if err != nil {
		m.Durum, m.Hata = "hata", err.Error()
		saveMigration(m)
		return
	}
	m.Durum, m.Kopyalan = "tamam", n
	saveMigration(m)
}

func dirExists(p string) bool { st, err := os.Stat(p); return err == nil && st.IsDir() }

func dirHasIDB(profile string) bool {
	ents, err := os.ReadDir(filepath.Join(profile, "Default", "IndexedDB"))
	if err != nil {
		return false
	}
	for _, e := range ents {
		if idbRe.MatchString(e.Name()) {
			return true
		}
	}
	return false
}

// installedLayout: NSIS kurulumu (uninstall.exe yanında) ya da %LOCALAPPDATA%\Programs altında.
func installedLayout() bool {
	if _, err := os.Stat(filepath.Join(exeDir, "Kaldir.exe")); err == nil {
		return true
	}
	la := os.Getenv("LOCALAPPDATA")
	return la != "" && strings.HasPrefix(strings.ToLower(exeDir), strings.ToLower(filepath.Join(la, "Programs")))
}

// profileLocked: Chromium çalışırken profildeki "lockfile"ı paylaşımsız açık tutar (Windows).
func profileLocked(profile string) bool {
	lf := filepath.Join(profile, "lockfile")
	if _, err := os.Stat(lf); err != nil {
		return false
	}
	f, err := os.OpenFile(lf, os.O_RDWR, 0)
	if err != nil {
		return true
	}
	f.Close()
	return false
}

// findPortableDataDirs: "BaskiHesabi-veri/pencere" içeren klasörler, en son kullanılan önce.
func findPortableDataDirs() []string {
	if v := os.Getenv("BASKI_ESKI_ARA"); v != "" {
		var rs []searchRoot
		for _, p := range filepath.SplitList(v) {
			rs = append(rs, searchRoot{p, 4})
		}
		return searchRoots(rs)
	}
	return searchRoots(searchRootList())
}

type searchRoot struct {
	path  string
	depth int
}

func searchRoots(roots []searchRoot) []string {
	own, _ := filepath.Abs(dataDir)
	seen := map[string]bool{}
	type hit struct {
		path string
		t    time.Time
	}
	var hits []hit
	deadline := time.Now().Add(8 * time.Second)
	skip := map[string]bool{"windows": true, "program files": true, "program files (x86)": true, "programdata": true,
		"appdata": true, "node_modules": true, "$recycle.bin": true, ".git": true, "system volume information": true, "pencere": true}
	var walk func(dir string, d int)
	walk = func(dir string, d int) {
		if d < 0 || time.Now().After(deadline) {
			return
		}
		ents, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, e := range ents {
			if !e.IsDir() {
				continue
			}
			name := e.Name()
			p := filepath.Join(dir, name)
			if name == "BaskiHesabi-veri" {
				abs, _ := filepath.Abs(p)
				if strings.EqualFold(abs, own) || seen[strings.ToLower(abs)] {
					continue
				}
				seen[strings.ToLower(abs)] = true
				if dirHasIDB(filepath.Join(abs, "pencere")) {
					hits = append(hits, hit{abs, lastUse(filepath.Join(abs, "pencere"))})
				}
				continue
			}
			if skip[strings.ToLower(name)] || strings.HasPrefix(name, ".") {
				continue
			}
			walk(p, d-1)
		}
	}
	for _, r := range roots {
		if r.path != "" {
			walk(r.path, r.depth)
		}
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].t.After(hits[j].t) })
	out := make([]string, len(hits))
	for i, h := range hits {
		out[i] = h.path
	}
	return out
}

func lastUse(profile string) time.Time {
	var t time.Time
	ents, _ := os.ReadDir(filepath.Join(profile, "Default", "IndexedDB"))
	for _, e := range ents {
		if info, err := e.Info(); err == nil && info.ModTime().After(t) {
			t = info.ModTime()
		}
	}
	return t
}

// Kopyalanmayan profil klasörleri (önbellekler; yeniden oluşur).
var skipCopy = map[string]bool{
	"cache": true, "code cache": true, "gpucache": true, "shadercache": true, "grshadercache": true,
	"graphitedawncache": true, "dawncache": true, "dawngraphitecache": true, "dawnwebgpucache": true,
	"cachestorage": true, "crashpad": true, "browsermetrics": true, "component_crx_cache": true,
	"extensions_crx_cache": true, "optimizationguidepredictionmodels": true,
}

var skipFiles = map[string]bool{"lockfile": true, "singletonlock": true, "singletoncookie": true, "singletonsocket": true}

func copyProfile(src, dst string) (int, error) {
	tmp := dst + ".tasiniyor"
	_ = os.RemoveAll(tmp)
	n := 0
	err := filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // okunamayan tek dosya taşımayı durdurmaz
		}
		rel, _ := filepath.Rel(src, p)
		if d.IsDir() {
			if skipCopy[strings.ToLower(d.Name())] && rel != "." {
				return fs.SkipDir
			}
			return os.MkdirAll(filepath.Join(tmp, rel), 0o755)
		}
		if skipFiles[strings.ToLower(d.Name())] || !d.Type().IsRegular() {
			return nil
		}
		if err := copyFile(p, filepath.Join(tmp, rel)); err != nil {
			return err
		}
		n++
		return nil
	})
	if err != nil {
		_ = os.RemoveAll(tmp)
		return 0, err
	}
	if err := os.Rename(tmp, dst); err != nil {
		return 0, err
	}
	return n, nil
}

// copyMissingOrigins: hedef profilde olmayan 127.0.0.1 IndexedDB köken klasörlerini ekler (var olana dokunmaz).
func copyMissingOrigins(src, dst string) (int, error) {
	sd := filepath.Join(src, "Default", "IndexedDB")
	dd := filepath.Join(dst, "Default", "IndexedDB")
	ents, err := os.ReadDir(sd)
	if err != nil {
		return 0, nil
	}
	_ = os.MkdirAll(dd, 0o755)
	n := 0
	for _, e := range ents {
		if !e.IsDir() || !idbRe.MatchString(e.Name()) || dirExists(filepath.Join(dd, e.Name())) {
			continue
		}
		c, err := copyProfile(filepath.Join(sd, e.Name()), filepath.Join(dd, e.Name()))
		if err != nil {
			return n, err
		}
		n += c
	}
	return n, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return nil // kilitli/okunamayan yan dosya (ör. günlük) atlanır
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	if err := out.Sync(); err != nil {
		out.Close()
		return err
	}
	if st, err := in.Stat(); err == nil {
		defer os.Chtimes(dst, st.ModTime(), st.ModTime())
	}
	return out.Close()
}
