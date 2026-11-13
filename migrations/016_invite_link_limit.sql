-- Optional cap on the number of responses an invite link accepts; 0 means
-- unlimited.
ALTER TABLE invite_links ADD COLUMN max_responses INTEGER NOT NULL DEFAULT 0;
