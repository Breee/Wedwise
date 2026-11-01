// Package themes embeds the bundled theme presets.
package themes

import "embed"

// FS contains the bundled theme YAML files.
//
//go:embed *.yaml
var FS embed.FS
