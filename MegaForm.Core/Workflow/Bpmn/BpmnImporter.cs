using System;
using System.Collections.Generic;
using MegaForm.Core.Models;

namespace MegaForm.Core.Workflow.Bpmn
{
    // ══════════════════════════════════════════════════════════════════════════
    //  BpmnImporter  [BpmnImport B1 v20260807]
    //  BPMN 2.0 XML → WorkflowDefinition.
    //
    //  BpmnElementMapper decides what each element becomes; this class does the
    //  wiring that needs the whole graph: which node the workflow starts at,
    //  where every sequence flow lands once pass-through elements are removed,
    //  which handle each edge leaves by, which Join closes which Fork, and where
    //  the nodes sit on the canvas.
    //
    //  The result is deliberately a DRAFT. Imported service tasks and gateways
    //  carry no connection details or field keys — those cannot be read from
    //  BPMN — so the definition is expected to fail Apply-time validation until
    //  an author fills them in. Warnings say exactly which ones.
    // ══════════════════════════════════════════════════════════════════════════

    public class BpmnImporter
    {
        private const double LayoutColumnWidth = 240;
        private const double LayoutRowHeight   = 130;

        public BpmnImportResult Import(string bpmnXml, BpmnImportOptions options)
        {
            options = options ?? new BpmnImportOptions();

            BpmnModel model;
            string parseError;
            if (!BpmnModel.TryParse(bpmnXml, out model, out parseError))
                return BpmnImportResult.Failed(parseError);

            var result = new BpmnImportResult();

            // ── 1. Elements → nodes ──────────────────────────────────────────
            var mapped = new Dictionary<string, BpmnMappedElement>(StringComparer.Ordinal);
            var definition = new WorkflowDefinition
            {
                FormId = options.FormId,
                Name   = FirstNonEmpty(options.WorkflowName, model.ProcessName, "Imported BPMN workflow"),
            };

            foreach (var element in model.Elements)
            {
                var map = BpmnElementMapper.Map(element, options, result);
                mapped[element.Id] = map;
                if (map.Node != null) definition.Nodes.Add(map.Node);
            }

            ReportSkippedProcesses(model, result);

            // Unknown elements reached the mapper through Elements and came back as unsupported,
            // so strict mode refuses on them exactly as it does on a subProcess — otherwise strict
            // reported success while the workflow was quietly truncated at the element it did not
            // recognise.
            if (options.Strict && result.UnsupportedElements.Count > 0)
                return Fail(result, "Strict import: " + result.UnsupportedElements.Count +
                                    " element(s) cannot be represented in a MegaForm workflow.");

            if (definition.Nodes.Count == 0)
                return Fail(result, "The BPMN process has no element that maps to a workflow node.");

            // ── 2. Start node ────────────────────────────────────────────────
            definition.StartNodeId = ResolveStartNode(model, mapped, result);
            if (string.IsNullOrEmpty(definition.StartNodeId))
                return Fail(result,
                    "Could not work out where the workflow starts: no start event with a usable outgoing flow.");

            // ── 3. Flows → edges ─────────────────────────────────────────────
            BuildEdges(model, mapped, definition, result);

            // ── 4. Gateway wiring that needs the edges to exist ──────────────
            ApplyConditionExpressions(model, mapped, definition, result);
            ApplySwitchCases(model, mapped, definition, result);

            // ── 5. Layout ────────────────────────────────────────────────────
            ApplyLayout(model, mapped, definition);

            ReportOrphans(definition, result);

            result.Success    = true;
            result.Definition = definition;
            return result;
        }

        /// <summary>
        /// Fails while keeping everything learned so far. A bare BpmnImportResult.Failed starts a
        /// fresh result, so a refusal late in the run threw away the warnings and the unsupported
        /// list — leaving the author with "could not work out where the workflow starts" and no
        /// mention of the element that broke the chain, which is the very thing they need.
        /// </summary>
        private static BpmnImportResult Fail(BpmnImportResult accumulated, string error)
        {
            var failure = BpmnImportResult.Failed(error);
            failure.Warnings.AddRange(accumulated.Warnings);
            failure.UnsupportedElements.AddRange(accumulated.UnsupportedElements);
            return failure;
        }

        // ── Start ────────────────────────────────────────────────────────────

        private string ResolveStartNode(
            BpmnModel model, Dictionary<string, BpmnMappedElement> mapped, BpmnImportResult result)
        {
            var startEvents = new List<BpmnElement>();
            foreach (var element in model.Elements)
            {
                if (string.Equals(element.LocalName, "startEvent", StringComparison.OrdinalIgnoreCase))
                    startEvents.Add(element);
            }

            if (startEvents.Count > 1)
                result.Warn(startEvents[0].Id, "startEvent",
                    "The process has " + startEvents.Count +
                    " start events; MegaForm runs one workflow per submission, so the first one is used.");

            foreach (var start in startEvents)
            {
                var target = ResolveNodeTarget(model, mapped, start.Id);
                if (!string.IsNullOrEmpty(target)) return target;
            }

            // No start event (or none that leads anywhere): fall back to a node nothing points at.
            var incoming = new HashSet<string>(StringComparer.Ordinal);
            foreach (var flow in model.Flows)
            {
                var targetNode = ResolveNodeTarget(model, mapped, flow.TargetRef);
                if (targetNode != null) incoming.Add(targetNode);
            }
            foreach (var node in MappedNodes(mapped))
            {
                if (!incoming.Contains(node.Id))
                {
                    result.Warn(null, "process",
                        "No usable start event — the workflow starts at '" + (node.Label ?? node.Id) + "' instead.");
                    return node.Id;
                }
            }
            return null;
        }

        private static IEnumerable<WorkflowNode> MappedNodes(Dictionary<string, BpmnMappedElement> mapped)
        {
            foreach (var entry in mapped)
            {
                if (entry.Value != null && entry.Value.Node != null)
                    yield return entry.Value.Node;
            }
        }

        /// <summary>
        /// Follows an element reference to the workflow node it actually lands on, walking
        /// through pass-through elements (start events, single-exit gateways). Returns null
        /// when the chain dead-ends or forks — the caller warns rather than guessing.
        /// </summary>
        private string ResolveNodeTarget(
            BpmnModel model, Dictionary<string, BpmnMappedElement> mapped, string elementId)
        {
            var visited = new HashSet<string>(StringComparer.Ordinal);
            var current = elementId;

            while (!string.IsNullOrEmpty(current))
            {
                BpmnMappedElement map;
                if (mapped.TryGetValue(current, out map) && map != null && map.Node != null)
                    return map.Node.Id;

                // A pass-through with anything other than exactly one exit is ambiguous, and a
                // loop back to somewhere we have already been would spin here forever.
                if (!visited.Add(current)) return null;

                var element = model.FindElement(current);
                if (element == null || element.OutgoingFlowIds.Count != 1) return null;

                var flow = model.FindFlow(element.OutgoingFlowIds[0]);
                current = flow != null ? flow.TargetRef : null;
            }
            return null;
        }

        // ── Edges ────────────────────────────────────────────────────────────

        private void BuildEdges(
            BpmnModel model,
            Dictionary<string, BpmnMappedElement> mapped,
            WorkflowDefinition definition,
            BpmnImportResult result)
        {
            foreach (var element in model.Elements)
            {
                BpmnMappedElement map;
                if (!mapped.TryGetValue(element.Id, out map) || map == null || map.Node == null)
                    continue; // pass-through: its flows are absorbed by ResolveNodeTarget

                var sourceNode = map.Node;
                var outgoing = element.OutgoingFlowIds;

                for (var i = 0; i < outgoing.Count; i++)
                {
                    var flow = model.FindFlow(outgoing[i]);
                    if (flow == null) continue;

                    var targetNodeId = ResolveNodeTarget(model, mapped, flow.TargetRef);
                    if (string.IsNullOrEmpty(targetNodeId))
                    {
                        result.Warn(flow.Id, "sequenceFlow",
                            "Flow from '" + (sourceNode.Label ?? sourceNode.Id) +
                            "' does not reach a node that MegaForm runs, so it was not imported.");
                        continue;
                    }

                    var handle = HandleFor(model, sourceNode, element, flow);

                    // A condition on a flow leaving anything but a gateway is not enforced by
                    // anything downstream — MegaForm decides at Condition/Switch nodes, not on
                    // edges. Say so rather than let a styled "conditional" edge imply a gate.
                    if (flow.HasCondition &&
                        sourceNode.Type != WorkflowNodeType.Condition &&
                        sourceNode.Type != WorkflowNodeType.Switch)
                    {
                        result.Warn(flow.Id, "sequenceFlow",
                            "The condition on the flow out of '" + (sourceNode.Label ?? sourceNode.Id) +
                            "' is not enforced — this step now continues for every submission.");
                    }

                    definition.Edges.Add(new WorkflowEdge
                    {
                        SourceNodeId = sourceNode.Id,
                        TargetNodeId = targetNodeId,
                        SourceHandle = handle,
                        Label        = flow.Name,
                        EdgeType     = EdgeTypeFor(sourceNode, flow),
                    });
                }

                WarnAboutExitShape(model, element, sourceNode, result);
            }
        }

        /// <summary>
        /// Warnings about a node's exits as a whole — the decisions that cannot be explained one
        /// flow at a time, and that an author would otherwise only discover in production.
        /// </summary>
        private void WarnAboutExitShape(
            BpmnModel model, BpmnElement element, WorkflowNode sourceNode, BpmnImportResult result)
        {
            var label = sourceNode.Label ?? element.Id;
            var exits = element.OutgoingFlowIds.Count;

            if (!string.IsNullOrEmpty(element.DefaultFlowId) && EffectiveDefaultFlowId(element) == null)
                result.Warn(element.Id, element.LocalName,
                    "'" + label + "' has a default flow attribute pointing at '" + element.DefaultFlowId +
                    "', which is not one of its exits; it was ignored.");

            if (sourceNode.Type == WorkflowNodeType.Approval)
            {
                if (exits == 1)
                    result.Warn(element.Id, element.LocalName,
                        "'" + label + "' has one exit, so a rejection continues down the same path as an " +
                        "approval. Draw a second flow for the rejection if they should differ.");
                else if (exits > 2)
                    result.Warn(element.Id, element.LocalName,
                        "'" + label + "' has " + exits + " exits; an approval has only two outcomes, so " +
                        "only the approve and reject paths will ever run.");
                return;
            }

            if (sourceNode.Type == WorkflowNodeType.Condition)
            {
                var conditioned = ConditionedFlowIds(model, element).Count;
                if (EffectiveDefaultFlowId(element) == null && conditioned != 1)
                    result.Warn(element.Id, element.LocalName,
                        conditioned == 0
                            ? "Neither exit of '" + label + "' carries a condition, so document order decided " +
                              "which one is Yes."
                            : "Both exits of '" + label + "' carry a condition, but a MegaForm condition has one " +
                              "test: the first was kept and the other branch became the No path.");
                return;
            }

            if (sourceNode.Type == WorkflowNodeType.Switch)
            {
                var unconditioned = 0;
                foreach (var flowId in element.OutgoingFlowIds)
                {
                    var flow = model.FindFlow(flowId);
                    if (flow != null && !flow.HasCondition) unconditioned++;
                }
                if (EffectiveDefaultFlowId(element) == null && unconditioned > 1)
                    result.Warn(element.Id, element.LocalName,
                        "'" + label + "' has " + unconditioned + " exits with no condition and no default " +
                        "flow; the first was treated as the default and the rest became cases you must fill in.");
            }
        }

        private string HandleFor(
            BpmnModel model, WorkflowNode sourceNode, BpmnElement element, BpmnSequenceFlow flow)
        {
            if (sourceNode.Type == WorkflowNodeType.Condition)
                return IsTrueBranch(model, element, flow) ? "true" : "false";

            if (sourceNode.Type == WorkflowNodeType.Switch)
            {
                if (IsDefaultFlow(model, element, flow)) return "default";
                return "case:" + CaseIndexOf(model, element, flow);
            }

            if (sourceNode.Type == WorkflowNodeType.Approval)
                return ApprovalHandleFor(model, element, flow);

            return "default";
        }

        /// <summary>
        /// Which outcome an approval's exit belongs to.
        ///
        /// This is not cosmetic. WorkflowTaskService resumes with the handle "approved" or
        /// "rejected", and WorkflowEngineV2.ResolveNextFromEdge falls back to the first
        /// "default"-handled edge when it finds no exact match. Writing both exits as "default" —
        /// which is what every non-gateway node used to get — therefore sends a REJECTED claim
        /// down the approval path. On a diagram whose approve branch pays an expense, rejecting
        /// paid it.
        ///
        /// A userTask with one exit keeps "default" on purpose: BPMN modelled no reject path, so
        /// both outcomes continue the same way. BuildEdges warns about it.
        /// </summary>
        private string ApprovalHandleFor(BpmnModel model, BpmnElement element, BpmnSequenceFlow flow)
        {
            if (element.OutgoingFlowIds.Count <= 1) return "default";

            var rejectFlowId = RejectFlowIdOf(model, element);
            if (rejectFlowId == null) return "default";

            if (string.Equals(rejectFlowId, flow.Id, StringComparison.Ordinal)) return "rejected";

            // Only the first non-reject exit can be the approval; a third exit would be
            // unreachable whatever handle it carried, so it keeps "default" and BuildEdges warns.
            var approveFlowId = FirstFlowOtherThan(element, rejectFlowId);
            return string.Equals(approveFlowId, flow.Id, StringComparison.Ordinal) ? "approved" : "default";
        }

        /// <summary>
        /// Picks the rejection exit by name first — modellers label these "Reject", "No", "Denied" —
        /// then by the `default` attribute, then by document order. Returns null when the task has
        /// fewer than two exits.
        /// </summary>
        private static string RejectFlowIdOf(BpmnModel model, BpmnElement element)
        {
            if (element.OutgoingFlowIds.Count < 2) return null;

            foreach (var flowId in element.OutgoingFlowIds)
            {
                var flow = model.FindFlow(flowId);
                if (flow == null || string.IsNullOrWhiteSpace(flow.Name)) continue;

                var name = flow.Name.Trim().ToLowerInvariant();
                if (name.Contains("reject") || name.Contains("deny") || name.Contains("denied") ||
                    name.Contains("decline") || name == "no" || name.Contains("not approved"))
                    return flowId;
            }

            var explicitDefault = EffectiveDefaultFlowId(element);
            if (explicitDefault != null) return explicitDefault;

            return element.OutgoingFlowIds[1];
        }

        private static string FirstFlowOtherThan(BpmnElement element, string excludedFlowId)
        {
            foreach (var flowId in element.OutgoingFlowIds)
            {
                if (!string.Equals(flowId, excludedFlowId, StringComparison.Ordinal)) return flowId;
            }
            return null;
        }

        private WorkflowEdgeType EdgeTypeFor(WorkflowNode sourceNode, BpmnSequenceFlow flow)
        {
            if (sourceNode.Type == WorkflowNodeType.Fork) return WorkflowEdgeType.Fork;
            if (sourceNode.Type == WorkflowNodeType.Condition || sourceNode.Type == WorkflowNodeType.Switch)
                return WorkflowEdgeType.Conditional;
            return flow.HasCondition ? WorkflowEdgeType.Conditional : WorkflowEdgeType.Default;
        }

        /// <summary>
        /// Which of a two-way gateway's exits is the "yes". The `default` attribute is the
        /// authoritative answer when present — BPMN's default flow is by definition the one
        /// taken when the condition does not hold. Otherwise the flow carrying a condition is
        /// the yes; if both or neither carry one, document order decides and the caller warns.
        /// </summary>
        private bool IsTrueBranch(BpmnModel model, BpmnElement element, BpmnSequenceFlow flow)
        {
            var explicitDefault = EffectiveDefaultFlowId(element);
            if (explicitDefault != null)
                return !string.Equals(explicitDefault, flow.Id, StringComparison.Ordinal);

            var conditioned = ConditionedFlowIds(model, element);
            if (conditioned.Count == 1)
                return string.Equals(conditioned[0], flow.Id, StringComparison.Ordinal);

            return element.OutgoingFlowIds.Count > 0 &&
                   string.Equals(element.OutgoingFlowIds[0], flow.Id, StringComparison.Ordinal);
        }

        /// <summary>
        /// The gateway's `default` attribute, but only when it actually names one of this
        /// gateway's exits. A stale value — left behind by hand editing, a format conversion, or
        /// re-parenting a flow — would otherwise make `flow.Id != default` true for EVERY exit, so
        /// both branches of a two-way gateway would be written as "true" and the "false" branch
        /// would never exist. Returns null when the attribute is absent or dangling.
        /// </summary>
        private static string EffectiveDefaultFlowId(BpmnElement element)
        {
            var id = element.DefaultFlowId;
            if (string.IsNullOrEmpty(id)) return null;
            return element.OutgoingFlowIds.Contains(id) ? id : null;
        }

        private List<string> ConditionedFlowIds(BpmnModel model, BpmnElement element)
        {
            var ids = new List<string>();
            foreach (var flowId in element.OutgoingFlowIds)
            {
                var flow = model.FindFlow(flowId);
                if (flow != null && flow.HasCondition) ids.Add(flowId);
            }
            return ids;
        }

        /// <summary>
        /// Exactly one exit can be the default. Without this cap, every unconditioned exit of a
        /// three-way gateway got the "default" handle, and the engine takes the FIRST edge with a
        /// matching handle — so the second and third became unreachable without a word being said.
        /// </summary>
        private bool IsDefaultFlow(BpmnModel model, BpmnElement element, BpmnSequenceFlow flow)
        {
            var explicitDefault = EffectiveDefaultFlowId(element);
            if (explicitDefault != null)
                return string.Equals(explicitDefault, flow.Id, StringComparison.Ordinal);

            // No usable `default` attribute: the first exit with no condition plays that part,
            // and any further unconditioned exits become ordinary cases the author must fill in.
            var firstUnconditioned = FirstUnconditionedFlowId(model, element);
            return firstUnconditioned != null &&
                   string.Equals(firstUnconditioned, flow.Id, StringComparison.Ordinal);
        }

        private static string FirstUnconditionedFlowId(BpmnModel model, BpmnElement element)
        {
            foreach (var flowId in element.OutgoingFlowIds)
            {
                var flow = model.FindFlow(flowId);
                if (flow != null && !flow.HasCondition) return flowId;
            }
            return null;
        }

        /// <summary>
        /// Index of this flow among the gateway's non-default exits — must match the order the
        /// Switch node's Cases are written in, because the executor answers with "case:N" by
        /// position in that list.
        /// </summary>
        private int CaseIndexOf(BpmnModel model, BpmnElement element, BpmnSequenceFlow flow)
        {
            var index = 0;
            foreach (var flowId in element.OutgoingFlowIds)
            {
                var candidate = model.FindFlow(flowId);
                if (candidate == null) continue;
                if (IsDefaultFlow(model, element, candidate)) continue;
                if (string.Equals(flowId, flow.Id, StringComparison.Ordinal)) return index;
                index++;
            }
            return 0;
        }

        // ── Gateway detail ───────────────────────────────────────────────────

        private void ApplyConditionExpressions(
            BpmnModel model,
            Dictionary<string, BpmnMappedElement> mapped,
            WorkflowDefinition definition,
            BpmnImportResult result)
        {
            foreach (var element in model.Elements)
            {
                BpmnMappedElement map;
                if (!mapped.TryGetValue(element.Id, out map) || map == null || map.Node == null) continue;
                if (map.Node.Type != WorkflowNodeType.Condition) continue;

                BpmnSequenceFlow trueFlow = null;
                foreach (var flowId in element.OutgoingFlowIds)
                {
                    var flow = model.FindFlow(flowId);
                    if (flow != null && IsTrueBranch(model, element, flow)) { trueFlow = flow; break; }
                }

                string conditionsJson;
                string reason = "the branch could not be identified";
                if (trueFlow != null &&
                    BpmnConditionTranslator.TryTranslate(trueFlow.ConditionExpression, out conditionsJson, out reason))
                {
                    map.Node.Config["ConditionsJson"] = conditionsJson;
                }
                else
                {
                    // NOT an empty string: WorkflowEvaluator.EvaluateCondition returns TRUE for a
                    // blank ConditionsJson, so an untranslated gateway would send every submission
                    // down the YES branch — auto-approving on exactly the diagrams where a human
                    // meant to decide. The sentinel can never match, so it falls to No instead.
                    map.Node.Config["ConditionsJson"] = BpmnConditionTranslator.UnresolvedConditionJson();
                    result.Warn(element.Id, element.LocalName,
                        "Condition '" + (map.Node.Label ?? element.Id) + "' could not be translated because " +
                        (reason ?? "the branch could not be identified") +
                        ". Until you set it, every submission takes the No branch.");
                }

                if (trueFlow != null && !string.IsNullOrWhiteSpace(trueFlow.Name))
                    map.Node.Config["TrueLabel"] = trueFlow.Name.Trim();
            }
        }

        /// <summary>
        /// Fills a Switch's field and case values from the gateway's own conditions.
        ///
        /// A three-way `${region == 'EU'}` gateway already carries exactly what a Switch needs, so
        /// read it rather than leave placeholders. The placeholders were not merely unhelpful: an
        /// empty case Value MATCHES, because SwitchNodeExecutor compares the resolved field (empty,
        /// since FieldKey was empty too) against the case value with string equality. Case 0 caught
        /// every submission and the default branch was unreachable.
        ///
        /// When the conditions cannot be read — different fields, operators other than equality,
        /// expressions the translator refuses — the node is DISABLED. A disabled Switch returns
        /// "handle::default", which is the diagram's own default branch: the one place a routing
        /// decision the importer could not make can safely land.
        /// </summary>
        private void ApplySwitchCases(
            BpmnModel model,
            Dictionary<string, BpmnMappedElement> mapped,
            WorkflowDefinition definition,
            BpmnImportResult result)
        {
            foreach (var element in model.Elements)
            {
                BpmnMappedElement map;
                if (!mapped.TryGetValue(element.Id, out map) || map == null || map.Node == null) continue;
                if (map.Node.Type != WorkflowNodeType.Switch) continue;

                var cases = new List<Dictionary<string, object>>();
                var comparisons = new List<BpmnConditionTranslator.BpmnComparison>();
                var index = 0;
                var readable = true;

                foreach (var flowId in element.OutgoingFlowIds)
                {
                    var flow = model.FindFlow(flowId);
                    if (flow == null || IsDefaultFlow(model, element, flow)) continue;

                    BpmnConditionTranslator.BpmnComparison comparison;
                    string reason;
                    if (!BpmnConditionTranslator.TryParseComparison(flow.ConditionExpression, out comparison, out reason) ||
                        !string.Equals(comparison.Operator, "eq", StringComparison.Ordinal))
                    {
                        readable = false;
                        comparison = null;
                    }
                    comparisons.Add(comparison);

                    var entry = new Dictionary<string, object>();
                    entry["Id"]    = "case-" + index;
                    entry["Value"] = comparison != null ? comparison.Literal : string.Empty;
                    entry["Label"] = !string.IsNullOrWhiteSpace(flow.Name)
                        ? flow.Name.Trim()
                        : ("Case " + (index + 1));
                    cases.Add(entry);
                    index++;
                }

                map.Node.Config["Cases"] = cases;

                // Every case has to test the SAME field — a Switch compares one field against N
                // values. Mixed fields mean the gateway was doing something a Switch cannot.
                string field = null;
                if (readable && comparisons.Count > 0)
                {
                    foreach (var comparison in comparisons)
                    {
                        if (comparison == null) { readable = false; break; }
                        if (field == null) field = comparison.Field;
                        else if (!string.Equals(field, comparison.Field, StringComparison.OrdinalIgnoreCase))
                        {
                            readable = false;
                            break;
                        }
                    }
                }

                if (readable && !string.IsNullOrEmpty(field))
                {
                    map.Node.Config["FieldKey"] = field;
                    continue;
                }

                map.Node.Config["FieldKey"] = string.Empty;
                map.Node.IsDisabled = true;
                result.Warn(element.Id, element.LocalName,
                    "'" + (map.Node.Label ?? element.Id) + "' could not be read as a single field compared " +
                    "against fixed values, so it is imported switched OFF and every submission takes its " +
                    "default branch. Set the field and the case values, then enable it.");
            }
        }

        private static Dictionary<string, List<string>> BuildAdjacency(WorkflowDefinition definition)
        {
            var adjacency = new Dictionary<string, List<string>>(StringComparer.Ordinal);
            foreach (var edge in definition.Edges)
            {
                if (string.IsNullOrEmpty(edge.SourceNodeId) || string.IsNullOrEmpty(edge.TargetNodeId)) continue;
                List<string> targets;
                if (!adjacency.TryGetValue(edge.SourceNodeId, out targets))
                {
                    targets = new List<string>();
                    adjacency[edge.SourceNodeId] = targets;
                }
                if (!targets.Contains(edge.TargetNodeId)) targets.Add(edge.TargetNodeId);
            }
            return adjacency;
        }

        private static Dictionary<string, int> BreadthFirstDistances(
            Dictionary<string, List<string>> adjacency, string start)
        {
            var distances = new Dictionary<string, int>(StringComparer.Ordinal);
            if (string.IsNullOrEmpty(start)) return distances;

            var queue = new Queue<string>();
            distances[start] = 0;
            queue.Enqueue(start);

            while (queue.Count > 0)
            {
                var current = queue.Dequeue();
                List<string> targets;
                if (!adjacency.TryGetValue(current, out targets)) continue;

                foreach (var target in targets)
                {
                    if (distances.ContainsKey(target)) continue;
                    distances[target] = distances[current] + 1;
                    queue.Enqueue(target);
                }
            }
            return distances;
        }

        // ── Layout ───────────────────────────────────────────────────────────

        private void ApplyLayout(
            BpmnModel model, Dictionary<string, BpmnMappedElement> mapped, WorkflowDefinition definition)
        {
            var positioned = new HashSet<string>(StringComparer.Ordinal);

            foreach (var entry in mapped)
            {
                if (entry.Value == null || entry.Value.Node == null) continue;

                BpmnShapeBounds bounds;
                if (!model.Shapes.TryGetValue(entry.Key, out bounds)) continue;

                entry.Value.Node.Position = new CanvasPosition { X = bounds.X, Y = bounds.Y };
                positioned.Add(entry.Value.Node.Id);
            }

            if (positioned.Count == definition.Nodes.Count) return;

            // Whatever the file did not place gets a rank layout, so a diagram with no DI at
            // all still opens as a readable left-to-right chain instead of a pile at (0,0).
            var adjacency = BuildAdjacency(definition);
            var distances = BreadthFirstDistances(adjacency, definition.StartNodeId);
            var rowsPerColumn = new Dictionary<int, int>();

            foreach (var node in definition.Nodes)
            {
                if (positioned.Contains(node.Id)) continue;

                int rank;
                if (!distances.TryGetValue(node.Id, out rank)) rank = 0;

                int row;
                rowsPerColumn.TryGetValue(rank, out row);
                rowsPerColumn[rank] = row + 1;

                node.Position = new CanvasPosition
                {
                    X = rank * LayoutColumnWidth,
                    Y = row * LayoutRowHeight,
                };
            }
        }

        // ── Reporting ────────────────────────────────────────────────────────

        private void ReportOrphans(WorkflowDefinition definition, BpmnImportResult result)
        {
            var adjacency = BuildAdjacency(definition);
            var reachable = BreadthFirstDistances(adjacency, definition.StartNodeId);

            foreach (var node in definition.Nodes)
            {
                if (reachable.ContainsKey(node.Id)) continue;
                result.Warn(null, node.Type.ToString(),
                    "'" + (node.Label ?? node.Id) + "' cannot be reached from the start of the workflow.");
            }
        }

        /// <summary>
        /// A collaboration has one process per pool and MegaForm runs one workflow per submission,
        /// so only one pool can be imported. Which one, and what was left behind, must be said out
        /// loud — the alternative is a file that imports "successfully" as a third of itself.
        /// </summary>
        private static void ReportSkippedProcesses(BpmnModel model, BpmnImportResult result)
        {
            if (model.SkippedProcessIds.Count > 0)
            {
                result.Warn(model.ProcessId, "process",
                    "This document has " + (model.SkippedProcessIds.Count + 1) + " pools. Only '" +
                    (model.ProcessId ?? "the first") + "' was imported; " +
                    string.Join(", ", model.SkippedProcessIds.ToArray()) +
                    " were not, because a MegaForm workflow runs for one form.");
            }

            if (model.EmptyProcessIds.Count > 0)
            {
                result.Warn(model.ProcessId, "process",
                    "Ignored " + model.EmptyProcessIds.Count + " empty pool(s) (" +
                    string.Join(", ", model.EmptyProcessIds.ToArray()) +
                    ") — a black-box participant has nothing to import.");
            }
        }

        private static string FirstNonEmpty(params string[] values)
        {
            foreach (var value in values)
            {
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
            }
            return string.Empty;
        }
    }
}
