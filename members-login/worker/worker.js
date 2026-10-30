// mudmode members worker (DRAFT, not deployed). wk2pg4, 2026-10-29.
// Verifies a Gumroad license key server-side, issues a short-lived HMAC session token,
// and hands out the gated members link only to a valid token.
// Gumroad verify API: https://gumroad.com/help/article/76-license-keys
//   POST https://api.gumroad.com/v2/licenses/verify  product_id, license_key, increment_uses_count=false
// Secrets (names only, set with `wrangler secret put`): MEMBERS_SESSION_SECRET
// Vars (wrangler.toml): ALLOWED_ORIGIN, PRODUCTS (JSON label->product_id), MEMBERS_LINK, SESSION_TTL_SECONDS
// Required binding: RATE_LIMITER (Cloudflare Workers rate limiting binding). Without it /verify fails closed (503).
// Hardening per redteam verdict VERDICT-redteam-members-login.md (FLAG 0H/1M/9L, head ebdeb65).

const GUMROAD_VERIFY = "https://api.gumroad.com/v2/licenses/verify";
const KEY_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_BODY = 1024;
const MIN_SECRET = 32;
const GUMROAD_TIMEOUT_MS = 5000;

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
// One generic answer for "unknown key" and "key not in good standing" (redteam L2: no validity oracle, no product label).
const NOT_ACCEPTED = { ok: false, error: "not accepted" };

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
// redteam L4: one length check, used by sign, read and the up-front config check.
export function secretOk(env) {
  return typeof env.MEMBERS_SESSION_SECRET === "string" && env.MEMBERS_SESSION_SECRET.length >= MIN_SECRET;
}
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signToken(env, payload) {
  if (!secretOk(env)) throw new Error("session secret missing");
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env.MEMBERS_SESSION_SECRET), enc.encode(body));
  return body + "." + b64url(sig);
}
export async function readToken(env, token) {
  if (!secretOk(env)) return null; // fail closed: never verify against a missing or short secret
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
// redteam L1: allow-list. The deny flags must be real booleans; anything else is not good.
export function purchaseStanding(purchase) {
  const isBool = (v) => typeof v === "boolean";
  const shapeOk = !!purchase && typeof purchase === "object" && !Array.isArray(purchase)
    && isBool(purchase.refunded) && isBool(purchase.chargebacked) && isBool(purchase.disputed)
    && (purchase.dispute_won === undefined || isBool(purchase.dispute_won));
  const refunded = !shapeOk || purchase.refunded === true;
  const chargebacked = !shapeOk || purchase.chargebacked === true;
  const disputed = !shapeOk || (purchase.disputed === true && purchase.dispute_won !== true);
  const ended = !shapeOk || !!(purchase.subscription_ended_at || purchase.subscription_cancelled_at || purchase.subscription_failed_at);
  return { refunded, chargebacked, disputed, ended, good: shapeOk && !(refunded || chargebacked || disputed || ended) };
}

function timeoutMs(env) {
  const n = Number(env.GUMROAD_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 && n <= GUMROAD_TIMEOUT_MS ? n : GUMROAD_TIMEOUT_MS;
}

// Returns the purchase object, null (no match / odd answer), or throws (upstream error or timeout).
async function verifyWithGumroad(env, productId, key) {
  const form = new URLSearchParams({ product_id: productId, license_key: key, increment_uses_count: "false" });
  const ac = new AbortController(); // redteam L5: never hang on gumroad
  const timer = setTimeout(() => ac.abort(new Error("gumroad timeout")), timeoutMs(env));
  try {
    const r = await fetch(GUMROAD_VERIFY, { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ac.signal });
    if (r.status === 404) return null;              // not a key for this product
    if (!r.ok) throw new Error("gumroad " + r.status);
    const d = await r.json();
    // redteam L1: success must be exactly true, purchase must be an object for THIS product.
    if (!d || d.success !== true) return null;
    const p = d.purchase;
    if (!p || typeof p !== "object" || Array.isArray(p)) return null;
    if (p.product_id !== productId) return null;
    return p;
  } finally { clearTimeout(timer); }
}

// redteam L6: read at most MAX_BODY bytes from the stream, with or without Content-Length.
async function readCapped(req) {
  const len = req.headers.get("Content-Length");
  if (len !== null && !(Number(len) <= MAX_BODY)) return { tooBig: true };
  if (!req.body) return { text: "" };
  const reader = req.body.getReader();
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) { try { await reader.cancel(); } catch {} return { tooBig: true }; }
    chunks.push(value);
  }
  const all = new Uint8Array(total); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return { text: new TextDecoder().decode(all) };
}

async function sha256hex(s) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return Array.from(d, b => b.toString(16).padStart(2, "0")).join("");
}

// redteam M1: rate limit is required, not optional. Fails closed: missing binding or a limiter error -> 503.
// Returns null when allowed, or a Response to send back.
async function rateLimit(env, origin, key) {
  if (!env.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== "function") return json(env, origin, 503, { ok: false, error: "unavailable" });
  let res;
  try { res = await env.RATE_LIMITER.limit({ key }); } catch { return json(env, origin, 503, { ok: false, error: "unavailable" }); }
  if (!res || res.success !== true) return json(env, origin, 429, { ok: false, error: "slow down" });
  return null;
}

async function handleVerify(req, env, origin) {
  // Count every /verify call per client IP first, before the origin check (Origin can be spoofed by any script)
  // and before reading the body or calling gumroad.
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const ipLimited = await rateLimit(env, origin, "verify-ip:" + ip);
  if (ipLimited) return ipLimited;
  if (origin !== env.ALLOWED_ORIGIN) return json(env, origin, 403, { ok: false, error: "origin" });
  const { tooBig, text } = await readCapped(req);
  if (tooBig) return json(env, origin, 413, { ok: false, error: "too big" });
  let body; try { body = JSON.parse(text); } catch { return json(env, origin, 400, { ok: false, error: "bad request" }); }
  const key = body && typeof body.license_key === "string" ? body.license_key.trim() : "";
  if (!KEY_RE.test(key)) return json(env, origin, 400, { ok: false, error: "bad key format" });
  // Per-key limit too (same binding, separate counter), so one key can't be hammered from many IPs. Key is hashed.
  const keyLimited = await rateLimit(env, origin, "verify-key:" + (await sha256hex(key)));
  if (keyLimited) return keyLimited;

  let products; try { products = JSON.parse(env.PRODUCTS || "{}"); } catch { products = {}; }
  let upstreamError = false;
  for (const [label, productId] of Object.entries(products)) {
    let purchase;
    // redteam L5: an error on one product doesn't block the others; 502 only if no product matched.
    try { purchase = await verifyWithGumroad(env, productId, key); } catch { upstreamError = true; continue; }
    if (!purchase) continue;
    const s = purchaseStanding(purchase);
    if (!s.good) return json(env, origin, 403, NOT_ACCEPTED);
    const ttl = Number(env.SESSION_TTL_SECONDS || 3600);
    const exp = Math.floor(Date.now() / 1000) + ttl;
    // Only these fields ever leave the worker. No email, name, sale id, order number or key echo.
    const out = { ok: true, product: label, refunded: false, chargebacked: false, disputed: false, ended: false };
    out.token = await signToken(env, { p: label, exp });
    out.expires = exp;
    return json(env, origin, 200, out);
  }
  if (upstreamError) return json(env, origin, 502, { ok: false, error: "check failed, try again" });
  return json(env, origin, 403, NOT_ACCEPTED);
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
    const route = (req.method === "POST" && url.pathname === "/verify") ? "verify"
      : (req.method === "GET" && url.pathname === "/session") ? "session"
      : (req.method === "GET" && url.pathname === "/download") ? "download" : null;
    if (!route) return json(env, origin, 404, { ok: false });
    // redteam L4: config check up front (503 + CORS), before any gumroad call.
    if (!secretOk(env)) return json(env, origin, 503, { ok: false, error: "unavailable" });
    if (route === "verify") return handleVerify(req, env, origin);
    return handleSession(req, env, origin, route === "download");
  }
};
