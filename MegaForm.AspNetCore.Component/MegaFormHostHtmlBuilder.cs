using System;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Rendering;

namespace MegaForm.AspNetCore.Component;

internal static class MegaFormHostHtmlBuilder
{
    public static IHtmlContent Render(PathString pathBase, int formId, MegaFormRenderOptions options)
    {
        if (formId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(formId), "MegaForm render helpers require a positive form id.");
        }

        options ??= new MegaFormRenderOptions();

        return options.Mode switch
        {
            MegaFormRenderMode.Link => RenderLink(pathBase, formId, options),
            MegaFormRenderMode.Iframe => RenderIframe(pathBase, formId, options),
            _ => RenderEmbed(pathBase, formId, options)
        };
    }

    public static string BuildPublicFormUrl(PathString pathBase, int formId, bool embedMode = false, string theme = null, string serverUrl = null)
    {
        var path = embedMode ? $"/f/{formId}/embed" : $"/f/{formId}";
        var url = CombineRoot(serverUrl, BuildLocalUrl(pathBase, path));

        if (string.IsNullOrWhiteSpace(theme))
        {
            return url;
        }

        return url.Contains("?", StringComparison.Ordinal)
            ? $"{url}&theme={Uri.EscapeDataString(theme)}"
            : $"{url}?theme={Uri.EscapeDataString(theme)}";
    }

    private static IHtmlContent RenderEmbed(PathString pathBase, int formId, MegaFormRenderOptions options)
    {
        var containerId = string.IsNullOrWhiteSpace(options.ContainerId)
            ? $"megaform-{formId}-{Guid.NewGuid():N}"
            : options.ContainerId.Trim();

        var container = new TagBuilder("div");
        container.Attributes["id"] = containerId;
        container.AddCssClass("megaform-host");
        AddCssClass(container, options.CssClass);

        var script = new TagBuilder("script");
        script.Attributes["src"] = BuildEmbedScriptUrl(pathBase, options.ServerUrl);
        script.Attributes["data-form-id"] = formId.ToString();
        script.Attributes["data-container"] = "#" + containerId;

        if (!string.IsNullOrWhiteSpace(options.ServerUrl))
        {
            script.Attributes["data-server"] = options.ServerUrl.Trim();
        }

        AddOptionalAttribute(script, "data-theme", options.Theme);
        AddOptionalAttribute(script, "data-width", options.Width);
        AddOptionalAttribute(script, "data-height", options.Height);
        AddOptionalAttribute(script, "data-min-height", options.MinHeight);
        AddOptionalAttribute(script, "data-radius", options.Radius);
        AddOptionalAttribute(script, "data-frame-title", options.FrameTitle ?? $"MegaForm {formId}");

        if (!options.AutoResize)
        {
            script.Attributes["data-auto-resize"] = "false";
        }

        var content = new HtmlContentBuilder();
        content.AppendHtml(container);
        content.AppendHtml(Environment.NewLine);
        content.AppendHtml(script);
        return content;
    }

    private static IHtmlContent RenderIframe(PathString pathBase, int formId, MegaFormRenderOptions options)
    {
        var iframe = new TagBuilder("iframe");
        iframe.Attributes["src"] = BuildPublicFormUrl(pathBase, formId, embedMode: true, theme: options.Theme, serverUrl: options.ServerUrl);
        iframe.Attributes["title"] = options.FrameTitle ?? $"MegaForm {formId}";
        iframe.Attributes["loading"] = string.IsNullOrWhiteSpace(options.Loading) ? "lazy" : options.Loading.Trim();
        iframe.Attributes["frameborder"] = "0";
        iframe.Attributes["scrolling"] = options.AutoResize ? "no" : "auto";

        var style = $"width: {NormalizeCssSize(options.Width, "100%")}; min-height: {NormalizeCssSize(options.MinHeight, "640px")}; border: 0; background: transparent;";
        if (!string.IsNullOrWhiteSpace(options.Height))
        {
            style += $" height: {NormalizeCssSize(options.Height, options.Height)};";
        }
        if (!string.IsNullOrWhiteSpace(options.Radius))
        {
            style += $" border-radius: {NormalizeCssSize(options.Radius, options.Radius)};";
        }

        iframe.Attributes["style"] = style;
        iframe.AddCssClass("megaform-host-frame");
        AddCssClass(iframe, options.CssClass);

        return iframe;
    }

    private static IHtmlContent RenderLink(PathString pathBase, int formId, MegaFormRenderOptions options)
    {
        var anchor = new TagBuilder("a");
        anchor.Attributes["href"] = BuildPublicFormUrl(pathBase, formId, embedMode: false, theme: options.Theme, serverUrl: options.ServerUrl);
        anchor.AddCssClass("megaform-host-link");
        AddCssClass(anchor, options.CssClass);
        anchor.InnerHtml.Append(string.IsNullOrWhiteSpace(options.LinkText) ? $"Open form #{formId}" : options.LinkText.Trim());
        return anchor;
    }

    private static string BuildEmbedScriptUrl(PathString pathBase, string serverUrl)
    {
        return CombineRoot(serverUrl, BuildLocalUrl(pathBase, "/megaform/js/megaform-embed.js"));
    }

    private static string BuildLocalUrl(PathString pathBase, string relativePath)
    {
        var baseValue = pathBase.HasValue ? pathBase.Value!.TrimEnd('/') : string.Empty;
        return string.IsNullOrWhiteSpace(baseValue) ? relativePath : baseValue + relativePath;
    }

    private static string CombineRoot(string root, string localPath)
    {
        if (string.IsNullOrWhiteSpace(root))
        {
            return localPath;
        }

        return $"{root.TrimEnd('/')}/{localPath.TrimStart('/')}";
    }

    private static void AddOptionalAttribute(TagBuilder tag, string name, string value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            tag.Attributes[name] = value.Trim();
        }
    }

    private static void AddCssClass(TagBuilder tag, string cssClass)
    {
        if (!string.IsNullOrWhiteSpace(cssClass))
        {
            tag.AddCssClass(cssClass.Trim());
        }
    }

    private static string NormalizeCssSize(string value, string fallback)
    {
        var candidate = string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return fallback;
        }

        if (int.TryParse(candidate, out _))
        {
            return candidate + "px";
        }

        return candidate.TrimEnd(';');
    }
}
