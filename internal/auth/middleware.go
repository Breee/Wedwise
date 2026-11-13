package auth

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Breee/Wedwise/internal/httpx"
)

type contextKey string

const (
	identityContextKey contextKey = "wedwise.identity"
	sessionContextKey  contextKey = "wedwise.session"
)

// CodeTwoFactorSetupRequired is returned while a user whose role must use a
// second factor has not set one up yet.
const CodeTwoFactorSetupRequired = "two_factor_setup_required"

// accountPrefix is the only API area open to such users.
const accountPrefix = "/api/account/"

// Service ties sessions, users and HTTP concerns together.
type Service struct {
	sessions *SessionStore
	users    UserLookup
	secure   bool
	baseURL  string

	secondFactor     SecondFactor
	requireTwoFactor map[string]bool
	lockouts         *Lockouts
}

// SetLockouts enables the per-account lockout after repeated wrong logins.
func (s *Service) SetLockouts(l *Lockouts) { s.lockouts = l }

// RequireTwoFactor makes a second factor mandatory for the given roles.
func (s *Service) RequireTwoFactor(roles []string) {
	s.requireTwoFactor = map[string]bool{}
	for _, role := range roles {
		s.requireTwoFactor[role] = true
	}
}

// NewService creates an authentication service. When secure is true, session
// cookies are only sent over HTTPS.
func NewService(sessions *SessionStore, users UserLookup, secure bool, baseURL string) *Service {
	return &Service{sessions: sessions, users: users, secure: secure, baseURL: baseURL}
}

// Sessions returns the underlying session store.
func (s *Service) Sessions() *SessionStore { return s.sessions }

// IdentityFrom returns the authenticated identity stored in the context.
func IdentityFrom(ctx context.Context) (Identity, bool) {
	identity, ok := ctx.Value(identityContextKey).(Identity)
	return identity, ok
}

// SessionFrom returns the session of the request.
func SessionFrom(ctx context.Context) (Session, bool) {
	session, ok := ctx.Value(sessionContextKey).(Session)
	return session, ok
}

// WithIdentity returns a context carrying the given identity.
func WithIdentity(ctx context.Context, identity Identity) context.Context {
	return context.WithValue(ctx, identityContextKey, identity)
}

// Authenticate resolves the session cookie and, when valid, attaches the
// identity to the request context. It never rejects a request on its own.
func (s *Service) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		identity, session, err := s.identityFromRequest(r)
		if err == nil {
			ctx := context.WithValue(r.Context(), sessionContextKey, session)
			r = r.WithContext(WithIdentity(ctx, identity))
		}
		next.ServeHTTP(w, r)
	})
}

// RequireAuth rejects requests without a valid session. Users who still have
// to set up a mandatory second factor only reach their account settings.
func (s *Service) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		identity, ok := IdentityFrom(r.Context())
		if !ok {
			httpx.Unauthorized(w)
			return
		}
		if identity.TwoFactorSetupRequired && !strings.HasPrefix(r.URL.Path, accountPrefix) {
			httpx.WriteError(w, http.StatusForbidden, CodeTwoFactorSetupRequired,
				"Set up two-factor login to continue.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequirePermission rejects requests whose identity lacks the given permission.
func (s *Service) RequirePermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			identity, ok := IdentityFrom(r.Context())
			if !ok {
				httpx.Unauthorized(w)
				return
			}
			if !identity.HasPermission(permission) {
				httpx.Forbidden(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// CSRF verifies the Origin/Referer header of state changing requests. Combined
// with SameSite cookies this protects against cross-site request forgery.
func (s *Service) CSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace:
			next.ServeHTTP(w, r)
			return
		}

		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = r.Header.Get("Referer")
		}
		if origin == "" {
			// Same-origin non-browser clients (CLI, tests) do not send these headers.
			next.ServeHTTP(w, r)
			return
		}
		if !s.originAllowed(origin, r) {
			httpx.WriteError(w, http.StatusForbidden, httpx.CodeForbidden, "Cross-site request blocked.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Service) originAllowed(origin string, r *http.Request) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return false
	}
	if strings.EqualFold(parsed.Host, r.Host) {
		return true
	}
	if s.baseURL != "" {
		if base, err := url.Parse(s.baseURL); err == nil && base.Host != "" {
			return strings.EqualFold(parsed.Host, base.Host)
		}
	}
	return false
}

func (s *Service) identityFromRequest(r *http.Request) (Identity, Session, error) {
	cookie, err := r.Cookie(s.cookieName())
	if err != nil || cookie.Value == "" {
		return Identity{}, Session{}, ErrSessionNotFound
	}
	session, err := s.sessions.Get(r.Context(), cookie.Value)
	if err != nil {
		return Identity{}, Session{}, err
	}
	identity, err := s.users.IdentityByID(r.Context(), session.UserID)
	if err != nil {
		return Identity{}, Session{}, err
	}
	if !identity.Active {
		return Identity{}, Session{}, ErrInvalidCredentials
	}
	if identity.TwoFactorSetupRequired, err = s.twoFactorMissing(r.Context(), identity); err != nil {
		return Identity{}, Session{}, err
	}
	return identity, session, nil
}

func (s *Service) twoFactorMissing(ctx context.Context, identity Identity) (bool, error) {
	if !s.requireTwoFactor[identity.Role] || s.secondFactor == nil {
		return false, nil
	}
	enabled, err := s.secondFactor.Enabled(ctx, identity.ID)
	return !enabled, err
}

// StartSession signs the user in on this device.
func (s *Service) StartSession(w http.ResponseWriter, r *http.Request, userID int64) error {
	session, err := s.sessions.Create(r.Context(), userID, r.UserAgent())
	if err != nil {
		return err
	}
	http.SetCookie(w, s.cookie(session.ID, session.ExpiresAt))
	return nil
}

// RenewSession ends every session of the signed-in user and starts a fresh
// one for this device. It is called whenever the user's login changes
// (password, second factor), so a stolen session does not survive it.
func (s *Service) RenewSession(w http.ResponseWriter, r *http.Request) error {
	identity, ok := IdentityFrom(r.Context())
	if !ok {
		return ErrSessionNotFound
	}
	if err := s.sessions.DeleteByUser(r.Context(), identity.ID); err != nil {
		return err
	}
	return s.StartSession(w, r, identity.ID)
}

// EndSessions signs a user out everywhere.
func (s *Service) EndSessions(ctx context.Context, userID int64) error {
	return s.sessions.DeleteByUser(ctx, userID)
}

func (s *Service) cookieName() string {
	if s.secure {
		return SecureSessionCookieName
	}
	return SessionCookieName
}

func (s *Service) cookie(value string, expires time.Time) *http.Cookie {
	cookie := &http.Cookie{
		Name:     s.cookieName(),
		Value:    value,
		Path:     "/",
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	}
	if s.secure {
		cookie.SameSite = http.SameSiteStrictMode
	}
	if value == "" {
		cookie.MaxAge = -1
	}
	return cookie
}

func (s *Service) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, s.cookie("", time.Unix(0, 0)))
}

// Authenticate verifies credentials and returns the matching identity.
func (s *Service) authenticateCredentials(ctx context.Context, username, password string) (Identity, error) {
	identity, err := s.users.IdentityByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			// Spend comparable time to reduce user enumeration via timing.
			_, _ = HashPassword(password)
			return Identity{}, ErrInvalidCredentials
		}
		return Identity{}, err
	}
	if !identity.Active {
		return Identity{}, ErrInvalidCredentials
	}
	ok, err := VerifyPassword(password, identity.PasswordHash)
	if err != nil || !ok {
		return Identity{}, ErrInvalidCredentials
	}
	return identity, nil
}
