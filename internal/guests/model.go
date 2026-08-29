// Package guests manages individual guests belonging to an invitation.
package guests

import "time"

// Guest is a single person invited to the wedding.
type Guest struct {
	ID           int64     `json:"id"`
	DisplayName  string    `json:"displayName"`
	Email        string    `json:"email"`
	InvitationID int64     `json:"invitationId"`
	Notes        string    `json:"notes"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}
