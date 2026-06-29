using System;
using System.Collections.Generic;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Rendering
{
    /// <summary>
    /// Single source of truth for render-time schema/settings normalization.
    /// Web / DNN / Oqtane should call this resolver and stop duplicating host-side merge logic.
    /// </summary>
    public static class RenderModelResolver
    {
        public const string Badge = ResolvedRenderModel.ResolverBadge;

        private static readonly string[] LegacySettingKeys = new[]
        {
            "customHtml", "CustomHtml",
            "customCss", "CustomCss",
            "customContent", "CustomContent",
            "customScripts", "CustomScripts",
            "theme", "Theme",
            "themeCssOverrides", "ThemeCssOverrides",
            "honeypotFieldName", "HoneypotFieldName",
            "postSubmitExperience", "PostSubmitExperience",
            "submitButtonText", "SubmitButtonText",
            "defaultLanguage", "DefaultLanguage",
            "supportedLanguages", "SupportedLanguages",
            "previousButtonText", "PreviousButtonText",
            "nextButtonText", "NextButtonText",
            "printSettings", "PrintSettings",
            "productionMode", "ProductionMode",
            "trialFooterText", "TrialFooterText"
        };

        public static ResolvedRenderModel Resolve(string schemaJson, string settingsJson)
        {
            return Resolve(schemaJson, settingsJson, null, null, null);
        }

        public static ResolvedRenderModel Resolve(string schemaJson, string settingsJson, string submitButtonText, string successMessage, string redirectUrl)
        {
            var resolvedSchemaJson = ResolveSchemaJson(schemaJson, settingsJson, submitButtonText, successMessage, redirectUrl);
            FormSchema schema;
            try
            {
                schema = JsonConvert.DeserializeObject<FormSchema>(resolvedSchemaJson) ?? new FormSchema();
            }
            catch
            {
                schema = new FormSchema();
            }

            var settings = schema.Settings ?? new FormSettings();
            var canonicalPostSubmit = settings.PostSubmitExperience ?? new PostSubmitExperience();
            var canonicalSubmit = !string.IsNullOrWhiteSpace(settings.SubmitButtonText) ? settings.SubmitButtonText : "Submit";
            var canonicalMessage = !string.IsNullOrWhiteSpace(canonicalPostSubmit.Message)
                ? canonicalPostSubmit.Message
                : "Thank you. We have received your submission.";
            var canonicalRedirect = canonicalPostSubmit.RedirectUrl ?? string.Empty;

            return new ResolvedRenderModel
            {
                Badge = Badge,
                SchemaJson = resolvedSchemaJson,
                SettingsJson = JsonConvert.SerializeObject(settings, Formatting.None),
                SubmitButtonText = canonicalSubmit,
                SuccessMessage = canonicalMessage,
                RedirectUrl = canonicalRedirect,
                PostSubmitExperience = canonicalPostSubmit,
                Schema = schema
            };
        }

        public static FormSchema ResolveSchema(string schemaJson, string settingsJson)
        {
            return Resolve(schemaJson, settingsJson).Schema;
        }

        public static FormSchema ResolveSchema(string schemaJson, string settingsJson, string submitButtonText, string successMessage, string redirectUrl)
        {
            return Resolve(schemaJson, settingsJson, submitButtonText, successMessage, redirectUrl).Schema;
        }

        public static string ResolveSchemaJson(string schemaJson, string settingsJson)
        {
            return ResolveSchemaJson(schemaJson, settingsJson, null, null, null);
        }

        public static string ResolveSchemaJson(string schemaJson, string settingsJson, string submitButtonText, string successMessage, string redirectUrl)
        {
            if (string.IsNullOrWhiteSpace(schemaJson)) return schemaJson ?? "{}";
            try
            {
                var schema = JObject.Parse(schemaJson);
                var settings = GetOrCreateSettings(schema);

                PromoteLegacyRootSettings(schema, settings);
                OverlaySavedSettings(settings, settingsJson);
                CanonicalizeSubmitButtonText(settings, submitButtonText);
                CanonicalizePostSubmitExperience(settings, successMessage, redirectUrl);
                CanonicalizeTrialMode(settings);
                MirrorCommonAliases(settings);
                PromoteTopLevelFormActionValues(schema, settings);

                schema["settings"] = settings;
                schema["Settings"] = settings.DeepClone();
                return schema.ToString(Formatting.None);
            }
            catch
            {
                return schemaJson;
            }
        }

        private static JObject GetOrCreateSettings(JObject schema)
        {
            var settings = schema["settings"] as JObject;
            if (settings != null) return settings;

            var pascal = schema["Settings"] as JObject;
            if (pascal != null)
            {
                settings = (JObject)pascal.DeepClone();
                schema["settings"] = settings;
                return settings;
            }

            settings = new JObject();
            schema["settings"] = settings;
            return settings;
        }

        private static void PromoteLegacyRootSettings(JObject schema, JObject settings)
        {
            foreach (var key in LegacySettingKeys)
            {
                var token = schema[key];
                if (token == null) continue;
                if (settings[key] == null) settings[key] = token.DeepClone();
            }
        }

        private static void OverlaySavedSettings(JObject settings, string settingsJson)
        {
            if (string.IsNullOrWhiteSpace(settingsJson)) return;

            JObject saved;
            try
            {
                saved = JObject.Parse(settingsJson);
            }
            catch
            {
                return;
            }

            foreach (var prop in saved.Properties())
            {
                settings[prop.Name] = prop.Value != null ? prop.Value.DeepClone() : JValue.CreateNull();
            }
        }

        private static void CanonicalizeSubmitButtonText(JObject settings, string submitButtonText)
        {
            var preferred = FirstUsable(settings["submitButtonText"], settings["SubmitButtonText"], submitButtonText);
            if (string.IsNullOrWhiteSpace(preferred)) preferred = "Submit";
            settings["submitButtonText"] = preferred;
            settings["SubmitButtonText"] = preferred;
        }

        private static void CanonicalizePostSubmitExperience(JObject settings, string successMessage, string redirectUrl)
        {
            var postSubmit = settings["postSubmitExperience"] as JObject
                ?? settings["PostSubmitExperience"] as JObject
                ?? new JObject();

            var mode = FirstUsable(postSubmit["mode"], postSubmit["Mode"], null);
            var message = FirstUsable(postSubmit["message"], postSubmit["Message"], settings["successMessage"], settings["SuccessMessage"], successMessage);
            var title = FirstUsable(postSubmit["title"], postSubmit["Title"], null);
            var resolvedRedirectUrl = FirstUsable(postSubmit["redirectUrl"], postSubmit["RedirectUrl"], settings["redirectUrl"], settings["RedirectUrl"], redirectUrl);

            if (string.IsNullOrWhiteSpace(mode))
                mode = !string.IsNullOrWhiteSpace(resolvedRedirectUrl) ? "redirect-immediate" : "rich";
            if (string.IsNullOrWhiteSpace(title))
                title = "Submission received";
            if (string.IsNullOrWhiteSpace(message))
                message = "Thank you. We have received your submission.";

            postSubmit["enabled"] = FirstUsableBool(postSubmit["enabled"], postSubmit["Enabled"], true);
            postSubmit["Enabled"] = (bool)postSubmit["enabled"];
            postSubmit["mode"] = mode;
            postSubmit["Mode"] = mode;
            postSubmit["title"] = title;
            postSubmit["Title"] = title;
            postSubmit["message"] = message;
            postSubmit["Message"] = message;
            postSubmit["redirectUrl"] = resolvedRedirectUrl ?? string.Empty;
            postSubmit["RedirectUrl"] = resolvedRedirectUrl ?? string.Empty;

            // [buttons-doubling-fix 20260629] Sanitize the buttons array: drop empty buttons
            // (no label AND no url) and hard-cap the count. Self-heals any form already bloated by
            // the historical doubling bug (buttons grew to 2^19 empty objects). The append itself is
            // stopped by ObjectCreationHandling.Replace on PostSubmitExperience.Buttons; this cap is
            // the belt-and-suspenders that also cleans poisoned data on every resolve.
            const int MaxPostSubmitButtons = 6;
            var rawButtons = postSubmit["buttons"] as JArray ?? postSubmit["Buttons"] as JArray;
            var cleanButtons = new JArray();
            if (rawButtons != null)
            {
                foreach (var b in rawButtons)
                {
                    var label = (b?["label"] ?? b?["Label"])?.ToString();
                    var url = (b?["url"] ?? b?["Url"])?.ToString();
                    if (string.IsNullOrWhiteSpace(label) && string.IsNullOrWhiteSpace(url)) continue;
                    cleanButtons.Add(b.DeepClone());
                    if (cleanButtons.Count >= MaxPostSubmitButtons) break;
                }
            }
            postSubmit["buttons"] = cleanButtons;
            postSubmit.Remove("Buttons");

            settings["postSubmitExperience"] = postSubmit;
            settings["PostSubmitExperience"] = (JObject)postSubmit.DeepClone();
            settings["successMessage"] = message;
            settings["SuccessMessage"] = message;
            settings["redirectUrl"] = resolvedRedirectUrl ?? string.Empty;
            settings["RedirectUrl"] = resolvedRedirectUrl ?? string.Empty;
        }

        private static void CanonicalizeTrialMode(JObject settings)
        {
            var productionMode = ResolveProductionMode(settings);
            var trialFooterText = ResolveTrialFooterText(settings, productionMode);

            settings["productionMode"] = productionMode;
            settings["ProductionMode"] = productionMode;
            settings["trialFooterText"] = trialFooterText;
            settings["TrialFooterText"] = trialFooterText;
        }

        private static void PromoteTopLevelFormActionValues(JObject schema, JObject settings)
        {
            var success = PickPreferred(settings, "successMessage", "SuccessMessage");
            if (success != null)
            {
                schema["successMessage"] = success.DeepClone();
                schema["SuccessMessage"] = success.DeepClone();
            }

            var submit = PickPreferred(settings, "submitButtonText", "SubmitButtonText");
            if (submit != null)
            {
                schema["submitButtonText"] = submit.DeepClone();
                schema["SubmitButtonText"] = submit.DeepClone();
            }

            var redirect = PickPreferred(settings, "redirectUrl", "RedirectUrl");
            if (redirect != null)
            {
                schema["redirectUrl"] = redirect.DeepClone();
                schema["RedirectUrl"] = redirect.DeepClone();
            }
        }

        private static void MirrorCommonAliases(JObject settings)
        {
            MirrorAlias(settings, "customHtml", "CustomHtml");
            MirrorAlias(settings, "customCss", "CustomCss");
            MirrorAlias(settings, "customContent", "CustomContent");
            MirrorAlias(settings, "customScripts", "CustomScripts");
            MirrorAlias(settings, "theme", "Theme");
            MirrorAlias(settings, "themeCssOverrides", "ThemeCssOverrides");
            MirrorAlias(settings, "honeypotFieldName", "HoneypotFieldName");
            MirrorAlias(settings, "postSubmitExperience", "PostSubmitExperience");
            MirrorAlias(settings, "submitButtonText", "SubmitButtonText");
            MirrorAlias(settings, "defaultLanguage", "DefaultLanguage");
            MirrorAlias(settings, "supportedLanguages", "SupportedLanguages");
            MirrorAlias(settings, "previousButtonText", "PreviousButtonText");
            MirrorAlias(settings, "nextButtonText", "NextButtonText");
            MirrorAlias(settings, "printSettings", "PrintSettings");
            MirrorAlias(settings, "productionMode", "ProductionMode");
            MirrorAlias(settings, "trialFooterText", "TrialFooterText");
        }

        private static bool ResolveProductionMode(JObject settings)
        {
            return LicenseService.IsProductionLicensed();
        }

        private static string ResolveTrialFooterText(JObject settings, bool productionMode)
        {
            if (productionMode) return string.Empty;

            var explicitText = FirstUsable(settings["trialFooterText"], settings["TrialFooterText"], null);
            if (!string.IsNullOrWhiteSpace(explicitText)) return explicitText.Trim();
            return "https://dnndefender.com  Megaform Trial Mode";
        }

        private static bool? FirstUsableNullableBool(params JToken[] tokens)
        {
            foreach (var token in tokens)
            {
                if (token == null || token.Type == JTokenType.Null || token.Type == JTokenType.Undefined) continue;
                if (token.Type == JTokenType.Boolean) return token.Value<bool>();
                bool parsed;
                if (bool.TryParse(token.ToString(), out parsed)) return parsed;
            }
            return null;
        }

        private static string FirstUsable(params object[] values)
        {
            foreach (var value in values)
            {
                if (value == null) continue;
                if (value is JToken token)
                {
                    if (!HasUsableValue(token)) continue;
                    var str = token.Type == JTokenType.String ? token.ToString() : token.ToString(Formatting.None);
                    if (!string.IsNullOrWhiteSpace(str)) return str;
                    continue;
                }

                var raw = Convert.ToString(value);
                if (!string.IsNullOrWhiteSpace(raw)) return raw;
            }
            return null;
        }

        private static bool FirstUsableBool(JToken primary, JToken secondary, bool fallback)
        {
            if (primary != null && primary.Type != JTokenType.Null && primary.Type != JTokenType.Undefined)
                return primary.Value<bool>();
            if (secondary != null && secondary.Type != JTokenType.Null && secondary.Type != JTokenType.Undefined)
                return secondary.Value<bool>();
            return fallback;
        }

        private static void MirrorAlias(JObject target, string camelKey, string pascalKey)
        {
            var value = PickPreferred(target, camelKey, pascalKey);
            if (value == null) return;
            target[camelKey] = value.DeepClone();
            target[pascalKey] = value.DeepClone();
        }

        private static JToken PickPreferred(JObject target, params string[] keys)
        {
            foreach (var key in keys)
            {
                var token = target[key];
                if (HasUsableValue(token)) return token;
            }
            foreach (var key in keys)
            {
                var token = target[key];
                if (token != null) return token;
            }
            return null;
        }

        private static bool HasUsableValue(JToken token)
        {
            if (token == null) return false;
            if (token.Type == JTokenType.Null || token.Type == JTokenType.Undefined) return false;
            if (token.Type == JTokenType.String) return !string.IsNullOrWhiteSpace(token.ToString());
            if (token.Type == JTokenType.Array) return token.HasValues;
            if (token.Type == JTokenType.Object) return token.HasValues;
            return true;
        }
    }
}
