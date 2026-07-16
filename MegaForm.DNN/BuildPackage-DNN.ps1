# ============================================================
#  MegaForm.DNN - DNN Install Package Creator
#
#  Tao file Install ZIP cai dat qua DNN Host > Extensions.
#  Chay: powershell -ExecutionPolicy Bypass -File BuildPackage-DNN.ps1
#
#  Mac dinh script nay co the tu build TypeScript + dotnet build
#  truoc khi package khi duoc goi tu BuildPackage-DNN.bat.
# ============================================================

[CmdletBinding()]
param(
    [switch]$BuildTS,
    [switch]$BuildDotNet,
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$MODULE_NAME  = 'MegaForm'
# [DNN sync 2026-06-22] Bumped from stale 01.05.00 → 01.06.32 to match the manifest + latest
# SqlDataProvider scripts. Keep this in lockstep with MegaForm.dnn <package version="...">.
$VERSION      = '01.07.106'
$PROJECT_DIR  = Split-Path -Parent $MyInvocation.MyCommand.Path
$SOLUTION_DIR = Split-Path -Parent $PROJECT_DIR
$STAGING      = Join-Path $PROJECT_DIR '_package'
$RESOURCES    = Join-Path $STAGING '_resources'
$OUTPUT_DIR   = Join-Path $PROJECT_DIR 'Install'
$OUTPUT_ZIP   = Join-Path $OUTPUT_DIR "${MODULE_NAME}_${VERSION}_Install.zip"
$ROOT_BUILDTS_BAT = Join-Path $SOLUTION_DIR 'BuildTS.bat'
$DNN_CSPROJ       = Join-Path $PROJECT_DIR 'MegaForm.DNN.csproj'

function Assert-CommandAvailable {
    param(
        [Parameter(Mandatory = $true)][string]$CommandName,
        [Parameter(Mandatory = $true)][string]$FriendlyName
    )
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "$FriendlyName khong tim thay trong PATH."
    }
}

function Assert-RequiredFile {
    param(
        [Parameter(Mandatory = $true)][string]$PathToCheck,
        [Parameter(Mandatory = $true)][string]$Label
    )
    if (-not (Test-Path $PathToCheck)) {
        throw "Thieu file bat buoc: $Label -> $PathToCheck"
    }
    Write-Host "  [OK] $Label" -ForegroundColor Green
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )
    Write-Host $Title -ForegroundColor Yellow
    & $Action
    Write-Host ''
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host "  $MODULE_NAME - DNN Install Package v$VERSION" -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

# ============================================================
#  0. Pre-build (optional but enabled by BuildPackage-DNN.bat)
# ============================================================
if ($BuildTS) {
    Invoke-Step '[0/7] Build TypeScript bundles...' {
        Assert-CommandAvailable -CommandName 'powershell' -FriendlyName 'PowerShell'
        if (-not (Test-Path $ROOT_BUILDTS_BAT)) {
            throw "Khong tim thay BuildTS.bat tai root solution: $ROOT_BUILDTS_BAT"
        }
        & $ROOT_BUILDTS_BAT
        if ($LASTEXITCODE -ne 0) {
            throw "BuildTS.bat that bai voi ma loi $LASTEXITCODE"
        }
    }
}

if ($BuildDotNet) {
    Invoke-Step "[0b/7] Build MegaForm.DNN ($Configuration)..." {
        Assert-CommandAvailable -CommandName 'dotnet' -FriendlyName '.NET SDK'
        if (-not (Test-Path $DNN_CSPROJ)) {
            throw "Khong tim thay csproj: $DNN_CSPROJ"
        }
        dotnet build $DNN_CSPROJ -c $Configuration
        if ($LASTEXITCODE -ne 0) {
            throw "dotnet build MegaForm.DNN that bai voi ma loi $LASTEXITCODE"
        }
    }
}

# ============================================================
#  1. Tim DLL
# ============================================================
Write-Host '[1/7] Tim DLLs...' -ForegroundColor Yellow

$dnnDllPaths = @(
    "$PROJECT_DIR\bin\$Configuration\net472\MegaForm.DNN.dll",
    "$PROJECT_DIR\bin\$Configuration\MegaForm.DNN.dll",
    "$PROJECT_DIR\bin\Release\net472\MegaForm.DNN.dll",
    "$PROJECT_DIR\bin\Debug\net472\MegaForm.DNN.dll",
    "$PROJECT_DIR\bin\Release\MegaForm.DNN.dll",
    "$PROJECT_DIR\bin\Debug\MegaForm.DNN.dll"
)
$dnnDll = $null
foreach ($p in $dnnDllPaths) {
    if (Test-Path $p) { $dnnDll = $p; break }
}
if (-not $dnnDll) {
    throw 'MegaForm.DNN.dll khong tim thay! Hay build truoc: dotnet build -c Release'
}
Write-Host "  MegaForm.DNN.dll: $dnnDll" -ForegroundColor Green

$coreDll = Join-Path (Split-Path $dnnDll) 'MegaForm.Core.dll'
if (-not (Test-Path $coreDll)) {
    $coreDll = @(
        "$SOLUTION_DIR\MegaForm.Core\bin\$Configuration\net472\MegaForm.Core.dll",
        "$SOLUTION_DIR\MegaForm.Core\bin\Release\net472\MegaForm.Core.dll",
        "$SOLUTION_DIR\MegaForm.Core\bin\Debug\net472\MegaForm.Core.dll"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $coreDll -or -not (Test-Path $coreDll)) {
    throw 'MegaForm.Core.dll khong tim thay! Build Core/DNN truoc khi package.'
}
Write-Host "  MegaForm.Core.dll: $coreDll" -ForegroundColor Green

# [2026-06-23] MegaForm.Sdk.dll — DnnServiceLocator..ctor() loads it; omitting it from
# the package broke FormsOverview / Reports / scheduler tasks at runtime. Bundle it.
$sdkDll = Join-Path (Split-Path $dnnDll) 'MegaForm.Sdk.dll'
if (-not (Test-Path $sdkDll)) {
    $sdkDll = @(
        "$SOLUTION_DIR\MegaForm.Sdk\bin\$Configuration\net472\MegaForm.Sdk.dll",
        "$SOLUTION_DIR\MegaForm.Sdk\bin\Release\net472\MegaForm.Sdk.dll",
        "$SOLUTION_DIR\MegaForm.Sdk\bin\Debug\net472\MegaForm.Sdk.dll"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $sdkDll -or -not (Test-Path $sdkDll)) {
    throw 'MegaForm.Sdk.dll khong tim thay! Build Sdk/Core/DNN truoc khi package.'
}
Write-Host "  MegaForm.Sdk.dll: $sdkDll" -ForegroundColor Green

$dapperDll = Join-Path (Split-Path $dnnDll) 'Dapper.dll'
Write-Host ''

# ============================================================
#  2. Don dep + tao thu muc
# ============================================================
Write-Host '[2/7] Chuan bi thu muc...' -ForegroundColor Yellow

if (Test-Path $STAGING) { Remove-Item $STAGING -Recurse -Force }

@(
    $STAGING, "$STAGING\bin", "$STAGING\SqlScripts",
    "$RESOURCES\Views",
    "$RESOURCES\Assets\css", "$RESOURCES\Assets\css\plugins",
    "$RESOURCES\Assets\js", "$RESOURCES\Assets\js\builder",
    "$RESOURCES\Assets\js\bundles",
    "$RESOURCES\Assets\js\plugins", "$RESOURCES\Assets\js\locales",
    "$RESOURCES\Assets\Images", "$RESOURCES\Samples",
    "$RESOURCES\Images",
    $OUTPUT_DIR
) | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}

# ============================================================
#  2b. TypeScript bundles / workflow assets verification
# ============================================================
$bundlesDir = Join-Path $SOLUTION_DIR 'Assets\js\bundles'
$builderDir = Join-Path $SOLUTION_DIR 'Assets\js\builder'
if (-not (Test-Path $bundlesDir)) {
    throw "Assets\js\bundles\ khong tim thay - can chay BuildTS.bat truoc khi package."
}
$bundleCount = (Get-ChildItem "$bundlesDir\*.js" -ErrorAction SilentlyContinue).Count
Write-Host "[2b] Found $bundleCount TS bundles in Assets\js\bundles\" -ForegroundColor Green
Assert-RequiredFile -PathToCheck (Join-Path $bundlesDir 'megaform-builder.js') -Label 'Builder bundle'
Assert-RequiredFile -PathToCheck (Join-Path $SOLUTION_DIR 'Assets\js\megaform-builder-loader.js') -Label 'Builder loader'
Assert-RequiredFile -PathToCheck (Join-Path $SOLUTION_DIR 'Assets\js\plugins\megaform-widget-qrcode.js') -Label 'QRCode plugin'
Assert-RequiredFile -PathToCheck (Join-Path $SOLUTION_DIR 'Assets\js\megaform-dashboard.js') -Label 'Dashboard bundle'
Assert-RequiredFile -PathToCheck (Join-Path $builderDir 'megaform-workflow-reactflow.js') -Label 'Workflow canvas bundle'
Assert-RequiredFile -PathToCheck (Join-Path $builderDir 'react.production.min.js') -Label 'React runtime'
Assert-RequiredFile -PathToCheck (Join-Path $builderDir 'react-dom.production.min.js') -Label 'ReactDOM runtime'
Assert-RequiredFile -PathToCheck (Join-Path $builderDir 'reactflow.min.js') -Label 'ReactFlow runtime'
Assert-RequiredFile -PathToCheck (Join-Path $builderDir 'reactflow.min.css') -Label 'ReactFlow CSS'
Write-Host ''

# ============================================================
#  3. Copy files
# ============================================================
Write-Host '[3/7] Copy files...' -ForegroundColor Yellow

Copy-Item "$PROJECT_DIR\MegaForm.dnn" "$STAGING\" -Force
Write-Host '  + MegaForm.dnn'

# [DNN sync 2026-06-22] icon.gif is declared in the manifest's <component type="File"> at the
# package root but was never copied/zipped — add it so the install matches the manifest.
$iconSrc = @("$PROJECT_DIR\Images\icon.gif", "$PROJECT_DIR\Install\icon.gif", "$PROJECT_DIR\icon.gif") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if ($iconSrc) {
    Copy-Item $iconSrc "$STAGING\icon.gif" -Force
    Write-Host '  + icon.gif'
}

# [ModuleIcon v20260716-01] The manifest's <iconFile> points at
# ~/DesktopModules/MegaForm/Images/module-icon.png, and the DB Packages.IconFile row matches —
# but the Images folder was never shipped in Resources.zip, so installed sites 404 the icon and
# the Add-Module list shows MegaForm without one (owner report). Ship the module Images folder.
foreach ($img in @("$PROJECT_DIR\Images\module-icon.png", "$PROJECT_DIR\Images\icon.gif")) {
    if (Test-Path $img) {
        Copy-Item $img "$RESOURCES\Images\" -Force
        Write-Host ('  + Images\' + (Split-Path $img -Leaf))
    }
}

if (Test-Path "$PROJECT_DIR\License.txt") {
    Copy-Item "$PROJECT_DIR\License.txt" "$STAGING\" -Force
} else {
    "MegaForm Module for DNN`r`nCopyright (c) 2025. All rights reserved.`r`nMIT License" | Out-File "$STAGING\License.txt" -Encoding UTF8
}

if (Test-Path "$PROJECT_DIR\ReleaseNotes.txt") {
    Copy-Item "$PROJECT_DIR\ReleaseNotes.txt" "$STAGING\" -Force
} else {
    $releaseNotes = @'
<h3>MegaForm v1.5.0</h3>
<ul>
  <li>Architecture: Split into MegaForm.Core + MegaForm.DNN</li>
  <li>Row/Column layout support in builder and public view</li>
  <li>Workflows, Permissions, Views, Templates (Phase 2)</li>
  <li>Webhook with HMAC-SHA256 signatures</li>
  <li>Anti-spam: honeypot + rate limit + heuristic scoring</li>
  <li>Save and Continue with resume tokens</li>
  <li>18+ field types, drag-and-drop builder</li>
  <li>TypeScript UI bundles for cross-platform support</li>
</ul>
'@
    $releaseNotes | Out-File "$STAGING\ReleaseNotes.txt" -Encoding UTF8
}

Copy-Item $dnnDll "$STAGING\bin\" -Force
Write-Host '  + bin\MegaForm.DNN.dll'
Copy-Item $coreDll "$STAGING\bin\" -Force
Write-Host '  + bin\MegaForm.Core.dll'
Copy-Item $sdkDll "$STAGING\bin\" -Force
Write-Host '  + bin\MegaForm.Sdk.dll'
if ($dapperDll -and (Test-Path $dapperDll)) {
    Copy-Item $dapperDll "$STAGING\bin\" -Force
    Write-Host '  + bin\Dapper.dll'
}

# [DNN sync 2026-06-22] DNN scripts are *.SqlDataProvider (not *.sql); the old `*.sql` glob copied
# ZERO scripts so installs/upgrades shipped no schema. Copy both extensions.
Get-ChildItem "$PROJECT_DIR\SqlScripts\*" -Include *.SqlDataProvider, *.sql -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName "$STAGING\SqlScripts\" -Force
    Write-Host "  + SqlScripts\$($_.Name)"
}

Get-ChildItem "$PROJECT_DIR\Views\*.ascx" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName "$RESOURCES\Views\" -Force
    Write-Host "  + Views\$($_.Name)"
}

$assetsDir = "$SOLUTION_DIR\Assets"
if (-not (Test-Path $assetsDir)) {
    $assetsDir = "$PROJECT_DIR\Assets"
}
if (-not (Test-Path $assetsDir)) {
    throw 'Assets\ khong tim thay!'
}

Get-ChildItem "$assetsDir\css\*.css" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName "$RESOURCES\Assets\css\" -Force
    Write-Host "  + Assets\css\$($_.Name)"
}
if (Test-Path "$assetsDir\css\plugins") {
    Get-ChildItem "$assetsDir\css\plugins\*" -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Replace("$assetsDir\css\plugins\", '')
        $destDir = Join-Path "$RESOURCES\Assets\css\plugins" (Split-Path $rel)
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item $_.FullName (Join-Path "$RESOURCES\Assets\css\plugins" $rel) -Force
    }
    Write-Host '  + Assets\css\plugins\*'
}

Get-ChildItem "$assetsDir\js\*.js" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName "$RESOURCES\Assets\js\" -Force
    Write-Host "  + Assets\js\$($_.Name)"
}

if (Test-Path "$assetsDir\js\builder") {
    Get-ChildItem "$assetsDir\js\builder\*" -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Replace("$assetsDir\js\builder\", '')
        $destDir = Join-Path "$RESOURCES\Assets\js\builder" (Split-Path $rel)
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item $_.FullName (Join-Path "$RESOURCES\Assets\js\builder" $rel) -Force
        Write-Host "  + Assets\js\builder\$rel" -ForegroundColor Cyan
    }
}

if (Test-Path "$assetsDir\js\bundles") {
    Get-ChildItem "$assetsDir\js\bundles\*" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.FullName "$RESOURCES\Assets\js\bundles\" -Force
        Write-Host "  + Assets\js\bundles\$($_.Name)" -ForegroundColor Magenta
    }
}

if (Test-Path "$assetsDir\js\plugins") {
    Get-ChildItem "$assetsDir\js\plugins\*" -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Replace("$assetsDir\js\plugins\", '')
        $destDir = Join-Path "$RESOURCES\Assets\js\plugins" (Split-Path $rel)
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item $_.FullName (Join-Path "$RESOURCES\Assets\js\plugins" $rel) -Force
    }
    Write-Host '  + Assets\js\plugins\*'
}

if (Test-Path "$assetsDir\js\locales") {
    Get-ChildItem "$assetsDir\js\locales\*" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.FullName "$RESOURCES\Assets\js\locales\" -Force
    }
    Write-Host '  + Assets\js\locales\*'
}

# [i18n language packs 2026-07-09] EXPLICIT + ROBUST copy of the 39 locale JSON files
# (+ index.json). These feed BOTH the Languages admin panel (MegaFormApiController.List
# enumerates these folders) AND runtime lazy-loading of non-English locales. The API
# ResolveI18nFolders() probes, in order: Assets/js/i18n, Assets/i18n, Assets/js/builder/i18n,
# Assets/js/bundles/i18n. Previously ONLY builder/i18n rode in via the recursive builder copy
# (which was intermittently dropping the subfolder → a fresh install shipped ZERO languages,
# Languages panel showed only the en-US baseline). Copy to ALL THREE js locations explicitly so
# a locale is found no matter which probe path the host resolves first. Flat folders (40 files).
foreach ($i18nSub in @('i18n', 'builder\i18n', 'bundles\i18n')) {
    $i18nSrc = Join-Path "$assetsDir\js" $i18nSub
    if (Test-Path $i18nSrc) {
        $i18nDst = Join-Path "$RESOURCES\Assets\js" $i18nSub
        New-Item -ItemType Directory -Path $i18nDst -Force | Out-Null
        $n = 0
        Get-ChildItem "$i18nSrc\*.json" -File -ErrorAction SilentlyContinue | ForEach-Object {
            Copy-Item $_.FullName $i18nDst -Force; $n++
        }
        Write-Host "  + Assets\js\$i18nSub\*.json  ($n language files)" -ForegroundColor Green
    }
}

Get-ChildItem "$assetsDir\embed*.html" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName "$RESOURCES\Assets\" -Force
    Write-Host "  + Assets\$($_.Name)"
}

if (Test-Path "$assetsDir\themes") {
    New-Item -ItemType Directory -Path "$RESOURCES\Assets\themes" -Force | Out-Null
    Get-ChildItem "$assetsDir\themes\*" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.FullName "$RESOURCES\Assets\themes\" -Force
    }
    Write-Host '  + Assets\themes\*'
}

# [DNN pack 2026-07-08] Runtime dirs the code reads but the script never shipped:
#  - Assets\img (megaform-ai-bear.png + flags/ for phone country picker)
#  - Resources\PromptRecipes + Resources\TemplateGuides (AiToolsController reads
#    ~/DesktopModules/MegaForm/Resources/...)
#  - Templates (BuilderTemplateCatalogService data root — seed the builder gallery)
if (Test-Path "$assetsDir\img") {
    New-Item -ItemType Directory -Path "$RESOURCES\Assets\img" -Force | Out-Null
    Get-ChildItem "$assetsDir\img\*" -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Replace("$assetsDir\img\", '')
        $destDir = Join-Path "$RESOURCES\Assets\img" (Split-Path $rel)
        if ($destDir -and -not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item $_.FullName (Join-Path "$RESOURCES\Assets\img" $rel) -Force
    }
    Write-Host '  + Assets\img\* (bear + flags)'
}
foreach ($resSub in @('PromptRecipes', 'TemplateGuides')) {
    $src = Join-Path $PROJECT_DIR "Resources\$resSub"
    if (Test-Path $src) {
        $dst = Join-Path $RESOURCES "Resources\$resSub"
        New-Item -ItemType Directory -Path $dst -Force | Out-Null
        Copy-Item "$src\*" $dst -Recurse -Force
        Write-Host "  + Resources\$resSub\*"
    }
}
# [2026-07-09] Gallery seed = curated DONEE premium set (user direction: replace golf/pdf defaults).
$tplSrc = Join-Path $SOLUTION_DIR 'Samples\FormTemplates\Premium\DONEE'
if (Test-Path $tplSrc) {
    New-Item -ItemType Directory -Path "$RESOURCES\Templates" -Force | Out-Null
    Copy-Item "$tplSrc\*" "$RESOURCES\Templates\" -Recurse -Force
    Write-Host '  + Templates\* (builder gallery seed)'
}

$samplesDir = "$SOLUTION_DIR\Samples"
if (-not (Test-Path $samplesDir)) { $samplesDir = "$PROJECT_DIR\Samples" }
if (Test-Path $samplesDir) {
    Copy-Item "$samplesDir\*" "$RESOURCES\Samples\" -Force -ErrorAction SilentlyContinue
    Write-Host '  + Samples\*'
}

if (Test-Path "$PROJECT_DIR\license.lic") {
    Copy-Item "$PROJECT_DIR\license.lic" "$RESOURCES\license.lic" -Force
    Write-Host '  + license.lic'
}

Write-Host ''
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\bundles\megaform-builder.js') -Label 'Packaged builder bundle'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\megaform-builder-loader.js') -Label 'Packaged builder loader'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\plugins\megaform-widget-qrcode.js') -Label 'Packaged QRCode plugin'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\megaform-dashboard.js') -Label 'Packaged dashboard bundle'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\builder\megaform-workflow-reactflow.js') -Label 'Packaged workflow canvas bundle'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\builder\react.production.min.js') -Label 'Packaged React runtime'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\builder\react-dom.production.min.js') -Label 'Packaged ReactDOM runtime'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\builder\reactflow.min.js') -Label 'Packaged ReactFlow runtime'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\builder\reactflow.min.css') -Label 'Packaged ReactFlow CSS'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\builder\i18n\index.json') -Label 'Packaged i18n locale index'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\builder\i18n\en-US.json') -Label 'Packaged English locale'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\builder\i18n\vi-VN.json') -Label 'Packaged Vietnamese locale'
# Canonical Assets/js/i18n (MegaFormApiController.List probes this FIRST) — guard the explicit copy.
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\i18n\index.json') -Label 'Packaged i18n (js/i18n) index'
Assert-RequiredFile -PathToCheck (Join-Path $RESOURCES 'Assets\js\i18n\fr-FR.json') -Label 'Packaged i18n (js/i18n) French'
$__i18nCount = (Get-ChildItem (Join-Path $RESOURCES 'Assets\js\i18n\*.json') -File -ErrorAction SilentlyContinue | Measure-Object).Count
if ($__i18nCount -lt 39) { throw "Thieu language packs: chi co $__i18nCount/40 file trong Assets\js\i18n (expected 39 locales + index.json)" }
Write-Host "  [OK] Language packs: $__i18nCount files in Assets\js\i18n" -ForegroundColor Green
Write-Host ''

# ============================================================
#  4. Kiem tra Resources
# ============================================================
Write-Host '[4/7] Kiem tra Resources...' -ForegroundColor Yellow
$allRes = Get-ChildItem $RESOURCES -Recurse -File
Write-Host "  Tong files: $($allRes.Count)" -ForegroundColor Green
Write-Host ''

# ============================================================
#  5. Tao Resources.zip + Install ZIP
# ============================================================
Write-Host '[5/7] Tao Resources.zip...' -ForegroundColor Yellow

Add-Type -AssemblyName System.IO.Compression.FileSystem

$resourcesZip = Join-Path $STAGING 'Resources.zip'
if (Test-Path $resourcesZip) { Remove-Item $resourcesZip -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($RESOURCES, $resourcesZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
Write-Host '  + Resources.zip [OK]' -ForegroundColor Green
Write-Host ''

Write-Host '[6/7] Tao Install Package...' -ForegroundColor Yellow

if (Test-Path $OUTPUT_ZIP) { Remove-Item $OUTPUT_ZIP -Force }

$zip = [System.IO.Compression.ZipFile]::Open($OUTPUT_ZIP, 'Create')

@('MegaForm.dnn', 'License.txt', 'ReleaseNotes.txt', 'icon.gif', 'Resources.zip') | ForEach-Object {
    $fp = Join-Path $STAGING $_
    if (Test-Path $fp) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $fp, $_) | Out-Null
    }
}

Get-ChildItem "$STAGING\bin" -File | ForEach-Object {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, "bin/$($_.Name)") | Out-Null
}

Get-ChildItem "$STAGING\SqlScripts" -File | ForEach-Object {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, "SqlScripts/$($_.Name)") | Out-Null
}

$zip.Dispose()

# ============================================================
#  7. Don dep + Ket qua
# ============================================================
Write-Host '[7/7] Don dep...' -ForegroundColor Yellow
Remove-Item $STAGING -Recurse -Force

$zipSize = [math]::Round((Get-Item $OUTPUT_ZIP).Length / 1KB, 1)
Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host '  HOAN THANH!' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Write-Host ''
Write-Host "  File: $OUTPUT_ZIP" -ForegroundColor White
Write-Host "  Size: ${zipSize} KB" -ForegroundColor White
Write-Host ''
Write-Host '  Package chua:' -ForegroundColor Gray
Write-Host "    MegaForm.dnn               (manifest v$VERSION)" -ForegroundColor Gray
Write-Host '    bin\MegaForm.DNN.dll       (DNN module)' -ForegroundColor Cyan
Write-Host '    bin\MegaForm.Core.dll      (Core shared library)' -ForegroundColor Cyan
Write-Host '    SqlScripts\*.sql' -ForegroundColor Gray
Write-Host '    Resources.zip              (Views + Assets)' -ForegroundColor Gray
Write-Host ''
Write-Host '  Cai dat: DNN -> Host -> Extensions -> Install Extension' -ForegroundColor Yellow
Write-Host ''
if (-not $NoPause) {
    Read-Host 'Nhan Enter de thoat'
}
