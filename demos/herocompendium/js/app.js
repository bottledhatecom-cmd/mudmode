// mockworld app (t111u+): drives the REAL HeroCompendium Lua (Lua 5.1.5 wasm + the box WoW stub) over a procedural 3D meadow.
// MOCK WORLD - not the real WoW Forever client - results UNPROVEN. No network calls, no analytics; nothing is sent by this page.
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const BUILD = window.MW_BUILD || { sha: 'dev', addon: '?', built: '?' };
  const LSK = 'mwhc.';
  const ls = { get(k, d) { try { const v = localStorage.getItem(LSK + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem(LSK + k, JSON.stringify(v)); } catch (e) { } }, del(k) { try { localStorage.removeItem(LSK + k); } catch (e) { } } };
  const MODS = ['Journal', 'DungeonAdvisor', 'GearPlanner', 'Recipes', 'Talents', 'RestedXP', 'QoL', 'SafetyNet', 'Training', 'Bestiary', 'Buffs', 'Share'];
  const SIZES = { '1280x800': [1280, 800], '1920x1080': [1920, 1080], 'ultrawide': [2560, 1080] };
  const cfg = Object.assign({ size: '1280x800', scale: 1, level: 60, cls: 'Hunter', faction: 'Alliance', reduce: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), tools: true }, ls.get('cfg', {}));
  let W = SIZES[cfg.size][0], H = SIZES[cfg.size][1];
  let vm = null, world = null, luaMod = null, ready = false;
  const MW = window.MWApp = { log: [], cfg, stats: { frames: 0, errors: 0 } };

  // ------------------------------------------------------------ event log
  const logEl = () => $('#mw-log');
  function addLog(kind, msg) {
    const e = { t: new Date().toTimeString().slice(0, 8), kind, msg: String(msg) };
    MW.log.push(e); if (MW.log.length > 400) MW.log.shift();
    if (kind === 'error') { MW.stats.errors++; const c = $('#mw-errcount'); if (c) c.textContent = MW.stats.errors; }
    const el = logEl(); if (!el) return;
    const li = document.createElement('li'); li.className = 'log-' + kind;
    const pre = document.createElement('span'); pre.className = 'log-t'; pre.textContent = e.t + ' ' + kind;
    const body = document.createElement('span'); body.className = 'log-m'; body.textContent = e.msg;
    li.append(pre, body); el.append(li); while (el.children.length > 200) el.firstChild.remove(); el.scrollTop = el.scrollHeight;
  }
  MW.addLog = addLog;
  window.addEventListener('error', (ev) => addLog('error', 'page: ' + ev.message));

  // ------------------------------------------------------------ media (data-URL scripts, so file:// canvases stay untainted)
  const IMG = {};
  window.MWImg = (path, data) => { const e = IMG[path]; if (e) e.img.src = data; };
  function getImg(key) {
    const m = window.MW_MEDIA[key]; if (!m || !m[0]) return undefined;
    let e = IMG[m[0]];
    if (!e) { e = IMG[m[0]] = { img: new Image(), ready: false }; e.img.onload = () => { e.ready = true; }; const sc = document.createElement('script'); sc.src = m[0].replace(/\.webp$/, '.js'); document.head.appendChild(sc); }
    return e.ready ? e.img : null;
  }
  const tintCache = new Map();
  function tinted(img, path, r, g, b, desat) {
    const q = (v) => Math.round(v * 32) / 32; const key = path + '|' + q(r) + ',' + q(g) + ',' + q(b) + (desat ? 'd' : '');
    let c = tintCache.get(key); if (c) { tintCache.delete(key); tintCache.set(key, c); return c; }
    c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d');
    if (desat) x.filter = 'grayscale(1)'; x.drawImage(img, 0, 0); x.filter = 'none';
    x.globalCompositeOperation = 'multiply'; x.fillStyle = `rgb(${q(r) * 255},${q(g) * 255},${q(b) * 255})`; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0);
    tintCache.set(key, c); if (tintCache.size > 48) tintCache.delete(tintCache.keys().next().value);
    return c;
  }

  // ------------------------------------------------------------ WoW text markup -> colored runs
  function runs(text, base) {
    const out = []; let col = base, i = 0, buf = '';
    const push = () => { if (buf) { out.push([buf, col]); buf = ''; } };
    text = text.replace(/\|T[^|]*\|t/g, '\u25c6').replace(/\|A[^|]*\|a/g, '').replace(/\|K[^|]*\|k/g, '').replace(/\|H[^|]*\|h(.*?)\|h/g, '$1').replace(/\|n/g, '\n');
    while (i < text.length) {
      const ch = text[i];
      if (ch === '|' && text[i + 1] === '|') { buf += '|'; i += 2; continue; }
      if (ch === '|' && text[i + 1] === 'c' && /^[0-9a-fA-F]{8}$/.test(text.substr(i + 2, 8))) { push(); const h = text.substr(i + 4, 6); col = '#' + h; i += 10; continue; }
      if (ch === '|' && text[i + 1] === 'c' && text[i + 2] === 'n') { const j = text.indexOf(':', i); push(); col = '#ff5555'; i = j > 0 ? j + 1 : i + 3; continue; }
      if (ch === '|' && text[i + 1] === 'r') { push(); col = base; i += 2; continue; }
      buf += ch; i++;
    }
    push(); return out;
  }
  const plain = (t) => runs(t, '').map((r) => r[0]).join('');
  function rgba(c, a) { return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${(c[3] == null ? 1 : c[3]) * (a == null ? 1 : a)})`; }
  const nums = (s) => s ? s.split(',').map(Number) : null;
  function fontFor(path, px, flags) {
    const p = (path || '').toLowerCase(); const serif = p.includes('morpheus') || p.includes('skurri');
    return (serif ? '700 ' : '400 ') + px.toFixed(1) + 'px ' + (serif ? '"Alegreya SC", Georgia, serif' : 'Lato, "Segoe UI", sans-serif');
  }

  // ------------------------------------------------------------ UI renderer (port of grimoire3d/tools/v6_2_render.py, + rotation, texcoords, tint, wrap)
  const ui = { canvas: null, ctx: null, k: 1, uw: 0, uh: 0, cursor: [0, 0], focus: '', overlay: { hit: false, safe: false }, hitCache: '', safeCache: '', n: 0 };
  function drawUI(head, list) {
    const c = ui.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    const hp = head.split('\x1f'); ui.uw = +hp[0]; ui.uh = +hp[1]; ui.focus = hp[2]; ui.k = H / ui.uh;
    const k = ui.k, uh = ui.uh;
    if (!list) return 0; const L = list.split('\x1e'); let drawn = 0;
    for (const rec of L) {
      const f = rec.split('\x1f'); const x1 = +f[1] * k, x2 = +f[3] * k, y1 = (uh - +f[4]) * k, y2 = (uh - +f[2]) * k, a = +f[5];
      const w = x2 - x1, h = y2 - y1; if (w < 0.5 || h < 0.5 || w > 4 * W || h > 4 * H) continue;
      const at = f[0].indexOf('@'); let clipBox = null;   // testerfix: 'T@l,b,r,t' = clipped by a ScrollFrame / clipping parent
      if (at > 0) { const q = f[0].slice(at + 1).split(',').map(Number); f[0] = f[0].slice(0, at); clipBox = [q[0] * k, (uh - q[3]) * k, (q[2] - q[0]) * k, (q[3] - q[1]) * k]; }
      const clipIt = () => { if (clipBox) { c.beginPath(); c.rect(clipBox[0], clipBox[1], clipBox[2], clipBox[3]); c.clip(); } };
      if (f[0] === 'T') {
        const file = f[6], col = nums(f[7]), vc = nums(f[8]) || [1, 1, 1, 1], blend = f[9], rot = +f[10], tc = nums(f[11]), desat = f[12] === '1';
        c.save(); clipIt(); c.globalAlpha = Math.max(0, Math.min(1, a * vc[3]));
        c.globalCompositeOperation = blend === 'ADD' ? 'lighter' : (blend === 'MOD' ? 'multiply' : 'source-over');
        c.translate(x1 + w / 2, y1 + h / 2); if (rot) c.rotate(-rot);
        if (file) {
          let img = getImg(file);
          if (img === undefined) {   // not in the addon's Media (game icons / file IDs): honest mock placeholder
            c.fillStyle = 'rgba(58,40,90,0.9)'; c.fillRect(-w / 2, -h / 2, w, h); c.strokeStyle = 'rgba(255,214,150,0.7)'; c.lineWidth = 1; c.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
            if (w > 10) { c.fillStyle = 'rgba(255,230,190,0.9)'; c.font = `700 ${Math.min(w, h) * 0.55}px Lato, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, 1); }
            c.restore(); drawn++; continue;
          }
          if (!img) { c.restore(); continue; }
          const iw = img.naturalWidth, ih = img.naturalHeight;
          const ax = tc[0] * iw, ay = tc[1] * ih, ux = tc[4] * iw - ax, uy = tc[5] * ih - ay, vx = tc[2] * iw - ax, vy = tc[3] * ih - ay;
          const det = ux * vy - vx * uy; if (Math.abs(det) < 1e-6) { c.restore(); continue; }
          const A = w * vy / det, B = -h * uy / det, C = -w * vx / det, D = h * ux / det;
          c.beginPath(); c.rect(-w / 2, -h / 2, w, h); c.clip();
          c.transform(A, B, C, D, -w / 2 - (A * ax + C * ay), -h / 2 - (B * ax + D * ay));
          const white = vc[0] > 0.99 && vc[1] > 0.99 && vc[2] > 0.99;
          c.drawImage(white && !desat ? img : tinted(img, file, vc[0], vc[1], vc[2], desat), 0, 0);
        } else if (col) {
          c.fillStyle = rgba([col[0] * vc[0], col[1] * vc[1], col[2] * vc[2], col[3]]); c.fillRect(-w / 2, -h / 2, w, h);
        }
        c.restore(); drawn++;
      } else if (f[0] === 'F' || f[0] === 'E') {
        const isE = f[0] === 'E'; const text = f[6]; const size = +f[7] * k;
        if (!isE && !text) continue;
        const jh = isE ? 'LEFT' : f[8], jv = isE ? 'MIDDLE' : f[9], font = isE ? '' : f[10], col = isE ? [1, 0.96, 0.85, 1] : (nums(f[11]) || [1, 1, 1, 1]);
        const shadow = isE ? null : nums(f[12]), wrap = isE ? false : f[13] === '1', flags = isE ? '' : (f[14] || '');
        c.save(); clipIt(); c.globalAlpha = Math.max(0, Math.min(1, a)); c.font = fontFor(font, size * 0.95, flags); c.textBaseline = 'middle';
        const base = rgba(col, 1); const R = runs(isE ? text.replace(/\|/g, '||') : text, base);
        // lines: explicit \n, plus word wrap when the region is taller than one line and the text is wider than it
        const full = R.map((r) => r[0]).join('');
        let lines = [[]]; for (const [s, cc] of R) { const parts = s.split('\n'); parts.forEach((p, i) => { if (i > 0) lines.push([]); if (p) lines[lines.length - 1].push([p, cc]); }); }
        const lh = size * 1.18;
        if (wrap && h > lh * 1.5) {
          const out = []; for (const ln of lines) { let cur = [], cw = 0;
            for (const [s, cc] of ln) for (const word of s.split(/(\s+)/)) { if (!word) continue; const ww = c.measureText(word).width;
              if (cw + ww > w + 1 && cw > 0 && word.trim()) { out.push(cur); cur = []; cw = 0; if (!word.trim()) continue; }
              cur.push([word, cc]); cw += ww; }
            out.push(cur); }
          lines = out;
        }
        const total = lines.length * lh; let y = jv === 'TOP' ? y1 + lh / 2 : (jv === 'BOTTOM' ? y2 - total + lh / 2 : (y1 + y2) / 2 - total / 2 + lh / 2);
        for (const ln of lines) {
          const tw = ln.reduce((s, r) => s + c.measureText(r[0]).width, 0);
          let x = isE ? x1 + 4 : (jh === 'LEFT' ? x1 : (jh === 'RIGHT' ? x2 - tw : (x1 + x2) / 2 - tw / 2));
          for (const [s, cc] of ln) {
            if (shadow && shadow[3] > 0) { c.fillStyle = rgba(shadow, 1); c.fillText(s, x + k, y + k); }
            if (flags.includes('OUTLINE')) { c.lineWidth = Math.max(1, size / 9); c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(s, x, y); }
            c.fillStyle = cc || base; c.fillText(s, x, y); x += c.measureText(s).width;
          }
          if (isE && f[8] === '1' && (performance.now() % 1000) < 560) { c.fillStyle = '#ffe9b0'; c.fillRect(x + 1, y - size * 0.5, Math.max(1, k), size); }
          y += lh;
        }
        c.restore(); drawn++;
      }
    }
    return drawn;
  }
  function drawOverlays() {
    const c = ui.ctx, k = ui.k, uh = ui.uh;
    if (ui.overlay.safe) {
      if (ui.n % 6 === 0) ui.safeCache = vm.run('return MW.safeAreas()');
      c.save(); c.strokeStyle = 'rgba(90,255,150,0.95)'; c.fillStyle = 'rgba(90,255,150,0.10)'; c.lineWidth = 2; c.setLineDash([6, 4]);
      for (const poly of ui.safeCache.split(';').filter(Boolean)) { c.beginPath(); poly.split(' ').forEach((p, i) => { const [x, y] = p.split(',').map(Number); const X = x * k, Y = (uh - y) * k; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); c.fill(); c.stroke(); }
      c.restore();
    }
    if (ui.overlay.hit) {
      if (ui.n % 6 === 0) ui.hitCache = vm.run('return MW.hitBoxes()');
      c.save(); c.lineWidth = 1; c.font = '11px Lato, sans-serif';
      for (const b of ui.hitCache.split(';').filter(Boolean)) { const p = b.split(','); const X = +p[0] * k, Y = (uh - +p[3]) * k, Wd = (+p[2] - +p[0]) * k, Hd = (+p[3] - +p[1]) * k;
        const over = ui.cursor[0] >= +p[0] && ui.cursor[0] <= +p[2] && ui.cursor[1] >= +p[1] && ui.cursor[1] <= +p[3];
        c.strokeStyle = over ? 'rgba(255,220,120,1)' : 'rgba(80,220,255,0.8)'; c.fillStyle = over ? 'rgba(255,220,120,0.18)' : 'rgba(80,220,255,0.06)'; c.fillRect(X, Y, Wd, Hd); c.strokeRect(X + 0.5, Y + 0.5, Wd - 1, Hd - 1);
        if (over) { c.fillStyle = '#ffe7a8'; c.fillText(p[4], X + 3, Y + 12); } }
      c.restore();
    }
  }

  // ------------------------------------------------------------ chat box (HTML) + slash commands
  function chatLine(text, sys) {
    const box = $('#mw-chat-lines'); const div = document.createElement('div'); div.className = sys ? 'chat-sys' : 'chat-line';
    for (const [s, cc] of runs(text, '')) { const sp = document.createElement('span'); sp.textContent = s; if (cc) sp.style.color = cc; div.append(sp); }
    box.append(div); while (box.children.length > 80) box.firstChild.remove(); box.scrollTop = box.scrollHeight;
  }
  MW.slash = function (line) {
    line = String(line || '').trim(); if (!line) return;
    addLog('slash', line);
    if (/^\/reload\b/i.test(line) || /^\/rl\b/i.test(line)) { reboot('slash /reload'); return; }
    if (!line.startsWith('/')) { chatLine('[Testbot]: ' + line); return; }
    let ok = 'false'; try { ok = vm.slash(line); } catch (e) { addLog('error', e.message); }
    if (ok !== 'true') chatLine('Unknown command: ' + line.split(' ')[0] + ' (mock world: only addon slash commands and /reload)', true);
  };

  // ------------------------------------------------------------ boot / reboot (fresh Lua state; SavedVariables kept in localStorage)
  function saveSV(logout) { if (!vm) return; try { const t = vm.run(`return MW.saveSV(${vm.q(window.MW_LUA.svnames.join(','))}, ${logout ? 'true' : 'false'})`); ls.set('sv', t); } catch (e) { addLog('error', 'save SavedVariables: ' + e.message); } }
  MW.saveSV = saveSV;
  function boot() {
    const sv = ls.get('sv', '');
    vm = new window.HCVM(luaMod);
    const ms = vm.boot(window.MW_LUA, window.MW_MEDIA, { w: W, h: H, scale: cfg.scale, level: cfg.level, cls: cfg.cls, faction: cfg.faction, sv, firstRun: sv ? null : MODS });
    if (cfg.reduce) vm.run('STUB.ns.DB.SetSetting("reduceMotion", true)');
    vm.run('MW.chatSeen = #STUB.chat');
    addLog('info', `addon booted in ${ms} ms (real Lua 5.1.5, ${window.MW_LUA.files.length} toc files) as level ${cfg.level} ${cfg.faction} ${cfg.cls}${sv ? ', SavedVariables restored' : ', fresh SavedVariables'}`);
    for (const e of vm.errors()) addLog('error', e);
    MW.vm = vm; ready = true; refreshChapters(); syncTools();
  }
  function reboot(why) { saveSV(true); ready = false; addLog('info', 'reload: ' + why); boot(); chatLine('UI reloaded (' + why + ')', true); }
  MW.reboot = reboot;

  // ------------------------------------------------------------ viewport + input
  const game = () => $('#mw-game');
  function layout() {
    const g = game(), wrap = $('#mw-stage'); g.style.width = W + 'px'; g.style.height = H + 'px';
    ui.canvas.width = W; ui.canvas.height = H; world.setSize(W, H);
    const avail = wrap.clientWidth; const s = Math.min(1, avail / W); g.style.transform = `scale(${s})`; wrap.style.height = (H * s) + 'px'; MW.viewScale = s;
    $('#mw-res').textContent = `${W}\u00d7${H} \u00b7 UI scale ${cfg.scale}`;
  }
  MW.setSize = function (name) { if (!SIZES[name]) return; cfg.size = name; [W, H] = SIZES[name]; ls.set('cfg', cfg); layout(); if (vm) { vm.run(`STUB.setScreen(${W}, ${H}, ${cfg.scale}); STUB.fire("DISPLAY_SIZE_CHANGED")`); } addLog('info', 'window size ' + name); syncTools(); };
  MW.setScale = function (s) { cfg.scale = +s; ls.set('cfg', cfg); if (vm) vm.run(`STUB.setScreen(${W}, ${H}, ${cfg.scale}); STUB.fire("UI_SCALE_CHANGED")`); layout(); addLog('info', 'UI scale ' + s); syncTools(); };
  MW.uiToClient = function (x, y) { const r = ui.canvas.getBoundingClientRect(); return [r.left + x * ui.k * r.width / W, r.top + (ui.uh - y) * ui.k * r.height / H]; };
  function toUI(ev) {
    const r = ui.canvas.getBoundingClientRect(); const px = (ev.clientX - r.left) * W / r.width, py = (ev.clientY - r.top) * H / r.height;
    return [px / ui.k, ui.uh - py / ui.k, px, py];
  }
  let drag = null;
  function bindInput() {
    const cv = ui.canvas, g = game();
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousemove', (e) => { const [x, y] = toUI(e); ui.cursor = [x, y];
      if (drag && drag.world) { world.orbit(e.movementX / MW.viewScale, e.movementY / MW.viewScale); } });
    cv.addEventListener('mousedown', (e) => { g.focus({ preventScroll: true }); const [x, y] = toUI(e); ui.cursor = [x, y];
      if (e.button === 0 && ready) { const over = vm.run(`return MW.overHit(${x}, ${y})`) === '1'; const name = vm.run(`return MW.down(${x}, ${y})`);
        if (over) { drag = { ui: true }; addLog('click', `${name || 'frame'} @ ${x.toFixed(0)},${y.toFixed(0)}`); } else drag = { world: true }; }
      else drag = { world: true }; e.preventDefault(); });
    window.addEventListener('mouseup', (e) => { if (drag && drag.ui && ready) { const [x, y] = toUI(e); vm.run(`return MW.up(${x}, ${y})`); } else if (ready && drag) { try { vm.run('STUB.down = nil') } catch (_) { } } drag = null; });
    cv.addEventListener('wheel', (e) => { const [x, y] = toUI(e); let used = '0'; if (ready) used = vm.run(`return MW.wheel(${x}, ${y}, ${e.deltaY < 0 ? 1 : -1})`); if (used !== '1') world.zoom(e.deltaY); e.preventDefault(); }, { passive: false });
    g.addEventListener('keydown', (e) => {
      if (e.target !== g) return;
      if (e.code === 'F1') return;   // handled on window
      if (ready && vm.run('return MW.focusedEdit() and "1" or "0"') === '1') {
        const map = { Backspace: 'BACKSPACE', Enter: 'ENTER', Escape: 'ESCAPE', Tab: 'TAB', ArrowUp: 'UP', ArrowDown: 'DOWN' };
        if (map[e.key]) { vm.run(`return MW.key("${map[e.key]}")`); if (e.key === 'Enter') addLog('click', 'search: Enter'); }
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) vm.run(`return MW.key("char", ${vm.q(e.key)})`);
        e.preventDefault(); return;
      }
      if (e.key === 'Enter') { openChat(''); e.preventDefault(); return; }
      if (e.key === '/') { openChat('/'); e.preventDefault(); return; }
      if (e.key === 'Escape') { const any = vm.run('return tostring(STUB.escape())'); addLog('click', 'Esc (closed a window: ' + any + ')'); e.preventDefault(); return; }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { world.keys[e.code] = true; e.preventDefault(); }
    });
    g.addEventListener('keyup', (e) => { world.keys[e.code] = false; });
    g.addEventListener('blur', () => { world.keys = {}; });
    const ci = $('#mw-chat-input');
    ci.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = ci.value; ci.value = ''; ci.hidden = true; g.focus(); MW.slash(v); e.preventDefault(); } else if (e.key === 'Escape') { ci.value = ''; ci.hidden = true; g.focus(); } e.stopPropagation(); });
    window.addEventListener('keydown', (e) => { if (e.code === 'F1') { e.preventDefault(); MW.toggleTools(); } });
    $('#mw-compartment').addEventListener('click', () => { if (!ready) return; addLog('click', 'minimap: addon compartment -> HeroCompendium_OnCompartmentClick'); try { vm.run('HeroCompendium_OnCompartmentClick(nil, "LeftButton")'); } catch (e) { addLog('error', e.message); } g.focus(); });
    window.addEventListener('resize', layout);
    window.addEventListener('pagehide', () => saveSV(true));
    setInterval(() => saveSV(false), 15000);
  }
  function openChat(pre) { const ci = $('#mw-chat-input'); ci.hidden = false; ci.value = pre; ci.focus(); }

  // ------------------------------------------------------------ main loop + perf meter
  const perf = { ft: [], lua: [], last: performance.now(), fps: 0 };
  function loop(now) {
    const real = Math.max(0, (now - perf.last) / 1000); const dt = Math.min(0.1, real); perf.last = now;
    // the addon clamps per-frame elapsed for its animations, so on slow machines we sub-step the stub at 30 Hz (max 0.25 s per frame) to keep real-time speed
    let sim = Math.min(0.25, real);
    world.reduce = cfg.reduce; world.step(dt);
    const mm = $('#mw-minimap'); const gr = game().getBoundingClientRect(), mr = mm.getBoundingClientRect(); const s = MW.viewScale || 1;
    world.render({ x: Math.round((mr.left - gr.left) / s) + 6, y: Math.round((mr.top - gr.top) / s) + 6, s: Math.round(mr.width / s) - 12 });
    if (ready) {
      const t0 = performance.now(); let out;
      try { while (sim > 1 / 30 + 1e-4) { vm.run('STUB.tick(' + (1 / 30) + ')'); sim -= 1 / 30; } out = vm.frame(sim, ui.cursor[0], ui.cursor[1]); } catch (e) { addLog('error', e.message); out = null; }
      const tl = performance.now() - t0;
      if (out) {
        const [head, chat, errs, list] = out.split('\x1d');
        if (chat) chat.split('\x1f').forEach((m) => { chatLine(m); addLog('chat', plain(m)); });
        if (errs) errs.split('\x1f').forEach((m) => addLog('error', m));
        ui.n++; MW.lastDrawn = drawUI(head, list); drawOverlays();
        ui.canvas.style.cursor = ui.focus ? 'pointer' : (drag && drag.world ? 'grabbing' : 'default');
      }
      perf.lua.push(tl); if (perf.lua.length > 120) perf.lua.shift();
    }
    perf.ft.push(dt * 1000); if (perf.ft.length > 120) perf.ft.shift(); MW.stats.frames++;
    if (MW.stats.frames % 10 === 0) drawMeter();
    if (ready && MW.stats.frames % 60 === 0) { const sig = vm.run('local o = {} for i, m in ipairs(STUB.ns.GrimoireLayout.menus) do o[i] = tostring(m.id) end return table.concat(o, ",")'); if (sig !== MW.chapSig) { MW.chapSig = sig; refreshChapters(); } }
    if (MW.stress) MW.stress.step();
    requestAnimationFrame(loop);
  }
  function drawMeter() {
    const c = $('#mw-meter'); if (!c || c.offsetParent === null) return; const x = c.getContext('2d'), w = c.width, h = c.height;
    x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(20,10,34,0.9)'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,214,150,0.25)'; x.beginPath(); x.moveTo(0, h - 16.7 * 1.2); x.lineTo(w, h - 16.7 * 1.2); x.stroke();
    const plot = (arr, col) => { x.strokeStyle = col; x.lineWidth = 1.5; x.beginPath(); arr.forEach((v, i) => { const X = i / 119 * w, Y = h - Math.min(h, v * 1.2); i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.stroke(); };
    plot(perf.ft, '#b58cff'); plot(perf.lua, '#ffd27a');
    const avg = perf.ft.reduce((a, b) => a + b, 0) / perf.ft.length, la = perf.lua.reduce((a, b) => a + b, 0) / Math.max(1, perf.lua.length);
    MW.fps = 1000 / avg; $('#mw-fps').textContent = `${(1000 / avg).toFixed(0)} fps \u00b7 ${avg.toFixed(1)} ms frame \u00b7 ${la.toFixed(1)} ms Lua \u00b7 ${MW.lastDrawn || 0} regions`;
  }

  // ------------------------------------------------------------ test toolbar actions
  const G = 'STUB.ns.Grimoire';
  const SETTLED = ['idle', 'menu', 'shut', 'viewing'];
  const act = MW.act = {
    open() { MW.slash('/hcomp book'); },
    toggle() { MW.slash('/hcomp'); },
    hide() { addLog('click', 'tool: hide book'); vm.run(`if ${G}.IsShown() then ${G}.Hide() end`); },
    chapter(i) { addLog('click', 'tool: chapter ' + i); vm.run(`if not ${G}.IsShown() then STUB.slash("/hcomp book") end; local r = ${G}.Current(); if r then ${G}.Go(r.book, ${i}) end`); },
    turn(d) { addLog('click', 'tool: page turn ' + d); vm.run(`local r = ${G}.Current(); if r then local n = #STUB.ns.GrimoireLayout.menus; local c = r.book.cur or 1; ${G}.Go(r.book, (c - 1 + ${d}) % n + 1) end`); },
    yaw(d) { MW.slash('/hcomp book yaw ' + d); }, tilt(t) { MW.slash('/hcomp book tilt ' + t); },
    close() { MW.slash('/hcomp book close'); }, reopen() { MW.slash('/hcomp book open'); },
    reduce(v) { cfg.reduce = !!v; ls.set('cfg', cfg); document.body.classList.toggle('mw-reduce', cfg.reduce); vm.run(`STUB.ns.DB.SetSetting("reduceMotion", ${cfg.reduce})`); addLog('info', 'Reduce Motion ' + (cfg.reduce ? 'on' : 'off')); },
    fake(level, cls, faction) { cfg.level = +level; cfg.cls = cls; cfg.faction = faction; ls.set('cfg', cfg); reboot(`fake character: level ${level} ${faction} ${cls}`); },
    clear() { ls.del('sv'); vm = null; ready = false; addLog('info', 'saved data cleared'); boot(); chatLine('Saved data cleared - fresh SavedVariables', true); },
  };
  MW.toggleTools = function (v) { const p = $('#mw-tools'); const open = v == null ? p.hidden : v; p.hidden = !open; cfg.tools = open; ls.set('cfg', cfg); $('#mw-tools-btn').setAttribute('aria-expanded', String(open)); if (open) drawMeter(); };
  function refreshChapters() {
    const box = $('#mw-chapters'); if (!box || !vm) return; box.textContent = '';
    const s = vm.run('local o = {} for i, m in ipairs(STUB.ns.GrimoireLayout.menus) do o[#o+1] = i .. "=" .. tostring(m.label or m.id) end return table.concat(o, "\\31")');
    for (const it of s.split('\x1f')) { const [i, name] = it.split('='); const b = document.createElement('button'); b.className = 'arc-btn small'; b.textContent = name; b.addEventListener('click', () => act.chapter(+i)); box.append(b); }
  }
  function syncTools() {
    const set = (id, v) => { const e = $(id); if (e) e.value = v; };
    set('#mw-scale', String(cfg.scale)); set('#mw-size', cfg.size); set('#mw-level', cfg.level); set('#mw-class', cfg.cls); set('#mw-faction', cfg.faction);
    const r = $('#mw-reduce'); if (r) r.checked = cfg.reduce; document.body.classList.toggle('mw-reduce', cfg.reduce);
  }
  // stress: 40 rapid flips + random clicks over the book; PASS = 0 new Lua errors, book still shown, settles back to idle
  MW.runStress = function () {
    if (MW.stress) return;
    const out = $('#mw-stress-out'); out.textContent = 'running\u2026'; out.className = 'stress-run';
    const e0 = MW.stats.errors; let step = 0; const n = 40; let clicks = 0; let hidBy = '';
    vm.run(`if not ${G}.IsShown() then STUB.slash("/hcomp book") end`);
    const box = vm.run(`local r = ${G}.Current(); local R = r and STUB.rect(r.book); if not R then return "" end; return R[1]..","..R[2]..","..R[3]..","..R[4]`).split(',').map(Number);
    addLog('info', 'stress: start (40 flips + random clicks)');
    MW.stress = { step() {
      step++;
      if (step <= n * 3) {
        if (step % 3 === 1) { vm.run(`local r = ${G}.Current(); if r then ${G}.Go(r.book, math.random(1, #STUB.ns.GrimoireLayout.menus)) end`); }
        if (box.length === 4) for (let j = 0; j < 2; j++) { const x = box[0] + (0.2 + 0.6 * Math.random()) * (box[2] - box[0]), y = box[1] + (0.2 + 0.6 * Math.random()) * (box[3] - box[1]); const nm = vm.run(`return MW.click(${x}, ${y})`); clicks++; if (!hidBy && vm.run(`return tostring(${G}.IsShown())`) !== 'true') { hidBy = `${nm || 'nothing'} @ ${x.toFixed(0)},${y.toFixed(0)} (flip ${Math.ceil(step / 3)})`; addLog('info', 'stress: book hidden by click on ' + hidBy); } }
        return;
      }
      if (step < n * 3 + 400) { const st = vm.run(`local r = ${G}.Current(); return r and r.book.state or "none"`); if (st !== 'none' && (!SETTLED.includes(st) || step < n * 3 + 60)) return; }
      const shown = vm.run(`return tostring(${G}.IsShown())`), st = vm.run(`local r = ${G}.Current(); return r and r.book.state or "none"`);
      // a random click can land on a page button whose job is to leave the book (that is the addon working); then the book must reopen and settle
      if (shown !== 'true' && !MW.stress.reopened) { MW.stress.reopened = true; vm.run('STUB.slash("/hcomp book")'); step = n * 3; return; }
      const errs = MW.stats.errors - e0; const pass = errs === 0 && shown === 'true' && SETTLED.includes(st);
      out.textContent = `${pass ? 'PASS' : 'FAIL'}: 40 flips, ${clicks} random clicks, ${errs} new Lua errors, book shown ${shown}, settled state "${st}"` + (hidBy ? `; a click on ${hidBy} left the book, it reopened and settled` : '');
      out.className = pass ? 'stress-pass' : 'stress-fail'; addLog(pass ? 'info' : 'fail', 'stress: ' + out.textContent); MW.stress = null; MW.lastStress = { pass, errs, clicks, state: st };
    } };
  };
  // bug report: .json download + clipboard text
  MW.bugReport = function (download = true) {
    const shot = document.createElement('canvas'); shot.width = W; shot.height = H; const x = shot.getContext('2d');
    let png = null; try { x.drawImage(world.renderer.domElement, 0, 0); x.drawImage(ui.canvas, 0, 0); png = shot.toDataURL('image/png'); } catch (e) { addLog('error', 'screenshot: ' + e.message); }
    let state = ''; try { state = vm.run('return MW.state()').split('\x1f'); } catch (e) { }
    const rep = { kind: 'HeroCompendium mock-world bug report', note: 'mock world - not the real WoW Forever client - results UNPROVEN', build: BUILD, time: new Date().toISOString(), userAgent: navigator.userAgent,
      settings: { window: cfg.size, w: W, h: H, uiScale: cfg.scale, level: cfg.level, class: cfg.cls, faction: cfg.faction, reduceMotion: cfg.reduce },
      book: state && { shown: state[0], chapter: state[1], state: state[2], yaw: state[3], tilt: state[4] }, fps: MW.fps && +MW.fps.toFixed(1), errorCount: MW.stats.errors,
      log: MW.log.slice(-50), logTotal: MW.log.length, screenshot: png };
    const text = `HeroCompendium demo bug (build ${BUILD.sha})\n${rep.time}\nwindow ${W}x${H}, UI scale ${cfg.scale}, level ${cfg.level} ${cfg.faction} ${cfg.cls}, reduce motion ${cfg.reduce}\nbook: ${JSON.stringify(rep.book)}\nerrors: ${MW.stats.errors}\nlast log:\n` + MW.log.slice(-12).map((l) => `${l.t} ${l.kind}: ${l.msg}`).join('\n');
    MW.lastReport = rep; MW.lastReportText = text;
    if (download) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(rep, null, 1)], { type: 'application/json' })); a.download = `hc-mockworld-bug-${rep.time.replace(/[:.]/g, '-')}.json`; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
    copyText(text); addLog('info', 'bug report saved' + (download ? ' (.json downloaded)' : '') + ' and summary copied');
    return rep;
  };
  function copyText(t) { const done = () => { const s = $('#mw-copied'); if (s) { s.textContent = 'copied'; setTimeout(() => s.textContent = '', 2000); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => fallback()); else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { } ta.remove(); } }

  // ------------------------------------------------------------ tester comment box -> mailto (the tester sends it from their own mail app)
  const MAIL = 'reports@mudmodecrew.com';
  MW.buildMailto = function () {
    const name = $('#fb-name').value.trim(), tried = $('#fb-tried').value.trim(), happened = $('#fb-happened').value.trim(), info = $('#fb-info').checked;
    const subject = `HeroCompendium demo feedback ${BUILD.sha}`;
    const head = `Tester: ${name || '(anonymous)'}\nBuild: ${BUILD.sha}\n\n`;
    const tail = `\n\n(If you saved a bug report .json from the test toolbar, please attach it to this email - links can't attach files.)\nmock world - not the real WoW Forever client - results UNPROVEN`;
    let bug = '';
    if (info) bug = `\n\n--- bug info ---\nwindow ${W}x${H}, UI scale ${cfg.scale}, level ${cfg.level} ${cfg.faction} ${cfg.cls}, reduce motion ${cfg.reduce}, fps ${MW.fps ? MW.fps.toFixed(0) : '?'}, Lua errors ${MW.stats.errors}\n` +
      MW.log.filter((l) => l.kind !== 'chat').slice(-8).map((l) => `${l.t} ${l.kind}: ${l.msg.slice(0, 90)}`).join('\n');
    const budget = 1800 - head.length - tail.length - Math.min(bug.length, 600) - 40;
    const half = Math.max(80, Math.floor(budget / 2));
    const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
    let body = head + 'What I tried:\n' + cut(tried || '-', half) + '\n\nWhat happened:\n' + cut(happened || '-', half) + cut(bug, 600) + tail;
    if (body.length > 1800) body = body.slice(0, 1799) + '\u2026';
    const url = `mailto:${MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`;
    return { url, subject, body, to: MAIL };
  };
  function bindFeedback() {
    const f = $('#fb-form');
    f.addEventListener('submit', (e) => { e.preventDefault(); const m = MW.buildMailto(); MW.lastMail = m;
      $('#fb-preview').textContent = m.body; $('#fb-status').textContent = `Opening your mail app (${m.body.length} chars). If nothing opens, email ${MAIL} with the text below.`;
      $('#fb-mailto').href = m.url; addLog('info', 'feedback: mailto opened (' + m.body.length + ' chars) - nothing is sent by this page');
      if (!window.MW_NO_MAILTO) window.location.href = m.url; });
  }

  // ------------------------------------------------------------ tools panel wiring
  function bindTools() {
    const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };
    on('#mw-tools-btn', 'click', () => MW.toggleTools());
    on('#mw-tools-close', 'click', () => MW.toggleTools(false));
    document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { const [a, arg] = b.dataset.act.split(':'); addLog('click', 'tool: ' + b.textContent.trim()); act[a](arg); }));
    on('#mw-cmd-form', 'submit', (e) => { e.preventDefault(); const i = $('#mw-cmd'); MW.slash(i.value.startsWith('/') ? i.value : '/hcomp ' + i.value); i.value = '/hcomp '; });
    on('#mw-reduce', 'change', (e) => act.reduce(e.target.checked));
    on('#mw-scale', 'change', (e) => MW.setScale(e.target.value));
    on('#mw-size', 'change', (e) => MW.setSize(e.target.value));
    on('#mw-fake', 'click', () => act.fake($('#mw-level').value, $('#mw-class').value, $('#mw-faction').value));
    on('#mw-clear', 'click', () => { if (window.MW_NO_CONFIRM || confirm('Clear the mock SavedVariables and reload the addon?')) act.clear(); });
    on('#mw-hit', 'change', (e) => { ui.overlay.hit = e.target.checked; ui.n = 0; });
    on('#mw-safe', 'change', (e) => { ui.overlay.safe = e.target.checked; ui.n = 0; });
    on('#mw-stress', 'click', () => MW.runStress());
    on('#mw-bug', 'click', () => MW.bugReport(true));
    on('#mw-logclear', 'click', () => { logEl().textContent = ''; });
  }

  // ------------------------------------------------------------ start
  window.addEventListener('DOMContentLoaded', () => {
    $('#mw-build').textContent = BUILD.sha;
    ui.canvas = $('#mw-ui'); ui.ctx = ui.canvas.getContext('2d');
    try { const t = document.createElement('canvas'); if (!(t.getContext('webgl2') || t.getContext('webgl'))) throw new Error('no WebGL context');
      world = new window.MWWorld($('#mw-world')); MW.webgl = true; }
    catch (e) {   // no WebGL: the addon still runs; the meadow becomes a painted backdrop
      MW.webgl = false; addLog('info', 'WebGL unavailable (' + e.message + '): 3D meadow off, addon still runs');
      const cv = $('#mw-world'); cv.classList.add('no-webgl');
      world = { keys: {}, reduce: false, renderer: { domElement: cv }, setSize(w, h) { cv.width = w; cv.height = h; const x = cv.getContext('2d'); if (!x) return; const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#6aa8e8'); g.addColorStop(0.55, '#f2d9a8'); g.addColorStop(0.56, '#6fae4a'); g.addColorStop(1, '#3d7a2c'); x.fillStyle = g; x.fillRect(0, 0, w, h); },
        step() { }, render() { }, orbit() { }, zoom() { } };
      $('#mw-note-webgl').hidden = false;
    }
    MW.world = world;
    const narrow = window.matchMedia && (matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 820px)').matches);
    if (narrow) $('#mw-note-mobile').hidden = false;
    layout(); bindInput(); bindTools(); bindFeedback(); MW.toggleTools(cfg.tools);
    addLog('info', 'mock world - not the real WoW Forever client - results UNPROVEN');
    window.Lua51().then((m) => { luaMod = m; try { boot(); } catch (e) { addLog('error', 'boot: ' + e.message); } MW.booted = true; chatLine('Welcome to the mock meadow. Type /hcomp, click the minimap compartment, or press F1 for the test tools.', true); });
    requestAnimationFrame(loop);
  });
})();
