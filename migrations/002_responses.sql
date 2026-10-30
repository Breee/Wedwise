CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edit_token TEXT NOT NULL UNIQUE,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS response_attendees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    response_id INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_child INTEGER NOT NULL DEFAULT 0,
    diet TEXT NOT NULL DEFAULT 'none',
    allergies TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_response_attendees_response_id ON response_attendees(response_id);
