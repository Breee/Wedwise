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
	maxChildAge   = 17
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
	Age       int
	PhotoOK   bool
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
	MusicGenres  string
	MusicSong    string
	Attendees    []AttendeeInput
	Contribution *contributions.Input
}

func (p *SubmitParams) normalize() error {
	p.ContactName = strings.TrimSpace(p.ContactName)
	p.Email = strings.TrimSpace(p.Email)
	p.Phone = strings.TrimSpace(p.Phone)
	p.Status = strings.TrimSpace(strings.ToLower(p.Status))
	p.Message = strings.TrimSpace(p.Message)
	p.MusicGenres = strings.TrimSpace(p.MusicGenres)
	p.MusicSong = strings.TrimSpace(p.MusicSong)

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
	if len(p.MusicGenres) > maxShortLen || len(p.MusicSong) > maxShortLen {
		return fmt.Errorf("%w: music wish is too long", ErrValidation)
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
		if !attendee.IsChild {
			attendee.Age = 0
			attendee.PhotoOK = true
		}
		if attendee.Age < 0 || attendee.Age > maxChildAge {
			return fmt.Errorf("%w: child age must be between 0 and %d", ErrValidation, maxChildAge)
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
func (s *Store) Create(ctx context.Context, inviteLinkID int64, params SubmitParams) (Response, string, error) {
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
		`INSERT INTO responses (invite_link_id, edit_token, contact_name, email, phone, status, message, music_genres, music_song, submitted_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		inviteLinkID, token, params.ContactName, params.Email, params.Phone, params.Status, params.Message, params.MusicGenres, params.MusicSong, now, now)
	if err != nil {
		return Response{}, "", fmt.Errorf("insert response: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Response{}, "", fmt.Errorf("response id: %w", err)
	}
	if err := s.writeDetails(ctx, tx, id, params, true); err != nil {
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
	existing, err := s.GetByToken(ctx, token)
	if err != nil {
		return Response{}, err
	}
	return s.update(ctx, existing.ID, params, true)
}

// UpdateByID replaces a response on behalf of the couple or witnesses. The
// contribution is left untouched so the couple can never alter or learn it;
// only a decline removes it, as it would for the guest.
func (s *Store) UpdateByID(ctx context.Context, id int64, params SubmitParams) (Response, error) {
	if _, err := s.GetByID(ctx, id); err != nil {
		return Response{}, err
	}
	params.Contribution = nil
	return s.update(ctx, id, params, params.Status == StatusNo)
}

// Delete removes a response together with its attendees and contribution.
func (s *Store) Delete(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, "DELETE FROM responses WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete response: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) update(ctx context.Context, id int64, params SubmitParams, touchContribution bool) (Response, error) {
	if err := params.normalize(); err != nil {
		return Response{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Response{}, fmt.Errorf("begin response transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx,
		`UPDATE responses SET contact_name = ?, email = ?, phone = ?, status = ?, message = ?, music_genres = ?, music_song = ?, updated_at = ?
		 WHERE id = ?`,
		params.ContactName, params.Email, params.Phone, params.Status, params.Message, params.MusicGenres, params.MusicSong, time.Now().UTC(), id); err != nil {
		return Response{}, fmt.Errorf("update response: %w", err)
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM response_attendees WHERE response_id = ?", id); err != nil {
		return Response{}, fmt.Errorf("clear attendees: %w", err)
	}
	if err := s.writeDetails(ctx, tx, id, params, touchContribution); err != nil {
		return Response{}, err
	}
	if err := tx.Commit(); err != nil {
		return Response{}, fmt.Errorf("commit response: %w", err)
	}
	return s.GetByID(ctx, id)
}

func (s *Store) writeDetails(ctx context.Context, tx *sql.Tx, responseID int64, params SubmitParams, touchContribution bool) error {
	for _, attendee := range params.Attendees {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO response_attendees (response_id, name, is_child, age, photo_ok, diet, allergies) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			responseID, attendee.Name, attendee.IsChild, attendee.Age, attendee.PhotoOK, attendee.Diet, attendee.Allergies); err != nil {
			return fmt.Errorf("insert attendee: %w", err)
		}
	}
	if !touchContribution {
		return nil
	}
	if params.Contribution == nil {
		return s.contributions.DeleteByResponse(ctx, tx, responseID)
	}
	return s.contributions.Upsert(ctx, tx, responseID, *params.Contribution)
}

const responseColumns = "id, contact_name, email, phone, status, message, music_genres, music_song, submitted_at, updated_at"

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
		"SELECT id, response_id, name, is_child, age, photo_ok, diet, allergies FROM response_attendees "+where+" ORDER BY response_id, id", args...)
	if err != nil {
		return nil, fmt.Errorf("list attendees: %w", err)
	}
	defer rows.Close()

	result := make([]Attendee, 0)
	for rows.Next() {
		var attendee Attendee
		if err := rows.Scan(&attendee.ID, &attendee.ResponseID, &attendee.Name, &attendee.IsChild, &attendee.Age, &attendee.PhotoOK,
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
	err := row.Scan(&r.ID, &r.ContactName, &r.Email, &r.Phone, &r.Status, &r.Message, &r.MusicGenres, &r.MusicSong, &r.SubmittedAt, &r.UpdatedAt)
	return r, err
}

// EditTokens returns the edit token of every response, for staff who help
// guests that lost their link.
func (s *Store) EditTokens(ctx context.Context) (map[int64]string, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id, edit_token FROM responses")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tokens := map[int64]string{}
	for rows.Next() {
		var id int64
		var token string
		if err := rows.Scan(&id, &token); err != nil {
			return nil, err
		}
		tokens[id] = token
	}
	return tokens, rows.Err()
}
