package server_test

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"github.com/pquerna/otp/totp"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/Breee/Wedwise/internal/contributions"
	"github.com/Breee/Wedwise/internal/database"
	"github.com/Breee/Wedwise/internal/rsvp"
	"github.com/Breee/Wedwise/internal/sealed"
	"github.com/Breee/Wedwise/internal/server"
	"github.com/Breee/Wedwise/internal/tokens"
)

// A leaked database must not reveal health, children or contact data.
func TestGuestDataEncryptedAtRest(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	body := withContribution(validResponse())
	body["message"] = "Geheime Nachricht 4711"
	body["attendees"] = []map[string]any{
		{"name": "Max Muster", "diet": "none", "allergies": "Erdnussallergie-4711"},
		{"name": "Mia Muster", "isChild": true, "age": 6, "diet": "none"},
	}
	view := submitResponse(t, app, body)

	witness, _ := app.login("witness_user", "TestPass123!")
	note := app.do("POST", "/api/contributions/"+strconv.FormatInt(contributionID(t, app), 10)+"/notes", map[string]string{"text": "Notiz-4711"}, witness)
	note.Body.Close()

	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	var age string
	if err := db.QueryRow("SELECT age FROM response_attendees WHERE is_child = 1").Scan(&age); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(age, "enc:v1:") {
		t.Fatalf("child age is stored as %q", age)
	}
	if _, err := db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()

	secrets := []string{"Geheime Nachricht 4711", "Erdnussallergie-4711", "muster@example.com", "+49 170 0000000",
		"Kleine Rede", "Ein paar Worte", "Mikrofon", "+49 170 1234567", "@max", "Notiz-4711"}
	for _, name := range []string{dbPath, dbPath + "-wal"} {
		raw, err := os.ReadFile(name)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		for _, secret := range secrets {
			if bytes.Contains(raw, []byte(secret)) {
				t.Fatalf("%q is stored in plain text in %s", secret, filepath.Base(name))
			}
		}
	}

	// Guests and staff still read everything.
	resp := app.do("GET", "/api/rsvp/"+view.EditToken, nil, nil)
	defer resp.Body.Close()
	var guest bytes.Buffer
	_, _ = guest.ReadFrom(resp.Body)
	for _, want := range []string{"Geheime Nachricht 4711", "Erdnussallergie-4711", `"age":6`, "Kleine Rede", "@max"} {
		if !strings.Contains(guest.String(), want) {
			t.Fatalf("guest view misses %q: %s", want, guest.String())
		}
	}
	detail := app.do("GET", "/api/contributions/"+strconv.FormatInt(contributionID(t, app), 10), nil, witness)
	defer detail.Body.Close()
	var staff bytes.Buffer
	_, _ = staff.ReadFrom(detail.Body)
	if !strings.Contains(staff.String(), "Notiz-4711") || !strings.Contains(staff.String(), "Mikrofon") {
		t.Fatalf("witness view: %s", staff.String())
	}
}

// Plain data from older versions is sealed on start, and a new key takes
// over once the old one is supplied as previous key.
func TestLegacyDataSealedAndRekeyed(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(filepath.Join(t.TempDir(), "legacy.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO responses (id, edit_token_hash, contact_name, status, email, message) VALUES (1, 'h', 'Alt', 'yes', 'alt@example.com', 'Alte Nachricht')`,
		`INSERT INTO response_attendees (response_id, name, is_child, age, diet, allergies) VALUES (1, 'Kind', 1, '4', 'none', 'Laktose-Alt')`,
		`INSERT INTO contributions (response_id, title, phone, messengers, status, created_at, updated_at)
		 VALUES (1, 'Alter Beitrag', '', '[{"kind":"signal","handle":"alt.01"}]', 'new', '2026-01-01', '2026-01-01')`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}

	box, _ := sealed.New(testDataKey)
	if n, err := box.Protect(ctx, db, server.SealedColumns()); err != nil || n != 6 {
		t.Fatalf("first run: %d, %v", n, err)
	}
	if n, err := box.Protect(ctx, db, server.SealedColumns()); err != nil || n != 0 {
		t.Fatalf("second run must not change anything: %d, %v", n, err)
	}
	if _, err := db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(dbFile(t, db))
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"alt@example.com", "Alte Nachricht", "Laktose-Alt", "Alter Beitrag", "alt.01"} {
		if bytes.Contains(raw, []byte(secret)) {
			t.Fatalf("%q lingers in the database file", secret)
		}
	}

	read := func(box *sealed.Box) (rsvp.Attendee, contributions.Contribution, error) {
		vault, _ := tokens.NewVault("test-secret-32-bytes-long-padding", "test")
		contributionStore := contributions.NewStore(db, box)
		attendees, err := rsvp.NewStore(db, contributionStore, vault, box).Attendees(ctx, 1)
		if err != nil {
			return rsvp.Attendee{}, contributions.Contribution{}, err
		}
		contribution, err := contributionStore.GetByResponse(ctx, 1)
		return attendees[0], contribution, err
	}
	attendee, contribution, err := read(box)
	if err != nil || attendee.Age != 4 || attendee.Allergies != "Laktose-Alt" ||
		contribution.Title != "Alter Beitrag" || contribution.Messengers[0].Handle != "alt.01" {
		t.Fatalf("after sealing: %+v, %+v, %v", attendee, contribution, err)
	}

	// A different key alone can neither read nor rewrite the data.
	const nextKey = "next-data-key-32-bytes-long-padding!"
	wrong, _ := sealed.New(nextKey)
	if _, _, err := read(wrong); !errors.Is(err, sealed.ErrKey) {
		t.Fatalf("wrong key: %v", err)
	}
	if _, err := wrong.Protect(ctx, db, server.SealedColumns()); !errors.Is(err, sealed.ErrKey) {
		t.Fatalf("protect with wrong key: %v", err)
	}

	rotating, _ := sealed.New(nextKey, testDataKey)
	if n, err := rotating.Protect(ctx, db, server.SealedColumns()); err != nil || n != 6 {
		t.Fatalf("rekey: %d, %v", n, err)
	}
	if attendee, _, err := read(wrong); err != nil || attendee.Allergies != "Laktose-Alt" {
		t.Fatalf("after rekey: %+v, %v", attendee, err)
	}
	if _, _, err := read(box); !errors.Is(err, sealed.ErrKey) {
		t.Fatalf("old key still opens the data: %v", err)
	}
}

// legacyTOTP encrypts a secret the way versions before the data key did.
func legacyTOTP(t *testing.T, sessionSecret, secret string) string {
	t.Helper()
	key := sha256.Sum256([]byte("wedwise-totp:" + sessionSecret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		t.Fatal(err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	nonce := make([]byte, aead.NonceSize())
	return base64.RawStdEncoding.EncodeToString(aead.Seal(nonce, nonce, []byte(secret), nil))
}

func TestLegacySecondFactorMovesToDataKey(t *testing.T) {
	ctx := context.Background()
	app, dbPath := newTestAppWithUsers(t)
	_ = app
	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	const sessionSecret = "test-secret-32-bytes-long-padding"
	key, err := totp.Generate(totp.GenerateOpts{Issuer: "Wedwise", AccountName: "witness_user"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO user_totp (user_id, secret_enc, confirmed_at, last_step, created_at)
		SELECT id, ?, '2026-01-01T00:00:00Z', 0, '2026-01-01T00:00:00Z' FROM users WHERE username = 'witness_user'`,
		legacyTOTP(t, sessionSecret, key.Secret())); err != nil {
		t.Fatal(err)
	}

	box, _ := sealed.New(testDataKey)
	if n, err := server.Protect(ctx, db, sessionSecret, box); err != nil || n != 1 {
		t.Fatalf("first run: %d, %v", n, err)
	}
	if n, err := server.Protect(ctx, db, sessionSecret, box); err != nil || n != 0 {
		t.Fatalf("second run must not change anything: %d, %v", n, err)
	}
	var stored string
	if err := db.QueryRow(`SELECT secret_enc FROM user_totp`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if plain, err := box.Open(stored); err != nil || plain != key.Secret() || !sealed.Sealed(stored) {
		t.Fatalf("secret not sealed with the data key: %v", err)
	}

	// The session secret alone no longer opens it; a rotated data key does.
	const nextKey = "next-data-key-with-at-least-32-bytes!"
	next, _ := sealed.New(nextKey, testDataKey)
	if n, err := server.Protect(ctx, db, "another-session-secret-32-bytes!!", next); err != nil || n != 1 {
		t.Fatalf("rotation: %d, %v", n, err)
	}
	db.QueryRow(`SELECT secret_enc FROM user_totp`).Scan(&stored)
	if _, err := box.Open(stored); err == nil {
		t.Fatal("old data key still opens the secret")
	}
	only, _ := sealed.New(nextKey)
	if plain, err := only.Open(stored); err != nil || plain != key.Secret() {
		t.Fatalf("new data key cannot open the secret: %v", err)
	}
}
