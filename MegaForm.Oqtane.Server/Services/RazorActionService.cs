// MegaForm Razor Widget — Action whitelist service
// ──────────────────────────────────────────────────────────────────────
// The EditableList / MasterDetailList templates render row-action
// buttons (Add / Edit / Delete). The TS plugin POSTs those clicks to
// /api/MegaFormPopup/RazorWidget/Action with {widgetKey, actionName,
// parameters}. The server NEVER trusts the client's SQL — it reads the
// pre-saved widgetProps.actions[actionName].sql off the form schema
// (lookup keyed by formId + widgetKey) and executes it with
// parameterized binding.
//
// Phase 2 ships a simple in-memory whitelist driven by the form schema
// the Builder saves. Phase 3 will gate this behind a Roslyn analyzer
// + Host-only role check.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;

namespace MegaForm.Oqtane.Server.Services
{
    public class RazorActionResult
    {
        public bool   Success      { get; set; }
        public int    AffectedRows { get; set; }
        public string Error        { get; set; }
        public object Data         { get; set; }
    }

    public interface IRazorActionService
    {
        Task<RazorActionResult> RunAsync(
            string actionSql,
            IDictionary<string, object> parameters,
            string connectionKey);
    }

    public class RazorActionService : IRazorActionService
    {
        private readonly IMfSqlExecutor _sql;

        public RazorActionService(IMfSqlExecutor sql) { _sql = sql; }

        public async Task<RazorActionResult> RunAsync(
            string actionSql,
            IDictionary<string, object> parameters,
            string connectionKey)
        {
            if (string.IsNullOrWhiteSpace(actionSql))
                return new RazorActionResult { Success = false, Error = "empty SQL" };

            // Build a parameter object from the dictionary so Dapper / our
            // SQL helpers can bind by :name. Keep it case-insensitive so
            // camelCase JSON keys still match :PascalCase tokens in SQL.
            var bag = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (parameters != null)
            {
                foreach (var kv in parameters) bag[kv.Key] = kv.Value;
            }

            try
            {
                var trimmed = actionSql.TrimStart();
                // SELECT-shaped actions return rows; everything else returns affected count.
                if (trimmed.StartsWith("SELECT", StringComparison.OrdinalIgnoreCase) ||
                    trimmed.StartsWith("WITH",   StringComparison.OrdinalIgnoreCase))
                {
                    var rows = await _sql.QueryAsync(actionSql, bag, connectionKey ?? "DashboardDatabase");
                    return new RazorActionResult { Success = true, Data = rows?.ToList() };
                }
                else
                {
                    var n = await _sql.ExecuteScalarAsync<int>(
                        actionSql + "; SELECT @@ROWCOUNT;", bag, connectionKey ?? "DashboardDatabase");
                    return new RazorActionResult { Success = true, AffectedRows = n };
                }
            }
            catch (Exception ex)
            {
                return new RazorActionResult { Success = false, Error = ex.Message };
            }
        }
    }
}
