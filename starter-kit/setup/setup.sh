#!/bin/sh
# mudmode setup v1.3.3 (macOS, Linux, Windows Git Bash).
# Copies the kit into ONE folder you own (default: ~/mudmode). Outside that folder it only
# READS, except one optional connector file you say yes to (~/.claude/rules/mudmode.md for
# Claude Code, ~/.grok/AGENTS.md for Grok Build). It never deletes anything. On a rerun it updates,
# with a backup first: the rule files in cores/ and modules/, plus CORE.md and the connector files
# when they still match a released mudmode version. Any other file you have is kept unless you
# say yes to replacing it (with --yes it keeps your file and tells you).
# Short name: "mud status" works like "mudmode status" in your AI chats. It is a word your AI
# understands, not a terminal command, so setup changes no shell profile. If this computer already
# has a command called mud (or setup can't check), setup leaves it alone, turns the short name off
# and says so.
# Opt-in only (--allow-dir yes): adds the folder to Claude Code's permissions.additionalDirectories in
# ~/.claude/settings.json, after a dated backup, changing nothing else in that file.
# Usage: sh setup/setup.sh [--target DIR] [--connect claude|grok|both|none] [--name NAME]
#        [--tz ZONE] [--ask-first TEXT] [--words TEXT] [--allow-dir yes|no] [--mode lite|full] [--update-check on|off] [--yes] [--dry-run] [--help]
set -u

KIT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SETUP_DIR="$KIT_DIR/setup"
TARGET="${HOME:?HOME is not set}/mudmode"
UPDCHK=""; CONNECT=""; NAME=""; TZONE=""; ASK=""; WORDS=""; ALLOWDIR=""; MODE=""; YES=0; DRY=0
STAMP=$(date '+%Y%m%d-%H%M'); NOW=$(date '+%Y-%m-%d %H:%M %Z')
WARNED=0; FAILED=0

usage() { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET=${2:-}; shift 2 ;;
    --connect) CONNECT=${2:-}; shift 2 ;;
    --name) NAME=${2:-}; shift 2 ;;
    --tz) TZONE=${2:-}; shift 2 ;;
    --ask-first) ASK=${2:-}; shift 2 ;;
    --words) WORDS=${2:-}; shift 2 ;;
    --allow-dir) ALLOWDIR=${2:-}; shift 2 ;;
    --mode) MODE=${2:-}; shift 2 ;;
    --update-check) UPDCHK=${2:-}; shift 2 ;;
    --yes|-y) YES=1; shift ;;
    --dry-run) DRY=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 2 ;;
  esac
done

INTERACTIVE=0
if [ "$YES" -eq 0 ] && [ -t 0 ]; then INTERACTIVE=1; fi

say()  { printf '%s\n' "$*"; }
warn() { WARNED=1; printf 'NOTE: %s\n' "$*"; }
fail() { FAILED=1; printf 'PROBLEM: %s\n' "$*"; }
ask_yn() { # $1 question, $2 default y|n
  if [ "$INTERACTIVE" -eq 0 ]; then [ "$2" = y ]; return; fi
  if [ "$2" = y ]; then hint="[Y/n]"; else hint="[y/N]"; fi
  printf '%s %s ' "$1" "$hint"; read -r a < /dev/tty || a=""
  case "$a" in [Yy]*) return 0 ;; [Nn]*) return 1 ;; *) [ "$2" = y ] ;; esac
}
ask_text() { # $1 question, $2 default -> prints answer
  printf '%s ' "$1" >&2; [ -n "$2" ] && printf '(Enter = %s) ' "$2" >&2; :
  read -r a < /dev/tty || a=""; [ -z "$a" ] && a=$2; printf '%s' "$a"
}

# --- which kit is this? -------------------------------------------------------
if [ -f "$KIT_DIR/starter-kit/CORE.md" ]; then STARTER="$KIT_DIR/starter-kit"; FULL=1
elif [ -f "$KIT_DIR/CORE.md" ]; then STARTER="$KIT_DIR"; FULL=0
else say "PROBLEM: can't find CORE.md next to the setup folder. Run this from the unzipped kit."; say "RESULT: FAILED"; exit 1; fi
for f in "$SETUP_DIR/templates/CORE-LOCAL.md" "$SETUP_DIR/templates/connector-claude.md" "$SETUP_DIR/templates/connector-agents.md"; do
  [ -f "$f" ] || { say "PROBLEM: missing $f (the kit looks incomplete; download it again)."; say "RESULT: FAILED"; exit 1; }
done

# --- target folder safety ------------------------------------------------------
case "$TARGET" in "~") TARGET=$HOME ;; "~"/*) TARGET="$HOME/${TARGET#\~/}" ;; esac
case "$TARGET" in /*|[A-Za-z]:*) ;; *) TARGET="$(pwd)/$TARGET" ;; esac
TARGET=${TARGET%/}
if [ -z "$TARGET" ] || [ "$TARGET" = "$HOME" ] || [ "$TARGET" = "/" ]; then
  say "PROBLEM: the target must be its own folder (for example ~/mudmode), not '$TARGET'."; say "RESULT: FAILED"; exit 1; fi
case "$TARGET/" in "$KIT_DIR"/*) say "PROBLEM: don't install inside the download folder; pick another place (default ~/mudmode)."; say "RESULT: FAILED"; exit 1 ;; esac
case "$TARGET" in "$HOME"/*) DIRTXT="~/${TARGET#"$HOME"/}" ;; *) DIRTXT="$TARGET" ;; esac

# --- mode (v1.3): the free kit starts in lite mode, the Full Kit in full; a rerun keeps CORE-LOCAL.md's mode --
DEFMODE=lite; [ "$FULL" -eq 1 ] && DEFMODE=full
OLDMODE=""; OLDMODS=none
if [ -f "$TARGET/CORE-LOCAL.md" ]; then
  OLDMODE=$(sed -n 's/^- \*\*Mode (.*:\*\* *\([A-Za-z]*\).*/\1/p' "$TARGET/CORE-LOCAL.md" | head -n 1 | tr 'A-Z' 'a-z')
  OLDMODS=$(sed -n 's/^- \*\*Modules [^*]*:\*\* *//p' "$TARGET/CORE-LOCAL.md" | head -n 1)
  [ -n "$OLDMODE" ] || OLDMODE=full   # set up before v1.3 (no Mode line): that was full mode
  [ -n "$OLDMODS" ] || OLDMODS=none
fi
MODE=$(printf '%s' "$MODE" | tr 'A-Z' 'a-z')
case "$MODE" in ""|lite|full) ;; *) say "PROBLEM: --mode must be lite or full."; say "RESULT: FAILED"; exit 2 ;; esac
[ -n "$MODE" ] || MODE=${OLDMODE:-$DEFMODE}

# --- questions (only when run by a person in a terminal) -------------------------
guess_tz() {
  t=""
  if [ -n "${TZ:-}" ]; then t=$TZ
  elif [ -L /etc/localtime ]; then t=$(readlink /etc/localtime | sed 's#.*zoneinfo/##')
  elif [ -f /etc/timezone ]; then t=$(cat /etc/timezone); fi
  [ -n "$t" ] || t=$(date +%Z)
  printf '%s' "$t"
}
HAVE_LOCAL=0; [ -f "$TARGET/CORE-LOCAL.md" ] && HAVE_LOCAL=1
UPDGIVEN=0; [ -n "$UPDCHK" ] && UPDGIVEN=1
if [ "$INTERACTIVE" -eq 1 ]; then
  say "mudmode setup: this makes your mudmode folder at $DIRTXT. Nothing else on this computer changes unless you say yes below."
  if [ "$HAVE_LOCAL" -eq 1 ]; then say "You already have settings in $DIRTXT/CORE-LOCAL.md; they stay as they are."
    NAME=${NAME:-kept}; TZONE=${TZONE:-kept}; ASK=${ASK:-kept}; WORDS=${WORDS:-kept}; fi
  [ -n "$NAME" ]  || NAME=$(ask_text "1. What name should the crew call you?" "the owner")
  [ -n "$TZONE" ] || TZONE=$(ask_text "2. Your time zone?" "$(guess_tz)")
  if [ -z "$CONNECT" ]; then
    c=none
    if ask_yn "3. Connect mudmode to Claude Code (every new Claude Code chat follows it)?" n; then c=claude; fi
    if ask_yn "4. Connect mudmode to Grok Build (the grok command-line tool)?" n; then
      if [ "$c" = claude ]; then c=both; else c=grok; fi; fi
    CONNECT=$c
  fi
  [ -n "$ASK" ]   || ASK=$(ask_text "5. Optional: anything the AIs must always ask before doing (extra to the built-in list)?" "nothing extra")
  [ -n "$WORDS" ] || WORDS=$(ask_text "6. Optional: words to always use or never use?" "none")
  if [ -z "$ALLOWDIR" ]; then case "$CONNECT" in claude|both)
    if ask_yn "7. Let Claude Code use $DIRTXT from any project without asking each time? (adds it to ~/.claude/settings.json; backup first)" n; then ALLOWDIR=yes; else ALLOWDIR=no; fi ;; esac; fi
  if [ -z "$UPDCHK" ] && [ "$HAVE_LOCAL" -eq 0 ]; then
    if ask_yn "8. Optional: when you say \"mudmode status\", also check online for a newer mudmode? (it only reads a small public version file, sends no personal info, just a normal web request, and never installs anything)" n; then UPDCHK=on; else UPDCHK=off; fi; fi
fi
[ -n "$NAME" ]    || NAME="the owner"
[ -n "$TZONE" ]   || TZONE=$(guess_tz)
[ -n "$ASK" ]     || ASK="nothing extra"
[ -n "$WORDS" ]   || WORDS="none"
[ -n "$CONNECT" ] || CONNECT=none
[ -n "$ALLOWDIR" ] || ALLOWDIR=no
[ -n "$UPDCHK" ] || UPDCHK=off
case "$UPDCHK" in on|off) ;; *) say "PROBLEM: --update-check must be on or off."; say "RESULT: FAILED"; exit 2 ;; esac
case "$CONNECT" in claude|grok|both|none) ;; *) say "PROBLEM: --connect must be claude, grok, both or none."; say "RESULT: FAILED"; exit 2 ;; esac
case "$ALLOWDIR" in yes|no) ;; *) say "PROBLEM: --allow-dir must be yes or no."; say "RESULT: FAILED"; exit 2 ;; esac

# --- short name "mud" (a word for your AI, not a terminal command) -------------------
# If "mud" is already a command, alias or function on this computer, the short name is off: mudmode
# never overrides it. If a profile or folder can't be read, setup can't be sure, so it is off too
# ("unsure means off"). This only reads; it changes no shell profile.
# What counts as "mud is taken" in a profile (on purpose generous: a false "taken" only means off):
#   alias mud=... / alias -- mud=... / alias -g mud=... / alias 'mud=...' / alias ll=... mud=... (sh shells)
#   alias mud '...' / alias mud "..." (fish), abbr [-a|--add ...] mud ..., function mud ...,
#   mud() / mud () / function mud() (sh shells), also after ; & | { ( on the same line.
# Not visible to this check: a mud made in a file the profile sources, by eval, or by a plugin manager.
RCFILES=".bashrc .bash_profile .bash_aliases .bash_login .profile .zshrc .zshenv .zprofile .zlogin .kshrc .mkshrc .config/fish/config.fish"
taken_in() { # $1 file -> 0 mud taken, 1 free, 2 couldn't read
  [ -r "$1" ] && awk 'END { }' "$1" 2>/dev/null || return 2
  tr -d '\r' < "$1" 2>/dev/null \
    | grep -Eq "(^|[;&|{(])[[:space:]]*(alias([[:space:]]+-[-a-zA-Z]*)*[[:space:]]+([^#]*[[:space:]])?['\"]?mud([=[:space:]'\"]|\$)|abbr([[:space:]]+-[-a-zA-Z]*)*[[:space:]]+mud([[:space:]=]|\$)|(function[[:space:]]+)?mud[[:space:]]*\(\)|function([[:space:]]+--)?[[:space:]]+mud([[:space:]{;(]|\$))" && return 0
  return 1
}
MUDWHERE=""; MUDUNSURE=0
mud_taken() {
  if p=$(command -v mud 2>/dev/null) && [ -n "$p" ]; then MUDWHERE=$p; return; fi
  for d in .config .config/fish .config/fish/conf.d .config/fish/functions; do
    if [ -d "$HOME/$d" ] && { [ ! -r "$HOME/$d" ] || [ ! -x "$HOME/$d" ]; }; then MUDWHERE="$HOME/$d"; MUDUNSURE=1; return; fi
  done
  for f in $RCFILES; do
    [ -e "$HOME/$f" ] || continue
    taken_in "$HOME/$f"; r=$?
    if [ "$r" -eq 2 ]; then MUDWHERE="$HOME/$f"; MUDUNSURE=1; return; fi
    if [ "$r" -eq 0 ]; then MUDWHERE="$HOME/$f"; return; fi
  done
  for f in "$HOME"/.config/fish/conf.d/*.fish; do
    [ -e "$f" ] || continue
    taken_in "$f"; r=$?
    if [ "$r" -eq 2 ]; then MUDWHERE=$f; MUDUNSURE=1; return; fi
    if [ "$r" -eq 0 ]; then MUDWHERE=$f; return; fi
  done
  if [ -e "$HOME/.config/fish/functions/mud.fish" ]; then MUDWHERE="$HOME/.config/fish/functions/mud.fish"; fi
}
mud_taken
case "$MUDWHERE" in "$HOME"/*) MUDWHERE="~/${MUDWHERE#"$HOME"/}" ;; esac
MUDSHORT=on
if [ "$MUDUNSURE" -eq 1 ]; then MUDSHORT="off (setup couldn't check whether mud is already taken here)"
elif [ -n "$MUDWHERE" ]; then MUDSHORT="off (this computer already has a command called mud)"; fi

# --- helpers -------------------------------------------------------------------
mkd() { [ -d "$1" ] && return 0; if [ "$DRY" -eq 1 ]; then say "would make folder $1"; else mkdir -p "$1" || fail "could not make $1"; fi; }
fill() { # template -> stdout, replacing {{NAME}} {{TZ}} {{ASK}} {{WORDS}} {{DIR}} {{DATE}} literally
  V_NAME=$NAME V_TZ=$TZONE V_ASK=$ASK V_WORDS=$WORDS V_DIR=$DIRTXT V_DATE=$NOW V_ALLOW=$ALLOWDIR V_MODE=$MODE V_MODS=$OLDMODS V_UPD=$UPDCHK V_MUD=$MUDSHORT awk '
    function rep(s, k, v,   i, out) { out=""; while ((i = index(s, k)) > 0) { out = out substr(s, 1, i-1) v; s = substr(s, i+length(k)) } return out s }
    { l=$0; l=rep(l,"{{NAME}}",ENVIRON["V_NAME"]); l=rep(l,"{{TZ}}",ENVIRON["V_TZ"]); l=rep(l,"{{ASK}}",ENVIRON["V_ASK"]);
      l=rep(l,"{{WORDS}}",ENVIRON["V_WORDS"]); l=rep(l,"{{DIR}}",ENVIRON["V_DIR"]); l=rep(l,"{{DATE}}",ENVIRON["V_DATE"]); l=rep(l,"{{ALLOWDIR}}",ENVIRON["V_ALLOW"]); l=rep(l,"{{MODE}}",ENVIRON["V_MODE"]); l=rep(l,"{{MODULES}}",ENVIRON["V_MODS"]); l=rep(l,"{{UPDATECHECK}}",ENVIRON["V_UPD"]); l=rep(l,"{{MUDSHORT}}",ENVIRON["V_MUD"]); print l }' "$1"
}
COPIED=0; KEPT=0; SAME=0; REFRESHED=0
place() { # $1 source file, $2 destination file, $3 "live" = never replace (owner's working file)
  src=$1; dst=$2
  if [ -f "$dst" ]; then
    if cmp -s "$src" "$dst"; then SAME=$((SAME+1)); return 0; fi
    if [ "${3:-}" = live ]; then KEPT=$((KEPT+1)); say "kept your $dst (it is your working file)"; return 0; fi
    if [ "$INTERACTIVE" -eq 1 ] && ask_yn "$dst already exists and is different. Replace it (your copy is backed up first)?" n; then
      if [ "$DRY" -eq 1 ]; then say "would back up and replace $dst"; return 0; fi
      pb=$(newbak "$dst"); cp -p "$dst" "$pb" && cp "$src" "$dst" && COPIED=$((COPIED+1)) && say "replaced $dst (backup: $pb)" || fail "could not replace $dst"
    else KEPT=$((KEPT+1)); say "kept your $dst (not replaced)"; fi
    return 0
  fi
  if [ "$DRY" -eq 1 ]; then say "would copy to $dst"; COPIED=$((COPIED+1)); return 0; fi
  mkd "$(dirname "$dst")"; cp "$src" "$dst" && COPIED=$((COPIED+1)) || fail "could not copy to $dst"
}
place_dir() { # copy every file under $1 into $2, keeping sub-folders
  ( cd "$1" && find . -type f ! -name '*.bak-*' ! -name '.DS_Store' | sort ) > "$TMP/list.$$"
  while IFS= read -r rel; do rel=${rel#./}; place "$1/$rel" "$2/$rel"; done < "$TMP/list.$$"
}
newbak() { b="$1.bak-$STAMP"; n=1; while [ -e "$b" ]; do b="$1.bak-$STAMP-$n"; n=$((n+1)); done; printf '%s' "$b"; }
same_core() { # $1 $2: the same text apart from the Version line (a stock core of an older version counts as stock)
  [ -f "$1" ] && [ -f "$2" ] || return 1
  grep -v '^Version: ' "$1" > "$TMP/sc1"; grep -v '^Version: ' "$2" > "$TMP/sc2"; cmp -s "$TMP/sc1" "$TMP/sc2"
}
KITREFRESH=1; [ "$FULL" -eq 0 ] && [ -d "$TARGET/full-kit" ] && KITREFRESH=0   # never swap Full Kit files for free-kit ones
refresh() { # $1 source, $2 kit-owned destination (cores/, modules/): if it differs, back it up and copy the kit's version in
  if [ "$KITREFRESH" -eq 1 ] && [ -f "$2" ] && ! cmp -s "$1" "$2"; then
    if [ "$DRY" -eq 1 ]; then say "would update $2 (backup first)"; COPIED=$((COPIED+1)); return 0; fi
    RB=$(newbak "$2"); cp -p "$2" "$RB" && cp "$1" "$2" && COPIED=$((COPIED+1)) && REFRESHED=$((REFRESHED+1)) && say "updated $2 (backup: ${RB##*/})" || fail "could not update $2"
  else place "$1" "$2"; fi
}
# --- known stock files (v1.3.3): sha256 of the CORE.md cores and connector templates in the released
# v1.3.0, v1.3.1 and v1.3.2 kits. A file that matches one byte for byte (Windows line endings count as
# the same) was written by setup and never edited.
STOCK_CORE_LITE="8df2ce0d545cc0a53b4517e6cba9f7908c0eb42724c699cc0cb1b9c671d2ad63 02158beeac2d7222fba9e401fc7549228818aa48d98d83d7a5ce3c5e0fe9e56b f4f1e69151ac5801120bb919a5a06ffd38c723ca1376a1a2330d0cc2e185916d"
STOCK_CORE_FULL="a779f75c31520275342c1b274afb561c51c340e100e244fe35fafab4be91cabd 2fdb403ef64ecd84856a90f5c5d90355d9eae335c03f85c748200bb6e6d2dee7 b461794b86be0e8acac8a55ffc203257b3b14c4cc8b93e9c9ea30c9957448d18"
STOCK_CONN="999fc995023857871a8c345bf6544b380cce2cfae22c66e2920a059a47305259 669af4c6f16c9c8b7c7dd8cfb15009c77bcffe5259ed2e38fd2194d5fe060c52 8fcfaaa9c9084b8d2120f55f3ae2c32afd5616193caeadc7f259695d00205780 b85fc69197fa843c927c286258bd80990f63ec1af0c7d8886ae3c61230af87ac a7a46d2be9c464bdbd5bec37889299753db3bac746cb6932c5a7914e3350315c 0bbb4202af065919fa0e701cc2bf756682d07d43e0c259ad3b0d46e9d6889e1f f2082caa065c3d164016baf53e6ad6c2cae11287d975d09e7e96c7d5803252fd 2006e87384ab657dae27a9c98d908b57ea983f21ff3e2f7a6578e6cd1e4834d8 46b6957686bd44516246645e36070e5f3aa9d28ccf543e4abdd384fb66caa870 8c7116b7496cbb7b9d5135d3fb4b9865ed9e0589b78ea7364b8c4f5e60745152"
sha_of() { # sha256 of $1, or nothing if this computer has no tool for it (then nothing counts as stock)
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" 2>/dev/null | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 -r "$1" 2>/dev/null | cut -d' ' -f1; fi
}
sha_lf() { tr -d '\r' < "$1" > "$TMP/lf.$$" 2>/dev/null && sha_of "$TMP/lf.$$"; }   # the same hash with Windows line endings
in_list() { [ -n "$1" ] && case " $2 " in *" $1 "*) return 0 ;; esac; return 1; }
stock_conn() { # $1 installed connector file: put {{DIR}} back where setup filled in the folder, then check the hash
  V_DIR=$DIRTXT awk 'function unrep(s, k, v,   i, out) { out=""; while ((i = index(s, k)) > 0) { out = out substr(s, 1, i-1) v; s = substr(s, i+length(k)) } return out s }
    { sub(/\r$/, ""); print unrep($0, ENVIRON["V_DIR"], "{{DIR}}") }' "$1" > "$TMP/conn.raw"
  in_list "$(sha_of "$TMP/conn.raw")" "$STOCK_CONN"
}
conn_update() { # $1 new connector text, $2 installed copy: replace it (backup first) only if it is an unedited stock connector
  [ "$KITREFRESH" -eq 1 ] && [ -f "$2" ] && ! cmp -s "$1" "$2" && stock_conn "$2" || return 1
  if [ "$DRY" -eq 1 ]; then say "would update $2 (backup first)"; return 0; fi
  RB=$(newbak "$2"); cp -p "$2" "$RB" && cp "$1" "$2" && say "updated $2 (backup: ${RB##*/})" || { fail "could not update $2"; return 1; }
}
refresh_dir() { ( cd "$1" && find . -type f ! -name '*.bak-*' ! -name '.DS_Store' | sort ) > "$TMP/rlist.$$"; while IFS= read -r rel; do rel=${rel#./}; refresh "$1/$rel" "$2/$rel"; done < "$TMP/rlist.$$"; }
mods_on() { # MODULES-ON.md text for $MODE (lite: the modules in $OLDMODS) -> stdout
  if [ "$MODE" = full ]; then
    cat "$STARTER/cores/MODULES-ON-FULL.md"   # full mode: the combined core holds every rule, so no module file is listed
  else
    printf '# MODULES-ON: the module files every new chat loads (mudmode)\n\n'
    printf 'Kept in step with the `Mode:` and `Modules:` lines in CORE-LOCAL.md: setup writes it once, and the AI rewrites it when the owner switches. A switch never deletes anything.\n\n'
    printf 'Mode: lite. Modules on: %s. Say "mudmode full" for every module, or "turn on the <name> module".\n' "$OLDMODS"
    for m in $(printf '%s' "$OLDMODS" | tr ',' ' '); do [ -f "$STARTER/modules/$m.md" ] && printf '@%s/modules/%s.md\n' "$DIRTXT" "$m"; done
  fi
}
TMP=$(mktemp -d 2>/dev/null || mktemp -d -t mudmode); trap 'rm -rf "$TMP"' EXIT

# --- 1. the mudmode folder -------------------------------------------------------
[ "$DRY" -eq 1 ] && say "DRY RUN: nothing will be written."
if [ -d "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  if [ "$KITREFRESH" -eq 1 ]; then say "$DIRTXT already exists. Your own files stay as they are. Rule files in cores/ and modules/ are updated, with a backup of each."
  else say "$DIRTXT already exists and holds the Full Kit. Your files stay as they are; this free kit's setup only adds files that are missing."; fi
  if [ "$INTERACTIVE" -eq 1 ] && ! ask_yn "Continue?" y; then say "Stopped. Nothing changed."; exit 0; fi
fi
mkd "$TARGET"; [ "$MODE" = full ] && mkd "$TARGET/jobs"
# full mode: CORE.md = the combined core (the v1.3.0 rules word for word); lite: the one-page safety core. A mode switch swaps it below (backup first).
CORESRC="$STARTER/cores/CORE-FULL.md"; [ "$MODE" = lite ] && CORESRC="$STARTER/cores/CORE-LITE.md"
if [ -n "$OLDMODE" ] && [ "$MODE" != "$OLDMODE" ] && [ -f "$TARGET/CORE.md" ]; then :
elif same_core "$CORESRC" "$TARGET/CORE.md"; then refresh "$CORESRC" "$TARGET/CORE.md"   # same rules, older Version line: update it (backup first)
else
  STOCKS=$STOCK_CORE_FULL; [ "$MODE" = lite ] && STOCKS=$STOCK_CORE_LITE
  if [ -f "$TARGET/CORE.md" ] && [ "$KITREFRESH" -eq 1 ] && in_list "$(sha_lf "$TARGET/CORE.md")" "$STOCKS"; then
    refresh "$CORESRC" "$TARGET/CORE.md"   # an unedited CORE.md from a released version: update it (backup first)
  elif [ -f "$TARGET/CORE.md" ] && [ "$KITREFRESH" -eq 1 ] && ! in_list "$(sha_lf "$TARGET/CORE.md")" "$STOCK_CORE_FULL $STOCK_CORE_LITE" && ! cmp -s "$CORESRC" "$TARGET/CORE.md"; then
    KEPT=$((KEPT+1)); say "kept your CORE.md: it doesn't match a released v1.3 CORE.md (your own edits, or an older version), so it was not updated (the new one is $DIRTXT/cores/${CORESRC##*/})."
  else place "$CORESRC" "$TARGET/CORE.md"; fi
fi
place_dir "$STARTER/templates" "$TARGET/templates"
place_dir "$STARTER/adapters" "$TARGET/adapters"
place_dir "$STARTER/addons" "$TARGET/addons"
refresh_dir "$STARTER/modules" "$TARGET/modules"
refresh_dir "$STARTER/cores" "$TARGET/cores"
place "$STARTER/RULE-MAP.md" "$TARGET/RULE-MAP.md"
for f in check-update.sh check-update.ps1; do [ -f "$SETUP_DIR/$f" ] && refresh "$SETUP_DIR/$f" "$TARGET/tools/$f"; done   # the opt-in update check (off unless CORE-LOCAL.md says on)
[ -f "$KIT_DIR/VERSION" ] && [ "$KITREFRESH" -eq 1 ] && refresh "$KIT_DIR/VERSION" "$TARGET/VERSION"
place "$SETUP_DIR/templates/CORE-LOCAL.md" "$TARGET/templates/CORE-LOCAL.md"
LIVEF="OK-LEDGER.md"; [ "$MODE" = full ] && LIVEF="LESSONS.md JOBS.md OK-LEDGER.md"
for f in $LIVEF; do place "$STARTER/templates/$f" "$TARGET/$f" live; done
fill "$SETUP_DIR/templates/CORE-LOCAL.md" > "$TMP/CORE-LOCAL.md"; place "$TMP/CORE-LOCAL.md" "$TARGET/CORE-LOCAL.md" live
# --update-check on|off on a rerun: change only that one line in CORE-LOCAL.md (backup first; the old line is marked SUPERSEDED)
if [ "$HAVE_LOCAL" -eq 1 ] && [ "$UPDGIVEN" -eq 1 ]; then
  CURUPD=$(grep '^- \*\*Update check' "$TARGET/CORE-LOCAL.md" | head -n 1 | sed 's/.*:\*\* *//' | awk '{ print tolower($1) }')
  if [ "$CURUPD" != "$UPDCHK" ]; then
    if [ "$DRY" -eq 1 ]; then say "would set the update check to $UPDCHK in CORE-LOCAL.md (backup first)"
    else
      UB=$(newbak "$TARGET/CORE-LOCAL.md"); cp -p "$TARGET/CORE-LOCAL.md" "$UB" || fail "could not back up CORE-LOCAL.md"
      if [ -n "$CURUPD" ]; then
        awk -v u="$UPDCHK" -v o="$CURUPD" -v n="$NOW" '!d && /^- \*\*Update check/ { sub(/:\*\* *[A-Za-z]*/, ":** " u); print; print "  - SUPERSEDED " n ", by setup: was " o; d=1; next } { print }' "$TARGET/CORE-LOCAL.md" > "$TMP/local.upd"
      else
        { cat "$TARGET/CORE-LOCAL.md"; grep '^- \*\*Update check' "$TMP/CORE-LOCAL.md"; } > "$TMP/local.upd"
      fi
      cp "$TMP/local.upd" "$TARGET/CORE-LOCAL.md" && say "update check is now $UPDCHK (in CORE-LOCAL.md; backup: ${UB##*/})" || fail "could not update CORE-LOCAL.md"
    fi
  fi
fi
# short name on a rerun: if "mud" is taken on this computer and CORE-LOCAL.md doesn't already say off,
# set that one line to off (backup first; the old line is marked SUPERSEDED). Nothing else changes.
MUDON=1
if [ -f "$TARGET/CORE-LOCAL.md" ]; then
  CURMUD=$(grep '^- \*\*Short name "mud"' "$TARGET/CORE-LOCAL.md" | head -n 1 | sed 's/.*:\*\* *//' | awk '{ print tolower($1) }')
  [ "$CURMUD" = off ] && MUDON=0
  if [ "$HAVE_LOCAL" -eq 1 ] && [ -n "$MUDWHERE" ] && [ "$CURMUD" != off ]; then
    if [ "$DRY" -eq 1 ]; then say "would set the short name \"mud\" to off in CORE-LOCAL.md (backup first)"
    else
      NB=$(newbak "$TARGET/CORE-LOCAL.md"); cp -p "$TARGET/CORE-LOCAL.md" "$NB" || fail "could not back up CORE-LOCAL.md"
      if [ -n "$CURMUD" ]; then
        awk -v u="$MUDSHORT" -v o="$CURMUD" -v n="$NOW" '!d && /^- \*\*Short name "mud"/ { i = index($0, ":** "); if (i == 0) i = index($0, ":**") - 1; print substr($0, 1, i + 3) u; print "  - SUPERSEDED " n ", by setup: was " o; d=1; next } { print }' "$TARGET/CORE-LOCAL.md" > "$TMP/local.mud"
      else
        { cat "$TARGET/CORE-LOCAL.md"; grep '^- \*\*Short name "mud"' "$TMP/CORE-LOCAL.md"; } > "$TMP/local.mud"
      fi
      cp "$TMP/local.mud" "$TARGET/CORE-LOCAL.md" && say "short name \"mud\" is now off in CORE-LOCAL.md (backup: ${NB##*/})" || fail "could not update CORE-LOCAL.md"
    fi
  fi
fi
if [ "$MUDUNSURE" -eq 1 ]; then MUDON=0; say "Short name \"mud\" is off: setup couldn't read $MUDWHERE to check whether mud is already taken, so to be safe it stays off. Keep saying \"mudmode status\"."
elif [ -n "$MUDWHERE" ]; then MUDON=0; say "Short name \"mud\" is off: this computer already has a command called mud ($MUDWHERE), and mudmode never overrides it. Keep saying \"mudmode status\"."; fi
# --- mode lines + MODULES-ON.md (v1.3) ------------------------------------------------
SWITCHED=0
if [ -n "$OLDMODE" ] && [ "$MODE" != "$OLDMODE" ]; then
  if [ "$DRY" -eq 1 ]; then say "would switch $DIRTXT to $MODE mode (CORE.md, CORE-LOCAL.md and MODULES-ON.md backed up first)"
  else
    LB=$(newbak "$TARGET/CORE-LOCAL.md"); cp -p "$TARGET/CORE-LOCAL.md" "$LB" || fail "could not back up CORE-LOCAL.md"
    if grep -q '^- \*\*Mode (' "$TARGET/CORE-LOCAL.md"; then
      awk -v m="$MODE" -v o="$OLDMODE" -v n="$NOW" '!d && /^- \*\*Mode \(/ { sub(/:\*\* *[A-Za-z]*/, ":** " m); print; print "  - SUPERSEDED " n ", by setup (mode switch): was " o; d=1; next } { print }' "$TARGET/CORE-LOCAL.md" > "$TMP/local.new"
    else
      { cat "$TARGET/CORE-LOCAL.md"; fill "$SETUP_DIR/templates/CORE-LOCAL.md" | grep -E '^- \*\*(Mode \(|Modules |Suggestions )'; } > "$TMP/local.new"
    fi
    cp "$TMP/local.new" "$TARGET/CORE-LOCAL.md" && SWITCHED=1 && say "switched $DIRTXT to $MODE mode (backup: ${LB##*/})" || fail "could not update CORE-LOCAL.md"
    if [ -f "$TARGET/CORE.md" ] && ! cmp -s "$CORESRC" "$TARGET/CORE.md"; then
      OWNED=1; same_core "$TARGET/CORE.md" "$STARTER/cores/CORE-FULL.md" || same_core "$TARGET/CORE.md" "$STARTER/cores/CORE-LITE.md" || OWNED=0
      CB=$(newbak "$TARGET/CORE.md"); cp -p "$TARGET/CORE.md" "$CB" && cp "$CORESRC" "$TARGET/CORE.md" && COPIED=$((COPIED+1)) && say "CORE.md is now the $MODE core (backup: ${CB##*/})" || fail "could not update CORE.md"
      [ "$OWNED" -eq 0 ] && say "WARNING: your CORE.md had your own edits. They are NOT in the new CORE.md; your edited copy is kept in ${CB##*/}. Put your own rules in CORE-LOCAL.md (a mode switch never changes it)."
    elif [ ! -f "$TARGET/CORE.md" ]; then cp "$CORESRC" "$TARGET/CORE.md" && COPIED=$((COPIED+1)) || fail "could not copy CORE.md"; fi
  fi
fi
mods_on > "$TMP/MODULES-ON.md"
if [ "$SWITCHED" -eq 1 ] && [ -f "$TARGET/MODULES-ON.md" ]; then
  if ! cmp -s "$TMP/MODULES-ON.md" "$TARGET/MODULES-ON.md"; then
    MB=$(newbak "$TARGET/MODULES-ON.md"); cp -p "$TARGET/MODULES-ON.md" "$MB" && cp "$TMP/MODULES-ON.md" "$TARGET/MODULES-ON.md" && COPIED=$((COPIED+1)) || fail "could not update MODULES-ON.md"
  fi
elif [ "$DRY" -eq 1 ] && [ -n "$OLDMODE" ] && [ "$MODE" != "$OLDMODE" ] && [ -f "$TARGET/MODULES-ON.md" ]; then :
elif [ "$MODE" = full ] && [ "$KITREFRESH" -eq 1 ] && [ -f "$TARGET/MODULES-ON.md" ] && head -n 1 "$TARGET/MODULES-ON.md" | grep -q '^# MODULES-ON (mudmode): full mode' && ! cmp -s "$TMP/MODULES-ON.md" "$TARGET/MODULES-ON.md"; then
  refresh "$TMP/MODULES-ON.md" "$TARGET/MODULES-ON.md"   # setup wrote it (full mode); e.g. the free kit's version before a Full Kit rerun
else place "$TMP/MODULES-ON.md" "$TARGET/MODULES-ON.md" live; fi
if [ "$MODE" = full ]; then
cat > "$TMP/HANDOFF.md" <<HOF
# HANDOFF (rewrite at the end of every session; keep the last 4 in handoff/, older ones in handoff/archive/)

**Next single action:** ask the owner what the first job is.

- **Written:** $NOW, by mudmode setup v1.3.3
- **Goal:** first session with mudmode
- **Stage:** switched on
- **Live state to re-check before editing:** none yet
- **What changed this session:** mudmode folder set up at $DIRTXT
- **Decisions made (and by whom):** owner settings in CORE-LOCAL.md (owner's answers at setup)
- **What failed or was tried and dropped:** none
- **Open asks for the owner:** none
- **Running things left behind:** none
- **Risks / watch out:** none
- **Lessons for the crew:** none
HOF
else
cat > "$TMP/HANDOFF.md" <<HOF
# HANDOFF (lite: rewrite before you stop; the full form is templates/HANDOFF.md, module handoff-plus)

**Next single action:** ask the owner what the first job is.

- **Written:** $NOW, by mudmode setup v1.3.3
- **What changed:** mudmode folder set up at $DIRTXT (lite mode)
- **Unused OKs (exact scope):** none
- **Still running:** none
- **Open asks for the owner:** none
HOF
fi
place "$TMP/HANDOFF.md" "$TARGET/HANDOFF.md" live
if [ "$FULL" -eq 1 ]; then
  for f in MUDMODE.md LICENSE.md README-START-HERE.md; do place "$KIT_DIR/$f" "$TARGET/full-kit/$f"; done
  place_dir "$KIT_DIR/adapters" "$TARGET/full-kit/adapters"
  place_dir "$KIT_DIR/tools" "$TARGET/full-kit/tools"
  place_dir "$KIT_DIR/extras" "$TARGET/full-kit/extras"
else
  [ -f "$KIT_DIR/LICENSE" ] && place "$KIT_DIR/LICENSE" "$TARGET/LICENSE"
fi
fill "$SETUP_DIR/templates/connector-claude.md" > "$TMP/claude.md"
fill "$SETUP_DIR/templates/connector-agents.md" > "$TMP/agents.md"
conn_update "$TMP/claude.md" "$TARGET/connectors/claude-rules-mudmode.md" && COPIED=$((COPIED+1)) || place "$TMP/claude.md" "$TARGET/connectors/claude-rules-mudmode.md"
conn_update "$TMP/agents.md" "$TARGET/connectors/AGENTS-snippet.md" && COPIED=$((COPIED+1)) || place "$TMP/agents.md" "$TARGET/connectors/AGENTS-snippet.md"

# --- 2. optional connector (the only write outside the folder) ---------------------
CONNECTED=""; LEFTCLAUDE=0
connect_claude() {
  dst="$HOME/.claude/rules/mudmode.md"
  if [ -f "$dst" ] && cmp -s "$TMP/claude.md" "$dst"; then CONNECTED="$CONNECTED Claude-Code"; return; fi
  if conn_update "$TMP/claude.md" "$dst"; then CONNECTED="$CONNECTED Claude-Code"; return; fi
  if [ -f "$dst" ]; then
    if [ "$INTERACTIVE" -eq 1 ] && ask_yn "$dst already exists and is different. Replace it (backup kept)?" n; then
      [ "$DRY" -eq 1 ] && { say "would back up and replace $dst"; return; }
      pb=$(newbak "$dst"); cp -p "$dst" "$pb" && cp "$TMP/claude.md" "$dst" && CONNECTED="$CONNECTED Claude-Code" || fail "could not write $dst"
    else LEFTCLAUDE=1; warn "$dst already exists with other text; left it alone. The new text is in $DIRTXT/connectors/claude-rules-mudmode.md."; fi
    return
  fi
  [ "$DRY" -eq 1 ] && { say "would write $dst"; return; }
  mkdir -p "$HOME/.claude/rules" && cp "$TMP/claude.md" "$dst" && CONNECTED="$CONNECTED Claude-Code" || fail "could not write $dst"
}
connect_grok() {
  dst="$HOME/.grok/AGENTS.md"
  if [ -f "$dst" ]; then
    if grep -q "mudmode connector" "$dst" 2>/dev/null; then conn_update "$TMP/agents.md" "$dst"; CONNECTED="$CONNECTED Grok-Build"
    else warn "you already have $dst; left it alone. To connect, add the lines in $DIRTXT/connectors/AGENTS-snippet.md to it (or ask your AI to, with a backup)."; fi
    return
  fi
  [ "$DRY" -eq 1 ] && { say "would write $dst"; return; }
  mkdir -p "$HOME/.grok" && cp "$TMP/agents.md" "$dst" && CONNECTED="$CONNECTED Grok-Build" || fail "could not write $dst"
}
case "$CONNECT" in claude) connect_claude ;; grok) connect_grok ;; both) connect_claude; connect_grok ;; esac

# --- 2b. opt-in: Claude Code allowed folders (only with --allow-dir yes) -------------
ALLOWED=""
allow_dir() {
  sp="$HOME/.claude/settings.json"; adir=$TARGET
  if command -v cygpath >/dev/null 2>&1; then adir=$(cygpath -m "$TARGET"); spn=$(cygpath -w "$sp"); else spn=$sp; fi
  if [ "$DRY" -eq 1 ]; then say "would add $adir to permissions.additionalDirectories in ~/.claude/settings.json (backup first)"; return; fi
  # Use python only if it really runs: on a Mac without the developer tools /usr/bin/python3 is only an
  # install stub (it opens a pop-up and fails), so skip it there and try node, then the no-tool note.
  py=""; r=""
  if command -v python3 >/dev/null 2>&1; then
    if [ "$(uname -s 2>/dev/null)" = Darwin ] && [ "$(command -v python3)" = /usr/bin/python3 ] && ! xcode-select -p >/dev/null 2>&1; then :
    elif python3 -c 'import json, sys' >/dev/null 2>&1; then py=python3; fi
  fi
  if [ -z "$py" ] && command -v python >/dev/null 2>&1 && python -c 'import json, sys; sys.exit(sys.version_info[0] < 3)' >/dev/null 2>&1; then py=python; fi
  if [ -n "$py" ]; then
    r=$("$py" - "$spn" "$adir" "$STAMP" <<'PY'
import json, os, shutil, sys
p, d, st = sys.argv[1:4]
data = {}
if os.path.exists(p):
    try:
        txt = open(p, encoding='utf-8').read()
        data = json.loads(txt) if txt.strip() else {}
    except Exception:
        print('BAD it is not plain JSON'); sys.exit(0)
if not isinstance(data, dict): print('BAD unexpected layout'); sys.exit(0)
perm = data.setdefault('permissions', {})
if not isinstance(perm, dict): print('BAD unexpected permissions layout'); sys.exit(0)
lst = perm.setdefault('additionalDirectories', [])
if not isinstance(lst, list): print('BAD unexpected additionalDirectories layout'); sys.exit(0)
if d in lst: print('SAME'); sys.exit(0)
lst.append(d)
b = ''
if os.path.exists(p):
    b = p + '.bak-' + st; n = 1
    while os.path.exists(b): b = p + '.bak-' + st + '-' + str(n); n += 1
    shutil.copy2(p, b)
else:
    os.makedirs(os.path.dirname(p), exist_ok=True)
tmp = p + '.mudmode-tmp'
with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(data, f, indent=2, ensure_ascii=False); f.write('\n')
json.load(open(tmp, encoding='utf-8'))
os.replace(tmp, p)
print('ADDED ' + b)
PY
)
  fi
  if [ -z "$r" ] && command -v node >/dev/null 2>&1 && node -e '0' >/dev/null 2>&1; then
    r=$(node -e '
const fs = require("fs"), path = require("path"); const [p, d, st] = process.argv.slice(1);
let data = {};
if (fs.existsSync(p)) { try { const t = fs.readFileSync(p, "utf8"); data = t.trim() ? JSON.parse(t) : {}; } catch { console.log("BAD it is not plain JSON"); process.exit(0); } }
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
if (!isObj(data)) { console.log("BAD unexpected layout"); process.exit(0); }
if (data.permissions === undefined) data.permissions = {};
if (!isObj(data.permissions)) { console.log("BAD unexpected permissions layout"); process.exit(0); }
if (data.permissions.additionalDirectories === undefined) data.permissions.additionalDirectories = [];
const l = data.permissions.additionalDirectories;
if (!Array.isArray(l)) { console.log("BAD unexpected additionalDirectories layout"); process.exit(0); }
if (l.includes(d)) { console.log("SAME"); process.exit(0); }
l.push(d); let b = "";
if (fs.existsSync(p)) { b = p + ".bak-" + st; let n = 1; while (fs.existsSync(b)) b = p + ".bak-" + st + "-" + n++; fs.copyFileSync(p, b); }
else fs.mkdirSync(path.dirname(p), { recursive: true });
const tmp = p + ".mudmode-tmp"; fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n"); JSON.parse(fs.readFileSync(tmp, "utf8")); fs.renameSync(tmp, p);
console.log("ADDED " + b);' "$spn" "$adir" "$STAMP")
  fi
  [ -z "$r" ] && r="NOTOOL"
  case "$r" in
    ADDED*) ALLOWED="added"; b=${r#ADDED }; [ -n "$b" ] && say "backed up your Claude Code settings to $b" ;;
    SAME) ALLOWED="already there" ;;
    BAD*) warn "left ~/.claude/settings.json alone (${r#BAD }). To allow the folder yourself, add \"$adir\" to permissions.additionalDirectories in that file." ;;
    NOTOOL) warn "needs Python 3 or Node.js to edit ~/.claude/settings.json safely; left it alone. To allow the folder yourself, add \"$adir\" to permissions.additionalDirectories in that file." ;;
    *) fail "could not update ~/.claude/settings.json ($r); your file is unchanged or backed up beside it" ;;
  esac
}
[ "$ALLOWDIR" = yes ] && allow_dir

# --- 3. log + result ------------------------------------------------------------
if [ "$DRY" -eq 0 ] && [ -d "$TARGET" ]; then
  { printf '\n## %s setup v1.3.3 from %s\n' "$NOW" "$(basename "$KIT_DIR")"
    printf -- '- copied %s, already the same %s, kept yours %s; connected:%s; allowed folder: %s; mode: %s\n' "$COPIED" "$SAME" "$KEPT" "${CONNECTED:- none}" "${ALLOWED:-no}" "$MODE"; } >> "$TARGET/SETUP-LOG.md"
fi
say ""
say "mudmode folder: $DIRTXT  (copied $COPIED, already the same $SAME, kept yours $KEPT)"
if [ "$LEFTCLAUDE" -eq 1 ]; then say "Connected to:${CONNECTED:- nothing new}. Claude Code: your existing ~/.claude/rules/mudmode.md was left as it was (it was not replaced)."
else say "Connected to:${CONNECTED:- nothing (you can connect later: run this again)}"; fi
[ -n "$ALLOWED" ] && say "Claude Code allowed folders: $ALLOWED"
if [ "$FAILED" -eq 1 ]; then say "RESULT: FAILED (see the PROBLEM lines above)"; exit 1; fi
[ "$DRY" -eq 1 ] && { say "RESULT: OK (dry run, nothing written)"; exit 0; }
if [ -f "$TARGET/CORE-LOCAL.md" ]; then say "Your settings ($DIRTXT/CORE-LOCAL.md):"; grep '^- \*\*' "$TARGET/CORE-LOCAL.md" | sed 's/\*\*//g'; fi
[ -n "$CONNECTED" ] && case "$CONNECT" in claude|both) say "Claude Code connector: ~/.claude/rules/mudmode.md" ;; esac
[ "$REFRESHED" -gt 0 ] && say "Updated $REFRESHED kit file(s) above. If you had edited one, your edited copy is the .bak- file next to it."
say "RESULT: OK"
[ "$MODE" = lite ] && say "You're in lite mode; say \"mudmode full\" for every module."
say 'Daily report: say "mudmode report" any time; if your AI can run scheduled tasks, it will offer to write one nightly in reports/ (only with your OK).'
MUDTXT=""; [ "$MUDON" -eq 1 ] && MUDTXT=' ("mud status" works too)'
say "Next: start a NEW chat in your AI. Say \"handoff\" before you stop, and \"mudmode status\" any time$MUDTXT."
say "Undo: delete ~/.claude/rules/mudmode.md (or ~/.grok/AGENTS.md if setup made it); that also ends the short name \"mud\". Your folder stays yours."
[ -n "$ALLOWED" ] && say "Undo the allowed folder: remove it from additionalDirectories in ~/.claude/settings.json (backup beside it)."
exit 0
