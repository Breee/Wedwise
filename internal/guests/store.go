package guests

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ErrNotFound is returned when no matching guest exists.
var ErrNotFound = errors.New("guest not found")

// ErrInvalidInvitation is returned when the referenced invitation does not exist.
var ErrInvalidInvitation = errors.New("invitation does not exist")

// ErrValidation is returned when input validation fails.
var ErrValidation = errors.New("invalid guest data")

// Store persists guests in SQLite.
type Store struct {
	db *sql.DB
}

// NewStore creates a guest store backed by db.
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

const columns = "id, display_name, email, invitation_id, notes, created_at, updated_at"

// Params describes the writable fields of a guest.
type Params struct {
	DisplayName  string
	Email        string
	InvitationID int64
	Notes        string
}

func (p *Params) normalize() error {
	p.DisplayName = strings.TrimSpace(p.DisplayName)
	p.Email = strings.TrimSpace(p.Email)
	p.Notes = strings.TrimSpace(p.Notes)
	if p.DisplayName == "" {
		return fmt.Errorf("%w: displayName must not be empty", ErrValidation)
	}
	if p.InvitationID <= 0 {
		return fmt.Errorf("%w: invitationId is required", ErrValidation)
	}
	if p.Email != "" && !strings.Contains(p.Email, "@") {
		return fmt.Errorf("%w: email is not a valid address", ErrValidation)
	}
	return nil
}

// Create inserts a new guest.
func (s *Store) Create(ctx context.Context, params Params) (Guest, error) {
	if err := params.normalize(); err != nil {
		return Guest{}, err
	}
	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO guests (display_name, email, invitation_id, notes, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		params.DisplayName, params.Email, params.InvitationID, params.Notes, now, now)
	if err != nil {
		if isForeignKeyViolation(err) {
			return Guest{}, ErrInvalidInvitation
		}
		return Guest{}, fmt.Errorf("insert guest: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Guest{}, fmt.Errorf("guest id: %w", err)
	}
	return s.GetByID(ctx, id)
}

// GetByID returns a guest by id.
func (s *Store) GetByID(ctx context.Context, id int64) (Guest, error) {
	guest, err := scan(s.db.QueryRowContext(ctx, "SELECT "+columns+" FROM guests WHERE id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return Guest{}, ErrNotFound
	}
	if err != nil {
		return Guest{}, fmt.Errorf("get guest: %w", err)
	}
	return guest, nil
}

// List returns all guests, optionally filtered by invitation.
func (s *Store) List(ctx context.Context, invitationID int64) ([]Guest, error) {
	query := "SELECT " + columns + " FROM guests ORDER BY display_name"
	args := []any{}
	if invitationID > 0 {
		query = "SELECT " + columns + " FROM guests WHERE invitation_id = ? ORDER BY display_name"
		args = append(args, invitationID)
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list guests: %w", err)
	}
	defer rows.Close()

	result := make([]Guest, 0)
	for rows.Next() {
		guest, err := scan(rows)
		if err != nil {
			return nil, fmt.Errorf("scan guest: %w", err)
		}
		result = append(result, guest)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate guests: %w", err)
	}
	return result, nil
}

// Update changes an existing guest.
func (s *Store) Update(ctx context.Context, id int64, params Params) (Guest, error) {
	if err := params.normalize(); err != nil {
		return Guest{}, err
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE guests SET display_name = ?, email = ?, invitation_id = ?, notes = ?, updated_at = ? WHERE id = ?`,
		params.DisplayName, params.Email, params.InvitationID, params.Notes, time.Now().UTC(), id)
	if err != nil {
		if isForeignKeyViolation(err) {
			return Guest{}, ErrInvalidInvitation
		}
		return Guest{}, fmt.Errorf("update guest: %w", err)
	}
	count, err := res.RowsAffected()
	if err != nil {
		return Guest{}, fmt.Errorf("rows affected: %w", err)
	}
	if count == 0 {
		return Guest{}, ErrNotFound
	}
	return s.GetByID(ctx, id)
}

// Delete removes a guest.
func (s *Store) Delete(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, "DELETE FROM guests WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete guest: %w", err)
	}
	count, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if count == 0 {
		return ErrNotFound
	}
	return nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scan(row scanner) (Guest, error) {
	var guest Guest
	err := row.Scan(&guest.ID, &guest.DisplayName, &guest.Email, &guest.InvitationID,
		&guest.Notes, &guest.CreatedAt, &guest.UpdatedAt)
	return guest, err
}

func isForeignKeyViolation(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "foreign key")
}
