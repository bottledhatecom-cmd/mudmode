/* mudpity - FISHING WORLD (first new scene layer). Own file so it merges cleanly with the other branches; game.js only
   creates it (window.MudFishWorld(api)) and calls a few hooks: step(), afterSide(), roomBuilt(), in3d()/render().
   Flow: random side paths in forest rooms -> prompt (F, or tap) -> walk-in (side view: mudbot walks up the path and shrinks
   into the mist; then the camera swings behind him and follows him in; fade) -> a full 3D lake basin with third-person
   mouse look, shores, coves and hidden spots -> fishing (3D aimed cast with a bobber, then a catch game) -> leave by walking
   back through the path gate or rowing off from the dock -> back in the side scroller where he left.
   Catch games by where the bobber lands: docks + deep water = TENSION BAR, shallows + streams = TIMING, open middle water =
   STEER (new, 3D: the fish runs left / right in the water and you lean the rod against it). Rare fish and creatures that fight back start BUTTON MASH, scaled by the catch's SIZE (how many
   mashes / how long) and AGGRESSION (how hard it pulls back: drain, thrash bursts, line-snap risk).
   Critters: junk rats sneak up and steal fish from the bucket (catch them to get it back); a mud gull dives for fresh catches
   (jump to shoo it). The buddy brings his own little rod and fishes next to you. All art is procedural (painted later).
   Every tuning number is in FT below: PLAYTEST DEFAULTS. */
(() => {
'use strict';
window.MudFishWorld = function (A) {
const THREE = A.THREE, G = A.G, V3 = THREE.Vector3;
const { sstep, lerp, fbm, hash, mulberry, X, GY, QL, reg, hold } = A;
const TAU = Math.PI * 2, PI = Math.PI, STEP = 1 / 60;
const FT = {
  WALK: 6.2, RUN: 10, WADE: .6, JUMP_V: 7.5, GRAV: 22, TURN: 12,
  CAST_CHARGE: 1.0, CAST_MIN: 4, CAST_MAX: 22,
  BITE_MIN: 1.6, BITE_MAX: 4.6, HIDDEN_BITE: .6, BITE_WINDOW: .95,
  PITY: .15,                         // rare weight +15% per non-rare catch, reset on a rare
  MASH: { BASE_PRESSES: 8, PER_SIZE: 5, START: 25, DRAIN0: 1.5, DRAIN_AGGR: 1.5, THRASH_EVERY: [2.8, 4.2], THRASH_AGGR_CUT: .2,
          THRASH_DUR0: .45, THRASH_DUR_AGGR: .07, THRASH_DRAIN_AGGR: 1.6, STRAIN_PER_AGGR: 7, STRAIN_DECAY: 35, TIME0: 6, TIME_SIZE: 3.2 },
  RAT_SPEED: 3.3, RAT_FLEE: 5.6, RAT_SEE: 22, RAT_CD: 22, GULL_CHANCE: .3, GULL_DIVE: 1.8,
  BUDDY_CATCH: [7, 13]
};

/* ======================= DOM (own overlay; inline styles only, CSP-safe) ======================= */
const css = document.createElement('style');
css.textContent = `#fw-fade{position:fixed;inset:0;background:#dfe8d6;opacity:0;pointer-events:none;z-index:8}
#fw-prompt{position:fixed;left:50%;bottom:24%;transform:translateX(-50%);display:none;z-index:7;padding:.45em 1em;border-radius:6px;background:rgba(31,20,14,.78);
 border:2px solid #e8c14a;color:#f3e6c4;font-weight:bold;font-size:max(13px,2.3vmin);text-shadow:1px 1px 0 #3f2616;cursor:pointer;touch-action:none;white-space:nowrap}
#fw-hud{position:fixed;left:0;right:0;top:0;display:none;gap:2.2vmin;align-items:center;padding:1vmin 2vmin;font-weight:bold;font-size:max(12px,2.1vmin);color:#f3e6c4;
 background:rgba(31,20,14,.62);text-shadow:1px 1px 0 #3f2616;pointer-events:none;z-index:6;flex-wrap:wrap} #fw-hud b{color:#e8c14a}
#fw-help{position:fixed;left:6px;right:140px;bottom:6px;display:none;font-size:max(10px,1.6vmin);color:#f3e6c4;opacity:.85;background:rgba(31,20,14,.55);padding:3px 7px;border-radius:4px;pointer-events:none;z-index:6;line-height:1.45}
#fw-msg{position:fixed;left:0;right:0;top:16%;text-align:center;font-weight:bold;color:#f3e6c4;font-size:max(16px,3.2vmin);display:none;text-shadow:2px 2px 0 #3f2616;pointer-events:none;z-index:6}
#fw-game{position:fixed;left:50%;bottom:12%;transform:translateX(-50%);width:min(86vw,460px);display:none;z-index:6;background:rgba(31,20,14,.8);border:2px solid #3f2616;color:#f3e6c4;
 border-radius:6px;padding:8px 12px;font-size:max(11px,1.9vmin);font-weight:bold;text-align:center;pointer-events:none;box-shadow:0 0 0 3px rgba(31,92,88,.7)}
#fw-game .bar{position:relative;height:14px;margin:5px 0;background:#1b1410;border:2px solid #5a3a22;border-radius:3px;overflow:hidden}
#fw-game .fill{position:absolute;left:0;top:0;bottom:0;background:#9fe3ff} #fw-game .zone{position:absolute;top:0;bottom:0;background:rgba(232,193,74,.75)}
#fw-game .mark{position:absolute;top:-2px;bottom:-2px;width:4px;background:#fff;margin-left:-2px} #fw-game .st{display:flex;justify-content:space-between;gap:8px;margin-top:3px}
#fw-game .pip{color:#e8c14a} #fw-game .ang{color:#ff7a5a} #fw-game .warn{color:#ff8a70}
#fw-touch{position:fixed;inset:0;display:none;z-index:5;touch-action:none}
#fw-touch .tb2{position:absolute;width:15vmin;height:15vmin;border-radius:50%;border:2px solid rgba(63,38,22,.6);background:rgba(243,230,196,.34);display:flex;align-items:center;justify-content:center;font-weight:bold;color:#3f2616;font-size:max(11px,2vmin)}
#fw-touch .on{background:rgba(255,179,71,.65)}`;
document.head.appendChild(css);
const el = (id, tag) => { const e = document.createElement(tag || 'div'); e.id = id; document.body.appendChild(e); return e; };
const fadeEl = el('fw-fade'), promptEl = el('fw-prompt'), hudEl = el('fw-hud'), helpEl = el('fw-help'), msgEl = el('fw-msg'), gameEl = el('fw-game'), touchEl = el('fw-touch');
const isTouch = !!A.isTouch;
const HELP = { foot: isTouch ? 'left: move &nbsp; right: look &nbsp; FISH: hold to cast, tap to hook / reel / mash &nbsp; tap the prompt: gate / boat' :
  'WASD move &middot; mouse look (click to lock, or right-drag) &middot; Shift run &middot; Space jump &middot; hold F or left click: cast &middot; F / click: hook, reel, mash &middot; E: leave at the gate / get in the boat &middot; wheel: zoom',
  boat: isTouch ? 'BOAT: left stick: row / turn &nbsp; right: look &nbsp; FISH: cast from the boat &nbsp; OUT at the dock' :
  'BOAT: W / S row &middot; A / D turn &middot; Shift fast stroke &middot; hold F or left click: cast &middot; reel in to row &middot; Space hop &middot; E: get out at the dock &middot; wheel: zoom' };
const setHelp = k => { if (helpEl.dataset.k !== k) { helpEl.dataset.k = k; helpEl.innerHTML = HELP[k]; } };
setHelp('foot');
let msgT = 0; function toast(s, t) { msgEl.textContent = s; msgEl.style.display = 'block'; msgT = t || 2.2; F.log.push(s); if (F.log.length > 60) F.log.shift(); }

/* ======================= small builders ======================= */
const _m = new THREE.Matrix4(), _v = new V3(), _v2 = new V3(), _v3 = new V3(), _c = new THREE.Color(), _o = new THREE.Object3D(), _up = new V3(0, 1, 0);
const T = (x, y, z, rx, ry, rz, sx, sy, sz) => { if (sx === undefined) sx = 1; if (sy === undefined) sy = sx; if (sz === undefined) sz = sx;
  return new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new V3(sx, sy, sz)); };
// bake: merge [geometry, matrix, colour] parts into ONE vertex-coloured geometry (one draw call per prop)
function bake(parts) {
  let n = 0; const gs = parts.map(p => { const g = p[0].index ? p[0].toNonIndexed() : p[0].clone(); g.applyMatrix4(p[1]); if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count; return g; });
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
  gs.forEach((g, i) => { const c = _c.set(parts[i][2]), cnt = g.attributes.position.count, vc = g.attributes.color; P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    for (let k = 0; k < cnt; k++) { const a = vc ? vc.getX(k) : 1, b = vc ? vc.getY(k) : 1, d = vc ? vc.getZ(k) : 1; C[(o + k) * 3] = c.r * a; C[(o + k) * 3 + 1] = c.g * b; C[(o + k) * 3 + 2] = c.b * d; }
    o += cnt; g.dispose(); });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.computeBoundingSphere(); return out;
}
const VC = reg(new THREE.MeshLambertMaterial({ vertexColors: true }));
const VCB = A.artify(reg(new THREE.MeshLambertMaterial({ vertexColors: true })), 'fwbark', [{ t: 'bark', sc: .5, st: .7 }]);
const glowM = reg(new THREE.MeshLambertMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 1.6 }));
const addM = (tex, col, op) => reg(new THREE.MeshBasicMaterial({ map: tex, color: col, transparent: true, opacity: op === undefined ? 1 : op, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
const softM = (col, op) => reg(new THREE.MeshBasicMaterial({ map: A.texSoft, color: col, transparent: true, opacity: op, depthWrite: false, fog: false }));
const mesh = (g, m, par, cast) => { const o = new THREE.Mesh(g, m); if (cast) o.castShadow = true; o.receiveShadow = true; if (par) par.add(o); return o; };
function inst(geo, mat, list, par, cast) { if (!list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((o, i) => { _o.position.set(o.x, o.y, o.z); _o.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); _o.scale.set(o.sx, o.sy === undefined ? o.sx : o.sy, o.sz === undefined ? o.sx : o.sz); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); im.setColorAt(i, _c.set(o.c || '#ffffff')); });
  im.castShadow = !!cast; im.receiveShadow = true; im.computeBoundingSphere(); if (par) par.add(im); return im; }
function billboards(n, mat, par) { const im = new THREE.InstancedMesh(A.gQuad, mat, n); im.frustumCulled = false; for (let i = 0; i < n; i++) im.setColorAt(i, _c.set('#ffffff')); if (par) par.add(im); return im; }
// thin dynamic line (fishing line): a 3-sided tube through N points, rebuilt per frame (no Line in the slim three build)
function mkLine(col, r, N) { N = N || 18; const S_ = 3, g = new THREE.BufferGeometry(), idx = [];
  for (let i = 0; i < N; i++) for (let k = 0; k < S_; k++) { const a = i * S_ + k, b = i * S_ + (k + 1) % S_; idx.push(a, b, a + S_, b, b + S_, a + S_); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * S_ * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((N + 1) * S_ * 3), 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, reg(new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: .35 }))); m.frustumCulled = false;
  m.userData.set = (a, b, sag, wig) => { const P = g.attributes.position.array, Nn = g.attributes.normal.array;
    for (let i = 0; i <= N; i++) { const t = i / N, x = a.x + (b.x - a.x) * t + (wig ? Math.sin(t * 9 + wig) * .05 * Math.sin(PI * t) : 0), y = a.y + (b.y - a.y) * t - sag * Math.sin(PI * t), z = a.z + (b.z - a.z) * t;
      for (let k = 0; k < S_; k++) { const th = k / S_ * TAU, cx = Math.cos(th), cy = Math.sin(th), o = (i * S_ + k) * 3; P[o] = x + cx * r; P[o + 1] = y + cy * r; P[o + 2] = z + cx * r * .7; Nn[o] = cx; Nn[o + 1] = cy; Nn[o + 2] = 0; } }
    g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = true; };
  return m; }

/* ---- shared prop geometry ---- */
const gTr = A.gTrunk, gCyl = A.gCyl, gSph = A.gSph, gBox = A.gBox, gCone = A.gCone, gBlob = A.gBlob, gRock = A.gRock;
function gateGeo() {   // the path gate (side-scroller entrance AND the 3D exit): two crooked mossy trunks, a crossbar, a hanging fish sign, junk charms
  const p = [];
  p.push([gTr, T(-1.9, -.2, 0, 0, 0, -.16, .75, 6.2, .75), '#6b4f38'], [gTr, T(1.9, -.2, 0, 0, 1, .2, .65, 5.8, .65), '#5e4a38']);
  p.push([gCyl, T(0, 5.25, 0, 0, 0, PI / 2 + .06, .32, 5.2, .32), '#7a5a3c'], [gCyl, T(-.6, 5.6, .1, 0, 0, PI / 2 - .25, .16, 2.4, .16), '#6b4f38']);
  for (const x of [-.75, .75]) p.push([gCyl, T(x, 4.75, 0, 0, 0, 0, .03, .9, .03), '#3f2616']);
  p.push([gBox, T(0, 4.15, 0, 0, 0, .04, 2.3, .72, .14), '#8a6a44'], [gBox, T(0, 4.15, .06, 0, 0, .04, 2.05, .5, .04), '#a8865a']);
  p.push([gSph, T(-.15, 4.17, .1, 0, 0, 0, .95, .38, .1), '#3ca79f'], [gCone, T(.5, 4.17, .1, 0, 0, -PI / 2, .32, .3, .08), '#3ca79f'], [gSph, T(-.45, 4.22, .14, 0, 0, 0, .07, .07, .04), '#1e1816']);
  p.push([gCyl, T(-1.55, 3.3, .45, PI / 2, 0, 0, .5, .06, .5), '#9a9a92'], [gCyl, T(-1.55, 3.3, .49, PI / 2, 0, 0, .2, .02, .2), '#6a6a62'], [gCyl, T(-1.6, 3.95, .4, 0, 0, 0, .02, .9, .02), '#3f2616']);
  p.push([gBox, T(1.55, 3.0, .4, 0, .3, .2, .34, .5, .26), '#4a3226'], [gBox, T(1.68, 2.78, .4, 0, .3, .2, .42, .2, .3), '#4a3226'], [gCyl, T(1.55, 3.6, .4, 0, 0, 0, .02, .8, .02), '#3f2616']);
  p.push([gCyl, T(.9, 3.5, .3, 0, 0, 0, .22, .36, .22), '#7d3a2a'], [gCyl, T(.9, 3.7, .3, 0, 0, 0, .25, .04, .25), '#5e2a1e'], [gCyl, T(.9, 4.3, .3, 0, 0, 0, .02, .9, .02), '#3f2616']);
  for (const [x, s] of [[-1.9, 1.5], [2.0, 1.3], [-1.2, .9], [1.3, .8]]) p.push([gBlob, T(x, .2, .2, 0, x, 0, s, .7 * s, s), '#4f7f3c']);
  p.push([gBlob, T(-1.7, 2.6, .25, 0, 0, 0, .7, .5, .6), '#5a8a44'], [gBlob, T(1.75, 4.6, .2, 0, 0, 0, .8, .5, .7), '#4f7f3c'], [gBlob, T(0, 5.55, 0, 0, 0, 0, 2.6, .7, 1.1), '#3d7f45']);
  return bake(p);
}
const GATE = gateGeo();
function mkGate(par, haloM) { const g = new THREE.Group(); mesh(GATE, VCB, g, true); const lan = mesh(gSph, glowM, g); lan.position.set(.9, 3.45, .3); lan.scale.setScalar(.2);
  const halo = mesh(A.gQuad, haloM || addM(A.texGlow, '#ffcf7a', .8), g); halo.position.set(.9, 3.45, .5); halo.scale.setScalar(1.6); g.userData.halo = halo; if (par) par.add(g); return g; }
// junk rat (critter): body, head, ears, tail, a tin-can helmet; faces +x
const RAT = bake([[gSph, T(0, .35, 0, 0, 0, 0, .9, .5, .5), '#6e6258'], [gSph, T(.5, .42, 0, 0, 0, 0, .45, .36, .34), '#7a6e62'], [gCone, T(.78, .4, 0, 0, 0, -PI / 2, .2, .3, .2), '#8a7e70'],
  [gSph, T(.88, .4, 0, 0, 0, 0, .07, .07, .07), '#d98a8f'], [gSph, T(.42, .66, .14, 0, 0, 0, .18, .2, .06), '#c79a8a'], [gSph, T(.42, .66, -.14, 0, 0, 0, .18, .2, .06), '#c79a8a'],
  [gSph, T(.66, .5, .1, 0, 0, 0, .06, .06, .06), '#111111'], [gSph, T(.66, .5, -.1, 0, 0, 0, .06, .06, .06), '#111111'], [gCyl, T(.48, .66, 0, 0, 0, .3, .2, .16, .2), '#9a9a92'],
  [gCyl, T(-.75, .3, 0, 0, 0, 1.2, .05, .9, .05), '#c79a8a'], [gSph, T(.2, .1, .2, 0, 0, 0, .14, .1, .12), '#5e5248'], [gSph, T(.2, .1, -.2, 0, 0, 0, .14, .1, .12), '#5e5248'], [gSph, T(-.25, .1, .2, 0, 0, 0, .14, .1, .12), '#5e5248'], [gSph, T(-.25, .1, -.2, 0, 0, 0, .14, .1, .12), '#5e5248']]);
const FISHG = bake([[gSph, T(0, 0, 0, 0, 0, 0, .7, .32, .18), '#c9a24a'], [gCone, T(-.45, 0, 0, 0, 0, PI / 2, .28, .3, .07), '#b08a3a'], [gSph, T(.24, .05, .06, 0, 0, 0, .06, .06, .04), '#111111'], [gSph, T(.24, .05, -.06, 0, 0, 0, .06, .06, .04), '#111111']]);
const BOBG = bake([[gSph, T(0, 0, 0, 0, 0, 0, .26, .26, .26), '#e8e0d0'], [gSph, T(0, .05, 0, 0, 0, 0, .27, .16, .27), '#d9534f'], [gCyl, T(0, .2, 0, 0, 0, 0, .025, .2, .025), '#3f2616']]);
const RODG = bake([[gCyl, T(0, 1.2, 0, 0, 0, 0, .05, 2.4, .05), '#7a5a3c'], [gCyl, T(0, .25, 0, 0, 0, 0, .08, .5, .08), '#3f2616'], [gCyl, T(.07, .45, 0, 0, 0, PI / 2, .1, .06, .1), '#9a9a92'], [gCyl, T(0, 2.1, 0, 0, 0, 0, .03, .6, .03), '#c9a24a']]);
const BIRDG = bake([[gBox, T(-.32, .08, 0, 0, 0, .35, .7, .04, .22), '#2a2420'], [gBox, T(.32, .08, 0, 0, 0, -.35, .7, .04, .22), '#2a2420'], [gSph, T(0, 0, 0, 0, 0, 0, .16, .12, .4), '#3a302a']]);
const GULLB = bake([[gSph, T(0, 0, 0, 0, 0, 0, .9, .45, .45), '#efeae0'], [gSph, T(.5, .15, 0, 0, 0, 0, .38, .34, .32), '#f4f0e6'], [gCone, T(.78, .12, 0, 0, 0, -PI / 2, .1, .3, .1), '#e8a63a'], [gSph, T(.6, .25, .12, 0, 0, 0, .05, .05, .05), '#111111'], [gSph, T(.6, .25, -.12, 0, 0, 0, .05, .05, .05), '#111111'], [gCone, T(-.6, .05, 0, 0, 0, PI / 2, .3, .4, .12), '#8a8478']]);
const GULLW = bake([[gBox, T(0, 0, .8, 0, 0, 0, .5, .05, 1.5), '#d8d2c6'], [gBox, T(0, 0, -.8, 0, 0, 0, .5, .05, 1.5), '#d8d2c6'], [gBox, T(-.05, 0, 1.4, 0, 0, 0, .35, .06, .4), '#3a3a3a'], [gBox, T(-.05, 0, -1.4, 0, 0, 0, .35, .06, .4), '#3a3a3a']]);
const BUCKG = bake([[gCyl, T(0, .35, 0, 0, 0, 0, .7, .7, .7), '#8a8a82'], [gCyl, T(0, .71, 0, 0, 0, 0, .74, .04, .74), '#6a6a62'], [new THREE.TorusGeometry(.38, .02, 4, 16, PI), T(0, .72, 0), '#4a4a44']]);

/* ======================= side scroller: paths in forest rooms ======================= */
const pathCache = {};
function paths() {   // per seed: { roomIndex: x (logical px) }. ~40% of plain forest rooms; at least one per run (never boss rooms or room 1)
  const key = G.seed; if (pathCache[key] && pathCache[key].w === G.world) return pathCache[key].m;
  const m = {}, rooms = G.world.rooms, ok = r => r.i > 0 && !/^boss/.test(r.kind);
  const pick = (r, rr) => { const bad = []; r.holes.forEach(h => bad.push([h.x0 - 30, h.x1 + 30])); r.pools.forEach(p => bad.push([p.x0 - 30, p.x1 + 30])); (r.vines || []).forEach(v => bad.push([v.ax - 30, v.ax + 30]));
    for (let k = 0; k < 30; k++) { const x = 60 + Math.floor(rr() * 200); if (!bad.some(b => x > b[0] && x < b[1]) && !r.trees.some(t => Math.abs(X(t.x + t.w / 2) - X(x)) < 2.6)) return x; } return null; };
  for (const r of rooms) { if (!ok(r)) continue; const rr = mulberry(hash(G.seed + '|fishpath|' + r.i)); if (rr() < .4) { const x = pick(r, rr); if (x !== null) m[r.i] = x; } }
  if (!Object.keys(m).length) for (const r of rooms) { if (!ok(r)) continue; const x = pick(r, mulberry(hash(G.seed + '|fishpath2|' + r.i))); if (x !== null) { m[r.i] = x; break; } }
  pathCache[key] = { w: G.world, m }; return m;
}
const meander = z => Math.sin(z * .18) * .9 * sstep(-3, -10, z);
const sideGroundY = (x, z) => z < -6 ? A.bankH(x, z) : A.frontH(x, z) + .03;
const side = { group: null, key: '', x: null, mist: null, mistD: [], gate: null, debug: null, cleared: 0 };
function roomPathX() { if (!G.world) return null; if (side.debug && side.debug.room === G.room && side.debug.seed === G.seed) return side.debug.x; const m = paths(); return m[G.room] === undefined ? null : m[G.room]; }
function disposeSide() { if (!side.group) return; side.group.traverse(o => { if (o.geometry && o.geometry !== GATE && o.geometry !== A.gQuad && o.geometry !== gSph) o.geometry.dispose(); }); if (side.group.parent) side.group.parent.remove(side.group); side.group = null; }
function buildSide() {   // the path art: a dirt trail off the lane, the gate, mist cards down the trail (5 draw calls)
  disposeSide(); side.x = roomPathX(); side.key = G.seed + '#' + G.room; if (side.x === null) return;
  const px = X(side.x), grp = new THREE.Group(); side.group = grp; A.roomGroup.add(grp);
  const L = 36, g = new THREE.PlaneGeometry(1, L, 4, 60); g.rotateX(-PI / 2); const p = g.attributes.position, col = new Float32Array(p.count * 3), c2 = new THREE.Color(), c3 = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const u = p.getX(i), z = -2 - (p.getZ(i) + L / 2), w = lerp(2.5, 1.5, sstep(-2, -30, z)), x = px + meander(z) + u * w; p.setXYZ(i, x, sideGroundY(x, z) + .07, z);
    const e = Math.abs(u) * 2, n = fbm(x * .7, z * .7); _c.set('#b0915f').lerp(c2.set('#7e6a48'), sstep(-6, -30, z) * .7).lerp(c3.set('#5e7a40'), Math.max(0, Math.min(1, sstep(.55, 1, e) * .7 + (n - .5) * .3)));
    if (z > -3) _c.multiplyScalar(.7 + .3 * sstep(-2, -3, z)); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  side.trailM = side.trailM || A.artify(reg(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2 })), 'fwtrail', [{ t: 'path', sc: .45, st: .7 }]);
  mesh(g, side.trailM, grp).name = 'fwTrail';
  side.haloM = side.haloM || addM(A.texGlow, '#ffcf7a', .8); side.mistM = side.mistM || softM('#e8f0e2', .55);   // made once and reused: a new pair per side room build was a slow material leak
  const gz = -6.2, gate = mkGate(grp, side.haloM); gate.position.set(px + meander(gz), sideGroundY(px, gz) - .1, gz); gate.rotation.y = .05; side.gate = gate;
  const n = 12; side.mist = billboards(n, side.mistM, grp); side.mist.renderOrder = 6;
  side.mistD = Array.from({ length: n }, (_, k) => { const z = -9 - k * 2.4; return { z, x: px + meander(z) + (k % 2 ? 1 : -1) * (.5 + (k * 37 % 10) / 10), y: 1.6 + (k % 3) * .9, s: 5 + (k * 53 % 10) / 2, p: k * 1.7 }; });
  clearCorridor(px);
}
// move the room's instanced trees / rocks / ferns that stand on the trail sideways (visual only; lane props untouched)
function clearCorridor(px) {
  const trunks = [], R = A.roomGroup; let moved = 0;
  R.children.forEach(m => { if (!m.isInstancedMesh || m.geometry !== gTr) return; for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, _m); _v.setFromMatrixPosition(_m); const cx = px + meander(_v.z);
    if (_v.z < -4.5 && _v.z > -40 && Math.abs(_v.x - cx) < 2.6) { const dx = (_v.x >= cx ? 1 : -1) * 3.4 - (_v.x - cx) * .2; trunks.push([_v.x, _v.z, dx]); _m.elements[12] += dx; m.setMatrixAt(i, _m); moved++; } } m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); });
  R.children.forEach(m => { if (!m.isInstancedMesh || m === side.mist || m.geometry === gTr) return; let ch = false;
    for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, _m); _v.setFromMatrixPosition(_m); let dx = 0;
      for (const t of trunks) if (Math.abs(_v.x - t[0]) < 6 && Math.abs(_v.z - t[1]) < 4.5) { dx = t[2]; break; }
      if (!dx && _v.z < -4.5 && _v.z > -40 && _v.y < 6 && Math.abs(_v.x - (px + meander(_v.z))) < 1.7) dx = (_v.x >= px + meander(_v.z) ? 1 : -1) * 2.2;
      if (dx) { _m.elements[12] += dx; m.setMatrixAt(i, _m); ch = true; } }
    if (ch) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); } });
  side.cleared = moved;
}

/* ---- walk-in (G.state 'fishin') ---- */
const WALK = { chain: { swing: [2.3, 3.8], fade: [4.4, 5.4], zEnd: -24, dur: 5.4 }, side: { swing: null, fade: [3.9, 4.9], zEnd: -21, dur: 4.9 }, swing: { swing: [0, 1.5], fade: [3.3, 4.3], zEnd: -20, dur: 4.3 } };
const wk = { on: false, mode: 'chain', t: 0, z: 0, x: 0, camFrom: null, lookFrom: null, phases: [], fog0: null };
function startWalk(mode) {
  if (G.state !== 'play' || G.freeze || !G.p) return false;   // not while a cutscene or T mode holds the game
  let x = roomPathX(); if (x === null || mode !== 'chain' && Math.abs(G.p.x - x) > 18) { side.debug = { room: G.room, seed: G.seed, x: Math.max(40, Math.min(280, G.p.x)) }; buildSide(); x = side.x; }
  Object.assign(wk, { on: true, mode, t: 0, z: 0, x, camFrom: null, phases: [] }); G.state = 'fishin'; G.p.x = x; G.p.hook = null; G.p.vx = 0; G.p.inv = 0; G.p.blocking = false;
  F.ret = { room: G.room, x, seed: G.seed }; promptEl.style.display = 'none'; F.promptTxt = ''; A.resetInput(); A.sfx(330, .2, 'triangle'); return true;
}
function walkPhase() { const w = WALK[wk.mode], t = wk.t; if (t >= w.fade[0]) return 'fade'; if (w.swing && t >= w.swing[0]) return 'swing'; return t < .35 ? 'turn' : 'side'; }
function stepWalk(dt) {
  const w = WALK[wk.mode]; wk.t += dt; const spd = Math.min(1, wk.t / .6);
  wk.z = Math.max(w.zEnd, wk.z - dt * spd * (Math.abs(w.zEnd) / (w.dur - .3))); G.p.vx = 55; G.p.step += 55 * dt; G.p.onGround = true; G.p.face = 1;
  const ph = walkPhase(); if (wk.phases[wk.phases.length - 1] !== ph) wk.phases.push(ph);
  fadeEl.style.opacity = sstep(w.fade[0], w.fade[1], wk.t).toFixed(3);
  if (wk.t >= w.dur) { wk.on = false; enter3D(); }
}
function afterSide(dt) {   // after the side scroller's camera + hero sync: path art per frame, and the walk-in overrides
  if (G.state === 'play' && side.key !== G.seed + '#' + G.room) buildSide();
  if (side.group) { const q = A.camera.quaternion, t = A.VT(); side.mistD.forEach((m, i) => { _o.position.set(m.x + Math.sin(t * .2 + m.p) * .8, sideGroundY(m.x, m.z) + m.y + Math.sin(t * .3 + m.p) * .2, m.z); _o.quaternion.copy(q); _o.scale.set(m.s * 1.6, m.s, 1); _o.updateMatrix(); side.mist.setMatrixAt(i, _o.matrix); });
    side.mist.instanceMatrix.needsUpdate = true; side.gate.userData.halo.quaternion.copy(q); side.gate.userData.halo.material.opacity = .6 + Math.sin(t * 3) * .2; }
  if (G.state !== 'fishin') return;
  const pl = A.pl, b = A.buddy, hx = X(wk.x) + meander(wk.z), gy = sideGroundY(hx, wk.z);
  pl.root.position.set(hx, gy, wk.z); pl.root.rotation.y = hold(pl.root.rotation.y, PI / 2, dt, wk.t < .35 ? 10 : 20); pl.root.visible = true; pl.shadow.position.set(hx, gy + .07, wk.z);
  const bz = Math.min(1.2, wk.z + 2.4), bx = X(wk.x) + meander(bz) + .9; b.root.visible = true; b.root.position.set(bx, sideGroundY(bx, bz), bz); b.root.rotation.y = PI / 2; b.ph = (b.ph || 0) + dt * 9; A.poseBuddy(b, dt, { mv: 1, air: 0, look: .3, lookAmt: .4, wave: 0, deep: 0 });
  const W_ = WALK[wk.mode], fog = A.scene.fog; if (wk.fog0 === null) wk.fog0 = fog.density; fog.density = wk.fog0 + sstep(W_.fade[0] - 1.2, W_.fade[1], wk.t) * .05;
  if (W_.swing && wk.t >= W_.swing[0]) {
    const cam = A.camera; if (!wk.camFrom) { wk.camFrom = cam.position.clone(); wk.lookFrom = new V3(hx, gy + 1.6, 0); }
    const s = sstep(W_.swing[0], W_.swing[1], wk.t); _v.set(hx, gy + 2.5, wk.z + 5.2); _v2.set(hx, gy + 1.5, wk.z - 6);
    cam.position.lerpVectors(wk.camFrom, _v, s); _v3.lerpVectors(wk.lookFrom, _v2, s); cam.position.y += Math.sin(s * PI) * 2.2; cam.lookAt(_v3);
  }
}

/* ======================= 3D world ======================= */
const fscene = new THREE.Scene(), fcam = new THREE.PerspectiveCamera(58, 16 / 9, .3, 420);
const FOG = '#c6d6c0'; fscene.background = new THREE.Color(FOG); fscene.fog = new THREE.FogExp2(FOG, .0145);
const fhemi = new THREE.HemisphereLight('#dff0d8', '#6d4c2d', 1.15), fsun = new THREE.DirectionalLight('#ffd49a', 2.4), ffill = new THREE.DirectionalLight('#ffe7c8', .5);
fscene.add(fhemi, fsun, fsun.target, ffill); ffill.position.set(30, 20, 40);
const SUN = new V3(-30, 42, -20); fsun.shadow.mapSize.set(2048, 2048); { const c = fsun.shadow.camera; c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 1; c.far = 140; } fsun.shadow.bias = -.0006; fsun.shadow.normalBias = .06;
const fsky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  uniforms: { uTop: { value: new THREE.Color('#6aa9a2') }, uMid: { value: new THREE.Color('#cfe0c2') }, uHor: { value: new THREE.Color(FOG) }, uSun: { value: SUN.clone().normalize() } },
  vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 uTop,uMid,uHor,uSun; varying vec3 vD; void main(){ vec3 d=normalize(vD); float h=clamp(d.y,0.,1.); vec3 c=mix(uHor,uMid,smoothstep(0.,.25,h)); c=mix(c,uTop,smoothstep(.2,.9,h)); float s=max(dot(d,uSun),0.); c+=vec3(1.,.82,.5)*(pow(s,6.)*.25+pow(s,60.)*.7); gl_FragColor=vec4(c,1.); }' }));
fsky.frustumCulled = false; fsky.renderOrder = -10; fscene.add(fsky);
/* far-shore ring: one painted band of woods all round the lake, past the hills (art/ring-tex.js, WebP with alpha, repeats sideways).
   It sits beyond the fog, so the fog cannot reach it: the shader mixes it toward the live fog colour instead (hazy by day, dark at night,
   like the rest of the horizon). Seen from inside, so BackSide with a mirrored repeat. No file = no ring (the fog shows, as before). */
const RING = { R: 270, REP: 3, Y: 62, HAZE: .3, FOG0: .0096, HI0: 1.15, HMAX: .9 };   // radius, repeats round the circle, band bottom height, mix toward fog (0 = none); haze scales with fog density / FOG0 (mist, rain), brightness with hemi light / HI0 (dusk, night), haze capped at HMAX
const FARU = { uFogC: { value: fscene.fog.color }, uHaze: { value: RING.HAZE }, uLit: { value: 1 } };   // shared by the ring and the far cards; the fog colour object itself, so skyRender's changes reach them
function farMat(src, rep, wrapS) {   // a hazed, lit, see-through far material (BackSide, mirrored repeat: it is seen from inside the circle); the picture swaps in once loaded
  const m = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: .5, fog: false, depthWrite: false, side: THREE.BackSide, toneMapped: false, visible: false });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, FARU);
    sh.fragmentShader = 'uniform vec3 uFogC; uniform float uHaze, uLit;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb * uLit, uFogC, uHaze);'); };
  const im = new Image(); im.onload = () => { const t = new THREE.CanvasTexture(im); t.wrapS = wrapS; t.wrapT = 1001; t.repeat.set(-rep, 1); if (wrapS === 1001) t.offset.set(1, 0);   // 1000 repeat, 1001 clamp (slim bundle)
    t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.visible = true; m.needsUpdate = true; }; im.src = src;
  return m;
}
let fring = null, fcards = null;   // built on the first fishing visit, once art/ring-tex.js and art/far-tex.js have arrived (farArt below)
const mkRing = () => { const P = window.JR_RING; if (!P || !P.src) return null;
  const h = TAU * RING.R / RING.REP * P.h / P.w, g = new THREE.CylinderGeometry(RING.R, RING.R, h, 96, 1, true); g.translate(0, h / 2 + RING.Y, 0);
  const ring = new THREE.Mesh(g, farMat(P.src, RING.REP, 1000)); ring.renderOrder = -9; ring.frustumCulled = false; ring.name = 'ring'; fscene.add(ring); return { mesh: ring, haze: FARU.uHaze, lit: FARU.uLit, h }; };

// ---- terrain: a misty lake basin. lakeR(theta) = shoreline radius; inlets for the hidden coves ----
const angD = (a, b) => { let d = a - b; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };
const bump = (th, c, w) => { const d = angD(th, c) / w; return Math.exp(-d * d); };
const TH = { falls: -PI / 2, cliffs: -.8, sunk: .05, junk: .85, dock: PI / 2 - .2, marsh: PI };
/* far-shore cards (art/far-tex.js): each spot's landmark seen from far off (the cabin, the reeds, the cliffs, the junk heap, the falls, the sunken tree),
   a slice of a circle just inside the ring at that spot's bearing, bottom on the ring's baseline, hazed and lit with the ring. No file = no cards. */
const FARC = { R: 262, W: 300, Y: RING.Y + 10 };   // radius (just inside the ring), card width along the circle, bottom height (a little above the ring baseline, so the landmark clears the hills)
const mkCards = () => { const P = window.JR_FAR; if (!P) return null; const out = {};
  for (const id of Object.keys(TH)) { const c = P[id]; if (!c || !c.src) continue;
    const len = FARC.W / FARC.R, h = FARC.W * c.h / c.w, a = PI / 2 - TH[id];   // three's cylinder angle runs from +z toward +x; the lake's bearing from +x toward +z
    const g = new THREE.CylinderGeometry(FARC.R, FARC.R, h, 24, 1, true, a - len / 2, len); g.translate(0, h / 2 + FARC.Y, 0);
    const card = new THREE.Mesh(g, farMat(c.src, 1, 1001)); card.renderOrder = -8; card.frustumCulled = false; card.name = 'far-' + id; fscene.add(card); out[id] = card; }
  return out; };
const FAR_ART = { asked: false, err: [] };
function farArt() {   // first visit: fetch the ring and card art (script tags), then build them; a missing file only drops that piece
  if (FAR_ART.asked) return; FAR_ART.asked = true;
  const need = [['JR_RING', 'art/ring-tex.js', () => { if (!fring) fring = mkRing(); }], ['JR_FAR', 'art/far-tex.js', () => { if (!fcards) fcards = mkCards(); }]];
  for (const [g, src, build] of need) { if (window[g]) { build(); continue; } const s = document.createElement('script'); s.src = src; s.onload = build; s.onerror = () => FAR_ART.err.push(src); document.head.appendChild(s); }
}
const lakeR = th => 40 + 6 * Math.sin(3 * th + .6) + 3.5 * Math.sin(5 * th + 2.1) + 2 * Math.sin(9 * th + .3) + 13 * bump(th, TH.falls, .09) + 10 * bump(th, TH.sunk, .1);
const GP = { x: -47, z: 35 };          // glint pool (hidden), up in the south-west woods
const FZC = -lakeR(TH.falls);          // far end of the waterfall cove (the falls stand just behind it)
const trailX = z => Math.sin(z * .09) * 3;
function H0(x, z, raw) {
  const r = Math.hypot(x, z), th = Math.atan2(z, x), R = lakeR(th), d = r - R, n = fbm(x * .06 + 3, z * .06 + 7);
  let h = d < 0 ? Math.max(-4.5, d * .38) : d * .1 + (n - .45) * 2.6 * sstep(3, 16, d);
  const ms = bump(th, TH.marsh, .42) * (1 - sstep(8, 20, Math.abs(d)));
  if (ms > 0) h = lerp(h, d < 0 ? Math.max(-.5, d * .04) : Math.min(h, .15 + d * .02), ms);
  h += bump(th, TH.cliffs, .3) * sstep(.5, 3.5, d) * 9 * (.8 + .4 * n);
  h += bump(th, TH.falls, .22) * sstep(2.2, 5.5, d) * 12;
  h += bump(th, TH.sunk, .25) * sstep(2.5, 7, d) * 2.2;
  h += sstep(62, 84, r) * (14 + 10 * n);
  const tc = Math.abs(x - trailX(z)); h = lerp(h, .3 + Math.max(0, z - 40) * .05, (1 - sstep(2.5, 5.5, tc)) * sstep(36, 40, z) * (1 - sstep(70, 74, z)));
  const gp = Math.hypot(x - GP.x, z - GP.z); if (gp < 9) h = lerp(h, -1.5, 1 - sstep(4.2, 7.5, gp));
  if (!raw && Math.abs(x) < 3.6 && z < FZC + 2.5 && z > FZC - 12) { const t = z - FZC, k = (1 - sstep(1.9, 3.3, Math.abs(x))) * sstep(2, -.2, t) * sstep(-11.6, -10.4, t); if (k > 0) h = Math.min(h, lerp(h, -1.7, k)); }   // the hidden cave channel behind the falls
  return h;
}
const TS = 180;
let tGrid = null, tN = 0;
function groundH(x, z) {   // same triangles as the terrain mesh, so feet match the ground
  if (!tGrid) return H0(x, z);
  const fx = (x / TS + .5) * tN, fz = (z / TS + .5) * tN, ix = Math.max(0, Math.min(tN - 1, Math.floor(fx))), iz = Math.max(0, Math.min(tN - 1, Math.floor(fz))), u = Math.min(1, Math.max(0, fx - ix)), v = Math.min(1, Math.max(0, fz - iz)), W1 = tN + 1;
  const a = tGrid[iz * W1 + ix], b = tGrid[iz * W1 + ix + 1], c = tGrid[(iz + 1) * W1 + ix], d = tGrid[(iz + 1) * W1 + ix + 1];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
const shoreAt = th => { const R = lakeR(th); return { x: Math.cos(th) * R, z: Math.sin(th) * R }; };
const W3 = { built: false, group: null, spots: [], rocks: [], dock: null, boat: null, gate: null, fx: {} };
function buildWorld() {
  if (W3.built) return; W3.built = true; farArt(); const t0 = performance.now(), hi = QL().name !== 'LOW', rng = mulberry(hash('fishworld-v1')), r = (a, b) => a + rng() * (b - a);
  const grp = new THREE.Group(); W3.group = grp; fscene.add(grp); const c2 = new THREE.Color();
  // terrain
  tN = hi ? 150 : 100; const g = new THREE.PlaneGeometry(TS, TS, tN, tN); g.rotateX(-PI / 2); const p = g.attributes.position; tGrid = new Float32Array(p.count); const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const h = H0(p.getX(i), p.getZ(i)); p.setY(i, h); tGrid[i] = h; }
  g.computeVertexNormals(); const nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), h = tGrid[i], ny = nr.getY(i), n = fbm(x * .11, z * .11), n2 = fbm(x * .5 + 9, z * .5), rr = Math.hypot(x, z);
    _c.set('#5a9440').lerp(c2.set('#9cba52'), sstep(.35, .8, n)).lerp(c2.set('#b8a860'), sstep(.6, .95, n2) * .35);
    if (h < .9) _c.lerp(c2.set(n2 < .5 ? '#c9a46a' : '#b8925c'), 1 - sstep(.2, .9, h));
    if (h < .05) _c.set('#8a7048').lerp(c2.set('#6a5a40'), n2);
    if (ny < .8) _c.lerp(c2.set(n2 < .5 ? '#9a8a72' : '#b0a088'), sstep(.8, .62, ny));
    if (z > 36 && z < 72) _c.lerp(c2.set('#c8a470'), (1 - sstep(1.2, 2.6, Math.abs(x - trailX(z)) + (n2 - .5))) * .9);
    { const th_ = Math.atan2(z, x); if (th_ > -.8 && h > .15) { const pr = Math.abs(rr - lakeR(th_) - 3.2 - Math.sin(th_ * 7) * .8); _c.lerp(c2.set('#b08458'), (1 - sstep(.6, 1.5, pr + (n2 - .5) * .8)) * .85); } }   // worn dirt path along the shore to the open spots
    if (rr > 64) _c.lerp(c2.set('#3f7a4a'), sstep(64, 80, rr) * .5);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const PMw = worldMats(), tm = PMw.terr;   // impasto world materials (this world's own)
  mesh(g, tm, grp).name = 'terrain';
  const wg = new THREE.PlaneGeometry(TS * 1.6, TS * 1.6, hi ? 160 : 80, hi ? 160 : 80); wg.rotateX(-PI / 2); const water = mesh(wg, PMw.water, grp); water.renderOrder = 2; water.name = 'water'; W3.water = water; water.receiveShadow = false;
  // spots
  const at = (th, inset) => { const R = lakeR(th) - inset; return { x: Math.cos(th) * R, z: Math.sin(th) * R }; };
  const dockS = shoreAt(TH.dock); let dz = 30; for (let z = 50; z > 0; z -= .25) if (H0(dockS.x, z) < 0) { dz = z; break; }
  const dock = W3.dock = { x: dockS.x, z0: dz + 3, z1: dz - 11, y: .75, w: 2.6 };
  W3.spots = [
    Object.assign({ id: 'dock', name: 'the old dock', r: 9, hidden: false }, { x: dock.x, z: dock.z1 - 4 }),
    Object.assign({ id: 'marsh', name: 'reed marsh', r: 13, hidden: false }, at(TH.marsh, 6)),
    Object.assign({ id: 'cliffs', name: 'rocky cliffs', r: 10, hidden: false }, at(TH.cliffs, 5)),
    Object.assign({ id: 'junk', name: 'junk shore', r: 9, hidden: false }, at(TH.junk, 4)),
    Object.assign({ id: 'falls', name: 'waterfall cove', r: 6, hidden: true, clue: 'birds circling' }, at(TH.falls, 4)),
    Object.assign({ id: 'sunk', name: 'sunken-tree inlet', r: 6.5, hidden: true, clue: 'ripples and bubbles' }, at(TH.sunk, 4.5)),
    { id: 'glint', name: 'glint pool', x: GP.x, z: GP.z, r: 4.6, hidden: true, clue: 'glints on the water' }
  ];
  W3.spots.forEach(s => { s.found = !s.hidden; });
  // trees (instanced trunks + crowns), dense around the glint pool
  const trunks = [], crowns = [], TC = ['#6b4f38', '#5e4a38', '#7a5a3c'], LC = ['#3d7f45', '#2f6f3f', '#4a8a3c', '#56803a', '#356a48'];
  const okTree = (x, z) => { const h = H0(x, z), d = Math.hypot(x, z) - lakeR(Math.atan2(z, x)); if (h < .25 || d < 3) return false; if (Math.abs(x - trailX(z)) < 4.5 && z > 34) return false; if (Math.abs(x - dock.x) < 5 && z > dock.z1 - 2 && z < dock.z0 + 6) return false; if (Math.hypot(x - GP.x, z - GP.z) < 7.5) return false; return Math.hypot(x, z) < 88; };
  const tree = (x, z, s) => { const y = H0(x, z) - .3, ht = 9 + rng() * 6 * s; trunks.push({ x, y, z, sx: .9 * s, sy: ht, sz: .9 * s, ry: rng() * TAU, c: TC[Math.floor(rng() * 3)] }); W3.rocks.push({ x, z, r: .5 * s });
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + rng(), rr = s * (1.2 + rng()); crowns.push({ x: x + Math.cos(a) * rr, y: y + ht - .5 + rng() * 1.5, z: z + Math.sin(a) * rr, sx: s * (3 + rng() * 1.5), sy: 2.2 + rng(), sz: s * (3 + rng() * 1.5), ry: rng() * 6, c: LC[Math.floor(rng() * 5)] }); }
    crowns.push({ x, y: y + ht + 1, z, sx: s * 3.4, sy: 2.4, sz: s * 3.4, ry: rng() * 6, c: LC[Math.floor(rng() * 5)] }); };
  const NT = hi ? 95 : 55; for (let k = 0, n = 0; n < NT && k < 3000; k++) { const a = rng() * TAU, rr = 40 + rng() * 46, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (okTree(x, z)) { tree(x, z, .8 + rng() * .7); n++; } }
  for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, x = GP.x + Math.cos(a) * (9 + rng() * 3), z = GP.z + Math.sin(a) * (9 + rng() * 3); if (k !== 0 && k !== 13) tree(x, z, 1 + rng() * .4); }   // gap at k 13/0 = the way in (east side)
  for (let k = 0; k < 9; k++) { const th = TH.marsh + (rng() - .5) * .8, s = shoreAt(th), f = 1 - rng() * .2, x = s.x * f, z = s.z * f; trunks.push({ x, y: H0(x, z) - .3, z, sx: .5, sy: 4 + rng() * 4, sz: .5, rz: (rng() - .5) * .3, ry: rng() * 6, c: '#6a5a48' }); }   // dead marsh snags
  // detail: bushes, fallen logs, stumps, driftwood. They ride the existing trunk / crown batches (no new draw calls). LOW gets about half.
  const DQ = hi ? 1 : .45, onLand = (x, z) => { const h = H0(x, z); return h > .3 && h < 8 && Math.hypot(x, z) < 80 && !(Math.abs(x - dock.x) < 3.5 && z > dock.z1 - 1 && z < dock.z0 + 4) && !(Math.abs(x - trailX(z)) < 3 && z > 36); };
  for (let k = 0, n = 0; n < 70 * DQ && k < 4000; k++) { const a = rng() * TAU, R = r(lakeR(a) + 4, 80), x = Math.cos(a) * R, z = Math.sin(a) * R; if (!onLand(x, z)) continue; n++; const h = H0(x, z), s = .8 + rng() * .9;
    crowns.push({ x, y: h + .35 * s, z, sx: 1.5 * s, sy: 1 * s, sz: 1.4 * s, ry: rng() * 6, c: LC[Math.floor(rng() * 5)] }); if (rng() < .5) crowns.push({ x: x + .6 * s, y: h + .25 * s, z: z - .4 * s, sx: 1 * s, sy: .7 * s, sz: 1 * s, ry: rng() * 6, c: LC[Math.floor(rng() * 5)] }); }   // bushes
  for (let k = 0, n = 0; n < 12 * DQ + 4 && k < 2000; k++) { const a = rng() * TAU, R = r(46, 78), x = Math.cos(a) * R, z = Math.sin(a) * R; if (!onLand(x, z)) continue; n++; const h = H0(x, z);
    trunks.push({ x, y: h + .3, z, sx: .7, sy: 3 + rng() * 3, sz: .7, rx: PI / 2, ry: rng() * 6, c: '#5e4a38' }); const sx_ = x + r(-4, 4), sz_ = z + r(-4, 4); if (onLand(sx_, sz_)) trunks.push({ x: sx_, y: H0(sx_, sz_) - .1, z: sz_, sx: .95, sy: .6 + rng() * .5, sz: .95, ry: rng() * 6, c: '#6b4f38' }); }   // fallen logs + stumps
  for (let k = 0; k < 18 * DQ + 4; k++) { const a = rng() * TAU, s = shoreAt(a), f = 1 + r(.02, .07), x = s.x * f, z = s.z * f, h = H0(x, z); if (h < -.2 || h > 1.2 || (Math.abs(x - dock.x) < 3.5 && z > dock.z1 - 1 && z < dock.z0 + 4)) continue;
    trunks.push({ x, y: h + .08, z, sx: .22 + rng() * .1, sy: 1.5 + rng() * 2, sz: .22, rx: PI / 2, ry: rng() * 6, rz: (rng() - .5) * .2, c: rng() < .5 ? '#b8a68a' : '#a89478' }); }   // bleached driftwood on the shore
  inst(gTr, PMw.bark, trunks, grp, true); inst(gBlob, PMw.leaf, crowns, grp, true);
  // ground cover: grass on land, reeds + cattails + lilies in the marsh and the inlet, rocks on the cliffs and the cove mouth
  const grass = [], reeds = [], cats = [], lily = [], lflow = [], rocks = [];
  for (let k = 0, n = 0; n < (hi ? 900 : 300) && k < 9000; k++) { const x = r(-80, 80), z = r(-80, 80), h = H0(x, z); if (h < .25 || h > 9 || Math.hypot(x, z) > 82) continue; n++; grass.push({ x, y: h - .03, z, sx: .9 + rng() * .8, sy: .7 + rng() * 1.1, sz: .9 + rng() * .8, ry: rng() * 6, c: rng() < .3 ? '#c4d86a' : rng() < .5 ? '#88c860' : '#5cae52' }); }
  for (let k = 0, n = 0; n < (hi ? 420 : 180) && k < 9000; k++) { const th = rng() < .75 ? TH.marsh + (rng() - .5) * 1.1 : rng() * TAU, R = lakeR(th) + r(-9, 4), x = Math.cos(th) * R, z = Math.sin(th) * R, h = H0(x, z); if (h < -.6 || h > .5) continue; n++;
    reeds.push({ x, y: h - .1, z, sx: .7 + rng() * .5, sy: 2.2 + rng() * 1.6, sz: .7 + rng() * .5, ry: rng() * 6, c: rng() < .5 ? '#8a9a4a' : '#6f8a3a' }); if (rng() < .25) cats.push({ x: x + .1, y: h + 1.7 + rng() * .8, z, sx: .12, sy: .5, sz: .12, c: '#6a4426' }); }
  for (let k = 0, n = 0; n < (hi ? 110 : 50) && k < 5000; k++) { const near = rng(), th = near < .55 ? TH.marsh + (rng() - .5) * .9 : near < .8 ? TH.sunk + (rng() - .5) * .25 : rng() * TAU, R = lakeR(th) - r(1, 9), x = Math.cos(th) * R, z = Math.sin(th) * R, h = H0(x, z); if (h > -.25) continue; n++;
    lily.push({ x, y: .03, z, sx: .8 + rng() * .9, sy: 1, sz: .8 + rng() * .9, ry: rng() * 6, c: rng() < .5 ? '#4f8a3a' : '#3f7a34' }); if (rng() < .18) lflow.push({ x: x + .15, y: .15, z: z + .1, sx: .22, c: rng() < .5 ? '#f0b6c8' : '#ffffff' }); }
  const rock = (x, z, s, cc, big) => { rocks.push({ x, y: H0(x, z) + s * .15, z, sx: s * 1.3, sy: s * (.7 + rng() * .5), sz: s * 1.1, ry: rng() * 6, c: cc || (rng() < .5 ? '#8a8174' : '#6f7a6a') }); if (big) W3.rocks.push({ x, z, r: s * .62 }); };
  for (let k = 0; k < 26; k++) { const th = TH.cliffs + (rng() - .5) * .8, R = lakeR(th) + r(-1, 5); rock(Math.cos(th) * R, Math.sin(th) * R, 1 + rng() * 2.5, '#7a7366', true); }
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const th = TH.falls + s * (.2 + k * .035), R = lakeR(th) - 2.5 + k * 1.4; rock(Math.cos(th) * R, Math.sin(th) * R, 2 + rng() * 1.4, '#6f6a60', true); }   // boulders hide the cove mouth
  for (let k = 0; k < 40; k++) { const a = rng() * TAU, R = lakeR(a) + r(-.5, 6); rock(Math.cos(a) * R, Math.sin(a) * R, .4 + rng() * 1.3, null, false); }
  { const cz = FZC, CV = FT.CAVE; for (const [x, dz, y, sx, sy, sz] of CV.ROOF) rocks.push({ x: x + (rng() - .5) * .2, y, z: cz + dz, sx, sy, sz, ry: rng() * .3, c: CV.ROCK, nm: true });   // cave roof: solid lintel rocks from the cave ceiling up into the cliff (no gap, nothing floats), kept behind the falls sheet
    rocks.push({ x: 0, y: .6, z: cz - 12.2, sx: 4.2, sy: 3.6, sz: 2.2, ry: 0, c: '#24201c' }); }   // the dark back of the cave
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + .3, R = 6.2 + rng(); rock(GP.x + Math.cos(a) * R, GP.z + Math.sin(a) * R, .5 + rng() * .6, '#9a8f7e', false); }
  // detail: ferns, flower clumps, mushrooms, shore pebbles, moss on rocks, reed + lily variety, bird nests on the cliffs (existing batches)
  for (let k = 0, n = 0; n < 260 * DQ && k < 6000; k++) { const a = rng() * TAU, R = r(44, 78), x = Math.cos(a) * R, z = Math.sin(a) * R; if (!onLand(x, z)) continue; n++;
    grass.push({ x, y: H0(x, z) - .05, z, sx: 1.6 + rng(), sy: .8 + rng() * .6, sz: 1.6 + rng(), ry: rng() * 6, c: rng() < .5 ? '#3f7a3a' : '#2f6a3a' }); }   // ferns
  const FLC = ['#f2d24a', '#e86a8a', '#ffffff', '#b08ae8', '#f09a3a'];
  for (let k = 0, n = 0; n < 200 * DQ && k < 6000; k++) { const a = rng() * TAU, R = r(lakeR(a) + 2, 72), x = Math.cos(a) * R, z = Math.sin(a) * R; if (!onLand(x, z)) continue; n++; const h = H0(x, z), cc = FLC[Math.floor(rng() * 5)];
    for (let q = 0; q < 3; q++) lflow.push({ x: x + r(-.5, .5), y: h + .35 + rng() * .25, z: z + r(-.5, .5), sx: .13 + rng() * .07, c: cc }); }   // flower clumps
  for (let k = 0, n = 0; n < 60 * DQ && k < 4000; k++) { const a = rng() * TAU, R = r(46, 80), x = Math.cos(a) * R, z = Math.sin(a) * R; if (!onLand(x, z)) continue; n++; const h = H0(x, z);
    cats.push({ x, y: h + .1, z, sx: .07, sy: .22, sz: .07, c: '#efe6d2' }); lflow.push({ x, y: h + .24, z, sx: .2, sy: .09, sz: .2, c: rng() < .35 ? '#c8402e' : '#b89064' }); }   // mushrooms
  for (let k = 0, n = 0; n < 160 * DQ && k < 3000; k++) { const a = rng() * TAU, R = lakeR(a) + r(-.6, 1.8), x = Math.cos(a) * R, z = Math.sin(a) * R, h = H0(x, z); if (h < -.5 || h > 1) continue; n++;
    rock(x, z, .12 + rng() * .2, rng() < .4 ? '#a59a88' : rng() < .5 ? '#7d776c' : '#c2b6a0', false); }   // shore pebbles
  const cliffR = rocks.filter(o => o.c === '#7a7366' && o.sx > 2.4);
  rocks.filter(o => o.sx > 1.1).forEach((o, i) => { if (i % 5 < 2) (o.nm ? [] : lily).push({ x: o.x + o.sx * .1, y: o.y + o.sy * .82, z: o.z, sx: o.sx * .9, sy: 1, sz: o.sz * .8, rx: (rng() - .5) * .3, ry: rng() * 6, c: rng() < .5 ? '#5f8a3a' : '#4a7a36' }); });   // moss caps
  cliffR.slice(0, hi ? 4 : 2).forEach(o => { const y = o.y + o.sy * .9; lily.push({ x: o.x, y, z: o.z, sx: .9, sy: 1, sz: .9, c: '#7a5a34' }); cats.push({ x: o.x, y: y - .02, z: o.z, sx: .48, sy: .14, sz: .48, c: '#6a4a2a' }); for (let q = 0; q < 3; q++) lflow.push({ x: o.x + r(-.15, .15), y: y + .1, z: o.z + r(-.15, .15), sx: .13, sy: .1, sz: .1, c: '#cfe4ea' }); });   // bird nests with eggs
  for (let k = 0, n = 0; n < 140 * DQ && k < 6000; k++) { const th = rng() < .6 ? TH.marsh + (rng() - .5) * 1.2 : TH.sunk + (rng() - .5) * .5, R = lakeR(th) + r(-6, 2), x = Math.cos(th) * R, z = Math.sin(th) * R, h = H0(x, z); if (h < -.7 || h > .4) continue; n++;
    reeds.push({ x, y: h - .1, z, sx: .5 + rng() * .4, sy: rng() < .3 ? 3.6 + rng() * 1.2 : 1.2 + rng() * 1, sz: .5 + rng() * .4, ry: rng() * 6, c: rng() < .35 ? '#b0a860' : rng() < .5 ? '#5f7f3a' : '#9aa84e' }); }   // reed variety: tall pale + short green
  for (let k = 0, n = 0; n < 70 * DQ && k < 4000; k++) { const th = TH.marsh + (rng() - .5) * 1.1, R = lakeR(th) - r(1, 7), x = Math.cos(th) * R, z = Math.sin(th) * R; if (H0(x, z) > -.25) continue; n++; const s = rng() < .5 ? .35 + rng() * .3 : 1.2 + rng() * .6;
    lily.push({ x, y: .035, z, sx: s, sy: 1, sz: s, ry: rng() * 6, c: rng() < .3 ? '#6a9a44' : rng() < .5 ? '#3a6e34' : '#5a8a3a' }); if (rng() < .3) lflow.push({ x: x + .1, y: .14, z, sx: .2, c: rng() < .4 ? '#f6d2e0' : rng() < .5 ? '#ffffff' : '#f2e07a' }); }   // lily variety: small + large pads, pink / white / yellow flowers
  W3.detail = { hi, trunks: trunks.length, crowns: crowns.length, grass: grass.length, reeds: reeds.length, cats: cats.length, lily: lily.length, lflow: lflow.length, rocks: rocks.length };
  inst(A.gTuft, PMw.grass, grass, grp, false); inst(A.gTuft, PMw.grass, reeds, grp, false); inst(gCyl, A.M('#ffffff'), cats, grp, false);
  inst(A.gDisc, reg(new THREE.MeshLambertMaterial({ color: '#ffffff' })), lily, grp, false); inst(A.gIco, A.M('#ffffff'), lflow, grp, false); inst(gRock, PMw.stone, rocks, grp, true);
  // dock + rowboat (one baked mesh each)
  { const P = [], L = dock.z0 - dock.z1, cz = (dock.z0 + dock.z1) / 2;
    for (let k = 0; k < Math.floor(L / .55); k++) { const z = dock.z0 - .3 - k * .55; P.push([gBox, T(dock.x, dock.y - .06, z, (rng() - .5) * .05, 0, (rng() - .5) * .04, dock.w + (rng() - .5) * .2, .12, .48), rng() < .15 ? '#6a5236' : rng() < .5 ? '#8a6a44' : '#7d5f3c']); }
    for (let k = 0; k <= Math.floor(L / 2.6); k++) for (const s of [-1, 1]) P.push([gCyl, T(dock.x + s * (dock.w / 2 + .1), -1.2, dock.z0 - .5 - k * 2.6, 0, 0, (rng() - .5) * .1, .26, 4.2, .26), '#5e4a38']);
    P.push([gBox, T(dock.x - dock.w / 2 - .05, dock.y + .25, cz, 0, 0, 0, .1, .1, L * .95), '#6a5236']);
    P.push([gCyl, T(dock.x + .7, dock.y + .4, dock.z1 + 1.2, 0, 0, 0, .5, .7, .5), '#5a6e72'], [gCyl, T(dock.x - .6, dock.y + .25, dock.z1 + 2.4, 0, 0, 0, .4, .4, .4), '#9a5a3a'], [new THREE.TorusGeometry(.4, .12, 6, 12), T(dock.x - .55, dock.y + .1, dock.z0 - 3, PI / 2, 0, 0), '#2a2420']);
    P.push([gBox, T(dock.x + 1.1, dock.y + 1.1, dock.z0 - 1, 0, -.3, .06, .08, 2.2, .08), '#5e4a38'], [gBox, T(dock.x + 1.1, dock.y + 1.9, dock.z0 - 1, 0, -.3, .05, 1.6, .5, .06), '#c9b48a'], [gBox, T(dock.x + 1.1, dock.y + 1.9, dock.z0 - .96, 0, -.3, .05, 1.3, .1, .02), '#3f2616']);
    { const tor = new THREE.TorusGeometry(.28, .07, 5, 12); P.push([tor, T(dock.x + .8, dock.y + .07, dock.z0 - 4.5, PI / 2, 0, 0), '#c8b07a'], [tor, T(dock.x + .8, dock.y + .15, dock.z0 - 4.5, PI / 2, 0, 0, .8, .8, .8), '#b89c66'], [tor, T(dock.x - .7, dock.y + .07, dock.z1 + 4, PI / 2, 0, 0, 1.2, 1.2, 1.2), '#c8b07a']);   // rope coils
      P.push([gCyl, T(dock.x - .8, dock.y + .25, dock.z0 - 6, 0, 0, 0, .45, .5, .45), '#8a8a82'], [gCyl, T(dock.x - .8, dock.y + .5, dock.z0 - 6, 0, 0, 0, .47, .04, .47), '#5a5a54'], [gCyl, T(dock.x + .85, dock.y + .22, dock.z1 + .8, .25, 0, PI / 2, .4, .45, .4), '#5f7a8a']);   // buckets (one tipped)
      { const px = dock.x - dock.w / 2 - .12, pz = dock.z1 + .45, ay = Math.atan2(-px, FZC - pz), ux = Math.sin(ay), uz = Math.cos(ay), y = dock.y + 1.45, AR = FT.ARROW;   // hint: a carved arrow on a tall post at the dock end, pointing at the falls
        const tl = AR.TILT, fw = new V3(ux * Math.cos(tl), Math.sin(tl), uz * Math.cos(tl)), sd = new V3(uz, 0, -ux), nr = new V3().crossVectors(fw, sd).normalize();   // flat arrow: broad face (nr) up + tipped toward the dock
        const part = (g, k, lift, bx, by, bz, c) => { const m = new THREE.Matrix4().makeBasis(sd, nr, fw).scale(new V3(bx, by, bz)); m.setPosition(px + fw.x * k + nr.x * lift, y + fw.y * k + nr.y * lift, pz + fw.z * k + nr.z * lift); P.push([g, m, c]); };
        const gHead = new THREE.ConeGeometry(.5, 1, 4); gHead.rotateX(PI / 2);   // 4-sided cone, tip along +z, squashed thin in y = a flat triangle arrowhead
        P.push([gCyl, T(px, dock.y + .2, pz, 0, 0, 0, .28, 3.4, .28), '#5a4632']);
        part(gBox, AR.SHAFT[0] / 2 - .1, 0, AR.SHAFT[1], AR.T, AR.SHAFT[0], AR.WOOD); part(gHead, AR.SHAFT[0] - .1 + AR.HEAD[0] / 2, 0, AR.HEAD[1], AR.T, AR.HEAD[0], AR.WOOD);   // light wood arrow
        part(gBox, AR.SHAFT[0] / 2 - .05, AR.T * .5, AR.SHAFT[1] * .35, .02, AR.SHAFT[0] * .8, AR.CUT); part(gHead, AR.SHAFT[0] - .1 + AR.HEAD[0] * .45, AR.T * .5, AR.HEAD[1] * .55, .02, AR.HEAD[0] * .55, AR.CUT); }   // dark carved groove on top
      P.push([gBox, T(dock.x + dock.w / 2 + .02, dock.y - .45, dock.z0 - 7.5, 0, 0, .05, .04, 1.1, 2.4), '#4a5248'], [gBox, T(dock.x + dock.w / 2 - .25, dock.y + .05, dock.z0 - 7.5, 0, 0, 0, .55, .05, 2.4), '#566056'], [gSph, T(dock.x + dock.w / 2 + .05, dock.y - .9, dock.z0 - 7, 0, 0, 0, .12, .12, .12), '#e8a63a']);   // net over the edge + a float
    }
    mesh(bake(P), PMw.wood, grp, true).name = 'dock';
    const B = [[gSph, T(0, .15, 0, 0, 0, 0, 3.6, 1.1, 1.5), '#7a5233'], [gSph, T(0, .38, 0, 0, 0, 0, 3.3, .7, 1.25), '#3e2a20'], [gBox, T(.4, .32, 0, 0, 0, 0, .3, .1, 1.3), '#8a6a44'], [gBox, T(-.8, .32, 0, 0, 0, 0, .3, .1, 1.3), '#8a6a44'],
      [gBox, T(-1.6, .55, 0, 0, 0, 0, .1, .5, .9), '#bf5c40'], [gCyl, T(.4, .5, .66, 0, 0, 0, .07, .16, .07), '#3f2616'], [gCyl, T(.4, .5, -.66, 0, 0, 0, .07, .16, .07), '#3f2616']];
    const boat = new THREE.Group(); mesh(bake(B), PMw.wood, boat, true); boat.rotation.order = 'YXZ'; boat.rotation.y = PI / 2; boat.scale.setScalar(FT.BOAT.SIZE); boat.position.set(dock.x + dock.w / 2 + 1.1 * FT.BOAT.SIZE, 0, dock.z1 + 2); grp.add(boat); W3.boat = boat; boat.userData.home = boat.position.clone();
    const oar = bake([[gCyl, T(0, 0, 1.05, PI / 2, 0, 0, .05, 2.1, .05), '#8a6a44'], [gBox, T(0, 0, 2.0, 0, 0, 0, .05, .26, .5), '#9a7a50']]);   // pivot at the oarlock, shaft out along +z
    W3.oars = new THREE.InstancedMesh(oar, PMw.wood, 2); W3.oars.frustumCulled = false; W3.oars.castShadow = false; W3.oars.receiveShadow = true; boat.add(W3.oars); W3.oars.name = 'oars'; }
  // path gate (the way back) at the south end of the trail
  { const gz = 66, gx = trailX(gz); W3.gate = mkGate(grp); W3.gate.position.set(gx, H0(gx, gz) - .1, gz); W3.gate.scale.setScalar(1.25); W3.gate.userData.x = gx; W3.gate.userData.z = gz; }
  // junk shore props + rat dens; the sunken tree; the waterfall
  { const j = at(TH.junk, -4), P = [], jx = j.x, jz = j.z;
    const put = (geo, dx, dz_, yy, rx, ry, rz, sx, sy, sz, cc) => P.push([geo, T(jx + dx, H0(jx + dx, jz + dz_) + yy, jz + dz_, rx, ry, rz, sx, sy, sz), cc]);
    const tire = new THREE.TorusGeometry(.6, .25, 8, 14); put(tire, 0, 0, .25, PI / 2, 0, 0, 1, 1, 1, '#1e1a18'); put(tire, .3, .2, .7, PI / 2 + .2, 0, 0, 1, 1, 1, '#24201c');
    put(gBox, 2.5, -1, .6, 0, .4, 0, 1.6, 1.2, .9, '#e8e0cc'); put(gBox, 2.5, -1, 1.21, 0, .4, 0, 1.4, .05, .7, '#5a6e72');   // old bathtub
    put(gBox, -2.2, 1, .7, 0, -.3, .1, 1, 1.4, .9, '#d8d0c0'); put(gBox, -2.2, 1, .7, 0, -.3, .1, .9, .1, .92, '#9a9a92');    // fridge
    put(gBox, 1, 2.2, .35, 0, .8, 0, .9, .7, .7, '#4a4038'); put(gBox, 1.2, 2.5, .35, 0, .8, 0, .5, .45, .1, '#7fa8a0');      // tv
    for (let k = 0; k < 9; k++) put(gCyl, r(-3, 3), r(-3, 3), .15, PI / 2 * (k % 2), rng() * 6, 0, .2, .35, .2, k % 3 ? '#9a5a3a' : '#9a9a92');
    put(gBox, -1, -2.5, 1.1, 0, .2, 0, .1, 2.2, .1, '#5e4a38'); put(gBox, -1, -2.5, 1.9, 0, .2, .1, 1.4, .5, .06, '#c9b48a');
    for (const [px, pz] of [[4.5, 1.5], [-4.2, -1.8], [.5, -4.2]]) for (let k = 0; k < 7; k++) put(k % 3 ? gBox : gCyl, px + r(-.9, .9), pz + r(-.9, .9), .15 + k * .09, rng() * 3, rng() * 6, rng() * 3, .3 + rng() * .5, .12 + rng() * .3, .3 + rng() * .5, ['#7a6a5a', '#9a5a3a', '#5a6e72', '#8a8a82', '#4a4038'][k % 5]);   // scrap piles
    const dens = [{ x: jx - 3.5, z: jz + 2.5 }, at(TH.marsh + .5, -6), { x: trailX(54) + 6, z: 54 }];
    dens.forEach(d => { const y = H0(d.x, d.z); P.push([gBlob, T(d.x, y + .1, d.z, 0, 0, 0, 2.2, 1.3, 2), '#5a4a3a'], [gCyl, T(d.x + .8, y + .35, d.z, 0, 0, PI / 2, .5, .4, .5), '#1b1410'], [gBox, T(d.x - .3, y + .9, d.z + .4, .3, .5, .2, 1, .1, .6), '#8a6a44']); });
    W3.dens = dens; mesh(bake(P), PMw.junk, grp, true).name = 'junk';
    const sk = at(TH.sunk, 2.5), ang = TH.sunk + PI / 2, ca = Math.cos(ang), sa = Math.sin(ang), Q = [];
    Q.push([gTr, T(sk.x, -.4, sk.z, PI / 2 - .12, -ang + PI / 2, 0, 1.3, 13, 1.3), '#5e4a38']);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; Q.push([gCyl, T(sk.x - ca * 6.5 + Math.cos(a) * .9, .2 + Math.sin(a) * .9, sk.z - sa * 6.5 + Math.sin(a) * .3, a, 0, 1.2, .18, 2.4, .18), '#6a5a48']); }
    for (let k = 0; k < 4; k++) Q.push([gCyl, T(sk.x + ca * (1 + k * 1.6), .6 + k * .2, sk.z + sa * (1 + k * 1.6), .9 * (k % 2 ? 1 : -1), 0, .4, .12, 2.2, .12), '#5e4a38']);
    Q.push([gBlob, T(sk.x + ca * 2, .55, sk.z + sa * 2, 0, 0, 0, 1.8, .5, 1.4), '#4f7f3c']); mesh(bake(Q), PMw.wood, grp, true).name = 'sunk'; W3.sunkAt = sk;
    const fz = -lakeR(TH.falls), top = H0(0, fz - 6.5, true) + .2, wfg = new THREE.PlaneGeometry(4.2, 1, 1, 12), wfm = reg(new THREE.MeshBasicMaterial({ color: '#dff4ee', transparent: true, opacity: .82, depthWrite: false, side: THREE.DoubleSide }));
    wfm.onBeforeCompile = sh => { sh.uniforms.uTime = A.uTime; sh.vertexShader = 'varying vec2 vU2;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vU2=uv;');
      sh.fragmentShader = 'uniform float uTime; varying vec2 vU2;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n float st=sin(vU2.x*37.+sin(vU2.x*11.)*2.)*.5+.5; float fl=fract(vU2.y*3.+uTime*1.6+st*.4); diffuseColor.rgb*=.75+.35*smoothstep(.2,.9,fl)*st; diffuseColor.a*=(.55+.45*st)*smoothstep(0.,.08,vU2.x)*smoothstep(1.,.92,vU2.x);'); };
    wfm.customProgramCacheKey = () => 'fwfall';
    const wf = mesh(wfg, wfm, grp), wTop = new V3(0, top, fz - 5.2), wBot = new V3(0, 0, fz - 1.2); wf.position.lerpVectors(wTop, wBot, .5); wf.scale.y = wTop.distanceTo(wBot); wf.rotation.x = -Math.atan2(wTop.z - wBot.z, wTop.y - wBot.y); wf.renderOrder = 3; wf.name = 'waterfall';
    W3.fall = { x: 0, z: fz - 1.2, top }; }
  // light shafts, mist banks, birds, bugs, glints, ripples, jumping fish
  const fx = W3.fx;
  fx.rays = billboards(hi ? 7 : 4, addM(A.texRay, '#ffe8b8', .55), grp); fx.rays.renderOrder = 5; fx.rayD = Array.from({ length: fx.rays.count }, (_, k) => { const a = k / fx.rays.count * TAU + .4, R = r(10, 40); return { x: Math.cos(a) * R, z: Math.sin(a) * R, w: r(4, 8), p: rng() * 6 }; });
  fx.mist = billboards(hi ? 26 : 14, softM('#eef4ea', .2), grp); fx.mist.renderOrder = 6; fx.mistD = Array.from({ length: fx.mist.count }, () => { const a = rng() * TAU, R = r(8, 46); return { x: Math.cos(a) * R, z: Math.sin(a) * R, s: r(10, 20), p: rng() * 6, y: r(.6, 2.2) }; });
  fx.birds = new THREE.InstancedMesh(BIRDG, reg(new THREE.MeshLambertMaterial({ vertexColors: true })), 14); fx.birds.frustumCulled = false; grp.add(fx.birds);
  fx.birdD = Array.from({ length: 14 }, (_, k) => k < 5 ? { c: 'falls', r: 3 + k * .7, y: 12 + k * .8, sp: .9 + k * .1, p: k * 1.3 } : { c: 'lake', r: 26 + rng() * 14, y: 20 + rng() * 6, sp: .12 + rng() * .05, p: k * .5 });
  const nB = hi ? 40 : 20, nH = hi ? 6 : 3; fx.bugs = billboards(nB + nH + 1, addM(A.texGlow, '#fff1a0', .9), grp);
  fx.bugD = Array.from({ length: nB }, (_, k) => { const s = k < 12 ? at(TH.marsh, -2) : k < 20 ? { x: W3.gate.userData.x, z: 62 } : k < 28 ? { x: GP.x, z: GP.z } : at(rng() * TAU, -3); return { x: s.x + r(-5, 5), z: s.z + r(-5, 5), y: r(.6, 2.6), p: rng() * 6 }; });
  for (let k = 0; k < nH; k++) fx.bugD.push({ fall: true, x: r(-10, 10), z: r(-22, -8), y: r(.7, 1.6), p: k / nH, w: rng() * 6 });   // hint: a few fireflies drifting off toward the falls
  fx.bugD.push({ glow: true, x: 0, z: FZC - 3.4, y: 1.5, p: 0 }); for (let i = 0; i < fx.bugs.count; i++) fx.bugs.setColorAt(i, _c.set(i === fx.bugs.count - 1 ? '#ffc070' : '#ffffff'));   // hint: a soft glow behind the falls at night
  { const bc = document.createElement('canvas'); bc.width = bc.height = 32; const g = bc.getContext('2d'); g.fillStyle = '#fff'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(16 + s * 7, 12, 7, 9, s * .4, 0, TAU); g.fill(); g.beginPath(); g.ellipse(16 + s * 5, 23, 4.5, 6, -s * .3, 0, TAU); g.fill(); } g.fillStyle = '#222'; g.fillRect(15, 6, 2, 22);
    fx.flies = billboards(hi ? 22 : 9, reg(new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, alphaTest: .4, side: THREE.DoubleSide })), grp); fx.flies.renderOrder = 5; const BFC = ['#f2c84a', '#f08a3a', '#ffffff', '#8ab8f0'];
    fx.flyD = Array.from({ length: fx.flies.count }, (_, k) => { const s = k < 8 ? at(TH.marsh, -6) : k < 14 ? { x: trailX(50), z: 50 } : at(rng() * TAU, -7); fx.flies.setColorAt(k, _c.set(BFC[k % 4])); return { x: s.x + r(-5, 5), z: s.z + r(-5, 5), y: r(.8, 2.2), p: rng() * 6, sp: .5 + rng() * .5 }; }); }   // butterflies by day
  fx.glint = billboards(12, addM(A.texStar, '#fffbe0', 1), grp); fx.glintD = Array.from({ length: 12 }, (_, k) => { const a = rng() * TAU, R = rng() * 3.4; return k < 9 ? { x: GP.x + Math.cos(a) * R, z: GP.z + Math.sin(a) * R, p: rng() * 6 } : { x: W3.fall.x + r(-1.5, 1.5), z: W3.fall.z + r(.5, 2.5), p: rng() * 6 }; });
  fx.rip = new THREE.InstancedMesh(A.gRing, reg(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .6, depthWrite: false, blending: THREE.AdditiveBlending })), 28); fx.rip.frustumCulled = false; fx.rip.count = 0; fx.rip.renderOrder = 4; grp.add(fx.rip); fx.ripL = [];
  for (let i = 0; i < 28; i++) fx.rip.setColorAt(i, _c.set('#ffffff'));
  fx.jump = [0, 1].map(() => { const m = mesh(FISHG, VC, grp, true); m.visible = false; return { m, t: 0, wait: 2 + rng() * 4, a: null, b: null }; });
  fx.pN = billboards(160, softM('#ffffff', .85), grp); fx.pN.count = 0; fx.pN.renderOrder = 7; fx.pA = billboards(100, addM(A.texStar, '#ffffff', 1), grp); fx.pA.count = 0; fx.pA.renderOrder = 7; fx.pL = { N: [], A: [] };
  // fishing kit, buddy kit, critters, gull, bucket
  F.rod = mesh(RODG, VC, fscene, true); F.bob = mesh(BOBG, VC, fscene, true); F.line = mkLine('#f3f0e6', .012); fscene.add(F.line);
  F.aimLine = mkLine('#ffe08a', .03, 14); F.aimLine.material.transparent = true; F.aimLine.material.opacity = .7; fscene.add(F.aimLine);
  F.aimRing = mesh(A.gRing, reg(new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: .85, depthWrite: false })), fscene); F.aimRing.renderOrder = 4;
  F.fishFly = mesh(FISHG, VC, fscene, true); F.fishFly.visible = false;
  BUD.rod = mesh(RODG, VC, fscene, true); BUD.rod.scale.setScalar(.55); BUD.bob = mesh(BOBG, VC, fscene, true); BUD.bob.scale.setScalar(.7); BUD.line = mkLine('#f3f0e6', .009); fscene.add(BUD.line); BUD.fish = mesh(FISHG, VC, fscene); BUD.fish.visible = false; BUD.fish.scale.setScalar(.6);
  F.bucket = mesh(BUCKG, VC, fscene, true); F.bucket.visible = false;
  RATS.length = 0; W3.dens.forEach((d, i) => { const m = mesh(RAT, VC, fscene, true), carry = mesh(FISHG, VC, m); carry.position.set(1.05, .45, 0); carry.rotation.set(0, PI / 2, .3); carry.scale.setScalar(.7); carry.visible = false;
    RATS.push({ i, m, carry, den: d, x: d.x + 1.5, z: d.z, a: 0, sp: 0, st: 'roam', cd: 6 + i * 4, tx: d.x, tz: d.z, t: 0, fish: null, steals: 0, lost: 0, back: 0 }); });
  GULL.body = mesh(GULLB, VC, fscene, true); GULL.wing = mesh(GULLW, VC, GULL.body, true); GULL.wing.position.set(-.05, .2, 0); GULL.body.visible = false;
  buildSkyFx(grp); paintSky();
  W3.ms = performance.now() - t0;
}
function emitP(pool, x, y, z, vx, vy, vz, life, size, col, grav) { if (!W3.built) return; const L = W3.fx.pL[pool]; if (L.length >= (pool === 'N' ? 160 : 100)) return; L.push({ x, y, z, vx, vy, vz, life, max: life, size, c: new THREE.Color(col), grav: grav || 0 }); }
function ripple(x, z, s) { const L = W3.fx.ripL; if (!L) return; if (L.length >= 28) L.shift(); L.push({ x, z, t: 0, max: 1.6 * (s || 1), s: s || 1 }); }
function splash(x, z, n, big) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = (.5 + Math.random()) * (big ? 2.2 : 1.2); emitP('N', x, .1, z, Math.cos(a) * s, 2 + Math.random() * (big ? 4 : 2.5), Math.sin(a) * s, .5 + Math.random() * .4, .25 + Math.random() * .3, '#e8f4f0', 9); } ripple(x, z, big ? 1.6 : 1); }

/* ---- catches: per-spot tables. kind fish / loot / recipe / junk. Rare fish and creatures FIGHT (button mash) with size + aggr 1..5 ---- */
const FISH = {
  minnow: { n: 'mud minnow', kind: 'fish', r: 'common', pts: 10, kg: [.1, .3] }, perch: { n: 'bog perch', kind: 'fish', r: 'common', pts: 15, kg: [.3, .9] }, sunny: { n: 'swamp sunny', kind: 'fish', r: 'common', pts: 15, kg: [.2, .6] },
  boot: { n: 'old boot', kind: 'junk', r: 'common', pts: 2 }, can: { n: 'tin can', kind: 'junk', r: 'common', pts: 2 }, bolts: { n: 'scrap bolts', kind: 'loot', r: 'common', pts: 8 },
  dcat: { n: 'dock catfish', kind: 'fish', r: 'uncommon', pts: 35, kg: [1, 3] }, tackle: { n: 'lost tackle box', kind: 'loot', r: 'uncommon', pts: 30 },
  rpike: { n: 'reed pike', kind: 'fish', r: 'uncommon', pts: 35, kg: [1, 2.5] }, frog: { n: 'frogfish', kind: 'fish', r: 'common', pts: 18, kg: [.3, .8] },
  eel: { n: 'mud eel', kind: 'fish', r: 'rare', creature: true, fight: true, size: 2, aggr: 3, pts: 120, kg: [1.5, 2.5] }, rcp1: { n: 'recipe: reed-wrapped perch (food: heal)', kind: 'recipe', r: 'uncommon', pts: 40 },
  bass: { n: 'rock bass', kind: 'fish', r: 'common', pts: 20, kg: [.5, 1.5] }, carp: { n: 'silver carp', kind: 'fish', r: 'uncommon', pts: 35, kg: [1.5, 4] },
  char: { n: 'cliff char', kind: 'fish', r: 'rare', fight: true, size: 3, aggr: 2, pts: 140, kg: [3, 5] },
  hubcap: { n: 'bent hubcap (shield scrap)', kind: 'loot', r: 'uncommon', pts: 30 }, gears: { n: 'gear bits', kind: 'loot', r: 'common', pts: 12 }, remote: { n: 'tv remote', kind: 'junk', r: 'common', pts: 3 },
  crab: { n: 'old boot crab', kind: 'fish', r: 'rare', creature: true, fight: true, size: 1, aggr: 4, pts: 110, kg: [.5, 1] }, rcp2: { n: 'recipe: scrap-iron skillet (gear)', kind: 'recipe', r: 'uncommon', pts: 40 },
  koi: { n: 'ghost koi', kind: 'fish', r: 'rare', fight: true, size: 2, aggr: 1, pts: 200, kg: [2, 3.5] }, skip: { n: 'golden mudskipper', kind: 'fish', r: 'rare', fight: true, size: 1, aggr: 2, pts: 220, kg: [.4, .8] },
  trout: { n: 'falls trout', kind: 'fish', r: 'uncommon', pts: 45, kg: [1, 2.5] }, rcp3: { n: 'recipe: waterfall tonic (food: buff)', kind: 'recipe', r: 'uncommon', pts: 50 },
  turtle: { n: 'bog snapper turtle', kind: 'fish', r: 'rare', creature: true, fight: true, size: 5, aggr: 5, pts: 420, kg: [12, 20] },
  jpike: { n: 'junkfin pike', kind: 'fish', r: 'rare', fight: true, size: 4, aggr: 4, pts: 300, kg: [6, 10] }, scat: { n: 'sunk catfish', kind: 'fish', r: 'uncommon', pts: 45, kg: [2, 5] },
  chest: { n: 'snagged sunken chest', kind: 'loot', r: 'rare', fight: true, size: 3, aggr: 1, pts: 250 }, rcp4: { n: 'recipe: swamp chowder (food: heal)', kind: 'recipe', r: 'uncommon', pts: 50 },
  guppy: { n: 'glimmer guppy', kind: 'fish', r: 'uncommon', pts: 40, kg: [.1, .2] }, star: { n: 'star-scale perch', kind: 'fish', r: 'rare', fight: true, size: 1, aggr: 1, pts: 220, kg: [.6, 1.2] },
  moon: { n: 'moon minnow', kind: 'fish', r: 'rare', fight: true, size: 1, aggr: 3, pts: 240, kg: [.2, .4] }, gem: { n: 'gem shard', kind: 'loot', r: 'uncommon', pts: 60 }, rcp5: { n: 'recipe: glow-fin stew (food: buff)', kind: 'recipe', r: 'uncommon', pts: 60 }
};
const TABLES = {
  open: [['minnow', 30], ['perch', 20], ['sunny', 14], ['boot', 8], ['can', 6], ['bolts', 4]],
  dock: [['minnow', 24], ['perch', 20], ['dcat', 10], ['boot', 8], ['tackle', 4], ['sunny', 10]],
  marsh: [['frog', 16], ['rpike', 12], ['minnow', 16], ['perch', 10], ['rcp1', 3], ['eel', 4]],
  cliffs: [['bass', 18], ['carp', 10], ['perch', 10], ['char', 3]],
  junk: [['gears', 12], ['hubcap', 8], ['remote', 8], ['can', 8], ['minnow', 8], ['rcp2', 2], ['crab', 4]],
  falls: [['trout', 20], ['koi', 8], ['skip', 6], ['rcp3', 4], ['turtle', 3]],
  sunk: [['scat', 18], ['jpike', 7], ['chest', 4], ['rcp4', 4], ['perch', 8]],
  glint: [['guppy', 18], ['star', 8], ['moon', 5], ['gem', 6], ['rcp5', 4]]
};
// deep open water (boat, deep middle, no named spot): the open table plus the lake's existing rare fish at a small base weight (no new species; night/time weights still apply)
TABLES.deepOpen = TABLES.open.concat([...new Set(Object.keys(TABLES).flatMap(t => TABLES[t].map(e => e[0])))].filter(k => FISH[k].kind === 'fish' && FISH[k].r === 'rare').map(k => [k, 1]));
const AGGR = ['', 'calm', 'feisty', 'angry', 'furious', 'berserk'];
function rollCatch(spotId, deep) {
  const tab = TABLES[spotId] || TABLES.open; let tot = 0; const w = catchWeights(spotId, undefined, undefined, deep); w.forEach(v => { tot += v; });
  let x = Math.random() * tot, k = tab[0][0]; for (let i = 0; i < tab.length; i++) { if ((x -= w[i]) < 0) { k = tab[i][0]; break; } }
  return mkCatch(k);
}
// weights: table x rare pity boost x rain rare boost x deep-middle (boat) boost x time of day (FT.NIGHT_FISH)
function catchWeights(spotId, per, rain, deep) { const tab = TABLES[spotId] || TABLES.open, boost = 1 + F.pity * FT.PITY, rr = ((rain === undefined ? raining() : rain) ? FT.RAIN.RARE_MUL : 1) * (deep ? FT.BOAT.DEEP_RARE : 1), ft = fishTime(per || SKY.per || 'morning');
  return tab.map(([k, wt]) => { const nf = FT.NIGHT_FISH[k]; return wt * (FISH[k].r === 'rare' ? boost * rr : 1) * (nf ? nf[ft] : 1); }); }
function mkCatch(k) { const f = FISH[k], c = Object.assign({ key: k }, f); if (f.kg) c.kgv = +(f.kg[0] + Math.random() * (f.kg[1] - f.kg[0])).toFixed(1); return c; }

/* ======================= state ======================= */
const F = { mode: 'off', ret: null, log: [], visits: 0, pity: 0, bag: [], lost: [], score: 0, pos: new V3(0, 0, 60), vy: 0, air: false, head: PI / 2, yaw: 0, pitch: .3, dist: 7.5, spd: 0, rodEl: 1.15, wph: 0,
  fish: { ph: 'idle', t: 0, pow: 0, from: new V3(), to: new V3(), at: new V3(), spot: null, biteT: 0, nib: 0, game: null, rot: 0, styles: [], lastResult: null, forced: null },
  stats: { casts: 0, bites: 0, hooks: 0, caught: 0, lostFish: 0, snaps: 0 }, results: [], exit: null, fadeIn: 0, sideFade: 0, paused: false, curSpot: null, actArm: true };
// rowboat (PLAN-boat.md, owner ok 10-30). Every number is a PLAYTEST DEFAULT.
FT.BOAT = { MAX: 3.2, MAX_FAST: 5, ACCEL: 2, ACCEL_FAST: 3, DRAG: .9, DRAG_K: .5, TURN: 1.4, DRIFT: .15, ROLL: 3, PITCH: 2, HEAVE: .06, RAIN_BOB: 1.8, RAIN_DRIFT: 1.5,
  EDGE: 1.8, EDGE_KEEP: .4, PLUNGE: .8, OUT_R: 3.6, BOARD_R: 4.2, SEAT: .67, HOP_V: 3.2, DEEP_R: .45, DEEP_RARE: 1.2, CHAN_W: 1.4, CAM: 1.4, FALL_SND: .05,
  SIZE: 1.6 };   // SIZE = boat scale (owner 10-30 'bigger boat': mudbot sits in it); EDGE / OUT_R / BOARD_R / SEAT / CAM sized to match
// cave roof behind the falls: [x, dz from FZC, y, sx, sy, sz] gRock blobs that close the carved slot from the cave ceiling up into the cliff (all behind the falls sheet)
FT.ARROW = { SHAFT: [1.05, .26], HEAD: [.62, .78], T: .09, TILT: .42, WOOD: '#d8b47a', CUT: '#3a2414' };   // dock-post arrow: shaft [length, width], head [length, width], thickness, tilt (tail low, face toward the dock), colours
FT.HINT = { BUG_S: 2.8, RIP_EVERY: .6, RIP_S: 1.3 };   // falls hints: firefly size x, seconds between drifting ripples, ripple size
FT.CAVE = { ROCK: '#8a7a62', ROOF: [[0, -5.8, 8.8, 8.4, 12, 3.4], [0, -8.2, 10, 8, 15, 3.6], [0, -10.8, 11.5, 8, 19, 3.4], [3.1, -5.2, 1.8, 2.4, 8, 5], [-3.1, -5.2, 1.8, 2.4, 8, 5]] };   // gRock half-height is ~.37 x sy: lintel bottoms ~4.4 (ceiling), tops into the cliff; jambs stand on the channel floor (bottom ~-1.2) at the carve edge, so nothing hangs in the air
const BT = { x: 0, z: 0, h: PI / 2, v: 0, roll: 0, pitch: 0, heave: 0, kick: 0, op: 0, strokes: 0, bumps: 0, bumpCd: 0, hop: 0, hv: 0, amp: 0, dd: .7, deepToast: false, blockedRow: 0 };
const BUD = { x: 0, z: 0, head: 0, st: 'follow', catches: 0, t: 0, timer: 9, bobAt: new V3(), joy: 0, last: null, mv: 0, stay: 0, spot: null };
const RATS = [], GULL = { st: 'off', t: 0, x: 0, y: 0, z: 0, from: new V3(), cd: 0, shoo: 0, steals: 0, fish: null };
let VT = 0, fps = 0, fpsN = 0, fpsT = 0;
const inp = { down: new Set(), act: false, actQ: 0, stick: [0, 0], tjump: false, tact: false };

function enter3D() {
  buildWorld(); const pl = A.pl, b = A.buddy, gx = W3.gate.userData.x, gz = W3.gate.userData.z;
  G.state = 'fish'; F.mode = 'fish'; F.visits++; F.exit = null; F.paused = false; wk.on = false;
  if (wk.fog0 !== null) { A.scene.fog.density = wk.fog0; wk.fog0 = null; }
  fscene.add(pl.root); pl.root.visible = true; pl.root.rotation.set(0, 0, 0); pl.root.scale.setScalar(A.HS); pl.shadow.visible = false; pl.g && (pl.g.visible = true);
  fscene.add(b.root); b.root.visible = true; b.root.rotation.set(0, 0, 0);
  F.pos.set(gx, 0, gz - 3.5); F.pos.y = groundAt(F.pos.x, F.pos.z); F.vy = 0; F.air = false; F.safe = [F.pos.x, F.pos.z]; F.deepT = 0; F.head = PI / 2; F.yaw = 0; F.pitch = .3; F.spd = 0;
  BUD.x = F.pos.x + 1.6; BUD.z = F.pos.z + 2; BUD.st = 'follow'; BUD.stay = 0; BUD.inDock = false;
  F.inBoat = false; boatHome(); BT.deepToast = false; setHelp('foot');
  Object.assign(F.fish, { ph: 'idle', t: 0, game: null }); F.fadeIn = 1.2; fadeEl.style.opacity = '1';
  hudEl.style.display = 'flex'; helpEl.style.display = 'block'; touchEl.style.display = isTouch ? 'block' : 'none'; A.resetInput(); inp.down.clear(); inp.act = false;
  skinOn();   // impasto mudbot, this world only
  F.hudKey = ''; toast('the fishing world', 2.4); A.sfx(520, .25, 'triangle'); skyVisit();
}
function exitWorld(kind) { if (F.exit || G.state !== 'fish') return false; reelIn(true); F.exit = { kind, t: 0, dur: kind === 'boat' ? 2.6 : 1.4 }; promptEl.style.display = 'none'; F.promptTxt = ''; A.sfx(300, .25, 'triangle'); return true; }
function finishExit() {
  const pl = A.pl, b = A.buddy, kind = F.exit.kind; F.exit = null; F.mode = 'off'; F.items = {};   // chest items last for this visit only (PLAYTEST DEFAULT)
  skyHush(); skinOff();   // side scroller mudbot gets his own materials back
  A.scene.add(pl.root); pl.root.rotation.set(0, 0, 0); pl.shadow.visible = true; A.scene.add(b.root); b.init = false; b.root.rotation.set(0, 0, 0);
  F.inBoat = false; boatHome(); setHelp('foot');
  hudEl.style.display = 'none'; helpEl.style.display = 'none'; gameEl.style.display = 'none'; touchEl.style.display = 'none'; msgEl.style.display = 'none';
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
  const p = G.p, r = F.ret;
  if (r && r.map) { F.ret = null; A.resetInput(); inp.down.clear(); inp.act = false; fadeEl.style.opacity = '1'; F.sideFade = 1; F.promptTxt = null; F.lastExit = kind; r.back(kind); return; }   // came from the paper map's pond: back to the map (topworld.js)
  G.state = 'play'; if (r && r.room === G.room) p.x = r.x; p.y = GY; p.vx = 0; p.vy = 0; p.onGround = true; p.inv = 1.2; p.face = 1; p.hook = null;
  A.resetInput(); inp.down.clear(); inp.act = false; fadeEl.style.opacity = '1'; F.sideFade = 1; F.promptTxt = null;
  G.msg = 'back from the fishing world (' + (kind === 'boat' ? 'by boat, through the waterfall cave' : 'down the path') + ')'; G.msgT = 2.2; F.lastExit = kind;
}

/* ======================= per-step logic (fixed 60 Hz, driven by game.js's loop) ======================= */
function step(dt) {
  if (F.sideFade > 0) { F.sideFade = Math.max(0, F.sideFade - dt / .9); fadeEl.style.opacity = F.sideFade.toFixed(3); }
  if (G.state === 'play') { sidePrompt(); return; }
  if (G.state === 'fishin') { stepWalk(dt); return; }
  if (G.state !== 'fish') { skyHush(); if (promptEl.style.display !== 'none' && G.state !== 'paused') { promptEl.style.display = 'none'; F.promptTxt = ''; } return; }
  if (F.paused) { skyHush(); return; }
  VT += dt; if (msgT > 0) { msgT -= dt; if (msgT <= 0) msgEl.style.display = 'none'; }
  if (F.fadeIn > 0) { F.fadeIn = Math.max(0, F.fadeIn - dt); fadeEl.style.opacity = (F.fadeIn / 1.2).toFixed(3); }
  if (F.exit) { stepExit(dt); return; }
  if (F.pick) { stepPick(dt); inp.actQ = 0; return; }   // chest pick-of-3 open: the world waits
  stepItems(dt); stepPlayer(dt); stepFishing(dt); stepBuddy(dt); stepRats(dt); stepGull(dt); stepSpots(); stepPrompt3D(); stepFx(dt); stepSky(dt);
  inp.actQ = 0;
}
function sidePrompt() {
  const p = G.p, x = roomPathX();
  const near = x !== null && p && !(p.dead > 0) && Math.abs(p.x - x) < 16;
  const s = near ? (isTouch ? 'TAP: take the misty path' : 'F: take the misty path') : '';
  if (F.promptTxt !== s) { F.promptTxt = s; promptEl.textContent = s; promptEl.style.display = s ? 'block' : 'none'; }
  F.near = near;
}
const keyDown = c => inp.down.has(c);
const onDock = (x, z) => { const d = W3.dock; return !!d && Math.abs(x - d.x) < d.w / 2 + .05 && z < d.z0 && z > d.z1; };
const groundAt = (x, z) => onDock(x, z) ? W3.dock.y : groundH(x, z);
const isWater = (x, z) => !onDock(x, z) && groundH(x, z) < -.25;
function spotAt(x, z) { for (const s of W3.spots) if (Math.hypot(x - s.x, z - s.z) < s.r) return s; return null; }
const fwd = () => [Math.cos(F.head), -Math.sin(F.head)];
const camFwd = () => [-Math.sin(F.yaw), -Math.cos(F.yaw)];
function stepPlayer(dt) {
  if (F.inBoat) { stepBoat(dt); return; }
  const ph = F.fish.ph, gameLock = ph === 'game' || ph === 'charge' || ph === 'fly';
  const ix = (keyDown('KeyD') || keyDown('ArrowRight') ? 1 : 0) - (keyDown('KeyA') || keyDown('ArrowLeft') ? 1 : 0) + inp.stick[0], iz = (keyDown('KeyW') || keyDown('ArrowUp') ? 1 : 0) - (keyDown('KeyS') || keyDown('ArrowDown') ? 1 : 0) - inp.stick[1];
  const sy = Math.sin(F.yaw), cy = Math.cos(F.yaw); let fx = 0, fz = 0;
  if (!gameLock) { fx = -sy * iz + cy * ix; fz = -cy * iz - sy * ix; }
  let l = Math.hypot(fx, fz); if (l > 1) { fx /= l; fz /= l; l = 1; }
  if (l > .1 && (ph === 'wait' || ph === 'bite')) reelIn(false, 'reeled in');
  const g0 = groundAt(F.pos.x, F.pos.z), wet = g0 < -.05;
  if (!F.air && !onDock(F.pos.x, F.pos.z)) { if (g0 >= -.62) { F.safe = [F.pos.x, F.pos.z]; F.deepT = 0; }
    else if ((F.deepT = (F.deepT || 0) + dt) > .5) { const s = F.safe || [W3.gate.userData.x, W3.gate.userData.z - 3.5]; reelIn(true); splash(F.pos.x, F.pos.z, 8);
      F.pos.set(s[0], groundAt(s[0], s[1]), s[1]); F.vy = 0; F.spd = 0; F.deepT = 0; F.unstuck = (F.unstuck || 0) + 1; toast('too deep to wade here: back to the shore', 1.8); A.sfx(300, .12, 'triangle'); } }
  const run = keyDown('ShiftLeft') || keyDown('ShiftRight'), sp = (run ? FT.RUN : FT.WALK) * (wet ? FT.WADE : 1) * (itemOn('soggy') ? .7 : 1);
  F.spd = hold(F.spd, l > .1 ? sp * l : 0, dt, 10);
  if (l > .1) { F.head += angD(Math.atan2(-fz, fx), F.head) * Math.min(1, dt * FT.TURN); F.mdir = [fx / l, fz / l]; }
  if (F.spd > .05 && F.mdir) { const st = F.spd * dt; tryMove(F.mdir[0] * st, F.mdir[1] * st); }
  const want = keyDown('Space') || inp.tjump; if (want && !F.air && !gameLock && !F.jumpHeld) { F.vy = FT.JUMP_V; F.air = true; F.jumps = (F.jumps || 0) + 1; A.sfx(420, .06, 'square'); } F.jumpHeld = want;
  const gy = groundAt(F.pos.x, F.pos.z);
  if (F.air || F.pos.y > gy + .05) { F.vy -= FT.GRAV * dt; F.pos.y += F.vy * dt; F.air = true; if (F.pos.y <= gy) { F.pos.y = gy; F.vy = 0; F.air = false; if (gy < -.05) splash(F.pos.x, F.pos.z, 6); } }
  else F.pos.y = gy;
  if (wet && F.spd > 1 && Math.random() < dt * 8) ripple(F.pos.x, F.pos.z, .7);
}
function blocked(x, z, st) {
  if (Math.hypot(x, z) > 82) return true;
  const dk = onDock(x, z), h = dk ? W3.dock.y : groundH(x, z); if (!dk && h < -.62) return true;
  const cur = F.air ? F.pos.y : groundAt(F.pos.x, F.pos.z), dh = h - cur;
  if (dh > (F.air ? .2 : .85)) return true; if (!F.air && !dk && dh > .12 && dh / Math.max(1e-3, st) > 1.45) return true;
  for (const r of W3.rocks) { const dx = x - r.x, dz = z - r.z; if (dx * dx + dz * dz < (r.r + .45) * (r.r + .45)) return true; }
  return false;
}
function tryMove(dx, dz) { const st = Math.hypot(dx, dz), x = F.pos.x, z = F.pos.z;
  if (!blocked(x + dx, z + dz, st)) { F.pos.x += dx; F.pos.z += dz; return true; }
  if (Math.abs(dx) > 1e-4 && !blocked(x + dx, z, Math.abs(dx))) { F.pos.x += dx; return true; }
  if (Math.abs(dz) > 1e-4 && !blocked(x, z + dz, Math.abs(dz))) { F.pos.z += dz; return true; }
  F.bumps = (F.bumps || 0) + 1; return false; }

// ---- fishing state machine: idle -> charge (hold) -> fly (bobber arc) -> wait -> bite -> game -> land | reel ----
function rodTip(out) { F.rod.updateMatrixWorld(); return out.set(0, 2.4, 0).applyMatrix4(F.rod.matrixWorld); }
function reelIn(silent, why) { const f = F.fish; if (f.ph === 'idle') return; if (f.ph === 'game') gameEl.style.display = 'none'; f.ph = 'reel'; f.t = 0; f.game = null; if (!silent && why) toast(why, 1.2); }
function stepFishing(dt) {
  const f = F.fish, held = inp.act || inp.tact || keyDown('KeyF'), press = inp.actQ > 0; f.t += dt;
  if (f.ph === 'idle') { if (held && F.actArm && !F.air) { f.ph = 'charge'; f.t = 0; f.pow = 0; } }
  else if (f.ph === 'charge') { f.pow = Math.min(1, f.t / FT.CAST_CHARGE); if (!held) {
      const [ux, uz] = camFwd(), d = FT.CAST_MIN + Math.min(f.pow, itemOn('tangle') ? .55 : 1) * (FT.CAST_MAX - FT.CAST_MIN); F.head = Math.atan2(-uz, ux);
      rodTip(f.from); f.to.set(F.pos.x + ux * d, 0, F.pos.z + uz * d); f.to.y = Math.max(0, groundAt(f.to.x, f.to.z)) + .05; f.ph = 'fly'; f.t = 0; f.dur = .5 + .45 * f.pow; F.stats.casts++; A.sfx(700, .08, 'triangle'); } }
  else if (f.ph === 'fly') { const u = Math.min(1, f.t / f.dur); f.at.lerpVectors(f.from, f.to, u); f.at.y += Math.sin(u * PI) * (2.5 + f.pow * 4);
    if (u >= 1) { if (isWater(f.to.x, f.to.z)) { f.ph = 'wait'; f.t = 0; f.spot = spotAt(f.to.x, f.to.z); f.deep = deepMid(f.to.x, f.to.z); if (f.deep && !BT.deepToast) { BT.deepToast = true; toast('deep water: rarer bites', 2); } const hid = (f.spot && f.spot.hidden ? FT.HIDDEN_BITE : 1) * (itemOn('lure') ? .5 : 1); f.biteMul = hid * (raining() ? FT.RAIN.BITE_MUL : 1); f.biteT = (FT.BITE_MIN + Math.random() * (FT.BITE_MAX - FT.BITE_MIN)) * f.biteMul; f.nib = 0; splash(f.to.x, f.to.z, 5); A.sfx(240, .08, 'sine'); }
      else { toast('no water there', 1); for (let i = 0; i < 5; i++) emitP('N', f.to.x, f.to.y + .1, f.to.z, (Math.random() - .5) * 2, 1.5, (Math.random() - .5) * 2, .5, .3, '#8a6a44', 6); f.ph = 'reel'; f.t = 0; F.dry = (F.dry || 0) + 1; } } }
  else if (f.ph === 'wait') { f.at.set(f.to.x, Math.sin(VT * 2.2) * .04, f.to.z); f.biteT -= dt;
    if (f.biteT > .4 && Math.random() < dt * .9) { f.nib++; ripple(f.to.x, f.to.z, .6); f.at.y -= .12; }
    if (press) { reelIn(false, 'too early!'); return; }
    if (f.biteT <= 0) { f.ph = 'bite'; f.t = 0; F.stats.bites++; splash(f.to.x, f.to.z, 8); A.sfx(880, .12, 'square'); toast('!  BITE  -  ' + (isTouch ? 'tap FISH' : 'press F / click'), .9); } }
  else if (f.ph === 'bite') { f.at.set(f.to.x, -.25 + Math.sin(VT * 30) * .05, f.to.z);
    if (press) { F.stats.hooks++; const c = f.forced || rollCatch(f.spot ? f.spot.id : (f.deep ? 'deepOpen' : 'open'), f.deep); f.forced = null; startGame(c); return; }
    if (f.t > FT.BITE_WINDOW) reelIn(false, 'it nibbled off the bait'); }
  else if (f.ph === 'game') stepGame(dt);
  else if (f.ph === 'reel') { rodTip(_v); f.at.lerp(_v, Math.min(1, dt * 8)); if (f.t > .45) { f.ph = 'idle'; f.t = 0; F.actArm = !held; } }
  else if (f.ph === 'land') { const u = Math.min(1, f.t / .8); F.fishFly.visible = true; _v.set(F.pos.x, F.pos.y + 1.4, F.pos.z); F.fishFly.position.lerpVectors(f.to, _v, u); F.fishFly.position.y += Math.sin(u * PI) * 3; F.fishFly.rotation.z = u * 9;
    if (u >= 1) { F.fishFly.visible = false; f.ph = 'idle'; f.t = 0; F.actArm = !held; } }
  if (!held) F.actArm = true;
}
// catch game by where the bobber sits (normal catches): docks + deep water = TENSION BAR, shallows + streams = TIMING,
// the open middle water = STEER (the 3D style). Rare fish and fighting creatures are always MASH. Depths are PLAYTEST DEFAULTS.
FT.STYLE = { DEEP: 2.6, SHALLOW: 1.3, DOCK: ['dock'], STREAM: ['marsh', 'falls'] };
const waterDepth = (x, z) => Math.max(0, -groundH(x, z));
function styleFor(sid, dep) { const S = FT.STYLE; if (S.DOCK.includes(sid)) return 'tension'; if (S.STREAM.includes(sid)) return 'timing';
  return dep >= S.DEEP ? 'tension' : dep < S.SHALLOW ? 'timing' : 'steer'; }
function startGame(c) {
  const f = F.fish, M_ = FT.MASH; let style;
  const dep = waterDepth(f.to.x, f.to.z), sid = f.spot ? f.spot.id : null;
  // only rare catches (and anything that fights back) start a catch game (game plan: rare items trigger the catch game);
  // everything else lands straight away through the same win path (bag, score, pity, toast, gull, chest pick)
  if (!c.fight && c.r !== 'rare') { endGame({ style: 'none', c, t: 0, res: 'win', depth: +dep.toFixed(2), where: sid || 'open' }); return; }
  if (c.fight) style = 'mash'; else style = styleFor(sid, dep);
  const d = c.r === 'uncommon' ? 1.15 : 1, gm = { style, c, t: 0, res: null, d, depth: +dep.toFixed(2), where: sid || 'open' };
  if (style === 'tension') Object.assign(gm, { ten: 30, prog: 0, pull: .5, pullT: 1 });
  if (style === 'timing') Object.assign(gm, { pos: 0, dir: 1, speed: 1.1 * d, c0: .3 + Math.random() * .4, w: .24, hits: 0, miss: 0, need: 3 });
  if (style === 'steer') Object.assign(gm, { fishDir: Math.random() < .5 ? -1 : 1, rod: 0, prog: 0, strain: 0, swT: 1.2, off: 0 });
  if (style === 'mash') Object.assign(gm, { prog: M_.START, strain: 0, thrash: 0, thrashT: 1.2 + Math.random(), per: 100 / (M_.BASE_PRESSES + c.size * M_.PER_SIZE), drain: M_.DRAIN0 + c.aggr * M_.DRAIN_AGGR, tmax: M_.TIME0 + c.size * M_.TIME_SIZE, presses: 0, thrashes: 0, peakStrain: 0, thrashDrained: 0 });
  f.game = gm; f.ph = 'game'; f.t = 0; f.styles.push(style); gameEl.style.display = 'block'; F.gameKey = '';
  if (c.fight) toast((c.creature ? 'a ' + c.n + ' fights back!' : 'RARE: ' + c.n + '!') + '  MASH!', 1.6);
}
function stepGame(dt) {
  const f = F.fish, gm = f.game, c = gm.c, held = inp.act || inp.tact || keyDown('KeyF'), presses = inp.actQ; gm.t += dt;
  const steer = (keyDown('KeyD') || keyDown('ArrowRight') ? 1 : 0) - (keyDown('KeyA') || keyDown('ArrowLeft') ? 1 : 0) + inp.stick[0], R = Math.random() - .5;
  if (gm.style === 'tension') { gm.pullT -= dt; if (gm.pullT <= 0) { gm.pull = (.2 + Math.random() * .8) * gm.d; gm.pullT = .6 + Math.random(); }
    if (held) { gm.ten += (34 + gm.pull * 34) * dt; gm.prog += 15 * dt * (gm.ten < 85 ? 1 : .3); } else { gm.ten -= 46 * dt; gm.prog -= 3 * gm.pull * dt; }
    gm.ten = Math.max(0, gm.ten); gm.prog = Math.max(0, gm.prog);
    if (gm.ten >= 100) gm.res = 'snap'; else if (gm.prog >= 100) gm.res = 'win'; else if (gm.t > 20) gm.res = 'away';
    f.at.set(f.to.x + R * .1 * gm.pull, -.1, f.to.z); }
  if (gm.style === 'timing') { gm.pos += gm.dir * gm.speed * dt; if (gm.pos > 1) { gm.pos = 1; gm.dir = -1; } if (gm.pos < 0) { gm.pos = 0; gm.dir = 1; }
    for (let k = 0; k < presses; k++) { if (Math.abs(gm.pos - gm.c0) < gm.w / 2) { gm.hits++; gm.w *= .8; gm.c0 = .2 + Math.random() * .6; gm.speed *= 1.12; A.sfx(990, .06, 'triangle'); splash(f.to.x, f.to.z, 3); } else { gm.miss++; A.sfx(150, .1, 'sawtooth'); } }
    if (gm.hits >= gm.need) gm.res = 'win'; else if (gm.miss >= 3 || gm.t > 25) gm.res = 'away';
    f.at.set(f.to.x, -.1 + Math.sin(VT * 8) * .05, f.to.z); }
  if (gm.style === 'steer') {   // 3D: the fish runs left / right across the water; lean the rod the other way (A / D)
    gm.swT -= dt; if (gm.swT <= 0) { gm.fishDir *= -1; gm.swT = .9 + Math.random() * 1.2; splash(f.at.x, f.at.z, 4); }
    gm.rod = hold(gm.rod, Math.max(-1, Math.min(1, steer)), dt, 8);
    const good = gm.rod * -gm.fishDir > .3; if (good) { gm.prog += 19 * dt; gm.strain = Math.max(0, gm.strain - 25 * dt); } else { gm.strain += 30 * gm.d * dt; gm.prog = Math.max(0, gm.prog - 4 * dt); }
    gm.off = Math.max(-4, Math.min(4, gm.off + gm.fishDir * dt * 3 * (good ? .4 : 1)));
    const [ux, uz] = fwd(); f.at.set(f.to.x - uz * gm.off, -.15, f.to.z + ux * gm.off); if (Math.random() < dt * 6) ripple(f.at.x, f.at.z, .5);
    if (gm.strain >= 100 || gm.t > 22) gm.res = 'away'; else if (gm.prog >= 100) gm.res = 'win'; }
  if (gm.style === 'mash') {   // SIZE = how many mashes / how long; AGGRESSION = drain, thrash bursts, line-snap risk
    const M_ = FT.MASH; gm.thrashT -= dt;
    if (gm.thrashT <= 0 && gm.thrash <= 0) { gm.thrash = M_.THRASH_DUR0 + c.aggr * M_.THRASH_DUR_AGGR; gm.thrashes++; gm.thrashT = M_.THRASH_EVERY[0] + Math.random() * (M_.THRASH_EVERY[1] - M_.THRASH_EVERY[0]) - c.aggr * M_.THRASH_AGGR_CUT; splash(f.at.x, f.at.z, 6 + c.aggr * 2, c.aggr >= 3); A.sfx(160, .15, 'sawtooth'); }
    const th = gm.thrash > 0; if (th) gm.thrash -= dt;
    for (let k = 0; k < presses; k++) { gm.presses++; gm.prog += gm.per * (th ? .5 : 1); if (th) gm.strain += M_.STRAIN_PER_AGGR * c.aggr * (itemOn('steady') ? .35 : 1); }
    const drain = (gm.drain + (th ? c.aggr * M_.THRASH_DRAIN_AGGR : 0)) * dt; gm.prog -= drain; if (th) gm.thrashDrained += c.aggr * M_.THRASH_DRAIN_AGGR * dt;
    gm.strain = Math.max(0, gm.strain - M_.STRAIN_DECAY * dt); gm.peakStrain = Math.max(gm.peakStrain, gm.strain);
    if (gm.strain >= 100) gm.res = 'snap'; else if (gm.prog >= 100) gm.res = 'win'; else if (gm.prog <= 0 || gm.t > gm.tmax) gm.res = 'away';
    f.at.set(f.to.x + (th ? R * .6 : R * .1), -.2 + (th ? Math.sin(VT * 40) * .15 : 0), f.to.z + (th ? (Math.random() - .5) * .6 : 0)); }
  drawGame(gm);
  if (gm.res) endGame(gm);
}
// FISH_PTS_MAX: fishing can run with the clock stopped; cap points added to F.score/G.score (bag still gets every catch). See scores/README.md.
const FISH_PTS_MAX = 100000;
function endGame(gm) {
  const f = F.fish, c = gm.c; gameEl.style.display = 'none';
  f.lastResult = { style: gm.style, depth: gm.depth, where: gm.where, res: gm.res, n: c.n, t: +gm.t.toFixed(2), presses: gm.presses, thrashes: gm.thrashes, peakStrain: gm.peakStrain === undefined ? undefined : +gm.peakStrain.toFixed(1), size: c.size, aggr: c.aggr, per: gm.per && +gm.per.toFixed(2), drain: gm.drain, tmax: gm.tmax, thrashDrained: gm.thrashDrained && +gm.thrashDrained.toFixed(1), ui: F.lastUi };
  F.results.push(f.lastResult); f.game = null;
  if (gm.res === 'win') { F.bag.push(c); F.stats.caught++; { const add = Math.min(c.pts, Math.max(0, FISH_PTS_MAX - F.score)); F.score += add; G.score += add; } if (c.r === 'rare') F.pity = 0; else F.pity++;
    toast('caught: ' + c.n + (c.kgv ? ' (' + c.kgv + ' kg)' : '') + (c.r !== 'common' ? '  [' + c.r + ']' : '') + '  +' + c.pts, 2.2); A.sfx(1040, .2, 'triangle'); f.ph = 'land'; f.t = 0; if (itemOn('kazoo')) kazoo(); if (c.key === 'chest') openPick();
    if (A.junkIn) A.junkIn(c.key);   // junk catches go in the run's one junk bag (game.js decides what counts as junk)
    if (c.kind === 'fish' && GULL.st === 'off' && (F.forceGull || GULL.cd <= 0 && Math.random() < (itemOn('stinky') ? 1 : FT.GULL_CHANCE))) { F.forceGull = false; gullStart(); } }
  else { F.stats[gm.res === 'snap' ? 'snaps' : 'lostFish']++; toast(gm.res === 'snap' ? 'SNAP! the line broke - the ' + c.n + ' is gone' : 'the ' + c.n + ' got away', 2); A.sfx(120, .3, 'sawtooth'); f.ph = 'reel'; f.t = 0; }
}
const pips = (n, ch, cls) => '<span class="' + cls + '">' + ch.repeat(n) + '</span><span style="opacity:.3">' + ch.repeat(5 - n) + '</span>';
function drawGame(gm) {
  const c = gm.c, k = gm.style + '|' + Math.round(gm.prog || 0) + '|' + Math.round(gm.ten || gm.strain || 0) + '|' + Math.round((gm.pos || 0) * 100) + '|' + (gm.hits || 0) + (gm.miss || 0) + '|' + (gm.thrash > 0) + '|' + Math.round((gm.rod || 0) * 10) + gm.fishDir + '|' + Math.round(gm.t);
  if (F.gameKey === k) return; F.gameKey = k;
  const name = '<div>' + (c.fight ? (c.creature ? 'FIGHT: ' : 'RARE: ') : '') + c.n + (c.kgv ? ' <small>(' + c.kgv + ' kg)</small>' : '') + '</div>';
  let h = '';
  if (gm.style === 'tension') h = '<div>TENSION BAR - hold F to reel, let go before it snaps</div><div class="bar"><div class="zone" style="left:20%;width:65%;background:rgba(120,200,120,.35)"></div><div class="mark" style="left:' + Math.min(100, gm.ten) + '%;background:' + (gm.ten > 85 ? '#ff6a4a' : '#fff') + '"></div></div><div class="bar"><div class="fill" style="width:' + gm.prog + '%"></div></div>';
  if (gm.style === 'timing') h = '<div>TIMING - press F in the gold zone (' + gm.hits + '/' + gm.need + ', misses ' + gm.miss + '/3)</div><div class="bar"><div class="zone" style="left:' + (gm.c0 - gm.w / 2) * 100 + '%;width:' + gm.w * 100 + '%"></div><div class="mark" style="left:' + gm.pos * 100 + '%"></div></div>';
  if (gm.style === 'steer') h = '<div>STEER - the fish runs ' + (gm.fishDir > 0 ? 'RIGHT &#9654;' : '&#9664; LEFT') + ': lean the rod the other way (A / D)</div><div class="bar"><div class="mark" style="left:' + (50 + gm.rod * 45) + '%;background:#e8c14a;width:8px"></div><div class="mark" style="left:' + (50 + gm.fishDir * 40) + '%;background:#9fe3ff"></div></div><div class="bar"><div class="fill" style="width:' + gm.prog + '%"></div></div><div class="bar"><div class="fill" style="width:' + Math.min(100, gm.strain) + '%;background:#ff7a5a"></div></div>';
  if (gm.style === 'mash') { h = '<div>BUTTON MASH - mash F / click! ' + (gm.thrash > 0 ? '<span class="warn">THRASHING - ease off or the line snaps!</span>' : '') + '</div><div class="bar"><div class="fill" style="width:' + Math.max(0, gm.prog) + '%;background:#e8c14a"></div></div><div class="bar"><div class="fill" style="width:' + Math.min(100, gm.strain) + '%;background:#ff7a5a"></div></div>' +
    '<div class="st"><span>SIZE ' + pips(c.size, '\u25CF', 'pip') + '</span><span>AGGRESSION ' + pips(c.aggr, '\u25B2', 'ang') + ' ' + AGGR[c.aggr] + '</span><span>' + Math.max(0, gm.tmax - gm.t).toFixed(0) + 's</span></div>';
    F.lastUi = 'SIZE ' + c.size + '/5 AGGRESSION ' + c.aggr + '/5 ' + AGGR[c.aggr]; }
  gameEl.innerHTML = name + h;
}

// ---- buddy: follows, then fishes beside you with his own little rod ----
function stepBuddy(dt) {
  const f = F.fish; BUD.stay = Math.max(0, BUD.stay - dt); if (f.ph !== 'idle') BUD.stay = 6;
  if (F.inBoat) { BUD.stay = 6; if (!BUD.inDock) { const d = W3.dock; BUD.inDock = true; BUD.st = 'fish'; BUD.spot = [d.x - .55, d.z1 + 1.3]; BUD.bobAt.set(d.x - .8, 0, d.z1 - 3.6); BUD.timer = FT.BUDDY_CATCH[0] + Math.random() * (FT.BUDDY_CATCH[1] - FT.BUDDY_CATCH[0]); BUD.t = 0; } }
  else if (BUD.inDock) { BUD.inDock = false; BUD.st = 'follow'; }
  const fishing = BUD.stay > 0, [ux, uz] = fwd(), rx = -uz, rz = ux;
  if (fishing && BUD.st !== 'fish') { for (const s of [1, -1]) { const x = F.pos.x + rx * 2.6 * s - ux * .6, z = F.pos.z + rz * 2.6 * s - uz * .6; if (groundAt(x, z) < -.4) continue; let bx = null; for (let d = 3; d < 12; d += .5) if (isWater(x + ux * d, z + uz * d)) { bx = [x + ux * d, z + uz * d]; break; }
      if (bx) { BUD.st = 'fish'; BUD.spot = [x, z]; BUD.bobAt.set(bx[0], 0, bx[1]); BUD.timer = FT.BUDDY_CATCH[0] + Math.random() * (FT.BUDDY_CATCH[1] - FT.BUDDY_CATCH[0]); BUD.t = 0; break; } } }
  if (!fishing && BUD.st === 'fish') BUD.st = 'follow';
  let tx, tz; if (BUD.st === 'fish') { tx = BUD.spot[0]; tz = BUD.spot[1]; } else { tx = F.pos.x - ux * 2 + rx * 1.4; tz = F.pos.z - uz * 2 + rz * 1.4;
    if (groundAt(tx, tz) < -.3) { tx = F.pos.x - ux * 1.4; tz = F.pos.z - uz * 1.4; if (groundAt(tx, tz) < -.3) { tx = BUD.x; tz = BUD.z; } } }   // never follow onto the lake bottom (off the dock side)
  const dx = tx - BUD.x, dz = tz - BUD.z, d = Math.hypot(dx, dz); if (d > 25) { BUD.x = tx; BUD.z = tz; }
  const sp = Math.min(d * 3, F.spd > 7 ? 10.5 : 7); BUD.mv = Math.min(1, d / 1.2);
  if (d > .15) { BUD.x += dx / d * sp * dt; BUD.z += dz / d * sp * dt; BUD.head += angD(Math.atan2(-dz, dx), BUD.head) * Math.min(1, dt * 8); }
  else if (BUD.st === 'fish') { const bx = BUD.bobAt.x - BUD.x, bz = BUD.bobAt.z - BUD.z; BUD.head += angD(Math.atan2(-bz, bx), BUD.head) * Math.min(1, dt * 6); }
  BUD.casting = BUD.st === 'fish' && d < .6;
  if (BUD.casting) { BUD.t += dt; BUD.timer -= dt; if (BUD.timer <= 0) { const junk = Math.random() < .2, k = junk ? 'boot' : ['minnow', 'perch', 'sunny', 'frog'][Math.floor(Math.random() * 4)], c = mkCatch(k); c.buddy = true;
      BUD.catches++; BUD.last = c.n; BUD.joy = 1.4; splash(BUD.bobAt.x, BUD.bobAt.z, 6); if (!junk) { F.bag.push(c); { const add = Math.min(c.pts, Math.max(0, FISH_PTS_MAX - F.score)); F.score += add; G.score += add; } } toast('buddy caught ' + (junk ? 'an old boot (he throws it back)' : 'a ' + c.n + '!'), 1.6); A.sfx(760, .1, 'triangle');
      BUD.timer = FT.BUDDY_CATCH[0] + Math.random() * (FT.BUDDY_CATCH[1] - FT.BUDDY_CATCH[0]); } }
  BUD.joy = Math.max(0, BUD.joy - dt);
}
// ---- junk rats: sneak up, steal from the bucket, run home; catch them to get it back ----
const lastFishIdx = () => { for (let i = F.bag.length - 1; i >= 0; i--) if (F.bag[i].kind === 'fish') return i; return -1; };
function stepRats(dt) {
  const [ux, uz] = fwd(), d_ = W3.dock, bk = F.inBoat ? [d_.x + .55, d_.z1 + 1.2] : [F.pos.x - uz * 1.1 - ux * .3, F.pos.z + ux * 1.1 - uz * .3]; F.bucketAt = bk; const haveFish = lastFishIdx() >= 0;
  for (const r of RATS) { r.t += dt; r.cd = Math.max(0, r.cd - dt); const pd = Math.hypot(F.pos.x - r.x, F.pos.z - r.z);
    if (r.st === 'roam') { if (Math.hypot(r.tx - r.x, r.tz - r.z) < .5 || r.t > 4) { const a = Math.random() * TAU; r.tx = r.den.x + Math.cos(a) * 6; r.tz = r.den.z + Math.sin(a) * 6; r.t = 0; }
      if (r.cd <= 0 && haveFish && !F.inBoat && !itemOn('bell') && pd < FT.RAT_SEE && !RATS.some(o => o !== r && (o.st === 'sneak' || o.st === 'flee'))) { r.st = 'sneak'; r.t = 0; toast('a junk rat is sneaking toward your bucket!', 1.6); A.sfx(1500, .05, 'square'); }
      moveRat(r, r.tx, r.tz, 1.6, dt); }
    else if (r.st === 'sneak') { if (F.inBoat) { r.st = 'home'; r.cd = Math.max(r.cd, 6); continue; } moveRat(r, bk[0], bk[1], FT.RAT_SPEED, dt);
      if (pd < 2.6 && F.spd > 3 && r.t > .5) { r.st = 'home'; r.cd = 8; toast('you scared the rat off', 1.2); }
      else if (Math.hypot(bk[0] - r.x, bk[1] - r.z) < .9) { const idx = lastFishIdx();
        if (idx < 0) r.st = 'home'; else { r.fish = F.bag.splice(idx, 1)[0]; r.st = 'flee'; r.t = 0; r.steals++; toast('a junk rat stole your ' + r.fish.n + '! chase it!', 2); A.sfx(1800, .08, 'square'); } }
      if (r.st === 'sneak' && !haveFish) r.st = 'home'; }
    else if (r.st === 'flee') { moveRat(r, r.den.x, r.den.z, FT.RAT_FLEE, dt); if (Math.random() < dt * 10) emitP('N', r.x, .2 + groundH(r.x, r.z), r.z, 0, .6, 0, .4, .3, '#a88a62', 0);
      if (pd < 1.5 && r.t > .3) { F.bag.push(r.fish); r.back++; toast('got it back: ' + r.fish.n, 1.6); r.fish = null; r.st = 'home'; r.cd = FT.RAT_CD; A.sfx(990, .1, 'triangle'); }
      else if (Math.hypot(r.den.x - r.x, r.den.z - r.z) < .8) { F.lost.push(r.fish); r.lost++; toast('the junk rat got away with your ' + r.fish.n, 1.8); r.fish = null; r.st = 'roam'; r.cd = FT.RAT_CD + 8; } }
    else if (r.st === 'home') { moveRat(r, r.den.x, r.den.z, FT.RAT_FLEE, dt); if (Math.hypot(r.den.x - r.x, r.den.z - r.z) < 1) { r.st = 'roam'; r.cd = Math.max(r.cd, 10); } }
    r.carry.visible = !!r.fish; }
}
function moveRat(r, tx, tz, sp, dt) { const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz); r.sp = sp; if (d < .05) return; const s = Math.min(d, sp * dt); let nx = r.x + dx / d * s, nz = r.z + dz / d * s;
  if (groundH(nx, nz) < -.5) { nx = r.x + dz / d * s; nz = r.z - dx / d * s; if (groundH(nx, nz) < -.5) { nx = r.x - dz / d * s; nz = r.z + dx / d * s; } } r.x = nx; r.z = nz; r.a = Math.atan2(-dz, dx); }
// ---- mud gull: dives for a fresh catch; jump to shoo it ----
function gullStart() { GULL.st = 'dive'; GULL.t = 0; GULL.from.set(F.pos.x + 20, 22, F.pos.z - 14); toast('a mud gull is diving for your catch! JUMP (Space) to shoo it', 2); A.sfx(1300, .12, 'sawtooth'); }
function stepGull(dt) {
  GULL.cd = Math.max(0, GULL.cd - dt);
  if (GULL.st === 'dive') { GULL.t += dt; const u = Math.min(1, GULL.t / FT.GULL_DIVE); GULL.x = lerp(GULL.from.x, F.pos.x, u); GULL.y = lerp(GULL.from.y, F.pos.y + 2.4, u * u); GULL.z = lerp(GULL.from.z, F.pos.z, u);
    if (F.air && u > .35) { GULL.st = 'up'; GULL.t = 0; GULL.shoo++; GULL.cd = 20; toast('shoo! the gull flaps off', 1.2); }
    else if (u >= 1) { const idx = lastFishIdx(); if (idx >= 0) { GULL.fish = F.bag.splice(idx, 1)[0]; F.lost.push(GULL.fish); GULL.steals++; toast('the gull snatched your ' + GULL.fish.n + '!', 1.8); } GULL.st = 'up'; GULL.t = 0; GULL.cd = 30; } }
  else if (GULL.st === 'up') { GULL.t += dt; GULL.y += dt * 9; GULL.x += dt * 8; GULL.z -= dt * 6; if (GULL.t > 3) { GULL.st = 'off'; GULL.fish = null; } }
}
const LAKE_SPOT = { id: 'lake', name: 'the open lake', r: 0, hidden: false, found: true };   // HUD label only (not a fishing spot)
function stepSpots() {
  let cur = null; for (const s of W3.spots) { const d = Math.hypot(F.pos.x - s.x, F.pos.z - s.z); if (d < s.r + 4) cur = s;
    if (s.hidden && !s.found && d < s.r + 3.5) { s.found = true; toast('hidden spot found: ' + s.name + '! (rarer fish here)', 2.6); A.sfx(1200, .3, 'triangle'); for (let i = 0; i < 20; i++) emitP('A', s.x + (Math.random() - .5) * 4, 1 + Math.random() * 2, s.z + (Math.random() - .5) * 4, 0, 1.5, 0, 1, .5, '#fff4c8', -.5); } }
  if (F.inBoat && (!cur || (cur.id === 'dock' && dockDist(BT.x, BT.z) > FT.BOAT.OUT_R + 1))) cur = LAKE_SPOT;   // out on the lake in the boat: a lake label, not the old dock
  if (cur !== F.curSpot) { F.curSpot = cur; if (cur && cur.found && !F.fish.game) toast(cur.name, 1.4); }
}
function stepPrompt3D() {
  const g = W3.gate.userData, b = W3.boat, ph = F.fish.ph; let s = '', ne = null;
  if (F.inBoat) { const nd = dockDist(BT.x, BT.z) < FT.BOAT.OUT_R; ne = nd ? 'out' : 'far';
    s = ph === 'wait' || ph === 'bite' ? 'reel in to row' : ph !== 'idle' ? '' : nd ? (isTouch ? 'TAP: get out' : 'E: get out') : 'row back to the dock to get out'; }
  else { const nearGate = Math.hypot(F.pos.x - g.x, F.pos.z - (g.z - 1)) < 3.4, nearBoat = !F.air && Math.hypot(F.pos.x - b.position.x, F.pos.z - b.position.z) < FT.BOAT.BOARD_R && groundAt(F.pos.x, F.pos.z) > -.3;
    ne = nearGate ? 'path' : nearBoat ? 'board' : null;
    s = ph !== 'idle' ? '' : nearGate ? (isTouch ? 'TAP: walk back down the path' : 'E: walk back down the path') : nearBoat ? (isTouch ? 'TAP: get in the boat' : 'E: get in the boat') : ''; }
  F.nearExit = ne;
  if (F.promptTxt !== s) { F.promptTxt = s; promptEl.textContent = s; promptEl.style.display = s ? 'block' : 'none'; }
  if (TJ) { const k = F.inBoat ? (ne === 'out' ? 'out' : 'hide') : 'jump'; if (TJ.dataset.k !== k) { TJ.dataset.k = k; TJ.textContent = k === 'out' ? 'OUT' : 'JUMP'; TJ.style.display = k === 'hide' ? 'none' : 'flex'; } }
}
// E / prompt tap / phone OUT: one action for whatever is near
function useE() { if (F.exit || G.state !== 'fish' || F.fish.ph !== 'idle') return false; const ne = F.nearExit;
  if (ne === 'path') return exitWorld('path'); if (ne === 'board') return boardBoat(); if (ne === 'out') return leaveBoat();
  if (ne === 'far') { toast('row back to the dock to get out', 1.4); return false; } return false; }
const dockDist = (x, z) => { const d = W3.dock, dx = Math.max(0, Math.abs(x - d.x) - d.w / 2), dz = Math.max(0, d.z1 - z, z - d.z0); return Math.hypot(dx, dz); };
const inChan = (x, z) => Math.abs(x) < FT.BOAT.CHAN_W && z < W3.fall.z + 3.2 && z > W3.fall.z - 9;
const inCave = (x, z) => Math.abs(x) < FT.BOAT.CHAN_W && z < W3.fall.z - .4;
const deepMid = (x, z) => waterDepth(x, z) >= FT.STYLE.DEEP && Math.hypot(x, z) < FT.BOAT.DEEP_R * lakeR(Math.atan2(z, x));
function boatOk(x, z, h) {   // centre on open lake (r < lakeR - EDGE, or the cave channel), bow + stern on water, clear of the big rocks
  if (!isWater(x, z)) return false; if (Math.hypot(x, z) >= lakeR(Math.atan2(z, x)) - FT.BOAT.EDGE && !inChan(x, z)) return false;
  const L = 1.5 * FT.BOAT.SIZE, c = Math.cos(h) * L, sn = -Math.sin(h) * L; if (!isWater(x + c, z + sn) || !isWater(x - c, z - sn)) return false;
  for (const r of W3.rocks) { const dx = x - r.x, dz = z - r.z, rr = r.r + .75 * FT.BOAT.SIZE; if (dx * dx + dz * dz < rr * rr) return false; } return true; }
function boatHome() { const b = W3.boat; if (!b) return; b.position.copy(b.userData.home); b.rotation.set(0, PI / 2, 0); Object.assign(BT, { x: b.position.x, z: b.position.z, h: PI / 2, v: 0, roll: 0, pitch: 0, heave: 0, kick: 0, hop: 0, hv: 0, amp: 0, bumpCd: 0 }); poseOars(0); }
function boardBoat() { const b = W3.boat; reelIn(true); F.inBoat = true; BT.x = b.position.x; BT.z = b.position.z; BT.h = b.rotation.y; BT.v = 0; BT.hop = 0; BT.hv = 0; BT.trail = []; BT.stuckT = 0; BT.still0 = null; BT.amp = 0; F.air = false; F.vy = 0; F.spd = 0;
  F.pos.set(BT.x, FT.BOAT.SEAT, BT.z); F.head = BT.h; F.boards = (F.boards || 0) + 1; setHelp('boat'); A.sfx(330, .1, 'triangle'); ripple(BT.x, BT.z, 1.2); toast('in the boat: W / S row, A / D turn', 1.6); return true; }
function leaveBoat() { const d = W3.dock, x = Math.max(d.x - d.w / 2 + .45, Math.min(d.x + d.w / 2 - .45, BT.x)), z = Math.max(d.z1 + .45, Math.min(d.z0 - .45, BT.z));
  F.inBoat = false; F.pos.set(x, d.y, z); F.vy = 0; F.air = false; F.spd = 0; BT.v = 0; F.head = Math.atan2(-(BT.z - z), BT.x - x) + PI; setHelp('foot'); A.sfx(300, .08, 'triangle'); return true; }
function poseOars(sw) { const o = W3.oars; if (!o) return; for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; _o.position.set(.4, .52, .66 * sd); _o.rotation.set(0, i ? PI : 0, 0); _o.rotateY(sw * .55 * sd); _o.rotateX((.32 + Math.max(0, Math.sin(BT.op)) * .12 * Math.min(1, Math.abs(BT.v) + .3))); _o.scale.set(1, 1, 1); _o.updateMatrix(); o.setMatrixAt(i, _o.matrix); } o.instanceMatrix.needsUpdate = true; }
function stepBoat(dt) {   // tank controls: W/S row, A/D turn; drift, rocking, shore slide, plunge push, the cave
  const B = BT, Q = FT.BOAT, b = W3.boat, f = F.fish, ph = f.ph, game = ph === 'game', line = ph === 'wait' || ph === 'bite' || ph === 'fly' || ph === 'charge';
  const ix = (keyDown('KeyD') || keyDown('ArrowRight') ? 1 : 0) - (keyDown('KeyA') || keyDown('ArrowLeft') ? 1 : 0) + inp.stick[0], iz = (keyDown('KeyW') || keyDown('ArrowUp') ? 1 : 0) - (keyDown('KeyS') || keyDown('ArrowDown') ? 1 : 0) - inp.stick[1];
  const fast = keyDown('ShiftLeft') || keyDown('ShiftRight'), rain = SKY.w.rain, rb = 1 + (Q.RAIN_BOB - 1) * rain, MX = fast ? Q.MAX_FAST : Q.MAX;
  const h0 = B.h; if (!game && Math.abs(ix) > .1) B.h -= Math.max(-1, Math.min(1, ix)) * Q.TURN * (1 - .25 * Math.min(1, Math.abs(B.v) / Q.MAX_FAST)) * dt;
  if (B.h !== h0 && !boatOk(B.x, B.z, B.h) && boatOk(B.x, B.z, h0)) B.h = h0;
  const row = game || line ? 0 : Math.max(-1, Math.min(1, iz)); B.blockedRow = line && Math.abs(iz) > .1 ? B.blockedRow + dt : 0;
  if (game) B.v = 0; else if (Math.abs(row) > .1) { B.v = Math.max(-MX * .6, Math.min(MX, B.v + row * (fast ? Q.ACCEL_FAST : Q.ACCEL) * dt)); const op = B.op; B.op += dt * (fast ? 7.5 : 5) * Math.sign(row);
    if (Math.floor(op / TAU) !== Math.floor(B.op / TAU)) { B.strokes++; B.kick = 1; const sx = Math.sin(B.h), cx = Math.cos(B.h); const S_ = Q.SIZE; ripple(B.x - cx * .4 * S_ + sx * 2.4 * S_, B.z + sx * .4 * S_ + cx * 2.4 * S_, .8); A.sfx(180 + Math.random() * 40, .06, 'sine'); } }
  else { const dv = (Q.DRAG + Q.DRAG_K * Math.abs(B.v)) * dt; B.v = Math.abs(B.v) <= dv ? 0 : B.v - Math.sign(B.v) * dv; }
  const da = B.dd + Math.sin(VT * .05) * .6, dr = Q.DRIFT * (1 + (Q.RAIN_DRIFT - 1) * rain);
  let vx = Math.cos(B.h) * B.v + Math.cos(da) * dr, vz = -Math.sin(B.h) * B.v + Math.sin(da) * dr;
  const w = W3.fall; if (B.z > w.z && Math.hypot(B.x - w.x, B.z - w.z) < 5.5) vz += Q.PLUNGE;   // the plunge pool pushes you back out
  const nx = B.x + vx * dt, nz = B.z + vz * dt; B.bumpCd = Math.max(0, B.bumpCd - dt);
  if (boatOk(nx, nz, B.h)) { B.x = nx; B.z = nz; }
  else { const okX = boatOk(nx, B.z, B.h), okZ = boatOk(B.x, nz, B.h); if (okX) B.x = nx; else if (okZ) B.z = nz;
    if (B.bumpCd <= 0) { B.v *= Q.EDGE_KEEP; B.bumps++; B.bumpCd = .6; A.sfx(110, .06, 'triangle'); } }
  B.kick = Math.max(0, B.kick - dt * 2.5); const D2R = PI / 180;
  B.roll = Q.ROLL * D2R * rb * (Math.sin(VT * 1.1) * .7 + Math.sin(VT * 1.9 + 1) * .3) + B.kick * .4 * D2R * Math.sin(VT * 9);
  B.pitch = Q.PITCH * D2R * rb * (Math.sin(VT * .8 + .5) * .7 + Math.sin(VT * 1.5) * .3) - B.kick * 1.2 * D2R; B.heave = Q.HEAVE * rb * Math.sin(VT * 1.6);
  B.amp = Math.max(B.amp * (1 - dt * .02), Math.abs(B.roll));
  const want = keyDown('Space') || inp.tjump; if (want && !F.air && !game && !F.jumpHeld) { B.hv = Q.HOP_V; F.air = true; F.jumps = (F.jumps || 0) + 1; A.sfx(420, .06, 'square'); B.kick = 1; } F.jumpHeld = want;
  if (F.air) { B.hv -= FT.GRAV * dt; B.hop += B.hv * dt; if (B.hop <= 0) { B.hop = 0; B.hv = 0; F.air = false; B.kick = 1; ripple(B.x, B.z, 1); } }
  b.position.set(B.x, B.heave, B.z); b.rotation.set(B.roll, B.h, B.pitch); poseOars(Math.sin(B.op));
  F.pos.set(B.x, Q.SEAT + B.heave + B.hop, B.z); F.spd = 0; F.vy = 0; if (ph === 'idle') F.head = B.h;
  if (!F.exit && inCave(B.x, B.z)) { F.caveExits = (F.caveExits || 0) + 1; exitWorld('boat'); }
  const tr = B.trail || (B.trail = []), last = tr[tr.length - 1]; if (!last || Math.hypot(B.x - last[0], B.z - last[1]) > 1.2) { tr.push([B.x, B.z, B.h]); if (tr.length > 12) tr.shift(); }
  const tryIt = !game && !line && (Math.abs(ix) > .1 || Math.abs(iz) > .1), still = B.still0 && Math.hypot(B.x - B.still0[0], B.z - B.still0[1]) < .3 && Math.abs(B.h - B.still0[2]) < .3;
  if (!tryIt || !still) { B.still0 = [B.x, B.z, B.h]; B.stuckT = 0; } else if ((B.stuckT = (B.stuckT || 0) + dt) > 2) {
    const hl = Math.atan2(B.z, -B.x);   // heading that points the bow at the middle of the lake
    let fixed = '';
    if (Math.abs(angD(hl, B.h)) > .3 && boatOk(B.x, B.z, hl)) { B.h = hl; fixed = 'turned it toward the lake'; }
    else for (let i = tr.length - 1; i >= 0; i--) if (Math.hypot(tr[i][0] - B.x, tr[i][1] - B.z) > .6 && boatOk(tr[i][0], tr[i][1], tr[i][2])) { B.x = tr[i][0]; B.z = tr[i][1]; B.h = tr[i][2]; fixed = 'moved it back a little'; break; }
    B.stuckT = 0; B.still0 = [B.x, B.z, B.h];
    if (fixed) { B.v = 0; B.unstuck = (B.unstuck || 0) + 1; ripple(B.x, B.z, 1.2); toast('the boat was wedged: ' + fixed, 1.8); } }
}
function stepExit(dt) { const e = F.exit; e.t += dt; fadeEl.style.opacity = sstep(e.dur - .9, e.dur, e.t).toFixed(3);
  if (e.kind === 'path') { const g = W3.gate.userData, dx = g.x - F.pos.x, dz = g.z + 2 - F.pos.z, d = Math.hypot(dx, dz); if (d > .1) { F.pos.x += dx / d * Math.min(d, 4 * dt); F.pos.z += dz / d * Math.min(d, 4 * dt); F.head = Math.atan2(-dz, dx); } F.pos.y = groundAt(F.pos.x, F.pos.z); F.spd = 4; }
  else { const b = W3.boat; if (!F.inBoat) { F.inBoat = true; BT.h = b.rotation.y; } if (e.t > .5) { const k = dt * 5 * Math.min(1, (e.t - .5) * 2); b.position.x += Math.cos(BT.h) * k; b.position.z -= Math.sin(BT.h) * k; b.position.y = Math.sin(VT * 2) * .05; } F.pos.set(b.position.x, FT.BOAT.SEAT + b.position.y, b.position.z); F.head = BT.h; F.spd = 0; F.air = false; }
  if (e.t >= e.dur) finishExit(); }
// ambient life that moves (stepped, so the tests see the same thing as the screen): jumping fish, inlet bubbles, waterfall foam, particles, ripples
function stepFx(dt) {
  const fx = W3.fx;
  if (Math.random() < dt * 2.2) { const s = W3.sunkAt; ripple(s.x + (Math.random() - .5) * 5, s.z + (Math.random() - .5) * 5, .8); emitP('N', s.x + (Math.random() - .5) * 3, .05, s.z + (Math.random() - .5) * 3, 0, .8, 0, .7, .18, '#dff4ee', -.3); }
  if (Math.random() < dt * 14) { const w = W3.fall; emitP('N', w.x + (Math.random() - .5) * 3.6, .2, w.z + Math.random() * 1.2, (Math.random() - .5) * 1.5, 1.5 + Math.random() * 2, .6 + Math.random(), .9, .7 + Math.random() * .6, '#eef8f4', 2); }
  for (const jm of fx.jump) { if (!jm.a) { jm.wait -= dt; if (jm.wait <= 0) { for (let k = 0; k < 12; k++) { const a = Math.random() * TAU, R = 6 + Math.random() * 26, x = F.pos.x + Math.cos(a) * R, z = F.pos.z + Math.sin(a) * R;
          if (groundH(x, z) < -1.5) { const d2 = Math.random() * TAU; jm.a = new V3(x, 0, z); jm.b = new V3(x + Math.cos(d2) * 2.5, 0, z + Math.sin(d2) * 2.5); jm.t = 0; splash(x, z, 5); F.jumpsSeen = (F.jumpsSeen || 0) + 1; break; } } jm.wait = 3 + Math.random() * 5; } }
    else { jm.t += dt / .9; if (jm.t >= 1) { splash(jm.b.x, jm.b.z, 5); jm.a = null; } } }
  { const hr = fx.hintR || (fx.hintR = { u: 0, t: 0 }); hr.u = (hr.u + dt * .035) % 1; hr.t -= dt; if (hr.t <= 0) { hr.t = FT.HINT.RIP_EVERY; const w = W3.fall, x = Math.sin(hr.u * 9) * 1.5 * (1 - hr.u), z = lerp(-14, w.z + 3, hr.u); ripple(x, z, FT.HINT.RIP_S); } }   // hint: a line of ripples drifting toward the falls
  fallSound();
  const L = fx.ripL; for (let i = L.length - 1; i >= 0; i--) { L[i].t += dt; if (L[i].t > L[i].max) L.splice(i, 1); }
  for (const key of ['N', 'A']) { const Lp = fx.pL[key]; for (let i = Lp.length - 1; i >= 0; i--) { const p = Lp[i]; p.life -= dt; if (p.life <= 0) { Lp.splice(i, 1); continue; } p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; } }
}

/* ======================= render (when the 3D world owns the screen) ======================= */
const in3d = () => G.state === 'fish' && W3.built;
function render(dt) {
  const pl = A.pl, b = A.buddy, q = QL(), fx = W3.fx, f = F.fish;
  pl.root.position.copy(F.pos); pl.root.rotation.set(0, F.head, 0); pl.root.visible = true; if (pl.g) pl.g.visible = true;
  poseHero(dt);
  // camera: third person orbit (mouse look), never under the ground
  fcam.aspect = A.camera.aspect; fcam.fov = Math.min(80, A.camera.fov + 8); fcam.updateProjectionMatrix();
  const tgt = _v2.set(F.pos.x, F.pos.y + (F.inBoat ? 2.5 : 2.1), F.pos.z), cp = Math.cos(F.pitch), dist = F.dist * (F.inBoat ? FT.BOAT.CAM : 1);
  const cx = tgt.x + Math.sin(F.yaw) * cp * dist, cz = tgt.z + Math.cos(F.yaw) * cp * dist, cy = Math.max(tgt.y + Math.sin(F.pitch) * dist, groundAt(cx, cz) + .7, .5);
  if (F.camOverride) { fcam.position.fromArray(F.camOverride.p); fcam.lookAt(_v.fromArray(F.camOverride.l)); } else { fcam.position.set(cx, cy, cz); fcam.lookAt(tgt); }
  fcam.updateMatrixWorld(); fsky.position.copy(fcam.position); stepWater(dt);
  skyRender(dt);
  fsun.castShadow = !!q.shadows; fsun.position.copy(SUN); if (q.shadows) { fsun.target.position.set(Math.round(F.pos.x), 0, Math.round(F.pos.z)); fsun.position.copy(fsun.target.position).add(SUN); }
  // rod + line + bobber
  pl.root.updateMatrixWorld(true); const hand = pl.armR.userData.hand; hand.getWorldPosition(_v);
  const [ux, uz] = fwd(), ph = f.ph, gm = f.game;
  const el_ = ph === 'charge' ? lerp(1.2, 2.3, f.pow) : ph === 'fly' ? .35 : ph === 'game' ? .75 + (gm && gm.style !== 'steer' ? Math.sin(VT * 9) * .08 : 0) : ph === 'wait' || ph === 'bite' ? .45 : 1.15;
  F.rodEl = hold(F.rodEl, el_, dt, ph === 'fly' ? 30 : 10); const sd = gm && gm.style === 'steer' ? gm.rod * .6 : 0;
  _v3.set(ux * Math.cos(F.rodEl) - uz * sd, Math.sin(F.rodEl), uz * Math.cos(F.rodEl) + ux * sd).normalize(); F.rod.position.copy(_v); F.rod.quaternion.setFromUnitVectors(_up, _v3);
  const tip = rodTip(new V3());
  if (ph === 'idle' || ph === 'charge' || ph === 'land') { F.bob.position.set(tip.x, tip.y - .6, tip.z); F.line.userData.set(tip, F.bob.position, 0); }
  else { F.bob.position.copy(f.at); F.line.userData.set(tip, f.at, ph === 'wait' ? Math.min(1.2, tip.distanceTo(f.at) * .05) : ph === 'fly' ? .2 : .05, ph === 'game' ? VT * 10 : 0); }
  F.rod.visible = F.bob.visible = F.line.visible = !(F.exit && F.exit.kind === 'boat' && F.exit.t > .5);
  const aiming = ph === 'charge'; F.aimLine.visible = F.aimRing.visible = aiming;
  if (aiming) { const [ax, az] = camFwd(), d = FT.CAST_MIN + f.pow * (FT.CAST_MAX - FT.CAST_MIN), x = F.pos.x + ax * d, z = F.pos.z + az * d, y = Math.max(0, groundAt(x, z)) + .08, s = 1 + f.pow * .6;
    F.aimRing.position.set(x, y, z); F.aimRing.scale.set(s, 1, s); const sp = isWater(x, z) ? spotAt(x, z) : null; F.aimRing.material.color.set(!isWater(x, z) ? '#ff7a5a' : sp ? '#9fffb0' : '#ffe08a'); F.aimLine.userData.set(tip, F.aimRing.position, -(2.5 + f.pow * 3)); }
  renderItems(dt);
  F.bucket.visible = lastFishIdx() >= 0 && !F.exit; if (F.bucket.visible && F.bucketAt) F.bucket.position.set(F.bucketAt[0], groundAt(F.bucketAt[0], F.bucketAt[1]), F.bucketAt[1]);
  // buddy + his rod
  b.root.position.set(BUD.x, groundAt(BUD.x, BUD.z), BUD.z); b.root.rotation.set(0, BUD.head, 0); b.root.visible = !(F.exit && F.exit.kind === 'boat' && F.exit.t > .5);
  b.ph = (b.ph || 0) + dt * (2 + BUD.mv * 9); A.poseBuddy(b, dt, { mv: BUD.mv, air: 0, look: BUD.casting ? 0 : .2, lookAmt: .5, wave: BUD.joy > 0 ? 1 : 0, deep: 0 });
  const j = b.j; if (BUD.casting && BUD.joy <= 0 && A.buddyRig) { j.armR.rotation.x = .9; j.armR.rotation.z = .5; j.foreR.rotation.z = .9; A.buddyRig(b); }
  b.root.updateMatrixWorld(true); _v.set(.02, -.16, -.03).applyMatrix4(j.foreR.matrixWorld);
  const bel = BUD.joy > 0 ? 1.6 : BUD.casting ? .55 : 1.2, bh = BUD.head; _v3.set(Math.cos(bh) * Math.cos(bel), Math.sin(bel), -Math.sin(bh) * Math.cos(bel));
  BUD.rod.position.copy(_v); BUD.rod.quaternion.setFromUnitVectors(_up, _v3); BUD.rod.visible = BUD.bob.visible = BUD.line.visible = b.root.visible; BUD.rod.updateMatrixWorld(); const btip = new V3(0, 2.4, 0).applyMatrix4(BUD.rod.matrixWorld);
  if (BUD.casting) { BUD.bob.position.set(BUD.bobAt.x, Math.sin(VT * 2.6) * .04 - (BUD.timer < .6 ? .2 : 0), BUD.bobAt.z); BUD.line.userData.set(btip, BUD.bob.position, .3); } else { BUD.bob.position.set(btip.x, btip.y - .35, btip.z); BUD.line.userData.set(btip, BUD.bob.position, 0); }
  BUD.fish.visible = BUD.joy > .6; if (BUD.fish.visible) { BUD.fish.position.set(btip.x, btip.y - .5, btip.z); BUD.fish.rotation.z = Math.sin(VT * 20) * .5; }
  // rats + gull
  for (const r of RATS) { const run = r.st !== 'roam'; r.m.position.set(r.x, groundH(r.x, r.z) + Math.abs(Math.sin(VT * (run ? 22 : 10) + r.i)) * (run ? .12 : .04), r.z); r.m.rotation.set(0, r.a, r.st === 'sneak' ? -.08 : 0); r.m.scale.setScalar(1.1); }
  GULL.body.visible = GULL.st !== 'off'; if (GULL.body.visible) { GULL.body.position.set(GULL.x, GULL.y, GULL.z); const vx = GULL.st === 'dive' ? F.pos.x - GULL.from.x : 8, vz = GULL.st === 'dive' ? F.pos.z - GULL.from.z : -6; GULL.body.rotation.set(0, Math.atan2(-vz, vx), GULL.st === 'dive' ? -.5 : .3); GULL.wing.rotation.x = Math.sin(VT * (GULL.st === 'dive' ? 6 : 14)) * .6; }
  // ambient instances
  const cq = fcam.quaternion;
  fx.rayD.forEach((m, i) => { _o.position.set(m.x, 14, m.z); _o.rotation.set(0, Math.atan2(fcam.position.x - m.x, fcam.position.z - m.z), .32); _o.scale.set(m.w, 34, 1); _o.updateMatrix(); fx.rays.setMatrixAt(i, _o.matrix); fx.rays.setColorAt(i, _c.setScalar(.5 + .5 * Math.sin(VT * .4 + m.p))); });
  fx.rays.instanceMatrix.needsUpdate = true; fx.rays.instanceColor.needsUpdate = true;
  fx.mistD.forEach((m, i) => { _o.position.set(m.x + Math.sin(VT * .05 + m.p) * 4, m.y, m.z + Math.cos(VT * .04 + m.p) * 3); _o.quaternion.copy(cq); _o.scale.set(m.s * 1.8, m.s * .5, 1); _o.updateMatrix(); fx.mist.setMatrixAt(i, _o.matrix); }); fx.mist.instanceMatrix.needsUpdate = true;
  const fs = W3.spots[4];
  fx.birdD.forEach((m, i) => { const a = VT * m.sp + m.p, ox = m.c === 'falls' ? fs.x : 0, oz = m.c === 'falls' ? fs.z - 2 : 0; _o.position.set(ox + Math.cos(a) * m.r, m.y + Math.sin(a * 2.3) * .6, oz + Math.sin(a) * m.r); _o.rotation.set(0, -a, m.c === 'falls' ? .35 : .15); const fl = .45 + .55 * Math.abs(Math.sin(VT * 9 + i)); _o.scale.set(1.3, fl * 1.3, 1.3); _o.updateMatrix(); fx.birds.setMatrixAt(i, _o.matrix); }); fx.birds.instanceMatrix.needsUpdate = true;
  if (fx.flies && fx.flies.visible) { fx.flyD.forEach((m, i) => { const t = VT * m.sp + m.p, x = m.x + Math.sin(t * .7) * 2.4 + Math.sin(t * 1.9) * .5, z = m.z + Math.cos(t * .55) * 2.4; _o.position.set(x, groundH(x, z) + m.y + Math.sin(t * 2.3) * .35, z); _o.quaternion.copy(cq); const fl = .25 + .75 * Math.abs(Math.sin(VT * 14 + m.p * 3)); _o.scale.set(.32 * fl, .3, .32); _o.updateMatrix(); fx.flies.setMatrixAt(i, _o.matrix); }); fx.flies.instanceMatrix.needsUpdate = true; }
  fx.bugD.forEach((m, i) => { let s = .18 + .1 * Math.sin(VT * 4 + m.p);
    if (m.fall) { const u = (VT * .022 + m.p) % 1, x = lerp(m.x, W3.fall.x, u) + Math.sin(VT * .9 + m.w) * 1.4 * (1 - u), z = lerp(m.z, W3.fall.z + 2.2, u); _o.position.set(x, Math.max(0, groundH(x, z)) + m.y + Math.sin(VT * 1.3 + m.w) * .3, z); s *= Math.sin(u * PI) * FT.HINT.BUG_S; }
    else if (m.glow) { _o.position.set(m.x, m.y + Math.sin(VT * .7) * .1, m.z); s = .001 + sstep(.3, .8, SKY.night) * (6.8 + Math.sin(VT * 1.7) * .4); }   // wider than the 4.2 sheet, so the glow spills round the falls edges
    else _o.position.set(m.x + Math.sin(VT * .7 + m.p) * 1.2, groundH(m.x, m.z) + m.y + Math.sin(VT * 1.3 + m.p * 2) * .4, m.z + Math.cos(VT * .6 + m.p) * 1.2);
    _o.quaternion.copy(cq); _o.scale.set(s, s, s); _o.updateMatrix(); fx.bugs.setMatrixAt(i, _o.matrix); }); fx.bugs.instanceMatrix.needsUpdate = true;
  fx.glintD.forEach((m, i) => { const k = Math.max(0, Math.sin(VT * 2.2 + m.p * 3)), s = .2 + k * k * .9; _o.position.set(m.x, .12 + k * .1, m.z); _o.quaternion.copy(cq); _o.scale.set(s, s, s); _o.updateMatrix(); fx.glint.setMatrixAt(i, _o.matrix); }); fx.glint.instanceMatrix.needsUpdate = true;
  for (const jm of fx.jump) { jm.m.visible = !!jm.a; if (jm.a) { jm.m.position.lerpVectors(jm.a, jm.b, jm.t); jm.m.position.y = Math.sin(jm.t * PI) * 1.7; jm.m.rotation.set(0, Math.atan2(-(jm.b.z - jm.a.z), jm.b.x - jm.a.x), (.5 - jm.t) * 2.4); } }
  const L = fx.ripL; L.forEach((r, i) => { const u = r.t / r.max, s = (.4 + u * 2.4) * r.s; _o.position.set(r.x, .06, r.z); _o.rotation.set(0, 0, 0); _o.scale.set(s, 1, s); _o.updateMatrix(); fx.rip.setMatrixAt(i, _o.matrix); fx.rip.setColorAt(i, _c.setScalar((1 - u) * .8)); });
  fx.rip.count = L.length; fx.rip.instanceMatrix.needsUpdate = true; fx.rip.instanceColor.needsUpdate = true;
  for (const key of ['N', 'A']) { const Lp = fx.pL[key], im = key === 'N' ? fx.pN : fx.pA;
    Lp.forEach((p, i) => { const t = p.life / p.max, s = p.size * (1.4 - t * .4); _o.position.set(p.x, p.y, p.z); _o.quaternion.copy(cq); _o.scale.set(s, s, s); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); im.setColorAt(i, _c.copy(p.c).multiplyScalar(Math.min(1, t * 2))); });
    im.count = Lp.length; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
  W3.gate.userData.halo.quaternion.copy(cq); if (W3.boat && !F.exit && !F.inBoat) W3.boat.position.y = Math.sin(VT * 1.6) * .06;
  A.renderer.render(fscene, fcam);
  F.calls = A.renderer.info.render.calls; F.tris = A.renderer.info.render.triangles;
  drawHud();
  fpsN++; fpsT += dt; if (fpsT >= 1) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
}
function poseHero(dt) {
  const pl = A.pl, R = (o, k, v, r) => { o.rotation[k] = hold(o.rotation[k], v, dt, r || 24); }, f = F.fish, mv = Math.min(1, F.spd / FT.WALK);
  F.wph += dt * F.spd * 1.5; const s = Math.sin(F.wph), br = Math.sin(VT * 2.4);
  let ll = s * mv, lr = -s * mv, al = -s * mv + br * .05, lean = -.14 * mv; const bob = Math.abs(Math.cos(F.wph)) * .12 * mv;
  if (F.air) { ll = .9; lr = -.3; al = 1.2; lean = -.1; }
  if (F.inBoat) { ll = lr = 1.25; lean = .05; al = .9; }   // seated on the middle thwart
  const ar = f.ph === 'charge' ? 2.6 : f.ph === 'fly' ? 1.0 : f.ph === 'game' ? 1.25 + Math.sin(VT * 14) * .1 : 1.0 + (mv > .1 ? s * .2 : 0);
  if (f.ph === 'game' || f.ph === 'charge') { al = 1.1; lean = f.ph === 'game' ? .18 : -.1; }
  R(pl.legL, 'z', ll); R(pl.legR, 'z', lr); R(pl.ankL, 'z', -ll * .5); R(pl.ankR, 'z', -lr * .5); R(pl.armL, 'z', al); R(pl.armR, 'z', ar);
  R(pl.bod, 'z', lean, 12); pl.bod.position.y = (pl.bod.userData.y0 === undefined ? (pl.bod.userData.y0 = pl.bod.position.y) : pl.bod.userData.y0) + bob + br * .015;
  if (pl.sprout) pl.sprout.rotation.z = Math.sin(VT * 3.3) * .12 + (mv > .1 ? Math.sin(F.wph * 2) * .1 : 0);
}
function drawHud() {
  let fishN = 0, loot = 0, rec = 0; for (const c of F.bag) { if (c.kind === 'fish') fishN++; else if (c.kind === 'loot') loot++; else if (c.kind === 'recipe') rec++; }
  const hid = W3.spots.filter(s => s.hidden), hf = hid.filter(s => s.found).length;
  const ik = itemHud(), k = ik + '|' + fishN + '|' + loot + '|' + rec + '|' + hf + '|' + BUD.catches + '|' + G.score + '|' + (F.curSpot ? F.curSpot.id : '') + '|' + F.paused;
  if (F.hudKey === k) return; F.hudKey = k;
  hudEl.innerHTML = '<span><b>FISHING WORLD</b>' + (F.paused ? ' (PAUSED - P)' : '') + '</span><span>fish ' + fishN + '</span><span>loot ' + loot + '</span><span>recipes ' + rec + '</span><span>hidden spots ' + hf + '/' + hid.length + '</span><span>buddy ' + BUD.catches + '</span>' +
    (F.curSpot && F.curSpot.found ? '<span>@ ' + F.curSpot.name + '</span>' : '') + ik + '<span style="margin-left:auto;color:#e8c14a">' + G.score + '</span>';
}

/* ======================= input (own listeners; game.js's keys are cleared on the way in and out) ======================= */
const cv = A.cv;
addEventListener('keydown', e => {
  if (G.state === 'play') {
    if (e.code === 'KeyF' && F.near && !e.repeat) { startWalk('chain'); e.preventDefault(); return; }
    if (!e.repeat && (e.code === 'Digit7' || e.code === 'Digit8' || e.code === 'Digit9')) { startWalk(e.code === 'Digit7' ? 'side' : e.code === 'Digit8' ? 'swing' : 'chain'); return; }   // debug: side only / swing only / both
    if (!e.repeat && e.code === 'Digit0') { if (startWalk('chain')) enter3D(); return; }                                                                                        // debug: straight in
    return; }
  if (G.state === 'fishin') { if ((e.code === 'KeyF' || e.code === 'Enter') && !e.repeat) { const w = WALK[wk.mode]; wk.t = Math.max(wk.t, w.fade[0]); } return; }
  if (G.state !== 'fish') return;
  if (F.pick) { const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code]; if (n !== undefined && !e.repeat) choosePick(n); return; }
  if (SKY_TESTQ && !e.repeat && (e.code === 'Digit8' || e.code === 'Digit9')) { if (e.code === 'Digit8') { const ks = ['clear', 'mist', 'rain'], k = ks[(ks.indexOf(SKY.kind) + 1) % 3]; setWeather(k, false); SKY.lock = Object.assign(SKY.lock || {}, { kind: k }); toast('test: weather ' + k, 1.5); } else { SKY.tod = (SKY.tod + .1) % 1; toast('test: time ' + todPeriod(SKY.tod), 1.5); } return; }   // ?test=1 only: 8 = next weather (fades), 9 = time +10%
  inp.down.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyF' && !e.repeat) inp.actQ++;
  if (e.code === 'KeyE' && !e.repeat) useE();
  if (e.code === 'KeyP' && !e.repeat) { F.paused = !F.paused; F.hudKey = ''; }
  if (e.code === 'Escape' && F.fish.ph !== 'idle') reelIn(false, 'reeled in');
}, true);
addEventListener('keyup', e => { inp.down.delete(e.code); });
addEventListener('blur', () => { inp.down.clear(); inp.act = false; if (G.state === 'fish') { F.paused = true; F.hudKey = ''; } });
cv.addEventListener('pointerdown', e => { if (G.state !== 'fish' || e.pointerType === 'touch') return;
  if (e.button === 0) { if (document.pointerLockElement !== cv && !F.noLock && !F.lockAsked) { F.lockAsked = true; try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => { F.noLock = true; }); } catch (_) { F.noLock = true; } return; } inp.act = true; inp.actQ++; }
  if (e.button === 2) F.drag = [e.clientX, e.clientY]; });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== cv) F.lockAsked = false; });
addEventListener('pointerup', e => { if (e.button === 0) inp.act = false; if (e.button === 2) F.drag = null; });
addEventListener('pointermove', e => { if (G.state !== 'fish' || e.pointerType === 'touch') return; let dx = 0, dy = 0;
  if (document.pointerLockElement === cv) { dx = e.movementX || 0; dy = e.movementY || 0; } else if (F.drag) { dx = e.clientX - F.drag[0]; dy = e.clientY - F.drag[1]; F.drag = [e.clientX, e.clientY]; }
  look(dx, dy); });
function look(dx, dy) { F.yaw -= dx * .0042; F.pitch = Math.max(-.12, Math.min(1.25, F.pitch + dy * .0035)); }
addEventListener('wheel', e => { if (G.state === 'fish') F.dist = Math.max(4, Math.min(13, F.dist + Math.sign(e.deltaY) * .8)); }, { passive: true });
promptEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (G.state === 'play' && F.near) startWalk('chain'); else if (G.state === 'fish') useE(); });
let TJ = null;   // the phone JUMP button (OUT in the boat at the dock)
if (isTouch) {   // left = move stick, right = look, FISH + JUMP buttons
  touchEl.innerHTML = '<div class="tb2" id="fw-tfish" style="right:4vmin;bottom:6vmin;width:19vmin;height:19vmin">FISH</div><div class="tb2" id="fw-tjump" style="right:26vmin;bottom:4vmin">JUMP</div>';
  const tf = document.getElementById('fw-tfish'), tj = document.getElementById('fw-tjump'); let stickId = null, lookId = null, s0 = null, l0 = null;
  tf.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); inp.tact = true; inp.actQ++; tf.classList.add('on'); });
  tf.addEventListener('pointerup', () => { inp.tact = false; tf.classList.remove('on'); }); tf.addEventListener('pointercancel', () => { inp.tact = false; tf.classList.remove('on'); });
  TJ = tj; tj.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (F.inBoat) { if (F.nearExit === 'out') useE(); return; } inp.tjump = true; }); tj.addEventListener('pointerup', () => { inp.tjump = false; });
  touchEl.addEventListener('pointerdown', e => { if (e.clientX < innerWidth * .45 && stickId === null) { stickId = e.pointerId; s0 = [e.clientX, e.clientY]; } else if (lookId === null) { lookId = e.pointerId; l0 = [e.clientX, e.clientY]; } });
  touchEl.addEventListener('pointermove', e => { if (e.pointerId === stickId) inp.stick = [Math.max(-1, Math.min(1, (e.clientX - s0[0]) / 50)), Math.max(-1, Math.min(1, (e.clientY - s0[1]) / 50))]; else if (e.pointerId === lookId) { look((e.clientX - l0[0]) * 1.6, (e.clientY - l0[1]) * 1.2); l0 = [e.clientX, e.clientY]; } });
  const up = e => { if (e.pointerId === stickId) { stickId = null; inp.stick = [0, 0]; } if (e.pointerId === lookId) lookId = null; };
  touchEl.addEventListener('pointerup', up); touchEl.addEventListener('pointercancel', up);
}

/* ======================= hooks + test API ======================= */
const api = { step: dt => { if (!F.manual) step(dt); }, afterSide, roomBuilt: buildSide, in3d, render, FT, paths,
  fromMap(back) { if (G.state !== 'map' || typeof back !== 'function') return false; F.ret = { map: true, back }; wk.on = false; enter3D(); return true; },   // the paper map's pond door (topworld.js)
  skin: () => ({ on: SKIN.on, swaps: SKIN.swaps.length, rivets: SKIN.scaled.length, SKIN }),
  heroMats: () => { const a = []; A.pl.root.traverse(o => { if (o.isMesh) a.push(o.material.uuid + ':' + (o.material.color ? o.material.color.getHexString() : '') + ':' + o.scale.x.toFixed(4)); }); return a.join('|'); },
  test: {
    F, W3, TH, RING, get fring() { return fring; }, FARC, get fcards() { return fcards; }, FARU, farArtErr: () => FAR_ART.err.slice(), wcInfo: () => ({ on: !!WCP, loaded: !!(uWC.value && uWC.value.image && uWC.value.image.width > 1) }), BUD, RATS, GULL, FISH, TABLES, wk, side, inp, paths, roomPathX, startWalk, enter3D, exitWorld, buildWorld, groundH, groundAt, isWater, spotAt, H0, lakeR, mkCatch,
    info: () => ({ state: G.state, mode: F.mode, walk: { on: wk.on, mode: wk.mode, t: +wk.t.toFixed(2), z: +wk.z.toFixed(2), phases: wk.phases.slice(), phase: G.state === 'fishin' ? walkPhase() : null, fade: +fadeEl.style.opacity || 0, heroZ: +A.pl.root.position.z.toFixed(2), heroRotY: +A.pl.root.rotation.y.toFixed(2) },
      pos: F.pos.toArray().map(v => +v.toFixed(2)), head: +F.head.toFixed(2), yaw: +F.yaw.toFixed(2), air: F.air, spd: +F.spd.toFixed(2), bumps: F.bumps || 0, jumps: F.jumps || 0,
      fish: { ph: F.fish.ph, style: F.fish.game && F.fish.game.style, spot: F.fish.spot && F.fish.spot.id, styles: F.fish.styles.slice(), last: F.fish.lastResult },
      bag: F.bag.map(c => c.n), lost: F.lost.map(c => c.n), stats: Object.assign({}, F.stats), found: W3.spots.filter(s => s.found).map(s => s.id), buddy: { st: BUD.st, casting: !!BUD.casting, catches: BUD.catches, last: BUD.last, rod: !!(BUD.rod && BUD.rod.visible) },
      rats: RATS.map(r => ({ st: r.st, steals: r.steals, lost: r.lost, back: r.back, carry: !!r.fish, x: +r.x.toFixed(1), z: +r.z.toFixed(1) })), gull: { st: GULL.st, shoo: GULL.shoo, steals: GULL.steals },
      prompt: promptEl.style.display === 'block' ? promptEl.textContent : '', gameUi: gameEl.style.display === 'block' ? gameEl.textContent : '', nearExit: F.nearExit, lastExit: F.lastExit, visits: F.visits,
      calls: F.calls, tris: F.tris, fps: +fps.toFixed(1), buildMs: W3.ms && +W3.ms.toFixed(0), cleared: side.cleared, sidePath: roomPathX(), score: G.score, jumpsSeen: F.jumpsSeen || 0, log: F.log.slice(-8) }),
    advance(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) { if (G.state === 'play') A.update(STEP); step(STEP); } },
    key(code, down) { if (down) { if (!inp.down.has(code) && code === 'KeyF') inp.actQ++; inp.down.add(code); } else inp.down.delete(code); },
    tap() { inp.actQ++; },
    manual(on) { F.manual = !!on; },   // tests: the frame loop stops stepping the world; advance() steps it instead (game time, no waits)
    place(x, z) { F.pos.set(x, groundAt(x, z), z); F.vy = 0; F.air = false; F.spd = 0; },
    faceTo(x, z) { const dx = x - F.pos.x, dz = z - F.pos.z; F.head = Math.atan2(-dz, dx); F.yaw = Math.atan2(-dx, -dz); },
    spot: id => W3.spots.find(s => s.id === id), force(k) { F.fish.forced = mkCatch(k); }, forceGull() { F.forceGull = true; }, cam(o) { F.camOverride = o || null; },
    get ITEMS() { return ITEMS; }, items: () => Object.assign({}, F.items), pick: () => F.pick && F.pick.cards.map(c => ({ key: c.key, kind: c.kind, n: c.n })), choose: i => choosePick(i), picks: () => F.picks.slice(),
    styleFor, waterDepth, FT,
    game: () => F.fish.game, renderOnce() { render(STEP); return { calls: F.calls, tris: F.tris }; }, water: () => waterInfo(), detail: () => Object.assign({ flies: W3.fx.flies ? W3.fx.flies.count : 0, fliesVis: !!(W3.fx.flies && W3.fx.flies.visible) }, W3.detail),
    // time + weather: sky({ tod: 0..1, kind: 'clear'|'mist'|'rain', instant, freeze }) locks them (also for later visits); sky(null) unlocks
    sky(o) { if (o === null) { SKY.lock = null; return api.test.skyInfo(); } SKY.lock = Object.assign(SKY.lock || {}, o); if (o.tod !== undefined) { SKY.tod = o.tod; } if (o.kind) setWeather(o.kind, !!o.instant); return api.test.skyInfo(); },
    skyInfo: () => ({ nsnd: !!(NX && NX.nsnd && NX.nsnd.gn), nsndGain: NX && NX.nsnd && NX.nsnd.gn ? NX.nsnd.gn.gain.value : 0, frogs: NX && NX.nsnd ? NX.nsnd.frogs || 0 : 0, tod: +SKY.tod.toFixed(4), per: SKY.per || todPeriod(SKY.tod), kind: SKY.kind, rain: +SKY.w.rain.toFixed(3), mist: +SKY.w.mist.toFixed(3), raining: raining(), night: +SKY.night.toFixed(3), next: +SKY.next.toFixed(1), rolls: SKY.rolls, toasts: SKY.toasts.slice(-6), fog: fscene.fog.density, sunI: fsun.intensity,
      moon: !!(NX && NX.moon.visible), rainVis: !!(NX && NX.rain.visible), rings: NX ? NX.rings.count : 0, motes: NX ? NX.motes.count : 0, snd: !!(NX && NX.snd && NX.snd.gn), sndGain: NX && NX.snd && NX.snd.gn ? NX.snd.gn.gain.value : 0 }),
    BT, boardBoat, leaveBoat, useE, boatOk, inCave, inChan, deepMid, dockDist, FZC, rollCatch,
    boat: () => ({ inBoat: !!F.inBoat, x: +BT.x.toFixed(2), z: +BT.z.toFixed(2), h: +BT.h.toFixed(3), v: +BT.v.toFixed(3), roll: +BT.roll.toFixed(4), amp: +BT.amp.toFixed(4), strokes: BT.strokes, bumps: BT.bumps, nearExit: F.nearExit, prompt: F.promptTxt, help: helpEl.dataset.k, fallGain: NX ? +(NX.fallGain || 0).toFixed(4) : 0, fsnd: !!(NX && NX.fsnd && NX.fsnd.gn), caveExits: F.caveExits || 0, boards: F.boards || 0 }),
    weights: (spot, per, rain, deep) => { const tab = TABLES[spot] || TABLES.open, w = catchWeights(spot, per, rain, deep); return tab.map(([k], i) => [k, +w[i].toFixed(3)]); }, rollWeather: () => { rollWeather(false); return SKY.kind; }, todPeriod, stepSky: dt => stepSky(dt), PM: () => PM, paint: () => PAINT
  } };

/* ======================= mudbot IMPASTO SKIN (fishing world only) =======================
   Same mudbot (game.js buildHero): only his materials are swapped while you are in the 3D world, and put back on exit,
   so the side scroller mudbot never changes. Painterly look: chipped, speckled red / teal paint, a plaster patch, grey
   steel limbs, bigger rivets. All procedural (small canvas textures). SWAPPABLE: set SKIN.tex.paint / .soft to any
   THREE texture (e.g. painted art later) before the first visit; SKIN.PAL maps the game's hero colours to the new ones. */
const SKIN = { on: false, swaps: [], scaled: [], cache: new Map(), tex: { paint: null, soft: null },
  PAL: {   // game hero hex -> [impasto hex, texture, roughness, metalness, emissive intensity]
    bf5c40: ['#c4452e', 'paint', .85, .02, .12], bf6247: ['#c24a30', 'paint', .9, 0, .12], '7d3a2a': ['#6b2a1e', 'soft', .7, .05, .06],
    '3ca79f': ['#3e93a2', 'paint', .85, .02, .12], '267975': ['#2b6b7b', 'soft', .8, .05, .08], '777772': ['#9ca0a5', 'soft', .5, .25, .06],
    e8d9b0: ['#dcc497', 'plaster', 1, 0, .05], cdb07a: ['#c9a873', 'plaster', 1, 0, .05], f1de4d: ['#f6eab6', null, .3, 0, 1],
    '492f29': ['#4a2e24', 'soft', 1, 0, 0], '66904b': ['#5f9e45', 'soft', .8, 0, .05], '4f7339': ['#4f8a3a', 'soft', .8, 0, .05], '4a3226': ['#3b261d', 'soft', 1, 0, 0] } };
function skinTex(kind) {
  if (SKIN.tex[kind]) return SKIN.tex[kind];
  const S = 256, cv_ = document.createElement('canvas'); cv_.width = cv_.height = S; const g = cv_.getContext('2d'), r = mulberry(kind === 'paint' ? 2217 : kind === 'plaster' ? 2219 : 2218);
  g.fillStyle = kind === 'plaster' ? 'rgb(236,232,222)' : 'rgb(222,222,222)'; g.fillRect(0, 0, S, S);
  const strokes = kind === 'plaster' ? 260 : 520;
  for (let i = 0; i < strokes; i++) {   // short, thick, mostly-horizontal knife strokes, lighter and darker than the base
    const x = r() * S, y = r() * S, L = 8 + r() * 26, a = (r() - .5) * (kind === 'plaster' ? 2.4 : .9), w = 2 + r() * 5, v = r() < .55 ? 236 + r() * 19 : 176 + r() * 36;
    g.strokeStyle = 'rgba(' + (v | 0) + ',' + (v | 0) + ',' + (v | 0) + ',' + (.35 + r() * .5).toFixed(2) + ')'; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * L * .5, y + Math.sin(a) * L * .5 + (r() - .5) * 4, x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
    if (r() < .3) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.stroke(); } }
  if (kind === 'paint') {
    for (let i = 0; i < 36; i++) {   // chips: pale primer showing through, ragged edges
      const x = r() * S, y = r() * S, n = 5 + (r() * 4 | 0), R = 2 + r() * 6; g.fillStyle = 'rgba(250,244,228,' + (.55 + r() * .4).toFixed(2) + ')'; g.beginPath();
      for (let k = 0; k < n; k++) { const t = k / n * TAU, rr = R * (.5 + r() * .7); g[k ? 'lineTo' : 'moveTo'](x + Math.cos(t) * rr, y + Math.sin(t) * rr); } g.closePath(); g.fill(); }
    for (let i = 0; i < 160; i++) { const x = r() * S, y = r() * S, R = .8 + r() * 2.6; g.fillStyle = 'rgba(' + (40 + r() * 30 | 0) + ',' + (26 + r() * 16 | 0) + ',20,' + (.6 + r() * .4).toFixed(2) + ')';   // dark mud / rust speckles
      g.beginPath(); g.ellipse(x, y, R * (1 + r()), R, r() * PI, 0, TAU); g.fill(); } }
  if (kind === 'plaster') for (let i = 0; i < 40; i++) { const y = r() * S; g.fillStyle = 'rgba(150,130,100,.25)'; g.fillRect(0, y, S, .8); }   // fabric weave hints
  const t = new THREE.CanvasTexture(cv_); t.wrapS = t.wrapT = (THREE.RepeatWrapping || 1000); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  SKIN.tex[kind] = t; return t;
}
function skinMat(m) {
  if (SKIN.cache.has(m)) return SKIN.cache.get(m);
  let out = null; const hex = m.color && m.color.getHexString && m.color.getHexString(), p = hex && SKIN.PAL[hex];
  if (p && (m.isMeshStandardMaterial || m.isMeshLambertMaterial)) {
    out = m.clone(); out.color.set(p[0]); const t = p[1] ? skinTex(p[1]) : null;
    if (t) { out.map = t; if (out.isMeshStandardMaterial) { out.bumpMap = t; out.bumpScale = p[1] === 'paint' ? 2.2 : 1.2; } }
    if (out.isMeshStandardMaterial) { out.roughness = p[2]; out.metalness = p[3]; }
    if (out.emissive) { out.emissive.set(p[0]); out.emissiveIntensity = p[4]; if (t) out.emissiveMap = t; }
    out.needsUpdate = true; reg(out); }
  SKIN.cache.set(m, out); return out;
}
function skinOn() {
  if (SKIN.on) return; SKIN.on = true; SKIN.swaps.length = 0; SKIN.scaled.length = 0; const pl = A.pl;
  pl.root.traverse(o => { if (!o.isMesh || !o.material || Array.isArray(o.material)) return; const m = o.material, s = skinMat(m); if (!s) return;
    SKIN.swaps.push([o, m]); o.material = s;
    if (m.color.getHexString() === '7d3a2a' && o.geometry && o.geometry.type === 'SphereGeometry' && o.scale.x < .07) { SKIN.scaled.push([o, o.scale.x]); o.scale.multiplyScalar(1.45); } });   // rivets: bigger, so they read
}
function skinOff() {
  if (!SKIN.on) return; SKIN.on = false; for (const [o, m] of SKIN.swaps) o.material = m; for (const [o, s] of SKIN.scaled) o.scale.setScalar(s); SKIN.swaps.length = 0; SKIN.scaled.length = 0;
}

/* ======================= OIL-PAINT WATER (fishing world only) =======================
   One material on the one water mesh: thick glossy impasto strokes that flow and smear along a curl-noise flow field
   (two-phase flow map, so the strokes keep moving without stretching forever), wet specular highlights on the stroke ridges,
   shallow / mid / deep colours blended like wet paint, cream-white foam dabs where the water meets land, ripples and splashes
   as paint daubs that spread out, a cheap fresnel sky / tree tint (not a mirror), sparkle strokes from the sun, and the
   waterfall churning cream into the lake. LOW: one stroke layer, no bump normals. Numbers in FT.WATER.
   The stroke canvas (PAINT) is procedural (made in code at load); SWAPPABLE: put a texture into PAINT.tex before the first visit. */
Object.assign(FT, { WATER: { SHAL: '#8ec9a4', MID: '#3f93a2', DEEP: '#1c4a78', FOAM: '#f6f0dc', SKY: '#a8d4e4', TREE: '#3a6a40',
  WAVE: .045,          // vertex wave height (world units)
  FLOW: .085,          // flow-map phase speed (cycles per second); higher = faster smear
  STROKE: .075,        // stroke tiles per world unit (bigger = finer strokes)
  RIP_SPEED: 1.9, RIP_LIFE: 2.4, RIP_MAX: 8,   // paint-daub ripples: spread speed, life (s), max at once (shader slots)
  BOB_RIP: 1.3, BITE_RIP: .35, GAME_RIP: .6,   // seconds between ripples around the bobber while waiting / on a bite / in a catch game
  DEPTH_RES_HI: 256, DEPTH_RES_LO: 128, SPAN: 160,
  WC_SC: .06, WC_DRIFT: .006, WC_STR: 1.5, WC_FRES: .55,   // watercolour lake: tile repeats per world unit, drift speed, how strongly its blotches tint the depth colours, share of the sky fresnel kept (washes stay readable)
  SWIRL: .045, WARP: 2.6, BANDS: 13, DRIFT: .05, RIDGE: .85, SHINE: 64, SPEC: 1.05, BLEND: 1.5, JIT: .2, FRES: .34, BRISTLE: .32, FINE: .42, DEPK: 2.6, MID: .16, MIDSC: 9.5, COVE_DEEP: 3.6 } });   // swirl strokes: noise scale per unit (smaller = bigger swirls), domain warp, paint bands per swirl, drift speed, ridge bump, wet highlight power + strength, swirl push on shallow->deep, per-stroke colour jitter, sky tint at grazing angles, bristle grooves, finer swirl mixed in (no flat calm patches), depth for full deep colour; MID/MIDSC = small swirl octave (strength, scale) so close views over calm patches still cross bands
const PAINT = { tex: null };
FT.PAINT = Object.assign({ BOLD: 1.6, GROUND: 1.25, GROUND_SC: .03, SKY: .34,   // BOLD x stroke strength on rocks / trees / wood / grass; GROUND = big-stroke layer on flat ground (GROUND_SC tiles per unit, HIGH only); SKY = brush streaks in the sky
  N: 330, LEN: [60, 150], WID: [12, 26], ANG: 1.0, BRISTLE: 5, DAB: .3,   // paint canvas: stroke count, length / width range (px of 512), angle spread (rad), bristle streaks per stroke, share of hue dabs
  GSC: .055, GST: 1.15, HUE: .9 }, FT.PAINT || {});   // ground: stroke tiles per unit (bigger strokes), stroke contrast, hue-dab strength

function paintTex() {   // R = stroke light/dark (bold, opaque, bristle streaks, a dark edge), G = warm/cool patches + per-stroke hue dabs, B = dark speckles
  if (PAINT.tex) return PAINT.tex;
  const PT = FT.PAINT, S = 512, mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; }, r = mulberry(4401);
  const c = mk(), g = c.getContext('2d'), cp = mk(), gp = cp.getContext('2d');
  // patches (warm / cool) on their own canvas, added into G at the end
  gp.fillStyle = '#000'; gp.fillRect(0, 0, S, S); gp.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 60; i++) { const x = r() * S, y = r() * S, R = 40 + r() * 90, gr = gp.createRadialGradient(x, y, 0, x, y, R), v = (r() * 70) | 0; gr.addColorStop(0, 'rgba(' + v + ',0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); gp.fillStyle = gr;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { gp.save(); gp.translate(ox, oy); gp.fillRect(x - R, y - R, R * 2, R * 2); gp.restore(); } }
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, S, S); g.lineCap = 'round';
  const tile = fn => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };
  for (let i = 0; i < PT.N; i++) {
    const x = r() * S, y = r() * S, L = PT.LEN[0] + r() * (PT.LEN[1] - PT.LEN[0]), a = (r() - .5) * PT.ANG, w = PT.WID[0] + r() * (PT.WID[1] - PT.WID[0]), bend = (r() - .5) * w * 1.6;
    const lite = r() < .5, v = lite ? 190 + r() * 60 : 35 + r() * 70, hv = r() < PT.DAB ? (r() < .5 ? 20 + r() * 40 : 215 + r() * 40) : 104 + r() * 48;
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
    const path = (X0, Y0, off) => { g.beginPath(); g.moveTo(X0 + nx * off, Y0 + ny * off); g.quadraticCurveTo(X0 + ca * L * .5 + nx * (off + bend), Y0 + sa * L * .5 + ny * (off + bend), X0 + ca * L + nx * off, Y0 + sa * L + ny * off); };
    tile((ox, oy) => { const X0 = x + ox, Y0 = y + oy; if (X0 < -140 || X0 > S + 140 || Y0 < -140 || Y0 > S + 140) return;
      g.strokeStyle = 'rgba(' + ((v * .45) | 0) + ',' + (hv | 0) + ',128,.9)'; g.lineWidth = w + 3; path(X0, Y0, w * .18); g.stroke();   // impasto edge shadow
      g.strokeStyle = 'rgba(' + (v | 0) + ',' + (hv | 0) + ',128,.97)'; g.lineWidth = w; path(X0, Y0, 0); g.stroke();
      for (let k = 0; k < PT.BRISTLE; k++) { const off = (k / (PT.BRISTLE - 1) - .5) * w * .8, bv = Math.max(0, Math.min(255, v + ((k * 97 + i * 31) % 7 - 3) * 16)); g.strokeStyle = 'rgba(' + (bv | 0) + ',' + (hv | 0) + ',128,.6)'; g.lineWidth = 1 + (k % 2); path(X0, Y0, off); g.stroke(); }
      g.strokeStyle = 'rgba(' + (Math.min(255, v + 45) | 0) + ',' + (hv | 0) + ',128,.7)'; g.lineWidth = Math.max(1.5, w * .16); path(X0, Y0, -w * .28); g.stroke(); });   // lit ridge
  }
  const id = g.getImageData(0, 0, S, S), d = id.data, pd = gp.getImageData(0, 0, S, S).data;
  for (let k = 0; k < d.length; k += 4) d[k + 1] = Math.max(0, Math.min(255, d[k + 1] + pd[k] - 35));
  for (let i = 0; i < 9000; i++) { const q = ((r() * S | 0) + (r() * S | 0) * S) * 4; d[q + 2] = 20 + r() * 60; }
  g.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = (THREE.RepeatWrapping || 1000); t.anisotropy = 8; PAINT.tex = t; return t;
}
const uPaint = { value: null };
const uWater = { sky: { value: new THREE.Color(FT.WATER.SKY) }, deep: { value: new THREE.Color(FT.WATER.DEEP) }, mid: { value: new THREE.Color(FT.WATER.MID) }, shal: { value: new THREE.Color(FT.WATER.SHAL) },
  foam: { value: new THREE.Color(FT.WATER.FOAM) }, tree: { value: new THREE.Color(FT.WATER.TREE) }, sun: { value: new THREE.Color('#fff2c8') }, sunD: { value: new THREE.Vector3(-.5, .7, -.33).normalize() },
  glint: { value: 1 }, rain: { value: 0 }, time: { value: 0 }, depth: { value: null }, fall: { value: new THREE.Vector3(0, -999, 1) },
  rip: { value: (() => { const a = new Float32Array(FT.WATER.RIP_MAX * 4); for (let i = 2; i < a.length; i += 4) a[i] = 99; return a; })() } };   // flat vec4[] (x, z, age, size): the vendored three build has no Vector4
const WV = { baked: false, bobT: 0, lastPh: '', calls: 0 };
const WCP = window.JR_WATER && window.JR_WATER.src ? window.JR_WATER : null;   // the picked watercolour lake tile (art/water-tex.js); null = the painted water
const uWC = { value: null }, uWCm = { value: new THREE.Color(1, 1, 1) };
if (WCP) { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = 'rgb(' + WCP.mean.map(v => Math.round(v * 255)).join(',') + ')'; g.fillRect(0, 0, 1, 1);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = 1000; t.colorSpace = THREE.SRGBColorSpace; uWC.value = t; uWCm.value.setRGB(WCP.mean[0], WCP.mean[1], WCP.mean[2], THREE.SRGBColorSpace);   // 1000 = repeat (slim bundle)
  const im = new Image(); im.onload = () => { t.dispose(); t.image = im; t.needsUpdate = true; }; im.src = WCP.src; }   // dispose first: a texture already drawn at 1x1 keeps fixed-size GPU storage (WebGL2), so the bigger picture needs a fresh upload
function waterMat() {
  const lo = QL().name === 'LOW', WT = FT.WATER, WC = !!WCP;
  const m = reg(new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: .93, depthWrite: false }));
  m.onBeforeCompile = sh => { uPaint.value = paintTex(); Object.assign(sh.uniforms, { tPaint: uPaint, tDepth: uWater.depth, uTime: uWater.time, uSkyW: uWater.sky, uDeepW: uWater.deep, uMidW: uWater.mid, uShalW: uWater.shal, uFoamW: uWater.foam, uTreeW: uWater.tree,
      uSunW: uWater.sun, uSunD: uWater.sunD, uGlintW: uWater.glint, uRainW: uWater.rain, uFall: uWater.fall, uRip: uWater.rip }); if (WC) Object.assign(sh.uniforms, { tWC: uWC, uWCm: uWCm });
    const N = WT.RIP_MAX, f = n => (+n).toFixed(4);
    sh.vertexShader = 'uniform float uTime; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
      ' { vec3 wq=(modelMatrix*vec4(transformed,1.)).xyz; transformed.y+=(sin(wq.x*.33+uTime*1.05)+.8*sin(wq.z*.27-uTime*.85)+.35*sin((wq.x+wq.z)*.61+uTime*1.7))*' + f(WT.WAVE) + '; vWP=(modelMatrix*vec4(transformed,1.)).xyz; }');
    sh.fragmentShader = '#define RIPN ' + N + '\n' + (lo ? '#define WLOW 1\n' : '') + (WC ? 'uniform sampler2D tWC; uniform vec3 uWCm;\n' : '') +
      'uniform sampler2D tPaint, tDepth; uniform float uTime,uGlintW,uRainW; uniform vec3 uSkyW,uDeepW,uMidW,uShalW,uFoamW,uTreeW,uSunW,uSunD,uFall; uniform vec4 uRip[RIPN]; varying vec3 vWP;\n' +
      'float wh(vec2 p){ vec3 q=fract(p.xyx*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); } float wn(vec2 p){ vec2 i=floor(p),u=fract(p); u=u*u*(3.-2.*u); return mix(mix(wh(i),wh(i+vec2(1,0)),u.x),mix(wh(i+vec2(0,1)),wh(i+vec2(1,1)),u.x),u.y); }\n' +
      'float wf(vec2 p){ return wn(p)*.65+wn(p*2.13+5.2)*.35; }\n' +
      'float sw(vec2 p, float t){ vec2 q=p*' + f(WT.SWIRL) + ';\n#ifndef WLOW\n vec2 w1=vec2(wn(q+vec2(1.7,9.2)+t*.6),wn(q+vec2(8.3,2.8)-t*.45)); float a=wf(q*1.4+w1*' + f(WT.WARP) + '+vec2(t*.3,-t*.2)); float b=wn(q*3.7+w1*1.7+a*2.+vec2(-t*.5,t*.4)); return a+(b-.5)*' + f(WT.FINE) + '+(wn(q*' + f(WT.MIDSC) + '+b*3.+vec2(t*.4,-t*.3))-.5)*' + f(WT.MID) + ';\n#else\n float a=wn(q*1.4+vec2(wn(q+t*.6),wn(q+5.1-t*.45))*' + f(WT.WARP * .6) + '); float b=wn(q*3.7+a*2.-t*.5); return a+(b-.5)*' + f(WT.FINE) + '+(wn(q*' + f(WT.MIDSC) + '+b*3.+t*.4)-.5)*' + f(WT.MID) + ';\n#endif\n}\n' +
      sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n' +
        ' vec2 wp=vWP.xz; float tt=uTime; vec4 dp=texture2D(tDepth, wp/' + f(WT.SPAN) + '+.5); float dep=dp.r*5.; float fall=dp.g;\n' +
        // swirl field: domain-warped noise that drifts and slowly churns; the falls push it out. Paint strokes = bands along its contour lines
        ' vec2 fo=wp-uFall.xy; vec2 push=fo/max(length(fo),.5)*fall*(2.2+1.4*sin(tt*.37)); float dt=tt*' + f(WT.DRIFT) + ';\n' +
        (WC ? (' float sv=sw(wp-push-vec2(tt*.12,tt*.07),dt);\n' +   // watercolour: two drifting copies of the picked tile, normalised by its mean colour, tint the depth colours
        ' vec2 wq=(wp-push*.3)*' + f(WT.WC_SC) + '; vec3 t1=texture2D(tWC, wq+vec2(tt,tt*.6)*' + f(WT.WC_DRIFT) + ').rgb, t2=texture2D(tWC, mat2(.8,-.6,.6,.8)*wq*.77+vec2(-tt*.7,tt)*' + f(WT.WC_DRIFT) + ').rgb;\n' +
        ' vec3 tc=mix(t1,t2,.5)/max(uWCm,vec3(.05)); float tl=dot(tc,vec3(.299,.587,.114)); float ridge=clamp(.6+(tl-1.)*1.6,0.,1.); float e=0.; float aa=1.;\n' +
        ' float k=clamp(dep/' + f(WT.DEPK) + '+(sv-.5)*.35,0.,1.);\n' +
        ' vec3 wc=mix(uShalW,uMidW,smoothstep(.0,.48,k)); wc=mix(wc,uDeepW,smoothstep(.4,1.,k)); wc=mix(wc,uShalW*1.08,fall*.45);\n' +
        ' wc*=mix(vec3(1.),tc,' + f(WT.WC_STR) + '); wc=mix(wc,wc*vec3(.9,.98,1.08),uRainW*.6);\n' +
        ' vec3 V=normalize(cameraPosition-vWP); vec3 Nw=vec3(0.,1.,0.);\n') : (
        ' float sv=sw(wp-push-vec2(tt*.12,tt*.07),dt); float bv=sv*' + f(WT.BANDS) + '; float ph=fract(bv); float bid=floor(bv);\n' +
        ' float aa=1.-smoothstep(.22,.85,fwidth(bv));\n' +   // stroke-edge AA: far / grazing water fades to a smooth blend instead of aliasing
        ' float seg=wn(vec2(bid*3.71,0.)+wp*.16);\n' +   // strokes break up along their length
        ' float e=2.*ph-1.; float ridge=mix(.62,1.-e*e,aa); float bri=.5+.5*sin(bv*' + f(Math.PI * 2 * 5) + '+seg*4.); ridge*=mix(1.,1.-' + f(WT.BRISTLE) + '*bri,aa);\n' +
        ' float jit=(wh(vec2(bid,floor(seg*3.)))-.5)*' + f(WT.JIT) + '*aa;\n' +
        ' float k=clamp(dep/' + f(WT.DEPK) + '+(sv-.5)*' + f(WT.BLEND) + '+jit*1.5,0.,1.);\n' +
        ' vec3 wc=mix(uShalW,uMidW,smoothstep(.0,.48,k)); wc=mix(wc,uDeepW,smoothstep(.4,1.,k)); wc=mix(wc,uShalW*1.08,fall*.45);\n' +
        ' wc*=(1.+jit)*(.72+.42*ridge); wc=mix(wc,wc*vec3(.9,.98,1.08),uRainW*.6);\n' +
        // normal from the stroke ridges: d(ridge)/d(band) is exact per pixel, the swirl gradient is smooth (no 2x2 blocks)
        ' vec3 V=normalize(cameraPosition-vWP); vec3 Nw=vec3(0.,1.,0.);\n' +
        '#ifndef WLOW\n { vec3 dx=dFdx(vWP), dy=dFdy(vWP); float dr=-4.*e*aa*' + f(WT.RIDGE) + '; float hx=dr*dFdx(bv), hy=dr*dFdy(bv); vec3 r1=cross(dy,Nw), r2=cross(Nw,dx); float det=dot(dx,r1); vec3 gr=sign(det)*(hx*r1+hy*r2); Nw=normalize(abs(det)*Nw-gr*.5); }\n#else\n Nw=normalize(vec3(e*aa*.35,1.,(sv-.5)*.4));\n#endif\n')) +
        ' float fres=pow(1.-max(dot(normalize(mix(vec3(0.,1.,0.),Nw,.35)),V),0.),4.); float shore=1.-smoothstep(.25,2.6,dep);\n' +
        ' wc=mix(wc,uSkyW*(.85+.25*ridge),clamp(fres,0.,1.)*' + f(WT.FRES * (WC ? WT.WC_FRES : 1)) + '); wc=mix(wc,uTreeW,shore*fres*.35);\n' +
        // cream foam dabs at the shore + the falls, paint-daub ripples
        ' float dab=smoothstep(.55,.8,texture2D(tPaint, wp*.16+vec2(sv*.4,dt)+.13).r);\n' +
        ' float foam=(1.-smoothstep(0.,.18,dep+(sv-.5)*.12))*(.25+.75*dab)*(.45+.55*smoothstep(.4,.8,ridge))+fall*smoothstep(.45,.7,ridge)*.9;\n' +
        ' float rp=0.; for(int i=0;i<RIPN;i++){ vec4 R=uRip[i]; if(R.z>' + f(WT.RIP_LIFE) + ') continue; float d=length(wp-R.xy), rr=R.z*' + f(WT.RIP_SPEED) + '*(.6+R.w*.4); float w=exp(-pow((d-rr)*2.4/(1.+R.z*.6),2.))*(1.-R.z/' + f(WT.RIP_LIFE) + ')*R.w; rp+=w; }\n' +
        ' rp*=smoothstep(.3,.62,ridge+.15); float cream=clamp(foam+rp,0.,1.); wc=mix(wc,uFoamW*(.92+.12*ridge),cream*.92);\n' +
        ' diffuseColor.rgb=wc; diffuseColor.a=mix(diffuseColor.a,1.,cream*.8);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' +
        ' { vec3 H=normalize(uSunD+V); float nh=max(dot(Nw,H),0.); float wet=(pow(nh,' + f(WT.SHINE) + ')*(.25+ridge*1.3)+smoothstep(.86,1.,ridge)*pow(nh,16.)*.25)*' + f(WT.SPEC) + ';\n' +
        '   totalEmissiveRadiance+=uSunW*wet*uGlintW*(1.-uRainW*.7)*(1.-cream*.6)+wc*.14; }'); };
  m.customProgramCacheKey = () => 'fwoilwater' + (lo ? 'L' : 'H') + (WC ? 'W' : ''); return m;
}
function bakeWaterDepth() {   // R = water depth / 5, G = waterfall churn; world span FT.WATER.SPAN around the lake centre
  const WT = FT.WATER, n = QL().name === 'LOW' ? WT.DEPTH_RES_LO : WT.DEPTH_RES_HI, d = new Uint8Array(n * n * 4), fl = W3.fall;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = ((i + .5) / n - .5) * WT.SPAN, z = ((j + .5) / n - .5) * WT.SPAN, k = (j * n + i) * 4;
    const dw = Math.max(0, -groundH(x, z)), cove = fl ? Math.exp(-((x - fl.x) ** 2 + (z - fl.z - 7) ** 2) / 98) : 0; d[k] = Math.min(255, (dw + WT.COVE_DEEP * cove * sstep(0, .8, dw)) / 5 * 255); d[k + 1] = fl ? Math.exp(-((x - fl.x) ** 2 + (z - fl.z) ** 2) / 30) * 255 : 0; d[k + 3] = 255; }   // falls cove coloured as deeper water (the 32 look); shore foam kept
  // canvas texture, not DataTexture (not in the vendored build); 1006 = LinearFilter
  const cv = document.createElement('canvas'); cv.width = cv.height = n; const cx = cv.getContext('2d'), im = cx.createImageData(n, n); im.data.set(d); cx.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.flipY = false; t.generateMipmaps = false; t.magFilter = t.minFilter = 1006; t.needsUpdate = true; uWater.depth.value = t; if (fl) uWater.fall.value.set(fl.x, fl.z, 1); WV.baked = true;
}
function stepWater(dt) {   // called from render: depth bake once, ripples around the bobber, ripple slots for the shader, sun direction
  if (!WV.baked) bakeWaterDepth(); const WT = FT.WATER, f = F.fish, ph = f.ph;
  if (ph !== WV.lastPh) { if (ph === 'bite' && f.at) ripple(f.at.x, f.at.z, 1.3); WV.lastPh = ph; WV.bobT = 0; }
  const every = ph === 'wait' ? WT.BOB_RIP : ph === 'bite' ? WT.BITE_RIP : ph === 'game' ? WT.GAME_RIP : 0;
  if (every && f.at) { WV.bobT += dt; if (WV.bobT >= every) { WV.bobT = 0; ripple(f.at.x, f.at.z, ph === 'wait' ? .55 : .9); } }
  const L = (W3.fx && W3.fx.ripL) || [], R = uWater.rip.value, RN = R.length / 4; let n = 0;
  for (let i = L.length - 1; i >= 0 && n < RN; i--, n++) { const r = L[i], k = n * 4; R[k] = r.x; R[k + 1] = r.z; R[k + 2] = r.t; R[k + 3] = Math.min(1.6, r.s || 1); }
  for (; n < RN; n++) { const k = n * 4; R[k] = 0; R[k + 1] = 0; R[k + 2] = 99; R[k + 3] = 0; }
  uWater.sunD.value.copy(SUN).normalize(); uWater.time.value = VT;   // own clock: the flow runs on the fishing world's time (tests step it)
}
function waterInfo() { const m = W3.water ? W3.water.material : null, R = uWater.rip.value; return { baked: WV.baked, mat: m ? m.customProgramCacheKey() : '', segs: W3.water ? W3.water.geometry.parameters.widthSegments : 0, rips: Array.from({ length: R.length / 4 }, (_, i) => R[i * 4 + 2]).filter(z => z < 50).length, depthTex: !!uWater.depth.value, fall: uWater.fall.value.toArray ? uWater.fall.value.toArray().map(v => +v.toFixed(1)) : uWater.fall.value }; }

/* ======================= IMPASTO WORLD + ATMOSPHERE + TIME OF DAY + WEATHER (fishing world only) =======================
   Every material here is the fishing world's own (the side scroller's shared materials are never touched).
   Painterly look: a procedural brush-stroke canvas projected in world space (triplanar) and multiplied into the colours,
   plus warm/cool patches and a soft colour band; style guide = Graphite's impasto shore plates (principles only, no pngs).
   The stroke canvas (PAINT / paintTex) lives with the water in p6v. */
// paintify: wrap a material's shader so it gets impasto strokes. o = { sc: tiles per world unit, st: stroke strength, warm, band, sway: GLSL expr on `position` }
// FT.PAINT (stroke strengths + the paint canvas numbers) is set next to paintTex in the water section
function paintify(m, key, o) {
  const prevC = m.onBeforeCompile, prevK = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, rr) => { if (prevC) prevC.call(m, sh, rr); uPaint.value = paintTex(); sh.uniforms.tPaint = uPaint; sh.uniforms.uTime = A.uTime;
    let v = sh.vertexShader; const hasT = /uniform float uTime/.test(v);
    v = 'varying vec3 vPP; varying vec3 vPN;' + (hasT ? '' : ' uniform float uTime;') + '\n' + v.replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
      (o.sway ? ' { float sP=0.;\n#ifdef USE_INSTANCING\n sP=instanceMatrix[3].x*.35+instanceMatrix[3].z*.27;\n#endif\n float sA=' + o.sway + '; transformed.x+=sin(uTime*1.4+sP)*sA; transformed.z+=cos(uTime*1.1+sP*1.3)*sA*.6; }\n' : '') +
      ' { vec4 pP=vec4(transformed,1.); vec3 pN=normal;\n#ifdef USE_INSTANCING\n pP=instanceMatrix*pP; pN=mat3(instanceMatrix)*pN;\n#endif\n pP=modelMatrix*pP; vPP=pP.xyz; vPN=mat3(modelMatrix)*pN; }');
    sh.vertexShader = v;
    const sc = o.sc.toFixed(3), f = ' { vec3 w=pow(abs(normalize(vPN)),vec3(4.)); w/=w.x+w.y+w.z+1e-4; vec3 q=vPP*' + sc + ';\n' +
      '  vec3 P=texture2D(tPaint,q.zy*vec2(1.,' + (o.stretch || 1).toFixed(2) + ')).rgb*w.x+texture2D(tPaint,q.xz).rgb*w.y+texture2D(tPaint,q.xy*vec2(1.,' + (o.stretch || 1).toFixed(2) + ')).rgb*w.z;\n' +
      '  float sk=(P.r-.5)*' + (o.st * FT.PAINT.BOLD).toFixed(2) + '; vec3 dc=diffuseColor.rgb*(1.+sk*1.25);\n' +
      '  float hw=' + ((o.warm === undefined ? .55 : o.warm) * FT.PAINT.HUE).toFixed(2) + '; dc=mix(dc,dc*vec3(1.2,1.02,.74),clamp((P.g-.5)*2.,0.,1.)*hw); dc=mix(dc,dc*vec3(.8,.96,1.2),clamp((.45-P.g)*2.,0.,1.)*hw);\n' +
      '  dc*=1.-smoothstep(.4,.1,P.b)*' + (o.speck === undefined ? .35 : o.speck).toFixed(2) + ';\n' +
      '  float L=dot(dc,vec3(.299,.587,.114)); dc=mix(vec3(L),dc,' + (o.sat || 1.18).toFixed(2) + ');\n' +
      '  diffuseColor.rgb=max(dc,0.); }\n';
    sh.fragmentShader = 'uniform sampler2D tPaint; varying vec3 vPP; varying vec3 vPN;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + f); };
  m.customProgramCacheKey = () => (prevK ? prevK.call(m) : '') + '|paint:' + key; m.needsUpdate = true; return m;
}
// painted impasto ground: grass / dirt / mud / sand / rock layers blended by height, slope and nearness to the shore, each with
// its own brush strokes (triplanar on HIGH so cliffs never stretch; one planar sample on LOW). The vertex colours (trail, paths,
// darker woods) stay as a soft tint. One material. Colours + bands in FT.GROUND.
Object.assign(FT, { GROUND: { GRASS: '#5f9c45', GRASS2: '#a4c25a', DIRT: '#a77c52', MUD: '#5b4531', SAND: '#d8bf86', ROCK: '#8f8777', ROCK2: '#6d6a62',
  SAND_TOP: 1.0, MUD_TOP: .12, ROCK_SLOPE: .78, TINT: .42, SC: .09 } });
function terrainPaint(m) {
  const lo = QL().name === 'LOW', GD = FT.GROUND, c = k => { const q = new THREE.Color(GD[k]); return 'vec3(' + q.r.toFixed(3) + ',' + q.g.toFixed(3) + ',' + q.b.toFixed(3) + ')'; }, f = n => (+n).toFixed(3);
  m.onBeforeCompile = sh => { uPaint.value = paintTex(); sh.uniforms.tPaint = uPaint;
    sh.vertexShader = 'varying vec3 vPP; varying vec3 vPN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n { vec4 pP=modelMatrix*vec4(transformed,1.); vPP=pP.xyz; vPN=mat3(modelMatrix)*normal; }');
    const fr = (lo ? '#define GLOW 1\n' : '') + ' { vec3 nn=normalize(vPN); vec3 q=vPP*' + f(FT.PAINT.GSC) + ';\n' +
      '#ifndef GLOW\n  vec3 w=pow(abs(nn),vec3(4.)); w/=w.x+w.y+w.z+1e-4; vec3 P=texture2D(tPaint,q.zy*vec2(1.,.45)).rgb*w.x+texture2D(tPaint,q.xz).rgb*w.y+texture2D(tPaint,q.xy*vec2(1.,.45)).rgb*w.z;\n' +
      '  vec3 Pg=texture2D(tPaint,vPP.xz*.31+.27).rgb; float Pb=texture2D(tPaint,vPP.xz*' + f(FT.PAINT.GROUND_SC) + '+.61).r;\n#else\n  vec3 P=texture2D(tPaint,q.xz).rgb; vec3 Pg=P; float Pb=P.r;\n#endif\n' +
      '  float h=vPP.y, sl=nn.y, nz=(P.g-.5)*.6+(P.r-.5)*.25;\n' +
      '  float wRock=smoothstep(' + f(GD.ROCK_SLOPE) + ',' + f(GD.ROCK_SLOPE - .12) + ',sl+nz*.25);\n' +
      '  float wMud=1.-smoothstep(' + f(GD.MUD_TOP - .25) + ',' + f(GD.MUD_TOP + .2) + ',h+nz*.5);\n' +
      '  float wSand=(1.-smoothstep(' + f(GD.SAND_TOP * .55) + ',' + f(GD.SAND_TOP) + ',h+nz*.6))*(1.-wMud);\n' +
      '  float wDirt=smoothstep(.25,.6,clamp((diffuseColor.r-diffuseColor.g)*4.,0.,1.)+(Pg.g-.5)*.4)*(1.-wSand)*(1.-wMud);\n' +
      '  vec3 grass=mix(' + c('GRASS') + ',' + c('GRASS2') + ',smoothstep(.35,.75,Pg.g))*(.84+.3*Pg.r);\n' +
      '  vec3 col=grass; col=mix(col,' + c('DIRT') + '*(.85+.3*P.r),wDirt); col=mix(col,' + c('SAND') + '*(.9+.2*P.r),wSand); col=mix(col,' + c('MUD') + '*(.8+.35*P.r),wMud);\n' +
      '  col=mix(col,mix(' + c('ROCK2') + ',' + c('ROCK') + ',P.r)*(.85+.3*P.g),wRock);\n' +
      '  col=mix(col,col*diffuseColor.rgb*2.1,' + f(GD.TINT) + ');\n' +
      '  col*=1.+(P.r-.5)*' + f(FT.PAINT.GST) + '+(Pb-.5)*' + f(FT.PAINT.GROUND) + '*smoothstep(.35,.75,nn.y); col*=1.-smoothstep(.4,.1,P.b)*.3; col=mix(col,col*vec3(1.22,1.04,.7),clamp((P.g-.5)*2.,0.,1.)*' + f(FT.PAINT.HUE * .75) + '); col=mix(col,col*vec3(.78,.98,1.22),clamp((.45-P.g)*2.,0.,1.)*' + f(FT.PAINT.HUE * .75) + ');\n' +
      '  float L=dot(col,vec3(.299,.587,.114)); diffuseColor.rgb=max(mix(vec3(L),col,1.15),0.); }\n';
    sh.fragmentShader = 'uniform sampler2D tPaint; varying vec3 vPP; varying vec3 vPN;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + fr); };
  m.customProgramCacheKey = () => 'fwterrpaint' + (lo ? 'L' : 'H'); m.needsUpdate = true; return m;
}
// the world's own materials (built on the first visit)
let PM = null;
function worldMats() {
  if (PM) return PM; const L = p => reg(new THREE.MeshLambertMaterial(p));
  PM = {
    terr: terrainPaint(L({ vertexColors: true })),
    bark: paintify(L({ color: '#ffffff', vertexColors: true }), 'bark', { sc: .22, st: .9, warm: .3, stretch: .25 }),
    leaf: paintify(L({ vertexColors: true, flatShading: true }), 'leaf', { sc: .16, st: 1.0, warm: .7, sway: '.05*max(position.y+.35,0.)' }),
    grass: paintify(L({ vertexColors: true, side: THREE.DoubleSide }), 'grass', { sc: .3, st: .6, warm: .5, sway: '.16*position.y*position.y' }),
    stone: paintify(L({ color: '#ffffff', vertexColors: true, flatShading: true }), 'stone', { sc: .2, st: 1.0, warm: .55, speck: .45 }),
    wood: paintify(L({ vertexColors: true }), 'wood', { sc: .35, st: .85, warm: .4, stretch: .35 }),
    junk: paintify(L({ vertexColors: true, flatShading: true }), 'junk', { sc: .35, st: .8, warm: .4, speck: .55 }),
    water: waterMat()
  };
  return PM;
}

/* ---- time of day + weather (all numbers in FT.DAY / FT.WEATHER / FT.RAIN / FT.NIGHT_FISH) ---- */
Object.assign(FT, {
  DAY: { CYCLE: 1200, START: .04, NIGHT_SND: .012,   // seconds for morning > noon > dusk > night > dawn > morning; START = where a visit begins (0 = morning)
    // keyframes at t: sky top / mid / horizon(=fog), fog density, sun colour + strength, hemi sky / ground + strength, sun height (0..1), night 0..1
    K: [{ t: 0,   top: '#6fb2e0', mid: '#bfe0ee', hor: '#e8e4cc', fog: .0095, sun: '#ffe2b0', si: 2.3, hs: '#e6f2f4', hg: '#7a5a38', hi: 1.15, h: .45, n: 0 },
        { t: .22, top: '#4f9de0', mid: '#a9d6f0', hor: '#dfeee8', fog: .0075, sun: '#fff4dc', si: 2.7, hs: '#eef6f8', hg: '#80603c', hi: 1.25, h: .95, n: 0 },
        { t: .45, top: '#5a6fb0', mid: '#e8a878', hor: '#f4c890', fog: .011, sun: '#ffb070', si: 2.0, hs: '#f2d0b0', hg: '#6a4630', hi: 1.0, h: .18, n: .1 },
        { t: .56, top: '#2a2f5a', mid: '#7a5a78', hor: '#b07a6a', fog: .013, sun: '#ff9060', si: .9, hs: '#a8a0c8', hg: '#3a2a28', hi: .7, h: .03, n: .55 },
        { t: .66, top: '#0f1630', mid: '#1f2e4e', hor: '#34466a', fog: .014, sun: '#9ab0e8', si: .55, hs: '#6a80b8', hg: '#1e1e28', hi: .55, h: .5, n: 1 },
        { t: .84, top: '#141c3a', mid: '#2c3a5e', hor: '#4a5a7a', fog: .014, sun: '#a8b8e8', si: .6, hs: '#7a8ab8', hg: '#24222a', hi: .6, h: .45, n: .9 },
        { t: .93, top: '#5a78b0', mid: '#e0a8a0', hor: '#f0c8a8', fog: .012, sun: '#ffc090', si: 1.6, hs: '#e8d0c8', hg: '#5a4436', hi: .9, h: .12, n: .25 },
        { t: 1,   top: '#6fb2e0', mid: '#bfe0ee', hor: '#e8e4cc', fog: .0095, sun: '#ffe2b0', si: 2.3, hs: '#e6f2f4', hg: '#7a5a38', hi: 1.15, h: .45, n: 0 }],
    PERIODS: [[0, 'morning'], [.16, 'noon'], [.4, 'dusk'], [.58, 'night'], [.88, 'dawn']] },
  WEATHER: { EVERY: 240, RAIN: .25, MIST: .3, FADE: 10,   // reroll every EVERY s; chances per roll; fade in/out seconds
    RAIN_FOG: 1.9, MIST_FOG: 1.8, RAIN_DARK: .55, MIST_GREY: .45 },
  RAIN: { BITE_MUL: .7, RARE_MUL: 1.5, ON: .5 },   // while it rains (rain weight >= ON): bite wait x BITE_MUL, rare fish weight x RARE_MUL
  // time-of-day weights per fish (existing species only): day = morning + noon, dusk = dusk + dawn, night. 0 = never then. Unlisted = 1.
  NIGHT_FISH: { moon: { day: 0, dusk: .7, night: 1.8 }, koi: { day: 0, dusk: 1, night: 1.5 }, skip: { day: 1.3, dusk: .4, night: 0 }, sunny: { day: 1.2, dusk: .6, night: 0 },
    dcat: { day: .6, dusk: 1.4, night: 1.7 }, eel: { day: .6, dusk: 1.3, night: 1.8 }, scat: { day: .8, dusk: 1.3, night: 1.5 }, star: { day: .7, dusk: 1.2, night: 1.5 } }
});
const SKY = { tod: FT.DAY.START, per: '', kind: 'clear', wT: { rain: 0, mist: 0 }, w: { rain: 0, mist: 0 }, next: FT.WEATHER.EVERY, night: 0, rolls: 0, toasts: [], fps: 0,
  cur: { top: new THREE.Color(), mid: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), fog: .01, si: 2, hi: 1, h: .5, n: 0 } };
const _ca = new THREE.Color(), _cb = new THREE.Color();
function todPeriod(t) { let p = 'morning'; for (const [a, n] of FT.DAY.PERIODS) if (t >= a) p = n; return p; }
const fishTime = per => per === 'night' ? 'night' : per === 'dusk' || per === 'dawn' ? 'dusk' : 'day';
function rollWeather(first) { const u = Math.random(), W_ = FT.WEATHER; SKY.kind = u < W_.RAIN ? 'rain' : u < W_.RAIN + W_.MIST ? 'mist' : 'clear'; SKY.rolls++;
  SKY.wT.rain = SKY.kind === 'rain' ? 1 : 0; SKY.wT.mist = SKY.kind === 'mist' ? 1 : SKY.kind === 'rain' ? .4 : 0; SKY.next = W_.EVERY;
  if (first) { SKY.w.rain = SKY.wT.rain; SKY.w.mist = SKY.wT.mist; } }
const raining = () => SKY.w.rain >= FT.RAIN.ON;
function skyVisit() { const lk = SKY.lock; SKY.tod = lk && lk.tod !== undefined ? lk.tod : FT.DAY.START; SKY.per = todPeriod(SKY.tod); rollWeather(true); if (lk && lk.kind) setWeather(lk.kind, true);
  SKY.wasRain = raining(); if (SKY.wasRain) { SKY.toasts.push('rain: fish are biting'); toast('the fishing world. rain: fish are biting', 3); } }
function setWeather(kind, instant) { SKY.kind = kind; SKY.wT.rain = kind === 'rain' ? 1 : 0; SKY.wT.mist = kind === 'mist' ? 1 : kind === 'rain' ? .4 : 0; SKY.next = FT.WEATHER.EVERY; if (instant) { SKY.w.rain = SKY.wT.rain; SKY.w.mist = SKY.wT.mist; } }
function skyToast(s) { SKY.toasts.push(s); toast(s, 2.4); }
function stepSky(dt) {
  if (!(SKY.lock && SKY.lock.freeze)) SKY.tod = (SKY.tod + dt / FT.DAY.CYCLE) % 1; const per = todPeriod(SKY.tod);
  if (per !== SKY.per) { SKY.per = per; if (per === 'night') skyToast('night: something glows below'); }
  if (!(SKY.lock && SKY.lock.kind)) { SKY.next -= dt; if (SKY.next <= 0) rollWeather(false); }
  const k = Math.min(1, dt / FT.WEATHER.FADE); SKY.w.rain += Math.sign(SKY.wT.rain - SKY.w.rain) * Math.min(Math.abs(SKY.wT.rain - SKY.w.rain), k); SKY.w.mist += Math.sign(SKY.wT.mist - SKY.w.mist) * Math.min(Math.abs(SKY.wT.mist - SKY.w.mist), k);
  const r = raining(); if (r && !SKY.wasRain) skyToast('rain: fish are biting'); SKY.wasRain = r;
  stepRain(dt); nightSound(dt, SKY.night);
}
function skyEval() {
  const K = FT.DAY.K, t = SKY.tod; let i = 0; while (i < K.length - 2 && K[i + 1].t <= t) i++; const a = K[i], b = K[i + 1], u = sstep(0, 1, (t - a.t) / Math.max(1e-4, b.t - a.t)), C = SKY.cur;
  for (const key of ['top', 'mid', 'hor', 'sun', 'hs', 'hg']) C[key].copy(_ca.set(a[key])).lerp(_cb.set(b[key]), u);
  for (const key of ['fog', 'si', 'hi', 'h', 'n']) C[key] = lerp(a[key], b[key], u);
  const W_ = FT.WEATHER, wr = SKY.w.rain, wm = SKY.w.mist, grey = _ca.set('#9aa3a8');
  for (const key of ['top', 'mid', 'hor']) { C[key].lerp(grey.clone().multiplyScalar(lerp(1, .55, C.n)), wm * W_.MIST_GREY + wr * .6); C[key].multiplyScalar(1 - wr * W_.RAIN_DARK * (key === 'hor' ? .6 : 1)); }
  C.fog *= 1 + wm * (W_.MIST_FOG - 1) + wr * (W_.RAIN_FOG - 1); C.si *= 1 - wr * .65 - wm * .3; SKY.night = C.n; return C;
}
let NX = null;   // night + weather visuals (moon, motes, rain streaks, rain rings, rain sound)
function buildSkyFx(grp) {
  const hi = QL().name !== 'LOW', st = document.createElement('canvas'); st.width = 16; st.height = 128; { const g = st.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(6, 0, 4, 128); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(4, 30, 8, 60); }
  const streakT = new THREE.CanvasTexture(st);
  NX = { moon: new THREE.Mesh(A.gQuad, reg(new THREE.MeshBasicMaterial({ map: A.texSoft, color: '#fff6dc', transparent: true, depthWrite: false, fog: false }))),
    moonD: new THREE.Mesh(new THREE.CircleGeometry(.5, 24), reg(new THREE.MeshBasicMaterial({ color: '#fbf3da', transparent: true, depthWrite: false, fog: false }))),
    motes: billboards(hi ? 70 : 30, reg(new THREE.MeshBasicMaterial({ map: A.texSoft, color: '#fff3c8', transparent: true, opacity: .75, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })), grp),
    rain: billboards(hi ? 260 : 110, reg(new THREE.MeshBasicMaterial({ map: streakT, color: '#cfe0ec', transparent: true, opacity: .55, depthWrite: false, fog: false })), grp),
    rings: new THREE.InstancedMesh(A.gRing, reg(new THREE.MeshBasicMaterial({ color: '#e8f2f6', transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending })), hi ? 48 : 24), drops: [], ringL: [], moteD: [], snd: null };
  NX.moon.renderOrder = -9; NX.moonD.renderOrder = -8; NX.moon.frustumCulled = NX.moonD.frustumCulled = false; fscene.add(NX.moon, NX.moonD);
  NX.motes.renderOrder = 6; NX.rain.renderOrder = 8; NX.rings.frustumCulled = false; NX.rings.count = 0; NX.rings.renderOrder = 4; grp.add(NX.rings); for (let i = 0; i < NX.rings.instanceMatrix.count; i++) NX.rings.setColorAt(i, _c.set('#ffffff'));
  const rr = mulberry(77); for (let i = 0; i < NX.motes.count; i++) NX.moteD.push({ x: (rr() - .5) * 40, y: rr() * 7 + .5, z: (rr() - .5) * 40, p: rr() * 6, s: .06 + rr() * .1 });
  for (let i = 0; i < NX.rain.count; i++) NX.drops.push({ x: (rr() - .5) * 36, y: rr() * 18, z: (rr() - .5) * 36, v: 16 + rr() * 6 });
}
function stepRain(dt) {
  if (!NX) return; const on = SKY.w.rain, cx = fcam.position.x, cz = fcam.position.z;
  for (const d of NX.drops) { d.y -= d.v * dt; if (d.y < 0) { d.y += 18; d.x = (Math.random() - .5) * 36; d.z = (Math.random() - .5) * 36; if (on > .2 && Math.random() < on * .5) { const x = cx + d.x, z = cz + d.z; if (isWater(x, z) && NX.ringL.length < NX.rings.instanceMatrix.count) NX.ringL.push({ x, z, t: 0, max: .7 + Math.random() * .5 }); } } }
  for (let i = NX.ringL.length - 1; i >= 0; i--) { NX.ringL[i].t += dt; if (NX.ringL[i].t > NX.ringL[i].max) NX.ringL.splice(i, 1); }
  rainSound(on);
}
function rainSound(on) {   // soft filtered noise; follows the game's mute setting; silent outside the fishing world
  let mute = false; try { mute = localStorage.getItem('jr3d-mute') === '1'; } catch (e) { /* ignore */ }
  const want = G.state === 'fish' && !mute ? on * .05 : 0;
  if (!NX.snd) { if (want <= 0) return; try { const ac = new (window.AudioContext || window.webkitAudioContext)(), n = ac.sampleRate * 2, buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0); let b = 0; for (let i = 0; i < n; i++) { b = b * .96 + (Math.random() * 2 - 1) * .04; ch[i] = b * 3 + (Math.random() * 2 - 1) * .08; }
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), gn = ac.createGain(); src.buffer = buf; src.loop = true; f.type = 'lowpass'; f.frequency.value = 1400; gn.gain.value = 0; src.connect(f); f.connect(gn); gn.connect(ac.destination); src.start(); NX.snd = { ac, gn }; } catch (e) { NX.snd = { ac: null, gn: null }; return; } }
  if (NX.snd.gn) NX.snd.gn.gain.value = want;
}
function waterTint(n, rain) { const WT = FT.WATER, dk = 1 - rain * .25; uWater.deep.value.set(WT.DEEP).lerp(_ca.set('#0e2238'), n * .8).multiplyScalar(dk); uWater.mid.value.set(WT.MID).lerp(_ca.set('#1a3a55'), n * .75).multiplyScalar(dk);
  uWater.shal.value.set(WT.SHAL).lerp(_ca.set('#2c4a50'), n * .7).multiplyScalar(dk); uWater.foam.value.set(WT.FOAM).lerp(_ca.set('#8a96b0'), n * .6); uWater.tree.value.set(WT.TREE).lerp(_ca.set('#10202a'), n * .8); }
function nightSound(dt, n) {   // crickets (soft high chirps) + an odd frog croak at night; follows mute, silent outside the fishing world. Loudness in FT.DAY.NIGHT_SND
  if (!NX) return; let mute = false; try { mute = localStorage.getItem('jr3d-mute') === '1'; } catch (e) { /* ignore */ }
  const on = G.state === 'fish' && !mute ? sstep(.35, .8, n) * (1 - SKY.w.rain * .7) : 0, V0 = FT.DAY.NIGHT_SND;
  if (!NX.nsnd) { if (on <= 0) return; try { const ac = (NX.snd && NX.snd.ac) || new (window.AudioContext || window.webkitAudioContext)(), o = ac.createOscillator(), bp = ac.createBiquadFilter(), gn = ac.createGain(), fg = ac.createGain(); o.type = 'square'; o.frequency.value = 4300; bp.type = 'bandpass'; bp.frequency.value = 4300; bp.Q.value = 8; gn.gain.value = 0; fg.gain.value = 0; o.connect(bp); bp.connect(gn); gn.connect(ac.destination); fg.connect(ac.destination); o.start(); NX.nsnd = { ac, gn, fg, t: 0, frogT: 2 }; } catch (e) { NX.nsnd = { ac: null, gn: null }; return; } }
  const S = NX.nsnd; if (!S.gn) return; S.t += dt; const chirp = (Math.sin(S.t * TAU * 2.4) > .55 ? 1 : 0) * (Math.sin(S.t * TAU * 31) > 0 ? 1 : .3); S.gn.gain.value = on * V0 * chirp;
  S.frogT -= dt; if (on > .1 && S.frogT <= 0) { S.frogT = 2.5 + Math.random() * 5; try { const ac = S.ac, t0 = ac.currentTime, o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(150 + Math.random() * 40, t0); o.frequency.linearRampToValueAtTime(95, t0 + .22); lp.type = 'lowpass'; lp.frequency.value = 600;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(on * V0 * 3, t0 + .03); g.gain.linearRampToValueAtTime(0, t0 + .24); o.connect(lp); lp.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + .3); S.frogs = (S.frogs || 0) + 1; } catch (e) { /* ignore */ } }
}
function skyRender(dt) {   // apply sky / fog / lights / water tint, place moon, motes, rain (called from render)
  const C = skyEval(), u = fsky.material.uniforms, fogC = C.hor;
  u.uTop.value.copy(C.top); u.uMid.value.copy(C.mid); u.uHor.value.copy(fogC); if (u.uNight) { u.uNight.value = C.n; u.uCloud.value = .35 + SKY.w.mist * .3 + SKY.w.rain * .65; u.uDark.value = SKY.w.rain; u.uTimeS.value = VT; }
  fscene.fog.color.copy(fogC); fscene.fog.density = C.fog; fscene.background.copy(fogC);
  const el = lerp(.08, 1.25, C.h), az = -2.2 + SKY.tod * TAU * .5; SUN.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(60); u.uSun.value.copy(SUN).normalize();
  fsun.color.copy(C.sun); fsun.intensity = C.si; fhemi.color.copy(C.hs); fhemi.groundColor.copy(C.hg); fhemi.intensity = C.hi; ffill.intensity = .5 * (1 - C.n * .6);
  uWater.sky.value.copy(C.mid).lerp(fogC, .4); waterTint(C.n, SKY.w.rain); uWater.sun.value.copy(C.sun); uWater.glint.value = (1 - C.n * .7); uWater.rain.value = SKY.w.rain;
  const fx0 = W3.fx; if (fx0.mist) { fx0.mist.material.color.copy(fogC).lerp(_ca.set('#ffffff'), .45); fx0.mist.material.opacity = .2 * (1 + SKY.w.mist * 1.6 + SKY.w.rain * .8) * (1 - C.n * .3); }
  FARU.uHaze.value = Math.min(RING.HMAX, RING.HAZE * C.fog / RING.FOG0); FARU.uLit.value = Math.min(1, C.hi / RING.HI0) * (1 - .7 * C.n);   // ring + far cards
  if (fx0.rays) fx0.rays.material.opacity = .55 * (1 - C.n) * (1 - SKY.w.rain) * (1 - SKY.w.mist * .5);
  if (!NX) return; const cq = fcam.quaternion, cp = fcam.position;
  // moon: opposite the sun at night
  const mv = _v.copy(SUN).normalize().multiplyScalar(-1); mv.y = Math.max(.25, mv.y + .2); mv.normalize().multiplyScalar(250); const mOn = C.n > .3 && SKY.w.rain < .7;
  NX.moon.visible = NX.moonD.visible = mOn; if (mOn) { NX.moon.position.copy(cp).add(mv); NX.moon.quaternion.copy(cq); NX.moon.scale.setScalar(70); NX.moon.material.opacity = (C.n - .3) * .9; NX.moonD.position.copy(NX.moon.position); NX.moonD.quaternion.copy(cq); NX.moonD.scale.setScalar(16); NX.moonD.material.opacity = Math.min(1, (C.n - .3) * 2); }
  // drifting motes: warm pollen by day, cool dust by night (fireflies are the bugs, brighter at night)
  NX.motes.material.color.set(C.n > .5 ? '#bcd0ff' : '#fff1c0'); NX.motes.material.opacity = .55 * (1 - SKY.w.rain * .8);
  NX.moteD.forEach((m, i) => { const x = cp.x + ((m.x + Math.sin(VT * .13 + m.p) * 3 + 400) % 40 - 20), z = cp.z + ((m.z + VT * .4 + Math.cos(VT * .11 + m.p) * 3 + 400) % 40 - 20); _o.position.set(x, Math.max(groundAt(x, z), 0) + m.y + Math.sin(VT * .5 + m.p) * .4, z); _o.quaternion.copy(cq); _o.scale.setScalar(m.s * (1 + .3 * Math.sin(VT * 3 + m.p))); _o.updateMatrix(); NX.motes.setMatrixAt(i, _o.matrix); });
  NX.motes.instanceMatrix.needsUpdate = true;
  const fx = W3.fx; if (fx.flies) fx.flies.visible = C.n < .45; if (fx.bugs) { fx.bugs.material.opacity = .35 + C.n * .65; fx.bugs.material.color.set(C.n > .4 ? '#d8ff7a' : '#fff1a0'); }
  // rain streaks (camera-facing around y, slanted) + rings on the water
  const rOn = SKY.w.rain; NX.rain.visible = rOn > .02; if (NX.rain.visible) { NX.rain.material.opacity = .5 * rOn; const yaw = Math.atan2(cp.x - F.pos.x, cp.z - F.pos.z);
    NX.drops.forEach((d, i) => { _o.position.set(cp.x + d.x, d.y + (F.pos.y || 0) - 2, cp.z + d.z); _o.rotation.set(0, yaw, .12); _o.scale.set(.06, 1.3, 1); _o.updateMatrix(); NX.rain.setMatrixAt(i, _o.matrix); }); NX.rain.instanceMatrix.needsUpdate = true; }
  const RL = NX.ringL; RL.forEach((r, i) => { const t = r.t / r.max, s = .15 + t * .9; _o.position.set(r.x, .07, r.z); _o.rotation.set(0, 0, 0); _o.scale.set(s, 1, s); _o.updateMatrix(); NX.rings.setMatrixAt(i, _o.matrix); NX.rings.setColorAt(i, _c.setScalar((1 - t) * .9)); });
  NX.rings.count = RL.length; NX.rings.instanceMatrix.needsUpdate = true; if (NX.rings.instanceColor) NX.rings.instanceColor.needsUpdate = true;
}
// painted sky: gradient + soft brushy clouds + stars at night
function paintSky() {
  const m = fsky.material; Object.assign(m.uniforms, { uNight: { value: 0 }, uCloud: { value: .35 }, uDark: { value: 0 }, uTimeS: { value: 0 } });
  m.fragmentShader = 'uniform vec3 uTop,uMid,uHor,uSun; uniform float uNight,uCloud,uDark,uTimeS; varying vec3 vD;\n' +
    'float hs(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); } float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y); }\n' +
    'float fb(vec2 p){ float s=0.,a=.5; for(int i=0;i<4;i++){ s+=vn(p)*a; p*=2.07; a*=.5; } return s; }\n' +
    'void main(){ vec3 d=normalize(vD); float h=clamp(d.y,0.,1.); vec3 c=mix(uHor,uMid,smoothstep(0.,.25,h)); c=mix(c,uTop,smoothstep(.2,.9,h));\n' +
    ' float s=max(dot(d,uSun),0.); c+=mix(vec3(1.,.82,.5),vec3(.6,.7,1.),uNight)*(pow(s,6.)*.25+pow(s,60.)*.7)*(1.-uDark*.8);\n' +
    ' vec2 cp=d.xz/(d.y+.18)*1.6+vec2(uTimeS*.004,0.); float n=fb(cp*vec2(1.,2.2)); float stroke=vn(cp*vec2(9.,32.));\n' +
    ' float cl=smoothstep(1.-uCloud,1.25-uCloud,n+stroke*.12)*smoothstep(0.,.12,d.y);\n' +
    ' float sb=vn(cp*vec2(1.6,9.)+3.7)*.65+vn(cp*vec2(4.,22.)+1.3)*.35; c*=1.+(sb-.5)*' + FT.PAINT.SKY.toFixed(3) + '*(1.-cl); c=mix(c,c*vec3(1.08,1.,.9),smoothstep(.62,.8,sb)*.6*(1.-cl));\n' +
    ' vec3 cc=mix(vec3(1.,.98,.94),uHor*1.05,.35)*mix(1.,.45,uNight); cc=mix(cc,cc*vec3(.62,.64,.68),uDark); cc*=.8+.4*stroke*(.6+.4*sb); c=mix(c,cc,cl*.85);\n' +
    ' float st=step(.9975,hs(floor(d.xz/(d.y+.05)*90.)))*smoothstep(.1,.5,d.y)*uNight*(1.-cl)*(1.-uDark); c+=vec3(st);\n' +
    ' gl_FragColor=vec4(c,1.); }';
  m.needsUpdate = true;
}
const SKY_TESTQ = /[?&]test=1\b/.test(location.search);
function skyHush() { if (NX && NX.snd && NX.snd.gn) NX.snd.gn.gain.value = 0; if (NX && NX.nsnd && NX.nsnd.gn) NX.nsnd.gn.gain.value = 0; if (NX && NX.fsnd && NX.fsnd.gn) NX.fsnd.gn.gain.value = 0; }
function fallSound() {   // hint: the waterfall, a low rush you can hear from across the lake (louder near it); follows mute, silent outside the fishing world
  if (!NX) return; let mute = false; try { mute = localStorage.getItem('jr3d-mute') === '1'; } catch (e) { /* ignore */ }
  const w = W3.fall, d = Math.hypot(F.pos.x - w.x, F.pos.z - w.z), want = G.state === 'fish' && !mute ? FT.BOAT.FALL_SND * (.3 + .7 * (1 - sstep(6, 85, d))) : 0; NX.fallGain = want;
  if (!NX.fsnd) { if (want <= 0) return; try { const ac = (NX.snd && NX.snd.ac) || (NX.nsnd && NX.nsnd.ac) || new (window.AudioContext || window.webkitAudioContext)(), n = ac.sampleRate * 2, buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0); let b = 0; for (let i = 0; i < n; i++) { b = b * .985 + (Math.random() * 2 - 1) * .015; ch[i] = b * 5 + (Math.random() * 2 - 1) * .05; }
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), gn = ac.createGain(); src.buffer = buf; src.loop = true; f.type = 'lowpass'; f.frequency.value = 650; gn.gain.value = 0; src.connect(f); f.connect(gn); gn.connect(ac.destination); src.start(); NX.fsnd = { ac, gn }; } catch (e) { NX.fsnd = { ac: null, gn: null }; return; } }
  if (NX.fsnd.gn) NX.fsnd.gn.gain.value = want;
}

/* ======================= sunken chest: pick 1 of 3 (one good, one bad, one funny) =======================
   The junk collector is not on main yet, so this is a small self-contained pool. Cards are shuffled and show what the item
   does; the effects last for this visit to the fishing world. Every number here is a PLAYTEST DEFAULT. */
const ITEMS = {
  good: [
    { key: 'lure',   n: 'lucky lure',     d: 'fish bite twice as fast',            t: 120 },
    { key: 'steady', n: 'steady line',    d: 'about a third of the line strain in fights', t: 120 },
    { key: 'bell',   n: 'cat bell',       d: 'junk rats keep away from your bucket', t: 120 } ],
  bad: [
    { key: 'tangle', n: 'tangled line',   d: 'short casts only',                    t: 60 },
    { key: 'stinky', n: 'stinky bait',    d: 'every catch brings a mud gull',       t: 60 },
    { key: 'soggy',  n: 'soggy boots',    d: 'you walk slower',                     t: 60 } ],
  funny: [
    { key: 'duck',   n: 'rubber duck',    d: 'a rubber duck follows you around (squeak)', t: 0 },
    { key: 'kazoo',  n: 'swamp kazoo',    d: 'every catch gets a kazoo fanfare',     t: 0 },
    { key: 'googly', n: 'googly bobber',  d: 'your bobber gets big googly eyes',     t: 0 } ]
};
F.items = {}; F.picks = []; F.pick = null;
const itemOn = k => F.items[k] !== undefined && (F.items[k] === Infinity || F.items[k] > 0);
const pickEl = document.createElement('div'); pickEl.id = 'fw-pick';
pickEl.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:2vmin;z-index:9;background:rgba(20,14,10,.55);font-weight:bold;color:#f3e6c4;text-shadow:1px 1px 0 #3f2616';
document.body.appendChild(pickEl);
function openPick() {
  const pickOne = a => a[Math.floor(Math.random() * a.length)];
  const cards = [Object.assign({ kind: 'good' }, pickOne(ITEMS.good)), Object.assign({ kind: 'bad' }, pickOne(ITEMS.bad)), Object.assign({ kind: 'funny' }, pickOne(ITEMS.funny))];
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  F.pick = { cards, t: 0 }; inp.down.clear(); inp.act = false;
  pickEl.innerHTML = '<div style="font-size:max(16px,3.4vmin)">the sunken chest creaks open... take ONE</div><div style="display:flex;gap:2.4vmin;flex-wrap:wrap;justify-content:center">' +
    cards.map((c, i) => '<div data-i="' + i + '" style="cursor:pointer;touch-action:none;width:min(26vw,210px);min-height:16vmin;padding:1.6vmin;border-radius:8px;background:rgba(31,20,14,.92);border:3px solid #e8c14a;box-shadow:0 0 0 3px rgba(31,92,88,.7);text-align:center;font-size:max(12px,2vmin)">' +
      '<div style="color:#e8c14a;font-size:max(14px,2.6vmin)">' + (i + 1) + '</div><div style="margin:.5em 0;font-size:max(13px,2.3vmin)">' + c.n + '</div><div style="opacity:.85;font-weight:normal">' + c.d + '</div>' +
      '<div style="opacity:.6;font-weight:normal;margin-top:.5em">' + (c.t ? c.t + ' s' : 'this visit') + '</div></div>').join('') +
    '</div><div style="opacity:.8;font-size:max(11px,1.8vmin)">' + (isTouch ? 'tap a card' : 'press 1 / 2 / 3 or click a card') + '</div>';
  pickEl.style.display = 'flex'; A.sfx(520, .3, 'triangle');
}
function stepPick(dt) { F.pick.t += dt; }
function choosePick(i) {
  if (!F.pick || !F.pick.cards[i] || F.pick.t < .25) return false;
  const c = F.pick.cards[i]; F.items[c.key] = c.t ? c.t : Infinity; F.picks.push({ key: c.key, kind: c.kind, n: c.n, offered: F.pick.cards.map(x => x.key) });
  F.pick = null; pickEl.style.display = 'none'; F.hudKey = ''; toast('you took the ' + c.n + ': ' + c.d, 2.4);
  A.sfx(c.kind === 'bad' ? 200 : c.kind === 'funny' ? 1400 : 990, .2, c.kind === 'bad' ? 'sawtooth' : 'triangle'); if (c.key === 'duck') A.sfx(1800, .08, 'square'); return true;
}
pickEl.addEventListener('pointerdown', e => { const el = e.target.closest && e.target.closest('[data-i]'); e.preventDefault(); e.stopPropagation(); if (el) choosePick(+el.dataset.i); });
function stepItems(dt) { for (const k in F.items) if (F.items[k] !== Infinity) { F.items[k] -= dt; if (F.items[k] <= 0) { delete F.items[k]; F.hudKey = ''; toast('worn off: ' + (Object.values(ITEMS).flat().find(x => x.key === k) || { n: k }).n, 1.4); } } }
function kazoo() { A.sfx(440, .12, 'sawtooth'); setTimeout(() => A.sfx(554, .12, 'sawtooth'), 130); setTimeout(() => A.sfx(660, .25, 'sawtooth'), 260);
  for (let i = 0; i < 26; i++) emitP('A', F.pos.x, F.pos.y + 2.4, F.pos.z, (Math.random() - .5) * 6, 3 + Math.random() * 4, (Math.random() - .5) * 6, 1.4, .35, ['#e8c14a', '#ff7a8a', '#7ad0ff', '#9fffb0'][i % 4], 7); }
let duck = null, eyes = null;
function renderItems(dt) {
  const on = itemOn('duck');
  if (on && !duck) { duck = new THREE.Group(); const y = A.M('#ffd23a'), o = A.M('#ff8a1a'), k = A.M('#1a1410');
    const b = new THREE.Mesh(A.gSph, y); b.scale.set(.7, .5, .55); b.position.y = .28; duck.add(b); const h = new THREE.Mesh(A.gSph, y); h.scale.setScalar(.38); h.position.set(.26, .62, 0); duck.add(h);
    const bk = new THREE.Mesh(A.gSph, o); bk.scale.set(.2, .08, .14); bk.position.set(.46, .58, 0); duck.add(bk); [-1, 1].forEach(s => { const e = new THREE.Mesh(A.gSph, k); e.scale.setScalar(.06); e.position.set(.38, .7, s * .1); duck.add(e); });
    duck.userData = { x: F.pos.x, z: F.pos.z, a: 0 }; fscene.add(duck); }
  if (duck) { duck.visible = on; if (on) { const u = duck.userData, [ux, uz] = fwd(), tx = F.pos.x - ux * 1.4 + uz * .9, tz = F.pos.z - uz * 1.4 - ux * .9, dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
      if (d > 12) { u.x = tx; u.z = tz; } else if (d > .1) { u.x += dx * Math.min(1, dt * 4); u.z += dz * Math.min(1, dt * 4); u.a = Math.atan2(-dz, dx); }
      const wy = groundAt(u.x, u.z), fl = Math.max(wy, isWater(u.x, u.z) ? 0 : wy); duck.position.set(u.x, fl + Math.abs(Math.sin(VT * 9)) * (d > .3 ? .12 : .02), u.z); duck.rotation.set(0, u.a, Math.sin(VT * 9) * (d > .3 ? .15 : .03)); } }
  const g = itemOn('googly');
  if (g && !eyes) { eyes = new THREE.Group(); const w = A.M('#ffffff'), k = A.M('#111111'); [-1, 1].forEach(s => { const e = new THREE.Mesh(A.gSph, w); e.scale.setScalar(.34); e.position.set(0, .32, s * .17); eyes.add(e); const pu = new THREE.Mesh(A.gSph, k); pu.scale.setScalar(.15); pu.position.set(.15, .32, s * .17); pu.userData.s = s; eyes.add(pu); }); F.bob.add(eyes); }
  if (eyes) { eyes.visible = g; if (g) { F.bob.scale.setScalar(1.5); eyes.children.forEach((m, i) => { if (m.userData.s) m.position.y = .32 + Math.sin(VT * 13 + i) * .06; }); eyes.rotation.y = F.head + PI; } else F.bob.scale.setScalar(1); }
}
function itemHud() { const ks = Object.keys(F.items); if (!ks.length) return ''; const all = Object.values(ITEMS).flat();
  return ks.map(k => { const it = all.find(x => x.key === k), v = F.items[k]; return '<span style="color:' + (ITEMS.bad.includes(it) ? '#ff9a7a' : ITEMS.funny.includes(it) ? '#9fd8ff' : '#9fffb0') + '">' + it.n + (v === Infinity ? '' : ' ' + Math.ceil(v) + 's') + '</span>'; }).join(''); }

Object.assign(api.test, { skin: api.skin, heroMats: api.heroMats });   // reachable from the test hook too
return api;
};
})();
