# Changelog

**How to update:** download the new kit, unzip it to a NEW folder (never over your old download or your `mudmode` folder), then say **Read README.md and set me up.** again or run the setup again. Your settings, handoff, lessons, jobs and OK ledger stay as they are; see "Updating to a new version" in `README.md`. Chat apps: see "Updating" in your `FOR-CHAT-APPS/` file.

## v1.3.3 (2026-10-23)
- New: the short name **"mud"**. In your AI chats, "mud status", "mud report", "mud full", "mud lite", "mud modules" and "mud quiet" work like the same words with "mudmode". "mudmode" stays the main name and still works everywhere. Only an exact whole message counts ("mud" plus one word from that list), "mud full", "mud lite" and "mud quiet" are confirmed before anything switches, and no "mud" message is ever an OK for anything.
- It is a word your AI understands, not a terminal command: setup adds no `mud` command and changes no shell profile.
- How setup checks whether `mud` is already taken on this computer (it only reads): a command, alias or function called `mud`, including aliases written the fish way (`alias mud '...'`), `alias -- mud=`, several aliases on one line, fish abbreviations and functions, and, on PowerShell, a `mud` in an installed module (read from the module list, without loading any module). If setup can't check (a profile or folder it can't read), the short name stays off. What setup can't see: a `mud` made in a file your profile loads from elsewhere, by `eval`, by a plugin manager, or by a PowerShell module that only creates it while loading.
- If `mud` is taken, setup leaves it alone, turns the short name off in `CORE-LOCAL.md` (the "Short name" line) and says so in one line. You can also turn it off yourself on that line. A folder first set up with 1.3.2 may not have that line yet; to turn the short name off there, add this line to `CORE-LOCAL.md` yourself: `- **Short name "mud" (on or off; on: "mud status" works like "mudmode status"):** off`. A rerun adds no second line. Undo is the same as before: deleting the connector file also ends the short name.
- Update check wording: it "sends no personal info, just a normal web request" (it used to say it "sends nothing about you"). On a computer that only has BusyBox `wget`, the check now says it can't keep to `https://` and checks nothing (install `curl` to use it).
- Setup: a stock `CORE.md` or connector saved with Windows line endings is now recognized and updated (macOS and Linux too). After updating kit files, setup says in one line that an edited copy is in the `.bak-` file next to it. When an existing Claude Code connector is left as it was, the "Connected to" line now says so instead of "nothing".
- Wording: the AI setup's connect question says the default is no, to match setup.
- New in `README.md`: a short note that your crew is your call. mudmode gives you the starting rules; what your crew learns from there is up to you, so read what your AIs suggest before you keep it and keep checking their work.
- The safety rules are unchanged; the Version lines moved to 1.3.3 and the short-name line was added.

## v1.3.2 (2026-10-23)
- New: `WHAT-TO-SAY.md`, the plain words that get things done.
- `README.md` has an "Updating to a new version" section, and the CHANGELOG starts with how to update. Chat apps: your `FOR-CHAT-APPS/` file has an "Updating" step ("update my mudmode").
- "mudmode status" now starts with the mudmode version (the `Version:` line in `CORE.md`).
- Updating: setup now also updates `CORE.md` and the connector files (with a backup first) when they still match a released mudmode version byte for byte. If you edited one, setup keeps yours and says so in one line. The rule files in `cores/` and `modules/` are updated as before; an edited module is replaced, and your copy is kept in its `.bak-` backup.
- Setup's message for an existing folder now says what really happens: your own files stay as they are, and rule files in `cores/` and `modules/` are updated, with a backup of each.
- New, optional and off by default: an update check (`tools/check-update.sh`, `tools/check-update.ps1`). Turn it on with setup question 7 (question 8 in the terminal setup script), `--update-check on` (PowerShell `-UpdateCheck on`) or the "Update check" line in `CORE-LOCAL.md`. When on, it reads one small public version file and only tells you if a newer kit is out and how to update. It never downloads or installs anything and sends nothing about you; offline, it says it couldn't check. It only uses `https://` addresses (also after a redirect), reads at most 4096 bytes, and only shows version numbers (digits and dots) plus a fixed "what's new" pointer written in the script. It never prints any other text from the file, so nothing in it can change how your terminal looks or what your AI reads.
- Setup now also copies the kit's `VERSION` file into your `mudmode` folder (the update check reads it).
- Wording fixed to match what a rerun really does: the README and the Mac installer no longer say setup "never replaces your files without asking" or that "only missing kit files will be added". On a rerun, setup keeps your own files and updates the kit's rule files, with a backup of each. The README also says the Claude Code connector outside your folder is only updated when you say yes to connecting again.
- When setup keeps a `CORE.md` that doesn't match a released v1.3 version, it now says "your own edits, or an older version" instead of always saying you edited it.
- When you say yes to replacing a file in a terminal run, a second replace in the same minute now gets its own backup name (`-1`) instead of overwriting the first backup.
- No setup-time estimates anywhere in the kit.
- The rules are unchanged; only the Version lines moved to 1.3.2.

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
