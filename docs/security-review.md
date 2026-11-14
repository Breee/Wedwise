# Security review against OWASP ASVS level 2

Reviewed on 2026-11-14 at the end of the security sprint (issues #39–#52),
against ASVS 4.0.3 level 2. The review covered the Go backend, the React
client, the container image and the Helm chart, by reading the code and the
tests and by checking the running application.

| Chapter | Result | Notes |
|---|---|---|
| V1 Architecture | Pass | [Threat model](threat-model.md); one trust boundary per layer; secrets only from environment |
| V2 Authentication | Findings | Argon2id, lockout, TOTP, passkeys, recovery codes, setup links expire. Open: #59. Not done by choice: breach-list check, out-of-band notification |
| V3 Session management | Pass | Hashed ids, `__Host-` cookie, Strict, idle and absolute timeout, renewal, remote sign-out |
| V4 Access control | Pass | Permission check on every protected route, deny by default, tests for the couple/contribution boundary |
| V5 Validation and encoding | Pass | Typed JSON decoding with size limit, parameterised SQL, length and format checks, no HTML rendering of user input |
| V6 Cryptography at rest | Findings | AES-256-GCM with a dedicated data key, rotation, encrypted backups. Open: #60 |
| V7 Logging and errors | Findings | Structured logs, append-only audit log, generic error messages. Open: #57 |
| V8 Data protection | Pass | `no-store` on API responses, guests can delete their answer, privacy note, image metadata stripped |
| V9 Communication | Pass with condition | TLS is terminated by the reverse proxy; HSTS in production |
| V10 Malicious code | Pass | Dependencies scanned, signed releases, SBOM |
| V11 Business logic | Pass | Rate limits, response caps per link, bulk delete |
| V12 Files and resources | Findings | Uploads re-encoded and size-limited. Open: #58 |
| V13 API | Pass | Origin check on every state-changing request, JSON only, consistent error shape |
| V14 Configuration | Pass | Strict CSP and headers, distroless non-root image, pinned digests, explicit proxy trust in production |

## Open findings

| Issue | Finding | Severity |
|---|---|---|
| [#57](https://github.com/Breee/Wedwise/issues/57) | Request log contains invite and edit tokens | Medium |
| [#58](https://github.com/Breee/Wedwise/issues/58) | Push subscriptions can point the server at internal addresses | Medium |
| [#59](https://github.com/Breee/Wedwise/issues/59) | Staff cannot change their own password | Low |
| [#60](https://github.com/Breee/Wedwise/issues/60) | Second-factor secrets are encrypted with the session secret | Low |

Accepted risks are listed in the [threat model](threat-model.md#accepted-risks).
This was a self-review by the maintainers, not an independent audit.
