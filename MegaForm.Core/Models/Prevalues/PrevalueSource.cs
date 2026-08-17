using System;
using Newtonsoft.Json;

namespace MegaForm.Core.Models.Prevalues
{
    /// <summary>
    /// Shared catalog of reusable option sources for choice fields.
    /// Stored server-side (not inside FormInfo.SchemaJson) so one edit updates every form that uses it.
    /// </summary>
    public class PrevalueSource
    {
        public int Id { get; set; }

        public string Name { get; set; }

        /// <summary>textfile | sql | umbracoDocuments | umbracoDataType</summary>
        public string Type { get; set; }

        /// <summary>
        /// Provider-specific settings. Secrets (connection strings, file paths) are stored here
        /// server-side and stripped before the object is returned to the browser.
        /// </summary>
        public string SettingsJson { get; set; }

        /// <summary>Minutes to cache resolved options. 0 = no cache.</summary>
        public int CacheMinutes { get; set; }

        public string Culture { get; set; }

        public DateTime CreatedOnUtc { get; set; }

        public DateTime UpdatedOnUtc { get; set; }

        public T ReadSettings<T>() where T : class, new()
        {
            if (string.IsNullOrWhiteSpace(SettingsJson)) return new T();
            try { return JsonConvert.DeserializeObject<T>(SettingsJson) ?? new T(); }
            catch { return new T(); }
        }

        public void WriteSettings<T>(T value) where T : class
        {
            SettingsJson = value == null ? null : JsonConvert.SerializeObject(value);
        }
    }

    /// <summary>
    /// One option resolved from a PrevalueSource.
    /// </summary>
    public class PrevalueOption
    {
        public string Value { get; set; }
        public string Label { get; set; }
        public bool Disabled { get; set; }
    }
}
