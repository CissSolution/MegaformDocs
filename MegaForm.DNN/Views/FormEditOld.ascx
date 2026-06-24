<%@ Control Language="C#" AutoEventWireup="true" CodeBehind="FormEdit.ascx.cs" Inherits="MegaForm.DNN.Components.FormEdit" %>
<%@ Register TagPrefix="dnn" TagName="Label" Src="~/controls/LabelControl.ascx" %>
<% if (ViewModel == null) { %>
<div class="alert alert-danger">Error loading form builder. Please check the module configuration.</div>
<% return; } %>
<% var isNew = (ViewModel.Form == null || ViewModel.Form.FormId == 0); %>

<%-- ============================================================
     TEMPLATE GALLERY (new form only)
     ============================================================ --%>
<% if (isNew) { %>
<div id="mf-template-gallery" class="mf-tpl-gallery">
    <div class="mf-tpl-header"><h2>Create a New Form</h2><p>Start from a template or build from scratch</p></div>
    <div class="mf-tpl-filters">
        <button class="mf-tpl-cat active" data-cat="all">All</button>
        <button class="mf-tpl-cat" data-cat="finance">🏦 Finance</button>
        <button class="mf-tpl-cat" data-cat="hr">👋 HR</button>
    </div>
    <div class="mf-tpl-grid" id="mf-tpl-grid"></div>
    <div class="mf-tpl-action-bar">
        <a href="<%= DotNetNuke.Common.Globals.NavigateURL() %>" class="mf-tpl-btn mf-tpl-btn-outline">Cancel</a>
        <label class="mf-tpl-btn mf-tpl-btn-outline" style="cursor:pointer;" title="Upload a template ZIP package">
            <i class="fas fa-upload"></i> Upload Template
            <input type="file" id="mf-tpl-upload" accept=".zip" style="display:none;">
        </label>
        <button type="button" id="mf-tpl-use-btn" class="mf-tpl-btn mf-tpl-btn-primary" disabled>Use This Template</button>
    </div>
    <div id="mf-tpl-upload-status" style="display:none;padding:10px 20px;"></div>
</div>
<% } %>

<%-- ============================================================
     FORM BUILDER
     ============================================================ --%>
<div id="mf-builder-app" class="mf-builder-wrapper" <% if (isNew) { %>style="display:none;"<% } %>>

    <%-- Toolbar --%>
    <div class="mf-builder-toolbar">
        <div class="mf-toolbar-left">
            <a href="<%= DotNetNuke.Common.Globals.NavigateURL() %>" class="mf-tb-back" title="Back to page">
                <i class="fas fa-arrow-left"></i>
            </a>
            <div class="mf-tb-title-block">
                <span id="mf-builder-form-title" class="mf-tb-title"><%= ViewModel.Form != null ? Server.HtmlEncode(ViewModel.Form.Title) : "New Form" %></span>
                <span class="mf-tb-badge"><%= ViewModel.Form != null && ViewModel.Form.Status == "published" ? "Published" : "Draft" %></span>
            </div>
        </div>
        <div class="mf-toolbar-center">
            <button type="button" id="mf-btn-import" class="mf-tb-btn mf-tb-ghost" title="Import Form JSON">
                <i class="fas fa-download"></i><span>Import</span>
            </button>
            <button type="button" id="mf-btn-export" class="mf-tb-btn mf-tb-ghost" title="Export Form JSON">
                <i class="fas fa-upload"></i><span>Export</span>
            </button>
            <div class="mf-tb-divider"></div>
            <button type="button" id="mf-btn-preview" class="mf-tb-btn mf-tb-ghost" title="Preview form">
                <i class="fas fa-eye"></i><span>Preview</span>
            </button>
        </div>
        <div class="mf-toolbar-right">
            <button type="button" id="mf-btn-save-draft" class="mf-tb-btn mf-tb-outline">
                <i class="fas fa-save"></i><span>Save Draft</span>
            </button>
            <button type="button" id="mf-btn-publish" class="mf-tb-btn mf-tb-primary">
                <i class="fas fa-rocket"></i><span>Publish</span>
            </button>
        </div>
    </div>

    <%-- 3-Column Layout --%>
    <div class="mf-builder-layout">

        <%-- MINI EDGE TABS (shown when panel is collapsed, fixed to edge) --%>
        <div id="mf-left-open-btn" class="mf-edge-mini mf-edge-mini-left" style="display:none;" title="Open Elements">
            <i class="fas fa-th-list"></i>
        </div>
        <div id="mf-right-open-btn" class="mf-edge-mini mf-edge-mini-right" style="display:none;" title="Open Properties">
            <i class="fas fa-sliders-h"></i>
        </div>

        <%-- LEFT: Field Palette --%>
        <div class="mf-panel mf-panel-left" id="mf-panel-left">
            <div class="mf-panel-header">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <h4 style="margin:0;"><i class="fas fa-th-list"></i> Elements</h4>
                    <a href="#" id="mf-left-collapse-btn" class="mf-collapse-btn" title="Hide panel">&#x00AB;</a>
                </div>
                <input type="text" id="mf-field-search" class="form-control form-control-sm" placeholder="Search..." style="margin-top:8px;" />
            </div>

            <%-- Palette Category Tabs --%>
            <div class="mf-palette-tabs">
                <a href="#" class="mf-ptab active" data-cat="basic">Basic</a>
                <a href="#" class="mf-ptab" data-cat="layout">Layout</a>
                <a href="#" class="mf-ptab" data-cat="plugins" id="mf-ptab-plugins" style="display:none;">🧩 Plugins</a>
            </div>

            <div class="mf-panel-body">
                <%-- BASIC --%>
                <div class="mf-palette-cat" id="mf-pcat-basic">
                    <div class="mf-field-palette">
                        <div class="mf-palette-item" data-type="Text"><i class="fas fa-font"></i><span>Short Text</span></div>
                        <div class="mf-palette-item" data-type="Textarea"><i class="fas fa-align-left"></i><span>Long Text</span></div>
                        <div class="mf-palette-item" data-type="Email"><i class="fas fa-envelope"></i><span>Email</span></div>
                        <div class="mf-palette-item" data-type="Number"><i class="fas fa-hashtag"></i><span>Number</span></div>
                        <div class="mf-palette-item" data-type="Date"><i class="fas fa-calendar"></i><span>Date</span></div>
                        <div class="mf-palette-item" data-type="Phone"><i class="fas fa-phone"></i><span>Phone</span></div>
                        <div class="mf-palette-item" data-type="Select"><i class="fas fa-caret-square-down"></i><span>Dropdown</span></div>
                        <div class="mf-palette-item" data-type="Radio"><i class="fas fa-dot-circle"></i><span>Radio</span></div>
                        <div class="mf-palette-item" data-type="Checkbox"><i class="fas fa-check-square"></i><span>Checkboxes</span></div>
                        <div class="mf-palette-item" data-type="File"><i class="fas fa-paperclip"></i><span>File Upload</span></div>
                        <div class="mf-palette-item" data-type="Url"><i class="fas fa-link"></i><span>URL</span></div>
                        <div class="mf-palette-item" data-type="Rating"><i class="fas fa-star"></i><span>Rating</span></div>
                        <div class="mf-palette-item" data-type="Signature"><i class="fas fa-signature"></i><span>Signature</span></div>
                        <div class="mf-palette-item" data-type="UniqueId"><i class="fas fa-fingerprint"></i><span>Unique ID</span></div>
                        <div class="mf-palette-item" data-type="Captcha"><i class="fas fa-shield-alt"></i><span>CAPTCHA</span></div>
                    </div>
                </div>

                <%-- LAYOUT --%>
                <div class="mf-palette-cat" id="mf-pcat-layout" style="display:none;">
                    <div class="mf-field-palette">
                        <div class="mf-palette-item mf-palette-row-item" data-type="Row"><i class="fas fa-columns"></i><span>Row / Columns</span></div>
                        <div class="mf-palette-item" data-type="Html"><i class="fas fa-code"></i><span>HTML Block</span></div>
                        <div class="mf-palette-item" data-type="Section"><i class="fas fa-minus"></i><span>Section Break</span></div>
                        <div class="mf-palette-item" data-type="Hidden"><i class="fas fa-eye-slash"></i><span>Hidden</span></div>
                    </div>
                </div>

                <%-- PLUGINS (auto-populated from registered plugins) --%>
                <div class="mf-palette-cat" id="mf-pcat-plugins" style="display:none;">
                    <div class="mf-field-palette" id="mf-plugin-palette"></div>
                </div>
            </div>
        </div>

        <%-- CENTER: Canvas --%>
        <div class="mf-panel mf-panel-center">
            <div class="mf-canvas-header">
                <input type="text" id="mf-canvas-title" class="mf-canvas-title-input"
                       value="<%= ViewModel.Form != null ? Server.HtmlEncode(ViewModel.Form.Title) : "Untitled Form" %>" placeholder="Form Title" />
                <textarea id="mf-canvas-description" class="mf-canvas-desc-input" rows="2"
                          placeholder="Add a description (optional)"><%= ViewModel.Form != null ? Server.HtmlEncode(ViewModel.Form.Description ?? "") : "" %></textarea>
            </div>

            <div id="mf-canvas-dropzone" class="mf-canvas-dropzone">
                <div id="mf-empty-state" class="mf-dropzone-placeholder">
                    <i class="fas fa-hand-pointer fa-3x" style="color:#cbd5e1;"></i>
                    <p>Click fields from the left panel to add</p>
                </div>
                <%-- Canvas fields rendered by JS here --%>
                <div id="mf-canvas-fields"></div>
            </div>

            <div class="mf-canvas-footer">
                <input type="text" id="mf-submit-btn-text" class="mf-submit-btn-text"
                       value="<%= ViewModel.Form != null ? Server.HtmlEncode(ViewModel.Form.SubmitButtonText ?? "Submit") : "Submit" %>" placeholder="Submit" />
            </div>
        </div>

        <%-- Flyout backdrop --%>
        <div id="mf-flyout-backdrop" class="mf-flyout-backdrop"></div>

        <%-- RIGHT: Properties / Settings --%>
        <div class="mf-panel mf-panel-right" id="mf-panel-right">
            <div class="mf-right-tabs">
                <a href="#" id="mf-right-collapse-btn" class="mf-right-tab mf-collapse-btn" title="Hide panel">&#x00BB;</a>
                <a href="#" id="mf-tab-link-field" class="mf-right-tab active" data-tab="field">Field</a>
                <a href="#" id="mf-tab-link-widget" class="mf-right-tab" data-tab="widget" style="display:none;"><i class="fas fa-puzzle-piece"></i> Widget</a>
                <a href="#" id="mf-tab-link-settings" class="mf-right-tab" data-tab="settings">Settings</a>
                <a href="#" id="mf-tab-link-html" class="mf-right-tab" data-tab="html"><i class="fas fa-code"></i> HTML</a>
                <a href="#" id="mf-tab-link-ai" class="mf-right-tab" data-tab="ai"><i class="fas fa-robot"></i> AI</a>
                <a href="#" id="mf-tab-link-embed" class="mf-right-tab" data-tab="embed"><i class="fas fa-share-alt"></i> Embed</a>
                <a href="#" id="mf-panel-expand-btn" class="mf-right-tab mf-expand-btn" title="Expand / Collapse panel">
                    <i class="fas fa-expand-arrows-alt" id="mf-expand-icon"></i>
                </a>
            </div>

            <%-- FIELD TAB --%>
            <div id="mf-tab-field" class="mf-right-tab-content">
                <div id="mf-no-field-selected" class="mf-placeholder-text">
                    <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#eef2ff,#f5f3ff);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
                        <i class="fas fa-mouse-pointer" style="color:#6366f1;font-size:22px;"></i>
                    </div>
                    <p style="color:#64748b;font-size:14px;font-weight:500;">Select a field to edit</p>
                    <p style="color:#94a3b8;font-size:12px;">Click any field on the canvas</p>
                </div>
                <div id="mf-field-props" style="display:none;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <span id="mf-prop-field-type-label" style="font-weight:600;font-size:14px;color:#334155;"></span>
                        <button type="button" id="mf-btn-delete-field" class="btn btn-outline-danger btn-sm" title="Delete Field"><i class="fas fa-trash"></i></button>
                    </div>

                    <%-- General --%>
                    <div class="mf-prop-group" id="mf-prop-general-group">
                        <h6><i class="fas fa-tag"></i> General</h6>
                        <div class="form-group"><label>Field Key</label><input type="text" id="mf-prop-key" class="form-control form-control-sm" /></div>
                        <div class="form-group"><label>Label</label><input type="text" id="mf-prop-label" class="form-control form-control-sm" /></div>
                        <div class="form-group"><label>Placeholder</label><input type="text" id="mf-prop-placeholder" class="form-control form-control-sm" /></div>
                        <div class="form-group"><label>Help Text</label><input type="text" id="mf-prop-helptext" class="form-control form-control-sm" /></div>
                        <div class="form-group"><label>Default Value</label><input type="text" id="mf-prop-default" class="form-control form-control-sm" /></div>
                        <div class="form-group"><label>CSS Class</label><input type="text" id="mf-prop-css" class="form-control form-control-sm" placeholder="Optional" /></div>
                        <div class="form-group"><label>URL Prefill Param</label><input type="text" id="mf-prop-prefill" class="form-control form-control-sm" placeholder="e.g. email" /></div>
                        <div class="form-group">
                            <label>Width</label>
                            <select id="mf-prop-width" class="form-control form-control-sm">
                                <option value="100%">Full Width (100%)</option>
                                <option value="50%">Half (50%)</option>
                                <option value="33%">Third (33%)</option>
                                <option value="66%">Two-Thirds (66%)</option>
                                <option value="25%">Quarter (25%)</option>
                            </select>
                        </div>
                        <div class="form-check mb-2"><input type="checkbox" id="mf-prop-required" class="form-check-input" /><label class="form-check-label" for="mf-prop-required">Required</label></div>
                        <div class="form-check mb-2"><input type="checkbox" id="mf-prop-readonly" class="form-check-input" /><label class="form-check-label" for="mf-prop-readonly">Read Only</label></div>
                    </div>

                    <%-- Options (Select, Radio, Checkbox) --%>
                    <div class="mf-prop-group" id="mf-prop-options-group" style="display:none;">
                        <h6><i class="fas fa-list"></i> Options</h6>
                        <div id="mf-prop-options-list" class="mf-options-list"></div>
                        <button type="button" id="mf-add-option" class="btn btn-outline-primary btn-sm mt-2"><i class="fas fa-plus"></i> Add Option</button>
                    </div>

                    <%-- Validation --%>
                    <div class="mf-prop-group" id="mf-prop-validation-group" style="display:none;">
                        <h6><i class="fas fa-check-circle"></i> Validation</h6>
                        <div class="form-group"><label>Min Length</label><input type="number" id="mf-prop-minlength" class="form-control form-control-sm" /></div>
                        <div class="form-group"><label>Max Length</label><input type="number" id="mf-prop-maxlength" class="form-control form-control-sm" /></div>
                        <div class="form-group"><label>Min Value</label><input type="number" id="mf-prop-min" class="form-control form-control-sm" /></div>
                        <div class="form-group"><label>Max Value</label><input type="number" id="mf-prop-max" class="form-control form-control-sm" /></div>
                        <div class="form-group"><label>Pattern (Regex)</label><input type="text" id="mf-prop-pattern" class="form-control form-control-sm" /></div>
                        <div class="form-group"><label>Error Message</label><input type="text" id="mf-prop-custom-msg" class="form-control form-control-sm" /></div>
                    </div>

                    <%-- File Settings --%>
                    <div class="mf-prop-group" id="mf-prop-file-group" style="display:none;">
                        <h6><i class="fas fa-file"></i> File Settings</h6>
                        <div class="form-group"><label>Max Size (MB)</label><input type="number" id="mf-prop-file-maxsize" class="form-control form-control-sm" value="10" /></div>
                        <div class="form-group"><label>Max Files</label><input type="number" id="mf-prop-file-maxfiles" class="form-control form-control-sm" value="1" /></div>
                        <div class="form-group"><label>Allowed Extensions</label><input type="text" id="mf-prop-file-extensions" class="form-control form-control-sm" placeholder=".pdf, .doc, .jpg" /></div>
                    </div>

                    <%-- HTML/Section Content --%>
                    <div class="mf-prop-group" id="mf-prop-html-group" style="display:none;">
                        <h6><i class="fas fa-code"></i> Content</h6>
                        <div class="form-group"><label>Content</label><textarea id="mf-prop-html-content" class="form-control form-control-sm" rows="5"></textarea></div>
                    </div>

                    <%-- Widget-specific Properties (dynamically populated by JS) --%>
                    <div class="mf-prop-group" id="mf-prop-widget-group" style="display:none;">
                        <h6><i class="fas fa-puzzle-piece"></i> Widget Settings</h6>
                        <div id="mf-prop-widget-body"></div>
                    </div>

                    <%-- Conditional Logic --%>
                    <div class="mf-prop-group" id="mf-prop-condition-group">
                        <h6><i class="fas fa-code-branch"></i> Conditional Logic</h6>
                        <div class="form-check mb-2"><input type="checkbox" id="mf-prop-has-condition" class="form-check-input" /><label class="form-check-label" for="mf-prop-has-condition">Show this field only when...</label></div>
                        <div id="mf-condition-builder" style="display:none;">
                            <div id="mf-conditions-list"></div>
                            <button type="button" id="mf-add-condition" class="btn btn-sm btn-outline-secondary mt-1"><i class="fas fa-plus"></i> Add Rule</button>
                            <div class="form-group mt-2">
                                <label class="small">Match</label>
                                <select id="mf-condition-operator" class="form-control form-control-sm">
                                    <option value="And">ALL rules (AND)</option>
                                    <option value="Or">ANY rule (OR)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <%-- Page Break (for Section fields) --%>
                    <div class="mf-prop-group" id="mf-prop-pagebreak-group" style="display:none;">
                        <h6><i class="fas fa-columns"></i> Page Break</h6>
                        <div class="form-check"><input type="checkbox" id="mf-prop-pagebreak" class="form-check-input" /><label class="form-check-label" for="mf-prop-pagebreak">Start a new page/step here</label></div>
                    </div>

                    <%-- UniqueId Settings --%>
                    <div class="mf-prop-group" id="mf-prop-uniqueid-group" style="display:none;">
                        <h6><i class="fas fa-fingerprint"></i> Unique ID Settings</h6>
                        <p style="font-size:11px;color:#94a3b8;margin:0 0 10px;">
                            Auto-generated sequential ID on each submission. Configured server-side for atomicity.
                        </p>
                        <div class="mf-prop-row">
                            <label class="mf-prop-label">Prefix</label>
                            <input type="text" id="mf-prop-uid-prefix" class="mf-prop-input" placeholder="e.g. HD-, ORD-, KH-">
                        </div>
                        <div class="mf-prop-row">
                            <label class="mf-prop-label">Padding (digits)</label>
                            <select id="mf-prop-uid-padding" class="mf-prop-input">
                                <option value="3">3 → 001</option>
                                <option value="4">4 → 0001</option>
                                <option value="5" selected>5 → 00001</option>
                                <option value="6">6 → 000001</option>
                                <option value="7">7 → 0000001</option>
                                <option value="8">8 → 00000001</option>
                            </select>
                        </div>
                        <div class="mf-prop-row">
                            <label class="mf-prop-label">Starting Number</label>
                            <input type="number" id="mf-prop-uid-start" class="mf-prop-input" value="1" min="1" max="999999999">
                        </div>
                        <div class="mf-prop-row">
                            <label class="mf-prop-label">Suffix / Format</label>
                            <select id="mf-prop-uid-suffix" class="mf-prop-input">
                                <option value="none">None → HD-00001</option>
                                <option value="year">Year → HD-2026-00001</option>
                                <option value="yearmonth">Year-Month → HD-202602-00001</option>
                                <option value="date">Full Date → HD-20260223-00001</option>
                                <option value="random">Random → HD-00001-A7K2</option>
                            </select>
                        </div>
                        <div class="mf-prop-row" style="margin-top:8px;">
                            <label class="mf-prop-label">Preview</label>
                            <div id="mf-prop-uid-preview" style="font-family:monospace;font-size:15px;font-weight:700;color:#6366f1;padding:8px 12px;background:#f5f3ff;border:1px solid #e0e7ff;border-radius:6px;">00001</div>
                        </div>
                    </div>
                </div>
            </div>

            <%-- WIDGET TAB (separate from Field tab, shown only for plugin fields) --%>
            <div id="mf-tab-widget" class="mf-right-tab-content" style="display:none;">
                <div id="mf-widget-no-selection" class="mf-placeholder-text">
                    <i class="fas fa-puzzle-piece fa-2x" style="color:#cbd5e1;margin-bottom:12px;display:block;"></i>
                    <p style="color:#94a3b8;">Select a widget field to see its settings</p>
                </div>
                <div id="mf-widget-props" style="display:none;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                        <span id="mf-widget-type-label" style="font-weight:600;font-size:14px;color:#334155;"></span>
                    </div>
                    <div id="mf-widget-props-body"></div>
                </div>
            </div>

            <%-- SETTINGS TAB --%>
            <div id="mf-tab-settings" class="mf-right-tab-content" style="display:none;">
                <div class="mf-settings-scroll">
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-cog"></i> General</h6>
                        <div class="form-group"><label>Success Message</label><textarea id="mf-setting-success-msg" class="form-control form-control-sm" rows="2" placeholder="Thank you!"></textarea></div>
                        <div class="form-group"><label>Redirect URL</label><input type="url" id="mf-setting-redirect" class="form-control form-control-sm" placeholder="https://..." /></div>
                        <div class="form-check mb-2"><input type="checkbox" id="mf-setting-require-auth" class="form-check-input" /><label class="form-check-label">Require Login</label></div>
                        <div class="form-check mb-2"><input type="checkbox" id="mf-setting-save-resume" class="form-check-input" /><label class="form-check-label">Save & Continue</label></div>
                        <div class="form-check mb-2"><input type="checkbox" id="mf-setting-multi-page" class="form-check-input" /><label class="form-check-label">Multi-step Form</label></div>
                        <div id="mf-multipage-hint" style="display:none;margin:4px 0 0 24px"><small class="text-muted">Add Section fields and enable "Page Break" on them to create steps.</small></div>
                    </div>
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-envelope"></i> Notifications</h6>
                        <div class="form-group"><label>Admin Email</label><input type="email" id="mf-setting-notify-email" class="form-control form-control-sm" placeholder="admin@example.com" /></div>
                    </div>
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-plug"></i> Webhook</h6>
                        <div class="form-group"><label>Webhook URL</label><input type="url" id="mf-setting-webhook-url" class="form-control form-control-sm" placeholder="https://..." /></div>
                    </div>
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-palette"></i> Theme</h6>
                        <div class="form-group">
                            <label>Label Position</label>
                            <select id="mf-setting-label-pos" class="form-control form-control-sm">
                                <option value="top">Top</option><option value="left">Left</option><option value="floating">Floating</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <%-- VIEWS TAB (W3) --%>
            <div id="mf-tab-views" class="mf-right-tab-content" style="display:none;">
                <div class="mf-settings-scroll">
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-columns"></i> Form Views</h6>
                        <p style="font-size:11px;color:#94a3b8;margin:0 0 10px;">
                            Create different views for displaying form submissions.
                        </p>
                        <button type="button" id="mf-views-add-btn" class="mf-builder-btn" style="width:100%;background:#6366f1;color:#fff;border-color:#6366f1;margin-bottom:12px;">
                            <i class="fas fa-plus"></i> Add View
                        </button>
                        <div id="mf-views-list"></div>
                    </div>

                    <%-- Add/Edit View Panel --%>
                    <div id="mf-view-editor" style="display:none;">
                        <div class="mf-prop-group" style="border:2px solid #6366f1;border-radius:10px;padding:12px;">
                            <h6 id="mf-view-editor-title"><i class="fas fa-edit"></i> New View</h6>
                            <div class="mf-prop-row">
                                <label class="mf-prop-label">View Name</label>
                                <input type="text" id="mf-view-name" class="mf-prop-input" placeholder="e.g. Blog Cards">
                            </div>
                            <div class="mf-prop-row">
                                <label class="mf-prop-label">View Key (URL slug)</label>
                                <input type="text" id="mf-view-key" class="mf-prop-input" placeholder="e.g. blog-cards">
                            </div>
                            <div class="mf-prop-row">
                                <label class="mf-prop-label">View Type</label>
                                <select id="mf-view-type" class="mf-prop-input">
                                    <option value="list">📋 List (Table)</option>
                                    <option value="card">🃏 Card (Grid)</option>
                                    <option value="detail">📄 Detail (Single Record)</option>
                                </select>
                            </div>
                            <div class="mf-prop-row">
                                <label class="mf-prop-label"><input type="checkbox" id="mf-view-default"> Set as Default</label>
                            </div>

                            <%-- List Config --%>
                            <div id="mf-view-cfg-list">
                                <div class="mf-prop-row">
                                    <label class="mf-prop-label">Columns (select fields)</label>
                                    <div id="mf-view-columns" class="mf-checkbox-list"></div>
                                </div>
                                <div class="mf-prop-row">
                                    <label class="mf-prop-label">Page Size</label>
                                    <input type="number" id="mf-view-pagesize" class="mf-prop-input" value="20" min="5" max="100">
                                </div>
                                <div class="mf-prop-row">
                                    <label class="mf-prop-label">Sort By</label>
                                    <select id="mf-view-sortby" class="mf-prop-input">
                                        <option value="SubmittedOnUtc">Date Submitted</option>
                                        <option value="Status">Status</option>
                                    </select>
                                </div>
                            </div>

                            <%-- Card Config --%>
                            <div id="mf-view-cfg-card" style="display:none;">
                                <div class="mf-prop-row">
                                    <label class="mf-prop-label">Card Columns</label>
                                    <select id="mf-view-cardcols" class="mf-prop-input">
                                        <option value="2">2</option>
                                        <option value="3" selected>3</option>
                                        <option value="4">4</option>
                                    </select>
                                </div>
                                <div class="mf-prop-row">
                                    <label class="mf-prop-label">Title Field</label>
                                    <select id="mf-view-titlefield" class="mf-prop-input"></select>
                                </div>
                                <div class="mf-prop-row">
                                    <label class="mf-prop-label">Excerpt Field</label>
                                    <select id="mf-view-excerptfield" class="mf-prop-input"><option value="">(none)</option></select>
                                </div>
                                <div class="mf-prop-row">
                                    <label class="mf-prop-label">Image Field</label>
                                    <select id="mf-view-imagefield" class="mf-prop-input"><option value="">(none)</option></select>
                                </div>
                                <div class="mf-prop-row">
                                    <label class="mf-prop-label">Category Field</label>
                                    <select id="mf-view-catfield" class="mf-prop-input"><option value="">(none)</option></select>
                                </div>
                            </div>

                            <%-- Detail Config --%>
                            <div id="mf-view-cfg-detail" style="display:none;">
                                <div class="mf-prop-row">
                                    <label class="mf-prop-label">Visible Fields</label>
                                    <div id="mf-view-detail-fields" class="mf-checkbox-list"></div>
                                </div>
                            </div>

                            <%-- Custom HTML/CSS --%>
                            <div class="mf-prop-row" style="margin-top:8px;">
                                <label class="mf-prop-label"><input type="checkbox" id="mf-view-custom-toggle"> Use Custom HTML Template</label>
                            </div>
                            <div id="mf-view-custom-section" style="display:none;">
                                <div class="mf-prop-row">
                                    <label class="mf-prop-label">Custom HTML <span style="color:#94a3b8;">(use {{field_key}} for data)</span></label>
                                    <textarea id="mf-view-customhtml" class="mf-prop-input" rows="6" style="font-family:monospace;font-size:11px;"></textarea>
                                </div>
                                <div class="mf-prop-row">
                                    <label class="mf-prop-label">Custom CSS</label>
                                    <textarea id="mf-view-customcss" class="mf-prop-input" rows="4" style="font-family:monospace;font-size:11px;"></textarea>
                                </div>
                            </div>

                            <div style="display:flex;gap:8px;margin-top:12px;">
                                <button type="button" id="mf-view-save-btn" class="mf-builder-btn" style="flex:1;background:#059669;color:#fff;border-color:#059669;">
                                    <i class="fas fa-save"></i> Save View
                                </button>
                                <button type="button" id="mf-view-cancel-btn" class="mf-builder-btn" style="flex:1;">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="mf-prop-group" style="margin-top:16px;">
                        <h6><i class="fas fa-info-circle"></i> URL Format</h6>
                        <p style="font-size:11px;color:#94a3b8;line-height:1.6;">
                            <code>?view=list</code> — Table view<br>
                            <code>?view=card</code> — Card grid<br>
                            <code>?view=detail&amp;id=42</code> — Single record<br>
                            <code>?view=list&amp;vk=blog-cards</code> — Named view
                        </p>
                    </div>
                </div>
            </div>

            <%-- PERMISSIONS TAB (W4) --%>
            <div id="mf-tab-perms" class="mf-right-tab-content" style="display:none;">
                <div class="mf-settings-scroll">
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-lock"></i> Form Permissions</h6>
                        <p style="font-size:11px;color:#94a3b8;margin:0 0 10px;">
                            Control who can submit, view submissions, edit, and export data.
                        </p>
                    </div>

                    <%-- Permission Matrix --%>
                    <div class="mf-prop-group">
                        <h6>Submit</h6>
                        <div id="mf-perm-submit" class="mf-perm-section">
                            <label class="mf-perm-row"><input type="checkbox" data-perm="submit" data-role="All Users" checked> All Users (Anonymous)</label>
                            <label class="mf-perm-row"><input type="checkbox" data-perm="submit" data-role="Registered Users" checked> Registered Users</label>
                            <label class="mf-perm-row"><input type="checkbox" data-perm="submit" data-role="Subscribers"> Subscribers</label>
                            <label class="mf-perm-row"><input type="checkbox" data-perm="submit" data-role="Editors"> Editors</label>
                            <label class="mf-perm-row"><input type="checkbox" data-perm="submit" data-role="Administrators" checked> Administrators</label>
                        </div>
                    </div>
                    <div class="mf-prop-group">
                        <h6>View Submissions</h6>
                        <div id="mf-perm-view-submissions" class="mf-perm-section">
                            <label class="mf-perm-row"><input type="checkbox" data-perm="view_submissions" data-role="Editors" checked> Editors</label>
                            <label class="mf-perm-row"><input type="checkbox" data-perm="view_submissions" data-role="Managers"> Managers</label>
                            <label class="mf-perm-row"><input type="checkbox" data-perm="view_submissions" data-role="Administrators" checked> Administrators</label>
                        </div>
                    </div>
                    <div class="mf-prop-group">
                        <h6>Edit Submissions</h6>
                        <div id="mf-perm-edit" class="mf-perm-section">
                            <label class="mf-perm-row"><input type="checkbox" data-perm="edit" data-role="Editors" checked> Editors</label>
                            <label class="mf-perm-row"><input type="checkbox" data-perm="edit" data-role="Administrators" checked> Administrators</label>
                        </div>
                    </div>
                    <div class="mf-prop-group">
                        <h6>Delete Submissions</h6>
                        <div id="mf-perm-delete" class="mf-perm-section">
                            <label class="mf-perm-row"><input type="checkbox" data-perm="delete" data-role="Administrators" checked> Administrators</label>
                        </div>
                    </div>
                    <div class="mf-prop-group">
                        <h6>Export Data</h6>
                        <div id="mf-perm-export" class="mf-perm-section">
                            <label class="mf-perm-row"><input type="checkbox" data-perm="export" data-role="Managers"> Managers</label>
                            <label class="mf-perm-row"><input type="checkbox" data-perm="export" data-role="Administrators" checked> Administrators</label>
                        </div>
                    </div>

                    <%-- Custom Role --%>
                    <div class="mf-prop-group" style="border-top:2px solid #e2e8f0;padding-top:12px;">
                        <h6><i class="fas fa-user-plus"></i> Add Custom Role</h6>
                        <div style="display:flex;gap:6px;">
                            <input type="text" id="mf-perm-custom-role" class="mf-prop-input" placeholder="Role name" style="flex:1;">
                            <button type="button" id="mf-perm-add-role" class="mf-builder-btn" style="padding:4px 12px;">Add</button>
                        </div>
                    </div>

                    <div class="mf-prop-group" style="margin-top:12px;">
                        <button type="button" id="mf-perm-save-btn" class="mf-builder-btn" style="width:100%;background:#059669;color:#fff;border-color:#059669;">
                            <i class="fas fa-save"></i> Save Permissions
                        </button>
                        <div id="mf-perm-status" style="font-size:12px;margin-top:6px;text-align:center;"></div>
                    </div>
                </div>
            </div>

            <%-- HTML/CSS EDITOR TAB --%>
            <div id="mf-tab-html" class="mf-right-tab-content" style="display:none;">
                <div class="mf-settings-scroll">
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-magic"></i> Auto Generate</h6>
                        <p style="font-size:11px;color:#94a3b8;margin:0 0 8px;">
                            Generate HTML from your current fields, or use AI to create beautiful layouts.
                        </p>
                        <div style="display:flex;gap:8px;">
                            <button type="button" id="mf-html-generate-btn" class="mf-builder-btn" style="flex:1;background:#6366f1;color:#fff;border-color:#6366f1;">
                                <i class="fas fa-sync-alt"></i> Generate from Fields
                            </button>
                            <button type="button" id="mf-html-clear-btn" class="mf-builder-btn" style="flex:0 0 auto;background:#fff;color:#ef4444;border-color:#fca5a5;">
                                <i class="fas fa-times"></i> Clear
                            </button>
                        </div>
                    </div>
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-code"></i> Custom HTML</h6>
                        <p style="font-size:11px;color:#94a3b8;margin:0 0 6px;">
                            Use <code>{{field:key}}</code> to place fields. Templates use this for creative layouts.
                        </p>
                        <textarea id="mf-custom-html-editor" class="mf-code-editor" rows="12" spellcheck="false" placeholder="Paste template HTML or click Generate..."></textarea>
                    </div>
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-palette"></i> Custom CSS</h6>
                        <textarea id="mf-custom-css-editor" class="mf-code-editor" rows="8" spellcheck="false" placeholder=".mf-custom-wrap { max-width: 640px; }"></textarea>
                    </div>
                    <div class="mf-prop-group" style="padding-top:4px;">
                        <button type="button" id="mf-html-preview-btn" class="mf-builder-btn" style="width:100%;">
                            <i class="fas fa-eye"></i> Preview
                        </button>
                    </div>
                    <div class="mf-prop-group">
                        <h6 style="font-size:11px;color:#64748b;"><i class="fas fa-key"></i> Field Keys</h6>
                        <div id="mf-html-field-keys" style="font-size:11px;color:#94a3b8;line-height:1.8;word-break:break-all;"></div>
                    </div>
                </div>
            </div>

            <%-- ========== AI DESIGN TAB ========== --%>
            <div id="mf-tab-ai" class="mf-right-tab-content" style="display:none;">
                <div class="mf-settings-scroll">

                    <%-- HEADER --%>
                    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:12px;padding:14px 16px;margin-bottom:10px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="font-size:26px;">🤖</span>
                            <div>
                                <h6 style="color:#e2e8f0;margin:0;font-size:14px;font-weight:700;">AI Design Assistant</h6>
                                <p style="color:#94a3b8;font-size:11px;margin:2px 0 0;">Choose a style → Generate prompt → Paste into AI</p>
                            </div>
                        </div>
                    </div>

                    <%-- STEP 1: STYLE GALLERY --%>
                    <div class="mf-prop-group">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                            <span style="background:#6366f1;color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;">1</span>
                            <h6 style="margin:0;font-size:13px;color:#1e293b;">Choose Design Style</h6>
                        </div>
                        <div id="mf-ai-style-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;"></div>
                    </div>

                    <%-- STEP 2: GENERATE --%>
                    <div class="mf-prop-group">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                            <span style="background:#0ea5e9;color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;">2</span>
                            <h6 style="margin:0;font-size:13px;color:#1e293b;">Generate and Copy Prompt</h6>
                        </div>
                        <textarea id="mf-ai-prompt" class="mf-code-editor" rows="10" readonly style="background:#0f172a;color:#a5b4fc;cursor:text;font-size:11px;line-height:1.5;" placeholder="Select a style above, then click Generate..."></textarea>
                        <div style="display:flex;gap:6px;margin-top:6px;">
                            <button type="button" id="mf-ai-generate-prompt-btn" class="mf-builder-btn" style="flex:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;font-weight:600;">
                                <i class="fas fa-magic"></i> Generate
                            </button>
                            <button type="button" id="mf-copy-prompt-btn" class="mf-builder-btn" style="flex:1;background:#0f172a;color:#a5b4fc;border-color:#334155;font-weight:600;">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>

                    <%-- STEP 3: PASTE BACK --%>
                    <div class="mf-prop-group" style="border-top:2px solid #e2e8f0;padding-top:10px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                            <span style="background:#22c55e;color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;">3</span>
                            <h6 style="margin:0;font-size:13px;color:#1e293b;">Paste AI Result</h6>
                        </div>
                        <div style="font-size:11px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
                            <p style="margin:0 0 3px;">Paste HTML into <b>HTML tab</b> Custom HTML editor</p>
                            <p style="margin:0 0 3px;">Paste CSS into <b>HTML tab</b> Custom CSS editor</p>
                            <p style="margin:0;">Click <b>Preview</b> to check result</p>
                        </div>
                        <div style="display:flex;gap:6px;margin-top:8px;">
                            <button type="button" id="mf-ai-goto-html-btn" class="mf-builder-btn" style="flex:1;background:#22c55e;color:#fff;border-color:#22c55e;font-weight:600;">
                                <i class="fas fa-arrow-left"></i> Go to HTML Tab
                            </button>
                            <button type="button" id="mf-copy-html-btn" class="mf-builder-btn" style="flex:1;">
                                <i class="fas fa-copy"></i> Copy HTML+CSS
                            </button>
                        </div>
                    </div>

                </div>
            </div>

            <%-- EMBED TAB --%>
            <div id="mf-tab-embed" class="mf-right-tab-content" style="display:none;">
                <div class="mf-settings-scroll">

                    <% if (ViewModel.Form != null && ViewModel.Form.FormId > 0) { %>

                    <%-- JS EMBED --%>
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-js-square" style="color:#f7df1e"></i> JavaScript Embed (Recommended)</h6>
                        <p style="font-size:11px;color:#94a3b8;margin:0 0 8px;">
                            Paste this into any HTML page. Form loads dynamically with auto-styling.
                        </p>
                        <textarea id="mf-embed-js" class="mf-code-editor" rows="5" readonly style="font-size:11px;cursor:text;background:#0f172a;color:#a5b4fc;"><div id="megaform-<%= ViewModel.Form.FormId %>"></div>
<script src="<%= Request.Url.Scheme %>://<%= Request.Url.Authority %>/DesktopModules/MegaForm/Assets/js/megaform-embed.js"
        data-form-id="<%= ViewModel.Form.FormId %>"
        data-server="<%= Request.Url.Scheme %>://<%= Request.Url.Authority %>">
</script></textarea>
                        <button type="button" class="mf-builder-btn mf-copy-btn" data-target="mf-embed-js" style="width:100%;margin-top:6px;">
                            <i class="fas fa-copy"></i> Copy JS Code
                        </button>
                    </div>

                    <%-- IFRAME EMBED --%>
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-window-maximize"></i> iFrame Embed</h6>
                        <p style="font-size:11px;color:#94a3b8;margin:0 0 8px;">
                            For WordPress, Wix, Squarespace, or any site that doesn't allow JS.
                        </p>
                        <textarea id="mf-embed-iframe" class="mf-code-editor" rows="4" readonly style="font-size:11px;cursor:text;background:#0f172a;color:#a5b4fc;"><iframe src="<%= Request.Url.Scheme %>://<%= Request.Url.Authority %>/DesktopModules/MegaForm/Assets/embed.html?formId=<%= ViewModel.Form.FormId %>&server=<%= Request.Url.Scheme %>://<%= Request.Url.Authority %>"
        width="100%" height="600" frameborder="0"
        style="border:none;border-radius:12px;">
</iframe></textarea>
                        <button type="button" class="mf-builder-btn mf-copy-btn" data-target="mf-embed-iframe" style="width:100%;margin-top:6px;">
                            <i class="fas fa-copy"></i> Copy iFrame Code
                        </button>
                    </div>

                    <%-- API EMBED --%>
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-plug"></i> API Endpoint</h6>
                        <p style="font-size:11px;color:#94a3b8;margin:0 0 8px;">
                            For developers — fetch schema and render your own UI.
                        </p>
                        <textarea id="mf-embed-api" class="mf-code-editor" rows="7" readonly style="font-size:11px;cursor:text;background:#0f172a;color:#a5b4fc;">// GET form schema
fetch('<%= Request.Url.Scheme %>://<%= Request.Url.Authority %>/API/MegaForm/Form/Get?formId=<%= ViewModel.Form.FormId %>')
  .then(r => r.json())
  .then(data => console.log(data));

// POST submission
fetch('<%= Request.Url.Scheme %>://<%= Request.Url.Authority %>/API/MegaForm/Submit/Post', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({formId:<%= ViewModel.Form.FormId %>,data:{...}})
});</textarea>
                        <button type="button" class="mf-builder-btn mf-copy-btn" data-target="mf-embed-api" style="width:100%;margin-top:6px;">
                            <i class="fas fa-copy"></i> Copy API Code
                        </button>
                    </div>

                    <%-- DIRECT LINK --%>
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-link"></i> Direct Link</h6>
                        <input type="text" id="mf-embed-link" class="form-control form-control-sm" readonly
                            value="<%= Request.Url.Scheme %>://<%= Request.Url.Authority %>/DesktopModules/MegaForm/Assets/embed.html?formId=<%= ViewModel.Form.FormId %>&server=<%= Request.Url.Scheme %>://<%= Request.Url.Authority %>"
                            style="font-size:11px;cursor:text;" />
                        <button type="button" class="mf-builder-btn mf-copy-btn" data-target="mf-embed-link" style="width:100%;margin-top:6px;">
                            <i class="fas fa-copy"></i> Copy Link
                        </button>
                    </div>

                    <%-- AUTO-RESIZE SCRIPT --%>
                    <div class="mf-prop-group">
                        <h6><i class="fas fa-arrows-alt-v"></i> Auto-resize iFrame (optional)</h6>
                        <p style="font-size:11px;color:#94a3b8;margin:0 0 8px;">
                            Add this JS on the parent page to auto-resize the iframe height.
                        </p>
                        <textarea id="mf-embed-resize" class="mf-code-editor" rows="5" readonly style="font-size:11px;cursor:text;background:#0f172a;color:#a5b4fc;"><script>
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'megaform-resize') {
    var iframe = document.querySelector('iframe[src*="formId=<%= ViewModel.Form.FormId %>"]');
    if (iframe) iframe.style.height = e.data.height + 'px';
  }
});
</script></textarea>
                        <button type="button" class="mf-builder-btn mf-copy-btn" data-target="mf-embed-resize" style="width:100%;margin-top:6px;">
                            <i class="fas fa-copy"></i> Copy Resize Script
                        </button>
                    </div>

                    <% } else { %>
                    <div class="mf-prop-group" style="text-align:center;padding:32px 16px;">
                        <i class="fas fa-save fa-2x" style="color:#cbd5e1;margin-bottom:12px;display:block;"></i>
                        <p style="color:#94a3b8;font-size:13px;">Save your form first to get embed codes.</p>
                    </div>
                    <% } %>

                </div>
            </div>
        </div>
    </div>
    <% if (ViewModel.Stats != null && ViewModel.Form != null) { %>
    <div class="mf-stats-bar">
        <span><i class="fas fa-paper-plane"></i> <strong><%= ViewModel.Stats.TotalSubmissions %></strong> submissions</span>
        <span class="text-success"><i class="fas fa-check"></i> <strong><%= ViewModel.Stats.ValidSubmissions %></strong> valid</span>
        <span class="text-danger"><i class="fas fa-ban"></i> <strong><%= ViewModel.Stats.SpamSubmissions %></strong> spam</span>
        <% if (ViewModel.Stats.LastSubmission.HasValue) { %>
        <span><i class="fas fa-clock"></i> Last: <strong><%= ViewModel.Stats.LastSubmission.Value.ToString("MMM dd, yyyy HH:mm") %></strong></span>
        <% } %>
    </div>
    <% } %>
</div>

<%-- Hidden data --%>
<input type="hidden" id="mf-builder-module-id" value="<%= ViewModel.ModuleId %>" />
<input type="hidden" id="mf-builder-portal-id" value="<%= ViewModel.PortalId %>" />
<input type="hidden" id="mf-builder-tab-id" value="<%= ViewModel.TabId %>" />
<input type="hidden" id="mf-builder-form-id" value="<%= ViewModel.Form != null ? ViewModel.Form.FormId : 0 %>" />
<input type="hidden" id="mf-builder-api-url" value="<%= ViewModel.ApiBaseUrl %>" />
<input type="hidden" id="mf-builder-schema-json" value='<%= ViewModel.Form != null ? Server.HtmlEncode(ViewModel.Form.SchemaJson ?? "{}") : "{}" %>' />
<input type="hidden" id="mf-builder-settings-json" value='<%= ViewModel.Form != null ? Server.HtmlEncode(ViewModel.Form.SettingsJson ?? "{}") : "{}" %>' />

<%-- CSS & JS registered via ClientResourceManager in codebehind (loads in <head>) --%>
<%-- Plugin files auto-injected by server --%>
<%= RenderPluginTags() %>

<%-- Template Gallery JS (inline, only for new forms) --%>
<% if (isNew) { %>
<script type="text/javascript">
(function() {
    var tplData = [
        { id:'blank', name:'Blank Form', desc:'Start from scratch', cat:'all', icon:'➕', fields:0, colors:['#94a3b8','#cbd5e1'] },
        { id:'event-registration', name:'Event Registration', desc:'3-page attendee registration (15 fields)', cat:'events', icon:'🎟️', fields:15, badge:'multi-page', colors:['#7c3aed','#a78bfa'] },
        { id:'job-application', name:'Job Application', desc:'4-page hiring form with resume upload (18 fields)', cat:'hr', icon:'💼', fields:18, badge:'multi-page', colors:['#0369a1','#7dd3fc'] },
        { id:'customer-feedback', name:'Customer Feedback', desc:'Survey with rating and follow-up (10 fields)', cat:'survey', icon:'⭐', fields:10, colors:['#ca8a04','#fde047'] },
        { id:'contact-us', name:'Contact Us', desc:'Simple contact form with attachment (9 fields)', cat:'general', icon:'✉️', fields:9, colors:['#059669','#6ee7b7'] },
        { id:'patient-intake', name:'Patient Intake', desc:'3-page medical intake with signature (19 fields)', cat:'healthcare', icon:'🏥', fields:19, badge:'multi-page', colors:['#dc2626','#fca5a5'] }
    ];
    var selectedTpl = null;
    var grid = document.getElementById('mf-tpl-grid');
    var useBtn = document.getElementById('mf-tpl-use-btn');

    function renderGrid(cat) {
        var html = '';
        tplData.forEach(function(t) {
            if (cat && cat !== 'all' && t.cat !== cat && t.id !== 'blank') return;
            var bg = 'linear-gradient(135deg,' + t.colors[0] + ',' + t.colors[1] + ')';
            var isBlank = t.id === 'blank';
            var sel = selectedTpl === t.id ? ' selected' : '';
            var badge = t.badge ? '<span class="mf-tpl-badge mf-tpl-badge-' + t.badge + '">' + t.badge + '</span>' : '';
            if (isBlank) {
                html += '<div class="mf-tpl-card mf-tpl-start-blank' + sel + '" data-tpl="blank"><div class="mf-plus">+</div><span>Start from Scratch</span></div>';
            } else {
                html += '<div class="mf-tpl-card' + sel + '" data-tpl="' + t.id + '">';
                html += '<div class="mf-tpl-thumb" style="background:' + bg + ';">' + badge + '<span style="filter:drop-shadow(0 2px 8px rgba(0,0,0,.2));">' + t.icon + '</span></div>';
                html += '<div class="mf-tpl-info"><p class="mf-tpl-name">' + t.name + '</p><p class="mf-tpl-desc">' + t.desc + '</p>';
                html += '<div class="mf-tpl-fields">' + t.fields + ' fields</div></div></div>';
            }
        });
        grid.innerHTML = html;
        bindCards();
    }

    function bindCards() {
        grid.querySelectorAll('.mf-tpl-card').forEach(function(card) {
            card.addEventListener('click', function() {
                grid.querySelectorAll('.mf-tpl-card').forEach(function(c) { c.classList.remove('selected'); });
                card.classList.add('selected');
                selectedTpl = card.getAttribute('data-tpl');
                useBtn.disabled = false;
            });
        });
    }

    document.querySelectorAll('.mf-tpl-cat').forEach(function(cat) {
        cat.addEventListener('click', function() {
            document.querySelectorAll('.mf-tpl-cat').forEach(function(c) { c.classList.remove('active'); });
            cat.classList.add('active');
            renderGrid(cat.getAttribute('data-cat'));
        });
    });

    useBtn.addEventListener('click', function() {
        if (!selectedTpl) return;
        document.getElementById('mf-template-gallery').style.display = 'none';
        document.getElementById('mf-builder-app').style.display = '';
        if (typeof MegaFormBuilder !== 'undefined' && MegaFormBuilder.applyTemplate) {
            MegaFormBuilder.applyTemplate(selectedTpl);
        }
    });

    // ── W6: Load DB-backed templates ──
    (function loadDbTemplates() {
        var apiBase = '<%= ViewModel.ApiBaseUrl %>';
        var sf = $.ServicesFramework(<%= ViewModel.ModuleId %>);
        var xhr = new XMLHttpRequest();
        xhr.open('GET', apiBase + 'Templates/List', true);
        xhr.setRequestHeader('ModuleId', sf.getModuleId());
        xhr.setRequestHeader('TabId', sf.getTabId());
        xhr.setRequestHeader('RequestVerificationToken', sf.getAntiForgeryValue());
        xhr.onload = function() {
            if (xhr.status !== 200) return;
            try {
                var data = JSON.parse(xhr.responseText);
                var dbTemplates = data.templates || [];
                dbTemplates.forEach(function(t) {
                    tplData.push({
                        id: 'db:' + t.slug,
                        name: t.name,
                        desc: t.description || t.version || '',
                        cat: 'uploaded',
                        icon: t.icon || '📦',
                        fields: t.fieldCount,
                        badge: t.hasCustomJs ? 'custom' : null,
                        colors: ['#6b7280', '#9ca3af'],
                        dbSlug: t.slug
                    });
                });
                if (dbTemplates.length > 0) renderGrid('all');
            } catch(e) {}
        };
        xhr.send();
    })();

    // ── W6: Template ZIP Upload ──
    var uploadInput = document.getElementById('mf-tpl-upload');
    var uploadStatus = document.getElementById('mf-tpl-upload-status');
    if (uploadInput) {
        uploadInput.addEventListener('change', function() {
            var file = this.files[0];
            if (!file) return;
            if (!file.name.endsWith('.zip')) {
                uploadStatus.style.display = '';
                uploadStatus.innerHTML = '<span style="color:#ef4444;">❌ Only .zip files are allowed</span>';
                return;
            }
            uploadStatus.style.display = '';
            uploadStatus.innerHTML = '<span style="color:#6366f1;">⏳ Uploading & scanning...</span>';

            var formData = new FormData();
            formData.append('file', file);

            var apiBase = '<%= ViewModel.ApiBaseUrl %>';
            var sf = $.ServicesFramework(<%= ViewModel.ModuleId %>);
            var xhr = new XMLHttpRequest();
            xhr.open('POST', apiBase + 'Templates/Install', true);
            xhr.setRequestHeader('ModuleId', sf.getModuleId());
            xhr.setRequestHeader('TabId', sf.getTabId());
            xhr.setRequestHeader('RequestVerificationToken', sf.getAntiForgeryValue());
            xhr.onload = function() {
                try {
                    var res = JSON.parse(xhr.responseText);
                    if (xhr.status === 200 && res.success) {
                        uploadStatus.innerHTML = '<span style="color:#059669;">✅ Template "' + res.slug + '" installed! Reloading...</span>';
                        setTimeout(function() { location.reload(); }, 1200);
                    } else {
                        var err = res.error || 'Upload failed';
                        var violations = res.scanResult && res.scanResult.violations ? res.scanResult.violations : [];
                        var html = '<span style="color:#ef4444;">❌ ' + err + '</span>';
                        if (violations.length > 0) {
                            html += '<ul style="margin:8px 0;font-size:12px;color:#ef4444;">';
                            violations.forEach(function(v) {
                                html += '<li>Line ' + v.line + ': [' + v.category + '] ' + v.snippet + '</li>';
                            });
                            html += '</ul>';
                        }
                        uploadStatus.innerHTML = html;
                    }
                } catch(e) {
                    uploadStatus.innerHTML = '<span style="color:#ef4444;">❌ Upload error</span>';
                }
            };
            xhr.onerror = function() {
                uploadStatus.innerHTML = '<span style="color:#ef4444;">❌ Network error</span>';
            };
            xhr.send(formData);
            this.value = ''; // reset input
        });
    }

    renderGrid('all');
})();
</script>
<% } %>

<%-- Init Builder --%>
<script src="/DesktopModules/MegaForm/Assets/js/builder/megaform-builder-panels.js?v=10038"></script>
<script src="/DesktopModules/MegaForm/Assets/js/builder/megaform-builder-phase2.js?v=10038"></script>
<script type="text/javascript">
    var sf = $.ServicesFramework(<%= ModuleId %>);
    document.addEventListener('DOMContentLoaded', function () {
        if (typeof MegaFormBuilder !== 'undefined') {
            MegaFormBuilder.init({
                moduleId: <%= ViewModel.ModuleId %>,
                portalId: <%= ViewModel.PortalId %>,
                tabId: <%= ViewModel.TabId %>,
                formId: <%= ViewModel.Form != null ? ViewModel.Form.FormId : 0 %>,
                apiBaseUrl: '<%= ViewModel.ApiBaseUrl %>',
                servicesFramework: sf,
                existingSchema: document.getElementById('mf-builder-schema-json').value
            });
        }
    });
</script>
