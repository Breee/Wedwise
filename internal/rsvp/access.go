package rsvp

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/Breee/Wedwise/internal/httpx"
)

// AccessCookieName is the cookie proving that a guest entered the access code.
const AccessCookieName = "wedwise_rsvp_access"

const accessCookieTTL = 90 * 24 * time.Hour

// CodeInvalidAccessCode is the error code for a wrong access code.
const CodeInvalidAccessCode = "invalid_access_code"

// Access gates the public RSVP form behind an optional shared access code.
// An empty code disables the gate. The proof cookie carries an HMAC derived
// from the server secret and the code, so changing either invalidates it.
type Access struct {
	code   string
	secret []byte
	secure bool
}

// NewAccess creates the access gate.
func NewAccess(code, secret string, secure bool) *Access {
	return &Access{code: code, secret: []byte(secret), secure: secure}
}

// Required reports whether guests must enter a code.
func (a *Access) Required() bool { return a.code != "" }

func (a *Access) proof() string {
	mac := hmac.New(sha256.New, a.secret)
	mac.Write([]byte("rsvp-access:" + a.code))
	return hex.EncodeToString(mac.Sum(nil))
}

// Unlocked reports whether the request carries a valid proof cookie.
func (a *Access) Unlocked(r *http.Request) bool {
	if !a.Required() {
		return true
	}
	cookie, err := r.Cookie(AccessCookieName)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(a.proof())) == 1
}

// Unlock validates code and, on success, sets the proof cookie.
func (a *Access) Unlock(w http.ResponseWriter, code string) bool {
	if !a.Required() {
		return true
	}
	if subtle.ConstantTimeCompare([]byte(code), []byte(a.code)) != 1 {
		return false
	}
	http.SetCookie(w, &http.Cookie{
		Name:     AccessCookieName,
		Value:    a.proof(),
		Path:     "/api/rsvp",
		MaxAge:   int(accessCookieTTL.Seconds()),
		HttpOnly: true,
		Secure:   a.secure,
		SameSite: http.SameSiteLaxMode,
	})
	return true
}

// Require rejects requests without a valid proof cookie.
func (a *Access) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !a.Unlocked(r) {
			httpx.WriteError(w, http.StatusUnauthorized, CodeInvalidAccessCode, "Please enter the access code first.")
			return
		}
		next.ServeHTTP(w, r)
	})
}
