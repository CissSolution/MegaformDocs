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

            // A STRING, even though 1000 is a number. WorkflowEvaluator compares by calling
            // ToString() on the deserialized value, which for a boxed double formats in the host's
            // culture — 0.5 would become "0,5" on this machine's locale and then fail the
            // invariant-culture numeric parse, so every gt/lt would quietly return false.
            Assert.Contains("\"value\":\"1000\"", json);
        }

        [Fact]
        public void A_numeric_literal_keeps_the_authors_own_text()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <exclusiveGateway id='G' default='F2' />
    <endEvent id='E1' /><endEvent id='E2' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='G' />
    <sequenceFlow id='F1' sourceRef='G' targetRef='E1'>
      <conditionExpression>${total == 10.50}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id='F2' sourceRef='G' targetRef='E2' />
  </process>
</definitions>";

            var result = Import(xml);
            var json = (string)SingleOfType(result.Definition, WorkflowNodeType.Condition).Config["ConditionsJson"];

            // Not "10.5": the run-time eq is a string comparison, so renormalising through double
            // would stop it matching the value a form actually submitted.
            Assert.Contains("\"value\":\"10.50\"", json);
        }

        [Fact]
        public void A_relational_comparison_against_a_word_is_refused_rather_than_never_firing()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <exclusiveGateway id='G' default='F2' />
    <endEvent id='E1' /><endEvent id='E2' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='G' />
    <sequenceFlow id='F1' sourceRef='G' targetRef='E1'>
      <conditionExpression>${grade &gt; 'B'}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id='F2' sourceRef='G' targetRef='E2' />
  </process>
</definitions>";

            var result = Import(xml);

            // gt/lt are numeric-only at run time, so a rule against 'B' could never fire — that
            // reads as a working condition that simply never matches. Refuse and say why.
            Assert.Contains(result.Warnings, w => w.Message.Contains("needs a numeric value"));
        }

        [Fact]
        public void An_expression_we_cannot_translate_fails_closed_towards_the_No_branch()
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
            var json = (string)condition.Config["ConditionsJson"];

            // NOT empty. WorkflowEvaluator.EvaluateCondition returns TRUE for a blank
            // ConditionsJson, so leaving it empty would send every submission down the YES branch —
            // auto-approving on exactly the gateways where a human meant to decide. The sentinel
            // compares a key no form can have, so it can never be true.
            Assert.NotEqual(string.Empty, json);
            Assert.Contains("__bpmn_condition_not_imported", json);

            Assert.Contains(result.Warnings, w => w.Message.Contains("combines several conditions"));
            Assert.Contains(result.Warnings, w => w.Message.Contains("takes the No branch"));
        }

        [Fact]
        public void The_fail_closed_condition_is_json_the_evaluator_can_read()
        {
            var result = Import(TwoWayGateway);
            var good = (string)SingleOfType(result.Definition, WorkflowNodeType.Condition).Config["ConditionsJson"];

            // Both the translated and the sentinel form must survive the round trip the engine
            // does — a malformed sentinel would be caught by EvaluateCondition's catch and treated
            // as false, which happens to be right, but for the wrong reason and only by luck.
            foreach (var json in new[] { good, BpmnConditionTranslator.UnresolvedConditionJson() })
            {
                var parsed = Newtonsoft.Json.Linq.JObject.Parse(json);
                Assert.Equal("group", (string)parsed["type"]);
                var children = (Newtonsoft.Json.Linq.JArray)parsed["children"];
                Assert.Single(children);
                Assert.Equal("rule", (string)children[0]["type"]);
                Assert.False(string.IsNullOrWhiteSpace((string)children[0]["field"]));
                Assert.False(string.IsNullOrWhiteSpace((string)children[0]["operator"]));
            }
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
        public void Parallel_gateways_are_refused_because_the_runtime_cannot_execute_them()
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

            // Fork and Join exist in WorkflowNodeType but are NOT in SupportedNodeTypes.All and
            // have no executor, and WorkflowEvaluator rejects an unsupported type with severity
            // "error" in BOTH Draft and Apply mode. Importing them would produce a definition that
            // cannot even be SAVED — an import that reports success and then fails at the first
            // save is worse than one that says what it cannot do.
            Assert.DoesNotContain(result.Definition.Nodes, n => n.Type == WorkflowNodeType.Fork);
            Assert.DoesNotContain(result.Definition.Nodes, n => n.Type == WorkflowNodeType.Join);
            Assert.Equal(2, result.UnsupportedElements.Count(u => u.Contains("parallelGateway")));
            Assert.Contains(result.UnsupportedElements, u => u.Contains("no runtime executor"));

            // The two tasks between them still arrive, as disabled placeholders' neighbours.
            Assert.Contains(result.Definition.Nodes, n => n.Label == "Notify finance");
            Assert.Contains(result.Definition.Nodes, n => n.Label == "Notify HR");
        }

        [Fact]
        public void Strict_mode_refuses_a_parallel_gateway_outright()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <parallelGateway id='Fork' />
    <serviceTask id='A' name='A' /><serviceTask id='B' name='B' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='Fork' />
    <sequenceFlow id='F1' sourceRef='Fork' targetRef='A' />
    <sequenceFlow id='F2' sourceRef='Fork' targetRef='B' />
  </process>
</definitions>";

            var result = Import(xml, strict: true);
            Assert.False(result.Success);
        }

        // ── Approval outcomes ────────────────────────────────────────────────

        [Fact]
        public void An_approvals_two_exits_get_the_handles_the_engine_resumes_with()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <userTask id='T' name='Manager approval' />
    <serviceTask id='Pay' name='Pay claim' />
    <sendTask id='Tell' name='Notify rejection' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='T' />
    <sequenceFlow id='F_ok' name='Approve' sourceRef='T' targetRef='Pay' />
    <sequenceFlow id='F_no' name='Reject' sourceRef='T' targetRef='Tell' />
  </process>
</definitions>";

            var result = Import(xml);
            var approval = SingleOfType(result.Definition, WorkflowNodeType.Approval);
            var edges = EdgesFrom(result.Definition, approval.Id);

            // WorkflowTaskService resumes with "approved"/"rejected", and the engine falls back to
            // the first "default" edge when it finds no exact match. Two "default" edges therefore
            // sent a REJECTED claim down the approval path — on this diagram, it paid it.
            Assert.Equal("Pay claim",
                NodeById(result.Definition, edges.Single(e => e.SourceHandle == "approved").TargetNodeId).Label);
            Assert.Equal("Notify rejection",
                NodeById(result.Definition, edges.Single(e => e.SourceHandle == "rejected").TargetNodeId).Label);
            Assert.DoesNotContain(edges, e => e.SourceHandle == "default");
        }

        [Fact]
        public void An_approval_with_one_exit_keeps_default_and_says_rejection_follows_it()
        {
            var result = Import(LinearProcess);
            var approval = SingleOfType(result.Definition, WorkflowNodeType.Approval);

            // BPMN modelled no reject path, so both outcomes continue the same way. That is a
            // faithful import — but the author has to be told, not left to find out in production.
            Assert.Equal("default", EdgesFrom(result.Definition, approval.Id).Single().SourceHandle);
            Assert.Contains(result.Warnings, w => w.Message.Contains("rejection continues down the same path"));
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

        // ── Gateway shapes that used to route silently wrong ─────────────────

        [Fact]
        public void A_switch_reads_its_field_and_case_values_from_the_gateway_conditions()
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
            var node = SingleOfType(result.Definition, WorkflowNodeType.Switch);
            var cases = Assert.IsType<List<Dictionary<string, object>>>(node.Config["Cases"]);

            // The gateway already says which field and which values; reading them beats leaving
            // placeholders. An empty case value MATCHES — SwitchNodeExecutor compares the resolved
            // field against it with string equality — so case 0 used to catch every submission and
            // the default branch was unreachable.
            Assert.Equal("region", node.Config["FieldKey"]);
            Assert.Equal("EU", cases[0]["Value"]);
            Assert.Equal("US", cases[1]["Value"]);
            Assert.False(node.IsDisabled);
        }

        [Fact]
        public void A_switch_whose_conditions_cannot_be_read_is_imported_switched_off()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <exclusiveGateway id='G' name='Route' default='F3' />
    <endEvent id='E1' /><endEvent id='E2' /><endEvent id='E3' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='G' />
    <sequenceFlow id='F1' sourceRef='G' targetRef='E1'>
      <conditionExpression>${region == 'EU'}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id='F2' sourceRef='G' targetRef='E2'>
      <conditionExpression>${score &gt; 10}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id='F3' sourceRef='G' targetRef='E3' />
  </process>
</definitions>";

            var result = Import(xml);
            var node = SingleOfType(result.Definition, WorkflowNodeType.Switch);

            // Two different fields: a Switch tests ONE field against N values, so this gateway was
            // doing something it cannot express. Disabled means the executor returns
            // "handle::default" — the diagram's own default branch, the one safe landing place.
            Assert.True(node.IsDisabled);
            Assert.Equal(string.Empty, node.Config["FieldKey"]);
            Assert.Contains(result.Warnings, w => w.Message.Contains("imported switched OFF"));
        }

        [Fact]
        public void A_default_attribute_that_names_a_foreign_flow_is_ignored_and_reported()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <exclusiveGateway id='G' name='Big?' default='F_stale' />
    <endEvent id='E1' name='Yes side' /><endEvent id='E2' name='No side' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='G' />
    <sequenceFlow id='F_yes' sourceRef='G' targetRef='E1'>
      <conditionExpression>${amount &gt; 1000}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id='F_no' sourceRef='G' targetRef='E2' />
  </process>
</definitions>";

            var result = Import(xml);
            var condition = SingleOfType(result.Definition, WorkflowNodeType.Condition);
            var edges = EdgesFrom(result.Definition, condition.Id);

            // A stale default made `flow.Id != default` true for EVERY exit, so both edges were
            // written "true", no "false" edge existed, and a false result fell off the end of the
            // workflow. Falling back to the conditioned flow is the honest reading.
            Assert.Equal("Yes side", NodeById(result.Definition, edges.Single(e => e.SourceHandle == "true").TargetNodeId).Label);
            Assert.Equal("No side",  NodeById(result.Definition, edges.Single(e => e.SourceHandle == "false").TargetNodeId).Label);
            Assert.Contains(result.Warnings, w => w.Message.Contains("not one of its exits"));
        }

        [Fact]
        public void Only_one_exit_can_be_the_default_and_the_rest_become_cases()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <exclusiveGateway id='G' name='Route' />
    <endEvent id='E1' name='EU' /><endEvent id='E2' name='US' /><endEvent id='E3' name='Rest' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='G' />
    <sequenceFlow id='F1' sourceRef='G' targetRef='E1'>
      <conditionExpression>${region == 'EU'}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id='F2' sourceRef='G' targetRef='E2' />
    <sequenceFlow id='F3' sourceRef='G' targetRef='E3' />
  </process>
</definitions>";

            var result = Import(xml);
            var node = SingleOfType(result.Definition, WorkflowNodeType.Switch);
            var edges = EdgesFrom(result.Definition, node.Id);

            // Every unconditioned exit used to get "default", and the engine takes the FIRST edge
            // with a matching handle — so the third exit was unreachable without a word being said.
            Assert.Single(edges.Where(e => e.SourceHandle == "default"));
            Assert.Contains(result.Warnings, w => w.Message.Contains("exits with no condition"));
        }

        [Fact]
        public void A_condition_on_a_flow_that_no_gateway_enforces_is_reported()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <serviceTask id='A' name='Charge card' />
    <endEvent id='E' />
    <sequenceFlow id='F0' sourceRef='S' targetRef='A' />
    <sequenceFlow id='F1' sourceRef='A' targetRef='E'>
      <conditionExpression>${amount &gt; 0}</conditionExpression>
    </sequenceFlow>
  </process>
</definitions>";

            var result = Import(xml);

            // MegaForm gates at Condition/Switch nodes, never on an edge. Carrying the condition
            // over as edge styling would imply a gate that does not exist.
            Assert.Contains(result.Warnings, w => w.Message.Contains("is not enforced"));
        }

        // ── Documents with more than one pool ─────────────────────────────────

        [Fact]
        public void A_collaboration_imports_the_executable_pool_and_names_the_ones_it_skipped()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <collaboration id='C'>
    <participant id='P1' name='Customer' processRef='Proc_black_box' />
    <participant id='P2' name='Us' processRef='Proc_real' />
  </collaboration>
  <process id='Proc_black_box' name='Customer' />
  <process id='Proc_other' name='Other pool'>
    <startEvent id='S9' /><endEvent id='E9' />
    <sequenceFlow id='F9' sourceRef='S9' targetRef='E9' />
  </process>
  <process id='Proc_real' name='Us' isExecutable='true'>
    <startEvent id='S' />
    <userTask id='T' name='Review' />
    <endEvent id='E' />
    <sequenceFlow id='F1' sourceRef='S' targetRef='T' />
    <sequenceFlow id='F2' sourceRef='T' targetRef='E' />
  </process>
</definitions>";

            var result = Import(xml);

            // Taking index 0 was wrong twice: other pools vanished with Success=true, and a
            // black-box participant sitting first made the importer refuse an importable file.
            Assert.True(result.Success);
            Assert.Equal("Us", result.Definition.Name);
            Assert.Contains(result.Warnings, w => w.Message.Contains("Proc_other"));
            Assert.Contains(result.Warnings, w => w.Message.Contains("empty pool"));
        }

        [Fact]
        public void An_element_the_reader_does_not_model_is_listed_rather_than_dropped()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <adHocSubProcess id='Ad' name='Gather evidence' />
    <endEvent id='E' />
    <sequenceFlow id='F1' sourceRef='S' targetRef='Ad' />
    <sequenceFlow id='F2' sourceRef='Ad' targetRef='E' />
  </process>
</definitions>";

            var lenient = Import(xml);
            Assert.Contains(lenient.UnsupportedElements, u => u.Contains("adHocSubProcess"));

            // Strict has to fail on these too — otherwise it reported success while quietly
            // truncating the workflow at the element it did not recognise.
            Assert.False(Import(xml, strict: true).Success);
        }

        [Fact]
        public void Steps_inside_a_subprocess_do_not_become_top_level_nodes()
        {
            const string xml = @"
<definitions xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL'>
  <process id='P'>
    <startEvent id='S' />
    <subProcess id='Sub' name='Collect documents'>
      <startEvent id='InnerS' />
      <userTask id='InnerT' name='Upload passport' />
      <endEvent id='InnerE' />
      <sequenceFlow id='IF1' sourceRef='InnerS' targetRef='InnerT' />
    </subProcess>
    <endEvent id='E' />
    <sequenceFlow id='F1' sourceRef='S' targetRef='Sub' />
    <sequenceFlow id='F2' sourceRef='Sub' targetRef='E' />
  </process>
</definitions>";

            var result = Import(xml);

            // The subProcess stands for that work as one unsupported placeholder; hoisting its
            // children as well produced phantom nodes nothing pointed at.
            Assert.DoesNotContain(result.Definition.Nodes, n => n.Label == "Upload passport");
            Assert.Contains(result.UnsupportedElements, u => u.Contains("subProcess"));
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
