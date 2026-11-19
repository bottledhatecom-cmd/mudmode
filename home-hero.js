/* home-hero.js: the den sticker on the home page (same code as members-card.js). Touch screens have no hover, so a first tap
   on a character lights that one shape (glow) and a second tap on the same shape opens its page. Tapping anywhere else clears
   the glow. Mouse and keyboard keep normal links (hover/focus glow is in CSS). A shape with no link (Sleevr, page coming soon)
   only glows. No network, no storage. */
(function () {
  'use strict';
  var arts = document.querySelectorAll('.xr-art');
  if (!arts.length) return;
  var lastPointer = 'mouse';
  function clear(except) {
    var lit = document.querySelectorAll('.xr-region.is-lit');
    for (var i = 0; i < lit.length; i++) if (lit[i] !== except) lit[i].classList.remove('is-lit');
  }
  document.addEventListener('pointerdown', function (e) {
    lastPointer = e.pointerType || 'mouse';
    if (!e.target.closest || !e.target.closest('.xr-region')) clear(null);
  }, true);
  for (var k = 0; k < arts.length; k++) {
    arts[k].addEventListener('click', function (e) {
      var r = e.target.closest ? e.target.closest('.xr-region') : null;
      if (!r) { clear(null); return; }
      var touch = lastPointer === 'touch' || lastPointer === 'pen';
      if (!r.hasAttribute('href')) {            /* glow-only shape: a tap toggles its glow */
        e.preventDefault();
        if (touch) { var on = r.classList.contains('is-lit'); clear(null); if (!on) r.classList.add('is-lit'); }
        return;
      }
      if (touch && !r.classList.contains('is-lit')) { e.preventDefault(); clear(r); r.classList.add('is-lit'); return; }
      clear(null);                              /* second tap, mouse click or Enter: follow the link */
    });
  }
  /* Captions: hover (mouse), keyboard focus or a lit shape (touch: first tap) fills the fixed caption area at the bottom of the art; otherwise it
     shows the idle line that is already in the page. The text is set with textContent only, in an aria-live="polite" region. */
  var CAPS = {
    'xr-k-croc':   ['The mudpity croc', 'From mudpity, a 3D jungle runner you play in your browser.'],
    'xr-k-golem':  ['The golem buddy', 'Your helper in mudpity, the 3D jungle runner.'],
    'xr-k-mudai':  ['mudai, the dealer', 'Deals the hands in mudschool poker, a free poker training game. Brainchips only, 18+.'],
    'xr-k-hero':   ['The mudpity hero', 'The hero robot of mudpity, a 3D jungle runner.'],
    'xr-k-sleevr': ['Sleevr', 'A personal organizer and record-keeper with three modes. Take the tour on a real phone screen.'],
    'xr-k-table':  ['mudschool poker', 'Learn poker together in Discord, or play the trainer in your browser.']
  };
  function capKey(r) { for (var k in CAPS) if (Object.prototype.hasOwnProperty.call(CAPS, k) && r.classList.contains(k)) return k; return null; }
  for (var m = 0; m < arts.length; m++) (function (art) {
    var cap = art.querySelector('.hh-cap'); if (!cap) return;
    var nameEl = cap.querySelector('.hh-cap-name'), descEl = cap.querySelector('.hh-cap-desc'), idle = nameEl.textContent, hover = null, focus = null, shown = '';
    function refresh() {
      var r = hover || focus || art.querySelector('.xr-region.is-lit'), key = r ? capKey(r) : null;
      if (key === shown) return;
      shown = key;
      if (key) { nameEl.textContent = CAPS[key][0]; descEl.textContent = CAPS[key][1]; cap.classList.add('on'); }
      else { nameEl.textContent = idle; descEl.textContent = ''; cap.classList.remove('on'); }
    }
    art.addEventListener('pointerover', function (e) { if (e.pointerType && e.pointerType !== 'mouse') return; var r = e.target.closest ? e.target.closest('.xr-region') : null; if (r !== hover) { hover = r; refresh(); } });
    art.addEventListener('pointerout', function (e) { if (e.pointerType && e.pointerType !== 'mouse') return; var r = e.target.closest ? e.target.closest('.xr-region') : null; if (r && r === hover && !(e.relatedTarget && r.contains(e.relatedTarget))) { hover = null; refresh(); } });
    art.addEventListener('focusin', function (e) { var r = e.target.closest ? e.target.closest('.xr-region') : null; if (r && r.matches && r.matches(':focus-visible')) { focus = r; refresh(); } });
    art.addEventListener('focusout', function () { focus = null; refresh(); });
    if (window.MutationObserver) new MutationObserver(refresh).observe(art, { subtree: true, attributes: true, attributeFilter: ['class'] });
  })(arts[m]);
})();
