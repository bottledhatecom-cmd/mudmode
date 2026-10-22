#!/bin/sh
# mudmode setup v1.2 (macOS, Linux, Windows Git Bash).
# Copies the kit into ONE folder you own (default: ~/mudmode). Outside that folder it only
# READS, except one optional connector file you say yes to (~/.claude/rules/mudmode.md for
# Claude Code, ~/.grok/AGENTS.md for Grok Build). It never deletes anything and never
# replaces an existing file without asking (with --yes it keeps your file and tells you).
# Opt-in only (--allow-dir yes): adds the folder to Claude Code's permissions.additionalDirectories in
# ~/.claude/settings.json, after a dated backup, changing nothing else in that file.
# Usage: sh setup/setup.sh [--target DIR] [--connect claude|grok|both|none] [--name NAME]
#        [--tz ZONE] [--ask-first TEXT] [--words TEXT] [--allow-dir yes|no] [--yes] [--dry-run] [--help]
set -u

KIT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SETUP_DIR="$KIT_DIR/setup"
TARGET="${HOME:?HOME is not set}/mudmode"
CONNECT=""; NAME=""; TZONE=""; ASK=""; WORDS=""; ALLOWDIR=""; YES=0; DRY=0
STAMP=$(date '+%Y%m%d-%H%M'); NOW=$(date '+%Y-%m-%d %H:%M %Z')
WARNED=0; FAILED=0

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET=${2:-}; shift 2 ;;
    --connect) CONNECT=${2:-}; shift 2 ;;
    --name) NAME=${2:-}; shift 2 ;;
    --tz) TZONE=${2:-}; shift 2 ;;
    --ask-first) ASK=${2:-}; shift 2 ;;
    --words) WORDS=${2:-}; shift 2 ;;
    --allow-dir) ALLOWDIR=${2:-}; shift 2 ;;
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
case "$TARGET" in "~"/*) TARGET="$HOME/${TARGET#~/}" ;; esac
case "$TARGET" in /*|[A-Za-z]:*) ;; *) TARGET="$(pwd)/$TARGET" ;; esac
TARGET=${TARGET%/}
if [ -z "$TARGET" ] || [ "$TARGET" = "$HOME" ] || [ "$TARGET" = "/" ]; then
  say "PROBLEM: the target must be its own folder (for example ~/mudmode), not '$TARGET'."; say "RESULT: FAILED"; exit 1; fi
case "$TARGET/" in "$KIT_DIR"/*) say "PROBLEM: don't install inside the download folder; pick another place (default ~/mudmode)."; say "RESULT: FAILED"; exit 1 ;; esac
case "$TARGET" in "$HOME"/*) DIRTXT="~/${TARGET#"$HOME"/}" ;; *) DIRTXT="$TARGET" ;; esac

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
if [ "$INTERACTIVE" -eq 1 ]; then
  say "mudmode setup: this makes your mudmode folder at $DIRTXT. Nothing else on this computer changes unless you say yes below."
  if [ "$HAVE_LOCAL" -eq 1 ]; then say "You already have settings in $DIRTXT/CORE-LOCAL.md; they stay as they are."
    NAME=${NAME:-kept}; TZONE=${TZONE:-kept}; ASK=${ASK:-kept}; WORDS=${WORDS:-kept}; fi
  [ -n "$NAME" ]  || NAME=$(ask_text "1. What name should the crew call you?" "the owner")
  [ -n "$TZONE" ] || TZONE=$(ask_text "2. Your time zone?" "$(guess_tz)")
  if [ -z "$CONNECT" ]; then
    c=none
    if ask_yn "3. Connect mudmode to Claude Code (every new Claude Code chat follows it)?" y; then c=claude; fi
    if ask_yn "4. Connect mudmode to Grok Build (the grok command-line tool)?" n; then
      if [ "$c" = claude ]; then c=both; else c=grok; fi; fi
    CONNECT=$c
  fi
  [ -n "$ASK" ]   || ASK=$(ask_text "5. Optional: anything the AIs must always ask before doing (extra to the built-in list)?" "nothing extra")
  [ -n "$WORDS" ] || WORDS=$(ask_text "6. Optional: words to always use or never use?" "none")
  if [ -z "$ALLOWDIR" ]; then case "$CONNECT" in claude|both)
    if ask_yn "7. Let Claude Code use $DIRTXT from any project without asking each time? (adds it to ~/.claude/settings.json; backup first)" n; then ALLOWDIR=yes; else ALLOWDIR=no; fi ;; esac; fi
fi
[ -n "$NAME" ]    || NAME="the owner"
[ -n "$TZONE" ]   || TZONE=$(guess_tz)
[ -n "$ASK" ]     || ASK="nothing extra"
[ -n "$WORDS" ]   || WORDS="none"
[ -n "$CONNECT" ] || CONNECT=none
[ -n "$ALLOWDIR" ] || ALLOWDIR=no
case "$CONNECT" in claude|grok|both|none) ;; *) say "PROBLEM: --connect must be claude, grok, both or none."; say "RESULT: FAILED"; exit 2 ;; esac
case "$ALLOWDIR" in yes|no) ;; *) say "PROBLEM: --allow-dir must be yes or no."; say "RESULT: FAILED"; exit 2 ;; esac

# --- helpers -------------------------------------------------------------------
mkd() { [ -d "$1" ] && return 0; if [ "$DRY" -eq 1 ]; then say "would make folder $1"; else mkdir -p "$1" || fail "could not make $1"; fi; }
fill() { # template -> stdout, replacing {{NAME}} {{TZ}} {{ASK}} {{WORDS}} {{DIR}} {{DATE}} literally
  V_NAME=$NAME V_TZ=$TZONE V_ASK=$ASK V_WORDS=$WORDS V_DIR=$DIRTXT V_DATE=$NOW V_ALLOW=$ALLOWDIR awk '
    function rep(s, k, v,   i, out) { out=""; while ((i = index(s, k)) > 0) { out = out substr(s, 1, i-1) v; s = substr(s, i+length(k)) } return out s }
    { l=$0; l=rep(l,"{{NAME}}",ENVIRON["V_NAME"]); l=rep(l,"{{TZ}}",ENVIRON["V_TZ"]); l=rep(l,"{{ASK}}",ENVIRON["V_ASK"]);
      l=rep(l,"{{WORDS}}",ENVIRON["V_WORDS"]); l=rep(l,"{{DIR}}",ENVIRON["V_DIR"]); l=rep(l,"{{DATE}}",ENVIRON["V_DATE"]); l=rep(l,"{{ALLOWDIR}}",ENVIRON["V_ALLOW"]); print l }' "$1"
}
COPIED=0; KEPT=0; SAME=0
place() { # $1 source file, $2 destination file, $3 "live" = never replace (owner's working file)
  src=$1; dst=$2
  if [ -f "$dst" ]; then
    if cmp -s "$src" "$dst"; then SAME=$((SAME+1)); return 0; fi
    if [ "${3:-}" = live ]; then KEPT=$((KEPT+1)); say "kept your $dst (it is your working file)"; return 0; fi
    if [ "$INTERACTIVE" -eq 1 ] && ask_yn "$dst already exists and is different. Replace it (your copy is backed up first)?" n; then
      if [ "$DRY" -eq 1 ]; then say "would back up and replace $dst"; return 0; fi
      cp -p "$dst" "$dst.bak-$STAMP" && cp "$src" "$dst" && COPIED=$((COPIED+1)) && say "replaced $dst (backup: $dst.bak-$STAMP)" || fail "could not replace $dst"
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
TMP=$(mktemp -d 2>/dev/null || mktemp -d -t mudmode); trap 'rm -rf "$TMP"' EXIT

# --- 1. the mudmode folder -------------------------------------------------------
[ "$DRY" -eq 1 ] && say "DRY RUN: nothing will be written."
if [ -d "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  say "$DIRTXT already exists. Every file you already have there stays as it is; only missing kit files are added."
  if [ "$INTERACTIVE" -eq 1 ] && ! ask_yn "Continue?" y; then say "Stopped. Nothing changed."; exit 0; fi
fi
mkd "$TARGET"; mkd "$TARGET/jobs"
place "$STARTER/CORE.md" "$TARGET/CORE.md"
place "$STARTER/SCRUB-CHECKLIST.md" "$TARGET/SCRUB-CHECKLIST.md"
place_dir "$STARTER/templates" "$TARGET/templates"
place_dir "$STARTER/adapters" "$TARGET/adapters"
place_dir "$STARTER/addons" "$TARGET/addons"
place "$SETUP_DIR/templates/CORE-LOCAL.md" "$TARGET/templates/CORE-LOCAL.md"
for f in LESSONS.md JOBS.md OK-LEDGER.md; do place "$STARTER/templates/$f" "$TARGET/$f" live; done
fill "$SETUP_DIR/templates/CORE-LOCAL.md" > "$TMP/CORE-LOCAL.md"; place "$TMP/CORE-LOCAL.md" "$TARGET/CORE-LOCAL.md" live
cat > "$TMP/HANDOFF.md" <<HOF
# HANDOFF (rewrite at the end of every session; keep the last 4 in HANDOFFS.md)

**Next single action:** ask the owner what the first job is.

- **Written:** $NOW, by mudmode setup v1.2
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
place "$TMP/HANDOFF.md" "$TARGET/HANDOFF.md" live
if [ "$FULL" -eq 1 ]; then
  for f in MUDMODE.md LICENSE.md README-START-HERE.md; do place "$KIT_DIR/$f" "$TARGET/full-kit/$f"; done
  place_dir "$KIT_DIR/adapters" "$TARGET/full-kit/adapters"
  place_dir "$KIT_DIR/tools" "$TARGET/full-kit/tools"
else
  [ -f "$KIT_DIR/LICENSE" ] && place "$KIT_DIR/LICENSE" "$TARGET/LICENSE"
fi
fill "$SETUP_DIR/templates/connector-claude.md" > "$TMP/claude.md"
fill "$SETUP_DIR/templates/connector-agents.md" > "$TMP/agents.md"
place "$TMP/claude.md" "$TARGET/connectors/claude-rules-mudmode.md"
place "$TMP/agents.md" "$TARGET/connectors/AGENTS-snippet.md"

# --- 2. optional connector (the only write outside the folder) ---------------------
CONNECTED=""
connect_claude() {
  dst="$HOME/.claude/rules/mudmode.md"
  if [ -f "$dst" ] && cmp -s "$TMP/claude.md" "$dst"; then CONNECTED="$CONNECTED Claude-Code"; return; fi
  if [ -f "$dst" ]; then
    if [ "$INTERACTIVE" -eq 1 ] && ask_yn "$dst already exists and is different. Replace it (backup kept)?" n; then
      [ "$DRY" -eq 1 ] && { say "would back up and replace $dst"; return; }
      cp -p "$dst" "$dst.bak-$STAMP" && cp "$TMP/claude.md" "$dst" && CONNECTED="$CONNECTED Claude-Code" || fail "could not write $dst"
    else warn "$dst already exists with other text; left it alone. The new text is in $DIRTXT/connectors/claude-rules-mudmode.md."; fi
    return
  fi
  [ "$DRY" -eq 1 ] && { say "would write $dst"; return; }
  mkdir -p "$HOME/.claude/rules" && cp "$TMP/claude.md" "$dst" && CONNECTED="$CONNECTED Claude-Code" || fail "could not write $dst"
}
connect_grok() {
  dst="$HOME/.grok/AGENTS.md"
  if [ -f "$dst" ]; then
    if grep -q "mudmode connector" "$dst" 2>/dev/null; then CONNECTED="$CONNECTED Grok-Build"
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
  if command -v python3 >/dev/null 2>&1; then py=python3
  elif command -v python >/dev/null 2>&1 && python -c 'import sys; sys.exit(sys.version_info[0] < 3)' 2>/dev/null; then py=python
  else py=""; fi
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
  elif command -v node >/dev/null 2>&1; then
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
  else r="NOTOOL"; fi
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
  { printf '\n## %s setup v1.2 from %s\n' "$NOW" "$(basename "$KIT_DIR")"
    printf -- '- copied %s, already the same %s, kept yours %s; connected:%s; allowed folder: %s\n' "$COPIED" "$SAME" "$KEPT" "${CONNECTED:- none}" "${ALLOWED:-no}"; } >> "$TARGET/SETUP-LOG.md"
fi
say ""
say "mudmode folder: $DIRTXT  (copied $COPIED, already the same $SAME, kept yours $KEPT)"
say "Connected to:${CONNECTED:- nothing (you can connect later: run this again)}"
[ -n "$ALLOWED" ] && say "Claude Code allowed folders: $ALLOWED"
if [ "$FAILED" -eq 1 ]; then say "RESULT: FAILED (see the PROBLEM lines above)"; exit 1; fi
[ "$DRY" -eq 1 ] && { say "RESULT: OK (dry run, nothing written)"; exit 0; }
if [ -f "$TARGET/CORE-LOCAL.md" ]; then say "Your settings ($DIRTXT/CORE-LOCAL.md):"; grep '^- \*\*' "$TARGET/CORE-LOCAL.md" | sed 's/\*\*//g'; fi
[ -n "$CONNECTED" ] && case "$CONNECT" in claude|both) say "Claude Code connector: ~/.claude/rules/mudmode.md" ;; esac
say "RESULT: OK"
say "Next: start a NEW chat in your AI. Say \"handoff\" before you stop, and \"mudmode status\" any time."
say "Undo: delete ~/.claude/rules/mudmode.md (or ~/.grok/AGENTS.md if setup made it). Your folder stays yours."
[ -n "$ALLOWED" ] && say "Undo the allowed folder: remove it from additionalDirectories in ~/.claude/settings.json (backup beside it)."
