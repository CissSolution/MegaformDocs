# ============================================================
#  MegaForm.DNN - Setup DNN References
#
#  Copy cac DLL tu DNN website vao References\
#  Chay 1 lan sau khi clone project:
#    powershell -ExecutionPolicy Bypass -File SetupReferences.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$REFS_DIR = Join-Path $PROJECT_DIR "References"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  MegaForm.DNN - Setup DNN References" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# --- Tim thu muc bin cua DNN ---
$dnnBinPaths = @(
    "C:\inetpub\wwwroot\DNN10221\Website\bin",
    "C:\inetpub\wwwroot\DNN\bin",
    "C:\inetpub\wwwroot\dnn\bin",
    "C:\DNNDEV\Website\bin",
    "C:\DNN\Website\bin",
    "C:\DNN\bin",
    "D:\inetpub\wwwroot\DNN\bin",
    "D:\DNN\bin"
)

$dnnBin = $null
foreach ($p in $dnnBinPaths) {
    if (Test-Path (Join-Path $p "DotNetNuke.dll")) {
        $dnnBin = $p
        break
    }
}

# Neu khong tim thay, hoi nguoi dung
if (-not $dnnBin) {
    Write-Host "[!] Khong tu dong tim thay thu muc bin cua DNN." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    Nhap duong dan thu muc bin cua DNN website:" -ForegroundColor White
    Write-Host "    Vi du: C:\inetpub\wwwroot\DNN\bin" -ForegroundColor Gray
    Write-Host ""
    $dnnBin = Read-Host "    DNN bin path"
    $dnnBin = $dnnBin.Trim('"').Trim("'").Trim()

    if (-not (Test-Path (Join-Path $dnnBin "DotNetNuke.dll"))) {
        Write-Host ""
        Write-Host "[ERROR] Khong tim thay DotNetNuke.dll tai: $dnnBin" -ForegroundColor Red
        Read-Host "Nhan Enter de thoat"
        exit 1
    }
}

Write-Host "[OK] DNN bin: $dnnBin" -ForegroundColor Green
Write-Host ""

# --- Danh sach DLL ---
$requiredDlls = @(
    @{ Name = "DotNetNuke.dll";                     Required = $true  },
    @{ Name = "DotNetNuke.Web.dll";                  Required = $true  },
    @{ Name = "DotNetNuke.Web.Client.dll";           Required = $true  },
    @{ Name = "System.Web.Http.dll";                 Required = $true  },
    @{ Name = "System.Web.Http.WebHost.dll";         Required = $true  },
    @{ Name = "System.Net.Http.Formatting.dll";      Required = $true  },
    @{ Name = "Newtonsoft.Json.dll";                  Required = $false },
    @{ Name = "DotNetNuke.Instrumentation.dll";      Required = $false },
    @{ Name = "DotNetNuke.Log4Net.dll";              Required = $false },
    @{ Name = "Microsoft.Extensions.DependencyInjection.dll"; Required = $false },
    @{ Name = "Microsoft.Extensions.DependencyInjection.Abstractions.dll"; Required = $false }
)

# --- Tao thu muc ---
if (-not (Test-Path $REFS_DIR)) {
    New-Item -ItemType Directory -Path $REFS_DIR -Force | Out-Null
}

# .gitignore de khong commit DLLs
$gitignorePath = Join-Path $REFS_DIR ".gitignore"
if (-not (Test-Path $gitignorePath)) {
    "*.dll`n*.pdb`n*.xml" | Out-File $gitignorePath -Encoding UTF8
}

# --- Copy ---
Write-Host "Dang copy DLLs..." -ForegroundColor Yellow
Write-Host ""

$copied = 0
$missingReq = 0

foreach ($dll in $requiredDlls) {
    $src = Join-Path $dnnBin $dll.Name
    $dst = Join-Path $REFS_DIR $dll.Name

    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        $ver = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($src).FileVersion
        Write-Host "  [OK] $($dll.Name) (v$ver)" -ForegroundColor Green
        $copied++
    } elseif ($dll.Required) {
        Write-Host "  [!!] $($dll.Name) - BAT BUOC, khong tim thay!" -ForegroundColor Red
        $missingReq++
    } else {
        Write-Host "  [--] $($dll.Name) - tuy chon, bo qua" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "------------------------------------------------------------"
Write-Host "  Copied: $copied    Missing required: $missingReq" -ForegroundColor White
Write-Host "------------------------------------------------------------"

if ($missingReq -gt 0) {
    Write-Host ""
    Write-Host "  CANH BAO: $missingReq DLL bat buoc khong tim thay!" -ForegroundColor Red
    Write-Host "  Build se THAT BAI. Kiem tra lai DNN bin path." -ForegroundColor Red
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  HOAN THANH!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Buoc tiep theo:" -ForegroundColor Yellow
Write-Host "    1. cd ..                              (ve thu muc goc)" -ForegroundColor White
Write-Host "    2. dotnet restore MegaForm.sln        (restore NuGet)" -ForegroundColor White
Write-Host "    3. dotnet build MegaForm.sln -c Release" -ForegroundColor White
Write-Host "    4. cd MegaForm.DNN" -ForegroundColor White
Write-Host "    5. .\BuildPackage-DNN.ps1             (tao Install ZIP)" -ForegroundColor White
Write-Host ""
Read-Host "Nhan Enter de thoat"
