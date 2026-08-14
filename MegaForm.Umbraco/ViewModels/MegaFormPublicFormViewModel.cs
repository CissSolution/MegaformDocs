namespace MegaForm.Umbraco.ViewModels
{
    /// <summary>
    /// View model for the standalone public form render page / iframe / preview.
    /// </summary>
    public class MegaFormPublicFormViewModel
    {
        public int FormId { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public string SchemaJson { get; set; }
        public string SettingsJson { get; set; }
        public string ThemeJson { get; set; }
        public string RulesJson { get; set; }
        public string SubmitButtonText { get; set; }
        public string SuccessMessage { get; set; }
        public string Locale { get; set; } = "en-US";
        public bool EmbedMode { get; set; }
        public bool PreviewMode { get; set; }
        public bool EnableCaptcha { get; set; }
        public bool RequireAuth { get; set; }
        public string ApiBase { get; set; } = "/umbraco/MegaForm/MegaFormApi/";
        public string MemberPrefillJson { get; set; } = "{}";
    }
}
