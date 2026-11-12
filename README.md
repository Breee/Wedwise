# Wedwise

Wedwise is a self-hosted, open-source wedding website. One container gives you
a public wedding page (schedule, location, arrival maps, places to stay, FAQ),
RSVP through shareable invite links, and a private area where witnesses plan
surprise contributions. Go backend, embedded SQLite, React frontend — no
third-party SaaS required.

> The guest-facing UI is currently German only. English is planned
> ([#20](https://github.com/Breee/Wedwise/issues/20)).

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Set up your wedding](#set-up-your-wedding)
- [Configuration reference](#configuration-reference)
- [Users and roles](#users-and-roles)
- [Deployment](#deployment)
- [Backup and restore](#backup-and-restore)
- [Security](#security)
- [Development](#development)

## Features

- 📖 **Wedding page** — hero, schedule, location, FAQ, add-to-calendar.
- 📱 **Installable** — guests can add the site to their home screen; their
  response is remembered so they can come back and edit it.
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
| `SESSION_SECRET` | `sessionSecret` | — | **Required**, at least 16 characters. Signs PIN cookies. Generate with `openssl rand -hex 32`. |
| `BASE_URL` | `baseUrl` | `http://localhost:8080` | The address people open. Logins from any other origin are rejected. |
| `ENVIRONMENT` | `environment` | `development` | Set to `production` behind HTTPS: cookies become `Secure`. |
| `LISTEN_ADDRESS` | `listenAddress` | `:8080` | Bind address. |
| `DATABASE_PATH` | `databasePath` | `/data/wedding.db` | SQLite file. |
| `CONFIG_PATH` | `configPath` | `/config/config.yaml` | This file. |
| `TRUST_PROXY_HEADERS` | `trustProxyHeaders` | `false` | Set `true` only behind a reverse proxy, so rate limits use `X-Forwarded-For`. |
| `ROUTING_API_KEY` | `routingApiKey` | — | Optional OpenRouteService key. |
| `THEME_PATH` | `themePath` | — | Optional custom theme file. |
| `CONTENT_PATH` | `contentPath` | — | Optional JSON content file (shape of `examples/content.json`). Applied at startup whenever the file changes; editor changes are kept until then. |
| `USERS_PATH` | `usersPath` | — | Optional YAML list of users (`username`, `role`, `password`, optional `email`, `displayName`) created at startup. Existing users are kept; a changed password is applied. |
| `IMAGES_PATH` | `imagesPath` | — | Optional directory served read-only under `/images/<name>`, e.g. for `location.image`. |
| `UPLOADS_PATH` | `uploadsPath` | `uploads/` next to the database | Where images uploaded in the content editor are stored (JPEG, PNG, WebP, GIF, max 8 MB). Served under `/uploads/<name>`. |

Keep secrets in environment variables, not in the config file.

### Themes

Bundled themes live in [`themes/`](themes/): `sage-leaf` (default),
`terracotta`, `sage-botanical`, and the scene themes `waldsee-dusk`,
`waldsee-forest`, `waldsee-night` with an illustrated backdrop on the invite
page. A theme defines colors, fonts and a decoration. To add your own, copy
one of the files, change it, and point `THEME_PATH` at it — it then shows up
in the picker.

## Users and roles

There is no public sign-up. Admins create users, reset passwords and
deactivate accounts in the UI under "Benutzer". The first admin is created
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

Always set your own `SESSION_SECRET`, set `BASE_URL` to your public URL, use
`ENVIRONMENT=production` behind HTTPS, and create your own users.

### Docker

Released images are published to `ghcr.io/breee/wedwise` (amd64 and arm64,
signed with cosign).

```bash
docker run -d --name wedwise -p 8080:8080 \
  -v wedwise-data:/data \
  -v "$(pwd)/config.yaml:/config/config.yaml:ro" \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e BASE_URL=https://wedding.example.com \
  -e ENVIRONMENT=production \
  -e TRUST_PROXY_HEADERS=true \
  ghcr.io/breee/wedwise:latest

docker exec -it wedwise /app/wedding user create --username admin --role admin --email you@example.com
```

Put a TLS-terminating reverse proxy (Caddy, Traefik, nginx) in front. Leave
out `TRUST_PROXY_HEADERS` if there is no proxy.

### Kubernetes (Helm)

The chart is in [`charts/wedwise`](charts/wedwise) and published to
`oci://ghcr.io/breee/charts/wedwise`.

```bash
helm install wedding oci://ghcr.io/breee/charts/wedwise \
  --set baseUrl=https://wedding.example.com \
  --set secret.sessionSecret="$(openssl rand -hex 32)" \
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
| `secret.existingSecret` | Use your own Secret with keys `session-secret` and optionally `routing-api-key`. |
| `persistence.size` / `persistence.existingClaim` | Volume for the SQLite file. |
| `ingress.*` | Host, class, annotations, TLS. |

SQLite lives on one volume, so the app runs as a single replica.

## Backup and restore

All state is the SQLite file at `DATABASE_PATH`. Take a consistent snapshot
while the server runs:

```bash
docker exec wedwise /app/wedding backup /data/backup.db
docker cp wedwise:/data/backup.db ./wedding-$(date +%F).db
```

On Kubernetes use `kubectl exec` and `kubectl cp` the same way. To restore,
stop the app, replace the file at `DATABASE_PATH`, start it again. Keep
backups somewhere else and test a restore once.

Uploaded images live in `/data/uploads`; copy that directory as well.

## Security

- Sessions are HttpOnly, SameSite=Lax cookies (Secure in production).
  State-changing requests are checked against the `Origin`/`Referer` header.
- Passwords and invite PINs are stored as argon2id hashes.
- Rate limits per client IP and minute: login 10, public RSVP endpoints 30,
  route and song lookups 60. Over the limit returns `429` with `Retry-After`.
- After 10 wrong PINs an invite link is locked for 15 minutes, whatever the
  client IP. Unknown or inactive links answer `404`.
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

Open work is tracked in
[GitHub issues](https://github.com/Breee/Wedwise/issues), grouped by
milestone. Bug reports and pull requests are welcome.

## License

[MIT](LICENSE)
