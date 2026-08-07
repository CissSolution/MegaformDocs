using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace MegaForm.Core.Workflow.Bpmn
{
    // ══════════════════════════════════════════════════════════════════════════
    //  BpmnConditionTranslator  [BpmnImport B1 v20260807]
    //  BPMN conditionExpression → MegaForm ConditionsJson, for the subset that
    //  can be translated honestly.
    //
    //  BPMN does not define an expression language; files in the wild carry JUEL,
    //  FEEL, Groovy, JavaScript. This handles the one shape that means the same
    //  thing in all of them — a single `field op literal` comparison — and refuses
    //  everything else so the author gets a warning instead of a wrong condition.
    //  A wrong condition routes real submissions down the wrong branch; an empty
    //  one is caught by validation before it can.
    // ══════════════════════════════════════════════════════════════════════════

    public static class BpmnConditionTranslator
    {
        // ${...} / #{...} wrapper, optionally with surrounding whitespace.
        private static readonly Regex WrapperRegex =
            new Regex(@"^\s*[#$]\{(?<body>.*)\}\s*$", RegexOptions.Singleline);

        // field op literal — the field may be dotted (field.amount, execution.total).
        private static readonly Regex ComparisonRegex = new Regex(
            @"^\s*(?<field>[A-Za-z_][A-Za-z0-9_.]*)\s*(?<op>==|!=|>=|<=|=|>|<)\s*(?<value>.+?)\s*$",
            RegexOptions.Singleline);

        /// <summary>One comparison, taken apart. Field/Operator/Literal are what the rule needs.</summary>
        public class BpmnComparison
        {
            /// <summary>Form field key, with any field./execution./variable. qualifier removed.</summary>
            public string Field { get; set; }

            /// <summary>MegaForm ComparisonOperator name: eq, neq, gt, gte, lt, lte.</summary>
            public string Operator { get; set; }

            /// <summary>The literal exactly as it was written, quotes stripped.</summary>
            public string Literal { get; set; }

            /// <summary>True when the literal parses as a number.</summary>
            public bool IsNumeric { get; set; }
        }

        /// <summary>
        /// Translates one expression. Returns false when the expression is missing or is not a
        /// single comparison — the caller then refuses rather than guessing.
        /// </summary>
        public static bool TryTranslate(string expression, out string conditionsJson, out string reason)
        {
            conditionsJson = null;

            BpmnComparison comparison;
            if (!TryParseComparison(expression, out comparison, out reason)) return false;

            conditionsJson = BuildConditionsJson(comparison);
            return true;
        }

        /// <summary>Wraps one comparison as the ConditionsJson a Condition node expects.</summary>
        public static string BuildConditionsJson(BpmnComparison comparison)
        {
            if (comparison == null) return null;

            // The literal is written as a JSON STRING even when it is a number. WorkflowEvaluator
            // compares by calling ToString() on the deserialized value, which for a boxed double
            // formats in the HOST's culture — 0.5 becomes "0,5" on a vi-VN machine and then fails
            // the invariant-culture numeric parse, so every gt/lt silently returns false. Keeping
            // the author's own text means eq compares what they wrote and TryNum still parses it.
            return "{\"type\":\"group\",\"logic\":\"all\",\"children\":[" +
                   "{\"type\":\"rule\",\"field\":" + JsonString(comparison.Field) +
                   ",\"operator\":\"" + comparison.Operator + "\"," +
                   "\"value\":" + JsonString(comparison.Literal) + "}]}";
        }

        /// <summary>
        /// Breaks an expression into field / operator / literal, or explains why it cannot be.
        /// Exposed separately because a Switch import needs the parts, not the finished JSON.
        /// </summary>
        public static bool TryParseComparison(string expression, out BpmnComparison comparison, out string reason)
        {
            comparison = null;
            reason = null;

            if (string.IsNullOrWhiteSpace(expression))
            {
                reason = "the flow has no condition expression";
                return false;
            }

            var body = expression.Trim();
            var wrapped = WrapperRegex.Match(body);
            if (wrapped.Success) body = wrapped.Groups["body"].Value.Trim();

            // Anything with boolean glue is more than one comparison. Refuse rather than
            // translate the first half and silently drop the rest.
            if (body.IndexOf("&&", StringComparison.Ordinal) >= 0 ||
                body.IndexOf("||", StringComparison.Ordinal) >= 0 ||
                Regex.IsMatch(body, @"\b(and|or|not)\b", RegexOptions.IgnoreCase))
            {
                reason = "the expression combines several conditions";
                return false;
            }

            var match = ComparisonRegex.Match(body);
            if (!match.Success)
            {
                reason = "the expression is not a simple 'field op value' comparison";
                return false;
            }

            var field = NormaliseField(match.Groups["field"].Value);
            if (string.IsNullOrEmpty(field))
            {
                reason = "the expression has no field to compare";
                return false;
            }

            var op = MapOperator(match.Groups["op"].Value);
            if (op == null)
            {
                reason = "the comparison operator is not supported";
                return false;
            }

            bool isNumeric;
            var literal = ParseLiteral(match.Groups["value"].Value, out isNumeric);
            if (literal == null)
            {
                reason = "the value being compared is not a plain literal";
                return false;
            }

            // >, >=, <, <= are numeric-only at run time: WorkflowEvaluator parses both sides with
            // TryNum and returns false when either fails. A relational rule against a word can
            // therefore never fire, which looks like a working condition that simply never matches.
            if (!isNumeric && (op == "gt" || op == "gte" || op == "lt" || op == "lte"))
            {
                reason = "a >/< comparison needs a numeric value, and '" + literal + "' is not one";
                return false;
            }

            comparison = new BpmnComparison
            {
                Field     = field,
                Operator  = op,
                Literal   = literal,
                IsNumeric = isNumeric,
            };
            return true;
        }

        /// <summary>
        /// Condition rules look values up by raw form-field key, so a `field.`/`execution.`
        /// qualifier from the source expression has to come off or nothing ever matches.
        /// </summary>
        private static string NormaliseField(string raw)
        {
            var field = (raw ?? string.Empty).Trim();
            string[] prefixes = { "field.", "execution.", "submission.", "variables.", "variable." };
            foreach (var prefix in prefixes)
            {
                if (field.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    field = field.Substring(prefix.Length);
                    break;
                }
            }
            return field.Trim();
        }

        private static string MapOperator(string op)
        {
            switch (op)
            {
                case "==":
                case "=":  return "eq";
                case "!=": return "neq";
                case ">":  return "gt";
                case ">=": return "gte";
                case "<":  return "lt";
                case "<=": return "lte";
                default:   return null;
            }
        }

        /// <summary>
        /// Returns the literal as plain text — the author's own token, quotes stripped — or null
        /// when it is not a literal at all. Deliberately does NOT renormalise a number through
        /// double: the run-time `eq` is a string comparison, so rewriting "10.50" as "10.5" would
        /// stop it matching the value a form actually submitted.
        /// </summary>
        private static string ParseLiteral(string raw, out bool isNumeric)
        {
            isNumeric = false;
            var text = (raw ?? string.Empty).Trim();
            if (text.Length == 0) return null;

            if ((text.StartsWith("\"", StringComparison.Ordinal) && text.EndsWith("\"", StringComparison.Ordinal) && text.Length >= 2) ||
                (text.StartsWith("'", StringComparison.Ordinal)  && text.EndsWith("'", StringComparison.Ordinal)  && text.Length >= 2))
            {
                var inner = text.Substring(1, text.Length - 2);
                double quoted;
                isNumeric = double.TryParse(inner, NumberStyles.Any, CultureInfo.InvariantCulture, out quoted);
                return inner;
            }

            if (string.Equals(text, "true", StringComparison.OrdinalIgnoreCase))  return "true";
            if (string.Equals(text, "false", StringComparison.OrdinalIgnoreCase)) return "false";

            double number;
            if (double.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out number))
            {
                isNumeric = true;
                return text;
            }

            // A bare identifier is another variable, not a literal — comparing two variables
            // is not something a MegaForm condition rule can express.
            return null;
        }

        /// <summary>
        /// A condition that can never be true, for an import that could not translate the real one.
        ///
        /// An EMPTY ConditionsJson is not neutral: WorkflowEvaluator.EvaluateCondition returns TRUE
        /// for null-or-whitespace, so leaving it blank sends every submission down the Yes branch —
        /// on a gateway whose Yes branch is "approve and pay", that pays everyone. Disabling the
        /// node does not help either; ConditionNodeExecutor routes IsDisabled to "true" as well.
        /// This sentinel compares a key no form can have against a value it could not hold, so the
        /// unfinished import falls to No until an author fills it in.
        /// </summary>
        public static string UnresolvedConditionJson()
        {
            return "{\"type\":\"group\",\"logic\":\"all\",\"children\":[" +
                   "{\"type\":\"rule\",\"field\":\"__bpmn_condition_not_imported\"," +
                   "\"operator\":\"eq\",\"value\":\"__set_this_condition__\"}]}";
        }

        private static string JsonString(string value)
        {
            var text = value ?? string.Empty;
            var sb = new System.Text.StringBuilder(text.Length + 2);
            sb.Append('"');
            foreach (var c in text)
            {
                switch (c)
                {
                    case '"':  sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n");  break;
                    case '\r': sb.Append("\\r");  break;
                    case '\t': sb.Append("\\t");  break;
                    default:
                        if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
            return sb.ToString();
        }
    }
}
