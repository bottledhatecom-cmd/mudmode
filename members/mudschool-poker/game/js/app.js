/* mudschool poker trainer: screens and game loop. Training only: no real money, no play on any site.
   Odds are advice, never a promise of winning. Saves stay in this browser on this device. */
(function () {
  'use strict';
  var E = window.PokerEngine, D = window.Drills, SND = window.Sound, P = window.Progress;
  var KEY = 'mudschool-poker-trainer-v1';
  var LEVELS = ['Cards and odds', 'Position', 'Pot odds', 'Ranges', 'Bluffing', 'Tournaments', 'Final table', 'People', 'Final exam'];
  var RANKS = [[0, 'Rookie'], [300, 'Regular'], [1000, 'Grinder'], [2500, 'Shark'], [5000, 'Final-tabler']];
  var CLOCK_SECONDS = 60, CLOCK_LIVES = 3, OUTS_GOAL_S = 10;
  var app = document.getElementById('app');
  var rand = E.rng((Date.now() ^ (Math.random() * 1e9)) >>> 0);

  // ---------- save ----------
  function fresh() { return { v: 1, xp: 0, streak: 0, lastRunDay: null, restDay: null, bestClock: 0, boxes: {}, tests: { 1: [] }, testTry: {}, partyRating: 1000, partyGames: 0, partyWins: 0, chips: 1000, handsPlayed: 0, coach: true, sound: true, seen: false, right: 0, wrong: 0 }; }
  var S = fresh();
  try { var raw = localStorage.getItem(KEY); if (raw) { var got = JSON.parse(raw); if (got && got.v === 1) S = Object.assign(fresh(), got); } } catch (e) { /* private window: play without saves */ }
  (function heal() { var f = fresh(); Object.keys(f).forEach(function (k) { if (S[k] == null && f[k] != null) S[k] = f[k]; }); if (!Array.isArray(S.tests[1])) S.tests[1] = []; })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  SND.setOn(S.sound);

  // ---------- days (local clock) ----------
  function dayNum(d) { d = d || new Date(); return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000); }
  function today() { return dayNum(); }

  // ---------- review boxes ----------
  function mark(topic, ok) {
    if (!topic) return;
    S.boxes[topic] = P.markBox(S.boxes[topic], ok, today());
  }
  function dueTopics() {
    var t = today();
    return Object.keys(S.boxes).filter(function (k) { return S.boxes[k].due <= t; })
      .sort(function (a, b) { return S.boxes[a].box - S.boxes[b].box || S.boxes[a].due - S.boxes[b].due; });
  }
  function reviewSet(n) {
    var out = [], due = dueTopics();
    for (var i = 0; i < due.length && out.length < n; i++) { var q = D.fromTopic(rand, due[i]); if (q) out.push(q); }
    return out;
  }

  // ---------- xp, streak ----------
  function rankName() { var r = RANKS[0][1]; RANKS.forEach(function (x) { if (S.xp >= x[0]) r = x[1]; }); return r; }
  /* at: the element where the XP was earned (the "+XP" pops up there; without effects the old toast shows); chips: also pops "+N brainchips" */
  function addXP(n, at, chips) {
    S.xp += n; save();
    if (at && fxOn()) fx('pop', chips ? [['+' + n + ' XP', 'xp'], ['+' + chips + ' brainchips', 'chips']] : '+' + n + ' XP', at, 'xp');
    else toast('+' + n + ' XP');
  }
  function litToday() { return S.lastRunDay === today(); }
  function finishDailyRun() {
    var n = P.nextStreak(S, today()); // one free rest day a week (progress.js)
    S.streak = n.streak; S.lastRunDay = n.lastRunDay; S.restDay = n.restDay; save();
    return n.counted;
  }

  // ---------- tiny helpers ----------
  function h(html) { app.innerHTML = html; window.scrollTo(0, 0); }
  function $(sel) { return app.querySelector(sel); }
  function toast(text) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1000); }
  var keyHandler = null;
  document.addEventListener('keydown', function (e) { if (keyHandler) keyHandler(e); });
  var timers = [];
  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearTimers() { fx('clear'); timers.forEach(clearTimeout); timers = []; if (clockTick) { clearInterval(clockTick); clockTick = null; } keyHandler = null; } // effect pieces never float over the next screen
  /* effects (js/fx.js): code-drawn bursts, pops, shake and confetti. Every call is skipped when fx.js is not loaded
     (the Node test pages) or the player's system asks for reduced motion; an effect can never stop the game. */
  function fxOn() { var F = window.FX; return !!(F && F.on && F.on()); }
  function fx(name) {
    var F = window.FX; if (!fxOn() || typeof F[name] !== 'function') return;
    try { F[name].apply(F, [].slice.call(arguments, 1)); } catch (e) { /* an effect never breaks play */ }
  }
  /* a point of the 320 x 340 table picture, in window pixels (for pops and bursts over a seat) */
  function tablePt(x, y) {
    var sv = app.querySelector('.lounge svg'), r = sv && sv.getBoundingClientRect ? sv.getBoundingClientRect() : null;
    return r && r.width ? { x: r.left + x / 320 * r.width, y: r.top + y / 340 * r.height } : null;
  }
  /* table chips that move (SVG, only with effects on): cls fx-slide (from the seat), fx-sweep (into the pot), fx-win (pot to a winner);
     dx, dy: where the chips start, from where they are drawn */
  function chipSlide(cls, dx, dy, inner) { return '<g class="' + cls + '" style="--fx:' + dx.toFixed(1) + 'px;--fy:' + dy.toFixed(1) + 'px">' + inner + '</g>'; }
  function potChip(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="7" fill="#c62828" stroke="#fff" stroke-dasharray="3 2"/>'; }
  /* an answer: right = the button springs with a soft burst and a glow ring; wrong = it wobbles, the screen edge glows red
     and the right one springs. The other answers dim a little. */
  function answerFx(btn, ok) {
    if (!fxOn() || !btn || !btn.classList) return;
    var row = btn.parentNode; if (row && row.classList) row.classList.add('fx-dim');
    if (ok) { btn.classList.add('fx-hit'); fx('burst', btn, { kind: 'ok' }); }
    else { btn.classList.add('fx-miss'); fx('flash', 'bad'); var r = app.querySelector('.ans button.right'); if (r && r !== btn) r.classList.add('fx-hit'); }
  }

  // ---------- cards (SVG) ----------
  var SYM = { s: '\u2660', h: '\u2665', d: '\u2666', c: '\u2663' }, RED = { h: 1, d: 1 };
  function cardSVG(code, x, y, w, hgt, o) {
    o = o || {};
    var r = code[0] === 'T' ? '10' : code[0], s = code[1], col = RED[s] ? '#d81b3c' : '#14121f';
    var fs = Math.round(hgt * 0.27), big = Math.round(hgt * 0.48), rx = Math.round(w * 0.12);
    var stroke = o.glow ? 'stroke="#39ff88" stroke-width="3"' : 'stroke="#19f0ff" stroke-opacity=".55" stroke-width="1.2"';
    var face = '<g opacity="' + (o.fade ? 0.35 : 1) + '">' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hgt + '" rx="' + rx + '" fill="#fff" ' + stroke + '/>' +
      '<text x="' + (x + w * 0.1) + '" y="' + (y + fs) + '" font-size="' + fs + '" font-weight="800" fill="' + col + '" font-family="system-ui,sans-serif">' + r + '</text>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + hgt * 0.8) + '" font-size="' + big + '" text-anchor="middle" fill="' + col + '">' + SYM[s] + '</text></g>';
    if (!o.deal && !o.flip) return face;
    // dealt (fly in, bounce, flip face up) or turned over (flip): a card back on top, seen only while the animation runs
    var d = ' style="animation-delay:' + (o.delay || 0) + 's"', m = Math.max(2, Math.round(w * 0.1));
    var back = '<g class="fx-back" opacity="0"' + d + '><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hgt + '" rx="' + rx + '" fill="#8e1b5b" stroke="#ff2bd6" stroke-width="1.5"/>' +
      '<rect x="' + (x + m) + '" y="' + (y + m) + '" width="' + (w - 2 * m) + '" height="' + (hgt - 2 * m) + '" rx="' + Math.max(1, rx - 2) + '" fill="none" stroke="#ffe14d" stroke-opacity=".6" stroke-dasharray="3 3"/></g>';
    return '<g class="' + (o.deal ? 'deal' : 'flipin') + '"' + d + '>' + face + back + '</g>';
  }
  /* rows: [[label, [codes], opts]] -> neon table picture */
  function tablePic(rows, o) {
    o = o || {};
    var W = 52, H = 72, G = 6, LX = 70, y = 4, s = '', n = 0, maxCards = 0;
    rows.forEach(function (r) { maxCards = Math.max(maxCards, r[1].length); });
    var vw = Math.max(LX + maxCards * (W + G), 300);
    rows.forEach(function (r) {
      s += '<text x="0" y="' + (y + H / 2 + 6) + '" font-size="16" font-weight="800" fill="' + (r[0] === 'You' ? '#19f0ff' : r[0] === 'Him' ? '#ff2bd6' : '#ffe14d') + '" font-family="Comic Sans MS,system-ui">' + r[0] + '</text>';
      r[1].forEach(function (c, i) {
        var star = c.slice(-1) === '*', code = star ? c.slice(0, 2) : c;
        s += cardSVG(code, LX + i * (W + G), y, W, H, { deal: o.deal, delay: n * 0.07, fade: star, glow: r[2] && r[2].glow });
        n++;
      });
      y += H + 12;
    });
    if (o.note) { s += '<text x="0" y="' + (y + 14) + '" font-size="16" font-weight="800" fill="#ffe14d" font-family="Comic Sans MS,system-ui">' + o.note + '</text>'; y += 24; }
    if (o.deal) for (var i = 0; i < Math.min(n, 9); i++) SND.card(i);
    return '<svg viewBox="0 0 ' + vw + ' ' + y + '" xmlns="http://www.w3.org/2000/svg">' + s + '</svg>';
  }
  function picRows(p) {
    var rows = [];
    if (!p) return rows;
    if (p.you) rows.push(['You', p.you]);
    if (p.him) rows.push(['Him', p.him]);
    if (p.board) rows.push(['Board', p.board]);
    return rows;
  }
  /* small cards in rows of 8 (the out cards) */
  function miniCards(list, label) {
    var W = 38, H = 53, G = 5, per = 8, s = '', rowsN = Math.ceil(list.length / per) || 1;
    list.forEach(function (c, i) { s += cardSVG(c, (i % per) * (W + G), 22 + Math.floor(i / per) * (H + G), W, H, { glow: true }); });
    s = '<text x="0" y="15" font-size="14" font-weight="800" fill="#39ff88" font-family="Comic Sans MS,system-ui">' + label + '</text>' + s;
    return '<svg viewBox="0 0 ' + (per * (W + G)) + ' ' + (26 + rowsN * (H + G)) + '" xmlns="http://www.w3.org/2000/svg">' + s + '</svg>';
  }

  // ---------- home ----------
  function roadSVG() {
    var passedDays = (S.tests[1] || []).length, done1 = passedDays >= 2;
    var pts = LEVELS.map(function (_, i) { return [i % 2 ? 92 : 44, 356 - i * 38]; });
    var s = '<defs><filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
    s += '<polyline points="' + pts.map(function (p) { return p.join(','); }).join(' ') + '" fill="none" stroke="#ff2bd6" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round" filter="url(#gl)" opacity=".8"/>';
    pts.forEach(function (p, i) {
      var open = i === 0 || (i === 1 && done1), here = i === 0 && !done1;
      var col = open ? (i === 0 && done1 ? '#39ff88' : '#19f0ff') : '#3a3366';
      s += '<g data-level="' + (i + 1) + '" style="cursor:pointer">';
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (open ? 22 : 16) + '" fill="#0d0b1c" stroke="' + col + '" stroke-width="3" ' + (open ? 'filter="url(#gl)"' : '') + (here ? ' class="pulse"' : '') + '/>';
      s += '<text x="' + p[0] + '" y="' + (p[1] + 7) + '" text-anchor="middle" font-size="' + (open ? 20 : 15) + '" font-weight="800" fill="' + (open ? '#fff' : '#6c6699') + '" font-family="Comic Sans MS,system-ui">' + (i === 0 && done1 ? '\u2713' : i + 1) + '</text>';
      s += '<text x="130" y="' + (p[1] + 6) + '" font-size="16" font-weight="700" fill="' + (open ? '#eef3ff' : '#6c6699') + '">' + LEVELS[i] + '</text>';
      var tag = i === 0 ? (done1 ? 'done' : 'test ' + passedDays + '/2') : open ? 'next' : '\uD83D\uDD12';
      s += '<text x="336" y="' + (p[1] + 6) + '" text-anchor="end" font-size="13" fill="' + (open ? '#19f0ff' : '#6c6699') + '">' + tag + '</text>';
      s += '</g>';
    });
    s += '<text x="68" y="26" text-anchor="middle" font-size="26">\uD83C\uDFC6</text><text x="130" y="24" font-size="15" fill="#ffe14d" font-family="Comic Sans MS,system-ui">final-table ready</text>';
    return '<svg viewBox="0 0 340 384" xmlns="http://www.w3.org/2000/svg">' + s + '</svg>';
  }
  function home() {
    clearTimers();
    var due = dueTopics().length, lit = litToday(), streak = P.liveStreak(S, today()), testedToday = S.testTry[1] === today();
    h('<div class="topbar"><span class="chip flame' + (lit ? ' lit' : '') + '" title="Days in a row">' + (lit ? '\uD83D\uDD25' : '\uD83E\uDEB5') + ' ' + streak + ' day' + (streak === 1 ? '' : 's') + '</span>' +
      '<span class="chip" title="Your XP">\u2B50 ' + S.xp.toLocaleString() + ' XP</span>' +
      muteBtn() + '</div>' +
      '<h1 class="logo">poker trainer</h1><div class="tag">mudschool \u00B7 level 1 \u00B7 ' + rankName() + '</div>' +
      '<div class="road" id="road">' + roadSVG() + '</div>' +
      '<button class="btn big yellow" id="daily">\u25B6 Daily run' + (lit ? ' \u2713' : '') + '<small>' + (lit ? 'Done today. Play again for XP.' : '5 minutes: review, drills, challenge') + '</small></button>' +
      '<button class="btn pink" id="clock">\u23F1 Beat the clock: outs<small>60 seconds, 3 lives. Best: ' + S.bestClock + '</small></button>' +
      '<button class="btn pink" id="holdem">\u2660 Hold\u2019em table<small>Play real hands vs 5 computer players. Brainchips: ' + (S.chips || 0).toLocaleString() + '</small></button>' +
      '<button class="btn" id="party">\uD83C\uDF89 Party table<small>Race 3 computer players. Practice rating ' + Math.round(S.partyRating || 1000) + '</small></button>' +
      '<div class="row2"><button class="btn" id="drills">\uD83C\uDCCF Drills<small>Lessons 1-3</small></button>' +
      '<button class="btn" id="review">\uD83D\uDD01 Review' + (due ? '<span class="badge">' + due + '</span>' : '') + '<small>' + (due ? due + ' due today' : 'Nothing due') + '</small></button></div>' +
      '<button class="btn" id="test"' + (testedToday ? ' disabled style="opacity:.55"' : '') + '>\uD83C\uDFC5 Level 1 test<small>' + (testedToday ? 'One test a day. Next one tomorrow. ' : '17 of 20, outs in ' + OUTS_GOAL_S + ' s. ') + 'Passed on ' + (S.tests[1] || []).length + ' of 2 days</small></button>' +
      '<button class="btn" id="export">\uD83D\uDCCB Copy my progress code<small>For the Discord version: learning progress only, no brainchips</small></button>' +
      '<p class="foot">Training only. No real money. Odds are advice, never a promise of winning.<br>Saves stay in this browser on this device.</p>');
    wireMute();
    $('#export').onclick = exportProgress; // the same button as the classic trainer v1.1
    $('#daily').onclick = dailyRun;
    $('#clock').onclick = function () { clock(home); };
    $('#drills').onclick = drillsMenu;
    $('#party').onclick = partyTable;
    $('#holdem').onclick = holdemTable;
    $('#review').onclick = function () {
      var qs = reviewSet(10);
      if (!qs.length) { toast('Nothing due'); return; }
      runSet(qs, { title: 'Review', onDone: function (r) { summary('Review done', r, home); } });
    };
    $('#test').onclick = levelTest;
    app.querySelectorAll('#road g[data-level]').forEach(function (g) {
      g.onclick = function () {
        var L = +g.dataset.level;
        if (L === 1) drillsMenu();
        else if (L === 2 && (S.tests[1] || []).length >= 2) showModal('Level 2 is on the way', 'The Position lessons are being made. They show up here when they are ready.');
        else showModal('Locked', 'Level ' + L + ' opens after Level ' + (L - 1) + '. Pass each level test twice, on two different days.');
      };
    });
    if (!S.seen) showModal('Welcome', 'This is a training game. No real money, nothing to buy. Odds are advice, never a promise of winning.<br><br>Play a little every day. The cards are new each time, so you learn the method, not the answer.', function () { S.seen = true; save(); });
  }
  /* one mute button, on home and on every play screen (it does not redraw the screen) */
  function muteBtn() { return '<button class="iconbtn" id="mute" aria-label="Sound on or off">' + (S.sound ? '🔊' : '🔇') + '</button>'; }
  function wireMute() {
    var b = $('#mute'); if (!b) return;
    b.onclick = function () { S.sound = !S.sound; SND.setOn(S.sound); save(); b.textContent = S.sound ? '🔊' : '🔇'; if (S.sound) SND.chip(); };
  }
  // A progress code for the Discord version's "Import PC progress" (copied from the classic trainer v1.1).
  // Learning progress only (no chips, no party rating): XP, best clock score, review boxes, level tests passed, right/wrong
  // counts, hands played. Format: "MSP1-" + base64url(JSON). Nothing is sent anywhere; the player copies it and pastes it in Discord.
  function progressCode() {
    var d = { v: 1, xp: S.xp || 0, bestClock: S.bestClock || 0, boxes: S.boxes || {}, tests: S.tests || {}, right: S.right || 0, wrong: S.wrong || 0, handsPlayed: S.handsPlayed || 0 };
    return 'MSP1-' + btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function exportProgress() {
    var code = progressCode();
    // "Copied." shows only after the clipboard write really succeeded (refused inside some frames: select by hand)
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(code).then(function () { toast('Code copied'); var cp = document.getElementById('pcopied'); if (cp) cp.textContent = 'Copied. '; }, function () { /* select it by hand */ }); } } catch (e) { /* select it by hand */ }
    showModal('Your progress code', '<span id="pcopied"></span>' + 'In the Discord game, open <b>My card</b>, press <b>Import PC progress</b> and paste this code. It carries your learning progress (XP, lessons and tests passed, review boxes, best clock score); brainchips and party rating start fresh there.' +
      '<textarea readonly id="pcode" style="width:100%;height:90px;margin-top:8px;font-size:12px;word-break:break-all">' + esc(code) + '</textarea>');
    var ta = document.getElementById('pcode'); if (ta) { ta.onclick = function () { ta.select(); }; }
  }
  function showModal(title, body, onOk) {
    var o = document.createElement('div'); o.className = 'overlay';
    o.innerHTML = '<div class="modal"><h2>' + title + '</h2><p>' + body + '</p><button class="btn big" id="mok">Got it</button></div>';
    document.body.appendChild(o);
    o.querySelector('#mok').onclick = function () { o.remove(); if (onOk) onOk(); };
  }

  // ---------- drills ----------
  function drillsMenu() {
    clearTimers();
    h('<div class="head"><h2>Drills</h2><button class="iconbtn" id="x" aria-label="Home">\u2715</button></div>' +
      '<p class="note">10 questions. New cards each time. A miss comes back in review tomorrow.</p>' +
      '<button class="btn" data-l="1">1. The ladder<small>Hand ranks, who wins, what you have</small></button>' +
      '<button class="btn" data-l="2">2. Your two cards<small>The 169 starting hands and how often</small></button>' +
      '<button class="btn" data-l="3">3. Outs<small>Count your outs, rule of 2 and 4</small></button>' +
      '<button class="btn pink" data-l="0">Mixed: lessons 1-3</button>');
    $('#x').onclick = home;
    app.querySelectorAll('button[data-l]').forEach(function (b) {
      b.onclick = function () {
        var L = +b.dataset.l, ls = L ? [L] : [1, 2, 3];
        runSet(D.lessonSet(rand, ls, 10), { title: L ? 'Lesson ' + L + ' drill' : 'Mixed drill', onDone: function (r) { summary('Drill done', r, drillsMenu); } });
      };
    });
  }

  /* Plays a list of questions one by one. opts: title, onDone(result), noExit */
  function runSet(qs, opts) {
    clearTimers();
    var i = 0, res = { right: 0, total: qs.length, xp: 0, outsTimes: [], marks: [], missed: [] };
    function show() {
      if (i >= qs.length) { clearTimers(); opts.onDone(res); return; } // drop the old Enter handler first
      var q = prep(qs[i]), t0 = performance.now();
      var dots = qs.map(function (_, k) { return '<i class="' + (k < i ? (res.marks[k] ? 'ok' : 'no') : k === i ? 'now' : '') + '"></i>'; }).join('');
      var rows = picRows(q.pic);
      var pic = rows.length ? '<div class="table">' + tablePic(rows, { deal: true }) + '</div>' : '<div class="table plain"><div class="center" style="font-size:44px">\uD83C\uDCCF</div></div>';
      h('<div class="head"><h2>' + opts.title + '</h2><span class="chip">' + (i + 1) + ' / ' + qs.length + '</span><span>' + muteBtn() + (opts.noExit ? '' : ' <button class="iconbtn" id="x" aria-label="Quit">\u2715</button>') + '</span></div>' +
        '<div class="dots">' + dots + '</div>' + pic + '<div class="qtext">' + q.q + '</div>' +
        '<div class="ans' + (q.c.some(function (t) { return t.length > 16; }) ? ' wide' : '') + '">' + q.c.map(function (t, k) { return '<button data-k="' + k + '">' + t + '<span class="k">' + (k + 1) + '</span></button>'; }).join('') + '</div>' +
        '<div class="why" id="why"></div>');
      if ($('#x')) $('#x').onclick = function () { clearTimers(); home(); };
      wireMute();
      var answered = false;
      function answer(k) {
        if (answered) return; answered = true;
        var ok = k === q.a, secs = (performance.now() - t0) / 1000;
        res.marks[i] = ok; if (ok) res.right++; else res.missed.push(q);
        if (q.type === 'outs') res.outsTimes.push({ ok: ok, s: secs });
        S[ok ? 'right' : 'wrong']++; mark(q.topic, ok);
        app.querySelectorAll('.ans button').forEach(function (b) { b.disabled = true; if (+b.dataset.k === q.a) b.classList.add('right'); });
        var hit = app.querySelectorAll('.ans button')[k];
        if (!ok) hit.classList.add('wrong');
        answerFx(hit, ok);
        var gain = ok ? (secs < 5 ? 15 : 10) : 0;
        if (gain) { res.xp += gain; S.chips = (S.chips || 0) + 10; addXP(gain, hit, 10); SND.right(); } else { SND.wrong(); save(); }
        var w = $('#why');
        w.innerHTML = '<div class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? 'Right!' : 'Not quite.') + '</div><div>' + (q.why || '') + '</div>' + whyPic(q) +
          '<button class="btn big next" id="next">Next \u25B6</button>';
        w.classList.add('show');
        $('#next').onclick = function () { i++; show(); };
        keyHandler = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); i++; show(); } };
        w.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      app.querySelectorAll('.ans button').forEach(function (b) { b.onclick = function () { answer(+b.dataset.k); }; });
      keyHandler = function (e) { var k = +e.key - 1; if (k >= 0 && k < q.c.length) answer(k); };
    }
    show();
  }
  /* shuffle choices of fixed lesson items (unless keep) */
  function prep(q0) {
    var q = JSON.parse(JSON.stringify(q0));
    if (q.type === 'pick' && !q.keep && /^L\d:/.test(q.topic || '')) {
      var ord = q.c.map(function (_, k) { return k; });
      for (var k = ord.length - 1; k > 0; k--) { var r = Math.floor(rand() * (k + 1)); var t = ord[k]; ord[k] = ord[r]; ord[r] = t; }
      q.c = ord.map(function (k2) { return q0.c[k2]; }); q.a = ord.indexOf(q0.a);
    }
    return q;
  }
  function whyPic(q) {
    if (q.type === 'outs') return '<div style="margin-top:6px">' + miniCards(q.outs, q.n + ' outs: these cards make it') + '</div>';
    if (q.wpic) { var rows = picRows(q.wpic); if (rows.length) return tablePic(rows, { note: q.wpic.note }); }
    return '';
  }

  function stars(n) { return '<div class="stars' + (n && fxOn() ? ' fx-stars' : '') + '">' + [1, 2, 3].map(function (k) { return '<span class="' + (k <= n ? '' : 'off') + '">\u2B50</span>'; }).join('') + '</div>'; }
  function summary(title, r, back) {
    clearTimers();
    var pct = r.total ? r.right / r.total : 0, st = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct > 0 ? 1 : 0;
    if (st === 3) SND.win();
    h('<div class="head"><h2>' + title + '</h2></div><div class="big-num">' + r.right + ' / ' + r.total + '</div>' + stars(st) +
      '<div class="stat"><span>XP earned</span><b>+' + r.xp + '</b></div>' +
      '<div class="stat"><span>Misses go to review</span><b>' + (r.total - r.right) + '</b></div>' +
      '<button class="btn big yellow" id="again">Play again</button><button class="btn" id="home">Home</button>');
    $('#again').onclick = back; $('#home').onclick = home;
    if (st === 3) { fx('burst', $('.stars'), { kind: 'gold', n: 16, ring: false }); fx('confetti', { n: 20 }); }
  }

  // ---------- Beat the clock: outs ----------
  var clockTick = null;
  /* onEnd: home, or (daily run) a function called by Continue. onFinish: called the moment the clock ends (daily streak). */
  function clock(onEnd, inDaily, onFinish) {
    clearTimers();
    var left = CLOCK_SECONDS, lives = CLOCK_LIVES, score = 0, combo = 0, bestCombo = 0, paused = false, times = [], over = false, lastTick = 0;
    h('<div class="head"><h2>Beat the clock</h2><span>' + muteBtn() + (inDaily ? '' : ' <button class="iconbtn" id="x" aria-label="Quit">\u2715</button>') + '</span></div>' +
      '<div class="hud"><span class="lives" id="lives"></span><span class="score" id="score">0</span></div>' +
      '<div class="timer" id="timer"><i id="bar" style="width:100%"></i></div><div class="combo" id="combo"></div>' +
      '<div id="stage"></div>');
    if ($('#x')) $('#x').onclick = function () { clearTimers(); home(); };
    wireMute();
    function hud() {
      $('#lives').textContent = '\u2764\uFE0F'.repeat(lives) + '\uD83D\uDDA4'.repeat(CLOCK_LIVES - lives);
      $('#score').textContent = score;
      $('#combo').textContent = combo >= 2 ? 'combo x' + combo : '';
      $('#bar').style.width = (left / CLOCK_SECONDS * 100) + '%';
      $('#timer').className = 'timer' + (left <= 10 ? ' low' : '');
    }
    function next() {
      if (over) return;
      var q = D.anyOuts(rand), t0 = performance.now();
      $('#stage').innerHTML = '<div class="table" id="tbl">' + tablePic(picRows(q.pic), { deal: true }) + '</div><div class="qtext">' + q.q + '</div>' +
        '<div class="ans">' + q.c.map(function (t, k) { return '<button data-k="' + k + '">' + t + '<span class="k">' + (k + 1) + '</span></button>'; }).join('') + '</div><div class="why" id="why"></div>';
      paused = false;
      var done = false;
      function answer(k) {
        if (done || over) return; done = true; paused = true;
        var ok = k === q.a, secs = (performance.now() - t0) / 1000;
        mark(q.topic, ok); S[ok ? 'right' : 'wrong']++;
        app.querySelectorAll('.ans button').forEach(function (b) { b.disabled = true; if (+b.dataset.k === q.a) b.classList.add('right'); });
        var tbl = $('#tbl');
        var hit = app.querySelectorAll('.ans button')[k];
        if (ok) { score++; combo++; bestCombo = Math.max(bestCombo, combo); times.push(secs); tbl.classList.add('flash-ok'); combo >= 2 ? SND.combo(combo) : SND.right(); }
        else { lives--; combo = 0; hit.classList.add('wrong'); tbl.classList.add('flash-no'); SND.wrong(); }
        hud();
        answerFx(hit, ok);
        if (ok) {
          fx('bump', $('#score')); fx('pop', '+1', $('#score'), 'xp');
          if (combo >= 2) { fx('bump', $('#combo')); fx('pop', 'x' + combo + '!', $('#combo'), 'combo'); }
          if (combo >= 3) fx('burst', $('#combo'), { kind: 'pink', n: Math.min(6 + 2 * combo, 20), spread: 50 + 4 * Math.min(combo, 10), ring: false });
          if (combo === 5 || combo === 10 || combo === 15) fx('confetti', { n: 14 + combo });
        } else fx('bump', $('#lives'));
        var w = $('#why');
        w.innerHTML = '<div class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? 'Yes! ' + q.n + ' outs' : q.n + ' outs') + '</div>' + miniCards(q.outs, 'the out cards');
        w.classList.add('show');
        later(function () { if (lives <= 0) end(); else next(); }, ok ? 900 : 2400);
      }
      app.querySelectorAll('.ans button').forEach(function (b) { b.onclick = function () { answer(+b.dataset.k); }; });
      keyHandler = function (e) { var k = +e.key - 1; if (k >= 0 && k < 3) answer(k); };
    }
    function end() {
      if (over) return; over = true; clearTimers();
      var avg = times.length ? times.reduce(function (a, b) { return a + b; }, 0) / times.length : 0;
      var newBest = score > S.bestClock; if (newBest) S.bestClock = score;
      var gain = score * 10 + bestCombo * 5;
      S.xp += gain; S.chips = (S.chips || 0) + score * 5; save();
      if (onFinish) onFinish(); // the day's flame is lit here, even if the tab is closed before Continue
      var st = score >= 15 ? 3 : score >= 10 ? 2 : score >= 5 ? 1 : 0;
      (st >= 2 || newBest) ? SND.win() : SND.over();
      h('<div class="head"><h2>' + (lives <= 0 ? 'Out of lives' : 'Time!') + '</h2></div><div class="big-num">' + score + '</div><div class="center">' + (newBest ? '<b class="good">New best!</b>' : 'Best: ' + S.bestClock) + '</div>' + stars(st) +
        '<div class="stat"><span>Average time per right answer</span><b class="' + (avg && avg <= OUTS_GOAL_S ? 'good' : 'bad') + '">' + (avg ? avg.toFixed(1) + ' s' : '-') + '</b></div>' +
        '<div class="stat"><span>Level 1 goal</span><b>' + OUTS_GOAL_S + ' s or less</b></div>' +
        '<div class="stat"><span>Best combo</span><b>x' + bestCombo + '</b></div>' +
        '<div class="stat"><span>XP earned</span><b>+' + gain + '</b></div>' +
        '<p class="note">Stars: 5, 10 and 15 right. Missed spots come back in review.</p>' +
        (onEnd === home ? '<button class="btn big yellow" id="again">Play again</button><button class="btn" id="home">Home</button>' : '<button class="btn big yellow" id="cont">Continue \u25B6</button>'));
      if ($('#again')) { $('#again').onclick = function () { clock(home); }; $('#home').onclick = home; }
      if (newBest && score > 0) fx('celebrate', $('.big-num'), { n: 24 });
      else if (st === 3) fx('burst', $('.stars'), { kind: 'gold', n: 16, ring: false });
      if ($('#cont')) $('#cont').onclick = function () { onEnd({ score: score, xp: gain }); };
    }
    hud(); next();
    var last = performance.now();
    clockTick = setInterval(function () {
      var now = performance.now(), dt = (now - last) / 1000; last = now;
      if (paused || over) return;
      left = Math.max(0, left - dt); hud();
      if (left <= 5 && Math.ceil(left) !== lastTick) { lastTick = Math.ceil(left); SND.tick(); }
      if (left <= 0) end();
    }, 100);
  }

  // ---------- daily run: 3 review -> 8 drills -> challenge ----------
  function dailyRun() {
    var rev = reviewSet(3);
    while (rev.length < 3) rev.push(D.lessonSet(rand, [1, 2, 3], 1)[0]);
    var drills = D.lessonSet(rand, [1, 2, 3], 8), total = { right: 0, total: 0, xp: 0 };
    runSet(rev, { title: 'Daily run 1/3: review', noExit: false, onDone: function (r1) {
      total.right += r1.right; total.total += r1.total; total.xp += r1.xp;
      runSet(drills, { title: 'Daily run 2/3: drills', onDone: function (r2) {
        total.right += r2.right; total.total += r2.total; total.xp += r2.xp;
        var firstToday = false;
        showModal('Last part: Beat the clock', 'Count outs fast. 60 seconds, 3 lives.', function () {
          clock(function (r3) {
            SND.win();
            h('<div class="head"><h2>Daily run done</h2></div><div class="center" style="font-size:70px">\uD83D\uDD25</div>' +
              '<div class="big-num">' + S.streak + '</div><div class="center">day' + (S.streak === 1 ? '' : 's') + ' in a row</div>' +
              '<div class="stat"><span>Questions right</span><b>' + total.right + ' / ' + total.total + '</b></div>' +
              '<div class="stat"><span>Outs in the clock</span><b>' + r3.score + '</b></div>' +
              '<div class="stat"><span>XP earned</span><b>+' + (total.xp + r3.xp + (firstToday ? 50 : 0)) + '</b></div>' +
              (firstToday ? '<p class="note">+50 XP for today\u2019s run. One missed day a week keeps the streak.</p>' : '<p class="note">Already done today. The streak counts once a day.</p>') +
              '<button class="btn big yellow" id="home">Home</button>');
            $('#home').onclick = home;
            fx('burst', $('.big-num'), { kind: 'gold', n: 18, spread: 90, ring: false });
            if (firstToday) fx('confetti', { n: 22 });
          }, true, function () { firstToday = finishDailyRun(); if (firstToday) { S.xp += 50; S.chips = (S.chips || 0) + 100; } save(); });
        });
      } });
    } });
  }

  // ---------- level 1 test: 20 questions, pass 17, outs in 10 s or less ----------
  /* One test a day (curriculum: a miss means a fresh test the next day; one lucky day does not count).
     Starting it uses the day's try. The outs gate is the average time of the right outs answers (incl. the short deal). */
  function levelTest() {
    if (S.testTry[1] === today()) { showModal('One test a day', 'You took today’s Level 1 test. A fresh one is ready tomorrow. Drills and review are open.'); return; }
    S.testTry[1] = today(); save();
    var qs = [];
    for (var k = 0; k < 6; k++) qs.push(D.anyOuts(rand));
    qs = qs.concat(D.lessonSet(rand, [1, 2, 3], 14));
    for (var j = qs.length - 1; j > 0; j--) { var r = Math.floor(rand() * (j + 1)); var t = qs[j]; qs[j] = qs[r]; qs[r] = t; }
    runSet(qs, { title: 'Level 1 test', onDone: function (res) {
      var outsOk = res.outsTimes.filter(function (o) { return o.ok; });
      var avg = outsOk.length ? outsOk.reduce(function (a, o) { return a + o.s; }, 0) / outsOk.length : 99;
      var pass = res.right >= 17 && avg <= OUTS_GOAL_S;
      var list = S.tests[1] || (S.tests[1] = []);
      if (pass && list.indexOf(today()) < 0) { list.push(today()); S.xp += 100; S.chips = (S.chips || 0) + 250; }
      save();
      pass ? SND.win() : SND.over();
      var days = list.length;
      h('<div class="head"><h2>Level 1 test</h2></div><div class="big-num">' + res.right + ' / 20</div>' +
        '<div class="center" style="font-size:22px">' + (pass ? '<b class="good">PASS</b>' : '<b class="bad">Not yet</b>') + '</div>' +
        '<div class="stat"><span>Pass score</span><b>17 of 20</b></div>' +
        '<div class="stat"><span>Outs: average time (right ones)</span><b class="' + (avg <= OUTS_GOAL_S ? 'good' : 'bad') + '">' + (outsOk.length ? avg.toFixed(1) + ' s' : '-') + '</b></div>' +
        '<div class="stat"><span>Passed on different days</span><b>' + days + ' of 2</b></div>' +
        '<p class="note">' + (days >= 2 ? 'Level 1 done. Level 2 opens when its lessons are ready.' : pass ? 'Pass again on another day to finish Level 1.' : 'Misses go to review. A fresh test is ready tomorrow.') + '</p>' +
        '<button class="btn big yellow" id="home">Home</button>' + missedList(res.missed));
      $('#home').onclick = home;
      if (pass) { fx('celebrate', $('.big-num'), { n: 26, shake: true }); fx('pop', [['+100 XP', 'xp'], ['+250 brainchips', 'chips']], $('b.good')); }
    } });
  }

  /* party round closed (practice and Discord): seats that scored bounce, your seat bursts with "+points" (and "streak xN"
     from 2 right in a row), the right answer springs; a miss wobbles your pick and the screen edge glows red */
  function seatFx(oks, mineOk, pts, streak) {
    if (!fxOn()) return;
    var seatEls = app.querySelectorAll('.seats .seat'), me = app.querySelector('.seat.me');
    oks.forEach(function (ok, i) { if (ok && seatEls[i]) seatEls[i].classList.add('fx-scored'); });
    var row = app.querySelector('.ans'), right = app.querySelector('.ans button.right'), pick = app.querySelector('.ans button.picked') || app.querySelector('.ans button.wrong');
    if (row) row.classList.add('fx-dim');
    if (right) right.classList.add('fx-hit');
    if (mineOk) {
      fx('burst', me, { kind: 'ok', n: 12, spread: 55 });
      fx('pop', streak >= 2 ? [['+' + (pts | 0), 'xp'], ['streak x' + streak, 'combo']] : '+' + (pts | 0), me, 'xp');
      if (streak >= 3) fx('burst', me, { kind: 'pink', n: Math.min(4 + 2 * streak, 16), spread: 85, ring: false });
    } else { if (pick && pick !== right) pick.classList.add('fx-miss'); fx('flash', 'bad'); }
  }

  // ---------- party table (practice): you + 3 computer players, same rules as the Discord party table ----------
  function initials(n) { return n.slice(0, 1).toUpperCase(); }
  function partyTable() {
    clearTimers();
    var G = window.PartyGameLib;
    if (!G) return home();
    var bots = G.BOTS, base = { 'bot-rock': 1050, 'bot-ace': 1150, 'bot-lucky': 950 };
    var me = { id: 'me', name: 'You', rating: Math.round(S.partyRating || 1000) };
    var game = new G.PartyGame([me].concat(bots.map(function (b) { return { id: b.id, name: b.name, rating: base[b.id], bot: b }; })),
      { seed: (Date.now() ^ (rand() * 1e9)) >>> 0, rounds: 10 });
    var colors = { me: '#19f0ff', 'bot-rock': '#ffe14d', 'bot-ace': '#ff2bd6', 'bot-lucky': '#39ff88' };
    var bubbles = {}, gifts = {}, streak = 0;
    function seats(state) {
      return '<div class="seats">' + game.players.map(function (p) {
        var st = state && state[p.id] || '', b = bubbles[p.id];
        return '<div class="seat' + (p.id === 'me' ? ' me' : '') + '" style="--c:' + colors[p.id] + '">' +
          '<div class="av">' + initials(p.name) + (gifts[p.id] ? '<span class="gift">' + gifts[p.id] + '</span>' : '') + '</div>' +
          '<div class="nm">' + p.name + '</div><div class="sc">' + p.score + '</div>' +
          '<div class="st">' + st + '</div>' + (b ? '<div class="bubble">' + b + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    function lobby() {
      h('<div class="head"><h2>Party table</h2><span>' + muteBtn() + ' <button class="iconbtn" id="x" aria-label="Home">✕</button></span></div>' +
        '<p class="note">Practice table: you and 3 computer players race on the same spots. 10 rounds, 15 seconds each. Right and fast scores most (100 down to 50). No money: points and a practice rating only.</p>' +
        '<div class="lounge">' + seats() + '<div class="center" style="padding:10px 0 4px;color:#c3c9e6">' + game.players.map(function (p) { return p.name + ' ' + p.rating + (p.bot ? ' · ' + p.bot.style : ''); }).join('<br>') + '</div></div>' +
        '<button class="btn big yellow" id="go">🃏 Deal me in</button>');
      wireMute(); $('#x').onclick = home; $('#go').onclick = round;
    }
    function round() {
      clearTimers();
      var q = game.deal();
      if (!q) return podium();
      q = prep(q); game.q = q; // shuffled choices stay consistent with the game's answer index
      bubbles = {};
      game.botAnswers();
      var t0 = performance.now(), state = {}, closed = false;
      game.players.forEach(function (p) { state[p.id] = '…'; });
      var rows = picRows(q.pic);
      h('<div class="head"><h2>Round ' + game.round + ' / ' + game.rounds + '</h2><span>' + muteBtn() + ' <button class="iconbtn" id="x" aria-label="Leave">✕</button></span></div>' +
        '<div class="timer" id="timer"><i id="bar" style="width:100%"></i></div>' +
        '<div class="lounge" id="lounge">' + seats(state) + (rows.length ? '<div class="table plush">' + tablePic(rows, { deal: true }) + '</div>' : '<div class="table plush plain"><div class="center" style="font-size:40px">🃏</div></div>') + '</div>' +
        '<div class="qtext">' + q.q + '</div>' +
        '<div class="ans' + (q.c.some(function (t) { return t.length > 16; }) ? ' wide' : '') + '">' + q.c.map(function (t, k) { return '<button data-k="' + k + '">' + t + '<span class="k">' + (k + 1) + '</span></button>'; }).join('') + '</div>' +
        '<div class="talk" id="talk">' + ['Ship it!', 'Too slow!', 'Nice hand.', '😎'].map(function (t) { return '<button data-t="' + t + '">' + t + '</button>'; }).join('') + '</div>' +
        '<div class="why" id="why"></div>');
      wireMute(); $('#x').onclick = function () { clearTimers(); home(); };
      function redrawSeats() { var L = $('#lounge .seats'); if (L) L.outerHTML = seats(state); }
      app.querySelectorAll('#talk button').forEach(function (b) { b.onclick = function () { bubbles.me = b.dataset.t; redrawSeats(); SND.chip(); }; });
      // computer players lock in at their own times
      game.players.forEach(function (p) {
        if (!p.bot) return;
        var a = game.answers[p.id];
        later(function () { if (!closed) { state[p.id] = '✔︎'; redrawSeats(); SND.card(0); maybeClose(); } }, a.secs * 1000);
      });
      function answer(k) {
        if (closed || game.answers.me) return;
        game.submit('me', k, (performance.now() - t0) / 1000);
        state.me = '✔︎'; redrawSeats();
        app.querySelectorAll('.ans button').forEach(function (b) { b.disabled = true; });
        app.querySelectorAll('.ans button')[k].classList.add('picked');
        maybeClose();
      }
      function maybeClose() {
        var all = game.players.every(function (p) { return game.answers[p.id] && (performance.now() - t0) / 1000 >= game.answers[p.id].secs; });
        if (all) reveal();
      }
      function reveal() {
        if (closed) return; closed = true;
        if (clockTick) { clearInterval(clockTick); clockTick = null; }
        keyHandler = null;
        var r = game.close();
        game.players.forEach(function (p) { state[p.id] = p.last.ok ? '+' + p.last.pts : (p.last.answered ? '✖' : '⏰'); });
        var meRes = game.players[0].last;
        // table talk from one computer player
        var talker = game.players.filter(function (p) { return p.bot; })[Math.floor(rand() * 3)];
        bubbles[talker.id] = G.talk(rand, r.first === talker.id ? 'first' : talker.last.ok ? 'win' : 'lose');
        redrawSeats();
        app.querySelectorAll('.ans button').forEach(function (b) { b.disabled = true; if (+b.dataset.k === q.a) b.classList.add('right'); else if (b.classList.contains('picked')) b.classList.add('wrong'); });
        meRes.ok ? SND.right() : SND.wrong();
        mark(q.topic, meRes.ok); S[meRes.ok ? 'right' : 'wrong']++; save();
        var winner = r.first ? game.players.filter(function (p) { return p.id === r.first; })[0] : null;
        var w = $('#why');
        w.innerHTML = '<div class="verdict ' + (meRes.ok ? 'ok' : 'no') + '">' + (meRes.ok ? 'Right! +' + meRes.pts : meRes.answered ? 'Not quite.' : 'Too slow.') + '</div><div>' + (q.why || '') + '</div>' + whyPic(q) +
          (winner && winner.id !== 'me' ? '<button class="btn" id="gift">🍹 Send ' + winner.name + ' a drink</button>' : '') +
          '<button class="btn big next" id="next">' + (game.round >= game.rounds ? 'Podium 🏆' : 'Next round ▶') + '</button>';
        w.classList.add('show');
        if ($('#gift')) $('#gift').onclick = function () { gifts[winner.id] = '🍹'; bubbles[winner.id] = 'Cheers!'; redrawSeats(); SND.chip(); this.remove(); };
        $('#next').onclick = round;
        keyHandler = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); round(); } };
        streak = meRes.ok ? streak + 1 : 0;
        seatFx(game.players.map(function (p) { return !!(p.last && p.last.ok); }), meRes.ok, meRes.pts, streak);
      }
      app.querySelectorAll('.ans button').forEach(function (b) { b.onclick = function () { answer(+b.dataset.k); }; });
      keyHandler = function (e) { var k = +e.key - 1; if (k >= 0 && k < q.c.length) answer(k); };
      clockTick = setInterval(function () {
        var el = (performance.now() - t0) / 1000, left = Math.max(0, game.seconds - el);
        var bar = $('#bar'); if (bar) { bar.style.width = (left / game.seconds * 100) + '%'; $('#timer').className = 'timer' + (left <= 5 ? ' low' : ''); }
        if (left <= 0) reveal(); else if (game.answers.me) maybeClose();
      }, 100);
    }
    function podium() {
      clearTimers();
      var st = game.finish(), mine = game.players[0], place = st.indexOf(mine) + 1;
      S.partyRating = mine.newRating; var gain = Math.round(mine.score / 10) + (place === 1 ? 50 : 0); S.xp += gain;
      S.partyGames = (S.partyGames || 0) + 1; if (place === 1) { S.partyWins = (S.partyWins || 0) + 1; S.chips = (S.chips || 0) + 50; } save();
      place === 1 ? SND.win() : SND.over();
      var medal = ['🥇', '🥈', '🥉', '4th'];
      h('<div class="head"><h2>Podium</h2><span>' + muteBtn() + '</span></div>' +
        '<div class="center" style="font-size:64px">' + (place === 1 ? '🏆' : medal[place - 1]) + '</div>' +
        '<div class="center qtext">' + (place === 1 ? 'You won the table!' : 'You finished ' + ['1st', '2nd', '3rd', '4th'][place - 1] + '.') + '</div>' +
        st.map(function (p, i) {
          return '<div class="stat"><span>' + medal[i] + ' ' + p.name + ' · ' + p.right + '/' + game.rounds + ' right</span><b>' + p.score + ' <small class="' + (p.change >= 0 ? 'good' : 'bad') + '">(' + (p.change >= 0 ? '+' : '') + p.change.toFixed(1) + ')</small></b></div>';
        }).join('') +
        '<div class="stat"><span>Your practice rating</span><b>' + Math.round(S.partyRating) + '</b></div>' +
        '<div class="stat"><span>XP earned</span><b>+' + gain + '</b></div>' +
        '<p class="note">Ratings move by who beat whom (like chess). In Discord this ladder is shared with your friends.</p>' +
        '<button class="btn big yellow" id="again">Play again</button><button class="btn" id="home">Home</button>');
      wireMute(); $('#again').onclick = partyTable; $('#home').onclick = home;
      if (place === 1) fx('celebrate', $('.center'), { n: 32 });
    }
    lobby();
  }

  // ---------- online (Discord): a small menu, the hold'em table, the party table, drills and the trading card ----------
  // The server deals and checks everything; every name or text from the server goes through esc(); pictures only from Discord's CDN.
  var online = null; // { session, base, instanceId, myId, card, chips, ws, v, muted, reported, pm, ... }
  var OLABEL = '<p class="olabel">Brainchips: no cash value. Cannot be bought, sold or cashed. Training game.</p>';
  function ofoot(extra) { return OLABEL + '<p class="foot">' + (extra ? extra + '<br>' : '') + '<a href="privacy.html" class="opriv" target="_blank" rel="noopener">Privacy and fair play</a> · <a href="terms.html" class="oterms" target="_blank" rel="noopener">Terms</a></p>'; }
  function wireFoot() {
    app.querySelectorAll('a.opriv').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); showPrivacy(); }; });
    app.querySelectorAll('a.oterms').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); showDoc('terms.html', 'Terms of Service'); }; });
    if ($('#omenu')) $('#omenu').onclick = function () { onlineMenu(online); };
  }
  /* the privacy page, shown inside the game (a new window may be blocked inside Discord) */
  function showPrivacy() { showDoc('privacy.html', 'Privacy and fair play'); }
  /* our own pages (privacy, terms) shown inside the game; links between them stay inside the game */
  function showDoc(file, title) {
    fetch(file).then(function (r) { if (!r.ok) throw new Error('could not load'); return r.text(); }).then(function (t) {
      var doc = new DOMParser().parseFromString(t, 'text/html'), body = doc.querySelector('.note');
      var o = document.createElement('div'); o.className = 'overlay';
      o.innerHTML = '<div class="modal" style="max-height:86vh;overflow:auto"><h2>' + esc(title) + '</h2><div id="ptext"></div><button class="btn big" id="mok">Close</button></div>';
      if (body) o.querySelector('#ptext').appendChild(document.importNode(body, true));
      document.body.appendChild(o); o.querySelector('#mok').onclick = function () { o.remove(); };
      if (o.querySelectorAll) o.querySelectorAll('a[href="terms.html"], a[href="privacy.html"]').forEach(function (a) {
        a.onclick = function (e) { e.preventDefault(); o.remove(); var f = a.getAttribute('href'); showDoc(f, f === 'terms.html' ? 'Terms of Service' : 'Privacy and fair play'); };
      });
    }).catch(function () { location.href = file; });
  }
  function confirmModal(title, body, yes, onYes) {
    var o = document.createElement('div'); o.className = 'overlay';
    o.innerHTML = '<div class="modal"><h2>' + title + '</h2><p>' + body + '</p><button class="btn big pink" id="myes">' + yes + '</button><button class="btn" id="mno">Cancel</button></div>';
    document.body.appendChild(o);
    o.querySelector('#myes').onclick = function () { o.remove(); onYes(); };
    o.querySelector('#mno').onclick = function () { o.remove(); };
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* a Discord avatar link exactly as the server builds it, or nothing */
  function avatarHref(u) { return typeof u === 'string' && (/^https:\/\/cdn\.discordapp\.com\/avatars\/\d{5,25}\/[A-Za-z0-9_]{6,40}\.png\?size=128$/.test(u) || /^img\/bots\/[a-z0-9-]{2,20}\.webp$/.test(u)) ? esc(u) : null; } // + a computer player's picture from the game files (bots)
  /* an empty seat's "+" (bots): invite a friend through Discord, or add a computer player to that seat */
  function seatMenu(k) {
    var seated = online && online.v && online.v.seats.some(function (s) { return s && s.id === online.myId; });
    var o = document.createElement('div'); o.className = 'overlay';
    o.innerHTML = '<div class="modal"><h2>Empty seat</h2><button class="btn big" id="sinv">Invite a friend</button>' +
      (seated ? '<button class="btn big yellow" id="sbot">Add a computer player</button>' : '<p class="note">Sit down first to add a computer player.</p>') +
      '<button class="btn" id="sno">Cancel</button></div>';
    document.body.appendChild(o);
    o.querySelector('#sinv').onclick = function () {
      o.remove();
      var D = window.DiscordPlay;
      if (D && D.invite) D.invite().catch(function () { toast('Invites work inside Discord'); }); else toast('Invites work inside Discord');
    };
    if (seated) o.querySelector('#sbot').onclick = function () { o.remove(); osend({ t: 'addbot', seat: k }); };
    o.querySelector('#sno').onclick = function () { o.remove(); };
  }
  /* card codes from the server: only real cards reach the pictures */
  function okCards(list) { return (Array.isArray(list) ? list : []).filter(function (c) { return typeof c === 'string' && /^[2-9TJQKA][shdc]\*?$/.test(c); }); }
  function okPic(p) { if (!p || typeof p !== 'object') return null; return { you: p.you && okCards(p.you), him: p.him && okCards(p.him), board: p.board && okCards(p.board), note: p.note ? esc(p.note) : '' }; }
  function api(path, opt) {
    opt = opt || {}; opt.headers = Object.assign({ 'x-session': online.session }, opt.headers || {});
    return fetch(online.base + path, opt).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) { var er = new Error(b.error || 'server error'); er.status = r.status; throw er; } return b; }); });
  }
  function closeSock() { if (online && online.ws) { var w = online.ws; online.ws = null; try { w.close(); } catch (e) { /* gone */ } } }
  function sockUrl(kind) { var proto = location.protocol === 'https:' ? 'wss:' : 'ws:'; return proto + '//' + location.host + online.base + '/api/' + kind + '/' + encodeURIComponent(online.instanceId) + '?s=' + encodeURIComponent(online.session); }
  function osend(o) { if (online && online.ws && online.ws.readyState === 1) online.ws.send(JSON.stringify(o)); }
  var MENU_BTN = '<button class="iconbtn" id="omenu" aria-label="Menu">☰</button>';

  function onlineMenu(conn) {
    clearTimers(); closeSock(); online = conn; online.muted = online.muted || {}; online.reported = online.reported || {};
    if (conn.adult !== true) return ageCheck(conn); // adults only (18+): asked once, before the first play
    var c = conn.card || {};
    h('<h1 class="logo" style="font-size:30px">poker trainer</h1><div class="tag">mudschool · in Discord</div>' +
      '<p class="note">Signed in as <b>' + esc(c.name || 'you') + '</b>. Brainchips: <b id="ochips">' + ((conn.chips | 0).toLocaleString()) + '</b></p>' +
      '<button class="btn big yellow" id="oholdem">♠ Hold’em table<small>Everyone in this Activity at one no-limit table. A seat is 1,000 brainchips.</small></button>' +
      '<button class="btn" id="oholdem3d">♠ Hold’em table (3D)<small>Your friends’ table drawn in 3D, if you like. The regular table is the default. The first open loads about 180 KB.</small></button>' +
      '<button class="btn pink" id="oparty">🎉 Party table<small>Race your friends on the same spots. 10 rounds, rated like chess.</small></button>' +
      '<button class="btn" id="odrill">🎯 Drills<small>Quick poker questions on your own. Right answers earn brainchips (up to 600 a day).</small></button>' +
      ((conn.chips | 0) < 1000 ? '<p class="note" id="olow">Fewer than 1,000 brainchips? A seat costs 1,000: Drills earn more.</p>' : '') +
      '<button class="btn" id="ocard">🃏 My card<small>Your trading card, stats and the delete button</small></button>' +
      (conn.owner ? '<button class="btn" id="oreports">🛡 Reports<small>Owner only: reported talk lines and the table talk switch</small></button>' : '') + ofoot());
    wireFoot();
    $('#oholdem').onclick = function () { onlineStart(online); };
    $('#oholdem3d').onclick = function () { open3d(online); };
    $('#oparty').onclick = function () { partyOnline(online); };
    $('#odrill').onclick = function () { drillsOnline(online); };
    $('#ocard').onclick = function () { myCard(online); };
    if ($('#oreports')) $('#oreports').onclick = function () { reportsScreen(online); };
    api('/api/me').then(function (m) { online.card = m.card; online.chips = m.chips; online.owner = !!m.owner; var el = $('#ochips'); if (el) el.textContent = (m.chips | 0).toLocaleString(); }).catch(function () { /* the menu still works */ });
  }
  /* adults only (18+): one question before the first play; the answer is kept on
     the player's own profile (yes or no). A "no" signs out with a friendly message; "Delete my data" stays on offer. */
  function ageCheck(conn) {
    h('<div class="head"><h2>One moment…</h2></div>' + ofoot()); wireFoot();
    api('/api/me').then(function (m) {
      conn.card = m.card; conn.chips = m.chips; conn.owner = !!m.owner;
      if (m.adult === true) { conn.adult = true; return onlineMenu(conn); }
      if (m.adult === false) return under18(conn);
      h('<div class="head"><h2>Adults only (18+)</h2></div>' +
        '<p class="note">This poker training game is for adults only. Brainchips have no value, but it is still poker. Are you 18 or older?</p>' +
        '<button class="btn big yellow" id="age18">Yes, I am 18 or older</button><button class="btn" id="ageno">No, I am under 18</button>' +
        '<p class="note">We keep your answer (yes or no) with your card. It is asked once. If you answer no, we delete your name, picture link and ranking copy at once.</p>' + ofoot());
      wireFoot();
      var send = function (yes) {
        return api('/api/age', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adult: yes }) });
      };
      $('#age18').onclick = function () { send(true).then(function (r) { if (r.adult === true) { conn.adult = true; onlineMenu(conn); } else under18(conn); }).catch(function (e) { toast(e.message); }); };
      // the "deleted" screen shows only after the server saved the "no"; a failed save says so, with a retry
      $('#ageno').onclick = function () {
        send(false).then(function (r) { if (r && r.adult === true) { conn.adult = true; onlineMenu(conn); } else under18(conn); }).catch(function (e) {
          h('<div class="head"><h2>Could not save your answer</h2></div><p class="note">Your answer did not reach the game, so nothing was saved or deleted yet. Please try again. (' + esc(e.message) + ')</p>' +
            '<button class="btn big" id="ageretry">Try again</button>' + ofoot());
          wireFoot(); $('#ageretry').onclick = function () { ageCheck(conn); };
        });
      };
    }).catch(function (e) {
      h('<div class="head"><h2>Could not reach the game</h2></div><p class="note">' + esc(e.message) + '</p><button class="btn big" id="retry">Try again</button>' + ofoot());
      wireFoot(); $('#retry').onclick = function () { ageCheck(conn); };
    });
  }
  function under18(conn) {
    closeSock(); clearTimers(); online = null; // signed out on this screen
    h('<div class="head"><h2>Sorry, adults only</h2></div>' +
      '<p class="note">Thanks for stopping by! This game is only for players 18 and older, so you are signed out. Come back when you are 18.</p>' +
      '<p class="note">We have already deleted your name, your picture link and your ranking copy. We keep only your Discord id and this answer, so we do not ask again. Want us to forget that too? Press the button below.</p>' +
      '<button class="btn danger" id="kidforget">🗑 Delete my data</button>' + ofoot());
    wireFoot();
    $('#kidforget').onclick = function () {
      online = conn;
      api('/api/forget', { method: 'POST' }).then(function () { online = null; h('<div class="head"><h2>Your data is deleted</h2></div><p class="note">Everything we kept about you is gone from the server. Bye for now!</p>' + ofoot()); wireFoot(); })
        .catch(function (e) { online = null; toast('Not deleted: ' + e.message); });
    };
  }
  /* the owner's Reports screen: reported talk lines of this Activity's table and of other tables (30 days), and the table talk switch */
  function reportsScreen(conn) {
    clearTimers(); closeSock(); online = conn;
    var showTable = function (inst) {
      h('<div class="head"><h2>Reports</h2>' + MENU_BTN + '</div><p class="note">Loading…</p>' + ofoot()); wireFoot();
      Promise.all([api('/api/reports?table=' + encodeURIComponent(inst)), api('/api/reports')]).then(function (res) {
        var t = res[0], list = (res[1].tables || []).filter(function (x) { return x.table !== inst; }), reps = Array.isArray(t.reports) ? t.reports : [];
        h('<div class="head"><h2>Reports</h2>' + MENU_BTN + '</div>' +
          '<p class="note">Owner only. Table: <b>' + esc(inst === conn.instanceId ? 'this Activity' : inst) + '</b>. Reported lines are kept 30 days, then deleted.</p>' +
          (reps.length ? reps.slice().reverse().map(function (r) {
            return '<div class="stat"><span>' + esc(new Date(+r.at || 0).toLocaleString()) + ' · <b>' + esc(r.name) + '</b>: ' + esc(r.text) + '</span><b><small>reported by ' + esc(r.by) + '</small></b></div>';
          }).join('') : '<p class="note">No reported lines at this table.</p>') +
          '<button class="btn ' + (t.talkOff ? 'yellow' : 'danger') + '" id="talksw">' + (t.talkOff ? '💬 Turn table talk back on' : '🔇 Turn table talk off') + '<small>For everyone at this table</small></button>' +
          (list.length ? '<p class="note">Other tables with reports:</p>' + list.map(function (x) { return '<button class="btn" data-tbl="' + esc(x.table) + '">' + esc(x.table) + '<small>' + esc(new Date(+x.last || 0).toLocaleString()) + '</small></button>'; }).join('') : '') +
          ofoot());
        wireFoot();
        $('#talksw').onclick = function () { setTalk(inst, !t.talkOff).then(function () { showTable(inst); }).catch(function (e) { toast(e.message); }); };
        app.querySelectorAll('[data-tbl]').forEach(function (b) { b.onclick = function () { showTable(b.dataset.tbl); }; });
      }).catch(function (e) {
        h('<div class="head"><h2>Reports</h2>' + MENU_BTN + '</div><p class="note">Could not load the reports: ' + esc(e.message) + '</p>' + ofoot()); wireFoot();
      });
    };
    showTable(conn.instanceId);
  }
  /* online drills: one question at a time from /api/drill (no answer inside), checked by /api/answer.
     A right answer earns 10 brainchips, up to 600 a day from drills (the server counts); every text from the server is escaped. */
  function drillsOnline(conn) {
    clearTimers(); closeSock(); online = conn;
    var head = '<div class="head"><h2>Drills</h2><span>' + muteBtn() + ' ' + MENU_BTN + '</span></div>';
    var tally = online.drillTally = online.drillTally || { right: 0, asked: 0 };
    var capNote = function (left) { return left == null ? '' : left > 0 ? '<p class="note">Drills can still earn you <b>' + (left | 0) + '</b> brainchips today.</p>' : ''; };
    function load() {
      keyHandler = null; // Enter or space cannot ask for more questions while one is loading
      h(head + '<p class="note">Dealing a question…</p>' + ofoot()); wireMute(); wireFoot();
      api('/api/drill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lessons: [1, 2, 3] }) }).then(ask).catch(function (e) {
        h(head + '<p class="note">Could not get a question: ' + esc(e.message) + '</p><button class="btn big" id="dretry">Try again</button>' + ofoot());
        wireMute(); wireFoot(); $('#dretry').onclick = load;
      });
    }
    function ask(q) {
      var choices = Array.isArray(q.c) ? q.c : [], rows = picRows(okPic(q.pic)), qid = String(q.qid || ''), picked = null;
      function draw(res) {
        var html = head + '<p class="note">Right answers earn <b>10 brainchips</b> each, up to 600 a day from drills. You have 2 minutes per question.' +
          (tally.asked ? ' This visit: ' + (tally.right | 0) + ' / ' + (tally.asked | 0) + ' right.' : '') + '</p>' +
          (rows.length ? '<div class="table">' + tablePic(rows, { deal: !res }) + '</div>' : '') +
          '<div class="qtext">' + esc(q.q) + '</div>' +
          '<div class="ans' + (choices.some(function (t) { return String(t).length > 16; }) ? ' wide' : '') + '">' + choices.map(function (t, k) {
            var cls = res ? (k === res.a ? 'right' : k === picked ? 'wrong' : '') : '';
            return '<button data-k="' + k + '" class="' + cls + '"' + (res ? ' disabled' : '') + '>' + esc(t) + '<span class="k">' + (k + 1) + '</span></button>';
          }).join('') + '</div>';
        if (res) {
          var outs = Array.isArray(res.outs) ? okCards(res.outs) : [];
          html += '<div class="why show">' +
            '<div class="verdict ' + (res.ok ? 'ok' : 'no') + '">' + (res.late ? 'Too late: 2 minutes are up.' : res.ok ? 'Right!' + (res.chips > 0 ? ' +' + (res.chips | 0) + ' brainchips' : '') : 'Not quite.') + '</div>' +
            (!res.ok && choices[res.a] != null ? '<div><b>Answer: ' + esc(choices[res.a]) + '</b></div>' : '') +
            '<div>' + esc(res.why || '') + '</div>' + (outs.length ? '<div style="margin-top:6px">' + miniCards(outs, outs.length + ' outs: these cards make it') + '</div>' : '') +
            (res.ok && !res.late && !(res.chips > 0) && res.capLeft === 0 ? '<p class="note" id="dcap"><b>Daily drill limit reached:</b> you have earned today\'s 600 brainchips from drills. Keep practising for XP and gift tokens; drill chips start again tomorrow.</p>' : capNote(res.capLeft)) +
            (res.bank != null ? '<div class="stat"><span>Brainchips</span><b id="dbank">' + (res.bank | 0).toLocaleString() + '</b></div>' : '') +
            '</div><button class="btn big yellow" id="dnext">Next question</button><button class="btn" id="dmenu">Back to the menu</button>';
        }
        h(html + ofoot()); wireMute(); wireFoot();
        if (res) {
          keyHandler = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); load(); } };
          $('#dnext').onclick = load; $('#dmenu').onclick = function () { onlineMenu(online); };
          return;
        }
        var pick = function (k) {
          if (picked != null) return; picked = k; keyHandler = null;
          app.querySelectorAll('.ans button').forEach(function (b) { b.disabled = true; if (+b.dataset.k === k) b.classList.add('picked'); });
          api('/api/answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ qid: qid, choice: k }) }).then(function (r) {
            r = r || {}; r.a = r.a | 0; tally.asked++; if (r.ok) tally.right++;
            if (r.bank != null) online.chips = r.bank | 0;
            r.ok ? SND.right() : SND.wrong(); draw(r);
            if (fxOn()) {
              var rb = app.querySelector('.ans button.right');
              if (r.ok && !r.late) { answerFx(rb, true); if (r.chips > 0) fx('pop', '+' + (r.chips | 0) + ' brainchips', rb, 'chips'); }
              else answerFx(app.querySelector('.ans button.wrong') || rb, false);
            }
          }).catch(function (e) { toast(e.message); load(); });
        };
        app.querySelectorAll('.ans button').forEach(function (b) { b.onclick = function () { pick(+b.dataset.k); }; });
        keyHandler = function (e) { var k = +e.key - 1; if (k >= 0 && k < choices.length) pick(k); };
      }
      draw(null);
    }
    load();
  }
  /* the host switch (owner only, checked on the server): table talk off or on for one table */
  function setTalk(inst, off) { return api('/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ table: inst, off: off }) }); }

  /* the friends' Hold'em table drawn in 3D: only when the player picks it in the online menu (the 2D table stays the
     default; never in lessons, drills, party quiz or cards). js/table3d.js
     loads on first use only. */
  var loading3d = false;
  function open3d(conn) {
    if (loading3d) return;                                   // a second tap while the bundle loads does nothing
    clearTimers(); closeSock(); online = conn;
    var go = function () {
      if (!window.Table3D || typeof window.Table3D.startOnline !== 'function') { toast('Could not load the 3D table. The regular table still works.'); return onlineMenu(conn); }
      window.Table3D.startOnline({ session: conn.session, myId: conn.myId, instanceId: conn.instanceId, base: conn.base,
        sound: { on: !!S.sound, set: function (v) { S.sound = v; SND.setOn(v); save(); } },
        onExit: function () { onlineMenu(conn); } });
    };
    if (window.Table3D) return go();
    loading3d = true;
    h('<div class="tag">Loading the 3D table…</div><p class="note">About 180 KB, only the first time. Brainchips: no cash value.</p>');
    var sc = document.createElement('script'); sc.src = 'js/table3d.js';
    sc.onload = function () { loading3d = false; go(); };
    sc.onerror = function () { loading3d = false; sc.remove(); toast('Could not load the 3D table. The regular table still works.'); onlineMenu(conn); };
    document.head.appendChild(sc);
  }

  // ---- the hold'em table ----
  function onlineStart(conn) {
    clearTimers(); closeSock();
    online = conn; online.muted = online.muted || {}; online.reported = online.reported || {}; online.v = null; online.fxs = null; // the first picture after (re)joining moves nothing
    h('<div class="head"><h2>Joining the table…</h2>' + MENU_BTN + '</div><p class="note">Signed in as ' + esc(conn.card && conn.card.name || 'you') + '. Brainchips: ' + (conn.chips | 0) + '.</p>' + ofoot());
    wireFoot();
    var ws = new WebSocket(sockUrl('table'));
    online.ws = ws;
    ws.onmessage = function (e) {
      var m = JSON.parse(e.data);
      if (m.t === 'view') { online.v = m.v; drawOnline(); }
      else if (m.t === 'reported') { online.reported[m.line] = true; toast('Reported'); if (online.v) drawOnline(); }
      else if (m.t === 'notice') { online.notice = String(m.text || '').slice(0, 300); if (online.v) drawOnline(); } // e.g. the daily limit on brainchips won from computer players: a note that stays on the table screen
      else if (m.error) toast(m.error);
    };
    ws.onclose = function () {
      if (online && online.ws === ws) {
        online.ws = null;
        h('<div class="head"><h2>Table closed</h2>' + MENU_BTN + '</div><p class="note">The connection ended, so you were stood up. Your brainchips at the table go back to your bank (after the hand, if one was running).</p><button class="btn big" id="re">Rejoin</button>' + ofoot());
        wireFoot(); $('#re').onclick = function () { onlineStart(conn); };
      }
    };
    clockTick = setInterval(function () { var t = $('#otimer'); if (t && online && online.v && online.v.deadline) { var s = Math.max(0, Math.ceil((online.v.deadline - Date.now()) / 1000)); t.textContent = s + ' s'; } }, 500);
  }
  var OPOS = [[160, 300], [40, 262], [14, 165], [40, 66], [118, 22], [202, 22], [280, 66], [306, 165], [280, 262]]; // 9 seats, you at the bottom
  var OTALK = ['Ship it!', 'Too slow!', 'Nice hand.', '🍹 Cheers!', '😎'];
  /* talk lines: muted players are hidden on this screen only; any line by someone else can be reported */
  function talkLines(v) {
    var lines = (v.talk || []).filter(function (x) { return !online.muted[x.id]; });
    var s = lines.map(function (x) {
      var mine = x.id === online.myId;
      return '<div class="tline"><span><b>' + esc(x.name) + (x.bot ? ' (computer player)' : '') + ':</b> ' + esc(x.text) + '</span>' + (mine ? '' :
        '<button data-mute="' + esc(x.id) + '" data-name="' + esc(x.name) + '">Mute</button>' +
        (online.reported[x.n] ? '<em>Reported</em>' : '<button data-rep="' + (x.n | 0) + '">Report</button>')) + '</div>';
    }).join('');
    var muted = Object.keys(online.muted);
    if (muted.length) s += '<div class="tline muted">Muted: ' + muted.map(function (id) { return '<button data-unmute="' + esc(id) + '">' + esc(online.muted[id]) + ' ✕</button>'; }).join(' ') + '</div>';
    return s ? '<div class="tlines">' + s + '</div>' : '';
  }
  function wireTalk() {
    app.querySelectorAll('[data-mute]').forEach(function (b) { b.onclick = function () { online.muted[b.dataset.mute] = b.dataset.name; drawOnline(); }; });
    app.querySelectorAll('[data-unmute]').forEach(function (b) { b.onclick = function () { delete online.muted[b.dataset.unmute]; drawOnline(); }; });
    app.querySelectorAll('[data-rep]').forEach(function (b) {
      b.onclick = function () { confirmModal('Report this line?', 'The line, the name and the time are kept for 30 days so the game owner (the person who runs this game) can review them. Only he can read them.', 'Report', function () { osend({ t: 'report', line: +b.dataset.rep }); }); };
    });
  }
  function drawOnline() {
    var v = online && online.v; if (!v) return;
    var mySeat = v.seats.findIndex(function (s) { return s && s.id === online.myId; });
    var n = v.seats.length, rot = mySeat >= 0 ? mySeat : 0, s = '';
    s += '<defs><radialGradient id="ofelt" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#241656"/><stop offset="1" stop-color="#0c0820"/></radialGradient></defs>';
    s += '<rect x="20" y="40" width="280" height="250" rx="125" fill="#1a0f33" stroke="#9d6bff" stroke-width="10" stroke-opacity=".35"/>';
    s += '<rect x="20" y="40" width="280" height="250" rx="125" fill="none" stroke="#ff2bd6" stroke-width="2" style="filter:drop-shadow(0 0 6px #ff2bd6)"/>';
    s += '<rect x="34" y="54" width="252" height="222" rx="111" fill="url(#ofelt)" stroke="#19f0ff" stroke-width="1.5" stroke-opacity=".7"/>';
    s += '<text x="160" y="122" text-anchor="middle" font-size="9" letter-spacing="1.5" font-weight="700" fill="#19f0ff" fill-opacity=".3" style="pointer-events:none">mudmodecrew.com</text>'; // the makers' name printed on the felt: not a link, nothing tracked
    var bx = 160 - (5 * 38 + 4 * 4) / 2, board = okCards(v.board);
    // effects: compared with the last picture of this table (the first picture after joining moves nothing)
    var fxs = online.fxs, fxNow = fxOn() && !!fxs;
    if (!fxs) fxs = online.fxs = { bets: {}, board: board.length, paid: v.last && v.last.handNo, hole: '' };
    for (var k = 0; k < 5; k++) s += board[k] ? cardSVG(board[k], bx + k * 42, 132, 38, 54, fxNow && k >= fxs.board ? { deal: true, delay: (k - fxs.board) * 0.08 } : null) : '<rect x="' + (bx + k * 42) + '" y="132" width="38" height="54" rx="5" fill="none" stroke="#ffffff22" stroke-dasharray="4 3"/>';
    if (fxNow && board.length > fxs.board) SND.card(0);
    var newBets = {}, won = fxNow && v.last && v.toAct < 0 && v.last.handNo !== fxs.paid && Array.isArray(v.last.winners) ? v.last.winners : [], winFx = '', myWin = 0;
    s += '<text x="160" y="208" text-anchor="middle" font-size="15" font-weight="800" fill="#ffe14d" font-family="Comic Sans MS,system-ui">Pot ' + (v.pot | 0) + ' · <tspan id="otimer"></tspan></text>';
    v.seats.forEach(function (p, seat) {
      var pos = OPOS[(seat - rot + n) % n] || OPOS[0];
      if (!p) { s += '<g class="oplus" data-plus="' + seat + '" role="button" tabindex="0" aria-label="Empty seat: invite a friend or add a computer player"><circle cx="' + pos[0] + '" cy="' + pos[1] + '" r="14" fill="#00000001" stroke="#ffffff22" stroke-dasharray="3 3"/><text x="' + pos[0] + '" y="' + (pos[1] + 5) + '" text-anchor="middle" font-size="15" font-weight="700" fill="#ffffff">+</text></g>'; return; } // bots: the subtle "+"
      var me = seat === mySeat, active = v.toAct === seat, col = me ? '#19f0ff' : '#ff2bd6', av = avatarHref(p.avatar), cards = okCards(p.cards);
      s += '<g opacity="' + (p.folded ? 0.45 : 1) + '">';
      s += '<circle cx="' + pos[0] + '" cy="' + pos[1] + '" r="20" fill="#0d0b1c" stroke="' + col + '" stroke-width="' + (active ? 4 : 2) + '"' + (active ? ' style="filter:drop-shadow(0 0 8px ' + col + ')"' : '') + '/>';
      if (av) s += '<clipPath id="av' + seat + '"><circle cx="' + pos[0] + '" cy="' + pos[1] + '" r="18"/></clipPath><image href="' + av + '" x="' + (pos[0] - 18) + '" y="' + (pos[1] - 18) + '" width="36" height="36" clip-path="url(#av' + seat + ')"/>';
      else s += '<text x="' + pos[0] + '" y="' + (pos[1] + 7) + '" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" font-family="Comic Sans MS,system-ui">' + esc(String(p.name || '?')[0]) + '</text>';
      s += '<text x="' + pos[0] + '" y="' + (pos[1] + 34) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#eef3ff">' + esc(p.name) + '</text>';
      s += '<text x="' + pos[0] + '" y="' + (pos[1] + 47) + '" text-anchor="middle" font-size="11" fill="' + col + '">' + (p.stack | 0) + (p.allIn ? ' ALL-IN' : '') + '</text>';
      if (p.bot) s += '<text x="' + pos[0] + '" y="' + (pos[1] + 58) + '" text-anchor="middle" font-size="8.5" fill="#c3c9e6">computer player' + (/^(hot|steady|slumping)$/.test(p.form) ? ' · ' + p.form : '') + '</text>'; // bots: always labelled
      if (p.button) s += '<circle cx="' + (pos[0] + 22) + '" cy="' + (pos[1] - 16) + '" r="8" fill="#fff"/><text x="' + (pos[0] + 22) + '" y="' + (pos[1] - 12) + '" text-anchor="middle" font-size="10" font-weight="800" fill="#14121f">D</text>';
      var cx = pos[0] + (160 - pos[0]) * 0.4, cy = pos[1] + (165 - pos[1]) * 0.4, was = fxs.bets[p.id] || 0;
      newBets[p.id] = p.bet | 0;
      if (p.bet > 0) {
        var chip = '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="#c62828" stroke="#fff" stroke-dasharray="3 2"/><text x="' + cx + '" y="' + (cy - 10) + '" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">' + (p.bet | 0) + '</text>';
        s += fxNow && p.bet > was ? chipSlide('fx-slide', pos[0] - cx, pos[1] - cy, chip) : chip;
      } else if (fxNow && was > 0) s += chipSlide('fx-sweep', cx - 160, cy - 200, potChip(160, 200));
      won.forEach(function (w) {
        if (!w || w.id !== p.id || !(w.amount > 0)) return;
        winFx += chipSlide('fx-win', 160 - pos[0], 200 - pos[1], potChip(pos[0], pos[1] - 4) + potChip(pos[0] + 5, pos[1] - 9)) +
          '<text class="fx-rise" x="' + pos[0] + '" y="' + (pos[1] - 26) + '" text-anchor="middle" font-size="16" font-weight="800" fill="#ffe14d" stroke="#0d0b1c" stroke-width="3" paint-order="stroke" font-family="Comic Sans MS,system-ui">+' + (w.amount | 0) + '</text>';
        if (me) myWin = { amount: w.amount | 0, x: pos[0], y: pos[1] };
      });
      if (!me && cards.length === 2) s += cardSVG(cards[0], pos[0] - 26, pos[1] - 64, 24, 34, won.length ? { flip: true } : null) + cardSVG(cards[1], pos[0] + 2, pos[1] - 64, 24, 34, won.length ? { flip: true, delay: 0.08 } : null);
      else if (!me && p.hasCards) s += '<rect x="' + (pos[0] - 20) + '" y="' + (pos[1] - 58) + '" width="18" height="26" rx="3" fill="#8e1b5b" stroke="#ff2bd6"/><rect x="' + (pos[0] - 4) + '" y="' + (pos[1] - 58) + '" width="18" height="26" rx="3" fill="#8e1b5b" stroke="#ff2bd6"/>';
      s += '</g>';
    });
    s += winFx;
    var mine = mySeat >= 0 ? v.seats[mySeat] : null, myCards = mine ? okCards(mine.cards) : [], L = v.legal, acts = '';
    var holeKey = myCards.join(','), dealHole = fxNow && myCards.length === 2 && holeKey !== fxs.hole;
    online.fxs = { bets: newBets, board: board.length, paid: v.last ? v.last.handNo : fxs.paid, hole: holeKey };
    if (L) {
      var step5 = function (x) { return Math.round(x / v.sb) * v.sb; }, cur = Math.max.apply(null, v.seats.map(function (q) { return q ? q.bet : 0; }));
      var half = step5(cur + (v.pot + L.call) / 2), full = step5(cur + v.pot + L.call);
      acts = '<div class="ans">' + (L.fold ? '<button data-a="f">Fold</button>' : '') + '<button data-a="cc">' + (L.check ? 'Check' : 'Call ' + (L.call | 0)) + '</button>' +
        (L.raise ? '<button data-a="cbr" data-to="' + (L.minTo | 0) + '">' + (cur ? 'Raise ' : 'Bet ') + (L.minTo | 0) + '</button>' : '') + '</div>' +
        (L.raise ? '<div class="ans" style="margin-top:8px">' + [['½ pot', half], ['Pot', full], ['All-in', L.maxTo]].filter(function (o) { return o[1] > L.minTo && o[1] <= L.maxTo; })
          .map(function (o) { return '<button data-a="cbr" data-to="' + (o[1] | 0) + '">' + o[0] + ' (' + (o[1] | 0) + ')</button>'; }).join('') + '</div>' : '');
    }
    var handRunning = v.toAct >= 0;
    var ctl = mySeat < 0 ? '<button class="btn big yellow" id="osit">Sit down (1,000 brainchips)</button>'
      : '<div class="row2">' + (!handRunning ? '<button class="btn yellow" id="odeal">Deal ▶</button>' : '<span></span>') + '<button class="btn" id="ostand">Stand up</button></div>';
    h('<div class="head"><h2>Discord table ' + (v.sb | 0) + '/' + (v.bb | 0) + '</h2><span>' + muteBtn() + ' ' + MENU_BTN + '</span></div>' +
      '<div class="lounge" style="padding:6px"><svg viewBox="0 0 320 340" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto;overflow:visible">' + s + '</svg></div>' +
      '<div class="center" style="min-height:22px;color:#c3c9e6">' + esc((v.events[v.events.length - 1] || {}).text || '') + '</div>' +
      (myCards.length === 2 ? '<div class="center" style="margin:6px 0"><svg viewBox="0 0 130 86" width="150" style="overflow:visible">' + cardSVG(myCards[0], 0, 0, 62, 86, dealHole ? { deal: true } : null) + cardSVG(myCards[1], 68, 0, 62, 86, dealHole ? { deal: true, delay: 0.1 } : null) + '</svg></div>' : '') +
      acts + ctl +
      (online.notice ? '<p class="note" id="onotice" role="status">' + esc(online.notice) + '</p>' : '') +
      (v.talkOff ? '<p class="note">Table talk is off at this table (the host switched it off).</p>' :
        (mySeat >= 0 ? '<div class="talk" id="otalk">' + OTALK.map(function (t) { return '<button data-t="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' : '') + talkLines(v)) +
      (online.owner ? '<button class="btn" id="otalksw">' + (v.talkOff ? '💬 Host: turn table talk on' : '🔇 Host: turn table talk off') + '</button>' : '') +
      '<div class="note" style="margin-top:8px">' + v.events.slice(-5).map(function (e) { return esc(e.text); }).join('<br>') + '</div>' +
      ofoot('The server deals; your screen only ever gets your own cards. Leaving the table stands you up.'));
    wireMute(); wireFoot(); wireTalk();
    app.querySelectorAll('.ans button').forEach(function (b) { b.onclick = function () { osend({ t: 'act', a: b.dataset.a, to: b.dataset.to ? +b.dataset.to : undefined }); }; });
    if ($('#osit')) $('#osit').onclick = function () { online.notice = null; osend({ t: 'sit' }); };
    if ($('#odeal')) $('#odeal').onclick = function () { osend({ t: 'start' }); };
    if ($('#ostand')) $('#ostand').onclick = function () { osend({ t: 'stand' }); };
    app.querySelectorAll('[data-plus]').forEach(function (g) { g.onclick = function () { seatMenu(+g.dataset.plus); }; g.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') seatMenu(+g.dataset.plus); }; }); // bots: empty-seat "+"
    app.querySelectorAll('#otalk button').forEach(function (b) { b.onclick = function () { osend({ t: 'talk', text: b.dataset.t }); }; });
    if ($('#otalksw')) $('#otalksw').onclick = function () { setTalk(online.instanceId, !v.talkOff).catch(function (e) { toast(e.message); }); };
    if (dealHole) { SND.card(0); SND.card(1); }
    if (myWin) later(function () { // you won: a gold burst when the chips reach your seat; a big pot (30 big blinds or more) also shakes gently
      fx('burst', tablePt(myWin.x, myWin.y), { kind: 'gold', n: myWin.amount >= 30 * (v.bb | 0) ? 22 : 12, spread: 70 }); if (myWin.amount >= 30 * (v.bb | 0)) fx('shake');
    }, 900);
    // crowd sounds, once per hand, only for pots of 30 big blinds or more (never both): a rimshot when you win it, a low "ooh" when you lose it at a showdown
    var mineSnd = mySeat >= 0 ? v.seats[mySeat] : null;
    if (online.sndPaid === undefined) online.sndPaid = v.last ? v.last.handNo : null;
    else if (v.last && v.toAct < 0 && v.last.handNo !== online.sndPaid && Array.isArray(v.last.winners)) {
      online.sndPaid = v.last.handNo;
      var potS = v.last.winners.reduce(function (a, w) { return a + ((w && w.amount) | 0); }, 0), iWon = mineSnd ? v.last.winners.filter(function (w) { return w && w.id === mineSnd.id; })[0] : null;
      if (mineSnd && potS >= 30 * (v.bb | 0)) {
        if (iWon) later(function () { SND.rimshot(); }, 1500);
        else if (v.last.shown && v.last.cards && v.last.cards[mineSnd.id]) later(function () { SND.ooh(); }, 1200);
      }
    }
  }

  // ---- the party table (online): the server deals the same spot to all, keeps the answer and the clock ----
  function partyOnline(conn) {
    clearTimers(); closeSock();
    online = conn; online.pm = null; online.pround = 0; online.picked = null; online.heard = 0; online.pstreak = 0;
    h('<div class="head"><h2>Joining the party table…</h2>' + MENU_BTN + '</div>' + ofoot());
    wireFoot();
    var ws = new WebSocket(sockUrl('party'));
    online.ws = ws;
    ws.onopen = function () { osend({ t: 'join' }); };
    ws.onmessage = function (e) {
      var m = JSON.parse(e.data);
      if (m.t === 'view') { online.pm = m; online.skew = (m.now || Date.now()) - Date.now(); drawParty(); }
      else if (m.error) toast(m.error);
    };
    ws.onclose = function () {
      if (online && online.ws === ws) {
        online.ws = null;
        h('<div class="head"><h2>Party table closed</h2>' + MENU_BTN + '</div><p class="note">The connection ended.</p><button class="btn big" id="re">Rejoin</button>' + ofoot());
        wireFoot(); $('#re').onclick = function () { partyOnline(conn); };
      }
    };
    clockTick = setInterval(partyClock, 100);
  }
  function serverNow() { return Date.now() + (online && online.skew || 0); }
  function partyClock() {
    var m = online && online.pm; if (!m) return;
    var v = m.v, bar = $('#pbar'), nx = $('#pnext');
    if (bar && v.deadline) { var left = Math.max(0, (v.deadline - serverNow()) / 1000); bar.style.width = Math.min(100, left / 15 * 100) + '%'; $('#ptimer').className = 'timer' + (left <= 5 ? ' low' : ''); }
    if (nx && m.nextAt) nx.textContent = 'Next round in ' + Math.max(0, Math.ceil((m.nextAt - serverNow()) / 1000)) + ' s';
  }
  function pSeats(v, me) {
    return '<div class="seats">' + v.players.map(function (p) {
      var av = avatarHref(p.avatar), st = v.q && v.q.a != null && p.last ? (p.last.ok ? '+' + (p.last.pts | 0) : p.last.answered ? '✖' : '⏰') : p.locked ? '✔︎' : v.state === 'playing' ? '…' : '';
      return '<div class="seat' + (p.id === me ? ' me' : '') + '" style="--c:' + (p.id === me ? '#19f0ff' : '#ff2bd6') + '">' +
        '<div class="av">' + (av ? '<svg viewBox="0 0 40 40" width="36" height="36"><clipPath id="pa' + esc(p.id) + '"><circle cx="20" cy="20" r="18"/></clipPath><image href="' + av + '" x="2" y="2" width="36" height="36" clip-path="url(#pa' + esc(p.id) + ')"/></svg>' : esc(String(p.name || '?')[0].toUpperCase())) +
        (p.gifts ? '<span class="gift">🍹' + (p.gifts > 1 ? (p.gifts | 0) : '') + '</span>' : '') + '</div>' +
        '<div class="nm">' + esc(p.name) + '</div><div class="sc">' + (p.score | 0) + '</div><div class="st">' + st + '</div></div>';
    }).join('') + '</div>';
  }
  function drawParty() {
    var m = online.pm, v = m.v, me = m.me, inGame = v.players.some(function (p) { return p.id === me; });
    var head = function (t) { return '<div class="head"><h2>' + t + '</h2><span>' + muteBtn() + ' ' + MENU_BTN + '</span></div>'; };
    if (v.state === 'playing' && v.q) {
      var newRound = online.pround !== v.round, closed = v.q.a != null, roundFx = null;
      if (newRound) { online.pround = v.round; online.picked = null; }
      var rows = picRows(okPic(v.q.pic)), choices = Array.isArray(v.q.c) ? v.q.c : [];
      var mineK = v.mine != null ? v.mine : online.picked;
      var html = head('Round ' + (v.round | 0) + ' / ' + (v.rounds | 0)) +
        (closed ? '' : '<div class="timer" id="ptimer"><i id="pbar" style="width:100%"></i></div>') +
        '<div class="lounge">' + pSeats(v, me) + (rows.length ? '<div class="table plush">' + tablePic(rows, { deal: newRound && !closed }) + '</div>' : '<div class="table plush plain"><div class="center" style="font-size:40px">🃏</div></div>') + '</div>' +
        '<div class="qtext">' + esc(v.q.q) + '</div>' +
        '<div class="ans' + (choices.some(function (t) { return String(t).length > 16; }) ? ' wide' : '') + '">' + choices.map(function (t, k) {
          var cls = closed ? (k === v.q.a ? 'right' : k === mineK ? 'wrong' : '') : k === mineK ? 'picked' : '';
          return '<button data-k="' + k + '" class="' + cls + '"' + (closed || mineK != null || !inGame ? ' disabled' : '') + '>' + esc(t) + '<span class="k">' + (k + 1) + '</span></button>';
        }).join('') + '</div>';
      if (!inGame) html += '<p class="note">A game is running. Watch this one; you can join the next one.</p>';
      if (closed) {
        var my = v.players.filter(function (p) { return p.id === me; })[0], res = my && my.last;
        var first = v.first ? v.players.filter(function (p) { return p.id === v.first; })[0] : null;
        var why = '';
        if (Array.isArray(v.q.outs) && v.q.outs.length) why = '<div style="margin-top:6px">' + miniCards(okCards(v.q.outs), okCards(v.q.outs).length + ' outs: these cards make it') + '</div>';
        else if (v.q.wpic) { var wr = picRows(okPic(v.q.wpic)); if (wr.length) why = tablePic(wr, { note: okPic(v.q.wpic).note }); }
        html += '<div class="why show">' +
          (res ? '<div class="verdict ' + (res.ok ? 'ok' : 'no') + '">' + (res.ok ? 'Right! +' + (res.pts | 0) : res.answered ? 'Not quite.' : 'Too slow.') + '</div>' : '') +
          '<div>' + esc(v.q.why || '') + '</div>' + why +
          (first ? '<p class="note">Fastest right answer: <b>' + esc(first.name) + '</b></p>' : '') +
          (first && inGame && first.id !== me && m.giftsLeft > 0 && m.giftTokens > 0 ? '<button class="btn" data-gift="' + esc(first.id) + '">🍹 Send ' + esc(first.name) + ' a drink<small>' + tokensText(m) + ' Just for fun: no value.</small></button>' : '') +
          '<div class="center" id="pnext" style="color:#c3c9e6;margin-top:8px"></div></div>';
        if (online.heard !== v.round && res) { online.heard = v.round; res.ok ? SND.right() : SND.wrong(); online.pstreak = res.ok ? (online.pstreak | 0) + 1 : 0; roundFx = res; }
      }
      h(html + ofoot());
      wireMute(); wireFoot(); wireGifts();
      if (roundFx) seatFx(v.players.map(function (p) { return !!(p.last && p.last.ok); }), roundFx.ok, roundFx.pts, online.pstreak);
      if (!closed && inGame && mineK == null) {
        var pick = function (k) { if (online.picked != null) return; online.picked = k; osend({ t: 'answer', choice: k }); app.querySelectorAll('.ans button').forEach(function (b) { b.disabled = true; if (+b.dataset.k === k) b.classList.add('picked'); }); };
        app.querySelectorAll('.ans button').forEach(function (b) { b.onclick = function () { pick(+b.dataset.k); }; });
        keyHandler = function (e) { var k = +e.key - 1; if (k >= 0 && k < choices.length) pick(k); };
      } else keyHandler = null;
      partyClock();
      return;
    }
    if (v.state === 'done' && v.result) {
      var medal = ['🥇', '🥈', '🥉'], mineR = v.result.filter(function (x) { return x.id === me; })[0], earned = m.earned && m.earned[me];
      var others = v.players.filter(function (p) { return p.id !== me; });
      h(head('Podium') +
        '<div class="center" style="font-size:56px">' + (mineR && mineR.place === 1 ? '🏆' : '🎉') + '</div>' +
        (mineR ? '<div class="center qtext">' + (mineR.place === 1 ? 'You won the table!' : 'You finished #' + (mineR.place | 0) + '.') + '</div>' : '') +
        v.result.map(function (x, i) {
          var ch = +x.change || 0;
          return '<div class="stat"><span>' + (medal[i] || '#' + (i + 1)) + ' ' + esc(x.name) + ' · ' + (x.right | 0) + '/' + (v.rounds | 0) + ' right</span><b>' + (x.score | 0) +
            ' <small class="' + (ch >= 0 ? 'good' : 'bad') + '">rating ' + (m.ratings && m.ratings[x.id] != null ? (m.ratings[x.id] | 0) + ' ' : '') + '(' + (ch >= 0 ? '+' : '') + ch.toFixed(1) + ')</small></b></div>';
        }).join('') +
        (inGame && earned > 0 ? '<div class="stat"><span>Brainchips earned</span><b>+' + (earned | 0) + '</b></div>' : '') +
        (inGame && m.giftsLeft > 0 && m.giftTokens > 0 && others.length ? '<div class="talk">' + others.map(function (p) { return '<button data-gift="' + esc(p.id) + '">🍹 ' + esc(p.name) + '</button>'; }).join('') + '</div><p class="note">Send a drink: ' + tokensText(m) + ' Gifts are just for fun and have no value.</p>' :
          inGame ? '<p class="note">' + tokensText(m) + '</p>' : '') +
        '<p class="note">Ratings move by who beat whom (like chess). Your rating and wins are on your trading card.</p>' +
        (inGame ? '<button class="btn big yellow" id="pstart">Play again</button><button class="btn" id="pleave">Leave the party table</button>' : '<button class="btn big yellow" id="pjoin">Join the next game</button>') + ofoot());
      wireMute(); wireFoot(); wireGifts(); wireLobby();
      if (online.heard !== 'podium-' + v.round) { online.heard = 'podium-' + v.round; mineR && mineR.place === 1 ? SND.win() : SND.over(); if (mineR && mineR.place === 1) fx('celebrate', $('.center'), { n: 32 }); }
      return;
    }
    // lobby
    h(head('Party table') +
      '<p class="note">Everyone here races on the same spots: 10 rounds, 15 seconds each. Right and fast scores most (100 down to 50). The server keeps the clock and the answers. Your rating moves by who beat whom; the winner earns 50 brainchips.</p>' +
      '<div class="lounge">' + (v.players.length ? pSeats(v, me) : '<div class="center note">Nobody has joined yet.</div>') + '</div>' +
      (inGame ? '<button class="btn big yellow" id="pstart"' + (v.players.length < 2 ? ' disabled style="opacity:.55"' : '') + '>🃏 Start' + (v.players.length < 2 ? '<small>Needs 2 players</small>' : '') + '</button><button class="btn" id="pleave">Leave the party table</button>'
        : '<button class="btn big yellow" id="pjoin">Join</button>') + ofoot());
    wireMute(); wireFoot(); wireLobby();
  }
  /* gift tokens are earned by learning: 5 right answers = 1 token, at most 3 held; a gift spends one */
  function tokensText(m) {
    var t = m.giftTokens | 0;
    return '🎁 ' + t + ' gift token' + (t === 1 ? '' : 's') + ' (5 right answers earn one, up to 3).' + (t > 0 ? ' ' + (m.giftsLeft | 0) + ' of 3 gifts left this game.' : '');
  }
  function wireGifts() { app.querySelectorAll('[data-gift]').forEach(function (b) { b.onclick = function () { osend({ t: 'gift', to: b.dataset.gift, kind: 'drink' }); SND.chip(); b.disabled = true; }; }); }
  function wireLobby() {
    if ($('#pstart')) $('#pstart').onclick = function () { osend({ t: 'start' }); };
    if ($('#pjoin')) $('#pjoin').onclick = function () { osend({ t: 'join' }); };
    if ($('#pleave')) $('#pleave').onclick = function () { osend({ t: 'leave' }); onlineMenu(online); };
  }

  // ---- the trading card (online): drawn from /api/me; text escaped, picture only from Discord's CDN ----
  var CARD_FONT = 'Comic Sans MS,Comic Neue,system-ui';
  function cardFrame(id, tierIdx) {
    var stops = tierIdx >= 6 ? ['#19f0ff', '#9d6bff', '#ff2bd6', '#ffe14d'] : tierIdx >= 4 ? ['#fff3a0', '#ffd34d', '#c8961e', '#ffe14d'] : tierIdx >= 2 ? ['#ffffff', '#c9d2e6', '#8a94ad', '#e6ebf5'] : ['#f0b27a', '#cd7f32', '#8a5320', '#d9955a'];
    return '<defs><linearGradient id="fr' + id + '" x1="0" y1="0" x2="1" y2="1">' + stops.map(function (c, i) { return '<stop offset="' + (i / 3) + '" stop-color="' + c + '"/>'; }).join('') + '</linearGradient>' +
      '<linearGradient id="bg' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1240"/><stop offset="1" stop-color="#07060f"/></linearGradient>' +
      '<pattern id="gr' + id + '" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" fill="none" stroke="#19f0ff" stroke-opacity=".07"/></pattern>' +
      '<clipPath id="avc' + id + '"><circle cx="180" cy="130" r="60"/></clipPath></defs>' +
      '<rect x="4" y="4" width="352" height="512" rx="22" fill="url(#bg' + id + ')" stroke="url(#fr' + id + ')" stroke-width="6"/>' +
      '<rect x="4" y="4" width="352" height="512" rx="22" fill="url(#gr' + id + ')"/>' +
      '<rect x="16" y="16" width="328" height="488" rx="14" fill="none" stroke="#ffffff" stroke-opacity=".12"/>';
  }
  function cardBar(x, y, w, label, val, pct, col) {
    pct = Math.max(0, Math.min(1, pct || 0));
    return '<text x="' + x + '" y="' + y + '" font-size="13" fill="#cfd6f5">' + label + '</text><text x="' + (x + w) + '" y="' + y + '" font-size="13" text-anchor="end" fill="#fff" font-weight="700">' + val + '</text>' +
      '<rect x="' + x + '" y="' + (y + 5) + '" width="' + w + '" height="8" rx="4" fill="#ffffff14"/><rect x="' + x + '" y="' + (y + 5) + '" width="' + (w * pct).toFixed(1) + '" height="8" rx="4" fill="' + col + '"/>';
  }
  function cardBadge(x, y, label) {
    var icon = /party/i.test(label) ? '🏆' : /outs/i.test(label) ? '⚡' : '🏅';
    return '<g><circle cx="' + x + '" cy="' + y + '" r="22" fill="#0d0b1c" stroke="#ffe14d" stroke-width="2.5"/><text x="' + x + '" y="' + (y + 8) + '" text-anchor="middle" font-size="22">' + icon + '</text>' +
      '<text x="' + x + '" y="' + (y + 38) + '" text-anchor="middle" font-size="10" fill="#cfd6f5">' + esc(String(label).slice(0, 16)) + '</text></g>';
  }
  function cardSVGs(c, chips) {
    var tiers = (window.Party && window.Party.TIERS || []).map(function (t) { return t.name; }), ti = Math.max(0, tiers.indexOf(c.tier));
    var name = esc(String(c.name || 'Player').slice(0, 20)), av = avatarHref(c.avatar), num = function (x) { return (+x || 0).toLocaleString(); };
    var f = cardFrame('f', ti);
    f += '<text x="30" y="46" font-family="' + CARD_FONT + '" font-size="15" fill="#19f0ff">mudschool poker</text><text x="330" y="46" text-anchor="end" font-size="13" fill="#ffe14d">⭐ ' + num(c.xp) + ' XP</text>';
    f += '<circle cx="180" cy="130" r="64" fill="#2a2450" stroke="url(#frf)" stroke-width="5"/>';
    f += av ? '<image href="' + av + '" x="120" y="70" width="120" height="120" clip-path="url(#avcf)"/>' : '<text x="180" y="150" text-anchor="middle" font-family="' + CARD_FONT + '" font-size="58" fill="#fff">' + esc(String(c.name || '?')[0].toUpperCase()) + '</text>';
    f += '<text x="180" y="226" text-anchor="middle" font-family="' + CARD_FONT + '" font-size="26" fill="#fff" style="text-shadow:0 0 8px #ff2bd6">' + name + '</text>';
    f += '<rect x="82" y="238" width="196" height="30" rx="15" fill="#221e08" stroke="#ffe14d"/><text x="180" y="259" text-anchor="middle" font-family="' + CARD_FONT + '" font-size="16" fill="#ffe14d">★ ' + esc(c.tier || 'Kitchen table') + ' ★</text>';
    f += '<g font-family="' + CARD_FONT + '"><text x="70" y="306" text-anchor="middle" font-size="26" fill="#19f0ff">' + num(c.rating) + '</text><text x="70" y="324" text-anchor="middle" font-size="11" fill="#9aa3c7">rating</text>' +
      '<text x="180" y="306" text-anchor="middle" font-size="26" fill="#39ff88">🏆 ' + num(c.partyWins) + '</text><text x="180" y="324" text-anchor="middle" font-size="11" fill="#9aa3c7">party wins</text>' +
      '<text x="290" y="306" text-anchor="middle" font-size="26" fill="#ff2bd6">🎮 ' + num(c.partyGames) + '</text><text x="290" y="324" text-anchor="middle" font-size="11" fill="#9aa3c7">party games</text></g>'; // party games, not a second "party wins"; day streak is not counted online yet
    var os = c.outsSpeed;
    f += cardBar(34, 356, 292, 'Accuracy', (c.accuracy | 0) + '%', (c.accuracy || 0) / 100, '#39ff88') +
      cardBar(34, 384, 292, 'Outs speed', os != null ? (+os).toFixed(1) + ' s' : 'no outs yet', os != null ? 1 - (Math.min(20, Math.max(2, +os)) - 2) / 18 : 0, '#19f0ff') +
      cardBar(34, 412, 292, 'Showdowns won', (c.showdownWin | 0) + '%', (c.showdownWin || 0) / 100, '#ff2bd6');
    var badges = Array.isArray(c.badges) ? c.badges.slice(0, 3) : [];
    if (badges.length) badges.forEach(function (b, i) { f += cardBadge([78, 180, 282][i], 452, b); });
    else f += '<text x="180" y="462" text-anchor="middle" font-size="13" fill="#9aa3c7">No badges yet: win a party table to earn one</text>';
    var b = cardFrame('b', ti);
    b += '<text x="180" y="50" text-anchor="middle" font-family="' + CARD_FONT + '" font-size="20" fill="#fff">' + name + ' · stats</text>';
    var tiles = [['Hands played', num(c.handsPlayed)], ['VPIP / PFR', (c.vpip | 0) + '% / ' + (c.pfr | 0) + '%'], ['Showdowns won', (c.showdownWin | 0) + '%'], ['Biggest pot', num(c.biggestPot)],
      ['Party games', num(c.partyGames)], ['Party wins', num(c.partyWins)], ['Gifts got · tokens', '🍹 ' + num(c.gifts) + ' · 🎁 ' + num(c.giftTokens)], ['Brainchips', num(chips)]];
    tiles.forEach(function (t, i) {
      var x = 34 + (i % 2) * 150, y = 74 + Math.floor(i / 2) * 50;
      b += '<rect x="' + x + '" y="' + y + '" width="142" height="42" rx="8" fill="#0d0b1c" stroke="#2a2450"/><text x="' + (x + 8) + '" y="' + (y + 16) + '" font-size="10.5" fill="#9aa3c7">' + t[0] + '</text><text x="' + (x + 8) + '" y="' + (y + 35) + '" font-size="16" font-weight="700" fill="#fff">' + t[1] + '</text>';
    });
    b += '<text x="34" y="300" font-family="' + CARD_FONT + '" font-size="15" fill="#ffe14d">Badges</text>';
    var all = Array.isArray(c.badges) ? c.badges : [];
    b += '<text x="34" y="322" font-size="13" fill="#cfd6f5">' + (all.length ? all.slice(0, 6).map(function (x) { return esc(String(x).slice(0, 20)); }).join(' · ') : 'None yet') + '</text>';
    b += cardBar(34, 356, 292, 'Right answers', (c.accuracy | 0) + '%', (c.accuracy || 0) / 100, '#39ff88');
    b += '<rect x="34" y="398" width="292" height="58" rx="8" fill="#0d0b1c" stroke="#2a2450"/><text x="44" y="420" font-size="12" fill="#cfd6f5">Tier: ' + esc(c.tier || '') + '. Tier moves come later, with</text><text x="44" y="438" font-size="12" fill="#cfd6f5">online level tests (not in the game yet).</text>';
    b += '<rect x="34" y="466" width="292" height="30" rx="8" fill="#221e08" stroke="#ffe14d"/><text x="180" y="486" text-anchor="middle" font-size="11.5" fill="#ffe14d">Brainchips: no cash value. Training game.</text>';
    return { front: '<svg viewBox="0 0 360 520" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">' + f + '</svg>', back: '<svg viewBox="0 0 360 520" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">' + b + '</svg>' };
  }
  function myCard(conn) {
    clearTimers(); closeSock(); online = conn;
    h('<div class="head"><h2>My card</h2>' + MENU_BTN + '</div><p class="note">Loading your card…</p>' + ofoot()); wireFoot();
    api('/api/me').then(function (m) {
      online.card = m.card; online.chips = m.chips;
      var svg = cardSVGs(m.card || {}, m.chips), side = 'front';
      function draw() {
        h('<div class="head"><h2>My card</h2><span>' + MENU_BTN + '</span></div>' +
          '<div class="pcard" id="pcard">' + svg[side] + '</div>' +
          '<button class="btn" id="flip">↻ Show the ' + (side === 'front' ? 'back' : 'front') + '</button>' +
          '<p class="note">Your card shows only your Discord name and picture and your own game numbers.</p>' +
          '<p class="note">🎁 Gift tokens: <b>' + ((m.card && m.card.giftTokens) | 0) + '</b> of 3. Every 5 right answers earn one; sending a gift spends one.</p>' +
          (m.pc ? pcBlock(m.pc) : '<button class="btn" id="pcimport">📥 Import PC progress<small>One time: your learning progress from the PC trainer. Brainchips and party rating start fresh here.</small></button>') +
          '<button class="btn danger" id="forget">🗑 Delete my data<small>Your card, brainchips, ratings and numbers, from the server</small></button>' + ofoot());
        wireFoot();
        $('#flip').onclick = function () { side = side === 'front' ? 'back' : 'front'; draw(); };
        $('#forget').onclick = forgetMe;
        if ($('#pcimport')) $('#pcimport').onclick = function () { importSheet(function () { myCard(online); }); };
      }
      draw();
    }).catch(function (e) {
      h('<div class="head"><h2>My card</h2>' + MENU_BTN + '</div><p class="note">Could not load your card: ' + esc(e.message) + '</p>' + ofoot()); wireFoot();
    });
  }
  /* Import PC progress (learning only). The server checks every field
     and keeps it in its own block; this screen only shows numbers it sends back (each through |0) and escapes every text. */
  function pcNums(pc) {
    var n = function (x) { return ((+x || 0) | 0).toLocaleString(); };
    return [['XP', n(pc.xp)], ['Best clock score', n(pc.bestClock)], ['Review topics', n(pc.topics)], ['Level 1 test passed on', n(pc.testDays) + ' day' + ((pc.testDays | 0) === 1 ? '' : 's')],
      ['Right / wrong answers', n(pc.right) + ' / ' + n(pc.wrong)], ['Practice hands played', n(pc.handsPlayed)]];
  }
  function pcBlock(pc) {
    var when = +pc.at ? new Date(+pc.at).toLocaleDateString() : '';
    return '<div class="pcblock" id="pcblock"><h3>From your PC trainer</h3>' +
      pcNums(pc).map(function (r) { return '<div class="stat"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') +
      '<p class="note">Imported ' + esc(when) + ' (one time). Kept apart from your card: it never changes your brainchips, rating, tier, badges or the ladder.</p></div>';
  }
  function importSheet(onDone) {
    var o = document.createElement('div'); o.className = 'overlay';
    o.innerHTML = '<div class="modal" style="max-height:86vh;overflow:auto"><h2>Import PC progress</h2>' +
      '<p>On the PC trainer, press <b>Copy my progress code</b> on the home screen, then paste the code here.</p>' +
      '<p>It brings over your <b>learning progress only</b>: XP, review topics, level tests passed, best clock score, right and wrong answers, hands played. It shows on your card screen as "From your PC trainer". Brainchips and party rating start fresh here and do not change. You can import <b>one time</b>.</p>' +
      '<textarea id="pcpaste" rows="5" style="width:100%;font-size:12px;word-break:break-all" placeholder="MSP1-…" aria-label="Your progress code"></textarea>' +
      '<div id="pcres" class="note" aria-live="polite"></div>' +
      '<button class="btn big yellow" id="pcgo">Import</button><button class="btn" id="pcno">Cancel</button>' +
      OLABEL + '<p class="foot"><a href="privacy.html" class="opriv" id="pcpriv" target="_blank" rel="noopener">Privacy and fair play</a></p></div>';
    document.body.appendChild(o);
    var res = o.querySelector('#pcres'), go = o.querySelector('#pcgo'), no = o.querySelector('#pcno'), busy = false, done = false;
    o.querySelector('#pcpriv').onclick = function (e) { if (e && e.preventDefault) e.preventDefault(); showPrivacy(); };
    no.onclick = function () { o.remove(); if (done && onDone) onDone(); };
    go.onclick = function () {
      if (busy || done) return;
      var code = String(o.querySelector('#pcpaste').value || '').trim();
      if (!code) { res.innerHTML = '<b class="bad">Paste your code first.</b>'; return; }
      // no maxlength on the box (a browser would cut a long paste silently and send the cut code), so this check says it honestly
      if (code.length > 4000) { res.innerHTML = '<b class="bad">Not imported: code too long.</b> This code is longer than the game takes (4,000 characters), so nothing was sent. Please tell the game owner.'; return; }
      busy = true; res.innerHTML = 'Importing…';
      api('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code }) }).then(function (r) {
        busy = false; done = true;
        var pc = r && r.imported || r && r.pc || {};
        res.innerHTML = '<b class="good">Imported. This came over:</b>' + pcNums(pc).map(function (x) { return '<div class="stat"><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') +
          ((pc.dropped | 0) ? '<p class="note">' + esc((pc.dropped | 0) + ' review topic' + ((pc.dropped | 0) === 1 ? '' : 's') + ' the Discord game does not know were left out.') + '</p>' : '');
        go.style.display = 'none'; no.textContent = 'Done';
        if (r && r.card) { online.card = r.card; online.chips = r.chips; }
      }).catch(function (e) {
        busy = false; res.innerHTML = '<b class="bad">Not imported:</b> ' + esc(e.message);
        // "Already imported" (409, e.g. from another tab or device): the Import button goes at once, and Done redraws My card
        if (e.status === 409 || /already imported/i.test(e.message)) { done = true; go.style.display = 'none'; no.textContent = 'Done'; }
      });
    };
  }
  /* delete my data: asked twice, then the server deletes the card, chips, ratings and numbers, and you are signed out */
  function forgetMe() {
    confirmModal('Delete your data?', 'This deletes your trading card, brainchips, ratings, badges, game numbers and any imported PC progress from the server.', 'Yes, delete', function () {
      confirmModal('Are you sure?', 'This cannot be undone. Everything on your card is gone for good.', 'Delete everything', function () {
        api('/api/forget', { method: 'POST' }).then(function () {
          closeSock(); clearTimers(); online = null;
          h('<div class="head"><h2>Your data is deleted</h2></div>' +
            '<p class="note">Your card, brainchips, ratings, badges, numbers and imported PC progress are gone from the server, and you are signed out. ' +
            'A talk line someone reported stays for up to 30 days for safety review, then it is deleted too.</p>' +
            '<p class="note">To play again, close this Activity and start it again: you get a fresh card.</p>' +
            '<button class="btn" id="off">Play the offline trainer</button>' + ofoot());
          wireFoot(); $('#off').onclick = home;
        }).catch(function (e) {
          if (/stand up/i.test(e.message)) showModal('Not deleted yet', 'You still have brainchips at a Hold’em table. Stand up from your tables first (or close the table), then press Delete again.');
          else showModal('Not deleted', esc(e.message));
        });
      });
    });
  }
  /* start: inside Discord sign in and show the online menu; on localhost with ?devtable=<name> use the local test login (local only) */
  function boot() {
    // practice-table chips left by a closed tab or a reload go back to the bank, but only when no open tab is at the table:
    // its lock is older than 2 minutes, or no tab answers on the table channel (a reload: the old page is gone)
    if (S.atTable > 0) {
      var refund = function () { S.chips = (S.chips || 0) + S.atTable; S.atTable = 0; S.tableLock = null; save(); };
      if (!tableLockFresh(S.tableLock)) refund();
      else if (chan) { askTable(function (busy) { if (!busy) refund(); bootScreens(); }); return; }
    }
    bootScreens();
  }
  function bootScreens() {
    var qs = new URLSearchParams(location.search);
    if (window.DiscordPlay && window.DiscordPlay.inDiscord()) {
      h('<div class="head"><h2>Signing in with Discord…</h2></div>');
      window.DiscordPlay.start().then(function (c) { onlineMenu(c); }).catch(function (e) { h('<div class="head"><h2>Could not sign in</h2></div><p class="note">' + esc(e.message) + '</p><button class="btn" id="off">Play offline</button>'); $('#off').onclick = home; });
      return;
    }
    if (qs.get('devtable') && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
      fetch('/api/devlogin?user=' + encodeURIComponent(qs.get('devtable'))).then(function (r) { return r.json(); }).then(function (c) {
        onlineMenu({ session: c.session, card: c.card, chips: c.chips, instanceId: 'local-test', base: '', myId: 'dev-' + qs.get('devtable').replace(/[^a-z0-9]/gi, '').slice(0, 20) });
      });
      return;
    }
    home();
  }

  // ---------- hold'em table (practice): you vs computer players, played as the game is meant to be played ----------
  // Brainchips: earned by learning; no value, never bought or cashed.
  var TABLE = { sb: 5, bb: 10, buyIn: 1000 };
  /* two tabs: the tab at the practice table stamps a table lock (its tab id + time) every 20 s. Another tab,
     or a reload, gives the table chips back only when the lock is older than 2 minutes, and nobody sits in a second tab. */
  var TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36), LOCK_MS = 120000, tableBeat = null, chan = null;
  try { chan = new BroadcastChannel('mudschool-poker-table'); chan.onmessage = function (e) { if (e.data === 'who' && S.atTable > 0 && tableBeat) chan.postMessage('me'); }; } catch (e) { chan = null; }
  /* asks the other open tabs of this game whether one of them sits at the practice table (no channel: trust the lock) */
  function askTable(cb) {
    if (!chan) return cb(true);
    var heard = false, ear = new BroadcastChannel('mudschool-poker-table');
    ear.onmessage = function (e) { if (e.data === 'me') heard = true; };
    ear.postMessage('who');
    setTimeout(function () { try { ear.close(); } catch (e) { /* closed */ } cb(heard); }, 400);
  }
  function tableLockFresh(l) { return !!(l && typeof l.seen === 'number' && Date.now() - l.seen < LOCK_MS); }
  function storedSave() { try { var raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function stampTable() { S.tableLock = { id: TAB_ID, seen: Date.now() }; }
  function startBeat() { stopBeat(); tableBeat = setInterval(function () { if (S.atTable > 0) { stampTable(); save(); } else stopBeat(); }, 20000); }
  function stopBeat() { if (tableBeat) { clearInterval(tableBeat); tableBeat = null; } }
  function holdemTable() {
    clearTimers();
    var Hm = window.Holdem, Bot = window.HoldemBot;
    if (!Hm || !Bot) return home();
    var other = storedSave();
    if (other && other.atTable > 0 && tableLockFresh(other.tableLock) && other.tableLock.id !== TAB_ID && !holdemTable.asked) {
      askTable(function (busy) {
        if (busy) showModal('At the table in another tab', 'You are already at the practice table in another tab or window. Leave that table first, or close it and wait 2 minutes.');
        else { holdemTable.asked = true; try { holdemTable(); } finally { holdemTable.asked = false; } }
      });
      return;
    }
    if ((S.chips || 0) < TABLE.buyIn) {
      showModal('Earn brainchips', 'A seat costs ' + TABLE.buyIn + ' brainchips. You have ' + (S.chips || 0) + '. Earn them with drills, the daily run, the clock and level tests. They have no value; they are a learning tool.');
      return;
    }
    S.chips -= TABLE.buyIn; S.atTable = TABLE.buyIn; stampTable(); save(); startBeat();
    var seatsN = 6, styles = ['rock', 'station', 'maniac', 'shark', 'rock'], names = ['Rocky', 'Stacy', 'Max', 'Sharkie', 'Stone'];
    var players = [{ id: 'me', name: 'You', stack: TABLE.buyIn, me: true }];
    for (var b = 0; b < 5; b++) players.push({ id: 'b' + b, name: names[b], stack: TABLE.buyIn, style: styles[b] });
    var button = Math.floor(rand() * seatsN), handNo = 0, hand = null, order = [], deck = [], shown = false, coachLog = [], lastMsg = '';
    var coachOn = S.coach !== false;
    var fxBets = {}, boardShown = 0, dealNext = false; // what the last picture showed: new bets slide in, only new board cards are dealt
    var track = Bot.newTracker(), botRand = E.rng(Hm.secureInt(4294967296)), botWhy = [];
    function seatOf(handIdx) { return order[handIdx]; }
    function idxOf(seat) { return order.indexOf(seat); }
    function stackOf(seat) { var i = idxOf(seat); return hand && i >= 0 ? hand.p[i].stack : players[seat].stack; }
    function startHand() {
      clearTimers();
      // replace any computer player who ran out (a new one sits down)
      players.forEach(function (p, i) { if (!p.me && p.stack <= 0) { p.stack = TABLE.buyIn; p.name = p.name.replace(/ \d+$/, '') + ' ' + (handNo % 9 + 2); } });
      if (players[0].stack <= 0) return leave(true);
      handNo++;
      do { button = (button + 1) % seatsN; } while (players[button].stack <= 0);
      var live = []; for (var k = 1; k <= seatsN; k++) { var s = (button + k) % seatsN; if (players[s].stack > 0) live.push(s); }
      // PHH order: small blind first, button last; heads-up: button is the small blind and comes first
      order = live.length === 2 ? [button, live[0] === button ? live[1] : live[0]] : live;
      deck = Hm.secureDeck();
      var holes = order.map(function (s, i) { return [deck[2 * i], deck[2 * i + 1]]; });
      var blinds = order.map(function (s, i) { return i === 0 ? TABLE.sb : i === 1 ? TABLE.bb : 0; });
      hand = new Hm.Hand({ stacks: order.map(function (s) { return players[s].stack; }), blinds: blinds, minBet: TABLE.bb, holes: holes });
      var mi0 = idxOf(0); if (mi0 >= 0) { S.atTable = hand.p[mi0].stack; save(); } // a reload cannot refund a posted blind
      deck = deck.slice(2 * order.length); shown = false; coachLog = []; botWhy = []; fxBets = {}; boardShown = 0; lastMsg = 'Hand ' + handNo + '. Blinds ' + TABLE.sb + '/' + TABLE.bb + '.';
      SND.card(0); SND.card(1);
      dealNext = true; step(); // step draws the first picture of the hand (the cards fly in) before anyone acts
    }
    function step() {
      if (!hand) return;
      if (hand.done) return endHand();
      var need = hand.needBoard();
      if (need) { if (fxOn()) draw(); /* the bets sweep into the pot while the board waits */ later(function () { hand.dealBoard(deck.splice(0, need)); SND.card(0); draw(); step(); }, 600); return; }
      var L = hand.legal(), seat = seatOf(L.seat), p = players[seat];
      draw();
      if (p.me) return; // wait for the buttons
      var d;
      try { d = Bot.decide(hand, L.seat, p.style, botRand, track); }
      catch (e) { // a computer player that cannot decide checks if it can, else folds; the table goes on
        d = [L.check ? 'cc' : 'f']; d.why = L.check ? 'checks' : 'folds'; d.think = 400;
        try { console.error('[bot]', e); } catch (x) { /* no console */ }
      }
      later(function () { botWhy.push(p.name + ': ' + d.why); doAct(L.seat, d[0], d[1]); }, d.think);
    }
    function doAct(i, type, to) {
      var seat = seatOf(i), p = players[seat], L = hand.legal(), pot = potNow(), noBetYet = hand.currentBet === 0;
      if (p.me && coachOn) coachLog.push(coachLine(i, type, to, L, pot));
      track.note(hand, i, type, to);
      try { hand.act(i, type, to); } catch (e) { type = L.check ? 'cc' : 'f'; hand.act(i, type); }
      if (p.me) { S.atTable = hand.p[i].stack; save(); }
      var allIn = hand.p[i].allIn ? ' (all-in)' : '';
      lastMsg = p.name + ' ' + (type === 'f' ? 'folds' : type === 'cc' ? (L.toCall ? 'calls ' + L.toCall : 'checks') : (noBetYet ? 'bets ' : 'raises to ') + to) + allIn + '.';
      if (type === 'cbr' || (type === 'cc' && L.toCall)) SND.chip(); else if (type === 'f') SND.card(0);
      step();
    }
    function potNow() { return hand.p.reduce(function (a, q) { return a + q.total; }, 0); }
    // after the hand only: what the price was and what your share was, from what you could see (your cards, the board, how many were in)
    function coachLine(i, type, to, L, pot) {
      var q = hand.p[i], opp = hand.p.filter(function (o, k) { return k !== i && !o.folded; }).length;
      var eq = Bot.equity(q.hole, hand.board.slice(), Math.max(1, opp), 600, rand);
      var price = L.toCall > 0 ? L.toCall / (pot + L.toCall) : 0, street = ['Before the flop', 'Flop', 'Turn', 'River'][hand.street];
      var what = type === 'f' ? 'folded' : type === 'cc' ? (L.toCall ? 'called ' + L.toCall : 'checked') : 'raised to ' + to;
      var note = L.toCall > 0 ? (eq >= price ? (type === 'f' ? 'your share beat the price: a call was there' : 'your share beat the price') : (type === 'f' ? 'good fold: the price was higher than your share' : 'the price was higher than your share')) : 'free to see more';
      return street + ': you ' + what + '. Share vs ' + opp + ' player' + (opp > 1 ? 's' : '') + ' about ' + Math.round(eq * 100) + '%' + (L.toCall ? ', price ' + Math.round(price * 100) + '%' : '') + ' → ' + note + '.';
    }
    function endHand() {
      shown = hand.live() > 1;
      var won = [];
      hand.payouts.forEach(function (amt, i) { if (amt > 0) won.push(players[seatOf(i)].name + (seatOf(i) === 0 ? ' win ' : ' wins ') + amt + (shown && hand.scores[i] >= 0 ? ' with ' + E.CATS[hand.scores[i] >> 20] : '')); });
      lastMsg = won.join('. ') + '.';
      order.forEach(function (s, i) { players[s].stack = hand.p[i].stack; });
      S.atTable = players[0].stack; save();
      var meIdx = idxOf(0);
      if (meIdx >= 0 && hand.payouts[meIdx] > 0) SND.win(); else SND.chip();
      S.handsPlayed = (S.handsPlayed || 0) + 1; save();
      draw(false, true);
      // you won: a gold burst at your seat; a big pot (30 big blinds or more) also gives a gentle shake
      var myWin = meIdx >= 0 ? hand.payouts[meIdx] : 0, potAll = hand.payouts.reduce(function (a, b) { return a + b; }, 0);
      if (myWin > 0 && fxOn()) later(function () { // when the chips reach your seat
        fx('burst', tablePt(POS[0][0], POS[0][1]), { kind: 'gold', n: potAll >= 30 * TABLE.bb ? 22 : 12, spread: 70 }); if (potAll >= 30 * TABLE.bb) fx('shake');
      }, 900);
      // crowd sounds, once per hand, only for pots of 30 big blinds or more (never both): a rimshot a beat after you win it, a low "ooh" when you lose it at a showdown
      if (potAll >= 30 * TABLE.bb) {
        if (myWin > 0) later(function () { SND.rimshot(); }, 1500);
        else if (shown && meIdx >= 0 && !hand.p[meIdx].folded) later(function () { SND.ooh(); }, 1200);
      }
      var c = $('#coach');
      if (c) c.innerHTML = (coachOn && coachLog.length ? '<b>Coach (after the hand):</b><br>' + coachLog.join('<br>') : '') + (coachOn && botWhy.length ? '<br><b>How the table played:</b><br>' + botWhy.map(esc).join('<br>') : '') +
        '<div class="row2" style="margin-top:8px"><button class="btn yellow" id="nexthand">Next hand ▶</button><button class="btn" id="leave">Leave table</button></div>';
      $('#nexthand').onclick = startHand; $('#leave').onclick = function () { leave(false); };
      keyHandler = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startHand(); } };
    }
    function leave(busted) {
      clearTimers();
      var mi = idxOf(0); if (hand && !hand.done && mi >= 0) players[0].stack = hand.p[mi].stack; // chips in the pot stay in the pot
      var back = Math.max(0, players[0].stack); S.chips = (S.chips || 0) + back; S.atTable = 0; S.tableLock = null; stopBeat(); save();
      h('<div class="head"><h2>' + (busted ? 'Out of brainchips' : 'Left the table') + '</h2></div>' +
        '<div class="big-num">' + back + '</div><div class="center">brainchips back to your bank (now ' + S.chips + ')</div>' +
        '<div class="stat"><span>Hands played</span><b>' + handNo + '</b></div>' +
        '<p class="note">Brainchips have no value. Earn more with drills, the daily run and level tests.</p>' +
        '<button class="btn big yellow" id="home">Home</button>');
      $('#home').onclick = home;
    }
    // ---- drawing: neon plush oval, 6 seats ----
    var POS = [[160, 300], [28, 230], [28, 100], [160, 30], [292, 100], [292, 230]]; // you at the bottom
    /* dealing: the hand's first picture (hole cards fly in); finale: the hand's result picture from endHand (cards turn over, the pot slides to the winners) */
    function draw(dealing, finale) {
      if (dealNext) { dealing = true; dealNext = false; }
      var W = 320, Hh = 340, s = '';
      s += '<defs><radialGradient id="felt" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#241656"/><stop offset="1" stop-color="#0c0820"/></radialGradient></defs>';
      s += '<rect x="20" y="40" width="280" height="250" rx="125" fill="#1a0f33" stroke="#9d6bff" stroke-width="10" stroke-opacity=".35"/>';
      s += '<rect x="20" y="40" width="280" height="250" rx="125" fill="none" stroke="#ff2bd6" stroke-width="2" style="filter:drop-shadow(0 0 6px #ff2bd6)"/>';
      s += '<rect x="34" y="54" width="252" height="222" rx="111" fill="url(#felt)" stroke="#19f0ff" stroke-width="1.5" stroke-opacity=".7"/>';
      s += '<text x="160" y="122" text-anchor="middle" font-size="9" letter-spacing="1.5" font-weight="700" fill="#19f0ff" fill-opacity=".3" style="pointer-events:none">mudmodecrew.com</text>'; // the makers' name printed on the felt: not a link, nothing tracked
      // board + pot
      var bx = 160 - (5 * 38 + 4 * 4) / 2;
      for (var k = 0; k < 5; k++) {
        if (hand && hand.board[k] !== undefined) s += cardSVG(E.name(hand.board[k]), bx + k * 42, 132, 38, 54, { deal: k >= boardShown, delay: Math.max(0, k - boardShown) * 0.08 });
        else s += '<rect x="' + (bx + k * 42) + '" y="132" width="38" height="54" rx="5" fill="none" stroke="#ffffff22" stroke-dasharray="4 3"/>';
      }
      boardShown = hand ? hand.board.length : 0; // a redraw on the same street does not deal the board again
      var fxNow = fxOn(), firstDone = !!(finale && hand && hand.done), newBets = {};
      var pot = hand ? potNow() - hand.p.reduce(function (a, q) { return a + q.bet; }, 0) : 0;
      s += '<text x="160" y="208" text-anchor="middle" font-size="15" font-weight="800" fill="#ffe14d" font-family="Comic Sans MS,system-ui">Pot ' + (hand ? potNow() : 0) + '</text>';
      var L = hand && !hand.done ? hand.legal() : null;
      players.forEach(function (p, seat) {
        var xy = POS[seat], i = idxOf(seat), q = i >= 0 && hand ? hand.p[i] : null, active = L && seatOf(L.seat) === seat;
        var col = p.me ? '#19f0ff' : ['#ffe14d', '#39ff88', '#ff2bd6', '#9d6bff', '#ff9a3c'][seat - 1];
        var dim = !q || q.folded;
        s += '<g opacity="' + (dim ? 0.45 : 1) + '">';
        s += '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="20" fill="#0d0b1c" stroke="' + col + '" stroke-width="' + (active ? 4 : 2) + '"' + (active ? ' style="filter:drop-shadow(0 0 8px ' + col + ')"' : '') + '/>';
        s += '<text x="' + xy[0] + '" y="' + (xy[1] + 7) + '" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" font-family="Comic Sans MS,system-ui">' + p.name[0] + '</text>';
        s += '<text x="' + xy[0] + '" y="' + (xy[1] + 34) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#eef3ff">' + p.name + '</text>';
        s += '<text x="' + xy[0] + '" y="' + (xy[1] + 47) + '" text-anchor="middle" font-size="11" fill="' + col + '">' + (q ? q.stack : p.stack) + (q && q.allIn ? ' ALL-IN' : '') + '</text>';
        if (seat === button) s += '<circle cx="' + (xy[0] + 22) + '" cy="' + (xy[1] - 16) + '" r="8" fill="#fff"/><text x="' + (xy[0] + 22) + '" y="' + (xy[1] - 12) + '" text-anchor="middle" font-size="10" font-weight="800" fill="#14121f">D</text>';
        var f = seat === 3 ? 0.66 : 0.38, cx = xy[0] + (160 - xy[0]) * f, cy = xy[1] + (165 - xy[1]) * f;
        newBets[seat] = q ? q.bet : 0;
        if (q && q.bet > 0) {
          var chip = '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="#c62828" stroke="#fff" stroke-dasharray="3 2"/><text x="' + cx + '" y="' + (cy - 10) + '" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">' + q.bet + '</text>';
          s += fxNow && q.bet > (fxBets[seat] || 0) ? chipSlide('fx-slide', xy[0] - cx, xy[1] - cy, chip) : chip; // a new bet slides out from the seat
        } else if (fxNow && (fxBets[seat] || 0) > 0) s += chipSlide('fx-sweep', cx - 160, cy - 200, potChip(160, 200)); // the street is over: bets sweep into the pot
        // cards: your own face up; others face down until a showdown
        if (q && !q.folded && !p.me) {
          var cy0 = seat === 3 ? xy[1] + 52 : xy[1] - 64; // the top seat shows its cards below the name
          if (shown && hand.done) { s += cardSVG(E.name(q.hole[0]), xy[0] - 26, cy0, 24, 34, { flip: firstDone }) + cardSVG(E.name(q.hole[1]), xy[0] + 2, cy0, 24, 34, { flip: firstDone, delay: 0.08 }); }
          else {
            var backs = '<rect x="' + (xy[0] - 20) + '" y="' + (cy0 + 6) + '" width="18" height="26" rx="3" fill="#8e1b5b" stroke="#ff2bd6"/><rect x="' + (xy[0] - 4) + '" y="' + (cy0 + 6) + '" width="18" height="26" rx="3" fill="#8e1b5b" stroke="#ff2bd6"/>';
            s += dealing ? '<g class="dealb" style="animation-delay:' + (((seat + seatsN - button) % seatsN) * 0.06).toFixed(2) + 's">' + backs + '</g>' : backs;
          }
        }
        s += '</g>';
      });
      fxBets = newBets;
      // the hand is over: the pot slides to each winner, "+chips" rises over the seat
      if (fxNow && firstDone) hand.payouts.forEach(function (amt, i) {
        if (!(amt > 0)) return;
        var xy = POS[seatOf(i)];
        s += chipSlide('fx-win', 160 - xy[0], 200 - xy[1], potChip(xy[0], xy[1] - 4) + potChip(xy[0] + 5, xy[1] - 9));
        s += '<text class="fx-rise" x="' + xy[0] + '" y="' + (xy[1] - 26) + '" text-anchor="middle" font-size="16" font-weight="800" fill="#ffe14d" stroke="#0d0b1c" stroke-width="3" paint-order="stroke" font-family="Comic Sans MS,system-ui">+' + amt + '</text>';
      });
      var mi = idxOf(0), mine = mi >= 0 && hand ? hand.p[mi] : null;
      var meCards = mine ? cardSVG(E.name(mine.hole[0]), 0, 0, 62, 86, { deal: dealing }) + cardSVG(E.name(mine.hole[1]), 68, 0, 62, 86, { deal: dealing, delay: 0.1 }) : '';
      var acts = '';
      if (L && seatOf(L.seat) === 0 && !hand.done) {
        var potAfter = potNow() + L.toCall, step5 = function (x) { return Math.round(x / TABLE.sb) * TABLE.sb; };
        var half = step5(hand.currentBet + potAfter / 2), full = step5(hand.currentBet + potAfter);
        acts = '<div class="ans">' + (L.fold ? '<button data-a="f">Fold</button>' : '') + '<button data-a="cc">' + (L.check ? 'Check' : 'Call ' + L.toCall) + '</button>' +
          (L.raise ? '<button data-a="min">' + (hand.currentBet ? 'Raise ' : 'Bet ') + L.minTo + '</button>' : '') + '</div>' +
          (L.raise ? '<div class="ans" style="margin-top:8px">' + [['½ pot', half], ['Pot', full], ['All-in', L.maxTo]].filter(function (o) { return o[1] > L.minTo && o[1] <= L.maxTo; })
            .map(function (o) { return '<button data-a="to" data-to="' + o[1] + '">' + o[0] + ' (' + o[1] + ')</button>'; }).join('') + '</div>' : '');
      }
      h('<div class="head"><h2>Hold’em ' + TABLE.sb + '/' + TABLE.bb + '</h2><span>' + muteBtn() + ' <button class="iconbtn" id="x" aria-label="Leave">✕</button></span></div>' +
        '<div class="lounge" style="padding:6px"><svg viewBox="0 0 ' + W + ' ' + Hh + '" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto;overflow:visible">' + s + '</svg></div>' +
        '<div class="center" style="min-height:22px;color:#c3c9e6">' + lastMsg + '</div>' +
        '<div class="center" style="margin:6px 0"><svg viewBox="0 0 130 86" width="150" style="overflow:visible">' + meCards + '</svg></div>' + acts +
        '<div id="coach" class="note" style="' + (hand && hand.done ? '' : 'display:none') + '"></div>' +
        '<p class="foot">Brainchips only. Coach notes come after the hand, never during. <label><input type="checkbox" id="coachon"' + (coachOn ? ' checked' : '') + '> coach</label></p>');
      wireMute();
      $('#x').onclick = function () { leave(false); };
      $('#coachon').onchange = function () { coachOn = this.checked; S.coach = coachOn; save(); };
      app.querySelectorAll('.ans button').forEach(function (btn) {
        btn.onclick = function () {
          var Lx = hand.legal(); if (!Lx || seatOf(Lx.seat) !== 0) return;
          var a = btn.dataset.a;
          if (a === 'f') doAct(Lx.seat, 'f'); else if (a === 'cc') doAct(Lx.seat, 'cc');
          else if (a === 'min') doAct(Lx.seat, 'cbr', Lx.minTo); else doAct(Lx.seat, 'cbr', +btn.dataset.to);
        };
      });
      if (hand && hand.done) { /* endHand fills #coach */ }
    }
    startHand();
  }

  /* the missed questions again, each with its right answer and "why" picture (curriculum: show the missed pictures) */
  function missedList(missed) {
    if (!missed || !missed.length) return '';
    return '<h2 class="font-fun" style="color:#ff2bd6;margin:18px 0 6px">Your misses</h2>' + missed.map(function (q) {
      var rows = picRows(q.pic);
      return '<div class="why show"><div><b>' + q.q + '</b></div>' + (rows.length ? tablePic(rows) : '') +
        '<div class="verdict ok" style="font-size:17px">Answer: ' + q.c[q.a] + '</div><div>' + (q.why || '') + '</div>' + whyPic(q) + '</div>';
    }).join('');
  }

  // test hook for automated checks (no effect on play)
  window.__trainer = { state: function () { return S; }, reset: function () { S = fresh(); S.seen = true; save(); }, home: home, clock: function () { clock(home); }, drills: drillsMenu, daily: dailyRun, test: levelTest, party: partyTable, holdem: holdemTable };
  boot();
})();
