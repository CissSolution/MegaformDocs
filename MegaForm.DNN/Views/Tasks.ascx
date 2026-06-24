<%@ Control Language="C#" AutoEventWireup="true" CodeBehind="Tasks.ascx.cs" Inherits="MegaForm.DNN.Components.TasksView" %>

<link rel="stylesheet" href="/DesktopModules/MegaForm/Assets/css/megaform-submissions-ts.css?v=20260426-03" />
<link rel="stylesheet" href="/DesktopModules/MegaForm/Assets/css/megaform-workflow-inbox-ts.css?v=20260426-03" />

<% if (ViewModel == null || !ViewModel.IsAuthenticated) { %>
    <div class="dnnFormMessage dnnFormWarning">
        Sign in with a DNN account that can access this page to work the MegaForm approval inbox.
    </div>
<% } else { %>
<div id="mf-dnn-tasks-root"
     class="mf-dnn-tasks"
     data-module-id="<%= ViewModel.ModuleId %>"
     data-tab-id="<%= ViewModel.TabId %>"
     data-api-base="<%= ViewModel.ApiBaseUrl %>"
     data-submissions-api-base="<%= ViewModel.SubmissionsApiBaseUrl %>"
     data-form-id="<%= ViewModel.FormId %>"
     data-initial-task-id="<%= Server.HtmlEncode(ViewModel.InitialTaskId ?? string.Empty) %>"
     data-tasks-url="<%= Server.HtmlEncode(ViewModel.TasksUrl ?? string.Empty) %>">

    <div class="mf-dnn-task-header">
        <div class="mf-dnn-task-header-main">
            <div class="mf-dnn-task-eyebrow">MegaForm Workflow Inbox</div>
            <h2 class="mf-dnn-task-title">Review and approve submissions inside DNN</h2>
            <div class="mf-dnn-task-meta">
                <span class="mf-dnn-task-chip">
                    <i class="fas fa-user"></i>
                    <strong><%= Server.HtmlEncode(string.IsNullOrWhiteSpace(ViewModel.CurrentDisplayName) ? ViewModel.CurrentUserName : ViewModel.CurrentDisplayName) %></strong>
                </span>
                <% if (ViewModel.CurrentRoles != null && ViewModel.CurrentRoles.Count > 0) { %>
                <span class="mf-dnn-task-chip">
                    <i class="fas fa-user-tag"></i>
                    <%= Server.HtmlEncode(string.Join(", ", ViewModel.CurrentRoles)) %>
                </span>
                <% } %>
                <% if (ViewModel.FormId > 0) { %>
                <span class="mf-dnn-task-chip">
                    <i class="fas fa-file-alt"></i>
                    Form #<%= ViewModel.FormId %><% if (!string.IsNullOrWhiteSpace(ViewModel.FormTitle)) { %>: <%= Server.HtmlEncode(ViewModel.FormTitle) %><% } %>
                </span>
                <% } %>
            </div>
        </div>
        <div class="mf-dnn-task-actions">
            <button type="button" id="mf-task-refresh" class="mf-dnn-btn mf-dnn-btn-primary">
                <i class="fas fa-sync-alt"></i> Refresh
            </button>
            <% if (!string.IsNullOrWhiteSpace(ViewModel.TasksUrl)) { %>
            <a href="<%= ViewModel.TasksUrl %>" class="mf-dnn-btn">
                <i class="fas fa-link"></i> Inbox Link
            </a>
            <% } %>
            <% if (!string.IsNullOrWhiteSpace(ViewModel.SubmissionsUrl) && ViewModel.IsEditable) { %>
            <a href="<%= ViewModel.SubmissionsUrl %>" class="mf-dnn-btn">
                <i class="fas fa-inbox"></i> Submissions
            </a>
            <% } %>
            <% if (!string.IsNullOrWhiteSpace(ViewModel.BuilderUrl) && ViewModel.IsEditable) { %>
            <a href="<%= ViewModel.BuilderUrl %>" class="mf-dnn-btn">
                <i class="fas fa-project-diagram"></i> Builder
            </a>
            <% } %>
            <% if (!string.IsNullOrWhiteSpace(ViewModel.ManageUrl) && ViewModel.IsEditable) { %>
            <a href="<%= ViewModel.ManageUrl %>" class="mf-dnn-btn">
                <i class="fas fa-cog"></i> Manage
            </a>
            <% } %>
        </div>
    </div>

    <% if (ViewModel.ShowSampleBanner) { %>
    <div class="mf-dnn-task-banner">
        <div class="mf-dnn-task-banner-title">
            <i class="fas fa-vial"></i> DNN approval sample is ready
        </div>
        <div class="mf-dnn-task-banner-body">
            Reviewer: <code>mf.sample.reviewer</code>, approver: <code>mf.sample.approver</code>, password: <code>MegaForm!2026</code>.
            Admins can inspect every task on this page. Sample users can work their own queue here after signing in.
            If the sample users cannot open this page yet, grant this DNN page normal view access first.
        </div>
    </div>
    <% } %>

    <div id="mf-task-feedback" class="mf-dnn-task-feedback" style="display:none;"></div>

    <div class="mf-dnn-task-layout">
        <div class="mf-dnn-task-column">
            <section class="mf-dnn-card">
                <div class="mf-dnn-card-header">
                    <h3><i class="fas fa-user-check"></i> My Tasks <span id="mf-my-task-count" class="mf-dnn-count">0</span></h3>
                    <div class="mf-dnn-card-sub">Tasks already assigned to the current user.</div>
                </div>
                <div id="mf-my-task-list" class="mf-dnn-task-list">
                    <div class="mf-dnn-empty">Loading your task inbox...</div>
                </div>
            </section>

            <section class="mf-dnn-card">
                <div class="mf-dnn-card-header">
                    <h3><i class="fas fa-people-arrows"></i> Role Queue <span id="mf-role-task-count" class="mf-dnn-count">0</span></h3>
                    <div class="mf-dnn-card-sub">Tasks you can claim because one of your DNN roles matches the workflow step.</div>
                </div>
                <div id="mf-role-task-list" class="mf-dnn-task-list">
                    <div class="mf-dnn-empty">Loading role queue...</div>
                </div>
            </section>
        </div>

        <div class="mf-dnn-task-column mf-dnn-task-column-detail">
            <section class="mf-dnn-card">
                <div class="mf-dnn-card-header">
                    <h3><i class="fas fa-clipboard-check"></i> Task Detail</h3>
                    <div class="mf-dnn-card-sub">Claim, approve, reject, or forward the selected step.</div>
                </div>
                <div id="mf-task-detail" class="mf-dnn-task-detail">
                    <div class="mf-dnn-empty">
                        Select a task from the inbox to inspect workflow history and take action.
                    </div>
                </div>
            </section>
        </div>
    </div>
</div>
<% } %>

<script src="/DesktopModules/MegaForm/Assets/js/megaform-workflow-inbox.js?v=20260426-03"></script>
<script type="text/javascript">
(function () {
    var root = document.getElementById('mf-dnn-tasks-root');
    if (!root) return;

    function tryInit() {
        if (window.MegaForm && window.MegaForm.initWorkflowInbox) {
            window.MegaForm.initWorkflowInbox(root);
        } else {
            setTimeout(tryInit, 50);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }
})();
</script>
