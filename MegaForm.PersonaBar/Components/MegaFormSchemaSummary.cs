// [PersonaBar v20260731-01] Field counting for the Persona Bar list.
//
// Deliberately mirrors FormView.ascx.cs CountFields/CountFieldsRecursive so the number in
// the Persona Bar matches the number on the in-page Admin Dashboard for the same form.
// Rows/Sections/Html are containers, not fields, so they are not counted; a Row's fields
// are counted through its columns.

using System;
using Newtonsoft.Json.Linq;

namespace MegaForm.PersonaBar.Components
{
    internal static class MegaFormSchemaSummary
    {
        public static int CountFields(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson)) return 0;
            try
            {
                var token = JToken.Parse(schemaJson);

                var fields = token["fields"] ?? token["Fields"];
                var fieldsArray = fields as JArray;
                if (fieldsArray != null) return CountRecursive(fieldsArray);

                var pages = token["pages"] ?? token["Pages"];
                var pagesArray = pages as JArray;
                if (pagesArray != null)
                {
                    var total = 0;
                    foreach (var page in pagesArray)
                    {
                        var pageFields = (page == null ? null : (page["fields"] ?? page["Fields"])) as JArray;
                        if (pageFields != null) total += CountRecursive(pageFields);
                    }
                    return total;
                }
            }
            catch
            {
                // A form whose schema will not parse still deserves a row in the list;
                // it simply reports zero fields.
            }

            return 0;
        }

        private static int CountRecursive(JArray array)
        {
            var total = 0;
            foreach (var item in array)
            {
                var type = (string)(item == null ? null : (item["type"] ?? item["Type"])) ?? string.Empty;

                if (string.Equals(type, "Row", StringComparison.OrdinalIgnoreCase))
                {
                    var columns = (item["columns"] ?? item["Columns"]) as JArray;
                    if (columns != null)
                    {
                        foreach (var column in columns)
                        {
                            var child = (column == null ? null : (column["fields"] ?? column["Fields"])) as JArray;
                            if (child != null) total += CountRecursive(child);
                        }
                    }
                    continue;
                }

                if (string.Equals(type, "Section", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(type, "Html", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                total++;
            }

            return total;
        }
    }
}
