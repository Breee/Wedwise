-- A short code is a second key to an invite link, typed in at /join-us.
-- Stored like the token: hashed for lookup, encrypted so staff can read it.
ALTER TABLE invite_links ADD COLUMN code_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE invite_links ADD COLUMN code_enc TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_invite_links_code ON invite_links(code_hash) WHERE code_hash <> '';

-- Whom the link is for, shown as a greeting on the invitation. Encrypted.
ALTER TABLE invite_links ADD COLUMN name_enc TEXT NOT NULL DEFAULT '';
