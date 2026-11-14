// Package middleware provides HTTP middleware shared by all routes.
package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/google/uuid"

	"github.com/Breee/Wedwise/internal/httpx"
)

type contextKey string

const requestIDContextKey contextKey = "wedwise.request_id"

// RequestIDHeader is the header carrying the request identifier.
const RequestIDHeader = "X-Request-Id"

// RequestIDFrom returns the request id stored in the context.
func RequestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(requestIDContextKey).(string)
	return id
}

// RequestID assigns a request identifier to every request.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(RequestIDHeader)
		if id == "" || len(id) > 64 {
			id = uuid.NewString()
		}
		w.Header().Set(RequestIDHeader, id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDContextKey, id)))
	})
}

type responseRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (rec *responseRecorder) WriteHeader(status int) {
	if rec.status == 0 {
		rec.status = status
	}
	rec.ResponseWriter.WriteHeader(status)
}

func (rec *responseRecorder) Write(b []byte) (int, error) {
	if rec.status == 0 {
		rec.status = http.StatusOK
	}
	n, err := rec.ResponseWriter.Write(b)
	rec.bytes += n
	return n, err
}

func (rec *responseRecorder) Flush() {
	if flusher, ok := rec.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// Logging writes a structured log line for every request.
func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &responseRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		if rec.status == 0 {
			rec.status = http.StatusOK
		}
		slog.Info("http request",
			"requestId", RequestIDFrom(r.Context()),
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"bytes", rec.bytes,
			"duration", time.Since(start).String(),
			"remote", r.RemoteAddr,
		)
	})
}

// Recoverer converts panics into 500 responses.
func Recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic recovered",
					"requestId", RequestIDFrom(r.Context()),
					"panic", rec,
					"stack", string(debug.Stack()),
				)
				httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "An unexpected error occurred.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// contentSecurityPolicy allows the app itself plus the map tiles and the
// public router fallback. Fonts are self-hosted. Images load from the app and
// from the hosts the operator lists. Style attributes are refused; the style
// elements some UI libraries inject are still allowed.
func contentSecurityPolicy(imageHosts []string) string {
	images := "img-src 'self' data: blob:"
	for _, host := range imageHosts {
		images += " " + host
	}
	return "default-src 'self'; " +
		"script-src 'self'; " +
		"style-src 'self' 'unsafe-inline'; " +
		"style-src-attr 'none'; " +
		"font-src 'self'; " +
		images + "; " +
		"connect-src 'self' https://tiles.openfreemap.org https://routing.openstreetmap.de; " +
		"worker-src 'self' blob:; " +
		"manifest-src 'self'; " +
		"object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
}

// SecurityHeaders sets conservative security headers on every response.
// imageHosts are the extra origins images may load from.
func SecurityHeaders(imageHosts []string) func(http.Handler) http.Handler {
	policy := contentSecurityPolicy(imageHosts)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := w.Header()
			header.Set("X-Content-Type-Options", "nosniff")
			header.Set("X-Frame-Options", "DENY")
			header.Set("Referrer-Policy", "same-origin")
			header.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
			header.Set("Content-Security-Policy", policy)
			header.Set("Cross-Origin-Opener-Policy", "same-origin")
			header.Set("Cross-Origin-Resource-Policy", "same-origin")
			if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
				header.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

// NoStore keeps API responses out of browser and proxy caches. Handlers that
// serve public, cacheable data set their own Cache-Control.
func NoStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// LimitBody restricts the size of request bodies.
func LimitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Uploads enforce their own, larger limit.
		if r.URL.Path != "/api/uploads" {
			r.Body = http.MaxBytesReader(w, r.Body, httpx.MaxBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}
