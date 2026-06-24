using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.Conversion
{
    /// <summary>
    /// In-memory landing page service. Replace with persistent store for production.
    /// </summary>
    public class LandingPageService : ILandingPageService
    {
        private readonly ConcurrentDictionary<string, FormLandingPage> _pages = new ConcurrentDictionary<string, FormLandingPage>();

        public Task<FormLandingPage> GetBySlugAsync(string slug, CancellationToken cancellationToken = default)
        {
            var page = _pages.Values.FirstOrDefault(p =>
                !string.IsNullOrWhiteSpace(p.Slug) &&
                p.Slug.Equals(slug, StringComparison.OrdinalIgnoreCase));

            return Task.FromResult(page);
        }

        public Task<FormLandingPage> GetByFormIdAsync(int formId, CancellationToken cancellationToken = default)
        {
            var page = _pages.Values.FirstOrDefault(p => p.FormId == formId);
            return Task.FromResult(page);
        }

        public Task<IReadOnlyList<FormLandingPage>> ListAsync(CancellationToken cancellationToken = default)
        {
            var list = _pages.Values.OrderBy(p => p.Title ?? string.Empty).ToList().AsReadOnly();
            return Task.FromResult<IReadOnlyList<FormLandingPage>>(list);
        }

        public Task SaveAsync(FormLandingPage page, CancellationToken cancellationToken = default)
        {
            if (page == null)
                throw new ArgumentNullException(nameof(page));

            if (string.IsNullOrWhiteSpace(page.Id))
                page.Id = Guid.NewGuid().ToString("N");

            _pages[page.Id] = page;
            return Task.CompletedTask;
        }

        public Task DeleteAsync(string id, CancellationToken cancellationToken = default)
        {
            if (!string.IsNullOrWhiteSpace(id))
                _pages.TryRemove(id, out _);

            return Task.CompletedTask;
        }

        public async Task<FormLandingPageRenderContext> BuildRenderContextAsync(string slug, CancellationToken cancellationToken = default)
        {
            var page = await GetBySlugAsync(slug, cancellationToken).ConfigureAwait(false);
            if (page == null)
                return null;

            return new FormLandingPageRenderContext
            {
                Page = page,
                FormHtml = string.Empty,
                AbsoluteUrl = null
            };
        }
    }
}
