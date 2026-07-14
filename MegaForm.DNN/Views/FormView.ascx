<%@ Control Language="C#" AutoEventWireup="true" CodeBehind="FormView.ascx.cs" Inherits="MegaForm.DNN.Components.FormView" %>

<%
   // [AdminDashboardModeGate v20260506-01] Admin sees the admin shell + dock
   // on every visit, no DNN Edit-mode toggle required. Public visitors and
   // embed contexts still skip the shell.
   var inAdminPath = ViewModel != null && ViewModel.IsAdmin;
   var showAdminShell = inAdminPath
       && !ViewModel.EmbedMode
       && !SuppressInlineAdminShell;
   var homeUrl = ResolveUrl("~/");
%>

<% if (showAdminShell) { %>
<script type="text/javascript">
(function () {
  var hash = String(window.location.hash || '').toLowerCase();
  // [B48 2026-06-02] #mf-theme route retired — redirect to the Builder shell
  // and stash a sessionStorage flag so builder/dom.ts auto-activates the THEME
  // right-rail tab on first paint. Runs BEFORE the URL param normalizer below
  // so the resulting hash is what gets normalized.
  if (hash.indexOf('#mf-theme') === 0) {
    try { sessionStorage.setItem('mf-builder-initial-tab', 'theme'); } catch (_) {}
    try {
      var newUrl = window.location.pathname + (window.location.search || '') + '#mf-builder';
      window.history.replaceState({}, document.title, newUrl);
      hash = '#mf-builder';
    } catch (_) {
      window.location.hash = '#mf-builder';
      return;
    }
  }
  var isOverlayShell = hash.indexOf('#mf-dashboard') === 0 ||
                       hash.indexOf('#mf-submissions') === 0 ||
                       hash.indexOf('#mf-myinbox') === 0 ||
                       hash.indexOf('#mf-views') === 0 ||
                       hash.indexOf('#mf-builder') === 0 ||
                       hash.indexOf('#mf-languages') === 0;
  if (!isOverlayShell) return;
  var url = new URL(window.location.href);
  var shellFormId = url.searchParams.get('mfFormId') || '';
  var publicFormId = url.searchParams.get('formId') || url.searchParams.get('formid') || '';
  var dirty = false;
  if (publicFormId && !shellFormId) {
    url.searchParams.set('mfFormId', publicFormId);
    dirty = true;
  }
  if (url.searchParams.has('formId')) { url.searchParams.delete('formId'); dirty = true; }
  if (url.searchParams.has('formid')) { url.searchParams.delete('formid'); dirty = true; }
  if (url.searchParams.has('configure')) { url.searchParams.delete('configure'); dirty = true; }
  if (!dirty) return;
  window.location.replace(url.pathname + (url.search || '') + (url.hash || ''));
})();
</script>
<% } %>

<% if (showAdminShell) { %>
<%--
  BUG FIX 1 — Hard-refresh at #mf-dashboard: megaform-dashboard.js (priority 118)
  loads BEFORE megaform-dnn-host.js (priority 124). Dashboard IIFE captures
  window.__MF_PLATFORM__ = undefined → no moduleId/tabId/apiBase → broken API.
  Fix: emit __MF_PLATFORM__ as inline <script> in <body>. Inline scripts execute
  at parse time, before ClientResourceManager <script src> tags at bottom of <body>.

  BUG FIX 2 — Wrong URL /Home/formId/24?formId=24#mf-builder:
  window.location.pathname can be /Home/formId/24 (DNN routing artifact). Using it
  as the hash-route base bakes the /formId/24 segment into builderUrl. Then
  getPlatformRoute adds ?formId=24 → broken URL.
  Fix: use server-rendered ReturnUrl (Request.Url.AbsolutePath, always the clean
  DNN tab path e.g. /Home) as the base for all DNN hash routes.
--%>
<script type="text/javascript">
(function () {
  'use strict';
  // Server-rendered clean DNN tab base path — always /Home (or whatever the tab URL is),
  // never contains DNN routing segments like /formId/24, /ctl/Edit, etc.
  var base = '<%= System.Web.HttpUtility.JavaScriptStringEncode(
    (ReturnUrl ?? Request.Url.AbsolutePath ?? "/").Split('?')[0].Split('#')[0]) %>';
  if (!base) base = '/';
  function hashRoute(mode) { return base + '#mf-' + mode; }

  var p = window.__MF_PLATFORM__ = window.__MF_PLATFORM__ || {};
  if (!p.platform)          p.platform          = 'dnn';
  if (!p.apiBase)           p.apiBase           = '<%= ViewModel.ApiBaseUrl ?? "/DesktopModules/MegaForm/API/" %>';
  if (!p.assetsBaseUrl)     p.assetsBaseUrl     = '/DesktopModules/MegaForm/Assets/';
  if (!p.moduleId)          p.moduleId          = <%= ModuleId %>;
  if (!p.instanceId)        p.instanceId        = <%= ModuleId %>;
  if (!p.tabId)             p.tabId             = <%= TabId %>;
  if (!p.portalId)          p.portalId          = <%= PortalId %>;
  if (!p.formId)            p.formId            = <%= ViewModel.FormId %>;
  if (!p.returnUrl)         p.returnUrl         = base;
  var captchaCfg = {
    badgeVersion: '<%= System.Web.HttpUtility.JavaScriptStringEncode(ViewModel.CaptchaBadgeVersion ?? "") %>',
    reCaptchaSiteKey: '<%= System.Web.HttpUtility.JavaScriptStringEncode(ViewModel.ReCaptchaSiteKey ?? "") %>',
    hCaptchaSiteKey: '<%= System.Web.HttpUtility.JavaScriptStringEncode(ViewModel.HCaptchaSiteKey ?? "") %>'
  };
  window.__MegaFormCaptchaConfig = captchaCfg;
  p.captchaConfig = p.captchaConfig || captchaCfg;
  window._MF_CONFIG = window._MF_CONFIG || {};
  window._MF_CONFIG.captchaConfig = window._MF_CONFIG.captchaConfig || captchaCfg;
  // Hash routes always use the clean server-rendered base path, regardless of
  // whatever window.location.pathname contains at script-execute time.
  p.dashboardUrl      = base;
  p.builderUrl        = base + '#mf-builder';
  p.languagesUrl      = hashRoute('languages');
  p.submissionsUrl    = hashRoute('submissions');
  p.settingsUrl       = hashRoute('views');
  p.themeDesignerUrl  = hashRoute('theme');
  p.logoutUrl         = base;
})();
</script>
<style>
.mf-host-admin-dock{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin:0 0 10px;flex-wrap:wrap;font-family:'Inter',system-ui,sans-serif;}
.mf-host-admin-pill,.mf-host-admin-btn{border:1px solid #dbe4f0;background:#fff;color:#0f172a;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;line-height:1;text-decoration:none;display:inline-flex;align-items:center;gap:8px;box-shadow:0 8px 20px rgba(15,23,42,.06);cursor:pointer;}
.mf-host-admin-pill{background:linear-gradient(180deg,#eff6ff 0%,#ffffff 100%);color:#2563eb;border-color:#bfdbfe;}
.mf-host-admin-dock [data-mf-renderer-host-status],
.mf-host-admin-dock [data-mf-open="views"]{display:none !important;}
.mf-host-admin-btn:hover{text-decoration:none;background:#f8fafc;color:#0f172a;}
.mf-host-admin-btn.is-primary{background:#0f172a;color:#fff;border-color:#0f172a;}
.mf-host-overlay{display:none;position:fixed;inset:0;z-index:100000;background:#f8fafc;}
.mf-host-overlay.is-open{display:block;overflow-y:auto;}/* BUG FIX v20260405-18: overlay needs overflow-y:auto so dashboard/submissions content can scroll */
/* [DnnSurfaceMode v20260714-02] WINDOWED = the surface renders as a normal DNN MODULE:
   static position, in the page flow inside the module pane, with the DNN skin (header,
   menu, footer) above and below it. NOT a floating popup — no fixed positioning, no
   inset, no page-covering z-index. Fullscreen (no .is-windowed) keeps the old overlay. */
.mf-host-overlay.is-windowed{position:static;inset:auto;z-index:auto;display:block;overflow:visible;
  background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 6px 20px rgba(15,23,42,.06);
  margin:12px 0;}
.mf-host-overlay.is-windowed .mf-host-head{border-radius:16px 16px 0 0;position:sticky;top:0;z-index:2;}
/* Surfaces whose roots are absolutely positioned inside the fullscreen overlay must fall
   back to normal flow when the surface is a module; give them a workable viewport height. */
.mf-host-overlay.is-windowed .mf-host-body{min-height:0;height:auto;}
.mf-host-overlay.is-windowed #mf-builder-root,
.mf-host-overlay.is-windowed #mf-submissions-root,
.mf-host-overlay.is-windowed #mf-myinbox-root,
.mf-host-overlay.is-windowed #mf-host-dashboard-root{position:relative !important;inset:auto !important;
  z-index:auto !important;width:100% !important;min-height:72vh;overflow:hidden;border-radius:0 0 16px 16px;}
#mf-host-theme-overlay.is-windowed .mf-host-body,
#mf-host-theme-overlay.is-windowed .td-root{height:auto;min-height:72vh;}
/* Inner apps that assume a full-viewport host must be re-anchored to the module box, or
   their viewport-fixed chrome floats over the DNN skin. Same neutralisation Oqtane does
   for .mf-oq-surface.is-inline (megaform-builder-shell.css) — here scoped to the DNN
   windowed surface, so nothing on the Oqtane side changes.
     .w-topbar  — builder toolbar, position:fixed top:0  → absolute inside the builder box
     .tpl-bar   — template-gallery action bar, fixed bottom:0 → sticky inside the box */
.mf-host-overlay.is-windowed #mf-builder-root .w-topbar{position:absolute;left:0;right:0;width:auto;}
.mf-host-overlay.is-windowed #mf-builder-root .tpl-bar{position:absolute;bottom:0;left:0;right:0;width:auto;}
/* Height-bounded panes so the 3-column inbox / languages shells lay out in a module box. */
.mf-host-overlay.is-windowed .mf-mi3-shell{height:auto;}
.mf-host-overlay.is-windowed .mf-mi3-panes{height:78vh !important;min-height:520px;}
.mf-host-overlay.is-windowed .mf-loc-shell{min-height:0 !important;}
.mf-host-overlay.is-windowed .mf-hd{flex-wrap:wrap;height:auto;row-gap:6px;}
/* The DNN page keeps its own scrollbar in windowed mode — never lock the body. */
body.mf-dnn-windowed{overflow:visible !important;}
/* Windowed⇄Fullscreen toggle — body-level so it survives surface re-renders and is
   never clipped by the overlay's own stacking context. Mirrors the Oqtane control. */
.mf-dnn-fs-toggle{position:fixed;right:18px;bottom:18px;z-index:100020;display:none;align-items:center;gap:8px;border:1px solid #dbe4f0;background:#fff;color:#0f172a;border-radius:999px;padding:9px 14px;font:600 13px/1 'Inter',system-ui,sans-serif;box-shadow:0 10px 26px rgba(15,23,42,.18);cursor:pointer;}
.mf-dnn-fs-toggle:hover{background:#f8fafc;}
/* MegaForm popovers are appended to <body> (so no ancestor can clip them). They must
   paint ABOVE the overlay — at z-index 10010 the language picker opened *behind* the
   opaque Languages overlay, which read as "the dropdown does not work". */
body > .mf-langpick-panel{z-index:100030;}
.mf-host-head{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid rgba(148,163,184,.24);background:#fff;}
.mf-host-title{font:600 16px/1.2 'Inter',system-ui,sans-serif;color:#0f172a;display:flex;align-items:center;gap:10px;}
.mf-host-close{border:1px solid #dbe4f0;background:#fff;color:#0f172a;border-radius:999px;padding:10px 14px;font:600 13px/1 'Inter',system-ui,sans-serif;cursor:pointer;}
.mf-host-body{min-height:calc(100vh - 72px);}
.mf-host-views{max-width:760px;margin:24px auto;padding:0 24px 24px;font-family:'Inter',system-ui,sans-serif;}
.mf-host-views-card{background:#fff;border:1px solid #e2e8f0;border-radius:20px;box-shadow:0 20px 50px rgba(15,23,42,.08);padding:24px;}
.mf-host-views-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:14px;}
.mf-host-view-item{display:flex;flex-direction:column;gap:6px;border:1px solid #dbe4f0;border-radius:16px;padding:16px;background:#fff;cursor:pointer;transition:all .18s ease;}
.mf-host-view-item:hover{border-color:#94a3b8;box-shadow:0 12px 28px rgba(15,23,42,.08);transform:translateY(-1px);}
.mf-host-view-item.active{border-color:#2563eb;background:#eff6ff;box-shadow:0 12px 28px rgba(37,99,235,.12);}
.mf-host-view-title{font:600 14px/1.35 'Inter',system-ui,sans-serif;color:#0f172a;}
.mf-host-view-meta{font:500 12px/1.3 'Inter',system-ui,sans-serif;color:#64748b;}
.mf-host-views-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;}
.mf-host-boot{display:flex;align-items:center;justify-content:center;height:100%;font-family:system-ui,sans-serif;color:#64748b;}
#mf-host-builder-overlay #mf-builder-root,
#mf-host-submissions-overlay #mf-submissions-root{position:absolute;inset:0;}
#mf-host-theme-overlay .mf-host-body{min-height:100vh;height:100vh;padding:0;}
#mf-host-theme-overlay .td-root{height:100vh;}
#mf-host-theme-overlay .td-body{min-height:calc(100vh - 74px);}
.mf-renderer-host-notice{margin:18px auto 0;max-width:980px;padding:16px 18px;border:1px solid #dbeafe;border-radius:16px;background:linear-gradient(180deg,#f8fbff 0%,#ffffff 100%);box-shadow:0 10px 30px rgba(15,23,42,.05);font:500 14px/1.65 'Inter',system-ui,sans-serif;color:#334155;}
.mf-renderer-host-notice strong{display:block;margin:0 0 6px;color:#0f172a;font:700 15px/1.35 'Inter',system-ui,sans-serif;}
.mf-renderer-host-notice code{background:#eff6ff;border:1px solid #dbeafe;border-radius:8px;padding:1px 6px;color:#1d4ed8;font:600 12px/1.2 'DM Mono',Consolas,monospace;}
</style>
<div id="mf-dnn-host"
     data-platform="dnn"
     data-module-id="<%= ModuleId %>"
     data-instance-id="<%= ModuleId %>"
     data-tab-id="<%= TabId %>"
     data-portal-id="<%= PortalId %>"
     data-api-base="<%= ViewModel.ApiBaseUrl %>"
     data-assets-base="/DesktopModules/MegaForm/Assets/"
     data-return-url="<%= ReturnUrl %>"
     data-form-id="<%= ViewModel.FormId %>"
     data-forms-json='<%= Server.HtmlEncode(ViewModel.FormsJson ?? "[]") %>'
     data-module-config-json='<%= Server.HtmlEncode(ViewModel.ModuleConfigJson ?? "{}") %>'
     data-dashboard-json='<%= Server.HtmlEncode(DashboardJson ?? "{}") %>'
     data-live-render='<%= ViewModel.LiveRenderMode.ToString().ToLower() %>'
     data-embed-mode='<%= ViewModel.EmbedMode.ToString().ToLower() %>'
     data-admin-dashboard-mode='<%= ViewModel.IsAdminDashboardMode.ToString().ToLower() %>'
     data-module-mode='<%= ViewModel.ModuleMode ?? "render" %>'>
    <%-- [DockParity v20260714-01] Same dock as Oqtane: Settings · Form Builder · Form Dashboard.
         "Settings" opens MegaForm's own settings popup (window.MFSettings, megaform-settings-popup.js
         — the SAME bundle Oqtane's dock uses; it is platform-aware and posts to ModuleConfig/Save)
         instead of DNN's WebForms ManageModule page. The old Home link + "Render" state pill are
         gone: Oqtane has neither, every surface already carries its own Home/Close, and they were
         what collided with DNN's own in-context module toolbar. The Trial pill still appears, but
         only on a trial licence (applyTrialDockPill). --%>
    <div class="mf-host-admin-dock">
        <span class="mf-host-admin-pill" data-mf-trial-pill="1" style="display:none;"><i class="fas fa-flask"></i> Trial Mode</span>
        <button type="button" class="mf-host-admin-btn" data-mf-open="views"><i class="fas fa-clone"></i> Module View</button>
        <button type="button" class="mf-host-admin-btn" id="mf-host-settings-open" title="Module settings — form, display, database"><i class="fas fa-cog"></i> Settings</button>
        <button type="button" class="mf-host-admin-btn" data-mf-open="builder"><i class="fas fa-pen-ruler"></i> Form Builder</button>
        <button type="button" class="mf-host-admin-btn" id="mf-host-theme-preset-save" style="display:none;"><i class="fas fa-palette"></i> Update Theme</button>
        <button type="button" class="mf-host-admin-btn is-primary" data-mf-open="dashboard"><i class="fas fa-table-columns"></i> Form Dashboard</button>
    </div>
</div>
<script type="text/javascript" id="mf-dnn-settings-dock-boot">
(function () {
    var btn = document.getElementById('mf-host-settings-open');
    if (!btn) return;
    var opts = {
        moduleId: <%= ModuleId %>,
        currentPageId: <%= TabId %>,
        currentPageUrl: '<%= System.Web.HttpUtility.JavaScriptStringEncode(ReturnUrl ?? "/") %>'
    };
    // Lazy-load exactly like Oqtane's BuildSettingsInlineOpenScript: the popup bundle is only
    // fetched when an admin actually opens Settings.
    function open() {
        if (window.MFSettings && typeof window.MFSettings.open === 'function') { window.MFSettings.open(opts); return; }
        var s = document.createElement('script');
        s.src = '/DesktopModules/MegaForm/Assets/js/megaform-settings-popup.js?popupboot=' + Date.now();
        s.onload = open;
        s.onerror = function () { console.error('[MegaForm.DNN] failed to load megaform-settings-popup.js'); };
        document.body.appendChild(s);
    }
    btn.addEventListener('click', open);
})();
</script>
<div id="mf-host-dashboard-overlay" class="mf-host-overlay" aria-hidden="true">
    <div class="mf-host-head"><div class="mf-host-title"><i class="fas fa-table-columns"></i> MegaForm Dashboard</div><div style="display:flex;gap:8px;align-items:center;"><a class="mf-host-close" href="<%= Server.HtmlEncode(homeUrl) %>" title="Back to home page"><i class="fas fa-house"></i> Home</a><button type="button" class="mf-host-close" data-mf-close><i class="fas fa-times"></i> Close</button></div></div>
    <div id="mf-host-dashboard-root" class="mf-host-body"
         data-platform="dnn"
         <%-- [DnnPreviewBase v20260714-01] platform-host detectRoot() picks THIS element first, so
              the clean tab path must be on it too — otherwise getPublicFormUrl() falls back to
              window.location.pathname, which on DNN can carry /ctl/ManageModule/mid/N segments and
              sends the "View live form" link to module settings instead of the form. --%>
         data-return-url="<%= ReturnUrl %>"
         data-instance-id="<%= ModuleId %>"
         data-module-id="<%= ModuleId %>"
         data-tab-id="<%= TabId %>"
         data-portal-id="<%= PortalId %>"
         data-api-base="<%= ViewModel.ApiBaseUrl %>"
         data-assets-base="/DesktopModules/MegaForm/Assets/"
         data-dashboard='<%= Server.HtmlEncode(DashboardJson ?? "{}") %>'>
        <div class="mf-host-boot">Loading dashboard…</div>
    </div>
</div>
<div id="mf-host-views-overlay" class="mf-host-overlay" aria-hidden="true">
    <div class="mf-host-head"><div class="mf-host-title"><i class="fas fa-clone"></i> Module View</div><button type="button" class="mf-host-close" data-mf-close><i class="fas fa-times"></i> Close</button></div>
    <div class="mf-host-body"><div class="mf-host-views"><div class="mf-host-views-card"><div style="font:600 18px/1.2 'Inter',system-ui,sans-serif;color:#0f172a;">Form shown by this module on this page</div><div style="margin-top:6px;color:#64748b;font:500 13px/1.5 'Inter',system-ui,sans-serif;">Choose which form this module instance renders on this page.</div><div id="mf-host-views-grid" class="mf-host-views-grid"></div><div class="mf-host-views-actions"><button type="button" class="mf-host-admin-btn" data-mf-close>Cancel</button><button type="button" class="mf-host-admin-btn is-primary" id="mf-host-views-save">Use selected form on this page</button></div></div></div></div>
</div>
<div id="mf-host-builder-overlay" class="mf-host-overlay" aria-hidden="true">
    <div class="mf-host-head"><div class="mf-host-title"><i class="fas fa-pen-ruler"></i> Form Builder</div><button type="button" class="mf-host-close" data-mf-close><i class="fas fa-times"></i> Close</button></div>
    <div class="mf-host-body">
        <%-- BUG FIX: data-assets-base is REQUIRED so workflow/print script loading
             uses /DesktopModules/MegaForm/Assets/js/builder/ instead of falling
             back to /megaform/js/builder/ (Web/ASP.Core path) which causes:
             "Failed to load Workflow Canvas: Failed: /megaform/js/builder/react.production.min.js" --%>
        <div id="mf-builder-root"
             data-platform="dnn"
             data-form-id="<%= ViewModel.FormId %>"
             data-api-base="<%= ViewModel.ApiBaseUrl %>"
             data-assets-base="/DesktopModules/MegaForm/Assets/"
             data-is-new="<%= (ViewModel.FormId == 0 || string.IsNullOrWhiteSpace(ViewModel.SchemaJson) || ViewModel.SchemaJson == "{}").ToString().ToLower() %>"
             data-dev-lock="<%= HasDevLock.ToString().ToLower() %>"
             data-demo-lock="<%= HasDemoLock.ToString().ToLower() %>"
             data-return-url="<%= ReturnUrl %>"
             data-module-id="<%= ModuleId %>"
             data-portal-id="<%= PortalId %>"
             data-tab-id="<%= TabId %>"
             data-lazy-boot="true"
             data-schema-json='<%= Server.HtmlEncode(ViewModel.SchemaJson ?? "{}") %>'
             data-theme-json='<%= Server.HtmlEncode(!string.IsNullOrWhiteSpace(ViewModel.ThemeJson) ? ViewModel.ThemeJson : "{}") %>'
             data-form-status="<%= ViewModel.FormStatus ?? "draft" %>">
            <div class="mf-host-boot"><i class="fas fa-spinner fa-spin" style="margin-right:8px;color:#6366f1"></i> Loading MegaForm Builder…</div>
        </div>
    </div>
</div>
<div id="mf-host-submissions-overlay" class="mf-host-overlay" aria-hidden="true">
    <div class="mf-host-head"><div class="mf-host-title"><i class="fas fa-inbox"></i> Submissions</div><button type="button" class="mf-host-close" data-mf-close><i class="fas fa-times"></i> Close</button></div>
    <div class="mf-host-body"><div id="mf-submissions-root" data-platform="dnn" data-instance-id="<%= ModuleId %>" data-module-id="<%= ModuleId %>" data-form-id="<%= RequestedFormId > 0 ? RequestedFormId : 0 %>" data-api-base="<%= ViewModel.ApiBaseUrl %>" data-assets-base="/DesktopModules/MegaForm/Assets/" data-forms='<%= Server.HtmlEncode(ViewModel.FormsJson ?? "[]") %>'><div class="mf-host-boot">Loading submissions…</div></div></div>
</div>
<%-- [DnnMyInbox v20260714-01] My Inbox surface. The dashboard sidebar routes to
     #mf-myinbox; without this overlay dnn-host had nothing to open, so the click
     closed the dashboard and dropped the admin back on the DNN page.
     megaform-my-inbox.js self-mounts into #mf-myinbox-root (window.MegaForm.initMyInbox). --%>
<div id="mf-host-myinbox-overlay" class="mf-host-overlay" aria-hidden="true">
    <div class="mf-host-head"><div class="mf-host-title"><i class="fas fa-inbox"></i> My Inbox</div><div style="display:flex;gap:8px;align-items:center;"><a class="mf-host-close" href="<%= Server.HtmlEncode(homeUrl) %>" title="Back to home page"><i class="fas fa-house"></i> Home</a><button type="button" class="mf-host-close" data-mf-close><i class="fas fa-times"></i> Close</button></div></div>
    <div class="mf-host-body"><div id="mf-myinbox-root"
         data-platform="dnn"
         data-instance-id="<%= ModuleId %>"
         data-module-id="<%= ModuleId %>"
         data-tab-id="<%= TabId %>"
         data-portal-id="<%= PortalId %>"
         data-api-base="<%= ViewModel.ApiBaseUrl %>"
         data-submissions-api-base="<%= ViewModel.ApiBaseUrl %>"
         data-assets-base="/DesktopModules/MegaForm/Assets/"><div class="mf-host-boot">Loading inbox…</div></div></div>
</div>
<div id="mf-host-languages-overlay" class="mf-host-overlay" aria-hidden="true">
    <div class="mf-host-head"><div class="mf-host-title"><i class="fas fa-language"></i> Languages</div><button type="button" class="mf-host-close" data-mf-close><i class="fas fa-times"></i> Close</button></div>
    <div class="mf-host-body"><div id="mf-languages-root" data-platform="dnn" data-api-base="<%= ViewModel.ApiBaseUrl %>" data-admin-locale="en-US"><div class="mf-host-boot">Loading languages…</div></div></div>
</div>
<div id="mf-host-theme-overlay" class="mf-host-overlay" aria-hidden="true">
    <div class="mf-host-body"><%= ThemeDesignerHostHtml %></div>
</div>

<script type="text/javascript" id="mf-theme-preset-save-inline">
(function () {
  var saveBtn = document.getElementById('mf-host-theme-preset-save');
  if (!saveBtn) return;
  var state = null;
  var busy = false;
  function dnnHeaders(moduleId) {
    var headers = { 'Content-Type': 'application/json' };
    try {
      var sf = window.jQuery && window.jQuery.ServicesFramework ? window.jQuery.ServicesFramework(moduleId) : null;
      if (sf) {
        headers.RequestVerificationToken = sf.getAntiForgeryValue();
        headers.TabId = sf.getTabId();
        headers.ModuleId = sf.getModuleId();
      }
    } catch (e) { }
    return headers;
  }
  function sync(detail) {
    state = detail || null;
    var canShow = !!(detail && detail.hasSelector && detail.selectorEnabled && detail.showUpdateThemeButton !== false);
    saveBtn.style.display = canShow ? 'inline-flex' : 'none';
    if (!canShow) return;
    var dirty = !!detail.dirty;
    saveBtn.classList.toggle('is-primary', dirty);
    saveBtn.disabled = busy || !detail.selectedThemeKey;
    saveBtn.innerHTML = '<i class="fas fa-palette"></i> ' + (dirty ? 'Update Theme *' : 'Update Theme');
  }
  window.addEventListener('mf:theme-preset-state', function (e) {
    sync((e && e.detail) || null);
  });
  saveBtn.addEventListener('click', function () {
    if (!state || !state.selectedThemeKey || busy) return;
    busy = true;
    sync(state);
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    var body = {
      moduleId: <%= ModuleId %>,
      formId: <%= ViewModel.FormId %>,
      selectedPresetThemeKey: state.selectedThemeKey
    };
    fetch('<%= ViewModel.ApiBaseUrl %>ModuleConfig/SaveStyle', {
      method: 'POST',
      headers: dnnHeaders(<%= ModuleId %>),
      body: JSON.stringify(body),
      credentials: 'same-origin'
    }).then(function (resp) {
      if (!resp.ok) throw new Error('SaveStyle failed: ' + resp.status);
      return resp.json();
    }).then(function (data) {
      var nextKey = (data && (data.selectedPresetThemeKey || data.SelectedPresetThemeKey)) || state.selectedThemeKey || '';
      window.__MF_PLATFORM__ = window.__MF_PLATFORM__ || {};
      window.__MF_PLATFORM__.presetThemeKey = nextKey;
      state = Object.assign({}, state || {}, { savedThemeKey: nextKey, activeThemeKey: nextKey, selectedThemeKey: nextKey, dirty: false });
      sync(state);
    }).catch(function (err) {
      console.error('MegaForm: preset theme save failed', err);
      sync(state);
    }).finally(function () {
      busy = false;
      sync(state);
    });
  });
})();
</script>

<% } %>

<% if (ViewModel != null && ViewModel.ShowConfigPanel) { %>
<%-- ═══════════════════════════════════════════════════════════════
     FULLSCREEN BUILDER — configure=1 opens the new Vite builder
     Covers all DNN chrome; exit button navigates to ReturnUrl
     ═══════════════════════════════════════════════════════════════ --%>
<style>
    #mf-builder-root {
        position: fixed !important;
        top: 0 !important; left: 0 !important;
        right: 0 !important; bottom: 0 !important;
        z-index: 99999 !important;
        background: #f8fafc;
        overflow: hidden;
    }
    body.mf-dnn-builder-open,
    body.mf-dnn-builder-open #Body,
    body.mf-dnn-builder-open .DnnModule,
    body.mf-dnn-builder-open .dnnSkinObject {
        overflow: hidden !important;
    }
</style>

<div id="mf-builder-root"
     data-platform="dnn"
     data-form-id="<%= ViewModel.FormId %>"
     data-api-base="<%= ViewModel.ApiBaseUrl %>"
     data-assets-base="/DesktopModules/MegaForm/Assets/"
     data-is-new="<%= (ViewModel.FormId == 0 || Request.QueryString["new"] == "1" || string.IsNullOrWhiteSpace(ViewModel.SchemaJson) || ViewModel.SchemaJson == "{}").ToString().ToLower() %>"
     data-dev-lock="<%= HasDevLock.ToString().ToLower() %>"
     data-demo-lock="<%= HasDemoLock.ToString().ToLower() %>"
     data-return-url="<%= ReturnUrl %>"
     data-module-id="<%= ModuleId %>"
     data-portal-id="<%= PortalId %>"
     data-tab-id="<%= TabId %>"
     data-schema-json='<%= Server.HtmlEncode(ViewModel.SchemaJson ?? "{}") %>'
     data-theme-json='<%= Server.HtmlEncode(!string.IsNullOrWhiteSpace(ViewModel.ThemeJson) ? ViewModel.ThemeJson : "{}") %>'
     data-form-status="<%= ViewModel.FormStatus ?? "draft" %>">
    <div class="mf-boot" style="display:flex;align-items:center;justify-content:center;height:100%;font-family:system-ui,sans-serif;color:#64748b;">
        <i class="fas fa-spinner fa-spin" style="margin-right:8px;font-size:20px;color:#6366f1;"></i>
        Loading MegaForm Builder&hellip;
    </div>
</div>
<script>
(function() {
    var root = document.getElementById('mf-builder-root');
    if (!root) return;

    // ── 1. Move root to direct child of <body> ──────────────────
    // This is the only reliable way — no matter what DNN wraps it in,
    // once it's a direct body child with position:fixed it covers everything.
    document.body.appendChild(root);

    // ── 2. Add body state class ─────────────────────────────────
    document.body.classList.add('mf-dnn-builder-open');

    // ── 3. Hide DNN chrome with CSS rule — NOT inline style ─────
    // BUG FIX v20260405-15: The old approach set display:none!important on every
    // existing body > * via inline style. This was correct for elements present at
    // DOMContentLoaded, but had two problems:
    //   a) dead-code: getComputedStyle(all[i]) result was read but never used
    //   b) race-condition: elements appended AFTER hideChrome() ran (e.g. the
    //      #mf-wfrf-overlay workflow canvas) inherited NO inline style → fine,
    //      BUT if a future DNN chrome re-injection runs after init, new elements
    //      could bleed through.
    // Fix: inject a <style> rule that targets body > *:not(whitelisted) using
    // the CSS cascade — new elements are covered automatically if they lack the
    // [data-mf-overlay] whitelist attribute. Elements that DO carry [data-mf-overlay]
    // (e.g. #mf-wfrf-overlay) are intentionally visible above the builder.
    (function() {
        var style = document.createElement('style');
        style.id = 'mf-chrome-hide';
        style.textContent =
            'body.mf-dnn-builder-open > *:not(#mf-builder-root):not([data-mf-overlay])' +
            '{ display:none!important; }';
        document.head.appendChild(style);
        document.body.style.cssText += ';margin:0!important;padding:0!important;overflow:hidden!important;';
    })();

    if (false) {
        // Kept for reference — old DOMContentLoaded guard no longer needed
        // because the CSS rule above applies immediately and covers future nodes.
    }
})();
</script>


<% if (showAdminShell && !ViewModel.ShowConfigPanel) { %>
<style>
html.mf-admin-shell-route .mf-no-form,
html.mf-admin-shell-route .mf-auth-required,
html.mf-admin-shell-route .mf-view-container,
html.mf-admin-shell-route .mf-form-wrapper,
body.mf-admin-shell-route .mf-no-form,
body.mf-admin-shell-route .mf-auth-required,
body.mf-admin-shell-route .mf-view-container,
body.mf-admin-shell-route .mf-form-wrapper {
    display: none !important;
}
</style>
<script>
(function () {
    var hash = String(window.location.hash || '').toLowerCase();
    // [B48 2026-06-02] #mf-theme route retired — treat it as the Builder
    // admin-shell route so the html.mf-admin-shell-route gate still hides the
    // public form chrome during the redirect handshake performed earlier.
    var adminHash = hash.indexOf('#mf-builder') === 0 ||
                    hash.indexOf('#mf-submissions') === 0 ||
                    hash.indexOf('#mf-myinbox') === 0 ||
                    hash.indexOf('#mf-theme') === 0 ||
                    hash.indexOf('#mf-dashboard') === 0 ||
                    hash.indexOf('#mf-views') === 0 ||
                    hash.indexOf('#mf-languages') === 0;
    if (!adminHash) return;
    document.documentElement.classList.add('mf-admin-shell-route');
    if (document.body) document.body.classList.add('mf-admin-shell-route');
    else document.addEventListener('DOMContentLoaded', function () {
        document.body.classList.add('mf-admin-shell-route');
    }, { once: true });
})();
</script>
<% } %>

<% } else if (ViewModel != null && ViewModel.IsMyInboxMode && !ViewModel.IsAdmin && RequestedFormId == 0) { %>
    <%-- [DnnInboxMode v20260714-01] My Inbox module, non-admin member. Admins get the inbox as
         an overlay surface (the dock shell above auto-opens #mf-myinbox); an approver who is not
         an admin has no shell, so the inbox mounts INLINE here — the module IS the inbox.
         megaform-my-inbox.js self-mounts on #mf-myinbox-root. --%>
    <% if (ViewModel.IsAuthenticated) { %>
    <div id="mf-myinbox-root"
         data-platform="dnn"
         data-instance-id="<%= ModuleId %>"
         data-module-id="<%= ModuleId %>"
         data-tab-id="<%= TabId %>"
         data-portal-id="<%= PortalId %>"
         data-api-base="<%= ViewModel.ApiBaseUrl %>"
         data-submissions-api-base="<%= ViewModel.ApiBaseUrl %>"
         data-assets-base="/DesktopModules/MegaForm/Assets/"
         data-shell-mode="page"
         style="min-height:72vh;">
        <div class="mf-host-boot">Loading inbox…</div>
    </div>
    <% } else { %>
    <div class="mf-auth-required alert alert-warning">
        <i class="fa fa-lock"></i> You must be logged in to see your inbox.
    </div>
    <% } %>
<% } else if (ViewModel != null && (ViewModel.IsAdminDashboardMode || ViewModel.IsMyInboxMode) && ViewModel.FormId == 0) { %>
    <%-- Admin Dashboard / My Inbox mode: this page is a surface shell. Render no empty form body
         underneath the overlay. [FormPreview v20260714-01] The `FormId == 0` guard is what makes
         the admin's "View live form" link work: with ?formid=N the form RESOLVES, so we fall
         through to the render branch below and the admin actually sees the form instead of a
         surface overlay on a blank page. --%>
<% } else if (SuppressInlineAdminEmptyState && (ViewModel == null || ViewModel.FormId == 0)) { %>
    <%-- Transient add/drop state:
         render nothing at all so DNN can drag/drop cleanly.
         No MegaForm placeholder, no overlay, no dock buttons. --%>
<% } else if (!SuppressInlineAdminEmptyState && (ViewModel == null || ViewModel.FormId == 0)) { %>
    <%-- [PublicEmptyStateHide v20260421-01]
         Split the empty-state block so admin-only config hints do not leak to
         anonymous users. Public sees nothing (clean page) when a module on the
         page is unconfigured, UNLESS they followed a bad ?formid=N link — in
         which case a public-safe "requested form is not available" is shown.
    --%>
    <% if (RequestedFormId > 0) { %>
    <%-- Public-safe: user followed a specific form link that no longer resolves here. --%>
    <div class="mf-no-form">
        <p class="text-muted"><em>The requested form is not available on this page.</em></p>
    </div>
    <% } else if (ViewModel != null && ViewModel.IsAdmin) { %>
    <%-- Admin-only: internal configuration hints. Hidden from public visitors. --%>
    <div class="mf-no-form">
        <p class="text-muted"><em>No form has been configured for this module.</em></p>
    </div>
    <% } %>
    <%-- Anonymous user + no specific form requested: render nothing (clean page). --%>
<% } else if (ViewModel.RequireAuth && !ViewModel.IsAuthenticated) { %>
    <div class="mf-auth-required alert alert-warning">
        <i class="fa fa-lock"></i> You must be logged in to access this form.
    </div>
<% } else if (string.Equals(ViewModel.ActiveViewType, "listview", System.StringComparison.OrdinalIgnoreCase)) { %>
<%-- [ListViewRouting v20260507-23] LISTVIEW MODE — dedicated MFListView module
     (own bundle, own CSS, own designer). The mount HTML is built from saved
     ListViewSettings; the runtime auto-binds on data-mf-listview="1". --%>
<%
    var mfListViewSettings = MegaForm.Core.ViewModes.ListViewSettings.FromJson(ViewModel.ActiveViewConfigJson);
    mfListViewSettings.FormId = ViewModel.FormId;
%>
<%= mfListViewSettings.BuildMountHtml(ViewModel.ApiBaseUrl, GetTemplateContextJson(), ViewModel.ActiveQueryKey) %>

<% } else if (string.Equals(ViewModel.ActiveViewType, "list", System.StringComparison.OrdinalIgnoreCase)) { %>
<div id="mf-view-container-<%= ViewModel.FormId %>"
     data-mf-view="list"
     data-mf-form-id="<%= ViewModel.FormId %>"
     data-mf-api-base="<%= System.Web.HttpUtility.HtmlAttributeEncode(ViewModel.ApiBaseUrl) %>"
     data-mf-fields="<%= System.Web.HttpUtility.HtmlAttributeEncode(GetActiveSubmissionViewFields("list")) %>"
     data-mf-template="<%= System.Web.HttpUtility.HtmlAttributeEncode(GetActiveSubmissionViewTemplate("list")) %>"
     data-mf-query-key="<%= System.Web.HttpUtility.HtmlAttributeEncode(ViewModel.ActiveQueryKey ?? "") %>"
     data-mf-context-json="<%= System.Web.HttpUtility.HtmlAttributeEncode(GetTemplateContextJson()) %>"
     data-mf-module-id="<%= ModuleId %>"></div>

<% } else if (string.Equals(ViewModel.ActiveViewType, "card", System.StringComparison.OrdinalIgnoreCase)) { %>
<div id="mf-view-container-<%= ViewModel.FormId %>"
     data-mf-view="card"
     data-mf-form-id="<%= ViewModel.FormId %>"
     data-mf-api-base="<%= System.Web.HttpUtility.HtmlAttributeEncode(ViewModel.ApiBaseUrl) %>"
     data-mf-fields="<%= System.Web.HttpUtility.HtmlAttributeEncode(GetActiveSubmissionViewFields("card")) %>"
     data-mf-template="<%= System.Web.HttpUtility.HtmlAttributeEncode(GetActiveSubmissionViewTemplate("card")) %>"
     data-mf-query-key="<%= System.Web.HttpUtility.HtmlAttributeEncode(ViewModel.ActiveQueryKey ?? "") %>"
     data-mf-context-json="<%= System.Web.HttpUtility.HtmlAttributeEncode(GetTemplateContextJson()) %>"
     data-mf-module-id="<%= ModuleId %>"></div>

<% } else if (!string.IsNullOrEmpty(ViewModel.ActiveViewType) && ViewModel.ActiveViewType != "edit") { %>
<%-- MULTI-VIEW MODE: legacy detail / continuous branches still rendered by MegaFormViews --%>
<div id="mf-view-container-<%= ViewModel.FormId %>" class="mf-view-container"></div>

<%= RenderPluginTags() %>
<script type="text/javascript">
(function() {
    var formId = <%= ViewModel.FormId %>;
    var schema = JSON.parse('<%= System.Web.HttpUtility.JavaScriptStringEncode(ViewModel.ResolvedSchemaJson) %>');
    var viewConfig = <%= !string.IsNullOrEmpty(ViewModel.ActiveViewConfigJson) ? ViewModel.ActiveViewConfigJson : "{}" %>;
    var viewType = '<%= ViewModel.ActiveViewType ?? "list" %>';
    var recordId = <%= ViewModel.ActiveRecordId > 0 ? ViewModel.ActiveRecordId.ToString() : "null" %>;
    var container = document.getElementById('mf-view-container-' + formId);
    var apiBase = '<%= ViewModel.ApiBaseUrl %>';
    var baseUrl = window.location.pathname;
    var moduleId = '<%= ModuleId %>';
    var tabId = '<%= TabId %>';
    var apiOpts = { apiBaseUrl: apiBase, moduleId: moduleId, tabId: tabId };

    // ── AppScope & Inter-Instance Bus ──
    var appScope = '<%= ViewModel.AppScope ?? "" %>';
    var busChannel = '<%= ViewModel.BusChannel ?? "" %>';
    var detailModuleId = '<%= ViewModel.DetailModuleId ?? "" %>';

    // MegaFormBus — lightweight event bus for inter-instance communication
    if (!window.MegaFormBus) {
        window.MegaFormBus = {
            _h: {},
            emit: function(evt, data) {
                var key = data && data.channel ? data.channel + ':' + evt : evt;
                (this._h[key] || []).forEach(function(fn) { try { fn(data); } catch(e) { console.error('MFBus:', e); } });
                // Also emit global (no channel prefix) for cross-channel listeners
                (this._h[evt] || []).forEach(function(fn) { try { fn(data); } catch(e) {} });
            },
            on: function(evt, fn, channel) {
                var key = channel ? channel + ':' + evt : evt;
                if (!this._h[key]) this._h[key] = [];
                this._h[key].push(fn);
            },
            off: function(evt, fn, channel) {
                var key = channel ? channel + ':' + evt : evt;
                if (this._h[key]) this._h[key] = this._h[key].filter(function(f) { return f !== fn; });
            }
        };
    }
    var Bus = window.MegaFormBus;

    if (typeof MegaFormViews === 'undefined') {
        container.innerHTML = '<p style="color:#ef4444;">MegaFormViews not loaded.</p>';
        return;
    }

    // ── Record Click Handler (emits to bus instead of self-navigate) ──
    function onRecordClick(id) {
        if (busChannel) {
            // Emit event for other instances (Detail module) to pick up
            Bus.emit('record-selected', { channel: busChannel, formId: formId, recordId: id, sourceModuleId: moduleId });
        }
        if (detailModuleId) {
            // Scroll target module into view
            var target = document.querySelector('[data-module-id="' + detailModuleId + '"]') ||
                         document.getElementById('mf-view-container-' + formId);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            // No detail target → self-navigate (legacy behavior)
            window.location.href = baseUrl + '?view=detail&id=' + id;
        }
    }

    // ── Render Views ──
    if (viewType === 'detail') {
        // Detail view: load initial record OR listen for bus events
        function renderDetail(rid) {
            if (!rid) {
                container.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;">' +
                    '<i class="fas fa-hand-pointer" style="font-size:32px;margin-bottom:12px;display:block;"></i>' +
                    'Select a record from the list to view details</div>';
                return;
            }
            container.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
            MegaFormViews.fetchSubmission(rid, apiOpts, function(err, sub) {
                if (err) { container.innerHTML = '<p style="color:#ef4444;">Error: ' + err + '</p>'; return; }
                sub.data = typeof sub.data === 'string' ? JSON.parse(sub.data) : sub.data;
                MegaFormViews.renderDetailView(container, viewConfig, sub, schema, { baseUrl: baseUrl });
            });
        }
        renderDetail(recordId);

        // Listen for bus events from other instances
        if (busChannel) {
            Bus.on('record-selected', function(data) {
                if (data.formId === formId || data.channel === busChannel) {
                    renderDetail(data.recordId);
                }
            }, busChannel);
        }

    } else if (viewType === 'card') {
        MegaFormViews.fetchSubmissions(formId, Object.assign({}, apiOpts, { pageSize: 50 }), function(err, result) {
            if (err) { container.innerHTML = '<p style="color:#ef4444;">Error: ' + err + '</p>'; return; }
            var items = (result.items || []).map(function(s) { return { id: s.id, data: s.data, submittedOn: s.submittedOn }; });
            MegaFormViews.renderCardView(container, viewConfig, items, schema, {
                baseUrl: baseUrl,
                onRecordClick: onRecordClick
            });
        });
    } else {
        // Default: list view
        var page = parseInt(new URLSearchParams(window.location.search).get('p')) || 1;
        MegaFormViews.fetchSubmissions(formId, Object.assign({}, apiOpts, { page: page, pageSize: 20 }), function(err, result) {
            if (err) { container.innerHTML = '<p style="color:#ef4444;">Error: ' + err + '</p>'; return; }
            var items = (result.items || []).map(function(s) { return { id: s.id, data: s.data, submittedOn: s.submittedOn, status: s.status }; });
            MegaFormViews.renderListView(container, viewConfig, items, schema, {
                baseUrl: baseUrl,
                totalCount: result.total,
                pageSize: 20,
                currentPage: page,
                onRecordClick: onRecordClick,
                onSearch: function(q) {
                    window.location.href = baseUrl + '?view=list&search=' + encodeURIComponent(q);
                },
                onPageChange: function(p) {
                    window.location.href = baseUrl + '?view=list&p=' + p;
                }
            });
        });
    }

    // ── Expose instance info for debugging / other scripts ──
    container.setAttribute('data-module-id', moduleId);
    container.setAttribute('data-app-scope', appScope);
    container.setAttribute('data-bus-channel', busChannel);
    container.setAttribute('data-view-type', viewType);
})();
</script>

<% } else { %>
<% var hasCustomHtml = ViewModel != null && ViewModel.Schema != null && ViewModel.Schema.Settings != null && !string.IsNullOrWhiteSpace(ViewModel.Schema.Settings.CustomHtml); %>

<%-- [SingleSource v20260624-B260] ONE composed CSS block (preset+scoped+customCss+compat+override).
     Replaces the former mf-inline-preset block; mf-live-override is folded in too. data-mf-ssr="1"
     tells the public renderer to do NOTHING to CSS (it early-returns) — it only builds the body. --%>
<% if (!string.IsNullOrWhiteSpace(ViewModel.ModuleCss)) { %>
<style id="mf-custom-css-<%= ViewModel.FormId %>"><%= ViewModel.ModuleCss %></style>
<% } %>

<div id="mf-form-wrapper-<%= ViewModel.FormId %>" class="mf-form-wrapper<%= hasCustomHtml ? " mf-custom-shell-mode" : "" %><%= !string.IsNullOrEmpty(ViewModel.ThemeClass) ? " " + Server.HtmlEncode(ViewModel.ThemeClass) : "" %><%= !string.IsNullOrEmpty(ViewModel.WrapperRuntimeClasses) ? " " + ViewModel.WrapperRuntimeClasses : "" %>"
     data-form-id="<%= ViewModel.FormId %>"
     data-module-id="<%= ViewModel.ModuleId %>"
     data-mf-ssr="1"
     data-save-endpoint="/API/MegaForm/Form/SaveStyle">
  <div class="mf-form-inner">

    <% if (!hasCustomHtml) { %>
    <div class="mf-form-header">
        <% if (!string.IsNullOrEmpty(ViewModel.Title)) { %>
            <h2 class="mf-form-title"><%= Server.HtmlEncode(ViewModel.Title) %></h2>
        <% } %>
        <% if (!string.IsNullOrEmpty(ViewModel.Description)) { %>
            <p class="mf-form-description"><%= Server.HtmlEncode(ViewModel.Description) %></p>
        <% } %>
    </div>
    <% } %>

    <div id="mf-progress-<%= ViewModel.FormId %>" class="mf-progress-bar" style="display:none;"></div>

    <%-- DIV instead of FORM to avoid ASP.NET nested form conflict --%>
    <div id="mf-form-<%= ViewModel.FormId %>" class="mf-form">

        <% if (ViewModel.AutoQrCodeEnabled && !string.IsNullOrWhiteSpace(ViewModel.AutoQrCodeHtml)) { %>
        <%= ViewModel.AutoQrCodeHtml %>
        <% } %>

        <div id="mf-fields-container-<%= ViewModel.FormId %>" class="mf-fields-container"></div>

        <div style="position:absolute;left:-9999px;top:-9999px;height:0;width:0;overflow:hidden;" aria-hidden="true" tabindex="-1">
            <input type="text" id="mf_hp_<%= ViewModel.FormId %>" name="<%= ViewModel.HoneypotFieldName %>" value="" autocomplete="off" tabindex="-1" />
        </div>

        <input type="hidden" id="mf-form-id" value="<%= ViewModel.FormId %>" />
        <input type="hidden" id="mf-load-timestamp" value="<%= ViewModel.FormLoadTimestamp %>" />

        <div class="mf-form-actions">
            <button type="button" id="mf-btn-prev-<%= ViewModel.FormId %>" class="mf-btn mf-btn-prev" style="display:none;">
                <i class="fa fa-arrow-left"></i> Previous
            </button>
            <% if (ViewModel.EnableSaveResume) { %>
                <button type="button" id="mf-btn-save-<%= ViewModel.FormId %>" class="mf-btn mf-btn-save">
                    <i class="fa fa-save"></i> Save Draft
                </button>
            <% } %>
            <button type="button" id="mf-btn-next-<%= ViewModel.FormId %>" class="mf-btn mf-btn-next" style="display:none;">
                Next <i class="fa fa-arrow-right"></i>
            </button>
            <button type="button" id="mf-btn-submit-<%= ViewModel.FormId %>" class="mf-btn mf-btn-submit">
                <i class="fa fa-paper-plane"></i> <%= Server.HtmlEncode(ViewModel.SubmitButtonText ?? "Submit") %>
            </button>
        </div>
    </div>

    <div id="mf-success-<%= ViewModel.FormId %>" class="mf-success-message" style="display:none;">
        <div id="mf-success-content-<%= ViewModel.FormId %>"></div>
    </div>

    <div id="mf-error-<%= ViewModel.FormId %>" class="mf-error-message" style="display:none;">
        <div class="alert alert-danger">
            <i class="fa fa-exclamation-triangle"></i>
            <span id="mf-error-text-<%= ViewModel.FormId %>"></span>
        </div>
    </div>

    <div id="mf-loading-<%= ViewModel.FormId %>" class="mf-loading" style="display:none;">
        <i class="fa fa-spinner fa-spin fa-2x"></i> Submitting...
    </div>

  </div>
</div>


<script type="text/javascript">
(function () {
  var p = window.__MF_PLATFORM__ = window.__MF_PLATFORM__ || {};
  if (!p.platform) p.platform = 'dnn';
  if (!p.moduleId) p.moduleId = <%= ModuleId %>;
  if (!p.formId) p.formId = <%= ViewModel.FormId %>;
  if (typeof p.allowThemePresetSelector === 'undefined') p.allowThemePresetSelector = <%= (ViewModel.IsAdmin && ViewModel.IsInEditMode && !ViewModel.LiveRenderMode).ToString().ToLower() %>;
  if (!p.presetThemeKey) p.presetThemeKey = <%= Newtonsoft.Json.JsonConvert.SerializeObject(ViewModel.SelectedThemePresetKey ?? "") %>;
})();
</script>

<%-- [SingleSource v20260624-B260] mf-live-override REMOVED: the module CssOverride is now
     composed into the single #mf-custom-css block (appended last so it still wins). --%>

<%-- CSS & JS registered via ClientResourceManager in codebehind (loads in <head>) --%>
<%= RenderPluginTags() %>
<script type="text/javascript">
    (function megaFormInit() {
        var container = document.getElementById('mf-fields-container-<%= ViewModel.FormId %>');
        if (!container || typeof MegaFormRenderer === 'undefined') {
            setTimeout(megaFormInit, 50);
            return;
        }
        console.log('MegaForm: initializing form <%= ViewModel.FormId %>');
        MegaFormRenderer.init({
            formId: <%= ViewModel.FormId %>,
            moduleId: <%= ModuleId %>,
            apiBaseUrl: '<%= ViewModel.ApiBaseUrl %>',
            schema: JSON.parse('<%= System.Web.HttpUtility.JavaScriptStringEncode(ViewModel.ResolvedSchemaJson) %>'),
            settingsJson: <%= !string.IsNullOrEmpty(ViewModel.SettingsJson) ? ViewModel.SettingsJson : "null" %>,
            themeJson: <%= !string.IsNullOrEmpty(ViewModel.ThemeJson) ? ViewModel.ThemeJson : "null" %>,
            moduleViewConfigJson: <%= !string.IsNullOrEmpty(ViewModel.ActiveViewConfigJson) ? ViewModel.ActiveViewConfigJson : "{}" %>,
            title: <%= Newtonsoft.Json.JsonConvert.SerializeObject(ViewModel.Title ?? "") %>,
            description: <%= Newtonsoft.Json.JsonConvert.SerializeObject(ViewModel.Description ?? "") %>,
            submitButtonText: <%= Newtonsoft.Json.JsonConvert.SerializeObject(ViewModel.SubmitButtonText ?? "Submit") %>,
            successMessage: <%= Newtonsoft.Json.JsonConvert.SerializeObject(((ViewModel.Schema != null && ViewModel.Schema.Settings != null && ViewModel.Schema.Settings.PostSubmitExperience != null && !string.IsNullOrWhiteSpace(ViewModel.Schema.Settings.PostSubmitExperience.Message)) ? ViewModel.Schema.Settings.PostSubmitExperience.Message : "")) %>,
            honeypotField: '<%= ViewModel.HoneypotFieldName %>',
            loadTimestamp: <%= ViewModel.FormLoadTimestamp %>,
            enableSaveResume: <%= ViewModel.EnableSaveResume.ToString().ToLower() %>,
            enableCaptcha: <%= ViewModel.EnableCaptcha.ToString().ToLower() %>,
            resumeToken: '<%= ViewModel.ResumeToken ?? "" %>',
            prefilledData: <%= !string.IsNullOrEmpty(ViewModel.PrefilledDataJson) ? ViewModel.PrefilledDataJson : "null" %>
        });
    })();
</script>

<% } %>
