<#
.SYNOPSIS
    Bind the blog forms into the blog-starter app manifest so analytics can roll up.

.DESCRIPTION
    THE BUG THIS REPAIRS, AND WHY IT IS INVISIBLE.

    MegaForm.Core.Services.Blog.BlogAnalyticsRollupService is what turns reader-event rows into
    each post's view_count / unique_readers / share_count / like_count / bookmark_count /
    newsletter_clicks. It finds the forms it needs like this:

        var formIds = BlogManifestHelper.GetFormIdMap(app);          // reads app.ManifestJson.Forms
        if (!formIds.TryGetValue("posts", out var postsFormId) ...)  return 0;
        if (!formIds.TryGetValue("reader-events", out var ...))      return 0;

    On a seeded install the manifest ships with an EMPTY Forms array. GetFormIdMap therefore
    returns nothing, the service returns 0 on its second line, and no post's view_count is ever
    written. Nothing logs an error, because nothing went wrong — the service simply had no work.
    Measured on the Oqtane QA site: 60 seeded reader-events, 28 posts, and not one view_count row.

    The blog MODULE never noticed because it resolves forms defensively by schema shape
    (BlogData.ResolveCommentsFormIdAsync, BlogReadTracker.ResolveReaderEventsFormIdAsync). Core's
    rollup has no such fallback, and Core is not ours to change here — so the manifest, which is
    data, gets corrected instead.

    This script is idempotent and additive: it only fills bindings that are missing, never removes
    or rewrites one that is already present, and prints the manifest before and after.

.PARAMETER ConnectionString
    A SQL Server connection string for the MegaForm database (Oqtane or DNN — same schema).

.PARAMETER AppKey
    App to repair. Defaults to blog-starter.

.PARAMETER WhatIf
    Report what would change and write nothing.

.EXAMPLE
    .\Repair-BlogAppManifest.ps1 -ConnectionString 'Server=.\SQLEXPRESS;Database=Oqtane_MegaForm_Clean2010;Trusted_Connection=True;TrustServerCertificate=True' -WhatIf

.NOTES
    After running this against a live site, RESTART it (or clear its cache): app definitions are
    cached in process, so the rollup keeps using the empty manifest until the cache is dropped.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string] $ConnectionString,
    [string] $AppKey = 'blog-starter'
)

$ErrorActionPreference = 'Stop'

# alias -> the title fragment that identifies the form. Matches the keys
# BlogManifestHelper.ResolveKey recognises: posts | categories | comments | reader-events.
$wanted = [ordered]@{
    'posts'         = @{ Match = 'Blog Publishing'; Title = 'Blog Publishing Starter'; Primary = $true }
    'categories'    = @{ Match = 'Blog Categories'; Title = 'Blog Categories';         Primary = $false }
    'comments'      = @{ Match = 'Blog Comments';   Title = 'Blog Comments';           Primary = $false }
    'reader-events' = @{ Match = 'Blog Reader';     Title = 'Blog Reader Events';      Primary = $false }
}

# ⚠️ Oqtane and DNN do NOT share table names for app definitions: Oqtane writes MF_Apps, DNN writes
# MF_AppDefinitions. Both carry AppId / PortalId / ManifestJson, so only the table differs. Detect
# it rather than asking the operator, because getting it wrong on production means "app not found"
# on a site that plainly has one.
$appTable = (Invoke-Sqlcmd -ConnectionString $ConnectionString -Query @'
SELECT TOP 1 name FROM sys.tables WHERE name IN ('MF_Apps','MF_AppDefinitions') ORDER BY name DESC
'@).name
if (-not $appTable) { throw "Neither MF_Apps nor MF_AppDefinitions exists in this database." }

Write-Host "Reading app '$AppKey' from $appTable..." -ForegroundColor Cyan
$app = Invoke-Sqlcmd -ConnectionString $ConnectionString -MaxCharLength 1000000 -Query @"
SELECT TOP 1 AppId, PortalId, CAST(ManifestJson AS NVARCHAR(MAX)) AS ManifestJson
FROM $appTable WHERE AppKey = '$AppKey'
"@

if (-not $app) { throw "App '$AppKey' was not found in $appTable." }

Write-Host ("  AppId={0} PortalId={1}" -f $app.AppId, $app.PortalId)

$manifest = $app.ManifestJson | ConvertFrom-Json
$existing = @()
if ($manifest.Forms) { $existing = @($manifest.Forms) }
Write-Host ("  bindings before: {0}" -f $existing.Count)

# Resolve each wanted form by title within this portal.
$portalId = $app.PortalId
$resolved = @()
foreach ($alias in $wanted.Keys) {
    $spec = $wanted[$alias]

    if ($existing | Where-Object { $_.Alias -eq $alias }) {
        Write-Host ("  {0,-14} already bound - left alone" -f $alias) -ForegroundColor DarkGray
        continue
    }

    $match = $spec.Match
    $form = Invoke-Sqlcmd -ConnectionString $ConnectionString -Query @"
SELECT TOP 1 FormId, Title FROM MF_Forms
WHERE PortalId = $portalId AND Title LIKE '%$match%'
ORDER BY FormId
"@
    if (-not $form) {
        Write-Warning ("  {0,-14} NO FORM matching '{1}' - skipped" -f $alias, $match)
        continue
    }

    Write-Host ("  {0,-14} -> FormId {1} ({2})" -f $alias, $form.FormId, $form.Title) -ForegroundColor Green
    $resolved += [pscustomobject]@{
        FormId    = [int]$form.FormId
        Alias     = $alias
        Role      = $alias
        Title     = $form.Title
        IsPrimary = [bool]$spec.Primary
    }
}

if ($resolved.Count -eq 0) {
    Write-Host "Nothing to add - the manifest is already bound." -ForegroundColor Yellow
    return
}

$merged = @($existing) + @($resolved)
$manifest | Add-Member -NotePropertyName Forms -NotePropertyValue $merged -Force
$updatedJson = $manifest | ConvertTo-Json -Depth 12 -Compress

Write-Host ("  bindings after:  {0}" -f $merged.Count) -ForegroundColor Cyan

if ($PSCmdlet.ShouldProcess("$appTable.AppId=$($app.AppId)", "write $($merged.Count) form bindings")) {
    # Parameterised on purpose: a manifest contains quotes and braces, and string-building this
    # into the statement is how you corrupt an app definition.
    $conn = New-Object System.Data.SqlClient.SqlConnection $ConnectionString
    $conn.Open()
    try {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "UPDATE $appTable SET ManifestJson = @json WHERE AppId = @id"
        $null = $cmd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@json', $updatedJson)))
        $null = $cmd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@id', [int]$app.AppId)))
        $rows = $cmd.ExecuteNonQuery()
        Write-Host "Updated $rows row(s)." -ForegroundColor Green
        Write-Host "RESTART the site (or clear its cache) - app definitions are cached in process." -ForegroundColor Yellow
    }
    finally {
        $conn.Close()
    }
}
