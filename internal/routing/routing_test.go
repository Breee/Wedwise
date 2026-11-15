package routing

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Breee/Wedwise/internal/database"
)

func upstream(t *testing.T, calls *int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls++
		if r.Header.Get("Authorization") != "secret" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if r.URL.Path != "/v2/directions/foot-walking/geojson" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte(`{"features":[{"geometry":{"coordinates":[[7.85,47.99],[7.87,47.98]]},"properties":{"summary":{"distance":750,"duration":590}}}]}`))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func get(h *Handler, query string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/route?"+query, nil))
	return rec
}

func TestRouteProxiesAndCaches(t *testing.T) {
	calls := 0
	h := NewHandler("secret", nil)
	h.baseURL = upstream(t, &calls).URL

	const query = "profile=foot&from=7.85,47.99&to=7.87,47.98"
	rec := get(h, query)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}
	var route Route
	if err := json.Unmarshal(rec.Body.Bytes(), &route); err != nil {
		t.Fatal(err)
	}
	if route.Minutes != 10 || route.Meters != 750 || len(route.Coords) != 2 {
		t.Fatalf("unexpected route %+v", route)
	}

	if rec := get(h, query); rec.Code != http.StatusOK {
		t.Fatalf("cached status = %d", rec.Code)
	}
	if calls != 1 {
		t.Fatalf("upstream calls = %d, want 1", calls)
	}
}

func TestRouteDisabledWithoutKey(t *testing.T) {
	if rec := get(NewHandler("", nil), "profile=foot&from=7.85,47.99&to=7.87,47.98"); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestRouteValidation(t *testing.T) {
	calls := 0
	h := NewHandler("secret", nil)
	h.baseURL = upstream(t, &calls).URL

	for _, query := range []string{
		"profile=plane&from=7.85,47.99&to=7.87,47.98",
		"profile=foot&from=7.85&to=7.87,47.98",
		"profile=foot&from=7.85,47.99&to=x,y",
		"profile=foot&from=200,47.99&to=7.87,47.98",
	} {
		if rec := get(h, query); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", query, rec.Code)
		}
	}
	if calls != 0 {
		t.Fatalf("upstream called %d times for invalid input", calls)
	}
}

func TestRouteUpstreamFailure(t *testing.T) {
	calls := 0
	h := NewHandler("wrong", nil)
	h.baseURL = upstream(t, &calls).URL

	rec := get(h, "profile=foot&from=7.85,47.99&to=7.87,47.98")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
}

func TestRouteCacheSurvivesRestart(t *testing.T) {
	db, err := database.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := database.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}

	calls := 0
	srv := upstream(t, &calls)
	const query = "profile=foot&from=7.85,47.99&to=7.87,47.98"
	for range 2 {
		h := NewHandler("secret", db)
		h.baseURL = srv.URL
		if rec := get(h, query); rec.Code != http.StatusOK {
			t.Fatalf("status = %d", rec.Code)
		}
	}
	if calls != 1 {
		t.Fatalf("upstream calls = %d, want 1", calls)
	}
}

func TestWarmFillsTheCache(t *testing.T) {
	calls := 0
	h := NewHandler("secret", nil)
	h.baseURL = upstream(t, &calls).URL
	h.warmPause = 0

	h.Warm([]Leg{{Profile: "foot", From: [2]float64{7.85, 47.99}, To: [2]float64{7.87, 47.98}}}, nil, nil)
	deadline := time.Now().Add(2 * time.Second)
	for {
		h.mu.Lock()
		filled := len(h.cache)
		h.mu.Unlock()
		if filled == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("route was not warmed")
		}
		time.Sleep(10 * time.Millisecond)
	}

	if rec := get(h, "profile=foot&from=7.85,47.99&to=7.87,47.98"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if calls != 1 {
		t.Fatalf("upstream calls = %d, want 1", calls)
	}
}

func TestPlaces(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/geocode/search" || r.Header.Get("Authorization") != "secret" ||
			r.URL.Query().Get("text") != "Musikhochschule" || r.URL.Query().Get("focus.point.lon") != "7.87" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		_, _ = w.Write([]byte(`{"features":[{"geometry":{"coordinates":[7.873,47.988]},"properties":{"name":"Musikhochschule","label":"Musikhochschule, Freiburg"}},{"geometry":{"coordinates":[]}}]}`))
	}))
	t.Cleanup(srv.Close)
	h := NewHandler("secret", nil)
	h.baseURL = srv.URL

	search := func(h *Handler, query string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.Places(rec, httptest.NewRequest(http.MethodGet, "/api/places?"+query, nil))
		return rec
	}

	rec := search(h, "q=Musikhochschule&near=7.87,47.98")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body struct{ Places []Place }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Places) != 1 || body.Places[0].Lat != 47.988 || body.Places[0].Label != "Musikhochschule, Freiburg" {
		t.Fatalf("places = %+v", body.Places)
	}
	if rec := search(h, "q=ab"); rec.Code != http.StatusBadRequest {
		t.Fatalf("short query status = %d", rec.Code)
	}
	if rec := search(h, "q=Unbekannt"); rec.Code != http.StatusBadGateway {
		t.Fatalf("upstream failure status = %d", rec.Code)
	}
	if rec := search(NewHandler("", nil), "q=Musikhochschule"); rec.Code != http.StatusNotFound {
		t.Fatalf("disabled status = %d", rec.Code)
	}
}

func TestNearby(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/geocode/reverse" {
			_, _ = fmt.Fprint(w, `{"features":[{"properties":{"street":"Waldseestraße","housenumber":"84"}}]}`)
			return
		}
		if r.URL.Path != "/pois" || r.Method != http.MethodPost || r.Header.Get("Authorization") != "secret" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		feature := func(name, category string, lng float64) string {
			return fmt.Sprintf(`{"geometry":{"coordinates":[%v,47.98]},"properties":{"category_ids":{"1":{"category_name":%q}},"osm_tags":{"name":%q}}}`, lng, category, name)
		}
		_, _ = fmt.Fprintf(w, `{"features":[%s]}`, strings.Join([]string{
			feature("Stadthalle", "platform", 7.1),
			feature("Stadthalle", "tram_stop", 7.2),
			feature("Gasthaus Schiff", "platform", 7.3),
			feature("Gasthaus Schiff", "stop_position", 7.4),
			feature("", "parking", 7.5),
			feature("", "platform", 7.6),
			feature("Shell", "fuel", 7.7),
		}, ","))
	}))
	t.Cleanup(srv.Close)
	h := NewHandler("secret", nil)
	h.baseURL = srv.URL

	rec := httptest.NewRecorder()
	h.Nearby(rec, httptest.NewRequest(http.MethodGet, "/api/places/nearby?at=7.87,47.98", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body struct{ Places []NearbyPlace }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	want := []NearbyPlace{
		{Name: "Stadthalle", Kind: "tram", Lat: 47.98, Lng: 7.2},
		{Name: "Gasthaus Schiff", Kind: "bus", Lat: 47.98, Lng: 7.3},
		{Name: "", Kind: "parking", Street: "Waldseestraße 84", Lat: 47.98, Lng: 7.5},
	}
	if !reflect.DeepEqual(body.Places, want) {
		t.Fatalf("places = %+v", body.Places)
	}

	rec = httptest.NewRecorder()
	h.Nearby(rec, httptest.NewRequest(http.MethodGet, "/api/places/nearby?at=nowhere", nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad point status = %d", rec.Code)
	}
}

func TestNearbyStays(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = fmt.Fprint(w, `{"features":[
			{"geometry":{"coordinates":[7.1,47.98]},"properties":{"category_ids":{"1":{"category_name":"camp_site"}},"osm_tags":{"name":"Camping"}}},
			{"geometry":{"coordinates":[7.2,47.98]},"properties":{"category_ids":{"1":{"category_name":"hotel"}},"osm_tags":{"name":"Gasthaus","website":"https://gasthaus.example/"}}},
			{"geometry":{"coordinates":[7.3,47.98]},"properties":{"category_ids":{"1":{"category_name":"apartment"}},"osm_tags":{"name":"Wohnung","website":"javascript:alert(1)"}}},
			{"geometry":{"coordinates":[7.4,47.98]},"properties":{"category_ids":{"1":{"category_name":"hotel"}},"osm_tags":{}}}
		]}`)
	}))
	t.Cleanup(srv.Close)
	h := NewHandler("secret", nil)
	h.baseURL = srv.URL

	rec := httptest.NewRecorder()
	h.Nearby(rec, httptest.NewRequest(http.MethodGet, "/api/places/nearby?at=7.87,47.98&kind=stay", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body struct{ Places []NearbyPlace }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	want := []NearbyPlace{
		{Name: "Gasthaus", Kind: "hotel", Website: "https://gasthaus.example/", Lat: 47.98, Lng: 7.2},
		{Name: "Wohnung", Kind: "apartment", Lat: 47.98, Lng: 7.3},
	}
	if !reflect.DeepEqual(body.Places, want) {
		t.Fatalf("places = %+v", body.Places)
	}
}

func TestBoardingStop(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = fmt.Fprint(w, `{"features":[
			{"geometry":{"coordinates":[7.1,47.98]},"properties":{"category_ids":{"1":{"category_name":"bus_stop"}},"osm_tags":{"name":"Bus"}}},
			{"geometry":{"coordinates":[7.2,47.98]},"properties":{"category_ids":{"1":{"category_name":"tram_stop"}},"osm_tags":{"name":"Tram"}}}]}`)
	}))
	t.Cleanup(srv.Close)
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`CREATE TABLE route_cache (cache_key TEXT PRIMARY KEY, route TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	h := NewHandler("secret", db)
	h.baseURL = srv.URL
	at := [2]float64{7.15, 47.98}
	to := [2]float64{7.3, 47.98}

	ask := func(kind string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.Stop(rec, httptest.NewRequest(http.MethodGet, "/?at=7.15,47.98&to=7.3,47.98&kind="+kind, nil))
		return rec
	}
	if rec := ask("tram"); rec.Code != http.StatusNotFound || calls != 0 {
		t.Fatalf("guests must not trigger lookups: status %d, calls %d", rec.Code, calls)
	}
	stop, found, err := h.boardingStop(context.Background(), Boarding{Kind: "tram", To: to}, at)
	if err != nil || !found || stop.Stop.Name != "Tram" {
		t.Fatalf("stop = %+v, %v, %v", stop, found, err)
	}
	if _, found, _ := h.boardingStop(context.Background(), Boarding{Kind: "train", To: to}, at); found {
		t.Fatal("no train stop expected")
	}
	if rec := ask("tram"); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"name":"Tram"`) {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
	if rec := ask("train"); rec.Code != http.StatusNotFound {
		t.Fatalf("status %d", rec.Code)
	}
	before := calls
	_, _, _ = h.boardingStop(context.Background(), Boarding{Kind: "train", To: to}, at)
	if calls != before {
		t.Fatal("answers, also empty ones, must be cached")
	}
}

func TestBoardingStopOnTheLine(t *testing.T) {
	routes := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"features":[
			{"geometry":{"coordinates":[7.30,47.98]},"properties":{"osm_id":3,"osm_type":1,"category_ids":{"1":{"category_name":"tram_stop"}},"osm_tags":{"name":"Venue"}}}]}`)
	}))
	t.Cleanup(routes.Close)
	maps := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/node/3/relations.json":
			fmt.Fprint(w, `{"elements":[
				{"type":"relation","id":7,"tags":{"type":"route","route":"tram","ref":"7"}},
				{"type":"relation","id":1,"tags":{"type":"route","route":"tram","ref":"1"}}]}`)
		case "/relation/1/full.json":
			// The first way is laid against the direction of travel.
			fmt.Fprint(w, `{"elements":[
				{"type":"node","id":1,"lat":47.98,"lon":7.10,"tags":{"name":"Far"}},
				{"type":"node","id":2,"lat":47.98,"lon":7.20,"tags":{"name":"Near"}},
				{"type":"node","id":3,"lat":47.98,"lon":7.30,"tags":{"name":"Venue"}},
				{"type":"node","id":4,"lat":47.98,"lon":7.40,"tags":{"name":"Beyond"}},
				{"type":"way","id":10,"nodes":[2,1]},
				{"type":"way","id":11,"nodes":[2,3]},
				{"type":"way","id":12,"nodes":[4,3]},
				{"type":"relation","id":1,"members":[
					{"type":"node","ref":1,"role":"stop"},{"type":"node","ref":2,"role":"stop"},
					{"type":"node","ref":3,"role":"stop"},{"type":"node","ref":4,"role":"stop_exit_only"},
					{"type":"way","ref":10,"role":""},{"type":"way","ref":11,"role":""},{"type":"way","ref":12,"role":""}]}]}`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(maps.Close)

	h := NewHandler("secret", nil)
	h.baseURL, h.mapURL = routes.URL, maps.URL
	b := Boarding{Kind: "tram", Line: "1 → Somewhere", To: [2]float64{7.30, 47.98}}

	board, found, err := h.boardingStop(context.Background(), b, [2]float64{7.21, 47.99})
	if err != nil || !found || board.Stop.Name != "Near" || board.Ride == nil {
		t.Fatalf("board = %+v, %v, %v", board, found, err)
	}
	if want := [][2]float64{{7.20, 47.98}, {7.30, 47.98}}; !reflect.DeepEqual(board.Ride.Coordinates, want) {
		t.Fatalf("ride = %v", board.Ride.Coordinates)
	}
	if board.Ride.Meters < 7000 || board.Ride.Meters > 8000 {
		t.Fatalf("meters = %d", board.Ride.Meters)
	}

	// Coming from beyond the venue the ride runs the other way.
	board, _, _ = h.boardingStop(context.Background(), b, [2]float64{7.41, 47.98})
	if want := [][2]float64{{7.40, 47.98}, {7.30, 47.98}}; board.Stop.Name != "Beyond" || !reflect.DeepEqual(board.Ride.Coordinates, want) {
		t.Fatalf("board = %+v", board)
	}

	// At the venue stop itself there is nothing to ride.
	board, _, _ = h.boardingStop(context.Background(), b, [2]float64{7.31, 47.98})
	if board.Stop.Name != "Venue" || board.Ride != nil {
		t.Fatalf("board = %+v", board)
	}
}
