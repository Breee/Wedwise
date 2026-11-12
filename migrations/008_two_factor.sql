CREATE TABLE user_totp (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret_enc TEXT NOT NULL,
    confirmed_at TEXT NOT NULL DEFAULT '',
    last_step INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE user_recovery_codes (
    code_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_recovery_codes_user ON user_recovery_codes(user_id);
