# Mobile review (390×844, 2026-10-31)

Screenshots: `.playwright-mcp/rev-*.png`. Public page and RSVP form checked as guest; admin nav checked logged in.

## Must fix

- [ ] **Directions links everywhere**: Anreise tabs Rad and Auto have no "Route planen" to the venue/parking/tram stop; stop cards only have Google/Apple. Add a shared `DirectionsLinks` (Google Maps, Apple Karten; Brave has no maps product/URL scheme → offer OpenStreetMap/Komoot or skip) under every arrival tab and on stay cards.
- [ ] **Logged-in nav overflows**: links (Übersicht, Einladungslinks, Inhalte, Abmelden) get cut off and show a desktop scrollbar. Use a hamburger/sheet menu below `sm`.
- [ ] **Hero**: ~200 px dead space below "Wir freuen uns auf euch." on phones; tighten `min-h` and add a scroll cue or "Zum Ablauf" link.
- [ ] **Ablauf** takes 2.5 screens; show time + title on one line (`14:00 · Gästeankunft`) with tighter spacing.
- [ ] **Location photo card**: address overlay overlaps the pavilion; move address below the image on mobile.

## Should fix

- [ ] **Stay list** is ~7 screens long (10 hotels). Show 3 by default + "Alle 10 anzeigen"; collapse travel-time grid to a single line (`Tram 18 · Fuß 9 · Rad 5 Min`).
- [ ] **Stay map** sits above the list and is not sticky on mobile; selecting a hotel draws the route off-screen. Scroll map into view on select, or show a mini route badge in the card.
- [ ] **Hotel markers** 7–10 cluster at Münsterplatz; add tiny collision offset or combine into a "4" cluster bubble when zoomed out.
- [ ] **RSVP contribution block**: 7 need-checkboxes + Sonstiges + phone + 3 messenger boxes + Matrix field = very long. Group needs as chip buttons (like genres), hide Matrix behind "Weitere Kontaktmöglichkeit".
- [ ] **RSVP attendee cards**: diet Select + allergies + Kind checkbox per person; put diet/Kind side by side (`grid-cols-2`).
- [ ] **Submit button** not sticky; on long forms users scroll a lot. Make the submit bar sticky at bottom once the form is dirty.
- [ ] **Form sections** share the same card look; add a small step indicator (1/4 … 4/4) or progressive reveal to shorten perceived length.

## Nice to have

- [ ] Add "Zum Kalender hinzufügen" (ICS) under the hero date.
- [ ] Section anchors in a sticky mini-nav (Ablauf · Ort · Anreise · Unterkünfte) for guests — currently no in-page navigation at all.
- [ ] Share button (Web Share API) on the RSVP "Fertig" screen for the edit link.
- [ ] Footer "Login" link is noise for guests; move to `/login` only, or make it tiny.
- [ ] Map attribution covers the bottom-left route label on small maps; use `compact` attribution control.
- [ ] Respect `prefers-reduced-motion` for the animated route dash and whileInView fades.
