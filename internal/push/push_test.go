package push

import (
	"context"
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
