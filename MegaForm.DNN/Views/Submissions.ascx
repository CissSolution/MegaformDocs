<%@ Control Language="C#" AutoEventWireup="true" CodeBehind="Submissions.ascx.cs" Inherits="MegaForm.DNN.Components.SubmissionsView" %>

<%-- [SubmissionInboxRoute v20260518-03] Replaced the legacy per-form
     megaform-submissions.js table with the cross-form Gmail-style
     Submission Inbox bundle. The new bundle is self-contained: it
     auto-mounts on any element carrying data-mf-submission-inbox="1"
     and works without a module-bound form (cross-form by design).
     ViewModel is no longer required. --%>

<link rel="stylesheet" href="/DesktopModules/MegaForm/Assets/css/megaform-submission-inbox.css?v=20260518-06" />
<%-- [SubmissionInboxRowDetail v20260518-06] detail-shell + flow-canvas styles --%>
<link rel="stylesheet" href="/DesktopModules/MegaForm/Assets/css/megaform-submissions-ts.css?v=20260518-06" />

<div id="mf-submissions-root"
     data-mf-submission-inbox="1"
     data-platform="dnn"
     data-mf-module-id="<%= ModuleId %>"
     data-mf-portal-id="<%= PortalId %>"
     data-mf-tab-id="<%= TabId %>"
     data-mf-api-base="/API/MegaForm/"
     data-hide-host-chrome="true">
    <div class="mf-admin-loading" style="padding:48px;text-align:center;color:#94a3b8;">
        <i class="fas fa-spinner fa-spin fa-2x"></i><br /><br />Loading submissions...
    </div>
</div>

<script src="/DesktopModules/MegaForm/Assets/js/megaform-submission-inbox.js?v=20260518-03"></script>
