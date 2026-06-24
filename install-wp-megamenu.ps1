# ============================================================
#  WordPress + Max Mega Menu - one-shot install for research
# ------------------------------------------------------------
#  Installs XAMPP portable (Apache + MySQL + PHP) to C:\xampp\
#    - No Windows installer, no system service, no admin needed.
#    - Apache listens on 8080 (avoids IIS:80 used by DNN).
#    - MySQL listens on 3306.
#  Downloads WordPress + Max Mega Menu plugin, sets up DB,
#  runs the WP installer headless, seeds demo pages + a nav menu
#  with a Products dropdown to wire up as a mega menu.
#
#  After it runs:  http://localhost:8080/wordpress/
#  Admin:          http://localhost:8080/wordpress/wp-admin/
#                  user=admin / pass=admin@2026
#
#  Run once:
#    powershell -ExecutionPolicy Bypass -File install-wp-megamenu.ps1
# ============================================================

[CmdletBinding()]
param(
    [string]$XamppRoot = 'C:\xampp',
    [int]$ApachePort  = 8080,
    [string]$WpDir    = 'wordpress',
    [string]$WpUser   = 'admin',
    [string]$WpPass   = 'admin@2026',
    [string]$WpEmail  = 'admin@localhost',
    [string]$WpTitle  = 'MegaForm WP Lab',
    [string]$DbName   = 'wordpress',
    [string]$MysqlRootUser = 'root',
    [string]$MysqlRootPass = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

$DOWNLOAD_DIR  = 'C:\Users\Administrator\Downloads'
$SCRIPT_DIR    = Split-Path -Parent $MyInvocation.MyCommand.Path
$XAMPP_URL     = 'https://master.dl.sourceforge.net/project/xampp/XAMPP%20Windows/8.2.12/xampp-portable-windows-x64-8.2.12-0-VS16.zip?viasf=1'
$XAMPP_ZIP     = Join-Path $DOWNLOAD_DIR 'xampp-portable-8.2.12.zip'
$WP_URL        = 'https://wordpress.org/latest.zip'
$WP_ZIP        = Join-Path $DOWNLOAD_DIR 'wordpress-latest.zip'
$MEGA_URL      = 'https://downloads.wordpress.org/plugin/megamenu.latest-stable.zip'
$MEGA_ZIP      = Join-Path $DOWNLOAD_DIR 'megamenu-latest.zip'
$SEED_SQL_SRC  = Join-Path $SCRIPT_DIR 'wp-seed.sql'

function Section($title) {
    Write-Host ''
    Write-Host ('=' * 60) -ForegroundColor Cyan
    Write-Host ('  ' + $title) -ForegroundColor Cyan
    Write-Host ('=' * 60) -ForegroundColor Cyan
}

function Fetch($url, $dest, $label) {
    if (Test-Path $dest) {
        Write-Host ('  (cached) ' + $label) -ForegroundColor DarkGray
        return
    }
    Write-Host ('  (download) ' + $label) -ForegroundColor Yellow
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 900 -MaximumRedirection 10
    $sz = [math]::Round((Get-Item $dest).Length/1MB, 1)
    Write-Host ('    -> ' + $sz + ' MB saved to ' + $dest) -ForegroundColor Green
}

# ------------------------------------------------------------
# 0. Pre-flight
# ------------------------------------------------------------
Section '0. Pre-flight checks'
New-Item -ItemType Directory -Path $DOWNLOAD_DIR -Force | Out-Null

$busy = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -in @($ApachePort, 3306) } |
        ForEach-Object { ('{0} pid={1}' -f $_.LocalPort, $_.OwningProcess) }
if ($busy) {
    Write-Host ('  WARN: required ports are already in use: ' + ($busy -join '; ')) -ForegroundColor Yellow
} else {
    Write-Host ('  OK ports ' + $ApachePort + ' and 3306 are free') -ForegroundColor Green
}

# ------------------------------------------------------------
# 1. Download installers
# ------------------------------------------------------------
Section '1. Download installers'
Fetch $XAMPP_URL $XAMPP_ZIP 'XAMPP portable 8.2.12 (about 150 MB)'
Fetch $WP_URL    $WP_ZIP    'WordPress latest (about 25 MB)'
Fetch $MEGA_URL  $MEGA_ZIP  'Max Mega Menu plugin (about 500 KB)'

# ------------------------------------------------------------
# 2. Extract XAMPP
# ------------------------------------------------------------
Section '2. Extract XAMPP portable'
if (Test-Path (Join-Path $XamppRoot 'xampp-control.exe')) {
    Write-Host '  (skip) XAMPP already extracted' -ForegroundColor DarkGray
} else {
    Write-Host ('  Extracting to ' + $XamppRoot)
    Expand-Archive -Path $XAMPP_ZIP -DestinationPath (Split-Path $XamppRoot) -Force
    if (-not (Test-Path (Join-Path $XamppRoot 'xampp-control.exe'))) {
        throw ('Extract failed - xampp-control.exe not found in ' + $XamppRoot)
    }
    Write-Host '  OK XAMPP extracted' -ForegroundColor Green
}

$setupBat = Join-Path $XamppRoot 'setup_xampp.bat'
if (Test-Path $setupBat) {
    Write-Host '  Running setup_xampp.bat to rewrite path references...'
    # Pass absolute path. setup_xampp.bat uses %~dp0 internally so cwd does not matter;
    # but PowerShell errors trip on native non-zero exit, so wrap with try/catch.
    try {
        $p = Start-Process -FilePath $setupBat -WorkingDirectory $XamppRoot -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop
        Write-Host ('  OK setup_xampp exit=' + $p.ExitCode) -ForegroundColor Green
    } catch {
        Write-Host ('  WARN setup_xampp could not run: ' + $_.Exception.Message + ' (continuing - usually only needed for non-default install paths)') -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------
# 3. Configure Apache port
# ------------------------------------------------------------
Section ('3. Configure Apache port ' + $ApachePort)
$httpdConf = Join-Path $XamppRoot 'apache\conf\httpd.conf'
if (Test-Path $httpdConf) {
    $txt = Get-Content $httpdConf -Raw
    $txt = $txt -replace '(?m)^\s*Listen\s+80\s*$', ('Listen ' + $ApachePort)
    $txt = $txt -replace '(?m)^\s*ServerName\s+localhost:80\s*$', ('ServerName localhost:' + $ApachePort)
    Set-Content -Path $httpdConf -Value $txt -Encoding ASCII
    Write-Host ('  OK httpd.conf set to Listen ' + $ApachePort) -ForegroundColor Green
}

# ------------------------------------------------------------
# 4. Start Apache + MySQL
# ------------------------------------------------------------
Section '4. Start Apache + MySQL (portable mode)'
$mysqldExe = Join-Path $XamppRoot 'mysql\bin\mysqld.exe'
$mysqlExe  = Join-Path $XamppRoot 'mysql\bin\mysql.exe'
$apacheExe = Join-Path $XamppRoot 'apache\bin\httpd.exe'
$mysqlBat  = Join-Path $XamppRoot 'mysql_start.bat'
$apacheBat = Join-Path $XamppRoot 'apache_start.bat'

if (-not (Get-Process mysqld -ErrorAction SilentlyContinue)) {
    Write-Host '  Starting MySQL...' -ForegroundColor Yellow
    if (Test-Path $mysqlBat) {
        Start-Process -FilePath $mysqlBat -WindowStyle Hidden -WorkingDirectory $XamppRoot
    } else {
        Start-Process -FilePath $mysqldExe -ArgumentList '--standalone' -WindowStyle Hidden -WorkingDirectory (Split-Path $mysqldExe)
    }
    Start-Sleep -Seconds 8
}
if (Get-Process mysqld -ErrorAction SilentlyContinue) { Write-Host '  OK mysqld running' -ForegroundColor Green }
else { Write-Host '  WARN mysqld not detected' -ForegroundColor Yellow }

if (-not (Get-Process httpd -ErrorAction SilentlyContinue)) {
    Write-Host '  Starting Apache...' -ForegroundColor Yellow
    if (Test-Path $apacheBat) {
        Start-Process -FilePath $apacheBat -WindowStyle Hidden -WorkingDirectory $XamppRoot
    } else {
        Start-Process -FilePath $apacheExe -WindowStyle Hidden -WorkingDirectory (Split-Path $apacheExe)
    }
    Start-Sleep -Seconds 5
}
if (Get-Process httpd -ErrorAction SilentlyContinue) { Write-Host '  OK httpd running' -ForegroundColor Green }
else { Write-Host '  WARN httpd not detected' -ForegroundColor Yellow }

$ready = $false
for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
    try {
        & $mysqlExe -u $MysqlRootUser -e 'SELECT 1' 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true }
    } catch { }
    if (-not $ready) { Start-Sleep -Seconds 1 }
}
if (-not $ready) { throw 'MySQL did not become ready within 30s' }
Write-Host '  OK MySQL accepting connections' -ForegroundColor Green

# ------------------------------------------------------------
# 5. Create wordpress DB
# ------------------------------------------------------------
Section ('5. Create database ' + $DbName)
$createSql = 'CREATE DATABASE IF NOT EXISTS ' + $DbName + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
& $mysqlExe -u $MysqlRootUser -e $createSql
Write-Host ('  OK DB ' + $DbName + ' ready') -ForegroundColor Green

# ------------------------------------------------------------
# 6. Extract WordPress
# ------------------------------------------------------------
Section '6. Extract WordPress'
$wpRoot = Join-Path $XamppRoot ('htdocs\' + $WpDir)
if (Test-Path (Join-Path $wpRoot 'wp-load.php')) {
    Write-Host '  (skip) WordPress already extracted' -ForegroundColor DarkGray
} else {
    $tmpExtract = Join-Path $DOWNLOAD_DIR ('wp-extract-' + [guid]::NewGuid().ToString('N').Substring(0,8))
    New-Item -ItemType Directory -Path $tmpExtract -Force | Out-Null
    Expand-Archive -Path $WP_ZIP -DestinationPath $tmpExtract -Force
    if (Test-Path $wpRoot) { Remove-Item $wpRoot -Recurse -Force }
    Move-Item -Path (Join-Path $tmpExtract 'wordpress') -Destination $wpRoot -Force
    Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host ('  OK WordPress at ' + $wpRoot) -ForegroundColor Green
}

# ------------------------------------------------------------
# 7. Write wp-config.php
# ------------------------------------------------------------
Section '7. Write wp-config.php'
$wpConfig = Join-Path $wpRoot 'wp-config.php'
if (Test-Path $wpConfig) {
    Write-Host '  (skip) wp-config.php already present' -ForegroundColor DarkGray
} else {
    $saltsTxt = ''
    try { $saltsTxt = (Invoke-WebRequest -Uri 'https://api.wordpress.org/secret-key/1.1/salt/' -UseBasicParsing -TimeoutSec 30).Content } catch { }
    $cfgLines = @(
        '<?php'
        '// MegaForm WP Lab - auto-generated by install-wp-megamenu.ps1'
        ("define('DB_NAME',     '" + $DbName + "');")
        ("define('DB_USER',     '" + $MysqlRootUser + "');")
        ("define('DB_PASSWORD', '" + $MysqlRootPass + "');")
        "define('DB_HOST',     '127.0.0.1');"
        "define('DB_CHARSET',  'utf8mb4');"
        "define('DB_COLLATE',  '');"
        ''
        $saltsTxt
        ''
        '$table_prefix = ''wp_'';'
        ''
        "define('WP_DEBUG', false);"
        "define('FS_METHOD', 'direct');"
        "define('AUTOMATIC_UPDATER_DISABLED', true);"
        ''
        'if (!defined(''ABSPATH'')) { define(''ABSPATH'', __DIR__ . ''/''); }'
        'require_once ABSPATH . ''wp-settings.php'';'
    )
    Set-Content -Path $wpConfig -Value ($cfgLines -join "`r`n") -Encoding UTF8
    Write-Host '  OK wp-config.php written' -ForegroundColor Green
}

# ------------------------------------------------------------
# 8. Run WP installer headless
# ------------------------------------------------------------
Section '8. Install WordPress (headless)'
$siteUrl = 'http://localhost:' + $ApachePort + '/' + $WpDir
$tablesProbe = & $mysqlExe -u $MysqlRootUser -D $DbName -BNe "SHOW TABLES LIKE 'wp_options';" 2>&1
if ($tablesProbe -match 'wp_options') {
    Write-Host '  (skip) WordPress already installed (wp_options present)' -ForegroundColor DarkGray
} else {
    Write-Host '  POST install.php?step=2 ...'
    $body = @{
        weblog_title    = $WpTitle
        user_name       = $WpUser
        admin_password  = $WpPass
        admin_password2 = $WpPass
        admin_email     = $WpEmail
        pw_weak         = 'on'
        Submit          = 'Install WordPress'
        language        = ''
    }
    try {
        $r = Invoke-WebRequest -Uri ($siteUrl + '/wp-admin/install.php?step=2') -Method POST -Body $body -UseBasicParsing -TimeoutSec 60
        Write-Host ('  OK WP install returned HTTP ' + $r.StatusCode) -ForegroundColor Green
    } catch {
        Write-Host ('  WARN WP install POST failed: ' + $_.Exception.Message) -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------
# 9. Drop in Max Mega Menu plugin
# ------------------------------------------------------------
Section '9. Install Max Mega Menu plugin'
$pluginDir = Join-Path $wpRoot 'wp-content\plugins\megamenu'
if (Test-Path (Join-Path $pluginDir 'megamenu.php')) {
    Write-Host '  (skip) megamenu plugin already extracted' -ForegroundColor DarkGray
} else {
    Expand-Archive -Path $MEGA_ZIP -DestinationPath (Join-Path $wpRoot 'wp-content\plugins') -Force
    if (Test-Path (Join-Path $pluginDir 'megamenu.php')) {
        Write-Host ('  OK Plugin extracted to ' + $pluginDir) -ForegroundColor Green
    } else {
        Write-Host '  WARN Plugin extract did not produce expected files' -ForegroundColor Yellow
    }
}

$activateSql = 'UPDATE wp_options SET option_value = ''a:1:{i:0;s:21:\"megamenu/megamenu.php\";}'' WHERE option_name = ''active_plugins'';'
& $mysqlExe -u $MysqlRootUser -D $DbName -e $activateSql
Write-Host '  OK Plugin marked active in wp_options.active_plugins' -ForegroundColor Green

# ------------------------------------------------------------
# 10. Seed sample pages + nav menu + enable mega menu
# ------------------------------------------------------------
Section '10. Seed sample pages + menu'
if (-not (Test-Path $SEED_SQL_SRC)) { throw ('Missing seed SQL file: ' + $SEED_SQL_SRC) }
& $mysqlExe -u $MysqlRootUser -D $DbName -e ('SOURCE ' + $SEED_SQL_SRC.Replace('\','/'))
Write-Host '  OK Sample pages + menu + Max Mega Menu enabled' -ForegroundColor Green

# ------------------------------------------------------------
# 11. Smoke test
# ------------------------------------------------------------
Section '11. Smoke test'
try {
    $r = Invoke-WebRequest -Uri $siteUrl -UseBasicParsing -TimeoutSec 30
    Write-Host ('  OK ' + $siteUrl + ' returned HTTP ' + $r.StatusCode + ', ' + $r.Content.Length + ' bytes') -ForegroundColor Green
} catch {
    Write-Host ('  FAIL ' + $siteUrl + ' -> ' + $_.Exception.Message) -ForegroundColor Red
}

# ------------------------------------------------------------
# Final report
# ------------------------------------------------------------
Section 'DONE - open these tomorrow:'
Write-Host ''
Write-Host ('  Site:        ' + $siteUrl) -ForegroundColor Cyan
Write-Host ('  WP Admin:    ' + $siteUrl + '/wp-admin/') -ForegroundColor Cyan
Write-Host ('  User/Pass:   ' + $WpUser + ' / ' + $WpPass) -ForegroundColor Cyan
Write-Host ''
Write-Host '  Max Mega Menu admin pages:' -ForegroundColor Cyan
Write-Host ('    Settings: ' + $siteUrl + '/wp-admin/admin.php?page=maxmenu') -ForegroundColor Gray
Write-Host '    Builder:  Appearance > Menus, hover an item, click the Mega Menu button' -ForegroundColor Gray
Write-Host ''
Write-Host '  Plugin source for code study:' -ForegroundColor Cyan
Write-Host ('    ' + $pluginDir) -ForegroundColor Gray
Write-Host ''
Write-Host '  Stop services manually:' -ForegroundColor Cyan
Write-Host ('    ' + (Join-Path $XamppRoot 'apache_stop.bat') + ' ; ' + (Join-Path $XamppRoot 'mysql_stop.bat')) -ForegroundColor Gray
Write-Host ''
