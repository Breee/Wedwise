# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report them privately through GitHub:
<https://github.com/Breee/Wedwise/security/advisories/new>

Include what you found, how to reproduce it and which version or commit you
tested. You can expect a first answer within 7 days. Once a fix is released,
the advisory is published and you are credited unless you prefer otherwise.

## Supported versions

Only the latest release receives security fixes. Releases are signed with
cosign and ship an SBOM; the image digest is listed in the release notes.

## Scope

In scope: the application in this repository, its container image and Helm
chart. Out of scope: findings that need a compromised host, a malicious
operator, or a reverse proxy configured against the README.

## Further reading

- [Threat model](docs/threat-model.md)
- [Security review against OWASP ASVS level 2](docs/security-review.md)
- [Security section of the README](README.md#security)
