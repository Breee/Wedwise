package routing

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"

	"github.com/Breee/Wedwise/internal/httpx"
)

const (
	defaultMapURL = "https://api.openstreetmap.org/api/0.6"
	// maxStopCandidates bounds how many map entries near the venue stop are
	// asked for the line that serves them.
	maxStopCandidates = 4
)

// lineRoutes maps a stop kind onto the kinds of line that serve it.
var lineRoutes = map[string][]string{
	"tram":  {"tram", "light_rail"},
	"bus":   {"bus", "trolleybus"},
	"train": {"train", "light_rail", "subway"},
}

// Boarding says which line guests take to the venue: the kind and name of
// the line and the stop they get off at.
type Boarding struct {
	Kind string
	// Line is the text entered for the stop, e.g. "1 → Littenweiler". Its
	// first word names the line.
	Line string
	// To is the stop at the venue, lng, lat.
	To [2]float64
}

// Ride is the way along the line between two of its stops.
type Ride struct {
	Meters      int          `json:"meters"`
	Coordinates [][2]float64 `json:"coordinates"`
}

// Board is where guests get on, and the ride from there when the line is
// known.
type Board struct {
	Stop NearbyPlace `json:"stop"`
	Ride *Ride       `json:"ride,omitempty"`
}

type lineStop struct {
	Name  string  `json:"name"`
	Lat   float64 `json:"lat"`
	Lng   float64 `json:"lng"`
	Index int     `json:"index"`
}

// transitLine is the track of one line and the stops along it.
type transitLine struct {
	Stops  []lineStop   `json:"stops"`
	Coords [][2]float64 `json:"coords"`
}

func (b Boarding) ref() string {
	fields := strings.Fields(b.Line)
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}

func boardKey(b Boarding, at [2]float64) string {
	return fmt.Sprintf("board3|%s|%s|%.4f,%.4f|%.4f,%.4f", b.Kind, b.ref(), b.To[0], b.To[1], at[0], at[1])
}

// boardingStop finds where guests coming from a point get on. With a known
// line that is its nearest stop; otherwise the nearest stop of that kind.
// The answer is remembered, also when there is none.
func (h *Handler) boardingStop(ctx context.Context, b Boarding, at [2]float64) (Board, bool, error) {
	var cached []Board
	if !h.loadJSON(ctx, boardKey(b, at), &cached) {
		cached = []Board{}
		line, found, err := h.line(ctx, b)
		if err != nil {
			return Board{}, false, err
		}
		if found {
			cached = append(cached, line.board(b, at))
		} else {
			features, err := h.pois(ctx, at, transportGroup)
			if err != nil {
				return Board{}, false, err
			}
			for _, place := range stops(features) {
				if place.Kind == b.Kind {
					cached = append(cached, Board{Stop: place})
					break
				}
			}
		}
		h.storeJSON(ctx, boardKey(b, at), cached)
	}
	if len(cached) == 0 {
		return Board{}, false, nil
	}
	return cached[0], true, nil
}

// Stop answers ?at=lng,lat&to=lng,lat&kind=tram&line=1 with the stop guests
// from that point get on at. It is open to guests, so it only reads what
// Warm has found before and never asks the map service itself.
func (h *Handler) Stop(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	at, ok := parsePoint(query.Get("at"))
	to, okTo := parsePoint(query.Get("to"))
	b := Boarding{Kind: query.Get("kind"), Line: query.Get("line"), To: to}
	var cached []Board
	if !ok || !okTo || !h.loadJSON(r.Context(), boardKey(b, at), &cached) || len(cached) == 0 {
		httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "No stop known.")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	httpx.WriteJSON(w, http.StatusOK, cached[0])
}

func lineKey(b Boarding) string {
	return fmt.Sprintf("line|%s|%s|%.4f,%.4f", b.Kind, b.ref(), b.To[0], b.To[1])
}

// Line answers ?to=lng,lat&kind=tram&line=1 with the stops and track of the
// line that serves the stop at the venue. Like Stop it only reads what Warm
// has found before.
func (h *Handler) Line(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	to, ok := parsePoint(query.Get("to"))
	b := Boarding{Kind: query.Get("kind"), Line: query.Get("line"), To: to}
	var cached transitLine
	if !ok || !h.loadJSON(r.Context(), lineKey(b), &cached) || len(cached.Stops) < 2 {
		httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "No line known.")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	httpx.WriteJSON(w, http.StatusOK, cached)
}

// board picks the stop of the line nearest to a point and the ride from
// there to the stop at the venue.
func (l transitLine) board(b Boarding, at [2]float64) Board {
	on := l.nearest(at)
	off := l.nearest(b.To)
	board := Board{Stop: NearbyPlace{Name: on.Name, Kind: b.Kind, Lat: on.Lat, Lng: on.Lng}}
	if on.Index == off.Index {
		return board
	}
	from, to := on.Index, off.Index
	var coords [][2]float64
	if from < to {
		coords = append(coords, l.Coords[from:to+1]...)
	} else {
		for i := from; i >= to; i-- {
			coords = append(coords, l.Coords[i])
		}
	}
	meters := 0.0
	for i := 1; i < len(coords); i++ {
		meters += distance(coords[i-1], coords[i])
	}
	board.Ride = &Ride{Meters: int(math.Round(meters)), Coordinates: coords}
	return board
}

func (l transitLine) nearest(p [2]float64) lineStop {
	best, bestDistance := l.Stops[0], math.Inf(1)
	for _, stop := range l.Stops {
		if d := distance(p, [2]float64{stop.Lng, stop.Lat}); d < bestDistance {
			best, bestDistance = stop, d
		}
	}
	return best
}

// distance is the way between two lng, lat points in metres.
func distance(a, b [2]float64) float64 {
	const radius = 6371000.0
	rad := math.Pi / 180
	dLat := (b[1] - a[1]) * rad
	dLng := (b[0] - a[0]) * rad
	s := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(a[1]*rad)*math.Cos(b[1]*rad)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * radius * math.Asin(math.Sqrt(s))
}

// line finds the line that serves the stop at the venue: the map entries of
// that stop name the lines passing through, and the line itself lists its
// stops and track. The answer is remembered, also when there is none.
func (h *Handler) line(ctx context.Context, b Boarding) (transitLine, bool, error) {
	key := lineKey(b)
	var cached transitLine
	if h.loadJSON(ctx, key, &cached) {
		return cached, len(cached.Stops) > 1, nil
	}
	features, err := h.pois(ctx, b.To, transportGroup)
	if err != nil {
		return transitLine{}, false, err
	}
	asked := 0
	for _, f := range features {
		if f.Properties.OsmType != 1 || !f.stop() {
			continue
		}
		if asked++; asked > maxStopCandidates {
			break
		}
		id, err := h.lineAt(ctx, f.Properties.OsmID, b)
		if err != nil {
			return transitLine{}, false, err
		}
		if id == 0 {
			continue
		}
		if cached, err = h.lineTrack(ctx, id); err != nil {
			return transitLine{}, false, err
		}
		if len(cached.Stops) > 1 {
			break
		}
	}
	h.storeJSON(ctx, key, cached)
	return cached, len(cached.Stops) > 1, nil
}

func (f poi) stop() bool {
	for _, category := range f.Properties.Categories {
		if _, ok := stopKinds[category.Name]; ok {
			return true
		}
	}
	return false
}

type mapElement struct {
	Type    string            `json:"type"`
	ID      int64             `json:"id"`
	Lat     float64           `json:"lat"`
	Lon     float64           `json:"lon"`
	Nodes   []int64           `json:"nodes"`
	Tags    map[string]string `json:"tags"`
	Members []struct {
		Type string `json:"type"`
		Ref  int64  `json:"ref"`
		Role string `json:"role"`
	} `json:"members"`
}

func (h *Handler) mapElements(ctx context.Context, path string) ([]mapElement, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.mapURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "wedwise (https://github.com/Breee/Wedwise)")
	res, err := h.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("map status %d", res.StatusCode)
	}
	var data struct {
		Elements []mapElement `json:"elements"`
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, err
	}
	return data.Elements, nil
}

// lineAt returns the id of the line through a stop, or 0.
func (h *Handler) lineAt(ctx context.Context, node int64, b Boarding) (int64, error) {
	relations, err := h.mapElements(ctx, fmt.Sprintf("/node/%d/relations.json", node))
	if err != nil {
		return 0, err
	}
	for _, relation := range relations {
		if relation.Tags["type"] != "route" || (b.ref() != "" && relation.Tags["ref"] != b.ref()) {
			continue
		}
		for _, route := range lineRoutes[b.Kind] {
			if relation.Tags["route"] == route {
				return relation.ID, nil
			}
		}
	}
	return 0, nil
}

// lineTrack reads the stops and the track of a line.
func (h *Handler) lineTrack(ctx context.Context, id int64) (transitLine, error) {
	elements, err := h.mapElements(ctx, fmt.Sprintf("/relation/%d/full.json", id))
	if err != nil {
		return transitLine{}, err
	}
	nodes := map[int64]mapElement{}
	ways := map[int64][]int64{}
	var relation mapElement
	for _, e := range elements {
		switch e.Type {
		case "node":
			nodes[e.ID] = e
		case "way":
			ways[e.ID] = e.Nodes
		case "relation":
			if e.ID == id {
				relation = e
			}
		}
	}

	var parts [][]int64
	for _, m := range relation.Members {
		if m.Type == "way" && m.Role == "" && len(ways[m.Ref]) > 0 {
			parts = append(parts, append([]int64{}, ways[m.Ref]...))
		}
	}
	// The first way may be laid the wrong way round: its end has to meet
	// the second one.
	if len(parts) > 1 {
		end, next := parts[0][len(parts[0])-1], parts[1]
		if end != next[0] && end != next[len(next)-1] {
			reverse(parts[0])
		}
	}
	var track []int64
	for _, part := range parts {
		track = join(track, part)
	}
	var line transitLine
	for _, n := range track {
		if node, ok := nodes[n]; ok {
			line.Coords = append(line.Coords, [2]float64{node.Lon, node.Lat})
		}
	}
	if len(line.Coords) < 2 {
		return transitLine{}, nil
	}

	seen := map[string]bool{}
	for _, m := range relation.Members {
		node, ok := nodes[m.Ref]
		name := node.Tags["name"]
		if m.Type != "node" || !ok || !strings.HasPrefix(m.Role, "stop") || name == "" || seen[name] {
			continue
		}
		seen[name] = true
		at := [2]float64{node.Lon, node.Lat}
		index, best := 0, math.Inf(1)
		for i, c := range line.Coords {
			if d := distance(at, c); d < best {
				index, best = i, d
			}
		}
		line.Stops = append(line.Stops, lineStop{Name: name, Lat: node.Lat, Lng: node.Lon, Index: index})
	}
	return line, nil
}

// join appends a way to a track, turning either around so their ends meet.
func join(track, way []int64) []int64 {
	if len(track) == 0 {
		return append(track, way...)
	}
	first, last := way[0], way[len(way)-1]
	end := track[len(track)-1]
	switch {
	case end == first:
		return append(track, way[1:]...)
	case end == last:
		turned := append([]int64{}, way...)
		reverse(turned)
		return append(track, turned[1:]...)
	default:
		return append(track, way...)
	}
}

func reverse(s []int64) {
	for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
		s[i], s[j] = s[j], s[i]
	}
}
