<%@ Control Language="C#" AutoEventWireup="true" CodeBehind="FormView.ascx.cs" Inherits="MegaForm.DNN.Components.FormView" %>

<% if (ViewModel != null && ViewModel.ShowConfigPanel) { %>
    <%-- CONFIG PANEL — rendered by MegaForm.UI TypeScript bundle --%>
    <div id="mf-config-root" 
         data-platform="dnn"
         data-instance-id="<%= ModuleId %>"
         data-form-id="<%= ViewModel.FormId %>"
         data-api-base="/DesktopModules/MegaForm/API/"
         data-is-admin="<%= ViewModel.IsAdmin.ToString().ToLower() %>"
         data-view-type="<%= ViewModel.ActiveViewType ?? "" %>"
         data-config='<%= ViewModel.ModuleConfigJson ?? "{}" %>'>
        <div style="padding:40px;text-align:center;color:#64748b;">
            <i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Loading configuration...
        </div>
    </div>
    <script src="/DesktopModules/MegaForm/Assets/js/bundles/megaform-builder.js?v=20260525-02"></script>
    <script src="/DesktopModules/MegaForm/Assets/js/bundles/megaform-submissions.js?v=20260525-02"></script>
    <script src="/DesktopModules/MegaForm/Assets/js/bundles/megaform-views.js?v=20260525-02"></script>
    <script src="/DesktopModules/MegaForm/Assets/js/bundles/megaform-config.js?v=20260525-02"></script>
    <script>
        (function() {
            if (window.MegaForm && window.MegaForm.initConfig) {
                window.MegaForm.initConfig(document.getElementById('mf-config-root'));
            } else {
                console.error('[MegaForm] Config bundle not loaded');
            }
        })();
    </script>
<% } else if (ViewModel == null || ViewModel.FormId == 0) { %>
    <div class="mf-no-form">
        <p class="text-muted"><em>No form has been configured for this module.</em></p>
    </div>
<% } else if (ViewModel.RequireAuth && !ViewModel.IsAuthenticated) { %>
    <div class="mf-auth-required alert alert-warning">
        <i class="fa fa-lock"></i> You must be logged in to access this form.
    </div>
<% } else if (!string.IsNullOrEmpty(ViewModel.ActiveViewType) && ViewModel.ActiveViewType != "edit") { %>
<%-- MULTI-VIEW MODE: list / detail / card --%>
<% if (ViewModel.IsAdmin) { %>
<div class="mf-admin-bar" style="text-align:right;padding:4px 8px;margin-bottom:4px;">
    <a href="<%= Request.Url.AbsolutePath %>?configure=1" class="mf-cfg-edit-btn" title="Edit View Configuration">
        <i class="fas fa-cog"></i> Edit View
    </a>
</div>
<% } %>
<div id="mf-view-container-<%= ViewModel.FormId %>" class="mf-view-container"></div>

<%= RenderPluginTags() %>
<script type="text/javascript">
(function() {
    var formId = <%= ViewModel.FormId %>;
    var schema = <%= ViewModel.Schema != null ? Newtonsoft.Json.JsonConvert.SerializeObject(ViewModel.Schema) : "{\"fields\":[]}" %>;
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

<% if (ViewModel.IsAdmin) { %>
<div class="mf-admin-bar" style="text-align:right;padding:4px 8px;margin-bottom:4px;">
    <a href="<%= Request.RawUrl + (Request.RawUrl.Contains("?") ? "&" : "?") %>configure=1" 
       class="mf-cfg-edit-btn" title="Edit View Configuration">
        <i class="fas fa-cog"></i> Edit View
    </a>
</div>
<% } %>

<div id="mf-form-wrapper-<%= ViewModel.FormId %>" class="mf-form-wrapper<%= !string.IsNullOrEmpty(ViewModel.ThemeClass) ? " " + Server.HtmlEncode(ViewModel.ThemeClass) : "" %>"
     data-form-id="<%= ViewModel.FormId %>"
     data-module-id="<%= ViewModel.ModuleId %>"
     data-save-endpoint="/API/MegaForm/Form/SaveStyle">
  <div class="mf-form-inner">

    <div class="mf-form-header">
        <% if (!string.IsNullOrEmpty(ViewModel.Title)) { %>
            <h2 class="mf-form-title"><%= Server.HtmlEncode(ViewModel.Title) %></h2>
        <% } %>
        <% if (!string.IsNullOrEmpty(ViewModel.Description)) { %>
            <p class="mf-form-description"><%= Server.HtmlEncode(ViewModel.Description) %></p>
        <% } %>
    </div>

    <div id="mf-progress-<%= ViewModel.FormId %>" class="mf-progress-bar" style="display:none;"></div>

    <%-- DIV instead of FORM to avoid ASP.NET nested form conflict --%>
    <div id="mf-form-<%= ViewModel.FormId %>" class="mf-form">

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
        <div class="alert alert-success">
            <i class="fa fa-check-circle fa-2x"></i>
            <h3>Thank You!</h3>
            <p id="mf-success-text-<%= ViewModel.FormId %>"></p>
            <p class="mf-ref-number"><small>Reference: #<span id="mf-success-ref-<%= ViewModel.FormId %>"></span></small></p>
        </div>
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

<%-- Inject saved CSS variable overrides (admin live editor) --%>
<% if (!string.IsNullOrEmpty(ViewModel.CssOverride)) { %>
<style id="mf-live-override"><%= ViewModel.CssOverride %></style>
<% } %>

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
            apiBaseUrl: '<%= ViewModel.ApiBaseUrl %>',
            schema: <%= ViewModel.Schema != null ? Newtonsoft.Json.JsonConvert.SerializeObject(ViewModel.Schema) : "null" %>,
            theme: <%= !string.IsNullOrEmpty(ViewModel.ThemeJson) ? ViewModel.ThemeJson : "null" %>,
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
