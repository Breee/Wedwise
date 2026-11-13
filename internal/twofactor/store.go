// Package twofactor implements TOTP as a second login factor.
package twofactor

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base32"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/pquerna/otp/totp"
)

var (
	// ErrAlreadyEnabled is returned when a confirmed secret exists.
	ErrAlreadyEnabled = errors.New("two-factor login is already enabled")
	// ErrInvalidCode is returned when a code does not match.
	ErrInvalidCode = errors.New("invalid code")
)

const (
	recoveryCodeCount = 8
	stepSeconds       = 30
)

// Store keeps TOTP secrets encrypted and recovery codes hashed.
type Store struct {
	db     *sql.DB
	aead   cipher.AEAD
	issuer string
	now    func() time.Time
	keys   *Keys
}

// SetKeys adds passkeys and hardware tokens as a second factor.
func (s *Store) SetKeys(keys *Keys) { s.keys = keys }

// NewStore derives the encryption key for TOTP secrets from secret.
func NewStore(db *sql.DB, secret, issuer string) (*Store, error) {
	key := sha256.Sum256([]byte("wedwise-totp:" + secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Store{db: db, aead: aead, issuer: issuer, now: time.Now}, nil
}

func (s *Store) encrypt(plain string) (string, error) {
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawStdEncoding.EncodeToString(s.aead.Seal(nonce, nonce, []byte(plain), nil)), nil
}

func (s *Store) decrypt(enc string) (string, error) {
	raw, err := base64.RawStdEncoding.DecodeString(enc)
	if err != nil || len(raw) < s.aead.NonceSize() {
		return "", errors.New("corrupt totp secret")
	}
	n := s.aead.NonceSize()
	plain, err := s.aead.Open(nil, raw[:n], raw[n:], nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func hashCode(code string) string {
	sum := sha256.Sum256([]byte(normalizeRecovery(code)))
	return hex.EncodeToString(sum[:])
}

func normalizeRecovery(code string) string {
	return strings.ToLower(strings.NewReplacer("-", "", " ", "").Replace(code))
}

// Enabled reports whether the user has any second factor.
func (s *Store) Enabled(ctx context.Context, userID int64) (bool, error) {
	totp, err := s.TOTPEnabled(ctx, userID)
	if err != nil || totp || s.keys == nil {
		return totp, err
	}
	n, err := s.keys.Count(ctx, userID)
	return n > 0, err
}

// Challenge returns WebAuthn assertion options for the user's keys.
func (s *Store) Challenge(ctx context.Context, userID int64) (any, error) {
	if s.keys == nil {
		return nil, ErrNoKeys
	}
	return s.keys.BeginLogin(ctx, userID)
}

// TOTPEnabled reports whether the user has a confirmed authenticator app.
func (s *Store) TOTPEnabled(ctx context.Context, userID int64) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM user_totp WHERE user_id = ? AND confirmed_at != ''`, userID).Scan(&n)
	return n > 0, err
}

// RecoveryCodesLeft returns the number of unused recovery codes.
func (s *Store) RecoveryCodesLeft(ctx context.Context, userID int64) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM user_recovery_codes WHERE user_id = ?`, userID).Scan(&n)
	return n, err
}

// Begin creates a new unconfirmed secret and returns it with its otpauth URL.
func (s *Store) Begin(ctx context.Context, userID int64, account string) (secret, url string, err error) {
	enabled, err := s.Enabled(ctx, userID)
	if err != nil {
		return "", "", err
	}
	if enabled {
		return "", "", ErrAlreadyEnabled
	}
	key, err := totp.Generate(totp.GenerateOpts{Issuer: s.issuer, AccountName: account})
	if err != nil {
		return "", "", err
	}
	enc, err := s.encrypt(key.Secret())
	if err != nil {
		return "", "", err
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO user_totp (user_id, secret_enc, confirmed_at, last_step, created_at) VALUES (?, ?, '', 0, ?)
		 ON CONFLICT(user_id) DO UPDATE SET secret_enc = excluded.secret_enc, last_step = 0, created_at = excluded.created_at`,
		userID, enc, s.now().UTC().Format(time.RFC3339))
	if err != nil {
		return "", "", err
	}
	return key.Secret(), key.URL(), nil
}

// checkTOTP validates code against the stored secret and rejects reuse.
func (s *Store) checkTOTP(ctx context.Context, userID int64, code string, confirmed bool) (bool, error) {
	var enc, confirmedAt string
	var lastStep int64
	err := s.db.QueryRowContext(ctx,
		`SELECT secret_enc, confirmed_at, last_step FROM user_totp WHERE user_id = ?`, userID).
		Scan(&enc, &confirmedAt, &lastStep)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if (confirmedAt != "") != confirmed {
		return false, nil
	}
	secret, err := s.decrypt(enc)
	if err != nil {
		return false, err
	}
	now := s.now()
	step := now.Unix() / stepSeconds
	if step <= lastStep || !validAt(code, secret, now) {
		return false, nil
	}
	_, err = s.db.ExecContext(ctx, `UPDATE user_totp SET last_step = ? WHERE user_id = ?`, step, userID)
	return err == nil, err
}

func validAt(code, secret string, at time.Time) bool {
	ok, _ := totp.ValidateCustom(code, secret, at, totp.ValidateOpts{Period: stepSeconds, Skew: 1, Digits: 6})
	return ok
}

// Confirm activates the pending secret and returns fresh recovery codes,
// which are shown once and stored only as hashes.
func (s *Store) Confirm(ctx context.Context, userID int64, code string) ([]string, error) {
	ok, err := s.checkTOTP(ctx, userID, strings.TrimSpace(code), false)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInvalidCode
	}
	codes := make([]string, recoveryCodeCount)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM user_recovery_codes WHERE user_id = ?`, userID); err != nil {
		return nil, err
	}
	for i := range codes {
		raw := make([]byte, 10)
		if _, err := rand.Read(raw); err != nil {
			return nil, err
		}
		c := strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(raw))
		codes[i] = c[:4] + "-" + c[4:8] + "-" + c[8:12] + "-" + c[12:16]
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO user_recovery_codes (code_hash, user_id) VALUES (?, ?)`, hashCode(codes[i]), userID); err != nil {
			return nil, err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE user_totp SET confirmed_at = ? WHERE user_id = ?`,
		s.now().UTC().Format(time.RFC3339), userID); err != nil {
		return nil, err
	}
	return codes, tx.Commit()
}

// Verify accepts a current TOTP code, an unused recovery code (consumed) or
// a WebAuthn assertion as JSON.
func (s *Store) Verify(ctx context.Context, userID int64, code string) (bool, error) {
	code = strings.TrimSpace(code)
	if strings.HasPrefix(code, "{") {
		if s.keys == nil {
			return false, nil
		}
		return s.keys.FinishLogin(ctx, userID, []byte(code))
	}
	if len(code) == 6 {
		return s.checkTOTP(ctx, userID, code, true)
	}
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM user_recovery_codes WHERE user_id = ? AND code_hash = ?`, userID, hashCode(code))
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// Disable removes the secret and all recovery codes.
func (s *Store) Disable(ctx context.Context, userID int64) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM user_recovery_codes WHERE user_id = ?`, userID); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM user_totp WHERE user_id = ?`, userID)
	return err
}
