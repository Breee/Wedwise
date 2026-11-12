package server

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/Breee/Wedwise/internal/configuration"
)

var editTokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)

type manifestIcon struct {
	Src     string `json:"src"`
	Sizes   string `json:"sizes"`
	Type    string `json:"type"`
	Purpose string `json:"purpose,omitempty"`
}

type manifest struct {
	Name            string         `json:"name"`
	ShortName       string         `json:"short_name"`
	StartURL        string         `json:"start_url"`
	Scope           string         `json:"scope"`
	Display         string         `json:"display"`
	BackgroundColor string         `json:"background_color"`
	ThemeColor      string         `json:"theme_color"`
	Icons           []manifestIcon `json:"icons"`
}

// manifestHandler serves the web app manifest. With a valid ?token= the
// installed app starts at that guest's editable response, because an installed
// app does not share browser storage on every platform.
func manifestHandler(event configuration.EventConfig) http.HandlerFunc {
	name := event.Title
	names := make([]string, 0, len(event.Couple))
	for _, c := range event.Couple {
		if n := strings.TrimSpace(c.Name); n != "" {
			names = append(names, n)
		}
	}
	if len(names) > 0 {
		name = strings.Join(names, " & ")
	}
	if name == "" {
		name = "Wedding"
	}

	return func(w http.ResponseWriter, r *http.Request) {
		start := "/"
		if token := r.URL.Query().Get("token"); editTokenPattern.MatchString(token) {
			start = "/rsvp?token=" + url.QueryEscape(token)
		}
		w.Header().Set("Content-Type", "application/manifest+json")
		w.Header().Set("Cache-Control", "no-cache")
		_ = json.NewEncoder(w).Encode(manifest{
			Name:            name,
			ShortName:       name,
			StartURL:        start,
			Scope:           "/",
			Display:         "standalone",
			BackgroundColor: "#121c17",
			ThemeColor:      "#121c17",
			Icons: []manifestIcon{
				{Src: "/icons/icon-192.png", Sizes: "192x192", Type: "image/png"},
				{Src: "/icons/icon-512.png", Sizes: "512x512", Type: "image/png"},
				{Src: "/icons/icon-maskable-512.png", Sizes: "512x512", Type: "image/png", Purpose: "maskable"},
			},
		})
	}
}
