using MegaForm.Web.Services;

namespace MegaForm.AspNetCore.Component
{
    /// <summary>
    /// Default free-tier toggles. Everything paid is switched off.
    /// </summary>
    public sealed class DefaultMegaFormFeatureToggles : IMegaFormFeatureToggles
    {
        public bool Workflow => false;
        public bool PremiumTemplates => false;
    }
}
