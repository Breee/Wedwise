package content

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/Breee/Wedwise/internal/database"
)

func TestSeedFillsOnlyAnEmptyInstance(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, err := database.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	store := NewStore(db)
	path := filepath.Join(dir, "content.json")
	write := func(body string) {
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	intro := func() string {
		c, err := store.Get(ctx)
		if err != nil {
			t.Fatal(err)
		}
		return c.Introduction.Text
	}

	write(`{"theme":"nope"`)
	if _, err := store.Seed(ctx, path); err == nil {
		t.Fatal("expected error for broken file on an empty instance")
	}

	write(`{"introduction":{"text":"from file"}}`)
	if applied, err := store.Seed(ctx, path); err != nil || !applied {
		t.Fatalf("first seed: applied=%v err=%v", applied, err)
	}

	edited, _ := store.Get(ctx)
	edited.Introduction.Text = "edited"
	if _, err := store.Replace(ctx, edited); err != nil {
		t.Fatal(err)
	}
	write(`{"introduction":{"text":"new file"}}`)
	if applied, err := store.Seed(ctx, path); err != nil || applied {
		t.Fatalf("changed file: applied=%v err=%v", applied, err)
	}
	if got := intro(); got != "edited" {
		t.Fatalf("editor change lost: %q", got)
	}
}
