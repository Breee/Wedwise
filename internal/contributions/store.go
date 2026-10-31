package contributions

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ErrNotFound is returned when no matching contribution exists.
var ErrNotFound = errors.New("contribution not found")

// ErrValidation is returned when input validation fails.
var ErrValidation = errors.New("invalid contribution data")

// Store persists contributions in SQLite.
type Store struct {
	db *sql.DB
}

// NewStore creates a contribution store backed by db.
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Execer is satisfied by *sql.DB and *sql.Tx so that guest submissions can be
// written in the same transaction as the response they belong to.
type Execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

const (
	maxTextLen  = 4000
	maxShortLen = 200
)

const columns = `c.id, c.response_id, r.contact_name, c.title, c.description, c.needs, c.phone, c.status,
	c.slot_time, c.duration_minutes, c.created_at, c.updated_at`

const fromClause = " FROM contributions c JOIN responses r ON r.id = c.response_id "

// Input describes the fields a guest provides for a contribution.
type Input struct {
	Title       string
	Description string
	Needs       string
	Phone       string
}

func (in *Input) normalize() error {
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	in.Needs = strings.TrimSpace(in.Needs)
	in.Phone = strings.TrimSpace(in.Phone)

	if in.Title == "" {
		return fmt.Errorf("%w: title must not be empty", ErrValidation)
	}
	if in.Phone == "" {
		return fmt.Errorf("%w: phone must not be empty", ErrValidation)
	}
	if len(in.Title) > maxShortLen || len(in.Phone) > maxShortLen {
		return fmt.Errorf("%w: title or phone is too long", ErrValidation)
	}
	if len(in.Description) > maxTextLen || len(in.Needs) > maxTextLen {
		return fmt.Errorf("%w: description or needs is too long", ErrValidation)
	}
	return nil
}

// Upsert creates or updates the contribution of a response. The workflow
// status and notes are preserved on update.
func (s *Store) Upsert(ctx context.Context, exec Execer, responseID int64, input Input) error {
	if err := input.normalize(); err != nil {
		return err
	}
	now := time.Now().UTC()
	_, err := exec.ExecContext(ctx,
		`INSERT INTO contributions (response_id, title, description, needs, phone, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(response_id) DO UPDATE SET title = excluded.title, description = excluded.description,
			needs = excluded.needs, phone = excluded.phone, updated_at = excluded.updated_at`,
		responseID, input.Title, input.Description, input.Needs, input.Phone, StatusNew, now, now)
	if err != nil {
		return fmt.Errorf("upsert contribution: %w", err)
	}
	return nil
}

// DeleteByResponse removes the contribution of a response, if any.
func (s *Store) DeleteByResponse(ctx context.Context, exec Execer, responseID int64) error {
	if _, err := exec.ExecContext(ctx, "DELETE FROM contributions WHERE response_id = ?", responseID); err != nil {
		return fmt.Errorf("delete contribution: %w", err)
	}
	return nil
}

// GetByResponse returns the contribution of a response.
func (s *Store) GetByResponse(ctx context.Context, responseID int64) (Contribution, error) {
	return s.queryOne(ctx, "SELECT "+columns+fromClause+"WHERE c.response_id = ?", responseID)
}

// GetByID returns a contribution by id.
func (s *Store) GetByID(ctx context.Context, id int64) (Contribution, error) {
	return s.queryOne(ctx, "SELECT "+columns+fromClause+"WHERE c.id = ?", id)
}

func (s *Store) queryOne(ctx context.Context, query string, args ...any) (Contribution, error) {
	contribution, err := scan(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return Contribution{}, ErrNotFound
	}
	if err != nil {
		return Contribution{}, fmt.Errorf("get contribution: %w", err)
	}
	return contribution, nil
}

// List returns all contributions, newest first, optionally filtered by status.
func (s *Store) List(ctx context.Context, status string) ([]Contribution, error) {
	query := "SELECT " + columns + fromClause
	args := []any{}
	if status != "" {
		if !IsValidStatus(status) {
			return nil, fmt.Errorf("%w: unknown status filter %q", ErrValidation, status)
		}
		query += "WHERE c.status = ? "
		args = append(args, status)
	}
	query += "ORDER BY c.created_at DESC, c.id DESC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list contributions: %w", err)
	}
	defer rows.Close()

	result := make([]Contribution, 0)
	for rows.Next() {
		contribution, err := scan(rows)
		if err != nil {
			return nil, fmt.Errorf("scan contribution: %w", err)
		}
		result = append(result, contribution)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate contributions: %w", err)
	}
	return result, nil
}

// SetStatus changes the workflow status of a contribution.
func (s *Store) SetStatus(ctx context.Context, id int64, status string) (Contribution, error) {
	status = strings.TrimSpace(strings.ToLower(status))
	if !IsValidStatus(status) {
		return Contribution{}, fmt.Errorf("%w: status must be one of %s", ErrValidation, strings.Join(ValidStatuses(), ", "))
	}
	return s.update(ctx, id, "status = ?", status)
}

// SetSchedule sets the planned start time ("HH:MM", empty to clear) and duration.
func (s *Store) SetSchedule(ctx context.Context, id int64, slotTime string, durationMinutes int) (Contribution, error) {
	slotTime = strings.TrimSpace(slotTime)
	if slotTime != "" {
		if _, err := time.Parse("15:04", slotTime); err != nil {
			return Contribution{}, fmt.Errorf("%w: slotTime must be HH:MM", ErrValidation)
		}
	}
	if durationMinutes < 0 || durationMinutes > MaxPlannedMinutes {
		return Contribution{}, fmt.Errorf("%w: durationMinutes must be between 0 and %d", ErrValidation, MaxPlannedMinutes)
	}
	return s.update(ctx, id, "slot_time = ?, duration_minutes = ?", slotTime, durationMinutes)
}

func (s *Store) update(ctx context.Context, id int64, set string, args ...any) (Contribution, error) {
	args = append(args, time.Now().UTC(), id)
	res, err := s.db.ExecContext(ctx, "UPDATE contributions SET "+set+", updated_at = ? WHERE id = ?", args...)
	if err != nil {
		return Contribution{}, fmt.Errorf("update contribution: %w", err)
	}
	count, err := res.RowsAffected()
	if err != nil {
		return Contribution{}, fmt.Errorf("rows affected: %w", err)
	}
	if count == 0 {
		return Contribution{}, ErrNotFound
	}
	return s.GetByID(ctx, id)
}

// AddNote attaches an internal note to a contribution.
func (s *Store) AddNote(ctx context.Context, contributionID, authorUserID int64, text string) (ContributionNote, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return ContributionNote{}, fmt.Errorf("%w: text must not be empty", ErrValidation)
	}
	if len(text) > maxTextLen {
		return ContributionNote{}, fmt.Errorf("%w: text is too long", ErrValidation)
	}
	if _, err := s.GetByID(ctx, contributionID); err != nil {
		return ContributionNote{}, err
	}

	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO contribution_notes (contribution_id, author_user_id, text, created_at) VALUES (?, ?, ?, ?)",
		contributionID, authorUserID, text, now)
	if err != nil {
		return ContributionNote{}, fmt.Errorf("insert note: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return ContributionNote{}, fmt.Errorf("note id: %w", err)
	}
	return ContributionNote{
		ID:             id,
		ContributionID: contributionID,
		AuthorUserID:   authorUserID,
		Text:           text,
		CreatedAt:      now,
	}, nil
}

// Notes returns all notes of a contribution, oldest first.
func (s *Store) Notes(ctx context.Context, contributionID int64) ([]ContributionNote, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, contribution_id, author_user_id, text, created_at
		 FROM contribution_notes WHERE contribution_id = ? ORDER BY created_at, id`, contributionID)
	if err != nil {
		return nil, fmt.Errorf("list notes: %w", err)
	}
	defer rows.Close()

	result := make([]ContributionNote, 0)
	for rows.Next() {
		var note ContributionNote
		if err := rows.Scan(&note.ID, &note.ContributionID, &note.AuthorUserID, &note.Text, &note.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan note: %w", err)
		}
		result = append(result, note)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate notes: %w", err)
	}
	return result, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scan(row scanner) (Contribution, error) {
	var c Contribution
	err := row.Scan(&c.ID, &c.ResponseID, &c.ContactName, &c.Title, &c.Description, &c.Needs, &c.Phone,
		&c.Status, &c.SlotTime, &c.DurationMinutes, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}
