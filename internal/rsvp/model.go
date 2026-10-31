// Package rsvp handles guest responses submitted through the single public
// RSVP form, including attendees and an optional programme contribution.
package rsvp

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"
)

// Response statuses.
const (
	StatusYes = "yes"
	StatusNo  = "no"
)

// Dietary preferences.
const (
	DietNone       = "none"
	DietVegetarian = "vegetarian"
	DietVegan      = "vegan"
	DietOther      = "other"
)

// MaxAttendees caps the attendees of a single response.
const MaxAttendees = 10

// Response is one submission of the RSVP form.
type Response struct {
	ID          int64     `json:"id"`
	ContactName string    `json:"contactName"`
	Email       string    `json:"email"`
	Phone       string    `json:"phone"`
	Status      string    `json:"status"`
	Message     string    `json:"message"`
	MusicGenres string    `json:"musicGenres"`
	MusicSong   string    `json:"musicSong"`
	SubmittedAt time.Time `json:"submittedAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// Attendee is a person covered by a response.
type Attendee struct {
	ID         int64  `json:"id"`
	ResponseID int64  `json:"responseId"`
	Name       string `json:"name"`
	IsChild    bool   `json:"isChild"`
	Diet       string `json:"diet"`
	Allergies  string `json:"allergies"`
}

// ValidStatuses lists all accepted statuses.
func ValidStatuses() []string { return []string{StatusYes, StatusNo} }

// ValidDiets lists all accepted dietary preferences.
func ValidDiets() []string { return []string{DietNone, DietVegetarian, DietVegan, DietOther} }

// IsValidStatus reports whether status is accepted.
func IsValidStatus(status string) bool { return contains(ValidStatuses(), status) }

// IsValidDiet reports whether diet is accepted.
func IsValidDiet(diet string) bool { return contains(ValidDiets(), diet) }

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

// AllergyEntry names an attendee with an allergy or intolerance.
type AllergyEntry struct {
	Name      string `json:"name"`
	Allergies string `json:"allergies"`
}

// Summary aggregates response statistics. It intentionally contains no
// information about contributions.
type Summary struct {
	Responses          int            `json:"responses"`
	StatusCounts       map[string]int `json:"statusCounts"`
	AttendeesAttending int            `json:"attendeesAttending"`
	Children           int            `json:"children"`
	DietCounts         map[string]int `json:"dietCounts"`
	Allergies          []AllergyEntry `json:"allergies"`
}

const tokenBytes = 24

// GenerateToken returns a random URL safe edit token.
func GenerateToken() (string, error) {
	buf := make([]byte, tokenBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate edit token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
