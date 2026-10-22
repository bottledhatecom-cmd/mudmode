# mudmode module: manual-keeper

**Adds:** how the rule files are kept: one source of rules, and the owner's rule changes written in the same turn. Its rules replace the *lite* lines in `CORE.md`.

**Words:** "the owner" = the person the AIs work for (their name, time zone and own extra rules are in `CORE-LOCAL.md`, filled in at setup). "an AI" = any assistant on the crew. "a job" = one named piece of work. "the shared folder" = the one folder where this file and the crew's shared files live (setup makes it at `~/mudmode` unless the owner picks another place).
25. `CORE.md` (this file) is the one source of rules; `CORE-LOCAL.md` adds the owner's own settings. The Full Kit's `MUDMODE.md` repeats these 25 rules word for word in its PART 1 and explains each one in full; it builds on this file and never overrides it. Each AI's adapter file is generated from it or points to it; if they differ, `CORE.md` wins.

**Files:** `CORE.md`, `CORE-LOCAL.md`, `modules/`, `RULE-MAP.md`.
