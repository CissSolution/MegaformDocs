<#
    [GalleryUrlSetting v20260801] Point a DNN site's MegaForm Online Gallery at a repo URL.

    The module READS host setting "MegaForm_GalleryRepoUrl" (BuilderTemplatesController
    .BuildGalleryService) and has no endpoint that writes it, so this is the supported way
    to override the built-in default without deploying a DLL. An empty/absent setting means
    "use GalleryRepositoryService.DefaultRepoBaseUrl".

    Why you might need it: builds older than 2026-08-01 default to the jsDelivr CDN, whose
    branch listing froze on a six-day-old commit and silently hid seven published templates.
    Pointing the setting at GitHub Pages fixes it on the OLD dll, because Pages is not a host
    the reconcile knows how to enumerate - so the manifest is taken at face value.

    Two things that make this look like it did not work:
      - DNN caches host settings in memory. Nothing changes until the cache is cleared;
        -RecycleAppPool does that, or use Persona Bar > Clear Cache.
      - The gallery service also caches the manifest for 15 minutes per process.

    Usage:
      .\tools\gallery\Set-DnnGalleryUrl.ps1 -Database DNN_MegaClean008 -RecycleAppPool
      .\tools\gallery\Set-DnnGalleryUrl.ps1 -Database DNN_ACME_GUIDE,DNN10_3_3_Test20 -WhatIfOnly
      .\tools\gallery\Set-DnnGalleryUrl.ps1 -Database X -Url '' -RecycleAppPool   # back to default
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]]$Database,
    [string]$ServerInstance = 'WINDOWS-11\SQLEXPRESS',
    [string]$Url = 'https://CissSolution.github.io/megaform-gallery/',
    [switch]$RecycleAppPool,
    [switch]$WhatIfOnly
)

$ErrorActionPreference = 'Stop'
$KEY = 'MegaForm_GalleryRepoUrl'

# The capitals matter: GitHub Pages answers this owner subdomain case-sensitively, and
# cissolution.github.io returns 404 while CissSolution.github.io serves.
if ($Url -and $Url -match 'github\.io' -and $Url -cnotmatch 'CissSolution\.github\.io') {
    Write-Host "WARNING: '$Url' is a github.io URL but not the exact-case CissSolution.github.io." -ForegroundColor Yellow
    Write-Host "         Lowercase spellings return 404. Continue only if you meant a different owner." -ForegroundColor Yellow
}

foreach ($db in $Database) {
    Write-Host "`n== $db" -ForegroundColor Cyan

    $before = Invoke-Sqlcmd -ServerInstance $ServerInstance -Database $db `
        -Query "SELECT SettingValue FROM dbo.HostSettings WHERE SettingName='$KEY'"
    if ($before) { Write-Host "  truoc : $($before.SettingValue)" } else { Write-Host '  truoc : (chua dat - dang dung default trong DLL)' }
    Write-Host "  sau   : $(if ([string]::IsNullOrWhiteSpace($Url)) { '(xoa - quay ve default)' } else { $Url })"

    if ($WhatIfOnly) { Write-Host '  -WhatIfOnly: khong ghi.' -ForegroundColor Yellow; continue }

    if ([string]::IsNullOrWhiteSpace($Url)) {
        $write = "DELETE FROM dbo.HostSettings WHERE SettingName='$KEY';"
    } else {
        # SettingValue is NOT NULL, so upsert rather than blind insert.
        $write = @"
IF EXISTS (SELECT 1 FROM dbo.HostSettings WHERE SettingName='$KEY')
    UPDATE dbo.HostSettings
       SET SettingValue='$Url', LastModifiedByUserID=1, LastModifiedOnDate=GETDATE()
     WHERE SettingName='$KEY';
ELSE
    INSERT INTO dbo.HostSettings
        (SettingName, SettingValue, SettingIsSecure, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate)
    VALUES ('$KEY','$Url',0,1,GETDATE(),1,GETDATE());
"@
    }

    Invoke-Sqlcmd -ServerInstance $ServerInstance -Database $db -Query $write
    $after = Invoke-Sqlcmd -ServerInstance $ServerInstance -Database $db `
        -Query "SELECT SettingValue FROM dbo.HostSettings WHERE SettingName='$KEY'"
    $now = if ($after) { $after.SettingValue } else { '(khong co dong nao)' }
    Write-Host "  ghi xong, doc lai: $now" -ForegroundColor Green
}

if (-not $WhatIfOnly -and $RecycleAppPool) {
    Write-Host "`n== Recycle app pool (de DNN bo cache host settings)" -ForegroundColor Cyan
    try {
        Import-Module WebAdministration -ErrorAction Stop
        # Site name is not derivable from the database name, so recycle by matching the DB
        # name against site names - and say plainly which ones were not matched.
        foreach ($db in $Database) {
            $sites = @(Get-Website | Where-Object { $_.Name -replace '[^A-Za-z0-9]', '' -like "*$($db -replace '[^A-Za-z0-9]', '')*" })
            if (-not $sites.Count) { Write-Host "  $db : khong tim thay IIS site khop ten - recycle tay." -ForegroundColor Yellow; continue }
            foreach ($s in $sites) {
                Restart-WebAppPool -Name $s.applicationPool
                Write-Host "  $db -> site '$($s.Name)' pool '$($s.applicationPool)' da recycle" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "  Khong recycle duoc: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host '  Thay the: Persona Bar > Clear Cache tren tung site.'
    }
} elseif (-not $WhatIfOnly) {
    Write-Host "`nCHUA xoa cache. DNN van doc gia tri cu tu bo nho cho toi khi ban" -ForegroundColor Yellow
    Write-Host 'recycle app pool hoac bam Persona Bar > Clear Cache.' -ForegroundColor Yellow
}
