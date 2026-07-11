using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using MegaForm.Core.Models;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Context passed to the shared rule evaluator. The same logical inputs are
    /// mirrored by the browser runtime so show/hide and server checks agree.
    /// </summary>
    public class RuleEvaluationContext
    {
        public Dictionary<string, object> Fields { get; set; }
        public Dictionary<string, string> Query { get; set; }
        public UserContext User { get; set; }
        public ISet<string> Permissions { get; set; }

        public RuleEvaluationContext()
        {
            Fields = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            Query = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            Permissions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        public static RuleEvaluationContext FromFields(Dictionary<string, object> fields)
        {
            var context = new RuleEvaluationContext();
            if (fields != null)
            {
                foreach (var pair in fields)
                    context.Fields[pair.Key] = pair.Value;
            }
            return context;
        }
    }

    /// <summary>
    /// Shared conditional rule engine for fields, roles, permissions, query string,
    /// and user context. Defaults are intentionally permissive for malformed/unknown
    /// showIf rules so old forms do not disappear because of a schema typo.
    /// </summary>
    public class SharedRuleEngine
    {
        public static bool Evaluate(ShowIfCondition showIf, Dictionary<string, object> fields)
        {
            return Evaluate(showIf, RuleEvaluationContext.FromFields(fields));
        }

        public static bool Evaluate(ShowIfCondition showIf, RuleEvaluationContext context)
        {
            if (showIf == null)
                return true;

            var rules = GetRules(showIf);
            if (rules.Count == 0)
                return true;

            var isOr = showIf.Operator == LogicOperator.Or;
            foreach (var rule in rules)
            {
                var result = EvaluateRule(rule, context ?? new RuleEvaluationContext());
                if (isOr && result)
                    return true;
                if (!isOr && !result)
                    return false;
            }

            return !isOr;
        }

        public static bool EvaluateRule(ShowIfRule rule, RuleEvaluationContext context)
        {
            if (rule == null)
                return true;

            context = context ?? new RuleEvaluationContext();
            var source = rule.SourceType;
            var key = GetRuleKey(rule);
            var target = rule.Value ?? string.Empty;
            var op = ResolveOperator(rule);
            var values = ResolveValues(source, key, context);

            return Compare(values, target, op);
        }

        /// <summary>Key a rule reads from, honouring the historical key/fieldKey/field aliases.</summary>
        internal static string GetRuleKey(ShowIfRule rule)
        {
            return rule == null ? string.Empty : FirstNonEmpty(rule.Key, rule.FieldKey, rule.Field);
        }

        internal static ConditionType ResolveOperator(ShowIfRule rule)
        {
            return rule.Operator.HasValue ? rule.Operator.Value : rule.Condition;
        }

        public static List<ShowIfRule> GetRules(ShowIfCondition showIf)
        {
            if (showIf == null)
                return new List<ShowIfRule>();

            if (showIf.Conditions != null && showIf.Conditions.Count > 0)
                return showIf.Conditions.Where(r => r != null).ToList();

            return (showIf.Rules ?? new List<ShowIfRule>()).Where(r => r != null).ToList();
        }

        internal static List<string> ResolveValues(RuleSourceType source, string key, RuleEvaluationContext context)
        {
            switch (source)
            {
                case RuleSourceType.Role:
                    return NormalizeMany(context.User != null ? context.User.Roles : null);

                case RuleSourceType.Permission:
                {
                    var values = NormalizeMany(context.Permissions);
                    if (context.User != null && (context.User.IsAdmin || context.User.IsSuperUser))
                        values.Add("*");
                    return values;
                }

                case RuleSourceType.Query:
                    return !string.IsNullOrWhiteSpace(key) && context.Query != null && context.Query.ContainsKey(key)
                        ? new List<string> { context.Query[key] ?? string.Empty }
                        : new List<string> { string.Empty };

                case RuleSourceType.User:
                    return ResolveUserValues(key, context.User);

                case RuleSourceType.Field:
                default:
                    return !string.IsNullOrWhiteSpace(key) && context.Fields != null && context.Fields.ContainsKey(key)
                        ? NormalizeValue(context.Fields[key])
                        : new List<string> { string.Empty };
            }
        }

        private static List<string> ResolveUserValues(string key, UserContext user)
        {
            if (user == null)
                return new List<string> { string.Empty };

            var k = (key ?? string.Empty).Trim();
            if (EqualsAny(k, "id", "userId"))
                return new List<string> { user.UserId.ToString(CultureInfo.InvariantCulture) };
            if (EqualsAny(k, "userName", "username", "name"))
                return new List<string> { user.UserName ?? string.Empty };
            if (EqualsAny(k, "displayName", "fullName"))
                return new List<string> { user.DisplayName ?? string.Empty };
            if (EqualsAny(k, "email", "emailAddress"))
                return new List<string> { user.Email ?? string.Empty };
            if (EqualsAny(k, "isAuthenticated", "authenticated"))
                return new List<string> { user.IsAuthenticated ? "true" : "false" };
            if (EqualsAny(k, "isAdmin", "admin"))
                return new List<string> { user.IsAdmin ? "true" : "false" };
            if (EqualsAny(k, "isSuperUser", "superUser", "host"))
                return new List<string> { user.IsSuperUser ? "true" : "false" };
            if (EqualsAny(k, "ip", "ipAddress"))
                return new List<string> { user.IpAddress ?? string.Empty };
            if (EqualsAny(k, "role", "roles"))
                return NormalizeMany(user.Roles);

            return new List<string> { string.Empty };
        }

        private static bool Compare(List<string> values, string target, ConditionType op)
        {
            bool result;
            // An operator we cannot evaluate stays permissive on this path: a schema typo must not
            // make a field vanish from an existing public form. Access decisions do not use this
            // path — RuleStaticEvaluator treats the same case as deny.
            return TryCompare(values, target, op, out result) ? result : true;
        }

        /// <summary>
        /// Compares resolved values against a target. Returns false when <paramref name="op"/> is not a
        /// value we know how to evaluate (e.g. an out-of-range enum from hand-edited JSON), leaving the
        /// caller to choose a permissive or fail-closed default rather than baking one in here.
        /// </summary>
        internal static bool TryCompare(List<string> values, string target, ConditionType op, out bool result)
        {
            values = values ?? new List<string>();
            target = target ?? string.Empty;
            result = false;

            switch (op)
            {
                case ConditionType.IsEmpty:
                    result = values.Count == 0 || values.All(string.IsNullOrWhiteSpace);
                    return true;

                case ConditionType.IsNotEmpty:
                    result = values.Any(v => !string.IsNullOrWhiteSpace(v));
                    return true;

                case ConditionType.Equals:
                    result = AnyTarget(values, target, true);
                    return true;

                case ConditionType.NotEquals:
                    result = !AnyTarget(values, target, true);
                    return true;

                case ConditionType.Contains:
                    result = values.Contains("*", StringComparer.OrdinalIgnoreCase) || values.Any(v => Contains(v, target));
                    return true;

                case ConditionType.NotContains:
                    result = !values.Any(v => Contains(v, target));
                    return true;

                case ConditionType.StartsWith:
                    result = values.Any(v => (v ?? string.Empty).StartsWith(target, StringComparison.OrdinalIgnoreCase));
                    return true;

                case ConditionType.EndsWith:
                    result = values.Any(v => (v ?? string.Empty).EndsWith(target, StringComparison.OrdinalIgnoreCase));
                    return true;

                case ConditionType.GreaterThan:
                    result = CompareNumbers(values, target, (a, b) => a > b);
                    return true;

                case ConditionType.LessThan:
                    result = CompareNumbers(values, target, (a, b) => a < b);
                    return true;

                case ConditionType.GreaterOrEqual:
                    result = CompareNumbers(values, target, (a, b) => a >= b);
                    return true;

                case ConditionType.LessOrEqual:
                    result = CompareNumbers(values, target, (a, b) => a <= b);
                    return true;

                case ConditionType.In:
                    result = AnyTarget(values, target, true);
                    return true;

                case ConditionType.NotIn:
                    result = !AnyTarget(values, target, true);
                    return true;

                default:
                    return false;
            }
        }

        private static bool AnyTarget(List<string> values, string target, bool allowWildcard)
        {
            if (allowWildcard && values.Contains("*", StringComparer.OrdinalIgnoreCase))
                return true;

            var targets = SplitTargets(target);
            if (targets.Count == 0)
                targets.Add(string.Empty);

            return values.Any(v => targets.Any(t => string.Equals(v ?? string.Empty, t, StringComparison.OrdinalIgnoreCase)));
        }

        private static bool CompareNumbers(List<string> values, string target, Func<double, double, bool> predicate)
        {
            double targetNumber;
            if (!double.TryParse(target, NumberStyles.Any, CultureInfo.InvariantCulture, out targetNumber))
                return false;

            return values.Any(value =>
            {
                double current;
                return double.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out current)
                    && predicate(current, targetNumber);
            });
        }

        private static bool Contains(string value, string target)
        {
            value = value ?? string.Empty;
            target = target ?? string.Empty;
            return value.IndexOf(target, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static List<string> NormalizeValue(object value)
        {
            if (value == null)
                return new List<string> { string.Empty };

            var token = value as JToken;
            if (token != null)
            {
                if (token.Type == JTokenType.Array)
                    return token.Children().Select(c => c is JValue ? Convert.ToString(((JValue)c).Value, CultureInfo.InvariantCulture) ?? string.Empty : c.ToString()).ToList();
                if (token.Type == JTokenType.Null)
                    return new List<string> { string.Empty };
                return new List<string> { token is JValue ? Convert.ToString(((JValue)token).Value, CultureInfo.InvariantCulture) ?? string.Empty : token.ToString() };
            }

            var text = value as string;
            if (text != null)
                return new List<string> { text };

            var enumerable = value as IEnumerable;
            if (enumerable != null)
            {
                var values = new List<string>();
                foreach (var item in enumerable)
                    values.Add(Convert.ToString(item, CultureInfo.InvariantCulture) ?? string.Empty);
                return values.Count > 0 ? values : new List<string> { string.Empty };
            }

            return new List<string> { Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty };
        }

        private static List<string> NormalizeMany(IEnumerable<string> values)
        {
            return values == null
                ? new List<string>()
                : values.Where(v => !string.IsNullOrWhiteSpace(v)).Select(v => v.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        private static List<string> SplitTargets(string target)
        {
            return (target ?? string.Empty)
                .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(v => v.Trim())
                .Where(v => v.Length > 0)
                .ToList();
        }

        private static string FirstNonEmpty(params string[] values)
        {
            foreach (var value in values)
            {
                if (!string.IsNullOrWhiteSpace(value))
                    return value.Trim();
            }
            return string.Empty;
        }

        private static bool EqualsAny(string value, params string[] candidates)
        {
            return candidates.Any(candidate => string.Equals(value, candidate, StringComparison.OrdinalIgnoreCase));
        }
    }
}
