package songs

import (
	"net/http"
	"net/http/httptest"
	"net/url"
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
		w.Write([]byte(`{"results":[{"trackId":1,"trackName":"Mr. Brightside","artistName":"The Killers","artworkUrl60":"https://x/y.jpg","artworkUrl100":"https://is1-ssl.mzstatic.com/a/100x100bb.jpg"}]}`))
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
		if !strings.Contains(body, "Mr. Brightside") || strings.Contains(body, "artworkUrl60") ||
			!strings.Contains(body, `"cover":"/api/songs/cover?u=https%3A%2F%2Fis1-ssl.mzstatic.com%2Fa%2F200x200bb.jpg"`) {
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

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCoverOnlyFetchesAppleArt(t *testing.T) {
	h := NewHandler()
	fetched := ""
	h.covers.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
		fetched = r.URL.String()
		rec := httptest.NewRecorder()
		rec.Header().Set("Content-Type", "image/jpeg")
		rec.Write([]byte("jpeg"))
		return rec.Result(), nil
	})

	for _, bad := range []string{
		"", "http://is1-ssl.mzstatic.com/a.jpg", "https://example.com/a.jpg", "https://mzstatic.com.example.com/a.jpg",
		"https://127.0.0.1/a.jpg", "https://user@is1-ssl.mzstatic.com/a.jpg", "https://is1-ssl.mzstatic.com:8443/a.jpg",
	} {
		rec := httptest.NewRecorder()
		h.Cover(rec, httptest.NewRequest(http.MethodGet, "/api/songs/cover?u="+url.QueryEscape(bad), nil))
		if rec.Code != http.StatusBadRequest || fetched != "" {
			t.Fatalf("%q: status %d, fetched %q", bad, rec.Code, fetched)
		}
	}

	good := "https://is1-ssl.mzstatic.com/a/200x200bb.jpg"
	rec := httptest.NewRecorder()
	h.Cover(rec, httptest.NewRequest(http.MethodGet, "/api/songs/cover?u="+url.QueryEscape(good), nil))
	if rec.Code != http.StatusOK || fetched != good || rec.Header().Get("Content-Type") != "image/jpeg" || rec.Body.String() != "jpeg" {
		t.Fatalf("status %d, fetched %q, body %q", rec.Code, fetched, rec.Body.String())
	}
}
