package server_test

import (
	"bytes"
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/Breee/Wedwise/internal/contributions"
	"github.com/Breee/Wedwise/internal/database"
	"github.com/Breee/Wedwise/internal/invites"
	"github.com/Breee/Wedwise/internal/rsvp"
	"github.com/Breee/Wedwise/internal/sealed"
	"github.com/Breee/Wedwise/internal/tokens"
)

// A leaked database must not contain usable invite or edit tokens.
func TestTokensProtectedAtRest(t *testing.T) {
	app, dbPath := newTestAppWithUsers(t)
	link := createLink(t, app)
	view := submitResponse(t, app, validResponse())
	if link.Token == "" || view.EditToken == "" {
		t.Fatal("expected tokens in the API responses")
	}

	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()

	for _, name := range []string{dbPath, dbPath + "-wal"} {
		raw, err := os.ReadFile(name)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		for label, token := range map[string]string{"invite": app.linkToken, "created invite": link.Token, "edit": view.EditToken} {
			if bytes.Contains(raw, []byte(token)) {
				t.Fatalf("%s token is stored in plain text in %s", label, filepath.Base(name))
			}
		}
	}

	// Staff can still copy the links.
	couple, _ := app.login("couple_user", "TestPass123!")
	resp := app.do("GET", "/api/responses/", nil, couple)
	defer resp.Body.Close()
	var body bytes.Buffer
	_, _ = body.ReadFrom(resp.Body)
	if !bytes.Contains(body.Bytes(), []byte(view.EditToken)) {
		t.Fatalf("staff cannot see the edit token: %s", body.String())
	}
}

// Tokens written by older versions are converted on start and keep working.
func TestLegacyTokensConverted(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(filepath.Join(t.TempDir(), "legacy.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	const legacyLink, legacyEdit = "legacy-invite-token-0123", "legacy-edit-token-0123456789"
	if _, err := db.Exec("INSERT INTO invite_links (token_hash) VALUES (?)", legacyLink); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("INSERT INTO responses (edit_token_hash, contact_name, status) VALUES (?, 'Alt', 'no')", legacyEdit); err != nil {
		t.Fatal(err)
	}

	vault, err := tokens.NewVault("test-secret-32-bytes-long-padding", "test")
	if err != nil {
		t.Fatal(err)
	}
	links := invites.NewStore(db, vault)
	box, err := sealed.New(testDataKey)
	if err != nil {
		t.Fatal(err)
	}
	responses := rsvp.NewStore(db, contributions.NewStore(db, box), vault, box)
	for range 2 { // converting twice must not hash the hash
		if err := links.ProtectTokens(ctx); err != nil {
			t.Fatal(err)
		}
		if err := responses.ProtectTokens(ctx); err != nil {
			t.Fatal(err)
		}
	}

	link, err := links.GetByToken(ctx, legacyLink)
	if err != nil || link.Token != legacyLink {
		t.Fatalf("legacy invite link: %+v, %v", link, err)
	}
	response, err := responses.GetByToken(ctx, legacyEdit)
	if err != nil {
		t.Fatalf("legacy edit token: %v", err)
	}
	edit, err := responses.EditTokens(ctx)
	if err != nil || edit[response.ID] != legacyEdit {
		t.Fatalf("staff edit tokens: %v, %v", edit, err)
	}

	var plain int
	if err := db.QueryRow(`SELECT (SELECT COUNT(*) FROM invite_links WHERE token_hash = ? OR token_enc = ?)
		+ (SELECT COUNT(*) FROM responses WHERE edit_token_hash = ? OR edit_token_enc = ?)`,
		legacyLink, legacyLink, legacyEdit, legacyEdit).Scan(&plain); err != nil {
		t.Fatal(err)
	}
	if plain != 0 {
		t.Fatal("legacy tokens are still stored in plain text")
	}

	if _, err := db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(filepath.Dir(dbFile(t, db)), "legacy.db"))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte(legacyLink)) || bytes.Contains(raw, []byte(legacyEdit)) {
		t.Fatal("legacy tokens linger in the database file")
	}

	// A changed secret keeps links working but hides them from staff.
	other, _ := tokens.NewVault("another-secret-32-bytes-long-pad", "test")
	rotated, err := invites.NewStore(db, other).GetByToken(ctx, legacyLink)
	if err != nil || rotated.Token != "" {
		t.Fatalf("after secret change: %+v, %v", rotated, err)
	}
}

func dbFile(t *testing.T, db *sql.DB) string {
	t.Helper()
	var seq int
	var name, file string
	if err := db.QueryRow("PRAGMA database_list").Scan(&seq, &name, &file); err != nil {
		t.Fatal(err)
	}
	return file
}
