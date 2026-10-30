# F-03 German UI

## Problem
All labels, buttons, headings and the formatted date are English; the wedding content is German.

## GOOD
- Guests see a fully German site: nav, hero buttons, section titles, RSVP form, validation messages, empty states, footer.
- Dates formatted as `Freitag, 25. Juni 2027`.
- Strings live in one place (e.g. `web/src/i18n/de.ts`), not scattered. Default locale `de`; keep `en` as fallback so nothing is lost.
- No mixed-language screens.

## DONE
- [ ] i18n mechanism in place (vue-i18n or a minimal `t()` composable — pick the smallest that works, note decision in this file).
- [ ] All user-visible strings in `web/src/views/**`, `components/**` moved to the locale file.
- [ ] Date/time formatting uses locale `de-DE`.
- [ ] `grep -rn "Reply to invitation\|Sign out\|Schedule\|Questions & answers" web/src --include=*.vue` returns nothing outside locale files.
- [ ] Verified in browser: `/`, `/rsvp/<token>`, `/login`, couple + witness dashboards, 404 page.
- [ ] `progress.md` updated.
