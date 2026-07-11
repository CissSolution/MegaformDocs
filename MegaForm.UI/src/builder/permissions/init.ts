import { fetchPermissionsCatalog, savePermissionsCatalog } from './api';
import { BUILDER_PERMISSIONS_BADGE } from './badge';
import { getPermissionsContext } from './context';
import { renderPermissionsEditor } from './render';
import { handleFieldVisibilityChange, renderFieldVisibility } from './field-visibility';
import { openAccessPopup } from './access-popup';
import type { PermissionCatalog, PermissionRule, PermissionsEditorState } from './types';

const state: PermissionsEditorState = {
  formId: 0,
  loadedFormId: 0,
  loading: false,
  saving: false,
  loaded: false,
  status: '',
  statusTone: 'muted',
  catalog: null,
  rules: []
};

function normalizeRule(catalog: PermissionCatalog | null, rule: PermissionRule): PermissionRule {
  const principalType = String(rule.principalType || 'special').toLowerCase();
  const principals = (catalog && catalog.principals ? catalog.principals : []).filter(function (item) {
    return item && String(item.principalType || '').toLowerCase() === principalType;
  });
  const principal = principals.find(function (item) { return item.principalId === rule.principalId; }) || principals[0] || null;
  const permissionType = String(rule.permissionType || 'view').toLowerCase();
  const definition = catalog && catalog.permissionTypes
    ? catalog.permissionTypes.find(function (item) { return item && item.key === permissionType; }) || null
    : null;
  const scope = definition && definition.supportsScope === true
    ? String(rule.scope || definition.defaultScope || 'all').toLowerCase()
    : 'all';

  return {
    permissionId: rule.permissionId || 0,
    formId: state.formId,
    permissionType: permissionType,
    principalType: principalType,
    principalId: principal ? principal.principalId : '',
    roleName: principal && principal.isRole ? (principal.roleName || principal.principalId) : '',
    userId: principal && principal.isUser ? (principal.userId || Number.parseInt(principal.principalId, 10) || null) : null,
    scope: scope,
    isGranted: rule.isGranted !== false,
    fieldRestrictions: rule.fieldRestrictions || ''
  };
}

function setStatus(message: string, tone: 'muted' | 'success' | 'error'): void {
  state.status = message;
  state.statusTone = tone;
  renderPermissionsEditor(state);
}

function render(): void {
  state.formId = getPermissionsContext().formId;
  renderPermissionsEditor(state);
  renderFieldVisibilitySection();
}

// The field-visibility table reads the live builder schema, so it is rendered separately from the
// permission matrix (which is driven by the catalog) and refreshed on every render pass.
function renderFieldVisibilitySection(): void {
  const group = document.getElementById('mf-perm-fieldvis-group');
  const show = state.formId > 0 && !!state.catalog;
  if (group) group.style.display = show ? '' : 'none';
  if (show) renderFieldVisibility(state.catalog);
}

async function ensureLoaded(force?: boolean): Promise<void> {
  const ctx = getPermissionsContext();
  state.formId = ctx.formId;

  if (ctx.formId <= 0) {
    state.catalog = null;
    state.rules = [];
    state.loaded = false;
    state.loadedFormId = 0;
    state.loading = false;
    state.saving = false;
    state.status = '';
    state.statusTone = 'muted';
    render();
    return;
  }

  if (!force && state.loaded && state.loadedFormId === ctx.formId && state.catalog) {
    render();
    return;
  }

  state.loading = true;
  setStatus('Loading access rules…', 'muted');

  try {
    const payload = await fetchPermissionsCatalog(ctx.formId);
    state.catalog = payload.catalog || null;
    state.rules = (payload.permissions || []).map(function (rule) { return normalizeRule(state.catalog, rule); });
    state.loaded = true;
    state.loadedFormId = ctx.formId;
    state.status = 'Canonical permissions ready · ' + BUILDER_PERMISSIONS_BADGE;
    state.statusTone = 'muted';
  } catch (error: any) {
    state.catalog = null;
    state.rules = [];
    state.loaded = false;
    state.loadedFormId = 0;
    state.status = (error && error.message) ? error.message : 'Could not load access rules.';
    state.statusTone = 'error';
  } finally {
    state.loading = false;
    render();
  }
}

// [PermissionsMatrix v20260502-09] Single matrix-cell toggle replaces the
// legacy per-rule edit/add/remove handlers. A toggle either appends a new
// default-scope grant rule or removes the matching one. Rules with custom
// scope or fieldRestrictions are PRESERVED — see render.ts isDefaultRule().
function findMatrixRuleIndex(perm: string, ptype: string, pid: string): number {
  const cat = state.catalog;
  if (!cat) return -1;
  const def = cat.permissionTypes.find(d => d && d.key && d.key.toLowerCase() === perm.toLowerCase()) || null;
  const defaultScope = (def && def.supportsScope === true) ? String(def.defaultScope || 'all') : 'all';
  for (let i = 0; i < state.rules.length; i += 1) {
    const r = state.rules[i];
    if (String(r.permissionType || '').toLowerCase() !== perm.toLowerCase()) continue;
    if (String(r.principalType || '').toLowerCase() !== ptype.toLowerCase()) continue;
    if (String(r.principalId || '') !== pid) continue;
    const restrictions = String(r.fieldRestrictions || '').trim();
    if (restrictions && restrictions !== '{}' && restrictions !== '[]') continue;  // advanced rule, preserve
    if (String(r.scope || 'all').toLowerCase() !== defaultScope.toLowerCase()) continue;
    return i;
  }
  return -1;
}

function toggleCell(perm: string, ptype: string, pid: string, checked: boolean): void {
  const cat = state.catalog;
  if (!cat) return;
  const existingIdx = findMatrixRuleIndex(perm, ptype, pid);
  if (checked) {
    if (existingIdx >= 0) {
      // Already granted — flip isGranted back to true if it was false.
      state.rules[existingIdx].isGranted = true;
      state.rules[existingIdx] = normalizeRule(cat, state.rules[existingIdx]);
    } else {
      const principal = (cat.principals || []).find(p => p && p.principalType === ptype && p.principalId === pid) || null;
      const def = cat.permissionTypes.find(d => d && d.key && d.key.toLowerCase() === perm.toLowerCase()) || null;
      state.rules.push(normalizeRule(cat, {
        permissionId: 0,
        formId: state.formId,
        permissionType: perm,
        principalType: ptype,
        principalId: pid,
        roleName: principal && principal.isRole ? (principal.roleName || principal.principalId) : '',
        userId: principal && principal.isUser ? (principal.userId || null) : null,
        scope: (def && def.supportsScope === true) ? String(def.defaultScope || 'all') : 'all',
        isGranted: true,
        fieldRestrictions: ''
      }));
    }
  } else if (existingIdx >= 0) {
    state.rules.splice(existingIdx, 1);
  }
  setStatus('Unsaved access changes.', 'muted');
  render();
}

// Legacy handlers kept exported (unused by matrix) so consumers calling them
// don't break. The matrix never invokes them.
function _legacyUpdateRuleField(_index: number, _field: string, _value: string): void { /* deprecated */ }
function _legacyRemoveRule(_index: number): void { /* deprecated */ }
function _legacyAddRule(): void { /* deprecated */ }

async function saveRules(): Promise<void> {
  if (!state.catalog || state.formId <= 0) return;
  state.saving = true;
  setStatus('Saving access rules…', 'muted');

  try {
    const payload = await savePermissionsCatalog(state.formId, state.rules.map(function (rule) {
      return normalizeRule(state.catalog, rule);
    }));
    const nextRules = (payload && (payload as any).permissions) || [];
    state.rules = nextRules.map(function (rule: PermissionRule) { return normalizeRule(state.catalog, rule); });
    state.loaded = true;
    state.loadedFormId = state.formId;
    state.status = 'Access rules saved.';
    state.statusTone = 'success';
  } catch (error: any) {
    state.status = (error && error.message) ? error.message : 'Could not save access rules.';
    state.statusTone = 'error';
  } finally {
    state.saving = false;
    render();
  }
}

// [PermissionsMatrix v20260502-09] Click → save; matrix-cell change → toggle.
function bindUi(): void {
  const tabLink = document.getElementById('mf-tab-link-perms');
  const panel = document.getElementById('mf-tab-perms');
  if (!tabLink || !panel) return;

  tabLink.addEventListener('click', function () {
    ensureLoaded(false);
  });

  // Bound on `document`, not the panel: the Expand popup MOVES the editor nodes to a body-level modal,
  // so their clicks/changes no longer bubble through #mf-tab-perms. The target checks below are specific
  // enough (permission-only classes / ids) that a document-level listener is safe.
  document.addEventListener('click', function (event) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('#mf-perm-popup-btn')) {
      event.preventDefault();
      openAccessPopup();
      return;
    }
    if (target.closest('#mf-perm-save-btn')) {
      event.preventDefault();
      saveRules();
    }
  });

  document.addEventListener('change', function (event) {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // Field-visibility role chips edit the schema directly (not the permission matrix).
    if (handleFieldVisibilityChange(target, state.catalog)) return;

    const cell = target as HTMLInputElement;
    if (cell.type !== 'checkbox' || !cell.classList.contains('mf-perm-cell')) return;
    const perm = String(cell.getAttribute('data-perm') || '');
    const ptype = String(cell.getAttribute('data-ptype') || '');
    const pid = String(cell.getAttribute('data-pid') || '');
    if (!perm || !ptype) return;
    toggleCell(perm, ptype, pid, cell.checked);
  });
}

function init(): void {
  bindUi();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};
