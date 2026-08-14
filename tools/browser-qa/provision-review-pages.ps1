# One review page per converted template: create the page if it is missing, put the form on it, and
# write the panel that says WHICH mock the page is a conversion of.
#
# Supersedes set-review-page-notes.ps1, which could only annotate the six pages that already
# existed. Everything is done in SQL by cloning known-good rows, because
# /API/internalservices/controlbar/AddModule has been caught putting a module on the portal's Home
# page instead of the tab it was handed - the guard that caught it is why this path exists at all.
#
# Model rows on tab 1015: Tabs 1015, Modules 10611 (MegaForm) / 10618 (Text-HTML),
# TabModules 10300 / 10307. A MegaForm module needs THREE settings or it renders a setup prompt:
#   MegaForm_FormId=<id>  MegaForm_ModuleConfigured=true  MegaForm_ModuleMode=render
#
# Idempotent: run it as often as you like. ASCII only - PowerShell 5.1 reads a UTF-8-without-BOM
# .ps1 as ANSI and an em dash silently becomes mojibake.
#
#   powershell -File tools\browser-qa\provision-review-pages.ps1 [-WhatIf]

[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$Server   = 'WINDOWS-11\SQLEXPRESS',
  [string]$Database = 'DNN_MegaClean008',
  [string]$Site     = 'http://megaclean008.ai',
  [string]$MockBase = 'http://localhost:3000/forms',
  [string]$Summary  = 'qa-out\iter\summary-all.json',
  [int]$ParentTab   = 1021,
  [string]$Skin     = '[G]Skins/Aperture/default.ascx',
  [int]$ModelTab    = 1015,
  [int]$ModelForm   = 10611,
  [int]$ModelHtml   = 10618,
  [int]$MegaFormDef = 122,
  [int]$HtmlDef     = 114
)

$ErrorActionPreference = 'Stop'

# name / form id / template slug / mock slug / page title. The page name and the mock slug genuinely
# differ - mf-first-book renders the mock filed as hotel-concierge.
$PAGES = @(
  @{ Name = 'mf-xmas-sale';        Form = 59; Slug = 'xmas-sale';        Mock = 'xmas-sale';               Title = 'Christmas Offer - EuroYouth Application' },
  @{ Name = 'mf-xmas-newsletter';  Form = 58; Slug = 'xmas-newsletter';  Mock = 'xmas-newsletter';         Title = 'Christmas Newsletter - EuroYouth Application' },
  @{ Name = 'mf-agency-flyer';     Form = 57; Slug = 'agency-flyer';     Mock = 'agency-flyer';            Title = 'Agency Flyer - EuroYouth Application' },
  @{ Name = 'mf-first-book';       Form = 61; Slug = 'first-book';       Mock = 'hotel-concierge';         Title = 'Baby''s First Book - Registration' },
  @{ Name = 'mf-gold-suite';       Form = 60; Slug = 'gold-suite';       Mock = 'hotel-suite';             Title = 'Gold Suite - Membership Application' },
  @{ Name = 'mf-rose-wellness';    Form = 62; Slug = 'rose-wellness';    Mock = 'rose-registration';       Title = 'EuroYouth 2026 - Registration' },
  @{ Name = 'mf-newsletter-amber'; Form = 66; Slug = 'newsletter-amber'; Mock = 'newsletter';              Title = 'Newsletter Signup' },
  @{ Name = 'mf-job-application';  Form = 65; Slug = 'job-application';  Mock = 'job-application';         Title = 'Apply for Position' },
  @{ Name = 'mf-lagoon-booking';   Form = 64; Slug = 'lagoon-booking';   Mock = 'hotel-booking';           Title = 'Reserve Your Perfect Stay' },
  @{ Name = 'mf-product-order';    Form = 63; Slug = 'product-order';    Mock = 'product-order';           Title = 'Create Order' },
  @{ Name = 'mf-golden-pro';       Form = 68; Slug = 'golden-pro';       Mock = 'golden-pro-registration'; Title = 'Golden Pro - Agent Registration' },
  @{ Name = 'mf-invoice-navy';     Form = 70; Slug = 'invoice-navy';     Mock = 'invoice-form';            Title = 'Invoice Request - Navy and Orange' },
  @{ Name = 'mf-invoice-spinera';  Form = 71; Slug = 'invoice-spinera';  Mock = 'invoice-spinera';         Title = 'Spinera Invoice - Blue' },
  @{ Name = 'mf-invoice-codexo';   Form = 69; Slug = 'invoice-codexo';   Mock = 'invoice-codexo';          Title = 'Codexo Invoice - Cyan' },
  # 2026-08-08 batch: the four mocks added to form-builder-controls (11) and copied into (10)
  @{ Name = 'mf-corporate-reg';    Form = 115; Slug = 'corporate-reg';   Mock = 'corporate-registration';  Title = 'Registration Form - Corporate Blue' },
  @{ Name = 'mf-ielts-report';     Form = 116; Slug = 'ielts-report';    Mock = 'ielts-report';            Title = 'IELTS Test Report Form' },
  @{ Name = 'mf-massage-intake';   Form = 117; Slug = 'massage-intake';  Mock = 'massage-intake';          Title = 'Massage Therapy - Client Intake' },
  @{ Name = 'mf-massage-body';     Form = 118; Slug = 'massage-body';    Mock = 'massage-bodychart';       Title = 'Massage Session Plan and Body Chart' },
  @{ Name = 'mf-festa-italiana'; Form = 72;  Slug = 'festa-italiana'; Mock = 'festa-italiana';          Title = 'Festa Italiana - Iscrizione' }
)

$stats = @{}
if (Test-Path $Summary) {
  foreach ($row in (Get-Content $Summary -Raw | ConvertFrom-Json)) { $stats[$row.slug] = $row }
} else {
  Write-Warning "No $Summary - the panel will omit the measured numbers."
}

$cn = New-Object System.Data.SqlClient.SqlConnection "Server=$Server;Database=$Database;Integrated Security=True"
$cn.Open()
function Sql([string]$sql, [hashtable]$p = @{}) {
  $cmd = $cn.CreateCommand(); $cmd.CommandText = $sql
  foreach ($k in $p.Keys) { [void]$cmd.Parameters.AddWithValue("@$k", $p[$k]) }
  return $cmd.ExecuteScalar()
}

function Get-Panel($page) {
  $s = $stats[$page.Slug]
  $mockUrl = "$MockBase/$($page.Mock)"
  $liveUrl = "$Site/mf-templates/$($page.Name)"
  $wideUrl = "$Site/mfqa-wide?mfFormId=$($page.Form)"
  $measured = if ($s) {
    $verdict = if ([int]$s.differing -eq 0) { 'color:#059669' } else { 'color:#e11d48' }
    "<p style=""margin:14px 0 0;font-size:12px;line-height:1.7;color:#64748b"">" +
    "Last measured by <code style=""font-size:11px"">tools/browser-qa/mock-vs-template.mjs</code>: " +
    "<b>$($s.matched)</b> elements matched by text, <b style=""$verdict"">$($s.differing)</b> differ beyond tolerance, " +
    "<b>$($s.bitmap)%</b> of pixels differ over the form region " +
    "(compared at the mock's own card width of <b>$($s.cardMock)px</b>).</p>"
  } else { '' }
  return @"
<div style="font-family:inherit;max-width:820px;margin:0 auto 28px">
  <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0e7490">Template review</p>
  <h2 style="margin:0 0 10px;font-size:22px;line-height:1.25;font-weight:700;color:#0f172a">$($page.Title)</h2>
  <p style="margin:0 0 16px;font-size:13px;line-height:1.7;color:#475569">
    The form below is MegaForm form <b>#$($page.Form)</b>, seeded from
    <code style="font-size:12px">$($page.Slug)</code>. It is a conversion of the mock linked here and
    is meant to reproduce it exactly. Open both and compare.
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <tr><td style="padding:8px 0;border-top:1px solid #e2e8f0;color:#64748b;white-space:nowrap;width:1%">Mock (reference)</td>
        <td style="padding:8px 0 8px 12px;border-top:1px solid #e2e8f0"><a href="$mockUrl" style="color:#0e7490;word-break:break-all">$mockUrl</a></td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #e2e8f0;color:#64748b;white-space:nowrap">This page (live)</td>
        <td style="padding:8px 0 8px 12px;border-top:1px solid #e2e8f0"><a href="$liveUrl" style="color:#0e7490;word-break:break-all">$liveUrl</a></td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #e2e8f0;color:#64748b;white-space:nowrap">Full width</td>
        <td style="padding:8px 0 8px 12px;border-top:1px solid #e2e8f0"><a href="$wideUrl" style="color:#0e7490;word-break:break-all">$wideUrl</a></td></tr>
  </table>
  $measured
</div>
"@
}

$order = 0
foreach ($page in $PAGES) {
  $order += 2
  Write-Host "=== $($page.Name) (form $($page.Form)) ===" -ForegroundColor Cyan

  # ---- 1. the page -----------------------------------------------------------------------------
  $tab = Sql "SELECT TOP 1 TabID FROM Tabs WHERE PortalID=0 AND TabName=@n AND IsDeleted=0" @{ n = $page.Name }
  if (-not $tab) {
    if ($PSCmdlet.ShouldProcess($page.Name, 'create page')) {
      # Clone the model tab's whole shape, then take a fresh identity. ContentItemID is NOT copied:
      # two tabs pointing at one content item is a versioning trap.
      $tab = Sql @"
INSERT INTO Tabs (TabOrder,PortalID,TabName,IsVisible,ParentId,IconFile,DisableLink,Title,Description,
                  KeyWords,IsDeleted,Url,SkinSrc,ContainerSrc,StartDate,EndDate,RefreshInterval,
                  PageHeadText,IsSecure,PermanentRedirect,SiteMapPriority,CreatedByUserID,CreatedOnDate,
                  LastModifiedByUserID,LastModifiedOnDate,IconFileLarge,CultureCode,Level,TabPath,
                  HasBeenPublished,IsSystem)
SELECT @ord,PortalID,@n,1,@parent,IconFile,0,@title,Description,KeyWords,0,Url,@skin,ContainerSrc,
       StartDate,EndDate,RefreshInterval,PageHeadText,0,0,SiteMapPriority,CreatedByUserID,GETDATE(),
       LastModifiedByUserID,GETDATE(),IconFileLarge,CultureCode,1,@path,1,0
FROM Tabs WHERE TabID=@model;
SELECT CAST(SCOPE_IDENTITY() AS int);
"@ @{ ord = $order; n = $page.Name; parent = $ParentTab; title = $page.Title; skin = $Skin
      path = "//mf-templates//$($page.Name)"; model = $ModelTab }
      Sql @"
INSERT INTO TabPermission (TabID,PermissionID,AllowAccess,RoleID,UserID,CreatedByUserID,CreatedOnDate,
                           LastModifiedByUserID,LastModifiedOnDate)
SELECT @tab,PermissionID,AllowAccess,RoleID,UserID,CreatedByUserID,GETDATE(),
       LastModifiedByUserID,GETDATE()
FROM TabPermission WHERE TabID=@model
"@ @{ tab = $tab; model = $ModelTab } | Out-Null
      Write-Host "  page      : created tab $tab" -ForegroundColor Green
    }
  } else {
    Sql "UPDATE Tabs SET ParentId=@parent, SkinSrc=@skin, TabPath=@path, IsVisible=1, IsDeleted=0 WHERE TabID=@tab" @{
      parent = $ParentTab; skin = $Skin; path = "//mf-templates//$($page.Name)"; tab = $tab } | Out-Null
    Write-Host "  page      : tab $tab"
  }
  if (-not $tab) { continue }

  # ---- 2. the form module ----------------------------------------------------------------------
  $mfMod = Sql @"
SELECT TOP 1 tm.ModuleID FROM TabModules tm JOIN Modules m ON m.ModuleID=tm.ModuleID
WHERE tm.TabID=@tab AND tm.IsDeleted=0 AND m.IsDeleted=0 AND m.ModuleDefID=@def
"@ @{ tab = $tab; def = $MegaFormDef }
  if (-not $mfMod -and $PSCmdlet.ShouldProcess("tab $tab", 'add the MegaForm module')) {
    $mfMod = Sql @"
INSERT INTO Modules (ModuleDefID,AllTabs,IsDeleted,InheritViewPermissions,StartDate,EndDate,PortalID,
                     CreatedByUserID,CreatedOnDate,LastModifiedByUserID,LastModifiedOnDate,
                     LastContentModifiedOnDate,IsShareable,IsShareableViewOnly)
SELECT ModuleDefID,AllTabs,0,InheritViewPermissions,StartDate,EndDate,PortalID,CreatedByUserID,
       GETDATE(),LastModifiedByUserID,GETDATE(),GETDATE(),IsShareable,IsShareableViewOnly
FROM Modules WHERE ModuleID=@model;
SELECT CAST(SCOPE_IDENTITY() AS int);
"@ @{ model = $ModelForm }
    Sql @"
INSERT INTO TabModules (TabID,ModuleID,PaneName,ModuleOrder,CacheTime,Alignment,Color,Border,IconFile,
                        Visibility,ContainerSrc,DisplayTitle,DisplayPrint,DisplaySyndicate,
                        CreatedByUserID,CreatedOnDate,LastModifiedByUserID,LastModifiedOnDate,
                        IsDeleted,CacheMethod,ModuleTitle)
SELECT @tab,@mod,'ContentPane',2,CacheTime,Alignment,Color,Border,IconFile,Visibility,ContainerSrc,
       0,DisplayPrint,DisplaySyndicate,CreatedByUserID,GETDATE(),LastModifiedByUserID,GETDATE(),0,
       CacheMethod,@ttl
FROM TabModules WHERE TabModuleID=(SELECT TOP 1 TabModuleID FROM TabModules WHERE ModuleID=@model AND IsDeleted=0)
"@ @{ tab = $tab; mod = $mfMod; model = $ModelForm; ttl = $page.Title } | Out-Null
    Write-Host "  form      : module $mfMod created" -ForegroundColor Green
  }
  if ($mfMod -and $PSCmdlet.ShouldProcess("module $mfMod", 'point it at the form')) {
    Sql "UPDATE TabModules SET PaneName='ContentPane', ModuleOrder=2, DisplayTitle=0, ModuleTitle=@ttl WHERE TabID=@tab AND ModuleID=@mod" @{
      tab = $tab; mod = $mfMod; ttl = $page.Title } | Out-Null
    # Without all three the module renders its setup prompt instead of the form.
    foreach ($kv in @(@{ k = 'MegaForm_FormId'; v = "$($page.Form)" },
                      @{ k = 'MegaForm_ModuleConfigured'; v = 'true' },
                      @{ k = 'MegaForm_ModuleMode'; v = 'render' })) {
      Sql @"
IF EXISTS (SELECT 1 FROM ModuleSettings WHERE ModuleID=@mod AND SettingName=@k)
  UPDATE ModuleSettings SET SettingValue=@v, LastModifiedOnDate=GETDATE() WHERE ModuleID=@mod AND SettingName=@k;
ELSE
  INSERT INTO ModuleSettings (ModuleID,SettingName,SettingValue,CreatedByUserID,CreatedOnDate,
                              LastModifiedByUserID,LastModifiedOnDate)
  VALUES (@mod,@k,@v,1,GETDATE(),1,GETDATE());
"@ @{ mod = $mfMod; k = $kv.k; v = $kv.v } | Out-Null
    }
    Write-Host "  form      : module $mfMod -> form $($page.Form)"
  }

  # ---- 3. the review panel ---------------------------------------------------------------------
  $htmlMod = Sql @"
SELECT TOP 1 tm.ModuleID FROM TabModules tm JOIN Modules m ON m.ModuleID=tm.ModuleID
WHERE tm.TabID=@tab AND tm.IsDeleted=0 AND m.IsDeleted=0 AND m.ModuleDefID=@def
"@ @{ tab = $tab; def = $HtmlDef }
  if (-not $htmlMod -and $PSCmdlet.ShouldProcess("tab $tab", 'add the review panel')) {
    $htmlMod = Sql @"
INSERT INTO Modules (ModuleDefID,AllTabs,IsDeleted,InheritViewPermissions,StartDate,EndDate,PortalID,
                     CreatedByUserID,CreatedOnDate,LastModifiedByUserID,LastModifiedOnDate,
                     LastContentModifiedOnDate,IsShareable,IsShareableViewOnly)
SELECT ModuleDefID,AllTabs,0,InheritViewPermissions,StartDate,EndDate,PortalID,CreatedByUserID,
       GETDATE(),LastModifiedByUserID,GETDATE(),GETDATE(),IsShareable,IsShareableViewOnly
FROM Modules WHERE ModuleID=@model;
SELECT CAST(SCOPE_IDENTITY() AS int);
"@ @{ model = $ModelHtml }
    Sql @"
INSERT INTO TabModules (TabID,ModuleID,PaneName,ModuleOrder,CacheTime,Alignment,Color,Border,IconFile,
                        Visibility,ContainerSrc,DisplayTitle,DisplayPrint,DisplaySyndicate,
                        CreatedByUserID,CreatedOnDate,LastModifiedByUserID,LastModifiedOnDate,
                        IsDeleted,CacheMethod,ModuleTitle)
SELECT @tab,@mod,'ContentPane',1,CacheTime,Alignment,Color,Border,IconFile,Visibility,ContainerSrc,
       0,DisplayPrint,DisplaySyndicate,CreatedByUserID,GETDATE(),LastModifiedByUserID,GETDATE(),0,
       CacheMethod,'Template review'
FROM TabModules WHERE TabModuleID=(SELECT TOP 1 TabModuleID FROM TabModules WHERE ModuleID=@model AND IsDeleted=0)
"@ @{ tab = $tab; mod = $htmlMod; model = $ModelHtml } | Out-Null
    Write-Host "  panel     : module $htmlMod created" -ForegroundColor Green
  }
  if ($htmlMod -and $PSCmdlet.ShouldProcess("module $htmlMod", 'write the panel')) {
    Sql "UPDATE TabModules SET PaneName='ContentPane', ModuleOrder=1, DisplayTitle=0, ModuleTitle='Template review' WHERE TabID=@tab AND ModuleID=@mod" @{
      tab = $tab; mod = $htmlMod } | Out-Null
    $body = Get-Panel $page
    # StateID 1 is Published on this portal's Direct Publish workflow.
    $item = Sql 'SELECT TOP 1 ItemID FROM HtmlText WHERE ModuleID=@mod ORDER BY ItemID DESC' @{ mod = $htmlMod }
    if ($item) {
      Sql 'UPDATE HtmlText SET Content=@c, StateID=1, IsPublished=1, Version=ISNULL(Version,0)+1, LastModifiedOnDate=GETDATE() WHERE ItemID=@id' @{ c = $body; id = $item } | Out-Null
    } else {
      Sql @"
INSERT INTO HtmlText (ModuleID,Content,Version,StateID,IsPublished,CreatedByUserID,CreatedOnDate,
                      LastModifiedByUserID,LastModifiedOnDate,Summary)
VALUES (@mod,@c,1,1,1,1,GETDATE(),1,GETDATE(),NULL)
"@ @{ mod = $htmlMod; c = $body } | Out-Null
    }
    Write-Host "  panel     : module $htmlMod written ($($body.Length) chars)"
  }
}

$cn.Close()
Write-Host ''
Write-Host 'Page and module content are cached - recycle the pool, then verify:' -ForegroundColor DarkGray
Write-Host '  & "$env:windir\system32\inetsrv\appcmd.exe" recycle apppool /apppool.name:"DNN_MegaClean008"'
