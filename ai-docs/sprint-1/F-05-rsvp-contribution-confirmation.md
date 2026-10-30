# F-05 RSVP contribution confirmation

## Problem
In `web/src/views/rsvp/RSVPView.vue` a contribution is auto-submitted right after the RSVP when the toggle is on. Guests get no chance to review, and a failed second request leaves a confusing half-state.

## GOOD
- Guest submits RSVP, then — only if they ticked "Beitrag" — sees a separate confirmation showing exactly what will be sent, with "Absenden" / "Zurück".
- RSVP success and contribution success are reported separately; a contribution failure never hides the RSVP success.
- Resubmitting the RSVP does not duplicate contributions.

## DONE
- [ ] Two-step flow implemented; no automatic second request.
- [ ] Error of `POST /rsvp/{token}/contributions` shown inline with a retry button.
- [ ] Verified in browser with a real token: yes with contribution, yes without, no attendance.
- [ ] `progress.md` updated.
