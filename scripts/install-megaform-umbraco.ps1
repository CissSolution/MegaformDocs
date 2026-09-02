[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$SitePath,

    [string]$ProjectPath,
    [string]$Version = "2.0.37",
    [string]$PackageSource,
    [string]$PackageCachePath,
    [string]$Configuration = "Release",
    [switch]$Start,
    [int]$Port = 0
)

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$siteRoot = [System.IO.Path]::GetFullPath($SitePath)
if (-not (Test-Path -LiteralPath $siteRoot -PathType Container)) {
    throw "Umbraco site directory was not found: $siteRoot"
}

if ([string]::IsNullOrWhiteSpace($PackageSource)) {
    $PackageSource = Join-Path $repoRoot "local-nuget-umbraco"
}
$PackageSource = [System.IO.Path]::GetFullPath($PackageSource)
if (-not (Test-Path -LiteralPath $PackageSource -PathType Container)) {
    throw "MegaForm package source was not found: $PackageSource"
}

if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    $projects = @(Get-ChildItem -LiteralPath $siteRoot -Filter "*.csproj" -File)
    if ($projects.Count -eq 0) {
        $projects = @(Get-ChildItem -LiteralPath $siteRoot -Filter "*.csproj" -File -Recurse |
            Where-Object {
                $_.FullName -notmatch "[\\/]obj[\\/]" -and
                $_.FullName -notmatch "[\\/]bin[\\/]" -and
                $_.FullName -notmatch "[\\/]\.megaform-"
            })
    }
    if ($projects.Count -ne 1) {
        throw "Expected exactly one project under $siteRoot; found $($projects.Count). Pass -ProjectPath explicitly."
    }
    $project = $projects[0].FullName
} else {
    $project = [System.IO.Path]::GetFullPath($ProjectPath)
}
if (-not (Test-Path -LiteralPath $project -PathType Leaf)) {
    throw "Project file was not found: $project"
}

function Find-CentralPackagesFile([string]$startDirectory) {
    $current = [System.IO.DirectoryInfo]::new($startDirectory)
    while ($null -ne $current) {
        $candidate = Join-Path $current.FullName "Directory.Packages.props"
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
        $current = $current.Parent
    }
    return $null
}

function Ensure-PackageNode([xml]$document, [string]$nodeName, [string]$include, [string]$version) {
    $nodes = @($document.Project.ItemGroup.$nodeName)
    $existing = $nodes | Where-Object { $_.Include -eq $include } | Select-Object -First 1
    if ($null -ne $existing) {
        if (-not [string]::IsNullOrWhiteSpace($version)) { $existing.SetAttribute("Version", $version) }
        return
    }
    $group = @($document.Project.ItemGroup) | Select-Object -First 1
    if ($null -eq $group) {
        $group = $document.CreateElement("ItemGroup")
        [void]$document.Project.AppendChild($group)
    }
    $node = $document.CreateElement($nodeName)
    $node.SetAttribute("Include", $include)
    if (-not [string]::IsNullOrWhiteSpace($version)) { $node.SetAttribute("Version", $version) }
    [void]$group.AppendChild($node)
}

$projectXml = [xml](Get-Content -LiteralPath $project -Raw)
$umbracoRef = @($projectXml.Project.ItemGroup.PackageReference) |
    Where-Object { $_.Include -eq "Umbraco.Cms" -or $_.Include -eq "Umbraco.Cms.Web.Common" } |
    Select-Object -First 1
if ($null -eq $umbracoRef) {
    throw "The selected project does not reference Umbraco.Cms: $project"
}

$centralFile = Find-CentralPackagesFile ([System.IO.Path]::GetDirectoryName($project))
$usesCentral = $false
if ($centralFile) {
    $centralXml = [xml](Get-Content -LiteralPath $centralFile -Raw)
    $usesCentral = [string]$centralXml.Project.PropertyGroup.ManagePackageVersionsCentrally -match "(?i)^true$"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $siteRoot ".megaform-install-backup\$stamp"
if ($PSCmdlet.ShouldProcess($project, "Add MegaForm.Umbraco $Version")) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item -LiteralPath $project -Destination (Join-Path $backupDir ([System.IO.Path]::GetFileName($project)))
    if ($centralFile) {
        Copy-Item -LiteralPath $centralFile -Destination (Join-Path $backupDir "Directory.Packages.props")
    }

    Ensure-PackageNode $projectXml "PackageReference" "MegaForm.Umbraco" $(if ($usesCentral) { "" } else { $Version })
    $projectXml.Save($project)

    if ($usesCentral) {
        Ensure-PackageNode $centralXml "PackageVersion" "MegaForm.Umbraco" $Version
        $centralXml.Save($centralFile)
    }
}

$nugetPackages = if ([string]::IsNullOrWhiteSpace($PackageCachePath)) {
    Join-Path $siteRoot ".megaform-install-packages"
} else {
    [System.IO.Path]::GetFullPath($PackageCachePath)
}
New-Item -ItemType Directory -Path $nugetPackages -Force | Out-Null
$installStateDir = Join-Path $siteRoot ".megaform-install"
New-Item -ItemType Directory -Path $installStateDir -Force | Out-Null
$nugetConfig = Join-Path $installStateDir "NuGet.Config"
$settings = [System.Xml.XmlWriterSettings]::new()
$settings.Indent = $true
$settings.Encoding = [System.Text.UTF8Encoding]::new($false)
$writer = [System.Xml.XmlWriter]::Create($nugetConfig, $settings)
try {
    $writer.WriteStartDocument()
    $writer.WriteStartElement("configuration")
    $writer.WriteStartElement("packageSources")
    $writer.WriteStartElement("clear")
    $writer.WriteEndElement()
    $writer.WriteStartElement("add")
    $writer.WriteAttributeString("key", "MegaFormLocal")
    $writer.WriteAttributeString("value", $PackageSource)
    $writer.WriteEndElement()
    $writer.WriteStartElement("add")
    $writer.WriteAttributeString("key", "nuget.org")
    $writer.WriteAttributeString("value", "https://api.nuget.org/v3/index.json")
    $writer.WriteAttributeString("protocolVersion", "3")
    $writer.WriteEndElement()
    $writer.WriteEndElement()
    $writer.WriteEndElement()
    $writer.WriteEndDocument()
} finally {
    $writer.Dispose()
}

$restoreArgs = @(
    "restore",
    $project,
    "--configfile",
    $nugetConfig,
    "--packages",
    $nugetPackages,
    "--no-cache"
)
& dotnet @restoreArgs
if ($LASTEXITCODE -ne 0) { throw "MegaForm package restore failed." }

& dotnet build $project -c $Configuration --no-restore
if ($LASTEXITCODE -ne 0) { throw "Umbraco site build failed after MegaForm installation." }

$assetsPath = Join-Path ([System.IO.Path]::GetDirectoryName($project)) "obj\project.assets.json"
if (-not (Test-Path -LiteralPath $assetsPath)) { throw "project.assets.json was not produced." }
$assets = Get-Content -LiteralPath $assetsPath -Raw | ConvertFrom-Json
$resolvedPackage = "MegaForm.Umbraco/$Version"
if ($assets.libraries.PSObject.Properties.Name -notcontains $resolvedPackage) {
    throw "Restore completed but $resolvedPackage was not resolved as a NuGet package."
}
$internalPackages = @($assets.libraries.PSObject.Properties.Name | Where-Object {
    $_ -match "^MegaForm\.(Core|Sdk|Integrations\.CloudStorage)/"
})
if ($internalPackages.Count -gt 0) {
    throw "The platform package restored internal MegaForm packages separately: $($internalPackages -join ', ')"
}

$result = [ordered]@{
    Project = $project
    Version = $Version
    PackageSource = $PackageSource
    NuGetConfig = $nugetConfig
    PackageCache = $nugetPackages
    CentralPackageManagement = $usesCentral
    Backup = $backupDir
    ResolvedPackage = $resolvedPackage
    Build = "passed"
}

if ($Start) {
    if ($Port -le 0) {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
        $listener.Start()
        $Port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
        $listener.Stop()
    }
    $runDir = Join-Path $siteRoot ".megaform-install-run"
    New-Item -ItemType Directory -Path $runDir -Force | Out-Null
    $stdout = Join-Path $runDir "host-$Port.log"
    $stderr = Join-Path $runDir "host-$Port.err.log"
    $arguments = "run --project `"$project`" -c $Configuration --no-build --urls http://127.0.0.1:$Port"
    $process = Start-Process -FilePath "dotnet" -ArgumentList $arguments -WorkingDirectory ([System.IO.Path]::GetDirectoryName($project)) -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    [System.IO.File]::WriteAllText((Join-Path $runDir "host.pid"), [string]$process.Id)

    $baseUrl = "http://127.0.0.1:$Port"
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Seconds 1
        if ($process.HasExited) { break }
        try {
            $response = Invoke-WebRequest -Uri "$baseUrl/umbraco" -MaximumRedirection 0 -SkipHttpErrorCheck -TimeoutSec 3
            if ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500) { $ready = $true; break }
        } catch { }
    }
    if (-not $ready) {
        $tail = if (Test-Path -LiteralPath $stderr) { (Get-Content -LiteralPath $stderr -Tail 30) -join [Environment]::NewLine } else { "" }
        throw "The Umbraco host did not become ready at $baseUrl.`n$tail"
    }

    $assetUrl = "$baseUrl/App_Plugins/MegaForm/js/megaform-dashboard.js"
    $assetResponse = Invoke-WebRequest -Uri $assetUrl -SkipHttpErrorCheck -TimeoutSec 10
    if ([int]$assetResponse.StatusCode -ne 200 -or $assetResponse.RawContentLength -lt 1000) {
        throw "MegaForm static asset smoke test failed: $assetUrl returned $($assetResponse.StatusCode)."
    }

    $result.Url = $baseUrl
    $result.ProcessId = $process.Id
    $result.Log = $stdout
    $result.StaticAsset = "passed"
}

[pscustomobject]$result
