/* mudmode: fade-up as sections scroll into view. Optional: the page is fully visible without it. Same-origin only, no network, no storage, no cookies. Skipped when the visitor asks for reduced motion. */
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
