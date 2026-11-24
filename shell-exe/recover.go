package main

// Eski oturumların kayıtlarını kurtarma.
//
// Kabuk 1 her açılışta rastgele bir port kullanıyordu; IndexedDB kökene (porta) bağlı olduğundan her
// oturumun kayıtları profilde ayrı bir klasörde kaldı:  pencere/Default/IndexedDB/http_127.0.0.1_<port>.indexeddb.leveldb
// Bu klasörler SİLİNMEZ. Arayüz (app/js/kurtarma.js) her açılışta henüz birleştirilmemiş portları sorar; kabuk o
// portlarda geçici olarak küçük bir sayfa sunar; arayüz bu sayfayı görünmez bir çerçevede açar (aynı site → aynı
// depolama), sayfa eski kayıtları okuyup (DEĞİŞTİRMEDEN) ana sayfaya gönderir, ana sayfa birleştirir.
// Birleştirilen portlar BaskiHesabi-veri/kurtarilan.json dosyasına yazılır.

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"sync"
	"time"
)

var (
	recMu        sync.Mutex
	recListeners = map[int]*http.Server{}
	idbRe        = regexp.MustCompile(`^http_127\.0\.0\.1_(\d+)\.indexeddb\.leveldb$`)
)

func profileDir() string { return filepath.Join(dataDir, "pencere") }

func recoveredFile() string { return filepath.Join(dataDir, "kurtarilan.json") }

func readRecovered() map[int]string {
	out := map[int]string{}
	b, err := os.ReadFile(recoveredFile())
	if err != nil {
		return out
	}
	var m map[string]string
	if json.Unmarshal(b, &m) == nil {
		for k, v := range m {
			if p, err := strconv.Atoi(k); err == nil {
				out[p] = v
			}
		}
	}
	return out
}

// oldPorts: profilde IndexedDB'si olan, bu oturumun portu dışındaki ve henüz birleştirilmemiş portlar.
func oldPorts() []int {
	done := readRecovered()
	out := []int{}
	for _, sub := range []string{filepath.Join("Default", "IndexedDB")} {
		ents, err := os.ReadDir(filepath.Join(profileDir(), sub))
		if err != nil {
			continue
		}
		for _, e := range ents {
			m := idbRe.FindStringSubmatch(e.Name())
			if m == nil {
				continue
			}
			p, _ := strconv.Atoi(m[1])
			if p <= 0 || p > 65535 || p == listenAt {
				continue
			}
			if _, ok := done[p]; ok {
				continue
			}
			out = append(out, p)
		}
	}
	sort.Ints(out)
	return out
}

const recoverFrame = `<!doctype html><meta charset="utf-8"><title>kurtarma</title><script>
(function () {
  var q = new URLSearchParams(location.search), ana = 'http://127.0.0.1:' + (q.get('ana') || '');
  function send(o) { o.kurtarma = 1; o.port = location.port; try { parent.postMessage(o, ana); } catch (e) {} }
  function fail(e) { send({ hata: String(e && (e.message || e.name) || e) }); }
  function read() {
    var r = indexedDB.open('baski-hesabi');
    var created = false;
    r.onupgradeneeded = function () { created = true; try { r.transaction.abort(); } catch (e) {} };
    r.onerror = function () { if (created) send({ yok: true }); else fail(r.error); };
    r.onsuccess = function () {
      var db = r.result, names = Array.prototype.slice.call(db.objectStoreNames), out = {}, left = names.length;
      if (!left) { db.close(); return send({ veri: out, surum: db.version }); }
      var tx = db.transaction(names, 'readonly');
      names.forEach(function (n) {
        var g = tx.objectStore(n).getAll();
        g.onsuccess = function () { out[n] = g.result || []; if (--left === 0) { db.close(); send({ veri: out, surum: db.version }); } };
        g.onerror = function () { fail(g.error); };
      });
    };
  }
  try {
    if (indexedDB.databases) indexedDB.databases().then(function (l) {
      if (!l.some(function (d) { return d.name === 'baski-hesabi'; })) send({ yok: true }); else read();
    }, read);
    else read();
  } catch (e) { fail(e); }
})();
</script>`

func recoverAPI(w http.ResponseWriter, r *http.Request, op string) {
	switch op {
	case "liste":
		writeJSON(w, map[string]any{"portlar": oldPorts(), "ana": listenAt, "sabit": fixed})

	case "dinle":
		var body struct{ Portlar []int }
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
			fail(w, http.StatusBadRequest, "bozuk istek")
			return
		}
		valid := map[int]bool{}
		for _, p := range oldPorts() {
			valid[p] = true
		}
		var open []int
		for _, p := range body.Portlar {
			if !valid[p] {
				continue
			}
			if startRecoveryListener(p) {
				open = append(open, p)
			}
		}
		writeJSON(w, map[string]any{"acik": open})

	case "bitti":
		var body struct {
			Portlar []int
			Kapat   []int
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
			fail(w, http.StatusBadRequest, "bozuk istek")
			return
		}
		recMu.Lock()
		done := readRecovered()
		now := time.Now().UTC().Format(time.RFC3339)
		for _, p := range body.Portlar {
			done[p] = now
		}
		m := map[string]string{}
		for k, v := range done {
			m[strconv.Itoa(k)] = v
		}
		b, _ := json.MarshalIndent(m, "", " ")
		err := writeAtomic(recoveredFile(), b)
		recMu.Unlock()
		for _, p := range append(body.Portlar, body.Kapat...) {
			stopRecoveryListener(p)
		}
		if err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, true)

	default:
		fail(w, http.StatusNotFound, "yok")
	}
}

func startRecoveryListener(port int) bool {
	recMu.Lock()
	defer recMu.Unlock()
	if recListeners[port] != nil {
		return true
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false // port başka bir programda; sonraki açılışta yeniden denenir
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/__kurtar/cerceve.html", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		fmt.Fprint(w, recoverFrame)
	})
	srv := &http.Server{Handler: localOnly(mux), ReadHeaderTimeout: 10 * time.Second}
	recListeners[port] = srv
	go srv.Serve(ln)
	// Unutulursa da kapanır.
	time.AfterFunc(3*time.Minute, func() { stopRecoveryListener(port) })
	return true
}

func stopRecoveryListener(port int) {
	recMu.Lock()
	srv := recListeners[port]
	delete(recListeners, port)
	recMu.Unlock()
	if srv != nil {
		_ = srv.Close()
	}
}
