// mockworld VM: real Lua 5.1.5 (wasm) running the box WoW stub + the real HeroCompendium Lua. Works in the browser and in node.
// MOCK WORLD - not the real WoW Forever client - results UNPROVEN.
(function (root) {
  const enc = new TextEncoder(), dec = new TextDecoder('utf-8');
  class HCVM {
    constructor(mod) { this.m = mod; mod._hc_init(); this.errs = []; }
    _put(s) { const b = enc.encode(s); const p = this.m._malloc(b.length + 1); this.m.HEAPU8.set(b, p); this.m.HEAPU8[p + b.length] = 0; return [p, b.length]; }
    setsrc(name, text) { const [pn] = this._put(name); const [pd, ld] = this._put(text); this.m._hc_setsrc(pn, pd, ld); this.m._free(pn); this.m._free(pd); }
    run(code) {
      const [p, l] = this._put(code); const r = this.m._hc_run(p, l); this.m._free(p);
      const n = this.m._hc_len(); const s = dec.decode(this.m.HEAPU8.subarray(r, r + n));
      if (s.charCodeAt(0) === 1) { const e = new Error(s.slice(1)); e.lua = true; throw e; }
      return s;
    }
    q(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '') + '"'; }
    // boot like tools/hc_harness.Session: stub -> media -> gamedata/PRE/game -> toc files -> SavedVariables -> login events
    boot(L, media, opt) {
      opt = opt || {};
      const st = L.stub;
      this.setsrc('__stub0', st[0][1]); this.setsrc('__stub1', st[1][1]); this.setsrc('__stub2', st[2][1]);
      this.run('assert(loadstring(MW_SRC.__stub0, "@hc_wowstub.lua"))(); assert(loadstring(MW_SRC.__stub1, "@hc_stub_ext.lua"))(); assert(loadstring(MW_SRC.__stub2, "@hc_stub_secure.lua"))()');
      this.run(`STUB.setScreen(${opt.w || 1280}, ${opt.h || 800}, ${opt.scale || 1})`);
      const keys = Object.keys(media); const chunk = [];
      for (const k of keys) chunk.push(`[${this.q(k)}]=${media[k][1]}`);
      this.setsrc('__media', 'for k, v in pairs({' + chunk.join(',') + '}) do STUB.media[k] = v end');
      this.run('assert(loadstring(MW_SRC.__media, "=media"))()');
      this.run('MW_CFG = { level = ' + (opt.level || 60) + ', class = ' + this.q(opt.cls || 'Hunter') + ', faction = ' + this.q(opt.faction || 'Alliance') + ' }');
      for (let i = 3; i < st.length; i++) { this.setsrc('__s' + i, st[i][1]); this.run(`assert(loadstring(MW_SRC.__s${i}, "@${st[i][0]}"))()`); }
      for (const f of L.files) this.setsrc(f, L.src[f]);
      this.setsrc('__sv', opt.sv || '');
      const t0 = Date.now();
      this.run(`return MW.boot(${this.q(L.files.join('\n'))}, "HeroCompendium", MW_SRC.__sv)`);
      this.bootMs = Date.now() - t0;
      if (!opt.sv) this.run('STUB.ns.DB.global.meta.welcomed = true');
      if (opt.firstRun) for (const m of opt.firstRun) this.run(`STUB.slash(${this.q('/hcomp enable ' + m)})`);
      this.run('STUB.tick(1/60)');
      return this.bootMs;
    }
    frame(dt, cx, cy) { return this.run(cx == null ? `return MW.frame(${dt})` : `return MW.frame(${dt}, ${cx}, ${cy})`); }
    slash(line) { return this.run(`return tostring(STUB.slash(${this.q(line)}))`); }
    errors() { return this.run('local o = {} for i, e in ipairs(STUB.errors) do o[#o+1] = e end; local se = STUB.ns.Util and STUB.ns.Util.sessionErrors or {}; for _, e in ipairs(se) do o[#o+1] = "session: " .. tostring(e.msg) end; return table.concat(o, "\\31")').split('\x1f').filter(Boolean); }
  }
  root.HCVM = HCVM;
  if (typeof module !== 'undefined') module.exports = HCVM;
})(typeof window !== 'undefined' ? window : globalThis);
