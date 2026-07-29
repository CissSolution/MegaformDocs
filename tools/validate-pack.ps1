# ============================================================
# [R3-J] Post-pack validator — fail the pack BEFORE it can ship a broken package.
# Catches the DLL/package mismatch trap that previously disabled typed write/collapse
# silently (stale MegaForm.Core.dll shipped next to a newer Server.dll).
#
# Checks (all runtime-independent — no assembly load, works from Windows PowerShell):
#   1. Every lib\netX contains the four MegaForm DLLs.
#   2. Packed MegaForm.Core.dll carries ISubmissionDataStore.SupportsDataJsonCollapse
#      (byte-scan of the metadata #Strings heap) — a stale pre-typed Core fails here.
#   3. nupkg <version> == MegaForm.Oqtane.Client/ModuleInfo.cs Version (kills 5-way drift).
#   4. No packed Core/Server DLL is OLDER than the newest tracked *.cs source (stale guard).
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\validate-pack.ps1 -Nupkg <path> [-RepoRoot <root>]
# Exit 0 = OK, 1 = invalid (with [PACK-INVALID] reasons).
# ============================================================
param(
  [Parameter(Mandatory = $true)][string]$Nupkg,
  [string]$RepoRoot = (Get-Location).Path
)
$ErrorActionPreference = 'Stop'
$fail = @()

if (-not (Test-Path $Nupkg)) { Write-Host "[PACK-INVALID] nupkg not found: $Nupkg"; exit 1 }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$tmp = Join-Path $env:TEMP ("mfpack_" + [guid]::NewGuid().ToString('N'))
[System.IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path $Nupkg), $tmp)
try {
  # 1. required DLLs per target framework
  # [PackageSlim 2026-07-29] The store package targets Oqtane 10.x (net10.0) only — the net9.0
  # payload (Oqtane 6) was 5.8 MB of a listing nobody installs from here, and it lives on in
  # MegaForm.Oqtane.601.nuspec. A net9.0 folder is therefore OPTIONAL: validated when present,
  # never demanded. Every framework the package DOES ship must still be complete.
  $req = @('MegaForm.Core.dll','MegaForm.Oqtane.Server.Oqtane.dll','MegaForm.Oqtane.Client.Oqtane.dll','MegaForm.Oqtane.Shared.Oqtane.dll')
  $shipped = @(Get-ChildItem (Join-Path $tmp 'lib') -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
  if (-not ($shipped -contains 'net10.0')) { $fail += "missing lib\net10.0 (the framework this package targets)" }
  foreach ($tfm in $shipped) {
    $lib = Join-Path $tmp "lib\$tfm"
    foreach ($d in $req) { if (-not (Test-Path (Join-Path $lib $d))) { $fail += "missing lib\$tfm\$d" } }
  }

  # 2. Core carries the collapse contract member (stale pre-typed Core fails)
  $coreDll = Join-Path $tmp 'lib\net10.0\MegaForm.Core.dll'
  if (Test-Path $coreDll) {
    $ascii = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($coreDll))
    if ($ascii -notmatch 'SupportsDataJsonCollapse') {
      $fail += "Core.dll missing ISubmissionDataStore.SupportsDataJsonCollapse (stale/pre-typed Core)"
    }
  }

  # 3. nupkg version == ModuleInfo version
  $miPath = Join-Path $RepoRoot 'MegaForm.Oqtane.Client\ModuleInfo.cs'
  $miVer = ((Select-String -Path $miPath -Pattern 'Version = "([0-9.]+)"').Matches[0].Groups[1].Value)
  $nuspec = Get-ChildItem -Path $tmp -Filter *.nuspec -File | Select-Object -First 1
  if ($nuspec) {
    [xml]$nx = Get-Content $nuspec.FullName
    $pkgVer = "$($nx.package.metadata.version)"
    if ($pkgVer -ne $miVer) { $fail += "nupkg version '$pkgVer' != ModuleInfo.Version '$miVer'" }
  } else { $fail += 'no .nuspec inside nupkg' }

  # 4. staleness (build freshness): each built DLL must not be OLDER than its project's newest
  #    source .cs. Uses filesystem mtimes on the BIN outputs (reliable) -- NOT the extracted nupkg
  #    entries, because ZIP stores DOS local time without a zone and the extract shifts it.
  $binNet10 = Join-Path $RepoRoot 'MegaForm.Oqtane.Server\bin\Release\net10.0'
  $stalePairs = @(
    @{ Dll = (Join-Path $binNet10 'MegaForm.Core.dll'); Src = @('MegaForm.Core') },
    @{ Dll = (Join-Path $binNet10 'MegaForm.Oqtane.Server.Oqtane.dll'); Src = @('MegaForm.Oqtane.Server','MegaForm.Core','MegaForm.Oqtane.Shared') }
  )
  foreach ($p in $stalePairs) {
    $dll = Get-Item $p.Dll -ErrorAction SilentlyContinue
    if (-not $dll) { continue }
    $newest = $p.Src |
      ForEach-Object { Get-ChildItem -Path (Join-Path $RepoRoot $_) -Recurse -Filter *.cs -File -ErrorAction SilentlyContinue } |
      Where-Object { $_.FullName -notmatch '\\(obj|bin)\\' } |
      Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($newest -and $newest.LastWriteTimeUtc -gt $dll.LastWriteTimeUtc) {
      $fail += "STALE: source '$($newest.Name)' is newer than built $($dll.Name) -- rebuild (clean pack.cmd) before packing"
    }
  }
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

if ($fail.Count -gt 0) {
  $fail | ForEach-Object { Write-Host "[PACK-INVALID] $_" }
  exit 1
}
Write-Host "[PACK-OK] $Nupkg passed R3-J validation"
exit 0
