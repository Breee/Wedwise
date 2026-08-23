# Wedwise

Wedwise is a self-hosted, open-source wedding website application. It gives
couples a single place to publish their wedding story, collect RSVPs, manage
their guest list, share invitations, and (optionally) accept contributions —
all from a lightweight Go backend with an embedded SQLite database and a Vue
frontend. It ships as a single container image, so it's easy to run on your
own server, NAS, or Kubernetes cluster without depending on third-party SaaS
tools.

## Features

- 📖 **Wedding site** — customizable hero, venue details, schedule, and story
  content driven by a simple YAML configuration file.
- 🎨 **Theming** — swap colors, typography, and spacing via YAML theme files
  (see `themes/`), no rebuild required.
- 💌 **Invitations & RSVP** — send personalized invitation links and collect
  structured RSVP responses (attendance, meal choices, plus-ones, notes).
- 👥 **Guest management** — track guests, households, and invitation status
  from an admin interface.
- 🎁 **Contributions** — optional gift/contribution tracking module.
- 🔐 **Authentication** — session-based auth with an admin CLI for user
  management, no external identity provider required.
- 🗄️ **SQLite storage** — zero-dependency embedded database; back up by
  copying a single file.
- 📦 **Single binary / single container** — the Vue frontend is built and
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
  -v "$(pwd)/examples/theme.yaml:/config/theme.yaml:ro" \
  -e SESSION_SECRET=change-me-to-a-random-32-byte-secret \
  wedwise:latest
```

The `Makefile` provides shortcuts for the same steps:

```bash
make docker-build
make docker-run
```

Once running, visit `http://localhost:8080`.

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

Visual appearance is controlled separately via a theme file (see
`themePath`), with ready-to-use examples in [`examples/theme.yaml`](examples/theme.yaml),
[`themes/default/theme.yaml`](themes/default/theme.yaml), and
[`themes/example-botanical/theme.yaml`](themes/example-botanical/theme.yaml).
Themes define colors, fonts, spacing, and border radius — copy one, tweak
the values, and point `themePath` at it.

Secrets (such as `SESSION_SECRET`) should be provided via environment
variables, not committed to the config file.

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
| `couple` | content read/write, guest read/write, invitation read/write, RSVP read/manage |
| `witness` | contribution read/manage, RSVP read, guest read, invitation read |
| `admin` | user read/manage, content read/write, guest read/write, invitation read/write, RSVP read/manage |

Contributions are surprises for the couple: neither the `couple` nor the
`admin` role can read or manage them — only witnesses can. Guests submit
contributions through their personal RSVP link, and the RSVP summary
deliberately contains no contribution data.

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
