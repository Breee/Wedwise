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
	"strings"
	"testing"

	"github.com/Breee/Wedwise/internal/configuration"
	"github.com/Breee/Wedwise/internal/database"
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
	return newTestAppWithOptions(t, nil)
}

// newTestAppWithOptions is newTestAppWithUsers with a config hook.
func newTestAppWithOptions(t *testing.T, configure func(*configuration.Config)) (*testApp, string) {
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
	if configure != nil {
		configure(&cfg)
	}

	s, err := server.New(cfg, db2)
	if err != nil {
		t.Fatalf("new server: %v", err)
	}

	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close)

	return &testApp{t: t, srv: ts, handler: s.Handler()}, dbPath
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

func validContent() map[string]any {
	return map[string]any{
		"hero":         map[string]any{"headline": "Wir heiraten"},
		"introduction": map[string]any{"text": "Herzlich willkommen"},
		"location":     map[string]any{"name": "Waldsee", "navigationUrl": "https://maps.example.com"},
		"schedule": []map[string]any{
			{"time": "14:00", "title": "Ankunft"},
			{"time": "14:30", "title": "Trauung"},
		},
		"faq": []map[string]any{{"question": "Dresscode?", "answer": "Festlich"}},
	}
}

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
	resp := app.do("GET", "/api/responses", nil, nil)
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

// TestPublicContentShape ensures the public content endpoint exposes event and content.
func TestPublicContentShape(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	resp := app.do("GET", "/api/content/public", nil, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/content/public: expected 200, got %d", resp.StatusCode)
	}
	var body map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode public content: %v", err)
	}
	for _, key := range []string{"event", "content"} {
		if _, ok := body[key]; !ok {
			t.Fatalf("public content missing %q key: %v", key, body)
		}
	}
	var content struct {
		Schedule []any `json:"schedule"`
		FAQ      []any `json:"faq"`
	}
	if err := json.Unmarshal(body["content"], &content); err != nil {
		t.Fatalf("decode content: %v", err)
	}
	if content.Schedule == nil || content.FAQ == nil {
		t.Fatalf("schedule and faq must be arrays, got %s", body["content"])
	}
}

// TestContentUpdate_Couple verifies the couple can replace content and it becomes public.
func TestContentUpdate_Couple(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	cookie, _ := app.login("couple_user", "TestPass123!")

	resp := app.do("PUT", "/api/content", validContent(), cookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("PUT /api/content: expected 200, got %d, body: %s", resp.StatusCode, body)
	}

	pub := app.do("GET", "/api/content/public", nil, nil)
	defer pub.Body.Close()
	var body struct {
		Content struct {
			Introduction struct {
				Text string `json:"text"`
			} `json:"introduction"`
			Schedule []struct {
				Title string `json:"title"`
				Order int    `json:"order"`
			} `json:"schedule"`
		} `json:"content"`
	}
	if err := json.NewDecoder(pub.Body).Decode(&body); err != nil {
		t.Fatalf("decode public content: %v", err)
	}
	if body.Content.Introduction.Text != "Herzlich willkommen" {
		t.Fatalf("introduction not updated: %q", body.Content.Introduction.Text)
	}
	if len(body.Content.Schedule) != 2 || body.Content.Schedule[1].Title != "Trauung" || body.Content.Schedule[1].Order != 2 {
		t.Fatalf("schedule not persisted in order: %+v", body.Content.Schedule)
	}
}

// TestContentUpdate_Forbidden verifies only content writers can update content.
func TestContentUpdate_Forbidden(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	witnessCookie, _ := app.login("witness_user", "TestPass123!")
	resp := app.do("PUT", "/api/content", validContent(), witnessCookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("witness PUT /api/content: expected 403, got %d", resp.StatusCode)
	}

	anon := app.do("PUT", "/api/content", validContent(), nil)
	defer anon.Body.Close()
	if anon.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous PUT /api/content: expected 401, got %d", anon.StatusCode)
	}
}

// TestContentUpdate_Validation verifies invalid content is rejected with 400.
func TestContentUpdate_Validation(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	cookie, _ := app.login("couple_user", "TestPass123!")

	cases := []struct {
		name   string
		mutate func(c map[string]any)
	}{
		{"schedule without title", func(c map[string]any) {
			c["schedule"] = []map[string]any{{"time": "14:00", "title": "   "}}
		}},
		{"faq without question", func(c map[string]any) {
			c["faq"] = []map[string]any{{"question": "", "answer": "x"}}
		}},
		{"non-http navigation url", func(c map[string]any) {
			c["location"] = map[string]any{"navigationUrl": "javascript:alert(1)"}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			content := validContent()
			tc.mutate(content)
			resp := app.do("PUT", "/api/content", content, cookie)
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusBadRequest {
				body, _ := io.ReadAll(resp.Body)
				t.Fatalf("expected 400, got %d, body: %s", resp.StatusCode, body)
			}
		})
	}
}

func TestLoginRateLimit(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	var status int
	for i := 0; i < 11; i++ {
		_, status = app.login("couple_user", "wrong-password")
		if i < 10 && status != http.StatusUnauthorized {
			t.Fatalf("attempt %d: got %d, want 401", i+1, status)
		}
	}
	if status != http.StatusTooManyRequests {
		t.Fatalf("11th attempt: got %d, want 429", status)
	}

	// Other endpoints stay reachable for the same client.
	resp := app.do("GET", "/api/auth/me", nil, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("/api/auth/me after rate limit: got %d", resp.StatusCode)
	}
}

// -----------------------------------------------------------------------
// RSVP responses and contributions
// -----------------------------------------------------------------------

func validResponse() map[string]any {
	return map[string]any{
		"contactName": "Familie Muster",
		"email":       "muster@example.com",
		"phone":       "+49 170 0000000",
		"status":      "yes",
		"message":     "Wir freuen uns!",
		"attendees": []map[string]any{
			{"name": "Max Muster", "diet": "vegetarian", "allergies": "Nüsse"},
			{"name": "Mia Muster", "isChild": true, "diet": "none"},
		},
	}
}

func withContribution(body map[string]any) map[string]any {
	body["contribution"] = map[string]any{
		"title":       "Kleine Rede",
		"description": "Ein paar Worte über das Paar",
		"needs":       "Mikrofon",
		"phone":       "+49 170 1234567",
	}
	return body
}

type responseView struct {
	ID          int64  `json:"id"`
	ContactName string `json:"contactName"`
	Status      string `json:"status"`
	Message     string `json:"message"`
	EditToken   string `json:"editToken"`
	Attendees   []struct {
		Name      string `json:"name"`
		Diet      string `json:"diet"`
		Allergies string `json:"allergies"`
		IsChild   bool   `json:"isChild"`
	} `json:"attendees"`
	Contribution *struct {
		Title string `json:"title"`
		Phone string `json:"phone"`
	} `json:"contribution"`
}

// submitResponse posts a response through the public endpoint.
func submitResponse(t *testing.T, app *testApp, body map[string]any) responseView {
	t.Helper()
	resp := app.do("POST", "/api/rsvp/", body, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		raw, _ := io.ReadAll(resp.Body)
		t.Fatalf("POST /api/rsvp: got %d, body: %s", resp.StatusCode, raw)
	}
	var view responseView
	if err := json.NewDecoder(resp.Body).Decode(&view); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if view.EditToken == "" {
		t.Fatal("response has no edit token")
	}
	return view
}

// contributionID returns the id of the only contribution, read as witness.
func contributionID(t *testing.T, app *testApp) int64 {
	t.Helper()
	cookie, _ := app.login("witness_user", "TestPass123!")
	resp := app.do("GET", "/api/contributions", nil, cookie)
	defer resp.Body.Close()
	var body struct {
		Contributions []struct {
			ID int64 `json:"id"`
		} `json:"contributions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode contributions: %v", err)
	}
	if len(body.Contributions) != 1 {
		t.Fatalf("expected exactly one contribution, got %d", len(body.Contributions))
	}
	return body.Contributions[0].ID
}

func TestRSVP_CreateGetUpdate(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	created := submitResponse(t, app, withContribution(validResponse()))

	get := app.do("GET", "/api/rsvp/"+created.EditToken, nil, nil)
	defer get.Body.Close()
	if get.StatusCode != http.StatusOK {
		t.Fatalf("GET by token: got %d", get.StatusCode)
	}
	var view responseView
	if err := json.NewDecoder(get.Body).Decode(&view); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if view.ContactName != "Familie Muster" || view.Status != "yes" || len(view.Attendees) != 2 {
		t.Fatalf("response not persisted: %+v", view)
	}
	if view.Attendees[0].Diet != "vegetarian" || view.Attendees[0].Allergies != "Nüsse" || !view.Attendees[1].IsChild {
		t.Fatalf("attendees not persisted: %+v", view.Attendees)
	}
	if view.Contribution == nil || view.Contribution.Title != "Kleine Rede" {
		t.Fatalf("contribution not persisted: %+v", view.Contribution)
	}

	update := validResponse()
	update["status"] = "no"
	put := app.do("PUT", "/api/rsvp/"+created.EditToken, update, nil)
	defer put.Body.Close()
	if put.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(put.Body)
		t.Fatalf("PUT by token: got %d, body: %s", put.StatusCode, raw)
	}
	if err := json.NewDecoder(put.Body).Decode(&view); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if view.Status != "no" || len(view.Attendees) != 0 || view.Contribution != nil {
		t.Fatalf("declining must clear attendees and contribution: %+v", view)
	}

	witness, _ := app.login("witness_user", "TestPass123!")
	list := app.do("GET", "/api/contributions", nil, witness)
	defer list.Body.Close()
	var contributions struct {
		Contributions []any `json:"contributions"`
	}
	_ = json.NewDecoder(list.Body).Decode(&contributions)
	if len(contributions.Contributions) != 0 {
		t.Fatalf("contribution should be removed after declining, got %d", len(contributions.Contributions))
	}
}

func TestRSVP_InvalidToken(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	get := app.do("GET", "/api/rsvp/does-not-exist", nil, nil)
	defer get.Body.Close()
	if get.StatusCode != http.StatusNotFound {
		t.Fatalf("GET invalid token: got %d, want 404", get.StatusCode)
	}
	put := app.do("PUT", "/api/rsvp/does-not-exist", validResponse(), nil)
	defer put.Body.Close()
	if put.StatusCode != http.StatusNotFound {
		t.Fatalf("PUT invalid token: got %d, want 404", put.StatusCode)
	}
}

func TestRSVP_Validation(t *testing.T) {
	app, _ := newTestAppWithUsers(t)

	cases := []struct {
		name   string
		mutate func(b map[string]any)
	}{
		{"missing contact name", func(b map[string]any) { b["contactName"] = "  " }},
		{"invalid status", func(b map[string]any) { b["status"] = "maybe" }},
		{"invalid email", func(b map[string]any) { b["email"] = "not-an-email" }},
		{"yes without attendees", func(b map[string]any) { b["attendees"] = []map[string]any{} }},
		{"attendee without name", func(b map[string]any) {
			b["attendees"] = []map[string]any{{"name": ""}}
		}},
		{"invalid diet", func(b map[string]any) {
			b["attendees"] = []map[string]any{{"name": "A", "diet": "paleo"}}
		}},
		{"too many attendees", func(b map[string]any) {
			list := make([]map[string]any, 11)
			for i := range list {
				list[i] = map[string]any{"name": fmt.Sprintf("Gast %d", i)}
			}
			b["attendees"] = list
		}},
		{"contribution without phone", func(b map[string]any) {
			b["contribution"] = map[string]any{"title": "Rede", "phone": ""}
		}},
		{"contribution without title", func(b map[string]any) {
			b["contribution"] = map[string]any{"title": "", "phone": "0170"}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := validResponse()
			tc.mutate(body)
			resp := app.do("POST", "/api/rsvp/", body, nil)
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusBadRequest {
				raw, _ := io.ReadAll(resp.Body)
				t.Fatalf("expected 400, got %d, body: %s", resp.StatusCode, raw)
			}
		})
	}

	// A declined response needs neither attendees nor a contribution.
	declined := map[string]any{"contactName": "Allein", "status": "no"}
	resp := app.do("POST", "/api/rsvp/", declined, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("declined response: got %d, want 201", resp.StatusCode)
	}
}

// TestCoupleNeverSeesContributions is the central privacy requirement: no
// endpoint reachable by the couple or admin may expose contribution data.
func TestCoupleNeverSeesContributions(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	submitResponse(t, app, withContribution(validResponse()))
	id := contributionID(t, app)

	for _, role := range []string{"couple_user", "admin_user"} {
		cookie, _ := app.login(role, "TestPass123!")

		for _, path := range []string{"/api/contributions", fmt.Sprintf("/api/contributions/%d", id)} {
			resp := app.do("GET", path, nil, cookie)
			resp.Body.Close()
			if resp.StatusCode != http.StatusForbidden {
				t.Fatalf("%s GET %s: got %d, want 403", role, path, resp.StatusCode)
			}
		}
		put := app.do("PUT", fmt.Sprintf("/api/contributions/%d/status", id), map[string]any{"status": "confirmed"}, cookie)
		put.Body.Close()
		if put.StatusCode != http.StatusForbidden {
			t.Fatalf("%s PUT status: got %d, want 403", role, put.StatusCode)
		}
		note := app.do("POST", fmt.Sprintf("/api/contributions/%d/notes", id), map[string]any{"text": "x"}, cookie)
		note.Body.Close()
		if note.StatusCode != http.StatusForbidden {
			t.Fatalf("%s POST note: got %d, want 403", role, note.StatusCode)
		}

		for _, path := range []string{"/api/responses", "/api/rsvp-summary"} {
			resp := app.do("GET", path, nil, cookie)
			raw, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("%s GET %s: got %d, body: %s", role, path, resp.StatusCode, raw)
			}
			lower := strings.ToLower(string(raw))
			for _, leak := range []string{"contribution", "kleine rede", "mikrofon", "1234567"} {
				if strings.Contains(lower, leak) {
					t.Fatalf("%s GET %s leaks contribution data (%q): %s", role, path, leak, raw)
				}
			}
		}
	}

	anon := app.do("GET", "/api/contributions", nil, nil)
	anon.Body.Close()
	if anon.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous GET /api/contributions: got %d, want 401", anon.StatusCode)
	}
}

func TestCoupleSeesResponsesAndFood(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	submitResponse(t, app, withContribution(validResponse()))
	cookie, _ := app.login("couple_user", "TestPass123!")

	list := app.do("GET", "/api/responses", nil, cookie)
	defer list.Body.Close()
	var responses struct {
		Responses []struct {
			ContactName string `json:"contactName"`
			Attendees   []struct {
				Name string `json:"name"`
			} `json:"attendees"`
		} `json:"responses"`
	}
	if err := json.NewDecoder(list.Body).Decode(&responses); err != nil {
		t.Fatalf("decode responses: %v", err)
	}
	if len(responses.Responses) != 1 || len(responses.Responses[0].Attendees) != 2 {
		t.Fatalf("unexpected responses: %+v", responses)
	}

	summaryResp := app.do("GET", "/api/rsvp-summary", nil, cookie)
	defer summaryResp.Body.Close()
	var summary struct {
		Responses          int            `json:"responses"`
		AttendeesAttending int            `json:"attendeesAttending"`
		Children           int            `json:"children"`
		DietCounts         map[string]int `json:"dietCounts"`
		Allergies          []struct {
			Name      string `json:"name"`
			Allergies string `json:"allergies"`
		} `json:"allergies"`
	}
	if err := json.NewDecoder(summaryResp.Body).Decode(&summary); err != nil {
		t.Fatalf("decode summary: %v", err)
	}
	if summary.Responses != 1 || summary.AttendeesAttending != 2 || summary.Children != 1 || summary.DietCounts["vegetarian"] != 1 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	if len(summary.Allergies) != 1 || summary.Allergies[0].Name != "Max Muster" || summary.Allergies[0].Allergies != "Nüsse" {
		t.Fatalf("unexpected allergies: %+v", summary.Allergies)
	}
}

func TestWitnessManagesContributions(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	submitResponse(t, app, withContribution(validResponse()))
	id := contributionID(t, app)
	cookie, _ := app.login("witness_user", "TestPass123!")

	get := app.do("GET", fmt.Sprintf("/api/contributions/%d", id), nil, cookie)
	defer get.Body.Close()
	var detail struct {
		ContactName string `json:"contactName"`
		Title       string `json:"title"`
		Needs       string `json:"needs"`
		Phone       string `json:"phone"`
		Status      string `json:"status"`
		Notes       []any  `json:"notes"`
	}
	if err := json.NewDecoder(get.Body).Decode(&detail); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if detail.ContactName != "Familie Muster" || detail.Phone != "+49 170 1234567" || detail.Needs != "Mikrofon" || detail.Status != "new" {
		t.Fatalf("unexpected detail: %+v", detail)
	}

	status := app.do("PUT", fmt.Sprintf("/api/contributions/%d/status", id), map[string]any{"status": "confirmed"}, cookie)
	defer status.Body.Close()
	if status.StatusCode != http.StatusOK {
		t.Fatalf("set status: got %d", status.StatusCode)
	}
	bad := app.do("PUT", fmt.Sprintf("/api/contributions/%d/status", id), map[string]any{"status": "done"}, cookie)
	bad.Body.Close()
	if bad.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid status: got %d, want 400", bad.StatusCode)
	}

	note := app.do("POST", fmt.Sprintf("/api/contributions/%d/notes", id), map[string]any{"text": "Angerufen"}, cookie)
	defer note.Body.Close()
	if note.StatusCode != http.StatusCreated {
		t.Fatalf("add note: got %d", note.StatusCode)
	}
	missing := app.do("GET", "/api/contributions/999999", nil, cookie)
	defer missing.Body.Close()
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("missing contribution: got %d, want 404", missing.StatusCode)
	}
	var errBody struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	raw, _ := io.ReadAll(missing.Body)
	if err := json.Unmarshal(raw, &errBody); err != nil || errBody.Error.Code == "" {
		t.Fatalf("error shape: %s", raw)
	}
}

func TestRSVPAccessCode(t *testing.T) {
	app, _ := newTestAppWithOptions(t, func(cfg *configuration.Config) { cfg.RSVPAccessCode = "wald-see-27" })

	statusResp := app.do("GET", "/api/rsvp/access", nil, nil)
	defer statusResp.Body.Close()
	var access struct {
		Required bool `json:"required"`
		Unlocked bool `json:"unlocked"`
	}
	_ = json.NewDecoder(statusResp.Body).Decode(&access)
	if !access.Required || access.Unlocked {
		t.Fatalf("access status before unlock: %+v", access)
	}

	locked := app.do("POST", "/api/rsvp/", validResponse(), nil)
	locked.Body.Close()
	if locked.StatusCode != http.StatusUnauthorized {
		t.Fatalf("submit without code: got %d, want 401", locked.StatusCode)
	}

	wrong := app.do("POST", "/api/rsvp/unlock", map[string]any{"code": "nope"}, nil)
	wrong.Body.Close()
	if wrong.StatusCode != http.StatusUnauthorized || len(wrong.Cookies()) != 0 {
		t.Fatalf("wrong code: got %d with %d cookies", wrong.StatusCode, len(wrong.Cookies()))
	}

	ok := app.do("POST", "/api/rsvp/unlock", map[string]any{"code": "wald-see-27"}, nil)
	ok.Body.Close()
	if ok.StatusCode != http.StatusNoContent {
		t.Fatalf("unlock: got %d, want 204", ok.StatusCode)
	}
	var cookie *http.Cookie
	for _, c := range ok.Cookies() {
		if c.Name == "wedwise_rsvp_access" {
			cookie = c
		}
	}
	if cookie == nil || !cookie.HttpOnly {
		t.Fatalf("expected HttpOnly access cookie, got %+v", cookie)
	}

	created := app.do("POST", "/api/rsvp/", validResponse(), cookie)
	created.Body.Close()
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("submit with code: got %d, want 201", created.StatusCode)
	}

	forged := &http.Cookie{Name: cookie.Name, Value: "0000"}
	rejected := app.do("POST", "/api/rsvp/", validResponse(), forged)
	rejected.Body.Close()
	if rejected.StatusCode != http.StatusUnauthorized {
		t.Fatalf("forged cookie: got %d, want 401", rejected.StatusCode)
	}
}

func TestRSVPAccessCodeDisabled(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	resp := app.do("GET", "/api/rsvp/access", nil, nil)
	defer resp.Body.Close()
	var access struct {
		Required bool `json:"required"`
		Unlocked bool `json:"unlocked"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&access)
	if access.Required || !access.Unlocked {
		t.Fatalf("open access expected: %+v", access)
	}
}

func TestRSVPRateLimit(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	var status int
	for i := 0; i < 31; i++ {
		resp := app.do("GET", "/api/rsvp/unknown", nil, nil)
		resp.Body.Close()
		status = resp.StatusCode
	}
	if status != http.StatusTooManyRequests {
		t.Fatalf("31st request: got %d, want 429", status)
	}
}

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}
