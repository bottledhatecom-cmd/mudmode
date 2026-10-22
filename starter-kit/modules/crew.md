# mudmode module: crew

**Adds:** the rules for two or more AIs: other AIs' files, shared systems another AI owns, and inbox notes. Its rules replace the *lite* lines in `CORE.md`.

5. Another AI's own files (memory, logs, handoffs, chats) are read-only. Notes for it go only in its inbox file.
6. Shared systems another AI owns (job queues, scheduled loops, off-flag files, backup folders) are not yours to change without the owner's word. Off flags always win.
17. Tell the other AIs what you set up or changed, the same turn, in their inbox file (what, where, why, how to undo, what is open).

**Files:** `NOTE-FOR-<AI>.md` (one inbox file per AI), `OPEN.md` (the open-items list).
