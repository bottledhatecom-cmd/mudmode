/* mudpity shared score board, game client. Kept in its own file so other branches don't conflict.
   - top scores on the title and game-over screens (ALL / THIS SEED / MEMBERS), label "for fun, not verified"
   - end of run: the player signs his name and sends the score (nothing is sent without pressing SEND)
   - offline: the last board and any unsent scores are kept in localStorage and sent when the board answers again
   - mob-vs-player stats: bosses beaten and lives lost, by mob type
   - GitHub sign-in for the members list (hidden until worker says signin:true; stubbed in local dev; UNPROVEN until a real GitHub OAuth app exists)
   - T mode mini games (branch super3): wins / losses / ties per signed name, per game, solo vs buddy or 2 players (P2 by the name typed),
     sent with the run score; mini game reward points are added to the run score. API for game.js (see scores/README.md):
       window.mudScores.miniResult({ game, mode, winner })   game: tug|rps|thumb|stare|flick|potato, mode: 'solo'|'2p', winner: 1 = P1 (you), 2 = P2 or buddy, 3 = tie
       window.mudScores.addRunPoints(n)                      n: whole number 1..500 per call, MINI_PTS_MAX (3000) per run; NOT also added to G.score
     Both only count during a run (between the run start and end hooks) and return true when counted.
   The game only calls window.mudScores.on(...) and reads nothing back, so the run itself never waits on the network. */
(() => {
'use strict';
// local smoke uses 127.0.0.1:8787. a non-local page uses the existing mudpity-scores worker only.
const DEFAULT_ENDPOINT = 'http://127.0.0.1:8787';
const LIVE_ENDPOINT = 'https://mudpity-scores.bottledhate-com.workers.dev';
const LABEL = 'for fun, not verified';
// privacy line: Brief's wording (verdict 0w.1 (a)), ok'd by the owner without the age line
// Privacy line shown next to SEND SCORE. Final text (owner t169u / t169s856, 2026-11-12).
// The birth-year question is a simple self-report that cannot be checked; never describe it as enforced or verified.
// The in-game line must not name the age cutoff (a neutral age question); the 13+ rule is in privacy.html#mudpity-scores.
const PRIVACY_LINE = 'Sending puts your name, score and seed (and any P2 name) on a public board. Use a nickname, not a real full name. We ask your birth year as a simple check we can\'t verify; this device keeps only a yes/no answer, never the year. For fun, not verified.';
const PRIVACY_URL = '../../../privacy.html#mudpity-scores';
const K = { age: 'mudpity-scores-under13', name: 'mudpity-scores-name', queue: 'mudpity-scores-queue', refused: 'mudpity-scores-refused', cache: 'mudpity-scores-cache:', token: 'mudpity-scores-token', ep: 'mudpity-scores-endpoint', tab: 'mudpity-scores-tab', p2: 'mudpity-scores-p2' };
const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const qs = new URLSearchParams(location.search);
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
const jget = (k, d) => { try { const v = JSON.parse(ls.get(k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } };
// local: optional ?scores= override, else 127.0.0.1:8787.
// live: hardcoded worker only — no ?scores= / ?test=1 override, ignore a stored K.ep (M1).
// never fetch 127.0.0.1:8787 off-local (M2).
let endpoint = LIVE_ENDPOINT;
if (LOCAL) { const q = qs.get('scores'); if (q && /^https?:\/\/[^\s"'<>]+$/.test(q)) ls.set(K.ep, q.replace(/\/+$/, '')); endpoint = ls.get(K.ep) || DEFAULT_ENDPOINT; }

// sign-in token comes back in the address fragment; keep it and clean the address
{ const m = /(?:^#|&)mudscores_token=([a-f0-9]{64})/.exec(location.hash); if (m) { ls.set(K.token, m[1]); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} } }

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
const NAME_RE = /^[A-Za-z0-9 _.\-]{3,16}$/;

/* ---------- run stats (fed by game.js) ---------- */
const BOSS = { boss1: 'bogjaw', boss2: 'gloomwing', boss3: 'mudtotem' };
const MINI = { tug: 'Tug of war', rps: 'Rock paper scissors', thumb: 'Thumb war', stare: 'Staring contest', flick: 'Mud flick', potato: 'Hot potato' };
const MINI_PTS_MAX = 3000, MINI_PTS_CALL = 500, MINI_MAX_PER = 60, MINI_MAX_TOTAL = 120;   // same caps as the Worker (wrangler.toml vars)
let run = null, last = null;
// round 3: the device remembers only a yes/no under-13 mark (K.age: '1' = under 13, '0' = 13 or older). The birth year is
// never stored or sent. No mark (or '1') = nothing is sent to the board.
let ageOkSession = false, ageUnder13Session = false;
{ const m = ls.get(K.age); ageOkSession = m === '0'; ageUnder13Session = m === '1'; }
function mobOf(why, bossKind) {
  const w = String(why || '').replace(/\s*\(hand block\)\s*$/, '').toLowerCase();
  if (/pit/.test(w)) return 'pit';
  if (/log/.test(w)) return 'log';
  if (/crawler/.test(w)) return 'crawler';
  if (/snap/.test(w)) return 'snapjaw';
  if (/bogjaw/.test(w)) return 'bogjaw';
  if (/gloomwing/.test(w)) return 'gloomwing';
  if (/totem/.test(w)) return 'mudtotem';
  if (bossKind && BOSS[bossKind]) return BOSS[bossKind];
  const m = /([a-z]{2,16})/.exec(w); return m ? m[1] : 'other';
}
function on(ev, a, b) {
  if (ev === 'start') { run = { t0: Date.now(), kills: {}, deaths: {}, mini: {}, miniN: 0, pts: 0 }; last = null; ui.sent = ''; ui.err = ''; ui.needYear = false; ui.draft = {}; bump(); }
  else if (ev === 'kill' && run) { const m = BOSS[a] || String(a).toLowerCase().replace(/[^a-z]/g, '').slice(0, 16) || 'other'; run.kills[m] = (run.kills[m] || 0) + 1; }
  else if (ev === 'death' && run) { const m = mobOf(a, b); run.deaths[m] = (run.deaths[m] || 0) + 1; }
  else if (ev === 'end') {
    const r = a || {}, base = Math.max(0, Math.floor(+r.score || 0)), pts = run ? run.pts : 0;
    const mini = run ? Object.keys(run.mini).map(k => { const [game, mode] = k.split('|'); return { game, mode, ...run.mini[k] }; }) : [];
    last = { score: base + pts, base, miniPts: pts, mini, seed: String(r.seed || ''), result: r.result, gems: Math.max(0, Math.floor(+r.gems || 0)),
      runMs: run ? Math.max(0, Date.now() - run.t0) : null, stats: run ? { kills: run.kills, deaths: run.deaths } : { kills: {}, deaths: {} }, clientId: uid() };
    run = null; ui.sent = ''; ui.err = ''; ui.miniMsg = ''; bump();
  }
}
// T mode mini game result, from P1's side. Solo: P2 is buddy. Kept on the run and sent with the run score.
function miniResult(o) {
  const r = o || {}; if (!run || !MINI[r.game] || (r.mode !== 'solo' && r.mode !== '2p') || ![1, 2, 3].includes(r.winner)) return false;
  if (run.miniN >= MINI_MAX_TOTAL) return false;
  const k = r.game + '|' + r.mode, t = run.mini[k] || (run.mini[k] = { w: 0, l: 0, d: 0 }), f = r.winner === 1 ? 'w' : r.winner === 2 ? 'l' : 'd';
  if (t[f] >= MINI_MAX_PER) return false;
  t[f]++; run.miniN++; return true;
}
// mini game reward points: added to the score this run sends (the game's own score is left alone)
function addRunPoints(n) {
  if (!run || !Number.isInteger(n) || n < 1 || n > MINI_PTS_CALL) return false;
  const before = run.pts; run.pts = Math.min(MINI_PTS_MAX, run.pts + n); return run.pts > before;
}

/* ---------- network ---------- */
const tok = () => ls.get(K.token);
async function api(path, opt) {
  if (!endpoint) throw new Error('no scores endpoint');
  const o = opt || {}, h = { ...(o.headers || {}) };
  if (tok()) h.Authorization = 'Bearer ' + tok();
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetch(endpoint + path, { ...o, headers: h, signal: ctl.signal, credentials: 'omit', mode: 'cors' }); const j = await r.json().catch(() => ({})); return { status: r.status, j }; }
  finally { clearTimeout(to); }
}
const state = { online: null, boards: {}, stats: null, me: null, syncing: false, sentAt: 0, signin: false };
// lists are cached by the browser for 15 s; right after this player sent something, skip that cache so the new row shows
const fresh = () => Date.now() - state.sentAt < 30000 ? { cache: 'no-cache' } : {};
function boardKey(tab, seed) { return tab === 'seed' ? 'public|' + seed : tab === 'members' ? 'members|' : 'public|'; }
function noteSignin(j) { if (j && typeof j.signin === 'boolean') state.signin = j.signin; }
async function loadHealth() {
  try {
    const { status, j } = await api('/health');
    if (status === 200 && j && j.ok) { state.online = true; noteSignin(j); }
  } catch (e) { state.online = false; }
  bump();
}
async function loadBoard(tab, seed) {
  const key = boardKey(tab, seed), q = tab === 'members' ? '?board=members&limit=10' : tab === 'seed' ? '?board=public&limit=10&seed=' + encodeURIComponent(seed) : '?board=public&limit=10';
  try {
    const { status, j } = await api('/scores' + q, fresh());
    if (status === 200 && j.ok) { state.online = true; noteSignin(j); state.boards[key] = { at: Date.now(), scores: j.scores }; ls.set(K.cache + key, JSON.stringify(state.boards[key])); }
    else state.boards[key] = state.boards[key] || jget(K.cache + key, null);
  } catch (e) { state.online = false; state.boards[key] = state.boards[key] || jget(K.cache + key, null); }
  bump();
}
async function loadMini() {
  const key = 'mini|' + ui.mg + '|' + ui.mm;
  try {
    const { status, j } = await api('/mini?game=' + ui.mg + '&mode=' + ui.mm + '&limit=10', fresh());
    if (status === 200 && j.ok) { state.online = true; state.boards[key] = { at: Date.now(), rows: j.rows }; ls.set(K.cache + key, JSON.stringify(state.boards[key])); }
    else state.boards[key] = state.boards[key] || jget(K.cache + key, null);
  } catch (e) { state.online = false; state.boards[key] = state.boards[key] || jget(K.cache + key, null); }
  bump();
}
async function loadStats() { try { const { status, j } = await api('/stats'); if (status === 200 && j.ok) { state.stats = j.mobs; ls.set(K.cache + 'stats', JSON.stringify(j.mobs)); } } catch (e) { state.stats = state.stats || jget(K.cache + 'stats', null); } bump(); }
async function loadMe() { if (!tok()) { state.me = null; return; } try { const { status, j } = await api('/me'); if (status === 200) state.me = j.gh_login; else if (status === 401) { state.me = null; ls.del(K.token); } } catch (e) {} bump(); }

const queue = () => jget(K.queue, []);
const setQueue = q => ls.set(K.queue, JSON.stringify(q.slice(-50)));
const refused = () => jget(K.refused, []);
const setRefused = r => ls.set(K.refused, JSON.stringify(r.slice(-50)));
const localOnly = () => jget(K.refused + ':local', []);
const setLocalOnly = r => ls.set(K.refused + ':local', JSON.stringify(r.slice(-50)));
// send unsent scores, oldest first. Kept: network errors, 5xx and 429 (retry later).
// 422: never drop silently — surface the reason, move to a local refused list (no retry loop), show on the board.
// round 3: every other refused answer (any status but 2xx, 429, 5xx) also goes to the "not sent" list with its reason.
async function sync() {
  if (state.syncing) return;
  if (ls.get(K.age) !== '0') return;   // no 13+ mark on this device: never send (under-13 or not answered)
  state.syncing = true;
  try {
    let q = queue();
    while (q.length) {
      const item = q[0]; let res;
      const { kind, ...body } = item;
      try { res = await api(kind === 'mini' ? '/mini' : '/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
      catch (e) { state.online = false; state.failAt = Date.now(); break; }
      if (!res || !res.status) { state.online = false; state.failAt = Date.now(); break; }
      state.online = true; if (res.status === 201) state.sentAt = Date.now();
      if (res.status === 429 || res.status >= 500) { state.failAt = Date.now(); break; }
      q = queue().filter(x => x.clientId !== item.clientId); setQueue(q);
      if (res.status !== 200 && res.status !== 201) {
        const reason = (res.j && res.j.error) || ('refused (' + res.status + ')');
        setRefused([...refused().filter(x => x.clientId !== item.clientId), { ...item, reason, at: Date.now() }]);
        if (kind === 'mini') { if (last && item.clientId === last.clientId + '-m') ui.miniMsg = 'mini games not taken: ' + reason; continue; }
        if (last && item.clientId === last.clientId) { ui.sent = ''; ui.err = reason; }
        continue;
      }
      if (kind === 'mini') { if (last && item.clientId === last.clientId + '-m') ui.miniMsg = res.status === 200 || res.status === 201 ? 'mini games sent' : 'mini games not taken: ' + (res.j.error || 'refused'); continue; }
      if (last && item.clientId === last.clientId) { if (res.status === 200 || res.status === 201) { ui.sent = res.j.rank ? 'sent! board rank #' + res.j.rank : 'sent!'; ui.err = ''; } else { ui.sent = ''; ui.err = res.j.error || 'refused'; } }
    }
    if (q.length && last && q.some(x => x.clientId === last.clientId)) { ui.sent = 'saved here; it will be sent when the board answers'; }
  } finally { state.syncing = false; }
  loadLists();   // not refresh(): that would call sync() again and, with the board down, loop without end
}
const has2p = () => !!last && last.mini.some(x => x.mode === '2p');
function submit(name, p2name, yearRaw) {
  if (!last) return;
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (!NAME_RE.test(n) || !/[A-Za-z]/.test(n)) { ui.err = 'name: 3-16 letters, numbers, space, _ . -'; bump(); return; }
  const p2 = has2p() ? String(p2name || '').trim().replace(/\s+/g, ' ') : '';
  if (p2 && (!NAME_RE.test(p2) || !/[A-Za-z]/.test(p2))) { ui.err = 'P2 name: 3-16 letters, numbers, space, _ . - (or leave it empty)'; bump(); return; }
  if (p2 && p2.toLowerCase() === n.toLowerCase()) { ui.err = 'P1 and P2 need different names'; bump(); return; }
  ls.set(K.name, n); if (p2) ls.set(K.p2, p2);
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(last.seed)) { ui.err = 'this seed has characters the board does not take (use a-z, 0-9, -)'; bump(); return; }
  if (queue().some(x => x.clientId === last.clientId) || localOnly().some(x => x.clientId === last.clientId) || (ui.sent && ui.sent !== 'sending...')) return;
  // age gate (only the yes/no under-13 mark is stored; the year never is)
  if (ageUnder13Session) {
    const row = { name: n, score: last.score, seed: last.seed, result: last.result, gems: last.gems, runMs: last.runMs, stats: last.stats, miniPts: last.miniPts, clientId: last.clientId, reason: 'kept on this device; not sent' };
    setLocalOnly([...localOnly().filter(x => x.clientId !== last.clientId), row]);
    ui.err = ''; ui.sent = 'kept on this device; not sent'; bump(); loadLists(); return;
  }
  if (!ageOkSession) {
    const y = String(yearRaw || '').trim();
    if (!y) { ui.needYear = true; ui.err = 'what year were you born?'; bump(); return; }
    if (!/^\d{4}$/.test(y)) { ui.needYear = true; ui.err = 'enter a 4-digit year'; bump(); return; }
    const year = +y, cy = new Date().getFullYear();
    if (year > cy || year < 1900) { ui.needYear = true; ui.err = 'that year does not look right'; bump(); return; }
    if (cy - year < 13) {
      ageUnder13Session = true; ls.set(K.age, '1');
      const row = { name: n, score: last.score, seed: last.seed, result: last.result, gems: last.gems, runMs: last.runMs, stats: last.stats, miniPts: last.miniPts, clientId: last.clientId, reason: 'kept on this device; not sent' };
      setLocalOnly([...localOnly().filter(x => x.clientId !== last.clientId), row]);
      ui.needYear = false; ui.err = ''; ui.sent = 'kept on this device; not sent'; bump(); loadLists(); return;
    }
    ageOkSession = true; ls.set(K.age, '0'); ui.needYear = false;
  }
  const items = [{ name: n, score: last.score, seed: last.seed, result: last.result, gems: last.gems, runMs: last.runMs, stats: last.stats, miniPts: last.miniPts, clientId: last.clientId }];
  if (last.mini.length) items.push({ kind: 'mini', name: n, ...(p2 ? { p2 } : {}), results: last.mini, clientId: last.clientId + '-m' });
  setQueue([...queue(), ...items]);
  ui.err = ''; ui.sent = 'sending...'; bump(); sync();
}

/* ---------- UI (its own box, outside the game panel, so game keys and clicks are untouched) ---------- */
const ui = { tab: ['all', 'seed', 'members', 'mini'].includes(ls.get(K.tab)) ? ls.get(K.tab) : 'all', open: false, sent: '', err: '', miniMsg: '', ver: 0, mg: 'all', mm: 'all', draft: {}, needYear: false };
const css = document.createElement('style');
css.textContent = '#msc{position:fixed;right:12px;top:50%;transform:translateY(-50%);width:min(290px,24vw);max-height:92vh;overflow:auto;box-sizing:border-box;z-index:6;display:none;' +
  'background:rgba(243,230,196,.96);color:#3f2616;border:3px solid #3f2616;border-radius:6px;padding:8px 10px;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;box-shadow:0 0 0 4px rgba(31,92,88,.8);-webkit-user-select:text;user-select:text}' +
  '#msc h2{margin:0 0 2px;font-size:15px;color:#5a3a22;letter-spacing:.04em} #msc .lbl{font-size:11px;color:#a0522d;font-weight:bold}' +
  '#msc .tabs{display:flex;gap:4px;margin:5px 0} #msc .tabs b{flex:1;text-align:center;padding:2px 0;border:2px solid #3f2616;border-radius:3px;cursor:pointer;opacity:.6;font-size:11px} #msc .tabs b.sel{opacity:1;background:#d9894a;color:#f3e6c4}' +
  '#msc ol{margin:4px 0;padding:0;list-style:none} #msc li{display:grid;grid-template-columns:1.8em 1fr auto;gap:4px;padding:1px 0;border-bottom:1px dotted rgba(63,38,22,.3)} #msc li.me{background:rgba(232,193,74,.45)} #msc li.pend{opacity:.65;font-style:italic}' +
  '#msc li .s{font-weight:bold} #msc li .sd{grid-column:2/4;font-size:10px;opacity:.7;margin-top:-2px} #msc .st{font-size:10px;opacity:.8;margin:3px 0}' +
  '#msc form{margin:6px 0;padding:6px;border:2px dashed rgba(63,38,22,.5);border-radius:4px} #msc input{width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:3px;border:2px solid #3f2616;border-radius:3px;background:#fff9ea;color:#3f2616}' +
  '#msc button{margin-top:4px;width:100%;font:inherit;font-weight:bold;padding:4px;border:2px solid #3f2616;border-radius:3px;background:#d9894a;color:#fff7e6;cursor:pointer} #msc button:disabled{opacity:.5;cursor:default}' +
  '#msc .ok{color:#2c6c66;font-weight:bold} #msc .er{color:#b0302a;font-weight:bold} #msc .mobs{font-size:10px;margin-top:4px} #msc .mobs td{padding:0 4px 0 0} #msc a{color:#2c6c66;cursor:pointer;text-decoration:underline}' +
  '#msc .sel2{display:flex;flex-wrap:wrap;gap:3px;margin:2px 0;font-size:10px} #msc .sel2 i{font-style:normal;padding:0 4px;border:1px solid #3f2616;border-radius:3px;cursor:pointer;opacity:.6} #msc .sel2 i.sel{opacity:1;background:#2c6c66;color:#f3e6c4}' +
  '#msc .chase{margin:5px 0 3px;padding:4px 6px;background:rgba(217,137,74,.22);border:2px solid #d9894a;border-radius:3px;font-weight:bold;color:#5a3a22} #msc li.lead .s{color:#a0522d}' +
  '#msc .pv{font-size:10px;opacity:.75;margin-top:4px} #msc .x{display:none;position:absolute;right:6px;top:4px;cursor:pointer;font-weight:bold}' +
  '#mscb{position:fixed;left:6px;top:6px;z-index:6;display:none;padding:5px 9px;font:bold 12px ui-monospace,Menlo,Consolas,monospace;color:#f3e6c4;background:rgba(31,20,14,.8);border:2px solid #e8c14a;border-radius:4px;cursor:pointer}' +
  '@media (min-width:1181px){#panel.title{left:calc((100vw - 314px) / 2);width:min(900px,calc(100vw - 340px))}}' +
  '@media (min-width:1300px) and (min-height:860px){#panel.title{width:min(1300px,calc(100vw - 340px))}}' +
  '@media (max-width:1180px){#msc{right:50%;transform:translate(50%,-50%);width:min(340px,92vw)} #msc .x{display:block} #msc.closed{display:none!important}}';
document.head.appendChild(css);
const box = document.createElement('div'); box.id = 'msc'; box.className = 'closed'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Top scores');
const btn = document.createElement('div'); btn.id = 'mscb'; btn.textContent = 'TOP SCORES';
document.body.appendChild(box); document.body.appendChild(btn);
const stop = e => e.stopPropagation();
// nothing typed or clicked in the score box reaches the game (Enter would restart, N / D / H change the screen)
['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'click', 'contextmenu'].forEach(t => { box.addEventListener(t, stop); btn.addEventListener(t, stop); });
btn.addEventListener('click', () => { ui.open = !ui.open; box.classList.toggle('closed', !ui.open); });

const game = () => window.mudScoresGame || { state: () => 'title', seed: () => '' };

function ago(at) {
  if (!at) return '';
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (sec < 8) return 'updated just now';
  if (sec < 60) return 'updated ' + sec + 's ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return 'updated ' + min + ' min ago';
  return 'updated ' + new Date(at).toLocaleTimeString();
}
function chaseLine(rows, tab, seed) {
  const me = (ls.get(K.name) || '').toLowerCase();
  if (!rows.length) return 'no scores yet — take first place';
  const idx = me ? rows.findIndex(r => String(r.name).toLowerCase() === me) : -1;
  if (idx === 0) return "you're #1 — defend it";
  if (idx > 0) {
    const above = rows[idx - 1], gap = Math.max(0, (+above.score) - (+rows[idx].score));
    return "you're #" + (idx + 1) + ' — ' + gap + ' to beat ' + above.name;
  }
  const lead = rows[0];
  if (last && Number.isFinite(+last.score) && (tab !== 'seed' || last.seed === seed)) {
    const gap = (+lead.score) - (+last.score);
    if (gap < 0) return 'your ' + last.score + ' would take the lead from ' + lead.name;
    if (gap === 0) return 'your ' + last.score + ' ties ' + lead.name + ' — send it to claim the spot';
    return last.score + ' now — ' + gap + ' to beat ' + lead.name + ' at ' + lead.score;
  }
  return 'can you beat ' + lead.name + ' at ' + lead.score + '?';
}

let shown = '', lastSt = '';
function bump() { ui.ver++; }
function boardHtml(tab, seed) {
  const b = state.boards[boardKey(tab, seed)] || jget(K.cache + boardKey(tab, seed), null);
  const me = (ls.get(K.name) || '').toLowerCase();
  let rows = (b && b.scores ? b.scores : []).map(r => ({ ...r, pend: false }));
  if (tab !== 'members') {
    for (const q of queue()) if (q.kind !== 'mini' && (tab === 'all' || q.seed === seed)) rows.push({ name: q.name, score: q.score, seed: q.seed, pend: true });
    for (const q of refused()) if (q.kind !== 'mini' && (tab === 'all' || q.seed === seed)) rows.push({ name: q.name, score: q.score, seed: q.seed, pend: true, reason: q.reason ? ('not sent: ' + q.reason) : 'not sent: refused' });
    for (const q of localOnly()) if (tab === 'all' || q.seed === seed) rows.push({ name: q.name, score: q.score, seed: q.seed, pend: true, reason: q.reason || 'kept on this device; not sent' });
  }
  rows.sort((a, c) => c.score - a.score); rows = rows.slice(0, 10);
  let h = '<div class="chase">' + esc(chaseLine(rows, tab, seed)) + '</div>';
  h += '<ol>' + (rows.length ? rows.map((r, i) => '<li class="' + (i === 0 && !r.pend ? 'lead' : '') + (r.pend ? ' pend' : '') + (String(r.name).toLowerCase() === me ? ' me' : '') + '"><span>' + (i + 1) + '.</span><span>' + esc(r.name) + (r.member ? ' &#9733;' : '') + '</span><span class="s">' + (+r.score) + '</span>' +
    (tab !== 'seed' ? '<span class="sd">seed ' + esc(r.seed) + (r.pend ? ' &middot; ' + esc(r.reason || 'not sent yet') : '') + '</span>' : r.pend ? '<span class="sd">' + esc(r.reason || 'not sent yet') + '</span>' : '') + '</li>').join('') : '<li><span></span><span>' + (tab === 'members' ? 'no member scores yet' : 'no scores yet') + '</span><span></span></li>') + '</ol>';
  if (b && b.at && state.online !== false) h += '<div class="st">' + esc(ago(b.at)) + '</div>';
  const st = state.online === false ? 'offline: ' + (b ? 'saved list from ' + new Date(b.at).toLocaleString() : 'no saved list yet') : state.online ? '' : 'loading...';
  if (st) h += '<div class="st">' + esc(st) + '</div>';
  return h;
}
function miniHtml() {
  const key = 'mini|' + ui.mg + '|' + ui.mm, b = state.boards[key] || jget(K.cache + key, null), me = (ls.get(K.name) || '').toLowerCase();
  const pick = (attr, cur, list) => '<div class="sel2">' + list.map(([v, l]) => '<i ' + attr + '="' + v + '"' + (cur === v ? ' class="sel"' : '') + '>' + l + '</i>').join('') + '</div>';
  let h = pick('data-mg', ui.mg, [['all', 'all games'], ...Object.entries(MINI).map(([k, v]) => [k, v.toLowerCase()])]) + pick('data-mm', ui.mm, [['all', 'solo + 2p'], ['solo', 'solo vs buddy'], ['2p', '2 players']]);
  const rows = b && b.rows ? b.rows : [];
  h += '<ol>' + (rows.length ? rows.map((r, i) => '<li class="' + (String(r.name).toLowerCase() === me ? 'me' : '') + '"><span>' + (i + 1) + '.</span><span>' + esc(r.name) + (r.p2only ? ' <small>(P2)</small>' : '') + '</span><span class="s">' + (+r.wins) + '-' + (+r.losses) + (r.draws ? '-' + (+r.draws) : '') + '</span></li>').join('')
    : '<li><span></span><span>no mini game results yet</span><span></span></li>') + '</ol><div class="st">wins-losses(-ties); P2 names are typed by P1, not signed in</div>';
  const st = state.online === false ? 'offline: ' + (b ? 'saved list from ' + new Date(b.at).toLocaleString() : 'no saved list yet') : state.online ? '' : 'loading...';
  if (st) h += '<div class="st">' + esc(st) + '</div>';
  return h;
}
function mobsHtml() {
  const m = state.stats || jget(K.cache + 'stats', null);
  if (!m || !m.length) return '';
  return '<div class="mobs"><b>mobs vs players</b><table><tr><td></td><td>beaten</td><td>got players</td></tr>' + m.slice(0, 8).map(r => '<tr><td>' + esc(r.mob) + '</td><td>' + (+r.kills) + '</td><td>' + (+r.deaths) + '</td></tr>').join('') + '</table></div>';
}
function render() {
  const st = game().state(), seed = game().seed(), menu = st === 'title' || st === 'end';
  if (st !== lastSt) { lastSt = st; if (menu) refresh(); if (st === 'end') { ui.open = innerWidth > 1180; } }
  box.style.display = menu ? 'block' : 'none'; btn.style.display = menu && innerWidth <= 1180 ? 'block' : 'none';
  { const t = st === 'end' && last && !ui.sent ? 'SEND YOUR SCORE' : 'TOP SCORES'; if (btn.textContent !== t) btn.textContent = t; }
  box.classList.toggle('closed', innerWidth <= 1180 && !ui.open);
  if (!menu) return;
  const key = ui.ver + '|' + st + '|' + seed + '|' + ui.tab + '|' + ui.mg + '|' + ui.mm + '|' + queue().length + '|' + refused().length + '|' + localOnly().length + '|' + ageOkSession + '|' + ageUnder13Session + '|' + !!ui.needYear;
  if (key === shown) return; shown = key;
  const ae = document.activeElement, typing = ae && (ae.id === 'msc-name' || ae.id === 'msc-p2' || ae.id === 'msc-year') ? ae.id : null;
  const typed = id => ui.draft[id] !== undefined ? ui.draft[id] : null;
  const tab = (t, l) => '<b data-t="' + t + '"' + (ui.tab === t ? ' class="sel"' : '') + '>' + l + '</b>';
  // privacy line: inside the game over form, right above SEND SCORE, so it is read before sending; under the board otherwise
  const pvHtml = '<div class="pv">' + esc(PRIVACY_LINE) + ' <a href="' + PRIVACY_URL + '" target="_blank" rel="noopener">Privacy note</a></div>';
  let h = '<span class="x" data-x="1">X</span><h2>TOP SCORES</h2><div class="lbl">' + LABEL + '</div>' +
    '<div class="tabs">' + tab('all', 'ALL') + tab('seed', 'THIS SEED') + tab('members', 'MEMBERS') + tab('mini', 'MINI') + '</div>' + (ui.tab === 'mini' ? miniHtml() : boardHtml(ui.tab, seed));
  if (st === 'end' && last) {
    const done = !!ui.sent && ui.sent !== 'sending...';
    const mt = last.mini.reduce((a, x) => [a[0] + x.w, a[1] + x.l, a[2] + x.d], [0, 0, 0]);
    h += '<form id="msc-form" autocomplete="off"><div>your score <b>' + last.score + '</b> &middot; seed ' + esc(last.seed) + '</div>' +
      (last.miniPts ? '<div class="st">incl. ' + last.miniPts + ' mini game points</div>' : '') +
      (last.mini.length ? '<div class="st">mini games this run: ' + mt[0] + ' won, ' + mt[1] + ' lost' + (mt[2] ? ', ' + mt[2] + ' tied' : '') + '</div>' : '') +
      '<input id="msc-name" maxlength="16" placeholder="sign your name" value="' + esc(typed('msc-name') !== null ? typed('msc-name') : (ls.get(K.name) || '')) + '"' + (done ? ' disabled' : '') + '>' +
      (has2p() ? '<input id="msc-p2" maxlength="16" placeholder="P2 name (2-player games, optional)" style="margin-top:3px" value="' + esc(typed('msc-p2') !== null ? typed('msc-p2') : (ls.get(K.p2) || '')) + '"' + (done ? ' disabled' : '') + '>' : '') +
      (!ageOkSession && !ageUnder13Session ? '<input id="msc-year" maxlength="4" inputmode="numeric" placeholder="what year were you born?" style="margin-top:3px" value="' + esc(typed('msc-year') !== null ? typed('msc-year') : '') + '"' + (done ? ' disabled' : '') + '>' : '') +
      pvHtml + '<button type="submit"' + (done || ui.sent === 'sending...' ? ' disabled' : '') + '>' + (done ? ( /kept on this device/.test(ui.sent) ? 'KEPT LOCAL' : 'SENT') : 'SEND SCORE') + '</button>' +
      (ui.sent ? '<div class="ok">' + esc(ui.sent) + '</div>' : '') + (ui.err ? '<div class="er">' + esc(ui.err) + '</div>' : '') + (ui.miniMsg ? '<div class="st">' + esc(ui.miniMsg) + '</div>' : '') + '</form>';
  }
  h += '<div class="st">' + (state.me ? 'signed in as ' + esc(state.me) + ' (GitHub) &middot; <a data-a="out">sign out</a>' : (state.signin ? '<a data-a="in">sign in with GitHub</a> for the members list' : '')) + '</div>';
  h += mobsHtml() + (st === 'end' && last ? '' : pvHtml);
  if (LOCAL) h += '<div class="pv">board: ' + esc(endpoint) + '</div>';
  box.innerHTML = h;
  if (typing) { const i = document.getElementById(typing); if (i && !i.disabled) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
box.addEventListener('click', e => {
  const g = e.target.closest('[data-mg],[data-mm]'); if (g) { if (g.dataset.mg) ui.mg = g.dataset.mg; else ui.mm = g.dataset.mm; bump(); loadMini(); return; }
  const t = e.target.closest('[data-t]'); if (t) { ui.tab = t.dataset.t; ls.set(K.tab, ui.tab); bump(); refresh(); return; }
  if (e.target.closest('[data-x]')) { ui.open = false; box.classList.add('closed'); return; }
  const a = e.target.closest('[data-a]'); if (!a) return;
  if (a.dataset.a === 'in') { if (!endpoint || !state.signin) return; location.assign(endpoint + '/auth/github/start?return=' + encodeURIComponent(location.origin + location.pathname + location.search)); }
  else { api('/auth/logout', { method: 'POST' }).catch(() => {}); ls.del(K.token); state.me = null; bump(); }
});
box.addEventListener('input', e => { if (e.target.id === 'msc-name' || e.target.id === 'msc-p2' || e.target.id === 'msc-year') ui.draft[e.target.id] = e.target.value; });
box.addEventListener('submit', e => { e.preventDefault(); const i = document.getElementById('msc-name'), j = document.getElementById('msc-p2'), y = document.getElementById('msc-year'); submit(i ? i.value : '', j ? j.value : '', y ? y.value : ''); });
function loadLists() { const seed = game().seed(); if (ui.tab === 'mini') loadMini(); else loadBoard(ui.tab, seed); loadStats(); }
// retry unsent scores at most every 10 s from here (the 30 s timer and the 'online' event also retry)
function refresh() { loadLists(); if (queue().length && Date.now() - (state.failAt || 0) > 10000) sync(); }
addEventListener('online', () => { sync(); });
setInterval(() => { if (queue().length) sync(); }, 30000);
// keep the title / game-over list fresh so people see new scores without reloading
setInterval(() => {
  try {
    if (document.hidden) return;
    const st = game().state();
    if (st !== 'title' && st !== 'end') return;
    refresh();
  } catch (e) {}
}, 15000);
(function tick() { try { render(); } catch (e) {} requestAnimationFrame(tick); })();
if (endpoint) { loadHealth(); loadMe(); if (queue().length) sync(); } else { state.online = false; }

window.mudScores = { on, miniResult, addRunPoints, MINI_GAMES: Object.keys(MINI), endpoint: () => endpoint, LABEL, sync, submit, refresh, _state: state, _ui: ui, _last: () => last, queue, refused, localOnly, mobOf };
// test hook only on localhost / 127.0.0.1, never on the live host
if (LOCAL) window.mudScores._resetAgeGate = () => { ageOkSession = false; ageUnder13Session = false; ls.del(K.age); ui.needYear = false; };
})();
