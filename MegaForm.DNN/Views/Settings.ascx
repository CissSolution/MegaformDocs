<%@ Control Language="C#" AutoEventWireup="true" CodeBehind="Settings.ascx.cs" Inherits="MegaForm.DNN.Components.FormSettings" %>
<%@ Register TagPrefix="dnn" TagName="Label" Src="~/controls/LabelControl.ascx" %>

<%-- ============================================================
     MegaForm — Module Settings
     ============================================================ --%>

<div class="dnnForm mf-settings-form">
    <fieldset>
        <legend style="font-size:14px;font-weight:600;color:#334155;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:12px;">📋 Form & View</legend>
        <div class="dnnFormItem">
            <dnn:Label ID="lblFormSelect" runat="server" 
                       ControlName="ddlForms"
                       Text="Select Form" 
                       HelpText="Choose which form to display in this module instance." />
            <asp:DropDownList ID="ddlForms" runat="server" CssClass="form-control" AutoPostBack="true" OnSelectedIndexChanged="ddlForms_Changed" />
        </div>
        <div class="dnnFormItem">
            <dnn:Label ID="lblDefaultView" runat="server"
                       ControlName="ddlDefaultView"
                       Text="Default View"
                       HelpText="Choose the default view when this module loads. 'Form (Submit)' shows the submission form. Other options show submissions in different layouts." />
            <asp:DropDownList ID="ddlDefaultView" runat="server" CssClass="form-control" />
        </div>
        <div class="dnnFormItem" id="divCustomViews" runat="server" visible="false">
            <dnn:Label ID="lblCustomView" runat="server"
                       ControlName="ddlCustomView"
                       Text="Custom View"
                       HelpText="Select a specific custom view configured in the form builder." />
            <asp:DropDownList ID="ddlCustomView" runat="server" CssClass="form-control" />
        </div>
    </fieldset>

    <fieldset style="display:none;">
        <legend style="font-size:14px;font-weight:600;color:#334155;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:12px;">🔗 App Scope (Multi-Purpose)</legend>
        <div class="dnnFormItem">
            <dnn:Label ID="lblAppScope" runat="server"
                       ControlName="ddlAppScope"
                       Text="App Scope"
                       HelpText="Group module instances by scope. All instances with the same scope share data and can communicate (e.g. 'articles', 'forum', 'helpdesk'). Leave blank for standalone form." />
            <asp:DropDownList ID="ddlAppScope" runat="server" CssClass="form-control" />
            <asp:TextBox ID="txtNewScope" runat="server" CssClass="form-control" placeholder="or type new scope..." style="margin-top:4px;" />
        </div>
        <div class="dnnFormItem">
            <dnn:Label ID="lblBusChannel" runat="server"
                       ControlName="txtBusChannel"
                       Text="Bus Channel"
                       HelpText="Event bus channel name. Instances with the same channel communicate (e.g. click in List → shows in Detail). Auto-set from App Scope if blank." />
            <asp:TextBox ID="txtBusChannel" runat="server" CssClass="form-control" placeholder="auto from scope" />
        </div>
        <div class="dnnFormItem">
            <dnn:Label ID="lblDetailModuleId" runat="server"
                       ControlName="txtDetailModuleId"
                       Text="Detail Target Module"
                       HelpText="Module ID of the Detail view instance. When a record is clicked in this List/Card view, the Detail module will display it. Leave blank for same-module navigation." />
            <asp:TextBox ID="txtDetailModuleId" runat="server" CssClass="form-control" placeholder="e.g. 456 (leave blank for self)" />
        </div>
    </fieldset>

    <fieldset style="display:none;">
        <legend style="font-size:14px;font-weight:600;color:#334155;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:12px;">➕ Quick Actions</legend>
        <div class="dnnFormItem">
            <dnn:Label ID="lblCreateNew" runat="server" 
                       Text="Or Create New" 
                       HelpText="Click to create a new form for this module." />
            <asp:HyperLink ID="lnkCreateNew" runat="server" CssClass="btn btn-primary btn-sm" Text="Create New Form" />
        </div>
    </fieldset>
</div>
