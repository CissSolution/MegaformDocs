// Wizard step 5 — Publish: access level, response options, close date.
import { WizardData, SetFn } from './types';
import { h, icon, toggle } from './ui';

const ACCESS = [
  { id: 'public', label: 'Public', desc: 'Anyone with link', icon: 'fa-globe' },
  { id: 'authenticated', label: 'Members Only', desc: 'Logged-in users', icon: 'fa-users' },
  { id: 'restricted', label: 'Restricted', desc: 'Invite only', icon: 'fa-lock' },
] as const;

export function renderPublish(data: WizardData, set: SetFn): HTMLElement {
  const opts: Array<{ key: keyof WizardData; label: string; desc: string }> = [
    { key: 'allowAnonymous', label: 'Allow anonymous submissions', desc: 'No login required' },
    { key: 'collectEmail', label: 'Collect email addresses', desc: 'Auto-add an email field' },
    { key: 'limitOneResponse', label: 'One response per person', desc: 'Prevent duplicate submissions' },
  ];
  return h('div', null, [
    h('h2', null, 'Publish settings'),
    h('p', { class: 'sub' }, 'Configure access, sharing, and response limits.'),

    h('div', { class: 'mfw-flbl' }, 'Access Level'),
    h('div', { class: 'mfw-grid', style: 'grid-template-columns:repeat(3,1fr);margin-bottom:20px' },
      ACCESS.map(a => h('button', { type: 'button', class: 'mfw-pick' + (data.accessLevel === a.id ? ' sel' : ''), style: 'display:flex;flex-direction:column;gap:8px;align-items:flex-start;padding:13px', onclick: () => set({ accessLevel: a.id }) }, [
        h('span', { style: 'width:30px;height:30px;border-radius:9px;background:' + (data.accessLevel === a.id ? '#eef2ff' : '#f1f5f9') + ';color:' + (data.accessLevel === a.id ? '#6366f1' : '#94a3b8') + ';display:flex;align-items:center;justify-content:center' }, [icon(a.icon)]),
        h('span', null, [h('div', { style: 'font-size:13px;font-weight:700' }, a.label), h('div', { style: 'font-size:11px;color:#94a3b8' }, a.desc)]),
      ]))
    ),

    h('div', { class: 'mfw-card', style: 'background:#fafbfc;margin-bottom:20px' }, [
      h('div', { class: 'mfw-flbl', style: 'margin-bottom:10px' }, 'Response Options'),
      ...opts.map(o => h('div', { style: 'display:flex;align-items:center;justify-content:space-between;border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:9px 12px;margin-bottom:7px' }, [
        h('div', null, [h('div', { style: 'font-size:13px;font-weight:600' }, o.label), h('div', { style: 'font-size:11px;color:#94a3b8' }, o.desc)]),
        toggle(!!data[o.key], (v) => set({ [o.key]: v } as any)),
      ])),
    ]),

    h('div', null, [
      h('label', { class: 'mfw-flbl' }, [document.createTextNode('Close Date '), h('span', { style: 'font-weight:400;color:#94a3b8;text-transform:none' }, '(optional)')]),
      h('input', { type: 'date', class: 'mfw-in', value: data.closeDate, oninput: (e: any) => set({ closeDate: e.target.value }, { rerender: false }) }),
      h('div', { style: 'font-size:11px;color:#94a3b8;margin-top:6px' }, 'Form will stop accepting responses after this date.'),
    ]),
  ]);
}
