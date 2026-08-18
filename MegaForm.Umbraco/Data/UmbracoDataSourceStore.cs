using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Models.DataSources;

namespace MegaForm.Umbraco.Data
{
    /// <summary>
    /// EF Core implementation of <see cref="IDataSourceStore"/> for the Umbraco host.
    /// </summary>
    public class UmbracoDataSourceStore : IDataSourceStore
    {
        private readonly MegaFormDbContext _db;

        public UmbracoDataSourceStore(MegaFormDbContext db)
        {
            _db = db;
        }

        public List<DataSource> List()
        {
            return _db.DataSources
                .AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(Map)
                .ToList();
        }

        public DataSource Get(int id)
        {
            var row = _db.DataSources.AsNoTracking().FirstOrDefault(x => x.Id == id);
            return row == null ? null : Map(row);
        }

        public DataSource GetByName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            var row = _db.DataSources
                .AsNoTracking()
                .FirstOrDefault(x => x.Name == name);
            return row == null ? null : Map(row);
        }

        public int Save(DataSource source)
        {
            if (source == null) throw new ArgumentNullException(nameof(source));

            var now = DateTime.UtcNow;
            var row = _db.DataSources.FirstOrDefault(x => x.Id == source.Id);
            if (row == null)
            {
                row = new DataSourceRow { CreatedOnUtc = now };
                _db.DataSources.Add(row);
            }

            row.Name = source.Name;
            row.ConnectionKey = source.ConnectionKey;
            row.DatabaseType = source.DatabaseType;
            row.TableName = source.TableName;
            row.Query = source.Query;
            row.Description = source.Description;
            row.UpdatedOnUtc = now;

            _db.SaveChanges();
            return row.Id;
        }

        public void Delete(int id)
        {
            var row = _db.DataSources.FirstOrDefault(x => x.Id == id);
            if (row == null) return;
            _db.DataSources.Remove(row);
            _db.SaveChanges();
        }

        private static DataSource Map(DataSourceRow r) => new DataSource
        {
            Id = r.Id,
            Name = r.Name,
            ConnectionKey = r.ConnectionKey,
            DatabaseType = r.DatabaseType,
            TableName = r.TableName,
            Query = r.Query,
            Description = r.Description,
            CreatedOnUtc = r.CreatedOnUtc,
            UpdatedOnUtc = r.UpdatedOnUtc
        };
    }
}
