using MegaForm.Core.Interfaces;
using MegaForm.Web.Data;
using System.Linq;

namespace MegaForm.Web.Services
{
    /// <summary>
    /// ASP.NET Core implementation của IModuleSettingsService.
    /// DNN dùng ModuleController.UpdateModuleSetting() — Web dùng bảng MF_ModuleSettings trong DB.
    /// Oqtane sau này: tạo OqtaneModuleSettingsService implement cùng interface.
    /// </summary>
    public class WebModuleSettingsService : IModuleSettingsService
    {
        private readonly MegaFormDbContext _db;
        public WebModuleSettingsService(MegaFormDbContext db) { _db = db; }

        public string GetSetting(int moduleId, string key, string defaultValue = "")
        {
            var row = _db.ModuleSettings
                .Where(s => s.ModuleId == moduleId && s.SettingKey == key)
                .OrderByDescending(s => s.Id)
                .FirstOrDefault();
            return Normalize(key, row?.SettingValue ?? defaultValue);
        }

        public void SetSetting(int moduleId, string key, string value)
        {
            var normalized = Normalize(key, value ?? "");
            var rows = _db.ModuleSettings
                .Where(s => s.ModuleId == moduleId && s.SettingKey == key)
                .OrderByDescending(s => s.Id)
                .ToList();

            var row = rows.FirstOrDefault();
            if (row == null)
            {
                _db.ModuleSettings.Add(new ModuleSettingRow { ModuleId = moduleId, SettingKey = key, SettingValue = normalized });
            }
            else
            {
                row.SettingValue = normalized;
                if (rows.Count > 1)
                {
                    foreach (var duplicate in rows.Skip(1)) _db.ModuleSettings.Remove(duplicate);
                }
            }
            _db.SaveChanges();
        }

        private static string Normalize(string key, string value)
        {
            var safe = value ?? string.Empty;
            if (string.IsNullOrWhiteSpace(key)) return safe.Trim();
            if (key.StartsWith("Payment_PayPal_"))
            {
                return safe.Replace("\r", string.Empty).Replace("\n", string.Empty).Trim();
            }
            return safe;
        }
    }
}
