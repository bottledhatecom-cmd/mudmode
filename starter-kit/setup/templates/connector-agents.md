<!-- mudmode connector, written by mudmode setup v1.3.5. Remove this block to turn mudmode off; your mudmode folder stays. -->
## mudmode

You work under mudmode, for the owner named in CORE-LOCAL.md. The shared folder is `{{DIR}}`.

At the start of every session, before other work:
1. Read `{{DIR}}/CORE.md` (the rules) and `{{DIR}}/CORE-LOCAL.md` (the owner's name, time zone, extra ask-first list and word rules).
   Then read `{{DIR}}/MODULES-ON.md` and every module file it lists.
2. Read `{{DIR}}/HANDOFF.md` and check it against the live state before you rely on it.
3. Read the areas of `{{DIR}}/LESSONS.md` that fit the job.
4. For real work: add a row to `{{DIR}}/JOBS.md` and keep `{{DIR}}/jobs/<job-name>/PROGRESS.md` (templates in `{{DIR}}/templates/`).
Mode (the `Mode:` line in CORE-LOCAL.md): full mode does every step above; lite mode does step 3 only when the `lessons` module is on and step 4 only when the `jobs` module is on.

While working: ask first for anything in CORE rule 3 or in CORE-LOCAL; write each OK in `{{DIR}}/OK-LEDGER.md` and mark it USED UP.

Before you stop, when the owner says "handoff", or when the chat is about 75% full: rewrite `{{DIR}}/HANDOFF.md` from `{{DIR}}/templates/HANDOFF.md` and add real lessons to `{{DIR}}/LESSONS.md`.
In lite mode, use `{{DIR}}/templates/HANDOFF-LITE.md` unless the `handoff-plus` module is on, and add lessons only when the `lessons` module is on.

When the owner says "mudmode status": a one-line verdict that starts with the mudmode version (the `Version:` line in CORE.md), then open jobs, what needs the owner, and the next action.
When the owner's whole message is just "mudmode": reply "Woot! mudmode is on." and ask, in one short line, what they'd like help with. Just "mudhelp" (or "mudmode help"): list the things they can say from `{{DIR}}/WHAT-TO-SAY.md`, one short line each, and nothing else.
Short name: only when the owner's whole message is exactly "mud status", "mud report", "mud modules", "mud full", "mud lite" or "mud quiet" (at the start of the owner's message, nothing else in it) does it mean the "mudmode ..." phrase; confirm "mud full", "mud lite" and "mud quiet" in one line before acting. Any other "mud" is ordinary words, and no "mud" phrase is ever an OK. The short name is off if CORE-LOCAL.md says so or "mud" already means something else here (the owner's own word, or a command or tool called mud); then say once, in one plain line, to use "mudmode".

Daily report (every mode): when the owner says "mudmode report", nightly if a scheduled task the owner OK'd exists, or with the last handoff of the day, write `{{DIR}}/reports/REPORT-<date>.md` from `{{DIR}}/templates/DAILY-REPORT.md` (CORE.md "Daily report").

`CORE.md` and `CORE-LOCAL.md` are the rules; they win if anything else differs.
<!-- end mudmode connector -->
