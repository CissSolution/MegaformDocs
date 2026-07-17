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
            // [Dnn10Settings v20260717-01] ModuleController.GetModuleSettings(int) was REMOVED in
            // DNN 10 — calling it throws MissingMethodException at JIT time on 10.3 (verified live).
            // Read through ModuleInfo.ModuleSettings instead, same as Phase2ApiController does.
            var module = DotNetNuke.Entities.Modules.ModuleController.Instance.GetModule(
                moduleId, DotNetNuke.Common.Utilities.Null.NullInteger, true);
            var settings = module != null ? module.ModuleSettings : null;
            if (settings == null) return defaultValue;
            return settings.ContainsKey(key) ? settings[key]?.ToString() ?? defaultValue : defaultValue;
        }

        public void SetSetting(int moduleId, string key, string value)
        {
            var mc = new DotNetNuke.Entities.Modules.ModuleController();
            mc.UpdateModuleSetting(moduleId, key, value ?? "");
        }
    }
}
