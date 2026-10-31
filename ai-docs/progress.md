# Progress

Update this file after every finished step. Newest entries first in the log.

## Sprint 1 checklist

| ID | Feature | Status |
|---|---|---|
| F-01 | Fix failing `go test ./...` without a frontend build | done |
| F-02 | Hide "Sign out" when logged out | superseded by F-08 |
| F-03 | German UI (i18n with de as default) | superseded by F-08 |
| F-04 | Admin/couple content editor (hero, intro, location, schedule, FAQ) | superseded by F-08 |
| F-05 | RSVP contribution confirmation step | superseded by F-08 |
| F-06 | Login rate limiting | done |
| F-07 | Backend integration tests for RSVP + content | done |
| F-08 | Frontend rewrite in React (TanStack, Tailwind, shadcn) | done (see log) |
| F-09 | One public RSVP link, access code, contributions in RSVP, no invitations | done (access code replaced by F-10) |
| F-10 | Invite links with optional PIN, managed in UI | done |
| F-11 | Admin sees contributions; witness Kanban, list + schedule planning | done |

Status values: `todo`, `in progress`, `blocked (reason)`, `done (commit)`.

## Log

- 2026-10-31 — F-11: admin role gains `contribution.read/manage` (couple still excluded, test `TestCoupleNeverSeesContributions` now couple-only). Contributions got `slot_time`/`duration_minutes` + `PUT /api/contributions/{id}/schedule`. Witness page rebuilt: tabs Board (Kanban via @dnd-kit, drag card between status columns), Liste (table with tel: links), Ablaufplan (timeline sorted by start, end time, total minutes, overlap warning, "Ohne Uhrzeit" list). Detail dialog has schedule form (>15 min hint). Admin nav shows couple + witness links.

- 2026-10-31 — RSVP form polish: no email/phone in contact step (phone only with contribution), follow-up questions only on "Ja", contribution Ja/Nein, needs as checkboxes + Sonstiges, music genres (chips) + must-play song via iTunes search (`music_genres`, `music_song` on responses), couple dashboard genre histogram + song list; invite link URL hidden by default; Done screen fixed after link submit.
- 2026-10-30 — F-10 done: `RSVP_ACCESS_CODE` replaced by invite links (`internal/invites`), optional argon2id PIN per link with HMAC unlock cookie, couple/admin UI at `/couple/invites`, guests use `/rsvp/<token>`. Backend `278e502`, frontend + docs in follow-up commit.
- 2026-10-30 — F-09 done: invitations/guests removed; single `/rsvp` form with optional access code (`RSVP_ACCESS_CODE`), edit token per response, contribution (what/needs/phone, 15‑min hint) inside RSVP; couple sees only attendance + food; witness board uses `PUT /contributions/{id}/status`. Backend `74a4946`, frontend + docs in follow-up commit. Dev DB volume recreated.
- 2026-10-30 — F-06 done: in-memory fixed-window limiter (`internal/middleware/ratelimit.go`), login 10/min/IP, RSVP token routes 30/min/IP, `TRUST_PROXY_HEADERS` option, unit + integration tests, README security section.
- 2026-10-30 — F-07 done: integration tests for RSVP read-back + validation (400/404), public content shape, `PUT /content` couple 200 / witness 403 / anon 401, content validation 400. Sprint 1 complete.
- 2026-10-30 — F-01 done: `web/dist/.gitkeep` committed, Vite `keep-dist` plugin restores it after build; `go test ./...` passes on clean checkout.

- 2026-10-30 — F-08 React rewrite done and verified with Playwright (home, RSVP incl. contribution step, login, couple pages, witness board). Couple set to Viktoria & Julian.
- 2026-10-30 — Decided full React rewrite (F-08); F-02–F-05 folded into it.
- 2026-10-30 — Review done, `ai-docs/` created, sprint 1 defined.
- 2026-10-30 — Fixed public page not showing event/location (`2e976e7`).
- 2026-10-30 — Local setup: compose, `make up/down`, seeded users, Waldsee content (`b0d40b9`, `2db788b`, `e1100f9`).
- 2026-10-31: F-13 Arrival map (MapLibre + OpenFreeMap positron, animated walking routes via routing.openstreetmap.de foot profile, stop cards with minutes/km, hover highlight) and Unterkünfte section (hotel map with numbered markers, price tier €/€€/€€€, distance to venue, Booking.com/Airbnb deep links pre-filled with checkIn/checkOut). Content gains `travel` {lat,lng,stops[]} and `accommodation` {checkIn,checkOut,hotels[]} JSON blocks, editable in Inhalte → Anreise / Unterkünfte. Live hotel prices are not possible without a paid API; price tiers chosen instead.
- 2026-10-31: F-12 Ablaufplan drag-to-order (times recomputed sequentially from a plan start, `PUT /api/contributions/schedule` bulk, atomic), contribution contact channels (messengers WhatsApp/Signal/Telegram + Matrix ID in RSVP form, chips with deep links in witness list/plan/detail).
- 2026-10-31 — Hotel list relaxed to ≥7.5/10 (10 hotels, Booking property deep links via new `bookingUrl`), bike line kind on `travel.lines` with Dreisam-Radweg geometry, `/update-hotels` command + `accommodation-research` skill.
- 2026-10-31 — Mobile polish: Google/Apple directions in all arrival tabs + stay cards, hamburger nav, compact hero/Ablauf, address below photo, stay list top 3 + expand with one-line times, map scrolls into view on select, RSVP steps/chips/sticky submit/Web Share, ICS button, reduced motion.
