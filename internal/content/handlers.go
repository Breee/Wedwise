package content

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/configuration"
	"github.com/Breee/Wedwise/internal/httpx"
	"github.com/Breee/Wedwise/internal/theme"
)

// Handler exposes content endpoints.
type Handler struct {
	store  *Store
	auth   *auth.Service
	event  configuration.EventConfig
	themes *theme.Registry
	// OnChange is called with the stored content after every update.
	OnChange func(Content)
}

// NewHandler creates a content handler.
func NewHandler(store *Store, authService *auth.Service, event configuration.EventConfig, themes *theme.Registry) *Handler {
	return &Handler{store: store, auth: authService, event: event, themes: themes}
}

type publicResponse struct {
	Event   configuration.EventConfig `json:"event"`
	Content Content                   `json:"content"`
	Theme   theme.Theme               `json:"theme"`
}

// ThemesHandler lists the available theme presets.
func (h *Handler) ThemesHandler(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"themes": h.themes.List()})
}

// PublicHandler serves the content of the public website.
func (h *Handler) PublicHandler(w http.ResponseWriter, r *http.Request) {
	current, err := h.store.Get(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, publicResponse{Event: h.event, Content: current, Theme: h.themes.Get(current.Theme)})
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
	if current.Theme != "" && !h.themes.Has(current.Theme) {
		httpx.BadRequest(w, "Unknown theme.")
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
	if h.OnChange != nil {
		h.OnChange(updated)
	}
	httpx.WriteJSON(w, http.StatusOK, updated)
}
