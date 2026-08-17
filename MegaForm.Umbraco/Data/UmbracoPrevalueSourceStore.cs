using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Models.Prevalues;

namespace MegaForm.Umbraco.Data
{
    /// <summary>
    /// EF Core implementation of <see cref="IPrevalueSourceStore"/> for the Umbraco host.
    /// </summary>
    public class UmbracoPrevalueSourceStore : IPrevalueSourceStore
    {
        private readonly MegaFormDbContext _db;

        public UmbracoPrevalueSourceStore(MegaFormDbContext db)
        {
            _db = db;
        }

        public List<PrevalueSource> List()
        {
            return _db.PrevalueSources
                .AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(Map)
                .ToList();
        }

        public PrevalueSource Get(int id)
        {
            var row = _db.PrevalueSources.AsNoTracking().FirstOrDefault(x => x.Id == id);
            return row == null ? null : Map(row);
        }

        public PrevalueSource GetByName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            var row = _db.PrevalueSources
                .AsNoTracking()
                .FirstOrDefault(x => x.Name == name);
            return row == null ? null : Map(row);
        }

        public int Save(PrevalueSource source)
        {
            if (source == null) throw new ArgumentNullException(nameof(source));

            var now = DateTime.UtcNow;
            var row = _db.PrevalueSources.FirstOrDefault(x => x.Id == source.Id);
            if (row == null)
            {
                row = new PrevalueSourceRow { CreatedOnUtc = now };
                _db.PrevalueSources.Add(row);
            }

            row.Name = source.Name;
            row.Type = source.Type;
            row.SettingsJson = source.SettingsJson;
            row.CacheMinutes = source.CacheMinutes;
            row.Culture = source.Culture;
            row.UpdatedOnUtc = now;

            _db.SaveChanges();
            return row.Id;
        }

        public void Delete(int id)
        {
            var row = _db.PrevalueSources.FirstOrDefault(x => x.Id == id);
            if (row == null) return;
            _db.PrevalueSources.Remove(row);
            _db.SaveChanges();
        }

        private static PrevalueSource Map(PrevalueSourceRow r) => new PrevalueSource
        {
            Id = r.Id,
            Name = r.Name,
            Type = r.Type,
            SettingsJson = r.SettingsJson,
            CacheMinutes = r.CacheMinutes,
            Culture = r.Culture,
            CreatedOnUtc = r.CreatedOnUtc,
            UpdatedOnUtc = r.UpdatedOnUtc
        };
    }
}
