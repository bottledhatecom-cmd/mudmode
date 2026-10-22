# AGENTS.md (adapter example: many coding AIs read this file automatically)

<!-- Keep this file short. It points to the CORE instead of copying it, so the rules never drift. -->

## Before every job
1. Read `mudmode/CORE.md` (the rules) and `mudmode/LESSONS.md` (your areas only).
   Also read `mudmode/CORE-LOCAL.md`, `mudmode/MODULES-ON.md` and every module file it lists. In lite mode (`Mode: lite`), skip `LESSONS.md`, `JOBS.md` and `PROGRESS.md` unless the `lessons` or `jobs` module is on.
2. Read `mudmode/HANDOFF.md` and check it against the live state (branch, last commit, test result). If they differ, stop and refresh the handoff first.
3. Register the job: add a row to `mudmode/JOBS.md` and create `mudmode/jobs/<job-name>/PROGRESS.md`.

## While working
- Ask before any action in CORE rule 3. Write the owner's OK in `mudmode/OK-LEDGER.md`; mark it USED UP after one use.
- Back up before rewriting a file: `<file>.bak-YYYYMMDD-HHMM`.
- Update PROGRESS.md at each milestone: step, last done, next, blockers.

## Before you stop
- Rewrite `mudmode/HANDOFF.md` (template: `mudmode/templates/HANDOFF.md`).
- End your report with "Lessons for the crew"; add real lessons to `mudmode/LESSONS.md`.

## Tool notes (fill in for your tool)
- Where this tool loads rules from: <e.g. AGENTS.md, or its own rules file pointing here>
- Guard for "always ask" actions: <hook / permission setting / none: then ask by hand>
- Memory between chats: <yes / no: then HANDOFF.md and PROGRESS.md are the memory>
- Scheduler: <yes / no: then list wanted schedules in OPEN.md for the owner>
