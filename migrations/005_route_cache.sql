CREATE TABLE IF NOT EXISTS route_cache (
    cache_key  TEXT PRIMARY KEY,
    route      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
