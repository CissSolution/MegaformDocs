<#
    [GalleryPublish v20260801] One command to put templates in front of every install.

    Pipeline: pull the gallery clone -> rebuild it from this repo -> commit -> push.
    GitHub Pages redeploys itself on push and serves with max-age=600, so there is no
    purge step and nothing to invalidate; the last stage here just waits for the live
    manifest to match what was built, so "published" is measured rather than assumed.

    Why the build does not run in CI: build-gallery.mjs resolves template artwork from
    Assets/img, and .gitignore excludes *.png - roughly 287 images are not in git. A
    runner cloning this repo would produce a gallery with missing artwork, so the build
    belongs on a machine that has the images.

    Guards, each of which is a mistake that has already happened or nearly happened:
      - the clone must point at the gallery remote (never publish into the wrong repo)
      - pull --ff-only first: the local clone was found at 523aae7 with 35 templates
        while GitHub had 60b59e9 with 47, so a blind rebuild would have deleted 12
      - a drop in template count aborts unless -Force, for the same reason
      - the working tree must be clean before the rebuild, or the diff shown at the end
        is not the diff being published

    Usage:
      .\tools\gallery\Publish-Gallery.ps1 -Message "add three euroyouth templates"
      .\tools\gallery\Publish-Gallery.ps1 -WhatIfOnly      # build + diff, no commit/push
#>
[CmdletBinding()]
param(
    # Two clones exist on this machine and BOTH were behind origin when this was written
    # (this one at 01f8388/44 templates, E:\_megaform_gallery_repo at 523aae7/35, origin at
    # 60b59e9/47). This is the one the runbook uses; the other is a stale duplicate.
    [string]$Clone   = 'E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\megaform-gallery',
    [string]$Src     = '',
    [string]$Message = '',
    [string]$LiveUrl = 'https://CissSolution.github.io/megaform-gallery',
    [switch]$Force,
    [switch]$WhatIfOnly,
    [int]$VerifyTimeoutSec = 420
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 can still negotiate TLS 1.0 by default, which github.io refuses.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if ([string]::IsNullOrWhiteSpace($Src)) {
    $Src = Join-Path $repoRoot 'Samples\FormTemplates\Premium\GALLERY-PUBLISHED'
}

function Fail([string]$m) { Write-Host "ABORT: $m" -ForegroundColor Red; exit 1 }
function Step([string]$m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function CountTemplates([string]$dir) {
    $t = Join-Path $dir 'templates'
    if (-not (Test-Path $t)) { return 0 }
    return @(Get-ChildItem -Path $t -Filter '*.json' -File).Count
}

# -- 1. the clone is what we think it is ----------------------------------------
Step 'Checking the gallery clone'
if (-not (Test-Path $Clone))          { Fail "Clone not found: $Clone" }
if (-not (Test-Path (Join-Path $Clone '.git'))) { Fail "$Clone is not a git repository." }

$remote = & git -C $Clone remote get-url origin
if ($LASTEXITCODE -ne 0)              { Fail "Cannot read the remote of $Clone." }
if ($remote -notmatch 'megaform-gallery') {
    Fail "Remote is '$remote' - that is not the gallery repository. Refusing to publish."
}

$dirty = & git -C $Clone status --porcelain
if ($dirty) {
    Write-Host $dirty
    Fail "The clone has uncommitted changes. Commit or discard them first, so the diff below is the diff being published."
}
Write-Host "  remote : $remote"

# -- 2. pull before rebuilding, or publish the past -----------------------------
Step 'Pulling'
& git -C $Clone pull --ff-only
if ($LASTEXITCODE -ne 0) { Fail 'pull --ff-only failed. Reconcile the clone by hand before publishing.' }

$before = CountTemplates $Clone
Write-Host "  templates before : $before"

# -- 3. rebuild -----------------------------------------------------------------
Step 'Building the gallery'
if (-not (Test-Path $Src)) { Fail "Template source not found: $Src" }
# --base only gets recorded into gallery-exclude.json (packaging reads bundledFiles/images from
# there, not this), but a stale URL in a generated record is how the jsDelivr note outlived the
# jsDelivr decision. Pass the real one.
& node (Join-Path $repoRoot 'tools\gallery\build-gallery.mjs') --out $Clone --src $Src --base "$LiveUrl/"
if ($LASTEXITCODE -ne 0) { Fail 'build-gallery.mjs failed. The clone may be half-written - inspect it before retrying.' }

$after = CountTemplates $Clone
Write-Host "  templates after  : $after"

if ($after -lt $before -and -not $Force) {
    Write-Host ''
    Write-Host "The rebuild produced FEWER templates than the repo already had ($before -> $after)." -ForegroundColor Yellow
    Write-Host 'That usually means the source folder is incomplete, not that templates were retired.'
    Write-Host "Restore with:  git -C `"$Clone`" reset --hard origin/main"
    Write-Host 'Re-run with -Force only if the removal is deliberate.'
    Fail 'Refusing to publish a net deletion.'
}

# -- 4. what actually changed ---------------------------------------------------
Step 'Changes to publish'
& git -C $Clone add -A
$staged = & git -C $Clone status --porcelain
if (-not $staged) { Write-Host '  nothing changed - the gallery is already up to date.'; exit 0 }
& git -C $Clone diff --cached --stat

if ($WhatIfOnly) {
    Write-Host "`n-WhatIfOnly: stopping before commit. Undo with: git -C `"$Clone`" reset --hard origin/main" -ForegroundColor Yellow
    exit 0
}

# -- 5. publish -----------------------------------------------------------------
Step 'Committing and pushing'
if ([string]::IsNullOrWhiteSpace($Message)) { $Message = "Publish gallery ($after templates)" }
& git -C $Clone commit -m $Message
if ($LASTEXITCODE -ne 0) { Fail 'commit failed.' }
& git -C $Clone push
if ($LASTEXITCODE -ne 0) { Fail 'push failed - nothing is live yet; the commit is still local.' }

# -- 6. verify it is actually serving, rather than assume -----------------------
Step 'Waiting for GitHub Pages to serve the new manifest'
$builtStamp = (Get-Content -Raw -Path (Join-Path $Clone 'manifest.json') | ConvertFrom-Json).generatedUtc
Write-Host "  built generatedUtc : $builtStamp"

$deadline = (Get-Date).AddSeconds($VerifyTimeoutSec)
$live = $null
while ((Get-Date) -lt $deadline) {
    try {
        # Pages caches for 600s; the cache-buster asks the edge for the current object.
        $live = Invoke-RestMethod -Uri "$LiveUrl/manifest.json?cb=$([guid]::NewGuid().ToString('N'))" -TimeoutSec 20
    } catch {
        $live = $null
    }
    if ($null -ne $live -and $live.generatedUtc -eq $builtStamp) {
        Write-Host "  LIVE: $($live.templates.Count) templates at $LiveUrl" -ForegroundColor Green
        exit 0
    }
    Start-Sleep -Seconds 15
}

Write-Host ''
Write-Host "Pushed, but the live manifest still does not match after $VerifyTimeoutSec s." -ForegroundColor Yellow
if ($null -ne $live) { Write-Host "  live generatedUtc : $($live.generatedUtc)" }
Write-Host '  Check the Pages deployment for the repository before assuming it shipped.'
exit 2
