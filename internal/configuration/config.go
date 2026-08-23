// Package configuration loads application configuration from a YAML file with
// environment variable overrides.
package configuration

import (
	"errors"
	"fmt"
	"os"
	"strings"

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
}

// Config is the top level application configuration.
type Config struct {
	ListenAddress string `yaml:"listenAddress" json:"listenAddress"`
	DatabasePath  string `yaml:"databasePath" json:"databasePath"`
	BaseURL       string `yaml:"baseURL" json:"baseURL"`
	SessionSecret string `yaml:"sessionSecret" json:"-"`
	ConfigPath    string `yaml:"configPath" json:"configPath"`
	ThemePath     string `yaml:"themePath" json:"themePath"`
	Environment   string `yaml:"environment" json:"environment"`

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
			Title: "Wedwise",
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
		"LISTEN_ADDRESS": &cfg.ListenAddress,
		"DATABASE_PATH":  &cfg.DatabasePath,
		"BASE_URL":       &cfg.BaseURL,
		"SESSION_SECRET": &cfg.SessionSecret,
		"CONFIG_PATH":    &cfg.ConfigPath,
		"THEME_PATH":     &cfg.ThemePath,
		"ENVIRONMENT":    &cfg.Environment,
	}
	for key, target := range overrides {
		if value, ok := os.LookupEnv(key); ok && value != "" {
			*target = value
		}
	}
}

// Validate checks that the configuration is usable.
func (c Config) Validate() error {
	if c.ListenAddress == "" {
		return errors.New("listenAddress must not be empty")
	}
	if c.DatabasePath == "" {
		return errors.New("databasePath must not be empty")
	}
	return nil
}
