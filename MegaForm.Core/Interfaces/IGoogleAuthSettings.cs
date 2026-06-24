namespace MegaForm.Core.Interfaces
{
    /// <summary>
    /// Provides the Google Service Account JSON used for Sheets API runtime authentication.
    /// Platform implementations read from appsettings.json, environment variables,
    /// or module settings.
    /// </summary>
    public interface IGoogleAuthSettings
    {
        string GetServiceAccountJson();
    }
}
