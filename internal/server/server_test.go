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
	"time"

	"github.com/pquerna/otp/totp"

	"github.com/Breee/Wedwise/internal/auth"
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

	linkToken string
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
	cfg.UploadsPath = filepath.Join(dir, "uploads")
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
		"travel": map[string]any{"lat": 47.98, "lng": 7.87, "stops": []map[string]any{
			{"name": "Laßbergstraße", "kind": "tram", "line": "1", "lat": 47.984, "lng": 7.893},
		}},
		"accommodation": map[string]any{"checkIn": "2027-06-24", "checkOut": "2027-06-26", "hotels": []map[string]any{
			{"name": "Hotel Löwen", "area": "Littenweiler", "lat": 47.976, "lng": 7.911, "priceTier": 2, "url": "https://example.com"},
		}},
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
			Travel struct {
				Stops []struct {
					Kind string `json:"kind"`
				} `json:"stops"`
			} `json:"travel"`
			Accommodation struct {
				CheckIn string `json:"checkIn"`
				Hotels  []struct {
					PriceTier int `json:"priceTier"`
				} `json:"hotels"`
			} `json:"accommodation"`
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
	if len(body.Content.Travel.Stops) != 1 || body.Content.Travel.Stops[0].Kind != "tram" {
		t.Fatalf("travel not persisted: %+v", body.Content.Travel)
	}
	if body.Content.Accommodation.CheckIn != "2027-06-24" || len(body.Content.Accommodation.Hotels) != 1 || body.Content.Accommodation.Hotels[0].PriceTier != 2 {
		t.Fatalf("accommodation not persisted: %+v", body.Content.Accommodation)
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
		{"unknown stop kind", func(c map[string]any) {
			c["travel"] = map[string]any{"stops": []map[string]any{{"name": "X", "kind": "boat", "lat": 1, "lng": 1}}}
		}},
		{"stop coordinates out of range", func(c map[string]any) {
			c["travel"] = map[string]any{"stops": []map[string]any{{"name": "X", "kind": "tram", "lat": 91, "lng": 1}}}
		}},
		{"hotel price tier out of range", func(c map[string]any) {
			c["accommodation"] = map[string]any{"hotels": []map[string]any{{"name": "H", "lat": 1, "lng": 1, "priceTier": 4}}}
		}},
		{"hotel unknown kind", func(c map[string]any) {
			c["accommodation"] = map[string]any{"hotels": []map[string]any{{"name": "H", "lat": 1, "lng": 1, "priceTier": 1, "kind": "tent"}}}
		}},
		{"hotel non-http url", func(c map[string]any) {
			c["accommodation"] = map[string]any{"hotels": []map[string]any{{"name": "H", "lat": 1, "lng": 1, "priceTier": 1, "url": "javascript:1"}}}
		}},
		{"bad check-in date", func(c map[string]any) {
			c["accommodation"] = map[string]any{"checkIn": "24.06.2027"}
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
			{"name": "Mia Muster", "isChild": true, "age": 6, "photoOk": false, "diet": "none"},
		},
	}
}

func withContribution(body map[string]any) map[string]any {
	body["contribution"] = map[string]any{
		"title":       "Kleine Rede",
		"description": "Ein paar Worte über das Paar",
		"needs":       "Mikrofon",
		"messengers":  []map[string]string{{"kind": "whatsapp", "handle": "+49 170 1234567"}, {"kind": "telegram", "handle": "@max"}},
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
		Age       int    `json:"age"`
		PhotoOK   bool   `json:"photoOk"`
	} `json:"attendees"`
	Contribution *struct {
		Title string `json:"title"`
		Phone string `json:"phone"`
	} `json:"contribution"`
}

// submitResponse posts a response through the public endpoint.
func submitResponse(t *testing.T, app *testApp, body map[string]any) responseView {
	t.Helper()
	resp := app.do("POST", app.submitPath(t), body, nil)
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
		{"contribution without messenger", func(b map[string]any) {
			b["contribution"] = map[string]any{"title": "Rede"}
		}},
		{"contribution with messenger but no handle", func(b map[string]any) {
			b["contribution"] = map[string]any{"title": "Rede", "messengers": []map[string]string{{"kind": "signal", "handle": ""}}}
		}},
		{"contribution without title", func(b map[string]any) {
			b["contribution"] = map[string]any{"title": "", "messengers": []map[string]string{{"kind": "signal", "handle": "0170"}}}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := validResponse()
			tc.mutate(body)
			resp := app.do("POST", app.submitPath(t), body, nil)
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusBadRequest {
				raw, _ := io.ReadAll(resp.Body)
				t.Fatalf("expected 400, got %d, body: %s", resp.StatusCode, raw)
			}
		})
	}

	// A declined response needs neither attendees nor a contribution.
	declined := map[string]any{"contactName": "Allein", "status": "no"}
	resp := app.do("POST", app.submitPath(t), declined, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("declined response: got %d, want 201", resp.StatusCode)
	}
}

// TestCoupleNeverSeesContributions is the central privacy requirement: no
// endpoint reachable by the couple may expose contribution data.
func TestCoupleNeverSeesContributions(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	submitResponse(t, app, withContribution(validResponse()))
	id := contributionID(t, app)

	for _, role := range []string{"couple_user"} {
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
		Messengers  []struct {
			Kind   string `json:"kind"`
			Handle string `json:"handle"`
		} `json:"messengers"`
		Status string `json:"status"`
		Notes  []any  `json:"notes"`
	}
	if err := json.NewDecoder(get.Body).Decode(&detail); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if detail.ContactName != "Familie Muster" || detail.Needs != "Mikrofon" || detail.Status != "new" {
		t.Fatalf("unexpected detail: %+v", detail)
	}
	if len(detail.Messengers) != 2 || detail.Messengers[0].Kind != "whatsapp" || detail.Messengers[1].Handle != "@max" {
		t.Fatalf("unexpected contact channels: %+v", detail)
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

	schedule := app.do("PUT", fmt.Sprintf("/api/contributions/%d/schedule", id), map[string]any{"slotTime": "20:15", "durationMinutes": 10}, cookie)
	defer schedule.Body.Close()
	var scheduled struct {
		SlotTime        string `json:"slotTime"`
		DurationMinutes int    `json:"durationMinutes"`
	}
	if err := json.NewDecoder(schedule.Body).Decode(&scheduled); err != nil || schedule.StatusCode != http.StatusOK {
		t.Fatalf("set schedule: got %d, err %v", schedule.StatusCode, err)
	}
	if scheduled.SlotTime != "20:15" || scheduled.DurationMinutes != 10 {
		t.Fatalf("unexpected schedule: %+v", scheduled)
	}
	for _, body := range []map[string]any{
		{"slotTime": "25:00", "durationMinutes": 10},
		{"slotTime": "20:00", "durationMinutes": 500},
	} {
		badSchedule := app.do("PUT", fmt.Sprintf("/api/contributions/%d/schedule", id), body, cookie)
		badSchedule.Body.Close()
		if badSchedule.StatusCode != http.StatusBadRequest {
			t.Fatalf("invalid schedule %v: got %d, want 400", body, badSchedule.StatusCode)
		}
	}

	bulk := app.do("PUT", "/api/contributions/schedule", map[string]any{
		"items": []map[string]any{{"id": id, "slotTime": "21:00", "durationMinutes": 15}},
	}, cookie)
	bulk.Body.Close()
	if bulk.StatusCode != http.StatusNoContent {
		t.Fatalf("bulk schedule: got %d, want 204", bulk.StatusCode)
	}
	badBulk := app.do("PUT", "/api/contributions/schedule", map[string]any{
		"items": []map[string]any{{"id": id, "slotTime": "21:00", "durationMinutes": 15}, {"id": 999999, "slotTime": "", "durationMinutes": 0}},
	}, cookie)
	badBulk.Body.Close()
	if badBulk.StatusCode != http.StatusNotFound {
		t.Fatalf("bulk schedule unknown id: got %d, want 404", badBulk.StatusCode)
	}
	after := app.do("GET", fmt.Sprintf("/api/contributions/%d", id), nil, cookie)
	defer after.Body.Close()
	var afterView struct {
		SlotTime string `json:"slotTime"`
	}
	if err := json.NewDecoder(after.Body).Decode(&afterView); err != nil || afterView.SlotTime != "21:00" {
		t.Fatalf("bulk schedule must be atomic, got slotTime %q (err %v)", afterView.SlotTime, err)
	}

	admin, _ := app.login("admin_user", "TestPass123!")
	adminList := app.do("GET", "/api/contributions", nil, admin)
	adminList.Body.Close()
	if adminList.StatusCode != http.StatusOK {
		t.Fatalf("admin GET contributions: got %d, want 200", adminList.StatusCode)
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

type linkView struct {
	ID        int64  `json:"id"`
	Token     string `json:"token"`
	HasPIN    bool   `json:"hasPin"`
	Active    bool   `json:"active"`
	Responses int    `json:"responses"`
}

// createLink creates an invite link as the couple.
func createLink(t *testing.T, app *testApp) linkView {
	t.Helper()
	cookie, _ := app.login("couple_user", "TestPass123!")
	resp := app.do("POST", "/api/invite-links/", nil, cookie)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create invite link: got %d", resp.StatusCode)
	}
	var link linkView
	if err := json.NewDecoder(resp.Body).Decode(&link); err != nil {
		t.Fatalf("decode link: %v", err)
	}
	return link
}

// submitPath returns the public submit path of a shared invite link.
func (a *testApp) submitPath(t *testing.T) string {
	t.Helper()
	if a.linkToken == "" {
		a.linkToken = createLink(t, a).Token
	}
	return "/api/rsvp/links/" + a.linkToken
}

func linkStatus(t *testing.T, app *testApp, token string, cookie *http.Cookie) (int, bool, bool) {
	t.Helper()
	resp := app.do("GET", "/api/rsvp/links/"+token, nil, cookie)
	defer resp.Body.Close()
	var body struct {
		PINRequired bool `json:"pinRequired"`
		Unlocked    bool `json:"unlocked"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&body)
	return resp.StatusCode, body.PINRequired, body.Unlocked
}

func TestInviteLinkManagement(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	couple, _ := app.login("couple_user", "TestPass123!")
	witness, _ := app.login("witness_user", "TestPass123!")

	forbidden := app.do("POST", "/api/invite-links/", nil, witness)
	forbidden.Body.Close()
	if forbidden.StatusCode != http.StatusForbidden {
		t.Fatalf("witness create link: got %d, want 403", forbidden.StatusCode)
	}
	anon := app.do("GET", "/api/invite-links/", nil, nil)
	anon.Body.Close()
	if anon.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous list links: got %d, want 401", anon.StatusCode)
	}

	link := createLink(t, app)
	if link.Token == "" || link.HasPIN || !link.Active {
		t.Fatalf("unexpected new link: %+v", link)
	}

	if status, _, _ := linkStatus(t, app, link.Token, nil); status != http.StatusOK {
		t.Fatalf("link status: got %d", status)
	}

	path := fmt.Sprintf("/api/invite-links/%d", link.ID)
	off := app.do("PUT", path+"/active", map[string]any{"active": false}, couple)
	off.Body.Close()
	if off.StatusCode != http.StatusOK {
		t.Fatalf("deactivate: got %d", off.StatusCode)
	}
	if status, _, _ := linkStatus(t, app, link.Token, nil); status != http.StatusNotFound {
		t.Fatalf("inactive link status: got %d, want 404", status)
	}
	blocked := app.do("POST", "/api/rsvp/links/"+link.Token, validResponse(), nil)
	blocked.Body.Close()
	if blocked.StatusCode != http.StatusNotFound {
		t.Fatalf("submit via inactive link: got %d, want 404", blocked.StatusCode)
	}
	on := app.do("PUT", path+"/active", map[string]any{"active": true}, couple)
	on.Body.Close()

	regen := app.do("POST", path+"/regenerate", nil, couple)
	defer regen.Body.Close()
	var rotated linkView
	_ = json.NewDecoder(regen.Body).Decode(&rotated)
	if rotated.Token == "" || rotated.Token == link.Token {
		t.Fatalf("regenerate did not rotate token: %+v", rotated)
	}
	if status, _, _ := linkStatus(t, app, link.Token, nil); status != http.StatusNotFound {
		t.Fatalf("old token after regenerate: got %d, want 404", status)
	}

	created := app.do("POST", "/api/rsvp/links/"+rotated.Token, validResponse(), nil)
	created.Body.Close()
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("submit via link: got %d", created.StatusCode)
	}
	list := app.do("GET", "/api/invite-links/", nil, couple)
	defer list.Body.Close()
	var listBody struct {
		Links []linkView `json:"links"`
	}
	_ = json.NewDecoder(list.Body).Decode(&listBody)
	if len(listBody.Links) != 1 || listBody.Links[0].Responses != 1 {
		t.Fatalf("list links: %+v", listBody.Links)
	}

	del := app.do("DELETE", path, nil, couple)
	del.Body.Close()
	if del.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: got %d", del.StatusCode)
	}
	responses := app.do("GET", "/api/responses", nil, couple)
	defer responses.Body.Close()
	raw, _ := io.ReadAll(responses.Body)
	if !strings.Contains(string(raw), "Familie Muster") {
		t.Fatalf("responses must survive link deletion: %s", raw)
	}
}

func TestInviteLinkPIN(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	couple, _ := app.login("couple_user", "TestPass123!")
	link := createLink(t, app)
	path := fmt.Sprintf("/api/invite-links/%d", link.ID)

	short := app.do("PUT", path+"/pin", map[string]any{"pin": "12"}, couple)
	short.Body.Close()
	if short.StatusCode != http.StatusBadRequest {
		t.Fatalf("short pin: got %d, want 400", short.StatusCode)
	}
	set := app.do("PUT", path+"/pin", map[string]any{"pin": "2027"}, couple)
	defer set.Body.Close()
	var withPIN linkView
	_ = json.NewDecoder(set.Body).Decode(&withPIN)
	if !withPIN.HasPIN {
		t.Fatalf("expected hasPin after set: %+v", withPIN)
	}

	if _, required, unlocked := linkStatus(t, app, link.Token, nil); !required || unlocked {
		t.Fatalf("status before unlock: required=%v unlocked=%v", required, unlocked)
	}
	locked := app.do("POST", "/api/rsvp/links/"+link.Token, validResponse(), nil)
	locked.Body.Close()
	if locked.StatusCode != http.StatusUnauthorized {
		t.Fatalf("submit without pin: got %d, want 401", locked.StatusCode)
	}
	wrong := app.do("POST", "/api/rsvp/links/"+link.Token+"/unlock", map[string]any{"pin": "0000"}, nil)
	wrong.Body.Close()
	if wrong.StatusCode != http.StatusUnauthorized || len(wrong.Cookies()) != 0 {
		t.Fatalf("wrong pin: got %d with %d cookies", wrong.StatusCode, len(wrong.Cookies()))
	}
	ok := app.do("POST", "/api/rsvp/links/"+link.Token+"/unlock", map[string]any{"pin": "2027"}, nil)
	ok.Body.Close()
	if ok.StatusCode != http.StatusNoContent || len(ok.Cookies()) != 1 {
		t.Fatalf("unlock: got %d with %d cookies", ok.StatusCode, len(ok.Cookies()))
	}
	cookie := ok.Cookies()[0]
	if !cookie.HttpOnly {
		t.Fatalf("expected HttpOnly cookie, got %+v", cookie)
	}
	if _, _, unlocked := linkStatus(t, app, link.Token, cookie); !unlocked {
		t.Fatal("status with cookie should be unlocked")
	}
	created := app.do("POST", "/api/rsvp/links/"+link.Token, validResponse(), cookie)
	created.Body.Close()
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("submit with pin: got %d, want 201", created.StatusCode)
	}
	forged := &http.Cookie{Name: cookie.Name, Value: "0000"}
	rejected := app.do("POST", "/api/rsvp/links/"+link.Token, validResponse(), forged)
	rejected.Body.Close()
	if rejected.StatusCode != http.StatusUnauthorized {
		t.Fatalf("forged cookie: got %d, want 401", rejected.StatusCode)
	}

	// Changing the PIN invalidates existing proofs; removing it opens the link.
	changed := app.do("PUT", path+"/pin", map[string]any{"pin": "9999"}, couple)
	changed.Body.Close()
	stale := app.do("POST", "/api/rsvp/links/"+link.Token, validResponse(), cookie)
	stale.Body.Close()
	if stale.StatusCode != http.StatusUnauthorized {
		t.Fatalf("stale cookie after pin change: got %d, want 401", stale.StatusCode)
	}
	removed := app.do("PUT", path+"/pin", map[string]any{"pin": ""}, couple)
	defer removed.Body.Close()
	var open linkView
	_ = json.NewDecoder(removed.Body).Decode(&open)
	if open.HasPIN {
		t.Fatalf("expected pin removed: %+v", open)
	}
	free := app.do("POST", "/api/rsvp/links/"+link.Token, validResponse(), nil)
	free.Body.Close()
	if free.StatusCode != http.StatusCreated {
		t.Fatalf("submit after pin removal: got %d, want 201", free.StatusCode)
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

func TestStaffEditsResponse(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	created := submitResponse(t, app, withContribution(validResponse()))
	path := fmt.Sprintf("/api/responses/%d", created.ID)

	for _, user := range []string{"couple_user", "witness_user", "admin_user"} {
		cookie, _ := app.login(user, "TestPass123!")
		body := validResponse()
		body["contactName"] = "Geändert von " + user
		body["contribution"] = map[string]any{"title": "Eingeschleust", "messengers": []map[string]string{{"kind": "signal", "handle": "1"}}}
		resp := app.do("PUT", path, body, cookie)
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("%s PUT %s: got %d, body %s", user, path, resp.StatusCode, raw)
		}
		if !strings.Contains(string(raw), body["contactName"].(string)) {
			t.Fatalf("%s: updated name missing in %s", user, raw)
		}
		for _, leak := range []string{"contribution", "Kleine Rede", "Eingeschleust"} {
			if strings.Contains(string(raw), leak) {
				t.Fatalf("%s: staff view leaks %q", user, leak)
			}
		}
	}

	// The guest's contribution survived every staff edit untouched.
	guest := app.do("GET", "/api/rsvp/"+created.EditToken, nil, nil)
	defer guest.Body.Close()
	var view responseView
	if err := json.NewDecoder(guest.Body).Decode(&view); err != nil {
		t.Fatalf("decode guest view: %v", err)
	}
	if view.Contribution == nil || view.Contribution.Title != "Kleine Rede" {
		t.Fatalf("contribution changed by staff edit: %+v", view.Contribution)
	}

	// Witness edits the contribution content; status and notes are unaffected.
	witness, _ := app.login("witness_user", "TestPass123!")
	cid := contributionID(t, app)
	edit := app.do("PUT", fmt.Sprintf("/api/contributions/%d", cid), map[string]any{
		"title": "Lied", "messengers": []map[string]string{{"kind": "telegram", "handle": "+49 170 7654321"}},
	}, witness)
	raw, _ := io.ReadAll(edit.Body)
	edit.Body.Close()
	if edit.StatusCode != http.StatusOK || !strings.Contains(string(raw), `"title":"Lied"`) || !strings.Contains(string(raw), `"status":"new"`) {
		t.Fatalf("witness edit contribution: got %d, body %s", edit.StatusCode, raw)
	}
	couple, _ := app.login("couple_user", "TestPass123!")
	if resp := app.do("PUT", fmt.Sprintf("/api/contributions/%d", cid), map[string]any{"title": "x", "messengers": []map[string]string{{"kind": "signal", "handle": "1"}}}, couple); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("couple edit contribution: got %d", resp.StatusCode)
	}

	// Declining on behalf of the guest drops the contribution.
	decline := validResponse()
	decline["status"] = "no"
	decline["attendees"] = []map[string]any{}
	if resp := app.do("PUT", path, decline, couple); resp.StatusCode != http.StatusOK {
		t.Fatalf("decline: got %d", resp.StatusCode)
	}
	if resp := app.do("GET", "/api/contributions", nil, witness); !bodyContains(t, resp, `"contributions":[]`) {
		t.Fatal("contribution should be gone after decline")
	}

	// Delete removes the response for guests too.
	if resp := app.do("DELETE", path, nil, couple); resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: got %d", resp.StatusCode)
	}
	if resp := app.do("GET", "/api/rsvp/"+created.EditToken, nil, nil); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("deleted response still readable: %d", resp.StatusCode)
	}
	if resp := app.do("DELETE", path, nil, couple); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("second delete: got %d", resp.StatusCode)
	}
}

func bodyContains(t *testing.T, resp *http.Response, needle string) bool {
	t.Helper()
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return strings.Contains(string(raw), needle)
}

func TestRSVP_ChildDetails(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	view := submitResponse(t, app, validResponse())
	adult, child := view.Attendees[0], view.Attendees[1]
	if adult.Age != 0 || !adult.PhotoOK {
		t.Errorf("adult: got age %d photoOk %v, want 0 true", adult.Age, adult.PhotoOK)
	}
	if child.Age != 6 || child.PhotoOK {
		t.Errorf("child: got age %d photoOk %v, want 6 false", child.Age, child.PhotoOK)
	}

	body := validResponse()
	body["attendees"] = []map[string]any{{"name": "Mia", "isChild": true, "age": 40}}
	resp := app.do("POST", app.submitPath(t), body, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("age 40: got %d, want 400", resp.StatusCode)
	}
}

func TestInviteLinkPINAttemptLimit(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	couple, _ := app.login("couple_user", "TestPass123!")
	link := createLink(t, app)
	set := app.do("PUT", fmt.Sprintf("/api/invite-links/%d/pin", link.ID), map[string]any{"pin": "2027"}, couple)
	set.Body.Close()

	unlock := "/api/rsvp/links/" + link.Token + "/unlock"
	for i := range 10 {
		wrong := app.do("POST", unlock, map[string]any{"pin": "0000"}, nil)
		wrong.Body.Close()
		if wrong.StatusCode != http.StatusUnauthorized {
			t.Fatalf("wrong pin %d: got %d, want 401", i+1, wrong.StatusCode)
		}
	}
	blocked := app.do("POST", unlock, map[string]any{"pin": "2027"}, nil)
	blocked.Body.Close()
	if blocked.StatusCode != http.StatusTooManyRequests || blocked.Header.Get("Retry-After") == "" {
		t.Fatalf("after 10 wrong pins: got %d, want 429 with Retry-After", blocked.StatusCode)
	}

	other := createLink(t, app)
	setOther := app.do("PUT", fmt.Sprintf("/api/invite-links/%d/pin", other.ID), map[string]any{"pin": "2027"}, couple)
	setOther.Body.Close()
	ok := app.do("POST", "/api/rsvp/links/"+other.Token+"/unlock", map[string]any{"pin": "2027"}, nil)
	ok.Body.Close()
	if ok.StatusCode != http.StatusNoContent {
		t.Fatalf("other link: got %d, want 204", ok.StatusCode)
	}
}

func TestImageUpload(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	couple, _ := app.login("couple_user", "TestPass123!")
	witness, _ := app.login("witness_user", "TestPass123!")

	png := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)
	upload := func(body []byte, cookie *http.Cookie) *http.Response {
		req, err := http.NewRequest(http.MethodPost, app.srv.URL+"/api/uploads", bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Origin", "http://localhost")
		if cookie != nil {
			req.AddCookie(cookie)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return resp
	}

	if resp := upload(png, nil); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous upload: got %d", resp.StatusCode)
	}
	if resp := upload(png, witness); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("witness upload: got %d", resp.StatusCode)
	}
	if resp := upload([]byte("<svg onload=alert(1)>"), couple); resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("svg upload: got %d", resp.StatusCode)
	}
	if resp := upload(make([]byte, 9<<20), couple); resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized upload: got %d", resp.StatusCode)
	}

	resp := upload(png, couple)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("upload: got %d", resp.StatusCode)
	}
	var out struct{ URL string }
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(out.URL, "/uploads/") || !strings.HasSuffix(out.URL, ".png") {
		t.Fatalf("unexpected url %q", out.URL)
	}
	if got := app.do(http.MethodGet, out.URL, nil, nil); got.StatusCode != http.StatusOK {
		t.Fatalf("serve upload: got %d", got.StatusCode)
	}
}

func TestUserManagement(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	admin, _ := app.login("admin_user", "TestPass123!")
	couple, _ := app.login("couple_user", "TestPass123!")

	newUser := map[string]any{"username": "trauzeugin", "displayName": "Anna", "role": "witness", "password": "LongEnough123"}

	if res := app.do(http.MethodPost, "/api/users/", newUser, couple); res.StatusCode != http.StatusForbidden {
		t.Fatalf("couple create: got %d, want 403", res.StatusCode)
	}
	if res := app.do(http.MethodPost, "/api/users/", map[string]any{"username": "x", "role": "witness", "password": "short"}, admin); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("short password: got %d, want 400", res.StatusCode)
	}
	if res := app.do(http.MethodPost, "/api/users/", map[string]any{"username": "x", "role": "king", "password": "LongEnough123"}, admin); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown role: got %d, want 400", res.StatusCode)
	}

	res := app.do(http.MethodPost, "/api/users/", newUser, admin)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create: got %d, want 201", res.StatusCode)
	}
	var created struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(res.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	if res := app.do(http.MethodPost, "/api/users/", newUser, admin); res.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate: got %d, want 409", res.StatusCode)
	}
	if _, status := app.login("trauzeugin", "LongEnough123"); status != http.StatusOK {
		t.Fatalf("login new user: got %d", status)
	}

	path := fmt.Sprintf("/api/users/%d", created.ID)
	if res := app.do(http.MethodPut, path+"/password", map[string]any{"password": "AnotherLong456"}, admin); res.StatusCode != http.StatusNoContent {
		t.Fatalf("set password: got %d, want 204", res.StatusCode)
	}
	if _, status := app.login("trauzeugin", "AnotherLong456"); status != http.StatusOK {
		t.Fatalf("login with new password: got %d", status)
	}
	if res := app.do(http.MethodPut, path+"/active", map[string]any{"active": false}, admin); res.StatusCode != http.StatusNoContent {
		t.Fatalf("deactivate: got %d, want 204", res.StatusCode)
	}
	if _, status := app.login("trauzeugin", "AnotherLong456"); status == http.StatusOK {
		t.Fatal("deactivated user can still log in")
	}

	// An admin must not lock themselves out.
	me := app.do(http.MethodGet, "/api/auth/me", nil, admin)
	var self struct {
		User struct {
			ID int64 `json:"id"`
		} `json:"user"`
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(me.Body).Decode(&self); err != nil {
		t.Fatal(err)
	}
	id := self.ID
	if id == 0 {
		id = self.User.ID
	}
	if res := app.do(http.MethodPut, fmt.Sprintf("/api/users/%d/active", id), map[string]any{"active": false}, admin); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("self deactivate: got %d, want 400", res.StatusCode)
	}
}

func TestUserSetupLink(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	admin, _ := app.login("admin_user", "TestPass123!")
	couple, _ := app.login("couple_user", "TestPass123!")

	tokenOf := func(res *http.Response) string {
		t.Helper()
		var body struct {
			ID       int64  `json:"id"`
			SetupURL string `json:"setupUrl"`
		}
		if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		i := strings.LastIndex(body.SetupURL, "/setup/")
		if i < 0 {
			t.Fatalf("no setup url in response: %q", body.SetupURL)
		}
		return body.SetupURL[i+len("/setup/"):]
	}

	res := app.do(http.MethodPost, "/api/users/", map[string]any{"username": "neu", "role": "witness"}, admin)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create without password: got %d, want 201", res.StatusCode)
	}
	first := tokenOf(res)

	if res := app.do(http.MethodPost, "/api/users/4/setup-link", nil, couple); res.StatusCode != http.StatusForbidden {
		t.Fatalf("couple setup-link: got %d, want 403", res.StatusCode)
	}
	res = app.do(http.MethodPost, "/api/users/4/setup-link", nil, admin)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("new setup-link: got %d, want 200", res.StatusCode)
	}
	token := tokenOf(res)

	if res := app.do(http.MethodGet, "/api/setup/"+first, nil, nil); res.StatusCode != http.StatusNotFound {
		t.Fatalf("replaced token: got %d, want 404", res.StatusCode)
	}
	if res := app.do(http.MethodGet, "/api/setup/"+token, nil, nil); res.StatusCode != http.StatusOK {
		t.Fatalf("setup info: got %d, want 200", res.StatusCode)
	}
	if res := app.do(http.MethodPost, "/api/setup/"+token, map[string]any{"password": "short"}, nil); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("short password: got %d, want 400", res.StatusCode)
	}
	if res := app.do(http.MethodPost, "/api/setup/"+token, map[string]any{"password": "MyOwnSecret123"}, nil); res.StatusCode != http.StatusNoContent {
		t.Fatalf("redeem: got %d, want 204", res.StatusCode)
	}
	if _, status := app.login("neu", "MyOwnSecret123"); status != http.StatusOK {
		t.Fatalf("login after setup: got %d", status)
	}
	if res := app.do(http.MethodPost, "/api/setup/"+token, map[string]any{"password": "AnotherSecret123"}, nil); res.StatusCode != http.StatusNotFound {
		t.Fatalf("token reuse: got %d, want 404", res.StatusCode)
	}
}

func TestTwoFactorTOTP(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	cookie, _ := app.login("couple_user", "TestPass123!")

	resp := app.do(http.MethodPost, "/api/account/2fa/totp", nil, cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("begin: %d", resp.StatusCode)
	}
	var begin struct{ Secret, URL string }
	json.NewDecoder(resp.Body).Decode(&begin)
	resp.Body.Close()

	// Not confirmed yet: login still works without a code.
	if _, status := app.login("couple_user", "TestPass123!"); status != http.StatusOK {
		t.Fatalf("login before confirm: %d", status)
	}

	resp = app.do(http.MethodPost, "/api/account/2fa/totp/confirm", map[string]string{"code": "000000"}, cookie)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("wrong confirm code: %d", resp.StatusCode)
	}
	resp.Body.Close()

	code, _ := totp.GenerateCode(begin.Secret, time.Now())
	resp = app.do(http.MethodPost, "/api/account/2fa/totp/confirm", map[string]string{"code": code}, cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("confirm: %d", resp.StatusCode)
	}
	var confirmed struct{ RecoveryCodes []string }
	json.NewDecoder(resp.Body).Decode(&confirmed)
	resp.Body.Close()
	if len(confirmed.RecoveryCodes) != 8 {
		t.Fatalf("recovery codes: %d", len(confirmed.RecoveryCodes))
	}

	login := func(code string) (*http.Cookie, int, string) {
		body := map[string]string{"username": "couple_user", "password": "TestPass123!", "code": code}
		resp := app.do(http.MethodPost, "/api/auth/login", body, nil)
		defer resp.Body.Close()
		var e struct{ Error struct{ Code string } }
		json.NewDecoder(resp.Body).Decode(&e)
		var c *http.Cookie
		for _, ck := range resp.Cookies() {
			if ck.Name == auth.SessionCookieName {
				c = ck
			}
		}
		return c, resp.StatusCode, e.Error.Code
	}

	if _, status, code := login(""); status != http.StatusUnauthorized || code != "two_factor_required" {
		t.Fatalf("login without code: %d %s", status, code)
	}
	if _, status, code := login("123456"); status != http.StatusUnauthorized || code != "invalid_code" {
		t.Fatalf("login wrong code: %d %s", status, code)
	}
	// The TOTP code used for confirming cannot be replayed.
	if _, status, _ := login(code); status != http.StatusUnauthorized {
		t.Fatalf("replayed code: %d", status)
	}
	session, status, _ := login(confirmed.RecoveryCodes[0])
	if status != http.StatusOK {
		t.Fatalf("recovery code login: %d", status)
	}
	if _, status, _ := login(confirmed.RecoveryCodes[0]); status != http.StatusUnauthorized {
		t.Fatalf("recovery code reuse: %d", status)
	}

	// Secrets are not stored in plaintext.
	var enc string
	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.QueryRow(`SELECT secret_enc FROM user_totp`).Scan(&enc)
	if enc == "" || strings.Contains(enc, begin.Secret) {
		t.Fatalf("secret stored unencrypted")
	}

	witness, _ := app.login("witness_user", "TestPass123!")
	resp = app.do(http.MethodDelete, "/api/two-factor/1", nil, witness)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("witness reset: %d", resp.StatusCode)
	}
	resp.Body.Close()

	resp = app.do(http.MethodPost, "/api/account/2fa/disable", map[string]string{"code": confirmed.RecoveryCodes[1]}, session)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("disable: %d", resp.StatusCode)
	}
	resp.Body.Close()
	if _, status := app.login("couple_user", "TestPass123!"); status != http.StatusOK {
		t.Fatalf("login after disable: %d", status)
	}
}

func TestPushSubscriptionTopicsByRole(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	couple, _ := app.login("couple_user", "TestPass123!")
	witness, _ := app.login("witness_user", "TestPass123!")

	resp := app.do(http.MethodGet, "/api/push/key", nil, nil)
	var key struct{ Key string }
	json.NewDecoder(resp.Body).Decode(&key)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || key.Key == "" {
		t.Fatalf("push key: %d %q", resp.StatusCode, key.Key)
	}

	subscribe := func(cookie *http.Cookie, endpoint string) []string {
		t.Helper()
		resp := app.do(http.MethodPost, "/api/push/subscriptions", map[string]any{
			"endpoint": endpoint,
			"keys":     map[string]string{"p256dh": "k", "auth": "a"},
			"topics":   []string{"broadcast", "responses", "contributions", "bogus"},
		}, cookie)
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("subscribe: %d", resp.StatusCode)
		}
		var out struct{ Topics []string }
		json.NewDecoder(resp.Body).Decode(&out)
		return out.Topics
	}
	if got := subscribe(nil, "https://push.example/g"); len(got) != 1 || got[0] != "broadcast" {
		t.Fatalf("guest topics: %v", got)
	}
	if got := subscribe(couple, "https://push.example/c"); len(got) != 2 {
		t.Fatalf("couple must not get contributions: %v", got)
	}
	if got := subscribe(witness, "https://push.example/w"); len(got) != 3 {
		t.Fatalf("witness topics: %v", got)
	}

	body := map[string]string{"title": "Hallo", "body": "Text"}
	for name, c := range map[string]struct {
		cookie *http.Cookie
		want   int
	}{"anonymous": {nil, 401}, "witness": {witness, 403}} {
		resp := app.do(http.MethodPost, "/api/push/broadcast", body, c.cookie)
		resp.Body.Close()
		if resp.StatusCode != c.want {
			t.Fatalf("%s broadcast: got %d want %d", name, resp.StatusCode, c.want)
		}
	}
	resp = app.do(http.MethodPost, "/api/push/broadcast", map[string]string{"title": ""}, couple)
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty title: %d", resp.StatusCode)
	}
}
