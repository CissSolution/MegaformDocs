using System;
using System.Linq;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Oqtane.Enums;
using Oqtane.Models;
using Oqtane.Repository;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    /// <summary>
    /// [PinToPage v20260812] One-click "put this form on a page" for Oqtane.
    ///
    /// DNN has had this since v20260528 (Phase2ApiController.PinToNewPage): create the page, drop a
    /// MegaForm module on it, bind the form, hand back the URL. Oqtane had nothing — an admin had to
    /// add a page, add a module, open its settings and pick the form, four screens deep. This is the
    /// Oqtane twin of that endpoint.
    ///
    /// Services are resolved from HttpContext.RequestServices rather than the constructor: this is a
    /// partial of a controller whose ctor already takes twenty dependencies, and pulling three page
    /// repositories through it would touch every construction site for one endpoint's benefit.
    /// </summary>
    public partial class MegaFormController
    {
        /// <summary>
        /// POST /api/MegaForm/PinToNewPage
        /// Body: { pageName, formId, parentPath? }
        /// Returns: { ok, pageId, moduleId, path, url }
        /// </summary>
        [HttpPost("PinToNewPage")]
        [Authorize]
        public IActionResult PinToNewPage([FromBody] JsonElement body)
        {
            // Creating pages and binding modules is a site-shaping action — the same bar the other
            // admin surfaces in this controller use (SECURITY_CODING_RULES §3: role, not merely
            // "authenticated"). CanUseAdminPopup() is the existing Admin/Host guard; reused rather
            // than re-implemented.
            if (!CanUseAdminPopup()) return StatusCode(403, new { error = "admin_required" });

            string pageName = null;
            int formId = 0;
            string parentPath = string.Empty;
            if (body.ValueKind == JsonValueKind.Object)
            {
                JsonElement el;
                if (body.TryGetProperty("pageName", out el) && el.ValueKind == JsonValueKind.String) pageName = el.GetString();
                if (body.TryGetProperty("formId", out el) && el.TryGetInt32(out var fid)) formId = fid;
                if (body.TryGetProperty("parentPath", out el) && el.ValueKind == JsonValueKind.String) parentPath = el.GetString() ?? string.Empty;
            }

            pageName = (pageName ?? string.Empty).Trim();
            if (pageName.Length == 0) return BadRequest(new { error = "page_name_required" });
            if (pageName.Length > 100) pageName = pageName.Substring(0, 100);
            if (formId <= 0) return BadRequest(new { error = "form_id_required" });

            var siteId = AuthEntityId(EntityNames.Site);
            if (siteId <= 0) return BadRequest(new { error = "site_context_missing" });

            try
            {
                var pages = HttpContext.RequestServices.GetService<IPageRepository>();
                var modules = HttpContext.RequestServices.GetService<IModuleRepository>();
                var pageModules = HttpContext.RequestServices.GetService<IPageModuleRepository>();
                var settings = HttpContext.RequestServices.GetService<ISettingRepository>();
                if (pages == null || modules == null || pageModules == null || settings == null)
                    return StatusCode(500, new { error = "pin_failed", message = "Page services are unavailable on this host." });

                var existing = pages.GetPages(siteId).ToList();

                // ── path ──────────────────────────────────────────
                var slug = Slugify(pageName);
                if (slug.Length == 0) slug = "form-" + formId;
                var parent = string.IsNullOrWhiteSpace(parentPath)
                    ? null
                    : existing.FirstOrDefault(p => string.Equals(p.Path, parentPath.Trim('/'), StringComparison.OrdinalIgnoreCase));
                var basePath = parent != null ? parent.Path + "/" + slug : slug;

                // A duplicate Path would 404 for one of the two pages, so make it unique rather than
                // failing: the admin asked for a page, they get a page.
                var path = basePath;
                for (var n = 2; existing.Any(p => string.Equals(p.Path, path, StringComparison.OrdinalIgnoreCase)); n++)
                {
                    path = basePath + "-" + n;
                }

                // ── permissions ───────────────────────────────────
                // A page created with NO permission rows is invisible to everyone INCLUDING its
                // author, while every API still answers 200 — the exact trap recorded on the DNN
                // side. Copy the home page's permissions so the new page inherits whatever this
                // site considers "public", and fall back to Everyone-view/Admin-edit if there is
                // no home page to copy.
                var home = existing.FirstOrDefault(p => p.Path == string.Empty)
                           ?? existing.OrderBy(p => p.Order).FirstOrDefault();
                // Clone() rather than a 5-arg ctor: that overload only exists on the newer Oqtane
                // dev branch, and this project builds against 10.1.0 / 6.0.1. Clone is what
                // SiteRepository.CreatePages itself uses.
                var permissions = (home?.PermissionList != null && home.PermissionList.Count > 0)
                    ? home.PermissionList.Select(p => p.Clone()).ToList()
                    : new System.Collections.Generic.List<Permission>
                    {
                        new Permission(PermissionNames.View, RoleNames.Everyone, true),
                        new Permission(PermissionNames.View, RoleNames.Admin, true),
                        new Permission(PermissionNames.Edit, RoleNames.Admin, true),
                    };

                var page = pages.AddPage(new Page
                {
                    SiteId = siteId,
                    Path = path,
                    Name = pageName,
                    Title = pageName,
                    ParentId = parent?.PageId,
                    Order = (existing.Count + 1) * 2,
                    IsNavigation = true,
                    IsClickable = true,
                    IsPersonalizable = false,
                    IsDeleted = false,
                    ThemeType = parent?.ThemeType ?? home?.ThemeType ?? string.Empty,
                    DefaultContainerType = parent?.DefaultContainerType ?? home?.DefaultContainerType ?? string.Empty,
                    Icon = string.Empty,
                    Url = string.Empty,
                    HeadContent = string.Empty,
                    BodyContent = string.Empty,
                    PermissionList = permissions,
                });

                // ── module ────────────────────────────────────────
                var module = modules.AddModule(new Module
                {
                    SiteId = siteId,
                    ModuleDefinitionName = MegaFormModuleDefinitionName,
                    AllPages = false,
                    IsDeleted = false,
                    PermissionList = permissions
                        .Where(p => p.PermissionName == PermissionNames.View || p.PermissionName == PermissionNames.Edit)
                        .Select(p => { var c = p.Clone(); c.EntityName = EntityNames.Module; return c; })
                        .ToList(),
                });

                pageModules.AddPageModule(new PageModule
                {
                    PageId = page.PageId,
                    ModuleId = module.ModuleId,
                    Title = pageName,
                    Pane = PaneNames.Default,
                    Order = 1,
                    ContainerType = string.Empty,
                    IsDeleted = false,
                });

                // ── bind the form ─────────────────────────────────
                // A positive MegaForm:FormId is what "configured" means on Oqtane (DNN's
                // ModuleConfigured/ModuleMode triple does not exist here).
                settings.AddSetting(new Setting
                {
                    EntityName = EntityNames.Module,
                    EntityId = module.ModuleId,
                    SettingName = "MegaForm:FormId",
                    SettingValue = formId.ToString(),
                    IsPrivate = false,
                });

                // The site state cache holds pages/modules; without this the new page is missing
                // from the menu (and from PageState) until the app restarts — the same reason
                // SaveModuleStyle fires it.
                // Same call the module-style save uses (MegaFormController.cs:4222) — the site cache
                // holds pages/modules, so without it the new page is missing from the menu and from
                // PageState until the app restarts.
                try
                {
                    var alias = _tenantManager?.GetAlias();
                    if (alias != null) _syncManager?.AddSyncEvent(alias, EntityNames.Site, alias.SiteId, SyncEventActions.Refresh);
                }
                catch { /* cache refresh is best-effort */ }

                var url = "/" + path;
                _logger.Log(LogLevel.Information, this, LogFunction.Create,
                    "MegaForm form {FormId} pinned to new page {Path} (page {PageId}, module {ModuleId})",
                    formId, path, page.PageId, module.ModuleId);

                return JsonOk(new { ok = true, pageId = page.PageId, moduleId = module.ModuleId, path, url });
            }
            catch (Exception ex)
            {
                // Never surface ex.Message (SECURITY_CODING_RULES §10).
                _logger.Log(LogLevel.Error, this, LogFunction.Create, ex, "MegaForm PinToNewPage failed for form {FormId}", formId);
                return StatusCode(500, new { error = "pin_failed", message = "The page could not be created." });
            }
        }

        /// <summary>Assembly-qualified name Oqtane knows this module by.</summary>
        internal const string MegaFormModuleDefinitionName = "MegaForm.Client, MegaForm.Oqtane.Client.Oqtane";

        /// <summary>URL-safe page slug: lowercase, ASCII word runs joined by "-".</summary>
        private static string Slugify(string value)
        {
            var chars = (value ?? string.Empty).Trim().ToLowerInvariant().ToCharArray();
            var sb = new System.Text.StringBuilder(chars.Length);
            var lastDash = true;   // suppress a leading dash
            foreach (var c in chars)
            {
                if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) { sb.Append(c); lastDash = false; }
                else if (!lastDash) { sb.Append('-'); lastDash = true; }
            }
            return sb.ToString().Trim('-');
        }
    }
}
