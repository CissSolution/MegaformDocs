# Re-bake MF_Forms.SettingsJson.viewCatalog so the wrapper + row templates the
# Razor runtime sees match what was just written to MF_Views.
#
# The runtime reads its view catalog from a serialized snapshot inside the
# parent form's settings JSON; updating MF_Views alone is not enough.
#
# Usage: pwsh -File _rebake-form-catalogs.ps1

$ErrorActionPreference = 'Stop'
$ConnStr = 'Server=.\SQLEXPRESS;Database=Oqtane_MSSQL;Trusted_Connection=True;Encrypt=False'

$TplDir = Split-Path -Parent $PSCommandPath
$Templates = @{
  'document-card'           = @{ Wrapper = 'DocumentCard.html';      Row = '_rowtemplates\DocumentCard.row.html' }
  'document-routing-board'  = @{ Wrapper = 'DocumentCard.html';      Row = '_rowtemplates\DocumentCard.row.html' }
  'leave-request-board'     = @{ Wrapper = 'LeaveRequestRow.html';   Row = '_rowtemplates\LeaveRequestRow.row.html' }
  'leave-request-card'      = @{ Wrapper = 'LeaveRequestRow.html';   Row = '_rowtemplates\LeaveRequestRow.row.html' }
  'leave-request-register'  = @{ Wrapper = 'LeaveRequestRow.html';   Row = '_rowtemplates\LeaveRequestRow.row.html' }
  'proposal-card'           = @{ Wrapper = 'ProposalDetail.html';    Row = '_rowtemplates\LeaveRequestRow.row.html' }
  'proposal-review-board'   = @{ Wrapper = 'ProposalDetail.html';    Row = '_rowtemplates\LeaveRequestRow.row.html' }
  'proposal-finance-board'  = @{ Wrapper = 'ProposalDetail.html';    Row = '_rowtemplates\LeaveRequestRow.row.html' }
  'proposal-register'       = @{ Wrapper = 'ProposalDetail.html';    Row = '_rowtemplates\LeaveRequestRow.row.html' }
  'po-card'                 = @{ Wrapper = 'PurchaseOrderCard.html'; Row = '_rowtemplates\LeaveRequestRow.row.html' }
  'po-board'                = @{ Wrapper = 'PurchaseOrderCard.html'; Row = '_rowtemplates\LeaveRequestRow.row.html' }
  'po-detail'               = @{ Wrapper = 'PurchaseOrderCard.html'; Row = '_rowtemplates\LeaveRequestRow.row.html' }
}

$loadedTemplates = @{}
foreach ($key in $Templates.Keys) {
  $wPath = Join-Path $TplDir $Templates[$key].Wrapper
  $rPath = Join-Path $TplDir $Templates[$key].Row
  if ((Test-Path $wPath) -and (Test-Path $rPath)) {
    $loadedTemplates[$key] = @{
      Wrapper = Get-Content -Path $wPath -Raw -Encoding UTF8
      Row     = Get-Content -Path $rPath -Raw -Encoding UTF8
    }
  } else {
    Write-Warning "Template files missing for $key (skipping)"
  }
}
Write-Output "Loaded $($loadedTemplates.Count) view-key template pairs"

Add-Type -AssemblyName 'Microsoft.Data.SqlClient' -ErrorAction SilentlyContinue
# Fall back to System.Data.SqlClient if Microsoft.Data.SqlClient isn't loadable
$useMs = $true
try { [Microsoft.Data.SqlClient.SqlConnection] | Out-Null } catch { $useMs = $false }
if (-not $useMs) {
  Add-Type -AssemblyName 'System.Data'
}

function New-Conn {
  if ($script:useMs) { return [Microsoft.Data.SqlClient.SqlConnection]::new($script:ConnStr) }
  return [System.Data.SqlClient.SqlConnection]::new($script:ConnStr)
}

$conn = New-Conn
$conn.Open()

$cmd = $conn.CreateCommand()
$cmd.CommandText = @'
SELECT FormId, ISNULL(SettingsJson, '{}') AS SettingsJson
FROM MF_Forms
WHERE SettingsJson LIKE '%viewCatalog%'
'@
$reader = $cmd.ExecuteReader()
$rows = New-Object System.Collections.Generic.List[object]
while ($reader.Read()) {
  $rows.Add([pscustomobject]@{ FormId = $reader.GetInt32(0); SettingsJson = $reader.GetString(1) })
}
$reader.Close()

Write-Output "Found $($rows.Count) forms with a viewCatalog"

$touchedForms = 0
$touchedViews = 0
foreach ($row in $rows) {
  try {
    $obj = $row.SettingsJson | ConvertFrom-Json -Depth 64
  } catch {
    Write-Warning "FormId $($row.FormId) settings JSON unparseable: $_"
    continue
  }
  $catalog = $obj.viewCatalog
  if (-not $catalog) { $catalog = $obj.ViewCatalog }
  if (-not $catalog) { continue }

  $rowTouched = $false
  foreach ($view in $catalog) {
    $viewKey = ($view.viewKey  | Out-String).Trim()
    if (-not $viewKey) { $viewKey = ($view.ViewKey | Out-String).Trim() }
    if (-not $loadedTemplates.ContainsKey($viewKey)) { continue }

    $tpl = $loadedTemplates[$viewKey]
    # Patch CustomHtml (wrapper)
    if ($view.PSObject.Properties.Match('customHtml').Count -gt 0) {
      $view.customHtml = $tpl.Wrapper
    } else {
      Add-Member -InputObject $view -MemberType NoteProperty -Name customHtml -Value $tpl.Wrapper -Force
    }

    # Patch ConfigJson.rowTemplate + wrapperTemplate
    $cfgRaw = $view.configJson
    if (-not $cfgRaw) { $cfgRaw = '{}' }
    try {
      $cfg = $cfgRaw | ConvertFrom-Json -Depth 32
    } catch {
      $cfg = [pscustomobject]@{}
    }
    if ($cfg.PSObject.Properties.Match('rowTemplate').Count -gt 0) {
      $cfg.rowTemplate = $tpl.Row
    } else {
      Add-Member -InputObject $cfg -MemberType NoteProperty -Name rowTemplate -Value $tpl.Row -Force
    }
    if ($cfg.PSObject.Properties.Match('wrapperTemplate').Count -gt 0) {
      $cfg.wrapperTemplate = $tpl.Wrapper
    } else {
      Add-Member -InputObject $cfg -MemberType NoteProperty -Name wrapperTemplate -Value $tpl.Wrapper -Force
    }
    $view.configJson = ($cfg | ConvertTo-Json -Depth 32 -Compress)

    $rowTouched = $true
    $touchedViews++
  }

  if ($rowTouched) {
    $newJson = $obj | ConvertTo-Json -Depth 64 -Compress
    $upd = $conn.CreateCommand()
    $upd.CommandText = 'UPDATE MF_Forms SET SettingsJson = @j WHERE FormId = @id'
    [void]$upd.Parameters.AddWithValue('@j', $newJson)
    [void]$upd.Parameters.AddWithValue('@id', $row.FormId)
    $rc = $upd.ExecuteNonQuery()
    Write-Output "FormId $($row.FormId): updated, rows=$rc, new SettingsJson length=$($newJson.Length)"
    $touchedForms++
  }
}

$conn.Close()
Write-Output "Done. forms touched=$touchedForms, view catalog entries patched=$touchedViews"
