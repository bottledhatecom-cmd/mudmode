/* No-limit Texas hold'em table rules (one hand). Used by the practice table now and the Discord table's server later.
   Seats are in PHH order: index 0 = first seat after the button (small blind), last index = the button.
   Proven by replaying the real PHH hands (Pluribus + WSOP 2023 hold'em) and matching every finishing stack.
   Training only: brainchips, no money. */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var E = isNode ? require('./engine.js') : root.PokerEngine;

  /* cfg: stacks[], antes[], blinds[] (blinds or straddles by seat), minBet (big blind), holes[] (optional, card ints) */
  function Hand(cfg) {
    var n = cfg.stacks.length, self = this;
    this.n = n; this.minBet = cfg.minBet; this.board = []; this.street = 0; // 0 preflop, 1 flop, 2 turn, 3 river, 4 showdown/done
    this.log = []; this.done = false; this.payouts = null;
    this.p = cfg.stacks.map(function (s, i) {
      return { start: s, stack: s, bet: 0, total: 0, folded: false, allIn: false, acted: false, facedAt: null, hole: cfg.holes ? cfg.holes[i] : null, mucked: false };
    });
    // antes (dead money: count in the pot and in side pots, not in the street bet)
    (cfg.antes || []).forEach(function (a, i) { if (a > 0) self._pay(i, a, false); });
    var maxBlind = 0, maxIdx = -1;
    (cfg.blinds || []).forEach(function (b, i) { if (b > 0) { self._pay(i, b, true); if (b >= maxBlind) { maxBlind = b; maxIdx = i; } } });
    this.currentBet = Math.max.apply(null, this.p.map(function (q) { return q.bet; }));
    this.lastRaise = cfg.minBet;
    this.toAct = this._next(maxIdx < 0 ? n - 1 : maxIdx);
    this._checkStreetEnd();
  }
  Hand.prototype._pay = function (i, amt, isBet) {
    var q = this.p[i], x = Math.min(amt, q.stack);
    q.stack -= x; q.total += x; if (isBet) q.bet += x; else q.ante = (q.ante || 0) + x;
    if (q.stack === 0) q.allIn = true;
    return x;
  };
  Hand.prototype.live = function () { return this.p.filter(function (q) { return !q.folded; }).length; };
  Hand.prototype._canAct = function (i) { var q = this.p[i]; return !q.folded && !q.allIn; };
  Hand.prototype._needs = function (i) { var q = this.p[i]; return this._canAct(i) && (!q.acted || q.bet < this.currentBet); };
  /* next seat after `from` that still has to act this street, or -1 */
  Hand.prototype._next = function (from) {
    for (var k = 1; k <= this.n; k++) { var i = (from + k) % this.n; if (this._needs(i)) return i; }
    return -1;
  };
  /* what the player to act may do */
  Hand.prototype.legal = function () {
    if (this.done || this.toAct < 0) return null;
    var q = this.p[this.toAct], toCall = Math.min(this.currentBet - q.bet, q.stack);
    var maxTo = q.bet + q.stack;
    var minTo = this.currentBet === 0 ? Math.min(this.minBet, maxTo) : Math.min(this.currentBet + this.lastRaise, maxTo);
    // raising is open unless this player already acted and the raises since then add up to less than a full raise
    // (one short all-in or several that together stay short do not reopen it; together reaching a full raise do)
    var reopened = q.facedAt === null || this.currentBet - q.facedAt >= this.lastRaise;
    var canRaise = reopened && maxTo > this.currentBet && this._others(this.toAct) > 0;
    return { seat: this.toAct, fold: toCall > 0, check: toCall === 0, call: toCall, minTo: minTo, maxTo: maxTo, raise: canRaise, toCall: toCall };
  };
  /* players other than i who are in the hand and not all-in (someone to bet against) */
  Hand.prototype._others = function (i) { var c = 0; for (var k = 0; k < this.n; k++) if (k !== i && this._canAct(k)) c++; return c; };
  /* act: 'f' fold, 'cc' check/call, 'cbr' bet/raise to `to` (total this street). Throws on an illegal move. */
  Hand.prototype.act = function (seat, type, to) {
    var L = this.legal();
    if (!L || seat !== L.seat) throw new Error('not seat ' + seat + "'s turn (to act: " + (L ? L.seat : 'nobody') + ')');
    var q = this.p[seat], self = this;
    if (type === 'f') {
      q.folded = true;
    } else if (type === 'cc') {
      this._pay(seat, L.toCall, true);
    } else if (type === 'cbr') {
      if (!L.raise) throw new Error('seat ' + seat + ' may not raise');
      if (to > L.maxTo) throw new Error('raise to ' + to + ' is more than the stack');
      if (to < L.minTo) throw new Error('raise to ' + to + ' is below the minimum ' + L.minTo);
      var size = to - this.currentBet, full = size >= this.lastRaise;
      this._pay(seat, to - q.bet, true);
      if (full) {
        this.lastRaise = size;
        this.p.forEach(function (o, k) { if (k !== seat && self._canAct(k)) o.acted = false; });
      } else {
        // short all-in: players who already acted may only call or fold (the raise is not reopened for them)
        this.p.forEach(function (o, k) { if (k !== seat && self._canAct(k)) o.acted = false; });
      }
      this.currentBet = Math.max(this.currentBet, q.bet);
    } else throw new Error('unknown action ' + type);
    q.acted = true; q.facedAt = this.currentBet;
    this.log.push([seat, type, to]);
    if (this.live() === 1) return this._finish();
    this.toAct = this._next(seat);
    this._checkStreetEnd();
  };
  Hand.prototype._checkStreetEnd = function () {
    if (this.done) return;
    if (this.live() === 1) return this._finish();
    if (this.toAct >= 0) return;
    // betting closed for this street
    this.p.forEach(function (q) { q.bet = 0; q.acted = false; q.facedAt = null; });
    this.currentBet = 0; this.lastRaise = this.minBet;
    if (this.street === 3) { this.street = 4; return this._finish(); }
    this.waitingBoard = this.street === 0 ? 3 : 1;
  };
  /* how many board cards the table is waiting for (0 when betting is open or the hand is over) */
  Hand.prototype.needBoard = function () { return this.done ? 0 : (this.waitingBoard || 0); };
  Hand.prototype.dealBoard = function (cards) {
    if (cards.length !== this.waitingBoard) throw new Error('board needs ' + this.waitingBoard + ' cards');
    this.board = this.board.concat(cards); this.waitingBoard = 0; this.street++;
    // first to act after the flop: first seat from the small blind that can act; if fewer than 2 can act, no betting
    var canAct = 0; for (var k = 0; k < this.n; k++) if (this._canAct(k)) canAct++;
    // heads-up (2 seats: index 0 = button + small blind, index 1 = big blind): the big blind acts first after the flop
    this.toAct = canAct >= 2 ? this._next(this.n === 2 ? 0 : this.n - 1) : -1;
    this._checkStreetEnd();
  };
  /* pots: antes are dead money in the main pot (every player still in can win them, e.g. a big-blind ante);
     the bets make levels, each shared by the players still in who reached it (side pots). Each pot also says how much
     each player put into it (from[i]); the Discord table uses that to see whose chips a winner took (the daily limit on
     brainchips won from computer players, worker/src/room.js botFlows) */
  Hand.prototype.pots = function () {
    var levels = [], p = this.p, dead = 0;
    function bets(q) { return q.total - (q.ante || 0); }
    p.forEach(function (q) { dead += q.ante || 0; var b = bets(q); if (levels.indexOf(b) < 0 && b > 0) levels.push(b); });
    levels.sort(function (a, b) { return a - b; });
    var pots = [], prev = 0;
    var liveAll = p.map(function (q, i) { return i; }).filter(function (i) { return !p[i].folded; });
    levels.forEach(function (lv) {
      var amt = 0, elig = [], from = p.map(function () { return 0; });
      p.forEach(function (q, i) { var x = Math.max(0, Math.min(bets(q), lv) - prev); amt += x; from[i] = x; if (!q.folded && bets(q) >= lv) elig.push(i); });
      if (amt > 0) {
        if (elig.length === 0 && pots.length) { // only folded money at this level: goes with the pot below
          var below = pots[pots.length - 1]; below.amount += amt; from.forEach(function (x, i) { below.from[i] += x; });
        } else pots.push({ amount: amt, eligible: elig, from: from });
      }
      prev = lv;
    });
    // dead money: joins the main pot when every player still in is in it; otherwise (someone all-in from the ante alone) its own pot
    if (dead > 0) {
      var antes = p.map(function (q) { return q.ante || 0; });
      if (pots.length && pots[0].eligible.length === liveAll.length) { pots[0].amount += dead; antes.forEach(function (x, i) { pots[0].from[i] += x; }); }
      else pots.unshift({ amount: dead, eligible: liveAll, from: antes });
    }
    return pots;
  };
  Hand.prototype._finish = function () {
    if (this.done) return;
    this.done = true; this.toAct = -1; this.waitingBoard = 0;
    var self = this, pay = this.p.map(function () { return 0; });
    var live = this.p.map(function (q, i) { return i; }).filter(function (i) { return !self.p[i].folded; });
    var showdown = live.length > 1;
    this.scores = {};
    if (showdown) live.forEach(function (i) { self.scores[i] = self.p[i].hole && self.board.length === 5 ? E.evaluate(self.p[i].hole.concat(self.board)) : -1; });
    var potLog = []; // per pot: its size, who put what into it (from) and who took what out of it (pay)
    this.pots().forEach(function (pot) {
      var got = self.p.map(function () { return 0; });
      potLog.push({ amount: pot.amount, from: pot.from, pay: got });
      var elig = pot.eligible.filter(function (i) { return !self.p[i].folded; });
      // nobody still in the hand put chips into this layer (e.g. both blinds stood up and were folded before anyone acted):
      // the chips go to the player(s) still in the hand, never to nobody (2026-11-17: room_test 5c lost 15 chips 1 run in 8)
      if (!elig.length) elig = live.slice();
      if (!elig.length) return;
      var winners = elig;
      if (showdown && elig.length > 1) {
        var best = Math.max.apply(null, elig.map(function (i) { return self.scores[i]; }));
        winners = elig.filter(function (i) { return self.scores[i] === best; });
      }
      var share = Math.floor(pot.amount / winners.length), odd = pot.amount - share * winners.length;
      winners.forEach(function (i) { pay[i] += share; got[i] += share; });
      // odd chips one at a time, to the winners in seat order from the small blind
      // heads-up the button is seat 0, so the first seat left of the button is seat 1
      var first = self.n === 2 ? 1 : 0;
      winners.slice().sort(function (a, b) { return ((a - first + self.n) % self.n) - ((b - first + self.n) % self.n); }).slice(0, odd).forEach(function (i) { pay[i] += 1; got[i] += 1; });
    });
    this.payouts = pay; this.potLog = potLog;
    this.p.forEach(function (q, i) { q.stack += pay[i]; });
    this.street = 4;
  };
  Hand.prototype.stacks = function () { return this.p.map(function (q) { return q.stack; }); };

  /* The table's deck: a secure random source (Web Crypto, in browsers, Node and Cloudflare Workers), a fair Fisher-Yates
     shuffle and rejection sampling (no modulo bias). In the Discord version the server shuffles and deals. */
  function secureInt(n) {
    // works in browsers, Node and Cloudflare Workers (where a bundled module's `this` can be undefined)
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || (root && root.crypto);
    if (!c || !c.getRandomValues) throw new Error('no secure random source');
    var buf = new Uint32Array(1), limit = Math.floor(4294967296 / n) * n;
    do { c.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }
  function secureDeck() {
    var d = []; for (var i = 0; i < 52; i++) d.push(i);
    for (i = 51; i > 0; i--) { var j = secureInt(i + 1), t = d[i]; d[i] = d[j]; d[j] = t; }
    return d;
  }

  var api = { Hand: Hand, secureDeck: secureDeck, secureInt: secureInt };
  if (isNode) module.exports = api; else root.Holdem = api;
})(this);
