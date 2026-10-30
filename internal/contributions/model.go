// Package contributions manages guest contributions to the wedding programme.
//
// Contributions are surprises for the couple: the couple role deliberately has
// no permission to read or manage them. Every contribution belongs to exactly
// one RSVP response.
package contributions

import "time"

// Contribution statuses.
const (
	StatusNew                = "new"
	StatusNeedsClarification = "needs_clarification"
	StatusPlanning           = "planning"
	StatusConfirmed          = "confirmed"
	StatusRejected           = "rejected"
)

// MaxDurationMinutes is the time limit communicated to guests.
const MaxDurationMinutes = 15

// Contribution is a programme item offered by a guest.
type Contribution struct {
	ID          int64     `json:"id"`
	ResponseID  int64     `json:"responseId"`
	ContactName string    `json:"contactName"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Needs       string    `json:"needs"`
	Phone       string    `json:"phone"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// ContributionNote is an internal remark by a witness.
type ContributionNote struct {
	ID             int64     `json:"id"`
	ContributionID int64     `json:"contributionId"`
	AuthorUserID   int64     `json:"authorUserId"`
	Text           string    `json:"text"`
	CreatedAt      time.Time `json:"createdAt"`
}

// ValidStatuses lists all accepted statuses.
func ValidStatuses() []string {
	return []string{StatusNew, StatusNeedsClarification, StatusPlanning, StatusConfirmed, StatusRejected}
}

// IsValidStatus reports whether status is accepted.
func IsValidStatus(status string) bool {
	for _, candidate := range ValidStatuses() {
		if candidate == status {
			return true
		}
	}
	return false
}
