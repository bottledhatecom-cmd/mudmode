/* Animated explainers: pictures first, a few words. Static example scenes only.
   No network, no storage, no tracking, no inline styles or handlers (works under the page's CSP).
   Each explainer plays when its panel is open and on screen, loops, and shows one still end frame with reduced motion. */
(function () {
  'use strict';
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var NS = 'http://www.w3.org/2000/svg';

  /* ---------- tiny picture vocabulary (inline SVG symbols, drawn once) ---------- */
  var ICONS = {
    check: '<circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-7"/>',
    cross: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7M14 8.5v7"/>',
    note: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    book: '<path d="M4 4h7a2 2 0 0 1 1 .3A2 2 0 0 1 13 4h7v15h-7a2 2 0 0 0-1 .3 2 2 0 0 0-1-.3H4z"/><path d="M12 4.3V19.3"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    hand: '<path d="M6 3l13 7-5.5 1.8L11 18z"/>',
    pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
    bubble: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
    lines: '<path d="M4 7h16M4 12h10M4 17h6"/>',
    plan: '<path d="M9 4h6v3H9z"/><path d="M7 5.5H5V21h14V5.5h-2M9 12h6M9 16h4"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>',
    job: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    switchi: '<rect x="3" y="7" width="18" height="10" rx="5"/><circle cx="16" cy="12" r="3"/>'
  };
  function sprite() {
    if (document.getElementById('xi-sprite')) return;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ex-sprite'); svg.setAttribute('id', 'xi-sprite');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    var out = '';
    for (var k in ICONS) if (Object.prototype.hasOwnProperty.call(ICONS, k)) out += '<symbol id="xi-' + k + '" viewBox="0 0 24 24">' + ICONS[k] + '</symbol>';
    svg.innerHTML = out; /* fixed literal above, no user data */
    document.body.appendChild(svg);
  }
  function ic(n, c) { return '<svg class="xi ' + (c || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#xi-' + n + '"/></svg>'; }
  function bub(kind, who, text, cls) { return '<div class="xb ' + kind + ' a ' + (cls || '') + '"><b class="xw">' + who + '</b>' + text + '</div>'; }
  function win(title, inner, cls) { return '<div class="xwin ' + (cls || '') + '"><div class="xtb"><span class="xdots"><i></i><i></i><i></i></span><b>' + title + '</b></div><div class="xbody">' + inner + '</div></div>'; }
  function sc(label, inner, cls) { return '<div class="ex-sc ' + (cls || '') + '"><span class="ex-step">' + label + '</span><div class="ex-in">' + inner + '</div></div>'; }
  function tile(icon, label, sub) { return '<div class="xtile a pop">' + ic(icon) + '<span>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span></div>'; }
  function tileD(icon, label, sub, d) { return tile(icon, label, sub).replace('a pop', 'a pop ' + d); }

  /* ---------- the three explainers: scenes + how long each is shown (ms) ---------- */
  var DEFS = {
    what: {
      ms: [2600, 2100, 1900, 1800, 2600, 1500],
      scenes: [
        sc('Asks first',
          bub('ai', 'AI', 'Send this email?', 'pop d1') +
          bub('you', 'You', 'Yes, send that one.', 'pop d3') +
          '<div class="xchip ok a pop d4">' + ic('check') + 'One yes = one thing</div>' +
          bub('ai', 'AI', 'Next: delete the old files. OK?', 'pop d7') +
          '<div class="xchip ask a pop d9">' + ic('pause') + 'Asks again</div>'),
        sc('Honest',
          '<ul class="xrows">' +
          '<li class="a pop d1">' + ic('check', 'ok') + '<span class="t">Checked the draft</span><span class="xtag pass">Done</span></li>' +
          '<li class="a pop d2">' + ic('check', 'ok') + '<span class="t">Fixed two typos</span><span class="xtag pass">Done</span></li>' +
          '<li class="no a pop d4">' + ic('warn', 'warn') + '<span class="t">Couldn’t save a file here</span><span class="xtag warn">Not done</span></li>' +
          '</ul>' + bub('ai', 'AI', 'Here’s the text to copy instead.', 'pop d6')),
        sc('Short',
          '<div class="xshort"><div class="xlong" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
          bub('ai', 'AI', 'Done. Next: your OK.', 'pop d4') + '</div>' +
          '<div class="xchip ok a pop d6">' + ic('check') + 'Short and on task</div>'),
        sc('Four words',
          '<div class="xwords">' +
          '<div class="xw4 a pop d1"><code>handoff</code><span>a note for your next chat</span></div>' +
          '<div class="xw4 a pop d2"><code>mudmode</code><span>says it’s on</span></div>' +
          '<div class="xw4 a pop d3"><code>mudmode status</code><span>how it’s going</span></div>' +
          '<div class="xw4 a pop d4"><code>mudhelp</code><span>the words you can say</span></div></div>'),
        sc('Handoff',
          '<div class="xflow">' +
          win('Chat 1', bub('you', 'You', 'handoff', 'pop d1') + '<div class="xnote a pop d3">' + ic('note') + 'Handoff note</div>') +
          '<div class="xpath"><div class="xcarry a">' + ic('hand') + '<span class="xnote">' + ic('note') + '</span></div></div>' +
          win('New chat', '<div class="xb you a pop d9"><b class="xw">You</b>pastes the note</div>') +
          '</div><p class="xlbl a fd d5">You carry it. You paste it into the next chat.</p>'),
        sc('Recap',
          '<div class="xtiles">' + tile('pause', 'Asks first') + tile('check', 'Honest') + tile('lines', 'Short') + tile('bubble', 'Four words') + tile('note', 'Handoff note') + '</div>' +
          '<p class="xfoot">Rules your AI is asked to follow, not locks.</p>')
      ]
    },
    mudgo: {
      ms: [2500, 3000, 3500, 1600],
      scenes: [
        sc('mudgo',
          '<div class="xseg a fd d1"><span class="hl"></span><b>auto</b><b>on</b><b>off</b></div>' +
          '<div class="xsegcap"><span class="a fd d2">on when needed</span><span class="a fd d4">stays on</span><span class="a fd d6">stays off</span></div>' +
          '<div class="xchip ok xsegchip a pop d8">' + ic('shield') + 'Safety rules stay on either way</div>'),
        sc('Review',
          '<div class="xrev"><div class="xcard a pop d1">' + ic('job', 'ok') + '<span>Finished job</span></div>' +
          '<span class="xarr a fd d2">' + ic('arrow') + '</span>' +
          '<div class="xcard rv a pop d3">' + ic('eye') + '<span>Reviewer<small>reads only</small></span></div></div>' +
          '<ul class="xverd">' +
          '<li class="a pop d4"><span class="xtag pass">PASS</span>looks good</li>' +
          '<li class="a pop d6"><span class="xtag warn">WARN</span>a pass, every note listed</li>' +
          '<li class="a pop d8"><span class="xtag fail">FAIL</span>stops until you decide</li></ul>'),
        sc('One task, three AIs',
          '<div class="x3">' +
          '<div class="xag p1 a pop d1"><small>AI 1</small>' + ic('plan') + 'Plan</div>' +
          '<div class="xag p2 r2 a pop d2"><small>AI 2</small>' + ic('code') + 'Build</div>' +
          '<div class="xag p3 r3 a pop d3"><small>AI 3</small>' + ic('eye') + 'Review<div class="xtag pass a pop d11">PASS</div></div></div>' +
          '<div class="xlane"><div class="xcarry3 a">' + ic('hand') + '<span class="xnote">' + ic('note') + '</span></div><div class="xlab a fd d4">you carry the note between chat apps</div></div>' +
          '<div class="xchip ask a pop d12">' + ic('pause') + 'Asks you before going live</div>'),
        sc('Recap',
          '<div class="xtiles">' + tile('switchi', 'auto, on or off') + tile('eye', 'Read-only review', 'PASS, WARN or FAIL') + tile('plan', 'Plan, build, review', 'you carry the note') + '</div>' +
          '<p class="xfoot">Rules your AI is asked to follow, not locks.</p>')
      ]
    },
    lessons: {
      ms: [2100, 2600, 3200, 2600, 1800],
      scenes: [
        sc('Chat ends',
          win('Example chat', bub('ai', 'AI', 'The page is fixed.', 'pop d1') + bub('you', 'You', 'handoff', 'pop d3'), 'dim') +
          '<div class="xend a pop d6">' + ic('pause') + 'Chat ended</div>'),
        sc('Handoff',
          bub('ai', 'AI', 'Adding a lesson to your book.', 'pop d1') +
          '<div class="xbook a pop d2"><h5>' + ic('book') + 'Lessons book</h5><ul>' +
          '<li class="old">' + ic('note') + '<span class="t">Keep answers short.</span></li>' +
          '<li class="new">' + ic('pencil', 'mud') + '<span class="t"><span class="xtxt d4">Check a phone screen first.</span></span><span class="xtag pass a pop d8">added</span></li></ul></div>'),
        sc('Next chat',
          '<div class="xnote xfly">' + ic('book') + 'Lessons book</div>' +
          win('New chat', bub('ai', 'AI', 'I read your lessons book first: check a phone screen first.', 'pop d5')) +
          '<div class="xchip ok a pop d8">' + ic('check') + 'Starts already knowing it. In a chat app, you paste it in.</div>'),
        sc('Change or retire',
          '<div class="xbook"><h5>' + ic('book') + 'Lessons book</h5><ul>' +
          '<li><span class="t xswap"><span class="o">Check a phone screen first.</span><span class="n">Check phone and laptop screens.</span></span></li>' +
          '<li class="xstrike"><span class="t"><span>Keep answers short.</span></span><span class="xtag warn">retired</span></li></ul></div>' +
          bub('you', 'You', 'Change line 1: phones and laptops.', 'pop d2') +
          bub('you', 'You', 'Retire line 2.', 'pop d5')),
        sc('Recap',
          '<div class="xsteps">' + tile('bubble', 'Chat ends') + '<span class="xarr">' + ic('arrow', 'mud') + '</span>' + tile('book', 'AI adds a lesson') + '<span class="xarr">' + ic('arrow', 'mud') + '</span>' + tile('check', 'Next chat reads it', 'in a chat app, you paste it in') + '<span class="xarr">' + ic('arrow', 'mud') + '</span>' + tile('pencil', 'Change or retire') + '</div>' +
          '<p class="xfoot">Rules your AI is asked to follow, not locks.</p>')
      ]
    }
  };

  /* ---------- player ---------- */
  function Player(fig) {
    var key = fig.getAttribute('data-ex'), def = DEFS[key];
    if (!def) return;
    var stage = fig.querySelector('.ex-stage'), top = fig.querySelector('.ex-top'), pp = fig.querySelector('.ex-pp');
    var det = fig.closest('details');
    stage.innerHTML = def.scenes.join(''); /* fixed literals above, no user data */
    var scenes = stage.querySelectorAll('.ex-sc'), n = scenes.length;
    var dots = document.createElement('div'); dots.className = 'ex-dots'; dots.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < n; i++) dots.appendChild(document.createElement('i'));
    stage.appendChild(dots);
    if (top) top.hidden = false;
    var idx = -1, timer = 0, startedAt = 0, elapsed = 0, onscreen = false, userPaused = false, outTimer = 0;
    function reduced() { return !!(mq && mq.matches); }
    function open() { return !det || det.open; }
    function state(s) { fig.setAttribute('data-state', s); }
    function show(k) {
      var prev = idx >= 0 ? scenes[idx] : null;
      Array.prototype.forEach.call(scenes, function (s) { if (s !== scenes[k] && s !== prev) { s.classList.remove('on'); s.classList.remove('run'); } });
      if (prev && prev !== scenes[k]) { prev.classList.remove('on'); clearTimeout(outTimer); outTimer = setTimeout(function () { prev.classList.remove('run'); }, 350); }
      scenes[k].classList.remove('run'); void scenes[k].offsetWidth;
      scenes[k].classList.add('on'); scenes[k].classList.add('run');
      Array.prototype.forEach.call(dots.children, function (d, j) { d.classList.toggle('on', j === k); });
      idx = k; elapsed = 0; fig.setAttribute('data-scene', String(k));
    }
    function clear() { clearTimeout(timer); timer = 0; }
    function schedule() {
      clear();
      startedAt = Date.now();
      timer = setTimeout(function () { show((idx + 1) % n); schedule(); }, Math.max(60, def.ms[idx] - elapsed));
    }
    function setStatic() {
      clear();
      show(n - 1); /* recap = still end frame */
      state('static'); fig.setAttribute('data-scene', 'end');
      Array.prototype.forEach.call(dots.children, function (d) { d.classList.remove('on'); });
      if (top) { pp.hidden = true; }
    }
    function sync() {
      if (reduced()) { if (fig.getAttribute('data-state') !== 'static') setStatic(); return; }
      if (pp) pp.hidden = false;
      var go = onscreen && open() && !userPaused && !document.hidden;
      if (go) {
        if (fig.getAttribute('data-state') === 'playing') return;
        if (idx < 0 || fig.getAttribute('data-state') === 'static') { show(0); elapsed = 0; }
        state('playing'); schedule();
      } else {
        if (fig.getAttribute('data-state') === 'playing') { elapsed += Date.now() - startedAt; clear(); }
        if (idx < 0 && !reduced()) { state('idle'); return; }
        state(userPaused ? 'paused' : 'idle');
      }
    }
    if (pp) pp.addEventListener('click', function () {
      userPaused = !userPaused;
      pp.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
      pp.textContent = userPaused ? 'Play animation' : 'Pause animation';
      sync();
    });
    if (det) det.addEventListener('toggle', function () { setTimeout(sync, 0); });
    document.addEventListener('visibilitychange', sync);
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', sync); else if (mq.addListener) mq.addListener(sync); }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { onscreen = es[es.length - 1].isIntersecting; sync(); }, { threshold: 0.3 }).observe(stage);
    } else { onscreen = true; }
    state('idle'); sync();
  }

  function init() {
    var figs = document.querySelectorAll('.ex[data-ex]');
    if (!figs.length) return;
    sprite();
    Array.prototype.forEach.call(figs, Player);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
