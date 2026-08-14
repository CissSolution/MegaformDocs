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
    # Zip entry names may carry a folder; DNN's resource unpacker keeps it, so the prebuilt
    # template gallery ships as real .html files under Assets/Templates rather than as strings
    # embedded in a .cshtml. The console reads catalog.json and never a path from the browser.
    $assetFiles = @{
        'megaform-blogs.css' = Join-Path $PSScriptRoot 'Assets\megaform-blogs.css'
        'megaform-blogs-admin.css' = Join-Path $PSScriptRoot 'Assets\megaform-blogs-admin.css'
        'Templates/catalog.json' = Join-Path $PSScriptRoot 'Assets\Templates\catalog.json'
        'Templates/newsroom-home.html' = Join-Path $PSScriptRoot 'Assets\Templates\newsroom-home.html'
        'Templates/newsroom-post.html' = Join-Path $PSScriptRoot 'Assets\Templates\newsroom-post.html'
        'Templates/journal-home.html' = Join-Path $PSScriptRoot 'Assets\Templates\journal-home.html'
        'Templates/journal-post.html' = Join-Path $PSScriptRoot 'Assets\Templates\journal-post.html'
        'Templates/acme-home.html' = Join-Path $PSScriptRoot 'Assets\Templates\acme-home.html'
        'Templates/acme-post.html' = Join-Path $PSScriptRoot 'Assets\Templates\acme-post.html'
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

    # And the other direction, which is the one that actually bites: the check above only
    # sees files someone REMEMBERED to declare. A template added to Assets\Templates and not
    # listed above ships as a catalog entry with no file behind it, and the console answers
    # "That gallery template is not installed on this site." Nothing else in the build notices.
    $declaredTemplates = $assetFiles.Keys | Where-Object { $_ -like 'Templates/*' } | ForEach-Object { Split-Path $_ -Leaf }
    $undeclared = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'Assets\Templates') -File |
                  Where-Object { $declaredTemplates -notcontains $_.Name } |
                  ForEach-Object { $_.Name }
    if ($undeclared.Count -gt 0) {
        throw "Template file(s) in Assets\Templates are NOT declared in `$assetFiles, so the package would ship a catalog entry with no file:`n  " + ($undeclared -join "`n  ")
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
