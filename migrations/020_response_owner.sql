-- A response sent while signed in belongs to that account, one per account.
ALTER TABLE responses ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_responses_user ON responses(user_id) WHERE user_id IS NOT NULL;
