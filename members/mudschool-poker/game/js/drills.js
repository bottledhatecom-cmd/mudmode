/* mudschool poker trainer: question makers. Every answer is computed by the engine
   at play time (no typed answers). the crew's tests re-check thousands of
   these with the Python engine. Training only; odds are advice, never a promise. */
(function (root) {
  'use strict';
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PokerEngine;
  var CAT = E.CATS;
  function cat(s) { return s >> 20; }
  function codes(arr) { return arr.map(E.name); }
  function pickN(rand, arr, n) { var a = arr.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]); return out; }
  function shuffle(rand, arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function rankOf(c) { return c >> 2; }
  function suitOf(c) { return c & 3; }
  function maxSuitCount(cs) { var n = [0, 0, 0, 0]; cs.forEach(function (c) { n[suitOf(c)]++; }); return Math.max.apply(null, n); }
  function hasPair(cs) { var seen = {}; for (var i = 0; i < cs.length; i++) { var r = rankOf(cs[i]); if (seen[r]) return true; seen[r] = 1; } return false; }
  var RN = { 12: 'ace', 11: 'king', 10: 'queen', 9: 'jack', 8: 'ten', 7: 'nine', 6: 'eight', 5: 'seven', 4: 'six', 3: 'five', 2: 'four', 1: 'three', 0: 'deuce' };
  function plural(r) { return r === 4 ? 'sixes' : RN[r] + 's'; }

  // which next cards count, per outs question kind (same rules re-written in Python by the checker)
  var WANT = {
    flush: function (s) { return cat(s) === 5 || cat(s) === 8; },
    straight: function (s) { return cat(s) === 4 || cat(s) === 8; },
    combo: function (s) { return cat(s) === 4 || cat(s) === 5 || cat(s) === 8; },
    set: function (s) { return cat(s) >= 3; },
    overs: null // set per question: a pair of one of your two ranks
  };
  var DISTRACT = { flush: [8, 13, 12, 4], straight: [4, 8, 12, 16, 2], combo: [9, 12, 15, 17, 8], set: [4, 6, 1, 3], overs: [3, 4, 8, 12] };
  var QTEXT = {
    flush: 'How many cards make your flush?',
    straight: 'How many cards make your straight?',
    combo: 'How many cards make a straight or a flush?',
    set: 'How many cards give you three of a kind?',
    overs: null
  };

  function straightOuts(hole, flop) { return E.outsList(hole, flop, WANT.straight).length; }
  function flushOuts(hole, flop) { return E.outsList(hole, flop, WANT.flush).length; }

  /* One outs question. kind in flush|straight|combo|set|overs. Deals until the spot fits the kind. */
  function outsQuestion(rand, kind) {
    for (var tries = 0; tries < 20000; tries++) {
      var d = E.shuffled(rand), hole = d.slice(0, 2), flop = d.slice(2, 5), all = hole.concat(flop);
      var now = cat(E.evaluate(all));
      if (kind === 'set') {
        if (rankOf(hole[0]) !== rankOf(hole[1]) || hasPair(flop)) continue;
        if (flop.some(function (c) { return rankOf(c) === rankOf(hole[0]); })) continue;
        if (straightOuts(hole, flop) || flushOuts(hole, flop)) continue;
      } else if (kind === 'overs') {
        if (hasPair(all) || maxSuitCount(all) > 2) continue;
        var lo = Math.min(rankOf(hole[0]), rankOf(hole[1]));
        if (!flop.every(function (c) { return rankOf(c) < lo; })) continue;
        if (straightOuts(hole, flop)) continue;
      } else {
        if (hasPair(all) || now >= 4) continue;
        var ms = maxSuitCount(all), so = straightOuts(hole, flop);
        if (kind === 'flush' && !(ms === 4 && so === 0)) continue;
        if (kind === 'straight' && !(ms <= 2 && so > 0)) continue;
        if (kind === 'combo' && !(ms === 4 && so > 0)) continue;
        // a draw may use one or both hole cards; the count is the same either way
      }
      var want = WANT[kind], text = QTEXT[kind];
      if (kind === 'overs') {
        var r0 = rankOf(hole[0]), r1 = rankOf(hole[1]);
        want = function (s, cs, c) { return cat(s) === 1 && (rankOf(c) === r0 || rankOf(c) === r1); };
        var hi = Math.max(r0, r1), lo2 = Math.min(r0, r1);
        text = 'How many cards give you a pair of ' + plural(hi) + ' or ' + plural(lo2) + '?';
      }
      var outs = E.outsList(hole, flop, want);
      var n = outs.length;
      var opts = [n].concat(pickN(rand, DISTRACT[kind].filter(function (x) { return x !== n; }), 2));
      opts = shuffle(rand, opts);
      return {
        type: 'outs', kind: kind, topic: 'gen:outs-' + kind, q: text,
        pic: { you: codes(hole), board: codes(flop) },
        c: opts.map(String), a: opts.indexOf(n),
        outs: codes(outs), n: n,
        pRiver: E.pHitByRiverFromFlop(n), pTurn: E.pHitNextCard(n, 47),
        why: n + ' outs. Rule of 4: about ' + (n * 4) + '% by the river (true: ' + Math.round(E.pHitByRiverFromFlop(n) * 100) + '%).'
      };
    }
    throw new Error('no spot found for ' + kind);
  }
  var OUT_KINDS = ['flush', 'straight', 'combo', 'set', 'overs'];
  function anyOuts(rand) { return outsQuestion(rand, OUT_KINDS[Math.floor(rand() * OUT_KINDS.length)]); }

  /* Who wins: you vs him on a full board. About half the spots have the same hand type (kicker fights). */
  function showdown(rand) {
    var wantClose = rand() < 0.5;
    for (var t = 0; t < 5000; t++) {
      var d = E.shuffled(rand), you = d.slice(0, 2), him = d.slice(2, 4), board = d.slice(4, 9);
      var sy = E.evaluate(you.concat(board)), sh = E.evaluate(him.concat(board));
      if (wantClose && cat(sy) !== cat(sh)) continue;
      var a = sy > sh ? 0 : sy < sh ? 1 : 2;
      var line = 'You: ' + CAT[cat(sy)] + '. Him: ' + CAT[cat(sh)] + '.';
      if (a === 2) line += ' Same best five: split.';
      else if (cat(sy) === cat(sh)) line += ' Same type, so the higher cards win.';
      return { type: 'pick', topic: 'gen:showdown', q: 'Who wins?', pic: { you: codes(you), him: codes(him), board: codes(board) },
        c: ['You', 'Him', 'Split'], a: a, keep: true, why: line };
    }
  }

  /* What do you have: two cards + five on the board. */
  function whatHand(rand) {
    var d = E.shuffled(rand), you = d.slice(0, 2), board = d.slice(2, 7), k = cat(E.evaluate(you.concat(board)));
    // wrong choices from both sides at random distances, so the answer is not always the middle step
    var near = pickN(rand, [k - 3, k - 2, k - 1, k + 1, k + 2, k + 3].filter(function (x) { return x >= 0 && x <= 8; }), 2);
    var opts = shuffle(rand, [k].concat(near));
    return { type: 'pick', topic: 'gen:what-hand', q: 'What do you have?', pic: { you: codes(you), board: codes(board) },
      c: opts.map(function (x) { return cap(CAT[x]); }), a: opts.indexOf(k), why: 'Best five of your seven: ' + CAT[k] + '.' };
  }
  function cap(s) { return s[0].toUpperCase() + s.slice(1); }

  /* Ways to be dealt a starting hand: counted over all 1,326 two-card hands. */
  function waysQuestion(rand) {
    var R = 'AKQJT98765432', i = Math.floor(rand() * 13), j = Math.floor(rand() * 13), label, test;
    var ri = 12 - i, rj = 12 - j;
    if (i === j) { label = R[i] + '-' + R[i]; test = function (a, b) { return rankOf(a) === ri && rankOf(b) === ri; }; }
    else {
      var hiR = Math.max(ri, rj), loR = Math.min(ri, rj), suited = rand() < 0.5;
      label = E.RANKS[hiR] + '-' + E.RANKS[loR] + (suited ? ' suited' : ' offsuit');
      test = function (a, b) {
        var ok = (rankOf(a) === hiR && rankOf(b) === loR) || (rankOf(a) === loR && rankOf(b) === hiR);
        return ok && (suited ? suitOf(a) === suitOf(b) : suitOf(a) !== suitOf(b));
      };
    }
    var n = 0;
    for (var a = 0; a < 52; a++) for (var b = a + 1; b < 52; b++) if (test(a, b)) n++;
    label = label.replace(/T/g, '10');
    var opts = shuffle(rand, [4, 6, 12]);
    return { type: 'pick', topic: 'gen:ways', q: 'How many ways can you be dealt ' + label + '?', c: opts.map(String), a: opts.indexOf(n),
      why: 'Pair: 6 ways. Suited: 4 ways. Offsuit: 12 ways. ' + label + ': ' + n + ' of 1,326.', n: n, label: label };
  }

  /* Rule of 4 / rule of 2. The answer is the choice closest to the exact chance. */
  function ruleQuestion(rand) {
    var turn = rand() < 0.4, n = 2 + Math.floor(rand() * 11); // 2..12 outs
    var exact = turn ? n / 46 : E.pHitByRiverFromFlop(n);
    // the rule's number plus two others picked from both sides, so the answer's size gives nothing away
    var rule = turn ? n * 2 : n * 4;
    function mult(ms) { return ms.map(function (m) { return Math.min(Math.round(n * m), 95); }).filter(function (v, i, a) { return v !== rule && a.indexOf(v) === i; }); }
    var below = mult(turn ? [0.5, 1] : [1, 2, 3]).filter(function (v) { return v < rule && v > 0; }),
      above = mult(turn ? [3, 4, 6] : [5, 6, 8]).filter(function (v) { return v > rule; });
    var opts, best, uniq;
    for (var t = 0; t < 50; t++) {
      // both lower, both higher, or one each: a third of the time each, so the size of the answer gives nothing away
      var pat = rand(), two;
      if (pat < 1 / 3 && below.length >= 2) two = pickN(rand, below, 2);
      else if (pat < 2 / 3 && above.length >= 2) two = pickN(rand, above, 2);
      else two = pickN(rand, below, 1).concat(pickN(rand, above, 1));
      if (two.length < 2) two = pickN(rand, below.concat(above), 2);
      opts = [rule].concat(two);
      best = 0;
      opts.forEach(function (o, k) { if (Math.abs(o / 100 - exact) < Math.abs(opts[best] / 100 - exact)) best = k; });
      uniq = opts.filter(function (o) { return Math.abs(Math.abs(o / 100 - exact) - Math.abs(opts[best] / 100 - exact)) < 1e-12; }).length === 1;
      if (uniq && opts[best] === rule) break;
    }
    var correct = opts[best];
    var sh = shuffle(rand, opts);
    return { type: 'pick', topic: turn ? 'gen:rule2' : 'gen:rule4',
      q: turn ? n + ' outs on the turn. Chance on the river?' : n + ' outs on the flop, all-in. Chance by the river?',
      c: sh.map(function (x) { return 'About ' + x + '%'; }), a: sh.indexOf(correct), n: n, turn: turn, exact: exact,
      why: (turn ? 'Rule of 2: ' + n + ' \u00D7 2 = ' + (n * 2) : 'Rule of 4: ' + n + ' \u00D7 4 = ' + (n * 4)) + '%. True: ' + Math.round(exact * 100) + '%.' };
  }

  // lessons: fixed proven items + makers that deal new cards
  var LESSONS = {
    1: { title: 'The ladder', makers: [showdown, whatHand] },
    2: { title: 'Your two cards', makers: [waysQuestion] },
    3: { title: 'Outs', makers: [anyOuts, ruleQuestion] }
  };
  function fixedItem(lesson, i) {
    var src = lessonData()[lesson];
    if (!src || !src[i]) return null;
    var it = JSON.parse(JSON.stringify(src[i]));
    it.type = 'pick'; it.topic = 'L' + lesson + ':' + i;
    // the lesson asks this right after "A-K: 16 ways"; here it can come alone, so say the 16 (same answer: 4)
    if (it.q === 'How many of those A-K ways are suited?') it.q = 'A-K can be dealt 16 ways. How many are suited?';
    return it;
  }
  function lessonData() { return root.LESSON_DRILLS || (typeof globalThis !== "undefined" && globalThis.LESSON_DRILLS) || {}; }
  function fixedCount(lesson) { var src = lessonData()[lesson]; return src ? src.length : 0; }
  /* topic key -> a fresh question for that topic (spaced review asks the same kind with new cards) */
  function fromTopic(rand, topic) {
    if (/^L\d:\d+$/.test(topic)) { var p = topic.slice(1).split(':'); return fixedItem(+p[0], +p[1]); }
    var m = topic.match(/^gen:outs-(\w+)$/);
    if (m) return outsQuestion(rand, m[1]);
    var map = { 'gen:showdown': showdown, 'gen:what-hand': whatHand, 'gen:ways': waysQuestion };
    if (map[topic]) return map[topic](rand);
    if (topic === 'gen:rule2' || topic === 'gen:rule4') { for (var t = 0; t < 50; t++) { var q = ruleQuestion(rand); if (q.topic === topic) return q; } }
    return null;
  }
  /* A mixed set from lessons (half fixed, half new cards). */
  function lessonSet(rand, lessons, count) {
    var out = [];
    for (var k = 0; k < count; k++) {
      var L = lessons[Math.floor(rand() * lessons.length)];
      if (rand() < 0.4 && fixedCount(L)) { var it = fixedItem(L, Math.floor(rand() * fixedCount(L))); if (it) { out.push(it); continue; } }
      var mk = LESSONS[L].makers; out.push(mk[Math.floor(rand() * mk.length)](rand));
    }
    return out;
  }

  var api = { outsQuestion: outsQuestion, anyOuts: anyOuts, showdown: showdown, whatHand: whatHand, waysQuestion: waysQuestion,
    ruleQuestion: ruleQuestion, fixedItem: fixedItem, fixedCount: fixedCount, fromTopic: fromTopic, lessonSet: lessonSet,
    LESSONS: LESSONS, OUT_KINDS: OUT_KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Drills = api;
})(this);
