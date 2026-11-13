// Package theme provides the color and typography presets of the public site.
package theme

import (
	"fmt"
	"io/fs"
	"os"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/Breee/Wedwise/themes"
)

// DefaultName is the theme used when none is configured.
const DefaultName = "sage-leaf"

// Theme is a complete visual preset. Colors are CSS hex values.
type Theme struct {
	Name       string `yaml:"name" json:"name"`
	Label      string `yaml:"label" json:"label"`
	Decoration string `yaml:"decoration" json:"decoration"` // none, botanical, dusk, forest or night
	Colors     Colors `yaml:"colors" json:"colors"`
	Fonts      Fonts  `yaml:"fonts" json:"fonts"`
}

// Colors maps onto the CSS custom properties of the frontend.
type Colors struct {
	Background          string `yaml:"background" json:"background"`
	Foreground          string `yaml:"foreground" json:"foreground"`
	Card                string `yaml:"card" json:"card"`
	Primary             string `yaml:"primary" json:"primary"`
	PrimaryForeground   string `yaml:"primaryForeground" json:"primaryForeground"`
	Secondary           string `yaml:"secondary" json:"secondary"`
	SecondaryForeground string `yaml:"secondaryForeground" json:"secondaryForeground"`
	Muted               string `yaml:"muted" json:"muted"`
	MutedForeground     string `yaml:"mutedForeground" json:"mutedForeground"`
	Accent              string `yaml:"accent" json:"accent"`
	AccentForeground    string `yaml:"accentForeground" json:"accentForeground"`
	Border              string `yaml:"border" json:"border"`
	Ring                string `yaml:"ring" json:"ring"`
	Gold                string `yaml:"gold" json:"gold"`
	Sage                string `yaml:"sage" json:"sage"`
	Blush               string `yaml:"blush" json:"blush"`
}

// Fonts are CSS font-family stacks The bundled fonts are served by the app itself.
type Fonts struct {
	Display string `yaml:"display" json:"display"`
	Script  string `yaml:"script" json:"script"`
	Body    string `yaml:"body" json:"body"`
}

// Registry holds all available themes.
type Registry struct {
	themes map[string]Theme
}

// Load reads the bundled presets and, if customPath is set, one additional
// theme file which may override a preset with the same name.
func Load(customPath string) (*Registry, error) {
	r := &Registry{themes: map[string]Theme{}}
	entries, err := fs.ReadDir(themes.FS, ".")
	if err != nil {
		return nil, fmt.Errorf("read bundled themes: %w", err)
	}
	for _, e := range entries {
		data, err := themes.FS.ReadFile(e.Name())
		if err != nil {
			return nil, err
		}
		if err := r.add(data, e.Name()); err != nil {
			return nil, err
		}
	}
	if customPath != "" {
		data, err := os.ReadFile(customPath)
		if err != nil {
			return nil, fmt.Errorf("read theme %s: %w", customPath, err)
		}
		if err := r.add(data, customPath); err != nil {
			return nil, err
		}
	}
	if _, ok := r.themes[DefaultName]; !ok {
		return nil, fmt.Errorf("default theme %q missing", DefaultName)
	}
	return r, nil
}

func (r *Registry) add(data []byte, source string) error {
	var t Theme
	if err := yaml.Unmarshal(data, &t); err != nil {
		return fmt.Errorf("parse theme %s: %w", source, err)
	}
	if err := t.validate(); err != nil {
		return fmt.Errorf("theme %s: %w", source, err)
	}
	r.themes[t.Name] = t
	return nil
}

// List returns all themes sorted by label.
func (r *Registry) List() []Theme {
	out := make([]Theme, 0, len(r.themes))
	for _, t := range r.themes {
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Label < out[j].Label })
	return out
}

// Get returns the named theme, falling back to the default for unknown names.
func (r *Registry) Get(name string) Theme {
	if t, ok := r.themes[name]; ok {
		return t
	}
	return r.themes[DefaultName]
}

// Has reports whether a theme with this name exists.
func (r *Registry) Has(name string) bool {
	_, ok := r.themes[name]
	return ok
}

var (
	nameRe = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)
	hexRe  = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
)

func (t *Theme) validate() error {
	if !nameRe.MatchString(t.Name) {
		return fmt.Errorf("name must be lowercase letters, digits or dashes")
	}
	if strings.TrimSpace(t.Label) == "" {
		t.Label = t.Name
	}
	switch t.Decoration {
	case "":
		t.Decoration = "none"
	case "none", "botanical", "dusk", "forest", "night":
	default:
		return fmt.Errorf("decoration must be none, botanical, dusk, forest or night")
	}
	c := t.Colors
	for name, v := range map[string]string{
		"background": c.Background, "foreground": c.Foreground, "card": c.Card,
		"primary": c.Primary, "primaryForeground": c.PrimaryForeground,
		"secondary": c.Secondary, "secondaryForeground": c.SecondaryForeground,
		"muted": c.Muted, "mutedForeground": c.MutedForeground,
		"accent": c.Accent, "accentForeground": c.AccentForeground,
		"border": c.Border, "ring": c.Ring, "gold": c.Gold, "sage": c.Sage, "blush": c.Blush,
	} {
		if !hexRe.MatchString(v) {
			return fmt.Errorf("color %s must be a #rrggbb value", name)
		}
	}
	for name, v := range map[string]string{"display": t.Fonts.Display, "script": t.Fonts.Script, "body": t.Fonts.Body} {
		if strings.TrimSpace(v) == "" || strings.ContainsAny(v, ";{}<>") {
			return fmt.Errorf("font %s is empty or contains invalid characters", name)
		}
	}
	return nil
}
