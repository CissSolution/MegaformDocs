using System;
using System.Collections.Generic;
using System.Net;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Services;

namespace MegaForm.Oqtane.Server.Controllers
{
    // [FastPaint "Cách B" v20260620-B207] Server-rendered standalone form PAGE.
    //
    // WHY: the MegaForm Oqtane MODULE is a Blazor Server interactive component that Oqtane
    // does NOT prerender, so its form markup never appears in the first HTTP response — it
    // only renders after the SignalR circuit connects (~1s+). That circuit wait is the
    // irreducible "delay" for the module path.
    //
    // This endpoint sidesteps the circuit entirely: it returns a COMPLETE HTML document with
    // the form already rendered server-side (FormHtmlRenderer) IN THE INITIAL RESPONSE — so a
    // `curl` shows the real fields and the browser paints them with zero JS/circuit wait
    // ("no-delay"). The MegaForm JS then hydrates the same DOM for interactivity; the renderer's
    // rebuild is a single synchronous tick (no visible flash — verified: 0 empty-wipe frames).
    // The schema is INLINED into the boot so there is no second Schema round-trip either.
    //
    // Use for fast public/marketing forms: link to /api/MegaForm/render/{id} directly, or embed
    // via <iframe>. Anonymous + published-only (same gate as the Schema endpoint). The page HTML
    // is text/html so the B205 response-compression middleware brotli-compresses it.
    public partial class MegaFormController
    {
        // [P0c 20260620-B215] Single source of truth — see MegaForm.Oqtane.Shared.MegaFormAssetVersion.
        // static readonly (not const) so the iframe render page and the host module page
        // (OqtaneCoreAssetVersion) always stamp the SAME ?v= and can never desync.
        private static readonly string RenderPageAssetVersion = MegaForm.Oqtane.Shared.MegaFormAssetVersion.Current;

        [HttpGet("render/{formId}")]
        [AllowAnonymous]
        public IActionResult RenderPage(int formId)
        {
            var form = _formRepo.GetForm(formId);
            if (form == null || !string.Equals(form.Status, "Published", StringComparison.OrdinalIgnoreCase))
                return NotFound();

            var resolved = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
            var presetKey = GetSelectedThemePresetKey(form.ModuleId);
            var inlineCss = ThemePresetInlineCssService.Build(resolved.SettingsJson, presetKey, "#mf-form-wrapper-" + formId) ?? string.Empty;
            var schemaJson = resolved.SchemaJson ?? "{}";

            string fieldsBody = string.Empty;
            bool hasCustomHtml = false;
            string customCss = string.Empty;
            try
            {
                var schema = JsonConvert.DeserializeObject<FormSchema>(schemaJson);
                if (schema != null)
                {
                    hasCustomHtml = !string.IsNullOrWhiteSpace(schema.Settings?.CustomHtml);
                    customCss = schema.Settings?.CustomCss ?? string.Empty;
                    fieldsBody = FormHtmlRenderer.RenderFieldsBody(schema, formId, null);
                }
            }
            catch { /* fall back to empty body — the JS renderer still builds it after boot */ }

            // [SingleSource v20260624-B260] Compose the form's FULL CSS into ONE block via the
            // shared Core composer (preset + scoped theme vars + authored customCss + custom-shell
            // compat, widened predicate), matching the module host. The iframe wrapper already
            // carries data-mf-ssr="1", so the public renderer does NOTHING to CSS. inlineCss is
            // folded in, so the separate mf-inline-preset block is no longer emitted below.
            string wrapperRuntimeClasses = string.Empty;
            try
            {
                var settingsObj = JObject.Parse(schemaJson)["settings"] as JObject
                                  ?? JObject.Parse(schemaJson)["Settings"] as JObject;
                wrapperRuntimeClasses = settingsObj != null ? ThemeFirstPaintCssService.BuildWrapperRuntimeClasses(settingsObj) : string.Empty;
                customCss = ModuleCssComposer.Compose(formId, settingsObj, inlineCss, null);
            }
            catch
            {
                // non-fatal: first paint falls back to authored customCss (+ compat for custom-HTML).
                customCss = hasCustomHtml
                    ? CustomShellCompatibilityCssService.AppendTo(customCss, "#mf-form-wrapper-" + formId)
                    : (customCss ?? string.Empty);
            }
            inlineCss = string.Empty; // folded into customCss by the composer (one block only)

            var manifest = BuildAssetManifest(schemaJson);
            var html = BuildRenderPageHtml(
                formId,
                schemaJson,
                resolved.SettingsJson,
                form.ThemeJson,
                form.Title,
                form.Description,
                resolved.SubmitButtonText,
                form.SuccessMessage,
                inlineCss,
                customCss,
                fieldsBody,
                hasCustomHtml,
                wrapperRuntimeClasses,
                manifest?.ScriptFiles ?? new List<string>(),
                manifest?.StyleFiles ?? new List<string>());

            return Content(html, "text/html; charset=utf-8");
        }

        private static string BuildRenderPageHtml(
            int formId, string schemaJson, string settingsJson, string themeJson,
            string formTitle, string formDescription, string submitButtonText, string successMessage,
            string inlineCss, string customCss, string fieldsBody, bool hasCustomHtml,
            string wrapperRuntimeClasses,
            List<string> pluginScripts, List<string> pluginStyles)
        {
            const string mp = "/Modules/MegaForm/";
            string v = RenderPageAssetVersion;
            string title = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(formTitle) ? "Form" : formTitle);
            string desc = WebUtility.HtmlEncode(formDescription ?? string.Empty);
            string submit = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(submitButtonText) ? "Submit" : submitButtonText);
            string hp = "mf_hp_" + formId + "_" + Guid.NewGuid().ToString("N").Substring(0, 5);

            // Lean boot payload. The form is ALREADY rendered server-side (visible immediately),
            // so the schema is NOT inlined (it would add ~165 KB to the initial HTML and slow first
            // paint). The JS fetches the now-brotli-compressed Schema (~19 KB) to hydrate the same
            // DOM for interactivity — the form stays visible the whole time (rebuild is one
            // synchronous tick, no flash).
            string bootPayload = JsonConvert.SerializeObject(new
            {
                formId,
                apiBase = "/api/MegaForm/",
                container = "mf-form-mount-" + formId
            });

            var sb = new StringBuilder(8192);
            sb.Append("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">");
            sb.Append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
            sb.Append("<title>").Append(title).Append("</title>");
            // Pre-warm DNS/TCP/TLS to the common third-party font/CDN hosts a form template may
            // reference in its customCss (e.g. Google Fonts) so those render-blocking requests
            // don't pay a cold connection on first paint. Cheap + harmless if unused.
            sb.Append("<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">");
            sb.Append("<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>");
            sb.Append("<link rel=\"preconnect\" href=\"https://cdnjs.cloudflare.com\">");
            // Preload the heaviest hydration asset so it starts downloading before the parser
            // reaches the body scripts.
            sb.Append("<link rel=\"preload\" as=\"script\" href=\"").Append(mp).Append("js/megaform-renderer.js?v=").Append(v).Append("\">");
            // Self-hosted, same-origin CSS only (no third-party render-blocking).
            sb.Append(Css(mp + "lib/fontawesome/css/all.min.css", v));
            sb.Append(Css(mp + "lib/fonts/dm-sans.css", v));
            sb.Append(Css(mp + "css/megaform.css", v));
            sb.Append(Css(mp + "css/megaform-widgets.css", v));
            sb.Append(Css(mp + "css/megaform-themes.css", v));
            sb.Append(Css(mp + "css/plugins/megaform-widgets-builtin.css", "20260404-05"));
            foreach (var s in pluginStyles) sb.Append(Css(mp + "css/plugins/" + s, v));
            if (!string.IsNullOrWhiteSpace(inlineCss))
                sb.Append("<style id=\"mf-inline-preset-").Append(formId).Append("\">").Append(inlineCss).Append("</style>");
            if (!string.IsNullOrWhiteSpace(customCss))
                sb.Append("<style id=\"mf-custom-css-").Append(formId).Append("\">").Append(customCss).Append("</style>");
            sb.Append("<style>html,body{margin:0;padding:0;background:var(--mf-page-bg,#f5f5f5);}</style>");
            sb.Append("</head><body>");

            // ── Form rendered SERVER-SIDE, present in the initial response (no-delay) ──
            // Structure mirrors the JS renderer's buildSkeleton() so init() hydrates it
            // (buildSkeleton no-ops because #mf-fields-container-{id} already exists).
            sb.Append("<div id=\"mf-form-mount-").Append(formId).Append("\" data-form-id=\"").Append(formId).Append("\">");
            sb.Append("<div id=\"mf-form-wrapper-").Append(formId).Append("\" class=\"mf-form-wrapper")
              .Append(hasCustomHtml ? " mf-custom-shell-mode" : string.Empty)
              .Append(string.IsNullOrWhiteSpace(wrapperRuntimeClasses) ? string.Empty : " " + wrapperRuntimeClasses)
              .Append("\" data-mf-ssr=\"1\">");
            sb.Append("<div class=\"mf-form-inner\">");
            if (!hasCustomHtml && (!string.IsNullOrEmpty(title) || !string.IsNullOrEmpty(desc)))
            {
                sb.Append("<div class=\"mf-form-header\">");
                if (!string.IsNullOrEmpty(title)) sb.Append("<h1 class=\"mf-form-title\">").Append(title).Append("</h1>");
                if (!string.IsNullOrEmpty(desc)) sb.Append("<p class=\"mf-form-description\">").Append(desc).Append("</p>");
                sb.Append("</div>");
            }
            sb.Append("<div id=\"mf-form-").Append(formId).Append("\" class=\"mf-form\">");
            sb.Append("<div id=\"mf-progress-").Append(formId).Append("\" class=\"mf-progress-bar\" style=\"display:none;\"></div>");
            sb.Append("<div id=\"mf-fields-container-").Append(formId).Append("\" class=\"mf-fields-container\">").Append(fieldsBody ?? string.Empty).Append("</div>");
            sb.Append("<div style=\"position:absolute;left:-9999px;top:-9999px;height:0;width:0;overflow:hidden;\" aria-hidden=\"true\" tabindex=\"-1\">");
            sb.Append("<input type=\"text\" id=\"mf_hp_").Append(formId).Append("\" name=\"").Append(hp).Append("\" value=\"\" autocomplete=\"off\" tabindex=\"-1\"/></div>");
            sb.Append("<input type=\"hidden\" id=\"mf-form-id-").Append(formId).Append("\" value=\"").Append(formId).Append("\"/>");
            sb.Append("<div class=\"mf-form-actions\">");
            sb.Append("<button type=\"button\" id=\"mf-btn-prev-").Append(formId).Append("\" class=\"mf-btn mf-btn-prev\" style=\"display:none;\"><i class=\"fa fa-arrow-left\"></i> Previous</button>");
            sb.Append("<button type=\"button\" id=\"mf-btn-next-").Append(formId).Append("\" class=\"mf-btn mf-btn-next\" style=\"display:none;\">Next <i class=\"fa fa-arrow-right\"></i></button>");
            sb.Append("<button type=\"button\" id=\"mf-btn-submit-").Append(formId).Append("\" class=\"mf-btn mf-btn-submit\"><i class=\"fa fa-paper-plane\"></i> ").Append(submit).Append("</button>");
            sb.Append("</div></div>"); // .mf-form-actions, .mf-form
            sb.Append("<div id=\"mf-success-").Append(formId).Append("\" class=\"mf-success-message\" style=\"display:none;\"><div class=\"alert alert-success\"><i class=\"fa fa-check-circle fa-2x\"></i><h3>Thank You!</h3><p id=\"mf-success-text-").Append(formId).Append("\"></p></div></div>");
            sb.Append("</div></div></div>"); // .mf-form-inner, .mf-form-wrapper, #mf-form-mount

            // ── Platform + core JS + inlined-schema boot ──
            sb.Append("<script>window.__MF_PLATFORM__={platform:'oqtane',apiBase:'/api/MegaForm/',moduleId:0,siteId:0,portalId:0,authToken:null,__booted:true};</script>");
            sb.Append(Js(mp + "js/megaform-config.js", v));
            sb.Append(Js(mp + "js/megaform-i18n.js", v));
            sb.Append(Js(mp + "js/megaform-widgets.js", v));
            sb.Append(Js(mp + "js/plugins/types.js", null));
            sb.Append(Js(mp + "js/megaform-rule-engine.js", v));
            sb.Append(Js(mp + "js/megaform-renderer.js", v));
            foreach (var s in pluginScripts) sb.Append(Js(mp + "js/plugins/" + s, v));
            sb.Append("<script>(function(o){function go(){if(!(window.MegaFormRenderer&&window.MegaFormRenderer.init)){setTimeout(go,30);return;}fetch(o.apiBase+'Schema/'+o.formId).then(function(r){return r.json();}).then(function(d){var s=d.schema;if(typeof s==='string'){try{s=JSON.parse(s);}catch(e){s={};}}window.MegaFormRenderer.init({formId:o.formId,schema:s,settingsJson:d.settingsJson,themeJson:d.themeJson,title:d.title,description:d.description,container:'#'+o.container,submitButtonText:d.submitButtonText,successMessage:d.successMessage,apiBase:o.apiBase});}).catch(function(e){console.error('MegaForm render-page hydrate failed',e);});}go();})(");
            sb.Append(bootPayload);
            sb.Append(");</script>");

            // [B208 iframe auto-resize] When this page is embedded via <iframe> on an Oqtane
            // page, broadcast the form's full height to the parent so it can size the iframe
            // (no inner scrollbar, no clipping). Multi-step nav, validation errors and the
            // post-submit card all change height -> a ResizeObserver re-broadcasts. The
            // window.parent!==window guard makes this a no-op when opened standalone.
            sb.Append("<script>(function(){");
            sb.Append("var embedded=(window.parent&&window.parent!==window);");
            // In embed context, neutralize viewport-fill (min-height:100vh) used by premium
            // page-style templates. Otherwise it ratchets: a tall iframe -> 100vh == iframe
            // height -> the form stretches to fill it -> body.scrollHeight == iframe height ->
            // re-broadcasts the same tall height forever. min-height:0 lets the form collapse to
            // its real content height so auto-resize converges. (No-op when opened standalone.)
            sb.Append("if(embedded){var st=document.createElement('style');st.textContent='html,body{height:auto!important;min-height:0!important}#mf-form-mount-").Append(formId).Append(",.mf-form-wrapper,.mf-form,.mf-form-inner,[class*=\\\"mfp\\\"]{min-height:0!important}';(document.head||document.documentElement).appendChild(st);}");
            // Measure CONTENT height, not documentElement.scrollHeight (which pins to the viewport
            // once the iframe grows). The mount rect + body.scrollHeight track real content and
            // can shrink back (e.g. multi-step forms that collapse after hydration).
            sb.Append("function h(){var m=document.getElementById('mf-form-mount-").Append(formId).Append("');var bh=document.body?document.body.scrollHeight:0;var mh=m?Math.ceil(m.getBoundingClientRect().bottom):0;return Math.max(bh,mh);}");
            sb.Append("function send(){if(embedded){try{window.parent.postMessage({type:'mf-resize',formId:").Append(formId).Append(",height:h()},'*');}catch(e){}}}");
            sb.Append("send();window.addEventListener('load',send);window.addEventListener('resize',send);");
            sb.Append("[200,600,1200,2500].forEach(function(t){setTimeout(send,t);});");
            sb.Append("if(typeof ResizeObserver!=='undefined'){try{var ro=new ResizeObserver(send);if(document.body)ro.observe(document.body);}catch(e){}}");
            sb.Append("})();</script>");

            sb.Append("</body></html>");
            return sb.ToString();
        }

        private static string Css(string href, string v) =>
            "<link rel=\"stylesheet\" href=\"" + href + (string.IsNullOrEmpty(v) ? string.Empty : "?v=" + v) + "\">";

        private static string Js(string src, string v) =>
            "<script src=\"" + src + (string.IsNullOrEmpty(v) ? string.Empty : "?v=" + v) + "\"></script>";
    }
}
