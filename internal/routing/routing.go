// Package routing proxies route lookups to OpenRouteService so the API key
// never reaches the browser.
package routing

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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

	mu    sync.Mutex
	cache map[string]Route
}

// NewHandler creates a handler. An empty key disables the endpoint.
func NewHandler(key string) *Handler {
	return &Handler{
		key:     strings.TrimSpace(key),
		baseURL: defaultBaseURL,
		client:  &http.Client{Timeout: 8 * time.Second},
		cache:   map[string]Route{},
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

	cacheKey := fmt.Sprintf("%s|%.5f,%.5f|%.5f,%.5f", profile, from[0], from[1], to[0], to[1])
	h.mu.Lock()
	cached, hit := h.cache[cacheKey]
	h.mu.Unlock()
	if hit {
		httpx.WriteJSON(w, http.StatusOK, cached)
		return
	}

	route, err := h.fetch(r.Context(), profile, from, to)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, httpx.CodeInternal, "Routing is unavailable.")
		return
	}

	h.mu.Lock()
	if len(h.cache) >= maxCacheSize {
		h.cache = map[string]Route{}
	}
	h.cache[cacheKey] = route
	h.mu.Unlock()
	httpx.WriteJSON(w, http.StatusOK, route)
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
