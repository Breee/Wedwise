// Package server wires the HTTP routes of the application together.
package server

import (
	"database/sql"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/configuration"
	"github.com/Breee/Wedwise/internal/content"
	"github.com/Breee/Wedwise/internal/contributions"
	"github.com/Breee/Wedwise/internal/guests"
	"github.com/Breee/Wedwise/internal/httpx"
	"github.com/Breee/Wedwise/internal/invitations"
	"github.com/Breee/Wedwise/internal/middleware"
	"github.com/Breee/Wedwise/internal/rsvp"
	"github.com/Breee/Wedwise/internal/users"
	"github.com/Breee/Wedwise/web"
)

// Server holds the application dependencies.
type Server struct {
	cfg    configuration.Config
	db     *sql.DB
	auth   *auth.Service
	router http.Handler
}

// New creates a fully wired server.
func New(cfg configuration.Config, db *sql.DB) (*Server, error) {
	userStore := users.NewStore(db)
	sessionStore := auth.NewSessionStore(db)
	authService := auth.NewService(sessionStore, userStore, cfg.IsProduction(), cfg.BaseURL)

	invitationStore := invitations.NewStore(db)
	guestStore := guests.NewStore(db)
	rsvpStore := rsvp.NewStore(db)
	contributionStore := contributions.NewStore(db)
	contentStore := content.NewStore(db)

	userHandler := users.NewHandler(userStore, authService)
	guestHandler := guests.NewHandler(guestStore, authService)
	invitationHandler := invitations.NewHandler(invitationStore, authService, cfg.BaseURL)
	rsvpHandler := rsvp.NewHandler(rsvpStore, invitationStore, contributionStore, authService)
	contributionHandler := contributions.NewHandler(contributionStore, authService)
	contentHandler := content.NewHandler(contentStore, authService, cfg.Event)

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

	r.Route("/api", func(api chi.Router) {
		api.Mount("/auth", authService.Routes())
		api.Mount("/rsvp", rsvpHandler.PublicRoutes())
		api.Get("/content/public", contentHandler.PublicHandler)

		api.Group(func(protected chi.Router) {
			protected.Use(authService.RequireAuth)
			protected.Mount("/guests", guestHandler.Routes())
			protected.Mount("/invitations", invitationHandler.Routes())
			protected.Mount("/contributions", contributionHandler.Routes())
			protected.Mount("/content", contentHandler.Routes())
			protected.Mount("/users", userHandler.Routes())
			protected.With(authService.RequirePermission(auth.PermRSVPRead)).
				Get("/rsvp-summary", rsvpHandler.SummaryHandler)
		})

		api.NotFound(func(w http.ResponseWriter, r *http.Request) {
			httpx.NotFound(w, "The requested API endpoint does not exist.")
		})
	})

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
