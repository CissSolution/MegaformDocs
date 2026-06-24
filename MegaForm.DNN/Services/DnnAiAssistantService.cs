using DotNetNuke.Entities.Controllers;
using MegaForm.Core.Services.AiAssistant;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// DNN-host-scoped implementation of <see cref="IAiAssistantService"/>.
    /// Persists into the standard DNN HostSettings table so the same key
    /// applies to every portal on the install (mirrors how the existing
    /// MegaForm_Database_* connection settings are stored).
    /// </summary>
    public sealed class DnnAiAssistantService : IAiAssistantService
    {
        public AiClientDefaultConfig GetDefaultConfig(int portalId, bool includeApiKey)
        {
            var host = HostController.Instance;
            var cfg = new AiClientDefaultConfig
            {
                Provider = host.GetString(AiSettingKeys.Provider, "openai"),
                BaseUrl = host.GetString(AiSettingKeys.BaseUrl, "https://api.openai.com/v1"),
                Model = host.GetString(AiSettingKeys.Model, "gpt-4o"),
                ApiKey = includeApiKey ? host.GetString(AiSettingKeys.ApiKey, string.Empty) : string.Empty,
                // [v20260607-B84] Shared "Enable AI Assistant" toggle. Empty when
                // never saved → controller falls back to the dev.lock default.
                Enabled = string.Equals(host.GetString(AiSettingKeys.Enabled, string.Empty), "true", System.StringComparison.OrdinalIgnoreCase),
            };
            return cfg;
        }

        public void SaveDefaultConfig(int portalId, AiClientDefaultConfig config)
        {
            if (config == null) return;
            var host = HostController.Instance;
            host.Update(AiSettingKeys.Provider, config.Provider ?? "openai");
            host.Update(AiSettingKeys.BaseUrl, config.BaseUrl ?? string.Empty);
            host.Update(AiSettingKeys.Model, config.Model ?? string.Empty);
            host.Update(AiSettingKeys.Enabled, config.Enabled ? "true" : "false");
            // [v20260527-04] API key is stored encrypted via HostController.Update
            // overload that takes (key, value, isSecure) — same pattern DNN uses
            // for SMTP password.
            host.Update(AiSettingKeys.ApiKey, config.ApiKey ?? string.Empty, true);
        }
    }
}
