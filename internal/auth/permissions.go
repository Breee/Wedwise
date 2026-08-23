package auth

import "sort"

// Permission constants used throughout the application.
const (
	PermContentRead  = "content.read"
	PermContentWrite = "content.write"

	PermGuestRead  = "guest.read"
	PermGuestWrite = "guest.write"

	PermInvitationRead  = "invitation.read"
	PermInvitationWrite = "invitation.write"

	PermRSVPRead   = "rsvp.read"
	PermRSVPWrite  = "rsvp.write"
	PermRSVPManage = "rsvp.manage"

	PermContributionSubmit = "contribution.submit"
	PermContributionRead   = "contribution.read"
	PermContributionManage = "contribution.manage"

	PermUserRead   = "user.read"
	PermUserManage = "user.manage"
)

// Roles known to the application.
const (
	RoleCouple  = "couple"
	RoleWitness = "witness"
	RoleAdmin   = "admin"
)

// rolePermissions maps a role to the permissions it grants.
//
// The couple intentionally has no access to contributions: surprises planned by
// guests must stay hidden from them. Admins are also excluded on purpose.
var rolePermissions = map[string]map[string]bool{
	RoleCouple: {
		PermContentRead:     true,
		PermContentWrite:    true,
		PermGuestRead:       true,
		PermGuestWrite:      true,
		PermInvitationRead:  true,
		PermInvitationWrite: true,
		PermRSVPRead:        true,
		PermRSVPManage:      true,
	},
	RoleWitness: {
		PermContributionRead:   true,
		PermContributionManage: true,
		PermRSVPRead:           true,
		PermGuestRead:          true,
		PermInvitationRead:     true,
	},
	RoleAdmin: {
		PermUserRead:        true,
		PermUserManage:      true,
		PermContentRead:     true,
		PermContentWrite:    true,
		PermGuestRead:       true,
		PermGuestWrite:      true,
		PermInvitationRead:  true,
		PermInvitationWrite: true,
		PermRSVPRead:        true,
		PermRSVPManage:      true,
	},
}

// KnownRoles returns the list of valid roles.
func KnownRoles() []string {
	return []string{RoleCouple, RoleWitness, RoleAdmin}
}

// IsValidRole reports whether role is a known role.
func IsValidRole(role string) bool {
	_, ok := rolePermissions[role]
	return ok
}

// RoleHasPermission reports whether the role grants the given permission.
func RoleHasPermission(role, permission string) bool {
	perms, ok := rolePermissions[role]
	if !ok {
		return false
	}
	return perms[permission]
}

// PermissionsForRole returns the permissions granted to a role, sorted alphabetically.
func PermissionsForRole(role string) []string {
	perms := rolePermissions[role]
	result := make([]string, 0, len(perms))
	for permission, granted := range perms {
		if granted {
			result = append(result, permission)
		}
	}
	sort.Strings(result)
	return result
}
