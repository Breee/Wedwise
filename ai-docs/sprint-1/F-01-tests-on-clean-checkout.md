# F-01 Tests pass on a clean checkout

## Problem
`go test ./...` fails with `pattern all:dist: no matching files found` when `web/dist` is not built (`web/embed.go`). Blocks CI and every other test task.

## GOOD
- `go test ./...` works right after `git clone` without Node installed.
- Production build still embeds the real SPA; no runtime behaviour change.
- No committed build artifacts.

## DONE
- [x] `web/embed.go` tolerates a missing `dist` (e.g. commit `web/dist/.gitkeep` and embed `all:dist`, or embed via a placeholder file) — chosen approach documented in the file's comment.
- [x] `rm -rf web/dist && go test ./...` passes.
- [x] `docker compose build` still produces a working image (`make up`, open `/`).
- [x] `Makefile` `test` target runs the Go tests; `README.md` mentions it.
- [x] `progress.md` updated.
