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
})();
