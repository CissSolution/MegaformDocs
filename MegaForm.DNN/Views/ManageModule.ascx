<%@ Control Language="C#" AutoEventWireup="true" CodeBehind="ManageModule.ascx.cs" Inherits="MegaForm.DNN.Components.ManageModule" %>
<%@ Register TagPrefix="dnn" TagName="Label" Src="~/controls/LabelControl.ascx" %>

<div class="dnnForm mf-manage-module-form">
    <div class="dnnFormMessage dnnFormInfo">
        Configure how this MegaForm module instance behaves on this page. Save one clear module mode here: render a selected form, open the Admin Dashboard for administrators, or turn this module into a My Inbox workboard.
    </div>

    <asp:Panel ID="pnlNoFormsInfo" runat="server" CssClass="dnnFormMessage dnnFormWarning" Visible="false">
        <asp:Literal ID="litNoFormsInfo" runat="server" />
        <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <asp:Button ID="btnOpenDashboard" runat="server" CssClass="dnnPrimaryAction" Text="Open Form Dashboard" Visible="false" CausesValidation="false" OnClick="btnGoToDashboard_Click" />
            <span style="color:#475569;font:500 12px/1.5 'Inter',system-ui,sans-serif;">Create a form first, then come back here to bind this module.</span>
        </div>
    </asp:Panel>

    <fieldset>
        <legend style="font-size:14px;font-weight:600;color:#334155;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:12px;">📋 Module form &amp; view</legend>
        <asp:Panel ID="pnlDefaultViewRow" runat="server" CssClass="dnnFormItem" Visible="false">
            <dnn:Label ID="lblDefaultView" runat="server"
                       ControlName="ddlDefaultView"
                       Text="Module mode"
                       HelpText="Choose whether this module renders a form, is the Admin Dashboard, or is the My Inbox workboard." />
            <asp:DropDownList ID="ddlDefaultView" runat="server" CssClass="form-control" AutoPostBack="true" OnSelectedIndexChanged="ConfigurationSelectionChanged" />
        </asp:Panel>
        <asp:Panel ID="pnlDisplayModeNotApplicable" runat="server" CssClass="dnnFormMessage dnnFormInfo" Visible="false" />
        <asp:Panel ID="pnlFormSelectRow" runat="server" CssClass="dnnFormItem">
            <dnn:Label ID="lblFormSelect" runat="server"
                       ControlName="ddlForms"
                       Text="Select form"
                       HelpText="Choose which form this module instance should render." />
            <asp:DropDownList ID="ddlForms" runat="server" CssClass="form-control" />
            <div style="margin-top:6px;color:#64748b;font:500 12px/1.6 'Inter',system-ui,sans-serif;">
                This selector appears only in <strong>Form Renderer</strong> mode. Admin Dashboard mode opens the management surface for administrators, and My Inbox mode shows each signed-in user their own approval workboard.
            </div>
        </asp:Panel>
    </fieldset>

    <asp:Panel ID="pnlDisplaySettings" runat="server" Visible="true">
        <fieldset>
            <legend style="font-size:14px;font-weight:600;color:#334155;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:12px;">🎯 Display mode</legend>
            <asp:Panel ID="pnlDisplayModeRow" runat="server" CssClass="dnnFormItem">
                <dnn:Label ID="lblDisplayMode" runat="server"
                           ControlName="ddlDisplayMode"
                           Text="Display mode"
                           HelpText="Fixed form shows the form directly. Popup form shows it by popup trigger settings below." />
                <asp:DropDownList ID="ddlDisplayMode" runat="server" CssClass="form-control" AutoPostBack="true" OnSelectedIndexChanged="ConfigurationSelectionChanged">
                    <asp:ListItem Text="Fixed form" Value="fixed" />
                    <asp:ListItem Text="Popup form" Value="popup" />
                </asp:DropDownList>
            </asp:Panel>

            <asp:Panel ID="pnlPopupSettings" runat="server" Visible="false">
                <asp:Panel ID="pnlPopupTriggerRow" runat="server" CssClass="dnnFormItem">
                    <dnn:Label ID="lblPopupTrigger" runat="server"
                               ControlName="ddlPopupTrigger"
                               Text="Popup trigger"
                               HelpText="Choose how the popup form should open when display mode is Popup form." />
                    <asp:DropDownList ID="ddlPopupTrigger" runat="server" CssClass="form-control" AutoPostBack="true" OnSelectedIndexChanged="ConfigurationSelectionChanged">
                        <asp:ListItem Text="Time delay" Value="time_delay" />
                        <asp:ListItem Text="Scroll depth" Value="scroll_depth" />
                        <asp:ListItem Text="Click trigger" Value="click_trigger" />
                    </asp:DropDownList>
                </asp:Panel>
                <asp:Panel ID="pnlDelaySecondsRow" runat="server" CssClass="dnnFormItem">
                    <dnn:Label ID="lblDelaySeconds" runat="server"
                               ControlName="txtDelaySeconds"
                               Text="Time delay (seconds)"
                               HelpText="Used when Popup trigger is Time delay." />
                    <asp:TextBox ID="txtDelaySeconds" runat="server" CssClass="form-control" TextMode="Number" />
                </asp:Panel>
                <asp:Panel ID="pnlScrollPercentRow" runat="server" CssClass="dnnFormItem">
                    <dnn:Label ID="lblScrollPercent" runat="server"
                               ControlName="txtScrollPercent"
                               Text="Scroll depth (%)"
                               HelpText="Used when Popup trigger is Scroll depth." />
                    <asp:TextBox ID="txtScrollPercent" runat="server" CssClass="form-control" TextMode="Number" />
                </asp:Panel>
                <asp:Panel ID="pnlClickSelectorRow" runat="server" CssClass="dnnFormItem">
                    <dnn:Label ID="lblClickSelector" runat="server"
                               ControlName="txtClickSelector"
                               Text="Click selector"
                               HelpText="Used when Popup trigger is Click trigger. Example: .open-megaform-popup or #open-form." />
                    <asp:TextBox ID="txtClickSelector" runat="server" CssClass="form-control" />
                </asp:Panel>
                <asp:Panel ID="pnlTriggerSampleRow" runat="server" CssClass="dnnFormItem">
                    <dnn:Label ID="lblTriggerSample" runat="server"
                               ControlName="txtTriggerSample"
                               Text="Sample HTML trigger"
                               HelpText="Copy this sample HTML when using the click trigger option." />
                    <asp:TextBox ID="txtTriggerSample" runat="server" CssClass="form-control" TextMode="MultiLine" Rows="4" ReadOnly="true" />
                </asp:Panel>
                <asp:Panel ID="pnlStartAtRow" runat="server" CssClass="dnnFormItem">
                    <dnn:Label ID="lblStartAt" runat="server"
                               ControlName="txtStartAt"
                               Text="Display window start"
                               HelpText="Optional. Leave blank to allow popup immediately." />
                    <asp:TextBox ID="txtStartAt" runat="server" CssClass="form-control" TextMode="DateTimeLocal" />
                </asp:Panel>
                <asp:Panel ID="pnlEndAtRow" runat="server" CssClass="dnnFormItem">
                    <dnn:Label ID="lblEndAt" runat="server"
                               ControlName="txtEndAt"
                               Text="Display window end"
                               HelpText="Optional. Leave blank to keep popup eligible with no end date." />
                    <asp:TextBox ID="txtEndAt" runat="server" CssClass="form-control" TextMode="DateTimeLocal" />
                </asp:Panel>
                <asp:Panel ID="pnlPopupFlagsRow" runat="server" CssClass="dnnFormItem">
                    <dnn:Label ID="lblPopupFlags" runat="server"
                               ControlName="chkShowOncePerSession"
                               Text="Popup behavior"
                               HelpText="Small runtime flags for popup behavior." />
                    <div style="display:flex;flex-direction:column;gap:10px;padding-top:4px;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <asp:CheckBox ID="chkShowOncePerSession" runat="server" Text="" />
                            <span style="display:inline-block;color:#334155;font:500 13px/1.5 'Inter',system-ui,sans-serif;">Show only once per browser session</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <asp:CheckBox ID="chkCloseOnOverlay" runat="server" Text="" />
                            <span style="display:inline-block;color:#334155;font:500 13px/1.5 'Inter',system-ui,sans-serif;">Allow closing by clicking outside the popup</span>
                        </div>
                    </div>
                </asp:Panel>
            </asp:Panel>
            <asp:Panel ID="pnlAutoQrCodeRow" runat="server" CssClass="dnnFormItem">
                <dnn:Label ID="lblAutoQrCode" runat="server"
                           ControlName="chkEnableAutoQrCode"
                           Text="Auto QR code"
                           HelpText="When enabled, MegaForm automatically adds one QR code inside the form at the top-right corner. It points to this form's public link, so users can scan and continue on mobile without adding a QR widget to each template." />
                <div>
                    <asp:CheckBox ID="chkEnableAutoQrCode" runat="server" Text="Automatically show QR code in the form" />
                    <div style="margin-top:6px;color:#64748b;font:500 12px/1.6 'Inter',system-ui,sans-serif;">
                        Uses the form's public view URL when set; otherwise the page the form is rendered on.
                    </div>
                </div>
            </asp:Panel>
        </fieldset>
    </asp:Panel>

    <div class="dnnFormItem" style="margin-top:18px;display:flex;gap:10px;align-items:center;">
        <asp:Button ID="btnUpdate" runat="server" CssClass="dnnPrimaryAction" Text="Update" OnClick="btnUpdate_Click" />
        <asp:Button ID="btnGoToDashboard" runat="server" CssClass="dnnSecondaryAction" Text="Go To Dashboard" CausesValidation="false" OnClick="btnGoToDashboard_Click" />
        <asp:Button ID="btnCancel" runat="server" CssClass="dnnSecondaryAction" Text="Cancel" CausesValidation="false" OnClick="btnCancel_Click" />
        <asp:Label ID="lblMessage" runat="server" EnableViewState="false" style="color:#475569;font:600 12px/1.5 'Inter',system-ui,sans-serif;" />
    </div>
</div>
