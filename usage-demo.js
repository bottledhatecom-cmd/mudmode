/* Project usage demo: a weeks-long project with and without mudmode. EXAMPLE UNITS only: made-up, illustrative numbers.
   Not a measurement of any AI service. No network, no storage, no tracking. */
(function () {
  'use strict';
  var M = window.MMDemo, root = document.getElementById('demo-usage');
  if (!M || !root) return;
  var h = M.h;

  var WEEKS = 4, PER_WEEK = 5, WORK = 10;
  /* Example units per chat session, by week. Made up for illustration. */
  var NO = [
    { explain: 4,  repeat: 0, rebuild: 0 },
    { explain: 6,  repeat: 2, rebuild: 2 },
    { explain: 8,  repeat: 3, rebuild: 3 },
    { explain: 10, repeat: 4, rebuild: 4 }
  ];
  var WITH = { read: 2, write: 1 }; /* mudmode costs something every session: it is not free */
  var SEG = {
    work:    { cls: 'work',  label: 'Real work' },
    explain: { cls: 'ex',    label: 'Re-explaining the project' },
    repeat:  { cls: 'rp',    label: 'Repeating an old mistake' },
    rebuild: { cls: 'rb',    label: 'Rebuilding lost work' },
    read:    { cls: 'rd',    label: 'Reading its notes at the start of each chat' },
    write:   { cls: 'wr',    label: 'Writing the handoff' },
    lost:    { cls: 'ex',    label: 'Re-explaining context between projects' },
    note:    { cls: 'rd',    label: 'Reading shared notes when switching projects' },
    strong:  { cls: 'pl',    label: 'Main AI: planning, reviewing and fixing' },
    cheap:   { cls: 'dr',    label: 'Spare devices: drafts and batch jobs' },
    all:     { cls: 'work',  label: 'Everything on the main AI' }
  };

  function sessNo(w) { var n = NO[w]; return WORK + n.explain + n.repeat + n.rebuild; }
  function sessWith() { return WORK + WITH.read + WITH.write; }
  function sum(arr) { return arr.reduce(function (a, b) { return a + b; }, 0); }
  function totals(upTo) { /* upTo = weeks included, 1..WEEKS */
    var t = { no: 0, yes: 0, explain: 0, repeat: 0, rebuild: 0, work: 0, read: 0, write: 0 }, i;
    for (i = 0; i < upTo; i++) {
      t.no += sessNo(i) * PER_WEEK; t.yes += sessWith() * PER_WEEK;
      t.explain += NO[i].explain * PER_WEEK; t.repeat += NO[i].repeat * PER_WEEK; t.rebuild += NO[i].rebuild * PER_WEEK;
      t.work += WORK * PER_WEEK; t.read += WITH.read * PER_WEEK; t.write += WITH.write * PER_WEEK;
    }
    return t;
  }
  var MAXSESS = sessNo(WEEKS - 1), MAXTOT = totals(WEEKS).no;

  function stack(parts, scale, dir, aria) {
    var s = h('div', 'du-stack ' + dir, null, { role: 'img', 'aria-label': aria });
    parts.forEach(function (p) {
      if (!p.v) return;
      var seg = h('span', 'du-seg ' + SEG[p.k].cls);
      seg.style[dir === 'v' ? 'height' : 'width'] = (p.v / scale * 100) + '%';
      seg.setAttribute('title', SEG[p.k].label + ': ' + p.v + ' example units');
      s.appendChild(seg);
    });
    return s;
  }

  function build() {
    root.textContent = '';
    var ready = false, week = WEEKS, uid = 'du-' + Math.random().toString(36).slice(2, 7);
    root.appendChild(M.topBar('Try it: a weeks-long project, with and without mudmode',
      'Slide through a 4-week project. A chat AI starts each new chat knowing only what is in that chat. All numbers are made-up "example units" for illustration: they are not measurements, not real usage, and not about any AI service. Your numbers will differ.'));

    var ctl = h('div', 'du-ctl');
    var lab = h('label', 'du-lab', null, { 'for': uid + '-w' });
    var labTxt = h('span'); lab.appendChild(labTxt);
    var rng = h('input', 'du-range', null, { type: 'range', id: uid + '-w', min: '1', max: String(WEEKS), step: '1', value: String(WEEKS) });
    ctl.appendChild(lab); ctl.appendChild(rng);
    root.appendChild(ctl);
    root.appendChild(h('p', 'dm-meta', 'Example project: ' + WEEKS + ' weeks, ' + PER_WEEK + ' chats a week, ' + WORK + ' example units of real work in each chat. Every chat is a fresh start for the AI.'));

    var legend = h('ul', 'du-legend', null, { 'aria-label': 'Legend' });
    ['work', 'explain', 'repeat', 'rebuild', 'read', 'write'].forEach(function (k) {
      var li = h('li'); li.appendChild(h('i', 'du-seg ' + SEG[k].cls, null, { 'aria-hidden': 'true' })); li.appendChild(document.createTextNode(SEG[k].label));
      legend.appendChild(li);
    });
    root.appendChild(legend);

    var grid = h('div', 'dm-grid du-grid');
    var perWin = M.panelWindow('Usage per chat, by week (example units)');
    var totWin = M.panelWindow('Total so far (example units)');
    grid.appendChild(perWin.win); grid.appendChild(totWin.win);
    root.appendChild(grid);

    var statusEl = h('p', 'dm-sr', '', { role: 'status', 'aria-live': 'polite' });
    root.appendChild(statusEl);
    var tbl = null;

    function render() {
      var upto = week, t = totals(upto), i;
      labTxt.textContent = 'Project week: ' + week + ' of ' + WEEKS;
      rng.setAttribute('aria-valuetext', 'Week ' + week + ' of ' + WEEKS);

      /* per-chat bars */
      perWin.body.textContent = '';
      var chart = h('div', 'du-chart', null, { role: 'group', 'aria-label': 'Example units used in one chat, for each week. Left bar: no mudmode. Right bar: with mudmode.' });
      for (i = 0; i < WEEKS; i++) {
        var on = i < upto, n = NO[i];
        var g = h('div', 'du-wk' + (on ? '' : ' off'));
        var bars = h('div', 'du-bars');
        bars.appendChild(stack([{ k: 'work', v: WORK }, { k: 'explain', v: n.explain }, { k: 'repeat', v: n.repeat }, { k: 'rebuild', v: n.rebuild }], MAXSESS, 'v',
          'Week ' + (i + 1) + ', no mudmode: ' + sessNo(i) + ' example units per chat'));
        bars.appendChild(stack([{ k: 'work', v: WORK }, { k: 'read', v: WITH.read }, { k: 'write', v: WITH.write }], MAXSESS, 'v',
          'Week ' + (i + 1) + ', with mudmode: ' + sessWith() + ' example units per chat'));
        g.appendChild(bars);
        g.appendChild(h('div', 'du-nums', sessNo(i) + ' / ' + sessWith()));
        g.appendChild(h('div', 'du-wl', 'Week ' + (i + 1)));
        chart.appendChild(g);
      }
      perWin.body.appendChild(chart);
      perWin.body.appendChild(h('p', 'dm-meta', 'Numbers under each pair: no mudmode / with mudmode, in example units per chat. Weeks after the one you picked are dimmed.'));

      /* totals */
      totWin.body.textContent = '';
      var m1 = h('div', 'dm-meter');
      m1.appendChild(Object.assign(h('p', 'lab'), {}));
      m1.firstChild.appendChild(h('span', null, 'No mudmode'));
      m1.firstChild.appendChild(h('b', null, t.no + ' example units'));
      m1.appendChild(stack([{ k: 'work', v: t.work }, { k: 'explain', v: t.explain }, { k: 'repeat', v: t.repeat }, { k: 'rebuild', v: t.rebuild }], MAXTOT, 'h',
        'No mudmode, through week ' + upto + ': ' + t.no + ' example units in total'));
      totWin.body.appendChild(m1);
      var m2 = h('div', 'dm-meter');
      m2.appendChild(h('p', 'lab'));
      m2.firstChild.appendChild(h('span', null, 'With mudmode'));
      m2.firstChild.appendChild(h('b', null, t.yes + ' example units'));
      m2.appendChild(stack([{ k: 'work', v: t.work }, { k: 'read', v: t.read }, { k: 'write', v: t.write }], MAXTOT, 'h',
        'With mudmode, through week ' + upto + ': ' + t.yes + ' example units in total'));
      totWin.body.appendChild(m2);

      var diff = t.no - t.yes;
      totWin.body.appendChild(h('h4', null, 'Difference so far'));
      totWin.body.appendChild(h('p', 'dm-big', (diff >= 0 ? diff : Math.abs(diff)) + (diff >= 0 ? ' fewer' : ' more') + ' example units spent re-explaining and redoing work'));
      totWin.body.appendChild(h('p', 'dm-meta', 'Without mudmode, ' + (t.explain + t.repeat + t.rebuild) + ' of the ' + t.no + ' went to re-explaining (' + t.explain + '), repeated mistakes (' + t.repeat + ') and rebuilding lost work (' + t.rebuild + '). With mudmode, ' + (t.read + t.write) + ' of the ' + t.yes + ' went to reading and writing its notes. It costs something every chat, and in this example it stays the same size.'));
      if (diff < 0) totWin.body.appendChild(h('p', 'dm-meta', 'Early on, writing the handoff note is a small extra cost.'));
      else if (upto === 1) totWin.body.appendChild(h('p', 'dm-meta', 'In week 1 the two are close: there is not much history to lose yet.'));

      statusEl.textContent = '';
      var msgText = 'Week ' + upto + ' of ' + WEEKS + '. No mudmode ' + t.no + ' example units in total, with mudmode ' + t.yes + '. Difference ' + Math.abs(diff) + (diff >= 0 ? ' less' : ' more') + ' with mudmode.';
      if (ready) setTimeout(function () { statusEl.textContent = msgText; }, 30);
    }

    /* data table for anyone who prefers numbers */
    var det = h('details', 'du-det');
    det.appendChild(h('summary', null, 'See the example numbers as a table'));
    tbl = h('table', 'dm-ledger du-tbl');
    tbl.appendChild(h('caption', 'dm-meta', 'Example units used in one chat, by week. Made up for illustration.'));
    var thead = h('thead'), trh = h('tr');
    ['Week', 'Real work', 'Re-explain', 'Repeat mistakes', 'Rebuild', 'No mudmode, per chat', 'Reading + writing notes', 'With mudmode, per chat'].forEach(function (c) { trh.appendChild(h('th', null, c, { scope: 'col' })); });
    thead.appendChild(trh); tbl.appendChild(thead);
    var tb = h('tbody');
    for (var i = 0; i < WEEKS; i++) {
      var tr = h('tr'); tr.appendChild(h('th', null, String(i + 1), { scope: 'row' }));
      [WORK, NO[i].explain, NO[i].repeat, NO[i].rebuild, sessNo(i), WITH.read + WITH.write, sessWith()].forEach(function (v) { tr.appendChild(h('td', null, String(v))); });
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    var wrap = h('div', 'du-tblwrap'); wrap.appendChild(tbl); det.appendChild(wrap);
    root.appendChild(det);

    /* The next two parts live in a separate container (inside the mudgo window). Without it they render into a detached element. */
    var more = document.getElementById('demo-usage-more') || document.createElement('div');
    more.textContent = '';
    more.appendChild(M.topBar('Go deeper: more AIs, and spare devices', 'Two more made-up examples. All numbers are example units, for illustration only.'));
    var status2 = h('p', 'dm-sr', '', { role: 'status', 'aria-live': 'polite' });
    more.appendChild(status2);
    /* ---- Scale up: several AIs across several projects ---- */
    var SW = 6, LOSE = 5, READ = 1, PROJ = 3, COUNTS = [1, 3, 5], ai = 3;
    more.appendChild(h('h3', 'dm-title du-h', 'Scale up: more AIs, more projects'));
    more.appendChild(h('p', 'dm-lead', 'Now several AIs share ' + PROJ + ' projects. Each time one switches to a different project, it starts that project fresh. Example: each AI switches ' + SW + ' times a week. Without mudmode, a switch costs ' + LOSE + ' example units of re-explaining. With shared notes (handoffs and rules), a switch costs ' + READ + ' example unit to read them. Keeping those notes up to date is counted in that 1.'));
    var scaleBox = h('div', 'du-box');
    var fs = h('fieldset', 'dm-pick du-pick'); fs.appendChild(h('legend', null, 'How many AIs are working?'));
    var scaleOut = h('div', 'du-out');
    COUNTS.forEach(function (n) {
      var l = h('label'); var r = h('input', null, null, { type: 'radio', name: uid + '-ai', value: String(n) });
      if (n === ai) r.checked = true;
      r.addEventListener('change', function () { ai = n; renderScale(); });
      l.appendChild(r); l.appendChild(document.createTextNode(n + (n === 1 ? ' AI' : ' AIs'))); fs.appendChild(l);
    });
    scaleBox.appendChild(fs); scaleBox.appendChild(scaleOut); more.appendChild(scaleBox);
    function renderScale() {
      Array.prototype.forEach.call(fs.querySelectorAll('label'), function (l) { l.classList.toggle('on', l.firstChild.checked); });
      var no = ai * SW * LOSE, yes = ai * SW * READ, max = 5 * SW * LOSE;
      scaleOut.textContent = '';
      var m1 = h('div', 'dm-meter'); m1.appendChild(h('p', 'lab')); m1.firstChild.appendChild(h('span', null, 'No mudmode, ' + ai + (ai === 1 ? ' AI' : ' AIs')));
      m1.firstChild.appendChild(h('b', null, no + ' example units a week'));
      m1.appendChild(stack([{ k: 'lost', v: no }], max, 'h', 'No mudmode, ' + ai + ' AIs: ' + no + ' example units a week spent re-explaining context'));
      var m2 = h('div', 'dm-meter'); m2.appendChild(h('p', 'lab')); m2.firstChild.appendChild(h('span', null, 'With mudmode, ' + ai + (ai === 1 ? ' AI' : ' AIs')));
      m2.firstChild.appendChild(h('b', null, yes + ' example units a week'));
      m2.appendChild(stack([{ k: 'note', v: yes }], max, 'h', 'With mudmode, ' + ai + ' AIs: ' + yes + ' example units a week spent reading shared notes'));
      scaleOut.appendChild(m1); scaleOut.appendChild(m2);
      scaleOut.appendChild(h('p', 'dm-big', (no - yes) + ' fewer example units a week spent re-explaining'));
      scaleOut.appendChild(h('p', 'dm-meta', 'The loss grows with every AI you add, because each one has to be caught up each time it changes project. Shared notes keep that cost small. In this example: 1 AI ' + (1 * SW * LOSE) + ' vs ' + (1 * SW * READ) + ', 3 AIs ' + (3 * SW * LOSE) + ' vs ' + (3 * SW * READ) + ', 5 AIs ' + (5 * SW * LOSE) + ' vs ' + (5 * SW * READ) + '.'));
      status2.textContent = ''; var tx = ai + (ai === 1 ? ' AI' : ' AIs') + ': no mudmode ' + no + ', with mudmode ' + yes + ' example units a week.';
      if (ready) setTimeout(function () { status2.textContent = tx; }, 30);
    }
    renderScale();

    /* ---- Link your spare devices ---- */
    var JOBS = 20, STRONG = 5, DRAFT = 6, ALLSTRONG = 10, PERDEV = 5, WEIGHT = 0.3;
    var DEVS = [
      { id: 'phone',  name: 'Old phone',          needPlug: true },
      { id: 'laptop', name: 'Cheap laptop',       needPlug: true },
      { id: 'desk',   name: 'Spare desktop PC',   needPlug: false }
    ];
    var linked = {}, plugged = {};
    more.appendChild(h('h3', 'dm-title du-h', 'Link your spare devices'));
    more.appendChild(h('p', 'dm-lead', 'Got an old phone, a cheap laptop or a spare PC lying around? Each one can run its own AI account (accounts you already have, within each service\'s terms). Your main stronger AI plans each job and reviews the result. Spare devices take the drafts and batch jobs. Example: ' + JOBS + ' jobs in a week. All on the main AI, a job costs ' + ALLSTRONG + ' example units. Split up, the main AI spends ' + STRONG + ' (planning, review and fixing) and the drafting takes ' + DRAFT + ' on the spare device\'s account. Each spare device takes up to ' + PERDEV + ' jobs a week in this example.'));
    var offBox = h('div', 'du-box du-off');
    var left = h('div', 'du-left');
    var main = h('div', 'du-dev du-main');
    main.appendChild(h('b', null, 'Main PC'));
    main.appendChild(h('span', null, 'Stronger AI: plans and reviews'));
    left.appendChild(main);
    left.appendChild(h('div', 'du-arrow', '\u2193 asks first, then hands out drafts and batch jobs \u2193', { 'aria-hidden': 'true' }));
    var devWrap = h('div', 'du-devs', null, { role: 'group', 'aria-label': 'Spare devices. Linking a device is optional.' });
    var cards = {};
    DEVS.forEach(function (d) {
      var c = h('div', 'du-dev'); var st = h('span', 'du-st');
      var l1 = h('label', 'du-chk'); var cb = h('input', null, null, { type: 'checkbox' });
      cb.addEventListener('change', function () { linked[d.id] = cb.checked; renderOff(); });
      l1.appendChild(cb); l1.appendChild(document.createTextNode('Link my ' + d.name.toLowerCase().replace(' pc', ' PC')));
      c.appendChild(h('b', null, d.name)); c.appendChild(h('span', null, 'its own AI account')); c.appendChild(l1);
      var pb = null;
      if (d.needPlug) {
        var l2 = h('label', 'du-chk'); pb = h('input', null, null, { type: 'checkbox' });
        pb.addEventListener('change', function () { plugged[d.id] = pb.checked; renderOff(); });
        l2.appendChild(pb); l2.appendChild(document.createTextNode('It is plugged in')); c.appendChild(l2);
      }
      c.appendChild(st);
      cards[d.id] = { el: c, st: st, cb: cb, pb: pb };
      devWrap.appendChild(c);
    });
    left.appendChild(devWrap);
    var offOut = h('div', 'du-out');
    offBox.appendChild(left); offBox.appendChild(offOut); more.appendChild(offBox);
    function fmt(n) { return String(Math.round(n * 10) / 10); }
    function renderOff() {
      var active = 0;
      DEVS.forEach(function (d) {
        var cd = cards[d.id], isLinked = !!linked[d.id], ok = isLinked && (!d.needPlug || !!plugged[d.id]);
        if (cd.pb) { cd.pb.disabled = !isLinked; }
        cd.el.classList.toggle('on', ok);
        cd.st.textContent = ok ? 'Working: takes ' + PERDEV + ' draft jobs (' + (PERDEV * DRAFT) + ' example units on its own account)' :
          (!isLinked ? 'Not linked. Nothing is sent here.' : 'Waiting: it only works while plugged in.');
        if (ok) active++;
      });
      var offl = active * PERDEV, base = JOBS * ALLSTRONG;
      var strong = offl * STRONG + (JOBS - offl) * ALLSTRONG, spare = offl * DRAFT * WEIGHT, total = strong + spare;
      offOut.textContent = '';
      var m1 = h('div', 'dm-meter'); m1.appendChild(h('p', 'lab')); m1.firstChild.appendChild(h('span', null, 'Everything on the main AI'));
      m1.firstChild.appendChild(h('b', null, fmt(base) + ' example units'));
      m1.appendChild(stack([{ k: 'all', v: base }], base, 'h', 'Everything on the main AI: ' + fmt(base) + ' example units'));
      var m2 = h('div', 'dm-meter'); m2.appendChild(h('p', 'lab')); m2.firstChild.appendChild(h('span', null, active + (active === 1 ? ' spare device linked' : ' spare devices working')));
      m2.firstChild.appendChild(h('b', null, fmt(total) + ' example units'));
      m2.appendChild(stack([{ k: 'strong', v: strong }, { k: 'cheap', v: spare }], base, 'h', 'With ' + active + ' spare devices working: ' + fmt(total) + ' example units, ' + fmt(strong) + ' on the main AI and ' + fmt(spare) + ' on spare devices\' accounts'));
      offOut.appendChild(m1); offOut.appendChild(m2);
      var lg = h('ul', 'du-legend', null, { 'aria-label': 'Legend' });
      ['all', 'strong', 'cheap'].forEach(function (k) { var li = h('li'); li.appendChild(h('i', 'du-seg ' + SEG[k].cls, null, { 'aria-hidden': 'true' })); li.appendChild(document.createTextNode(SEG[k].label)); lg.appendChild(li); });
      offOut.appendChild(lg);
      offOut.appendChild(h('p', 'dm-big', active ? fmt(base - total) + ' example units less' : 'Tick a device to try it'));
      offOut.appendChild(h('p', 'dm-meta', active ? 'The main AI\'s own load drops from ' + fmt(base) + ' to ' + fmt(strong) + ' example units. Spare-device units are counted at ' + WEIGHT + ' each here, an example weight. Real accounts differ, and some may cost nothing. Check each service\'s terms and limits.' : 'Nothing is linked, so everything stays on the main AI. Linking is optional.'));
      var ul = h('ul', 'du-safe', null, { 'aria-label': 'Safety notes' });
      ['Optional: nothing is linked unless you do it.', 'Asks first: your AI asks before it sends work to a spare device.', 'A stronger AI reviews it: drafts from spare devices are checked by the main AI before they count, and that review is in its ' + STRONG + ' units per job. Cheaper drafts can still be wrong, so you stay in charge.', 'Phones and laptops only while plugged in.', 'Use accounts you already have, within each service\'s terms. This demo does not say any service allows extra accounts or free use.'].forEach(function (t) { ul.appendChild(h('li', null, t)); });
      offOut.appendChild(ul);
      status2.textContent = ''; var tx = active + ' spare devices working. Main AI ' + fmt(strong) + ' example units, total ' + fmt(total) + ' against ' + fmt(base) + ' with everything on the main AI.';
      if (ready) setTimeout(function () { status2.textContent = tx; }, 30);
    }
    renderOff();
    more.appendChild(h('p', 'fine', 'Illustrative only. These example units are not tokens, dollars or minutes, and not a promise of any saving. Nothing here is sent, saved or tracked.'));


    var foot = h('div', 'dm-foot');
    foot.appendChild(M.button('Reset to week ' + WEEKS, 'ghost', function () { week = WEEKS; rng.value = String(WEEKS); render(); M.focusSoon(rng); }));
    foot.appendChild(h('p', 'fine', 'Illustrative only. These example units are not tokens, dollars or minutes, and not a promise of any saving: real projects vary a lot. mudmode is a set of rules your AI is asked to follow, not a lock. Nothing is sent, saved or tracked.'));
    root.appendChild(foot);

    rng.addEventListener('input', function () { week = parseInt(rng.value, 10) || WEEKS; render(); });
    render();
    ready = true;
  }
  build();
})();
