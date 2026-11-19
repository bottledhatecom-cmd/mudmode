/* tylerbot-phone ph1: desktop-style highlights for the phone Tylerbot (widths under 1100 px). A small add-on to tylerbot-rig.js (rg2 peek).
   What it does on phones (the same targets the desktop scripts use: tylerbot-fiddle.js, tylerbot-mmcue.js, the data-tyler-show lines, and the fold-open glow):
   (The title gets tb-trace, not tb-hl: play.css also uses .tb-hl for its fixed highlight box.)
   1. Rest spot: when scrolling stops he checks that he is not covering text, a link, a button or a picture. If he is, he slides to the
      first clear spot (bottom-left, then higher up either edge); if none is clear he ducks so only his head peeks up. CSS "translate" only,
      so the rig's own transform is untouched.
   2. Highlights: every so often, while the page is still, he leans toward something on screen and points a short glow line at it; the target gets
      the same reaction class it gets on desktop plus a soft gold ring. Never a target under him, never one partly off screen.
   3. Fold open (details.win / details.flow): he leans and points, and the fold gets the same warm glow as on desktop (tb-burst classes).
   4. Speech bubble: only if #tb-say loses data-off (it is off site-wide today). When on, it is clamped inside the screen with 8 px margins.
   Never on desktop (1100 px and up), under reduced motion (only the static fold glow, like desktop), with data saver, in a hidden tab, or while the
   ticker pause button is on. No network, no storage, no art, no inline style attributes (CSSOM only). Everything added is aria-hidden and pointer-events:none.
   Optional: remove this file and the phone peek works as in rg2. */
(function () {
  'use strict';
  var win = window, doc = document;
  if (!doc.querySelector || !win.matchMedia || !win.requestAnimationFrame || !doc.elementsFromPoint) return;
  var root = doc.documentElement;
  var NARROW = win.matchMedia('(max-width: 1099.98px)'), RM = win.matchMedia('(prefers-reduced-motion: reduce)');
  var T0 = Date.now(), lastScroll = 0, timer = 0, stopT = 0, busy = false, count = 0, lastBurst = -1e9, spot = [0, 0], last = null, says = 0;
  var MARGIN = 8, SIDE = 6;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function narrow() { return NARROW.matches; }
  function reduced() { return RM.matches; }
  function saveData() { var c = win.navigator && win.navigator.connection; return !!(c && c.saveData); }
  function paused() { return !root.classList.contains('tk-on'); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function later(fn, ms) { return win.setTimeout(fn, ms); }
  function vw() { return root.clientWidth || win.innerWidth || 375; }
  function vh() { return win.innerHeight || 700; }
  function peek() { return doc.querySelector('canvas.tb-rig-peek'); }
  function peekOn(p) {
    if (!p || (p.classList.contains('tb-peek-off') && !p.classList.contains('tb-ph-clear')) || p.style.display === 'none') return false;
    var cs = win.getComputedStyle(p); return cs.display !== 'none' && cs.visibility !== 'hidden';
  }
  function hit(a, b, pad) { pad = pad || 0; return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad; }
  function box(l, t, w, h) { return { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h }; }

  /* ---------- 1. rest spot: never sit on content ---------- */
  // Spots, in order: the rg2 corner (bottom-right), bottom-left, then higher up either edge (12 px steps, up to 35% of the screen),
  // and last a duck in either corner (only his head and antennas show). The first spot with nothing under him wins; if none is clear,
  // the spot with the least content under him wins (ducks count first on a tie).
  var CONTROL = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL|IMG|SVG|VIDEO|CANVAS|IFRAME|PICTURE)$/, cache = null;
  function spotsFor(p) {
    var w = p.offsetWidth || 70, h = p.offsetHeight || 72, dx = -(vw() - w - 2 * SIDE), duck = h - 26, out = [[0, 0], [dx, 0]], up;
    for (up = 12; up <= vh() * .35; up += 12) { out.push([0, -up]); out.push([dx, -up]); }
    out.push([0, duck]); out.push([dx, duck]); return out;
  }
  function baseRect(p) { // where he would be with no phone offset (rg2 spot, right:6px; bottom:10px)
    var w = p.offsetWidth || 70, h = p.offsetHeight || 72; return box(vw() - SIDE - w, vh() - 10 - h, w, h);
  }
  function mine(el) { var c = el.className; c = c && c.baseVal !== undefined ? c.baseVal : c; return typeof c === 'string' && /\btb-(rig|ph-)/.test(c); }
  function textRects(el) { // line boxes of the text inside el (cached per check)
    var i, hitEl = cache.els.indexOf(el); if (hitEl >= 0) return cache.rects[hitEl];
    var out = [], tw = doc.createTreeWalker(el, 4 /* SHOW_TEXT */, null), n, k = 0, rg = doc.createRange(), rs, j;
    while ((n = tw.nextNode()) && k++ < 200) {
      if (!/\S/.test(n.nodeValue)) continue;
      rg.selectNodeContents(n); rs = rg.getClientRects();
      for (j = 0; j < rs.length; j++) if (rs[j].width > 0) out.push(rs[j]);
    }
    cache.els.push(el); cache.rects.push(out); return out;
  }
  function busyAt(px, py) { // is there text, a link, a button or a picture at this point?
    var key = Math.round(px) + ',' + Math.round(py); if (key in cache.pts) return cache.pts[key];
    var els = doc.elementsFromPoint(px, py), el = null, i, r, cell = box(px - 9, py - 9, 18, 18), res = false;
    for (i = 0; i < els.length; i++) if (!mine(els[i])) { el = els[i]; break; }
    if (el && el !== doc.body && el !== root) {
      if (CONTROL.test(el.tagName.toUpperCase()) || (el.closest && el.closest('a,button,summary,label,.btn,svg'))) res = true;
      else { r = textRects(el); for (i = 0; i < r.length; i++) if (hit(r[i], cell)) { res = true; break; } }
    }
    cache.pts[key] = res; return res;
  }
  function score(R) {
    var x, y, n = 0;
    for (y = 0; y < 5; y++) for (x = 0; x < 5; x++) { // 5 x 5 points, each one stands for a 16 px cell
      var px = R.left + 6 + (R.width - 12) * x / 4, py = R.top + 6 + (R.height - 12) * y / 4;
      if (px < 0 || py < 0 || px >= vw() || py >= vh()) continue;
      if (busyAt(px, py)) n++;
    }
    return n;
  }
  function setSpot(p, xy) {
    spot = xy; p.style.setProperty('translate', xy[0] + 'px ' + xy[1] + 'px');
    p.classList.toggle('tb-ph-duck', xy[1] > 0);
    // the rg2 rule, applied at once for the new spot (the rig re-checks it on its next frame): fade while on the setup question
    var keep = q('#start fieldset'), b = baseRect(p), R = box(b.left + xy[0], b.top + xy[1], b.width, b.height);
    if (keep) { var k = keep.getBoundingClientRect(); p.classList.toggle('tb-peek-off', k.bottom > R.top - 8 && k.top < R.bottom + 8 && k.right > R.left - 8 && k.left < R.right + 8); }
  }
  function pickSpot() {
    var p = peek(); if (!p) return;
    if (!narrow() || reduced()) { p.style.removeProperty('translate'); p.classList.remove('tb-ph-clear'); spot = [0, 0]; return; }
    var b = baseRect(p), list = spotsFor(p), i, xy, n, best = null, bestN = 1e9, R;
    cache = { els: [], rects: [], pts: {} };
    for (i = 0; i < list.length; i++) {
      xy = list[i]; R = box(b.left + xy[0], b.top + xy[1], b.width, xy[1] > 0 ? vh() - b.top - xy[1] : b.height); // a duck only shows his head
      if (R.top < 60) continue; // keep clear of the header/ticker area
      n = score(R);
      if (n === 0) { best = xy; bestN = 0; break; }
      if (xy[1] > 0 && n < bestN) { best = xy; bestN = n; } // nothing is clear: duck in the corner with the least under him
    }
    cache = null;
    if (best && (best[0] !== spot[0] || best[1] !== spot[1])) setSpot(p, best);
    // rg2 fades him over the setup question; a spot that is fully clear may sit on its empty space and stay visible
    p.classList.toggle('tb-ph-clear', bestN === 0);
    return bestN;
  }

  /* ---------- 2. highlights (same targets and classes as desktop) ---------- */
  function q(s) { return doc.querySelector(s); }
  function qa(s) { return Array.prototype.slice.call(doc.querySelectorAll(s)); }
  var FAMS = [
    { id: 'SHOW', get: function () { return qa('[data-tyler-show]'); }, cls: ['tb-trace'] },
    { id: 'LOGO', get: function () { return [q('.bar .brand img') || q('.bar .brand')]; }, cls: ['tb-poke', 'tb-spin', 'tb-wobble'] },
    { id: 'TICKER', get: function () { return q('.tkbar.tk-paused') ? [] : [q('.tkbar .ticker')]; }, cls: ['tb-jog', 'tb-pinch'] },
    { id: 'FOLDS', get: function () { return qa('details.win:not([open]) > summary'); }, cls: ['tb-tug', 'tb-knock', 'tb-edge'] },
    { id: 'BUTTONS', get: function () { return qa('.tkbar .btn, #start .btn, a.btn'); }, cls: ['tb-squash', 'tb-shine', 'tb-leanb'] },
    { id: 'KIT', get: function () { return qa('a[download], a[href*="starter-kit"]'); }, cls: ['tb-point'] },
    { id: 'TITLE', get: function () { return [q('h1#h-main')]; }, cls: ['tb-trace'] },
    { id: 'LINKS', get: function () { return qa('#start a.hl, .bar a.hl, #start .lede a'); }, cls: ['tb-ulink'] },
    { id: 'SUB', get: function () { return [q('.hero-sub')]; }, cls: ['tb-nod'] },
    { id: 'MOTTO', get: function () { return [q('.hero-motto')]; }, cls: ['tb-trace'] },
    { id: 'DESK', get: function () { return qa('.icons > p'); }, cls: ['tb-boop'] },
    { id: 'WIN', get: function () { return qa('#start > .tb, details.win > summary'); }, cls: ['tb-shake'] },
    { id: 'METER', get: function () { return [q('.bar .note a[href="meter/"]')]; }, cls: ['tb-mmglow'] }
  ];
  function usable(el, me) {
    if (!el || !el.getBoundingClientRect) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.top < MARGIN || r.bottom > vh() - MARGIN || r.left < 0 || r.right > vw()) return null;
    if (me && hit(r, me, 10)) return null;
    var cs = win.getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return null;
    return r;
  }
  function choose(me) {
    var all = [], f, i, list;
    for (f = 0; f < FAMS.length; f++) {
      list = FAMS[f].get();
      for (i = 0; i < list.length; i++) if (list[i] && list[i] !== last && usable(list[i], me)) all.push({ el: list[i], fam: FAMS[f] });
    }
    if (!all.length) return null;
    var show = all.filter(function (a) { return a.fam.id === 'SHOW'; });
    if (count === 0 && show.length) return show[rnd(show.length)]; // like desktop: the first one is a "what this is" line when one is on screen
    return all[rnd(all.length)];
  }
  function react(el, cls, ms, vars) {
    var k; vars = vars || {}; for (k in vars) el.style.setProperty(k, vars[k]);
    el.classList.add(cls);
    later(function () { el.classList.remove(cls); for (k in vars) el.style.removeProperty(k); }, ms + 60);
  }
  function lean(p, r, ms) { // he turns toward the target (CSS rotate, independent of the rig's transform)
    var me = p.getBoundingClientRect(), dx = (r.left + r.width / 2) - (me.left + me.width / 2), dy = (r.top + r.height / 2) - (me.top + me.height / 2), d = Math.max(1, Math.hypot(dx, dy));
    react(p, 'tb-ph-look', ms, { '--tb-dur': (ms / 1000).toFixed(2) + 's', '--lr': (dx / d * 9).toFixed(2), '--lx': (dx / d * 6).toFixed(2), '--ly': (Math.min(0, dy / d) * 4).toFixed(2) });
  }
  function beam(p, r, ms) { // a short glow line from his hand to the nearest edge of the target
    var me = p.getBoundingClientRect(), hx = me.left + me.width * (r.left + r.width / 2 < me.left ? .22 : .78), hy = me.top + me.height * .52;
    var tx = clamp(hx, r.left + 4, r.right - 4), ty = clamp(hy, r.top + 2, r.bottom - 2), dx = tx - hx, dy = ty - hy, len = Math.hypot(dx, dy);
    if (len < 24) return;
    var b = doc.createElement('div'); b.className = 'tb-ph-beam'; b.setAttribute('aria-hidden', 'true');
    b.style.left = hx + 'px'; b.style.top = hy + 'px'; b.style.width = (len - 6).toFixed(1) + 'px';
    b.style.setProperty('--a', Math.atan2(dy, dx).toFixed(4) + 'rad'); b.style.setProperty('--tb-dur', (ms / 1000).toFixed(2) + 's');
    doc.body.appendChild(b); later(function () { if (b.parentNode) b.parentNode.removeChild(b); }, ms + 80);
  }
  var ringEl = null, ringGen = 0;
  function ring(r, ms) {
    if (!ringEl) { ringEl = doc.createElement('div'); ringEl.className = 'tb-ph-ring'; ringEl.setAttribute('aria-hidden', 'true'); doc.body.appendChild(ringEl); }
    ringEl.style.left = (r.left - 4) + 'px'; ringEl.style.top = (r.top - 4) + 'px'; ringEl.style.width = (r.width + 8) + 'px'; ringEl.style.height = (r.height + 8) + 'px';
    var my = ++ringGen; ringEl.classList.add('tb-ph-on'); later(function () { if (my === ringGen) ringEl.classList.remove('tb-ph-on'); }, ms);
  }
  function dropRing() { if (ringEl) ringEl.classList.remove('tb-ph-on'); var b = doc.querySelectorAll('.tb-ph-beam'), i; for (i = 0; i < b.length; i++) b[i].parentNode.removeChild(b[i]); }
  function calm(p) {
    return narrow() && !reduced() && !saveData() && !doc.hidden && !paused() && !busy && peekOn(p) && Date.now() - lastScroll > 1200;
  }
  function highlight(force) {
    var p = peek(); if (!p || !(force ? narrow() && !reduced() && peekOn(p) && !busy : calm(p))) return false;
    var me = p.getBoundingClientRect(), pick = choose(me); if (!pick) return false;
    var el = pick.el, r = el.getBoundingClientRect(), cls = pick.fam.cls[rnd(pick.fam.cls.length)], ms = 1400;
    busy = true; win.__tbBusy = true; last = el; count++;
    lean(p, r, ms); beam(p, r, 900); ring(r, ms);
    react(el, cls, 900, { '--tb-dur': '.9s', '--tb-amp': '1', '--tb-mir': r.left + r.width / 2 < me.left ? '-1' : '1' });
    if (count % 3 === 1) say(p);
    later(function () { busy = false; win.__tbBusy = false; }, ms);
    return { fam: pick.fam.id, cls: cls, tag: el.tagName.toLowerCase(), rect: [r.left, r.top, r.width, r.height].map(Math.round) };
  }
  function arm(ms) { win.clearTimeout(timer); timer = later(tick, ms); }
  function tick() {
    if (!narrow()) return;
    if (highlight()) arm(12000 + rnd(12000)); else arm(2500);
  }

  /* ---------- 3. fold open: same glow as desktop, plus a lean and a point ---------- */
  function glowOnly(d, delay) { later(function () { d.classList.add('tb-burst'); }, delay); later(function () { d.classList.add('tb-burst-fade'); d.classList.remove('tb-burst'); }, 2100); later(function () { d.classList.remove('tb-burst-fade'); }, 3100); }
  function staticGlow(d) { d.classList.add('tb-burst'); later(function () { d.classList.add('tb-burst-fade'); d.classList.remove('tb-burst'); }, 700); later(function () { d.classList.remove('tb-burst-fade'); }, 1700); }
  function onToggle(e) {
    var d = e.target; if (!narrow() || !d || !d.matches || !d.matches('details.win, details.flow') || !d.open) return;
    var t = Date.now(); if (t - T0 < 900 || t - lastBurst < 600) return; lastBurst = t;
    if (reduced()) { staticGlow(d); return; }
    if (paused()) return;
    var p = peek(), s = d.querySelector('summary') || d;
    if (p && peekOn(p) && !busy) { var r = s.getBoundingClientRect(); if (r.bottom > 0 && r.top < vh()) { lean(p, r, 1200); beam(p, r, 900); } }
    glowOnly(d, 250);
  }

  /* ---------- 4. speech bubble (only when #tb-say has no data-off) ---------- */
  function say(p) {
    var tpl = doc.getElementById('tb-say'); if (!tpl || tpl.hasAttribute('data-off') || !tpl.content) return;
    var lines = tpl.content.querySelectorAll('p'); if (!lines.length) return;
    var old = q('.tb-ph-say'); if (old) old.parentNode.removeChild(old);
    var b = doc.createElement('div'); b.className = 'tb-ph-say'; b.setAttribute('aria-hidden', 'true'); b.textContent = lines[says++ % lines.length].textContent;
    b.style.setProperty('max-width', Math.min(240, vw() - 2 * MARGIN) + 'px'); doc.body.appendChild(b);
    var me = p.getBoundingClientRect(), bw = b.offsetWidth, bh = b.offsetHeight, left, top, side = 'up';
    top = me.top - bh - 10; left = clamp(me.left + me.width / 2 - bw / 2, MARGIN, vw() - MARGIN - bw);
    if (top < MARGIN) { side = 'side'; top = clamp(me.top + me.height / 2 - bh / 2, MARGIN, vh() - MARGIN - bh); left = me.left > vw() / 2 ? me.left - bw - 10 : me.right + 10; left = clamp(left, MARGIN, vw() - MARGIN - bw); }
    b.style.left = left + 'px'; b.style.top = top + 'px'; b.style.setProperty('--tail', clamp(me.left + me.width / 2 - left, 14, bw - 14) + 'px'); b.classList.add('tb-ph-' + side);
    later(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 3200);
  }

  /* ---------- boot ---------- */
  function onScroll() {
    lastScroll = Date.now(); dropRing(); var pk = peek(); if (pk) pk.classList.remove('tb-ph-clear'); var s = q('.tb-ph-say'); if (s) s.parentNode.removeChild(s);
    win.clearTimeout(stopT); stopT = later(pickSpot, 260);
  }
  function onMode() {
    var p = peek();
    if (!narrow() || reduced()) { win.clearTimeout(timer); dropRing(); if (p) { p.style.removeProperty('translate'); p.classList.remove('tb-ph-duck', 'tb-ph-look'); } spot = [0, 0]; return; }
    later(pickSpot, 300); arm(6000 + rnd(3000));
  }
  doc.addEventListener('toggle', onToggle, true);
  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', function () { win.clearTimeout(stopT); stopT = later(pickSpot, 260); }, { passive: true });
  if (NARROW.addEventListener) { NARROW.addEventListener('change', onMode); RM.addEventListener('change', onMode); } else if (NARROW.addListener) { NARROW.addListener(onMode); RM.addListener(onMode); }
  // the peek canvas is made by tylerbot-rig.js after load; check its spot once it exists
  var tries = 0; (function wait() { if (peek()) { onMode(); return; } if (tries++ < 40) later(wait, 500); })();
  // test hook (read-only state plus "do one now"); same idea as window.__tb()
  win.__tbPhone = function () { return { narrow: narrow(), spot: spot, busy: busy, count: count, on: peekOn(peek()) }; };
  win.__tbPhone.now = function () { return highlight(true); };
  win.__tbPhone.spot = function () { var n = pickSpot(); return { at: spot, under: n }; };
})();
