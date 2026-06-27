// [2026-06-27] Tiny DOM helpers + scoped stylesheet for the Form Creation Wizard.
// Keeps each step file small + readable (no Tailwind in the vanilla-TS product).

type Attrs = Record<string, any>;
export function h(tag: string, attrs?: Attrs | null, children?: Array<Node | string | null | undefined> | string): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') { for (const d of Object.keys(v)) el.setAttribute('data-' + d, String(v[d])); }
    else el.setAttribute(k, String(v));
  }
  if (typeof children === 'string') el.innerHTML = children;
  else if (children) for (const c of children) { if (c == null) continue; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  return el;
}

export const icon = (name: string, cls?: string): HTMLElement => h('i', { class: 'fas ' + name + (cls ? ' ' + cls : '') });

// A styled on/off toggle.
export function toggle(checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const t = h('button', { type: 'button', class: 'mfw-toggle' + (checked ? ' is-on' : ''), role: 'switch', 'aria-checked': String(checked) }, [h('span', { class: 'mfw-toggle-knob' })]);
  t.addEventListener('click', () => { onChange(!t.classList.contains('is-on')); });
  return t;
}

let cssInjected = false;
export function injectWizardCss(): void {
  if (cssInjected || document.getElementById('mfw-style')) { cssInjected = true; return; }
  cssInjected = true;
  const s = document.createElement('style');
  s.id = 'mfw-style';
  s.textContent = WIZARD_CSS;
  document.head.appendChild(s);
}

const WIZARD_CSS = `
#mf-wizard-root{position:fixed;inset:0;z-index:2147483600;background:#fff;display:flex;flex-direction:column;font-family:'Inter',system-ui,-apple-system,sans-serif;color:#0f172a;--mfw-p:#6366f1;--mfw-p2:#8b5cf6}
#mf-wizard-root *{box-sizing:border-box}
.mfw-top{height:56px;flex:0 0 56px;display:flex;align-items:center;gap:14px;padding:0 18px;border-bottom:1px solid #eef2f6}
.mfw-brand{display:flex;align-items:center;gap:10px;font-weight:700}
.mfw-brand .mfw-logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--mfw-p),var(--mfw-p2));color:#fff;display:flex;align-items:center;justify-content:center}
.mfw-brand small{display:block;font-weight:500;font-size:11px;color:#94a3b8}
.mfw-steps-top{display:flex;align-items:center;gap:6px;margin:0 auto;font-size:13px}
.mfw-steps-top .s{display:flex;align-items:center;gap:7px;padding:4px 8px;border-radius:8px;color:#94a3b8;font-weight:600;white-space:nowrap}
.mfw-steps-top .s.active{color:#0f172a}
.mfw-steps-top .s.done{color:#16a34a}
.mfw-steps-top .s .n{width:22px;height:22px;border-radius:50%;background:#e2e8f0;color:#64748b;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.mfw-steps-top .s.active .n{background:#0f172a;color:#fff}
.mfw-steps-top .s.done .n{background:#16a34a;color:#fff}
.mfw-steps-top .chev{color:#cbd5e1}
.mfw-cancel{margin-left:auto;color:#64748b;background:none;border:0;cursor:pointer;font-weight:600;font-size:14px}
.mfw-body{flex:1;display:flex;min-height:0;overflow:hidden}
.mfw-rail{width:230px;flex:0 0 230px;border-right:1px solid #eef2f6;padding:14px 12px;display:flex;flex-direction:column;gap:4px}
.mfw-rail .ri{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:12px;cursor:pointer;color:#64748b}
.mfw-rail .ri:hover{background:#f8fafc}
.mfw-rail .ri.active{background:#f1f5f9}
.mfw-rail .ri .ic{width:34px;height:34px;border-radius:10px;background:#f1f5f9;color:#94a3b8;display:flex;align-items:center;justify-content:center;flex:0 0 34px}
.mfw-rail .ri.active .ic{background:linear-gradient(135deg,var(--mfw-p),var(--mfw-p2));color:#fff}
.mfw-rail .ri.done .ic{background:#0f172a;color:#fff}
.mfw-rail .ri b{font-size:14px;color:#0f172a;display:block}
.mfw-rail .ri small{font-size:12px}
.mfw-rail .ri.active b{color:#0f172a}
.mfw-rail-foot{margin-top:auto;font-size:11px;color:#94a3b8}
.mfw-rail-prog{height:6px;background:#eef2f6;border-radius:99px;overflow:hidden;margin-top:6px}
.mfw-rail-prog i{display:block;height:100%;background:linear-gradient(90deg,var(--mfw-p),var(--mfw-p2));transition:width .3s}
.mfw-main{flex:1;min-width:0;overflow-y:auto;padding:28px 36px}
.mfw-main h2{font-size:22px;font-weight:800;margin:0}
.mfw-main .sub{color:#64748b;font-size:14px;margin:4px 0 22px}
.mfw-side{width:340px;flex:0 0 340px;border-left:1px solid #eef2f6;background:#fafbfc;padding:18px;overflow-y:auto}
.mfw-side .lbl{font-size:12px;font-weight:700;color:#94a3b8;display:flex;align-items:center;gap:7px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.03em}
.mfw-foot{height:64px;flex:0 0 64px;display:flex;align-items:center;gap:14px;padding:0 24px;border-top:1px solid #eef2f6}
.mfw-foot .dots{display:flex;gap:6px;margin:0 auto}
.mfw-foot .dots i{width:24px;height:5px;border-radius:99px;background:#e2e8f0}
.mfw-foot .dots i.on{background:#0f172a;width:34px}
/* controls */
.mfw-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:11px;border:1px solid #e2e8f0;background:#fff;font-weight:700;font-size:14px;cursor:pointer;color:#0f172a}
.mfw-btn:hover{background:#f8fafc}
.mfw-btn.primary{background:#0f172a;color:#fff;border-color:#0f172a}
.mfw-btn.primary:hover{background:#1e293b}
.mfw-btn.cta{background:linear-gradient(135deg,var(--mfw-p),var(--mfw-p2));border:0}
.mfw-btn:disabled{opacity:.5;cursor:not-allowed}
.mfw-in{width:100%;height:42px;border:1px solid #e2e8f0;border-radius:11px;padding:0 13px;font-size:14px;font-family:inherit;outline:none}
.mfw-in:focus{border-color:var(--mfw-p);box-shadow:0 0 0 3px rgba(99,102,241,.12)}
textarea.mfw-in{height:auto;padding:10px 13px;resize:vertical}
.mfw-flbl{font-size:13px;font-weight:600;margin-bottom:7px;display:block}
.mfw-req{color:#ef4444}
.mfw-grid{display:grid;gap:10px}
.mfw-toggle{width:42px;height:24px;border-radius:99px;border:0;background:#cbd5e1;position:relative;cursor:pointer;transition:background .2s;flex:0 0 42px}
.mfw-toggle.is-on{background:linear-gradient(135deg,var(--mfw-p),var(--mfw-p2))}
.mfw-toggle-knob{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.mfw-toggle.is-on .mfw-toggle-knob{left:21px}
.mfw-card{border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:14px}
.mfw-pick{border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:12px;cursor:pointer;text-align:left;transition:all .15s}
.mfw-pick:hover{border-color:#c7d2fe}
.mfw-pick.sel{border-color:var(--mfw-p);box-shadow:0 0 0 3px rgba(99,102,241,.15)}
.mfw-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:99px;background:linear-gradient(135deg,var(--mfw-p),var(--mfw-p2));color:#fff;font-weight:700;font-size:11px}
.mfw-badge{font-size:10px;font-weight:700;color:#16a34a;background:#dcfce7;padding:2px 7px;border-radius:6px}
/* preview phone */
.mfw-phone{border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.06)}
.mfw-phone-bar{display:flex;align-items:center;gap:5px;padding:9px 12px;border-bottom:1px solid #f1f5f9;background:#f8fafc}
.mfw-phone-bar i{width:9px;height:9px;border-radius:50%}
.mfw-phone-url{margin-left:8px;font-size:11px;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:2px 8px;flex:1}
.mfw-phone-body{padding:16px}
.mfw-summ{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.mfw-summ .c{border:1px solid #e2e8f0;border-radius:11px;padding:9px 11px;text-align:center}
.mfw-summ .c b{font-size:18px;display:block;color:#0f172a}
.mfw-summ .c span{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;font-weight:600}
`;
