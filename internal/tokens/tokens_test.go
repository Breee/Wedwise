package tokens

import "testing"

func TestVaultRoundTrip(t *testing.T) {
	vault, err := NewVault("a-long-enough-secret", "invite")
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := vault.Seal("token-123")
	if err != nil {
		t.Fatal(err)
	}
	if sealed == "token-123" {
		t.Fatal("token stored in plain text")
	}
	if got, err := vault.Open(sealed); err != nil || got != "token-123" {
		t.Fatalf("open: %q, %v", got, err)
	}
	again, _ := vault.Seal("token-123")
	if again == sealed {
		t.Fatal("sealing must not be deterministic")
	}
}

func TestVaultRejectsOtherKeys(t *testing.T) {
	a, _ := NewVault("a-long-enough-secret", "invite")
	sealed, _ := a.Seal("token-123")
	for name, other := range map[string][2]string{
		"secret":  {"another-long-secret", "invite"},
		"purpose": {"a-long-enough-secret", "edit"},
	} {
		b, _ := NewVault(other[0], other[1])
		if _, err := b.Open(sealed); err == nil {
			t.Fatalf("other %s opened the token", name)
		}
		if b.OpenOrEmpty(sealed) != "" {
			t.Fatalf("other %s leaked the token", name)
		}
	}
	if _, err := a.Open("not base64!"); err == nil {
		t.Fatal("corrupt input accepted")
	}
}

func TestHash(t *testing.T) {
	if Hash("a") == Hash("b") || Hash("a") != Hash("a") || len(Hash("a")) != 64 {
		t.Fatal("unexpected hash")
	}
}
