using System;
using System.Data.Common;
using Microsoft.Data.SqlClient;
using MegaForm.Core.Interfaces;
using Microsoft.Extensions.Configuration;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Minimal connection registry for the Umbraco host. Resolves the Umbraco
    /// SQL connection string and opens a SqlConnection when a workflow node asks
    /// for the default connection. Named connection strings are not yet supported.
    /// </summary>
    public class UmbracoConnectionRegistry : IConnectionRegistry
    {
        private readonly string _connectionString;

        public UmbracoConnectionRegistry(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("umbracoDbDSN")
                ?? configuration["ConnectionStrings:umbracoDbDSN"]
                ?? configuration["umbracoDbDSN"];
        }

        public DbConnection GetConnection(string connectionName, string databaseType = null, string connectionString = null)
        {
            if (!string.IsNullOrWhiteSpace(connectionString))
            {
                return new SqlConnection(connectionString);
            }

            if (string.IsNullOrWhiteSpace(_connectionString))
            {
                throw new InvalidOperationException("Umbraco connection string 'umbracoDbDSN' was not found.");
            }

            return new SqlConnection(_connectionString);
        }
    }
}
