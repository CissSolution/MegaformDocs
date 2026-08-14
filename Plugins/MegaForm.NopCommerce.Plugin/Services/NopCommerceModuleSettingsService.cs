using System.Collections.Generic;
using Newtonsoft.Json;
using Nop.Services.Configuration;
using MegaForm.Core.Interfaces;

namespace MegaForm.NopCommerce.Plugin.Services
{
    /// <summary>
    /// Stores MegaForm module settings as a single JSON blob in nopCommerce ISettingService.
    /// </summary>
    public class NopCommerceModuleSettingsService : IModuleSettingsService
    {
        private readonly ISettingService _settingService;
        private const string SettingsKey = "MegaForm.ModuleSettings";

        public NopCommerceModuleSettingsService(ISettingService settingService)
        {
            _settingService = settingService;
        }

        public string GetSetting(int moduleId, string key, string defaultValue = "")
        {
            var json = GetSettingsJson();
            var dict = Deserialize(json);
            return dict.TryGetValue(key, out var value) ? value : defaultValue;
        }

        public void SetSetting(int moduleId, string key, string value)
        {
            var json = GetSettingsJson();
            var dict = Deserialize(json);
            dict[key] = value;
            var newJson = JsonConvert.SerializeObject(dict);
            _settingService.SetSettingAsync(SettingsKey, newJson).GetAwaiter().GetResult();
        }

        private string GetSettingsJson()
        {
            return _settingService.GetSettingByKeyAsync<string>(SettingsKey).GetAwaiter().GetResult() ?? "";
        }

        private static Dictionary<string, string> Deserialize(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return new Dictionary<string, string>();

            try
            {
                return JsonConvert.DeserializeObject<Dictionary<string, string>>(json)
                       ?? new Dictionary<string, string>();
            }
            catch
            {
                return new Dictionary<string, string>();
            }
        }
    }
}
