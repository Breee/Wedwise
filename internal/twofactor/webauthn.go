package twofactor

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
	challengeTTL = 5 * time.Minute
	maxKeys      = 10
	maxKeyName   = 60
)

// ErrNoKeys is returned when a user has no registered security key.
var ErrNoKeys = errors.New("no security keys registered")

// Key describes a registered passkey or hardware token.
type Key struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type pendingChallenge struct {
	session webauthn.SessionData
	expires time.Time
}

// Keys manages WebAuthn credentials. Challenges live in memory only.
type Keys struct {
	db  *sql.DB
	wa  *webauthn.WebAuthn
	now func() time.Time

	mu      sync.Mutex
	pending map[string]pendingChallenge
}

// NewKeys configures WebAuthn for the site at baseURL.
func NewKeys(db *sql.DB, baseURL, displayName string) (*Keys, error) {
	u, err := url.Parse(baseURL)
	if err != nil || u.Hostname() == "" {
		return nil, errors.New("webauthn: base URL must be an absolute URL")
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
	return &Keys{db: db, wa: wa, now: time.Now, pending: map[string]pendingChallenge{}}, nil
}

type keyUser struct {
	id          int64
	name        string
	credentials []webauthn.Credential
}

func (u keyUser) WebAuthnID() []byte                         { return []byte(strconv.FormatInt(u.id, 10)) }
func (u keyUser) WebAuthnName() string                       { return u.name }
func (u keyUser) WebAuthnDisplayName() string                { return u.name }
func (u keyUser) WebAuthnCredentials() []webauthn.Credential { return u.credentials }

func (k *Keys) user(ctx context.Context, userID int64, name string) (keyUser, []int64, error) {
	rows, err := k.db.QueryContext(ctx,
		`SELECT id, credential FROM user_webauthn_credentials WHERE user_id = ? ORDER BY id`, userID)
	if err != nil {
		return keyUser{}, nil, err
	}
	defer rows.Close()
	u := keyUser{id: userID, name: name}
	var ids []int64
	for rows.Next() {
		var id int64
		var raw string
		if err := rows.Scan(&id, &raw); err != nil {
			return keyUser{}, nil, err
		}
		var c webauthn.Credential
		if err := json.Unmarshal([]byte(raw), &c); err != nil {
			return keyUser{}, nil, err
		}
		u.credentials = append(u.credentials, c)
		ids = append(ids, id)
	}
	return u, ids, rows.Err()
}

func (k *Keys) put(key string, session *webauthn.SessionData) {
	k.mu.Lock()
	defer k.mu.Unlock()
	now := k.now()
	for id, p := range k.pending {
		if now.After(p.expires) {
			delete(k.pending, id)
		}
	}
	k.pending[key] = pendingChallenge{session: *session, expires: now.Add(challengeTTL)}
}

// take returns a pending challenge once.
func (k *Keys) take(key string) (webauthn.SessionData, bool) {
	k.mu.Lock()
	defer k.mu.Unlock()
	p, ok := k.pending[key]
	delete(k.pending, key)
	if !ok || k.now().After(p.expires) {
		return webauthn.SessionData{}, false
	}
	return p.session, true
}

func pendingKey(kind string, userID int64) string {
	return kind + ":" + strconv.FormatInt(userID, 10)
}

// List returns the user's keys.
func (k *Keys) List(ctx context.Context, userID int64) ([]Key, error) {
	rows, err := k.db.QueryContext(ctx,
		`SELECT id, name, created_at FROM user_webauthn_credentials WHERE user_id = ? ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := []Key{}
	for rows.Next() {
		var key Key
		if err := rows.Scan(&key.ID, &key.Name, &key.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

// Count returns the number of keys of a user.
func (k *Keys) Count(ctx context.Context, userID int64) (int, error) {
	var n int
	err := k.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM user_webauthn_credentials WHERE user_id = ?`, userID).Scan(&n)
	return n, err
}

// BeginRegister returns creation options for a new key.
func (k *Keys) BeginRegister(ctx context.Context, userID int64, username string) (*protocol.CredentialCreation, error) {
	return k.beginRegister(ctx, userID, username)
}

// BeginRegisterPasskey returns creation options for a key that can sign in
// without a password: stored on the device and unlocked by the user.
func (k *Keys) BeginRegisterPasskey(ctx context.Context, userID int64, username string) (any, error) {
	return k.beginRegister(ctx, userID, username, webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
		ResidentKey:      protocol.ResidentKeyRequirementRequired,
		UserVerification: protocol.VerificationRequired,
	}))
}

func (k *Keys) beginRegister(ctx context.Context, userID int64, username string, opts ...webauthn.RegistrationOption) (*protocol.CredentialCreation, error) {
	u, _, err := k.user(ctx, userID, username)
	if err != nil {
		return nil, err
	}
	if len(u.credentials) >= maxKeys {
		return nil, ErrAlreadyEnabled
	}
	exclude := make([]protocol.CredentialDescriptor, 0, len(u.credentials))
	for _, c := range u.credentials {
		exclude = append(exclude, c.Descriptor())
	}
	options, session, err := k.wa.BeginRegistration(u, append(opts, webauthn.WithExclusions(exclude))...)
	if err != nil {
		return nil, err
	}
	k.put(pendingKey("register", userID), session)
	return options, nil
}

// FinishRegister verifies the browser's response and stores the public key.
func (k *Keys) FinishRegister(ctx context.Context, userID int64, username, name string, response []byte) error {
	session, ok := k.take(pendingKey("register", userID))
	if !ok {
		return ErrInvalidCode
	}
	parsed, err := protocol.ParseCredentialCreationResponseBytes(response)
	if err != nil {
		return ErrInvalidCode
	}
	u, _, err := k.user(ctx, userID, username)
	if err != nil {
		return err
	}
	credential, err := k.wa.CreateCredential(u, session, parsed)
	if err != nil {
		return ErrInvalidCode
	}
	raw, err := json.Marshal(credential)
	if err != nil {
		return err
	}
	name = strings.TrimSpace(name)
	if len(name) > maxKeyName {
		name = name[:maxKeyName]
	}
	_, err = k.db.ExecContext(ctx,
		`INSERT INTO user_webauthn_credentials (user_id, name, credential, created_at) VALUES (?, ?, ?, ?)`,
		userID, name, string(raw), k.now().UTC().Format(time.RFC3339))
	return err
}

// Delete removes one key of the user.
func (k *Keys) Delete(ctx context.Context, userID, id int64) error {
	_, err := k.db.ExecContext(ctx,
		`DELETE FROM user_webauthn_credentials WHERE user_id = ? AND id = ?`, userID, id)
	return err
}

// DeleteAll removes every key of the user.
func (k *Keys) DeleteAll(ctx context.Context, userID int64) error {
	_, err := k.db.ExecContext(ctx, `DELETE FROM user_webauthn_credentials WHERE user_id = ?`, userID)
	return err
}

// BeginLogin returns assertion options for the user's keys.
func (k *Keys) BeginLogin(ctx context.Context, userID int64) (*protocol.CredentialAssertion, error) {
	u, _, err := k.user(ctx, userID, "")
	if err != nil {
		return nil, err
	}
	if len(u.credentials) == 0 {
		return nil, ErrNoKeys
	}
	options, session, err := k.wa.BeginLogin(u)
	if err != nil {
		return nil, err
	}
	k.put(pendingKey("login", userID), session)
	return options, nil
}

// FinishLogin verifies an assertion against the pending challenge.
func (k *Keys) FinishLogin(ctx context.Context, userID int64, response []byte) (bool, error) {
	session, ok := k.take(pendingKey("login", userID))
	if !ok {
		return false, nil
	}
	parsed, err := protocol.ParseCredentialRequestResponseBytes(response)
	if err != nil {
		return false, nil
	}
	u, ids, err := k.user(ctx, userID, "")
	if err != nil {
		return false, err
	}
	credential, err := k.wa.ValidateLogin(u, session, parsed)
	if err != nil {
		return false, nil
	}
	if credential.Authenticator.CloneWarning {
		return false, nil
	}
	return k.saveUsed(ctx, u, ids, credential)
}

func (k *Keys) saveUsed(ctx context.Context, u keyUser, ids []int64, credential *webauthn.Credential) (bool, error) {
	raw, err := json.Marshal(credential)
	if err != nil {
		return false, err
	}
	for i, c := range u.credentials {
		if string(c.ID) == string(credential.ID) {
			_, err = k.db.ExecContext(ctx,
				`UPDATE user_webauthn_credentials SET credential = ? WHERE id = ?`, string(raw), ids[i])
			return err == nil, err
		}
	}
	return false, nil
}

// BeginPasskeyLogin returns options for a login without username and
// password, plus the id of the pending challenge.
func (k *Keys) BeginPasskeyLogin() (any, string, error) {
	options, session, err := k.wa.BeginDiscoverableLogin(webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		return nil, "", err
	}
	buf := make([]byte, 18)
	if _, err := rand.Read(buf); err != nil {
		return nil, "", err
	}
	id := base64.RawURLEncoding.EncodeToString(buf)
	k.put("passkey:"+id, session)
	return options, id, nil
}

// FinishPasskeyLogin verifies the assertion and returns the user it belongs
// to. The key must have verified the user (PIN or biometrics).
func (k *Keys) FinishPasskeyLogin(ctx context.Context, id string, response []byte) (int64, bool, error) {
	session, ok := k.take("passkey:" + id)
	if !ok {
		return 0, false, nil
	}
	parsed, err := protocol.ParseCredentialRequestResponseBytes(response)
	if err != nil {
		return 0, false, nil
	}
	var found keyUser
	var ids []int64
	handler := func(_, userHandle []byte) (webauthn.User, error) {
		userID, err := strconv.ParseInt(string(userHandle), 10, 64)
		if err != nil {
			return nil, err
		}
		found, ids, err = k.user(ctx, userID, "")
		return found, err
	}
	credential, err := k.wa.ValidateDiscoverableLogin(handler, session, parsed)
	if err != nil || credential.Authenticator.CloneWarning || !credential.Flags.UserVerified {
		return 0, false, nil
	}
	saved, err := k.saveUsed(ctx, found, ids, credential)
	return found.id, saved, err
}
