using MegaForm.Core.Services.AiAssistant;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [AiConfigCoherence v20260812] Locks the rule that keeps a saved AI configuration usable.
    ///
    /// The bug this prevents, reproduced on a clean Oqtane install: an admin picked provider
    /// "openai" and pasted a real key, but baseUrl/model stayed on the built-in KB mock, so every
    /// request went to MegaFormLocalAiController and the assistant answered by pasting knowledge
    /// entries into the chat. The key was never contacted.
    /// </summary>
    public class AiProviderEndpointsTests
    {
        [Fact]
        public void RemoteProvider_StillPointingAtTheLocalMock_IsRepaired()
        {
            var baseUrl = AiProviderEndpoints.LocalBaseUrl;   // "/api/MegaFormAi"
            var model = AiProviderEndpoints.LocalModel;       // "megaform-local-kb"

            AiProviderEndpoints.Coerce("openai", ref baseUrl, ref model);

            Assert.Equal("https://api.openai.com/v1", baseUrl);
            Assert.Equal("gpt-4o", model);
        }

        [Theory]
        [InlineData("claude", "https://api.anthropic.com/v1", "claude-sonnet-4-5")]
        [InlineData("kimi", "https://api.moonshot.ai/v1", "moonshot-v1-8k")]
        [InlineData("openrouter", "https://openrouter.ai/api/v1", "openai/gpt-4o")]
        [InlineData("local", "http://localhost:11434/v1", "qwen2.5")]
        [InlineData("ollama-proxy", "http://localhost:11434/v1", "qwen2.5")]
        public void EveryRemoteProvider_GetsItsOwnEndpoint(string provider, string expectedBase, string expectedModel)
        {
            var baseUrl = AiProviderEndpoints.LocalBaseUrl;
            var model = AiProviderEndpoints.LocalModel;

            AiProviderEndpoints.Coerce(provider, ref baseUrl, ref model);

            Assert.Equal(expectedBase, baseUrl);
            Assert.Equal(expectedModel, model);
        }

        [Fact]
        public void LocalMockProvider_PointedAtARemoteHost_IsRepairedBackToTheMock()
        {
            // The inverse mistake: provider left on the mock while the URL says OpenAI. The mock
            // has no upstream, so this combination silently fails too.
            var baseUrl = "https://api.openai.com/v1";
            var model = "gpt-4o";

            AiProviderEndpoints.Coerce(AiProviderEndpoints.LocalProvider, ref baseUrl, ref model);

            Assert.Equal(AiProviderEndpoints.LocalBaseUrl, baseUrl);
            Assert.Equal("gpt-4o", model);   // a model name is not the mock's, so it is left alone
        }

        [Fact]
        public void DeliberateCustomEndpoint_IsLeftAlone()
        {
            // A self-hosted gateway is a legitimate answer for "openai" — the guard must not
            // overwrite what the admin actually typed.
            var baseUrl = "https://ai-gateway.internal.acme.com/v1";
            var model = "gpt-4o-mini-2024-07-18";

            AiProviderEndpoints.Coerce("openai", ref baseUrl, ref model);

            Assert.Equal("https://ai-gateway.internal.acme.com/v1", baseUrl);
            Assert.Equal("gpt-4o-mini-2024-07-18", model);
        }

        [Fact]
        public void BlankValues_AreFilledFromTheProvider()
        {
            string baseUrl = "", model = null;

            AiProviderEndpoints.Coerce("openai", ref baseUrl, ref model);

            Assert.Equal("https://api.openai.com/v1", baseUrl);
            Assert.Equal("gpt-4o", model);
        }

        [Fact]
        public void UnknownProvider_LeavesValuesUntouched()
        {
            // "custom" and anything else the client may add later: we have no defaults to impose,
            // so imposing one would break a working setup.
            var baseUrl = "https://something.example/v1";
            var model = "some-model";

            AiProviderEndpoints.Coerce("brand-new-provider", ref baseUrl, ref model);

            Assert.Equal("https://something.example/v1", baseUrl);
            Assert.Equal("some-model", model);
        }
    }
}
