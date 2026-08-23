package auth

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/httpx"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type identityResponse struct {
	Authenticated bool     `json:"authenticated"`
	ID            int64    `json:"id,omitempty"`
	Username      string   `json:"username,omitempty"`
	Email         string   `json:"email,omitempty"`
	DisplayName   string   `json:"displayName,omitempty"`
	Role          string   `json:"role,omitempty"`
	Permissions   []string `json:"permissions"`
}

// Routes returns the authentication routes.
func (s *Service) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/me", s.HandleMe)
	r.Post("/login", s.HandleLogin)
	r.Post("/logout", s.HandleLogout)
	return r
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
