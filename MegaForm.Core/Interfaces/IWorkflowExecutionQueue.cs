using System;
using System.Collections.Generic;

// ══════════════════════════════════════════════════════════════════════════════
//  MegaForm.Core.Interfaces — Async Workflow Execution Queue (Cloud-Ready A1)
//  C# 7.3 compatible (net472 + net8.0 + net9.0)
// ══════════════════════════════════════════════════════════════════════════════

namespace MegaForm.Core.Interfaces
{
    /// <summary>
    /// [CloudReady A1 v20260804] How post-submit workflow execution is dispatched.
    /// Sync (default) = execute inline during the submit request, exactly as before.
    /// Queued = persist an execution request and let a background worker run it.
    /// Default MUST stay Sync so DNN / Umbraco / unconfigured hosts keep today's
    /// behaviour byte-for-byte.
    /// </summary>
    public enum WorkflowExecutionMode
    {
        Sync   = 1,
        Queued = 2
    }

    /// <summary>
    /// [CloudReady A1 v20260804] Resolves the execution mode for a portal/site.
    /// Hosts register a config-backed implementation; hosts that register nothing
    /// leave the SubmissionProcessor ctor param null → Sync path.
    /// </summary>
    public interface IWorkflowExecutionModeProvider
    {
        WorkflowExecutionMode GetMode(int portalId);
    }

    /// <summary>
    /// [CloudReady A1 v20260804] Everything the background worker needs to call
    /// IWorkflowEngine.ExecuteAsync with the same arguments SubmissionProcessor
    /// would have passed inline. FormData is the enriched workflow dictionary
    /// (already carries __portalId / __actorUserId / __actorUserName /
    /// __actorDisplayName / __actorEmail), so no separate PortalId/actor fields
    /// are needed — the worker round-trips it verbatim.
    /// </summary>
    public class WorkflowExecutionRequest
    {
        public int FormId { get; set; }
        public int SubmissionId { get; set; }
        public Dictionary<string, object> FormData { get; set; }
        public DateTime EnqueuedAtUtc { get; set; }
    }

    /// <summary>
    /// [CloudReady A1 v20260804] DB-backed execution queue. Abstraction lives in
    /// Core so each host implements its own store (Web: MF_WorkflowQueue via EF;
    /// Oqtane: same table via IDbContextFactory). Sync signature matches the
    /// existing IWorkflowRepository style. Returns the store's queue item id.
    /// </summary>
    public interface IWorkflowExecutionQueue
    {
        string Enqueue(WorkflowExecutionRequest request);
    }
}
