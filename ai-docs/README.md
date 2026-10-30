# ai-docs

Working notes for AI-assisted development of Wedwise. Human-readable, kept in git.

| File | Purpose |
|---|---|
| `status.md` | Current state of the app: what exists, what is missing (snapshot from the review on 2026-10-30) |
| `progress.md` | Running log + checklist. Update after every finished step. |
| `sprint-1/README.md` | Sprint goal and feature list |
| `sprint-1/F-*.md` | One file per feature with **GOOD** (quality bar) and **DONE** (acceptance checklist) |

## How to work with this

- Pick the next feature from `sprint-1/README.md` that is not blocked.
- A feature is only finished when every DONE box in its file is ticked and `progress.md` is updated.
- Local review: `make up` → http://localhost:8080 (users: admin/admin12345, couple/couple12345, witness/witness12345). `make down` stops it; `docker compose down -v` wipes data.
- Content/event data for the local setup lives in `local/config.yaml` and `local/content.json`.
