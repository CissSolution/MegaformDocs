// [FieldRoleVisibility v20260711] Per-field "who can see this field" editor for the Access tab.
//
// Writes a single role rule into each field's `showIf` (sourceType:"Role", condition:"In",
// value:"<csv roles>"). The server-side FormAccessProjection resolves that rule per visitor BEFORE
// the schema reaches the browser: it removes the field for a visitor lacking the role and strips the
// resolved role leaf for a visitor who has it. So this is real access control, not a CSS hide — and
// it does not depend on the client ever knowing the visitor's roles.
//
// It edits the builder schema in place (window.MegaFormBuilder.state.schema.fields) and marks the
// builder dirty, exactly like the AI field ops and inline-edit do; the change persists on the next
// form Save. Field-based showIf rules already on the field are preserved untouched — only the single
// Role leaf is owned here.

import type { PermissionCatalog, PermissionPrincipal } from './types';

const BADGE = 'field-role-visibility-B391';

interface FlatField {
  key: string;
  label: string;
  type: string;
}

function esc(value: any): string {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function getBuilder(): any {
  return (window as any).MegaFormBuilder || (window as any).MFB || null;
}

function getSchema(): any {
  const B = getBuilder();
  if (!B || !B.state) return null;
  const schema = B.state.schema || (B.state.form && B.state.form.schema);
  if (!schema || !Array.isArray(schema.fields)) return null;
  return schema;
}

// Layout containers hold other fields but never carry a value, so hiding them by role is meaningless
// (and would take their children with it). List only value fields.
const CONTAINER_TYPES = new Set(['row', 'column', 'columns']);

function flattenFields(fields: any[], out: FlatField[]): void {
  if (!Array.isArray(fields)) return;
  for (const f of fields) {
    if (!f || typeof f !== 'object') continue;
    const type = String(f.type || '').toLowerCase();
    if (CONTAINER_TYPES.has(type)) {
      const cols = f.columns || f.Columns;
      if (Array.isArray(cols)) for (const c of cols) flattenFields(c && (c.fields || c.Fields), out);
      continue;
    }
    const key = String(f.key || f.Key || '').trim();
    if (!key) continue;
    out.push({ key, label: String(f.label || f.Label || key), type });
  }
}

export function getFlatFields(): FlatField[] {
  const schema = getSchema();
  const out: FlatField[] = [];
  if (schema) flattenFields(schema.fields, out);
  return out;
}

function findFieldByKey(fields: any[], key: string): any {
  if (!Array.isArray(fields)) return null;
  for (const f of fields) {
    if (!f || typeof f !== 'object') continue;
    if (String(f.key || f.Key || '') === key) return f;
    const cols = f.columns || f.Columns;
    if (Array.isArray(cols)) {
      for (const c of cols) {
        const hit = findFieldByKey(c && (c.fields || c.Fields), key);
        if (hit) return hit;
      }
    }
  }
  return null;
}

function ruleList(showIf: any): any[] {
  if (!showIf || typeof showIf !== 'object') return [];
  if (Array.isArray(showIf.conditions)) return showIf.conditions;
  if (Array.isArray(showIf.Conditions)) return showIf.Conditions;
  if (Array.isArray(showIf.rules)) return showIf.rules;
  if (Array.isArray(showIf.Rules)) return showIf.Rules;
  return [];
}

function isRoleLeaf(rule: any): boolean {
  return rule && String(rule.sourceType || rule.SourceType || '').toLowerCase() === 'role';
}

function rolesFromCondition(cond: any): string[] {
  const roleLeaf = ruleList(cond).find(isRoleLeaf);
  if (!roleLeaf) return [];
  return String(roleLeaf.value || roleLeaf.Value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Roles a field is currently restricted to (empty = visible to everyone). */
export function readFieldRoles(field: any): string[] {
  return rolesFromCondition(field && field.showIf);
}

/** Roles for whom a field is read-only (empty = editable by everyone who can see it). */
export function readFieldReadOnlyRoles(field: any): string[] {
  return rolesFromCondition(field && (field.readOnlyIf || field.ReadOnlyIf));
}

/**
 * Sets the role restriction on a field. Empty roles clears it (visible to everyone) while leaving any
 * field-based showIf leaves intact; a non-empty list writes exactly one Role leaf combined with the
 * existing operator (default "And", so a role restriction and a field condition must both hold).
 */
export function writeFieldRoles(key: string, roles: string[]): boolean {
  const schema = getSchema();
  if (!schema) return false;
  const field = findFieldByKey(schema.fields, key);
  if (!field) return false;

  // Normalize onto the lower-case `showIf` / `rules` shape the renderer and Core both accept.
  let showIf = field.showIf || field.ShowIf || null;
  const nonRole = ruleList(showIf).filter(r => !isRoleLeaf(r));

  const cleanRoles = roles.map(r => r.trim()).filter(Boolean);
  if (!cleanRoles.length && !nonRole.length) {
    delete field.showIf;
    delete field.ShowIf;
    return true;
  }

  const rules = nonRole.slice();
  if (cleanRoles.length) {
    rules.push({ sourceType: 'Role', condition: 'In', value: cleanRoles.join(',') });
  }
  const operator = (showIf && (showIf.operator || showIf.Operator)) || 'And';
  field.showIf = { operator, rules };
  delete field.ShowIf;
  return true;
}

/**
 * Sets the read-only role restriction on a field via `readOnlyIf`. Empty roles clears it; a non-empty
 * list writes exactly one Role leaf. Independent of showIf visibility — a field can be visible to
 * everyone yet read-only for some roles.
 */
export function writeFieldReadOnlyRoles(key: string, roles: string[]): boolean {
  const schema = getSchema();
  if (!schema) return false;
  const field = findFieldByKey(schema.fields, key);
  if (!field) return false;

  const cleanRoles = roles.map(r => r.trim()).filter(Boolean);
  const existing = field.readOnlyIf || field.ReadOnlyIf || null;
  const nonRole = ruleList(existing).filter(r => !isRoleLeaf(r));

  if (!cleanRoles.length && !nonRole.length) {
    delete field.readOnlyIf;
    delete field.ReadOnlyIf;
    return true;
  }

  const rules = nonRole.slice();
  if (cleanRoles.length) rules.push({ sourceType: 'Role', condition: 'In', value: cleanRoles.join(',') });
  const operator = (existing && (existing.operator || existing.Operator)) || 'And';
  field.readOnlyIf = { operator, rules };
  delete field.ReadOnlyIf;
  return true;
}

function reRenderCanvas(): void {
  const B = getBuilder();
  if (!B) return;
  try {
    if (typeof B.callModule === 'function') B.callModule('canvas', 'render');
    else if (B.canvas && typeof B.canvas.render === 'function') B.canvas.render();
  } catch (_e) { /* ignore */ }
  try { if (B.state) B.state.isDirty = true; } catch (_e) { /* ignore */ }
}

function roleprincipals(catalog: PermissionCatalog | null): PermissionPrincipal[] {
  return ((catalog && catalog.principals) || []).filter(p => p && p.isRole && p.roleName);
}

// Renders one row of role toggle-chips. `cls` distinguishes visibility (mf-fvis-role) from read-only
// (mf-fvis-ro); `accent` colours the active state.
function chipSet(fkey: string, cls: string, selected: Set<string>, allRoles: PermissionPrincipal[], accent: string, activeBg: string): string {
  let chips = '';
  for (const p of allRoles) {
    const rn = String(p.roleName);
    const on = selected.has(rn);
    chips += '<label style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border:1px solid ' +
      (on ? accent : '#e2e8f0') + ';border-radius:999px;background:' + (on ? activeBg : '#fff') +
      ';font-size:11px;cursor:pointer;margin:2px">' +
      '<input type="checkbox" class="' + cls + '" data-fkey="' + esc(fkey) + '" data-role="' + esc(rn) + '"' +
      (on ? ' checked' : '') + ' style="width:13px;height:13px;accent-color:' + accent + '" />' +
      esc(p.displayName || rn) + '</label>';
  }
  return chips;
}

function fieldRow(f: FlatField, allRoles: PermissionPrincipal[]): string {
  const field = findFieldByKey((getSchema() || {}).fields || [], f.key);
  const visRoles = new Set(readFieldRoles(field));
  const roRoles = new Set(readFieldReadOnlyRoles(field));

  const visSummary = visRoles.size === 0
    ? '<span style="color:#16a34a">Everyone</span>'
    : '<span style="color:#7c3aed">' + esc(visRoles.size) + ' role' + (visRoles.size > 1 ? 's' : '') + '</span>';
  const roSummary = roRoles.size === 0
    ? '<span style="color:#64748b">No one (editable)</span>'
    : '<span style="color:#b45309">' + esc(roRoles.size) + ' role' + (roRoles.size > 1 ? 's' : '') + '</span>';

  return '<tr style="border-bottom:1px solid #f1f5f9">' +
    '<td style="padding:8px 10px;font-size:12px;color:#0f172a;white-space:nowrap;vertical-align:top">' +
      esc(f.label) + '<div style="font-size:10px;color:#94a3b8">' + esc(f.key) + '</div></td>' +
    '<td style="padding:8px 10px;vertical-align:top">' +
      '<div style="font-size:11px;margin-bottom:3px">Visible to: ' + visSummary + '</div>' +
      '<div style="margin-bottom:8px">' + chipSet(f.key, 'mf-fvis-role', visRoles, allRoles, '#7c3aed', '#f5f3ff') + '</div>' +
      '<div style="font-size:11px;margin-bottom:3px;border-top:1px dashed #f1f5f9;padding-top:6px">Read-only for: ' + roSummary + '</div>' +
      '<div>' + chipSet(f.key, 'mf-fvis-ro', roRoles, allRoles, '#d97706', '#fffbeb') + '</div></td>' +
    '</tr>';
}

export function renderFieldVisibility(catalog: PermissionCatalog | null): void {
  const host = document.getElementById('mf-perm-fieldvis');
  if (!host) return;

  const fields = getFlatFields();
  const allRoles = roleprincipals(catalog);

  if (!fields.length) {
    host.innerHTML = '<div style="padding:10px 12px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc;color:#64748b;font-size:12px">Add fields to the form to control their visibility by role.</div>';
    return;
  }
  if (!allRoles.length) {
    host.innerHTML = '<div style="padding:10px 12px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc;color:#64748b;font-size:12px">No roles available in this site to restrict fields to.</div>';
    return;
  }

  let rows = '';
  for (const f of fields) rows += fieldRow(f, allRoles);

  host.innerHTML =
    '<div style="font-size:11px;color:#64748b;margin:0 0 8px">' +
      '<strong>Visible to</strong>: tick roles that may see the field (untick all = everyone). ' +
      '<strong>Read-only for</strong>: tick roles that may see but not edit it. Both are enforced server-side — ' +
      'a hidden field is never sent, a read-only field cannot be written on submit. ' +
      '<span style="color:#92400e">Applies when you Save the form.</span>' +
    '</div>' +
    '<div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff">' +
      '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr style="background:#f1f5f9">' +
          '<th style="text-align:left;padding:8px 10px;font-size:11px;color:#0f172a">Field</th>' +
          '<th style="text-align:left;padding:8px 10px;font-size:11px;color:#0f172a">Role access</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

/** Handles a visibility or read-only role-chip toggle. Returns true if it consumed the event. */
export function handleFieldVisibilityChange(target: HTMLElement, catalog: PermissionCatalog | null): boolean {
  const input = target as HTMLInputElement;
  if (!input || input.type !== 'checkbox') return false;
  const isVis = input.classList.contains('mf-fvis-role');
  const isRo = input.classList.contains('mf-fvis-ro');
  if (!isVis && !isRo) return false;

  const fkey = String(input.getAttribute('data-fkey') || '');
  const role = String(input.getAttribute('data-role') || '');
  if (!fkey || !role) return true;

  const field = findFieldByKey((getSchema() || {}).fields || [], fkey);
  const current = new Set(isRo ? readFieldReadOnlyRoles(field) : readFieldRoles(field));
  if (input.checked) current.add(role); else current.delete(role);

  if (isRo) writeFieldReadOnlyRoles(fkey, Array.from(current));
  else writeFieldRoles(fkey, Array.from(current));

  reRenderCanvas();
  renderFieldVisibility(catalog);
  return true;
}

export { BADGE as FIELD_VISIBILITY_BADGE };
