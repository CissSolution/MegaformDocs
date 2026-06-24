using System.Collections.Generic;
using System.IO;
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
            _store = new BuilderTemplateCatalogStore(Path.Combine(env.ContentRootPath, "App_Data", "MegaForm", "Templates"));
        }

        public IReadOnlyList<BuilderTemplateRecord> List() => _store.List();

        public BuilderTemplateRecord SaveTemplateJson(string originalFileName, string json) => _store.SaveTemplateJson(originalFileName, json);

        public BuilderTemplateUploadResult SaveUploadedTemplate(string originalFileName, Stream fileStream, string templateJson = null)
            => _store.SaveUploadedTemplate(originalFileName, fileStream, templateJson);
    }
}
