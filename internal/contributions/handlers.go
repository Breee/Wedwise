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

// Request is the payload accepted by guests when offering a contribution.
type Request struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Needs       string   `json:"needs"`
	Phone       string   `json:"phone"`
	Messengers  []string `json:"messengers"`
	MatrixID    string   `json:"matrixId"`
}

// ToInput converts the request into store input.
func (req Request) ToInput() Input {
	return Input{Title: req.Title, Description: req.Description, Needs: req.Needs, Phone: req.Phone,
		Messengers: req.Messengers, MatrixID: req.MatrixID}
}

type bulkScheduleRequest struct {
	Items []struct {
		ID int64 `json:"id"`
		scheduleRequest
	} `json:"items"`
}

type statusRequest struct {
	Status string `json:"status"`
}

type scheduleRequest struct {
	SlotTime        string `json:"slotTime"`
	DurationMinutes int    `json:"durationMinutes"`
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
	r.With(h.auth.RequirePermission(auth.PermContributionManage)).Put("/{id}/status", h.updateStatus)
	r.With(h.auth.RequirePermission(auth.PermContributionManage)).Put("/{id}/schedule", h.updateSchedule)
	r.With(h.auth.RequirePermission(auth.PermContributionManage)).Put("/schedule", h.updateScheduleAll)
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

func (h *Handler) updateStatus(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid contribution id.")
		return
	}
	var req statusRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	contribution, err := h.store.SetStatus(r.Context(), id, req.Status)
	if err != nil {
		WriteStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, contribution)
}

func (h *Handler) updateSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.ParseID(chi.URLParam(r, "id"))
	if err != nil {
		httpx.BadRequest(w, "Invalid contribution id.")
		return
	}
	var req scheduleRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	contribution, err := h.store.SetSchedule(r.Context(), id, req.SlotTime, req.DurationMinutes)
	if err != nil {
		WriteStoreError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, contribution)
}

func (h *Handler) updateScheduleAll(w http.ResponseWriter, r *http.Request) {
	var req bulkScheduleRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	items := make([]ScheduleItem, 0, len(req.Items))
	for _, it := range req.Items {
		items = append(items, ScheduleItem{ID: it.ID, SlotTime: it.SlotTime, DurationMinutes: it.DurationMinutes})
	}
	if err := h.store.SetScheduleAll(r.Context(), items); err != nil {
		WriteStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
