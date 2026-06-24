/**
 * MegaForm Builder — Views Manager (W3) + Permissions Manager (W4)
 */
import { MegaFormBuilder } from './core';
(function () {
    'use strict';

    function useCanonicalPermissions() {
        return !!(window as any).__MF_CANONICAL_PERMISSIONS__;
    }

    // =========================================================
    //  W3: VIEWS MANAGER
    // =========================================================
    var viewsList = [];
    var editingViewId = 0;

    function getApiHeaders() {
        var sf = window.MegaFormBuilder && window.MegaFormBuilder._config
            ? window.MegaFormBuilder._config.servicesFramework : null;
        if (!sf) return {};
        // [v20260527-04] Drop TabId/ModuleId — see adapters/dnn.ts.
        // Server reads portalId from URL query string instead.
        return {
            'RequestVerificationToken': sf.getAntiForgeryValue(),
            'Content-Type': 'application/json'
        };
    }

    function getFormId() {
        return parseInt(document.getElementById('mf-builder-form-id').value) || 0;
    }

    function getApiBase() {
        return (document.getElementById('mf-builder-api-url') || {}).value || '/API/MegaForm/';
    }

    function getFieldList() {
        if (typeof MegaFormBuilder !== 'undefined' && MegaFormBuilder.getFieldList)
            return MegaFormBuilder.getFieldList();
        // Fallback: parse from schema
        try {
            var schemaStr = document.getElementById('mf-builder-schema-json').value;
            var schema = JSON.parse(schemaStr);
            return (schema.fields || []).filter(function (f) {
                return f.type !== 'Section' && f.type !== 'Html' && f.type !== 'Hidden';
            }).map(function (f) { return { key: f.key, label: f.label, type: f.type }; });
        } catch (e) { return []; }
    }

    function loadViews() {
        var formId = getFormId();
        if (!formId) return;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', getApiBase() + 'View/Config?formId=' + formId, true);
        var h = getApiHeaders();
        for (var k in h) xhr.setRequestHeader(k, h[k]);
        xhr.onload = function () {
            if (xhr.status === 200) {
                try {
                    viewsList = JSON.parse(xhr.responseText).views || [];
                    renderViewsList();
                } catch (e) { }
            }
        };
        xhr.send();
    }

    function renderViewsList() {
        var el = document.getElementById('mf-views-list');
        if (!el) return;
        if (viewsList.length === 0) {
            el.innerHTML = '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:12px;">No views configured yet.</p>';
            return;
        }
        var html = '';
        viewsList.forEach(function (v) {
            var icon = v.viewType === 'list' ? '📋' : v.viewType === 'card' ? '🃏' : '📄';
            html += '<div class="mf-view-item" data-view-id="' + v.viewId + '" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;cursor:pointer;">';
            html += '<span style="font-size:18px;">' + icon + '</span>';
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="font-size:13px;font-weight:600;color:#1e293b;">' + esc(v.viewName) + (v.isDefault ? ' <span style="color:#059669;">★</span>' : '') + '</div>';
            html += '<div style="font-size:11px;color:#94a3b8;">' + v.viewType + ' — /' + esc(v.viewKey) + '</div>';
            html += '</div>';
            html += '<button class="mf-view-edit-btn" data-view-id="' + v.viewId + '" style="background:none;border:none;cursor:pointer;color:#6366f1;font-size:13px;" title="Edit">✏️</button>';
            html += '<button class="mf-view-del-btn" data-view-id="' + v.viewId + '" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:13px;" title="Delete">🗑</button>';
            html += '</div>';
        });
        el.innerHTML = html;

        el.querySelectorAll('.mf-view-edit-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                editView(parseInt(this.dataset.viewId));
            });
        });
        el.querySelectorAll('.mf-view-del-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                deleteView(parseInt(this.dataset.viewId));
            });
        });
    }

    function showViewEditor(view) {
        editingViewId = view ? view.viewId : 0;
        var editor = document.getElementById('mf-view-editor');
        editor.style.display = '';
        document.getElementById('mf-view-editor-title').innerHTML =
            '<i class="fas fa-edit"></i> ' + (editingViewId ? 'Edit View' : 'New View');

        document.getElementById('mf-view-name').value = view ? view.viewName : '';
        document.getElementById('mf-view-key').value = view ? view.viewKey : '';
        document.getElementById('mf-view-type').value = view ? view.viewType : 'list';
        document.getElementById('mf-view-default').checked = view ? view.isDefault : false;

        var cfg = {};
        if (view && view.configJson) try { cfg = JSON.parse(view.configJson); } catch (e) { }

        document.getElementById('mf-view-pagesize').value = cfg.pageSize || 20;
        document.getElementById('mf-view-cardcols').value = cfg.cardColumns || 3;

        // Populate field selectors
        var fields = getFieldList();
        populateFieldCheckboxes('mf-view-columns', fields, cfg.columns);
        populateFieldCheckboxes('mf-view-detail-fields', fields, cfg.fields);
        populateFieldDropdowns(fields, cfg);

        // Custom HTML
        document.getElementById('mf-view-custom-toggle').checked = !!(view && view.customHtml);
        document.getElementById('mf-view-custom-section').style.display = (view && view.customHtml) ? '' : 'none';
        document.getElementById('mf-view-customhtml').value = (view && view.customHtml) || '';
        document.getElementById('mf-view-customcss').value = (view && view.customCss) || '';

        toggleViewTypeConfig(view ? view.viewType : 'list');
    }

    function populateFieldCheckboxes(containerId, fields, selectedKeys) {
        var el = document.getElementById(containerId);
        if (!el) return;
        selectedKeys = selectedKeys || [];
        el.innerHTML = fields.map(function (f) {
            var checked = selectedKeys.indexOf(f.key) >= 0 ? ' checked' : '';
            return '<label style="display:block;font-size:12px;margin:3px 0;"><input type="checkbox" value="' + esc(f.key) + '"' + checked + '> ' + esc(f.label) + ' <span style="color:#94a3b8;">(' + f.type + ')</span></label>';
        }).join('');
    }

    function populateFieldDropdowns(fields, cfg) {
        var ids = ['mf-view-titlefield', 'mf-view-excerptfield', 'mf-view-imagefield', 'mf-view-catfield', 'mf-view-sortby'];
        ids.forEach(function (id) {
            var dd = document.getElementById(id);
            if (!dd) return;
            var current = dd.value;
            // Keep first option if it exists (like "(none)")
            var firstOpt = dd.options.length > 0 && dd.options[0].value === '' ? '<option value="">(none)</option>' : '';
            if (id === 'mf-view-sortby') firstOpt = '<option value="SubmittedOnUtc">Date Submitted</option><option value="Status">Status</option>';
            dd.innerHTML = firstOpt;
            fields.forEach(function (f) {
                dd.innerHTML += '<option value="' + esc(f.key) + '">' + esc(f.label) + '</option>';
            });
        });
        // Set values from config
        if (cfg.titleField) setDropdown('mf-view-titlefield', cfg.titleField);
        if (cfg.excerptField) setDropdown('mf-view-excerptfield', cfg.excerptField);
        if (cfg.imageField) setDropdown('mf-view-imagefield', cfg.imageField);
        if (cfg.categoryField) setDropdown('mf-view-catfield', cfg.categoryField);
        if (cfg.sortBy) setDropdown('mf-view-sortby', cfg.sortBy);
    }

    function setDropdown(id, val) {
        var dd = document.getElementById(id);
        if (dd) {
            for (var i = 0; i < dd.options.length; i++) {
                if (dd.options[i].value === val) { dd.selectedIndex = i; break; }
            }
        }
    }

    function toggleViewTypeConfig(type) {
        document.getElementById('mf-view-cfg-list').style.display = type === 'list' ? '' : 'none';
        document.getElementById('mf-view-cfg-card').style.display = type === 'card' ? '' : 'none';
        document.getElementById('mf-view-cfg-detail').style.display = type === 'detail' ? '' : 'none';
    }

    function collectChecked(containerId) {
        var checkboxes = document.querySelectorAll('#' + containerId + ' input[type="checkbox"]:checked');
        var vals = [];
        for (var i = 0; i < checkboxes.length; i++) vals.push(checkboxes[i].value);
        return vals;
    }

    function saveView() {
        var type = document.getElementById('mf-view-type').value;
        var cfg = {};
        if (type === 'list') {
            cfg.columns = collectChecked('mf-view-columns');
            cfg.pageSize = parseInt(document.getElementById('mf-view-pagesize').value) || 20;
            cfg.sortBy = document.getElementById('mf-view-sortby').value;
        } else if (type === 'card') {
            cfg.cardColumns = parseInt(document.getElementById('mf-view-cardcols').value) || 3;
            cfg.titleField = document.getElementById('mf-view-titlefield').value;
            cfg.excerptField = document.getElementById('mf-view-excerptfield').value;
            cfg.imageField = document.getElementById('mf-view-imagefield').value;
            cfg.categoryField = document.getElementById('mf-view-catfield').value;
        } else if (type === 'detail') {
            cfg.fields = collectChecked('mf-view-detail-fields');
        }

        var view = {
            viewId: editingViewId,
            formId: getFormId(),
            viewKey: document.getElementById('mf-view-key').value.trim().replace(/[^a-z0-9\-]/gi, '-').toLowerCase() || 'view-' + Date.now(),
            viewType: type,
            viewName: document.getElementById('mf-view-name').value.trim() || 'Untitled View',
            isDefault: document.getElementById('mf-view-default').checked,
            sortOrder: 0,
            configJson: JSON.stringify(cfg),
            customHtml: document.getElementById('mf-view-custom-toggle').checked ? document.getElementById('mf-view-customhtml').value : null,
            customCss: document.getElementById('mf-view-custom-toggle').checked ? document.getElementById('mf-view-customcss').value : null
        };

        var xhr = new XMLHttpRequest();
        xhr.open('POST', getApiBase() + 'View/Save', true);
        var h = getApiHeaders();
        for (var k in h) xhr.setRequestHeader(k, h[k]);
        xhr.onload = function () {
            if (xhr.status === 200) {
                document.getElementById('mf-view-editor').style.display = 'none';
                loadViews();
            } else {
                alert('Save failed: ' + xhr.responseText);
            }
        };
        xhr.send(JSON.stringify(view));
    }

    function editView(viewId) {
        var view = viewsList.find(function (v) { return v.viewId === viewId; });
        if (view) showViewEditor(view);
    }

    function deleteView(viewId) {
        if (!confirm('Delete this view?')) return;
        var xhr = new XMLHttpRequest();
        xhr.open('POST', getApiBase() + 'View/Delete', true);
        var h = getApiHeaders();
        for (var k in h) xhr.setRequestHeader(k, h[k]);
        xhr.onload = function () { loadViews(); };
        xhr.send(JSON.stringify({ viewId: viewId }));
    }

    // =========================================================
    //  W4: PERMISSIONS MANAGER
    // =========================================================
    function loadPermissions() {
        var formId = getFormId();
        if (!formId) return;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', getApiBase() + 'Permissions/Get?formId=' + formId, true);
        var h = getApiHeaders();
        for (var k in h) xhr.setRequestHeader(k, h[k]);
        xhr.onload = function () {
            if (xhr.status === 200) {
                try {
                    var perms = JSON.parse(xhr.responseText).permissions || [];
                    applyPermissionsToUI(perms);
                } catch (e) { }
            }
        };
        xhr.send();
    }

    function applyPermissionsToUI(perms) {
        // Uncheck all first
        document.querySelectorAll('.mf-perm-section input[type="checkbox"]').forEach(function (cb) {
            cb.checked = false;
        });
        // Check matching
        perms.forEach(function (p) {
            if (!p.isGranted) return;
            var selector = '.mf-perm-section input[data-perm="' + p.permissionType + '"][data-role="' + p.principalId + '"]';
            var cb = document.querySelector(selector);
            if (cb) cb.checked = true;
        });
        // Always check Administrators
        document.querySelectorAll('.mf-perm-section input[data-role="Administrators"]').forEach(function (cb) {
            cb.checked = true;
        });
    }

    function collectPermissions() {
        var perms = [];
        document.querySelectorAll('.mf-perm-section input[type="checkbox"]:checked').forEach(function (cb) {
            perms.push({
                formId: getFormId(),
                permissionType: cb.dataset.perm,
                principalType: 'role',
                principalId: cb.dataset.role,
                isGranted: true
            });
        });
        return perms;
    }

    function savePermissions() {
        var formId = getFormId();
        if (!formId) { alert('Save the form first.'); return; }
        var perms = collectPermissions();
        var statusEl = document.getElementById('mf-perm-status');

        var xhr = new XMLHttpRequest();
        xhr.open('POST', getApiBase() + 'Permissions/Save', true);
        var h = getApiHeaders();
        for (var k in h) xhr.setRequestHeader(k, h[k]);
        xhr.onload = function () {
            if (xhr.status === 200) {
                statusEl.innerHTML = '<span style="color:#059669;">✅ Permissions saved!</span>';
                setTimeout(function () { statusEl.innerHTML = ''; }, 3000);
            } else {
                statusEl.innerHTML = '<span style="color:#ef4444;">❌ Save failed</span>';
            }
        };
        xhr.send(JSON.stringify({ formId: formId, permissions: perms }));
    }

    function addCustomRole() {
        var input = document.getElementById('mf-perm-custom-role');
        var role = input.value.trim();
        if (!role) return;
        input.value = '';

        // Add to each permission section
        var permTypes = ['submit', 'view_submissions', 'edit', 'delete', 'export'];
        permTypes.forEach(function (perm) {
            var sections = document.querySelectorAll('.mf-perm-section');
            sections.forEach(function (section) {
                // Check if already exists
                if (section.querySelector('input[data-role="' + role + '"]')) return;
                var label = document.createElement('label');
                label.className = 'mf-perm-row';
                label.innerHTML = '<input type="checkbox" data-perm="' + section.querySelector('input').dataset.perm + '" data-role="' + esc(role) + '"> ' + esc(role);
                section.appendChild(label);
            });
        });
    }

    // =========================================================
    //  INIT + EVENT BINDING
    // =========================================================
    function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

    function init() {
        // W3: Views
        var addBtn = document.getElementById('mf-views-add-btn');
        if (addBtn) addBtn.addEventListener('click', function () { showViewEditor(null); });

        var saveBtn = document.getElementById('mf-view-save-btn');
        if (saveBtn) saveBtn.addEventListener('click', saveView);

        var cancelBtn = document.getElementById('mf-view-cancel-btn');
        if (cancelBtn) cancelBtn.addEventListener('click', function () {
            document.getElementById('mf-view-editor').style.display = 'none';
        });

        var typeDD = document.getElementById('mf-view-type');
        if (typeDD) typeDD.addEventListener('change', function () { toggleViewTypeConfig(this.value); });

        var customToggle = document.getElementById('mf-view-custom-toggle');
        if (customToggle) customToggle.addEventListener('change', function () {
            document.getElementById('mf-view-custom-section').style.display = this.checked ? '' : 'none';
        });

        // Auto-generate viewKey from viewName
        var nameInput = document.getElementById('mf-view-name');
        if (nameInput) nameInput.addEventListener('input', function () {
            if (!editingViewId) {
                document.getElementById('mf-view-key').value = this.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            }
        });

        // W4: Permissions
        if (!useCanonicalPermissions()) {
            var permSaveBtn = document.getElementById('mf-perm-save-btn');
            if (permSaveBtn) permSaveBtn.addEventListener('click', savePermissions);

            var addRoleBtn = document.getElementById('mf-perm-add-role');
            if (addRoleBtn) addRoleBtn.addEventListener('click', addCustomRole);
        }

        // Load data when tabs are activated
        document.querySelectorAll('.mf-right-tab[data-tab="views"]').forEach(function (tab) {
            tab.addEventListener('click', function () { loadViews(); });
        });
        if (!useCanonicalPermissions()) {
            document.querySelectorAll('.mf-right-tab[data-tab="perms"]').forEach(function (tab) {
                tab.addEventListener('click', function () { loadPermissions(); });
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

export {};
