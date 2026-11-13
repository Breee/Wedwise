package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/Breee/Wedwise/internal/tokens"
)

// SessionCookieName is the name of the session cookie. Over HTTPS it carries
// the __Host- prefix, which binds it to this host and to secure connections.
const (
	SessionCookieName       = "wedwise_session"
	SecureSessionCookieName = "__Host-" + SessionCookieName
)

// Default session lifetimes: in total and without activity.
const (
	SessionDuration    = 24 * time.Hour
	SessionIdleTimeout = 2 * time.Hour
)

// ErrSessionNotFound is returned when a session does not exist or has expired.
var ErrSessionNotFound = errors.New("session not found")

// ErrUserNotFound is returned by a UserLookup when no matching user exists.
var ErrUserNotFound = errors.New("user not found")

// ErrInvalidCredentials is returned when authentication fails.
var ErrInvalidCredentials = errors.New("invalid credentials")

// Identity is the minimal user information required for authentication.
type Identity struct {
	ID           int64  `json:"id"`
	Username     string `json:"username"`
	Email        string `json:"email"`
	DisplayName  string `json:"displayName"`
	Role         string `json:"role"`
	Active       bool   `json:"active"`
	PasswordHash string `json:"-"`
	// TwoFactorSetupRequired is set when the role must use a second factor
	// and the user has none yet. Such a session may only set one up.
	TwoFactorSetupRequired bool `json:"-"`
}

// HasPermission reports whether the identity's role grants the permission.
func (i Identity) HasPermission(permission string) bool {
	return RoleHasPermission(i.Role, permission)
}

// UserLookup provides access to user records for authentication purposes.
type UserLookup interface {
	IdentityByID(ctx context.Context, id int64) (Identity, error)
	IdentityByUsername(ctx context.Context, username string) (Identity, error)
}

// Session is a server side session record.
type Session struct {
	// ID is the secret cookie value. It is only set on a new session; the
	// database keeps its hash.
	ID string `json:"-"`
	// Key identifies the session without granting access to it.
	Key        string    `json:"id"`
	UserID     int64     `json:"-"`
	UserAgent  string    `json:"userAgent"`
	ExpiresAt  time.Time `json:"expiresAt"`
	CreatedAt  time.Time `json:"createdAt"`
	LastSeenAt time.Time `json:"lastSeenAt"`
}

// touchInterval limits how often activity is written to the database.
const touchInterval = time.Minute

const maxUserAgentLength = 300

// SessionStore persists sessions in SQLite.
type SessionStore struct {
	db     *sql.DB
	maxAge time.Duration
	idle   time.Duration
	now    func() time.Time
}

// NewSessionStore creates a SessionStore backed by db.
func NewSessionStore(db *sql.DB) *SessionStore {
	return &SessionStore{
		db:     db,
		maxAge: SessionDuration,
		idle:   SessionIdleTimeout,
		now:    func() time.Time { return time.Now().UTC() },
	}
}

// SetTimeouts overrides how long a session lives in total and without
// activity. Zero keeps the current value.
func (s *SessionStore) SetTimeouts(maxAge, idle time.Duration) {
	if maxAge > 0 {
		s.maxAge = maxAge
	}
	if idle > 0 {
		s.idle = idle
	}
}

// Create stores a new session for the given user.
func (s *SessionStore) Create(ctx context.Context, userID int64, userAgent string) (Session, error) {
	id, err := randomToken(32)
	if err != nil {
		return Session{}, err
	}
	if len(userAgent) > maxUserAgentLength {
		userAgent = userAgent[:maxUserAgentLength]
	}
	now := s.now()
	session := Session{
		ID:         id,
		Key:        tokens.Hash(id),
		UserID:     userID,
		UserAgent:  userAgent,
		ExpiresAt:  now.Add(s.maxAge),
		CreatedAt:  now,
		LastSeenAt: now,
	}
	_, err = s.db.ExecContext(ctx,
		"INSERT INTO sessions (id, user_id, user_agent, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
		session.Key, session.UserID, session.UserAgent, session.ExpiresAt, session.CreatedAt, session.LastSeenAt)
	if err != nil {
		return Session{}, fmt.Errorf("create session: %w", err)
	}
	return session, nil
}

const sessionColumns = "id, user_id, user_agent, expires_at, created_at, last_seen_at"

func scanSession(row interface{ Scan(...any) error }) (Session, error) {
	var session Session
	err := row.Scan(&session.Key, &session.UserID, &session.UserAgent,
		&session.ExpiresAt, &session.CreatedAt, &session.LastSeenAt)
	return session, err
}

func (s *SessionStore) expired(session Session, now time.Time) bool {
	return now.After(session.ExpiresAt) || now.After(session.LastSeenAt.Add(s.idle))
}

// Get returns the live session of a cookie value and records the activity.
func (s *SessionStore) Get(ctx context.Context, id string) (Session, error) {
	key := tokens.Hash(id)
	session, err := scanSession(s.db.QueryRowContext(ctx,
		"SELECT "+sessionColumns+" FROM sessions WHERE id = ?", key))
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, ErrSessionNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("get session: %w", err)
	}
	now := s.now()
	if s.expired(session, now) {
		_ = s.DeleteKey(ctx, session.UserID, key)
		return Session{}, ErrSessionNotFound
	}
	if now.Sub(session.LastSeenAt) >= touchInterval {
		if _, err := s.db.ExecContext(ctx, "UPDATE sessions SET last_seen_at = ? WHERE id = ?", now, key); err != nil {
			return Session{}, fmt.Errorf("touch session: %w", err)
		}
		session.LastSeenAt = now
	}
	return session, nil
}

// List returns the live sessions of a user, most recently used first.
func (s *SessionStore) List(ctx context.Context, userID int64) ([]Session, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT "+sessionColumns+" FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC", userID)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()
	now := s.now()
	sessions := []Session{}
	for rows.Next() {
		session, err := scanSession(rows)
		if err != nil {
			return nil, fmt.Errorf("list sessions: %w", err)
		}
		if !s.expired(session, now) {
			sessions = append(sessions, session)
		}
	}
	return sessions, rows.Err()
}

// Delete removes the session of a cookie value.
func (s *SessionStore) Delete(ctx context.Context, id string) error {
	if _, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE id = ?", tokens.Hash(id)); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

// DeleteKey removes one session of a user by its key.
func (s *SessionStore) DeleteKey(ctx context.Context, userID int64, key string) error {
	if _, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE user_id = ? AND id = ?", userID, key); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

// DeleteOthers removes all sessions of a user except the one with keepKey.
func (s *SessionStore) DeleteOthers(ctx context.Context, userID int64, keepKey string) error {
	if _, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE user_id = ? AND id != ?", userID, keepKey); err != nil {
		return fmt.Errorf("delete other sessions: %w", err)
	}
	return nil
}

// DeleteByUser removes all sessions of a user.
func (s *SessionStore) DeleteByUser(ctx context.Context, userID int64) error {
	if _, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE user_id = ?", userID); err != nil {
		return fmt.Errorf("delete user sessions: %w", err)
	}
	return nil
}

// DeleteExpired removes all expired and idle sessions.
func (s *SessionStore) DeleteExpired(ctx context.Context) error {
	now := s.now()
	if _, err := s.db.ExecContext(ctx,
		"DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?", now, now.Add(-s.idle)); err != nil {
		return fmt.Errorf("delete expired sessions: %w", err)
	}
	return nil
}

func randomToken(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate random token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
