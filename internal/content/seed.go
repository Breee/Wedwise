package content

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
)

// Seed fills a fresh instance from the content file at path. Once any content
// exists the file is ignored, so it can never overwrite what was set in the
// editor or imported. It reports whether the content was applied.
func (s *Store) Seed(ctx context.Context, path string) (bool, error) {
	blocks, _, err := s.blocks(ctx)
	if err != nil {
		return false, err
	}
	if len(blocks) > 0 {
		return false, nil
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return false, fmt.Errorf("read content file: %w", err)
	}
	var seed Content
	if err := json.Unmarshal(raw, &seed); err != nil {
		return false, fmt.Errorf("parse content file %s: %w", path, err)
	}
	if _, err := s.Replace(ctx, seed); err != nil {
		return false, fmt.Errorf("apply content file %s: %w", path, err)
	}
	return true, nil
}
