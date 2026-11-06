# CORE-LOCAL: your own settings

This is the owner's file. `CORE.md` rule 9 points here; the `mudgo:` and `Modules:` lines pick what loads (see `CORE.md` Part 2 and "Always on"). The newest words from the owner beat anything written here.

- **Owner (who the AIs work for):** {{NAME}}
- **Time zone for every time you write:** {{TZ}}
- **Extra "always ask first" actions (added to CORE rule 3):** {{ASK}}
- **Word rules (CORE rule 9):** {{WORDS}}
- **Shared folder:** {{DIR}}
- **mudgo (auto, on or off; see CORE.md Part 2):** {{PRO}}
- **Modules on while mudgo is not on (comma list, or none; with mudgo on, CORE.md Part 2 already holds every rule):** {{MODULES}}
- **Suggestions (side notes about modules: on or quiet):** on
- **Claude Code may use the shared folder from any project without asking (setup question 6):** {{ALLOWDIR}}
- **Update check (on or off; when on, "mudmode status" also runs `tools/check-update.sh`, or `tools/check-update.ps1` on Windows, which only reads mudmodecrew.com/version.json and says if a newer kit is out; it never installs anything):** {{UPDATECHECK}}
- **Short name "mud" (on or off; on: "mud status" works like "mudmode status"):** {{MUDSHORT}}
- **Problem reports (opt-in placeholder, off or on; off unless the owner says yes; nothing is sent by this version; see CORE.md "Upkeep"):** off
- **Set up:** {{DATE}} with mudmode setup v1.4.0

To change a setting, tell any AI on the crew "change my mudmode settings": it updates this file for you, so you never need to edit it. When a setting changes, mark the old line SUPERSEDED (date, who) and keep it.
