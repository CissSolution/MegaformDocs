using System.Collections.Generic;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Xunit;
using MfOption = MegaForm.Core.Models.FieldOption;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// Golden-output tests for the server renderer. These intentionally assert stable HTML
    /// contracts rather than implementation details because the TypeScript hydrator binds
    /// directly to these classes/data attributes.
    /// </summary>
    public class FormHtmlRendererSnapshotTests
    {
        [Fact]
        public void Text_input_snapshot_is_stable()
        {
            var schema = Schema(Field("name", "Text", "Name", 1, required: true, placeholder: "Your name", height: "44"));

            var html = FormHtmlRenderer.RenderFieldsBody(schema, 77);

            Assert.Equal(
                "<div class=\"mf-field-group\" data-key=\"name\" data-type=\"Text\">" +
                "<label class=\"mf-field-label\" for=\"mf-77-name\">Name <span class=\"mf-required\">*</span></label>" +
                "<input type=\"text\" class=\"mf-input\" id=\"mf-77-name\" name=\"name\" value=\"\" placeholder=\"Your name\" required style=\"height:44px;min-height:44px;\">" +
                "<div class=\"mf-field-error\" id=\"mf-err-name\"></div></div>",
                html);
        }

        [Fact]
        public void Textarea_rows_and_height_snapshot_is_stable()
        {
            var field = Field("notes", "Textarea", "Notes", 1, required: true, placeholder: "Details", height: "128px");
            field.Rows = 4;

            var html = FormHtmlRenderer.RenderFieldsBody(Schema(field), 9);

            Assert.Equal(
                "<div class=\"mf-field-group\" data-key=\"notes\" data-type=\"Textarea\">" +
                "<label class=\"mf-field-label\" for=\"mf-9-notes\">Notes <span class=\"mf-required\">*</span></label>" +
                "<textarea class=\"mf-textarea\" id=\"mf-9-notes\" name=\"notes\" placeholder=\"Details\" required rows=\"4\" style=\"height:128px;min-height:128px;\"></textarea>" +
                "<div class=\"mf-field-error\" id=\"mf-err-notes\"></div></div>",
                html);
        }

        [Fact]
        public void MultiSelect_snapshot_is_native_and_hydratable()
        {
            var field = Field("colors", "MultiSelect", "Colors", 1, required: true, placeholder: "Choose colors");
            field.DefaultValue = "red,blue";
            field.Options = new List<MfOption>
            {
                new MfOption { Value = "red", Label = "Red" },
                new MfOption { Value = "blue", Label = "Blue" }
            };
            field.WidgetProps = new Dictionary<string, object>
            {
                ["searchable"] = false,
                ["maxTags"] = 2
            };

            var html = FormHtmlRenderer.RenderFieldsBody(Schema(field), 12);

            Assert.Contains("<label class=\"mf-field-label\" for=\"mf-12-colors\">Colors <span class=\"mf-required\">*</span></label>", html);
            Assert.Contains("class=\"mf-ms\"", html);
            Assert.Contains("data-mf-ms=\"1\"", html);
            Assert.Contains("data-max-tags=\"2\"", html);
            Assert.Contains("data-searchable=\"false\"", html);
            Assert.Contains("class=\"mf-ms-hidden\"", html);
            Assert.Contains("value=\"red,blue\"", html);
            Assert.DoesNotContain("data-mf-widget-hydrate", html);
            Assert.DoesNotContain("plugin not installed", html);
        }

        [Fact]
        public void Select_variants_snapshot_to_native_controls()
        {
            var multi = Field("tags", "Select", "Tags", 1);
            multi.WidgetProps = new Dictionary<string, object> { ["selectVariant"] = "multi-select" };
            multi.Options = Options();
            var columns = Field("person", "Select", "Person", 2);
            columns.Properties = new Dictionary<string, object> { ["variant"] = "multi-column" };
            columns.Options = Options();

            var html = FormHtmlRenderer.RenderFieldsBody(Schema(multi, columns), 18);

            Assert.Contains("id=\"mf-18-tags-ms\" data-mf-ms=\"1\"", html);
            Assert.Contains("id=\"mf-18-person-mccb\" data-mf-mccb=\"1\"", html);
            Assert.Contains("data-columns=", html);
            Assert.DoesNotContain("data-mf-widget-hydrate=\"Select\"", html);
        }

        [Fact]
        public void UniqueId_without_preview_snapshot_is_hidden_only()
        {
            var field = Field("reference", "UniqueId", "Reference", 1);

            var html = FormHtmlRenderer.RenderFieldsBody(Schema(field), 31);

            Assert.Equal("<input type=\"hidden\" name=\"reference\" id=\"mf-31-reference\" value=\"\">", html);
            Assert.DoesNotContain("mf-field-group", html);
            Assert.DoesNotContain("data-mf-widget-hydrate", html);
        }

        [Fact]
        public void UniqueId_preview_snapshot_matches_client_contract()
        {
            var field = Field("reference", "UniqueId", "Reference", 1);
            field.WidgetProps = new Dictionary<string, object>
            {
                ["showPreview"] = true,
                ["prefix"] = "MF-",
                ["padding"] = 4
            };

            var html = FormHtmlRenderer.RenderFieldsBody(Schema(field), 32);

            Assert.Contains("class=\"mf-uid-preview\"", html);
            Assert.Contains("MF-0001…", html);
            Assert.Contains("<input type=\"hidden\" name=\"reference\" id=\"mf-32-reference\" value=\"\">", html);
            Assert.DoesNotContain("data-mf-widget-hydrate", html);
        }

        [Fact]
        public void Native_catalog_and_aliases_do_not_enter_widget_fallback()
        {
            var schema = Schema(
                Field("time", "Time", "Time", 1),
                Field("chips", "Chips", "Chips", 2),
                Field("cards", "Cards", "Cards", 3),
                Field("upload", "FileUpload", "Upload", 4),
                Field("date", "DateTimePicker", "Date", 5),
                Field("multi", "MultiSelect", "Multi", 6),
                Field("uid", "UniqueId", "Reference", 7));
            schema.Fields[1].Options = Options();
            schema.Fields[2].Options = Options();

            var html = FormHtmlRenderer.RenderFieldsBody(schema, 22);

            Assert.False(FormHtmlRenderer.ContainsHydrationWidget(schema));
            Assert.Contains("<label class=\"mf-field-label\" for=\"mf-22-time\">Time</label>", html);
            Assert.Contains("<label class=\"mf-field-label\" for=\"mf-22-upload\">Upload</label>", html);
            Assert.Contains("<label class=\"mf-field-label\" for=\"mf-22-date\">Date</label>", html);
            Assert.DoesNotContain("data-mf-widget-hydrate", html);
        }

        [Fact]
        public void Widget_snapshot_keeps_placeholder_for_client_hydration()
        {
            var schema = Schema(Field("map", "Map", "Office location", 1));

            var html = FormHtmlRenderer.RenderFieldsBody(schema, 44);

            Assert.True(FormHtmlRenderer.ContainsHydrationWidget(schema));
            Assert.Contains("data-mf-widget-hydrate=\"Map\"", html);
            Assert.Contains("data-field-key=\"map\"", html);
        }

        [Fact]
        public void MultiStep_snapshot_has_server_pages_and_step_indicator()
        {
            var pageBreak = Field("page2", "Section", "Contact", 2);
            pageBreak.Properties = new Dictionary<string, object> { ["pageBreak"] = true };
            var schema = Schema(
                Field("name", "Text", "Name", 1),
                pageBreak,
                Field("email", "Email", "Email", 3));

            var body = FormHtmlRenderer.RenderFieldsBody(schema, 50);
            var steps = FormHtmlRenderer.RenderStepIndicator(schema, null);

            Assert.True(FormHtmlRenderer.IsStandardMultiStep(schema));
            Assert.Contains("id=\"mf-page-50-0\"", body);
            Assert.Contains("id=\"mf-page-50-1\" style=\"display:none;\"", body);
            Assert.Contains("class=\"mf-steps\"", steps);
            Assert.Contains("data-step=\"0\"", steps);
            Assert.Contains("data-step=\"1\"", steps);
        }

        [Fact]
        public void FlexGrid_snapshot_preserves_responsive_placement()
        {
            var field = Field("company", "Text", "Company", 1);
            field.Placement = new FlexPlacementSet
            {
                Lg = new FlexPlacement { X = 2, Y = 1, W = 8, H = 2 },
                Md = new FlexPlacement { X = 1, Y = 2, W = 10, H = 1 },
                Sm = new FlexPlacement { X = 0, Y = 3, W = 12, H = 1 }
            };
            var schema = Schema(field);
            schema.Settings.LayoutMode = "flexgrid";
            schema.Settings.GridConfig = new FlexGridConfig { Cols = 12, RowHeight = 64, Gap = 12 };

            var html = FormHtmlRenderer.RenderFieldsBody(schema, 60);

            Assert.Contains("class=\"mf-flexgrid\" data-mf-flexgrid=\"1\"", html);
            Assert.Contains("--lg-x:3;--lg-y:2;--lg-w:8;--lg-h:2;", html);
            Assert.Contains("--md-x:2;--md-y:3;--md-w:10;--md-h:1;", html);
            Assert.Contains("--sm-x:1;--sm-y:4;--sm-w:12;--sm-h:1;", html);
        }

        [Fact]
        public void CustomHtml_and_locale_snapshot_use_translated_projected_content()
        {
            var field = Field("name", "Text", "Name", 1, placeholder: "Your name");
            field.Translations = new Dictionary<string, FieldTranslation>
            {
                ["vi-VN"] = new FieldTranslation { Label = "Họ tên", Placeholder = "Nhập họ tên", HelpText = "Theo giấy tờ" }
            };
            var schema = Schema(field);
            schema.Settings.CustomHtml = "<section class=\"qa-shell\">{{field:name}}</section>";

            var html = FormHtmlRenderer.RenderFieldsBody(schema, 70, "vi-VN");

            Assert.Contains("<section class=\"qa-shell\">", html);
            Assert.Contains(">Họ tên</label>", html);
            Assert.Contains("placeholder=\"Nhập họ tên\"", html);
            Assert.Contains("<div class=\"mf-field-help\">Theo giấy tờ</div>", html);
            Assert.DoesNotContain("{{field:name}}", html);
        }

        private static FormSchema Schema(params FormField[] fields)
            => new FormSchema
            {
                Fields = new List<FormField>(fields),
                Settings = new MegaForm.Core.Models.FormSettings()
            };

        private static FormField Field(string key, string type, string label, int order,
            bool required = false, string placeholder = "", string height = null)
            => new FormField
            {
                Key = key,
                Type = type,
                Label = label,
                Order = order,
                Required = required,
                Placeholder = placeholder,
                Height = height
            };

        private static List<MfOption> Options()
            => new List<MfOption>
            {
                new MfOption { Value = "a", Label = "Alpha" },
                new MfOption { Value = "b", Label = "Beta" }
            };
    }
}
