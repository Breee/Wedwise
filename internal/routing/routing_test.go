package routing

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/Breee/Wedwise/internal/database"
)

func upstream(t *testing.T, calls *int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls++
		if r.Header.Get("Authorization") != "secret" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if r.URL.Path != "/v2/directions/foot-walking/geojson" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte(`{"features":[{"geometry":{"coordinates":[[7.85,47.99],[7.87,47.98]]},"properties":{"summary":{"distance":750,"duration":590}}}]}`))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func get(h *Handler, query string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/route?"+query, nil))
	return rec
}

func TestRouteProxiesAndCaches(t *testing.T) {
	calls := 0
	h := NewHandler("secret", nil)
	h.baseURL = upstream(t, &calls).URL

	const query = "profile=foot&from=7.85,47.99&to=7.87,47.98"
	rec := get(h, query)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}
	var route Route
	if err := json.Unmarshal(rec.Body.Bytes(), &route); err != nil {
		t.Fatal(err)
	}
	if route.Minutes != 10 || route.Meters != 750 || len(route.Coords) != 2 {
		t.Fatalf("unexpected route %+v", route)
	}

	if rec := get(h, query); rec.Code != http.StatusOK {
		t.Fatalf("cached status = %d", rec.Code)
	}
	if calls != 1 {
		t.Fatalf("upstream calls = %d, want 1", calls)
	}
}

func TestRouteDisabledWithoutKey(t *testing.T) {
	if rec := get(NewHandler("", nil), "profile=foot&from=7.85,47.99&to=7.87,47.98"); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestRouteValidation(t *testing.T) {
	calls := 0
	h := NewHandler("secret", nil)
	h.baseURL = upstream(t, &calls).URL

	for _, query := range []string{
		"profile=plane&from=7.85,47.99&to=7.87,47.98",
		"profile=foot&from=7.85&to=7.87,47.98",
		"profile=foot&from=7.85,47.99&to=x,y",
		"profile=foot&from=200,47.99&to=7.87,47.98",
	} {
		if rec := get(h, query); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", query, rec.Code)
		}
	}
	if calls != 0 {
		t.Fatalf("upstream called %d times for invalid input", calls)
	}
}

func TestRouteUpstreamFailure(t *testing.T) {
	calls := 0
	h := NewHandler("wrong", nil)
	h.baseURL = upstream(t, &calls).URL

	rec := get(h, "profile=foot&from=7.85,47.99&to=7.87,47.98")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
}

func TestRouteCacheSurvivesRestart(t *testing.T) {
	db, err := database.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := database.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}

	calls := 0
	srv := upstream(t, &calls)
	const query = "profile=foot&from=7.85,47.99&to=7.87,47.98"
	for range 2 {
		h := NewHandler("secret", db)
		h.baseURL = srv.URL
		if rec := get(h, query); rec.Code != http.StatusOK {
			t.Fatalf("status = %d", rec.Code)
		}
	}
	if calls != 1 {
		t.Fatalf("upstream calls = %d, want 1", calls)
	}
}

func TestWarmFillsTheCache(t *testing.T) {
	calls := 0
	h := NewHandler("secret", nil)
	h.baseURL = upstream(t, &calls).URL
	h.warmPause = 0

	h.Warm([]Leg{{Profile: "foot", From: [2]float64{7.85, 47.99}, To: [2]float64{7.87, 47.98}}})
	deadline := time.Now().Add(2 * time.Second)
	for {
		h.mu.Lock()
		filled := len(h.cache)
		h.mu.Unlock()
		if filled == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("route was not warmed")
		}
		time.Sleep(10 * time.Millisecond)
	}

	if rec := get(h, "profile=foot&from=7.85,47.99&to=7.87,47.98"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if calls != 1 {
		t.Fatalf("upstream calls = %d, want 1", calls)
	}
}

func TestPlaces(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/geocode/search" || r.Header.Get("Authorization") != "secret" ||
			r.URL.Query().Get("text") != "Musikhochschule" || r.URL.Query().Get("focus.point.lon") != "7.87" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		_, _ = w.Write([]byte(`{"features":[{"geometry":{"coordinates":[7.873,47.988]},"properties":{"name":"Musikhochschule","label":"Musikhochschule, Freiburg"}},{"geometry":{"coordinates":[]}}]}`))
	}))
	t.Cleanup(srv.Close)
	h := NewHandler("secret", nil)
	h.baseURL = srv.URL

	search := func(h *Handler, query string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.Places(rec, httptest.NewRequest(http.MethodGet, "/api/places?"+query, nil))
		return rec
	}

	rec := search(h, "q=Musikhochschule&near=7.87,47.98")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body struct{ Places []Place }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Places) != 1 || body.Places[0].Lat != 47.988 || body.Places[0].Label != "Musikhochschule, Freiburg" {
		t.Fatalf("places = %+v", body.Places)
	}
	if rec := search(h, "q=ab"); rec.Code != http.StatusBadRequest {
		t.Fatalf("short query status = %d", rec.Code)
	}
	if rec := search(h, "q=Unbekannt"); rec.Code != http.StatusBadGateway {
		t.Fatalf("upstream failure status = %d", rec.Code)
	}
	if rec := search(NewHandler("", nil), "q=Musikhochschule"); rec.Code != http.StatusNotFound {
		t.Fatalf("disabled status = %d", rec.Code)
	}
}
