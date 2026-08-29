// Package rsvp handles RSVP submissions and attendee details.
package rsvp

import "time"

// RSVP statuses.
const (
	StatusYes     = "yes"
	StatusNo      = "no"
	StatusMaybe   = "maybe"
	StatusPending = "pending"
)

// Dietary preferences.
const (
	DietNone       = "none"
	DietVegetarian = "vegetarian"
	DietVegan      = "vegan"
	DietOther      = "other"
)

// RSVP is the response of an invitation.
type RSVP struct {
	ID           int64     `json:"id"`
	InvitationID int64     `json:"invitationId"`
	Status       string    `json:"status"`
	Message      string    `json:"message"`
	SubmittedAt  time.Time `json:"submittedAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// Attendee is a person covered by an invitation's RSVP.
type Attendee struct {
	ID           int64  `json:"id"`
	InvitationID int64  `json:"invitationId"`
	Name         string `json:"name"`
	Attending    bool   `json:"attending"`
	IsChild      bool   `json:"isChild"`
	Diet         string `json:"diet"`
	Allergies    string `json:"allergies"`
	Notes        string `json:"notes"`
}

// ValidStatuses lists all accepted RSVP statuses.
func ValidStatuses() []string {
	return []string{StatusYes, StatusNo, StatusMaybe, StatusPending}
}

// ValidDiets lists all accepted dietary preferences.
func ValidDiets() []string {
	return []string{DietNone, DietVegetarian, DietVegan, DietOther}
}

// IsValidStatus reports whether status is accepted.
func IsValidStatus(status string) bool {
	return contains(ValidStatuses(), status)
}

// IsValidDiet reports whether diet is accepted.
func IsValidDiet(diet string) bool {
	return contains(ValidDiets(), diet)
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

// Summary aggregates RSVP statistics. It intentionally contains no information
// about contributions.
type Summary struct {
	Invitations         int            `json:"invitations"`
	ActiveInvitations   int            `json:"activeInvitations"`
	RespondedInvitation int            `json:"respondedInvitations"`
	StatusCounts        map[string]int `json:"statusCounts"`
	AttendeesTotal      int            `json:"attendeesTotal"`
	AttendeesAttending  int            `json:"attendeesAttending"`
	Children            int            `json:"children"`
	DietCounts          map[string]int `json:"dietCounts"`
	Allergies           []string       `json:"allergies"`
}
