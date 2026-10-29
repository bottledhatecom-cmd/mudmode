// Local test: plain node, mocked fetch. No network, no secrets. Run: node tests/worker.test.mjs
import assert from "node:assert/strict";
import worker, { readToken } from "../worker/worker.js";

const env = {
  ALLOWED_ORIGIN: "https://mudmodecrew.com",
  PRODUCTS: JSON.stringify({ "full-kit": "PID_FULL", "founders": "PID_FOUNDERS" }),
  MEMBERS_LINK: "https://app.gumroad.com/library",
  SESSION_TTL_SECONDS: "3600",
  MEMBERS_SESSION_SECRET: "test-only-not-a-real-secret-0123456789abcdef",
};
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
globalThis.fetch = async (url, init) => {
  assert.equal(url, "https://api.gumroad.com/v2/licenses/verify");
  const f = new URLSearchParams(init.body);
  calls.push(Object.fromEntries(f));
  assert.equal(f.get("increment_uses_count"), "false");
  const p = (KEYS[f.get("license_key")] || {})[f.get("product_id")];
  if (!p) return new Response(JSON.stringify({ success: false, message: "That license does not exist for the provided product." }), { status: 404 });
  return new Response(JSON.stringify({ success: true, uses: 0, purchase: { ...p, license_key: f.get("license_key"), product_id: f.get("product_id") } }), { status: 200 });
};

const W = "https://worker.test";
const post = (key, origin = env.ALLOWED_ORIGIN) => worker.fetch(new Request(W + "/verify", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ license_key: key }) }), env);
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
await t("invalid key -> 404, no token", async () => {
  const r = await post("NOPE-NOPE-0000"); const d = await r.json(); assert.equal(r.status, 404); assert.equal(d.ok, false); assert.equal(d.token, undefined);
});
await t("bad key format -> 400, gumroad not called", async () => {
  const before = calls.length; const r = await post("<script>"); assert.equal(r.status, 400); assert.equal(calls.length, before);
});
for (const [k, field] of [["REFUND-KEY-0003", "refunded"], ["CHARGEBK-KEY-04", "chargebacked"], ["DISPUTE-KEY-005", "disputed"]]) {
  await t(`${field} key -> 403 denied, flag set, no token, no email`, async () => {
    const r = await post(k); const txt = await r.text(); noLeak(txt); const d = JSON.parse(txt);
    assert.equal(r.status, 403); assert.equal(d.ok, false); assert.equal(d[field], true); assert.equal(d.token, undefined);
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
console.log(`\n${n} tests passed`);
