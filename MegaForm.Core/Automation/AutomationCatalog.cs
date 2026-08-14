/*
 * MegaForm.Core/Automation/AutomationCatalog.cs
 *
 * [Automation v2 20260813-01] The admin-owned catalog that every capability resolves names against.
 *
 * This is the artefact that makes automation reviewable. A site's catalog is the complete answer to
 * "what can any script on this site actually do" — every SQL statement, every outbound URL, every
 * command preset, in one place an administrator edits and a security reviewer can read. Scripts
 * become parameter suppliers.
 *
 * Stored server-side per site (a settings blob on DNN, site settings on Oqtane) and NEVER sent to a
 * browser unmasked: it holds bearer tokens and connection names. `Redacted()` is what the admin UI
 * gets back.
 *
 * ── Why not just let a script write the SQL ──────────────────────────────────────
 * v1 shipped `ctx.Db.Execute(connectionName, sql, params)`, which is already parameterised and
 * already limited to a registered connection. The named-action indirection adds three things that
 * matter once this is sold rather than demoed: the SQL is owned and reviewed by the person who owns
 * the database; a script exported to another site names actions that site may not define, so it
 * fails loudly instead of running something similar-but-wrong; and the catalog gives an admin a
 * kill switch per action without editing anybody's script.
 */

using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace MegaForm.Core.Automation
{
    /// <summary>What kind of result a named SQL action produces.</summary>
    public static class AutomationDbActionKinds
    {
        public const string Execute = "execute";   // INSERT / UPDATE / DELETE / proc → RowsAffected
        public const string Scalar  = "scalar";    // single value
        public const string Query   = "query";     // rows (capped)
    }

    public class NamedDbAction
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        /// <summary>A connection registered in Database Settings. Never a connection string.</summary>
        [JsonProperty("connectionName")]
        public string ConnectionName { get; set; }

        /// <summary>"execute" | "scalar" | "query".</summary>
        [JsonProperty("kind")]
        public string Kind { get; set; } = AutomationDbActionKinds.Execute;

        /// <summary>
        /// The statement, with @parameters. Authored by an administrator; a script never sees or
        /// changes it. A stored-procedure call is the preferred shape for anything multi-statement,
        /// because then the transaction boundary lives with the database.
        /// </summary>
        [JsonProperty("sql")]
        public string Sql { get; set; }

        /// <summary>
        /// Parameter names this action accepts. A script passing anything else is rejected before a
        /// command is built — so a typo is an error rather than a silently-null column.
        /// Empty = accept whatever the statement declares.
        /// </summary>
        [JsonProperty("parameters")]
        public List<string> Parameters { get; set; } = new List<string>();

        [JsonProperty("maxRows")]
        public int MaxRows { get; set; } = 500;

        [JsonProperty("timeoutSeconds")]
        public int TimeoutSeconds { get; set; } = 20;

        [JsonProperty("enabled")]
        public bool Enabled { get; set; } = true;

        [JsonProperty("description")]
        public string Description { get; set; }
    }

    public class NamedHttpEndpoint
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("url")]
        public string Url { get; set; }

        [JsonProperty("method")]
        public string Method { get; set; } = "POST";

        [JsonProperty("headers")]
        public Dictionary<string, string> Headers { get; set; } = new Dictionary<string, string>();

        /// <summary>"none" | "bearer" | "header" | "basic".</summary>
        [JsonProperty("authType")]
        public string AuthType { get; set; } = "none";

        /// <summary>
        /// The secret itself, held server-side. Masked by <see cref="AutomationCatalog.Redacted"/>
        /// before the catalog is ever shown to a browser, and never reachable from a script — a
        /// script names the endpoint and the value is attached on the way out.
        /// </summary>
        [JsonProperty("authValue")]
        public string AuthValue { get; set; }

        /// <summary>Header name for authType = "header" (e.g. X-Api-Key).</summary>
        [JsonProperty("authHeaderName")]
        public string AuthHeaderName { get; set; } = "X-Api-Key";

        [JsonProperty("timeoutSeconds")]
        public int TimeoutSeconds { get; set; } = 20;

        [JsonProperty("maxAttempts")]
        public int MaxAttempts { get; set; } = 1;

        [JsonProperty("retryDelaySeconds")]
        public int RetryDelaySeconds { get; set; } = 2;

        [JsonProperty("enabled")]
        public bool Enabled { get; set; } = true;

        [JsonProperty("description")]
        public string Description { get; set; }
    }

    public class NamedCommandPreset
    {
        [JsonProperty("name")]
        public string Name { get; set; }
        /// <summary>Absolute path to the executable. Fixed by the host; never composed by a script.</summary>
        [JsonProperty("executable")]
        public string Executable { get; set; }
        /// <summary>Argument template with {placeholders} filled from the script's named arguments.</summary>
        [JsonProperty("argumentTemplate")]
        public string ArgumentTemplate { get; set; }
        [JsonProperty("workingDirectory")]
        public string WorkingDirectory { get; set; }
        [JsonProperty("timeoutSeconds")]
        public int TimeoutSeconds { get; set; } = 60;
        [JsonProperty("enabled")]
        public bool Enabled { get; set; }          // off unless a host says otherwise
        [JsonProperty("description")]
        public string Description { get; set; }
    }

    public class NamedFolder
    {
        [JsonProperty("name")]
        public string Name { get; set; }
        /// <summary>Resolved server-side and confined to the portal's storage root.</summary>
        [JsonProperty("relativePath")]
        public string RelativePath { get; set; }
        [JsonProperty("enabled")]
        public bool Enabled { get; set; } = true;
    }

    public class NamedNotificationTemplate
    {
        [JsonProperty("name")]
        public string Name { get; set; }
        /// <summary>email | sms | zalo | telegram | another registered provider channel.</summary>
        [JsonProperty("channel")]
        public string Channel { get; set; } = "email";
        [JsonProperty("subject")]
        public string Subject { get; set; }
        [JsonProperty("body")]
        public string Body { get; set; }
        /// <summary>Named HTTP endpoint used for non-email channels; URL/token stay in the catalog.</summary>
        [JsonProperty("endpointName")]
        public string EndpointName { get; set; }
        [JsonProperty("enabled")]
        public bool Enabled { get; set; } = true;
        [JsonProperty("description")]
        public string Description { get; set; }
    }

    /// <summary>
    /// Identity is separately gated because user creation and role assignment alter access to the
    /// host. Role names supplied by a script must be members of this server-owned allow-list.
    /// </summary>
    public class AutomationIdentityPolicy
    {
        [JsonProperty("enabled")]
        public bool Enabled { get; set; }
        [JsonProperty("allowUserCreation")]
        public bool AllowUserCreation { get; set; }
        [JsonProperty("allowedRoles")]
        public List<string> AllowedRoles { get; set; } = new List<string>();
    }

    /// <summary>The whole per-site catalog.</summary>
    public class AutomationCatalog
    {
        public const string SettingKey = "MegaForm_AutomationCatalog";
        public const string MaskedValue = "***";

        [JsonProperty("dbActions")]
        public List<NamedDbAction> DbActions { get; set; } = new List<NamedDbAction>();

        [JsonProperty("endpoints")]
        public List<NamedHttpEndpoint> Endpoints { get; set; } = new List<NamedHttpEndpoint>();

        [JsonProperty("commandPresets")]
        public List<NamedCommandPreset> CommandPresets { get; set; } = new List<NamedCommandPreset>();

        [JsonProperty("folders")]
        public List<NamedFolder> Folders { get; set; } = new List<NamedFolder>();

        [JsonProperty("notificationTemplates")]
        public List<NamedNotificationTemplate> NotificationTemplates { get; set; } = new List<NamedNotificationTemplate>();

        [JsonProperty("identity")]
        public AutomationIdentityPolicy Identity { get; set; } = new AutomationIdentityPolicy();

        public static AutomationCatalog Parse(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new AutomationCatalog();
            try { return JsonConvert.DeserializeObject<AutomationCatalog>(json) ?? new AutomationCatalog(); }
            catch { return new AutomationCatalog(); }
        }

        public NamedDbAction FindDbAction(string name)
        {
            if (string.IsNullOrWhiteSpace(name) || DbActions == null) return null;
            foreach (var a in DbActions)
                if (a != null && string.Equals(a.Name, name.Trim(), StringComparison.OrdinalIgnoreCase))
                    return a;
            return null;
        }

        public NamedHttpEndpoint FindEndpoint(string name)
        {
            if (string.IsNullOrWhiteSpace(name) || Endpoints == null) return null;
            foreach (var e in Endpoints)
                if (e != null && string.Equals(e.Name, name.Trim(), StringComparison.OrdinalIgnoreCase))
                    return e;
            return null;
        }

        public NamedCommandPreset FindCommandPreset(string name)
        {
            if (string.IsNullOrWhiteSpace(name) || CommandPresets == null) return null;
            foreach (var p in CommandPresets)
                if (p != null && string.Equals(p.Name, name.Trim(), StringComparison.OrdinalIgnoreCase))
                    return p;
            return null;
        }

        public NamedNotificationTemplate FindNotificationTemplate(string name, string channel)
        {
            if (string.IsNullOrWhiteSpace(name) || NotificationTemplates == null) return null;
            foreach (var template in NotificationTemplates)
            {
                if (template != null && template.Enabled &&
                    string.Equals(template.Name, name.Trim(), StringComparison.OrdinalIgnoreCase) &&
                    (string.IsNullOrWhiteSpace(channel) ||
                     string.Equals(template.Channel, channel.Trim(), StringComparison.OrdinalIgnoreCase)))
                    return template;
            }
            return null;
        }

        /// <summary>
        /// A copy safe to send to a browser: every secret replaced by "***". The admin UI sends the
        /// mask back unchanged when a value was not edited, and the save path restores the stored
        /// value — the same contract the cloud-storage connection editor uses.
        /// </summary>
        public AutomationCatalog Redacted()
        {
            var copy = Parse(JsonConvert.SerializeObject(this));
            foreach (var e in copy.Endpoints)
                if (!string.IsNullOrEmpty(e.AuthValue)) e.AuthValue = MaskedValue;
            return copy;
        }
    }

    /// <summary>
    /// Where a capability gets the catalog from. One method rather than a fat interface, because
    /// every host stores it the same way: a per-site settings blob it already knows how to read.
    /// </summary>
    public interface IAutomationCatalogProvider
    {
        AutomationCatalog GetCatalog();
    }

    /// <summary>Adapter for hosts that already have a "read this site setting" delegate.</summary>
    public sealed class DelegateAutomationCatalogProvider : IAutomationCatalogProvider
    {
        private readonly Func<string> _readJson;
        public DelegateAutomationCatalogProvider(Func<string> readJson) { _readJson = readJson; }

        public AutomationCatalog GetCatalog()
        {
            try { return AutomationCatalog.Parse(_readJson == null ? null : _readJson()); }
            catch { return new AutomationCatalog(); }
        }
    }
}
