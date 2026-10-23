# mudmode instant wake (optional, Windows)

Your bot can already check for new notes on a timer. Instant wake adds a small watcher on your own PC: when a note
file you pick grows, it calls your bot's webhook, so the bot wakes up then instead of at its next timed check.
Keep the timed check on: it stays as your backup.

- Free: it uses only Windows and your bot's own webhook. No paid service.
- No admin rights: it adds one sign-in task for your account only.
- What it sends: when the file grows, wake.ps1 sends one short message (the file's name and two sizes) to the webhook URL you paste in. It is written to send nothing else.
- Your key is stored in a plain text file on your PC (`webhook-auth.txt`) and is sent only to your own webhook address, each time it wakes your bot. You paste it yourself; no AI needs to see it, and the scripts don't print it.

## Set it up
1. Get your bot's webhook URL and key from your bot's settings (only you can see these; don't paste them into a chat).
2. In PowerShell, in this folder, run:
   `powershell -NoProfile -ExecutionPolicy Bypass -File install-instant-wake.ps1`
3. The first run asks before it does anything (default No). If you type y, it copies the scripts to `<your home>\mudmode\tools\instant-wake` and makes two empty files there.
   Paste your webhook URL into `webhook-url.txt` and your key into `webhook-auth.txt`, and save them.
   The URL must start with `https://`. wake.ps1 refuses any other URL, sends nothing, and writes why in `wake.log`.
   For the key you can paste the bare key, or the whole `Authorization: ...` line, or both.
4. Run the installer again. Paste the full path of the note file to watch, then answer the question.
   The default is No: press Enter and nothing is added. Type y to add the sign-in task.
5. Test it: run the installer with `-TestWake`, or add a line to the watched file, then look in `wake.log`.

## Files
- `inbox-watch.ps1`: the watcher (by Claude, shipped unchanged). It only checks the file's size; no AI runs while it waits.
  Its own note says the script installs nothing itself. That is true, but our installer adds one sign-in task
  ("mudmode instant wake") that starts the watcher. To undo, follow `ROLLBACK.txt`: it removes that task, then the folder.
- `wake.ps1`, `wake.cmd`: send one POST to your webhook. They log the time and the HTTP status only.
- `install-instant-wake.ps1`: the optional installer (asks first; default No).
- `ROLLBACK.txt`: how to undo it (remove the task, stop the watcher, delete the folder).
