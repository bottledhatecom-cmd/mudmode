/* Sleevr member page: the phone tour. Swaps the phone screen between the app's own demo clips (animated webp,
   recorded in the app with demo data). A clip loads only when picked; its still poster shows first. With reduced
   motion the poster stays and a "Play the clip" button plays it on request. No network beyond this site, no storage. */
(function () {
  'use strict';
  var screen = document.getElementById('sv-screen');
  var img = document.getElementById('sv-clip');
  var cap = document.getElementById('sv-cap');
  var play = document.getElementById('sv-play');
  if (!screen || !img) return;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var modes = Array.prototype.slice.call(document.querySelectorAll('.sv-mode'));

  function show(btn, autoplay) {
    var clip = btn.getAttribute('data-clip');
    var steps = btn.closest('.sv-steps').querySelectorAll('.sv-step');
    Array.prototype.forEach.call(steps, function (s) { s.setAttribute('aria-pressed', s === btn ? 'true' : 'false'); });
    img.setAttribute('data-clip', clip);
    img.alt = btn.getAttribute('data-alt') || '';
    var name = btn.querySelector('b');
    cap.textContent = (name ? name.textContent : '') + ', recorded in the app';
    if (autoplay && !still) { img.src = 'media/tour/' + clip + '.webp'; screen.classList.remove('paused'); }
    else { img.src = 'media/tour/' + clip + '-poster.webp'; screen.classList.add('paused'); }
  }

  function pickMode(tab, focus) {
    modes.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
    var panel = document.getElementById(tab.getAttribute('aria-controls'));
    var first = panel && panel.querySelector('.sv-step');
    if (first) show(first, true);
  }

  modes.forEach(function (t, i) {
    t.addEventListener('click', function () { pickMode(t, false); });
    t.addEventListener('keydown', function (e) {
      var n = null;
      if (e.key === 'ArrowRight') n = modes[(i + 1) % modes.length];
      else if (e.key === 'ArrowLeft') n = modes[(i - 1 + modes.length) % modes.length];
      else if (e.key === 'Home') n = modes[0];
      else if (e.key === 'End') n = modes[modes.length - 1];
      if (n) { e.preventDefault(); pickMode(n, true); }
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('.sv-step'), function (b) {
    b.addEventListener('click', function () {
      // A second tap on the step that is playing stops the clip and shows its still picture (WCAG 2.2.2 pause).
      var playing = b.getAttribute('aria-pressed') === 'true' && !screen.classList.contains('paused');
      show(b, !playing);
    });
  });

  if (play) play.addEventListener('click', function () {
    img.src = 'media/tour/' + img.getAttribute('data-clip') + '.webp';
    screen.classList.remove('paused');
  });

  // First view: the poster, so the page loads light. Play starts when someone picks a step or presses Play.
  screen.classList.add('paused');
})();
