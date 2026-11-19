/* tylerbot-rig rg2: the moving Tylerbot (cut-out rig, Canvas 2D). One robot: he sits in the hero spot, follows the page while you scroll,
   lands back in the hero, and fires a short photon burst when an explainer fold (details.win / details.flow) is opened.
   No network except one same-origin atlas image, no storage, no inline styles (CSSOM only). Off under reduced motion (static glow only on fold open).
   Phones and narrow screens (under 1100 px) get a small peek only (rg2: the whole robot, fully on screen, and he steps aside while the setup question is under him). Everything is aria-hidden and pointer-events:none.
   Optional: with this file removed the hero shows its still image and the page is unchanged. window.__tb() keeps its shape. */
(function () {
  'use strict';
  var win = window, doc = document, hero = doc.querySelector('[data-tyler-play]');
  if (!hero || !win.matchMedia || !win.HTMLCanvasElement || !win.requestAnimationFrame) return;
  var BASE = hero.getAttribute('data-tyler-play') || '';
  if (!/^(?:[a-z0-9_-]+\/)*$/i.test(BASE)) return;
  var ATLAS_URL = BASE + 'tylerbot-rig-atlas.webp?v=rg1';
  var D = {"atlas":[760,444],"parts":[["shinN",1,193,365,-6,36,151,345,63,55,226,376],["thighN",3,236,346,-12,12,173,321,91,65,68,376],["footN",0,150,390,-14,14,106,350,60,91,254,239],["torso",-1,268,330,-30,30,200,212,167,159,587,2],["thighR",3,305,326,-30,25,286,282,67,73,408,239],["shinR",4,346,316,-8,35,314,282,83,133,2,239],["footR",5,330,397,-20,20,308,391,109,55,293,376],["upperR",3,374,196,-45,55,343,176,72,67,652,239],["forearmR",7,402,214,-25,25,398,184,62,66,2,376],["handR",8,406,226,-20,20,401,205,59,57,163,376],["cape",3,0,0,0,0,10,82,362,233,2,2],["antR",13,335,68,-45,45,334,25,44,43,465,376],["antL",13,240,70,-45,45,198,18,55,47,406,376],["head",3,292,226,-30,30,174,59,215,175,368,2],["upperN",3,200,252,-35,45,169,223,70,104,89,239],["handN",16,199,396,-15,15,163,376,86,81,318,239],["forearmN",14,198,311,-15,25,150,298,87,101,163,239],["sparks",-1,0,0,0,0,102,396,169,68,479,239]]};
  var RM = win.matchMedia('(prefers-reduced-motion: reduce)'), WIDE = win.matchMedia('(min-width: 1100px)');
  var root = doc.documentElement, now = function () { return win.performance.now(); };
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ---------- rig data ---------- */
  var NP = D.parts.length, P = [], IDX = {}, i, j;
  for (i = 0; i < NP; i++) { var q = D.parts[i]; P.push({ n: q[0], par: q[1], px: q[2], py: q[3], lo: q[4], hi: q[5], bx: q[6], by: q[7], bw: q[8], bh: q[9], ax: q[10], ay: q[11], kids: [] }); IDX[q[0]] = i; }
  for (i = 0; i < NP; i++) if (P[i].par >= 0) P[P[i].par].kids.push(i);
  var TORSO = IDX.torso, CAPE = IDX.cape, SPARKS = IDX.sparks, HEAD = IDX.head;
  var FKO = [], seen = {};
  function visit(k) { if (seen[k]) return; seen[k] = 1; if (P[k].par >= 0) visit(P[k].par); FKO.push(k); }
  for (i = 0; i < NP; i++) visit(i);
  // joint spring constants (k, c) and inertial gain by part name; bone direction (pivot -> child pivot or box centre) in still px
  var KC = { torso: [55, 9, 0], head: [60, 9, .6], antL: [120, 4, 1.6], antR: [120, 4, 1.6], upperN: [45, 7, 1], upperR: [45, 7, 1], forearmN: [35, 6, 1], forearmR: [35, 6, 1], handN: [30, 5, .8], handR: [30, 5, .8], thighR: [55, 8, .4], shinR: [40, 7, .4], footR: [50, 8, .3], thighN: [55, 8, .4], shinN: [40, 7, .4], footN: [50, 8, .3] };
  for (i = 0; i < NP; i++) {
    var p = P[i], kc = KC[p.n] || [50, 8, 0]; p.k = kc[0]; p.c = kc[1]; p.g = kc[2];
    var dx, dy; if (p.kids.length) { var kd = P[p.kids[0]]; dx = kd.px - p.px; dy = kd.py - p.py; } else { dx = p.bx + p.bw / 2 - p.px; dy = p.by + p.bh / 2 - p.py; }
    var L = Math.hypot(dx, dy) || 1; p.dx = dx / L; p.dy = dy / L; p.L = L;
  }
  // poses (degrees, clockwise positive on screen, in the figure's own frame) + root [rot, sx, sy]
  function pose(o) { var a = new Float32Array(NP); for (var k in o) if (IDX[k] != null) a[IDX[k]] = o[k]; return a; }
  var POSE = {
    zero: pose({}),
    relax: pose({ torso: -2, head: -3, upperN: -18, forearmN: -4, handN: 0, upperR: -12, forearmR: -8, handR: 0, thighR: -6, shinR: 4, thighN: 2, shinN: 6, footN: -3, antL: 4, antR: 3 }),
    fall: pose({ torso: 6, head: -12, upperN: -35, forearmN: 8, handN: 0, upperR: -14, forearmR: -10, handR: 0, thighR: -22, shinR: 34, footR: 18, thighN: 6, shinN: 24, footN: -6, antL: -25, antR: -25 }),
    rise: pose({ torso: -8, head: -8, upperN: 22, forearmN: 25, handN: 15, upperR: 55, forearmR: 25, handR: 10, thighR: -8, shinR: 26, footR: 20, thighN: 6, shinN: 22, footN: -6, antL: 15, antR: 15 }),
    stop: pose({ torso: 10, head: 14, upperN: -35, forearmN: 8, handN: 0, upperR: 52, forearmR: 25, handR: -5, thighR: -24, shinR: 22, footR: -6, thighN: 5, shinN: 26, footN: -8, antL: -35, antR: -35 })
  };
  var ROOTP = { fall: 100, rise: -12 };
  var SHOULDER = [IDX.upperN, IDX.upperR], HANDS = [[IDX.handN, 205, 430], [IDX.handR, 432, 236]];

  /* ---------- matrices: [a,b,c,d,e,f] like canvas ---------- */
  function mul(m, n) { return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; }
  function T(x, y) { return [1, 0, 0, 1, x, y]; }
  function rotAbout(deg, x, y) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, x - c * x + s * y, y - s * x - c * y]; }
  var MAT = [], ang = new Float32Array(NP), om = new Float32Array(NP), tg = new Float32Array(NP);
  for (i = 0; i < NP; i++) MAT.push([1, 0, 0, 1, 0, 0]);
  // root: still coords -> stage coords. rot about the torso pivot, squash about the feet line, mirror about the torso, then place.
  function rootM(rot, sx, sy, face, ox, oy) {
    var m = T(268, 330); m = mul(m, [face, 0, 0, 1, 0, 0]); m = mul(m, rotAbout(rot, 0, 0));
    var sq = [sx, 0, 0, sy, 268 - sx * 268, 440 - sy * 440]; // scale about (268,440), expressed in still coords
    m = mul(m, T(-268, -330)); m = mul(m, sq); m = mul(T(ox, oy), m);
    return m;
  }
  function fk(R) {
    for (var n = 0; n < FKO.length; n++) {
      var k = FKO[n], p = P[k], base = p.par >= 0 ? MAT[p.par] : R;
      MAT[k] = (k === SPARKS) ? R : mul(base, rotAbout(clamp(ang[k], p.lo, p.hi), p.px, p.py));
    }
  }
  function pt(k, x, y) { var m = MAT[k]; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

  /* ---------- cape cloth (verlet) ---------- */
  var CB = P[CAPE], cloth = null, tier = 0;
  var clothTmp = { cells: null };
  function buildCloth(nx, ny) {
    var c = { nx: nx, ny: ny, n: (nx + 1) * (ny + 1), cs: [], rest: null, pos: null, prev: null, tgt: null, pw: null, u: null, v: null, vis: null };
    c.rest = new Float32Array(c.n * 2); c.pos = new Float32Array(c.n * 2); c.prev = new Float32Array(c.n * 2); c.tgt = new Float32Array(c.n * 2); c.pw = new Float32Array(c.n);
    for (var y = 0; y <= ny; y++) for (var x = 0; x <= nx; x++) {
      var k = y * (nx + 1) + x, rx = CB.bx + CB.bw * x / nx, ry = CB.by + CB.bh * y / ny; c.rest[2 * k] = rx; c.rest[2 * k + 1] = ry;
      var w = sstep((rx - 150) / 60); if (y === 0) w = Math.max(w, sstep((rx - 90) / 110) * .9); c.pw[k] = w;
    }
    function add(a, b, kind) { var dx = c.rest[2 * a] - c.rest[2 * b], dy = c.rest[2 * a + 1] - c.rest[2 * b + 1]; c.cs.push([a, b, Math.hypot(dx, dy), kind]); }
    for (y = 0; y <= ny; y++) for (x = 0; x <= nx; x++) {
      k = y * (nx + 1) + x;
      if (x < nx) add(k, k + 1, 0); if (y < ny) add(k, k + nx + 1, 0);
      if (x < nx && y < ny) { add(k, k + nx + 2, 1); add(k + 1, k + nx + 1, 1); }
      if (x < nx - 1) add(k, k + 2, 2); if (y < ny - 1) add(k, k + 2 * (nx + 1), 2);
    }
    // which cells hold any cape pixels (filled once the atlas is decoded)
    c.vis = new Uint8Array(nx * ny).fill(1);
    return c;
  }
  var capeAlpha = null;
  function markCells(c) {
    if (!capeAlpha) return;
    for (var y = 0; y < c.ny; y++) for (var x = 0; x < c.nx; x++) {
      var x0 = Math.floor(CB.bw * x / c.nx) - 1, x1 = Math.ceil(CB.bw * (x + 1) / c.nx) + 1, y0 = Math.floor(CB.bh * y / c.ny) - 1, y1 = Math.ceil(CB.bh * (y + 1) / c.ny) + 1, any = 0;
      for (var yy = Math.max(y0, 0); yy < Math.min(y1, CB.bh) && !any; yy += 2) for (var xx = Math.max(x0, 0); xx < Math.min(x1, CB.bw); xx += 2) if (capeAlpha[yy * CB.bw + xx] > 3) { any = 1; break; }
      c.vis[y * c.nx + x] = any;
    }
  }
  var clothOK = false, wind = [0, 0, 0], surge = 0, flutT = 0, restBlend = 1, clothKick = 0;
  function clothReset(R) {
    var c = cloth, m = MAT[TORSO];
    for (var k = 0; k < c.n; k++) { var x = c.rest[2 * k], y = c.rest[2 * k + 1], wx = m[0] * x + m[2] * y + m[4], wy = m[1] * x + m[3] * y + m[5]; c.pos[2 * k] = c.prev[2 * k] = c.tgt[2 * k] = wx; c.pos[2 * k + 1] = c.prev[2 * k + 1] = c.tgt[2 * k + 1] = wy; }
  }
  function clothStep(iters) {
    var c = cloth, m = MAT[TORSO], s = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])), nx1 = c.nx + 1, pos = c.pos, prev = c.prev, k, n;
    for (k = 0; k < c.n; k++) { var x = c.rest[2 * k], y = c.rest[2 * k + 1]; c.tgt[2 * k] = m[0] * x + m[2] * y + m[4]; c.tgt[2 * k + 1] = m[1] * x + m[3] * y + m[5]; }
    flutT += .12;
    var wmag = wind[2] + surge;
    for (k = 0; k < c.n; k++) {
      var fx = k % nx1, fy = (k / nx1) | 0, free = 1 - c.pw[k], fl = 1 + .35 * Math.sin(flutT + .55 * fx + .38 * fy);
      var ax = wind[0] * wmag * fl * free * s, ay = (wind[1] * wmag * fl * free + .015) * s;
      var nxp = pos[2 * k] + (pos[2 * k] - prev[2 * k]) * .975 + ax, nyp = pos[2 * k + 1] + (pos[2 * k + 1] - prev[2 * k + 1]) * .975 + ay * 1;
      prev[2 * k] = pos[2 * k]; prev[2 * k + 1] = pos[2 * k + 1]; pos[2 * k] = nxp; pos[2 * k + 1] = nyp;
    }
    var ks = [.5, .35, .18];
    for (var it = 0; it < iters; it++) {
      for (n = 0; n < c.cs.length; n++) {
        var e = c.cs[n], a = e[0], b = e[1], rl = e[2] * s, dx = pos[2 * b] - pos[2 * a], dy = pos[2 * b + 1] - pos[2 * a + 1], l = Math.hypot(dx, dy) + 1e-6, d;
        d = l > rl * 1.12 ? (l - rl * 1.12) / l + (rl * .12 / l) * ks[e[3]] : (l - rl) / l * ks[e[3]];
        if (l > rl * 1.12) d = (l - rl) / l; // hard cap on stretch
        var cx = dx * d * .5, cy = dy * d * .5; pos[2 * a] += cx; pos[2 * a + 1] += cy; pos[2 * b] -= cx; pos[2 * b + 1] -= cy;
      }
      for (k = 0; k < c.n; k++) { var w = c.pw[k]; if (w > 0) { pos[2 * k] += (c.tgt[2 * k] - pos[2 * k]) * w; pos[2 * k + 1] += (c.tgt[2 * k + 1] - pos[2 * k + 1]) * w; } }
    }
    if (restBlend > 0) for (k = 0; k < c.n * 2; k++) pos[k] += (c.tgt[k] - pos[k]) * restBlend;
  }

  /* ---------- drawing ---------- */
  var atlas = null, atlasReady = false;
  function drawPart(ctx, k) { var p = P[k], m = MAT[k]; ctx.setTransform(m[0] * ctx.__k, m[1] * ctx.__k, m[2] * ctx.__k, m[3] * ctx.__k, (m[4] + ctx.__ox) * ctx.__k, (m[5] + ctx.__oy) * ctx.__k); ctx.drawImage(atlas, p.ax, p.ay, p.bw, p.bh, p.bx, p.by, p.bw, p.bh); }
  function setBase(ctx, k, ox, oy) { ctx.__k = k; ctx.__ox = ox; ctx.__oy = oy; }
  var capeCv = null, capeCx = null;
  function drawCapeMesh(ctx, W, H) {
    var c = cloth, k = ctx.__k, ox = ctx.__ox, oy = ctx.__oy, nx = c.nx, ny = c.ny, pos = c.pos;
    if (!capeCv) { capeCv = doc.createElement('canvas'); capeCx = capeCv.getContext('2d'); }
    if (capeCv.width !== W || capeCv.height !== H) { capeCv.width = W; capeCv.height = H; } else capeCx.clearRect(0, 0, W, H);
    var g = capeCx; g.setTransform(1, 0, 0, 1, 0, 0);
    var u0 = function (k2) { return CB.ax + (c.rest[2 * k2] - CB.bx); }, v0 = function (k2) { return CB.ay + (c.rest[2 * k2 + 1] - CB.by); };
    for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) {
      if (!c.vis[y * nx + x]) continue;
      var a = y * (nx + 1) + x, b = a + 1, d = a + nx + 1, e = d + 1;
      mesh3(g, k, ox, oy, pos, c, a, b, d, u0, v0); mesh3(g, k, ox, oy, pos, c, b, e, d, u0, v0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(capeCv, 0, 0);
  }
  function mesh3(g, k, ox, oy, pos, c, i0, i1, i2, uf, vf) {
    var x0 = (pos[2 * i0] + ox) * k, y0 = (pos[2 * i0 + 1] + oy) * k, x1 = (pos[2 * i1] + ox) * k, y1 = (pos[2 * i1 + 1] + oy) * k, x2 = (pos[2 * i2] + ox) * k, y2 = (pos[2 * i2 + 1] + oy) * k;
    var u0 = uf(i0), v0 = vf(i0), u1 = uf(i1), v1 = vf(i1), u2 = uf(i2), v2 = vf(i2);
    var det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0); if (Math.abs(det) < 1e-6) return;
    var a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det, cc = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / det;
    var b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / det, dd = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / det;
    var e = x0 - a * u0 - cc * v0, f = y0 - b * u0 - dd * v0;
    var mx = (x0 + x1 + x2) / 3, my = (y0 + y1 + y2) / 3, ex = .7; // grow the clip a little so neighbouring cells overlap (no seams)
    function gx(x, y) { var dx = x - mx, dy = y - my, l = Math.hypot(dx, dy) || 1; return [x + dx / l * ex, y + dy / l * ex]; }
    var p0 = gx(x0, y0), p1 = gx(x1, y1), p2 = gx(x2, y2);
    g.save(); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.closePath(); g.clip();
    g.setTransform(a, b, cc, dd, e, f); g.drawImage(atlas, CB.ax, CB.ay, CB.bw, CB.bh, CB.ax, CB.ay, CB.bw, CB.bh); g.restore();
    // fold shading: squeezed cloth reads a little darker, stretched a little lighter
    var area = Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)), ra = Math.abs(det), r = area / (ra * k * k * (rs || 1) + 1e-6);
    if (r < .8 || r > 1.2) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = r < 1 ? 'rgba(0,25,30,' + Math.min(.22, (1 - r) * .5) + ')' : 'rgba(255,240,200,' + Math.min(.14, (r - 1) * .3) + ')'; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.closePath(); g.fill(); g.restore(); }
  }
  var rs = 1;
  function drawFigure(ctx, k, ox, oy, W, H, only) {
    setBase(ctx, k, ox, oy); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
    for (var i2 = 0; i2 < SPARKS; i2++) {
      if (only && !only[i2]) continue;
      if (i2 === CAPE) {
        if (restBlend >= .999 && !only) drawPart(ctx, CAPE);
        else if (cloth) { rs = Math.abs(MAT[TORSO][0] * MAT[TORSO][3] - MAT[TORSO][1] * MAT[TORSO][2]); drawCapeMesh(ctx, W, H); }
        continue;
      }
      drawPart(ctx, i2);
    }
    if (sparkA > .01 && !only) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = sparkA; drawPart(ctx, SPARKS); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  }
  var sparkA = 0;

  /* ---------- state ---------- */
  var S = { state: 'rest', px: 0, py: 0, vx: 0, vy: 0, rot: 0, rv: 0, sx: 1, sy: 1, face: 1, faceV: 0, s: 1, since: 0, hold: 0, landT: 0, stopT: -1e9, mode: 'none' };
  var home = { l: 0, t: 0, w: 0, h: 0, s: 1 }, vh = 800, vw = 1280, v = 0, lastY = win.pageYOffset || 0, lastScrollT = 0, vHist = [], relaxed = false;
  var DPR = 1, dprCap = 2, perfEma = 0, perfN = 0, slowSince = 0, frameCnt = 0, stepAcc = 0;
  var restCv = null, restCx = null, flyCv = null, flyCx = null, peekCv = null, peekCx = null, burstCv = null, burstCx = null;
  var PADR = 16, SX0 = -250, SY0 = -230, SW = 1040, SH = 1020, T0 = now();
  var ready = false, loading = false, raf = 0, last = 0, dead = false, B = null, lastBurstT = -1e9, lastCond = 0, condT = 0;
  var tgtRoot = 0, rootOmega = 0, accX = 0, accY = 0, pvx = 0, pvy = 0;

  function reduced() { return RM.matches; }
  function saveData() { var c = win.navigator && win.navigator.connection; return !!(c && c.saveData); }
  function paused() { return !root.classList.contains('tk-on'); }
  function wide() { return WIDE.matches; }

  /* ---------- window.__tb(): keep the old shape, add the rig's own state ---------- */
  var origTb = typeof win.__tb === 'function' ? win.__tb : null;
  function wrapTb(f) {
    return function () {
      var o = {}, a = f ? f() : null, k;
      if (a) for (k in a) o[k] = a[k]; else { o.on = false; o.paused = paused(); o.vis = false; o.says = 0; o.cap = 6; o.down = false; o.hold = false; o.perf = false; o.trips = 0; o.ok = false; o.now = now; o.spend = function () { return false; }; o.state = 'rest'; o.bit = false; }
      var active = S.state !== 'rest' || !!B || relaxedBusy();
      if (S.state !== 'rest') o.state = 'rig'; o.bit = !!(o.bit || active); o.rig = { state: S.state, tier: tier, ema: perfEma, burst: !!B, ready: ready };
      return o;
    };
  }
  function relaxedBusy() { return raf !== 0 && S.state === 'rest' && !settled(); }
  var tbWrapped = wrapTb(origTb);
  try { Object.defineProperty(win, '__tb', { configurable: true, get: function () { return (origTb || ready) ? tbWrapped : undefined; }, set: function (f) { origTb = f; tbWrapped = wrapTb(f); } }); } catch (e) { }

  /* ---------- sizing ---------- */
  function readHome() {
    var r = hero.getBoundingClientRect(); home.l = r.left; home.t = r.top; home.w = r.width; home.h = r.height; home.s = r.width / 468;
    vw = win.innerWidth || 1280; vh = win.innerHeight || 800; return r;
  }
  function sizeRest() {
    if (!restCv) return; var w = Math.max(home.w, 40), s = home.s || w / 468, cw = (468 + 2 * PADR) * s, ch = (480 + 2 * PADR) * s, d = Math.min(DPR, dprCap);
    var W = Math.ceil(cw * d), H = Math.ceil(ch * d); if (restCv.width !== W || restCv.height !== H) { restCv.width = W; restCv.height = H; }
  }
  function sizeFly() {
    if (!flyCv) return; var s = home.s || 0.3, d = Math.min(DPR, dprCap), W = Math.ceil(SW * s * d), H = Math.ceil(SH * s * d);
    if (flyCv.width !== W || flyCv.height !== H) { flyCv.width = W; flyCv.height = H; flyCv.style.width = (SW * s) + 'px'; flyCv.style.height = (SH * s) + 'px'; }
  }
  function percent(n) { return (n * 100).toFixed(4) + '%'; }
  function makeCanvases() {
    restCv = doc.createElement('canvas'); restCv.className = 'tb-rig tb-rig-rest'; restCv.setAttribute('aria-hidden', 'true');
    restCv.style.left = percent(-PADR / 468); restCv.style.top = percent(-PADR / 480); restCv.style.width = percent((468 + 2 * PADR) / 468); restCv.style.height = percent((480 + 2 * PADR) / 480);
    restCx = restCv.getContext('2d'); hero.appendChild(restCv);
    flyCv = doc.createElement('canvas'); flyCv.className = 'tb-rig tb-rig-fly'; flyCv.setAttribute('aria-hidden', 'true'); flyCx = flyCv.getContext('2d');
    flyCv.style.display = 'none'; doc.body.appendChild(flyCv);
  }

  /* ---------- atlas ---------- */
  function load(then) {
    if (ready) { then && then(); return; }
    if (loading || dead) return; loading = true;
    atlas = new win.Image(); atlas.decoding = 'async';
    atlas.onload = function () {
      try {
        var cv = doc.createElement('canvas'); cv.width = CB.bw; cv.height = CB.bh; var g = cv.getContext('2d'); g.drawImage(atlas, CB.ax, CB.ay, CB.bw, CB.bh, 0, 0, CB.bw, CB.bh);
        var d = g.getImageData(0, 0, CB.bw, CB.bh).data; capeAlpha = new Uint8Array(CB.bw * CB.bh); for (var n = 0; n < capeAlpha.length; n++) capeAlpha[n] = d[n * 4 + 3];
      } catch (e) { capeAlpha = null; }
      ready = true; loading = false; init(); then && then();
    };
    atlas.onerror = function () { loading = false; dead = true; };
    atlas.src = ATLAS_URL;
  }

  /* ---------- init and mode switching ---------- */
  function setCloth(nx, ny) { cloth = buildCloth(nx, ny); markCells(cloth); clothReset(); }
  function init() {
    DPR = win.devicePixelRatio || 1; readHome();
    for (var k = 0; k < NP; k++) { ang[k] = om[k] = 0; tg[k] = 0; }
    if (wide() && home.w > 20) {
      makeCanvases(); sizeRest(); sizeFly(); fk(rootM(0, 1, 1, 1, 0, 0)); setCloth(14, 10); restBlend = 1; drawRest(); hero.classList.add('tb-rig-on'); root.classList.add('tb-rig-live'); S.mode = 'rest';
    } else if (!wide()) { makePeek(); }
    wake();
  }
  function setMode(m) {
    if (S.mode === m) return;
    if (m === 'fly') { flyCv.style.display = 'block'; restCv.style.visibility = 'hidden'; }
    else { flyCv.style.display = 'none'; restCv.style.visibility = 'visible'; }
    S.mode = m;
  }
  function drawRest() {
    var s = home.s, d = Math.min(DPR, dprCap), k = d * s;
    fk(rootM(S.rot, S.sx, S.sy, S.face, 0, 0)); drawFigure(restCx, k, PADR, PADR, restCv.width, restCv.height);
  }
  function drawFly() {
    var s = home.s, d = Math.min(DPR, dprCap), k = d * s;
    fk(rootM(S.rot, S.sx, S.sy, S.face, 0, 0)); drawFigure(flyCx, k, -SX0, -SY0, flyCv.width, flyCv.height);
    flyCv.style.transform = 'translate3d(' + (S.px + SX0 * s).toFixed(2) + 'px,' + (S.py + SY0 * s).toFixed(2) + 'px,0)';
  }

  /* ---------- pose targets ---------- */
  function blendPose(a, b, t) { for (var k = 0; k < NP; k++) tg[k] = lerp(a[k], b[k], t); }
  function setTargets() {
    var u = clamp(v / 3000, -1, 1), base = relaxed ? POSE.relax : POSE.zero;
    if (S.state === 'rest' || S.state === 'land' || (!B && Math.abs(u) < .02 && S.state !== 'follow' && S.state !== 'detach')) { blendPose(base, base, 0); tgRoot = 0; }
    else if (u >= 0) { blendPose(POSE.relax, POSE.fall, sstep(u)); tgRoot = ROOTP.fall * sstep(u); }
    else { blendPose(POSE.relax, POSE.rise, sstep(-u)); tgRoot = ROOTP.rise * sstep(-u); }
    if (S.state === 'return') { blendPose(POSE.relax, POSE.relax, 0); tgRoot = 0; }
    if (now() - S.stopT < 180) { blendPose(tg, POSE.stop, 1); }
  }
  var tgRoot = 0, tgFace = 1;

  /* ---------- scroll / velocity ---------- */
  function onScroll() { lastScrollT = now(); wake(); }
  function pushV(t) {
    vHist.push([t, v]); while (vHist.length > 12) vHist.shift();
    if (vHist.length > 5 && t - S.stopT > 600) {
      var old = null, n; for (n = 0; n < vHist.length; n++) if (t - vHist[n][0] <= 100 && t - vHist[n][0] >= 60) { old = vHist[n][1]; break; }
      if (old !== null && Math.abs(old) > 1800 && Math.abs(v) < Math.abs(old) * .4 && (S.state === 'follow' || S.state === 'detach')) { S.stopT = t; surge = 5; S.sy = .88; S.sx = 1.08; }
    }
  }

  /* ---------- physics ---------- */
  function stepJoints(h) {
    var cr = Math.cos(S.rot * Math.PI / 180), sr = Math.sin(S.rot * Math.PI / 180);
    for (var k = 0; k < NP; k++) {
      var p = P[k]; if (!p.k || k === SPARKS) continue;
      var th = ang[k] + (k === TORSO ? 0 : 0);
      // inertial lag: world direction of the bone, torque from the root acceleration (screen space)
      var dx = p.dx * S.face, dy = p.dy, wx = dx * cr - dy * sr, wy = dx * sr + dy * cr, fx = -accX / 1000, fy = -accY / 1000;
      var inert = p.g * 380 * (wx * fy - wy * fx) * S.face;
      var al = -p.k * (ang[k] - tg[k]) - p.c * om[k] + inert;
      om[k] += al * h; ang[k] += om[k] * h;
      if (ang[k] < p.lo) { ang[k] = p.lo; om[k] *= -.3; } else if (ang[k] > p.hi) { ang[k] = p.hi; om[k] *= -.3; }
    }
    // root rotation spring
    var ral = -90 * (S.rot - tgRoot) - 18 * S.rv; S.rv += ral * h; S.rot += S.rv * h;
    // face (mirror) animates through zero, 120 ms
    S.face += (tgFace - S.face) * Math.min(1, h * 22);
    // squash recovers
    S.sx += (1 - S.sx) * Math.min(1, h * 9); S.sy += (1 - S.sy) * Math.min(1, h * 9);
  }
  function noHandsUp() { // screen-space rule: a hand tip never rides more than 6 px above its shoulder
    var s = home.s || 1;
    for (var n = 0; n < 2; n++) {
      var sh = pt(SHOULDER[n], P[SHOULDER[n]].px, P[SHOULDER[n]].py), h = pt(HANDS[n][0], HANDS[n][1], HANDS[n][2]);
      if (h[1] < sh[1] - 6) { var ks = [[IDX.upperN, IDX.forearmN, IDX.handN], [IDX.upperR, IDX.forearmR, IDX.handR]][n]; for (var m = 0; m < 3; m++) { ang[ks[m]] += (POSE.relax[ks[m]] - ang[ks[m]]) * .35; om[ks[m]] *= .5; } }
    }
  }

  /* ---------- state machine ---------- */
  function heroVisible(r) { var top = Math.max(r.top, 0), bot = Math.min(r.bottom, vh); return r.height > 0 ? Math.max(0, bot - top) / r.height : 0; }
  function spring(w, tx, ty, h) {
    var ax = -w * w * (S.px - tx) - 2 * w * S.vx, ay = -w * w * (S.py - ty) - 2 * w * S.vy;
    S.vx += ax * h; S.vy += ay * h; S.px += S.vx * h; S.py += S.vy * h; accX = lerp(accX, ax, .25); accY = lerp(accY, ay, .25);
  }
  function followTarget() {
    var s = home.s, tx = clamp(home.l, 12 - 10 * s, vw - 12 - 460 * s), cy = .56 * vh - clamp(v / 6000, -1, 1) * .18 * vh, ty = cy - 240 * s;
    return [tx, ty];
  }
  function toState(st, t) { S.state = st; S.since = t; S.hold = 0; }
  function startFly(t, r) { S.px = r.left; S.py = r.top; S.vx = S.vy = 0; setMode('fly'); relaxed = true; toState('detach', t); }
  function forceRest(t) {
    S.px = S.py = 0; S.vx = S.vy = 0; S.rot = 0; S.rv = 0; S.sx = S.sy = 1; S.face = tgFace = 1; B && endBurst(); sparkA = 0;
    if (restCv) { setMode('rest'); } toState('rest', t); restBlend = 1;
  }
  function machine(t, dt, h) {
    var r = null, st = S.state;
    if (st === 'rest') {
      if (wide() && !reduced() && !paused() && tier < 3) {
        var moved = Math.abs(v) > 160 && t - lastScrollT < 250;
        if (moved || B) {
          r = readHome();
          var gone = r.top < -.25 * r.height || r.bottom < 0 || r.top > vh;
          if ((moved && gone && !win.__tbBusy) || B) { S.hold += dt; if (S.hold > .12 || B) { startFly(t, r); tgFace = 1; } } else S.hold = 0;
        }
      }
      return;
    }
    if (paused() || reduced() || tier >= 3 || !wide()) { forceRest(t); return; }
    var ft = followTarget(), age = t - S.since;
    if (B) { var bt = burstTarget(ft); ft = bt; }
    if (st === 'detach') { spring(14, ft[0], ft[1], h); if (age > 250) toState('follow', t); }
    else if (st === 'follow') {
      spring(11, ft[0], ft[1], h);
      if (!B && age > 400) { r = readHome(); if (heroVisible(r) > .4) { S.hold += dt; if (S.hold > .12) toState('return', t); } else S.hold = 0; }
    } else if (st === 'return') {
      r = readHome(); spring(8.5, r.left, r.top, h);
      if (B) { toState('follow', t); return; }
      if (age > 350 && Math.abs(S.px - r.left) < 1.5 && Math.abs(S.py - r.top) < 1.5 && Math.hypot(S.vx, S.vy) < 25) { toState('land', t); S.landT = t; S.sy = .9; S.sx = 1.06; sparkA = 1; S.px = r.left; S.py = r.top; S.vx = S.vy = 0; }
    } else if (st === 'land') {
      r = readHome(); S.px = r.left; S.py = r.top; accX = accY = 0;
      var lt = t - S.landT; sparkA = lt < 400 ? Math.pow(1 - lt / 400, 1.5) : 0; restBlend = clamp((lt - 100) / 300, 0, 1);
      if (lt > 420) { sparkA = 0; restBlend = 1; setMode('rest'); S.rot = 0; S.rv = 0; toState('rest', t); }
    }
    if (st === 'detach' || st === 'follow') restBlend = 0, clothKick = 0;
    else if (st === 'return') restBlend = 0;
  }

  /* ---------- burst ---------- */
  var PN = 60, pX = new Float32Array(PN), pY = new Float32Array(PN), pVX = new Float32Array(PN), pVY = new Float32Array(PN), pA = new Float32Array(PN), pL = new Float32Array(PN), pS = new Float32Array(PN), pN = 0, glowSpr = null, glowTimers = [];
  function glowSprite() { var c = doc.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,250,225,1)'); r.addColorStop(.25, 'rgba(255,214,120,.85)'); r.addColorStop(.6, 'rgba(255,160,50,.28)'); r.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return c; }
  function panelOf(e) { return e; }
  function onToggle(e) {
    var d = e.target; if (!d || !d.matches || !d.matches('details.win, details.flow') || !d.open) return;
    var t = now(); if (t - T0 < 900 || t - lastBurstT < 600 || B) return;
    if (!wide()) return;                       // phones and narrow screens: no burst and no glow
    lastBurstT = t;
    if (reduced()) { staticGlow(d); return; }
    if (paused()) return;                      // the pause button stops him too
    if (tier >= 3 || dead) { glowOnly(d, 250); return; }
    var go = function () { startBurst(d, t); };
    if (ready) go(); else { glowOnly(d, 250); load(); }
  }
  function glowOnly(d, delay) { later(function () { d.classList.add('tb-burst'); }, delay); later(function () { d.classList.add('tb-burst-fade'); d.classList.remove('tb-burst'); }, 2100); later(function () { d.classList.remove('tb-burst-fade'); }, 3100); }
  function staticGlow(d) { d.classList.add('tb-burst'); later(function () { d.classList.add('tb-burst-fade'); d.classList.remove('tb-burst'); }, 700); later(function () { d.classList.remove('tb-burst-fade'); }, 1700); }
  function later(fn, ms) { win.setTimeout(fn, ms); }
  function startBurst(d, t) {
    var r = d.getBoundingClientRect(); readHome();
    var tx = clamp(r.left + r.width / 2, 20, vw - 20), ty = clamp(r.top, 24, vh - 24);
    B = { t0: t, d: d, T: [tx, ty], seed: (t | 0) ^ 0x5bd1e995, fired: 0, glow: 0, e: null, spawned: 0, impact: 0, rnd: null, ww: 0 };
    B.rnd = rng(B.seed); if (!glowSpr) glowSpr = glowSprite(); pN = 0;
    var fx = S.state === 'rest' ? home.l + 234 * home.s : S.px + 268 * home.s; tgFace = tx < fx ? -1 : 1;
    if (!burstCv) { burstCv = doc.createElement('canvas'); burstCv.className = 'tb-rig tb-rig-burst'; burstCv.setAttribute('aria-hidden', 'true'); doc.body.appendChild(burstCv); burstCx = burstCv.getContext('2d'); }
    var bd = Math.min(DPR, 1.5, dprCap); burstCv.width = Math.ceil(vw * bd); burstCv.height = Math.ceil(vh * bd); burstCv.style.width = vw + 'px'; burstCv.style.height = vh + 'px'; burstCv.style.display = 'block';
    B.bd = bd; wake();
  }
  function toView(p) { var s = home.s; return S.mode === 'fly' ? [S.px + p[0] * s, S.py + p[1] * s] : [home.l + p[0] * s, home.t + p[1] * s]; }
  function burstTarget(ft) {
    var s = home.s, dx = Math.abs(B.T[0] - (ft[0] + 268 * s)), ty = B.T[1] - Math.tan(25 * Math.PI / 180) * dx - 236 * s;
    return [ft[0], clamp(ty, 6 - 30 * s, vh - 440 * s)];
  }
  function endBurst() {
    if (!B) return; B = null; tgFace = 1; pN = 0;
    if (burstCv) { burstCx.clearRect(0, 0, burstCv.width, burstCv.height); burstCv.style.display = 'none'; burstCv.width = burstCv.height = 0; }
  }
  function burstPose(t) {
    var e = t - B.t0, s = home.s; if (S.state === 'rest' || S.state === 'detach' && e < 60) return;
    var up = IDX.upperR, fo = IDX.forearmR, hn = IDX.handR, un = IDX.upperN;
    if (e < 150) { tg[up] = -26; tg[fo] = -12; tg[un] = -35; tg[TORSO] = -8; surge = Math.max(surge, 2.5); S.sy = Math.min(S.sy, .95); }
    else {
      if (!B.fired) { B.fired = 1; B.psi = 25; om[up] -= 260; om[HEAD] -= 70; surge = 4; }
      var m = toView(pt(hn, 432, 236)), dx = Math.abs(B.T[0] - m[0]), dy = B.T[1] - m[1], psi = clamp(Math.atan2(dy, Math.max(dx, 1)) * 180 / Math.PI, -5, 45);
      B.psi = lerp(B.psi, psi, .35); B.mx = m[0]; B.my = m[1]; B.ex = B.T[0]; B.ey = m[1] + Math.tan(B.psi * Math.PI / 180) * dx;
      tg[up] = B.psi - 34.6; tg[fo] = 0; tg[hn] = 0; tg[un] = -30; tg[TORSO] = 2;
    }
    if (e > 800) { var b2 = POSE.relax; for (var k = 0; k < NP; k++) tg[k] = b2[k]; }
  }
  function burstTick(t, dt) {
    var e = t - B.t0, g = burstCx, d = B.bd, s = home.s, cap = tier === 0 ? 60 : tier === 1 ? 40 : 24;
    if (e >= 250 && !B.glow) { B.glow = 1; B.d.classList.add('tb-burst'); later(function () { var q = B && B.d; var dd = B ? B.d : null; }, 0); var dd = B.d; later(function () { dd.classList.add('tb-burst-fade'); dd.classList.remove('tb-burst'); }, 1850); later(function () { dd.classList.remove('tb-burst-fade'); }, 2850); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, burstCv.width, burstCv.height); g.setTransform(d, 0, 0, d, 0, 0); g.globalCompositeOperation = 'lighter';
    if (B.fired) {
      var mx = B.mx, my = B.my;
      var ex = B.ex, ey = B.ey, len = Math.hypot(ex - mx, ey - my) || 1, ux = (ex - mx) / len, uy = (ey - my) / len;
      if (e >= 150 && e < 250) { sprite(g, mx + ux * 6, my + uy * 6, 70 * (1 - (e - 150) / 100 * .4), .95); sprite(g, mx, my, 38, .9); }
      var live = Math.min(cap - 6, 54);
      if (e >= 250 && e < 800) {
        // beam: 6 stretched sprites that grow muzzle -> impact, then fade
        var prog = clamp((e - 250) / 270, 0, 1), fade = e < 520 ? 1 : 1 - (e - 520) / 280;
        var segL = len * prog / 6 * 1.8, ang0 = Math.atan2(uy, ux);
        for (var n = 0; n < 6; n++) { var f0 = (n + .5) / 6 * prog; beam(g, mx + ux * len * f0, my + uy * len * f0, ang0, segL + 8, (26 + 8 * Math.sin(e / 35 + n)) * Math.max(s, .3) * 1.5 + 10, .75 * fade); }
        // stream particles (36 over the first 250 ms of the beam)
        var want = Math.floor(clamp((e - 250) / 250, 0, 1) * 36);
        while (B.spawned < want && pN < live) { var tt = B.rnd() * prog, i2 = pN++; B.spawned++; pX[i2] = mx + ux * len * tt + (B.rnd() - .5) * 8; pY[i2] = my + uy * len * tt + (B.rnd() - .5) * 8; var sp = 140 + B.rnd() * 220; pVX[i2] = ux * sp + (B.rnd() - .5) * 70; pVY[i2] = uy * sp + (B.rnd() - .5) * 70; pA[i2] = 0; pL[i2] = .35 + B.rnd() * .45; pS[i2] = 6 + B.rnd() * 8; }
        if (e >= 520 && !B.impact) { B.impact = 1; for (n = 0; n < 24 && pN < cap - 6 + 6; n++) { i2 = pN++; pX[i2] = ex; pY[i2] = ey; var a2 = (B.rnd() - .5) * 2.4 + (B.rnd() < .5 ? 0 : Math.PI), spd = 120 + B.rnd() * 300; pVX[i2] = Math.cos(a2) * spd; pVY[i2] = Math.sin(a2) * spd * .35 - 30; pA[i2] = 0; pL[i2] = .35 + B.rnd() * .55; pS[i2] = 4 + B.rnd() * 7; } }
        if (e >= 520 && e < 640) sprite(g, ex, ey, 110 * (1 - (e - 520) / 120 * .5), .95 * (1 - (e - 520) / 120));
      }
    }
    for (var q2 = 0; q2 < pN; q2++) {
      pA[q2] += dt; var lf = pA[q2] / pL[q2]; if (lf >= 1) { pN--; pX[q2] = pX[pN]; pY[q2] = pY[pN]; pVX[q2] = pVX[pN]; pVY[q2] = pVY[pN]; pA[q2] = pA[pN]; pL[q2] = pL[pN]; pS[q2] = pS[pN]; q2--; continue; }
      pX[q2] += pVX[q2] * dt; pY[q2] += pVY[q2] * dt; pVX[q2] *= .985; pVY[q2] *= .985; sprite(g, pX[q2], pY[q2], pS[q2] * 2.2, Math.pow(1 - lf, 1.5));
    }
    g.globalCompositeOperation = 'source-over';
    if (e > 1000) endBurst();
  }
  function beam(g, x, y, a0, len, th, a) { if (a <= .01) return; g.save(); g.translate(x, y); g.rotate(a0); g.globalAlpha = a > 1 ? 1 : a; g.drawImage(glowSpr, -len / 2, -th / 2, len, th); g.restore(); g.globalAlpha = 1; }
  function sprite(g, x, y, sz, a) { if (a <= .01) return; g.globalAlpha = a > 1 ? 1 : a; g.drawImage(glowSpr, x - sz / 2, y - sz / 2, sz, sz); g.globalAlpha = 1; }

  /* ---------- peek (phones and narrow screens) ---------- */
  var PEEKON = null, peekY = 0, peekSc = .14, peekW = 0, peekH = 0, peekKeep = null;
  function makePeek() {
    if (peekCv || reduced() || saveData()) return;
    peekCv = doc.createElement('canvas'); peekCv.className = 'tb-rig tb-rig-peek'; peekCv.setAttribute('aria-hidden', 'true');
    var w = Math.ceil((468 + 2 * PADR) * peekSc), h = Math.ceil((480 + 2 * PADR) * peekSc); peekW = w; peekH = h; peekCv.style.width = w + 'px'; peekCv.style.height = h + 'px';
    var d = Math.min(DPR, 2); peekCv.width = Math.ceil(w * d); peekCv.height = Math.ceil(h * d); peekCx = peekCv.getContext('2d'); doc.body.appendChild(peekCv);
    PEEKON = []; for (var k = 0; k < NP; k++) PEEKON.push(0); [IDX.torso, IDX.cape, IDX.head, IDX.antL, IDX.antR].forEach(function (k2) { PEEKON[k2] = 1; });
    for (var k3 = 0; k3 < NP; k3++) { ang[k3] = POSE.relax[k3]; tg[k3] = POSE.relax[k3]; om[k3] = 0; }
    setCloth(8, 6); restBlend = 0;
  }
  function peekFrame(dt) {
    if (!peekCv) return; var d = Math.min(DPR, 2), bob = clamp(v / 150, -1, 1) * 8; peekY = lerp(peekY, bob, .2);
    accY = lerp(accY, -v * 2, .1); accX = 0; ang[HEAD] = clamp(-v / 400, -12, 12); ang[IDX.antL] = ang[IDX.antR] = clamp(v / 250, -30, 30) * .6 + 4;
    fk(rootM(0, 1, 1, 1, 0, 0)); wind[0] = -.2; wind[1] = clamp(-v / 1500, -1, 1); wind[2] = Math.abs(v) > 40 ? 2.4 : .3;
    if (cloth) clothStep(2);
    drawFigure(peekCx, d * peekSc, PADR, PADR, peekCv.width, peekCv.height, null);
    peekCv.style.transform = 'translate3d(0,' + peekY.toFixed(1) + 'px,0)';
    // rg2: never sit on the setup question (its start line and the AI picker): fade out while they are under him
    if (!peekKeep) peekKeep = doc.querySelector('#start fieldset');
    var off = false;
    if (peekKeep) { var kr = peekKeep.getBoundingClientRect(), pr = peekCv.getBoundingClientRect(); off = kr.bottom > pr.top - 8 && kr.top < pr.bottom + 8 && kr.right > pr.left - 8 && kr.left < pr.right + 8; }
    peekCv.classList.toggle('tb-peek-off', off);
  }

  /* ---------- main loop ---------- */
  function settled() {
    if (S.state !== 'rest' || B || restBlend < 1) return false;
    if (Math.abs(S.rot) > .05 || Math.abs(S.rv) > .05 || Math.abs(S.sx - 1) > .002 || Math.abs(S.sy - 1) > .002 || Math.abs(S.face - tgFace) > .002 || sparkA > .01) return false;
    for (var k = 0; k < NP; k++) if (Math.abs(ang[k] - tg[k]) > .06 || Math.abs(om[k]) > .06) return false;
    return now() - lastScrollT > 600;
  }
  function wake() { if (!raf && ready && !win.document.hidden) { last = 0; raf = win.requestAnimationFrame(frame); } }
  function frame(t0) {
    raf = 0; if (!ready || doc.hidden) return;
    var t = now(), dt = last ? Math.min((t - last) / 1000, .05) : 1 / 60; last = t; var w0 = now();
    // scroll velocity
    var y = win.pageYOffset || 0, vi = dt > 0 ? (y - lastY) / dt : 0; lastY = y; v = lerp(v, vi, 1 - Math.exp(-dt / .09)); if (Math.abs(v) < 1) v = 0; pushV(t);
    if (!wide()) { if (!peekCv) makePeek(); peekFrame(dt); if (Math.abs(v) > 2 || Math.abs(peekY) > .3) raf = win.requestAnimationFrame(frame); return; }
    if (peekCv) { peekCv.style.display = 'none'; }
    if (!restCv) { if (home.w > 20 || readHome().width > 20) { init(); } if (!restCv) return; }
    machine(t, dt, dt);
    if (B) burstPose(t); else setTargets();
    if (S.state !== 'rest' || B || !settled()) {
      stepAcc += dt; var sub = 0; while (stepAcc >= 1 / 120 && sub < 4) { stepJoints(1 / 120); stepAcc -= 1 / 120; sub++; } if (stepAcc > .05) stepAcc = 0;
      fk(rootM(S.rot, S.sx, S.sy, S.face, 0, 0)); noHandsUp();
      // cloth: wind = against the figure's motion relative to the page
      var vx = S.vx, vy = S.vy + v, mag = Math.hypot(vx, vy);
      var wm = clamp(mag / 2800, 0, 1); wind[0] = mag > 1 ? -vx / mag * .55 - .35 : -.35; wind[1] = mag > 1 ? -vy / mag : 0; wind[2] = wm * 3.1 + (S.state === 'rest' ? 0 : .25);
      surge *= .93; if (surge < .05) surge = 0;
      if (S.state === 'rest' && restBlend >= 1) { /* plain */ } else { var tg2 = S.state === 'land' ? 1 : 0; if (tier < 2 || (frameCnt & 1)) clothStep(tier === 0 ? 3 : 2); }
      if (S.state === 'rest') { restBlend = Math.min(1, restBlend + dt * 4 * (settledSoon() ? 1 : 0)); }
      if (S.mode === 'fly') drawFly(); else drawRest();
      if (B) burstTick(t, dt);
    }
    frameCnt++; var cost = now() - w0; perfEma = perfN++ < 5 ? cost : lerp(perfEma, cost, 1 / 30); tierCheck(t);
    if (!settled() || B || S.state !== 'rest') raf = win.requestAnimationFrame(frame);
  }
  function settledSoon() { return Math.abs(v) < 20; }
  var tier = 0;
  function tierCheck(t) {
    if (frameCnt % 30) return;
    var nt = tier; if (perfEma > 14) { if (!slowSince) slowSince = t; if (t - slowSince > 1000) nt = 3; } else slowSince = 0;
    if (nt < 3) { if (perfEma > 9) nt = Math.max(nt, 2); else if (perfEma > 6) nt = Math.max(nt, 1); }
    if (nt > tier) { tier = nt; applyTier(); }
  }
  function applyTier() {
    dprCap = tier >= 2 ? 1 : tier === 1 ? 1.5 : 2;
    if (tier >= 1 && cloth && cloth.nx > 8) setCloth(8, 6);
    if (restCv) { sizeRest(); sizeFly(); }
    if (tier >= 3 && S.state !== 'rest') forceRest(now());
  }

  /* ---------- boot ---------- */
  function onResize() { if (!restCv) return; readHome(); sizeRest(); sizeFly(); if (S.mode === 'rest') drawRest(); wake(); }
  function boot() {
    if (saveData()) return;
    doc.addEventListener('toggle', onToggle, true);
    win.addEventListener('scroll', function () { onScroll(); if (!ready) load(); }, { passive: true });
    win.addEventListener('resize', function () { onResize(); }, { passive: true });
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) wake(); });
    var chg = function () { if (RM.matches) { if (restCv) { forceRest(now()); hero.classList.remove('tb-rig-on'); root.classList.remove('tb-rig-live'); restCv.style.display = 'none'; } if (peekCv) peekCv.style.display = 'none'; } else { if (restCv) { restCv.style.display = ''; hero.classList.add('tb-rig-on'); root.classList.add('tb-rig-live'); drawRest(); } if (peekCv) peekCv.style.display = ''; wake(); } };
    if (RM.addEventListener) RM.addEventListener('change', chg); else if (RM.addListener) RM.addListener(chg);
    var wchg = function () { if (ready) { if (wide()) { if (peekCv) peekCv.style.display = 'none'; if (!restCv) init(); else { readHome(); wake(); } } else { if (restCv && S.state !== 'rest') forceRest(now()); makePeek(); if (peekCv) peekCv.style.display = ''; setCloth(8, 6); wake(); } } };
    if (WIDE.addEventListener) WIDE.addEventListener('change', wchg); else if (WIDE.addListener) WIDE.addListener(wchg);
    var go = function () { if (reduced()) return; load(); };
    if (doc.readyState === 'complete') later(go, 600); else win.addEventListener('load', function () { later(function () { if (win.requestIdleCallback) win.requestIdleCallback(go, { timeout: 2500 }); else go(); }, 500); });
  }
  boot();
})();
