/* mmcue1: the mudmeter cue. Every so often, when Tylerbot is resting in the hero, he leans toward the "mudmeter" link in the header
   and the link pulses once with a soft glow (about 1.5 s). No text, no sound, no storage, no network.
   Optional extra: the page works with this file turned off. It never edits the link (href, text and layout stay as they are);
   it only adds and removes two classes and three style variables, then cleans up. It leaves him alone while he is doing anything
   else (a big bit, a small trick, a dodge, a bubble), stops on reduced motion, a hidden tab, data saver, the pause button and widths under 1100 px.
   It does not touch the press dodge, the "too slow!" tease or any other trick. */
(function () {
  'use strict';
  var d = document, w = window;
  if (!d || !d.querySelector || !w.setTimeout) return;
  var bot = d.querySelector('[data-tyler-play]');
  var link = d.querySelector('.bar .note a[href="meter/"]');
  if (!bot || !link) return;

  var DUR = 1500, LAG = 300;              // the cue, and when the link's glow starts
  var FIRST_MIN = 18000, FIRST_SPAN = 27000;   // first cue 18-45 s after load
  var GAP_MIN = 90000, GAP_SPAN = 110000;      // then one every 90-200 s at most
  var RETRY = 4000;                       // not a good moment: look again in 4 s (does not use up the gap)
  var timer = 0, run = null, cues = 0;

  function reduced() { return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function saveData() { var c = w.navigator && w.navigator.connection; return !!(c && c.saveData); }
  function api() { try { return w.__tb && w.__tb(); } catch (e) { return null; } }
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2 && r.bottom > 0 && r.top < (w.innerHeight || 0);
  }
  function calm() {
    var a = api();
    if (!a || !a.on || !a.vis || a.state !== 'rest' || a.bit || a.paused || a.hold || a.down) return false;
    if (w.__tbBusy) return false;
    var cl = bot.classList;
    if (cl.contains('tb-look') || cl.contains('tb-dodge') || cl.contains('tb-away') || cl.contains('tb-mmcue')) return false;
    if (d.querySelector('.tb-say') || d.querySelector('.tkbar.tk-paused')) return false;
    return true;
  }
  function ok() {
    if (reduced() || saveData() || d.hidden || (w.innerWidth || 0) < 1100) return false;
    if (!d.documentElement.classList.contains('tk-on')) return false;
    if (!inView(link) || !inView(bot)) return false;
    return calm();
  }

  function end(r) {
    if (!r || r.done) return;
    r.done = true;
    w.clearInterval(r.poll);
    bot.classList.remove('tb-mmcue');
    link.classList.remove('tb-mmglow');
    bot.style.removeProperty('--lx'); bot.style.removeProperty('--ly'); bot.style.removeProperty('--lr'); bot.style.removeProperty('--tb-dur');
    link.style.removeProperty('--tb-dur');
    if (r.setBusy && w.__tbBusy) w.__tbBusy = false;
    if (run === r) run = null;
  }

  function start() {
    var a = bot.getBoundingClientRect(), b = link.getBoundingClientRect();
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    var dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    var r = { done: false, setBusy: !w.__tbBusy, poll: 0 };
    run = r; cues++;
    if (r.setBusy) w.__tbBusy = true;   // asks the play script to hold its big bits until the cue is done
    bot.style.setProperty('--lx', (dx / dist * 10).toFixed(2));
    bot.style.setProperty('--ly', (dy / dist * 6).toFixed(2));
    bot.style.setProperty('--lr', (dx / dist * 8).toFixed(2));
    bot.style.setProperty('--tb-dur', (DUR / 1000).toFixed(3) + 's');
    bot.classList.add('tb-mmcue');
    w.setTimeout(function () {
      if (r.done) return;
      link.style.setProperty('--tb-dur', ((DUR - LAG) / 1000).toFixed(3) + 's');
      link.classList.add('tb-mmglow');
    }, LAG);
    // stand down at once if anything else starts, or reduced motion turns on
    r.poll = w.setInterval(function () {
      var a2 = api(), cl = bot.classList;
      if (reduced() || d.hidden || !a2 || a2.state !== 'rest' || a2.bit || cl.contains('tb-look') || cl.contains('tb-dodge') || d.querySelector('.tb-say')) end(r);
    }, 100);
    w.setTimeout(function () { end(r); }, DUR + 60);
  }

  function next(ms) {
    w.clearTimeout(timer);
    timer = w.setTimeout(tick, ms);
  }
  function tick() {
    if (run) { next(RETRY); return; }
    if (!ok()) { next(RETRY); return; }
    start();
    next(GAP_MIN + Math.random() * GAP_SPAN);
  }

  w.TbMmcue = { ok: ok, start: function () { if (!run && ok()) { start(); return true; } return false; }, count: function () { return cues; } };
  next(FIRST_MIN + Math.random() * FIRST_SPAN);
})();
