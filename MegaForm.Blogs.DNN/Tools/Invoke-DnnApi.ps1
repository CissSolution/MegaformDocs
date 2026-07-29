[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [uri]$SiteUrl,

    [Parameter(Mandatory)]
    [pscredential]$Credential,

    [Parameter(Mandatory)]
    [ValidateSet('GET', 'POST')]
    [string]$Method,

    [Parameter(Mandatory)]
    [string]$ApiPath,

    [Parameter(Mandatory)]
    [int]$TabId,

    [object]$Body
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Net.Http

function Read-DnnResponse {
    param([Parameter(Mandatory)][Net.Http.HttpResponseMessage]$Response)

    $content = $Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $Response.IsSuccessStatusCode) {
        $summary = if ($content.Length -gt 1600) { $content.Substring(0, 1600) } else { $content }
        throw "HTTP $([int]$Response.StatusCode) $($Response.ReasonPhrase): $summary"
    }

    return $content
}

function Get-DnnInputFields {
    param([Parameter(Mandatory)][string]$Html)

    $fields = [ordered]@{}
    foreach ($match in [regex]::Matches($Html, '<input\b[^>]*>', 'IgnoreCase')) {
        $tag = $match.Value
        $name = [regex]::Match($tag, '\bname="([^"]+)"', 'IgnoreCase')
        if (-not $name.Success) {
            continue
        }

        $value = [regex]::Match($tag, '\bvalue="([^"]*)"', 'IgnoreCase')
        $fields[[Net.WebUtility]::HtmlDecode($name.Groups[1].Value)] = if ($value.Success) {
            [Net.WebUtility]::HtmlDecode($value.Groups[1].Value)
        }
        else {
            ''
        }
    }

    return $fields
}

$baseUrl = $SiteUrl.AbsoluteUri.TrimEnd('/') + '/'
$loginUrl = $baseUrl + 'Login?returnurl=%2fDefault.aspx%3ftabid%3d' + $TabId
$pageUrl = $baseUrl + 'Default.aspx?tabid=' + $TabId

$handler = [Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $true
$handler.CookieContainer = [Net.CookieContainer]::new()
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromMinutes(3)

try {
    $loginPageResponse = $client.GetAsync($loginUrl).GetAwaiter().GetResult()
    try {
        $loginHtml = Read-DnnResponse -Response $loginPageResponse
    }
    finally {
        $loginPageResponse.Dispose()
    }

    $fields = Get-DnnInputFields -Html $loginHtml
    $fields['dnn$ctr$Login$Login_DNN$txtUsername'] = $Credential.UserName
    $fields['dnn$ctr$Login$Login_DNN$txtPassword'] =
        $Credential.GetNetworkCredential().Password
    $fields['__EVENTTARGET'] = 'dnn$ctr$Login$Login_DNN$cmdLogin'
    $fields['__EVENTARGUMENT'] = ''

    $encodedFields = [Collections.Generic.Dictionary[string,string]]::new()
    foreach ($key in $fields.Keys) {
        $encodedFields.Add([string]$key, [string]$fields[$key])
    }

    $loginContent = [Net.Http.FormUrlEncodedContent]::new($encodedFields)
    try {
        $loginResponse = $client.PostAsync($loginUrl, $loginContent).GetAwaiter().GetResult()
        try {
            $null = Read-DnnResponse -Response $loginResponse
        }
        finally {
            $loginResponse.Dispose()
        }
    }
    finally {
        $loginContent.Dispose()
    }

    $pageResponse = $client.GetAsync($pageUrl).GetAwaiter().GetResult()
    try {
        $pageHtml = Read-DnnResponse -Response $pageResponse
    }
    finally {
        $pageResponse.Dispose()
    }

    if ($pageHtml -notmatch '/ctl/Logoff') {
        throw 'DNN Host authentication did not succeed.'
    }

    $tokenMatch = [regex]::Match(
        $pageHtml,
        'name="__RequestVerificationToken"[^>]*value="([^"]+)"',
        'IgnoreCase'
    )
    if (-not $tokenMatch.Success) {
        throw 'The DNN anti-forgery token was not present after login.'
    }

    $httpMethod = if ($Method -eq 'GET') {
        [Net.Http.HttpMethod]::Get
    }
    else {
        [Net.Http.HttpMethod]::Post
    }

    $request = [Net.Http.HttpRequestMessage]::new(
        $httpMethod,
        [uri]($baseUrl + $ApiPath.TrimStart('/'))
    )
    try {
        $request.Headers.Add(
            'RequestVerificationToken',
            [Net.WebUtility]::HtmlDecode($tokenMatch.Groups[1].Value)
        )
        $request.Headers.Add('TabId', [string]$TabId)
        $request.Headers.Add('ModuleId', '-1')

        if ($Method -eq 'POST') {
            $json = if ($null -eq $Body) { '{}' } else { $Body | ConvertTo-Json -Depth 20 }
            $request.Content = [Net.Http.StringContent]::new(
                $json,
                [Text.Encoding]::UTF8,
                'application/json'
            )
        }

        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        try {
            Read-DnnResponse -Response $response
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
    $client.Dispose()
    $handler.Dispose()
}
