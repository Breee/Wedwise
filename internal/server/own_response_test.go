package server_test

import (
	"encoding/json"
	"net/http"
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
