# mudmode Starter Kit (free)

**Free, no email needed.** This folder is the whole free mudmode starter kit. Take it and set it up in about 10 minutes.

- **Download:** [mudmode-starter-kit.zip](mudmode-starter-kit.zip) (this folder as one zip), or copy the files you need straight from this page. Or download the whole repo: green **Code** button, then **Download ZIP**.
- **Want updates by email?** Get the same free kit on Gumroad instead (free; tip if you like): you'll get the monthly hive digest and safety fixes by email. Link: see the pricing section at https://mudmodecrew.com.
- **Want more?** The paid mudmode Full Kit adds the full manual, ready-made setups for popular AI assistants, the crew toolset and new lessons as they land: https://mudmodecrew.com.
- **Members chat:** GitHub Discussions on this repo (free GitHub account; 13+). Posting is covered by [CONTRIBUTING.md](../CONTRIBUTING.md).
- **License:** free for one person's personal, non-commercial use under the [mudmode Personal Use License v1.1](../LICENSE) (in the zip: `LICENSE`). Don't resell or repost the kit, don't make competing kits from it, and don't use it to train AI.

mudmode is a way of organizing AI assistants. It is not legal, financial, security or professional advice. AI tools make mistakes, so keep checking their work. Not affiliated with or endorsed by any AI provider.

---

## About the kit

mudmode is a plain-file way to run one or more AI assistants as a steady crew: one short rule book, a lessons book that keeps getting better, clean handoffs between chats, and a "one OK = one action" rule for anything risky. It is tool-neutral: the rules live in plain Markdown files; each AI gets a small adapter that points at them.

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
```

## Quick start (10 minutes)
Works on any ordinary computer, even a laptop with no GPU, using cloud AIs only. Got a strong PC? You can let mudmode use it later (step 7). No strong PC? Everything still works.

1. Make a folder `mudmode/` in your project (or one shared folder for all your projects).
2. Copy `CORE.md` and the `templates/` files into it. Rename `templates/*.md` as you use them (e.g. `mudmode/HANDOFF.md`).
3. Copy `adapters/AGENTS.md` to your project root (if your AI reads `AGENTS.md`), or paste `adapters/ANY-AI.md` into your AI's custom instructions. Fill in the "Tool notes".
4. Edit `CORE.md` rule 9 (your word rules) and rule 3 (your "always ask" list). Keep the rest as is for a week.
5. Start your next chat with: "Read mudmode/CORE.md and mudmode/HANDOFF.md, check the handoff against the live state, then continue."
6. End every chat with: "Rewrite mudmode/HANDOFF.md and add any real lesson to mudmode/LESSONS.md."
7. Optional, later: tell your AI "check what hardware I have and tell me if `addons/LOCAL-HARDWARE.md` would help". It asks or detects first and only suggests; you decide. You never have to.

## Grow it later
- Week 1: add a guard (hook or permission setting) for your top 3 "always ask" actions.
- Week 2: add a reviewer job that writes PASS / WARN / FAIL against a task card.
- Later: more AIs (one adapter each, all pointing at the same CORE), project add-ons, a scheduled check that the adapters still match CORE.

## Sharing back (optional, opt-in)
If you want to help improve mudmode, you can send a lesson in this fixed form: problem (one line) / fix / result (which AI and version) / confidence. Your AI drafts it; you read it and send it yourself. Never include names, paths, repo names, logs or secrets.

## License and warranty
License: mudmode Personal Use License v1.1, © 2026 Michael J Hester (full text: LICENSE in the mudmode repo). Provided as is, no warranty. Not legal, tax or financial advice.
