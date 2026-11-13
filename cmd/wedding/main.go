// Command wedding runs the Wedwise backend and its administrative CLI.
package main

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/Breee/Wedwise/internal/sealed"

	"golang.org/x/term"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/configuration"
	"github.com/Breee/Wedwise/internal/database"
	"github.com/Breee/Wedwise/internal/server"
	"github.com/Breee/Wedwise/internal/users"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	if err := run(os.Args[1:]); err != nil {
		slog.Error("command failed", "error", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	command := "serve"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		command = args[0]
		args = args[1:]
	}

	switch command {
	case "serve":
		return runServe(args)
	case "migrate":
		return runMigrate(args)
	case "backup":
		return runBackup(args)
	case "restore":
		return runRestore(args)
	case "rekey":
		return runRekey(args)
	case "user":
		return runUser(args)
	case "help", "-h", "--help":
		usage()
		return nil
	default:
		usage()
		return fmt.Errorf("unknown command %q", command)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `Usage: wedding <command> [flags]

Commands:
  serve                              Start the HTTP server (default)
  migrate                            Apply pending database migrations
  backup <path>                      Write an encrypted database backup to <path>
  restore <path>                     Decrypt a backup into the configured database path
  rekey                              Re-encrypt guest data after changing DATA_KEY
  user create --username U --role R  Create a user (roles: couple, witness, admin)
  user list                          List all users
  user disable --username U          Deactivate a user
  user enable --username U           Reactivate a user
  user passwd --username U           Change the password of a user

Global flags:
  --config <path>   Path to the YAML configuration file (default: $CONFIG_PATH or config.yaml)
`)
}

func loadConfig(args []string, name string) (configuration.Config, []string, error) {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	configPath := fs.String("config", "", "path to the configuration file")
	if err := fs.Parse(args); err != nil {
		return configuration.Config{}, nil, err
	}
	cfg, err := configuration.Load(*configPath)
	return cfg, fs.Args(), err
}

func setup(args []string, name string) (configuration.Config, *sql.DB, []string, error) {
	cfg, rest, err := loadConfig(args, name)
	if err != nil {
		return configuration.Config{}, nil, nil, err
	}
	db, err := database.Open(cfg.DatabasePath)
	if err != nil {
		return configuration.Config{}, nil, nil, err
	}
	return cfg, db, rest, nil
}

func runServe(args []string) error {
	cfg, db, _, err := setup(args, "serve")
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if err := database.Migrate(ctx, db); err != nil {
		return err
	}
	if err := auth.NewSessionStore(db).DeleteExpired(ctx); err != nil {
		return err
	}

	srv, err := server.New(cfg, db)
	if err != nil {
		return err
	}

	httpServer := &http.Server{
		Addr:              cfg.ListenAddress,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("starting server", "address", cfg.ListenAddress, "baseUrl", cfg.BaseURL)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		slog.Info("shutdown signal received")
	}

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelShutdown()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	slog.Info("server stopped")
	return nil
}

func runMigrate(args []string) error {
	_, db, _, err := setup(args, "migrate")
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if err := database.Migrate(ctx, db); err != nil {
		return err
	}
	slog.Info("migrations up to date")
	return nil
}

// backupMagic starts every backup file, followed by the sealed database.
const backupMagic = "WEDWISE-BACKUP-1\n"

func runBackup(args []string) error {
	cfg, db, rest, err := setup(args, "backup")
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	if len(rest) != 1 {
		return errors.New("usage: wedding backup <path>")
	}
	destination := rest[0]
	if _, err := os.Stat(destination); err == nil {
		return fmt.Errorf("backup destination %s already exists", destination)
	}
	box, err := sealed.New(cfg.DataKey)
	if err != nil {
		return err
	}

	// SQLite can only write a plain copy, so it goes to a private directory
	// next to the destination and is removed once it is sealed.
	if err := os.MkdirAll(filepath.Dir(destination), 0o750); err != nil {
		return fmt.Errorf("create backup directory: %w", err)
	}
	workDir, err := os.MkdirTemp(filepath.Dir(destination), ".wedwise-backup-")
	if err != nil {
		return fmt.Errorf("create work directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(workDir) }()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	plainPath := filepath.Join(workDir, "plain.db")
	if err := database.Backup(ctx, db, plainPath); err != nil {
		return err
	}
	plain, err := os.ReadFile(plainPath)
	if err != nil {
		return fmt.Errorf("read backup: %w", err)
	}
	data, err := box.SealBytes(plain)
	if err != nil {
		return fmt.Errorf("encrypt backup: %w", err)
	}
	if err := os.WriteFile(destination, append([]byte(backupMagic), data...), 0o600); err != nil {
		return fmt.Errorf("write backup: %w", err)
	}
	slog.Info("encrypted backup written", "path", destination)
	return nil
}

func runRestore(args []string) error {
	cfg, rest, err := loadConfig(args, "restore")
	if err != nil {
		return err
	}
	if len(rest) != 1 {
		return errors.New("usage: wedding restore <path>")
	}
	if _, err := os.Stat(cfg.DatabasePath); err == nil {
		return fmt.Errorf("database %s already exists; move it away first", cfg.DatabasePath)
	}
	raw, err := os.ReadFile(rest[0])
	if err != nil {
		return fmt.Errorf("read backup: %w", err)
	}
	data, ok := bytes.CutPrefix(raw, []byte(backupMagic))
	if !ok {
		return errors.New("not a Wedwise backup file")
	}
	box, err := sealed.New(cfg.DataKey, cfg.DataKeyPrevious)
	if err != nil {
		return err
	}
	plain, _, err := box.OpenBytes(data)
	if err != nil {
		return fmt.Errorf("decrypt backup: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(cfg.DatabasePath), 0o750); err != nil {
		return fmt.Errorf("create database directory: %w", err)
	}
	if err := os.WriteFile(cfg.DatabasePath, plain, 0o600); err != nil {
		return fmt.Errorf("write database: %w", err)
	}
	slog.Info("backup restored", "path", cfg.DatabasePath)
	return nil
}

func runRekey(args []string) error {
	cfg, db, _, err := setup(args, "rekey")
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	if err := database.Migrate(ctx, db); err != nil {
		return err
	}
	box, err := sealed.New(cfg.DataKey, cfg.DataKeyPrevious)
	if err != nil {
		return err
	}
	count, err := box.Protect(ctx, db, server.SealedColumns())
	if err != nil {
		return err
	}
	slog.Info("guest data is encrypted with the current data key", "rewritten", count)
	return nil
}

func runUser(args []string) error {
	if len(args) == 0 {
		usage()
		return errors.New("missing user subcommand")
	}
	subcommand := args[0]
	args = args[1:]

	fs := flag.NewFlagSet("user "+subcommand, flag.ContinueOnError)
	configPath := fs.String("config", "", "path to the configuration file")
	username := fs.String("username", "", "username")
	email := fs.String("email", "", "email address")
	displayName := fs.String("display-name", "", "display name")
	role := fs.String("role", "", "role: couple, witness or admin")
	password := fs.String("password", "", "password (prompted when omitted)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := configuration.Load(*configPath)
	if err != nil {
		return err
	}
	db, err := database.Open(cfg.DatabasePath)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if err := database.Migrate(ctx, db); err != nil {
		return err
	}
	store := users.NewStore(db)

	switch subcommand {
	case "create":
		if *username == "" || *role == "" {
			return errors.New("usage: wedding user create --username U --role R [--email E] [--display-name D]")
		}
		secret := *password
		if secret == "" {
			secret, err = promptPassword("Password: ")
			if err != nil {
				return err
			}
		}
		user, err := store.Create(ctx, users.CreateParams{
			Username:    *username,
			Email:       *email,
			DisplayName: *displayName,
			Role:        *role,
			Password:    secret,
		})
		if err != nil {
			return err
		}
		fmt.Printf("created user %s (id %d, role %s)\n", user.Username, user.ID, user.Role)
		return nil

	case "list":
		all, err := store.List(ctx)
		if err != nil {
			return err
		}
		fmt.Printf("%-6s %-20s %-10s %-8s %s\n", "ID", "USERNAME", "ROLE", "ACTIVE", "EMAIL")
		for _, user := range all {
			fmt.Printf("%-6d %-20s %-10s %-8t %s\n", user.ID, user.Username, user.Role, user.Active, user.Email)
		}
		return nil

	case "disable", "enable":
		if *username == "" {
			return fmt.Errorf("usage: wedding user %s --username U", subcommand)
		}
		active := subcommand == "enable"
		if err := store.SetActive(ctx, *username, active); err != nil {
			return err
		}
		if !active {
			user, err := store.GetByUsername(ctx, *username)
			if err != nil {
				return err
			}
			if err := auth.NewSessionStore(db).DeleteByUser(ctx, user.ID); err != nil {
				return err
			}
		}
		fmt.Printf("user %s active=%t\n", users.NormalizeUsername(*username), active)
		return nil

	case "passwd":
		if *username == "" {
			return errors.New("usage: wedding user passwd --username U")
		}
		secret := *password
		if secret == "" {
			secret, err = promptPassword("New password: ")
			if err != nil {
				return err
			}
		}
		if err := store.SetPassword(ctx, *username, secret); err != nil {
			return err
		}
		user, err := store.GetByUsername(ctx, *username)
		if err != nil {
			return err
		}
		if err := auth.NewSessionStore(db).DeleteByUser(ctx, user.ID); err != nil {
			return err
		}
		fmt.Printf("password updated for %s\n", user.Username)
		return nil

	default:
		usage()
		return fmt.Errorf("unknown user subcommand %q", subcommand)
	}
}

func promptPassword(prompt string) (string, error) {
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return "", errors.New("no terminal available: pass --password instead")
	}
	fmt.Fprint(os.Stderr, prompt)
	secret, err := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", fmt.Errorf("read password: %w", err)
	}

	fmt.Fprint(os.Stderr, "Repeat password: ")
	confirm, err := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", fmt.Errorf("read password: %w", err)
	}
	if string(secret) != string(confirm) {
		return "", errors.New("passwords do not match")
	}
	return string(secret), nil
}
