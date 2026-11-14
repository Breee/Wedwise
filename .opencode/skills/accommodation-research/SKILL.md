---
name: accommodation-research
description: "Use when the user asks to research, check, refresh, or update the recommended hotels/accommodations for the wedding site, check Booking.com availability or ratings for the stay dates, or when the /update-hotels command is invoked."
---

# Accommodation Research

Keep `local/content.json` → `accommodation.hotels` current: only well-rated, actually bookable places near the venue, with working deep links.

## Rules

- Rating ≥ 7.5/10 on Booking.com (guest rating, not star class).
- Reachable in ≤ ~30 min from the venue via tram 1 (board at the nearest stop in `travel.stops`) + walk, or ≤ 25 min on foot.
- Prefer real hotels/guesthouses over single private apartments (Booking filter `ht_id=204`).
- Additionally keep 3–5 Ferienwohnungen with `"kind": "apartment"` (Booking filter `ht_id=201`, same rating and distance rules); they feed the Hotel/Ferienwohnung filter. Coordinates are on the property page in `[data-atlas-latlng]`.
- Target 10 hotel entries, sorted by the frontend automatically; keep price tiers mixed (1 = budget, 2 = mid, 3 = upscale).
- Each hotel needs: `name`, `area`, `lat`, `lng`, `priceTier`, `note` (German, one sentence, include "Bewertung X,X/10"), `url` (own website, must return 200), `bookingUrl` (Booking property page `https://www.booking.com/hotel/de/<slug>.de.html`, no query string — the frontend appends dates/guests).
- Do not store routes or geometry; the app routes from coordinates and caches the result.
- Never fabricate slugs, ratings, or prices. Omit a field rather than guess.
- Stay dates come from `accommodation.checkIn` / `checkOut`.

## No price API

Booking.com (Demand API), Expedia Rapid, Airbnb and Google Hotels only expose prices to contracted affiliate/ads partners. Do not look for a workaround; use the browser.

## Procedure

1. Read `local/content.json`; note `checkIn`, `checkOut`, venue `travel.lat/lng`, tram stops.
2. Open the Booking search via Playwright (`tools.playwright.browser_navigate`, then `browser_run_code_unsafe` for scraping):
   `https://www.booking.com/searchresults.de.html?ss=Freiburg+im+Breisgau&checkin=<in>&checkout=<out>&group_adults=2&no_rooms=1&order=bayesian_review_score&nflt=review_score%3D70%3Bdistance%3D5000%3Bht_id%3D204`
   Scroll a few times, then read `[data-testid="property-card"]` → `[data-testid="title"]`, `[data-testid="review-score"]`, `[data-testid="distance"]`, slug from `a[data-testid="title-link"]` (`/hotel/de/<slug>`).
3. For every current and candidate hotel open `https://www.booking.com/hotel/de/<slug>.de.html?checkin=<in>&checkout=<out>&group_adults=2&no_rooms=1` and record: rating, availability for the dates ("nicht verfügbar" → note it; far-out dates are often simply not released yet, do not drop for that alone), lowest total price if shown.
4. Geocode new hotels with Nominatim (`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=<street, Freiburg im Breisgau>`, User-Agent required, ≥1 s between calls). Check travel time with `https://routing.openstreetmap.de/routed-foot/route/v1/foot/<lng,lat>;<venue>?overview=false`.
5. `curl -sIL -A Mozilla/5.0` each `url`; replace dead sites (search the web for the current domain).
6. Drop hotels that fell below 7.5, closed, or vanished from Booking. Add candidates until 10.
7. Write `local/content.json` (keep key order, 2-space indent, trailing newline).
8. Seed the running app when it is up: login `POST /api/auth/login` (admin, `Origin: http://localhost:8080`), then `PUT /api/content` with the file.
9. Report a table: hotel · rating · available · price · changed?. Commit `local/content.json` with a short subject.

## Playwright notes

- `browser_run_code_unsafe({code: "async (page) => {...}"})` returns the function result; keep scraping inside one call.
- Booking shows German texts; "Keine Unterkünfte gefunden" on a search page means the `ss` query did not resolve — use the property slug page instead.
