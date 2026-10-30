package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func newTestLimiter(limit int, window time.Duration) (*Limiter, *time.Time) {
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	l := NewLimiter(limit, window)
	l.now = func() time.Time { return now }
	return l, &now
}

func TestLimiter_AllowsUpToLimitThenRejects(t *testing.T) {
	l, now := newTestLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		if ok, _ := l.Allow("a"); !ok {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
	ok, retry := l.Allow("a")
	if ok {
		t.Fatal("4th request should be rejected")
	}
	if retry != time.Minute {
		t.Fatalf("retryAfter = %s, want 1m", retry)
	}

	if ok, _ := l.Allow("b"); !ok {
		t.Fatal("other key must not be affected")
	}

	*now = now.Add(time.Minute)
	if ok, _ := l.Allow("a"); !ok {
		t.Fatal("request after window expiry should be allowed")
	}
}

func TestLimiter_SweepsExpiredEntries(t *testing.T) {
	l, now := newTestLimiter(1, time.Minute)
	l.Allow("stale")
	*now = now.Add(2 * time.Minute)
	l.Allow("fresh")
	if _, ok := l.entries["stale"]; ok {
		t.Fatal("expired entry should have been swept")
	}
}

func TestRateLimit_Returns429WithRetryAfter(t *testing.T) {
	l, _ := newTestLimiter(1, 30*time.Second)
	handler := RateLimit(l, false)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	do := func(remote string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/login", nil)
		req.RemoteAddr = remote
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	if rec := do("10.0.0.1:1234"); rec.Code != http.StatusNoContent {
		t.Fatalf("first request status = %d", rec.Code)
	}
	rec := do("10.0.0.1:9999")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("second request status = %d, want 429", rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got != "31" {
		t.Fatalf("Retry-After = %q, want 31", got)
	}
	if rec := do("10.0.0.2:1234"); rec.Code != http.StatusNoContent {
		t.Fatalf("different IP status = %d", rec.Code)
	}
}

func TestClientIP(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "192.0.2.10:443"
	req.Header.Set("X-Forwarded-For", "203.0.113.5, 198.51.100.7")

	if got := ClientIP(req, false); got != "192.0.2.10" {
		t.Fatalf("untrusted proxy: got %q", got)
	}
	if got := ClientIP(req, true); got != "198.51.100.7" {
		t.Fatalf("trusted proxy: got %q", got)
	}

	req.Header.Set("X-Forwarded-For", "garbage")
	if got := ClientIP(req, true); got != "192.0.2.10" {
		t.Fatalf("invalid header must fall back to peer: got %q", got)
	}
}
