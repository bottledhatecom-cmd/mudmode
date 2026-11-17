/* mudschool poker trainer: odds engine (JavaScript port of
   the crew's Python engine, same score layout).
   Training and study only. Odds are advice, never a promise of winning.
   Cards are ints 0..51: rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3 (c d h s).
   Proven against the Python engine by the crew's tests. */
(function (root) {
  'use strict';
  var RANKS = '23456789TJQKA';
  var SUITS = 'cdhs';
  var CATS = ['high card', 'pair', 'two pair', 'three of a kind', 'straight',
    'flush', 'full house', 'four of a kind', 'straight flush'];

  function card(s) { return RANKS.indexOf(s[0].toUpperCase()) * 4 + SUITS.indexOf(s[1].toLowerCase()); }
  function cards(text) {
    var t = text.replace(/ /g, ''), out = [];
    for (var i = 0; i < t.length; i += 2) out.push(card(t.substr(i, 2)));
    return out;
  }
  function name(c) { return RANKS[c >> 2] + SUITS[c & 3]; }

  // ---- lookup tables over 13-bit rank masks (same as Python) ----
  var STRAIGHT = new Int8Array(8192);
  var TOP5 = new Int32Array(8192);
  (function build() {
    for (var m = 0; m < 8192; m++) {
      var top = -1;
      for (var hi = 12; hi > 3; hi--) {
        var need = 31 << (hi - 4);
        if ((m & need) === need) { top = hi; break; }
      }
      if (top < 0 && (m & 4111) === 4111) top = 3; // A-2-3-4-5 (0b1000000001111)
      STRAIGHT[m] = top;
      var v = 0, n = 0;
      for (var r = 12; r >= 0; r--) {
        if ((m >> r & 1) && n < 5) { v = (v << 4) | r; n++; }
      }
      TOP5[m] = v << (4 * (5 - n));
    }
  })();

  function pack(arr) {
    var v = 0;
    for (var i = 0; i < arr.length; i++) v = (v << 4) | arr[i];
    return v << (4 * (5 - arr.length));
  }

  /* Best 5-card score from 5..7 cards. Higher is better. score >> 20 = category. */
  function evaluate(cs) {
    var rc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var sc = [0, 0, 0, 0], sm = [0, 0, 0, 0];
    var i, s, r;
    for (i = 0; i < cs.length; i++) {
      var c = cs[i]; r = c >> 2; s = c & 3;
      rc[r]++; sc[s]++; sm[s] |= 1 << r;
    }
    for (s = 0; s < 4; s++) {
      if (sc[s] >= 5) {
        var fm = sm[s], st0 = STRAIGHT[fm];
        if (st0 >= 0) return (8 << 20) | (st0 << 16);
        return (5 << 20) | TOP5[fm];
      }
    }
    var mask = sm[0] | sm[1] | sm[2] | sm[3];
    var quads = -1, trips = -1, trips2 = -1, pairs = [];
    for (r = 12; r >= 0; r--) {
      var n = rc[r];
      if (n === 4) quads = r;
      else if (n === 3) { if (trips < 0) trips = r; else if (trips2 < 0) trips2 = r; }
      else if (n === 2) pairs.push(r);
    }
    var k;
    if (quads >= 0) {
      k = TOP5[mask & ~(1 << quads)] >> 16;
      return (7 << 20) | pack([quads, k]);
    }
    if (trips >= 0) {
      var second = Math.max(trips2, pairs.length ? pairs[0] : -1);
      if (second >= 0) return (6 << 20) | pack([trips, second]);
    }
    var st = STRAIGHT[mask];
    if (st >= 0) return (4 << 20) | (st << 16);
    if (trips >= 0) {
      k = TOP5[mask & ~(1 << trips)];
      return (3 << 20) | pack([trips, k >> 16, (k >> 12) & 15]);
    }
    if (pairs.length >= 2) {
      var p0 = pairs[0], p1 = pairs[1];
      k = TOP5[mask & ~(1 << p0) & ~(1 << p1)] >> 16;
      return (2 << 20) | pack([p0, p1, k]);
    }
    if (pairs.length) {
      k = TOP5[mask & ~(1 << pairs[0])];
      return (1 << 20) | pack([pairs[0], k >> 16, (k >> 12) & 15, (k >> 8) & 15]);
    }
    return TOP5[mask];
  }
  function category(cs) { return evaluate(cs) >> 20; }

  // ---- seeded random (mulberry32) so tests and replays repeat ----
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(rand) {
    var d = [];
    for (var i = 0; i < 52; i++) d.push(i);
    for (i = 51; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = d[i]; d[i] = d[j]; d[j] = t; }
    return d;
  }

  // ---- equity by every remaining board ----
  function equityExact(hands, board) {
    board = board || [];
    var used = {}, i;
    board.forEach(function (c) { used[c] = 1; });
    hands.forEach(function (h) { h.forEach(function (c) { used[c] = 1; }); });
    var deck = [];
    for (i = 0; i < 52; i++) if (!used[i]) deck.push(i);
    var need = 5 - board.length, share = hands.map(function () { return 0; }),
      wins = hands.map(function () { return 0; }), ties = 0, total = 0;
    var pick = [];
    function rec(start, left) {
      if (left === 0) {
        var full = board.concat(pick), best = -1, scores = [], w = [];
        for (var h = 0; h < hands.length; h++) { var sc = evaluate(hands[h].concat(full)); scores.push(sc); if (sc > best) best = sc; }
        for (h = 0; h < hands.length; h++) if (scores[h] === best) w.push(h);
        if (w.length === 1) wins[w[0]]++; else ties++;
        for (h = 0; h < w.length; h++) share[w[h]] += 1 / w.length;
        total++;
        return;
      }
      for (var x = start; x <= deck.length - left; x++) { pick.push(deck[x]); rec(x + 1, left - 1); pick.pop(); }
    }
    rec(0, need);
    return { total: total, equity: share.map(function (x) { return x / total; }),
      win: wins.map(function (x) { return x / total; }), tie: ties / total };
  }

  // ---- closed-form odds (same formulas as Python) ----
  function comb2(n) { return n * (n - 1) / 2; }
  function pHitByRiverFromFlop(outs, unseen) { unseen = unseen || 47; return 1 - comb2(unseen - outs) / comb2(unseen); }
  function pHitNextCard(outs, unseen) { return outs / unseen; }
  function potOddsNeeded(call, potBeforeCall) { return call / (potBeforeCall + call); }

  // ---- outs: unseen cards that, as the next card, give a wanted result ----
  /* want(score, cardsAfter) -> bool. Returns the list of out cards. */
  function outsList(hole, board, want, dead) {
    var used = {}, out = [];
    hole.concat(board, dead || []).forEach(function (c) { used[c] = 1; });
    for (var c = 0; c < 52; c++) {
      if (used[c]) continue;
      var all = hole.concat(board, [c]);
      if (want(evaluate(all), all, c)) out.push(c);
    }
    return out;
  }

  var api = { RANKS: RANKS, SUITS: SUITS, CATS: CATS, card: card, cards: cards, name: name,
    evaluate: evaluate, category: category, rng: rng, shuffled: shuffled, equityExact: equityExact,
    pHitByRiverFromFlop: pHitByRiverFromFlop, pHitNextCard: pHitNextCard, potOddsNeeded: potOddsNeeded,
    outsList: outsList };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerEngine = api;
})(this);
