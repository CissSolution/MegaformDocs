// Wizard step 4 — Design: theme preset, primary/accent, font, corner.
import { WizardData, SetFn, THEMES, FONT_STYLES, ROUNDNESS } from './types';
import { h } from './ui';

export function renderDesign(data: WizardData, set: SetFn): HTMLElement {
  return h('div', null, [
    h('h2', null, 'Design your form'),
    h('p', { class: 'sub' }, 'Choose colors, fonts and shape style.'),

    h('div', { class: 'mfw-flbl' }, 'Theme Preset'),
    h('div', { class: 'mfw-grid', style: 'grid-template-columns:repeat(4,1fr);margin-bottom:20px' },
      THEMES.map(t => h('button', { type: 'button', class: 'mfw-pick' + (data.theme === t.id ? ' sel' : ''), style: 'padding:0;overflow:hidden', onclick: () => set({ theme: t.id, primaryColor: t.colors[0] }) }, [
        h('div', { style: 'display:flex;height:38px' }, t.colors.map(c => h('span', { style: 'flex:1;background:' + c }))),
        h('div', { style: 'padding:6px 9px;font-size:11px;font-weight:700;text-align:left' }, t.label),
      ]))
    ),

    h('div', { class: 'mfw-grid', style: 'grid-template-columns:1fr 1fr;margin-bottom:20px' }, [
      colorField('Primary Color', data.primaryColor, (v) => set({ primaryColor: v }, { rerender: false })),
      colorField('Accent Color', data.accentColor, (v) => set({ accentColor: v }, { rerender: false })),
    ]),

    h('div', { class: 'mfw-flbl' }, 'Font Style'),
    h('div', { class: 'mfw-grid', style: 'grid-template-columns:repeat(4,1fr);margin-bottom:20px' },
      FONT_STYLES.map(f => h('button', { type: 'button', class: 'mfw-pick' + (data.fontStyle === f.id ? ' sel' : ''), style: 'display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px', onclick: () => set({ fontStyle: f.id }) }, [
        h('span', { style: 'font-size:20px;font-weight:800;font-family:' + f.css }, 'Aa'),
        h('span', { style: 'font-size:10px;font-weight:600;color:#94a3b8' }, f.label),
      ]))
    ),

    h('div', { class: 'mfw-flbl' }, 'Corner Style'),
    h('div', { style: 'display:flex;gap:8px' },
      ROUNDNESS.map(r => h('button', { type: 'button', class: 'mfw-pick' + (data.roundness === r.id ? ' sel' : ''), style: 'flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:11px;border-radius:' + Math.min(r.px, 16) + 'px', onclick: () => set({ roundness: r.id }) }, [
        h('span', { style: 'width:30px;height:18px;border:2px solid ' + (data.roundness === r.id ? data.primaryColor : '#94a3b8') + ';border-radius:' + Math.min(r.px, 14) + 'px' }),
        h('span', { style: 'font-size:10px;font-weight:600;color:#94a3b8' }, r.label),
      ]))
    ),
  ]);
}

function colorField(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const txt = h('span', { style: 'font-size:12px;font-family:monospace;color:#94a3b8' }, value) as HTMLElement;
  const sw = h('span', { style: 'width:20px;height:20px;border-radius:6px;border:1px solid #e2e8f0;background:' + value }) as HTMLElement;
  return h('div', null, [
    h('label', { class: 'mfw-flbl' }, label),
    h('div', { style: 'display:flex;align-items:center;gap:9px;border:1px solid #e2e8f0;border-radius:11px;padding:8px 11px' }, [
      sw,
      h('input', { type: 'color', value, style: 'width:34px;height:26px;border:0;padding:0;background:none;cursor:pointer', oninput: (e: any) => { sw.style.background = e.target.value; txt.textContent = e.target.value; onChange(e.target.value); } }),
      txt,
    ]),
  ]);
}
