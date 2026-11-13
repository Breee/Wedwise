-- Passkeys and hardware tokens. Only public key material is stored.
CREATE TABLE user_webauthn_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    credential TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_user_webauthn_credentials_user ON user_webauthn_credentials(user_id);
