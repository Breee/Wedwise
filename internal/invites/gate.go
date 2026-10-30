package invites

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"
)

// cookieName is the cookie proving that a guest entered the PIN of a link.
const cookieName = "wedwise_rsvp_access"

const cookieTTL = 90 * 24 * time.Hour

// Gate issues and checks PIN proof cookies. The proof is an HMAC over the
// link id and its PIN hash, so changing the PIN invalidates existing proofs.
type Gate struct {
	secret []byte
	secure bool
}

// NewGate creates a gate signing proofs with secret.
func NewGate(secret string, secure bool) *Gate {
	return &Gate{secret: []byte(secret), secure: secure}
}

func (g *Gate) proof(link Link) string {
	mac := hmac.New(sha256.New, g.secret)
	fmt.Fprintf(mac, "invite:%d:%s", link.ID, link.PINHash())
	return hex.EncodeToString(mac.Sum(nil))
}

// Unlocked reports whether r may use link.
func (g *Gate) Unlocked(r *http.Request, link Link) bool {
	if !link.HasPIN {
		return true
	}
	cookie, err := r.Cookie(fmt.Sprintf("%s_%d", cookieName, link.ID))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(g.proof(link))) == 1
}

// Unlock checks pin and, on success, sets the proof cookie.
func (g *Gate) Unlock(w http.ResponseWriter, link Link, pin string) bool {
	if !link.VerifyPIN(pin) {
		return false
	}
	if link.HasPIN {
		http.SetCookie(w, &http.Cookie{
			Name:     fmt.Sprintf("%s_%d", cookieName, link.ID),
			Value:    g.proof(link),
			Path:     "/api/rsvp",
			MaxAge:   int(cookieTTL.Seconds()),
			HttpOnly: true,
			Secure:   g.secure,
			SameSite: http.SameSiteLaxMode,
		})
	}
	return true
}
