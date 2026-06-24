using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using Microsoft.AspNetCore.Razor.TagHelpers;

namespace MegaForm.AspNetCore.Component;

[HtmlTargetElement("megaform", Attributes = "form-id")]
[HtmlTargetElement("mega-form", Attributes = "form-id")]
public sealed class MegaFormTagHelper : TagHelper
{
    [HtmlAttributeName("form-id")]
    public int FormId { get; set; }

    [HtmlAttributeName("mode")]
    public string Mode { get; set; } = nameof(MegaFormRenderMode.Embed);

    [HtmlAttributeName("container-id")]
    public string ContainerId { get; set; }

    [HtmlAttributeName("server-url")]
    public string ServerUrl { get; set; }

    [HtmlAttributeName("theme")]
    public string Theme { get; set; }

    [HtmlAttributeName("width")]
    public string Width { get; set; }

    [HtmlAttributeName("height")]
    public string Height { get; set; }

    [HtmlAttributeName("min-height")]
    public string MinHeight { get; set; }

    [HtmlAttributeName("radius")]
    public string Radius { get; set; }

    [HtmlAttributeName("frame-title")]
    public string FrameTitle { get; set; }

    [HtmlAttributeName("auto-resize")]
    public bool AutoResize { get; set; } = true;

    [HtmlAttributeName("link-text")]
    public string LinkText { get; set; }

    [HtmlAttributeName("loading")]
    public string Loading { get; set; }

    [HtmlAttributeName("class")]
    public string CssClass { get; set; }

    [ViewContext]
    [HtmlAttributeNotBound]
    public ViewContext ViewContext { get; set; }

    public override async Task ProcessAsync(TagHelperContext context, TagHelperOutput output)
    {
        var childContent = (await output.GetChildContentAsync()).GetContent().Trim();
        var options = new MegaFormRenderOptions
        {
            Mode = ParseMode(Mode),
            ContainerId = ContainerId,
            ServerUrl = ServerUrl,
            Theme = Theme,
            Width = Width,
            Height = Height,
            MinHeight = MinHeight,
            Radius = Radius,
            FrameTitle = FrameTitle,
            AutoResize = AutoResize,
            LinkText = string.IsNullOrWhiteSpace(LinkText) ? childContent : LinkText,
            Loading = Loading,
            CssClass = CssClass
        };

        output.TagName = null;
        output.Content.SetHtmlContent(MegaFormHostHtmlBuilder.Render(
            ViewContext?.HttpContext?.Request.PathBase ?? default,
            FormId,
            options));
    }

    private static MegaFormRenderMode ParseMode(string mode)
    {
        return Enum.TryParse<MegaFormRenderMode>(mode, ignoreCase: true, out var parsed)
            ? parsed
            : MegaFormRenderMode.Embed;
    }
}
