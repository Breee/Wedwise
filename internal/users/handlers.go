package users

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/httpx"
)

// Handler exposes user endpoints.
type Handler struct {
	store    *Store
	auth     *auth.Service
	baseURL  string
	passkeys Passkeys
}

// NewHandler creates a user handler.
func NewHandler(store *Store, authService *auth.Service, baseURL string) *Handler {
	return &Handler{store: store, auth: authService, baseURL: strings.TrimRight(baseURL, "/")}
}

type userResponse struct {
	ID          int64     `json:"id"`
	Username    string    `json:"username"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	Role        string    `json:"role"`
	Active      bool      `json:"active"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// Routes returns the protected user routes.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.With(h.auth.RequirePermission(auth.PermUserRead)).Get("/", h.list)
	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequirePermission(auth.PermUserManage))
		r.Post("/", h.create)
		r.Put("/{id}/password", h.setPassword)
		r.Post("/{id}/setup-link", h.setupLink)
		r.Put("/{id}/active", h.setActive)
		r.Delete("/{id}", h.remove)
	})
	return r
}

func toResponse(user User) userResponse {
	return userResponse{
		ID:          user.ID,
		Username:    user.Username,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Role:        user.Role,
		Active:      user.Active,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
	}
}

type createRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	Role        string `json:"role"`
	Password    string `json:"password"`
}

func validPassword(w http.ResponseWriter, password string) bool {
	if len([]rune(password)) < auth.MinPasswordLength || len(password) > 200 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "The password must be at least 10 characters long.")
		return false
	}
	return true
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || len(req.Username) > 100 || len(req.DisplayName) > 200 || len(req.Email) > 200 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "A username is required.")
		return
	}
	if req.Role != "couple" && req.Role != "witness" && req.Role != "admin" {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "Unknown role.")
		return
	}
	if req.Password != "" && !validPassword(w, req.Password) {
		return
	}
	user, err := h.store.Create(r.Context(), CreateParams{
		Username:    req.Username,
		DisplayName: strings.TrimSpace(req.DisplayName),
		Email:       strings.TrimSpace(req.Email),
		Role:        req.Role,
		Password:    req.Password,
	})
	if errors.Is(err, ErrUsernameTaken) {
		httpx.WriteError(w, http.StatusConflict, httpx.CodeConflict, "This username is already taken.")
		return
	}
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	response := struct {
		userResponse
		SetupURL string `json:"setupUrl,omitempty"`
	}{userResponse: toResponse(user)}
	if req.Password == "" {
		if response.SetupURL, err = h.newSetupURL(r, user.ID); err != nil {
			httpx.Internal(w, err)
			return
		}
	}
	httpx.WriteJSON(w, http.StatusCreated, response)
}

func (h *Handler) newSetupURL(r *http.Request, userID int64) (string, error) {
	token, err := h.store.CreateSetupToken(r.Context(), userID)
	if err != nil {
		return "", err
	}
	return h.baseURL + "/setup/" + token, nil
}

func (h *Handler) setupLink(w http.ResponseWriter, r *http.Request) {
	user, ok := h.target(w, r)
	if !ok {
		return
	}
	url, err := h.newSetupURL(r, user.ID)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"setupUrl": url})
}

// SetupRoutes returns the public routes behind a setup link.
func (h *Handler) SetupRoutes(middlewares ...func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(middlewares...)
	r.Get("/{token}", h.setupInfo)
	r.Post("/{token}", h.setupRedeem)
	r.Post("/{token}/passkey/begin", h.setupPasskeyBegin)
	r.Post("/{token}/passkey", h.setupPasskey)
	return r
}

// Passkeys registers a passkey for a user during setup.
type Passkeys interface {
	BeginRegisterPasskey(ctx context.Context, userID int64, username string) (any, error)
	FinishRegister(ctx context.Context, userID int64, username, name string, response []byte) error
}

// SetPasskeys lets setup links register a passkey instead of a password.
func (h *Handler) SetPasskeys(p Passkeys) { h.passkeys = p }

func (h *Handler) setupUser(w http.ResponseWriter, r *http.Request) (User, bool) {
	if h.passkeys == nil {
		httpx.NotFound(w, "Passkeys are not available.")
		return User{}, false
	}
	user, err := h.store.SetupUser(r.Context(), chi.URLParam(r, "token"))
	if errors.Is(err, ErrNotFound) {
		setupNotFound(w)
		return User{}, false
	}
	if err != nil {
		httpx.Internal(w, err)
		return User{}, false
	}
	return user, true
}

func (h *Handler) setupPasskeyBegin(w http.ResponseWriter, r *http.Request) {
	user, ok := h.setupUser(w, r)
	if !ok {
		return
	}
	options, err := h.passkeys.BeginRegisterPasskey(r.Context(), user.ID, user.Username)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, options)
}

func (h *Handler) setupPasskey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Credential json.RawMessage `json:"credential"`
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	user, ok := h.setupUser(w, r)
	if !ok {
		return
	}
	if err := h.passkeys.FinishRegister(r.Context(), user.ID, user.Username, "Passkey", req.Credential); err != nil {
		httpx.BadRequest(w, "The passkey could not be registered.")
		return
	}
	if err := h.store.ConsumeSetupToken(r.Context(), chi.URLParam(r, "token")); err != nil {
		httpx.Internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func setupNotFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "This link is invalid or has expired.")
}

func (h *Handler) setupInfo(w http.ResponseWriter, r *http.Request) {
	user, err := h.store.SetupUser(r.Context(), chi.URLParam(r, "token"))
	if errors.Is(err, ErrNotFound) {
		setupNotFound(w)
		return
	}
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"username": user.Username, "displayName": user.DisplayName})
}

func (h *Handler) setupRedeem(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Password string `json:"password"`
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if !validPassword(w, req.Password) {
		return
	}
	err := h.store.RedeemSetupToken(r.Context(), chi.URLParam(r, "token"), req.Password)
	if errors.Is(err, ErrNotFound) {
		setupNotFound(w)
		return
	}
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) target(w http.ResponseWriter, r *http.Request) (User, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "User not found.")
		return User{}, false
	}
	user, err := h.store.GetByID(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "User not found.")
		return User{}, false
	}
	if err != nil {
		httpx.Internal(w, err)
		return User{}, false
	}
	return user, true
}

func (h *Handler) setPassword(w http.ResponseWriter, r *http.Request) {
	user, ok := h.target(w, r)
	if !ok {
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if !validPassword(w, req.Password) {
		return
	}
	if err := h.store.SetPassword(r.Context(), user.Username, req.Password); err != nil {
		httpx.Internal(w, err)
		return
	}
	// A new password ends every existing session of that user.
	var err error
	if identity, ok := auth.IdentityFrom(r.Context()); ok && identity.ID == user.ID {
		err = h.auth.RenewSession(w, r)
	} else {
		err = h.auth.EndSessions(r.Context(), user.ID)
	}
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) setActive(w http.ResponseWriter, r *http.Request) {
	user, ok := h.target(w, r)
	if !ok {
		return
	}
	var req struct {
		Active bool `json:"active"`
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	// Deactivating yourself would lock the last person able to undo it out.
	if identity, ok := auth.IdentityFrom(r.Context()); ok && identity.ID == user.ID && !req.Active {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "You cannot deactivate your own account.")
		return
	}
	if err := h.store.SetActive(r.Context(), user.Username, req.Active); err != nil {
		httpx.Internal(w, err)
		return
	}
	if !req.Active {
		if err := h.auth.EndSessions(r.Context(), user.ID); err != nil {
			httpx.Internal(w, err)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	user, ok := h.target(w, r)
	if !ok {
		return
	}
	if identity, ok := auth.IdentityFrom(r.Context()); ok && identity.ID == user.ID {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "You cannot delete your own account.")
		return
	}
	if err := h.store.Delete(r.Context(), user.ID); err != nil {
		httpx.Internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	all, err := h.store.List(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	response := make([]userResponse, 0, len(all))
	for _, user := range all {
		response = append(response, toResponse(user))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"users": response})
}
