// Live preview panel (right side). A faithful, lightweight mock of the form as configured —
// reflects theme color, fields, and multi-step. Not the real renderer (cheap to re-render).
import { WizardData, WizardField, themeMeta, fontStack, roundnessPx } from './types';
import { catalogLabel, catalogPreview } from './field-catalog';
import { h, icon } from './ui';

function fieldPreview(f: WizardField, radius: number): HTMLElement {
  const hint = catalogPreview(f.type);
  // Section / heading render without a field label/control.
  if (hint === 'section') return h('div', { style: 'display:flex;align-items:center;gap:8px;margin:14px 0 10px' }, [h('div', { style: 'flex:1;height:1px;background:#e2e8f0' }), h('span', { style: 'font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em' }, f.label || 'Section'), h('div', { style: 'flex:1;height:1px;background:#e2e8f0' })]);
  if (hint === 'html') return h('div', { style: 'font-size:14px;font-weight:800;margin:10px 0 8px;color:#334155' }, f.label || 'Heading');
  // Card / Section container — a bordered card with a sample field inside.
  if (hint === 'card') return h('div', { style: 'border:1px solid #e2e8f0;border-radius:12px;padding:12px 13px;margin-bottom:12px;box-shadow:0 1px 2px rgba(15,23,42,.05)' }, [
    h('div', { style: 'font-size:12px;font-weight:700;margin-bottom:8px' }, f.label || 'Card'),
    inputBox('Field inside card…', radius),
  ]);
  // Row / columns — N side-by-side column placeholders.
  if (hint === 'row' || hint === 'row3') {
    const n = hint === 'row3' ? 3 : 2;
    const cols: Array<Node> = [];
    for (let i = 0; i < n; i++) cols.push(inputBox('Column ' + (i + 1), radius));
    return h('div', { style: 'margin-bottom:12px' }, [
      f.label ? h('div', { style: 'font-size:12px;font-weight:600;margin-bottom:4px' }, f.label) : null,
      h('div', { style: 'display:flex;gap:8px' }, cols),
    ]);
  }

  const label = h('div', { style: 'font-size:12px;font-weight:600;margin-bottom:4px' }, [document.createTextNode(f.label || catalogLabel(f.type)), f.required ? h('span', { style: 'color:#ef4444' }, ' *') : null]);
  let control: HTMLElement;
  if (hint === 'textarea') control = h('div', { style: 'height:54px;border:1px solid #e2e8f0;border-radius:' + radius + 'px;background:#fff' });
  else if (hint === 'checkbox') control = h('div', { style: 'display:flex;align-items:center;gap:7px;font-size:12px;color:#94a3b8' }, [h('span', { style: 'width:16px;height:16px;border:1px solid #cbd5e1;border-radius:4px' }), document.createTextNode(f.label || 'Yes')]);
  else if (hint === 'rating') control = h('div', { style: 'color:#fbbf24;font-size:16px;letter-spacing:3px' }, '★★★★★');
  else if (hint === 'name') control = h('div', { style: 'display:flex;gap:8px' }, [inputBox('First', radius), inputBox('Last', radius)]);
  else if (hint === 'address') control = h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, [inputBox('Street address', radius), h('div', { style: 'display:flex;gap:8px' }, [inputBox('City', radius), inputBox('ZIP', radius)])]);
  else if (hint === 'file') control = h('div', { style: 'height:40px;border:1.5px dashed #cbd5e1;border-radius:' + radius + 'px;background:#fff;display:flex;align-items:center;justify-content:center;gap:7px;font-size:12px;color:#94a3b8' }, [icon('fa-paperclip'), document.createTextNode('Upload a file')]);
  else if (hint === 'signature') control = h('div', { style: 'height:48px;border:1px solid #e2e8f0;border-radius:' + radius + 'px;background:#fafbfc;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:18px;font-style:italic' }, 'Sign here');
  else if (hint === 'date') control = inputBox('mm / dd / yyyy', radius, true);
  else if (hint === 'chips') control = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' }, ['Option 1', 'Option 2', 'Option 3'].map(t => h('span', { style: 'font-size:11px;font-weight:600;background:#eef2ff;color:#6366f1;border-radius:999px;padding:4px 11px' }, t)));
  else if (hint === 'cards') control = h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, [
    { ic: 'fa-bolt', t: 'Fast track', m: 'Most popular' },
    { ic: 'fa-compass', t: 'Guided path', m: 'Recommended' },
    { ic: 'fa-seedling', t: 'Flexible plan', m: 'New' },
  ].map((o, i) => h('div', { style: 'display:flex;align-items:center;gap:11px;border:1px solid ' + (i === 0 ? '#6366f1' : '#e2e8f0') + ';border-radius:12px;padding:9px 11px' + (i === 0 ? ';box-shadow:0 0 0 3px rgba(99,102,241,.12)' : '') }, [
    h('span', { style: 'width:30px;height:30px;border-radius:9px;background:' + (i === 0 ? '#6366f1' : '#eef2ff') + ';color:' + (i === 0 ? '#fff' : '#6366f1') + ';display:flex;align-items:center;justify-content:center;flex:0 0 30px' }, [icon(o.ic)]),
    h('span', { style: 'flex:1;min-width:0' }, [h('span', { style: 'font-size:12px;font-weight:700;color:#334155;display:block' }, o.t), h('span', { style: 'font-size:10px;color:#94a3b8' }, o.m)]),
    i === 0 ? h('span', { style: 'color:#6366f1;font-weight:700' }, '✓') : null,
  ])));
  else control = inputBox(f.type === 'email' ? 'you@example.com' : 'Enter ' + (f.label || 'value').toLowerCase() + '…', radius, hint === 'choice');
  return h('div', { style: 'margin-bottom:12px' }, [label, control]);
}
function inputBox(ph: string, radius: number, caret?: boolean): HTMLElement {
  return h('div', { style: 'height:34px;border:1px solid #e2e8f0;border-radius:' + radius + 'px;background:#fff;display:flex;align-items:center;padding:0 10px;font-size:12px;color:#cbd5e1' }, [document.createTextNode(ph), caret ? h('span', { style: 'margin-left:auto' }, [icon('fa-chevron-down')]) : null]);
}

function premiumPreview(data: WizardData): HTMLElement {
  const t = data.templateRecord || {};
  const html = String((t.settings && t.settings.customHtml) || '');
  const steps = (html.match(/data-step\s*=/g) || []).length;
  const fieldCount = Array.isArray(data.premiumFields)
    ? data.premiumFields.filter((f: any) => f && f.type !== 'Section' && f.type !== 'Hidden').length
    : (t.fieldCount || 0);
  const access = data.accessLevel === 'authenticated' ? 'Members' : data.accessLevel === 'restricted' ? 'Invite' : 'Public';
  return h('div', null, [
    h('div', { class: 'lbl' }, [icon('fa-eye'), document.createTextNode('Live Preview')]),
    h('div', { class: 'mfw-phone' }, [
      h('div', { class: 'mfw-phone-bar' }, [h('i', { style: 'background:#f87171' }), h('i', { style: 'background:#fbbf24' }), h('i', { style: 'background:#34d399' }), h('span', { class: 'mfw-phone-url' }, 'forms.example.com/' + (t.slug || 'premium'))]),
      h('div', { class: 'mfw-phone-body', style: 'text-align:center;padding:28px 16px' }, [
        h('div', { style: 'width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:20px' }, [icon('fa-wand-magic-sparkles')]),
        h('div', { style: 'font-size:15px;font-weight:800;margin-bottom:4px' }, data.formName || t.title || 'Premium form'),
        h('div', { style: 'font-size:12px;color:#94a3b8;margin-bottom:14px' }, steps > 1 ? steps + '-step premium layout' : 'Premium single-page layout'),
        h('div', { style: 'display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#7c3aed;background:#f3e8ff;border-radius:99px;padding:5px 12px' }, [icon('fa-lock'), document.createTextNode('Custom design preserved')]),
      ]),
    ]),
    h('div', { class: 'mfw-summ' }, [
      summ(String(fieldCount), 'Fields'),
      summ(steps > 1 ? String(steps) : '1', steps > 1 ? 'Steps' : 'Page'),
      summ('Premium', 'Style'),
      summ(access, 'Access'),
    ]),
  ]);
}

export function renderPreview(data: WizardData): HTMLElement {
  if (data.templateIsPremium && data.templateRecord) return premiumPreview(data);
  const tm = themeMeta(data.theme);
  const primary = data.primaryColor || tm.colors[0];
  const radius = Math.min(roundnessPx(data.roundness), 24);
  const pages = data.isMultiStep ? data.formPages : null;
  const total = data.isMultiStep ? data.formPages.reduce((n, p) => n + p.fields.length, 0) : data.fields.length;
  const shownFields = pages ? (pages[0]?.fields || []) : data.fields;
  const slug = (data.formName || 'my-form').toLowerCase().replace(/\s+/g, '-');

  const body: Array<Node> = [];
  if (pages && pages.length > 1) {
    body.push(h('div', { style: 'display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:700;margin-bottom:6px' }, [h('span', { style: 'color:' + primary }, 'Step 1 of ' + pages.length), h('span', { style: 'color:#94a3b8' }, Math.round(100 / pages.length) + '%')]));
    body.push(h('div', { style: 'height:4px;border-radius:99px;background:#eef2f6;margin-bottom:10px;overflow:hidden' }, [h('i', { style: 'display:block;height:100%;width:' + (100 / pages.length) + '%;background:' + primary })]));
    body.push(h('div', { style: 'display:flex;gap:10px;border-bottom:1px solid #f1f5f9;margin-bottom:12px;font-size:11px' }, pages.map((p, i) => h('span', { style: 'padding-bottom:6px;font-weight:600;' + (i === 0 ? 'color:' + primary + ';border-bottom:2px solid ' + primary : 'color:#cbd5e1') }, p.title))));
  }
  body.push(h('div', { style: 'font-size:15px;font-weight:800;font-family:' + fontStack(data.fontStyle) + ';margin-bottom:2px' }, data.formName || 'Untitled Form'));
  if (pages) body.push(h('div', { style: 'font-size:12px;font-weight:700;color:#475569;margin:6px 0 10px' }, pages[0]?.title || ''));
  else if (data.formDescription) body.push(h('div', { style: 'font-size:12px;color:#94a3b8;margin-bottom:12px' }, data.formDescription));
  if (shownFields.length) shownFields.forEach(f => body.push(fieldPreview(f, radius)));
  else body.push(h('div', { style: 'text-align:center;color:#cbd5e1;font-size:12px;padding:24px 0' }, 'No fields yet'));
  body.push(h('button', { style: 'width:100%;height:38px;border:0;border-radius:' + radius + 'px;background:' + primary + ';color:#fff;font-weight:700;font-size:13px;margin-top:6px;cursor:default' }, pages && pages.length > 1 ? 'Next →' : 'Submit Form'));

  const access = data.accessLevel === 'authenticated' ? 'Members' : data.accessLevel === 'restricted' ? 'Invite' : 'Public';
  return h('div', null, [
    h('div', { class: 'lbl' }, [icon('fa-eye'), document.createTextNode('Live Preview')]),
    h('div', { class: 'mfw-phone' }, [
      h('div', { class: 'mfw-phone-bar' }, [h('i', { style: 'background:#f87171' }), h('i', { style: 'background:#fbbf24' }), h('i', { style: 'background:#34d399' }), h('span', { class: 'mfw-phone-url' }, 'forms.example.com/' + slug)]),
      h('div', { class: 'mfw-phone-body' }, body),
    ]),
    h('div', { class: 'mfw-summ' }, [
      summ(String(total), 'Fields'),
      summ(data.isMultiStep ? String(data.formPages.length) : (data.approvalEnabled ? String(data.approvalNodes.length) : '—'), data.isMultiStep ? 'Pages' : 'Approvals'),
      summ(themeMeta(data.theme).label, 'Theme'),
      summ(access, 'Access'),
    ]),
  ]);
}
function summ(value: string, label: string): HTMLElement {
  return h('div', { class: 'c' }, [h('b', null, value), h('span', null, label)]);
}
