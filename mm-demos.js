/* Shared helpers for the interactive demos. No network, no storage, no tracking. */
(function () {
  'use strict';
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function h(tag, cls, text, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function reduced() { return !!(mq && mq.matches); }
  function focusSoon(el) {
    if (!el) return;
    setTimeout(function () { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }, 0);
  }
  function button(label, cls, onClick) {
    var b = h('button', 'btn ' + (cls || ''), label, { type: 'button' });
    b.addEventListener('click', onClick);
    return b;
  }
  /* Chat window with a polite live log. */
  function chatWindow(titleText) {
    var win = h('div', 'dm-win');
    var tb = h('div', 'dm-tb');
    var dots = h('span', 'dots', null, { 'aria-hidden': 'true' });
    dots.appendChild(h('i')); dots.appendChild(h('i')); dots.appendChild(h('i'));
    tb.appendChild(dots);
    var b = h('b', null, titleText); tb.appendChild(b);
    win.appendChild(tb);
    var log = h('div', 'dm-log', null, { role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', tabindex: '0', 'aria-label': titleText });
    win.appendChild(log);
    return { win: win, log: log };
  }
  function scrollEnd(log) { log.scrollTop = log.scrollHeight; }
  function panelWindow(titleText) {
    var win = h('div', 'dm-win');
    var tb = h('div', 'dm-tb');
    var dots = h('span', 'dots', null, { 'aria-hidden': 'true' });
    dots.appendChild(h('i')); dots.appendChild(h('i')); dots.appendChild(h('i'));
    tb.appendChild(dots); tb.appendChild(h('b', null, titleText));
    win.appendChild(tb);
    var body = h('div', 'dm-panel');
    win.appendChild(body);
    return { win: win, body: body };
  }
  function topBar(title, lead) {
    var frag = document.createDocumentFragment();
    var top = h('div', 'dm-top');
    top.appendChild(h('span', 'dm-badge', 'Demo'));
    top.appendChild(h('span', 'dm-note', 'Example text only. Nothing here is real, saved, sent or tracked.'));
    frag.appendChild(top);
    frag.appendChild(h('h3', 'dm-title', title));
    if (lead) frag.appendChild(h('p', 'dm-lead', lead));
    return frag;
  }
  window.MMDemo = { h: h, reduced: reduced, focusSoon: focusSoon, button: button, chatWindow: chatWindow, panelWindow: panelWindow, scrollEnd: scrollEnd, topBar: topBar };
})();
