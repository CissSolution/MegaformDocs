using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// Serve locale JSON files qua API — dùng khi không muốn expose wwwroot trực tiếp.
    ///
    /// GET /api/MegaForm/i18n/{locale}
    ///   → trả về JSON của locale đó (hoặc 404 nếu không có)
    ///
    /// Client-side (TypeScript) gọi:
    ///   await initI18n('/api/MegaForm/i18n', 'ja-JP');
    ///
    /// Nếu file wwwroot/megaform/i18n/ja-JP.json tồn tại, cũng có thể serve trực tiếp
    /// mà không cần controller này.
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
            // Sanitize: chỉ cho phép ký tự hợp lệ
            if (!System.Text.RegularExpressions.Regex.IsMatch(locale, @"^[a-zA-Z]{2}(-[a-zA-Z]{2,4})?$"))
                return BadRequest();

            var path = Path.Combine(_env.WebRootPath ?? "wwwroot", "megaform", "i18n", $"{locale}.json");
            if (!System.IO.File.Exists(path)) return NotFound();

            return PhysicalFile(path, "application/json; charset=utf-8");
        }

        [HttpGet("list")]
        public IActionResult ListLocales()
        {
            var dir = Path.Combine(_env.WebRootPath ?? "wwwroot", "megaform", "i18n");
            if (!Directory.Exists(dir)) return Ok(new[] { "en-US" });

            var locales = Directory.GetFiles(dir, "*.json")
                .Select(f => Path.GetFileNameWithoutExtension(f))
                .OrderBy(x => x)
                .ToList();
            return Ok(locales);
        }
    }
}
