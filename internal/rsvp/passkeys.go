package rsvp

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

const (
	passkeyChallengeTTL = 5 * time.Minute
	maxPasskeys         = 5
	// guestHandle marks user handles of guests, so they can never be
	// mistaken for staff accounts that share the same site.
	guestHandle = "g:"
)

// ErrPasskey is returned when a passkey could not be verified or stored.
var ErrPasskey = errors.New("passkey could not be verified")

type pendingPasskey struct {
	session webauthn.SessionData
	expires time.Time
}

// Passkeys lets guests come back to their response with a passkey instead
// of the edit link. Challenges live in memory only.
type Passkeys struct {
	db  *sql.DB
	wa  *webauthn.WebAuthn
	now func() time.Time

	mu      sync.Mutex
	pending map[string]pendingPasskey
}

// NewPasskeys configures WebAuthn for the site at baseURL.
func NewPasskeys(db *sql.DB, baseURL, displayName string) (*Passkeys, error) {
	u, err := url.Parse(baseURL)
	if err != nil || u.Hostname() == "" {
		return nil, errors.New("passkeys: base URL must be an absolute URL")
	}
	if displayName == "" {
		displayName = "Wedwise"
	}
	wa, err := webauthn.New(&webauthn.Config{
		RPID:          u.Hostname(),
		RPDisplayName: displayName,
		RPOrigins:     []string{u.Scheme + "://" + u.Host},
	})
	if err != nil {
		return nil, err
	}
	return &Passkeys{db: db, wa: wa, now: time.Now, pending: map[string]pendingPasskey{}}, nil
}

type guest struct {
	id          int64
	name        string
	credentials []webauthn.Credential
}

func (g guest) WebAuthnID() []byte                         { return []byte(guestHandle + strconv.FormatInt(g.id, 10)) }
func (g guest) WebAuthnName() string                       { return g.name }
func (g guest) WebAuthnDisplayName() string                { return g.name }
func (g guest) WebAuthnCredentials() []webauthn.Credential { return g.credentials }

func (p *Passkeys) guest(ctx context.Context, responseID int64, name string) (guest, []int64, error) {
	g := guest{id: responseID, name: name}
	rows, err := p.db.QueryContext(ctx,
		"SELECT id, credential FROM response_passkeys WHERE response_id = ? ORDER BY id", responseID)
	if err != nil {
		return g, nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		var raw string
		if err := rows.Scan(&id, &raw); err != nil {
			return g, nil, err
		}
		var c webauthn.Credential
		if err := json.Unmarshal([]byte(raw), &c); err != nil {
			return g, nil, err
		}
		g.credentials = append(g.credentials, c)
		ids = append(ids, id)
	}
	return g, ids, rows.Err()
}

func (p *Passkeys) put(key string, session *webauthn.SessionData) {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := p.now()
	for id, pending := range p.pending {
		if now.After(pending.expires) {
			delete(p.pending, id)
		}
	}
	p.pending[key] = pendingPasskey{session: *session, expires: now.Add(passkeyChallengeTTL)}
}

func (p *Passkeys) take(key string) (webauthn.SessionData, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	pending, ok := p.pending[key]
	delete(p.pending, key)
	if !ok || p.now().After(pending.expires) {
		return webauthn.SessionData{}, false
	}
	return pending.session, true
}

func newChallengeID() (string, error) {
	buf := make([]byte, 18)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// BeginRegister returns creation options for a passkey bound to a response,
// plus the id of the pending challenge.
func (p *Passkeys) BeginRegister(ctx context.Context, response Response) (any, string, error) {
	g, _, err := p.guest(ctx, response.ID, response.ContactName)
	if err != nil {
		return nil, "", err
	}
	if len(g.credentials) >= maxPasskeys {
		return nil, "", ErrPasskey
	}
	exclude := make([]protocol.CredentialDescriptor, 0, len(g.credentials))
	for _, c := range g.credentials {
		exclude = append(exclude, c.Descriptor())
	}
	options, session, err := p.wa.BeginRegistration(g,
		webauthn.WithExclusions(exclude),
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementRequired,
			UserVerification: protocol.VerificationRequired,
		}))
	if err != nil {
		return nil, "", err
	}
	id, err := newChallengeID()
	if err != nil {
		return nil, "", err
	}
	p.put("register:"+id, session)
	return options, id, nil
}

// FinishRegister verifies the browser's answer and stores the passkey.
func (p *Passkeys) FinishRegister(ctx context.Context, response Response, id string, credential []byte) error {
	session, ok := p.take("register:" + id)
	if !ok {
		return ErrPasskey
	}
	parsed, err := protocol.ParseCredentialCreationResponseBytes(credential)
	if err != nil {
		return ErrPasskey
	}
	g, _, err := p.guest(ctx, response.ID, response.ContactName)
	if err != nil {
		return err
	}
	created, err := p.wa.CreateCredential(g, session, parsed)
	if err != nil {
		return ErrPasskey
	}
	raw, err := json.Marshal(created)
	if err != nil {
		return err
	}
	_, err = p.db.ExecContext(ctx,
		"INSERT INTO response_passkeys (response_id, credential, created_at) VALUES (?, ?, ?)",
		response.ID, string(raw), p.now().UTC().Format(time.RFC3339))
	return err
}

// BeginLogin returns options for finding a response by passkey, plus the id
// of the pending challenge.
func (p *Passkeys) BeginLogin() (any, string, error) {
	options, session, err := p.wa.BeginDiscoverableLogin(webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		return nil, "", err
	}
	id, err := newChallengeID()
	if err != nil {
		return nil, "", err
	}
	p.put("login:"+id, session)
	return options, id, nil
}

// FinishLogin verifies the assertion and returns the id of the response the
// passkey belongs to.
func (p *Passkeys) FinishLogin(ctx context.Context, id string, assertion []byte) (int64, error) {
	session, ok := p.take("login:" + id)
	if !ok {
		return 0, ErrPasskey
	}
	parsed, err := protocol.ParseCredentialRequestResponseBytes(assertion)
	if err != nil {
		return 0, ErrPasskey
	}
	var found guest
	var ids []int64
	handler := func(_, userHandle []byte) (webauthn.User, error) {
		handle, ok := strings.CutPrefix(string(userHandle), guestHandle)
		if !ok {
			return nil, ErrPasskey
		}
		responseID, err := strconv.ParseInt(handle, 10, 64)
		if err != nil {
			return nil, err
		}
		found, ids, err = p.guest(ctx, responseID, "")
		return found, err
	}
	credential, err := p.wa.ValidateDiscoverableLogin(handler, session, parsed)
	if err != nil || credential.Authenticator.CloneWarning || !credential.Flags.UserVerified {
		return 0, ErrPasskey
	}
	for i, c := range found.credentials {
		if string(c.ID) != string(credential.ID) {
			continue
		}
		raw, err := json.Marshal(credential)
		if err != nil {
			return 0, err
		}
		if _, err := p.db.ExecContext(ctx,
			"UPDATE response_passkeys SET credential = ? WHERE id = ?", string(raw), ids[i]); err != nil {
			return 0, err
		}
		return found.id, nil
	}
	return 0, ErrPasskey
}
