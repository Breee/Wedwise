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

const identityContextKey contextKey = "wedwise.identity"

// Service ties sessions, users and HTTP concerns together.
type Service struct {
	sessions *SessionStore
	users    UserLookup
	secure   bool
	baseURL  string
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

// WithIdentity returns a context carrying the given identity.
func WithIdentity(ctx context.Context, identity Identity) context.Context {
	return context.WithValue(ctx, identityContextKey, identity)
}

// Authenticate resolves the session cookie and, when valid, attaches the
// identity to the request context. It never rejects a request on its own.
func (s *Service) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		identity, err := s.identityFromRequest(r)
		if err == nil {
			r = r.WithContext(WithIdentity(r.Context(), identity))
		}
		next.ServeHTTP(w, r)
	})
}

// RequireAuth rejects requests without a valid session.
func (s *Service) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := IdentityFrom(r.Context()); !ok {
			httpx.Unauthorized(w)
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
// with SameSite=Lax cookies this protects against cross-site request forgery.
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

func (s *Service) identityFromRequest(r *http.Request) (Identity, error) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil || cookie.Value == "" {
		return Identity{}, ErrSessionNotFound
	}
	session, err := s.sessions.Get(r.Context(), cookie.Value)
	if err != nil {
		return Identity{}, err
	}
	identity, err := s.users.IdentityByID(r.Context(), session.UserID)
	if err != nil {
		return Identity{}, err
	}
	if !identity.Active {
		return Identity{}, ErrInvalidCredentials
	}
	return identity, nil
}

func (s *Service) setSessionCookie(w http.ResponseWriter, session Session) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    session.ID,
		Path:     "/",
		Expires:  session.ExpiresAt,
		MaxAge:   int(time.Until(session.ExpiresAt).Seconds()),
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Service) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
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
