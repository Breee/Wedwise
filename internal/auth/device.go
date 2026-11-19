package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/httpx"
	"github.com/Breee/Wedwise/internal/tokens"
)

// Command line clients sign in like `gh auth login --web`: the client asks
// for a code, the user confirms it in the browser while signed in, and the
// client receives a token that may do what that user's role may do.
const (
	deviceRequestLifetime = 10 * time.Minute
	DeviceTokenLifetime   = 90 * 24 * time.Hour
	devicePollSeconds     = 2
	maxDeviceNameLength   = 80
	userCodeAlphabet      = "BCDFGHJKLMNPQRSTVWXZ23456789"

	CodeDevicePending = "authorization_pending"
	CodeDeviceUnknown = "unknown_code"
	ActionDeviceLogin = "device.login"
)

// ErrDevicePending is returned while a device login awaits approval.
var ErrDevicePending = errors.New("device login pending")

// Device is an approved command line login.
type Device struct {
	ID         int64      `json:"id"`
	Name       string     `json:"name"`
	CreatedAt  time.Time  `json:"createdAt"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	LastUsedAt *time.Time `json:"lastUsedAt"`
}

// DeviceStore keeps device logins.
type DeviceStore struct {
	db  *sql.DB
	now func() time.Time
}

// NewDeviceStore creates a store for command line logins.
func NewDeviceStore(db *sql.DB) *DeviceStore {
	return &DeviceStore{db: db, now: func() time.Time { return time.Now().UTC() }}
}

func userCode() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, 0, 9)
	for i, b := range buf {
		if i == 4 {
			out = append(out, '-')
		}
		out = append(out, userCodeAlphabet[int(b)%len(userCodeAlphabet)])
	}
	return string(out), nil
}

// Begin opens a login request and returns the secret device code for the
// client and the short code the user confirms.
func (s *DeviceStore) Begin(ctx context.Context, name string) (device, code string, err error) {
	if device, err = randomToken(32); err != nil {
		return "", "", err
	}
	if code, err = userCode(); err != nil {
		return "", "", err
	}
	name = strings.TrimSpace(name)
	if len(name) > maxDeviceNameLength {
		name = name[:maxDeviceNameLength]
	}
	now := s.now()
	if _, err = s.db.ExecContext(ctx, "DELETE FROM device_tokens WHERE expires_at < ?", now); err != nil {
		return "", "", err
	}
	_, err = s.db.ExecContext(ctx,
		"INSERT INTO device_tokens (device_hash, user_code, name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
		tokens.Hash(device), code, name, now, now.Add(deviceRequestLifetime))
	return device, code, err
}

// Pending returns the name of the client waiting behind a user code.
func (s *DeviceStore) Pending(ctx context.Context, code string) (string, error) {
	var name string
	err := s.db.QueryRowContext(ctx,
		"SELECT name FROM device_tokens WHERE user_code = ? AND user_id IS NULL AND expires_at > ?",
		normalizeCode(code), s.now()).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrSessionNotFound
	}
	return name, err
}

// Approve lets the client behind the user code act for the user.
func (s *DeviceStore) Approve(ctx context.Context, code string, userID int64) error {
	now := s.now()
	result, err := s.db.ExecContext(ctx,
		"UPDATE device_tokens SET user_id = ?, user_code = '' WHERE user_code = ? AND user_id IS NULL AND expires_at > ?",
		userID, normalizeCode(code), now)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return ErrSessionNotFound
	}
	return nil
}

// Redeem hands the token to the polling client once the user has approved.
func (s *DeviceStore) Redeem(ctx context.Context, device string) (string, error) {
	now := s.now()
	var id int64
	var userID sql.NullInt64
	err := s.db.QueryRowContext(ctx,
		"SELECT id, user_id FROM device_tokens WHERE device_hash = ? AND expires_at > ?",
		tokens.Hash(device), now).Scan(&id, &userID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrSessionNotFound
	}
	if err != nil {
		return "", err
	}
	if !userID.Valid {
		return "", ErrDevicePending
	}
	token, err := randomToken(32)
	if err != nil {
		return "", err
	}
	_, err = s.db.ExecContext(ctx,
		"UPDATE device_tokens SET device_hash = '', token_hash = ?, expires_at = ? WHERE id = ?",
		tokens.Hash(token), now.Add(DeviceTokenLifetime), id)
	return token, err
}

// User returns the user a token acts for.
func (s *DeviceStore) User(ctx context.Context, token string) (int64, error) {
	now := s.now()
	var id, userID int64
	var used sql.NullTime
	err := s.db.QueryRowContext(ctx,
		"SELECT id, user_id, last_used_at FROM device_tokens WHERE token_hash = ? AND expires_at > ?",
		tokens.Hash(token), now).Scan(&id, &userID, &used)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrSessionNotFound
	}
	if err != nil {
		return 0, err
	}
	if !used.Valid || now.Sub(used.Time) > time.Minute {
		_, _ = s.db.ExecContext(ctx, "UPDATE device_tokens SET last_used_at = ? WHERE id = ?", now, id)
	}
	return userID, nil
}

// List returns the user's approved command line logins.
func (s *DeviceStore) List(ctx context.Context, userID int64) ([]Device, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT id, name, created_at, expires_at, last_used_at FROM device_tokens WHERE user_id = ? AND token_hash <> '' AND expires_at > ? ORDER BY created_at DESC",
		userID, s.now())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	devices := []Device{}
	for rows.Next() {
		var d Device
		var used sql.NullTime
		if err := rows.Scan(&d.ID, &d.Name, &d.CreatedAt, &d.ExpiresAt, &used); err != nil {
			return nil, err
		}
		if used.Valid {
			d.LastUsedAt = &used.Time
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

// Delete revokes one of the user's logins.
func (s *DeviceStore) Delete(ctx context.Context, userID, id int64) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM device_tokens WHERE id = ? AND user_id = ?", id, userID)
	return err
}

// DeleteToken revokes the login a token belongs to.
func (s *DeviceStore) DeleteToken(ctx context.Context, token string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM device_tokens WHERE token_hash = ?", tokens.Hash(token))
	return err
}

func normalizeCode(code string) string {
	code = strings.ToUpper(strings.TrimSpace(code))
	if len(code) == 8 {
		code = code[:4] + "-" + code[4:]
	}
	return code
}

// SetDevices enables command line logins.
// SetDevices enables command-line sign-in. The limit guards its routes; it is
// separate from the login limit because a waiting client polls every few
// seconds and would otherwise lock the same address out of signing in.
func (s *Service) SetDevices(d *DeviceStore, limit ...func(http.Handler) http.Handler) {
	s.devices = d
	s.deviceLimit = limit
}

func bearer(r *http.Request) string {
	value := r.Header.Get("Authorization")
	if len(value) > 7 && strings.EqualFold(value[:7], "Bearer ") {
		return strings.TrimSpace(value[7:])
	}
	return ""
}

// identityFromToken resolves a command line token to a scoped identity.
func (s *Service) identityFromToken(r *http.Request) (Identity, error) {
	token := bearer(r)
	if token == "" || s.devices == nil {
		return Identity{}, ErrSessionNotFound
	}
	userID, err := s.devices.User(r.Context(), token)
	if err != nil {
		return Identity{}, err
	}
	identity, err := s.users.IdentityByID(r.Context(), userID)
	if err != nil {
		return Identity{}, err
	}
	if !identity.Active {
		return Identity{}, ErrInvalidCredentials
	}
	identity.Device = true
	return identity, nil
}

func (s *Service) deviceRoutes(r chi.Router, limit []func(http.Handler) http.Handler) {
	if len(s.deviceLimit) > 0 {
		limit = s.deviceLimit
	}
	r.With(limit...).Post("/device", s.handleDeviceBegin)
	r.With(limit...).Post("/device/token", s.handleDeviceToken)
	r.Delete("/device/token", s.handleDeviceLogout)
	r.Group(func(r chi.Router) {
		r.Use(s.requireSession)
		r.With(limit...).Get("/device/pending", s.handleDevicePending)
		r.With(limit...).Post("/device/approve", s.handleDeviceApprove)
		r.Get("/devices", s.handleDevices)
		r.Delete("/devices/{id}", s.handleDeviceDelete)
	})
}

func (s *Service) handleDeviceBegin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	device, code, err := s.devices.Begin(r.Context(), req.Name)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"deviceCode":      device,
		"userCode":        code,
		"verificationUrl": strings.TrimRight(s.baseURL, "/") + "/device?code=" + code,
		"interval":        devicePollSeconds,
		"expiresIn":       int(deviceRequestLifetime.Seconds()),
	})
}

func (s *Service) handleDeviceToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DeviceCode string `json:"deviceCode"`
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	token, err := s.devices.Redeem(r.Context(), req.DeviceCode)
	switch {
	case errors.Is(err, ErrDevicePending):
		httpx.WriteError(w, http.StatusAccepted, CodeDevicePending, "Waiting for approval in the browser.")
	case errors.Is(err, ErrSessionNotFound):
		httpx.WriteError(w, http.StatusNotFound, CodeDeviceUnknown, "This login request is unknown or has expired.")
	case err != nil:
		httpx.Internal(w, err)
	default:
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"token": token})
	}
}

func (s *Service) handleDeviceLogout(w http.ResponseWriter, r *http.Request) {
	if token := bearer(r); token != "" {
		if err := s.devices.DeleteToken(r.Context(), token); err != nil {
			httpx.Internal(w, err)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) handleDevicePending(w http.ResponseWriter, r *http.Request) {
	name, err := s.devices.Pending(r.Context(), r.URL.Query().Get("code"))
	if errors.Is(err, ErrSessionNotFound) {
		httpx.WriteError(w, http.StatusNotFound, CodeDeviceUnknown, "This code is unknown or has expired.")
		return
	}
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	identity, _ := IdentityFrom(r.Context())
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"name": name, "role": identity.Role})
}

func (s *Service) handleDeviceApprove(w http.ResponseWriter, r *http.Request) {
	identity, _ := IdentityFrom(r.Context())
	var req struct {
		Code string `json:"code"`
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	err := s.devices.Approve(r.Context(), req.Code, identity.ID)
	if errors.Is(err, ErrSessionNotFound) {
		httpx.WriteError(w, http.StatusNotFound, CodeDeviceUnknown, "This code is unknown or has expired.")
		return
	}
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	s.record(r.Context(), identity.ID, identity.Username, ActionDeviceLogin)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) handleDevices(w http.ResponseWriter, r *http.Request) {
	session, _ := SessionFrom(r.Context())
	devices, err := s.devices.List(r.Context(), session.UserID)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"devices": devices})
}

func (s *Service) handleDeviceDelete(w http.ResponseWriter, r *http.Request) {
	session, _ := SessionFrom(r.Context())
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "Invalid id.")
		return
	}
	if err := s.devices.Delete(r.Context(), session.UserID, id); err != nil {
		httpx.Internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
