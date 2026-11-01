package theme

import "testing"

func TestLoadBundled(t *testing.T) {
	r, err := Load("")
	if err != nil {
		t.Fatal(err)
	}
	if len(r.List()) < 2 || !r.Has(DefaultName) {
		t.Fatalf("expected bundled themes incl. default, got %d", len(r.List()))
	}
	if r.Get("unknown").Name != DefaultName {
		t.Fatal("unknown theme should fall back to default")
	}
}

func TestValidate(t *testing.T) {
	r := &Registry{themes: map[string]Theme{}}
	bad := []string{
		"name: Bad Name\ncolors: {}\n",
		"name: ok\ncolors:\n  background: red\n",
	}
	for _, y := range bad {
		if err := r.add([]byte(y), "test"); err == nil {
			t.Fatalf("expected error for %q", y)
		}
	}
}
