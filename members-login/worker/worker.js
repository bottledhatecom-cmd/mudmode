// mudmode members worker (DRAFT, not deployed). wk2pg4, 2026-10-29.
// Verifies a Gumroad license key server-side, issues a short-lived HMAC session token,
// and hands out the gated members link only to a valid token.
// Gumroad verify API: https://gumroad.com/help/article/76-license-keys
//   POST https://api.gumroad.com/v2/licenses/verify  product_id, license_key, increment_uses_count=false
// Secrets (names only, set with `wrangler secret put`): MEMBERS_SESSION_SECRET
// Vars (wrangler.toml): ALLOWED_ORIGIN, PRODUCTS (JSON label->product_id), MEMBERS_LINK, SESSION_TTL_SECONDS
// Optional binding: RATE_LIMITER (Cloudflare rate limiting binding).

const GUMROAD_VERIFY = "https://api.gumroad.com/v2/licenses/verify";
const KEY_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_BODY = 1024;

function cors(env, origin) {
  const h = { "Vary": "Origin", "Cache-Control": "no-store", "Content-Type": "application/json" };
  if (origin && origin === env.ALLOWED_ORIGIN) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    h["Access-Control-Max-Age"] = "600";
  }
  return h;
}
const json = (env, origin, status, obj) => new Response(JSON.stringify(obj), { status, headers: cors(env, origin) });

const enc = new TextEncoder();
function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signToken(env, payload) {
  if (!env.MEMBERS_SESSION_SECRET || env.MEMBERS_SESSION_SECRET.length < 32) throw new Error("session secret missing");
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env.MEMBERS_SESSION_SECRET), enc.encode(body));
  return body + "." + b64url(sig);
}
export async function readToken(env, token) {
  if (!token || typeof token !== "string" || token.length > 512) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", await hmacKey(env.MEMBERS_SESSION_SECRET), unb64url(sig), enc.encode(body)); } catch { return null; }
  if (!ok) return null;
  let p; try { p = JSON.parse(new TextDecoder().decode(unb64url(body))); } catch { return null; }
  if (!p || typeof p.exp !== "number" || p.exp < Math.floor(Date.now() / 1000)) return null;
  return p;
}

// Deny anything refunded, chargebacked, disputed (unless won), or an ended/cancelled/failed subscription.
export function purchaseStanding(purchase) {
  const refunded = !!purchase.refunded;
  const chargebacked = !!purchase.chargebacked;
  const disputed = !!purchase.disputed && !purchase.dispute_won;
  const ended = !!(purchase.subscription_ended_at || purchase.subscription_cancelled_at || purchase.subscription_failed_at);
  return { refunded, chargebacked, disputed, ended, good: !(refunded || chargebacked || disputed || ended) };
}

async function verifyWithGumroad(productId, key) {
  const form = new URLSearchParams({ product_id: productId, license_key: key, increment_uses_count: "false" });
  const r = await fetch(GUMROAD_VERIFY, { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (r.status === 404) return null;              // not a key for this product
  if (!r.ok) throw new Error("gumroad " + r.status);
  const d = await r.json();
  return d && d.success && d.purchase ? d.purchase : null;
}

async function handleVerify(req, env, origin) {
  if (origin !== env.ALLOWED_ORIGIN) return json(env, origin, 403, { ok: false, error: "origin" });
  if (env.RATE_LIMITER) {
    const ip = req.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: "verify:" + ip });
    if (!success) return json(env, origin, 429, { ok: false, error: "slow down" });
  } // TODO(redteam): confirm the rate-limit binding is configured before go-live.
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > MAX_BODY) return json(env, origin, 413, { ok: false, error: "too big" });
  let body; try { body = JSON.parse((await req.text()).slice(0, MAX_BODY)); } catch { return json(env, origin, 400, { ok: false, error: "bad request" }); }
  const key = body && typeof body.license_key === "string" ? body.license_key.trim() : "";
  if (!KEY_RE.test(key)) return json(env, origin, 400, { ok: false, error: "bad key format" });

  let products; try { products = JSON.parse(env.PRODUCTS || "{}"); } catch { products = {}; }
  for (const [label, productId] of Object.entries(products)) {
    let purchase;
    try { purchase = await verifyWithGumroad(productId, key); } catch { return json(env, origin, 502, { ok: false, error: "check failed, try again" }); }
    if (!purchase) continue;
    const s = purchaseStanding(purchase);
    // Only these fields ever leave the worker. No email, name, sale id, order number or key echo.
    const out = { ok: s.good, product: label, refunded: s.refunded, chargebacked: s.chargebacked, disputed: s.disputed, ended: s.ended };
    if (!s.good) return json(env, origin, 403, out);
    const ttl = Number(env.SESSION_TTL_SECONDS || 3600);
    const exp = Math.floor(Date.now() / 1000) + ttl;
    out.token = await signToken(env, { p: label, exp });
    out.expires = exp;
    return json(env, origin, 200, out);
  }
  return json(env, origin, 404, { ok: false, error: "key not found" });
}

async function handleSession(req, env, origin, wantLink) {
  if (origin !== env.ALLOWED_ORIGIN) return json(env, origin, 403, { ok: false, error: "origin" });
  const auth = req.headers.get("Authorization") || "";
  const p = await readToken(env, auth.startsWith("Bearer ") ? auth.slice(7) : "");
  if (!p) return json(env, origin, 401, { ok: false });
  const out = { ok: true, product: p.p, expires: p.exp };
  if (wantLink) out.link = env.MEMBERS_LINK; // Gumroad library link; never a public exe URL.
  return json(env, origin, 200, out);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: origin === env.ALLOWED_ORIGIN ? 204 : 403, headers: cors(env, origin) });
    if (req.method === "POST" && url.pathname === "/verify") return handleVerify(req, env, origin);
    if (req.method === "GET" && url.pathname === "/session") return handleSession(req, env, origin, false);
    if (req.method === "GET" && url.pathname === "/download") return handleSession(req, env, origin, true);
    return json(env, origin, 404, { ok: false });
  }
};
