using System;
using System.Net;
using System.Net.Http;
using System.Web;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Services;
using MegaForm.DNN.Data;

namespace MegaForm.WebApi
{
    /// <summary>
    /// [ShellParity v20260714-04] Print preview of a BLANK form (the A4/Letter layout the Print tab
    /// designs), rendered by Core's PrintFormRenderer.
    ///
    /// The builder's "Preview" button used to open /f/{id}/print on every platform — a route that
    /// only MegaForm.Web serves. On DNN that landed on the site's 404 page, so the Print tab could be
    /// configured but never seen. (Submissions/{id}/Print already existed here; that prints a FILLED
    /// submission, which is a different document.)
    ///
    /// Route (catch-all {controller}/{action}): /DesktopModules/MegaForm/API/Print/Form?formId=42
    ///
    /// Security (Docs/SECURITY_CODING_RULES.md):
    ///  - [AllowAnonymous] on purpose, with a gate: anonymous callers get the document only when the
    ///    admin turned the print layout ON *and* the form is Published — the same opt-in the Web
    ///    platform relies on (a blank form exposes no submission data; it is the same content the
    ///    public render page already shows). An admin of this portal sees it in any state, which is
    ///    what makes the builder's Preview button work on an unpublished draft.
    ///  - The form must belong to the CURRENT portal — a form id from another portal is a 404, not a
    ///    document (rule 1: never let the client pick which tenant's data it reads).
    ///  - Errors never carry ex.Message (rule 10).
    /// </summary>
    public class PrintController : DnnApiController
    {
        private bool IsPortalAdmin =>
            UserInfo != null && (UserInfo.IsSuperUser || UserInfo.IsInRole("Administrators"));

        [HttpGet]
        [AllowAnonymous] // gated below: anonymous requires printSettings.enabled + Published
        [ActionName("Form")]
        public HttpResponseMessage Form(int formId)
        {
            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });

            try
            {
                var form = new DnnFormRepository().GetForm(formId);
                var portalId = PortalSettings != null ? PortalSettings.PortalId : 0;
                if (form == null || form.PortalId != portalId)
                    return Text(HttpStatusCode.NotFound, "Form not found.");

                // Resolve exactly like the renderer does: on DNN, SettingsJson OVERRIDES SchemaJson,
                // so reading SchemaJson alone would print yesterday's print settings.
                FormSchema schema;
                try
                {
                    schema = RenderModelResolver.ResolveSchema(
                        form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
                }
                catch { schema = null; }

                if (schema == null)
                    return Text(HttpStatusCode.NotFound, "Form schema could not be read.");

                var print = schema.Settings != null ? schema.Settings.PrintSettings : null;
                var enabled = print != null && print.Enabled;
                var published = string.Equals(form.Status, "Published", StringComparison.OrdinalIgnoreCase);

                if (!IsPortalAdmin && (!enabled || !published))
                    return Text(HttpStatusCode.NotFound, "Print layout is not enabled for this form.");

                if (!enabled)
                    return Text(HttpStatusCode.OK,
                        "Print layout is OFF for this form. Turn on \"Enable print layout\" in the Print tab, save, then preview again.");

                var baseUrl = Request.RequestUri != null
                    ? Request.RequestUri.Scheme + "://" + Request.RequestUri.Authority
                    : string.Empty;

                var html = new PrintFormRenderer().RenderHtml(form, schema, baseUrl);
                html = html.Replace("<body>", "<body>" + Toolbar(form.Title));

                var resp = Request.CreateResponse(HttpStatusCode.OK);
                resp.Content = new StringContent(html, System.Text.Encoding.UTF8, "text/html");
                return resp;
            }
            catch (Exception ex)
            {
                try { DotNetNuke.Services.Exceptions.Exceptions.LogException(ex); } catch { }
                return Text(HttpStatusCode.InternalServerError, "The print preview could not be rendered — see the DNN event log.");
            }
        }

        /// <summary>Same toolbar the submission print and the Web platform inject.</summary>
        private static string Toolbar(string formTitle)
        {
            var title = HttpUtility.HtmlEncode(string.IsNullOrWhiteSpace(formTitle) ? "Form" : formTitle);
            return "<div class=\"mf-print-toolbar\">"
                 + "<span>🖨️ <b style=\"color:#e2e8f0\">" + title + "</b> · preview</span>"
                 + "<div style=\"flex:1\"></div>"
                 + "<button class=\"mf-print-tb-btn ghost\" onclick=\"window.close()\">✕ Close</button>"
                 + "<button class=\"mf-print-tb-btn primary\" onclick=\"window.print()\">🖨️ Print / Save PDF</button>"
                 + "</div><div style=\"height:44px\"></div>";
        }

        /// <summary>A message the admin actually reads in the tab they just opened — this endpoint is
        /// navigated to, not fetched, so a JSON error body would render as raw text.</summary>
        private HttpResponseMessage Text(HttpStatusCode status, string message)
        {
            var resp = Request.CreateResponse(status);
            resp.Content = new StringContent(
                "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>MegaForm print</title></head>"
                + "<body style=\"font:15px/1.6 system-ui,sans-serif;color:#0f172a;padding:40px\">"
                + HttpUtility.HtmlEncode(message) + "</body></html>",
                System.Text.Encoding.UTF8, "text/html");
            return resp;
        }
    }
}
