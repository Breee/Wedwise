-- Append-only record of staff actions: who did what to which target, and
-- when. It never holds the content of a change.
CREATE TABLE audit_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    at       TEXT    NOT NULL,
    user_id  INTEGER NOT NULL DEFAULT 0,
    username TEXT    NOT NULL DEFAULT '',
    action   TEXT    NOT NULL,
    target   TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX idx_audit_log_at ON audit_log(at);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit_log is append-only');
END;
