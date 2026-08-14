using System;
using System.Collections.Generic;

namespace MegaForm.Core.Services.AiAssistant
{
    /// <summary>
    /// [AiConfigCoherence v20260812] Keeps a saved AI configuration INTERNALLY CONSISTENT.
    ///
    /// The site config is four independent fields — provider / baseUrl / model / apiKey — and the
    /// settings panel saves whatever is in the form. Switching the provider dropdown does not
    /// rewrite the other two, so an admin who picks "openai" and pastes a real key can end up
    /// stored as:
    ///
    ///     provider = openai            (what they chose)
    ///     apiKey   = sk-proj-…         (a real key)
    ///     baseUrl  = /api/MegaFormAi   (still the built-in KB mock)
    ///     model    = megaform-local-kb (still the mock's model)
    ///
    /// which can never work: every request goes to MegaFormLocalAiController, which answers by
    /// pasting the three best-matching knowledge entries into the chat. The user sees the assistant
    /// "reply" with raw KB text and reasonably concludes the AI is broken — measured on a clean
    /// Oqtane install 2026-08-12, and the OpenAI key was never contacted once.
    ///
    /// So the endpoint is DERIVED from the provider whenever the stored pair cannot serve it. A
    /// deliberate custom endpoint is left alone: only the built-in local values (or blanks) are
    /// replaced, never a URL the admin actually typed.
    /// </summary>
    public static class AiProviderEndpoints
    {
        /// <summary>The in-process mock: no key, answers out of the knowledge base.</summary>
        public const string LocalProvider = "megaform-local";
        public const string LocalBaseUrl = "/api/MegaFormAi";
        public const string LocalModel = "megaform-local-kb";

        private sealed class Defaults
        {
            public string BaseUrl;
            public string Model;
            public Defaults(string baseUrl, string model) { BaseUrl = baseUrl; Model = model; }
        }

        // Mirrors MegaForm.UI/src/ai-form-assistant/providers.ts — the client offers exactly these,
        // so the server must resolve exactly these.
        private static readonly Dictionary<string, Defaults> Known =
            new Dictionary<string, Defaults>(StringComparer.OrdinalIgnoreCase)
            {
                { "openai",         new Defaults("https://api.openai.com/v1", "gpt-4o") },
                { "claude",         new Defaults("https://api.anthropic.com/v1", "claude-sonnet-4-5") },
                { "kimi",           new Defaults("https://api.moonshot.ai/v1", "moonshot-v1-8k") },
                { "kimi-cn",        new Defaults("https://api.moonshot.cn/v1", "moonshot-v1-8k") },
                { "openrouter",     new Defaults("https://openrouter.ai/api/v1", "openai/gpt-4o") },
                { "qwen",           new Defaults("https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "qwen-plus") },
                { "qwen-cn",        new Defaults("https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen-plus") },
                { "local",          new Defaults("http://localhost:11434/v1", "qwen2.5") },
                { "ollama-proxy",   new Defaults(OllamaProxy.DefaultBaseUrl, "qwen2.5") },
                { LocalProvider,      new Defaults(LocalBaseUrl, LocalModel) },
            };

        public static bool IsLocalMockProvider(string provider)
            => string.Equals((provider ?? string.Empty).Trim(), LocalProvider, StringComparison.OrdinalIgnoreCase);

        /// <summary>True when this baseUrl routes to the in-process KB mock.</summary>
        public static bool IsLocalMockBaseUrl(string baseUrl)
        {
            var b = (baseUrl ?? string.Empty).Trim().TrimEnd('/');
            return b.Length > 0 && b.EndsWith(LocalBaseUrl, StringComparison.OrdinalIgnoreCase);
        }

        public static string DefaultBaseUrl(string provider)
        {
            Defaults d;
            return Known.TryGetValue((provider ?? string.Empty).Trim(), out d) ? d.BaseUrl : null;
        }

        public static string DefaultModel(string provider)
        {
            Defaults d;
            return Known.TryGetValue((provider ?? string.Empty).Trim(), out d) ? d.Model : null;
        }

        /// <summary>
        /// Returns the baseUrl/model this provider can actually be served with.
        ///
        /// Replaces a stored value ONLY when it cannot work for the chosen provider:
        ///   - blank
        ///   - the local mock's endpoint while the provider is a real remote one (and vice versa)
        ///   - the local mock's model while the provider is a real remote one
        /// Anything else — including a self-hosted proxy URL or a fine-tuned model name — is the
        /// admin's deliberate choice and is returned untouched.
        /// </summary>
        public static void Coerce(string provider, ref string baseUrl, ref string model)
        {
            var isLocalMock = IsLocalMockProvider(provider);
            var fallbackBase = DefaultBaseUrl(provider);
            var fallbackModel = DefaultModel(provider);

            var b = (baseUrl ?? string.Empty).Trim();
            if (b.Length == 0 || (IsLocalMockBaseUrl(b) != isLocalMock))
            {
                if (!string.IsNullOrEmpty(fallbackBase)) baseUrl = fallbackBase;
            }

            var m = (model ?? string.Empty).Trim();
            var modelIsLocalMock = string.Equals(m, LocalModel, StringComparison.OrdinalIgnoreCase);
            if (m.Length == 0 || (modelIsLocalMock && !isLocalMock))
            {
                if (!string.IsNullOrEmpty(fallbackModel)) model = fallbackModel;
            }
        }
    }
}
