#!/bin/bash
# mudmode one-click installer for Mac (kit v1.3.3).
# Double-click this file in the UNZIPPED kit folder. It asks the setup questions in small
# pop-up windows, then runs the kit's own setup script (setup/setup.sh) with your answers.
# It changes nothing that setup.sh would not change: your ~/mudmode folder, plus the
# connector file only if you say yes. It downloads nothing and sends nothing anywhere.
# No pop-ups available (no osascript, e.g. Linux)? It asks the same questions in this window.
# Extra options are passed straight to setup.sh, e.g. --dry-run or --target DIR.

cd "$(dirname "$0")" || exit 1
KIT="$(pwd)"
TITLE="mudmode setup"

GUI=0
if command -v osascript >/dev/null 2>&1 && [ -z "${MUDMODE_NO_GUI:-}" ]; then GUI=1; fi

finish() { # wait for Enter before the Terminal window closes (only when a person is watching)
  if [ -t 0 ]; then printf '\nPress Enter to close this window. '; read -r _; fi
  exit "${1:-0}"
}
stopped() { echo "Stopped. Nothing was changed."; finish 0; }

# --- small dialog helpers (pop-up on Mac, terminal prompt otherwise) -------------
info() { # $1 message
  if [ "$GUI" -eq 1 ]; then
    osascript - "$1" "$TITLE" >/dev/null 2>&1 <<'OSA'
on run argv
  display dialog (item 1 of argv) with title (item 2 of argv) buttons {"OK"} default button "OK"
end run
OSA
  else printf '\n%s\n' "$1"; fi
}
ask_ok() { # $1 message; returns 1 if the person picks Cancel
  if [ "$GUI" -eq 1 ]; then
    osascript - "$1" "$TITLE" >/dev/null 2>&1 <<'OSA'
on run argv
  display dialog (item 1 of argv) with title (item 2 of argv) buttons {"Cancel", "Continue"} default button "Continue" cancel button "Cancel"
end run
OSA
    return $?
  fi
  printf '\n%s\nPress Enter to continue (or type q to stop): ' "$1"
  read -r a || a=""
  case "$a" in [Qq]*) return 1 ;; esac; return 0
}
ask_text() { # $1 question, $2 default -> prints the answer (empty = default)
  if [ "$GUI" -eq 1 ]; then
    a=$(osascript - "$1" "$2" "$TITLE" 2>/dev/null <<'OSA'
on run argv
  text returned of (display dialog (item 1 of argv) default answer (item 2 of argv) with title (item 3 of argv) buttons {"Cancel", "OK"} default button "OK" cancel button "Cancel")
end run
OSA
) || return 1
  else
    printf '%s (Enter = %s): ' "$1" "$2" >&2; read -r a || a=""
  fi
  [ -z "$a" ] && a=$2; printf '%s' "$a"
}
ask_yn() { # $1 question, $2 default y|n; returns 0 for yes
  if [ "$GUI" -eq 1 ]; then
    if [ "$2" = y ]; then d="Yes"; else d="No"; fi
    b=$(osascript - "$1" "$d" "$TITLE" 2>/dev/null <<'OSA'
on run argv
  button returned of (display dialog (item 1 of argv) with title (item 3 of argv) buttons {"No", "Yes"} default button (item 2 of argv))
end run
OSA
)
    [ -z "$b" ] && b=$d
    [ "$b" = "Yes" ]; return
  fi
  if [ "$2" = y ]; then hint="[Y/n]"; else hint="[y/N]"; fi
  printf '%s %s ' "$1" "$hint"; read -r a || a=""
  case "$a" in [Yy]*) return 0 ;; [Nn]*) return 1 ;; *) [ "$2" = y ] ;; esac
}

# --- is this the unzipped kit? ---------------------------------------------------
if [ ! -f "$KIT/setup/setup.sh" ]; then
  info "Please unzip the mudmode download first (double-click the .zip file in Finder), then open the new folder and double-click \"Install mudmode (double-click me)\" in there."
  finish 1
fi

# --- questions -------------------------------------------------------------------
TARGET_TXT="~/mudmode"
for a in "$@"; do [ "${prev:-}" = "--target" ] && TARGET_TXT=$a; prev=$a; done
TARGET_ABS=$TARGET_TXT; case "$TARGET_ABS" in "~"/*) TARGET_ABS="$HOME/${TARGET_ABS#\~/}" ;; esac

ask_ok "Welcome! This sets up mudmode on this Mac.

It makes one folder for you: $TARGET_TXT
Nothing else on this Mac changes unless you say yes in the next questions. Nothing is downloaded or sent anywhere.

You'll answer a few short questions." || stopped

guess_tz() {
  t=""
  if [ -n "${TZ:-}" ]; then t=$TZ
  elif [ -L /etc/localtime ]; then t=$(readlink /etc/localtime | sed 's#.*zoneinfo/##')
  elif [ -f /etc/timezone ]; then t=$(cat /etc/timezone); fi
  [ -n "$t" ] || t=$(date +%Z)
  printf '%s' "$t"
}

if [ -f "$TARGET_ABS/CORE-LOCAL.md" ]; then
  info "You already have mudmode settings in $TARGET_TXT/CORE-LOCAL.md. They stay as they are, and so do your own files. Setup updates the rule files in cores/ and modules/ (with a backup of each), and CORE.md and the connector files if you never edited them."
  NAME=kept; TZONE=kept; ASK=kept; WORDS=kept
else
  NAME=$(ask_text "1 of 6. What name should your AI crew call you?" "the owner") || stopped
  TZONE=$(ask_text "2 of 6. Your time zone? (the guess is usually right; just click OK)" "$(guess_tz)") || stopped
fi
CONNECT=none
if ask_yn "3 of 6. Do you use Claude Code (or the Code tab in the Claude desktop app)?

Yes = every new Claude Code chat follows mudmode automatically. Not sure? Choose No." n; then CONNECT=claude; fi
if ask_yn "4 of 6. Do you use Grok Build (the grok command-line tool)?

Not sure? Choose No." n; then
  if [ "$CONNECT" = claude ]; then CONNECT=both; else CONNECT=grok; fi
fi
if [ "$NAME" != kept ]; then
  ASK=$(ask_text "5 of 6 (optional). Anything your AIs must always ask you before doing? (extra to the built-in list)" "nothing extra") || stopped
  WORDS=$(ask_text "6 of 6 (optional). Any words your AIs should always use or never use?" "none") || stopped
fi
ALLOW=no
case "$CONNECT" in claude|both)
  if ask_yn "Last one. Let Claude Code open $TARGET_TXT from any project without asking each time?

(This adds the folder to Claude Code's settings file, after making a backup. Not sure? Choose No.)" n; then ALLOW=yes; fi ;;
esac

# --- run the kit's own setup ------------------------------------------------------
echo "Running the mudmode setup..."
LOG=$(mktemp 2>/dev/null || mktemp -t mudmode-install)
sh "$KIT/setup/setup.sh" --yes --name "$NAME" --tz "$TZONE" --connect "$CONNECT" \
   --ask-first "$ASK" --words "$WORDS" --allow-dir "$ALLOW" "$@" 2>&1 | tee "$LOG"
if ! grep -q '^RESULT: OK' "$LOG"; then
  PROB=$(grep '^PROBLEM' "$LOG" | head -3)
  rm -f "$LOG"
  info "Setup did not finish.

${PROB:-See the Terminal window for details.}

Nothing was deleted. Take a screenshot of the Terminal window and send it to mudmode support (contact details: mudmodecrew.com/privacy.html#contact)."
  finish 1
fi
KEPT=$(sed -n 's/.*kept yours \([0-9]*\)).*/\1/p' "$LOG" | head -1)
DRYRUN=0; grep -q 'dry run' "$LOG" && DRYRUN=1
LITE=0; grep -q "^You're in lite mode" "$LOG" && LITE=1
MUDTXT=""; grep -q '"mud status" works too' "$LOG" && MUDTXT=' ("mud status" works too)'
rm -f "$LOG"
[ "$DRYRUN" -eq 1 ] && { info "Dry run finished: nothing was written. See the Terminal window for what setup would do."; finish 0; }

# --- done: what to do next --------------------------------------------------------
HAVE_CLAUDE=0
if command -v claude >/dev/null 2>&1 || [ -x "$HOME/.local/bin/claude" ]; then HAVE_CLAUDE=1; fi
NEXT="Done! mudmode is set up in $TARGET_TXT."
CHATF=mudmode-chat-setup.md; [ "$LITE" -eq 1 ] && CHATF=mudmode-chat-lite.md
[ -n "$KEPT" ] && [ "$KEPT" != 0 ] && NEXT="$NEXT
($KEPT file(s) you already had were kept as they were.)"
case "$CONNECT" in
  claude|both)
    NEXT="$NEXT

Next: open Claude Code (the Code tab in the Claude desktop app, or type claude in Terminal) and start a NEW chat, in any folder. It follows mudmode by itself. Say \"mudmode status\" any time$MUDTXT and \"handoff\" before you stop."
    if [ "$HAVE_CLAUDE" -eq 0 ]; then NEXT="$NEXT

Note: the claude command was not found on this Mac. If you use the Claude desktop app's Code tab, you're fine. Otherwise install Claude Code yourself from the official page: https://code.claude.com/docs/en/quickstart (this installer does not install it for you)."; fi ;;
  grok) NEXT="$NEXT

Next: start a NEW chat in Grok Build. It follows mudmode by itself. Say \"mudmode status\" any time$MUDTXT and \"handoff\" before you stop." ;;
  *) NEXT="$NEXT

Next: you didn't connect an AI app on this computer. Using a chat app (claude.ai, Grok, ChatGPT)? Make a new Project, add the file FOR-CHAT-APPS/$CHATF from this download, and type: Read $CHATF and set me up." ;;
esac
NEXT="$NEXT

Daily report: say \"mudmode report\" any time; if your AI can run scheduled tasks, it will offer to write one nightly in reports/ (only with your OK)."
[ "$LITE" -eq 1 ] && NEXT="$NEXT

You're in lite mode; say \"mudmode full\" for every module."
info "$NEXT"
echo; echo "$NEXT"
if [ "$GUI" -eq 1 ] && [ "$(uname -s)" = Darwin ] && ask_yn "Open your mudmode folder now?" n; then open "$TARGET_ABS"; fi
finish 0
