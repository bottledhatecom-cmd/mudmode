<#
inbox-watch.ps1: wake an AI only when an inbox file grows. No AI calls while waiting.

It checks the file's size every -Seconds (default 5). When the file grows, it waits -SettleSeconds (default 3) so
a note being written in several pieces finishes, then runs -OnChange once, with these set for it:
  INBOX_FILE        the file watched
  INBOX_OLD_BYTES   its size before
  INBOX_NEW_BYTES   its size now (the new entry is the bytes in between)
A shrink (a file rewritten from a backup) is logged and re-based, not treated as new mail.

Examples (you pick the wake command; this script never decides who to wake):
  powershell -NoProfile -ExecutionPolicy Bypass -File inbox-watch.ps1 `
    -File C:\path\to\your\inbox.md `
    -OnChange 'C:\path\to\wake-your-ai.cmd'
  ... -Once      stop after the first change (for a test, or a caller that restarts it)

Stop it: close its window, or Stop-Process on its PID (written to inbox-watch.pid next to the log).
Undo: delete this folder. The script itself installs nothing; if something starts it at sign-in (a scheduled task
or a shortcut), remove that too.
#>
param(
  [Parameter(Mandatory = $true)] [string] $File,
  [Parameter(Mandatory = $true)] [string] $OnChange,
  [int] $Seconds = 5,
  [int] $SettleSeconds = 3,
  [string] $Log = '',
  [switch] $Once
)
# Set here, not as the parameter's default: Windows PowerShell 5.1 can leave $PSScriptRoot empty there.
if (-not $Log) { $Log = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'inbox-watch.log' }

function Size([string] $p) { try { (Get-Item -LiteralPath $p -ErrorAction Stop).Length } catch { -1 } }
function Note([string] $m) { Add-Content -LiteralPath $Log -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd h:mm:ss tt'), $m) -Encoding utf8 }

Set-Content -LiteralPath (Join-Path (Split-Path $Log) 'inbox-watch.pid') -Value $PID -Encoding ascii
$last = Size $File
Note "start: watching $File (size $last), every $Seconds s, on change: $OnChange"

while ($true) {
  Start-Sleep -Seconds $Seconds
  $now = Size $File
  if ($now -lt 0) { continue }                      # not there for a moment (being replaced): try again
  if ($now -lt $last) { Note "shrank $last -> $now (rewritten?); re-based, no wake"; $last = $now; continue }
  if ($now -eq $last) { continue }
  Start-Sleep -Seconds $SettleSeconds               # let a multi-part write finish
  $now = Size $File
  $env:INBOX_FILE = $File; $env:INBOX_OLD_BYTES = "$last"; $env:INBOX_NEW_BYTES = "$now"
  Note "grew $last -> $now; running the wake command"
  try {
    & cmd.exe /c $OnChange
    Note "wake command exit $LASTEXITCODE"
  } catch {
    Note "wake command failed: $($_.Exception.Message)"
  }
  $last = $now
  if ($Once) { Note 'stop (-Once)'; break }
}
