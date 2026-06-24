using System;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;

namespace MegaForm.Web.Controllers
{
    // ══════════════════════════════════════════════════════════════════════════
    //  DataRepeaterController  v20260428-01
    //  API endpoints for the Data Repeater widget.
    //
    //  Route: /api/MegaForm/DataRepeater/...
    //
    //  All data queries come from server-side form schema (widgetProps).
    //  The client sends only formId + widgetKey — NEVER raw SQL.
    //  Connection strings resolved via IConnectionRegistry from Settings.
    //
    //  Compatible with Web and Oqtane (same route prefix + DI pattern).
    //  DNN uses a separate mirror controller under /DesktopModules/MegaForm/API/.
    // ══════════════════════════════════════════════════════════════════════════

    [Route("api/MegaForm/DataRepeater")]
    [ApiController]
    public class DataRepeaterController : ControllerBase
    {
        private readonly DataRepeaterService _service;

        public DataRepeaterController(
            IConnectionRegistry registry,
            IFormRepository formRepo)
        {
            _service = new DataRepeaterService(registry, formRepo);
        }

        /// <summary>
        /// Execute the master or detail query for a DataRepeater widget.
        /// Public (AllowAnonymous) because widgets appear on public form pages.
        /// </summary>
        [HttpGet("Query")]
        [AllowAnonymous]
        public IActionResult Query(
            int formId,
            string widgetKey,
            string parentId = null,
            int level = 0,
            int page = 1,
            int pageSize = 50,
            string sortCol = null,
            string sortDir = null,
            string filterJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey))
                return BadRequest(new { error = "formId and widgetKey are required." });

            var request = new DataRepeaterQueryRequest
            {
                FormId     = formId,
                WidgetKey  = widgetKey,
                ParentId   = parentId,
                Level      = level,
                Page       = Math.Max(1, page),
                PageSize   = Math.Clamp(pageSize, 1, 500),
                SortCol    = sortCol,
                SortDir    = sortDir,
                FilterJson = filterJson
            };

            var result = _service.ExecuteQuery(request);
            if (!string.IsNullOrEmpty(result.Error))
                return Ok(new { error = result.Error, columns = result.Columns, rows = result.Rows });

            return Ok(result);
        }

        /// <summary>
        /// Get filter dropdown options from a configured filter query.
        /// </summary>
        [HttpGet("FilterOptions")]
        [AllowAnonymous]
        public IActionResult FilterOptions(int formId, string widgetKey, string filterKey, string contextJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey) || string.IsNullOrWhiteSpace(filterKey))
                return BadRequest(new { error = "formId, widgetKey, and filterKey are required." });

            var options = _service.ExecuteFilterQuery(formId, widgetKey, filterKey, contextJson);
            return Ok(new { options });
        }

        /// <summary>
        /// Export data as CSV.
        /// </summary>
        [HttpGet("Export")]
        [AllowAnonymous]
        public IActionResult Export(
            int formId,
            string widgetKey,
            string format = "csv",
            string filterJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey))
                return BadRequest(new { error = "formId and widgetKey are required." });

            var request = new DataRepeaterQueryRequest
            {
                FormId     = formId,
                WidgetKey  = widgetKey,
                Page       = 1,
                PageSize   = 5000,
                FilterJson = filterJson
            };

            if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
            {
                var csv = _service.ExportCsv(request);
                if (string.IsNullOrEmpty(csv))
                    return BadRequest(new { error = "Export failed — no data or query error." });

                var bytes = Encoding.UTF8.GetBytes(csv);
                return File(bytes, "text/csv", "data-repeater-export.csv");
            }

            // PDF export — delegate to client-side rendering for now
            return BadRequest(new { error = "PDF export is handled client-side." });
        }
    }
}
