package auth

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

// Lockout policy: after lockoutFreeAttempts wrong logins in a row an account
// is locked for lockoutBase, doubling with every further failure up to
// lockoutMax. Failures are forgotten after lockoutForget without attempts.
// The cap keeps an attacker from locking someone out for long.
const (
	lockoutFreeAttempts = 5
	lockoutBase         = time.Minute
	lockoutMax          = 15 * time.Minute
	lockoutForget       = 24 * time.Hour
)

// Lockouts counts failed logins per account name. It also counts names that
// do not exist, so the answer does not reveal which accounts are real.
type Lockouts struct {
	db  *sql.DB
	now func() time.Time
}

// NewLockouts creates the lockout store.
func NewLockouts(db *sql.DB) *Lockouts {
	return &Lockouts{db: db, now: time.Now}
}

func lockoutKey(username string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(username))))
	return hex.EncodeToString(sum[:16])
}

func lockoutDuration(failures int) time.Duration {
	if failures < lockoutFreeAttempts {
		return 0
	}
	d := lockoutBase
	for i := lockoutFreeAttempts; i < failures && d < lockoutMax; i++ {
		d *= 2
	}
	return min(d, lockoutMax)
}

// Locked returns how long the account stays locked, or zero.
func (l *Lockouts) Locked(ctx context.Context, username string) (time.Duration, error) {
	var until int64
	err := l.db.QueryRowContext(ctx, `SELECT locked_until FROM login_lockouts WHERE key = ?`, lockoutKey(username)).Scan(&until)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return max(time.UnixMilli(until).Sub(l.now()), 0), nil
}

// Fail records a wrong login and returns the resulting lock time.
func (l *Lockouts) Fail(ctx context.Context, username string) (time.Duration, error) {
	now := l.now()
	key := lockoutKey(username)
	var failures int
	err := l.db.QueryRowContext(ctx, `
		INSERT INTO login_lockouts (key, failures, locked_until, updated_at) VALUES (?, 1, 0, ?)
		ON CONFLICT (key) DO UPDATE SET
			failures   = CASE WHEN updated_at < ? THEN 1 ELSE failures + 1 END,
			updated_at = excluded.updated_at
		RETURNING failures`,
		key, now.UnixMilli(), now.Add(-lockoutForget).UnixMilli(),
	).Scan(&failures)
	if err != nil {
		return 0, err
	}
	lock := lockoutDuration(failures)
	if lock > 0 {
		_, err = l.db.ExecContext(ctx, `UPDATE login_lockouts SET locked_until = ? WHERE key = ?`, now.Add(lock).UnixMilli(), key)
	}
	_, _ = l.db.ExecContext(ctx, `DELETE FROM login_lockouts WHERE updated_at < ?`, now.Add(-lockoutForget).UnixMilli())
	return lock, err
}

// Reset forgets the failures of an account after a successful login.
func (l *Lockouts) Reset(ctx context.Context, username string) error {
	_, err := l.db.ExecContext(ctx, `DELETE FROM login_lockouts WHERE key = ?`, lockoutKey(username))
	return err
}
