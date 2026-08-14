using MegaForm.Core.i18n;

namespace MegaForm.NopCommerce.Plugin.Services
{
    /// <summary>
    /// Minimal localization provider for nopCommerce.
    /// Future: integrate with Nop.Services.Localization.ILocalizationService.
    /// </summary>
    public class NopCommerceLocalizationProvider : ILocalizationProvider
    {
        public string CurrentLocale => "en-US";

        public string L(string key, object param = null)
        {
            var text = key ?? "";
            if (param != null)
                text = text.Replace("{param}", param.ToString());
            return text;
        }
    }
}
