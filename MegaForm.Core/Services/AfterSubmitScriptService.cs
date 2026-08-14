/*
 * MegaForm.Core/Services/AfterSubmitScriptService.cs
 *
 * [AfterSubmitScript v20260813-01] Runs the per-form C# hook after a submission is
 * committed, and compiles it when an author saves it.
 *
 * ── Where the cost is paid ───────────────────────────────────────────────────────
 * Roslyn's first compile in a process is 100-300 ms, not "a few milliseconds", so
 * compiling inside the submit request would put that on a visitor's thank-you page.
 * Compilation therefore happens at SAVE time — which also puts the syntax errors in
 * front of the person who can fix them, while they are still looking at the editor —
 * and the result is cached by source hash. A submit on a warm process is a delegate
 * call. A submit on a cold process pays one compile, once.
 *
 * ── Timeout, honestly ────────────────────────────────────────────────────────────
 * The run is awaited with a timeout so a runaway script cannot hold the submit request
 * open forever. It cannot be *killed*: .NET has no safe way to abort a foreign thread
 * (Thread.Abort is gone on .NET Core and was never safe on .NET Framework). So the
 * timeout bounds what the VISITOR waits for, not what the server does. A script stuck in
 * a loop keeps a thread-pool thread until the process recycles. That is a real limit and
 * it is written in the admin documentation rather than papered over here.
 */

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Scripting;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Optional sink for the audit trail. Hosts that implement it get a persisted record
    /// of every approval and every run; hosts that do not still get the log service.
    /// </summary>
    public interface IAfterSubmitScriptAuditStore
    {
        void RecordApproval(int formId, string scriptHash, int userId, string userName,
                            DateTime utcNow, int sourceLength, string action);
        void RecordRun(int formId, int submissionId, string scriptHash, bool success,
                       long durationMs, string errorMessage, string logText, DateTime utcNow);
    }

    /// <summary>
    /// [Automation v2 20260813-01] Extends the audit sink with the stage a run belonged to and the
    /// per-capability-call trail. Declared separately so the v1 store keeps working untouched: a
    /// host that implements only IAfterSubmitScriptAuditStore still records approvals and runs, and
    /// simply contributes no capability rows.
    /// </summary>
    public interface IAutomationAuditStore : IAfterSubmitScriptAuditStore
    {
        /// <summary>Returns the run id, so capability calls can be attached to it.</summary>
        long RecordStageRun(int formId, int submissionId, string stage, string scriptHash, bool success,
                            long durationMs, string errorMessage, string logText, bool aborted,
                            int actorUserId, DateTime utcNow);

        void RecordCapabilityCalls(long runId, int formId, int submissionId,
                                   IEnumerable<Automation.AutomationCapabilityCall> calls);
    }

    /// <summary>Collects capability calls for one run, then hands them to the audit store.</summary>
    internal sealed class RunCallRecorder : Automation.IAutomationCallRecorder
    {
        public List<Automation.AutomationCapabilityCall> Calls { get; }
            = new List<Automation.AutomationCapabilityCall>();

        public void Record(Automation.AutomationCapabilityCall call)
        {
            if (call == null) return;
            // A runaway loop calling an endpoint thousands of times must not turn the audit trail
            // into the thing that exhausts memory. The cap is generous and the overflow is counted.
            if (Calls.Count < 500) Calls.Add(call);
            else Overflow++;
        }

        public int Overflow { get; private set; }
    }

    public sealed class AfterSubmitScriptService
    {
        public const string Badge = "AfterSubmitScriptService v20260813-02";

        private readonly IMegaFormScriptCompiler _compiler;
        private readonly ILogService _log;
        private readonly IAfterSubmitScriptAuditStore _audit;
        // [v20260813-02] The capability rail behind ctx.Db.
        //
        // A FACTORY, not an instance: this service is a singleton (it caches compiled scripts by
        // hash, which is the whole reason submissions cost a delegate call), while the connection
        // registry is per-request on hosts with DI. Capturing one registry here would pin a
        // disposed scope's connection and fail on the second submission.
        private readonly Func<IConnectionRegistry> _connections;

        private readonly ConcurrentDictionary<string, ICompiledScript> _cache =
            new ConcurrentDictionary<string, ICompiledScript>(StringComparer.Ordinal);
        private const int MaxCachedScripts = 100;

        /// <param name="compiler">
        /// Null when MegaForm.Scripting.dll is not installed. The service then reports
        /// every hook as skipped — it never falls back to another way of running code.
        /// </param>
        public AfterSubmitScriptService(
            IMegaFormScriptCompiler compiler,
            ILogService log = null,
            IAfterSubmitScriptAuditStore audit = null,
            Func<IConnectionRegistry> connections = null,
            Automation.IAutomationCatalogProvider catalog = null,
            Func<Automation.AutomationCapabilityServices> hostCapabilities = null)
        {
            _compiler = compiler;
            _log = log;
            _audit = audit;
            _connections = connections;
            _catalog = catalog;
            _hostCapabilities = hostCapabilities;
        }

        // [Automation v2] The admin-owned catalog of named actions and endpoints. Null on a host
        // that has not wired it: ctx.Actions / ctx.Api then report "no such action on this site"
        // with an empty available-list, which is the correct and legible answer.
        private readonly Automation.IAutomationCatalogProvider _catalog;
        private readonly Func<Automation.AutomationCapabilityServices> _hostCapabilities;

        /// <summary>
        /// Attach the capability rail to a context before it is handed to a script. Called by the
        /// pipeline and by "Test run" so both see exactly the same surface — a Test run that had
        /// more (or less) reach than the real thing would be worse than no Test run at all.
        /// </summary>
        public void AttachCapabilities(SubmissionScriptContext ctx)
        {
            AttachCapabilities(ctx, null);
        }

        internal void AttachCapabilities(SubmissionScriptContext ctx, RunCallRecorder recorder)
        {
            if (ctx == null) return;
            Action<string> log = line => ctx.Log(line);

            IConnectionRegistry registry = null;
            try { if (_connections != null) registry = _connections(); }
            catch (Exception ex) { _log?.LogWarning("MegaForm.Script", "ctx.Db unavailable: " + ex.Message); }

            // v1 surface — kept so scripts already written against it keep running.
            ctx.Http = new ScriptHttp(log);
            ctx.Db = new ScriptDatabase(registry, registry as IConnectionNameProvider, log);

            // v2 rail — names resolved against the site's automation catalog.
            ctx.Actions = new Automation.AutomationDbCapability(_catalog, registry, recorder, log);
            ctx.Api = new Automation.AutomationHttpCapability(_catalog, recorder, log);

            Automation.AutomationCapabilityServices host = null;
            try { if (_hostCapabilities != null) host = _hostCapabilities(); }
            catch (Exception ex) { _log?.LogWarning("MegaForm.Script", "Optional automation capabilities unavailable: " + ex.Message); }

            // Host-neutral adapters over services MegaForm already owns. They still resolve every
            // template/role policy from the server-side catalog and record every call.
            ctx.Notify = host != null && host.EmailSender != null
                ? (Automation.IAutomationNotifyCapability)new Automation.AutomationNotifyCapability(
                    _catalog, host.EmailSender, recorder, log)
                : Automation.UnavailableCapabilities.Notify();
            ctx.Identity = host != null && host.IdentityProvisioning != null
                ? (Automation.IAutomationIdentityCapability)new Automation.AutomationIdentityCapability(
                    _catalog, host.IdentityProvisioning, host.PrincipalResolver, ctx.PortalId, recorder)
                : Automation.UnavailableCapabilities.Identity();

            // Documents/files/queue/jobs are platform or infrastructure adapters. A host can wire
            // a reviewed implementation; absence remains a precise error rather than null.
            ctx.Documents = host != null && host.Documents != null
                ? host.Documents : Automation.UnavailableCapabilities.Documents();
            ctx.Files = host != null && host.Files != null
                ? host.Files : Automation.UnavailableCapabilities.Files();
            ctx.Queue = host != null && host.Queue != null
                ? host.Queue : Automation.UnavailableCapabilities.Queue();
            ctx.Jobs = host != null && host.Jobs != null
                ? host.Jobs : Automation.UnavailableCapabilities.Jobs();
        }

        /// <summary>
        /// [Automation v2] Run one stage. Returns a result whose <c>Aborted</c> flag the caller must
        /// honour: at PreValidate and PreInsert an abort means "do not write this submission".
        /// </summary>
        public AfterSubmitScriptRunResult RunStage(
            Automation.AutomationStage stage,
            FormAfterSubmitScriptSettings settings,
            SubmissionScriptContext ctx)
        {
            if (ctx != null) ctx.Stage = stage;
            var result = Run(settings, ctx);
            result.Stage = stage.ToString();
            // Only a stage that runs before the commit can turn a failure into an abort. Anywhere
            // else the row exists and the honest answer is "recorded, not undone".
            result.Aborted = !result.Skipped && !result.Success && ctx != null && ctx.CanAbort;
            return result;
        }

        /// <summary>False when no compiler is installed — the endpoint should say so plainly.</summary>
        public bool IsCompilerAvailable { get { return _compiler != null; } }

        // ─── Save-time ────────────────────────────────────────────────────────────

        /// <summary>
        /// Compile without running. Used by the host-only Save and by "Check syntax".
        /// A successful result is cached, so the first submission after a save is warm.
        /// </summary>
        public ScriptCompileResult Validate(string source, string scriptId)
        {
            if (_compiler == null)
            {
                var missing = new ScriptCompileResult { Success = false };
                missing.Diagnostics.Add(new ScriptDiagnostic
                {
                    Line = 1,
                    Column = 1,
                    Severity = "error",
                    Code = "MF0001",
                    Message = "Script compiler is not installed on this server (MegaForm.Scripting.dll)."
                });
                return missing;
            }

            if (source != null && source.Length > AfterSubmitScriptGuard.MaxSourceChars)
            {
                var tooBig = new ScriptCompileResult { Success = false };
                tooBig.Diagnostics.Add(new ScriptDiagnostic
                {
                    Line = 1,
                    Column = 1,
                    Severity = "error",
                    Code = "MF0002",
                    Message = "Script is longer than the " + AfterSubmitScriptGuard.MaxSourceChars +
                              " character limit."
                });
                return tooBig;
            }

            ScriptCompileResult result;
            try
            {
                result = _compiler.Compile(source, scriptId);
            }
            catch (Exception ex)
            {
                // A compiler crash is a server fault, not a syntax error. Say which, and do
                // not hand the caller ex.ToString() (CLAUDE.md rule 10).
                _log?.LogError("MegaForm.Script", "Script compiler threw for " + scriptId + ": " + ex.Message, ex);
                result = new ScriptCompileResult { Success = false };
                result.Diagnostics.Add(new ScriptDiagnostic
                {
                    Line = 1,
                    Column = 1,
                    Severity = "error",
                    Code = "MF0003",
                    Message = "The script compiler failed to run. See the site event log."
                });
            }

            if (result != null && result.Success && result.Script != null)
                CacheScript(result.Script);

            return result;
        }

        // ─── Submit-time ──────────────────────────────────────────────────────────

        /// <summary>
        /// Run the hook for one submission. Never throws: a broken script must not turn a
        /// visitor's submit into a 500 when the row is already saved.
        /// </summary>
        public AfterSubmitScriptRunResult Run(FormAfterSubmitScriptSettings settings, SubmissionScriptContext ctx)
        {
            var result = new AfterSubmitScriptRunResult();

            string reason;
            if (!AfterSubmitScriptGuard.IsRunnable(settings, out reason))
                return Skip(result, reason);

            if (_compiler == null)
                return Skip(result, "Script compiler is not installed on this server (MegaForm.Scripting.dll).");

            result.ScriptHash = settings.ApprovedHash;

            ICompiledScript script;
            if (!_cache.TryGetValue(settings.ApprovedHash, out script))
            {
                var compiled = Validate(settings.Source, "form" + ctx.FormId + "-afterSubmit");
                if (compiled == null || !compiled.Success || compiled.Script == null)
                {
                    // Approved once, does not compile now — almost always a MegaForm upgrade
                    // that moved something the script referenced. Name that, with the first
                    // diagnostic, instead of leaving an admin to guess.
                    var first = (compiled != null && compiled.Diagnostics != null && compiled.Diagnostics.Count > 0)
                        ? compiled.Diagnostics[0].Message
                        : "unknown compile error";
                    result.Success = false;
                    result.ErrorMessage = "Script failed to compile: " + first;
                    _log?.LogError("MegaForm.Script",
                        "After-submit script for form " + ctx.FormId + " no longer compiles: " + first, null);
                    RecordRun(ctx, result);
                    return result;
                }
                script = compiled.Script;
            }

            // Per-run, on the stack. This service is a singleton shared by every concurrent
            // submission, so a field here would let two submissions overwrite each other's audit.
            var recorder = new RunCallRecorder();
            AttachCapabilities(ctx, recorder);

            var timeoutSec = AfterSubmitScriptGuard.ResolveTimeoutSeconds(settings);
            var sw = Stopwatch.StartNew();
            using (var timeoutCts = new CancellationTokenSource())
            try
            {
                Task task;
                var asyncScript = script as IAsyncCompiledScript;
                if (asyncScript != null)
                    task = Task.Run(() => asyncScript.RunAsync(ctx, timeoutCts.Token));
                else
                    task = Task.Run(() => script.Run(ctx));

                if (!task.Wait(TimeSpan.FromSeconds(timeoutSec)))
                {
                    timeoutCts.Cancel();
                    sw.Stop();
                    result.Success = false;
                    result.DurationMs = sw.ElapsedMilliseconds;
                    result.ErrorMessage = "Script did not finish within " + timeoutSec +
                                          "s. Cancellation was requested and the run was abandoned.";
                    _log?.LogWarning("MegaForm.Script",
                        "After-submit script for form " + ctx.FormId + " submission " + ctx.SubmissionId +
                        " exceeded " + timeoutSec + "s. Cancellation was requested; synchronous script code " +
                        "may continue until it returns.");
                    CopyOutputs(ctx, result);
                    RecordRun(ctx, result, recorder);
                    return result;
                }
                sw.Stop();
                result.DurationMs = sw.ElapsedMilliseconds;

                if (ctx.Failed)
                {
                    result.Success = false;
                    result.ErrorMessage = ctx.FailureMessage;
                }
                else
                {
                    result.Success = true;
                }
            }
            catch (AggregateException agg)
            {
                sw.Stop();
                // Flatten first. A script that calls an async capability with `.Result` throws an
                // AggregateException, and this catch then wrapped it again — the run record read
                // "AggregateException: One or more errors occurred." while the actual reason
                // ("Cannot insert explicit value for identity column…") was only in the log lines.
                // Two layers of wrapper between a host and their own SQL error is a bug.
                var inner = Unwrap(agg);
                result.Success = false;
                result.DurationMs = sw.ElapsedMilliseconds;
                result.ErrorMessage = Truncate(inner.GetType().Name + ": " + inner.Message, 2000);
                _log?.LogError("MegaForm.Script",
                    "After-submit script threw for form " + ctx.FormId + " submission " + ctx.SubmissionId +
                    ": " + inner.Message, inner);
            }
            catch (Exception ex)
            {
                sw.Stop();
                var real = Unwrap(ex);
                result.Success = false;
                result.DurationMs = sw.ElapsedMilliseconds;
                result.ErrorMessage = Truncate(real.GetType().Name + ": " + real.Message, 2000);
                _log?.LogError("MegaForm.Script",
                    "After-submit script failed for form " + ctx.FormId + " submission " + ctx.SubmissionId +
                    ": " + real.Message, real);
            }

            CopyOutputs(ctx, result);
            RecordRun(ctx, result, recorder);
            return result;
        }

        /// <summary>
        /// Record a host approval. Separate from Validate so the endpoint decides the order:
        /// compile first, approve only on success.
        /// </summary>
        public void RecordApproval(int formId, string scriptHash, int userId, string userName,
                                   int sourceLength, string action)
        {
            _log?.LogInfo("MegaForm.Script",
                "After-submit script " + action + " for form " + formId + " by user " + userId +
                " (" + (userName ?? "?") + "), hash=" + (scriptHash ?? "") + ", " + sourceLength + " chars.");
            try
            {
                _audit?.RecordApproval(formId, scriptHash, userId, userName, DateTime.UtcNow, sourceLength, action);
            }
            catch (Exception ex)
            {
                _log?.LogWarning("MegaForm.Script", "Script audit write failed: " + ex.Message);
            }
        }

        // ─── internals ────────────────────────────────────────────────────────────

        private static AfterSubmitScriptRunResult Skip(AfterSubmitScriptRunResult r, string reason)
        {
            r.Skipped = true;
            r.Success = true;      // "did not run" is not a failure
            r.SkipReason = reason;
            return r;
        }

        private static void CopyOutputs(SubmissionScriptContext ctx, AfterSubmitScriptRunResult result)
        {
            if (ctx == null) return;
            foreach (var entry in ctx.Logs)
                result.Log.Add(entry.TimestampUtc.ToString("HH:mm:ss.fff") + "  " + entry.Message);
            foreach (var kv in ctx.Variables)
                result.Variables[kv.Key] = kv.Value;

            // [Automation v2] ctx.Response is carried even on a FAILED run: a script that decides a
            // submission is a duplicate, sets a message and then fails should still get its message
            // in front of the visitor.
            if (ctx.Response != null && ctx.Response.HasAnything)
            {
                result.ResponseSuccessMessage = ctx.Response.SuccessMessage;
                result.ResponseRedirectUrl = ctx.Response.RedirectUrl;
                foreach (var kv in ctx.Response.CustomData)
                    result.Variables["response." + kv.Key] = kv.Value;
            }
        }

        private void RecordRun(SubmissionScriptContext ctx, AfterSubmitScriptRunResult result,
                               RunCallRecorder recorder = null)
        {
            try
            {
                if (_audit == null) return;
                var logText = result.Log.Count == 0 ? null : string.Join("\n", result.Log.ToArray());

                var v2 = _audit as IAutomationAuditStore;
                if (v2 != null)
                {
                    var runId = v2.RecordStageRun(ctx.FormId, ctx.SubmissionId,
                        result.Stage ?? ctx.Stage.ToString(), result.ScriptHash, result.Success,
                        result.DurationMs, result.ErrorMessage, logText, result.Aborted,
                        ctx.UserId, DateTime.UtcNow);

                    if (recorder != null && recorder.Calls.Count > 0)
                    {
                        v2.RecordCapabilityCalls(runId, ctx.FormId, ctx.SubmissionId, recorder.Calls);
                        if (recorder.Overflow > 0)
                            _log?.LogWarning("MegaForm.Script",
                                "Form " + ctx.FormId + " submission " + ctx.SubmissionId + ": " +
                                recorder.Overflow + " capability call(s) beyond the 500 recorded were not audited.");
                    }
                    return;
                }

                _audit.RecordRun(ctx.FormId, ctx.SubmissionId, result.ScriptHash, result.Success,
                    result.DurationMs, result.ErrorMessage, logText, DateTime.UtcNow);
            }
            catch (Exception ex)
            {
                _log?.LogWarning("MegaForm.Script", "Script run audit write failed: " + ex.Message);
            }
        }

        private void CacheScript(ICompiledScript script)
        {
            if (script == null || string.IsNullOrEmpty(script.Hash)) return;
            // Crude cap rather than a real LRU: entries are only added on save or cold start,
            // so churn is measured in edits per day, not requests per second.
            if (_cache.Count >= MaxCachedScripts)
            {
                foreach (var key in new List<string>(_cache.Keys))
                {
                    ICompiledScript dropped;
                    _cache.TryRemove(key, out dropped);
                    if (_cache.Count < MaxCachedScripts) break;
                }
            }
            _cache[script.Hash] = script;
        }

        /// <summary>
        /// Peel wrappers until the exception a script author would recognise. `.Result` on a
        /// capability call produces AggregateException, and nesting can go two deep when a
        /// capability itself returned a faulted Task.
        /// </summary>
        private static Exception Unwrap(Exception ex)
        {
            var current = ex;
            for (int depth = 0; depth < 5 && current != null; depth++)
            {
                var agg = current as AggregateException;
                if (agg == null) break;
                var flat = agg.Flatten();
                if (flat.InnerExceptions.Count == 0) break;
                current = flat.InnerExceptions[0];
            }
            return current ?? ex;
        }

        private static string Truncate(string s, int max)
        {
            if (string.IsNullOrEmpty(s)) return s ?? string.Empty;
            return s.Length <= max ? s : s.Substring(0, max);
        }
    }
}
