// Package uploads stores images uploaded through the content editor.
package uploads

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"image"
	"image/gif"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/disintegration/imaging"
	_ "golang.org/x/image/webp"

	"github.com/Breee/Wedwise/internal/httpx"
)

// MaxBytes is the largest accepted image.
const MaxBytes = 8 << 20

// URLPrefix is where uploaded files are served.
const URLPrefix = "/uploads/"

// MaxDimension is the longest side of a stored image; larger ones are scaled down.
const MaxDimension = 2560

// maxPixels bounds what is decoded, so a small file cannot expand into gigabytes.
const maxPixels = 60_000_000

const jpegQuality = 88

// Only raster formats: SVG can carry scripts.
var accepted = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/gif":  true,
}

var errInvalidImage = errors.New("invalid image")

// sanitize re-encodes an image so that no metadata (EXIF, GPS, comments)
// survives. It returns the new bytes and their file extension.
func sanitize(data []byte, contentType string) ([]byte, string, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > maxPixels {
		return nil, "", errInvalidImage
	}
	var out bytes.Buffer
	if contentType == "image/gif" {
		// Decoding keeps only the frames; the encoder writes no comments.
		frames, err := gif.DecodeAll(bytes.NewReader(data))
		if err != nil {
			return nil, "", errInvalidImage
		}
		if err := gif.EncodeAll(&out, frames); err != nil {
			return nil, "", err
		}
		return out.Bytes(), ".gif", nil
	}
	// The orientation lives in EXIF, so it is applied before EXIF is dropped.
	img, err := imaging.Decode(bytes.NewReader(data), imaging.AutoOrientation(true))
	if err != nil {
		return nil, "", errInvalidImage
	}
	if b := img.Bounds(); b.Dx() > MaxDimension || b.Dy() > MaxDimension {
		img = imaging.Fit(img, MaxDimension, MaxDimension, imaging.Lanczos)
	}
	format, ext := imaging.JPEG, ".jpg"
	if opaque, ok := img.(interface{ Opaque() bool }); contentType == "image/png" || (ok && !opaque.Opaque()) {
		format, ext = imaging.PNG, ".png"
	}
	if err := imaging.Encode(&out, img, format, imaging.JPEGQuality(jpegQuality)); err != nil {
		return nil, "", err
	}
	return out.Bytes(), ext, nil
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
	contentType := http.DetectContentType(data)
	if !accepted[contentType] {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "Only JPEG, PNG, WebP and GIF images are allowed.")
		return
	}
	data, ext, err := sanitize(data, contentType)
	if errors.Is(err, errInvalidImage) {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeBadRequest, "The image could not be read.")
		return
	}
	if err != nil {
		httpx.Internal(w, err)
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
