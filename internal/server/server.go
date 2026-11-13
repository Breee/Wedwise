// Package server wires the HTTP routes of the application together.
package server

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/Breee/Wedwise/internal/sealed"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/configuration"
	"github.com/Breee/Wedwise/internal/content"
	"github.com/Breee/Wedwise/internal/contributions"
	"github.com/Breee/Wedwise/internal/httpx"
	"github.com/Breee/Wedwise/internal/invites"
	"github.com/Breee/Wedwise/internal/middleware"
	"github.com/Breee/Wedwise/internal/push"
	"github.com/Breee/Wedwise/internal/routing"
	"github.com/Breee/Wedwise/internal/rsvp"
	"github.com/Breee/Wedwise/internal/songs"
	"github.com/Breee/Wedwise/internal/theme"
	"github.com/Breee/Wedwise/internal/tokens"
	"github.com/Breee/Wedwise/internal/twofactor"
	"github.com/Breee/Wedwise/internal/uploads"
	"github.com/Breee/Wedwise/internal/users"
	"github.com/Breee/Wedwise/web"
)

// Requests per client IP and minute before the endpoint answers 429.
const (
	loginRateLimit = 10
	rsvpRateLimit  = 30
	routeRateLimit = 60
)

// Server holds the application dependencies.
type Server struct {
	cfg    configuration.Config
	db     *sql.DB
	auth   *auth.Service
	router http.Handler
}

// SealedColumns lists every column that is encrypted with the data key.
func SealedColumns() []sealed.Columns {
	return append(append([]sealed.Columns{}, rsvp.SealedColumns...), contributions.SealedColumns...)
}

// New creates a fully wired server.
func New(cfg configuration.Config, db *sql.DB) (*Server, error) {
	uploadsDir := cfg.UploadsPath
	if uploadsDir == "" {
		uploadsDir = filepath.Join(filepath.Dir(cfg.DatabasePath), "uploads")
	}
	userStore := users.NewStore(db)
	sessionStore := auth.NewSessionStore(db)
	maxAge, idle, err := cfg.Auth.Timeouts()
	if err != nil {
		return nil, err
	}
	sessionStore.SetTimeouts(maxAge, idle)
	authService := auth.NewService(sessionStore, userStore, cfg.IsProduction(), cfg.BaseURL)
	authService.RequireTwoFactor(cfg.Auth.RequireTwoFactor)
	authService.SetLockouts(auth.NewLockouts(db))

	twoFactorStore, err := twofactor.NewStore(db, cfg.SessionSecret, "Wedwise")
	if err != nil {
		return nil, err
	}
	keys, err := twofactor.NewKeys(db, cfg.BaseURL, cfg.Event.Title)
	if err != nil {
		return nil, err
	}
	twoFactorStore.SetKeys(keys)
	authService.SetSecondFactor(twoFactorStore)
	twoFactorHandler := twofactor.NewHandler(twoFactorStore, authService)

	box, err := sealed.New(cfg.DataKey, cfg.DataKeyPrevious)
	if err != nil {
		return nil, err
	}
	if _, err := box.Protect(context.Background(), db, SealedColumns()); err != nil {
		return nil, fmt.Errorf("protect guest data: %w", err)
	}
	contributionStore := contributions.NewStore(db, box)
	inviteVault, err := tokens.NewVault(cfg.SessionSecret, "invite-token")
	if err != nil {
		return nil, err
	}
	editVault, err := tokens.NewVault(cfg.SessionSecret, "edit-token")
	if err != nil {
		return nil, err
	}
	rsvpStore := rsvp.NewStore(db, contributionStore, editVault, box)
	contentStore := content.NewStore(db)
	inviteStore := invites.NewStore(db, inviteVault)
	if err := inviteStore.ProtectTokens(context.Background()); err != nil {
		return nil, fmt.Errorf("protect invite tokens: %w", err)
	}
	if err := rsvpStore.ProtectTokens(context.Background()); err != nil {
		return nil, fmt.Errorf("protect edit tokens: %w", err)
	}
	inviteGate := invites.NewGate(cfg.SessionSecret, cfg.IsProduction())

	userHandler := users.NewHandler(userStore, authService, cfg.BaseURL)
	userHandler.SetPasskeys(keys)
	rsvpHandler := rsvp.NewHandler(rsvpStore, contributionStore, inviteStore, inviteGate,
		middleware.NewStoredLimiter(db, "pin", rsvp.PINFailureLimit, rsvp.PINFailureWindow))
	pushService, err := push.NewService(context.Background(), db, cfg.BaseURL)
	if err != nil {
		return nil, err
	}
	pushHandler := push.NewHandler(pushService)
	english := cfg.Event.Language == "en"
	rsvpHandler.OnResponse(func(response rsvp.Response, withContribution bool) {
		title, body := "Neue Rückmeldung", response.ContactName+" hat zugesagt."
		if response.Status != rsvp.StatusYes {
			body = response.ContactName + " hat abgesagt."
		}
		if english {
			title, body = "New response", response.ContactName+" is coming."
			if response.Status != rsvp.StatusYes {
				body = response.ContactName + " cannot come."
			}
		}
		pushService.Notify(push.TopicResponses, push.Message{Title: title, Body: body, URL: "/dashboard"})
		if withContribution {
			title, body = "Neuer Beitrag", response.ContactName+" möchte etwas beitragen."
			if english {
				title, body = "New contribution", response.ContactName+" would like to contribute."
			}
			pushService.Notify(push.TopicContributions, push.Message{Title: title, Body: body, URL: "/witness/dashboard"})
		}
	})
	inviteHandler := invites.NewHandler(inviteStore, authService)
	contributionHandler := contributions.NewHandler(contributionStore, authService)
	themes, err := theme.Load(cfg.ThemePath)
	if err != nil {
		return nil, err
	}
	if cfg.UsersPath != "" {
		changed, err := userStore.Seed(context.Background(), cfg.UsersPath)
		if err != nil {
			return nil, err
		}
		if changed > 0 {
			slog.Info("users applied from file", "path", cfg.UsersPath, "changed", changed)
		}
	}
	if cfg.ContentPath != "" {
		applied, err := contentStore.Seed(context.Background(), cfg.ContentPath)
		if err != nil {
			return nil, err
		}
		if applied {
			slog.Info("content applied from file", "path", cfg.ContentPath)
		}
	}
	contentHandler := content.NewHandler(contentStore, authService, cfg.Event, themes)

	loginLimit := middleware.RateLimit(middleware.NewStoredLimiter(db, "login", loginRateLimit, time.Minute), cfg.TrustProxy())
	rsvpLimit := middleware.RateLimit(middleware.NewStoredLimiter(db, "rsvp", rsvpRateLimit, time.Minute), cfg.TrustProxy())
	routeLimit := middleware.RateLimit(middleware.NewStoredLimiter(db, "route", routeRateLimit, time.Minute), cfg.TrustProxy())

	spa, err := spaHandler()
	if err != nil {
		return nil, err
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Logging)
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.LimitBody)
	r.Use(authService.Authenticate)
	r.Use(authService.CSRF)

	r.Get("/healthz", healthz)
	r.Get("/readyz", readyz(db))
	r.Get("/manifest.webmanifest", manifestHandler(cfg.Event))

	r.Route("/api", func(api chi.Router) {
		api.Mount("/auth", authService.Routes(loginLimit))
		api.Mount("/setup", userHandler.SetupRoutes(loginLimit))
		api.Mount("/rsvp", rsvpHandler.PublicRoutes(rsvpLimit))
		api.Get("/push/key", pushHandler.Key)
		api.Get("/messages", pushHandler.Messages)
		api.With(rsvpLimit).Post("/push/subscriptions", pushHandler.Subscribe)
		api.With(rsvpLimit).Post("/push/status", pushHandler.Status)
		api.Get("/content/public", contentHandler.PublicHandler)
		api.Get("/themes", contentHandler.ThemesHandler)
		api.With(routeLimit).Method(http.MethodGet, "/route", routing.NewHandler(cfg.RoutingAPIKey, db))
		api.With(routeLimit).Method(http.MethodGet, "/songs", songs.NewHandler())

		api.Group(func(protected chi.Router) {
			protected.Use(authService.RequireAuth)
			protected.Mount("/contributions", contributionHandler.Routes())
			protected.Mount("/content", contentHandler.Routes())
			protected.Mount("/users", userHandler.Routes())
			protected.Mount("/account/2fa", twoFactorHandler.Routes())
			protected.With(authService.RequirePermission(auth.PermUserManage)).
				Delete("/two-factor/{id}", twoFactorHandler.Reset)
			protected.Mount("/invite-links", inviteHandler.Routes())
			protected.With(authService.RequirePermission(auth.PermRSVPRead)).
				Get("/rsvp-summary", rsvpHandler.SummaryHandler)
			protected.With(authService.RequirePermission(auth.PermContentWrite)).
				Method(http.MethodPost, "/uploads", uploads.NewHandler(uploadsDir))
			protected.Mount("/responses", rsvpHandler.StaffRoutes(authService))
			protected.With(authService.RequirePermission(auth.PermContentWrite)).
				Post("/push/broadcast", pushHandler.Broadcast)
			protected.With(authService.RequirePermission(auth.PermContentWrite)).
				Delete("/messages/{id}", pushHandler.DeleteMessage)
		})

		api.NotFound(func(w http.ResponseWriter, r *http.Request) {
			httpx.NotFound(w, "The requested API endpoint does not exist.")
		})
	})

	r.Handle(uploads.URLPrefix+"*", http.StripPrefix(uploads.URLPrefix, imagesHandler(uploadsDir)))
	if cfg.ImagesPath != "" {
		r.Handle("/images/*", http.StripPrefix("/images/", imagesHandler(cfg.ImagesPath)))
	}

	r.NotFound(spa)

	return &Server{cfg: cfg, db: db, auth: authService, router: r}, nil
}

// Handler returns the root HTTP handler.
func (s *Server) Handler() http.Handler { return s.router }

func healthz(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func readyz(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			httpx.WriteError(w, http.StatusServiceUnavailable, "unavailable", "The database is not reachable.")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	}
}

// spaHandler serves the embedded single page application with index fallback.
func spaHandler() (http.HandlerFunc, error) {
	dist, err := web.DistFS()
	if err != nil {
		return nil, err
	}
	fileServer := http.FileServer(http.FS(dist))

	index, err := fs.ReadFile(dist, "index.html")
	if err != nil {
		// The frontend has not been built yet; serve a minimal placeholder so
		// that the API stays usable during development.
		index = []byte(placeholderIndex)
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			httpx.WriteError(w, http.StatusMethodNotAllowed, httpx.CodeBadRequest, "Method not allowed.")
			return
		}

		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name != "" && name != "." {
			if file, err := dist.Open(name); err == nil {
				info, statErr := file.Stat()
				_ = file.Close()
				if statErr == nil && !info.IsDir() {
					fileServer.ServeHTTP(w, r)
					return
				}
			}
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		if r.Method == http.MethodHead {
			return
		}
		_, _ = w.Write(index)
	}, nil
}

const placeholderIndex = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Wedwise</title>
  </head>
  <body>
    <h1>Wedwise</h1>
    <p>The frontend has not been built yet. Run <code>make build</code> to build it.</p>
  </body>
</html>
`

// imagesHandler serves files from dir without directory listings.
func imagesHandler(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "" || strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		files.ServeHTTP(w, r)
	})
}
