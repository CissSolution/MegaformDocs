using System;
using System.IO;
using System.Linq;
using MegaForm.Core.Workflow;
using MegaForm.Core.Workflow.Bpmn;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [BpmnImport B1 v20260807] The importer against a file shaped the way Camunda Modeler
    /// actually writes them — collaboration + participant, a laneSet wrapping the flow nodes,
    /// camunda:* attributes instead of megaform:*, a DI plane whose bpmnElement is the
    /// collaboration rather than the process, and shapes for lanes and the participant that are
    /// not flow nodes at all.
    ///
    /// The hand-written diagrams in BpmnImporterTests each isolate one rule; this one exists to
    /// catch what only shows up when all of that arrives at once.
    /// </summary>
    public sealed class BpmnRealFileImportTests
    {
        private static readonly Lazy<BpmnImportResult> Imported = new Lazy<BpmnImportResult>(() =>
        {
            var path = Path.Combine(AppContext.BaseDirectory, "TestData", "camunda-expense-claim.bpmn");
            Assert.True(File.Exists(path), "Missing test fixture: " + path);
            return new BpmnImporter().Import(File.ReadAllText(path), new BpmnImportOptions());
        });

        private static BpmnImportResult Result { get { return Imported.Value; } }

        [Fact]
        public void A_real_exporter_file_imports_without_crashing_or_dropping_the_process()
        {
            Assert.True(Result.Success, string.Join(" | ", Result.Errors));
            Assert.Equal("Expense claim", Result.Definition.Name);
        }

        [Fact]
        public void Flow_nodes_nested_in_lanes_are_still_found()
        {
            // The laneSet lists flowNodeRefs, but the elements themselves sit as siblings inside
            // the process. Both arrangements have to work; here the reader walks descendants.
            var labels = Result.Definition.Nodes.Select(n => n.Label).ToList();

            Assert.Contains("Finance review", labels);
            Assert.Contains("Settlement window", labels);
            Assert.Contains("Post payment to ledger", labels);
            Assert.Contains("Notify claimant", labels);
            Assert.Contains("Claim closed", labels);
            Assert.Contains("Over 5000?", labels);

            // Six: the gateway becomes a Condition; only the start event adds no node of its own.
            Assert.Equal(6, Result.Definition.Nodes.Count);
        }

        [Fact]
        public void The_gateway_default_attribute_decides_the_yes_branch()
        {
            var condition = Result.Definition.Nodes.Single(n => n.Type == WorkflowNodeType.Condition);
            var edges = Result.Definition.Edges.Where(e => e.SourceNodeId == condition.Id).ToList();

            string LabelOf(string handle)
            {
                var edge = edges.Single(e => e.SourceHandle == handle);
                return Result.Definition.Nodes.Single(n => n.Id == edge.TargetNodeId).Label;
            }

            // default="Flow_small" names the No branch, so the review task is the Yes.
            Assert.Equal("Finance review",  LabelOf("true"));
            Assert.Equal("Notify claimant", LabelOf("false"));

            var json = (string)condition.Config["ConditionsJson"];
            Assert.Contains("\"field\":\"amount\"", json);
            Assert.Contains("\"operator\":\"gte\"", json);
            Assert.Contains("\"value\":5000", json);
        }

        [Fact]
        public void The_start_event_hands_the_workflow_to_the_gateway_it_points_at()
        {
            var condition = Result.Definition.Nodes.Single(n => n.Type == WorkflowNodeType.Condition);
            Assert.Equal(condition.Id, Result.Definition.StartNodeId);
        }

        [Fact]
        public void Camunda_candidate_groups_become_the_approval_roles()
        {
            var approval = Result.Definition.Nodes.Single(n => n.Type == WorkflowNodeType.Approval);
            var roles = (System.Collections.Generic.List<string>)approval.Config["CandidateRoles"];

            // camunda:candidateGroups="finance", and camunda:assignee is empty — an empty assignee
            // must not be read as a candidate user.
            Assert.Equal(new[] { "finance" }, roles);
            Assert.False(approval.Config.ContainsKey("CandidateUsers"));
        }

        [Fact]
        public void A_two_day_timer_becomes_a_delay_of_two_days()
        {
            var delay = Result.Definition.Nodes.Single(n => n.Type == WorkflowNodeType.Delay);
            Assert.Equal(2 * 24 * 60 * 60, delay.Config["DelaySeconds"]);
        }

        [Fact]
        public void Send_task_becomes_an_email_node_and_service_task_is_guessed_as_a_webhook()
        {
            Assert.Equal("Notify claimant",
                Result.Definition.Nodes.Single(n => n.Type == WorkflowNodeType.SendEmail).Label);
            Assert.Equal("Post payment to ledger",
                Result.Definition.Nodes.Single(n => n.Type == WorkflowNodeType.Webhook).Label);

            // The service task carries camunda:type="external", not megaform:type, so the importer
            // guessed — and has to say it guessed.
            Assert.Contains(Result.Warnings,
                w => w.ElementId == "Activity_pay" && w.Message.Contains("from its name"));
        }

        [Fact]
        public void Diagram_positions_come_from_the_shapes_and_ignore_lanes_and_the_participant()
        {
            var approval = Result.Definition.Nodes.Single(n => n.Type == WorkflowNodeType.Approval);
            Assert.Equal(300, approval.Position.X);
            Assert.Equal(280, approval.Position.Y);

            // Lane_finance's shape starts at x=159; if a lane shape had been matched to a node,
            // several nodes would share that origin.
            Assert.DoesNotContain(Result.Definition.Nodes, n => n.Position.X == 159);
        }

        [Fact]
        public void Every_node_is_reachable_from_the_start()
        {
            Assert.DoesNotContain(Result.Warnings, w => w.Message.Contains("cannot be reached"));
        }

        [Fact]
        public void Both_paths_converge_on_the_same_notify_task()
        {
            var notify = Result.Definition.Nodes.Single(n => n.Type == WorkflowNodeType.SendEmail);
            var incoming = Result.Definition.Edges.Where(e => e.TargetNodeId == notify.Id).ToList();

            // Flow_small (straight from the gateway) and Flow_paid (after the payment) both land here.
            Assert.Equal(2, incoming.Count);
        }
    }
}
