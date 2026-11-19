/**
 * tylerbot-phone ph1 checks (phones 375x812 and 414x896, desktop 1280x800), headless Chrome.
 *   npm install --prefix /tmp/tbdeps puppeteer-core
 *   python3 -m http.server 8301 --bind 127.0.0.1   (from the repo root, in another shell)
 *   SHOTS=/tmp/tbph-shots node tests/tylerbot-phone.mjs
 * Compares content cover with rg2 (tylerbot-phone.* blocked), forces highlights with window.__tbPhone.now(),
 * opens a fold, turns bubbles on in the test page only, runs reduced motion, and checks the add-on is inert at 1280.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("/tmp/tbdeps/node_modules/puppeteer-core/package.json");
const puppeteer = require("puppeteer-core");
const OUT = process.env.SHOTS || "/tmp/tbph-shots"; fs.mkdirSync(OUT, { recursive: true });
const URL = "http://127.0.0.1:8301/index.html";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome-stable", args: ["--no-sandbox"] });
const res = { pass: 0, fail: 0, lines: [] };
const ok = (c, m) => { res[c ? "pass" : "fail"]++; res.lines.push((c ? "PASS " : "FAIL ") + m); };
// independent cover check: robot rect vs visible text line boxes and controls
const coverFn = () => {
  const p = document.querySelector("canvas.tb-rig-peek"); if (!p) return null;
  const R = p.getBoundingClientRect(), hit = (a) => Math.min(a.right, R.right) - Math.max(a.left, R.left) > 2 && Math.min(a.bottom, R.bottom, innerHeight) - Math.max(a.top, R.top) > 2;
  if (p.classList.contains("tb-peek-off")) return { off: true, covers: false };
  const tw = document.createTreeWalker(document.body, 4), rg = document.createRange(); let n, hits = [];
  while ((n = tw.nextNode())) { if (!/\S/.test(n.nodeValue)) continue; const pe = n.parentElement; if (!pe || pe.closest("template,script,style,noscript")) continue; const cs = getComputedStyle(pe); if (cs.visibility === "hidden" || cs.display === "none") continue; rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width > 0 && r.bottom > 0 && r.top < innerHeight && hit(r)) { hits.push(n.nodeValue.trim().slice(0, 30)); break; } }
  for (const e of document.querySelectorAll("a,button,summary,input,img,svg,.btn")) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && hit(r) && !e.closest("[aria-hidden=true].tb-flare") && getComputedStyle(e).visibility !== "hidden" && (() => { const t = document.elementFromPoint((Math.max(r.left, R.left) + Math.min(r.right, R.right)) / 2, (Math.max(r.top, R.top) + Math.min(r.bottom, R.bottom, innerHeight)) / 2); return t && (t === e || e.contains(t)); })()) hits.push("<" + e.tagName.toLowerCase() + ">"); }
  return { covers: hits.length > 0, hits: hits.slice(0, 4), rect: [R.left, R.top, R.width, R.height].map(Math.round), tr: p.style.translate || "" };
};
async function phone(w, h, phoneOn) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (!phoneOn) { await p.setRequestInterception(true); p.on("request", r => /tylerbot-phone\./.test(r.url()) ? r.abort() : r.continue()); }
  const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(URL, { waitUntil: "networkidle0" });
  await p.waitForSelector("canvas.tb-rig-peek", { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  let covered = 0, total = 0, offs = 0; const detail = [];
  for (let y = 0; y < H - h; y += 150) {
    await p.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), y); await sleep(phoneOn ? 820 : 300);
    const c = await p.evaluate(coverFn); if (!c) continue; total++; if (c.off) offs++; if (c.covers) { covered++; detail.push(y + ":" + c.hits.join("|") + " " + c.tr); }
  }
  return { p, errs, covered, total, offs, detail, H };
}
for (const [w, h] of [[375, 812], [414, 896]]) {
  const base = await phone(w, h, false); await base.p.close();
  const r = await phone(w, h, true); const p = r.p;
  res.lines.push(`INFO ${w}x${h} stops covering content: rg2 ${base.covered}/${base.total}, ph1 ${r.covered}/${r.total} (faded over setup question: ${r.offs})`);
  if (r.detail.length) res.lines.push("INFO   ph1 still covering at " + r.detail.join(" ; "));
  ok(r.covered < base.covered || base.covered === 0, `${w} covers less content than rg2`);
  ok(r.errs.length === 0, `${w} no page errors ${r.errs.join(" ").slice(0, 200)}`);
  // spot screenshots
  for (const y of [0, 900, 1600, 2400]) { await p.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), y); await sleep(900); await p.screenshot({ path: `${OUT}/ph1-${w}-rest-y${y}.png` }); }
  // highlights at a few spots
  let hl = 0, inside = 0, notUnder = 0;
  for (const y of [0, 400, 1200, 2000, 2800]) {
    await p.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), y); await sleep(1500);
    const got = await p.evaluate(() => window.__tbPhone.now());
    if (!got) { res.lines.push(`INFO ${w} y${y}: no eligible target`); continue; }
    hl++; await sleep(450);
    const chk = await p.evaluate(() => { const rg = document.querySelector(".tb-ph-ring.tb-ph-on"), pk = document.querySelector("canvas.tb-rig-peek"); if (!rg) return { noRing: document.querySelector('.tb-ph-ring')?.className, sy: scrollY }; const a = rg.getBoundingClientRect(), m = pk.getBoundingClientRect(); return { inView: a.top >= 0 && a.left >= -4 && a.right <= innerWidth + 4 && a.bottom <= innerHeight, under: a.left < m.right && a.right > m.left && a.top < m.bottom && a.bottom > m.top, beam: !!document.querySelector(".tb-ph-beam"), look: pk.classList.contains("tb-ph-look") }; });
    if (chk.inView) inside++; if (!chk.under) notUnder++;
    res.lines.push(`INFO ${w} y${y}: ${JSON.stringify(got)} ${JSON.stringify(chk)}`);
    await p.screenshot({ path: `${OUT}/ph1-${w}-highlight-y${y}.png` });
    await sleep(1400);
  }
  ok(hl >= 3, `${w} highlights fired at ${hl}/5 scroll spots`); ok(inside === hl, `${w} highlight ring on screen ${inside}/${hl}`); ok(notUnder === hl, `${w} target never under him ${notUnder}/${hl}`);
  // fold open
  const fold = await p.evaluate(() => { const d = [...document.querySelectorAll("details.win:not([open])")].find(x => x.getBoundingClientRect().height > 0); if (!d) return false; d.scrollIntoView({ block: "center" }); return true; });
  if (fold) {
    await sleep(1500);
    await p.evaluate(() => { const d = [...document.querySelectorAll("details.win:not([open])")].find(x => { const r = x.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight; }); d.querySelector("summary").click(); });
    await sleep(500);
    const g = await p.evaluate(() => !!document.querySelector("details.tb-burst"));
    ok(g, `${w} fold open gets the desktop glow (tb-burst)`);
    await p.screenshot({ path: `${OUT}/ph1-${w}-fold-open.png` });
  }
  // bubble placement (bubbles are off site-wide; turn on in this page only to test placement)
  const bubbles = [];
  for (const y of [0, 1500]) {
    await p.evaluate(y => { scrollTo({ top: y, behavior: 'instant' }); document.getElementById("tb-say").removeAttribute("data-off"); }, y); await sleep(1600);
    await p.evaluate(() => { const s = document.querySelector('.tb-ph-say'); if (s) s.remove(); });
    // force a bubble: count%3===1 happens on the next highlight when count%3==0
    for (let k = 0; k < 3; k++) { await p.evaluate(() => window.__tbPhone.now()); await sleep(300); if (await p.$(".tb-ph-say")) break; await sleep(1300); }
    const bb = await p.evaluate(() => { const s = document.querySelector(".tb-ph-say"); if (!s) return null; const r = s.getBoundingClientRect(); return { r: [r.left, r.top, r.right, r.bottom].map(Math.round), vw: innerWidth, vh: innerHeight }; });
    if (bb) { bubbles.push(bb.r[0] >= 8 && bb.r[1] >= 8 && bb.r[2] <= bb.vw - 8 && bb.r[3] <= bb.vh - 8); res.lines.push(`INFO ${w} bubble ${JSON.stringify(bb)}`); await p.screenshot({ path: `${OUT}/ph1-${w}-bubble-y${y}.png` }); }
    await sleep(1600);
  }
  ok(bubbles.length > 0 && bubbles.every(Boolean), `${w} bubble inside screen with 8px margins (${bubbles.length} shown, test-only data-off removed)`);
  await p.close();
  // reduced motion
  const q = await b.newPage(); await q.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await q.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await q.goto(URL, { waitUntil: "networkidle0" }); await sleep(2500);
  const rm = await q.evaluate(() => { const r = window.__tbPhone.now(); const pk = document.querySelector("canvas.tb-rig-peek"); return { r, peek: pk ? getComputedStyle(pk).display : "none", ring: !!document.querySelector(".tb-ph-ring"), beam: !!document.querySelector(".tb-ph-beam") }; });
  ok(!rm.r && rm.peek === "none" && !rm.ring && !rm.beam, `${w} reduced motion: no robot, no highlight ${JSON.stringify(rm)}`);
  await q.close();
}
// desktop 1280: phone file must change nothing
for (const on of [false, true]) {
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
  if (!on) { await p.setRequestInterception(true); p.on("request", r => /tylerbot-phone\./.test(r.url()) ? r.abort() : r.continue()); }
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  await p.goto(URL, { waitUntil: "networkidle0" }); await sleep(3000);
  await p.screenshot({ path: `${OUT}/desk-1280-top-${on ? "ph1" : "rg2"}.png` });
  for (let y = 0; y <= 2400; y += 200) { await p.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), y); await sleep(120); }
  await sleep(1500);
  await p.screenshot({ path: `${OUT}/desk-1280-y2400-${on ? "ph1" : "rg2"}.png` });
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(2500);
  await p.screenshot({ path: `${OUT}/desk-1280-back-${on ? "ph1" : "rg2"}.png` });
  const st = await p.evaluate(() => ({ ph: document.querySelectorAll(".tb-ph-ring,.tb-ph-beam,.tb-ph-say,.tb-ph-look,.tb-ph-duck").length, tr: [...document.querySelectorAll("canvas")].map(c => c.style.translate).filter(Boolean).length, tbp: window.__tbPhone ? window.__tbPhone() : null, now: window.__tbPhone ? window.__tbPhone.now() : null, live: document.documentElement.classList.contains("tb-rig-live") }));
  if (on) ok(st.ph === 0 && st.tr === 0 && st.tbp && !st.tbp.narrow && st.now === false && st.live, `1280 desktop: phone add-on inert ${JSON.stringify(st)}`);
  ok(errs.length === 0, `1280 (${on ? "ph1" : "rg2"}) no page errors`);
  await p.close();
}
await b.close();
fs.writeFileSync(`${OUT}/RESULTS.txt`, res.lines.join("\n") + `\n${res.pass} PASS, ${res.fail} FAIL\n`);
console.log(res.lines.join("\n")); console.log(res.pass, "PASS", res.fail, "FAIL");
