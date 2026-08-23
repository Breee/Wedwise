package contributions

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/httpx"
)

// Handler exposes contribution endpoints.
//
// All routes require contribution permissions, which the couple role does not
// have; requests from the couple therefore receive 403.
type Handler struct {
	store *Store
	auth  *auth.Service
}

// NewHandler creates a contribution handler.
func NewHandler(store *Store, authService *auth.Service) *Handler {
	return &Handler{store: store, auth: authService}
}

// Request is the payload accepted when creating or updating a contribution.
type Request struct {
	Title                 string `json:"title"`
	Category              string `json:"category"`
	Description           string `json:"description"`
	Participants          string `json:"participants"`
	DurationMinutes       int    `json:"durationMinutes"`
	TechnicalRequirements string `json:"technicalRequirements"`
	Equipment             string `json:"equipment"`
	PreferredTime         string `json:"preferredTime"`
	ContactInformation    string `json:"contactInformation"`
	Status                string `json:"status"`
}

// ToParams converts the request into store parameters for the given invitation.
func (req Request) ToParams(invitationID int64) Params {
	return Params{
		InvitationID:          invitationID,
		Title:                 req.Title,
		Category:              req.Category,
		Description:           req.Description,
		Participants:          req.Participants,
		DurationMinutes:       req.DurationMinutes,
		TechnicalRequirements: req.TechnicalRequirements,
		Equipment:             req.Equipment,
		PreferredTime:         req.PreferredTime,
		ContactInformation:    req.ContactInformation,
		Status:                req.Status,
	}
}

type noteRequest struct {
	Text string `json:"text"`
}

type contributionDetail struct {
	Contribution
	Notes []ContributionNote `json:"notes"`
}

// Routes returns the protected contribution routes.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.With(h.auth.RequirePermission(auth.PermContributionRead)).Get("/", h.list)
	r.With(h.auth.RequirePermission(auth.PermContributionRead)).Get("/{id}", h.get)
	r.With(h.auth.RequirePermission(auth.PermContributionManage)).Put("/{id}", h.update)
	r.With(h.auth.RequirePermission(auth.PermContributionManage)).Post("/{id}/notes", h.addNote)
	return r
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	all, err := h.store.List(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		WriteStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"contributions": all})
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid contribution id.")
		return
	}
	contribution, err := h.store.GetByID(r.Context(), id)
	if err != nil {
		WriteStoreError(w, err)
		return
	}
	notes, err := h.store.Notes(r.Context(), id)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, contributionDetail{Contribution: contribution, Notes: notes})
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid contribution id.")
		return
	}
	existing, err := h.store.GetByID(r.Context(), id)
	if err != nil {
		WriteStoreError(w, err)
		return
	}

	req := Request{
		Title:                 existing.Title,
		Category:              existing.Category,
		Description:           existing.Description,
		Participants:          existing.Participants,
		DurationMinutes:       existing.DurationMinutes,
		TechnicalRequirements: existing.TechnicalRequirements,
		Equipment:             existing.Equipment,
		PreferredTime:         existing.PreferredTime,
		ContactInformation:    existing.ContactInformation,
		Status:                existing.Status,
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}

	contribution, err := h.store.Update(r.Context(), id, req.ToParams(existing.InvitationID))
	if err != nil {
		WriteStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, contribution)
}

func (h *Handler) addNote(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid contribution id.")
		return
	}
	identity, ok := auth.IdentityFrom(r.Context())
	if !ok {
		httpx.Unauthorized(w)
		return
	}

	var req noteRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	note, err := h.store.AddNote(r.Context(), id, identity.ID, req.Text)
	if err != nil {
		WriteStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, note)
}

// WriteStoreError maps store errors to API responses.
func WriteStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.NotFound(w, "Contribution not found.")
	case errors.Is(err, ErrValidation):
		httpx.BadRequest(w, err.Error())
	default:
		httpx.Internal(w, err)
	}
}
