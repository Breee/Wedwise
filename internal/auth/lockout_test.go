package auth

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/Breee/Wedwise/internal/database"
)

func TestLockoutBackoff(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}

	now := time.Date(2027, 1, 1, 12, 0, 0, 0, time.UTC)
	l := NewLockouts(db)
	l.now = func() time.Time { return now }

	for i := 1; i < lockoutFreeAttempts; i++ {
		if lock, err := l.Fail(ctx, "Anna"); err != nil || lock != 0 {
			t.Fatalf("failure %d: lock %v, err %v", i, lock, err)
		}
	}
	want := []time.Duration{time.Minute, 2 * time.Minute, 4 * time.Minute, 8 * time.Minute, lockoutMax, lockoutMax}
	for i, expected := range want {
		lock, err := l.Fail(ctx, " anna ")
		if err != nil || lock != expected {
			t.Fatalf("step %d: lock %v, want %v (err %v)", i, lock, expected, err)
		}
		if wait, _ := l.Locked(ctx, "ANNA"); wait != expected {
			t.Fatalf("step %d: locked for %v, want %v", i, wait, expected)
		}
		now = now.Add(expected)
		if wait, _ := l.Locked(ctx, "anna"); wait != 0 {
			t.Fatalf("step %d: still locked after waiting", i)
		}
	}
	if wait, _ := l.Locked(ctx, "ben"); wait != 0 {
		t.Fatal("another account is locked")
	}

	// A second store on the same database sees the same state.
	l.Fail(ctx, "anna")
	other := NewLockouts(db)
	other.now = l.now
	if wait, _ := other.Locked(ctx, "anna"); wait != lockoutMax {
		t.Fatalf("lock not persisted: %v", wait)
	}

	if err := l.Reset(ctx, "anna"); err != nil {
		t.Fatal(err)
	}
	if lock, _ := l.Fail(ctx, "anna"); lock != 0 {
		t.Fatal("failures not forgotten after a successful login")
	}

	// Old failures no longer count.
	for i := 0; i < lockoutFreeAttempts-2; i++ {
		l.Fail(ctx, "anna")
	}
	now = now.Add(lockoutForget + time.Minute)
	if lock, _ := l.Fail(ctx, "anna"); lock != 0 {
		t.Fatal("stale failures still count")
	}
}
