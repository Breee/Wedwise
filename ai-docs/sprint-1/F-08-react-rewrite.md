# F-08 — Frontend rewrite in React

Replaces F-02, F-03, F-04, F-05 (all frontend-only items). Their requirements are folded into this feature.

## Decision

Replace the Vue 3 app in `web/` with a React app. Keep the build contract: `npm run build` in `web/` produces `web/dist`, embedded by `web/embed.go`. Dockerfile stays unchanged.

## Stack

- React 19 + TypeScript, Vite
- TanStack Router (file-based routes), TanStack Query, TanStack Form
- Tailwind v4 + shadcn/ui (Radix primitives), Motion for animations
- Fonts: serif display (Cormorant Garamond) + sans body (Inter)
- Palette: warm cream background, blush/terracotta accent, sage secondary, gold details

## GOOD

- All routes from the Vue app exist: `/`, `/rsvp/$token`, `/login`, `/dashboard`, `/couple/dashboard`, `/couple/guests`, `/couple/invitations`, `/witness/dashboard`.
- UI text is German by default (F-03).
- Nav shows "Abmelden" only when logged in (F-02).
- RSVP: contribution is a separate confirm step, not auto-submitted (F-05).
- Couple content editor for hero, intro, location, schedule, FAQ via `PUT /api/content` (F-04).
- `go build ./...` embeds the new dist; app served at :8080 via `make up`.
- Verified with Playwright: home shows Waldsee content, RSVP flow works, login + couple/witness dashboards render.

## DONE

- [ ] Scaffold React app, remove Vue sources
- [ ] Public home page
- [ ] RSVP page with contribution confirm step
- [ ] Login + auth guard + nav
- [ ] Couple: dashboard, guests, invitations, content editor
- [ ] Witness: dashboard with contributions
- [ ] Playwright verification
