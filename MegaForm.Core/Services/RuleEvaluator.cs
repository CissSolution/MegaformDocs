using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Evaluates RuleDefinition trees against a form data dictionary.
    /// Compatible with net472 (C# 7.3) and net8/9/10.
    /// Mirrors the TypeScript evaluator in megaform-rule-engine.js exactly.
    /// </summary>
    public static class RuleEvaluator
    {
        // ── Public API ───────────────────────────────────────────────────────

        public static EvaluationResult EvaluateRule(
            RuleDefinition rule,
            IDictionary<string, object> formData)
        {
            var matched = rule.Enabled && EvaluateNode(rule.When, formData);
            var actions = matched ? rule.Then : rule.Else;

            var effects = actions
                .Where(a => !string.IsNullOrWhiteSpace(a.Target))
                .Select(a => new EvaluationEffect
                {
                    Action         = a.Action,
                    TargetType     = a.TargetType,
                    Target         = a.Target,
                    Value          = a.Value,
                    SourceRuleId   = rule.Id,
                    SourceRuleName = rule.Name
                })
                .ToList();

            return new EvaluationResult { Matched = matched, Effects = effects };
        }

        public static List<EvaluationEffect> EvaluateRules(
            IEnumerable<RuleDefinition> rules,
            IDictionary<string, object> formData)
        {
            return rules
                .OrderBy(r => r.Priority)
                .SelectMany(r => EvaluateRule(r, formData).Effects)
                .ToList();
        }

        public static List<string> ValidateStructure(ConditionGroup group)
        {
            var errors = new List<string>();
            if (group.Children == null || group.Children.Count == 0)
                errors.Add(string.Format("Group {0} has no children.", group.Id));

            foreach (var child in group.Children ?? new List<ConditionNode>())
            {
                if (child is ConditionGroup nested)
                    errors.AddRange(ValidateStructure(nested));
                else if (child is ConditionRule rule && string.IsNullOrWhiteSpace(rule.Field))
                    errors.Add(string.Format("Rule {0} is missing field.", rule.Id));
            }
            return errors;
        }

        // ── Internal ─────────────────────────────────────────────────────────

        private static bool EvaluateNode(ConditionNode node, IDictionary<string, object> formData)
        {
            if (node is ConditionRule rule)
            {
                object val;
                formData.TryGetValue(rule.Field, out val);
                return Compare(rule, val);
            }

            if (node is ConditionGroup group)
            {
                var results = group.Children.Select(c => EvaluateNode(c, formData));
                return group.Logic == RuleLogicOperator.all
                    ? results.All(r => r)
                    : results.Any(r => r);
            }

            return false;
        }

        private static bool Compare(ConditionRule rule, object actualRaw)
        {
            var actual   = Normalize(actualRaw);
            var expected = Normalize(rule.Value);

            switch (rule.Operator)
            {
                case ComparisonOperator.eq:         return Equals(actual, expected);
                case ComparisonOperator.neq:        return !Equals(actual, expected);
                case ComparisonOperator.gt:         return ToDecimal(actual) > ToDecimal(expected);
                case ComparisonOperator.gte:        return ToDecimal(actual) >= ToDecimal(expected);
                case ComparisonOperator.lt:         return ToDecimal(actual) < ToDecimal(expected);
                case ComparisonOperator.lte:        return ToDecimal(actual) <= ToDecimal(expected);
                case ComparisonOperator.contains:
                    return (actual?.ToString() ?? "").IndexOf(
                        expected?.ToString() ?? "", StringComparison.OrdinalIgnoreCase) >= 0;
                case ComparisonOperator.startsWith:
                    return (actual?.ToString() ?? "").StartsWith(
                        expected?.ToString() ?? "", StringComparison.OrdinalIgnoreCase);
                case ComparisonOperator.endsWith:
                    return (actual?.ToString() ?? "").EndsWith(
                        expected?.ToString() ?? "", StringComparison.OrdinalIgnoreCase);
                case ComparisonOperator.@in:
                    return ToArray(expected).Any(item => Equals(item, actual));
                case ComparisonOperator.notIn:
                    return ToArray(expected).All(item => !Equals(item, actual));
                case ComparisonOperator.isEmpty:
                    return actual == null || string.IsNullOrWhiteSpace(actual.ToString());
                case ComparisonOperator.isNotEmpty:
                    return !(actual == null || string.IsNullOrWhiteSpace(actual.ToString()));
                case ComparisonOperator.isTrue:     return Equals(actual, true);
                case ComparisonOperator.isFalse:    return Equals(actual, false);
                default: return false;
            }
        }

        private static object Normalize(object value)
        {
            if (value == null) return null;

            // Unwrap Newtonsoft.Json JValue / System.Text.Json.JsonElement
            var typeName = value.GetType().FullName ?? "";
            if (typeName.Contains("JsonElement") || typeName.Contains("JValue"))
            {
                var str = value.ToString();
                return Normalize(str);
            }

            if (value is string text)
            {
                var trimmed = text.Trim();
                if (trimmed == "true")  return true;
                if (trimmed == "false") return false;
                decimal d;
                if (decimal.TryParse(trimmed, out d)) return d;
                return trimmed;
            }

            return value;
        }

        private static decimal ToDecimal(object value)
        {
            if (value == null) return 0m;
            if (value is decimal dv) return dv;
            if (value is int iv)     return iv;
            if (value is long lv)    return lv;
            if (value is double dbv) return (decimal)dbv;
            if (value is float fv)   return (decimal)fv;
            decimal parsed;
            if (decimal.TryParse(value.ToString(), out parsed)) return parsed;
            return 0m;
        }

        private static IEnumerable<object> ToArray(object value)
        {
            if (value == null)           return new object[0];
            if (value is object[] arr)   return arr;
            var enumerable = value as IEnumerable<object>;
            if (enumerable != null)      return enumerable;
            return new[] { value };
        }
    }
}
