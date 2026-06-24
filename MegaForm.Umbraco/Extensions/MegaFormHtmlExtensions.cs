using System.Threading.Tasks;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Mvc.Rendering;
using MegaForm.Umbraco.ViewModels;

namespace MegaForm.Umbraco.Extensions
{
    public static class MegaFormHtmlExtensions
    {
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
    }
}
