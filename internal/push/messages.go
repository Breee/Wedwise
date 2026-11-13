package push

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Breee/Wedwise/internal/httpx"
)

const feedLimit = 50

// FeedMessage is a broadcast kept for the public message feed.
type FeedMessage struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

// SaveMessage keeps a broadcast so guests can read it later.
func (s *Service) SaveMessage(ctx context.Context, title, body string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO messages (title, body, created_at) VALUES (?, ?, ?)`,
		title, body, time.Now().UTC().Format(time.RFC3339))
	return err
}

// Messages returns the newest broadcasts first.
func (s *Service) Messages(ctx context.Context) ([]FeedMessage, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, title, body, created_at FROM messages ORDER BY id DESC LIMIT ?`, feedLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := []FeedMessage{}
	for rows.Next() {
		var m FeedMessage
		if err := rows.Scan(&m.ID, &m.Title, &m.Body, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

// DeleteMessage removes a broadcast from the feed.
func (s *Service) DeleteMessage(ctx context.Context, id int64) (bool, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM messages WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// Messages lists the public message feed.
func (h *Handler) Messages(w http.ResponseWriter, r *http.Request) {
	messages, err := h.service.Messages(r.Context())
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string][]FeedMessage{"messages": messages})
}

// DeleteMessage removes one message from the feed.
func (h *Handler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.NotFound(w, "Message not found.")
		return
	}
	found, err := h.service.DeleteMessage(r.Context(), id)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	if !found {
		httpx.NotFound(w, "Message not found.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
