<#
    [TemplatePages v20260807] One DNN page per template, so each conversion can be reviewed and
    corrected on its own URL instead of being juggled through ?mfFormId= on one shared page.

    Each page is created by cloning an existing page's settings - the Pages API wants a full
    PageSettings object and GetPageDetails is the only reliable way to obtain a valid one - with:
      - the FULL-WIDTH skin. The 2-column QA skin renders the form in a ~510px side pane, and
        nothing rendered there can be compared to a 934px mock.
      - no modules carried over; MegaForm's own AddToPage then drops one module bound to the form.

    Idempotent. A page whose name already exists is reused, and a page that already carries any
    module is left alone, so re-running after adding templates only adds what is missing.

    NOTE ON ENCODING: this file is deliberately ASCII-only. Windows PowerShell 5.1 reads a
    UTF-8-without-BOM script as ANSI, so an em dash in a form title here came back as three
    mojibake characters and every title match failed. Titles are matched on an ASCII fragment
    instead of the full string for the same reason.

    Usage:
      .\tools\browser-qa\provision-template-pages.ps1
      .\tools\browser-qa\provision-template-pages.ps1 -WhatIfOnly
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://megaclean008.ai',
    [string]$User = 'admin',
    [string]$Password = 'dnnhost',
    # Page whose settings are cloned. Must already use the full-width skin.
    [int]$TemplatePageId = 1014,
    [string]$Skin = '[G]Skins/Aperture/default.ascx',
    [switch]$WhatIfOnly
)

$ErrorActionPreference = 'Stop'

# page slug -> ASCII fragment that identifies the form title.
$WANTED = @(
    @{ page = 'mf-xmas-sale';       match = 'Christmas Offer' }
    @{ page = 'mf-xmas-newsletter'; match = 'Christmas Newsletter' }
    @{ page = 'mf-agency-flyer';    match = 'Agency Flyer' }
    @{ page = 'mf-first-book';      match = 'First Book' }
    @{ page = 'mf-gold-suite';      match = 'Gold Suite' }
    @{ page = 'mf-rose-wellness';   match = 'Rose Wellness' }
    @{ page = 'mf-newsletter';      match = 'Newsletter Signup' }
    @{ page = 'mf-job-application'; match = 'Careers at Northwind' }
    @{ page = 'mf-golden-pro';      match = 'Golden Pro' }
    @{ page = 'mf-invoice-form';    match = 'Invoice Request' }
    @{ page = 'mf-invoice-spinera'; match = 'Spinera' }
    @{ page = 'mf-invoice-codexo';  match = 'Codexo' }
    @{ page = 'mf-hotel-booking';   match = 'Lagoon Reserve' }
    @{ page = 'mf-product-order';   match = 'Product Order' }
)

function Fail([string]$m) { Write-Host "ABORT: $m" -ForegroundColor Red; exit 1 }
function Step([string]$m) { Write-Host "`n== $m" -ForegroundColor Cyan }

Step 'Logging in'
try { $null = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 300 } catch { }
$login = Invoke-WebRequest -Uri "$BaseUrl/Login" -SessionVariable sess -UseBasicParsing -TimeoutSec 300
$body = @{}
foreach ($m in [regex]::Matches($login.Content, '<input[^>]*type="hidden"[^>]*>')) {
    $n = [regex]::Match($m.Value, 'name="([^"]+)"').Groups[1].Value
    $v = [regex]::Match($m.Value, 'value="([^"]*)"').Groups[1].Value
    if ($n) { $body[$n] = [System.Net.WebUtility]::HtmlDecode($v) }
}
$body['dnn$ctr$Login$Login_DNN$txtUsername'] = $User
$body['dnn$ctr$Login$Login_DNN$txtPassword'] = $Password
$body['__EVENTTARGET'] = 'dnn$ctr$Login$Login_DNN$cmdLogin'
$body['__EVENTARGUMENT'] = ''
$null = Invoke-WebRequest -Uri "$BaseUrl/Login" -Method POST -Body $body -WebSession $sess -UseBasicParsing -TimeoutSec 300

$page = Invoke-WebRequest -Uri "$BaseUrl/mfqa-form" -WebSession $sess -UseBasicParsing -TimeoutSec 300
$rvt = [regex]::Match($page.Content, 'name="__RequestVerificationToken"[^>]*value="([^"]+)"').Groups[1].Value
if (-not $rvt) { Fail 'No antiforgery token on the page - did the login actually succeed?' }
$hdr = @{ 'RequestVerificationToken' = $rvt; 'X-Requested-With' = 'XMLHttpRequest' }
Write-Host "  token length: $($rvt.Length)"

function ApiGet([string]$path) {
    $r = Invoke-WebRequest -Uri "$BaseUrl$path" -Headers $hdr -WebSession $sess -UseBasicParsing -TimeoutSec 300
    return $r.Content | ConvertFrom-Json
}
function ApiPost([string]$path, $bodyObj) {
    $json = $bodyObj | ConvertTo-Json -Depth 40 -Compress
    $r = Invoke-WebRequest -Uri "$BaseUrl$path" -Method POST -Headers $hdr -ContentType 'application/json' `
            -Body $json -WebSession $sess -UseBasicParsing -TimeoutSec 300
    return $r.Content | ConvertFrom-Json
}

Step 'Reading forms and pages'
# GetForms clamps pageSize to MaxPageSize (50), so asking for 200 silently returns 50 and every
# form seeded after the first fifty looks like it does not exist. Page until hasMore is false.
$forms = @()
$pageIndex = 0
do {
    $batch = ApiGet "/API/personaBar/MegaForm/GetForms?pageIndex=$pageIndex&pageSize=50"
    if ($batch.items) { $forms += $batch.items }
    $pageIndex++
} while ($batch.hasMore -and $pageIndex -lt 40)
Write-Host "  $($forms.Count) form(s) over $pageIndex page(s)"

# MegaForm's own page list is used rather than PersonaBar's GetPageList: the latter returns a bare
# JSON array whose enumeration through a PS 5.1 function did not survive intact (it reported 1 page
# on a portal with 18, and the script then tried to re-create pages that already existed).
$existing = @{}
foreach ($t in (ApiGet '/API/personaBar/MegaForm/GetPages?pageSize=500').pages) {
    if ($t.name) { $existing[$t.name.ToLowerInvariant()] = $t }
    elseif ($t.tabName) { $existing[$t.tabName.ToLowerInvariant()] = $t }
}
Write-Host "  $($existing.Count) page(s)"

$tplWrap = ApiGet "/API/PersonaBar/Pages/GetPageDetails?pageId=$TemplatePageId"
if (-not $tplWrap.page) { Fail "GetPageDetails($TemplatePageId) returned no page." }
$tplJson = $tplWrap | ConvertTo-Json -Depth 40

$results = @()
foreach ($w in $WANTED) {
    $form = $forms | Where-Object { $_.title -like "*$($w.match)*" } | Select-Object -First 1
    if (-not $form) {
        Write-Host "  skip  $($w.page): no form matching '$($w.match)' yet" -ForegroundColor DarkGray
        continue
    }

    $key = $w.page.ToLowerInvariant()
    if ($existing.ContainsKey($key)) {
        $tabId = $existing[$key].id
        Write-Host "  reuse $($w.page) (tab $tabId)"
    } elseif ($WhatIfOnly) {
        Write-Host "  would create $($w.page) for form $($form.formId) ($($form.title))"
        continue
    } else {
        # Fresh clone per page: mutating one PSCustomObject would carry the previous name through.
        $p = ($tplJson | ConvertFrom-Json).page
        $p.tabId = 0
        $p.name = $w.page
        $p.title = $form.title
        $p.description = "Single-template review page. Form $($form.formId)."
        $p.url = ''
        $p.skinSrc = $Skin
        $p.modules = @()
        $res = ApiPost '/API/PersonaBar/Pages/SavePageDetails' $p
        $tabId = $res.Page.id
        if (-not $tabId) { Fail "SavePageDetails returned no tab id for $($w.page)." }
        Write-Host "  created $($w.page) (tab $tabId)"
    }

    # AddToPage APPENDS, so without this check a re-run stacks a second copy of the form.
    $detail = ApiGet "/API/PersonaBar/Pages/GetPageDetails?pageId=$tabId"
    $moduleCount = @($detail.page.modules).Count
    if ($moduleCount -gt 0) {
        Write-Host "    module already present ($moduleCount) - left alone"
    } elseif ($WhatIfOnly) {
        Write-Host "    would add form $($form.formId) to tab $tabId"
    } else {
        $add = ApiPost '/API/personaBar/MegaForm/AddToPage' @{ FormId = $form.formId; TabId = $tabId; Pane = 'ContentPane' }
        Write-Host "    added module $($add.moduleId) bound to form $($form.formId)"
    }

    $results += [pscustomobject]@{
        Page = $w.page; FormId = $form.formId; Url = "$BaseUrl/$($w.page)"; Title = $form.title
    }
}

Step 'Review URLs'
$results | Format-Table -AutoSize Page, FormId, Url
