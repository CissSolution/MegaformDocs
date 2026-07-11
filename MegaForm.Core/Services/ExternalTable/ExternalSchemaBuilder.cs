using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Models.ExternalTable;

namespace MegaForm.Core.Services.ExternalTable
{
    /// <summary>
    /// [ATBE P1] Builds the FALLBACK form schema for a bound table — one field per usable column,
    /// straight from the capability profile.
    ///
    /// This is the deterministic baseline, and it is also the safety net for P2: when the AI designer
    /// produces something the validator rejects three times, the admin still gets this. It is never
    /// pretty, but it is always correct — every field maps to a real column, required matches the
    /// database, and no generated key, computed column or rowversion is ever shown to a user.
    /// </summary>
    public static class ExternalSchemaBuilder
    {
        public static FormSchema Build(CapabilityProfile p)
        {
            var schema = new FormSchema();
            foreach (var c in p.Columns)
            {
                if (!IsAuthorable(c)) continue;

                schema.Fields.Add(new FormField
                {
                    Key = c.Name,
                    Type = c.DefaultWidget ?? "Text",
                    Label = Humanize(c.Name),
                    Required = c.Required,
                    Options = OptionsFor(c),
                });
            }
            return schema;
        }

        /// <summary>Columns a human can fill in. Everything the database writes for itself — identity,
        /// computed, rowversion, function defaults it fills anyway — stays out, as do the audit columns
        /// the server fills from the actor.</summary>
        private static bool IsAuthorable(ColumnFacts c)
        {
            if (c.Unsupported || c.IsEncrypted) return false;
            if (c.IsIdentity || c.IsComputed || c.IsRowVersion) return false;
            if (c.IsPrimaryKey && (c.IsIdentity || c.HasDefault)) return false;
            if (!string.IsNullOrEmpty(c.ServerFill)) return false;
            if (c.UiType == "hidden" || c.UiType == "readonly") return false;
            return true;
        }

        private static List<MegaForm.Core.Models.FieldOption> OptionsFor(ColumnFacts c)
        {
            if (c.Enum == null || c.Enum.Values == null || c.Enum.Values.Count == 0) return null;
            return c.Enum.Values
                .Select(v => new MegaForm.Core.Models.FieldOption { Value = v, Label = v })
                .ToList();
        }

        /// <summary>CustomerEmail → "Customer email". A label the AI will improve in P2, but never a
        /// label that misrepresents the column.</summary>
        public static string Humanize(string name)
        {
            if (string.IsNullOrEmpty(name)) return name;
            var chars = new List<char>();
            for (int i = 0; i < name.Length; i++)
            {
                var ch = name[i];
                if (ch == '_' || ch == '-') { chars.Add(' '); continue; }
                if (i > 0 && char.IsUpper(ch) && !char.IsUpper(name[i - 1])) chars.Add(' ');
                chars.Add(ch);
            }
            var s = new string(chars.ToArray()).Trim();
            if (s.Length == 0) return name;
            return char.ToUpperInvariant(s[0]) + s.Substring(1).ToLowerInvariant();
        }
    }
}
