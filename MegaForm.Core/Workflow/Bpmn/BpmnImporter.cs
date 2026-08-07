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

            if (options.Strict && result.UnsupportedElements.Count > 0)
            {
                var failure = BpmnImportResult.Failed(
                    "Strict import: " + result.UnsupportedElements.Count +
                    " element(s) cannot be represented in a MegaForm workflow.");
                failure.UnsupportedElements.AddRange(result.UnsupportedElements);
                failure.Warnings.AddRange(result.Warnings);
                return failure;
            }

            if (definition.Nodes.Count == 0)
                return BpmnImportResult.Failed("The BPMN process has no element that maps to a workflow node.");

            // ── 2. Start node ────────────────────────────────────────────────
            definition.StartNodeId = ResolveStartNode(model, mapped, result);
            if (string.IsNullOrEmpty(definition.StartNodeId))
                return BpmnImportResult.Failed(
                    "Could not work out where the workflow starts: no start event with a usable outgoing flow.");

            // ── 3. Flows → edges ─────────────────────────────────────────────
            BuildEdges(model, mapped, definition, result);

            // ── 4. Gateway wiring that needs the edges to exist ──────────────
            ApplyConditionExpressions(model, mapped, definition, result);
            ApplySwitchCases(model, mapped, definition);
            PairForksWithJoins(model, mapped, definition, result);

            // ── 5. Layout ────────────────────────────────────────────────────
            ApplyLayout(model, mapped, definition);

            ReportOrphans(definition, result);

            result.Success    = true;
            result.Definition = definition;
            return result;
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

                    var edge = new WorkflowEdge
                    {
                        SourceNodeId = sourceNode.Id,
                        TargetNodeId = targetNodeId,
                        SourceHandle = HandleFor(model, sourceNode, element, flow),
                        Label        = flow.Name,
                        EdgeType     = EdgeTypeFor(sourceNode, flow),
                    };
                    definition.Edges.Add(edge);
                }
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

            // Fork edges are informational — the executor starts branches from
            // ForkNodeConfig.BranchStartNodeIds, not by walking handles.
            return "default";
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
            if (!string.IsNullOrEmpty(element.DefaultFlowId))
                return !string.Equals(element.DefaultFlowId, flow.Id, StringComparison.Ordinal);

            var conditioned = ConditionedFlowIds(model, element);
            if (conditioned.Count == 1)
                return string.Equals(conditioned[0], flow.Id, StringComparison.Ordinal);

            return element.OutgoingFlowIds.Count > 0 &&
                   string.Equals(element.OutgoingFlowIds[0], flow.Id, StringComparison.Ordinal);
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

        private bool IsDefaultFlow(BpmnModel model, BpmnElement element, BpmnSequenceFlow flow)
        {
            if (!string.IsNullOrEmpty(element.DefaultFlowId))
                return string.Equals(element.DefaultFlowId, flow.Id, StringComparison.Ordinal);
            return !flow.HasCondition && ConditionedFlowIds(model, element).Count > 0;
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
                    map.Node.Config["ConditionsJson"] = string.Empty;
                    result.Warn(element.Id, element.LocalName,
                        "Condition '" + (map.Node.Label ?? element.Id) + "' was left empty because " +
                        (reason ?? "the branch could not be identified") +
                        ". Set it before applying, or every submission takes the No branch.");
                }

                if (trueFlow != null && !string.IsNullOrWhiteSpace(trueFlow.Name))
                    map.Node.Config["TrueLabel"] = trueFlow.Name.Trim();
            }
        }

        private void ApplySwitchCases(
            BpmnModel model,
            Dictionary<string, BpmnMappedElement> mapped,
            WorkflowDefinition definition)
        {
            foreach (var element in model.Elements)
            {
                BpmnMappedElement map;
                if (!mapped.TryGetValue(element.Id, out map) || map == null || map.Node == null) continue;
                if (map.Node.Type != WorkflowNodeType.Switch) continue;

                var cases = new List<Dictionary<string, object>>();
                var index = 0;
                foreach (var flowId in element.OutgoingFlowIds)
                {
                    var flow = model.FindFlow(flowId);
                    if (flow == null || IsDefaultFlow(model, element, flow)) continue;

                    var entry = new Dictionary<string, object>();
                    entry["Id"]    = "case-" + index;
                    entry["Value"] = string.Empty; // the literal cannot be read reliably; author fills it
                    entry["Label"] = !string.IsNullOrWhiteSpace(flow.Name)
                        ? flow.Name.Trim()
                        : ("Case " + (index + 1));
                    cases.Add(entry);
                    index++;
                }
                map.Node.Config["Cases"] = cases;
            }
        }

        /// <summary>
        /// Records each Fork's branch entry points and the Join that closes it. The Join is the
        /// nearest node reachable from every branch — nearest by the longest hop count across
        /// branches, so a Join that only some branches reach early is not chosen over the real one.
        /// </summary>
        private void PairForksWithJoins(
            BpmnModel model,
            Dictionary<string, BpmnMappedElement> mapped,
            WorkflowDefinition definition,
            BpmnImportResult result)
        {
            var adjacency = BuildAdjacency(definition);

            foreach (var element in model.Elements)
            {
                BpmnMappedElement map;
                if (!mapped.TryGetValue(element.Id, out map) || map == null || map.Node == null) continue;
                if (map.Node.Type != WorkflowNodeType.Fork) continue;

                var branchStarts = new List<string>();
                foreach (var flowId in element.OutgoingFlowIds)
                {
                    var flow = model.FindFlow(flowId);
                    if (flow == null) continue;
                    var target = ResolveNodeTarget(model, mapped, flow.TargetRef);
                    if (!string.IsNullOrEmpty(target) && !branchStarts.Contains(target))
                        branchStarts.Add(target);
                }
                map.Node.Config["BranchStartNodeIds"] = branchStarts;

                var join = FindJoin(definition, adjacency, branchStarts);
                if (join != null)
                {
                    map.Node.Config["JoinNodeId"] = join;
                }
                else
                {
                    result.Warn(element.Id, element.LocalName,
                        "Parallel gateway '" + (map.Node.Label ?? element.Id) +
                        "' has no Join that all its branches reach — set the Join node before applying.");
                }
            }
        }

        private string FindJoin(
            WorkflowDefinition definition, Dictionary<string, List<string>> adjacency, List<string> branchStarts)
        {
            if (branchStarts.Count == 0) return null;

            var joinIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var node in definition.Nodes)
            {
                if (node.Type == WorkflowNodeType.Join) joinIds.Add(node.Id);
            }
            if (joinIds.Count == 0) return null;

            Dictionary<string, int> best = null;
            foreach (var start in branchStarts)
            {
                var distances = BreadthFirstDistances(adjacency, start);

                if (best == null)
                {
                    best = new Dictionary<string, int>(StringComparer.Ordinal);
                    foreach (var pair in distances)
                        if (joinIds.Contains(pair.Key)) best[pair.Key] = pair.Value;
                    continue;
                }

                var narrowed = new Dictionary<string, int>(StringComparer.Ordinal);
                foreach (var pair in best)
                {
                    int distance;
                    if (distances.TryGetValue(pair.Key, out distance))
                        narrowed[pair.Key] = Math.Max(pair.Value, distance);
                }
                best = narrowed;
                if (best.Count == 0) return null;
            }

            if (best == null || best.Count == 0) return null;

            string winner = null;
            var bestDistance = int.MaxValue;
            foreach (var pair in best)
            {
                if (pair.Value < bestDistance)
                {
                    bestDistance = pair.Value;
                    winner = pair.Key;
                }
            }
            return winner;
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
