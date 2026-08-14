/*
 * MegaForm.Core/Services/AfterSubmitScriptStore.cs
 *
 * [AfterSubmitScript v20260813-01] Reading and writing the script block on a stored form,
 * at the JSON level, shared by every platform.
 *
 * ── Why this is not just `schema.Settings.AfterSubmitScript = x` ────────────────
 * A form's settings live in TWO columns and they are not equal partners:
 * MF_Forms.SchemaJson carries settings inside the schema, MF_Forms.SettingsJson carries
 * a second copy, and RenderModelResolver.OverlaySavedSettings applies SettingsJson ON TOP
 * of the schema's copy at read time. Writing only the schema copy therefore produces a
 * block that is silently overridden the moment SettingsJson happens to carry the same key
 * — the same shape of bug that made SettingsJson override SchemaJson before, and the
 * reason both are written here.
 *
 * Everything is done on JObject rather than by round-tripping through FormSettings,
 * because FormSettings is a strict POCO with no JsonExtensionData: deserialising and
 * re-serialising a form's settings DROPS every key that is not a declared property. That
 * has already cost this codebase one silent data loss (settings keys vanishing on builder
 * Save). Touching one property and leaving the rest of the document byte-identical is the
 * only safe way to edit a settings blob in place.
 */

using System;
using MegaForm.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    public static class AfterSubmitScriptStore
    {
        public const string Badge = "AfterSubmitScriptStore v20260813-01";
        public const string PropertyName = "afterSubmitScript";

        private static readonly JsonSerializerSettings SerializerSettings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore
        };

        /// <summary>
        /// The block as the runtime will see it: SettingsJson wins over the schema's copy,
        /// exactly as RenderModelResolver resolves them.
        /// </summary>
        public static FormAfterSubmitScriptSettings Read(string schemaJson, string settingsJson)
        {
            var fromSettings = ReadFromSettingsBlob(settingsJson);
            if (fromSettings != null) return fromSettings;
            return ReadFromSchema(schemaJson);
        }

        /// <summary>
        /// Put <paramref name="block"/> into both copies. Pass null to remove it.
        /// Returns the two JSON strings to persist; anything this function does not
        /// understand is returned untouched.
        /// </summary>
        public static void Write(
            string schemaJson, string settingsJson,
            FormAfterSubmitScriptSettings block,
            out string newSchemaJson, out string newSettingsJson)
        {
            newSchemaJson = WriteIntoSchema(schemaJson, block);
            newSettingsJson = WriteIntoSettingsBlob(settingsJson, block);
        }

        /// <summary>
        /// Called by the ordinary form-save path on every platform.
        ///
        /// Takes the payload a caller posted and returns it with the script block replaced
        /// by whatever the server already had. A save therefore cannot introduce a script,
        /// change one, or turn one off, no matter what it posts — which is what makes the
        /// host-only endpoint the single way in, rather than merely the intended way in.
        /// </summary>
        public static void PreserveOnSave(
            string incomingSchemaJson, string incomingSettingsJson,
            string storedSchemaJson, string storedSettingsJson,
            out string newSchemaJson, out string newSettingsJson)
        {
            var stored = Read(storedSchemaJson, storedSettingsJson);
            Write(incomingSchemaJson, incomingSettingsJson, stored, out newSchemaJson, out newSettingsJson);
        }

        /// <summary>
        /// One-line form of <see cref="PreserveOnSave(string,string,string,string,out string,out string)"/>
        /// for the four platforms' form-save endpoints. Pass the FormInfo about to be persisted and
        /// the row currently in the database (null for a new form — a new form then simply loses any
        /// script block it arrived with, which is the import/template path).
        /// </summary>
        public static void PreserveOnSave(FormInfo incoming, FormInfo stored)
        {
            if (incoming == null) return;
            string schemaJson, settingsJson;
            PreserveOnSave(
                incoming.SchemaJson, incoming.SettingsJson,
                stored == null ? null : stored.SchemaJson,
                stored == null ? null : stored.SettingsJson,
                out schemaJson, out settingsJson);
            incoming.SchemaJson = schemaJson;
            incoming.SettingsJson = settingsJson;
        }

        // ─── schema copy ──────────────────────────────────────────────────────────

        private static FormAfterSubmitScriptSettings ReadFromSchema(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson)) return null;
            if (schemaJson.IndexOf(PropertyName, StringComparison.OrdinalIgnoreCase) < 0) return null;
            try
            {
                var schema = JObject.Parse(schemaJson);
                var settings = FindSettings(schema, create: false);
                return settings == null ? null : ToBlock(settings[PropertyName]);
            }
            catch { return null; }
        }

        private static string WriteIntoSchema(string schemaJson, FormAfterSubmitScriptSettings block)
        {
            if (string.IsNullOrWhiteSpace(schemaJson)) return schemaJson;
            try
            {
                var schema = JObject.Parse(schemaJson);
                var changed = false;

                // Both casings are live: RenderModelResolver writes "settings" and mirrors a
                // clone into "Settings". Updating only one leaves the other holding a stale
                // block, and which one wins depends on which reader ran — so update every
                // casing that is actually present.
                var lower = schema["settings"] as JObject;
                var upper = schema["Settings"] as JObject;

                if (lower == null && upper == null)
                {
                    if (block == null) return schemaJson;   // nothing to remove, nothing to add
                    lower = FindSettings(schema, create: true);
                }

                if (lower != null) changed |= ApplyTo(lower, block);
                if (upper != null) changed |= ApplyTo(upper, block);

                return changed ? schema.ToString(Formatting.None) : schemaJson;
            }
            catch { return schemaJson; }
        }

        // ─── settings blob copy ───────────────────────────────────────────────────

        private static FormAfterSubmitScriptSettings ReadFromSettingsBlob(string settingsJson)
        {
            if (string.IsNullOrWhiteSpace(settingsJson)) return null;
            if (settingsJson.IndexOf(PropertyName, StringComparison.OrdinalIgnoreCase) < 0) return null;
            try
            {
                var settings = JObject.Parse(settingsJson);
                return ToBlock(settings[PropertyName]);
            }
            catch { return null; }
        }

        private static string WriteIntoSettingsBlob(string settingsJson, FormAfterSubmitScriptSettings block)
        {
            // A form whose SettingsJson is empty keeps it empty: the schema copy is then the
            // only copy and the overlay has nothing to override it with.
            if (string.IsNullOrWhiteSpace(settingsJson))
            {
                if (block == null) return settingsJson;
                var created = new JObject();
                ApplyTo(created, block);
                return created.ToString(Formatting.None);
            }

            try
            {
                var settings = JObject.Parse(settingsJson);
                var changed = ApplyTo(settings, block);
                return changed ? settings.ToString(Formatting.None) : settingsJson;
            }
            catch { return settingsJson; }
        }

        // ─── shared ───────────────────────────────────────────────────────────────

        private static bool ApplyTo(JObject settings, FormAfterSubmitScriptSettings block)
        {
            var had = settings.Property(PropertyName) != null;

            if (block == null)
            {
                if (!had) return false;
                settings.Remove(PropertyName);
                return true;
            }

            settings[PropertyName] = JObject.FromObject(block,
                JsonSerializer.Create(SerializerSettings));
            return true;
        }

        private static FormAfterSubmitScriptSettings ToBlock(JToken token)
        {
            var obj = token as JObject;
            if (obj == null) return null;
            try { return obj.ToObject<FormAfterSubmitScriptSettings>(); }
            catch { return null; }
        }

        private static JObject FindSettings(JObject schema, bool create)
        {
            var settings = schema["settings"] as JObject;
            if (settings != null) return settings;
            settings = schema["Settings"] as JObject;
            if (settings != null) return settings;
            if (!create) return null;
            var created = new JObject();
            schema["settings"] = created;
            return created;
        }
    }
}
