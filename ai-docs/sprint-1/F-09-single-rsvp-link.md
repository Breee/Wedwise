# F-09 — One public RSVP link, no personalized invitations

## Problem
Creating 70+ invitations by hand and distributing individual links is not acceptable. Guests should not be linked to invitation records; a response per household is enough. Program contributions should be offered inside the RSVP and must stay invisible to the couple.

## Decision
Drop invitations and guests entirely. One public form at `/rsvp`, optionally behind a shared access code (replaced by invite links in F-10). Each response gets a private edit token (`/rsvp?token=…`).

## GOOD
- Guest opens `/rsvp`, enters the code from the printed invitation (if configured), answers once per household.
- Contribution is part of the same form: what, what they need, phone number, visible hint "max. ca. 15 Minuten".
- Couple/admin can never read contributions via any route; response list and summary contain no contribution data (tested).
- Access cookie is HMAC-signed with `SESSION_SECRET`, HttpOnly, scoped to `/api/rsvp`; unlock and submit are rate limited.

## DONE
- [x] Migrations rewritten (`responses`, `response_attendees`, `contributions` keyed by `response_id`); `invitations`/`guests` packages removed.
- [x] `GET /api/rsvp/access`, `POST /api/rsvp/unlock`, `POST /api/rsvp`, `GET|PUT /api/rsvp/{token}`; `GET /api/responses`, `GET /api/rsvp-summary` (couple/witness/admin).
- [x] Contributions: `GET /`, `GET /{id}`, `PUT /{id}/status`, `POST /{id}/notes` — witness only.
- [x] Config `rsvpAccessCode` / `RSVP_ACCESS_CODE`; requires `SESSION_SECRET` ≥ 16 chars. (removed in F-10)
- [x] Integration tests: create/get/update, decline clears attendees+contribution, validation, access code (locked, wrong, unlock, forged cookie), couple never sees contributions, rate limit.
- [x] Frontend: `/rsvp` (gate → form → done with edit link), couple dashboard with responses table (food/allergies only), witness board with contact + needs + status select, home CTA "Jetzt zusagen".
- [x] README, `examples/config.yaml`, `docker-compose.yml` (`RSVP_ACCESS_CODE=waldsee` for local dev). (removed in F-10)
- [x] Verified with Playwright: gate, yes-with-contribution, decline, edit via token, couple table without leak, witness status update.

## Decisions
- Statuses reduced to `yes`/`no`; diets `none|vegetarian|vegan|other`; max 10 attendees per response.
- Contribution phone defaults to the contact phone in the UI but is stored separately (required by backend).
