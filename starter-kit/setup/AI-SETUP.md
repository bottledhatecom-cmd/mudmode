# mudmode setup: instructions for the AI

**Owner:** you don't need to read this file. It tells your AI how to set mudmode up for you.

**AI:** the owner asked you to set them up with mudmode. Follow these steps in order. Keep your messages short and plain (the owner may not be technical).

## Ground rules for this setup
- Write only inside the owner's new mudmode folder, plus ONE connector file if the owner says yes (step 3). Change nothing else on this computer. Delete nothing.
- Never overwrite an existing file without asking. The setup script keeps the owner's working files (settings, handoff, lessons, jobs, OK ledger) and any file they added. It updates the kit's rule files in `cores/` and `modules/` with a backup first, even if the owner edited one (the edited copy stays in its `.bak-` backup), and it updates `CORE.md` and connector files only if the owner never edited them. Leave it that way.
- Don't install hooks, send anything or go online for this setup. One exception: downloading this kit itself, when the owner asked you to and gave you its SHA-256 to check (check it before you use the file). Hooks, sending and anything else online are separate jobs, each with its own OK from the owner. The only settings file setup may touch is Claude Code's `~/.claude/settings.json`, and only if the owner says yes to question 6; the script backs it up first and only adds one entry.
- Never put secrets, passwords or home addresses into any mudmode file.

## Step 1: say what will happen (one short message), then ask
Tell the owner in 3 lines: you will make a `mudmode` folder in their home folder with their rule book, handoff and lessons files; if they say yes, you will also connect it so every new chat follows it; nothing else changes, and they can undo it by deleting one file (or the folder, if they did not connect it).

Then ask these in ONE numbered message, each with your suggested default, and say "or just say **defaults**":
1. What name should the crew call you? (default: "the owner")
2. Your time zone? Guess it from the computer's clock and offer the guess.
3. Connect mudmode to every new chat in this AI, or not now? (default: no; say yes to have every new chat follow it)
4. Optional: anything I must always ask before doing, on top of the built-in list (deploys, sending, buying, deleting, ...)? (default: nothing extra)
5. Optional: any words to always use or never use? (default: none)
6. Claude Code only: let Claude save to your mudmode folder from any project without asking each time? This adds the folder to the allowed folders in your Claude Code settings (`~/.claude/settings.json`); your settings file is backed up first and nothing else in it changes. (default: no, Claude will ask when it needs to write there)
7. Optional: when you say "mudmode status", also check online whether a newer mudmode is out? It only reads one small public version file, sends no personal info (just a normal web request) and never installs anything. (default: no)

Don't ask where to put the folder unless the owner brings it up. Default: `mudmode` in their home folder (`~/mudmode`; on Windows `%USERPROFILE%\mudmode`). If that folder already exists, say so and ask before continuing (the script keeps the owner's own files and backs up anything it updates).

## Step 2: run the setup script (one command)
Run it from this kit folder (the folder that holds `README.md` and `CORE.md`). Pick the line for this computer and fill in the answers. Leave out any option the owner left at its default. Add `--allow-dir yes` (PowerShell: `-AllowDir yes`) only if the owner said yes to question 6. Add `--update-check on` (PowerShell: `-UpdateCheck on`) only if the owner said yes to question 7. Use `--connect claude` for Claude Code, `--connect grok` for Grok Build, `--connect both` if they use both, `--connect none` if they said "not now". Other AIs that read `AGENTS.md`: use `--connect none` and see step 4.

macOS, Linux, or Windows with Git Bash (Claude Code on Windows uses Git Bash):
```
bash setup/setup.sh --yes --connect claude --name "Sam" --tz "America/New_York" --ask-first "changing my calendar" --words "say 'client', never 'customer'"
```
Windows PowerShell (if `bash` isn't available):
```
powershell -ExecutionPolicy Bypass -File setup\setup.ps1 -Yes -Connect claude -Name "Sam" -Tz "America/New_York" -AskFirst "changing my calendar" -Words "say 'client', never 'customer'"
```
Add `--dry-run` (PowerShell: `-DryRun`) first if you want to show the owner what it would do; it writes nothing.
Leave out `--mode`: the free kit starts in lite mode and the Full Kit in full mode, and a rerun keeps the mode the owner already has. Add `--mode full` or `--mode lite` (PowerShell: `-Mode full`) only if the owner asked for it.
On a Mac the owner can also run setup without you: double-click `Install mudmode (double-click me).command` in this folder (first time: right-click > Open, because macOS blocks downloaded files once).

**Can't run commands?** Do the same by hand, writing only inside the new folder: copy `CORE.md` (full mode: `cores/CORE-FULL.md` as `CORE.md`), `RULE-MAP.md`, `adapters/`, `addons/`, `cores/`, `modules/` and `templates/` from this kit folder into `~/mudmode/`; copy `setup/templates/CORE-LOCAL.md` into `~/mudmode/templates/` and fill a copy of it at `~/mudmode/CORE-LOCAL.md`; copy `templates/LESSONS.md`, `templates/JOBS.md` and `templates/OK-LEDGER.md` to the folder root (lite mode: only `OK-LEDGER.md`); write a first `~/mudmode/HANDOFF.md` from `templates/HANDOFF.md` (lite mode: `templates/HANDOFF-LITE.md`) ("Next single action: ask the owner what the first job is"); make an empty `~/mudmode/jobs/` (full mode only); write `~/mudmode/MODULES-ON.md` (lite: `Mode: lite. Modules on: none.`; full: a copy of `cores/MODULES-ON-FULL.md`, no module file); copy `WHAT-TO-SAY.md` (in the kit's top folder) to `~/mudmode/`. Then write the connector from `setup/templates/connector-claude.md` (or `connector-agents.md`), replacing `{{DIR}}` with the folder path.

## Step 3: check it worked
- The script ends with `RESULT: OK`. If it says `RESULT: FAILED`, tell the owner the exact line it printed and stop.
- It prints the owner's settings just above that line. Check the answers are right; no need to open the files (that would only add permission prompts).
- If you connected Claude Code: `~/.claude/rules/mudmode.md` exists and names the folder. If it already existed with different text, the script did NOT replace it (unless it was an unedited mudmode connector, which it updates with a backup and says so); tell the owner and ask before you change it (back it up first).
- If the owner said yes to question 6: the script prints `Claude Code allowed folders: added` (or `already there`). If it says it left the settings file alone (for example the file isn't plain JSON), tell the owner in one line and don't edit it yourself.
- If you connected Grok Build: `~/.grok/AGENTS.md` exists and names the folder. If the owner already had one, the script left it alone and saved the lines to add in `~/mudmode/connectors/AGENTS-snippet.md`; ask before adding them to their file (back it up first).

## Step 4: tell the owner they're done (7 lines or fewer)
- Done, and where the folder is.
- Daily report (every mode), one line: say "mudmode report" any time for what mudmode is doing, what it learned and what you shared with the hive; if this AI can run scheduled tasks, offer once to write it nightly (only with their OK).
- If the script printed "You're in lite mode" (the free kit's default), say exactly: You're in lite mode; say "mudmode full" for every module.
- How to use it: start a NEW chat in any folder; it follows mudmode by itself (if nothing was connected, tell them the script's "Next:" line instead). Say **"handoff"** before you stop, **"mudmode status"** any time ("mud status" works too, unless setup said the short name "mud" is off), and **"mudhelp"** for the list of things to say.
- How to change it: tell any chat "change my mudmode settings" (it edits `CORE-LOCAL.md`), or edit the file yourself.
- How to undo: delete `~/.claude/rules/mudmode.md` (or `~/.grok/AGENTS.md` if setup made it), which also ends the short name "mud"; if question 6 was yes, remove the folder from `additionalDirectories` in `~/.claude/settings.json` (the backup is beside it). The folder stays theirs.
- For another AI that reads `AGENTS.md` (Codex, Cursor and others): the owner can copy `~/mudmode/connectors/AGENTS-snippet.md` into that project's `AGENTS.md`, or ask that AI to "read README.md and set me up".

## Where the rules live
The rules are `CORE.md` plus the owner's settings in `CORE-LOCAL.md`. Everything personal comes from the setup answers in `CORE-LOCAL.md`.
