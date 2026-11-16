package demo

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/Breee/Wedwise/internal/contributions"
	"github.com/Breee/Wedwise/internal/database"
	"github.com/Breee/Wedwise/internal/invites"
	"github.com/Breee/Wedwise/internal/rsvp"
	"github.com/Breee/Wedwise/internal/sealed"
	"github.com/Breee/Wedwise/internal/tokens"
)

func TestSeedOnce(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(filepath.Join(t.TempDir(), "demo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	box, err := sealed.New("demo-data-key-with-at-least-32-bytes")
	if err != nil {
		t.Fatal(err)
	}
	vault, err := tokens.NewVault("demo-session-secret", "test")
	if err != nil {
		t.Fatal(err)
	}
	offers := contributions.NewStore(db, box)
	responses := rsvp.NewStore(db, offers, vault, box)
	links := invites.NewStore(db, vault)

	count, err := Seed(ctx, links, responses, offers)
	if err != nil {
		t.Fatal(err)
	}
	if count != len(guests) {
		t.Fatalf("seeded %d, want %d", count, len(guests))
	}
	again, err := Seed(ctx, links, responses, offers)
	if err != nil || again != 0 {
		t.Fatalf("second seed added %d (%v)", again, err)
	}
	list, err := offers.List(ctx, "confirmed")
	if err != nil || len(list) != 2 {
		t.Fatalf("confirmed offers: %d (%v)", len(list), err)
	}
}
