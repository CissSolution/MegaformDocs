using System;
using MegaForm.Core.Services.Workflow;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [CloudReady A2 v20260806] Pure-logic tests for the Delay node's wake-time
    /// resolution: ISO-8601 datetime/duration parsing and the DelaySeconds fallback.
    /// </summary>
    public sealed class DelayTimeParserTests
    {
        private static readonly DateTime Now = new DateTime(2026, 8, 6, 12, 0, 0, DateTimeKind.Utc);

        [Theory]
        [InlineData("PT5M", 0, 0, 5, 0)]
        [InlineData("pt5m", 0, 0, 5, 0)]
        [InlineData("PT1H30M", 0, 1, 30, 0)]
        [InlineData("P1D", 1, 0, 0, 0)]
        [InlineData("P1DT2H", 1, 2, 0, 0)]
        [InlineData("PT90S", 0, 0, 1, 30)]
        [InlineData("PT0.5H", 0, 0, 30, 0)]
        public void Iso8601_durations_parse(string text, int days, int hours, int minutes, int seconds)
        {
            Assert.True(DelayTimeParser.TryParseIso8601Duration(text, out var duration));
            Assert.Equal(
                TimeSpan.FromDays(days) + TimeSpan.FromHours(hours) + TimeSpan.FromMinutes(minutes) + TimeSpan.FromSeconds(seconds),
                duration);
        }

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("5 minutes")]
        [InlineData("PT")]
        [InlineData("P")]
        [InlineData("2026-08-06")]
        [InlineData("P1W")]   // weeks are calendar-relative — intentionally unsupported
        [InlineData("P1M")]   // months ambiguous — intentionally unsupported
        public void Invalid_durations_do_not_parse(string text)
        {
            Assert.False(DelayTimeParser.TryParseIso8601Duration(text, out _));
        }

        [Theory]
        [InlineData("2026-08-06T14:30:00Z", "2026-08-06T14:30:00Z")]
        [InlineData("2026-08-06T14:30:00+02:00", "2026-08-06T12:30:00Z")]
        [InlineData("2026-08-06", "2026-08-06T00:00:00Z")]          // date-only → midnight UTC
        [InlineData("2026-08-06 14:30", "2026-08-06T14:30:00Z")]    // timezone-less → assumed UTC
        public void Iso8601_datetimes_parse_to_utc(string text, string expectedUtc)
        {
            Assert.True(DelayTimeParser.TryParseWakeTime(text, Now, out var wake));
            Assert.Equal(DateTime.Parse(expectedUtc, null, System.Globalization.DateTimeStyles.RoundtripKind), wake);
            Assert.Equal(DateTimeKind.Utc, wake.Kind);
        }

        [Fact]
        public void Duration_expression_resolves_relative_to_now()
        {
            Assert.True(DelayTimeParser.TryParseWakeTime("PT5M", Now, out var wake));
            Assert.Equal(Now.AddMinutes(5), wake);
        }

        [Fact]
        public void Resolved_expression_wins_over_delay_seconds()
        {
            Assert.True(DelayTimeParser.TryResolveWakeTime("2026-08-06T14:00:00Z", 60, Now, out var wake));
            Assert.Equal(Now.AddHours(2), wake);
        }

        [Fact]
        public void Unparseable_expression_falls_back_to_delay_seconds()
        {
            Assert.True(DelayTimeParser.TryResolveWakeTime("not-a-date", 300, Now, out var wake));
            Assert.Equal(Now.AddSeconds(300), wake);
        }

        [Fact]
        public void Empty_expression_falls_back_to_delay_seconds()
        {
            Assert.True(DelayTimeParser.TryResolveWakeTime(null, 120, Now, out var wake));
            Assert.Equal(Now.AddSeconds(120), wake);
        }

        [Fact]
        public void No_expression_and_no_seconds_fails()
        {
            Assert.False(DelayTimeParser.TryResolveWakeTime("", 0, Now, out _));
            Assert.False(DelayTimeParser.TryResolveWakeTime("garbage", 0, Now, out _));
        }
    }
}
