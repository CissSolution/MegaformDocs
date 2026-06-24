// ============================================================
// MegaForm Core — Purchase Order Business Starter
// ----------------------------------------------------------------
// Platform-agnostic 5-role / 7-step BPMN sample with a conditional
// CFO branch on amount > 50K. Lean compared to the other starters
// (no user/query/view/app provisioning) — purely populates a form,
// a workflow, and 5 sample submissions with pending tasks so the
// dashboard canvas has data immediately. Both DNN and Oqtane build
// this from MegaForm.Core; the StarterPlatformAdapter contract is
// not needed here because the seeder uses only Core repositories
// (IFormRepository / ISubmissionRepository / IWorkflowRepository).
// ============================================================

using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Starters
{
    // ─────────────────────────────────────────────────────────────────────────
    //  PurchaseOrderStarterService — lite starter for the "complex multi-step
    //  workflow" demo (Phase B of the 01.06.18 release).
    //
    //  Differences vs the existing 3-role starters (Leave / Proposal / Document):
    //   - 5 roles: PO Requester, Dept Head, Procurement, Finance, CFO
    //   - 7 BPMN steps with a conditional branch on amount (> 50K → CFO)
    //   - Lean: does NOT provision users, queries, views, app definition — just
    //     creates the form + workflow draft + applies it + seeds 5 submissions
    //     spread across the workflow stages so the dashboard canvas has data.
    //   - Re-uses existing roles if present (set up earlier by other starters
    //     or the host), but does not auto-create users.
    //  Badge: PurchaseOrderStarterLite v20260516-07
    // ─────────────────────────────────────────────────────────────────────────
    public class PurchaseOrderStarterResult
    {
        public int FormId { get; set; }
        public string FormTitle { get; set; }
        public string WorkflowName { get; set; }
        public int NodeCount { get; set; }
        public int SeededSubmissions { get; set; }
        public Dictionary<string, int> SubmissionStatusCounts { get; set; } = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        public string Message { get; set; }
    }

    public class PurchaseOrderStarterService
    {
        public const string Badge = "PurchaseOrderStarterLite v20260516-07";
        public const string FormTitle = "Purchase Order Approval (Sample)";
        public const string WorkflowName = "Purchase Order Approval Workflow";

        // Role names — re-used if they exist on the site, otherwise just stored as
        // candidate-role strings on the workflow nodes (visible in the picker as
        // freetext fallback).
        public const string RoleRequester     = "PO Requesters";
        public const string RoleDeptHead      = "Department Heads";
        public const string RoleProcurement   = "Procurement Officers";
        public const string RoleFinance       = "Finance Analysts";
        public const string RoleCFO           = "CFO";

        private readonly IFormRepository _forms;
        private readonly ISubmissionRepository _submissions;
        private readonly IWorkflowRepository _workflowRepo;

        public PurchaseOrderStarterService(
            IFormRepository forms,
            ISubmissionRepository submissions,
            IWorkflowRepository workflowRepo)
        {
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _submissions = submissions ?? throw new ArgumentNullException(nameof(submissions));
            _workflowRepo = workflowRepo ?? throw new ArgumentNullException(nameof(workflowRepo));
        }

        public PurchaseOrderStarterResult EnsureStarter(int portalId, int moduleId, int actorUserId)
        {
            // [DnnPortalIdZero v20260518-08] DNN host portal is PortalId=0.
            if (portalId < 0) throw new InvalidOperationException("portalId is required.");

            var formId = EnsureForm(portalId, moduleId, actorUserId);
            ApplyWorkflow(formId);
            var seed = SeedSampleSubmissions(formId);

            return new PurchaseOrderStarterResult
            {
                FormId = formId,
                FormTitle = FormTitle,
                WorkflowName = WorkflowName,
                NodeCount = 7,
                SeededSubmissions = seed.Count,
                SubmissionStatusCounts = seed.Counts,
                Message = "Purchase Order starter form + workflow ready. " + Badge
            };
        }

        // ─── 1. FORM ──────────────────────────────────────────────────────────
        private int EnsureForm(int portalId, int moduleId, int actorUserId)
        {
            // Look up by Title first — idempotent so re-running just re-applies the workflow.
            var existing = _forms.ListForms(portalId, status: null, search: FormTitle, pageIndex: 0, pageSize: 5)
                .FirstOrDefault(f => string.Equals(f.Title, FormTitle, StringComparison.OrdinalIgnoreCase));
            if (existing != null) return existing.FormId;

            var schemaJson = BuildSchemaJson();
            var form = new FormInfo
            {
                FormId = 0,
                PortalId = portalId,
                ModuleId = moduleId,
                Title = FormTitle,
                Description = "Sample 7-step Purchase Order approval workflow with 5 roles and a conditional CFO branch when amount exceeds 50,000.",
                SchemaJson = schemaJson,
                SettingsJson = "{}",
                Status = "Published",
                SubmitButtonText = "Submit Purchase Order",
                SuccessMessage = "Your purchase order has been submitted for approval.",
                RequireAuth = false,
                EnableCaptcha = false,
                EnableSaveResume = false,
                AutoresponderEnabled = false,
                CreatedByUserId = actorUserId > 0 ? actorUserId : 1,
                CreatedOnUtc = DateTime.UtcNow
            };
            return _forms.SaveForm(form);
        }

        private string BuildSchemaJson()
        {
            var schema = new
            {
                fields = new object[]
                {
                    new { key = "requesterName", type = "Text",     label = "Requester full name", required = true, width = "Half", placeholder = "e.g. Nguyen Van A" },
                    new { key = "requesterEmail", type = "Email",   label = "Requester email",     required = true, width = "Half", placeholder = "you@example.com" },
                    new { key = "department",    type = "Select",   label = "Department",          required = true, width = "Half",
                          options = new object[] {
                              new { value = "",        label = "-- choose --" },
                              new { value = "IT",      label = "IT" },
                              new { value = "Marketing", label = "Marketing" },
                              new { value = "Sales",   label = "Sales" },
                              new { value = "Operations", label = "Operations" },
                              new { value = "HR",      label = "HR" }
                          }
                    },
                    new { key = "vendor",        type = "Text",     label = "Vendor / Supplier",   required = true, width = "Half" },
                    new { key = "itemDescription", type = "Textarea", label = "Items / description", required = true, width = "Full", placeholder = "List items, quantities, unit cost..." },
                    new { key = "amount",        type = "Number",   label = "Total amount (USD)",  required = true, width = "Half",
                          validation = new { min = 1, max = 10000000 } },
                    new { key = "deliveryDate",  type = "Date",     label = "Expected delivery",   required = false, width = "Half" },
                    new { key = "justification", type = "Textarea", label = "Business justification", required = true, width = "Full", placeholder = "Why is this purchase needed?" }
                },
                settings = new { multiPage = false, submitButtonText = "Submit Purchase Order" }
            };
            return JsonConvert.SerializeObject(schema);
        }

        // ─── 2. WORKFLOW ──────────────────────────────────────────────────────
        private void ApplyWorkflow(int formId)
        {
            var def = BuildWorkflow(formId);
            _workflowRepo.SaveDraft(formId, def);
            _workflowRepo.ApplyDraft(formId, "purchase-order-starter");
        }

        private static WorkflowDefinition BuildWorkflow(int formId)
        {
            // 7-step BPMN: Submit → DeptHead → Procurement → AmountGate → CFO (>50K) / Finance (else) → Notify → End
            var startNode = MakeNode("start-submit", WorkflowNodeType.FormField, "Submit PO", 80, 200);
            startNode.ZoneType = WorkflowZoneType.Navigation;

            var deptHead = MakeApproval("dept-head", "Department Head Review", RoleDeptHead,
                pendingStatus: "pending_dept_head",
                approvedStatus: "pending_procurement",
                rejectedStatus: "rejected_by_dept_head",
                dueHours: 24,
                x: 280, y: 200);

            var procurement = MakeApproval("procurement", "Procurement Check", RoleProcurement,
                pendingStatus: "pending_procurement",
                approvedStatus: "pending_finance_routing",
                rejectedStatus: "rejected_by_procurement",
                dueHours: 24,
                x: 500, y: 200);

            var amountGate = MakeNode("amount-gate", WorkflowNodeType.Condition, "Amount > 50,000 ?", 720, 200);
            amountGate.Config = new Dictionary<string, object>
            {
                ["Mode"] = "AnyGroup",
                ["Groups"] = new object[] {
                    new {
                        Logic = "and",
                        Rules = new object[] {
                            new { FieldKey = "amount", Operator = "greaterThan", Value = "50000", ValueType = "literal" }
                        }
                    }
                }
            };

            var cfo = MakeApproval("cfo-signoff", "CFO Sign-off (high value)", RoleCFO,
                pendingStatus: "pending_cfo",
                approvedStatus: "approved_pending_notify",
                rejectedStatus: "rejected_by_cfo",
                dueHours: 48,
                x: 940, y: 100);

            var finance = MakeApproval("finance-approval", "Finance Approval", RoleFinance,
                pendingStatus: "pending_finance",
                approvedStatus: "approved_pending_notify",
                rejectedStatus: "rejected_by_finance",
                dueHours: 24,
                x: 940, y: 300);

            var notify = MakeNode("vendor-notify", WorkflowNodeType.SendEmail, "Notify Vendor", 1160, 200);
            notify.Config = new Dictionary<string, object>
            {
                ["To"] = "{{field.vendor}}@vendor.example.com",
                ["Subject"] = "Purchase Order #{{submission.id}} approved",
                ["Body"] = "Hello,\n\nYour PO from {{field.department}} for {{field.amount}} USD has been approved.\n\nItems:\n{{field.itemDescription}}\n\nExpected delivery: {{field.deliveryDate}}.\n\nThanks."
            };

            var endApproved = MakeNode("end-approved", WorkflowNodeType.End, "Approved", 1380, 130);
            endApproved.Config = new Dictionary<string, object> { ["EndType"] = (int)EndType.Success, ["Message"] = "PO approved" };
            var endRejected = MakeNode("end-rejected", WorkflowNodeType.End, "Rejected", 1380, 270);
            endRejected.Config = new Dictionary<string, object> { ["EndType"] = (int)EndType.Failure, ["Message"] = "PO rejected" };

            return new WorkflowDefinition
            {
                FormId = formId,
                Name = WorkflowName,
                StartNodeId = startNode.Id,
                Nodes = new List<WorkflowNode>
                {
                    startNode, deptHead, procurement, amountGate, cfo, finance, notify, endApproved, endRejected
                },
                Edges = new List<WorkflowEdge>
                {
                    Edge(startNode.Id,    "default",  deptHead.Id),
                    Edge(deptHead.Id,     "approved", procurement.Id, "Approved"),
                    Edge(deptHead.Id,     "rejected", endRejected.Id, "Rejected"),
                    Edge(procurement.Id,  "approved", amountGate.Id, "Approved"),
                    Edge(procurement.Id,  "rejected", endRejected.Id, "Rejected"),
                    Edge(amountGate.Id,   "true",     cfo.Id,         "Amount > 50K"),
                    Edge(amountGate.Id,   "false",    finance.Id,     "Amount ≤ 50K"),
                    Edge(cfo.Id,          "approved", notify.Id,      "Approved"),
                    Edge(cfo.Id,          "rejected", endRejected.Id, "Rejected"),
                    Edge(finance.Id,      "approved", notify.Id,      "Approved"),
                    Edge(finance.Id,      "rejected", endRejected.Id, "Rejected"),
                    Edge(notify.Id,       "default",  endApproved.Id)
                },
                Settings = new WorkflowSettings
                {
                    EnableExecutionLog = true,
                    ExecutionTimeoutSeconds = 300
                }
            };
        }

        private static WorkflowNode MakeNode(string id, WorkflowNodeType type, string label, double x, double y)
        {
            return new WorkflowNode
            {
                Id = id,
                Type = type,
                Label = label,
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = x, Y = y },
                Config = new Dictionary<string, object>()
            };
        }

        private static WorkflowNode MakeApproval(string id, string label, string role,
            string pendingStatus, string approvedStatus, string rejectedStatus, int dueHours, double x, double y)
        {
            var n = MakeNode(id, WorkflowNodeType.Approval, label, x, y);
            n.Config = ToConfig(new ApprovalNodeConfig
            {
                CandidateRoles = new List<string> { role },
                CandidateUsers = new List<string>(),
                AllowClaim = true,
                AllowForward = true,
                AllowReassign = true,
                CommentRequiredOnReject = true,
                DueInHours = dueHours,
                PendingSubmissionStatus = pendingStatus,
                ApprovedSubmissionStatus = approvedStatus,
                RejectedSubmissionStatus = rejectedStatus
            });
            return n;
        }

        private static WorkflowEdge Edge(string sourceId, string sourceHandle, string targetId, string label = null)
        {
            return new WorkflowEdge
            {
                Id = Guid.NewGuid().ToString("N"),
                SourceNodeId = sourceId,
                SourceHandle = sourceHandle,
                TargetNodeId = targetId,
                TargetHandle = "input",
                Label = label ?? string.Empty
            };
        }

        private static Dictionary<string, object> ToConfig<T>(T config)
        {
            var json = JsonConvert.SerializeObject(config);
            return JsonConvert.DeserializeObject<Dictionary<string, object>>(json) ?? new Dictionary<string, object>();
        }

        // ─── 3. SAMPLE DATA ───────────────────────────────────────────────────
        // Insert 5 sample submissions at various workflow stages so the dashboard
        // canvas has interesting data to render. Each row is inserted via direct
        // EF Core operations so we don't have to spin up the workflow engine.
        private (int Count, Dictionary<string, int> Counts) SeedSampleSubmissions(int formId)
        {
            var samples = new[]
            {
                new { Name = "Alice Tran",   Email = "alice@acme.com",  Dept = "IT",         Vendor = "Lenovo",        Item = "30 ThinkPad X1 Carbon laptops + 3-year warranty",                Amount = 84500m, Status = "pending_cfo",       NodeId = "cfo-signoff",     NodeLabel = "CFO Sign-off (high value)" },
                new { Name = "Brian Le",     Email = "brian@acme.com",  Dept = "Marketing", Vendor = "AdRoll",        Item = "Q3 retargeting campaign budget",                                  Amount = 24000m, Status = "pending_finance",   NodeId = "finance-approval",NodeLabel = "Finance Approval" },
                new { Name = "Catherine Vu", Email = "cathy@acme.com",  Dept = "Operations",Vendor = "Office Depot",  Item = "Office supplies, printer paper, toner cartridges",                Amount = 1850m,  Status = "pending_procurement",NodeId = "procurement",    NodeLabel = "Procurement Check" },
                new { Name = "Dao Hung",     Email = "daoa@acme.com",   Dept = "HR",        Vendor = "Workday",       Item = "Annual HRIS subscription renewal",                                Amount = 67800m, Status = "pending_dept_head", NodeId = "dept-head",       NodeLabel = "Department Head Review" },
                new { Name = "Eva Pham",     Email = "eva@acme.com",    Dept = "Sales",     Vendor = "Salesforce",    Item = "Sales Cloud add-on seats × 25 + Service Cloud upgrade",           Amount = 132000m,Status = "pending_cfo",       NodeId = "cfo-signoff",     NodeLabel = "CFO Sign-off (high value)" }
            };

            var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            int inserted = 0;
            foreach (var s in samples)
            {
                var data = new
                {
                    requesterName  = s.Name,
                    requesterEmail = s.Email,
                    department     = s.Dept,
                    vendor         = s.Vendor,
                    itemDescription = s.Item,
                    amount         = s.Amount,
                    deliveryDate   = DateTime.UtcNow.AddDays(30).ToString("yyyy-MM-dd"),
                    justification  = "Required to support " + s.Dept + " operational continuity."
                };
                var sub = new SubmissionInfo
                {
                    FormId = formId,
                    DataJson = JsonConvert.SerializeObject(data),
                    Status = s.Status,
                    SubmittedOnUtc = DateTime.UtcNow.AddHours(-(inserted + 1) * 6)
                };
                var subId = _submissions.Insert(sub);
                inserted++;
                if (!counts.ContainsKey(s.Status)) counts[s.Status] = 0;
                counts[s.Status]++;

                // Stage a pending workflow task at the matching node so the canvas overlay
                // can show pending counts and the task list right away. Goes through the
                // Core IWorkflowRepository.SaveTask path so DNN (ADO.NET) + Oqtane (EF)
                // share the same insert code.
                var task = new WorkflowTaskInstance
                {
                    TaskId = Guid.NewGuid().ToString("N"),
                    CaseId = Guid.NewGuid().ToString("N"),
                    ExecutionId = Guid.NewGuid().ToString("N"),
                    FormId = formId,
                    SubmissionId = subId,
                    NodeId = s.NodeId,
                    NodeLabel = s.NodeLabel,
                    Status = WorkflowTaskStatus.Pending,
                    CandidateRoles = new List<string> { CandidateRoleForNode(s.NodeId) },
                    CandidateUsers = new List<string>(),
                    AllowClaim = true,
                    AllowForward = true,
                    AllowReassign = true,
                    CommentRequiredOnReject = true,
                    PendingSubmissionStatus = s.Status,
                    ApprovedSubmissionStatus = "approved_pending_notify",
                    RejectedSubmissionStatus = "rejected",
                    CreatedAt = DateTime.UtcNow.AddHours(-(inserted) * 5),
                    DueAt = DateTime.UtcNow.AddDays(2)
                };
                _workflowRepo.SaveTask(task);
            }
            return (inserted, counts);
        }

        private static string CandidateRoleForNode(string nodeId)
        {
            switch (nodeId)
            {
                case "dept-head":         return RoleDeptHead;
                case "procurement":       return RoleProcurement;
                case "finance-approval":  return RoleFinance;
                case "cfo-signoff":       return RoleCFO;
                default:                  return RoleRequester;
            }
        }
    }
}
