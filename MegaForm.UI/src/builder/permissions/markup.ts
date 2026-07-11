import { BUILDER_PERMISSIONS_BADGE } from './badge';

export function createPermissionsTab(): string {
  return (
    '<div id="mf-tab-perms" class="mf-right-tab-content" style="display:none">' +
      '<div class="mf-settings-scroll" data-mf-builder-permissions-badge="' + BUILDER_PERMISSIONS_BADGE + '">' +
        '<div class="mf-prop-group">' +
          '<h6 style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span><i class="fas fa-user-shield"></i> Permissions &amp; Access <span class="mf-submit-editor-badge">' + BUILDER_PERMISSIONS_BADGE + '</span></span>' +
            '<button type="button" id="mf-perm-popup-btn" class="mf-builder-btn" style="font-size:11px;padding:4px 10px;cursor:pointer" title="Open the full matrix in a large popup so no columns are clipped"><i class="fas fa-expand"></i> Expand</button>' +
          '</h6>' +
          '<p style="font-size:11px;color:#64748b;margin:0 0 12px">Shared canonical access rules for submit, inbox, approvals, and record actions across Web, DNN, and Oqtane. The matrix is wide — use <strong>Expand</strong> to see every column.</p>' +
          '<div id="mf-perm-empty" style="padding:14px 12px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:12px">Save the form first to configure access rules.</div>' +
          '<div id="mf-perm-editor" style="display:none">' +
            '<div id="mf-perm-catalog-note" style="font-size:11px;color:#64748b;margin:0 0 10px"></div>' +
            '<div id="mf-perm-rules" style="display:flex;flex-direction:column;gap:10px"></div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
              '<button type="button" id="mf-perm-add-rule" class="mf-builder-btn"><i class="fas fa-plus"></i> Add Rule</button>' +
              '<button type="button" id="mf-perm-save-btn" class="mf-builder-btn" style="background:#0f172a;color:#fff;border-color:#0f172a"><i class="fas fa-save"></i> Save Access Rules</button>' +
            '</div>' +
            '<div id="mf-perm-status" style="font-size:11px;color:#64748b;margin-top:8px"></div>' +
          '</div>' +
        '</div>' +
        '<div class="mf-prop-group" id="mf-perm-fieldvis-group" style="display:none">' +
          '<h6><i class="fas fa-eye"></i> Field visibility by role</h6>' +
          '<div id="mf-perm-fieldvis"></div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

