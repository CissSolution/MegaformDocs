using MegaForm.Core.Interfaces;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// DNN implementation của IModuleSettingsService.
    /// Khi chuyển sang Oqtane/ASP.NET chỉ cần tạo class mới implement interface này.
    /// </summary>
    public class DnnModuleSettingsService : IModuleSettingsService
    {
        public string GetSetting(int moduleId, string key, string defaultValue = "")
        {
            var mc = new DotNetNuke.Entities.Modules.ModuleController();
            var settings = mc.GetModuleSettings(moduleId);
            return settings.ContainsKey(key) ? settings[key]?.ToString() ?? defaultValue : defaultValue;
        }

        public void SetSetting(int moduleId, string key, string value)
        {
            var mc = new DotNetNuke.Entities.Modules.ModuleController();
            mc.UpdateModuleSetting(moduleId, key, value ?? "");
        }
    }
}
