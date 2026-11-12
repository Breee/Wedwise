package content

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/Breee/Wedwise/internal/database"
)

func TestSeedAppliesOnlyWhenFileChanges(t *testing.T) {
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
	write := func(text string) {
		if err := os.WriteFile(path, []byte(`{"introduction":{"text":"`+text+`"}}`), 0o600); err != nil {
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

	write("from file")
	if applied, err := store.Seed(ctx, path); err != nil || !applied {
		t.Fatalf("first seed: applied=%v err=%v", applied, err)
	}

	edited, _ := store.Get(ctx)
	edited.Introduction.Text = "edited"
	if _, err := store.Replace(ctx, edited); err != nil {
		t.Fatal(err)
	}
	if applied, err := store.Seed(ctx, path); err != nil || applied {
		t.Fatalf("unchanged file: applied=%v err=%v", applied, err)
	}
	if got := intro(); got != "edited" {
		t.Fatalf("editor change lost: %q", got)
	}

	write("new file")
	if applied, err := store.Seed(ctx, path); err != nil || !applied {
		t.Fatalf("changed file: applied=%v err=%v", applied, err)
	}
	if got := intro(); got != "new file" {
		t.Fatalf("got %q", got)
	}

	if err := os.WriteFile(path, []byte(`{"theme":"nope"`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Seed(ctx, path); err == nil {
		t.Fatal("expected error for broken file")
	}
}
