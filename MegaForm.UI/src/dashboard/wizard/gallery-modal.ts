// [WizardGallery 2026-07-01] Rich Template Gallery + Import-JSON entry points for the
// Form Creation Wizard. Parallel to starting the wizard from scratch: the user can browse
// the full template library (category filter + search + preview cards) OR import a MegaForm
// export .json — either lands back in the wizard with the template loaded, ready to edit.
//
// Reuses the wizard's already-loaded catalog (templates.ts → GET BuilderTemplates/List, the
// SAME catalog the builder gallery uses) so this stays inside the dashboard bundle — no
// cross-bundle coupling with builder/gallery.ts.
import { openImportJsonDialog } from './import-json-modal';
import { h, icon, wt, wizardToast } from './ui';
import { isTrialMode, showTrialUpgrade, trialLockBadge } from '@shared/trial';
import { WizardTemplate, templatesState, loadTemplates, wizardTemplateFromJson } from './templates';
import { buildTemplateThumbnail, openTemplatePreview, ensurePreviewCss } from './gallery-preview';

// Saturated card-thumbnail gradients per category (mirrors the builder gallery) — the
// translucent live-thumbnail skeleton reads cleanly over a saturated backdrop.
const THUMB_GRADIENTS: Record<string, string> = {
  general: 'linear-gradient(135deg,#5b8def,#7c3aed)',
  hr: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
  healthcare: 'linear-gradient(135deg,#10b981,#0ea5e9)',
  events: 'linear-gradient(135deg,#8b5cf6,#ec4899)',
  survey: 'linear-gradient(135deg,#f59e0b,#ef4444)',
  finance: 'linear-gradient(135deg,#14b8a6,#3b82f6)',
  education: 'linear-gradient(135deg,#f97316,#ec4899)',
};
function thumbGradient(cat: string): string { return THUMB_GRADIENTS[(cat || 'general').toLowerCase()] || THUMB_GRADIENTS.general; }

let styleInjected = false;
function ensureGalleryCss(): void {
  if (styleInjected || document.getElementById('mfw-gallery-style')) { styleInjected = true; return; }
  styleInjected = true;
  const s = document.createElement('style');
  s.id = 'mfw-gallery-style';
  s.textContent = `
  .mfwg-ov{position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Inter',system-ui,sans-serif}
  .mfwg-modal{width:min(1080px,96vw);height:min(760px,92vh);background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(15,23,42,.4);display:flex;flex-direction:column;overflow:hidden}
  .mfwg-hd{flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #eef2f6}
  .mfwg-hd h3{margin:0;font-size:17px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:9px}
  .mfwg-hd .mfwg-logo{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center}
  .mfwg-search{flex:1;max-width:340px;margin-left:auto;position:relative}
  .mfwg-search input{width:100%;height:38px;border:1px solid #e2e8f0;border-radius:10px;padding:0 12px 0 34px;font-size:13px;outline:none}
  .mfwg-search input:focus{border-color:#818cf8;box-shadow:0 0 0 2px rgba(129,140,248,.15)}
  .mfwg-search i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8;font-size:13px}
  .mfwg-x{width:36px;height:36px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#64748b;cursor:pointer;font-size:15px}
  .mfwg-x:hover{background:#f8fafc;color:#0f172a}
  .mfwg-cats{flex:0 0 auto;display:flex;gap:7px;flex-wrap:wrap;padding:12px 20px;border-bottom:1px solid #f1f5f9}
  .mfwg-cat{padding:5px 13px;font-size:12px;font-weight:600;border:1px solid #e2e8f0;border-radius:999px;background:#fff;color:#64748b;cursor:pointer}
  .mfwg-cat.on{background:#0f172a;border-color:#0f172a;color:#fff}
  .mfwg-body{flex:1;overflow-y:auto;padding:16px 20px}
  .mfwg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  .mfwg-card{text-align:left;border:1px solid #e5e7eb;border-radius:14px;background:#fff;padding:0;cursor:pointer;overflow:hidden;transition:all .15s;display:flex;flex-direction:column}
  .mfwg-card:hover{border-color:#c7d2fe;box-shadow:0 12px 26px rgba(15,23,42,.1);transform:translateY(-2px)}
  .mfwg-card:focus-visible{outline:2px solid #818cf8;outline-offset:2px}
  .mfwg-thumb{height:158px;background:linear-gradient(135deg,#eef2ff,#faf5ff);display:flex;align-items:center;justify-content:center;color:#6366f1;font-size:30px;position:relative;overflow:hidden}
  .mfwg-thumb .mfwg-badge{position:absolute;top:8px;right:8px;z-index:3;font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;background:#7c3aed;color:#fff}
  .mfwg-thumb-ov{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,rgba(15,23,42,.04) 0%,rgba(15,23,42,.34) 100%);opacity:0;transition:opacity .16s}
  .mfwg-card:hover .mfwg-thumb-ov,.mfwg-card:focus-within .mfwg-thumb-ov{opacity:1}
  .mfwg-peek{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border:0;border-radius:999px;cursor:pointer;color:#0f172a;background:rgba(255,255,255,.96);font-weight:700;font-size:12.5px;box-shadow:0 10px 26px rgba(15,23,42,.22);transform:translateY(6px);transition:transform .16s}
  .mfwg-card:hover .mfwg-peek,.mfwg-card:focus-within .mfwg-peek{transform:translateY(0)}
  .mfwg-peek:hover{background:#fff}
  .mfwg-meta{padding:11px 13px}
  .mfwg-meta b{display:block;font-size:13.5px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mfwg-meta small{display:block;font-size:11.5px;color:#94a3b8;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mfwg-empty{color:#94a3b8;font-size:13px;text-align:center;padding:48px 0}
  .mfwg-ft{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid #f1f5f9;background:#fafbff}
  .mfwg-import{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 16px;border:1px dashed #c7d2fe;border-radius:10px;background:#fff;color:#4338ca;font-weight:700;font-size:13px;cursor:pointer}
  .mfwg-import:hover{background:#eef2ff}
  .mfwg-ft .mfwg-hint{font-size:12px;color:#94a3b8}
  `;
  document.head.appendChild(s);
}

function catLabel(c: string): string { return c ? c.charAt(0).toUpperCase() + c.slice(1) : 'General'; }

/**
 * Open the full-screen Template Gallery. `onPick(t)` fires with the chosen template and the
 * modal closes; `onImport(t)` fires when a template is loaded from an imported .json.
 */
export function openWizardGallery(onPick: (t: WizardTemplate) => void, onImport: (t: WizardTemplate) => void): void {
  ensureGalleryCss();
  ensurePreviewCss();
  if (document.getElementById('mfw-gallery-ov')) return;

  let activeCat = 'all';
  let query = '';

  const grid = h('div', { class: 'mfwg-grid' });
  const cats = h('div', { class: 'mfwg-cats' });
  const searchInput = h('input', { type: 'text', placeholder: wt('wiz.gallery.search_ph', 'Search templates…'), 'aria-label': wt('wiz.gallery.search_ph', 'Search templates…') }) as HTMLInputElement;

  const ov = h('div', { class: 'mfwg-ov', id: 'mfw-gallery-ov' }, [
    h('div', { class: 'mfwg-modal', onclick: (e: any) => e.stopPropagation() }, [
      h('div', { class: 'mfwg-hd' }, [
        h('div', { class: 'mfwg-logo' }, [icon('fa-layer-group')]),
        h('h3', null, [document.createTextNode(wt('wiz.gallery.title', 'Template Gallery'))]),
        h('div', { class: 'mfwg-search' }, [icon('fa-search'), searchInput]),
        h('button', { class: 'mfwg-x', title: wt('wiz.gallery.close', 'Close'), onclick: close }, [icon('fa-times')]),
      ]),
      cats,
      h('div', { class: 'mfwg-body' }, [grid]),
      h('div', { class: 'mfwg-ft' }, [
        h('button', { class: 'mfwg-import', onclick: () => openImportJson((t) => { close(); onImport(t); }) }, [icon('fa-file-arrow-up'), document.createTextNode(wt('wiz.gallery.import', 'Import JSON'))]),
        h('span', { class: 'mfwg-hint' }, wt('wiz.gallery.import_hint', 'Upload a MegaForm export (.json) to start from it, or pick a template above.')),
      ]),
    ]),
  ]);
  ov.addEventListener('click', close);
  function close(): void { try { ov.remove(); } catch { /* */ } document.removeEventListener('keydown', onKey, true); }
  function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey, true);

  function renderCats(): void {
    const list = templatesState().list;
    const uniq = Array.from(new Set(list.map((t) => (t.category || 'general').toLowerCase())));
    cats.innerHTML = '';
    ['all', ...uniq].forEach((c) => {
      cats.appendChild(h('button', { class: 'mfwg-cat' + (activeCat === c ? ' on' : ''), onclick: () => { activeCat = c; renderCats(); renderGrid(); } }, c === 'all' ? wt('wiz.gallery.all', 'All templates') : catLabel(c)));
    });
  }

  function renderGrid(): void {
    const st = templatesState();
    grid.innerHTML = '';
    if (st.status === 'loading' || st.status === 'idle') { grid.appendChild(h('div', { class: 'mfwg-empty' }, [icon('fa-spinner fa-spin'), document.createTextNode(' ' + wt('wiz.gallery.loading', 'Loading templates…'))])); return; }
    if (st.status === 'error') { grid.appendChild(h('div', { class: 'mfwg-empty' }, wt('wiz.gallery.unavailable', 'Template library unavailable. You can still Import JSON below.'))); return; }
    const q = query.trim().toLowerCase();
    const items = st.list.filter((t) => {
      if (activeCat !== 'all' && (t.category || 'general').toLowerCase() !== activeCat) return false;
      if (q && !(t.title + ' ' + t.description + ' ' + t.category).toLowerCase().includes(q)) return false;
      return true;
    });
    if (!items.length) { grid.appendChild(h('div', { class: 'mfwg-empty' }, wt('wiz.gallery.no_match', 'No templates match your search.'))); return; }
    const previewLabel = wt('wiz.gallery.preview', 'Preview');
    items.forEach((t) => {
      // [TrialTighten v20260706] Premium templates are locked in trial: dim + lock badge, and clicking
      // opens the Upgrade CTA instead of applying/previewing the template.
      const locked = isTrialMode() && (t as any).isPremium;
      const pick = locked
        ? () => showTrialUpgrade({ title: wt('trial.premium_title', 'Premium template'), message: wt('trial.premium_msg', 'Premium templates need a paid license. Upgrade to use this template.') })
        : () => { close(); onPick(t); };
      // Live thumbnail (iframe render for custom-shell / mock skeleton for standard);
      // falls back to an icon only when the template has nothing renderable.
      const thumbHtml = buildTemplateThumbnail(t);
      const thumb = h('div', { class: 'mfwg-thumb' + (thumbHtml ? ' mfwg-thumb-live' : ''), style: (thumbHtml ? 'background:' + thumbGradient(t.category) : '') + (locked ? ';filter:grayscale(.5);opacity:.72' : '') });
      if (thumbHtml) thumb.innerHTML = thumbHtml;
      else {
        // Only render real FontAwesome classes as glyphs; lucide-style catalog names
        // (compass / globe-2 / flower-2) aren't FA classes → show a neutral glyph, not raw text.
        thumb.appendChild(t.icon && t.icon.indexOf('fa-') === 0 ? icon(t.icon) : icon(t.isPremium ? 'fa-wand-magic-sparkles' : 'fa-file-lines'));
      }
      if (t.isPremium) thumb.appendChild(h('span', { class: 'mfwg-badge' }, locked ? '\u{1F512} ' + trialLockBadge() : 'Premium'));
      thumb.appendChild(h('div', { class: 'mfwg-thumb-ov' }, [
        h('button', { type: 'button', class: 'mfwg-peek', title: previewLabel, onclick: (e: any) => { e.stopPropagation(); if (locked) { pick(); } else { openTemplatePreview(t, pick); } } }, [icon(locked ? 'fa-lock' : 'fa-eye'), document.createTextNode(' ' + (locked ? trialLockBadge() : previewLabel))]),
      ]));
      grid.appendChild(h('div', {
        class: 'mfwg-card' + (locked ? ' mfwg-locked' : ''), role: 'button', tabindex: '0', onclick: pick,
        onkeydown: (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } },
      }, [
        thumb,
        h('div', { class: 'mfwg-meta' }, [
          h('b', null, t.title),
          h('small', null, catLabel(t.category) + (t.fieldCount ? ' · ' + t.fieldCount + ' fields' : '')),
        ]),
      ]));
    });
  }

  searchInput.addEventListener('input', () => { query = searchInput.value; renderGrid(); });
  document.body.appendChild(ov);
  renderCats(); renderGrid();
  // Ensure the catalog is loading; repaint when it lands.
  if (templatesState().status === 'idle' || templatesState().status === 'loading') {
    loadTemplates(() => { renderCats(); renderGrid(); });
  }
  setTimeout(() => { try { searchInput.focus(); } catch { /* */ } }, 0);
}

function stripBom(s: string): string { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

/** Open a file picker for a MegaForm export .json and hand back a WizardTemplate. */
/**
 * Opens the import dialog.
 *
 * This used to click a hidden <input type=file> for the user. That silently does nothing when the
 * browser is driven over the DevTools protocol — an automation/AI extension attached to the tab
 * intercepts file choosers, so the native dialog never appears and the button looks dead. The
 * dialog now offers a file input the user clicks themselves, drag-and-drop, AND paste, so the
 * import no longer depends on a native dialog appearing at all.
 */
export function openImportJson(onLoaded: (t: WizardTemplate) => void): void {
  openImportJsonDialog({
    t: (key, fallback) => wt(key, fallback),
    onText: (text) => {
      let raw: any;
      try { raw = JSON.parse(stripBom(text)); }
      catch { wizardToast(wt('wiz.import_invalid', 'That file is not valid JSON.'), 'error'); return; }
      const t = wizardTemplateFromJson(raw);
      if (!t) { wizardToast(wt('wiz.import_nofields', 'No form fields found in that JSON — export a form/template from MegaForm.'), 'error'); return; }
      onLoaded(t);
    },
  });
}
