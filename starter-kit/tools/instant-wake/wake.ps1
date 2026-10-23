# wake.ps1 (mudmode instant wake): sends one POST to YOUR bot's webhook when the watched file grows.
# It reads two files that you fill in yourself, next to this script:
#   webhook-url.txt   your bot's webhook URL (one line)
#   webhook-auth.txt  your key: either the bare key, or the full "Authorization: ..." line (or both; the Authorization line wins)
# It sends only the watched file's name (not its folder path) and two sizes. It never prints or logs the key or the URL.
# It writes one line per wake to wake.log (time, HTTP status, sizes). It only sends to an https:// URL, over TLS 1.2 or newer; anything else is refused.
$d = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $d 'wake.log'
function L($m) { Add-Content -LiteralPath $log -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'), $m) }
$uf = Join-Path $d 'webhook-url.txt'; $hf = Join-Path $d 'webhook-auth.txt'
if (-not (Test-Path -LiteralPath $uf) -or -not (Test-Path -LiteralPath $hf)) { L 'not set up: webhook-url.txt or webhook-auth.txt is missing'; exit 2 }
$url = ((Get-Content -LiteralPath $uf | ForEach-Object { $_.Trim() } | Where-Object { $_ }) | Select-Object -First 1)
$hl = @(Get-Content -LiteralPath $hf | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if (-not $url -or $hl.Count -eq 0) { L 'not set up: webhook-url.txt or webhook-auth.txt is empty'; exit 2 }
$u = $null
if (-not [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$u) -or $u.Scheme -ne 'https') {
  $m = 'refused: webhook-url.txt must start with https:// (plain http would send your key unencrypted). Nothing was sent.'
  L $m; Write-Host $m; exit 3
}
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12   # make sure TLS 1.2 is on (older Windows PowerShell may not enable it by default)
$h = $hl | Where-Object { $_ -match '^Authorization\s*:' } | Select-Object -First 1
if (-not $h) { $h = $hl[-1] }
if ($h -match '^\s*Authorization\s*:\s*(.+)$') { $h = $Matches[1].Trim() }
if ($h -notmatch '\s') { $h = "Bearer $h" }   # a bare key on its own: send it as a Bearer token
$fname = ''; if ($env:INBOX_FILE) { $fname = Split-Path -Leaf $env:INBOX_FILE }   # name only, no folder path
$body = @{ file = $fname; old_bytes = $env:INBOX_OLD_BYTES; new_bytes = $env:INBOX_NEW_BYTES } | ConvertTo-Json -Compress
try {
  $r = Invoke-WebRequest -Uri $url -Method Post -Headers @{ Authorization = $h } -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 20
  L ("woke the bot: HTTP {0} (old {1} new {2})" -f $r.StatusCode, $env:INBOX_OLD_BYTES, $env:INBOX_NEW_BYTES)
} catch {
  $code = $null; try { $code = [int]$_.Exception.Response.StatusCode } catch {}
  if ($code) { L ("wake failed: HTTP {0}" -f $code) } else { L 'wake failed: no answer from the webhook (check the URL and your internet connection)' }
  exit 1
}
