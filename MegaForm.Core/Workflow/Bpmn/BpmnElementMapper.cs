using System;
using System.Collections.Generic;
using System.Globalization;
using MegaForm.Core.Models;
// DelayTimeParser lives under Services.Workflow with the Delay executor it was written for;
// reusing it here keeps BPMN's ISO-8601 durations and the Delay node reading the same grammar.
using MegaForm.Core.Services.Workflow;

namespace MegaForm.Core.Workflow.Bpmn
{
    // ══════════════════════════════════════════════════════════════════════════
    //  BpmnElementMapper  [BpmnImport B1 v20260807]
    //  One BPMN flow node → one MegaForm node, or nothing.
    //
    //  "Nothing" comes in two flavours and they are not the same thing:
    //    · PASS-THROUGH — the element carries no behaviour we need to keep (a plain
    //      start event, a gateway with one way out). Edges route straight through it.
    //    · UNSUPPORTED  — we cannot represent it. Strict mode fails the import;
    //      lenient mode leaves a disabled placeholder so the author sees the hole.
    //  Neither is ever a silent drop.
    // ══════════════════════════════════════════════════════════════════════════

    public class BpmnMappedElement
    {
        /// <summary>Null for pass-through elements.</summary>
        public WorkflowNode Node { get; set; }

        public bool IsPassThrough { get; set; }
        public bool IsUnsupported { get; set; }

        public static BpmnMappedElement PassThrough()
        {
            return new BpmnMappedElement { IsPassThrough = true };
        }
    }

    public static class BpmnElementMapper
    {
        /// <summary>
        /// Hint an author can put on a serviceTask to choose the node type outright:
        /// megaform:type="webhook|email|database|googlesheets" (xmlns:megaform="http://megaform.io/bpmn/1.0").
        /// </summary>
        public const string TypeHintAttribute = "type";

        public static BpmnMappedElement Map(
            BpmnElement element,
            BpmnImportOptions options,
            BpmnImportResult result)
        {
            if (element == null) return BpmnMappedElement.PassThrough();
            options = options ?? new BpmnImportOptions();

            var localName = (element.LocalName ?? string.Empty).ToLowerInvariant();

            switch (localName)
            {
                case "startevent":
                    return MapStartEvent(element, result);

                case "endevent":
                    return Node(element, WorkflowNodeType.End, EndConfig(element));

                case "usertask":
                case "manualtask":
                    return Node(element, WorkflowNodeType.Approval, ApprovalConfig(element, options, result));

                case "servicetask":
                    return MapServiceTask(element, result);

                case "sendtask":
                    return Node(element, WorkflowNodeType.SendEmail, EmailConfig(element));

                case "scripttask":
                    return MapScriptTask(element, result);

                case "exclusivegateway":
                    return MapExclusiveGateway(element, result);

                case "parallelgateway":
                    return MapParallelGateway(element, result);

                case "intermediatecatchevent":
                    return MapIntermediateCatchEvent(element, options, result);

                default:
                    return Unsupported(element, options, result, null);
            }
        }

        // ── Events ───────────────────────────────────────────────────────────

        private static BpmnMappedElement MapStartEvent(BpmnElement element, BpmnImportResult result)
        {
            // A start event carries no work — the workflow simply begins at whatever it points
            // to. Its trigger, however, IS behaviour, and MegaForm has exactly one trigger:
            // a form submission. Say so rather than let the author assume the timer survived.
            if (element.HasDescendant("timerEventDefinition"))
                result.Warn(element.Id, element.LocalName,
                    "Timer start event: MegaForm workflows start on form submission, so the timer trigger is ignored.");
            else if (element.HasDescendant("messageEventDefinition") || element.HasDescendant("signalEventDefinition"))
                result.Warn(element.Id, element.LocalName,
                    "Message/signal start event: MegaForm workflows start on form submission, so the trigger is ignored.");

            return BpmnMappedElement.PassThrough();
        }

        private static BpmnMappedElement MapIntermediateCatchEvent(
            BpmnElement element, BpmnImportOptions options, BpmnImportResult result)
        {
            var timer = element.FindDescendant("timerEventDefinition");
            if (timer == null)
                return Unsupported(element, options, result, "only timer intermediate events are supported");

            var config = new Dictionary<string, object>();

            var duration = ChildText(timer, "timeDuration");
            var date     = ChildText(timer, "timeDate");
            var cycle    = ChildText(timer, "timeCycle");

            if (!string.IsNullOrWhiteSpace(cycle))
                result.Warn(element.Id, element.LocalName,
                    "timeCycle is not supported — the delay will fire once, not on a cycle.");

            TimeSpan parsed;
            if (!string.IsNullOrWhiteSpace(duration) &&
                DelayTimeParser.TryParseIso8601Duration(duration.Trim(), out parsed))
            {
                config["DelaySeconds"] = (int)Math.Round(parsed.TotalSeconds);
            }
            else if (!string.IsNullOrWhiteSpace(date))
            {
                // Kept as an expression: the Delay executor resolves {{field.x}} templates and
                // parses plain ISO-8601 dates through the same path, so both forms work here.
                config["UntilExpression"] = date.Trim();
            }
            else if (!string.IsNullOrWhiteSpace(duration))
            {
                // A duration we could not parse is still worth carrying over — the executor
                // resolves it at run time and reports a clear error if it is still nonsense.
                config["UntilExpression"] = duration.Trim();
                result.Warn(element.Id, element.LocalName,
                    "Could not read '" + duration.Trim() + "' as an ISO-8601 duration; kept as an expression to resolve at run time.");
            }
            else
            {
                result.Warn(element.Id, element.LocalName,
                    "Timer event has no timeDuration or timeDate — set a delay on the node before applying.");
            }

            return Node(element, WorkflowNodeType.Delay, config);
        }

        // ── Tasks ────────────────────────────────────────────────────────────

        private static BpmnMappedElement MapServiceTask(BpmnElement element, BpmnImportResult result)
        {
            // MegaFormAttribute, not ExtensionAttribute: only a hint written for MegaForm counts as
            // the author choosing the node type. camunda:type="external" is not that.
            var hint = (element.MegaFormAttribute(TypeHintAttribute) ?? string.Empty).Trim().ToLowerInvariant();
            var guessed = false;

            if (hint.Length == 0)
            {
                hint = GuessServiceType(element.Name);
                guessed = true;
            }

            WorkflowNodeType type;
            Dictionary<string, object> config;

            switch (hint)
            {
                case "email":
                case "sendemail":
                    type = WorkflowNodeType.SendEmail;
                    config = EmailConfig(element);
                    break;
                case "database":
                case "db":
                case "sql":
                    type = WorkflowNodeType.Database;
                    config = new Dictionary<string, object>();
                    break;
                case "googlesheets":
                case "sheets":
                    type = WorkflowNodeType.GoogleSheets;
                    config = new Dictionary<string, object>();
                    break;
                default:
                    type = WorkflowNodeType.Webhook;
                    config = WebhookConfig(element);
                    break;
            }

            if (guessed)
                result.Warn(element.Id, element.LocalName,
                    "No megaform:type on this service task, so it was read as " + type +
                    " from its name. Set megaform:type=\"webhook|email|database|googlesheets\" to be explicit.");

            result.Warn(element.Id, element.LocalName,
                type + " node '" + DisplayName(element) + "' has no connection details — fill them in before applying.");

            return Node(element, type, config);
        }

        private static string GuessServiceType(string name)
        {
            var text = (name ?? string.Empty).ToLowerInvariant();
            if (text.Contains("mail")) return "email";
            if (text.Contains("sheet")) return "googlesheets";
            if (text.Contains("sql") || text.Contains("database") || text.Contains(" db") || text == "db")
                return "database";
            return "webhook";
        }

        private static BpmnMappedElement MapScriptTask(BpmnElement element, BpmnImportResult result)
        {
            // A script is code in someone else's language. Import the box, not the contents,
            // and disable it so an unconverted script cannot quietly do nothing at run time.
            result.Warn(element.Id, element.LocalName,
                "Script task '" + DisplayName(element) +
                "': the script itself cannot be translated. Imported as a disabled Set variable node — replace it.");

            var config = new Dictionary<string, object>();
            config["VariableKey"] = "scriptResult";
            config["Value"]       = string.Empty;

            var mapped = Node(element, WorkflowNodeType.SetVariable, config);
            mapped.Node.IsDisabled = true;
            return mapped;
        }

        // ── Gateways ─────────────────────────────────────────────────────────

        private static BpmnMappedElement MapExclusiveGateway(BpmnElement element, BpmnImportResult result)
        {
            var outgoing = element.OutgoingFlowIds.Count;

            // One way out is not a decision. Routing through it changes nothing, and a
            // Condition node with no condition would fail validation for no reason.
            if (outgoing <= 1)
                return BpmnMappedElement.PassThrough();

            if (outgoing == 2)
            {
                var config = new Dictionary<string, object>();
                config["TrueLabel"]  = "Yes";
                config["FalseLabel"] = "No";
                // ConditionsJson is filled by the importer, which is where the flows (and so
                // the expressions) are known.
                return Node(element, WorkflowNodeType.Condition, config);
            }

            result.Warn(element.Id, element.LocalName,
                "Gateway '" + DisplayName(element) + "' has " + outgoing +
                " outgoing flows — imported as a Switch. Set the field to match on before applying.");

            var switchConfig = new Dictionary<string, object>();
            switchConfig["MatchMode"] = "equals";
            switchConfig["FieldKey"]  = string.Empty;
            return Node(element, WorkflowNodeType.Switch, switchConfig);
        }

        private static BpmnMappedElement MapParallelGateway(BpmnElement element, BpmnImportResult result)
        {
            var outgoing = element.OutgoingFlowIds.Count;
            var incoming = element.IncomingFlowIds.Count;

            if (outgoing > 1)
                return Node(element, WorkflowNodeType.Fork, new Dictionary<string, object>());

            if (incoming > 1)
                return Node(element, WorkflowNodeType.Join, new Dictionary<string, object>());

            // One in, one out: a diverging gateway that diverges nowhere.
            return BpmnMappedElement.PassThrough();
        }

        // ── Configs ──────────────────────────────────────────────────────────

        private static Dictionary<string, object> EndConfig(BpmnElement element)
        {
            var config = new Dictionary<string, object>();
            config["EndType"] = (int)EndType.Success;
            if (!string.IsNullOrWhiteSpace(element.Name))
                config["Message"] = element.Name.Trim();
            return config;
        }

        private static Dictionary<string, object> ApprovalConfig(
            BpmnElement element, BpmnImportOptions options, BpmnImportResult result)
        {
            var config = new Dictionary<string, object>();

            var users = SplitList(element.ExtensionAttribute("candidateUsers"));
            var roles = SplitList(element.ExtensionAttribute("candidateRoles"));

            // Fall back to BPMN's own assignment attributes when no megaform:* hint is present.
            // ExtensionAttribute already prefers a namespaced attribute, so megaform:candidateUsers
            // wins over a bare candidateUsers on the same element.
            if (users.Count == 0)
            {
                var assignee = element.ExtensionAttribute("assignee");
                if (!string.IsNullOrWhiteSpace(assignee)) users.Add(assignee.Trim());
            }
            if (roles.Count == 0) roles = SplitList(element.ExtensionAttribute("candidateGroups"));

            if (users.Count == 0 && roles.Count == 0)
            {
                roles.Add(options.FallbackApproverRole ?? "Administrator");
                result.Warn(element.Id, element.LocalName,
                    "Task '" + DisplayName(element) + "' names no assignee — approval assigned to role '" +
                    (options.FallbackApproverRole ?? "Administrator") + "'.");
            }

            if (users.Count > 0) config["CandidateUsers"] = users;
            if (roles.Count > 0) config["CandidateRoles"] = roles;

            var dueHours = element.MegaFormAttribute("dueInHours");
            int hours;
            if (!string.IsNullOrWhiteSpace(dueHours) &&
                int.TryParse(dueHours.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out hours) &&
                hours > 0)
            {
                config["DueInHours"] = hours;
            }

            return config;
        }

        private static Dictionary<string, object> EmailConfig(BpmnElement element)
        {
            var config = new Dictionary<string, object>();
            var to = element.MegaFormAttribute("to");
            if (!string.IsNullOrWhiteSpace(to)) config["To"] = to.Trim();

            var subject = element.MegaFormAttribute("subject");
            config["Subject"] = !string.IsNullOrWhiteSpace(subject)
                ? subject.Trim()
                : DisplayName(element);
            return config;
        }

        private static Dictionary<string, object> WebhookConfig(BpmnElement element)
        {
            var config = new Dictionary<string, object>();
            var url = element.MegaFormAttribute("url");
            if (!string.IsNullOrWhiteSpace(url)) config["Url"] = url.Trim();

            var method = (element.MegaFormAttribute("method") ?? string.Empty).Trim().ToUpperInvariant();
            WebhookMethod parsed;
            config["Method"] = (int)(Enum.TryParse(method, true, out parsed) ? parsed : WebhookMethod.POST);
            return config;
        }

        // ── Unsupported ──────────────────────────────────────────────────────

        private static BpmnMappedElement Unsupported(
            BpmnElement element, BpmnImportOptions options, BpmnImportResult result, string reason)
        {
            var label = element.LocalName + (string.IsNullOrWhiteSpace(element.Name)
                ? string.Empty
                : " (" + element.Name.Trim() + ")");
            var entry = label + " [" + (element.Id ?? "no id") + "]";
            if (!string.IsNullOrEmpty(reason)) entry += " — " + reason;
            result.UnsupportedElements.Add(entry);

            if (options.Strict)
                return new BpmnMappedElement { IsUnsupported = true };

            // Lenient: keep the shape of the diagram. A disabled node is skipped at run time
            // and is impossible to miss in the editor.
            var config = new Dictionary<string, object>();
            config["VariableKey"] = "unsupported";
            config["Value"]       = string.Empty;

            var mapped = Node(element, WorkflowNodeType.SetVariable, config);
            mapped.Node.Label      = "UNSUPPORTED: " + element.LocalName +
                                     (string.IsNullOrWhiteSpace(element.Name) ? string.Empty : " " + element.Name.Trim());
            mapped.Node.IsDisabled = true;
            mapped.IsUnsupported   = true;
            return mapped;
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private static BpmnMappedElement Node(
            BpmnElement element, WorkflowNodeType type, Dictionary<string, object> config)
        {
            var node = new WorkflowNode
            {
                Type     = type,
                Label    = DisplayName(element),
                Config   = config ?? new Dictionary<string, object>(),
                ZoneType = WorkflowZoneType.Action,
            };
            return new BpmnMappedElement { Node = node };
        }

        private static string DisplayName(BpmnElement element)
        {
            if (element == null) return "Imported step";
            if (!string.IsNullOrWhiteSpace(element.Name)) return element.Name.Trim();
            return !string.IsNullOrWhiteSpace(element.Id) ? element.Id : element.LocalName;
        }

        private static List<string> SplitList(string raw)
        {
            var list = new List<string>();
            if (string.IsNullOrWhiteSpace(raw)) return list;

            foreach (var part in raw.Split(',', ';'))
            {
                var trimmed = part.Trim();
                if (trimmed.Length > 0) list.Add(trimmed);
            }
            return list;
        }

        private static string ChildText(System.Xml.Linq.XElement parent, string localName)
        {
            if (parent == null) return null;
            foreach (var child in parent.Elements())
            {
                if (string.Equals(child.Name.LocalName, localName, StringComparison.OrdinalIgnoreCase))
                    return child.Value;
            }
            return null;
        }
    }
}
