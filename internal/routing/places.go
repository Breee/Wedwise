package routing

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/Breee/Wedwise/internal/httpx"
)

const (
	maxPlaceQuery = 200
	maxPlaces     = 6
	nearRadiusKm  = 40
)

// Place is one search result for the editor.
type Place struct {
	Name  string  `json:"name"`
	Label string  `json:"label"`
	Lat   float64 `json:"lat"`
	Lng   float64 `json:"lng"`
}

// Places answers ?q=text&near=lng,lat with matching places, so editors never
// have to type coordinates.
func (h *Handler) Places(w http.ResponseWriter, r *http.Request) {
	if h.key == "" {
		httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "Place search is not configured.")
		return
	}
	text := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(text) < 3 || len(text) > maxPlaceQuery {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "Invalid place search.")
		return
	}

	query := url.Values{"text": {text}, "size": {fmt.Sprint(maxPlaces)}}
	if near, ok := parsePoint(r.URL.Query().Get("near")); ok {
		query.Set("focus.point.lon", fmt.Sprint(near[0]))
		query.Set("focus.point.lat", fmt.Sprint(near[1]))
		// Stops and hotels are near the venue; without a boundary the
		// search prefers famous places of the same name elsewhere.
		query.Set("boundary.circle.lon", fmt.Sprint(near[0]))
		query.Set("boundary.circle.lat", fmt.Sprint(near[1]))
		query.Set("boundary.circle.radius", fmt.Sprint(nearRadiusKm))
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, h.baseURL+"/geocode/search?"+query.Encode(), nil)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "Place search failed.")
		return
	}
	req.Header.Set("Authorization", h.key)

	res, err := h.client.Do(req)
	if err != nil {
		slog.Warn("place search failed", "error", err)
		httpx.WriteError(w, http.StatusBadGateway, httpx.CodeInternal, "Place search is unavailable.")
		return
	}
	defer res.Body.Close()

	var data struct {
		Features []struct {
			Geometry struct {
				Coordinates []float64 `json:"coordinates"`
			} `json:"geometry"`
			Properties struct {
				Name  string `json:"name"`
				Label string `json:"label"`
			} `json:"properties"`
		} `json:"features"`
	}
	if res.StatusCode != http.StatusOK || json.NewDecoder(res.Body).Decode(&data) != nil {
		slog.Warn("place search failed", "status", res.StatusCode)
		httpx.WriteError(w, http.StatusBadGateway, httpx.CodeInternal, "Place search is unavailable.")
		return
	}

	places := make([]Place, 0, len(data.Features))
	for _, f := range data.Features {
		if len(f.Geometry.Coordinates) < 2 {
			continue
		}
		places = append(places, Place{
			Name:  f.Properties.Name,
			Label: f.Properties.Label,
			Lng:   f.Geometry.Coordinates[0],
			Lat:   f.Geometry.Coordinates[1],
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"places": places})
}
