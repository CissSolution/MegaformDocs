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

        public static PrevalueProviderContext Empty => new PrevalueProviderContext();
    }
}
