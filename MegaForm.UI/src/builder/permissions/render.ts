// [PermissionsMatrix v20260502-09] Matrix-style editor (rows = principals,
// columns = permission types) replacing the rule-card editor. Mirrors the
// familiar Oqtane / DNN page-permissions matrix so admins can grant or
// revoke at a glance without filling out a form per rule.
//
// Data model unchanged — each checked cell maps to a PermissionRule with
// {permissionType, principalType, principalId, scope: defaultScope, isGranted: true}.
// Toggling a cell adds or removes the matching rule from state.rules. Rules
// with non-default scope or fieldRestrictions are PRESERVED untouched (the
// matrix only owns default-scope rules) and surfaced as a count below.
//
// Field restrictions / per-rule scope remain editable via the API; a future
// "Advanced rules" sub-panel can layer on top without reworking the matrix.

import { BUILDER_PERMISSIONS_BADGE } from './badge';
import type { PermissionCatalog, PermissionDefinition, PermissionPrincipal, PermissionRule, PermissionsEditorState } from './types';

function esc(value: any): string {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function principalIcon(p: PermissionPrincipal): string {
  if (p.isSpecial) return '<i class="fas fa-globe" style="color:#0ea5e9;width:14px"></i>';
  if (p.isRole) return '<i class="fas fa-users" style="color:#7c3aed;width:14px"></i>';
  if (p.isCurrentUser) return '<i class="fas fa-user-check" style="color:#16a34a;width:14px"></i>';
  return '<i class="fas fa-user" style="color:#64748b;width:14px"></i>';
}

function defaultScopeOf(catalog: PermissionCatalog | null, def: PermissionDefinition | null): string {
  if (def && def.supportsScope === true) {
    return String(def.defaultScope || 'all');
  }
  return 'all';
}

function isDefaultRule(rule: PermissionRule, def: PermissionDefinition | null): boolean {
  // Default-scope, no field restrictions → fully representable in the matrix.
  const restrictions = String(rule.fieldRestrictions || '').trim();
  if (restrictions && restrictions !== '{}' && restrictions !== '[]') return false;
  const scope = String(rule.scope || 'all').toLowerCase();
  const defaultScope = defaultScopeOf(null, def).toLowerCase();
  return scope === defaultScope;
}

function findCellRule(
  rules: PermissionRule[],
  catalog: PermissionCatalog | null,
  def: PermissionDefinition,
  p: PermissionPrincipal
): PermissionRule | null {
  for (const r of rules) {
    if (String(r.permissionType || '').toLowerCase() !== String(def.key || '').toLowerCase()) continue;
    if (String(r.principalType || '').toLowerCase() !== String(p.principalType || '').toLowerCase()) continue;
    if (String(r.principalId || '') !== String(p.principalId || '')) continue;
    if (!isDefaultRule(r, def)) continue;
    return r;
  }
  return null;
}

function renderHeaderRow(perms: PermissionDefinition[]): string {
  let html = '<tr><th class="mf-perm-mx-rowhead" scope="col" style="text-align:left;padding:10px 8px;background:#f1f5f9;border-bottom:2px solid #cbd5e1;position:sticky;top:0;left:0;z-index:2;font-weight:600;color:#0f172a;font-size:12px;letter-spacing:.02em">Role / User</th>';
  for (const def of perms) {
    const tip = def.description ? ' title="' + esc(def.description) + '"' : '';
    html += '<th scope="col"' + tip + ' style="padding:10px 6px;background:#f1f5f9;border-bottom:2px solid #cbd5e1;text-align:center;min-width:78px;font-weight:600;color:#0f172a;font-size:11px;letter-spacing:.02em;position:sticky;top:0;z-index:1">' + esc(def.label) + '</th>';
  }
  html += '</tr>';
  return html;
}

function renderGroupHeader(label: string, count: number, colspan: number): string {
  if (count <= 0) return '';
  return (
    '<tr><td colspan="' + colspan + '" style="padding:8px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#475569">' +
      esc(label) + ' · ' + String(count) +
    '</td></tr>'
  );
}

function renderPrincipalRow(
  p: PermissionPrincipal,
  perms: PermissionDefinition[],
  rules: PermissionRule[],
  catalog: PermissionCatalog
): string {
  let html = '<tr class="mf-perm-mx-row">';
  html += '<th scope="row" class="mf-perm-mx-rowhead" style="text-align:left;padding:8px 10px;border-bottom:1px solid #f1f5f9;background:#fff;position:sticky;left:0;z-index:1;font-weight:500;color:#0f172a;font-size:12px;white-space:nowrap;max-width:220px">';
  html += '<span style="display:inline-flex;align-items:center;gap:6px">' + principalIcon(p) + '<span>' + esc(p.displayName) + '</span></span>';
  if (p.description) {
    html += '<div style="font-size:10px;color:#94a3b8;font-weight:400;margin-top:2px">' + esc(p.description) + '</div>';
  }
  html += '</th>';
  for (const def of perms) {
    const cellRule = findCellRule(rules, catalog, def, p);
    const checked = !!(cellRule && cellRule.isGranted !== false);
    html += '<td style="padding:6px;text-align:center;border-bottom:1px solid #f1f5f9;background:#fff">' +
      '<label style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer;width:22px;height:22px;border-radius:4px;transition:background .15s">' +
        '<input type="checkbox" class="mf-perm-cell" ' +
          'data-perm="' + esc(def.key) + '" ' +
          'data-ptype="' + esc(p.principalType) + '" ' +
          'data-pid="' + esc(p.principalId) + '"' +
          (checked ? ' checked' : '') +
          ' style="width:16px;height:16px;cursor:pointer;accent-color:#16a34a" />' +
      '</label></td>';
  }
  html += '</tr>';
  return html;
}

function countAdvancedRules(catalog: PermissionCatalog, rules: PermissionRule[]): number {
  let n = 0;
  for (const r of rules) {
    const def = catalog.permissionTypes.find(d => d.key.toLowerCase() === String(r.permissionType || '').toLowerCase()) || null;
    if (!isDefaultRule(r, def)) n += 1;
  }
  return n;
}

function renderMatrix(catalog: PermissionCatalog, rules: PermissionRule[]): string {
  const perms = (catalog.permissionTypes || []).filter(d => d && d.key);
  const principals = (catalog.principals || []).filter(p => p && p.principalId);
  if (!perms.length || !principals.length) {
    return '<div style="padding:14px 12px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:12px">' +
      'Catalog is empty — no permission types or principals available.</div>';
  }

  const groups: { label: string; items: PermissionPrincipal[] }[] = [
    { label: 'Special',          items: principals.filter(p => p.isSpecial) },
    { label: 'Roles',            items: principals.filter(p => p.isRole) },
    { label: 'Users',            items: principals.filter(p => p.isUser) },
  ];

  const colspan = perms.length + 1;
  let html = '<div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff">' +
    '<table class="mf-perm-matrix" style="width:100%;border-collapse:collapse;font-size:12px">' +
      '<thead>' + renderHeaderRow(perms) + '</thead>' +
      '<tbody>';

  for (const g of groups) {
    if (!g.items.length) continue;
    html += renderGroupHeader(g.label, g.items.length, colspan);
    for (const p of g.items) {
      html += renderPrincipalRow(p, perms, rules, catalog);
    }
  }

  html += '</tbody></table></div>';

  const advanced = countAdvancedRules(catalog, rules);
  if (advanced > 0) {
    html += '<div style="margin-top:8px;padding:8px 10px;border:1px dashed #fbbf24;border-radius:8px;background:#fffbeb;font-size:11px;color:#92400e">' +
      '<i class="fas fa-info-circle"></i> ' + String(advanced) + ' advanced rule(s) preserved (custom scope or field restrictions). They are saved with the matrix changes but not editable here.' +
    '</div>';
  }

  return html;
}

// Kept for compat — init.ts still calls it when adding the very first rule
// (no longer needed in matrix view but harmless).
export function getDefaultRule(catalog: PermissionCatalog | null): PermissionRule {
  const firstPerm = catalog && catalog.permissionTypes && catalog.permissionTypes[0];
  const firstPrincipal = catalog && catalog.principals && catalog.principals[0];
  return {
    permissionId: 0,
    formId: catalog ? catalog.formId : 0,
    permissionType: firstPerm ? firstPerm.key : 'view',
    principalType: firstPrincipal ? firstPrincipal.principalType : 'special',
    principalId: firstPrincipal ? firstPrincipal.principalId : 'authenticated',
    roleName: firstPrincipal && firstPrincipal.isRole ? (firstPrincipal.roleName || firstPrincipal.principalId) : '',
    userId: firstPrincipal && firstPrincipal.isUser ? (firstPrincipal.userId || null) : null,
    scope: firstPerm && firstPerm.supportsScope ? (firstPerm.defaultScope || 'all') : 'all',
    isGranted: true,
    fieldRestrictions: ''
  };
}

export function renderPermissionsEditor(state: PermissionsEditorState): void {
  const empty = document.getElementById('mf-perm-empty');
  const editor = document.getElementById('mf-perm-editor');
  const note = document.getElementById('mf-perm-catalog-note');
  const rulesEl = document.getElementById('mf-perm-rules');
  const statusEl = document.getElementById('mf-perm-status');
  const saveBtn = document.getElementById('mf-perm-save-btn') as HTMLButtonElement | null;
  const addBtn = document.getElementById('mf-perm-add-rule') as HTMLButtonElement | null;

  if (!empty || !editor || !note || !rulesEl || !statusEl) return;

  // Matrix view doesn't need an "Add Rule" button — every cell is a rule.
  // Hide the legacy button so the toolbar is just [Save Access Rules].
  if (addBtn) addBtn.style.display = 'none';

  if (state.formId <= 0) {
    empty.style.display = '';
    empty.innerHTML = 'Save the form first to configure access rules.';
    editor.style.display = 'none';
    statusEl.textContent = '';
    return;
  }

  empty.style.display = 'none';
  editor.style.display = '';
  note.innerHTML = state.catalog
    ? 'Catalog: <strong>' + esc(state.catalog.badge || BUILDER_PERMISSIONS_BADGE) + '</strong> · ' +
      String((state.catalog.principals || []).length) + ' principals · ' +
      String((state.catalog.permissionTypes || []).length) + ' permissions · ' +
      'Tick a cell to grant, untick to revoke. Shared across Web, DNN, Oqtane.'
    : 'Loading canonical permission catalog…';

  if (!state.catalog) {
    rulesEl.innerHTML = '<div style="padding:12px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;font-size:12px;background:#f8fafc">Loading access matrix…</div>';
  } else {
    rulesEl.innerHTML = renderMatrix(state.catalog, state.rules);
  }

  if (saveBtn) saveBtn.disabled = state.saving || !state.catalog;

  statusEl.textContent = state.status || '';
  statusEl.style.color = state.statusTone === 'error'
    ? '#b91c1c'
    : state.statusTone === 'success'
      ? '#047857'
      : '#64748b';
}
