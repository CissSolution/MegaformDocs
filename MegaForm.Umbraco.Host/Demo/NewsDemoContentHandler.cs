using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Strings;

namespace MegaForm.Umbraco.Host.Demo
{
    /// <summary>
    /// Seeds a small newsroom into the demo site: two Document Types with their templates,
    /// a "News" section and six articles, each one carrying a different MegaForm.
    ///
    /// Why it exists: the only sample page the package created was a bare "Contact Us" node,
    /// which proves a form renders but not that it survives a real page — a page with a header,
    /// body copy around it, a card that constrains its width, and sibling pages that must each
    /// resolve their own form. The six articles are picked to span the field types that break
    /// differently: a single-field form, selects, a SQL-backed lookup, a file upload, a
    /// multi-step form, and a twelve-field premium template.
    ///
    /// The templates are seeded from the constants below rather than from .cshtml files in this
    /// project, because an Umbraco template is a database record plus a physical file: creating
    /// the file alone leaves a page with no template ("No template exists to render..."), and
    /// IFileService.SaveTemplate writes both. The generated files land in Views/ next to the
    /// package's own generated megaFormPage.cshtml.
    ///
    /// One caveat specific to this host: it sets RazorCompileOnBuild and does not reference
    /// Microsoft.AspNetCore.Mvc.Razor.RuntimeCompilation, so views exist only as compiled into
    /// the assembly. A template written here on first run is therefore invisible until the next
    /// build — the page 404s even though the file is on disk. Keep the generated Views/*.cshtml
    /// in source control so a build always has them.
    /// </summary>
    public class NewsDemoContentHandler : INotificationHandler<UmbracoApplicationStartedNotification>
    {
        /// <summary>Bump the suffix to make an installed demo site re-seed.</summary>
        private const string SeedKey = "MegaForm_Umbraco_Host_NewsDemo_v1";

        private const string ArticleTypeAlias = "newsArticle";
        private const string ListTypeAlias = "newsList";

        /// <summary>Present in both templates; its absence means the template predates this seeder.</summary>
        private const string TemplateMarker = "news-demo.css";

        private readonly IContentTypeService _contentTypeService;
        private readonly IContentService _contentService;
        private readonly IDataTypeService _dataTypeService;
        private readonly IFileService _fileService;
        private readonly IShortStringHelper _shortStringHelper;
        private readonly IKeyValueService _keyValueService;
        private readonly IRuntimeState _runtimeState;
        private readonly ILogger<NewsDemoContentHandler> _logger;

        public NewsDemoContentHandler(
            IContentTypeService contentTypeService,
            IContentService contentService,
            IDataTypeService dataTypeService,
            IFileService fileService,
            IShortStringHelper shortStringHelper,
            IKeyValueService keyValueService,
            IRuntimeState runtimeState,
            ILogger<NewsDemoContentHandler> logger)
        {
            _contentTypeService = contentTypeService;
            _contentService = contentService;
            _dataTypeService = dataTypeService;
            _fileService = fileService;
            _shortStringHelper = shortStringHelper;
            _keyValueService = keyValueService;
            _runtimeState = runtimeState;
            _logger = logger;
        }

        public void Handle(UmbracoApplicationStartedNotification notification)
        {
            if (_runtimeState.Level < RuntimeLevel.Run)
                return;

            ITemplate articleTemplate;
            ITemplate listTemplate;

            try
            {
                // Templates are checked on every start, ahead of the once-only gate below.
                // An Umbraco template is a database row plus a .cshtml file, and only the row
                // survives a `git clean` or a fresh clone: the row then resolves, the file does
                // not, and every news URL answers 404 with one warning in the log
                // ("No physical template file was found for template newsList"). Gating this
                // behind the seed key would make that state permanent for any site that hit it.
                articleTemplate = EnsureTemplate(ArticleTypeAlias, "News Article", ArticleTemplateContent);
                listTemplate = EnsureTemplate(ListTypeAlias, "News List", ListTemplateContent);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm.Umbraco.Host] Failed to ensure the news demo templates.");
                return;
            }

            // Chạy TRƯỚC cổng once-only, cùng lý do như phần template ở trên: những
            // site đã gieo xong sẽ không bao giờ đi qua đoạn dưới nữa, nên một thứ
            // cần dọn mà đặt sau cổng thì với chúng là dọn vĩnh viễn không tới.
            TryRemoveLegacyFormCopyProperties();

            if (!string.IsNullOrEmpty(_keyValueService.GetValue(SeedKey)))
                return;

            try
            {
                var articleType = EnsureArticleType(articleTemplate);
                var listType = EnsureListType(listTemplate, articleType);

                var newsRoot = EnsureNewsRoot(listType, listTemplate);
                SeedArticles(newsRoot, articleType, articleTemplate);

                _keyValueService.SetValue(SeedKey, DateTime.UtcNow.ToString("O"));
                _logger.LogInformation("[MegaForm.Umbraco.Host] News demo seeded: '{ListAlias}' root (id={RootId}) with {Count} articles.",
                    ListTypeAlias, newsRoot.Id, Articles.Length);
            }
            catch (Exception ex)
            {
                // A failed demo seed must never stop the site from booting.
                _logger.LogError(ex, "[MegaForm.Umbraco.Host] Failed to seed the news demo content.");
            }
        }

        // ---------------------------------------------------------------- templates

        private ITemplate EnsureTemplate(string alias, string name, string content)
        {
            var template = _fileService.GetTemplate(alias);
            if (template != null)
            {
                if (string.IsNullOrWhiteSpace(template.Content) || !template.Content.Contains(TemplateMarker))
                {
                    template.Content = content;
                    _fileService.SaveTemplate(template);
                    _logger.LogInformation("[MegaForm.Umbraco.Host] Refreshed template '{Alias}'.", alias);
                }

                return template;
            }

            template = new Template(_shortStringHelper, name, alias) { Content = content };
            _fileService.SaveTemplate(template);
            _logger.LogInformation("[MegaForm.Umbraco.Host] Created template '{Name}' (alias={Alias}).", name, alias);
            return template;
        }

        // ------------------------------------------------------------- document types

        private IContentType EnsureArticleType(ITemplate template)
        {
            var existing = _contentTypeService.Get(ArticleTypeAlias);
            if (existing != null)
                return existing;

            var contentType = new ContentType(_shortStringHelper, -1)
            {
                Alias = ArticleTypeAlias,
                Name = "News Article",
                Description = "A newsroom story that can carry one MegaForm.",
                Icon = "icon-newspaper-alt",
                AllowedAsRoot = false
            };

            var contentTab = NewTab(contentType, "content", "Content", 10);
            contentTab.PropertyTypes.Add(NewProperty("Umbraco.DateTime", "articleDate", "Published on", "Shown above the headline.", 10));
            contentTab.PropertyTypes.Add(NewProperty("Umbraco.TextBox", "topic", "Topic", "Small label on the card, e.g. Release or Events.", 20));
            contentTab.PropertyTypes.Add(NewProperty("Umbraco.TextArea", "summary", "Summary", "One or two sentences, used on the listing page.", 30));
            contentTab.PropertyTypes.Add(NewProperty("Umbraco.TextArea", "body", "Body", "Article HTML. A plain textarea keeps the seeded copy readable in every Umbraco version.", 40));
            contentType.PropertyGroups.Add(contentTab);

            var formTab = NewTab(contentType, "form", "Form", 20);
            formTab.PropertyTypes.Add(NewProperty("MegaForm.FormPicker", "megaFormPicker", "MegaForm", "The form rendered at the end of the article.", 10));
            contentType.PropertyGroups.Add(formTab);

            contentType.AllowedTemplates = new[] { template };
            contentType.SetDefaultTemplate(template);

            _contentTypeService.Save(contentType);
            _logger.LogInformation("[MegaForm.Umbraco.Host] Created Document Type '{Alias}'.", ArticleTypeAlias);
            return contentType;
        }

        private IContentType EnsureListType(ITemplate template, IContentType articleType)
        {
            var existing = _contentTypeService.Get(ListTypeAlias);
            if (existing != null)
                return existing;

            var contentType = new ContentType(_shortStringHelper, -1)
            {
                Alias = ListTypeAlias,
                Name = "News List",
                Description = "Landing page listing News Article children.",
                Icon = "icon-newspaper",
                AllowedAsRoot = true
            };

            var contentTab = NewTab(contentType, "content", "Content", 10);
            contentTab.PropertyTypes.Add(NewProperty("Umbraco.TextArea", "intro", "Intro", "Lede paragraph under the page title.", 10));
            contentType.PropertyGroups.Add(contentTab);

            var formTab = NewTab(contentType, "form", "Form", 20);
            formTab.PropertyTypes.Add(NewProperty("MegaForm.FormPicker", "megaFormPicker", "MegaForm", "Form rendered at the foot of the listing.", 10));
            contentType.PropertyGroups.Add(formTab);

            contentType.AllowedTemplates = new[] { template };
            contentType.SetDefaultTemplate(template);

            // Without this the backoffice offers no "Create" option under News, so an editor
            // cannot add a second article by hand even though the seeder can.
            contentType.AllowedContentTypes = new[] { new ContentTypeSort(articleType.Key, 0, articleType.Alias) };

            _contentTypeService.Save(contentType);
            _logger.LogInformation("[MegaForm.Umbraco.Host] Created Document Type '{Alias}'.", ListTypeAlias);
            return contentType;
        }

        private PropertyGroup NewTab(ContentType contentType, string alias, string name, int sortOrder)
        {
            return new PropertyGroup(new PropertyTypeCollection(contentType.SupportsPublishing))
            {
                Alias = alias,
                Name = name,
                Type = PropertyGroupType.Tab,
                SortOrder = sortOrder
            };
        }

        /// <summary>
        /// Gỡ "Form heading" / "Form intro" khỏi hai document type demo.
        /// </summary>
        /// <remarks>
        /// Hai ô này dựng thêm một tiêu đề và một lời dẫn ở NGOÀI form, trong khi mọi
        /// template MegaForm đều đã có tiêu đề và lời dẫn của riêng nó ngay trong thiết kế.
        /// Kết quả trên màn hình là hai tiêu đề chồng nhau và một lớp chữ không thuộc về
        /// bản thiết kế nào cả. Umbraco Forms không có cặp ô này, và đó là lý do trang
        /// demo của nó gọn hơn.
        ///
        /// Gỡ property sẽ XOÁ giá trị đã nhập ở mọi node — đó là chủ ý, owner đã chốt:
        /// "bỏ đi để form hiển thị đúng theo thiết kế".
        ///
        /// Không có bước này thì sửa mã là vô ích với site đang chạy: document type nằm
        /// trong cơ sở dữ liệu, và cổng once-only đã đóng từ lần gieo đầu tiên.
        /// </remarks>
        private void TryRemoveLegacyFormCopyProperties()
        {
            foreach (var alias in new[] { ArticleTypeAlias, ListTypeAlias })
            {
                try
                {
                    var contentType = _contentTypeService.Get(alias);
                    if (contentType == null) continue;

                    var removed = 0;
                    foreach (var property in new[] { "formHeading", "formIntro" })
                    {
                        if (contentType.PropertyTypeExists(property))
                        {
                            contentType.RemovePropertyType(property);
                            removed++;
                        }
                    }

                    if (removed > 0)
                    {
                        _contentTypeService.Save(contentType);
                        _logger.LogInformation(
                            "[MegaForm.Umbraco.Host] Removed {Count} legacy form-copy properties from '{Alias}'.",
                            removed, alias);
                    }
                }
                catch (Exception ex)
                {
                    // Dọn dẹp hỏng thì thôi, không được làm site không lên được.
                    _logger.LogWarning(ex,
                        "[MegaForm.Umbraco.Host] Could not remove legacy form-copy properties from '{Alias}'.", alias);
                }
            }
        }

        private PropertyType NewProperty(string editorAlias, string alias, string name, string description, int sortOrder)
        {
            var dataType = ResolveDataType(editorAlias);
            return new PropertyType(_shortStringHelper, dataType)
            {
                Alias = alias,
                Name = name,
                Description = description,
                SortOrder = sortOrder
            };
        }

        /// <summary>
        /// Resolve a data type by the property editor it uses. Looking a data type up by display
        /// name breaks on a non-English backoffice and on sites where an editor renamed it.
        /// </summary>
        private IDataType ResolveDataType(string editorAlias)
        {
            var all = _dataTypeService.GetAll().Where(dt => dt != null).ToList();

            var match = all.FirstOrDefault(dt => string.Equals(dt.EditorAlias, editorAlias, StringComparison.OrdinalIgnoreCase));
            if (match != null)
                return match;

            throw new InvalidOperationException(
                $"No data type uses property editor '{editorAlias}'. Available: " +
                string.Join(", ", all.Select(dt => dt.EditorAlias).Distinct().OrderBy(a => a)));
        }

        // ------------------------------------------------------------------ content

        private IContent EnsureNewsRoot(IContentType listType, ITemplate template)
        {
            const string name = "News";

            var existing = _contentService.GetPagedChildren(Constants.System.Root, 0, 100, out _, null)
                .FirstOrDefault(c => c.ContentType.Alias == ListTypeAlias);

            if (existing != null)
                return existing;

            var content = _contentService.Create(name, Constants.System.Root, ListTypeAlias, -1);
            content.SetValue("intro",
                "Product news, release notes and field notes from the MegaForm team. " +
                "Every story ends with a real form you can fill in — the same forms a customer would meet.");
            content.SetValue("megaFormPicker", "2");
            content.TemplateId = template.Id;

            _contentService.SaveAndPublish(content, Array.Empty<string>(), -1);
            _logger.LogInformation("[MegaForm.Umbraco.Host] Created news landing page (id={Id}).", content.Id);
            return content;
        }

        private void SeedArticles(IContent parent, IContentType articleType, ITemplate template)
        {
            var existingNames = _contentService
                .GetPagedChildren(parent.Id, 0, 200, out _, null)
                .Select(c => c.Name)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            foreach (var article in Articles)
            {
                if (existingNames.Contains(article.Name))
                    continue;

                var content = _contentService.Create(article.Name, parent.Id, ArticleTypeAlias, -1);
                content.SetValue("articleDate", article.Date);
                content.SetValue("topic", article.Topic);
                content.SetValue("summary", article.Summary);
                content.SetValue("body", article.Body);
                content.SetValue("megaFormPicker", article.FormId.ToString());
                content.TemplateId = template.Id;

                _contentService.SaveAndPublish(content, Array.Empty<string>(), -1);
                _logger.LogInformation("[MegaForm.Umbraco.Host] Created article '{Name}' (id={Id}) with form {FormId}.",
                    article.Name, content.Id, article.FormId);
            }
        }

        private sealed class ArticleSeed
        {
            public string Name { get; set; }
            public string Topic { get; set; }
            public DateTime Date { get; set; }
            public string Summary { get; set; }
            public string Body { get; set; }
            public int FormId { get; set; }
        }

        /// <summary>
        /// One article per form shape worth QA-ing on a real page. The form ids match the demo
        /// data the host seeds into MF_Forms on first run; an id that no longer exists renders
        /// the "form is not configured" notice rather than an error, which is itself a useful check.
        /// </summary>
        private static readonly ArticleSeed[] Articles =
        {
            new ArticleSeed
            {
                Name = "MegaForm 2.0.33 ships for Oqtane",
                Topic = "Release",
                Date = new DateTime(2026, 8, 12),
                Summary = "The Oqtane package is rebuilt with the four assemblies the marketplace build was missing, so a clean site boots instead of failing at start-up.",
                Body =
                    "<p>The 2.0.33 package restores four assemblies the earlier marketplace build left out. " +
                    "A site that installed the older package could not start at all: the module loaded, the type loader " +
                    "failed, and the host returned a bare server error that never mentioned MegaForm.</p>" +
                    "<h2>What to check after upgrading</h2>" +
                    "<ul><li>The package is around 14.6 MB. A 10.9 MB download is the broken build.</li>" +
                    "<li>Open any page with a form on it and submit once — a boot failure shows up there first.</li>" +
                    "<li>Existing forms, submissions and workflows are untouched by the upgrade.</li></ul>" +
                    "<p>Release notes go out by email on the day a build ships.</p>",
                FormId = 2
            },
            new ArticleSeed
            {
                Name = "Registration opens for the 2026 user conference",
                Topic = "Events",
                Date = new DateTime(2026, 8, 8),
                Summary = "Two days of sessions on form design, approvals and reporting. Seats are limited and the session picker closes when a track fills up.",
                Body =
                    "<p>The 2026 user conference runs over two days, with one track on building forms and one on what " +
                    "happens after a submission arrives: approvals, routing and reporting.</p>" +
                    "<h2>Programme</h2>" +
                    "<ul><li><strong>Day one</strong> — form design, conditional logic, multi-step layouts.</li>" +
                    "<li><strong>Day two</strong> — approval workflows, integrations, dashboards.</li></ul>" +
                    "<p>Registration below. Pick a track when you sign up; you can change it later from the confirmation email.</p>",
                FormId = 4
            },
            new ArticleSeed
            {
                Name = "Dropdowns that read from your own database",
                Topic = "Product",
                Date = new DateTime(2026, 8, 5),
                Summary = "A select can be filled from a SQL query instead of a hand-typed list, so the options stay correct without anyone editing the form.",
                Body =
                    "<p>Hand-typed option lists go stale the moment someone renames a department. A field can instead " +
                    "read its options from a query, so the list is whatever the database says today.</p>" +
                    "<h2>What the server does</h2>" +
                    "<p>The query is resolved on the server from the form's own schema — the browser never sends SQL. " +
                    "Results are capped server-side, so a lookup against a large table cannot pull the whole table into memory.</p>" +
                    "<p>The request form below reads both of its dropdowns from tables in this demo site.</p>",
                FormId = 201
            },
            new ArticleSeed
            {
                Name = "What we changed about file uploads",
                Topic = "Product",
                Date = new DateTime(2026, 7, 30),
                Summary = "Uploads are checked against an extension whitelist, stored outside the web root and served as attachments, so a document cannot become a script.",
                Body =
                    "<p>An upload field is the easiest way to hand a site something it should not run. Uploads are " +
                    "checked against a whitelist, the resolved path is verified rather than trusted, and files are " +
                    "served back as attachments with the sniffing header set.</p>" +
                    "<h2>For editors</h2>" +
                    "<ul><li>Allowed extensions are part of the field settings, not a global switch.</li>" +
                    "<li>Rejected files fail on the server too, not only in the browser.</li></ul>" +
                    "<p>Send a sample file through the form below to see the round trip.</p>",
                FormId = 6
            },
            new ArticleSeed
            {
                Name = "Long forms without the drop-off",
                Topic = "Practice",
                Date = new DateTime(2026, 7, 24),
                Summary = "Splitting a long form into steps keeps people going, as long as each step validates on its own and the back button does not lose what was typed.",
                Body =
                    "<p>A twenty-field page reads as work. The same twenty fields in three steps read as progress. " +
                    "What matters is that each step validates by itself and that moving back never clears an answer.</p>" +
                    "<h2>Rules of thumb</h2>" +
                    "<ul><li>Group by what the person is thinking about, not by which table the data lands in.</li>" +
                    "<li>Ask for contact details first — a partial submission is still worth something.</li>" +
                    "<li>Never validate a step the person has not reached yet.</li></ul>" +
                    "<p>The form below is two steps; use the buttons to move between them.</p>",
                FormId = 5
            },
            new ArticleSeed
            {
                Name = "Case study: an application intake that runs itself",
                Topic = "Case study",
                Date = new DateTime(2026, 7, 18),
                Summary = "A twelve-field application form with conditional sections, feeding an approval queue instead of an inbox.",
                Body =
                    "<p>A youth exchange programme replaced a mailbox full of attachments with one application form. " +
                    "Twelve fields, three sections, and a set of rules that hide the parts that do not apply.</p>" +
                    "<h2>What changed</h2>" +
                    "<ul><li>Applications arrive complete, because the form will not submit half-filled.</li>" +
                    "<li>Reviewers work from a queue with a status per application.</li>" +
                    "<li>Reporting comes from the submissions table rather than a spreadsheet.</li></ul>" +
                    "<p>The real application form is below — it is the largest form on this site, and the one worth " +
                    "watching on a phone.</p>",
                FormId = 102
            }
        };

        // ---------------------------------------------------------------- template razor

        private const string ListTemplateContent = @"@inherits Umbraco.Cms.Web.Common.Views.UmbracoViewPage
@{
    Layout = null;
    var intro = Model.Value<string>(""intro"");
    var formId = Model.Value<int?>(""megaFormPicker"") ?? 0;
    var articles = Model.Children.ToList();
}
<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""utf-8"" />
    <meta name=""viewport"" content=""width=device-width, initial-scale=1"" />
    <title>@Model.Name</title>
    <link rel=""stylesheet"" href=""/css/news-demo.css"" asp-append-version=""true"" />
</head>
<body class=""news-body"">
    <header class=""news-top"">
        <div class=""news-top-inner"">
            <a class=""news-brand"" href=""@Model.Url()"">MegaForm <span>Newsroom</span></a>
            <span class=""news-top-note"">Umbraco demo site · every article carries a live form</span>
        </div>
    </header>

    <div class=""news-shell"">
        <div class=""news-hero"">
            <p class=""news-kicker"">Newsroom</p>
            <h1>@Model.Name</h1>
            @if (!string.IsNullOrWhiteSpace(intro))
            {
                <p class=""news-lede"">@intro</p>
            }
        </div>

        @if (articles.Count == 0)
        {
            <p class=""news-empty"">No articles published yet.</p>
        }
        else
        {
            <ul class=""news-grid"">
                @foreach (var article in articles)
                {
                    var date = article.Value<DateTime?>(""articleDate"") ?? article.CreateDate;
                    var topic = article.Value<string>(""topic"");
                    var cardSummary = article.Value<string>(""summary"");
                    var articleFormId = article.Value<int?>(""megaFormPicker"") ?? 0;
                    <li class=""news-card"">
                        @if (!string.IsNullOrWhiteSpace(topic))
                        {
                            <span class=""news-tag"">@topic</span>
                        }
                        <h2><a href=""@article.Url()"">@article.Name</a></h2>
                        @* A generic call in an implicit expression makes the Razor parser read
                           <string> as markup, so the value is hoisted into a variable above. *@
                        <p>@cardSummary</p>
                        <div class=""news-meta"">
                            <span>@date.ToString(""d MMMM yyyy"")</span>
                            @if (articleFormId > 0)
                            {
                                <span>Form #@articleFormId</span>
                            }
                        </div>
                        <a class=""news-card-cta"" href=""@article.Url()"">Read and fill in the form →</a>
                    </li>
                }
            </ul>
        }

        @if (formId > 0)
        {
            <section class=""news-form"">
                @* Không tiêu đề, không lời dẫn ở đây: mỗi template MegaForm đã mang
                   tiêu đề và lời dẫn trong chính bản thiết kế của nó. *@
                <megaform form-id=""@formId"" content-id=""@Model.Id"" view-type=""submit""></megaform>
            </section>
        }
    </div>
</body>
</html>";

        private const string ArticleTemplateContent = @"@inherits Umbraco.Cms.Web.Common.Views.UmbracoViewPage
@{
    Layout = null;
    var date = Model.Value<DateTime?>(""articleDate"") ?? Model.CreateDate;
    var topic = Model.Value<string>(""topic"");
    var summary = Model.Value<string>(""summary"");
    var body = Model.Value<string>(""body"");
    var formId = Model.Value<int?>(""megaFormPicker"") ?? 0;
    var parent = Model.Parent;
}
<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""utf-8"" />
    <meta name=""viewport"" content=""width=device-width, initial-scale=1"" />
    <title>@Model.Name</title>
    <link rel=""stylesheet"" href=""/css/news-demo.css"" asp-append-version=""true"" />
</head>
<body class=""news-body"">
    <header class=""news-top"">
        <div class=""news-top-inner"">
            <a class=""news-brand"" href=""@(parent != null ? parent.Url() : ""/"")"">MegaForm <span>Newsroom</span></a>
            <span class=""news-top-note"">Umbraco demo site · every article carries a live form</span>
        </div>
    </header>

    <div class=""news-shell news-article"">
        @if (parent != null)
        {
            <a class=""news-back"" href=""@parent.Url()"">← All stories</a>
        }

        <p class=""news-kicker"">@(string.IsNullOrWhiteSpace(topic) ? ""News"" : topic) · @date.ToString(""d MMMM yyyy"")</p>
        <h1>@Model.Name</h1>
        @if (!string.IsNullOrWhiteSpace(summary))
        {
            <p class=""news-lede"">@summary</p>
        }

        <article class=""news-copy"">
            @Html.Raw(body)
        </article>

        @if (formId > 0)
        {
            <section class=""news-form"">
                @* Không tiêu đề, không lời dẫn ở đây: mỗi template MegaForm đã mang
                   tiêu đề và lời dẫn trong chính bản thiết kế của nó. *@
                <megaform form-id=""@formId"" content-id=""@Model.Id"" view-type=""submit""></megaform>
            </section>
        }
        else
        {
            <p class=""news-empty"">This article has no MegaForm selected. Pick one in the Form tab of the content node.</p>
        }
    </div>
</body>
</html>";
    }
}
