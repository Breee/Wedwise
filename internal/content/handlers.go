package content

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/configuration"
	"github.com/Breee/Wedwise/internal/httpx"
)

// Handler exposes content endpoints.
type Handler struct {
	store *Store
	auth  *auth.Service
	event configuration.EventConfig
}

// NewHandler creates a content handler.
func NewHandler(store *Store, authService *auth.Service, event configuration.EventConfig) *Handler {
	return &Handler{store: store, auth: authService, event: event}
}

type publicResponse struct {
	Event   configuration.EventConfig `json:"event"`
	Content Content                   `json:"content"`
}

// PublicHandler serves the content of the public website.
func (h *Handler) PublicHandler(w http.ResponseWriter, r *http.Request) {
	current, err := h.store.Get(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, publicResponse{Event: h.event, Content: current})
}

// Routes returns the protected content routes.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.With(h.auth.RequirePermission(auth.PermContentRead)).Get("/", h.get)
	r.With(h.auth.RequirePermission(auth.PermContentWrite)).Put("/", h.replace)
	return r
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	current, err := h.store.Get(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, current)
}

func (h *Handler) replace(w http.ResponseWriter, r *http.Request) {
	current, err := h.store.Get(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	if !httpx.DecodeJSON(w, r, &current) {
		return
	}
	updated, err := h.store.Replace(r.Context(), current)
	if err != nil {
		if errors.Is(err, ErrValidation) {
			httpx.BadRequest(w, err.Error())
			return
		}
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, updated)
}
