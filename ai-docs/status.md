# Application status (review 2026-10-30)

## Implemented and working

| Area | Backend | Frontend |
|---|---|---|
| Auth | login/logout/me, argon2id, sessions, CSRF (Origin check), secure cookies in production | `/login` |
| Roles | `couple`, `witness`, `admin` permission matrix (`internal/auth/permissions.go`, tested) | role-based redirect `/dashboard` |
| Users | `GET /api/users`; create/passwd/enable/disable via CLI only | none |
| Content | `GET /api/content/public`, `PUT /api/content` (hero, intro, location, schedule, FAQ) | `/` public page (fixed 2026-10-30 to read the nested API shape) |
| Guests | full CRUD | `/couple/guests` |
| Invitations | full CRUD, regenerate token, set public/shared link | `/couple/invitations` |
| RSVP | public by token: get/put, add contribution; protected summary | `/rsvp/:token` form (attendance, guests, food, allergies, message, music wish, contribution) |
| Contributions | list/get/update/add note; witness only (couple/admin intentionally blocked) | `/witness/dashboard` |
| Config | YAML config + env overrides, theme YAML, SQLite, migrations, single binary with embedded SPA | — |
| Deploy | Dockerfile, k8s manifests, `docker-compose.yml`, `make up`/`make down` with seeded users + content | — |

## Missing or partial

- No admin UI (and no HTTP API) to edit content, schedule, FAQ, users — content is only editable via `PUT /api/content` with curl.
- No user management API; CLI only.
- UI is English-only (labels, date format) while wedding content is German. No i18n layer.
- `AppNav` shows "Sign out" even when no user is logged in (seen on first load).
- RSVP: contribution is auto-submitted right after the RSVP without a confirmation step.
- Guest form field `name` vs backend `displayName` — works via mapping, but fragile.
- Diet: frontend offers a fixed option list, backend stores free text.
- No email sending (invitation links must be shared manually).
- No rate limiting on login / public RSVP endpoints.
- Tests: only `internal/auth` has tests. `go test ./...` fails locally until `web/dist` exists (`cd web && npm run build`), because `web/embed.go` embeds it.
- Public page: introduction text is empty for the local setup; hero image unsupported in UI.
