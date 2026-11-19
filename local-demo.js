/* Own-computer demo: which jobs stay on your computer, which go to a cloud AI. Example numbers only. No network, no storage, no tracking. */
(function () {
  'use strict';
  var M = window.MMDemo, root = document.getElementById('demo-local');
  if (!M || !root) return;
  var h = M.h, gen = 0;

  /* c = example cloud units if the cloud AI does it all. Units are made up, not prices. */
  var JOBS = [
    { id: 'draft', name: 'Draft a first version of a newsletter', c: 6,
      mine: { gpu: { u: 2, why: 'A local AI writes the first draft on your computer. A stronger cloud AI reviews it. Local AI is for first drafts and summaries only.' } },
      cloud: 'A cloud AI writes it.', need: 'A local AI needs a strong GPU, so this stays on the cloud AI.' },
    { id: 'pic', name: 'Make a picture for a blog post', c: 10,
      mine: { gpu: { u: 0, why: 'Made on your computer (needs a strong GPU, cleared licence). You approve each picture.' } },
      cloud: 'Cloud image tools can cost real money, so your AI asks you first.', need: 'Local pictures need a strong GPU. Until then, a cloud image tool is used, and your AI asks you first because it can cost money.' },
    { id: 'batch', name: 'Back up files and check every link (batch work)', c: 8,
      mine: { any: { u: 1, why: 'Runs as a script on your computer (on a laptop, only while plugged in). The AI reads just the short result.' } },
      cloud: 'A cloud AI runs each step and reads all the output.' },
    { id: 'sum', name: 'Summarize a long set of notes', c: 4,
      mine: { gpu: { u: 1, why: 'A local AI makes the first summary on your computer. A stronger cloud AI checks it.' } },
      cloud: 'A cloud AI summarizes it.', need: 'A local AI needs a strong GPU, so this stays on the cloud AI.' },
    { id: 'quick', name: 'Ask a quick question', c: 1, fixed: true,
      cloud: 'Small and quick, so the cloud AI is fine. Nothing to offload.' },
    { id: 'code', name: 'Change the website code', c: 7, fixed: true,
      cloud: 'Stays on a strong cloud AI. A local AI is not used for code, rules, legal wording or release decisions.' }
  ];

  function build() {
    var my = ++gen, on = false, hw = 'gpu', busy = false, picked = {};
    root.textContent = '';
    root.appendChild(M.topBar('Try it: your own computer for the small stuff', 'Tick a few sample jobs, then turn on "Run on my computer" to see which ones can stay home. It is optional: everything works on any ordinary computer with cloud AIs only.'));

    var grid = h('div', 'dm-grid');
    var left = h('div', 'dm-win'); var lp = h('div', 'dm-panel');
    var tb = h('div', 'dm-tb'); var dots = h('span', 'dots', null, { 'aria-hidden': 'true' }); dots.appendChild(h('i')); dots.appendChild(h('i')); dots.appendChild(h('i'));
    tb.appendChild(dots); tb.appendChild(h('b', null, 'Sample jobs (example)')); left.appendChild(tb); left.appendChild(lp);
    var right = M.panelWindow('Cloud use meter (example numbers)');
    grid.appendChild(left); grid.appendChild(right.win); root.appendChild(grid);

    var swId = 'dm-local-sw-' + gen;
    var sw = h('label', 'dm-sw', null, { 'for': swId });
    var swIn = h('input', null, null, { type: 'checkbox', id: swId, role: 'switch' }); swIn.checked = false;
    sw.appendChild(swIn); sw.appendChild(h('span', null, 'Run on my computer (off by default)'));
    lp.appendChild(sw);
    lp.appendChild(h('p', 'dm-meta', 'Your AI would check what your computer has first, offer this in one line, and wait for your yes. This switch is your yes, and it is also the off switch. Off always wins.'));

    var opts = h('div', 'dm-opts'); opts.hidden = true;
    var rg = h('fieldset', 'dm-radios');
    rg.appendChild(h('legend', 'dm-meta', 'My computer is:'));
    opts.appendChild(rg);
    [['gpu', 'a strong GPU PC'], ['lap', 'a laptop, no GPU']].forEach(function (o) {
      var l = h('label'); var r = h('input', null, null, { type: 'radio', name: 'dm-hw-' + gen, value: o[0] });
      if (o[0] === 'gpu') r.checked = true;
      r.addEventListener('change', function () { hw = o[0]; update('Computer set to ' + o[1] + '.'); });
      l.appendChild(r); l.appendChild(document.createTextNode(o[1])); rg.appendChild(l);
    });
    var bl = h('label'); var bi = h('input', null, null, { type: 'checkbox' }); bi.checked = false;
    bi.addEventListener('change', function () { busy = bi.checked; update(busy ? 'You are using the computer, so heavy local jobs ask first.' : 'Computer is idle again.'); });
    bl.appendChild(bi); bl.appendChild(document.createTextNode("I'm using my computer right now")); opts.appendChild(bl);
    lp.appendChild(opts);

    var list = h('ul', 'dm-jobs', null, { 'aria-label': 'Sample jobs' });
    var rows = {};
    JOBS.forEach(function (j) {
      var li = h('li', 'dm-job'); var id = 'dm-job-' + gen + '-' + j.id;
      var cb = h('input', null, null, { type: 'checkbox', id: id }); cb.checked = false;
      cb.addEventListener('change', function () { picked[j.id] = cb.checked; update(j.name + (cb.checked ? ' added.' : ' removed.')); });
      var lab = h('label', null, j.name, { 'for': id });
      var rt = h('span', 'dm-route idle', 'not picked');
      var why = h('p', 'dm-why', '');
      li.appendChild(cb); li.appendChild(lab); li.appendChild(rt); li.appendChild(why);
      list.appendChild(li); rows[j.id] = { li: li, route: rt, why: why };
    });
    lp.appendChild(list);

    var m = h('div', 'dm-meter');
    var lab1 = h('div', 'lab'); var l1a = h('span', null, 'If a cloud AI did all of it'); var l1b = h('b', null, '0 units'); lab1.appendChild(l1a); lab1.appendChild(l1b);
    var p1 = h('progress', null, null, { max: '100', value: '0', 'aria-label': 'Cloud use if everything ran on the cloud, in example units' });
    var lab2 = h('div', 'lab'); var l2a = h('span', null, 'With your choices'); var l2b = h('b', null, '0 units'); lab2.appendChild(l2a); lab2.appendChild(l2b);
    var p2 = h('progress', null, null, { max: '100', value: '0', 'aria-label': 'Cloud use with your choices, in example units' });
    m.appendChild(lab1); m.appendChild(p1); m.appendChild(h('div', 'dm-meta')); m.appendChild(lab2); m.appendChild(p2);
    right.body.appendChild(m);
    var bigLab = h('p', 'dm-meta', 'Difference from all-cloud (example units)');
    var big = h('p', 'dm-big', '0 units');
    var pct = h('p', 'dm-meta', 'Pick a job to start.');
    right.body.appendChild(bigLab); right.body.appendChild(big); right.body.appendChild(pct);
    var rules = h('ul');
    [['Optional. ', 'Your computer is never a requirement.'], ['Ask first. ', 'Installing drivers or models, or spending money, needs your OK.'], ['Not while you work. ', 'No heavy local jobs while you are using the computer unless you say so.'], ['Checked. ', 'Anything a local AI drafts is reviewed by a stronger AI.']].forEach(function (r) {
      var li = h('li'); li.appendChild(h('b', null, r[0])); li.appendChild(document.createTextNode(r[1])); rules.appendChild(li);
    });
    right.body.appendChild(h('h4', null, 'What stays true')); right.body.appendChild(rules);

    var status = h('p', 'dm-sr', '', { role: 'status', 'aria-live': 'polite' }); root.appendChild(status);
    var foot = h('div', 'dm-foot');
    foot.appendChild(M.button('Replay demo', 'ghost', function () { build(); M.focusSoon(root.querySelector('.dm-sw input')); }));
    foot.appendChild(h('p', 'fine', 'Units are made-up example numbers to show the idea. They are not prices and not a promise of any result. Rules your AI is asked to follow, not locks.'));
    root.appendChild(foot);

    swIn.addEventListener('change', function () { on = swIn.checked; opts.hidden = !on; sw.classList.toggle('on', on); update(on ? 'Run on my computer is on.' : 'Run on my computer is off. Everything goes to the cloud AI.'); });

    function route(j) {
      var cloud = { where: 'cloud', u: j.c, why: j.cloud };
      if (j.fixed) return cloud;
      if (!on) return cloud;
      var opt = j.mine.any || (hw === 'gpu' ? j.mine.gpu : null);
      if (!opt) return { where: 'cloud', u: j.c, why: j.need };
      if (busy) return { where: 'cloud', u: j.c, why: 'Your computer is in use, so your AI asks before starting a heavy local job. Until you say yes, it stays on the cloud AI.' };
      return { where: 'mine', u: opt.u, why: opt.why };
    }
    function update(say) {
      var all = 0, now = 0, n = 0;
      JOBS.forEach(function (j) {
        var r = rows[j.id];
        if (!picked[j.id]) { r.route.textContent = 'not picked'; r.route.className = 'dm-route idle'; r.why.textContent = ''; r.li.classList.remove('on'); return; }
        n++; var x = route(j); all += j.c; now += x.u;
        r.li.classList.add('on');
        r.route.textContent = x.where === 'mine' ? 'On my computer' : 'Cloud AI';
        r.route.className = 'dm-route ' + (x.where === 'mine' ? 'mine' : 'cloud');
        r.why.textContent = x.why + ' (' + x.u + ' of ' + j.c + ' example units of cloud use)';
      });
      var top = Math.max(all, 1);
      p1.max = top; p1.value = all; p2.max = top; p2.value = now;
      l1b.textContent = all + ' units'; l2b.textContent = now + ' units';
      var diff = all - now;
      big.textContent = diff + ' units';
      pct.textContent = n ? (diff ? 'These choices move ' + diff + ' of ' + all + ' example units off the cloud AI.' : (on ? 'These jobs stay on the cloud AI in this example, and that is fine.' : 'Turn on "Run on my computer" to compare.')) : 'Pick a job to start.';
      status.textContent = ''; setTimeout(function () { status.textContent = (say ? say + ' ' : '') + 'Cloud use ' + now + ' of ' + all + ' example units.'; }, 30);
    }
    update('');
    status.textContent = '';
  }
  build();
})();
