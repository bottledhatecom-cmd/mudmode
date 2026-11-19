/* Lessons demo: a pretend chat ending. Example text only. No network, no storage, no tracking. */
(function () {
  'use strict';
  var M = window.MMDemo, root = document.getElementById('demo-lessons');
  if (!M || !root) return;
  var h = M.h, gen = 0;

  var LESSONS = [
    { date: '2026-11-18 4:10 PM CT (example site job)', head: 'Check a phone-size screen before saying done.',
      detail: 'The menu ran off the edge on a narrow phone. Enforced: a width check runs before every report.',
      share: { lesson: 'A page can look fine on a big screen and break on a phone.', fix: 'Check a phone-size screen before saying done.', result: 'Caught a menu that ran off the edge before it went live.', confidence: 'medium' } },
    { date: '2026-11-18 4:25 PM CT (example site job)', head: 'Copy a file before you change it.',
      detail: 'A saved copy (page.html.bak-20261118-1625) let us undo a bad edit in one step. Enforced: back up before any change.',
      share: { lesson: 'A bad edit is easy to undo only if a copy exists.', fix: 'Save a dated copy of a file before any change.', result: 'One bad edit was undone in a single step.', confidence: 'high' } }
  ];

  function build() {
    var my = ++gen;
    root.textContent = '';
    var book = [], shared = [], statusEl;
    root.appendChild(M.topBar('Try it: how a chat can end with lessons', 'Pretend you are ending a chat with your AI. Say "handoff" and see what a lessons book looks like. In the real kit your AI adds lessons itself on handoff, and you can ask your AI to change or retire any line. The buttons here just let you try deciding.'));

    var grid = h('div', 'dm-grid');
    var chat = M.chatWindow('Chat (example)');
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
    foot.appendChild(h('p', 'fine', 'Rules your AI is asked to follow, not locks. Nothing is pre-ticked, nothing is sent, and nothing leaves this page. Results vary.'));
    root.appendChild(foot);

    function announce(t) { statusEl.textContent = ''; setTimeout(function () { statusEl.textContent = t; }, 30); }

    function renderPanel() {
      pan.body.textContent = '';
      pan.body.appendChild(h('h4', null, 'LESSONS.md'));
      pan.body.appendChild(h('p', 'dm-meta', book.length + ' kept. The book is capped at about 80 lines, and it is yours.'));
      var ul = h('ul');
      if (!book.length) ul.appendChild(h('li', 'dm-empty', 'Empty so far. Lessons you keep in this demo show up here.'));
      book.forEach(function (b, i) {
        var li = h('li', i === book.length - 1 ? 'new' : '');
        li.appendChild(document.createTextNode(b.date + ': '));
        li.appendChild(b.edited ? document.createTextNode(b.body) : h('b', null, b.head));
        if (!b.edited) li.appendChild(document.createTextNode(' ' + b.detail));
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
    function aiSay(paras, next) {
      var t = h('div', 'dm-typing', 'AI is writing...'); t.setAttribute('aria-hidden', 'true');
      chat.log.appendChild(t); M.scrollEnd(chat.log);
      setTimeout(function () {
        if (!alive()) return;
        t.remove(); var m = msg('ai', 'AI', paras); if (next) next(m);
      }, M.reduced() ? 0 : 650);
    }

    function offerCard(i) {
      var L = LESSONS[i];
      var card = h('div', 'dm-card', null, { role: 'group', 'aria-label': 'Lesson ' + (i + 1) + ' of ' + LESSONS.length });
      card.appendChild(h('h4', null, 'Lesson ' + (i + 1) + ' of ' + LESSONS.length + ' (example)'));
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
      var keep = M.button('Keep in my lessons book', '', function () { resolve('keep'); });
      var edit = M.button('Edit', 'ghost', function () { openEdit(); });
      var skip = M.button('Skip', 'ghost', function () { resolve('skip'); });
      btns.appendChild(keep); btns.appendChild(edit); btns.appendChild(skip);
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
        if (kind === 'skip') {
          lock('You chose: Skip. Nothing was added.' + (wantShare ? ' (Skipped, so nothing to share.)' : ''));
                    afterCard(i);
          return;
        }
        var entry = { date: L.date, head: L.head, detail: L.detail, body: editedText, edited: !!editedText };
        book.push(entry);
        lock('You chose: ' + (editedText ? 'Edit, then keep.' : 'Keep in my lessons book.'));
        renderPanel();
        announce('Your lessons book now has ' + book.length + (book.length === 1 ? ' lesson.' : ' lessons.'));
        if (wantShare) offerShare(i, function () { afterCard(i); });
        else afterCard(i);
      }
      chat.log.appendChild(card); M.scrollEnd(chat.log);
      M.focusSoon(keep);
    }

    function offerShare(i, done) {
      var L = LESSONS[i];
      aiSay(['You ticked share, so I drafted it in the fixed form with private details left out. Nothing is sent, and I am asked never to post for you.',
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
          aiSay(['Here is the draft. You would post it yourself as a comment in the lessons thread on GitHub (it needs a GitHub account, and the post is public under your GitHub name). I am asked never to post it.'], function (m) {
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
      aiSay(['Done. Your lessons book has ' + book.length + (book.length === 1 ? ' lesson' : ' lessons') + ' from today. Lessons for the crew: ' + (book.length ? book.length + ' kept.' : 'none.'),
        'Next chat, I read the book first. Say "handoff" any time, or "mudmode status" to see where things stand.'], function () { M.focusSoon(foot.querySelector('.btn')); });
    }

    var startBtn = M.button('Say "handoff"', '', function () {
      ctlWrap.remove();
      msg('you', null, ['handoff']);
      aiSay(['Handoff note written. In the real kit, I would add any lessons to your book myself, and you could ask your AI to change or retire any line. In this demo, you try deciding on ' + LESSONS.length + ' example lessons, one at a time.'], function () { offerCard(0); });
    });
    ctl.appendChild(startBtn);
    chat.log.appendChild(h('p', 'dm-typing', 'End of an example chat. Your AI has just finished a job.'));
  }
  build();
})();
