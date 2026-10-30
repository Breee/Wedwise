# F-06 Login rate limiting

## Problem
`POST /api/auth/login` and public RSVP token endpoints have no rate limit; passwords and tokens can be brute-forced.

## GOOD
- Simple in-memory limiter per IP (+ per username for login). No external dependency, no Redis.
- Limits generous enough for a wedding (e.g. 10 login attempts / minute / IP), returns `429` with `Retry-After`.
- Logged as a warning with request id, no password or token in logs.

## DONE
- [x] Middleware in `internal/middleware`, applied to `/api/auth/login` and `/api/rsvp/{token}*`.
- [x] Unit test: N+1 requests → `429`; window expiry → allowed again.
- [x] Manual check with curl loop against `make up`.
- [x] README security section mentions the limits.
- [x] `progress.md` updated.

## Decisions
- Per-IP only. A per-username counter would let an attacker lock the couple out
  of their own account by spamming their username; with 10/min/IP and bcrypt
  passwords this is the better trade-off for a small site.
- `X-Forwarded-For` is only honoured when `TRUST_PROXY_HEADERS=true`.
- Limits: login 10/min, RSVP token routes 30/min (`internal/server/server.go`).
