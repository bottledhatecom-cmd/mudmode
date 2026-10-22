# Lessons book (append only, capped at about 80 lines)

How to write a lesson: one line or a short paragraph, newest at the bottom of its area.
Format: `- YYYY-MM-DD H:MM AM/PM <zone> (<job or AI>): **What went wrong or what works, in one sentence.** Detail, fix. Enforced: <check / script / rule / "human-only until a check exists">.`
A lesson without an "Enforced:" part is only a note. Rules that matter need a check that runs, not more copies of the text.
When the book passes about 80 lines: merge similar entries, move settled ones to `DECISIONS.md` (one topic per heading), and replace the old rule in `CORE.md` if it changed.

## Area: Handoffs and memory
- 2026-01-15 9:10 AM CST (example-job): **A handoff that said "tests pass" was a day old.** The receiver re-ran the tests first and found one failing. Enforced: AGENTS.md "check the handoff against the live state" step.

## Area: Approvals and safety

## Area: Cost and resources

## Area: Reviews and quality

## Area: Tools and environment
