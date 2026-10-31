/* mudmode: Full Kit checkout dialog.
   Opens Gumroad's product page in our own <dialog> iframe. No Gumroad script runs on our pages.
   The link stays a plain same-tab link when JS is off, when <dialog> is not supported,
   or when the product frame has not loaded after 8 seconds. No innerHTML. */
(function () {
  'use strict';
  // L5: refuse to run inside someone else's frame (meta CSP cannot set frame-ancestors).
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location = window.self.location.href; } catch (e) { /* sandboxed framer: stay hidden */ }
    return;
  }
  var ORIGIN = 'https://bottledhate.gumroad.com';
  var TIMEOUT_MS = 8000;
  if (typeof HTMLDialogElement !== 'function' || !HTMLDialogElement.prototype.showModal) return;

  var dlg = null, frame = null, closeBtn = null, opener = null, timer = 0, loaded = false;

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'gd-dialog';
    dlg.setAttribute('aria-label', 'Gumroad: mudmode Full Kit');
    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'gd-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u00d7';
    frame = document.createElement('iframe');
    frame.className = 'gd-frame';
    frame.title = 'Gumroad product page: mudmode Full Kit';
    frame.setAttribute('referrerpolicy', 'no-referrer');
    var status = document.createElement('p');
    status.className = 'gd-status';
    status.setAttribute('role', 'status');
    status.textContent = 'Loading Gumroad\u2026';
    // focus trap: Tab past the Gumroad frame comes back to Close; Shift+Tab before Close goes to the frame.
    var startTrap = document.createElement('span'), endTrap = document.createElement('span');
    startTrap.tabIndex = 0; endTrap.tabIndex = 0;
    startTrap.className = endTrap.className = 'gd-trap';
    startTrap.addEventListener('focus', function () { frame.focus(); });
    endTrap.addEventListener('focus', function () { closeBtn.focus(); });
    dlg.appendChild(startTrap);
    dlg.appendChild(closeBtn);
    dlg.appendChild(status);
    dlg.appendChild(frame);
    dlg.appendChild(endTrap);
    document.body.appendChild(dlg);

    closeBtn.addEventListener('click', function () { dlg.close(); });
    // click on the backdrop (outside the dialog box) closes it
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () {
      clearTimeout(timer);
      frame.removeAttribute('src');
      dlg.classList.remove('gd-ready');
      if (opener && document.contains(opener)) opener.focus();
      opener = null;
    });
    window.addEventListener('message', function (e) {
      if (!frame || e.source !== frame.contentWindow || e.origin !== ORIGIN) return;
      var d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'loaded') {
        loaded = true; clearTimeout(timer); dlg.classList.add('gd-ready');
      } else if (d.type === 'height' && typeof d.height === 'number' && isFinite(d.height)) {
        frame.style.height = Math.max(200, Math.min(d.height, 20000)) + 'px';
      }
    });
  }

  function productUrl(href) {
    var u;
    try { u = new URL(href); } catch (e) { return null; }
    if (u.origin !== ORIGIN || u.pathname.indexOf('/l/') !== 0) return null;
    // L1: only our page's origin + path go to Gumroad; never the query or the #step / AI pick.
    u.search = '';
    u.hash = '';
    u.searchParams.set('referrer', location.origin + location.pathname);
    u.searchParams.set('overlay', 'true');
    return u.toString();
  }

  function open(a, e) {
    var src = productUrl(a.href);
    if (!src) return; // not a Gumroad product link: let it navigate normally
    e.preventDefault();
    if (!dlg) build();
    // Every buy button acts the same; the dialog names the product the tapped button names (data-gd-name), Full Kit by default.
    var name = a.getAttribute('data-gd-name') || 'mudmode Full Kit';
    dlg.setAttribute('aria-label', 'Gumroad: ' + name);
    frame.title = 'Gumroad product page: ' + name;
    opener = a;
    loaded = false;
    frame.style.height = '';
    frame.src = src;
    dlg.showModal();
    closeBtn.focus();
    // L2: if the product frame never says it loaded, go to the product page itself.
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!loaded) { var href = a.href; dlg.close(); location.href = href; }
    }, TIMEOUT_MS);
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="' + ORIGIN + '/l/"]');
    if (a) open(a, e);
  });
})();
