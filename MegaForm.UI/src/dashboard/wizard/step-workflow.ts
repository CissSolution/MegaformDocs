// Wizard step 3 — Workflow: approval chain (→ N Approval nodes in WorkflowJson).
// Approver role + "specific person" are populated from the REAL Oqtane/DNN site
// catalog (see principals.ts); the static APPROVAL_ROLES list is only the fallback
// when the catalog can't be loaded.
import { WizardData, SetFn, ApprovalNode, APPROVAL_ROLES } from './types';
import { h, icon, toggle } from './ui';
import { loadSiteCatalog, siteCatalog } from './principals';

let counter = 3000;
const nid = () => 'node-' + (++counter);
const TYPES: Array<{ id: ApprovalNode['type']; label: string; icon: string; color: string }> = [
  { id: 'approve', label: 'Approve', icon: 'fa-circle-check', color: '#16a34a' },
  { id: 'review', label: 'Review', icon: 'fa-eye', color: '#2563eb' },
  { id: 'notify', label: 'Notify', icon: 'fa-bell', color: '#d97706' },
];

export function renderWorkflow(data: WizardData, set: SetFn): HTMLElement {
  // Real site roles/users (cached). Kick off the load while idle/loading and repaint
  // this step when it lands so the dropdowns fill with live data.
  const cat = siteCatalog();
  if (cat.status === 'idle' || cat.status === 'loading') loadSiteCatalog(() => set({}, { rerender: true }));
  const hasRealRoles = cat.status === 'ok' && cat.roles.length > 0;
  const roleList = hasRealRoles ? cat.roles : APPROVAL_ROLES;
  const defaultRole = hasRealRoles ? cat.roles[0] : 'Direct Manager';
  const USERS_DATALIST = 'mfw-wf-users';

  const addNode = () => set({ approvalNodes: [...data.approvalNodes, { id: nid(), role: defaultRole, name: '', type: 'approve', required: true }] });
  const delNode = (id: string) => set({ approvalNodes: data.approvalNodes.filter(n => n.id !== id) });
  const upd = (id: string, patch: Partial<ApprovalNode>, rer = true) => { const n = data.approvalNodes.find(x => x.id === id); if (n) Object.assign(n, patch); set({}, { rerender: rer }); };

  // Role <select> — keeps an existing/custom value that isn't in the catalog.
  const roleSelect = (n: ApprovalNode): HTMLElement => {
    const opts = roleList.slice();
    if (n.role && opts.indexOf(n.role) < 0) opts.unshift(n.role);
    return h('select', { class: 'mfw-in', style: 'height:36px', onchange: (e: any) => upd(n.id, { role: e.target.value }, false) },
      opts.map(r => h('option', { value: r, selected: n.role === r ? 'selected' : null }, r)));
  };

  const catHint = cat.status === 'loading'
    ? h('div', { style: 'font-size:11px;color:#94a3b8;margin-bottom:6px;display:flex;align-items:center;gap:5px' }, [icon('fa-spinner fa-spin'), document.createTextNode('Loading site roles & users…')])
    : cat.status === 'ok'
      ? h('div', { style: 'font-size:11px;color:#16a34a;margin-bottom:6px;display:flex;align-items:center;gap:5px' }, [icon('fa-circle-check'), document.createTextNode(cat.roles.length + ' roles · ' + cat.users.length + ' users from this site')])
      : cat.status === 'error'
        ? h('div', { style: 'font-size:11px;color:#d97706;margin-bottom:6px;display:flex;align-items:center;gap:5px' }, [icon('fa-triangle-exclamation'), document.createTextNode('Site directory unavailable — using generic roles (map them in the builder later)')])
        : null;

  const usersDatalist = h('datalist', { id: USERS_DATALIST }, (cat.users || []).map(u => h('option', { value: u })));

  const enableRow = h('div', { class: 'mfw-card', style: 'display:flex;align-items:center;justify-content:space-between;background:#fafbfc;margin-bottom:18px' }, [
    h('div', null, [h('div', { style: 'font-size:14px;font-weight:700' }, 'Enable approval workflow'), h('div', { style: 'font-size:12px;color:#94a3b8' }, 'Submissions require approval before processing')]),
    toggle(data.approvalEnabled, (v) => set({ approvalEnabled: v })),
  ]);

  if (!data.approvalEnabled) {
    return h('div', null, [
      h('h2', null, 'Approval workflow'), h('p', { class: 'sub' }, 'Define who reviews and approves submissions.'), enableRow,
      h('div', { style: 'border:1.5px dashed #e2e8f0;border-radius:14px;padding:32px;text-align:center;color:#94a3b8' }, [
        h('div', { style: 'font-size:26px;margin-bottom:6px' }, [icon('fa-code-branch')]),
        h('div', { style: 'font-size:14px;font-weight:600' }, 'No approval required'),
        h('div', { style: 'font-size:12px;margin-top:2px' }, 'Submissions will be processed immediately'),
      ]),
    ]);
  }

  const chain = data.approvalNodes.length === 0
    ? h('button', { type: 'button', style: 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;border:1.5px dashed #cbd5e1;border-radius:14px;padding:28px;background:none;cursor:pointer;color:#94a3b8', onclick: addNode }, [h('span', { style: 'font-size:22px' }, [icon('fa-plus')]), document.createTextNode('Add your first approval step')])
    : h('div', null, data.approvalNodes.map((n, i) => h('div', { style: 'display:flex;gap:11px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:12px;margin-bottom:10px' }, [
        h('span', { style: 'width:32px;height:32px;border-radius:50%;border:2px solid #6366f1;background:#eef2ff;color:#6366f1;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex:0 0 32px' }, String(i + 1)),
        h('div', { style: 'flex:1;min-width:0' }, [
          h('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:8px' }, [
            ...TYPES.map(t => h('button', { type: 'button', style: 'display:flex;align-items:center;gap:4px;border:1px solid ' + (n.type === t.id ? t.color : '#e2e8f0') + ';border-radius:7px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;background:' + (n.type === t.id ? t.color + '14' : '#fff') + ';color:' + (n.type === t.id ? t.color : '#94a3b8'), onclick: () => upd(n.id, { type: t.id }) }, [icon(t.icon), document.createTextNode(t.label)])),
            h('label', { style: 'margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:#94a3b8' }, [document.createTextNode('Required'), toggle(n.required, () => upd(n.id, { required: !n.required }))]),
          ]),
          h('div', { class: 'mfw-grid', style: 'grid-template-columns:1fr 1fr' }, [
            roleSelect(n),
            h('input', { class: 'mfw-in', style: 'height:36px', list: USERS_DATALIST, placeholder: 'Specific person (optional)', value: n.name, oninput: (e: any) => upd(n.id, { name: e.target.value }, false) }),
          ]),
        ]),
        h('button', { type: 'button', title: 'Remove', style: 'border:0;background:none;color:#cbd5e1;cursor:pointer', onclick: () => delNode(n.id) }, [icon('fa-trash-can')]),
      ])));

  return h('div', null, [
    h('h2', null, 'Approval workflow'), h('p', { class: 'sub' }, 'Define who reviews and approves submissions.'), enableRow,
    h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' }, [
      h('div', { class: 'mfw-flbl', style: 'margin:0' }, 'Approval Chain'),
      h('button', { type: 'button', class: 'mfw-btn', style: 'padding:6px 12px;font-size:12px', onclick: addNode }, [icon('fa-plus'), document.createTextNode(' Add Step')]),
    ]),
    catHint,
    chain,
    usersDatalist,
    h('div', { class: 'mfw-card', style: 'background:#fafbfc;margin-top:16px' }, [
      h('div', { class: 'mfw-flbl', style: 'margin-bottom:10px' }, 'Options'),
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:9px 12px;margin-bottom:7px' }, [
        h('div', null, [h('div', { style: 'font-size:13px;font-weight:600' }, 'Notify submitter on status change'), h('div', { style: 'font-size:11px;color:#94a3b8' }, 'Email updates at each step')]),
        toggle(data.notifySubmitter, (v) => set({ notifySubmitter: v })),
      ]),
      h('div', { style: 'display:flex;align-items:center;gap:12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:9px 12px' }, [
        h('div', { style: 'flex:1' }, [h('div', { style: 'font-size:13px;font-weight:600' }, 'Deadline per step (days)'), h('div', { style: 'font-size:11px;color:#94a3b8' }, 'Auto-escalate if not reviewed in time')]),
        h('input', { type: 'number', class: 'mfw-in', style: 'width:64px;height:34px;text-align:center', value: data.deadlineDays, oninput: (e: any) => set({ deadlineDays: e.target.value }, { rerender: false }) }),
      ]),
    ]),
  ]);
}
