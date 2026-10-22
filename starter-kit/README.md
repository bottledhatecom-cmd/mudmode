# mudmode Starter Kit (free), v1.2

**Free, no email needed.** This folder is the whole free mudmode starter kit. Take it and set it up in about 5 minutes with the steps just below.

- **Download:** [mudmode-starter-kit.zip](mudmode-starter-kit.zip) (this folder as one zip), or copy the files you need straight from this page. Or download the whole repo: green **Code** button, then **Download ZIP**.
- **Want updates by email?** Get the same free kit on Gumroad instead (free; tip if you like): you'll get the monthly hive digest and safety fixes by email. Link: see the pricing section at https://mudmodecrew.com.
- **Want more?** The paid mudmode Full Kit adds the full manual, ready-made setups for popular AI assistants, the crew toolset and new lessons as they land: https://mudmodecrew.com.
- **Members chat:** GitHub Discussions on this repo (free GitHub account; 13+). Posting is covered by [CONTRIBUTING.md](../CONTRIBUTING.md).
- **License:** free for one person's personal, non-commercial use under the [mudmode Personal Use License v1.1](../LICENSE) (in the zip: `LICENSE`). Don't resell or repost the kit, don't make competing kits from it, and don't use it to train AI.

mudmode is a way of organizing AI assistants. It is not legal, financial, security or professional advice. AI tools make mistakes, so keep checking their work. Not affiliated with or endorsed by any AI provider.

## Set it up in 3 steps (about 5 minutes)

Your AI does the setup. You answer a few short questions. Pick the AI you use:

- **Claude Code** (the Code tab in the Claude desktop app, or `claude` in a terminal), **Grok Build, Codex, Cursor** or another AI that works with files on your computer:
  1. Unzip this download.
  2. Open the AI in the unzipped folder `mudmode-starter-kit-v1.2`.
  3. Type: **Read README.md and set me up.** Answer its questions and say yes when it asks to run the setup.
- **Claude on claude.ai, Grok on grok.com**, or another chat app with Projects:
  1. Unzip this download.
  2. Make a new Project and add the file `FOR-CHAT-APPS/mudmode-chat-setup.md` to its files.
  3. Start a chat in that project and type: **Read mudmode-chat-setup.md and set me up.** Answer its questions, then paste the short block it gives you into the project's instructions.

Every day after that: say **"handoff"** before you stop (in chat apps, paste the block it gives you as the first message of your next chat), and **"mudmode status"** any time.

**AI:** if the owner asked you to set them up, follow `setup/AI-SETUP.md` in this folder now. If you can't read or write files on this computer, follow `FOR-CHAT-APPS/mudmode-chat-setup.md` instead.

Prefer one command? macOS/Linux: `sh setup/setup.sh` in the unzipped folder. Windows: `powershell -ExecutionPolicy Bypass -File setup\setup.ps1`. It writes only your new `mudmode` folder (plus one connector file if you say yes, and, for Claude Code, your folder added to its allowed folders if you also say yes; your settings file is backed up first), never deletes anything, and never replaces your files without asking. The by-hand steps further down are the other way.

---

## About the kit

mudmode is a plain-file way to run one or more AI assistants as a steady crew: one short rule book, a lessons book that keeps getting better, clean handoffs between chats, and a "one OK = one action" rule for anything risky. It is tool-neutral: the rules live in plain Markdown files; each AI gets a small connector or adapter that points at them.

## Which file holds the rules
- **`CORE.md` is the rule book**: 25 rules on one page. It is the one source of rules.
- **`CORE-LOCAL.md` is your settings** (your name, time zone, extra "always ask first" list, word rules). The setup makes it from your answers; the blank form is `setup/templates/CORE-LOCAL.md`.
- Everything else (templates, adapters, connectors) points at those two files. The Full Kit's `MUDMODE.md` is a longer book that builds on `CORE.md`; it never replaces it.

## What's in the kit
```
CORE.md                  the rules, one page (read at every start)
adapters/AGENTS.md       adapter example for AIs that read AGENTS.md
adapters/ANY-AI.md       adapter for any AI without special tools
templates/HANDOFF.md     rewritten at the end of every session
templates/LESSONS.md     capped lessons book, each lesson says how it's enforced
templates/PROGRESS.md    one per job folder
templates/JOBS.md        job registry
templates/OK-LEDGER.md   record of the owner's OKs (one action, one time)
templates/PROJECT-ADDON.md  extra rules for one project (+ fictional example)
SCRUB-CHECKLIST.md       privacy check run before this kit is shared
addons/LOCAL-HARDWARE.md optional: use a strong PC or GPU if you have one (skip otherwise)
setup/                   the setup your AI runs (AI-SETUP.md, setup.sh, setup.ps1, templates/)
FOR-CHAT-APPS/           mudmode-chat-setup.md: the one file for Claude, Grok and other chat-app Projects
```

## Setting up by hand (instead of the setup above)
Works on any ordinary computer, even a laptop with no GPU, using cloud AIs only. This builds the same folder the setup makes; paths are written for macOS and Linux (on Windows, `~` is your user folder, `%USERPROFILE%`).

1. Make a folder named `mudmode` in your home folder. One folder serves all your projects.
2. Copy into it `CORE.md`, `SCRUB-CHECKLIST.md`, and the folders `templates`, `adapters` and `addons` (keep them as folders). Then copy `HANDOFF.md`, `LESSONS.md`, `JOBS.md` and `OK-LEDGER.md` from `templates` to the top of your `mudmode` folder; the copies in `templates` stay as blank forms. Make an empty folder `jobs` inside `mudmode`.
3. Copy `setup/templates/CORE-LOCAL.md` to `mudmode/CORE-LOCAL.md` and replace each `{{...}}` with your answer: your name, your time zone, anything extra the AIs must always ask first about, your word rules, the folder (`~/mudmode`), today's date, and `no` for the Claude Code allowed-folder question.
4. Connect your AI:
   - **Claude Code:** copy `setup/templates/connector-claude.md` to `~/.claude/rules/mudmode.md` (make the `rules` folder if needed) and replace every `{{DIR}}` with `~/mudmode`. Claude Code reads `CLAUDE.md` and its rules folder, so don't rely on `AGENTS.md` there.
   - **AIs that read `AGENTS.md`** (Codex, Cursor, Grok Build and others): add the text of `setup/templates/connector-agents.md` (with `{{DIR}}` replaced) to your project's `AGENTS.md`, after backing that file up.
   - **Chat apps** (claude.ai, grok.com and others): use `FOR-CHAT-APPS/mudmode-chat-setup.md` as in the 3-step setup (README "Set it up in 3 steps").
   - **Any other AI:** paste `adapters/ANY-AI.md` into its custom instructions.
5. Keep CORE as it is for a week. Your own extras belong in `CORE-LOCAL.md`, not in `CORE.md`.
6. A connected AI reads the rules by itself. Otherwise start each chat with: "Read ~/mudmode/CORE.md, ~/mudmode/CORE-LOCAL.md and ~/mudmode/HANDOFF.md, check the handoff against the live state, then continue."
7. End every chat with **"handoff"** (it means: rewrite `~/mudmode/HANDOFF.md` and add any real lesson to `~/mudmode/LESSONS.md`).
8. Optional, later: tell your AI "check what hardware I have and tell me if `addons/LOCAL-HARDWARE.md` would help". It asks or detects first and only suggests; you decide. You never have to.

## Grow it later
- Week 1: add a guard (hook or permission setting) for your top 3 "always ask" actions.
- Week 2: add a reviewer job that writes PASS / WARN / FAIL against a task card.
- Later: more AIs (one adapter each, all pointing at the same CORE), project add-ons, a scheduled check that the adapters still match CORE.

## Sharing back (optional, opt-in)
If you want to help improve mudmode, you can send a lesson in this fixed form: problem (one line) / fix / result (which AI and version) / confidence. Your AI drafts it; you read it and send it yourself. Never include names, paths, repo names, logs or secrets.

## License and warranty
License: mudmode Personal Use License v1.1, © 2026 Michael J Hester (full text: LICENSE in the mudmode repo). Provided as is, no warranty. Not legal, tax or financial advice.
