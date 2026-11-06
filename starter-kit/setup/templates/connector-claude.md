<!-- mudmode connector, written by mudmode setup v1.3.9. Delete this file to turn mudmode off in Claude Code; your mudmode folder stays. -->
# mudmode

You work under mudmode, for the owner named in CORE-LOCAL.md. The shared folder is `{{DIR}}`.

@{{DIR}}/CORE.md
@{{DIR}}/CORE-LOCAL.md
@{{DIR}}/MODULES-ON.md

At the start of every session (if the rules above did not load, read `{{DIR}}/CORE.md`, `{{DIR}}/CORE-LOCAL.md` and `{{DIR}}/MODULES-ON.md` first, then every module file it lists):
1. Read `{{DIR}}/HANDOFF.md` and check it against the live state before you rely on it.
2. Read the areas of `{{DIR}}/LESSONS.md` that fit the job.
3. For real work: add a row to `{{DIR}}/JOBS.md` and keep `{{DIR}}/jobs/<job-name>/PROGRESS.md` (templates in `{{DIR}}/templates/`).
mudgo (the `mudgo:` line in CORE-LOCAL.md; CORE.md Part 2 says when it turns on): while mudgo is on, do every step above; otherwise do step 2 only when the `lessons` module is on and step 3 only when the `jobs` module is on.

While working: ask first for anything in CORE rule 3 or in CORE-LOCAL; write each OK in `{{DIR}}/OK-LEDGER.md` and mark it USED UP.

Before you stop, when the owner says "handoff", or when the chat is about 75% full: rewrite `{{DIR}}/HANDOFF.md` from `{{DIR}}/templates/HANDOFF.md` and add real lessons to `{{DIR}}/LESSONS.md`.
While mudgo is not on, use `{{DIR}}/templates/HANDOFF-LITE.md` unless the `handoff-plus` module is on, and add lessons only when the `lessons` module is on.

When the owner says "mudmode status": a one-line verdict that starts with the mudmode version (the `Version:` line in CORE.md), then open jobs, what needs the owner, and the next action.
When the owner's whole message is just "mudmode": reply "Woot! mudmode is on." and ask, in one short line, what they'd like help with. Just "mudhelp" (or "mudmode help"): list the things they can say from `{{DIR}}/WHAT-TO-SAY.md`, one short line each, and nothing else.
Short name: only when the owner's whole message is exactly "mud status", "mud report", "mud modules", "mud go", "mud everyday" or "mud quiet" (at the start of the owner's message, nothing else in it) does it mean the "mudmode ..." phrase; confirm "mud go", "mud everyday" and "mud quiet" in one line before acting. Any other "mud" is ordinary words, and no "mud" phrase is ever an OK. The short name is off if CORE-LOCAL.md says so or "mud" already means something else here (the owner's own word, or a command or tool called mud); then say once, in one plain line, to use "mudmode".

Daily report (every mode): when the owner says "mudmode report", nightly if a scheduled task the owner OK'd exists, or with the last handoff of the day, write `{{DIR}}/reports/REPORT-<date>.md` from `{{DIR}}/templates/DAILY-REPORT.md` (CORE.md "Daily report").

Full Kit only: the full book is `{{DIR}}/full-kit/MUDMODE.md`. Its PART 1 is the full rule set (`CORE.md` Part 1 plus mudgo in Part 2) word for word; the rest explains each rule. Open the section (§) behind a rule when a job touches it. `CORE.md` and `CORE-LOCAL.md` win if anything differs.
