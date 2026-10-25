# mudmode quick setup (for Claude Code or another AI that works with files)

AI: please set up the free mudmode Crew kit for me, quietly. Show me only short plain lines, one per step, like "Getting the kit...", "Checking it's the real file...", "Setting it up...", "Done." No commands or tech words on screen unless something goes wrong; then tell me in one plain line. Where the kit's README.md or setup/AI-SETUP.md say something different, this page wins; still follow their ground rules.

1. Ask me only this, then wait: "I'll put mudmode, a few plain text rule files, in a mudmode folder in your home folder, and connect it so new chats in this AI follow it. Nothing else on your computer changes. OK? (yes / yes, but don't connect it / use another folder)". If a mudmode folder is already there, say so in the same message (setup keeps my files and backs up anything it updates). Another folder must be new or empty: never my home folder itself, a whole drive, or a folder with other files in it.
2. Make one new empty folder inside this computer's temp folder and download https://mudmodecrew.com/starter-kit/mudmode-starter-kit.zip into it. Go on only if its SHA-256 passes:
   - bash: `echo "ac8833cac27b3baa084e89fde2831a6934d4777e46b8f54a3b6ccca7887f65b8  mudmode-starter-kit.zip" | sha256sum -c` prints `mudmode-starter-kit.zip: OK` (macOS: `shasum -a 256 -c` instead of `sha256sum -c`)
   - PowerShell: `(Get-FileHash mudmode-starter-kit.zip -Algorithm SHA256).Hash -eq 'AC8833CAC27B3BAA084E89FDE2831A6934D4777E46B8F54A3B6CCCA7887F65B8'` prints `True`
   If it fails, delete that one file, tell me "The download didn't match, so I stopped. Copy a fresh prompt from mudmodecrew.com and try again.", and stop.
3. Unzip it there, read README.md, setup/AI-SETUP.md and the setup script, then run AI-SETUP.md step 2's command (bash or PowerShell, whichever works here) with: `--yes`; `--connect claude` only if you are Claude Code and I said yes (`--connect grok` for Grok Build; otherwise `--connect none`); my time zone as a name like `America/Chicago`, from this computer's settings; my folder if I named one (`--target`). PowerShell uses -Yes, -Connect, -Tz, -Target. Everything else stays at its default. Write only in the new mudmode folder, plus the one connector file I said yes to; delete nothing of mine; nothing else online.
4. When the script ends with `RESULT: OK`, delete only the temp folder from step 2: one command, its full path in quotes, no variables or wildcards. If you're not sure of the path, leave it and tell me where it is.
5. Tell me I'm done in 3 short lines:
   - where the folder is;
   - if connected: "Start a new chat and it follows mudmode. Say handoff before you stop, and mudmode status any time." If not connected: "Start a chat with: Read ~/mudmode/CORE.md, ~/mudmode/CORE-LOCAL.md and ~/mudmode/HANDOFF.md, then continue." (with my folder if I picked one);
   - "Say change my mudmode settings to change your name or time zone (I guessed <zone>), or to turn on update notices."
   If I ask how to undo it: delete the connector file and the mudmode folder, but only the ones setup made new.

The kit is free under the mudmode Personal Use License (https://mudmodecrew.com/license.txt, also in the zip as LICENSE); by having your AI download it, I agree to it. Your AI app may ask before each command: allow each one once, not "always allow". Never put secrets or passwords in any mudmode file.
