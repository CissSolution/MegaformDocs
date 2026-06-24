/**
 * MegaForm AI inline-edit overlay.
 *
 * Adapted (much simplified) from the ACME inline-edit pattern at
 * E:\CISS.SideMenu.Nuget_GPT\src\ai-client\src\inline-edit.ts. ACME edits raw
 * HtmlText modules between Oqtane anchors; MegaForm edits structured form
 * fields, so the surface is different: hover a rendered `.mf-field-group`,
 * click it, the AI bubble opens with a prefilled prompt and the field's
 * key + type in context.
 *
 * Activated by a small floating pencil button next to the AI bubble.
 * Auto-mounts when the page contains rendered MegaForm fields AND the user
 * is admin (`__MF_PLATFORM__.user.isAdmin === true`).
 */

import { t as i18nT } from '@i18n';

const INLINE_BADGE = 'MfAiInlineEdit v20260527-05';
const INLINE_STYLE_ID = 'mf-ai-inline-edit-css';
const INLINE_ROOT_ID = 'mf-ai-inline-root';

// [i18n] Localize the inline-edit toggle/banner/toasts (embedded → global → English).
function T(key: string, fallback: string): string {
  try { const v = i18nT(key); if (v && v !== key) return String(v); } catch { /* embedded n/a */ }
  try { const I = (window as any).MegaFormI18n; if (I && typeof I.t === 'function') { const v = I.t(key); if (v && v !== key) return String(v); } } catch { /* global n/a */ }
  return fallback;
}

function injectStyle(): void {
  if (document.getElementById(INLINE_STYLE_ID)) return;
  const css = `
.mf-ai-inline-pencil{position:fixed;right:24px;bottom:88px;z-index:99997;width:42px;height:42px;border-radius:21px;border:0;background:#fff;color:#4f46e5;font-size:16px;box-shadow:0 6px 16px rgba(15,23,42,.18);cursor:pointer;display:none;align-items:center;justify-content:center;border:1px solid #cbd5e1;}
.mf-ai-inline-pencil:hover{background:#eef2ff;}
.mf-ai-inline-pencil.is-active{background:#4f46e5;color:#fff;border-color:#4f46e5;box-shadow:0 8px 24px rgba(79,70,229,.35);}
.mf-ai-inline-pencil[data-mf-ai-visible="1"]{display:flex;}
.mf-ai-inline-banner{position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-align:center;padding:8px 14px;font:13px/1.4 system-ui,-apple-system,sans-serif;font-weight:600;z-index:99996;transform:translateY(-100%);transition:transform .25s;}
body.mf-ai-inline-mode .mf-ai-inline-banner{transform:translateY(0);}
body.mf-ai-inline-mode{padding-top:36px;}
body.mf-ai-inline-mode .mf-field-group[data-key]{outline:2px dashed rgba(79,70,229,.55);outline-offset:4px;cursor:pointer;transition:outline-color .12s ease,background .12s ease;border-radius:6px;}
body.mf-ai-inline-mode .mf-field-group[data-key]:hover{outline:2px solid #4f46e5;background:rgba(79,70,229,.05);}
body.mf-ai-inline-mode .mf-field-group[data-key].mf-ai-active{outline:3px solid #16a34a;background:rgba(22,163,74,.05);}
.mf-ai-inline-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:8px 16px;background:#0f172a;color:#fff;border-radius:8px;font-size:13px;z-index:99999;box-shadow:0 6px 16px rgba(0,0,0,.25);opacity:0;transition:opacity .15s;pointer-events:none;}
.mf-ai-inline-toast.show{opacity:1;}`;
  const tag = document.createElement('style');
  tag.id = INLINE_STYLE_ID;
  tag.textContent = css;
  document.head.appendChild(tag);
}

function showToast(message: string): void {
  let toast = document.querySelector('.mf-ai-inline-toast') as HTMLElement | null;
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'mf-ai-inline-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast?.classList.remove('show'), 1800);
}

function openChatWithPrompt(prefill: string): void {
  const panel = document.getElementById('mf-ai-panel') as HTMLElement | null;
  const input = document.getElementById('mf-ai-input') as HTMLTextAreaElement | null;
  if (panel) panel.style.display = 'flex';
  if (input) {
    const sep = input.value && !input.value.endsWith('\n') ? '\n' : '';
    input.value = sep + prefill;
    input.focus();
    try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* ignore */ }
  }
}

function findFieldsOnPage(): HTMLElement[] {
  const list = document.querySelectorAll('.mf-field-group[data-key]');
  return Array.prototype.slice.call(list) as HTMLElement[];
}

function describeField(el: HTMLElement): { key: string; type: string; label: string } {
  const key = String(el.getAttribute('data-key') || '');
  const type = String(el.getAttribute('data-type') || 'Field');
  const labelEl = el.querySelector('label, .mf-field-label, .mf-section-title');
  const label = labelEl ? String(labelEl.textContent || '').trim() : '';
  return { key, type, label };
}

function isAdminUser(): boolean {
  try {
    const pf = ((window as any).__MF_PLATFORM__ || {}) as any;
    const u = pf.user || {};
    if (u.isAdmin === true || u.IsAdmin === true) return true;
    if (u.isSuperUser === true || u.IsSuperUser === true) return true;
    if (Array.isArray(u.roles)) {
      return u.roles.some((r: any) => /Administrators|Host/.test(String(r)));
    }
    // Fallback: presence of the builder host shell signals admin context.
    return !!document.querySelector('[data-mf-builder], #mf-builder-root, [data-mf-dashboard], #mf-dashboard-root');
  } catch { return false; }
}

function buildToggle(): HTMLButtonElement {
  let btn = document.querySelector('.mf-ai-inline-pencil') as HTMLButtonElement | null;
  if (btn) return btn;
  btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mf-ai-inline-pencil';
  btn.title = T('ai.inline_toggle_tip', 'Edit form with AI (toggle inline mode)');
  btn.innerHTML = '<i class="fas fa-pen" aria-hidden="true"></i>';
  document.body.appendChild(btn);
  return btn;
}

function buildBanner(): HTMLElement {
  let el = document.querySelector('.mf-ai-inline-banner') as HTMLElement | null;
  if (el) return el;
  el = document.createElement('div');
  el.className = 'mf-ai-inline-banner';
  el.textContent = T('ai.inline_banner', 'AI Inline Edit — click any field to ask the AI to modify it. Click the pencil again to exit.');
  document.body.appendChild(el);
  return el;
}

function activate(toggle: HTMLButtonElement, banner: HTMLElement): void {
  document.body.classList.add('mf-ai-inline-mode');
  toggle.classList.add('is-active');
  banner.style.display = 'block';
  bindFields();
  showToast(T('ai.inline_on', 'Inline edit ON — click a field'));
}

function deactivate(toggle: HTMLButtonElement, banner: HTMLElement): void {
  document.body.classList.remove('mf-ai-inline-mode');
  toggle.classList.remove('is-active');
  banner.style.display = '';
  unbindFields();
  showToast(T('ai.inline_off', 'Inline edit OFF'));
}

let _bound: { el: HTMLElement; handler: EventListener }[] = [];

function fieldClickHandler(e: Event): void {
  const el = (e.currentTarget as HTMLElement) || (e.target as HTMLElement);
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.mf-field-group.mf-ai-active').forEach((n) => n.classList.remove('mf-ai-active'));
  el.classList.add('mf-ai-active');
  const info = describeField(el);
  const prompt =
    'Modify the existing field "' + info.key + '" (' + info.type + (info.label ? ', label: "' + info.label + '"' : '') + '). ' +
    'Please ask me what to change, or apply a sensible change you can infer from context.';
  openChatWithPrompt(prompt);
}

function bindFields(): void {
  unbindFields();
  findFieldsOnPage().forEach((el) => {
    el.addEventListener('click', fieldClickHandler, true);
    _bound.push({ el, handler: fieldClickHandler });
  });
}

function unbindFields(): void {
  _bound.forEach(({ el, handler }) => {
    try { el.removeEventListener('click', handler, true); } catch { /* ignore */ }
  });
  _bound = [];
}

export function mountInlineEdit(): void {
  if (document.getElementById(INLINE_ROOT_ID)) return;
  const flag = document.createElement('span');
  flag.id = INLINE_ROOT_ID;
  flag.style.display = 'none';
  document.body.appendChild(flag);

  injectStyle();
  const toggle = buildToggle();
  const banner = buildBanner();

  function refreshVisibility(): void {
    if (!isAdminUser()) { toggle.removeAttribute('data-mf-ai-visible'); return; }
    if (!findFieldsOnPage().length) { toggle.removeAttribute('data-mf-ai-visible'); return; }
    toggle.setAttribute('data-mf-ai-visible', '1');
  }
  refreshVisibility();

  // Re-check after dynamic content (e.g. dashboard SPA) mounts more fields.
  const observer = new MutationObserver(() => refreshVisibility());
  observer.observe(document.body, { childList: true, subtree: true });

  toggle.addEventListener('click', () => {
    if (toggle.classList.contains('is-active')) deactivate(toggle, banner);
    else activate(toggle, banner);
  });
}

// [AiFeatureGate v20260527-08] Per project owner direction, AI Form
// Assistant is restricted to the Builder surface only — the inline-edit
// pencil that activates on runtime forms is intentionally NOT auto-mounted.
// Callers that genuinely want the pencil on a non-builder page can still
// invoke `window.MFAI_InlineEdit.mount()` manually after explicit policy
// review (requires dev.lock + admin user).

(window as any).__MFAI_INLINE_BADGE__ = INLINE_BADGE;
(window as any).MFAI_InlineEdit = { mount: mountInlineEdit, badge: INLINE_BADGE };
