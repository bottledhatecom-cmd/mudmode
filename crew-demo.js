/* Crew demo: one task, three AIs, one rules file. Example text only. No network, no storage, no tracking. */
(function () {
  'use strict';
  var M = window.MMDemo, root = document.getElementById('demo-crew');
  if (!M || !root) return;
  var h = M.h, gen = 0;

  var TASKS = [
    { id: 'typo', name: 'Fix a typo on the About page', slug: 'about-typo', file: 'about.html', bak: 'about.html.bak-20261118-1610',
      plan: ['Copy about.html first, then fix the typo "recieve".', 'Check the page opens and nothing else changed.', 'Ask you before anything goes live.'],
      built: 'Copied about.html to about.html.bak-20261118-1610, then changed one word: "recieve" to "receive". The page opens and one line differs.',
      warn: 'The same typo is also on the contact page. It was not in the plan, so nobody touched it.',
      fix: 'Copied contact.html first, fixed the same word there, and added it to the note.',
      asIs: 'put the About page live', fixed: 'put the About and Contact pages live', words: 'Yes, just this one thing.',
      lesson: 'Search the whole site for a typo before fixing one page.',
      next: { q: 'Next, tell your followers? Your yes covered one thing; this is a different thing, so I ask again. I am asked to only write a draft, not to post.', draft: 'Draft post (not sent): "We fixed a typo on our About page. Thanks for reading."', yes: 'Keep the draft, I will post it myself', no: 'Skip', yesDone: 'Draft kept. You post it yourself.', noDone: 'Skipped. Nothing written.' } },
    { id: 'price', name: 'Add a shipping line to the home page', slug: 'home-shipping', file: 'index.html', bak: 'index.html.bak-20261118-1610',
      plan: ['Copy index.html first, then add one line: "Ships in 2 days".', 'Check the line against the other pages.', 'Ask you before anything goes live.'],
      built: 'Copied index.html to index.html.bak-20261118-1610, then added one line under the buy button. The page opens and one line differs.',
      warn: 'The new line says "Ships in 2 days", but the shipping page says 3 days.',
      fix: 'Matched the new line to the shipping page ("Ships in 3 days"), with a copy saved first.',
      asIs: 'put the home page live', fixed: 'put the home page live (with the 3-day line)', words: 'Yes, just this one thing.',
      lesson: 'Check a new claim against every page that mentions it.',
      next: { q: 'Next, email your customers about it? Your yes covered one thing; this is a different thing, so I ask again. I am asked to only write a draft, not to send.', draft: 'Draft email (not sent): "Good news: orders now show their ship time right on the home page."', yes: 'Keep the draft, I will send it myself', no: 'Skip', yesDone: 'Draft kept. You send it yourself.', noDone: 'Skipped. Nothing written.' } },
    { id: 'tidy', name: 'Tidy my project folder', slug: 'folder-tidy', file: 'drafts/', bak: 'old-drafts-backup/',
      plan: ['List the old drafts and copy them to a backup folder first.', 'Ask you before moving anything.', 'Do not delete; only move to the backup.'],
      built: 'Found 3 old drafts and copied them to old-drafts-backup/. Nothing is moved or deleted yet.',
      warn: 'One of the 3 files was edited yesterday, so it may not be old.',
      fix: 'Left that file out. 2 files are proposed to move; the backup copy of all 3 stays.',
      asIs: 'move 3 old files into old-drafts-backup/', fixed: 'move 2 old files into old-drafts-backup/', words: 'Yes, move just these.',
      lesson: 'Check the last-edited date before calling a file old.',
      next: { q: 'Next, free up space by deleting the backup folder? Deleting is a different thing, so I ask again. I would not do it on this yes.', draft: '', yes: 'Keep the backup', no: 'Ask me later', yesDone: 'Backup kept. Nothing deleted.', noDone: 'Noted. Nothing deleted, and I will ask again later.' } }
  ];

  function build() {
    var my = ++gen, task = null, files = [], ledger = [];
    root.textContent = '';
    root.appendChild(M.topBar('Try it: one task, three AIs, one rules file', 'Pick a sample task and click through. One AI plans, one builds, one reviews. They share the same rules file and pass short notes, and your AI stops to ask before anything risky.'));

    var pickWrap = h('fieldset', 'dm-pick');
    pickWrap.appendChild(h('legend', null, 'Pick a sample task'));
    var name = 'dm-crew-task-' + gen;
    TASKS.forEach(function (t, i) {
      var lab = h('label'); var inp = h('input', null, null, { type: 'radio', name: name, value: t.id });
      if (i === 0) inp.checked = true;
      inp.addEventListener('change', function () { pickWrap.querySelectorAll('label').forEach(function (l) { l.classList.toggle('on', l.firstChild.checked); }); });
      lab.appendChild(inp); lab.appendChild(document.createTextNode(t.name));
      if (i === 0) lab.className = 'on';
      pickWrap.appendChild(lab);
    });
    var startBtn = M.button('Start this task', '', function () {
      var sel = pickWrap.querySelector('input:checked');
      task = TASKS.filter(function (t) { return t.id === sel.value; })[0];
      pickWrap.hidden = true; started();
    });
    pickWrap.appendChild(startBtn);
    root.appendChild(pickWrap);

    var stage = h('div'); stage.hidden = true; root.appendChild(stage);
    var foot = h('div', 'dm-foot');
    foot.appendChild(M.button('Replay demo', 'ghost', function () { build(); M.focusSoon(root.querySelector('.dm-pick input')); }));
    foot.appendChild(h('p', 'fine', 'Each AI plays one part, and the builder is asked not to sign off its own work. Rules your AI is asked to follow, not locks; AI tools can still make mistakes, so keep checking their work. Results vary.'));
    root.appendChild(foot);

    var chat, pan, prog, nextWrap;
    function alive() { return my === gen; }

    function started() {
      stage.hidden = false;
      var lanes = h('div', 'dm-lanes');
      lanes.appendChild(h('span', 'dm-lane a1', 'AI 1 (chat app): plans, gives you text'));
      lanes.appendChild(h('span', 'dm-lane a2', 'AI 2 (code tool): builds, writes files'));
      lanes.appendChild(h('span', 'dm-lane a3', 'AI 3 (second chat app): reviews, gives you text'));
      stage.appendChild(lanes);
      stage.appendChild(h('p', 'dm-meta', 'A chat app gives you text to save or paste; a code tool can write the file itself. Here, AI 1 and AI 3 hand back text blocks and you save them (or paste them on), while AI 2 writes its own files.'));
      prog = h('p', 'dm-prog', ''); stage.appendChild(prog);
      var grid = h('div', 'dm-grid');
      chat = M.chatWindow('Task: ' + task.name);
      pan = M.panelWindow('Shared mudmode folder (example)');
      grid.appendChild(chat.win); grid.appendChild(pan.win);
      stage.appendChild(grid);
      nextWrap = h('div', 'dm-panel'); nextWrap.hidden = true; chat.win.appendChild(nextWrap);
      files.push({ n: 'CORE.md', d: 'the shared rules. The code tool reads the file; a chat app gets the rules as a pasted block.' });
      renderPanel();
      msg('ai a1', 'AI 1 (chat app)', ['New task: "' + task.name + '". I read the pasted rules block first. Here is my plan.']);
      step('AI 1 plans', function () { plan(); });
      plan();
    }

    function renderPanel() {
      pan.body.textContent = '';
      pan.body.appendChild(h('h4', null, 'Files'));
      var ul = h('ul');
      files.forEach(function (f, i) { var li = h('li', i === files.length - 1 && files.length > 1 ? 'new' : ''); li.appendChild(h('b', null, f.n)); li.appendChild(document.createTextNode(f.d ? ': ' + f.d : '')); ul.appendChild(li); });
      pan.body.appendChild(ul);
      pan.body.appendChild(h('h4', null, 'OK-LEDGER.md'));
      var tbl = h('table', 'dm-ledger');
      var cap = h('caption', 'dm-sr', 'OK ledger: one owner OK, one named action'); tbl.appendChild(cap);
      var thead = h('thead'), tr = h('tr');
      ['Owner\'s words', 'Exact action', 'AI', 'Status'].forEach(function (c) { tr.appendChild(h('th', null, c, { scope: 'col' })); });
      thead.appendChild(tr); tbl.appendChild(thead);
      var tb = h('tbody');
      if (!ledger.length) { var r0 = h('tr'); var c0 = h('td', null, 'Empty until your first OK.', { colspan: '4' }); r0.appendChild(c0); tb.appendChild(r0); }
      ledger.forEach(function (l) { var r = h('tr'); [l.words, l.action, l.ai, l.status].forEach(function (c) { r.appendChild(h('td', null, c)); }); tb.appendChild(r); });
      tbl.appendChild(tb); pan.body.appendChild(tbl);
    }
    function addFile(n, d) { files.push({ n: n, d: d }); renderPanel(); }

    function msg(cls, who, paras, pre) {
      var m = h('div', 'dm-msg ' + cls); m.appendChild(h('span', 'dm-who', who));
      paras.forEach(function (p) { m.appendChild(h('p', null, p)); });
      if (pre) m.appendChild(h('div', 'dm-pre', pre));
      chat.log.appendChild(m); M.scrollEnd(chat.log); return m;
    }
    var stepFn = null;
    function step(label, fn) { prog.textContent = 'Now: ' + label; }
    function wait(fn) { setTimeout(function () { if (alive()) fn(); }, M.reduced() ? 0 : 450); }
    function next(label, fn) {
      nextWrap.textContent = ''; nextWrap.hidden = false;
      var b = h('div', 'dm-btns'); var btn = M.button('Next: ' + label, '', function () { nextWrap.hidden = true; nextWrap.textContent = ''; prog.textContent = 'Now: ' + label; wait(fn); });
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
          c.classList.add('done'); btns.textContent = ''; btns.appendChild(h('p', 'dm-meta', 'You chose: ' + bd.label));
          wait(bd.fn);
        });
        if (i === 0) first = b; btns.appendChild(b);
      });
      c.appendChild(btns); chat.log.appendChild(c); M.scrollEnd(chat.log); M.focusSoon(first);
    }

    function plan() {
      var m = msg('ai a1', 'AI 1 (chat app)', ['Plan, as a task card block. Save it as jobs/' + task.slug + '/TASK-CARD.md:'].concat(task.plan.map(function (p, i) { return (i + 1) + '. ' + p; })));
      addFile('jobs/' + task.slug + '/TASK-CARD.md', 'the plan, and what "done" means (text from AI 1, saved by you).');
      next('AI 1 hands off to AI 2', handoff1);
    }
    function handoff1() {
      msg('ai a1', 'AI 1 (chat app)', ['Handing off with a short note block, so AI 2 starts exactly where I stopped. Save it as HANDOFF.md:'],
        'HANDOFF.md (short form)\nNext single action: AI 2 makes the change in a copy.\nWritten: 2026-11-18 4:05 PM CT (example), by AI 1\nWhat changed: jobs/' + task.slug + '/TASK-CARD.md (new)\nUnused OKs: none\nStill running: none\nOpen asks for the owner: none yet');
      addFile('HANDOFF.md', 'the short note between AIs and chats (text from AI 1, saved by you).');
      next('You carry the note to AI 2, then AI 2 builds', build2);
    }
    function build2() {
      msg('you', 'You', ['Carrying AI 1\'s handoff note to AI 2: paste it in, or point AI 2 at the saved file. The AIs do not message each other; you pass the note along.']);
      msg('ai a2', 'AI 2 (code tool)', ['I read CORE.md and the handoff note. ' + task.built, 'Checked my own work first, and I still will not call it done: a second AI looks at it before anything goes out.']);
      addFile(task.bak, 'the copy, kept so every change can be undone.');
      next('AI 2 leaves a note for AI 3', note2);
    }
    function note2() {
      msg('ai a2', 'AI 2 (code tool)', ['Telling the next AI what I changed, the same turn:'],
        'NOTE-FOR-AI-3.md\nWhat: changed ' + task.file + ' (copy: ' + task.bak + ')\nWhere: jobs/' + task.slug + '/\nWhy: the task card\nHow to undo: put the copy back\nOpen: please review, read-only, and say PASS, WARN or FAIL');
      addFile('NOTE-FOR-AI-3.md', 'an inbox note for the reviewer.');
      next('You carry the note to AI 3, then AI 3 reviews', review);
    }
    function review() {
      msg('you', 'You', ['Carrying AI 2\'s note to AI 3: paste the saved note into AI 3, or add it to its project files.']);
      var m = msg('ai a3', 'AI 3 (second chat)', ['I read the pasted rules block and the note you pasted. I am asked to read only, not change anything. My verdict as a text block you can save:']);
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
      msg('ai a2', 'AI 2 (code tool)', [task.fix]);
      wait(function () {
        var m = msg('ai a3', 'AI 3 (second chat)', ['Reviewing again, read-only:']);
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
      ledger.push({ words: task.words, action: action, ai: 'AI 2', status: 'OK given' }); renderPanel();
      msg('ai a2', 'AI 2 (code tool)', ['Wrote your OK into OK-LEDGER.md before acting. Doing exactly that one thing, and nothing else. (Demo: nothing is really published.)']);
      wait(function () {
        ledger[ledger.length - 1].status = 'USED UP'; renderPanel();
        msg('ai a2', 'AI 2 (code tool)', ['Done: ' + action + '. Your OK is marked USED UP, and the rule is that it is not reused. (A rule your AI is asked to follow, not a lock.)']);
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
      msg('ai a1', 'AI 1 (chat app)', [outcome, 'Report: ' + (withWarn ? 'WARN, note listed above.' : 'PASS.') + ' Lessons for the crew: ' + task.lesson, 'Handoff block for the next chat. Save it over HANDOFF.md:'],
        'HANDOFF.md (short form)\nNext single action: none, the job is finished.\nWritten: 2026-11-18 4:50 PM CT (example), by AI 1\nWhat changed: ' + task.file + ' (copy kept: ' + task.bak + ')\nUnused OKs: none (the one OK is USED UP)\nStill running: none\nOpen asks for the owner: none');
      prog.textContent = 'Finished. Replay to try another task.';
      M.focusSoon(foot.querySelector('.btn'));
    }
    function hold() {
      msg('ai a1', 'AI 1 (chat app)', ['Held. Nothing went live and no OK was logged. Here is the handoff block, so the next chat does not lose it. Save it over HANDOFF.md:'],
        'HANDOFF.md (short form)\nNext single action: ask the owner whether to ' + task.fixed + '.\nWritten: 2026-11-18 4:50 PM CT (example), by AI 1\nWhat changed: ' + task.file + ' (copy kept: ' + task.bak + ')\nUnused OKs: none\nStill running: none\nOpen asks for the owner: 1. ' + task.fixed + '? (recommend: yes, after the fix)');
      prog.textContent = 'Held, safely. Replay to try another path.';
      M.focusSoon(foot.querySelector('.btn'));
    }
  }
  build();
})();
