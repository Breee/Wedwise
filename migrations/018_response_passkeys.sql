-- Passkeys guests may register to come back to their response without a link.
CREATE TABLE response_passkeys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    response_id INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    credential TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_response_passkeys_response ON response_passkeys(response_id);
