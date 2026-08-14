#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Starts the MegaForm for Umbraco local demo on a predictable URL.
.DESCRIPTION
    Kills any stale MegaForm.Umbraco.Host.exe / dotnet processes that hold the
    build output locked, builds the project, then runs the compiled host DLL
    directly so the demo stays stable and avoids dotnet-run file-lock retries.
.EXAMPLE
    .\Run-Demo.ps1
    .\Run-Demo.ps1 -Port 5000
#>
[CmdletBinding()]
param(
    [int]$Port = 16474,
    [switch]$Https
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$urls = if ($Https) { "https://localhost:$($Port + 1);http://localhost:$Port" } else { "http://localhost:$Port" }

Write-Host "=== MegaForm for Umbraco — Local Demo ===" -ForegroundColor Cyan

# 1. Stop stale host processes so dotnet build can copy outputs without locks.
$procs = Get-Process -Name 'MegaForm.Umbraco.Host' -ErrorAction SilentlyContinue
if ($procs) {
    Write-Host "Stopping stale MegaForm.Umbraco.Host process(es)..." -ForegroundColor Yellow
    $procs | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# The host usually runs as `dotnet.exe <...>\MegaForm.Umbraco.Host.dll`, so kill
# any dotnet process whose command line references this host's DLL path.
Get-CimInstance Win32_Process -Filter "Name='dotnet.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $cmd = $_.CommandLine
        $cmd -and ($cmd.Contains('MegaForm.Umbraco.Host.dll') -or $cmd.Contains("$root\bin"))
    } |
    ForEach-Object {
        Write-Host "Stopping stale dotnet process $($_.ProcessId) holding the host DLL..." -ForegroundColor Yellow
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

# 2. Build once to surface compile errors early.
Write-Host "Building MegaForm.Umbraco.Host..." -ForegroundColor Cyan
& dotnet build "$root\MegaForm.Umbraco.Host.csproj" -c Debug --nologo
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. Fix errors above and rerun." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 3. Run the compiled DLL directly (avoids dotnet-run file-lock issues).
$dll = "$root\bin\Debug\net8.0\MegaForm.Umbraco.Host.dll"
if (-not (Test-Path $dll)) {
    Write-Host "Could not find built DLL: $dll" -ForegroundColor Red
    exit 1
}

Write-Host "Starting demo at $urls" -ForegroundColor Green
Write-Host "Back-office: http://localhost:$Port/umbraco" -ForegroundColor Green
Write-Host "  User: admin@local  /  Password: Admin123456!" -ForegroundColor Green
Write-Host "Demo pages:  http://localhost:$Port/demo" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray

$env:ASPNETCORE_ENVIRONMENT = 'Development'
& dotnet $dll --urls $urls
