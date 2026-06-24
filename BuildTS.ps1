# ============================================================
#  MegaForm - BuildTS.ps1
#  Build Vite bundles + Sync wwwroot
#
#  Cach dung:
#    .\BuildTS.ps1                      # build ALL Vite bundles
#    .\BuildTS.ps1 -Module builder      # chi build megaform-builder.js
#    .\BuildTS.ps1 -Module renderer     # chi build megaform-renderer.js
#
#  Ket qua:
#    Assets\js\megaform-*.js + Assets\js\bundles\*.js    <- Vite output
#    MegaForm.Web\wwwroot\megaform\                    <- synced tu Assets\
# ============================================================

param(
    [Parameter(Position=0)][string]$Module = "",
    [switch]$NoPause
)

$ErrorActionPreference = "Continue"
$SCRIPT_DIR  = Split-Path -Parent $MyInvocation.MyCommand.Path
$UI_DIR      = Join-Path $SCRIPT_DIR "MegaForm.UI"
$ASSETS_JS   = Join-Path $SCRIPT_DIR "Assets\js"
$ASSETS_CSS  = Join-Path $SCRIPT_DIR "Assets\css"
$WWWROOT     = Join-Path $SCRIPT_DIR "MegaForm.Web\wwwroot\megaform"

function Get-ShortHash([string]$Path) {
    if (-not (Test-Path $Path)) { return "missing" }
    try { return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.Substring(0, 12) }
    catch { return "hash-error" }
}

function Verify-SyncedFile([string]$SourcePath, [string]$DestPath, [string]$Label) {
    if (-not (Test-Path $SourcePath)) {
        Write-Host "    [WARN] Source missing for verify: $SourcePath" -ForegroundColor Yellow
        return
    }
    if (-not (Test-Path $DestPath)) {
        Write-Host "    [WARN] $Label missing: $DestPath" -ForegroundColor Yellow
        return
    }
    $srcItem = Get-Item $SourcePath
    $dstItem = Get-Item $DestPath
    $srcHash = Get-ShortHash $SourcePath
    $dstHash = Get-ShortHash $DestPath
    if ($srcItem.Length -eq $dstItem.Length -and $srcHash -eq $dstHash) {
        Write-Host "    [VERIFY] $Label OK  size=$([math]::Round($dstItem.Length/1KB,1))KB hash=$dstHash" -ForegroundColor Green
    } else {
        Write-Host "    [VERIFY] $Label MISMATCH  src=$srcHash/$($srcItem.Length) dst=$dstHash/$($dstItem.Length)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  MegaForm - Vite Build + Sync wwwroot" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  UI_DIR   : $UI_DIR" -ForegroundColor Gray
Write-Host "  ASSETS   : $ASSETS_JS" -ForegroundColor Gray
Write-Host "  WWWROOT  : $WWWROOT" -ForegroundColor Gray

# -- Kiem tra Node.js
$nodeOk = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeOk) {
    Write-Host "[ERROR] Node.js khong tim thay. Cai dat: https://nodejs.org" -ForegroundColor Red
    Read-Host "Enter de thoat"; exit 1
}
Write-Host "  Node     : $(node -v 2>&1)" -ForegroundColor Gray

# -- BUOC 1: npm install
Write-Host ""
Write-Host "[1/3] Kiem tra node_modules..." -ForegroundColor Yellow
Push-Location $UI_DIR
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm install that bai!" -ForegroundColor Red
        Pop-Location; Read-Host "Enter de thoat"; exit 1
    }
}
Write-Host "  [OK] node_modules san sang" -ForegroundColor Green

# -- BUOC 2: Vite build
Write-Host ""
Write-Host "[2/3] Building Vite bundles..." -ForegroundColor Yellow

$allModules = @("builder-loader","i18n","widgets","renderer","builder","unified-monaco","workflow","submissions","dashboard","languages","settings-popup","views","presets","embed","admin-live","theme-designer","theme-inspector","dnn-host","captcha","appointment","phone-pro","grid-repeater")
$targets = if ($Module) { @($Module) } else { $allModules }
$failed = @()

foreach ($m in $targets) {
    Write-Host "  Building megaform-$m ..." -NoNewline
    if ($m -eq "workflow") {
        # workflow: chay npm run build:workflow (copy React/RF deps tu node_modules truoc, sau Vite build + sync)
        $out = (npm --prefix "$UI_DIR" run build:workflow 2>&1)
        $exitCode = $LASTEXITCODE
        $bp = Join-Path $SCRIPT_DIR "Assets\js\builder\megaform-workflow-reactflow.js"
    } elseif ($m -eq "renderer") {
        $out = (npm --prefix "$UI_DIR" run build:renderer 2>&1)
        $exitCode = $LASTEXITCODE
        $bp = Join-Path $SCRIPT_DIR "Assets\js\megaform-renderer.js"
    } elseif ($m -eq "captcha") {
        Push-Location $SCRIPT_DIR
        $out = (tsc -p "Assets\ts\tsconfig.json" 2>&1)
        $exitCode = $LASTEXITCODE
        Pop-Location
        $bp = Join-Path $SCRIPT_DIR "Assets\js\plugins\megaform-widget-captcha.js"
    } elseif ($m -eq "appointment") {
        Push-Location $SCRIPT_DIR
        $out = (tsc -p "Assets\ts\tsconfig.appointment.json" 2>&1)
        $exitCode = $LASTEXITCODE
        Pop-Location
        $bp = Join-Path $SCRIPT_DIR "Assets\js\plugins\megaform-widget-appointment.js"
    } elseif ($m -eq "phone-pro") {
        Push-Location $SCRIPT_DIR
        $out = (tsc -p "MegaForm.UI\src\widgets\plugins\tsconfig.json" 2>&1)
        $exitCode = $LASTEXITCODE
        Pop-Location
        $bp = Join-Path $SCRIPT_DIR "Assets\js\plugins\megaform-widget-phone-pro.js"
    } elseif ($m -eq "grid-repeater") {
        Push-Location $SCRIPT_DIR
        $out = (tsc -p "MegaForm.UI\src\widgets\tsconfig.grid-repeater.json" 2>&1)
        $exitCode = $LASTEXITCODE
        Pop-Location
        $bp = Join-Path $SCRIPT_DIR "Assets\js\plugins\megaform-widget-grid-repeater.js"
    } else {
        Push-Location $UI_DIR
        $out = (node scripts/build-entry.cjs $m 2>&1)
        $exitCode = $LASTEXITCODE
        Pop-Location
        $bp = if ($m -eq "builder") {
            Join-Path $SCRIPT_DIR "Assets\js\bundles\megaform-$m.js"
        } else {
            Join-Path $SCRIPT_DIR "Assets\js\megaform-$m.js"
        }
    }
    if ($exitCode -eq 0) {
        $sz = if (Test-Path $bp) { "{0:N1} KB" -f ((Get-Item $bp).Length/1024) } else { "?" }
        Write-Host " [OK] $sz" -ForegroundColor Green
    } else {
        Write-Host " [FAIL]" -ForegroundColor Red
        $out | Select-String "error|Error" | Select-Object -First 5 |
            ForEach-Object { Write-Host "    $_" -ForegroundColor DarkRed }
        $failed += $m
    }
}

# -- BUOC 3: Sync Assets -> DesktopModules + Web + Oqtane (+ fix21_src copies when present)
Write-Host ""
Write-Host "[3/3] Syncing Assets to runtime folders..." -ForegroundColor Yellow

$OQTANE = Join-Path $SCRIPT_DIR "MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm"
$DNN_DESKTOP = Join-Path $SCRIPT_DIR "DesktopModules\MegaForm\Assets"
$FIX21_DNN = Join-Path $SCRIPT_DIR "fix21_src\DesktopModules\MegaForm\Assets"
$FIX21_WEB = Join-Path $SCRIPT_DIR "fix21_src\MegaForm.Web\wwwroot\megaform"
$FIX21_OQTANE = Join-Path $SCRIPT_DIR "fix21_src\MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm"

$SYNC_TARGETS = @(
    @{ Label = "DesktopModules"; Root = $DNN_DESKTOP; Enabled = $true },
    @{ Label = "Web";            Root = $WWWROOT;     Enabled = $true },
    @{ Label = "Oqtane";         Root = $OQTANE;      Enabled = $true },
    @{ Label = "fix21_src DNN";  Root = $FIX21_DNN;   Enabled = (Test-Path (Split-Path $FIX21_DNN -Parent)) },
    @{ Label = "fix21_src Web";  Root = $FIX21_WEB;   Enabled = (Test-Path (Split-Path $FIX21_WEB -Parent)) },
    @{ Label = "fix21_src Oqtane"; Root = $FIX21_OQTANE; Enabled = (Test-Path (Split-Path $FIX21_OQTANE -Parent)) }
)

foreach ($target in $SYNC_TARGETS) {
    if (-not $target.Enabled) { continue }

    $dest  = $target.Root
    $label = $target.Label
    Write-Host "  -- $label --" -ForegroundColor Cyan

    @("$dest\js","$dest\js\builder","$dest\js\bundles",
      "$dest\js\plugins","$dest\js\locales",
      "$dest\css","$dest\css\plugins") | ForEach-Object {
        if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
    }

    # JS root
    $f = Get-ChildItem "$ASSETS_JS\*.js" -EA SilentlyContinue
    if ($f) {
        $f | Copy-Item -Destination "$dest\js\" -Force
        Write-Host "    [OK] $($f.Count) root JS" -ForegroundColor Green
    }

    # JS builder — *.js va *.css (reactflow.min.css, v.v.)
    $f = Get-ChildItem "$ASSETS_JS\builder\*" -File -EA SilentlyContinue
    if ($f) {
        $f | Copy-Item -Destination "$dest\js\builder\" -Force
        Write-Host "    [OK] $($f.Count) builder files (JS + CSS)" -ForegroundColor Green
    }

    # Bundles
    $f = Get-ChildItem "$ASSETS_JS\bundles\*" -File -EA SilentlyContinue
    if ($f) {
        $f | Copy-Item -Destination "$dest\js\bundles\" -Force
        Write-Host "    [OK] $($f.Count) bundles" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] No bundles found" -ForegroundColor Yellow
    }

    # Plugins JS
    if (Test-Path "$ASSETS_JS\plugins") {
        xcopy /y /s /q "$ASSETS_JS\plugins\*" "$dest\js\plugins\" | Out-Null
        $pluginCount = (Get-ChildItem "$ASSETS_JS\plugins" -File -EA SilentlyContinue).Count
        Write-Host "    [OK] plugins JS ($pluginCount files)" -ForegroundColor Green
    }

    # Locales
    if (Test-Path "$ASSETS_JS\locales") {
        xcopy /y /s /q "$ASSETS_JS\locales\*" "$dest\js\locales\" | Out-Null
        $localeCount = (Get-ChildItem "$ASSETS_JS\locales" -File -EA SilentlyContinue).Count
        Write-Host "    [OK] locales ($localeCount files)" -ForegroundColor Green
    }

    # CSS root
    $f = Get-ChildItem "$ASSETS_CSS\*.css" -EA SilentlyContinue
    if ($f) {
        $f | Copy-Item -Destination "$dest\css\" -Force
        Write-Host "    [OK] $($f.Count) CSS (root)" -ForegroundColor Green
    }

    # CSS plugins
    if (Test-Path "$ASSETS_CSS\plugins") {
        xcopy /y /s /q "$ASSETS_CSS\plugins\*" "$dest\css\plugins\" | Out-Null
        $cssPluginCount = (Get-ChildItem "$ASSETS_CSS\plugins" -File -EA SilentlyContinue).Count
        Write-Host "    [OK] CSS plugins ($cssPluginCount files)" -ForegroundColor Green
    }

    Verify-SyncedFile (Join-Path $ASSETS_JS "megaform-admin-live.js") (Join-Path $dest "js\megaform-admin-live.js") "$label admin-live"
    Verify-SyncedFile (Join-Path $ASSETS_JS "megaform-dnn-host.js") (Join-Path $dest "js\megaform-dnn-host.js") "$label dnn-host"
    Verify-SyncedFile (Join-Path $ASSETS_JS "megaform-renderer.js") (Join-Path $dest "js\megaform-renderer.js") "$label renderer"
    Verify-SyncedFile (Join-Path $ASSETS_JS "megaform-widgets.js") (Join-Path $dest "js\megaform-widgets.js") "$label widgets"
    Verify-SyncedFile (Join-Path $ASSETS_JS "megaform-views.js") (Join-Path $dest "js\megaform-views.js") "$label views"
    Verify-SyncedFile (Join-Path $ASSETS_JS "bundles\megaform-builder.js") (Join-Path $dest "js\bundles\megaform-builder.js") "$label builder"
    Verify-SyncedFile (Join-Path $ASSETS_JS "plugins\megaform-widget-captcha.js") (Join-Path $dest "js\plugins\megaform-widget-captcha.js") "$label captcha"
    Verify-SyncedFile (Join-Path $ASSETS_JS "plugins\megaform-widget-appointment.js") (Join-Path $dest "js\plugins\megaform-widget-appointment.js") "$label appointment"
    Verify-SyncedFile (Join-Path $ASSETS_JS "plugins\megaform-widget-phone-pro.js") (Join-Path $dest "js\plugins\megaform-widget-phone-pro.js") "$label phone-pro"
    Verify-SyncedFile (Join-Path $ASSETS_JS "plugins\megaform-widget-qrcode.js") (Join-Path $dest "js\plugins\megaform-widget-qrcode.js") "$label qrcode"
    Verify-SyncedFile (Join-Path $ASSETS_JS "plugins\megaform-widget-grid-repeater.js") (Join-Path $dest "js\plugins\megaform-widget-grid-repeater.js") "$label grid-repeater"
    Verify-SyncedFile (Join-Path $ASSETS_JS "megaform-builder-loader.js") (Join-Path $dest "js\megaform-builder-loader.js") "$label builder-loader"
    Verify-SyncedFile (Join-Path $ASSETS_CSS "megaform-admin-live.css") (Join-Path $dest "css\megaform-admin-live.css") "$label admin-live-css"
}

# -- Summary
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Hoan thanh!" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

Get-ChildItem "$ASSETS_JS\bundles\*.js" -EA SilentlyContinue |
    Where-Object { $_.Name -notlike "*.map" } |
    Sort-Object Name |
    ForEach-Object { Write-Host ("  {0,-42} {1,7:N1} KB" -f $_.Name, ($_.Length/1024)) -ForegroundColor Cyan }

if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "  THAT BAI: $($failed -join ', ')" -ForegroundColor Red
}

Write-Host ""
Write-Host "  DNN       -> DesktopModules\MegaForm\Assets\ (synced from Assets\)" -ForegroundColor Gray
Write-Host "  Web       -> MegaForm.Web\wwwroot\megaform\js\" -ForegroundColor Gray
Write-Host "  Oqtane    -> MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\js\" -ForegroundColor Gray
Write-Host ""
if (-not $NoPause) { Read-Host "Enter de dong" }
