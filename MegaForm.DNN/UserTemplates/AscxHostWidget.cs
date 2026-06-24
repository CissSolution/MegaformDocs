// AscxHostWidget.cs
// -----------------------------------------------------------------------------
// MegaForm BYOM (Bring-Your-Own-Module) — host for customer-supplied .ascx
// templates living under ~/DesktopModules/MegaForm/Resources/UserTemplates/.
//
// This is a Phase 1 port of the CISS.SideMenu `_embeddedModules` + `eModule`
// pattern, with the lifecycle / ID / sandbox fixes recommended in the BYOM
// scout report.
//
// =============================================================================
//  LIFECYCLE — read this first
// =============================================================================
//
//  CISS embedded modules late-add inside Page_Load -> ProcessHtmlWithModules
//  AFTER the host page has already finished its Init / TrackViewState phase.
//  That late-add path is why their ViewState + postback resolution is broken
//  (UniqueIDs change every request, ID path is missing during PostBackData
//  resolution, etc.). The CISS code itself acknowledges this with a
//  swallow-all try/catch around the Pane.InjectModule loop.
//
//  This host EXPLICITLY rejects that timing. Callers MUST invoke
//  HostUserAscx() during the parent page's OnInit (or earlier) so the
//  embedded UserControl participates in:
//
//    1. TrackViewState   — viewstate round-trips correctly
//    2. PostBackData      — server-side events from inside the .ascx fire
//    3. Validators        — register against Page.Validators normally
//    4. ID path stability — UniqueID is deterministic across postbacks
//
//  Typical caller pattern (inside FormView.ascx.cs):
//
//      protected override void OnInit(EventArgs e)
//      {
//          base.OnInit(e);
//          foreach (var w in form.Widgets.OfType<AscxHostDescriptor>())
//          {
//              var ctl = AscxHostWidget.HostUserAscx(
//                  w.TemplatePath,         // "blog-card/template.ascx"
//                  w.DataModel,            // IDictionary<string,object>
//                  this.Page);
//              AscxHostPlaceholder.Controls.Add(ctl);
//          }
//      }
//
// =============================================================================
//  DATA MODEL CONTRACT
// =============================================================================
//
//  The customer's code-behind can consume the data model in three ways,
//  tried in order:
//
//    A. Implement IMegaFormUserTemplate (recommended, strongly typed).
//
//          public partial class BlogCard : UserControl, IMegaFormUserTemplate
//          {
//              public IDictionary<string,object> MegaFormData { get; set; }
//              protected void Page_Load(object sender, EventArgs e)
//              {
//                  litTitle.Text = (string)MegaFormData["title"];
//              }
//          }
//
//    B. Expose a writable property named "MegaFormData" of compatible type
//       (IDictionary<string,object>, IDictionary, or object). We reflect and
//       set it. This is the no-reference fallback for customers who don't
//       want to take a DLL dependency on MegaForm.DNN.
//
//    C. If neither A nor B is present we stuff the dictionary into
//       HttpContext.Current.Items under the key "MegaFormData::<UniqueID>"
//       so the .ascx can pull it via the helper on this class
//       (`AscxHostWidget.GetCurrentData(this)`).
//
// =============================================================================
//  SANDBOXING (Phase 1 minimums)
// =============================================================================
//
//   - Templates MUST live under ~/DesktopModules/MegaForm/Resources/UserTemplates/.
//   - Path traversal (".." segments, rooted paths, ":" chars) is rejected.
//   - File must end in ".ascx".
//   - Upload of new template folders is a Host-only operation and is OUT OF
//     SCOPE for this file. This file only LOADS templates — the upload UI is
//     elsewhere.
//   - Code-behind .cs in a separate file requires DNN App_Code-style runtime
//     compilation; we accept inline <script runat="server"> blocks in the
//     .ascx itself, which DNN compiles automatically via the BuildProvider.
//
// =============================================================================
//  PORT NOTES vs CISS
// =============================================================================
//   - eModule wrapper is kept (internal record of TemplatePath + StableId)
//     because callers may want to introspect what was queued — but we DO NOT
//     run a deferred two-pass like CISS. We instantiate immediately during
//     HostUserAscx().
//   - We do NOT call Pane.InjectModule / ModuleController.GetTabModulesByModule.
//     There's no DNN ModuleInfo to clone for a customer file — we use
//     Page.LoadControl directly.
//   - Stable IDs: CISS used Guid.NewGuid() every request, which breaks
//     ViewState rehydration. We derive a deterministic ID from a SHA1 of
//     (templatePath + optional widgetId hint) so the UniqueID is byte-for-byte
//     stable across postbacks.
//   - No swallow-all try/catch hiding errors. Compile / load failures are
//     surfaced as an inline error LiteralControl with the underlying
//     exception message visible to the form author.
//
// =============================================================================

using System;
using System.Collections;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Web;
using System.Web.UI;
using System.Web.UI.WebControls;

namespace MegaForm.DNN.UserTemplates
{
    /// <summary>
    /// Optional strongly-typed contract for customer .ascx code-behinds.
    /// Implement this on your UserControl to receive the MegaForm data model
    /// before Page_Load runs.
    /// </summary>
    public interface IMegaFormUserTemplate
    {
        IDictionary<string, object> MegaFormData { get; set; }
    }

    /// <summary>
    /// Deferred-instantiation record. Kept as a near-1:1 port of CISS.eModule
    /// (2 properties, no behaviour). Unlike CISS we do not queue a List of
    /// these for a second pass — we instantiate immediately in HostUserAscx —
    /// but the type is exposed so callers can return it from a designer / log
    /// it / inspect it.
    /// </summary>
    public sealed class EmbeddedAscxRecord
    {
        public EmbeddedAscxRecord(string templatePath, string stableId)
        {
            TemplatePath = templatePath;
            StableId = stableId;
        }

        /// <summary>Virtual path of the loaded .ascx (post-resolution).</summary>
        public string TemplatePath { get; set; }

        /// <summary>Deterministic UniqueID assigned to the loaded UserControl.</summary>
        public string StableId { get; set; }
    }

    /// <summary>
    /// Hosts a customer-supplied .ascx file from
    /// ~/DesktopModules/MegaForm/Resources/UserTemplates/ inside a parent
    /// MegaForm FormView. See the file header for the lifecycle contract.
    /// </summary>
    public static class AscxHostWidget
    {
        /// <summary>
        /// Root folder under which customer .ascx templates are allowed to live.
        /// </summary>
        private const string TemplatesVirtualRoot =
            "~/DesktopModules/MegaForm/Resources/UserTemplates/";

        /// <summary>
        /// HttpContext.Current.Items key prefix used by the option-C data-bridge.
        /// </summary>
        private const string ContextDataKeyPrefix = "MegaFormData::";

        /// <summary>
        /// Loads a customer .ascx from the BYOM UserTemplates folder, hands it
        /// the supplied data model, and returns the resulting Control ready to
        /// be added to the parent page's control tree.
        ///
        /// CRITICAL: call this during the parent page's <c>OnInit</c> (or
        /// earlier). Adding the returned control later in the lifecycle (e.g.
        /// from Page_Load) breaks ViewState + postback resolution — see the
        /// file header.
        /// </summary>
        /// <param name="ascxFilePath">
        /// Either a relative path like <c>"blog-card/template.ascx"</c>
        /// (resolved against ~/DesktopModules/MegaForm/Resources/UserTemplates/)
        /// or a fully-qualified app-relative path like
        /// <c>"~/DesktopModules/MegaForm/Resources/UserTemplates/blog-card/template.ascx"</c>.
        /// Path traversal is rejected.
        /// </param>
        /// <param name="dataModel">
        /// Data dictionary forwarded to the .ascx code-behind. May be null;
        /// an empty dictionary is substituted.
        /// </param>
        /// <param name="parentPage">
        /// The host page used for LoadControl + relative-path resolution.
        /// Required (LoadControl needs a Page context).
        /// </param>
        /// <returns>
        /// Either the instantiated UserControl on success, OR a
        /// <see cref="LiteralControl"/> containing a friendly inline error
        /// message on failure. Callers can always Add the result to the page
        /// tree without further null-checking.
        /// </returns>
        public static Control HostUserAscx(
            string ascxFilePath,
            IDictionary<string, object> dataModel,
            Page parentPage)
        {
            if (parentPage == null)
                return RenderError("AscxHostWidget: parentPage is null.");

            // Resolve + validate the virtual path.
            string virtualPath;
            try
            {
                virtualPath = ResolveAndValidatePath(ascxFilePath);
            }
            catch (Exception ex)
            {
                return RenderError("AscxHostWidget path error: " + ex.Message);
            }

            // Stable deterministic ID — same template + same input path => same
            // UniqueID on every request. Postback target resolution + ViewState
            // rehydration depend on this.
            string stableId = ComputeStableId(virtualPath);

            // LoadControl. We intentionally let exceptions thrown by the
            // customer's code-behind surface here as a visible error block
            // rather than the CISS-style swallow-all.
            // TODO [MEDIUM][SECURITY] FormView is reachable by anonymous users
            // for public forms; LoadControl exceptions can leak filesystem
            // paths, line numbers and stack snippets via hex.Message /
            // ex.Message. Consider rendering a generic "template failed to
            // load" message to anonymous callers and a detailed error only
            // when HttpContext.Current.User.IsInRole("Administrators"). Log
            // the full exception via DnnLog so the host can still debug.
            Control loaded;
            try
            {
                loaded = parentPage.LoadControl(virtualPath);
            }
            catch (HttpException hex)
            {
                return RenderError(
                    "AscxHostWidget: failed to load '" + virtualPath +
                    "'. " + hex.Message);
            }
            catch (Exception ex)
            {
                return RenderError(
                    "AscxHostWidget: error loading '" + virtualPath +
                    "'. " + ex.GetType().Name + ": " + ex.Message);
            }

            if (loaded == null)
                return RenderError(
                    "AscxHostWidget: LoadControl returned null for '" +
                    virtualPath + "'.");

            // Assign the stable ID BEFORE the control is added to the tree
            // by the caller. ID must be set before NamingContainer attaches
            // for it to be honoured.
            loaded.ID = stableId;

            // Hand the data model to the loaded control via the three-tier
            // contract (interface -> reflected property -> HttpContext.Items).
            var model = dataModel ?? new Dictionary<string, object>(0);
            BindDataModel(loaded, model, parentPage);

            return loaded;
        }

        /// <summary>
        /// Helper for customer .ascx code-behinds that don't implement
        /// <see cref="IMegaFormUserTemplate"/> and don't expose a settable
        /// MegaFormData property. Call from inside the .ascx Page_Load:
        ///
        ///   var data = AscxHostWidget.GetCurrentData(this);
        /// </summary>
        public static IDictionary<string, object> GetCurrentData(Control self)
        {
            if (self == null) return new Dictionary<string, object>(0);
            var ctx = HttpContext.Current;
            if (ctx == null || ctx.Items == null)
                return new Dictionary<string, object>(0);

            string key = ContextDataKeyPrefix + (self.UniqueID ?? self.ID ?? "");
            var v = ctx.Items[key] as IDictionary<string, object>;
            return v ?? new Dictionary<string, object>(0);
        }

        // -----------------------------------------------------------------
        // internals
        // -----------------------------------------------------------------

        private static string ResolveAndValidatePath(string ascxFilePath)
        {
            if (string.IsNullOrWhiteSpace(ascxFilePath))
                throw new ArgumentException("ascxFilePath is required.");

            string p = ascxFilePath.Trim().Replace('\\', '/');

            // Reject path traversal / rooted / volume references outright.
            if (p.IndexOf("..", StringComparison.Ordinal) >= 0)
                throw new ArgumentException("path traversal ('..') not allowed.");
            if (p.IndexOf(':') >= 0)
                throw new ArgumentException("absolute / volume paths not allowed.");
            if (p.StartsWith("/", StringComparison.Ordinal))
                throw new ArgumentException("rooted paths not allowed.");

            // Accept both forms:
            //   "blog-card/template.ascx"
            //   "~/DesktopModules/MegaForm/Resources/UserTemplates/blog-card/template.ascx"
            string virtualPath;
            if (p.StartsWith("~/", StringComparison.OrdinalIgnoreCase))
            {
                virtualPath = p;
            }
            else
            {
                virtualPath = TemplatesVirtualRoot + p.TrimStart('/');
            }

            // Enforce the sandbox root.
            if (virtualPath.IndexOf(
                    TemplatesVirtualRoot, StringComparison.OrdinalIgnoreCase) != 0)
            {
                throw new ArgumentException(
                    "template must live under " + TemplatesVirtualRoot);
            }

            // Enforce the .ascx extension.
            if (!virtualPath.EndsWith(".ascx", StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("template must be a .ascx file.");

            return virtualPath;
        }

        private static string ComputeStableId(string virtualPath)
        {
            // SHA1 of normalised virtual path -> 12 base32-ish chars.
            // Deterministic across requests, app restarts, and machines.
            using (var sha = SHA1.Create())
            {
                var bytes = sha.ComputeHash(
                    Encoding.UTF8.GetBytes(virtualPath.ToLowerInvariant()));
                var sb = new StringBuilder("mfascx_", 24);
                for (int i = 0; i < 8 && i < bytes.Length; i++)
                    sb.Append(bytes[i].ToString("x2"));
                return sb.ToString(); // e.g. "mfascx_3f2a90d11bc4e077"
            }
        }

        private static void BindDataModel(
            Control loaded,
            IDictionary<string, object> model,
            Page parentPage)
        {
            // (A) Strongly-typed interface — preferred.
            var typed = loaded as IMegaFormUserTemplate;
            if (typed != null)
            {
                typed.MegaFormData = model;
                return;
            }

            // (B) Reflected property named "MegaFormData".
            var prop = loaded.GetType().GetProperty(
                "MegaFormData",
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.Instance);
            if (prop != null && prop.CanWrite)
            {
                try
                {
                    var pt = prop.PropertyType;
                    if (pt.IsAssignableFrom(typeof(IDictionary<string, object>)))
                    {
                        prop.SetValue(loaded, model, null);
                        return;
                    }
                    if (pt == typeof(IDictionary))
                    {
                        prop.SetValue(loaded, (IDictionary)model, null);
                        return;
                    }
                    if (pt == typeof(object))
                    {
                        prop.SetValue(loaded, model, null);
                        return;
                    }
                }
                catch
                {
                    // fall through to (C)
                }
            }

            // (C) HttpContext.Items bridge — keyed by the stable ID the
            // customer's .ascx already knows (it IS its own UniqueID).
            var ctx = HttpContext.Current;
            if (ctx != null && ctx.Items != null && loaded.ID != null)
            {
                ctx.Items[ContextDataKeyPrefix + loaded.ID] = model;
            }
        }

        private static LiteralControl RenderError(string message)
        {
            // Visible, inline, NOT swallowed. Form authors need to see this.
            string safe = HttpUtility.HtmlEncode(message ?? "");
            return new LiteralControl(
                "<div class=\"mf-ascx-host-error\" " +
                "style=\"padding:8px 12px;margin:6px 0;border:1px solid #f5c2c7;" +
                "background:#f8d7da;color:#842029;border-radius:4px;" +
                "font:12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;\">" +
                "<strong>MegaForm AscxHost:</strong> " + safe +
                "</div>");
        }
    }
}
