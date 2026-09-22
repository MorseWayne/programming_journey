package platformpath

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
)

type API struct {
	ledger *Ledger
	ready  atomic.Bool
}

func NewAPI(l *Ledger) *API { a := &API{ledger: l}; a.ready.Store(true); return a }
func (a *API) Drain()       { a.ready.Store(false) }
func (a *API) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	m.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if !a.ready.Load() {
			w.WriteHeader(503)
			return
		}
		w.WriteHeader(200)
	})
	m.HandleFunc("POST /rewards", a.reward)
	return m
}
func (a *API) reward(w http.ResponseWriter, r *http.Request) {
	if !a.ready.Load() {
		http.Error(w, "draining", 503)
		return
	}
	// Fixed demo credentials. A real service verifies an external identity.
	ns := ""
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		http.Error(w, "unauthorized", 401)
		return
	}
	switch strings.TrimPrefix(auth, "Bearer ") {
	case "lab-a-token":
		ns = "game-a"
	case "lab-b-token":
		ns = "game-b"
	default:
		http.Error(w, "unauthorized", 401)
		return
	}
	var request RewardRequest
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	d.DisallowUnknownFields()
	if err := d.Decode(&request); err != nil {
		http.Error(w, "invalid JSON", 400)
		return
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		http.Error(w, "only one JSON value allowed", 400)
		return
	}
	if request.Namespace != "" && request.Namespace != ns {
		http.Error(w, "tenant mismatch", 403)
		return
	}
	request.Namespace = ns
	result, err := a.ledger.Grant(request)
	if err != nil {
		code := 400
		if errors.Is(err, ErrConflict) {
			code = 409
		}
		http.Error(w, err.Error(), code)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}
