/**
 * Tylerbot idle-play phase 2 checks (DESIGN.md §9, T31–T36) plus a small
 * phase-1 smoke set. The shipped tylerbot-play.js has no test hook (T29).
 * This file serves a copy with a local-only hook so the bits can be started
 * on demand. It does not change the file that ships.
 *
 *   npm install --prefix /tmp/tbdeps puppeteer-core
 *   node tests/tylerbot-phase2.mjs
 *
 * Chrome is /usr/bin/google-chrome-stable, or $CHROME. The page is opened at
 * 1440×1900 so the hero spot and the folded windows are on screen together.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

function loadPuppeteer() {
  const candidates = [
    process.env.PUPPETEER_CORE,
    "/tmp/tbdeps/node_modules/puppeteer-core",
    path.join(root, "node_modules/puppeteer-core"),
  ].filter(Boolean);
  for (const dir of candidates) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) return createRequire(pkg)("puppeteer-core");
  }
  throw new Error(
    "puppeteer-core not found. Install it with: npm install --prefix /tmp/tbdeps puppeteer-core",
  );
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME || "/usr/bin/google-chrome-stable";
const results = [];

function check(id, ok, detail) {
  results.push({ id, ok: !!ok, detail: detail || "" });
  console.log((ok ? "PASS " : "FAIL ") + id + (detail ? " — " + detail : ""));
}

function hookSource() {
  return (
    'n.__tbIdle={' +
    'play:function(id){try{return!!__tbPlay(id)}catch(err){return{error:String(err)}}},' +
    'plan:function(id){var i=cn();if(!i||!Yt[id])return null;de(ee);var u=Yt[id](i,ee);if(!u)return null;var show=0,k,ph=u.ph||[],aim=null;for(k=0;k<ph.length;k++)if(ph[k][0]==="show")show=+(ph[k][2]-ph[k][1]).toFixed(3);if(u.arms){var st=null;for(k=0;k<ph.length;k++)if(ph[k][0]==="show")st=ph[k];u.arms(st?(st[1]+st[2])/2:0);aim=H[6];H[6]=0}var samples=[],si,pp;for(si=0;si<=4;si++){pp={x:0,y:0,r:0,sx:1,sy:1,icon:0};u.pose((u.T0||u.T)*si/4,pp);samples.push([Math.round((ee[0]+pp.x)*10)/10,Math.round((ee[1]+pp.y)*10)/10])}return{id:id,kind:u.kind||"",show:show,T:+(u.T||0).toFixed(2),hasArms:typeof u.arms==="function",aim:aim,zone:u.zone||null,tag:u.tgt?u.tgt.getAttribute("data-tyler-show")||"":"",text:u.tgt?(u.tgt.textContent||"").replace(/\\s+/g," ").trim().slice(0,240):"",samples:samples,colL:i.colL,colR:i.colR,band:i.band,vw:i.vw}},' +
    'instant:function(v){At.instant=!!v;if(v)At.log=At.log||[]},' +
    'log:function(){return At.log?At.log.map(function(row){return row.slice()}):[]},' +
    'counts:function(){return{free:At.gF,price:At.gP,n:At.n,last:At.last}},' +
    'resetCounts:function(){At.gF=0;At.gP=0;At.n=0;At.last="";At.log=[];At.lent=!1},' +
    'allowPrice:function(){At.gF=Math.max(At.gF,At.gP+1)},' +
    'state:function(){return d},' +
    'ready:function(){return{y:!!y,d:d,gl:!!(p&&p.isContextLost&&!p.isContextLost())}},' +
    'hl:function(){if(!Gt||!Gt.parentNode)return null;var cs=n.getComputedStyle(Gt);return{aria:Gt.getAttribute("aria-hidden"),pe:cs.pointerEvents,cls:Gt.className}},' +
    'quiet:function(){At.on=!1;At.instant=!1;At.fake=null;At.nat=!1;At.says=3;Ze();Vn()},' +
    'simVisit:function(){At.instant=!0;At.log=[];At.gF=0;At.gP=0;At.n=0;At.last="";At.lent=!1;At.on=!0;At.vis=!0;At.paused=!1;At.trip=!1;At.down=!1;At.hold=0;At.back=!1;At.lastIn=-1e9;At.lastSc=-1e9;At.says=3;At.t0=At.t0||0;At.due=At.t0+15e3;At.fake=At.t0+16e3;Ze();var end=At.t0+36e5,guard=0;while(At.n<4&&At.fake<end&&guard++<12){At.fake=Math.max(At.fake,an());ln();if(At.due>At.fake)At.fake=At.due;else At.fake+=12e4}var out={n:At.n,free:At.gF,price:At.gP,log:At.log.map(function(row){return[row[1],row[3]||""]}),why:At.n?0:un(),y:!!y,d:d};Ze();At.on=!1;At.instant=!1;At.fake=null;At.nat=!1;return out}' +
    '};'
  );
}

function patch(src) {
  const head = "(function(t,a){";
  const start = head + "var i=cn();if(!i)return!1;";
  const end = "Xe(),!0})(null)||(At.hold=t+yt,on())";
  const a = src.indexOf(start);
  const b = src.indexOf(end);
  const lnAt = src.indexOf("function ln(){");
  const close = src.lastIndexOf("}();");
  if (a < 0 || b < a || lnAt < 0 || close < b) throw new Error("could not patch the bit starter");
  const inner = src.slice(a + head.length, b + "Xe(),!0".length);
  const fn = "function __tbPlay(t,a){" + inner + "}";
  let out =
    src.slice(0, a) +
    "__tbPlay(null)||(At.hold=t+yt,on())" +
    src.slice(b + end.length);
  const ln2 = out.indexOf("function ln(){");
  out = out.slice(0, ln2) + fn + out.slice(ln2);
  const close2 = out.lastIndexOf("}();");
  out = out.slice(0, close2) + hookSource() + out.slice(close2);
  return out;
}

function contentType(file) {
  const ext = path.extname(file);
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".webp": "image/webp",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".woff2": "font/woff2",
      ".webm": "video/webm",
      ".mp4": "video/mp4",
      ".ico": "image/x-icon",
      ".json": "application/json",
    }[ext] || "application/octet-stream"
  );
}

function listen() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      if (rel === "tylerbot-play.js") buf = Buffer.from(patch(buf.toString("utf8")));
      res.writeHead(200, {
        "Content-Type": contentType(file),
        "Cache-Control": "no-store",
      });
      res.end(buf);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function sameList(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function snap(page) {
  return page.evaluate(() => ({
    open: [...document.querySelectorAll("details")].map((d) => d.open),
    aria: [...document.querySelectorAll("[aria-expanded]")].map((el) =>
      el.getAttribute("aria-expanded"),
    ),
    focus: document.activeElement
      ? document.activeElement.id || document.activeElement.tagName
      : "",
    inputs: [...document.querySelectorAll("input")].map(
      (i) => (i.checked ? "1" : "0") + ":" + i.value,
    ),
    dialog: !!document.querySelector("dialog[open]"),
    hl: document.querySelectorAll(".tb-hl").length,
    lent: !!document.querySelector(".brand.tb-lent"),
    icon: document.querySelectorAll(".tb-m").length,
    href: location.href,
    clip: window.__clipWrites.slice(),
    opens: window.__opens.slice(),
    frame: [...document.querySelectorAll("iframe")].map((f) => f.getAttribute("src") || ""),
  }));
}

async function main() {
  const puppeteer = loadPuppeteer();
  const shipped = fs.readFileSync(path.join(root, "tylerbot-play.js"), "utf8");
  check(
    "T29",
    !shipped.includes("__tbIdle") && !shipped.includes("tbtest"),
    "shipped file has no __tbIdle and no tbtest",
  );
  check(
    "phase2-present",
    ["Yt.MP=", "Yt.TF=", "Yt.SS=", "Yt.GI=", "function fo(", "pointerEvents"].every((s) =>
      shipped.includes(s),
    ),
    "menu peek, ticker fan, side slide, gist, price guard, highlight pointer-events",
  );

  const patched = patch(shipped);
  const tmp = path.join("/tmp", "tylerbot-play.patched.js");
  fs.writeFileSync(tmp, patched);
  const syntax = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  check("patch-syntax", syntax.status === 0, syntax.stderr || "patched copy parses");

  const server = await listen();
  const port = server.address().port;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: [
      "--headless=new",
      "--use-angle=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--window-size=1440,1000",
    ],
  });
  const page = await browser.newPage();
  const gumroad = [];
  const navs = [];
  page.on("request", (req) => {
    if (/gumroad/i.test(req.url())) gumroad.push(req.url());
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navs.push(frame.url());
  });
  page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
  await page.evaluateOnNewDocument(() => {
    window.__clipWrites = [];
    window.__opens = [];
    window.open = function () {
      window.__opens.push(Array.prototype.slice.call(arguments).map(String));
      return null;
    };
    const clip = navigator.clipboard;
    if (clip && clip.writeText) {
      const orig = clip.writeText.bind(clip);
      clip.writeText = function (text) {
        window.__clipWrites.push(String(text).slice(0, 40));
        return orig(text);
      };
    }
    const exec = document.execCommand && document.execCommand.bind(document);
    if (exec) {
      document.execCommand = function (cmd) {
        if (cmd === "copy" || cmd === "cut") window.__clipWrites.push(cmd);
        return exec(cmd);
      };
    }
  });
  await page.setViewport({ width: 1440, height: 1900, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:" + port + "/index.html", {
    waitUntil: "load",
    timeout: 30000,
  });
  try {
    await page.waitForFunction(() => window.__tbIdle && window.__tbIdle.ready().y, {
      timeout: 20000,
    });
  } catch (err) {
    const ready = await page.evaluate(() => ({
      hook: !!window.__tbIdle,
      ready: window.__tbIdle ? window.__tbIdle.ready() : null,
      state: document.querySelector("[data-tyler-play]")
        ? document.querySelector("[data-tyler-play]").getAttribute("data-tb-state")
        : null,
    }));
    check("webgl-ready", false, JSON.stringify(ready) + " " + err.message);
  }
  const ready = await page.evaluate(() => window.__tbIdle.ready());
  check("webgl-ready", !!(ready && ready.y && ready.gl), JSON.stringify(ready));
  await page.evaluate(() => {
    window.__tbIdle.quiet();
    document.documentElement.style.scrollBehavior = "auto";
  });

  async function plan(id) {
    return page.evaluate((bit) => window.__tbIdle.plan(bit), id);
  }

  const tfRun = await plan("TF");
  check(
    "T33-running",
    !!(tfRun && tfRun.show <= 5 && tfRun.show >= 1.5 && tfRun.hasArms),
    tfRun ? "show " + tfRun.show + "s aim " + tfRun.aim : "no line planned",
  );

  await page.click(".tk-pause");
  const tfPaused = await plan("TF");
  check("T33-button", tfPaused == null, tfPaused ? "planned while paused" : "skipped");
  await page.click(".tk-pause");
  const pressed = await page.$eval(".tk-pause", (el) => el.getAttribute("aria-pressed"));
  check("T33-button-restored", pressed === "false", "aria-pressed " + pressed);

  const tickerBox = await page.$eval(".ticker", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(tickerBox.x, tickerBox.y);
  const hovered = await page.evaluate(
    () => document.querySelector(".ticker").matches(":hover") || document.querySelector(".tkbar").matches(":hover"),
  );
  const tfHover = await plan("TF");
  check(
    "T33-hover",
    hovered && tfHover == null,
    "hover " + hovered + (tfHover ? " still planned" : " skipped"),
  );
  await page.mouse.move(720, 700);
  await page.evaluate(() => document.body.focus());
  const tfAgain = await plan("TF");
  check("T33-after-hover", !!tfAgain, tfAgain ? "plans again" : "still skipped");

  const ss = await plan("SS");
  const ssGutter =
    ss &&
    ss.samples.every((pt) => pt[0] < ss.colL - 4 || pt[0] > ss.colR + 4);
  check("P2-3-gutter", !!ssGutter, ss ? JSON.stringify(ss.samples) : "no slide planned");

  let mp = null;
  for (let i = 0; i < 6 && !mp; i++) mp = await plan("MP");
  check(
    "P2-1-plans",
    !!mp,
    mp ? "show " + mp.show + "s" : "no folded window or dock button in reach",
  );

  async function playBit(id) {
    const highlights = id === "MP" || id === "TF" || id === "GI";
    let last = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      gumroad.length = 0;
      await page.evaluate(() => window.__tbIdle.quiet());
      const before = await snap(page);
      const started = await page.evaluate((bit) => window.__tbIdle.play(bit), id);
      if (!started || started.error) {
        last = { started, before, gumroad: gumroad.slice() };
        continue;
      }
      if (highlights) {
        await page.waitForFunction(() => window.__tbIdle.hl(), { timeout: 3000 }).catch(() => {});
      } else {
        await page
          .waitForFunction(() => window.__tbIdle.state() === "play", { timeout: 3000 })
          .catch(() => {});
      }
      const mid = await page.evaluate(() => ({
        state: window.__tbIdle.state(),
        hl: window.__tbIdle.hl(),
      }));
      await page.waitForFunction(
        () => {
          const s = window.__tbIdle.state();
          return s === "rest" || s === "off";
        },
        { timeout: 20000 },
      );
      await new Promise((r) => setTimeout(r, 120));
      const after = await snap(page);
      return { started: true, before, mid, after, gumroad: gumroad.slice() };
    }
    return last;
  }

  function untouched(run, id) {
    if (!run || !run.started || !run.after) {
      check(id, false, "did not play: " + JSON.stringify(run && run.started));
      return;
    }
    const b = run.before;
    const a = run.after;
    const dom =
      sameList(b.open, a.open) &&
      sameList(b.aria, a.aria) &&
      b.focus === a.focus &&
      sameList(b.inputs, a.inputs) &&
      b.href === a.href &&
      sameList(b.clip, a.clip) &&
      a.opens.length === 0 &&
      !a.dialog &&
      a.hl === 0 &&
      !a.lent &&
      a.icon === 0 &&
      a.frame.every((src) => !/gumroad/i.test(src));
    const net = run.gumroad.length === 0 && navs.length === 1;
    check(id, dom && net, dom && net ? "page, focus, clipboard, network unchanged" : "dom " + dom + " net " + run.gumroad.join(" "));
  }

  const mpRun = mp ? await playBit("MP") : null;
  if (mpRun) {
    untouched(mpRun, "T31-MP");
    const hl = mpRun.mid && mpRun.mid.hl;
    check(
      "T34-MP",
      !!(hl && hl.aria === "true" && hl.pe === "none" && mpRun.after.hl === 0),
      hl ? hl.aria + " pe=" + hl.pe + " after " + mpRun.after.hl : "no highlight mid-bit",
    );
    check("T32-MP", mpRun.gumroad.length === 0 && mpRun.after.opens.length === 0, "no checkout");
  } else check("T31-MP", false, "menu peek could not be planned");

  const tfRunPlay = await playBit("TF");
  untouched(tfRunPlay, "T31-TF");
  check(
    "T34-TF",
    !!(tfRunPlay.mid && tfRunPlay.mid.hl && tfRunPlay.mid.hl.aria === "true" && tfRunPlay.mid.hl.pe === "none" && tfRunPlay.after && tfRunPlay.after.hl === 0),
    tfRunPlay.mid && tfRunPlay.mid.hl ? "highlight gone after" : "missing highlight",
  );
  check("T32-TF", tfRunPlay.gumroad && tfRunPlay.gumroad.length === 0, "no checkout");

  const ssRun = await playBit("SS");
  untouched(ssRun, "T31-SS");
  check(
    "T34-SS",
    !!(ssRun.mid && ssRun.mid.hl == null && ssRun.after && ssRun.after.hl === 0),
    "side slide draws no highlight and leaves none",
  );
  check("T32-SS", ssRun.gumroad && ssRun.gumroad.length === 0, "no checkout");

  const giRun = await playBit("GI");
  untouched(giRun, "T31-GI");
  check(
    "T34-GI",
    !!(giRun.mid && giRun.mid.hl && giRun.mid.hl.pe === "none" && giRun.mid.hl.aria === "true" && giRun.after && giRun.after.hl === 0),
    giRun.mid && giRun.mid.hl ? "highlight gone after" : "missing highlight",
  );
  check("T32-GI", giRun.gumroad && giRun.gumroad.length === 0, "no checkout");

  const t35 = await page.evaluate(async () => {
    const tb = window.__tbIdle;
    tb.quiet();
    tb.resetCounts();
    tb.allowPrice();
    const seen = [];
    const bad = [];
    function hitsBuy(zone) {
      if (!zone) return false;
      return [...document.querySelectorAll('a[href*="gumroad.com"],[data-gd-name]')].some((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        return zone[0] < r.right && zone[2] > r.left && zone[1] < r.bottom && zone[3] > r.top;
      });
    }
    const fake = document.createElement("p");
    fake.setAttribute("data-tyler-show", "price");
    fake.textContent = "$29";
    fake.style.cssText = "position:fixed;left:480px;top:520px;margin:0";
    document.body.appendChild(fake);
    for (let i = 0; i < 40; i++) {
      const plan = tb.plan("GI");
      if (!plan) continue;
      const row = { tag: plan.tag, text: plan.text, buy: hitsBuy(plan.zone) };
      seen.push(row);
      const okTag = plan.tag === "what" || plan.tag === "free" || plan.tag === "price";
      const bare = plan.tag === "price" && /^\$\d+(?:\.\d+)?$/.test(plan.text);
      const scarcityOnly = /first\s*200/i.test(plan.text) && !/\$\d+/.test(plan.text);
      const buyWords = /get the full kit|get founding/i.test(plan.text);
      if (!okTag || bare || scarcityOnly || plan.buy || buyWords || !plan.tag) bad.push(row);
    }
    fake.remove();
    const tier = document.querySelector('[data-gd-name="mudmode Founding 200"]');
    const priceEl = tier && tier.closest(".tier").querySelector(".price");
    const saved = priceEl ? priceEl.textContent : "";
    if (priceEl) priceEl.textContent = "ended";
    let foundingWhileOff = false;
    for (let i = 0; i < 24; i++) {
      const plan = tb.plan("GI");
      if (plan && plan.tag === "price" && /founding|first\s*200/i.test(plan.text)) foundingWhileOff = true;
    }
    if (priceEl) priceEl.textContent = saved;
    const tags = [...new Set(seen.map((s) => s.tag))];
    const priceTexts = seen.filter((s) => s.tag === "price").map((s) => s.text);
    return { n: seen.length, tags, priceTexts: [...new Set(priceTexts)], bad, foundingWhileOff };
  });
  const priceOk = t35.priceTexts.some((t) => /\$29/.test(t) && /one time/i.test(t));
  const foundingOk = t35.priceTexts.every(
    (t) => !/founding|first\s*200/i.test(t) || (/\$15/.test(t) && /\$29|\$15/.test(t)),
  );
  check(
    "T35",
    t35.bad.length === 0 &&
      !t35.foundingWhileOff &&
      t35.tags.includes("free") &&
      priceOk &&
      foundingOk &&
      t35.n > 0,
    JSON.stringify({
      tags: t35.tags,
      prices: t35.priceTexts.length,
      bad: t35.bad.length,
      foundingWhileOff: t35.foundingWhileOff,
    }),
  );

  const t36 = await page.evaluate(() => {
    const tb = window.__tbIdle;
    tb.quiet();
    tb.resetCounts();
    tb.instant(true);
    const steps = [];
    for (let i = 0; i < 40; i++) {
      tb.play("GI");
      const c = tb.counts();
      steps.push([c.free, c.price]);
      if (c.price > c.free) break;
    }
    tb.instant(false);
    const last = steps[steps.length - 1] || [0, 0];
    return { free: last[0], price: last[1], broke: steps.some((s) => s[1] > s[0]), steps: steps.length };
  });
  check(
    "T36-ratio",
    !t36.broke && t36.free >= t36.price && t36.free > 0 && t36.price > 0,
    "free " + t36.free + " price " + t36.price,
  );

  const visits = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 20; i++) out.push(window.__tbIdle.simVisit());
    window.__tbIdle.quiet();
    return out;
  });
  const visitBad = visits.filter((v) => v.price > v.free || v.n > 4);
  const visitPlayed = visits.filter((v) => v.n > 0);
  const firstOk = visitPlayed.every((v) => v.log[0] && (v.log[0][0] === "B1" || v.log[0][0] === "B2"));
  const noRepeat = visitPlayed.every((v) => v.log.every((row, i) => i === 0 || row[0] !== v.log[i - 1][0]));
  const sawPhase2 = visitPlayed.some((v) =>
    v.log.some((row) => row[0] === "MP" || row[0] === "TF" || row[0] === "SS" || row[0] === "GI"),
  );
  check(
    "T36-60min",
    visitPlayed.length > 0 && visitBad.length === 0 && firstOk && noRepeat && sawPhase2,
    visitPlayed.length
      ? "visits " + visitPlayed.length + " example " + JSON.stringify(visitPlayed[0].log)
      : "no visit played " + JSON.stringify(visits[0]),
  );

  await page.evaluate(() => window.__tbIdle.quiet());
  const b1 = await plan("B1");
  check("phase1-B1-plan", !!b1, b1 ? "T " + b1.T : "no B1");
  const b1Run = await playBit("B1");
  untouched(b1Run, "phase1-B1-home");
  const b5 = await plan("B5");
  if (b5) {
    const b5Run = await playBit("B5");
    untouched(b5Run, "phase1-B5-home");
  } else check("phase1-B5-home", false, "B5 could not be planned at this size");

  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync("/tmp/tb-phase2-results.json", JSON.stringify({ results }, null, 2));
  console.log(failed.length ? failed.length + " failed" : "all passed");
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  fs.writeFileSync("/tmp/tb-phase2-results.json", JSON.stringify({ error: String(err), results }, null, 2));
  process.exit(1);
});
