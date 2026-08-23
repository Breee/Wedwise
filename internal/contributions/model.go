// Package contributions manages guest contributions to the wedding programme.
//
// Contributions are surprises for the couple: the couple role deliberately has
// no permission to read or manage them.
package contributions

import "time"

// Contribution categories.
const (
	CategorySpeech      = "speech"
	CategoryGame        = "game"
	CategoryMusic       = "music"
	CategoryVideo       = "video"
	CategoryPerformance = "performance"
	CategorySurprise    = "surprise"
	CategoryOther       = "other"
)

// Contribution statuses.
const (
	StatusNew                = "new"
	StatusNeedsClarification = "needs_clarification"
	StatusPlanning           = "planning"
	StatusConfirmed          = "confirmed"
	StatusRejected           = "rejected"
)

// Contribution is a programme item offered by a guest.
type Contribution struct {
	ID                    int64     `json:"id"`
	InvitationID          int64     `json:"invitationId"`
	Title                 string    `json:"title"`
	Category              string    `json:"category"`
	Description           string    `json:"description"`
	Participants          string    `json:"participants"`
	DurationMinutes       int       `json:"durationMinutes"`
	TechnicalRequirements string    `json:"technicalRequirements"`
	Equipment             string    `json:"equipment"`
	PreferredTime         string    `json:"preferredTime"`
	ContactInformation    string    `json:"contactInformation"`
	Status                string    `json:"status"`
	CreatedAt             time.Time `json:"createdAt"`
	UpdatedAt             time.Time `json:"updatedAt"`
}

// ContributionNote is an internal note attached to a contribution.
type ContributionNote struct {
	ID             int64     `json:"id"`
	ContributionID int64     `json:"contributionId"`
	AuthorUserID   int64     `json:"authorUserId"`
	Text           string    `json:"text"`
	CreatedAt      time.Time `json:"createdAt"`
}

// ValidCategories lists all accepted categories.
func ValidCategories() []string {
	return []string{CategorySpeech, CategoryGame, CategoryMusic, CategoryVideo,
		CategoryPerformance, CategorySurprise, CategoryOther}
}

// ValidStatuses lists all accepted statuses.
func ValidStatuses() []string {
	return []string{StatusNew, StatusNeedsClarification, StatusPlanning, StatusConfirmed, StatusRejected}
}

// IsValidCategory reports whether category is accepted.
func IsValidCategory(category string) bool {
	return contains(ValidCategories(), category)
}

// IsValidStatus reports whether status is accepted.
func IsValidStatus(status string) bool {
	return contains(ValidStatuses(), status)
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
