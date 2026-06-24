using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
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
        private readonly IHttpContextAccessor _httpCtx;
        private readonly IConfiguration _configuration;
        private readonly IContentService _contentService;
        private readonly IUmbracoContextAccessor _umbracoContextAccessor;
        private readonly IHostEnvironment _hostEnvironment;

        public UmbracoPlatformContext(
            IHttpContextAccessor httpCtx,
            IConfiguration configuration,
            IContentService contentService,
            IUmbracoContextAccessor umbracoContextAccessor,
            IHostEnvironment hostEnvironment)
        {
            _httpCtx = httpCtx;
            _configuration = configuration;
            _contentService = contentService;
            _umbracoContextAccessor = umbracoContextAccessor;
            _hostEnvironment = hostEnvironment;
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
                    ?? _httpCtx.HttpContext?.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
                return claim != null && int.TryParse(claim.Value, out var id) ? id : 0;
            }
        }

        public string UserName => _httpCtx.HttpContext?.User?.Identity?.Name ?? "";
        public string UserEmail => ""; // TODO: resolve from Umbraco member/user
        public bool IsAuthenticated => _httpCtx.HttpContext?.User?.Identity?.IsAuthenticated ?? false;
        public bool IsAdmin => _httpCtx.HttpContext?.User?.IsInRole("admin") ?? false;

        public bool HasPermission(string permissionKey)
        {
            // TODO: integrate with Umbraco's permission system
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
            var contentId = ReadInt("contentId");
            if (contentId <= 0)
            {
                contentId = ReadInt("moduleId");
            }

            if (contentId > 0)
            {
                var rootFromContentService = TryResolveRootFromContent(contentId);
                if (rootFromContentService > 0) return rootFromContentService;
            }

            if (_umbracoContextAccessor.TryGetUmbracoContext(out var umbracoContext))
            {
                var current = umbracoContext?.PublishedRequest?.PublishedContent;
                while (current?.Parent != null)
                {
                    current = current.Parent;
                }
                if (current?.Id > 0) return current.Id;
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

    public class UmbracoEmailSender : IEmailSender
    {
        // TODO: use Umbraco's email service or SMTP config
        public void Send(string to, string subject, string htmlBody, string from = null, string replyTo = null) { }
        public string GetHostEmail() => "noreply@example.com";
    }

    public class UmbracoLogService : ILogService
    {
        private readonly ILogger<UmbracoLogService> _logger;
        public UmbracoLogService(ILogger<UmbracoLogService> logger) { _logger = logger; }

        public void LogInfo(string source, string message) => _logger.LogInformation("[MegaForm.{Source}] {Message}", source, message);
        public void LogWarning(string source, string message) => _logger.LogWarning("[MegaForm.{Source}] {Message}", source, message);
        public void LogError(string source, string message, Exception ex = null) => _logger.LogError(ex, "[MegaForm.{Source}] {Message}", source, message);
    }

    public class UmbracoStorageService : IStorageService
    {
        // TODO: use Umbraco's media system or wwwroot/megaform-uploads
        public Task<string> SaveFileAsync(Stream stream, string fileName, string folder) => Task.FromResult("");
        public Stream GetFile(string filePath) => null;
        public void DeleteFile(string filePath) { }
        public string GetFileUrl(string filePath) => filePath;
    }
}
