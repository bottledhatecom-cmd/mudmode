# mudmode setup: instructions for the AI

**Owner:** you don't need to read this file. It tells your AI how to set mudmode up for you.

**AI:** the owner asked you to set them up with mudmode. Follow these steps in order. Keep your messages short and plain (the owner may not be technical). The whole setup should take the owner about 5 minutes.

## Ground rules for this setup
- Write only inside the owner's new mudmode folder, plus ONE connector file if the owner says yes (step 3). Change nothing else on this computer. Delete nothing.
- Never overwrite an existing file without asking. The setup script already skips existing files; leave it that way.
- Don't install hooks, send anything or go online for this setup. Those are separate jobs, each with its own OK from the owner. The only settings file setup may touch is Claude Code's `~/.claude/settings.json`, and only if the owner says yes to question 6; the script backs it up first and only adds one entry.
- Never put secrets, passwords or home addresses into any mudmode file.

## Step 1: say what will happen (one short message), then ask
Tell the owner in 3 lines: you will make a `mudmode` folder in their home folder with their rule book, handoff and lessons files; you will connect it so new chats follow it; nothing else changes and they can undo it by deleting one file.

Then ask these in ONE numbered message, each with your suggested default, and say "or just say **defaults**":
1. What name should the crew call you? (default: "the owner")
2. Your time zone? Guess it from the computer's clock and offer the guess.
3. Connect mudmode to every new chat in this AI (recommended), or not now?
4. Optional: anything I must always ask before doing, on top of the built-in list (deploys, sending, buying, deleting, ...)? (default: nothing extra)
5. Optional: any words to always use or never use? (default: none)
6. Claude Code only: let Claude save to your mudmode folder from any project without asking each time? This adds the folder to the allowed folders in your Claude Code settings (`~/.claude/settings.json`); your settings file is backed up first and nothing else in it changes. (default: no, Claude will ask when it needs to write there)

Don't ask where to put the folder unless the owner brings it up. Default: `mudmode` in their home folder (`~/mudmode`; on Windows `%USERPROFILE%\mudmode`). If that folder already exists, say so and ask before continuing (the script will keep every existing file).

## Step 2: run the setup script (one command)
Run it from this kit folder (the folder that holds `README-START-HERE.md`). Pick the line for this computer and fill in the answers. Leave out any option the owner left at its default. Add `--allow-dir yes` (PowerShell: `-AllowDir yes`) only if the owner said yes to question 6. Use `--connect claude` for Claude Code, `--connect grok` for Grok Build, `--connect both` if they use both, `--connect none` if they said "not now". Other AIs that read `AGENTS.md`: use `--connect none` and see step 4.

macOS, Linux, or Windows with Git Bash (Claude Code on Windows uses Git Bash):
```
bash setup/setup.sh --yes --connect claude --name "Sam" --tz "America/New_York" --ask-first "changing my calendar" --words "say 'client', never 'customer'"
```
Windows PowerShell (if `bash` isn't available):
```
powershell -ExecutionPolicy Bypass -File setup\setup.ps1 -Yes -Connect claude -Name "Sam" -Tz "America/New_York" -AskFirst "changing my calendar" -Words "say 'client', never 'customer'"
```
Add `--dry-run` (PowerShell: `-DryRun`) first if you want to show the owner what it would do; it writes nothing.

**Can't run commands?** Do the same by hand, writing only inside the new folder: copy `CORE.md`, `SCRUB-CHECKLIST.md`, `adapters/`, `addons/` and `templates/` from the starter kit (in the Full Kit it is the `starter-kit/` folder; in the free kit it is this folder) into `~/mudmode/`; copy `setup/templates/CORE-LOCAL.md` into `~/mudmode/templates/` and fill a copy of it at `~/mudmode/CORE-LOCAL.md`; copy `templates/LESSONS.md`, `templates/JOBS.md` and `templates/OK-LEDGER.md` to the folder root; write a first `~/mudmode/HANDOFF.md` from `templates/HANDOFF.md` ("Next single action: ask the owner what the first job is"); make an empty `~/mudmode/jobs/`; Full Kit only: copy `MUDMODE.md`, `LICENSE.md`, `README-START-HERE.md`, `adapters/` and `tools/` into `~/mudmode/full-kit/`. Then write the connector from `setup/templates/connector-claude.md` (or `connector-agents.md`), replacing `{{DIR}}` with the folder path.

## Step 3: check it worked
- The script ends with `RESULT: OK`. If it says `RESULT: FAILED`, tell the owner the exact line it printed and stop.
- It prints the owner's settings just above that line. Check the answers are right; no need to open the files (that would only add permission prompts).
- If you connected Claude Code: `~/.claude/rules/mudmode.md` exists and names the folder. If it already existed with different text, the script did NOT replace it; tell the owner and ask before you change it (back it up first).
- If the owner said yes to question 6: the script prints `Claude Code allowed folders: added` (or `already there`). If it says it left the settings file alone (for example the file isn't plain JSON), tell the owner in one line and don't edit it yourself.
- If you connected Grok Build: `~/.grok/AGENTS.md` exists and names the folder. If the owner already had one, the script left it alone and saved the lines to add in `~/mudmode/connectors/AGENTS-snippet.md`; ask before adding them to their file (back it up first).

## Step 4: tell the owner they're done (6 lines or fewer)
- Done, and where the folder is.
- How to use it: start a NEW chat in any folder; it follows mudmode by itself. Say **"handoff"** before you stop, and **"mudmode status"** any time.
- How to change it: tell any chat "change my mudmode settings" (it edits `CORE-LOCAL.md`), or edit the file yourself.
- How to undo: delete `~/.claude/rules/mudmode.md` (or `~/.grok/AGENTS.md` if setup made it); if question 6 was yes, remove the folder from `additionalDirectories` in `~/.claude/settings.json` (the backup is beside it). The folder stays theirs.
- Optional extras, later, only if they want: the guard hooks for Claude Code (`full-kit/tools/claude-hooks/README.md`, technical) and the full book (`full-kit/MUDMODE.md`).
- For another AI that reads `AGENTS.md` (Codex, Cursor and others): the owner can copy `~/mudmode/connectors/AGENTS-snippet.md` into that project's `AGENTS.md`, or ask that AI to "read README-START-HERE.md and set me up".

## About the full book (Full Kit)
The rules are `CORE.md` plus the owner's settings in `CORE-LOCAL.md`. `MUDMODE.md` is the full book that builds on them: its PART 1 is `CORE.md` word for word with § pointers, PART 2 explains each rule, and Appendix A has the notes for each kind of AI. It has no placeholders to fill in: everything personal comes from the setup answers in `CORE-LOCAL.md`. Open the book for the full section (§) behind a rule when a job touches it.
