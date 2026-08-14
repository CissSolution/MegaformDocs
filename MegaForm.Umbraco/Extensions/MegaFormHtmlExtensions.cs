using System;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Sdk;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.Extensions.DependencyInjection;
using MegaForm.Core.Interfaces;
using MegaForm.Umbraco.ViewModels;

namespace MegaForm.Umbraco.Extensions
{
    public static class MegaFormHtmlExtensions
    {
        /// <summary>
        /// Renders a MegaForm selected on the current content node (via the megaFormPicker property).
        /// </summary>
        public static Task<IHtmlContent> MegaFormAsync(this IHtmlHelper html, int contentId, int formId = 0, string viewType = null, bool isAdmin = false, string configJson = null)
        {
            var model = new MegaFormViewModel
            {
                ContentId = contentId,
                FormId = formId,
                ViewType = viewType,
                IsAdmin = isAdmin,
                ConfigJson = configJson
            };

            return html.PartialAsync("~/Views/Partials/MegaForm/MegaForm.cshtml", model);
        }

        /// <summary>
        /// Renders a MegaForm by its exact title. Useful for simple contact forms that are not
        /// modelled as a content property (UFormKit/ContactForm7-style usage).
        /// </summary>
        public static async Task<IHtmlContent> MegaFormByNameAsync(this IHtmlHelper html, string formName, int contentId = 0, string viewType = null, bool isAdmin = false, string configJson = null)
        {
            if (string.IsNullOrWhiteSpace(formName))
                return new HtmlString("<p style=\"padding:1rem;color:#64748b;\">No MegaForm name specified.</p>");

            var services = html.ViewContext?.HttpContext?.RequestServices;
            if (services == null)
                return new HtmlString("<p style=\"padding:1rem;color:#dc2626;\">Unable to resolve MegaForm services.</p>");

            var client = services.GetService<IMegaFormClient>();
            if (client == null)
                return new HtmlString("<p style=\"padding:1rem;color:#dc2626;\">MegaForm SDK is not registered.</p>");

            var platform = services.GetService<IPlatformContext>();
            var scope = new MegaFormScope { PortalId = platform?.PortalId ?? 0 };

            var forms = await client.Forms.ListFormsAsync(
                new FormQuery { Search = formName, PageSize = 20 }, scope);

            var form = forms.Items.FirstOrDefault(f =>
                string.Equals(f.Title, formName, StringComparison.OrdinalIgnoreCase));

            if (form == null)
                return new HtmlString($"<p style=\"padding:1rem;color:#dc2626;\">Form '{formName}' was not found.</p>");

            return await html.PartialAsync("~/Views/Partials/MegaForm/MegaForm.cshtml", new MegaFormViewModel
            {
                ContentId = contentId,
                FormId = form.FormId,
                ViewType = viewType,
                IsAdmin = isAdmin,
                ConfigJson = configJson
            });
        }
    }
}
