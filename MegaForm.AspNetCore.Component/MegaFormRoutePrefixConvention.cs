using System;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Mvc.ApplicationModels;

namespace MegaForm.AspNetCore.Component
{
    /// <summary>
    /// MVC convention that rewrites the default MegaForm attribute route prefixes
    /// to the values configured in <see cref="MegaFormOptions"/>.
    /// </summary>
    internal sealed class MegaFormRoutePrefixConvention : IApplicationModelConvention
    {
        private readonly IMegaFormRouteOptions _options;

        public MegaFormRoutePrefixConvention(IMegaFormRouteOptions options)
        {
            _options = options ?? throw new ArgumentNullException(nameof(options));
        }

        public void Apply(ApplicationModel application)
        {
            foreach (var controller in application.Controllers)
            {
                RewriteSelectors(controller.Selectors);

                foreach (var action in controller.Actions)
                {
                    RewriteSelectors(action.Selectors);
                }
            }
        }

        private void RewriteSelectors(System.Collections.Generic.IList<SelectorModel> selectors)
        {
            foreach (var selector in selectors)
            {
                if (selector.AttributeRouteModel?.Template is string template)
                {
                    selector.AttributeRouteModel.Template = Rewrite(template);
                }
            }
        }

        private string Rewrite(string template)
        {
            // API prefixes first — longer ones before shorter ones to avoid partial replacements.
            template = ReplacePrefix(template, "api/MegaFormPopup", Normalize(_options.PopupApiRoutePrefix));
            template = ReplacePrefix(template, "api/MegaFormAi", Normalize(_options.AiApiRoutePrefix));
            template = ReplacePrefix(template, "api/MegaForm", Normalize(_options.ApiRoutePrefix));

            // UI prefixes.
            template = ReplacePrefix(template, "admin", Normalize(_options.AdminRoutePrefix));
            template = ReplacePrefix(template, "setup", Normalize(_options.SetupRoutePrefix));
            template = ReplacePrefix(template, "documents", Normalize(_options.DocumentsRoutePrefix));
            template = ReplacePrefix(template, "f", Normalize(_options.FormRoutePrefix));

            return template;
        }

        private static string Normalize(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return value;

            value = value.Trim();
            if (value.StartsWith("/"))
                value = value.Substring(1);
            return value;
        }

        private static string ReplacePrefix(string template, string defaultPrefix, string configuredPrefix)
        {
            if (string.IsNullOrEmpty(configuredPrefix) || configuredPrefix == defaultPrefix)
                return template;

            // Absolute template: "/f/{id}" -> "/forms/{id}"
            if (template.StartsWith("/" + defaultPrefix + "/") || template == "/" + defaultPrefix)
            {
                return "/" + configuredPrefix + template.Substring(("/" + defaultPrefix).Length);
            }

            // Relative template: "f/{id}" -> "forms/{id}"
            if (template.StartsWith(defaultPrefix + "/") || template == defaultPrefix)
            {
                return configuredPrefix + template.Substring(defaultPrefix.Length);
            }

            return template;
        }
    }
}
