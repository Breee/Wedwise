// Package web embeds the built single page application.
package web

import (
	"embed"
	"io/fs"
)

// dist/.gitkeep is committed so the pattern matches on a clean checkout
// (go test without a frontend build); the real SPA is built in the Dockerfile.
//
//go:embed all:dist
var distFS embed.FS

// DistFS returns the embedded SPA build output rooted at dist.
func DistFS() (fs.FS, error) {
	return fs.Sub(distFS, "dist")
}
