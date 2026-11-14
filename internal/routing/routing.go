// Package routing proxies route lookups to OpenRouteService so the API key
// never reaches the browser. Answers are cached in memory and in the database,
// so every route costs one upstream request, also across restarts.
package routing

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Breee/Wedwise/internal/httpx"
)

const (
	defaultBaseURL = "https://api.openrouteservice.org"
	maxCacheSize   = 500
)

var profiles = map[string]string{
	"foot": "foot-walking",
	"bike": "cycling-regular",
	"car":  "driving-car",
}

// Route is the answer sent to the browser.
type Route struct {
	Minutes int          `json:"minutes"`
	Meters  float64      `json:"meters"`
	Coords  [][2]float64 `json:"coords"`
}

// Handler serves GET /api/route.
type Handler struct {
	key     string
	baseURL string
	client  *http.Client
	db      *sql.DB

	mu        sync.Mutex
	cache     map[string]Route
	warmRun   int
	warmPause time.Duration
}

// NewHandler creates a handler. An empty key disables the endpoint. A nil db
// keeps the cache in memory only.
func NewHandler(key string, db *sql.DB) *Handler {
	return &Handler{
		key:     strings.TrimSpace(key),
		baseURL: defaultBaseURL,
		client:  &http.Client{Timeout: 8 * time.Second},
		db:      db,
		cache:   map[string]Route{},
		// The free routing plan allows 40 lookups a minute.
		warmPause: 2 * time.Second,
	}
}

// ServeHTTP answers ?profile=foot|bike|car&from=lng,lat&to=lng,lat.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.key == "" {
		httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "Routing is not configured.")
		return
	}
	q := r.URL.Query()
	profile, ok := profiles[q.Get("profile")]
	from, okFrom := parsePoint(q.Get("from"))
	to, okTo := parsePoint(q.Get("to"))
	if !ok || !okFrom || !okTo {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "Invalid route request.")
		return
	}

	route, err := h.lookup(r.Context(), profile, from, to)
	if err != nil {
		slog.Warn("route lookup failed", "error", err)
		httpx.WriteError(w, http.StatusBadGateway, httpx.CodeInternal, "Routing is unavailable.")
		return
	}
	writeRoute(w, route)
}

// lookup answers from the cache and asks the routing service otherwise.
func (h *Handler) lookup(ctx context.Context, profile string, from, to [2]float64) (Route, error) {
	cacheKey := fmt.Sprintf("%s|%.5f,%.5f|%.5f,%.5f", profile, from[0], from[1], to[0], to[1])
	h.mu.Lock()
	cached, hit := h.cache[cacheKey]
	h.mu.Unlock()
	if hit {
		return cached, nil
	}
	if cached, hit = h.load(ctx, cacheKey); hit {
		h.remember(cacheKey, cached)
		return cached, nil
	}
	route, err := h.fetch(ctx, profile, from, to)
	if err != nil {
		return Route{}, err
	}
	h.remember(cacheKey, route)
	h.store(ctx, cacheKey, route)
	return route, nil
}

// Leg is one route to look up ahead of time. Points are lng, lat.
type Leg struct {
	Profile  string // foot, bike or car
	From, To [2]float64
}

// Warm looks up the given routes in the background so visitors find them in
// the cache. Lookups are spaced out to stay within the routing service's
// rate limit. A newer call replaces a running one.
func (h *Handler) Warm(legs []Leg) {
	if h.key == "" {
		return
	}
	h.mu.Lock()
	h.warmRun++
	run := h.warmRun
	h.mu.Unlock()

	go func() {
		for _, leg := range legs {
			h.mu.Lock()
			current := h.warmRun
			h.mu.Unlock()
			if current != run {
				return
			}
			profile, ok := profiles[leg.Profile]
			if !ok {
				continue
			}
			started := time.Now()
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			_, err := h.lookup(ctx, profile, leg.From, leg.To)
			cancel()
			if err != nil {
				slog.Warn("route warm-up failed", "error", err)
			}
			if time.Since(started) > 5*time.Millisecond {
				time.Sleep(h.warmPause)
			}
		}
	}()
}

func writeRoute(w http.ResponseWriter, route Route) {
	w.Header().Set("Cache-Control", "public, max-age=604800")
	httpx.WriteJSON(w, http.StatusOK, route)
}

func (h *Handler) remember(key string, route Route) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.cache) >= maxCacheSize {
		h.cache = map[string]Route{}
	}
	h.cache[key] = route
}

func (h *Handler) load(ctx context.Context, key string) (Route, bool) {
	if h.db == nil {
		return Route{}, false
	}
	var raw string
	if err := h.db.QueryRowContext(ctx, `SELECT route FROM route_cache WHERE cache_key = ?`, key).Scan(&raw); err != nil {
		return Route{}, false
	}
	var route Route
	if err := json.Unmarshal([]byte(raw), &route); err != nil || len(route.Coords) < 2 {
		return Route{}, false
	}
	return route, true
}

func (h *Handler) store(ctx context.Context, key string, route Route) {
	if h.db == nil {
		return
	}
	raw, err := json.Marshal(route)
	if err != nil {
		return
	}
	if _, err := h.db.ExecContext(ctx,
		`INSERT INTO route_cache (cache_key, route) VALUES (?, ?)
		 ON CONFLICT(cache_key) DO UPDATE SET route = excluded.route`, key, string(raw)); err != nil {
		slog.Warn("route cache write failed", "error", err)
	}
}

func (h *Handler) fetch(ctx context.Context, profile string, from, to [2]float64) (Route, error) {
	body, err := json.Marshal(map[string]any{"coordinates": [][2]float64{from, to}})
	if err != nil {
		return Route{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		h.baseURL+"/v2/directions/"+profile+"/geojson", bytes.NewReader(body))
	if err != nil {
		return Route{}, err
	}
	req.Header.Set("Authorization", h.key)
	req.Header.Set("Content-Type", "application/json")

	res, err := h.client.Do(req)
	if err != nil {
		return Route{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Route{}, fmt.Errorf("routing upstream status %d", res.StatusCode)
	}

	var data struct {
		Features []struct {
			Geometry struct {
				Coordinates [][]float64 `json:"coordinates"`
			} `json:"geometry"`
			Properties struct {
				Summary struct {
					Distance float64 `json:"distance"`
					Duration float64 `json:"duration"`
				} `json:"summary"`
			} `json:"properties"`
		} `json:"features"`
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return Route{}, err
	}
	if len(data.Features) == 0 || len(data.Features[0].Geometry.Coordinates) < 2 {
		return Route{}, fmt.Errorf("routing upstream returned no route")
	}

	f := data.Features[0]
	coords := make([][2]float64, 0, len(f.Geometry.Coordinates))
	for _, c := range f.Geometry.Coordinates {
		if len(c) < 2 {
			return Route{}, fmt.Errorf("routing upstream returned a malformed point")
		}
		coords = append(coords, [2]float64{c[0], c[1]})
	}
	return Route{
		Minutes: max(1, int(math.Round(f.Properties.Summary.Duration/60))),
		Meters:  f.Properties.Summary.Distance,
		Coords:  coords,
	}, nil
}

func parsePoint(value string) ([2]float64, bool) {
	parts := strings.Split(value, ",")
	if len(parts) != 2 {
		return [2]float64{}, false
	}
	lng, errLng := strconv.ParseFloat(parts[0], 64)
	lat, errLat := strconv.ParseFloat(parts[1], 64)
	if errLng != nil || errLat != nil || math.Abs(lng) > 180 || math.Abs(lat) > 90 {
		return [2]float64{}, false
	}
	return [2]float64{lng, lat}, true
}
