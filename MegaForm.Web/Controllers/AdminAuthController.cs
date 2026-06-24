using System;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using MegaForm.Web.Data;

namespace MegaForm.Web.Controllers
{
    [Route("admin")]
    public class AdminAuthController : Controller
    {
        private readonly MegaFormDbContext _db;
        private readonly IWebHostEnvironment _env;

        public AdminAuthController(MegaFormDbContext db, IWebHostEnvironment env)
        {
            _db = db;
            _env = env;
        }

        [AllowAnonymous]
        [HttpGet("login")]
        public async System.Threading.Tasks.Task<IActionResult> Login(string returnUrl = null)
        {
            if (!SetupController.IsSetupComplete(_env))
                return Redirect("/setup");

            var cookieAuth = await HttpContext.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            if (cookieAuth?.Principal?.Identity?.IsAuthenticated == true)
                return Redirect(SafeReturnUrl(returnUrl));

            ViewBag.ReturnUrl = SafeReturnUrl(returnUrl);
            ViewBag.Error = string.Empty;
            return View("~/Views/Admin/Login.cshtml");
        }

        [AllowAnonymous]
        [ValidateAntiForgeryToken]
        [HttpPost("login")]
        public async System.Threading.Tasks.Task<IActionResult> LoginPost(string usernameOrEmail, string password, bool rememberMe = false, string returnUrl = null)
        {
            if (!SetupController.IsSetupComplete(_env))
                return Redirect("/setup");

            ViewBag.ReturnUrl = SafeReturnUrl(returnUrl);

            if (!IsValidAdmin(usernameOrEmail, password, out var displayName, out var email))
            {
                ViewBag.Error = "Invalid username/email or password.";
                return View("~/Views/Admin/Login.cshtml");
            }

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, "1"),
                new Claim(ClaimTypes.Name, string.IsNullOrWhiteSpace(displayName) ? "Administrator" : displayName),
                new Claim(ClaimTypes.Email, email ?? string.Empty),
                new Claim(ClaimTypes.Role, "Administrator"),
                new Claim("portalId", "0"),
            };

            var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            var principal = new ClaimsPrincipal(identity);
            var props = new AuthenticationProperties
            {
                IsPersistent = rememberMe,
                ExpiresUtc = DateTimeOffset.UtcNow.AddDays(rememberMe ? 14 : 1),
                AllowRefresh = true,
                RedirectUri = SafeReturnUrl(returnUrl)
            };

            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal, props);
            return LocalRedirect(SafeReturnUrl(returnUrl));
        }

        [HttpGet("logout")]
        public async System.Threading.Tasks.Task<IActionResult> Logout(string returnUrl = "/admin/login")
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Redirect(SafeReturnUrl(returnUrl));
        }

        private bool IsValidAdmin(string usernameOrEmail, string password, out string displayName, out string email)
        {
            displayName = (_db.ModuleSettings.FirstOrDefault(x => x.ModuleId == 0 && x.SettingKey == "Admin_Username")?.SettingValue ?? string.Empty).Trim();
            email = (_db.ModuleSettings.FirstOrDefault(x => x.ModuleId == 0 && x.SettingKey == "Admin_Email")?.SettingValue ?? string.Empty).Trim();
            var salt = _db.ModuleSettings.FirstOrDefault(x => x.ModuleId == 0 && x.SettingKey == "Admin_Salt")?.SettingValue ?? string.Empty;
            var hash = _db.ModuleSettings.FirstOrDefault(x => x.ModuleId == 0 && x.SettingKey == "Admin_Hash")?.SettingValue ?? string.Empty;

            var candidate = (usernameOrEmail ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(candidate) || string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(salt) || string.IsNullOrWhiteSpace(hash))
                return false;

            var userMatches = string.Equals(candidate, displayName, StringComparison.OrdinalIgnoreCase) || string.Equals(candidate, email, StringComparison.OrdinalIgnoreCase);
            if (!userMatches) return false;

            return SlowEquals(hash, HashPassword(password, salt));
        }

        private static string HashPassword(string password, string salt)
        {
            using var pbkdf2 = new Rfc2898DeriveBytes(password, Convert.FromBase64String(salt), 100_000, HashAlgorithmName.SHA256);
            return Convert.ToBase64String(pbkdf2.GetBytes(32));
        }

        private static bool SlowEquals(string a, string b)
        {
            var aa = System.Text.Encoding.UTF8.GetBytes(a ?? string.Empty);
            var bb = System.Text.Encoding.UTF8.GetBytes(b ?? string.Empty);
            return aa.Length == bb.Length && CryptographicOperations.FixedTimeEquals(aa, bb);
        }

        private string SafeReturnUrl(string returnUrl)
        {
            if (!string.IsNullOrWhiteSpace(returnUrl) && Url.IsLocalUrl(returnUrl))
                return returnUrl;
            return "/admin";
        }
    }
}
