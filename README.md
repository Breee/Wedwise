# Wedwise

Wedwise is a self-hosted, open-source wedding website application. It gives
couples a single place to publish their wedding story, collect RSVPs through
shareable invite links, and let guests offer program contributions — all from a
lightweight Go backend with an embedded SQLite database and a React frontend. It ships as a single container image, so it's easy to run on your
own server, NAS, or Kubernetes cluster without depending on third-party SaaS
tools.

## Features

- 📖 **Wedding site** — customizable hero, venue details, schedule, and story
  content driven by a simple YAML configuration file.
- 🗺️ **Arrival & stay maps** — interactive MapLibre maps (OpenFreeMap tiles,
  no API key): walking routes with minutes from nearby stops to the venue,
  bike route highlighting, and recommended hotels with price tier plus
  Booking.com property links pre-filled with the wedding dates. The
  `/update-hotels` command (skill `accommodation-research`) re-checks
  ratings, availability and links via the browser. Stops and hotels are edited in the
  content UI. Accommodations are hotels or Ferienwohnungen and can be
  filtered by price tier and type. Routes are stored with the content; missing
  ones come from OpenRouteService (optional `ROUTING_API_KEY`), the public OSM
  router, or a straight-line estimate.
- 🎨 **Theming** — pick a theme in the editor; themes are YAML files (see
  `themes/`) with colors, fonts and decoration, custom ones via `THEME_PATH`.
- 💌 **Invite links** — no personalized invitations: create one or more
  links in the couple area (optionally PIN-protected), share them, and guests
  respond per household at `/rsvp/<token>`, greeted by a short intro scene.
  Every response gets a private edit link; couple, witnesses and admins can
  edit or delete responses in their dashboards.
- 🎁 **Contributions** — guests can offer a program contribution (what, what
  they need, a WhatsApp/Signal/Telegram contact, ~15 min limit) in the same
  form. Only witnesses and admins see these (Kanban board, schedule planning,
  editing); the couple only ever sees attendance and food.
- 🔐 **Authentication** — session-based auth with an admin CLI for user
  management, no external identity provider required.
- 🗄️ **SQLite storage** — zero-dependency embedded database; back up by
  copying a single file.
- 📦 **Single binary / single container** — the React frontend is built and
  embedded into the Go binary, producing one deployable artifact.

## Quick Start (Docker)

Pull or build the image, then run it with a persistent volume for the
database and a mounted config directory:

```bash
docker build -t wedwise:latest .

docker run -d \
  --name wedwise \
  -p 8080:8080 \
  -v wedwise-data:/data \
  -v "$(pwd)/examples/config.yaml:/config/config.yaml:ro" \
  -e SESSION_SECRET=change-me-to-a-random-32-byte-secret \
  wedwise:latest
```

The `Makefile` provides shortcuts for the same steps:

```bash
make docker-build
make docker-run
```

Once running, visit `http://localhost:8080`.

`make up` runs the compose stack with dev users (`admin`/`couple`/`witness`, password `<role>12345`).
It bootstraps `local/` (gitignored, mounted as `/config`) from `examples/` on first run —
edit `local/config.yaml` and `local/content.json` for your own wedding.

## Local Development

Prerequisites: Go 1.22+, Node 20+, and `npm`.

```bash
# Backend (serves the API, reloads on manual restart)
make dev-backend

# Frontend (Vite dev server with hot reload, proxies API calls to the backend)
make dev-frontend
```

Build a production artifact (frontend assets embedded into the Go binary):

```bash
make build
./bin/wedding serve
```

Run tests and lint:

```bash
make test
make lint
```

## Configuration

Wedwise is configured via a YAML file, by default read from
`CONFIG_PATH` (defaults to `/config/config.yaml` in the container, or a path
passed via CLI flag/env var locally). See [`examples/config.yaml`](examples/config.yaml)
for a fully-documented example covering:

- `listenAddress` / `baseUrl` — where the server binds and its public URL.
- `databasePath` — path to the SQLite database file.
- `event` — wedding details: couple names, date, venue, and hero/landing
  page copy.

Visual appearance is chosen in the content editor (tab "Design"). Themes are
bundled from [`themes/`](themes/) (`sage-leaf` is the default; also
`terracotta`, `sage-botanical` and the scene themes `waldsee-dusk`,
`waldsee-forest`, `waldsee-night`) and define colors, fonts and a decoration
(`none`, `botanical`, or an invite intro scene `dusk`/`forest`/`night`). To add your own, copy one of the YAML files,
tweak it, and point `themePath` (env `THEME_PATH`) at it — it then appears in
the picker alongside the bundled ones. Served via `GET /api/themes`.

Secrets (such as `SESSION_SECRET`) should be provided via environment
variables, not committed to the config file.

## Security

- Sessions are HttpOnly, SameSite=Lax cookies (Secure when `ENVIRONMENT=production`);
  state-changing requests are checked against the `Origin`/`Referer` header.
  Set `BASE_URL` to the address people actually open (for example
  `BASE_URL=http://192.168.1.20:8080 docker compose up -d`), otherwise logins
  from other hosts are rejected.
- `POST /api/auth/login` is limited to 10 requests per client IP and minute,
  the public RSVP endpoints (unlock, submit, read/update by edit token) to 30.
  Exceeding the limit returns `429` with a `Retry-After` header.
- Invite links can carry a PIN (stored as an argon2id hash). A successful
  unlock sets an HttpOnly cookie signed with `SESSION_SECRET` (at least
  16 characters, required); changing the PIN invalidates existing cookies.
  Inactive or unknown links answer `404`.
- Client IPs are taken from the TCP connection. Behind a reverse proxy set
  `TRUST_PROXY_HEADERS=true` (or `trustProxyHeaders: true`) so the last
  `X-Forwarded-For` hop is used instead. Do not enable it without a proxy, as
  the header could then be spoofed to bypass the limits.
- Request bodies are capped at 1 MB and unknown JSON fields are rejected.
- Live route lookups are optional. Set `ROUTING_API_KEY` (or `routingApiKey`)
  to a free [OpenRouteService](https://openrouteservice.org) key and the app
  proxies them through `GET /api/route` (60 requests per minute per IP), so
  the key never reaches the browser. Routes stored in the content are always
  used first; without a key the public OSRM demo server and a straight-line
  estimate are the fallbacks.

## User Administration

Admin users are managed via the `wedding` CLI rather than a public sign-up
flow:

```bash
# Create a user (roles: couple, witness, admin)
./bin/wedding user create --username admin --role admin --email admin@example.com

# List users
./bin/wedding user list

# Reset a user's password (also invalidates that user's sessions)
./bin/wedding user passwd --username admin

# Deactivate / reactivate a user
./bin/wedding user disable --username admin
./bin/wedding user enable --username admin
```

Passwords are hashed with argon2id and are prompted for interactively when
`--password` is omitted. Run `./bin/wedding help` for the full list of
commands and flags.

### Roles and permissions

| Role | Permissions |
|------|-------------|
| `couple` | content read/write, RSVP read, invite links |
| `witness` | contribution read/manage, RSVP read |
| `admin` | everything: user read/manage, content read/write, RSVP read, invite links, contribution read/manage |

Contributions are surprises for the couple: the `couple` role cannot read or
manage them — only witnesses and admins can. Guests offer
contributions as part of their RSVP, and the response list and summary
deliberately contain no contribution data. Witnesses coordinate contributions
on a Kanban board and plan the programme (start time + duration) in the
schedule view.

## Kubernetes Deployment

Manifests are provided under [`deploy/kubernetes/`](deploy/kubernetes):

| File | Purpose |
|------|---------|
| `deployment.yaml` | Runs the `wedwise` container, mounts data/config volumes, wires up probes and resource limits. |
| `service.yaml` | Exposes the deployment on port 80 inside the cluster. |
| `pvc.yaml` | Persistent volume claim for the SQLite database. |
| `ingress.yaml` | Example NGINX ingress with TLS termination. |
| `configmap.yaml` | Application configuration (`config.yaml`) as a ConfigMap. |
| `secret-example.yaml` | Template for the `wedwise-secrets` Secret; copy to `secret.yaml`, fill in real values, and **do not commit it**. |

Deploy:

```bash
cp deploy/kubernetes/secret-example.yaml deploy/kubernetes/secret.yaml
# edit deploy/kubernetes/secret.yaml with a real session secret

kubectl apply -f deploy/kubernetes/configmap.yaml
kubectl apply -f deploy/kubernetes/secret.yaml
kubectl apply -f deploy/kubernetes/pvc.yaml
kubectl apply -f deploy/kubernetes/deployment.yaml
kubectl apply -f deploy/kubernetes/service.yaml
kubectl apply -f deploy/kubernetes/ingress.yaml
```

Update `ingress.yaml`'s host and `configmap.yaml`'s `baseUrl` before going
to production.

## Backup Procedure

The entire application state lives in a single SQLite file at
`databasePath` (default `/data/wedding.db`). To back it up safely:

```bash
# Docker: copy the file out of the volume (safe even while running, SQLite
# handles concurrent readers; for extra safety, use the CLI dump command
# if available, or briefly stop the container first)
docker cp wedwise:/data/wedding.db ./backups/wedding-$(date +%F).db

# Kubernetes: copy from the running pod
kubectl cp <namespace>/<pod-name>:/data/wedding.db ./backups/wedding-$(date +%F).db
```

The CLI can also write a consistent snapshot while the server is running:

```bash
./bin/wedding backup ./backups/wedding-$(date +%F).db
```

Restoring is the reverse: stop the container/pod, replace the file at
`databasePath`, and restart. Store backups off-cluster (e.g., object storage)
and test restores periodically.

## Contributing

Contributions are welcome! To contribute:

1. Fork the repository and create a feature branch.
2. Make your changes, keeping frontend (`web/`) and backend (`internal/`,
   `cmd/`) concerns separated.
3. Run `make test` and `make lint` before opening a pull request.
4. Describe the change and its motivation clearly in the PR description.
5. Be respectful and constructive in code review — this is a community
   project maintained in people's spare time.

Bug reports and feature requests are welcome via GitHub Issues.

## License

Wedwise is released under the [MIT License](LICENSE).
