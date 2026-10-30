package rsvp

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/contributions"
	"github.com/Breee/Wedwise/internal/httpx"
)

// Handler exposes the public RSVP endpoints and the protected response
// overview for the couple.
type Handler struct {
	store         *Store
	contributions *contributions.Store
	access        *Access
}

// NewHandler creates an RSVP handler.
func NewHandler(store *Store, contributionStore *contributions.Store, access *Access) *Handler {
	return &Handler{store: store, contributions: contributionStore, access: access}
}

type attendeeRequest struct {
	Name      string `json:"name"`
	IsChild   bool   `json:"isChild"`
	Diet      string `json:"diet"`
	Allergies string `json:"allergies"`
}

type submitRequest struct {
	ContactName  string                 `json:"contactName"`
	Email        string                 `json:"email"`
	Phone        string                 `json:"phone"`
	Status       string                 `json:"status"`
	Message      string                 `json:"message"`
	Attendees    []attendeeRequest      `json:"attendees"`
	Contribution *contributions.Request `json:"contribution"`
}

func (req submitRequest) toParams() SubmitParams {
	params := SubmitParams{
		ContactName: req.ContactName,
		Email:       req.Email,
		Phone:       req.Phone,
		Status:      req.Status,
		Message:     req.Message,
	}
	for _, attendee := range req.Attendees {
		params.Attendees = append(params.Attendees, AttendeeInput(attendee))
	}
	if req.Contribution != nil {
		input := req.Contribution.ToInput()
		params.Contribution = &input
	}
	return params
}

type unlockRequest struct {
	Code string `json:"code"`
}

// guestView is what a guest sees of their own response. It includes the
// contribution because the guest wrote it; the couple never receives it.
type guestView struct {
	Response
	EditToken    string                 `json:"editToken"`
	Attendees    []Attendee             `json:"attendees"`
	Contribution *contributions.Request `json:"contribution"`
}

type coupleView struct {
	Response
	Attendees []Attendee `json:"attendees"`
}

// PublicRoutes returns the guest facing routes. submitMiddlewares are applied
// to the unlock and submit endpoints (e.g. rate limiting).
func (h *Handler) PublicRoutes(submitMiddlewares ...func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Get("/access", h.accessStatus)
	r.With(submitMiddlewares...).Post("/unlock", h.unlock)
	r.Group(func(g chi.Router) {
		g.Use(h.access.Require)
		g.With(submitMiddlewares...).Post("/", h.create)
		g.With(submitMiddlewares...).Get("/{token}", h.get)
		g.With(submitMiddlewares...).Put("/{token}", h.update)
	})
	return r
}

// SummaryHandler returns aggregated statistics without contribution data.
func (h *Handler) SummaryHandler(w http.ResponseWriter, r *http.Request) {
	summary, err := h.store.Summarize(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, summary)
}

// ListHandler returns every response with attendees but without contributions.
func (h *Handler) ListHandler(w http.ResponseWriter, r *http.Request) {
	responses, err := h.store.List(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	attendees, err := h.store.AllAttendees(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	byResponse := map[int64][]Attendee{}
	for _, attendee := range attendees {
		byResponse[attendee.ResponseID] = append(byResponse[attendee.ResponseID], attendee)
	}
	views := make([]coupleView, 0, len(responses))
	for _, response := range responses {
		list := byResponse[response.ID]
		if list == nil {
			list = []Attendee{}
		}
		views = append(views, coupleView{Response: response, Attendees: list})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"responses": views})
}

func (h *Handler) accessStatus(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"required": h.access.Required(),
		"unlocked": h.access.Unlocked(r),
	})
}

func (h *Handler) unlock(w http.ResponseWriter, r *http.Request) {
	var req unlockRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if !h.access.Unlock(w, req.Code) {
		httpx.WriteError(w, http.StatusUnauthorized, CodeInvalidAccessCode, "The access code is not correct.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req submitRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	response, token, err := h.store.Create(r.Context(), req.toParams())
	if err != nil {
		h.writeError(w, err)
		return
	}
	h.writeGuestView(w, r, http.StatusCreated, response, token)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	response, err := h.store.GetByToken(r.Context(), token)
	if err != nil {
		h.writeError(w, err)
		return
	}
	h.writeGuestView(w, r, http.StatusOK, response, token)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	var req submitRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	token := chi.URLParam(r, "token")
	response, err := h.store.Update(r.Context(), token, req.toParams())
	if err != nil {
		h.writeError(w, err)
		return
	}
	h.writeGuestView(w, r, http.StatusOK, response, token)
}

func (h *Handler) writeGuestView(w http.ResponseWriter, r *http.Request, status int, response Response, token string) {
	attendees, err := h.store.Attendees(r.Context(), response.ID)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	view := guestView{Response: response, EditToken: token, Attendees: attendees}
	contribution, err := h.contributions.GetByResponse(r.Context(), response.ID)
	switch {
	case err == nil:
		view.Contribution = &contributions.Request{
			Title:       contribution.Title,
			Description: contribution.Description,
			Needs:       contribution.Needs,
			Phone:       contribution.Phone,
		}
	case errors.Is(err, contributions.ErrNotFound):
	default:
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, status, view)
}

func (h *Handler) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.NotFound(w, "Response not found.")
	case errors.Is(err, ErrValidation), errors.Is(err, contributions.ErrValidation):
		httpx.BadRequest(w, err.Error())
	default:
		httpx.Internal(w, err)
	}
}
