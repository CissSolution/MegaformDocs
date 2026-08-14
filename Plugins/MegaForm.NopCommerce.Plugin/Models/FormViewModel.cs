namespace MegaForm.NopCommerce.Plugin.Models
{
    /// <summary>
    /// View model for the public form / embed page.
    /// </summary>
    public class FormViewModel
    {
        public int FormId { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public string SchemaJson { get; set; }
        public string SettingsJson { get; set; }
        public string ThemeJson { get; set; }
        public string SubmitButtonText { get; set; }
        public string SuccessMessage { get; set; }
        public bool EnableCaptcha { get; set; }
        public bool RequireAuth { get; set; }
        public string Locale { get; set; } = "en-US";
    }
}
