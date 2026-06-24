# Export the live DNN MF_AI_Knowledge / Templates / Rules (Source='megaform-builtin')
# to MegaForm.Core/Seed/ai-knowledge-seed.json. The Oqtane seeder reads this on
# first launch when its tables are empty.

$ErrorActionPreference = 'Stop'
$ServerInstance = 'WINDOWS-11\SQLEXPRESS'
$Database       = 'DNN10322_MegaF'
$Output         = Join-Path $PSScriptRoot '..\..\MegaForm.Core\Seed\ai-knowledge-seed.json'
$OutputDir      = Split-Path -Parent $Output
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }

Write-Host '  Exporting entries...'
$entries = Invoke-Sqlcmd -ServerInstance $ServerInstance -Database $Database -MaxCharLength 1000000 -Query @"
SELECT Id, Slug, Kind, Title, Summary, Body, Tags, Examples, PortalId, Source, Version
FROM MF_AI_Knowledge WHERE Source = 'megaform-builtin' ORDER BY Id
"@ | ForEach-Object {
  @{
    Id       = [int]$_.Id
    Slug     = [string]$_.Slug
    Kind     = [string]$_.Kind
    Title    = [string]$_.Title
    Summary  = if ($_.Summary -is [DBNull]) { $null } else { [string]$_.Summary }
    Body     = if ($_.Body -is [DBNull])     { $null } else { [string]$_.Body }
    Tags     = if ($_.Tags -is [DBNull])     { $null } else { [string]$_.Tags }
    Examples = if ($_.Examples -is [DBNull]) { $null } else { [string]$_.Examples }
    PortalId = if ($_.PortalId -is [DBNull]) { $null } else { [int]$_.PortalId }
    Source   = [string]$_.Source
    Version  = [int]$_.Version
  }
}
Write-Host ('    ' + $entries.Count + ' entries')

Write-Host '  Exporting templates...'
$templates = Invoke-Sqlcmd -ServerInstance $ServerInstance -Database $Database -MaxCharLength 1000000 -Query @"
SELECT t.Id, k.Slug AS KnowledgeSlug, t.TemplateKey, t.Kind, t.Title, t.Summary,
       t.Body, t.Tags, t.Score, t.SortOrder, t.PortalId, t.Source, t.Version
FROM MF_AI_KB_Templates t JOIN MF_AI_Knowledge k ON k.Id = t.KnowledgeId
WHERE t.Source = 'megaform-builtin' ORDER BY t.Id
"@ | ForEach-Object {
  @{
    Id            = [int]$_.Id
    KnowledgeSlug = [string]$_.KnowledgeSlug
    TemplateKey   = [string]$_.TemplateKey
    Kind          = [string]$_.Kind
    Title         = [string]$_.Title
    Summary       = if ($_.Summary -is [DBNull]) { $null } else { [string]$_.Summary }
    Body          = [string]$_.Body
    Tags          = if ($_.Tags -is [DBNull])     { $null } else { [string]$_.Tags }
    Score         = [int]$_.Score
    SortOrder     = [int]$_.SortOrder
    PortalId      = if ($_.PortalId -is [DBNull]) { $null } else { [int]$_.PortalId }
    Source        = [string]$_.Source
    Version       = [int]$_.Version
  }
}
Write-Host ('    ' + $templates.Count + ' templates')

Write-Host '  Exporting rules...'
$rules = Invoke-Sqlcmd -ServerInstance $ServerInstance -Database $Database -MaxCharLength 1000000 -Query @"
SELECT r.RuleId, k.Slug AS KnowledgeSlug, r.WidgetType, r.Title, r.Severity,
       r.Condition, r.RegexPattern, r.RejectionMessage, r.FixHint, r.Source,
       r.Version, r.Enabled, r.PortalId
FROM MF_AI_KB_Rules r LEFT JOIN MF_AI_Knowledge k ON k.Id = r.KnowledgeId
WHERE r.Source = 'megaform-builtin' ORDER BY r.RuleId
"@ | ForEach-Object {
  @{
    RuleId           = [string]$_.RuleId
    KnowledgeSlug    = if ($_.KnowledgeSlug -is [DBNull]) { $null } else { [string]$_.KnowledgeSlug }
    WidgetType       = if ($_.WidgetType -is [DBNull])    { $null } else { [string]$_.WidgetType }
    Title            = [string]$_.Title
    Severity         = [string]$_.Severity
    Condition        = [string]$_.Condition
    RegexPattern     = if ($_.RegexPattern -is [DBNull]) { $null } else { [string]$_.RegexPattern }
    RejectionMessage = [string]$_.RejectionMessage
    FixHint          = [string]$_.FixHint
    Source           = [string]$_.Source
    Version          = [int]$_.Version
    Enabled          = [bool]$_.Enabled
    PortalId         = if ($_.PortalId -is [DBNull]) { $null } else { [int]$_.PortalId }
  }
}
Write-Host ('    ' + $rules.Count + ' rules')

$payload = @{
  exportedOnUtc = (Get-Date).ToUniversalTime().ToString('o')
  schemaVersion = 1
  entries       = $entries
  templates     = $templates
  rules         = $rules
}

$json = $payload | ConvertTo-Json -Depth 100 -Compress
[System.IO.File]::WriteAllText($Output, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host ('Wrote ' + $Output + ' (' + [Math]::Round((Get-Item $Output).Length/1KB, 1) + ' KB)')
