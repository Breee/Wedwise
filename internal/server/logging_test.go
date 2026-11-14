package server_test

import (
	"bytes"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"testing"
)

type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func TestRequestLogHasNoTokens(t *testing.T) {
	logs := &syncBuffer{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	app, _ := newTestAppWithUsers(t)
	link := createLink(t, app)
	view := submitResponse(t, app, validResponse())

	for _, path := range []string{
		"/api/rsvp/links/" + link.Token,
		"/api/rsvp/" + view.EditToken,
		"/rsvp/" + link.Token,
		"/api/rsvp/links/unknown-secret-guess",
	} {
		app.do(http.MethodGet, path, nil, nil).Body.Close()
	}

	out := logs.String()
	for _, secret := range []string{link.Token, view.EditToken, app.linkToken, "unknown-secret-guess"} {
		if secret != "" && strings.Contains(out, secret) {
			t.Errorf("request log contains %q", secret)
		}
	}
	for _, want := range []string{"/api/rsvp/links/{link}", "/api/rsvp/{token}", "/rsvp/[redacted]"} {
		if !strings.Contains(out, want) {
			t.Errorf("request log lacks %q", want)
		}
	}
}
