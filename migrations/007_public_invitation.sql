-- Add is_public flag to invitations.
-- At most one invitation should have is_public = 1 at a time.
-- This allows a single shareable "open RSVP" link for all guests.
ALTER TABLE invitations ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_invitations_public ON invitations(is_public) WHERE is_public = 1;
