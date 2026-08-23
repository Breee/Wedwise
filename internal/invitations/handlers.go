package invitations

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/httpx"
)

// Handler exposes invitation endpoints.
type Handler struct {
	store   *Store
	auth    *auth.Service
	baseURL string
}

// NewHandler creates an invitation handler.
func NewHandler(store *Store, authService *auth.Service, baseURL string) *Handler {
	return &Handler{store: store, auth: authService, baseURL: baseURL}
}

type invitationRequest struct {
	Name      string `json:"name"`
	MaxGuests int    `json:"maxGuests"`
	Active    *bool  `json:"active"`
}

type invitationResponse struct {
	Invitation
	URL string `json:"url"`
}

// Routes returns the protected invitation routes.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.With(h.auth.RequirePermission(auth.PermInvitationRead)).Get("/", h.list)
	r.With(h.auth.RequirePermission(auth.PermInvitationWrite)).Post("/", h.create)
	r.With(h.auth.RequirePermission(auth.PermInvitationRead)).Get("/{id}", h.get)
	r.With(h.auth.RequirePermission(auth.PermInvitationWrite)).Put("/{id}", h.update)
	r.With(h.auth.RequirePermission(auth.PermInvitationWrite)).Delete("/{id}", h.delete)
	r.With(h.auth.RequirePermission(auth.PermInvitationWrite)).Post("/{id}/regenerate-token", h.regenerate)
	return r
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	all, err := h.store.List(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	response := make([]invitationResponse, 0, len(all))
	for _, invitation := range all {
		response = append(response, h.withURL(invitation))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"invitations": response})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req invitationRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	active := true
	if req.Active != nil {
		active = *req.Active
	}
	if req.MaxGuests == 0 {
		req.MaxGuests = 1
	}
	invitation, err := h.store.Create(r.Context(), req.Name, req.MaxGuests, active)
	if err != nil {
		h.writeStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, h.withURL(invitation))
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid invitation id.")
		return
	}
	invitation, err := h.store.GetByID(r.Context(), id)
	if err != nil {
		h.writeStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.withURL(invitation))
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid invitation id.")
		return
	}
	existing, err := h.store.GetByID(r.Context(), id)
	if err != nil {
		h.writeStoreError(w, err)
		return
	}

	req := invitationRequest{Name: existing.Name, MaxGuests: existing.MaxGuests}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	active := existing.Active
	if req.Active != nil {
		active = *req.Active
	}
	invitation, err := h.store.Update(r.Context(), id, req.Name, req.MaxGuests, active)
	if err != nil {
		h.writeStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.withURL(invitation))
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid invitation id.")
		return
	}
	if err := h.store.Delete(r.Context(), id); err != nil {
		h.writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) regenerate(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid invitation id.")
		return
	}
	invitation, err := h.store.RegenerateToken(r.Context(), id)
	if err != nil {
		h.writeStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.withURL(invitation))
}

func (h *Handler) withURL(invitation Invitation) invitationResponse {
	base := strings.TrimSuffix(h.baseURL, "/")
	return invitationResponse{Invitation: invitation, URL: base + "/rsvp/" + invitation.Token}
}

func (h *Handler) writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.NotFound(w, "Invitation not found.")
	case isValidationError(err):
		httpx.BadRequest(w, err.Error())
	default:
		httpx.Internal(w, err)
	}
}

func isValidationError(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "must not be empty") || strings.Contains(msg, "must be at least")
}
