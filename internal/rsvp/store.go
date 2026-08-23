package rsvp

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

// ErrNotFound is returned when no RSVP exists for an invitation.
var ErrNotFound = errors.New("rsvp not found")

// ErrValidation is returned when input validation fails.
var ErrValidation = errors.New("invalid rsvp data")

// Store persists RSVPs and attendees in SQLite.
type Store struct {
	db *sql.DB
}

// NewStore creates an RSVP store backed by db.
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// AttendeeInput describes a single attendee submitted with an RSVP.
type AttendeeInput struct {
	Name      string
	Attending bool
	IsChild   bool
	Diet      string
	Allergies string
	Notes     string
}

// SubmitParams describes an RSVP submission.
type SubmitParams struct {
	Status    string
	Message   string
	Attendees []AttendeeInput
}

func (p *SubmitParams) normalize(maxGuests int) error {
	p.Status = strings.TrimSpace(strings.ToLower(p.Status))
	p.Message = strings.TrimSpace(p.Message)
	if p.Status == "" {
		p.Status = StatusPending
	}
	if !IsValidStatus(p.Status) {
		return fmt.Errorf("%w: status must be one of %s", ErrValidation, strings.Join(ValidStatuses(), ", "))
	}
	if len(p.Message) > 4000 {
		return fmt.Errorf("%w: message is too long", ErrValidation)
	}
	if maxGuests > 0 && len(p.Attendees) > maxGuests {
		return fmt.Errorf("%w: at most %d attendees are allowed for this invitation", ErrValidation, maxGuests)
	}

	for i := range p.Attendees {
		attendee := &p.Attendees[i]
		attendee.Name = strings.TrimSpace(attendee.Name)
		attendee.Diet = strings.TrimSpace(strings.ToLower(attendee.Diet))
		attendee.Allergies = strings.TrimSpace(attendee.Allergies)
		attendee.Notes = strings.TrimSpace(attendee.Notes)
		if attendee.Name == "" {
			return fmt.Errorf("%w: every attendee needs a name", ErrValidation)
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

// Get returns the RSVP of an invitation.
func (s *Store) Get(ctx context.Context, invitationID int64) (RSVP, error) {
	var response RSVP
	err := s.db.QueryRowContext(ctx,
		`SELECT id, invitation_id, status, message, submitted_at, updated_at
		 FROM rsvps WHERE invitation_id = ?`, invitationID).
		Scan(&response.ID, &response.InvitationID, &response.Status, &response.Message,
			&response.SubmittedAt, &response.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return RSVP{}, ErrNotFound
	}
	if err != nil {
		return RSVP{}, fmt.Errorf("get rsvp: %w", err)
	}
	return response, nil
}

// Attendees returns the attendees of an invitation.
func (s *Store) Attendees(ctx context.Context, invitationID int64) ([]Attendee, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, invitation_id, name, attending, is_child, diet, allergies, notes
		 FROM rsvp_attendees WHERE invitation_id = ? ORDER BY id`, invitationID)
	if err != nil {
		return nil, fmt.Errorf("list attendees: %w", err)
	}
	defer rows.Close()

	result := make([]Attendee, 0)
	for rows.Next() {
		var attendee Attendee
		if err := rows.Scan(&attendee.ID, &attendee.InvitationID, &attendee.Name, &attendee.Attending,
			&attendee.IsChild, &attendee.Diet, &attendee.Allergies, &attendee.Notes); err != nil {
			return nil, fmt.Errorf("scan attendee: %w", err)
		}
		result = append(result, attendee)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate attendees: %w", err)
	}
	return result, nil
}

// Submit creates or replaces the RSVP and attendees of an invitation.
func (s *Store) Submit(ctx context.Context, invitationID int64, maxGuests int, params SubmitParams) (RSVP, []Attendee, error) {
	if err := params.normalize(maxGuests); err != nil {
		return RSVP{}, nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return RSVP{}, nil, fmt.Errorf("begin rsvp transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	now := time.Now().UTC()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO rsvps (invitation_id, status, message, submitted_at, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(invitation_id) DO UPDATE SET status = excluded.status, message = excluded.message,
			updated_at = excluded.updated_at`,
		invitationID, params.Status, params.Message, now, now); err != nil {
		return RSVP{}, nil, fmt.Errorf("upsert rsvp: %w", err)
	}

	if _, err := tx.ExecContext(ctx, "DELETE FROM rsvp_attendees WHERE invitation_id = ?", invitationID); err != nil {
		return RSVP{}, nil, fmt.Errorf("clear attendees: %w", err)
	}
	for _, attendee := range params.Attendees {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO rsvp_attendees (invitation_id, name, attending, is_child, diet, allergies, notes)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			invitationID, attendee.Name, attendee.Attending, attendee.IsChild,
			attendee.Diet, attendee.Allergies, attendee.Notes); err != nil {
			return RSVP{}, nil, fmt.Errorf("insert attendee: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return RSVP{}, nil, fmt.Errorf("commit rsvp: %w", err)
	}

	response, err := s.Get(ctx, invitationID)
	if err != nil {
		return RSVP{}, nil, err
	}
	attendees, err := s.Attendees(ctx, invitationID)
	if err != nil {
		return RSVP{}, nil, err
	}
	return response, attendees, nil
}

// Summarize aggregates RSVP statistics across all invitations.
func (s *Store) Summarize(ctx context.Context) (Summary, error) {
	summary := Summary{
		StatusCounts: map[string]int{},
		DietCounts:   map[string]int{},
		Allergies:    []string{},
	}
	for _, status := range ValidStatuses() {
		summary.StatusCounts[status] = 0
	}
	for _, diet := range ValidDiets() {
		summary.DietCounts[diet] = 0
	}

	if err := s.db.QueryRowContext(ctx,
		"SELECT COUNT(*), COALESCE(SUM(CASE WHEN active THEN 1 ELSE 0 END), 0) FROM invitations").
		Scan(&summary.Invitations, &summary.ActiveInvitations); err != nil {
		return Summary{}, fmt.Errorf("count invitations: %w", err)
	}

	statusRows, err := s.db.QueryContext(ctx, "SELECT status, COUNT(*) FROM rsvps GROUP BY status")
	if err != nil {
		return Summary{}, fmt.Errorf("aggregate rsvp status: %w", err)
	}
	defer statusRows.Close()
	for statusRows.Next() {
		var status string
		var count int
		if err := statusRows.Scan(&status, &count); err != nil {
			return Summary{}, fmt.Errorf("scan rsvp status: %w", err)
		}
		summary.StatusCounts[status] += count
		if status != StatusPending {
			summary.RespondedInvitation += count
		}
	}
	if err := statusRows.Err(); err != nil {
		return Summary{}, fmt.Errorf("iterate rsvp status: %w", err)
	}

	attendeeRows, err := s.db.QueryContext(ctx,
		"SELECT attending, is_child, diet, allergies FROM rsvp_attendees")
	if err != nil {
		return Summary{}, fmt.Errorf("aggregate attendees: %w", err)
	}
	defer attendeeRows.Close()

	allergies := map[string]bool{}
	for attendeeRows.Next() {
		var attending, isChild bool
		var diet, allergy string
		if err := attendeeRows.Scan(&attending, &isChild, &diet, &allergy); err != nil {
			return Summary{}, fmt.Errorf("scan attendee summary: %w", err)
		}
		summary.AttendeesTotal++
		if attending {
			summary.AttendeesAttending++
			summary.DietCounts[diet]++
			if isChild {
				summary.Children++
			}
			if allergy != "" {
				allergies[allergy] = true
			}
		}
	}
	if err := attendeeRows.Err(); err != nil {
		return Summary{}, fmt.Errorf("iterate attendee summary: %w", err)
	}

	for allergy := range allergies {
		summary.Allergies = append(summary.Allergies, allergy)
	}
	sort.Strings(summary.Allergies)
	return summary, nil
}
