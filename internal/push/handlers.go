package push

import (
	"errors"
	"net/http"
	"strings"

	"github.com/Breee/Wedwise/internal/auth"
	"github.com/Breee/Wedwise/internal/httpx"
)

// Handler exposes the push API.
type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

// Key returns the public VAPID key.
func (h *Handler) Key(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"key": h.service.PublicKey()})
}

type subscribeRequest struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
	Topics []string `json:"topics"`
}

// allowedTopics keeps only the topics the caller may listen to. Guests get
// broadcasts only; staff topics follow the role's read permissions.
func allowedTopics(r *http.Request, requested []string) []string {
	role := ""
	if identity, ok := auth.IdentityFrom(r.Context()); ok {
		role = identity.Role
	}
	allowed := []string{}
	seen := map[string]bool{}
	for _, topic := range requested {
		ok := false
		switch topic {
		case TopicBroadcast:
			ok = true
		case TopicResponses:
			ok = role != "" && auth.RoleHasPermission(role, auth.PermRSVPRead)
		case TopicContributions:
			ok = role != "" && auth.RoleHasPermission(role, auth.PermContributionRead)
		}
		if ok && !seen[topic] {
			seen[topic] = true
			allowed = append(allowed, topic)
		}
	}
	return allowed
}

// Subscribe stores the caller's subscription. With no topics left it is removed.
func (h *Handler) Subscribe(w http.ResponseWriter, r *http.Request) {
	var req subscribeRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	topics := allowedTopics(r, req.Topics)
	if len(topics) == 0 {
		if err := h.service.Unsubscribe(r.Context(), req.Endpoint); err != nil {
			httpx.Internal(w, err)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string][]string{"topics": topics})
		return
	}
	sub := Subscription{Endpoint: req.Endpoint, P256dh: req.Keys.P256dh, Auth: req.Keys.Auth, Topics: topics}
	if identity, ok := auth.IdentityFrom(r.Context()); ok {
		sub.UserID = identity.ID
	}
	if err := h.service.Subscribe(r.Context(), sub); err != nil {
		if errors.Is(err, ErrValidation) {
			httpx.BadRequest(w, "Invalid push subscription.")
			return
		}
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string][]string{"topics": topics})
}

// Status returns the topics stored for an endpoint.
func (h *Handler) Status(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Endpoint string `json:"endpoint"`
	}
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	topics, err := h.service.Topics(r.Context(), req.Endpoint)
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string][]string{"topics": topics})
}

type broadcastRequest struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
}

// Broadcast sends a message to everyone who enabled notifications.
func (h *Handler) Broadcast(w http.ResponseWriter, r *http.Request) {
	var req broadcastRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	req.Title, req.Body, req.URL = strings.TrimSpace(req.Title), strings.TrimSpace(req.Body), strings.TrimSpace(req.URL)
	if req.URL == "" {
		req.URL = "/"
	}
	if req.Title == "" || len(req.Title) > 100 || len(req.Body) > 500 ||
		!strings.HasPrefix(req.URL, "/") || strings.HasPrefix(req.URL, "//") || len(req.URL) > 200 {
		httpx.BadRequest(w, "A title (max 100 characters) is required; the text may have 500 characters.")
		return
	}
	if err := h.service.SaveMessage(r.Context(), req.Title, req.Body); err != nil {
		httpx.Internal(w, err)
		return
	}
	sent, err := h.service.Send(r.Context(), TopicBroadcast, Message{Title: req.Title, Body: req.Body, URL: req.URL})
	if err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]int{"sent": sent})
}
