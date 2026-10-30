# F-10 — Invite links with optional PIN

## GOOD

Replace the global `RSVP_ACCESS_CODE` with invite links managed in the UI. A link is just a token (no labels, no guest names). Couple/admin can create several links, each optionally PIN-protected. Guests open `/rsvp/<token>`, enter the PIN if set, and fill in the RSVP. Responses remember which link they came from. Editing a response still works via `/rsvp?token=<editToken>`.

## DONE

- [x] `invite_links` table + `responses.invite_link_id` (ON DELETE SET NULL).
- [x] `internal/invites`: store (create/list/setPIN/setActive/regenerate/delete, argon2id PIN hash), HMAC cookie gate per link (`wedwise_rsvp_access_<id>`, PIN change invalidates cookie), handlers under `invite.manage` (couple + admin).
- [x] Public RSVP: `GET /api/rsvp/links/{link}` (status), `POST …/unlock`, `POST …/links/{link}` (create). Unknown/inactive link → 404. Edit-token routes unchanged.
- [x] Config: `RSVP_ACCESS_CODE` removed; `SESSION_SECRET` ≥ 16 chars always required.
- [x] Integration tests: management permissions, deactivate, regenerate, delete keeps responses, PIN flow (short/locked/wrong/unlock/forged/change/remove).
- [x] Frontend: `/couple/invites` (create, copy URL, PIN dialog, active switch, regenerate, delete), `/rsvp/$link` with PIN gate, `/rsvp/?token=` edit page, shared `RsvpForm` component.
- [x] README, `examples/config.yaml`, `docker-compose.yml` updated.
- [x] Verified with Playwright on a fresh DB.

## Decisions

- No per-link labels or guest assignment — keep it as simple as a shareable link.
- PIN is hashed with argon2id like passwords; the unlock cookie is bound to the PIN hash so changing the PIN logs everyone out.
- Deleting a link keeps its responses.
