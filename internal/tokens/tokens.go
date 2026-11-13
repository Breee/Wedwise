// Package tokens protects bearer tokens at rest: they are looked up by hash,
// and an encrypted copy is kept only so staff can hand a link out again.
package tokens

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
)

// Hash returns the lookup hash of a token. Tokens are random and long, so a
// plain SHA-256 is enough and keeps lookups working when the secret changes.
func Hash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Vault encrypts tokens with AES-256-GCM.
type Vault struct {
	aead cipher.AEAD
}

// NewVault derives the encryption key for purpose from secret.
func NewVault(secret, purpose string) (*Vault, error) {
	key := sha256.Sum256([]byte("wedwise-" + purpose + ":" + secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Vault{aead: aead}, nil
}

// Seal encrypts a token.
func (v *Vault) Seal(token string) (string, error) {
	nonce := make([]byte, v.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawStdEncoding.EncodeToString(v.aead.Seal(nonce, nonce, []byte(token), nil)), nil
}

// Open decrypts a sealed token. It fails when the secret has changed.
func (v *Vault) Open(sealed string) (string, error) {
	raw, err := base64.RawStdEncoding.DecodeString(sealed)
	n := v.aead.NonceSize()
	if err != nil || len(raw) < n {
		return "", errors.New("corrupt sealed token")
	}
	token, err := v.aead.Open(nil, raw[:n], raw[n:], nil)
	if err != nil {
		return "", err
	}
	return string(token), nil
}

// OpenOrEmpty decrypts a sealed token and returns "" when that is not possible.
func (v *Vault) OpenOrEmpty(sealed string) string {
	token, err := v.Open(sealed)
	if err != nil {
		return ""
	}
	return token
}
