using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Templates
{
    /// <summary>
    /// Platform-agnostic form template catalog service.
    /// Hosts provide the physical storage; this service orchestrates search/import/export.
    /// </summary>
    public interface IFormTemplateCatalogService
    {
        Task<IReadOnlyList<FormTemplateCatalogEntry>> SearchAsync(TemplateSearchQuery query, CancellationToken cancellationToken = default);

        Task<FormTemplateCatalogEntry> GetByIdAsync(string id, CancellationToken cancellationToken = default);

        Task<FormTemplateCatalogEntry> GetBySlugAsync(string slug, CancellationToken cancellationToken = default);

        Task<TemplateImportResult> ImportFromJsonAsync(string name, string schemaJson, CancellationToken cancellationToken = default);

        Task<TemplateImportResult> ImportFromZipAsync(string fileName, Stream zipStream, CancellationToken cancellationToken = default);

        Task<Stream> ExportToZipAsync(string id, CancellationToken cancellationToken = default);

        Task SaveAsync(FormTemplateCatalogEntry entry, CancellationToken cancellationToken = default);

        Task DeleteAsync(string id, CancellationToken cancellationToken = default);

        Task<int> GetBuiltInCountAsync(CancellationToken cancellationToken = default);
    }
}
