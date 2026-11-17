/* Party table game (one table, N players, R rounds). Same rules the Discord version will run on its server.
   Local now: the other seats are computer players. Pure logic; no network.
   Training only: points and ratings, no money. */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var E = isNode ? require('./engine.js') : root.PokerEngine;
  var D = isNode ? require('./drills.js') : root.Drills;
  var P = isNode ? require('./party.js') : root.Party;

  var ROUND_SECONDS = 15;
  /* Computer players: how often they are right and how fast (seconds). Simple styles, inside the app only. */
  var BOTS = [
    { id: 'bot-rock', name: 'Rocky', style: 'steady', acc: 0.75, fast: 6, slow: 11 },
    { id: 'bot-ace', name: 'Ace', style: 'sharp', acc: 0.88, fast: 4, slow: 8 },
    { id: 'bot-lucky', name: 'Lucky', style: 'fast guesser', acc: 0.55, fast: 1.5, slow: 4 }
  ];
  /* Quick table talk (our own lines; friendly trash talk). */
  var TALK = {
    win: ['Too easy.', 'Count ’em and weep.', 'Ship it!', 'Outs don’t lie.'],
    lose: ['Next one’s mine.', 'Run it twice?', 'I was slow-playing.', 'Nice hand.'],
    first: ['First!', 'Faster than the dealer.', 'Clock’s ticking, friends.']
  };

  /* players: [{id, name, rating, bot?}]. kinds: which question makers deal the rounds. */
  function PartyGame(players, opts) {
    opts = opts || {};
    this.players = players.map(function (p) { return { id: p.id, name: p.name, rating: p.rating || 1000, bot: p.bot || null, score: 0, right: 0, last: null }; });
    this.rounds = opts.rounds || 10;
    this.seconds = opts.seconds || ROUND_SECONDS;
    this.rand = E.rng(opts.seed >>> 0 || 1);
    this.lessons = opts.lessons || [1, 2, 3];
    this.round = 0; this.q = null; this.answers = {}; this.done = false; this.history = [];
  }
  PartyGame.prototype.deal = function () {
    if (this.round >= this.rounds) { this.done = true; return null; }
    this.round++;
    // every second round is an outs spot (the Level 1 race), the rest mixed from the open lessons
    this.q = this.round % 2 ? D.anyOuts(this.rand) : D.lessonSet(this.rand, this.lessons, 1)[0];
    this.answers = {};
    return this.q;
  };
  /* one answer per player per round; later answers are ignored */
  PartyGame.prototype.submit = function (id, choice, secs) {
    if (!this.q || this.answers[id]) return false;
    if (!this.players.some(function (p) { return p.id === id; })) return false;
    this.answers[id] = { choice: choice, secs: Math.max(0, secs) };
    return true;
  };
  /* computer players answer: right with their accuracy, a wrong pick otherwise; time between fast and slow */
  PartyGame.prototype.botAnswers = function () {
    var g = this, q = this.q;
    this.players.forEach(function (p) {
      if (!p.bot) return;
      var ok = g.rand() < p.bot.acc, wrong = q.c.map(function (_, k) { return k; }).filter(function (k) { return k !== q.a; });
      var choice = ok ? q.a : wrong[Math.floor(g.rand() * wrong.length)];
      var secs = p.bot.fast + (p.bot.slow - p.bot.fast) * g.rand();
      g.submit(p.id, choice, Math.min(secs, g.seconds));
    });
  };
  /* close the round: points by speed for right answers (100 down to 50); no answer = 0 */
  PartyGame.prototype.close = function () {
    var g = this, q = this.q, res = [];
    var firstRight = null;
    this.players.forEach(function (p) {
      var a = g.answers[p.id], ok = !!a && a.choice === q.a && a.secs <= g.seconds;
      var pts = ok ? P.roundPoints(true, a.secs, g.seconds) : 0;
      p.score += pts; if (ok) p.right++;
      p.last = { ok: ok, pts: pts, secs: a ? a.secs : null, answered: !!a };
      if (ok && (!firstRight || a.secs < firstRight.secs)) firstRight = { id: p.id, secs: a.secs };
      res.push({ id: p.id, ok: ok, pts: pts });
    });
    this.history.push({ round: this.round, topic: q.topic, results: res });
    this.q = null;
    return { results: res, first: firstRight && firstRight.id };
  };
  PartyGame.prototype.standings = function () {
    return this.players.slice().sort(function (a, b) { return b.score - a.score || b.right - a.right; });
  };
  /* end of game: rating changes from the final scores (Elo, pairwise) */
  PartyGame.prototype.finish = function () {
    this.done = true;
    var rated = P.rateTable(this.players.map(function (p) { return { id: p.id, rating: p.rating, score: p.score }; }));
    var g = this;
    rated.forEach(function (r) { var p = g.players.filter(function (x) { return x.id === r.id; })[0]; p.change = r.change; p.newRating = r.rating; });
    return this.standings();
  };
  function talk(rand, kind) { var l = TALK[kind]; return l[Math.floor(rand() * l.length)]; }

  var api = { PartyGame: PartyGame, BOTS: BOTS, TALK: TALK, talk: talk, ROUND_SECONDS: ROUND_SECONDS };
  if (isNode) module.exports = api; else root.PartyGameLib = api;
})(this);
