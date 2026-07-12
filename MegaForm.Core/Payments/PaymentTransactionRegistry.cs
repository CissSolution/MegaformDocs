using System;
using System.Collections.Concurrent;
using System.Threading;

namespace MegaForm.Core.Payments
{
    /// <summary>
    /// In-process transaction bookkeeping that backs the submit-time verifier:
    ///  • a consume set so two submissions racing on the SAME transactionId
    ///    (double-click, deliberate replay burst) cannot both pass the DB
    ///    duplicate check — the DB check alone has a read-then-insert window;
    ///  • signature-verified webhook facts (Stripe/PayPal) so a later submit can
    ///    be cross-checked against what the gateway itself pushed to us.
    /// Per-process only — this codebase is single-node by design; the durable
    /// replay guard is the DataJson duplicate search in the verifier.
    /// </summary>
    public static class PaymentTransactionRegistry
    {
        public sealed class WebhookFact
        {
            public string Status;
            public decimal Amount;
            public string Currency;
            public DateTime SeenUtc;
        }

        private static readonly ConcurrentDictionary<string, DateTime> _consumed =
            new ConcurrentDictionary<string, DateTime>(StringComparer.Ordinal);
        private static readonly ConcurrentDictionary<string, WebhookFact> _facts =
            new ConcurrentDictionary<string, WebhookFact>(StringComparer.Ordinal);
        private static long _lastPruneTicks;

        /// <summary>Reserve a transaction for the current submission. False = another submission holds/held it.</summary>
        public static bool TryBeginConsume(string txKey)
        {
            PruneIfDue();
            return _consumed.TryAdd(txKey, DateTime.UtcNow);
        }

        /// <summary>Release a reservation whose verification FAILED (a legitimate retry may follow).</summary>
        public static void Release(string txKey)
        {
            DateTime removed;
            _consumed.TryRemove(txKey, out removed);
        }

        public static void RecordFact(string txKey, WebhookFact fact)
        {
            if (string.IsNullOrEmpty(txKey) || fact == null) return;
            fact.SeenUtc = DateTime.UtcNow;
            _facts[txKey] = fact;
        }

        public static WebhookFact GetFact(string txKey)
        {
            WebhookFact fact;
            return _facts.TryGetValue(txKey, out fact) ? fact : null;
        }

        private static void PruneIfDue()
        {
            long now = DateTime.UtcNow.Ticks;
            long last = Interlocked.Read(ref _lastPruneTicks);
            if (now - last < TimeSpan.FromMinutes(30).Ticks) return;
            if (Interlocked.CompareExchange(ref _lastPruneTicks, now, last) != last) return;

            var cutoff = DateTime.UtcNow.AddHours(-48);
            foreach (var pair in _consumed)
            {
                if (pair.Value < cutoff)
                {
                    DateTime removed;
                    _consumed.TryRemove(pair.Key, out removed);
                }
            }
            foreach (var pair in _facts)
            {
                if (pair.Value.SeenUtc < cutoff)
                {
                    WebhookFact removed;
                    _facts.TryRemove(pair.Key, out removed);
                }
            }
        }
    }
}
