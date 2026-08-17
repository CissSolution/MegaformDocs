using System;

namespace MegaForm.Umbraco.Data
{
    /// <summary>
    /// EF persistence row for MegaForm PrevalueSource catalog.
    /// </summary>
    public class PrevalueSourceRow
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string Type { get; set; }
        public string SettingsJson { get; set; }
        public int CacheMinutes { get; set; }
        public string Culture { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime UpdatedOnUtc { get; set; }
    }
}
