// Package version holds the release version, set at build time with
// -ldflags "-X github.com/Breee/Wedwise/internal/version.Version=v1.2.3".
package version

// Version is the release tag the binary was built from, or "dev".
var Version = "dev"
