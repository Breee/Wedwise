-- "Liebe" or "Lieber" for a link that names a single guest.
ALTER TABLE invite_links ADD COLUMN salutation TEXT NOT NULL DEFAULT '';
