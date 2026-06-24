namespace MegaForm.Core.Interfaces
{
    /// <summary>
    /// Minimal route configuration surface used by MegaForm.Web middleware
    /// without taking a dependency on MegaForm.AspNetCore.Component.
    /// </summary>
    public interface IMegaFormRouteOptions
    {
        string ApiRoutePrefix { get; }
        string PopupApiRoutePrefix { get; }
        string AiApiRoutePrefix { get; }
        string AdminRoutePrefix { get; }
        string SetupRoutePrefix { get; }
        string FormRoutePrefix { get; }
        string DocumentsRoutePrefix { get; }
    }
}
