[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [uri]$SiteUrl,

    [Parameter(Mandatory)]
    [pscredential]$Credential,

    [Parameter(Mandatory)]
    [string[]]$PackagePath,

    [switch]$Install
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Net.Http

function Get-InputFields {
    param([Parameter(Mandatory)][string]$Html)

    $fields = [ordered]@{}
    foreach ($match in [regex]::Matches($Html, '<input\b[^>]*>', 'IgnoreCase')) {
        $tag = $match.Value
        $name = [regex]::Match($tag, '\bname="([^"]+)"', 'IgnoreCase')
        if (-not $name.Success) {
            continue
        }

        $value = [regex]::Match($tag, '\bvalue="([^"]*)"', 'IgnoreCase')
        $decodedName = [Net.WebUtility]::HtmlDecode($name.Groups[1].Value)
        $fields[$decodedName] = if ($value.Success) {
            [Net.WebUtility]::HtmlDecode($value.Groups[1].Value)
        }
        else {
            ''
        }
    }

    return $fields
}

function Read-Response {
    param([Parameter(Mandatory)][Net.Http.HttpResponseMessage]$Response)

    $body = $Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $Response.IsSuccessStatusCode) {
        $summary = if ($body.Length -gt 1200) { $body.Substring(0, 1200) } else { $body }
        throw "HTTP $([int]$Response.StatusCode) $($Response.ReasonPhrase): $summary"
    }

    return $body
}

function Invoke-PackageUpload {
    param(
        [Parameter(Mandatory)]
        [Net.Http.HttpClient]$Client,

        [Parameter(Mandatory)]
        [uri]$Endpoint,

        [Parameter(Mandatory)]
        [string]$FilePath,

        [Parameter(Mandatory)]
        [string]$AntiForgeryToken,

        [Parameter(Mandatory)]
        [string]$TabId
    )

    $resolvedFile = (Resolve-Path -LiteralPath $FilePath).Path
    $fileStream = [IO.File]::OpenRead($resolvedFile)
    try {
        $fileContent = [Net.Http.StreamContent]::new($fileStream)
        $fileContent.Headers.ContentType =
            [Net.Http.Headers.MediaTypeHeaderValue]::new('application/octet-stream')

        $multipart = [Net.Http.MultipartFormDataContent]::new()
        try {
            $multipart.Add($fileContent, 'POSTFILE', [IO.Path]::GetFileName($resolvedFile))

            $request = [Net.Http.HttpRequestMessage]::new(
                [Net.Http.HttpMethod]::Post,
                $Endpoint
            )
            try {
                $request.Headers.Add('TabId', $TabId)
                $request.Headers.Add('RequestVerificationToken', $AntiForgeryToken)
                $request.Content = $multipart

                $response = $Client.SendAsync($request).GetAwaiter().GetResult()
                try {
                    return Read-Response -Response $response
                }
                finally {
                    $response.Dispose()
                }
            }
            finally {
                $request.Dispose()
            }
        }
        finally {
            $multipart.Dispose()
        }
    }
    finally {
        $fileStream.Dispose()
    }
}

$baseUrl = $SiteUrl.AbsoluteUri.TrimEnd('/') + '/'
$loginUrl = $baseUrl + 'Login?returnurl=%2fBlogs'
$blogsUrl = $baseUrl + 'Blogs'

$handler = [Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $true
$handler.CookieContainer = [Net.CookieContainer]::new()

$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromMinutes(8)

try {
    $loginPageResponse = $client.GetAsync($loginUrl).GetAwaiter().GetResult()
    try {
        $loginHtml = Read-Response -Response $loginPageResponse
    }
    finally {
        $loginPageResponse.Dispose()
    }

    $loginFields = Get-InputFields -Html $loginHtml
    $loginFields['dnn$ctr$Login$Login_DNN$txtUsername'] = $Credential.UserName
    $loginFields['dnn$ctr$Login$Login_DNN$txtPassword'] =
        $Credential.GetNetworkCredential().Password
    $loginFields['__EVENTTARGET'] = 'dnn$ctr$Login$Login_DNN$cmdLogin'
    $loginFields['__EVENTARGUMENT'] = ''

    $encodedLoginFields = [Collections.Generic.Dictionary[string,string]]::new()
    foreach ($key in $loginFields.Keys) {
        $encodedLoginFields.Add([string]$key, [string]$loginFields[$key])
    }

    $loginContent = [Net.Http.FormUrlEncodedContent]::new($encodedLoginFields)
    try {
        $loginResponse = $client.PostAsync($loginUrl, $loginContent).GetAwaiter().GetResult()
        try {
            $null = Read-Response -Response $loginResponse
        }
        finally {
            $loginResponse.Dispose()
        }
    }
    finally {
        $loginContent.Dispose()
    }

    $authenticatedPageResponse = $client.GetAsync($blogsUrl).GetAwaiter().GetResult()
    try {
        $authenticatedHtml = Read-Response -Response $authenticatedPageResponse
    }
    finally {
        $authenticatedPageResponse.Dispose()
    }

    if ($authenticatedHtml -notmatch '/ctl/Logoff') {
        throw 'DNN Host authentication did not succeed.'
    }

    $antiForgeryMatch = [regex]::Match(
        $authenticatedHtml,
        'name="__RequestVerificationToken"[^>]*value="([^"]+)"',
        'IgnoreCase'
    )
    if (-not $antiForgeryMatch.Success) {
        throw 'The DNN anti-forgery token was not present after login.'
    }

    $tabIdMatch = [regex]::Match(
        $authenticatedHtml,
        'sf_tabId[^0-9-]*(-?\d+)',
        'IgnoreCase'
    )
    if (-not $tabIdMatch.Success) {
        throw 'The DNN TabId was not present after login.'
    }

    $antiForgeryToken = [Net.WebUtility]::HtmlDecode($antiForgeryMatch.Groups[1].Value)
    $tabId = $tabIdMatch.Groups[1].Value
    $parseEndpoint = [uri]($baseUrl + 'API/PersonaBar/Extensions/ParsePackage')
    $installEndpoint = [uri]($baseUrl + 'API/PersonaBar/Extensions/InstallPackage')

    foreach ($path in $PackagePath) {
        $resolved = (Resolve-Path -LiteralPath $path).Path
        $parseJson = Invoke-PackageUpload `
            -Client $client `
            -Endpoint $parseEndpoint `
            -FilePath $resolved `
            -AntiForgeryToken $antiForgeryToken `
            -TabId $tabId

        $parseResult = $parseJson | ConvertFrom-Json
        [pscustomobject]@{
            Action = 'Parsed'
            Package = [IO.Path]::GetFileName($resolved)
            Result = $parseResult
            Raw = $parseJson
        }

        if ($Install) {
            $installJson = Invoke-PackageUpload `
                -Client $client `
                -Endpoint $installEndpoint `
                -FilePath $resolved `
                -AntiForgeryToken $antiForgeryToken `
                -TabId $tabId

            $installResult = $installJson | ConvertFrom-Json
            [pscustomobject]@{
                Action = 'Installed'
                Package = [IO.Path]::GetFileName($resolved)
                Result = $installResult
                Raw = $installJson
            }
        }
    }
}
finally {
    $client.Dispose()
    $handler.Dispose()
}
