using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Umbraco.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;
using MegaForm.Umbraco.Permissions;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Extra form endpoints for Umbraco parity: lock/unlock, theme save, rule evaluation.
    /// </summary>
    public partial class MegaFormApiController
    {
        private string LockedFormsPath => Path.Combine(MegaFormUmbracoPaths.GetContentRoot(_env), "App_Data", "MegaForm", "locked-forms.json");

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/LockedIds")]
        [MegaFormAuthorize(MegaFormPermissionConstants.BrowseLetter)]
        public IActionResult GetLockedIds()
        {
            var ids = ReadLockedIds();
            return Ok(new { lockedIds = ids.OrderBy(x => x).ToList() });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Lock")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult LockForm([FromBody] JObject body)
        {
            int id = body?.Value<int>("formId") ?? 0;
            if (id == 0) return BadRequest(new { error = "formId required" });
            var ids = ReadLockedIds();
            ids.Add(id);
            WriteLockedIds(ids);
            return Ok(new { success = true, lockedIds = ids.OrderBy(x => x).ToList() });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Unlock")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult UnlockForm([FromBody] JObject body)
        {
            int id = body?.Value<int>("formId") ?? 0;
            if (id == 0) return BadRequest(new { error = "formId required" });
            var ids = ReadLockedIds();
            ids.Remove(id);
            WriteLockedIds(ids);
            return Ok(new { success = true, lockedIds = ids.OrderBy(x => x).ToList() });
        }

        private HashSet<int> ReadLockedIds()
        {
            try
            {
                if (!System.IO.File.Exists(LockedFormsPath)) return new HashSet<int>();
                var json = System.IO.File.ReadAllText(LockedFormsPath);
                var arr = JsonConvert.DeserializeObject<List<int>>(json) ?? new List<int>();
                return new HashSet<int>(arr);
            }
            catch { return new HashSet<int>(); }
        }

        private void WriteLockedIds(HashSet<int> ids)
        {
            try
            {
                var dir = Path.GetDirectoryName(LockedFormsPath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                System.IO.File.WriteAllText(LockedFormsPath,
                    JsonConvert.SerializeObject(ids.OrderBy(x => x).ToList()));
            }
            catch { }
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/SaveTheme")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult SaveTheme([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "body required" });
            int formId = body.Value<int>("FormId");
            string themeJson = body["ThemeJson"]?.ToString() ?? "{}";
            string schemaCustomCss = body["SchemaCustomCss"]?.ToString();
            string themeId = body["ThemeId"]?.ToString();
            var cssOverrides = body["CssOverrides"] as JObject;
            bool? hideHeader = (body["HideHeader"] is JToken hh && hh.Type == JTokenType.Boolean) ? hh.Value<bool>() : (bool?)null;
            if (formId == 0) return BadRequest(new { error = "FormId required" });

            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "Form not found" });

            form.ThemeJson = themeJson;
            JObject settingsForSave = null;
            if (!string.IsNullOrWhiteSpace(form.SchemaJson))
            {
                try
                {
                    var schemaObj = JObject.Parse(form.SchemaJson);
                    var settingsObj = schemaObj["settings"] as JObject;
                    if (settingsObj != null)
                    {
                        if (!string.IsNullOrWhiteSpace(schemaCustomCss))
                            settingsObj["customCss"] = schemaCustomCss;
                        if (cssOverrides != null)
                            settingsObj["cssOverrides"] = cssOverrides;
                        if (hideHeader.HasValue)
                            settingsObj["hideHeader"] = hideHeader.Value;
                        schemaObj["settings"] = settingsObj;
                        settingsForSave = schemaObj;
                    }
                    else if (!string.IsNullOrWhiteSpace(schemaCustomCss) || cssOverrides != null || hideHeader.HasValue)
                    {
                        settingsObj = new JObject();
                        if (!string.IsNullOrWhiteSpace(schemaCustomCss))
                            settingsObj["customCss"] = schemaCustomCss;
                        if (cssOverrides != null)
                            settingsObj["cssOverrides"] = cssOverrides;
                        if (hideHeader.HasValue)
                            settingsObj["hideHeader"] = hideHeader.Value;
                        settingsForSave = schemaObj;
                        settingsForSave["settings"] = settingsObj;
                    }
                }
                catch { }
            }

            if (settingsForSave != null)
                form.SchemaJson = settingsForSave.ToString(Formatting.None);

            form.UpdatedOnUtc = DateTime.UtcNow;
            form.UpdatedByUserId = _platform.UserId > 0 ? _platform.UserId : form.UpdatedByUserId;
            _formRepo.SaveForm(form);
            return Ok(new { success = true, formId });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/EvaluateRules")]
        [AllowAnonymous]
        public IActionResult EvaluateRules([FromBody] JObject body)
        {
            try
            {
                var rulesJson = body?.Value<string>("rulesJson") ?? "[]";
                var formDataToken = body?["formData"] as JObject;

                var formData = new Dictionary<string, object>();
                if (formDataToken != null)
                {
                    foreach (var prop in formDataToken.Properties())
                    {
                        formData[prop.Name] = prop.Value is JValue jv ? jv.Value : (object)prop.Value;
                    }
                }

                var settings = new JsonSerializerSettings();
                settings.Converters.Add(new ConditionNodeConverter());
                var rules = JsonConvert.DeserializeObject<List<RuleDefinition>>(rulesJson, settings)
                            ?? new List<RuleDefinition>();

                var effects = RuleEvaluator.EvaluateRules(rules, formData);
                return Ok(effects);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }
    }
}
