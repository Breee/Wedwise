package server_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"

	"github.com/Breee/Wedwise/internal/configuration"
)

// sessionCookie returns the session cookie a response sets, if any.
func sessionCookie(resp *http.Response) *http.Cookie {
	for _, c := range resp.Cookies() {
		if strings.HasSuffix(c.Name, "wedwise_session") {
			return c
		}
	}
	return nil
}

func (a *testApp) authenticated(cookie *http.Cookie) bool {
	a.t.Helper()
	resp := a.do(http.MethodGet, "/api/auth/me", nil, cookie)
	defer resp.Body.Close()
	var me struct{ Authenticated bool }
	json.NewDecoder(resp.Body).Decode(&me)
	return me.Authenticated
}

func execDB(t *testing.T, dbPath, query string, args ...any) {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(query, args...); err != nil {
		t.Fatal(err)
	}
}

func TestSessionListAndRevoke(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	here, _ := app.login("couple_user", "TestPass123!")
	there, _ := app.login("couple_user", "TestPass123!")
	other, _ := app.login("witness_user", "TestPass123!")

	// The cookie value is a secret: only its hash is stored.
	for _, name := range []string{dbPath, dbPath + "-wal"} {
		if data, err := os.ReadFile(name); err == nil && bytes.Contains(data, []byte(here.Value)) {
			t.Fatalf("%s contains a session id", name)
		}
	}

	if resp := app.do(http.MethodGet, "/api/auth/sessions", nil, nil); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous list: %d", resp.StatusCode)
	}
	list := func(cookie *http.Cookie) (ids []string, current string) {
		resp := app.do(http.MethodGet, "/api/auth/sessions", nil, cookie)
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("list: %d", resp.StatusCode)
		}
		var body struct {
			Sessions []struct {
				ID      string
				Current bool
			}
		}
		json.NewDecoder(resp.Body).Decode(&body)
		for _, s := range body.Sessions {
			if s.ID == here.Value || s.ID == there.Value {
				t.Fatal("list exposes a session cookie value")
			}
			ids = append(ids, s.ID)
			if s.Current {
				current = s.ID
			}
		}
		return ids, current
	}
	ids, current := list(here)
	if len(ids) != 2 || current == "" {
		t.Fatalf("sessions: %v current %q", ids, current)
	}

	// Another user's session cannot be ended.
	_, witnessSession := list(other)
	resp := app.do(http.MethodDelete, "/api/auth/sessions/"+witnessSession, nil, here)
	resp.Body.Close()
	if !app.authenticated(other) {
		t.Fatal("ended a foreign session")
	}

	resp = app.do(http.MethodDelete, "/api/auth/sessions", nil, here)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("end others: %d", resp.StatusCode)
	}
	if app.authenticated(there) || !app.authenticated(here) || !app.authenticated(other) {
		t.Fatal("log out everywhere must end exactly the user's other sessions")
	}

	resp = app.do(http.MethodDelete, "/api/auth/sessions/"+current, nil, here)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("end session: %d", resp.StatusCode)
	}
	if app.authenticated(here) {
		t.Fatal("ended session still works")
	}
}

func TestSessionTimeouts(t *testing.T) {
	app, dbPath := newTestAppWithOptions(t, func(cfg *configuration.Config) {
		cfg.Auth.SessionIdleTimeout = "10m"
		cfg.Auth.SessionMaxAge = "1h"
	})
	past := func(d time.Duration) time.Time { return time.Now().UTC().Add(-d) }

	idle, _ := app.login("couple_user", "TestPass123!")
	execDB(t, dbPath, "UPDATE sessions SET last_seen_at = ?", past(5*time.Minute))
	if !app.authenticated(idle) {
		t.Fatal("session ended before the idle timeout")
	}
	// The request above counted as activity.
	execDB(t, dbPath, "UPDATE sessions SET last_seen_at = ? WHERE last_seen_at > ?", past(11*time.Minute), past(time.Minute))
	if app.authenticated(idle) {
		t.Fatal("idle session still works")
	}

	old, _ := app.login("couple_user", "TestPass123!")
	execDB(t, dbPath, "UPDATE sessions SET expires_at = ?", past(time.Second))
	if app.authenticated(old) {
		t.Fatal("session outlived its maximum age")
	}

	_, _, err := configuration.AuthConfig{SessionIdleTimeout: "soon"}.Timeouts()
	if err == nil {
		t.Fatal("invalid duration accepted")
	}
}

func TestSessionRenewedWhenLoginChanges(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	admin, _ := app.login("admin_user", "TestPass123!")
	adminElsewhere, _ := app.login("admin_user", "TestPass123!")
	couple, _ := app.login("couple_user", "TestPass123!")

	userID := func(name string) string {
		resp := app.do(http.MethodGet, "/api/users/", nil, admin)
		defer resp.Body.Close()
		var body struct {
			Users []struct {
				ID       json.Number
				Username string
			}
		}
		json.NewDecoder(resp.Body).Decode(&body)
		for _, u := range body.Users {
			if u.Username == name {
				return u.ID.String()
			}
		}
		t.Fatalf("user %s not found", name)
		return ""
	}
	coupleID, adminID := userID("couple_user"), userID("admin_user")

	// Someone else's password: all their sessions end.
	resp := app.do(http.MethodPut, "/api/users/"+coupleID+"/password", map[string]string{"password": "NewPass12345!"}, admin)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("set password: %d", resp.StatusCode)
	}
	if app.authenticated(couple) {
		t.Fatal("session survived a password reset")
	}

	// Own password: this device gets a new session, all others end.
	resp = app.do(http.MethodPut, "/api/users/"+adminID+"/password", map[string]string{"password": "NewPass12345!"}, admin)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("set own password: %d", resp.StatusCode)
	}
	renewed := sessionCookie(resp)
	if renewed == nil || renewed.Value == admin.Value {
		t.Fatal("no new session after a password change")
	}
	if app.authenticated(admin) || app.authenticated(adminElsewhere) || !app.authenticated(renewed) {
		t.Fatal("password change must replace every session")
	}

	// Deactivating a user signs them out.
	witness, _ := app.login("witness_user", "TestPass123!")
	resp = app.do(http.MethodPut, "/api/users/"+userID2(t, app, renewed, "witness_user")+"/active", map[string]bool{"active": false}, renewed)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("deactivate: %d", resp.StatusCode)
	}
	if app.authenticated(witness) {
		t.Fatal("deactivated user still signed in")
	}
}

func userID2(t *testing.T, app *testApp, cookie *http.Cookie, name string) string {
	t.Helper()
	resp := app.do(http.MethodGet, "/api/users/", nil, cookie)
	defer resp.Body.Close()
	var body struct {
		Users []struct {
			ID       json.Number
			Username string
		}
	}
	json.NewDecoder(resp.Body).Decode(&body)
	for _, u := range body.Users {
		if u.Username == name {
			return u.ID.String()
		}
	}
	t.Fatalf("user %s not found", name)
	return ""
}

func TestRequireTwoFactor(t *testing.T) {
	app, _ := newTestAppWithOptions(t, func(cfg *configuration.Config) {
		cfg.Auth.RequireTwoFactor = []string{"admin"}
	})

	// Roles that are not listed are unaffected.
	couple, _ := app.login("couple_user", "TestPass123!")
	if resp := app.do(http.MethodGet, "/api/responses/", nil, couple); resp.StatusCode != http.StatusOK {
		t.Fatalf("couple: %d", resp.StatusCode)
	}

	admin, status := app.login("admin_user", "TestPass123!")
	if status != http.StatusOK {
		t.Fatalf("login: %d", status)
	}
	setupRequired := func(cookie *http.Cookie) bool {
		resp := app.do(http.MethodGet, "/api/auth/me", nil, cookie)
		defer resp.Body.Close()
		var me struct{ TwoFactorSetupRequired bool }
		json.NewDecoder(resp.Body).Decode(&me)
		return me.TwoFactorSetupRequired
	}
	if !setupRequired(admin) {
		t.Fatal("me must report the missing second factor")
	}

	for _, path := range []string{"/api/users/", "/api/responses/", "/api/contributions/", "/api/rsvp-summary"} {
		resp := app.do(http.MethodGet, path, nil, admin)
		var e struct{ Error struct{ Code string } }
		json.NewDecoder(resp.Body).Decode(&e)
		resp.Body.Close()
		if resp.StatusCode != http.StatusForbidden || e.Error.Code != "two_factor_setup_required" {
			t.Fatalf("%s without second factor: %d %s", path, resp.StatusCode, e.Error.Code)
		}
	}

	// Setting one up is the only thing that works.
	resp := app.do(http.MethodPost, "/api/account/2fa/totp", nil, admin)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("begin: %d", resp.StatusCode)
	}
	var begin struct{ Secret string }
	json.NewDecoder(resp.Body).Decode(&begin)
	resp.Body.Close()
	code, _ := totp.GenerateCode(begin.Secret, time.Now())
	resp = app.do(http.MethodPost, "/api/account/2fa/totp/confirm", map[string]string{"code": code}, admin)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("confirm: %d", resp.StatusCode)
	}
	resp.Body.Close()
	renewed := sessionCookie(resp)
	if renewed == nil || app.authenticated(admin) {
		t.Fatal("enabling a second factor must replace the session")
	}
	if setupRequired(renewed) {
		t.Fatal("setup still required")
	}
	if resp := app.do(http.MethodGet, "/api/users/", nil, renewed); resp.StatusCode != http.StatusOK {
		t.Fatalf("after setup: %d", resp.StatusCode)
	}

	bad := configuration.Default()
	bad.SessionSecret, bad.DataKey = "test-secret-32-bytes-long-padding", testDataKey
	bad.Auth.RequireTwoFactor = []string{"guest"}
	if bad.Validate() == nil {
		t.Fatal("unknown role accepted")
	}
}

func TestProductionSessionCookie(t *testing.T) {
	app, _ := newTestAppWithOptions(t, func(cfg *configuration.Config) {
		cfg.Environment = "production"
	})
	resp := app.do(http.MethodPost, "/api/auth/login",
		map[string]string{"username": "couple_user", "password": "TestPass123!"}, nil)
	defer resp.Body.Close()
	cookie := sessionCookie(resp)
	if cookie == nil {
		t.Fatalf("no session cookie: %d", resp.StatusCode)
	}
	if cookie.Name != "__Host-wedwise_session" || !cookie.Secure || !cookie.HttpOnly ||
		cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/" || cookie.Domain != "" {
		t.Fatalf("cookie: %+v", cookie)
	}
	if !app.authenticated(cookie) {
		t.Fatal("production cookie not accepted")
	}
}
