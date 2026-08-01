<#
.SYNOPSIS
    Move date values that were stored as culture-formatted TEXT back into the typed date table.

.DESCRIPTION
    THE BUG THIS REPAIRS.

    MegaForm.Core.Services.Blog.BlogAnalyticsRollupService rebuilds a post's DataJson from resolved
    typed values and writes it back. On a server whose culture is not invariant, the dates come back
    out as culture-formatted TEXT:

        before   "publish_date":"2024-12-12T00:00:00"      (ISO)
        after    "publish_date":"15/12/2024 12:00:00 SA"   (vi-VN)

    The typed resync then re-normalises that JSON, and SubmissionFieldNormalizer cannot parse a
    vi-VN date with InvariantCulture — so it takes its "lossless fallback" branch and stores the
    value as a STRING instead of a DATE:

        MegaForm.Core/Services/TypedSubmission/SubmissionFieldNormalizer.cs
            case SubmissionDataType.Date:
                if (DateTime.TryParse(p, CultureInfo.InvariantCulture, ...)) values.DateValues.Add(dt);
                else if (!string.IsNullOrWhiteSpace(p)) AddLosslessString(values, p);   // <-- here

    From then on the affected post's publish_date is a string while every other post's is a
    DateTime. Any named query that sorts on a date then dies with

        InvalidOperationException: Failed to compare two elements in the array

    and the public blog plus the whole editorial console render "content could not be loaded" for
    every visitor. Measured on the Oqtane QA site 2026-07-31: 5 field rows across 2 posts.

    Repairing the DataJson alone is NOT enough — reads come from typed storage, so the misplaced
    value rows are what has to move.

.PARAMETER ConnectionString
    SQL Server connection string for the MegaForm database.

.PARAMETER Culture
    Culture to parse the stranded text with. Defaults to the server's own culture, which is the one
    that produced it.

.PARAMETER WhatIf
    Report what would move and change nothing.

.EXAMPLE
    .\Repair-TypedDateValues.ps1 -ConnectionString '...' -WhatIf
    .\Repair-TypedDateValues.ps1 -ConnectionString '...'

.NOTES
    Restart the site afterwards; submissions are cached in process.
    Take a database backup first. This deletes the stranded string rows after copying them across.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string] $ConnectionString,
    [string] $Culture = [System.Globalization.CultureInfo]::CurrentCulture.Name
)

$ErrorActionPreference = 'Stop'
$parseCulture = [System.Globalization.CultureInfo]::GetCultureInfo($Culture)

Write-Host "Scanning for date fields whose value is stored as text (parsing with '$Culture')..." -ForegroundColor Cyan

$rows = Invoke-Sqlcmd -ConnectionString $ConnectionString -Query @'
SELECT f.SubmissionFieldId, f.SubmissionId, f.FormId, f.FieldKey, s.Value
FROM MF_SubmissionFields f
JOIN MF_SubmissionValueString s ON s.SubmissionFieldId = f.SubmissionFieldId
WHERE f.DataType = 'date'
ORDER BY f.SubmissionId, f.FieldKey
'@

if (-not $rows) {
    Write-Host "Nothing to repair." -ForegroundColor Green
    return
}

Write-Host ("Found {0} stranded value(s)." -f @($rows).Count) -ForegroundColor Yellow

$conn = New-Object System.Data.SqlClient.SqlConnection $ConnectionString
$conn.Open()
try {
    foreach ($r in $rows) {
        $parsed = [datetime]::MinValue
        if (-not [datetime]::TryParse($r.Value, $parseCulture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
            Write-Warning ("  sub={0,-6} {1,-20} UNPARSEABLE '{2}' - left alone" -f $r.SubmissionId, $r.FieldKey, $r.Value)
            continue
        }

        $target = "sub=$($r.SubmissionId) $($r.FieldKey)"
        if (-not $PSCmdlet.ShouldProcess($target, "move '$($r.Value)' -> $($parsed.ToString('yyyy-MM-dd'))")) { continue }

        $ins = $conn.CreateCommand()
        $ins.CommandText = @'
INSERT INTO MF_SubmissionValueDate (SubmissionFieldId, SubmissionId, FormId, FieldKey, Ordinal, Value)
VALUES (@fid, @sid, @form, @key, 0, @val)
'@
        $null = $ins.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@fid',  [long]$r.SubmissionFieldId)))
        $null = $ins.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@sid',  [int]$r.SubmissionId)))
        $null = $ins.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@form', [int]$r.FormId)))
        $null = $ins.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@key',  [string]$r.FieldKey)))
        $null = $ins.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@val',  [datetime]$parsed)))
        $null = $ins.ExecuteNonQuery()

        $del = $conn.CreateCommand()
        $del.CommandText = 'DELETE FROM MF_SubmissionValueString WHERE SubmissionFieldId = @fid'
        $null = $del.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@fid', [long]$r.SubmissionFieldId)))
        $removed = $del.ExecuteNonQuery()

        Write-Host ("  sub={0,-6} {1,-20} -> {2}  (dropped {3} text row)" -f `
            $r.SubmissionId, $r.FieldKey, $parsed.ToString('yyyy-MM-dd'), $removed) -ForegroundColor Green
    }
}
finally {
    $conn.Close()
}

Write-Host "Done. RESTART the site - submissions are cached in process." -ForegroundColor Yellow
