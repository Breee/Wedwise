package invites

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/httpx"
)

// Handler exposes the protected invite link management endpoints.
type Handler struct {
	store *Store
	auth  *auth.Service
}

// NewHandler creates an invite link handler.
func NewHandler(store *Store, authService *auth.Service) *Handler {
	return &Handler{store: store, auth: authService}
}

type pinRequest struct {
	PIN string `json:"pin"`
}

type activeRequest struct {
	Active bool `json:"active"`
}

// Routes returns the management routes; all require invite.manage.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(h.auth.RequirePermission(auth.PermInviteManage))
	r.Get("/", h.list)
	r.Post("/", h.create)
	r.Put("/{id}/pin", h.setPIN)
	r.Put("/{id}/active", h.setActive)
	r.Post("/{id}/regenerate", h.regenerate)
	r.Delete("/{id}", h.delete)
	return r
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	links, err := h.store.List(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"links": links})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	link, err := h.store.Create(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, link)
}

func (h *Handler) setPIN(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var req pinRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	link, err := h.store.SetPIN(r.Context(), id, req.PIN)
	h.respond(w, link, err)
}

func (h *Handler) setActive(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var req activeRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	link, err := h.store.SetActive(r.Context(), id, req.Active)
	h.respond(w, link, err)
}

func (h *Handler) regenerate(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	link, err := h.store.Regenerate(r.Context(), id)
	h.respond(w, link, err)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := h.store.Delete(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) respond(w http.ResponseWriter, link Link, err error) {
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, link)
}

func parseID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid invite link id.")
		return 0, false
	}
	return id, true
}

func writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.NotFound(w, "Invite link not found.")
	case errors.Is(err, ErrValidation):
		httpx.BadRequest(w, err.Error())
	default:
		httpx.Internal(w, err)
	}
}
