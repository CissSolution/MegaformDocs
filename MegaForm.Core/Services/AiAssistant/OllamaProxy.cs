using System;

namespace MegaForm.Core.Services.AiAssistant
{
    /// <summary>
    /// [Ollama server-proxy 2026-07-18] Shared, platform-agnostic helpers for the
    /// server-side Ollama relay. The browser posts an OpenAI-compatible chat request
    /// to a SAME-ORIGIN MegaForm endpoint (so there is no CORS / mixed-content /
    /// localhost-from-HTTPS problem); the server forwards it to the admin-configured
    /// local Ollama (or LM Studio) OpenAI-compatible endpoint.
    ///
    /// Security: the forward target is a SERVER setting (admin-configured), never a
    /// per-request client value — so the client cannot choose the destination and this
    /// is not an SSRF vector. We still validate the configured URL is a well-formed
    /// http(s) URL. The default is loopback (Ollama's default), which is the intended
    /// destination — this is why the general SsrfGuard (which blocks loopback) is NOT
    /// the right tool here; the trust boundary is "admin set this host setting".
    ///
    /// net472-safe (C# 7.3): no records / switch-expressions / target-typed new.
    /// </summary>
    public static class OllamaProxy
    {
        /// <summary>Site/host setting holding the Ollama OpenAI-compatible base URL.</summary>
        public const string BaseUrlSettingKey = "MegaForm_AI_OllamaBaseUrl";

        /// <summary>Optional site/host setting: bearer key for a secured Ollama proxy (usually blank).</summary>
        public const string ApiKeySettingKey = "MegaForm_AI_OllamaApiKey";

        /// <summary>Ollama's default OpenAI-compatible endpoint.</summary>
        public const string DefaultBaseUrl = "http://localhost:11434/v1";

        /// <summary>Returns the configured base URL, or the localhost default when unset.</summary>
        public static string ResolveBaseUrl(string configuredBase)
        {
            return string.IsNullOrWhiteSpace(configuredBase) ? DefaultBaseUrl : configuredBase.Trim();
        }

        /// <summary>
        /// Validates the configured base and produces the chat/completions target URL.
        /// Returns false with a client-safe <paramref name="error"/> when the base is malformed.
        /// </summary>
        public static bool TryResolveChatUrl(string configuredBase, out string chatUrl, out string error)
        {
            chatUrl = null;
            error = null;

            var b = ResolveBaseUrl(configuredBase);
            Uri uri;
            if (!Uri.TryCreate(b, UriKind.Absolute, out uri)
                || (!string.Equals(uri.Scheme, "http", StringComparison.OrdinalIgnoreCase)
                    && !string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase)))
            {
                error = "Ollama base URL must be an absolute http(s) URL (e.g. http://localhost:11434/v1).";
                return false;
            }

            chatUrl = b.TrimEnd('/') + "/chat/completions";
            return true;
        }
    }
}
