// Package configuration loads application configuration from a YAML file with
// environment variable overrides.
package configuration

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/Breee/Wedwise/internal/sealed"

	"gopkg.in/yaml.v3"
)

// CoupleEntry describes one person of the couple.
type CoupleEntry struct {
	Name string `yaml:"name" json:"name"`
	Role string `yaml:"role" json:"role"`
}

// VenueConfig describes the wedding venue.
type VenueConfig struct {
	Name          string `yaml:"name" json:"name"`
	Address       string `yaml:"address" json:"address"`
	City          string `yaml:"city" json:"city"`
	MapURL        string `yaml:"mapUrl" json:"mapUrl"`
	Description   string `yaml:"description" json:"description"`
	NavigationURL string `yaml:"navigationUrl" json:"navigationUrl"`
	Transport     string `yaml:"transport" json:"transport"`
	Parking       string `yaml:"parking" json:"parking"`
}

// HeroConfig describes the hero section of the public website.
type HeroConfig struct {
	Eyebrow  string `yaml:"eyebrow" json:"eyebrow"`
	Headline string `yaml:"headline" json:"headline"`
	Subtitle string `yaml:"subtitle" json:"subtitle"`
	Note     string `yaml:"note" json:"note"`
	Image    string `yaml:"image" json:"image"`
}

// EventConfig describes the wedding event.
type EventConfig struct {
	Title  string        `yaml:"title" json:"title"`
	Couple []CoupleEntry `yaml:"couple" json:"couple"`
	Date   string        `yaml:"date" json:"date"`
	Venue  VenueConfig   `yaml:"venue" json:"venue"`
	Hero   HeroConfig    `yaml:"hero" json:"hero"`
	// Language is the UI language: "de" or "en".
	Language string `yaml:"language" json:"language"`
	// Timezone is the IANA zone of the event, used for calendar entries.
	Timezone string `yaml:"timezone" json:"timezone"`
	// ContributionMinutes is the time limit suggested to guests for a contribution.
	ContributionMinutes int `yaml:"contributionMinutes" json:"contributionMinutes"`
	// MusicGenres are the genres guests can pick in their response.
	MusicGenres []string `yaml:"musicGenres" json:"musicGenres"`
}

// AuthConfig tightens how staff sign in.
type AuthConfig struct {
	// RequireTwoFactor lists the roles that must use a second factor.
	RequireTwoFactor []string `yaml:"requireTwoFactor" json:"requireTwoFactor"`
	// SessionMaxAge ends a session this long after the login (e.g. "24h").
	SessionMaxAge string `yaml:"sessionMaxAge" json:"sessionMaxAge"`
	// SessionIdleTimeout ends a session after this time without activity.
	SessionIdleTimeout string `yaml:"sessionIdleTimeout" json:"sessionIdleTimeout"`
}

// Timeouts returns the configured session lifetimes; zero means default.
func (a AuthConfig) Timeouts() (maxAge, idle time.Duration, err error) {
	parse := func(name, value string) (time.Duration, error) {
		if value == "" {
			return 0, nil
		}
		d, err := time.ParseDuration(value)
		if err != nil || d < time.Minute {
			return 0, fmt.Errorf("auth.%s must be a duration of at least one minute, like 2h", name)
		}
		return d, nil
	}
	if maxAge, err = parse("sessionMaxAge", a.SessionMaxAge); err != nil {
		return 0, 0, err
	}
	idle, err = parse("sessionIdleTimeout", a.SessionIdleTimeout)
	return maxAge, idle, err
}

// Config is the top level application configuration.
type Config struct {
	ListenAddress string `yaml:"listenAddress" json:"listenAddress"`
	DatabasePath  string `yaml:"databasePath" json:"databasePath"`
	BaseURL       string `yaml:"baseURL" json:"baseURL"`
	SessionSecret string `yaml:"sessionSecret" json:"-"`
	// DataKey encrypts sensitive guest data and backups. DataKeyPrevious is
	// only set while rotating to a new key.
	DataKey         string `yaml:"dataKey" json:"-"`
	DataKeyPrevious string `yaml:"dataKeyPrevious" json:"-"`
	ConfigPath      string `yaml:"configPath" json:"configPath"`
	ThemePath       string `yaml:"themePath" json:"themePath"`
	// ContentPath is an optional JSON content file applied at startup whenever it changes.
	ContentPath string `yaml:"contentPath" json:"contentPath"`
	// UsersPath is an optional YAML file with users created at startup.
	UsersPath string `yaml:"usersPath" json:"usersPath"`
	// ImagesPath is an optional directory served read-only under /images/.
	ImagesPath string `yaml:"imagesPath" json:"imagesPath"`
	// UploadsPath stores images uploaded in the editor. Defaults to an
	// "uploads" directory next to the database.
	UploadsPath string `yaml:"uploadsPath" json:"uploadsPath"`
	Environment string `yaml:"environment" json:"environment"`
	// TrustProxyHeaders enables X-Forwarded-For for client IP detection. Only
	// enable when a reverse proxy in front of the app sets the header.
	TrustProxyHeaders *bool `yaml:"trustProxyHeaders" json:"trustProxyHeaders"`
	// RoutingAPIKey is an optional OpenRouteService key for live route lookups.
	RoutingAPIKey string `yaml:"routingApiKey" json:"-"`

	Auth AuthConfig `yaml:"auth" json:"auth"`

	Event EventConfig `yaml:"event" json:"event"`

	// baseURLAlias accepts the alternative "baseUrl" spelling used in the
	// example configuration files.
	baseURLAlias string `yaml:"-" json:"-"`
}

// UnmarshalYAML accepts both "baseURL" and "baseUrl" as keys.
func (c *Config) UnmarshalYAML(node *yaml.Node) error {
	type plain Config
	alias := struct {
		*plain  `yaml:",inline"`
		BaseUrl string `yaml:"baseUrl"`
	}{plain: (*plain)(c)}
	if err := node.Decode(&alias); err != nil {
		return err
	}
	c.baseURLAlias = alias.BaseUrl
	return nil
}

// Default returns a configuration populated with sane defaults.
func Default() Config {
	return Config{
		ListenAddress: ":8080",
		DatabasePath:  "wedwise.db",
		BaseURL:       "http://localhost:8080",
		ConfigPath:    "config.yaml",
		ThemePath:     "",
		Environment:   "development",
		Event: EventConfig{
			Title:               "Wedwise",
			Language:            "de",
			Timezone:            "Europe/Berlin",
			ContributionMinutes: 15,
			MusicGenres:         []string{"Pop", "Rock", "Hip-Hop", "Schlager", "80er", "90er", "2000er", "House / Electro", "Latin", "Soul / Funk", "Indie"},
		},
	}
}

// IsProduction reports whether the application runs in production mode.
func (c Config) IsProduction() bool {
	return strings.EqualFold(c.Environment, "production")
}

// Load reads configuration from the given YAML path (if it exists) and applies
// environment variable overrides. An empty path falls back to CONFIG_PATH or
// the default location.
func Load(path string) (Config, error) {
	cfg := Default()

	if path == "" {
		if env := os.Getenv("CONFIG_PATH"); env != "" {
			path = env
		} else {
			path = cfg.ConfigPath
		}
	}
	cfg.ConfigPath = path

	data, err := os.ReadFile(path)
	switch {
	case err == nil:
		if err := yaml.Unmarshal(data, &cfg); err != nil {
			return Config{}, fmt.Errorf("parse config %s: %w", path, err)
		}
		if cfg.baseURLAlias != "" && (cfg.BaseURL == "" || cfg.BaseURL == Default().BaseURL) {
			cfg.BaseURL = cfg.baseURLAlias
		}
		cfg.ConfigPath = path
	case errors.Is(err, os.ErrNotExist):
		// Configuration file is optional; environment variables can supply everything.
	default:
		return Config{}, fmt.Errorf("read config %s: %w", path, err)
	}

	applyEnv(&cfg)

	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func applyEnv(cfg *Config) {
	overrides := map[string]*string{
		"LISTEN_ADDRESS":    &cfg.ListenAddress,
		"DATABASE_PATH":     &cfg.DatabasePath,
		"BASE_URL":          &cfg.BaseURL,
		"SESSION_SECRET":    &cfg.SessionSecret,
		"DATA_KEY":          &cfg.DataKey,
		"DATA_KEY_PREVIOUS": &cfg.DataKeyPrevious,
		"CONFIG_PATH":       &cfg.ConfigPath,
		"THEME_PATH":        &cfg.ThemePath,
		"CONTENT_PATH":      &cfg.ContentPath,
		"USERS_PATH":        &cfg.UsersPath,
		"IMAGES_PATH":       &cfg.ImagesPath,
		"UPLOADS_PATH":      &cfg.UploadsPath,
		"ENVIRONMENT":       &cfg.Environment,
		"ROUTING_API_KEY":   &cfg.RoutingAPIKey,

		"SESSION_MAX_AGE":      &cfg.Auth.SessionMaxAge,
		"SESSION_IDLE_TIMEOUT": &cfg.Auth.SessionIdleTimeout,
	}
	for key, target := range overrides {
		if value, ok := os.LookupEnv(key); ok && value != "" {
			*target = value
		}
	}
	if value, ok := os.LookupEnv("REQUIRE_TWO_FACTOR"); ok && value != "" {
		cfg.Auth.RequireTwoFactor = nil
		for _, role := range strings.Split(value, ",") {
			if role = strings.TrimSpace(role); role != "" {
				cfg.Auth.RequireTwoFactor = append(cfg.Auth.RequireTwoFactor, role)
			}
		}
	}
	if value, ok := os.LookupEnv("TRUST_PROXY_HEADERS"); ok {
		trust := strings.EqualFold(value, "true") || value == "1"
		cfg.TrustProxyHeaders = &trust
	}
}

// TrustProxy reports whether X-Forwarded-For is honoured.
func (c Config) TrustProxy() bool {
	return c.TrustProxyHeaders != nil && *c.TrustProxyHeaders
}

// Validate checks that the configuration is usable.
func (c Config) Validate() error {
	if c.IsProduction() && c.TrustProxyHeaders == nil {
		return errors.New("trustProxyHeaders must be set in production: true behind a reverse proxy, false when clients connect directly (env TRUST_PROXY_HEADERS)")
	}
	if c.ListenAddress == "" {
		return errors.New("listenAddress must not be empty")
	}
	if c.DatabasePath == "" {
		return errors.New("databasePath must not be empty")
	}
	if len(c.SessionSecret) < 16 {
		return errors.New("sessionSecret must be at least 16 characters")
	}
	if len(c.DataKey) < sealed.MinKeyLength {
		return fmt.Errorf("dataKey must be at least %d characters (generate one with: openssl rand -hex 32)", sealed.MinKeyLength)
	}
	if c.DataKey == c.SessionSecret {
		return errors.New("dataKey must differ from sessionSecret")
	}
	if c.DataKeyPrevious != "" && len(c.DataKeyPrevious) < sealed.MinKeyLength {
		return fmt.Errorf("dataKeyPrevious must be at least %d characters", sealed.MinKeyLength)
	}
	for _, role := range c.Auth.RequireTwoFactor {
		if role != "admin" && role != "couple" && role != "witness" {
			return fmt.Errorf("auth.requireTwoFactor: unknown role %q (use admin, couple, witness)", role)
		}
	}
	if _, _, err := c.Auth.Timeouts(); err != nil {
		return err
	}
	if c.Event.Language != "de" && c.Event.Language != "en" {
		return errors.New("event.language must be de or en")
	}
	return nil
}
