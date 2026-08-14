/*
 * MegaForm.Core/Automation/IAutomationCapabilities.cs
 *
 * [Automation v2 20260813-01] The capability surface a MegaForm automation script may reach.
 *
 * ── The one rule this file exists to encode ──────────────────────────────────────
 * A script NEVER holds a resource. It holds a NAME, and MegaForm resolves the name against a
 * catalog an administrator maintains server-side. `ctx.Db.ExecuteNamedActionAsync("crm-insert-lead", …)`
 * rather than a connection string and a SQL statement; `ctx.Http.PostJsonAsync("hubspot-lead", …)`
 * rather than a URL and a bearer token.
 *
 * That single indirection is what buys every property the product needs to sell this:
 *
 *   - no secret in a script, so a script is safe to export, diff, review and store in git;
 *   - rotating a credential is one edit in one place, not a hunt through every form;
 *   - the SQL and the URL are reviewable artefacts owned by an admin, not free text a script
 *     assembles at runtime, so "what can this form touch" has an answer you can read;
 *   - and a script that arrives with an imported template names actions that do not exist on the
 *     importing site, so it fails loudly instead of reaching something.
 *
 * Every call is recorded (MF_AutomationCapabilityCalls) with its duration and outcome, which is the
 * other half of making this operable: after an incident you can answer what ran, in what order, and
 * what it touched.
 *
 * ── Async by design ──────────────────────────────────────────────────────────────
 * Capabilities are Task-returning. Automation talks to networks and databases; a synchronous facade
 * over that is a thread-pool starvation bug waiting for its first busy day. The v1 sync surface
 * (ctx.Log / SetVariable / GetString) stays sync because it touches nothing.
 */

using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;

namespace MegaForm.Core.Automation
{
    // ─────────────────────────────────────────────────────────────────────────────
    //  Shared results
    // ─────────────────────────────────────────────────────────────────────────────

    public sealed class AutomationHttpResult
    {
        /// <summary>HTTP status, or 0 when the request never left (blocked, DNS, timeout).</summary>
        public int Status { get; set; }
        public bool Ok { get { return Status >= 200 && Status < 300; } }
        public string Body { get; set; }
        /// <summary>Set only when no HTTP response was obtained.</summary>
        public string Error { get; set; }
        public long DurationMs { get; set; }
        public int Attempts { get; set; }
    }

    /// <summary>One row, keyed by column name, case-insensitive.</summary>
    public sealed class AutomationRow : Dictionary<string, object>
    {
        public AutomationRow() : base(StringComparer.OrdinalIgnoreCase) { }

        public string Str(string column)
        {
            object v;
            return TryGetValue(column, out v) && v != null
                ? Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture)
                : null;
        }

        public decimal Num(string column, decimal fallback = 0m)
        {
            object v;
            if (!TryGetValue(column, out v) || v == null) return fallback;
            try { return Convert.ToDecimal(v, System.Globalization.CultureInfo.InvariantCulture); }
            catch { return fallback; }
        }

        public DateTime? Date(string column)
        {
            object v;
            if (!TryGetValue(column, out v) || v == null) return null;
            try { return Convert.ToDateTime(v, System.Globalization.CultureInfo.InvariantCulture); }
            catch { return null; }
        }
    }

    public sealed class AutomationDbResult
    {
        public int RowsAffected { get; set; }
        public object ScalarValue { get; set; }
        public IList<AutomationRow> Rows { get; set; } = new List<AutomationRow>();
        public long DurationMs { get; set; }

        /// <summary>First row, or null — the common shape after an INSERT … OUTPUT.</summary>
        public AutomationRow First { get { return Rows != null && Rows.Count > 0 ? Rows[0] : null; } }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  Capabilities
    // ─────────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Named SQL actions. The statement and the connection live in the site's automation catalog;
    /// the script supplies parameters only.
    ///
    /// Multi-statement work belongs in ONE named action (a stored procedure, or a batch wrapped in
    /// BEGIN TRAN), so the transaction boundary is authored by whoever owns the database rather than
    /// assembled by a script that might return early between two writes.
    /// </summary>
    public interface IAutomationDbCapability
    {
        Task<AutomationDbResult> ExecuteNamedActionAsync(
            string actionName, object parameters = null, CancellationToken ct = default(CancellationToken));

        /// <summary>Action names this site defines, so a script can fail with a useful message.</summary>
        IList<string> ActionNames();
    }

    /// <summary>
    /// Named HTTP endpoints. The URL, method, headers, auth and retry policy live in the catalog;
    /// the script supplies the payload. Every resolved URL still passes SsrfGuard — the catalog is
    /// an admin's intent, not a licence to reach a loopback address.
    /// </summary>
    public interface IAutomationHttpCapability
    {
        Task<AutomationHttpResult> PostJsonAsync(
            string endpointName, object payload, CancellationToken ct = default(CancellationToken));

        Task<AutomationHttpResult> SendAsync(
            string endpointName, string body, string contentType = null,
            IDictionary<string, string> extraHeaders = null,
            CancellationToken ct = default(CancellationToken));

        IList<string> EndpointNames();
    }

    /// <summary>
    /// Email / SMS / Zalo / Telegram through providers configured on the site. A script names a
    /// template and a recipient; it never holds an SMTP password or a bot token.
    /// </summary>
    public interface IAutomationNotifyCapability
    {
        Task EmailAsync(string templateName, string to, object model,
                        CancellationToken ct = default(CancellationToken));
        Task SmsAsync(string templateName, string toPhone, object model,
                      CancellationToken ct = default(CancellationToken));
        /// <summary>channel = "zalo" | "telegram" | any provider the site registered.</summary>
        Task PushAsync(string channel, string templateName, string to, object model,
                       CancellationToken ct = default(CancellationToken));
    }

    public sealed class AutomationUserResult
    {
        public bool Created { get; set; }
        public int UserId { get; set; }
        public string UserName { get; set; }
        public string Error { get; set; }
    }

    /// <summary>
    /// User provisioning through the host's own membership layer. Deliberately NOT
    /// DotNetNuke.Entities.Users.UserController: a script that talks to the platform directly is a
    /// script that only works on one platform and that no audit trail describes.
    /// </summary>
    public interface IAutomationIdentityCapability
    {
        Task<AutomationUserResult> CreateUserAsync(
            string email, string userName = null, IEnumerable<string> roles = null,
            CancellationToken ct = default(CancellationToken));

        Task AddRoleAsync(int userId, string roleName,
                          CancellationToken ct = default(CancellationToken));

        Task<int> FindUserIdByEmailAsync(string email,
                                         CancellationToken ct = default(CancellationToken));
    }

    public sealed class AutomationDocumentResult
    {
        public string FileName { get; set; }
        /// <summary>A tokenised URL, not a filesystem path — see IAutomationFileCapability.</summary>
        public string DownloadUrl { get; set; }
        public long SizeBytes { get; set; }
    }

    /// <summary>
    /// PDF / Word / Excel from a template registered on the site, written into secure storage and
    /// returned as a download token. A script never picks the output path.
    /// </summary>
    public interface IAutomationDocumentCapability
    {
        Task<AutomationDocumentResult> CreatePdfAsync(
            string templateName, object model, CancellationToken ct = default(CancellationToken));
        Task<AutomationDocumentResult> CreateFromTemplateAsync(
            string templateName, string format, object model,
            CancellationToken ct = default(CancellationToken));
    }

    /// <summary>
    /// Moving an uploaded file into a named, pre-configured folder. Folder names are catalog
    /// entries; a script cannot express a path, so it cannot express `..`.
    /// </summary>
    public interface IAutomationFileCapability
    {
        Task<AutomationDocumentResult> MoveUploadAsync(
            string fieldKey, string targetFolderName, CancellationToken ct = default(CancellationToken));
        IList<string> FolderNames();
    }

    /// <summary>Publish an event to a broker the site configured (RabbitMQ / Kafka / SQS).</summary>
    public interface IAutomationQueueCapability
    {
        Task PublishAsync(string topicName, object payload,
                          CancellationToken ct = default(CancellationToken));
        IList<string> TopicNames();
    }

    public sealed class AutomationJobResult
    {
        public int ExitCode { get; set; }
        public string Output { get; set; }
        public bool TimedOut { get; set; }
        public long DurationMs { get; set; }
    }

    /// <summary>
    /// Run a host-approved command PRESET. Not a command line: a preset name plus named arguments.
    /// The executable, working directory, timeout and the account it runs as are all fixed by the
    /// host — a script chooses which approved thing runs, never what runs.
    /// </summary>
    public interface IAutomationJobCapability
    {
        Task<AutomationJobResult> RunCommandPresetAsync(
            string presetName, object arguments = null,
            CancellationToken ct = default(CancellationToken));
        IList<string> PresetNames();
    }

    /// <summary>
    /// Host services from which MegaForm builds audited capabilities for one script run. The
    /// factory is resolved per run so scoped platform services are never captured by the singleton
    /// script compiler/cache service.
    /// </summary>
    public sealed class AutomationCapabilityServices
    {
        public IEmailSender EmailSender { get; set; }
        public IWorkflowIdentityProvisioningService IdentityProvisioning { get; set; }
        public IWorkflowPrincipalResolver PrincipalResolver { get; set; }

        public IAutomationDocumentCapability Documents { get; set; }
        public IAutomationFileCapability Files { get; set; }
        public IAutomationQueueCapability Queue { get; set; }
        public IAutomationJobCapability Jobs { get; set; }
    }

    /// <summary>
    /// Durable AsyncWorker request. It deliberately contains no source or approval fields: the
    /// worker must reload the form and re-check the current site approval before executing.
    /// </summary>
    public sealed class AutomationExecutionRequest
    {
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public int PortalId { get; set; }
        public int UserId { get; set; }
        public string UserName { get; set; }
        public string UserEmail { get; set; }
        public string IpAddress { get; set; }
        public DateTime EnqueuedAtUtc { get; set; }
    }

    /// <summary>Host-owned durable outbox for AutomationStage.AsyncWorker.</summary>
    public interface IAutomationExecutionQueue
    {
        string Enqueue(AutomationExecutionRequest request);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  Response — what the visitor sees
    // ─────────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// A script's influence over the reply. Set from any stage; the last stage to write wins.
    /// Everything here is shown to an anonymous visitor, so it must never carry an internal message
    /// — that is what ctx.Log and the run record are for.
    /// </summary>
    public sealed class AutomationResponse
    {
        public string SuccessMessage { get; set; }
        public string RedirectUrl { get; set; }

        /// <summary>Extra values echoed back to the caller, for a custom thank-you page.</summary>
        public IDictionary<string, object> CustomData { get; }
            = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        public bool HasAnything
        {
            get
            {
                return !string.IsNullOrWhiteSpace(SuccessMessage)
                    || !string.IsNullOrWhiteSpace(RedirectUrl)
                    || CustomData.Count > 0;
            }
        }
    }

    /// <summary>
    /// Where in the submission pipeline a script runs. Each stage has different powers because each
    /// one sits at a different point relative to the database commit.
    /// </summary>
    public enum AutomationStage
    {
        /// <summary>
        /// Before validation completes. Blacklist / fraud / external validation. May abort with a
        /// message the visitor sees as a validation failure. Nothing has been written.
        /// </summary>
        PreValidate = 0,

        /// <summary>
        /// Inside the submit transaction, before the row is written. Normalise, encrypt, derive.
        /// May abort — and an abort here genuinely rolls back, which is the property no post-commit
        /// stage can ever offer.
        /// </summary>
        PreInsert = 1,

        /// <summary>
        /// After the row is committed. Email, webhook, user provisioning, document generation.
        /// Cannot undo the submission; failures are recorded and the visitor still gets a reply.
        /// </summary>
        PostCommit = 2,

        /// <summary>
        /// Out of band, off a queue. Heavy documents, CRM sync, command presets — anything whose
        /// duration should not be on a visitor's thank-you page.
        /// </summary>
        AsyncWorker = 3,
    }
}
