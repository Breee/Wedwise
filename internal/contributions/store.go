package contributions

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
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

const columns = `c.id, c.response_id, r.contact_name, c.title, c.description, c.needs, c.phone, c.messengers, c.status,
	c.slot_time, c.duration_minutes, c.created_at, c.updated_at`

const fromClause = " FROM contributions c JOIN responses r ON r.id = c.response_id "

// Input describes the fields a guest provides for a contribution.
type Input struct {
	Title       string
	Description string
	Needs       string
	Phone       string
	Messengers  []Messenger
}

func (in *Input) normalize() error {
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	in.Needs = strings.TrimSpace(in.Needs)
	in.Phone = strings.TrimSpace(in.Phone)
	if in.Messengers == nil {
		in.Messengers = []Messenger{}
	}
	for i, m := range in.Messengers {
		m.Kind = strings.ToLower(strings.TrimSpace(m.Kind))
		m.Handle = strings.TrimSpace(m.Handle)
		if !slices.Contains(ValidMessengers(), m.Kind) {
			return fmt.Errorf("%w: unknown messenger %q", ErrValidation, m.Kind)
		}
		if len(m.Handle) > maxShortLen {
			return fmt.Errorf("%w: messenger handle is too long", ErrValidation)
		}
		in.Messengers[i] = m
	}

	if in.Title == "" {
		return fmt.Errorf("%w: title must not be empty", ErrValidation)
	}
	reachable := false
	for _, m := range in.Messengers {
		if m.Handle != "" {
			reachable = true
			break
		}
	}
	if !reachable {
		return fmt.Errorf("%w: at least one messenger with a number or username is required", ErrValidation)
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
		`INSERT INTO contributions (response_id, title, description, needs, phone, messengers, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(response_id) DO UPDATE SET title = excluded.title, description = excluded.description,
			needs = excluded.needs, phone = excluded.phone, messengers = excluded.messengers,
			updated_at = excluded.updated_at`,
		responseID, input.Title, input.Description, input.Needs, input.Phone,
		encodeMessengers(input.Messengers), StatusNew, now, now)
	if err != nil {
		return fmt.Errorf("upsert contribution: %w", err)
	}
	return nil
}

// UpdateContent replaces what a guest offered; status, schedule and notes stay.
func (s *Store) UpdateContent(ctx context.Context, id int64, input Input) (Contribution, error) {
	if err := input.normalize(); err != nil {
		return Contribution{}, err
	}
	return s.update(ctx, id, "title = ?, description = ?, needs = ?, phone = ?, messengers = ?",
		input.Title, input.Description, input.Needs, input.Phone, encodeMessengers(input.Messengers))
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
	if err := validateSchedule(slotTime, durationMinutes); err != nil {
		return Contribution{}, err
	}
	return s.update(ctx, id, "slot_time = ?, duration_minutes = ?", strings.TrimSpace(slotTime), durationMinutes)
}

// ScheduleItem is one entry of a bulk schedule update.
type ScheduleItem struct {
	ID              int64
	SlotTime        string
	DurationMinutes int
}

// SetScheduleAll updates the schedule of several contributions atomically.
func (s *Store) SetScheduleAll(ctx context.Context, items []ScheduleItem) error {
	for _, it := range items {
		if err := validateSchedule(it.SlotTime, it.DurationMinutes); err != nil {
			return err
		}
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	for _, it := range items {
		res, err := tx.ExecContext(ctx,
			"UPDATE contributions SET slot_time = ?, duration_minutes = ?, updated_at = ? WHERE id = ?",
			strings.TrimSpace(it.SlotTime), it.DurationMinutes, now, it.ID)
		if err != nil {
			return fmt.Errorf("update schedule: %w", err)
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
	}
	return tx.Commit()
}

func validateSchedule(slotTime string, durationMinutes int) error {
	slotTime = strings.TrimSpace(slotTime)
	if slotTime != "" {
		if _, err := time.Parse("15:04", slotTime); err != nil {
			return fmt.Errorf("%w: slotTime must be HH:MM", ErrValidation)
		}
	}
	if durationMinutes < 0 || durationMinutes > MaxPlannedMinutes {
		return fmt.Errorf("%w: durationMinutes must be between 0 and %d", ErrValidation, MaxPlannedMinutes)
	}
	return nil
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
	var messengers string
	err := row.Scan(&c.ID, &c.ResponseID, &c.ContactName, &c.Title, &c.Description, &c.Needs, &c.Phone,
		&messengers, &c.Status, &c.SlotTime, &c.DurationMinutes, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return c, err
	}
	c.Messengers, err = decodeMessengers(messengers)
	return c, err
}

func encodeMessengers(list []Messenger) string {
	if len(list) == 0 {
		return ""
	}
	b, _ := json.Marshal(list)
	return string(b)
}

func decodeMessengers(raw string) ([]Messenger, error) {
	list := []Messenger{}
	if raw == "" {
		return list, nil
	}
	if err := json.Unmarshal([]byte(raw), &list); err != nil {
		return nil, fmt.Errorf("decode messengers: %w", err)
	}
	return list, nil
}
