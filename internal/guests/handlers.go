package guests

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/httpx"
)

// Handler exposes guest endpoints.
type Handler struct {
	store *Store
	auth  *auth.Service
}

// NewHandler creates a guest handler.
func NewHandler(store *Store, authService *auth.Service) *Handler {
	return &Handler{store: store, auth: authService}
}

type guestRequest struct {
	DisplayName  string `json:"displayName"`
	Email        string `json:"email"`
	InvitationID int64  `json:"invitationId"`
	Notes        string `json:"notes"`
}

// Routes returns the protected guest routes.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.With(h.auth.RequirePermission(auth.PermGuestRead)).Get("/", h.list)
	r.With(h.auth.RequirePermission(auth.PermGuestWrite)).Post("/", h.create)
	r.With(h.auth.RequirePermission(auth.PermGuestRead)).Get("/{id}", h.get)
	r.With(h.auth.RequirePermission(auth.PermGuestWrite)).Put("/{id}", h.update)
	r.With(h.auth.RequirePermission(auth.PermGuestWrite)).Delete("/{id}", h.delete)
	return r
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	var invitationID int64
	if raw := r.URL.Query().Get("invitationId"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed <= 0 {
			httpx.BadRequest(w, "Invalid invitationId filter.")
			return
		}
		invitationID = parsed
	}

	all, err := h.store.List(r.Context(), invitationID)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"guests": all})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req guestRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	guest, err := h.store.Create(r.Context(), Params(req))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, guest)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid guest id.")
		return
	}
	guest, err := h.store.GetByID(r.Context(), id)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, guest)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid guest id.")
		return
	}
	existing, err := h.store.GetByID(r.Context(), id)
	if err != nil {
		writeStoreError(w, err)
		return
	}

	req := guestRequest{
		DisplayName:  existing.DisplayName,
		Email:        existing.Email,
		InvitationID: existing.InvitationID,
		Notes:        existing.Notes,
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	guest, err := h.store.Update(r.Context(), id, Params(req))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, guest)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid guest id.")
		return
	}
	if err := h.store.Delete(r.Context(), id); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.NotFound(w, "Guest not found.")
	case errors.Is(err, ErrValidation):
		httpx.BadRequest(w, err.Error())
	case errors.Is(err, ErrInvalidInvitation):
		httpx.BadRequest(w, "The referenced invitation does not exist.")
	default:
		httpx.Internal(w, err)
	}
}
