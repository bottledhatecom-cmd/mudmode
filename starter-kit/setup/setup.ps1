# mudmode setup v1.4.0 (Windows PowerShell 5.1+, PowerShell 7 on any system).
# Copies the kit into ONE folder you own (default: %USERPROFILE%\mudmode). Outside that folder it
# only READS, except one optional connector file you say yes to (~\.claude\rules\mudmode.md for
# Claude Code, ~\.grok\AGENTS.md for Grok Build, ~\.codex\AGENTS.md for Codex). It never deletes anything. On a rerun it updates,
# with a backup first: the rule files in cores\ and modules\, plus CORE.md and the connector files
# when they still match a released mudmode version. Any other file you have is kept unless you
# say yes to replacing it (with -Yes it keeps your file and tells you). With -Yes (or no console) it
# only uses a new or empty folder, or a folder that already holds mudmode; any other folder stops it.
# One CORE.md (v1.3.6): everyday first; mudgo (auto, on or off) adds the rules for technical
# work. -Mudgo sets it (default auto). The old -Mode lite|full still works: lite = auto, full = on.
# Short name: "mud status" works like "mudmode status" in your AI chats. It is a word your AI
# understands, not a PowerShell command, so setup changes no profile. If this computer already has
# a command, alias or function called mud (or setup can't check), setup leaves it alone, turns the
# short name off and says so.
# Opt-in only (-AllowDir yes): adds the folder to Claude Code's permissions.additionalDirectories in
# ~\.claude\settings.json, after a dated backup, changing nothing else in that file.
# Usage: powershell -ExecutionPolicy Bypass -File setup\setup.ps1 [-Target DIR]
#        [-Connect claude|grok|codex|both|all|none] [-Name NAME] [-Tz ZONE] [-AskFirst TEXT] [-Words TEXT] [-AllowDir yes|no] [-Mudgo auto|on|off] [-UpdateCheck on|off] [-Yes] [-DryRun]
param(
  [string]$Target = "",
  [string]$Connect = "",
  [string]$Name = "",
  [string]$Tz = "",
  [string]$AskFirst = "",
  [string]$Words = "",
  [string]$AllowDir = "",
  [string]$Pro = "",
  [string]$Mode = "",   # before v1.3.6: lite = -Mudgo auto, full = -Mudgo on
  [string]$UpdateCheck = "",
  [string]$Mudgo = "",   # v1.3.8; the older -Pro above is kept and means the same (not in the usage line)
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
$script:Failed = $false; $script:Refreshed = 0; $script:LeftClaude = $false; $script:Copied = 0; $script:Same = 0; $script:Kept = 0; $script:Connected = @()
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
if (($HomeFull + [IO.Path]::DirectorySeparatorChar).StartsWith($Target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { Stop-Setup "the target must be its own new folder (for example ~\mudmode), not your home folder or a folder above it ('$Target')." 1 }   # v1.3.5: a folder above home is refused too, as in setup.sh
if (($Target + [IO.Path]::DirectorySeparatorChar).StartsWith($KitFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { Stop-Setup "don't install inside the download folder; pick another place (default ~\mudmode)." 1 }
if ($Target.StartsWith($HomeFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  $DirTxt = "~/" + $Target.Substring($HomeFull.Length + 1).Replace('\','/')
} else { $DirTxt = $Target.Replace('\','/') }
# v1.3.6: compare real paths too, as setup.sh does, so a junction or symbolic link that leads to the home
# folder, a folder above it or a drive root is refused as well. It only reads.
function ResolveLinks($p) {
  for ($i = 0; $i -lt 40; $i++) {
    $it = Get-Item -LiteralPath $p -Force -ErrorAction Stop
    if ($it.PSObject.Methods.Name -contains 'ResolveLinkTarget') { $r = $it.ResolveLinkTarget($true); if ($r) { return $r.FullName.TrimEnd('/','\') }; return $p }
    if ($it.LinkType -and $it.Target) { $t = "$(@($it.Target)[0])"; if (-not [IO.Path]::IsPathRooted($t)) { $t = Join-Path (Split-Path -Parent $p) $t }; $p = [IO.Path]::GetFullPath($t).TrimEnd('/','\'); continue }
    return $p
  }
  return $p
}
function RealDir($p) {
  $full = [IO.Path]::GetFullPath($p).TrimEnd('/','\'); $root = [IO.Path]::GetPathRoot($full)
  $parts = @($full.Substring($root.Length).Split([char[]]@('/','\'), [StringSplitOptions]::RemoveEmptyEntries))
  $acc = $root; $exists = $true
  foreach ($pt in $parts) {
    $acc = Join-Path $acc $pt
    if ($exists -and (Test-Path -LiteralPath $acc)) { try { $acc = ResolveLinks $acc } catch { } } else { $exists = $false }
  }
  return ([IO.Path]::GetFullPath($acc).TrimEnd('/','\')).ToLowerInvariant()
}
$Sep = [IO.Path]::DirectorySeparatorChar
$RT = RealDir $Target; $RH = RealDir $HomeFull
if ($RT -eq "" -or $RT -eq [IO.Path]::GetPathRoot($RT).TrimEnd('/','\').ToLowerInvariant() -or $RT -eq $RH -or ($RH + $Sep).StartsWith($RT + $Sep)) { Stop-Setup "the target must be its own new folder (for example ~\mudmode), not your home folder, a folder above it or a drive ('$Target' leads to '$RT')." 1 }

# --- pro layer (v1.3.6): one CORE.md for everyone, everyday first. The pro layer is auto (the default for a new
# folder), on or off. A rerun keeps CORE-LOCAL.md's "Pro layer:" line; a folder from before v1.3.6 has a "Mode:" line
# instead (or none, before v1.3): every one of them becomes pro auto (v1.3.6b). Setup then adds the "Pro layer:" line, and
# for full or no line a "One-time note" line, which the AI tells the owner once and then marks SHOWN.
# v1.3.8: the layer is named mudgo. New settings files say "mudgo:"; an older "Pro layer:" line is read the same and kept.
$OldPro = ""; $OldMods = "none"; $Legacy = ""; $OneTime = $false
$DefMods = "none"; if ($Full) { $DefMods = "usage" }   # Full Kit: the usage meter is on by default
$LocalPath = Join-Path $Target "CORE-LOCAL.md"
if (Test-Path $LocalPath) {
  $ll = [IO.File]::ReadAllLines($LocalPath)
  $pl = @($ll | Where-Object { $_ -match '^- \*\*(mudgo|Pro layer) \(' })
  if ($pl.Count -and ($pl[0] -match ':\*\* *([A-Za-z]*)')) { $OldPro = $Matches[1].ToLower() }
  if ($OldPro -cnotin @("auto","on","off")) { $OldPro = "" }
  if (-not $OldPro) {
    $ml = @($ll | Where-Object { $_ -match '^- \*\*Mode \(' })
    if ($ml.Count -and ($ml[0] -match ':\*\* *([A-Za-z]*)')) { $Legacy = $Matches[1].ToLower() }
    $OldPro = "auto"; if ($Legacy -ne "lite") { $OneTime = $true }
    if (-not $Legacy) { $Legacy = "none" }
  }
  $mm = @($ll | Where-Object { $_ -match '^- \*\*Modules [^*]*:\*\*' })
  if ($mm.Count -and ($mm[0] -match ':\*\* *(.*)$')) { $OldMods = $Matches[1] }
  if (-not $OldMods) { $OldMods = "none" }
} else { $OldMods = $DefMods }
$Pro = $Pro.ToLower(); $Mode = $Mode.ToLower(); $Mudgo = $Mudgo.ToLower()
if ($Mudgo -and ($Mudgo -cnotin @("auto","on","off"))) { Stop-Setup "-Mudgo must be auto, on or off." 2 }
if ($Pro -eq "everyday") { $Pro = "auto" } elseif ($Pro -eq "pro") { $Pro = "on" }
if ($Pro -and ($Pro -cnotin @("auto","on","off"))) { Stop-Setup "-Mudgo must be auto, on or off." 2 }
if ($Mudgo) {
  if ($Pro -and ($Pro -cne $Mudgo)) { Stop-Setup "-Mudgo and -Pro say different things; give only -Mudgo auto, on or off." 2 }
  $Pro = $Mudgo
}
if ($Mode) {
  if ($Mode -cin @("lite","everyday")) { if (-not $Pro) { $Pro = "auto" } }
  elseif ($Mode -cin @("full","pro")) { if (-not $Pro) { $Pro = "on" } }
  else { Stop-Setup "-Mode must be lite or full (now: -Mudgo auto, on or off)." 2 }
}
if (-not $Pro) { if ($OldPro) { $Pro = $OldPro } else { $Pro = "auto" } }
if ($Pro -ne "auto") { $OneTime = $false }   # the one-time note is only for a move to mudgo auto

# --- questions (only when run by a person) --------------------------------------
$TzGuess = [System.TimeZoneInfo]::Local.Id
$HaveLocal = Test-Path (Join-Path $Target "CORE-LOCAL.md")
$UpdGiven = [bool]$UpdateCheck
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
    if (AskYN "4b. Connect mudmode to Codex (OpenAI's coding tool)? (writes ~/.codex/AGENTS.md; an existing file is backed up first and your own text in it is kept)" "n") {
      if ($c -eq "both") { $c = "all" } elseif ($c -eq "claude") { $c = "claude,codex" } elseif ($c -eq "grok") { $c = "grok,codex" } else { $c = "codex" } }
    $Connect = $c
  }
  if (-not $AskFirst) { $AskFirst = AskText "5. Optional: anything the AIs must always ask before doing (extra to the built-in list)?" "nothing extra" }
  if (-not $Words) { $Words = AskText "6. Optional: words to always use or never use?" "none" }
  if ((-not $AllowDir) -and ($Connect -in @("claude","both","all","claude,codex"))) {
    if (AskYN "7. Let Claude Code use $DirTxt from any project without asking each time? (adds it to ~/.claude/settings.json; backup first)" "n") { $AllowDir = "yes" } else { $AllowDir = "no" }
  }
  if ((-not $UpdateCheck) -and (-not $HaveLocal)) {
    if (AskYN "8. Optional: when you say ""mudmode status"", also check online for a newer mudmode? (it only reads a small public version file, sends no personal info, just a normal web request, and never installs anything)" "n") { $UpdateCheck = "on" } else { $UpdateCheck = "off" }
  }
}
if (-not $Name) { $Name = "the owner" }; if (-not $Tz) { $Tz = $TzGuess }
if (-not $AskFirst) { $AskFirst = "nothing extra" }; if (-not $Words) { $Words = "none" }
if (-not $Connect) { $Connect = "none" }
if (-not $AllowDir) { $AllowDir = "no" }
$UpdateCheck = $UpdateCheck.ToLower(); if (-not $UpdateCheck) { $UpdateCheck = "off" }
if ($UpdateCheck -cnotin @("on","off")) { Stop-Setup "-UpdateCheck must be on or off." 2 }
if ($AllowDir -notin @("yes","no")) { Stop-Setup "-AllowDir must be yes or no." 2 }
if ($Connect -notin @("claude","grok","codex","both","all","none","claude,codex","grok,codex")) { Stop-Setup "-Connect must be claude, grok, codex, both (Claude Code and Grok Build), all or none." 2 }

# --- short name "mud" (a word for your AI, not a PowerShell command) -----------------
# If "mud" is already a command, alias or function here, the short name is off: mudmode never
# overrides it. The lookup never loads a module (autoloading is off for it). If a profile can't be
# read, or the lookup fails, setup can't be sure, so the short name is off too ("unsure means off").
# This only reads; it changes no profile.
function Find-Taken($nm) {   # -> @{ Where = "" (free) or where it is; Unsure = $true if setup couldn't check }
  $r = @{ Where = ""; Unsure = $false }
  try {
    # module autoloading off for this lookup only. It has to be set in the global scope (Windows
    # PowerShell 5.1 ignores a function or script setting when setup is started with &), and it is
    # put back exactly as it was right after.
    $hadAuto = Test-Path variable:global:PSModuleAutoLoadingPreference; $prevAuto = $global:PSModuleAutoLoadingPreference
    $global:PSModuleAutoLoadingPreference = "None"
    try { $mc = @(Get-Command $nm -CommandType Alias,Function,Filter,Cmdlet,ExternalScript,Application -ErrorAction SilentlyContinue)[0] }
    finally {
      if ($hadAuto) { $global:PSModuleAutoLoadingPreference = $prevAuto }
      else { $global:PSModuleAutoLoadingPreference = "All"; Remove-Variable PSModuleAutoLoadingPreference -Scope Global -ErrorAction SilentlyContinue }
    }
    if ($mc) { $r.Where = if ($mc.Source) { $mc.Source } else { "$($mc.CommandType) $nm" }; return $r }
  } catch { $r.Where = "the command lookup failed"; $r.Unsure = $true; return $r }
  # Installed modules that are NOT loaded: Get-Module -ListAvailable lists them without importing
  # them (it reads each module's manifest, or looks at its files, but never runs the module).
  # If one exports a mud command, alias or function, mud is taken. If the list fails: unsure, so off.
  try {
    foreach ($mo in @(Get-Module -ListAvailable -ErrorAction Stop)) {
      $ex = @(); foreach ($k in @($mo.ExportedCommands.Keys) + @($mo.ExportedFunctions.Keys) + @($mo.ExportedAliases.Keys) + @($mo.ExportedCmdlets.Keys)) { if ($k) { $ex += "$k" } }
      if ($ex -contains $nm) { $r.Where = "the PowerShell module $($mo.Name) ($($mo.Path))"; return $r }
    }
  } catch { $r.Where = "the module list couldn't be read"; $r.Unsure = $true; return $r }
  $profs = @(); try { $profs = @($PROFILE.CurrentUserAllHosts, $PROFILE.CurrentUserCurrentHost, $PROFILE.AllUsersAllHosts, $PROFILE.AllUsersCurrentHost) } catch { }
  foreach ($pf in $profs) {
    if (-not $pf) { continue }
    try {
      if (-not (Test-Path -LiteralPath $pf)) { continue }
      $pl = [IO.File]::ReadAllLines($pf)
      # generous on purpose (a false "taken" only means off): Set-Alias/New-Alias/sal/nal with mud
      # anywhere as a word, function/filter [global:|script:]mud, function:mud (Set-Item, New-Item, ${function:mud})
      $rx = '(?i)(\b(Set-Alias|New-Alias|sal|nal)\b.*(^|[\s:''"])' + $nm + '([\s''";]|$))|(\b(function|filter)\s+((global|script|private|local):)?' + $nm + '\b)|(function:((global|script|private|local):)?' + $nm + '\b)'
      if (@($pl | Where-Object { $_ -match $rx }).Count) { $r.Where = $pf; return $r }
    } catch { $r.Where = "couldn't read $pf"; $r.Unsure = $true; return $r }
  }
  return $r
}
$tk = Find-Taken "mud"; $MudWhere = $tk.Where; $MudUnsure = $tk.Unsure
$MudShort = "on"
if ($MudUnsure) { $MudShort = "off (setup couldn't check whether mud is already taken here)" }
elseif ($MudWhere) { $MudShort = "off (this computer already has a command called mud)" }

# --- helpers -------------------------------------------------------------------
function Fill($tpl) {
  $t = [IO.File]::ReadAllText($tpl)
  return $t.Replace("{{NAME}}",$Name).Replace("{{TZ}}",$Tz).Replace("{{ASK}}",$AskFirst).Replace("{{WORDS}}",$Words).Replace("{{DIR}}",$DirTxt).Replace("{{DATE}}",$Now).Replace("{{ALLOWDIR}}",$AllowDir).Replace("{{PRO}}",$Pro).Replace("{{MODULES}}",$OldMods).Replace("{{UPDATECHECK}}",$UpdateCheck).Replace("{{MUDSHORT}}",$MudShort)
}
function Mkd($d) { if (Test-Path $d) { return }; if ($DryRun) { Say "would make folder $d" } else { New-Item -ItemType Directory -Force -Path $d | Out-Null } }
function SameFile($a, $b) { return ((Get-FileHash -Algorithm SHA256 $a).Hash -eq (Get-FileHash -Algorithm SHA256 $b).Hash) }
function Place($src, $dst, $live) {
  try {
    if (Test-Path $dst) {
      if (SameFile $src $dst) { $script:Same++; return }
      if ($live) { $script:Kept++; Say "kept your $dst (it is your working file)"; return }
      if ($KitRefresh -and ($StockKit -contains (ShaLf $dst))) { Refresh $src $dst; return }   # an unedited kit file from v1.3.5 (backup first)
      if ($Interactive -and (AskYN "$dst already exists and is different. Replace it (your copy is backed up first)?" "n")) {
        if ($DryRun) { Say "would back up and replace $dst"; return }
        $pb = NewBak $dst; Copy-Item $dst $pb; Copy-Item $src $dst -Force; $script:Copied++; Say "replaced $dst (backup: $pb)"
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
    try { $rb = NewBak $dst; Copy-Item $dst $rb; Copy-Item $src $dst -Force; $script:Copied++; $script:Refreshed++; Say "updated $dst (backup: $(Split-Path $rb -Leaf))" } catch { Fail "could not update ${dst}: $($_.Exception.Message)" }
  } else { Place $src $dst $false }
}
# --- known stock files (v1.3.6): sha256 of the CORE.md cores and connector templates in the released
# v1.3.0 to v1.3.5 kits, plus (v1.3.6c) the v1.3.6 and v1.3.6b CORE.md, connectors and changed kit files, plus (v1.3.8) the v1.3.6c ones (shipped unchanged in v1.3.7), plus (v1.4.0) the v1.3.8 CORE.md (shipped unchanged in the first v1.4.0 build). A file that matches one byte for byte (Windows line endings count as
# the same) was written by setup and never edited.
$StockCoreLite = @("8df2ce0d545cc0a53b4517e6cba9f7908c0eb42724c699cc0cb1b9c671d2ad63","02158beeac2d7222fba9e401fc7549228818aa48d98d83d7a5ce3c5e0fe9e56b","f4f1e69151ac5801120bb919a5a06ffd38c723ca1376a1a2330d0cc2e185916d","e512ab0beb8df0baf4769ccf8b465bb7c35f9e17d286fd17eab8815e88d6ce0e","070fc2265abbe210afad844a66144956361d294a681f6352e389380b34fd5012","70db2f87a11085da968c6d36739f4fa805ee50acc145b14384e8ba2a6bea0f75")
$StockCoreFull = @("a779f75c31520275342c1b274afb561c51c340e100e244fe35fafab4be91cabd","2fdb403ef64ecd84856a90f5c5d90355d9eae335c03f85c748200bb6e6d2dee7","b461794b86be0e8acac8a55ffc203257b3b14c4cc8b93e9c9ea30c9957448d18","b641b751a7ca34761f48dd6d9c78617039057f4e4b4dbfa8b4645641d8bd1654","b388742850064a75763066d4b211b844ccc0cabf8c96e6cf5416f04a0fea6fba","ab869c9d52b3b454f6f282d50921e404496fe64a305aef964cf9080759663b90","aa7f5c86027b5b7ed8e490016445c7b9cff50d1d22bb3c361c8aac1d4666bf2f","b9d7910149ea8db4d1741606ac9e6689375f944c4a4804d497c6881cfcb6fd81","721da803cc966cbf96b22de15b5f3e3083ff94be621348879f6bd3ee62e87933","7b37a7d7cd9b73d49ebea70252f20424f025389841611771030bc59cb4e65cc7")
# (holder-r4) $StockConnList also has the v1.3.8 connector templates (header "written by mudmode setup v1.3.8", shipped unchanged in the first v1.4.0 build).
$StockConnList = @("999fc995023857871a8c345bf6544b380cce2cfae22c66e2920a059a47305259","669af4c6f16c9c8b7c7dd8cfb15009c77bcffe5259ed2e38fd2194d5fe060c52","8fcfaaa9c9084b8d2120f55f3ae2c32afd5616193caeadc7f259695d00205780","b85fc69197fa843c927c286258bd80990f63ec1af0c7d8886ae3c61230af87ac","a7a46d2be9c464bdbd5bec37889299753db3bac746cb6932c5a7914e3350315c","0bbb4202af065919fa0e701cc2bf756682d07d43e0c259ad3b0d46e9d6889e1f","f2082caa065c3d164016baf53e6ad6c2cae11287d975d09e7e96c7d5803252fd","2006e87384ab657dae27a9c98d908b57ea983f21ff3e2f7a6578e6cd1e4834d8","46b6957686bd44516246645e36070e5f3aa9d28ccf543e4abdd384fb66caa870","8c7116b7496cbb7b9d5135d3fb4b9865ed9e0589b78ea7364b8c4f5e60745152","27ca4ad739f7155191adf1089a096c34d3466f172d0c4fbd7fc3672d48c534ed","b9b2d70c62bd38aaf8abbf12707c4ddc4e233bca86c6ffa4fcbe65d9a681bd7e","6890bf3799ac7442865f8b29ed022bf2ad8e83e0cfe337cf0e006e1e56bd6485","31fb3548c5f604f689ae2df5b35d73ecc1d91850cd3b2f10ebf6ccf5c326ca04","255fa832309b9a007c1cf590e72ec9ac1cebe79f03a3283f5d76710abb3c8de1","a091d0e3c7f80f18e152dd9bef997cfea71dca03e47f6cdf0e95d396580254cd","4893d0de9e84fffbf4144fe0ff1e151cc3ea95da8acf47dd9f2fbef600af0b45","b381301f11282abb42acff519a31f94eca363ddc1c4a1dcc1b4e6b7464475560","d55a1d5de3ffbae4f0e000f611ea75fc84b33ce7a8c5e56ebe7aced854655bb7","199799d6aa5802c456d50f5f3afa101e38906c824868304f8a424dca7279ed26","95f7b9d131fc47929539ad16ca9257a706a77e96507a0bd0c9bd43adb7337462","b079f16ecfc952946f526bb8d599c1b93af364cd4b9f8854e1e0e3655adb9f69","0f6fd9abb4e114850d2d8c2e5a94d788d2a0669974024c12797ed86766f794af","e42bd0487ad36a5d6395feec54f4ba4fe65d00b2407d2b4ce111abaf5e889d7e","a2d0f3a392aad31a05a69ea8e396cb27d509f1b78cafaea6e45804d7b812d8ab","6e31a38e351cfde47c7648edcf78ac7003c563e7d7a085d5c65f4f00f2b51316")
# v1.3.6: kit files whose v1.3.5 text named lite/full mode; an unedited copy is updated with a backup first.
# (v1.4.0) Also the v1.3.8 templates/SHARED-LESSONS.md (lesson terms (v2) line, shipped unchanged in the first v1.4.0 build).
# (holder-r4) Also the released v1.3.0 templates/SHARED-LESSONS.md (c617e989, shipped unchanged up to v1.3.3) and the v1.3.8
# setup/templates/CORE-LOCAL.md (10126ff5, its 'Set up' line names v1.3.8).
# (holder-r5, owner-approved: the signed rebuild replaces the old licence and readme on upgrade) Also the first v1.4.0 build's
# full-kit/LICENSE.md (2f225ddb) and full-kit/README-START-HERE.md (64950d74). (holder-r6) Also the v1.3.8 ones: LICENSE.md (3386ffda)
# and README-START-HERE.md (6e079afe), checked in the v1.3.8 full-kit zip 8b9136aa.
$StockKit = @("3386ffdaaf027450f7e483c7ba62b314d68f8c16705a25a88b92c78b72046008","6e079afede1215cdbc8e2d69707f48eb81799873c3ddd79ec91260586ba5e47f","2f225ddba2af9963cb36c950ca61c91693cbe8a593e15b0a52603261d7e29bf6","64950d74271998cb317bd3c43a61fabea6c9239ca5fb648bf0d0ddfabafca155","57149889605ce07fb717fc100e8247df26bb0902ddf196b1502127ffc55675bc","dbb033769436a113d126dcdf7986c6c3ed3d440bf918f2cbd1c02d435a363bb5","55e988779c99f90e2bca3c8d73fcd9e5ca4f22b5f169f6eb6640b0af5ef47657","d319a7b2a455ffc30c2d18b3fbb8f8bb7a74115c99f4ddddb9fc21df3d68a0f5","c8c98b61cbfd309327f617c5c195a120aac3afd68a8c628764067002e659c904","acb037613e5413e66b97da95b3855df154a7f3fd102f02f8f4c6b9f830c9267f","dfdf455f41bd2f6856ed655d0e22be5f46347f7936daa040d3fd799866e750d5","c4e038f5216142ae6a141727ff24545176f903c3286d72ad2e0f2ff5b9abe9bc","a6bd8753cd584ff469a4a8a1b66937ba3fd8c76f4781eff6932e63a6a60712b1","d4232077b46a2e71105b4c2ec3d80a8a40f184ccc1bbb7268fb473b1e9cde041","f6ae396da9e5b835f3776771a4c9f36d19a81c7ff104f35c190611d4888e8d06","791692f670486cb3a0b2526fddd233222ed5a3e7f075c94917d9d96dcd5ecd2f","0b4d02d8c5cce00b10ec5a632e0438886d0d9791719d3a31485ff7cc3f4000ae","c9be79cf7fdadd8361e043610a30f413e22d62543131a5e105749ef3269b0209","b2d1b0ddf71e8d1c7a20ec56499342f0fb2c80752e2d3e7847c52f02b6868dfc","5fa3003cce8bb18804b9ede50d9f61f25ca2b69c1d6498869bcb15ce53ca626c","9008d68762445ff033510a32e6295e84f9655564b43f5c3a895fd7cccfa5bc9b","e90b862c0e5826b4392389bae2fe00ce976bc194316e17844310ed1f7d1fbe77","e59a48a42983fd123f899ccffab3025d4bdf077be704dd930c1c608c4d6fad38","7f938ecfe702b0ff869aa0dd687856df8d4f55b8c144c72e66db5acba0645824","c617e989707d3dbbce69c79d429567e9d262f8edc2a44e5b610b96f85f78e2b1","10126ff5afae4a2e4a3baf96586719e4c74faa2e149ffc8e577c7b9f8c389917")
function ShaBytes($b) { $h = [Security.Cryptography.SHA256]::Create(); try { return (($h.ComputeHash($b) | ForEach-Object { $_.ToString("x2") }) -join "") } finally { $h.Dispose() } }
function ShaOf($p) { return (ShaBytes ([IO.File]::ReadAllBytes($p))) }
function ShaLf($p) { return (ShaBytes ($Utf8.GetBytes([IO.File]::ReadAllText($p, $Utf8).Replace("`r`n", "`n")))) }   # the same hash with Windows line endings
function StockConn($p) {
  # put {{DIR}} back where setup filled in the folder, then check the hash
  $t = [IO.File]::ReadAllText($p, $Utf8).Replace("`r`n", "`n").Replace($DirTxt, "{{DIR}}")
  return ($StockConnList -contains (ShaBytes ($Utf8.GetBytes($t))))
}
function ConnUpdate($src, $dst) {
  # replace an installed connector (backup first) only if it is an unedited stock one
  if (-not ($KitRefresh -and (Test-Path $dst) -and -not (SameFile $src $dst) -and (StockConn $dst))) { return $false }
  if ($DryRun) { Say "would update $dst (backup first)"; return $true }
  try { $rb = NewBak $dst; Copy-Item $dst $rb; Copy-Item $src $dst -Force; Say "updated $dst (backup: $(Split-Path $rb -Leaf))"; return $true } catch { Fail "could not update ${dst}: $($_.Exception.Message)"; return $false }
}
function RefreshDir($src, $dst) {
  $base = (Resolve-Path $src).Path
  Get-ChildItem -Path $src -Recurse -File | Where-Object { $_.Name -notlike "*.bak-*" -and $_.Name -ne ".DS_Store" } | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($base.Length).TrimStart('/','\')
    Refresh $_.FullName (Join-Path $dst $rel)
  }
}
function ModsOn($old) {
  # mudgo on: CORE.md Part 2 holds every rule, so no module file is listed. $old = "old": the wording setup wrote before v1.3.8
  if ($Pro -eq "on") { return [IO.File]::ReadAllText((Join-Path $Starter "cores/MODULES-ON-PRO.md")) }
  $k = "mudgo"; $ks = "mudgo on"; if ($old -eq "old") { $k = "Pro layer"; $ks = "pro mode" }
  $l = New-Object System.Collections.Generic.List[string]
  $l.Add("# MODULES-ON: the module files every new chat loads (mudmode)"); $l.Add("")
  $l.Add('Kept in step with the `' + $k + ':` and `Modules:` lines in CORE-LOCAL.md: setup writes it once, and the AI rewrites it when the owner switches. A switch never deletes anything.'); $l.Add("")
  $l.Add("${k}: $Pro. Modules on: $OldMods. Say ""$ks"" for every rule, or ""turn on the <name> module"".")
  foreach ($m in ($OldMods -split '[, ]+')) { if ($m -and (Test-Path (Join-Path $Starter "modules/$m.md"))) { $l.Add("@$DirTxt/modules/$m.md") } }
  return (($l -join "`n") + "`n")
}
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ("mudmode-setup-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Tmp | Out-Null
function WriteTmp($name, $text) { $p = Join-Path $Tmp $name; [IO.File]::WriteAllText($p, $text, $Utf8); return $p }

try {
  # --- 1. the mudmode folder -----------------------------------------------------
  if ($DryRun) { Say "DRY RUN: nothing will be written." }
  $NewDir = -not ((Test-Path $Target) -and (Get-ChildItem -Force $Target | Select-Object -First 1))
  if (-not $NewDir) {
    # v1.3.6: without a person at the console, never add files to a folder that holds something else
    # (a mudmode folder has CORE-LOCAL.md, or the marker setup leaves in a folder it made).
    if ((-not $Interactive) -and -not (Test-Path (Join-Path $Target "CORE-LOCAL.md")) -and -not (Test-Path (Join-Path $Target ".made-by-mudmode-setup"))) {
      Stop-Setup "$DirTxt already has files in it and is not a mudmode folder. Setup only uses a new or empty folder, or your existing mudmode folder. Pick another place with -Target (default ~\mudmode), or run setup yourself in a console to be asked." 1 }
    if ($KitRefresh) { Say "$DirTxt already exists. Your own files stay as they are. Rule files in cores/ and modules/ are updated, with a backup of each." }
    else { Say "$DirTxt already exists and holds the Full Kit. Your files stay as they are; this free kit's setup only adds files that are missing." }
    if ($Interactive -and -not (AskYN "Continue?" "y")) { Say "Stopped. Nothing changed."; exit 0 }
  }
  Mkd $Target; if ($Pro -eq "on") { Mkd (Join-Path $Target "jobs") }
  $marker = Join-Path $Target ".made-by-mudmode-setup"
  if ($NewDir -and -not $DryRun -and (Test-Path $Target) -and -not (Test-Path $marker)) { [IO.File]::WriteAllText($marker, "mudmode setup v1.4.0 found this folder new or empty on $Now. Undo can remove the whole folder.`n", $Utf8) }
  # v1.3.6: one CORE.md (Part 1 everyday, Part 2 mudgo), the same file for every setting. An unedited CORE.md
  # from any released version (lite or full) is updated, with a backup first; one with your own edits is kept.
  $CoreSrc = Join-Path $Starter "CORE.md"
  $coreT = Join-Path $Target "CORE.md"
  if (SameCore $CoreSrc $coreT) { Refresh $CoreSrc $coreT }
  else {
    $coreH = ""; if (Test-Path $coreT) { $coreH = ShaLf $coreT }
    if ($coreH -and $KitRefresh -and (($StockCoreFull + $StockCoreLite) -contains $coreH)) { Refresh $CoreSrc $coreT }   # an unedited CORE.md from a released version
    elseif ($coreH -and $KitRefresh -and -not (SameFile $CoreSrc $coreT)) {
      $script:Kept++; Say "kept your CORE.md: it doesn't match a released CORE.md (your own edits, or an older version), so it was not updated. The new one (everyday first, with mudgo) is in the kit at starter-kit/CORE.md; your own rules belong in CORE-LOCAL.md."
    } else { Place $CoreSrc $coreT $false }
  }
  PlaceDir (Join-Path $Starter "templates") (Join-Path $Target "templates")
  PlaceDir (Join-Path $Starter "adapters") (Join-Path $Target "adapters")
  PlaceDir (Join-Path $Starter "addons") (Join-Path $Target "addons")
  RefreshDir (Join-Path $Starter "modules") (Join-Path $Target "modules")
  RefreshDir (Join-Path $Starter "cores") (Join-Path $Target "cores")
  Place (Join-Path $Starter "RULE-MAP.md") (Join-Path $Target "RULE-MAP.md") $false
  foreach ($f in "check-update.sh","check-update.ps1","update-key.pub") { if (Test-Path (Join-Path $SetupDir $f)) { Refresh (Join-Path $SetupDir $f) (Join-Path $Target "tools/$f") } }   # the opt-in update check (off unless CORE-LOCAL.md says on)
  if ($KitRefresh -and (Test-Path (Join-Path $KitDir "VERSION"))) { Refresh (Join-Path $KitDir "VERSION") (Join-Path $Target "VERSION") }
  if ($KitRefresh -and (Test-Path (Join-Path $KitDir "WHAT-TO-SAY.md"))) { Refresh (Join-Path $KitDir "WHAT-TO-SAY.md") (Join-Path $Target "WHAT-TO-SAY.md") }   # v1.3.5: the list "mudhelp" shows
  Place (Join-Path $SetupDir "templates/CORE-LOCAL.md") (Join-Path $Target "templates/CORE-LOCAL.md") $false
  $liveF = @("OK-LEDGER.md"); if ($Pro -eq "on") { $liveF = @("LESSONS.md","JOBS.md","OK-LEDGER.md") }
  foreach ($f in $liveF) { Place (Join-Path $Starter "templates/$f") (Join-Path $Target $f) $true }
  $localTxt = WriteTmp "CORE-LOCAL.md" (Fill (Join-Path $SetupDir "templates/CORE-LOCAL.md"))
  Place $localTxt (Join-Path $Target "CORE-LOCAL.md") $true
  # -UpdateCheck on|off on a rerun: change only that one line in CORE-LOCAL.md (backup first; the old line is marked SUPERSEDED)
  if ($HaveLocal -and $UpdGiven) {
    $cur = ""; $ul = @([IO.File]::ReadAllLines($LocalPath) | Where-Object { $_ -match '^- \*\*Update check' }) | Select-Object -First 1
    if ($ul -and ($ul -match ':\*\* *([A-Za-z]*)')) { $cur = $Matches[1].ToLower() }
    if ($cur -ne $UpdateCheck) {
      if ($DryRun) { Say "would set the update check to $UpdateCheck in CORE-LOCAL.md (backup first)" }
      else {
        $ub = NewBak $LocalPath; Copy-Item $LocalPath $ub
        $out = New-Object System.Collections.Generic.List[string]; $done = $false
        foreach ($x in [IO.File]::ReadAllLines($LocalPath)) {
          if ((-not $done) -and $cur -and ($x -match '^- \*\*Update check')) { $out.Add(($x -replace ':\*\* *[A-Za-z]*', (":** " + $UpdateCheck))); $out.Add("  - SUPERSEDED $Now, by setup: was $cur"); $done = $true }
          else { $out.Add($x) }
        }
        if (-not $cur) { foreach ($x in [IO.File]::ReadAllLines($localTxt)) { if ($x -match '^- \*\*Update check') { $out.Add($x) } } }
        [IO.File]::WriteAllText($LocalPath, (($out -join "`n") + "`n"), $Utf8)
        Say "update check is now $UpdateCheck (in CORE-LOCAL.md; backup: $(Split-Path $ub -Leaf))"
      }
    }
  }
  # short name on a rerun: if "mud" is taken here and CORE-LOCAL.md doesn't already say off, set that
  # one line to off (backup first; the old line is marked SUPERSEDED). Nothing else changes.
  $script:MudOn = $true
  if (Test-Path $LocalPath) {
    $curMud = ""; $nl = @([IO.File]::ReadAllLines($LocalPath) | Where-Object { $_ -match '^- \*\*Short name "mud"' }) | Select-Object -First 1
    if ($nl -and ($nl -match ':\*\* *([A-Za-z]*)')) { $curMud = $Matches[1].ToLower() }
    if ($curMud -eq "off") { $script:MudOn = $false }
    if ($HaveLocal -and $MudWhere -and ($curMud -ne "off")) {
      if ($DryRun) { Say 'would set the short name "mud" to off in CORE-LOCAL.md (backup first)' }
      else {
        $nb = NewBak $LocalPath; Copy-Item $LocalPath $nb
        $out = New-Object System.Collections.Generic.List[string]; $done = $false
        foreach ($x in [IO.File]::ReadAllLines($LocalPath)) {
          if ((-not $done) -and $curMud -and ($x -match '^- \*\*Short name "mud"')) { $k = $x.IndexOf(":**"); $out.Add($x.Substring(0, $k + 3) + " " + $MudShort); $out.Add("  - SUPERSEDED $Now, by setup: was $curMud"); $done = $true }
          else { $out.Add($x) }
        }
        if (-not $curMud) { foreach ($x in [IO.File]::ReadAllLines($localTxt)) { if ($x -match '^- \*\*Short name "mud"') { $out.Add($x) } } }
        [IO.File]::WriteAllText($LocalPath, (($out -join "`n") + "`n"), $Utf8)
        Say "short name ""mud"" is now off in CORE-LOCAL.md (backup: $(Split-Path $nb -Leaf))"
      }
    }
  }
  if ($MudUnsure) { $script:MudOn = $false; Say "Short name ""mud"" is off: setup couldn't check whether mud is already taken ($MudWhere), so to be safe it stays off. Keep saying ""mudmode status""." }
  elseif ($MudWhere) { $script:MudOn = $false; Say "Short name ""mud"" is off: this computer already has a command called mud ($MudWhere), and mudmode never overrides it. Keep saying ""mudmode status""." }
  # --- mudgo line + MODULES-ON.md (v1.3.6) -------------------------------------------
  # A folder from before v1.3.6 gets a "mudgo:" line (its old "Mode:" line is marked SUPERSEDED); -Mudgo on a
  # rerun changes only that line. CORE-LOCAL.md is backed up first, and so is MODULES-ON.md when it changes.
  $Switched = $false
  $ProChange = $HaveLocal -and (Test-Path $LocalPath) -and ($Legacy -or ($Pro -ne $OldPro))
  if ($ProChange) {
    if ($DryRun) { Say "would set mudgo to $Pro in CORE-LOCAL.md (backup first)" }
    else {
      $lb = NewBak $LocalPath; Copy-Item $LocalPath $lb
      $tl = @((Fill (Join-Path $SetupDir "templates/CORE-LOCAL.md")) -split "`r?`n")
      $proLine = @($tl | Where-Object { $_ -match '^- \*\*mudgo \(' })[0]
      $noteLine = "- **One-time note:** mudmode 1.3.8: you're on mudgo auto now: extra care turns on by itself when the work needs it. Say ""mudgo on"" to keep everything on."
      $cur = @([IO.File]::ReadAllLines($LocalPath))
      $out = New-Object System.Collections.Generic.List[string]; $done = $false
      $hasPro = @($cur | Where-Object { $_ -match '^- \*\*(mudgo|Pro layer) \(' }).Count -gt 0
      foreach ($x in $cur) {
        if ((-not $done) -and $hasPro -and ($x -match '^- \*\*(mudgo|Pro layer) \(')) { $out.Add(($x -replace ':\*\* *[A-Za-z]*', (":** " + $Pro))); $out.Add("  - SUPERSEDED $Now, by setup: was $OldPro"); $done = $true }
        elseif ((-not $done) -and (-not $hasPro) -and ($x -match '^- \*\*Mode \(')) { $out.Add($proLine); if ($OneTime) { $out.Add($noteLine) }; $out.Add("  - SUPERSEDED $Now, by setup v1.4.0: the next line (lite and full are both mudgo auto now; one CORE.md)"); $out.Add($x); $done = $true }
        else { $out.Add($x) }
      }
      if (-not $done) {   # set up before v1.3: add the lines it never had
        $out.Add($proLine); if ($OneTime) { $out.Add($noteLine) }
        foreach ($k in 'Modules ','Suggestions ') { if (-not @($cur | Where-Object { $_ -match ('^- \*\*' + $k) }).Count) { foreach ($x in $tl) { if ($x -match ('^- \*\*' + $k)) { $out.Add($x) } } } }
      }
      [IO.File]::WriteAllText($LocalPath, (($out -join "`n") + "`n"), $Utf8)
      $Switched = $true; Say "mudgo: $Pro (in CORE-LOCAL.md; backup: $(Split-Path $lb -Leaf))"
    }
  }
  $modsTxt = WriteTmp "MODULES-ON.md" (ModsOn)
  $modsDst = Join-Path $Target "MODULES-ON.md"
  if ($Switched -and (Test-Path $modsDst)) {
    if (-not (SameFile $modsTxt $modsDst)) { Copy-Item $modsDst (NewBak $modsDst); Copy-Item $modsTxt $modsDst -Force; $script:Copied++ }
  } elseif ($DryRun -and $ProChange -and (Test-Path $modsDst)) { Say "would update $modsDst (backup first)" }
  elseif (($Pro -eq "on") -and $KitRefresh -and (Test-Path $modsDst) -and ((@([IO.File]::ReadAllLines($modsDst)) | Select-Object -First 1) -match '^# MODULES-ON \(mudmode\): (full mode|pro|mudgo)') -and -not (SameFile $modsTxt $modsDst)) { Refresh $modsTxt $modsDst }
  elseif (($Pro -ne "on") -and $KitRefresh -and (Test-Path $modsDst) -and ([IO.File]::ReadAllText($modsDst).Replace("`r", "") -ceq (ModsOn "old"))) { Refresh $modsTxt $modsDst }   # v1.3.8: setup wrote it with the older words and it was never edited (backup first)
  else { Place $modsTxt $modsDst $true }
  $hof = @"
# HANDOFF (rewrite at the end of every session; keep the last 4 in handoff/, older ones in handoff/archive/)

**Next single action:** ask the owner what the first job is.

- **Written:** $Now, by mudmode setup v1.4.0
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
# HANDOFF (everyday: rewrite before you stop; the full form is templates/HANDOFF.md, module handoff-plus)

**Next single action:** ask the owner what the first job is.

- **Written:** $Now, by mudmode setup v1.4.0
- **What changed:** mudmode folder set up at $DirTxt (everyday first; mudgo $Pro)
- **Unused OKs (exact scope):** none
- **Still running:** none
- **Open asks for the owner:** none
"@
  if ($Pro -ne "on") { $hof = $hofLite }
  Place (WriteTmp "HANDOFF.md" (($hof -replace "`r`n","`n") + "`n")) (Join-Path $Target "HANDOFF.md") $true
  if ($Full) {
    foreach ($f in "MUDMODE.md","LICENSE.md","README-START-HERE.md") { Place (Join-Path $KitDir $f) (Join-Path $Target "full-kit/$f") $false }
    PlaceDir (Join-Path $KitDir "adapters") (Join-Path $Target "full-kit/adapters")
    PlaceDir (Join-Path $KitDir "tools") (Join-Path $Target "full-kit/tools")
    PlaceDir (Join-Path $KitDir "extras") (Join-Path $Target "full-kit/extras")
    if (Test-Path (Join-Path $KitDir "FOR-CHAT-APPS")) { PlaceDir (Join-Path $KitDir "FOR-CHAT-APPS") (Join-Path $Target "full-kit/FOR-CHAT-APPS") }   # v1.4.0: the chat-app file, for Windows exe users
  } elseif (Test-Path (Join-Path $KitDir "LICENSE")) { Place (Join-Path $KitDir "LICENSE") (Join-Path $Target "LICENSE") $false }
  $claudeTxt = WriteTmp "claude.md" (Fill (Join-Path $SetupDir "templates/connector-claude.md"))
  $agentsTxt = WriteTmp "agents.md" (Fill (Join-Path $SetupDir "templates/connector-agents.md"))
  foreach ($pair in @(@($claudeTxt, "connectors/claude-rules-mudmode.md"), @($agentsTxt, "connectors/AGENTS-snippet.md"))) {
    $cd = Join-Path $Target $pair[1]
    if (ConnUpdate $pair[0] $cd) { $script:Copied++ } else { Place $pair[0] $cd $false }
  }

  # --- 2. optional connector (the only write outside the folder) -------------------
  if ($Connect -in @("claude","both","all","claude,codex")) {
    $dst = Join-Path $HomeDir ".claude/rules/mudmode.md"
    if ((Test-Path $dst) -and (SameFile $claudeTxt $dst)) { $script:Connected += "Claude-Code" }
    elseif (ConnUpdate $claudeTxt $dst) { $script:Connected += "Claude-Code" }
    elseif (Test-Path $dst) {
      if ($Interactive -and (AskYN "$dst already exists and is different. Replace it (backup kept)?" "n")) {
        if ($DryRun) { Say "would back up and replace $dst" } else { Copy-Item $dst (NewBak $dst); Copy-Item $claudeTxt $dst -Force; $script:Connected += "Claude-Code" }
      } else { $script:LeftClaude = $true; Warn "$dst already exists with other text; left it alone. The new text is in $DirTxt/connectors/claude-rules-mudmode.md." }
    } elseif ($DryRun) { Say "would write $dst" }
    else { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null; Copy-Item $claudeTxt $dst; $script:Connected += "Claude-Code" }
  }
  if ($Connect -in @("grok","both","all","grok,codex")) {
    $dst = Join-Path $HomeDir ".grok/AGENTS.md"
    if (Test-Path $dst) {
      if (Select-String -Path $dst -Pattern "mudmode connector" -Quiet) { $null = ConnUpdate $agentsTxt $dst; $script:Connected += "Grok-Build" }
      else { Warn "you already have $dst; left it alone. To connect, add the lines in $DirTxt/connectors/AGENTS-snippet.md to it (or ask your AI to, with a backup)." }
    } elseif ($DryRun) { Say "would write $dst" }
    else { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null; Copy-Item $agentsTxt $dst; $script:Connected += "Grok-Build" }
  }
  # v1.3.6c: optional Codex connector, only with -Connect codex|all (or a yes to the question): ~/.codex/AGENTS.md (or $env:CODEX_HOME)
  $codexDir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HomeDir ".codex" }
  $codexDst = Join-Path $codexDir "AGENTS.md"
  if ($Connect -in @("codex","all","claude,codex","grok,codex")) {
    $dst = $codexDst
    if (Test-Path -LiteralPath (Join-Path $codexDir "AGENTS.override.md")) { Warn "$(Join-Path $codexDir 'AGENTS.override.md') exists. Codex reads that file INSTEAD of AGENTS.md, so mudmode will not load in Codex until you merge or remove it. Setup does not touch it." }
    if (Test-Path -LiteralPath $dst) {
      if (SameFile $agentsTxt $dst) { $script:Connected += "Codex" }
      elseif (Select-String -LiteralPath $dst -Pattern "mudmode connector" -Quiet) {
        if (ConnUpdate $agentsTxt $dst) { $script:Connected += "Codex" } else { Warn "your $dst already holds a mudmode connector that has your own edits; left it as it was." }
      }
      elseif ($Interactive -and (AskYN "You already have $dst. Add the mudmode block after your text? (your file is backed up first, nothing of yours is removed)" "n")) {
        if ($DryRun) { Say "would back up $dst and add the mudmode block after your text" }
        else {
          try { $pb = NewBak $dst; Copy-Item -LiteralPath $dst $pb; [IO.File]::WriteAllText($dst, ([IO.File]::ReadAllText($dst, $Utf8) + "`n" + [IO.File]::ReadAllText($agentsTxt, $Utf8)), $Utf8); $script:Connected += "Codex"; Say "added the mudmode block to $dst (backup: $(Split-Path $pb -Leaf))" } catch { Fail "could not update ${dst}: $($_.Exception.Message)" }
        }
      } else { Warn "you already have $dst; left it alone. To connect Codex, add the lines in $DirTxt/connectors/AGENTS-snippet.md to it (or ask your AI to, with a backup)." }
    } elseif ($DryRun) { Say "would write $dst" }
    else { New-Item -ItemType Directory -Force -Path $codexDir | Out-Null; Copy-Item $agentsTxt $dst; $script:Connected += "Codex" }
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
      if ($bad) { Warn "left ~/.claude/settings.json as it was. mudmode still works; Claude Code may ask you before it opens the folder." }
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
  # v1.3.6b (zero upkeep): a connector setup made earlier for THIS folder, unedited, is kept current by itself
  # (backup first). An edited one is left alone. Nothing new is connected without a yes.
  foreach ($oc in @(@((Join-Path $HomeDir ".claude/rules/mudmode.md"), $claudeTxt), @((Join-Path $HomeDir ".grok/AGENTS.md"), $agentsTxt), @($codexDst, $agentsTxt))) {
    $f0 = $script:Failed   # a failed refresh is not a setup failure: the old connector keeps working, and the next run tries again
    try { if (-not $DryRun -and (Test-Path -LiteralPath $oc[0]) -and [IO.File]::ReadAllText($oc[0]).Contains('The shared folder is `' + $DirTxt + '`.')) { if (ConnUpdate $oc[1] $oc[0] 6>$null) { Say "kept your connector $($oc[0]) up to date (a backup is beside it)" } } } catch { }
    $script:Failed = $f0
  }
} catch { Fail $_.Exception.Message }
finally { Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue }

# --- 3. log + result ------------------------------------------------------------
$conn = if ($script:Connected.Count) { " " + ($script:Connected -join " ") } else { "" }
if (-not $DryRun -and (Test-Path $Target)) {
  $log = "`n## $Now setup v1.4.0 from $(Split-Path -Leaf $KitDir)`n- copied $($script:Copied), already the same $($script:Same), kept yours $($script:Kept); connected:$(if ($conn) { $conn } else { ' none' }); allowed folder: $(if ($script:Allowed) { $script:Allowed } else { 'no' }); mudgo: $Pro`n"
  [IO.File]::AppendAllText((Join-Path $Target "SETUP-LOG.md"), $log, $Utf8)
}
Say ""
Say "mudmode folder: $DirTxt  (copied $($script:Copied), already the same $($script:Same), kept yours $($script:Kept))"
if ($script:LeftClaude) { Say ("Connected to:" + $(if ($conn) { $conn } else { " nothing new" }) + ". Claude Code: your existing ~/.claude/rules/mudmode.md was left as it was (it was not replaced).") }
else { Say ("Connected to:" + $(if ($conn) { $conn } else { " nothing (you can connect later: run this again)" })) }
if ($script:Allowed) { Say "Claude Code allowed folders: $($script:Allowed)" }
if ($script:Failed) { Say "RESULT: FAILED (see the PROBLEM lines above)"; exit 1 }
if ($DryRun -and $AllowDir -eq "yes") { Say "Undo (after a real run): remove ""$Target"" from permissions.additionalDirectories in ~\.claude\settings.json (setup makes a dated backup beside it first)." }
if ($DryRun) { Say "RESULT: OK (dry run, nothing written)"; exit 0 }
$lp = Join-Path $Target "CORE-LOCAL.md"
if (Test-Path $lp) { Say "Your settings ($DirTxt/CORE-LOCAL.md):"; Get-Content $lp | Where-Object { $_ -like "- **NAME**".Replace("NAME","*") } | ForEach-Object { Say $_.Replace("**","") } }
if ($script:Connected -contains "Claude-Code") { Say "Claude Code connector: ~/.claude/rules/mudmode.md" }
if ($script:Refreshed -gt 0) { Say "Updated $($script:Refreshed) kit file(s) above. If you had edited one, your edited copy is the .bak- file next to it." }
Say "RESULT: OK"
if ($Pro -eq "on") { Say 'Everyday first, with mudgo on (every rule). Say "mudgo auto" to let it turn on only when the work needs it.' }
elseif ($Pro -eq "off") { Say 'Everyday mode, with mudgo off. Say "mudgo on" when you want the rules for technical work.' }
else { Say 'Everyday first: mudgo turns on by itself when the work needs it (putting things live, branches, reviews). Say "mudgo on" or "mudgo off" any time.' }
if ($OneTime) { Say 'You were on full mode: you''re on mudgo auto now, so extra care turns on by itself when the work needs it. Say "mudgo on" to keep every rule on.' }
Say 'Daily report: say "mudmode report" any time; if your AI can run scheduled tasks, it will offer to write one nightly in reports/ (only with your OK).'
$mudTxt = ""; if ($script:MudOn) { $mudTxt = ' ("mud status" works too)' }
function NamesDir($p) { try { return ((Test-Path -LiteralPath $p) -and ([IO.File]::ReadAllText($p).Contains('The shared folder is `' + $DirTxt + '`.'))) } catch { return $false } }   # a connector for THIS folder (made now or before)
# holder-r4: the current header comes from the connector template, so this check never names a stale version
$ConnHdr = 'written by mudmode setup v1.4.0.'; try { $hm = [regex]::Match([IO.File]::ReadAllText((Join-Path $SetupDir "templates/connector-claude.md")), 'written by mudmode setup v[0-9.]*[0-9]\.'); if ($hm.Success) { $ConnHdr = $hm.Value } } catch { }
foreach ($oc in @(@((Join-Path $HomeDir ".claude/rules/mudmode.md"), "claude"), @((Join-Path $HomeDir ".grok/AGENTS.md"), "grok"), @($codexDst, "codex"))) {   # v1.3.6: an older connector still speaks of lite/full mode
  if (NamesDir $oc[0]) { $ot = [IO.File]::ReadAllText($oc[0]); if ($ot.Contains("mudmode connector") -and -not $ot.Contains($ConnHdr)) { Say "Your connector $($oc[0]) is from an older mudmode and setup left it as it is (it may hold your own edits). It still works." } }
}
if ($script:Connected.Count -or (NamesDir (Join-Path $HomeDir ".claude/rules/mudmode.md")) -or (NamesDir (Join-Path $HomeDir ".grok/AGENTS.md")) -or (NamesDir $codexDst)) {
  Say ('Next: start a NEW chat in your AI. Say "handoff" before you stop, "mudmode status" any time' + $mudTxt + ', and "mudhelp" for the list of things to say.')
  Say "Undo: delete ~\.claude\rules\mudmode.md (or ~\.grok\AGENTS.md or ~\.codex\AGENTS.md if setup made it; if you already had your own ~\.codex\AGENTS.md, remove only the block between '<!-- mudmode connector' and '<!-- end mudmode connector -->', or put back the .bak- copy beside it); that also ends the short name ""mud"". Your folder stays yours."
} else {
  Say ('Next: nothing is connected, so a new chat won''t load mudmode by itself. To use it, start a chat with: Read ' + $DirTxt + '/CORE.md, ' + $DirTxt + '/CORE-LOCAL.md and ' + $DirTxt + '/HANDOFF.md, then continue. Say "handoff" before you stop.')
  if ($script:Allowed) { Say ('Undo: no connector was made. Setup did change one thing outside ' + $DirTxt + ': the Claude Code allowed folder (see the next line).') }
  else { Say ('Undo: nothing outside ' + $DirTxt + ' was changed, so there is nothing to turn off.') }
}
if (Test-Path (Join-Path $Target ".made-by-mudmode-setup")) { Say ('To remove mudmode completely: setup made ' + $DirTxt + ' new, so you can delete that folder (first move out anything of yours you put in it).') }
else { Say ('To remove mudmode: setup did not make ' + $DirTxt + ', so don''t delete the folder; remove only the mudmode files in it (anything else there is yours).') }
if ($script:Allowed) { Say "Undo the allowed folder: remove ""$Target"" from permissions.additionalDirectories in ~\.claude\settings.json (setup made a dated backup beside it, settings.json.bak-...)." }
