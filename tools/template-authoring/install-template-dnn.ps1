# Install a MegaForm template JSON straight into a DNN site's MF_Forms table so it can be
# rendered and visually QA'd without clicking through the builder.
#
#   powershell -ExecutionPolicy Bypass -File install-template-dnn.ps1 `
#       -Server "WINDOWS-11\SQLEXPRESS" -Database DNN_MegaClean008 -ModuleId 10599 `
#       -Template ..\..\Samples\FormTemplates\Premium\DONEE\holiday-request-travel.json
#
# Uses SqlClient with parameters rather than Invoke-Sqlcmd string interpolation: the schema
# and settings payloads are tens of KB of JSON full of quotes and braces, which do not survive
# being pasted into a query string.

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Server,
    [Parameter(Mandatory)][string]$Database,
    [Parameter(Mandatory)][int]$ModuleId,
    [Parameter(Mandatory)][string]$Template,
    [int]$PortalId = 0,
    [string]$Status = 'Published'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data

$json = [System.IO.File]::ReadAllText((Resolve-Path $Template), [System.Text.Encoding]::UTF8)
$tpl = $json | ConvertFrom-Json

$schema = @{ version = '1.0'; fields = $tpl.fields } | ConvertTo-Json -Depth 40 -Compress
$settings = $tpl.settings | ConvertTo-Json -Depth 40 -Compress
$title = $tpl.title

$conn = New-Object System.Data.SqlClient.SqlConnection("Data Source=$Server;Initial Catalog=$Database;Integrated Security=True")
$conn.Open()
try {
    # Re-running the script on the same title updates in place instead of stacking duplicates.
    $find = $conn.CreateCommand()
    $find.CommandText = "SELECT TOP 1 FormId FROM MF_Forms WHERE PortalId=@p AND Title=@t ORDER BY FormId DESC"
    [void]$find.Parameters.AddWithValue('@p', $PortalId)
    [void]$find.Parameters.AddWithValue('@t', $title)
    $existing = $find.ExecuteScalar()

    $cmd = $conn.CreateCommand()
    if ($existing) {
        $cmd.CommandText = @"
UPDATE MF_Forms
   SET SchemaJson=@schema, SettingsJson=@settings, [Status]=@status,
       SubmitButtonText=@submit, SuccessMessage=@success, UpdatedOnUtc=SYSUTCDATETIME()
 WHERE FormId=@id;
SELECT @id;
"@
        [void]$cmd.Parameters.AddWithValue('@id', $existing)
    } else {
        $cmd.CommandText = @"
INSERT INTO MF_Forms (ModuleId, PortalId, Title, [Description], SchemaJson, SettingsJson, [Status],
                      SubmitButtonText, SuccessMessage, CreatedByUserId, CreatedOnUtc)
VALUES (@module, @portal, @title, @desc, @schema, @settings, @status,
        @submit, @success, 1, SYSUTCDATETIME());
SELECT CAST(SCOPE_IDENTITY() AS INT);
"@
        [void]$cmd.Parameters.AddWithValue('@module', $ModuleId)
        [void]$cmd.Parameters.AddWithValue('@portal', $PortalId)
        [void]$cmd.Parameters.AddWithValue('@title', $title)
        [void]$cmd.Parameters.AddWithValue('@desc', [string]$tpl.description)
    }
    [void]$cmd.Parameters.AddWithValue('@schema', $schema)
    [void]$cmd.Parameters.AddWithValue('@settings', $settings)
    [void]$cmd.Parameters.AddWithValue('@status', $Status)
    [void]$cmd.Parameters.AddWithValue('@submit', [string]$tpl.submitButtonText)
    [void]$cmd.Parameters.AddWithValue('@success', [string]$tpl.successMessage)

    $formId = $cmd.ExecuteScalar()
    $verb = if ($existing) { 'updated' } else { 'created' }
    Write-Host ("{0,-40} {1} FormId={2}  schema={3}B settings={4}B" -f $tpl.slug, $verb, $formId, $schema.Length, $settings.Length)
} finally {
    $conn.Close()
}
