using System.Reflection;

namespace MegaForm.Oqtane.Server.Data
{
    /// <summary>
    /// [OQ-difix20260418-08] Defensive normalization for NOT NULL string columns.
    ///
    /// Why this exists:
    ///   The MegaForm Oqtane migration (FormEntityBuilder, SubmissionEntityBuilder,
    ///   etc.) uses Oqtane's `AddStringColumn` / `AddMaxStringColumn` helpers, which
    ///   default to `nullable: false` (NOT NULL) per Oqtane convention.
    ///
    ///   Across the 10 MegaForm entities there are 34 NOT NULL string columns, e.g.:
    ///     MF_Forms       — Title, Description, SchemaJson, SettingsJson, ThemeJson,
    ///                      Status, SubmitButtonText, SuccessMessage, RedirectUrl,
    ///                      WebhookUrl, WebhookSecret, WebhookHeaders, NotifyEmails,
    ///                      NotifyTemplate, AutoresponderEmailField, AutoresponderSubject,
    ///                      AutoresponderBody, AppScope, RulesJson, WorkflowJson  (20 cols)
    ///     MF_Submissions — DataJson, IpAddress, UserAgent, Status                (4)
    ///     MF_Files       — FieldKey, OriginalName, StoredPath, ContentType       (4)
    ///     MF_SavedDrafts — ResumeToken, DataJson, Email, IpAddress               (4)
    ///     etc.
    ///
    ///   The Builder UI saves a brand-new form with most of these unset (null), so
    ///   `db.SaveChanges()` raises:
    ///     SQLite Error 19: 'NOT NULL constraint failed: MF_Forms.{column}'
    ///   The exception propagates to ExceptionMiddleware, which logs and silently
    ///   returns 200 + Content-Length: 0. UI shows no error, DB has no record.
    ///
    /// What this helper does:
    ///   Reflects over the entity's public string properties and replaces any null
    ///   value with `string.Empty`. This is safe because the migration declared
    ///   these columns NOT NULL — null was never a valid value at the DB level.
    ///
    /// How to use:
    ///   Call once on the entity instance immediately before db.SaveChanges():
    ///     NullStringNormalizer.Normalize(form);
    ///     db.SaveChanges();
    ///
    /// Future-proof:
    ///   No column lists are hardcoded. Adding a new property to any entity is
    ///   automatically covered.
    /// </summary>
    internal static class NullStringNormalizer
    {
        /// <summary>
        /// Set every public read/write string property on the entity to "" if it is
        /// currently null. Returns the entity for fluent chaining.
        /// </summary>
        public static T Normalize<T>(T entity) where T : class
        {
            if (entity == null) return entity;
            foreach (var prop in entity.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                if (prop.PropertyType != typeof(string)) continue;
                if (!prop.CanRead || !prop.CanWrite) continue;
                if (prop.GetIndexParameters().Length > 0) continue; // skip indexers
                if (prop.GetValue(entity) == null)
                    prop.SetValue(entity, string.Empty);
            }
            return entity;
        }
    }
}
