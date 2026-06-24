// wf-principal-picker.ts — chip-style multi-select for roles or users.
// Fetches the form's permission catalog (real DNN / Oqtane roles & users) and
// falls back to a freetext input on error so admins can always type custom
// values (e.g. a role that exists on the deployment target but not on the
// builder host).
//
// Badge: WFPrincipalPicker v20260516-05

import { normalizeApprovalList } from './wf-approval-config';
import { fetchPermissionsCatalog } from '../permissions/api';
import type { PermissionPrincipal, PermissionsCatalogResponse } from '../permissions/types';

export const WF_PRINCIPAL_PICKER_BADGE = 'WFPrincipalPicker v20260516-05';

interface PickerCacheEntry {
  promise: Promise<PermissionsCatalogResponse>;
  resolved?: PermissionsCatalogResponse;
  error?: any;
}

const _cache: { [formId: number]: PickerCacheEntry } = {};

function loadCatalog(formId: number): PickerCacheEntry {
  if (_cache[formId]) return _cache[formId];
  const entry: PickerCacheEntry = {
    promise: fetchPermissionsCatalog(formId)
      .then((res) => { entry.resolved = res; return res; })
      .catch((err) => { entry.error = err; throw err; })
  };
  _cache[formId] = entry;
  return entry;
}

export function invalidatePrincipalCache(formId?: number): void {
  if (formId == null) { for (const k in _cache) delete _cache[k]; return; }
  delete _cache[formId];
}

function filterPrincipals(principals: PermissionPrincipal[], kind: 'role' | 'user'): PermissionPrincipal[] {
  const list = (principals || []).filter((p) => {
    if (!p) return false;
    if (kind === 'role') return !!p.isRole;
    if (kind === 'user') return !!p.isUser;
    return false;
  });
  // sort: special/admin-ish roles first, then alphabetical
  list.sort((a, b) => {
    if (a.isSpecial && !b.isSpecial) return -1;
    if (!a.isSpecial && b.isSpecial) return 1;
    return (a.displayName || a.principalId || '').localeCompare(b.displayName || b.principalId || '');
  });
  return list;
}

function selectionKeyForPrincipal(p: PermissionPrincipal, kind: 'role' | 'user'): string {
  if (kind === 'role') {
    return String(p.roleName || p.principalId || p.displayName || '').trim();
  }
  // For users, store the displayName (or email-like principalId) — same convention as freetext today.
  return String(p.displayName || p.principalId || '').trim();
}

interface PickerProps {
  h: any;
  R: any;
  formId: number;
  kind: 'role' | 'user';
  value: string[] | string;
  onChange: (next: string[]) => void;
  placeholder?: string;
  label?: string;
  helpText?: string;
}

/**
 * Render a chip-style multi-select that combines a catalog dropdown with a
 * freetext input. Selected items are shown as removable chips; admins can
 * either pick from the dropdown or type a custom value and press Enter.
 */
export function renderPrincipalPicker(props: PickerProps): any {
  const h = props.h;
  const R = props.R;
  const formId = props.formId | 0;
  const selected = normalizeApprovalList(props.value);
  const dropdownPlaceholder = props.kind === 'role' ? '+ add role from site...' : '+ add user from site...';
  const customPlaceholder = props.placeholder
    || (props.kind === 'role' ? 'Or type a custom role name and press Enter' : 'Or type a custom user (email/login) and press Enter');

  const [principals, setPrincipals] = R.useState<PermissionPrincipal[]>([]);
  const [status, setStatus] = R.useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [customInput, setCustomInput] = R.useState<string>('');

  R.useEffect(() => {
    if (!formId) { setStatus('error'); return; }
    setStatus('loading');
    const entry = loadCatalog(formId);
    if (entry.resolved) {
      setPrincipals(filterPrincipals(entry.resolved.catalog.principals, props.kind));
      setStatus('ok');
      return;
    }
    entry.promise.then((res) => {
      setPrincipals(filterPrincipals(res.catalog.principals, props.kind));
      setStatus('ok');
    }).catch(() => {
      setStatus('error');
    });
  }, [formId, props.kind]);

  function commit(next: string[]) {
    // dedupe (case-insensitive) + trim
    const seen: { [k: string]: boolean } = {};
    const out: string[] = [];
    for (const v of next) {
      const t = String(v || '').trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(t);
    }
    props.onChange(out);
  }

  function addItem(value: string) {
    const t = String(value || '').trim();
    if (!t) return;
    commit(selected.concat([t]));
  }

  function removeItem(idx: number) {
    const next = selected.slice();
    next.splice(idx, 1);
    commit(next);
  }

  // Chips
  const chipNodes = selected.map((v, i) =>
    h('span', {
      key: 'chip-' + i,
      className: 'mf-wf-chip mf-wf-chip-' + props.kind,
      style: chipStyle(props.kind)
    },
      h('span', { style: { marginRight: 6 } }, v),
      h('button', {
        type: 'button',
        title: 'Remove',
        style: chipRemoveStyle(),
        onClick: function () { removeItem(i); }
      }, '×')
    )
  );

  // Dropdown of catalog principals (only those NOT already selected)
  const selectedLc: { [k: string]: boolean } = {};
  selected.forEach((s) => { selectedLc[String(s).toLowerCase()] = true; });
  const available = principals.filter((p) => {
    const k = selectionKeyForPrincipal(p, props.kind);
    return k && !selectedLc[k.toLowerCase()];
  });

  const dropdown = h('select', {
    className: 'mf-rf-cfg-input',
    value: '',
    disabled: status !== 'ok' || available.length === 0,
    style: { marginRight: 6, flex: '1 1 200px', minWidth: 0 },
    onChange: function (e: any) {
      const v = e.target.value;
      if (v) { addItem(v); e.target.value = ''; }
    }
  },
    h('option', { value: '' },
      status === 'loading' ? 'Loading site ' + props.kind + 's...' :
      status === 'error'   ? 'Site ' + props.kind + ' lookup unavailable — type below' :
      available.length === 0 ? 'All site ' + props.kind + 's added' :
      dropdownPlaceholder
    ),
    available.map((p) =>
      h('option', { key: p.principalId, value: selectionKeyForPrincipal(p, props.kind) },
        (p.displayName || p.principalId) + (p.isSpecial ? ' (built-in)' : '')
      )
    )
  );

  const customInputBox = h('input', {
    type: 'text',
    className: 'mf-rf-cfg-input',
    style: { flex: '1 1 220px', minWidth: 0 },
    placeholder: customPlaceholder,
    value: customInput,
    onChange: function (e: any) { setCustomInput(String(e.target.value || '')); },
    onKeyDown: function (e: any) {
      if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
        e.preventDefault();
        if (customInput.trim()) {
          addItem(customInput);
          setCustomInput('');
        }
      }
    },
    onBlur: function () {
      if (customInput.trim()) {
        addItem(customInput);
        setCustomInput('');
      }
    }
  });

  return h('div', { className: 'mf-wf-principal-picker', 'data-wf-picker-badge': WF_PRINCIPAL_PICKER_BADGE },
    h('div', { className: 'mf-wf-chip-row', style: chipRowStyle() }, chipNodes,
      selected.length === 0 ? h('span', { style: { color: '#94a3b8', fontSize: 12 } }, '(none)') : null
    ),
    h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 } },
      dropdown,
      customInputBox
    ),
    props.helpText ? h('div', { style: { fontSize: 11, color: '#64748b', marginTop: 4 } }, props.helpText) : null,
    status === 'error' ? h('div', { style: { fontSize: 11, color: '#b91c1c', marginTop: 4 } },
      'Could not load site ' + props.kind + ' list — using freetext only. Saved values still work.') : null
  );
}

function chipStyle(kind: 'role' | 'user'): any {
  const bg = kind === 'role' ? '#ede9fe' : '#dbeafe';
  const fg = kind === 'role' ? '#5b21b6' : '#1e40af';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    background: bg,
    color: fg,
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: 999,
    margin: '0 6px 6px 0'
  };
}

function chipRemoveStyle(): any {
  return {
    background: 'transparent',
    border: 0,
    color: 'inherit',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 0 0 2px',
    fontWeight: 700
  };
}

function chipRowStyle(): any {
  return { display: 'flex', flexWrap: 'wrap', alignItems: 'center', minHeight: 26 };
}
