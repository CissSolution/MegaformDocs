# ============================================================
#  MegaForm.PersonaBar - Setup DNN References
#
#  Copy DLL tu bin cua mot site DNN 10.x vao References\
#    powershell -ExecutionPolicy Bypass -File SetupReferences.ps1 [-DnnBin <path>]
#
#  KHONG dung chung References cua MegaForm.DNN: Dnn.PersonaBar.Library (DNN 10.x) keo
#  theo System.Web.Http 5.3, con MegaForm.DNN phai build voi 5.2.3 de chay tren DNN 9.x.
#  Tron hai bo => CS1705.
# ============================================================

[CmdletBinding()]
param(
    [string]$DnnBin
)

$ErrorActionPreference = "Stop"
$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$REFS_DIR = Join-Path $PROJECT_DIR "References"

$candidates = @(
    $DnnBin,
    "E:\DNN_SITES\DNN_MegaClean008\Website\bin",
    "E:\DNN_SITES\DNN10322_MegaClean\Website\bin",
    "E:\DNN_SITES\DNN10_3_3_Test20\Website\bin"
) | Where-Object { $_ }

$bin = $null
foreach ($p in $candidates) {
    if (Test-Path (Join-Path $p "Dnn.PersonaBar.Library.dll")) { $bin = $p; break }
}

if (-not $bin) {
    Write-Host "[!] Khong tim thay bin co Dnn.PersonaBar.Library.dll." -ForegroundColor Yellow
    $bin = (Read-Host "    DNN 10.x bin path").Trim('"').Trim("'").Trim()
    if (-not (Test-Path (Join-Path $bin "Dnn.PersonaBar.Library.dll"))) {
        Write-Host "[ERROR] Khong thay Dnn.PersonaBar.Library.dll tai: $bin" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[OK] DNN bin: $bin" -ForegroundColor Green

$dlls = @(
    "Dnn.PersonaBar.Library.dll",
    "DotNetNuke.dll",
    "DotNetNuke.Web.dll",
    "DotNetNuke.Instrumentation.dll",
    "System.Web.Http.dll",
    "System.Net.Http.Formatting.dll"
)

if (-not (Test-Path $REFS_DIR)) { New-Item -ItemType Directory -Path $REFS_DIR -Force | Out-Null }
$gitignorePath = Join-Path $REFS_DIR ".gitignore"
if (-not (Test-Path $gitignorePath)) { "*.dll`n*.pdb`n*.xml" | Out-File $gitignorePath -Encoding UTF8 }

$missing = 0
foreach ($dll in $dlls) {
    $src = Join-Path $bin $dll
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $REFS_DIR $dll) -Force
        Write-Host "  [OK] $dll" -ForegroundColor Green
    } else {
        Write-Host "  [!!] $dll - khong tim thay" -ForegroundColor Red
        $missing++
    }
}

Write-Host ""
if ($missing -gt 0) {
    Write-Host "  $missing DLL thieu - build se that bai." -ForegroundColor Red
} else {
    Write-Host "  Xong. Tiep theo: .\BuildPackage-PersonaBar.ps1 -BuildDotNet" -ForegroundColor Yellow
}
