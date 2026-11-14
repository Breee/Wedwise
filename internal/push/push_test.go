package push

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/Breee/Wedwise/internal/database"
)

func TestSendByTopicAndCleanup(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	s, err := NewService(ctx, db, "https://example.org")
	if err != nil {
		t.Fatal(err)
	}
	again, err := NewService(ctx, db, "https://example.org")
	if err != nil || again.PublicKey() != s.PublicKey() || s.PublicKey() == "" {
		t.Fatalf("VAPID key must be stable: %v", err)
	}

	if err := s.Subscribe(ctx, Subscription{Endpoint: "http://insecure", P256dh: "k", Auth: "a"}); err != ErrValidation {
		t.Fatalf("want ErrValidation, got %v", err)
	}
	for endpoint, topics := range map[string][]string{
		"https://push.example/guest": {TopicBroadcast},
		"https://push.example/staff": {TopicBroadcast, TopicResponses},
		"https://push.example/gone":  {TopicBroadcast},
	} {
		if err := s.Subscribe(ctx, Subscription{Endpoint: endpoint, P256dh: "k", Auth: "a", Topics: topics}); err != nil {
			t.Fatal(err)
		}
	}

	var got []string
	s.send = func(_ context.Context, _ []byte, sub Subscription) (int, error) {
		got = append(got, sub.Endpoint)
		if sub.Endpoint == "https://push.example/gone" {
			return 410, nil
		}
		return 201, nil
	}
	if sent, err := s.Send(ctx, TopicResponses, Message{Title: "x"}); err != nil || sent != 1 {
		t.Fatalf("responses: sent %d, err %v", sent, err)
	}
	got = nil
	if sent, err := s.Send(ctx, TopicBroadcast, Message{Title: "x"}); err != nil || sent != 2 || len(got) != 3 {
		t.Fatalf("broadcast: sent %d, tried %d, err %v", sent, len(got), err)
	}
	if topics, _ := s.Topics(ctx, "https://push.example/gone"); len(topics) != 0 {
		t.Fatal("gone subscription must be removed")
	}
}

func TestValidEndpoint(t *testing.T) {
	cases := map[string]bool{
		"https://fcm.googleapis.com/fcm/send/abc":    true,
		"https://updates.push.services.mozilla.com/": true,
		"https://web.push.apple.com:443/x":           true,
		"https://8.8.8.8/x":                          true,
		"http://fcm.googleapis.com/x":                false,
		"https://localhost/x":                        false,
		"https://db/x":                               false,
		"https://127.0.0.1/x":                        false,
		"https://10.0.0.5/x":                         false,
		"https://192.168.1.1/x":                      false,
		"https://169.254.169.254/latest/meta-data":   false,
		"https://100.64.0.1/x":                       false,
		"https://[::1]/x":                            false,
		"https://[fd00::1]/x":                        false,
		"https://[::ffff:10.0.0.1]/x":                false,
		"https://example.org:8443/x":                 false,
		"https://user:pw@example.org/x":              false,
	}
	for endpoint, want := range cases {
		if got := validEndpoint(endpoint); got != want {
			t.Errorf("validEndpoint(%q) = %v, want %v", endpoint, got, want)
		}
	}
}

func TestClientRefusesInternalAddresses(t *testing.T) {
	internal := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("internal server was reached")
	}))
	defer internal.Close()

	_, err := newClient().Get(internal.URL)
	if !errors.Is(err, errPrivateAddress) {
		t.Fatalf("error = %v, want errPrivateAddress", err)
	}
}

func TestClientDoesNotFollowRedirects(t *testing.T) {
	client := newClient()
	req, _ := http.NewRequest(http.MethodGet, "https://example.org/", nil)
	if err := client.CheckRedirect(req, nil); !errors.Is(err, http.ErrUseLastResponse) {
		t.Fatalf("CheckRedirect = %v", err)
	}
}
