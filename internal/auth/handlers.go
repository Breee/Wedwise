package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
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

// Passwordless is implemented by second factors that can sign a user in on
// their own, such as passkeys unlocked by PIN or biometrics.
type Passwordless interface {
	BeginPasskey(ctx context.Context) (options any, id string, err error)
	FinishPasskey(ctx context.Context, id string, response []byte) (userID int64, ok bool, err error)
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
	// TwoFactorSetupRequired tells the client to send the user to the
	// account page before anything else.
	TwoFactorSetupRequired bool `json:"twoFactorSetupRequired,omitempty"`
}

// Routes returns the authentication routes. loginMiddlewares are applied to
// the login endpoint only (e.g. rate limiting).
func (s *Service) Routes(loginMiddlewares ...func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Get("/me", s.HandleMe)
	r.With(loginMiddlewares...).Post("/login", s.HandleLogin)
	r.With(loginMiddlewares...).Post("/webauthn/begin", s.HandleWebAuthnBegin)
	r.With(loginMiddlewares...).Post("/passkey/begin", s.HandlePasskeyBegin)
	r.With(loginMiddlewares...).Post("/passkey", s.HandlePasskeyLogin)
	r.Post("/logout", s.HandleLogout)
	r.Group(func(r chi.Router) {
		r.Use(s.requireSession)
		r.Get("/sessions", s.HandleSessions)
		r.Delete("/sessions", s.HandleEndOtherSessions)
		r.Delete("/sessions/{id}", s.HandleEndSession)
	})
	return r
}

// HandleWebAuthnBegin checks the password and returns a challenge for the
// user's security keys.
func (s *Service) HandleWebAuthnBegin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if s.locked(w, r, req.Username) {
		return
	}
	identity, err := s.authenticateCredentials(r.Context(), req.Username, req.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			s.loginFailed(w, r, req.Username, httpx.CodeUnauthorized, "Invalid username or password.")
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

// HandlePasskeyBegin returns a challenge for a login with a passkey only.
func (s *Service) HandlePasskeyBegin(w http.ResponseWriter, r *http.Request) {
	passwordless, ok := s.secondFactor.(Passwordless)
	if !ok {
		httpx.NotFound(w, "Passkey login is not available.")
		return
	}
	options, id, err := passwordless.BeginPasskey(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"id": id, "options": options})
}

// HandlePasskeyLogin starts a session for the owner of a verified passkey.
func (s *Service) HandlePasskeyLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID        string          `json:"id"`
		Assertion json.RawMessage `json:"assertion"`
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	passwordless, ok := s.secondFactor.(Passwordless)
	if !ok {
		httpx.NotFound(w, "Passkey login is not available.")
		return
	}
	denied := func() {
		httpx.WriteError(w, http.StatusUnauthorized, httpx.CodeUnauthorized, "This passkey could not be verified.")
	}
	userID, ok, err := passwordless.FinishPasskey(r.Context(), req.ID, req.Assertion)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	if !ok {
		denied()
		return
	}
	identity, err := s.users.IdentityByID(r.Context(), userID)
	if err != nil || !identity.Active {
		denied()
		return
	}
	s.signIn(w, r, identity)
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
	if s.locked(w, r, req.Username) {
		return
	}

	identity, err := s.authenticateCredentials(r.Context(), req.Username, req.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			s.loginFailed(w, r, req.Username, httpx.CodeUnauthorized, "Invalid username or password.")
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
				s.loginFailed(w, r, req.Username, CodeInvalidCode, "The login code is not correct.")
				return
			}
		}
	}

	s.signIn(w, r, identity)
}

// HandleLogout ends the current session.
func (s *Service) HandleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(s.cookieName()); err == nil && cookie.Value != "" {
		if err := s.sessions.Delete(r.Context(), cookie.Value); err != nil {
			httpx.Internal(w, err)
			return
		}
	}
	if identity, ok := IdentityFrom(r.Context()); ok {
		s.record(r.Context(), identity.ID, identity.Username, "logout")
	}
	s.clearSessionCookie(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// locked answers the request with 429 when the account is locked after too
// many wrong logins.
func (s *Service) locked(w http.ResponseWriter, r *http.Request, username string) bool {
	if s.lockouts == nil {
		return false
	}
	wait, err := s.lockouts.Locked(r.Context(), username)
	if err != nil {
		httpx.Internal(w, err)
		return true
	}
	if wait <= 0 {
		return false
	}
	w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
	httpx.WriteError(w, http.StatusTooManyRequests, httpx.CodeTooManyRequests, "Too many failed logins. Please try again later.")
	return true
}

// loginFailed counts a wrong login for the account and answers with 401.
func (s *Service) loginFailed(w http.ResponseWriter, r *http.Request, username, code, message string) {
	if s.lockouts != nil {
		lock, err := s.lockouts.Fail(r.Context(), username)
		if err != nil {
			httpx.Internal(w, err)
			return
		}
		if lock > 0 {
			slog.Warn("account locked after failed logins", "seconds", int(lock.Seconds()))
		}
	}
	s.record(r.Context(), 0, username, "login.failed")
	httpx.WriteError(w, http.StatusUnauthorized, code, message)
}

func (s *Service) signIn(w http.ResponseWriter, r *http.Request, identity Identity) {
	if s.lockouts != nil {
		if err := s.lockouts.Reset(r.Context(), identity.Username); err != nil {
			httpx.Internal(w, err)
			return
		}
	}
	missing, err := s.twoFactorMissing(r.Context(), identity)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	identity.TwoFactorSetupRequired = missing
	if err := s.StartSession(w, r, identity.ID); err != nil {
		httpx.Internal(w, err)
		return
	}
	s.record(r.Context(), identity.ID, identity.Username, "login")
	httpx.WriteJSON(w, http.StatusOK, newIdentityResponse(identity))
}

func (s *Service) requireSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := SessionFrom(r.Context()); !ok {
			httpx.Unauthorized(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type sessionResponse struct {
	Session
	Current bool `json:"current"`
}

// HandleSessions lists where the user is signed in.
func (s *Service) HandleSessions(w http.ResponseWriter, r *http.Request) {
	current, _ := SessionFrom(r.Context())
	sessions, err := s.sessions.List(r.Context(), current.UserID)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	out := make([]sessionResponse, 0, len(sessions))
	for _, session := range sessions {
		out = append(out, sessionResponse{Session: session, Current: session.Key == current.Key})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"sessions": out})
}

// HandleEndSession signs one of the user's devices out.
func (s *Service) HandleEndSession(w http.ResponseWriter, r *http.Request) {
	current, _ := SessionFrom(r.Context())
	key := chi.URLParam(r, "id")
	if err := s.sessions.DeleteKey(r.Context(), current.UserID, key); err != nil {
		httpx.Internal(w, err)
		return
	}
	if key == current.Key {
		s.clearSessionCookie(w)
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleEndOtherSessions signs the user out everywhere but here.
func (s *Service) HandleEndOtherSessions(w http.ResponseWriter, r *http.Request) {
	current, _ := SessionFrom(r.Context())
	if err := s.sessions.DeleteOthers(r.Context(), current.UserID, current.Key); err != nil {
		httpx.Internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

		TwoFactorSetupRequired: identity.TwoFactorSetupRequired,
	}
}
