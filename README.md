# Wedwise

Wedwise is a self-hosted, open-source wedding website. One container gives you
a public wedding page (schedule, location, arrival maps, places to stay, FAQ),
RSVP through shareable invite links, and a private area where witnesses plan
surprise contributions. Go backend, embedded SQLite, React frontend — no
third-party SaaS required.

> The UI is available in German (default) and English – set `event.language`.

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Set up your wedding](#set-up-your-wedding)
- [Configuration reference](#configuration-reference)
- [Users and roles](#users-and-roles)
- [Deployment](#deployment)
- [Backup and restore](#backup-and-restore)
- [Data key](#data-key)
- [Security](#security)
- [Development](#development)

## Features

- 📖 **Wedding page** — hero, schedule, location, FAQ, add-to-calendar.
- 📱 **Installable** — guests can add the site to their home screen; their
  response is remembered so they can come back and edit it.
- 📰 **News feed** — messages sent to all guests also appear under "Neuigkeiten" on the home page.
- 🔔 **Push notifications** — guests can opt in to announcements; staff choose
  per device whether to hear about new responses and contributions (under
  "Konto"). Needs HTTPS (or localhost); on iOS only in the installed app.
  The VAPID keys are generated on first start and kept in the database.
- 🗺️ **Arrival & stay maps** — MapLibre maps on OpenFreeMap tiles (no API
  key): tram line, walking and bike routes to the venue, and recommended
  hotels / holiday flats with price tier, filters and Booking.com links
  pre-filled with your dates.
- 🎨 **Themes** — pick one in the editor; add your own as a YAML file.
- 💌 **Invite links** — no personalised invitations. Create one or more links
  (optionally PIN-protected) and share them. Guests answer per household and
  get a private link to edit their answer later.
- 🎁 **Contributions** — guests can offer a programme item. Only witnesses and
  admins see these (Kanban board, schedule planning); the couple only sees
  attendance and food.
- 🔐 **Built-in auth** — sessions, roles, admin CLI. No identity provider.
- 📦 **One artifact** — the frontend is embedded in the Go binary; state is a
  single SQLite file.

## Quick start

Requirements: Docker with Compose, `make`, `curl`.

```bash
git clone https://github.com/Breee/Wedwise.git
cd Wedwise
make up
```

Open <http://localhost:8080>. `make up` builds the image, starts it, creates
three demo users and loads example content:

| User | Password | Sees |
|------|----------|------|
| `admin` | `admin12345` | everything |
| `couple` | `couple12345` | responses, invite links, content editor |
| `witness` | `witness12345` | contributions, responses |

Log in at `/login`. Stop with `make down`; wipe all data with
`docker compose down -v`.

These passwords are for local testing only. For a real deployment see
[Deployment](#deployment).

## Set up your wedding

1. **Event basics** — on first run `make up` copies `examples/` to `local/`
   (gitignored, mounted as `/config`). Edit `local/config.yaml`: title, couple
   names, date, venue, hero text. Restart with `make up`.
2. **Content** — log in as `couple` or `admin` and open **Inhalte**. Tabs:
   welcome text, location (text, photo URL), arrival (venue coordinates,
   stops, parking), places to stay, schedule, FAQ, design (theme). Changes are
   saved to the database and live immediately.
   `local/content.json` is only used to seed an empty database; you can also
   push it yourself with `PUT /api/content`.
3. **Invite links** — open **Einladungslinks**, create a link, optionally set
   a PIN, copy the URL and send it to your guests. Deactivate or regenerate a
   link at any time; existing responses are kept.
4. **Responses** — the couple dashboard shows attendance, diets, allergies and
   music wishes. Witnesses see contributions on a board and plan the running
   order. Staff can edit or delete responses.
5. **Routes on the maps (optional)** — walking/bike/car routes are stored with
   the content. For missing ones, set `ROUTING_API_KEY` to a free
   [OpenRouteService](https://openrouteservice.org/dev/#/signup) key. Results
   are cached in the database, so each route is fetched once.

## Configuration reference

Settings come from a YAML file (`CONFIG_PATH`, default
`/config/config.yaml`); environment variables override it. See
[`examples/config.yaml`](examples/config.yaml) for the full file including the
`event` block.

| Env var | YAML key | Default | Purpose |
|---------|----------|---------|---------|
| `SESSION_SECRET` | `sessionSecret` | — | **Required**, at least 16 characters. Signs PIN cookies and encrypts stored secrets and link tokens. Generate with `openssl rand -hex 32`. |
| `DATA_KEY` | `dataKey` | — | **Required**, at least 32 characters, different from `SESSION_SECRET`. Encrypts guest data and backups – see [Data key](#data-key). Generate with `openssl rand -hex 32`. |
| `DATA_KEY_PREVIOUS` | `dataKeyPrevious` | — | The old key, only while rotating. |
| `BASE_URL` | `baseUrl` | `http://localhost:8080` | The address people open. Logins from any other origin are rejected. |
| – | `event.language` | `de` | UI language: `de` or `en`. Your own content is not translated. |
| – | `event.timezone` | `Europe/Berlin` | Time zone of the calendar entry. |
| – | `event.contributionMinutes` | `15` | Time limit suggested for guest contributions. |
| – | `event.musicGenres` | Pop, Rock, … | Genres guests can pick in their response. |
| `ENVIRONMENT` | `environment` | `development` | Set to `production` behind HTTPS: cookies become `Secure`. |
| `LISTEN_ADDRESS` | `listenAddress` | `:8080` | Bind address. |
| `DATABASE_PATH` | `databasePath` | `/data/wedding.db` | SQLite file. |
| `CONFIG_PATH` | `configPath` | `/config/config.yaml` | This file. |
| `TRUST_PROXY_HEADERS` | `trustProxyHeaders` | – | Required in production. `true` behind a reverse proxy, so rate limits use `X-Forwarded-For`; `false` when clients connect directly. |
| `IMAGE_HOSTS` | `imageHosts` | – | Extra origins images may load from, comma separated, e.g. `https://photos.example.org`. Uploaded images need no entry. |
| `REQUIRE_TWO_FACTOR` | `auth.requireTwoFactor` | — | Roles that must use two-factor login, e.g. `admin,witness` (`admin`, `couple`, `witness`). |
| `SESSION_MAX_AGE` | `auth.sessionMaxAge` | `24h` | A login ends after this time, whatever happens. |
| `SESSION_IDLE_TIMEOUT` | `auth.sessionIdleTimeout` | `2h` | A login ends after this time without activity. |
| `ROUTING_API_KEY` | `routingApiKey` | — | Optional OpenRouteService key. |
| `THEME_PATH` | `themePath` | — | Optional custom theme file. |
| `CONTENT_PATH` | `contentPath` | — | Optional JSON content file (shape of `examples/content.json`). Applied at startup whenever the file changes; editor changes are kept until then. |
| `USERS_PATH` | `usersPath` | — | Optional YAML list of users (`username`, `role`, `password`, optional `email`, `displayName`) created at startup. Existing users are kept; a changed password is applied. |
| `IMAGES_PATH` | `imagesPath` | — | Optional directory served read-only under `/images/<name>`, e.g. for `location.image`. |
| `UPLOADS_PATH` | `uploadsPath` | `uploads/` next to the database | Where images uploaded in the content editor are stored (JPEG, PNG, WebP, GIF, max 8 MB). They are re-encoded on upload: EXIF data such as GPS position is removed and the longest side is capped at 2560 px. Served under `/uploads/<name>`. |

Keep secrets in environment variables, not in the config file.

### Themes

Bundled themes live in [`themes/`](themes/): `sage-leaf` (default),
`terracotta`, `sage-botanical`, and the scene themes `waldsee-dusk`,
`waldsee-forest`, `waldsee-night` with an illustrated backdrop on the invite
page. A theme defines colors, fonts and a decoration. To add your own, copy
one of the files, change it, and point `THEME_PATH` at it — it then shows up
in the picker.

## Users and roles

There is no public sign-up. Admins create users and deactivate accounts in
the UI under "Benutzer" (create, deactivate, delete). Creating a user yields a one-time setup link (valid
7 days) where the person sets their own password; a new link doubles as a
password reset. Only a hash of the link token is stored, passwords are
stored as argon2id hashes.

Every user can switch on two-factor login under "Konto" (TOTP authenticator
app). The TOTP secret is stored AES-GCM encrypted with a key derived from
`SESSION_SECRET` (changing that secret invalidates enrolments), recovery
codes are stored as hashes and shown once. Admins can reset a user's second
factor in the user list. Set `REQUIRE_TWO_FACTOR` to make it mandatory per
role: those users can only reach "Konto" until they have set up a passkey or
an authenticator app.

"Konto" also lists the devices that are signed in, with a button to sign out
one of them or all others. Changing the password or the second factor ends
every other session and gives the current device a fresh one.

Passkeys and hardware tokens (WebAuthn, e.g. YubiKey) can be added there as
well and are used as the second step after the password. Only the public key
is stored. They are bound to the host in `BASE_URL` and need HTTPS (or
`localhost`). Recovery codes exist only together with an authenticator app, so
register two keys or add TOTP as a fallback.

A setup link also offers "Mit Passkey einrichten": the user registers a
passkey (Face ID, fingerprint, device PIN) instead of a password and then
signs in with "Mit Passkey anmelden" on the login page, without username or
password. Such passkeys require user verification on the device.

The first admin is created
with the CLI inside the container (or via `USERS_PATH`):

```bash
docker compose exec wedwise /app/wedding user create --username anna --role couple --email anna@example.com
docker compose exec wedwise /app/wedding user list
docker compose exec wedwise /app/wedding user passwd --username anna
docker compose exec wedwise /app/wedding user disable --username anna
docker compose exec wedwise /app/wedding user enable --username anna
```

The password is prompted for when `--password` is omitted. Resetting a
password also ends that user's sessions.

| Role | Can do |
|------|--------|
| `couple` | edit content, manage invite links, read/edit responses |
| `witness` | read/manage contributions, read/edit responses |
| `admin` | everything above, plus users |

Contributions are surprises: the `couple` role can never read them, and the
response list and summary contain no contribution data.

## Deployment

Always set your own `SESSION_SECRET` and `DATA_KEY`, set `BASE_URL` to your public URL, use
`ENVIRONMENT=production` behind HTTPS, and create your own users.

### Docker

Released images are published to `ghcr.io/breee/wedwise` (amd64 and arm64,
signed with cosign). Every release carries an SBOM (`wedwise-<tag>.spdx.json`).

```bash
docker run -d --name wedwise -p 8080:8080 \
  -v wedwise-data:/data \
  -v "$(pwd)/config.yaml:/config/config.yaml:ro" \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e DATA_KEY="$(openssl rand -hex 32)" \
  -e BASE_URL=https://wedding.example.com \
  -e ENVIRONMENT=production \
  -e TRUST_PROXY_HEADERS=true \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  ghcr.io/breee/wedwise:latest

docker exec -it wedwise /app/wedding user create --username admin --role admin --email you@example.com
```

Put a TLS-terminating reverse proxy (Caddy, Traefik, nginx) in front. Set
`TRUST_PROXY_HEADERS=false` if there is no proxy; in production Wedwise does
not start without an explicit choice.

The image contains only the application binary, CA certificates and time zone
data – no shell or package manager – and runs as user 1000. Use
`/app/wedding <command>` with `docker exec` for administration. To run a fixed
build, pin the digest shown in the release notes
(`ghcr.io/breee/wedwise@sha256:…`).

### Kubernetes (Helm)

The chart is in [`charts/wedwise`](charts/wedwise) and published to
`oci://ghcr.io/breee/charts/wedwise`.

```bash
helm install wedding oci://ghcr.io/breee/charts/wedwise \
  --set baseUrl=https://wedding.example.com \
  --set secret.sessionSecret="$(openssl rand -hex 32)" \
  --set secret.dataKey="$(openssl rand -hex 32)" \
  --set ingress.enabled=true --set ingress.host=wedding.example.com

kubectl exec -it deploy/wedding-wedwise -- /app/wedding user create --username admin --role admin --email you@example.com
```

Useful values (see [`values.yaml`](charts/wedwise/values.yaml)):

| Value | Purpose |
|-------|---------|
| `config` | Your event settings, same keys as `examples/config.yaml`. |
| `content` | Page content (schedule, location, travel, accommodation, FAQ, theme name), same shape as `examples/content.json`. Applied whenever it changes; leave empty to use the editor only. |
| `theme` | Optional custom theme, same shape as the files in `themes/`. |
| `users` | Users created at startup (`username`, `role`, `password`). Stored in the chart Secret; with `secret.existingSecret` add a `users.yaml` key there. |
| `images.files` | Images as base64 (`--set images.files.lake\\.jpg="$(base64 -w0 lake.jpg)"`), served under `/images/<name>`. About 1 MiB in total; use `images.existingConfigMap` for more. |
| `secret.existingSecret` | Use your own Secret with keys `session-secret`, `data-key` and optionally `data-key-previous`, `routing-api-key`. |
| `persistence.size` / `persistence.existingClaim` | Volume for the SQLite file. |
| `ingress.*` | Host, class, annotations, TLS. |

SQLite lives on one volume, so the app runs as a single replica.

The pod runs as non-root with a read-only root filesystem, all capabilities
dropped, the `RuntimeDefault` seccomp profile and no service account token.
Optional hardening:

- `image.digest=sha256:…` pins the image.
- `networkPolicy.enabled=true` allows inbound traffic only to the HTTP port
  (limit the sources with `networkPolicy.ingressFrom`) and outbound traffic
  only to DNS and to HTTPS on public addresses, which covers the routing, song
  search and push services.

### Ready-made examples

| Path | What |
|------|------|
| [`examples/deploy/compose`](examples/deploy/compose) | Docker Compose with Caddy for automatic HTTPS (`cp .env.example .env`, `docker compose up -d`). |
| [`examples/deploy/helm/values.yaml`](examples/deploy/helm/values.yaml) | Helm values with ingress, cert-manager TLS and an existing Secret. |
| [`examples/deploy/gitops/flux`](examples/deploy/gitops/flux) | Flux `OCIRepository` + `HelmRelease`. |
| [`examples/deploy/gitops/argocd`](examples/deploy/gitops/argocd) | Argo CD `Application`. |

For GitOps keep the Secret (`session-secret`, `data-key`) out of plain Git – use SOPS,
Sealed Secrets or External Secrets.

## Backup and restore

All state is the SQLite file at `DATABASE_PATH`. Take a consistent snapshot
while the server runs:

```bash
docker exec wedwise /app/wedding backup /data/backup.wedwise
docker cp wedwise:/data/backup.wedwise ./wedding-$(date +%F).wedwise
```

The backup file is encrypted with `DATA_KEY` (AES-256-GCM) and useless
without it. On Kubernetes use `kubectl exec` and `kubectl cp` the same way.

To restore, stop the app, move the old file at `DATABASE_PATH` away, then
decrypt the backup into its place and start the app again:

```bash
docker run --rm -v wedwise-data:/data -v "$(pwd):/backup:ro" \
  -e SESSION_SECRET=... -e DATA_KEY=... \
  ghcr.io/breee/wedwise:latest restore /backup/wedding-2027-06-01.wedwise
```

Keep backups somewhere else and test a restore once.

Uploaded images live in `/data/uploads`; copy that directory as well.

## Data key

`DATA_KEY` encrypts what guests tell you in confidence – allergies, children's
ages, e-mail, phone, messenger handles, messages, and what they offer to
contribute including the witnesses' notes – with AES-256-GCM before it is
written to the database. Names, attendance and diet stay readable so the
overview can count them. Backups are encrypted as a whole with the same key.

- **Keep a copy of the key outside the server** (password manager). Without it
  neither the database nor any backup can be read; there is no recovery.
- Store it apart from the data: a leaked volume or backup is harmless only as
  long as the key is not next to it.
- **Rotate** when the key may have leaked: set `DATA_KEY` to a new value and
  `DATA_KEY_PREVIOUS` to the old one, then restart (or run
  `wedding rekey`). Everything is re-encrypted on start; afterwards remove
  `DATA_KEY_PREVIOUS`. Backups made earlier still need the old key.
- Upgrading from a version without `DATA_KEY`: set one and start; existing
  data is encrypted on the first start. Backups made before stay plain – delete
  them once you have a new one.
- A wrong key stops the server at start instead of damaging data.

## Security

- Sessions are HttpOnly cookies; in production they are Secure, SameSite=Strict
  and carry the `__Host-` prefix (SameSite=Lax otherwise). Only a hash of the
  session id is stored. Sessions end after `SESSION_MAX_AGE` or
  `SESSION_IDLE_TIMEOUT` without activity.
  State-changing requests are checked against the `Origin`/`Referer` header.
- Passwords and invite PINs are stored as argon2id hashes.
- Sensitive guest data and backups are encrypted with a dedicated key, see
  [Data key](#data-key).
- Invite and edit tokens are stored as SHA-256 hashes, so a leaked database
  or backup opens no response. A copy encrypted with AES-256-GCM (key derived
  from `SESSION_SECRET`) lets staff copy a link again; after changing the
  secret the links keep working, but invite links must be regenerated to be
  shown again. Tokens from older versions are converted on the first start;
  backups made before that still contain them in plain text.
- Rate limits per client IP and minute: login 10, public RSVP endpoints 30,
  route and song lookups 60. Over the limit returns `429` with `Retry-After`.
  Counters live in the database with hashed keys, so they survive restarts
  and no IP address is stored.
- After 5 wrong logins an account is locked for 1 minute, doubling with every
  further failure up to 15 minutes, whatever the client IP. A successful
  login clears it.
- After 10 wrong PINs an invite link is locked for 15 minutes, whatever the
  client IP. Unknown or inactive links answer `404`.
- Each invite link can carry a maximum number of responses and accepts at most
  20 new responses per 10 minutes. Staff can filter responses by link and
  delete several at once.
- Every login, logout, failed login, copied link and change made by a
  signed-in user goes into an append-only audit log (user, action, target,
  time — never the content). Admins read it under **Protokoll**
  (`GET /api/audit-log`); the table rejects updates and deletes.
- Browser policy: scripts, styles and fonts load only from the app itself.
  Images load from the app and from the hosts in `IMAGE_HOSTS`; an image URL
  on any other host stays blank. Style attributes in markup are refused,
  pages cannot be framed, and `Cross-Origin-Opener-Policy` and
  `Cross-Origin-Resource-Policy` are `same-origin`. API responses carry
  `Cache-Control: no-store`, apart from song search and route lookups.
- Song search and route lookups are proxied by the backend, so guests'
  browsers do not contact those services and the routing key stays private.
  Map tiles are loaded from OpenFreeMap by the browser.
- Request bodies are capped at 1 MB; unknown JSON fields are rejected.

## Development

Requirements: Go 1.24+, Node 22+.

```bash
make dev-backend    # API on :8080
make dev-frontend   # Vite dev server with hot reload
make test           # go test ./...
make build          # frontend + binary in bin/wedding
```

The frontend lives in `web/` (React, TanStack Router/Query, Tailwind,
shadcn/ui), the backend in `cmd/` and `internal/`, SQL migrations in
`migrations/`. CI runs Go tests, the frontend build, a container build and
`helm lint` on every push.

Security checks run on every push, weekly and before each release:
`govulncheck`, `gosec`, `npm audit`, a Trivy scan of the image and CodeQL. A
high or critical finding in the first four stops the release; CodeQL results
show up under the repository's *Security* tab. Dependabot proposes updates for
Go, npm, the base image and the workflow actions every week.

Open work is tracked in
[GitHub issues](https://github.com/Breee/Wedwise/issues), grouped by
milestone. Bug reports and pull requests are welcome.

## License

[MIT](LICENSE)
