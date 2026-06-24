using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web.Hosting;
using MegaForm.Core.Services;
using BuilderTemplateRecord = MegaForm.Core.Services.BuilderTemplateCatalogStore.BuilderTemplateRecord;
using BuilderTemplateUploadResult = MegaForm.Core.Services.BuilderTemplateCatalogStore.BuilderTemplateUploadResult;

namespace MegaForm.DNN.Services
{
    public sealed class BuilderTemplateCatalogService
    {
        private readonly BuilderTemplateCatalogStore _store;

        public BuilderTemplateCatalogService()
        {
            var dataRoot = ResolveDataRoot();
            TrySeedFromLegacyRoot(dataRoot);
            _store = new BuilderTemplateCatalogStore(dataRoot);
        }

        private static string ResolveDataRoot()
        {
            return HostingEnvironment.MapPath("~/DesktopModules/MegaForm/Templates")
                ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory ?? ".", "DesktopModules", "MegaForm", "Templates");
        }

        private static string ResolveLegacyRoot()
        {
            return HostingEnvironment.MapPath("~/Portals/_default/MegaForm/Templates")
                ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory ?? ".", "Portals", "_default", "MegaForm", "Templates");
        }

        private static void TrySeedFromLegacyRoot(string dataRoot)
        {
            if (string.IsNullOrWhiteSpace(dataRoot)) return;

            Directory.CreateDirectory(dataRoot);
            if (Directory.EnumerateFileSystemEntries(dataRoot).Any()) return;

            var legacyRoot = ResolveLegacyRoot();
            if (string.IsNullOrWhiteSpace(legacyRoot) || !Directory.Exists(legacyRoot)) return;

            foreach (var sourcePath in Directory.GetFiles(legacyRoot, "*", SearchOption.AllDirectories))
            {
                var relativePath = sourcePath.Substring(legacyRoot.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                var targetPath = Path.Combine(dataRoot, relativePath);
                var targetDir = Path.GetDirectoryName(targetPath);
                if (!string.IsNullOrWhiteSpace(targetDir)) Directory.CreateDirectory(targetDir);
                if (!File.Exists(targetPath)) File.Copy(sourcePath, targetPath, overwrite: false);
            }
        }

        public IReadOnlyList<BuilderTemplateRecord> List() => _store.List();

        public BuilderTemplateRecord SaveTemplateJson(string originalFileName, string json) => _store.SaveTemplateJson(originalFileName, json);

        public BuilderTemplateUploadResult SaveUploadedTemplate(string originalFileName, Stream fileStream, string templateJson = null)
            => _store.SaveUploadedTemplate(originalFileName, fileStream, templateJson);
    }
}
