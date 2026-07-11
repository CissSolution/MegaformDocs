using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services
{
    /// <summary>Outcome of evaluating a rule without knowing the visitor's answers yet.</summary>
    public enum RuleTriState
    {
        /// <summary>The rule cannot be satisfied for this actor, whatever they answer.</summary>
        False,

        /// <summary>The rule is satisfied for this actor, whatever they answer.</summary>
        True,

        /// <summary>The outcome depends on a field value that does not exist yet.</summary>
        Unknown
    }

    /// <summary>
    /// Evaluates <see cref="ShowIfCondition"/> at render time, before the visitor has answered
    /// anything, so the server can decide whether a field may be shipped to the browser at all.
    ///
    /// Two deliberate differences from <see cref="SharedRuleEngine"/>:
    ///
    /// 1. Field leaves resolve to <see cref="RuleTriState.Unknown"/> rather than the empty string.
    ///    SharedRuleEngine compares a missing answer against "" and gets a definite false, which is
    ///    correct at submit time (the answer really is empty) and wrong at render time (the visitor
    ///    has not typed yet). Kleene logic keeps a mixed rule such as `role in HR AND dept = Finance`
    ///    decidable for a non-HR actor while leaving it open for an HR actor.
    ///
    /// 2. Anything we cannot evaluate denies instead of allows. SharedRuleEngine is intentionally
    ///    permissive so a schema typo never makes a field disappear from a live public form; that
    ///    default is a hole once the same rule gates access, so it is inverted here.
    /// </summary>
    public static class RuleStaticEvaluator
    {
        /// <summary>
        /// True when any leaf reads something other than a field answer (role, permission, user, query).
        /// Such a rule is an access decision and must be enforced server-side; a field-only rule is
        /// presentation logic the browser can own.
        /// </summary>
        public static bool IsAccessRule(ShowIfCondition showIf)
        {
            return SharedRuleEngine.GetRules(showIf).Any(rule => rule.SourceType != RuleSourceType.Field);
        }

        public static RuleTriState Evaluate(ShowIfCondition showIf, RuleEvaluationContext context)
        {
            if (showIf == null)
                return RuleTriState.True;

            var rules = SharedRuleEngine.GetRules(showIf);
            if (rules.Count == 0)
                return RuleTriState.True;

            context = context ?? new RuleEvaluationContext();
            var isOr = showIf.Operator == LogicOperator.Or;
            var sawUnknown = false;

            foreach (var rule in rules)
            {
                var state = EvaluateRule(rule, context);

                if (state == RuleTriState.Unknown)
                {
                    sawUnknown = true;
                    continue;
                }

                // A single false collapses an AND; a single true collapses an OR. Either way the
                // undecided leaves no longer matter.
                if (isOr && state == RuleTriState.True)
                    return RuleTriState.True;
                if (!isOr && state == RuleTriState.False)
                    return RuleTriState.False;
            }

            if (sawUnknown)
                return RuleTriState.Unknown;

            return isOr ? RuleTriState.False : RuleTriState.True;
        }

        public static RuleTriState EvaluateRule(ShowIfRule rule, RuleEvaluationContext context)
        {
            if (rule == null)
                return RuleTriState.False;

            if (rule.SourceType == RuleSourceType.Field)
                return RuleTriState.Unknown;

            var values = SharedRuleEngine.ResolveValues(
                rule.SourceType, SharedRuleEngine.GetRuleKey(rule), context ?? new RuleEvaluationContext());

            bool result;
            if (!SharedRuleEngine.TryCompare(values, rule.Value ?? string.Empty, SharedRuleEngine.ResolveOperator(rule), out result))
                return RuleTriState.False;

            return result ? RuleTriState.True : RuleTriState.False;
        }

        /// <summary>
        /// Whether a field carrying this rule may be shipped to the browser. Only a rule we can prove
        /// false for this actor is withheld; an undecided rule renders and is re-checked on submit by
        /// <see cref="ServerSidePermissionEnforcementService"/>.
        /// </summary>
        public static bool IsVisibleAtRender(ShowIfCondition showIf, RuleEvaluationContext context)
        {
            return Evaluate(showIf, context) != RuleTriState.False;
        }
    }
}
