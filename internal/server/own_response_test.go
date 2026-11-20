package server_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
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

	// Deleting the response removes the account with it.
	if r := app.do("DELETE", "/api/rsvp/"+sent.EditToken, nil, nil); r.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: %d", r.StatusCode)
	}
	if app.authenticated(guest) {
		t.Fatal("guest account outlived its response")
	}
}
