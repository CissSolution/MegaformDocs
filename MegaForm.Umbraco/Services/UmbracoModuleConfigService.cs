using System;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Umbraco.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace MegaForm.Umbraco.Services
{
    public interface IUmbracoModuleConfigService
    {
        ModuleViewConfigInfo GetConfig(int contentId);
        ModuleViewConfigInfo SaveConfig(ModuleViewConfigInfo config);
    }

    public class UmbracoModuleConfigService : IUmbracoModuleConfigService
    {
        private readonly MegaFormDbContext _db;
        private readonly ILogger<UmbracoModuleConfigService> _logger;

        public UmbracoModuleConfigService(MegaFormDbContext db, ILogger<UmbracoModuleConfigService> logger)
        {
            _db = db;
            _logger = logger;
        }

        public ModuleViewConfigInfo GetConfig(int contentId)
        {
            if (contentId <= 0) return null;
            return _db.ModuleViewConfigs.AsNoTracking().FirstOrDefault(x => x.ModuleId == contentId);
        }

        public ModuleViewConfigInfo SaveConfig(ModuleViewConfigInfo config)
        {
            if (config == null) throw new ArgumentNullException(nameof(config));
            if (config.ModuleId <= 0) throw new ArgumentOutOfRangeException(nameof(config.ModuleId));
            if (config.FormId <= 0) throw new ArgumentOutOfRangeException(nameof(config.FormId));

            var existing = _db.ModuleViewConfigs.FirstOrDefault(x => x.ModuleId == config.ModuleId);
            if (existing == null)
            {
                config.CreatedOnUtc = DateTime.UtcNow;
                config.ModifiedOnUtc = DateTime.UtcNow;
                _db.ModuleViewConfigs.Add(config);
                _logger.LogInformation("[MegaForm.Umbraco] Created module view config for content {ContentId} -> form {FormId}", config.ModuleId, config.FormId);
            }
            else
            {
                existing.FormId = config.FormId;
                existing.ViewType = string.IsNullOrWhiteSpace(config.ViewType) ? "submit" : config.ViewType;
                existing.ViewConfigJson = config.ViewConfigJson;
                existing.CssClass = config.CssClass;
                existing.CacheMinutes = config.CacheMinutes;
                existing.PermissionsJson = config.PermissionsJson;
                existing.ModifiedOnUtc = DateTime.UtcNow;
                config = existing;
                _logger.LogInformation("[MegaForm.Umbraco] Updated module view config for content {ContentId} -> form {FormId}", config.ModuleId, config.FormId);
            }

            _db.SaveChanges();
            return config;
        }
    }
}
