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
- [Command line](#command-line)
- [Deployment](#deployment)
- [Backup and restore](#backup-and-restore)
- [Data key](#data-key)
- [Security](#security)
- [Development](#development)

## Features

- 📖 **Wedding page** — hero, schedule, location, FAQ, add-to-calendar.
- 📱 **Installable** — guests can add the site to their home screen; their
  response is remembered so they can come back and edit it. The response
  form asks one thing per page; guests can save a passkey to change their
  answer later or on another device. No edit link is shown to them.
- 📰 **News feed** — messages sent to all guests also appear under "Neuigkeiten" on the home page.
- 🔔 **Push notifications** — guests can opt in to announcements; staff choose
  per device whether to hear about new responses and contributions (under
  "Konto"). Needs HTTPS (or localhost); on iOS only in the installed app.
  The VAPID keys are generated on first start and kept in the database.
- 🗺️ **Arrival & stay maps** — MapLibre maps on OpenFreeMap tiles (no API
  key): stops, parking and walking routes to the venue, and recommended
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
three demo users and loads example content. `make demo` adds 30 made-up
responses so the dashboards have something to show (development only):

| User | Password | Sees |
|------|----------|------|
| `admin` | `admin12345` | everything |
| `couple` | `couple12345` | responses, invite links, content editor |
| `witness` | `witness12345` | contributions, responses |

Log in at `/login`. Stop with `make down`; wipe all data with
`docker compose down -v`.

These passwords are for local testing only. For a real deployment see
[Deployment](#deployment).

### HTTPS in your local network

Installing the app on a phone and push messages need HTTPS. `make https` puts
Traefik in front of Wedwise and serves it at <https://wedding.local> for every
device in the same network:

```sh
make https   # needs openssl and avahi-publish (avahi-utils)
```

It creates a small certificate authority in `local/certs/` once, announces
`wedding.local` in the network and starts Traefik on ports 80 and 443. Each
phone has to trust `local/certs/ca.crt` once:

- **iPhone**: send yourself the file, open it, install the profile, then switch
  it on under Settings → General → About → Certificate Trust Settings.
- **Android**: Settings → Security → Encryption & credentials → Install a
  certificate → CA certificate.

`make down` stops everything. Other name or address: `make https HTTPS_HOST=… LAN_IP=…`
(delete `local/certs/` first so the certificate matches).

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
4. **Responses** — everyone lands on one dashboard, "Mein Bereich" (`/me`),
   after signing in. Its tabs depend on the role: your own response, all
   responses, food (diets and allergies), music wishes and, for witnesses and
   admins only, contributions with the running order. Staff can edit or delete
   responses.
5. **Routes on the maps** — you only enter coordinates for the venue, stops
   and hotels. Routes and travel times are looked up with a free
   [OpenRouteService](https://openrouteservice.org/dev/#/signup) key
   (`ROUTING_API_KEY`) and cached in the database, so each route is fetched
   once; they are looked up in the background whenever the content changes.
   Without a key the maps show estimated times only. For the tram or bus leg
   from a hotel, the line of your venue stop and its track are read once from
   OpenStreetMap and cached, so guests board at a stop on that line.

## Configuration reference

Settings come from a YAML file (`CONFIG_PATH`, default
`/config/config.yaml`); environment variables override it. See
[`examples/config.yaml`](examples/config.yaml) for the full file including the
`event` block.

| Env var | YAML key | Default | Purpose |
|---------|----------|---------|---------|
| `SESSION_SECRET` | `sessionSecret` | — | **Required**, at least 16 characters. Signs PIN cookies and encrypts stored link tokens. Generate with `openssl rand -hex 32`. |
| `DATA_KEY` | `dataKey` | — | **Required**, at least 32 characters, different from `SESSION_SECRET`. Encrypts guest data and backups – see [Data key](#data-key). Generate with `openssl rand -hex 32`. |
| `DATA_KEY_PREVIOUS` | `dataKeyPrevious` | — | The old key, only while rotating. |
| `BASE_URL` | `baseUrl` | `http://localhost:8080` | The address people open. Logins from any other origin are rejected. |
| – | `event.language` | `de` | UI language: `de` or `en`. Your own content is not translated. |
| – | `event.timezone` | `Europe/Berlin` | Time zone of the calendar entry. |
| – | `event.contributionMinutes` | `15` | Time limit suggested for guest contributions. |
| – | `event.musicGenres` | Pop, Rock, Metal, … (22) | Genres guests can pick in their response. |
| `ENVIRONMENT` | `environment` | `development` | Set to `production` behind HTTPS: cookies become `Secure`. |
| `LISTEN_ADDRESS` | `listenAddress` | `:8080` | Bind address. |
| `DATABASE_PATH` | `databasePath` | `/data/wedding.db` | SQLite file. |
| `CONFIG_PATH` | `configPath` | `/config/config.yaml` | This file. |
| `TRUST_PROXY_HEADERS` | `trustProxyHeaders` | – | Required in production. `true` behind a reverse proxy, so rate limits use `X-Forwarded-For`; `false` when clients connect directly. |
| `IMAGE_HOSTS` | `imageHosts` | – | Extra origins images may load from, comma separated, e.g. `https://photos.example.org`. Uploaded images need no entry. |
| `REQUIRE_TWO_FACTOR` | `auth.requireTwoFactor` | — | Roles that must use two-factor login, e.g. `admin,witness` (`admin`, `couple`, `witness`). |
| `SESSION_MAX_AGE` | `auth.sessionMaxAge` | `24h` | A login ends after this time, whatever happens. |
| `SESSION_IDLE_TIMEOUT` | `auth.sessionIdleTimeout` | `2h` | A login ends after this time without activity. |
| `ROUTING_API_KEY` | `routingApiKey` | — | OpenRouteService key for routes and travel times on the maps, and for the place search and nearby suggestions (stops, car parks, places to stay) in the map editors. Ratings, prices and free rooms are not part of that data. |
| `THEME_PATH` | `themePath` | — | Optional custom theme file. |
| `CONTENT_PATH` | `contentPath` | — | Optional JSON content file (shape of `examples/content.json`). Fills a fresh instance at first start; ignored once content exists, so it never overwrites the editor. Use export and import in the editor to move content later. |
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
stored as argon2id hashes. Signed-in users change their own password under
"Konto"; this needs the current password and signs out all other devices.

Every user can switch on two-factor login under "Konto" (TOTP authenticator
app). The TOTP secret is stored encrypted with the [data key](#data-key), recovery
codes are stored as hashes and shown once. Admins can reset a user's second
factor in the user list. Set `REQUIRE_TWO_FACTOR` to make it mandatory per
role: those users can only reach "Konto" until they have set up a passkey or
an authenticator app.

"Konto" also lists the devices that are signed in, with a button to sign out
one of them or all others. Changing the password or the second factor ends
every other session and gives the current device a fresh one.

Passkeys and hardware tokens (WebAuthn, e.g. YubiKey) can be added there as
well. A passkey is another way to sign in, not a second step: username and
password still work alone, unless the user has switched on an authenticator
app or the role is listed in `REQUIRE_TWO_FACTOR`. In that case the password
is followed by the code or the key. Only the public key
is stored. They are bound to the host in `BASE_URL` and need HTTPS (or
`localhost`). Recovery codes exist only together with an authenticator app, so
register two keys or add TOTP as a fallback.

A setup link also offers "Mit Passkey einrichten": the user registers a
passkey instead of a password and then signs in with "Mit Passkey anmelden"
on the login page, without username or password. Such passkeys require user
verification on the device. Using a setup link signs the person in right
away – except when a password is set for an account that needs a second
step after the password, which still has to sign in with both.

The login page offers the passkey first; username and password are one tap
away. After a password sign-in to an account without a passkey, the page
asks the browser's password manager to create one by itself (WebAuthn
conditional create). Where the browser cannot do that, it offers
"Passkey erstellen" once instead.

**Guest accounts.** A guest who saves a passkey after answering gets an
account with the role `guest`. It has no username to type, no e-mail and no
password, only the passkey, and it can do one thing: see and change its own
response. A guest who lost the passkey gets the "Bearbeitungslink" of their
response from the couple (replies table); saving through it signs them in
again, and they can save a new passkey.

**Deleting an account.** Everyone can delete their own account under "Mein
Bereich" ("Konto löschen"). This also deletes their own response and signs
them out everywhere. The only admin cannot delete themselves.

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

## Command line

`wedwise` is a small client for your own computer. It works on a running
site with the rights of your account, for scripts or an AI assistant. Download it
from the [releases](https://github.com/Breee/Wedwise/releases) page.

```sh
wedwise login https://wedding.example   # opens the browser; sign in and allow access
wedwise status                          # what is filled in, what is missing
wedwise content export content.json
wedwise content import content.json
wedwise invite create
wedwise whoami                          # your account and role
wedwise responses list                  # couple, witness, admin
wedwise contributions list              # witness, admin
wedwise users list                      # admin
wedwise logout
```

Several sites work side by side, like `glab` or `gh`: `wedwise hosts` lists
them, `wedwise use <host>` switches, and `--host <host>` or `WEDWISE_HOST`
picks one for a single command.

The client may do what the role of the account that allowed it may do: an
`admin` everything, a `couple` no contributions, a `witness` no content.
Only password and sign-in settings stay in the browser. The access lasts 90 days, shows up on the account page under "Kommandozeile",
can be withdrawn there, and is recorded in the audit log. The token is stored
in the system keyring (Keychain, Windows Credential Manager, Secret Service).
Only where none is available, for example on a server, it goes into a file
only you can read (`wedwise/credentials.json` in your config directory), and
`wedwise login` says so. In scripts, set `WEDWISE_HOST` and `WEDWISE_TOKEN`
instead of signing in.

### Let an AI agent set up the site

`wedwise mcp` serves the current site to an agent over the Model Context
Protocol (stdio), using the same sign-in and the same limits. Add it to your
agent as a local server, for example:

```json
{ "mcpServers": { "wedwise": { "command": "wedwise", "args": ["mcp"] } } }
```

The agent can do everything the setup needs: read what is still missing, read
and change every content section, search places, get nearby stops (with their lines and the walking
time to the location) and places to stay, upload a photo, pick a design, create
and change invite links (PIN, limit, on/off), post a message to guests and, as
admin, create staff accounts with a setup link. With the matching role it also
reads responses, contributions and users; tools the role may not use are not
offered. What it cannot know: hotel ratings, prices or free rooms – ask the couple or check them yourself.

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

Put a TLS-terminating reverse proxy (Traefik, nginx) in front. Set
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
| `content` | Page content (schedule, location, travel, accommodation, FAQ, theme name), same shape as `examples/content.json`. Fills a fresh instance at first start and is ignored afterwards; leave empty to use the editor only. |
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
| [`examples/deploy/compose`](examples/deploy/compose) | Docker Compose with Traefik for automatic HTTPS (`cp .env.example .env`, `docker compose up -d`). |
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
contribute including the witnesses' notes – and the staff's authenticator
secrets with AES-256-GCM before they are written to the database. Names, attendance and diet stay readable so the
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
  route and song lookups 300. Over the limit returns `429` with `Retry-After`.
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

To report a vulnerability see [SECURITY.md](SECURITY.md). The
[threat model](docs/threat-model.md) and the
[review against OWASP ASVS level 2](docs/security-review.md) describe what is
protected, what is not, and what is still open.

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
`helm lint` on every push. A browser smoke test (`web/e2e`, Playwright) starts
the app with the example content and checks the home page, a guest answer
through an invite link and the staff sign-in. Run it locally with `make up`
and `npm run smoke` in `web/`.

Security checks run on every push, weekly and before each release:
`govulncheck`, `gosec`, `npm audit`, a Trivy scan of the image and CodeQL. A
high or critical finding in the first four stops the release; CodeQL results
show up under the repository's *Security* tab. Renovate proposes updates for
Go, npm, the base images and the workflow actions (`renovate.json`) and merges
them itself once the checks pass; only major versions wait for a review.

Open work is tracked in
[GitHub issues](https://github.com/Breee/Wedwise/issues), grouped by
milestone. Bug reports and pull requests are welcome.

## License

[MIT](LICENSE)
