using System;
using System.Collections.Concurrent;
using System.Threading;

namespace MegaForm.Core.Payments
{
    /// <summary>
    /// In-memory fixed-window rate limiter for the public payment endpoints
    /// (create-intent / create-order / capture / confirm). Its job is to stop
    /// card-testing: an anonymous create-intent endpoint replayed with a stolen
    /// card list is the classic abuse, and each attempt costs a real gateway
    /// call. Per-process only — this codebase is single-node by design.
    /// </summary>
    public static class PaymentRateLimiter
    {
        private sealed class Window
        {
            public long WindowStartTicks;
            public int Count;
        }

        private static readonly ConcurrentDictionary<string, Window> _windows =
            new ConcurrentDictionary<string, Window>(StringComparer.Ordinal);
        private static long _lastSweepTicks;

        /// <summary>True when the caller identified by <paramref name="key"/> is still under the cap.</summary>
        public static bool Allow(string key, int maxPerWindow, TimeSpan window)
        {
            if (string.IsNullOrEmpty(key) || maxPerWindow <= 0) return true;
            long now = DateTime.UtcNow.Ticks;
            SweepIfDue(now, window);
            var w = _windows.GetOrAdd(key, _ => new Window { WindowStartTicks = now, Count = 0 });
            lock (w)
            {
                if (now - w.WindowStartTicks > window.Ticks)
                {
                    w.WindowStartTicks = now;
                    w.Count = 0;
                }
                if (w.Count >= maxPerWindow) return false;
                w.Count++;
                return true;
            }
        }

        // Drop windows idle for 4+ periods so the dictionary cannot grow without
        // bound under a spoofed-IP flood. Runs at most every 10 minutes.
        private static void SweepIfDue(long now, TimeSpan window)
        {
            long last = Interlocked.Read(ref _lastSweepTicks);
            if (now - last < TimeSpan.FromMinutes(10).Ticks) return;
            if (Interlocked.CompareExchange(ref _lastSweepTicks, now, last) != last) return;
            foreach (var pair in _windows)
            {
                if (now - pair.Value.WindowStartTicks > window.Ticks * 4)
                {
                    Window removed;
                    _windows.TryRemove(pair.Key, out removed);
                }
            }
        }
    }
}
