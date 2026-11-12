package content

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"time"
)

const keySeedHash = "seed.hash"

// Seed applies the content file at path when it differs from the last file
// applied. Edits made in the editor therefore survive restarts until the file
// itself changes. It reports whether the content was replaced.
func (s *Store) Seed(ctx context.Context, path string) (bool, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return false, fmt.Errorf("read content file: %w", err)
	}
	sum := sha256.Sum256(raw)
	hash := hex.EncodeToString(sum[:])

	blocks, _, err := s.blocks(ctx)
	if err != nil {
		return false, err
	}
	if blocks[keySeedHash] == hash {
		return false, nil
	}

	var seed Content
	if err := json.Unmarshal(raw, &seed); err != nil {
		return false, fmt.Errorf("parse content file %s: %w", path, err)
	}
	if _, err := s.Replace(ctx, seed); err != nil {
		return false, fmt.Errorf("apply content file %s: %w", path, err)
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO content_blocks (key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		keySeedHash, hash, time.Now().UTC()); err != nil {
		return false, fmt.Errorf("store content seed hash: %w", err)
	}
	return true, nil
}
