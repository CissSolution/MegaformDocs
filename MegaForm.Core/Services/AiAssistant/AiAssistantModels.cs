using System.Collections.Generic;

namespace MegaForm.Core.Services.AiAssistant
{
    /// <summary>
    /// Canonical config returned by IAiAssistantService.GetDefaultConfig(). Client
    /// stores in localStorage if not already configured. Mirrors the legacy ACME
    /// "acme-default-ai.local.json" file but sourced from HostSettings.
    /// </summary>
    public sealed class AiClientDefaultConfig
    {
        public string Provider { get; set; } = "openai";
        public string BaseUrl { get; set; } = "https://api.openai.com/v1";
        public string Model { get; set; } = "gpt-4o";
        /// <summary>
        /// Optional server-side default API key. Stored encrypted via host
        /// settings. We deliberately return it to the browser only when the
        /// caller is an authenticated Administrator/SuperUser; never to
        /// anonymous clients.
        /// </summary>
        public string ApiKey { get; set; } = "";

        /// <summary>
        /// [v20260607-B84] Master "Enable AI Assistant" toggle managed from the
        /// dashboard AI Settings page. When true, the floating chatbot bubble
        /// mounts on the builder surface; when false it stays hidden. This is
        /// the single shared switch — it replaces the per-browser cog inside the
        /// chat bubble. Default falls back to the dev.lock gate so existing
        /// dev.lock installs keep their chatbot until an admin toggles it.
        /// </summary>
        public bool Enabled { get; set; } = false;
    }

    /// <summary>
    /// Persisted host settings keys. Use the SettingName prefix
    /// "MegaForm_AI_" so they group neatly with the existing
    /// MegaForm_Database_* keys.
    /// </summary>
    public static class AiSettingKeys
    {
        public const string Prefix = "MegaForm_AI_";
        public const string Provider = "MegaForm_AI_Provider";
        public const string BaseUrl = "MegaForm_AI_BaseUrl";
        public const string Model = "MegaForm_AI_Model";
        public const string ApiKey = "MegaForm_AI_ApiKey";
        public const string Enabled = "MegaForm_AI_Enabled";
    }

    /// <summary>
    /// Single op echoed back from the client for server-side audit/replay.
    /// </summary>
    public sealed class AiOpRecord
    {
        public string Op { get; set; } = "";
        public Dictionary<string, object> Params { get; set; } = new Dictionary<string, object>();
        public bool Ok { get; set; }
        public string Message { get; set; } = "";
    }
}
