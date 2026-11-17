/* Sounds made in code (WebAudio). No sound files. On by default with a remembered mute. */
(function (root) {
  'use strict';
  var ctx = null, on = true;
  function ac() {
    if (!on) return null;
    try {
      if (!ctx) ctx = new (root.AudioContext || root.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function tone(freq, start, dur, type, vol, slideTo) {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (start || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(start, dur, vol, hp) {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (start || 0), n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = hp || 2000; g.gain.value = vol || 0.2;
    s.buffer = b; s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  }
  /* soft shapes for the two crowd sounds: an eased (half-cosine) fade in, a curved decay, and a long smooth fade out. No sharp start, no click. */
  function shape(vol, dur, att, tau, rel) {
    var N = 192, a = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var t = dur * i / (N - 1), g = tau ? Math.exp(-t / tau) : 1;
      if (t < att) g *= 0.5 - 0.5 * Math.cos(Math.PI * t / att);
      if (t > dur - rel) g *= 0.5 + 0.5 * Math.cos(Math.PI * (t - (dur - rel)) / rel);
      a[i] = vol * g;
    }
    a[N - 1] = 0; return a;
  }
  function gainAt(c, t, dur, curve) {
    var g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.setValueCurveAtTime(curve, t, dur); g.connect(c.destination); return g;
  }
  function whiteBuf(c, dur) {
    var n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b;
  }
  function hit(c, t0, freq, vol) { // drum body (a sine that sinks a little) plus a snare crackle
    var o = c.createOscillator(), g = gainAt(c, t0, 0.3, shape(vol, 0.3, 0.008, 0.08, 0.12));
    o.frequency.setValueAtTime(freq * 1.6, t0); o.frequency.setTargetAtTime(freq, t0, 0.02); o.connect(g); o.start(t0); o.stop(t0 + 0.32);
    var s = c.createBufferSource(), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), sg = gainAt(c, t0, 0.3, shape(vol * 0.9, 0.3, 0.008, 0.07, 0.12));
    hp.type = 'highpass'; hp.frequency.value = 1500; lp.type = 'lowpass'; lp.frequency.value = 6000;
    s.buffer = whiteBuf(c, 0.3); s.connect(hp); hp.connect(lp); lp.connect(sg); s.start(t0);
  }
  function rimshot() { // ba-dum, ba-dum, tss
    var c = ac(); if (!c) return; var t = c.currentTime + 0.02;
    hit(c, t, 110, 0.07); hit(c, t + 0.17, 90, 0.07);
    var o = c.createOscillator(), og = gainAt(c, t + 0.42, 0.5, shape(0.05, 0.5, 0.012, 0.15, 0.2));
    o.frequency.value = 70; o.connect(og); o.start(t + 0.42); o.stop(t + 0.94);
    var s = c.createBufferSource(), hp = c.createBiquadFilter(), sg = gainAt(c, t + 0.42, 0.7, shape(0.04, 0.7, 0.04, 0.18, 0.4)); // the cymbal tail swells in over 40 ms and dies out slowly
    hp.type = 'highpass'; hp.frequency.value = 6000; s.buffer = whiteBuf(c, 0.7); s.connect(hp); hp.connect(sg); s.start(t + 0.42);
  }
  function ooh() { // a low crowd murmur: five voices sliding down together
    var c = ac(); if (!c) return; var t = c.currentTime + 0.02, d = 1.8, re = new Float32Array(7), im = new Float32Array(7), h;
    for (h = 1; h < 7; h++) im[h] = 1 / Math.pow(h, 1.6);
    var wave = c.createPeriodicWave(re, im), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(c.destination);
    for (var v = 0; v < 5; v++) {
      var f0 = 110 + Math.random() * 80, dl = Math.random() * 0.15, o = c.createOscillator(), g = c.createGain();
      g.gain.setValueAtTime(0, t + dl); g.gain.setValueCurveAtTime(shape(0.016, d - dl, 0.22, 0, 0.7), t + dl, d - dl);
      o.setPeriodicWave(wave); o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.8 + Math.random() * 0.08), t + d);
      o.connect(g); g.connect(lp); o.start(t + dl); o.stop(t + d + 0.02);
    }
    var s = c.createBufferSource(), nl = c.createBiquadFilter(), ng = c.createGain();
    nl.type = 'lowpass'; nl.frequency.value = 600; ng.gain.setValueAtTime(0, t); ng.gain.setValueCurveAtTime(shape(0.008, d, 0.25, 0, 0.7), t, d);
    s.buffer = whiteBuf(c, d); s.connect(nl); nl.connect(ng); ng.connect(lp); s.start(t);
  }
  var S = {
    setOn: function (v) { on = !!v; },
    isOn: function () { return on; },
    card: function (i) { noise((i || 0) * 0.06, 0.05, 0.18, 2500); },
    chip: function () { tone(2400, 0, 0.05, 'triangle', 0.08); tone(3100, 0.03, 0.06, 'triangle', 0.06); },
    right: function () { tone(660, 0, 0.12, 'square', 0.06); tone(990, 0.09, 0.18, 'square', 0.06); },
    wrong: function () { tone(180, 0, 0.28, 'sawtooth', 0.07, 110); },
    combo: function (n) { var f = 520 * Math.pow(1.06, Math.min(n, 12)); tone(f, 0, 0.08, 'square', 0.05); tone(f * 1.5, 0.06, 0.12, 'square', 0.05); },
    tick: function () { tone(1200, 0, 0.03, 'square', 0.04); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.1, 0.22, 'square', 0.06); }); },
    rimshot: rimshot,
    ooh: ooh,
    over: function () { [392, 330, 262].forEach(function (f, i) { tone(f, i * 0.14, 0.25, 'triangle', 0.08); }); }
  };
  root.Sound = S;
})(this);
