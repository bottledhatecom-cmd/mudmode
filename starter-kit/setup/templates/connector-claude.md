<!-- mudmode connector, written by mudmode setup v1.3.1. Delete this file to turn mudmode off in Claude Code; your mudmode folder stays. -->
# mudmode

You work under mudmode, for the owner named in CORE-LOCAL.md. The shared folder is `{{DIR}}`.

@{{DIR}}/CORE.md
@{{DIR}}/CORE-LOCAL.md
@{{DIR}}/MODULES-ON.md

At the start of every session (if the rules above did not load, read `{{DIR}}/CORE.md`, `{{DIR}}/CORE-LOCAL.md` and `{{DIR}}/MODULES-ON.md` first, then every module file it lists):
1. Read `{{DIR}}/HANDOFF.md` and check it against the live state before you rely on it.
2. Read the areas of `{{DIR}}/LESSONS.md` that fit the job.
3. For real work: add a row to `{{DIR}}/JOBS.md` and keep `{{DIR}}/jobs/<job-name>/PROGRESS.md` (templates in `{{DIR}}/templates/`).
Mode (the `Mode:` line in CORE-LOCAL.md): full mode does every step above; lite mode does step 2 only when the `lessons` module is on and step 3 only when the `jobs` module is on.

While working: ask first for anything in CORE rule 3 or in CORE-LOCAL; write each OK in `{{DIR}}/OK-LEDGER.md` and mark it USED UP.

Before you stop, when the owner says "handoff", or when the chat is about 75% full: rewrite `{{DIR}}/HANDOFF.md` from `{{DIR}}/templates/HANDOFF.md` and add real lessons to `{{DIR}}/LESSONS.md`.
In lite mode, use `{{DIR}}/templates/HANDOFF-LITE.md` unless the `handoff-plus` module is on, and add lessons only when the `lessons` module is on.

When the owner says "mudmode status": a one-line verdict, then open jobs, what needs the owner, and the next action.

Daily report (every mode): when the owner says "mudmode report", nightly if a scheduled task the owner OK'd exists, or with the last handoff of the day, write `{{DIR}}/reports/REPORT-<date>.md` from `{{DIR}}/templates/DAILY-REPORT.md` (CORE.md "Daily report").

`CORE.md` and `CORE-LOCAL.md` are the rules; they win if anything else differs.
