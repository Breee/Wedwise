package server_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Breee/Wedwise/internal/configuration"
)

func TestSecurityHeaders(t *testing.T) {
	app, _ := newTestAppWithOptions(t, func(cfg *configuration.Config) {
		cfg.ImageHosts = []string{"https://photos.example.org"}
	})

	want := map[string]string{
		"X-Content-Type-Options":       "nosniff",
		"X-Frame-Options":              "DENY",
		"Referrer-Policy":              "same-origin",
		"Cross-Origin-Opener-Policy":   "same-origin",
		"Cross-Origin-Resource-Policy": "same-origin",
	}
	for _, path := range []string{"/", "/api/content/public", "/healthz"} {
		resp := app.do(http.MethodGet, path, nil, nil)
		resp.Body.Close()
		for name, value := range want {
			if got := resp.Header.Get(name); got != value {
				t.Errorf("%s: %s = %q, want %q", path, name, got, value)
			}
		}
		csp := resp.Header.Get("Content-Security-Policy")
		for _, part := range []string{
			"default-src 'self'",
			"script-src 'self';",
			"style-src-attr 'none'",
			"img-src 'self' data: blob: https://photos.example.org;",
			"object-src 'none'",
			"frame-ancestors 'none'",
		} {
			if !strings.Contains(csp, part) {
				t.Errorf("%s: policy lacks %q: %s", path, part, csp)
			}
		}
		if strings.Contains(csp, "https:;") || strings.Contains(csp, "'unsafe-eval'") {
			t.Errorf("%s: policy too wide: %s", path, csp)
		}
	}
}

func TestAPIResponsesAreNotStored(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	cookie, _ := app.login("couple_user", "TestPass123!")

	for _, path := range []string{"/api/auth/me", "/api/responses/", "/api/rsvp-summary", "/api/content", "/api/invite-links/"} {
		resp := app.do(http.MethodGet, path, nil, cookie)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("%s: status %d", path, resp.StatusCode)
		}
		if got := resp.Header.Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s: Cache-Control = %q, want no-store", path, got)
		}
	}
}

func TestImageHostsValidated(t *testing.T) {
	for _, host := range []string{"http://photos.example.org", "photos.example.org", "https://photos.example.org/path", "https:"} {
		cfg := configuration.Default()
		cfg.SessionSecret = "test-secret-32-bytes-long-padding"
		cfg.DataKey = testDataKey
		cfg.ImageHosts = []string{host}
		if err := cfg.Validate(); err == nil || !strings.Contains(err.Error(), "imageHosts") {
			t.Errorf("%q: got %v, want an imageHosts error", host, err)
		}
	}
}
