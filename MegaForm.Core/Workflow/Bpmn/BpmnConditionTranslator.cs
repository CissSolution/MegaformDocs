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

        /// <summary>
        /// Translates one expression. Returns false when the expression is missing or is not a
        /// single comparison — the caller then leaves the condition empty and warns.
        /// </summary>
        public static bool TryTranslate(string expression, out string conditionsJson, out string reason)
        {
            conditionsJson = null;
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

            var literal = ParseLiteral(match.Groups["value"].Value);
            if (literal == null)
            {
                reason = "the value being compared is not a plain literal";
                return false;
            }

            conditionsJson =
                "{\"type\":\"group\",\"logic\":\"all\",\"children\":[" +
                "{\"type\":\"rule\",\"field\":" + JsonString(field) +
                ",\"operator\":\"" + op + "\"," +
                "\"value\":" + literal + "}]}";
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

        /// <summary>Returns the literal as a JSON value, or null when it is not a literal at all.</summary>
        private static string ParseLiteral(string raw)
        {
            var text = (raw ?? string.Empty).Trim();
            if (text.Length == 0) return null;

            if ((text.StartsWith("\"", StringComparison.Ordinal) && text.EndsWith("\"", StringComparison.Ordinal) && text.Length >= 2) ||
                (text.StartsWith("'", StringComparison.Ordinal)  && text.EndsWith("'", StringComparison.Ordinal)  && text.Length >= 2))
            {
                return JsonString(text.Substring(1, text.Length - 2));
            }

            if (string.Equals(text, "true", StringComparison.OrdinalIgnoreCase))  return "true";
            if (string.Equals(text, "false", StringComparison.OrdinalIgnoreCase)) return "false";

            double number;
            if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out number))
                return number.ToString("R", CultureInfo.InvariantCulture);

            // A bare identifier is another variable, not a literal — comparing two variables
            // is not something a MegaForm condition rule can express.
            return null;
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
