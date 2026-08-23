package invitations

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ErrNotFound is returned when no matching invitation exists.
var ErrNotFound = errors.New("invitation not found")

// Store persists invitations in SQLite.
type Store struct {
	db *sql.DB
}

// NewStore creates an invitation store backed by db.
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

const columns = "id, name, token, max_guests, active, created_at, updated_at"

// Create inserts a new invitation with a freshly generated token.
func (s *Store) Create(ctx context.Context, name string, maxGuests int, active bool) (Invitation, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Invitation{}, errors.New("name must not be empty")
	}
	if maxGuests < 1 {
		return Invitation{}, errors.New("maxGuests must be at least 1")
	}

	token, err := GenerateToken()
	if err != nil {
		return Invitation{}, err
	}

	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO invitations (name, token, max_guests, active, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		name, token, maxGuests, active, now, now)
	if err != nil {
		return Invitation{}, fmt.Errorf("insert invitation: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Invitation{}, fmt.Errorf("invitation id: %w", err)
	}
	return s.GetByID(ctx, id)
}

// GetByID returns an invitation by id.
func (s *Store) GetByID(ctx context.Context, id int64) (Invitation, error) {
	return s.queryOne(ctx, "SELECT "+columns+" FROM invitations WHERE id = ?", id)
}

// GetByToken returns an invitation by token.
func (s *Store) GetByToken(ctx context.Context, token string) (Invitation, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return Invitation{}, ErrNotFound
	}
	return s.queryOne(ctx, "SELECT "+columns+" FROM invitations WHERE token = ?", token)
}

// List returns all invitations ordered by name.
func (s *Store) List(ctx context.Context) ([]Invitation, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT "+columns+" FROM invitations ORDER BY name")
	if err != nil {
		return nil, fmt.Errorf("list invitations: %w", err)
	}
	defer rows.Close()

	result := make([]Invitation, 0)
	for rows.Next() {
		invitation, err := scan(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, invitation)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate invitations: %w", err)
	}
	return result, nil
}

// Update changes name, guest count and active state of an invitation.
func (s *Store) Update(ctx context.Context, id int64, name string, maxGuests int, active bool) (Invitation, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Invitation{}, errors.New("name must not be empty")
	}
	if maxGuests < 1 {
		return Invitation{}, errors.New("maxGuests must be at least 1")
	}
	res, err := s.db.ExecContext(ctx,
		"UPDATE invitations SET name = ?, max_guests = ?, active = ?, updated_at = ? WHERE id = ?",
		name, maxGuests, active, time.Now().UTC(), id)
	if err != nil {
		return Invitation{}, fmt.Errorf("update invitation: %w", err)
	}
	if err := affected(res); err != nil {
		return Invitation{}, err
	}
	return s.GetByID(ctx, id)
}

// RegenerateToken issues a new token for an invitation, invalidating the old link.
func (s *Store) RegenerateToken(ctx context.Context, id int64) (Invitation, error) {
	token, err := GenerateToken()
	if err != nil {
		return Invitation{}, err
	}
	res, err := s.db.ExecContext(ctx,
		"UPDATE invitations SET token = ?, updated_at = ? WHERE id = ?",
		token, time.Now().UTC(), id)
	if err != nil {
		return Invitation{}, fmt.Errorf("regenerate token: %w", err)
	}
	if err := affected(res); err != nil {
		return Invitation{}, err
	}
	return s.GetByID(ctx, id)
}

// Delete removes an invitation and all data referencing it.
func (s *Store) Delete(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, "DELETE FROM invitations WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete invitation: %w", err)
	}
	return affected(res)
}

type scanner interface {
	Scan(dest ...any) error
}

func scan(row scanner) (Invitation, error) {
	var invitation Invitation
	if err := row.Scan(&invitation.ID, &invitation.Name, &invitation.Token, &invitation.MaxGuests,
		&invitation.Active, &invitation.CreatedAt, &invitation.UpdatedAt); err != nil {
		return Invitation{}, err
	}
	return invitation, nil
}

func (s *Store) queryOne(ctx context.Context, query string, args ...any) (Invitation, error) {
	invitation, err := scan(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return Invitation{}, ErrNotFound
	}
	if err != nil {
		return Invitation{}, fmt.Errorf("query invitation: %w", err)
	}
	return invitation, nil
}

func affected(res sql.Result) error {
	count, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if count == 0 {
		return ErrNotFound
	}
	return nil
}
