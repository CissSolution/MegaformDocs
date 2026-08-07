using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace MegaForm.Core.Services.Workflow
{
    /// <summary>
    /// [CloudReady A2 v20260806] Pure parsing helpers for the Delay node.
    /// Kept static + dependency-free so the same logic runs on net472 (C# 7.3)
    /// and is unit-testable without a host.
    /// </summary>
    public static class DelayTimeParser
    {
        // ISO-8601 duration subset: P[nD]T[nH][nM][nS] (also PT… without leading P
        // tolerated, and PnD without the T part). No weeks/months/years — those
        // are calendar-relative and ambiguous for a timer.
        private static readonly Regex DurationRegex = new Regex(
            @"^P?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly string[] DateTimeFormats =
        {
            "yyyy-MM-ddTHH:mm:ss.fffffffK",
            "yyyy-MM-ddTHH:mm:ssK",
            "yyyy-MM-ddTHH:mmK",
            "yyyy-MM-dd",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd HH:mm"
        };

        /// <summary>
        /// Parses an ISO-8601 duration ("PT5M", "PT1H30M", "P1D", "PT90S").
        /// Returns false for anything else (including empty).
        /// </summary>
        public static bool TryParseIso8601Duration(string text, out TimeSpan duration)
        {
            duration = TimeSpan.Zero;
            if (string.IsNullOrWhiteSpace(text)) return false;

            var match = DurationRegex.Match(text.Trim());
            if (!match.Success) return false;
            // "P" or "PT" alone carries no components.
            if (!match.Groups[1].Success && !match.Groups[2].Success &&
                !match.Groups[3].Success && !match.Groups[4].Success)
                return false;

            double days    = ParseComponent(match.Groups[1]);
            double hours   = ParseComponent(match.Groups[2]);
            double minutes = ParseComponent(match.Groups[3]);
            double seconds = ParseComponent(match.Groups[4]);

            duration = TimeSpan.FromDays(days)
                     + TimeSpan.FromHours(hours)
                     + TimeSpan.FromMinutes(minutes)
                     + TimeSpan.FromSeconds(seconds);
            return duration > TimeSpan.Zero;
        }

        /// <summary>
        /// Parses a resolved UntilExpression value as a wake time. Accepts ISO-8601
        /// date/datetime (timezone-less values are assumed UTC) and ISO-8601
        /// durations relative to nowUtc. Returns false when neither parses.
        /// </summary>
        public static bool TryParseWakeTime(string text, DateTime nowUtc, out DateTime wakeUtc)
        {
            wakeUtc = DateTime.MinValue;
            if (string.IsNullOrWhiteSpace(text)) return false;
            var value = text.Trim();

            DateTime parsed;
            if (DateTime.TryParseExact(value, DateTimeFormats, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out parsed)
                || DateTime.TryParse(value, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out parsed))
            {
                wakeUtc = parsed.ToUniversalTime();
                return true;
            }

            TimeSpan duration;
            if (TryParseIso8601Duration(value, out duration))
            {
                wakeUtc = nowUtc.Add(duration);
                return true;
            }

            return false;
        }

        /// <summary>
        /// Resolves the effective wake time for a Delay node: the resolved
        /// UntilExpression wins; when it is empty or unparseable the fixed
        /// DelaySeconds fallback applies. Returns false when neither yields a time.
        /// </summary>
        public static bool TryResolveWakeTime(
            string resolvedUntilExpression,
            int delaySecondsFallback,
            DateTime nowUtc,
            out DateTime wakeUtc)
        {
            if (TryParseWakeTime(resolvedUntilExpression, nowUtc, out wakeUtc))
                return true;

            if (delaySecondsFallback > 0)
            {
                wakeUtc = nowUtc.AddSeconds(delaySecondsFallback);
                return true;
            }

            wakeUtc = DateTime.MinValue;
            return false;
        }

        private static double ParseComponent(Group group)
        {
            if (!group.Success) return 0d;
            double value;
            return double.TryParse(group.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out value)
                ? value : 0d;
        }
    }
}
