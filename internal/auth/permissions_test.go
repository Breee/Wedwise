package auth

import "testing"

func TestCoupleHasNoContributionAccess(t *testing.T) {
	blocked := []string{PermContributionRead, PermContributionManage, PermContributionSubmit}
	for _, permission := range blocked {
		if RoleHasPermission(RoleCouple, permission) {
			t.Fatalf("couple must not have %s", permission)
		}
		if RoleHasPermission(RoleAdmin, permission) {
			t.Fatalf("admin must not have %s", permission)
		}
	}
}

func TestRolePermissions(t *testing.T) {
	cases := []struct {
		role       string
		permission string
		want       bool
	}{
		{RoleCouple, PermGuestWrite, true},
		{RoleCouple, PermRSVPManage, true},
		{RoleCouple, PermUserManage, false},
		{RoleWitness, PermContributionManage, true},
		{RoleWitness, PermGuestWrite, false},
		{RoleAdmin, PermUserManage, true},
		{"unknown", PermContentRead, false},
	}
	for _, tc := range cases {
		if got := RoleHasPermission(tc.role, tc.permission); got != tc.want {
			t.Errorf("RoleHasPermission(%q, %q) = %t, want %t", tc.role, tc.permission, got, tc.want)
		}
	}
}

func TestPasswordHashRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	ok, err := VerifyPassword("correct horse battery staple", hash)
	if err != nil || !ok {
		t.Fatalf("expected password to verify, got ok=%t err=%v", ok, err)
	}
	ok, err = VerifyPassword("wrong password", hash)
	if err != nil {
		t.Fatalf("verify password: %v", err)
	}
	if ok {
		t.Fatal("expected wrong password to fail verification")
	}
}
