// Package users implements user accounts and their management.
package users

import (
	"strings"
	"time"

	"github.com/Breee/Wedwise/internal/auth"
)

// User is an application account.
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	DisplayName  string    `json:"displayName"`
	Role         string    `json:"role"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// Identity converts the user into an auth identity.
func (u User) Identity() auth.Identity {
	return auth.Identity{
		ID:           u.ID,
		Username:     u.Username,
		Email:        u.Email,
		DisplayName:  u.DisplayName,
		Role:         u.Role,
		Active:       u.Active,
		PasswordHash: u.PasswordHash,
	}
}

// NormalizeUsername trims and lowercases a username.
func NormalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}
