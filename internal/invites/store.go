// Package invites manages shareable invite links that open the RSVP form.
// A link is a random token with a short code, an optional PIN and an
// optional name of whom it is for.
package invites

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/tokens"
)

// ErrNotFound is returned when no link matches.
var ErrNotFound = errors.New("invite link not found")

// ErrValidation is returned when input validation fails.
var ErrValidation = errors.New("invalid invite link data")

const (
	minPINLen = 4
	maxPINLen = 64
	tokenLen  = 16

	// CodeLen is the length of the short code of a link.
	CodeLen    = 6
	maxNameLen = 80

	// MaxGuests is how many persons one link can name.
	MaxGuests = 10

	// MaxResponseLimit is the highest cap that can be set on a link.
	MaxResponseLimit = 10000
	maxChildAge      = 17
)

// Person is someone a link invites.
type Person struct {
	Name    string `json:"name"`
	IsChild bool   `json:"isChild"`
	// Age is only kept for children; 0 means not given.
	Age int `json:"age"`
}

// Link is a shareable invite link.
type Link struct {
	ID    int64  `json:"id"`
	Token string `json:"token"`
	// Code is the short code guests can type in instead of opening the link.
	Code string `json:"code"`
	// Persons says whom the link is for. A link with persons is an invitation.
	Persons []Person `json:"persons"`
	// Guests are the names of the persons; the invitation greets them.
	Guests []string `json:"guests"`
	// Salutation picks "Liebe" or "Lieber" for a single guest: "", "liebe" or "lieber".
	Salutation string `json:"salutation"`
	HasPIN     bool   `json:"hasPin"`
	Active     bool   `json:"active"`
	Responses  int    `json:"responses"`
	// MaxResponses caps the responses the link accepts; 0 means unlimited.
	MaxResponses int       `json:"maxResponses"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`

	pinHash string
}

// Store persists invite links in SQLite.
type Store struct {
	db    *sql.DB
	vault *tokens.Vault
}

// NewStore creates an invite link store. Tokens are stored hashed, with a copy
// encrypted by vault so staff can copy the link again.
func NewStore(db *sql.DB, vault *tokens.Vault) *Store { return &Store{db: db, vault: vault} }

// ProtectTokens converts tokens that are still stored in plain text.
func (s *Store) ProtectTokens(ctx context.Context) error {
	return tokens.Protect(ctx, s.db, s.vault, "invite_links", "token_hash", "token_enc")
}

const columns = `l.id, l.token_enc, l.code_enc, l.name_enc, l.salutation, l.pin_hash, l.active, l.max_responses, l.created_at, l.updated_at,
	(SELECT COUNT(*) FROM responses r WHERE r.invite_link_id = l.id)`

// Create inserts a new active link without PIN.
func (s *Store) Create(ctx context.Context) (Link, error) {
	token, err := generateToken()
	if err != nil {
		return Link{}, err
	}
	sealed, err := s.vault.Seal(token)
	if err != nil {
		return Link{}, fmt.Errorf("seal invite token: %w", err)
	}
	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO invite_links (token_hash, token_enc, created_at, updated_at) VALUES (?, ?, ?, ?)",
		tokens.Hash(token), sealed, now, now)
	if err != nil {
		return Link{}, fmt.Errorf("insert invite link: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Link{}, fmt.Errorf("invite link id: %w", err)
	}
	if err := s.newCode(ctx, id); err != nil {
		return Link{}, err
	}
	return s.GetByID(ctx, id)
}

// EnsureCodes gives a code to every link that has none yet.
func (s *Store) EnsureCodes(ctx context.Context) error {
	rows, err := s.db.QueryContext(ctx, "SELECT id FROM invite_links WHERE code_hash = ''")
	if err != nil {
		return fmt.Errorf("list invite links without code: %w", err)
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return fmt.Errorf("scan invite link id: %w", err)
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate invite links without code: %w", err)
	}
	for _, id := range ids {
		if err := s.newCode(ctx, id); err != nil {
			return err
		}
	}
	return nil
}

// newCode stores a fresh code on a link. Codes are unique, so a taken one is
// drawn again.
func (s *Store) newCode(ctx context.Context, id int64) error {
	var err error
	for range 10 {
		var code, sealed string
		if code, err = generateCode(); err != nil {
			return err
		}
		if sealed, err = s.vault.Seal(code); err != nil {
			return fmt.Errorf("seal invite code: %w", err)
		}
		if _, err = s.db.ExecContext(ctx, "UPDATE invite_links SET code_hash = ?, code_enc = ? WHERE id = ?",
			tokens.Hash(code), sealed, id); err == nil {
			return nil
		}
	}
	return fmt.Errorf("store invite code: %w", err)
}

// List returns all links, newest first.
func (s *Store) List(ctx context.Context) ([]Link, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT "+columns+" FROM invite_links l ORDER BY l.id DESC")
	if err != nil {
		return nil, fmt.Errorf("list invite links: %w", err)
	}
	defer rows.Close()

	result := make([]Link, 0)
	for rows.Next() {
		link, err := s.scan(rows)
		if err != nil {
			return nil, fmt.Errorf("scan invite link: %w", err)
		}
		result = append(result, link)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate invite links: %w", err)
	}
	return result, nil
}

// GetByID returns a link by id.
func (s *Store) GetByID(ctx context.Context, id int64) (Link, error) {
	return s.queryOne(ctx, "SELECT "+columns+" FROM invite_links l WHERE l.id = ?", id)
}

// GetByToken returns a link by token regardless of its active state.
func (s *Store) GetByToken(ctx context.Context, token string) (Link, error) {
	if token == "" {
		return Link{}, ErrNotFound
	}
	return s.queryOne(ctx, "SELECT "+columns+" FROM invite_links l WHERE l.token_hash = ?", tokens.Hash(token))
}

// GetByCode returns a link by its short code. Case, spaces and dashes in the
// typed code do not matter.
func (s *Store) GetByCode(ctx context.Context, code string) (Link, error) {
	code = strings.ToUpper(strings.NewReplacer(" ", "", "-", "").Replace(code))
	if len(code) != CodeLen {
		return Link{}, ErrNotFound
	}
	return s.queryOne(ctx, "SELECT "+columns+" FROM invite_links l WHERE l.code_hash = ?", tokens.Hash(code))
}

// CreateFor inserts an invitation: a link for the given persons that takes
// one response.
func (s *Store) CreateFor(ctx context.Context, persons []Person, salutation string) (Link, error) {
	sealed, err := s.sealPersons(persons, salutation)
	if err != nil {
		return Link{}, err
	}
	if sealed == "" {
		return Link{}, fmt.Errorf("%w: an invitation needs a person", ErrValidation)
	}
	link, err := s.Create(ctx)
	if err != nil {
		return Link{}, err
	}
	return s.update(ctx, link.ID, "name_enc = ?, salutation = ?, max_responses = 1", sealed, salutation)
}

// SetPersons sets or, with no names, removes whom the link is for.
func (s *Store) SetPersons(ctx context.Context, id int64, persons []Person, salutation string) (Link, error) {
	sealed, err := s.sealPersons(persons, salutation)
	if err != nil {
		return Link{}, err
	}
	return s.update(ctx, id, "name_enc = ?, salutation = ?", sealed, salutation)
}

// sealPersons checks the persons and seals them as JSON; persons without a
// name are left out.
func (s *Store) sealPersons(persons []Person, salutation string) (string, error) {
	if salutation != "" && salutation != "liebe" && salutation != "lieber" {
		return "", fmt.Errorf("%w: unknown salutation", ErrValidation)
	}
	var named []Person
	for _, p := range persons {
		p.Name = strings.Join(strings.Fields(p.Name), " ")
		if p.Name == "" {
			continue
		}
		if len([]rune(p.Name)) > maxNameLen {
			return "", fmt.Errorf("%w: name must be at most %d characters", ErrValidation, maxNameLen)
		}
		if p.Age < 0 || p.Age > maxChildAge {
			return "", fmt.Errorf("%w: age must be between 0 and %d", ErrValidation, maxChildAge)
		}
		if !p.IsChild {
			p.Age = 0
		}
		named = append(named, p)
	}
	if len(named) > MaxGuests {
		return "", fmt.Errorf("%w: at most %d persons", ErrValidation, MaxGuests)
	}
	if len(named) == 0 {
		return "", nil
	}
	raw, err := json.Marshal(named)
	if err != nil {
		return "", fmt.Errorf("encode invite persons: %w", err)
	}
	sealed, err := s.vault.Seal(string(raw))
	if err != nil {
		return "", fmt.Errorf("seal invite persons: %w", err)
	}
	return sealed, nil
}

// SetPIN sets or, with an empty pin, removes the PIN of a link.
func (s *Store) SetPIN(ctx context.Context, id int64, pin string) (Link, error) {
	pin = strings.TrimSpace(pin)
	hash := ""
	if pin != "" {
		if len(pin) < minPINLen || len(pin) > maxPINLen {
			return Link{}, fmt.Errorf("%w: pin must be between %d and %d characters", ErrValidation, minPINLen, maxPINLen)
		}
		var err error
		if hash, err = auth.HashPassword(pin); err != nil {
			return Link{}, fmt.Errorf("hash pin: %w", err)
		}
	}
	return s.update(ctx, id, "pin_hash = ?", hash)
}

// SetActive enables or disables a link.
func (s *Store) SetActive(ctx context.Context, id int64, active bool) (Link, error) {
	return s.update(ctx, id, "active = ?", active)
}

// SetMaxResponses caps the responses a link accepts; 0 removes the cap.
func (s *Store) SetMaxResponses(ctx context.Context, id int64, limit int) (Link, error) {
	if limit < 0 || limit > MaxResponseLimit {
		return Link{}, fmt.Errorf("%w: maxResponses must be between 0 and %d", ErrValidation, MaxResponseLimit)
	}
	return s.update(ctx, id, "max_responses = ?", limit)
}

// Regenerate replaces the token and the code of a link, invalidating the
// old URL and the old code.
func (s *Store) Regenerate(ctx context.Context, id int64) (Link, error) {
	token, err := generateToken()
	if err != nil {
		return Link{}, err
	}
	sealed, err := s.vault.Seal(token)
	if err != nil {
		return Link{}, fmt.Errorf("seal invite token: %w", err)
	}
	if err := s.newCode(ctx, id); err != nil {
		return Link{}, err
	}
	return s.update(ctx, id, "token_hash = ?, token_enc = ?", tokens.Hash(token), sealed)
}

// Delete removes a link. Responses submitted through it are kept.
func (s *Store) Delete(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, "DELETE FROM invite_links WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete invite link: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// VerifyPIN reports whether pin matches the link. Links without PIN accept anything.
func (l Link) VerifyPIN(pin string) bool {
	if !l.HasPIN {
		return true
	}
	ok, err := auth.VerifyPassword(pin, l.pinHash)
	return err == nil && ok
}

// Full reports whether the link has reached its response cap.
func (l Link) Full() bool { return l.MaxResponses > 0 && l.Responses >= l.MaxResponses }

// PINHash exposes the stored hash so access proofs can be bound to it.
func (l Link) PINHash() string { return l.pinHash }

func (s *Store) update(ctx context.Context, id int64, set string, values ...any) (Link, error) {
	res, err := s.db.ExecContext(ctx,
		"UPDATE invite_links SET "+set+", updated_at = ? WHERE id = ?", append(values, time.Now().UTC(), id)...)
	if err != nil {
		return Link{}, fmt.Errorf("update invite link: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Link{}, ErrNotFound
	}
	return s.GetByID(ctx, id)
}

func (s *Store) queryOne(ctx context.Context, query string, args ...any) (Link, error) {
	link, err := s.scan(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return Link{}, ErrNotFound
	}
	if err != nil {
		return Link{}, fmt.Errorf("get invite link: %w", err)
	}
	return link, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func (s *Store) scan(row scanner) (Link, error) {
	var l Link
	var sealed, code, name string
	err := row.Scan(&l.ID, &sealed, &code, &name, &l.Salutation, &l.pinHash, &l.Active, &l.MaxResponses, &l.CreatedAt, &l.UpdatedAt, &l.Responses)
	// Empty when the session secret changed: the link still works, but staff
	// have to regenerate it to see the URL again.
	l.Token = s.vault.OpenOrEmpty(sealed)
	l.Code = s.vault.OpenOrEmpty(code)
	l.Persons = []Person{}
	l.Guests = []string{}
	// Older links hold one name per line instead of JSON.
	if names := s.vault.OpenOrEmpty(name); strings.HasPrefix(names, "[") {
		_ = json.Unmarshal([]byte(names), &l.Persons)
	} else if names != "" {
		for _, n := range strings.Split(names, "\n") {
			l.Persons = append(l.Persons, Person{Name: n})
		}
	}
	for _, p := range l.Persons {
		l.Guests = append(l.Guests, p.Name)
	}
	l.HasPIN = l.pinHash != ""
	return l, err
}

// codeAlphabet leaves out the characters that are easy to mix up: 0 and O,
// 1, I and L.
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

func generateCode() (string, error) {
	code := make([]byte, CodeLen)
	for i := range code {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(codeAlphabet))))
		if err != nil {
			return "", fmt.Errorf("generate invite code: %w", err)
		}
		code[i] = codeAlphabet[n.Int64()]
	}
	return string(code), nil
}

func generateToken() (string, error) {
	buf := make([]byte, tokenLen)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate invite token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
