using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Workflow;
using MegaForm.Core.Workflow.Bpmn;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [BpmnImport B1 v20260807] Mapping tests for the BPMN 2.0 importer.
    ///
    /// These assert the contract the workflow ENGINE relies on, not just that the importer
    /// produced some nodes: the handle strings ("true"/"false"/"case:N"/"default") are how
    /// WorkflowEngineV2 picks the next node, so a wrong handle silently routes real
    /// submissions down the wrong branch.
    /// </summary>
    public sealed class BpmnImporterTests
    {
        private static BpmnImportResult Import(string xml, bool strict = false)
        {
            return new BpmnImporter().Import(xml, new BpmnImportOptions { Strict = strict });
        }

        private static WorkflowNode NodeById(WorkflowDefinition definition, string id)
        {
            return definition.Nodes.FirstOrDefault(n => n.Id == id);
        }

        private static WorkflowNode SingleOfType(WorkflowDefinition definition, WorkflowNodeType type)
        {
            return definition.Nodes.Single(n => n.Type == type);
        }

        private static List<WorkflowEdge> EdgesFrom(WorkflowDefinition definition, string nodeId)
        {
            return definition.Edges.Where(e => e.SourceNodeId == nodeId).ToList();
        }

        // ── Straight line ────────────────────────────────────────────────────

        private const string LinearProcess = @"
<?xml version='1.0' encoding='UTF-8'?>
<bpmn:definitions xmlns:bpmn='http://www.omg.org/spec/BPMN/20100524/MODEL'
                  xmlns:megaform='http://megaform.io/bpmn/1.0'>
  <bpmn:process id='Process_1'  name='Leave request'>
    <bpmn:startEvent id='Start_1'><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id='Task_Approve' name='Manager approval' megaform:candidateRoles='Managers' />
    <bpmn:serviceTask id='Task_Notify' name='Post to payroll' megaform:type='webhook'
                      megaform:url='https://example.test/payroll' />
    <bpmn:endEvent id='End_1' name='Done' />
    <bpmn:sequenceFlow id='Flow_1' sourceRef='Start_1' targetRef='Task_Approve' />
    <bpmn:sequenceFlow id='Flow_2' sourceRef='Task_Approve' targetRef='Task_Notify' />
    <bpmn:sequenceFlow id='Flow_3' sourceRef='Task_Notify' targetRef='End_1' />
  </bpmn:process>
</bpmn:definitions>";

        [Fact]
        public void Start_event_becomes_the_start_node_rather_than_a_node_of_its_own()
        {
            var result = Import(LinearProcess);

            Assert.True(result.Success);
            // Three elements map to nodes; the start event is not one of them.
            Assert.Equal(3, result.Definition.Nodes.Count);
            Assert.DoesNotContain(result.Definition.Nodes, n => n.Label == "Start_1");

            var approval = SingleOfType(result.Definition, WorkflowNodeType.Approval);
            Assert.Equal(approval.Id, result.Definition.StartNodeId);
        }

        [Fact]
        public void User_task_becomes_an_approval_carrying_the_candidate_role()
        {
            var result = Import(LinearProcess);
            var approval = SingleOfType(result.Definition, WorkflowNodeType.Approval);

            Assert.Equal("Manager approval", approval.Label);
            var roles = Assert.IsType<List<string>>(approval.Config["CandidateRoles"]);
            Assert.Equal(new[] { "Managers" }, roles);
        }

        [Fact]
        public void Service_task_with_an_explicit_type_hint_is_not_guessed_at()
        {
            var result = Import(LinearProcess);
            var webhook = SingleOfType(result.Definition, WorkflowNodeType.Webhook);

            Assert.Equal("https://example.test/payroll", webhook.Config["Url"]);
            Assert.DoesNotContain(result.Warnings, w => w.Message.Contains("from its name"));
        }

        [Fact]
        public void Service_task_without_a_type_hint_is_guessed_and_the_guess_is_reported()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <serviceTask id='T' name='Send welcome mail' />
    <endEvent id='E' />
    <sequenceFlow id='F1' sourceRef='S' targetRef='T' />
    <sequenceFlow id='F2' sourceRef='T' targetRef='E' />
  </process>
</definitions>";

            var result = Import(xml);

            Assert.True(result.Success);
            Assert.Contains(result.Definition.Nodes, n => n.Type == WorkflowNodeType.SendEmail);
            Assert.Contains(result.Warnings, w => w.ElementId == "T" && w.Message.Contains("from its name"));
        }

        // ── Exclusive gateway, two ways ──────────────────────────────────────

        private const string TwoWayGateway = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <exclusiveGateway id='G' name='Large order?' default='F_no' />
    <serviceTask id='T_yes' name='Escalate' />
    <serviceTask id='T_no'  name='Auto approve' />
    <endEvent id='E' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='G' />
    <sequenceFlow id='F_yes' name='Yes' sourceRef='G' targetRef='T_yes'>
      <conditionExpression xsi:type='tFormalExpression'
        xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance'>${amount &gt; 1000}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id='F_no' name='No' sourceRef='G' targetRef='T_no' />
    <sequenceFlow id='F1' sourceRef='T_yes' targetRef='E' />
    <sequenceFlow id='F2' sourceRef='T_no'  targetRef='E' />
  </process>
</definitions>";

        [Fact]
        public void Two_way_gateway_becomes_a_condition_with_true_and_false_handles()
        {
            var result = Import(TwoWayGateway);
            Assert.True(result.Success);

            var condition = SingleOfType(result.Definition, WorkflowNodeType.Condition);
            var edges = EdgesFrom(result.Definition, condition.Id);
            Assert.Equal(2, edges.Count);

            var trueEdge  = edges.Single(e => e.SourceHandle == "true");
            var falseEdge = edges.Single(e => e.SourceHandle == "false");

            // The gateway's `default` attribute names the No branch, so Escalate is the Yes.
            Assert.Equal("Escalate",     NodeById(result.Definition, trueEdge.TargetNodeId).Label);
            Assert.Equal("Auto approve", NodeById(result.Definition, falseEdge.TargetNodeId).Label);
        }

        [Fact]
        public void A_simple_comparison_is_translated_into_a_condition_rule()
        {
            var result = Import(TwoWayGateway);
            var condition = SingleOfType(result.Definition, WorkflowNodeType.Condition);

            var json = (string)condition.Config["ConditionsJson"];
            Assert.Contains("\"field\":\"amount\"", json);
            Assert.Contains("\"operator\":\"gt\"", json);
            Assert.Contains("\"value\":1000", json);
        }

        [Fact]
        public void An_expression_we_cannot_translate_leaves_the_condition_empty_and_warns()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <exclusiveGateway id='G' />
    <endEvent id='E1' /><endEvent id='E2' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='G' />
    <sequenceFlow id='F1' sourceRef='G' targetRef='E1'>
      <conditionExpression>${amount &gt; 1000 &amp;&amp; region == 'EU'}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id='F2' sourceRef='G' targetRef='E2' />
  </process>
</definitions>";

            var result = Import(xml);
            var condition = SingleOfType(result.Definition, WorkflowNodeType.Condition);

            Assert.Equal(string.Empty, condition.Config["ConditionsJson"]);
            Assert.Contains(result.Warnings, w => w.Message.Contains("combines several conditions"));
        }

        // ── Exclusive gateway, many ways ─────────────────────────────────────

        [Fact]
        public void Gateway_with_more_than_two_exits_becomes_a_switch_with_positional_handles()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <exclusiveGateway id='G' name='Route by region' default='F_other' />
    <endEvent id='E1' name='EU' /><endEvent id='E2' name='US' /><endEvent id='E3' name='Other' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='G' />
    <sequenceFlow id='F_eu' name='EU' sourceRef='G' targetRef='E1'>
      <conditionExpression>${region == 'EU'}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id='F_us' name='US' sourceRef='G' targetRef='E2'>
      <conditionExpression>${region == 'US'}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id='F_other' name='Other' sourceRef='G' targetRef='E3' />
  </process>
</definitions>";

            var result = Import(xml);
            Assert.True(result.Success);

            var node = SingleOfType(result.Definition, WorkflowNodeType.Switch);
            var edges = EdgesFrom(result.Definition, node.Id);

            // Handles are "case:N" by position among the non-default exits — the Switch executor
            // answers with the index into Cases, so the two orders must agree.
            Assert.Equal("EU", NodeById(result.Definition, edges.Single(e => e.SourceHandle == "case:0").TargetNodeId).Label);
            Assert.Equal("US", NodeById(result.Definition, edges.Single(e => e.SourceHandle == "case:1").TargetNodeId).Label);
            Assert.Equal("Other", NodeById(result.Definition, edges.Single(e => e.SourceHandle == "default").TargetNodeId).Label);

            var cases = Assert.IsType<List<Dictionary<string, object>>>(node.Config["Cases"]);
            Assert.Equal(2, cases.Count);
            Assert.Equal("EU", cases[0]["Label"]);
            Assert.Equal("US", cases[1]["Label"]);
        }

        // ── Parallel gateway ─────────────────────────────────────────────────

        [Fact]
        public void Parallel_gateways_become_a_fork_that_knows_its_branches_and_its_join()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <parallelGateway id='Fork' />
    <serviceTask id='A' name='Notify finance' />
    <serviceTask id='B' name='Notify HR' />
    <parallelGateway id='Join' />
    <endEvent id='E' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='Fork' />
    <sequenceFlow id='F1' sourceRef='Fork' targetRef='A' />
    <sequenceFlow id='F2' sourceRef='Fork' targetRef='B' />
    <sequenceFlow id='F3' sourceRef='A' targetRef='Join' />
    <sequenceFlow id='F4' sourceRef='B' targetRef='Join' />
    <sequenceFlow id='F5' sourceRef='Join' targetRef='E' />
  </process>
</definitions>";

            var result = Import(xml);
            Assert.True(result.Success);

            var fork = SingleOfType(result.Definition, WorkflowNodeType.Fork);
            var join = SingleOfType(result.Definition, WorkflowNodeType.Join);

            var branches = Assert.IsType<List<string>>(fork.Config["BranchStartNodeIds"]);
            Assert.Equal(2, branches.Count);
            var branchLabels = branches.Select(id => NodeById(result.Definition, id).Label).ToList();
            Assert.Contains("Notify finance", branchLabels);
            Assert.Contains("Notify HR", branchLabels);

            Assert.Equal(join.Id, fork.Config["JoinNodeId"]);
            Assert.All(EdgesFrom(result.Definition, fork.Id), e => Assert.Equal(WorkflowEdgeType.Fork, e.EdgeType));
        }

        // ── Timer ────────────────────────────────────────────────────────────

        [Fact]
        public void Timer_intermediate_event_becomes_a_delay_in_seconds()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <intermediateCatchEvent id='Wait' name='Cooling off'>
      <timerEventDefinition><timeDuration>PT90M</timeDuration></timerEventDefinition>
    </intermediateCatchEvent>
    <endEvent id='E' />
    <sequenceFlow id='F1' sourceRef='S' targetRef='Wait' />
    <sequenceFlow id='F2' sourceRef='Wait' targetRef='E' />
  </process>
</definitions>";

            var result = Import(xml);
            var delay = SingleOfType(result.Definition, WorkflowNodeType.Delay);

            Assert.Equal(90 * 60, delay.Config["DelaySeconds"]);
            Assert.Equal("default", EdgesFrom(result.Definition, delay.Id).Single().SourceHandle);
        }

        // ── Layout ───────────────────────────────────────────────────────────

        [Fact]
        public void Diagram_coordinates_are_carried_onto_the_canvas()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'
             xmlns:bpmndi='http://www.omg.org/spec/BPMN/20100524/DI'
             xmlns:dc='http://www.omg.org/spec/DD/20100524/DC'>
  <process id='P'>
    <startEvent id='S' />
    <endEvent id='E' name='Finish' />
    <sequenceFlow id='F1' sourceRef='S' targetRef='E' />
  </process>
  <bpmndi:BPMNDiagram id='D'>
    <bpmndi:BPMNPlane id='Plane' bpmnElement='P'>
      <bpmndi:BPMNShape id='Shape_E' bpmnElement='E'>
        <dc:Bounds x='412.5' y='218' width='36' height='36' />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>";

            var result = Import(xml);
            var end = SingleOfType(result.Definition, WorkflowNodeType.End);

            // Invariant-culture parse: on a vi-VN or de-DE host "412.5" must not become 4125.
            Assert.Equal(412.5, end.Position.X);
            Assert.Equal(218, end.Position.Y);
        }

        [Fact]
        public void Nodes_without_diagram_information_are_laid_out_left_to_right()
        {
            var result = Import(LinearProcess);

            var approval = SingleOfType(result.Definition, WorkflowNodeType.Approval);
            var webhook  = SingleOfType(result.Definition, WorkflowNodeType.Webhook);
            var end      = SingleOfType(result.Definition, WorkflowNodeType.End);

            Assert.True(approval.Position.X < webhook.Position.X);
            Assert.True(webhook.Position.X < end.Position.X);
        }

        // ── Prefix and namespace tolerance ───────────────────────────────────

        [Fact]
        public void A_different_namespace_prefix_parses_the_same()
        {
            const string xml = @"
<bpmn2:definitions xmlns:bpmn2='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <bpmn2:process id='P' name='Prefixed'>
    <bpmn2:startEvent id='S' />
    <bpmn2:userTask id='T' name='Review' />
    <bpmn2:endEvent id='E' />
    <bpmn2:sequenceFlow id='F1' sourceRef='S' targetRef='T' />
    <bpmn2:sequenceFlow id='F2' sourceRef='T' targetRef='E' />
  </bpmn2:process>
</bpmn2:definitions>";

            var result = Import(xml);

            Assert.True(result.Success);
            Assert.Equal("Prefixed", result.Definition.Name);
            Assert.Equal("Review", SingleOfType(result.Definition, WorkflowNodeType.Approval).Label);
        }

        // ── Unsupported ──────────────────────────────────────────────────────

        private const string WithSubProcess = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <subProcess id='Sub' name='Collect documents' />
    <endEvent id='E' />
    <sequenceFlow id='F1' sourceRef='S' targetRef='Sub' />
    <sequenceFlow id='F2' sourceRef='Sub' targetRef='E' />
  </process>
</definitions>";

        [Fact]
        public void Lenient_import_keeps_an_unsupported_element_as_a_disabled_placeholder()
        {
            var result = Import(WithSubProcess);

            Assert.True(result.Success);
            Assert.Contains(result.UnsupportedElements, u => u.Contains("subProcess"));

            var placeholder = result.Definition.Nodes.Single(n => n.IsDisabled);
            Assert.StartsWith("UNSUPPORTED: subProcess", placeholder.Label);
        }

        [Fact]
        public void Strict_import_refuses_rather_than_placing_a_placeholder()
        {
            var result = Import(WithSubProcess, strict: true);

            Assert.False(result.Success);
            Assert.Null(result.Definition);
            Assert.Contains(result.UnsupportedElements, u => u.Contains("subProcess"));
        }

        [Fact]
        public void No_assignee_falls_back_to_a_role_and_says_so()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <userTask id='T' name='Check it' />
    <endEvent id='E' />
    <sequenceFlow id='F1' sourceRef='S' targetRef='T' />
    <sequenceFlow id='F2' sourceRef='T' targetRef='E' />
  </process>
</definitions>";

            var result = new BpmnImporter().Import(xml,
                new BpmnImportOptions { FallbackApproverRole = "Reviewers" });

            var approval = SingleOfType(result.Definition, WorkflowNodeType.Approval);
            var roles = Assert.IsType<List<string>>(approval.Config["CandidateRoles"]);

            Assert.Equal(new[] { "Reviewers" }, roles);
            Assert.Contains(result.Warnings, w => w.ElementId == "T" && w.Message.Contains("names no assignee"));
        }

        // ── Refusals ─────────────────────────────────────────────────────────

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("<definitions><process id='P'")]
        public void Unusable_input_fails_with_a_reason_instead_of_throwing(string xml)
        {
            var result = Import(xml);

            Assert.False(result.Success);
            Assert.NotEmpty(result.Errors);
        }

        [Fact]
        public void A_document_with_no_process_is_refused()
        {
            var result = Import("<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL' />");

            Assert.False(result.Success);
            Assert.Contains(result.Errors, e => e.Contains("no <process>"));
        }
    }
}
