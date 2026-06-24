using System.Threading.Tasks;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Mvc.Rendering;

namespace MegaForm.AspNetCore.Component;

public static class MegaFormHtmlHelperExtensions
{
    public static Task<IHtmlContent> MegaFormAsync(this IHtmlHelper htmlHelper, int formId, MegaFormRenderOptions options = null)
    {
        return Task.FromResult(MegaForm(htmlHelper, formId, options));
    }

    public static IHtmlContent MegaForm(this IHtmlHelper htmlHelper, int formId, MegaFormRenderOptions options = null)
    {
        var pathBase = htmlHelper?.ViewContext?.HttpContext?.Request.PathBase ?? default;
        return MegaFormHostHtmlBuilder.Render(pathBase, formId, options);
    }

    public static string MegaFormUrl(this IHtmlHelper htmlHelper, int formId, bool embedMode = false, string theme = null, string serverUrl = null)
    {
        var pathBase = htmlHelper?.ViewContext?.HttpContext?.Request.PathBase ?? default;
        return MegaFormHostHtmlBuilder.BuildPublicFormUrl(pathBase, formId, embedMode, theme, serverUrl);
    }
}
