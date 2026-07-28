using System;
using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Payments
{
    /// <summary>
    /// Resolves the amount carried by a simple form field or Calculator payload.
    /// Calculator values use { variables, results }. An explicit result key
    /// wins; otherwise a conventional total key or the only numeric result is
    /// accepted. This is the server-side contract paired with the Payment widget.
    /// </summary>
    public static class PaymentAmountResolver
    {
        public static bool TryResolve(object raw, string resultKey, out decimal amount)
        {
            amount = 0m;
            if (raw == null) return false;

            JToken token = raw as JToken;
            if (token == null)
            {
                var dict = raw as IDictionary<string, object>;
                if (dict != null)
                {
                    try { token = JObject.FromObject(dict); } catch { token = null; }
                }
            }

            if (token == null && !(raw is string))
            {
                // A multi-value field arrives as a list, not a JToken. Without this the
                // fallback below would stringify the CLR type name and the stray digits in
                // "System.Collections.Generic.List`1[…]" would parse as a real amount.
                var sequence = raw as System.Collections.IEnumerable;
                if (sequence != null)
                {
                    try { token = JArray.FromObject(sequence); } catch { token = null; }
                }
            }

            var text = Convert.ToString(raw, CultureInfo.InvariantCulture);
            if (token == null && !string.IsNullOrWhiteSpace(text) &&
                (text.TrimStart().StartsWith("{", StringComparison.Ordinal) ||
                 text.TrimStart().StartsWith("[", StringComparison.Ordinal)))
            {
                try { token = JToken.Parse(text); } catch { token = null; }
            }

            if (token != null && token.Type == JTokenType.Array)
            {
                // Parity with the widget's coerceAmount(): a multi-value source sums its
                // entries. Entries that carry no amount are skipped; an array with nothing
                // numeric in it resolves to nothing at all (never to 0-as-a-price).
                decimal sum = 0m;
                var found = false;
                foreach (var item in (JArray)token)
                {
                    decimal part;
                    var resolved = item != null && item.Type == JTokenType.Object
                        ? TryResolve(item, resultKey, out part)
                        : TryReadAmountToken(item, out part);
                    if (!resolved) continue;
                    sum += part;
                    found = true;
                }
                if (!found) return false;
                amount = sum;
                return true;
            }

            if (token != null && token.Type == JTokenType.Object)
            {
                var obj = (JObject)token;
                var results = obj["results"] as JObject;
                var wanted = (resultKey ?? string.Empty).Trim();
                if (wanted.Length > 0)
                {
                    if (TryReadAmountToken(results != null ? results[wanted] : null, out amount)) return true;
                    if (TryReadAmountToken(obj[wanted], out amount)) return true;
                    return false;
                }

                var conventionalKeys = new[] { "grandTotal", "total", "amount", "payment_total", "value" };
                for (var i = 0; i < conventionalKeys.Length; i++)
                {
                    if (TryReadAmountToken(results != null ? results[conventionalKeys[i]] : null, out amount)) return true;
                    if (TryReadAmountToken(obj[conventionalKeys[i]], out amount)) return true;
                }

                if (results != null)
                {
                    decimal only = 0m;
                    var count = 0;
                    foreach (var property in results.Properties())
                    {
                        decimal candidate;
                        if (!TryReadAmountToken(property.Value, out candidate)) continue;
                        only = candidate;
                        count++;
                    }
                    if (count == 1)
                    {
                        amount = only;
                        return true;
                    }
                }
                return false;
            }

            return TryParseScalarAmount(raw, out amount);
        }

        private static bool TryReadAmountToken(JToken token, out decimal amount)
        {
            amount = 0m;
            if (token == null || token.Type == JTokenType.Null || token.Type == JTokenType.Undefined) return false;
            if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float)
            {
                try
                {
                    amount = token.Value<decimal>();
                    return true;
                }
                catch { return false; }
            }
            return TryParseScalarAmount(token.ToString(), out amount);
        }

        private static bool TryParseScalarAmount(object raw, out decimal amount)
        {
            amount = 0m;
            if (raw == null) return false;
            if (raw is decimal) { amount = (decimal)raw; return true; }
            if (raw is int) { amount = (int)raw; return true; }
            if (raw is long) { amount = (long)raw; return true; }
            if (raw is double) { amount = (decimal)(double)raw; return true; }

            var text = Convert.ToString(raw, CultureInfo.InvariantCulture);
            if (string.IsNullOrWhiteSpace(text)) return false;
            var cleaned = System.Text.RegularExpressions.Regex.Replace(text, "[^0-9,.\\-]", string.Empty);
            if (cleaned.IndexOf(',') >= 0 && cleaned.IndexOf('.') < 0) cleaned = cleaned.Replace(',', '.');
            else cleaned = cleaned.Replace(",", string.Empty);
            return decimal.TryParse(cleaned, NumberStyles.Any, CultureInfo.InvariantCulture, out amount);
        }
    }
}
