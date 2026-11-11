# Mobile review (390×844, 2026-10-31)

Status: implemented 2026-10-31 (commit "Mobile polish"), except marker clustering and section mini-nav.

Screenshots: `.playwright-mcp/rev-*.png`. Public page and RSVP form checked as guest; admin nav checked logged in.

## Must fix

- [x] **Directions links everywhere**: Anreise tabs Rad and Auto have no "Route planen" to the venue/parking/tram stop; stop cards only have Google/Apple. Add a shared `DirectionsLinks` (Google Maps, Apple Karten; Brave has no maps product/URL scheme → offer OpenStreetMap/Komoot or skip) under every arrival tab and on stay cards.
- [x] **Logged-in nav overflows**: links (Übersicht, Einladungslinks, Inhalte, Abmelden) get cut off and show a desktop scrollbar. Use a hamburger/sheet menu below `sm`.
- [x] **Hero**: ~200 px dead space below "Wir freuen uns auf euch." on phones; tighten `min-h` and add a scroll cue or "Zum Ablauf" link.
- [x] **Ablauf** takes 2.5 screens; show time + title on one line (`14:00 · Gästeankunft`) with tighter spacing.
- [x] **Location photo card**: address overlay overlaps the pavilion; move address below the image on mobile.

## Should fix

- [x] **Stay list** is ~7 screens long (10 hotels). Show 3 by default + "Alle 10 anzeigen"; collapse travel-time grid to a single line (`Tram 18 · Fuß 9 · Rad 5 Min`).
- [x] **Stay map** sits above the list and is not sticky on mobile; selecting a hotel draws the route off-screen. Scroll map into view on select, or show a mini route badge in the card.
- [x] **Hotel markers** 7–10 cluster at Münsterplatz; add tiny collision offset or combine into a "4" cluster bubble when zoomed out.
- [x] **RSVP contribution block**: 7 need-checkboxes + Sonstiges + phone + 3 messenger boxes + Matrix field = very long. Group needs as chip buttons (like genres), hide Matrix behind "Weitere Kontaktmöglichkeit".
- [x] **RSVP attendee cards**: diet Select + allergies + Kind checkbox per person; put diet/Kind side by side (`grid-cols-2`).
- [x] **Submit button** not sticky; on long forms users scroll a lot. Make the submit bar sticky at bottom once the form is dirty.
- [x] **Form sections** share the same card look; add a small step indicator (1/4 … 4/4) or progressive reveal to shorten perceived length.

## Nice to have

- [x] Add "Zum Kalender hinzufügen" (ICS) under the hero date.
- [ ] Section anchors in a sticky mini-nav (Ablauf · Ort · Anreise · Unterkünfte) for guests — currently no in-page navigation at all.
- [x] Share button (Web Share API) on the RSVP "Fertig" screen for the edit link.
- [x] Footer "Login" link is noise for guests; move to `/login` only, or make it tiny.
- [x] Map attribution covers (already `compact`) the bottom-left route label on small maps; use `compact` attribution control.
- [x] Respect `prefers-reduced-motion` for the animated route dash and whileInView fades.

## Round 2 (2026-11-11, 390×844)

Checked: home, `/rsvp/<link>` (intro + form), couple dashboard, invite links, content editor, witness dashboard.
Public pages and witness dashboard: no sideways scroll, no console errors.

- [x] Content editor tabs make the page scroll sideways (#15)
- [x] Invite links table hides its actions (#16)
- [x] Responses table hides the edit button (#17)
- [x] Tap targets below 40px: tabs, chips, tram link, Kanban grip, icon buttons (#18)
- [x] Sticky section mini-nav (#10)
