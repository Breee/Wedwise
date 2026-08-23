package users

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Breee/Wedwise/internal/auth"
)

// ErrNotFound is returned when no matching user exists.
var ErrNotFound = errors.New("user not found")

// ErrUsernameTaken is returned when a username is already in use.
var ErrUsernameTaken = errors.New("username already taken")

// Store persists users in SQLite.
type Store struct {
	db *sql.DB
}

// NewStore creates a user store backed by db.
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// CreateParams describes a new user.
type CreateParams struct {
	Username    string
	Email       string
	DisplayName string
	Role        string
	Password    string
}

// Create validates and inserts a new user.
func (s *Store) Create(ctx context.Context, params CreateParams) (User, error) {
	username := NormalizeUsername(params.Username)
	if username == "" {
		return User{}, errors.New("username must not be empty")
	}
	if !auth.IsValidRole(params.Role) {
		return User{}, fmt.Errorf("invalid role %q, must be one of %s", params.Role, strings.Join(auth.KnownRoles(), ", "))
	}
	if err := auth.ValidatePassword(params.Password); err != nil {
		return User{}, err
	}

	hash, err := auth.HashPassword(params.Password)
	if err != nil {
		return User{}, err
	}

	displayName := strings.TrimSpace(params.DisplayName)
	if displayName == "" {
		displayName = username
	}

	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO users (username, email, password_hash, display_name, role, active, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
		username, strings.TrimSpace(params.Email), hash, displayName, params.Role, now, now)
	if err != nil {
		if isUniqueViolation(err) {
			return User{}, ErrUsernameTaken
		}
		return User{}, fmt.Errorf("insert user: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return User{}, fmt.Errorf("user id: %w", err)
	}
	return s.GetByID(ctx, id)
}

// GetByID returns a user by id.
func (s *Store) GetByID(ctx context.Context, id int64) (User, error) {
	return s.queryOne(ctx, "SELECT "+userColumns+" FROM users WHERE id = ?", id)
}

// GetByUsername returns a user by username.
func (s *Store) GetByUsername(ctx context.Context, username string) (User, error) {
	return s.queryOne(ctx, "SELECT "+userColumns+" FROM users WHERE username = ?", NormalizeUsername(username))
}

// List returns all users ordered by username.
func (s *Store) List(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT "+userColumns+" FROM users ORDER BY username")
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate users: %w", err)
	}
	return users, nil
}

// SetActive enables or disables a user account.
func (s *Store) SetActive(ctx context.Context, username string, active bool) error {
	res, err := s.db.ExecContext(ctx,
		"UPDATE users SET active = ?, updated_at = ? WHERE username = ?",
		active, time.Now().UTC(), NormalizeUsername(username))
	if err != nil {
		return fmt.Errorf("update user: %w", err)
	}
	return checkAffected(res)
}

// SetPassword replaces the password of a user.
func (s *Store) SetPassword(ctx context.Context, username, password string) error {
	if err := auth.ValidatePassword(password); err != nil {
		return err
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx,
		"UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?",
		hash, time.Now().UTC(), NormalizeUsername(username))
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return checkAffected(res)
}

// IdentityByID implements auth.UserLookup.
func (s *Store) IdentityByID(ctx context.Context, id int64) (auth.Identity, error) {
	user, err := s.GetByID(ctx, id)
	if errors.Is(err, ErrNotFound) {
		return auth.Identity{}, auth.ErrUserNotFound
	}
	if err != nil {
		return auth.Identity{}, err
	}
	return user.Identity(), nil
}

// IdentityByUsername implements auth.UserLookup.
func (s *Store) IdentityByUsername(ctx context.Context, username string) (auth.Identity, error) {
	user, err := s.GetByUsername(ctx, username)
	if errors.Is(err, ErrNotFound) {
		return auth.Identity{}, auth.ErrUserNotFound
	}
	if err != nil {
		return auth.Identity{}, err
	}
	return user.Identity(), nil
}

const userColumns = "id, username, email, password_hash, display_name, role, active, created_at, updated_at"

type scanner interface {
	Scan(dest ...any) error
}

func scanUser(row scanner) (User, error) {
	var user User
	if err := row.Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName,
		&user.Role, &user.Active, &user.CreatedAt, &user.UpdatedAt); err != nil {
		return User{}, fmt.Errorf("scan user: %w", err)
	}
	return user, nil
}

func (s *Store) queryOne(ctx context.Context, query string, args ...any) (User, error) {
	user, err := scanUser(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil && strings.Contains(err.Error(), sql.ErrNoRows.Error()) {
		return User{}, ErrNotFound
	}
	return user, err
}

func checkAffected(res sql.Result) error {
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "unique constraint")
}
