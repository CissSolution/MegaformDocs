namespace MegaForm.Web.Services
{
    /// <summary>
    /// Runtime feature flags for the MegaForm ASP.NET Core host.
    /// The free package disables paid features; the premium add-on enables them.
    /// </summary>
    public interface IMegaFormFeatureToggles
    {
        /// <summary>Workflow editor and runtime are available.</summary>
        bool Workflow { get; }

        /// <summary>Premium builder templates are available.</summary>
        bool PremiumTemplates { get; }
    }
}
