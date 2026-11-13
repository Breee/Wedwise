-- Counters behind the rate limits, so they survive restarts. Keys are
-- hashes of the client address or link id, never the value itself.
CREATE TABLE rate_limits (
    scope    TEXT    NOT NULL,
    key      TEXT    NOT NULL,
    count    INTEGER NOT NULL,
    reset_at INTEGER NOT NULL,
    PRIMARY KEY (scope, key)
) WITHOUT ROWID;

CREATE INDEX idx_rate_limits_reset ON rate_limits (reset_at);

-- Failed logins per account name (hashed), for the lockout with backoff.
CREATE TABLE login_lockouts (
    key          TEXT    PRIMARY KEY,
    failures     INTEGER NOT NULL,
    locked_until INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
) WITHOUT ROWID;
