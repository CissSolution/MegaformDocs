# Put a "what am I looking at" panel in the LeftPane of each template review page.
#
# Every review page renders one MegaForm form on the right. Without a label there is nothing on the
# page that says WHICH mock it is supposed to reproduce, and comparing the wrong pair is an easy
# mistake to make - golden-pro's mock against the gold-suite page, for instance, are two different
# templates that look nothing alike for entirely legitimate reasons.
#
# Writes the panel straight into HtmlText. Module content cannot be set over REST, and
# /API/internalservices/controlbar/AddModule has already been caught putting a module on the
# portal's Home page instead of the tab it was given, so the module rows are cloned in SQL from a
# known-good pair (Modules 10618 / TabModules 10307 on tab 1015).
#
# ASCII only on purpose: PowerShell 5.1 reads a UTF-8-without-BOM .ps1 as ANSI and an em dash
# silently becomes mojibake.
#
#   powershell -File tools\browser-qa\set-review-page-notes.ps1 [-WhatIf]

[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$Server   = 'WINDOWS-11\SQLEXPRESS',
  [string]$Database = 'DNN_MegaClean008',
  [string]$Site     = 'http://megaclean008.ai',
  [string]$MockBase = 'http://localhost:3000/forms',
  [string]$Summary  = 'qa-out\batch3\summary.json',
  [int]$ParentTab   = 1021,
  [string]$Skin     = '[G]Skins/Aperture/default.ascx',
  [int]$ModelModule = 10618,
  [int]$MegaFormDef = 122
)

$ErrorActionPreference = 'Stop'

# tab -> which template it shows. Kept here rather than derived, because the page name and the
# mock slug genuinely differ (mf-first-book renders the mock filed as hotel-concierge).
$PAGES = @(
  @{ Tab = 1015; Name = 'mf-xmas-sale';       Form = 59; Slug = 'xmas-sale';        Mock = 'xmas-sale';               Title = 'Christmas Offer - EuroYouth Application' },
  @{ Tab = 1016; Name = 'mf-xmas-newsletter'; Form = 58; Slug = 'xmas-newsletter';  Mock = 'xmas-newsletter';         Title = 'Christmas Newsletter - EuroYouth Application' },
  @{ Tab = 1017; Name = 'mf-agency-flyer';    Form = 57; Slug = 'agency-flyer';     Mock = 'agency-flyer';            Title = 'Agency Flyer - EuroYouth Application' },
  @{ Tab = 1018; Name = 'mf-first-book';      Form = 61; Slug = 'first-book';       Mock = 'hotel-concierge';         Title = 'My First Book - Registration' },
  @{ Tab = 1019; Name = 'mf-gold-suite';      Form = 60; Slug = 'gold-suite';       Mock = 'hotel-suite';             Title = 'Gold Suite - Membership Application' },
  @{ Tab = 1020; Name = 'mf-rose-wellness';   Form = 62; Slug = 'rose-wellness';    Mock = 'rose-registration';       Title = 'Rose Wellness - Registration' }
)

$stats = @{}
if (Test-Path $Summary) {
  foreach ($row in (Get-Content $Summary -Raw | ConvertFrom-Json)) { $stats[$row.slug] = $row }
} else {
  Write-Warning "No $Summary - the panel will omit the measured numbers."
}

$cn = New-Object System.Data.SqlClient.SqlConnection "Server=$Server;Database=$Database;Integrated Security=True"
$cn.Open()

function Invoke-Sql([string]$sql, [hashtable]$p = @{}) {
  $cmd = $cn.CreateCommand(); $cmd.CommandText = $sql
  foreach ($k in $p.Keys) { [void]$cmd.Parameters.AddWithValue("@$k", $p[$k]) }
  return $cmd.ExecuteScalar()
}

function Get-Panel($page) {
  $s = $stats[$page.Slug]
  $mockUrl = "$MockBase/$($page.Mock)"
  # The pages are children of mf-templates, so the friendly URL carries the parent segment.
  # Printing the un-parented path sent the reader to a 404.
  $liveUrl = "$Site/mf-templates/$($page.Name)"
  $measured = if ($s) {
    "<p style=""margin:14px 0 0;font-size:12px;line-height:1.7;color:#64748b"">" +
    "Last measured by <code style=""font-size:11px"">tools/browser-qa/mock-vs-template.mjs</code>: " +
    "<b>$($s.matched)</b> elements matched by text, <b style=""color:#e11d48"">$($s.differing)</b> differ beyond tolerance, " +
    "<b style=""color:#e11d48"">$($s.bitmap)%</b> of pixels differ over the form region " +
    "(compared at the mock's card width of <b>$($s.cardMock)px</b>).</p>"
  } else { '' }

  return @"
<div style="font-family:inherit;max-width:820px;margin:0 auto 28px">
  <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0e7490">Template review</p>
  <h2 style="margin:0 0 10px;font-size:22px;line-height:1.25;font-weight:700;color:#0f172a">$($page.Title)</h2>
  <p style="margin:0 0 16px;font-size:13px;line-height:1.7;color:#475569">
    The form on the right is MegaForm form <b>#$($page.Form)</b>, seeded from
    <code style="font-size:12px">$($page.Slug)</code>. It is a conversion of the mock below and is
    meant to reproduce it. Open both and compare.
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <tr>
      <td style="padding:8px 0;border-top:1px solid #e2e8f0;color:#64748b;white-space:nowrap;width:1%">Mock (reference)</td>
      <td style="padding:8px 0 8px 12px;border-top:1px solid #e2e8f0"><a href="$mockUrl" style="color:#0e7490;word-break:break-all">$mockUrl</a></td>
    </tr>
    <tr>
      <td style="padding:8px 0;border-top:1px solid #e2e8f0;color:#64748b;white-space:nowrap">This page (live)</td>
      <td style="padding:8px 0 8px 12px;border-top:1px solid #e2e8f0"><a href="$liveUrl" style="color:#0e7490;word-break:break-all">$liveUrl</a></td>
    </tr>
    <tr>
      <td style="padding:8px 0;border-top:1px solid #e2e8f0;color:#64748b;white-space:nowrap">Full width</td>
      <td style="padding:8px 0 8px 12px;border-top:1px solid #e2e8f0"><a href="$Site/mfqa-wide?mfFormId=$($page.Form)" style="color:#0e7490;word-break:break-all">$Site/mfqa-wide?mfFormId=$($page.Form)</a></td>
    </tr>
  </table>
  $measured
</div>
"@
}

foreach ($page in $PAGES) {
  $tab = $page.Tab
  Write-Host "=== $($page.Name) (tab $tab, form $($page.Form)) ==="

  if ($PSCmdlet.ShouldProcess("tab $tab", 'reparent + two-column skin')) {
    Invoke-Sql "UPDATE Tabs SET ParentId=@parent, SkinSrc=@skin, TabPath=@path WHERE TabID=@tab AND PortalID=0" @{
      parent = $ParentTab; skin = $Skin; path = "//mf-templates//$($page.Name)"; tab = $tab
    } | Out-Null
    Write-Host '  tab       : parented to mf-templates, form-2col skin'
  }

  # SINGLE pane, not two columns. These designs are 768-1152px wide; the two-column skin's right
  # pane is about 440px, which squeezed every one of them and hid rose-wellness's photographic
  # panel entirely (its aside only appears at 1024px). The review note now sits ABOVE the form.
  if ($PSCmdlet.ShouldProcess("tab $tab", 'move both modules into ContentPane')) {
    Invoke-Sql @"
UPDATE tm SET PaneName='ContentPane', ModuleOrder=2
FROM TabModules tm JOIN Modules m ON m.ModuleID = tm.ModuleID
WHERE tm.TabID=@tab AND tm.IsDeleted=0 AND m.ModuleDefID=@def
"@ @{ tab = $tab; def = $MegaFormDef } | Out-Null
    Invoke-Sql @"
UPDATE tm SET PaneName='ContentPane', ModuleOrder=1
FROM TabModules tm JOIN Modules m ON m.ModuleID = tm.ModuleID
WHERE tm.TabID=@tab AND tm.IsDeleted=0 AND m.ModuleDefID=114
"@ @{ tab = $tab } | Out-Null
    Write-Host '  panes     : note then form, both ContentPane'
  }

  # LeftPane Text/HTML module: reuse if present, otherwise clone the known-good pair.
  $moduleId = Invoke-Sql @"
SELECT TOP 1 tm.ModuleID FROM TabModules tm JOIN Modules m ON m.ModuleID = tm.ModuleID
WHERE tm.TabID=@tab AND tm.IsDeleted=0 AND m.IsDeleted=0 AND m.ModuleDefID=114
"@ @{ tab = $tab }

  if (-not $moduleId) {
    if ($PSCmdlet.ShouldProcess("tab $tab", 'clone Text/HTML module into LeftPane')) {
      $moduleId = Invoke-Sql @"
INSERT INTO Modules (ModuleDefID,AllTabs,IsDeleted,InheritViewPermissions,StartDate,EndDate,PortalID,
                     CreatedByUserID,CreatedOnDate,LastModifiedByUserID,LastModifiedOnDate,
                     LastContentModifiedOnDate,IsShareable,IsShareableViewOnly)
SELECT ModuleDefID,AllTabs,0,InheritViewPermissions,StartDate,EndDate,PortalID,
       CreatedByUserID,GETDATE(),LastModifiedByUserID,GETDATE(),GETDATE(),IsShareable,IsShareableViewOnly
FROM Modules WHERE ModuleID=@model;
SELECT CAST(SCOPE_IDENTITY() AS int);
"@ @{ model = $ModelModule }

      Invoke-Sql @"
INSERT INTO TabModules (TabID,ModuleID,PaneName,ModuleOrder,CacheTime,Alignment,Color,Border,IconFile,
                        Visibility,ContainerSrc,DisplayTitle,DisplayPrint,DisplaySyndicate,
                        CreatedByUserID,CreatedOnDate,LastModifiedByUserID,LastModifiedOnDate,IsDeleted,
                        CacheMethod,ModuleTitle)
SELECT @tab,@mod,'ContentPane',1,CacheTime,Alignment,Color,Border,IconFile,
       Visibility,ContainerSrc,0,DisplayPrint,DisplaySyndicate,
       CreatedByUserID,GETDATE(),LastModifiedByUserID,GETDATE(),0,CacheMethod,'Template review'
FROM TabModules WHERE TabModuleID=(SELECT TOP 1 TabModuleID FROM TabModules WHERE ModuleID=@model AND IsDeleted=0)
"@ @{ tab = $tab; mod = $moduleId; model = $ModelModule } | Out-Null
      Write-Host "  html      : cloned module $moduleId into LeftPane"
    }
  } else {
    # The title bar would repeat "Text/HTML" above every panel.
    Invoke-Sql "UPDATE TabModules SET DisplayTitle=0, ModuleTitle='Template review' WHERE TabID=@tab AND ModuleID=@mod" @{ tab = $tab; mod = $moduleId } | Out-Null
    Write-Host "  html      : reusing module $moduleId"
  }

  if ($moduleId -and $PSCmdlet.ShouldProcess("module $moduleId", 'write panel content')) {
    $body = Get-Panel $page
    # StateID 1 is Published on this portal's Direct Publish workflow.
    $exists = Invoke-Sql 'SELECT TOP 1 ItemID FROM HtmlText WHERE ModuleID=@mod ORDER BY ItemID DESC' @{ mod = $moduleId }
    if ($exists) {
      Invoke-Sql 'UPDATE HtmlText SET Content=@c, StateID=1, IsPublished=1, LastModifiedOnDate=GETDATE(), Version=ISNULL(Version,0)+1 WHERE ItemID=@id' @{ c = $body; id = $exists } | Out-Null
      Write-Host "  content   : updated item $exists ($($body.Length) chars)"
    } else {
      Invoke-Sql @"
INSERT INTO HtmlText (ModuleID,Content,Version,StateID,IsPublished,CreatedByUserID,CreatedOnDate,
                      LastModifiedByUserID,LastModifiedOnDate,Summary)
VALUES (@mod,@c,1,1,1,1,GETDATE(),1,GETDATE(),NULL)
"@ @{ mod = $moduleId; c = $body } | Out-Null
      Write-Host "  content   : inserted ($($body.Length) chars)"
    }
  }
}

$cn.Close()
Write-Host ''
Write-Host 'Module content is cached per module - recycle the pool before checking:'
Write-Host '  & "$env:windir\system32\inetsrv\appcmd.exe" recycle apppool /apppool.name:"DNN_MegaClean008"'
