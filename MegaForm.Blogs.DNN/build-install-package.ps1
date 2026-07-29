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
    New-ContentZip -Path $razorZip -Files @{
        'MegaFormBlogs.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogs.cshtml'
        'MegaFormBlogsAdmin.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdmin.cshtml'
        'MegaFormBlogsAdminHost.cshtml' = Join-Path $PSScriptRoot 'Scripts\MegaFormBlogsAdminHost.cshtml'
    }
    New-ContentZip -Path $assetZip -Files @{
        'megaform-blogs.css' = Join-Path $PSScriptRoot 'Assets\megaform-blogs.css'
    }

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
