namespace MegaForm.Oqtane.Server.Data
{
    /// <summary>
    /// Legacy helper retained only to avoid breaking references.
    /// Oqtane-standard schema creation now happens through MegaFormManager migrations.
    /// </summary>
    public class MegaFormInstall
    {
        public bool EnsureCreated(string connectionString) => false;
    }
}
