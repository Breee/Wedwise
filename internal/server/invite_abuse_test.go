package server_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Breee/Wedwise/internal/rsvp"
)

func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return string(raw)
}

func TestInviteLinkResponseCap(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	couple, _ := app.login("couple_user", "TestPass123!")
	witness, _ := app.login("witness_user", "TestPass123!")
	link := createLink(t, app)
	app.linkToken = link.Token
	limitPath := fmt.Sprintf("/api/invite-links/%d/limit", link.ID)

	for name, body := range map[string]any{"negative": map[string]any{"maxResponses": -1}, "too high": map[string]any{"maxResponses": 10001}} {
		resp := app.do("PUT", limitPath, body, couple)
		resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("%s limit: got %d, want 400", name, resp.StatusCode)
		}
	}
	resp := app.do("PUT", limitPath, map[string]any{"maxResponses": 1}, witness)
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("witness sets limit: got %d, want 403", resp.StatusCode)
	}

	resp = app.do("PUT", limitPath, map[string]any{"maxResponses": 1}, couple)
	var updated struct {
		MaxResponses int `json:"maxResponses"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&updated)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || updated.MaxResponses != 1 {
		t.Fatalf("set limit: got %d, maxResponses %d", resp.StatusCode, updated.MaxResponses)
	}

	first := submitResponse(t, app, validResponse())

	resp = app.do("POST", app.submitPath(t), validResponse(), nil)
	raw := readBody(t, resp)
	if resp.StatusCode != http.StatusForbidden || !strings.Contains(raw, rsvp.CodeLinkFull) {
		t.Fatalf("submit over cap: got %d, body %s", resp.StatusCode, raw)
	}

	// Guests who already answered can still edit.
	resp = app.do("PUT", "/api/rsvp/"+first.EditToken, validResponse(), nil)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("edit on full link: got %d", resp.StatusCode)
	}

	resp = app.do("PUT", limitPath, map[string]any{"maxResponses": 0}, couple)
	resp.Body.Close()
	submitResponse(t, app, validResponse())
}

func TestInviteLinkSubmitRateLimit(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	submit := func(path string) int {
		resp := app.do("POST", path, validResponse(), nil)
		resp.Body.Close()
		return resp.StatusCode
	}

	path := app.submitPath(t)
	for i := 0; i < rsvp.LinkSubmitLimit; i++ {
		if status := submit(path); status != http.StatusCreated {
			t.Fatalf("submit %d: got %d, want 201", i+1, status)
		}
	}
	if status := submit(path); status != http.StatusTooManyRequests {
		t.Fatalf("submit over link limit: got %d, want 429", status)
	}

	other := "/api/rsvp/links/" + createLink(t, app).Token
	if status := submit(other); status != http.StatusCreated {
		t.Fatalf("submit through another link: got %d, want 201", status)
	}
}

func TestStaffBulkDeletesResponses(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	couple, _ := app.login("couple_user", "TestPass123!")
	link := createLink(t, app)
	app.linkToken = link.Token

	a := submitResponse(t, app, validResponse())
	b := submitResponse(t, app, withContribution(validResponse()))
	keep := submitResponse(t, app, validResponse())

	resp := app.do("GET", "/api/responses/", nil, couple)
	var list struct {
		Responses []struct {
			ID           int64  `json:"id"`
			InviteLinkID *int64 `json:"inviteLinkId"`
		} `json:"responses"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&list)
	resp.Body.Close()
	if len(list.Responses) != 3 {
		t.Fatalf("responses: got %d, want 3", len(list.Responses))
	}
	for _, r := range list.Responses {
		if r.InviteLinkID == nil || *r.InviteLinkID != link.ID {
			t.Fatalf("response %d: invite link id %v, want %d", r.ID, r.InviteLinkID, link.ID)
		}
	}

	// Guests never learn which link they used.
	resp = app.do("GET", "/api/rsvp/"+keep.EditToken, nil, nil)
	if raw := readBody(t, resp); strings.Contains(raw, "inviteLinkId") {
		t.Fatalf("guest view exposes the invite link: %s", raw)
	}

	for name, tc := range map[string]struct {
		cookie *http.Cookie
		body   any
		want   int
	}{
		"anonymous": {nil, map[string]any{"ids": []int64{a.ID}}, http.StatusUnauthorized},
		"empty":     {couple, map[string]any{"ids": []int64{}}, http.StatusBadRequest},
	} {
		resp := app.do("POST", "/api/responses/delete", tc.body, tc.cookie)
		resp.Body.Close()
		if resp.StatusCode != tc.want {
			t.Fatalf("%s bulk delete: got %d, want %d", name, resp.StatusCode, tc.want)
		}
	}

	resp = app.do("POST", "/api/responses/delete", map[string]any{"ids": []int64{a.ID, b.ID, 99999}}, couple)
	var result struct {
		Deleted int `json:"deleted"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&result)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || result.Deleted != 2 {
		t.Fatalf("bulk delete: got %d, deleted %d", resp.StatusCode, result.Deleted)
	}

	for token, want := range map[string]int{a.EditToken: http.StatusNotFound, b.EditToken: http.StatusNotFound, keep.EditToken: http.StatusOK} {
		resp := app.do("GET", "/api/rsvp/"+token, nil, nil)
		resp.Body.Close()
		if resp.StatusCode != want {
			t.Fatalf("response after bulk delete: got %d, want %d", resp.StatusCode, want)
		}
	}

	witness, _ := app.login("witness_user", "TestPass123!")
	resp = app.do("GET", "/api/contributions/", nil, witness)
	if raw := readBody(t, resp); strings.Contains(raw, `"responseId":`+fmt.Sprint(b.ID)) {
		t.Fatalf("contribution of a deleted response is still listed: %s", raw)
	}
}
