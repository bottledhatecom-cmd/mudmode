/* Crew demo: sample jobs for a crew of AIs, one rules file. Example text only. No network, no storage, no tracking. */
(function () {
  'use strict';
  var M = window.MMDemo, root = document.getElementById('demo-crew');
  if (!M || !root) return;
  var h = M.h, gen = 0;

  var SVGNS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    t: 'M2 3.5h10M2 7h10M2 10.5h6',
    f: 'M3 1.5h5.5L11 4v8.5H3zM8.5 1.5V4H11',
    plan: 'M2 3l1.5 1.5L6 2M8 3h5M2 8l1.5 1.5L6 7M8 8h5M2 12.5h4',
    eye: 'M1 7c2-3.6 10-3.6 12 0c-2 3.6-10 3.6-12 0zM7 5.6a1.4 1.4 0 1 0 0 2.8a1.4 1.4 0 0 0 0-2.8z',
    carry: 'M2 5h10M9 2l3 3-3 3M12 10H2M5 7l-3 3 3 3',
    copy: 'M5 5h7v7H5zM2 9V2h7'
  };
  function ico(k, cls) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 14 14'); s.setAttribute('width', '14'); s.setAttribute('height', '14');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.setAttribute('class', 'dm-ico' + (cls ? ' ' + cls : ''));
    var p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', ICONS[k]); s.appendChild(p);
    return s;
  }

  var NEXT_ASK = ' Your yes covered one thing; this is a different thing, so I ask again. I am asked to only write a draft, not to ';
  var TASKS = [
    { id: 'bigsite', tag: 'Big project split up', name: 'Build a 5-page site for my shop', slug: 'shop-site', file: 'shop-site/ (5 pages)', bak: 'shop-site.bak-20261118-1610/',
      lanes: [['AI 1 · Planner','t'], ['AI 2 · Builder','f'], ['AI 3 · Reviewer','t']],
      who: ['AI 1 (chat app)', 'AI 2 (code tool)', 'AI 3 (second chat)'],
      meta: 'This job is too big for one chat, so AI 1 cuts it into page cards. AI 2 builds one card at a time, and AI 3 checks each page.',
      plan: ['Split the job into 5 page cards: 1 Home, 2 About, 3 Products, 4 Shipping, 5 Contact. Each card says what "done" means for that page.', 'AI 2 builds one page per card, in order, and copies the folder first.', 'AI 3 reviews each page, read-only, and checks anything that repeats across pages, like a price or a name.', 'Ask you before anything goes live.'],
      act: 'AI 2 builds the pages one card at a time, in a copy.', why: 'the page cards',
      built: 'Copied the shop-site folder to shop-site.bak-20261118-1610/ first. Then built page 1 from card 1, page 2 from card 2, and so on, one card at a time. All 5 pages open.',
      reviewNote: 'I read the pasted rules block and the note you pasted, then went through the 5 pages one at a time. I am asked to read only, not change anything.',
      warn: 'Page 3 (Products) shows the price differently from page 1 (Home). The pages were built from separate cards, so nobody compared them.',
      fix: 'Opened both pages and matched page 3 to the price on page 1, with a copy of page 3 saved first. Also added "check repeated facts" to the cards, so the next page gets checked too.',
      recheck: 'Going through the 5 pages again, read-only:',
      asIs: 'put the 5-page site live', fixed: 'put the 5-page site live (with matching prices)', words: 'Yes, just this one thing.',
      lesson: 'When a big job is split into cards, check what repeats across the pages.',
      next: { q: 'Next, tell your customers the new site is open? Telling people is a different thing, so I ask again.' + NEXT_ASK + 'send.', draft: 'Draft email (not sent): "Our new shop site is open. Come and have a look."', yes: 'Keep the draft, I will send it myself', no: 'Skip', yesDone: 'Draft kept. You send it yourself.', noDone: 'Skipped. Nothing written.' } },
    { id: 'signup', tag: 'Each AI to its strength', name: 'Add a sign-up form to my app', slug: 'signup-form', file: 'app/home.html', bak: 'app/home.html.bak-20261118-1610',
      lanes: [['AI 1 · Planner','t'], ['AI 2 · Coder','f'], ['AI 3 · Reviewer','t']],
      who: ['AI 1 (chat app)', 'AI 2 (code tool)', 'AI 3 (second chat)'],
      meta: 'Each AI gets the part it suits best (example). The code tool writes the code, one chat app writes the friendly words, and a second one reviews.',
      plan: ['AI 2 (code tool) writes the form code. I (a chat app) write the friendly words. AI 3 (a second chat app) reviews both.', 'My text, for AI 2 to use: heading "Join in", box label "Your email address", button "Sign me up", help line "Type your email address, then press the button."', 'AI 2 copies app/home.html first, then adds the form with that text.', 'Ask you before anything goes live.'],
      act: 'AI 2 adds the form in a copy, using the text from the task card.', why: 'the task card',
      built: 'Copied app/home.html to app/home.html.bak-20261118-1610, then added the sign-up form with AI 1\'s text. The page opens and the form shows the heading, the email box and the button.',
      reviewNote: 'I read the pasted rules block and the note you pasted, and looked at both the form code and the friendly text. I am asked to read only, not change anything.',
      warn: 'The form does not say what happens to the email address. A visitor cannot tell why it is asked for or what they will get.',
      fix: 'AI 1 wrote one more help line as text, with blanks for you to fill in with your real plan: "We use your email address to [say what you will send]. You can ask us to stop." AI 2 added it under the box, with a copy of the page saved first.',
      recheck: 'Looking at the form code and the text again, read-only:',
      asIs: 'put the sign-up form live', fixed: 'put the sign-up form live (with the email line)', words: 'Yes, just this one thing.',
      lesson: 'Say what happens to personal details right where they are asked for.',
      next: { q: 'Next, write a welcome email for new sign-ups? Writing to people is a different thing, so I ask again.' + NEXT_ASK + 'send.', draft: 'Draft email (not sent): "Thanks for joining. Here is what to expect."', yes: 'Keep the draft, I will send it myself', no: 'Skip', yesDone: 'Draft kept. You send it yourself.', noDone: 'Skipped. Nothing written.' } },
    { id: 'guide', tag: 'Save the pricier AI for where it counts', name: 'Draft and check a long how-to guide', slug: 'howto-guide', file: 'guide.md', bak: 'guide.md.bak-20261118-1610',
      lanes: [['AI 1 · Outliner','t'], ['AI 2 · Drafter','f'], ['AI 3 · Checker','t']],
      who: ['AI 1 (chat app)', 'AI 2 (lower-cost code tool)', 'AI 3 (stronger chat)'],
      meta: 'Some AIs cost more, so the stronger one only reviews the tricky steps. A lower-cost AI drafts the long, plain parts.',
      plan: ['Outline the guide as 10 steps and mark the tricky ones, steps 4 and 8, where a slip could lose someone\'s work.', 'AI 2, a lower-cost AI, drafts all 10 steps. Plain steps do not need the strongest AI.', 'AI 3, the pricier, stronger AI, reviews only steps 4 and 8, so it is used where it counts.', 'Ask you before anything is published.'],
      act: 'AI 2 drafts the guide in a copy and marks steps 4 and 8 for AI 3.', why: 'the outline',
      built: 'Saved a copy of guide.md as guide.md.bak-20261118-1610 first, then drafted all 10 steps. Steps 4 and 8 are marked for AI 3. The file opens and reads in order.',
      reviewNote: 'I read the pasted rules block and the note you pasted. I am asked to look only at the two tricky steps, 4 and 8, and to read only, not change anything.',
      warn: 'Step 8 changes the settings file but does not say to copy it first, so a mistake there could not be undone.',
      fix: 'Added a step before step 8: "Copy the settings file first." Step 8 now says how to undo the change. Done in a copy, with the draft saved first.',
      recheck: 'Checking steps 4 and 8 again, read-only:',
      asIs: 'publish the how-to guide', fixed: 'publish the how-to guide (with the backup step)', words: 'Yes, just this one thing.',
      lesson: 'Use the stronger AI on the risky steps, and check that each one has a copy-first step.',
      next: { q: 'Next, share the guide with your readers? Sharing is a different thing, so I ask again.' + NEXT_ASK + 'post.', draft: 'Draft post (not sent): "Our new how-to guide is ready. Take a look."', yes: 'Keep the draft, I will post it myself', no: 'Skip', yesDone: 'Draft kept. You post it yourself.', noDone: 'Skipped. Nothing written.' } },
    { id: 'multiday', tag: 'A multi-project day', name: 'Two small apps, a research brief, and an art set', slug: 'day-of-jobs', file: 'pack-list/ and practice-timer/', bak: 'pack-list.bak/ and practice-timer.bak/',
      flow: 'day',
      lanes: [['AI 1 · Foreman','t'], ['AI 2 · App builder','f'], ['AI 3 · App builder','f'], ['AI 4 · Research','t'], ['AI 5 · Art','t']],
      who: ['AI 1 (chat app, Foreman)', 'AI 2 (code tool)', 'AI 3 (code tool)', 'AI 4 (chat app)', 'AI 5 (chat app)'],
      reviewerWho: 'AI 1 (chat app, Reviewer)',
      meta: 'Chat apps give you text; code tools write files, after a backup. You carry every note: the AIs never message each other.',
      plan: ['Four lanes: AI 2 builds a packing-list app, AI 3 a practice-timer app, AI 4 writes a short research brief, and AI 5 lays out art options for you to pick.', 'You carry a handoff note to each AI; the AIs do not message each other.', 'AI 2 and AI 3 write files in their own copies, after a backup. AI 4 and AI 5 hand back text.', 'Then you bring the notes back. I do a read-only Reviewer pass and ask before anything goes live.'],
      warn: 'The packing-list app says "Pack list" on the home screen, but the research brief says "Trip list". The jobs were done side by side, so nobody compared the name.',
      fix: 'Opened the packing-list home screen and matched the heading to "Trip list", the name in the brief, with a copy of the page saved first.',
      recheck: 'Reading the notes you brought back, and the packing-list app again, read-only:',
      asIs: 'put both apps live', fixed: 'put both apps live (with matching list names)', words: 'Yes, just this one thing.',
      lesson: 'When several jobs run side by side, compare the names and facts that appear in more than one lane.',
      next: { q: 'Next, tell people the two apps are ready? Telling people is a different thing, so I ask again.' + NEXT_ASK + 'send.', draft: 'Draft note (not sent): "Two small apps are ready: a packing list and a practice timer."', yes: 'Keep the draft, I will send it myself', no: 'Skip', yesDone: 'Draft kept. You send it yourself.', noDone: 'Skipped. Nothing written.' } }
  ];

  function build() {
    var my = ++gen, task = null, files = [], ledger = [];
    root.textContent = '';
    root.appendChild(M.topBar('Try it: a crew of AIs, one rules file', 'Pick a sample job and click through. Big jobs get split, each AI does what it suits best, and you can run several jobs at once. One rules file, short notes, and a stop to ask before anything risky.'));

    var pickWrap = h('fieldset', 'dm-pick');
    pickWrap.appendChild(h('legend', null, 'Pick a sample job'));
    var name = 'dm-crew-task-' + gen;
    TASKS.forEach(function (t, i) {
      var lab = h('label'); var inp = h('input', null, null, { type: 'radio', name: name, value: t.id });
      if (i === 0) inp.checked = true;
      inp.addEventListener('change', function () { pickWrap.querySelectorAll('label').forEach(function (l) { l.classList.toggle('on', l.firstChild.checked); }); });
      lab.appendChild(inp); lab.appendChild(document.createTextNode(t.tag + ': ' + t.name));
      if (i === 0) lab.className = 'on';
      pickWrap.appendChild(lab);
    });
    var startBtn = M.button('Start this job', '', function () {
      var sel = pickWrap.querySelector('input:checked');
      task = TASKS.filter(function (t) { return t.id === sel.value; })[0];
      pickWrap.hidden = true; started();
    });
    pickWrap.appendChild(startBtn);
    root.appendChild(pickWrap);

    var stage = h('div', 'dm-stage'); stage.hidden = true; root.appendChild(stage);
    var foot = h('div', 'dm-foot');
    foot.appendChild(M.button('Replay demo', 'ghost', function () { build(); M.focusSoon(root.querySelector('.dm-pick input')); }));
    foot.appendChild(h('p', 'fine', 'Each AI plays one part, and the builder is asked not to sign off its own work. Rules your AI is asked to follow, not locks; AI tools can still make mistakes, so keep checking their work. Results vary.'));
    root.appendChild(foot);

    var chat, pan, prog, nextWrap;
    function alive() { return my === gen; }

    function started() {
      stage.hidden = false;
      var lanes = h('div', 'dm-lanes');
      task.lanes.forEach(function (ln, i) {
        var chip = h('span', 'dm-lane a' + (i + 1));
        var kind = h('span', 'dm-kind ' + ln[1]); kind.appendChild(ico(ln[1] === 'f' ? 'f' : 't'));
        chip.appendChild(kind); chip.appendChild(document.createTextNode(ln[0]));
        chip.appendChild(h('span', 'dm-sr', ln[1] === 'f' ? ' (writes files)' : ' (gives you text)'));
        lanes.appendChild(chip);
      });
      stage.appendChild(lanes);
      var leg = h('p', 'dm-legend');
      var l1 = h('span', 'dm-lg'); var k1 = h('span', 'dm-kind t'); k1.appendChild(ico('t')); l1.appendChild(k1); l1.appendChild(document.createTextNode('text: you save or paste it'));
      var l2 = h('span', 'dm-lg'); var k2 = h('span', 'dm-kind f'); k2.appendChild(ico('f')); l2.appendChild(k2); l2.appendChild(document.createTextNode('writes files'));
      leg.appendChild(l1); leg.appendChild(l2); stage.appendChild(leg);
      if (task.flow === 'day') buildFlow();
      stage.appendChild(h('p', 'dm-meta', task.meta));
      prog = h('p', 'dm-prog', ''); stage.appendChild(prog);
      var grid = h('div', 'dm-grid');
      chat = M.chatWindow('Task: ' + task.name);
      pan = M.panelWindow('Shared mudmode folder (example)');
      chat.win.firstChild.appendChild(prog); grid.appendChild(chat.win); grid.appendChild(pan.win);
      stage.appendChild(grid);
      nextWrap = h('div', 'dm-panel'); nextWrap.hidden = true; chat.win.appendChild(nextWrap);
      files.push({ n: 'CORE.md', d: 'the shared rules. The code tool reads the file; a chat app gets the rules as a pasted block.' });
      renderPanel();
      msg('ai a1', task.who[0], ['New task: "' + task.name + '". I read the pasted rules block first. Here is my plan.']); closeStep();
      if (task.flow === 'day') { step('AI 1 plans the day', function () { planDay(); }); planDay(); }
      else { step('AI 1 plans', function () { plan(); }); plan(); }
    }

    function renderPanel() {
      pan.body.textContent = '';
      var pf = h('div', 'dm-pfiles'), pl = h('div', 'dm-pledger');
      pan.body.appendChild(pf); pan.body.appendChild(pl);
      pf.appendChild(h('h4', null, 'Files'));
      var ul = h('ul');
      files.forEach(function (f, i) { var li = h('li', (i === files.length - 1 && files.length > 1 ? 'new' : '') + (i === files.length - 1 ? ' dm-last' : '')); li.appendChild(h('b', null, f.n)); li.appendChild(h('span', 'dm-fd', f.d ? ': ' + f.d : '')); if (f.d) li.title = f.d; ul.appendChild(li); });
      pf.appendChild(ul);
      pl.appendChild(h('h4', null, 'OK-LEDGER.md'));
      var tbl = h('table', 'dm-ledger');
      var cap = h('caption', 'dm-sr', 'OK ledger: one owner OK, one named action'); tbl.appendChild(cap);
      var thead = h('thead'), tr = h('tr');
      ['Owner\'s words', 'Exact action', 'AI', 'Status'].forEach(function (c) { tr.appendChild(h('th', null, c, { scope: 'col' })); });
      thead.appendChild(tr); tbl.appendChild(thead);
      var tb = h('tbody');
      if (!ledger.length) { var r0 = h('tr'); var c0 = h('td', null, 'Empty until your first OK.', { colspan: '4' }); r0.appendChild(c0); tb.appendChild(r0); }
      ledger.forEach(function (l) { var r = h('tr'); [l.words, l.action, l.ai, l.status].forEach(function (c) { r.appendChild(h('td', null, c)); }); tb.appendChild(r); });
      tbl.appendChild(tb); pl.appendChild(tbl);
    }
    function addFile(n, d) { files.push({ n: n, d: d }); renderPanel(); }

    var flowCells = null, flowEl = null;
    function buildFlow() {
      flowEl = h('div', 'dm-flow', null, { role: 'group', 'aria-label': 'Diagram of the day (example): AI 1 plans, four lanes work side by side, you carry the notes, AI 1 reviews, read-only.' });
      flowEl.appendChild(h('span', 'dm-flow-ex', 'example'));
      flowCells = {};
      function cell(key, pos, ai, icons, word, tag) {
        var c = h('div', 'dm-fc ' + pos + ' ' + ai + ' wait');
        var top = h('span', 'dm-fc-top'); top.appendChild(h('i', 'dm-dot'));
        icons.forEach(function (k) { top.appendChild(ico(k)); });
        top.appendChild(h('b', null, word));
        if (tag) top.appendChild(h('em', null, tag));
        c.appendChild(top);
        var bar = h('span', 'dm-bar'); bar.appendChild(h('i')); c.appendChild(bar);
        var sr = h('span', 'dm-sr', ' waiting'); c.appendChild(sr);
        flowCells[key] = { el: c, sr: sr };
        flowEl.appendChild(c);
      }
      cell('plan', 'c1 r1 arr', 'a1', ['plan'], 'Plan');
      cell('w2', 'c2 r2 arr', 'a2', ['f', 'copy'], 'Build');
      cell('w3', 'c3 r2 arr', 'a3', ['f', 'copy'], 'Build');
      cell('w4', 'c4 r2 arr', 'a4', ['t'], 'Brief');
      cell('w5', 'c5 r2 arr', 'a5', ['t'], 'Art');
      cell('carry', 'cwide r3 arr', 'you', ['carry'], 'You carry the notes');
      cell('review', 'c1 r4', 'a1', ['eye'], 'Review', 'read-only');
      stage.appendChild(flowEl);
    }
    var STATE_TXT = { wait: ' waiting', run: ' working', done: ' done' };
    function setFlow(map) {
      if (!flowCells) return;
      Object.keys(map).forEach(function (k) {
        var c = flowCells[k]; if (!c) return;
        c.el.classList.remove('wait', 'run', 'done'); c.el.classList.add(map[k]);
        c.sr.textContent = STATE_TXT[map[k]];
      });
    }
    function flowLater(key, ms) {
      var o = {}; o[key] = 'done';
      if (M.reduced()) { setFlow(o); return; }
      setTimeout(function () { if (alive()) setFlow(o); }, ms);
    }

    function msg(cls, who, paras, pre) {
      var m = h('div', 'dm-msg ' + cls); m.appendChild(h('span', 'dm-who', who));
      paras.forEach(function (p) { m.appendChild(h('p', null, p)); });
      if (pre) {
        var parts = pre.split('\n\n');
        if (parts.length > 1) { var grp = h('div', 'dm-pres'); parts.forEach(function (t) { grp.appendChild(h('div', 'dm-pre', t)); }); m.appendChild(grp); }
        else m.appendChild(h('div', 'dm-pre', pre));
      }
      chat.log.appendChild(m); tidy(); M.scrollEnd(chat.log); return m;
    }
    var stepFn = null;
    /* Earlier steps shrink to one line (the text stays in the page); only the current step is shown in full. */
    var mark = 0;
    function tidy() {
      var kids = chat.log.children, n = kids.length, keep = 1;
      if (n > 1 && kids[n - 1].classList.contains('dm-card') && !kids[n - 2].classList.contains('dm-card')) keep = 2;
      for (var i = 0; i < n; i++) { kids[i].classList.toggle('dm-old', i < mark || i < n - keep); kids[i].classList.toggle('dm-gone', i < n - keep - 3); }
    }
    function closeStep() { mark = chat.log.children.length; tidy(); }
    function step(label, fn) { prog.textContent = 'Now: ' + label; }
    function wait(fn) { setTimeout(function () { if (alive()) fn(); }, M.reduced() ? 0 : 450); }
    function next(label, fn) {
      nextWrap.textContent = ''; nextWrap.hidden = false;
      var b = h('div', 'dm-btns'); var btn = M.button('Next: ' + label, '', function () { closeStep(); nextWrap.hidden = true; nextWrap.textContent = ''; prog.textContent = 'Now: ' + label; wait(fn); });
      b.appendChild(btn); nextWrap.appendChild(b); M.focusSoon(btn);
    }
    function card(title, paras, pre, buttons, ariaLabel) {
      nextWrap.hidden = true; nextWrap.textContent = '';
      var c = h('div', 'dm-card', null, { role: 'group', 'aria-label': ariaLabel || title });
      c.appendChild(h('h4', null, title));
      paras.forEach(function (p) { c.appendChild(h('p', null, p)); });
      if (pre) c.appendChild(h('div', 'dm-pre', pre));
      var btns = h('div', 'dm-btns'), first = null;
      buttons.forEach(function (bd, i) {
        var b = M.button(bd.label, bd.ghost ? 'ghost' : '', function () {
          closeStep(); c.classList.add('done'); btns.textContent = ''; btns.appendChild(h('p', 'dm-meta', 'You chose: ' + bd.label));
          wait(bd.fn);
        });
        if (i === 0) first = b; btns.appendChild(b);
      });
      c.appendChild(btns); chat.log.appendChild(c); tidy(); M.scrollEnd(chat.log); M.focusSoon(first);
    }

    function planDay() {
      setFlow({ plan: 'run' });
      msg('ai a1', task.who[0], ['Plan for the day, as a task card block. Save it as jobs/' + task.slug + '/TASK-CARD.md:'].concat(task.plan.map(function (p, i) { return (i + 1) + '. ' + p; })));
      addFile('jobs/' + task.slug + '/TASK-CARD.md', 'the day plan, and what "done" means for each lane (text from AI 1, saved by you).');
      next('AI 1 hands you a note for each lane', handoffDay);
    }
    function handoffDay() {
      setFlow({ plan: 'done', carry: 'run' });
      msg('ai a1', task.who[0], ['Four short handoff notes, one for each lane. Save each one; you will carry them. The AIs do not message each other.'],
        'NOTE-FOR-AI-2.md\nNext single action: build the packing-list app in a copy, after a backup.\nWritten: today, 4:05 PM CT (example), by AI 1 (Foreman)\nWhat changed: jobs/' + task.slug + '/TASK-CARD.md (new)\nOpen: please build from this card, then leave a note for the owner to carry back\n\nNOTE-FOR-AI-3.md\nNext single action: build the practice-timer app in a copy, after a backup.\nWritten: today, 4:05 PM CT (example), by AI 1 (Foreman)\nWhat changed: jobs/' + task.slug + '/TASK-CARD.md (new)\nOpen: please build from this card, then leave a note for the owner to carry back\n\nNOTE-FOR-AI-4.md\nNext single action: write a short research brief as text, on packing for a weekend walk.\nWritten: today, 4:05 PM CT (example), by AI 1 (Foreman)\nOpen: please hand the brief back as text; do not write a file\n\nNOTE-FOR-AI-5.md\nNext single action: lay out art options as text for a packing-list icon, and wait for the owner to pick.\nWritten: today, 4:05 PM CT (example), by AI 1 (Foreman)\nOpen: please hand the options back as text; do not write a file');
      addFile('NOTE-FOR-AI-2.md', 'handoff for the packing-list app (text from AI 1, saved by you).');
      addFile('NOTE-FOR-AI-3.md', 'handoff for the practice-timer app (text from AI 1, saved by you).');
      addFile('NOTE-FOR-AI-4.md', 'handoff for the research brief (text from AI 1, saved by you).');
      addFile('NOTE-FOR-AI-5.md', 'handoff for the art options (text from AI 1, saved by you).');
      next('You carry each note to its AI', carryDay);
    }
    function carryDay() {
      msg('you', 'You', ['Carrying each handoff note to its AI: I paste them in, or point each AI at the saved file. The AIs do not message each other; I pass the notes along.']);
      next('AI 2, AI 3, AI 4 and AI 5 work their lanes', workLanes);
    }
    function workLanes() {
      setFlow({ plan: 'done', carry: 'done', w2: 'run', w3: 'run', w4: 'run' });
      flowLater('w4', 700); flowLater('w2', 1100); flowLater('w3', 1500);
      msg('ai a2', task.who[1], ['I read CORE.md and the handoff note you pasted. Copied pack-list/ to pack-list.bak/ first. Then built the packing-list app from the card. The home screen opens and shows a list you can tick, headed "Pack list". I still will not call it done: a second look comes later.']);
      addFile('pack-list.bak/', 'the copy of the packing-list app, kept so every change can be undone.');
      addFile('pack-list/', 'the packing-list app (written by AI 2, the code tool, after the backup).');
      msg('ai a3', task.who[2], ['I read CORE.md and the handoff note you pasted. Copied practice-timer/ to practice-timer.bak/ first. Then built the practice-timer app from the card. The timer opens and counts. I still will not call it done: a second look comes later.']);
      addFile('practice-timer.bak/', 'the copy of the practice-timer app, kept so every change can be undone.');
      addFile('practice-timer/', 'the practice-timer app (written by AI 3, the code tool, after the backup).');
      msg('ai a4', task.who[3], ['I read the handoff note you pasted. Here is the brief, as a text block you can save. I am asked to hand this back as text, not to write a file.'],
        'RESEARCH-BRIEF.md (text only)\nPacking for a weekend walk.\nCover: weather, shoes, water, and a paper map.\nCall the list "Trip list".\nNo bookings, no purchases.');
      addFile('RESEARCH-BRIEF.md', 'the brief (text from AI 4, saved by you).');
      next('AI 5 lays out art options', artOptions);
    }
    function artOptions() {
      setFlow({ w5: 'run' });
      msg('ai a5', task.who[4], ['I read the handoff note you pasted. Here are three art options for a packing-list icon, as text. I am asked to hand these back as text, not to write a file. Please pick one.']);
      card('Pick the art (example)', ['AI 5 laid out these options as text. Your pick is the one that counts.'], '1. A simple backpack icon, plain lines, one color.\n2. A small checklist with a tick, plain lines, one color.\n3. A suitcase with a tag, plain lines, one color.', [
        { label: 'Pick option 1, the backpack', fn: function () { pickedArt('1', 'A simple backpack icon, plain lines, one color.'); } },
        { label: 'Pick option 2, the checklist', fn: function () { pickedArt('2', 'A small checklist with a tick, plain lines, one color.'); } },
        { label: 'Pick option 3, the suitcase', fn: function () { pickedArt('3', 'A suitcase with a tag, plain lines, one color.'); } }
      ], 'Pick an art option');
    }
    function pickedArt(num, desc) {
      setFlow({ w5: 'done' });
      msg('ai a5', task.who[4], ['You picked option ' + num + '. Here it is as a prompt block you can save. I am asked to hand this back as text, not to write a file.'],
        'ART-CHOICE.md (text only)\nOwner pick: option ' + num + '.\n' + desc);
      addFile('ART-CHOICE.md', 'your art pick, from the options AI 5 handed back as text (saved by you).');
      next('You carry the notes back to AI 1 for review', carryReview);
    }
    function carryReview() {
      setFlow({ w2: 'done', w3: 'done', w4: 'done', carry: 'run' });
      msg('you', 'You', ['Carrying each lane\'s note back to AI 1 for the Reviewer pass: I paste them in, or add them to its project files. The AIs do not message each other.']);
      next('AI 1 reviews, read-only', reviewDay);
    }
    function reviewDay() {
      setFlow({ carry: 'done', review: 'run' });
      flowLater('review', 900);
      var m = msg('ai a1', task.reviewerWho, ['I read the pasted rules block and the notes you brought back from each lane. I am asked to read only, not change anything. My verdict as a text block you can save:']);
      var p = h('p'); p.appendChild(h('span', 'dm-tag warn', 'WARN')); p.appendChild(document.createTextNode(task.warn)); m.appendChild(p);
      addFile('jobs/' + task.slug + '/VERDICT-reviewer.md', 'WARN: a pass, with every note listed (text from AI 1, saved by you).');
      decide();
    }

    function plan() {
      var m = msg('ai a1', 'AI 1 (chat app)', ['Plan, as a task card block. Save it as jobs/' + task.slug + '/TASK-CARD.md:'].concat(task.plan.map(function (p, i) { return (i + 1) + '. ' + p; })));
      addFile('jobs/' + task.slug + '/TASK-CARD.md', 'the plan, and what "done" means (text from AI 1, saved by you).');
      next('AI 1 hands off to AI 2', handoff1);
    }
    function handoff1() {
      msg('ai a1', 'AI 1 (chat app)', ['Handing off with a short note block, so AI 2 starts exactly where I stopped. Save it as HANDOFF.md:'],
        'HANDOFF.md (short form)\nNext single action: ' + task.act + '\nWritten: 2026-11-18 4:05 PM CT (example), by AI 1\nWhat changed: jobs/' + task.slug + '/TASK-CARD.md (new)\nUnused OKs: none\nStill running: none\nOpen asks for the owner: none yet');
      addFile('HANDOFF.md', 'the short note between AIs and chats (text from AI 1, saved by you).');
      next('You carry the note to AI 2, then AI 2 builds', build2);
    }
    function build2() {
      msg('you', 'You', ['Carrying AI 1\'s handoff note to AI 2: paste it in, or point AI 2 at the saved file. The AIs do not message each other; you pass the note along.']);
      msg('ai a2', task.who[1], ['I read CORE.md and the handoff note. ' + task.built, 'Checked my own work first, and I still will not call it done: a second AI looks at it before anything goes out.']);
      addFile(task.bak, 'the copy, kept so every change can be undone.');
      next('AI 2 leaves a note for AI 3', note2);
    }
    function note2() {
      msg('ai a2', task.who[1], ['Telling the next AI what I changed, the same turn:'],
        'NOTE-FOR-AI-3.md\nWhat: changed ' + task.file + ' (copy: ' + task.bak + ')\nWhere: jobs/' + task.slug + '/\nWhy: ' + task.why + '\nHow to undo: put the copy back\nOpen: please review, read-only, and say PASS, WARN or FAIL');
      addFile('NOTE-FOR-AI-3.md', 'an inbox note for the reviewer.');
      next('You carry the note to AI 3, then AI 3 reviews', review);
    }
    function review() {
      msg('you', 'You', ['Carrying AI 2\'s note to AI 3: paste the saved note into AI 3, or add it to its project files.']);
      var m = msg('ai a3', task.who[2], [task.reviewNote + ' My verdict as a text block you can save:']);
      var p = h('p'); p.appendChild(h('span', 'dm-tag warn', 'WARN')); p.appendChild(document.createTextNode(task.warn)); m.appendChild(p);
      addFile('jobs/' + task.slug + '/VERDICT-reviewer.md', 'WARN: a pass, with every note listed (text from AI 3, saved by you).');
      decide();
    }
    function decide() {
      card('Your call (example)', ['The reviewer flagged one thing. Nothing has gone live. What would you like?'], null, [
        { label: 'Fix it first (recommended)', fn: fixFirst },
        { label: 'Go ahead as it is, with the note listed', ghost: true, fn: function () { readback(task.asIs, true); } },
        { label: 'Not now', ghost: true, fn: hold }
      ], 'Decision after the review');
    }
    function fixFirst() {
      if (task.flow === 'day') {
        msg('ai a2', task.who[1], [task.fix]);
        wait(function () {
          var m = msg('ai a1', task.reviewerWho, [task.recheck]);
          var p = h('p'); p.appendChild(h('span', 'dm-tag pass', 'PASS')); p.appendChild(document.createTextNode('The flagged note is handled.')); m.appendChild(p);
          files[files.length - 1] = { n: 'jobs/' + task.slug + '/VERDICT-reviewer.md', d: 'PASS (after the fix; text from AI 1, saved by you).' }; renderPanel();
          wait(function () { readback(task.fixed, false); });
        });
        return;
      }
      msg('ai a2', task.who[1], [task.fix]);
      wait(function () {
        var m = msg('ai a3', task.who[2], [task.recheck]);
        var p = h('p'); p.appendChild(h('span', 'dm-tag pass', 'PASS')); p.appendChild(document.createTextNode('The flagged note is handled.')); m.appendChild(p);
        files[files.length - 1] = { n: 'jobs/' + task.slug + '/VERDICT-reviewer.md', d: 'PASS (after the fix; text from AI 3, saved by you).' }; renderPanel();
        wait(function () { readback(task.fixed, false); });
      });
    }
    function readback(action, withWarn) {
      var paras = ['Before I act, I read it back: "I\'ll ' + action + '. OK?"', 'One yes covers this one thing, one time. The next risky step asks again. (This is a rule your AI is asked to follow, not a lock.)'];
      if (withWarn) paras.push('The reviewer\'s WARN note stays listed in my report.');
      card('Asks first (example)', paras, null, [
        { label: 'Yes, ' + action, fn: function () { approve(action, withWarn); } },
        { label: 'No, hold it', ghost: true, fn: hold }
      ], 'Ask before going live');
    }
    function approve(action, withWarn) {
      if (task.flow === 'day') {
        ledger.push({ words: task.words, action: action, ai: 'AI 2, AI 3', status: 'OK given' }); renderPanel();
        msg('ai a2', task.who[1], ['Wrote your OK into OK-LEDGER.md before acting. Doing the packing-list app, and nothing else. (Demo: nothing is really published.)']);
        msg('ai a3', task.who[2], ['I read the same OK. Doing the practice-timer app, and nothing else. (Demo: nothing is really published.)']);
        wait(function () {
          ledger[ledger.length - 1].status = 'USED UP'; renderPanel();
          msg('ai a2', task.who[1], ['Done: the packing-list app, for this one OK. Your OK is marked USED UP, and the rule is that it is not reused. (A rule your AI is asked to follow, not a lock.)']);
          msg('ai a3', task.who[2], ['Done: the practice-timer app, for the same one OK.']);
          wait(function () { followUp(withWarn); });
        });
        return;
      }
      ledger.push({ words: task.words, action: action, ai: 'AI 2', status: 'OK given' }); renderPanel();
      msg('ai a2', task.who[1], ['Wrote your OK into OK-LEDGER.md before acting. Doing exactly that one thing, and nothing else. (Demo: nothing is really published.)']);
      wait(function () {
        ledger[ledger.length - 1].status = 'USED UP'; renderPanel();
        msg('ai a2', task.who[1], ['Done: ' + action + '. Your OK is marked USED UP, and the rule is that it is not reused. (A rule your AI is asked to follow, not a lock.)']);
        wait(function () { followUp(withWarn); });
      });
    }
    function followUp(withWarn) {
      var n = task.next;
      card('A different thing, so a new ask (example)', [n.q].concat(n.draft ? [n.draft] : []), null, [
        { label: n.yes, fn: function () { finish(n.yesDone, withWarn); } },
        { label: n.no, ghost: true, fn: function () { finish(n.noDone, withWarn); } }
      ], 'New ask for a different action');
    }
    function finish(outcome, withWarn) {
      msg('ai a1', task.who[0], [outcome, 'Report: ' + (withWarn ? 'WARN, note listed above.' : 'PASS.') + ' Lessons for the crew: ' + task.lesson, 'Handoff block for the next chat. Save it over HANDOFF.md:'],
        'HANDOFF.md (short form)\nNext single action: none, the job is finished.\nWritten: 2026-11-18 4:50 PM CT (example), by AI 1\nWhat changed: ' + task.file + ' (copy kept: ' + task.bak + ')\nUnused OKs: none (the one OK is USED UP)\nStill running: none\nOpen asks for the owner: none');
      prog.textContent = 'Finished. Replay to try another task.';
      M.focusSoon(foot.querySelector('.btn'));
    }
    function hold() {
      msg('ai a1', task.who[0], ['Held. Nothing went live and no OK was logged. Here is the handoff block, so the next chat does not lose it. Save it over HANDOFF.md:'],
        'HANDOFF.md (short form)\nNext single action: ask the owner whether to ' + task.fixed + '.\nWritten: 2026-11-18 4:50 PM CT (example), by AI 1\nWhat changed: ' + task.file + ' (copy kept: ' + task.bak + ')\nUnused OKs: none\nStill running: none\nOpen asks for the owner: 1. ' + task.fixed + '? (recommend: yes, after the fix)');
      prog.textContent = 'Held, safely. Replay to try another path.';
      M.focusSoon(foot.querySelector('.btn'));
    }
  }
  build();
})();
