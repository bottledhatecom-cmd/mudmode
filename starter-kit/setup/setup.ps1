# mudmode setup v1.3.1 (Windows PowerShell 5.1+, PowerShell 7 on any system).
# Copies the kit into ONE folder you own (default: %USERPROFILE%\mudmode). Outside that folder it
# only READS, except one optional connector file you say yes to (~\.claude\rules\mudmode.md for
# Claude Code, ~\.grok\AGENTS.md for Grok Build). It never deletes anything and never replaces an
# existing file without asking (with -Yes it keeps your file and tells you).
# Opt-in only (-AllowDir yes): adds the folder to Claude Code's permissions.additionalDirectories in
# ~\.claude\settings.json, after a dated backup, changing nothing else in that file.
# Usage: powershell -ExecutionPolicy Bypass -File setup\setup.ps1 [-Target DIR]
#        [-Connect claude|grok|both|none] [-Name NAME] [-Tz ZONE] [-AskFirst TEXT] [-Words TEXT] [-AllowDir yes|no] [-Mode lite|full] [-Yes] [-DryRun]
param(
  [string]$Target = "",
  [string]$Connect = "",
  [string]$Name = "",
  [string]$Tz = "",
  [string]$AskFirst = "",
  [string]$Words = "",
  [string]$AllowDir = "",
  [string]$Mode = "",
  [switch]$Yes,
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$KitDir = Split-Path -Parent $PSScriptRoot
$SetupDir = Join-Path $KitDir "setup"
$HomeDir = [Environment]::GetFolderPath("UserProfile")
if (-not $HomeDir) { $HomeDir = $HOME }
if (-not $Target) { $Target = Join-Path $HomeDir "mudmode" }
$Stamp = Get-Date -Format "yyyyMMdd-HHmm"
$Now = (Get-Date -Format "yyyy-MM-dd HH:mm") + " UTC" + (Get-Date -Format "zzz")
$script:Failed = $false; $script:Copied = 0; $script:Same = 0; $script:Kept = 0; $script:Connected = @()
$Utf8 = New-Object System.Text.UTF8Encoding $false
$Interactive = (-not $Yes) -and (-not [Console]::IsInputRedirected)

function Say($m) { Write-Host $m }
function Warn($m) { Write-Host "NOTE: $m" }
function Fail($m) { $script:Failed = $true; Write-Host "PROBLEM: $m" }
function AskYN($q, $def) {
  if (-not $Interactive) { return ($def -eq "y") }
  $hint = if ($def -eq "y") { "[Y/n]" } else { "[y/N]" }
  $a = Read-Host "$q $hint"
  if ($a -match '^[Yy]') { return $true }; if ($a -match '^[Nn]') { return $false }; return ($def -eq "y")
}
function AskText($q, $def) { $a = Read-Host "$q (Enter = $def)"; if (-not $a) { $a = $def }; return $a }
function Stop-Setup($m, $code) { Say "PROBLEM: $m"; Say "RESULT: FAILED"; exit $code }

# --- which kit is this? -------------------------------------------------------
if (Test-Path (Join-Path $KitDir "starter-kit/CORE.md")) { $Starter = Join-Path $KitDir "starter-kit"; $Full = $true }
elseif (Test-Path (Join-Path $KitDir "CORE.md")) { $Starter = $KitDir; $Full = $false }
else { Stop-Setup "can't find CORE.md next to the setup folder. Run this from the unzipped kit." 1 }
foreach ($f in "CORE-LOCAL.md","connector-claude.md","connector-agents.md") {
  if (-not (Test-Path (Join-Path $SetupDir "templates/$f"))) { Stop-Setup "missing setup/templates/$f (the kit looks incomplete; download it again)." 1 }
}

# --- target folder safety ------------------------------------------------------
if ($Target -eq "~" -or $Target.StartsWith("~/") -or $Target.StartsWith("~\")) { $Target = Join-Path $HomeDir $Target.Substring(1).TrimStart('/','\') }
$Target = [IO.Path]::GetFullPath($Target).TrimEnd('/','\')
$HomeFull = [IO.Path]::GetFullPath($HomeDir).TrimEnd('/','\')
$KitFull = [IO.Path]::GetFullPath($KitDir).TrimEnd('/','\')
if ($Target -eq $HomeFull -or $Target -eq [IO.Path]::GetPathRoot($Target).TrimEnd('/','\') -or $Target -eq "") { Stop-Setup "the target must be its own folder (for example ~\mudmode), not '$Target'." 1 }
if (($Target + [IO.Path]::DirectorySeparatorChar).StartsWith($KitFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { Stop-Setup "don't install inside the download folder; pick another place (default ~\mudmode)." 1 }
if ($Target.StartsWith($HomeFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  $DirTxt = "~/" + $Target.Substring($HomeFull.Length + 1).Replace('\','/')
} else { $DirTxt = $Target.Replace('\','/') }

# --- mode (v1.3): the free kit starts in lite mode, the Full Kit in full; a rerun keeps CORE-LOCAL.md's mode --
$DefMode = "lite"; if ($Full) { $DefMode = "full" }
$OldMode = ""; $OldMods = "none"
$LocalPath = Join-Path $Target "CORE-LOCAL.md"
if (Test-Path $LocalPath) {
  $ll = [IO.File]::ReadAllLines($LocalPath)
  $ml = @($ll | Where-Object { $_ -match '^- \*\*Mode \(' })
  if ($ml.Count -and ($ml[0] -match ':\*\* *([A-Za-z]*)')) { $OldMode = $Matches[1].ToLower() }
  if (-not $OldMode) { $OldMode = "full" }   # set up before v1.3 (no Mode line): that was full mode
  $mm = @($ll | Where-Object { $_ -match '^- \*\*Modules [^*]*:\*\*' })
  if ($mm.Count -and ($mm[0] -match ':\*\* *(.*)$')) { $OldMods = $Matches[1] }
  if (-not $OldMods) { $OldMods = "none" }
}
$Mode = $Mode.ToLower()
if ($Mode -and ($Mode -cnotin @("lite","full"))) { Stop-Setup "-Mode must be lite or full." 2 }
if (-not $Mode) { if ($OldMode) { $Mode = $OldMode } else { $Mode = $DefMode } }

# --- questions (only when run by a person) --------------------------------------
$TzGuess = [System.TimeZoneInfo]::Local.Id
if ($Interactive) {
  Say "mudmode setup: this makes your mudmode folder at $DirTxt. Nothing else on this computer changes unless you say yes below."
  if (Test-Path (Join-Path $Target "CORE-LOCAL.md")) {
    Say "You already have settings in $DirTxt/CORE-LOCAL.md; they stay as they are."
    if (-not $Name) { $Name = "kept" }; if (-not $Tz) { $Tz = "kept" }; if (-not $AskFirst) { $AskFirst = "kept" }; if (-not $Words) { $Words = "kept" }
  }
  if (-not $Name) { $Name = AskText "1. What name should the crew call you?" "the owner" }
  if (-not $Tz) { $Tz = AskText "2. Your time zone?" $TzGuess }
  if (-not $Connect) {
    $c = "none"
    if (AskYN "3. Connect mudmode to Claude Code (every new Claude Code chat follows it)?" "n") { $c = "claude" }
    if (AskYN "4. Connect mudmode to Grok Build (the grok command-line tool)?" "n") { if ($c -eq "claude") { $c = "both" } else { $c = "grok" } }
    $Connect = $c
  }
  if (-not $AskFirst) { $AskFirst = AskText "5. Optional: anything the AIs must always ask before doing (extra to the built-in list)?" "nothing extra" }
  if (-not $Words) { $Words = AskText "6. Optional: words to always use or never use?" "none" }
  if ((-not $AllowDir) -and ($Connect -in @("claude","both"))) {
    if (AskYN "7. Let Claude Code use $DirTxt from any project without asking each time? (adds it to ~/.claude/settings.json; backup first)" "n") { $AllowDir = "yes" } else { $AllowDir = "no" }
  }
}
if (-not $Name) { $Name = "the owner" }; if (-not $Tz) { $Tz = $TzGuess }
if (-not $AskFirst) { $AskFirst = "nothing extra" }; if (-not $Words) { $Words = "none" }
if (-not $Connect) { $Connect = "none" }
if (-not $AllowDir) { $AllowDir = "no" }
if ($AllowDir -notin @("yes","no")) { Stop-Setup "-AllowDir must be yes or no." 2 }
if ($Connect -notin @("claude","grok","both","none")) { Stop-Setup "-Connect must be claude, grok, both or none." 2 }

# --- helpers -------------------------------------------------------------------
function Fill($tpl) {
  $t = [IO.File]::ReadAllText($tpl)
  return $t.Replace("{{NAME}}",$Name).Replace("{{TZ}}",$Tz).Replace("{{ASK}}",$AskFirst).Replace("{{WORDS}}",$Words).Replace("{{DIR}}",$DirTxt).Replace("{{DATE}}",$Now).Replace("{{ALLOWDIR}}",$AllowDir).Replace("{{MODE}}",$Mode).Replace("{{MODULES}}",$OldMods)
}
function Mkd($d) { if (Test-Path $d) { return }; if ($DryRun) { Say "would make folder $d" } else { New-Item -ItemType Directory -Force -Path $d | Out-Null } }
function SameFile($a, $b) { return ((Get-FileHash -Algorithm SHA256 $a).Hash -eq (Get-FileHash -Algorithm SHA256 $b).Hash) }
function Place($src, $dst, $live) {
  try {
    if (Test-Path $dst) {
      if (SameFile $src $dst) { $script:Same++; return }
      if ($live) { $script:Kept++; Say "kept your $dst (it is your working file)"; return }
      if ($Interactive -and (AskYN "$dst already exists and is different. Replace it (your copy is backed up first)?" "n")) {
        if ($DryRun) { Say "would back up and replace $dst"; return }
        Copy-Item $dst "$dst.bak-$Stamp"; Copy-Item $src $dst -Force; $script:Copied++; Say "replaced $dst (backup: $dst.bak-$Stamp)"
      } else { $script:Kept++; Say "kept your $dst (not replaced)" }
      return
    }
    if ($DryRun) { Say "would copy to $dst"; $script:Copied++; return }
    Mkd (Split-Path -Parent $dst); Copy-Item $src $dst; $script:Copied++
  } catch { Fail "could not copy to ${dst}: $($_.Exception.Message)" }
}
function PlaceDir($src, $dst) {
  $base = (Resolve-Path $src).Path
  Get-ChildItem -Path $src -Recurse -File | Where-Object { $_.Name -notlike "*.bak-*" -and $_.Name -ne ".DS_Store" } | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($base.Length).TrimStart('/','\')
    Place $_.FullName (Join-Path $dst $rel) $false
  }
}
function NewBak($p) { $b = "$p.bak-$Stamp"; $n = 1; while (Test-Path $b) { $b = "$p.bak-$Stamp-$n"; $n++ }; return $b }
function CoreBody($p) { return ((@([IO.File]::ReadAllLines($p)) | Where-Object { $_ -notmatch '^Version: ' }) -join "`n") }
function SameCore($a, $b) { if (-not ((Test-Path $a) -and (Test-Path $b))) { return $false }; return ((CoreBody $a) -ceq (CoreBody $b)) }
$KitRefresh = -not ((-not $Full) -and (Test-Path (Join-Path $Target "full-kit")))   # never swap Full Kit files for free-kit ones
function Refresh($src, $dst) {
  if ($KitRefresh -and (Test-Path $dst) -and -not (SameFile $src $dst)) {
    if ($DryRun) { Say "would update $dst (backup first)"; $script:Copied++; return }
    try { $rb = NewBak $dst; Copy-Item $dst $rb; Copy-Item $src $dst -Force; $script:Copied++; Say "updated $dst (backup: $(Split-Path $rb -Leaf))" } catch { Fail "could not update ${dst}: $($_.Exception.Message)" }
  } else { Place $src $dst $false }
}
function RefreshDir($src, $dst) {
  $base = (Resolve-Path $src).Path
  Get-ChildItem -Path $src -Recurse -File | Where-Object { $_.Name -notlike "*.bak-*" -and $_.Name -ne ".DS_Store" } | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($base.Length).TrimStart('/','\')
    Refresh $_.FullName (Join-Path $dst $rel)
  }
}
function ModsOn {
  # full mode: the combined core holds every rule, so no module file is listed
  if ($Mode -eq "full") { return [IO.File]::ReadAllText((Join-Path $Starter "cores/MODULES-ON-FULL.md")) }
  $l = New-Object System.Collections.Generic.List[string]
  $l.Add("# MODULES-ON: the module files every new chat loads (mudmode)"); $l.Add("")
  $l.Add('Kept in step with the `Mode:` and `Modules:` lines in CORE-LOCAL.md: setup writes it once, and the AI rewrites it when the owner switches. A switch never deletes anything.'); $l.Add("")
  $l.Add("Mode: lite. Modules on: $OldMods. Say ""mudmode full"" for every module, or ""turn on the <name> module"".")
  foreach ($m in ($OldMods -split '[, ]+')) { if ($m -and (Test-Path (Join-Path $Starter "modules/$m.md"))) { $l.Add("@$DirTxt/modules/$m.md") } }
  return (($l -join "`n") + "`n")
}
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ("mudmode-setup-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Tmp | Out-Null
function WriteTmp($name, $text) { $p = Join-Path $Tmp $name; [IO.File]::WriteAllText($p, $text, $Utf8); return $p }

try {
  # --- 1. the mudmode folder -----------------------------------------------------
  if ($DryRun) { Say "DRY RUN: nothing will be written." }
  if ((Test-Path $Target) -and (Get-ChildItem -Force $Target | Select-Object -First 1)) {
    Say "$DirTxt already exists. Every file you already have there stays as it is; only missing kit files are added."
    if ($Interactive -and -not (AskYN "Continue?" "y")) { Say "Stopped. Nothing changed."; exit 0 }
  }
  Mkd $Target; if ($Mode -eq "full") { Mkd (Join-Path $Target "jobs") }
  # full mode: CORE.md = the combined core (the v1.3.0 rules word for word); lite: the one-page safety core. A mode switch swaps it below (backup first).
  $CoreSrc = Join-Path $Starter "cores/CORE-FULL.md"; if ($Mode -eq "lite") { $CoreSrc = Join-Path $Starter "cores/CORE-LITE.md" }
  if (-not ($OldMode -and ($Mode -ne $OldMode) -and (Test-Path (Join-Path $Target "CORE.md")))) { if (SameCore $CoreSrc (Join-Path $Target "CORE.md")) { Refresh $CoreSrc (Join-Path $Target "CORE.md") } else { Place $CoreSrc (Join-Path $Target "CORE.md") $false } }
  PlaceDir (Join-Path $Starter "templates") (Join-Path $Target "templates")
  PlaceDir (Join-Path $Starter "adapters") (Join-Path $Target "adapters")
  PlaceDir (Join-Path $Starter "addons") (Join-Path $Target "addons")
  RefreshDir (Join-Path $Starter "modules") (Join-Path $Target "modules")
  RefreshDir (Join-Path $Starter "cores") (Join-Path $Target "cores")
  Place (Join-Path $Starter "RULE-MAP.md") (Join-Path $Target "RULE-MAP.md") $false
  Place (Join-Path $SetupDir "templates/CORE-LOCAL.md") (Join-Path $Target "templates/CORE-LOCAL.md") $false
  $liveF = @("OK-LEDGER.md"); if ($Mode -eq "full") { $liveF = @("LESSONS.md","JOBS.md","OK-LEDGER.md") }
  foreach ($f in $liveF) { Place (Join-Path $Starter "templates/$f") (Join-Path $Target $f) $true }
  Place (WriteTmp "CORE-LOCAL.md" (Fill (Join-Path $SetupDir "templates/CORE-LOCAL.md"))) (Join-Path $Target "CORE-LOCAL.md") $true
  # --- mode lines + MODULES-ON.md (v1.3) ----------------------------------------------
  $Switched = $false
  if ($OldMode -and ($Mode -ne $OldMode)) {
    if ($DryRun) { Say "would switch $DirTxt to $Mode mode (CORE.md, CORE-LOCAL.md and MODULES-ON.md backed up first)" }
    else {
      $lb = NewBak $LocalPath; Copy-Item $LocalPath $lb
      $out = New-Object System.Collections.Generic.List[string]; $done = $false
      foreach ($x in [IO.File]::ReadAllLines($LocalPath)) {
        if ((-not $done) -and ($x -match '^- \*\*Mode \(')) { $out.Add(($x -replace ':\*\* *[A-Za-z]*', (":** " + $Mode))); $out.Add("  - SUPERSEDED $Now, by setup (mode switch): was $OldMode"); $done = $true }
        else { $out.Add($x) }
      }
      if (-not $done) { foreach ($x in ((Fill (Join-Path $SetupDir "templates/CORE-LOCAL.md")) -split "`r?`n")) { if ($x -match '^- \*\*(Mode \(|Modules |Suggestions )') { $out.Add($x) } } }
      [IO.File]::WriteAllText($LocalPath, (($out -join "`n") + "`n"), $Utf8)
      $Switched = $true; Say "switched $DirTxt to $Mode mode (backup: $(Split-Path $lb -Leaf))"
      $coreDst = Join-Path $Target "CORE.md"
      if ((Test-Path $coreDst) -and -not (SameFile $CoreSrc $coreDst)) {
        $owned = (SameCore $coreDst (Join-Path $Starter "cores/CORE-FULL.md")) -or (SameCore $coreDst (Join-Path $Starter "cores/CORE-LITE.md"))
        $cb = NewBak $coreDst; Copy-Item $coreDst $cb; Copy-Item $CoreSrc $coreDst -Force; $script:Copied++; Say "CORE.md is now the $Mode core (backup: $(Split-Path $cb -Leaf))"
        if (-not $owned) { Say "WARNING: your CORE.md had your own edits. They are NOT in the new CORE.md; your edited copy is kept in $(Split-Path $cb -Leaf). Put your own rules in CORE-LOCAL.md (a mode switch never changes it)." }
      } elseif (-not (Test-Path $coreDst)) { Copy-Item $CoreSrc $coreDst; $script:Copied++ }
    }
  }
  $modsTxt = WriteTmp "MODULES-ON.md" (ModsOn)
  $modsDst = Join-Path $Target "MODULES-ON.md"
  if ($Switched -and (Test-Path $modsDst)) {
    if (-not (SameFile $modsTxt $modsDst)) { Copy-Item $modsDst (NewBak $modsDst); Copy-Item $modsTxt $modsDst -Force; $script:Copied++ }
  } elseif ($DryRun -and $OldMode -and ($Mode -ne $OldMode) -and (Test-Path $modsDst)) { }
  elseif (($Mode -eq "full") -and $KitRefresh -and (Test-Path $modsDst) -and ((@([IO.File]::ReadAllLines($modsDst)) | Select-Object -First 1) -like "# MODULES-ON (mudmode): full mode*") -and -not (SameFile $modsTxt $modsDst)) { Refresh $modsTxt $modsDst }
  else { Place $modsTxt $modsDst $true }
  $hof = @"
# HANDOFF (rewrite at the end of every session; keep the last 4 in handoff/, older ones in handoff/archive/)

**Next single action:** ask the owner what the first job is.

- **Written:** $Now, by mudmode setup v1.3.1
- **Goal:** first session with mudmode
- **Stage:** switched on
- **Live state to re-check before editing:** none yet
- **What changed this session:** mudmode folder set up at $DirTxt
- **Decisions made (and by whom):** owner settings in CORE-LOCAL.md (owner's answers at setup)
- **What failed or was tried and dropped:** none
- **Open asks for the owner:** none
- **Running things left behind:** none
- **Risks / watch out:** none
- **Lessons for the crew:** none
"@
  $hofLite = @"
# HANDOFF (lite: rewrite before you stop; the full form is templates/HANDOFF.md, module handoff-plus)

**Next single action:** ask the owner what the first job is.

- **Written:** $Now, by mudmode setup v1.3.1
- **What changed:** mudmode folder set up at $DirTxt (lite mode)
- **Unused OKs (exact scope):** none
- **Still running:** none
- **Open asks for the owner:** none
"@
  if ($Mode -ne "full") { $hof = $hofLite }
  Place (WriteTmp "HANDOFF.md" (($hof -replace "`r`n","`n") + "`n")) (Join-Path $Target "HANDOFF.md") $true
  if ($Full) {
    foreach ($f in "MUDMODE.md","LICENSE.md","README-START-HERE.md") { Place (Join-Path $KitDir $f) (Join-Path $Target "full-kit/$f") $false }
    PlaceDir (Join-Path $KitDir "adapters") (Join-Path $Target "full-kit/adapters")
    PlaceDir (Join-Path $KitDir "tools") (Join-Path $Target "full-kit/tools")
    PlaceDir (Join-Path $KitDir "extras") (Join-Path $Target "full-kit/extras")
  } elseif (Test-Path (Join-Path $KitDir "LICENSE")) { Place (Join-Path $KitDir "LICENSE") (Join-Path $Target "LICENSE") $false }
  $claudeTxt = WriteTmp "claude.md" (Fill (Join-Path $SetupDir "templates/connector-claude.md"))
  $agentsTxt = WriteTmp "agents.md" (Fill (Join-Path $SetupDir "templates/connector-agents.md"))
  Place $claudeTxt (Join-Path $Target "connectors/claude-rules-mudmode.md") $false
  Place $agentsTxt (Join-Path $Target "connectors/AGENTS-snippet.md") $false

  # --- 2. optional connector (the only write outside the folder) -------------------
  if ($Connect -in @("claude","both")) {
    $dst = Join-Path $HomeDir ".claude/rules/mudmode.md"
    if ((Test-Path $dst) -and (SameFile $claudeTxt $dst)) { $script:Connected += "Claude-Code" }
    elseif (Test-Path $dst) {
      if ($Interactive -and (AskYN "$dst already exists and is different. Replace it (backup kept)?" "n")) {
        if ($DryRun) { Say "would back up and replace $dst" } else { Copy-Item $dst "$dst.bak-$Stamp"; Copy-Item $claudeTxt $dst -Force; $script:Connected += "Claude-Code" }
      } else { Warn "$dst already exists with other text; left it alone. The new text is in $DirTxt/connectors/claude-rules-mudmode.md." }
    } elseif ($DryRun) { Say "would write $dst" }
    else { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null; Copy-Item $claudeTxt $dst; $script:Connected += "Claude-Code" }
  }
  if ($Connect -in @("grok","both")) {
    $dst = Join-Path $HomeDir ".grok/AGENTS.md"
    if (Test-Path $dst) {
      if (Select-String -Path $dst -Pattern "mudmode connector" -Quiet) { $script:Connected += "Grok-Build" }
      else { Warn "you already have $dst; left it alone. To connect, add the lines in $DirTxt/connectors/AGENTS-snippet.md to it (or ask your AI to, with a backup)." }
    } elseif ($DryRun) { Say "would write $dst" }
    else { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null; Copy-Item $agentsTxt $dst; $script:Connected += "Grok-Build" }
  }
  # --- 2b. opt-in: Claude Code allowed folders (only with -AllowDir yes) -------------
  $script:Allowed = ""
  if ($AllowDir -eq "yes") {
    $sp = Join-Path $HomeDir ".claude/settings.json"
    $adir = $Target.Replace('\','/')
    if ($DryRun) { Say "would add $adir to permissions.additionalDirectories in ~/.claude/settings.json (backup first)" }
    else {
      $raw = if (Test-Path $sp) { [IO.File]::ReadAllText($sp) } else { "" }
      $out = $null; $bad = ""
      try {
        if ($PSVersionTable.PSVersion.Major -ge 7 -and ("System.Text.Json.Nodes.JsonNode" -as [type])) {
          # keeps every value exactly as it was (no date or number re-formatting)
          # (no "$x = if ..." here: PowerShell would unroll the JSON object into nothing)
          if ($raw.Trim()) { $root = [System.Text.Json.Nodes.JsonNode]::Parse($raw) } else { $root = [System.Text.Json.Nodes.JsonObject]::new() }
          if ($root -isnot [System.Text.Json.Nodes.JsonObject]) { $bad = "unexpected layout" }
          else {
            $perm = $root["permissions"]
            if ($null -eq $perm) { $perm = [System.Text.Json.Nodes.JsonObject]::new(); $root["permissions"] = $perm }
            if ($perm -isnot [System.Text.Json.Nodes.JsonObject]) { $bad = "unexpected permissions layout" }
            else {
              $arr = $perm["additionalDirectories"]
              if ($null -eq $arr) { $arr = [System.Text.Json.Nodes.JsonArray]::new(); $perm["additionalDirectories"] = $arr }
              if ($arr -isnot [System.Text.Json.Nodes.JsonArray]) { $bad = "unexpected additionalDirectories layout" }
              elseif (@($arr | ForEach-Object { if ($_) { $_.ToString() } }) -contains $adir) { $script:Allowed = "already there" }
              else {
                $arr.Add([System.Text.Json.Nodes.JsonValue]::Create([string]$adir))
                $o = [System.Text.Json.JsonSerializerOptions]::new(); $o.WriteIndented = $true
                $o.Encoder = [System.Text.Encodings.Web.JavaScriptEncoder]::UnsafeRelaxedJsonEscaping
                $out = $root.ToJsonString($o) + "`n"
              }
            }
          }
        } else {
          if ($raw.Trim()) { $obj = $raw | ConvertFrom-Json } else { $obj = New-Object PSObject }
          if ($obj -isnot [System.Management.Automation.PSCustomObject]) { $bad = "unexpected layout" }
          else {
            if ($null -eq $obj.permissions) { $obj | Add-Member -NotePropertyName permissions -NotePropertyValue (New-Object PSObject) }
            if ($obj.permissions -isnot [System.Management.Automation.PSCustomObject]) { $bad = "unexpected permissions layout" }
            else {
              $list = @(); if ($null -ne $obj.permissions.additionalDirectories) { $list = @($obj.permissions.additionalDirectories) }
              if ($list -contains $adir) { $script:Allowed = "already there" }
              else { $obj.permissions | Add-Member -Force -NotePropertyName additionalDirectories -NotePropertyValue (@($list) + $adir); $out = ($obj | ConvertTo-Json -Depth 100) + "`n" }
            }
          }
        }
      } catch { $bad = "it is not plain JSON" }
      if ($bad) { Warn "left ~/.claude/settings.json alone ($bad). To allow the folder yourself, add `"$adir`" to permissions.additionalDirectories in that file." }
      elseif ($out) {
        $null = $out | ConvertFrom-Json   # must parse before it is written
        if (Test-Path $sp) {
          $bak = "$sp.bak-$Stamp"; $n = 1; while (Test-Path $bak) { $bak = "$sp.bak-$Stamp-$n"; $n++ }
          Copy-Item $sp $bak; Say "backed up your Claude Code settings to $bak"
        } else { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $sp) | Out-Null }
        $tmpSp = "$sp.mudmode-tmp"; [IO.File]::WriteAllText($tmpSp, $out, $Utf8); Move-Item -Force $tmpSp $sp
        $script:Allowed = "added"
      }
    }
  }
} catch { Fail $_.Exception.Message }
finally { Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue }

# --- 3. log + result ------------------------------------------------------------
$conn = if ($script:Connected.Count) { " " + ($script:Connected -join " ") } else { "" }
if (-not $DryRun -and (Test-Path $Target)) {
  $log = "`n## $Now setup v1.3.1 from $(Split-Path -Leaf $KitDir)`n- copied $($script:Copied), already the same $($script:Same), kept yours $($script:Kept); connected:$(if ($conn) { $conn } else { ' none' }); allowed folder: $(if ($script:Allowed) { $script:Allowed } else { 'no' }); mode: $Mode`n"
  [IO.File]::AppendAllText((Join-Path $Target "SETUP-LOG.md"), $log, $Utf8)
}
Say ""
Say "mudmode folder: $DirTxt  (copied $($script:Copied), already the same $($script:Same), kept yours $($script:Kept))"
Say ("Connected to:" + $(if ($conn) { $conn } else { " nothing (you can connect later: run this again)" }))
if ($script:Allowed) { Say "Claude Code allowed folders: $($script:Allowed)" }
if ($script:Failed) { Say "RESULT: FAILED (see the PROBLEM lines above)"; exit 1 }
if ($DryRun) { Say "RESULT: OK (dry run, nothing written)"; exit 0 }
$lp = Join-Path $Target "CORE-LOCAL.md"
if (Test-Path $lp) { Say "Your settings ($DirTxt/CORE-LOCAL.md):"; Get-Content $lp | Where-Object { $_ -like "- **NAME**".Replace("NAME","*") } | ForEach-Object { Say $_.Replace("**","") } }
if ($script:Connected -contains "Claude-Code") { Say "Claude Code connector: ~/.claude/rules/mudmode.md" }
Say "RESULT: OK"
if ($Mode -eq "lite") { Say 'You''re in lite mode; say "mudmode full" for every module.' }
Say 'Daily report: say "mudmode report" any time; if your AI can run scheduled tasks, it will offer to write one nightly in reports/ (only with your OK).'
Say 'Next: start a NEW chat in your AI. Say "handoff" before you stop, and "mudmode status" any time.'
Say "Undo: delete ~\.claude\rules\mudmode.md (or ~\.grok\AGENTS.md if setup made it). Your folder stays yours."
if ($script:Allowed) { Say "Undo the allowed folder: remove it from additionalDirectories in ~\.claude\settings.json (backup beside it)." }
