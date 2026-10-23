# install-instant-wake.ps1 (mudmode instant wake, Windows): OPTIONAL, asks first, the default answer is No.
# Nothing happens unless you type y. What it does when you say yes:
#   1. copies this folder's scripts to <your home>\mudmode\tools\instant-wake (never deletes anything) and makes two empty files there for your URL and key,
#   2. adds ONE scheduled task for your own Windows account: "mudmode instant wake". It starts when you sign in,
#      runs as you with normal rights (no admin), and runs inbox-watch.ps1 on the file you pick.
#      When that file grows, wake.cmd sends one POST to your bot's webhook.
# You paste your webhook URL and key into two text files yourself. This script never prints them; only wake.ps1 uses them, to call your webhook.
# Undo: see ROLLBACK.txt.
# Usage (PowerShell, from this folder):
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-instant-wake.ps1 [-Watch C:\path\to\file.md] [-Yes] [-TestWake]
param(
  [string] $Watch = '',
  [switch] $Yes,
  [switch] $TestWake
)
$ErrorActionPreference = 'Stop'
$TaskName = 'mudmode instant wake'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$HomeDir = [Environment]::GetFolderPath('UserProfile'); if (-not $HomeDir) { $HomeDir = $HOME }
$Dest = Join-Path $HomeDir 'mudmode\tools\instant-wake'
$Interactive = (-not $Yes) -and (-not [Console]::IsInputRedirected)
function Say($m) { Write-Host $m }
function AskYN($q) { if (-not $Interactive) { return [bool]$Yes }; $a = Read-Host "$q [y/N]"; return ($a -match '^[Yy]') }
function Stop-Here($m, $code) { Say $m; exit $code }

if ($env:OS -ne 'Windows_NT') { Stop-Here 'This installer is for Windows. Nothing changed.' 1 }

# 0. ask first, before copying or creating anything (default No). -TestWake only uses an existing setup.
if (-not $TestWake) {
  Say "This sets up mudmode instant wake. It copies the scripts to $Dest and makes two empty files there for your webhook URL and key."
  Say 'A second question comes before any sign-in task is added.'
  if (-not (AskYN 'Copy the files now?')) { Stop-Here 'OK, nothing changed.' 0 }
} elseif (-not (Test-Path -LiteralPath (Join-Path $Dest 'wake.cmd'))) { Stop-Here "Instant wake is not set up in $Dest yet. Run the installer without -TestWake first. Nothing changed." 1 }

# 1. the folder (copy only; a different file already there is backed up first)
$files = 'inbox-watch.ps1','wake.ps1','wake.cmd','install-instant-wake.ps1','ROLLBACK.txt','README.md'
if (-not $TestWake -and (Resolve-Path -LiteralPath $Here).Path -ne $Dest) {
  if (-not (Test-Path -LiteralPath $Dest)) { New-Item -ItemType Directory -Path $Dest | Out-Null }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
  foreach ($f in $files) {
    $src = Join-Path $Here $f; $dst = Join-Path $Dest $f
    if (-not (Test-Path -LiteralPath $src)) { continue }
    if (Test-Path -LiteralPath $dst) {
      if ((Get-FileHash -LiteralPath $src).Hash -eq (Get-FileHash -LiteralPath $dst).Hash) { continue }
      Copy-Item -LiteralPath $dst -Destination "$dst.bak-$stamp"
    }
    Copy-Item -LiteralPath $src -Destination $dst
  }
  Say "Scripts are in $Dest"
}

# 2. your URL and key (you paste them; this script only checks that the files are not empty)
$uf = Join-Path $Dest 'webhook-url.txt'; $hf = Join-Path $Dest 'webhook-auth.txt'
foreach ($p in $uf, $hf) { if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType File -Path $p | Out-Null } }
$ready = ((Get-Item -LiteralPath $uf).Length -gt 0) -and ((Get-Item -LiteralPath $hf).Length -gt 0)
if (-not $ready) {
  Say ''
  Say 'One more thing first: paste your own webhook details into these two files and save them:'
  Say "  $uf   (your bot's webhook URL, one line)"
  Say "  $hf   (your key: the bare key or the whole 'Authorization: ...' line)"
  if ($Interactive -and (AskYN 'Open both files in Notepad now?')) { Start-Process notepad.exe $uf; Start-Process notepad.exe $hf }
  Stop-Here 'Then run this installer again. No task was added.' 0
}

if ($TestWake) {
  $env:INBOX_FILE = 'test'; $env:INBOX_OLD_BYTES = '0'; $env:INBOX_NEW_BYTES = '0'
  & cmd.exe /c (Join-Path $Dest 'wake.cmd')
  $last = Get-Content -LiteralPath (Join-Path $Dest 'wake.log') -Tail 1 -ErrorAction SilentlyContinue
  Stop-Here "Test wake result (from wake.log): $last" 0
}

# 3. the file to watch
if (-not $Watch -and $Interactive) { $Watch = Read-Host 'Which file should wake your bot when it grows? Paste its full path' }
if (-not $Watch) { Stop-Here 'No file to watch was given (use -Watch). No task was added.' 1 }
$Watch = $Watch.Trim('"', ' ')
if (-not (Test-Path -LiteralPath $Watch -PathType Leaf)) { Stop-Here "Can't find the file $Watch. No task was added." 1 }
$Watch = (Resolve-Path -LiteralPath $Watch).Path

# 4. ask first (default No)
Say ''
Say "This adds a sign-in task named '$TaskName' for your account only (normal rights, no admin)."
Say "It watches: $Watch"
Say 'Your timed check stays as it is, as a backup. Undo any time with ROLLBACK.txt.'
if (-not (AskYN 'Add the sign-in task and start it now?')) { Stop-Here 'OK, nothing added.' 0 }

$user = "$env:USERDOMAIN\$env:USERNAME"
$arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -File "{1}" -OnChange "{2}" -Log "{3}"' -f `
  (Join-Path $Dest 'inbox-watch.ps1'), $Watch, (Join-Path $Dest 'wake.cmd'), (Join-Path $Dest 'inbox-watch.log')
try {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $Dest
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
} catch {
  Stop-Here "PROBLEM: Windows did not accept the task ($($_.Exception.Message)). Nothing else changed; see ROLLBACK.txt." 1
}
Say "Done: '$TaskName' is added and running. Log: $(Join-Path $Dest 'inbox-watch.log'); wakes: $(Join-Path $Dest 'wake.log')."
Say 'Try it: run this again with -TestWake, or add a line to the watched file.'
