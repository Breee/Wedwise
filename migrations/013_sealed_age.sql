-- Ages are stored sealed, which needs a text column.
ALTER TABLE response_attendees RENAME COLUMN age TO age_number;
ALTER TABLE response_attendees ADD COLUMN age TEXT NOT NULL DEFAULT '';
UPDATE response_attendees SET age = CAST(age_number AS TEXT) WHERE age_number != 0;
ALTER TABLE response_attendees DROP COLUMN age_number;
