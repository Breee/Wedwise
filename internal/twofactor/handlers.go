package twofactor

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/httpx"
)

// Handler exposes two-factor management for the signed-in user.
type Handler struct {
	store *Store
	auth  *auth.Service
}

// NewHandler creates the handler.
func NewHandler(store *Store, authService *auth.Service) *Handler {
	return &Handler{store: store, auth: authService}
}

// renewed replaces the user's sessions after their login changed and
// reports whether the request may continue.
func (h *Handler) renewed(w http.ResponseWriter, r *http.Request) bool {
	if err := h.auth.RenewSession(w, r); err != nil {
		httpx.Internal(w, err)
		return false
	}
	return true
}

type codeRequest struct {
	Code string `json:"code"`
}

// Routes are mounted for authenticated users.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/", h.status)
	r.Post("/totp", h.begin)
	r.Post("/totp/confirm", h.confirm)
	r.Post("/disable", h.disable)
	r.Post("/keys/begin", h.keyBegin)
	r.Post("/keys", h.keyFinish)
	r.Delete("/keys/{id}", h.keyDelete)
	return r
}

func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	identity, _ := auth.IdentityFrom(r.Context())
	enabled, err := h.store.TOTPEnabled(r.Context(), identity.ID)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	left, err := h.store.RecoveryCodesLeft(r.Context(), identity.ID)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	keys := []Key{}
	if h.store.keys != nil {
		if keys, err = h.store.keys.List(r.Context(), identity.ID); err != nil {
			httpx.Internal(w, err)
			return
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"totp": enabled, "recoveryCodes": left, "keys": keys})
}

func (h *Handler) keyBegin(w http.ResponseWriter, r *http.Request) {
	identity, _ := auth.IdentityFrom(r.Context())
	if h.store.keys == nil {
		httpx.NotFound(w, "Security keys are not available.")
		return
	}
	options, err := h.store.keys.BeginRegister(r.Context(), identity.ID, identity.Username)
	if errors.Is(err, ErrAlreadyEnabled) {
		httpx.WriteError(w, http.StatusConflict, httpx.CodeConflict, "Too many security keys.")
		return
	}
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, options)
}

func (h *Handler) keyFinish(w http.ResponseWriter, r *http.Request) {
	identity, _ := auth.IdentityFrom(r.Context())
	var req struct {
		Name       string          `json:"name"`
		Credential json.RawMessage `json:"credential"`
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if h.store.keys == nil {
		httpx.NotFound(w, "Security keys are not available.")
		return
	}
	err := h.store.keys.FinishRegister(r.Context(), identity.ID, identity.Username, req.Name, req.Credential)
	if errors.Is(err, ErrInvalidCode) {
		httpx.WriteError(w, http.StatusBadRequest, auth.CodeInvalidCode, "The security key could not be verified.")
		return
	}
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	if !h.renewed(w, r) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) keyDelete(w http.ResponseWriter, r *http.Request) {
	identity, _ := auth.IdentityFrom(r.Context())
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || h.store.keys == nil {
		httpx.BadRequest(w, "Invalid key id.")
		return
	}
	if err := h.store.keys.Delete(r.Context(), identity.ID, id); err != nil {
		httpx.Internal(w, err)
		return
	}
	if !h.renewed(w, r) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) begin(w http.ResponseWriter, r *http.Request) {
	identity, _ := auth.IdentityFrom(r.Context())
	secret, url, err := h.store.Begin(r.Context(), identity.ID, identity.Username)
	if errors.Is(err, ErrAlreadyEnabled) {
		httpx.WriteError(w, http.StatusConflict, httpx.CodeConflict, "Two-factor login is already enabled.")
		return
	}
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"secret": secret, "url": url})
}

func (h *Handler) confirm(w http.ResponseWriter, r *http.Request) {
	identity, _ := auth.IdentityFrom(r.Context())
	var req codeRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	codes, err := h.store.Confirm(r.Context(), identity.ID, req.Code)
	if errors.Is(err, ErrInvalidCode) {
		httpx.WriteError(w, http.StatusBadRequest, auth.CodeInvalidCode, "The code is not correct.")
		return
	}
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	if !h.renewed(w, r) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, map[string][]string{"recoveryCodes": codes})
}

func (h *Handler) disable(w http.ResponseWriter, r *http.Request) {
	identity, _ := auth.IdentityFrom(r.Context())
	var req codeRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	ok, err := h.store.Verify(r.Context(), identity.ID, req.Code)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, auth.CodeInvalidCode, "The code is not correct.")
		return
	}
	if err := h.store.Disable(r.Context(), identity.ID); err != nil {
		httpx.Internal(w, err)
		return
	}
	if !h.renewed(w, r) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Reset removes another user's second factor (admin recovery).
func (h *Handler) Reset(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.BadRequest(w, "Invalid user id.")
		return
	}
	if err := h.store.Disable(r.Context(), id); err != nil {
		httpx.Internal(w, err)
		return
	}
	if h.store.keys != nil {
		if err := h.store.keys.DeleteAll(r.Context(), id); err != nil {
			httpx.Internal(w, err)
			return
		}
	}
	if err := h.auth.EndSessions(r.Context(), id); err != nil {
		httpx.Internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
