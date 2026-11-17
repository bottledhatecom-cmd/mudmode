/* Streak and spaced-review rules (pure functions, unit-tested). */
(function (root) {
  'use strict';
  var INTERVAL = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 }; // curriculum: box -> days until it comes back
  /* A right answer moves the topic up one box (a new topic starts in box 1, so right -> box 2).
     A miss sends it to box 1. A right answer before the topic is due changes nothing
     (the same kind can come up twice in one day). Returns the new {box, due}. */
  function markBox(old, ok, today) {
    if (ok && old && old.due > today) return { box: old.box, due: old.due }; // right again before it is due: no jump
    var box = ok ? Math.min(5, (old ? old.box : 1) + 1) : 1;
    return { box: box, due: today + INTERVAL[box] };
  }
  /* Daily-run streak. Same day: no change. Next day: +1. One missed day is forgiven once a week
     (a "rest day"). Longer gaps start again at 1. Returns {streak, lastRunDay, restDay, counted}. */
  function nextStreak(s, today) {
    if (s.lastRunDay === today) return { streak: s.streak, lastRunDay: today, restDay: s.restDay, counted: false };
    var gap = s.lastRunDay == null ? 99 : today - s.lastRunDay, streak = s.streak, rest = s.restDay;
    if (gap === 1) streak++;
    else if (gap === 2 && (rest == null || today - rest >= 7)) { streak++; rest = today - 1; }
    else streak = 1;
    return { streak: streak, lastRunDay: today, restDay: rest, counted: true };
  }
  /* The streak to show today: it is still alive if today's or yesterday's run counted, or one missed day can still be
     forgiven by a run today; otherwise it shows 0 until the next run. */
  function liveStreak(s, today) {
    if (s.lastRunDay == null) return 0;
    var gap = today - s.lastRunDay;
    if (gap <= 1) return s.streak;
    if (gap === 2 && (s.restDay == null || today - s.restDay >= 7)) return s.streak;
    return 0;
  }
  var api = { INTERVAL: INTERVAL, markBox: markBox, nextStreak: nextStreak, liveStreak: liveStreak };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Progress = api;
})(this);
