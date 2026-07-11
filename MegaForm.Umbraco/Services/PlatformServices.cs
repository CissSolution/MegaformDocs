using System;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Web;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Umbraco implementation of IPlatformContext.
    /// Maps Umbraco concepts to MegaForm's cross-platform interface.
    /// </summary>
    public class UmbracoPlatformContext : IPlatformContext
    {
        private static readonly string[] AdminRoleNames = new[] { "admin", "Administrators", "Administrator", "umbracoAdmin" };

        private readonly IHttpContextAccessor _httpCtx;
        private readonly IConfiguration _configuration;
        private readonly IContentService _contentService;
        private readonly IUmbracoContextAccessor _umbracoContextAccessor;
        private readonly IHostEnvironment _hostEnvironment;
        private readonly IUserService _userService;

        public UmbracoPlatformContext(
            IHttpContextAccessor httpCtx,
            IConfiguration configuration,
            IContentService contentService,
            IUmbracoContextAccessor umbracoContextAccessor,
            IHostEnvironment hostEnvironment,
            IUserService userService)
        {
            _httpCtx = httpCtx;
            _configuration = configuration;
            _contentService = contentService;
            _umbracoContextAccessor = umbracoContextAccessor;
            _hostEnvironment = hostEnvironment;
            _userService = userService;
        }

        // In Umbraco, "PortalId" maps to the current site root content node ID.
        public int PortalId => ResolvePortalId();

        // "ModuleId" maps to content node ID in Umbraco
        public int ModuleId
        {
            get
            {
                int id = ReadInt("contentId");
                if (id > 0) return id;
                id = ReadInt("moduleId");
                if (id > 0) return id;
                id = ReadInt("instanceId");
                if (id > 0) return id;
                return 0;
            }
        }

        public int UserId
        {
            get
            {
                var claim = _httpCtx.HttpContext?.User?.FindFirst("sub")
                    ?? _httpCtx.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier);
                return claim != null && int.TryParse(claim.Value, out var id) ? id : 0;
            }
        }

        public string UserName => _httpCtx.HttpContext?.User?.Identity?.Name ?? "";

        public string UserEmail
        {
            get
            {
                var user = _httpCtx.HttpContext?.User;
                if (user == null) return string.Empty;
                return user.FindFirst(ClaimTypes.Email)?.Value
                    ?? user.FindFirst("email")?.Value
                    ?? string.Empty;
            }
        }

        public bool IsAuthenticated => _httpCtx.HttpContext?.User?.Identity?.IsAuthenticated ?? false;
        public bool IsAdmin
        {
            get
            {
                var user = _httpCtx.HttpContext?.User;
                if (user == null || !IsAuthenticated)
                    return false;

                // Fast path: role claims emitted by common Umbraco auth schemes.
                if (AdminRoleNames.Any(role => user.IsInRole(role)))
                    return true;

                // Robust path: resolve the backoffice user and inspect assigned groups.
                var userId = UserId;
                if (userId > 0)
                {
                    try
                    {
                        var backOfficeUser = _userService?.GetUserById(userId);
                        if (backOfficeUser?.Groups != null &&
                            backOfficeUser.Groups.Any(g => AdminRoleNames.Contains(g.Name, StringComparer.OrdinalIgnoreCase)))
                        {
                            return true;
                        }
                    }
                    catch { /* ignore resolution failures */ }
                }

                return false;
            }
        }

        public bool HasPermission(string permissionKey)
        {
            // Phase 1: admin gets all permissions.
            // Future phase can map permissionKey to a custom Umbraco section permission.
            return IsAdmin;
        }

        public string MapPath(string virtualPath)
        {
            if (string.IsNullOrWhiteSpace(virtualPath)) return _hostEnvironment.ContentRootPath;
            var normalized = virtualPath.Replace('~', ' ').Trim().TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            return Path.Combine(_hostEnvironment.ContentRootPath, normalized);
        }

        public string GetSetting(string key)
        {
            return string.IsNullOrWhiteSpace(key) ? null : _configuration[key];
        }

        public string GetConnectionString()
        {
            return _configuration.GetConnectionString("umbracoDbDSN")
                ?? _configuration["ConnectionStrings:umbracoDbDSN"]
                ?? _configuration["umbracoDbDSN"];
        }

        private int ReadInt(string key)
        {
            var ctx = _httpCtx.HttpContext;
            if (ctx == null) return 0;

            if (ctx.Request.Query.TryGetValue(key, out var q) && int.TryParse(q.FirstOrDefault(), out var qv) && qv > 0)
                return qv;

            if (ctx.Request.RouteValues.TryGetValue(key, out var rv) && int.TryParse(Convert.ToString(rv), out var rvv) && rvv > 0)
                return rvv;

            if (ctx.Request.HasFormContentType && ctx.Request.Form.TryGetValue(key, out var fv) && int.TryParse(fv.FirstOrDefault(), out var formv) && formv > 0)
                return formv;

            return 0;
        }

        private int ResolvePortalId()
        {
            // Prefer the published request / content cache for front-end calls (most native).
            if (_umbracoContextAccessor.TryGetUmbracoContext(out var umbracoContext))
            {
                var current = umbracoContext?.PublishedRequest?.PublishedContent;
                while (current?.Parent != null) current = current.Parent;
                if (current?.Id > 0) return current.Id;
            }

            // Fallback to the content service for backoffice/unpublished contexts.
            var contentId = ReadInt("contentId");
            if (contentId <= 0) contentId = ReadInt("moduleId");

            if (contentId > 0)
            {
                var rootFromContentService = TryResolveRootFromContent(contentId);
                if (rootFromContentService > 0) return rootFromContentService;
            }

            return 0;
        }

        private int TryResolveRootFromContent(int contentId)
        {
            var content = _contentService.GetById(contentId);
            if (content == null || string.IsNullOrWhiteSpace(content.Path)) return 0;
            var segments = content.Path.Split(',', StringSplitOptions.RemoveEmptyEntries);
            return segments.Length >= 2 && int.TryParse(segments[1], out var rootId) ? rootId : 0;
        }
    }

    /// <summary>
    /// SMTP email sender for the Umbraco host. Reads settings from IConfiguration
    /// and module settings using the same keys as the Web host.
    /// </summary>
    public class SmtpEmailOptions
    {
        public string Host { get; set; }
        public int Port { get; set; } = 25;
        public string FromEmail { get; set; }
        public string FromName { get; set; }
        public string Username { get; set; }
        public string Password { get; set; }
        public bool EnableSsl { get; set; }
        public int TimeoutMs { get; set; } = 20000;
        public string ReplyTo { get; set; }
    }

    public class SmtpEmailSender : IEmailSender
    {
        private readonly IConfiguration _cfg;
        private readonly IModuleSettingsService _settings;
        private readonly ILogService _log;

        public SmtpEmailSender(IConfiguration cfg, IModuleSettingsService settings, ILogService log = null)
        {
            _cfg = cfg;
            _settings = settings;
            _log = log;
        }

        private string GetSetting(string dbKey, params string[] configKeys)
        {
            var v = _settings?.GetSetting(0, dbKey, null);
            if (!string.IsNullOrWhiteSpace(v)) return v;
            if (_cfg != null)
            {
                foreach (var key in configKeys ?? Array.Empty<string>())
                {
                    v = _cfg[key];
                    if (!string.IsNullOrWhiteSpace(v)) return v;
                }
            }
            return null;
        }

        private static bool ParseBool(string value, bool fallback = false)
        {
            if (string.IsNullOrWhiteSpace(value)) return fallback;
            if (bool.TryParse(value, out var b)) return b;
            return value == "1" || value.Equals("yes", StringComparison.OrdinalIgnoreCase) || value.Equals("on", StringComparison.OrdinalIgnoreCase);
        }

        private static int ParseInt(string value, int fallback)
            => int.TryParse(value, out var p) ? p : fallback;

        public SmtpEmailOptions ResolveOptions(string fromOverride = null, string replyToOverride = null)
        {
            var username = GetSetting("Email_User", "Email:Username", "Email:User") ?? string.Empty;
            var fromEmail = fromOverride ?? GetSetting("Email_From", "Email:From");
            if (string.IsNullOrWhiteSpace(fromEmail))
                fromEmail = username;
            if (string.IsNullOrWhiteSpace(fromEmail))
                fromEmail = "noreply@megaform.local";

            return new SmtpEmailOptions
            {
                Host = GetSetting("Email_Host", "Email:Host") ?? "localhost",
                Port = ParseInt(GetSetting("Email_Port", "Email:Port"), 25),
                FromEmail = fromEmail,
                FromName = GetSetting("Email_FromName", "Email:FromName") ?? string.Empty,
                Username = username,
                Password = GetSetting("Email_Password", "Email:Password") ?? string.Empty,
                EnableSsl = ParseBool(GetSetting("Email_EnableSsl", "Email:EnableSsl")),
                TimeoutMs = ParseInt(GetSetting("Email_TimeoutMs", "Email:TimeoutMs"), 20000),
                ReplyTo = !string.IsNullOrWhiteSpace(replyToOverride) ? replyToOverride : (GetSetting("Email_ReplyTo", "Email:ReplyTo") ?? string.Empty)
            };
        }

        public void SendUsingOptions(SmtpEmailOptions options, string to, string subject, string htmlBody, string replyTo = null)
        {
            if (string.IsNullOrWhiteSpace(to)) throw new InvalidOperationException("Recipient email is required.");
            options ??= ResolveOptions();

            var host = options.Host ?? "localhost";
            var port = options.Port > 0 ? options.Port : 25;
            var senderEmail = !string.IsNullOrWhiteSpace(options.FromEmail) ? options.FromEmail : (!string.IsNullOrWhiteSpace(options.Username) ? options.Username : "noreply@megaform.local");
            var senderName = options.FromName ?? string.Empty;
            var username = options.Username ?? string.Empty;
            var password = options.Password ?? string.Empty;
            var enableSsl = options.EnableSsl;
            var timeoutMs = options.TimeoutMs > 0 ? options.TimeoutMs : 20000;
            var finalReplyTo = !string.IsNullOrWhiteSpace(replyTo) ? replyTo : (options.ReplyTo ?? string.Empty);

            try
            {
                using (var msg = new System.Net.Mail.MailMessage())
                {
                    msg.From = string.IsNullOrWhiteSpace(senderName)
                        ? new System.Net.Mail.MailAddress(senderEmail)
                        : new System.Net.Mail.MailAddress(senderEmail, senderName);

                    foreach (var addr in (to ?? string.Empty)
                        .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                        .Select(x => x.Trim())
                        .Where(x => !string.IsNullOrWhiteSpace(x)))
                    {
                        msg.To.Add(addr);
                    }

                    if (msg.To.Count == 0)
                        throw new InvalidOperationException("No valid recipient email was provided.");

                    foreach (var addr in (finalReplyTo ?? string.Empty)
                        .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                        .Select(x => x.Trim())
                        .Where(x => !string.IsNullOrWhiteSpace(x)))
                    {
                        msg.ReplyToList.Add(new System.Net.Mail.MailAddress(addr));
                    }

                    msg.Subject = subject ?? string.Empty;
                    msg.Body = htmlBody ?? string.Empty;
                    msg.IsBodyHtml = true;

                    using (var smtp = new System.Net.Mail.SmtpClient(host, port))
                    {
                        smtp.EnableSsl = enableSsl;
                        smtp.DeliveryMethod = System.Net.Mail.SmtpDeliveryMethod.Network;
                        smtp.Timeout = timeoutMs;
                        smtp.UseDefaultCredentials = false;
                        if (!string.IsNullOrWhiteSpace(username))
                            smtp.Credentials = new System.Net.NetworkCredential(username, password);

                        smtp.Send(msg);
                    }
                }

                _log?.LogInfo("MegaForm.Email", $"SMTP email sent to {to} via {host}:{port} SSL={enableSsl} as {senderEmail}");
            }
            catch (Exception ex)
            {
                _log?.LogError("MegaForm.Email", $"SMTP send failed via {host}:{port} as {senderEmail} user={username}: {ex.Message}", ex);
                Console.Error.WriteLine($"[SmtpEmailSender] Send failed via {host}:{port}: {ex}");
                throw;
            }
        }

        public void Send(string to, string subject, string htmlBody, string from = null, string replyTo = null)
            => SendUsingOptions(ResolveOptions(from, replyTo), to, subject, htmlBody, replyTo);

        public string GetHostEmail()
            => GetSetting("Email_From", "Email:From")
               ?? GetSetting("Email_User", "Email:Username", "Email:User")
               ?? "noreply@megaform.local";
    }

    /// <summary>
    /// Umbraco file storage — stores uploads under App_Data/MegaForm/PrivateUploads
    /// (outside public wwwroot). Files are only downloadable via the MegaForm API.
    /// </summary>
    public class UmbracoStorageService : IStorageService
    {
        private readonly string _privateRoot;
        private readonly string _baseUrl;

        public UmbracoStorageService(IHostEnvironment env, string baseUrl = "")
        {
            _privateRoot = MegaFormUmbracoPaths.GetPrivateUploadsPath(env);
            Directory.CreateDirectory(_privateRoot);
            _baseUrl = (baseUrl ?? string.Empty).TrimEnd('/');
        }

        public async Task<string> SaveFileAsync(Stream stream, string fileName, string folder)
        {
            var safeFolder = SanitizeFolder(folder);
            var dir = Path.Combine(_privateRoot, safeFolder);
            Directory.CreateDirectory(dir);

            var ext = SanitizeExtension(Path.GetExtension(fileName));
            var unique = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}{ext}";
            var fullPath = Path.Combine(dir, unique);

            using (var fs = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await stream.CopyToAsync(fs);
            }

            return CombineRelative(safeFolder, unique);
        }

        public Stream GetFile(string filePath)
        {
            var full = ResolvePath(filePath);
            return full != null && File.Exists(full) ? File.OpenRead(full) : null;
        }

        public void DeleteFile(string filePath)
        {
            var full = ResolvePath(filePath);
            if (full != null && File.Exists(full)) File.Delete(full);
        }

        public string GetFileUrl(string filePath)
        {
            var rel = Uri.EscapeDataString((filePath ?? string.Empty).Replace('\\', '/').TrimStart('/'));
            if (string.IsNullOrWhiteSpace(rel)) return string.Empty;
            return $"{_baseUrl}/umbraco/api/megaform/files/download?path={rel}";
        }

        private string ResolvePath(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath)) return null;
            var rel = filePath.Replace('\\', '/').TrimStart('/');
            if (rel.Contains("..")) return null;
            var full = Path.GetFullPath(Path.Combine(_privateRoot, rel));
            var root = Path.GetFullPath(_privateRoot);
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return null;
            return full;
        }

        private static string SanitizeFolder(string folder)
        {
            if (string.IsNullOrWhiteSpace(folder)) return "misc";
            var normalized = folder.Replace('\\', '/').Trim('/');
            var parts = normalized.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            var safeParts = new System.Collections.Generic.List<string>();
            foreach (var part in parts)
            {
                var cleaned = Regex.Replace(part ?? string.Empty, @"[^a-zA-Z0-9_-]", "-").Trim('-');
                if (!string.IsNullOrWhiteSpace(cleaned)) safeParts.Add(cleaned);
            }
            return safeParts.Count > 0 ? string.Join(Path.DirectorySeparatorChar.ToString(), safeParts) : "misc";
        }

        private static string SanitizeExtension(string ext)
        {
            var safe = Regex.Replace((ext ?? string.Empty).Trim(), @"[^a-zA-Z0-9\.]", string.Empty).ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(safe)) return ".bin";
            return safe.StartsWith(".") ? safe : "." + safe;
        }

        private static string CombineRelative(string folder, string fileName)
        {
            var combined = string.IsNullOrWhiteSpace(folder) ? fileName : Path.Combine(folder, fileName);
            return combined.Replace('\\', '/');
        }
    }

    public class UmbracoLogService : ILogService
    {
        private readonly ILogger<UmbracoLogService> _logger;
        public UmbracoLogService(ILogger<UmbracoLogService> logger) { _logger = logger; }

        public void LogInfo(string source, string message) => _logger.LogInformation("[MegaForm.{Source}] {Message}", source, message);
        public void LogWarning(string source, string message) => _logger.LogWarning("[MegaForm.{Source}] {Message}", source, message);
        public void LogError(string source, string message, Exception ex = null) => _logger.LogError(ex, "[MegaForm.{Source}] {Message}", source, message);
    }
}
