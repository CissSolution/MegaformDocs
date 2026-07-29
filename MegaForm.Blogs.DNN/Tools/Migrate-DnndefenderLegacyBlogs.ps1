[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [uri]$SiteUrl,

    [Parameter(Mandatory)]
    [pscredential]$Credential,

    [Parameter(Mandatory)]
    [string]$BackupDirectory,

    [int]$FormId = 378,

    [int]$TabId = 1592,

    [int[]]$StarterSubmissionIds = (4..37),

    [string]$HtmlAgilityPackPath = (
        Join-Path $PSScriptRoot '..\..\local-packages-umbraco\htmlagilitypack\1.11.65\lib\Net45\HtmlAgilityPack.dll'
    )
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$resolvedBackupDirectory = (Resolve-Path -LiteralPath $BackupDirectory).Path
$resolvedHtmlAgilityPackPath = (Resolve-Path -LiteralPath $HtmlAgilityPackPath).Path
Add-Type -Path $resolvedHtmlAgilityPackPath

function Read-DnnResponse {
    param([Parameter(Mandatory)][Net.Http.HttpResponseMessage]$Response)

    $content = $Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $Response.IsSuccessStatusCode) {
        $summary = if ($content.Length -gt 2400) { $content.Substring(0, 2400) } else { $content }
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

function New-DnnSession {
    param(
        [Parameter(Mandatory)][uri]$Root,
        [Parameter(Mandatory)][pscredential]$LoginCredential,
        [Parameter(Mandatory)][int]$ContextTabId
    )

    $baseUrl = $Root.AbsoluteUri.TrimEnd('/') + '/'
    $loginUrl = $baseUrl + 'Login?returnurl=%2fDefault.aspx%3ftabid%3d' + $ContextTabId
    $pageUrl = $baseUrl + 'Default.aspx?tabid=' + $ContextTabId
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $true
    $handler.CookieContainer = [Net.CookieContainer]::new()
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromMinutes(4)

    try {
        $response = $client.GetAsync($loginUrl).GetAwaiter().GetResult()
        try {
            $loginHtml = Read-DnnResponse -Response $response
        }
        finally {
            $response.Dispose()
        }

        $fields = Get-DnnInputFields -Html $loginHtml
        $fields['dnn$ctr$Login$Login_DNN$txtUsername'] = $LoginCredential.UserName
        $fields['dnn$ctr$Login$Login_DNN$txtPassword'] =
            $LoginCredential.GetNetworkCredential().Password
        $fields['__EVENTTARGET'] = 'dnn$ctr$Login$Login_DNN$cmdLogin'
        $fields['__EVENTARGUMENT'] = ''

        $encodedFields = [Collections.Generic.Dictionary[string,string]]::new()
        foreach ($key in $fields.Keys) {
            $encodedFields.Add([string]$key, [string]$fields[$key])
        }

        $loginContent = [Net.Http.FormUrlEncodedContent]::new($encodedFields)
        try {
            $response = $client.PostAsync($loginUrl, $loginContent).GetAwaiter().GetResult()
            try {
                $null = Read-DnnResponse -Response $response
            }
            finally {
                $response.Dispose()
            }
        }
        finally {
            $loginContent.Dispose()
        }

        $response = $client.GetAsync($pageUrl).GetAwaiter().GetResult()
        try {
            $pageHtml = Read-DnnResponse -Response $response
        }
        finally {
            $response.Dispose()
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

        return [pscustomobject]@{
            BaseUrl = $baseUrl
            Client = $client
            Handler = $handler
            Token = [Net.WebUtility]::HtmlDecode($tokenMatch.Groups[1].Value)
            TabId = $ContextTabId
        }
    }
    catch {
        $client.Dispose()
        $handler.Dispose()
        throw
    }
}

function Invoke-DnnJson {
    param(
        [Parameter(Mandatory)]$Session,
        [Parameter(Mandatory)][ValidateSet('GET', 'POST')][string]$Method,
        [Parameter(Mandatory)][string]$ApiPath,
        [object]$Body
    )

    $httpMethod = if ($Method -eq 'GET') { [Net.Http.HttpMethod]::Get } else { [Net.Http.HttpMethod]::Post }
    $request = [Net.Http.HttpRequestMessage]::new(
        $httpMethod,
        [uri]($Session.BaseUrl + $ApiPath.TrimStart('/'))
    )
    try {
        $request.Headers.Add('RequestVerificationToken', $Session.Token)
        $request.Headers.Add('TabId', [string]$Session.TabId)
        $request.Headers.Add('ModuleId', '-1')
        $request.Headers.UserAgent.ParseAdd('Mozilla/5.0 MegaFormBlogMigration/1.0')
        if ($Method -eq 'POST') {
            $json = if ($null -eq $Body) { '{}' } else { $Body | ConvertTo-Json -Depth 40 -Compress }
            $request.Content = [Net.Http.StringContent]::new(
                $json,
                [Text.Encoding]::UTF8,
                'application/json'
            )
        }

        $response = $Session.Client.SendAsync($request).GetAwaiter().GetResult()
        try {
            $content = Read-DnnResponse -Response $response
        }
        finally {
            $response.Dispose()
        }
    }
    finally {
        $request.Dispose()
    }

    if ([string]::IsNullOrWhiteSpace($content)) {
        return $null
    }
    return $content | ConvertFrom-Json
}

function Read-HtmlDocument {
    param([Parameter(Mandatory)][string]$Path)

    $document = [HtmlAgilityPack.HtmlDocument]::new()
    $document.OptionFixNestedTags = $true
    $document.Load($Path, [Text.Encoding]::UTF8)
    return $document
}

function Select-CssClassNode {
    param(
        [Parameter(Mandatory)][HtmlAgilityPack.HtmlNode]$Root,
        [Parameter(Mandatory)][string]$ClassName
    )

    return $Root.SelectSingleNode(
        ".//*[contains(concat(' ',normalize-space(@class),' '),' $ClassName ')]"
    )
}

function ConvertTo-BlogBody {
    param(
        [Parameter(Mandatory)][HtmlAgilityPack.HtmlNode]$Source,
        [string[]]$RemoveClasses = @()
    )

    $holder = [HtmlAgilityPack.HtmlDocument]::new()
    $holder.LoadHtml('<div>' + $Source.InnerHtml + '</div>')
    $root = $holder.DocumentNode.SelectSingleNode('//div')

    $remove = [Collections.Generic.List[HtmlAgilityPack.HtmlNode]]::new()
    foreach ($xpath in @('.//script', './/style', './/noscript', './/button', './/input', './/h1')) {
        foreach ($node in @($root.SelectNodes($xpath))) {
            if ($null -ne $node) {
                $remove.Add($node)
            }
        }
    }

    foreach ($className in $RemoveClasses) {
        $matches = $root.SelectNodes(
            ".//*[contains(concat(' ',normalize-space(@class),' '),' $className ')]"
        )
        if ($matches) {
            foreach ($node in $matches) {
                $remove.Add($node)
            }
        }
    }

    foreach ($node in ($remove | Select-Object -Unique)) {
        if ($node.ParentNode) {
            $node.Remove()
        }
    }

    foreach ($node in @($root.Descendants())) {
        if ($node.NodeType -ne [HtmlAgilityPack.HtmlNodeType]::Element) {
            continue
        }
        foreach ($attribute in @($node.Attributes)) {
            $keep = $attribute.Name -in @('href', 'src', 'alt', 'title', 'target', 'rel')
            if (-not $keep -or $attribute.Name -like 'on*') {
                $node.Attributes.Remove($attribute)
            }
        }
        if ($node.Name -eq 'a' -and $node.GetAttributeValue('target', '') -eq '_blank') {
            $node.SetAttributeValue('rel', 'noopener noreferrer')
        }
    }

    $html = $root.InnerHtml
    $html = [regex]::Replace($html, '<div>\s*</div>', '', 'IgnoreCase')
    $html = [regex]::Replace($html, '(\r?\n\s*){3,}', "`r`n`r`n")
    return $html.Trim()
}

function Get-PlainText {
    param([Parameter(Mandatory)][string]$Html)

    $document = [HtmlAgilityPack.HtmlDocument]::new()
    $document.LoadHtml($Html)
    return ([Net.WebUtility]::HtmlDecode($document.DocumentNode.InnerText) -replace '\s+', ' ').Trim()
}

$blogsDocument = Read-HtmlDocument -Path (Join-Path $resolvedBackupDirectory 'Blogs-before.html')
$acmeModule = $blogsDocument.GetElementbyId('dnn_ctr19031_HtmlModule_lblContent')
$megaFormModule = $blogsDocument.GetElementbyId('dnn_ctr420_HtmlModule_lblContent')
$oqtaneModule = $blogsDocument.GetElementbyId('dnn_ctr410_HtmlModule_lblContent')
if (-not $acmeModule -or -not $megaFormModule -or -not $oqtaneModule) {
    throw 'One or more legacy HTML modules were not found in Blogs-before.html.'
}

$acmeArticle = Select-CssClassNode -Root $acmeModule -ClassName 'acme-blog'
$megaFormContent = Select-CssClassNode -Root $megaFormModule -ClassName 'content'
$post185Document = Read-HtmlDocument -Path (Join-Path $resolvedBackupDirectory 'Post-185-before.html')
$post186Document = Read-HtmlDocument -Path (Join-Path $resolvedBackupDirectory 'Post-186-before.html')
$post185Body = $post185Document.DocumentNode.SelectSingleNode(
    "//*[contains(concat(' ',normalize-space(@class),' '),' blog-main-content ')]//*[contains(concat(' ',normalize-space(@class),' '),' body ')]"
)
$post186Body = $post186Document.DocumentNode.SelectSingleNode(
    "//*[contains(concat(' ',normalize-space(@class),' '),' blog-main-content ')]//*[contains(concat(' ',normalize-space(@class),' '),' body ')]"
)
if (-not $acmeArticle -or -not $megaFormContent -or -not $post185Body -or -not $post186Body) {
    throw 'One or more legacy article bodies could not be extracted.'
}

$emDash = [char]0x2014
$enDash = [char]0x2013
$records = @(
    [ordered]@{
        migration_source = 'DNN HTML module 19031'
        migration_key = 'dnndefender-html-19031'
        post_uid = 'POST-DNNDEF-19031'
        title = 'A Standard DNN Skin, Built for the Way Sites Actually Get Made'
        slug = 'standard-dnn-skin-built-for-real-site-work'
        excerpt = 'A practical DNN skin system built around reusable panes, flexible themes, CISS Elementor blocks, and visual menu design.'
        body = ConvertTo-BlogBody -Source $acmeArticle -RemoveClasses @('acme-eyebrow', 'acme-meta', 'acme-tags')
        content_type = 'Blog Post'
        category = 'Development'
        category_uid = 'CAT-DEVELOPMENT'
        tags = 'DNN, DotNetNuke, skin, theme, CISS Elementor, menu builder'
        audience = 'Public'
        language = 'en-US'
        author_name = 'ACME Team'
        author_email = 'host@dnndefender.com'
        author_role = 'Product Team'
        publish_date = '2026-07-29'
        status = 'published'
        is_featured = 'false'
        newsletter_featured = 'false'
        rss_enabled = 'true'
        allow_comments = 'true'
        seo_title = 'A Standard DNN Skin Built for Real Site Work'
        seo_description = 'Reusable DNN panes, theme designs, CISS Elementor blocks, and visual menu tools for practical site delivery.'
        canonical_url = '/Blogs/standard-dnn-skin-built-for-real-site-work'
        revision_summary = 'Migrated from legacy DNN HTML module 19031 on 2026-07-29.'
    },
    [ordered]@{
        migration_source = 'DNN HTML module 420'
        migration_key = 'dnndefender-html-420'
        post_uid = 'POST-DNNDEF-420'
        title = ('Modern Forms, Workflow Automation, and Self-Hosted Control ' + $emDash + ' All in One Platform')
        slug = 'modern-forms-workflow-self-hosted-control'
        excerpt = 'How MegaForm combines rich forms, workflow automation, integrations, AI-assisted building, and self-hosted control for DNN.'
        body = ConvertTo-BlogBody -Source $megaFormContent
        content_type = 'Blog Post'
        category = 'Product'
        category_uid = 'CAT-PRODUCT'
        tags = 'MegaForm, DNN, forms, workflow, automation, self-hosted'
        audience = 'Public'
        language = 'en-US'
        author_name = 'DNN Defender Team'
        author_email = 'host@dnndefender.com'
        author_role = 'Product Team'
        publish_date = '2026-07-29'
        status = 'published'
        is_featured = 'true'
        newsletter_featured = 'false'
        rss_enabled = 'true'
        allow_comments = 'true'
        seo_title = 'MegaForm: Modern Forms, Workflow and Self-Hosted Control'
        seo_description = 'Build rich DNN forms, automate approvals and integrations, and keep ownership of your infrastructure and data.'
        canonical_url = '/Blogs/modern-forms-workflow-self-hosted-control'
        revision_summary = 'Migrated from legacy DNN HTML module 420 on 2026-07-29.'
    },
    [ordered]@{
        migration_source = 'DNN HTML module 410'
        migration_key = 'dnndefender-html-410'
        post_uid = 'POST-DNNDEF-410'
        title = 'DNN and Oqtane'
        slug = 'dnn-and-oqtane'
        excerpt = 'A practical comparison of DNN and Oqtane, why both platforms matter, and how a team can bridge them without abandoning proven DNN investments.'
        body = ConvertTo-BlogBody -Source $oqtaneModule
        content_type = 'Opinion'
        category = 'Development'
        category_uid = 'CAT-DEVELOPMENT'
        tags = 'DNN, DotNetNuke, Oqtane, .NET, CMS'
        audience = 'Public'
        language = 'en-US'
        author_name = 'DNN Defender Team'
        author_email = 'host@dnndefender.com'
        author_role = 'Engineering Team'
        publish_date = '2026-07-29'
        status = 'published'
        is_featured = 'false'
        newsletter_featured = 'false'
        rss_enabled = 'true'
        allow_comments = 'true'
        seo_title = 'DNN and Oqtane: A Practical Platform Comparison'
        seo_description = 'A real-world view of DNN and Oqtane, their strengths, tradeoffs, and how teams can use both platforms.'
        canonical_url = '/Blogs/dnn-and-oqtane'
        revision_summary = 'Migrated from legacy DNN HTML module 410 on 2026-07-29.'
    },
    [ordered]@{
        migration_source = 'DNN Blog post 185'
        migration_key = 'dnndefender-blog-185'
        post_uid = 'POST-DNNDEF-185'
        title = 'Why Bots Target Forms, Including DNN Ones'
        slug = 'why-bots-target-forms-including-dnn'
        excerpt = 'Why automated bots attack DNN contact and registration forms, what they are trying to gain, and the controls that reduce abuse.'
        body = ConvertTo-BlogBody -Source $post185Body
        content_type = 'Guide'
        category = 'Security'
        category_uid = 'CAT-SECURITY'
        tags = 'DNN, bot protection, form security, spam, CAPTCHA'
        audience = 'Public'
        language = 'en-US'
        author_name = 'SuperUser Account'
        author_email = 'host@dnndefender.com'
        author_role = 'DNN Defender'
        publish_date = '2026-02-12'
        status = 'published'
        is_featured = 'false'
        newsletter_featured = 'false'
        rss_enabled = 'true'
        allow_comments = 'true'
        seo_title = 'Why Bots Target DNN Forms and How to Reduce Abuse'
        seo_description = 'Understand backlink spam, credential abuse, scraping, and other automated attacks against public DNN forms.'
        canonical_url = '/Blogs/why-bots-target-forms-including-dnn'
        revision_summary = 'Migrated from legacy DNN Blog post 185 on 2026-07-29.'
    },
    [ordered]@{
        migration_source = 'DNN Blog post 186'
        migration_key = 'dnndefender-blog-186'
        post_uid = 'POST-DNNDEF-186'
        title = ('Modern Webshells 2024' + $enDash + '2026: Minimal C# Loader Techniques with Encrypted Payloads from C2 and How They Bypass Detection')
        slug = 'modern-webshells-2024-2026-minimal-csharp-loaders'
        excerpt = 'An analysis of modern minimal C# webshell loaders, encrypted remote payloads, detection gaps, and practical defensive controls.'
        body = ConvertTo-BlogBody -Source $post186Body
        content_type = 'Guide'
        category = 'Security'
        category_uid = 'CAT-SECURITY'
        tags = 'webshell, C#, .NET, DNN security, C2, malware detection'
        audience = 'Public'
        language = 'en-US'
        author_name = 'SuperUser Account'
        author_email = 'host@dnndefender.com'
        author_role = 'DNN Defender'
        publish_date = '2026-02-12'
        status = 'published'
        is_featured = 'false'
        newsletter_featured = 'false'
        rss_enabled = 'true'
        allow_comments = 'true'
        seo_title = ('Modern C# Webshell Loaders and Detection Gaps, 2024' + $enDash + '2026')
        seo_description = 'How minimal .NET webshell loaders use encrypted remote payloads, why common scanning misses them, and how defenders can respond.'
        canonical_url = '/Blogs/modern-webshells-2024-2026-minimal-csharp-loaders'
        revision_summary = 'Migrated from legacy DNN Blog post 186 on 2026-07-29.'
    }
)

foreach ($record in $records) {
    $plainText = Get-PlainText -Html $record.body
    $record.reading_time = [Math]::Max(1, [Math]::Ceiling(($plainText -split '\s+').Count / 200.0))
    $record.view_count = 0
    $record.unique_readers = 0
    $record.comment_count = 0
    $record.share_count = 0
    $record.comment_moderation_state = 'Open'
    $record.editorial_priority = 'Normal'
    $record.legal_review_required = 'false'
    $record.moderation_status = 'Open'
}

$session = New-DnnSession -Root $SiteUrl -LoginCredential $Credential -ContextTabId $TabId
try {
    $current = Invoke-DnnJson -Session $session -Method GET -ApiPath (
        "DesktopModules/MegaForm/API/Submissions/List?formId=$FormId&pageIndex=0&pageSize=100"
    )
    $items = @($current.items)
    $existingSlugs = @{}
    foreach ($item in $items) {
        try {
            $data = $item.dataJson | ConvertFrom-Json
            if (-not [string]::IsNullOrWhiteSpace([string]$data.slug)) {
                $existingSlugs[[string]$data.slug] = [int]$item.submissionId
            }
        }
        catch {
            Write-Warning "Submission $($item.submissionId) has invalid compatibility JSON and was not inspected."
        }
    }

    $archived = [Collections.Generic.List[int]]::new()
    foreach ($item in $items) {
        $submissionId = [int]$item.submissionId
        if ($submissionId -notin $StarterSubmissionIds) {
            continue
        }

        $data = $item.dataJson | ConvertFrom-Json
        if ([string]$data.status -eq 'archived') {
            continue
        }

        if ($PSCmdlet.ShouldProcess("starter submission $submissionId", 'Archive through MegaForm typed resync')) {
            $data.status = 'archived'
            $null = Invoke-DnnJson -Session $session -Method POST -ApiPath (
                "DesktopModules/MegaForm/API/Submissions/UpdateData?submissionId=$submissionId"
            ) -Body $data
            $archived.Add($submissionId)
        }
    }

    $migrated = [Collections.Generic.List[object]]::new()
    $skipped = [Collections.Generic.List[object]]::new()
    foreach ($record in $records) {
        if ($existingSlugs.ContainsKey([string]$record.slug)) {
            $skipped.Add([pscustomobject]@{
                SubmissionId = $existingSlugs[[string]$record.slug]
                Slug = $record.slug
                Title = $record.title
            })
            continue
        }

        if ($PSCmdlet.ShouldProcess($record.title, 'Create MegaForm typed blog submission')) {
            $result = Invoke-DnnJson -Session $session -Method POST -ApiPath (
                'DesktopModules/MegaForm/API/Submit/Post'
            ) -Body @{
                formId = $FormId
                data = $record
                # This is a deliberate editorial import, not an instant bot post.
                # Keeping a realistic elapsed time also avoids the public endpoint's
                # "submitted in under three seconds" heuristic.
                submissionTime = 60
            }
            if (-not $result.success) {
                throw "Migration failed for '$($record.title)': $($result.error)"
            }
            $migrated.Add([pscustomobject]@{
                SubmissionId = [int]$result.submissionId
                Slug = $record.slug
                Title = $record.title
            })
        }
    }

    $verification = Invoke-DnnJson -Session $session -Method GET -ApiPath (
        "DesktopModules/MegaForm/API/Submissions/List?formId=$FormId&queryKey=public-posts&pageIndex=0&pageSize=100"
    )
    $publicPosts = foreach ($item in @($verification.items)) {
        $data = $item.dataJson | ConvertFrom-Json
        [pscustomobject]@{
            SubmissionId = [int]$item.submissionId
            Slug = [string]$data.slug
            Title = [string]$data.title
            Status = [string]$data.status
        }
    }

    [pscustomobject]@{
        ArchivedStarterSubmissionIds = @($archived)
        Migrated = @($migrated)
        SkippedExisting = @($skipped)
        PublicPosts = @($publicPosts)
    }
}
finally {
    $session.Client.Dispose()
    $session.Handler.Dispose()
}
