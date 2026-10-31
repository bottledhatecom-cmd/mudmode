# members login: gumroad license key + cloudflare worker (DRAFT)

Status: draft from wk2pg4 (Grok house), updated 2026-10-30. Not deployed. PR #25 is pushed (head d572ccc before this commit); later commits stay local until Michael oks a push of the named sha. Brief wording is done: members.html strings applied at d572ccc (owner wording ok, OK-LEDGER rows 1139/1141); privacy.html #member-sign-in block committed on top (row 1140). Wording oks are wording only, not push/merge/go-live. Redteam: first verdict FLAG 0H/1M/9L on ebdeb65 (hub jobs\proof-pack\verdicts\VERDICT-redteam-members-login.md); fixes landed after it and still need a redteam recheck on the current head. Claude-house G3 on d572ccc: FAIL for go-live, code passes (B1 privacy block now committed; B2 worker not deployed).
Design choice: Michael, card t6s3 ("go with license key + cloudflare worker"). Prices: Michael, t7u ("Yeh price should be 29 and 15 for founders first 200").

## How it works
1. A member pastes the license key from their Gumroad receipt into the "Member sign in" form on members.html.
2. members-login.js sends `POST {license_key}` to the worker (`/verify`). The site makes no other calls.
3. The worker calls `POST https://api.gumroad.com/v2/licenses/verify` with `product_id`, `license_key`, `increment_uses_count=false`, once for each member product.
   Source: https://gumroad.com/help/article/76-license-keys (products made on or after Jan 9, 2023 need `product_id`, not `product_permalink`; a failed verify returns 404).
4. The key is denied if it is refunded, chargebacked, disputed (and the dispute was not won), or if a subscription ended, was cancelled or failed. Gumroad's answer is allow-listed: `success` must be exactly `true`, `purchase` must be an object whose `product_id` equals the product asked about, and the refunded/chargebacked/disputed flags must be real booleans. Anything else denies.
5. On success the worker returns only `{ok, product, refunded, chargebacked, disputed, ended, token, expires}`. It never returns the email, name, sale id or the key itself. An unknown key and a key that is not in good standing get the same answer, `403 {ok:false, error:"not accepted"}`, with no product label, so /verify does not confirm which keys are real.
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
5. Rate limit (deploy blocker, redteam M1): the `[[ratelimits]]` binding `RATE_LIMITER` is on in wrangler.toml (namespace_id "20261029", 10 per 60 s). /verify counts every call per client IP (`CF-Connecting-IP`) before the body read and any gumroad call, then counts per hashed key too. N1 (redteam/overwatch): a call with a wrong or missing Origin is counted under its own `badorigin:<ip>` key and gets 403, so another site can't use up a visitor's real `verify-ip:<ip>` budget; both counters fail closed. If the binding is missing or `limit()` throws, /verify returns 503 and makes no gumroad call (fails closed). Origin is not auth: any script can send `Origin: https://mudmodecrew.com`. Limits are per Cloudflare location and approximate (Cloudflare docs).
6. Worker origin chosen (t23u b): `https://mudmode-members.bottledhate-com.workers.dev` (worker `mudmode-members` on account subdomain `bottledhate-com.workers.dev`). Set in members.html (CSP) and members-login.js.
7. Dashboard checks before go-live (G3 N-3, N-12): confirm rate-limit namespace_id "20261029" is not used by any other ratelimit binding on the account, and after deploy confirm Workers Logs (observability) shows off for `mudmode-members`. privacy.html's "logs off" sentence must not go live until that is seen in the dashboard.
8. `wrangler deploy` (own ok), run the probes, then merge the site PR (own ok). At merge: set privacy.html "Updated" to the merge date (CT); whichever of PR #25 / PR #29 lands second also carries the other's privacy.html change (#29: the line 40 installer sentence; #25: the member sign-in block).

## Hardening done after the redteam verdict (ebdeb65 -> next commit)
- M1 rate limit required + fail closed (above).
- L1 allow-list on gumroad fields (success === true, purchase object, product_id match, boolean flags).
- L2 one generic 403 for unknown and inactive keys; no product label.
- L4 `MEMBERS_SESSION_SECRET` checked up front (503 + CORS before any gumroad call) and in readToken (missing or under 32 chars -> no token accepted).
- L5 gumroad fetch timeout (AbortController, 5 s); an error on one product still tries the others, 502 only if none matched.
- L6 the body is read with a 1024-byte cap whether or not Content-Length is sent (413).
- L7 page shows "Could not reach the check" for 5xx; refunded/ended keys get the generic message (the worker no longer says which).
- L8 file paths and the PRODUCTS comment fixed.
- L9 framing: members-login.js refuses to run inside a frame and tries to break out (a meta CSP can't set frame-ancestors on GitHub Pages). `'unsafe-inline'` removed from members.html style-src (code review: no inline styles on the page; giscus-client sets styles through the CSSOM, which CSP allows). Needs a browser check before merge. The giscus-client.js same-page exposure of the sessionStorage token is unchanged (see Known lows).

## Known lows (accepted for now)
- L3 the token is stateless. It keeps working until it expires (1 hour by default) after a refund or after sign-out (sign-out only clears sessionStorage), and gumroad `uses` are never counted, so one key can be shared. Low today because MEMBERS_LINK is the public Gumroad library URL and Gumroad's own login is the real gate. Revisit (re-verify on /download, or a small revocation list) if MEMBERS_LINK ever points at real content.
- L9 giscus-client.js runs same-origin on members.html, so a compromise of that pinned file could read the token. Moving sign-in to a page without giscus would remove this.
- Timing: an inactive key can answer a little faster than an unknown one (it stops at the first matching product). Low.

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
1. done: brief wording for the members sign-in strings (owner wording ok, OK-LEDGER 1139/1141; applied at d572ccc)
2. ok: redteam pass on the worker (a PASS is not an OK). First verdict FLAG 0H/1M/9L on ebdeb65; recheck needed on the fix commit.
3. ok: add license keys to the full kit + founders gumroad products (and the 200 cap, if not done under t9u (a))
4. ok: sign up for cloudflare (free) and deploy the worker
5. ok: set worker origin / dns
6. done (wording only): privacy page member sign-in block (owner wording ok, OK-LEDGER 1140; committed on top of d572ccc). Still needs: merge date, dashboard logs-off check (step 7)
7. ok: merge the members login PR (after 1-6)
8. later: license v1.6 for the founders $15 / first 200 terms

## Files
- `worker/worker.js`, `worker/wrangler.toml`
- `members.html` (repo root; this page's CSP changed: `connect-src 'self' https://mudmode-members.bottledhate-com.workers.dev`, and `'unsafe-inline'` dropped from style-src), `members-login.js` (repo root)
- `tests/worker.test.mjs`: run with `node tests/worker.test.mjs` from `members-login/` (plain node, mocked fetch and a mocked RATE_LIMITER)
