# One turn of the convert-and-check loop for a SINGLE template.
#
#   regenerate -> copy the JSON to the site -> re-seed the form -> measure against the mock ->
#   build the side-by-side sheet
#
# No app-pool recycle. BuilderTemplateCatalogStore.List() keys its cache on an mtime fingerprint of
# every template JSON, so overwriting the file invalidates it by itself - the recycle that earlier
# runbooks called for was costing a minute a turn for nothing. DevBulkCreateForms updates the form
# in place, so form ids never move.
#
# ASCII only: PowerShell 5.1 reads a UTF-8-without-BOM .ps1 as ANSI.
#
#   powershell -File tools\browser-qa\iterate-template.ps1 -Slug gold-suite
#   powershell -File tools\browser-qa\iterate-template.ps1 -Slug gold-suite -SkipBuild   (measure only)

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Slug,
  [switch]$SkipBuild,
  [switch]$SkipSeed,
  [string]$Out      = 'qa-out/iter',
  [string]$Site     = 'http://megaclean008.ai',
  [string]$MockBase = 'http://localhost:3000/forms',
  [string]$SiteRoot = 'E:\DNN_SITES\DNN_MegaClean008\Website',
  [string]$User     = 'admin',
  [string]$Pass     = 'dnnhost'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo

# slug -> form id, mock slug, template file, and which generator writes it
$MAP = @{
  'xmas-sale'        = @{ Form = 59; Mock = 'xmas-sale';               Json = 'xmas-sale-euroyouth-application';        Gen = 'build-exact-conversions.mjs'; OurRoot = '.xms-shell' }
  # OurRoot: compare the SAME region on both sides. The email mockup splits its page into two
  # sibling max-width wrappers; the harness anchors the mock on the body wrapper (the one holding
  # the controls), so ours must be anchored on its counterpart rather than on .mfp, which also
  # contains the client chrome and would shift every row below it.
  'xmas-newsletter'  = @{ Form = 58; Mock = 'xmas-newsletter';         Json = 'xmas-newsletter-euroyouth-application';  Gen = 'build-exact-conversions.mjs'; OurRoot = '.xnl-wrap-body' }
  'agency-flyer'     = @{ Form = 57; Mock = 'agency-flyer';            Json = 'agency-flyer-euroyouth-application';     Gen = 'build-exact-conversions.mjs'; OurRoot = '.agf-main' }
  'first-book'       = @{ Form = 61; Mock = 'hotel-concierge';         Json = 'kids-first-book-registration';           Gen = 'build-exact-conversions.mjs'; OurRoot = '.kfb-shell' }
  'gold-suite'       = @{ Form = 60; Mock = 'hotel-suite';             Json = 'gold-suite-membership-application';      Gen = 'build-exact-conversions.mjs'; OurRoot = '.gsu-main' }
  'rose-wellness'    = @{ Form = 62; Mock = 'rose-registration';       Json = 'rose-wellness-registration';             Gen = 'build-exact-conversions.mjs' }
  'newsletter-amber' = @{ Form = 66; Mock = 'newsletter';              Json = 'newsletter-signup-amber';                Gen = 'build-exact-conversions.mjs'; OurRoot = '.nlt-shell' }
  'job-application'  = @{ Form = 65; Mock = 'job-application';         Json = 'job-application-northwind';              Gen = 'build-exact-conversions.mjs'; OurRoot = '.jba-shell' }
  'lagoon-booking'   = @{ Form = 64; Mock = 'hotel-booking';           Json = 'lagoon-reserve-booking';                 Gen = 'build-exact-conversions.mjs'; OurRoot = '.lgn-shell' }
  'product-order'    = @{ Form = 63; Mock = 'product-order';           Json = 'product-order-live-total';               Gen = 'build-exact-conversions.mjs'; OurRoot = '.pdo-shell' }
  'golden-pro'       = @{ Form = 68; Mock = 'golden-pro-registration'; Json = 'golden-pro-agent-registration';          Gen = 'build-exact-conversions.mjs'; OurRoot = '.gpr-shell' }
  'invoice-navy'     = @{ Form = 70; Mock = 'invoice-form';            Json = 'invoice-request-navy-orange';            Gen = 'build-exact-conversions.mjs'; OurRoot = '.inv-shell' }
  'invoice-spinera'  = @{ Form = 71; Mock = 'invoice-spinera';         Json = 'invoice-spinera-blue';                   Gen = 'build-exact-conversions.mjs'; OurRoot = '.spn-shell' }
  'invoice-codexo'   = @{ Form = 69; Mock = 'invoice-codexo';          Json = 'invoice-codexo-cyan';                    Gen = 'build-wizard-conversions.mjs' }
  # --- 2026-08-08: four new mocks, forms seeded fresh (ids 115+) ---
  # Card-to-card roots: the templates no longer carry the mock's page chrome (owner, 08-08), so
  # anchoring on the page wrapper would compare a 768px column against a full-width card.
  'corporate-reg'    = @{ Form = 115; Mock = 'corporate-registration'; Json = 'corporate-registration-blue'; Gen = 'build-exact-conversions.mjs'; MockRoot = '.rounded-2xl'; OurRoot = '.crg-card' }
  'ielts-report'     = @{ Form = 116; Mock = 'ielts-report';           Json = 'ielts-report-classic';       Gen = 'build-exact-conversions.mjs'; MockRoot = '.rounded-lg';  OurRoot = '.iel-card' }
  'massage-intake'   = @{ Form = 117; Mock = 'massage-intake';         Json = 'massage-intake-sage';        Gen = 'build-exact-conversions.mjs'; MockRoot = '.rounded-2xl'; OurRoot = '.msi-card' }
  'massage-body'     = @{ Form = 118; Mock = 'massage-bodychart';      Json = 'massage-bodychart-terracotta'; Gen = 'build-exact-conversions.mjs'; MockRoot = '.rounded-2xl'; OurRoot = '.mbc-card' }
}

if (-not $MAP.ContainsKey($Slug)) { throw "unknown slug '$Slug'. Known: $($MAP.Keys -join ', ')" }
$t = $MAP[$Slug]
$outDir = Join-Path $Out $Slug
$sw = [Diagnostics.Stopwatch]::StartNew()

Write-Host "=== $Slug (form $($t.Form)) vs /forms/$($t.Mock) ===" -ForegroundColor Cyan

if (-not $SkipBuild) {
  Write-Host '-- generate' -ForegroundColor DarkGray
  & node "tools/templates/$($t.Gen)" | Select-String -Pattern $t.Json
  if ($LASTEXITCODE -ne 0) { throw "generator failed: $($t.Gen)" }

  $src = Join-Path $repo "Samples\FormTemplates\Premium\PENDING-REVIEW\$($t.Json).json"
  $dst = Join-Path $SiteRoot "DesktopModules\MegaForm\Templates\$($t.Json).json"
  Copy-Item $src $dst -Force
  Write-Host "-- copied  $((Get-Item $dst).Length) bytes to the site" -ForegroundColor DarkGray
}

if (-not $SkipSeed) {
  Write-Host '-- seed' -ForegroundColor DarkGray
  # dnn-api-post.mjs drives the MACHINE's Chrome; once a user Chrome window is open it attaches to
  # that instance and every call returns "TypeError: Failed to fetch" while curl still gets a
  # normal 401/200 from the same endpoint. The Playwright seeder brings its own browser.
  $log = & node tools/browser-qa/dnn-seed-templates.mjs $Site $User $Pass 2>&1
  $line = $log | Select-String -Pattern 'updated (\d+)' | Select-Object -First 1
  if (-not $line) { $log | Select-Object -Last 6 | ForEach-Object { Write-Host "   $_" }; throw 'seed did not report a result' }
  Write-Host "   $line" -ForegroundColor DarkGray
}

Write-Host '-- measure' -ForegroundColor DarkGray
$extra = @()
if ($t.MockRoot) { $extra += @('--mock-root', $t.MockRoot) }
if ($t.OurRoot)  { $extra += @('--our-root',  $t.OurRoot) }
& node tools/browser-qa/mock-vs-template.mjs `
  --mock "$MockBase/$($t.Mock)" `
  --page "$Site/mfqa-wide?mfFormId=$($t.Form)" `
  --out $outDir @extra | Tee-Object -Variable measured | Out-Null

$report = Join-Path $outDir 'report.json'
if (-not (Test-Path $report)) { $measured | Select-Object -Last 12; throw 'harness produced no report' }
$r = Get-Content $report -Raw | ConvertFrom-Json

# The sheet needs a summary.json shaped like the batch runner's.
$sum = @(@{
  slug = $Slug; form = $t.Form; mock = $t.Mock
  matched = $r.matched; differing = $r.differing; bitmap = $r.bitmap.mismatch
  cardMock = $r.cardWidth.mock; cardOurs = $r.cardWidth.oursNatural
  missingCopy = $r.structure.missingText.Count
})
# WriteAllText with an explicit no-BOM encoder: PowerShell 5.1's -Encoding utf8 emits a BOM and
# JSON.parse rejects it outright.
[IO.File]::WriteAllText(
  (Join-Path (Resolve-Path $Out) 'summary.json'),
  ($sum | ConvertTo-Json -Depth 6),
  (New-Object System.Text.UTF8Encoding $false))
& node tools/browser-qa/make-compare-sheets.mjs --out $Out | Out-Null

$sw.Stop()
Write-Host ''
Write-Host ("matched {0}   differing {1}   pixels {2}%   card {3}px   copy missing {4}" -f `
  $r.matched, $r.differing, $r.bitmap.mismatch, $r.cardWidth.mock, $r.structure.missingText.Count) -ForegroundColor Yellow
Write-Host ("sheet -> {0}\compare.png    ({1:n0}s)" -f $outDir, $sw.Elapsed.TotalSeconds) -ForegroundColor DarkGray

# Top offending properties, so the next edit is aimed rather than guessed.
$byProp = @{}
foreach ($row in $r.rows) { foreach ($d in $row.diffs) { $k = ($d -split ' ')[0]; $byProp[$k] = 1 + [int]$byProp[$k] } }
if ($byProp.Count) {
  Write-Host ''
  ($byProp.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 8 |
    ForEach-Object { "{0} x{1}" -f $_.Key, $_.Value }) -join '   ' | Write-Host
}
if ($r.structure.roleCounts) {
  Write-Host ''
  Write-Host 'structure mock/ours:' -NoNewline
  foreach ($c in $r.structure.roleCounts) { Write-Host ("  {0} {1}/{2}" -f $c.role, $c.mock, $c.ours) -NoNewline }
  Write-Host ''
}
