package users

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/database"
)

func TestSeed(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	store := NewStore(db)
	path := filepath.Join(t.TempDir(), "users.yaml")
	write := func(pw string) {
		body := "- username: anna\n  role: couple\n  password: " + pw + "\n"
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	write("first-password-1")
	if n, err := store.Seed(ctx, path); err != nil || n != 1 {
		t.Fatalf("create: n=%d err=%v", n, err)
	}
	if n, err := store.Seed(ctx, path); err != nil || n != 0 {
		t.Fatalf("unchanged: n=%d err=%v", n, err)
	}
	write("second-password-2")
	if n, err := store.Seed(ctx, path); err != nil || n != 1 {
		t.Fatalf("update: n=%d err=%v", n, err)
	}
	u, err := store.GetByUsername(ctx, "anna")
	if err != nil {
		t.Fatal(err)
	}
	if ok, _ := auth.VerifyPassword("second-password-2", u.PasswordHash); !ok || u.Role != "couple" {
		t.Fatalf("unexpected user %+v", u)
	}

	if err := os.WriteFile(path, []byte("- username: x\n  role: king\n  password: long-enough-pw-1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Seed(ctx, path); err == nil {
		t.Fatal("expected invalid role error")
	}
}
