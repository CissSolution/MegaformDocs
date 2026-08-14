using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Strings;

namespace MegaForm.Umbraco.Migrations
{
    /// <summary>
    /// One-time package migration that creates a sample Data Type using the
    /// MegaForm Form Picker and a sample Document Type that uses it.
    /// Runs when the Umbraco application starts (after install/upgrade).
    /// </summary>
    public class MegaFormSampleContentMigrationHandler : INotificationHandler<UmbracoApplicationStartedNotification>
    {
        private const string MigrationKey = "MegaForm_Umbraco_SampleContentMigrated_v2";

        private readonly IDataTypeService _dataTypeService;
        private readonly IContentTypeService _contentTypeService;
        private readonly PropertyEditorCollection _propertyEditors;
        private readonly IConfigurationEditorJsonSerializer _configurationSerializer;
        private readonly IShortStringHelper _shortStringHelper;
        private readonly IKeyValueService _keyValueService;
        private readonly IRuntimeState _runtimeState;
        private readonly IFormRepository _formRepo;
        private readonly IContentService _contentService;
        private readonly ILogger<MegaFormSampleContentMigrationHandler> _logger;

        public MegaFormSampleContentMigrationHandler(
            IDataTypeService dataTypeService,
            IContentTypeService contentTypeService,
            PropertyEditorCollection propertyEditors,
            IConfigurationEditorJsonSerializer configurationSerializer,
            IShortStringHelper shortStringHelper,
            IKeyValueService keyValueService,
            IRuntimeState runtimeState,
            IFormRepository formRepo,
            IContentService contentService,
            ILogger<MegaFormSampleContentMigrationHandler> logger)
        {
            _dataTypeService = dataTypeService;
            _contentTypeService = contentTypeService;
            _propertyEditors = propertyEditors;
            _configurationSerializer = configurationSerializer;
            _shortStringHelper = shortStringHelper;
            _keyValueService = keyValueService;
            _runtimeState = runtimeState;
            _formRepo = formRepo;
            _contentService = contentService;
            _logger = logger;
        }

        public void Handle(UmbracoApplicationStartedNotification notification)
        {
            if (_runtimeState.Level < RuntimeLevel.Run)
                return;

            var alreadyMigrated = _keyValueService.GetValue(MigrationKey);
            if (!string.IsNullOrEmpty(alreadyMigrated))
                return;

            try
            {
                var dataType = EnsureMegaFormPickerDataType();
                EnsureMegaFormPageDocumentType(dataType);
                var contactForm = EnsureSampleContactForm();
                EnsureSampleContentPage(contactForm);

                _keyValueService.SetValue(MigrationKey, DateTime.UtcNow.ToString("O"));
                _logger.LogInformation("[MegaForm.Umbraco] Sample Data Type, Document Type, form and content page created successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm.Umbraco] Failed to create sample content.");
            }
        }

        private IDataType EnsureMegaFormPickerDataType()
        {
            const string dataTypeName = "MegaForm Picker";
            const string editorAlias = "MegaForm.FormPicker";

            var existing = _dataTypeService.GetAll()
                .FirstOrDefault(dt => dt.Name == dataTypeName || dt.EditorAlias == editorAlias);

            if (existing != null)
                return existing;

            if (!_propertyEditors.TryGet(editorAlias, out IDataEditor editor) || editor == null)
                throw new InvalidOperationException($"Property editor '{editorAlias}' was not found.");

            var valueEditor = editor.GetValueEditor();
            var databaseType = ValueTypes.ToStorageType(valueEditor.ValueType);

            var dataType = new DataType(editor, _configurationSerializer, -1)
            {
                Name = dataTypeName,
                DatabaseType = databaseType
            };

            _dataTypeService.Save(dataType);
            _logger.LogInformation("[MegaForm.Umbraco] Created Data Type '{DataTypeName}' (id={DataTypeId}).", dataTypeName, dataType.Id);
            return dataType;
        }

        private void EnsureMegaFormPageDocumentType(IDataType megaFormPickerDataType)
        {
            const string alias = "megaFormPage";
            const string name = "MegaForm Page";

            var existing = _contentTypeService.Get(alias);
            if (existing != null)
                return;

            var contentType = new ContentType(_shortStringHelper, -1)
            {
                Alias = alias,
                Name = name,
                Icon = "icon-umb-contour",
                AllowedAsRoot = true
            };

            var contentTab = new PropertyGroup(new PropertyTypeCollection(contentType.SupportsPublishing))
            {
                Alias = "content",
                Name = "Content",
                Type = PropertyGroupType.Tab,
                SortOrder = 10
            };

            contentTab.PropertyTypes.Add(new PropertyType(_shortStringHelper, megaFormPickerDataType)
            {
                Alias = "megaFormPicker",
                Name = "MegaForm",
                Description = "Select a MegaForm to display on this page.",
                SortOrder = 10
            });

            contentType.PropertyGroups.Add(contentTab);

            _contentTypeService.Save(contentType);
            _logger.LogInformation("[MegaForm.Umbraco] Created Document Type '{DocumentTypeName}' (alias={Alias}).", name, alias);
        }

        private FormInfo EnsureSampleContactForm()
        {
            const string title = "Contact Us";
            var existing = _formRepo.ListForms(-1)
                .FirstOrDefault(f => string.Equals(f.Title, title, StringComparison.OrdinalIgnoreCase));

            if (existing != null)
                return existing;

            var schema = new
            {
                fields = new[]
                {
                    new { key = "name", type = "Text", label = "Name", required = true },
                    new { key = "email", type = "Email", label = "Email", required = true },
                    new { key = "message", type = "LongText", label = "Message", required = true }
                },
                settings = new { multiPage = false, defaultLanguage = "en-US" }
            };

            var form = new FormInfo
            {
                Title = title,
                Description = "Sample contact form created by MegaForm.",
                Status = "Published",
                SchemaJson = System.Text.Json.JsonSerializer.Serialize(schema),
                SettingsJson = "{}",
                ThemeJson = "{}",
                RulesJson = "[]",
                SubmitButtonText = "Send",
                SuccessMessage = "Thank you! We will be in touch soon.",
                EnableCaptcha = false,
                RequireAuth = false,
                PortalId = -1,
                ModuleId = -1,
                CreatedByUserId = -1,
                UpdatedByUserId = -1,
                CreatedOnUtc = DateTime.UtcNow,
                UpdatedOnUtc = DateTime.UtcNow
            };

            int formId = _formRepo.SaveForm(form);
            _logger.LogInformation("[MegaForm.Umbraco] Created sample form '{Title}' (id={FormId}).", title, formId);
            return _formRepo.GetForm(formId) ?? form;
        }

        private void EnsureSampleContentPage(FormInfo contactForm)
        {
            const string contentName = "Contact Us";
            const string alias = "megaFormPage";

            var existing = _contentService.GetPagedChildren(-1, 0, 50, out long total, null)
                .FirstOrDefault(c => c.ContentType.Alias == alias && c.Name == contentName);

            if (existing != null)
                return;

            var content = _contentService.Create(contentName, -1, alias, -1);
            content.SetValue("megaFormPicker", contactForm.FormId.ToString());
            _contentService.SaveAndPublish(content, "*", -1);
            _logger.LogInformation("[MegaForm.Umbraco] Created sample content page '{ContentName}' (id={ContentId}) using MegaForm '{FormTitle}'.", contentName, content.Id, contactForm.Title);
        }
    }
}
