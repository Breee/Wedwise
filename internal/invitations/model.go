// Package invitations manages invitation records and their access tokens.
package invitations

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"
)

// Invitation is a household or group invited to the wedding.
type Invitation struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Token     string    `json:"token"`
	MaxGuests int       `json:"maxGuests"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// TokenBytes is the entropy of an invitation token.
const TokenBytes = 32

// GenerateToken creates a cryptographically random, URL safe invitation token.
func GenerateToken() (string, error) {
	buf := make([]byte, TokenBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate invitation token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
