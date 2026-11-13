package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/httpx"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Code     string `json:"code"`
	// Assertion is a WebAuthn response, used instead of Code.
	Assertion json.RawMessage `json:"assertion"`
}

// Error codes of the second login step.
const (
	CodeTwoFactorRequired = "two_factor_required"
	CodeInvalidCode       = "invalid_code"
)

// SecondFactor checks an additional login code for users who enabled it.
type SecondFactor interface {
	Enabled(ctx context.Context, userID int64) (bool, error)
	Verify(ctx context.Context, userID int64, code string) (bool, error)
}

// Challenger is implemented by second factors that need a challenge before
// the login, such as security keys.
type Challenger interface {
	Challenge(ctx context.Context, userID int64) (any, error)
}

// SetSecondFactor enables the second login step.
func (s *Service) SetSecondFactor(f SecondFactor) { s.secondFactor = f }

type identityResponse struct {
	Authenticated bool     `json:"authenticated"`
	ID            int64    `json:"id,omitempty"`
	Username      string   `json:"username,omitempty"`
	Email         string   `json:"email,omitempty"`
	DisplayName   string   `json:"displayName,omitempty"`
	Role          string   `json:"role,omitempty"`
	Permissions   []string `json:"permissions"`
}

// Routes returns the authentication routes. loginMiddlewares are applied to
// the login endpoint only (e.g. rate limiting).
func (s *Service) Routes(loginMiddlewares ...func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Get("/me", s.HandleMe)
	r.With(loginMiddlewares...).Post("/login", s.HandleLogin)
	r.With(loginMiddlewares...).Post("/webauthn/begin", s.HandleWebAuthnBegin)
	r.Post("/logout", s.HandleLogout)
	return r
}

// HandleWebAuthnBegin checks the password and returns a challenge for the
// user's security keys.
func (s *Service) HandleWebAuthnBegin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	identity, err := s.authenticateCredentials(r.Context(), strings.TrimSpace(req.Username), req.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			httpx.WriteError(w, http.StatusUnauthorized, httpx.CodeUnauthorized, "Invalid username or password.")
			return
		}
		httpx.Internal(w, err)
		return
	}
	challenger, ok := s.secondFactor.(Challenger)
	if !ok {
		httpx.NotFound(w, "No security key registered.")
		return
	}
	options, err := challenger.Challenge(r.Context(), identity.ID)
	if err != nil {
		httpx.NotFound(w, "No security key registered.")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, options)
}

// HandleLogin authenticates a user and starts a session.
func (s *Service) HandleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		httpx.BadRequest(w, "Username and password are required.")
		return
	}

	identity, err := s.authenticateCredentials(r.Context(), req.Username, req.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			httpx.WriteError(w, http.StatusUnauthorized, httpx.CodeUnauthorized, "Invalid username or password.")
			return
		}
		httpx.Internal(w, err)
		return
	}

	if s.secondFactor != nil {
		enabled, err := s.secondFactor.Enabled(r.Context(), identity.ID)
		if err != nil {
			httpx.Internal(w, err)
			return
		}
		if enabled {
			code := strings.TrimSpace(req.Code)
			if len(req.Assertion) > 0 {
				code = string(req.Assertion)
			}
			if code == "" {
				httpx.WriteError(w, http.StatusUnauthorized, CodeTwoFactorRequired, "A login code is required.")
				return
			}
			ok, err := s.secondFactor.Verify(r.Context(), identity.ID, code)
			if err != nil {
				httpx.Internal(w, err)
				return
			}
			if !ok {
				httpx.WriteError(w, http.StatusUnauthorized, CodeInvalidCode, "The login code is not correct.")
				return
			}
		}
	}

	session, err := s.sessions.Create(r.Context(), identity.ID, SessionDuration)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	s.setSessionCookie(w, session)
	httpx.WriteJSON(w, http.StatusOK, newIdentityResponse(identity))
}

// HandleLogout ends the current session.
func (s *Service) HandleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(SessionCookieName); err == nil && cookie.Value != "" {
		if err := s.sessions.Delete(r.Context(), cookie.Value); err != nil {
			httpx.Internal(w, err)
			return
		}
	}
	s.clearSessionCookie(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleMe returns information about the current session.
func (s *Service) HandleMe(w http.ResponseWriter, r *http.Request) {
	identity, ok := IdentityFrom(r.Context())
	if !ok {
		httpx.WriteJSON(w, http.StatusOK, identityResponse{Authenticated: false, Permissions: []string{}})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newIdentityResponse(identity))
}

func newIdentityResponse(identity Identity) identityResponse {
	return identityResponse{
		Authenticated: true,
		ID:            identity.ID,
		Username:      identity.Username,
		Email:         identity.Email,
		DisplayName:   identity.DisplayName,
		Role:          identity.Role,
		Permissions:   PermissionsForRole(identity.Role),
	}
}
