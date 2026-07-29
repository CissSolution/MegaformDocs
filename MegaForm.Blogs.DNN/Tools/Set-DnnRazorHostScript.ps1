[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [uri]$SiteUrl,

    [Parameter(Mandatory)]
    [pscredential]$Credential,

    [Parameter(Mandatory)]
    [string]$PagePath,

    [Parameter(Mandatory)]
    [int]$ModuleId,

    [Parameter(Mandatory)]
    [string]$ScriptFile
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

        $type = [regex]::Match($tag, '\btype="([^"]+)"', 'IgnoreCase')
        if ($type.Success -and $type.Groups[1].Value -in @('button', 'image', 'reset', 'submit')) {
            continue
        }

        if ($type.Success -and $type.Groups[1].Value -in @('checkbox', 'radio') -and
            $tag -notmatch '\bchecked(?:\s*=\s*"checked")?') {
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

    foreach ($match in [regex]::Matches($Html, '<textarea\b[^>]*\bname="([^"]+)"[^>]*>(.*?)</textarea>', 'IgnoreCase,Singleline')) {
        $fields[[Net.WebUtility]::HtmlDecode($match.Groups[1].Value)] =
            [Net.WebUtility]::HtmlDecode($match.Groups[2].Value)
    }

    foreach ($match in [regex]::Matches($Html, '<select\b[^>]*\bname="([^"]+)"[^>]*>(.*?)</select>', 'IgnoreCase,Singleline')) {
        $name = [Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
        $options = [regex]::Matches($match.Groups[2].Value, '<option\b([^>]*)>(.*?)</option>', 'IgnoreCase,Singleline')
        if ($options.Count -eq 0) {
            continue
        }

        $selected = $options | Where-Object { $_.Groups[1].Value -match '\bselected(?:\s*=\s*"selected")?' } |
            Select-Object -First 1
        if ($null -eq $selected) {
            $selected = $options[0]
        }

        $value = [regex]::Match($selected.Groups[1].Value, '\bvalue="([^"]*)"', 'IgnoreCase')
        $fields[$name] = if ($value.Success) {
            [Net.WebUtility]::HtmlDecode($value.Groups[1].Value)
        }
        else {
            [Net.WebUtility]::HtmlDecode(($selected.Groups[2].Value -replace '<[^>]+>', ''))
        }
    }

    return $fields
}

function ConvertTo-StringDictionary {
    param([Parameter(Mandatory)][Collections.IDictionary]$Fields)

    $dictionary = [Collections.Generic.Dictionary[string,string]]::new()
    foreach ($key in $Fields.Keys) {
        $dictionary[[string]$key] = [string]$Fields[$key]
    }

    return $dictionary
}

$baseUrl = $SiteUrl.AbsoluteUri.TrimEnd('/') + '/'
$pagePathValue = $PagePath.Trim('/')
$pageUrl = $baseUrl + $pagePathValue
$loginUrl = $baseUrl + 'Login?returnurl=' + [uri]::EscapeDataString('/' + $pagePathValue)
$settingsUrl = $pageUrl + '/ctl/Module/ModuleId/' + $ModuleId

$handler = [Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $true
$handler.CookieContainer = [Net.CookieContainer]::new()
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromMinutes(3)
$client.DefaultRequestHeaders.UserAgent.ParseAdd(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0 Safari/537.36')

try {
    $loginResponse = $client.GetAsync($loginUrl).GetAwaiter().GetResult()
    try {
        $loginHtml = Read-DnnResponse -Response $loginResponse
    }
    finally {
        $loginResponse.Dispose()
    }

    $loginFields = Get-DnnInputFields -Html $loginHtml
    $userField = $loginFields.Keys | Where-Object { $_ -match 'txtUsername$' } | Select-Object -First 1
    $passwordField = $loginFields.Keys | Where-Object { $_ -match 'txtPassword$' } | Select-Object -First 1
    $loginTarget = $loginFields.Keys | Where-Object { $_ -match 'cmdLogin$' } | Select-Object -First 1
    if (-not $userField -or -not $passwordField) {
        throw 'Could not locate the DNN login fields.'
    }

    $loginFields[$userField] = $Credential.UserName
    $loginFields[$passwordField] = $Credential.GetNetworkCredential().Password
    $loginFields['__EVENTTARGET'] = if ($loginTarget) { $loginTarget } else { 'dnn$ctr$Login$Login_DNN$cmdLogin' }
    $loginFields['__EVENTARGUMENT'] = ''

    $loginContent = [Net.Http.FormUrlEncodedContent]::new(
        (ConvertTo-StringDictionary -Fields $loginFields))
    $loginPostResponse = $client.PostAsync($loginUrl, $loginContent).GetAwaiter().GetResult()
    try {
        [void](Read-DnnResponse -Response $loginPostResponse)
    }
    finally {
        $loginPostResponse.Dispose()
        $loginContent.Dispose()
    }

    $settingsResponse = $client.GetAsync($settingsUrl).GetAwaiter().GetResult()
    try {
        $settingsResponseUrl = $settingsResponse.RequestMessage.RequestUri.AbsoluteUri
        $settingsHtml = Read-DnnResponse -Response $settingsResponse
    }
    finally {
        $settingsResponse.Dispose()
    }

    $fields = Get-DnnInputFields -Html $settingsHtml
    $scriptField = $fields.Keys | Where-Object { $_ -match '\$Settings\$scriptList$' } | Select-Object -First 1
    if (-not $scriptField) {
        $title = [regex]::Match($settingsHtml, '<title>(.*?)</title>', 'IgnoreCase,Singleline').Groups[1].Value
        throw "Could not locate the Razor Host script selector for module $ModuleId. URL=$settingsResponseUrl; Title=$title; Authenticated=$($settingsHtml -match '/ctl/Logoff'); HasScriptList=$($settingsHtml -match 'scriptList')"
    }

    if ($settingsHtml -notmatch ('value="' + [regex]::Escape($ScriptFile) + '"')) {
        throw "Razor script '$ScriptFile' is not installed on the site."
    }

    $fields[$scriptField] = $ScriptFile
    $fields['__EVENTTARGET'] = 'dnn$ctr' + $ModuleId + '$ModuleSettings$cmdUpdate'
    $fields['__EVENTARGUMENT'] = ''

    $postContent = [Net.Http.FormUrlEncodedContent]::new(
        (ConvertTo-StringDictionary -Fields $fields))
    $postResponse = $client.PostAsync($settingsUrl, $postContent).GetAwaiter().GetResult()
    try {
        [void](Read-DnnResponse -Response $postResponse)
    }
    finally {
        $postResponse.Dispose()
        $postContent.Dispose()
    }

    $verifyResponse = $client.GetAsync($settingsUrl).GetAwaiter().GetResult()
    try {
        $verifyHtml = Read-DnnResponse -Response $verifyResponse
    }
    finally {
        $verifyResponse.Dispose()
    }

    $selector = [regex]::Match(
        $verifyHtml,
        '<select\b[^>]*\bname="' + [regex]::Escape($scriptField) + '"[^>]*>(.*?)</select>',
        'IgnoreCase,Singleline')
    if (-not $selector.Success) {
        throw 'Could not verify the Razor Host script setting.'
    }

    $selectedOption = [regex]::Match(
        $selector.Groups[1].Value,
        '<option\b(?=[^>]*\bvalue="' + [regex]::Escape($ScriptFile) +
        '")(?=[^>]*\bselected(?:\s*=\s*"selected")?)[^>]*>',
        'IgnoreCase')
    if (-not $selectedOption.Success) {
        throw "Razor Host script setting did not persist for module $ModuleId."
    }

    [pscustomobject]@{
        ModuleId = $ModuleId
        PagePath = '/' + $pagePathValue
        ScriptFile = $ScriptFile
        Verified = $true
    }
}
finally {
    $client.Dispose()
    $handler.Dispose()
}
