package database

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"log/slog"
	"path"
	"sort"
	"strconv"
	"strings"

	"github.com/Breee/Wedwise/migrations"
)

// Migrate applies all pending migrations from the embedded migrations directory.
func Migrate(ctx context.Context, db *sql.DB) error {
	return MigrateFS(ctx, db, migrations.FS, ".")
}

// MigrateFS applies all pending migrations found in dir of the given filesystem.
func MigrateFS(ctx context.Context, db *sql.DB, fsys fs.FS, dir string) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	applied, err := appliedVersions(ctx, db)
	if err != nil {
		return err
	}

	files, err := migrationFiles(fsys, dir)
	if err != nil {
		return err
	}

	for _, file := range files {
		if applied[file.version] {
			continue
		}
		contents, err := fs.ReadFile(fsys, file.path)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", file.name, err)
		}
		if err := applyMigration(ctx, db, file, string(contents)); err != nil {
			return err
		}
		slog.Info("applied migration", "version", file.version, "name", file.name)
	}
	return nil
}

type migrationFile struct {
	version int
	name    string
	path    string
}

func appliedVersions(ctx context.Context, db *sql.DB) (map[int]bool, error) {
	rows, err := db.QueryContext(ctx, "SELECT version FROM schema_migrations")
	if err != nil {
		return nil, fmt.Errorf("query schema_migrations: %w", err)
	}
	defer rows.Close()

	applied := make(map[int]bool)
	for rows.Next() {
		var version int
		if err := rows.Scan(&version); err != nil {
			return nil, fmt.Errorf("scan schema_migrations: %w", err)
		}
		applied[version] = true
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate schema_migrations: %w", err)
	}
	return applied, nil
}

func migrationFiles(fsys fs.FS, dir string) ([]migrationFile, error) {
	entries, err := fs.ReadDir(fsys, dir)
	if err != nil {
		return nil, fmt.Errorf("read migrations directory: %w", err)
	}

	var files []migrationFile
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		name := entry.Name()
		prefix, _, ok := strings.Cut(name, "_")
		if !ok {
			return nil, fmt.Errorf("migration %s does not follow the NNN_name.sql convention", name)
		}
		version, err := strconv.Atoi(prefix)
		if err != nil {
			return nil, fmt.Errorf("migration %s has an invalid version prefix: %w", name, err)
		}
		files = append(files, migrationFile{version: version, name: name, path: path.Join(dir, name)})
	}

	sort.Slice(files, func(i, j int) bool { return files[i].version < files[j].version })
	for i := 1; i < len(files); i++ {
		if files[i].version == files[i-1].version {
			return nil, fmt.Errorf("duplicate migration version %d", files[i].version)
		}
	}
	return files, nil
}

func applyMigration(ctx context.Context, db *sql.DB, file migrationFile, contents string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", file.name, err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, contents); err != nil {
		return fmt.Errorf("execute migration %s: %w", file.name, err)
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO schema_migrations (version, name) VALUES (?, ?)", file.version, file.name); err != nil {
		return fmt.Errorf("record migration %s: %w", file.name, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration %s: %w", file.name, err)
	}
	return nil
}
