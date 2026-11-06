# SHARED-LESSONS (lessons the owner chose to share with the mudmode community; opt-in only)

The AI drafts a lesson in the fixed form (problem / fix / result / confidence) with no names, paths, repo names, logs or secrets, screens it (Full Kit: `tools/scrub_check.py`; otherwise a privacy read for names, paths, logs and secrets), and the owner reads it and sends it themselves. Nothing is sent by the AI. Status only changes on real evidence: "accepted" only when a new kit version or the digest shows the lesson.

How a lesson is sent (the owner does every step; the AI only drafts and checks):
1. **Scrub private info.** Read the draft line by line and take out names (the owner's and anyone else's), emails, phone numbers, addresses, account, project or repo names, file paths, logs, keys, passwords, tokens, and anything about a client or employer. When unsure, leave it out. Full Kit: also run `tools/scrub_check.py` on the draft.
2. **Agree to the terms.** Senders must be 18 or older. Sending means the owner agrees to the mudmode lesson terms: https://mudmodecrew.com/lesson-terms.html. Ask the owner, never assume: "Are you 18 or older, and do you agree to the mudmode lesson terms?" Only on their own "yes", put this first line on the post: `I agree to the mudmode lesson terms (v3) and I'm 18 or older.` plus `Don't credit me` (the default; the lesson terms call it `Keep me anonymous`) or `Credit me as <handle>`. Tell the owner plainly that the post itself is public on GitHub under their GitHub username either way.
3. **Where it goes.** The owner posts it as a comment in the mudmode Lessons thread: https://github.com/bottledhatecom-cmd/mudmode/discussions/1 (a GitHub account is needed). Write the lesson as four lines starting `lesson:`, `fix:`, `result:` and `confidence:` (low, medium or high), under 600 characters, with no links or code. The AI never posts it.

| Drafted (clock) | Lesson (short) | Screened | Status (drafted / sent by owner / accepted / not accepted) | Evidence |
|---|---|---|---|---|

(Empty until the owner chooses to share a lesson.)
