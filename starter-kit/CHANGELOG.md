# Changelog

## v1.3.1 (2026-10-23)
- Setup no longer connects Claude Code unless you say yes: question 3 now shows [y/N], and pressing Enter means no (`setup/setup.ps1`, `setup/setup.sh`, and the Mac installer).
- The PowerShell setup now writes times with a UTC offset (for example `UTC-05:00`) instead of the Windows zone name, which said "Central Standard Time" during daylight time.
- Wording: no setup-time estimates; the kit calls itself the free Crew kit; the Full Kit `watchdog` module is described as hooks that help you keep the ask-first list (you decide).
- New, optional (Windows): `tools/instant-wake/` wakes your bot through its own webhook when a note file grows. You paste your own URL and key; the installer asks first (default No) and adds one sign-in task for your account, no admin. Your timed check stays as a backup. Undo: `tools/instant-wake/ROLLBACK.txt`.
- Instant wake: `wake.ps1` only sends to an `https://` webhook URL; any other URL is refused, nothing is sent, and `wake.log` says why. It also turns on TLS 1.2 for the request.
- The rules are unchanged; only the Version lines moved to 1.3.1.

## v1.3.0 (2026-10-22)
- **Lite mode and modules.** `CORE.md` is now the one-page safety core, always on. The rest of the rules live in `modules/` (handoff-plus, jobs, lessons, reviewer, crew, ship, adapters, local-hardware, manual-keeper; Full Kit also watchdog and usage). **Full mode** = ONE combined `CORE.md` (`cores/CORE-FULL.md`) = the v1.2.3 `CORE.md` word for word, so the startup size is the same as v1.2.3 and no module file loads (they stay on disk as descriptions; lite `CORE.md` + every module holds the same words). **Lite mode** = `CORE.md` + the modules you pick. Nothing was removed: every rule, module, template and file of v1.2.3 is still in the kit.
- Defaults: the free kit starts in lite mode, the Full Kit in full mode. Say "mudmode full" or "mudmode lite" any time; setup takes `--mode lite|full` (PowerShell `-Mode`), and a rerun keeps your mode. Switching never deletes anything.
- Safety rules stay word for word in every mode (ask first for money, posting, sending, deploying, deleting; secrets; accounts and browsers; never route around a check). In lite mode, the AI checks its own local work, and anything published, sent or deployed still gets a real reviewer's verdict first. OKs are still written in `OK-LEDGER.md`.
- Rule numbers 1-25 are unchanged; `RULE-MAP.md` shows where each lives. New: `cores/` (`CORE-FULL.md`, `CORE-LITE.md`, `MODULES-ON-FULL.md`; a switch backs up `CORE.md` and copies the right core in), `MODULES-ON.md` (what loads), `templates/HANDOFF-LITE.md`, `templates/SUGGESTIONS.md`, `FOR-CHAT-APPS/mudmode-chat-lite.md`.
- Side notes: in lite mode the crew may suggest a module once, at a natural break, when it sees a reason (a Full Kit module at most once, labelled). "mudmode quiet" stops them. Nothing leaves your computer.
- **Daily report** (every mode): "mudmode report", or nightly where your AI tool can run a scheduled task you OK'd: what mudmode is doing, what it learned, and what you shared with the hive (opt-in), about 10 lines (`templates/DAILY-REPORT.md`, `templates/SHARED-LESSONS.md`).
- Full mode's `CORE.md` now says Version 1.3.0 (the rules are the v1.2.3 rules, word for word). Setup updates a stock older `CORE.md` (only its Version line differs) with a backup, and keeps the kit's own `cores/` and `modules/` files current (backup first), so a free-kit install upgraded with the Full Kit gets the Full Kit's files and full-mode `MODULES-ON.md`.
- A mode switch over a `CORE.md` you edited yourself now prints a WARNING and keeps your edited copy as a backup; put your own rules in `CORE-LOCAL.md`.
- Sharing lessons (opt-in, 18 or older): where to send them (the mudmode Lessons thread on GitHub), a scrub-private-info step, and the "I agree to the mudmode lesson terms" line (`templates/SHARED-LESSONS.md`, README). New `VERSION` file.

## v1.2.3 (2026-10-22)
- Mac: new `Install mudmode (double-click me).command`: double-click it to set up without Terminal (first time: right-click > Open).
- Setup: on a Mac without the developer tools, the built-in python3 is only an installer stub; setup now skips it, uses Node.js if present, and otherwise leaves Claude Code's settings alone with a note instead of ending in FAILED.
- Setup: `--target "~/folder"` (with the ~ in quotes) now means your home folder, not a folder named `~`.
- Full Kit: `tools/test_gen_adapters.sh` works with macOS sed too.
- Removed `setup/CHAT-SETUP.src.md` (a build source; the chat file `FOR-CHAT-APPS/mudmode-chat-setup.md` is the one to use).
- Version lines: kit, setup, CORE and book 1.2.3 (rules unchanged).

## v1.2.2 (2026-10-22)
- Templates: JOBS.md, LESSONS.md and OK-LEDGER.md start empty (no example rows an AI could report as real).
- CORE rule 7: one line on accounts and browsers (never sign in for the owner, take a password, create an account, enter payment details, or read cookies or saved credentials). Still 25 rules.
- Chat apps: the chat setup file alone is enough; don't add the full book to project files.
- One name each: chats hand off at about 75% full; open items go in `OPEN.md`; older handoffs in `handoff/` and `handoff/archive/`.
- Free kit connector no longer points at the Full Kit's book.
- Version lines: kit, setup and CORE 1.2.2.

## v1.2.1 (2026-10-22)
- Removed the old internal scrub checklist (a build note, not something buyers need) and every mention of it; setup no longer copies it.
- Free kit: setup instructions for the AI now point only at files in the free kit (README.md, not the Full Kit's files).
- Free kit README: plain note about email updates from Gumroad.
- Version lines: kit and setup v1.2.1. CORE.md (rules 1.2) is unchanged.

## v1.2 (2026-10-22)
- 3-step setup (setup/, FOR-CHAT-APPS/), CORE 1.2, license updates.
