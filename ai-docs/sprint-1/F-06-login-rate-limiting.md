# F-06 Login rate limiting

## Problem
`POST /api/auth/login` and public RSVP token endpoints have no rate limit; passwords and tokens can be brute-forced.

## GOOD
- Simple in-memory limiter per IP (+ per username for login). No external dependency, no Redis.
- Limits generous enough for a wedding (e.g. 10 login attempts / minute / IP), returns `429` with `Retry-After`.
- Logged as a warning with request id, no password or token in logs.

## DONE
- [ ] Middleware in `internal/middleware`, applied to `/api/auth/login` and `/api/rsvp/{token}*`.
- [ ] Unit test: N+1 requests → `429`; window expiry → allowed again.
- [ ] Manual check with curl loop against `make up`.
- [ ] README security section mentions the limits.
- [ ] `progress.md` updated.
