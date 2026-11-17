/* mudschool poker trainer: small code-drawn effects.
   No images, no network, no fonts. Light on phones: CSS animations on transform and opacity only, at most 40 effect
   pieces on screen at once, every piece removed when it is done, nothing left running on an idle screen.
   Reduced motion (the player's system setting) turns every effect off; sounds stay in sound.js (its mute rules). */
(function (root) {
  'use strict';
  var doc = root.document, MAX = 40, layer = null, mq = null;
  try { mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { mq = null; }
  var COLORS = {
    ok: ['#39ff88', '#19f0ff', '#eef3ff', '#39ff88'],
    gold: ['#ffe14d', '#ff9a3c', '#fff3a0', '#ffe14d'],
    pink: ['#ff2bd6', '#ffe14d', '#9d6bff', '#ff2bd6'],
    party: ['#19f0ff', '#ff2bd6', '#ffe14d', '#39ff88', '#9d6bff']
  };
  function on() { return !!(doc && doc.body && !(mq && mq.matches)); }
  function getLayer() {
    if (layer && layer.parentNode) return layer;
    layer = doc.createElement('div'); layer.className = 'fx-layer'; layer.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(layer); return layer;
  }
  function room() { return MAX - (layer && layer.parentNode ? layer.children.length : 0); }
  /* where: an element, or a point {x, y} in the window; falls back to the upper middle of the screen */
  function spot(where) {
    var w = root.innerWidth || 375, h = root.innerHeight || 700;
    if (where && typeof where.x === 'number' && typeof where.y === 'number') return { x: where.x, y: where.y, w: where.w || 0, h: where.h || 0 };
    if (where && where.getBoundingClientRect) {
      var r = where.getBoundingClientRect();
      if (r && (r.width || r.height)) return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top };
    }
    return { x: w / 2, y: h * 0.35, w: 0, h: 0 };
  }
  function piece(cls, x, y, css) {
    var n = doc.createElement('i'); n.className = cls;
    n.style.cssText = 'left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;' + (css || '');
    return n;
  }
  /* adds the pieces and removes them all with one timer when their longest animation is over */
  function add(list, ms) {
    if (!list.length) return;
    var L = getLayer();
    list.forEach(function (n) { L.appendChild(n); });
    setTimeout(function () { list.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); }, ms + 80);
  }
  /* a soft spray of dots and sparkles from a spot; opt: kind (ok, gold, pink, party), n, spread, ring */
  function burst(where, opt) {
    if (!on()) return;
    opt = opt || {};
    var p = spot(where), cols = COLORS[opt.kind] || COLORS.ok, n = Math.min(opt.n || 14, room()), spread = opt.spread || 70, list = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = spread * (0.55 + Math.random() * 0.55);
      var dx = Math.cos(a) * d, dy = Math.sin(a) * d - spread * 0.25, size = 5 + Math.random() * 5, dur = 520 + Math.random() * 260;
      list.push(piece('fx-p' + (i % 3 === 0 ? ' fx-star' : ''), p.x, p.y,
        '--dx:' + dx.toFixed(1) + 'px;--dy:' + dy.toFixed(1) + 'px;--c:' + cols[i % cols.length] + ';width:' + size.toFixed(1) + 'px;height:' + size.toFixed(1) + 'px;animation-duration:' + Math.round(dur) + 'ms'));
    }
    if (opt.ring !== false && p.w && room() > list.length) {
      var r = piece('fx-ring', p.x - p.w / 2, p.y - p.h / 2, 'width:' + Math.round(p.w) + 'px;height:' + Math.round(p.h) + 'px;--c:' + cols[0]);
      list.push(r);
    }
    add(list, 820);
  }
  /* "+10 XP" style text that floats up from where it was earned. text: a string (coloured by kind: xp, chips, combo)
     or a list of [text, kind] parts shown side by side in one pop (so two pops never sit on top of each other).
     The pop is kept inside the screen by its estimated width (no layout read). */
  function pop(text, where, kind) {
    if (!on() || room() < 1) return;
    var parts = Array.isArray(text) ? text : [[String(text), kind || 'xp']], w = root.innerWidth || 375;
    var est = parts.reduce(function (a, t) { return a + String(t[0]).length; }, 0) * 12 + (parts.length - 1) * 10;
    var p = spot(where), x = Math.max(est / 2 + 8, Math.min(w - est / 2 - 8, p.x)), y = p.t != null ? p.t + 4 : p.y;
    var n = piece('fx-pop', x, y);
    parts.forEach(function (t, i) {
      var s = doc.createElement('span'); s.className = 'fx-pop-' + (t[1] || 'xp'); s.textContent = (i ? ' ' : '') + t[0]; n.appendChild(s);
    });
    add([n], 1150);
  }
  /* a soft coloured edge over the whole screen: bad (red, a wrong answer) or ok (green) */
  function flash(kind) {
    if (!on() || room() < 1) return;
    add([piece('fx-vig fx-vig-' + (kind || 'bad'), 0, 0)], 480);
  }
  /* restarts a one-shot CSS animation class on an element (one style read, only on these moments) */
  function kick(el, cls, ms) {
    if (!on() || !el || !el.classList) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(function () { if (el.classList) el.classList.remove(cls); }, ms);
  }
  function shake(el) { kick(el || doc.getElementById('app'), 'fx-shake', 520); }
  function bump(el) { kick(el, 'fx-bump', 420); }
  /* code-drawn confetti from the top, about 1.5 s; opt: n (up to 36) */
  function confetti(opt) {
    if (!on()) return;
    opt = opt || {};
    // leaves a few places free for the "+XP" pop and a ring that may come with it
    var w = root.innerWidth || 375, h = root.innerHeight || 700, n = Math.min(opt.n || 34, 36, room() - 4), cols = COLORS.party, list = [], longest = 0;
    for (var i = 0; i < n; i++) {
      var x = (i + Math.random()) / n * w, dur = 1100 + Math.random() * 700, del = Math.random() * 300;
      longest = Math.max(longest, dur + del);
      list.push(piece('fx-cf' + (i % 4 === 0 ? ' fx-cf-dot' : ''), x, -14,
        '--fy:' + Math.round(h * (0.55 + Math.random() * 0.4)) + 'px;--dx:' + Math.round((Math.random() - 0.5) * 120) + 'px;--r:' + Math.round(360 + Math.random() * 540) + 'deg;--c:' + cols[i % cols.length] +
        ';animation-duration:' + Math.round(dur) + 'ms;animation-delay:' + Math.round(del) + 'ms'));
    }
    add(list, longest);
  }
  /* a level-test pass or a big win: confetti, a gold burst at the spot, a gentle shake */
  function celebrate(where, opt) {
    if (!on()) return;
    opt = opt || {};
    // pops still floating from the screen before (the last answer) would cover the result: take them away first
    if (layer) [].slice.call(layer.querySelectorAll('.fx-pop')).forEach(function (n) { n.parentNode.removeChild(n); });
    burst(where, { kind: 'gold', n: 12, spread: 90, ring: false });
    confetti({ n: opt.n || 26 });
    if (opt.shake) shake();
  }
  /* empties the effect layer (a screen change can call this) */
  function clear() { if (layer) while (layer.firstChild) layer.removeChild(layer.firstChild); }
  /* buttons squish and spring back on tap */
  if (doc && doc.addEventListener) doc.addEventListener('pointerdown', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && !b.disabled) kick(b, 'fx-tap', 340);
  }, { passive: true });
  root.FX = { on: on, burst: burst, pop: pop, flash: flash, shake: shake, bump: bump, confetti: confetti, celebrate: celebrate, clear: clear };
})(this);
