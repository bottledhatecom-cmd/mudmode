# Scrub checklist (run before this kit is shared)

Last run: 2026-10-21 3:29 PM CDT, on draft 0.1. Result: **0 automatic hits; human read found no personal names or private facts.** A public release still needs the owner's final read and OK.

| # | Check | How | Result |
|---|---|---|---|
| 1 | No personal names (owner, family, friends, testers, crew nicknames) | private deny list + list of capitalized words read by a human | pass (all capitalized words are generic) |
| 2 | No emails, phone numbers, home address | regex (email, phone) + human read | pass |
| 3 | No family money matters, prices tied to the owner's accounts, business entities | regex ($ amounts) + deny list + human read | pass |
| 4 | No secrets or secret names/locations | regex (a key, token or password followed by a value) + human read | pass |
| 5 | No machine paths, usernames, device serials, machine or bot ids | regex (Windows/home paths, uuids, long hex ids, IPs) + deny list | pass |
| 6 | No repo names, app names, store package ids, cloud project ids | deny list + regex (package ids) | pass |
| 7 | No verbatim owner quotes | human read (rules rewritten in neutral words) | pass |
| 8 | Only original text, no copied product docs or third-party files | written fresh from the private rule book's ideas | pass |
| 9 | Examples are fictional (dates, "Recipe Box", "AI-1") | human read | pass |
| 10 | Links reviewed | scanner lists every URL for review | none in kit |

The scanner and its deny list live outside the kit (the deny list itself is private and never ships).
