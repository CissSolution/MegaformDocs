#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build, pack and publish MegaForm NuGet packages to nuget.org.
.DESCRIPTION
    Packs MegaForm.Core, MegaForm.Integrations.CloudStorage, MegaForm.Sdk,
    MegaForm.Web and MegaForm.AspNetCore.Component. Defaults to a local dry-run.
    Pass -ApiKey to push to nuget.org.
    Requires dotnet CLI and (for push) a valid nuget.org API key.
.PARAMETER ApiKey
    nuget.org API key. If omitted, the script only packs into local-nuget/.
.PARAMETER OutputPath
    Local folder for generated .nupkg files. Default: local-nuget/
.PARAMETER Configuration
    Build configuration. Default: Release.
#>
[CmdletBinding()]
param(
    [string]$ApiKey = "",
    [string]$OutputPath = "local-nuget",
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root

try {
    $out = Join-Path $root $OutputPath
    if (Test-Path $out) {
        Remove-Item "$out\*" -Recurse -Force -ErrorAction SilentlyContinue
    }
    else {
        New-Item -ItemType Directory -Path $out | Out-Null
    }

    $projects = @(
        "MegaForm.Core\MegaForm.Core.csproj",
        "MegaForm.Integrations.CloudStorage\MegaForm.Integrations.CloudStorage.csproj",
        "MegaForm.Sdk\MegaForm.Sdk.csproj",
        "MegaForm.Web\MegaForm.Web.csproj",
        "MegaForm.AspNetCore.Component\MegaForm.AspNetCore.Component.csproj"
    )

    foreach ($proj in $projects) {
        Write-Host "== Packing $proj ..." -ForegroundColor Cyan
        dotnet pack $proj -c $Configuration -o $out
        if ($LASTEXITCODE -ne 0) { throw "Pack failed for $proj" }
    }

    $packages = Get-ChildItem $out -Filter "*.nupkg" | Select-Object -ExpandProperty FullName
    if ($packages.Count -eq 0) { throw "No .nupkg files found in $out" }

    Write-Host "== Generated packages:" -ForegroundColor Green
    $packages | ForEach-Object { Write-Host "  $_" }

    if ($ApiKey) {
        Write-Host "== Pushing to nuget.org ..." -ForegroundColor Cyan
        foreach ($pkg in $packages) {
            dotnet nuget push $pkg --source https://api.nuget.org/v3/index.json --api-key $ApiKey --skip-duplicate
            if ($LASTEXITCODE -ne 0) { throw "Push failed for $pkg" }
        }
        Write-Host "== Publish complete." -ForegroundColor Green
    }
    else {
        Write-Host "== Dry-run complete. Pass -ApiKey to push to nuget.org." -ForegroundColor Yellow
    }
}
finally {
    Pop-Location
}
