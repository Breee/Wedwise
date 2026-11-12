package middleware

import (
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Breee/Wedwise/internal/httpx"
)

// Limiter is a fixed-window request counter keyed by an arbitrary string.
// It is intended for a single process and keeps its state in memory.
type Limiter struct {
	limit  int
	window time.Duration
	now    func() time.Time

	mu      sync.Mutex
	entries map[string]*windowEntry
	sweep   time.Time
}

type windowEntry struct {
	count int
	reset time.Time
}

// NewLimiter allows at most limit requests per key within each window.
func NewLimiter(limit int, window time.Duration) *Limiter {
	return &Limiter{
		limit:   limit,
		window:  window,
		now:     time.Now,
		entries: make(map[string]*windowEntry),
	}
}

// Allow records a request for key and reports whether it is within the limit.
// When the request is rejected it also returns how long to wait before the
// window resets.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	now := l.now()

	l.mu.Lock()
	defer l.mu.Unlock()

	l.sweepLocked(now)

	entry, ok := l.entries[key]
	if !ok || !now.Before(entry.reset) {
		l.entries[key] = &windowEntry{count: 1, reset: now.Add(l.window)}
		return true, 0
	}
	if entry.count >= l.limit {
		return false, entry.reset.Sub(now)
	}
	entry.count++
	return true, 0
}

// Blocked reports whether key has used up its limit, without recording a
// request. It lets callers count only failures via Allow.
func (l *Limiter) Blocked(key string) (bool, time.Duration) {
	now := l.now()

	l.mu.Lock()
	defer l.mu.Unlock()

	entry, ok := l.entries[key]
	if !ok || !now.Before(entry.reset) || entry.count < l.limit {
		return false, 0
	}
	return true, entry.reset.Sub(now)
}

// sweepLocked drops expired windows at most once per window to bound memory.
func (l *Limiter) sweepLocked(now time.Time) {
	if now.Before(l.sweep) {
		return
	}
	l.sweep = now.Add(l.window)
	for key, entry := range l.entries {
		if !now.Before(entry.reset) {
			delete(l.entries, key)
		}
	}
}

// RateLimit rejects requests exceeding the limiter with 429 Too Many Requests.
// Requests are keyed by client IP; trustProxy controls whether the
// X-Forwarded-For header set by a reverse proxy is honoured.
func RateLimit(limiter *Limiter, trustProxy bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := ClientIP(r, trustProxy)
			ok, retryAfter := limiter.Allow(ip)
			if !ok {
				seconds := int(retryAfter.Seconds()) + 1
				w.Header().Set("Retry-After", strconv.Itoa(seconds))
				slog.Warn("rate limit exceeded",
					"requestId", RequestIDFrom(r.Context()),
					"path", r.URL.Path,
					"remote", ip,
				)
				httpx.WriteError(w, http.StatusTooManyRequests, httpx.CodeTooManyRequests, "Too many requests. Please try again later.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ClientIP returns the IP address of the client. When trustProxy is set the
// last X-Forwarded-For hop (appended by the trusted reverse proxy) wins;
// otherwise the connection peer address is used so clients cannot spoof it.
func ClientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			parts := strings.Split(forwarded, ",")
			if ip := net.ParseIP(strings.TrimSpace(parts[len(parts)-1])); ip != nil {
				return ip.String()
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
