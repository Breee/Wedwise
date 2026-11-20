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

## Backlog

Open work is tracked in GitHub issues and milestones (M1 Staff tools, M2 Accommodation, M3 Mobile polish, M4 Go-live): https://github.com/Breee/Wedwise/issues

## Log

- 2026-10-31 — F-11: admin role gains `contribution.read/manage` (couple still excluded, test `TestCoupleNeverSeesContributions` now couple-only). Contributions got `slot_time`/`duration_minutes` + `PUT /api/contributions/{id}/schedule`. Witness page rebuilt: tabs Board (Kanban via @dnd-kit, drag card between status columns), Liste (table with tel: links), Ablaufplan (timeline sorted by start, end time, total minutes, overlap warning, "Ohne Uhrzeit" list). Detail dialog has schedule form (>15 min hint). Admin nav shows couple + witness links.

- 2026-10-31 — RSVP form polish: no email/phone in contact step (phone only with contribution), follow-up questions only on "Ja", contribution Ja/Nein, needs as checkboxes + Sonstiges, music genres (chips) + must-play song via iTunes search (`music_genres`, `music_song` on responses), couple dashboard genre histogram + song list; invite link URL hidden by default; Done screen fixed after link submit.
- 2026-10-30 — F-10 done: `RSVP_ACCESS_CODE` replaced by invite links (`internal/invites`), optional argon2id PIN per link with HMAC unlock cookie, couple/admin UI at `/couple/invites`, guests use `/rsvp/<token>`. Backend `278e502`, frontend + docs in follow-up commit.
- 2026-10-30 — F-09 done: invitations/guests removed; single `/rsvp` form with optional access code (`RSVP_ACCESS_CODE`), edit token per response, contribution (what/needs/phone, 15‑min hint) inside RSVP; couple sees only attendance + food; witness board uses `PUT /contributions/{id}/status`. Backend `74a4946`, frontend + docs in follow-up commit. Dev DB volume recreated.
- 2026-10-30 — F-06 done: in-memory fixed-window limiter (`internal/middleware/ratelimit.go`), login 10/min/IP, RSVP token routes 30/min/IP, `TRUST_PROXY_HEADERS` option, unit + integration tests, README security section.
- 2026-10-30 — F-07 done: integration tests for RSVP read-back + validation (400/404), public content shape, `PUT /content` couple 200 / witness 403 / anon 401, content validation 400. Sprint 1 complete.
- 2026-10-30 — F-01 done: `web/dist/.gitkeep` committed, Vite `keep-dist` plugin restores it after build; `go test ./...` passes on clean checkout.

- 2026-10-30 — F-08 React rewrite done and verified with Playwright (home, RSVP incl. contribution step, login, couple pages, witness board).
- 2026-10-30 — Decided full React rewrite (F-08); F-02–F-05 folded into it.
- 2026-10-30 — Review done, `ai-docs/` created, sprint 1 defined.
- 2026-10-30 — Fixed public page not showing event/location (`2e976e7`).
- 2026-10-30 — Local setup: compose, `make up/down`, seeded users, Waldsee content (`b0d40b9`, `2db788b`, `e1100f9`).
- 2026-10-31: F-13 Arrival map (MapLibre + OpenFreeMap positron, animated walking routes via routing.openstreetmap.de foot profile, stop cards with minutes/km, hover highlight) and Unterkünfte section (hotel map with numbered markers, price tier €/€€/€€€, distance to venue, Booking.com/Airbnb deep links pre-filled with checkIn/checkOut). Content gains `travel` {lat,lng,stops[]} and `accommodation` {checkIn,checkOut,hotels[]} JSON blocks, editable in Inhalte → Anreise / Unterkünfte. Live hotel prices are not possible without a paid API; price tiers chosen instead.
- 2026-10-31: F-12 Ablaufplan drag-to-order (times recomputed sequentially from a plan start, `PUT /api/contributions/schedule` bulk, atomic), contribution contact channels (messengers WhatsApp/Signal/Telegram + Matrix ID in RSVP form, chips with deep links in witness list/plan/detail).
- 2026-10-31 — Hotel list relaxed to ≥7.5/10 (10 hotels, Booking property deep links via new `bookingUrl`), bike line kind on `travel.lines` with Dreisam-Radweg geometry, `/update-hotels` command + `accommodation-research` skill.
- 2026-10-31 — Mobile polish: Google/Apple directions in all arrival tabs + stay cards, hamburger nav, compact hero/Ablauf, address below photo, stay list top 3 + expand with one-line times, map scrolls into view on select, RSVP steps/chips/sticky submit/Web Share, ICS button, reduced motion.
- 2026-11-01 — Themes: bundled `themes/*.yaml` (sage-leaf default, terracotta), `internal/theme` registry, `GET /api/themes`, `content.theme` picked in editor tab "Design"; frontend applies colors/fonts as CSS vars, botanical sprig frame + script font when decoration is botanical. Old `local/theme.yaml`/`examples/theme.yaml` removed.
- 2026-11-01: Cinematic typographic intro on invite links (once per session, tap to skip, reduced-motion aware); falling leaves dropped; FAQ expanded to 10 questions incl. evening-jacket hint.
- 2026-11-03: Scene themes waldsee-dusk/forest/night (night in use) with invite intro scene and fireflies; contribution contact is messenger-only (WhatsApp/Signal/Telegram handle, no phone field); intro plays on every visit.
- 2026-11-11: Work moved to GitHub issues #3–#18: staff editing of responses and contribution content, accommodation kind + price/type filters + Ferienwohnungen, marker spreading, mobile round 2 (card tables, scrolling tabs, tap targets, section mini-nav), `BASE_URL` via env in compose, optional OpenRouteService proxy `GET /api/route` (`ROUTING_API_KEY`).
- 2026-11-13: #45 mandatory two-factor per role, session timeouts, session list with sign-out, hashed session ids, __Host- cookie.
- 2026-11-13: #44 rate limits and login lockouts persisted in SQLite (hashed keys), account lockout with backoff, TRUST_PROXY_HEADERS mandatory in production.
- 2026-11-13: #43 invite links: optional response cap, 20 new responses per 10 min per link, bulk delete of responses with link filter.
- 2026-11-13: #46 append-only audit log (logins, staff changes, link copies, broadcasts) with admin view `/admin/audit`.
- 2026-11-14: #47 stricter browser policy: images only from self and `IMAGE_HOSTS`, style attributes refused, COOP/CORP same-origin, `no-store` on API responses, header tests.
- 2026-11-14: #50 security scanning in CI (govulncheck, gosec, npm audit, Trivy, CodeQL, Dependabot), SBOM on releases, base image alpine 3.24 + apk upgrade.
- 2026-11-14 #51: distroless runtime image pinned by digest, `healthcheck` command, read-only/no-capability compose, chart `image.digest` + optional NetworkPolicy, digest in release notes.
- 2026-11-14 #52: SECURITY.md, docs/threat-model.md, docs/security-review.md (ASVS L2); findings filed as #57–#60.
- 2026-11-14: Removed stored map geometry (lines, stop walk, hotel routes) from content; routes come from the routing API and are cached.
- 2026-11-14 #59: Staff change their own password under "Konto" (`PUT /api/account/password`), session renewed, audited.
- 2026-11-14 #60: TOTP secrets sealed with the data key (legacy rows converted at startup and by `rekey`).
- 2026-11-14: Editor place picker (search + map pin) replaces latitude/longitude fields; `GET /api/places` proxies the geocoder for staff.
- 2026-11-15: Map editor for the arrival tab (venue, stops, car parks on one map with nearby suggestions via /api/places/nearby); cycle paths highlighted on the bike tab.
- 2026-11-15: Arrival editor: sidebar list, clear all, legend, hover highlight between list and map, nearest three car parks with distances; place and nearby lookups cached.
- 2026-11-15: Arrival editor guided in two steps (venue first, then stops grouped by type with street names for car parks); guest map no longer zooms on hover.
- 2026-11-15: Places to stay are edited on a map too: nearby hotels and holiday flats as suggestions, search, tap to add, details in a panel; the old form list and place picker are gone.
- 2026-11-15: Logo (cloud couple) in nav and as favicon in theme colours; app icons regenerated; arrival tabs no longer cut off on desktop.
- 2026-11-15: Mobile review: one 'Route planen' button with app chooser (Google Maps, Apple Karten, Waze, other app on Android), FAQ accordion, smaller install button, card padding, stay filter rows, map fit padding, lining numerals on stats, map editor lists no longer clipped on phones, section nav clears at the top.
- 2026-11-15: Transit card lists every stop with line and walking time (ArrivalSummary), generated from the map; the couple's text is an optional note.
- 2026-11-15: `make https` — Traefik + local CA serve the app at https://wedding.local (mDNS) for testing install and push on phones.
- 2026-11-15: Response form is a step-by-step wizard; guests get an optional passkey instead of an edit link (`/api/rsvp/passkey`, table `response_passkeys`); install button uses the browser install prompt when offered.
- 2026-11-15: Unterkünfte on phones: list first with rows that expand in place (route preview), full-screen map with a card per pin; no more page jumps.
- 2026-11-15: Stay routes walk to the nearest tram stop first (boarding stop looked up server-side, cached), route labels sit beside the line, map attribution collapsed, nav logo removed.
- 2026-11-15: Stay routes board on the venue stop's line: line stops and track come from the OpenStreetMap API (`internal/routing/line.go`, cached), tram leg drawn along the rails; row preview map without time pills.
- 2026-11-16: Route time labels are placed by the map engine (symbol layers with collision detection) beside the line and away from pins; stale hotel notes corrected.
- 2026-11-16: Stay overview map gathers overlapping hotel pins into count bubbles that zoom in on tap.
- 2026-11-16: Stay map: tapping beside the pins clears the selection and zooms back out to all places.
- 2026-11-16: Stay map shows all numbered pins again (overlaps nudged apart, bubbles removed); location section now comes before the schedule.
- 2026-11-16: Transit tab draws the whole line of the venue stop with its stops (cached line from OpenStreetMap, public cache-only `/api/route/line`) and zooms out to show it.
- 2026-11-16: Arrival map: walk from the stop to the venue is green with footprints in the time label; whole line zooms out only when the line is tapped.
- 2026-11-16: Map labels: walk times carry the same footprints icon as the cards (own image, no longer squeezed); the venue heart shows the location name.
- 2026-11-16: Arrival map: top-left pill removed, stop markers carry their name.
- 2026-11-16: Renovate (renovate.json, modelled on corewire/kick) replaces Dependabot.
- 2026-11-16: Renovate merges minor, patch, digest and lock file updates itself once checks pass.
- 2026-11-16: Browser smoke test (web/e2e, Playwright) in CI: home page, guest answer via invite link, staff sign-in.
- 2026-11-16: More music genres (Metal, Hardcore, Punk, Electro Swing, Techno, …) with icons; genre answer may be longer.
- 2026-11-16: Couple dashboard hand-over: copy summary for the venue, copy music wishes for the DJ, guest list as CSV; `wedding demo` / `make demo` fills a development database with 30 made-up responses.
- 2026-11-17: Witness page shows everything in one view (status board with needs and contact, schedule, responses); tabs and list removed.
- 2026-11-17: Renovate PRs merged, npm audit gates only shipped packages, main protected with required checks, release v0.2.0.
- 2026-11-18: Image build cross-compiles instead of emulating arm64 (first v0.2.0 release run timed out after 6 h); release job limited to 45 min.
- 2026-11-19: Couple names and wedding date can be set in the editor (tab Begrüßung); the config file stays the fallback. First step towards guided setup, export/import and the wedwise CLI.
- 2026-11-19: Content file (CONTENT_PATH / chart `content`) only fills a fresh instance; export and import buttons in the content editor.
- 2026-11-19: Browser-approved sign-in for a `wedwise` command line client (several sites, content and invite links only), released as binaries.
- 2026-11-19: `wedwise mcp` serves the signed-in site to an AI agent (setup status, content, place search, nearby suggestions, themes, invite links).
- 2026-11-19: Setup checklist on the couple dashboard (names/date, welcome, venue, arrival, schedule, stays, FAQ, invite link); each item links to its editor tab; hidden once complete.
- 2026-11-19: CLI keeps its token in the system keyring (file only as fallback), WEDWISE_TOKEN for scripts.
- 2026-11-19: Command-line sign-in has its own rate limit; polling no longer locks the address out of logging in.
- 2026-11-19: Command-line token carries the approving account's role (whoami, responses, contributions, users; MCP offers only permitted tools). Language toggle DE/EN in nav and footer (visitor's choice stored on the device). Hero scroll cue removed.
- 2026-11-19: Release v0.3.0 (command line client binaries attached for the first time).
- 2026-11-19: Empty instance (no couple, no date in config) no longer crashes; release v0.3.1.
- 2026-11-19: Empty site shows 'Noch nicht eingerichtet' with a sign-in button to set it up.
- 2026-11-19: wedwise mcp covers the whole setup: photo upload, invite link PIN/limit/on-off, staff accounts, messages, walking time for stop suggestions, entries without ids.
- 2026-11-19: Stop suggestions (editor + MCP) carry the lines serving each stop, read from OpenStreetMap and cached.
- 2026-11-19: Stop suggestions leave out stops no line serves.
- 2026-11-19: Hotels without a Booking hotel-page link get a dateless Booking search; editor hint and MCP description ask for the hotel-page link.
- 2026-11-19: Response form no longer jumps to the top on Weiter or while typing (no remount gap, no sticky bar); v0.3.3.
- 2026-11-19: Calendar entry without the reply link; done screen no longer jumps to the page top; v0.3.4.
- 2026-11-19: Chips keep their width when selected; song results shown inline and the field moves above the keyboard; v0.3.4.
- 2026-11-19: News messages wrap long words and links on phones.
- 2026-11-19: Login with only a passkey as second factor asks just for the passkey (no code field); guest passkeys on staff login get a clear message; passkey rejections are logged.
- 2026-11-19: Opening a place to stay on a phone moves it once to the top of the screen so it fits.
- 2026-11-19: Footer shows the release version (GET /api/version, set at build time) and links to GitHub.
- 2026-11-19: Opened place to stay lands below both sticky bars (title no longer hidden).
- 2026-11-19: Invite page no longer snaps once the answer form is on screen (snapping fought the keyboard); typed-in field is moved above the on-screen keyboard, with room below the page; fields use 16px on phones.
- 2026-11-20: Phone basics: browser handles the keyboard (viewport resizes with it; own keyboard script and snap scrolling removed), buttons wrap, sticky next bar, tidy thank-you page with optional rows. On wedding.local for a real-phone check before release.
- 2026-11-20: Sign-in with a passkey alone (button on top, offered in the username field, offer to create one after a password sign-in; new keys are stored as passkeys). A response sent while signed in belongs to that account (one per account, 'Meine Antwort' in the menu, no extra passkey).
- 2026-11-20: Sprachumschalter als Flaggen oben rechts; Footer neu gestaltet (Herzlinie, Namen, ruhige Linkzeile, Version klein). Closes #74.
- 2026-11-20: Footer no longer flashes at the top while a page loads (main area keeps full screen height).
- 2026-11-20: Faster first load: pages and scripts are sent compressed (335 kB → 108 kB main script), hashed assets cached for a year, two variable font files preloaded instead of nine per-weight files, sign-in state resolved before first paint so the header does not switch layout.
- 2026-11-20: Answering through an invite link creates a guest account (role guest, no rights, no password) that owns the response and is signed in; signed-in staff answer on their own account. One kind of passkey: the thank-you row saves an account passkey and shows only while the account has none; every passkey button accepts it. Old response passkeys are not migrated.
- 2026-11-20: Signed-out visitors get a quiet person icon in the header (top right) leading to 'Meine Antwort' with passkey sign-in; hero untouched.
- 2026-11-20: Signed-out 'Meine Antwort' is a focused sign-in screen (key icon, one primary passkey button) instead of the response header with a text card; guests sign in with a passkey only.
- 2026-11-20: Sign-in for everyone: header icon opens the sign-in page (passkey first, password behind a link), everyone lands on 'Mein Bereich' (/me), signed-in header shows an initials menu.
