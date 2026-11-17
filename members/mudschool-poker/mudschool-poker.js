/* mudschool poker member page: Fullscreen for the trainer and keyboard focus on tap. Same-origin only, no network (same idea as mudpity.js). */
(function () {
  'use strict';
  var frame = document.getElementById('ms-game');
  var stage = document.getElementById('ms-stage');
  var fsBtn = document.getElementById('ms-fs');
  if (!frame || !stage || !fsBtn) return;

  function focusGame() {
    try { frame.focus({ preventScroll: true }); } catch (e) { frame.focus(); }
    try { frame.contentWindow.focus(); } catch (e) { /* opened from disk: the iframe focus is enough */ }
  }
  stage.addEventListener('pointerdown', focusGame);

  var fsEl = stage.requestFullscreen ? 'requestFullscreen' : (stage.webkitRequestFullscreen ? 'webkitRequestFullscreen' : null);
  function openTab() { window.open('game/index.html', '_blank', 'noopener'); }
  fsBtn.addEventListener('click', function () {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    if (!fsEl) { openTab(); return; } /* iPhone Safari has no element fullscreen: a full tab is the next best thing */
    var p = stage[fsEl]();
    if (p && p.then) p.then(focusGame, openTab); else focusGame();
  });
  function fsLabel() { fsBtn.textContent = (document.fullscreenElement || document.webkitFullscreenElement) ? 'Exit fullscreen' : 'Fullscreen'; }
  document.addEventListener('fullscreenchange', fsLabel);
  document.addEventListener('webkitfullscreenchange', fsLabel);
})();
