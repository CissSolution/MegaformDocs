<#
    [TemplatePages v2 20260807] One DNN page per converted template, as SUB-PAGES of a single
    parent so the site menu stays one item wide, each carrying:

        LeftPane   an HTML module with the link to the ORIGINAL MOCK, for later comparison
        RightPane  the MegaForm module bound to that template's form

    That split is what the Aperture/form-2col skin was written for ("marketing HTML text on the
    LEFT, a MegaForm form on the RIGHT"), and its right pane lands near 560px - which is closer to
    the mocks (Tailwind max-w-xl = 576px) than the full-width page ever was.

    Idempotent: an existing page is reused and re-parented / re-skinned rather than duplicated, and
    a pane that already holds a module is left alone (AddToPage and AddModule both APPEND, so
    without that check a re-run stacks a second copy).

    Three things this had to learn the hard way, all recorded so the next edit does not rediscover
    them:
      * GetForms clamps pageSize to 50. Asking for 200 silently returns 50, and every template
        seeded after the fiftieth looks like it does not exist. It is paged.
      * PersonaBar's Pages/GetPageList returns a bare JSON array that did not survive enumeration
        through a PS 5.1 function (it reported 1 page on a portal with 18, and the script then tried
        to re-create pages that already existed). MegaForm's own GetPages is used instead.
      * This file is ASCII-only. Windows PowerShell 5.1 reads a UTF-8-without-BOM script as ANSI, so
        an em dash in a form title came back as mojibake and every title match failed. Titles are
        matched on an ASCII fragment.

    The HTML module's content cannot be set over REST, so it is written straight into HtmlText
    (StateID 1 = published on this portal's Direct Publish workflow) and the pool is recycled at the
    end, because that content is cached per module.

    Usage:
      .\tools\browser-qa\provision-template-pages.ps1
      .\tools\browser-qa\provision-template-pages.ps1 -WhatIfOnly
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://megaclean008.ai',
    [string]$User = 'admin',
    [string]$Password = 'dnnhost',
    [string]$SqlServer = 'WINDOWS-11\SQLEXPRESS',
    [string]$Database = 'DNN_MegaClean008',
    [string]$AppPool = 'DNN_MegaClean008',
    [string]$MockBase = 'http://localhost:3000/forms',
    [int]$TemplatePageId = 1014,
    [string]$Skin = '[G]Skins/Aperture/form-2col.ascx',
    [string]$ParentPage = 'mf-templates',
    [int]$HtmlDesktopModuleId = 72,
    [switch]$WhatIfOnly
)

$ErrorActionPreference = 'Stop'

# page slug | ASCII fragment of the form title | mock folder | template json
$WANTED = @(
    @{ page = 'mf-xmas-sale';       match = 'Christmas Offer';      mock = 'xmas-sale';               tpl = 'xmas-sale-euroyouth-application' }
    @{ page = 'mf-xmas-newsletter'; match = 'Christmas Newsletter'; mock = 'xmas-newsletter';         tpl = 'xmas-newsletter-euroyouth-application' }
    @{ page = 'mf-agency-flyer';    match = 'Agency Flyer';         mock = 'agency-flyer';            tpl = 'agency-flyer-euroyouth-application' }
    @{ page = 'mf-first-book';      match = 'First Book';           mock = 'hotel-concierge';         tpl = 'kids-first-book-registration' }
    @{ page = 'mf-gold-suite';      match = 'Gold Suite';           mock = 'hotel-suite';             tpl = 'gold-suite-membership-application' }
    @{ page = 'mf-rose-wellness';   match = 'Rose Wellness';        mock = 'rose-registration';       tpl = 'rose-wellness-registration' }
    @{ page = 'mf-newsletter';      match = 'Newsletter Signup';    mock = 'newsletter';              tpl = 'newsletter-signup-amber' }
    @{ page = 'mf-job-application'; match = 'Northwind';            mock = 'job-application';         tpl = 'job-application-northwind' }
    @{ page = 'mf-golden-pro';      match = 'Golden Pro';           mock = 'golden-pro-registration'; tpl = 'golden-pro-agent-registration' }
    @{ page = 'mf-invoice-form';    match = 'Navy';                 mock = 'invoice-form';            tpl = 'invoice-request-navy-orange' }
    @{ page = 'mf-invoice-spinera'; match = 'Spinera';              mock = 'invoice-spinera';         tpl = 'invoice-spinera-blue' }
    @{ page = 'mf-invoice-codexo';  match = 'Codexo';               mock = 'invoice-codexo';          tpl = 'invoice-codexo-cyan' }
    @{ page = 'mf-hotel-booking';   match = 'Lagoon';               mock = 'hotel-booking';           tpl = 'lagoon-reserve-booking' }
    @{ page = 'mf-product-order';   match = 'Product Order';        mock = 'product-order';           tpl = 'product-order-live-total' }
)

function Fail([string]$m) { Write-Host "ABORT: $m" -ForegroundColor Red; exit 1 }
function Step([string]$m) { Write-Host "`n== $m" -ForegroundColor Cyan }

function Sql([string]$query) {
    $out = & sqlcmd -S $SqlServer -d $Database -E -I -h -1 -W -Q "SET NOCOUNT ON; $query"
    if ($LASTEXITCODE -ne 0) { Fail "sqlcmd failed: $out" }
    return ($out | Where-Object { $_ -and $_.Trim() -ne '' })
}
function SqlFile([string]$sqlText) {
    $tmp = [System.IO.Path]::GetTempFileName() + '.sql'
    # UTF-8 with BOM so sqlcmd -f 65001 reads the markup back intact.
    [System.IO.File]::WriteAllText($tmp, $sqlText, (New-Object System.Text.UTF8Encoding($true)))
    $out = & sqlcmd -S $SqlServer -d $Database -E -I -f 65001 -i $tmp
    $code = $LASTEXITCODE
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    if ($code -ne 0) { Fail "sqlcmd -i failed: $out" }
    return $out
}

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
if (-not $rvt) { Fail 'No antiforgery token - did the login actually succeed?' }
$hdr = @{ 'RequestVerificationToken' = $rvt; 'X-Requested-With' = 'XMLHttpRequest' }
Write-Host "  token length: $($rvt.Length)"

function ApiGet([string]$path) {
    $r = Invoke-WebRequest -Uri "$BaseUrl$path" -Headers $hdr -WebSession $sess -UseBasicParsing -TimeoutSec 300
    return $r.Content | ConvertFrom-Json
}
function ApiPost([string]$path, $obj) {
    $json = $obj | ConvertTo-Json -Depth 40 -Compress
    $r = Invoke-WebRequest -Uri "$BaseUrl$path" -Method POST -Headers $hdr -ContentType 'application/json' `
            -Body $json -WebSession $sess -UseBasicParsing -TimeoutSec 300
    return $r.Content | ConvertFrom-Json
}

Step 'Reading forms and pages'
$forms = @()
$pi = 0
do {
    $batch = ApiGet "/API/personaBar/MegaForm/GetForms?pageIndex=$pi&pageSize=50"
    if ($batch.items) { $forms += $batch.items }
    $pi++
} while ($batch.hasMore -and $pi -lt 40)
Write-Host "  $($forms.Count) form(s) over $pi page(s)"

$existing = @{}
foreach ($t in (ApiGet '/API/personaBar/MegaForm/GetPages?pageSize=500').pages) {
    $nm = if ($t.name) { $t.name } else { $t.tabName }
    # MegaForm's GetPages projects { tabId, name, path }; PersonaBar's list uses { id, name }.
    # Normalise to one shape so the lookups below cannot silently read a null.
    $tid = if ($t.tabId) { $t.tabId } elseif ($t.id) { $t.id } else { $null }
    if ($nm -and $tid) { $existing[$nm.ToLowerInvariant()] = [pscustomobject]@{ id = $tid; name = $nm } }
}
Write-Host "  $($existing.Count) page(s)"

$tplJson = (ApiGet "/API/PersonaBar/Pages/GetPageDetails?pageId=$TemplatePageId") | ConvertTo-Json -Depth 40
if (-not $tplJson) { Fail "GetPageDetails($TemplatePageId) returned nothing." }

function SavePage($mutate) {
    $p = ($tplJson | ConvertFrom-Json).page
    & $mutate $p
    return ApiPost '/API/PersonaBar/Pages/SavePageDetails' $p
}

# -- the parent -----------------------------------------------------------------
Step "Parent page '$ParentPage'"
if ($existing.ContainsKey($ParentPage.ToLowerInvariant())) {
    $parentId = $existing[$ParentPage.ToLowerInvariant()].id
    Write-Host "  reuse (tab $parentId)"
} elseif ($WhatIfOnly) {
    Write-Host '  would create'; $parentId = -999
} else {
    $res = SavePage {
        param($p)
        $p.tabId = 0; $p.name = $ParentPage; $p.title = 'Template conversions'
        $p.description = 'Parent of one review page per converted mock. Keeps the menu to one item.'
        $p.url = ''; $p.modules = @(); $p.parentId = -1
    }
    $parentId = $res.Page.id
    if (-not $parentId) { Fail 'SavePageDetails returned no tab id for the parent.' }
    Write-Host "  created (tab $parentId)"
}

# -- the children ---------------------------------------------------------------
$results = @()
$htmlWrites = New-Object System.Collections.Generic.List[string]

foreach ($w in $WANTED) {
    $form = $forms | Where-Object { $_.title -like "*$($w.match)*" } | Select-Object -First 1
    if (-not $form) { Write-Host "  skip  $($w.page): no form matching '$($w.match)'" -ForegroundColor DarkGray; continue }

    $key = $w.page.ToLowerInvariant()
    if ($existing.ContainsKey($key)) {
        $tabId = $existing[$key].id
        if (-not $WhatIfOnly) {
            # Re-parent and re-skin an existing page rather than making a second one.
            $d = ApiGet "/API/PersonaBar/Pages/GetPageDetails?pageId=$tabId"
            $p = $d.page
            $p.parentId = $parentId
            $p.skinSrc = $Skin
            $null = ApiPost '/API/PersonaBar/Pages/SavePageDetails' $p
        }
        Write-Host "  reuse $($w.page) (tab $tabId) - re-parented + re-skinned"
    } elseif ($WhatIfOnly) {
        Write-Host "  would create $($w.page) under $parentId for form $($form.formId)"
        continue
    } else {
        $res = SavePage {
            param($p)
            $p.tabId = 0; $p.name = $w.page; $p.title = $form.title
            $p.description = "Review page. Template $($w.tpl), form $($form.formId), mock $($w.mock)."
            $p.url = ''; $p.skinSrc = $Skin; $p.modules = @(); $p.parentId = $parentId
        }
        $tabId = $res.Page.id
        if (-not $tabId) { Fail "SavePageDetails returned no tab id for $($w.page)." }
        Write-Host "  created $($w.page) (tab $tabId)"
    }

    if ($WhatIfOnly) { continue }

    # Which panes already hold something? Modules carry PaneName in TabModules.
    $panes = @(Sql "SELECT PaneName FROM TabModules WHERE TabID = $tabId AND IsDeleted = 0")
    $hasRight = $panes -contains 'RightPane'
    $hasLeft = $panes -contains 'LeftPane'

    $mfPane = @(Sql "SELECT PaneName FROM TabModules tm JOIN Modules m ON m.ModuleID = tm.ModuleID JOIN ModuleDefinitions md ON md.ModuleDefID = m.ModuleDefID JOIN DesktopModules dm ON dm.DesktopModuleID = md.DesktopModuleID WHERE tm.TabID = $tabId AND tm.IsDeleted = 0 AND dm.ModuleName LIKE '%MegaForm%'")
    if ($mfPane.Count -gt 0 -and $mfPane[0].Trim() -ne 'RightPane') {
        # Created against the single-pane skin, so the form is in ContentPane. Move it rather than
        # adding a second copy.
        $null = Sql "UPDATE tm SET tm.PaneName = 'RightPane' FROM TabModules tm JOIN Modules m ON m.ModuleID = tm.ModuleID JOIN ModuleDefinitions md ON md.ModuleDefID = m.ModuleDefID JOIN DesktopModules dm ON dm.DesktopModuleID = md.DesktopModuleID WHERE tm.TabID = $tabId AND tm.IsDeleted = 0 AND dm.ModuleName LIKE '%MegaForm%'"
        Write-Host "    MegaForm module moved $($mfPane[0].Trim()) -> RightPane"
        $hasRight = $true
    }
    if ($hasRight) {
        Write-Host '    RightPane already has a module'
    } else {
        $add = ApiPost '/API/personaBar/MegaForm/AddToPage' @{ FormId = $form.formId; TabId = $tabId; Pane = 'RightPane' }
        Write-Host "    MegaForm module $($add.moduleId) -> RightPane (form $($form.formId))"
    }

    # LeftPane: reuse an existing HTML module, add one if the pane is empty, and write the body
    # whenever it has none. An earlier probe left a module here with no HtmlText row, which renders
    # as an empty pane and looks exactly like a module that failed to add.
    $moduleId = ''
    if ($hasLeft) {
        $leftMod = @(Sql "SELECT ModuleID FROM TabModules WHERE TabID = $tabId AND IsDeleted = 0 AND PaneName = 'LeftPane'")
        $lm = if ($leftMod.Count) { $leftMod[0].Trim() } else { '' }
        $bodyCount = if ($lm) { (@(Sql "SELECT COUNT(*) FROM HtmlText WHERE ModuleID = $lm")[0]).Trim() } else { '1' }
        if ($lm -and $bodyCount -eq '0') {
            $moduleId = $lm
            Write-Host "    LeftPane module $lm has no body - writing one"
        } else {
            Write-Host "    LeftPane already has a module with a body"
        }
    } else {
        # NOTE: no PortalId / ModuleListType in this payload. With them present the endpoint IGNORED
        # `Page` and attached the module to an unrelated tab (it landed on tab 21 - the same class of
        # accident as the module that once ended up on a live 404 page).
        $tm = ApiPost '/API/internalservices/controlbar/AddModule' @{
            Visibility = 0; Position = -1; Module = $HtmlDesktopModuleId; Page = $tabId
            Pane = 'LeftPane'; AddExistingModule = $false; CopyModule = $false; Sort = -1
        }
        if (-not $tm.TabModuleID) { Fail "controlbar/AddModule returned no TabModuleID for $($w.page)." }
        $landed = @(Sql "SELECT TabID FROM TabModules WHERE ModuleID = $($tm.TabModuleID)")
        if ($landed.Count -eq 0 -or $landed[0].Trim() -ne "$tabId") {
            Fail "AddModule put module $($tm.TabModuleID) on tab '$($landed -join '')' instead of $tabId - refusing to continue and leave modules scattered."
        }
        $moduleId = $tm.TabModuleID
        Write-Host "    HTML module $moduleId -> LeftPane"
    }

    if ($moduleId -ne '') {
        $mockUrl = "$MockBase/$($w.mock)"
        $content = @"
<div class="mf-mocklink">
<h1>$($form.title)</h1>
<p><strong>Original mock, for comparison:</strong><br />
<a href="$mockUrl" target="_blank" rel="noopener">$mockUrl</a></p>
<ul>
<li>Template: <code>$($w.tpl).json</code></li>
<li>Form ID: <code>$($form.formId)</code></li>
<li>Mock folder: <code>app/forms/$($w.mock)</code></li>
</ul>
<p>The form on the right is the converted template. Compare it with the mock and note anything to change.</p>
</div>
"@
        $esc = $content.Replace("'", "''")
        $htmlWrites.Add("INSERT INTO HtmlText (ModuleID, Content, Version, StateID, IsPublished, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate, Summary) VALUES ($moduleId, N'$esc', 1, 1, 1, 1, GETDATE(), 1, GETDATE(), N'Mock link');")
    }

    $results += [pscustomobject]@{
        Page = $w.page; FormId = $form.formId; Url = "$BaseUrl/$($w.page)"
        Mock = "$MockBase/$($w.mock)"
    }
}

if ($htmlWrites.Count -gt 0) {
    Step "Writing $($htmlWrites.Count) HTML module body/bodies"
    # StateID 1 is the published state on this portal; the module reads the newest published row.
    $null = SqlFile ($htmlWrites -join "`n")
    Write-Host '  inserted'
}

if (-not $WhatIfOnly) {
    Step 'Recycling the pool (HTML module content is cached per module)'
    Import-Module WebAdministration -ErrorAction SilentlyContinue
    Restart-WebAppPool -Name $AppPool
    Write-Host '  recycled'
}

Step 'Review URLs'
$results | Format-Table -AutoSize Page, FormId, Url, Mock
