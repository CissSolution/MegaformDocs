using System;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using Microsoft.AspNetCore.Razor.TagHelpers;

namespace MegaForm.Umbraco.TagHelpers
{
    /// <summary>
    /// Renders a MegaForm on an Umbraco content page.
    /// Usage:
    ///   &lt;megaform form-id="Model.Value&lt;int?&gt;("megaFormPicker")" content-id="Model.Id" view-type="submit" /&gt;
    ///   &lt;megaform form-name="Contact Us" content-id="Model.Id" view-type="submit" /&gt;
    /// </summary>
    [HtmlTargetElement("megaform", Attributes = "form-id")]
    [HtmlTargetElement("megaform", Attributes = "form-name")]
    public class MegaFormTagHelper : TagHelper
    {
        private readonly IViewComponentHelper _viewComponentHelper;
        private readonly IMegaFormClient _megaFormClient;
        private readonly IPlatformContext _platformContext;

        [ViewContext]
        public ViewContext ViewContext { get; set; }

        [HtmlAttributeName("form-id")]
        public int FormId { get; set; }

        [HtmlAttributeName("form-name")]
        public string FormName { get; set; }

        [HtmlAttributeName("content-id")]
        public int ContentId { get; set; }

        [HtmlAttributeName("view-type")]
        public string ViewType { get; set; } = "submit";

        public MegaFormTagHelper(IViewComponentHelper viewComponentHelper, IMegaFormClient megaFormClient = null, IPlatformContext platformContext = null)
        {
            _viewComponentHelper = viewComponentHelper;
            _megaFormClient = megaFormClient;
            _platformContext = platformContext;
        }

        public override async Task ProcessAsync(TagHelperContext context, TagHelperOutput output)
        {
            output.TagName = null;

            var formId = FormId;
            if (formId <= 0 && !string.IsNullOrWhiteSpace(FormName) && _megaFormClient != null)
            {
                var scope = new MegaFormScope { PortalId = _platformContext?.PortalId ?? 0 };
                var forms = await _megaFormClient.Forms.ListFormsAsync(
                    new FormQuery { Search = FormName, PageSize = 20 }, scope);
                var matched = forms.Items.FirstOrDefault(f =>
                    string.Equals(f.Title, FormName, StringComparison.OrdinalIgnoreCase));
                if (matched != null)
                    formId = matched.FormId;
            }

            if (formId <= 0)
            {
                output.Content.SetHtmlContent(new HtmlString("<p style=\"padding:1rem;color:#64748b;\">No MegaForm selected.</p>"));
                return;
            }

            if (_viewComponentHelper is IViewContextAware viewContextAware)
            {
                viewContextAware.Contextualize(ViewContext);
            }

            var htmlContent = await _viewComponentHelper.InvokeAsync(
                "RenderMegaForm",
                new { formId, contentId = ContentId, viewType = ViewType });

            output.Content.SetHtmlContent(htmlContent);
        }
    }
}
