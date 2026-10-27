/* mudmode: fade-up as sections scroll into view. Optional: the page is fully visible without it. Same-origin only, no network, no storage, no cookies. Skipped when the visitor asks for reduced motion. */
/* Top ticker: the line only scrolls once this script is running, because the scroll needs its pause button. Without this file, or with reduced motion, it is one static line. The button flips aria-pressed and a class; nothing is stored. */
(function () {
  var d = document, h = d.documentElement, b = d.querySelector('.tk-pause'), bar = d.querySelector('.tkbar');
  if (!b || !bar) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  h.classList.add('tk-on');
  b.addEventListener('click', function () {
    var p = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', p ? 'true' : 'false');
    bar.classList.toggle('tk-paused', p);
  });
}());
(function () {
  var d = document, h = d.documentElement;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var els = d.querySelectorAll('.desk .win, .desk .icons > p, footer');
  if (!els.length) return;
  var vh = window.innerHeight || h.clientHeight;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
  h.classList.add('fx-on');
  Array.prototype.forEach.call(els, function (el) {
    el.classList.add('fx');
    if (el.getBoundingClientRect().top < vh * 0.94) el.classList.add('in'); else io.observe(el);
  });
}());
