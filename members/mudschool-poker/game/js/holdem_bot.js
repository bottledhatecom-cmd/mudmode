/* Computer players for the practice hold'em table (inside the app only; brainchips, never any real site).
   They see only their own cards, the board and the public betting; they do not adapt to the learner.
   Preflop = a fixed 169-hand order and style tables (section 2). Postflop = equity against RANGES built from the betting,
   then style tables of frequencies (sections 3-4). Small randomness and think time (section 5). Speed cap: 2,000
   evaluate calls per decision (section 6).
   API:
     equity(hole, board, opp, trials, rand)      share vs `opp` RANDOM hands (the app's after-hand coach uses it)
     decide(hand, seat, styleKey, rand, track)   ['f'] | ['cc'] | ['cbr', to], plus .think (ms), .why (one line),
                                                 .info (the design's section 8 object, for the after-hand replay only), .evals
     newTracker()                                per-hand action notes: call tracker.note(hand, seat, type, to) just BEFORE
                                                 every hand.act (bots and learner). One tracker can serve the whole table:
                                                 it resets itself when it sees a new Hand. Without one, decide() rebuilds
                                                 the notes from hand.log (same result, a little more work). */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var E = isNode ? require('./engine.js') : root.PokerEngine;
  function Hm() { return isNode ? require('./holdem.js') : root.Holdem; }

  var STYLES = {
    rock: { name: 'Rock', note: 'tight, quiet' },
    station: { name: 'Station', note: 'calls too much' },
    maniac: { name: 'Maniac', note: 'bets a lot' },
    shark: { name: 'Shark', note: 'solid' }
  };

  /* ---------- style tables (numbers copied as written) ---------- */
  var P = {
    rock: {
      A: { EP: [5, 8], MP: [6, 9], CO: [7, 11], BTN: [9, 13], SB: [6, 11] },
      B: { raiseAbs: 5, limp: 'L4' },
      C: { V: 1.9, C: 6, Csb: 4, Cbb: 12, sf: true },
      D: { o3: [0.9, 3, 3], c2: [0.9, 0], f4: [0.9, 0] },
      open: 3, Jm: 0.5, commit: 0.08, off: 0.02,
      val: 0.70, med: 0.20, semi: 0.10, bluffDry: 0.05, bluffWet: 0.05, multi: 0.4, notAgg: 0.5, barrel: 0.08,
      rivMiss: 0.03, rivAir: 0.02, rivNoBet: 0, rivVal: 0.80, slow: 0.05, callM: 0.08, callMr: 0.08,
      raiseVal: 0.88, raiseValP: 0.6, semiRaise: 0, bluffRaise: 0, kStrong: 0.4, kGut: 0.2, raiseF: 0.6
    },
    station: {
      A: { EP: [3, 34], MP: [3, 38], CO: [4, 44], BTN: [5, 52], SB: [4, 50] },
      B: { raiseAbs: 4, limp: 'L4' },
      C: { V: 1.2, C: 38, Csb: 34, Cbb: 55, sf: false },
      D: { o3: [0.9, 22, 22], c2: [0.9, 6], f4: [0.9, 5] },
      open: 2, Jm: 0.5, commit: -0.10, off: 0.03,
      val: 0.50, med: 0.20, semi: 0.10, bluffDry: 0.05, bluffWet: 0.05, multi: 0.4, notAgg: 0.5, barrel: 0.05,
      rivMiss: 0.05, rivAir: 0.03, rivNoBet: 0.03, rivVal: 0.72, slow: 0.10, callM: -0.15, callMr: -0.10,
      raiseVal: 0.90, raiseValP: 0.4, semiRaise: 0.02, bluffRaise: 0, kStrong: 0.8, kGut: 0.5, raiseF: 0.5
    },
    maniac: {
      A: { EP: [30, 0], MP: [36, 0], CO: [46, 0], BTN: [60, 0], SB: [50, 0] },
      B: { raiseRel: 0.8, limp: 'none' },
      C: { V: 8, C: 45, Csb: 45, Cbb: 60, sf: false },
      D: { o3: [4, 25, 25], c2: [3, 8], f4: [2.5, 5] },
      open: 0, Jm: 1.5, commit: -0.04, off: 0,
      val: 0.95, med: 0.75, semi: 0.85, bluffDry: 0.65, bluffWet: 0.65, multi: 0.7, notAgg: 0.9, barrel: 0.60,
      rivMiss: 0.60, rivAir: 0.45, rivNoBet: 0.40, rivVal: 0.52, slow: 0.05, callM: -0.04, callMr: -0.04,
      raiseVal: 0.68, raiseValP: 0.9, semiRaise: 0.45, bluffRaise: 0.12, kStrong: 0.5, kGut: 0.3, raiseF: 1.0
    },
    shark: {
      A: { EP: [14, 0], MP: [18, 0], CO: [27, 0], BTN: [44, 0], SB: [38, 0] },
      B: { raiseRel: 0.7, limp: 'ps' },
      C: { V: 5, C: 11, Csb: 5, Cbb: 30, sf: true },
      D: { o3: [2.2, 9, 6], c2: [2.2, 0], f4: [1.4, 2.2] },
      open: 2.5, Jm: 1.0, commit: 0.01, off: 0.03,
      val: 0.85, med: 0.40, semi: 0.65, bluffDry: 0.40, bluffWet: 0.20, multi: 0.4, notAgg: 0.5, barrel: 0.35,
      rivMiss: 0.45, rivAir: 0.12, rivNoBet: 0.10, rivVal: 0.60, slow: 0.15, callM: 0.01, callMr: 0.01,
      raiseVal: 0.80, raiseValP: 0.75, semiRaise: 0.22, bluffRaise: 0.04, kStrong: 0.5, kGut: 0.25, raiseF: 0.75
    }
  };
  /* Tuning knobs (section 7: one knob per stat). 1 / 0 = the designer's numbers unchanged.
     vp: scales L and C (VPIP). r: scales R (PFR). v: scales V and the bluff 3-bet chance (3-bet).
     bet: scales the bet-chance rows (AF). flop: added to the flop call margin (fold to c-bet). river: added to the river call margin (WTSD).
     Values after the 5 tuning rounds. */
  var TUNE = {
    rock: { vp: 1.1, r: 1.2, v: 1, bet: 0.9, flop: 0.08, river: 0.15 },
    station: { vp: 1.12, r: 1, v: 0.8, bet: 1, flop: 0.04, river: 0.18 },
    maniac: { vp: 1.5, r: 1, v: 1, bet: 1, flop: -0.04, river: 0.30 },
    shark: { vp: 1.1, r: 1, v: 1, bet: 1, flop: -0.03, river: 0.30 }
  };
  var SEAT_FACTOR = { EP: 0.75, MP: 0.85, CO: 1.0, BTN: 1.2, SB: 1.2, BB: 1.0, HU: 1.2 };
  var J10 = { EP: 14, MP: 18, CO: 25, BTN: 36, SB: 45, BB: 45, HU: 54 }; // BB: not in the design; uses the SB value. HU: BTN x 1.5.
  var OPEN_W = { EP: 15, MP: 19, CO: 28, BTN: 45, SB: 40, BB: 40, HU: 67.5 };
  var POS_WORD = { EP: 'early seat', MP: 'middle seat', CO: 'the cutoff', BTN: 'the button', SB: 'the small blind', BB: 'the big blind', HU: 'the button' };

  /* ---------- the 169-hand order (section 2) ---------- */
  var RN = '..23456789TJQKA';
  var CLASSES = [], PCT = {}, CA = new Int8Array(1326), CB = new Int8Array(1326);
  function ckey(hi, lo, s) { return (hi * 16 + lo) * 2 + (s ? 1 : 0); }
  (function buildOrder() {
    var hi, lo, s;
    for (hi = 2; hi <= 14; hi++) for (lo = 2; lo <= hi; lo++) {
      if (hi === lo) { CLASSES.push({ hi: hi, lo: lo, s: 0, n: 6, S: 30 + 2 * hi + (hi >= 10 ? 4 * (hi - 9) : 0) }); continue; }
      var gap = hi - lo - 1;
      for (s = 1; s >= 0; s--) {
        var conn = s ? ([7, 4.5, 2][gap] || 0) : ([4, 3, 1.5][gap] || 0);
        CLASSES.push({ hi: hi, lo: lo, s: s, n: s ? 4 : 12, S: 1.6 * hi + 1.4 * lo + (s ? 6 : 0) + conn + (hi === 14 ? (lo <= 5 ? 5 : 3) : 0) + (lo >= 10 ? 2 : 0) });
      }
    }
    CLASSES.sort(function (a, b) { return b.S - a.S || b.hi - a.hi || b.lo - a.lo || b.s - a.s; });
    var cum = 0, k = 0;
    CLASSES.forEach(function (c) {
      cum += c.n; c.pct = cum / 1326 * 100; c.name = RN[c.hi] + RN[c.lo] + (c.hi === c.lo ? '' : c.s ? 's' : 'o');
      PCT[ckey(c.hi, c.lo, c.s)] = c.pct;
      var a = (c.hi - 2) * 4, b = (c.lo - 2) * 4, x, y;
      if (c.hi === c.lo) { for (x = 0; x < 4; x++) for (y = x + 1; y < 4; y++) { CA[k] = a + x; CB[k] = a + y; k++; } }
      else if (c.s) { for (x = 0; x < 4; x++) { CA[k] = a + x; CB[k] = b + x; k++; } }
      else { for (x = 0; x < 4; x++) for (y = 0; y < 4; y++) if (x !== y) { CA[k] = a + x; CB[k] = b + y; k++; } }
    });
  })();
  function holeClass(h) {
    var r1 = (h[0] >> 2) + 2, r2 = (h[1] >> 2) + 2, hi = Math.max(r1, r2), lo = Math.min(r1, r2);
    return { hi: hi, lo: lo, s: hi !== lo && (h[0] & 3) === (h[1] & 3) ? 1 : 0 };
  }
  /* share of the 1,326 starting hands at or above this one (percent) */
  function pctOf(h) { var c = holeClass(h); return PCT[ckey(c.hi, c.lo, c.s)]; }
  function className(h) { var c = holeClass(h); return RN[c.hi] + RN[c.lo] + (c.hi === c.lo ? '' : c.s ? 's' : 'o'); }

  /* ---------- small helpers ---------- */
  var EVALS = 0;
  function ev(cs) { EVALS++; return E.evaluate(cs); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function uni(rand, a, b) { return a + rand() * (b - a); }
  /* "top T%" with the section 5 straight-line mix at the edge (half-width 1.5 points, narrowed to a quarter of T for tiny ranges) */
  function inTop(pct, T, rand) {
    if (!(T > 0)) return false;
    var h = Math.min(1.5, 0.25 * T), p = 0.5 + (T - pct) / (2 * h);
    if (p >= 1) return true; if (p <= 0) return false;
    return rand() < p;
  }
  function posOf(n, seat) {
    if (n === 2) return seat === 0 ? 'HU' : 'BB';
    if (seat === 0) return 'SB'; if (seat === 1) return 'BB';
    var d = n - 1 - seat; return d === 0 ? 'BTN' : d === 1 ? 'CO' : d === 2 ? 'MP' : 'EP';
  }
  /* in position against `other` after the flop (seats act from index 0 up; heads-up the button, index 0, acts last) */
  function ipVs(n, me, other) { return n === 2 ? me === 0 : me > other; }
  function colA(S, pos) {
    if (pos === 'HU') { var b = S.A.BTN; return [Math.min(85, b[0] * 1.5), Math.min(85, b[1] * 1.5)]; }
    return S.A[pos] || S.A.SB;
  }
  function chipStep(hand) { return Math.max(1, Math.round(hand.minBet / 2)); }

  /* ---------- per-hand action notes (section 0) ---------- */
  function Tracker() { this.hand = null; this.acts = []; }
  Tracker.prototype.reset = function (hand) { this.hand = hand; this.acts = []; };
  /* call just BEFORE hand.act(seat, type, to) */
  Tracker.prototype.note = function (hand, seat, type, to) {
    if (this.hand !== hand) this.reset(hand);
    var L = hand.legal(), q = hand.p[seat], toCall = L ? L.toCall : 0;
    this.acts.push({ seat: seat, street: hand.street, type: type, to: type === 'cbr' ? to : 0, toCall: toCall, cur: hand.currentBet,
      stack: q.stack, bet: q.bet, start: q.start,
      allIn: type === 'cbr' ? !!(L && to >= L.maxTo) : type === 'cc' ? (toCall > 0 && toCall >= q.stack) : false });
  };
  function newTracker() { return new Tracker(); }
  /* rebuild the notes from hand.log on a shadow table (blinds as the practice table posts them: index 0 small, index 1 big) */
  function replay(hand) {
    var H = Hm(), t = new Tracker(), bb = hand.minBet, sb = chipStep(hand), bi = 0;
    try {
      var sh = new H.Hand({ stacks: hand.p.map(function (q) { return q.start; }), blinds: hand.p.map(function (q, i) { return i === 0 ? sb : i === 1 ? bb : 0; }), minBet: bb });
      for (var k = 0; k < hand.log.length; k++) {
        var e = hand.log[k], need;
        while ((need = sh.needBoard())) { sh.dealBoard(hand.board.slice(bi, bi + need)); bi += need; }
        t.note(sh, e[0], e[1], e[2]); sh.act(e[0], e[1], e[2]);
      }
    } catch (err) { /* keep what was rebuilt */ }
    t.hand = hand;
    return t;
  }
  function trackerFor(hand, track) {
    if (track && track.hand === hand && track.acts.length === hand.log.length) return track;
    if (!hand.log.length) { var t = new Tracker(); t.hand = hand; return t; }
    return replay(hand);
  }
  /* what the notes say: preflop raise count, limpers, callers of the last raise, each seat's last voluntary preflop action,
     the last aggressor per street, each seat's postflop bets + raises and whether it called a bet */
  function analyze(acts, n, bb) {
    var A = { raises: 0, limpers: [], callers: 0, lastRaiser: -1, lastShort: false, vol: {}, agg: [-1, -1, -1, -1], post: {} };
    for (var k = 0; k < acts.length; k++) {
      var a = acts[k];
      if (a.street === 0) {
        if (a.type === 'cbr') {
          var kind = A.raises === 0 ? (A.limpers.length ? 'iso' : 'open') : A.raises === 1 ? '3bet' : '4bet';
          if (a.allIn && a.start <= 15 * bb) kind = 'short';
          A.raises++; A.lastRaiser = a.seat; A.callers = 0; A.lastShort = kind === 'short'; A.vol[a.seat] = kind; A.agg[0] = a.seat;
        } else if (a.type === 'cc') {
          if (A.raises === 0) {
            if (a.toCall > 0) { A.limpers.push(a.seat); A.vol[a.seat] = a.seat === 0 ? 'sbcomp' : 'limp'; }
            else A.vol[a.seat] = 'bbcheck';
          } else { A.callers++; A.vol[a.seat] = A.lastShort ? 'callshort' : A.raises === 1 ? (a.seat === 1 ? 'callbb' : 'call') : 'call3'; }
        }
      } else {
        var ps = A.post[a.seat] || (A.post[a.seat] = { a: 0, called: false, bet: [0, 0, 0, 0] });
        if (a.type === 'cbr') { ps.a++; ps.bet[a.street] = 1; A.agg[a.street] = a.seat; }
        else if (a.type === 'cc' && a.toCall > 0) ps.called = true;
      }
    }
    return A;
  }
  /* section 3: an opponent's preflop window [from %, to %] from its last voluntary preflop action (style-blind) */
  function windowOf(kind, pos) {
    switch (kind) {
      case 'open': return [0, OPEN_W[pos]];
      case 'iso': return [0, 0.8 * OPEN_W[pos]];
      case 'limp': return [8, 60];
      case 'sbcomp': return [8, 70];
      case 'call': return [3, 30];
      case 'callbb': return [4, 50];
      case 'bbcheck': return [10, 100];
      case '3bet': return [0, 8];
      case '4bet': return [0, 3];
      case 'call3': return [2, 14];
      case 'short': return [0, Math.min(100, 1.3 * J10[pos])];
      case 'callshort': return [0, 15];
      default: return [0, 100];
    }
  }

  /* ---------- draws and board (section 3-4) ---------- */
  function rankMask(cs) { var m = 0; for (var i = 0; i < cs.length; i++) { var r = (cs[i] >> 2) + 2; m |= 1 << r; if (r === 14) m |= 2; } return m; }
  function bits(x) { var c = 0; while (x) { x &= x - 1; c++; } return c; }
  /* flush draw (exactly 4 of a suit, a hole card in it), open-ended, gutshot; flop and turn only, must use a hole card */
  function drawsOf(hole, board) {
    var out = { fd: false, oe: false, gs: false };
    if (board.length < 3 || board.length > 4) return out;
    var sc = [0, 0, 0, 0], i;
    for (i = 0; i < board.length; i++) sc[board[i] & 3]++;
    var h0 = hole[0] & 3, h1 = hole[1] & 3; sc[h0]++; sc[h1]++;
    if (sc[h0] === 4 || sc[h1] === 4) out.fd = true;
    var bm = rankMask(board), am = bm | rankMask(hole), lo, w;
    for (lo = 1; lo <= 10; lo++) { w = 31 << lo; if ((am & w) === w) return out; } // a made straight is not a draw
    for (lo = 2; lo <= 10; lo++) { w = 15 << lo; if ((am & w) === w && (bm & w) !== w) out.oe = true; }
    if (!out.oe) for (lo = 1; lo <= 10; lo++) { w = 31 << lo; if (bits(am & w) === 4 && bits(bm & w) < 4) out.gs = true; }
    return out;
  }
  function wetness(board) {
    var f = board.slice(0, 3), sc = [0, 0, 0, 0], w = 0, i, j;
    f.forEach(function (c) { sc[c & 3]++; });
    var ms = Math.max.apply(null, sc); if (ms === 2) w += 1; if (ms === 3) w += 2;
    var r = f.map(function (c) { return (c >> 2) + 2; }), close = false;
    for (i = 0; i < 3; i++) for (j = i + 1; j < 3; j++) if (r[i] !== r[j] && Math.abs(r[i] - r[j]) <= 2) close = true;
    if (close) w += 1;
    if (Math.max.apply(null, r) - Math.min.apply(null, r) <= 4 && r[0] !== r[1] && r[1] !== r[2] && r[0] !== r[2]) w += 1;
    return w;
  }

  /* ---------- ranges and equity (section 3) ---------- */
  function drawCands(win, dead, rand, count) {
    var lo = Math.floor(win[0] / 100 * 1326), hi = Math.min(1326, Math.ceil(win[1] / 100 * 1326)), out = [], tries = 0;
    if (lo > 1325) lo = 1325; if (hi <= lo) hi = lo + 1;
    while (out.length < count && tries < count * 20) {
      tries++;
      var i = lo + Math.floor(rand() * (hi - lo)), a = CA[i], b = CB[i];
      if (dead[a] || dead[b]) continue;
      out.push([a, b]);
    }
    for (var k = 0; out.length === 0 && k < 1326; k++) if (!dead[CA[k]] && !dead[CB[k]]) out.push([CA[k], CB[k]]);
    return out;
  }
  /* narrow an opponent's list by its postflop betting (section 3), scored on the current board */
  function narrow(cands, board, ps, street, rand) {
    var s = cands.map(function (h) { return { h: h, q: ev([h[0], h[1]].concat(board)), d: street < 3 && isStrongDraw(drawsOf(h, board)) }; });
    s.sort(function (x, y) { return y.q - x.q; });
    var n = s.length, a = ps ? ps.a : 0, keep = [], i;
    if (a === 0) {
      if (!ps || !ps.called) return s;
      var top = Math.ceil(0.7 * n);
      for (i = 0; i < n; i++) if (i < top || s[i].d) keep.push(s[i]);
    } else {
      var frac = a === 1 ? 0.6 : a === 2 ? 0.4 : 0.25, rnd = a >= 3 ? 0.08 : 0.10, top2 = Math.ceil(frac * n);
      for (i = 0; i < n; i++) if (i < top2 || (a < 3 && s[i].d) || rand() < rnd) keep.push(s[i]);
    }
    return keep.length ? keep : s.slice(0, 1);
  }
  function isStrongDraw(d) { return d.fd || d.oe; }
  /* T trials: one candidate per opponent (re-pick up to 4 times on a clash), deal the rest of the board; win 1, tie 1/k */
  function rangeEq(hole, board, lists, T, rand) {
    var nb = board.length, need = 5 - nb, k = lists.length, i, o;
    var mine = new Array(7), opp = [], mark = new Int32Array(52), stamp = 0, share = 0, done = 0;
    mine[0] = hole[0]; mine[1] = hole[1];
    for (i = 0; i < nb; i++) mine[2 + i] = board[i];
    for (o = 0; o < k; o++) { var arr = new Array(7); for (i = 0; i < nb; i++) arr[2 + i] = board[i]; opp.push(arr); }
    for (var t = 0; t < T; t++) {
      stamp++;
      mark[hole[0]] = stamp; mark[hole[1]] = stamp; for (i = 0; i < nb; i++) mark[board[i]] = stamp;
      var ok = true;
      for (o = 0; o < k; o++) {
        var Lc = lists[o], got = null;
        for (var r = 0; r < 5; r++) { var h = Lc[Math.floor(rand() * Lc.length)]; if (mark[h[0]] !== stamp && mark[h[1]] !== stamp) { got = h; break; } }
        if (!got) { ok = false; break; }
        mark[got[0]] = stamp; mark[got[1]] = stamp; opp[o][0] = got[0]; opp[o][1] = got[1];
      }
      if (!ok) continue;
      for (i = 0; i < need; i++) {
        var c; do { c = Math.floor(rand() * 52); } while (mark[c] === stamp);
        mark[c] = stamp; mine[2 + nb + i] = c; for (o = 0; o < k; o++) opp[o][2 + nb + i] = c;
      }
      var my = ev(mine), win = true, ties = 1;
      for (o = 0; o < k; o++) { var sc = ev(opp[o]); if (sc > my) { win = false; break; } if (sc === my) ties++; }
      done++; if (win) share += 1 / ties;
    }
    return done ? share / done : 0.5;
  }
  /* river heads-up: compare with every candidate exactly */
  function riverExact(hole, board, list) {
    var my = ev([hole[0], hole[1]].concat(board)), s = 0;
    for (var i = 0; i < list.length; i++) { var o = ev([list[i][0], list[i][1]].concat(board)); s += o < my ? 1 : o === my ? 0.5 : 0; }
    return list.length ? s / list.length : 0.5;
  }
  /* the opponents that matter and their candidate lists. Preflop: the live players with a preflop action so far (players still to act
     are left out: they mostly fold). Postflop: every live opponent, its window narrowed by its postflop betting. */
  function rangesFor(hand, seat, A, rand, count) {
    var me = hand.p[seat], dead = new Uint8Array(52), lists = [], i;
    if (count === 'commit') { // big calls: more candidates per opponent, still inside the 2,000 evaluate cap
      var live = 0; for (i = 0; i < hand.n; i++) if (i !== seat && !hand.p[i].folded) live++;
      count = hand.street === 0 ? 200 : Math.max(48, Math.min(200, Math.floor(450 / Math.max(1, live))));
    }
    dead[me.hole[0]] = 1; dead[me.hole[1]] = 1; hand.board.forEach(function (c) { dead[c] = 1; });
    for (i = 0; i < hand.n; i++) {
      if (i === seat || hand.p[i].folded) continue;
      if (hand.street === 0 && A.vol[i] === undefined) continue;
      var c = drawCands(windowOf(A.vol[i], posOf(hand.n, i)), dead, rand, count || 48);
      lists.push(hand.street === 0 ? c : narrow(c, hand.board, A.post[i], hand.street, rand).map(function (x) { return x.h; }));
    }
    if (!lists.length) lists.push(drawCands([0, 100], dead, rand, count || 48));
    return lists;
  }
  function eqVs(hand, seat, lists, commit, rand) {
    var hole = hand.p[seat].hole, k = lists.length;
    if (hand.street === 3 && k === 1) return riverExact(hole, hand.board, lists[0]);
    var T = Math.min(commit ? 300 : 150, Math.floor(1500 / (1 + k)));
    return rangeEq(hole, hand.board, lists, T, rand);
  }

  /* ---------- sizes ---------- */
  function fixTo(to, L, q, step) {
    if (to >= L.maxTo) return L.maxTo;
    to = Math.round(to / step) * step;
    if (to < L.minTo) to = Math.ceil(L.minTo / step) * step;
    if (to >= L.maxTo) return L.maxTo;
    if (q.stack - (to - q.bet) < 0.2 * (q.stack + q.bet)) return L.maxTo; // a raise that leaves under 20% behind: all-in
    return to;
  }

  /* ---------- preflop (section 2) ---------- */
  var JIT = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function jitter(hand, seat, rand) {
    var m = JIT ? JIT.get(hand) : hand._botJitter;
    if (!m) { m = {}; if (JIT) JIT.set(hand, m); else hand._botJitter = m; }
    if (m[seat] === undefined) m[seat] = uni(rand, 0.9, 1.1);
    return m[seat];
  }
  function commitPass(eq, price, S) { return eq >= price + S.commit; }

  function preflop(c) {
    var hand = c.hand, seat = c.seat, S = c.S, T = c.T, L = c.L, q = c.q, A = c.A, rand = c.rand, bb = c.bb, n = hand.n;
    var pos = posOf(n, seat), pct = pctOf(q.hole), cls = holeClass(q.hole), j = jitter(hand, seat, rand);
    var big = cls.hi === cls.lo && cls.hi >= 13; // AA, KK
    var effOpp = 0; hand.p.forEach(function (o, i) { if (i !== seat && !o.folded) effOpp = Math.max(effOpp, o.stack + o.bet); });
    var eff = Math.min(q.stack + q.bet, effOpp) / bb;
    var raises = A.raises, limpers = A.limpers.length, raiser = A.lastRaiser, rpos = raiser >= 0 ? posOf(n, raiser) : '';
    var free = L.check, toCall = L.toCall;
    c.data.pct = pct; c.data.hand = className(q.hole); c.data.pos = pos;
    function fold(rule, extra) { return { act: free ? ['cc'] : ['f'], rule: free ? 'pf-check' : rule, x: extra }; }
    function call(rule, extra) { return { act: ['cc'], rule: rule, x: extra }; }
    function raiseTo(to, rule, extra) {
      if (!L.raise) return call(rule + '-call', extra);
      if (to >= 0.35 * (q.stack + q.bet)) to = L.maxTo;
      return { act: ['cbr', fixTo(to, L, q, c.step)], rule: rule, x: extra };
    }
    function jam(rule, extra) { return L.raise ? { act: ['cbr', L.maxTo], rule: rule, x: extra } : call(rule + '-call', extra); }
    function commitEq() {
      var lists = rangesFor(hand, seat, A, rand, 'commit');
      var eq = eqVs(hand, seat, lists, true, rand), pot = c.pot, price = toCall / (pot + toCall);
      c.data.eq = eq; c.data.price = price; c.data.need = price + S.commit; c.data.opps = lists.length;
      return eq;
    }
    var openTo = function (extraLimpers) {
      var bbs = S.open || [3, 3.5, 4, 5][Math.floor(rand() * 4)];
      if (c.key === 'shark' && pos === 'SB') bbs = 3;
      return (bbs + extraLimpers) * bb;
    };
    var ip = raiser >= 0 && ipVs(n, seat, raiser);
    var threeTo = function () { var m = c.key === 'maniac' ? uni(rand, 3.5, 5) : ip ? 3 : 4; return m * hand.currentBet; };

    // (1) short stack: push or fold (table E)
    if (eff <= 15) {
      c.data.eff = eff;
      if (raises === 0) {
        var Jt = J10[pos] * clamp(1.6 - 0.06 * eff, 0.7, 1.3) * S.Jm * (limpers ? 0.7 : 1);
        c.data.top = Jt;
        if (inTop(pct, Jt * j, rand)) return jam('push', { top: Jt });
        if (c.key === 'station' && inTop(pct, colA(S, pos === 'BB' ? 'SB' : pos)[1] * T.vp * j, rand)) return call(free ? 'pf-check' : 'pf-limp', { top: colA(S, pos)[1] });
        return fold('pf-fold', { top: Jt });
      }
      var eqs = commitEq();
      if (commitPass(eqs, c.data.price, S)) {
        if (eqs >= 0.55 && q.stack > toCall && L.raise) return jam('push-over', {});
        return call('commit-call', {});
      }
      return big ? call('commit-call', {}) : fold('commit-fold', {});
    }
    // situation and the re-raise range that goes with it (used by the commit step too)
    var sit, D = S.D, ex = {};
    if (raises === 0) sit = limpers ? 'B' : 'A';
    else if (raises === 1) sit = (A.vol[seat] === 'limp' || A.vol[seat] === 'sbcomp') ? 'limped' : 'C';
    else if (raises === 2) sit = (A.vol[seat] === 'open' || A.vol[seat] === 'iso') ? 'o3' : 'c2';
    else sit = 'f4';
    c.data.situation = sit;
    // (2) a call of 40% of my stack or more: commit rule
    if (toCall > 0 && toCall >= 0.4 * q.stack) {
      var eqc = commitEq();
      if (commitPass(eqc, c.data.price, S)) {
        var rr = sit === 'o3' ? D.o3[0] : sit === 'c2' ? D.c2[0] : sit === 'f4' ? D.f4[0] : S.C.V;
        if (inTop(pct, rr * T.v * j, rand)) return jam('commit-jam', {});
        return call('commit-call', {});
      }
      return big ? call('commit-call', {}) : fold('commit-fold', {});
    }
    // (3) tables A-D
    if (sit === 'A') {
      if (pos === 'BB') return fold('pf-check');
      var col = colA(S, pos), R = col[0] * T.r, Lm = col[1] * T.vp;
      c.data.top = R;
      if (inTop(pct, R * j, rand)) return raiseTo(openTo(0), 'pf-open', { top: R });
      if (Lm && inTop(pct, Lm * j, rand)) return call('pf-limp', { top: Lm });
      return fold('pf-fold', { top: Lm || R });
    }
    if (sit === 'B') {
      var colB = colA(S, pos === 'BB' ? 'SB' : pos), Rb = S.B.raiseAbs ? S.B.raiseAbs : S.B.raiseRel * colB[0];
      Rb *= T.r;
      if (inTop(pct, Rb * j, rand)) return raiseTo(openTo(limpers), 'pf-iso', { top: Rb });
      if (pos !== 'BB') {
        if (S.B.limp === 'L4' && inTop(pct, (colB[1] + 4) * T.vp * j, rand)) return call('pf-limp-along', { top: colB[1] + 4 });
        if (S.B.limp === 'ps' && (cls.hi === cls.lo || cls.s) && inTop(pct, colB[0] * T.vp * j, rand)) return call('pf-limp-along', { top: colB[0] });
      }
      return fold('pf-fold', { top: Rb });
    }
    if (sit === 'limped' || sit === 'C') {
      var C = S.C, V = C.V * T.v, Cc = (pos === 'SB' ? C.Csb : pos === 'BB' ? C.Cbb : C.C) * T.vp;
      if (C.sf) { var f = SEAT_FACTOR[rpos] || 1; V *= f; Cc *= f; }
      Cc *= clamp(Math.sqrt(3 / Math.max(1, hand.currentBet / bb)), 0.5, 1.0);
      Cc *= Math.min(1 + 0.2 * A.callers, 1.4);
      if (sit === 'limped') { Cc = c.key === 'station' ? 45 * T.vp : 0.8 * Cc; }
      c.data.top = Cc; ex = { v: V, c: Cc, rpos: rpos };
      if (inTop(pct, V * j, rand)) return raiseTo(threeTo(), 'pf-3bet', ex);
      if (sit === 'C') {
        if (c.key === 'maniac' && pct > 8 && pct <= 45 && rand() < 0.25 * T.v) return raiseTo(threeTo(), 'pf-3bet-bluff', ex);
        if (c.key === 'shark' && cls.s && pct > Cc && pct <= Cc + 8 && rand() < 0.6 * T.v) return raiseTo(threeTo(), 'pf-3bet-bluff', ex);
      }
      if (inTop(pct, Cc * j, rand)) return call('pf-call', ex);
      return big ? call('pf-call', ex) : fold('pf-fold-raise', ex);
    }
    if (sit === 'o3') {
      var o3 = D.o3, callT = (ip ? o3[1] : o3[2]) * T.vp; ex = { v: o3[0], c: callT };
      if (inTop(pct, o3[0] * T.v * j, rand)) return raiseTo(2.3 * hand.currentBet, 'pf-4bet', ex);
      if (c.key === 'maniac' && pct <= 25 && rand() < 0.15 * T.v) return raiseTo(2.3 * hand.currentBet, 'pf-4bet-bluff', ex);
      if (c.key === 'shark' && cls.hi === 14 && cls.s && cls.lo <= 5 && rand() < 0.3 * T.v) return raiseTo(2.3 * hand.currentBet, 'pf-4bet-bluff', ex);
      if (inTop(pct, callT * j, rand)) return call('pf-call-3bet', ex);
      return big ? call('pf-call-3bet', ex) : fold('pf-fold-3bet', ex);
    }
    if (sit === 'c2') {
      ex = { v: D.c2[0], c: D.c2[1] * T.vp };
      if (inTop(pct, D.c2[0] * T.v * j, rand)) return raiseTo(2.3 * hand.currentBet, 'pf-4bet', ex);
      if (inTop(pct, D.c2[1] * T.vp * j, rand)) return call('pf-call-3bet', ex);
      return big ? call('pf-call-3bet', ex) : fold('pf-fold-3bet', ex);
    }
    ex = { v: D.f4[0], c: D.f4[1] * T.vp };
    if (inTop(pct, D.f4[0] * T.v * j, rand)) return jam('pf-jam', ex);
    if (inTop(pct, D.f4[1] * T.vp * j, rand)) return call('pf-call-4bet', ex);
    return big ? call('pf-call-4bet', ex) : fold('pf-fold-4bet', ex);
  }

  /* ---------- postflop (section 4) ---------- */
  function postflop(c) {
    var hand = c.hand, seat = c.seat, S = c.S, T = c.T, L = c.L, q = c.q, A = c.A, rand = c.rand, key = c.key;
    var street = hand.street, board = hand.board, pot = c.pot, toCall = L.toCall;
    var commit = toCall > 0 && toCall >= 0.4 * q.stack;
    var lists = rangesFor(hand, seat, A, rand, commit ? 'commit' : 48), nOpp = lists.length;
    var eq = eqVs(hand, seat, lists, commit, rand), e1 = Math.pow(eq, 1 / nOpp), nz = uni(rand, -0.03, 0.03);
    var cls = e1 >= 0.80 + nz ? 'monster' : e1 >= 0.65 + nz ? 'strong' : e1 >= 0.48 + nz ? 'medium' : e1 >= 0.30 + nz ? 'weak' : 'air';
    var dr = drawsOf(q.hole, board), strongDraw = isStrongDraw(dr);
    var me = A.post[seat] || { a: 0, called: false, bet: [0, 0, 0, 0] };
    var aggressor = A.agg[street - 1] === seat, multi = nOpp >= 2;
    var wet = wetness(board) >= 2;
    var d = c.data; d.eq = eq; d.e1 = e1; d.cls = cls; d.opps = nOpp; d.draw = dr.fd ? 'flush draw' : dr.oe ? 'open-ended' : dr.gs ? 'gutshot' : '';
    var Bk = T.bet;
    function check(rule) { return { act: ['cc'], rule: rule }; }
    function betFrac(value) {
      if (key === 'rock') return value ? 0.75 : 0.40;
      if (key === 'station') return uni(rand, 0.33, 0.50);
      if (key === 'maniac') return [0.66, 1.0, 1.25, 1.5][Math.floor(rand() * 4)];
      if (value && e1 >= 0.60 && e1 < 0.80) return 0.40; // Shark thin value
      return street === 1 ? (wet ? 0.66 : 0.33) : street === 2 ? 0.66 : 0.75;
    }
    function bet(rule, value) {
      if (!L.raise) return check('check');
      var fr = betFrac(value) * c.size * uni(rand, 0.9, 1.1), amt = fr * pot, to;
      d.size = fr;
      if (amt > 0.6 * q.stack) to = L.maxTo; else to = fixTo(amt, L, q, c.step);
      return { act: ['cbr', to], rule: rule };
    }
    function raise(rule) {
      var to = hand.currentBet + S.raiseF * (pot + toCall);
      return { act: ['cbr', fixTo(to, L, q, c.step)], rule: rule };
    }
    var p;
    // no bet to me: chance to bet
    if (toCall === 0) {
      if (street === 3) {
        if (e1 >= S.rivVal + nz) return bet('bet-value', true); // "river value bet when e1 is at least": a rule, not a chance
        if (cls !== 'weak' && cls !== 'air') return check('check'); // showdown value below its value line: check
        if (me.bet[2]) {
          var hadDraw = isStrongDraw(drawsOf(q.hole, board.slice(0, 4)));
          p = (hadDraw ? S.rivMiss : S.rivAir) * (multi ? S.multi : 1);
          return rand() < Math.min(1, p * Bk) ? bet(hadDraw ? 'bluff-missed-draw' : 'bluff-river', false) : check('give-up');
        }
        p = S.rivNoBet * (multi ? S.multi : 1);
        return rand() < Math.min(1, p * Bk) ? bet('bluff-river', false) : check('check');
      }
      var notAgg = aggressor ? 1 : S.notAgg, rule;
      if (cls === 'monster' || cls === 'strong') {
        if (street === 1 && cls === 'monster' && rand() < S.slow) return check('slowplay');
        p = S.val; rule = 'bet-value';
      } else if (cls === 'medium') { p = S.med * (street === 2 ? 0.6 : 1) * (multi ? S.multi : 1) * notAgg; rule = 'bet-medium'; }
      else if (strongDraw) { p = S.semi * (multi ? S.multi : 1) * notAgg; rule = 'bet-semi'; }
      else if (street === 1) { p = (wet ? S.bluffWet : S.bluffDry) * (multi ? S.multi : 1) * notAgg; rule = 'bet-bluff'; }
      else if (me.bet[1]) { p = S.barrel * (multi ? S.multi : 1); rule = 'barrel'; }
      else { p = S.rivNoBet * (multi ? S.multi : 1) * notAgg; rule = 'bet-bluff'; }
      if (rand() < Math.min(1, p * Bk)) return bet(rule, rule === 'bet-value');
      return check(rule === 'bet-value' ? 'check-value' : rule === 'barrel' ? 'give-up' : 'check');
    }
    // facing a bet
    var price = toCall / (pot + toCall);
    d.price = price;
    if (commit) {
      d.need = price + S.commit;
      if (L.raise && e1 >= S.raiseVal + nz && rand() < S.raiseValP) return { act: ['cbr', L.maxTo], rule: 'raise-value' };
      return eq >= price + S.commit ? { act: ['cc'], rule: 'commit-call' } : { act: ['f'], rule: 'commit-fold' };
    }
    if (L.raise) {
      if (e1 >= S.raiseVal + nz) {
        if (street === 1 && cls === 'monster' && rand() < S.slow) return { act: ['cc'], rule: 'slowplay' };
        if (rand() < S.raiseValP) return raise('raise-value');
      }
      if (street <= 2 && strongDraw && rand() < S.semiRaise) return raise('raise-semi');
      if (street <= 2 && nOpp === 1 && cls === 'air' && rand() < S.bluffRaise) return raise('raise-bluff');
    }
    var margin = street === 3 ? S.callMr + T.river : S.callM + (street === 1 ? T.flop : 0);
    var k = street <= 2 ? (strongDraw ? S.kStrong : dr.gs ? S.kGut : 0) * (street === 2 ? 0.5 : 1) : 0;
    var I = k * Math.min(q.stack - toCall, pot + 2 * toCall);
    var need = toCall / (pot + toCall + I) + margin;
    d.need = need;
    if (eq >= need) return { act: ['cc'], rule: 'call' };
    if (key === 'station' && street <= 2 && toCall <= pot - toCall) {
      var hr = q.hole.map(function (x) { return x >> 2; }), br = board.map(function (x) { return x >> 2; });
      var pair = hr[0] === hr[1] || br.indexOf(hr[0]) >= 0 || br.indexOf(hr[1]) >= 0;
      if (pair || strongDraw) return { act: ['cc'], rule: 'call-sticky' };
    }
    return { act: ['f'], rule: 'fold' };
  }

  /* ---------- think time (section 5) ---------- */
  function thinkMs(key, street, act, d, faced, rand) {
    if (street === 0 && act[0] === 'f') return uni(rand, 400, 800);
    var isRaise = act[0] === 'cbr';
    if (key === 'rock') return isRaise && (faced || street === 0 || (d.size || 0) >= 0.6) ? uni(rand, 2500, 4000) : uni(rand, 900, 1600);
    if (key === 'station') return isRaise ? uni(rand, 1500, 2500) : uni(rand, 500, 1100);
    if (key === 'maniac') return rand() < 0.1 ? uni(rand, 2500, 4000) : uni(rand, 300, 800);
    return uni(rand, 1200, 2200) + (street === 3 ? 800 : 0);
  }

  /* ---------- the one line for the after-hand replay (section 8) ---------- */
  function pc(x) { return Math.round(x * 100) + '%'; }
  function topW(x) { return 'top ' + (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10) + '%'; }
  function whyLine(name, r, d, act, L) {
    var x = r.x || {}, pos = POS_WORD[d.pos] || 'its seat', st = ['before the flop', 'on the flop', 'on the turn', 'on the river'][d.street];
    switch (r.rule) {
      case 'pf-open': return name + ' raised first in from ' + pos + ': it opens only its ' + topW(x.top) + ' there.';
      case 'pf-limp': return name + ' limped from ' + pos + ': it limps hands down to its ' + topW(x.top || d.top || 0) + '.';
      case 'pf-limp-along': return name + ' limped behind: it plays along with hands in its ' + topW(x.top) + '.';
      case 'pf-iso': return name + ' raised over the limpers: it does that with its ' + topW(x.top) + '.';
      case 'pf-fold': return name + ' folded ' + d.hand + ' from ' + pos + ': outside its ' + topW(x.top || 0) + '.';
      case 'pf-check': return name + ' checked its option in the big blind.';
      case 'pf-3bet': return name + ' re-raised: it 3-bets its ' + topW(x.v) + ' here.';
      case 'pf-3bet-bluff': return name + ' re-raised light: a mix of bluffs it uses now and then.';
      case 'pf-call': return name + ' called the raise: it calls with about its ' + topW(x.c) + ' here.';
      case 'pf-fold-raise': return name + ' folded to the raise: it calls only its ' + topW(x.c || 0) + ' here.';
      case 'pf-4bet': case 'pf-4bet-bluff': return name + ' raised again: it 4-bets its ' + topW(x.v || 1) + (r.rule === 'pf-4bet-bluff' ? ' plus a few bluffs.' : '.');
      case 'pf-call-3bet': case 'pf-call-4bet': return name + ' called the big raise: it keeps only its ' + topW(x.c || 1) + ' this deep.';
      case 'pf-fold-3bet': case 'pf-fold-4bet': return name + ' folded to the big raise.';
      case 'pf-jam': return name + ' moved all-in over the re-raise: it does that only with its ' + topW(x.v) + '.';
      case 'push': return name + ' moved all-in short-stacked (' + Math.round(d.eff) + ' big blinds): push-or-fold with its ' + topW(x.top) + '.';
      case 'push-over': case 'commit-jam': return name + ' moved all-in: its share about ' + pc(d.eq) + ' beat the price ' + pc(d.price) + '.';
      case 'commit-call': return name + ' called a big bet: price ' + pc(d.price) + ', its share about ' + pc(d.eq) + '.';
      case 'commit-fold': return name + ' folded to a big bet: price ' + pc(d.price) + ', its share only about ' + pc(d.eq) + '.';
      case 'bet-value': return name + ' bet ' + st + ' for value: a ' + d.cls + ' hand.';
      case 'bet-medium': return name + ' bet a middling hand ' + st + '.';
      case 'bet-semi': return name + ' bet a draw (' + d.draw + ') ' + st + ': a semi-bluff.';
      case 'bet-bluff': case 'bluff-river': return name + ' bet ' + st + ' with little: it bluffs here now and then.';
      case 'bluff-missed-draw': return name + ' fired the river with a missed draw.';
      case 'barrel': return name + ' bet again on the turn after betting the flop.';
      case 'give-up': return name + ' gave up ' + st + ': no hand, no draw.';
      case 'slowplay': return name + ' slow-played a big hand ' + st + '.';
      case 'check-value': return name + ' checked a good hand ' + st + '.';
      case 'check': return name + ' checked ' + st + '.';
      case 'raise-value': return name + ' raised ' + st + ' for value: a ' + d.cls + ' hand.';
      case 'raise-semi': return name + ' raised ' + st + ' with a draw (' + d.draw + ').';
      case 'raise-bluff': return name + ' raised ' + st + ' as a bluff.';
      case 'call': return name + ' called ' + L.toCall + ' ' + st + ': price ' + pc(d.price) + ', its share about ' + pc(d.eq) + '.';
      case 'call-sticky': return name + ' called ' + st + ' with a pair or a draw: it hates folding those.';
      case 'fold': return name + ' folded ' + st + ': price ' + pc(d.price) + ', its share about ' + pc(d.eq) + '.';
      case 'offstyle': return name + ' made a small surprise raise: off its usual style.';
      default: return name + (act[0] === 'f' ? ' folded.' : act[0] === 'cc' ? (L.toCall ? ' called.' : ' checked.') : ' raised.');
    }
  }

  /* ---------- decide ---------- */
  /* hand: Holdem.Hand; seat: index in the hand; styleKey: rock / station / maniac / shark; rand: the bot's own random function;
     track: newTracker() noted before every act (optional). Returns ['f'] / ['cc'] / ['cbr', to] with .think, .why, .info, .evals. */
  /* mix (optional, the online table's named computer players, worker/src/botbrain.js): a personality over the style.
     vp, r, v, bet scale the TUNE row; flop, river add to its call margins; bluff scales the bluff rows; size scales bet and
     raise sizes. The caller clamps every knob (botbrain.js KNOBS). Without mix nothing changes (the practice table). */
  function mixStyle(S, T, mix) {
    var T2 = { vp: T.vp * mix.vp, r: T.r * mix.r, v: T.v * mix.v, bet: T.bet * mix.bet, flop: T.flop + mix.flop, river: T.river + mix.river };
    var S2 = {}, k; for (k in S) if (Object.prototype.hasOwnProperty.call(S, k)) S2[k] = S[k];
    ['bluffDry', 'bluffWet', 'barrel', 'rivMiss', 'rivAir', 'rivNoBet', 'bluffRaise', 'semiRaise'].forEach(function (x) { S2[x] = Math.min(1, S[x] * mix.bluff); });
    S2.raiseF = S.raiseF * mix.size;
    return { S: S2, T: T2 };
  }
  function decide(hand, seat, styleKey, rand, track, mix) {
    rand = rand || Math.random;
    var key = P[styleKey] ? styleKey : 'shark', S = P[key], T = TUNE[key], L = hand.legal();
    if (mix) { var mx = mixStyle(S, T, mix); S = mx.S; T = mx.T; }
    EVALS = 0;
    if (!L || L.seat !== seat) { var none = ['cc']; none.think = 0; none.why = ''; none.info = null; none.evals = 0; return none; }
    var q = hand.p[seat], tr = trackerFor(hand, track && typeof track.note === 'function' ? track : null);
    var A = analyze(tr.acts, hand.n, hand.minBet);
    var pot = 0; hand.p.forEach(function (o) { pot += o.total; });
    var c = { hand: hand, seat: seat, key: key, S: S, T: T, L: L, q: q, A: A, rand: rand, bb: hand.minBet, step: chipStep(hand), pot: pot, size: mix ? mix.size : 1,
      data: { street: hand.street, seat: seat, name: STYLES[key].name } };
    var r = hand.street === 0 ? preflop(c) : postflop(c);
    var act = r.act;
    // off-style plays (section 5): a small legal bet or raise instead of a check or a small call; never on a commit or short-stack spot
    var shortSpot = r.rule === 'push' || r.rule === 'push-over' || /^commit/.test(r.rule) || c.data.eff !== undefined;
    if (S.off && L.raise && act[0] === 'cc' && !shortSpot && (L.check || L.toCall <= 0.15 * q.stack) && rand() < S.off) {
      var to = L.check && hand.street > 0 ? Math.max(L.minTo, 0.5 * pot) : L.minTo;
      act = ['cbr', fixTo(to, L, q, c.step)]; r = { act: act, rule: 'offstyle' };
    }
    // last guard on every decision (section 4)
    if (act[0] === 'f' && L.check) act = ['cc'];
    if (act[0] === 'cbr') {
      if (!L.raise) act = ['cc'];
      else {
        var t = Math.round(act[1]);
        if (!(t >= L.minTo)) t = fixTo(L.minTo, L, q, c.step);
        if (t > L.maxTo) t = L.maxTo;
        act = ['cbr', t];
      }
    }
    var d = c.data; d.situation = d.situation || ''; d.rule = r.rule; d.toCall = L.toCall;
    var out = act.slice();
    out.think = Math.round(thinkMs(key, hand.street, out, d, L.toCall > 0, rand));
    out.why = whyLine(STYLES[key].name, r, d, out, L);
    out.info = d;
    out.evals = EVALS;
    return out;
  }

  /* equity of `hole` on `board` against `opp` RANDOM hands, by `trials` random run-outs (ties shared): the coach's number */
  function equity(hole, board, opp, trials, rand) {
    var used = {}, deck = [], i;
    hole.concat(board).forEach(function (c) { used[c] = 1; });
    for (i = 0; i < 52; i++) if (!used[i]) deck.push(i);
    var need = 5 - board.length, share = 0;
    for (var t = 0; t < trials; t++) {
      var take = need + 2 * opp;
      for (i = 0; i < take; i++) { var j = i + Math.floor(rand() * (deck.length - i)); var x = deck[i]; deck[i] = deck[j]; deck[j] = x; }
      var full = board.concat(deck.slice(0, need)), mine = E.evaluate(hole.concat(full)), ties = 1, lost = false;
      for (var o = 0; o < opp; o++) {
        var s = E.evaluate([deck[need + 2 * o], deck[need + 2 * o + 1]].concat(full));
        if (s > mine) { lost = true; break; } if (s === mine) ties++;
      }
      if (!lost) share += 1 / ties;
    }
    return share / trials;
  }

  /* for tests and the replay: the seat's equity against the same ranges the bots use, with more candidates and trials */
  function rangeEquity(hand, seat, track, trials, cands, rand) {
    var tr = trackerFor(hand, track && typeof track.note === 'function' ? track : null);
    var A = analyze(tr.acts, hand.n, hand.minBet), lists = rangesFor(hand, seat, A, rand, cands || 48);
    return rangeEq(hand.p[seat].hole, hand.board, lists, trials, rand);
  }

  var api = { STYLES: STYLES, equity: equity, decide: decide, newTracker: newTracker, Tracker: Tracker,
    pctOf: pctOf, className: className, CLASSES: CLASSES, posOf: posOf, drawsOf: drawsOf, rangeEquity: rangeEquity,
    TUNE: TUNE, PARAMS: P };
  if (isNode) module.exports = api; else root.HoldemBot = api;
})(this);
