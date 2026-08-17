using System;
using System.Linq;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Strings;

namespace MegaForm.Umbraco.Host.Demo
{
    /// <summary>
    /// Seeds one page that renders a form built in the <em>Umbraco Forms</em> section, so the
    /// demo site shows both products side by side: the newsroom articles carry MegaForms, this
    /// page carries an Umbraco Form.
    ///
    /// It exists to answer "how do I put an Umbraco Form on a page?" with something runnable:
    /// a Document Type with a Form Picker property, a template that renders the picked form with
    /// the &lt;umb-forms-render&gt; tag helper, and a published node wired to both.
    ///
    /// Same caveat as <see cref="NewsDemoContentHandler"/>: this host has no Razor runtime
    /// compilation, so the template written on first run only renders after the next build.
    /// Views/umbFormsPage.cshtml is kept in source control for that reason and must stay in
    /// sync with <see cref="TemplateContent"/>.
    /// </summary>
    public class UmbracoFormsDemoContentHandler : INotificationHandler<UmbracoApplicationStartedNotification>
    {
        /// <summary>Bump the suffix to make an installed demo site re-seed.</summary>
        private const string SeedKey = "MegaForm_Umbraco_Host_UmbFormsDemo_v1";

        private const string TypeAlias = "umbFormsPage";

        /// <summary>The Umbraco Forms property editor behind every "Form Picker" data type.</summary>
        private const string FormPickerEditorAlias = "UmbracoForms.FormPicker";

        /// <summary>The single-form variant of the picker; the multi-form one returns a collection.</summary>
        private const string SingleFormPickerUiAlias = "Forms.PropertyEditorUi.FormPicker.Single";

        /// <summary>Present in the template; its absence means the row predates this seeder.</summary>
        private const string TemplateMarker = "umb-forms-render";

        private readonly IContentTypeService _contentTypeService;
        private readonly IContentService _contentService;
        private readonly IDataTypeService _dataTypeService;
        private readonly IFileService _fileService;
        private readonly IShortStringHelper _shortStringHelper;
        private readonly IKeyValueService _keyValueService;
        private readonly IRuntimeState _runtimeState;
        private readonly PropertyEditorCollection _propertyEditors;
        private readonly IConfigurationEditorJsonSerializer _configurationSerializer;
        private readonly IConfiguration _configuration;
        private readonly ILogger<UmbracoFormsDemoContentHandler> _logger;

        public UmbracoFormsDemoContentHandler(
            IContentTypeService contentTypeService,
            IContentService contentService,
            IDataTypeService dataTypeService,
            IFileService fileService,
            IShortStringHelper shortStringHelper,
            IKeyValueService keyValueService,
            IRuntimeState runtimeState,
            PropertyEditorCollection propertyEditors,
            IConfigurationEditorJsonSerializer configurationSerializer,
            IConfiguration configuration,
            ILogger<UmbracoFormsDemoContentHandler> logger)
        {
            _configuration = configuration;
            _contentTypeService = contentTypeService;
            _contentService = contentService;
            _dataTypeService = dataTypeService;
            _fileService = fileService;
            _shortStringHelper = shortStringHelper;
            _keyValueService = keyValueService;
            _runtimeState = runtimeState;
            _propertyEditors = propertyEditors;
            _configurationSerializer = configurationSerializer;
            _logger = logger;
        }

        public void Handle(UmbracoApplicationStartedNotification notification)
        {
            if (_runtimeState.Level < RuntimeLevel.Run)
                return;

            ITemplate template;

            try
            {
                // Checked on every start, ahead of the once-only gate: the template row can
                // survive a fresh clone while the .cshtml file does not, and that combination
                // 404s the page with a single warning in the log.
                template = EnsureTemplate();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm.Umbraco.Host] Failed to ensure the Umbraco Forms demo template.");
                return;
            }

            try
            {
                if (string.IsNullOrEmpty(_keyValueService.GetValue(SeedKey)))
                {
                    var contentType = EnsureContentType(template);
                    EnsurePage(contentType, template);
                    _keyValueService.SetValue(SeedKey, DateTime.UtcNow.ToString("O"));
                }

                TryPickConfiguredFormOnce();
            }
            catch (Exception ex)
            {
                // A failed demo seed must never stop the site from booting.
                _logger.LogError(ex, "[MegaForm.Umbraco.Host] Failed to seed the Umbraco Forms demo page.");
            }
        }

        private ITemplate EnsureTemplate()
        {
            var template = _fileService.GetTemplate(TypeAlias);
            if (template != null)
            {
                if (string.IsNullOrWhiteSpace(template.Content) || !template.Content.Contains(TemplateMarker))
                {
                    template.Content = TemplateContent;
                    _fileService.SaveTemplate(template);
                    _logger.LogInformation("[MegaForm.Umbraco.Host] Refreshed template '{Alias}'.", TypeAlias);
                }

                return template;
            }

            template = new Template(_shortStringHelper, "Umbraco Forms Page", TypeAlias) { Content = TemplateContent };
            _fileService.SaveTemplate(template);
            _logger.LogInformation("[MegaForm.Umbraco.Host] Created template '{Alias}'.", TypeAlias);
            return template;
        }

        private IContentType EnsureContentType(ITemplate template)
        {
            var existing = _contentTypeService.Get(TypeAlias);
            if (existing != null)
                return existing;

            var contentType = new ContentType(_shortStringHelper, -1)
            {
                Alias = TypeAlias,
                Name = "Umbraco Forms Page",
                Description = "A page that renders one form built in the Umbraco Forms section.",
                Icon = "icon-database",
                AllowedAsRoot = true
            };

            var tab = new PropertyGroup(new PropertyTypeCollection(contentType.SupportsPublishing))
            {
                Alias = "content",
                Name = "Content",
                Type = PropertyGroupType.Tab,
                SortOrder = 10
            };

            tab.PropertyTypes.Add(NewProperty(ResolveDataType("Umbraco.TextArea"), "intro", "Intro",
                "Lede paragraph above the form.", 10));
            tab.PropertyTypes.Add(NewProperty(ResolveFormPickerDataType(), "umbracoForm", "Umbraco Form",
                "The form built in the Forms section that this page renders.", 20));
            contentType.PropertyGroups.Add(tab);

            contentType.AllowedTemplates = new[] { template };
            contentType.SetDefaultTemplate(template);

            _contentTypeService.Save(contentType);
            _logger.LogInformation("[MegaForm.Umbraco.Host] Created Document Type '{Alias}'.", TypeAlias);
            return contentType;
        }

        private void EnsurePage(IContentType contentType, ITemplate template)
        {
            const string name = "Forms Demo";

            var existing = _contentService.GetPagedChildren(Constants.System.Root, 0, 200, out _, null)
                .FirstOrDefault(c => c.ContentType.Alias == TypeAlias);

            if (existing != null)
                return;

            var content = _contentService.Create(name, Constants.System.Root, TypeAlias, -1);
            content.SetValue("intro",
                "This page renders a form built in the Umbraco Forms section. Pick the form in the " +
                "\"Umbraco Form\" property and publish — the template renders whatever is picked.");
            content.TemplateId = template.Id;

            _contentService.SaveAndPublish(content, Array.Empty<string>(), -1);
            _logger.LogInformation("[MegaForm.Umbraco.Host] Created Umbraco Forms demo page (id={Id}).", content.Id);
        }

        /// <summary>
        /// Pre-pick a form on the demo page so it proves itself on first load, rather than
        /// showing the "no form picked yet" placeholder until someone opens the backoffice.
        /// The key comes from configuration (<c>MegaForm:DemoUmbracoFormKey</c>) because the
        /// forms on a demo site are made by hand — there is no meaningful default.
        /// Runs at most once and never overwrites a form an editor already chose.
        /// </summary>
        private void TryPickConfiguredFormOnce()
        {
            const string pickKey = SeedKey + "_Picked_v1";

            if (!string.IsNullOrEmpty(_keyValueService.GetValue(pickKey)))
                return;

            var configured = _configuration["MegaForm:DemoUmbracoFormKey"];
            if (string.IsNullOrWhiteSpace(configured) || !Guid.TryParse(configured, out var formKey))
                return;

            var page = _contentService.GetPagedChildren(Constants.System.Root, 0, 200, out _, null)
                .FirstOrDefault(c => c.ContentType.Alias == TypeAlias);

            if (page == null)
                return;

            if (!string.IsNullOrWhiteSpace(page.GetValue<string>("umbracoForm")))
            {
                _keyValueService.SetValue(pickKey, DateTime.UtcNow.ToString("O"));
                return;
            }

            page.SetValue("umbracoForm", formKey.ToString());
            _contentService.SaveAndPublish(page, Array.Empty<string>(), -1);
            _keyValueService.SetValue(pickKey, DateTime.UtcNow.ToString("O"));

            _logger.LogInformation("[MegaForm.Umbraco.Host] Demo page now renders Umbraco Form {Key}.", formKey);
        }

        private PropertyType NewProperty(IDataType dataType, string alias, string name, string description, int sortOrder)
        {
            return new PropertyType(_shortStringHelper, dataType)
            {
                Alias = alias,
                Name = name,
                Description = description,
                SortOrder = sortOrder
            };
        }

        /// <summary>
        /// Umbraco Forms registers the Form Picker <em>property editor</em> but does not seed a
        /// data type for it, so a fresh site has nothing to attach to a Document Type until
        /// someone creates one in Settings → Data Types. Create it here when it is missing, the
        /// same way MegaForm creates its own picker.
        ///
        /// If more than one exists, prefer the single-form variant: the multi-form picker stores
        /// a collection, which this page's template would have to unpack.
        /// </summary>
        private IDataType ResolveFormPickerDataType()
        {
            var candidates = _dataTypeService.GetAll()
                .Where(dt => dt != null && string.Equals(dt.EditorAlias, FormPickerEditorAlias, StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (candidates.Count > 0)
            {
                return candidates.FirstOrDefault(dt =>
                           string.Equals(dt.EditorUiAlias, SingleFormPickerUiAlias, StringComparison.OrdinalIgnoreCase))
                       ?? candidates[0];
            }

            if (!_propertyEditors.TryGet(FormPickerEditorAlias, out IDataEditor editor) || editor == null)
            {
                throw new InvalidOperationException(
                    $"Property editor '{FormPickerEditorAlias}' was not found. Is Umbraco Forms installed?");
            }

            var dataType = new DataType(editor, _configurationSerializer, -1)
            {
                Name = "Form Picker",
                DatabaseType = ValueTypes.ToStorageType(editor.GetValueEditor().ValueType),
                // Umbraco 14+ resolves the backoffice editor from the data type's own alias; a null
                // here renders "The configured property editor UI could not be found." instead of
                // the picker.
                EditorUiAlias = SingleFormPickerUiAlias
            };

            _dataTypeService.Save(dataType);
            _logger.LogInformation("[MegaForm.Umbraco.Host] Created Data Type 'Form Picker' (id={Id}).", dataType.Id);
            return dataType;
        }

        private IDataType ResolveDataType(string editorAlias)
        {
            var match = _dataTypeService.GetAll()
                .FirstOrDefault(dt => dt != null && string.Equals(dt.EditorAlias, editorAlias, StringComparison.OrdinalIgnoreCase));

            if (match == null)
                throw new InvalidOperationException($"No data type uses property editor '{editorAlias}'.");

            return match;
        }

        /// <summary>Must stay identical to Views/umbFormsPage.cshtml.</summary>
        private const string TemplateContent = @"@inherits Umbraco.Cms.Web.Common.Views.UmbracoViewPage
@{
    Layout = null;
    var intro = Model.Value<string>(""intro"");

    // The Umbraco Forms ""Form Picker"" stores the form's key. Read it as a Guid first and fall
    // back to parsing the raw string, so the page still renders if a future Forms version
    // changes what its value converter hands back.
    var formGuid = Model.Value<Guid?>(""umbracoForm"") ?? Guid.Empty;
    if (formGuid == Guid.Empty)
    {
        Guid.TryParse(Model.Value<string>(""umbracoForm""), out formGuid);
    }
}
<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""utf-8"" />
    <meta name=""viewport"" content=""width=device-width, initial-scale=1"" />
    <title>@Model.Name</title>
    <link rel=""stylesheet"" href=""/css/news-demo.css"" />
    <script src=""/App_Plugins/UmbracoForms/assets/aspnet-client-validation/dist/aspnet-validation.min.js""></script>
</head>
<body class=""news-body"">
    <header class=""news-top"">
        <div class=""news-top-inner"">
            <a class=""news-brand"" href=""/"">MegaForm <span>Newsroom</span></a>
            <span class=""news-top-note"">Umbraco Forms demo page</span>
        </div>
    </header>

    <div class=""news-shell news-article"">
        <h1>@Model.Name</h1>
        @if (!string.IsNullOrWhiteSpace(intro))
        {
            <p class=""news-lede"">@intro</p>
        }

        <div class=""news-form-card"">
            @if (formGuid != Guid.Empty)
            {
                <umb-forms-render form-id=""@formGuid"" />
            }
            else
            {
                <p>No form picked yet. Open this page in the backoffice, choose one in the
                    <strong>Umbraco Form</strong> property, and publish.</p>
            }
        </div>
    </div>
</body>
</html>
";
    }
}
