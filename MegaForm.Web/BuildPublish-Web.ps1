# ============================================================
#  MegaForm.Web - Publish Standalone App
#
#  Publish .NET 10 self-contained hoac framework-dependent.
#  Chay: powershell -ExecutionPolicy Bypass -File BuildPublish-Web.ps1
#
#  Ket qua: publish\ - chay dotnet MegaForm.Web.dll
# ============================================================

$ErrorActionPreference = "Stop"
$PROJECT_DIR  = Split-Path -Parent $MyInvocation.MyCommand.Path
$SOLUTION_DIR = Split-Path -Parent $PROJECT_DIR
$PUBLISH_DIR  = Join-Path $PROJECT_DIR "publish"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  MegaForm.Web - Publish (.NET 10)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
#  1. Publish
# ============================================================
Write-Host "[1/3] Publishing..." -ForegroundColor Yellow
if (Test-Path $PUBLISH_DIR) { Remove-Item $PUBLISH_DIR -Recurse -Force }

dotnet publish "$PROJECT_DIR\MegaForm.Web.csproj" -c Release -o $PUBLISH_DIR
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Publish that bai!" -ForegroundColor Red
    Read-Host "Enter de thoat"; exit 1
}
Write-Host "  Publish OK" -ForegroundColor Green

# ============================================================
#  2. Copy shared Assets -> wwwroot/megaform/
# ============================================================
Write-Host "[2/3] Copy Assets..." -ForegroundColor Yellow
$assetsDir  = "$SOLUTION_DIR\Assets"
$wwwrootDir = "$PUBLISH_DIR\wwwroot\megaform"

if (Test-Path $assetsDir) {
    if (-not (Test-Path $wwwrootDir)) { New-Item -ItemType Directory -Path $wwwrootDir -Force | Out-Null }
    xcopy /y /s /q "$assetsDir\*" "$wwwrootDir\" >$null 2>$null
    $count = (Get-ChildItem $wwwrootDir -Recurse -File).Count
    Write-Host "  Copied $count asset files" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Assets\ khong tim thay" -ForegroundColor Yellow
}

# ============================================================
#  3. Ket qua
# ============================================================
Write-Host "[3/3] Kiem tra..." -ForegroundColor Yellow
$totalFiles = (Get-ChildItem $PUBLISH_DIR -Recurse -File).Count
$sz = [math]::Round((Get-ChildItem $PUBLISH_DIR -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  HOAN THANH!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Output:  $PUBLISH_DIR" -ForegroundColor White
Write-Host "  Files:   $totalFiles" -ForegroundColor White
Write-Host "  Size:    ${sz} MB" -ForegroundColor White
Write-Host ""
Write-Host "  Chay:" -ForegroundColor Yellow
Write-Host "    cd publish" -ForegroundColor White
Write-Host "    dotnet MegaForm.Web.dll" -ForegroundColor White
Write-Host "    # Mo: http://localhost:5000" -ForegroundColor Gray
Write-Host ""
Write-Host "  Hoac deploy len:" -ForegroundColor Yellow
Write-Host "    - IIS:    Copy publish\ vao IIS site, add Application Pool .NET 10" -ForegroundColor White
Write-Host "    - Docker:  FROM mcr.microsoft.com/dotnet/aspnet:10.0" -ForegroundColor White
Write-Host "    - Azure:   dotnet publish -c Release; az webapp deploy" -ForegroundColor White
Write-Host ""
Read-Host "Nhan Enter de thoat"
