# members login: gumroad license key + cloudflare worker (DRAFT)

Status: draft from wk2pg4 (Grok house), 2026-10-29. Not deployed. Brief wording review and redteam review are still pending.
Design choice: Michael, card t6s3 ("go with license key + cloudflare worker"). Prices: Michael, t7u ("Yeh price should be 29 and 15 for founders first 200").

## How it works
1. A member pastes the license key from their Gumroad receipt into the "Member sign in" form on members.html.
2. members-login.js sends `POST {license_key}` to the worker (`/verify`). The site makes no other calls.
3. The worker calls `POST https://api.gumroad.com/v2/licenses/verify` with `product_id`, `license_key`, `increment_uses_count=false`, once for each member product.
   Source: https://gumroad.com/help/article/76-license-keys (products made on or after Jan 9, 2023 need `product_id`, not `product_permalink`; a failed verify returns 404).
4. The key is denied if it is refunded, chargebacked, disputed (and the dispute was not won), or if a subscription ended, was cancelled or failed.
5. On success the worker returns only `{ok, product, refunded, chargebacked, disputed, ended, token, expires}`. It never returns the email, name, sale id or the key itself.
6. The token is HMAC-SHA256 signed with `MEMBERS_SESSION_SECRET`, and it lasts 1 hour by default. The page keeps it in sessionStorage, which is cleared when the tab closes. There are no cookies.
7. `GET /session` checks a token. `GET /download` returns the members link, which is the Gumroad library (https://app.gumroad.com/library). The worker never returns a public exe URL.
8. **The reveal on the page is cosmetic.** Anyone can unhide the div. The real gate is the worker plus Gumroad's own library login. Nothing secret is in the page HTML.

Members are buyers of both of these products:
- Full Kit, $29 (worker label `full-kit`)
- the founders edition, $15, first 200 buyers (worker label `founders`)

## Setup Michael would do (each step needs its own OK)
1. Gumroad: add a **License key** block to the content page of both products (Full Kit and founders). Copy each `product_id` from that block into `PRODUCTS` in wrangler.toml. Past buyers get keys too.
2. Gumroad: set the founders product price to $15 and **limit it to 200 sales** (max purchase count = 200). The cap lives on Gumroad, not in the worker. Then re-publish it; it is unpublished today (ijfhue). Note the license still says "Founding 100 ($19, first 100)".
3. Cloudflare: free account signup, then `npx wrangler login`.
4. Secret, by name only: `wrangler secret put MEMBERS_SESSION_SECRET`, with 32+ random characters → [SECRET OMITTED]. No other secrets are needed, because the verify API needs no OAuth.
5. Rate limit: add the `[[ratelimits]]` binding `RATE_LIMITER` (about 10 per minute per IP, commented in wrangler.toml), or a WAF rate-limit rule. Without it the worker runs unlimited (TODO).
6. Pick the worker origin (for example `members-api.mudmodecrew.com`, which needs a DNS decision, or `*.workers.dev`). Replace `https://WORKER-ORIGIN-TBD` in members.html (CSP) and members-login.js.
7. `wrangler deploy`, then merge the site PR.

## Redteam scope (hand to the redteam bot with a scope card)
- In scope: the worker endpoints /verify, /session and /download, plus members.html and members-login.js on a preview.
- Test these:
  - CORS bypass (null origin, www., http:)
  - token forgery or expiry
  - key brute force and rate limits
  - leaks of email, name or sale id in any response or error
  - refunded, disputed or chargebacked keys still passing
  - the cosmetic reveal exposing anything real
  - CSP regressions
  - oversized or bad JSON
  - the Gumroad 5xx path
- Out of scope: Gumroad's systems, real buyer keys (use test keys only), DoS on the free tier.

## Privacy page (privacy.html) lines to change (Brief writes the words)
- L30 "We collect nothing ourselves": now license keys pass through our worker, which is run by Cloudflare. Say that it is not stored, and that Cloudflare gets the IP and request data.
- L41 (what we get from Gumroad): add that the key check calls Gumroad's verify API.
- New line: sign-in keeps a short-lived token in sessionStorage. It is not a cookie and it is cleared when the tab closes.
- The members.html footer says "No analytics, no trackers, no cookies on this page". That is still true, but add the worker/Cloudflare mention.

## Hub files still saying $19 / Founding 100 (list only; Keeper and owners edit, per OK t9u (b))
- MANUAL-ASKS.md:6: the ask is already there ("founders $19 for first 100 -> $15 for first 200; regular $29")
- NOTE-FROM-CLAUDE.md:314, 624, 919, 949-958 (Claude house; fix by NOTE-FROM-GROK, not by direct edit)
- HANDOFF-MUDMODE-CHAT.md:79, 465
- WHAT-CHANGED-FOR-GROK-20261025.md:14, 172, 186-187, 326
- jobs\product-fixes-1-3\license-v1.5\full-kit-license-v1.5.html:55, 58, 70
- jobs\product-fixes-1-3\GUMROAD-PASTE.md:40, 48-49
- jobs\product-fixes-1-3\UPDATE-DELIVERY.md:8, 133
- jobs\product-fixes-1-3\SITE-BRANCH-DIFF.md:73, 131-133, 165-171
- jobs\product-fixes-1-3\EARLIER-BUYER-NOTE.md:5, 15
- jobs\product-fixes-1-3\WORDING-PASS.md:9, 49, 54, 125
- jobs\proof-pack\F-LEGAL-LIVE-1023.md:41, 97, 147
- jobs\proof-pack\F-MEMBERS-REDO-1023.md:46, 48
- jobs\proof-pack\verdicts\*.md: these are history; leave them
- jobs\product-fixes-1-3\live-copies-*: these are snapshots; leave them

The search was partial: it was interrupted partway through jobs\. Re-run it before editing.

Live repo (not hub, needs a site PR and the Brief + license OK):
- index.html:171-176 (Founding 100 $19 card)
- full-kit-license.html:24, 29, 33, 56, 59, 71 (license terms; this is a legal change)
- filler-art.css:12 (comment)

## Ordered named OKs still needed
1. ok: brief wording for the members sign-in strings (the `<!-- brief-review -->` lines)
2. ok: redteam pass on the worker (a PASS is not an OK)
3. ok: add license keys to the full kit + founders gumroad products (and the 200 cap, if not done under t9u (a))
4. ok: sign up for cloudflare (free) and deploy the worker
5. ok: set worker origin / dns
6. ok: privacy page wording change (Brief)
7. ok: merge the members login PR (after 1-6)
8. later: license v1.6 for the founders $15 / first 200 terms

## Files
- `worker/worker.js`, `worker/wrangler.toml`
- `site/members.html` (only this page's CSP changed: `connect-src 'self' https://WORKER-ORIGIN-TBD`), `site/members-login.js`
- `tests/worker.test.mjs`: run with `node tests/worker.test.mjs` (plain node, mocked fetch)
