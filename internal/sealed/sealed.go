// Package sealed encrypts sensitive guest data at rest with a dedicated data
// key, so that access to the database file or a backup does not expose it.
package sealed

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
)

// MinKeyLength is the minimum length of a data key.
const MinKeyLength = 32

// prefix marks a sealed value. Values without it were written by versions
// that stored plain text.
const prefix = "enc:v1:"

// ErrKey is returned when a value cannot be decrypted with any known key.
var ErrKey = errors.New("cannot decrypt: wrong or missing data key")

// Box seals values with the current data key and still opens values sealed
// with previous keys, which is what makes key rotation possible.
type Box struct {
	current  cipher.AEAD
	previous []cipher.AEAD
}

// New creates a box for key. Previous keys are only used for decryption.
func New(key string, previous ...string) (*Box, error) {
	current, err := newAEAD(key)
	if err != nil {
		return nil, err
	}
	box := &Box{current: current}
	for _, old := range previous {
		if old == "" {
			continue
		}
		aead, err := newAEAD(old)
		if err != nil {
			return nil, err
		}
		box.previous = append(box.previous, aead)
	}
	return box, nil
}

func newAEAD(key string) (cipher.AEAD, error) {
	if len(key) < MinKeyLength {
		return nil, errors.New("data key is too short")
	}
	sum := sha256.Sum256([]byte("wedwise-data:" + key))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// SealBytes encrypts data with the current key.
func (b *Box) SealBytes(data []byte) ([]byte, error) {
	nonce := make([]byte, b.current.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return b.current.Seal(nonce, nonce, data, nil), nil
}

// OpenBytes decrypts data sealed with the current or a previous key. The
// second result reports whether the current key was used.
func (b *Box) OpenBytes(data []byte) ([]byte, bool, error) {
	for i, aead := range append([]cipher.AEAD{b.current}, b.previous...) {
		n := aead.NonceSize()
		if len(data) < n {
			break
		}
		if plain, err := aead.Open(nil, data[:n], data[n:], nil); err == nil {
			return plain, i == 0, nil
		}
	}
	return nil, false, ErrKey
}

// Seal encrypts a value. Empty values stay empty.
func (b *Box) Seal(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	data, err := b.SealBytes([]byte(value))
	if err != nil {
		return "", err
	}
	return prefix + base64.RawStdEncoding.EncodeToString(data), nil
}

// Open decrypts a value. Values that were never sealed are returned as is.
func (b *Box) Open(value string) (string, error) {
	plain, _, err := b.open(value)
	return plain, err
}

func (b *Box) open(value string) (plain string, current bool, err error) {
	encoded, ok := strings.CutPrefix(value, prefix)
	if !ok {
		return value, false, nil
	}
	raw, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil {
		return "", false, ErrKey
	}
	data, current, err := b.OpenBytes(raw)
	return string(data), current, err
}

// SealAll encrypts several values at once.
func (b *Box) SealAll(values ...string) ([]any, error) {
	result := make([]any, len(values))
	for i, value := range values {
		sealed, err := b.Seal(value)
		if err != nil {
			return nil, err
		}
		result[i] = sealed
	}
	return result, nil
}

// OpenAll decrypts several values in place.
func (b *Box) OpenAll(values ...*string) error {
	for _, value := range values {
		plain, err := b.Open(*value)
		if err != nil {
			return err
		}
		*value = plain
	}
	return nil
}
