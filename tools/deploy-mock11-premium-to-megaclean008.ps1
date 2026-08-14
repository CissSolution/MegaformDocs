param(
  [string]$PackageDir = "$PSScriptRoot\..\dist\premium-mock11-live-package",
  [string]$ServerInstance = "WINDOWS-11\SQLEXPRESS",
  [string]$Database = "DNN_MegaClean008"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Data

$appScope = "mock11-premium-forms"
$connString = "Data Source=$ServerInstance;Initial Catalog=$Database;Integrated Security=True"
$conn = New-Object System.Data.SqlClient.SqlConnection($connString)
$conn.Open()

function New-Command($sql) {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $sql
  $cmd.CommandTimeout = 30
  return $cmd
}

function Add-Param($cmd, $name, $value) {
  $p = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::NVarChar)
  if ($null -eq $value) { $p.Value = [DBNull]::Value } else { $p.Value = [string]$value }
}

function Add-IntParam($cmd, $name, $value) {
  $p = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::Int)
  if ($null -eq $value) { $p.Value = [DBNull]::Value } else { $p.Value = [int]$value }
}

try {
  $forms = @()
  Get-ChildItem -Path (Join-Path $PackageDir "forms") -Filter "*.json" | Sort-Object Name | ForEach-Object {
    $bundle = Get-Content $_.FullName -Raw | ConvertFrom-Json
    $settings = $bundle.settingsJson | ConvertFrom-Json
    $description = ""
    try {
      $schema = $bundle.schemaJson | ConvertFrom-Json
      $description = [string]$schema.settings.templateSlug
    } catch {}
    $submitText = if ($settings.submitButtonText) { [string]$settings.submitButtonText } else { "Submit" }
    $successMessage = if ($settings.successMessage) { [string]$settings.successMessage } else { "" }

    $cmd = New-Command @"
DECLARE @existing INT = (
  SELECT TOP 1 FormId
  FROM dbo.MF_Forms
  WHERE AppScope = @appScope AND Title = @title
  ORDER BY FormId
);
IF @existing IS NOT NULL
BEGIN
  UPDATE dbo.MF_Forms
     SET SchemaJson = @schemaJson,
         SettingsJson = @settingsJson,
         ThemeJson = N'{}',
         [Status] = N'Published',
         SubmitButtonText = @submitText,
         SuccessMessage = @successMessage,
         UpdatedByUserId = 1,
         UpdatedOnUtc = SYSUTCDATETIME()
   WHERE FormId = @existing;
  SELECT @existing;
END
ELSE
BEGIN
  INSERT INTO dbo.MF_Forms
    (ModuleId, PortalId, Title, [Description], SchemaJson, SettingsJson, ThemeJson, [Status],
     SubmitButtonText, SuccessMessage, RequireAuth, EnableCaptcha, EnableSaveResume,
     AppScope, CreatedByUserId, CreatedOnUtc, UpdatedByUserId, UpdatedOnUtc)
  VALUES
    (0, 0, @title, @description, @schemaJson, @settingsJson, N'{}', N'Published',
     @submitText, @successMessage, 0, 0, 0,
     @appScope, 1, SYSUTCDATETIME(), 1, SYSUTCDATETIME());
  SELECT CAST(SCOPE_IDENTITY() AS INT);
END
"@
    Add-Param $cmd "@appScope" $appScope
    Add-Param $cmd "@title" $bundle.title
    Add-Param $cmd "@description" $description
    Add-Param $cmd "@schemaJson" $bundle.schemaJson
    Add-Param $cmd "@settingsJson" $bundle.settingsJson
    Add-Param $cmd "@submitText" $submitText
    Add-Param $cmd "@successMessage" $successMessage
    $id = [int]$cmd.ExecuteScalar()
    $forms += [pscustomobject]@{
      formId = $id
      title = [string]$bundle.title
      file = $_.Name
      route = "http://megaclean008.ai/?mfFormId=$id"
      apiRoute = "http://megaclean008.ai/DesktopModules/MegaForm/API/MegaFormApi/Schema?formId=$id"
    }
  }

  $kbCount = 0
  $kbPath = Join-Path $PackageDir "kb\index.json"
  if (Test-Path $kbPath) {
    $kbRows = Get-Content $kbPath -Raw | ConvertFrom-Json
    foreach ($row in $kbRows) {
      $cmd = New-Command @"
DECLARE @existing INT = (
  SELECT TOP 1 Id
  FROM dbo.MF_AI_Knowledge
  WHERE Slug = @slug AND PortalId IS NULL
  ORDER BY Id
);
IF @existing IS NOT NULL
BEGIN
  UPDATE dbo.MF_AI_Knowledge
     SET Kind = @kind,
         Title = @title,
         Summary = @summary,
         Body = @body,
         Tags = @tags,
         Source = N'mock11-template',
         Version = Version + 1,
         UpdatedByUserId = 1,
         UpdatedOnDate = SYSUTCDATETIME()
   WHERE Id = @existing;
END
ELSE
BEGIN
  INSERT INTO dbo.MF_AI_Knowledge
    (Slug, Kind, Title, Summary, Body, Tags, Examples, PortalId, Source, Version,
     CreatedByUserId, CreatedOnDate, WidgetType, Surface)
  VALUES
    (@slug, @kind, @title, @summary, @body, @tags, N'', NULL, N'mock11-template', 1,
     1, SYSUTCDATETIME(), N'', N'');
END
"@
      Add-Param $cmd "@slug" $row.slug
      Add-Param $cmd "@kind" $row.kind
      Add-Param $cmd "@title" $row.title
      Add-Param $cmd "@summary" $row.summary
      Add-Param $cmd "@body" $row.body
      Add-Param $cmd "@tags" $row.tags
      [void]$cmd.ExecuteNonQuery()
      $kbCount++
    }
  }

  [pscustomobject]@{
    ok = $true
    appScope = $appScope
    forms = $forms
    kb = $kbCount
  } | ConvertTo-Json -Depth 6
}
finally {
  $conn.Close()
}
