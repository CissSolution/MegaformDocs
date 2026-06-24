# ============================================================
# MegaForm — Build Umbraco Package
# Syncs shared Assets -> MegaForm.Umbraco/wwwroot, then builds the RCL package
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $root "Assets"
$umbDir = Join-Path $root "MegaForm.Umbraco"
$wwwrootDir = Join-Path $umbDir "wwwroot"
$packagesDir = Join-Path $root "_packages"

Write-Host "=== MegaForm Umbraco Package Builder ===" -ForegroundColor Cyan

Write-Host "`n[1/3] Syncing shared Assets into MegaForm.Umbraco/wwwroot..." -ForegroundColor Yellow
if (-not (Test-Path $wwwrootDir)) { New-Item -ItemType Directory -Path $wwwrootDir -Force | Out-Null }
Copy-Item (Join-Path $assetsDir "css") (Join-Path $wwwrootDir "css") -Recurse -Force
Copy-Item (Join-Path $assetsDir "js")  (Join-Path $wwwrootDir "js")  -Recurse -Force
if (Test-Path (Join-Path $assetsDir "themes")) {
    Copy-Item (Join-Path $assetsDir "themes") (Join-Path $wwwrootDir "themes") -Recurse -Force
}
foreach ($f in @("embed.html", "embed-preview.html")) {
    $src = Join-Path $assetsDir $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $wwwrootDir $f) -Force }
}

Write-Host "`n[2/3] Building MegaForm.Umbraco..." -ForegroundColor Yellow
dotnet build $umbDir -c Release

Write-Host "`n[3/3] Creating NuGet package..." -ForegroundColor Yellow
if (-not (Test-Path $packagesDir)) { New-Item -ItemType Directory -Path $packagesDir -Force | Out-Null }
dotnet pack $umbDir -c Release -o $packagesDir

Write-Host "`n=== Build Complete ===" -ForegroundColor Green
Write-Host "Static assets served from /App_Plugins/MegaForm/ via StaticWebAssetBasePath"
