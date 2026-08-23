package content

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ErrValidation is returned when input validation fails.
var ErrValidation = errors.New("invalid content data")

// Store persists website content in SQLite.
type Store struct {
	db *sql.DB
}

// NewStore creates a content store backed by db.
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Content block keys.
const (
	keyHeroEyebrow          = "hero.eyebrow"
	keyHeroHeadline         = "hero.headline"
	keyHeroSubtitle         = "hero.subtitle"
	keyHeroNote             = "hero.note"
	keyIntroductionText     = "introduction.text"
	keyLocationName         = "location.name"
	keyLocationAddress      = "location.address"
	keyLocationDescription  = "location.description"
	keyLocationNavigation   = "location.navigationUrl"
	keyLocationTransport    = "location.transport"
	keyLocationParking      = "location.parking"
	maxContentBlockLenBytes = 20000
)

// Get loads the complete website content.
func (s *Store) Get(ctx context.Context) (Content, error) {
	blocks, updatedAt, err := s.blocks(ctx)
	if err != nil {
		return Content{}, err
	}

	result := Content{
		Hero: Hero{
			Eyebrow:  blocks[keyHeroEyebrow],
			Headline: blocks[keyHeroHeadline],
			Subtitle: blocks[keyHeroSubtitle],
			Note:     blocks[keyHeroNote],
		},
		Introduction: Introduction{Text: blocks[keyIntroductionText]},
		Location: Location{
			Name:          blocks[keyLocationName],
			Address:       blocks[keyLocationAddress],
			Description:   blocks[keyLocationDescription],
			NavigationURL: blocks[keyLocationNavigation],
			Transport:     blocks[keyLocationTransport],
			Parking:       blocks[keyLocationParking],
		},
		UpdatedAt: updatedAt,
	}

	if result.Schedule, err = s.schedule(ctx); err != nil {
		return Content{}, err
	}
	if result.FAQ, err = s.faq(ctx); err != nil {
		return Content{}, err
	}
	return result, nil
}

// Replace overwrites the complete website content.
func (s *Store) Replace(ctx context.Context, updated Content) (Content, error) {
	normalized, err := normalize(updated)
	if err != nil {
		return Content{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Content{}, fmt.Errorf("begin content transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	now := time.Now().UTC()
	values := map[string]string{
		keyHeroEyebrow:         normalized.Hero.Eyebrow,
		keyHeroHeadline:        normalized.Hero.Headline,
		keyHeroSubtitle:        normalized.Hero.Subtitle,
		keyHeroNote:            normalized.Hero.Note,
		keyIntroductionText:    normalized.Introduction.Text,
		keyLocationName:        normalized.Location.Name,
		keyLocationAddress:     normalized.Location.Address,
		keyLocationDescription: normalized.Location.Description,
		keyLocationNavigation:  normalized.Location.NavigationURL,
		keyLocationTransport:   normalized.Location.Transport,
		keyLocationParking:     normalized.Location.Parking,
	}
	for key, value := range values {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO content_blocks (key, value, updated_at) VALUES (?, ?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			key, value, now); err != nil {
			return Content{}, fmt.Errorf("upsert content block %s: %w", key, err)
		}
	}

	if _, err := tx.ExecContext(ctx, "DELETE FROM schedule_entries"); err != nil {
		return Content{}, fmt.Errorf("clear schedule: %w", err)
	}
	for _, entry := range normalized.Schedule {
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO schedule_entries (time, title, description, sort_order) VALUES (?, ?, ?, ?)",
			entry.Time, entry.Title, entry.Description, entry.Order); err != nil {
			return Content{}, fmt.Errorf("insert schedule entry: %w", err)
		}
	}

	if _, err := tx.ExecContext(ctx, "DELETE FROM faq_entries"); err != nil {
		return Content{}, fmt.Errorf("clear faq: %w", err)
	}
	for _, entry := range normalized.FAQ {
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO faq_entries (question, answer, sort_order) VALUES (?, ?, ?)",
			entry.Question, entry.Answer, entry.Order); err != nil {
			return Content{}, fmt.Errorf("insert faq entry: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return Content{}, fmt.Errorf("commit content: %w", err)
	}
	return s.Get(ctx)
}

func (s *Store) blocks(ctx context.Context) (map[string]string, time.Time, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT key, value, updated_at FROM content_blocks")
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("load content blocks: %w", err)
	}
	defer rows.Close()

	blocks := map[string]string{}
	var latest time.Time
	for rows.Next() {
		var key, value string
		var updatedAt time.Time
		if err := rows.Scan(&key, &value, &updatedAt); err != nil {
			return nil, time.Time{}, fmt.Errorf("scan content block: %w", err)
		}
		blocks[key] = value
		if updatedAt.After(latest) {
			latest = updatedAt
		}
	}
	if err := rows.Err(); err != nil {
		return nil, time.Time{}, fmt.Errorf("iterate content blocks: %w", err)
	}
	return blocks, latest, nil
}

func (s *Store) schedule(ctx context.Context) ([]ScheduleEntry, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT id, time, title, description, sort_order FROM schedule_entries ORDER BY sort_order, id")
	if err != nil {
		return nil, fmt.Errorf("load schedule: %w", err)
	}
	defer rows.Close()

	entries := make([]ScheduleEntry, 0)
	for rows.Next() {
		var entry ScheduleEntry
		if err := rows.Scan(&entry.ID, &entry.Time, &entry.Title, &entry.Description, &entry.Order); err != nil {
			return nil, fmt.Errorf("scan schedule entry: %w", err)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate schedule: %w", err)
	}
	return entries, nil
}

func (s *Store) faq(ctx context.Context) ([]FAQEntry, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT id, question, answer, sort_order FROM faq_entries ORDER BY sort_order, id")
	if err != nil {
		return nil, fmt.Errorf("load faq: %w", err)
	}
	defer rows.Close()

	entries := make([]FAQEntry, 0)
	for rows.Next() {
		var entry FAQEntry
		if err := rows.Scan(&entry.ID, &entry.Question, &entry.Answer, &entry.Order); err != nil {
			return nil, fmt.Errorf("scan faq entry: %w", err)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate faq: %w", err)
	}
	return entries, nil
}

func normalize(input Content) (Content, error) {
	fields := []*string{
		&input.Hero.Eyebrow, &input.Hero.Headline, &input.Hero.Subtitle, &input.Hero.Note,
		&input.Introduction.Text,
		&input.Location.Name, &input.Location.Address, &input.Location.Description,
		&input.Location.NavigationURL, &input.Location.Transport, &input.Location.Parking,
	}
	for _, field := range fields {
		*field = strings.TrimSpace(*field)
		if len(*field) > maxContentBlockLenBytes {
			return Content{}, fmt.Errorf("%w: a content field exceeds the maximum length", ErrValidation)
		}
	}
	if input.Location.NavigationURL != "" && !isHTTPURL(input.Location.NavigationURL) {
		return Content{}, fmt.Errorf("%w: navigationUrl must be an http(s) URL", ErrValidation)
	}

	for i := range input.Schedule {
		entry := &input.Schedule[i]
		entry.Time = strings.TrimSpace(entry.Time)
		entry.Title = strings.TrimSpace(entry.Title)
		entry.Description = strings.TrimSpace(entry.Description)
		if entry.Title == "" {
			return Content{}, fmt.Errorf("%w: schedule entries need a title", ErrValidation)
		}
		if entry.Order == 0 {
			entry.Order = i + 1
		}
	}
	for i := range input.FAQ {
		entry := &input.FAQ[i]
		entry.Question = strings.TrimSpace(entry.Question)
		entry.Answer = strings.TrimSpace(entry.Answer)
		if entry.Question == "" {
			return Content{}, fmt.Errorf("%w: faq entries need a question", ErrValidation)
		}
		if entry.Order == 0 {
			entry.Order = i + 1
		}
	}
	return input, nil
}

func isHTTPURL(value string) bool {
	lower := strings.ToLower(value)
	return strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://")
}
