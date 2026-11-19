/* Lessons demo: a pretend job goes wrong, the AIs write the lesson, a different AI reads it next day. Example text only. No network, no storage, no tracking. */
(function () {
  'use strict';
  var M = window.MMDemo, root = document.getElementById('demo-lessons');
  if (!M || !root) return;
  var h = M.h, gen = 0;

  var LESSONS = [
    { date: '2026-11-18 4:10 PM CT (example site job)', by: 'AI 2 (code tool)', cls: 'a2', head: 'Copy a file before you change it.',
      detail: 'AI 2 changed page.html with no copy first, so a bad edit could not be undone in one step. How it is checked: AIs are asked to back up before any change, and the reviewer checks for the copy.',
      attr: 'Written by AI 2 (code tool) at handoff, not typed by you.',
      cardBy: 'written by AI 2 (code tool) at handoff',
      share: { lesson: 'A bad edit is easy to undo only if a copy exists.', fix: 'Save a dated copy of a file before any change.', result: 'A reviewer caught a change made with no copy, and the lesson was added.', confidence: 'medium' },
      codeUse: 'Read LESSONS.md: back up before any change. Copied page.html first (page.html.bak-20261119-0905, example).',
      chatUse: 'Read the pasted LESSONS.md: back up before any change. I cannot copy your files, so please save a copy of page.html first, then use the text I hand back.' },
    { date: '2026-11-18 4:25 PM CT (example site job)', by: 'AI 3 (reviewer)', cls: 'a3', head: 'Check a phone-size screen before saying done.',
      detail: 'The menu ran off the edge on a narrow phone. How it is checked: the reviewer is asked to run a width check before every report.',
      attr: 'From AI 3\'s review, saved by AI 2 at handoff, not typed by you.',
      cardBy: 'from AI 3\'s review, saved by AI 2 at handoff',
      share: { lesson: 'A page can look fine on a big screen and break on a phone.', fix: 'Check a phone-size screen before saying done.', result: 'A reviewer caught a menu that ran off the edge before it went live.', confidence: 'medium' },
      codeUse: 'Read LESSONS.md: check a phone-size screen before saying done. Checked a narrow screen: the footer link fits.',
      chatUse: 'Read the pasted LESSONS.md: check a phone-size screen before saying done. I kept the footer link short, and I ask you to look at a phone-size view before you call it done.' }
  ];

  function build() {
    var my = ++gen;
    root.textContent = '';
    var book = [], shared = [], statusEl;
    root.appendChild(M.topBar('Try it: how a chat can end with lessons', 'Watch one pretend job go wrong. The AIs are asked to write the lesson at handoff, so you type nothing: the reviewer hands its line back as text, and the code tool saves the lines into the lessons book. Next day, a different AI is asked to read the same book first. In the real kit you can ask your AI to change or retire any line. The buttons here just let you try deciding.'));

    var grid = h('div', 'dm-grid');
    var chat = M.chatWindow('Crew chat (example)');
    var ctl = h('div', 'dm-btns');
    var ctlWrap = h('div', 'dm-panel'); ctlWrap.appendChild(ctl);
    chat.win.appendChild(ctlWrap);
    var pan = M.panelWindow('Your lessons book (example)');
    grid.appendChild(chat.win); grid.appendChild(pan.win);
    root.appendChild(grid);

    statusEl = h('p', 'dm-sr', '', { role: 'status', 'aria-live': 'polite' });
    root.appendChild(statusEl);

    var foot = h('div', 'dm-foot');
    foot.appendChild(M.button('Replay demo', 'ghost', function () { build(); M.focusSoon(root.querySelector('.dm-btns .btn')); }));
    foot.appendChild(h('p', 'fine', 'Rules your AIs are asked to follow, not locks. Code tools read the shared folder; a chat app only knows what you paste in. Nothing is pre-ticked, nothing is sent, and nothing leaves this page. Results vary.'));
    root.appendChild(foot);

    function announce(t) { statusEl.textContent = ''; setTimeout(function () { statusEl.textContent = t; }, 30); }
    function active() { return book.filter(function (b) { return !b.retired; }); }
    function retiredCount() { return book.length - active().length; }

    function renderPanel() {
      pan.body.textContent = '';
      pan.body.appendChild(h('h4', null, 'LESSONS.md'));
      var act = active(), rc = retiredCount();
      pan.body.appendChild(h('p', 'dm-meta', act.length + (act.length === 1 ? ' line' : ' lines') + (rc ? ' (' + rc + ' retired by you)' : '') + '. The book is capped at about 80 lines, and it is yours.'));
      var ul = h('ul');
      if (!act.length) ul.appendChild(h('li', 'dm-empty', book.length ? 'Empty now. You retired every line.' : 'Empty so far. Lessons the AIs write at handoff show up here.'));
      act.forEach(function (b, i) {
        var li = h('li', b.fresh ? 'new' : '');
        li.appendChild(document.createTextNode(b.L.date + ': '));
        li.appendChild(b.edited ? document.createTextNode(b.body) : h('b', null, b.L.head));
        if (!b.edited) li.appendChild(document.createTextNode(' ' + b.L.detail));
        li.appendChild(h('span', 'dm-meta', ' ' + b.L.attr));
        ul.appendChild(li);
      });
      pan.body.appendChild(ul);
      pan.body.appendChild(h('h4', null, 'SHARED-LESSONS.md'));
      var ul2 = h('ul');
      if (!shared.length) ul2.appendChild(h('li', 'dm-empty', 'Nothing shared. Sharing is opt-in, and you send it yourself.'));
      shared.forEach(function (s) { ul2.appendChild(h('li', 'new', 'Drafted: "' + s.share.fix + '" Sent by you: not yet (this demo never sends).')); });
      pan.body.appendChild(ul2);
    }
    renderPanel();

    function alive() { return my === gen; }
    function msg(cls, who, paras) {
      var m = h('div', 'dm-msg ' + cls);
      if (who) m.appendChild(h('span', 'dm-who', who));
      paras.forEach(function (p) { m.appendChild(h('p', null, p)); });
      chat.log.appendChild(m); M.scrollEnd(chat.log);
      return m;
    }
    function say(who, cls, paras, next) {
      var t = h('div', 'dm-typing', who + ' is writing...'); t.setAttribute('aria-hidden', 'true');
      chat.log.appendChild(t); M.scrollEnd(chat.log);
      setTimeout(function () {
        if (!alive()) return;
        t.remove(); var m = msg('ai ' + cls, who, paras); if (next) next(m);
      }, M.reduced() ? 0 : 650);
    }
    function note(text) { var n = h('p', 'dm-typing', text); chat.log.appendChild(n); M.scrollEnd(chat.log); }
    function pre(m, text) { m.appendChild(h('div', 'dm-pre', text)); M.scrollEnd(chat.log); }
    function lineText(b) { return '- ' + (b.edited ? b.body : b.L.date + ': ' + b.L.head + ' ' + b.L.detail); }
    function addTag(m, kind, label, text) {
      var p = h('p'); p.appendChild(h('span', 'dm-tag ' + kind, label)); p.appendChild(document.createTextNode(text)); m.appendChild(p); M.scrollEnd(chat.log);
    }

    /* Step 3: the user keeps, edits or retires each line the AIs wrote. */
    function offerCard(i) {
      var L = LESSONS[i], entry = book[i];
      var card = h('div', 'dm-card', null, { role: 'group', 'aria-label': 'Line ' + (i + 1) + ' of ' + LESSONS.length });
      card.appendChild(h('h4', null, 'Line ' + (i + 1) + ' of ' + LESSONS.length + ', ' + L.cardBy + ' (example)'));
      var q = h('p', 'dm-quote'); q.appendChild(document.createTextNode(L.date + ': ')); q.appendChild(h('b', null, L.head)); q.appendChild(document.createTextNode(' ' + L.detail));
      card.appendChild(q);
      var chkId = 'dm-share-' + gen + '-' + i;
      var lab = h('label', 'dm-chk', null, { 'for': chkId });
      var chk = h('input', null, null, { type: 'checkbox', id: chkId });
      chk.checked = false;
      lab.appendChild(chk);
      lab.appendChild(h('span', null, 'Also draft this one to share with other mudmode users (opt-in, 18+). Only used if you keep it. You send it yourself.'));
      card.appendChild(lab);
      var btns = h('div', 'dm-btns');
      var keep = M.button('Keep this line', '', function () { resolve('keep'); });
      var edit = M.button('Edit', 'ghost', function () { openEdit(); });
      var retire = M.button('Retire this line', 'ghost', function () { resolve('retire'); });
      btns.appendChild(keep); btns.appendChild(edit); btns.appendChild(retire);
      card.appendChild(btns);
      var editBox = null;
      function lock(label) {
        card.classList.add('done');
        chk.disabled = true;
        btns.textContent = '';
        btns.appendChild(h('p', 'dm-meta', label));
        if (editBox) editBox.remove();
      }
      function openEdit() {
        if (editBox) { editBox.querySelector('textarea').focus(); return; }
        editBox = h('div');
        var tid = 'dm-edit-' + gen + '-' + i;
        editBox.appendChild(h('label', 'dm-meta', 'Change the wording, then keep it:', { 'for': tid }));
        var ta = h('textarea', 'dm-edit', null, { id: tid, maxlength: '300' });
        ta.value = L.head + ' ' + L.detail;
        editBox.appendChild(ta);
        var eb = h('div', 'dm-btns');
        eb.appendChild(M.button('Save and keep', '', function () { resolve('keep', ta.value.replace(/\s+/g, ' ').trim() || L.head); }));
        eb.appendChild(M.button('Cancel', 'ghost', function () { editBox.remove(); editBox = null; M.focusSoon(edit); }));
        editBox.appendChild(eb);
        card.insertBefore(editBox, btns);
        ta.focus();
      }
      function resolve(kind, editedText) {
        var wantShare = chk.checked;
        entry.fresh = false;
        if (kind === 'retire') {
          entry.retired = true;
          lock('You chose: Retire. The line is out of the book, so the next AI will not read it.' + (wantShare ? ' (Retired, so nothing to share.)' : ''));
          renderPanel();
          announce('Line retired. Your lessons book now has ' + active().length + (active().length === 1 ? ' line.' : ' lines.'));
          afterCard(i);
          return;
        }
        if (editedText) { entry.body = editedText; entry.edited = true; }
        lock('You chose: ' + (editedText ? 'Edit, then keep.' : 'Keep this line.'));
        renderPanel();
        announce('Kept. Your lessons book has ' + active().length + (active().length === 1 ? ' line.' : ' lines.'));
        if (wantShare) offerShare(i, function () { afterCard(i); });
        else afterCard(i);
      }
      chat.log.appendChild(card); M.scrollEnd(chat.log);
      M.focusSoon(keep);
    }

    function offerShare(i, done) {
      var L = LESSONS[i];
      say('AI', '', ['You ticked share, so I drafted it in the fixed form with private details left out. Nothing is sent, and I am asked never to post for you.',
        'Before you could send it, I would ask: are you 18 or older, and do you agree to the mudmode lesson terms?'], function () {
        var card = h('div', 'dm-card', null, { role: 'group', 'aria-label': 'Sharing question' });
        card.appendChild(h('h4', null, 'Your call (example)'));
        var p = h('p'); p.appendChild(document.createTextNode('Are you 18 or older, and do you agree to the '));
        var a = h('a', 'hl', 'mudmode lesson terms', { href: 'lesson-terms.html', target: '_blank', rel: 'noopener' });
        p.appendChild(a); p.appendChild(document.createTextNode('?')); card.appendChild(p);
        var btns = h('div', 'dm-btns');
        var yes = M.button('Yes, I am 18+ and I agree', '', function () {
          card.classList.add('done'); btns.textContent = ''; btns.appendChild(h('p', 'dm-meta', 'You chose: Yes (your own words).'));
          shared.push(L); renderPanel();
          say('AI', '', ['Here is the draft. You would post it yourself as a comment in the lessons thread on GitHub (it needs a GitHub account, and the post is public under your GitHub name). I am asked never to post it.'], function (m) {
            m.appendChild(h('div', 'dm-pre', 'I agree to the mudmode lesson terms (v3) and I\'m 18 or older.\nDon\'t credit me\nlesson: ' + L.share.lesson + '\nfix: ' + L.share.fix + '\nresult: ' + L.share.result + '\nconfidence: ' + L.share.confidence));
            M.scrollEnd(chat.log); done();
          });
        });
        var no = M.button('Not now', 'ghost', function () {
          card.classList.add('done'); btns.textContent = ''; btns.appendChild(h('p', 'dm-meta', 'You chose: Not now. No draft is kept for sending.'));
          done();
        });
        btns.appendChild(yes); btns.appendChild(no); card.appendChild(btns);
        chat.log.appendChild(card); M.scrollEnd(chat.log); M.focusSoon(yes);
      });
    }

    function afterCard(i) {
      if (i + 1 < LESSONS.length) {
        setTimeout(function () { if (alive()) offerCard(i + 1); }, M.reduced() ? 0 : 250);
        return;
      }
      setTimeout(function () { if (alive()) pickNextAI(); }, M.reduced() ? 0 : 250);
    }

    /* Step 4: the crew effect. A different AI reads the same book at the start of the next job. */
    function pickNextAI() {
      note('Next day (example). Job 2 goes to a different AI that never saw job 1.');
      var card = h('div', 'dm-card', null, { role: 'group', 'aria-label': 'Pick the next AI' });
      card.appendChild(h('h4', null, 'Job 2: who picks it up? (example)'));
      card.appendChild(h('p', null, 'AI 4 is new here. A code tool reads the shared folder, so it can read LESSONS.md itself. A chat app only knows what you paste in, so you paste the book into the chat.'));
      var btns = h('div', 'dm-btns');
      function go(kind, label) {
        card.classList.add('done'); btns.textContent = ''; btns.appendChild(h('p', 'dm-meta', 'You chose: ' + label + '.'));
        runJob2(kind);
      }
      var b1 = M.button('AI 4 is a code tool', '', function () { go('code', 'AI 4 is a code tool'); });
      var b2 = M.button('AI 4 is a new chat app', 'ghost', function () { go('chat', 'AI 4 is a new chat app'); });
      btns.appendChild(b1); btns.appendChild(b2); card.appendChild(btns);
      chat.log.appendChild(card); M.scrollEnd(chat.log); M.focusSoon(b1);
    }

    function runJob2(kind) {
      var isCode = kind === 'code';
      var who = isCode ? 'AI 4 (code tool)' : 'AI 4 (new chat app)';
      var act = active();
      msg('you', null, ['Job 2 (example, 2026-11-19 9:05 AM CT): add a Contact link to the footer of page.html.']);
      function readStep() {
        var paras = [];
        var cnt = act.length ? ': ' + act.length + (act.length === 1 ? ' line.' : ' lines.') : ', and it is empty, so I have no lessons to apply this time.';
        if (isCode) paras.push('I am asked to read LESSONS.md before any work, so I did, from the shared folder' + cnt);
        else paras.push('I read the book you pasted first, as I am asked to' + cnt);
        say(who, '', paras, function (m) {
          if (act.length) pre(m, act.map(lineText).join('\n'));
          setTimeout(function () { if (alive()) useStep(); }, M.reduced() ? 0 : 300);
        });
      }
      function useStep() {
        var paras = [];
        book.forEach(function (b, i) {
          var L = LESSONS[i];
          if (b.retired) paras.push('No line about "' + L.head.replace(/\.$/, '') + '" is in the book now, because you retired it, so I was not asked to do that this time.');
          else if (b.edited) paras.push('Your edited line: "' + b.body + '" I take it as written.');
          else paras.push(isCode ? L.codeUse : L.chatUse);
        });
        say(who, '', paras, function () { reportStep(); });
      }
      function reportStep() {
        var n = act.length;
        var rep = 'Done: the Contact link is added to the footer' + (isCode ? '.' : ', as text for you to save.') + ' Report: ready for review.';
        var last = 'Lessons for the crew: I used ' + n + (n === 1 ? ' line' : ' lines') + ' from the book. Nothing new to add this time.';
        say(who, '', [rep, last, 'Every report ends this way. A new lesson would go into the book at handoff, with how it is checked.'], function () {
          announce('Demo finished. A different AI read the lessons book first and ended its report with Lessons for the crew.');
          M.focusSoon(foot.querySelector('.btn'));
        });
      }
      if (!isCode) {
        var m = msg('you', null, ['I paste LESSONS.md into the new chat, because a chat app cannot open my folder:']);
        pre(m, act.length ? act.map(lineText).join('\n') : '(empty)');
      }
      setTimeout(function () { if (alive()) readStep(); }, M.reduced() ? 0 : 200);
    }

    /* Steps 1 and 2: a mistake happens, then the reviewer hands a lesson line back and the code tool saves the lines. */
    function runJob1() {
      msg('you', null, ['Job 1 (example, 2026-11-18): add a Contact link to the menu on page.html.']);
      say('AI 2 (code tool)', 'a2', ['I changed page.html and added the Contact link to the menu. Done, ready for review.', 'Lessons for the crew: nothing new yet.'], function () {
        say('AI 3 (reviewer)', 'a3', ['Reviewing, read-only. I am asked to look, not change anything. Two problems:'], function (m) {
          addTag(m, 'fail', 'FAIL', 'There is no copy of page.html from before the change, so a bad edit could not be undone in one step.');
          addTag(m, 'fail', 'FAIL', 'On a narrow phone screen, the menu runs off the edge.');
          m.appendChild(h('p', null, 'Sending it back to AI 2.'));
          M.scrollEnd(chat.log);
          say('AI 2 (code tool)', 'a2', ['Fixed: the menu now fits a narrow screen. I should have made a copy before changing page.html, and I did not. I am asked to write that down at handoff.'], function () {
            say('AI 3 (reviewer)', 'a3', ['Checked again, read-only: the menu fits a narrow screen now. PASS, with the missing copy listed in my report. I am asked to hand back a lesson line for what I caught, too.'], function () { handoff(); });
          });
        });
      });
    }

    function handoff() {
      note('Handoff. Nobody types a lesson here: AI 2 (the code tool) is asked to write its own line into LESSONS.md, and to save the reviewer\'s lesson line as well.');
      var e0 = { L: LESSONS[0], fresh: true };
      say('AI 2 (code tool)', 'a2', ['I made the mistake, so I wrote this line into LESSONS.md myself, with how it is checked:'], function (m) {
        pre(m, lineText(e0));
        book.push(e0); renderPanel(); announce('AI 2 added a line to your lessons book.');
        m.appendChild(h('p', null, 'Lessons for the crew: 1 new line (copy a file first).'));
        M.scrollEnd(chat.log);
        var e1 = { L: LESSONS[1], fresh: true };
        say('AI 3 (reviewer)', 'a3', ['I am read-only, so I cannot write into LESSONS.md. Here is the lesson line for what I caught, with how it is checked. I am handing it back as text for AI 2 to save:'], function (m2) {
          pre(m2, lineText(e1));
          m2.appendChild(h('p', null, 'Lessons for the crew: 1 new line handed back for AI 2 to save (check a phone-size screen).'));
          M.scrollEnd(chat.log);
          say('AI 2 (code tool)', 'a2', ['I saved AI 3\'s lesson line into LESSONS.md. It is from AI 3\'s review, saved by me at handoff:'], function (m3) {
            pre(m3, lineText(e1));
            e0.fresh = false;
            book.push(e1); renderPanel(); announce('AI 2 saved AI 3\'s review line into your lessons book. It now has 2 lines.');
            m3.appendChild(h('p', null, 'Lessons for the crew: 1 new line saved from AI 3\'s review (check a phone-size screen).'));
            M.scrollEnd(chat.log);
            note('Your call: the book is yours. Keep, edit or retire each line. Sharing outside your crew is off unless you tick it (18+).');
            setTimeout(function () { if (alive()) offerCard(0); }, M.reduced() ? 0 : 300);
          });
        });
      });
    }

    var startBtn = M.button('Start job 1', '', function () {
      ctlWrap.remove();
      runJob1();
    });
    ctl.appendChild(startBtn);
    chat.log.appendChild(h('p', 'dm-typing', 'An example crew: AI 2 is a code tool that builds, AI 3 reviews. Press the button to start a pretend job.'));
  }
  build();
})();
