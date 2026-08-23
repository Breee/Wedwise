package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"time"
)

// SessionCookieName is the name of the session cookie.
const SessionCookieName = "wedwise_session"

// SessionDuration is how long a session stays valid.
const SessionDuration = 24 * time.Hour

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
	ID        string
	UserID    int64
	ExpiresAt time.Time
	CreatedAt time.Time
}

// SessionStore persists sessions in SQLite.
type SessionStore struct {
	db *sql.DB
}

// NewSessionStore creates a SessionStore backed by db.
func NewSessionStore(db *sql.DB) *SessionStore {
	return &SessionStore{db: db}
}

// Create stores a new session for the given user.
func (s *SessionStore) Create(ctx context.Context, userID int64, duration time.Duration) (Session, error) {
	id, err := randomToken(32)
	if err != nil {
		return Session{}, err
	}
	now := time.Now().UTC()
	session := Session{
		ID:        id,
		UserID:    userID,
		ExpiresAt: now.Add(duration),
		CreatedAt: now,
	}
	_, err = s.db.ExecContext(ctx,
		"INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
		session.ID, session.UserID, session.ExpiresAt, session.CreatedAt)
	if err != nil {
		return Session{}, fmt.Errorf("create session: %w", err)
	}
	return session, nil
}

// Get returns a non-expired session by id.
func (s *SessionStore) Get(ctx context.Context, id string) (Session, error) {
	var session Session
	err := s.db.QueryRowContext(ctx,
		"SELECT id, user_id, expires_at, created_at FROM sessions WHERE id = ?", id).
		Scan(&session.ID, &session.UserID, &session.ExpiresAt, &session.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, ErrSessionNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("get session: %w", err)
	}
	if time.Now().UTC().After(session.ExpiresAt) {
		_ = s.Delete(ctx, id)
		return Session{}, ErrSessionNotFound
	}
	return session, nil
}

// Delete removes a session.
func (s *SessionStore) Delete(ctx context.Context, id string) error {
	if _, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE id = ?", id); err != nil {
		return fmt.Errorf("delete session: %w", err)
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

// DeleteExpired removes all expired sessions.
func (s *SessionStore) DeleteExpired(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE expires_at < ?", time.Now().UTC()); err != nil {
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
