#!/bin/sh
# mudmode update check (v1.3.3). OFF unless you turn it on: CORE-LOCAL.md line "Update check ...: on".
# When on, it reads one small public file (https://mudmodecrew.com/version.json) and tells you if a
# newer mudmode kit is out, and how to update. It never downloads or installs anything, and it sends
# no personal info, just a normal web request: no ID, no cookies, no settings (like any web visit,
# the site sees your internet address). If you're offline it says so and changes nothing.
# Safety: it only uses https:// addresses (also after a redirect), reads at most 4096 bytes, and only
# prints version numbers (digits and dots). It never prints other text from the file: the "what's new"
# pointer below is fixed text written here.
# Usage: sh ~/mudmode/tools/check-update.sh
LC_ALL=C; export LC_ALL
DIR=$(cd "$(dirname "$0")/.." && pwd)
URL=${MUDMODE_VERSION_URL:-https://mudmodecrew.com/version.json}
MAX=4096
SETTING=$(grep '^- \*\*Update check' "$DIR/CORE-LOCAL.md" 2>/dev/null | head -n 1 | sed 's/.*:\*\* *//' | awk '{ print tolower($1) }')
if [ "$SETTING" != on ]; then
  echo "mudmode update check is off. To turn it on, set the \"Update check\" line in CORE-LOCAL.md to on (or ask your AI to)."
  exit 0
fi
cant() { echo "mudmode update check: couldn't check right now (offline, or the version file wasn't readable). Nothing changed."; exit 0; }
isver() { [ ${#1} -le 20 ] && printf '%s\n' "$1" | grep -Eq '^[0-9]+(\.[0-9]+)*$'; }
if [ ${#URL} -gt 300 ] || [ "$(printf '%s' "$URL" | wc -l | tr -d ' ')" != 0 ] || ! printf '%s\n' "$URL" | grep -Eq '^https://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$'; then
  echo "mudmode update check: the version file address must start with https://, so nothing was checked. Nothing changed."
  exit 0
fi
KIT=crew; NAME="free Crew kit"; [ -d "$DIR/full-kit" ] && KIT=full && NAME="Full Kit"
HAVE=$(head -n 1 "$DIR/VERSION" 2>/dev/null | tr -d ' \r')
isver "$HAVE" || HAVE=$(sed -n 's/^Version: \([0-9][0-9.]*[0-9]\).*/\1/p' "$DIR/CORE.md" 2>/dev/null | head -n 1)
isver "$HAVE" || HAVE=""
if command -v curl >/dev/null 2>&1; then
  # if curl stops with an error (for example the file is too big), FAILED is added so the reply is never used
  JSON=$( { curl -fsS -L --proto =https --proto-redir =https --max-redirs 3 --max-filesize $MAX --connect-timeout 10 --max-time 15 -A mudmode-update-check "$URL" 2>/dev/null || echo " mudmode-FAILED"; } | head -c $((MAX + 64)))
elif command -v wget >/dev/null 2>&1; then
  # BusyBox wget has no --https-only, so it could not keep to https: say so plainly instead of trying.
  if wget --help 2>&1 | head -n 3 | grep -qi busybox; then
    echo "mudmode update check: this computer only has BusyBox wget, which can't be limited to https://, so nothing was checked. Install curl to use the update check. Nothing changed."
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
  echo "To update: download the new kit, then run its setup again (see \"Updating to a new version\" in its README). Your settings and work files stay as they are."
  if [ "$KIT" = crew ]; then echo "What's new: https://mudmodecrew.com/starter-kit/CHANGELOG.md"
  else echo "What's new: see CHANGELOG.md in the new kit."; fi
else
  echo "mudmode is up to date ($NAME $HAVE)."
fi
exit 0
