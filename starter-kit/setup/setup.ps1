# mudmode setup v1.3.4 (Windows PowerShell 5.1+, PowerShell 7 on any system).
# Copies the kit into ONE folder you own (default: %USERPROFILE%\mudmode). Outside that folder it
# only READS, except one optional connector file you say yes to (~\.claude\rules\mudmode.md for
# Claude Code, ~\.grok\AGENTS.md for Grok Build). It never deletes anything. On a rerun it updates,
# with a backup first: the rule files in cores\ and modules\, plus CORE.md and the connector files
# when they still match a released mudmode version. Any other file you have is kept unless you
# say yes to replacing it (with -Yes it keeps your file and tells you).
# Short name: "mud status" works like "mudmode status" in your AI chats. It is a word your AI
# understands, not a PowerShell command, so setup changes no profile. If this computer already has
# a command, alias or function called mud (or setup can't check), setup leaves it alone, turns the
# short name off and says so.
# Opt-in only (-AllowDir yes): adds the folder to Claude Code's permissions.additionalDirectories in
# ~\.claude\settings.json, after a dated backup, changing nothing else in that file.
# Usage: powershell -ExecutionPolicy Bypass -File setup\setup.ps1 [-Target DIR]
#        [-Connect claude|grok|both|none] [-Name NAME] [-Tz ZONE] [-AskFirst TEXT] [-Words TEXT] [-AllowDir yes|no] [-Mode lite|full] [-UpdateCheck on|off] [-Yes] [-DryRun]
param(
  [string]$Target = "",
  [string]$Connect = "",
  [string]$Name = "",
  [string]$Tz = "",
  [string]$AskFirst = "",
  [string]$Words = "",
  [string]$AllowDir = "",
  [string]$Mode = "",
  [string]$UpdateCheck = "",
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
    $Connect = $c
  }
  if (-not $AskFirst) { $AskFirst = AskText "5. Optional: anything the AIs must always ask before doing (extra to the built-in list)?" "nothing extra" }
  if (-not $Words) { $Words = AskText "6. Optional: words to always use or never use?" "none" }
  if ((-not $AllowDir) -and ($Connect -in @("claude","both"))) {
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
if ($Connect -notin @("claude","grok","both","none")) { Stop-Setup "-Connect must be claude, grok, both or none." 2 }

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
  return $t.Replace("{{NAME}}",$Name).Replace("{{TZ}}",$Tz).Replace("{{ASK}}",$AskFirst).Replace("{{WORDS}}",$Words).Replace("{{DIR}}",$DirTxt).Replace("{{DATE}}",$Now).Replace("{{ALLOWDIR}}",$AllowDir).Replace("{{MODE}}",$Mode).Replace("{{MODULES}}",$OldMods).Replace("{{UPDATECHECK}}",$UpdateCheck).Replace("{{MUDSHORT}}",$MudShort)
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
# --- known stock files (v1.3.4): sha256 of the CORE.md cores and connector templates in the released
# v1.3.0, v1.3.1, v1.3.2 and v1.3.3 kits. A file that matches one byte for byte (Windows line endings count as
# the same) was written by setup and never edited.
$StockCoreLite = @("8df2ce0d545cc0a53b4517e6cba9f7908c0eb42724c699cc0cb1b9c671d2ad63","02158beeac2d7222fba9e401fc7549228818aa48d98d83d7a5ce3c5e0fe9e56b","f4f1e69151ac5801120bb919a5a06ffd38c723ca1376a1a2330d0cc2e185916d","e512ab0beb8df0baf4769ccf8b465bb7c35f9e17d286fd17eab8815e88d6ce0e")
$StockCoreFull = @("a779f75c31520275342c1b274afb561c51c340e100e244fe35fafab4be91cabd","2fdb403ef64ecd84856a90f5c5d90355d9eae335c03f85c748200bb6e6d2dee7","b461794b86be0e8acac8a55ffc203257b3b14c4cc8b93e9c9ea30c9957448d18","b641b751a7ca34761f48dd6d9c78617039057f4e4b4dbfa8b4645641d8bd1654")
$StockConnList = @("999fc995023857871a8c345bf6544b380cce2cfae22c66e2920a059a47305259","669af4c6f16c9c8b7c7dd8cfb15009c77bcffe5259ed2e38fd2194d5fe060c52","8fcfaaa9c9084b8d2120f55f3ae2c32afd5616193caeadc7f259695d00205780","b85fc69197fa843c927c286258bd80990f63ec1af0c7d8886ae3c61230af87ac","a7a46d2be9c464bdbd5bec37889299753db3bac746cb6932c5a7914e3350315c","0bbb4202af065919fa0e701cc2bf756682d07d43e0c259ad3b0d46e9d6889e1f","f2082caa065c3d164016baf53e6ad6c2cae11287d975d09e7e96c7d5803252fd","2006e87384ab657dae27a9c98d908b57ea983f21ff3e2f7a6578e6cd1e4834d8","46b6957686bd44516246645e36070e5f3aa9d28ccf543e4abdd384fb66caa870","8c7116b7496cbb7b9d5135d3fb4b9865ed9e0589b78ea7364b8c4f5e60745152","27ca4ad739f7155191adf1089a096c34d3466f172d0c4fbd7fc3672d48c534ed","b9b2d70c62bd38aaf8abbf12707c4ddc4e233bca86c6ffa4fcbe65d9a681bd7e","6890bf3799ac7442865f8b29ed022bf2ad8e83e0cfe337cf0e006e1e56bd6485","31fb3548c5f604f689ae2df5b35d73ecc1d91850cd3b2f10ebf6ccf5c326ca04")
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
    if ($KitRefresh) { Say "$DirTxt already exists. Your own files stay as they are. Rule files in cores/ and modules/ are updated, with a backup of each." }
    else { Say "$DirTxt already exists and holds the Full Kit. Your files stay as they are; this free kit's setup only adds files that are missing." }
    if ($Interactive -and -not (AskYN "Continue?" "y")) { Say "Stopped. Nothing changed."; exit 0 }
  }
  Mkd $Target; if ($Mode -eq "full") { Mkd (Join-Path $Target "jobs") }
  # full mode: CORE.md = the combined core (the v1.3.0 rules word for word); lite: the one-page safety core. A mode switch swaps it below (backup first).
  $CoreSrc = Join-Path $Starter "cores/CORE-FULL.md"; if ($Mode -eq "lite") { $CoreSrc = Join-Path $Starter "cores/CORE-LITE.md" }
  $coreT = Join-Path $Target "CORE.md"
  if (-not ($OldMode -and ($Mode -ne $OldMode) -and (Test-Path $coreT))) {
    if (SameCore $CoreSrc $coreT) { Refresh $CoreSrc $coreT }
    else {
      $stocks = $StockCoreFull; if ($Mode -eq "lite") { $stocks = $StockCoreLite }
      $coreH = ""; if (Test-Path $coreT) { $coreH = ShaLf $coreT }
      if ($coreH -and $KitRefresh -and ($stocks -contains $coreH)) { Refresh $CoreSrc $coreT }   # an unedited CORE.md from a released version
      elseif ($coreH -and $KitRefresh -and -not (($StockCoreFull + $StockCoreLite) -contains $coreH) -and -not (SameFile $CoreSrc $coreT)) {
        $script:Kept++; Say "kept your CORE.md: it doesn't match a released v1.3 CORE.md (your own edits, or an older version), so it was not updated (the new one is $DirTxt/cores/$(Split-Path $CoreSrc -Leaf))."
      } else { Place $CoreSrc $coreT $false }
    }
  }
  PlaceDir (Join-Path $Starter "templates") (Join-Path $Target "templates")
  PlaceDir (Join-Path $Starter "adapters") (Join-Path $Target "adapters")
  PlaceDir (Join-Path $Starter "addons") (Join-Path $Target "addons")
  RefreshDir (Join-Path $Starter "modules") (Join-Path $Target "modules")
  RefreshDir (Join-Path $Starter "cores") (Join-Path $Target "cores")
  Place (Join-Path $Starter "RULE-MAP.md") (Join-Path $Target "RULE-MAP.md") $false
  foreach ($f in "check-update.sh","check-update.ps1") { if (Test-Path (Join-Path $SetupDir $f)) { Refresh (Join-Path $SetupDir $f) (Join-Path $Target "tools/$f") } }   # the opt-in update check (off unless CORE-LOCAL.md says on)
  if ($KitRefresh -and (Test-Path (Join-Path $KitDir "VERSION"))) { Refresh (Join-Path $KitDir "VERSION") (Join-Path $Target "VERSION") }
  Place (Join-Path $SetupDir "templates/CORE-LOCAL.md") (Join-Path $Target "templates/CORE-LOCAL.md") $false
  $liveF = @("OK-LEDGER.md"); if ($Mode -eq "full") { $liveF = @("LESSONS.md","JOBS.md","OK-LEDGER.md") }
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

- **Written:** $Now, by mudmode setup v1.3.4
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

- **Written:** $Now, by mudmode setup v1.3.4
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
  foreach ($pair in @(@($claudeTxt, "connectors/claude-rules-mudmode.md"), @($agentsTxt, "connectors/AGENTS-snippet.md"))) {
    $cd = Join-Path $Target $pair[1]
    if (ConnUpdate $pair[0] $cd) { $script:Copied++ } else { Place $pair[0] $cd $false }
  }

  # --- 2. optional connector (the only write outside the folder) -------------------
  if ($Connect -in @("claude","both")) {
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
  if ($Connect -in @("grok","both")) {
    $dst = Join-Path $HomeDir ".grok/AGENTS.md"
    if (Test-Path $dst) {
      if (Select-String -Path $dst -Pattern "mudmode connector" -Quiet) { $null = ConnUpdate $agentsTxt $dst; $script:Connected += "Grok-Build" }
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
  $log = "`n## $Now setup v1.3.4 from $(Split-Path -Leaf $KitDir)`n- copied $($script:Copied), already the same $($script:Same), kept yours $($script:Kept); connected:$(if ($conn) { $conn } else { ' none' }); allowed folder: $(if ($script:Allowed) { $script:Allowed } else { 'no' }); mode: $Mode`n"
  [IO.File]::AppendAllText((Join-Path $Target "SETUP-LOG.md"), $log, $Utf8)
}
Say ""
Say "mudmode folder: $DirTxt  (copied $($script:Copied), already the same $($script:Same), kept yours $($script:Kept))"
if ($script:LeftClaude) { Say ("Connected to:" + $(if ($conn) { $conn } else { " nothing new" }) + ". Claude Code: your existing ~/.claude/rules/mudmode.md was left as it was (it was not replaced).") }
else { Say ("Connected to:" + $(if ($conn) { $conn } else { " nothing (you can connect later: run this again)" })) }
if ($script:Allowed) { Say "Claude Code allowed folders: $($script:Allowed)" }
if ($script:Failed) { Say "RESULT: FAILED (see the PROBLEM lines above)"; exit 1 }
if ($DryRun) { Say "RESULT: OK (dry run, nothing written)"; exit 0 }
$lp = Join-Path $Target "CORE-LOCAL.md"
if (Test-Path $lp) { Say "Your settings ($DirTxt/CORE-LOCAL.md):"; Get-Content $lp | Where-Object { $_ -like "- **NAME**".Replace("NAME","*") } | ForEach-Object { Say $_.Replace("**","") } }
if ($script:Connected -contains "Claude-Code") { Say "Claude Code connector: ~/.claude/rules/mudmode.md" }
if ($script:Refreshed -gt 0) { Say "Updated $($script:Refreshed) kit file(s) above. If you had edited one, your edited copy is the .bak- file next to it." }
Say "RESULT: OK"
if ($Mode -eq "lite") { Say 'You''re in lite mode; say "mudmode full" for every module.' }
Say 'Daily report: say "mudmode report" any time; if your AI can run scheduled tasks, it will offer to write one nightly in reports/ (only with your OK).'
$mudTxt = ""; if ($script:MudOn) { $mudTxt = ' ("mud status" works too)' }
Say ('Next: start a NEW chat in your AI. Say "handoff" before you stop, and "mudmode status" any time' + $mudTxt + '.')
Say "Undo: delete ~\.claude\rules\mudmode.md (or ~\.grok\AGENTS.md if setup made it); that also ends the short name ""mud"". Your folder stays yours."
if ($script:Allowed) { Say "Undo the allowed folder: remove it from additionalDirectories in ~\.claude\settings.json (backup beside it)." }
