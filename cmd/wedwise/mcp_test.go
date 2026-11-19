package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMCP(t *testing.T) {
	var saved map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Errorf("request without the sign-in: %s", r.URL.Path)
		}
		switch {
		case r.URL.Path == "/api/content/" && r.Method == http.MethodGet:
			_, _ = w.Write([]byte(`{"names":["Anna"],"date":"","faq":[],"theme":"sage-leaf"}`))
		case r.URL.Path == "/api/content/" && r.Method == http.MethodPut:
			_ = json.NewDecoder(r.Body).Decode(&saved)
		case r.URL.Path == "/api/invite-links/" && r.Method == http.MethodGet:
			_, _ = w.Write([]byte(`{"links":[{"id":1,"token":"abc"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	input := strings.Join([]string{
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"update_content","arguments":{"content":{"date":"2028-05-20"}}}}`,
		`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_invite_links","arguments":{}}}`,
		`{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"nope"}}`,
		`{"jsonrpc":"2.0","id":6,"method":"other"}`,
	}, "\n")
	var out bytes.Buffer
	if err := serveMCP(Site{URL: server.URL, Token: "secret", host: "test"}, strings.NewReader(input), &out); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 6 {
		t.Fatalf("got %d answers, want 6 (the notification gets none):\n%s", len(lines), out.String())
	}
	if !strings.Contains(lines[0], mcpVersion) || !strings.Contains(lines[1], `"update_content"`) {
		t.Errorf("handshake or tool list wrong:\n%s\n%s", lines[0], lines[1])
	}
	if saved["date"] != "2028-05-20" || saved["theme"] != "sage-leaf" {
		t.Errorf("update must change one section and keep the others, saved %v", saved)
	}
	if !strings.Contains(lines[3], "/rsvp/abc") || strings.Contains(lines[3], `token`) {
		t.Errorf("invite links should come as addresses: %s", lines[3])
	}
	if !strings.Contains(lines[4], `"isError":true`) || !strings.Contains(lines[5], "-32601") {
		t.Errorf("unknown tool or method not reported:\n%s\n%s", lines[4], lines[5])
	}
}
