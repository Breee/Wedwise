package routing

import (
	"bytes"
	"context"
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
	near, hasNear := parsePoint(r.URL.Query().Get("near"))
	cacheKey := "places|" + strings.ToLower(text)
	if hasNear {
		cacheKey += fmt.Sprintf("|%.2f,%.2f", near[0], near[1])
	}
	var cached []Place
	if h.loadJSON(r.Context(), cacheKey, &cached) {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"places": cached})
		return
	}
	if hasNear {
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
	h.storeJSON(r.Context(), cacheKey, places)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"places": places})
}

// loadJSON and storeJSON keep search answers next to the cached routes, so
// a repeated search costs no request to the routing service.
func (h *Handler) loadJSON(ctx context.Context, key string, into any) bool {
	if h.db == nil {
		return false
	}
	var raw string
	if err := h.db.QueryRowContext(ctx, `SELECT route FROM route_cache WHERE cache_key = ?`, key).Scan(&raw); err != nil {
		return false
	}
	return json.Unmarshal([]byte(raw), into) == nil
}

func (h *Handler) storeJSON(ctx context.Context, key string, value any) {
	if h.db == nil {
		return
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return
	}
	if _, err := h.db.ExecContext(ctx,
		`INSERT INTO route_cache (cache_key, route) VALUES (?, ?)
		 ON CONFLICT(cache_key) DO UPDATE SET route = excluded.route`, key, string(raw)); err != nil {
		slog.Warn("place cache write failed", "error", err)
	}
}

const (
	nearbyRadiusMeters = 2000
	maxNearby          = 40
	transportGroup     = 580
	stayGroup          = 100
	// Car parks rarely have a name; a few nearest ones are enough to pick from.
	maxParking = 4
)

// NearbyPlace is a stop, car park or place to sleep close to a point, offered to editors as
// a suggestion they can add with one click.
type NearbyPlace struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
	// Street tells unnamed car parks apart.
	Street string `json:"street,omitempty"`
	// Website is set for places to sleep when the map knows it.
	Website string  `json:"website,omitempty"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
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

// stayKinds maps the map categories of places to sleep onto the two kinds
// the site knows. Camp sites and huts are left out.
var stayKinds = map[string]string{
	"hotel":       "hotel",
	"motel":       "hotel",
	"guest_house": "hotel",
	"hostel":      "hotel",
	"apartment":   "apartment",
	"chalet":      "apartment",
}

type poi struct {
	Geometry struct {
		Coordinates []float64 `json:"coordinates"`
	} `json:"geometry"`
	Properties struct {
		OsmID      int64 `json:"osm_id"`
		OsmType    int   `json:"osm_type"`
		Categories map[string]struct {
			Name string `json:"category_name"`
		} `json:"category_ids"`
		Tags struct {
			Name    string `json:"name"`
			Website string `json:"website"`
		} `json:"osm_tags"`
	} `json:"properties"`
}

// pois lists the map entries of one category group around a point, nearest
// first.
func (h *Handler) pois(ctx context.Context, at [2]float64, group int) ([]poi, error) {
	payload, _ := json.Marshal(map[string]any{
		"request": "pois",
		"geometry": map[string]any{
			"geojson": map[string]any{"type": "Point", "coordinates": at},
			"buffer":  nearbyRadiusMeters,
		},
		"filters": map[string]any{"category_group_ids": []int{group}},
		"limit":   500,
		"sortby":  "distance",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.baseURL+"/pois", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", h.key)
	req.Header.Set("Content-Type", "application/json")

	res, err := h.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	var data struct {
		Features []poi `json:"features"`
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", res.StatusCode)
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, err
	}
	return data.Features, nil
}

// Nearby answers ?at=lng,lat with the stops and car parks around that point,
// or with the places to sleep when ?kind=stay is given.
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
	stay := r.URL.Query().Get("kind") == "stay"
	// Rounded to about 100 m: nudging the venue pin reuses the answer.
	cacheKey := fmt.Sprintf("nearby2|%.3f,%.3f", at[0], at[1])
	group := transportGroup
	if stay {
		cacheKey = fmt.Sprintf("stay|%.3f,%.3f", at[0], at[1])
		group = stayGroup
	}
	var cached []NearbyPlace
	if h.loadJSON(r.Context(), cacheKey, &cached) {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"places": cached})
		return
	}
	features, err := h.pois(r.Context(), at, group)
	if err != nil {
		slog.Warn("nearby search failed", "error", err)
		httpx.WriteError(w, http.StatusBadGateway, httpx.CodeInternal, "Place search is unavailable.")
		return
	}
	var places []NearbyPlace
	if stay {
		places = stays(features)
	} else {
		places = stops(features)
		for i := range places {
			if places[i].Kind == "parking" {
				places[i].Street = h.street(r.Context(), places[i].Lng, places[i].Lat)
			}
		}
	}
	h.storeJSON(r.Context(), cacheKey, places)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"places": places})
}

// stays keeps the named hotels and flats.
func stays(features []poi) []NearbyPlace {
	places := make([]NearbyPlace, 0, maxNearby)
	for _, f := range features {
		name := strings.TrimSpace(f.Properties.Tags.Name)
		if len(f.Geometry.Coordinates) < 2 || name == "" || len(places) == maxNearby {
			continue
		}
		for _, category := range f.Properties.Categories {
			if kind, known := stayKinds[category.Name]; known {
				places = append(places, NearbyPlace{
					Name: name, Kind: kind, Website: webAddress(f.Properties.Tags.Website),
					Lng: f.Geometry.Coordinates[0], Lat: f.Geometry.Coordinates[1],
				})
				break
			}
		}
	}
	return places
}

// webAddress keeps a website from the map only when it is a plain web link.
func webAddress(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	return u.String()
}

// stops keeps the stops and a few car parks. Features arrive nearest first.
// A stop appears once per platform and direction, so keep the nearest entry
// per name with its best kind.
func stops(features []poi) []NearbyPlace {
	places := make([]NearbyPlace, 0, maxNearby)
	seenAt := map[string]int{}
	ranks := map[string]int{}
	parking := 0
	for _, f := range features {
		if len(f.Geometry.Coordinates) < 2 {
			continue
		}
		name := strings.TrimSpace(f.Properties.Tags.Name)
		for _, category := range f.Properties.Categories {
			if category.Name == "parking" && parking < maxParking && len(places) < maxNearby {
				parking++
				places = append(places, NearbyPlace{Name: name, Kind: "parking", Lng: f.Geometry.Coordinates[0], Lat: f.Geometry.Coordinates[1]})
				break
			}
			stop, known := stopKinds[category.Name]
			if !known || name == "" {
				continue
			}
			if i, seen := seenAt[name]; seen {
				if stop.rank > ranks[name] {
					ranks[name] = stop.rank
					places[i].Kind = stop.kind
					places[i].Lng, places[i].Lat = f.Geometry.Coordinates[0], f.Geometry.Coordinates[1]
				}
			} else if len(places) < maxNearby {
				seenAt[name] = len(places)
				ranks[name] = stop.rank
				places = append(places, NearbyPlace{Name: name, Kind: stop.kind, Lng: f.Geometry.Coordinates[0], Lat: f.Geometry.Coordinates[1]})
			}
		}
	}
	return places
}

// street names the street at a point, or returns "" when it is unknown.
func (h *Handler) street(ctx context.Context, lng, lat float64) string {
	query := url.Values{
		"point.lon": {fmt.Sprint(lng)},
		"point.lat": {fmt.Sprint(lat)},
		"size":      {"1"},
		"layers":    {"address,street"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.baseURL+"/geocode/reverse?"+query.Encode(), nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", h.key)
	res, err := h.client.Do(req)
	if err != nil {
		return ""
	}
	defer res.Body.Close()

	var data struct {
		Features []struct {
			Properties struct {
				Street string `json:"street"`
				Number string `json:"housenumber"`
			} `json:"properties"`
		} `json:"features"`
	}
	if res.StatusCode != http.StatusOK || json.NewDecoder(res.Body).Decode(&data) != nil || len(data.Features) == 0 {
		return ""
	}
	found := data.Features[0].Properties
	return strings.TrimSpace(found.Street + " " + found.Number)
}
