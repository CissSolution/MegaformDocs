using System.Collections.Generic;
using System.Threading.Tasks;
using MegaForm.Core.Models.Prevalues;

namespace MegaForm.Core.Services.Prevalues
{
    /// <summary>
    /// Resolves options from one PrevalueSource type.
    /// Implementations are platform-specific when they need to talk to Umbraco/DNN APIs.
    /// </summary>
    public interface IPrevalueProvider
    {
        /// <summary>Provider type alias, e.g. "sql", "textfile", "umbracoDocuments".</summary>
        string Type { get; }

        /// <summary>
        /// Returns the live options for the source.
        /// </summary>
        Task<List<PrevalueOption>> GetOptionsAsync(PrevalueSource source, PrevalueProviderContext context);

        /// <summary>
        /// Validates the provider-specific settings and returns a friendly error or null.
        /// </summary>
        Task<string> ValidateAsync(PrevalueSource source);
    }
}
