package server_test

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestResponseBelongsToAccount(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	witness, _ := app.login("witness_user", "TestPass123!")
	path := app.submitPath(t)

	view := func(resp *http.Response, want int) responseView {
		t.Helper()
		defer resp.Body.Close()
		if resp.StatusCode != want {
			t.Fatalf("got %d, want %d", resp.StatusCode, want)
		}
		var v responseView
		if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
			t.Fatal(err)
		}
		return v
	}

	if resp := app.do("GET", "/api/rsvp/mine", nil, witness); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("mine before answering: got %d", resp.StatusCode)
	}
	if resp := app.do("GET", "/api/rsvp/mine", nil, nil); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("mine without sign-in: got %d", resp.StatusCode)
	}

	first := view(app.do("POST", path, validResponse(), witness), http.StatusCreated)

	changed := validResponse()
	changed["message"] = "Geändert"
	second := view(app.do("POST", path, changed, witness), http.StatusOK)
	if second.ID != first.ID || second.Message != "Geändert" {
		t.Fatalf("second answer made a new response: %+v", second)
	}

	mine := view(app.do("GET", "/api/rsvp/mine", nil, witness), http.StatusOK)
	if mine.ID != first.ID || mine.EditToken == "" {
		t.Fatalf("mine = %+v", mine)
	}

	guest := submitResponse(t, app, validResponse())
	if guest.ID == first.ID {
		t.Fatal("guest answer reused the account's response")
	}
	couple, _ := app.login("couple_user", "TestPass123!")
	if resp := app.do("GET", "/api/rsvp/mine", nil, couple); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("another account sees a response: got %d", resp.StatusCode)
	}
}

func TestAnswerCreatesGuestAccount(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	admin, _ := app.login("admin_user", "TestPass123!")

	resp := app.do("POST", app.submitPath(t), validResponse(), nil)
	guest := sessionCookie(resp)
	var sent responseView
	_ = json.NewDecoder(resp.Body).Decode(&sent)
	resp.Body.Close()
	if resp.StatusCode != http.StatusCreated || guest == nil {
		t.Fatalf("answer: status %d, session %v", resp.StatusCode, guest)
	}

	me := app.do("GET", "/api/auth/me", nil, guest)
	body := readBody(t, me)
	if !strings.Contains(body, `"role":"guest"`) || !strings.Contains(body, "Familie Muster") {
		t.Fatalf("guest identity: %s", body)
	}
	if mine := app.do("GET", "/api/rsvp/mine", nil, guest); mine.StatusCode != http.StatusOK {
		t.Fatalf("own response: %d", mine.StatusCode)
	}
	for _, path := range []string{"/api/responses/", "/api/content/", "/api/users/", "/api/contributions/", "/api/invite-links/"} {
		if r := app.do("GET", path, nil, guest); r.StatusCode != http.StatusForbidden {
			t.Fatalf("%s as guest: %d", path, r.StatusCode)
		}
	}
	if list := readBody(t, app.do("GET", "/api/users/", nil, admin)); strings.Contains(list, "guest-") {
		t.Fatalf("guest account listed among users: %s", list)
	}

	// Saving through the edit link signs a guest without a session in again.
	back := app.do("PUT", "/api/rsvp/"+sent.EditToken, validResponse(), nil)
	again := sessionCookie(back)
	back.Body.Close()
	if back.StatusCode != http.StatusOK || again == nil || !strings.Contains(readBody(t, app.do("GET", "/api/auth/me", nil, again)), `"role":"guest"`) {
		t.Fatalf("edit link: status %d, session %v", back.StatusCode, again)
	}
	if r := app.do("PUT", "/api/rsvp/"+sent.EditToken, validResponse(), admin); sessionCookie(r) != nil {
		t.Fatal("edit link replaced a staff session")
	}

	// Deleting the response removes the account with it.
	if r := app.do("DELETE", "/api/rsvp/"+sent.EditToken, nil, nil); r.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: %d", r.StatusCode)
	}
	if app.authenticated(guest) {
		t.Fatal("guest account outlived its response")
	}
}

func TestDeleteOwnAccount(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	admin, _ := app.login("admin_user", "TestPass123!")
	resp := app.do(http.MethodDelete, "/api/account/", nil, admin)
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("last administrator: got %d, want 409", resp.StatusCode)
	}

	witness, _ := app.login("witness_user", "TestPass123!")
	resp = app.do(http.MethodPost, app.submitPath(t), validResponse(), witness)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("answer: got %d", resp.StatusCode)
	}
	var own responseView
	_ = json.NewDecoder(resp.Body).Decode(&own)
	resp.Body.Close()
	// The edit link of a staff answer never signs anyone in.
	if r := app.do(http.MethodPut, "/api/rsvp/"+own.EditToken, validResponse(), nil); r.StatusCode != http.StatusOK || sessionCookie(r) != nil {
		t.Fatalf("staff edit link: status %d, session %v", r.StatusCode, sessionCookie(r))
	}
	// Reporting a copied link needs the right to see that link.
	if r := app.do(http.MethodPost, "/api/audit-log/events", map[string]any{"action": "link.copy", "kind": "invite-link", "id": 1}, witness); r.StatusCode != http.StatusForbidden {
		t.Fatalf("link copy without permission: got %d, want 403", r.StatusCode)
	}

	// A session that is no longer fresh has to sign in again first.
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	age := func(d time.Duration) {
		if _, err := db.Exec("UPDATE sessions SET created_at = ?", time.Now().Add(-d)); err != nil {
			t.Fatal(err)
		}
	}
	age(time.Hour)
	if r := app.do(http.MethodDelete, "/api/account/", nil, witness); r.StatusCode != http.StatusForbidden {
		t.Fatalf("stale session: got %d, want 403", r.StatusCode)
	}
	age(0)
	resp = app.do(http.MethodDelete, "/api/account/", nil, witness)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete account: got %d, want 204", resp.StatusCode)
	}
	if _, status := app.login("witness_user", "TestPass123!"); status == http.StatusOK {
		t.Fatal("deleted account can still sign in")
	}
	resp = app.do(http.MethodGet, "/api/responses/", nil, admin)
	if body := readBody(t, resp); strings.Contains(body, `"contactName"`) {
		t.Fatalf("response of the deleted account is still there: %s", body)
	}
}
