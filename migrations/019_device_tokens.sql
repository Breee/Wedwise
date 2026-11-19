-- Logins of command line clients. A row starts as a pending request (device
-- code and user code), is approved by a signed-in user in the browser, and
-- then carries the hash of the token the client received.
CREATE TABLE device_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_hash TEXT NOT NULL DEFAULT '',
    user_code TEXT NOT NULL DEFAULT '',
    token_hash TEXT NOT NULL DEFAULT '',
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    last_used_at DATETIME
);

CREATE INDEX idx_device_tokens_token ON device_tokens(token_hash);
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);
