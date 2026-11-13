// Package invites manages shareable invite links that open the RSVP form.
// A link is a random token with an optional PIN; it carries no guest data.
package invites

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/tokens"
)

// ErrNotFound is returned when no link matches.
var ErrNotFound = errors.New("invite link not found")

// ErrValidation is returned when input validation fails.
var ErrValidation = errors.New("invalid invite link data")

const (
	minPINLen = 4
	maxPINLen = 64
	tokenLen  = 16

	// MaxResponseLimit is the highest cap that can be set on a link.
	MaxResponseLimit = 10000
)

// Link is a shareable invite link.
type Link struct {
	ID        int64  `json:"id"`
	Token     string `json:"token"`
	HasPIN    bool   `json:"hasPin"`
	Active    bool   `json:"active"`
	Responses int    `json:"responses"`
	// MaxResponses caps the responses the link accepts; 0 means unlimited.
	MaxResponses int       `json:"maxResponses"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`

	pinHash string
}

// Store persists invite links in SQLite.
type Store struct {
	db    *sql.DB
	vault *tokens.Vault
}

// NewStore creates an invite link store. Tokens are stored hashed, with a copy
// encrypted by vault so staff can copy the link again.
func NewStore(db *sql.DB, vault *tokens.Vault) *Store { return &Store{db: db, vault: vault} }

// ProtectTokens converts tokens that are still stored in plain text.
func (s *Store) ProtectTokens(ctx context.Context) error {
	return tokens.Protect(ctx, s.db, s.vault, "invite_links", "token_hash", "token_enc")
}

const columns = `l.id, l.token_enc, l.pin_hash, l.active, l.max_responses, l.created_at, l.updated_at,
	(SELECT COUNT(*) FROM responses r WHERE r.invite_link_id = l.id)`

// Create inserts a new active link without PIN.
func (s *Store) Create(ctx context.Context) (Link, error) {
	token, err := generateToken()
	if err != nil {
		return Link{}, err
	}
	sealed, err := s.vault.Seal(token)
	if err != nil {
		return Link{}, fmt.Errorf("seal invite token: %w", err)
	}
	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO invite_links (token_hash, token_enc, created_at, updated_at) VALUES (?, ?, ?, ?)",
		tokens.Hash(token), sealed, now, now)
	if err != nil {
		return Link{}, fmt.Errorf("insert invite link: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Link{}, fmt.Errorf("invite link id: %w", err)
	}
	return s.GetByID(ctx, id)
}

// List returns all links, newest first.
func (s *Store) List(ctx context.Context) ([]Link, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT "+columns+" FROM invite_links l ORDER BY l.id DESC")
	if err != nil {
		return nil, fmt.Errorf("list invite links: %w", err)
	}
	defer rows.Close()

	result := make([]Link, 0)
	for rows.Next() {
		link, err := s.scan(rows)
		if err != nil {
			return nil, fmt.Errorf("scan invite link: %w", err)
		}
		result = append(result, link)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate invite links: %w", err)
	}
	return result, nil
}

// GetByID returns a link by id.
func (s *Store) GetByID(ctx context.Context, id int64) (Link, error) {
	return s.queryOne(ctx, "SELECT "+columns+" FROM invite_links l WHERE l.id = ?", id)
}

// GetByToken returns a link by token regardless of its active state.
func (s *Store) GetByToken(ctx context.Context, token string) (Link, error) {
	if token == "" {
		return Link{}, ErrNotFound
	}
	return s.queryOne(ctx, "SELECT "+columns+" FROM invite_links l WHERE l.token_hash = ?", tokens.Hash(token))
}

// SetPIN sets or, with an empty pin, removes the PIN of a link.
func (s *Store) SetPIN(ctx context.Context, id int64, pin string) (Link, error) {
	pin = strings.TrimSpace(pin)
	hash := ""
	if pin != "" {
		if len(pin) < minPINLen || len(pin) > maxPINLen {
			return Link{}, fmt.Errorf("%w: pin must be between %d and %d characters", ErrValidation, minPINLen, maxPINLen)
		}
		var err error
		if hash, err = auth.HashPassword(pin); err != nil {
			return Link{}, fmt.Errorf("hash pin: %w", err)
		}
	}
	return s.update(ctx, id, "pin_hash = ?", hash)
}

// SetActive enables or disables a link.
func (s *Store) SetActive(ctx context.Context, id int64, active bool) (Link, error) {
	return s.update(ctx, id, "active = ?", active)
}

// SetMaxResponses caps the responses a link accepts; 0 removes the cap.
func (s *Store) SetMaxResponses(ctx context.Context, id int64, limit int) (Link, error) {
	if limit < 0 || limit > MaxResponseLimit {
		return Link{}, fmt.Errorf("%w: maxResponses must be between 0 and %d", ErrValidation, MaxResponseLimit)
	}
	return s.update(ctx, id, "max_responses = ?", limit)
}

// Regenerate replaces the token of a link, invalidating the old URL.
func (s *Store) Regenerate(ctx context.Context, id int64) (Link, error) {
	token, err := generateToken()
	if err != nil {
		return Link{}, err
	}
	sealed, err := s.vault.Seal(token)
	if err != nil {
		return Link{}, fmt.Errorf("seal invite token: %w", err)
	}
	return s.update(ctx, id, "token_hash = ?, token_enc = ?", tokens.Hash(token), sealed)
}

// Delete removes a link. Responses submitted through it are kept.
func (s *Store) Delete(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, "DELETE FROM invite_links WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete invite link: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// VerifyPIN reports whether pin matches the link. Links without PIN accept anything.
func (l Link) VerifyPIN(pin string) bool {
	if !l.HasPIN {
		return true
	}
	ok, err := auth.VerifyPassword(pin, l.pinHash)
	return err == nil && ok
}

// Full reports whether the link has reached its response cap.
func (l Link) Full() bool { return l.MaxResponses > 0 && l.Responses >= l.MaxResponses }

// PINHash exposes the stored hash so access proofs can be bound to it.
func (l Link) PINHash() string { return l.pinHash }

func (s *Store) update(ctx context.Context, id int64, set string, values ...any) (Link, error) {
	res, err := s.db.ExecContext(ctx,
		"UPDATE invite_links SET "+set+", updated_at = ? WHERE id = ?", append(values, time.Now().UTC(), id)...)
	if err != nil {
		return Link{}, fmt.Errorf("update invite link: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Link{}, ErrNotFound
	}
	return s.GetByID(ctx, id)
}

func (s *Store) queryOne(ctx context.Context, query string, args ...any) (Link, error) {
	link, err := s.scan(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return Link{}, ErrNotFound
	}
	if err != nil {
		return Link{}, fmt.Errorf("get invite link: %w", err)
	}
	return link, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func (s *Store) scan(row scanner) (Link, error) {
	var l Link
	var sealed string
	err := row.Scan(&l.ID, &sealed, &l.pinHash, &l.Active, &l.MaxResponses, &l.CreatedAt, &l.UpdatedAt, &l.Responses)
	// Empty when the session secret changed: the link still works, but staff
	// have to regenerate it to see the URL again.
	l.Token = s.vault.OpenOrEmpty(sealed)
	l.HasPIN = l.pinHash != ""
	return l, err
}

func generateToken() (string, error) {
	buf := make([]byte, tokenLen)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate invite token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
