package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zalando/go-keyring"
)

func TestTokenLivesInTheKeyring(t *testing.T) {
	keyring.MockInit()
	t.Setenv("WEDWISE_TOKEN", "")
	path := filepath.Join(t.TempDir(), "credentials.json")

	// A token left in the file by an older version moves into the keyring.
	store := &Store{Current: "a.example", Hosts: map[string]Site{"a.example": {URL: "https://a.example", Token: "old"}}, path: path}
	site, err := store.site("")
	if err != nil || site.Token != "old" {
		t.Fatalf("site = %+v, %v", site, err)
	}
	if got, _ := keyring.Get(keyringService, "a.example"); got != "old" {
		t.Fatalf("keyring holds %q", got)
	}
	data, _ := os.ReadFile(path)
	if strings.Contains(string(data), "old") {
		t.Fatalf("token still in the file: %s", data)
	}
	if site, err = store.site("a.example"); err != nil || site.Token != "old" {
		t.Fatalf("second read = %+v, %v", site, err)
	}

	// The environment replaces the stored sign-in, also for unknown sites.
	t.Setenv("WEDWISE_TOKEN", "ci")
	if site, err = store.site("https://b.example"); err != nil || site.Token != "ci" || site.URL != "https://b.example" {
		t.Fatalf("env site = %+v, %v", site, err)
	}
}

func TestTokenFallsBackToTheFile(t *testing.T) {
	keyring.MockInitWithError(errors.New("no keyring"))
	t.Setenv("WEDWISE_TOKEN", "")
	store := &Store{Current: "a.example", Hosts: map[string]Site{"a.example": {URL: "https://a.example", Token: "kept"}}, path: filepath.Join(t.TempDir(), "c.json")}
	site, err := store.site("")
	if err != nil || site.Token != "kept" || store.Hosts["a.example"].Token != "kept" {
		t.Fatalf("site = %+v, %v", site, err)
	}
}
