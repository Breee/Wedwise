package routing

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
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
	h := NewHandler("secret")
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
	if rec := get(NewHandler(""), "profile=foot&from=7.85,47.99&to=7.87,47.98"); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestRouteValidation(t *testing.T) {
	calls := 0
	h := NewHandler("secret")
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
	h := NewHandler("wrong")
	h.baseURL = upstream(t, &calls).URL

	rec := get(h, "profile=foot&from=7.85,47.99&to=7.87,47.98")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
}
