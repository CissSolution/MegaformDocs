using System;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Umbraco.Cms.Web.Common.Authorization;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Umbraco parity surface for the Data Repeater widget.
    /// Mirrors MegaForm.Web.Controllers.DataRepeaterController.
    /// Routes:
    ///   /umbraco/MegaForm/MegaFormApi/DataRepeater/...
    ///   /api/MegaForm/DataRepeater/... (rewritten by MegaFormApiRouteRewriteMiddleware)
    /// </summary>
    [ApiController]
    [Route("umbraco/MegaForm/MegaFormApi/DataRepeater")]
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
        /// Public because widgets appear on public form pages.
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
                FormId = formId,
                WidgetKey = widgetKey,
                ParentId = parentId,
                Level = level,
                Page = Math.Max(1, page),
                PageSize = Math.Clamp(pageSize, 1, 500),
                SortCol = sortCol,
                SortDir = sortDir,
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
        /// Get dropdown options for a single grid column (GridRepeater column filter).
        /// Mirrors MegaForm.Oqtane.Server MegaFormController.DataRepeaterColumnOptions.
        /// </summary>
        [HttpGet("ColumnOptions")]
        [AllowAnonymous]
        public IActionResult ColumnOptions(int formId, string widgetKey, string columnKey, string contextJson = null)
        {
            if (formId <= 0 || string.IsNullOrWhiteSpace(widgetKey) || string.IsNullOrWhiteSpace(columnKey))
                return BadRequest(new { error = "formId, widgetKey, and columnKey are required." });

            var options = _service.ExecuteGridColumnOptionsQuery(formId, widgetKey, columnKey, contextJson);
            return Ok(options);
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
                FormId = formId,
                WidgetKey = widgetKey,
                Page = 1,
                PageSize = 5000,
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

            return BadRequest(new { error = "PDF export is handled client-side." });
        }
    }
}
