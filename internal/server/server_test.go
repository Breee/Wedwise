// Package server integration tests cover the critical authorization scenarios
// specified in the project requirements, particularly around contribution access
// control for the couple role.
package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/Breee/Wedwise/internal/configuration"
	"github.com/Breee/Wedwise/internal/database"
	"github.com/Breee/Wedwise/internal/invitations"
	"github.com/Breee/Wedwise/internal/server"
	"github.com/Breee/Wedwise/internal/users"
)

// testApp wires up a full server backed by a real (temporary) SQLite database.
type testApp struct {
	t       *testing.T
	srv     *httptest.Server
	handler http.Handler
}

// helper: login and return the session cookie
func (a *testApp) login(username, password string) (*http.Cookie, int) {
	a.t.Helper()
	body := fmt.Sprintf(`{"username":%q,"password":%q}`, username, password)
	resp, err := http.Post(a.srv.URL+"/api/auth/login", "application/json", bytes.NewBufferString(body))
	if err != nil {
		a.t.Fatalf("login request: %v", err)
	}
	defer resp.Body.Close()

	var cookie *http.Cookie
	for _, c := range resp.Cookies() {
		if c.Name == "wedwise_session" {
			cookie = c
		}
	}
	return cookie, resp.StatusCode
}

// helper: do request with optional session cookie
func (a *testApp) do(method, path string, body any, cookie *http.Cookie) *http.Response {
	a.t.Helper()
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			a.t.Fatalf("marshal body: %v", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, a.srv.URL+path, bodyReader)
	if err != nil {
		a.t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		a.t.Fatalf("do request %s %s: %v", method, path, err)
	}
	return resp
}

// setupUsers creates couple, witness, and admin users for testing.
// It returns a db-backed setup function that uses the users store directly.
func setupUsers(t *testing.T, dbPath string) {
	t.Helper()
	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatalf("open test db for user setup: %v", err)
	}
	defer db.Close()

	store := users.NewStore(db)
	ctx := context.Background()

	for _, u := range []struct {
		username, role, password string
	}{
		{"couple_user", "couple", "TestPass123!"},
		{"witness_user", "witness", "TestPass123!"},
		{"admin_user", "admin", "TestPass123!"},
	} {
		if _, err := store.Create(ctx, users.CreateParams{
			Username: u.username,
			Role:     u.role,
			Password: u.password,
		}); err != nil {
			t.Fatalf("create %s user: %v", u.role, err)
		}
	}
}

// newTestAppWithUsers builds a test server and pre-populates users.
func newTestAppWithUsers(t *testing.T) (*testApp, string) {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")

	// Run migrations via the database package first.
	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := database.Migrate(context.Background(), db); err != nil {
		_ = db.Close()
		t.Fatalf("migrate: %v", err)
	}
	_ = db.Close()

	setupUsers(t, dbPath)

	db2, err := database.Open(dbPath)
	if err != nil {
		t.Fatalf("open db2: %v", err)
	}
	t.Cleanup(func() { _ = db2.Close() })

	cfg := configuration.Default()
	cfg.SessionSecret = "test-secret-32-bytes-long-padding"
	cfg.BaseURL = "http://localhost"

	s, err := server.New(cfg, db2)
	if err != nil {
		t.Fatalf("new server: %v", err)
	}

	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close)

	return &testApp{t: t, srv: ts, handler: s.Handler()}, dbPath
}

// createInvitationAndContribution creates an invitation and a contribution via
// the public RSVP token endpoint. Returns (token, contributionID).
// Uses the couple user to create the invitation (couple has invitation.write).
func createInvitationAndContribution(t *testing.T, app *testApp, dbPath string) (string, int64) {
	t.Helper()

	// Login as couple to create invitation (couple has invitation.write)
	coupleCookie, status := app.login("couple_user", "TestPass123!")
	if status != http.StatusOK {
		t.Fatalf("couple login for setup: got %d", status)
	}

	// Create an invitation via the API
	resp := app.do("POST", "/api/invitations", map[string]any{
		"name":      "Test Family",
		"maxGuests": 2,
	}, coupleCookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create invitation (in createInvitationAndContribution): got %d, body: %s", resp.StatusCode, body)
	}

	var inv struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&inv); err != nil {
		t.Fatalf("decode invitation: %v", err)
	}

	// Submit a contribution via the public token endpoint (no auth needed)
	contribResp := app.do("POST", "/api/rsvp/"+inv.Token+"/contributions", map[string]any{
		"title":              "Test Speech",
		"category":           "speech",
		"description":        "A short speech about the couple",
		"participants":       "John",
		"durationMinutes":    5,
		"contactInformation": "john@example.com",
	}, nil)
	defer contribResp.Body.Close()
	if contribResp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(contribResp.Body)
		t.Fatalf("submit contribution: got %d, body: %s", contribResp.StatusCode, body)
	}

	var contrib struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(contribResp.Body).Decode(&contrib); err != nil {
		t.Fatalf("decode contribution: %v", err)
	}

	return inv.Token, contrib.ID
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

func TestLogin_Success(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	cookie, status := app.login("couple_user", "TestPass123!")
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d", status)
	}
	if cookie == nil {
		t.Fatal("expected session cookie, got none")
	}
}

func TestLogin_InvalidPassword(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	_, status := app.login("couple_user", "WrongPassword!")
	if status != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", status)
	}
}

func TestLogin_UnknownUser(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	_, status := app.login("nobody", "TestPass123!")
	if status != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", status)
	}
}

func TestLogout_InvalidatesSession(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	cookie, status := app.login("couple_user", "TestPass123!")
	if status != http.StatusOK {
		t.Fatalf("login: expected 200, got %d", status)
	}

	// Logout
	logoutResp := app.do("POST", "/api/auth/logout", nil, cookie)
	defer logoutResp.Body.Close()
	if logoutResp.StatusCode != http.StatusOK {
		t.Fatalf("logout: expected 200, got %d", logoutResp.StatusCode)
	}

	// Session should no longer be valid: /api/auth/me returns 200 but with authenticated=false
	meResp := app.do("GET", "/api/auth/me", nil, cookie)
	defer meResp.Body.Close()
	if meResp.StatusCode != http.StatusOK {
		t.Fatalf("after logout, /api/auth/me should be 200, got %d", meResp.StatusCode)
	}
	var meBody struct {
		Authenticated bool `json:"authenticated"`
	}
	if err := json.NewDecoder(meResp.Body).Decode(&meBody); err != nil {
		t.Fatalf("decode /api/auth/me response: %v", err)
	}
	if meBody.Authenticated {
		t.Fatal("after logout, /api/auth/me should return authenticated=false")
	}
}

func TestProtectedRoute_Unauthenticated(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	resp := app.do("GET", "/api/guests", nil, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated access, got %d", resp.StatusCode)
	}
}

func TestSessionAuthorization_ValidSession(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	cookie, _ := app.login("couple_user", "TestPass123!")

	resp := app.do("GET", "/api/auth/me", nil, cookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for authenticated /api/auth/me, got %d", resp.StatusCode)
	}
}

// TestCoupleCannotListContributions is the critical security requirement:
// A couple user MUST receive 403 on GET /api/contributions.
func TestCoupleCannotListContributions(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	_, _ = createInvitationAndContribution(t, app, dbPath)

	coupleCookie, status := app.login("couple_user", "TestPass123!")
	if status != http.StatusOK {
		t.Fatalf("couple login: expected 200, got %d", status)
	}

	resp := app.do("GET", "/api/contributions", nil, coupleCookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("couple GET /api/contributions: expected 403, got %d", resp.StatusCode)
	}
}

// TestCoupleCannotGetContributionByID verifies the couple cannot access a
// specific contribution even when the ID is known.
func TestCoupleCannotGetContributionByID(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	_, contribID := createInvitationAndContribution(t, app, dbPath)

	coupleCookie, status := app.login("couple_user", "TestPass123!")
	if status != http.StatusOK {
		t.Fatalf("couple login: expected 200, got %d", status)
	}

	path := fmt.Sprintf("/api/contributions/%d", contribID)
	resp := app.do("GET", path, nil, coupleCookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("couple GET %s: expected 403, got %d", path, resp.StatusCode)
	}
}

// TestCoupleCannotUpdateContribution ensures PUT is also blocked.
func TestCoupleCannotUpdateContribution(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	_, contribID := createInvitationAndContribution(t, app, dbPath)

	coupleCookie, _ := app.login("couple_user", "TestPass123!")

	path := fmt.Sprintf("/api/contributions/%d", contribID)
	resp := app.do("PUT", path, map[string]any{"status": "confirmed"}, coupleCookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("couple PUT %s: expected 403, got %d", path, resp.StatusCode)
	}
}

// TestAdminCannotListContributions verifies admin also lacks contribution access
// by default (per spec: admin != bypass all authorization).
func TestAdminCannotListContributions(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	adminCookie, status := app.login("admin_user", "TestPass123!")
	if status != http.StatusOK {
		t.Fatalf("admin login: expected 200, got %d", status)
	}

	resp := app.do("GET", "/api/contributions", nil, adminCookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("admin GET /api/contributions: expected 403, got %d", resp.StatusCode)
	}
}

// TestWitnessCanListContributions verifies witnesses CAN access contributions.
func TestWitnessCanListContributions(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	_, _ = createInvitationAndContribution(t, app, dbPath)

	witnessCookie, status := app.login("witness_user", "TestPass123!")
	if status != http.StatusOK {
		t.Fatalf("witness login: expected 200, got %d", status)
	}

	resp := app.do("GET", "/api/contributions", nil, witnessCookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("witness GET /api/contributions: expected 200, got %d, body: %s", resp.StatusCode, body)
	}
}

// TestWitnessCanGetContributionByID verifies witnesses can access a specific contribution.
func TestWitnessCanGetContributionByID(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	_, contribID := createInvitationAndContribution(t, app, dbPath)

	witnessCookie, _ := app.login("witness_user", "TestPass123!")

	path := fmt.Sprintf("/api/contributions/%d", contribID)
	resp := app.do("GET", path, nil, witnessCookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("witness GET %s: expected 200, got %d, body: %s", path, resp.StatusCode, body)
	}
}

// TestUnauthenticatedContributionAccess ensures unauthenticated users get 401.
func TestUnauthenticatedContributionAccess(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	resp := app.do("GET", "/api/contributions", nil, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated GET /api/contributions: expected 401, got %d", resp.StatusCode)
	}
}

// TestInvitationTokenValidation checks that an invalid token returns 404/401.
func TestInvitationTokenValidation(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	resp := app.do("GET", "/api/rsvp/invalid-token-that-does-not-exist", nil, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("invalid token: expected 404, got %d", resp.StatusCode)
	}
}

// TestRSVPSubmission checks that a guest can submit RSVP via invitation token.
func TestRSVPSubmission(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	// Couple creates the invitation (couple has invitation.write)
	coupleCookie, _ := app.login("couple_user", "TestPass123!")

	// Create an invitation
	resp := app.do("POST", "/api/invitations", map[string]any{
		"name":      "Smith Family",
		"maxGuests": 3,
	}, coupleCookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create invitation: got %d, body: %s", resp.StatusCode, body)
	}

	var inv struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&inv); err != nil {
		t.Fatalf("decode invitation: %v", err)
	}

	// Verify token access
	getResp := app.do("GET", "/api/rsvp/"+inv.Token, nil, nil)
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/rsvp/:token: expected 200, got %d", getResp.StatusCode)
	}

	// Submit RSVP
	putResp := app.do("PUT", "/api/rsvp/"+inv.Token, map[string]any{
		"status":  "yes",
		"message": "So excited!",
		"attendees": []map[string]any{
			{"name": "Jane Smith", "attending": true, "diet": "vegetarian"},
			{"name": "Bob Smith", "attending": true, "isChild": false, "diet": "none"},
		},
	}, nil)
	defer putResp.Body.Close()
	if putResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(putResp.Body)
		t.Fatalf("PUT /api/rsvp/:token: expected 200, got %d, body: %s", putResp.StatusCode, body)
	}
}

// TestContributionSubmissionViaToken ensures guests can submit contributions.
func TestContributionSubmissionViaToken(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	// Couple creates the invitation (couple has invitation.write)
	coupleCookie, _ := app.login("couple_user", "TestPass123!")

	resp := app.do("POST", "/api/invitations", map[string]any{
		"name":      "Jones Family",
		"maxGuests": 2,
	}, coupleCookie)
	defer resp.Body.Close()

	var inv struct {
		Token string `json:"token"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&inv)

	contribResp := app.do("POST", "/api/rsvp/"+inv.Token+"/contributions", map[string]any{
		"title":              "A Funny Game",
		"category":           "game",
		"description":        "A team quiz",
		"participants":       "Everyone",
		"durationMinutes":    15,
		"contactInformation": "jones@example.com",
	}, nil)
	defer contribResp.Body.Close()
	if contribResp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(contribResp.Body)
		t.Fatalf("POST /api/rsvp/:token/contributions: expected 201, got %d, body: %s", contribResp.StatusCode, body)
	}
}

// TestRSVPSummaryHasNoContributionData ensures the summary endpoint for couple
// does not leak any contribution metadata.
func TestRSVPSummaryHasNoContributionData(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	_, _ = createInvitationAndContribution(t, app, dbPath)

	coupleCookie, _ := app.login("couple_user", "TestPass123!")

	resp := app.do("GET", "/api/rsvp-summary", nil, coupleCookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("GET /api/rsvp-summary: expected 200, got %d, body: %s", resp.StatusCode, body)
	}

	var summary map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&summary); err != nil {
		t.Fatalf("decode summary: %v", err)
	}

	// Ensure no contribution-related fields are present
	forbiddenKeys := []string{
		"contributions", "contributionCount", "contribution_count",
		"pendingContributions", "pending_contributions",
		"totalContributions", "total_contributions",
	}
	for _, key := range forbiddenKeys {
		if _, found := summary[key]; found {
			t.Errorf("rsvp-summary contains forbidden contribution field: %q", key)
		}
	}
}

// TestHealthEndpoints verifies /healthz and /readyz return 200.
func TestHealthEndpoints(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	for _, path := range []string{"/healthz", "/readyz"} {
		resp := app.do("GET", path, nil, nil)
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("GET %s: expected 200, got %d", path, resp.StatusCode)
		}
	}
}

// TestInvitationTokenRegeneration ensures a revoked/regenerated token is no
// longer accepted.
func TestInvitationTokenRegeneration(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	// Couple creates the invitation (couple has invitation.write and invitation.read)
	coupleCookie, _ := app.login("couple_user", "TestPass123!")

	// Create invitation
	createResp := app.do("POST", "/api/invitations", map[string]any{
		"name":      "Old Token Family",
		"maxGuests": 2,
	}, coupleCookie)
	defer createResp.Body.Close()

	var inv invitations.Invitation
	if err := json.NewDecoder(createResp.Body).Decode(&inv); err != nil {
		t.Fatalf("decode invitation: %v", err)
	}
	oldToken := inv.Token

	// Verify old token works
	getResp := app.do("GET", "/api/rsvp/"+oldToken, nil, nil)
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("before regenerate: expected 200, got %d", getResp.StatusCode)
	}

	// Regenerate token (couple has invitation.write)
	regenResp := app.do("POST", fmt.Sprintf("/api/invitations/%d/regenerate-token", inv.ID), nil, coupleCookie)
	defer regenResp.Body.Close()
	if regenResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(regenResp.Body)
		t.Fatalf("regenerate-token: expected 200, got %d, body: %s", regenResp.StatusCode, body)
	}

	var updated invitations.Invitation
	if err := json.NewDecoder(regenResp.Body).Decode(&updated); err != nil {
		t.Fatalf("decode regenerated invitation: %v", err)
	}
	if updated.Token == oldToken {
		t.Fatal("token was not regenerated: old and new tokens are identical")
	}

	// Old token should no longer work
	oldResp := app.do("GET", "/api/rsvp/"+oldToken, nil, nil)
	defer oldResp.Body.Close()
	if oldResp.StatusCode != http.StatusNotFound {
		t.Fatalf("after regenerate, old token: expected 404, got %d", oldResp.StatusCode)
	}
}

// TestCoupleCannotAddContributionNotes verifies POST .../notes is blocked.
func TestCoupleCannotAddContributionNotes(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	_, contribID := createInvitationAndContribution(t, app, dbPath)

	coupleCookie, _ := app.login("couple_user", "TestPass123!")

	path := fmt.Sprintf("/api/contributions/%d/notes", contribID)
	resp := app.do("POST", path, map[string]any{"text": "note"}, coupleCookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("couple POST %s: expected 403, got %d", path, resp.StatusCode)
	}
}

// TestContributionErrorShapeDoesNotLeak ensures the 403 response for couple
// does not expose any contribution data or metadata.
func TestContributionErrorShapeDoesNotLeak(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	_, contribID := createInvitationAndContribution(t, app, dbPath)

	coupleCookie, _ := app.login("couple_user", "TestPass123!")

	path := fmt.Sprintf("/api/contributions/%d", contribID)
	resp := app.do("GET", path, nil, coupleCookie)
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}

	// Verify the error response is a generic forbidden, not leaking contribution data
	var errResp map[string]any
	if err := json.Unmarshal(body, &errResp); err != nil {
		t.Fatalf("response body is not valid JSON: %v, body: %s", err, body)
	}

	// The response must have an "error" field
	if _, hasError := errResp["error"]; !hasError {
		t.Fatalf("expected error field in 403 response, got: %s", body)
	}

	// Must not contain contribution-specific fields
	for _, key := range []string{"title", "category", "status", "description", "contributions"} {
		if _, found := errResp[key]; found {
			t.Errorf("403 response leaked contribution field %q: %s", key, body)
		}
	}
}

// TestMain may be used for test setup if needed.
func TestMain(m *testing.M) {
	os.Exit(m.Run())
}
