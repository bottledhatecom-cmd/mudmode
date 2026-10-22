# Adapter for any AI without special tools (chat-only AI, a new tool, or a local model if you run one)

You need only three things: read and write files in the shared folder, run commands (or ask the owner to run them and paste the result), and read a clock. No special hardware is needed; local or GPU features are optional (`addons/LOCAL-HARDWARE.md`).

- **At start:** read `CORE.md`, your inbox file, `JOBS.md` and `LESSONS.md`. Register your job and write `PROGRESS.md`.
- **No memory between chats?** The shared folder is your memory. Update `jobs/<name>/PROGRESS.md` at every milestone and `HANDOFF.md` before you stop.
- **No guard?** Before any "always ask" action (CORE rule 3), write the request in `OK-LEDGER.md` and wait for the owner's own words.
- **No scheduler?** Write the schedule you want in `OPEN-QUESTIONS.md`; the owner or an AI with a scheduler owns it.
- **Can't run commands?** Write the exact command, ask the owner to run it, and paste the result into PROGRESS.
- Never touch another AI's own files; when you change something the others rely on, write it in their inbox file the same turn.
