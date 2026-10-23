# mudmode free Crew kit, v1.3.1

**Free.** This folder is the whole free mudmode Crew kit. Set it up with the steps just below.

- **Updates:** if you downloaded this kit from Gumroad, safety fixes and the monthly hive digest come to the email you used there.
- **Want more?** The paid mudmode Full Kit adds the full manual, ready-made setups for popular AI assistants, the crew toolset and new lessons as they land: https://mudmodecrew.com.
- **Members chat:** GitHub Discussions in the mudmode repo, https://github.com/bottledhatecom-cmd/mudmode/discussions (free GitHub account; 13+). Posting is covered by the repo's CONTRIBUTING.md: https://github.com/bottledhatecom-cmd/mudmode/blob/main/CONTRIBUTING.md.
- **License:** free for one person's personal, non-commercial use under the mudmode Personal Use License v1.2 (the `LICENSE` file in this folder). Don't resell or repost the kit, don't make competing kits from it, and don't use it to train AI. Loading it into your own AI assistants is fine.

mudmode is a way of organizing AI assistants. It is not legal, financial, security or professional advice. AI tools make mistakes, so keep checking their work. Not affiliated with or endorsed by any AI provider.

## Set it up in 3 steps

Your AI does the setup. You answer a few short questions. Pick the AI you use:

- **Claude Code** (the Code tab in the Claude desktop app, or `claude` in a terminal), **Grok Build, Codex, Cursor** or another AI that works with files on your computer:
  1. Unzip this download.
  2. Open the AI in the unzipped folder `mudmode-starter-kit-v1.3.1`.
  3. Type: **Read README.md and set me up.** Answer its questions and say yes when it asks to run the setup.
- **Claude on claude.ai, Grok on grok.com**, or another chat app with Projects:
  1. Unzip this download.
  2. Make a new Project and add the file `FOR-CHAT-APPS/mudmode-chat-lite.md` to its files (lite mode; for full mode, all 25 rules, use `FOR-CHAT-APPS/mudmode-chat-setup.md` instead).
  3. Start a chat in that project and type: **Read mudmode-chat-lite.md and set me up.** Answer its questions, then paste the short block it gives you into the project's instructions.

Every day after that: say **"mudmode report"** for the daily report (what mudmode is doing, what it learned, what you shared with the hive), say **"handoff"** before you stop (in chat apps, paste the block it gives you as the first message of your next chat), and **"mudmode status"** any time.

**Lite mode (the default).** The free kit starts in lite mode: your AI loads the one-page safety core (`CORE.md`) and nothing else it doesn't need yet. Every module is still in the kit (`modules/`): say **"turn on the lessons module"** (or any module name), or **"mudmode full"** for all of them (one combined core: the same 25 rules as mudmode 1.2.3); **"mudmode lite"** goes back. Switching never deletes anything, and the safety rules (asking first before money, posting, sending, deploying or deleting; no secrets; no signing in for you) are on in every mode. Now and then the crew may add one short side note suggesting a module when it sees a reason (at most once per module; a Full Kit module at most once, labelled "(Full Kit)"). Say **"mudmode quiet"** to stop side notes. Nothing leaves your computer or chat.

**AI:** if the owner asked you to set them up, follow `setup/AI-SETUP.md` in this folder now. If you can't read or write files on this computer, follow `FOR-CHAT-APPS/mudmode-chat-lite.md` instead.

Prefer one command? macOS/Linux: `sh setup/setup.sh` in the unzipped folder. Windows: `powershell -ExecutionPolicy Bypass -File setup\setup.ps1`. It writes only your new `mudmode` folder (plus one connector file if you say yes, and, for Claude Code, your folder added to its allowed folders if you also say yes; your settings file is backed up first), never deletes anything, and never replaces your files without asking. The by-hand steps further down are the other way.

**Mac, without Terminal:** double-click `Install mudmode (double-click me).command` in the unzipped folder and answer the pop-ups; it runs the same setup. The first time, macOS may say it can't open it (it comes from the internet): right-click (or Control-click) the file and choose **Open**. On macOS 15 or later, if there's no Open button: click Done, then System Settings > Privacy & Security > **Open Anyway**.

---

## About the kit

mudmode is a plain-file way to run one or more AI assistants as a steady crew: one short rule book, a lessons book that keeps getting better, clean handoffs between chats, and a "one OK = one action" rule for anything risky. It is tool-neutral: the rules live in plain Markdown files; each AI gets a small connector or adapter that points at them.

## Which file holds the rules
- **`CORE.md` is the safety core**: one page, always on, in every mode. With the module files in `modules/` it is the one source of rules. Lite mode reads `CORE.md` plus the modules you turn on; full mode ("mudmode full") reads one combined core instead (`cores/CORE-FULL.md` becomes `CORE.md`): the same 25 rules as mudmode 1.2.3, word for word, and no module file. `RULE-MAP.md` shows where each numbered rule lives.
- **`CORE-LOCAL.md` is your settings** (your name, time zone, extra "always ask first" list, word rules). The setup makes it from your answers; the blank form is `setup/templates/CORE-LOCAL.md`.
- Everything else (templates, adapters, connectors) points at those two files. The Full Kit's `MUDMODE.md` is a longer book that builds on `CORE.md`; it never replaces it.

## What's in the kit
```
CORE.md                  the safety core, one page (read at every start, in every mode)
modules/                 the 9 modules (lite reads the ones you turn on; full mode needs none of them); modules/README.md lists them
cores/                   CORE-FULL.md (full mode's combined core = the v1.2.3 rules word for word) and CORE-LITE.md (the lite core)
RULE-MAP.md              where each of the 25 numbered rules lives
CHANGELOG.md             what changed in each version
Install mudmode (double-click me).command  Mac one-click setup (pop-up questions, then setup/setup.sh)
adapters/AGENTS.md       adapter example for AIs that read AGENTS.md
adapters/ANY-AI.md       adapter for any AI without special tools
templates/HANDOFF.md     rewritten at the end of every session (full form)
templates/HANDOFF-LITE.md  the 5-line handoff for lite mode
templates/SUGGESTIONS.md   log of the crew's side notes about modules
templates/DAILY-REPORT.md  the daily report ("mudmode report"): what mudmode is doing, what it learned, what you shared
templates/SHARED-LESSONS.md  lessons you chose to share with the hive (opt-in) and their status
templates/LESSONS.md     capped lessons book, each lesson says how it's enforced
templates/PROGRESS.md    one per job folder
templates/JOBS.md        job registry
templates/OK-LEDGER.md   record of the owner's OKs (one action, one time)
templates/PROJECT-ADDON.md  extra rules for one project (+ fictional example)
addons/LOCAL-HARDWARE.md optional: use a strong PC or GPU if you have one (skip otherwise)
setup/                   the setup your AI runs (AI-SETUP.md, setup.sh, setup.ps1, templates/)
tools/instant-wake/      optional, Windows: wake your bot when a note file grows (asks first; default No; see its README.md)
FOR-CHAT-APPS/           mudmode-chat-lite.md (lite) or mudmode-chat-setup.md (full mode, all 25 rules): the one file for Claude, Grok and other chat-app Projects
```

## Setting up by hand (instead of the setup above)
Works on any ordinary computer, even a laptop with no GPU, using cloud AIs only. This builds the same folder the setup makes; paths are written for macOS and Linux (on Windows, `~` is your user folder, `%USERPROFILE%`).

1. Make a folder named `mudmode` in your home folder. One folder serves all your projects.
2. Copy into it `CORE.md`, `RULE-MAP.md` and the folders `templates`, `adapters`, `addons`, `modules` and `cores` (keep them as folders). Then copy `HANDOFF.md`, `LESSONS.md`, `JOBS.md` and `OK-LEDGER.md` from `templates` to the top of your `mudmode` folder; the copies in `templates` stay as blank forms. Make an empty folder `jobs` inside `mudmode`. (Lite mode needs only `OK-LEDGER.md`, and `HANDOFF-LITE.md` copied as `HANDOFF.md`; the others can wait until you turn their module on. Full mode: copy `cores/CORE-FULL.md` over `CORE.md`.)
3. Copy `setup/templates/CORE-LOCAL.md` to `mudmode/CORE-LOCAL.md` and replace each `{{...}}` with your answer: your name, your time zone, anything extra the AIs must always ask first about, your word rules, the folder (`~/mudmode`), today's date, `no` for the Claude Code allowed-folder question, `lite` or `full` for the mode, and `none` for the modules. Then make `mudmode/MODULES-ON.md`: in lite mode one line, `Mode: lite. Modules on: none.`; in full mode a copy of `cores/MODULES-ON-FULL.md` (no module file loads in full mode).
4. Connect your AI:
   - **Claude Code:** copy `setup/templates/connector-claude.md` to `~/.claude/rules/mudmode.md` (make the `rules` folder if needed) and replace every `{{DIR}}` with `~/mudmode`. Claude Code reads `CLAUDE.md` and its rules folder, so don't rely on `AGENTS.md` there.
   - **AIs that read `AGENTS.md`** (Codex, Cursor, Grok Build and others): add the text of `setup/templates/connector-agents.md` (with `{{DIR}}` replaced) to your project's `AGENTS.md`, after backing that file up.
   - **Chat apps** (claude.ai, grok.com and others): use `FOR-CHAT-APPS/mudmode-chat-setup.md` as in the 3-step setup (README "Set it up in 3 steps").
   - **Any other AI:** paste `adapters/ANY-AI.md` into its custom instructions.
5. Keep CORE as it is for a week. Your own extras belong in `CORE-LOCAL.md`, not in `CORE.md`.
6. A connected AI reads the rules by itself. Otherwise start each chat with: "Read ~/mudmode/CORE.md, ~/mudmode/CORE-LOCAL.md and ~/mudmode/HANDOFF.md, check the handoff against the live state, then continue."
7. End every chat with **"handoff"** (it means: rewrite `~/mudmode/HANDOFF.md` and add any real lesson to `~/mudmode/LESSONS.md`).
8. Optional, later: tell your AI "check what hardware I have and tell me if `addons/LOCAL-HARDWARE.md` would help". It asks or detects first and only suggests; you decide. You never have to.

## Optional: instant wake (Windows)
If your bot has a webhook, your PC can wake it when a note file grows, instead of waiting for the bot's next timed check.
1. Open `tools/instant-wake/` and run `install-instant-wake.ps1` in PowerShell (the exact line is in that folder's `README.md`).
2. You paste your own webhook URL and key into the two files it makes (`webhook-url.txt`, `webhook-auth.txt`). Do it yourself: don't paste them into any chat, and no AI needs to see them.
3. Run it again and answer its question. The default is No; type y to add one sign-in task for your account (no admin).
4. Keep your bot's timed check (for example the 30-minute one) on as a backup. To undo, follow `tools/instant-wake/ROLLBACK.txt`.

## Grow it later
- Week 1: add a guard (hook or permission setting) for your top 3 "always ask" actions.
- Week 2: add a reviewer job that writes PASS / WARN / FAIL against a task card.
- Later: more AIs (one adapter each, all pointing at the same CORE), project add-ons, a scheduled check that the adapters still match CORE.
- Any time: say "turn on the <name> module" (the list is in `modules/README.md`), or "mudmode full" for all of them; "mudmode lite" goes back. Nothing is deleted when you switch.

## Sharing back (optional, opt-in, 18 or older)
If you want to help improve mudmode, you can send a lesson in this fixed form: problem (one line) / fix / result (which AI and version) / confidence. Your AI drafts it; you read it and send it yourself. Never include names, paths, repo names, logs or secrets.
1. **Scrub private info first.** Read the draft line by line and take out names (yours and anyone else's), emails, phone numbers, addresses, account, project or repo names, file paths, logs, keys, passwords, tokens, and anything about a client or employer. When unsure, leave it out.
2. **Agree to the terms.** You must be 18 or older to send a lesson. Sending one means you agree to the mudmode lesson terms: https://mudmodecrew.com/lesson-terms.html. Start your post with: `I agree to the mudmode lesson terms (v1) and I'm 18 or older.` and add `Credit me as <handle>` or `Keep me anonymous` (anonymous is the default).
3. **Post it** as a comment in the mudmode Lessons thread: https://github.com/bottledhatecom-cmd/mudmode/discussions/1 (needs a free GitHub account). Write the lesson as four lines starting `lesson:`, `fix:`, `result:` and `confidence:` (low, medium or high), under 600 characters, with no links or code. Your AI never posts it for you.
Steps and a log of what you shared: `templates/SHARED-LESSONS.md`.

## License and warranty
License: mudmode Personal Use License v1.2, © 2026 Michael J Hester, licensed by Hestertainment LLC (full text: `LICENSE` in this folder). Provided as is, no warranty; you decide what your AI tools do and review their work. Not legal, tax or financial advice.
