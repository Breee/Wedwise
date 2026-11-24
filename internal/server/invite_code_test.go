package server_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Breee/Wedwise/internal/rsvp"
)

func TestInviteCodeOpensLink(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	couple, _ := app.login("couple_user", "TestPass123!")
	witness, _ := app.login("witness_user", "TestPass123!")

	resp := app.do("POST", "/api/invite-links/", nil, couple)
	var link struct {
		ID    int64  `json:"id"`
		Token string `json:"token"`
		Code  string `json:"code"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&link); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if len(link.Code) != 6 || strings.ContainsAny(link.Code, "0O1IL") {
		t.Fatalf("code: %q", link.Code)
	}

	open := func(code string) (int, string) {
		resp := app.do("POST", "/api/rsvp/code", map[string]any{"code": code}, nil)
		defer resp.Body.Close()
		var out struct {
			Link string `json:"link"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&out)
		return resp.StatusCode, out.Link
	}
	typed := strings.ToLower(link.Code[:3]) + " " + link.Code[3:]
	if status, token := open(typed); status != http.StatusOK || token != link.Token {
		t.Fatalf("open: got %d %q", status, token)
	}

	// The code stands in for the link's PIN.
	resp = app.do("PUT", fmt.Sprintf("/api/invite-links/%d/pin", link.ID), map[string]any{"pin": "4711"}, couple)
	resp.Body.Close()
	unlocked := func(cookie *http.Cookie) bool {
		resp := app.do("GET", "/api/rsvp/links/"+link.Token, nil, cookie)
		defer resp.Body.Close()
		var out struct {
			Unlocked bool `json:"unlocked"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&out)
		return out.Unlocked
	}
	if unlocked(nil) {
		t.Fatal("link with a PIN is open without code or PIN")
	}
	resp = app.do("POST", "/api/rsvp/code", map[string]any{"code": link.Code}, nil)
	resp.Body.Close()
	if cookies := resp.Cookies(); len(cookies) != 1 || !unlocked(cookies[0]) {
		t.Fatalf("code did not open the link with a PIN: %v", cookies)
	}

	resp = app.do("PUT", namePath, map[string]any{"name": "Anna & Ben"}, witness)
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("witness sets name: got %d, want 403", resp.StatusCode)
	}
	resp = app.do("PUT", namePath, map[string]any{"name": strings.Repeat("x", 81)}, couple)
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("long name: got %d, want 400", resp.StatusCode)
	}
	resp = app.do("PUT", namePath, map[string]any{"name": " Anna & Ben "}, couple)
	resp.Body.Close()
	resp = app.do("GET", "/api/rsvp/links/"+link.Token, nil, nil)
	var status struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&status)
	resp.Body.Close()
	if status.Name != "Anna & Ben" {
		t.Fatalf("greeting: %q", status.Name)
	}

	// A new link retires the old code; a switched-off link does not open.
	resp = app.do("POST", fmt.Sprintf("/api/invite-links/%d/regenerate", link.ID), nil, couple)
	old := link.Code
	_ = json.NewDecoder(resp.Body).Decode(&link)
	resp.Body.Close()
	if link.Code == old {
		t.Fatal("regenerate kept the code")
	}
	if status, _ := open(old); status != http.StatusNotFound {
		t.Fatalf("old code: got %d, want 404", status)
	}
	resp = app.do("PUT", fmt.Sprintf("/api/invite-links/%d/active", link.ID), map[string]any{"active": false}, couple)
	resp.Body.Close()
	if status, _ := open(link.Code); status != http.StatusNotFound {
		t.Fatalf("inactive link: got %d, want 404", status)
	}

	// Two wrong codes are spent; the rest of the allowance locks the address out.
	for i := 2; i < rsvp.CodeFailureLimit; i++ {
		if status, _ := open("ZZZZZZ"); status != http.StatusNotFound {
			t.Fatalf("wrong code %d: got %d, want 404", i, status)
		}
	}
	if status, _ := open("ZZZZZZ"); status != http.StatusTooManyRequests {
		t.Fatalf("after too many wrong codes: got %d, want 429", status)
	}
}
