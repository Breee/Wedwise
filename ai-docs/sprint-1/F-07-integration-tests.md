# F-07 Integration tests for RSVP + content

## Problem
Only `internal/auth` has tests. The most important guest-facing flows (RSVP by token, public content) and the couple flows (content update) are unverified.

## GOOD
- Tests spin up the real router with a temp SQLite DB (reuse pattern from `internal/server/server_test.go`).
- Cover the happy path and the main failure (invalid token, validation error, wrong role).
- Run in < 5 s, no network, no Node.

## DONE
- [ ] `internal/server`: RSVP get/put by token, invalid token → 404, contribution add.
- [ ] `internal/server`: `GET /content/public` shape (`event` + `content`), `PUT /content` as couple ok, as witness → 403, invalid schedule → 400.
- [ ] `go test ./...` green (depends on F-01).
- [ ] `progress.md` updated.
