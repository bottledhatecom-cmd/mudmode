/* Idle fiddle + grab dodge for the hero Tylerbot.
   Page reactions are transient classes (transform / opacity / filter only).
   Never opens a fold, moves focus, scrolls, or changes aria or form state.
   The minified play script stays the big-bit engine; this file reads window.__tb. */
(function (root) {
  "use strict";
  var FAM = { SELF: 25, PEEK: 15, LOGO: 12, TICKER: 12, BUTTONS: 10, TEXT: 10, FOLDS: 8, DESK: 8 };
  var PLAYS = [
    { id: "L1", fam: "LOGO", ms: 700, cls: "tb-poke" },
    { id: "L2", fam: "LOGO", ms: 1150, cls: "tb-spin" },
    { id: "L3", fam: "LOGO", ms: 900, cls: "tb-peek" },
    { id: "L4", fam: "LOGO", ms: 800, cls: "tb-wobble" },
    { id: "T1", fam: "TICKER", ms: 700, cls: "tb-jog" },
    { id: "T2", fam: "TICKER", ms: 900, cls: "tb-look" },
    { id: "T3", fam: "TICKER", ms: 700, cls: "tb-pinch" },
    { id: "T4", fam: "TICKER", ms: 800, cls: "tb-hop" },
    { id: "D1", fam: "FOLDS", ms: 600, cls: "tb-tug" },
    { id: "D2", fam: "FOLDS", ms: 700, cls: "tb-knock" },
    { id: "D3", fam: "FOLDS", ms: 800, cls: "tb-edge" },
    { id: "D4", fam: "FOLDS", ms: 500, cls: "tb-arr" },
    { id: "B1", fam: "BUTTONS", ms: 500, cls: "tb-squash" },
    { id: "B2", fam: "BUTTONS", ms: 800, cls: "tb-shine" },
    { id: "B3", fam: "BUTTONS", ms: 800, cls: "tb-leanb" },
    { id: "B4", fam: "BUTTONS", ms: 900, cls: "tb-point" },
    { id: "X1", fam: "TEXT", ms: 800, cls: "tb-hl" },
    { id: "X2", fam: "TEXT", ms: 800, cls: "tb-ulink" },
    { id: "X3", fam: "TEXT", ms: 800, cls: "tb-nod" },
    { id: "X4", fam: "TEXT", ms: 1000, cls: "tb-trace" },
    { id: "P1", fam: "PEEK", ms: 900, cls: "tb-look" },
    { id: "P2", fam: "PEEK", ms: 800, cls: "tb-look" },
    { id: "P3", fam: "PEEK", ms: 800, cls: "tb-look" },
    { id: "P4", fam: "PEEK", ms: 1100, cls: "tb-downhint" },
    { id: "S1", fam: "SELF", ms: 450, cls: "tb-blink" },
    { id: "S2", fam: "SELF", ms: 1000, cls: "tb-yawn" },
    { id: "S3", fam: "SELF", ms: 900, cls: "tb-stretch" },
    { id: "S4", fam: "SELF", ms: 1100, cls: "tb-sway" },
    { id: "S5", fam: "SELF", ms: 1100, cls: "tb-wave" },
    { id: "S6", fam: "SELF", ms: 700, cls: "tb-hop" },
    { id: "S7", fam: "SELF", ms: 800, cls: "tb-scratch" },
    { id: "S8", fam: "SELF", ms: 800, cls: "tb-dust" },
    { id: "K1", fam: "DESK", ms: 600, cls: "tb-boop" },
    { id: "K2", fam: "DESK", ms: 700, cls: "tb-line" },
    { id: "K3", fam: "DESK", ms: 600, cls: "tb-shake" },
    { id: "K4", fam: "DESK", ms: 500, cls: "tb-knockw" }
  ];
  var BY_ID = {};
  for (var pi = 0; pi < PLAYS.length; pi++) BY_ID[PLAYS[pi].id] = PLAYS[pi];

  function createState() {
    return { hist: [], famAt: {}, playAt: {} };
  }

  function allow(env) {
    if (!env) return false;
    if (env.reduced || env.saveData || env.paused || env.hidden) return false;
    if (!env.tkOn || !env.vis) return false;
    if (!(env.width >= 1100)) return false;
    if (env.bit || env.bubble || env.fiddle) return false;
    return true;
  }

  function recentFamCount(hist, fam) {
    var n = 0, i, slice = hist.slice(-6);
    for (i = 0; i < slice.length; i++) if (slice[i].fam === fam) n++;
    return n;
  }

  function choose(state, env, rng) {
    if (!allow(env) || !state) return null;
    var now = env.now || 0;
    var hist = state.hist || [];
    var last = hist.length ? hist[hist.length - 1].fam : "";
    var recent = {};
    var i, h = hist.slice(-10);
    for (i = 0; i < h.length; i++) recent[h[i].id] = 1;
    var groups = {};
    var names = [];
    for (i = 0; i < PLAYS.length; i++) {
      var p = PLAYS[i];
      if (env.has && !env.has(p.id)) continue;
      if (p.fam === last) continue;
      if (recentFamCount(hist, p.fam) >= 2) continue;
      if (recent[p.id]) continue;
      if (state.famAt[p.fam] != null && now - state.famAt[p.fam] < 12000) continue;
      if (state.playAt[p.id] != null && now - state.playAt[p.id] < 90000) continue;
      if (!groups[p.fam]) { groups[p.fam] = []; names.push(p.fam); }
      groups[p.fam].push(p);
    }
    if (!names.length) return null;
    var total = 0;
    for (i = 0; i < names.length; i++) total += FAM[names[i]] || 0;
    if (!(total > 0)) return null;
    var r = rng() * total, acc = 0, fam = names[0];
    for (i = 0; i < names.length; i++) {
      acc += FAM[names[i]] || 0;
      if (r <= acc) { fam = names[i]; break; }
    }
    var group = groups[fam];
    var play = group[Math.floor(rng() * group.length)];
    return {
      id: play.id,
      fam: play.fam,
      ms: play.ms,
      cls: play.cls,
      t: now,
      amp: 0.7 + rng() * 0.6,
      spd: 0.85 + rng() * 0.3,
      mir: rng() < 0.5 ? -1 : 1,
      side: rng() < 0.5 ? -1 : 1
    };
  }

  function commit(state, pick) {
    if (!state || !pick) return;
    state.hist.push({ id: pick.id, fam: pick.fam, t: pick.t || 0 });
    if (state.hist.length > 10) state.hist.shift();
    state.famAt[pick.fam] = pick.t || 0;
    state.playAt[pick.id] = pick.t || 0;
  }

  function noDodge(reason) { return { dodge: false, reason: reason }; }

  function decideDodge(st, env, rng) {
    st = st || {};
    if (!env) return noDodge("env");
    if (env.pointer !== "mouse" && env.pointer !== "pen") return noDodge("pointer");
    if (env.reduced) return noDodge("reduced");
    if (env.paused || env.hidden || !env.vis || env.saveData || !env.tkOn) return noDodge("gate");
    if (!(env.width >= 1100)) return noDodge("width");
    if (!env.rest) return noDodge("rest");
    if (env.bit || env.fiddle || env.drag) return noDodge("busy");
    if ((st.dodges || 0) >= 3) return noDodge("cap");
    if (st.lastDodge) return noDodge("row");
    var now = env.now || 0;
    if (st.dodgeAt && now - st.dodgeAt < 6000 && !(st.catchAt > st.dodgeAt)) return noDodge("grace");
    if (st.dodgeAt && now - st.dodgeAt < 20000) return noDodge("cool");
    var chance = (st.grabs || 0) === 0 ? 0.5 : 0.35;
    var roll = rng();
    return { dodge: roll < chance, reason: roll < chance ? "roll" : "miss", roll: roll, chance: chance };
  }

  function noteGrab(st, didDodge, now) {
    st.grabs = (st.grabs || 0) + 1;
    if (didDodge) {
      st.dodges = (st.dodges || 0) + 1;
      st.lastDodge = true;
      st.dodgeAt = now;
    } else {
      st.lastDodge = false;
      st.catchAt = now;
    }
    return st;
  }

  function gapFor(idleMs, rng) {
    if (idleMs >= 180000) return 15000 + rng() * 10000;
    return 4000 + rng() * 5000;
  }

  root.TbFiddle = {
    FAM: FAM,
    PLAYS: PLAYS,
    createState: createState,
    allow: allow,
    choose: choose,
    commit: commit,
    decideDodge: decideDodge,
    noteGrab: noteGrab,
    gapFor: gapFor
  };

  if (!root.document || !root.document.querySelector) return;

  var doc = root.document;
  var bot = doc.querySelector("[data-tyler-play]");
  if (!bot) return;

  var state = createState();
  var rng = mulberry32((Date.now() ^ ((Math.random() * 0x100000000) >>> 0)) >>> 0);
  var grabSt = { dodges: 0, grabs: 0, lastDodge: false, dodgeAt: 0, catchAt: 0 };
  var timer = 0;
  var gen = 0;
  var fiddling = false;
  var dodging = false;
  var lastIn = Date.now();
  var resumeAt = 0;
  var vis = false;
  var pointer = null;
  var active = [];
  var teaseEl = null;

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function api() {
    try { return root.__tb && root.__tb(); } catch (err) { return null; }
  }

  function reduced() {
    return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function saveData() {
    var c = root.navigator && root.navigator.connection;
    return !!(c && c.saveData);
  }

  function envNow() {
    var live = api();
    return {
      now: Date.now(),
      reduced: reduced(),
      saveData: saveData(),
      paused: !!(doc.querySelector(".tkbar.tk-paused") || (live && live.paused)),
      hidden: !!doc.hidden,
      vis: live ? !!live.vis : vis,
      tkOn: doc.documentElement.classList.contains("tk-on") && !!(live && (live.on || live.perf) && live.ok && live.ok()), // f3: cooldown counts as on
      width: root.innerWidth || 0,
      bit: !!(live && live.bit),
      bubble: !!(live && live.bit) || !!doc.querySelector(".tb-say"),
      fiddle: fiddling || dodging,
      rest: !live || live.state === "rest",
      drag: !!(live && (live.hold || live.down))
    };
  }

  function pageOk() {
    if (dodging) return false;
    var env = envNow();
    env.fiddle = false;
    env.bubble = !!(api() && api().bit);
    return allow(env);
  }

  function seen(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.top > (root.innerHeight || 0)) return false;
    var closed = el.closest && el.closest("details.win:not([open])");
    if (closed && !(el.closest("summary") || el.tagName === "SUMMARY")) return false;
    return true;
  }

  function pickOne(list) {
    var i, ok = [];
    for (i = 0; i < list.length; i++) if (seen(list[i])) ok.push(list[i]);
    if (!ok.length) return null;
    return ok[Math.floor(rng() * ok.length)];
  }

  function qsa(sel) { return doc.querySelectorAll(sel); }

  function targetFor(id) {
    var folds, btns, links, icons, dots, wins, next, i, top;
    if (id === "L1" || id === "L2" || id === "L3" || id === "L4") {
      var logo = doc.querySelector(".bar .brand img") || doc.querySelector(".bar .brand");
      return seen(logo) ? logo : null;
    }
    if (id === "T1" || id === "T2" || id === "T3" || id === "T4") {
      if (doc.querySelector(".tkbar.tk-paused")) return null;
      return seen(doc.querySelector(".tkbar .ticker")) ? doc.querySelector(".tkbar .ticker") : null;
    }
    if (id === "D1" || id === "D2" || id === "D3" || id === "D4") return pickOne(qsa("details.win:not([open]) > summary"));
    if (id === "B1" || id === "B2" || id === "B3") return pickOne(qsa(".tkbar .btn, #start .btn, a.btn"));
    if (id === "B4") return pickOne(qsa('a[download], a[href*="starter-kit"]'));
    if (id === "X1") return seen(doc.querySelector("h1#h-main")) ? doc.querySelector("h1#h-main") : null;
    if (id === "X2") return pickOne(qsa("#start a.hl, .bar a.hl, #start .lede a"));
    if (id === "X3") return seen(doc.querySelector(".hero-sub")) ? doc.querySelector(".hero-sub") : null;
    if (id === "X4") return seen(doc.querySelector(".hero-motto")) ? doc.querySelector(".hero-motto") : null;
    if (id === "P1") {
      next = qsa(".desk .win, details.win");
      top = null;
      for (i = 0; i < next.length; i++) {
        if (next[i].id === "start") continue;
        var r = next[i].getBoundingClientRect();
        if (r.top > 80 && r.top < (root.innerHeight || 800) + 40) { top = next[i]; break; }
      }
      return top || (seen(doc.querySelector("details.win")) ? doc.querySelector("details.win") : null);
    }
    if (id === "P2") return pointer ? bot : null;
    if (id === "P3") return seen(doc.querySelector(".bar")) ? doc.querySelector(".bar") : null;
    if (id === "P4") return doc.getElementById("start");
    if (id.charAt(0) === "S" || id === "T4") return bot;
    if (id === "K1") return seen(doc.querySelector(".icons > p")) ? doc.querySelector(".icons > p") : null;
    if (id === "K2") {
      dots = qsa("#start .dots i, .icons .dots i, details.win > summary .dots i");
      return dots.length >= 2 && seen(dots[0]) ? dots : null;
    }
    if (id === "K3") return pickOne(qsa("#start > .tb, details.win > summary"));
    if (id === "K4") return pickOne(qsa("#start.win, details.win"));
    return null;
  }

  function hasPlay(id) { return !!targetFor(id); }

  function clearOne(item) {
    if (!item || item.done) return;
    item.done = true;
    item.el.classList.remove(item.cls);
    var k;
    for (k in item.vars) item.el.style.removeProperty(k);
  }

  function clearAll() {
    while (active.length) clearOne(active.pop());
    if (doc.getElementById("start")) doc.getElementById("start").classList.remove("tb-downhint");
    if (teaseEl && teaseEl.parentNode) teaseEl.parentNode.removeChild(teaseEl);
    teaseEl = null;
  }

  function react(el, cls, ms, vars) {
    if (!el) return;
    var k, item = { el: el, cls: cls, vars: vars || {}, done: false };
    for (k in item.vars) el.style.setProperty(k, item.vars[k]);
    el.classList.add(cls);
    active.push(item);
    var finish = function (ev) {
      if (ev && ev.target !== el) return;
      el.removeEventListener("animationend", finish);
      clearOne(item);
    };
    el.addEventListener("animationend", finish);
    root.setTimeout(function () { finish(); }, ms + 60);
  }

  function lookVars(el, amp, mir) {
    var a = bot.getBoundingClientRect();
    var b = el.getBoundingClientRect ? el.getBoundingClientRect() : a;
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    var dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    return {
      "--lx": (dx / dist * 10 * amp).toFixed(2),
      "--ly": (dy / dist * 6 * amp).toFixed(2),
      "--lr": (dx / dist * 8 * amp * mir).toFixed(2)
    };
  }

  function runPlay(pick, done) {
    var el = targetFor(pick.id);
    if (!el || (api() && api().bit)) { done(); return; }
    var my = ++gen;
    fiddling = true;
    root.__tbBusy = true;
    var vars = { "--tb-amp": String(pick.amp), "--tb-spd": String(pick.spd), "--tb-mir": String(pick.mir), "--tb-side": String(pick.side), "--tb-dur": (pick.ms / 1000).toFixed(3) + "s" };
    var spec = BY_ID[pick.id];
    if (pick.id === "P4") {
      doc.getElementById("start").classList.add("tb-downhint");
      react(bot, "tb-look", pick.ms, lookVars(doc.querySelector("details.win") || bot, pick.amp, pick.mir));
      root.setTimeout(function () {
        var start = doc.getElementById("start");
        if (start) start.classList.remove("tb-downhint");
      }, pick.ms);
    } else if (pick.id === "P1" || pick.id === "P2" || pick.id === "P3" || pick.id === "T2" || pick.id === "X3" || pick.id === "B4") {
      var aim = pick.id === "P2" && pointer
        ? { getBoundingClientRect: function () { return { left: pointer.x, top: pointer.y, width: 0, height: 0 }; } }
        : el;
      react(bot, "tb-look", pick.ms, lookVars(aim, pick.amp, pick.id === "T2" ? -1 : pick.mir));
      if (pick.id !== "P1" && pick.id !== "P2" && pick.id !== "P3") react(el, spec.cls, pick.ms, vars);
    } else if (pick.id === "K2") {
      react(el[0], spec.cls, pick.ms, vars);
      react(el[1], spec.cls, pick.ms, { "--tb-amp": String(pick.amp), "--tb-mir": String(-pick.mir), "--tb-dur": vars["--tb-dur"], "--tb-side": String(-pick.side), "--tb-spd": String(pick.spd) });
    } else if (pick.fam === "SELF" || pick.id === "T4") {
      react(bot, spec.cls, pick.ms, vars);
    } else if (pick.fam === "LOGO" || pick.id === "L1") {
      react(el, spec.cls, pick.ms, vars);
      react(bot, "tb-look", pick.ms, lookVars(el, pick.amp * 0.6, pick.mir));
    } else {
      react(el, spec.cls, pick.ms, vars);
      if (pick.fam === "FOLDS" || pick.fam === "DESK" || pick.fam === "TEXT") react(bot, "tb-look", Math.min(pick.ms, 900), lookVars(el, pick.amp, pick.mir));
    }
    root.setTimeout(function () {
      if (my !== gen) return;
      fiddling = false;
      root.__tbBusy = false;
      var live = api();
      if (live && live.nudge) live.nudge();
      done();
    }, pick.ms);
  }

  function arm(delay) {
    root.clearTimeout(timer);
    if (!pageOk() && delay == null) return;
    var wait = delay == null ? gapFor(Date.now() - lastIn, rng) : delay;
    timer = root.setTimeout(tick, Math.max(40, wait));
  }

  function tick() {
    var live = api();
    // tb13/f3: a slow-frame cooldown (live.perf) is not "off": keep the small reactions and bubbles going.
    // Reduced motion, data saver, the pause button (pageOk) and a hidden tab still stop them as before.
    if (!live || (!live.on && !live.perf) || reduced() || saveData() || (root.innerWidth || 0) < 1100) {
      if (fiddling || dodging || root.__tbBusy) stopAct();
      return;
    }
    if (doc.hidden) return;
    if (!pageOk()) { arm(1500); return; }
    if (Date.now() < resumeAt) { arm(resumeAt - Date.now() + 30); return; }
    var live = api();
    if (live && live.bit) { arm(700); return; }
    if (live && live.an && live.now && live.an() - live.now() < 900) { arm(600); return; }
    var env = envNow();
    env.has = hasPlay;
    env.fiddle = false;
    env.bubble = !!(live && live.bit);
    var pick = choose(state, env, rng);
    if (!pick) { arm(2000); return; }
    commit(state, pick);
    runPlay(pick, function () {
      if (gen !== state._gen && fiddling) return;
      if (rng() < 0.15 && pageOk() && !(api() && api().bit)) {
        var env2 = envNow();
        env2.has = hasPlay;
        env2.fiddle = false;
        env2.bubble = false;
        var second = choose(state, env2, rng);
        if (second && second.fam !== pick.fam) {
          commit(state, second);
          runPlay(second, function () { arm(); });
          return;
        }
      }
      arm();
    });
  }

  function stopAct() {
    gen++;
    fiddling = false;
    dodging = false;
    root.__tbBusy = false;
    bot.classList.remove("tb-dodge");
    bot.style.removeProperty("--dx");
    bot.style.removeProperty("--dy");
    clearAll();
    root.setTimeout(function () {
      var live = api();
      if (live && live.nudge) live.nudge();
    }, 0);
  }

  function noteInput() {
    lastIn = Date.now();
    resumeAt = lastIn + 8000;
    stopAct();
    arm(8000);
  }

  function bubbleParts(w, h) {
    var R = Math.max(12, Math.min(18, Math.round(Math.min(w, h) / 2) - 8));
    var bw = 11, tl = 16, ax = Math.max(R + bw, Math.min(w - R - bw, Math.round(w / 2)));
    var path = "M" + R + " 0H" + (w - R) + "A" + R + " " + R + " 0 0 1 " + w + " " + R + "V" + (h - R) + "A" + R + " " + R + " 0 0 1 " + (w - R) + " " + h + "H" + (ax + bw) + "Q" + (ax + bw * 0.2) + " " + (h + tl * 0.42) + " " + ax + " " + (h + tl) + "Q" + (ax - bw * 0.2) + " " + (h + tl * 0.42) + " " + (ax - bw) + " " + h + "H" + R + "A" + R + " " + R + " 0 0 1 0 " + (h - R) + "V" + R + "A" + R + " " + R + " 0 0 1 " + R + " 0Z";
    return { path: path, vb: "0 0 " + w + " " + (h + tl), th: h + tl };
  }

  function showTease(text) {
    var host = doc.getElementById("start");
    if (!host || doc.querySelector(".tb-say")) return;
    var live = api();
    if (live && live.spend && !live.spend()) return;
    var o = doc.createElement("div");
    o.className = "tb-say tb-say-f tb-say-in";
    o.setAttribute("aria-hidden", "true");
    var p = doc.createElement("p");
    p.className = "tb-say-t";
    p.textContent = text;
    o.appendChild(p);
    host.appendChild(o);
    var w = Math.ceil(o.offsetWidth);
    var ht = Math.ceil(o.offsetHeight);
    var shape = bubbleParts(w, ht);
    var NS = "http://www.w3.org/2000/svg";
    var s = doc.createElementNS(NS, "svg");
    s.setAttribute("class", "tb-say-tail has-g");
    s.setAttribute("viewBox", shape.vb);
    s.setAttribute("focusable", "false");
    s.style.left = "0";
    s.style.top = "0";
    s.style.width = w + "px";
    s.style.height = shape.th + "px";
    var defs = doc.createElementNS(NS, "defs");
    var g = doc.createElementNS(NS, "linearGradient");
    g.setAttribute("id", "tb-say-g");
    g.setAttribute("gradientUnits", "objectBoundingBox");
    g.setAttribute("x1", "0");
    g.setAttribute("y1", "0");
    g.setAttribute("x2", "0.12");
    g.setAttribute("y2", "1");
    function addStops(node, list) {
      list.forEach(function (st) {
        var stop = doc.createElementNS(NS, "stop");
        stop.setAttribute("offset", st[0]);
        stop.setAttribute("stop-color", st[1]);
        if (st.length > 2) stop.setAttribute("stop-opacity", st[2]);
        node.appendChild(stop);
      });
    }
    addStops(g, [["0%", "#ffffff"], ["28%", "#ffe6c4"], ["100%", "#e4ae62"]]);
    var shade = doc.createElementNS(NS, "linearGradient");
    shade.setAttribute("id", "tb-say-shade");
    shade.setAttribute("gradientUnits", "objectBoundingBox");
    shade.setAttribute("x1", "0"); shade.setAttribute("y1", "0"); shade.setAttribute("x2", "0"); shade.setAttribute("y2", "1");
    addStops(shade, [["0%", "#7a3e10", "0"], ["58%", "#7a3e10", "0"], ["100%", "#6a320c", "0.42"]]);
    var sheen = doc.createElementNS(NS, "linearGradient");
    sheen.setAttribute("id", "tb-say-sheen");
    sheen.setAttribute("gradientUnits", "objectBoundingBox");
    sheen.setAttribute("x1", "0"); sheen.setAttribute("y1", "0"); sheen.setAttribute("x2", "0.2"); sheen.setAttribute("y2", "1");
    addStops(sheen, [["0%", "#ffffff", "0.95"], ["20%", "#ffffff", "0.42"], ["46%", "#ffffff", "0"]]);
    var cp = doc.createElementNS(NS, "clipPath");
    cp.setAttribute("id", "tb-say-clip");
    var cpath = doc.createElementNS(NS, "path");
    cpath.setAttribute("d", shape.path);
    cp.appendChild(cpath);
    defs.appendChild(g);
    defs.appendChild(shade);
    defs.appendChild(sheen);
    defs.appendChild(cp);
    function layer(cls, fill) {
      var node = doc.createElementNS(NS, "path");
      node.setAttribute("class", cls);
      node.setAttribute("d", shape.path);
      if (fill) node.style.fill = fill;
      return node;
    }
    s.appendChild(defs);
    s.appendChild(layer("f", "url(#tb-say-g)"));
    s.appendChild(layer("sd", "url(#tb-say-shade)"));
    s.appendChild(layer("sh", "url(#tb-say-sheen)"));
    var hi = layer("h");
    hi.style.clipPath = "url(#tb-say-clip)";
    s.appendChild(hi);
    s.appendChild(layer("s"));
    o.appendChild(s);
    var br = bot.getBoundingClientRect();
    var hr = host.getBoundingClientRect();
    o.style.left = Math.max(8, br.left - hr.left - w - 10) + "px";
    o.style.top = Math.max(48, br.top - hr.top + 4) + "px";
    teaseEl = o;
    root.setTimeout(function () {
      if (teaseEl !== o) return;
      o.classList.remove("tb-say-in");
      o.classList.add("tb-say-out");
      root.setTimeout(function () {
        if (o.parentNode) o.parentNode.removeChild(o);
        if (teaseEl === o) teaseEl = null;
      }, 180);
    }, 1400);
  }

  root.TbFiddle.showTease = showTease;

  function dodgeVector(px, py) {
    var br = bot.getBoundingClientRect();
    var hero = doc.getElementById("start");
    var hr = hero ? hero.getBoundingClientRect() : br;
    var cx = br.left + br.width / 2;
    var cy = br.top + br.height / 2;
    var dx = cx - px;
    var dy = cy - py;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var dist = 30 + rng() * 30;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { dx = px > cx ? -1 : 1; dy = -0.15; len = Math.sqrt(dx * dx + dy * dy); }
    var mx = dx / len * dist;
    var my = dy / len * dist * 0.45;
    var boxL = hr.right - 12;
    var boxR = (root.innerWidth || hr.right) - 8;
    var boxT = hr.top + 8;
    var boxB = hr.bottom - 8;
    if (br.left + mx < boxL) mx += boxL - (br.left + mx);
    if (br.right + mx > boxR) mx -= br.right + mx - boxR;
    if (br.top + my < boxT) my += boxT - (br.top + my);
    if (br.bottom + my > boxB) my -= br.bottom + my - boxB;
    return { x: mx, y: my };
  }

  function startDodge(e) {
    var my = ++gen;
    dodging = true;
    root.__tbBusy = true;
    var v = dodgeVector(e.clientX, e.clientY);
    bot.style.setProperty("--dx", v.x.toFixed(1) + "px");
    bot.style.setProperty("--dy", v.y.toFixed(1) + "px");
    bot.classList.add("tb-dodge");
    root.setTimeout(function () {
      if (my !== gen) return;
      if (rng() < 0.5) react(bot, "tb-wave", 900, { "--tb-dur": ".9s", "--tb-amp": "1", "--tb-mir": "1" });
      else react(bot, "tb-nope", 700, { "--tb-dur": ".7s", "--tb-amp": "1", "--tb-mir": "1" });
      if (rng() < 1 / 3) showTease("too slow!");
    }, 260);
    root.setTimeout(function () {
      if (my !== gen) return;
      bot.style.setProperty("--dx", "0px");
      bot.style.setProperty("--dy", "0px");
    }, 1200);
    root.setTimeout(function () {
      if (my !== gen) return;
      dodging = false;
      root.__tbBusy = false;
      bot.classList.remove("tb-dodge");
      bot.style.removeProperty("--dx");
      bot.style.removeProperty("--dy");
      var live = api();
      if (live && live.nudge) live.nudge();
    }, 1500);
  }

  function onPointerDown(e) {
    var t = e.target;
    var grab = t && t.closest && t.closest(".tb-grab, .tb-grab-fly");
    if (grab) {
      var live = api();
      var env = envNow();
      env.pointer = e.pointerType || "";
      env.rest = !!(live && live.state === "rest");
      env.bit = !!(live && live.bit);
      env.fiddle = fiddling || dodging;
      env.drag = !!(live && live.hold);
      env.now = Date.now();
      var decision = decideDodge(grabSt, env, rng);
      if (decision.dodge) {
        noteGrab(grabSt, true, env.now);
        e.preventDefault();
        e.stopPropagation();
        lastIn = env.now;
        resumeAt = lastIn + 8000;
        if (fiddling) stopAct();
        startDodge(e);
        arm(8000);
        return;
      }
      noteGrab(grabSt, false, env.now);
    }
    noteInput();
  }

  function bindInput() {
    ["keydown", "wheel", "scroll", "touchstart", "selectionchange", "focusin", "pointerup", "pointercancel"].forEach(function (type) {
      doc.addEventListener(type, noteInput, true);
    });
    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      pointer = { x: e.clientX, y: e.clientY };
    }, { passive: true });
    doc.addEventListener("visibilitychange", function () {
      if (doc.hidden) stopAct();
      else arm(400);
    });
    root.addEventListener("resize", function () {
      if ((root.innerWidth || 0) < 1100) stopAct();
      else arm(500);
    }, { passive: true });
    if (root.matchMedia) {
      var mq = root.matchMedia("(prefers-reduced-motion: reduce)");
      var onMq = function () { if (mq.matches) stopAct(); else arm(500); };
      if (mq.addEventListener) mq.addEventListener("change", onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }
    if (root.IntersectionObserver) {
      var seenHero = false;
      var hero = doc.getElementById("start") || bot;
      var io = new root.IntersectionObserver(function (entries) {
        var last = entries[entries.length - 1];
        vis = !!(last && last.isIntersecting && last.intersectionRatio >= 0.2);
        var live = api();
        if (live && live.vis === false) { stopAct(); return; }
        if (!vis && !(live && live.vis)) { stopAct(); return; }
        if (!seenHero) { seenHero = true; arm(4000 + rng() * 5000); }
        else arm(400);
      }, { threshold: [0, 0.2] });
      io.observe(hero);
    } else {
      vis = true;
      arm(4000 + rng() * 5000);
    }
  }

  bindInput();
})(typeof window !== "undefined" ? window : this);
