namespace MegaForm.NopCommerce.Plugin
{
    /// <summary>
    /// Plugin-level settings stored via nopCommerce ISettingService (section "MegaForm").
    /// </summary>
    public class MegaFormNopCommerceSettings
    {
        public string ConnectionString { get; set; }
        public string DatabaseProvider { get; set; } = "SqlServer";
    }
}
