// Package push sends Web Push notifications to subscribed browsers.
package push

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// Topics a subscription can listen to.
const (
	TopicBroadcast     = "broadcast"
	TopicResponses     = "responses"
	TopicContributions = "contributions"
)

var ErrValidation = errors.New("invalid subscription")

// Message is the payload shown by the service worker.
type Message struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
}

// Subscription is a browser push subscription.
type Subscription struct {
	Endpoint string
	P256dh   string
	Auth     string
	UserID   int64 // 0 for anonymous guests
	Topics   []string
}

type sendFunc func(ctx context.Context, payload []byte, sub Subscription) (status int, err error)

// Service stores subscriptions and delivers messages.
type Service struct {
	db         *sql.DB
	subscriber string
	publicKey  string
	privateKey string
	send       sendFunc
	client     *http.Client
}

// NewService loads the VAPID key pair, creating it on first use.
func NewService(ctx context.Context, db *sql.DB, subscriber string) (*Service, error) {
	s := &Service{db: db, subscriber: subscriber, client: newClient()}
	s.send = s.deliver
	var err error
	if s.privateKey, err = s.setting(ctx, "vapid_private"); err != nil {
		return nil, err
	}
	if s.publicKey, err = s.setting(ctx, "vapid_public"); err != nil {
		return nil, err
	}
	if s.privateKey == "" || s.publicKey == "" {
		if s.privateKey, s.publicKey, err = webpush.GenerateVAPIDKeys(); err != nil {
			return nil, err
		}
		for key, value := range map[string]string{"vapid_private": s.privateKey, "vapid_public": s.publicKey} {
			if _, err := db.ExecContext(ctx,
				`INSERT INTO push_settings (key, value) VALUES (?, ?)
				 ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value); err != nil {
				return nil, err
			}
		}
	}
	return s, nil
}

func (s *Service) setting(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM push_settings WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return value, err
}

// PublicKey is the VAPID key browsers need to subscribe.
func (s *Service) PublicKey() string { return s.publicKey }

// validEndpoint accepts https URLs on the default port whose host is a name
// or a public address. Names are checked again when the connection is made.
func validEndpoint(endpoint string) bool {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || len(endpoint) > 2000 {
		return false
	}
	if port := u.Port(); port != "" && port != "443" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || !strings.Contains(host, ".") && !strings.Contains(host, ":") {
		return false
	}
	if addr, err := netip.ParseAddr(host); err == nil {
		return publicAddress(addr)
	}
	return true
}

// Subscribe stores or replaces a subscription.
func (s *Service) Subscribe(ctx context.Context, sub Subscription) error {
	if !validEndpoint(sub.Endpoint) ||
		sub.P256dh == "" || sub.Auth == "" || len(sub.P256dh) > 500 || len(sub.Auth) > 500 {
		return ErrValidation
	}
	var userID any
	if sub.UserID != 0 {
		userID = sub.UserID
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id, topics, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
		   user_id = excluded.user_id, topics = excluded.topics`,
		sub.Endpoint, sub.P256dh, sub.Auth, userID, strings.Join(sub.Topics, ","),
		time.Now().UTC().Format(time.RFC3339))
	return err
}

// Topics returns the topics stored for an endpoint.
func (s *Service) Topics(ctx context.Context, endpoint string) ([]string, error) {
	var topics string
	err := s.db.QueryRowContext(ctx, `SELECT topics FROM push_subscriptions WHERE endpoint = ?`, endpoint).Scan(&topics)
	if errors.Is(err, sql.ErrNoRows) || topics == "" {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	return strings.Split(topics, ","), nil
}

// Unsubscribe removes a subscription.
func (s *Service) Unsubscribe(ctx context.Context, endpoint string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM push_subscriptions WHERE endpoint = ?`, endpoint)
	return err
}

func (s *Service) subscriptions(ctx context.Context, topic string) ([]Subscription, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT endpoint, p256dh, auth, topics FROM push_subscriptions`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var subs []Subscription
	for rows.Next() {
		var sub Subscription
		var topics string
		if err := rows.Scan(&sub.Endpoint, &sub.P256dh, &sub.Auth, &topics); err != nil {
			return nil, err
		}
		for _, t := range strings.Split(topics, ",") {
			if t == topic {
				subs = append(subs, sub)
				break
			}
		}
	}
	return subs, rows.Err()
}

// Send delivers a message to every subscription of a topic and returns how
// many deliveries succeeded. Subscriptions the push service reports as gone
// are removed.
func (s *Service) Send(ctx context.Context, topic string, msg Message) (int, error) {
	subs, err := s.subscriptions(ctx, topic)
	if err != nil {
		return 0, err
	}
	payload, err := json.Marshal(msg)
	if err != nil {
		return 0, err
	}
	sent := 0
	for _, sub := range subs {
		status, err := s.send(ctx, payload, sub)
		switch {
		case err != nil:
			slog.Warn("push delivery failed", "error", err)
		case status == http.StatusNotFound || status == http.StatusGone:
			_ = s.Unsubscribe(ctx, sub.Endpoint)
		case status >= 200 && status < 300:
			sent++
		default:
			slog.Warn("push delivery rejected", "status", status)
		}
	}
	return sent, nil
}

// Notify sends in the background; failures are only logged.
func (s *Service) Notify(topic string, msg Message) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if _, err := s.Send(ctx, topic, msg); err != nil {
			slog.Warn("push notify failed", "error", err)
		}
	}()
}

func (s *Service) deliver(ctx context.Context, payload []byte, sub Subscription) (int, error) {
	resp, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		HTTPClient:      s.client,
		Subscriber:      s.subscriber,
		VAPIDPublicKey:  s.publicKey,
		VAPIDPrivateKey: s.privateKey,
		TTL:             86400,
	})
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}
