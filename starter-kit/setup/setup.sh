#!/bin/sh
# mudmode setup v1.4.0 (macOS, Linux, Windows Git Bash).
# Copies the kit into ONE folder you own (default: ~/mudmode). Outside that folder it only
# READS, except one optional connector file you say yes to (~/.claude/rules/mudmode.md for
# Claude Code, ~/.grok/AGENTS.md for Grok Build, ~/.codex/AGENTS.md for Codex). It never deletes anything. On a rerun it updates,
# with a backup first: the rule files in cores/ and modules/, plus CORE.md and the connector files
# when they still match a released mudmode version. Any other file you have is kept unless you
# say yes to replacing it (with --yes it keeps your file and tells you). With --yes (or no terminal) it
# only uses a new or empty folder, or a folder that already holds mudmode; any other folder stops it.
# One CORE.md (v1.3.6): everyday first; mudgo (auto, on or off) adds the rules for technical
# work. --mudgo sets it (default auto). The old --mode lite|full still works: lite = auto, full = on.
# Short name: "mud status" works like "mudmode status" in your AI chats. It is a word your AI
# understands, not a terminal command, so setup changes no shell profile. If this computer already
# has a command called mud (or setup can't check), setup leaves it alone, turns the short name off
# and says so.
# Opt-in only (--allow-dir yes): adds the folder to Claude Code's permissions.additionalDirectories in
# ~/.claude/settings.json, after a dated backup, changing nothing else in that file.
# Usage: sh setup/setup.sh [--target DIR] [--connect claude|grok|codex|both|all|none] [--name NAME]
#        [--tz ZONE] [--ask-first TEXT] [--words TEXT] [--allow-dir yes|no] [--mudgo auto|on|off] [--update-check on|off] [--yes] [--dry-run] [--help]
set -u

KIT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SETUP_DIR="$KIT_DIR/setup"
TARGET="${HOME:?HOME is not set}/mudmode"
UPDCHK=""; CONNECT=""; NAME=""; TZONE=""; ASK=""; WORDS=""; ALLOWDIR=""; MODE=""; PRO=""; MUDGO=""; YES=0; DRY=0
STAMP=$(date '+%Y%m%d-%H%M'); NOW=$(date '+%Y-%m-%d %H:%M %Z')
WARNED=0; FAILED=0

usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET=${2:-}; shift 2 ;;
    --connect) CONNECT=${2:-}; shift 2 ;;
    --name) NAME=${2:-}; shift 2 ;;
    --tz) TZONE=${2:-}; shift 2 ;;
    --ask-first) ASK=${2:-}; shift 2 ;;
    --words) WORDS=${2:-}; shift 2 ;;
    --allow-dir) ALLOWDIR=${2:-}; shift 2 ;;
    --mudgo) MUDGO=${2:-}; shift 2 ;;
    --pro) PRO=${2:-}; shift 2 ;;   # before v1.3.8: the same as --mudgo (kept, not in the usage line)
    --mode) MODE=${2:-}; shift 2 ;;   # before v1.3.6: lite = --mudgo auto, full = --mudgo on
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
# v1.3.5: compare real paths too, so other spellings of the home folder (C:\Users\you, c:/users/you, ~/., ~/../you),
# any folder above it and a whole drive are refused as well. Case is ignored (Windows and macOS ignore it), so this
# can only refuse more, never less. It only reads.
real_dir() { # $1 a folder that may not exist yet -> its absolute path, links and . .. // resolved, in lower case
  rp=$1; rrest=""
  if command -v cygpath >/dev/null 2>&1; then rp=$(cygpath -u -- "$1" 2>/dev/null) || rp=$1; fi
  while [ -n "$rp" ] && [ ! -d "$rp" ]; do
    rrest="${rp##*/}/$rrest"; case "$rp" in */*) rp=${rp%/*} ;; *) rp="" ;; esac
  done
  rbase=""; [ -n "$rp" ] && { rbase=$(cd "$rp" 2>/dev/null && pwd -P) || rbase=$rp; }
  printf '%s\n' "$rbase/$rrest" | awk -F/ '{ n = 0; for (i = 1; i <= NF; i++) { c = $i; if (c == "" || c == ".") continue
    if (c == "..") { if (n > 0) n--; continue } s[++n] = c }
    o = ""; for (i = 1; i <= n; i++) o = o "/" s[i]; if (o == "") o = "/"; print tolower(o) }'
}
RT=$(real_dir "$TARGET"); RH=$(real_dir "$HOME"); TBAD=0
[ "$RT" = "$RH" ] && TBAD=1
case "$RH/" in "$RT"/*) TBAD=1 ;; esac
case "$RT" in /|/[a-z]|/cygdrive/[a-z]|/mnt/[a-z]) TBAD=1 ;; /volumes/*/*) ;; /volumes/*) TBAD=1 ;; esac
if [ "$TBAD" -eq 1 ]; then
  say "PROBLEM: the target must be its own new folder (for example ~/mudmode), not your home folder, a folder above it or a whole drive ('$TARGET')."; say "RESULT: FAILED"; exit 1; fi
case "$TARGET/" in "$KIT_DIR"/*) say "PROBLEM: don't install inside the download folder; pick another place (default ~/mudmode)."; say "RESULT: FAILED"; exit 1 ;; esac
case "$TARGET" in "$HOME"/*) DIRTXT="~/${TARGET#"$HOME"/}" ;; *) DIRTXT="$TARGET" ;; esac

# --- pro layer (v1.3.6): one CORE.md for everyone, everyday first. The pro layer is auto (the default for a new
# folder), on or off. A rerun keeps CORE-LOCAL.md's "Pro layer:" line; a folder from before v1.3.6 has a "Mode:" line
# instead (or none, before v1.3): every one of them becomes pro auto (v1.3.6b). Setup then adds the "Pro layer:" line, and
# for full or no line a "One-time note" line, which the AI tells the owner once and then marks SHOWN.
# v1.3.8: the layer is named mudgo. New settings files say "mudgo:"; an older "Pro layer:" line is read the same and kept.
OLDPRO=""; OLDMODS=none; LEGACY=""; ONETIME=0
DEFMODS=none; [ "$FULL" -eq 1 ] && DEFMODS=usage   # Full Kit: the usage meter is on by default
if [ -f "$TARGET/CORE-LOCAL.md" ]; then
  OLDPRO=$(sed -n -e 's/^- \*\*mudgo (.*:\*\* *\([A-Za-z]*\).*/\1/p' -e 's/^- \*\*Pro layer (.*:\*\* *\([A-Za-z]*\).*/\1/p' "$TARGET/CORE-LOCAL.md" | head -n 1 | tr 'A-Z' 'a-z')
  case "$OLDPRO" in auto|on|off) ;; *) OLDPRO="" ;; esac
  if [ -z "$OLDPRO" ]; then
    LEGACY=$(sed -n 's/^- \*\*Mode (.*:\*\* *\([A-Za-z]*\).*/\1/p' "$TARGET/CORE-LOCAL.md" | head -n 1 | tr 'A-Z' 'a-z')
    OLDPRO=auto; case "$LEGACY" in lite) ;; *) ONETIME=1 ;; esac
    [ -n "$LEGACY" ] || LEGACY=none
  fi
  OLDMODS=$(sed -n 's/^- \*\*Modules [^*]*:\*\* *//p' "$TARGET/CORE-LOCAL.md" | head -n 1)
  [ -n "$OLDMODS" ] || OLDMODS=none
else OLDMODS=$DEFMODS; fi
PRO=$(printf '%s' "$PRO" | tr 'A-Z' 'a-z'); MODE=$(printf '%s' "$MODE" | tr 'A-Z' 'a-z'); MUDGO=$(printf '%s' "$MUDGO" | tr 'A-Z' 'a-z')
case "$MUDGO" in ""|auto|on|off) ;; *) say "PROBLEM: --mudgo must be auto, on or off."; say "RESULT: FAILED"; exit 2 ;; esac
case "$PRO" in ""|auto|on|off) ;; everyday) PRO=auto ;; pro) PRO=on ;; *) say "PROBLEM: --mudgo must be auto, on or off."; say "RESULT: FAILED"; exit 2 ;; esac
if [ -n "$MUDGO" ]; then
  [ -z "$PRO" ] || [ "$PRO" = "$MUDGO" ] || { say "PROBLEM: --mudgo and --pro say different things; give only --mudgo auto, on or off."; say "RESULT: FAILED"; exit 2; }
  PRO=$MUDGO
fi
case "$MODE" in "") ;; lite|everyday) [ -n "$PRO" ] || PRO=auto ;; full|pro) [ -n "$PRO" ] || PRO=on ;; *) say "PROBLEM: --mode must be lite or full (now: --mudgo auto, on or off)."; say "RESULT: FAILED"; exit 2 ;; esac
[ -n "$PRO" ] || PRO=${OLDPRO:-auto}
[ "$PRO" = auto ] || ONETIME=0   # the one-time note is only for a move to mudgo auto

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
    if ask_yn "4b. Connect mudmode to Codex (OpenAI's coding tool)? (writes ~/.codex/AGENTS.md; an existing file is backed up first and your own text in it is kept)" n; then
      case "$c" in both) c=all ;; claude) c=claude,codex ;; grok) c=grok,codex ;; *) c=codex ;; esac; fi
    CONNECT=$c
  fi
  [ -n "$ASK" ]   || ASK=$(ask_text "5. Optional: anything the AIs must always ask before doing (extra to the built-in list)?" "nothing extra")
  [ -n "$WORDS" ] || WORDS=$(ask_text "6. Optional: words to always use or never use?" "none")
  if [ -z "$ALLOWDIR" ]; then case "$CONNECT" in claude|both|all|claude,codex)
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
case "$CONNECT" in claude|grok|codex|both|all|none|claude,codex|grok,codex) ;; *) say "PROBLEM: --connect must be claude, grok, codex, both (Claude Code and Grok Build), all or none."; say "RESULT: FAILED"; exit 2 ;; esac
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
  V_NAME=$NAME V_TZ=$TZONE V_ASK=$ASK V_WORDS=$WORDS V_DIR=$DIRTXT V_DATE=$NOW V_ALLOW=$ALLOWDIR V_PRO=$PRO V_MODS=$OLDMODS V_UPD=$UPDCHK V_MUD=$MUDSHORT awk '
    function rep(s, k, v,   i, out) { out=""; while ((i = index(s, k)) > 0) { out = out substr(s, 1, i-1) v; s = substr(s, i+length(k)) } return out s }
    { l=$0; l=rep(l,"{{NAME}}",ENVIRON["V_NAME"]); l=rep(l,"{{TZ}}",ENVIRON["V_TZ"]); l=rep(l,"{{ASK}}",ENVIRON["V_ASK"]);
      l=rep(l,"{{WORDS}}",ENVIRON["V_WORDS"]); l=rep(l,"{{DIR}}",ENVIRON["V_DIR"]); l=rep(l,"{{DATE}}",ENVIRON["V_DATE"]); l=rep(l,"{{ALLOWDIR}}",ENVIRON["V_ALLOW"]); l=rep(l,"{{PRO}}",ENVIRON["V_PRO"]); l=rep(l,"{{MODULES}}",ENVIRON["V_MODS"]); l=rep(l,"{{UPDATECHECK}}",ENVIRON["V_UPD"]); l=rep(l,"{{MUDSHORT}}",ENVIRON["V_MUD"]); print l }' "$1"
}
COPIED=0; KEPT=0; SAME=0; REFRESHED=0
place() { # $1 source file, $2 destination file, $3 "live" = never replace (owner's working file)
  src=$1; dst=$2
  if [ -f "$dst" ]; then
    if cmp -s "$src" "$dst"; then SAME=$((SAME+1)); return 0; fi
    if [ "${3:-}" = live ]; then KEPT=$((KEPT+1)); say "kept your $dst (it is your working file)"; return 0; fi
    if [ "$KITREFRESH" -eq 1 ] && in_list "$(sha_lf "$dst")" "$STOCK_KIT"; then refresh "$src" "$dst"; return 0; fi   # an unedited kit file from v1.3.5 (backup first)
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
# --- known stock files (v1.3.6): sha256 of the CORE.md cores and connector templates in the released
# v1.3.0 to v1.3.5 kits, plus (v1.3.6c) the v1.3.6 and v1.3.6b CORE.md, connectors and changed kit files, plus (v1.3.8) the v1.3.6c ones (shipped unchanged in v1.3.7), plus (v1.4.0) the v1.3.8 CORE.md (shipped unchanged in the first v1.4.0 build). A file that matches one byte for byte (Windows line endings count as
# the same) was written by setup and never edited.
STOCK_CORE_LITE="8df2ce0d545cc0a53b4517e6cba9f7908c0eb42724c699cc0cb1b9c671d2ad63 02158beeac2d7222fba9e401fc7549228818aa48d98d83d7a5ce3c5e0fe9e56b f4f1e69151ac5801120bb919a5a06ffd38c723ca1376a1a2330d0cc2e185916d e512ab0beb8df0baf4769ccf8b465bb7c35f9e17d286fd17eab8815e88d6ce0e 070fc2265abbe210afad844a66144956361d294a681f6352e389380b34fd5012 70db2f87a11085da968c6d36739f4fa805ee50acc145b14384e8ba2a6bea0f75"
STOCK_CORE_FULL="a779f75c31520275342c1b274afb561c51c340e100e244fe35fafab4be91cabd 2fdb403ef64ecd84856a90f5c5d90355d9eae335c03f85c748200bb6e6d2dee7 b461794b86be0e8acac8a55ffc203257b3b14c4cc8b93e9c9ea30c9957448d18 b641b751a7ca34761f48dd6d9c78617039057f4e4b4dbfa8b4645641d8bd1654 b388742850064a75763066d4b211b844ccc0cabf8c96e6cf5416f04a0fea6fba ab869c9d52b3b454f6f282d50921e404496fe64a305aef964cf9080759663b90 aa7f5c86027b5b7ed8e490016445c7b9cff50d1d22bb3c361c8aac1d4666bf2f b9d7910149ea8db4d1741606ac9e6689375f944c4a4804d497c6881cfcb6fd81 721da803cc966cbf96b22de15b5f3e3083ff94be621348879f6bd3ee62e87933 7b37a7d7cd9b73d49ebea70252f20424f025389841611771030bc59cb4e65cc7"
# v1.3.6: kit files whose v1.3.5 text named lite/full mode (RULE-MAP, the adapters, three templates, the CORE-LOCAL template);
# an unedited copy is updated with a backup first, an edited one is kept. (v1.4.0) Also the v1.3.8 templates/SHARED-LESSONS.md
# (lesson terms (v2) line, shipped unchanged in the first v1.4.0 build). (holder-r4) Also the released v1.3.0 templates/SHARED-LESSONS.md
# (c617e989, shipped unchanged up to v1.3.3) and the v1.3.8 setup/templates/CORE-LOCAL.md (10126ff5, its 'Set up' line names v1.3.8).
# (holder-r5, owner-approved: the signed rebuild replaces the old licence and readme on upgrade) Also the first v1.4.0 build's
# full-kit/LICENSE.md (2f225ddb) and full-kit/README-START-HERE.md (64950d74). (holder-r6) Also the v1.3.8 ones: LICENSE.md (3386ffda)
# and README-START-HERE.md (6e079afe), checked in the v1.3.8 full-kit zip 8b9136aa.
STOCK_KIT="3386ffdaaf027450f7e483c7ba62b314d68f8c16705a25a88b92c78b72046008 6e079afede1215cdbc8e2d69707f48eb81799873c3ddd79ec91260586ba5e47f 2f225ddba2af9963cb36c950ca61c91693cbe8a593e15b0a52603261d7e29bf6 64950d74271998cb317bd3c43a61fabea6c9239ca5fb648bf0d0ddfabafca155 57149889605ce07fb717fc100e8247df26bb0902ddf196b1502127ffc55675bc dbb033769436a113d126dcdf7986c6c3ed3d440bf918f2cbd1c02d435a363bb5 55e988779c99f90e2bca3c8d73fcd9e5ca4f22b5f169f6eb6640b0af5ef47657 d319a7b2a455ffc30c2d18b3fbb8f8bb7a74115c99f4ddddb9fc21df3d68a0f5 c8c98b61cbfd309327f617c5c195a120aac3afd68a8c628764067002e659c904 acb037613e5413e66b97da95b3855df154a7f3fd102f02f8f4c6b9f830c9267f dfdf455f41bd2f6856ed655d0e22be5f46347f7936daa040d3fd799866e750d5 c4e038f5216142ae6a141727ff24545176f903c3286d72ad2e0f2ff5b9abe9bc a6bd8753cd584ff469a4a8a1b66937ba3fd8c76f4781eff6932e63a6a60712b1 d4232077b46a2e71105b4c2ec3d80a8a40f184ccc1bbb7268fb473b1e9cde041 f6ae396da9e5b835f3776771a4c9f36d19a81c7ff104f35c190611d4888e8d06 791692f670486cb3a0b2526fddd233222ed5a3e7f075c94917d9d96dcd5ecd2f 0b4d02d8c5cce00b10ec5a632e0438886d0d9791719d3a31485ff7cc3f4000ae c9be79cf7fdadd8361e043610a30f413e22d62543131a5e105749ef3269b0209 b2d1b0ddf71e8d1c7a20ec56499342f0fb2c80752e2d3e7847c52f02b6868dfc 5fa3003cce8bb18804b9ede50d9f61f25ca2b69c1d6498869bcb15ce53ca626c 9008d68762445ff033510a32e6295e84f9655564b43f5c3a895fd7cccfa5bc9b e90b862c0e5826b4392389bae2fe00ce976bc194316e17844310ed1f7d1fbe77 e59a48a42983fd123f899ccffab3025d4bdf077be704dd930c1c608c4d6fad38 7f938ecfe702b0ff869aa0dd687856df8d4f55b8c144c72e66db5acba0645824 c617e989707d3dbbce69c79d429567e9d262f8edc2a44e5b610b96f85f78e2b1 10126ff5afae4a2e4a3baf96586719e4c74faa2e149ffc8e577c7b9f8c389917"
# (holder-r4) STOCK_CONN also has the v1.3.8 connector templates (header "written by mudmode setup v1.3.8", shipped unchanged in the first v1.4.0 build).
STOCK_CONN="999fc995023857871a8c345bf6544b380cce2cfae22c66e2920a059a47305259 669af4c6f16c9c8b7c7dd8cfb15009c77bcffe5259ed2e38fd2194d5fe060c52 8fcfaaa9c9084b8d2120f55f3ae2c32afd5616193caeadc7f259695d00205780 b85fc69197fa843c927c286258bd80990f63ec1af0c7d8886ae3c61230af87ac a7a46d2be9c464bdbd5bec37889299753db3bac746cb6932c5a7914e3350315c 0bbb4202af065919fa0e701cc2bf756682d07d43e0c259ad3b0d46e9d6889e1f f2082caa065c3d164016baf53e6ad6c2cae11287d975d09e7e96c7d5803252fd 2006e87384ab657dae27a9c98d908b57ea983f21ff3e2f7a6578e6cd1e4834d8 46b6957686bd44516246645e36070e5f3aa9d28ccf543e4abdd384fb66caa870 8c7116b7496cbb7b9d5135d3fb4b9865ed9e0589b78ea7364b8c4f5e60745152 27ca4ad739f7155191adf1089a096c34d3466f172d0c4fbd7fc3672d48c534ed b9b2d70c62bd38aaf8abbf12707c4ddc4e233bca86c6ffa4fcbe65d9a681bd7e 6890bf3799ac7442865f8b29ed022bf2ad8e83e0cfe337cf0e006e1e56bd6485 31fb3548c5f604f689ae2df5b35d73ecc1d91850cd3b2f10ebf6ccf5c326ca04 255fa832309b9a007c1cf590e72ec9ac1cebe79f03a3283f5d76710abb3c8de1 a091d0e3c7f80f18e152dd9bef997cfea71dca03e47f6cdf0e95d396580254cd 4893d0de9e84fffbf4144fe0ff1e151cc3ea95da8acf47dd9f2fbef600af0b45 b381301f11282abb42acff519a31f94eca363ddc1c4a1dcc1b4e6b7464475560 d55a1d5de3ffbae4f0e000f611ea75fc84b33ce7a8c5e56ebe7aced854655bb7 199799d6aa5802c456d50f5f3afa101e38906c824868304f8a424dca7279ed26 95f7b9d131fc47929539ad16ca9257a706a77e96507a0bd0c9bd43adb7337462 b079f16ecfc952946f526bb8d599c1b93af364cd4b9f8854e1e0e3655adb9f69 0f6fd9abb4e114850d2d8c2e5a94d788d2a0669974024c12797ed86766f794af e42bd0487ad36a5d6395feec54f4ba4fe65d00b2407d2b4ce111abaf5e889d7e a2d0f3a392aad31a05a69ea8e396cb27d509f1b78cafaea6e45804d7b812d8ab 6e31a38e351cfde47c7648edcf78ac7003c563e7d7a085d5c65f4f00f2b51316"
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
mods_on() { # MODULES-ON.md text for $PRO (not on: the modules in $OLDMODS) -> stdout
  if [ "$PRO" = on ]; then
    cat "$STARTER/cores/MODULES-ON-PRO.md"   # mudgo on: CORE.md Part 2 holds every rule, so no module file is listed
  else
    K=mudgo; KS='mudgo on'; [ "${1:-}" = old ] && { K='Pro layer'; KS='pro mode'; }   # $1 = old: the wording setup wrote before v1.3.8
    printf '# MODULES-ON: the module files every new chat loads (mudmode)\n\n'
    printf 'Kept in step with the `%s:` and `Modules:` lines in CORE-LOCAL.md: setup writes it once, and the AI rewrites it when the owner switches. A switch never deletes anything.\n\n' "$K"
    printf '%s: %s. Modules on: %s. Say "%s" for every rule, or "turn on the <name> module".\n' "$K" "$PRO" "$OLDMODS" "$KS"
    for m in $(printf '%s' "$OLDMODS" | tr ',' ' '); do [ -f "$STARTER/modules/$m.md" ] && printf '@%s/modules/%s.md\n' "$DIRTXT" "$m"; done
  fi
}
TMP=$(mktemp -d 2>/dev/null || mktemp -d -t mudmode); trap 'rm -rf "$TMP"' EXIT

# --- 1. the mudmode folder -------------------------------------------------------
[ "$DRY" -eq 1 ] && say "DRY RUN: nothing will be written."
NEWDIR=0; { [ ! -d "$TARGET" ] || [ -z "$(ls -A "$TARGET" 2>/dev/null)" ]; } && NEWDIR=1
if [ "$NEWDIR" -eq 0 ]; then
  # v1.3.6: without a person at the terminal, never add files to a folder that holds something else (a mudmode
  # folder has CORE-LOCAL.md, or the marker setup leaves in a folder it made).
  if [ "$INTERACTIVE" -eq 0 ] && [ ! -f "$TARGET/CORE-LOCAL.md" ] && [ ! -f "$TARGET/.made-by-mudmode-setup" ]; then
    say "PROBLEM: $DIRTXT already has files in it and is not a mudmode folder. Setup only uses a new or empty folder, or your existing mudmode folder. Pick another place with --target (default ~/mudmode), or run setup yourself in a terminal to be asked."
    say "RESULT: FAILED"; exit 1; fi
  if [ "$KITREFRESH" -eq 1 ]; then say "$DIRTXT already exists. Your own files stay as they are. Rule files in cores/ and modules/ are updated, with a backup of each."
  else say "$DIRTXT already exists and holds the Full Kit. Your files stay as they are; this free kit's setup only adds files that are missing."; fi
  if [ "$INTERACTIVE" -eq 1 ] && ! ask_yn "Continue?" y; then say "Stopped. Nothing changed."; exit 0; fi
fi
mkd "$TARGET"; [ "$PRO" = on ] && mkd "$TARGET/jobs"
if [ "$NEWDIR" -eq 1 ] && [ "$DRY" -eq 0 ] && [ -d "$TARGET" ] && [ ! -e "$TARGET/.made-by-mudmode-setup" ]; then
  printf 'mudmode setup v1.4.0 found this folder new or empty on %s. Undo can remove the whole folder.\n' "$NOW" > "$TARGET/.made-by-mudmode-setup" || fail "could not write $TARGET/.made-by-mudmode-setup"; fi
# v1.3.6: one CORE.md (Part 1 everyday, Part 2 mudgo), the same file for every setting. An unedited CORE.md
# from any released version (lite or full) is updated, with a backup first; one with your own edits is kept.
CORESRC="$STARTER/CORE.md"
if same_core "$CORESRC" "$TARGET/CORE.md"; then refresh "$CORESRC" "$TARGET/CORE.md"   # same rules, older Version line: update it (backup first)
elif [ -f "$TARGET/CORE.md" ] && [ "$KITREFRESH" -eq 1 ] && in_list "$(sha_lf "$TARGET/CORE.md")" "$STOCK_CORE_FULL $STOCK_CORE_LITE"; then
  refresh "$CORESRC" "$TARGET/CORE.md"   # an unedited CORE.md from a released version: update it (backup first)
elif [ -f "$TARGET/CORE.md" ] && [ "$KITREFRESH" -eq 1 ] && ! cmp -s "$CORESRC" "$TARGET/CORE.md"; then
  KEPT=$((KEPT+1)); say "kept your CORE.md: it doesn't match a released CORE.md (your own edits, or an older version), so it was not updated. The new one (everyday first, with mudgo) is in the kit at starter-kit/CORE.md; your own rules belong in CORE-LOCAL.md."
else place "$CORESRC" "$TARGET/CORE.md"; fi
place_dir "$STARTER/templates" "$TARGET/templates"
place_dir "$STARTER/adapters" "$TARGET/adapters"
place_dir "$STARTER/addons" "$TARGET/addons"
refresh_dir "$STARTER/modules" "$TARGET/modules"
refresh_dir "$STARTER/cores" "$TARGET/cores"
place "$STARTER/RULE-MAP.md" "$TARGET/RULE-MAP.md"
for f in check-update.sh check-update.ps1 update-key.pub; do [ -f "$SETUP_DIR/$f" ] && refresh "$SETUP_DIR/$f" "$TARGET/tools/$f"; done   # the opt-in update check (off unless CORE-LOCAL.md says on)
[ -f "$KIT_DIR/VERSION" ] && [ "$KITREFRESH" -eq 1 ] && refresh "$KIT_DIR/VERSION" "$TARGET/VERSION"
[ -f "$KIT_DIR/WHAT-TO-SAY.md" ] && [ "$KITREFRESH" -eq 1 ] && refresh "$KIT_DIR/WHAT-TO-SAY.md" "$TARGET/WHAT-TO-SAY.md"   # v1.3.5: the list "mudhelp" shows
place "$SETUP_DIR/templates/CORE-LOCAL.md" "$TARGET/templates/CORE-LOCAL.md"
LIVEF="OK-LEDGER.md"; [ "$PRO" = on ] && LIVEF="LESSONS.md JOBS.md OK-LEDGER.md"
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
# --- mudgo line + MODULES-ON.md (v1.3.6) ---------------------------------------------
# A folder from before v1.3.6 gets a "mudgo:" line (its old "Mode:" line is marked SUPERSEDED); --mudgo on a
# rerun changes only that line. CORE-LOCAL.md is backed up first, and so is MODULES-ON.md when it changes.
SWITCHED=0
if [ "$HAVE_LOCAL" -eq 1 ] && [ -f "$TARGET/CORE-LOCAL.md" ] && { [ -n "$LEGACY" ] || [ "$PRO" != "$OLDPRO" ]; }; then
  if [ "$DRY" -eq 1 ]; then say "would set mudgo to $PRO in CORE-LOCAL.md (backup first)"
  else
    LB=$(newbak "$TARGET/CORE-LOCAL.md"); cp -p "$TARGET/CORE-LOCAL.md" "$LB" || fail "could not back up CORE-LOCAL.md"
    fill "$SETUP_DIR/templates/CORE-LOCAL.md" | grep -E '^- \*\*mudgo \(' > "$TMP/proline"
    [ "$ONETIME" -eq 1 ] && ! grep -q '^- \*\*One-time note' "$TARGET/CORE-LOCAL.md" && printf '%s\n' "- **One-time note:** mudmode 1.3.8: you're on mudgo auto now: extra care turns on by itself when the work needs it. Say \"mudgo on\" to keep everything on." >> "$TMP/proline"
    if grep -Eq '^- \*\*(mudgo|Pro layer) \(' "$TARGET/CORE-LOCAL.md"; then
      awk -v m="$PRO" -v o="$OLDPRO" -v n="$NOW" '!d && /^- \*\*(mudgo|Pro layer) \(/ { sub(/:\*\* *[A-Za-z]*/, ":** " m); print; print "  - SUPERSEDED " n ", by setup: was " o; d=1; next } { print }' "$TARGET/CORE-LOCAL.md" > "$TMP/local.new"
    elif grep -q '^- \*\*Mode (' "$TARGET/CORE-LOCAL.md"; then
      awk -v n="$NOW" -v pf="$TMP/proline" '!d && /^- \*\*Mode \(/ { while ((getline l < pf) > 0) print l; print "  - SUPERSEDED " n ", by setup v1.4.0: the next line (lite and full are both mudgo auto now; one CORE.md)"; print; d=1; next } { print }' "$TARGET/CORE-LOCAL.md" > "$TMP/local.new"
    else
      { cat "$TARGET/CORE-LOCAL.md"; cat "$TMP/proline"   # set up before v1.3: add the lines it never had
        grep -q '^- \*\*Modules ' "$TARGET/CORE-LOCAL.md" || fill "$SETUP_DIR/templates/CORE-LOCAL.md" | grep -E '^- \*\*Modules '
        grep -q '^- \*\*Suggestions ' "$TARGET/CORE-LOCAL.md" || fill "$SETUP_DIR/templates/CORE-LOCAL.md" | grep -E '^- \*\*Suggestions '; } > "$TMP/local.new"
    fi
    cp "$TMP/local.new" "$TARGET/CORE-LOCAL.md" && SWITCHED=1 && say "mudgo: $PRO (in CORE-LOCAL.md; backup: ${LB##*/})" || fail "could not update CORE-LOCAL.md"
  fi
fi
mods_on > "$TMP/MODULES-ON.md"
if [ "$SWITCHED" -eq 1 ] && [ -f "$TARGET/MODULES-ON.md" ]; then
  if ! cmp -s "$TMP/MODULES-ON.md" "$TARGET/MODULES-ON.md"; then
    MB=$(newbak "$TARGET/MODULES-ON.md"); cp -p "$TARGET/MODULES-ON.md" "$MB" && cp "$TMP/MODULES-ON.md" "$TARGET/MODULES-ON.md" && COPIED=$((COPIED+1)) || fail "could not update MODULES-ON.md"
  fi
elif [ "$DRY" -eq 1 ] && [ "$HAVE_LOCAL" -eq 1 ] && { [ -n "$LEGACY" ] || [ "$PRO" != "$OLDPRO" ]; } && [ -f "$TARGET/MODULES-ON.md" ]; then say "would update $TARGET/MODULES-ON.md (backup first)"
elif [ "$PRO" = on ] && [ "$KITREFRESH" -eq 1 ] && [ -f "$TARGET/MODULES-ON.md" ] && head -n 1 "$TARGET/MODULES-ON.md" | grep -Eq '^# MODULES-ON \(mudmode\): (full mode|pro|mudgo)' && ! cmp -s "$TMP/MODULES-ON.md" "$TARGET/MODULES-ON.md"; then
  refresh "$TMP/MODULES-ON.md" "$TARGET/MODULES-ON.md"   # setup wrote it (mudgo on, or full mode before v1.3.6); e.g. the free kit's version before a Full Kit rerun
elif [ "$PRO" != on ] && [ "$KITREFRESH" -eq 1 ] && [ -f "$TARGET/MODULES-ON.md" ] && mods_on old > "$TMP/MODULES-ON.old" && tr -d '\r' < "$TARGET/MODULES-ON.md" | cmp -s - "$TMP/MODULES-ON.old"; then
  refresh "$TMP/MODULES-ON.md" "$TARGET/MODULES-ON.md"   # v1.3.8: setup wrote it with the older words and it was never edited (backup first)
else place "$TMP/MODULES-ON.md" "$TARGET/MODULES-ON.md" live; fi
if [ "$PRO" = on ]; then
cat > "$TMP/HANDOFF.md" <<HOF
# HANDOFF (rewrite at the end of every session; keep the last 4 in handoff/, older ones in handoff/archive/)

**Next single action:** ask the owner what the first job is.

- **Written:** $NOW, by mudmode setup v1.4.0
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
# HANDOFF (everyday: rewrite before you stop; the full form is templates/HANDOFF.md, module handoff-plus)

**Next single action:** ask the owner what the first job is.

- **Written:** $NOW, by mudmode setup v1.4.0
- **What changed:** mudmode folder set up at $DIRTXT (everyday first; mudgo $PRO)
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
  if [ -d "$KIT_DIR/FOR-CHAT-APPS" ]; then place_dir "$KIT_DIR/FOR-CHAT-APPS" "$TARGET/full-kit/FOR-CHAT-APPS"; fi   # v1.4.0: the chat-app file, for Windows exe users
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
connect_codex() { # v1.3.6c: optional, only with --connect codex|all (or a yes to the question): ~/.codex/AGENTS.md (or $CODEX_HOME)
  cdir=${CODEX_HOME:-$HOME/.codex}; dst="$cdir/AGENTS.md"
  if [ -f "$cdir/AGENTS.override.md" ]; then
    warn "$cdir/AGENTS.override.md exists. Codex reads that file INSTEAD of AGENTS.md, so mudmode will not load in Codex until it is merged or removed by you. Setup does not touch it."; fi
  if [ -f "$dst" ]; then
    if cmp -s "$TMP/agents.md" "$dst"; then CONNECTED="$CONNECTED Codex"; return; fi
    if grep -q "mudmode connector" "$dst" 2>/dev/null; then
      if conn_update "$TMP/agents.md" "$dst"; then CONNECTED="$CONNECTED Codex"; else warn "your $dst already holds a mudmode connector that has your own edits; left it as it was."; fi
      return
    fi
    # the owner's own AGENTS.md: keep every line of it; add the mudmode block after it, only on a yes, backup first
    if [ "$INTERACTIVE" -eq 1 ] && ask_yn "You already have $dst. Add the mudmode block after your text? (your file is backed up first, nothing of yours is removed)" n; then
      [ "$DRY" -eq 1 ] && { say "would back up $dst and add the mudmode block after your text"; return; }
      pb=$(newbak "$dst"); cp -p "$dst" "$pb" && { cat "$dst"; printf '\n'; cat "$TMP/agents.md"; } > "$TMP/codex.new" && cp "$TMP/codex.new" "$dst" && CONNECTED="$CONNECTED Codex" && say "added the mudmode block to $dst (backup: ${pb##*/})" || fail "could not update $dst"
    else warn "you already have $dst; left it alone. To connect Codex, add the lines in $DIRTXT/connectors/AGENTS-snippet.md to it (or ask your AI to, with a backup)."; fi
    return
  fi
  [ "$DRY" -eq 1 ] && { say "would write $dst"; return; }
  mkdir -p "$cdir" && cp "$TMP/agents.md" "$dst" && CONNECTED="$CONNECTED Codex" || fail "could not write $dst"
}
case "$CONNECT" in claude) connect_claude ;; grok) connect_grok ;; codex) connect_codex ;; both) connect_claude; connect_grok ;; all) connect_claude; connect_grok; connect_codex ;; claude,codex) connect_claude; connect_codex ;; grok,codex) connect_grok; connect_codex ;; esac

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
    BAD*) warn "left ~/.claude/settings.json as it was. mudmode still works; Claude Code may ask you before it opens the folder." ;;
    NOTOOL) warn "left ~/.claude/settings.json as it was. mudmode still works; Claude Code may ask you before it opens the folder." ;;
    *) fail "could not update ~/.claude/settings.json ($r); your file is unchanged or backed up beside it" ;;
  esac
}
[ "$ALLOWDIR" = yes ] && allow_dir
# v1.3.6b (zero upkeep): a connector setup made earlier for THIS folder, unedited, is kept current by itself
# (backup first). An edited one is left alone. Nothing new is connected without a yes.
CODEXF="${CODEX_HOME:-$HOME/.codex}/AGENTS.md"
for oc in "$HOME/.claude/rules/mudmode.md:$TMP/claude.md" "$HOME/.grok/AGENTS.md:$TMP/agents.md" "$CODEXF:$TMP/agents.md"; do
  f=${oc%%:*}; src=${oc#*:}
  F0=$FAILED   # a failed refresh is not a setup failure: the old connector keeps working, and the next run tries again
  if [ "$DRY" -eq 0 ] && [ -f "$f" ] && grep -qF "The shared folder is \`$DIRTXT\`." "$f" 2>/dev/null && conn_update "$src" "$f" >/dev/null 2>&1; then say "kept your connector $f up to date (a backup is beside it)"; fi
  FAILED=$F0
done

# --- 3. log + result ------------------------------------------------------------
if [ "$DRY" -eq 0 ] && [ -d "$TARGET" ]; then
  { printf '\n## %s setup v1.4.0 from %s\n' "$NOW" "$(basename "$KIT_DIR")"
    printf -- '- copied %s, already the same %s, kept yours %s; connected:%s; allowed folder: %s; mudgo: %s\n' "$COPIED" "$SAME" "$KEPT" "${CONNECTED:- none}" "${ALLOWED:-no}" "$PRO"; } >> "$TARGET/SETUP-LOG.md"
fi
say ""
say "mudmode folder: $DIRTXT  (copied $COPIED, already the same $SAME, kept yours $KEPT)"
if [ "$LEFTCLAUDE" -eq 1 ]; then say "Connected to:${CONNECTED:- nothing new}. Claude Code: your existing ~/.claude/rules/mudmode.md was left as it was (it was not replaced)."
else say "Connected to:${CONNECTED:- nothing (you can connect later: run this again)}"; fi
[ -n "$ALLOWED" ] && say "Claude Code allowed folders: $ALLOWED"
if [ "$FAILED" -eq 1 ]; then say "RESULT: FAILED (see the PROBLEM lines above)"; exit 1; fi
[ "$DRY" -eq 1 ] && [ "$ALLOWDIR" = yes ] && say "Undo (after a real run): remove \"$TARGET\" from permissions.additionalDirectories in ~/.claude/settings.json (setup makes a dated backup beside it first)."
[ "$DRY" -eq 1 ] && { say "RESULT: OK (dry run, nothing written)"; exit 0; }
if [ -f "$TARGET/CORE-LOCAL.md" ]; then say "Your settings ($DIRTXT/CORE-LOCAL.md):"; grep '^- \*\*' "$TARGET/CORE-LOCAL.md" | sed 's/\*\*//g'; fi
[ -n "$CONNECTED" ] && case "$CONNECT" in claude|both|all|claude,codex) say "Claude Code connector: ~/.claude/rules/mudmode.md" ;; esac
[ "$REFRESHED" -gt 0 ] && say "Updated $REFRESHED kit file(s) above. If you had edited one, your edited copy is the .bak- file next to it."
say "RESULT: OK"
case "$PRO" in
  on) say "Everyday first, with mudgo on (every rule). Say \"mudgo auto\" to let it turn on only when the work needs it." ;;
  off) say "Everyday mode, with mudgo off. Say \"mudgo on\" when you want the rules for technical work." ;;
  *) say "Everyday first: mudgo turns on by itself when the work needs it (putting things live, branches, reviews). Say \"mudgo on\" or \"mudgo off\" any time." ;;
esac
[ "$ONETIME" -eq 1 ] && say "You were on full mode: you're on mudgo auto now, so extra care turns on by itself when the work needs it. Say \"mudgo on\" to keep every rule on."
say 'Daily report: say "mudmode report" any time; if your AI can run scheduled tasks, it will offer to write one nightly in reports/ (only with your OK).'
MUDTXT=""; [ "$MUDON" -eq 1 ] && MUDTXT=' ("mud status" works too)'
names_dir() { [ -f "$1" ] && grep -qF "The shared folder is \`$DIRTXT\`." "$1" 2>/dev/null; }   # a connector for THIS folder (made now or before)
# holder-r4: the current header comes from the connector template, so this check never names a stale version
CONNHDR=$(sed -n '1s/.*\(written by mudmode setup v[0-9.]*[0-9]\.\).*/\1/p' "$SETUP_DIR/templates/connector-claude.md" 2>/dev/null); [ -n "$CONNHDR" ] || CONNHDR='written by mudmode setup v1.4.0.'
for oc in "$HOME/.claude/rules/mudmode.md:claude" "$HOME/.grok/AGENTS.md:grok" "$CODEXF:codex"; do   # v1.3.6: an older connector still speaks of lite/full mode
  f=${oc%:*}; w=${oc##*:}
  if names_dir "$f" && grep -q "mudmode connector" "$f" 2>/dev/null && ! grep -qF "$CONNHDR" "$f" 2>/dev/null; then
    say "Your connector $f is from an older mudmode and setup left it as it is (it may hold your own edits). It still works."; fi
done
if [ -n "$CONNECTED" ] || names_dir "$HOME/.claude/rules/mudmode.md" || names_dir "$HOME/.grok/AGENTS.md" || names_dir "$CODEXF"; then
  say "Next: start a NEW chat in your AI. Say \"handoff\" before you stop, \"mudmode status\" any time$MUDTXT, and \"mudhelp\" for the list of things to say."
  say "Undo: delete ~/.claude/rules/mudmode.md (or ~/.grok/AGENTS.md or ~/.codex/AGENTS.md if setup made it; if you already had your own ~/.codex/AGENTS.md, remove only the block between '<!-- mudmode connector' and '<!-- end mudmode connector -->', or put back the .bak- copy beside it); that also ends the short name \"mud\". Your folder stays yours."
else
  say "Next: nothing is connected, so a new chat won't load mudmode by itself. To use it, start a chat with: Read $DIRTXT/CORE.md, $DIRTXT/CORE-LOCAL.md and $DIRTXT/HANDOFF.md, then continue. Say \"handoff\" before you stop."
  if [ -n "$ALLOWED" ]; then say "Undo: no connector was made. Setup did change one thing outside $DIRTXT: the Claude Code allowed folder (see the next line)."
  else say "Undo: nothing outside $DIRTXT was changed, so there is nothing to turn off."; fi
fi
if [ -f "$TARGET/.made-by-mudmode-setup" ]; then say "To remove mudmode completely: setup made $DIRTXT new, so you can delete that folder (first move out anything of yours you put in it)."
else say "To remove mudmode: setup did not make $DIRTXT, so don't delete the folder; remove only the mudmode files in it (anything else there is yours)."; fi
[ -n "$ALLOWED" ] && say "Undo the allowed folder: remove \"$TARGET\" from permissions.additionalDirectories in ~/.claude/settings.json (setup made a dated backup beside it, settings.json.bak-...)."
exit 0
