using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Xml.Linq;

namespace MegaForm.Core.Workflow.Bpmn
{
    // ══════════════════════════════════════════════════════════════════════════
    //  BpmnModel  [BpmnImport B1 v20260807]
    //  The BPMN XML flattened into just what the mapper needs: flow nodes,
    //  sequence flows, and diagram coordinates.
    //
    //  Everything matches on LOCAL NAME only. Exporters disagree about prefixes
    //  and namespace URIs — bpmn:, bpmn2:, semantic:, ns0:, and both the 2010 and
    //  the OMG namespace — and a namespace-sensitive reader silently returns an
    //  empty diagram for half the files people actually have.
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>A BPMN flow node: task, event, or gateway.</summary>
    public class BpmnElement
    {
        public string Id { get; set; }

        /// <summary>Local name, e.g. "userTask", "exclusiveGateway".</summary>
        public string LocalName { get; set; }

        public string Name { get; set; }

        /// <summary>The element itself, for reading child elements and extension attributes.</summary>
        public XElement Xml { get; set; }

        /// <summary>Flow ids leaving this element, in document order.</summary>
        public List<string> OutgoingFlowIds { get; set; }

        /// <summary>Flow ids arriving at this element.</summary>
        public List<string> IncomingFlowIds { get; set; }

        /// <summary>Value of the element's `default` attribute (a sequence flow id), if any.</summary>
        public string DefaultFlowId { get; set; }

        public BpmnElement()
        {
            OutgoingFlowIds = new List<string>();
            IncomingFlowIds = new List<string>();
        }

        /// <summary>
        /// Reads an extension attribute by local name — `megaform:type` and a bare `type`
        /// both answer to "type". Prefers a namespaced attribute over an unnamespaced one so
        /// a MegaForm hint always beats an incidental attribute of the same name.
        /// </summary>
        public string ExtensionAttribute(string localName)
        {
            if (Xml == null || string.IsNullOrEmpty(localName)) return null;

            string fallback = null;
            foreach (var attr in Xml.Attributes())
            {
                if (!string.Equals(attr.Name.LocalName, localName, StringComparison.OrdinalIgnoreCase))
                    continue;
                if (!string.IsNullOrEmpty(attr.Name.NamespaceName))
                    return attr.Value;
                fallback = attr.Value;
            }
            return fallback;
        }

        /// <summary>True when this element has a child (at any depth) with the given local name.</summary>
        public bool HasDescendant(string localName)
        {
            return FindDescendant(localName) != null;
        }

        public XElement FindDescendant(string localName)
        {
            if (Xml == null) return null;
            foreach (var child in Xml.Descendants())
            {
                if (string.Equals(child.Name.LocalName, localName, StringComparison.OrdinalIgnoreCase))
                    return child;
            }
            return null;
        }
    }

    /// <summary>A sequenceFlow between two flow nodes.</summary>
    public class BpmnSequenceFlow
    {
        public string Id { get; set; }
        public string SourceRef { get; set; }
        public string TargetRef { get; set; }
        public string Name { get; set; }

        /// <summary>Raw text of the conditionExpression child, if present.</summary>
        public string ConditionExpression { get; set; }

        public bool HasCondition
        {
            get { return !string.IsNullOrWhiteSpace(ConditionExpression); }
        }
    }

    /// <summary>Top-left corner of an element's shape in the diagram, when the file carries DI.</summary>
    public class BpmnShapeBounds
    {
        public double X { get; set; }
        public double Y { get; set; }
    }

    /// <summary>The parsed diagram. Build one with <see cref="TryParse"/>.</summary>
    public class BpmnModel
    {
        public List<BpmnElement> Elements { get; private set; }
        public List<BpmnSequenceFlow> Flows { get; private set; }

        /// <summary>Element id → shape bounds. Empty when the file has no BPMNDiagram.</summary>
        public Dictionary<string, BpmnShapeBounds> Shapes { get; private set; }

        /// <summary>Name of the first process element, used as the workflow name.</summary>
        public string ProcessName { get; private set; }

        /// <summary>Local names of elements found inside a process that are not flow nodes we model.</summary>
        public List<BpmnElement> UnknownElements { get; private set; }

        private readonly Dictionary<string, BpmnElement> _byId =
            new Dictionary<string, BpmnElement>(StringComparer.Ordinal);
        private readonly Dictionary<string, BpmnSequenceFlow> _flowsById =
            new Dictionary<string, BpmnSequenceFlow>(StringComparer.Ordinal);

        // Local names we treat as flow nodes. Anything else inside a process is either a
        // sequenceFlow (handled separately) or reported as unsupported — never dropped.
        private static readonly HashSet<string> FlowNodeNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "startEvent", "endEvent", "task", "userTask", "serviceTask", "sendTask", "receiveTask",
            "manualTask", "scriptTask", "businessRuleTask", "callActivity", "subProcess", "transaction",
            "exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway", "complexGateway",
            "intermediateCatchEvent", "intermediateThrowEvent", "boundaryEvent",
        };

        private BpmnModel()
        {
            Elements        = new List<BpmnElement>();
            Flows           = new List<BpmnSequenceFlow>();
            Shapes          = new Dictionary<string, BpmnShapeBounds>(StringComparer.Ordinal);
            UnknownElements = new List<BpmnElement>();
        }

        public BpmnElement FindElement(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            BpmnElement element;
            return _byId.TryGetValue(id, out element) ? element : null;
        }

        public BpmnSequenceFlow FindFlow(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            BpmnSequenceFlow flow;
            return _flowsById.TryGetValue(id, out flow) ? flow : null;
        }

        /// <summary>
        /// Parses BPMN XML. Returns false with a reason for malformed XML or a file with no
        /// process at all; an empty-but-valid process parses fine and fails later, in the
        /// mapper, where the message can be about the diagram rather than about XML.
        /// </summary>
        public static bool TryParse(string bpmnXml, out BpmnModel model, out string error)
        {
            model = null;
            error = null;

            if (string.IsNullOrWhiteSpace(bpmnXml))
            {
                error = "The BPMN document is empty.";
                return false;
            }

            // An XML declaration is only legal at offset zero, so a file that arrived through a
            // textarea, a clipboard, or a UTF-8 BOM-prefixed read fails to parse over whitespace
            // the author cannot even see. Strip it before handing the text to the parser.
            var text = bpmnXml.TrimStart('﻿', '​', ' ', '\t', '\r', '\n');

            XDocument doc;
            try
            {
                // No DTD processing: BPMN files arrive from outside and an external entity
                // reference must never become a file read.
                doc = XDocument.Parse(text, LoadOptions.None);
            }
            catch (Exception ex)
            {
                error = "The BPMN document is not well-formed XML: " + ex.Message;
                return false;
            }

            if (doc.Root == null)
            {
                error = "The BPMN document has no root element.";
                return false;
            }

            var processes = doc.Root.Descendants()
                .Where(e => string.Equals(e.Name.LocalName, "process", StringComparison.OrdinalIgnoreCase))
                .ToList();
            if (string.Equals(doc.Root.Name.LocalName, "process", StringComparison.OrdinalIgnoreCase))
                processes.Insert(0, doc.Root);

            if (processes.Count == 0)
            {
                error = "The BPMN document contains no <process> element.";
                return false;
            }

            var result = new BpmnModel();
            var process = processes[0];
            result.ProcessName = Attr(process, "name");

            result.ReadFlowNodes(process);
            result.ReadSequenceFlows(process);
            result.LinkFlows();
            result.ReadDiagram(doc.Root);

            model = result;
            return true;
        }

        // ── Reading ──────────────────────────────────────────────────────────

        private void ReadFlowNodes(XElement process)
        {
            // Descendants, not Elements: lanes wrap their children in laneSet/lane, and a
            // participant's flow nodes sit one level deeper again. Nested subProcess children
            // come along too — the subProcess itself is reported unsupported, and its children
            // are unreachable, which the mapper reports as orphans rather than executing.
            foreach (var el in process.Descendants())
            {
                var localName = el.Name.LocalName;
                if (string.Equals(localName, "sequenceFlow", StringComparison.OrdinalIgnoreCase)) continue;
                if (!FlowNodeNames.Contains(localName)) continue;

                var element = new BpmnElement
                {
                    Id            = Attr(el, "id"),
                    LocalName     = localName,
                    Name          = Attr(el, "name"),
                    Xml           = el,
                    DefaultFlowId = Attr(el, "default"),
                };

                if (string.IsNullOrEmpty(element.Id)) continue; // unreferenceable
                if (_byId.ContainsKey(element.Id)) continue;    // duplicate id — first wins

                _byId[element.Id] = element;
                Elements.Add(element);
            }
        }

        private void ReadSequenceFlows(XElement process)
        {
            foreach (var el in process.Descendants())
            {
                if (!string.Equals(el.Name.LocalName, "sequenceFlow", StringComparison.OrdinalIgnoreCase))
                    continue;

                var flow = new BpmnSequenceFlow
                {
                    Id        = Attr(el, "id"),
                    SourceRef = Attr(el, "sourceRef"),
                    TargetRef = Attr(el, "targetRef"),
                    Name      = Attr(el, "name"),
                };

                foreach (var child in el.Elements())
                {
                    if (string.Equals(child.Name.LocalName, "conditionExpression", StringComparison.OrdinalIgnoreCase))
                    {
                        flow.ConditionExpression = (child.Value ?? string.Empty).Trim();
                        break;
                    }
                }

                if (string.IsNullOrEmpty(flow.Id)) continue;
                if (_flowsById.ContainsKey(flow.Id)) continue;

                _flowsById[flow.Id] = flow;
                Flows.Add(flow);
            }
        }

        /// <summary>
        /// Builds each element's incoming/outgoing lists from the flows themselves rather than
        /// from the &lt;incoming&gt;/&lt;outgoing&gt; child elements — those are optional in the
        /// spec and several exporters omit them, while sourceRef/targetRef are mandatory.
        /// </summary>
        private void LinkFlows()
        {
            foreach (var flow in Flows)
            {
                var source = FindElement(flow.SourceRef);
                if (source != null) source.OutgoingFlowIds.Add(flow.Id);

                var target = FindElement(flow.TargetRef);
                if (target != null) target.IncomingFlowIds.Add(flow.Id);
            }
        }

        private void ReadDiagram(XElement root)
        {
            foreach (var shape in root.Descendants())
            {
                if (!string.Equals(shape.Name.LocalName, "BPMNShape", StringComparison.OrdinalIgnoreCase))
                    continue;

                var elementId = Attr(shape, "bpmnElement");
                if (string.IsNullOrEmpty(elementId)) continue;

                XElement bounds = null;
                foreach (var child in shape.Elements())
                {
                    if (string.Equals(child.Name.LocalName, "Bounds", StringComparison.OrdinalIgnoreCase))
                    {
                        bounds = child;
                        break;
                    }
                }
                if (bounds == null) continue;

                double x, y;
                if (!TryParseDouble(Attr(bounds, "x"), out x)) continue;
                if (!TryParseDouble(Attr(bounds, "y"), out y)) continue;

                Shapes[elementId] = new BpmnShapeBounds { X = x, Y = y };
            }
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private static string Attr(XElement element, string localName)
        {
            if (element == null) return null;
            foreach (var attr in element.Attributes())
            {
                if (string.Equals(attr.Name.LocalName, localName, StringComparison.OrdinalIgnoreCase))
                    return attr.Value;
            }
            return null;
        }

        private static bool TryParseDouble(string text, out double value)
        {
            // Diagram coordinates are always invariant-culture in the file; parsing them with
            // the ambient culture turns "120.5" into 1205 on a Vietnamese or German host.
            return double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
        }
    }
}
