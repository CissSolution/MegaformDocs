# Stage everything the PENDING-REVIEW templates need on the local Oqtane QA site.
#
# Nothing here touches a DLL: the deployed MegaForm.Oqtane.Server assembly already carries
# DevBulkCreateForms and the anonymous render route, and every file written below lives in wwwroot
# or App_Data - so the ModuleInfo.Version deploy gate does not apply.
#
#   powershell -File tools\browser-qa\oq-stage-templates.ps1 [-Start]
#
# ASCII only: PowerShell 5.1 reads a UTF-8-without-BOM .ps1 as ANSI.

[CmdletBinding()]
param(
  [string]$Site = 'E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean20011',
  [string]$Url  = 'http://localhost:5130',
  [switch]$Start
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "site: $Site" -ForegroundColor Cyan

# --- stop the site so nothing holds a file open -----------------------------------------------
Get-Process Oqtane.Server -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "$Site*" } |
  ForEach-Object { Write-Host "  stopping pid $($_.Id)"; Stop-Process $_ -Force }
Start-Sleep -Seconds 2

# --- 1. renderer bundle -------------------------------------------------------------------------
# Oqtane loads Modules/MegaForm/js/megaform-renderer.js, NOT js/bundles/. The site's copy was a
# build behind the DNN QA site, which would have shown up as a rendering difference that is really
# a version difference.
$rsrc = Join-Path $repo 'MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\js\megaform-renderer.js'
$rdst = Join-Path $Site 'wwwroot\Modules\MegaForm\js\megaform-renderer.js'
Copy-Item $rsrc $rdst -Force
Write-Host ("  renderer  {0}  ({1:n0} bytes)" -f (Get-FileHash $rdst -Algorithm MD5).Hash.Substring(0, 8), (Get-Item $rdst).Length)

# --- 2. artwork ---------------------------------------------------------------------------------
# Templates paint a two-layer background (DNN path first, Oqtane path second), so the same authored
# URL works on both mounts - but only if the image is actually present under Modules/MegaForm/img.
$idst = Join-Path $Site 'wwwroot\Modules\MegaForm\img'
New-Item -ItemType Directory -Force $idst | Out-Null
$n = 0
Get-ChildItem (Join-Path $repo 'Assets\img') -Directory | ForEach-Object {
  Copy-Item $_.FullName $idst -Recurse -Force; $n++
}
Write-Host "  artwork   $n folder(s) -> wwwroot\Modules\MegaForm\img"

# --- 3. templates -------------------------------------------------------------------------------
# BuilderTemplateCatalogStore walks App_Data\MegaForm\Templates RECURSIVELY and caches on a
# count+mtime fingerprint, so a subfolder is fine and no restart is needed for a template edit.
$tdst = Join-Path $Site 'App_Data\MegaForm\Templates\PENDING-REVIEW'
New-Item -ItemType Directory -Force $tdst | Out-Null
Get-ChildItem (Join-Path $repo 'Samples\FormTemplates\Premium\PENDING-REVIEW\*.json') |
  Copy-Item -Destination $tdst -Force
$tc = (Get-ChildItem $tdst -Filter *.json | Measure-Object).Count
Write-Host "  templates $tc json -> App_Data\MegaForm\Templates\PENDING-REVIEW"

# --- 4. dev.lock --------------------------------------------------------------------------------
# DevBulkCreateForms gates on the raw dev.lock probe, not on the licence.
$lock = Join-Path $Site 'dev.lock'
if (-not (Test-Path $lock)) { New-Item -ItemType File $lock | Out-Null }
Write-Host "  dev.lock  present"

if ($Start) {
  $exe = Join-Path $Site 'Oqtane.Server.exe'
  Start-Process $exe -ArgumentList '--urls', $Url -WorkingDirectory $Site
  Write-Host "  started   $Url" -ForegroundColor Green
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 3
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
      if ($r.StatusCode -eq 200) { Write-Host "  ready     HTTP 200 after $((($i + 1) * 3))s" -ForegroundColor Green; break }
    } catch { }
  }
}
