package server_test

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

type auditEntry struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Action   string `json:"action"`
	Target   string `json:"target"`
}

func auditEntries(t *testing.T, app *testApp, admin *http.Cookie, query string) []auditEntry {
	t.Helper()
	resp := app.do("GET", "/api/audit-log/"+query, nil, admin)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("audit log: got %d", resp.StatusCode)
	}
	var out struct {
		Entries []auditEntry `json:"entries"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode audit log: %v", err)
	}
	return out.Entries
}

func TestAuditLog(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	if _, status := app.login("couple_user", "wrong-password"); status != http.StatusUnauthorized {
		t.Fatalf("wrong login: got %d", status)
	}
	couple, _ := app.login("couple_user", "TestPass123!")
	admin, _ := app.login("admin_user", "TestPass123!")

	link := createLink(t, app)
	app.linkToken = link.Token
	view := submitResponse(t, app, validResponse())
	secret := "audit-secret-message"
	body := validResponse()
	body["message"] = secret
	resp := app.do("PUT", fmt.Sprintf("/api/responses/%d", view.ID), body, couple)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("staff edit: got %d", resp.StatusCode)
	}
	resp = app.do("PUT", "/api/responses/999999", body, couple)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("edit unknown: got %d", resp.StatusCode)
	}
	resp = app.do("POST", "/api/audit-log/events", map[string]any{"action": "link.copy", "kind": "response", "id": view.ID}, couple)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("copy event: got %d", resp.StatusCode)
	}
	resp = app.do("POST", "/api/audit-log/events", map[string]any{"action": "anything", "kind": "response", "id": view.ID}, couple)
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown event: got %d", resp.StatusCode)
	}
	resp = app.do("DELETE", fmt.Sprintf("/api/responses/%d", view.ID), nil, couple)
	resp.Body.Close()
	resp = app.do("POST", "/api/auth/logout", nil, couple)
	resp.Body.Close()

	for name, cookie := range map[string]*http.Cookie{"couple": couple, "anonymous": nil} {
		resp := app.do("GET", "/api/audit-log/", nil, cookie)
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			t.Fatalf("%s may read the audit log", name)
		}
	}

	entries := auditEntries(t, app, admin, "")
	want := []string{
		"couple_user|logout|",
		fmt.Sprintf("couple_user|DELETE /api/responses/{id}|id=%d", view.ID),
		fmt.Sprintf("couple_user|link.copy|response=%d", view.ID),
		fmt.Sprintf("couple_user|PUT /api/responses/{id}|id=%d", view.ID),
		"couple_user|POST /api/invite-links|",
		"couple_user|login|",
		"admin_user|login|",
		"couple_user|login|",
		"couple_user|login.failed|",
	}
	if len(entries) != len(want) {
		t.Fatalf("entries: got %d (%v), want %d", len(entries), entries, len(want))
	}
	for i, e := range entries {
		if got := e.Username + "|" + e.Action + "|" + e.Target; got != want[i] {
			t.Errorf("entry %d: got %q, want %q", i, got, want[i])
		}
	}

	page := auditEntries(t, app, admin, fmt.Sprintf("?limit=2&before=%d", entries[1].ID))
	if len(page) != 2 || page[0].ID != entries[2].ID {
		t.Fatalf("paging: got %v", page)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var all string
	if err := db.QueryRow(`SELECT group_concat(username || action || target, ' ') FROM audit_log`).Scan(&all); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(all, secret) {
		t.Fatal("audit log holds response content")
	}
	for _, stmt := range []string{`DELETE FROM audit_log`, `UPDATE audit_log SET username = 'x'`} {
		if _, err := db.Exec(stmt); err == nil {
			t.Fatalf("%q succeeded on append-only log", stmt)
		}
	}
}
