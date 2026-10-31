---
description: "Check Booking.com for the recommended hotels and refresh local/content.json"
agent: build
---

Load the `accommodation-research` skill and run the full procedure for the hotels in `local/content.json`.

If `$ARGUMENTS` contains "dry-run", only report the table without writing files.
If `$ARGUMENTS` contains "quick", only re-check the existing hotels (ratings, availability, dead links); do not search for new candidates.
