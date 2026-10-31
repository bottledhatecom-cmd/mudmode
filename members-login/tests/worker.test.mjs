// Local test: plain node, mocked fetch + mocked RATE_LIMITER. No network, no secrets. Run: node tests/worker.test.mjs
import assert from "node:assert/strict";
import worker, { readToken, purchaseStanding } from "../worker/worker.js";

const env = {
  ALLOWED_ORIGIN: "https://mudmodecrew.com",
  PRODUCTS: JSON.stringify({ "full-kit": "PID_FULL", "founders": "PID_FOUNDERS" }),
  MEMBERS_LINK: "https://app.gumroad.com/library",
  SESSION_TTL_SECONDS: "3600",
  MEMBERS_SESSION_SECRET: "test-only-not-a-real-secret-0123456789abcdef",
  RATE_LIMITER: { limit: async () => ({ success: true }) }, // permissive for the base tests
};
// Mock of the Cloudflare rate limiting binding: fixed window counter per key.
const makeLimiter = (limit) => { const seen = new Map(); const keys = []; return { keys, limit: async ({ key }) => { keys.push(key); const c = (seen.get(key) || 0) + 1; seen.set(key, c); return { success: c <= limit }; } }; };
const EMAIL = "buyer@example.com";
const purchase = (extra = {}) => ({ email: EMAIL, full_name: "Buyer Name", sale_id: "S1", order_number: 1, license_key: "", refunded: false, disputed: false, dispute_won: false, chargebacked: false, subscription_ended_at: null, subscription_cancelled_at: null, subscription_failed_at: null, ...extra });
const KEYS = { // key -> {product_id: purchase}
  "GOOD-FULL-0001": { PID_FULL: purchase() },
  "GOOD-FOUND-0002": { PID_FOUNDERS: purchase() },
  "REFUND-KEY-0003": { PID_FULL: purchase({ refunded: true }) },
  "CHARGEBK-KEY-04": { PID_FULL: purchase({ chargebacked: true }) },
  "DISPUTE-KEY-005": { PID_FULL: purchase({ disputed: true }) },
};
const calls = [];
let override = null; // per-test gumroad behavior: (form, init) => Response | Promise
globalThis.fetch = async (url, init) => {
  assert.equal(url, "https://api.gumroad.com/v2/licenses/verify");
  const f = new URLSearchParams(init.body);
  calls.push(Object.fromEntries(f));
  assert.equal(f.get("increment_uses_count"), "false");
  assert.ok(init.signal, "gumroad fetch must carry an AbortSignal");
  if (override) return override(f, init);
  const p = (KEYS[f.get("license_key")] || {})[f.get("product_id")];
  if (!p) return new Response(JSON.stringify({ success: false, message: "That license does not exist for the provided product." }), { status: 404 });
  return new Response(JSON.stringify({ success: true, uses: 0, purchase: { ...p, license_key: f.get("license_key"), product_id: f.get("product_id") } }), { status: 200 });
};

const W = "https://worker.test";
const post = (key, origin = env.ALLOWED_ORIGIN, e = env, ip = "203.0.113.7") => worker.fetch(new Request(W + "/verify", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: JSON.stringify({ license_key: key }) }), e);
const NOT_ACCEPTED = JSON.stringify({ ok: false, error: "not accepted" });
const get = (path, token, origin = env.ALLOWED_ORIGIN) => worker.fetch(new Request(W + path, { headers: { Origin: origin, ...(token ? { Authorization: "Bearer " + token } : {}) } }), env);
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log("PASS", name); };
const noLeak = (txt) => { assert.ok(!txt.includes(EMAIL), "email leaked"); assert.ok(!txt.includes("Buyer Name")); assert.ok(!txt.includes("S1\"")); };

await t("valid full kit key -> ok + token, no email", async () => {
  const r = await post("GOOD-FULL-0001"); const txt = await r.text(); noLeak(txt); assert.ok(!txt.includes("GOOD-FULL-0001"), "key echoed");
  const d = JSON.parse(txt); assert.equal(r.status, 200); assert.equal(d.ok, true); assert.equal(d.product, "full-kit"); assert.equal(d.refunded, false);
  assert.deepEqual(Object.keys(d).sort(), ["chargebacked", "disputed", "ended", "expires", "ok", "product", "refunded", "token"]);
  const s = await get("/session", d.token); assert.equal(s.status, 200); noLeak(await s.text());
  const dl = await (await get("/download", d.token)).json(); assert.equal(dl.link, "https://app.gumroad.com/library"); assert.ok(!/\.exe/i.test(dl.link));
});
await t("valid founders key -> ok, product founders", async () => {
  const d = await (await post("GOOD-FOUND-0002")).json(); assert.equal(d.ok, true); assert.equal(d.product, "founders");
});
await t("invalid key -> generic 403, no token", async () => {
  const r = await post("NOPE-NOPE-0000"); const txt = await r.text(); assert.equal(r.status, 403); assert.equal(txt, NOT_ACCEPTED);
});
await t("bad key format -> 400, gumroad not called", async () => {
  const before = calls.length; const r = await post("<script>"); assert.equal(r.status, 400); assert.equal(calls.length, before);
});
for (const [k, field] of [["REFUND-KEY-0003", "refunded"], ["CHARGEBK-KEY-04", "chargebacked"], ["DISPUTE-KEY-005", "disputed"]]) {
  await t(`${field} key -> 403 denied, same body as an unknown key (no oracle, no product), no email`, async () => {
    const r = await post(k); const txt = await r.text(); noLeak(txt);
    assert.equal(r.status, 403); assert.equal(txt, NOT_ACCEPTED); assert.ok(!txt.includes("full-kit"));
  });
}
await t("CORS: allowed origin gets ACAO; other origin gets 403 and no ACAO", async () => {
  const ok = await post("GOOD-FULL-0001"); assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://mudmodecrew.com");
  const bad = await post("GOOD-FULL-0001", "https://evil.example"); assert.equal(bad.status, 403); assert.equal(bad.headers.get("Access-Control-Allow-Origin"), null);
  const pre = await worker.fetch(new Request(W + "/verify", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), env); assert.equal(pre.status, 403); assert.equal(pre.headers.get("Access-Control-Allow-Origin"), null);
  const pre2 = await worker.fetch(new Request(W + "/verify", { method: "OPTIONS", headers: { Origin: env.ALLOWED_ORIGIN } }), env); assert.equal(pre2.status, 204);
  const www = await post("GOOD-FULL-0001", "https://www.mudmodecrew.com"); assert.equal(www.status, 403);
});
await t("session: missing, tampered, expired tokens -> 401", async () => {
  assert.equal((await get("/session")).status, 401);
  const d = await (await post("GOOD-FULL-0001")).json();
  const [b, s] = d.token.split("."); const forged = Buffer.from(JSON.stringify({ p: "full-kit", exp: 9999999999 })).toString("base64url") + "." + s;
  assert.equal((await get("/session", forged)).status, 401);
  assert.equal((await get("/download", b + "." + s.slice(0, -2) + "AA")).status, 401);
  const old = Date.now; Date.now = () => old() + 2 * 3600 * 1000; try { assert.equal(await readToken(env, d.token), null); } finally { Date.now = old; }
});
await t("never increments uses", async () => { assert.ok(calls.length > 0 && calls.every(c => c.increment_uses_count === "false")); });

// ---- redteam verdict fixes (VERDICT-redteam-members-login.md, ebdeb65) ----
const ok200 = (f, purchaseExtra = {}, top = {}) => new Response(JSON.stringify({ success: true, uses: 0, purchase: { ...purchase(), product_id: f.get("product_id"), ...purchaseExtra }, ...top }), { status: 200 });
const withOverride = async (fn, body) => { override = fn; try { await body(); } finally { override = null; } };

await t("M1: rate limit -> 429 after 10 tries per IP, no gumroad call once limited", async () => {
  const rl = makeLimiter(10); const e = { ...env, RATE_LIMITER: rl };
  for (let i = 0; i < 10; i++) assert.equal((await post("NOPE-NOPE-" + String(1000 + i), env.ALLOWED_ORIGIN, e)).status, 403);
  const before = calls.length; const r = await post("NOPE-NOPE-2000", env.ALLOWED_ORIGIN, e);
  assert.equal(r.status, 429); assert.equal((await r.json()).ok, false); assert.equal(calls.length, before, "gumroad called after limit");
  assert.ok(rl.keys.every(k => !k.includes("NOPE")), "raw key sent to limiter");
  assert.equal((await post("NOPE-NOPE-2001", env.ALLOWED_ORIGIN, e, "198.51.100.9")).status, 403, "other IP still served");
});
await t("M1: per-key limit too (same key from many IPs -> 429)", async () => {
  const e = { ...env, RATE_LIMITER: makeLimiter(10) }; let last;
  for (let i = 0; i < 11; i++) last = await post("NOPE-SAME-KEY1", env.ALLOWED_ORIGIN, e, "192.0.2." + i);
  assert.equal(last.status, 429);
});
await t("M1: missing RATE_LIMITER binding -> 503, no gumroad call", async () => {
  const e = { ...env }; delete e.RATE_LIMITER; const before = calls.length;
  const r = await post("GOOD-FULL-0001", env.ALLOWED_ORIGIN, e); assert.equal(r.status, 503); const d = await r.json();
  assert.equal(d.ok, false); assert.equal(d.token, undefined); assert.equal(calls.length, before);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), env.ALLOWED_ORIGIN, "503 keeps CORS so the page can show it");
});
await t("M1: limiter throws -> 503, no gumroad call", async () => {
  const e = { ...env, RATE_LIMITER: { limit: async () => { throw new Error("binding down"); } } }; const before = calls.length;
  assert.equal((await post("GOOD-FULL-0001", env.ALLOWED_ORIGIN, e)).status, 503); assert.equal(calls.length, before);
});
await t("M1: script spoofing the right Origin is still counted per IP", async () => {
  const rl = makeLimiter(10); const e = { ...env, RATE_LIMITER: rl };
  for (let i = 0; i < 10; i++) await post("NOPE-NOPE-" + String(3100 + i), env.ALLOWED_ORIGIN, e); // script sending the right Origin
  const before = calls.length; const r = await post("GOOD-FULL-0001", env.ALLOWED_ORIGIN, e);
  assert.equal(r.status, 429); assert.equal(calls.length, before);
  assert.equal(rl.keys.filter(k => k === "verify-ip:203.0.113.7").length, 11);
});
await t("N1: bad-origin calls don't use up the visitor's real per-IP budget", async () => {
  const rl = makeLimiter(10); const e = { ...env, RATE_LIMITER: rl }; const before = calls.length;
  for (let i = 0; i < 50; i++) assert.equal((await post("NOPE-NOPE-" + String(4000 + i), "https://evil.example", e)).status, i < 10 ? 403 : 429);
  assert.equal(calls.length, before, "gumroad called for a bad origin");
  const r = await post("GOOD-FULL-0001", env.ALLOWED_ORIGIN, e); assert.equal(r.status, 200, "real visitor locked out by another site");
  assert.equal((await r.json()).ok, true);
  assert.equal(rl.keys.filter(k => k === "badorigin:203.0.113.7").length, 50);
  assert.equal(rl.keys.filter(k => k === "verify-ip:203.0.113.7").length, 1);
});
await t("N1: bad-origin calls are still rate limited (429 after 10), no gumroad call, no ACAO", async () => {
  const rl = makeLimiter(10); const e = { ...env, RATE_LIMITER: rl }; const before = calls.length;
  for (let i = 0; i < 10; i++) assert.equal((await post("NOPE-NOPE-" + String(5000 + i), "https://evil.example", e)).status, 403);
  const r = await post("NOPE-NOPE-5100", "https://evil.example", e);
  assert.equal(r.status, 429); assert.equal(r.headers.get("Access-Control-Allow-Origin"), null); assert.equal(calls.length, before);
});
await t("N1: missing Origin header counts as a bad origin", async () => {
  const rl = makeLimiter(10); const e = { ...env, RATE_LIMITER: rl };
  const r = await worker.fetch(new Request(W + "/verify", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7" }, body: JSON.stringify({ license_key: "GOOD-FULL-0001" }) }), e);
  assert.equal(r.status, 403); assert.deepEqual(rl.keys, ["badorigin:203.0.113.7"]);
});
await t("N1: bad-origin path still fails closed (missing binding or limiter error -> 503)", async () => {
  const before = calls.length;
  const e1 = { ...env }; delete e1.RATE_LIMITER;
  assert.equal((await post("GOOD-FULL-0001", "https://evil.example", e1)).status, 503);
  const e2 = { ...env, RATE_LIMITER: { limit: async () => { throw new Error("binding down"); } } };
  assert.equal((await post("GOOD-FULL-0001", "https://evil.example", e2)).status, 503);
  assert.equal(calls.length, before);
});
await t("L1: success !== true is rejected (string \"false\", 1, missing)", async () => {
  for (const top of [{ success: "false" }, { success: 1 }, { success: undefined }]) {
    await withOverride((f) => ok200(f, {}, top), async () => { const r = await post("GOOD-FULL-0001"); assert.equal(r.status, 403); assert.equal((await r.json()).token, undefined); });
  }
});
await t("L1: purchase.product_id mismatch is rejected", async () => {
  await withOverride((f) => ok200(f, { product_id: "SOME_OTHER_PRODUCT" }), async () => {
    const r = await post("GOOD-FULL-0001"); assert.equal(r.status, 403); assert.equal((await r.json()).token, undefined);
  });
});
await t("L1: missing purchase object or non-boolean flags are rejected", async () => {
  await withOverride(() => new Response(JSON.stringify({ success: true }), { status: 200 }), async () => assert.equal((await post("GOOD-FULL-0001")).status, 403));
  await withOverride((f) => new Response(JSON.stringify({ success: true, purchase: { product_id: f.get("product_id") } }), { status: 200 }), async () => assert.equal((await post("GOOD-FULL-0001")).status, 403));
  await withOverride((f) => ok200(f, { refunded: "false" }), async () => assert.equal((await post("GOOD-FULL-0001")).status, 403));
  assert.equal(purchaseStanding({}).good, false); assert.equal(purchaseStanding(null).good, false);
  assert.equal(purchaseStanding(purchase({ disputed: true, dispute_won: true })).good, true);
});
await t("L6: oversized chunked body with no Content-Length -> 413, no gumroad call", async () => {
  const chunk = new TextEncoder().encode("x".repeat(512)); let sent = 0;
  const stream = new ReadableStream({ pull(c) { if (sent++ < 10000) c.enqueue(chunk); else c.close(); } }); // up to ~5 MB
  const req = new Request(W + "/verify", { method: "POST", headers: { Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json" }, body: stream, duplex: "half" });
  assert.equal(req.headers.get("Content-Length"), null);
  const before = calls.length; const r = await worker.fetch(req, env);
  assert.equal(r.status, 413); assert.equal(calls.length, before); assert.ok(sent < 10, "read the whole stream instead of stopping at the cap");
  const big = await worker.fetch(new Request(W + "/verify", { method: "POST", headers: { Origin: env.ALLOWED_ORIGIN, "Content-Length": "5000" }, body: "x".repeat(5000) }), env);
  assert.equal(big.status, 413);
});
await t("L5: gumroad hang -> aborted by timeout -> 502 quickly", async () => {
  const e = { ...env, GUMROAD_TIMEOUT_MS: "50" }; let aborted = 0;
  await withOverride((f, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => { aborted++; rej(init.signal.reason || new Error("aborted")); })), async () => {
    const t0 = Date.now(); const r = await post("GOOD-FULL-0001", env.ALLOWED_ORIGIN, e);
    assert.equal(r.status, 502); assert.ok(Date.now() - t0 < 1000, "took too long"); assert.equal(aborted, 2);
  });
});
await t("L5: 5xx on the first product still lets a founders key through", async () => {
  await withOverride((f) => f.get("product_id") === "PID_FULL" ? new Response("oops", { status: 500 }) : ok200(f), async () => {
    const r = await post("GOOD-FOUND-0002"); const d = await r.json(); assert.equal(r.status, 200); assert.equal(d.product, "founders");
  });
});
await t("L4: missing or short MEMBERS_SESSION_SECRET -> 503 before gumroad; readToken rejects short secret", async () => {
  const good = await (await post("GOOD-FULL-0001")).json();
  for (const sec of [undefined, "short-secret"]) {
    const e = { ...env, MEMBERS_SESSION_SECRET: sec }; const before = calls.length;
    const r = await post("GOOD-FULL-0001", env.ALLOWED_ORIGIN, e); assert.equal(r.status, 503); assert.equal(calls.length, before);
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), env.ALLOWED_ORIGIN);
    assert.equal((await get("/session", good.token, env.ALLOWED_ORIGIN)).status, 200);
    assert.equal(await readToken(e, good.token), null);
  }
  // a token signed with a 5-char secret must not verify when the env secret is that short
  const weak = { ...env, MEMBERS_SESSION_SECRET: "abcde" };
  const body = Buffer.from(JSON.stringify({ p: "full-kit", exp: 9999999999 })).toString("base64url");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("abcde"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("base64url");
  assert.equal(await readToken(weak, body + "." + sig), null);
});
console.log(`\n${n} tests passed`);
