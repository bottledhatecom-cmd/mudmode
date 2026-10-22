# mudmode module: jobs

**Adds:** a name, a registry row and a `PROGRESS.md` for every job, the full never-lose-work rule, and the cap on heavy background jobs. Its rules replace the *lite* lines in `CORE.md`.

14. Never lose work: a branch or copy per job, commit often, `PROGRESS.md` in every job folder, back up before any rewrite or deletion (`<file>.bak-YYYYMMDD-HHMM`), push only after a secrets scan.
15. Every job has a name, a row in the job registry and a `PROGRESS.md` before it starts. Keep heavy background jobs few (suggested default: at most 2 at once, across all AIs).

**Files:** `JOBS.md` (from `templates/JOBS.md`) and `jobs/<job-name>/PROGRESS.md` (from `templates/PROGRESS.md`); create them if missing.
