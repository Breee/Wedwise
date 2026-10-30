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
)

// ErrNotFound is returned when no link matches.
var ErrNotFound = errors.New("invite link not found")

// ErrValidation is returned when input validation fails.
var ErrValidation = errors.New("invalid invite link data")

const (
	minPINLen = 4
	maxPINLen = 64
	tokenLen  = 16
)

// Link is a shareable invite link.
type Link struct {
	ID        int64     `json:"id"`
	Token     string    `json:"token"`
	HasPIN    bool      `json:"hasPin"`
	Active    bool      `json:"active"`
	Responses int       `json:"responses"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	pinHash string
}

// Store persists invite links in SQLite.
type Store struct {
	db *sql.DB
}

// NewStore creates an invite link store.
func NewStore(db *sql.DB) *Store { return &Store{db: db} }

const columns = `l.id, l.token, l.pin_hash, l.active, l.created_at, l.updated_at,
	(SELECT COUNT(*) FROM responses r WHERE r.invite_link_id = l.id)`

// Create inserts a new active link without PIN.
func (s *Store) Create(ctx context.Context) (Link, error) {
	token, err := generateToken()
	if err != nil {
		return Link{}, err
	}
	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO invite_links (token, created_at, updated_at) VALUES (?, ?, ?)", token, now, now)
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
		link, err := scan(rows)
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
	return s.queryOne(ctx, "SELECT "+columns+" FROM invite_links l WHERE l.token = ?", token)
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

// Regenerate replaces the token of a link, invalidating the old URL.
func (s *Store) Regenerate(ctx context.Context, id int64) (Link, error) {
	token, err := generateToken()
	if err != nil {
		return Link{}, err
	}
	return s.update(ctx, id, "token = ?", token)
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

// PINHash exposes the stored hash so access proofs can be bound to it.
func (l Link) PINHash() string { return l.pinHash }

func (s *Store) update(ctx context.Context, id int64, set string, value any) (Link, error) {
	res, err := s.db.ExecContext(ctx,
		"UPDATE invite_links SET "+set+", updated_at = ? WHERE id = ?", value, time.Now().UTC(), id)
	if err != nil {
		return Link{}, fmt.Errorf("update invite link: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Link{}, ErrNotFound
	}
	return s.GetByID(ctx, id)
}

func (s *Store) queryOne(ctx context.Context, query string, args ...any) (Link, error) {
	link, err := scan(s.db.QueryRowContext(ctx, query, args...))
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

func scan(row scanner) (Link, error) {
	var l Link
	err := row.Scan(&l.ID, &l.Token, &l.pinHash, &l.Active, &l.CreatedAt, &l.UpdatedAt, &l.Responses)
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
