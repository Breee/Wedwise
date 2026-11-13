package tokens

import (
	"context"
	"database/sql"
	"fmt"
)

// Protect replaces plain-text tokens left by older versions with their hash
// and a sealed copy. Rows without a sealed copy are the unconverted ones, so it
// is safe to run on every start. Table and column names must be constants.
// When rows were converted the database file is rewritten, so the old values
// do not linger in free pages or the write-ahead log.
func Protect(ctx context.Context, db *sql.DB, vault *Vault, table, hashColumn, sealedColumn string) error {
	converted, err := protect(ctx, db, vault, table, hashColumn, sealedColumn)
	if err != nil || converted == 0 {
		return err
	}
	for _, statement := range []string{"VACUUM", "PRAGMA wal_checkpoint(TRUNCATE)"} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("scrub plain-text tokens: %w", err)
		}
	}
	return nil
}

func protect(ctx context.Context, db *sql.DB, vault *Vault, table, hashColumn, sealedColumn string) (int, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	rows, err := tx.QueryContext(ctx, fmt.Sprintf("SELECT id, %s FROM %s WHERE %s = ''", hashColumn, table, sealedColumn))
	if err != nil {
		return 0, err
	}
	plain := map[int64]string{}
	for rows.Next() {
		var id int64
		var token string
		if err := rows.Scan(&id, &token); err != nil {
			rows.Close()
			return 0, err
		}
		plain[id] = token
	}
	if err := rows.Close(); err != nil {
		return 0, err
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for id, token := range plain {
		sealed, err := vault.Seal(token)
		if err != nil {
			return 0, err
		}
		if _, err := tx.ExecContext(ctx,
			fmt.Sprintf("UPDATE %s SET %s = ?, %s = ? WHERE id = ?", table, hashColumn, sealedColumn),
			Hash(token), sealed, id); err != nil {
			return 0, err
		}
	}
	return len(plain), tx.Commit()
}
