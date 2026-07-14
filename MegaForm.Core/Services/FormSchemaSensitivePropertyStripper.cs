using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Removes server-only configuration from a form schema before it is handed to a non-admin
    /// browser. <see cref="FormSchemaVisibilityFilter"/> decides which FIELDS an actor may see;
    /// this decides which PROPERTIES never belong in a client payload at all.
    ///
    /// The public render page rebuilds the whole form from GET Schema/{formId}, an anonymous
    /// endpoint. A SQL-backed dropdown resolves its options server-side by (formId, fieldKey) in
    /// <see cref="FieldOptionsService"/>, and the after-submit database insert runs server-side in
    /// <see cref="FormDatabaseInsertService"/> — so the query text, the connection alias and the
    /// INSERT statement are read from the STORED schema, never echoed from the request. The renderer
    /// sends only formId + fieldKey and reads nothing here except optionsSource/optionsDependsOn
    /// (see megaform renderer index.ts hydrateSqlOptions), so removing these changes nothing a
    /// visitor can see while withholding the real table/column names and SQL an injection probe wants.
    ///
    /// SCOPE — deliberately NOT stripped here: SQL that the RUNTIME client still consumes, i.e.
    /// widgetProps.masterQuery / widgetProps.razorSource for the Razor + DataRepeater widgets
    /// (megaform-widget-razor.ts:309 gates the SQL pre-fetch on masterQuery being non-empty, :266
    /// posts razorSource to the server to compile). Blanking those blank-renders the widget. Closing
    /// that surface needs the widgets to fetch by (formId, widgetKey) first — tracked as a follow-up.
    /// This pass touches only field.properties.* and schema.settings.*, never widgetProps.
    ///
    /// Works on the raw JObject, casing-tolerant, so mirrored (camel + Pascal) keys are both removed
    /// and everything untouched comes out byte-identical.
    ///
    /// Accepts EITHER a full schema ({fields, settings, ...}) OR a bare settings blob — the render
    /// response ships the form's settings a SECOND time as a separate SettingsJson string that never
    /// passes through the schema projection, and it carries the same databaseInsert / lifecycle SQL.
    /// The server-only settings keys are therefore removed from the root object too, so one call
    /// cleans both shapes.
    /// </summary>
    public static class FormSchemaSensitivePropertyStripper
    {
        // field.properties keys that configure server-side option resolution. FieldOptionsService
        // reads them from the stored schema by (formId, fieldKey); the client never sends or reads them.
        private static readonly HashSet<string> OptionsResolutionKeys =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "optionsSql", "optionsConnectionKey", "optionsType", "optionsDatabaseType"
            };

        // schema.settings blocks executed only server-side at submit time (FormDatabaseInsertService,
        // LifecycleRunner). The whole block — SQL, connection alias, parameter map — is server-only.
        private static readonly HashSet<string> ServerOnlySettingsKeys =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "databaseInsert", "lifecycle"
            };

        // Cheap gate: if none of these substrings is present there is nothing to strip, so the caller
        // gets its exact string back — no parse, no allocation, byte-identical output.
        private static readonly string[] Markers =
        {
            "optionsSql", "optionsConnectionKey", "optionsType",
            "optionsDatabaseType", "databaseInsert", "lifecycle"
        };

        public static string Strip(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson))
                return schemaJson;

            if (!ContainsAnyMarker(schemaJson))
                return schemaJson;

            JObject schema;
            try
            {
                schema = JObject.Parse(schemaJson);
            }
            catch
            {
                // Unreadable schema: leave it. The visibility filter that ran first already fails
                // CLOSED (substitutes an empty form) for schemas it cannot parse, so nothing sensitive
                // reaches here in an unparseable string.
                return schemaJson;
            }

            var changed = false;

            // Root: no-op for a full schema (databaseInsert/lifecycle live under settings there), but
            // this is what cleans a bare SettingsJson blob whose root IS the settings object.
            changed |= RemoveKeys(schema, ServerOnlySettingsKeys);

            foreach (var settings in ChildObjects(schema, "settings", "Settings"))
                changed |= RemoveKeys(settings, ServerOnlySettingsKeys);

            foreach (var fields in FieldArrays(schema))
                changed |= StripFieldArray(fields);

            return changed ? schema.ToString(Formatting.None) : schemaJson;
        }

        private static bool StripFieldArray(JArray fields)
        {
            if (fields == null)
                return false;

            var changed = false;
            foreach (var field in fields.OfType<JObject>())
            {
                foreach (var props in ChildObjects(field, "properties", "Properties"))
                    changed |= RemoveKeys(props, OptionsResolutionKeys);

                // Fields nested inside Row columns carry their own options config.
                foreach (var column in Columns(field))
                    foreach (var nested in FieldArrays(column))
                        changed |= StripFieldArray(nested);
            }
            return changed;
        }

        private static bool RemoveKeys(JObject node, HashSet<string> keys)
        {
            if (node == null)
                return false;

            // Collect first: removing while enumerating Properties() throws.
            var doomed = node.Properties()
                .Where(p => keys.Contains(p.Name))
                .Select(p => p.Name)
                .ToList();

            foreach (var name in doomed)
                node.Remove(name);

            return doomed.Count > 0;
        }

        private static IEnumerable<JObject> ChildObjects(JObject node, string camel, string pascal)
        {
            var c = node[camel] as JObject;
            if (c != null)
                yield return c;

            var p = node[pascal] as JObject;
            if (p != null && !ReferenceEquals(p, c))
                yield return p;
        }

        // RenderModelResolver mirrors casing, so a live form can carry BOTH "fields" and "Fields"
        // holding the same fields as separate JObjects. Both must be stripped.
        private static IEnumerable<JArray> FieldArrays(JObject node)
        {
            var camel = node["fields"] as JArray;
            if (camel != null)
                yield return camel;

            var pascal = node["Fields"] as JArray;
            if (pascal != null && !ReferenceEquals(pascal, camel))
                yield return pascal;
        }

        private static IEnumerable<JObject> Columns(JObject field)
        {
            var columns = field["columns"] as JArray ?? field["Columns"] as JArray;
            if (columns == null)
                yield break;

            foreach (var column in columns.OfType<JObject>())
                yield return column;
        }

        private static bool ContainsAnyMarker(string json)
        {
            for (var i = 0; i < Markers.Length; i++)
                if (json.IndexOf(Markers[i], StringComparison.OrdinalIgnoreCase) >= 0)
                    return true;
            return false;
        }
    }
}
