-- Tokens are looked up by hash; an encrypted copy lets staff hand links out
-- again. Existing plain-text values are converted when the server starts.
ALTER TABLE invite_links RENAME COLUMN token TO token_hash;
ALTER TABLE invite_links ADD COLUMN token_enc TEXT NOT NULL DEFAULT '';
ALTER TABLE responses RENAME COLUMN edit_token TO edit_token_hash;
ALTER TABLE responses ADD COLUMN edit_token_enc TEXT NOT NULL DEFAULT '';
