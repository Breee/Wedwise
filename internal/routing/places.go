package routing

import (
	"bytes"
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

const (
	nearbyRadiusMeters = 1500
	maxNearby          = 40
	transportGroup     = 580
)

// NearbyPlace is a stop or car park close to a point, offered to editors as
// a suggestion they can add with one click.
type NearbyPlace struct {
	Name string  `json:"name"`
	Kind string  `json:"kind"`
	Lat  float64 `json:"lat"`
	Lng  float64 `json:"lng"`
}

// stopKinds ranks the map categories that say what serves a stop. Platforms
// and stop positions carry no kind of their own: they are bus stops unless
// another entry of the same name says otherwise.
var stopKinds = map[string]struct {
	kind string
	rank int
}{
	"station":       {"train", 3},
	"halt":          {"train", 3},
	"tram_stop":     {"tram", 2},
	"bus_stop":      {"bus", 1},
	"bus_station":   {"bus", 1},
	"platform":      {"bus", 0},
	"stop_position": {"bus", 0},
}

// Nearby answers ?at=lng,lat with the stops and car parks around that point.
func (h *Handler) Nearby(w http.ResponseWriter, r *http.Request) {
	if h.key == "" {
		httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "Place search is not configured.")
		return
	}
	at, ok := parsePoint(r.URL.Query().Get("at"))
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "Invalid point.")
		return
	}
	payload, _ := json.Marshal(map[string]any{
		"request": "pois",
		"geometry": map[string]any{
			"geojson": map[string]any{"type": "Point", "coordinates": at},
			"buffer":  nearbyRadiusMeters,
		},
		"filters": map[string]any{"category_group_ids": []int{transportGroup}},
		"limit":   500,
		"sortby":  "distance",
	})
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, h.baseURL+"/pois", bytes.NewReader(payload))
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "Place search failed.")
		return
	}
	req.Header.Set("Authorization", h.key)
	req.Header.Set("Content-Type", "application/json")

	res, err := h.client.Do(req)
	if err != nil {
		slog.Warn("nearby search failed", "error", err)
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
				Categories map[string]struct {
					Name string `json:"category_name"`
				} `json:"category_ids"`
				Tags struct {
					Name string `json:"name"`
				} `json:"osm_tags"`
			} `json:"properties"`
		} `json:"features"`
	}
	if res.StatusCode != http.StatusOK || json.NewDecoder(res.Body).Decode(&data) != nil {
		slog.Warn("nearby search failed", "status", res.StatusCode)
		httpx.WriteError(w, http.StatusBadGateway, httpx.CodeInternal, "Place search is unavailable.")
		return
	}

	// Features arrive nearest first. A stop appears once per platform and
	// direction, so keep the nearest entry per name with its best kind.
	places := make([]NearbyPlace, 0, maxNearby)
	stops := map[string]int{}
	ranks := map[string]int{}
	parking := 0
	for _, f := range data.Features {
		if len(f.Geometry.Coordinates) < 2 {
			continue
		}
		name := strings.TrimSpace(f.Properties.Tags.Name)
		for _, category := range f.Properties.Categories {
			if category.Name == "parking" && parking < 8 && len(places) < maxNearby {
				parking++
				places = append(places, NearbyPlace{Name: name, Kind: "parking", Lng: f.Geometry.Coordinates[0], Lat: f.Geometry.Coordinates[1]})
				break
			}
			stop, known := stopKinds[category.Name]
			if !known || name == "" {
				continue
			}
			if i, seen := stops[name]; seen {
				if stop.rank > ranks[name] {
					ranks[name] = stop.rank
					places[i].Kind = stop.kind
				}
			} else if len(places) < maxNearby {
				stops[name] = len(places)
				ranks[name] = stop.rank
				places = append(places, NearbyPlace{Name: name, Kind: stop.kind, Lng: f.Geometry.Coordinates[0], Lat: f.Geometry.Coordinates[1]})
			}
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"places": places})
}
