/*
 * MegaForm.Core/Scripting/ScriptCapabilities.cs
 *
 * [AfterSubmitScript v20260813-02] What a script can DO, as opposed to what it can reference.
 *
 * ── Why capabilities rather than a raw .NET surface ─────────────────────────────
 * v01 shipped a script that could compute and nothing else, which is not worth having: a hook that
 * can only add numbers is the Calculate node with extra steps. The two things people actually reach
 * for C# to do are "write this somewhere else" and "tell another system".
 *
 * The fix is NOT to open `new SqlConnection(...)` and `new HttpClient()`. Both would deliver the
 * power while losing everything that makes it safe to sell:
 *
 *   - a connection string pasted into a script travels with an exported form, and rotating a
 *     password becomes a hunt through every script on the site;
 *   - an outbound URL built from submitted data — `ctx.GetString("callback_url")` — turns an
 *     anonymous public form into a request generator aimed at the server's own network;
 *   - and neither leaves any trace of what the script actually did.
 *
 * So the script calls MegaForm capabilities instead. ctx.Db takes a connection NAME an
 * administrator registered; ctx.Http runs every URL through the same SsrfGuard the webhook node
 * uses. Both are bounded (timeout, row cap, response cap) and both write a line into the run
 * record. Same business logic, with audit, named connections, and a URL guard that a hand-rolled
 * HttpClient would not have.
 *
 * ── Planned next (owner's v2 rail) ───────────────────────────────────────────────
 *   ctx.Notify   — email / SMS / Zalo / Telegram through providers configured on the site, so a
 *                  script never holds a secret.
 *   ctx.Workflow — Start / Signal, to hand off to an approval flow.
 *   ctx.Response — SuccessMessage / RedirectUrl / CustomData, so a script can steer what the
 *                  visitor sees.
 *   async        — RunAsync(ctx, CancellationToken) instead of the sync Run.
 *   PreInsert    — normalising or encrypting a value has to happen BEFORE the row is written, so
 *                  it belongs to a pre-insert stage, not to this one.
 */

using System;
using System.Collections.Generic;

namespace MegaForm.Core.Scripting
{
    /// <summary>Result of a call made through <see cref="IScriptHttp"/>.</summary>
    public sealed class ScriptHttpResult
    {
        /// <summary>HTTP status, or 0 when the request never left (blocked, DNS, timeout).</summary>
        public int Status { get; set; }
        public bool Ok { get { return Status >= 200 && Status < 300; } }
        public string Body { get; set; }
        /// <summary>Set when the call could not be made. Null on any real HTTP response.</summary>
        public string Error { get; set; }
        public long DurationMs { get; set; }
    }

    /// <summary>
    /// Outbound HTTP for scripts — REST, SOAP, a webhook to a CRM — with the same outbound-URL
    /// guard the webhook node uses, a bounded timeout, a response-size cap, and a line in the run
    /// record for every call. `System.Net` itself is not available to scripts; this is the door.
    /// </summary>
    public interface IScriptHttp
    {
        ScriptHttpResult Get(string url, IDictionary<string, string> headers = null);
        ScriptHttpResult PostJson(string url, object payload, IDictionary<string, string> headers = null);
        ScriptHttpResult Send(string method, string url, string body, string contentType,
                              IDictionary<string, string> headers = null);
    }

    /// <summary>One row from <see cref="IScriptDatabase.Query"/>, keyed by column name.</summary>
    public sealed class ScriptRow : Dictionary<string, object>
    {
        public ScriptRow() : base(StringComparer.OrdinalIgnoreCase) { }

        public string Str(string column)
        {
            object v;
            return TryGetValue(column, out v) && v != null
                ? Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture)
                : null;
        }

        public decimal Num(string column, decimal fallback = 0m)
        {
            object v;
            if (!TryGetValue(column, out v) || v == null) return fallback;
            try { return Convert.ToDecimal(v, System.Globalization.CultureInfo.InvariantCulture); }
            catch { return fallback; }
        }
    }

    /// <summary>
    /// Parameterised SQL against a connection the ADMINISTRATOR registered by name — the same
    /// catalog Form Settings → Database and the workflow Database node resolve from. A script names
    /// a connection; it never carries a connection string, so a script cannot be edited into
    /// pointing at a database the site was not configured to reach, and rotating a password stays a
    /// single change in one place. `System.Data` itself is not available to scripts; this is the door.
    ///
    /// Parameters are bound, never concatenated. Pass values as parameters even when they came from
    /// your own calculation: `Execute("Crm", "UPDATE Leads SET Score=@s WHERE Id=@id", new { s = 70, id = 12 })`.
    /// </summary>
    public interface IScriptDatabase
    {
        /// <summary>INSERT / UPDATE / DELETE. Returns rows affected.</summary>
        int Execute(string connectionName, string sql, object parameters = null);

        /// <summary>SELECT. Capped server-side; ask for what you need with a WHERE clause.</summary>
        IList<ScriptRow> Query(string connectionName, string sql, object parameters = null);

        /// <summary>First column of the first row, or null.</summary>
        object Scalar(string connectionName, string sql, object parameters = null);

        /// <summary>Connection names this site allows, so a script can fail with a useful message.</summary>
        IList<string> ConnectionNames();
    }

}
