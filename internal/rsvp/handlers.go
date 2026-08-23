package rsvp

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/contributions"
	"github.com/Breee/Wedwise/internal/httpx"
	"github.com/Breee/Wedwise/internal/invitations"
)

// Handler exposes the public token based RSVP endpoints and the protected
// RSVP summary endpoint.
type Handler struct {
	store         *Store
	invitations   *invitations.Store
	contributions *contributions.Store
	auth          *auth.Service
}

// NewHandler creates an RSVP handler.
func NewHandler(store *Store, invitationStore *invitations.Store, contributionStore *contributions.Store, authService *auth.Service) *Handler {
	return &Handler{store: store, invitations: invitationStore, contributions: contributionStore, auth: authService}
}

type attendeeRequest struct {
	Name      string `json:"name"`
	Attending bool   `json:"attending"`
	IsChild   bool   `json:"isChild"`
	Diet      string `json:"diet"`
	Allergies string `json:"allergies"`
	Notes     string `json:"notes"`
}

type submitRequest struct {
	Status    string            `json:"status"`
	Message   string            `json:"message"`
	Attendees []attendeeRequest `json:"attendees"`
}

type invitationView struct {
	Name      string `json:"name"`
	MaxGuests int    `json:"maxGuests"`
	Token     string `json:"token"`
}

type rsvpView struct {
	Invitation invitationView `json:"invitation"`
	Status     string         `json:"status"`
	Message    string         `json:"message"`
	Attendees  []Attendee     `json:"attendees"`
	Submitted  bool           `json:"submitted"`
}

// PublicRoutes returns the token authenticated RSVP routes.
func (h *Handler) PublicRoutes() http.Handler {
	r := chi.NewRouter()
	r.Get("/{token}", h.get)
	r.Put("/{token}", h.submit)
	r.Post("/{token}/contributions", h.submitContribution)
	return r
}

// SummaryHandler returns aggregated RSVP statistics without contribution data.
func (h *Handler) SummaryHandler(w http.ResponseWriter, r *http.Request) {
	summary, err := h.store.Summarize(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, summary)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	invitation, ok := h.resolveInvitation(w, r)
	if !ok {
		return
	}

	view := rsvpView{
		Invitation: invitationView{Name: invitation.Name, MaxGuests: invitation.MaxGuests, Token: invitation.Token},
		Status:     StatusPending,
		Attendees:  []Attendee{},
	}

	response, err := h.store.Get(r.Context(), invitation.ID)
	switch {
	case err == nil:
		view.Status = response.Status
		view.Message = response.Message
		view.Submitted = true
	case errors.Is(err, ErrNotFound):
		// No response submitted yet.
	default:
		httpx.Internal(w, err)
		return
	}

	attendees, err := h.store.Attendees(r.Context(), invitation.ID)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	view.Attendees = attendees
	httpx.WriteJSON(w, http.StatusOK, view)
}

func (h *Handler) submit(w http.ResponseWriter, r *http.Request) {
	invitation, ok := h.resolveInvitation(w, r)
	if !ok {
		return
	}

	var req submitRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}

	params := SubmitParams{Status: req.Status, Message: req.Message}
	for _, attendee := range req.Attendees {
		params.Attendees = append(params.Attendees, AttendeeInput(attendee))
	}

	response, attendees, err := h.store.Submit(r.Context(), invitation.ID, invitation.MaxGuests, params)
	if err != nil {
		if errors.Is(err, ErrValidation) {
			httpx.BadRequest(w, err.Error())
			return
		}
		httpx.Internal(w, err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, rsvpView{
		Invitation: invitationView{Name: invitation.Name, MaxGuests: invitation.MaxGuests, Token: invitation.Token},
		Status:     response.Status,
		Message:    response.Message,
		Attendees:  attendees,
		Submitted:  true,
	})
}

func (h *Handler) submitContribution(w http.ResponseWriter, r *http.Request) {
	invitation, ok := h.resolveInvitation(w, r)
	if !ok {
		return
	}

	var req contributions.Request
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	// Guests may not choose the workflow status of their contribution.
	req.Status = contributions.StatusNew

	contribution, err := h.contributions.Create(r.Context(), req.ToParams(invitation.ID))
	if err != nil {
		contributions.WriteStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"id":      contribution.ID,
		"title":   contribution.Title,
		"status":  contribution.Status,
		"success": true,
	})
}

func (h *Handler) resolveInvitation(w http.ResponseWriter, r *http.Request) (invitations.Invitation, bool) {
	token := chi.URLParam(r, "token")
	invitation, err := h.invitations.GetByToken(r.Context(), token)
	if err != nil {
		if errors.Is(err, invitations.ErrNotFound) {
			httpx.NotFound(w, "Invitation not found.")
			return invitations.Invitation{}, false
		}
		httpx.Internal(w, err)
		return invitations.Invitation{}, false
	}
	if !invitation.Active {
		httpx.Forbidden(w)
		return invitations.Invitation{}, false
	}
	return invitation, true
}
