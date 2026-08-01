<#
    [CoreDllDeploy v20260801] Drop a rebuilt MegaForm.Core.dll onto a running DNN site.

    Installing the module package does NOT overwrite bin\*.dll on DNN, so a Core-only fix
    has to be copied by hand - and the file is locked while the app pool runs. This stops
    the pool, backs the old assembly up next to it, copies, and starts the pool again.

    MegaForm.Core.dll is a separate assembly in the site bin (not merged into
    MegaForm.DNN.dll), so replacing it alone is enough for a fix that lives in Core.
    One caveat that decides this: DefaultRepoBaseUrl is a `const`, and const values are
    INLINED into referencing assemblies at compile time. Its only non-test reader is
    NormalizeBaseUrl inside Core itself, so nothing stale is baked into MegaForm.DNN.dll.
    If that ever changes, the DNN assembly has to ship too.

    Usage:
      .\tools\gallery\Deploy-CoreDll.ps1 -Site DNN_ACME_GUIDE.AI
      .\tools\gallery\Deploy-CoreDll.ps1 -Site DNN_ACME_GUIDE.AI -WhatIfOnly
      .\tools\gallery\Deploy-CoreDll.ps1 -Site X -Rollback     # newest .bak- back into place
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Site,
    # Which assembly to replace. Each one builds to its own target framework, so the
    # default source path is derived rather than guessed.
    [ValidateSet('MegaForm.Core.dll', 'MegaForm.DNN.dll', 'MegaForm.PersonaBar.dll', 'MegaForm.Sdk.dll')]
    [string]$Assembly = 'MegaForm.Core.dll',
    [string]$Source = '',
    [switch]$Rollback,
    [switch]$WhatIfOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
# PersonaBar must be net48 (its DNN references are 5.3, and net472 gives CS1705); the
# rest of the DNN surface is net472.
$sourceMap = @{
    'MegaForm.Core.dll'       = 'MegaForm.Core\bin\Release\net472\MegaForm.Core.dll'
    'MegaForm.DNN.dll'        = 'MegaForm.DNN\bin\Release\MegaForm.DNN.dll'
    'MegaForm.PersonaBar.dll' = 'MegaForm.PersonaBar\bin\Release\net48\MegaForm.PersonaBar.dll'
    'MegaForm.Sdk.dll'        = 'MegaForm.Sdk\bin\Release\net472\MegaForm.Sdk.dll'
}
if ([string]::IsNullOrWhiteSpace($Source)) {
    $Source = Join-Path $repoRoot $sourceMap[$Assembly]
}

function Fail([string]$m) { Write-Host "ABORT: $m" -ForegroundColor Red; exit 1 }

Import-Module WebAdministration
$web = Get-Website | Where-Object { $_.Name -eq $Site }
if (-not $web) { Fail "Khong tim thay IIS site '$Site'." }
$pool = $web.applicationPool
$bin = Join-Path $web.physicalPath 'bin'
$dst = Join-Path $bin $Assembly
if (-not (Test-Path $dst)) { Fail "Khong thay $dst - site nay chua cai MegaForm?" }

if ($Rollback) {
    $bak = Get-ChildItem $bin -Filter ($Assembly + '.bak-*') | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $bak) { Fail 'Khong co ban backup nao de rollback.' }
    $Source = $bak.FullName
    Write-Host "ROLLBACK tu $($bak.Name)" -ForegroundColor Yellow
} elseif (-not (Test-Path $Source)) {
    Fail "Khong thay DLL nguon: $Source  (chay: dotnet build MegaForm.Core\MegaForm.Core.csproj -c Release -f net472)"
}

Write-Host "site   : $Site"
Write-Host "pool   : $pool"
Write-Host "dang co: $((Get-Item $dst).Length) bytes  $((Get-Item $dst).LastWriteTime)"
Write-Host "se copy: $((Get-Item $Source).Length) bytes  $((Get-Item $Source).LastWriteTime)"
if ($WhatIfOnly) { Write-Host '-WhatIfOnly: dung tai day.' -ForegroundColor Yellow; exit 0 }

Stop-WebAppPool -Name $pool
# The DLL stays locked for a moment after the pool reports Stopped; copying too early
# fails with "being used by another process" and leaves the site on the old assembly.
for ($i = 0; $i -lt 40; $i++) {
    if ((Get-WebAppPoolState -Name $pool).Value -eq 'Stopped') { break }
    Start-Sleep -Milliseconds 500
}
Write-Host "pool   : $((Get-WebAppPoolState -Name $pool).Value)"

if (-not $Rollback) {
    $bak = Join-Path $bin ($Assembly + '.bak-' + (Get-Item $dst).LastWriteTime.ToString('yyyyMMddHHmmss'))
    Copy-Item $dst $bak -Force
    Write-Host "backup : $(Split-Path $bak -Leaf)" -ForegroundColor Green
}

$copied = $false
for ($i = 0; $i -lt 10; $i++) {
    try { Copy-Item $Source $dst -Force; $copied = $true; break }
    catch { Start-Sleep -Seconds 1 }
}
Start-WebAppPool -Name $pool
Start-Sleep -Seconds 2
Write-Host "pool   : $((Get-WebAppPoolState -Name $pool).Value)"

if (-not $copied) { Fail 'Copy that bai (file van bi khoa). Pool da duoc bat lai, site van chay DLL cu.' }
Write-Host "xong   : $((Get-Item $dst).Length) bytes  $((Get-Item $dst).LastWriteTime)" -ForegroundColor Green
Write-Host ''
Write-Host 'Kiem chung:' -ForegroundColor Cyan
Write-Host "  node tools\browser-qa\gallery-probe.mjs .\out http://$($web.Bindings.Collection[0].bindingInformation.Split(':')[-1]) admin dnnhost"
