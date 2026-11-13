package server_test

import (
	"context"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Breee/Wedwise/internal/configuration"
	"github.com/Breee/Wedwise/internal/database"
	"github.com/Breee/Wedwise/internal/middleware"
)

func TestLoginLockout(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	for i := 0; i < 5; i++ {
		if _, status := app.login("couple_user", "wrong-password"); status != http.StatusUnauthorized {
			t.Fatalf("attempt %d: got %d, want 401", i+1, status)
		}
	}
	// Locked now, even with the right password.
	resp := app.do(http.MethodPost, "/api/auth/login",
		map[string]string{"username": "couple_user", "password": "TestPass123!"}, nil)
	resp.Body.Close()
	if resp.StatusCode != http.StatusTooManyRequests || resp.Header.Get("Retry-After") == "" {
		t.Fatalf("locked account: got %d, Retry-After %q", resp.StatusCode, resp.Header.Get("Retry-After"))
	}
	// Other accounts are not affected.
	if _, status := app.login("witness_user", "TestPass123!"); status != http.StatusOK {
		t.Fatalf("other account: got %d", status)
	}
}

func TestLoginSuccessResetsFailures(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	for round := 0; round < 2; round++ {
		for i := 0; i < 4; i++ {
			app.login("couple_user", "wrong-password")
		}
		if _, status := app.login("couple_user", "TestPass123!"); status != http.StatusOK {
			t.Fatalf("round %d: got %d, want 200", round, status)
		}
	}
}

func TestRateLimitSurvivesRestart(t *testing.T) {
	_, dbPath := newTestAppWithUsers(t)
	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	first := middleware.NewStoredLimiter(db, "test", 3, time.Hour)
	for i := 0; i < 3; i++ {
		if ok, _ := first.Allow("203.0.113.7"); !ok {
			t.Fatalf("request %d rejected", i+1)
		}
	}
	// A new limiter, as after a restart, continues the count.
	second := middleware.NewStoredLimiter(db, "test", 3, time.Hour)
	if blocked, _ := second.Blocked("203.0.113.7"); !blocked {
		t.Fatal("limit forgotten after restart")
	}
	if ok, retry := second.Allow("203.0.113.7"); ok || retry <= 0 {
		t.Fatalf("request after restart allowed (retry %v)", retry)
	}
	if ok, _ := second.Allow("203.0.113.8"); !ok {
		t.Fatal("another client rejected")
	}
	if ok, _ := middleware.NewStoredLimiter(db, "other", 3, time.Hour).Allow("203.0.113.7"); !ok {
		t.Fatal("another scope rejected")
	}

	// The address itself is not stored.
	var keys string
	rows, err := db.QueryContext(context.Background(), `SELECT key FROM rate_limits`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		rows.Scan(&key)
		keys += key + "\n"
	}
	if strings.Contains(keys, "203.0.113") {
		t.Fatal("client address stored in plain text")
	}
	if raw, _ := os.ReadFile(dbPath); strings.Contains(string(raw), "203.0.113.7") {
		t.Fatal("client address found in database file")
	}
}

func TestProductionNeedsProxyChoice(t *testing.T) {
	cfg := configuration.Default()
	cfg.SessionSecret = "test-secret-32-bytes-long-padding"
	cfg.DataKey = testDataKey
	cfg.Environment = "production"
	if err := cfg.Validate(); err == nil || !strings.Contains(err.Error(), "trustProxyHeaders") {
		t.Fatalf("production without proxy choice accepted: %v", err)
	}
	for _, choice := range []bool{true, false} {
		cfg.TrustProxyHeaders = &choice
		if err := cfg.Validate(); err != nil {
			t.Fatalf("choice %v rejected: %v", choice, err)
		}
	}
	cfg.TrustProxyHeaders = nil
	cfg.Environment = "development"
	if err := cfg.Validate(); err != nil {
		t.Fatalf("development needs no choice: %v", err)
	}
}
