using System;

namespace MegaForm.Core.Models.DataSources
{
    /// <summary>
    /// Shared catalog of reusable database sources for form read/write binding.
    /// A data source is a named pointer; connection strings live server-side in
    /// <see cref="MegaForm.Core.Services.NamedConnectionCatalog"/> or appsettings
    /// and are never sent to the browser.
    /// </summary>
    public class DataSource
    {
        public int Id { get; set; }

        public string Name { get; set; }

        /// <summary>Name of a registered connection (e.g. "CustomerErp", "DashboardDatabase").</summary>
        public string ConnectionKey { get; set; }

        /// <summary>sqlite | sqlserver | mysql | postgresql (optional; falls back to connection default).</summary>
        public string DatabaseType { get; set; }

        /// <summary>Optional default schema/table this source points at.</summary>
        public string TableName { get; set; }

        /// <summary>Optional query used when this source feeds a read-only list.</summary>
        public string Query { get; set; }

        /// <summary>Human-readable note.</summary>
        public string Description { get; set; }

        public DateTime CreatedOnUtc { get; set; }

        public DateTime UpdatedOnUtc { get; set; }
    }
}
