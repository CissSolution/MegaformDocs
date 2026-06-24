namespace MegaForm.Core.Services.AiAssistant
{
    /// <summary>
    /// Canonical contract for the MegaForm AI Form Assistant. Implementations
    /// for DNN read from HostSettings; Oqtane reads from Site/Module settings.
    /// The browser-side bundle (MegaForm.UI/src/ai-form-assistant) consumes
    /// only GetDefaultConfig() — all AI traffic flows directly browser → AI
    /// provider so credentials never round-trip through MegaForm's servers
    /// beyond initial bootstrap.
    /// </summary>
    public interface IAiAssistantService
    {
        /// <summary>
        /// Returns the server-stored default AI config (provider, baseUrl,
        /// model, apiKey). The apiKey is only returned to authenticated
        /// administrators / super-users — pass `includeApiKey: false` for
        /// any caller that doesn't satisfy that bar.
        /// </summary>
        AiClientDefaultConfig GetDefaultConfig(int portalId, bool includeApiKey);

        /// <summary>
        /// Persist host-scoped default config. Caller must validate that the
        /// requesting user is an Administrator / SuperUser before invoking.
        /// </summary>
        void SaveDefaultConfig(int portalId, AiClientDefaultConfig config);
    }
}
