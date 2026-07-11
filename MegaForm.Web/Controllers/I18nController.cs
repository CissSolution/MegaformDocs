using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// Serve and manage locale JSON files via API.
    ///
    /// GET  /api/MegaForm/i18n/{locale}
    /// GET  /api/MegaForm/i18n/list
    /// POST /api/MegaForm/i18n/create
    /// POST /api/MegaForm/i18n/save
    /// POST /api/MegaForm/i18n/import
    /// GET  /api/MegaForm/i18n/export/{locale}
    /// </summary>
    [ApiController]
    [Route("api/MegaForm/i18n")]
    public class I18nController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;
        public I18nController(IWebHostEnvironment env) { _env = env; }

        [HttpGet("{locale}")]
        public IActionResult GetLocale(string locale)
        {
            var safeLocale = SanitizeLocale(locale);
            if (string.IsNullOrEmpty(safeLocale)) return BadRequest(new { error = "invalid locale" });

            var path = GetLocalePath(safeLocale);
            if (!System.IO.File.Exists(path))
            {
                if (string.Equals(safeLocale, "en-US", StringComparison.OrdinalIgnoreCase))
                    return Ok(new { });
                return NotFound(new { error = $"Locale '{safeLocale}' not found" });
            }

            return PhysicalFile(path, "application/json; charset=utf-8");
        }

        [HttpGet("list")]
        public IActionResult ListLocales()
        {
            var dir = GetI18nDir();
            if (!Directory.Exists(dir)) return Ok(new[] { "en-US" });

            var locales = Directory.GetFiles(dir, "*.json")
                .Select(f => Path.GetFileNameWithoutExtension(f))
                .OrderBy(x => x)
                .ToList();
            return Ok(locales);
        }

        [HttpPost("create")]
        [HttpPost("save")]
        [HttpPost("import")]
        [Authorize(Roles = "Administrator")]
        public IActionResult UpsertLocale([FromBody] JsonElement body)
        {
            try
            {
                if (body.ValueKind != JsonValueKind.Object ||
                    !body.TryGetProperty("locale", out var locEl) ||
                    locEl.ValueKind != JsonValueKind.String)
                    return BadRequest(new { error = "locale required" });

                var safeLocale = SanitizeLocale(locEl.GetString() ?? string.Empty);
                if (string.IsNullOrEmpty(safeLocale))
                    return BadRequest(new { error = "invalid locale" });
                if (string.Equals(safeLocale, "en-US", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { error = "en-US is the built-in source locale and cannot be overwritten." });
                if (string.Equals(safeLocale, "index", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { error = "'index' is the locale manifest and cannot be overwritten." });

                var i18nDir = GetI18nDir();
                Directory.CreateDirectory(i18nDir);
                var path = Path.Combine(i18nDir, safeLocale + ".json");

                JObject result;
                if (body.TryGetProperty("jsonText", out var jtEl) && jtEl.ValueKind == JsonValueKind.String)
                {
                    try { result = JObject.Parse(jtEl.GetString() ?? "{}"); }
                    catch { return BadRequest(new { error = "jsonText is not valid JSON" }); }
                }
                else if (body.TryGetProperty("entries", out var enEl) && enEl.ValueKind == JsonValueKind.Object)
                {
                    result = System.IO.File.Exists(path)
                        ? SafeParseI18n(System.IO.File.ReadAllText(path, Encoding.UTF8))
                        : new JObject();
                    foreach (var p in enEl.EnumerateObject())
                        result[p.Name] = p.Value.ValueKind == JsonValueKind.String
                            ? p.Value.GetString()
                            : p.Value.ToString();
                }
                else
                {
                    if (System.IO.File.Exists(path))
                        return Ok(new { ok = true, locale = safeLocale, existed = true });
                    var copyFrom = body.TryGetProperty("copyFrom", out var cfEl) && cfEl.ValueKind == JsonValueKind.String
                        ? cfEl.GetString() : "en-US";
                    result = LoadI18nPack(copyFrom) ?? new JObject();
                }

                System.IO.File.WriteAllText(path, result.ToString(Newtonsoft.Json.Formatting.Indented), new UTF8Encoding(false));
                return Ok(new { ok = true, locale = safeLocale, count = result.Count });
            }
            catch (UnauthorizedAccessException)
            {
                return StatusCode(500, new { error = "Locale write failed: wwwroot is not writable on this host." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Locale write failed: " + ex.Message });
            }
        }

        [HttpGet("export/{locale}")]
        [Authorize(Roles = "Administrator")]
        public IActionResult ExportLocale(string locale)
        {
            var safeLocale = SanitizeLocale(locale);
            if (string.IsNullOrEmpty(safeLocale)) return BadRequest(new { error = "invalid locale" });
            var path = GetLocalePath(safeLocale);
            if (!System.IO.File.Exists(path)) return NotFound();
            return File(System.IO.File.ReadAllBytes(path), "application/json", safeLocale + ".json");
        }

        // ── helpers ─────────────────────────────────────────────────────────

        private string GetI18nDir()
        {
            return Path.Combine(_env.WebRootPath ?? "wwwroot", "megaform", "i18n");
        }

        private string GetLocalePath(string locale)
        {
            return Path.Combine(GetI18nDir(), locale + ".json");
        }

        private static string SanitizeLocale(string locale)
        {
            return new string((locale ?? "")
                .Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_')
                .ToArray());
        }

        private static JObject SafeParseI18n(string s)
        {
            try { return JObject.Parse(s); } catch { return new JObject(); }
        }

        private JObject LoadI18nPack(string locale)
        {
            var safe = SanitizeLocale(locale);
            if (string.IsNullOrEmpty(safe) || string.Equals(safe, "en-US", StringComparison.OrdinalIgnoreCase))
                return null;
            var path = GetLocalePath(safe);
            if (System.IO.File.Exists(path))
            {
                try { return JObject.Parse(System.IO.File.ReadAllText(path, Encoding.UTF8)); }
                catch { return new JObject(); }
            }
            return null;
        }
    }
}
