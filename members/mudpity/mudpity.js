/* mudpity wrapper: keeps keyboard focus on the game, Fullscreen and phone niceties. Same-origin only, no network. */
(function () {
  'use strict';
  var frame = document.getElementById('mp-game');
  var stage = document.getElementById('mp-stage');
  var fsBtn = document.getElementById('mp-fs');
  var GAME_KEYS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Space: 1, KeyA: 1, KeyD: 1, KeyW: 1, Enter: 1, KeyP: 1, KeyM: 1, KeyQ: 1, KeyN: 1, KeyH: 1 };

  function focusGame() {
    try { frame.focus({ preventScroll: true }); } catch (e) { frame.focus(); }
    try {
      var w = frame.contentWindow; w.focus();
      var c = w.document && w.document.getElementById('c');
      if (c) c.focus({ preventScroll: true });
    } catch (e) { /* not same-origin (e.g. opened from disk): the iframe focus above is enough */ }
  }
  frame.addEventListener('load', focusGame);
  stage.addEventListener('pointerdown', focusGame);

  /* If a game key is pressed while the page (not the game) has focus, pass it to the game and stop the page from scrolling. */
  function forward(e) {
    if (!GAME_KEYS[e.code] || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    if (t && (t.tagName === 'A' || t.tagName === 'BUTTON' || t.tagName === 'INPUT') && (e.code === 'Enter' || e.code === 'Space')) return;
    try {
      var w = frame.contentWindow;
      w.dispatchEvent(new w.KeyboardEvent(e.type, { key: e.key, code: e.code, repeat: e.repeat, bubbles: true, cancelable: true }));
      e.preventDefault();
      if (e.type === 'keydown') focusGame();
    } catch (err) { /* cross-origin: ignore */ }
  }
  document.addEventListener('keydown', forward);
  document.addEventListener('keyup', forward);

  var fsEl = stage.requestFullscreen ? 'requestFullscreen' : (stage.webkitRequestFullscreen ? 'webkitRequestFullscreen' : null);
  fsBtn.addEventListener('click', function () {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    if (fsEl) {
      var p = stage[fsEl]();
      if (p && p.then) p.then(focusGame, function () { window.open('game/index.html', '_blank', 'noopener'); });
      else focusGame();
    } else {
      window.open('game/index.html', '_blank', 'noopener');   /* iPhone Safari has no element fullscreen: a full tab is the next best thing */
    }
  });
  function fsLabel() { fsBtn.textContent = (document.fullscreenElement || document.webkitFullscreenElement) ? 'Exit fullscreen' : 'Fullscreen'; focusGame(); }
  document.addEventListener('fullscreenchange', fsLabel);
  document.addEventListener('webkitfullscreenchange', fsLabel);

  /* No pinch or double-tap zoom over the game (iOS ignores touch-action for gestures in some versions). */
  ['gesturestart', 'dblclick'].forEach(function (t) { stage.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
  stage.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
})();
