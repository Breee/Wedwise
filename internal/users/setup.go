package users

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/Breee/Wedwise/internal/auth"
)

// SetupTokenTTL is how long a setup link stays valid.
const SetupTokenTTL = 7 * 24 * time.Hour

func randomToken(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("random token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// Only the hash is stored, so a database leak does not reveal usable links.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// CreateSetupToken issues a one-time token that lets the user choose a
// password. Earlier tokens of the same user stop working.
func (s *Store) CreateSetupToken(ctx context.Context, userID int64) (string, error) {
	token, err := randomToken(24)
	if err != nil {
		return "", err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "DELETE FROM user_setup_tokens WHERE user_id = ?", userID); err != nil {
		return "", fmt.Errorf("clear setup tokens: %w", err)
	}
	now := time.Now().UTC()
	if _, err := tx.ExecContext(ctx,
		"INSERT INTO user_setup_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
		hashToken(token), userID, now.Add(SetupTokenTTL), now); err != nil {
		return "", fmt.Errorf("insert setup token: %w", err)
	}
	return token, tx.Commit()
}

// SetupUser returns the active user a valid setup token belongs to.
func (s *Store) SetupUser(ctx context.Context, token string) (User, error) {
	return s.queryOne(ctx,
		"SELECT "+userColumns+` FROM users WHERE active = 1 AND id = (
			SELECT user_id FROM user_setup_tokens WHERE token_hash = ? AND expires_at > ?)`,
		hashToken(token), time.Now().UTC())
}

// RedeemSetupToken sets the password, consumes the token and signs the user
// out everywhere.
func (s *Store) RedeemSetupToken(ctx context.Context, token, password string) error {
	if err := auth.ValidatePassword(password); err != nil {
		return err
	}
	user, err := s.SetupUser(ctx, token)
	if err != nil {
		return err
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, "DELETE FROM user_setup_tokens WHERE token_hash = ?", hashToken(token))
	if err != nil {
		return fmt.Errorf("consume setup token: %w", err)
	}
	if err := checkAffected(res); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
		hash, time.Now().UTC(), user.ID); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM sessions WHERE user_id = ?", user.ID); err != nil {
		return fmt.Errorf("clear sessions: %w", err)
	}
	return tx.Commit()
}
