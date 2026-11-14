# Threat model

Wedwise is a single-binary wedding site: a public page, an RSVP form behind
invite links, and a small staff area. It stores its data in one SQLite file
and is meant to run behind a TLS-terminating reverse proxy.

## Assets

| Asset | Why it matters |
|---|---|
| Guest answers: names, children's ages, allergies, e-mail, phone, messenger handles, messages | Personal, partly health-related data |
| Contributions (surprises planned by guests) | Must stay hidden from the couple |
| Invite link tokens and PINs | Whoever has one can submit answers |
| Edit tokens | Whoever has one can read, change or delete one answer |
| Staff accounts, sessions, second factors | Give access to all of the above |
| `SESSION_SECRET`, `DATA_KEY` | Protect tokens, second-factor secrets, guest data and backups |
| Page content and uploaded images | Shown to every guest |

## Actors

| Actor | Access | Trust |
|---|---|---|
| Visitor | Public page | None |
| Guest | Invite link, own edit token | Low: may share links, may be careless |
| Couple | Content, invite links, answers without contributions | Trusted, but must not see contributions |
| Witness | Answers and contributions | Trusted |
| Admin | Everything, user management, audit log | Fully trusted |
| Operator | Host, environment, backups | Fully trusted |
| Attacker on the internet | Any public endpoint | None |
| Attacker with a copy of the database or a backup | File at rest | None |

## Trust boundaries

1. Internet → reverse proxy → application (HTTP, cookies, tokens in URLs).
2. Application → SQLite file and upload directory on the data volume.
3. Application → external services: routing (OpenRouteService), song search
   (iTunes), web push services chosen by the subscriber's browser.
4. Browser → map tiles and routing fallbacks, directly from the client.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| Guessing passwords | Argon2id, minimum length 10, per-IP rate limit, per-account lockout with backoff, optional enforced second factor (TOTP or passkey) |
| Guessing invite links, PINs or edit tokens | 128-bit and 192-bit random tokens, PIN failure limit per link, per-IP rate limits, counters persisted across restarts |
| Session theft or fixation | HttpOnly cookie, `__Host-` prefix and SameSite=Strict in production, session ids stored hashed, idle and absolute timeouts, new session on credential change, device list with remote sign-out |
| Cross-site request forgery | Origin/Referer check against `BASE_URL` on every state-changing request, SameSite cookies |
| Cross-site scripting, clickjacking | React escaping, strict Content-Security-Policy without inline scripts or style attributes, image host allowlist, `frame-ancestors 'none'`, COOP/CORP |
| Couple reading contributions | Server-side permission check on every contribution route; answer and summary endpoints never include contribution data; covered by tests |
| Spam through a leaked invite link | Response cap and submit rate limit per link, deactivate or regenerate the link, bulk delete |
| Stolen database file or backup | Tokens stored as hashes plus an encrypted copy, guest data sealed with AES-256-GCM under `DATA_KEY`, backups encrypted, key rotation |
| Malicious uploads | Staff only, size limit, images decoded and re-encoded (metadata removed), fixed extensions, random file names |
| Abuse by or of a staff account | Role-based permissions, append-only audit log of staff actions and logins |
| Spoofed client address | `X-Forwarded-For` only honoured when `TRUST_PROXY_HEADERS` is set; the choice is mandatory in production |
| Vulnerable dependencies or base image | govulncheck, gosec, npm audit, Trivy, CodeQL and Dependabot in CI; releases blocked on high findings |
| Container breakout or lateral movement | Distroless image, non-root, read-only filesystem, no capabilities, seccomp, optional NetworkPolicy |
| Tampered release | Images signed with cosign, build provenance, SBOM, digest pinning |

## Accepted risks

- **Invite links and edit links are bearer secrets.** Anyone who receives a
  forwarded link can use it. Links can be capped, protected with a PIN,
  regenerated or deactivated; guests can delete their answer.
- **The operator and admins are trusted.** Someone with the environment
  variables can decrypt everything.
- **No TLS in the application.** It must run behind a proxy that terminates
  TLS; HSTS is sent in production.
- **Single SQLite file, single replica.** Availability depends on the host;
  there is no protection against volumetric denial of service beyond the rate
  limits.
- **Third-party requests from the browser.** Map tiles and client-side routing reveal the
  guest's IP address to those providers.
- **No e-mail.** Staff are not notified out of band about logins or credential
  changes; the device list and audit log are the substitutes.
- **Passwords are not checked against breach lists.** The application makes no
  outbound request with password material.
- **Staff see guest data in clear.** Encryption protects data at rest, not
  from authorised accounts.

## Keeping this current

Update this document when an asset, actor or external service is added. Open
findings are tracked as GitHub issues with the `security` label.
