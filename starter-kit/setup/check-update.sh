#!/bin/sh
# mudmode update check (v1.3.5). OFF unless you turn it on: CORE-LOCAL.md line "Update check ...: on".
# When on, it reads one small public file (https://mudmodecrew.com/version.json) and tells you if a
# newer mudmode kit is out, and how to update. It never downloads or installs anything, and it sends
# no personal info, just a normal web request: no ID, no cookies, no settings (like any web visit,
# the site sees your internet address). If you're offline it says so and changes nothing.
# Safety: it only uses https:// addresses (also after a redirect), reads at most 4096 bytes, and only
# prints version numbers (digits and dots). It never prints other text from the file: the "what's new"
# pointer below is fixed text written here.
# Update key (v1.4.0): this kit ships mudmode's real public update key (minisign, Ed25519) as
# tools/update-key.pub, and the same key line is written below (UPDATE_KEY). Before it checks anything, this
# script makes sure that file is there and holds exactly that key; if not, it checks nothing and says so.
# It still never downloads, installs or applies anything: you get a new mudmode yourself. A downloaded update
# would have to pass a minisign signature check against this key before it is used, and this script
# can't check a minisign signature with what it has built in, so "--apply FILE" always refuses and never opens
# that file: this version uses no update file it can't verify.
# Usage: sh ~/mudmode/tools/check-update.sh
LC_ALL=C; export LC_ALL
UPDATE_KEY='RWTSpU4Hr4bBpWocWhRC1lvgdmQkJ1mTFCSovtzIz0C6t281SJS3ej72'   # mudmode's public update key (minisign key line); tools/update-key.pub must hold exactly this
if [ "${1:-}" = --apply ]; then
  echo "mudmode update check: this version can't verify an update file's signature against mudmode's update key, so it won't use that file. Nothing changed."
  exit 3
fi
DIR=$(cd "$(dirname "$0")/.." && pwd)
URL=${MUDMODE_VERSION_URL:-https://mudmodecrew.com/version.json}
MAX=4096
SETTING=$(grep '^- \*\*Update check' "$DIR/CORE-LOCAL.md" 2>/dev/null | head -n 1 | sed 's/.*:\*\* *//' | awk '{ print tolower($1) }')
if [ "$SETTING" != on ]; then
  echo "mudmode update check is off. Say \"turn on the mudmode update check\" to your AI if you want it."
  exit 0
fi
KEYF="$(cd "$(dirname "$0")" && pwd)/update-key.pub"
key_ok() {
  [ -f "$KEYF" ] || return 1
  [ "$(wc -l < "$KEYF" | tr -d ' ')" = 2 ] || return 1
  head -n 1 "$KEYF" | tr -d '\r' | grep -Eq '^untrusted comment: minisign public key [0-9A-F]{16}$' || return 1
  [ "$(sed -n 2p "$KEYF" | tr -d ' \t\r')" = "$UPDATE_KEY" ]
}
cant() { echo "mudmode update check: not checked this time; it tries again next time. Nothing changed."; exit 0; }
isver() { [ ${#1} -le 20 ] && printf '%s\n' "$1" | grep -Eq '^[0-9]+(\.[0-9]+)*$'; }
if [ ${#URL} -gt 300 ] || [ "$(printf '%s' "$URL" | wc -l | tr -d ' ')" != 0 ] || ! printf '%s\n' "$URL" | grep -Eq '^https://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$'; then
  echo "mudmode update check: the version file address must start with https://, so nothing was checked. Nothing changed."
  exit 0
fi
if ! key_ok; then
  echo "mudmode update check: mudmode's update key (tools/update-key.pub) is missing or isn't the one this kit shipped, so nothing was checked. Run mudmode setup again to put it back. Nothing changed."
  exit 0
fi
KIT=crew; NAME="free Crew kit"; [ -d "$DIR/full-kit" ] && KIT=full && NAME="Full Kit"
# v1.3.5: read VERSION the way the PowerShell check does: a UTF-8 byte-order mark, or a UTF-16 / UTF-32 one (Notepad,
# PowerShell 5.1 ">"), is decoded; UTF-16 without a mark counts as unreadable (then CORE.md's Version line is used).
read_ver() {
  [ -f "$1" ] || return 0
  bom=$(od -An -tx1 -N4 "$1" 2>/dev/null | tr -d ' \n')
  case "$bom" in
    efbbbf*) tail -c +4 "$1" ;;
    0000feff*) tail -c +5 "$1" | tr -d '\000' ;;
    fffe*|feff*) tail -c +3 "$1" | tr -d '\000' ;;
    *) [ "$(head -c 64 "$1" | tr -cd '\000' | wc -c | tr -d ' ')" = 0 ] && cat "$1" ;;
  esac | head -n 1 | tr -d ' \t\r'
}
HAVE=$(read_ver "$DIR/VERSION")
isver "$HAVE" || HAVE=$(sed -n 's/^Version: \([0-9][0-9.]*[0-9]\).*/\1/p' "$DIR/CORE.md" 2>/dev/null | head -n 1)
isver "$HAVE" || HAVE=""
if command -v curl >/dev/null 2>&1; then
  # if curl stops with an error (for example the file is too big), FAILED is added so the reply is never used
  JSON=$( { curl -fsS -L --proto =https --proto-redir =https --max-redirs 3 --max-filesize $MAX --connect-timeout 10 --max-time 15 -A mudmode-update-check "$URL" 2>/dev/null || echo " mudmode-FAILED"; } | head -c $((MAX + 64)))
elif command -v wget >/dev/null 2>&1; then
  # BusyBox wget has no --https-only, so it could not keep to https: say so plainly instead of trying.
  if wget --help 2>&1 | head -n 3 | grep -qi busybox; then
    echo "mudmode update check: this computer only has BusyBox wget, which can't be limited to https://, so nothing was checked this time. Nothing changed."
    exit 0
  fi
  # wget can't limit redirects to https, so it follows none.
  JSON=$( { wget -q --https-only --max-redirect=0 -T 15 -U mudmode-update-check -O - "$URL" 2>/dev/null || echo " mudmode-FAILED"; } | head -c $((MAX + 64)))
else JSON=""; fi
[ ${#JSON} -le $MAX ] || cant
case "$JSON" in *mudmode-FAILED*) cant ;; esac
# keep printable characters only (no ESC, BEL or other control characters), on one line
JSON=$(printf '%s' "$JSON" | tr -cd ' -~')
NEW=$(printf '%s\n' "$JSON" | sed -n "s/.*\"$KIT\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p")
isver "$NEW" || NEW=""
if [ -z "$NEW" ] || [ -z "$HAVE" ]; then cant; fi
if awk -v a="$NEW" -v b="$HAVE" 'BEGIN { n = split(a, x, "."); m = split(b, y, "."); k = (n > m) ? n : m
    for (i = 1; i <= k; i++) { if ((x[i] + 0) > (y[i] + 0)) exit 0; if ((x[i] + 0) < (y[i] + 0)) exit 1 } exit 1 }'; then
  echo "A newer mudmode is out: $NAME $NEW (you have $HAVE)."
  if [ "$KIT" = full ]; then   # holder-r4: Windows exe users run the new setup; only Mac/Linux unzip
    echo "To update on Windows: download the new mudmode setup (mudmode.$NEW.exe) and run it. It backs up your mudmode folder first; your settings and work files stay as they are."
    echo "On a Mac or Linux: download the new kit's .zip, unzip it into a new folder, then tell your AI \"Read README-START-HERE.md and set me up.\" in that folder. It does the rest; your settings and work files stay as they are."
  else echo "To update: download the new kit and unzip it, then tell your AI \"Read README-START-HERE.md and set me up.\" in that folder. It does the rest; your settings and work files stay as they are."; fi
  if [ "$KIT" = crew ]; then echo "What's new: https://mudmodecrew.com/starter-kit/CHANGELOG.md"
  else echo "What's new: see CHANGELOG.md in the new kit."; fi
else
  echo "mudmode is up to date ($NAME $HAVE)."
fi
exit 0
