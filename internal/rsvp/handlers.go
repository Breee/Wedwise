package rsvp

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/contributions"
	"github.com/Breee/Wedwise/internal/httpx"
	"github.com/Breee/Wedwise/internal/invites"
)

// CodeInvalidPIN is the error code for a wrong or missing invite PIN.
const CodeInvalidPIN = "invalid_pin"

// Handler exposes the public RSVP endpoints and the protected response
// overview for the couple.
type Handler struct {
	store         *Store
	contributions *contributions.Store
	links         *invites.Store
	gate          *invites.Gate
}

// NewHandler creates an RSVP handler.
func NewHandler(store *Store, contributionStore *contributions.Store, links *invites.Store, gate *invites.Gate) *Handler {
	return &Handler{store: store, contributions: contributionStore, links: links, gate: gate}
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
	MusicGenres  string                 `json:"musicGenres"`
	MusicSong    string                 `json:"musicSong"`
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
		MusicGenres: req.MusicGenres,
		MusicSong:   req.MusicSong,
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
	PIN string `json:"pin"`
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

// PublicRoutes returns the guest facing routes. Guests open the form through
// an invite link (/links/{link}) and later edit their response through the
// edit token they received (/{token}). middlewares (e.g. rate limiting) are
// applied to every route.
func (h *Handler) PublicRoutes(middlewares ...func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(middlewares...)
	r.Get("/links/{link}", h.linkStatus)
	r.Post("/links/{link}/unlock", h.unlock)
	r.Post("/links/{link}", h.create)
	r.Get("/{token}", h.get)
	r.Put("/{token}", h.update)
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

// StaffRoutes lets the couple and witnesses read, edit and delete responses.
// Contributions are never exposed or changed through these routes.
func (h *Handler) StaffRoutes(authService *auth.Service) http.Handler {
	r := chi.NewRouter()
	r.With(authService.RequirePermission(auth.PermRSVPRead)).Get("/", h.ListHandler)
	r.With(authService.RequirePermission(auth.PermRSVPRead)).Get("/{id}", h.staffGet)
	r.With(authService.RequirePermission(auth.PermRSVPManage)).Put("/{id}", h.staffUpdate)
	r.With(authService.RequirePermission(auth.PermRSVPManage)).Delete("/{id}", h.staffDelete)
	return r
}

func (h *Handler) staffGet(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.NotFound(w, "Response not found.")
		return
	}
	response, err := h.store.GetByID(r.Context(), id)
	if err != nil {
		h.writeError(w, err)
		return
	}
	h.writeCoupleView(w, r, response)
}

func (h *Handler) staffUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.NotFound(w, "Response not found.")
		return
	}
	var req submitRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	response, err := h.store.UpdateByID(r.Context(), id, req.toParams())
	if err != nil {
		h.writeError(w, err)
		return
	}
	h.writeCoupleView(w, r, response)
}

func (h *Handler) staffDelete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.NotFound(w, "Response not found.")
		return
	}
	if err := h.store.Delete(r.Context(), id); err != nil {
		h.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) writeCoupleView(w http.ResponseWriter, r *http.Request, response Response) {
	attendees, err := h.store.Attendees(r.Context(), response.ID)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	if attendees == nil {
		attendees = []Attendee{}
	}
	httpx.WriteJSON(w, http.StatusOK, coupleView{Response: response, Attendees: attendees})
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

// activeLink resolves the invite link from the URL; inactive or unknown links
// are reported as not found so they cannot be told apart.
func (h *Handler) activeLink(w http.ResponseWriter, r *http.Request) (invites.Link, bool) {
	link, err := h.links.GetByToken(r.Context(), chi.URLParam(r, "link"))
	if errors.Is(err, invites.ErrNotFound) || (err == nil && !link.Active) {
		httpx.NotFound(w, "This invite link is not valid.")
		return invites.Link{}, false
	}
	if err != nil {
		httpx.Internal(w, err)
		return invites.Link{}, false
	}
	return link, true
}

func (h *Handler) linkStatus(w http.ResponseWriter, r *http.Request) {
	link, ok := h.activeLink(w, r)
	if !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"pinRequired": link.HasPIN,
		"unlocked":    h.gate.Unlocked(r, link),
	})
}

func (h *Handler) unlock(w http.ResponseWriter, r *http.Request) {
	link, ok := h.activeLink(w, r)
	if !ok {
		return
	}
	var req unlockRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if !h.gate.Unlock(w, link, req.PIN) {
		httpx.WriteError(w, http.StatusUnauthorized, CodeInvalidPIN, "The PIN is not correct.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	link, ok := h.activeLink(w, r)
	if !ok {
		return
	}
	if !h.gate.Unlocked(r, link) {
		httpx.WriteError(w, http.StatusUnauthorized, CodeInvalidPIN, "Please enter the PIN first.")
		return
	}
	var req submitRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	response, token, err := h.store.Create(r.Context(), link.ID, req.toParams())
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
			Messengers:  contribution.Messengers,
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
