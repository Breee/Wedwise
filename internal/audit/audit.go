// Package audit keeps an append-only record of staff actions.
package audit

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/httpx"
)

const (
	// ActionLogin, ActionLoginFailed and ActionLogout are recorded by the
	// login routes; ActionLinkCopy is reported by the staff pages.
	ActionLogin       = "login"
	ActionLoginFailed = "login.failed"
	ActionLogout      = "logout"
	ActionLinkCopy    = "link.copy"

	maxFieldLen  = 200
	defaultLimit = 100
	maxLimit     = 500
)

// Entry is one recorded action. It names the actor and the target, never the
// content of a change.
type Entry struct {
	ID       int64     `json:"id"`
	At       time.Time `json:"at"`
	UserID   int64     `json:"userId"`
	Username string    `json:"username"`
	Action   string    `json:"action"`
	Target   string    `json:"target"`
}

// Store writes and reads the audit log.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// NewStore returns a store backed by db.
func NewStore(db *sql.DB) *Store {
	return &Store{db: db, now: time.Now}
}

// Record appends an entry. Failures are logged and never fail the request
// that caused them.
func (s *Store) Record(ctx context.Context, userID int64, username, action, target string) {
	_, err := s.db.ExecContext(context.WithoutCancel(ctx),
		`INSERT INTO audit_log (at, user_id, username, action, target) VALUES (?, ?, ?, ?, ?)`,
		s.now().UTC().Format(time.RFC3339), userID, clip(username), clip(action), clip(target))
	if err != nil {
		slog.Error("audit log write failed", "action", action, "error", err)
	}
}

// List returns the newest entries, optionally only those older than before.
func (s *Store) List(ctx context.Context, limit int, before int64) ([]Entry, error) {
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	query := `SELECT id, at, user_id, username, action, target FROM audit_log`
	args := []any{}
	if before > 0 {
		query += ` WHERE id < ?`
		args = append(args, before)
	}
	query += ` ORDER BY id DESC LIMIT ?`
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []Entry{}
	for rows.Next() {
		var e Entry
		var at string
		if err := rows.Scan(&e.ID, &at, &e.UserID, &e.Username, &e.Action, &e.Target); err != nil {
			return nil, err
		}
		e.At, _ = time.Parse(time.RFC3339, at)
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

func clip(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > maxFieldLen {
		value = value[:maxFieldLen]
	}
	return value
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// Middleware records every successful change made by a signed-in user as
// "METHOD route" with the route parameters as target.
func (s *Store) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		rec := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		if rec.status >= http.StatusBadRequest {
			return
		}
		identity, ok := auth.IdentityFrom(r.Context())
		if !ok {
			return
		}
		route := chi.RouteContext(r.Context())
		if route == nil || route.RoutePattern() == eventsPattern {
			return
		}
		s.Record(r.Context(), identity.ID, identity.Username, r.Method+" "+route.RoutePattern(), params(route))
	})
}

func params(route *chi.Context) string {
	parts := []string{}
	for i, key := range route.URLParams.Keys {
		if key == "*" || i >= len(route.URLParams.Values) {
			continue
		}
		parts = append(parts, key+"="+route.URLParams.Values[i])
	}
	return strings.Join(parts, " ")
}

const eventsPattern = "/api/audit-log/events"

// Handler serves the audit log.
type Handler struct {
	store *Store
	auth  *auth.Service
}

// NewHandler returns the audit log handler.
func NewHandler(store *Store, authService *auth.Service) *Handler {
	return &Handler{store: store, auth: authService}
}

// Routes lists the log for admins and lets staff pages report link copies.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.With(h.auth.RequirePermission(auth.PermUserManage)).Get("/", h.list)
	r.Post("/events", h.event)
	return r
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
	entries, err := h.store.List(r.Context(), limit, before)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

var copyTargets = map[string]bool{"invite-link": true, "response": true}

type eventRequest struct {
	Action string `json:"action"`
	Kind   string `json:"kind"`
	ID     int64  `json:"id"`
}

func (h *Handler) event(w http.ResponseWriter, r *http.Request) {
	var req eventRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.Action != ActionLinkCopy || !copyTargets[req.Kind] || req.ID <= 0 {
		httpx.BadRequest(w, "Unknown event.")
		return
	}
	identity, _ := auth.IdentityFrom(r.Context())
	h.store.Record(r.Context(), identity.ID, identity.Username, ActionLinkCopy, req.Kind+"="+strconv.FormatInt(req.ID, 10))
	w.WriteHeader(http.StatusNoContent)
}
