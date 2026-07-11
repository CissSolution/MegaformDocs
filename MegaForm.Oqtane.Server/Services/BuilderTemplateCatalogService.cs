using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Hosting;
using MegaForm.Core.Services;
using BuilderTemplateRecord = MegaForm.Core.Services.BuilderTemplateCatalogStore.BuilderTemplateRecord;
using BuilderTemplateUploadResult = MegaForm.Core.Services.BuilderTemplateCatalogStore.BuilderTemplateUploadResult;

namespace MegaForm.Oqtane.Server.Services
{
    public sealed class BuilderTemplateCatalogService
    {
        private readonly BuilderTemplateCatalogStore _store;

        public BuilderTemplateCatalogService(IWebHostEnvironment env)
        {
            var appDataDir = Path.Combine(env.ContentRootPath, "App_Data", "MegaForm", "Templates");
            // [FreshInstallTemplateSeed 2026-07-01] The template catalog reads from App_Data,
            // but the NuGet only deploys wwwroot — so a CLEAN install had an EMPTY Business
            // Starters / Template Gallery (the premium starter forms were never shipped there).
            // Seed App_Data from the shipped wwwroot/Modules/MegaForm/Templates copy on first
            // run (idempotent: only when App_Data has no template yet).
            SeedTemplatesIfEmpty(appDataDir, env);
            _store = new BuilderTemplateCatalogStore(appDataDir);
        }

        private static void SeedTemplatesIfEmpty(string appDataDir, IWebHostEnvironment env)
        {
            try
            {
                Directory.CreateDirectory(appDataDir);
                if (Directory.EnumerateFiles(appDataDir, "*.json").Any()) return; // already populated
                var webRoot = env.WebRootPath;
                if (string.IsNullOrEmpty(webRoot)) webRoot = Path.Combine(env.ContentRootPath, "wwwroot");
                var shipped = Path.Combine(webRoot, "Modules", "MegaForm", "Templates");
                if (!Directory.Exists(shipped)) return;
                foreach (var src in Directory.EnumerateFiles(shipped, "*.json"))
                {
                    var dest = Path.Combine(appDataDir, Path.GetFileName(src));
                    if (!File.Exists(dest)) File.Copy(src, dest);
                }
            }
            catch { /* non-fatal — gallery stays empty until a manual upload */ }
        }

        public IReadOnlyList<BuilderTemplateRecord> List() => _store.List();

        public BuilderTemplateRecord SaveTemplateJson(string originalFileName, string json) => _store.SaveTemplateJson(originalFileName, json);

        public BuilderTemplateUploadResult SaveUploadedTemplate(string originalFileName, Stream fileStream, string templateJson = null)
            => _store.SaveUploadedTemplate(originalFileName, fileStream, templateJson);
    }
}
