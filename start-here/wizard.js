/* mudmode Start-here wizard (DRAFT). No network calls, no trackers. Remembers step + AI pick in localStorage only. */
(function () {
  "use strict";
  var KEY = "mudmode-start-wizard";
  var TOTAL = 5;
  var NAMES = ["Welcome", "Your AI", "Get mudmode", "Set it up", "Your first idea"];
  var APPS = ["chatgpt", "claude", "grok"];
  var state = { step: 1, ai: "" };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function load() { try { var v = JSON.parse(localStorage.getItem(KEY) || "{}"); if (v && typeof v === "object") { if (v.step >= 1 && v.step <= TOTAL) state.step = v.step; if (typeof v.ai === "string") state.ai = v.ai; } } catch (e) {} }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  var main = $("#wiz-main"), live = $("#wiz-live");
  var backBtn = $("#back-btn"), nextBtn = $("#next-btn"), count = $("#wiz-count");

  function setHash(h) { if (location.hash !== h) { try { history.replaceState(null, "", h); } catch (e) { location.hash = h; } } }

  function show(n, opts) {
    opts = opts || {};
    var nerd = n === "nerd";
    main.classList.toggle("is-nerd", nerd);
    $("#nerd-view").hidden = !nerd;
    $$(".step").forEach(function (s) { s.hidden = nerd || Number(s.getAttribute("data-step")) !== n; });
    if (nerd) {
      setHash("#nerd");
      live.textContent = "hard nerd mode: everything on one screen";
      if (!opts.quiet) $("#h-nerd").focus({ preventScroll: true });
      window.scrollTo(0, 0);
      return;
    }
    state.step = n; save();
    $$("#hexbar li").forEach(function (li, i) {
      li.classList.toggle("done", i + 1 < n);
      li.classList.toggle("now", i + 1 === n);
      var b = li.querySelector("button");
      if (i + 1 === n) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      b.setAttribute("aria-label", "Step " + (i + 1) + " of " + TOTAL + ": " + NAMES[i] + (i + 1 < n ? " (done)" : ""));
    });
    $("#hexbar-fill").style.width = ((n - 1) / (TOTAL - 1) * 100) + "%";
    backBtn.hidden = n === 1;
    nextBtn.hidden = n === TOTAL || n === 1;
    $("#wiz-nav").hidden = n === 1;
    count.textContent = "Step " + n + " of " + TOTAL;
    if (n === 4) syncTabs();
    setHash("#step-" + n + (n === 4 && state.ai && APPS.indexOf(state.ai) > -1 ? "/" + state.ai : ""));
    live.textContent = "Step " + n + " of " + TOTAL + ": " + NAMES[n - 1];
    if (!opts.quiet) { var h = $("#h-" + n); if (h) h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }

  // AI pick (step 2)
  function setAi(v, fromRadio) {
    state.ai = v; save();
    $$('input[name="ai"]').forEach(function (r) { r.checked = r.value === v; });
    $$("#ai-note > div").forEach(function (d) { d.hidden = d.getAttribute("data-for") !== v; });
  }
  $$('input[name="ai"]').forEach(function (r) { r.addEventListener("change", function () { setAi(r.value, true); }); });

  // Tabs (step 4)
  function currentApp() { return APPS.indexOf(state.ai) > -1 ? state.ai : (state.tab && APPS.indexOf(state.tab) > -1 ? state.tab : "chatgpt"); }
  function syncTabs(app) {
    app = app || currentApp();
    state.tab = app;
    $$('.tabs [role="tab"]').forEach(function (t) {
      var on = t.getAttribute("data-ai") === app;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
  }
  $$('.tabs [role="tab"]').forEach(function (t, i, all) {
    t.addEventListener("click", function () {
      var a = t.getAttribute("data-ai");
      if (APPS.indexOf(a) > -1 && APPS.indexOf(state.ai) > -1) { state.ai = a; setAi(a); }
      syncTabs(a);
      if (state.step === 4) setHash("#step-4/" + a);
    });
    t.addEventListener("keydown", function (e) {
      var k = e.key, j = -1;
      if (k === "ArrowRight") j = (i + 1) % all.length; else if (k === "ArrowLeft") j = (i - 1 + all.length) % all.length; else if (k === "Home") j = 0; else if (k === "End") j = all.length - 1;
      if (j > -1) { e.preventDefault(); all[j].focus(); all[j].click(); }
    });
  });

  // Screenshot walkthroughs
  $$("[data-walk]").forEach(function (w) {
    var items = $$(".walk-list li", w), img = $(".shot-img", w), link = $(".shot-link", w), cnt = $(".shot-count", w);
    function pick(i) {
      items.forEach(function (li, k) { li.classList.toggle("on", k === i); var b = li.querySelector("button"); if (b) b.setAttribute("aria-pressed", k === i ? "true" : "false"); });
      var b = items[i].querySelector("button");
      img.src = b.getAttribute("data-shot"); img.alt = b.getAttribute("data-alt");
      link.href = b.getAttribute("data-shot");
      cnt.textContent = "Picture " + (i + 1) + " of " + items.length;
    }
    items.forEach(function (li, i) { var b = li.querySelector("button"); if (b) b.addEventListener("click", function () { pick(i); if (window.matchMedia("(max-width: 760px)").matches) { var f = img.closest("figure"); if (f) f.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); } }); });
    pick(0);
  });

  // Copy helpers (clipboard API, with a select-and-copy fallback)
  function copyText(text, btn, label) {
    function done(ok) {
      var old = btn.getAttribute("data-label") || btn.innerHTML;
      btn.setAttribute("data-label", old);
      btn.classList.add("ok");
      if (btn.classList.contains("idea")) { var s = btn.querySelector(".idea-s"); if (s) s.textContent = ok ? "Copied! Paste it in your chat" : "Select and copy it from below"; }
      else btn.textContent = ok ? "Copied!" : "Press Ctrl+C";
      live.textContent = ok ? "Copied to clipboard" + (label ? ": " + label : "") : "Copy didn't work here. Select the text and copy it yourself.";
      clearTimeout(btn._t);
      btn._t = setTimeout(function () { btn.classList.remove("ok"); if (btn.classList.contains("idea")) { var s = btn.querySelector(".idea-s"); if (s) s.textContent = "Tap to copy"; } else btn.innerHTML = old; }, 2200);
    }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta); done(ok);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    else fallback();
  }
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var el = $(b.getAttribute("data-copy"));
      var t = el ? (el.value !== undefined && el.tagName === "TEXTAREA" ? el.value : el.textContent) : "";
      if (!t.trim()) { live.textContent = "Type your idea first, then copy it."; if (el) el.focus(); return; }
      copyText(t.trim(), b);
    });
  });
  $$("[data-copy-text]").forEach(function (b) {
    b.addEventListener("click", function () {
      copyText(b.getAttribute("data-copy-text"), b, b.querySelector(".idea-t").textContent);
      var own = $("#own-idea"); if (own && !own.value) own.value = b.getAttribute("data-copy-text");
    });
  });

  // Navigation
  backBtn.addEventListener("click", function () { if (state.step > 1) show(state.step - 1); });
  nextBtn.addEventListener("click", function () { if (state.step < TOTAL) show(state.step + 1); });
  $$("[data-next]").forEach(function (b) { b.addEventListener("click", function () { show(2); }); });
  $$("#hexbar button").forEach(function (b) { b.addEventListener("click", function () { show(Number(b.getAttribute("data-step"))); }); });
  $$("[data-go]").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.preventDefault();
      var g = b.getAttribute("data-go");
      show(g === "nerd" ? "nerd" : Number(g));
    });
  });

  // Finish
  $("#sent-btn").addEventListener("click", function () {
    var c = $("#celebrate"); c.hidden = false; c.focus({ preventScroll: true });
    c.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    live.textContent = "You did it. Welcome to the crew.";
  });
  $("#forget-btn").addEventListener("click", function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    state = { step: 1, ai: "" }; setAi(""); live.textContent = "Your choices were forgotten."; show(1);
  });

  // Keyboard: Alt+Left / Alt+Right move between steps (buttons work too)
  document.addEventListener("keydown", function (e) {
    if (main.classList.contains("is-nerd") || !e.altKey) return;
    if (e.key === "ArrowRight" && state.step < TOTAL) { e.preventDefault(); show(state.step + 1); }
    if (e.key === "ArrowLeft" && state.step > 1) { e.preventDefault(); show(state.step - 1); }
  });

  // Start: hash wins (#step-3, #step-4/claude, #nerd, #celebrate), else saved step; #what-to-say opens step 5 at the What to say card
  function route(initial) {
    var h = location.hash.replace("#", "");
    var m = /^step-(\d)(?:\/(chatgpt|claude|grok))?$/.exec(h);
    if (h === "nerd") return show("nerd", { quiet: initial });
    if (h === "done") { show(5, { quiet: true }); $("#celebrate").hidden = false; return; }
    if (h === "what-to-say") { show(5, { quiet: true }); setHash("#what-to-say"); var w = $("#what-to-say"); if (w) { w.scrollIntoView(); w.focus({ preventScroll: true }); } return; }
    if (m) { if (m[2]) { setAi(m[2]); } show(Math.min(TOTAL, Math.max(1, Number(m[1]))), { quiet: initial }); return; }
    show(state.step, { quiet: initial });
  }
  load();
  if (state.ai) setAi(state.ai);
  route(true);
  window.addEventListener("hashchange", function () { route(false); });
})();
