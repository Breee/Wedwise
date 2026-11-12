// Package uploads stores images uploaded through the content editor.
package uploads

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/Breee/Wedwise/internal/httpx"
)

// MaxBytes is the largest accepted image.
const MaxBytes = 8 << 20

// URLPrefix is where uploaded files are served.
const URLPrefix = "/uploads/"

// Only raster formats: SVG can carry scripts.
var extensions = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

// Handler accepts an image as the raw request body and stores it in dir.
type Handler struct {
	dir string
}

func NewHandler(dir string) *Handler {
	return &Handler{dir: dir}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			httpx.WriteError(w, http.StatusRequestEntityTooLarge, httpx.CodeBadRequest, "The image is larger than 8 MB.")
			return
		}
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "The upload could not be read.")
		return
	}
	ext, ok := extensions[http.DetectContentType(data)]
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "Only JPEG, PNG, WebP and GIF images are allowed.")
		return
	}
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		httpx.Internal(w, err)
		return
	}
	name := hex.EncodeToString(random) + ext
	if err := os.MkdirAll(h.dir, 0o750); err != nil {
		httpx.Internal(w, err)
		return
	}
	if err := os.WriteFile(filepath.Join(h.dir, name), data, 0o640); err != nil {
		httpx.Internal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]string{"url": URLPrefix + name})
}
