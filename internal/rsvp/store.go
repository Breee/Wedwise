package rsvp

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Breee/Wedwise/internal/contributions"
)

// ErrNotFound is returned when no response matches.
var ErrNotFound = errors.New("response not found")

// ErrValidation is returned when input validation fails.
var ErrValidation = errors.New("invalid rsvp data")

const (
	maxShortLen   = 200
	maxMessageLen = 4000
)

// Store persists responses and attendees in SQLite.
type Store struct {
	db            *sql.DB
	contributions *contributions.Store
}

// NewStore creates a response store backed by db.
func NewStore(db *sql.DB, contributionStore *contributions.Store) *Store {
	return &Store{db: db, contributions: contributionStore}
}

// AttendeeInput describes a single attendee of a submission.
type AttendeeInput struct {
	Name      string
	IsChild   bool
	Diet      string
	Allergies string
}

// SubmitParams describes a submission of the RSVP form.
type SubmitParams struct {
	ContactName  string
	Email        string
	Phone        string
	Status       string
	Message      string
	Attendees    []AttendeeInput
	Contribution *contributions.Input
}

func (p *SubmitParams) normalize() error {
	p.ContactName = strings.TrimSpace(p.ContactName)
	p.Email = strings.TrimSpace(p.Email)
	p.Phone = strings.TrimSpace(p.Phone)
	p.Status = strings.TrimSpace(strings.ToLower(p.Status))
	p.Message = strings.TrimSpace(p.Message)

	if p.ContactName == "" {
		return fmt.Errorf("%w: contactName must not be empty", ErrValidation)
	}
	if len(p.ContactName) > maxShortLen || len(p.Email) > maxShortLen || len(p.Phone) > maxShortLen {
		return fmt.Errorf("%w: contact details are too long", ErrValidation)
	}
	if p.Email != "" && (!strings.Contains(p.Email, "@") || strings.ContainsAny(p.Email, " \t\r\n")) {
		return fmt.Errorf("%w: email is not valid", ErrValidation)
	}
	if !IsValidStatus(p.Status) {
		return fmt.Errorf("%w: status must be one of %s", ErrValidation, strings.Join(ValidStatuses(), ", "))
	}
	if len(p.Message) > maxMessageLen {
		return fmt.Errorf("%w: message is too long", ErrValidation)
	}

	if p.Status == StatusNo {
		p.Attendees = nil
		p.Contribution = nil
		return nil
	}
	if len(p.Attendees) == 0 {
		return fmt.Errorf("%w: at least one attendee is required", ErrValidation)
	}
	if len(p.Attendees) > MaxAttendees {
		return fmt.Errorf("%w: at most %d attendees are allowed", ErrValidation, MaxAttendees)
	}
	for i := range p.Attendees {
		attendee := &p.Attendees[i]
		attendee.Name = strings.TrimSpace(attendee.Name)
		attendee.Diet = strings.TrimSpace(strings.ToLower(attendee.Diet))
		attendee.Allergies = strings.TrimSpace(attendee.Allergies)
		if attendee.Name == "" {
			return fmt.Errorf("%w: every attendee needs a name", ErrValidation)
		}
		if len(attendee.Name) > maxShortLen || len(attendee.Allergies) > maxMessageLen {
			return fmt.Errorf("%w: attendee details are too long", ErrValidation)
		}
		if attendee.Diet == "" {
			attendee.Diet = DietNone
		}
		if !IsValidDiet(attendee.Diet) {
			return fmt.Errorf("%w: diet must be one of %s", ErrValidation, strings.Join(ValidDiets(), ", "))
		}
	}
	return nil
}

// Create stores a new response and returns it together with its edit token.
func (s *Store) Create(ctx context.Context, params SubmitParams) (Response, string, error) {
	if err := params.normalize(); err != nil {
		return Response{}, "", err
	}
	token, err := GenerateToken()
	if err != nil {
		return Response{}, "", err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Response{}, "", fmt.Errorf("begin response transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	now := time.Now().UTC()
	res, err := tx.ExecContext(ctx,
		`INSERT INTO responses (edit_token, contact_name, email, phone, status, message, submitted_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		token, params.ContactName, params.Email, params.Phone, params.Status, params.Message, now, now)
	if err != nil {
		return Response{}, "", fmt.Errorf("insert response: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Response{}, "", fmt.Errorf("response id: %w", err)
	}
	if err := s.writeDetails(ctx, tx, id, params); err != nil {
		return Response{}, "", err
	}
	if err := tx.Commit(); err != nil {
		return Response{}, "", fmt.Errorf("commit response: %w", err)
	}

	response, err := s.GetByID(ctx, id)
	return response, token, err
}

// Update replaces the response identified by its edit token.
func (s *Store) Update(ctx context.Context, token string, params SubmitParams) (Response, error) {
	if err := params.normalize(); err != nil {
		return Response{}, err
	}
	existing, err := s.GetByToken(ctx, token)
	if err != nil {
		return Response{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Response{}, fmt.Errorf("begin response transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx,
		`UPDATE responses SET contact_name = ?, email = ?, phone = ?, status = ?, message = ?, updated_at = ?
		 WHERE id = ?`,
		params.ContactName, params.Email, params.Phone, params.Status, params.Message, time.Now().UTC(), existing.ID); err != nil {
		return Response{}, fmt.Errorf("update response: %w", err)
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM response_attendees WHERE response_id = ?", existing.ID); err != nil {
		return Response{}, fmt.Errorf("clear attendees: %w", err)
	}
	if err := s.writeDetails(ctx, tx, existing.ID, params); err != nil {
		return Response{}, err
	}
	if err := tx.Commit(); err != nil {
		return Response{}, fmt.Errorf("commit response: %w", err)
	}
	return s.GetByID(ctx, existing.ID)
}

func (s *Store) writeDetails(ctx context.Context, tx *sql.Tx, responseID int64, params SubmitParams) error {
	for _, attendee := range params.Attendees {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO response_attendees (response_id, name, is_child, diet, allergies) VALUES (?, ?, ?, ?, ?)`,
			responseID, attendee.Name, attendee.IsChild, attendee.Diet, attendee.Allergies); err != nil {
			return fmt.Errorf("insert attendee: %w", err)
		}
	}
	if params.Contribution == nil {
		return s.contributions.DeleteByResponse(ctx, tx, responseID)
	}
	return s.contributions.Upsert(ctx, tx, responseID, *params.Contribution)
}

const responseColumns = "id, contact_name, email, phone, status, message, submitted_at, updated_at"

// GetByID returns a response by id.
func (s *Store) GetByID(ctx context.Context, id int64) (Response, error) {
	return s.queryOne(ctx, "SELECT "+responseColumns+" FROM responses WHERE id = ?", id)
}

// GetByToken returns a response by its edit token.
func (s *Store) GetByToken(ctx context.Context, token string) (Response, error) {
	if token == "" {
		return Response{}, ErrNotFound
	}
	return s.queryOne(ctx, "SELECT "+responseColumns+" FROM responses WHERE edit_token = ?", token)
}

func (s *Store) queryOne(ctx context.Context, query string, args ...any) (Response, error) {
	response, err := scanResponse(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return Response{}, ErrNotFound
	}
	if err != nil {
		return Response{}, fmt.Errorf("get response: %w", err)
	}
	return response, nil
}

// List returns all responses, newest first.
func (s *Store) List(ctx context.Context) ([]Response, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT "+responseColumns+" FROM responses ORDER BY submitted_at DESC, id DESC")
	if err != nil {
		return nil, fmt.Errorf("list responses: %w", err)
	}
	defer rows.Close()

	result := make([]Response, 0)
	for rows.Next() {
		response, err := scanResponse(rows)
		if err != nil {
			return nil, fmt.Errorf("scan response: %w", err)
		}
		result = append(result, response)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate responses: %w", err)
	}
	return result, nil
}

// Attendees returns the attendees of a response.
func (s *Store) Attendees(ctx context.Context, responseID int64) ([]Attendee, error) {
	return s.queryAttendees(ctx, "WHERE response_id = ?", responseID)
}

// AllAttendees returns every attendee ordered by response and id.
func (s *Store) AllAttendees(ctx context.Context) ([]Attendee, error) {
	return s.queryAttendees(ctx, "")
}

func (s *Store) queryAttendees(ctx context.Context, where string, args ...any) ([]Attendee, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT id, response_id, name, is_child, diet, allergies FROM response_attendees "+where+" ORDER BY response_id, id", args...)
	if err != nil {
		return nil, fmt.Errorf("list attendees: %w", err)
	}
	defer rows.Close()

	result := make([]Attendee, 0)
	for rows.Next() {
		var attendee Attendee
		if err := rows.Scan(&attendee.ID, &attendee.ResponseID, &attendee.Name, &attendee.IsChild,
			&attendee.Diet, &attendee.Allergies); err != nil {
			return nil, fmt.Errorf("scan attendee: %w", err)
		}
		result = append(result, attendee)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate attendees: %w", err)
	}
	return result, nil
}

// Summarize aggregates response statistics.
func (s *Store) Summarize(ctx context.Context) (Summary, error) {
	summary := Summary{
		StatusCounts: map[string]int{},
		DietCounts:   map[string]int{},
		Allergies:    []AllergyEntry{},
	}
	for _, status := range ValidStatuses() {
		summary.StatusCounts[status] = 0
	}
	for _, diet := range ValidDiets() {
		summary.DietCounts[diet] = 0
	}

	statusRows, err := s.db.QueryContext(ctx, "SELECT status, COUNT(*) FROM responses GROUP BY status")
	if err != nil {
		return Summary{}, fmt.Errorf("aggregate response status: %w", err)
	}
	defer statusRows.Close()
	for statusRows.Next() {
		var status string
		var count int
		if err := statusRows.Scan(&status, &count); err != nil {
			return Summary{}, fmt.Errorf("scan response status: %w", err)
		}
		summary.StatusCounts[status] += count
		summary.Responses += count
	}
	if err := statusRows.Err(); err != nil {
		return Summary{}, fmt.Errorf("iterate response status: %w", err)
	}

	attendees, err := s.AllAttendees(ctx)
	if err != nil {
		return Summary{}, err
	}
	for _, attendee := range attendees {
		summary.AttendeesAttending++
		summary.DietCounts[attendee.Diet]++
		if attendee.IsChild {
			summary.Children++
		}
		if attendee.Allergies != "" {
			summary.Allergies = append(summary.Allergies, AllergyEntry{Name: attendee.Name, Allergies: attendee.Allergies})
		}
	}
	return summary, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanResponse(row scanner) (Response, error) {
	var r Response
	err := row.Scan(&r.ID, &r.ContactName, &r.Email, &r.Phone, &r.Status, &r.Message, &r.SubmittedAt, &r.UpdatedAt)
	return r, err
}
