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

const columns = `id, invitation_id, title, category, description, participants, duration_minutes,
	technical_requirements, equipment, preferred_time, contact_information, status, created_at, updated_at`

// Params describes the writable fields of a contribution.
type Params struct {
	InvitationID          int64
	Title                 string
	Category              string
	Description           string
	Participants          string
	DurationMinutes       int
	TechnicalRequirements string
	Equipment             string
	PreferredTime         string
	ContactInformation    string
	Status                string
}

func (p *Params) normalize(requireInvitation bool) error {
	p.Title = strings.TrimSpace(p.Title)
	p.Category = strings.TrimSpace(strings.ToLower(p.Category))
	p.Description = strings.TrimSpace(p.Description)
	p.Participants = strings.TrimSpace(p.Participants)
	p.TechnicalRequirements = strings.TrimSpace(p.TechnicalRequirements)
	p.Equipment = strings.TrimSpace(p.Equipment)
	p.PreferredTime = strings.TrimSpace(p.PreferredTime)
	p.ContactInformation = strings.TrimSpace(p.ContactInformation)
	p.Status = strings.TrimSpace(strings.ToLower(p.Status))

	if p.Title == "" {
		return fmt.Errorf("%w: title must not be empty", ErrValidation)
	}
	if p.Category == "" {
		p.Category = CategoryOther
	}
	if !IsValidCategory(p.Category) {
		return fmt.Errorf("%w: category must be one of %s", ErrValidation, strings.Join(ValidCategories(), ", "))
	}
	if p.Status == "" {
		p.Status = StatusNew
	}
	if !IsValidStatus(p.Status) {
		return fmt.Errorf("%w: status must be one of %s", ErrValidation, strings.Join(ValidStatuses(), ", "))
	}
	if p.DurationMinutes < 0 || p.DurationMinutes > 24*60 {
		return fmt.Errorf("%w: durationMinutes must be between 0 and 1440", ErrValidation)
	}
	if requireInvitation && p.InvitationID <= 0 {
		return fmt.Errorf("%w: invitationId is required", ErrValidation)
	}
	return nil
}

// Create inserts a new contribution.
func (s *Store) Create(ctx context.Context, params Params) (Contribution, error) {
	if err := params.normalize(true); err != nil {
		return Contribution{}, err
	}
	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO contributions (invitation_id, title, category, description, participants, duration_minutes,
			technical_requirements, equipment, preferred_time, contact_information, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		params.InvitationID, params.Title, params.Category, params.Description, params.Participants,
		params.DurationMinutes, params.TechnicalRequirements, params.Equipment, params.PreferredTime,
		params.ContactInformation, params.Status, now, now)
	if err != nil {
		return Contribution{}, fmt.Errorf("insert contribution: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Contribution{}, fmt.Errorf("contribution id: %w", err)
	}
	return s.GetByID(ctx, id)
}

// GetByID returns a contribution by id.
func (s *Store) GetByID(ctx context.Context, id int64) (Contribution, error) {
	contribution, err := scan(s.db.QueryRowContext(ctx, "SELECT "+columns+" FROM contributions WHERE id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return Contribution{}, ErrNotFound
	}
	if err != nil {
		return Contribution{}, fmt.Errorf("get contribution: %w", err)
	}
	return contribution, nil
}

// List returns all contributions, newest first.
func (s *Store) List(ctx context.Context, status string) ([]Contribution, error) {
	query := "SELECT " + columns + " FROM contributions ORDER BY created_at DESC, id DESC"
	args := []any{}
	if status != "" {
		if !IsValidStatus(status) {
			return nil, fmt.Errorf("%w: unknown status filter %q", ErrValidation, status)
		}
		query = "SELECT " + columns + " FROM contributions WHERE status = ? ORDER BY created_at DESC, id DESC"
		args = append(args, status)
	}

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

// Update changes an existing contribution.
func (s *Store) Update(ctx context.Context, id int64, params Params) (Contribution, error) {
	if err := params.normalize(false); err != nil {
		return Contribution{}, err
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE contributions SET title = ?, category = ?, description = ?, participants = ?,
			duration_minutes = ?, technical_requirements = ?, equipment = ?, preferred_time = ?,
			contact_information = ?, status = ?, updated_at = ? WHERE id = ?`,
		params.Title, params.Category, params.Description, params.Participants, params.DurationMinutes,
		params.TechnicalRequirements, params.Equipment, params.PreferredTime, params.ContactInformation,
		params.Status, time.Now().UTC(), id)
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

// CountByInvitation returns the number of contributions of an invitation.
func (s *Store) CountByInvitation(ctx context.Context, invitationID int64) (int, error) {
	var count int
	if err := s.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM contributions WHERE invitation_id = ?", invitationID).Scan(&count); err != nil {
		return 0, fmt.Errorf("count contributions: %w", err)
	}
	return count, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scan(row scanner) (Contribution, error) {
	var c Contribution
	err := row.Scan(&c.ID, &c.InvitationID, &c.Title, &c.Category, &c.Description, &c.Participants,
		&c.DurationMinutes, &c.TechnicalRequirements, &c.Equipment, &c.PreferredTime,
		&c.ContactInformation, &c.Status, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}
