package platformpath

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPIsolationAndDrain(t *testing.T) {
	a := NewAPI(NewLedger())
	h := a.Handler()
	for _, tc := range []struct {
		token, body string
		status      int
	}{
		{"", `{"user":"u1","request_id":"r1","amount":10}`, 401},
		{"lab-a-token", `{"namespace":"game-b","user":"u1","request_id":"r1","amount":10}`, 403},
		{"lab-a-token", `{"user":"u1","request_id":"r1","amount":10}`, 200},
		{"lab-a-token", `{"user":"u1","request_id":"r1","amount":20}`, 409},
		{"lab-a-token", `{"user":"u1","request_id":"r2","amount":10} {}`, 400},
	} {
		r := httptest.NewRequest("POST", "/rewards", strings.NewReader(tc.body))
		if tc.token != "" {
			r.Header.Set("Authorization", "Bearer "+tc.token)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("%d != %d: %s", w.Code, tc.status, w.Body.String())
		}
	}
	a.Drain()
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/readyz", nil))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/healthz", nil))
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
}
