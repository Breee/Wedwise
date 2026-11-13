package sealed

import (
	"errors"
	"strings"
	"testing"
)

const keyA, keyB = "key-a-0123456789-0123456789-0123456789", "key-b-0123456789-0123456789-0123456789"

func TestSealOpen(t *testing.T) {
	box, err := New(keyA)
	if err != nil {
		t.Fatal(err)
	}
	value, err := box.Seal("Nussallergie")
	if err != nil || !strings.HasPrefix(value, prefix) || strings.Contains(value, "Nuss") {
		t.Fatalf("seal: %q, %v", value, err)
	}
	again, _ := box.Seal("Nussallergie")
	if again == value {
		t.Fatal("sealing twice must not give the same value")
	}
	if plain, err := box.Open(value); err != nil || plain != "Nussallergie" {
		t.Fatalf("open: %q, %v", plain, err)
	}
	if empty, _ := box.Seal(""); empty != "" {
		t.Fatalf("empty value sealed to %q", empty)
	}
	if legacy, err := box.Open("plain text"); err != nil || legacy != "plain text" {
		t.Fatalf("legacy value: %q, %v", legacy, err)
	}

	other, _ := New(keyB)
	if _, err := other.Open(value); !errors.Is(err, ErrKey) {
		t.Fatalf("wrong key: %v", err)
	}
	if _, err := box.Open(value[:len(value)-2] + "AA"); !errors.Is(err, ErrKey) {
		t.Fatalf("tampered value: %v", err)
	}
	rotating, _ := New(keyB, keyA)
	if plain, err := rotating.Open(value); err != nil || plain != "Nussallergie" {
		t.Fatalf("previous key: %q, %v", plain, err)
	}
	if _, err := New("short"); err == nil {
		t.Fatal("short key accepted")
	}
}
