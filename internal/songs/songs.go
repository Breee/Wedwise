// Package songs proxies the song search to the iTunes Search API so guests'
// browsers never talk to a third party. Answers are cached in memory.
package songs

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Breee/Wedwise/internal/httpx"
)

const (
	defaultBaseURL = "https://itunes.apple.com"
	minQueryLen    = 3
	maxQueryLen    = 100
	maxResults     = 6
	maxCacheSize   = 500
	maxCoverSize   = 1 << 20
	// Apple serves all cover art from this domain.
	coverDomain = ".mzstatic.com"
)

// Track is one search hit.
type Track struct {
	TrackID    int64  `json:"trackId"`
	TrackName  string `json:"trackName"`
	ArtistName string `json:"artistName"`
	// Cover is a path on this server, see Handler.Cover.
	Cover string `json:"cover"`
}

// Handler serves GET /api/songs?q=.
type Handler struct {
	baseURL string
	client  *http.Client
	covers  *http.Client

	mu    sync.Mutex
	cache map[string][]Track
}

// NewHandler creates a song search handler.
func NewHandler() *Handler {
	return &Handler{
		baseURL: defaultBaseURL,
		client:  &http.Client{Timeout: 5 * time.Second},
		covers: &http.Client{
			Timeout:       5 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		cache: map[string][]Track{},
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	if n := len([]rune(query)); n < minQueryLen || n > maxQueryLen {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "Invalid search query.")
		return
	}

	h.mu.Lock()
	tracks, hit := h.cache[query]
	h.mu.Unlock()
	if !hit {
		var err error
		tracks, err = h.fetch(r.Context(), query)
		if err != nil {
			httpx.WriteError(w, http.StatusBadGateway, httpx.CodeInternal, "Song search is unavailable.")
			return
		}
		h.mu.Lock()
		if len(h.cache) >= maxCacheSize {
			h.cache = map[string][]Track{}
		}
		h.cache[query] = tracks
		h.mu.Unlock()
	}

	w.Header().Set("Cache-Control", "public, max-age=86400")
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"results": tracks})
}

func (h *Handler) fetch(ctx context.Context, query string) ([]Track, error) {
	params := url.Values{
		"media":  {"music"},
		"entity": {"song"},
		"limit":  {fmt.Sprint(maxResults)},
		"term":   {query},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.baseURL+"/search?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	res, err := h.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("song search upstream status %d", res.StatusCode)
	}

	var data struct {
		Results []struct {
			Track
			Artwork string `json:"artworkUrl100"`
		} `json:"results"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&data); err != nil {
		return nil, err
	}
	tracks := make([]Track, 0, maxResults)
	for _, t := range data.Results {
		if len(tracks) == maxResults {
			break
		}
		track := t.Track
		if coverURL(t.Artwork) != nil {
			art := strings.Replace(t.Artwork, "100x100", "200x200", 1)
			track.Cover = "/api/songs/cover?u=" + url.QueryEscape(art)
		}
		tracks = append(tracks, track)
	}
	return tracks, nil
}

// coverURL returns the address when it points at Apple's cover art.
func coverURL(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || !strings.HasSuffix(u.Hostname(), coverDomain) {
		return nil
	}
	return u
}

// Cover serves GET /api/songs/cover?u=, passing one cover image through so
// the guest's browser never contacts Apple. Only Apple's cover art is fetched.
func (h *Handler) Cover(w http.ResponseWriter, r *http.Request) {
	u := coverURL(r.URL.Query().Get("u"))
	if u == nil {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "Invalid cover.")
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, u.String(), nil) // #nosec G704 -- coverURL allows only https on Apple's cover domain
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "Invalid cover.")
		return
	}
	res, err := h.covers.Do(req) // #nosec G704 -- see above; this client follows no redirects
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, httpx.CodeInternal, "Cover is unavailable.")
		return
	}
	defer res.Body.Close()
	kind := res.Header.Get("Content-Type")
	if res.StatusCode != http.StatusOK || (kind != "image/jpeg" && kind != "image/png") || res.ContentLength > maxCoverSize {
		httpx.WriteError(w, http.StatusBadGateway, httpx.CodeInternal, "Cover is unavailable.")
		return
	}
	w.Header().Set("Content-Type", kind)
	w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
	_, _ = io.Copy(w, io.LimitReader(res.Body, maxCoverSize))
}
