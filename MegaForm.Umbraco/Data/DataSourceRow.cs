using System;

namespace MegaForm.Umbraco.Data
{
    /// <summary>
    /// EF persistence row for MegaForm DataSource catalog.
    /// </summary>
    public class DataSourceRow
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string ConnectionKey { get; set; }
        public string DatabaseType { get; set; }
        public string TableName { get; set; }
        public string Query { get; set; }
        public string Description { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime UpdatedOnUtc { get; set; }
    }
}
