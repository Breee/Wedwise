package sealed

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// Columns names the sealed columns of a table. The table needs an id column.
type Columns struct {
	Table   string
	Columns []string
}

// Protect seals every value that is still plain text or sealed with a previous
// key, and reports how many values it rewrote. It is safe to run on every
// start. A value that no known key opens aborts the run without changes.
// Table and column names must be constants. When values were rewritten the
// database file is rewritten too, so old values do not linger in free pages
// or the write-ahead log.
func (b *Box) Protect(ctx context.Context, db *sql.DB, targets []Columns) (int, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	total := 0
	for _, target := range targets {
		n, err := b.protect(ctx, tx, target)
		if err != nil {
			return 0, fmt.Errorf("%s: %w", target.Table, err)
		}
		total += n
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	if total == 0 {
		return 0, nil
	}
	for _, statement := range []string{"VACUUM", "PRAGMA wal_checkpoint(TRUNCATE)"} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return 0, fmt.Errorf("scrub old values: %w", err)
		}
	}
	return total, nil
}

func (b *Box) protect(ctx context.Context, tx *sql.Tx, target Columns) (int, error) {
	rows, err := tx.QueryContext(ctx, "SELECT rowid, "+strings.Join(target.Columns, ", ")+" FROM "+target.Table)
	if err != nil {
		return 0, err
	}
	type change struct {
		id     int64
		column string
		value  string
	}
	var changes []change
	for rows.Next() {
		var id int64
		values := make([]string, len(target.Columns))
		dest := []any{&id}
		for i := range values {
			dest = append(dest, &values[i])
		}
		if err := rows.Scan(dest...); err != nil {
			rows.Close()
			return 0, err
		}
		for i, value := range values {
			plain, current, err := b.open(value)
			if err != nil {
				rows.Close()
				return 0, fmt.Errorf("%s of row %d: %w", target.Columns[i], id, err)
			}
			if current || plain == "" {
				continue
			}
			sealed, err := b.Seal(plain)
			if err != nil {
				rows.Close()
				return 0, err
			}
			changes = append(changes, change{id: id, column: target.Columns[i], value: sealed})
		}
	}
	if err := rows.Close(); err != nil {
		return 0, err
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, c := range changes {
		if _, err := tx.ExecContext(ctx, "UPDATE "+target.Table+" SET "+c.column+" = ? WHERE rowid = ?", c.value, c.id); err != nil {
			return 0, err
		}
	}
	return len(changes), nil
}
