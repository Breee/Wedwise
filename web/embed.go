// Package web embeds the built single page application.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// DistFS returns the embedded SPA build output rooted at dist.
func DistFS() (fs.FS, error) {
	return fs.Sub(distFS, "dist")
}
