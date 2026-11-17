/* mudpity - TOP-DOWN PAPER MAP, with the DEEP DIVE behind its deep pool (top-down world, series 1).
   Own file, like fishworld.js; game.js only creates it (window.MudTopWorld(api)) and calls a few hooks: step(), afterSide(),
   roomBuilt(), in3d(), render().
   Flow: a paper map gate stands in about a quarter of the plain forest rooms (at least one per run) -> F, or a tap -> the page
   folds -> a cut-paper world map seen from above, made fresh from the run seed and kept for the run. Walk it freely in real time:
   paths are fast, mud is slow, water only by bridge, paper layers only by the paths. Folded paper opens as you explore.
   Spots: junk piles (into the run's one junk bag; a swap when it is full), river junk (pull it in with the hook), scrap heaps you
   flag (each drops a piece after every boss), chests (pick 1 of 3 cards), a view rock. Doors: your own forest gate (back to the
   room you came from), the fishing pond (the fishing world, back out at the pond) and the deep pool: three side-view dive rooms
   going down (sink, swim up, the hook pulls you to rings, air runs down, deep critters), the buddy in his helmeted junk mech, a
   sunken wreck with a chest, and a current that carries you back up.
   The run clock stands still here (game.js update() only runs in 'play'); no points are earned here. Spots refill after each boss.
   The OG world: a hidden spot far from the forest gates, found by exploring under the fog. Walking in puts him back into the
   forest side-scroller (the room he came from) in the OG look (game.js enterOG; it only switches the look), with the forest
   gates' own rules. Coming back to the map through any map gate switches the look back (leaveOG) and lands him at the spot.
   Guarded mob camps (series 2): a paper tent with flyers round it, strength 1-3; one always guards the deep pool. Walk into one and
   the page folds into a one-screen side-scroll fight in the run's own engine (jump on them, kick them, hook them, shield, super):
   beat them all = loot and the camp tears away; out the left side = flee (back on the map, the camp stays, mobs healed);
   lose a life = back on the map in front of it (at 0 lives the run ends as usual). The run clock waits there too; no points.
   Ground: ONE texture hook, setGroundArt({ meadow, path, water, moss, mud, stone }), mixed by a splat shader; the tiles come from
   art/paper-tex.js, fetched on the first map visit (not at page start); plain colours stand in until it arrives or if it is missing. Dive backdrop: a code gradient and fog stand in until
   art/deep-tex.js (the picked watercolour plates) is fetched on the first dive and handed to setDiveArt({ water, far, middle, seabed, front }).
   Every tuning number is in TT below: PLAYTEST DEFAULTS. */
(() => {
'use strict';
window.MudTopWorld = function (A) {
const THREE = A.THREE, G = A.G, V3 = THREE.Vector3;
const { sstep, lerp, fbm, hash, mulberry, X, GY, QL, reg, hold } = A;
const TAU = Math.PI * 2, PI = Math.PI, STEP = 1 / 60, REPEAT = 1000, CLAMP = 1001;   // texture wrap enums as numbers (the slim three build has no RepeatWrapping)
const TT = {
  N: 128, LH: .55,                                  // map cells (1 cell = 1 m), paper layer height (m)
  GATE_RATE: .25, GATE_PX: 70,                      // forest rooms with a map gate; px kept clear of a fishing path in the same room
  WALK: 5, RUN: 1.6, SPEED: { path: 1.25, meadow: 1, moss: .85, stone: .85, mud: .7, bridge: 1.25 },
  REVEAL: 9, ROCK_REVEAL: 30, ACT_R: 2.6, HOOK_R: 7.5, SPACING: 11,
  JUNK: [6, 8], HEAPS: [2, 3], CHESTS: [2, 3], PILE: [1, 3], RIVER_JUNK: 4, REFILL_RIVER: 2, BAG_MAX: 12,
  CAM: { H: 16, BACK: 10.5, FOV: 46 }, BIG_MAP: 'Tab',
  OG: { MIN_X: 64, GATE_D: 55 },   // the OG spot: at least this far east (m) and this far from every forest gate
  CAMP: { R: 1.7, REARM: 3.2, PROMPT: 4.6, MOBS: [3, 4, 5], RANKS: [[1, 1, 1], [1, 1, 2, 2], [2, 2, 2, 3, 3]], LOOT: [2, 3, 4], X: [130, 290], X0: 20 },   // walk-in radius, re-arm distance after a flee, flyers and ranks by strength 1-3, junk loot by strength, flyer spread (px), his start (px)
  DIVE: { W: 36, H: 16, SINK: 2.2, SINK_MAX: 1.8, STROKE: 2.8, RISE: 3.4, HOLD_UP: 1.1, SWIM_X: 4.2, ACC: 10, DRAG: 2.4, DOWN: 6,
          AIR: 100, AIR_DRAIN: 1.1, HIT_AIR: 18, INV: 1.1, HOOK_R: 9, HOOK_PULL: 9, HOOK_T: .9, CACHES: [2, 3], WRECK_JUNK: 3 }
};
const JUNK = { plank: { n: 'broken plank', c: '#9a6a3a' }, rag: { n: 'old rag', c: '#c7b48a' }, bottle: { n: 'glass bottle', c: '#5fa58a' },
  can: { n: 'tin can', c: '#a9b2b8' }, boot: { n: 'old boot', c: '#4a3a2e' }, remote: { n: 'tv remote', c: '#34343c' } };   // the same kinds as the run's junk bag
const LEAN = { mud: ['boot', 'remote', 'can', 'boot'], river: ['can', 'bottle', 'can'], moss: ['plank', 'rag', 'plank'], meadow: ['plank', 'rag', 'bottle', 'can', 'boot'],
  stone: ['can', 'bottle', 'remote'], edge: ['plank', 'rag', 'boot'], deep: ['can', 'bottle', 'remote', 'boot'] };
const TILES = ['meadow', 'path', 'water', 'moss', 'mud', 'stone'];
const STANDIN = { meadow: '#8fb35a', path: '#d8b98a', water: '#5c9fc0', moss: '#5f8a4a', mud: '#8a6448', stone: '#a7a39a' };   // plain colours until art
const ZK = ['edge', 'meadow', 'moss', 'mud', 'stone'];

/* ======================= DOM (own overlay; inline styles only, CSP-safe) ======================= */
const css = document.createElement('style');
css.textContent = `#tw-fold{position:fixed;inset:0;pointer-events:none;z-index:9;display:none;background:#efe6d2;
 background-image:linear-gradient(90deg,rgba(0,0,0,0) 49.6%,rgba(90,70,40,.18) 50%,rgba(0,0,0,0) 50.4%),linear-gradient(0deg,rgba(0,0,0,0) 49.6%,rgba(90,70,40,.14) 50%,rgba(0,0,0,0) 50.4%);box-shadow:0 0 40px rgba(0,0,0,.45)}
#tw-prompt{position:fixed;left:50%;bottom:31%;transform:translateX(-50%);display:none;z-index:7;padding:.45em 1em;border-radius:6px;background:#efe6d2;
 border:2px solid #5a3a22;color:#3f2616;font-weight:bold;font-size:max(13px,2.3vmin);cursor:pointer;touch-action:none;white-space:nowrap;box-shadow:2px 2px 0 rgba(63,38,22,.5)}
#tw-hud{position:fixed;left:0;right:0;top:0;display:none;gap:2.2vmin;align-items:center;padding:1vmin 2vmin;font-weight:bold;font-size:max(12px,2.1vmin);color:#3f2616;
 background:rgba(239,230,210,.85);border-bottom:2px solid #5a3a22;pointer-events:none;z-index:6;flex-wrap:wrap} #tw-hud b{color:#7a3a1a}
#tw-hud .air{display:inline-block;width:6em;height:.7em;border:2px solid #3f2616;background:#1b1410;vertical-align:middle} #tw-hud .air i{display:block;height:100%;background:#9fe3ff}
#tw-help{position:fixed;left:6px;right:190px;bottom:6px;display:none;font-size:max(10px,1.6vmin);color:#3f2616;background:rgba(239,230,210,.8);padding:3px 7px;border-radius:4px;pointer-events:none;z-index:6;line-height:1.45}
#tw-msg{position:fixed;left:0;right:0;top:16%;text-align:center;font-weight:bold;color:#fff7e6;font-size:max(16px,3.2vmin);display:none;text-shadow:2px 2px 0 #3f2616,-1px -1px 0 #3f2616;pointer-events:none;z-index:6}
#tw-mini{position:fixed;left:auto;right:8px;top:max(44px,7vmin);width:min(170px,26vmin);height:min(170px,26vmin);display:none;z-index:6;border:3px solid #5a3a22;border-radius:4px;background:#efe6d2;image-rendering:pixelated;box-shadow:2px 2px 0 rgba(63,38,22,.5);touch-action:none}
#tw-mini.big{right:50%;top:50%;transform:translate(50%,-50%);width:min(82vmin,640px);height:min(82vmin,640px);z-index:8}
#tw-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(90vw,520px);display:none;z-index:8;background:#efe6d2;border:3px solid #3f2616;border-radius:6px;
 padding:10px 14px;color:#3f2616;font-weight:bold;text-align:center;font-size:max(12px,2vmin);box-shadow:0 0 0 5px rgba(90,58,34,.5)}
#tw-panel .row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:8px 0} #tw-panel .cd{min-width:7.5em;padding:8px 6px;border:2px solid #5a3a22;border-radius:5px;background:#fff7e6;cursor:pointer;touch-action:none}
#tw-panel .cd:hover{background:#ffe9b8} #tw-panel .new{border-color:#d9894a;background:#ffe2b0} #tw-panel small{opacity:.75;font-weight:normal}
#tw-touch{position:fixed;inset:0;display:none;z-index:5;touch-action:none}
#tw-touch .tb3{position:absolute;width:15vmin;height:15vmin;border-radius:50%;border:2px solid rgba(63,38,22,.6);background:rgba(239,230,210,.5);display:flex;align-items:center;justify-content:center;font-weight:bold;color:#3f2616;font-size:max(11px,2vmin)}
#tw-touch .on{background:rgba(255,179,71,.65)}`;
document.head.appendChild(css);
const el = (id, tag) => { const e = document.createElement(tag || 'div'); e.id = id; document.body.appendChild(e); return e; };
const foldEl = el('tw-fold'), promptEl = el('tw-prompt'), hudEl = el('tw-hud'), helpEl = el('tw-help'), msgEl = el('tw-msg'), miniEl = el('tw-mini', 'canvas'), panelEl = el('tw-panel'), touchEl = el('tw-touch');
miniEl.width = miniEl.height = TT.N;
const isTouch = !!A.isTouch;
const HELP = {
  map: isTouch ? 'left: walk (push far: run) &nbsp; ACT: dig, flag, open, doors &nbsp; HOOK: river junk &nbsp; MAP: the whole map' :
    'WASD / arrows walk &middot; Shift run &middot; E or F: dig, flag a heap, open a chest, use a door &middot; left click or H: hook river junk &middot; ' + TT.BIG_MAP + ': the whole map &middot; P pause',
  dive: isTouch ? 'left: swim &nbsp; SWIM: stroke up &nbsp; HOOK: pull to a ring or a crate &nbsp; ACT: open' :
    'A / D swim &middot; Space, W or Up: stroke up (hold to rise) &middot; S / Down: dive &middot; left click or H: hook to a gold ring or a crate &middot; E / F: open &middot; P pause' };
const setHelp = k => { if (helpEl.dataset.k !== k) { helpEl.dataset.k = k; helpEl.innerHTML = HELP[k]; } };
let msgT = 0; const LOG = [];
function toast(s, t) { msgEl.textContent = s; msgEl.style.display = 'block'; msgT = t || 2.2; LOG.push(s); if (LOG.length > 60) LOG.shift(); }

/* ======================= small builders ======================= */
const _o = new THREE.Object3D(), _v = new V3(), _v2 = new V3(), _c = new THREE.Color(), _m = new THREE.Matrix4();
const T = (x, y, z, rx, ry, rz, sx, sy, sz) => { if (sx === undefined) sx = 1; if (sy === undefined) sy = sx; if (sz === undefined) sz = sx;
  return new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new V3(sx, sy, sz)); };
function bake(parts) {   // [geometry, matrix, colour] -> one non-indexed geometry with vertex colours (one draw call)
  const pos = [], nor = [], col = [];
  for (const [geo, m, c] of parts) { const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m); _c.set(c);
    const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(_c.r, _c.g, _c.b); } g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g; }
const VC = reg(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
const gB = new THREE.BoxGeometry(1, 1, 1), gC = new THREE.CylinderGeometry(.5, .5, 1, 8), gS = new THREE.SphereGeometry(.5, 12, 8), gK = new THREE.ConeGeometry(.5, 1, 5),
  gI = new THREE.IcosahedronGeometry(.5, 0), gTo = new THREE.TorusGeometry(.45, .08, 6, 18), gArch = new THREE.TorusGeometry(1.25, .22, 4, 12, PI), gQ = new THREE.PlaneGeometry(1, 1);
const mesh = (g, m, par) => { const o = new THREE.Mesh(g, m); if (par) par.add(o); return o; };
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
const TMP = { map: [], dive: [] }; let regTo = null;   // materials made per map / per dive: freed with it (game.js's reg list keeps only the long-lived ones)
const regT = m => { if (regTo) regTo.push(m); else reg(m); return m; };
const freeMats = L => { for (const m of L) { if (m.map && m.map !== glowTex) m.map.dispose(); m.dispose(); } L.length = 0; };
const glowM = col => regT(new THREE.MeshBasicMaterial({ map: glowTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));

const gTr0 = () => gC;   // a plain trunk (the arch's posts)
const GEO = {
  gate: bake([[gArch, T(0, 0, 0), '#efe6d2'], [gArch, T(0, 0, -.06, 0, 0, 0, 1.08, 1.08, .6), '#8a6a44'], [gB, T(-1.25, -.3, 0, 0, 0, 0, .44, .7, .44), '#efe6d2'], [gB, T(1.25, -.3, 0, 0, 0, 0, .44, .7, .44), '#efe6d2'],
    [gB, T(0, 1.75, .08, 0, 0, .06, 1.5, .62, .06), '#d8c49a'], [gB, T(-.35, 1.75, .12, 0, 0, .06, .5, .5, .02), '#5c9fc0'], [gB, T(.3, 1.72, .12, 0, 0, .06, .55, .1, .02), '#8a6a44'], [gB, T(.15, 1.88, .12, 0, 0, .06, .1, .32, .02), '#8a6a44']]),
  flap: bake([[gB, T(0, .45, 0, 0, 0, 0, 2.1, 2.2, .05), '#9a7a52'], [gB, T(0, .45, .04, 0, 0, 0, .06, 2.2, .02), '#6a4a2a'], [gB, T(0, .9, .04, 0, 0, 0, 2.1, .05, .02), '#6a4a2a']]),
  pile: bake([[gB, T(0, .2, 0, .2, .4, .1, .7, .4, .5), '#8a6448'], [gC, T(.4, .25, .3, PI / 2, 0, .4, .3, .5, .3), '#a9b2b8'], [gB, T(-.35, .18, .25, 0, 1, 0, .9, .14, .22), '#9a6a3a'],
    [gS, T(.1, .45, -.2, 0, 0, 0, .5, .4, .5), '#4a3a2e'], [gB, T(-.2, .5, -.1, .4, .2, .9, .35, .12, .2), '#34343c'], [gC, T(.45, .3, -.35, 0, 0, .9, .16, .5, .16), '#5fa58a']]),
  heap: bake([[gI, T(0, .4, 0, 0, 0, 0, 2.2, 1.1, 2), '#7a6a5a'], [gB, T(.6, .9, .3, .3, .5, .2, .9, .5, .6), '#a9b2b8'], [gC, T(-.5, .95, -.3, .5, 0, .8, .35, 1.2, .35), '#8a6448'],
    [gB, T(-.2, 1.1, .4, 0, .7, .3, .7, .16, .4), '#9a6a3a'], [gS, T(.3, 1.15, -.5, 0, 0, 0, .5, .4, .5), '#34343c'], [gC, T(.9, .6, -.5, 0, 0, 1.2, .2, .7, .2), '#c7b48a']]),
  flag: bake([[gC, T(0, 1.1, 0, 0, 0, 0, .06, 2.2, .06), '#5a3a22'], [gB, T(.35, 1.9, 0, 0, 0, 0, .7, .45, .03), '#d9534f'], [gB, T(.2, 1.95, .02, 0, 0, 0, .16, .16, .02), '#efe6d2']]),
  chest: bake([[gB, T(0, .3, 0, 0, 0, 0, 1.1, .6, .75), '#8a5a2e'], [gB, T(0, .3, .38, 0, 0, 0, 1.12, .1, .02), '#c9a24a'], [gB, T(0, .3, 0, 0, 0, 0, .1, .62, .77), '#c9a24a']]),
  lid: bake([[gB, T(0, .12, -.37, 0, 0, 0, 1.12, .24, .77), '#9a6a3a'], [gB, T(0, .2, -.37, 0, 0, 0, .1, .25, .79), '#c9a24a']]),
  rock: bake([[gI, T(0, 1.1, 0, 0, .4, 0, 2.6, 2.6, 2.2), '#a7a39a'], [gI, T(.9, .5, .6, .3, 0, 0, 1.4, 1.1, 1.3), '#959188'], [gB, T(-1.2, 1, .7, 0, 0, -.3, .1, 2.2, .1), '#8a6a44'],
    [gB, T(-1.05, 1, .7, 0, 0, -.3, .1, 2.2, .1), '#8a6a44'], [gB, T(-1.1, 1.4, .72, 0, 0, -.3, .4, .06, .06), '#8a6a44'], [gB, T(-1.25, .7, .72, 0, 0, -.3, .4, .06, .06), '#8a6a44']]),
  dock: bake([[gB, T(1.4, .05, 0, 0, 0, 0, 2.8, .12, 1.1), '#9a6a3a'], [gC, T(2.7, -.2, .5, 0, 0, 0, .14, .8, .14), '#6a4a2a'], [gC, T(2.7, -.2, -.5, 0, 0, 0, .14, .8, .14), '#6a4a2a'],
    [gC, T(-.2, .55, -.6, 0, 0, 0, .08, 1.1, .08), '#6a4a2a'], [gB, T(-.2, 1.05, -.55, 0, 0, 0, .9, .4, .05), '#efe6d2'], [gS, T(-.35, 1.05, -.52, 0, 0, 0, .3, .14, .04), '#c9a24a']]),
  buoy: bake([[gS, T(0, .2, 0, 0, 0, 0, .7, .6, .7), '#d9534f'], [gC, T(0, .35, 0, 0, 0, 0, .72, .14, .72), '#efe6d2'], [gC, T(0, .8, 0, 0, 0, 0, .06, .9, .06), '#3f2616'], [gS, T(0, 1.25, 0, 0, 0, 0, .18, .18, .18), '#ffd37a']]),
  rjunk: bake([[gC, T(0, .1, 0, PI / 2, 0, .3, .3, .55, .3), '#a9b2b8'], [gB, T(.25, .12, .2, 0, .5, 0, .35, .2, .3), '#8a6448']]),
  tree: bake([[gC, T(0, .5, 0, 0, 0, 0, .25, 1, .25), '#6b4f38'], [gK, T(0, 1.9, 0, 0, 0, 0, 1.9, 2.4, 1.9), '#4f7f3c'], [gK, T(0, 2.9, 0, 0, .6, 0, 1.4, 1.8, 1.4), '#5f8f4a']]),
  bush: bake([[gI, T(0, .4, 0, 0, 0, 0, 1.4, .9, 1.3), '#5f8f4a'], [gI, T(.5, .35, .3, 0, 1, 0, .9, .6, .8), '#6f9f52']]),
  stoneP: bake([[gI, T(0, .3, 0, 0, .3, 0, 1.2, .8, 1), '#9a968c']]),
  plank: bake([[gB, T(0, 0, 0, 0, 0, 0, .9, .1, .3), '#9a6a3a']]),
  og: bake([[gTr0(), T(-1.5, 1.3, 0, 0, 0, -.08, .5, 2.6, .5), '#4a3a28'], [gTr0(), T(1.5, 1.2, 0, 0, 1, .1, .45, 2.4, .45), '#3f3020'], [gArch, T(0, 2.4, 0, 0, 0, 0, 1.25, .7, .8), '#2f4a2a'],
    [gI, T(-1.4, .25, .5, 0, 0, 0, .9, .5, .8), '#3f5a32'], [gI, T(1.5, .25, -.4, 0, 1, 0, .8, .45, .7), '#3f5a32'], [gB, T(0, .02, 0, 0, 0, 0, 2.2, .03, 1.6), '#1e2a1a'], [gS, T(.9, 2.2, .3, 0, 0, 0, .25, .25, .25), '#9fe3a0']]),
  tent: bake([[gK, T(0, .95, 0, 0, PI / 4, 0, 2.6, 1.9, 2.6), '#efe6d2'], [gK, T(0, .97, 0, 0, PI / 4, 0, 2.66, .35, 2.66), '#d9534f'], [gC, T(0, 2.1, 0, 0, 0, 0, .06, .9, .06), '#5a3a22'],
    [gB, T(.25, 2.4, 0, 0, 0, 0, .5, .3, .03), '#3f2616'], [gB, T(0, .45, 1.05, -.3, 0, 0, .7, .9, .03), '#3f2616'], [gI, T(-1.3, .15, .8, 0, 0, 0, .5, .3, .4), '#8a6448'], [gC, T(1.2, .2, -.9, 0, 0, 0, .25, .4, .25), '#a9b2b8']]),
  scraps: bake([[gB, T(-.4, .03, .2, 0, .5, 0, .8, .03, .5), '#efe6d2'], [gB, T(.5, .03, -.3, 0, 1.4, 0, .6, .03, .4), '#d9534f'], [gB, T(.1, .03, .6, 0, 2.2, 0, .5, .03, .3), '#efe6d2'], [gC, T(.3, .06, .1, PI / 2, 0, .4, .05, .9, .05), '#5a3a22']]),
  cmob: bake([[gS, T(0, 0, 0, 0, 0, 0, .45, .35, .4), '#2a2430'], [gB, T(0, .05, .38, .3, 0, 0, .35, .03, .45), '#3a3040'], [gB, T(0, .05, -.38, -.3, 0, 0, .35, .03, .45), '#3a3040'], [gS, T(.2, .08, .1, 0, 0, 0, .07, .07, .07), '#ffd37a'], [gS, T(.2, .08, -.1, 0, 0, 0, .07, .07, .07), '#ffd37a']]),
  bird: bake([[gB, T(-.3, 0, 0, 0, 0, .3, .6, .03, .22), '#efe6d2'], [gB, T(.3, 0, 0, 0, 0, -.3, .6, .03, .22), '#efe6d2'], [gK, T(0, 0, .1, PI / 2, 0, 0, .14, .5, .14), '#d8c49a']])
};

/* ======================= the map generator (seeded; zone graph -> height -> river -> spots -> paths -> checks) ======================= */
function heapNew() { const h = []; return { push(c, k) { h.push([k, c]); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } },
  pop() { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top[1]; },
  get size() { return h.length; } }; }
function genMap(seed, nGates) {
  let m = null; for (let a = 0; a < 8; a++) { m = tryMap(seed, a, Math.max(1, nGates | 0)); if (m.ok) return m; } return m;   // a failed seed moves to the next sub-seed
}
function tryMap(seed, a, nGates) {
  const N = TT.N, C = N * N, r = mulberry(hash(seed + (a ? '|map' + (a + 1) + '|' : '|map|'))), I = (x, z) => z * N + x, inb = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
  const ms = {}, tk = (() => { let t = performance.now(); return k => { const n = performance.now(); ms[k] = +(n - t).toFixed(1); t = n; }; })();
  const ri = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)), D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  // 1. zone graph: the forest edge (west strip) plus 4-6 zones (each ground kind at least once), warped nearest-seed regions
  const nz = 5 + Math.floor(r() * 3), ks = ['meadow', 'moss', 'mud', 'stone']; while (ks.length < nz - 1) ks.push(ks[Math.floor(r() * 4)]);
  for (let i = ks.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ks[i], ks[j]] = [ks[j], ks[i]]; }
  const zs = [{ k: 'edge', x: 6, z: N / 2 }];
  for (const k of ks) { let best = null; for (let t = 0; t < 24; t++) { const x = 28 + r() * (N - 36), z = 8 + r() * (N - 16), d = Math.min(...zs.map(s => Math.hypot(s.x - x, s.z - z))); if (!best || d > best.d) best = { x, z, d }; } zs.push({ k, x: best.x, z: best.z }); }
  const ow = r() * 50, zone = new Uint8Array(C);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { if (x < 14) { zone[I(x, z)] = 0; continue; }
    const wx = x + (fbm(x * .07 + ow, z * .07) - .5) * 14, wz = z + (fbm(x * .07, z * .07 + ow) - .5) * 14; let bi = 1, bd = 1e9;
    for (let i = 1; i < zs.length; i++) { const d = Math.hypot(zs[i].x - wx, zs[i].z - wz); if (d < bd) { bd = d; bi = i; } } zone[I(x, z)] = bi; }
  const links = {}; for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const a0 = zone[I(x, z)]; for (const [dx, dz] of [[1, 0], [0, 1]]) { if (!inb(x + dx, z + dz)) continue; const b0 = zone[I(x + dx, z + dz)];
    if (a0 !== b0) { const k = Math.min(a0, b0) + '-' + Math.max(a0, b0); if (!links[k]) links[k] = { a: Math.min(a0, b0), b: Math.max(a0, b0), n: 0, guard: 0 }; links[k].n++; } } }
  for (const k of Object.keys(links).sort()) { const L = links[k]; L.guard = L.a === 0 ? 0 : Math.floor(r() * 4); }   // guard strength 0-3; the forest edge is always open
  tk('zones');
  // 2. height: two noise fields shaped to the zones, cut into 4 paper layers (the forest edge is the lowest layer)
  const o1 = r() * 100, o2 = r() * 100, hv = new Float32Array(C); let lo = 1e9, hi = -1e9;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const k = ZK.indexOf(zs[zone[I(x, z)]].k); let h = fbm(x * .045 + o1, z * .045 + o2) * .9 + x / N * .5 + (k === 4 ? .12 : k === 3 ? -.1 : 0); hv[I(x, z)] = h; lo = Math.min(lo, h); hi = Math.max(hi, h); }
  const layer = new Uint8Array(C); for (let c = 0; c < C; c++) { const x = c % N; layer[c] = x < 16 ? 0 : Math.min(3, Math.floor((hv[c] - lo) / (hi - lo + 1e-6) * 4)); }
  tk('height');
  // 4. river: from the high (east) edge, downhill with a little noise so it bends, widening; ends in a lake or at the map edge
  const water = new Uint8Array(C), river = []; let end = 'lake';
  { let sx = N - 1, sz = 0, bh = -1e9; for (let t = 0; t < 14; t++) { const z = ri(14, N - 15); if (hv[I(sx, z)] > bh) { bh = hv[I(sx, z)]; sz = z; } }
    const seen = new Uint8Array(C); let cx = sx, cz = sz;
    for (let s = 0; s < 600; s++) { river.push([cx, cz]); seen[I(cx, cz)] = 1;
      if (cx <= 22) { end = 'lake'; break; } if (s > 12 && (cz <= 0 || cz >= N - 1)) { end = 'edge'; break; }
      let best = null, bs = 1e9; for (const [dx, dz] of D8) { const nx = cx + dx, nz2 = cz + dz; if (!inb(nx, nz2) || seen[I(nx, nz2)]) continue; const sc = hv[I(nx, nz2)] + dx * .035 + (r() - .5) * .07; if (sc < bs) { bs = sc; best = [nx, nz2]; } }
      if (!best) { end = 'lake'; break; } cx = best[0]; cz = best[1]; }
    river.forEach(([x, z], i) => { const w = 1.1 + Math.min(.9, i / 110); for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dz) <= w && inb(x + dx, z + dz)) water[I(x + dx, z + dz)] = 1; });
    if (end === 'lake') { const [lx, lz] = river[river.length - 1]; for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) if (Math.hypot(dx, dz * 1.2) <= 5.5 && inb(lx + dx, lz + dz) && lx + dx >= 15) water[I(lx + dx, lz + dz)] = 1; } }
  const layer0 = layer.slice(); for (let c = 0; c < C; c++) if (water[c]) layer[c] = Math.max(0, layer[c] - 1);   // the river bed drops one paper layer
  const nearWater = (x, z, rr) => { for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) if (inb(x + dx, z + dz) && water[I(x + dx, z + dz)]) return true; return false; };
  tk('river');
  // 5. spots (minimum spacing): pool, pond, view rock, chests, scrap heaps, junk piles; then the forest gates on the edge
  const spots = [], zk = (x, z) => zs[zone[I(x, z)]].k;
  const free = (x, z, d) => spots.every(s => Math.hypot(s.x - x, s.z - z) >= d);
  const okLand = (x, z) => inb(x, z) && x >= 20 && x < N - 4 && z >= 5 && z < N - 5 && !nearWater(x, z, 2);
  const place = (type, pref, d) => { for (let t = 0; t < 400; t++) { const x = ri(20, N - 5), z = ri(5, N - 6); if (!okLand(x, z) || !free(x, z, d || TT.SPACING)) continue; if (t < 160 && pref && !pref(x, z)) continue;
    const s = { type, x, z, zone: zk(x, z) }; spots.push(s); return s; } return null; };
  { const cand = river.slice(Math.floor(river.length * .3)).filter(([x]) => x >= 26); let pool = null;
    for (let t = 0; t < 60 && !pool && cand.length; t++) { const [wx, wz] = cand[Math.floor(r() * cand.length)];
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { let x = wx, z = wz; for (let k = 0; k < 5 && inb(x, z) && water[I(x, z)]; k++) { x += dx; z += dz; }
        if (inb(x, z) && !water[I(x, z)] && x >= 24 && z > 4 && z < N - 5 && free(x, z, TT.SPACING)) { pool = { type: 'pool', x, z, zone: zk(x, z), wx: x - dx * 2, wz: z - dz * 2 }; break; } } }
    if (pool) spots.push(pool); }
  { for (let t = 0; t < 300; t++) { const x = ri(22, N - 12), z = ri(8, N - 9); if (!okLand(x, z) || !free(x, z, TT.SPACING + 4) || nearWater(x + 3, z, 6)) continue;
      let land = true; for (let dx = 0; dx <= 6 && land; dx++) for (let dz = -3; dz <= 3; dz++) if (water[I(x + dx, z + dz)] || layer[I(x + dx, z + dz)] !== layer[I(x, z)]) { land = false; break; }
      if (!land) continue; const s = { type: 'pond', x, z, zone: zk(x, z) }; spots.push(s);
      for (let dz = -3; dz <= 3; dz++) for (let dx = 1; dx <= 6; dx++) if (Math.hypot(dx - 3.6, dz) <= 2.5) water[I(x + dx, z + dz)] = 2;   // 2 = pond water
      break; } }
  place('rock', (x, z) => zk(x, z) === 'stone');
  for (let i = ri(TT.CHESTS[0], TT.CHESTS[1]); i > 0; i--) place('chest', (x, z) => zk(x, z) === 'moss');
  for (let i = ri(TT.HEAPS[0], TT.HEAPS[1]); i > 0; i--) place('heap', (x, z) => zk(x, z) === 'mud' || zk(x, z) === 'stone');
  for (let i = ri(TT.JUNK[0], TT.JUNK[1]); i > 0; i--) place('junk', (x, z) => zk(x, z) === 'mud' || nearWater(x, z, 6), TT.SPACING - 2);
  place('og', (x, z) => x >= TT.OG.MIN_X && (zk(x, z) === 'moss' || zk(x, z) === 'meadow')) || null;   // the OG world: far east of the forest edge, in the woods if it can
  { const og = spots.find(q => q.type === 'og'); if (og && og.x < TT.OG.MIN_X) spots.splice(spots.indexOf(og), 1); }
  for (const s of spots) if (s.type === 'junk') { const lean = nearWater(s.x, s.z, 6) ? LEAN.river : LEAN[s.zone] || LEAN.meadow; s.left = []; for (let k = ri(TT.PILE[0], TT.PILE[1]); k > 0; k--) s.left.push(lean[Math.floor(r() * lean.length)]); }
  for (let g = 0; g < nGates; g++) { const z = nGates === 1 ? N / 2 : Math.round(16 + g * (N - 32) / (nGates - 1)); spots.push({ type: 'gate', g, x: 5, z, zone: 'edge' }); }
  tk('spots');
  // 6. paths: a minimum spanning tree over the spots plus 1-2 loops, each link found by A* (water very dear, layer edges dear)
  const path = new Uint8Array(C), bridge = new Uint8Array(C), nodes = spots.map(s => [s.x, s.z]), inT = [0], used = {}, edges = [];
  while (inT.length < nodes.length) { let best = null; for (const i of inT) for (let j = 0; j < nodes.length; j++) { if (inT.includes(j)) continue; const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]); if (!best || d < best[2]) best = [i, j, d]; }
    inT.push(best[1]); edges.push(best); used[Math.min(best[0], best[1]) + '-' + Math.max(best[0], best[1])] = 1; }
  for (let e = 1 + Math.floor(r() * 2), t = 0; e > 0 && t < 60; t++) { const i = Math.floor(r() * nodes.length), j = Math.floor(r() * nodes.length), k = Math.min(i, j) + '-' + Math.max(i, j);
    if (i === j || used[k]) continue; const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]); if (d > 45) continue; used[k] = 1; edges.push([i, j, d]); e--; }
  const linkCells = [];
  for (const [i, j] of edges) { const [sx, sz] = nodes[i], [tx, tz] = nodes[j], g = new Float32Array(C).fill(1e9), from = new Int32Array(C).fill(-1), H = heapNew(), s0 = I(sx, sz), t0 = I(tx, tz);
    g[s0] = 0; H.push(s0, 0);
    while (H.size) { const c = H.pop(); if (c === t0) break; const cx = c % N, cz = (c / N) | 0;
      for (const [dx, dz] of D8) { const nx = cx + dx, nz2 = cz + dz; if (!inb(nx, nz2)) continue; const n = I(nx, nz2);
        let w = (dx && dz ? 1.414 : 1) * (water[n] === 2 ? 1e4 : water[n] ? 30 : 1) + (layer[n] !== layer[c] ? 6 : 0); if (path[n]) w *= .5;
        if (g[c] + w < g[n]) { g[n] = g[c] + w; from[n] = c; H.push(n, g[n] + Math.hypot(tx - nx, tz - nz2)); } } }
    const cells = []; for (let c = t0; c >= 0; c = from[c]) { cells.push(c); if (c === s0) break; } linkCells.push({ i, j, cells });
    for (const c of cells) { const cx = c % N, cz = (c / N) | 0; for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) { if (!inb(cx + dx, cz + dz)) continue; const n = I(cx + dx, cz + dz);
      if (water[n] === 2) continue; if ((dx || dz) && layer[n] !== layer[c] && !water[n]) continue; path[n] = 1; if (water[n]) bridge[n] = 1; } } }
  tk('paths');
  // camps: (1) the deep pool's guard, on the path a few steps before the pool door (walking order from the forest edge), strength 2-3;
  // (2) the strongest other guarded zone link a path crosses, 12+ m from the first. The deep pool's zone links are guarded 2+.
  const pz = spots.find(s => s.type === 'pool'); if (pz) { const z0 = zone[I(pz.x, pz.z)]; for (const k in links) { const L = links[k]; if ((L.a === z0 || L.b === z0) && L.a !== 0) L.guard = Math.max(2, L.guard); } }
  const camps = [], cand = [];
  if (pz) { const dd = distFrom({ N, water, bridge, layer, path }, spots.find(s => s.type === 'gate')), dp = dd[I(pz.x, pz.z)]; let best = null;
    for (let c = 0; c < C; c++) { if (!path[c] || water[c] || dd[c] < 0 || dd[c] >= dp) continue; const x = c % N, z = (c / N) | 0, e = Math.hypot(x - pz.x, z - pz.z);
      if (e < 3.5 || e > 9 || spots.some(q => q !== pz && Math.hypot(q.x - x, q.z - z) < 4)) continue; if (!best || dd[c] > best.d) best = { c, d: dd[c] }; }
    if (best) camps.push({ id: 0, pool: true, guard: 2 + (r() < .5 ? 1 : 0), x: best.c % N, z: (best.c / N) | 0 }); }
  for (const lc of linkCells) for (let q = 1; q < lc.cells.length; q++) { const a0 = zone[lc.cells[q - 1]], b0 = zone[lc.cells[q]]; if (a0 === b0) continue;
    const L = links[Math.min(a0, b0) + '-' + Math.max(a0, b0)], c = lc.cells[q]; if (L && L.guard > 0 && !water[c] && !cand.some(k => k.link === L)) cand.push({ link: L, guard: L.guard, x: c % N, z: (c / N) | 0 }); }
  cand.sort((p, q) => q.guard - p.guard);
  for (const k of cand) if (camps.length < 2 && camps.every(c => Math.hypot(c.x - k.x, c.z - k.z) >= 12) && spots.every(q => Math.hypot(q.x - k.x, q.z - k.z) >= 4)) camps.push({ id: camps.length, guard: k.guard, x: k.x, z: k.z });
  // ground per cell
  const tile = new Uint8Array(C); for (let c = 0; c < C; c++) { const k = zs[zone[c]].k; tile[c] = water[c] && !bridge[c] ? 2 : path[c] ? 1 : k === 'moss' ? 3 : k === 'mud' ? 4 : k === 'stone' ? 5 : 0; }
  const m = { seed, a, N, nGates, zone, zs, links, layer, layer0, water, path, bridge, tile, spots, river: { end, len: river.length, cells: river }, camps, ok: false, why: '' };
  // 8. self-checks: every spot reachable from every forest gate, no spot in water, the river ends, at least 6 junk piles
  const reach = reachFrom(m, spots.find(s => s.type === 'gate'));
  const miss = spots.filter(s => !reach[I(s.x, s.z)]), wet = spots.filter(s => water[I(s.x, s.z)]), nj = spots.filter(s => s.type === 'junk').length;
  m.why = miss.length ? 'unreachable ' + miss.map(s => s.type).join(',') : wet.length ? 'spot in water' : nj < 6 ? 'junk ' + nj : !spots.some(s => s.type === 'pool') ? 'no pool' : !spots.some(s => s.type === 'pond') ? 'no pond' : !camps.some(c => c.pool) ? 'no pool camp' : !spots.some(s => s.type === 'rock') ? 'no rock' : !spots.some(s => s.type === 'og') ? 'no og' : '';
  tk('checks'); m.ms = ms; m.ok = !m.why; return m;
}
const walkable = (m, c) => !m.water[c] || m.bridge[c];
const canStep = (m, a, b) => walkable(m, b) && (Math.abs(m.layer[a] - m.layer[b]) <= 1 || m.path[a] || m.path[b]);   // one paper layer up or down is a step anywhere; a bigger drop only where a path ramps
function reachFrom(m, s) {
  const N = m.N, seen = new Uint8Array(N * N); if (!s) return seen; const q = [s.z * N + s.x]; seen[q[0]] = 1;
  while (q.length) { const c = q.pop(), x = c % N, z = (c / N) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue; const n = nz * N + nx; if (!seen[n] && canStep(m, c, n)) { seen[n] = 1; q.push(n); } } }
  return seen; }
function distFrom(m, s) {   // walking steps from a spot (-1 = not reachable), the same moves as reachFrom
  const N = m.N, d = new Int32Array(N * N).fill(-1); if (!s) return d; const q = [s.z * N + s.x]; d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) { const c = q[h], x = c % N, z = (c / N) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue; const n = nz * N + nx; if (d[n] < 0 && canStep(m, c, n)) { d[n] = d[c] + 1; q.push(n); } } }
  return d; }
function fingerprint(m) { let h = 2166136261 >>> 0; const mix = v => { h ^= v; h = Math.imul(h, 16777619) >>> 0; };
  for (let c = 0; c < m.tile.length; c++) { mix(m.tile[c]); mix(m.layer[c]); }
  return JSON.stringify({ a: m.a, h, spots: m.spots.map(s => [s.type, s.x, s.z]), camps: m.camps.map(c => [c.guard, c.x, c.z]), river: [m.river.end, m.river.len] }); }
const GREY = [150, 230, 40, 110, 90, 190];   // meadow, path, water, moss, mud, stone
function greyLayout(m) {   // the grey code layout per seed: grey levels for ground kinds, path and river (+ a little per paper layer)
  const c = document.createElement('canvas'); c.width = c.height = m.N; const g = c.getContext('2d'), im = g.createImageData(m.N, m.N);
  for (let i = 0; i < m.tile.length; i++) { const v = Math.min(255, GREY[m.tile[i]] + m.layer[i] * 8); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0); return c; }

/* ======================= per-run state ======================= */
const R = { world: null, map: null, gates: null, fog: null, fogN: 0, from: null, bossSeen: 0, refills: 0, rj: [], visits: 0, dives: 0, rng: null };
function bossesDone() { let n = 0; const b = G.bosses || {}; for (const k in b) if (b[k] && b[k].done) n++; return n; }
function runCheck() {   // a new run (new world) = a new map; the map is made the first time you enter and kept for the run
  if (!G.world || R.world === G.world) return; if (G.camp) campTidy(); G.camp = null; R.campLog = []; R.camps = 0; if (R.ogOn) ogOff(); R.ogOn = false; R.ogBack = 0; R.ogIn = 0; disposeMap(); Object.assign(R, { world: G.world, map: null, gates: null, fog: null, fogN: 0, from: null, bossSeen: bossesDone(), refills: 0, rj: [], visits: 0, dives: 0, rng: null });
  if (!A.junkAdd) G.bag = [];   // standalone: this file keeps the run's junk bag (game.js's own bag, when there is one, is reset by game.js)
  side.key = '';
}
const bag = () => { if (!Array.isArray(G.bag)) G.bag = []; return G.bag; };
const bagMax = () => A.bagMax || TT.BAG_MAX;
function bagAdd(kind) { if (!JUNK[kind]) return false; if (A.junkAdd) return !!A.junkAdd(kind, 'map'); const b = bag(); if (b.length >= bagMax()) return false; b.push(kind); return true; }
const bagFull = () => bag().length >= bagMax();

/* ======================= side scroller: map gates in forest rooms ======================= */
const gateCache = {};
function fishPaths() { try { return A.FW && A.FW.paths ? A.FW.paths() : {}; } catch (e) { return {}; } }
function sideGates() {   // per run: { roomIndex: x (logical px) }. ~25% of plain forest rooms; at least one (never room 1, a boss room or the room before a boss)
  const key = G.seed; if (gateCache[key] && gateCache[key].w === G.world) return gateCache[key].m;
  const m = {}, rooms = G.world.rooms, fp = fishPaths(), plain = r => r.i > 0 && !/^boss/.test(r.kind) && !(rooms[r.i + 1] && /^boss/.test(rooms[r.i + 1].kind));
  const pick = (r, rr) => { const bad = []; r.holes.forEach(h => bad.push([h.x0 - 30, h.x1 + 30])); r.pools.forEach(p => bad.push([p.x0 - 30, p.x1 + 30])); (r.vines || []).forEach(v => bad.push([v.ax - 30, v.ax + 30]));
    if (fp[r.i] !== undefined) bad.push([fp[r.i] - TT.GATE_PX, fp[r.i] + TT.GATE_PX]);
    for (let k = 0; k < 40; k++) { const x = 50 + Math.floor(rr() * 220); if (!bad.some(b => x > b[0] && x < b[1]) && !r.trees.some(t => Math.abs(X(t.x + t.w / 2) - X(x)) < 2.6)) return x; } return null; };
  for (const r of rooms) { if (!plain(r) || fp[r.i] !== undefined) continue; const rr = mulberry(hash(G.seed + '|mapgate|' + r.i)); if (rr() < TT.GATE_RATE) { const x = pick(r, rr); if (x !== null) m[r.i] = x; } }
  if (!Object.keys(m).length) for (const r of rooms) { if (!plain(r)) continue; const x = pick(r, mulberry(hash(G.seed + '|mapgate2|' + r.i))); if (x !== null) { m[r.i] = x; break; } }   // fallback: may share a room with a fishing path (far from it)
  gateCache[key] = { w: G.world, m }; return m;
}
const gateRooms = () => Object.keys(sideGates()).map(Number).sort((p, q) => p - q);
const side = { group: null, key: '', x: null, near: false };
function roomGateX() { if (!G.world) return null; const m = sideGates(); return m[G.room] === undefined ? null : m[G.room]; }
function disposeSide() { if (!side.group) return; if (side.group.parent) side.group.parent.remove(side.group); side.group = null; }
const sideGY = (x, z) => z < -6 ? A.bankH(x, z) : A.frontH(x, z) + .03;
let sideHalo = null;
function buildSide() {
  runCheck(); disposeSide(); side.key = G.seed + '#' + G.room; side.x = roomGateX(); if (side.x === null) return;
  const px = X(side.x), grp = new THREE.Group(); side.group = grp; A.roomGroup.add(grp);
  const gz = -3.4, gt = mesh(GEO.gate, VC, grp); gt.position.set(px, sideGY(px, gz) + .8, gz); gt.scale.setScalar(1.5); gt.castShadow = true;
  sideHalo = sideHalo || glowM('#ffe7a8'); const h = mesh(gQ, sideHalo, grp); h.position.set(px, sideGY(px, gz) + 2.2, gz + .3); h.scale.setScalar(4); side.halo = h;
}
function sidePrompt() {
  const p = G.p, x = roomGateX(), sup = G.sup && G.sup.on;
  const near = x !== null && p && !(p.dead > 0) && !G.freeze && !sup && Math.abs(p.x - x) < 16;
  side.near = near; setPrompt(near ? (isTouch ? 'TAP: open the paper map' : 'F: open the paper map') : '');
}
let promptTxt = '';
function setPrompt(s) { if (promptTxt !== s) { promptTxt = s; promptEl.textContent = s; promptEl.style.display = s ? 'block' : 'none'; } }
function afterSide(dt) {
  if (G.state === 'play' && side.key !== G.seed + '#' + G.room) buildSide();
  if (side.group && side.halo) { side.halo.quaternion.copy(A.camera.quaternion); side.halo.material.opacity = .45 + Math.sin(A.VT() * 3) * .15; }
}

/* ======================= the page fold (both ways) ======================= */
const fold = { on: false, t: 0, mid: null, done: false, dur: .5 };
function startFold(mid) { if (fold.on) return false; Object.assign(fold, { on: true, t: 0, mid, done: false }); foldEl.style.display = 'block'; A.sfx(260, .18, 'triangle'); setTimeout(() => A.sfx(200, .14, 'triangle'), 120); return true; }
function stepFold(dt) {
  if (!fold.on) return; fold.t += dt; const d = fold.dur;
  if (fold.t < d) { const u = sstep(0, d, fold.t); foldEl.style.transformOrigin = '50% 0%'; foldEl.style.transform = 'perspective(900px) rotateX(' + ((1 - u) * 88).toFixed(1) + 'deg)'; foldEl.style.opacity = '1'; }
  else if (!fold.done) { fold.done = true; foldEl.style.transform = 'none'; const f = fold.mid; fold.mid = null; if (f) f(); }
  else if (fold.t < d * 2.2) { const u = sstep(d * 1.2, d * 2.2, fold.t); foldEl.style.transformOrigin = '50% 100%'; foldEl.style.transform = 'perspective(900px) rotateX(' + (-u * 88).toFixed(1) + 'deg)'; }
  else { fold.on = false; foldEl.style.display = 'none'; foldEl.style.transform = 'none'; }
}

/* ======================= map scene ======================= */
const mscene = new THREE.Scene(), mcam = new THREE.PerspectiveCamera(TT.CAM.FOV, 16 / 9, .3, 300);
mscene.background = new THREE.Color('#d9cfb8');
const mhemi = new THREE.HemisphereLight('#fff6e0', '#8a7a5a', 1.25), msun = new THREE.DirectionalLight('#fff0d0', 1.6); mscene.add(mhemi, msun, msun.target);
const MV = { built: false, ground: null, props: [], spots: [], rj: [], gates: [], birds: null, bfly: null, hookL: null, hookH: null, crown: null };
const TEX = { tiles: {}, w0: null, w1: null, fog: null, fogC: null, art: false };
const GU = { uTime: { value: 0 }, uN: { value: TT.N }, uRep: { value: 1 / 7 } };
function tileTex(name) {
  if (TEX.tiles[name]) return TEX.tiles[name];
  const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.fillStyle = STANDIN[name]; g.fillRect(0, 0, 8, 8);
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, 4, 4); g.fillRect(4, 4, 4, 4);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = REPEAT; t.userData.standin = true; TEX.tiles[name] = t; paperArt();
  return t;
}
let paperAsked = false;
function paperArt() {   // the picked paper tiles: art/paper-tex.js is fetched on the first map visit; each stand-in tile is swapped once its picture decodes
  const J = window.JR_PAPER;
  if (!J) { if (!paperAsked) { paperAsked = true; const s = document.createElement('script'); s.src = 'art/paper-tex.js'; s.onload = () => paperArt(); s.onerror = () => { TEX.paperErr = true; }; document.head.appendChild(s); } return; }   // missing file: the stand-in colours stay, nothing else changes
  for (const name of TILES) { const t = TEX.tiles[name]; if (!t || !t.userData.standin || t.userData.art || !J[name]) continue; t.userData.art = true;   // only its own stand-ins: a picture given through setGroundArt stays
    const im = new Image(); im.onload = () => { t.dispose(); t.image = im; t.needsUpdate = true; TEX.art = (TEX.art | 0) + 1; }; im.src = J[name]; }   // dispose first: a texture already drawn at 8 x 8 keeps that size on the GPU otherwise
}
function setGroundArt(o) {   // the ground texture hook: any of meadow, path, water, moss, mud, stone -> a THREE texture (repeats both ways)
  for (const k of TILES) if (o && o[k]) { o[k].wrapS = o[k].wrapT = REPEAT; o[k].needsUpdate = true; TEX.tiles[k] = o[k]; if (MV.ground) MV.ground.material.uniforms['t_' + k].value = o[k]; }
}
const groundMat = () => new THREE.ShaderMaterial({
  uniforms: Object.assign({ t_meadow: { value: tileTex('meadow') }, t_path: { value: tileTex('path') }, t_water: { value: tileTex('water') }, t_moss: { value: tileTex('moss') },
    t_mud: { value: tileTex('mud') }, t_stone: { value: tileTex('stone') }, uW0: { value: TEX.w0 }, uW1: { value: TEX.w1 }, uFog: { value: TEX.fog } }, GU),
  vertexShader: 'attribute float aSh; varying vec3 vP; varying vec3 vNo; varying float vSh; void main(){ vP=position; vNo=normal; vSh=aSh; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D t_meadow,t_path,t_water,t_moss,t_mud,t_stone,uW0,uW1,uFog; uniform float uTime,uN,uRep; varying vec3 vP; varying vec3 vNo; varying float vSh;
float cut(float w,float n){ return smoothstep(.5-.13+n,.5+.13+n,w); }
void main(){
  vec2 uv=vP.xz/uN, tu=vP.xz*uRep; vec3 w0=texture2D(uW0,uv).rgb, w1=texture2D(uW1,uv).rgb;
  float n=(texture2D(t_path,tu*.31).r-.5)*.3;                   /* torn-paper edges: the cut line wanders with the paper grain */
  float wm=cut(w0.r,n), wp=cut(w0.g,-n), ww=cut(w0.b,n*.6), wo=cut(w1.r,n), wu=cut(w1.g,-n), ws=cut(w1.b,n);
  float sum=wm+wp+ww+wo+wu+ws+1e-4;
  vec2 fl=vec2(uTime*.018,uTime*.007)+vec2(sin(vP.z*.3+uTime*.6),cos(vP.x*.25+uTime*.5))*.01;
  vec3 col=(texture2D(t_meadow,tu).rgb*wm+texture2D(t_path,tu).rgb*wp+texture2D(t_water,tu+fl).rgb*ww+texture2D(t_moss,tu).rgb*wo+texture2D(t_mud,tu).rgb*wu+texture2D(t_stone,tu).rgb*ws)/sum;
  float l=.62+.5*max(dot(normalize(vNo),normalize(vec3(-.45,.85,-.3))),0.);
  float cs=sin(vP.x*.045+uTime*.07)*sin(vP.z*.05-uTime*.05+1.3);   /* drifting cloud shadows */
  col*=l*(1.-.13*smoothstep(.45,.95,cs))*(1.-vSh);
  float f=texture2D(uFog,uv).r;                                  /* unexplored: blank folded paper */
  vec2 fd=abs(fract(vP.xz/16.)-.5); float cr=1.-smoothstep(0.,.03,min(fd.x,fd.y));
  vec3 paper=vec3(.94,.9,.81)*(1.-.07*cr)*(.97+.03*sin(vP.x*1.7)*sin(vP.z*1.3));
  gl_FragColor=vec4(mix(paper,col,smoothstep(.25,.75,f)),1.);
}` });
const VH = { N1: 0, h: null };
function cellH(m, c) { return m.water[c] && !m.bridge[c] ? m.layer[c] * TT.LH - .42 : m.bridge[c] ? m.layer0[c] * TT.LH + .04 : m.layer[c] * TT.LH; }
function buildHeights(m) {
  const N = m.N, N1 = N + 1, h = new Float32Array(N1 * N1); VH.N1 = N1; VH.h = h;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { let s = 0, n = 0;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const x = i + dx, z = j + dz; if (x < 0 || z < 0 || x >= N || z >= N) continue; s += cellH(m, z * N + x); n++; }
    h[j * N1 + i] = s / n; }
}
function hAt(x, z) { const N1 = VH.N1, h = VH.h; if (!h) return 0; x = Math.max(0, Math.min(N1 - 1.001, x)); z = Math.max(0, Math.min(N1 - 1.001, z));
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, a = h[j * N1 + i], b = h[j * N1 + i + 1], c = h[(j + 1) * N1 + i], d = h[(j + 1) * N1 + i + 1];
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v; }
function weightMaps(m) {
  const N = m.N, mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; }, c0 = mk(), c1 = mk(), g0 = c0.getContext('2d'), g1 = c1.getContext('2d'), i0 = g0.createImageData(N, N), i1 = g1.createImageData(N, N);
  for (let c = 0; c < N * N; c++) { const t = m.tile[c], z = m.zs[m.zone[c]].k;
    i0.data[c * 4] = t === 0 ? 255 : 0; i0.data[c * 4 + 1] = t === 1 ? 255 : 0; i0.data[c * 4 + 2] = t === 2 ? 255 : 0; i0.data[c * 4 + 3] = 255;   // meadow, path, water
    i1.data[c * 4] = t === 3 ? 255 : 0; i1.data[c * 4 + 1] = t === 4 ? 255 : 0; i1.data[c * 4 + 2] = t === 5 ? 255 : 0; i1.data[c * 4 + 3] = 255; void z; }   // moss, mud, stone (RGB only: a 2D canvas drops the colour where alpha is 0)
  g0.putImageData(i0, 0, 0); g1.putImageData(i1, 0, 0);
  const t0 = new THREE.CanvasTexture(c0), t1 = new THREE.CanvasTexture(c1); for (const t of [t0, t1]) { t.wrapS = t.wrapT = CLAMP; t.flipY = false; } return [t0, t1];
}
function fogInit(m) { const c = document.createElement('canvas'); c.width = c.height = m.N; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, m.N, m.N);
  TEX.fogC = c; TEX.fogG = g; TEX.fog = new THREE.CanvasTexture(c); TEX.fog.wrapS = TEX.fog.wrapT = CLAMP; TEX.fog.flipY = false; R.fog = new Uint8Array(m.N * m.N); R.fogN = 0; }
function reveal(x, z, rad) {
  const m = R.map, N = m.N, g = TEX.fogG; let n = 0;
  for (let dz = -Math.ceil(rad); dz <= rad; dz++) for (let dx = -Math.ceil(rad); dx <= rad; dx++) { const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz; if (cx < 0 || cz < 0 || cx >= N || cz >= N || dx * dx + dz * dz > rad * rad) continue; const c = cz * N + cx; if (!R.fog[c]) { R.fog[c] = 1; R.fogN++; n++; } }
  if (n) { const gr = g.createRadialGradient(x, z, rad * .55, x, z, rad); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, z, rad, 0, TAU); g.fill(); TEX.fog.needsUpdate = true; mini.dirty = true; }
  return n;
}
function disposeMap() {
  if (!MV.built) return; const keep = new Set(Object.values(GEO).concat([gQ]));
  MV.root.traverse(o => { if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose(); }); mscene.remove(MV.root);
  if (MV.ground) MV.ground.material.dispose(); for (const t of [TEX.w0, TEX.w1, TEX.fog]) if (t) t.dispose(); TEX.w0 = TEX.w1 = TEX.fog = null; freeMats(TMP.map);
  Object.assign(MV, { built: false, ground: null, props: [], spots: [], rj: [], gates: [], birds: null, bfly: null }); VH.h = null;
}
function makeMap() {
  runCheck(); if (R.map) return R.map; const t0 = performance.now();
  R.gates = gateRooms(); const m = genMap(G.seed, R.gates.length); R.map = m; R.rng = mulberry(hash(G.seed + '|maprun|'));
  m.spots.forEach(s => { s.taken = false; s.claimed = false; s.opened = false; s.used = false; s.found = false; if (s.type === 'gate') s.room = R.gates[s.g]; });
  m.camps.forEach(c => { c.beaten = false; c.found = false; c.tries = 0; });
  R.rj = []; spawnRiverJunk(TT.RIVER_JUNK); R.bossSeen = bossesDone();
  buildHeights(m); [TEX.w0, TEX.w1] = weightMaps(m); fogInit(m); buildMapScene(m); R.ms = performance.now() - t0; return m;
}
function spawnRiverJunk(n) {
  const m = R.map, r = R.rng, cells = m.river.cells.filter(([x, z]) => x > 18 && m.water[z * m.N + x] === 1 && !m.bridge[z * m.N + x]); let k = 0;
  for (let t = 0; t < 80 && k < n && cells.length; t++) { const [x, z] = cells[Math.floor(r() * cells.length)]; if (R.rj.some(j => !j.got && Math.hypot(j.x - x, j.z - z) < 6)) continue;
    const lean = LEAN.river; R.rj.push({ x: x + .5, z: z + .5, kind: lean[Math.floor(r() * lean.length)], got: false, ph: r() * TAU, mesh: null }); k++; }
  if (MV.built) R.rj.forEach(j => { if (!j.mesh) { j.mesh = mesh(GEO.rjunk, VC, MV.root); } });
  return k;
}
function buildMapScene(m) {
  regTo = TMP.map; try { buildMapScene0(m); } finally { regTo = null; } }
function buildMapScene0(m) {
  const N = m.N, q = QL(), seg = q.name === 'LOW' ? 64 : 128, root = new THREE.Group(); MV.root = root; mscene.add(root);
  const g = new THREE.PlaneGeometry(N, N, seg, seg); g.rotateX(-PI / 2); g.translate(N / 2, 0, N / 2); const p = g.attributes.position, sh = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = hAt(x, z); p.setY(i, y); sh[i] = Math.max(0, Math.min(.32, (hAt(x - 1.1, z - 1.1) - y) * .55)); }   // the paper layer above casts a soft shadow
  g.setAttribute('aSh', new THREE.BufferAttribute(sh, 1)); g.computeVertexNormals();
  MV.ground = mesh(g, groundMat(), root); MV.ground.name = 'twGround';
  // paper-edge skirt round the map (the sheet's cut edge)
  const sk = mesh(new THREE.BoxGeometry(N + 1.2, 1.2, N + 1.2), regT(new THREE.MeshLambertMaterial({ color: '#cbbd9e' })), root); sk.position.set(N / 2, -.75, N / 2);
  // props: paper trees (moss, some meadow), bushes, stones (stone zone), bridge planks; instanced
  const r = mulberry(hash(G.seed + '|mapprops|')), trees = [], bushes = [], stones = [], planks = [], nT = q.name === 'LOW' ? 140 : 320;
  const clear = (x, z) => { const c = Math.floor(z) * N + Math.floor(x); if (m.water[c] || m.path[c]) return false; for (const s of m.spots) if (Math.hypot(s.x + .5 - x, s.z + .5 - z) < 3.4) return false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const cc = (Math.floor(z) + dz) * N + Math.floor(x) + dx; if (cc >= 0 && cc < N * N && (m.path[cc] || m.water[cc])) return false; } return true; };
  for (let t = 0; t < nT * 6 && trees.length + bushes.length + stones.length < nT * 1.4; t++) { const x = 1 + r() * (N - 2), z = 1 + r() * (N - 2), k = m.zs[m.zone[Math.floor(z) * N + Math.floor(x)]].k; if (!clear(x, z)) continue; const v = r();
    if (k === 'moss' && v < .8 || k === 'edge' && v < .55 || k === 'meadow' && v < .12) trees.push([x, z, .7 + r() * .6, r() * TAU]);
    else if (k === 'stone' && v < .6) stones.push([x, z, .6 + r() * 1.1, r() * TAU]); else if ((k === 'meadow' || k === 'mud') && v < .3) bushes.push([x, z, .6 + r() * .6, r() * TAU]); }
  for (let c = 0; c < N * N; c++) if (m.bridge[c] && m.water[c] && (c % N + ((c / N) | 0)) % 2 === 0) planks.push([c % N + .5, ((c / N) | 0) + .5, 1.8, (c * 37 % 7) / 20]);
  const inst = (geo, list, mat) => { if (!list.length) return null; const im = new THREE.InstancedMesh(geo, mat || VC, list.length); im.userData = { list, geo, shown: -1 }; im.frustumCulled = false; root.add(im); return im; };
  MV.props = [inst(GEO.tree, trees), inst(GEO.bush, bushes), inst(GEO.stoneP, stones), inst(GEO.plank, planks)].filter(Boolean);
  MV.counts = { trees: trees.length, bushes: bushes.length, stones: stones.length, planks: planks.length }; propsReveal(m);
  // spots
  for (const s of m.spots) { const x = s.x + .5, z = s.z + .5, y = hAt(x, z), o = new THREE.Group(); o.position.set(x, y, z); root.add(o); s.o = o;
    if (s.type === 'gate') { const a = mesh(GEO.gate, VC, o); a.position.y = .62; a.rotation.y = PI / 2; s.flap = mesh(GEO.flap, VC, o); s.flap.rotation.y = PI / 2; s.flap.position.set(.05, 0, 0); MV.gates.push(s); }
    else if (s.type === 'junk') { s.pile = mesh(GEO.pile, VC, o); s.pile.scale.setScalar(1.3); }
    else if (s.type === 'heap') { mesh(GEO.heap, VC, o); s.flagM = mesh(GEO.flag, VC, o); s.flagM.position.set(.4, 1, .2); s.flagM.visible = false; }
    else if (s.type === 'chest') { mesh(GEO.chest, VC, o); s.lid = mesh(GEO.lid, VC, o); s.lid.position.set(0, .6, .37); }
    else if (s.type === 'rock') { mesh(GEO.rock, VC, o); }
    else if (s.type === 'pond') { mesh(GEO.dock, VC, o); }
    else if (s.type === 'og') { mesh(GEO.og, VC, o); s.mist = mesh(gQ, glowM('#b8f0c0'), o); s.mist.position.set(0, 1.2, 0); s.mist.scale.set(2.6, 2.2, 1); }
    else if (s.type === 'pool') { const b = mesh(GEO.buoy, VC, o); b.position.set(s.wx - s.x, -.35, s.wz - s.z); s.buoy = b;
      const sw = mesh(new THREE.CircleGeometry(2.2, 28), regT(new THREE.MeshBasicMaterial({ map: swirlTex(), transparent: true, depthWrite: false, color: '#9fd0ff' })), o); sw.rotation.x = -PI / 2; sw.position.set(s.wx - s.x, -.32, s.wz - s.z); s.swirl = sw; }
    s.halo = mesh(gQ, glowM('#ffe7a8'), o); s.halo.position.y = 2.2; s.halo.scale.setScalar(2.4); s.halo.visible = false; }
  R.rj.forEach(j => { j.mesh = mesh(GEO.rjunk, VC, root); });
  for (const c of m.camps) { const o = new THREE.Group(); o.position.set(c.x + .5, hAt(c.x + .5, c.z + .5), c.z + .5); root.add(o); c.o = o; o.visible = !!c.found;
    c.tent = mesh(GEO.tent, VC, o); c.scr = mesh(GEO.scraps, VC, o); c.scr.visible = false; c.mobs = [];
    for (let k = 0; k < TT.CAMP.MOBS[c.guard - 1]; k++) c.mobs.push(mesh(GEO.cmob, VC, o));
    c.halo = mesh(gQ, glowM('#ff9a7a'), o); c.halo.position.y = 2.8; c.halo.scale.setScalar(3); c.halo.visible = false; campLook(c); }
  MV.fogSeen = -1;
  // alive bits: paper birds with shadows, butterflies
  const nb = q.name === 'LOW' ? 4 : 7; MV.birds = { im: new THREE.InstancedMesh(GEO.bird, VC, nb), sh: new THREE.InstancedMesh(new THREE.CircleGeometry(.5, 10), regT(new THREE.MeshBasicMaterial({ color: '#3a2a1a', transparent: true, opacity: .22, depthWrite: false })), nb), d: [] };
  for (let i = 0; i < nb; i++) MV.birds.d.push({ cx: r() * N, cz: r() * N, rr: 10 + r() * 22, sp: (.08 + r() * .1) * (r() < .5 ? -1 : 1), ph: r() * TAU, h: 7 + r() * 4 });
  MV.birds.im.frustumCulled = MV.birds.sh.frustumCulled = false; root.add(MV.birds.im, MV.birds.sh);
  const nf = q.name === 'LOW' ? 10 : 24; MV.bfly = { im: new THREE.InstancedMesh(gQ, regT(new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide })), nf), d: [] }; MV.bfly.im.frustumCulled = false; root.add(MV.bfly.im);
  const bc = ['#ffd37a', '#ff9ab0', '#9fd8ff', '#fff7e6'];
  for (let i = 0, t = 0; i < nf && t < 400; t++) { const x = r() * N, z = r() * N, c = Math.floor(z) * N + Math.floor(x); if (m.tile[c] !== 0) continue; MV.bfly.d.push({ x, z, ph: r() * TAU }); MV.bfly.im.setColorAt(i, _c.set(bc[i % 4])); i++; }
  MV.bfly.im.count = MV.bfly.d.length;
  // the hook rope on the map
  MV.hookL = mesh(gC, regT(new THREE.MeshLambertMaterial({ color: '#d8c49a' })), root); MV.hookL.visible = false;
  MV.crown = bake([[gK, T(0, .2, 0, 0, 0, 0, .55, .4, .55), '#ffd37a'], [gS, T(0, .42, 0, 0, 0, 0, .08, .08, .08), '#d9534f']]);
  MV.built = true;
}
function campLook(c) { if (!c.tent) return; c.tent.visible = !c.beaten; c.scr.visible = !!c.beaten; c.mobs.forEach(o => { o.visible = !c.beaten; }); }
function propsReveal(m) {   // props stand up only where the folded paper has opened (re-run when more of the map opens)
  for (const im of MV.props) { const u = im.userData; let n = 0;
    u.list.forEach(([x, z, s, a]) => { if (!R.fog[Math.floor(z) * m.N + Math.floor(x)]) return; _o.position.set(x, hAt(x, z) + (u.geo === GEO.plank ? .05 : 0), z); _o.rotation.set(0, a, 0); _o.scale.set(s, u.geo === GEO.plank ? 1 : s, s); _o.updateMatrix(); im.setMatrixAt(n++, _o.matrix); });
    if (n !== u.shown) { im.count = n; u.shown = n; im.instanceMatrix.needsUpdate = true; } }
  for (const s of m.spots) if (s.o) s.o.visible = !!s.found;
  for (const c of m.camps) if (c.o) c.o.visible = !!c.found;
}
function swirlTex() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.translate(64, 64);
  for (let i = 0; i < 5; i++) { g.rotate(TAU / 5); g.strokeStyle = 'rgba(20,40,80,.75)'; g.lineWidth = 9; g.beginPath(); for (let t = 0; t < 1; t += .02) { const a = t * 4, rr = t * 58; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke(); }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 64); gr.addColorStop(0, 'rgba(5,15,40,.95)'); gr.addColorStop(1, 'rgba(5,15,40,0)'); g.fillStyle = gr; g.fillRect(-64, -64, 128, 128); return new THREE.CanvasTexture(c); }

/* ======================= map: walking, spots, doors ======================= */
const P = { x: 0, z: 0, head: 0, spd: 0, wph: 0, near: null, hook: null, paused: false, crown: false, panel: null, big: false, fadeIn: 0 };
const BUD = { x: 0, z: 0, head: 0, ph: 0 };
const inp = { down: new Set(), actQ: 0, hookQ: 0, stick: [0, 0], tup: false, tupQ: 0 };
const keyDown = c => inp.down.has(c);
const cellAt = (x, z) => { const N = R.map.N; return Math.max(0, Math.min(N - 1, Math.floor(z))) * N + Math.max(0, Math.min(N - 1, Math.floor(x))); };
function terrainSpeed(c) { const m = R.map; if (m.bridge[c]) return TT.SPEED.bridge; if (m.path[c]) return TT.SPEED.path; const k = m.zs[m.zone[c]].k; return TT.SPEED[k] || 1; }
function tryMove(dx, dz) { const m = R.map, a = cellAt(P.x, P.z), nx = Math.max(.3, Math.min(m.N - .3, P.x + dx)), nz = Math.max(.3, Math.min(m.N - .3, P.z + dz)), b = cellAt(nx, nz);
  if (b === a || canStep(m, a, b)) { P.x = nx; P.z = nz; return true; } return false; }
function enterMap(at) {   // at: { gate } | 'pond' | 'pool'
  const m = makeMap(); R.visits++; G.state = 'map'; P.paused = false; P.big = false; P.hook = null; P.panel = null; P.spd = 0; panelEl.style.display = 'none';
  let s = null; if (at && at.camp) { enterMapAt(m, at.why === 'won' ? [at.camp.x + .5, at.camp.z + .5] : R.campBack, at.camp); return; }
  if (at && at.gate !== undefined) { s = m.spots.find(q => q.type === 'gate' && q.room === at.gate); R.from = { room: at.gate, x: at.x }; if (R.ogOn) { ogOff(); s = m.spots.find(q => q.type === 'og') || s; } }
  else if (at === 'pond') s = m.spots.find(q => q.type === 'pond'); else if (at === 'pool') s = m.spots.find(q => q.type === 'pool'); else if (at === 'og') s = m.spots.find(q => q.type === 'og');
  if (!s) s = m.spots.find(q => q.type === 'gate');
  P.x = s.x + .5 + (s.type === 'gate' ? 2.6 : s.type === 'pond' ? -1.6 : s.type === 'og' ? -2.2 : 0); P.z = s.z + .5;
  if (s.type === 'og' && !walkable(m, cellAt(P.x, P.z))) P.x = s.x + .5;
  if (s.type === 'pool') { const dx = s.x - s.wx, dz = s.z - s.wz, d = Math.hypot(dx, dz) || 1; P.x += dx / d * 1.2; P.z += dz / d * 1.2; if (!walkable(m, cellAt(P.x, P.z))) { P.x = s.x + .5; P.z = s.z + .5; } }
  P.head = 0; reveal(P.x, P.z, TT.REVEAL + 2); s.found = true; if (s.o) s.o.visible = true; P.campArm = null;
  mapOn(at);
}
function enterMapAt(m, xz, camp) { P.x = xz[0]; P.z = xz[1]; P.campArm = camp && !camp.beaten ? camp : null; reveal(P.x, P.z, TT.REVEAL); mapOn({ camp }); }
function mapOn(at) {
  const pl = A.pl, b = A.buddy; mscene.add(pl.root); pl.root.visible = true; pl.root.rotation.set(0, 0, 0); pl.root.scale.setScalar(A.HS * .95); pl.shadow.visible = false; if (pl.g) pl.g.visible = true;
  mscene.add(b.root); b.root.visible = true; b.root.rotation.set(0, 0, 0); BUD.x = P.x - 1.4; BUD.z = P.z + 1;
  for (const gs of MV.gates) gs.flap.visible = !(R.from && gs.room === R.from.room);
  hudEl.style.display = 'flex'; helpEl.style.display = 'block'; miniEl.style.display = 'block'; miniEl.className = ''; touchEl.style.display = isTouch ? 'block' : 'none'; setHelp('map'); setTouch('map');
  A.resetInput(); inp.down.clear(); inp.actQ = inp.hookQ = 0; mini.dirty = true; P.hudKey = '';
  if (!(at && at.camp)) { toast(R.visits === 1 && at && at.gate !== undefined ? 'the paper map: the run clock waits while you are here' : 'the paper map', 2.4); A.sfx(520, .2, 'triangle'); }
}
function leaveMapScene() {   // hero and buddy back to the side scroller's scene (the fishing world takes them from there)
  const pl = A.pl, b = A.buddy; A.scene.add(pl.root); pl.root.rotation.set(0, 0, 0); pl.shadow.visible = true; A.scene.add(b.root); b.init = false; b.root.rotation.set(0, 0, 0); if (P.crownM) P.crownM.visible = false;
  hudEl.style.display = helpEl.style.display = miniEl.style.display = touchEl.style.display = panelEl.style.display = 'none'; msgEl.style.display = 'none'; setPrompt(''); P.panel = null;
}
function toSide() {   // back through your own gate: the forest room you came from, at the gate
  leaveMapScene(); const p = G.p, f = R.from; G.state = 'play'; if (f && G.room !== f.room) { G.room = f.room; A.enterRoom(f.room, null); }
  if (f && f.room === G.room) p.x = f.x; p.y = GY; p.vx = 0; p.vy = 0; p.onGround = true; p.inv = 1.2; p.face = 1; p.hook = null;
  A.resetInput(); inp.down.clear(); G.msg = 'back in the forest'; G.msgT = 1.6;
}
function toFish() {   // the pond door: the fishing world, and back out at the pond
  if (!A.FW || !A.FW.fromMap) { toast('the pond is still frozen', 1.6); return; }
  startFold(() => { leaveMapScene(); if (!A.FW.fromMap(kind => { R.fishBack = (R.fishBack || 0) + 1; R.fishKind = kind; enterMap('pond'); })) enterMap('pond'); });
}
let OG = A.enterOG ? { enterOG: A.enterOG, leaveOG: A.leaveOG, isOG: A.isOG } : null;   // the OG look switch (game.js); setOG() for tests
function ogOff() { if (!R.ogOn) return; R.ogOn = false; R.ogBack = (R.ogBack || 0) + 1; if (OG && typeof OG.leaveOG === 'function') { try { OG.leaveOG(); } catch (e) { /* the look stays */ } } }
function toOG() {   // the hidden spot: the forest side-scroller in the OG look, through the forest-gate return (one set of rules)
  if (!OG || typeof OG.enterOG !== 'function') { toast('the old forest is still asleep', 1.6); return false; }
  if (fold.on || G.camp) return false; let ok = false; try { ok = OG.enterOG(R.from ? R.from.room : 0) !== false; } catch (e) { ok = false; }
  if (!ok) { toast('the old forest would not open', 1.6); return false; }
  R.ogOn = true; R.ogIn = (R.ogIn || 0) + 1; startFold(() => { toSide(); G.msg = 'the old forest: the side-scroller as it was. A map gate brings you back'; G.msgT = 2.6; }); return true;
}
function nearSpot() { const m = R.map; let best = null, bd = TT.ACT_R;
  for (const s of m.spots) { const tx = s.type === 'pond' ? s.x + 1.6 : s.type === 'pool' ? (s.x + s.wx) / 2 : s.x, tz = s.type === 'pool' ? (s.z + s.wz) / 2 : s.z, d = Math.hypot(tx + .5 - P.x, tz + .5 - P.z) - (s.type === 'heap' || s.type === 'rock' ? 1 : 0);
    if (d < bd) { bd = d; best = s; } } return best; }
function spotLabel(s) {
  if (!s) return ''; const k = isTouch ? 'ACT' : 'F';
  switch (s.type) {
    case 'gate': return R.from && s.room === R.from.room ? k + ': back to the forest (room ' + (s.room + 1) + ')' : 'a closed paper flap (room ' + (s.room + 1) + '): leave by the gate you came in';
    case 'junk': return s.left.length ? k + ': dig (' + s.left.length + ' piece' + (s.left.length > 1 ? 's' : '') + ')' : 'an empty junk pile';
    case 'heap': return s.claimed ? 'your flagged scrap heap (a piece after each boss)' : k + ': plant your flag on this scrap heap';
    case 'chest': return s.opened ? 'an open chest' : k + ': open the chest';
    case 'rock': return s.used ? 'the view rock' : k + ': climb the view rock';
    case 'pond': return k + ': the pond (the fishing world)';
    case 'og': return k + ': the old forest (the OG world)';
    case 'pool': return R.map.camps.some(c => c.pool && !c.beaten) ? 'the deep pool (a guarded camp keeps it: beat the camp first)' : k + ': dive into the deep pool';
  } return ''; }
function act() {
  const s = P.near; if (!s || P.panel || fold.on) return false;
  if (s.type === 'gate') { if (R.from && s.room === R.from.room) { startFold(toSide); return true; } toast('closed: this gate opens from its own forest room', 1.6); return false; }
  if (s.type === 'junk') return dig(s);
  if (s.type === 'heap') { if (s.claimed) return false; s.claimed = true; s.flagM.visible = true; A.sfx(700, .08, 'triangle'); toast('flagged: this heap drops a piece in your bag after each boss', 2.2); mini.dirty = true; return true; }
  if (s.type === 'chest') { if (s.opened) return false; openPick(s); return true; }
  if (s.type === 'rock') { if (s.used) return false; s.used = true; const n = reveal(s.x + .5, s.z + .5, TT.ROCK_REVEAL); toast('from the view rock the map unfolds (' + n + ' m²)', 2); A.sfx(880, .2, 'triangle'); return true; }
  if (s.type === 'pond') { toFish(); return true; }
  if (s.type === 'og') return toOG();
  if (s.type === 'pool') { const pc = R.map.camps.find(c => c.pool); if (pc && !pc.beaten) { toast('a guarded camp keeps the deep pool: beat it first', 1.8); A.sfx(160, .1, 'square'); return false; }
    startFold(() => enterDive(s)); return true; }
  return false;
}
function dig(s) {
  if (!s.left.length) return false; const k = s.left[0];
  if (bagFull()) { openSwap(s, k); return true; }
  if (!bagAdd(k)) { toast('your bag is full', 1.4); return false; }
  s.left.shift(); if (!s.left.length) { s.taken = true; s.pile.visible = false; } A.sfx(640, .06, 'triangle'); toast('junk: ' + JUNK[k].n + ' (' + bag().length + '/' + bagMax() + ')', 1.3); mini.dirty = true; return true;
}
/* ---- the swap rule: a full bag shows the new piece next to your bag; drop one, it stays on that pile ---- */
function openSwap(s, k) { P.panel = { kind: 'swap', s, k }; drawPanel(); }
function chooseSwap(i) { const pn = P.panel; if (!pn || pn.kind !== 'swap') return false; const b = bag();
  if (i >= 0 && i < b.length) { const out = b.splice(i, 1)[0]; b.push(pn.k); pn.s.left.shift(); pn.s.left.push(out); toast('swapped: ' + JUNK[out].n + ' stays on the pile', 1.6); A.sfx(520, .06, 'triangle'); }
  closePanel(); return true; }
/* ---- chests: pick 1 of 3 face-down cards (good, funny, bad); the map's own stand-in until chest cards exist ---- */
function openPick(s) { const r = R.rng, o = ['good', 'funny', 'bad']; for (let i = 2; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } P.panel = { kind: 'pick', s, o }; drawPanel(); }
function choosePick(i) { const pn = P.panel; if (!pn || pn.kind !== 'pick' || i < 0 || i > 2) return false; const s = pn.s, o = pn.o[i]; s.opened = true; s.lid.rotation.x = -1.9; R.picks = (R.picks || []).concat(o);
  if (o === 'good') { const lean = LEAN[s.zone] || LEAN.meadow; let n = 0; for (let k = 0; k < 2; k++) if (bagAdd(lean[Math.floor(R.rng() * lean.length)])) n++; toast(n ? 'good: ' + n + ' junk piece' + (n > 1 ? 's' : '') + ' for the bag' : 'good: junk, but your bag is full', 2); }
  else if (o === 'funny') { P.crown = true; toast('funny: a paper crown, just for this visit', 2); }
  else { const b = bag(); if (b.length) { const lost = b.splice(Math.floor(R.rng() * b.length), 1)[0]; toast('bad: a junk rat ran off with your ' + JUNK[lost].n, 2.2); } else toast('bad: a junk rat looked in your empty bag and left', 2.2); }
  A.sfx(o === 'bad' ? 160 : 760, .15, o === 'bad' ? 'sawtooth' : 'triangle'); closePanel(); mini.dirty = true; return true; }
function closePanel() { P.panel = null; panelEl.style.display = 'none'; }
function drawPanel() {
  const pn = P.panel; if (!pn) { panelEl.style.display = 'none'; return; } const n = isTouch ? 'tap' : 'click or press';
  if (pn.kind === 'pick') panelEl.innerHTML = 'THE CHEST: pick one card<div class="row">' + [0, 1, 2].map(i => '<div class="cd" data-i="' + i + '">card ' + (i + 1) + '<br><small>face down</small></div>').join('') + '</div><small>' + n + ' 1, 2 or 3: one is good, one is funny, one is bad</small>';
  else { const b = bag(); panelEl.innerHTML = 'YOUR BAG IS FULL (' + b.length + '/' + bagMax() + ')<div class="row"><div class="cd new">new: ' + JUNK[pn.k].n + '</div></div>drop one to take it (the dropped piece stays on the pile):<div class="row">' +
    b.map((k, i) => '<div class="cd" data-i="' + i + '">' + JUNK[k].n + '</div>').join('') + '</div><div class="row"><div class="cd" data-i="-1">leave it</div></div><small>Esc: leave it</small>'; }
  panelEl.style.display = 'block'; }
panelEl.addEventListener('pointerdown', e => { const t = e.target.closest && e.target.closest('.cd'); if (!t || t.dataset.i === undefined) return; e.preventDefault(); e.stopPropagation(); const i = +t.dataset.i, pn = P.panel; if (!pn) return;
  if (pn.kind === 'pick') choosePick(i); else chooseSwap(i); });
/* ---- the hook on the map: river junk ---- */
function hookMap() {
  if (P.hook || P.panel) return false; let best = null, bd = TT.HOOK_R; for (const j of R.rj) { if (j.got || !R.fog[Math.floor(j.z) * R.map.N + Math.floor(j.x)]) continue; const d = Math.hypot(j.x - P.x, j.z - P.z); if (d < bd) { bd = d; best = j; } }
  if (!best) { toast('nothing to hook here (river junk floats in the river)', 1.2); return false; }
  if (bagFull()) { toast('your bag is full (' + bagMax() + '/' + bagMax() + ')', 1.4); return false; }
  P.hook = { j: best, t: 0, sx: best.x, sz: best.z }; P.head = Math.atan2(-(best.z - P.z), best.x - P.x); A.sfx(300, .08, 'square'); return true;
}
function stepHook(dt) { const h = P.hook; if (!h) return; h.t += dt; const u = Math.min(1, h.t / .45); h.j.x = lerp(h.sx, P.x, u * u); h.j.z = lerp(h.sz, P.z, u * u);
  if (u >= 1) { if (bagAdd(h.j.kind)) { h.j.got = true; R.rjGot = (R.rjGot || 0) + 1; toast('river junk: ' + JUNK[h.j.kind].n + ' (' + bag().length + '/' + bagMax() + ')', 1.3); A.sfx(640, .06, 'triangle'); } P.hook = null; } }
/* ---- refill after each boss (the "day"): flagged heaps drop a piece each, 2 river-junk pieces wash up; piles stay taken ---- */
function refillCheck() {
  if (!R.map) { R.bossSeen = Math.max(R.bossSeen, bossesDone()); return; }
  const n = bossesDone(); while (R.bossSeen < n) { R.bossSeen++; R.refills++; let got = 0, heaps = 0;
    for (const s of R.map.spots) if (s.type === 'heap' && s.claimed) { heaps++; const lean = LEAN[s.zone] || LEAN.mud; if (bagAdd(lean[Math.floor(R.rng() * lean.length)])) got++; }
    const w = spawnRiverJunk(TT.REFILL_RIVER); R.lastRefill = { heaps, got, river: w };
    if (heaps || w) { const s = (heaps ? 'your flagged heaps sent ' + got + ' piece' + (got === 1 ? '' : 's') : '') + (heaps && w ? '; ' : '') + (w ? w + ' river junk washed up on the map' : ''); if (G.state === 'play') { G.msg = s; G.msgT = 2.2; } else toast(s, 2.2); } }
}
function stepMap(dt) {
  if (P.panel) { inp.actQ = inp.hookQ = 0; return; }
  const m = R.map; let fx = (keyDown('KeyD') || keyDown('ArrowRight') ? 1 : 0) - (keyDown('KeyA') || keyDown('ArrowLeft') ? 1 : 0), fz = (keyDown('KeyS') || keyDown('ArrowDown') ? 1 : 0) - (keyDown('KeyW') || keyDown('ArrowUp') ? 1 : 0);
  let run = keyDown('ShiftLeft') || keyDown('ShiftRight'); if (inp.stick[0] || inp.stick[1]) { fx = inp.stick[0]; fz = inp.stick[1]; if (Math.hypot(fx, fz) > .92) run = true; }
  const l = Math.min(1, Math.hypot(fx, fz)), c = cellAt(P.x, P.z), sp = TT.WALK * terrainSpeed(c) * (run ? TT.RUN : 1);
  P.spd = hold(P.spd, l > .1 ? sp * l : 0, dt, 10);
  if (l > .1 && !P.hook) { const ux = fx / Math.hypot(fx, fz), uz = fz / Math.hypot(fx, fz); P.head += angD(Math.atan2(-uz, ux), P.head) * Math.min(1, dt * 12);
    const st = P.spd * dt; if (!tryMove(ux * st, uz * st)) { if (!tryMove(ux * st, 0) && !tryMove(0, uz * st)) P.bumps = (P.bumps || 0) + 1; } }
  if (Math.hypot(P.x - (P.rx || 0), P.z - (P.rz || 0)) > .7) { P.rx = P.x; P.rz = P.z; reveal(P.x, P.z, TT.REVEAL); }
  for (const s of m.spots) if (!s.found && R.fog[s.z * m.N + s.x]) { s.found = true; mini.dirty = true; if (s.o) s.o.visible = true; }
  for (const c of m.camps) if (!c.found && R.fog[c.z * m.N + c.x]) { c.found = true; mini.dirty = true; if (c.o) c.o.visible = true; }
  if (P.campArm && Math.hypot(P.campArm.x + .5 - P.x, P.campArm.z + .5 - P.z) > TT.CAMP.REARM) P.campArm = null;
  let cp = null, cd = TT.CAMP.PROMPT; for (const c of m.camps) { if (c.beaten) continue; const d = Math.hypot(c.x + .5 - P.x, c.z + .5 - P.z); if (d < cd) { cd = d; cp = c; } }
  P.camp = cp; if (cp && cd < TT.CAMP.R && P.campArm !== cp && !P.hook) { startCamp(cp); return; }
  P.near = nearSpot(); setPrompt(P.hook ? '' : cp ? 'a guarded camp (strength ' + cp.guard + ', ' + TT.CAMP.MOBS[cp.guard - 1] + ' flyers): walk in to fight' + (P.campArm === cp ? ' (step back first)' : '') : spotLabel(P.near));
  while (inp.actQ > 0) { inp.actQ--; act(); } while (inp.hookQ > 0) { inp.hookQ--; hookMap(); }
  stepHook(dt);
  // buddy follows
  const bx = P.x - Math.cos(P.head) * 1.5 + Math.sin(P.head) * .8, bz = P.z + Math.sin(P.head) * 1.5 + Math.cos(P.head) * .8, dx = bx - BUD.x, dz = bz - BUD.z, d = Math.hypot(dx, dz);
  BUD.mv = d > .25 ? Math.min(1, d / 1.2) : 0; if (d > 14) { BUD.x = bx; BUD.z = bz; } else if (d > .05) { BUD.x += dx * Math.min(1, dt * 3.5); BUD.z += dz * Math.min(1, dt * 3.5); if (d > .25) BUD.head = Math.atan2(-dz, dx); }
}
const angD = (a, b) => { let d = a - b; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };

/* ======================= camps: a one-screen side-scroll fight in the run's own engine ======================= */
function campFlyers(c) {
  const r = mulberry(hash(G.seed + '|campfly|' + c.id + '|' + c.tries)), FL = A.FL, kinds = Object.keys(FL.KINDS), ranks = TT.CAMP.RANKS[c.guard - 1], n = ranks.length, out = [];
  for (let j = 0; j < n; j++) { const kind = kinds[Math.floor(r() * kinds.length)], x = TT.CAMP.X[0] + (TT.CAMP.X[1] - TT.CAMP.X[0]) * (n === 1 ? .5 : j / (n - 1)) + (r() - .5) * 16, y = lerp(FL.Y_MIN, FL.Y_MAX, r());
    out.push(A.mkFlyer(kind, ranks[j], x, y, 'camp' + c.id + ':' + j)); }
  return out;
}
function startCamp(c) {
  if (fold.on || G.camp) return false; c.tries = (c.tries || 0) + 1; R.campBack = [P.x - Math.cos(P.head) * 2.4, P.z + Math.sin(P.head) * 2.4]; R.camps = (R.camps || 0) + 1;
  if (!walkable(R.map, cellAt(R.campBack[0], R.campBack[1]))) R.campBack = [P.x, P.z];
  setPrompt(''); side.near = false; A.sfx(200, .2, 'sawtooth');
  startFold(() => {
    leaveMapScene(); const rooms = G.world.rooms, room = A.genRoom(G.seed + '|camp|' + c.id + '|' + c.tries, A.ROOMS, 'camp', false); room.logs = false; room.camp = true;
    rooms.length = A.ROOMS; rooms.push(room); G.camp = { c, flee: false, end: null, t: 0, lives0: G.lives }; G.state = 'play';
    const p = G.p; Object.assign(p, { x: TT.CAMP.X0, y: GY, vx: 0, vy: 0, onGround: true, dead: 0, inv: 1.2, hook: null, face: 1, vine: null, grab: null });
    A.enterRoom(A.ROOMS, 'L'); G.rs.flyers = campFlyers(c); A.resetInput();
    G.msg = 'a guarded camp: ' + G.rs.flyers.length + ' flyers. Jump on them, kick them, hook them. Out the left side to flee'; G.msgT = 2.8;
  });
  return true;
}
function campStep() {   // runs after game.js update(), in 'play', while G.camp is set
  const gc = G.camp, p = G.p; if (!gc || (fold.on && !fold.done) || gc.end || G.freeze) return; gc.t += STEP;   // checks run from the moment the page has turned
  if (G.msg && / \+0$/.test(G.msg)) G.msg = G.msg.replace(/ \+0$/, '');   // no points in a camp, so no "+0" on a kill   // checks run from the moment the page has turned
  // the hook is the run's own (game.js hookAim/hookStep): small flyers are pulled down and stunned, big ones ridden, as in every room
  if (fold.on) return;   // the page is still unfolding: the way out waits for it (a lost life is counted, so it cannot be missed)
  if (G.lives < gc.lives0) { gc.end = G.lives > 0 ? 'lost' : 'over'; if (gc.end === 'lost') { G.state = 'mapin'; startFold(() => leaveCamp('lost')); } return; }   // at 0 lives the run ends as usual (game.js); campTidy() then clears the camp
  if (gc.flee) { gc.end = 'flee'; G.state = 'mapin'; startFold(() => leaveCamp('flee')); return; }   // 'mapin': the fight stands still under the exit fold
  if (gc.t > .3 && !G.rs.flyers.some(f => f.st !== 'dead')) { gc.end = 'won'; G.state = 'mapin'; G.msg = 'the camp is beaten!'; G.msgT = 1.6; A.sfx(880, .25, 'triangle'); startFold(() => leaveCamp('won')); }
}
function campTidy() {   // every way out of a camp: the extra room off, the side room back, a shield dropped in the camp back on his back
  const f = R.from; G.camp = null; if (G.world && G.world.rooms.length > A.ROOMS) G.world.rooms.length = A.ROOMS;
  if (G.room >= A.ROOMS) { G.room = f && f.room < A.ROOMS ? f.room : 0; if (G.state === 'play' || G.state === 'mapin') A.enterRoom(G.room, null); }
  if (G.drop && G.drop.room >= A.ROOMS) { G.drop = null; if (G.p) G.p.shield = true; }
}
function leaveCamp(why) {
  const gc = G.camp; if (!gc) return; const c = gc.c, p = G.p, f = R.from; campTidy();
  Object.assign(p, { dead: 0, inv: 1.2, vx: 0, vy: 0, y: GY, onGround: true, hook: null, vine: null, grab: null }); if (f) p.x = f.x;
  let loot = 0; if (why === 'won') { c.beaten = true; campLook(c); const lean = LEAN[R.map.zs[R.map.zone[c.z * R.map.N + c.x]].k] || LEAN.meadow, r = mulberry(hash(G.seed + '|camploot|' + c.id));
    for (let k = 0; k < TT.CAMP.LOOT[c.guard - 1]; k++) if (bagAdd(lean[Math.floor(r() * lean.length)])) loot++; }
  R.campLog = (R.campLog || []).concat({ id: c.id, why, loot }); mini.dirty = true;
  enterMap({ camp: c, why });
  toast(why === 'won' ? 'the camp tears away' + (loot ? ': ' + loot + ' junk piece' + (loot > 1 ? 's' : '') + ' for the bag' : ' (your bag is full)') + (c.pool ? '. The deep pool is open' : '') :
    why === 'flee' ? 'you got away: the camp is still there, its flyers healed' : 'knocked out of the camp: one life lost', 2.6);
}

/* ======================= the code minimap (and the whole map on M / Tab) ======================= */
const mini = { dirty: true, t: 0, g: miniEl.getContext('2d'), im: null };
const MCOL = { 0: [143, 179, 90], 1: [216, 185, 138], 2: [92, 159, 192], 3: [95, 138, 74], 4: [138, 100, 72], 5: [167, 163, 154] };
const SPOTC = { og: '#9fe3a0', gate: '#efe6d2', junk: '#8a6448', heap: '#5a4a3a', chest: '#c9a24a', rock: '#6a665c', pond: '#2a6fa0', pool: '#0b2a4a' };
function drawMini(dt) {
  mini.t -= dt; if (!mini.dirty && mini.t > 0) return; mini.t = .25; mini.dirty = false; const m = R.map, N = m.N, g = mini.g; if (!mini.im) mini.im = g.createImageData(N, N); const d = mini.im.data;
  for (let c = 0; c < N * N; c++) { const k = c * 4; if (R.fog[c]) { const col = MCOL[m.tile[c]], s = 1 - m.layer[c] * .05; d[k] = col[0] * s; d[k + 1] = col[1] * s; d[k + 2] = col[2] * s; } else { d[k] = 236; d[k + 1] = 228; d[k + 2] = 208; } d[k + 3] = 255; }
  g.putImageData(mini.im, 0, 0);
  for (const s of m.spots) { if (!s.found) continue; g.fillStyle = SPOTC[s.type]; const done = s.type === 'junk' && s.taken || s.type === 'chest' && s.opened; g.globalAlpha = done ? .35 : 1; g.fillRect(s.x - 2, s.z - 2, 5, 5);
    if (s.type === 'heap' && s.claimed) { g.fillStyle = '#d9534f'; g.fillRect(s.x + 1, s.z - 4, 3, 3); } if (s.type === 'gate' && R.from && s.room === R.from.room) { g.strokeStyle = '#d9894a'; g.strokeRect(s.x - 3.5, s.z - 3.5, 8, 8); } }
  for (const c of m.camps) { if (!c.found) continue; g.globalAlpha = c.beaten ? .35 : 1; g.fillStyle = '#d9534f'; g.beginPath(); g.moveTo(c.x, c.z - 4); g.lineTo(c.x + 4, c.z + 3); g.lineTo(c.x - 4, c.z + 3); g.closePath(); g.fill(); }
  g.globalAlpha = 1; for (const j of R.rj) if (!j.got && R.fog[Math.floor(j.z) * N + Math.floor(j.x)]) { g.fillStyle = '#a9b2b8'; g.fillRect(j.x - 1, j.z - 1, 3, 3); }
  g.fillStyle = '#d9534f'; g.beginPath(); g.arc(P.x, P.z, 3, 0, TAU); g.fill(); g.strokeStyle = '#3f2616'; g.lineWidth = 1; g.stroke();
}
function toggleBig() { P.big = !P.big; miniEl.className = P.big ? 'big' : ''; mini.dirty = true; }
miniEl.addEventListener('pointerdown', e => { if (G.state !== 'map') return; e.preventDefault(); e.stopPropagation(); toggleBig(); });

/* ======================= map: rendering ======================= */
function poseHero(dt, swim) {
  const pl = A.pl, Rr = (o, k, v, r) => { o.rotation[k] = hold(o.rotation[k], v, dt, r || 24); }, mv = swim ? Math.min(1, Math.hypot(D.vx, D.vy) / 3) : Math.min(1, P.spd / TT.WALK), t = A.VT();
  P.wph += dt * (swim ? 7 + mv * 5 : P.spd * 1.5); const s = Math.sin(P.wph), br = Math.sin(t * 2.4);
  let ll = s * mv, lr = -s * mv, al = -s * mv + br * .05, ar = s * mv * .6, lean = -.14 * mv; const bob = Math.abs(Math.cos(P.wph)) * .12 * mv;
  if (swim) { ll = .25 + s * .45; lr = .25 - s * .45; al = 2.6 + Math.sin(P.wph * .5) * .3; ar = 2.6 - Math.sin(P.wph * .5) * .3; lean = -.25 - mv * .3; }
  if (P.hook && !swim) { ar = 1.4; }
  Rr(pl.legL, 'z', ll); Rr(pl.legR, 'z', lr); Rr(pl.ankL, 'z', -ll * .5); Rr(pl.ankR, 'z', -lr * .5); Rr(pl.armL, 'z', al); Rr(pl.armR, 'z', ar);
  Rr(pl.bod, 'z', lean, 12); pl.bod.position.y = (pl.bod.userData.y0 === undefined ? (pl.bod.userData.y0 = pl.bod.position.y) : pl.bod.userData.y0) + (swim ? 0 : bob + br * .015);
  if (pl.sprout) pl.sprout.rotation.z = Math.sin(t * 3.3) * .12 + (mv > .1 ? Math.sin(P.wph * 2) * .1 : 0);
}
function renderMap(dt) {
  const pl = A.pl, b = A.buddy, t = A.VT(); GU.uTime.value = t;
  pl.root.position.set(P.x, hAt(P.x, P.z), P.z); pl.root.rotation.set(0, P.head, 0); pl.root.visible = true; poseHero(dt, false);
  if (P.crown) { if (!P.crownM) { P.crownM = mesh(MV.crown, VC); } if (P.crownM.parent !== pl.head) pl.head.add(P.crownM); P.crownM.visible = true; P.crownM.position.set(0, .62, 0); } else if (P.crownM) P.crownM.visible = false;
  b.root.position.set(BUD.x, hAt(BUD.x, BUD.z), BUD.z); b.root.rotation.set(0, BUD.head, 0); b.ph = (b.ph || 0) + dt * 9 * (BUD.mv || 0); A.poseBuddy(b, dt, { mv: BUD.mv || 0, air: 0, look: .3, lookAmt: .4, wave: 0, deep: 0 });
  mcam.aspect = A.camera.aspect; mcam.fov = TT.CAM.FOV; mcam.updateProjectionMatrix();
  const cx = P.x, cz = P.z, cy = hAt(cx, cz); mcam.position.set(cx, cy + TT.CAM.H, cz + TT.CAM.BACK); mcam.lookAt(cx, cy, cz - 1.5); mcam.updateMatrixWorld();
  msun.position.set(cx - 30, 50, cz - 20); msun.target.position.set(cx, 0, cz);
  const q = mcam.quaternion;
  for (const s of R.map.spots) { const near = s === P.near; if (s.halo) { s.halo.visible = near && !P.panel; if (near) { s.halo.quaternion.copy(q); s.halo.material.opacity = .5 + Math.sin(t * 4) * .2; } }
    if (s.swirl) s.swirl.rotation.z = t * .8; if (s.mist) { s.mist.quaternion.copy(q); s.mist.material.opacity = .35 + Math.sin(t * 1.3) * .15; } if (s.buoy) s.buoy.position.y = -.35 + Math.sin(t * 1.7) * .08; }
  for (const c of R.map.camps) { if (!c.o || !c.o.visible) continue; c.halo.visible = c === P.camp && !c.beaten; if (c.halo.visible) { c.halo.quaternion.copy(q); c.halo.material.opacity = .45 + Math.sin(t * 5) * .2; }
    if (!c.beaten) c.mobs.forEach((o, k) => { const a = t * (.9 + c.guard * .15) + k * TAU / c.mobs.length; o.position.set(Math.cos(a) * 2.1, 1.3 + Math.sin(t * 3 + k) * .25, Math.sin(a) * 2.1); o.rotation.set(0, -a - PI / 2, Math.sin(t * 14 + k) * .25); }); }
  for (const j of R.rj) { if (!j.mesh) continue; j.mesh.visible = !j.got && !!R.fog[Math.floor(j.z) * R.map.N + Math.floor(j.x)]; if (!j.got) { j.mesh.position.set(j.x, hAt(j.x, j.z) + .1 + Math.sin(t * 1.6 + j.ph) * .06, j.z); j.mesh.rotation.set(Math.sin(t + j.ph) * .15, t * .3 + j.ph, 0); } }
  const h = P.hook; MV.hookL.visible = !!h; if (h) { const hx = P.x, hz = P.z, hy = hAt(P.x, P.z) + 1.1, jx = h.j.x, jz = h.j.z, jy = hAt(jx, jz) + .2; _v.set(hx, hy, hz); _v2.set(jx, jy, jz); const L = _v.distanceTo(_v2);
    MV.hookL.position.copy(_v).add(_v2).multiplyScalar(.5); MV.hookL.quaternion.setFromUnitVectors(new V3(0, 1, 0), _v2.sub(_v).normalize()); MV.hookL.scale.set(.05, L, .05); }
  const B = MV.birds; B.d.forEach((d, i) => { const a = d.ph + t * d.sp, x = d.cx + Math.cos(a) * d.rr, z = d.cz + Math.sin(a) * d.rr, fl = Math.sin(t * 9 + i) * .5;
    _o.position.set(x, d.h, z); _o.rotation.set(0, -a + (d.sp > 0 ? 0 : PI), fl * .3); _o.scale.set(1 + fl * .1, 1, 1); _o.updateMatrix(); B.im.setMatrixAt(i, _o.matrix);
    _o.position.set(x + 3, hAt(x + 3, z + 2) + .06, z + 2); _o.rotation.set(-PI / 2, 0, 0); _o.scale.set(1.3, .7, 1); _o.updateMatrix(); B.sh.setMatrixAt(i, _o.matrix); });
  B.im.instanceMatrix.needsUpdate = B.sh.instanceMatrix.needsUpdate = true;
  const F2 = MV.bfly; F2.d.forEach((d, i) => { const x = d.x + Math.sin(t * .4 + d.ph) * 2, z = d.z + Math.cos(t * .33 + d.ph) * 2, fl = Math.abs(Math.sin(t * 14 + d.ph));
    _o.position.set(x, hAt(x, z) + .8 + Math.sin(t * 2 + d.ph) * .25, z); _o.rotation.set(-PI / 2, 0, t + d.ph); _o.scale.set(.22, .14 + fl * .1, 1); _o.updateMatrix(); F2.im.setMatrixAt(i, _o.matrix); });
  F2.im.instanceMatrix.needsUpdate = true;
  A.renderer.render(mscene, mcam); R.calls = A.renderer.info.render.calls; R.tris = A.renderer.info.render.triangles;
  if (MV.propT === undefined || (MV.propT -= dt) <= 0) { MV.propT = .25; if (MV.fogSeen !== R.fogN) { MV.fogSeen = R.fogN; propsReveal(R.map); } }
  drawMini(dt); drawHud();
}
function drawHud() {
  const k = G.state + '|' + bag().length + '|' + flagsN() + '|' + (R.map ? R.map.camps.filter(c => c.beaten).length : 0) + '|' + (P.paused ? 1 : 0) + '|' + (G.state === 'dive' ? Math.round(D.air) + '|' + D.room : '') + '|' + (R.fogN >> 6);
  if (P.hudKey === k) return; P.hudKey = k; const pz = P.paused ? ' (PAUSED - P)' : '';
  if (G.state === 'dive') hudEl.innerHTML = '<span><b>THE DEEP POOL</b>' + pz + '</span><span>room ' + (D.room + 1) + '/3</span><span>air <span class="air"><i style="width:' + Math.max(0, D.air).toFixed(0) + '%"></i></span></span><span>bag ' + bag().length + '/' + bagMax() + '</span><span>run clock waits</span>';
  else hudEl.innerHTML = '<span><b>THE PAPER MAP</b>' + pz + '</span><span>bag ' + bag().length + '/' + bagMax() + '</span><span>flags ' + flagsN() + '</span><span>camps ' + (R.map ? R.map.camps.filter(c => c.beaten).length + '/' + R.map.camps.length : '0/0') + '</span><span>explored ' + Math.round(100 * R.fogN / (TT.N * TT.N)) + '%</span><span>run clock waits</span>';
}
const flagsN = () => R.map ? R.map.spots.filter(s => s.type === 'heap' && s.claimed).length : 0;

/* ======================= the DEEP DIVE (3 side-view rooms going down) ======================= */
const dscene = new THREE.Scene(), dcam = new THREE.PerspectiveCamera(50, 16 / 9, .3, 200);
const DFOG = '#17546a'; dscene.background = new THREE.Color(DFOG); dscene.fog = new THREE.FogExp2(DFOG, .034);
const dhemi = new THREE.HemisphereLight('#9fe3ff', '#0b2a3a', 1.3), dsun = new THREE.DirectionalLight('#d8f4ff', 1.2); dsun.position.set(-8, 30, 14); dscene.add(dhemi, dsun);
const dsky = new THREE.Mesh(new THREE.SphereGeometry(120, 20, 10), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uY: { value: 0 } },
  vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform float uY; varying vec3 vD; void main(){ float h=clamp(vD.y*.5+.5,0.,1.), d=clamp(-uY/48.,0.,1.); vec3 top=mix(vec3(.36,.72,.8),vec3(.1,.33,.45),d), bot=mix(vec3(.08,.3,.4),vec3(.02,.08,.14),d); gl_FragColor=vec4(mix(bot,top,smoothstep(.2,.8,h)),1.); }' }));
dsky.frustumCulled = false; dsky.renderOrder = -10; dscene.add(dsky);
const D = { built: false, key: '', room: 0, rooms: [], x: 2, y: -1.5, vx: 0, vy: 0, face: 1, air: 100, inv: 0, hook: null, t: 0, chest: false, current: false, exit: null, hits: 0, strokes: 0, got: 0, art: null, layers: [] };
const DW = TT.DIVE.W, DH = TT.DIVE.H;
function floorAt(rm, x) { const f = rm.floor, u = Math.max(0, Math.min(f.length - 1.001, x / DW * (f.length - 1))), i = Math.floor(u); return lerp(f[i], f[i + 1], u - i); }
function ceilAt(rm, x) { return rm.k === 0 ? .2 : -.9 - Math.max(0, Math.sin(x * .4 + rm.k) * .4); }
function buildDive(seed) {
  const key = seed + '|dive|'; if (D.key === key && D.built) return; disposeDive(); regTo = TMP.dive; try { buildDive0(key); } finally { regTo = null; } setDiveArt(D.art); deepArt(); }
function buildDive0(key) {
  D.key = key; const r = mulberry(hash(key)), DV = TT.DIVE;
  D.root = new THREE.Group(); dscene.add(D.root); D.rooms = [];
  const sandM = regT(new THREE.MeshLambertMaterial({ vertexColors: true })), rockM = regT(new THREE.MeshLambertMaterial({ color: '#2f5a5e', flatShading: true })), kelpM = regT(new THREE.MeshLambertMaterial({ color: '#3f8a4a' }));
  for (let k = 0; k < 3; k++) {
    const rm = { k, floor: new Float32Array(73), caches: [], rings: [], mobs: [], g: new THREE.Group() }; D.root.add(rm.g); rm.g.visible = false;
    const base = -DH + 1.2 + (k === 2 ? -.5 : 0), o = r() * 50; for (let i = 0; i < 73; i++) { const x = i / 72 * DW; rm.floor[i] = base + fbm(x * .12 + o, k * 3) * 3.4 + Math.sin(x * .3 + o) * .5 + (k === 0 && x < 8 ? 1.4 : 0); }
    // seabed: a top band you see from the side and a front skirt
    const sg = new THREE.PlaneGeometry(DW, 7, 72, 6); sg.rotateX(-PI / 2); sg.translate(DW / 2, 0, -1.5); const sp = sg.attributes.position, sc = new Float32Array(sp.count * 3);
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), z = sp.getZ(i), y = floorAt(rm, x) + fbm(x * .5, z * .5 + k) * .5 - .2; sp.setY(i, y); _c.set('#c9b48a').lerp(new THREE.Color('#7a6a52'), Math.max(0, Math.min(1, fbm(x * .3, z * .3) * 1.4 - .3))); sc.set([_c.r, _c.g, _c.b], i * 3); }
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3)); sg.computeVertexNormals(); mesh(sg, sandM, rm.g);
    const fs = new THREE.PlaneGeometry(DW, 1, 72, 1); const fp = fs.attributes.position, fc = new Float32Array(fp.count * 3);
    for (let i = 0; i < fp.count; i++) { const x = fp.getX(i) + DW / 2, top = fp.getY(i) > 0; fp.setXYZ(i, x, top ? floorAt(rm, x) - .25 : -DH - 8, 2); _c.set(top ? '#8a7656' : '#3a3226'); fc.set([_c.r, _c.g, _c.b], i * 3); }
    fs.setAttribute('color', new THREE.BufferAttribute(fc, 3)); fs.computeVertexNormals(); rm.skirt = mesh(fs, sandM, rm.g);
    // back wall rocks and (below the first room) a rock ceiling
    rm.wall = new THREE.Group(); rm.g.add(rm.wall); for (let i = 0; i < 9; i++) { const rk = mesh(gI, rockM, rm.wall); rk.position.set(i * 4.5 + r() * 2, floorAt(rm, i * 4.5) + 2 + r() * 6, -6.5 - r() * 2); rk.scale.set(5 + r() * 4, 7 + r() * 6, 3); }
    if (k > 0) for (let i = 0; i < 10; i++) { const rk = mesh(gI, rockM, rm.g); rk.position.set(i * 4 + r() * 1.5, .9 + r() * .6, -1 + r() * 2); rk.scale.set(5, 2.6 + r() * 1.5, 6); }
    // kelp
    const nk = 14, km = new THREE.InstancedMesh(gB, kelpM, nk * 4); rm.kelp = { im: km, d: [] }; rm.g.add(km); km.frustumCulled = false;
    for (let i = 0; i < nk; i++) { const x = 1 + r() * (DW - 2), z = -3 + r() * 2.5; rm.kelp.d.push({ x, z, y: floorAt(rm, x), h: 2.2 + r() * 3.2, ph: r() * TAU }); }
    // gold rings for the hook, junk crates, critters
    for (let i = 0; i < 2; i++) { const x = 8 + i * 15 + r() * 6, y = Math.max(floorAt(rm, x) + 3.5, -DH + 6) + r() * 3; const rg = mesh(gTo, regT(new THREE.MeshLambertMaterial({ color: '#e8c14a', emissive: '#5a4210' })), rm.g); rg.position.set(x, Math.min(y, -2), 0); rm.rings.push({ x, y: rg.position.y, m: rg }); }
    for (let i = TT.DIVE.CACHES[0] + Math.floor(r() * (TT.DIVE.CACHES[1] - TT.DIVE.CACHES[0] + 1)); i > 0; i--) { const x = 4 + r() * (DW - 10), kind = LEAN.deep[Math.floor(r() * LEAN.deep.length)];
      const cm = mesh(bake([[gB, T(0, .3, 0, 0, .3, .1, .9, .6, .7), '#6a4a2a'], [gB, T(0, .3, .36, 0, .3, .1, .92, .1, .02), '#c9a24a'], [gS, T(.2, .7, 0, 0, 0, 0, .3, .3, .3), JUNK[kind].c]]), VC, rm.g);
      rm.caches.push({ x, y: floorAt(rm, x) + .1, kind, got: false, m: cm, fly: 0 }); cm.position.set(x, floorAt(rm, x) + .1, 0); }
    const kinds = k === 0 ? ['jelly'] : k === 1 ? ['lantern', 'jelly'] : ['eel', 'lantern'];
    kinds.forEach((kd, i) => { const g = new THREE.Group(); rm.g.add(g); const x0 = 10 + i * 14 + r() * 4, y0 = Math.max(floorAt(rm, x0) + 3, -DH + 5) + r() * 2;
      if (kd === 'jelly') { mesh(bake([[gS, T(0, 0, 0, 0, 0, 0, 1.1, .7, 1.1), '#e8a8d8'], [gB, T(-.3, -.6, 0, 0, 0, .1, .06, .9, .06), '#e8a8d8'], [gB, T(.3, -.6, 0, 0, 0, -.1, .06, .9, .06), '#e8a8d8'], [gB, T(0, -.7, .3, .1, 0, 0, .06, 1, .06), '#d898c8']]), regT(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: .75, emissive: '#5a2a50' })), g); }
      else if (kd === 'lantern') { mesh(bake([[gS, T(0, 0, 0, 0, 0, 0, 1.4, .9, .8), '#3a3a4a'], [gK, T(-.8, 0, 0, 0, 0, PI / 2, .6, .6, .3), '#2a2a3a'], [gB, T(.6, -.15, 0, 0, 0, .3, .5, .08, .5), '#e8e0d0'], [gC, T(.5, .7, 0, 0, 0, -.6, .04, .8, .04), '#3a3a4a'], [gS, T(.3, .3, .3, 0, 0, 0, .15, .15, .1), '#ffd37a']]), VC, g);
        const lu = mesh(gQ, glowM('#ffe08a'), g); lu.position.set(.85, 1, .1); lu.scale.setScalar(1.4); g.userData.lure = lu; }
      else { for (let s = 0; s < 7; s++) { const e = mesh(gS, regT(new THREE.MeshLambertMaterial({ color: s ? '#4a6a3a' : '#5a7a4a' })), g); e.scale.setScalar(.7 - s * .06); e.userData.s = s; } }
      rm.mobs.push({ kind: kd, x0, y0, ph: r() * TAU, g, x: x0, y: y0 }); });
    if (k === 2) {   // the sunken wreck with its chest, and the current that carries you back up (shows once the chest is open)
      const wx = 25, wy = floorAt(rm, wx); D.wreck = { x: wx, y: wy };
      mesh(bake([[gB, T(0, 1, 0, 0, 0, .12, 9, 2.2, 3), '#5a4632'], [gB, T(-3.6, 2.4, 0, 0, 0, .5, 2.6, 1.2, 3), '#4a3a28'], [gC, T(1, 4.4, 0, 0, 0, .25, .3, 6, .3), '#4a3a28'], [gB, T(1.6, 6, .2, 0, 0, .25, 2.4, 1.6, .05), '#c7b48a'],
        [gB, T(2, 1.2, 1.55, 0, 0, .12, 1, 1, .1), '#1a1410'], [gB, T(-1.2, 1.1, 1.55, 0, 0, .12, .9, .9, .1), '#1a1410']]), VC, rm.g).position.set(wx, wy - .4, -2.4);
      const ch = new THREE.Group(); ch.position.set(wx - 3, floorAt(rm, wx - 3), .6); rm.g.add(ch); mesh(GEO.chest, VC, ch); D.lid = mesh(GEO.lid, VC, ch); D.lid.position.set(0, .6, .37); D.chestAt = { x: wx - 3, y: floorAt(rm, wx - 3) + .4 };
      D.curM = mesh(new THREE.CircleGeometry(1.6, 24), regT(new THREE.MeshBasicMaterial({ map: swirlTex(), transparent: true, depthWrite: false, color: '#bff0ff', blending: THREE.AdditiveBlending })), rm.g); D.curM.position.set(33, floorAt(rm, 33) + 2, .2); D.curM.visible = false; D.curAt = { x: 33, y: floorAt(rm, 33) + 2 }; }
    D.rooms.push(rm); }
  // light shafts and bubbles (shared, follow the camera)
  D.shafts = []; for (let i = 0; i < 5; i++) { const s = mesh(gQ, regT(new THREE.MeshBasicMaterial({ map: glowTex, color: '#d8f8ff', transparent: true, opacity: .12, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), D.root); s.userData = { ox: i * 8 - 16, w: 2.5 + r() * 3, ph: r() * TAU }; D.shafts.push(s); }
  D.bub = new THREE.InstancedMesh(gS, regT(new THREE.MeshBasicMaterial({ color: '#dff8ff', transparent: true, opacity: .55, depthWrite: false })), 40); D.bub.frustumCulled = false; D.root.add(D.bub); D.bubD = [];
  D.hookM = mesh(gC, regT(new THREE.MeshLambertMaterial({ color: '#d8c49a' })), D.root); D.hookM.visible = false;
  D.built = true;
}
function disposeDive() { if (!D.built) return; const keep = new Set(Object.values(GEO).concat([gQ, gB, gC, gS, gK, gI, gTo]));
  for (const L of D.layers) { L.m.material.dispose(); } D.root.traverse(o => { if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose(); }); dscene.remove(D.root); freeMats(TMP.dive); D.built = false; D.key = ''; D.layers = []; }
/* the dive backdrop hook: painted plates that repeat sideways, far to near (water, far, middle reef, seabed strip, front kelp).
   setDiveArt({ water: tex, far: tex, ... }) with THREE textures, or null for the code gradient. art/deep-tex.js (the picked plates)
   is fetched on the first dive only; until it arrives (or if it is missing) the code gradient and the rock wall stand in.
   Plates stand still in the room, so the camera's own perspective gives the parallax; z, height and centre y are below. */
const PLATE = { water: { z: -45, h: 70, y: -8, haze: 0 }, far: { z: -28, h: 34, y: -2, haze: .18 }, middle: { z: -14, h: 20, y: -9, haze: .08 },
  seabed: { z: -6, h: 7, y: -16.5, haze: .04 }, front: { z: 7, h: 2.4, y: null, haze: 0 } };   // front: y follows the camera (kelp along the bottom edge of the view)
const plateU = { fogC: { value: new THREE.Color(DFOG) }, lit: { value: 1 } };
function setDiveArt(tex) {
  D.art = tex || null; if (!D.built) return; for (const L of D.layers) { D.root.remove(L.m); L.m.geometry.dispose(); L.m.material.dispose(); } D.layers = [];
  const art = !!tex; dsky.visible = !art; D.rooms.forEach(rm => { if (rm.wall) rm.wall.visible = !art; if (rm.kelp) rm.kelp.im.visible = !art; if (rm.skirt) rm.skirt.visible = !art; }); if (!art) return;   // the painted plates carry their own rocks and kelp
  for (const k of ['water', 'far', 'middle', 'seabed', 'front']) { const t = tex[k]; if (!t) continue; const L = PLATE[k], d = 15 - L.z, w = DW + .933 * d * 2.4 + 4, tw = L.h * t.image.width / t.image.height;
    t.wrapS = REPEAT; t.wrapT = CLAMP; t.repeat.set(w / tw, 1); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: k !== 'water' && k !== 'seabed', alphaTest: k === 'front' || k === 'far' || k === 'middle' ? .04 : 0, depthWrite: k === 'water', fog: false, toneMapped: false }), hz = { value: L.haze };
    m.onBeforeCompile = sh => { sh.uniforms.uFogC = plateU.fogC; sh.uniforms.uLit = plateU.lit; sh.uniforms.uHaze = hz;
      sh.fragmentShader = 'uniform vec3 uFogC; uniform float uLit, uHaze;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb * uLit, uFogC, uHaze);'); };
    const pm = mesh(new THREE.PlaneGeometry(w, L.h), m, D.root); pm.position.set(DW / 2, L.y === null ? 0 : L.y, L.z); pm.renderOrder = k === 'front' ? 5 : -5 + Object.keys(PLATE).indexOf(k); pm.frustumCulled = false; pm.name = 'plate-' + k;
    D.layers.push({ k, m: pm, follow: L.y === null }); }
}
let deepAsked = false;
function deepArt() {   // the picked plates: decode them once into textures, then hand them to the hook
  const J = window.JR_DEEP; if (!J) { if (!deepAsked) { deepAsked = true; const s = document.createElement('script'); s.src = 'art/deep-tex.js'; s.onload = () => deepArt(); s.onerror = () => { D.artErr = true; }; document.head.appendChild(s); } return; }
  if (D.artTex) { if (D.built && D.art !== D.artTex) setDiveArt(D.artTex); return; } let n = 0; const out = {}, ks = Object.keys(J);
  ks.forEach(k => { const im = new Image(); im.onload = () => { out[k] = new THREE.CanvasTexture(im); if (++n === ks.length) { D.artTex = out; if (D.built) setDiveArt(out); } }; im.src = J[k].src; });
}
const helmet = (() => { const g = new THREE.Group();   // the buddy's dive helmet over his junk mech (the mech pieces are game.js's super-mode mech)
  mesh(gS, reg(new THREE.MeshStandardMaterial({ color: '#bff0ff', transparent: true, opacity: .32, roughness: .1, metalness: .1, depthWrite: false })), g).scale.setScalar(.72);
  const ring = mesh(gTo, reg(new THREE.MeshStandardMaterial({ color: '#9a9a92', roughness: .4, metalness: .6, flatShading: true })), g); ring.rotation.x = PI / 2; ring.position.y = -.28; ring.scale.set(.82, .82, .9);
  for (let i = 0; i < 4; i++) { const b = mesh(gS, reg(new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: .5, metalness: .5 })), g); b.scale.setScalar(.06); b.position.set(Math.cos(i * PI / 2) * .33, -.28, Math.sin(i * PI / 2) * .33); }
  const pipe = mesh(gC, reg(new THREE.MeshLambertMaterial({ color: '#4a4a44' })), g); pipe.scale.set(.06, .5, .06); pipe.position.set(-.3, .2, 0); pipe.rotation.z = .6; g.position.set(.05, .22, 0); return g; })();
const mechOn = { on: false, emi: 0, parent: null };
function mechIn() {   // the buddy climbs into his junk mech form, with the helmet on
  const M = A.mech, b = A.buddy; if (b.j && b.j.head) b.j.head.add(helmet); helmet.visible = true; if (!M) return;
  mechOn.on = true; mechOn.parent = M.mesh.parent; mechOn.mode = M.mode; dscene.add(M.mesh); M.mesh.visible = true;
  if (A.mechMat) { mechOn.emi = A.mechMat.emissiveIntensity; A.mechMat.emissiveIntensity = 0; }
  M.P.forEach((p, i) => M.mesh.setColorAt(i, p.col)); if (M.mesh.instanceColor) M.mesh.instanceColor.needsUpdate = true; }
function mechSyncDive() { const M = A.mech; if (!mechOn.on || !M) return; A.buddy.root.updateMatrixWorld(true); M.P.forEach((p, i) => { _m.multiplyMatrices(p.g.matrixWorld, p.m); M.mesh.setMatrixAt(i, _m); }); M.mesh.instanceMatrix.needsUpdate = true; }
function mechOut() { const M = A.mech; if (helmet.parent) helmet.parent.remove(helmet); if (!M || !mechOn.on) return; mechOn.on = false;
  (mechOn.parent || A.scene).add(M.mesh); M.mesh.visible = false; M.mode = mechOn.mode === 'off' ? 'off' : M.mode; if (A.mechMat) A.mechMat.emissiveIntensity = mechOn.emi; }
function enterDive(pool) {
  buildDive(G.seed + '|' + (R.map ? R.map.a : 0)); R.dives++; const pl = A.pl, b = A.buddy;
  G.state = 'dive'; Object.assign(D, { room: 0, x: 3, y: -2.2, vx: 0, vy: -.5, face: 1, air: TT.DIVE.AIR, inv: 0, hook: null, t: 0, exit: null, hits: 0, strokes: 0, pool, got0: bag().length });
  dscene.add(pl.root); pl.root.visible = true; pl.root.rotation.set(0, 0, 0); pl.root.scale.setScalar(A.HS); dscene.add(b.root); b.root.visible = true; b.root.rotation.set(0, 0, 0); BUD.x = D.x - 1.4; BUD.z = D.y + .6;
  D.rooms.forEach((rm, k) => { rm.g.visible = k === 0; }); mechIn(); setHelp('dive'); setTouch('dive'); miniEl.style.display = 'none'; hudEl.style.display = 'flex'; helpEl.style.display = 'block'; touchEl.style.display = isTouch ? 'block' : 'none'; setPrompt(''); P.panel = null; panelEl.style.display = 'none';
  A.resetInput(); inp.down.clear(); inp.actQ = inp.hookQ = inp.tupQ = 0; P.hudKey = ''; toast('the deep pool: the buddy climbs into his junk mech', 2.4); A.sfx(240, .3, 'sine');
}
function exitDive(why) {   // back up to the map at the deep pool (keep what you found)
  if (D.exit) return; D.exit = why; const got = bag().length - D.got0;
  startFold(() => { mechOut(); D.hook = null; if (D.hookM) D.hookM.visible = false; enterMap('pool'); toast(why === 'air' ? 'out of air: the buddy towed you up' + (got > 0 ? ' (you kept your ' + got + ' piece' + (got > 1 ? 's' : '') + ')' : '') : why === 'current' ? 'the current carried you back up' : 'back up at the deep pool', 2.4); });
}
const mobPos = (mb, t) => { if (mb.kind === 'jelly') return [mb.x0 + Math.sin(t * .35 + mb.ph) * 3, mb.y0 + Math.sin(t * .9 + mb.ph) * 1.6];
  if (mb.kind === 'lantern') return [mb.x0 + Math.sin(t * .45 + mb.ph) * 7, mb.y0 + Math.sin(t * .7 + mb.ph) * .8]; return [mb.x0 + Math.sin(t * .5 + mb.ph) * 9, mb.y0 + Math.sin(t * 1.3 + mb.ph) * .6 - 1]; };
function diveHook() {
  if (D.hook) return false; const rm = D.rooms[D.room], R2 = TT.DIVE.HOOK_R, sc = o => { const d = Math.hypot(o.x - D.x, o.y - D.y); return d > R2 ? 1e9 : d + (Math.sign(o.x - D.x) === -D.face ? 4 : 0); };   // the nearest in reach, things in front first
  let best = null, bd = 1e8;
  for (const g of rm.rings) { const d = sc(g); if (d < bd && Math.hypot(g.x - D.x, g.y - D.y) > 1) { bd = d; best = { kind: 'ring', o: g }; } }
  for (const c of rm.caches) { if (c.got) continue; const d = sc(c); if (d < bd) { bd = d; best = { kind: 'cache', o: c }; } }
  if (!best) { toast('nothing in reach: hook a gold ring or a crate', 1.2); return false; }
  D.hook = Object.assign(best, { t: 0, sx: best.o.x, sy: best.o.y }); D.face = best.o.x >= D.x ? 1 : -1; A.sfx(300, .08, 'square'); return true;
}
function takeCache(c) { if (c.got) return; if (!bagAdd(c.kind)) { toast('your bag is full: the crate stays', 1.4); return false; } c.got = true; c.m.visible = false; D.got++; A.sfx(640, .06, 'triangle'); toast('junk: ' + JUNK[c.kind].n + ' (' + bag().length + '/' + bagMax() + ')', 1.3); return true; }
function stepDive(dt) {
  if (D.exit) return; const DV = TT.DIVE, rm = D.rooms[D.room]; D.t += dt;
  let ax = (keyDown('KeyD') || keyDown('ArrowRight') ? 1 : 0) - (keyDown('KeyA') || keyDown('ArrowLeft') ? 1 : 0), up = keyDown('Space') || keyDown('KeyW') || keyDown('ArrowUp') || inp.tup, down = keyDown('KeyS') || keyDown('ArrowDown');
  if (inp.stick[0] || inp.stick[1]) { ax = inp.stick[0]; if (inp.stick[1] < -.5) up = true; if (inp.stick[1] > .5) down = true; }
  while (inp.tupQ > 0) { inp.tupQ--; D.vy = Math.min(DV.RISE, D.vy + DV.STROKE); D.strokes++; A.sfx(420, .05, 'sine'); }
  if (D.hook && D.hook.kind === 'ring') { const h = D.hook, dx = h.o.x - D.x, dy = h.o.y - D.y, d = Math.hypot(dx, dy); h.t += dt;
    if (d < 1 || h.t > DV.HOOK_T) D.hook = null; else { D.vx = dx / d * DV.HOOK_PULL; D.vy = dy / d * DV.HOOK_PULL; } }
  else { if (ax) D.face = ax > 0 ? 1 : -1; D.vx += ax * DV.ACC * dt; D.vx -= D.vx * DV.DRAG * dt; D.vx = Math.max(-DV.SWIM_X, Math.min(DV.SWIM_X, D.vx));
    D.vy -= DV.SINK * dt; if (up) D.vy += (DV.SINK + DV.HOLD_UP) * dt; if (down) D.vy -= DV.DOWN * dt; D.vy -= D.vy * 1.1 * dt; D.vy = Math.max(down ? -3.4 : -DV.SINK_MAX, Math.min(DV.RISE, D.vy)); }
  if (D.hook && D.hook.kind === 'cache') { const h = D.hook; h.t += dt; const u = Math.min(1, h.t / .4); h.o.x = lerp(h.sx, D.x, u * u); h.o.y = lerp(h.sy, D.y, u * u); h.o.m.position.set(h.o.x, h.o.y, 0); if (u >= 1) { if (!takeCache(h.o)) { h.o.x = h.sx; h.o.y = h.sy; h.o.m.position.set(h.sx, h.sy, 0); } D.hook = null; } }
  D.x += D.vx * dt; D.y += D.vy * dt;
  const fl = floorAt(rm, D.x) + .55; if (D.y < fl) { D.y = fl; D.vy = Math.max(0, D.vy); } const ce = ceilAt(rm, D.x); if (D.y > ce) { D.y = ce; D.vy = Math.min(0, D.vy); }
  if (D.room === 0 && D.y > -.25 && D.x < 9 && D.t > 1.5) { exitDive('surface'); return; }
  if (D.x > DW - .3) { if (D.room < 2) { setRoom(D.room + 1); D.x = .5; } else D.x = DW - .3; } else if (D.x < .3) { if (D.room > 0) { setRoom(D.room - 1); D.x = DW - .5; } else D.x = .3; }
  const rm2 = D.rooms[D.room], fl2 = floorAt(rm2, D.x) + .55; if (D.y < fl2) D.y = fl2; if (D.y > ceilAt(rm2, D.x)) D.y = ceilAt(rm2, D.x);
  for (const c of rm2.caches) if (!c.got && Math.hypot(c.x - D.x, c.y + .3 - D.y) < 1.1 && !c.bump) { c.bump = !takeCache(c); } else if (c.bump && Math.hypot(c.x - D.x, c.y - D.y) > 2) c.bump = false;
  if (D.inv > 0) D.inv -= dt;
  for (const mb of rm2.mobs) { const [mx, my] = mobPos(mb, D.t); mb.x = mx; mb.y = my; if (D.inv <= 0 && Math.hypot(mx - D.x, my - D.y) < (mb.kind === 'eel' ? 1.3 : 1.2)) { D.air -= DV.HIT_AIR; D.inv = DV.INV; D.hits++; const dx = D.x - mx, dy = D.y - my, d = Math.hypot(dx, dy) || 1; D.vx = dx / d * 5; D.vy = dy / d * 4; A.sfx(140, .18, 'sawtooth'); toast(mb.kind === 'eel' ? 'an eel bit your air hose!' : mb.kind === 'lantern' ? 'the lantern fish bumped you!' : 'stung by a junk jelly!', 1.2); } }
  D.air -= DV.AIR_DRAIN * dt; if (D.air <= 0) { D.air = 0; exitDive('air'); return; }
  P.near = null; let pr = '';
  if (D.room === 2 && !D.chest && Math.hypot(D.chestAt.x - D.x, D.chestAt.y - D.y) < 2.2) { pr = (isTouch ? 'ACT' : 'F') + ': open the wreck chest'; P.near = 'chest'; }
  if (D.room === 0 && D.x < 9 && D.y > -3.5) pr = 'swim up to climb out';
  setPrompt(pr);
  while (inp.actQ > 0) { inp.actQ--; if (P.near === 'chest') openWreck(); } while (inp.hookQ > 0) { inp.hookQ--; diveHook(); }
  if (D.current && D.room === 2 && Math.hypot(D.curAt.x - D.x, D.curAt.y - D.y) < 1.8) { exitDive('current'); return; }
  const bx = D.x - D.face * 1.25, by = D.y + .2 + Math.sin(D.t * 1.3) * .2; BUD.x = hold(BUD.x, bx, dt, 3); BUD.z = hold(BUD.z, by, dt, 3); BUD.mv = Math.min(1, Math.hypot(bx - BUD.x, by - BUD.z));
}
function setRoom(k) { D.rooms[D.room].g.visible = false; D.room = k; D.rooms[k].g.visible = true; D.hook = null; BUD.x = D.x; toast(['the shallows', 'the dark middle', 'the wreck'][k], 1.2); A.sfx(200 - k * 30, .2, 'sine'); }
function openWreck() {
  if (D.chest) return false; D.chest = true; D.lid.rotation.x = -1.9; let n = 0; const r = mulberry(hash(D.key + '|chest|' + R.dives));
  for (let k = 0; k < TT.DIVE.WRECK_JUNK; k++) if (bagAdd(LEAN.deep[Math.floor(r() * LEAN.deep.length)])) n++;
  D.current = true; D.curM.visible = true; A.sfx(880, .25, 'triangle');
  toast('the wreck chest: ' + n + ' junk piece' + (n === 1 ? '' : 's') + (n < TT.DIVE.WRECK_JUNK ? ' (your bag is full)' : '') + '. A current opens: swim into it to go back up', 3); return true;
}
function renderDive(dt) {
  const pl = A.pl, b = A.buddy, t = A.VT(), rm = D.rooms[D.room];
  pl.root.position.set(D.x, D.y - .6, 0); pl.root.rotation.set(0, D.face > 0 ? 0 : PI, Math.max(-.6, Math.min(.6, D.vy * .12)) - .5); pl.root.visible = D.inv <= 0 || Math.sin(t * 30) > 0; poseHero(dt, true);
  b.root.position.set(BUD.x, BUD.z - .5, .4); b.root.rotation.set(0, D.face > 0 ? 0 : PI, -.35); b.ph = (b.ph || 0) + dt * 8; A.poseBuddy(b, dt, { mv: .6, air: .5, look: .3, lookAmt: .4, wave: 0, deep: 0 }); mechSyncDive();
  dcam.aspect = A.camera.aspect; dcam.updateProjectionMatrix();
  const cx = Math.max(9, Math.min(DW - 9, D.x)), cy = Math.max(-DH + 5.5, Math.min(D.room === 0 ? -2 : -4.5, D.y + 1)); dcam.position.set(cx, cy + 1.2, 15); dcam.lookAt(cx, cy, 0); dcam.updateMatrixWorld();
  dsky.position.copy(dcam.position); dsky.material.uniforms.uY.value = cy - D.room * 16; dscene.fog.density = .03 + D.room * .008; _c.set(DFOG).multiplyScalar(1 - D.room * .22); dscene.fog.color.copy(_c); dscene.background.copy(_c);
  dhemi.intensity = 1.3 - D.room * .25;
  for (const L of D.layers) if (L.follow) L.m.position.y = cy - 2.6; plateU.lit.value = 1 - D.room * .19; plateU.fogC.value.copy(_c);
  const K = rm.kelp; if (K.im.visible) K.d.forEach((d, i) => { for (let s = 0; s < 4; s++) { const sw = Math.sin(t * 1.2 + d.ph + s * .6) * .18 * (s + 1); _o.position.set(d.x + Math.sin(t * 1.2 + d.ph) * .1 * s, d.y + (s + .5) * d.h / 4, d.z); _o.rotation.set(0, 0, sw); _o.scale.set(.25, d.h / 4 * 1.05, .06); _o.updateMatrix(); K.im.setMatrixAt(i * 4 + s, _o.matrix); } }); K.im.instanceMatrix.needsUpdate = true;
  for (const g of rm.rings) { g.m.rotation.y = t * 1.5; g.m.scale.setScalar(1 + (D.hook && D.hook.o === g ? .2 : 0)); }
  for (const mb of rm.mobs) { const [mx, my] = [mb.x, mb.y], dirx = Math.cos(t * .45 + mb.ph) >= 0 ? 1 : -1;
    if (mb.kind === 'eel') mb.g.children.forEach(e => { const s = e.userData.s, tt = D.t - s * .12, [ex, ey] = mobPos(mb, tt); e.position.set(ex, ey, 0); });
    else { mb.g.position.set(mx, my, 0); mb.g.rotation.y = dirx > 0 ? 0 : PI; if (mb.kind === 'jelly') mb.g.scale.set(1, 1 + Math.sin(t * 3 + mb.ph) * .1, 1); if (mb.g.userData.lure) { mb.g.userData.lure.quaternion.copy(dcam.quaternion); mb.g.userData.lure.material.opacity = .6 + Math.sin(t * 5) * .3; } } }
  for (const c of rm.caches) if (!c.got) c.m.rotation.y = Math.sin(t + c.x) * .2;
  if (D.curM && D.curM.visible) D.curM.rotation.z = -t * 2;
  D.shafts.forEach(s => { const u = s.userData; s.position.set(cx + u.ox, -2 - 9, -3); s.scale.set(u.w, 22, 1); s.rotation.z = .25; s.material.opacity = (.07 + .05 * Math.sin(t * .6 + u.ph)) * (1 - D.room * .4); });
  if (D.bubD.length < 40 && Math.random() < .25) D.bubD.push({ x: D.x + .2 * D.face, y: D.y + .3, z: .3, v: 1 + Math.random(), s: .08 + Math.random() * .1, l: 0 });
  for (let i = D.bubD.length - 1; i >= 0; i--) { const q = D.bubD[i]; q.l += dt; q.y += q.v * dt; q.x += Math.sin(q.l * 6) * .01; if (q.l > 3 || q.y > ceilAt(rm, q.x)) D.bubD.splice(i, 1); }
  D.bubD.forEach((q, i) => { _o.position.set(q.x, q.y, q.z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(q.s); _o.updateMatrix(); D.bub.setMatrixAt(i, _o.matrix); }); D.bub.count = D.bubD.length; D.bub.instanceMatrix.needsUpdate = true;
  const h = D.hook; D.hookM.visible = !!h; if (h) { _v.set(D.x + D.face * .3, D.y - .1, .2); _v2.set(h.o.x, h.o.y + (h.kind === 'cache' ? .3 : 0), 0); const L = _v.distanceTo(_v2); D.hookM.position.copy(_v).add(_v2).multiplyScalar(.5); D.hookM.quaternion.setFromUnitVectors(new V3(0, 1, 0), _v2.sub(_v).normalize()); D.hookM.scale.set(.05, L, .05); }
  A.renderer.render(dscene, dcam); R.calls = A.renderer.info.render.calls; R.tris = A.renderer.info.render.triangles;
  drawHud();
}

/* ======================= per-step logic (fixed 60 Hz, driven by game.js's loop) ======================= */
function step(dt) {
  runCheck(); refillCheck(); stepFold(dt);
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) msgEl.style.display = 'none'; }
  if (G.camp && G.state !== 'play' && G.state !== 'paused' && G.state !== 'mapin') campTidy();   // a run that ended in a camp (game over, then the title keys)
  if (G.state === 'play') { if (G.camp) { campStep(); return; } if (!fold.on) sidePrompt(); return; }
  if (G.state !== 'map' && G.state !== 'dive') { if (promptTxt && G.state !== 'paused') setPrompt(''); return; }
  if (P.paused || fold.on) { inp.actQ = inp.hookQ = inp.tupQ = 0; return; }
  if (G.state === 'map') stepMap(dt); else stepDive(dt);
}
function startFromSide() {   // the map gate in a forest room: fold the page, the map unfolds
  if (G.state !== 'play' || G.camp || G.freeze || !G.p || fold.on || !side.near) return false;   // never from inside a camp fight (F there is not the map gate)
  const x = roomGateX(), room = G.room; G.state = 'mapin'; setPrompt(''); A.resetInput(); G.p.vx = 0; G.p.hook = null; G.p.blocking = false;
  startFold(() => enterMap({ gate: room, x })); return true;
}
const in3d = () => (G.state === 'map' && MV.built) || (G.state === 'dive' && D.built);
function render(dt) { if (G.state === 'map') renderMap(dt); else renderDive(dt); }

/* ======================= input (own listeners; game.js's keys are cleared on the way in and out) ======================= */
addEventListener('keydown', e => {
  if (G.state === 'play') { if (e.code === 'KeyF' && side.near && !e.repeat) { if (startFromSide()) e.preventDefault(); } return; }
  if (G.state !== 'map' && G.state !== 'dive') return;
  if (e.code !== 'KeyM') e.stopPropagation();   // the side scroller's keys (kick, shield, Enter...) wait; M still mutes
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyP' && !e.repeat) { P.paused = !P.paused; P.autoPaused = false; P.hudKey = ''; return; }
  if (P.panel) { if (e.repeat) return; const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (n !== undefined) { if (P.panel.kind === 'pick') choosePick(n); else chooseSwap(n); } else if (e.code === 'Escape' && P.panel.kind === 'swap') chooseSwap(-1); return; }
  inp.down.add(e.code);
  if ((e.code === 'KeyE' || e.code === 'KeyF') && !e.repeat) inp.actQ++;
  if (e.code === 'KeyH' && !e.repeat) inp.hookQ++;
  if (G.state === 'dive' && (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) inp.tupQ++;
  if (G.state === 'map' && e.code === 'Tab' && !e.repeat) toggleBig();
}, true);
addEventListener('keyup', e => { inp.down.delete(e.code); });
addEventListener('blur', () => { inp.down.clear(); if ((G.state === 'map' || G.state === 'dive') && !P.paused) { P.paused = true; P.autoPaused = true; P.hudKey = ''; } });
const resume = () => { if (P.autoPaused && !document.hidden) { P.autoPaused = false; P.paused = false; P.hudKey = ''; } };   // back from another app or tab: go on (a P-key pause stays)
addEventListener('focus', resume); document.addEventListener('visibilitychange', resume);
A.cv.addEventListener('pointerdown', e => { if ((G.state !== 'map' && G.state !== 'dive') || e.pointerType === 'touch' || P.panel) return; if (e.button === 0) inp.hookQ++; });
promptEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (G.state === 'play') startFromSide(); else if (G.state === 'map' || G.state === 'dive') inp.actQ++; });
let touchMode = '';
function setTouch(mode) {
  if (!isTouch || touchMode === mode) return; touchMode = mode;
  touchEl.innerHTML = mode === 'map' ? '<div class="tb3" data-b="act" style="right:4vmin;bottom:6vmin;width:19vmin;height:19vmin">ACT</div><div class="tb3" data-b="hook" style="right:26vmin;bottom:4vmin">HOOK</div><div class="tb3" data-b="map" style="right:4vmin;bottom:30vmin">MAP</div>'
    : '<div class="tb3" data-b="up" style="right:4vmin;bottom:6vmin;width:19vmin;height:19vmin">SWIM</div><div class="tb3" data-b="hook" style="right:26vmin;bottom:4vmin">HOOK</div><div class="tb3" data-b="act" style="right:4vmin;bottom:30vmin">ACT</div>';
}
if (isTouch) {
  let stickId = null, s0 = null;
  touchEl.addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('.tb3'); if (b) { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); const k = b.dataset.b;
      if (k === 'act') inp.actQ++; else if (k === 'hook') inp.hookQ++; else if (k === 'map') toggleBig(); else if (k === 'up') { inp.tup = true; inp.tupQ++; } return; }
    if (e.clientX < innerWidth * .5 && stickId === null) { stickId = e.pointerId; s0 = [e.clientX, e.clientY]; } });
  touchEl.addEventListener('pointermove', e => { if (e.pointerId === stickId) inp.stick = [Math.max(-1, Math.min(1, (e.clientX - s0[0]) / 50)), Math.max(-1, Math.min(1, (e.clientY - s0[1]) / 50))]; });
  const up = e => { if (e.pointerId === stickId) { stickId = null; inp.stick = [0, 0]; } touchEl.querySelectorAll('.on').forEach(b => b.classList.remove('on')); inp.tup = false; };
  touchEl.addEventListener('pointerup', up); touchEl.addEventListener('pointercancel', up);
}

/* ======================= hooks + test API ======================= */
const api = { step: dt => { if (!R.manual) step(dt); }, afterSide, roomBuilt: buildSide, in3d, render, TT, setGroundArt, setDiveArt, setOG: o => { OG = o || null; },   // setOG({ enterOG, leaveOG, isOG })
  test: {
    TT, R, P, D, MV, TEX, JUNK, genMap, tryMap, fingerprint, greyLayout: m => greyLayout(m).toDataURL('image/png'), reachFrom, canStep, sideGates, gateRooms, roomGateX, makeMap, enterMap, toSide, toFish,
    startFromSide, enterDive: () => { const m = makeMap(); enterDive(m.spots.find(s => s.type === 'pool')); }, exitDive, openWreck, setRoom, bag, bagAdd, bagMax, refillCheck, hAt, cellAt, terrainSpeed, reveal, side,
    setGroundArt, tileTex, hero: () => { const r = A.pl.root; return { inScene: r.parent === A.scene, parent: r.parent ? r.parent.type : null, vis: r.visible, pos: r.position.toArray().map(v => +v.toFixed(2)), scale: +r.scale.x.toFixed(3), rot: r.rotation.toArray().slice(0, 3) }; },
    setOG: o => { OG = o || null; }, toOG, og: () => ({ in: R.ogIn || 0, back: R.ogBack || 0, on: !!R.ogOn }),
    manual(on) { R.manual = !!on; }, startCamp: i => startCamp(R.map.camps[i]), leaveCamp, campFlyers, camps: () => R.map ? R.map.camps.map(c => ({ id: c.id, pool: !!c.pool, guard: c.guard, x: c.x, z: c.z, beaten: c.beaten, found: c.found, tries: c.tries })) : [],
    camp: () => G.camp && { id: G.camp.c.id, end: G.camp.end, flee: G.camp.flee, room: G.room, rooms: G.world.rooms.length, flyers: G.rs.flyers.map(f => ({ st: f.st, hp: f.hp, rank: f.rank, x: f.x, y: f.y, kind: f.kind })) }, campLog: () => (R.campLog || []).slice(), mats: () => ({ map: TMP.map.length, dive: TMP.dive.length }), blur: () => dispatchEvent(new Event('blur')), focus: () => dispatchEvent(new Event('focus')), advance(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) { if (G.state === 'play') A.update(STEP); step(STEP); } },
    key(code, down) { if (down) { if (!inp.down.has(code)) { if (code === 'KeyF' || code === 'KeyE') inp.actQ++; if (code === 'KeyH') inp.hookQ++; if (G.state === 'dive' && (code === 'Space' || code === 'KeyW')) inp.tupQ++; } inp.down.add(code); } else inp.down.delete(code); },
    act: () => { inp.actQ++; }, hook: () => { inp.hookQ++; }, stroke: () => { inp.tupQ++; }, choosePick, chooseSwap, panel: () => P.panel && { kind: P.panel.kind, k: P.panel.k },
    place(x, z) { P.x = x; P.z = z; P.near = null; reveal(x, z, TT.REVEAL); }, placeDive(x, y) { D.x = x; D.y = y; D.vx = D.vy = 0; },
    spot: type => R.map && R.map.spots.find(s => s.type === type), spots: type => R.map ? R.map.spots.filter(s => !type || s.type === type) : [],
    info: () => ({ state: G.state, fold: fold.on, from: R.from, visits: R.visits, dives: R.dives, pos: [+P.x.toFixed(2), +P.z.toFixed(2)], spd: +P.spd.toFixed(2), near: P.near && (P.near.type || P.near), prompt: promptTxt,
      bag: bag().slice(), bagMax: bagMax(), fogN: R.fogN, flags: flagsN(), refills: R.refills, bossSeen: R.bossSeen, lastRefill: R.lastRefill || null, rj: R.rj.filter(j => !j.got).length, rjGot: R.rjGot || 0, picks: (R.picks || []).slice(),
      crown: P.crown, big: P.big, paused: P.paused, calls: R.calls, tris: R.tris, buildMs: R.ms && +R.ms.toFixed(0), art: TEX.art, a: R.map && R.map.a, counts: MV.counts, fishBack: R.fishBack || 0, fishKind: R.fishKind || null,
      deepArt: D.layers.map(L => L.k), deepErr: !!D.artErr, paperAsked, paperErr: !!TEX.paperErr, dive: { room: D.room, x: +D.x.toFixed(2), y: +D.y.toFixed(2), vx: +D.vx.toFixed(2), vy: +D.vy.toFixed(2), air: +D.air.toFixed(1), hits: D.hits, strokes: D.strokes, chest: D.chest, current: D.current, exit: D.exit, hook: D.hook && D.hook.kind, mech: mechOn.on, helmet: !!helmet.parent, mechVis: !!(A.mech && A.mech.mesh.visible), got: D.got },
      hud: hudEl.style.display !== 'none' ? hudEl.textContent : '', msg: msgEl.style.display !== 'none' ? msgEl.textContent : '', log: LOG.slice(-8) }),
    renderOnce() { render(STEP); return { calls: R.calls, tris: R.tris }; }, foldDone() { while (fold.on) stepFold(.05); }
  } };
return api;
};
})();
