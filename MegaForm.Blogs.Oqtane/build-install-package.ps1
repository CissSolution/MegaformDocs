[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'Install')
)

$ErrorActionPreference = 'Stop'

# Builds the Oqtane install package for MegaForm Blogs.
# Mirrors MegaForm.Blogs.DNN\build-install-package.ps1: it refuses to produce a package
# when a declared payload file is missing, so a clean clone can never ship a half module.

$project = Join-Path $PSScriptRoot 'MegaForm.Blogs.Oqtane.csproj'
foreach ($framework in @('net9.0', 'net10.0')) {
    Write-Host "Building $framework..."
    & dotnet build $project -c Release -f $framework --nologo | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Build failed for $framework." }
}

$required = @(
    (Join-Path $PSScriptRoot 'bin\Release\net9.0\MegaForm.Blogs.Oqtane.Client.Oqtane.dll'),
    (Join-Path $PSScriptRoot 'bin\Release\net10.0\MegaForm.Blogs.Oqtane.Client.Oqtane.dll'),
    (Join-Path $PSScriptRoot 'wwwroot\Modules\MegaFormBlogs\megaform-blogs.css'),
    (Join-Path $PSScriptRoot 'wwwroot\Modules\MegaFormBlogs\megaform-blogs-admin.css')
)
$missing = $required | Where-Object { -not (Test-Path -LiteralPath $_) }
if ($missing) {
    throw "Missing package source file(s):`n  " + ($missing -join "`n  ")
}

if (-not (Test-Path -LiteralPath $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
}

$nuget = Join-Path $PSScriptRoot '..\MegaForm.Oqtane.Package\nuget.exe'
if (-not (Test-Path -LiteralPath $nuget)) {
    throw "nuget.exe not found at $nuget."
}

& $nuget pack (Join-Path $PSScriptRoot 'MegaForm.Blogs.Oqtane.nuspec') `
    -OutputDirectory $OutputDirectory -NoPackageAnalysis
if ($LASTEXITCODE -ne 0) { throw 'nuget pack failed.' }

Get-ChildItem -LiteralPath $OutputDirectory -Filter 'MegaForm.Blogs.Oqtane.*.nupkg' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 |
    ForEach-Object {
        [pscustomobject]@{
            FullName = $_.FullName
            Length   = $_.Length
            SHA256   = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    }
