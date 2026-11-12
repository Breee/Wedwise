package users

import (
	"context"
	"errors"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"

	"github.com/Breee/Wedwise/internal/auth"
)

type seedUser struct {
	Username    string `yaml:"username"`
	Role        string `yaml:"role"`
	Password    string `yaml:"password"`
	Email       string `yaml:"email"`
	DisplayName string `yaml:"displayName"`
}

// Seed creates the users listed in the YAML file at path; a missing file is
// not an error. Existing users are
// kept; their password is updated when it differs from the file. It returns
// the number of users created or updated.
func (s *Store) Seed(ctx context.Context, path string) (int, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("read users file: %w", err)
	}
	var list []seedUser
	if err := yaml.Unmarshal(raw, &list); err != nil {
		return 0, fmt.Errorf("parse users file: %w", err)
	}

	changed := 0
	for _, u := range list {
		existing, err := s.GetByUsername(ctx, u.Username)
		if errors.Is(err, ErrNotFound) {
			if _, err := s.Create(ctx, CreateParams{
				Username: u.Username, Email: u.Email, DisplayName: u.DisplayName,
				Role: u.Role, Password: u.Password,
			}); err != nil {
				return changed, fmt.Errorf("user %q: %w", u.Username, err)
			}
			changed++
			continue
		}
		if err != nil {
			return changed, fmt.Errorf("user %q: %w", u.Username, err)
		}
		if ok, err := auth.VerifyPassword(u.Password, existing.PasswordHash); err == nil && ok {
			continue
		}
		if err := s.SetPassword(ctx, u.Username, u.Password); err != nil {
			return changed, fmt.Errorf("user %q: %w", u.Username, err)
		}
		changed++
	}
	return changed, nil
}
