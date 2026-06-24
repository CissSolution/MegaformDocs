using MegaForm.Core.Models;

namespace MegaForm.Core.Rendering
{
    /// <summary>
    /// Canonical server-side render payload.
    /// Hosts should fetch raw form data, call <see cref="RenderModelResolver"/>,
    /// and pass this resolved model to the shared renderer without extra per-host merges.
    /// </summary>
    public sealed class ResolvedRenderModel
    {
        public const string ResolverBadge = "RenderModelResolver v20260409-04";

        public string Badge { get; set; } = ResolverBadge;

        public string SchemaJson { get; set; } = "{}";

        public string SettingsJson { get; set; } = "{}";

        public string SubmitButtonText { get; set; } = "Submit";

        public string SuccessMessage { get; set; } = "Thank you. We have received your submission.";

        public string RedirectUrl { get; set; } = string.Empty;

        public PostSubmitExperience PostSubmitExperience { get; set; } = new PostSubmitExperience();

        public FormSchema Schema { get; set; } = new FormSchema();

        public string InitialInlineCss { get; set; } = string.Empty;
    }
}
