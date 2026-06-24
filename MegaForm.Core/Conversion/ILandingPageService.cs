using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Conversion
{
    /// <summary>
    /// Manages dedicated form landing pages.
    /// Rendering is delegated to the host via FormLandingPageRenderContext.
    /// </summary>
    public interface ILandingPageService
    {
        Task<FormLandingPage> GetBySlugAsync(string slug, CancellationToken cancellationToken = default);
        Task<FormLandingPage> GetByFormIdAsync(int formId, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<FormLandingPage>> ListAsync(CancellationToken cancellationToken = default);
        Task SaveAsync(FormLandingPage page, CancellationToken cancellationToken = default);
        Task DeleteAsync(string id, CancellationToken cancellationToken = default);
        Task<FormLandingPageRenderContext> BuildRenderContextAsync(string slug, CancellationToken cancellationToken = default);
    }
}
