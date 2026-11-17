/* Party table + ranked ladder rules (pure functions). Local only, nothing online yet.
   Training only, no money. */
(function (root) {
  'use strict';
  /* Points for one round: right answers score 100 down to 50 by speed over the round time; wrong or no answer 0. */
  function roundPoints(ok, secs, limit) {
    if (!ok) return 0;
    var t = Math.max(0, Math.min(secs, limit));
    return Math.round(100 - 50 * t / limit);
  }
  /* Ratings (Elo, pairwise): every pair at the table is one game; the higher match score wins, equal is a draw.
     K is split across opponents so one table moves a rating about as much as one game. Total rating is kept. */
  function expected(ra, rb) { return 1 / (1 + Math.pow(10, (rb - ra) / 400)); }
  function rateTable(players, K) {
    K = K || 32;
    var n = players.length, delta = players.map(function () { return 0; });
    if (n < 2) return players.map(function (p) { return { id: p.id, rating: p.rating, change: 0 }; });
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      var a = players[i], b = players[j];
      var sa = a.score > b.score ? 1 : a.score < b.score ? 0 : 0.5;
      var d = (K / (n - 1)) * (sa - expected(a.rating, b.rating));
      delta[i] += d; delta[j] -= d;
    }
    return players.map(function (p, k) { return { id: p.id, rating: p.rating + delta[k], change: delta[k] }; });
  }
  /* Ladder: casual to the final table. A tier needs the rating AND the level tests the curriculum asks for. */
  var TIERS = [
    { name: 'Kitchen table', rating: 0, level: 0 },
    { name: 'Home game', rating: 1100, level: 1 },
    { name: 'Card room', rating: 1200, level: 2 },
    { name: 'Satellite', rating: 1300, level: 3 },
    { name: 'Main event', rating: 1400, level: 5 },
    { name: 'Deep run', rating: 1500, level: 6 },
    { name: 'Final table', rating: 1600, level: 7 }
  ];
  /* levelsDone = highest curriculum level passed twice on two days. Seat ready is decided at season end (top + level 9). */
  function tier(rating, levelsDone) {
    var t = TIERS[0];
    TIERS.forEach(function (x) { if (rating >= x.rating && levelsDone >= x.level) t = x; });
    return t.name;
  }
  function seatReady(rankInSeason, levelsDone) { return rankInSeason === 1 && levelsDone >= 9; }
  /* Same cards for everyone on a day: the seed comes from the date (and the server, once online, keeps it secret until the day). */
  function daySeed(y, m, d, salt) {
    var s = (salt || 0) ^ (y * 10000 + m * 100 + d);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b); s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    return (s ^ (s >>> 16)) >>> 0;
  }
  var api = { roundPoints: roundPoints, expected: expected, rateTable: rateTable, TIERS: TIERS, tier: tier, seatReady: seatReady, daySeed: daySeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Party = api;
})(this);
