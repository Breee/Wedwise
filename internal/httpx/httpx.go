// Package httpx contains small helpers for writing JSON APIs.
package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
)

// MaxBodyBytes is the maximum accepted request body size.
const MaxBodyBytes = 1 << 20 // 1MB

// Error codes used across the API.
const (
	CodeBadRequest   = "bad_request"
	CodeUnauthorized = "unauthorized"
	CodeForbidden    = "forbidden"
	CodeNotFound     = "not_found"
	CodeConflict     = "conflict"
	CodeInternal     = "internal_error"
)

// ErrorBody is the payload of an API error response.
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type errorResponse struct {
	Error ErrorBody `json:"error"`
}

// WriteJSON writes v as a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("write json response", "error", err)
	}
}

// WriteError writes a structured JSON error response.
func WriteError(w http.ResponseWriter, status int, code, message string) {
	WriteJSON(w, status, errorResponse{Error: ErrorBody{Code: code, Message: message}})
}

// BadRequest writes a 400 response.
func BadRequest(w http.ResponseWriter, message string) {
	WriteError(w, http.StatusBadRequest, CodeBadRequest, message)
}

// Unauthorized writes a 401 response.
func Unauthorized(w http.ResponseWriter) {
	WriteError(w, http.StatusUnauthorized, CodeUnauthorized, "Authentication is required to access this resource.")
}

// Forbidden writes a 403 response.
func Forbidden(w http.ResponseWriter) {
	WriteError(w, http.StatusForbidden, CodeForbidden, "You do not have permission to access this resource.")
}

// NotFound writes a 404 response.
func NotFound(w http.ResponseWriter, message string) {
	WriteError(w, http.StatusNotFound, CodeNotFound, message)
}

// Conflict writes a 409 response.
func Conflict(w http.ResponseWriter, message string) {
	WriteError(w, http.StatusConflict, CodeConflict, message)
}

// Internal logs err and writes a generic 500 response.
func Internal(w http.ResponseWriter, err error) {
	slog.Error("request failed", "error", err)
	WriteError(w, http.StatusInternalServerError, CodeInternal, "An unexpected error occurred.")
}

// DecodeJSON decodes a JSON request body with a size limit and strict field checking.
// It writes an error response and returns false if decoding fails.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			WriteError(w, http.StatusRequestEntityTooLarge, CodeBadRequest, "Request body is too large.")
			return false
		}
		BadRequest(w, "Request body is not valid JSON: "+err.Error())
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		BadRequest(w, "Request body must contain a single JSON object.")
		return false
	}
	return true
}

// ParseID parses a positive integer identifier from a string.
func ParseID(raw string) (int64, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid identifier %q", raw)
	}
	return id, nil
}
