[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'Install\MegaForm.Blogs.DNN_2026-07-29_editor-gallery_Install.zip')
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression

if (Test-Path -LiteralPath $OutputPath) {
    throw "Refusing to overwrite an existing package: $OutputPath"
}

function New-ContentZip {
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [hashtable]$Files
    )

    $stream = [IO.File]::Open($Path, [IO.FileMode]::Create)
    try {
        $archive = [IO.Compression.ZipArchive]::new(
            $stream,
            [IO.Compression.ZipArchiveMode]::Create,
            $false
        )
        try {
            foreach ($name in $Files.Keys) {
                $entry = $archive.CreateEntry(
                    $name,
                    [IO.Compression.CompressionLevel]::Optimal
                )
                $entryStream = $entry.Open()
                try {
                    $sourceStream = [IO.File]::OpenRead($Files[$name])
                    try {
                        $sourceStream.CopyTo($entryStream)
                    }
                    finally {
                        $sourceStream.Dispose()
                    }
                }
                finally {
                    $entryStream.Dispose()
                }
            }
        }
        finally {
            $archive.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$razorZip = [IO.Path]::GetTempFileName()
$assetZip = [IO.Path]::GetTempFileName()

try {
    $razorFiles = @{
        'MegaFormBlogs.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogs.cshtml'
        'MegaFormBlogsAdmin.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdmin.cshtml'
        'MegaFormBlogsAdminEditorial.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdminEditorial.cshtml'
        'MegaFormBlogsAdminComments.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdminComments.cshtml'
        'MegaFormBlogsAdminAnalytics.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdminAnalytics.cshtml'
        'MegaFormBlogsAdminAuthors.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdminAuthors.cshtml'
        'MegaFormBlogsAdminSettings.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdminSettings.cshtml'
        'MegaFormBlogsAdminCategories.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdminCategories.cshtml'
        'MegaFormBlogsAdminMedia.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdminMedia.cshtml'
        'MegaFormBlogsAdminTemplates.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdminTemplates.cshtml'
        'MegaFormBlogsAdminFormats.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdminFormats.cshtml'
        'MegaFormBlogsAdminHost.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdminHost.cshtml'
    }
    $assetFiles = @{
        'megaform-blogs.css' = Join-Path $PSScriptRoot 'Assets\megaform-blogs.css'
        'megaform-blogs-admin.css' = Join-Path $PSScriptRoot 'Assets\megaform-blogs-admin.css'
    }

    # Fail loudly when a declared payload file is missing. A clean clone that silently
    # dropped MegaFormBlogsAdminHost.cshtml would ship an admin console with no Host guard.
    $missing = @()
    foreach ($set in @($razorFiles, $assetFiles)) {
        foreach ($name in $set.Keys) {
            if (-not (Test-Path -LiteralPath $set[$name])) { $missing += $set[$name] }
        }
    }
    if ($missing.Count -gt 0) {
        throw "Missing package source file(s):`n  " + ($missing -join "`n  ")
    }

    New-ContentZip -Path $razorZip -Files $razorFiles
    New-ContentZip -Path $assetZip -Files $assetFiles

    $outputDirectory = Split-Path -Parent $OutputPath
    if (-not (Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory | Out-Null
    }

    $stream = [IO.File]::Open($OutputPath, [IO.FileMode]::CreateNew)
    try {
        $archive = [IO.Compression.ZipArchive]::new(
            $stream,
            [IO.Compression.ZipArchiveMode]::Create,
            $false
        )
        try {
            $packageFiles = [ordered]@{
                'MegaForm.Blogs.DNN.dnn' = Join-Path $PSScriptRoot 'MegaForm.Blogs.DNN.dnn'
                'License.txt' = Join-Path $PSScriptRoot 'License.txt'
                'ReleaseNotes.txt' = Join-Path $PSScriptRoot 'ReleaseNotes.txt'
                'RazorScripts.zip' = $razorZip
                'BlogAssets.zip' = $assetZip
            }

            foreach ($name in $packageFiles.Keys) {
                $entry = $archive.CreateEntry(
                    $name,
                    [IO.Compression.CompressionLevel]::Optimal
                )
                $entryStream = $entry.Open()
                try {
                    $sourceStream = [IO.File]::OpenRead($packageFiles[$name])
                    try {
                        $sourceStream.CopyTo($entryStream)
                    }
                    finally {
                        $sourceStream.Dispose()
                    }
                }
                finally {
                    $entryStream.Dispose()
                }
            }
        }
        finally {
            $archive.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}
finally {
    foreach ($temporaryFile in @($razorZip, $assetZip)) {
        $resolved = [IO.Path]::GetFullPath($temporaryFile)
        if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove a temporary file outside the temp directory: $resolved"
        }
        if ([IO.File]::Exists($resolved)) {
            [IO.File]::Delete($resolved)
        }
    }
}

$package = Get-Item -LiteralPath $OutputPath
[pscustomobject]@{
    FullName = $package.FullName
    Length = $package.Length
    SHA256 = (Get-FileHash -LiteralPath $package.FullName -Algorithm SHA256).Hash
}
