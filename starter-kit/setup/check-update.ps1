# mudmode update check (v1.3.5). OFF unless you turn it on: CORE-LOCAL.md line "Update check ...: on".
# When on, it reads one small public file (https://mudmodecrew.com/version.json) and tells you if a
# newer mudmode kit is out, and how to update. It never downloads or installs anything, and it sends
# no personal info, just a normal web request: no ID, no cookies, no settings (like any web visit,
# the site sees your internet address). If you're offline it says so and changes nothing.
# Safety: it only uses https:// addresses (also after a redirect), reads at most 4096 bytes, and only
# prints version numbers (digits and dots). It never prints other text from the file: the "what's new"
# pointer below is fixed text written here.
# Update key (v1.4.0): this kit ships mudmode's real public update key (minisign, Ed25519) as
# tools\update-key.pub, and the same key line is written below ($UpdateKey). Before it checks anything, this
# script makes sure that file is there and holds exactly that key; if not, it checks nothing and says so.
# It still never downloads, installs or applies anything: you get a new mudmode yourself. A downloaded update
# would have to pass a minisign signature check against this key before it is used, and Windows PowerShell 5.1
# can't check a minisign signature with what it has built in, so "-Apply FILE" always refuses and never opens
# that file: this version uses no update file it can't verify.
# Usage: powershell -ExecutionPolicy Bypass -File $HOME\mudmode\tools\check-update.ps1
param([string]$Apply = "")
$UpdateKey = "RWTSpU4Hr4bBpWocWhRC1lvgdmQkJ1mTFCSovtzIz0C6t281SJS3ej72"   # mudmode's public update key (minisign key line); tools\update-key.pub must hold exactly this
if ($Apply) { Write-Host "mudmode update check: this version can't verify an update file's signature against mudmode's update key, so it won't use that file. Nothing changed."; exit 3 }
$Dir = Split-Path -Parent $PSScriptRoot
$Url = "https://mudmodecrew.com/version.json"; if ($env:MUDMODE_VERSION_URL) { $Url = $env:MUDMODE_VERSION_URL }
$Max = 4096
$setting = ""
$lp = Join-Path $Dir "CORE-LOCAL.md"
if (Test-Path $lp) {
  $l = @([IO.File]::ReadAllLines($lp) | Where-Object { $_ -match '^- \*\*Update check' }) | Select-Object -First 1
  if ($l -and ($l -match ':\*\* *([A-Za-z]*)')) { $setting = $Matches[1].ToLower() }
}
function KeyOk {
  $kp = Join-Path $PSScriptRoot "update-key.pub"
  if (-not (Test-Path -LiteralPath $kp)) { return $false }
  $kl = @([IO.File]::ReadAllLines($kp))
  if ($kl.Count -ne 2 -or $kl[0] -cnotmatch '\Auntrusted comment: minisign public key [0-9A-F]{16}\z') { return $false }
  if ($kl[1].Trim() -cne $UpdateKey) { return $false }
  try { $b = [Convert]::FromBase64String($UpdateKey) } catch { return $false }
  if ($b.Length -ne 42 -or $b[0] -ne 0x45 -or $b[1] -ne 0x64) { return $false }   # "Ed": a minisign Ed25519 key
  $id = (($b[9..2] | ForEach-Object { $_.ToString("X2") }) -join "")
  return $kl[0].EndsWith(" " + $id)
}
if ($setting -ne "on") { Write-Host 'mudmode update check is off. Say "turn on the mudmode update check" to your AI if you want it.'; exit 0 }
function IsVer($s) { return ($s -is [string]) -and ($s.Length -le 20) -and ($s -cmatch '\A[0-9]+(\.[0-9]+)*\z') }
function IsHttps($u) { return ($u -is [string]) -and ($u.Length -le 300) -and ($u -cmatch '\Ahttps://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+\z') }
function CantCheck { Write-Host "mudmode update check: not checked this time; it tries again next time. Nothing changed."; exit 0 }
if (-not (KeyOk)) { Write-Host "mudmode update check: mudmode's update key (tools\update-key.pub) is missing or isn't the one this kit shipped, so nothing was checked. Run mudmode setup again to put it back. Nothing changed."; exit 0 }
if (-not (IsHttps $Url)) { Write-Host "mudmode update check: the version file address must start with https://, so nothing was checked. Nothing changed."; exit 0 }
# Reads the file itself: https only, redirects followed by hand (at most 3, https only), at most $Max bytes.
function Get-SmallFile($u) {
  for ($i = 0; $i -le 3; $i++) {
    if (-not (IsHttps $u)) { return $null }
    $rq = [System.Net.HttpWebRequest]::Create($u)
    $rq.AllowAutoRedirect = $false; $rq.Timeout = 15000; $rq.ReadWriteTimeout = 15000; $rq.UserAgent = "mudmode-update-check"; $rq.Method = "GET"
    $rs = $null
    try { $rs = $rq.GetResponse() } catch { if ($_.Exception.InnerException -and $_.Exception.InnerException.Response) { $rs = $_.Exception.InnerException.Response } elseif ($_.Exception.Response) { $rs = $_.Exception.Response } else { return $null } }
    try {
      $code = [int]$rs.StatusCode
      if ($code -ge 300 -and $code -lt 400) {
        $loc = $rs.Headers["Location"]; if (-not $loc) { return $null }
        $u = (New-Object System.Uri((New-Object System.Uri($u)), $loc)).AbsoluteUri; continue
      }
      if ($code -ne 200 -or $rs.ContentLength -gt $Max) { return $null }
      $st = $rs.GetResponseStream(); $buf = New-Object byte[] ($Max + 1); $n = 0
      while ($n -le $Max) { $r = $st.Read($buf, $n, $Max + 1 - $n); if ($r -le 0) { break }; $n += $r }
      if ($n -gt $Max) { return $null }
      return [Text.Encoding]::UTF8.GetString($buf, 0, $n)
    } finally { if ($rs) { $rs.Close() } }
  }
  return $null
}
$Kit = "crew"; $name = "free Crew kit"; if (Test-Path (Join-Path $Dir "full-kit")) { $Kit = "full"; $name = "Full Kit" }
$have = ""
$vp = Join-Path $Dir "VERSION"
if (Test-Path $vp) { $have = [string](@([IO.File]::ReadAllLines($vp)) | Select-Object -First 1); $have = $have.Trim() }
if (-not (IsVer $have) -and (Test-Path (Join-Path $Dir "CORE.md"))) {
  $have = ""
  $v = @([IO.File]::ReadAllLines((Join-Path $Dir "CORE.md")) | Where-Object { $_ -match '^Version: ([0-9][0-9.]*[0-9])' }) | Select-Object -First 1
  if ($v -and ($v -match '^Version: ([0-9][0-9.]*[0-9])')) { $have = $Matches[1] }
}
if (-not (IsVer $have)) { $have = "" }
$new = ""
try {
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
  $txt = Get-SmallFile $Url
  if ($txt) {
    $txt = $txt -replace '[^\x20-\x7E]', ''   # printable characters only: no ESC, BEL or other control characters
    $j = $txt | ConvertFrom-Json -ErrorAction Stop
    if (IsVer $j.$Kit) { $new = [string]$j.$Kit }
  }
} catch { $new = "" }
$a = $null; $b = $null
if (-not ($new -and $have -and [version]::TryParse($new, [ref]$a) -and [version]::TryParse($have, [ref]$b))) { CantCheck }
if ($a -gt $b) {
  Write-Host "A newer mudmode is out: $name $new (you have $have)."
  if ($Kit -eq "full") {   # holder-r4: Windows exe users run the new setup; only Mac/Linux unzip
    Write-Host "To update on Windows: download the new mudmode setup (mudmode.$new.exe) and run it. It backs up your mudmode folder first; your settings and work files stay as they are."
    Write-Host 'On a Mac or Linux: download the new kit''s .zip, unzip it into a new folder, then tell your AI "Read README-START-HERE.md and set me up." in that folder. It does the rest; your settings and work files stay as they are.'
  } else { Write-Host 'To update: download the new kit and unzip it, then tell your AI "Read README-START-HERE.md and set me up." in that folder. It does the rest; your settings and work files stay as they are.' }
  if ($Kit -eq "crew") { Write-Host "What's new: https://mudmodecrew.com/starter-kit/CHANGELOG.md" }
  else { Write-Host "What's new: see CHANGELOG.md in the new kit." }
} else { Write-Host "mudmode is up to date ($name $have)." }
exit 0
