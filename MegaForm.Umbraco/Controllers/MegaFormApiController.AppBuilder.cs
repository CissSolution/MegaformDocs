using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;
using MegaForm.Umbraco.Permissions;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// App Builder CRUD endpoints for Umbraco.
    /// Mirrors MegaForm.Web.Controllers.MegaFormController.AppBuilder.
    /// </summary>
    public partial class MegaFormApiController
    {
        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/Phase2/AppDefinitionList")]
        [MegaFormAuthorize(MegaFormPermissionConstants.BrowseLetter)]
        public IActionResult AppDefinitionList()
        {
            try
            {
                var svc = CreateAppDefinitionService();
                var portalId = _platform.PortalId;
                var apps = svc.List(portalId);
                var items = apps.Select(a =>
                {
                    var bundle = svc.GetByScope(portalId, a.AppScope, hydrateManifest: false);
                    return new
                    {
                        appId = a.AppId,
                        appKey = a.AppKey,
                        appName = a.AppName,
                        appScope = a.AppScope,
                        description = a.Description,
                        icon = a.Icon,
                        accentColor = a.AccentColor,
                        isEnabled = a.IsEnabled,
                        sortOrder = a.SortOrder,
                        formCount = bundle != null && bundle.Forms != null ? bundle.Forms.Count : 0,
                        createdOnUtc = a.CreatedOnUtc,
                        modifiedOnUtc = a.ModifiedOnUtc
                    };
                }).ToList();
                return Ok(new { items });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/Phase2/AppDefinitionGet")]
        [MegaFormAuthorize(MegaFormPermissionConstants.BrowseLetter)]
        public IActionResult AppDefinitionGet(string appKey)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(appKey))
                    return BadRequest(new { error = "appKey required" });
                var portalId = _platform.PortalId;
                var bundle = CreateAppDefinitionService().Get(portalId, appKey, hydrateManifest: true);
                if (bundle == null) return NotFound(new { error = "Not found" });
                return Ok(new
                {
                    app = bundle.App,
                    forms = bundle.Forms.Select(f => new { formId = f.FormId, title = f.Title, status = f.Status, appScope = f.AppScope }).ToList(),
                    views = bundle.Views,
                    queries = bundle.Queries,
                    manifest = bundle.Manifest
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Phase2/AppDefinitionSave")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult AppDefinitionSave([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            try
            {
                var portalId = _platform.PortalId;
                var existingKey = body.Value<string>("appKey");
                AppDefinitionInfo app;
                if (!string.IsNullOrWhiteSpace(existingKey))
                {
                    var existing = _phase2Repo.GetAppDefinition(portalId, existingKey);
                    app = existing ?? new AppDefinitionInfo { AppId = body.Value<int?>("appId") ?? 0 };
                }
                else
                {
                    app = new AppDefinitionInfo { AppId = body.Value<int?>("appId") ?? 0 };
                }
                app.PortalId = portalId;
                app.AppKey = body.Value<string>("appKey") ?? app.AppKey;
                app.AppName = body.Value<string>("appName") ?? app.AppName;
                app.AppScope = body.Value<string>("appScope") ?? app.AppScope;
                app.Description = body.Value<string>("description") ?? app.Description;
                app.Icon = body.Value<string>("icon") ?? app.Icon;
                app.AccentColor = body.Value<string>("accentColor") ?? app.AccentColor;
                app.IsEnabled = body.Value<bool?>("isEnabled") ?? app.IsEnabled;
                app.SortOrder = body.Value<int?>("sortOrder") ?? app.SortOrder;
                var uid = _platform.UserId;
                if (app.AppId == 0) app.CreatedByUserId = uid;
                app.ModifiedByUserId = uid;
                var savedId = CreateAppDefinitionService().Save(app, null);
                return Ok(new { appId = savedId, appKey = app.AppKey, appScope = app.AppScope });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Phase2/AppDefinitionDelete")]
        [MegaFormAuthorize(MegaFormPermissionConstants.DeleteLetter)]
        public IActionResult AppDefinitionDelete([FromBody] JObject body)
        {
            try
            {
                int appId = (body != null ? body.Value<int?>("appId") : null) ?? 0;
                if (appId <= 0) return BadRequest(new { error = "appId required" });
                CreateAppDefinitionService().Delete(appId);
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Phase2/AppDefinitionAssignForm")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult AppDefinitionAssignForm([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            try
            {
                int formId = body.Value<int?>("formId") ?? 0;
                var appScope = body.Value<string>("appScope") ?? string.Empty;
                bool assign = body.Value<bool?>("assign") ?? true;
                if (formId <= 0) return BadRequest(new { error = "formId required" });
                var form = _formRepo.GetForm(formId);
                if (form == null) return NotFound(new { error = "Form not found" });
                form.AppScope = assign ? appScope : string.Empty;
                _formRepo.SaveForm(form);
                return Ok(new { formId, appScope = form.AppScope, assign });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        private AppDefinitionService CreateAppDefinitionService()
        {
            var appProfile = HttpContext.RequestServices.GetService(typeof(AppProfileService)) as AppProfileService ?? new AppProfileService();
            return new AppDefinitionService(_phase2Repo, _formRepo, appProfile);
        }
    }
}
