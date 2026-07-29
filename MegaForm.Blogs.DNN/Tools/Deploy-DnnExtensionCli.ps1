[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [uri]$SiteUrl,

    [Parameter(Mandatory)]
    [string]$Username,

    [Parameter(Mandatory)]
    [string]$Password,

    [Parameter(Mandatory)]
    [string]$PackagePath
)

$ErrorActionPreference = 'Stop'

$securePassword = ConvertTo-SecureString $Password -AsPlainText -Force
$credential = [pscredential]::new($Username, $securePassword)

& (Join-Path $PSScriptRoot 'Deploy-DnnExtension.ps1') `
    -SiteUrl $SiteUrl `
    -Credential $credential `
    -PackagePath $PackagePath `
    -Install |
    ConvertTo-Json -Depth 20
