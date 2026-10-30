# Progress

Update this file after every finished step. Newest entries first in the log.

## Sprint 1 checklist

| ID | Feature | Status |
|---|---|---|
| F-01 | Fix failing `go test ./...` without a frontend build | todo |
| F-02 | Hide "Sign out" when logged out | superseded by F-08 |
| F-03 | German UI (i18n with de as default) | superseded by F-08 |
| F-04 | Admin/couple content editor (hero, intro, location, schedule, FAQ) | superseded by F-08 |
| F-05 | RSVP contribution confirmation step | superseded by F-08 |
| F-06 | Login rate limiting | todo |
| F-07 | Backend integration tests for RSVP + content | todo |
| F-08 | Frontend rewrite in React (TanStack, Tailwind, shadcn) | in progress |

Status values: `todo`, `in progress`, `blocked (reason)`, `done (commit)`.

## Log

- 2026-10-30 — Decided full React rewrite (F-08); F-02–F-05 folded into it.
- 2026-10-30 — Review done, `ai-docs/` created, sprint 1 defined.
- 2026-10-30 — Fixed public page not showing event/location (`2e976e7`).
- 2026-10-30 — Local setup: compose, `make up/down`, seeded users, Waldsee content (`b0d40b9`, `2db788b`, `e1100f9`).
