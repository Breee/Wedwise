package songs

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSearchProxiesAndCaches(t *testing.T) {
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if got := r.URL.Query().Get("term"); got != "killers" {
			t.Errorf("term = %q", got)
		}
		w.Write([]byte(`{"results":[{"trackId":1,"trackName":"Mr. Brightside","artistName":"The Killers","artworkUrl60":"https://x/y.jpg"}]}`))
	}))
	defer upstream.Close()

	h := NewHandler()
	h.baseURL = upstream.URL

	for range 2 {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/songs?q=Killers", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d", rec.Code)
		}
		body := rec.Body.String()
		if !strings.Contains(body, "Mr. Brightside") || strings.Contains(body, "artworkUrl60") {
			t.Fatalf("unexpected body: %s", body)
		}
	}
	if calls != 1 {
		t.Fatalf("upstream calls = %d, want 1", calls)
	}
}

func TestSearchRejectsBadQueries(t *testing.T) {
	h := NewHandler()
	for _, q := range []string{"", "ab", strings.Repeat("x", 101)} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/songs?q="+q, nil))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("q=%q status = %d", q, rec.Code)
		}
	}
}

func TestSearchUpstreamFailure(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer upstream.Close()

	h := NewHandler()
	h.baseURL = upstream.URL
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/songs?q=abc", nil))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d", rec.Code)
	}
}
