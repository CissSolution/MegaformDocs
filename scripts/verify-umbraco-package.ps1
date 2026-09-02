param(
    [Parameter(Mandatory = $false)]
    [string]$PackagePath = "local-nuget-umbraco/MegaForm.Umbraco.2.0.37.nupkg",

    [Parameter(Mandatory = $false)]
    [int]$MaximumPackageSizeMb = 8
)

$ErrorActionPreference = "Stop"

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw "Package verification failed: $Message"
    }
}

$resolvedPackage = (Resolve-Path -LiteralPath $PackagePath).Path
$packageFile = Get-Item -LiteralPath $resolvedPackage
$maximumBytes = $MaximumPackageSizeMb * 1MB

Assert-True ($packageFile.Length -le $maximumBytes) `
    "package size is $([math]::Round($packageFile.Length / 1MB, 2)) MB; maximum is $MaximumPackageSizeMb MB"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedPackage)

try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })

    $requiredEntries = @(
        "MegaForm.Umbraco.nuspec",
        "lib/net10.0/MegaForm.Umbraco.dll",
        "lib/net10.0/MegaForm.Core.dll",
        "lib/net10.0/MegaForm.Sdk.dll",
        "lib/net10.0/MegaForm.Integrations.CloudStorage.dll",
        "staticwebassets/js/bundles/megaform-builder.js",
        "staticwebassets/js/i18n/en-US.json",
        "staticwebassets/img/flags/4x3/us.svg",
        "staticwebassets/img/megaform-ai-bear.png"
    )

    foreach ($required in $requiredEntries) {
        Assert-True ($entries -contains $required) "missing required entry '$required'"
    }

    $flagEntries = @($entries | Where-Object { $_ -like "staticwebassets/img/flags/*.svg" })
    Assert-True ($flagEntries.Count -ge 270) "only $($flagEntries.Count) runtime flag SVG files were packaged"

    $unexpectedImages = @($entries | Where-Object {
        $_ -like "staticwebassets/img/*" -and
        $_ -ne "staticwebassets/img/megaform-ai-bear.png" -and
        $_ -notlike "staticwebassets/img/flags/*"
    })
    Assert-True ($unexpectedImages.Count -eq 0) `
        "template-specific images must come from Gallery, but package contains: $($unexpectedImages -join ', ')"

    $sourceMaps = @($entries | Where-Object { $_ -like "*.map" })
    Assert-True ($sourceMaps.Count -eq 0) "source maps are present: $($sourceMaps -join ', ')"

    $duplicateCatalogs = @($entries | Where-Object {
        $_ -match "^staticwebassets/js/(bundles|builder|plugins)/i18n/"
    })
    Assert-True ($duplicateCatalogs.Count -eq 0) `
        "duplicate i18n catalogs are present outside staticwebassets/js/i18n"

    $nuspecEntry = $archive.Entries | Where-Object { $_.FullName -eq "MegaForm.Umbraco.nuspec" } | Select-Object -First 1
    $reader = New-Object System.IO.StreamReader($nuspecEntry.Open())
    try {
        [xml]$nuspec = $reader.ReadToEnd()
    }
    finally {
        $reader.Dispose()
    }

    $dependencies = @{}
    foreach ($dependency in $nuspec.package.metadata.dependencies.group.dependency) {
        $dependencies[[string]$dependency.id] = [string]$dependency.version
    }

    $internalDependencies = @($dependencies.Keys | Where-Object { $_ -like "MegaForm.*" })
    Assert-True ($internalDependencies.Count -eq 0) `
        "platform package must be self-contained, but has internal dependencies: $($internalDependencies -join ', ')"

    $requiredRuntimeDependencies = @("AWSSDK.S3")

    foreach ($dependencyName in $requiredRuntimeDependencies) {
        Assert-True ($dependencies.ContainsKey($dependencyName)) "missing bundled-runtime dependency '$dependencyName'"
    }

    Write-Host "MegaForm Umbraco package verification passed." -ForegroundColor Green
    Write-Host "Package: $resolvedPackage"
    Write-Host "Size: $([math]::Round($packageFile.Length / 1MB, 2)) MB"
    Write-Host "Runtime flags: $($flagEntries.Count)"
    Write-Host "Template-specific package images: $($unexpectedImages.Count)"
}
finally {
    $archive.Dispose()
}
