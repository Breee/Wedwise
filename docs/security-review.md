# Security review against OWASP ASVS level 2

Reviewed on 2026-11-14 at the end of the security sprint (issues #39–#52),
against ASVS 4.0.3 level 2. The review covered the Go backend, the React
client, the container image and the Helm chart, by reading the code and the
tests and by checking the running application.

| Chapter | Result | Notes |
|---|---|---|
| V1 Architecture | Pass | [Threat model](threat-model.md); one trust boundary per layer; secrets only from environment |
| V2 Authentication | Pass | Argon2id, lockout, TOTP, passkeys, recovery codes, setup links expire, own password change. Not done by choice: breach-list check, out-of-band notification |
| V3 Session management | Pass | Hashed ids, `__Host-` cookie, Strict, idle and absolute timeout, renewal, remote sign-out |
| V4 Access control | Pass | Permission check on every protected route, deny by default, tests for the couple/contribution boundary |
| V5 Validation and encoding | Pass | Typed JSON decoding with size limit, parameterised SQL, length and format checks, no HTML rendering of user input |
| V6 Cryptography at rest | Pass | AES-256-GCM with a dedicated data key (guest data, second-factor secrets), rotation, encrypted backups |
| V7 Logging and errors | Pass | Structured logs without link tokens, append-only audit log, generic error messages |
| V8 Data protection | Pass | `no-store` on API responses, guests can delete their answer, privacy note, image metadata stripped |
| V9 Communication | Pass with condition | TLS is terminated by the reverse proxy; HSTS in production |
| V10 Malicious code | Pass | Dependencies scanned, signed releases, SBOM |
| V11 Business logic | Pass | Rate limits, response caps per link, bulk delete |
| V12 Files and resources | Pass | Uploads re-encoded and size-limited; outgoing push requests only reach public addresses |
| V13 API | Pass | Origin check on every state-changing request, JSON only, consistent error shape |
| V14 Configuration | Pass | Strict CSP and headers, distroless non-root image, pinned digests, explicit proxy trust in production |

## Findings

| Issue | Finding | Severity | Status |
|---|---|---|---|
| [#57](https://github.com/Breee/Wedwise/issues/57) | Request log contains invite and edit tokens | Medium | Fixed |
| [#58](https://github.com/Breee/Wedwise/issues/58) | Push subscriptions can point the server at internal addresses | Medium | Fixed |
| [#59](https://github.com/Breee/Wedwise/issues/59) | Staff cannot change their own password | Low | Fixed |
| [#60](https://github.com/Breee/Wedwise/issues/60) | Second-factor secrets are encrypted with the session secret | Low | Fixed |

Accepted risks are listed in the [threat model](threat-model.md#accepted-risks).
This was a self-review by the maintainers, not an independent audit.
