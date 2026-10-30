# F-04 Content editor for the couple

## Problem
Hero, intro, location, schedule and FAQ can only be changed with `curl -X PUT /api/content`. The backend (`internal/content`) already supports it; only the UI is missing.

## GOOD
- Couple (and admin) open `/couple/content`, edit everything in plain forms, press save, reload `/` and see the result.
- Schedule and FAQ: add / remove / reorder rows.
- Clear save feedback (success, validation error from backend shown next to the form).
- Unsaved changes are not lost silently (warn on navigation).
- No new backend concepts; reuse `GET /api/content` + `PUT /api/content` as-is.

## DONE
- [ ] Route `/couple/content` + nav entry, guarded by `content:write` permission.
- [ ] Forms for: hero (eyebrow, headline, subtitle, note), introduction, location (name, address, description, navigationUrl, transport, parking), schedule rows, FAQ rows.
- [ ] Save calls `PUT /api/content`; response replaces local state; errors (`400`) displayed.
- [ ] Public page reflects changes without restart (verified in browser).
- [ ] `local/content.json` seeding in `make up` still works on a fresh volume.
- [ ] `progress.md` updated.
