# ============================================================
# MegaForm — Build Umbraco Package
# Syncs shared Assets -> MegaForm.Umbraco/wwwroot, then builds the RCL package
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $root "Assets"
$coreDir = Join-Path $root "MegaForm.Core"
$sdkDir = Join-Path $root "MegaForm.Sdk"
$umbDir = Join-Path $root "MegaForm.Umbraco"
$wwwrootDir = Join-Path $umbDir "wwwroot"
$packagesDir = Join-Path $root "_packages"

function Invoke-DotNet {
    param([Parameter(Mandatory = $true, Position = 0)][string[]]$Arguments)

    & dotnet @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Remove-NestedAssetDirectory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { return }

    $resolvedRoot = [IO.Path]::GetFullPath($wwwrootDir).TrimEnd('\') + '\'
    $resolvedPath = [IO.Path]::GetFullPath($Path)
    if (-not $resolvedPath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove asset directory outside Umbraco wwwroot: $resolvedPath"
    }

    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

Write-Host "=== MegaForm Umbraco Package Builder ===" -ForegroundColor Cyan

Write-Host "`n[1/4] Syncing shared Assets into MegaForm.Umbraco/wwwroot..." -ForegroundColor Yellow
if (-not (Test-Path $wwwrootDir)) { New-Item -ItemType Directory -Path $wwwrootDir -Force | Out-Null }
foreach ($assetType in @("css", "js", "themes")) {
    $source = Join-Path $assetsDir $assetType
    if (-not (Test-Path -LiteralPath $source)) { continue }

    $destination = Join-Path $wwwrootDir $assetType
    if (-not (Test-Path -LiteralPath $destination)) {
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
    }

    # Older builds copied the source folder into an existing destination and
    # accidentally produced css/css, js/js, and themes/themes in the package.
    Remove-NestedAssetDirectory (Join-Path $destination $assetType)
    Copy-Item (Join-Path $source "*") $destination -Recurse -Force
}
foreach ($f in @("embed.html")) {
    $src = Join-Path $assetsDir $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $wwwrootDir $f) -Force }
}

Write-Host "Keeping Umbraco-specific embed-preview.html (uses /megaform/form/{id}/script)." -ForegroundColor DarkGray

Write-Host "`n[2/4] Building MegaForm.Umbraco..." -ForegroundColor Yellow
Invoke-DotNet @("build", $umbDir, "-c", "Release")

Write-Host "`n[3/4] Creating dependency packages..." -ForegroundColor Yellow
if (-not (Test-Path $packagesDir)) { New-Item -ItemType Directory -Path $packagesDir -Force | Out-Null }
Invoke-DotNet @("pack", $coreDir, "-c", "Release", "-o", $packagesDir)
Invoke-DotNet @("pack", $sdkDir, "-c", "Release", "-o", $packagesDir)

Write-Host "`n[4/4] Creating Umbraco NuGet package..." -ForegroundColor Yellow
Invoke-DotNet @("pack", $umbDir, "-c", "Release", "-o", $packagesDir, "--no-build")

Write-Host "`n=== Build Complete ===" -ForegroundColor Green
Write-Host "Static assets served from /App_Plugins/MegaForm/ via StaticWebAssetBasePath"
