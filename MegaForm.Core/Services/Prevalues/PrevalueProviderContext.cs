using System;
using System.Collections.Generic;

namespace MegaForm.Core.Services.Prevalues
{
    /// <summary>
    /// Runtime context passed to a PrevalueProvider when resolving options.
    /// Supports cascading and per-request parameter binding.
    /// </summary>
    public class PrevalueProviderContext
    {
        /// <summary>Current field values from the form (for cascading parameters).</summary>
        public IDictionary<string, object> Parameters { get; set; }

        /// <summary>Culture code for sorting/localizing labels.</summary>
        public string Culture { get; set; }

        /// <summary>Maximum number of options to return (defensive ceiling).</summary>
        public int MaxRows { get; set; } = 500;

        /// <summary>
        /// [DynamicRoot 2026-08-18] The page the form is being rendered on, when there is one.
        ///
        /// A prevalue source can be relative rather than fixed — "the section this page belongs
        /// to", "this page's children" — which is what Umbraco Forms calls a dynamic root. That
        /// question has no answer without knowing which page is asking, so the id travels with
        /// the request: the public form sends it, the editor's Test sends the page you preview
        /// against, and a source that does not use a dynamic root ignores it entirely.
        ///
        /// Zero means "no page context" — a provider that needs one returns nothing rather than
        /// guessing a root, because guessing would silently list the wrong branch.
        /// </summary>
        public int CurrentPageId { get; set; }

        /// <summary>The same page by key, for hosts that address content by GUID.</summary>
        public Guid CurrentPageKey { get; set; }

        public static PrevalueProviderContext Empty => new PrevalueProviderContext();
    }
}
