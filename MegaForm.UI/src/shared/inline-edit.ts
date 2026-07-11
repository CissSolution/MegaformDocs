// ============================================================
// Inline shell/label editor — host + Oqtane Edit-mode ONLY. v20260629-01
// File: src/shared/inline-edit.ts
//
// GOAL: when the host is logged in AND the page is in Oqtane edit mode
// (URL ?edit=true + the MegaForm admin dock is present), let the host click
// text directly on the RENDERED form and edit it in place (WYSIWYG):
//   • Shell strings  — hero headline / brand / step labels / step headings /
//     intros baked into settings.customHtml  → committed via a text-only swap
//     (tag tree + customCss stay byte-identical).
//   • Field / Section labels — the field <label> text → committed to
//     field.label / Section.label in the schema.
// Edits accumulate in-memory; a floating "Save" pill persists them with a SAFE
// round-trip (GET the full form, apply the text change, POST the whole entity
// back) so no other form field is ever nulled.
//
// SAFETY: this module is a POST-RENDER ENHANCEMENT that does NOTHING unless
// isInlineEditContext() is true (host + ?edit=true + admin dock). A bug here
// can only affect a host editing in edit mode — never a public form visitor.
// ============================================================

// Reuse the renderer's OWN composite-parts resolver so an edited sub-label persists with the
// EXACT same parts array the renderer (TS + C# parity) would produce — critical because the
// renderer is all-or-nothing on widgetProps.parts (a partial array would drop the other parts).
import { compositePartsFor } from '@renderer/helpers';
// [i18n 20260701] Inline-edit UI chrome (save pill, gallery, block menu, grid-convert
// buttons, drag/resize tooltips) was authored in Vietnamese and shown verbatim
// regardless of the selected locale. Route every user-facing string through @i18n so
// EN shows English (the en-US fallback) and each locale can translate. Keys live under
// the `ie.*` namespace (see public/i18n/*.json).
import { t } from '@i18n';

/** Escape a translated string for safe use inside a CSS `content:"…"` value
 *  (used by the injected <style>). Backslash + double-quote only. */
function cssContent(s: string): string {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

interface InlineEditConfig {
  formId: number;
  apiBaseUrl?: string;
  schema?: any;
  container?: HTMLElement | null;
  /** [InlineEdit→Builder 20260630] True when running inside the builder DESIGN-tab Live Preview
   *  iframe. In preview, save() posts the edited schema to the PARENT builder (merge + mark dirty)
   *  instead of POSTing to the DB. Inline-edit now activates ONLY in preview (the public
   *  ?view=form&edit=true path is retired — it was unstable). */
  isPreview?: boolean;
}

const STATE = {
  dirty: false,
  // Shell edits keyed by the editable element's id (data-mf-ie-id) so re-editing the SAME
  // element overwrites (last-write-wins) instead of stacking, and `find` always stays the
  // PRISTINE customHtml text. `occ` is the 0-based occurrence index among identical shell
  // strings so the save swaps the exact instance the host edited (not blindly the first).
  pendingShell: {} as Record<string, { find: string; replace: string; occ: number }>,
  pendingFields: {} as Record<string, string>,
  // Option labels (Cards/Radio/Checkbox/Select) → field.options[].label, keyed by fieldKey::value.
  pendingOptions: {} as Record<string, { fieldKey: string; value: string; label: string }>,
  // Submit-button text → SubmitButtonText (standard) AND a customHtml swap (premium bakes the
  // button text into customHtml), so it persists whichever way the form renders the submit.
  pendingSubmit: null as { find: string; replace: string } | null,
  // Image swaps (hero / shell <img>): old src → new src. Persisted by updating the matching
  // settings.customContent value (the {{content:KEY}} the renderer resolves) + any literal src.
  pendingImages: {} as Record<string, string>,
  // Visual field layout edits (mouse resize + drag reorder, snap-to-grid). Width is a percent
  // string (field.width → data-width); order is the new top-level field-key sequence.
  pendingLayout: {} as Record<string, string>,
  pendingOrder: null as string[] | null,
  // Premium / Row fields resize via the schema Row's column spans (the row renders with
  // grid-template-columns from columns[].span). Keyed by the Row field key → the full spans array.
  pendingRowSpan: {} as Record<string, number[]>,
  // Composite sub-labels (Gravity-style hints: date "Day/Month/Year", name "First/Last", phone…)
  // → field.widgetProps.parts[].sublabel. Keyed by fieldKey::partKey. Persist MATERIALIZES the
  // full parts array (renderer returns wp.parts AS-IS) via compositePartsFor so nothing is dropped.
  pendingCompositeSub: {} as Record<string, { fieldKey: string; partKey: string; sublabel: string }>,
  // Block visual toggles (header / steps / sections) set from the per-block action menu: show/hide
  // + show/hide border. Keyed by a STABLE scoped CSS selector → the toggle flags. Persisted as a
  // delimited region appended to settings.customCss (rendered verbatim by BOTH TS + C#), so no
  // renderer/DLL change is needed. Neutralized in edit-mode (inline display:revert) so hidden
  // blocks stay visible+clickable for the host to toggle back on.
  pendingBlocks: {} as Record<string, { hidden?: boolean; noBorder?: boolean }>,
  // [PDF-grid / FlexGrid editor v20260629] Per-field 2-D placement edited by drag (x/y) + resize
  // (w/h) on the rendered .mf-flexgrid. Keyed by field key → {lg,md,sm}. pendingLayoutMode flips
  // settings.layoutMode='flexgrid' on lazy-migrate (convert a flow form to a 2-D grid). Both persist
  // through the same SAFE GET→apply→POST; C# SSR (FormHtmlRenderer.RenderFlexGridFields) renders it.
  pendingPlacement: {} as Record<string, { lg?: any; md?: any; sm?: any }>,
  pendingLayoutMode: null as string | null,
  // [Premium FlexGrid v20260630] Premium (customHtml .mfp) forms can't use field.placement (the
  // fields are {{field:KEY}} TOKENS inside bespoke labels, not flat schema-rendered .mf-field-group).
  // So for premium we keep the grid INSIDE customHtml: convert wraps each step's field labels in a
  // .mf-flexgrid-item (chrome + label styling preserved); drag/resize rewrites the item's --lg-* in
  // customHtml itself (so BOTH C# verbatim render AND the client customHtml rebuild show the grid —
  // no SSR-vs-rebuild parity gap, no C#/renderer change). pendingPremiumGridConvert = wrap-on-save;
  // pendingPremiumPlacement[key]={x,y,w,h} = per-item placement to rewrite into customHtml.
  pendingPremiumGridConvert: false,
  pendingPremiumPlacement: {} as Record<string, { x: number; y: number; w: number; h: number }>,
  // Form chrome edits that are not schema fields: standard header title/description and
  // hero/text/image visual overrides from Design preview.
  pendingFormTitle: null as string | null,
  pendingFormDescription: null as string | null,
  pendingHeroStyles: {} as Record<string, Record<string, string>>,
  cfg: null as InlineEditConfig | null,
  idSeq: 0,
};

/** Marker delimiting the inline-edit block-override region inside settings.customCss. */
const MF_IE_BLOCKS_START = '/* mf-ie-blocks:start */';
const MF_IE_BLOCKS_END = '/* mf-ie-blocks:end */';
const MF_IE_HERO_START = '/* mf-ie-hero-style:start */';
const MF_IE_HERO_END = '/* mf-ie-hero-style:end */';
const MF_IE_HERO_STYLE_OPEN = '<style id="mf-ie-hero-style">';
const MF_IE_HERO_STYLE_RE = /<style id="mf-ie-hero-style">[\s\S]*?<\/style>\s*/i;

/** Strictly gate: host + Oqtane edit mode (?edit=true) + MegaForm admin dock present. */
export function isInlineEditContext(): boolean {
  try {
    const editParam = /[?&]edit=true/i.test(location.search || '');
    if (!editParam) return false;
    // The MegaForm admin dock (Form Builder / Form Dashboard links) renders only
    // for the host in edit mode — its presence confirms host + editable.
    const adminDock = !!document.querySelector('.mf-oq-linkbtn, [data-mf-shared-dashboard-badge]');
    return adminDock;
  } catch { return false; }
}

function apiBase(): string {
  let b = (STATE.cfg && STATE.cfg.apiBaseUrl) || '/api/MegaForm/';
  if (b.charAt(b.length - 1) !== '/') b += '/';
  return b;
}

function platformCtx(): { moduleId: number; siteId: number } {
  const pf = (window as any).__MF_PLATFORM__ || {};
  const dash = document.getElementById('mf-dashboard-root');
  const ds = (dash && dash.dataset) || ({} as DOMStringMap);
  const num = (v: any) => { const n = parseInt(String(v == null ? '' : v), 10); return isFinite(n) ? n : 0; };
  return {
    moduleId: num(pf.moduleId !== undefined ? pf.moduleId : (pf.ModuleId !== undefined ? pf.ModuleId : ds.moduleId)),
    siteId: num(pf.siteId !== undefined ? pf.siteId : (pf.SiteId !== undefined ? pf.SiteId : (ds.siteId || ds.portalId))),
  };
}

// ── editable text helpers ───────────────────────────────────────────────────
function plainText(el: Element): string {
  return String(el.textContent || '').replace(/\s+/g, ' ').trim();
}

/** A text element is editable if it holds a real visible string and no token / control. */
function isEditableTextEl(el: Element): boolean {
  if (el.querySelector('input,select,textarea,button,svg,img,[contenteditable]')) return false;
  if (el.closest('[data-mf-inline-skip]')) return false;
  const t = plainText(el);
  if (!t || t.length < 1 || t.length > 200) return false;
  if (/\{\{|\}\}/.test(el.innerHTML)) return false;
  // must be a leaf-ish text node (no child element that itself has its own text)
  const kids = Array.prototype.filter.call(el.children, (c: Element) => plainText(c).length > 0);
  return kids.length === 0;
}

/** [footer/mixed 20260701] For an "important" shell element that is NOT a pure text leaf because it
 *  ends with a dynamic child (e.g. the footer "Co-funded … · Step <span data-ey-current>1</span> of 4"),
 *  wrap its LEADING text node in a span so that copy becomes editable WITHOUT touching the counter.
 *  Returns the wrapper (already in the DOM) or null when there is no meaningful leading text. */
function wrapLeadingShellText(el: HTMLElement): HTMLElement | null {
  const existing = el.querySelector(':scope > [data-mf-ie-textwrap]') as HTMLElement | null;
  if (existing) return existing;
  const first = el.firstChild;
  if (!first || first.nodeType !== 3) return null; // must start with a raw text node
  const txt = String(first.textContent || '');
  if (txt.trim().length < 3 || txt.length > 200) return null;
  if (/\{\{|\}\}/.test(txt)) return null;
  const span = document.createElement('span');
  span.setAttribute('data-mf-ie-textwrap', '1');
  el.insertBefore(span, first);
  span.appendChild(first);
  return span;
}

function markEditable(el: HTMLElement, kind: string, key: string): void {
  if (el.getAttribute('data-mf-ie') === '1') return;
  el.setAttribute('data-mf-ie', '1');
  el.setAttribute('data-mf-ie-id', String(++STATE.idSeq));
  el.setAttribute('data-mf-ie-kind', kind);
  el.setAttribute('data-mf-ie-key', key);
  const base = plainText(el);
  // -orig tracks the last committed value (for Esc-revert + no-op check); -base is the
  // pristine customHtml text used as the swap `find` and never mutated after tagging.
  el.setAttribute('data-mf-ie-orig', base);
  el.setAttribute('data-mf-ie-base', base);
  el.setAttribute('contenteditable', 'plaintext-only');
  el.classList.add('mf-ie-editable');
  el.addEventListener('focus', onFocus);
  el.addEventListener('blur', onBlur);
  el.addEventListener('keydown', onKey as any);
}

function onFocus(e: Event): void {
  const el = e.currentTarget as HTMLElement;
  el.classList.add('mf-ie-active');
  // [HeroEditUX v20260707] Do NOT auto-open the Text-style panel on focus — it landed on top of
  // the text the user had just clicked to EDIT, so typing felt impossible ("click vào là pop ngay
  // css changer"). Focus now shows a small floating 🖉-style trigger next to the element; the
  // panel opens only when that trigger is clicked. Typing works immediately on click.
  if (isHeroTextStyleTarget(el)) showHeroStyleTrigger(el);
}

const HERO_TRIGGER_ID = 'mf-ie-style-trigger';
function hideHeroStyleTrigger(): void {
  const t = document.getElementById(HERO_TRIGGER_ID);
  if (t && t.parentNode) t.parentNode.removeChild(t);
}
function showHeroStyleTrigger(el: HTMLElement): void {
  hideHeroStyleTrigger();
  const b = document.createElement('button');
  b.id = HERO_TRIGGER_ID;
  b.type = 'button';
  b.className = 'mf-ie-style-trigger';
  b.title = 'Text style';
  b.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i>';
  document.body.appendChild(b);
  const r = el.getBoundingClientRect();
  b.style.top = Math.max(4, r.top - 34) + 'px';
  b.style.left = Math.max(4, Math.min(window.innerWidth - 40, r.right - 28)) + 'px';
  // mousedown preventDefault keeps the caret in the contenteditable (no blur) …
  b.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
  // … so the click can open the panel for the still-focused element.
  b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); hideHeroStyleTrigger(); openHeroTextStylePanel(el); });
}

function onKey(e: KeyboardEvent): void {
  const el = e.currentTarget as HTMLElement;
  if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
  if (e.key === 'Escape') { e.preventDefault(); el.textContent = el.getAttribute('data-mf-ie-orig') || ''; el.blur(); }
}

function onBlur(e: Event): void {
  const el = e.currentTarget as HTMLElement;
  el.classList.remove('mf-ie-active');
  hideHeroStyleTrigger();
  const orig = el.getAttribute('data-mf-ie-orig') || '';
  const next = plainText(el);
  if (next === orig) return;
  if (!next) { el.textContent = orig; return; } // never allow empty
  const kind = el.getAttribute('data-mf-ie-kind') || '';
  const key = el.getAttribute('data-mf-ie-key') || '';
  if (kind === 'shell') {
    const id = el.getAttribute('data-mf-ie-id') || '';
    const base = el.getAttribute('data-mf-ie-base') || orig;
    const occ = parseInt(el.getAttribute('data-mf-ie-occ') || '0', 10) || 0;
    STATE.pendingShell[id] = { find: base, replace: next, occ };
  } else if (kind === 'form-title') {
    STATE.pendingFormTitle = next;
  } else if (kind === 'form-description') {
    STATE.pendingFormDescription = next;
  } else if (kind === 'field') {
    STATE.pendingFields[key] = next;
  } else if (kind === 'option') {
    const fk = el.getAttribute('data-mf-ie-optfield') || '';
    const ov = el.getAttribute('data-mf-ie-optval') || '';
    if (fk) STATE.pendingOptions[fk + '::' + ov] = { fieldKey: fk, value: ov, label: next };
  } else if (kind === 'submit') {
    const base = el.getAttribute('data-mf-ie-base') || orig;
    STATE.pendingSubmit = { find: base, replace: next };
  } else if (kind === 'composite-sub') {
    const fk = el.getAttribute('data-mf-ie-compfield') || '';
    const pk = el.getAttribute('data-mf-ie-comppart') || '';
    if (fk && pk) STATE.pendingCompositeSub[fk + '::' + pk] = { fieldKey: fk, partKey: pk, sublabel: next };
  }
  el.setAttribute('data-mf-ie-orig', next);
  markDirty();
}

/** A shell text LEAF: a visible-text element with no field / control / token / preset-picker
 *  context and no child element that itself carries text. Counted IDENTICALLY at scan time
 *  (occurrence indexing) and matched by swapTextOnly at save time, so the occurrence index a
 *  tagged element is stamped with maps to the same instance the string swap targets — even
 *  when an identical string also lives in an UNtagged leaf (e.g. a non-"important" <p>). */
function isShellLeaf(el: Element): boolean {
  if (el.closest('label,.mf-field,.mf-option-item,.mf-field-group')) return false;
  if (el.closest('[class*="preset"],[class*="swatch"],[class*="mf-le-"]')) return false;
  const t = plainText(el);
  if (!t) return false;
  if (/\{\{|\}\}/.test(el.innerHTML)) return false;
  const kids = Array.prototype.filter.call(el.children, (c: Element) => plainText(c).length > 0);
  return kids.length === 0;
}

function collectShellLeaves(root: ParentNode): Element[] {
  const out: Element[] = [];
  Array.prototype.forEach.call(root.querySelectorAll('*'), (el: Element) => { if (isShellLeaf(el)) out.push(el); });
  return out;
}

// ── scan + tag the rendered form ────────────────────────────────────────────
export function scanAndTag(root: HTMLElement): number {
  let count = 0;
  const shellHost = root.querySelector('.mfp, [class*="mfp-"]') as HTMLElement | null;
  // 1. Field / Section labels + section-break titles. The field KEY is read from the
  //    .mf-field-group[data-key] wrapper that BOTH the client renderer and the C# SSR emit
  //    (legacy data-*-field-key + input[name] are fallbacks) so EVERY field type — including
  //    option groups, composites and Section dividers that have no named input — resolves a key.
  const labels = root.querySelectorAll('.mf-field-label, .mf-field > label, .mf-option-group-label, .mf-section-title');
  Array.prototype.forEach.call(labels, (lab: HTMLElement) => {
    // strip a trailing required-asterisk span before measuring
    const field = lab.closest('.mf-field-group[data-key],[data-mf-field-key],[data-field-key]') as HTMLElement | null;
    let key = field ? (field.getAttribute('data-key') || field.getAttribute('data-mf-field-key') || field.getAttribute('data-field-key') || '') : '';
    if (!key) {
      const inp = (lab.parentElement || root).querySelector('input[name],select[name],textarea[name]') as HTMLInputElement | null;
      key = inp ? String(inp.name || '') : '';
    }
    if (!key) return;
    // edit only the label text node (clone-safe: wrap the text in a span if mixed with the asterisk)
    if (!isEditableTextEl(lab)) {
      // label may contain an icon + text + asterisk; target the deepest text-only child
      const textSpan = findLabelTextSpan(lab);
      if (textSpan) { markEditable(textSpan, 'field', key); count++; }
      return;
    }
    markEditable(lab, 'field', key); count++;
  });
  // 1c. Option labels (Cards / Radio / Checkbox / Select options) → field.options[].label.
  //     Resolve the field key from the option's .mf-field-group and the option identity from the
  //     input value in its .mf-option-item, so the save updates the right option by value.
  Array.prototype.forEach.call(root.querySelectorAll('.mf-option-label'), (lab: HTMLElement) => {
    if (lab.getAttribute('data-mf-ie') === '1' || !isEditableTextEl(lab)) return;
    const item = lab.closest('.mf-option-item, label') as HTMLElement | null;
    const input = item ? item.querySelector('input[value]') as HTMLInputElement | null : null;
    const group = lab.closest('.mf-field-group[data-key]') as HTMLElement | null;
    const fieldKey = group ? (group.getAttribute('data-key') || '') : '';
    const val = input ? String(input.value || '') : '';
    if (!fieldKey || !val) return;
    lab.setAttribute('data-mf-ie-optfield', fieldKey);
    lab.setAttribute('data-mf-ie-optval', val);
    markEditable(lab, 'option', fieldKey + '::' + val); count++;
  });
  // 1d. Submit button text → SubmitButtonText. Block the click from submitting while editing.
  const submitBtn = root.querySelector('button[type="submit"], .mf-btn-submit, .bg-submit, .au-submit, .fi-submit, .ey-submit, [data-mf-submit]') as HTMLElement | null;
  if (submitBtn && submitBtn.getAttribute('data-mf-ie') !== '1' && isEditableTextEl(submitBtn)) {
    submitBtn.addEventListener('click', (ev) => { ev.preventDefault(); });
    markEditable(submitBtn, 'submit', ''); count++;
  }
  if (!shellHost) {
    const formTitle = root.querySelector('.mf-form-header .mf-form-title, .mf-form-title') as HTMLElement | null;
    if (formTitle && formTitle.getAttribute('data-mf-ie') !== '1' && isEditableTextEl(formTitle)) {
      markEditable(formTitle, 'form-title', ''); count++;
    }
    const formDesc = root.querySelector('.mf-form-header .mf-form-description, .mf-form-description') as HTMLElement | null;
    if (formDesc && formDesc.getAttribute('data-mf-ie') !== '1' && isEditableTextEl(formDesc)) {
      markEditable(formDesc, 'form-description', ''); count++;
    }
  }
  // 1e. Composite SUB-LABELS — the gray Gravity-style hints under each composite part (date
  //     "Day / Month / Year", name "First / Last", phone "Country / Area / Number"). They render
  //     as <small class="mf-composite-sub"> inside a .mf-composite-cell whose control carries
  //     data-mf-part (the part key); the .mf-composite[data-key] wrapper gives the field key.
  //     Edit → field.widgetProps.parts[partKey].sublabel (materialized full parts at save).
  Array.prototype.forEach.call(root.querySelectorAll('.mf-composite-sub'), (sub: HTMLElement) => {
    if (sub.getAttribute('data-mf-ie') === '1' || sub.querySelector('[data-mf-ie="1"]')) return;
    const comp = sub.closest('.mf-composite[data-key]') as HTMLElement | null;
    const cell = sub.closest('.mf-composite-cell') as HTMLElement | null;
    if (!comp || !cell) return;
    const ctrl = cell.querySelector('[data-mf-part]') as HTMLElement | null;
    const fieldKey = comp.getAttribute('data-key') || '';
    const partKey = ctrl ? (ctrl.getAttribute('data-mf-part') || '') : '';
    if (!fieldKey || !partKey) return;
    const span = compositeSubTextSpan(sub);
    if (!span) return;
    span.setAttribute('data-mf-ie-compfield', fieldKey);
    span.setAttribute('data-mf-ie-comppart', partKey);
    markEditable(span, 'composite-sub', fieldKey + '::' + partKey); count++;
  });
  // 2. Shell strings — hero / brand / step labels / headings / intros baked into customHtml.
  //    EXCLUDE the theme-preset swatch picker and the live-editor overlay: their swatch names
  //    ("Reef Turquoise"…) are theme metadata, not form copy, and were noise before. Duplicate
  //    identical strings are stamped with a 0-based occurrence index (data-mf-ie-occ) so the
  //    save swaps the SAME instance the host edited.
  const shellSel = 'h1,h2,h3,p,span,strong,em,figcaption,a';
  // Shell strings live ONLY in a premium customHtml shell (`.mfp`). A standard form has no
  // customHtml, so a shell edit there has nowhere to persist (it would silently no-op on save)
  // — so only premium forms get the shell pass; standard forms are field-labels-only by design.
  if (shellHost) {
    // Pre-index occurrence over the FULL shell-leaf domain (the same domain the save-time string
    // swap scans), so a tagged element's data-mf-ie-occ is the index among identical strings the
    // swap will see — robust even when the duplicate sits in an untagged ("not important") leaf.
    const occOf = new Map<Element, number>();
    const occSeen: Record<string, number> = {};
    collectShellLeaves(shellHost).forEach((el) => {
      const t = plainText(el);
      occOf.set(el, occSeen[t] = (occSeen[t] === undefined ? 0 : occSeen[t] + 1));
    });
    Array.prototype.forEach.call(shellHost.querySelectorAll(shellSel), (el: HTMLElement) => {
      if (el.closest('label,.mf-field,.mf-option-item,.mf-field-group,[data-mf-ie]')) return;
      if (el.closest('[class*="preset"],[class*="swatch"],[class*="mf-le-"]')) return;
      const cls = String(el.getAttribute('class') || '');
      const tag = el.tagName.toUpperCase();
      const important = /hero|brand|title|subtitle|tagline|eyebrow|rating|stats|footer|caption|step|head|copy|programme|program/i.test(cls)
        || /^H[1-3]$/.test(tag) || !!el.closest('header,aside,footer,[class*="head"],[class*="hero"],[class*="step"]');
      if (!important) return;
      if (!isEditableTextEl(el)) {
        // Non-leaf important element (e.g. the footer with a "Step N of 4" counter child): make its
        // LEADING copy editable via a text-node wrapper instead of skipping it entirely.
        if (el.querySelector('input,select,textarea,button,[contenteditable]')) return;
        const wrap = wrapLeadingShellText(el);
        if (wrap && !wrap.getAttribute('data-mf-ie')) {
          const wt = plainText(wrap);
          wrap.setAttribute('data-mf-ie-occ', String(occSeen[wt] !== undefined ? occSeen[wt] : 0));
          markEditable(wrap, 'shell', ''); count++;
        }
        return;
      }
      const occ = occOf.has(el) ? (occOf.get(el) as number) : 0;
      el.setAttribute('data-mf-ie-occ', String(occ));
      markEditable(el, 'shell', ''); count++;
    });
  }
  return count;
}

/** Resolve the editable text node of a composite sub-label <small>. If it is text-only the <small>
 *  itself is editable; if it carries a trailing required `*` span, wrap just the leading text node so
 *  the asterisk is never edited away. Returns null when there is no text to edit (required-only). */
function compositeSubTextSpan(sub: HTMLElement): HTMLElement | null {
  const hasEl = sub.children && sub.children.length > 0;
  if (!hasEl) return sub; // pure-text <small> — edit it directly
  for (let i = 0; i < sub.childNodes.length; i++) {
    const n = sub.childNodes[i];
    if (n.nodeType === 3 && String(n.textContent || '').trim()) {
      const span = document.createElement('span');
      span.className = 'mf-ie-textwrap';
      span.textContent = n.textContent;
      sub.replaceChild(span, n);
      return span;
    }
  }
  return null;
}

/** Find the text-only descendant (or wrap the direct text node) of a label that also holds an icon/asterisk. */
function findLabelTextSpan(lab: HTMLElement): HTMLElement | null {
  // prefer an existing text-only span
  const spans = lab.querySelectorAll('span');
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i] as HTMLElement;
    if (!/required|asterisk|mf-req|text-danger/i.test(s.className) && isEditableTextEl(s)) return s;
  }
  // otherwise wrap the first non-empty direct text node
  for (let i = 0; i < lab.childNodes.length; i++) {
    const n = lab.childNodes[i];
    if (n.nodeType === 3 && String(n.textContent || '').trim()) {
      const span = document.createElement('span');
      span.className = 'mf-ie-textwrap';
      span.textContent = n.textContent;
      lab.replaceChild(span, n);
      return span;
    }
  }
  return null;
}

// ── dirty state + Save pill ──────────────────────────────────────────────────
function markDirty(): void {
  STATE.dirty = true;
  let pill = document.getElementById('mf-ie-savepill') as HTMLElement | null;
  if (!pill) {
    pill = document.createElement('button');
    pill.id = 'mf-ie-savepill';
    pill.type = 'button';
    pill.className = 'mf-ie-savepill';
    pill.innerHTML = '<i class="fas fa-floppy-disk"></i> ' + t('ie.save_edits');
    pill.addEventListener('click', save);
    document.body.appendChild(pill);
  }
  pill.classList.add('is-dirty');
  const n = Object.keys(STATE.pendingShell).length + Object.keys(STATE.pendingFields).length
    + Object.keys(STATE.pendingLayout).length + (STATE.pendingOrder ? 1 : 0)
    + Object.keys(STATE.pendingRowSpan).length
    + Object.keys(STATE.pendingOptions).length + (STATE.pendingSubmit != null ? 1 : 0)
    + Object.keys(STATE.pendingImages).length + Object.keys(STATE.pendingCompositeSub).length
    + Object.keys(STATE.pendingBlocks).length
    + Object.keys(STATE.pendingPlacement).length + (STATE.pendingLayoutMode ? 1 : 0)
    + Object.keys(STATE.pendingPremiumPlacement).length + (STATE.pendingPremiumGridConvert ? 1 : 0)
    + (STATE.pendingFormTitle != null ? 1 : 0) + (STATE.pendingFormDescription != null ? 1 : 0)
    + Object.keys(STATE.pendingHeroStyles).length;
  pill.innerHTML = '<i class="fas fa-floppy-disk"></i> ' + t('ie.save_n_edits', { n });
}

function setPill(text: string, cls?: string): void {
  const pill = document.getElementById('mf-ie-savepill') as HTMLElement | null;
  if (!pill) return;
  pill.innerHTML = text;
  if (cls) pill.className = 'mf-ie-savepill ' + cls;
}

// ── SAFE round-trip save: GET the full form, apply edits, POST the whole entity ─
/** Apply EVERY pending* edit onto the given schema/settings (shared by the legacy DB-save path and
 *  the builder-preview patch path). Mutates schema + settings in place. */
function applyAllPending(schema: any, settings: any): void {
  // Shell text swaps → settings.customHtml. DESCENDING occurrence index so replacing the later
  // instance first leaves the earlier instance's index intact.
  let html = String(settings.customHtml || settings.CustomHtml || '');
  const shellSwaps = Object.keys(STATE.pendingShell).map((k) => STATE.pendingShell[k]);
  shellSwaps.sort((a, b) => (b.occ || 0) - (a.occ || 0));
  shellSwaps.forEach((sw) => { html = swapTextOnly(html, sw.find, sw.replace, sw.occ || 0); });
  if (STATE.pendingSubmit) html = swapTextOnly(html, STATE.pendingSubmit.find, STATE.pendingSubmit.replace, 0);
  if (html) settings.customHtml = html;
  schema.settings = settings;
  if (STATE.pendingFormTitle != null) {
    schema.title = STATE.pendingFormTitle;
    if (schema.Title !== undefined) schema.Title = STATE.pendingFormTitle;
    settings.title = STATE.pendingFormTitle;
  }
  if (STATE.pendingFormDescription != null) {
    schema.description = STATE.pendingFormDescription;
    if (schema.Description !== undefined) schema.Description = STATE.pendingFormDescription;
    settings.description = STATE.pendingFormDescription;
  }
  if (Object.keys(STATE.pendingFields).length) applyFieldLabels(schema.fields || [], STATE.pendingFields);
  if (Object.keys(STATE.pendingOptions).length) applyOptionLabels(schema.fields || [], STATE.pendingOptions);
  if (Object.keys(STATE.pendingLayout).length) applyFieldWidths(schema.fields || [], STATE.pendingLayout);
  if (STATE.pendingOrder && STATE.pendingOrder.length) reorderTopLevelFields(schema, STATE.pendingOrder);
  if (Object.keys(STATE.pendingRowSpan).length) applyRowSpans(schema.fields || [], STATE.pendingRowSpan);
  if (Object.keys(STATE.pendingImages).length) { applyImageSwaps(settings, STATE.pendingImages); schema.settings = settings; }
  if (Object.keys(STATE.pendingCompositeSub).length) applyCompositeSubs(schema.fields || [], STATE.pendingCompositeSub);
  if (Object.keys(STATE.pendingBlocks).length) { applyBlockOverrides(settings, STATE.pendingBlocks); schema.settings = settings; }
  if (Object.keys(STATE.pendingHeroStyles).length) { applyHeroStyleOverrides(settings, STATE.pendingHeroStyles); schema.settings = settings; }
  if (STATE.pendingLayoutMode) { settings.layoutMode = STATE.pendingLayoutMode; schema.settings = settings; }
  if (Object.keys(STATE.pendingPlacement).length) applyFieldPlacements(schema.fields || [], STATE.pendingPlacement);
  if (STATE.pendingPremiumGridConvert) { settings.customHtml = wrapPremiumStepsIntoFlexGrid(String(settings.customHtml || settings.CustomHtml || '')); schema.settings = settings; }
  if (Object.keys(STATE.pendingPremiumPlacement).length) { settings.customHtml = applyPremiumPlacements(String(settings.customHtml || settings.CustomHtml || ''), STATE.pendingPremiumPlacement); schema.settings = settings; }
}

function resetAllPending(): void {
  STATE.pendingShell = {}; STATE.pendingFields = {}; STATE.pendingLayout = {}; STATE.pendingOrder = null; STATE.pendingRowSpan = {}; STATE.pendingOptions = {}; STATE.pendingSubmit = null; STATE.pendingImages = {}; STATE.pendingCompositeSub = {}; STATE.pendingBlocks = {}; STATE.pendingPlacement = {}; STATE.pendingLayoutMode = null; STATE.pendingPremiumGridConvert = false; STATE.pendingPremiumPlacement = {}; STATE.pendingFormTitle = null; STATE.pendingFormDescription = null; STATE.pendingHeroStyles = {}; STATE.dirty = false;
}

/** [InlineEdit→Builder 20260630] In the builder DESIGN preview, persist by POSTing a patch to the
 *  PARENT builder (which merges into its in-memory schema + marks dirty); the host then Saves/Publishes
 *  from the builder. NEVER POST to the DB here — that would clobber the builder's unsaved theme/field
 *  edits. Source = the in-iframe schema snapshot (STATE.cfg.schema = the builder's schema). */
function savePreviewPatch(): void {
  setPill('<i class="fas fa-spinner fa-spin"></i> ' + t('ie.applying'), 'is-saving');
  try {
    const schema: any = JSON.parse(JSON.stringify(STATE.cfg!.schema || {}));
    const settings: any = schema.settings || schema.Settings || {};
    applyAllPending(schema, settings);
    schema.settings = settings;
    const schemaForSave: any = {};
    for (const k in schema) { if (k !== 'settings' && k !== 'Settings') schemaForSave[k] = schema[k]; }
    // [SecFix 2026-07-04 P2-8] Post the schema/settings ONLY to the same-origin parent (the builder
    // that created this preview iframe). Previously the target origin was derived from
    // document.referrer, which a page that cross-embeds the builder preview could poison to receive
    // the form's full schema + custom HTML/CSS. The preview iframe is same-origin with its parent, so
    // its own origin is the correct target; document.referrer is never used.
    let targetOrigin = window.location.origin;
    if (!targetOrigin || targetOrigin === 'null') {
      // Opaque origin (e.g. srcdoc): fall back to the same-origin parent's concrete origin.
      try { targetOrigin = window.parent.location.origin; } catch { targetOrigin = window.location.origin; }
    }
    window.parent.postMessage({
      type: 'mf-inline-edit-apply',
      formId: STATE.cfg!.formId,
      schemaJson: JSON.stringify(schemaForSave),
      settingsJson: JSON.stringify(settings),
      submitButtonText: (STATE.pendingSubmit != null ? STATE.pendingSubmit.replace : undefined),
      title: (STATE.pendingFormTitle != null ? STATE.pendingFormTitle : undefined),
      description: (STATE.pendingFormDescription != null ? STATE.pendingFormDescription : undefined),
    }, targetOrigin);
    resetAllPending();
    setPill('<i class="fas fa-check"></i> ' + t('ie.saved_to_form'), 'is-saved');
    setTimeout(() => { const p = document.getElementById('mf-ie-savepill'); if (p) p.classList.remove('is-dirty', 'is-saved', 'is-saving'); }, 2800);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mf-inline-edit] preview apply failed', err);
    setPill('<i class="fas fa-triangle-exclamation"></i> ' + t('ie.error_retry'), 'is-error');
  }
}

async function save(): Promise<void> {
  if (!STATE.cfg) return;
  const fid = STATE.cfg.formId;
  if (!fid) return;
  // Builder DESIGN preview → patch the parent builder (no DB write).
  if (STATE.cfg.isPreview) { savePreviewPatch(); return; }
  // ── Legacy public-form DB save (GET→apply→POST). Retired path (inline-edit no longer activates on
  //    the public view), kept defensively for any future re-enable. ──
  setPill('<i class="fas fa-spinner fa-spin"></i> ' + t('ie.saving'), 'is-saving');
  try {
    // 1. GET the current full form (GET /api/MegaForm/Form/{id} — reliable single-form entity).
    const res = await fetch(apiBase() + 'Form/' + encodeURIComponent(String(fid)), { credentials: 'include' });
    if (!res.ok) throw new Error('load ' + res.status);
    const data = await res.json();
    const get = (k: string) => (data[k] !== undefined ? data[k] : data[k.charAt(0).toUpperCase() + k.slice(1)]);
    let schema: any = {};
    try { const raw = get('schemaJson'); schema = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch { schema = {}; }
    let settings: any = schema.settings || schema.Settings || {};
    try { const raw = get('settingsJson'); if (raw) settings = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { /* keep */ }

    applyAllPending(schema, settings);

    // 4. POST the WHOLE entity back — echo every field from the GET, override schema/settings ONLY.
    const mid = parseInt(String(get('moduleId') || 0), 10) || 0;
    const sid = parseInt(String(get('siteId') || 0), 10) || 0;
    // [dedup-payload 20260630] Settings (incl. the big customHtml/customCss shell) ship in the
    // dedicated SettingsJson column; the server's RenderModelResolver overlays SettingsJson onto the
    // schema at resolve time (GetOrCreateSettings → OverlaySavedSettings), so SchemaJson does NOT
    // need an embedded settings copy. Strip it so a premium inline-edit save no longer serializes the
    // multi-KB shell TWICE (a co-factor in the oversized-POST class of failures).
    const schemaForSave: any = {};
    for (const k in schema) { if (k !== 'settings' && k !== 'Settings') schemaForSave[k] = schema[k]; }
    const entity: any = {
      FormId: fid,
      ModuleId: mid,
      SiteId: sid,
      Title: STATE.pendingFormTitle != null ? STATE.pendingFormTitle : (get('title') || schema.title || ''),
      Description: STATE.pendingFormDescription != null ? STATE.pendingFormDescription : (get('description') || schema.description || ''),
      SchemaJson: JSON.stringify(schemaForSave),
      SettingsJson: JSON.stringify(settings),
      ThemeJson: get('themeJson') || '',
      Status: get('status') || 'Published',
      SubmitButtonText: (STATE.pendingSubmit != null ? STATE.pendingSubmit.replace : (get('submitButtonText') || 'Submit')),
      SuccessMessage: get('successMessage') || '',
      RedirectUrl: get('redirectUrl') || '',
      NotifyEmails: get('notifyEmails') || '',
      WebhookUrl: get('webhookUrl') || '',
      EnableCaptcha: !!get('enableCaptcha'),
      RequireAuth: !!get('requireAuth'),
      EnableSaveResume: !!get('enableSaveResume'),
      RulesJson: JSON.stringify((schema.rules || schema.Rules || [])),
      // Echo the workflow envelope: SaveForm does a FULL-row EF Update + null-normalize, so any
      // FormDto column we omit gets wiped. WorkflowJson is the one column the hand-built entity
      // was missing → preserve it verbatim so an inline-edit save never destroys a form workflow.
      WorkflowJson: get('workflowJson') || '',
    };
    let url = apiBase() + 'Form';
    const qs: string[] = [];
    if (mid > 0) qs.push('authmoduleid=' + mid);
    if (sid > 0) qs.push('authsiteid=' + sid);
    if (qs.length) url += '?' + qs.join('&');
    const saveRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(entity) });
    if (!saveRes.ok) throw new Error('save ' + saveRes.status);
    // success
    resetAllPending();
    setPill('<i class="fas fa-check"></i> ' + t('ie.saved_reloading'), 'is-saved');
    setTimeout(() => { location.reload(); }, 700);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mf-inline-edit] save failed', err);
    setPill('<i class="fas fa-triangle-exclamation"></i> ' + t('ie.save_failed_retry'), 'is-error');
    const pill = document.getElementById('mf-ie-savepill') as HTMLElement | null;
    if (pill) pill.classList.add('is-dirty');
  }
}

/** Replace the `occ`-th occurrence (0-based) of `find` as visible text between tags (a text
 *  node), NEVER inside an attribute/token. `find` is whitespace-normalized (plainText), so the
 *  pattern allows any whitespace run between words + around the text — this matches multi-space
 *  / newline-wrapped source that a literal match would miss. If the target index isn't present
 *  (DOM↔string drift) it replaces the FIRST text-node match; if there is no text-node match at
 *  all it leaves the html untouched (rather than a blind indexOf that could corrupt markup). */
function swapTextOnly(html: string, find: string, replace: string, occ?: number): string {
  if (!find) return html;
  const target = Math.max(0, occ || 0);
  // Entity-tolerant, whitespace-flexible pattern. The `find` comes from the DECODED DOM (e.g. "·"),
  // but the raw customHtml stores HTML ENTITIES ("&middot;", "&#183;"). Escape regex specials, collapse
  // whitespace to \s+, and for each &/non-ASCII char allow both the literal char AND its entity forms —
  // otherwise a shell string containing &middot;/&amp;/&copy;/… (e.g. the form footer) never matched.
  let esc = '';
  for (const ch of find) {
    if (/\s/.test(ch)) { esc += ' '; continue; }
    const code = ch.codePointAt(0) || 0;
    if (ch === '&') { esc += '(?:&|&amp;)'; }
    else if (code > 127) {
      const lit = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      esc += '(?:' + lit + '|&#0*' + code + ';|&#[xX]0*' + code.toString(16) + ';|&[a-zA-Z][a-zA-Z0-9]+;)';
    } else { esc += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  }
  esc = esc.replace(/ +/g, '\\s+');
  const re = new RegExp('(>\\s*)' + esc + '(\\s*<)', 'g');
  let i = 0; let hit = false;
  const out = html.replace(re, (_m, a, b) => {
    if (i++ === target) { hit = true; return a + escapeHtml(replace) + b; }
    return _m;
  });
  if (hit) return out;
  // target index not reached → replace the FIRST text-node match; if none, return unchanged.
  let j = 0;
  return html.replace(re, (_m, a, b) => (j++ === 0 ? a + escapeHtml(replace) + b : _m));
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

function cssIdent(s: string): string {
  try {
    const css = (window as any).CSS;
    if (css && typeof css.escape === 'function') return css.escape(String(s || ''));
  } catch { /* fallback below */ }
  return String(s || '').replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch);
}

function currentRoot(): HTMLElement | null {
  return (STATE.cfg && STATE.cfg.container)
    || document.querySelector('[id^="mf-form-wrapper-"], [id^="mf-form-"], .mf-form, .mfp') as HTMLElement | null;
}

function formScopeSelector(): string {
  const root = currentRoot();
  if (root && root.id) return '#' + cssIdent(root.id);
  return '.mf-form-wrapper,.mf-form';
}

function classPart(el: HTMLElement): string {
  const classes = String(el.className || '').split(/\s+/)
    .filter((c) => c && !/^mf-ie/.test(c) && c !== 'active' && c !== 'is-active' && c !== 'mf-ie-textwrap' && c.indexOf('fa-') !== 0 && c !== 'fas' && c !== 'far' && c !== 'fa');
  if (classes.length) return '.' + cssIdent(classes[0]);
  const tag = el.tagName ? el.tagName.toLowerCase() : '*';
  const p = el.parentElement;
  if (!p) return tag;
  const sibs = Array.prototype.filter.call(p.children, (c: Element) => c.tagName === el.tagName) as Element[];
  const idx = Math.max(0, sibs.indexOf(el)) + 1;
  return tag + ':nth-of-type(' + idx + ')';
}

function heroStyleSelector(el: HTMLElement): string {
  const saved = el.getAttribute('data-mf-ie-style-sel') || '';
  if (saved) return saved;
  const scope = formScopeSelector();
  if (el.classList.contains('mf-form-title')) return scope + ' .mf-form-title';
  if (el.classList.contains('mf-form-description')) return scope + ' .mf-form-description';
  const shell = el.closest('.mfp, [class*="mfp-"]') as HTMLElement | null;
  if (!shell) {
    const direct = scope + ' ' + classPart(el);
    el.setAttribute('data-mf-ie-style-sel', direct);
    return direct;
  }
  const shellCls = String(shell.className || '').split(/\s+/).filter((c) => /^mfp/.test(c))[0]
    || String(shell.className || '').split(/\s+/).filter(Boolean)[0] || '';
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== shell) {
    parts.unshift(classPart(cur));
    cur = cur.parentElement;
  }
  const sel = scope + (shellCls ? ' .' + cssIdent(shellCls) : '') + (parts.length ? ' ' + parts.join(' > ') : '');
  el.setAttribute('data-mf-ie-style-sel', sel);
  return sel;
}

function isHeroTextStyleTarget(el: HTMLElement): boolean {
  const kind = el.getAttribute('data-mf-ie-kind') || '';
  if (kind === 'form-title' || kind === 'form-description') return true;
  if (kind !== 'shell') return false;
  const cls = String(el.className || '') + ' ' + String((el.parentElement && el.parentElement.className) || '');
  return /hero|brand|title|subtitle|tagline|eyebrow|head|copy|caption/i.test(cls)
    || /^H[1-3]$/i.test(el.tagName || '')
    || !!el.closest('header,aside,footer,[class*="head"],[class*="hero"],[class*="brand"]');
}

function toHexColor(value: string): string {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/i.test(raw)) return '#' + raw.slice(1).split('').map((ch) => ch + ch).join('');
  const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return '#111827';
  const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return '#' + hex(parseInt(m[1], 10)) + hex(parseInt(m[2], 10)) + hex(parseInt(m[3], 10));
}

function normalizeHexColor(value: string): string {
  const raw = String(value || '').trim();
  const withHash = raw.charAt(0) === '#' ? raw : ('#' + raw);
  if (/^#[0-9a-f]{6}$/i.test(withHash)) return withHash.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(withHash)) return ('#' + withHash.slice(1).split('').map((ch) => ch + ch).join('')).toLowerCase();
  return '';
}

const HERO_STYLE_PROPS: Record<string, boolean> = {
  'font-family': true,
  color: true,
  'font-size': true,
  'line-height': true,
  'font-weight': true,
  width: true,
  height: true,
  'object-fit': true,
  'min-height': true,
  'background-size': true,
  'background-position': true,
};

function cleanStyleValue(prop: string, value: string): string {
  const v = String(value || '').trim();
  if (!v || !HERO_STYLE_PROPS[prop]) return '';
  if (prop === 'color') return normalizeHexColor(v);
  if (prop === 'font-size' || prop === 'line-height' || prop === 'height' || prop === 'min-height') {
    return /^\d{1,4}(\.\d{1,2})?px$/.test(v) ? v : '';
  }
  if (prop === 'width') return /^(\d{1,3}(\.\d{1,2})?%|\d{1,4}(\.\d{1,2})?px)$/.test(v) ? v : '';
  if (prop === 'font-weight') return /^(400|500|600|700|800|900|normal|bold)$/.test(v) ? v : '';
  if (prop === 'object-fit') return /^(cover|contain|fill|none|scale-down)$/.test(v) ? v : '';
  if (prop === 'background-size') return /^(cover|contain|auto|\d{1,3}%|\d{1,4}px)$/.test(v) ? v : '';
  if (prop === 'background-position') return /^[a-z0-9% .-]{1,40}$/i.test(v) ? v : '';
  if (prop === 'font-family') {
    return /^[a-zA-Z0-9 ,"'-]{1,120}$/.test(v) ? v : '';
  }
  return '';
}

function queueHeroStyle(selector: string, props: Record<string, string>, liveEl?: HTMLElement): void {
  if (!selector) return;
  const clean: Record<string, string> = {};
  Object.keys(props || {}).forEach((p) => {
    const v = cleanStyleValue(p, props[p]);
    if (v) clean[p] = v;
  });
  if (!Object.keys(clean).length) return;
  const bucket = STATE.pendingHeroStyles[selector] || {};
  Object.keys(clean).forEach((p) => { bucket[p] = clean[p]; });
  STATE.pendingHeroStyles[selector] = bucket;
  const applyTo = (node: HTMLElement) => {
    Object.keys(clean).forEach((p) => node.style.setProperty(p, clean[p], 'important'));
  };
  if (liveEl) applyTo(liveEl);
  try { Array.prototype.forEach.call(document.querySelectorAll(selector), (node: HTMLElement) => applyTo(node)); } catch { /* selector may be scoped to persisted page */ }
  markDirty();
}

function placePanel(panel: HTMLElement, anchor: HTMLElement): void {
  const r = anchor.getBoundingClientRect();
  const top = Math.max(8, Math.min(window.innerHeight - 260, r.bottom + 8));
  const left = Math.max(8, Math.min(window.innerWidth - 300, r.left));
  panel.style.top = Math.round(top) + 'px';
  panel.style.left = Math.round(left) + 'px';
}

function closeFloatingPanels(exceptId?: string): void {
  ['mf-ie-hero-style-panel', 'mf-ie-image-panel'].forEach((id) => {
    if (id === exceptId) return;
    const old = document.getElementById(id);
    if (old && old.parentNode) old.parentNode.removeChild(old);
  });
}

function openHeroTextStylePanel(el: HTMLElement): void {
  closeFloatingPanels('mf-ie-hero-style-panel');
  const old = document.getElementById('mf-ie-hero-style-panel');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  const selector = heroStyleSelector(el);
  const cs = getComputedStyle(el);
  const size = Math.round(parseFloat(cs.fontSize || '16')) || 16;
  const lhRaw = parseFloat(cs.lineHeight || '');
  const lineHeight = isFinite(lhRaw) ? Math.round(lhRaw) : Math.round(size * 1.25);
  const hexColor = toHexColor(cs.color || '');
  const fonts = ['', 'Inter', 'DM Serif Display', 'Libre Franklin', 'Georgia', 'Arial', 'Times New Roman'];
  const panel = document.createElement('div');
  panel.id = 'mf-ie-hero-style-panel';
  panel.className = 'mf-ie-hero-panel';
  panel.innerHTML =
    '<div class="mf-ie-hero-panel-head"><span><i class="fas fa-wand-magic-sparkles"></i> Text style</span><button type="button" data-act="close">&times;</button></div>' +
    '<label>Font<select data-prop="font-family">' + fonts.map((f) => '<option value="' + escapeAttr(f ? "'" + f + "', sans-serif" : '') + '">' + escapeHtml(f || 'Theme') + '</option>').join('') + '</select></label>' +
    '<div class="mf-ie-hero-row mf-ie-hero-row--color"><label>Color<input type="color" data-prop="color" value="' + hexColor + '"></label><label>Hex<input type="text" data-role="color-hex" value="' + hexColor + '" spellcheck="false" placeholder="#111827"></label></div>' +
    '<div class="mf-ie-hero-row"><label>Size<input type="number" min="8" max="120" step="1" data-prop="font-size" value="' + size + '"></label><label>Line<input type="number" min="10" max="160" step="1" data-prop="line-height" value="' + lineHeight + '"></label></div>' +
    '<label>Weight<select data-prop="font-weight"><option>400</option><option>500</option><option>600</option><option>700</option><option>800</option><option>900</option></select></label>';
  document.body.appendChild(panel);
  placePanel(panel, el);
  panel.addEventListener('mousedown', (ev) => ev.stopPropagation());
  (panel.querySelector('[data-act="close"]') as HTMLElement).addEventListener('click', () => { if (panel.parentNode) panel.parentNode.removeChild(panel); });
  const weight = panel.querySelector('[data-prop="font-weight"]') as HTMLSelectElement | null;
  if (weight) weight.value = String(Math.round(parseFloat(cs.fontWeight || '400')) || 400);
  const colorInput = panel.querySelector('[data-prop="color"]') as HTMLInputElement | null;
  const hexInput = panel.querySelector('[data-role="color-hex"]') as HTMLInputElement | null;
  if (hexInput) {
    const applyHex = () => {
      const next = normalizeHexColor(hexInput.value);
      if (!next) { hexInput.classList.add('is-invalid'); return; }
      hexInput.classList.remove('is-invalid');
      hexInput.value = next;
      if (colorInput) colorInput.value = next;
      queueHeroStyle(selector, { color: next }, el);
    };
    hexInput.addEventListener('change', applyHex);
    hexInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); applyHex(); } });
  }
  Array.prototype.forEach.call(panel.querySelectorAll('[data-prop]'), (ctrl: HTMLInputElement | HTMLSelectElement) => {
    ctrl.addEventListener('input', () => {
      const prop = ctrl.getAttribute('data-prop') || '';
      let val = ctrl.value;
      if (prop === 'color' && hexInput) hexInput.value = normalizeHexColor(val) || val;
      if (prop === 'font-size' || prop === 'line-height') val = String(Math.max(1, parseFloat(val) || 1)) + 'px';
      queueHeroStyle(selector, { [prop]: val }, el);
    });
    ctrl.addEventListener('change', () => {
      const prop = ctrl.getAttribute('data-prop') || '';
      let val = ctrl.value;
      if (prop === 'color' && hexInput) hexInput.value = normalizeHexColor(val) || val;
      if (prop === 'font-size' || prop === 'line-height') val = String(Math.max(1, parseFloat(val) || 1)) + 'px';
      queueHeroStyle(selector, { [prop]: val }, el);
    });
  });
}

function openImageStylePanel(el: HTMLElement, mode: 'img' | 'bg'): void {
  closeFloatingPanels('mf-ie-image-panel');
  const old = document.getElementById('mf-ie-image-panel');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  const selector = heroStyleSelector(el);
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const currentUrl = mode === 'img'
    ? ((el as HTMLImageElement).getAttribute('src') || '')
    : (el.getAttribute('data-mf-ie-bg-orig') || bgUrlOf(el));
  const panel = document.createElement('div');
  panel.id = 'mf-ie-image-panel';
  panel.className = 'mf-ie-hero-panel mf-ie-image-panel';
  if (mode === 'img') {
    const parentW = (el.parentElement && el.parentElement.getBoundingClientRect().width) || rect.width || 1;
    const widthPct = Math.max(5, Math.min(100, Math.round((rect.width / parentW) * 100)));
    panel.innerHTML =
      '<div class="mf-ie-hero-panel-head"><span><i class="fas fa-image"></i> Image</span><button type="button" data-act="close">&times;</button></div>' +
      '<button type="button" class="mf-ie-panel-primary" data-act="change"><i class="fas fa-images"></i> Gallery / upload</button>' +
      '<label>Image URL<input type="text" data-role="image-url" value="' + escapeAttr(currentUrl) + '" spellcheck="false" placeholder="/Modules/MegaForm/... or https://..."></label>' +
      '<button type="button" class="mf-ie-panel-secondary" data-act="apply-url"><i class="fas fa-check"></i> Apply URL</button>' +
      '<div class="mf-ie-hero-row"><label>Width %<input type="number" min="5" max="100" step="1" data-prop="width" value="' + widthPct + '"></label><label>Height px<input type="number" min="80" max="1400" step="10" data-prop="height" value="' + Math.round(rect.height || 320) + '"></label></div>' +
      '<label>Fit<select data-prop="object-fit"><option>cover</option><option>contain</option><option>fill</option><option>scale-down</option></select></label>';
  } else {
    const bgSize = (cs.backgroundSize || 'cover').split(',')[0].trim() || 'cover';
    const bgPos = (cs.backgroundPosition || 'center center').split(',')[0].trim() || 'center center';
    panel.innerHTML =
      '<div class="mf-ie-hero-panel-head"><span><i class="fas fa-image"></i> Background</span><button type="button" data-act="close">&times;</button></div>' +
      '<button type="button" class="mf-ie-panel-primary" data-act="change"><i class="fas fa-images"></i> Gallery / upload</button>' +
      '<label>Image URL<input type="text" data-role="image-url" value="' + escapeAttr(currentUrl) + '" spellcheck="false" placeholder="/Modules/MegaForm/... or https://..."></label>' +
      '<button type="button" class="mf-ie-panel-secondary" data-act="apply-url"><i class="fas fa-check"></i> Apply URL</button>' +
      '<label>Height px<input type="number" min="120" max="1600" step="10" data-prop="min-height" value="' + Math.round(rect.height || 360) + '"></label>' +
      '<div class="mf-ie-hero-row"><label>Size<select data-prop="background-size"><option>cover</option><option>contain</option><option>auto</option></select></label><label>Position<select data-prop="background-position"><option>center center</option><option>center top</option><option>center bottom</option><option>left center</option><option>right center</option></select></label></div>';
    setTimeout(() => {
      const sizeEl = panel.querySelector('[data-prop="background-size"]') as HTMLSelectElement | null;
      const posEl = panel.querySelector('[data-prop="background-position"]') as HTMLSelectElement | null;
      if (sizeEl && Array.prototype.some.call(sizeEl.options, (o: HTMLOptionElement) => o.value === bgSize)) sizeEl.value = bgSize;
      if (posEl && Array.prototype.some.call(posEl.options, (o: HTMLOptionElement) => o.value === bgPos)) posEl.value = bgPos;
    }, 0);
  }
  document.body.appendChild(panel);
  placePanel(panel, el);
  panel.addEventListener('mousedown', (ev) => ev.stopPropagation());
  (panel.querySelector('[data-act="close"]') as HTMLElement).addEventListener('click', () => { if (panel.parentNode) panel.parentNode.removeChild(panel); });
  (panel.querySelector('[data-act="change"]') as HTMLElement).addEventListener('click', () => {
    if (mode === 'img') pickImageUrl((el as HTMLImageElement).getAttribute('src') || '', (url) => commitImage(el as HTMLImageElement, url));
    else pickImageUrl(el.getAttribute('data-mf-ie-bg-orig') || bgUrlOf(el), (url) => commitBg(el, url));
  });
  const urlInput = panel.querySelector('[data-role="image-url"]') as HTMLInputElement | null;
  const applyUrlBtn = panel.querySelector('[data-act="apply-url"]') as HTMLElement | null;
  const applyUrl = () => {
    const u = urlInput ? String(urlInput.value || '').trim() : '';
    if (!u) return;
    if (!isAllowedImageUrl(u)) { if (urlInput) urlInput.classList.add('is-invalid'); return; }
    if (urlInput) urlInput.classList.remove('is-invalid');
    if (mode === 'img') commitImage(el as HTMLImageElement, u);
    else commitBg(el, u);
  };
  if (applyUrlBtn) applyUrlBtn.addEventListener('click', applyUrl);
  if (urlInput) urlInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); applyUrl(); } });
  const fit = panel.querySelector('[data-prop="object-fit"]') as HTMLSelectElement | null;
  if (fit) fit.value = /^(cover|contain|fill|scale-down)$/.test(cs.objectFit || '') ? cs.objectFit : 'cover';
  Array.prototype.forEach.call(panel.querySelectorAll('[data-prop]'), (ctrl: HTMLInputElement | HTMLSelectElement) => {
    const apply = () => {
      const prop = ctrl.getAttribute('data-prop') || '';
      let val = ctrl.value;
      if (prop === 'width') val = String(Math.max(5, Math.min(100, parseFloat(val) || 100))) + '%';
      if (prop === 'height' || prop === 'min-height') val = String(Math.max(1, parseFloat(val) || 1)) + 'px';
      queueHeroStyle(selector, { [prop]: val }, el);
    };
    ctrl.addEventListener('input', apply);
    ctrl.addEventListener('change', apply);
  });
}

function parseHeroStylesRegion(css: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const s = css.indexOf(MF_IE_HERO_START); const e = css.indexOf(MF_IE_HERO_END);
  if (s < 0 || e < 0 || e < s) return out;
  const region = css.slice(s + MF_IE_HERO_START.length, e);
  const re = /([^{}]+)\{([^{}]*)\}/g; let m: RegExpExecArray | null;
  while ((m = re.exec(region))) {
    const sel = (m[1] || '').trim();
    if (!sel) continue;
    const body: Record<string, string> = {};
    String(m[2] || '').split(';').forEach((decl) => {
      const idx = decl.indexOf(':');
      if (idx <= 0) return;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const val = cleanStyleValue(prop, decl.slice(idx + 1).replace(/!important/gi, '').trim());
      if (val) body[prop] = val;
    });
    if (Object.keys(body).length) out[sel] = body;
  }
  return out;
}

function stripHeroStylesRegion(css: string): string {
  const s = css.indexOf(MF_IE_HERO_START); const e = css.indexOf(MF_IE_HERO_END);
  if (s < 0 || e < 0 || e < s) return css;
  return (css.slice(0, s) + css.slice(e + MF_IE_HERO_END.length)).replace(/\n{3,}/g, '\n\n').trim();
}

function buildHeroStylesRegion(map: Record<string, Record<string, string>>): string {
  const lines: string[] = [];
  Object.keys(map || {}).forEach((sel) => {
    const props = map[sel] || {};
    const decls: string[] = [];
    Object.keys(props).forEach((p) => {
      const v = cleanStyleValue(p, props[p]);
      if (v) decls.push(p + ':' + v + '!important');
    });
    if (sel && decls.length) lines.push(sel + '{' + decls.join(';') + '}');
  });
  return lines.length ? (MF_IE_HERO_START + '\n' + lines.join('\n') + '\n' + MF_IE_HERO_END) : '';
}

function applyHeroStyleOverrides(settings: any, pending: Record<string, Record<string, string>>): void {
  let css = String(settings.customCss || settings.CustomCss || '');
  let html = String(settings.customHtml || settings.CustomHtml || '');
  const merged = Object.assign({}, parseHeroStylesRegion(css), parseHeroStylesRegion(html));
  Object.keys(pending || {}).forEach((sel) => {
    merged[sel] = Object.assign({}, merged[sel] || {}, pending[sel] || {});
  });
  css = stripHeroStylesRegion(css);
  html = html.replace(MF_IE_HERO_STYLE_RE, '');
  const region = buildHeroStylesRegion(merged);
  if (html.trim()) {
    if (region) html = html.replace(/\s+$/, '') + '\n' + MF_IE_HERO_STYLE_OPEN + region + '</style>';
    settings.customHtml = html;
    if (settings.CustomHtml !== undefined) settings.CustomHtml = html;
    settings.customCss = css;
    if (settings.CustomCss !== undefined) settings.CustomCss = css;
    return;
  }
  const out = region ? (css.replace(/\s+$/, '') + '\n\n' + region + '\n').trim() : css;
  settings.customCss = out;
  if (settings.CustomCss !== undefined) settings.CustomCss = out;
}

function applyFieldLabels(fields: any[], map: Record<string, string>): void {
  (fields || []).forEach((f: any) => {
    if (!f) return;
    const k = f.key || f.Key;
    if (k && Object.prototype.hasOwnProperty.call(map, k)) { f.label = map[k]; if (f.Label !== undefined) f.Label = map[k]; }
    const cols = f.columns || f.Columns;
    if (Array.isArray(cols)) cols.forEach((c: any) => applyFieldLabels((c && (c.fields || c.Fields)) || [], map));
  });
}

/** Apply option-label edits to field.options[].label, matching the option by its value. */
function applyOptionLabels(fields: any[], map: Record<string, { fieldKey: string; value: string; label: string }>): void {
  const byField: Record<string, Array<{ value: string; label: string }>> = {};
  Object.keys(map).forEach((k) => { const e = map[k]; (byField[e.fieldKey] = byField[e.fieldKey] || []).push({ value: e.value, label: e.label }); });
  (fields || []).forEach((f: any) => {
    if (!f) return;
    const k = f.key || f.Key;
    const opts = f.options || f.Options;
    if (k && byField[k] && Array.isArray(opts)) {
      byField[k].forEach((e) => {
        const o = opts.find((o: any) => o && String(o.value !== undefined ? o.value : o.Value) === e.value);
        if (o) { o.label = e.label; if (o.Label !== undefined) o.Label = e.label; }
      });
    }
    const cols = f.columns || f.Columns;
    if (Array.isArray(cols)) cols.forEach((c: any) => applyOptionLabels((c && (c.fields || c.Fields)) || [], map));
  });
}

/** Apply composite sub-label edits to field.widgetProps.parts[].sublabel. Because the renderer
 *  returns wp.parts AS-IS when present (a partial array would drop the other parts), we MATERIALIZE
 *  the COMPLETE parts array the renderer would produce (compositePartsFor) — deep-cloned so the
 *  shared preset registry is never mutated — then set the edited part's sublabel and write the
 *  full array back. Both the TS hydrate path and the C# SSR honour stored widgetProps.parts, so a
 *  single write keeps render parity. Walks nested Row/Section columns. */
function applyCompositeSubs(fields: any[], map: Record<string, { fieldKey: string; partKey: string; sublabel: string }>): void {
  const byField: Record<string, Array<{ partKey: string; sublabel: string }>> = {};
  Object.keys(map).forEach((k) => { const e = map[k]; (byField[e.fieldKey] = byField[e.fieldKey] || []).push({ partKey: e.partKey, sublabel: e.sublabel }); });
  const walk = (fs: any[]): void => {
    (fs || []).forEach((f: any) => {
      if (!f) return;
      const k = f.key || f.Key;
      if (k && byField[k]) {
        let parts: any[] = [];
        try { parts = JSON.parse(JSON.stringify(compositePartsFor(f) || [])); } catch { parts = []; }
        if (Array.isArray(parts) && parts.length) {
          byField[k].forEach((e) => {
            const p = parts.find((x: any) => x && (x.key === e.partKey || x.Key === e.partKey));
            if (p) { p.sublabel = e.sublabel; if (p.Sublabel !== undefined) p.Sublabel = e.sublabel; }
          });
          const wp = f.widgetProps || f.WidgetProps || {};
          wp.parts = parts;
          f.widgetProps = wp;
          if (f.WidgetProps !== undefined) f.WidgetProps = wp;
        }
      }
      const cols = f.columns || f.Columns;
      if (Array.isArray(cols)) cols.forEach((c: any) => walk((c && (c.fields || c.Fields)) || []));
    });
  };
  walk(fields);
}

// ── visual field layout: mouse RESIZE (width, snap-to-grid) + DRAG reorder ───────
// Reuses the PDF-form widget's snap concept (FieldOverlay.snapTo): the renderer drives a
// field's width from `field.width` → a `data-width` percent the CSS turns into a flex-basis,
// so width snaps to the renderer's supported 12-col breakpoints (25/33/50/66/100% =
// 3/4/6/8/12 cols). Reorder rewrites the top-level field-key order. ALL gated to host edit
// mode, applied live for preview only; nothing persists until Save round-trips the schema.
const MF_WIDTHS = [
  { pct: 25, css: '25%', cols: 3 }, { pct: 33, css: '33%', cols: 4 },
  { pct: 50, css: '50%', cols: 6 }, { pct: 66, css: '66%', cols: 8 },
  { pct: 100, css: '100%', cols: 12 },
];

/** Snap a 0..1 width fraction to the nearest supported breakpoint (the form's column grid). */
function snapWidth(fraction: number): { css: string } {
  const target = Math.max(0, Math.min(1, fraction)) * 100;
  let best = MF_WIDTHS[MF_WIDTHS.length - 1];
  let bestD = Infinity;
  MF_WIDTHS.forEach((w) => { const d = Math.abs(w.pct - target); if (d < bestD) { bestD = d; best = w; } });
  return best;
}

/** The flow-layout field-groups eligible for resize/drag: DIRECT children of a .mf-page or the
 *  fields container (i.e. standalone top-level fields). Excludes Row sub-fields and fields
 *  embedded in premium customHtml grids (those need a customHtml reflow — out of scope here). */
function layoutEligibleFields(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const containers = root.querySelectorAll('.mf-fields-container, .mf-fields-container > .mf-page');
  Array.prototype.forEach.call(containers, (cont: HTMLElement) => {
    Array.prototype.forEach.call(cont.children, (ch: HTMLElement) => {
      if (!ch.classList || !ch.classList.contains('mf-field-group')) return;
      const key = ch.getAttribute('data-key');
      const type = (ch.getAttribute('data-type') || '').toLowerCase();
      if (!key || type === 'section' || type === 'hidden') return;
      out.push(ch);
    });
  });
  return out;
}

// ── image swap (hero / shell <img>) ─────────────────────────────────────────
/** Host pastes/picks a URL: only same-origin paths, data: images and http(s) URLs are allowed
 *  (blocks javascript:/other schemes). The host edits their own form, so URLs aren't restricted
 *  to a host allowlist — but the scheme is. */
function isAllowedImageUrl(u: string): boolean {
  if (/^data:image\//i.test(u)) return true;
  if (/^\/[^/]/.test(u) || /^\.\.?\//.test(u)) return true;       // same-origin path
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

function addPendingImageSwap(oldUrl: string, newUrl: string): void {
  const u = String(newUrl || '').trim();
  const add = (v: string) => {
    const key = String(v || '').trim();
    if (key && key !== u) STATE.pendingImages[key] = u;
  };
  const orig = String(oldUrl || '').trim();
  add(orig);
  try {
    const base = document.referrer || window.location.href;
    const parsed = new URL(orig, base);
    add(parsed.href);
    add(parsed.pathname + parsed.search + parsed.hash);
  } catch {
    const m = /^https?:\/\/[^/]+(\/.*)$/i.exec(orig);
    if (m && m[1]) add(m[1]);
  }
}

/** Open the best available image source: the built-in lightweight gallery (Upload/List +
 *  Upload/Image, works on the rendered page) → the builder's MFTokenDesigner gallery if it
 *  happens to be on the page → a plain URL prompt as the last resort. */
function pickImageUrl(current: string, onPick: (url: string) => void): void {
  try {
    const td = (window as any).MFTokenDesigner;
    if (td && typeof td.openGalleryPicker === 'function') { td.openGalleryPicker((url: string) => onPick(url)); return; }
  } catch { /* fall through to built-in */ }
  try { openMfGalleryPicker(current, onPick); return; } catch { /* fall through to prompt */ }
  const next = window.prompt(t('ie.prompt_new_image_url'), current);
  if (next != null) onPick(next);
}

function onImageClick(e: Event): void {
  e.preventDefault(); e.stopPropagation();
  const img = e.currentTarget as HTMLImageElement;
  openImageStylePanel(img, 'img');
}

function commitImage(img: HTMLImageElement, url: string): void {
  const u = String(url || '').trim();
  const cur = img.getAttribute('src') || '';
  if (!u || u === cur) return;
  if (!isAllowedImageUrl(u)) { try { window.alert(t('ie.invalid_image_url')); } catch {} return; }
  const orig = img.getAttribute('data-mf-ie-img-orig') || cur;
  img.setAttribute('src', u);
  addPendingImageSwap(orig, u);
  try { addPendingImageSwap(img.src || '', u); } catch { /* origin not comparable - ignore */ }
  markDirty();
}

/** Extract the url(...) target of an element's background-image — preferring the inline style
 *  (its literal stored form) over the computed value (which the browser absolutizes). */
function bgUrlOf(el: HTMLElement): string {
  const pick = (s: string): string => { const m = /url\((['"]?)(.*?)\1\)/i.exec(s || ''); return m ? String(m[2] || '') : ''; };
  const inline = el.style && el.style.backgroundImage ? pick(el.style.backgroundImage) : '';
  if (inline) return inline;
  try { return pick(getComputedStyle(el).backgroundImage || ''); } catch { return ''; }
}

function onBgClick(e: Event): void {
  e.preventDefault(); e.stopPropagation();
  const el = e.currentTarget as HTMLElement;
  openImageStylePanel(el, 'bg');
}

/** Commit a background-image swap. Records the old→new mapping under the captured (stored-form)
 *  URL AND its origin-stripped variant, so the save-time literal swap matches whether the stored
 *  value is absolute or root-relative. Previews live by overriding the inline style. */
function commitBg(el: HTMLElement, url: string): void {
  const u = String(url || '').trim();
  const orig = el.getAttribute('data-mf-ie-bg-orig') || bgUrlOf(el);
  if (!u || !orig || u === orig) return;
  if (!isAllowedImageUrl(u)) { try { window.alert(t('ie.invalid_image_url')); } catch {} return; }
  el.style.setProperty('background-image', "url('" + u.replace(/'/g, '%27') + "')", 'important');
  addPendingImageSwap(orig, u);
  markDirty();
}

function attachImageActionButton(target: HTMLElement, mode: 'img' | 'bg'): void {
  if (target.getAttribute('data-mf-ie-imgbtn') === '1') return;
  target.setAttribute('data-mf-ie-imgbtn', '1');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mf-ie-img-btn';
  btn.innerHTML = '<i class="fas fa-image"></i> ' + t('ie.change_image');
  btn.title = t('ie.change_hero_image');
  const place = () => {
    const r = target.getBoundingClientRect();
    const visible = r.width > 24 && r.height > 24 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
    btn.style.display = visible ? 'inline-flex' : 'none';
    btn.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - 112, r.left + 8))) + 'px';
    btn.style.top = Math.round(Math.max(8, Math.min(window.innerHeight - 36, r.top + 8))) + 'px';
  };
  place();
  btn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); openImageStylePanel(target, mode); });
  btn.addEventListener('mousedown', (ev) => ev.stopPropagation());
  document.body.appendChild(btn);
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  try { new ResizeObserver(place).observe(target); } catch { /* optional */ }
}

export function enableImageEdit(root: HTMLElement): number {
  let count = 0;
  const host = (root.querySelector('.mfp, [class*="mfp-"]') as HTMLElement) || root;
  Array.prototype.forEach.call(host.querySelectorAll('img'), (img: HTMLImageElement) => {
    if (img.getAttribute('data-mf-ie-img') === '1') return;
    const src = img.getAttribute('src') || '';
    if (!src) return;
    img.setAttribute('data-mf-ie-img', '1');
    img.setAttribute('data-mf-ie-img-orig', src);
    img.classList.add('mf-ie-img-editable');
    img.addEventListener('click', onImageClick);
    attachImageActionButton(img, 'img');
    count++;
  });
  // Background-image heroes/sections: any sizeable element whose background-image is a real
  // url(...) (not a gradient). Size-gated so decorative bg icons/chips aren't tagged. Click swaps
  // the bg via the same picker; persists by a literal URL swap across customHtml/customCss/content.
  const bgCandidates = [host].concat(Array.prototype.slice.call(host.querySelectorAll('*')) as HTMLElement[]);
  bgCandidates.forEach((el: HTMLElement) => {
    if (!el || el.tagName === 'IMG' || el.getAttribute('data-mf-ie-bg') === '1') return;
    const url = bgUrlOf(el);
    if (!url) return;
    let w = 0; let h = 0;
    try { w = el.offsetWidth; h = el.offsetHeight; } catch { /* detached */ }
    if (w < 120 || h < 80) return; // skip small/decorative backgrounds
    el.setAttribute('data-mf-ie-bg', '1');
    el.setAttribute('data-mf-ie-bg-orig', url);
    el.classList.add('mf-ie-bg-editable');
    el.addEventListener('click', onBgClick);
    attachImageActionButton(el, 'bg');
    count++;
  });
  return count;
}

/** Persist image swaps: update the customContent value that equals the old src (the token the
 *  renderer resolves), and swap any literal occurrence of the old URL in customHtml AND customCss
 *  (background-image heroes live in customCss). */
function applyImageSwaps(settings: any, map: Record<string, string>): void {
  const cc = settings.customContent || settings.CustomContent;
  if (cc && typeof cc === 'object') {
    Object.keys(cc).forEach((k) => { const v = String(cc[k]); if (map[v]) cc[k] = map[v]; });
    settings.customContent = cc;
    if (settings.CustomContent !== undefined) settings.CustomContent = cc;
  }
  const swapAll = (s: string): string => { Object.keys(map).forEach((oldSrc) => { if (oldSrc) s = s.split(oldSrc).join(map[oldSrc]); }); return s; };
  settings.customHtml = swapAll(String(settings.customHtml || settings.CustomHtml || ''));
  if (settings.CustomHtml !== undefined) settings.CustomHtml = settings.customHtml;
  const css = String(settings.customCss || settings.CustomCss || '');
  if (css) { settings.customCss = swapAll(css); if (settings.CustomCss !== undefined) settings.CustomCss = settings.customCss; }
}

// ── built-in lightweight image gallery (renderer-bundle copy of the builder Token Designer
//    picker; calls the same /Upload/List + /Upload/Image endpoints, no builder bundle needed) ──
let _mfGalleryCache: any[] | null = null;
function fetchMfGallery(force?: boolean): Promise<any[]> {
  if (_mfGalleryCache && !force) return Promise.resolve(_mfGalleryCache);
  return fetch(apiBase() + 'Upload/List', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((j) => { _mfGalleryCache = (j && j.items) || []; return _mfGalleryCache; })
    .catch(() => { _mfGalleryCache = []; return _mfGalleryCache; });
}

function uploadMfImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  return fetch(apiBase() + 'Upload/Image', { method: 'POST', body: fd, credentials: 'include' })
    .then((r) => { if (!r.ok) return r.text().then((t) => { throw new Error(t || ('HTTP ' + r.status)); }); return r.json(); })
    .then((j) => { if (!j || !j.url) throw new Error('no url'); return String(j.url); });
}

function openMfGalleryPicker(current: string, onPick: (url: string) => void): void {
  const existing = document.getElementById('mf-ie-gallery');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  const overlay = document.createElement('div');
  overlay.id = 'mf-ie-gallery';
  overlay.className = 'mf-ie-gallery-backdrop';
  overlay.innerHTML =
    '<div class="mf-ie-gallery-shell">' +
      '<div class="mf-ie-gallery-head">' +
        '<span class="mf-ie-gallery-title"><i class="fas fa-images"></i> ' + escapeHtml(t('ie.image_library')) + '</span>' +
        '<input type="search" class="mf-ie-gallery-search" placeholder="' + escapeHtml(t('ie.filter_filename')) + '"/>' +
        '<label class="mf-ie-gallery-upload"><i class="fas fa-upload"></i> ' + escapeHtml(t('ie.upload')) + '<input type="file" accept="image/*" hidden></label>' +
        '<button type="button" class="mf-ie-gallery-url" title="' + escapeHtml(t('ie.paste_url')) + '">URL</button>' +
        '<button type="button" class="mf-ie-gallery-close" aria-label="' + escapeHtml(t('ie.close')) + '">&times;</button>' +
      '</div>' +
      '<div class="mf-ie-gallery-body"><div class="mf-ie-gallery-loading"><i class="fas fa-spinner fa-spin"></i> ' + escapeHtml(t('ie.loading')) + '</div></div>' +
    '</div>';
  document.body.appendChild(overlay);
  const close = (): void => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); document.removeEventListener('keydown', onEsc); };
  const onEsc = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
  (overlay.querySelector('.mf-ie-gallery-close') as HTMLElement).addEventListener('click', close);
  const body = overlay.querySelector('.mf-ie-gallery-body') as HTMLElement;
  const search = overlay.querySelector('.mf-ie-gallery-search') as HTMLInputElement;
  let items: any[] = [];
  const draw = (q: string): void => {
    const f = String(q || '').toLowerCase();
    const view = !f ? items : items.filter((it) => String(it.fileName || '').toLowerCase().indexOf(f) !== -1);
    if (!items.length) { body.innerHTML = '<div class="mf-ie-gallery-empty"><i class="fas fa-circle-info"></i> ' + escapeHtml(t('ie.gallery_empty')) + '</div>'; return; }
    if (!view.length) { body.innerHTML = '<div class="mf-ie-gallery-empty"><i class="fas fa-circle-info"></i> ' + escapeHtml(t('ie.no_matches')) + '</div>'; return; }
    const grid = document.createElement('div');
    grid.className = 'mf-ie-gallery-grid';
    view.forEach((it) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mf-ie-gallery-card';
      card.title = String(it.fileName || '');
      card.innerHTML = '<span class="mf-ie-gallery-thumb"><img src="' + escapeHtml(String(it.url || '')) + '" alt=""></span><span class="mf-ie-gallery-name">' + escapeHtml(String(it.fileName || '')) + '</span>';
      card.addEventListener('click', () => { onPick(String(it.url || '')); close(); });
      grid.appendChild(card);
    });
    body.innerHTML = '';
    body.appendChild(grid);
  };
  search.addEventListener('input', () => draw(search.value));
  (overlay.querySelector('.mf-ie-gallery-url') as HTMLElement).addEventListener('click', () => {
    const u = window.prompt(t('ie.prompt_image_url'), current || '');
    if (u != null && u.trim()) { onPick(u.trim()); close(); }
  });
  const fileInput = overlay.querySelector('.mf-ie-gallery-upload input') as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    body.innerHTML = '<div class="mf-ie-gallery-loading"><i class="fas fa-spinner fa-spin"></i> ' + escapeHtml(t('ie.uploading')) + '</div>';
    uploadMfImage(file).then((url) => { onPick(url); close(); }).catch(() => { try { window.alert(t('ie.upload_failed')); } catch {} draw(search.value); });
  });
  fetchMfGallery().then((list) => { items = list || []; draw(''); });
}

// ── per-block ACTION MENU (header / steps bar / step panels / sections) ───────────────────────
// In edit-mode each of these blocks gets a small ⚙ button; its popover toggles visual settings
// (show/hide block, show/hide border). Persisted as a delimited region in settings.customCss
// (rendered verbatim by BOTH TS + C# — no renderer/DLL change). A hidden block is NEUTRALIZED in
// edit-mode (inline display:revert + faded) so the host can always toggle it back on.
function cssAttrVal(v: string): string { return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

/** Pick the form's header / hero block inside the premium shell (the brand + title region). */
function pickHeaderBlock(shell: HTMLElement): HTMLElement | null {
  const cand = shell.querySelector('header, [class*="hero" i], [class*="masthead" i], [class*="brand" i], [class*="-head" i]') as HTMLElement | null;
  if (!cand) return null;
  // climb to the outermost header-ish block that is still inside the shell (not the shell itself)
  let el: HTMLElement = cand;
  let p = el.parentElement as HTMLElement | null;
  while (p && p !== shell && /hero|masthead|brand|header|head/i.test(p.className || '')) { el = p; p = el.parentElement as HTMLElement | null; }
  return el;
}

/** Build a STABLE scoped selector for a block: prefer data-step / data-key (unique), else a class. */
function blockSelector(el: HTMLElement, scope: string): string {
  let part = '';
  const step = el.getAttribute('data-step');
  const key = el.getAttribute('data-key');
  if (step != null && step !== '') part = '[data-step="' + cssAttrVal(step) + '"]';
  else if (key) part = '[data-key="' + cssAttrVal(key) + '"]';
  else {
    const cls = String(el.className || '').split(/\s+/).filter((c) => c && !/^mf-ie/.test(c) && c !== 'mf-ieblk');
    if (cls.length) part = '.' + cls[0].replace(/[^\w-]/g, '\\$&');
  }
  return part ? scope + ' ' + part : '';
}

/** Apply a block's visual state to the LIVE (edit-mode) DOM only — no persistence, no dirty flag.
 *  `hidden` keeps the block visible-but-faded here (inline display:revert) so it stays toggle-able;
 *  the real display:none only ships in customCss for the public render. */
function applyBlockVisual(el: HTMLElement, st: { hidden?: boolean; noBorder?: boolean }): void {
  if (st.hidden) { el.setAttribute('data-mf-ie-hidden', '1'); el.style.setProperty('display', 'revert', 'important'); el.classList.add('mf-ieblk-hidden'); }
  else { el.removeAttribute('data-mf-ie-hidden'); el.style.removeProperty('display'); el.classList.remove('mf-ieblk-hidden'); }
  if (st.noBorder) { el.setAttribute('data-mf-ie-noborder', '1'); el.style.setProperty('border', 'none', 'important'); el.style.setProperty('box-shadow', 'none', 'important'); el.classList.add('mf-ieblk-noborder'); }
  else { el.removeAttribute('data-mf-ie-noborder'); el.style.removeProperty('border'); el.style.removeProperty('box-shadow'); el.classList.remove('mf-ieblk-noborder'); }
}

function setBlockState(el: HTMLElement, sel: string, st: { hidden?: boolean; noBorder?: boolean }): void {
  applyBlockVisual(el, st);
  STATE.pendingBlocks[sel] = { hidden: !!st.hidden, noBorder: !!st.noBorder };
  markDirty();
}

function blockKindLabel(kind: string): string {
  return kind === 'header' ? t('ie.block_header') : kind === 'steps' ? t('ie.block_steps') : kind === 'step' ? t('ie.block_step') : kind === 'section' ? t('ie.block_section') : t('ie.block_generic');
}

function openBlockMenu(el: HTMLElement, kind: string, sel: string, anchor: HTMLElement): void {
  const old = document.getElementById('mf-ieblk-menu');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  const hidden = el.getAttribute('data-mf-ie-hidden') === '1';
  const noBorder = el.getAttribute('data-mf-ie-noborder') === '1';
  const menu = document.createElement('div');
  menu.id = 'mf-ieblk-menu';
  menu.className = 'mf-ieblk-menu';
  menu.innerHTML =
    '<div class="mf-ieblk-menu-title">' + escapeHtml(blockKindLabel(kind)) + '</div>' +
    '<button type="button" class="mf-ieblk-menu-item" data-act="hide"><i class="fas ' + (hidden ? 'fa-eye' : 'fa-eye-slash') + '"></i> ' + escapeHtml(hidden ? t('ie.show_block') : t('ie.hide_block')) + '</button>' +
    '<button type="button" class="mf-ieblk-menu-item" data-act="border"><i class="fas fa-border-top-left"></i> ' + escapeHtml(noBorder ? t('ie.enable_border') : t('ie.disable_border')) + '</button>';
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.round(r.bottom + 6) + 'px';
  menu.style.left = Math.round(Math.min(r.left, window.innerWidth - 200)) + 'px';
  const close = (): void => { if (menu.parentNode) menu.parentNode.removeChild(menu); document.removeEventListener('mousedown', onDoc, true); };
  const onDoc = (ev: Event): void => { if (!menu.contains(ev.target as Node) && ev.target !== anchor) close(); };
  setTimeout(() => document.addEventListener('mousedown', onDoc, true), 0);
  menu.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!btn) return;
    ev.preventDefault(); ev.stopPropagation();
    const act = btn.getAttribute('data-act');
    const cur = { hidden: el.getAttribute('data-mf-ie-hidden') === '1', noBorder: el.getAttribute('data-mf-ie-noborder') === '1' };
    if (act === 'hide') cur.hidden = !cur.hidden;
    else if (act === 'border') cur.noBorder = !cur.noBorder;
    setBlockState(el, sel, cur);
    close();
  });
}

function attachBlockActionBtn(el: HTMLElement, kind: string, sel: string): void {
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mf-ieblk-btn';
  btn.title = t('ie.customize_block');
  btn.innerHTML = '<i class="fas fa-gear"></i>';
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openBlockMenu(el, kind, sel, btn); });
  btn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
  el.appendChild(btn);
}

/** Read the persisted block overrides from the rendered customCss <style> (so the menu reflects
 *  saved state and hidden blocks are revealed in edit-mode after a reload). */
function readPersistedBlocks(): Record<string, { hidden?: boolean; noBorder?: boolean }> {
  const styles = document.querySelectorAll('style');
  for (let i = 0; i < styles.length; i++) {
    const t = styles[i].textContent || '';
    if (t.indexOf(MF_IE_BLOCKS_START) !== -1) return parseBlocksRegion(t);
  }
  return {};
}

export function enableBlockActions(root: HTMLElement): number {
  const shell = (root.querySelector('.mfp, [class*="mfp-"]') as HTMLElement) || root;
  const scope = root.id ? '#' + root.id.replace(/[^\w-]/g, '\\$&') : ('.' + (String(shell.className || 'mf-form').split(/\s+/)[0] || 'mf-form'));
  const blocks: Array<{ el: HTMLElement; kind: string }> = [];
  const header = pickHeaderBlock(shell);
  if (header) blocks.push({ el: header, kind: 'header' });
  Array.prototype.forEach.call(root.querySelectorAll('.mf-steps'), (el: HTMLElement) => blocks.push({ el, kind: 'steps' }));
  Array.prototype.forEach.call(root.querySelectorAll('[data-step]'), (el: HTMLElement) => { if (!el.closest('.mf-steps')) blocks.push({ el, kind: 'step' }); });
  Array.prototype.forEach.call(root.querySelectorAll('.mf-field-group[data-type="Section" i], .mf-section'), (el: HTMLElement) => blocks.push({ el, kind: 'section' }));
  let count = 0;
  blocks.forEach((b) => {
    if (!b.el || b.el.getAttribute('data-mf-ieblk-on') === '1') return;
    const sel = blockSelector(b.el, scope);
    if (!sel) return;
    b.el.setAttribute('data-mf-ieblk-on', '1');
    b.el.setAttribute('data-mf-ieblk', sel);
    b.el.classList.add('mf-ieblk');
    attachBlockActionBtn(b.el, b.kind, sel);
    count++;
  });
  // Reflect persisted overrides: reveal hidden blocks for editing + show current border state.
  const persisted = readPersistedBlocks();
  Object.keys(persisted).forEach((sel) => {
    try { Array.prototype.forEach.call(document.querySelectorAll(sel), (el: HTMLElement) => applyBlockVisual(el, persisted[sel])); } catch { /* bad selector — skip */ }
  });
  return count;
}

const MF_IE_STYLE_OPEN = '<style id="mf-ie-blocks">';
const MF_IE_STYLE_RE = /<style id="mf-ie-blocks">[\s\S]*?<\/style>\s*/i;

/** Merge pending block toggles (server state ∪ pending, pending wins) and persist the override
 *  region. Persisted into settings.customHtml as a delimited `<style id="mf-ie-blocks">` block —
 *  NOT customCss: customCss is re-composed by ModuleCssComposer and the client rebuilds its CSS
 *  from the page-embedded schema, so a late customCss edit can be dropped at render. customHtml is
 *  emitted verbatim (the same channel the text/image edits use), so the `<style>` reliably renders.
 *  Falls back to customCss only when there is no customHtml shell. Also strips any legacy customCss
 *  region so an earlier (broken) save is cleaned up. */
function applyBlockOverrides(settings: any, pending: Record<string, { hidden?: boolean; noBorder?: boolean }>): void {
  // migration: drop any legacy region left in customCss by an earlier build.
  const legacyCss = String(settings.customCss || settings.CustomCss || '');
  if (legacyCss.indexOf(MF_IE_BLOCKS_START) !== -1) {
    const cleaned = stripBlocksRegion(legacyCss);
    settings.customCss = cleaned;
    if (settings.CustomCss !== undefined) settings.CustomCss = cleaned;
  }
  let html = String(settings.customHtml || settings.CustomHtml || '');
  if (html.trim().length) {
    const merged = parseBlocksRegion(html);                 // markers live inside the existing <style>
    Object.keys(pending).forEach((sel) => { merged[sel] = pending[sel]; });
    html = html.replace(MF_IE_STYLE_RE, '');                // strip the old block
    const region = buildBlocksRegion(merged);
    if (region) html = html.replace(/\s+$/, '') + '\n' + MF_IE_STYLE_OPEN + region + '</style>';
    settings.customHtml = html;
    if (settings.CustomHtml !== undefined) settings.CustomHtml = html;
    return;
  }
  // No customHtml shell → fall back to a customCss region (best effort for pure standard forms).
  let css = String(settings.customCss || settings.CustomCss || '');
  const merged = parseBlocksRegion(css);
  Object.keys(pending).forEach((sel) => { merged[sel] = pending[sel]; });
  css = stripBlocksRegion(css);
  const region = buildBlocksRegion(merged);
  const out = region ? (css.replace(/\s+$/, '') + '\n\n' + region + '\n') : css;
  settings.customCss = out;
  if (settings.CustomCss !== undefined) settings.CustomCss = out;
}

function parseBlocksRegion(css: string): Record<string, { hidden?: boolean; noBorder?: boolean }> {
  const out: Record<string, { hidden?: boolean; noBorder?: boolean }> = {};
  const s = css.indexOf(MF_IE_BLOCKS_START); const e = css.indexOf(MF_IE_BLOCKS_END);
  if (s < 0 || e < 0 || e < s) return out;
  const region = css.slice(s + MF_IE_BLOCKS_START.length, e);
  const re = /([^{}]+)\{([^{}]*)\}/g; let m: RegExpExecArray | null;
  while ((m = re.exec(region))) {
    const sel = m[1].trim(); const body = m[2] || '';
    if (!sel) continue;
    out[sel] = { hidden: /display\s*:\s*none/i.test(body), noBorder: /border\s*:\s*none/i.test(body) };
  }
  return out;
}

function stripBlocksRegion(css: string): string {
  const s = css.indexOf(MF_IE_BLOCKS_START); const e = css.indexOf(MF_IE_BLOCKS_END);
  if (s < 0 || e < 0 || e < s) return css;
  return (css.slice(0, s) + css.slice(e + MF_IE_BLOCKS_END.length)).replace(/\n{3,}/g, '\n\n').trim();
}

function buildBlocksRegion(map: Record<string, { hidden?: boolean; noBorder?: boolean }>): string {
  const lines: string[] = [];
  Object.keys(map).forEach((sel) => {
    const b = map[sel]; const d: string[] = [];
    if (b && b.hidden) d.push('display:none!important');
    if (b && b.noBorder) { d.push('border:none!important'); d.push('box-shadow:none!important'); d.push('outline:none!important'); }
    if (d.length) lines.push(sel + '{' + d.join(';') + '}');
  });
  return lines.length ? (MF_IE_BLOCKS_START + '\n' + lines.join('\n') + '\n' + MF_IE_BLOCKS_END) : '';
}

export function enableFieldLayoutEdit(root: HTMLElement): number {
  // [PDF-grid / FlexGrid editor v20260629] If the form renders as a flat-field flexgrid, drive the
  // 2-D grid editor (drag x/y + resize w/h, snap-to-12-col) instead of the flow width/reorder editor.
  // Standard (single grid, schema .mf-field-group items) OR premium (one .mf-flexgrid per step panel,
  // data-mf-fg-key items inside bespoke labels) — drive the 2-D editor on every editable grid found.
  const grids = Array.prototype.slice.call(root.querySelectorAll('.mf-flexgrid[data-mf-flexgrid]')) as HTMLElement[];
  const editableGrids = grids.filter((g) => !!g.querySelector('.mf-flexgrid-item .mf-field-group[data-key], .mf-flexgrid-item[data-mf-fg-key]'));
  if (editableGrids.length) {
    let n = 0;
    editableGrids.forEach((g) => { n += enableFlexGridLayoutEdit(g); });
    return n;
  }

  const fields = layoutEligibleFields(root);
  fields.forEach((fg) => {
    if (fg.getAttribute('data-mf-fre') === '1') return;
    fg.setAttribute('data-mf-fre', '1');
    fg.classList.add('mf-fre-field');
    addResizeHandle(fg);
    addDragHandle(fg);
  });
  // Premium / multi-column Row fields: a field inside a .mf-row-column resizes by changing the
  // row's column SPAN (works on the premium customHtml forms too — the Row renders from schema
  // columns[].span). first_name/last_name side-by-side is the common case the host wants to resize.
  let rowCount = 0;
  Array.prototype.forEach.call(root.querySelectorAll('.mf-row-column > .mf-field-group[data-key]'), (fg: HTMLElement) => {
    if (fg.getAttribute('data-mf-fre') === '1') return;
    const info = rowFieldInfo(fg);
    if (!info) return;
    fg.setAttribute('data-mf-fre', '1');
    fg.classList.add('mf-fre-field');
    addRowResizeHandle(fg, info);
    rowCount++;
  });
  // [FlexGrid lazy-migrate] Offer "convert to grid": standard flow forms get the flat-field grid;
  // premium .mfp shells get the customHtml-resident grid (keeps chrome + labels). [Premium v20260630]
  if (fields.length && !root.querySelector('.mfp')) addGridConvertControl(root, fields);
  else if (root.querySelector('.mfp')) maybeAddPremiumGridConvert(root);
  return fields.length + rowCount;
}

// ── [PDF-grid / FlexGrid editor] 2-D drag/resize on the rendered .mf-flexgrid ────────────────
function _gridGeom(grid: HTMLElement): { cols: number; gap: number; rh: number; colPx: number } {
  const cs = getComputedStyle(grid);
  // [fix 20260630] Fallback MUST be 24 — the canonical default across FlexGridConfig.Cols (C#),
  // RenderFlexGridFields SSR, renderStandardFields (TS) and lazyMigrateToFlexGrid. A 12 fallback
  // (when --mf-grid-cols is momentarily unread) HALVED every placement on the 24-col grid.
  const cols = parseInt(cs.getPropertyValue('--mf-grid-cols'), 10) || 24;
  const gap = parseFloat(cs.getPropertyValue('--mf-grid-gap')) || 12;
  const rh = parseFloat(cs.getPropertyValue('--mf-grid-rh')) || 64;
  const w = grid.getBoundingClientRect().width || 1;
  const colPx = Math.max(8, (w - (cols - 1) * gap) / cols);
  return { cols, gap, rh, colPx };
}
function _itemPlacement(item: HTMLElement): { x: number; y: number; w: number; h: number } {
  // CSS vars are 1-based; convert back to 0-based x/y for math.
  const gx = parseInt(item.style.getPropertyValue('--lg-x'), 10) || 1;
  const gy = parseInt(item.style.getPropertyValue('--lg-y'), 10) || 1;
  const gw = parseInt(item.style.getPropertyValue('--lg-w'), 10) || 12;
  const gh = parseInt(item.style.getPropertyValue('--lg-h'), 10) || 1;
  return { x: gx - 1, y: gy - 1, w: gw, h: gh };
}
function _setItemPlacement(item: HTMLElement, p: { x: number; y: number; w: number; h: number }, cols: number): void {
  item.style.setProperty('--lg-x', String(Math.max(0, Math.min(cols - 1, p.x)) + 1));
  item.style.setProperty('--lg-y', String(Math.max(0, p.y) + 1));
  item.style.setProperty('--lg-w', String(Math.max(1, Math.min(cols, p.w))));
  item.style.setProperty('--lg-h', String(Math.max(1, Math.min(12, p.h))));
}
function _persistItem(item: HTMLElement, cols: number): void {
  const p = _itemPlacement(item);
  // [Premium v20260630] Check the ITEM's own data-mf-fg-key FIRST: a premium item wraps a bespoke
  // au-field label whose rendered field ALSO contains a .mf-field-group — so checking .mf-field-group
  // first would mis-route premium edits to field.placement (which the customHtml render ignores).
  // customHtml-resident grid → record placement; applyPremiumPlacements rewrites the item's --lg/md/sm
  // vars INSIDE customHtml on save (render stays verbatim, no C# change).
  const premKey = item.getAttribute('data-mf-fg-key');
  if (premKey) {
    STATE.pendingPremiumPlacement[premKey] = { x: p.x, y: p.y, w: p.w, h: p.h };
    markDirty();
    return;
  }
  // Standard flat-field grid → persist to schema field.placement (C# RenderFlexGridFields re-emits).
  // Persist lg; derive md=lg and sm=full-width stack (parity with the renderer's defaults).
  const fg = item.querySelector('.mf-field-group[data-key]');
  const stdKey = fg && fg.getAttribute('data-key');
  if (stdKey) {
    STATE.pendingPlacement[stdKey] = {
      lg: { x: p.x, y: p.y, w: p.w, h: p.h },
      md: { x: p.x, y: p.y, w: p.w, h: p.h },
      sm: { x: 0, y: p.y, w: cols, h: p.h },
    };
    markDirty();
  }
}

function enableFlexGridLayoutEdit(grid: HTMLElement): number {
  const items = Array.prototype.slice.call(grid.querySelectorAll('.mf-flexgrid-item')) as HTMLElement[];
  let n = 0;
  items.forEach((item) => {
    if (item.getAttribute('data-mf-fge') === '1') return;
    // Standard items wrap a schema .mf-field-group[data-key]; premium items carry data-mf-fg-key
    // (a {{field:KEY}} token inside a bespoke label). Decorative (data-mf-fg-deco) items are skipped.
    if (!item.querySelector('.mf-field-group[data-key]') && !item.hasAttribute('data-mf-fg-key')) return;
    item.setAttribute('data-mf-fge', '1');
    item.classList.add('mf-fge-item');
    // Move handle (drag x/y) — reuse the flow drag-handle styling.
    const dh = document.createElement('div');
    dh.className = 'mf-fre-drag mf-fge-drag';
    dh.title = t('ie.drag_move_cell');
    dh.innerHTML = '<i class="fas fa-up-down-left-right"></i>';
    dh.addEventListener('mousedown', (e) => startGridDrag(e as MouseEvent, grid, item));
    item.appendChild(dh);
    // Resize handle (SE corner: width + height).
    const rh = document.createElement('div');
    rh.className = 'mf-fge-resize';
    rh.title = t('ie.drag_resize_cell');
    rh.addEventListener('mousedown', (e) => startGridResize(e as MouseEvent, grid, item));
    item.appendChild(rh);
    n++;
  });
  return n;
}

function startGridResize(e: MouseEvent, grid: HTMLElement, item: HTMLElement): void {
  e.preventDefault(); e.stopPropagation();
  const { cols, gap, rh, colPx } = _gridGeom(grid);
  const start = _itemPlacement(item);
  const sx = e.clientX, sy = e.clientY;
  item.classList.add('mf-fre-resizing');
  showGridOverlay(grid);
  const onMove = (ev: MouseEvent) => {
    const dCol = Math.round((ev.clientX - sx) / (colPx + gap));
    const dRow = Math.round((ev.clientY - sy) / (rh + gap));
    // Snap to the (24-col) grid — fine granularity gives a free, PDF-like feel while staying responsive.
    const newW = Math.max(1, Math.min(cols - start.x, start.w + dCol));
    const newH = Math.max(1, Math.min(12, start.h + dRow));
    _setItemPlacement(item, { x: start.x, y: start.y, w: newW, h: newH }, cols);
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    item.classList.remove('mf-fre-resizing');
    hideGridOverlay();
    _persistItem(item, cols);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function startGridDrag(e: MouseEvent, grid: HTMLElement, item: HTMLElement): void {
  e.preventDefault(); e.stopPropagation();
  const { cols, gap, rh, colPx } = _gridGeom(grid);
  const start = _itemPlacement(item);
  const sx = e.clientX, sy = e.clientY;
  item.classList.add('mf-fre-dragging');
  showGridOverlay(grid);
  const onMove = (ev: MouseEvent) => {
    const dCol = Math.round((ev.clientX - sx) / (colPx + gap));
    const dRow = Math.round((ev.clientY - sy) / (rh + gap));
    const newX = Math.max(0, Math.min(cols - start.w, start.x + dCol));
    const newY = Math.max(0, start.y + dRow);
    _setItemPlacement(item, { x: newX, y: newY, w: start.w, h: start.h }, cols);
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    item.classList.remove('mf-fre-dragging');
    hideGridOverlay();
    _persistItem(item, cols);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/** [FlexGrid lazy-migrate] Convert a flow form to the 2-D grid: derive each top-level field's
 *  placement from its current data-width (packed into 12-col rows) + DOM order, flag layoutMode,
 *  then save (reload renders the grid via the C# SSR + TS hydrate flexgrid path). */
function addGridConvertControl(root: HTMLElement, fields: HTMLElement[]): void {
  if (document.getElementById('mf-fge-convert')) return;
  const btn = document.createElement('button');
  btn.id = 'mf-fge-convert';
  btn.type = 'button';
  btn.className = 'mf-ie-gridbtn';
  btn.innerHTML = '<i class="fas fa-table-cells-large"></i> ' + t('ie.convert_grid_pdf');
  btn.title = t('ie.convert_grid_pdf_title');
  btn.addEventListener('click', () => lazyMigrateToFlexGrid(fields));
  document.body.appendChild(btn);
}

function lazyMigrateToFlexGrid(fields: HTMLElement[]): void {
  // 24-col grid (finer snap) — matches the renderer/C# default. Map flow data-width → 24-col span.
  const COLS = 24;
  const widthToW: Record<string, number> = { '100%': 24, '66%': 16, '50%': 12, '33%': 8, '25%': 6 };
  let x = 0, y = 0;
  fields.forEach((fg) => {
    const key = fg.getAttribute('data-key');
    if (!key) return;
    const dw = fg.getAttribute('data-width') || '100%';
    const w = widthToW[dw] || COLS;
    if (x + w > COLS) { x = 0; y++; }
    STATE.pendingPlacement[key] = { lg: { x, y, w, h: 1 }, md: { x, y, w, h: 1 }, sm: { x: 0, y, w: COLS, h: 1 } };
    x += w;
    if (x >= COLS) { x = 0; y++; }
  });
  STATE.pendingLayoutMode = 'flexgrid';
  markDirty();
  setPill('<i class="fas fa-table-cells-large"></i> ' + t('ie.grid_ready'), 'is-dirty');
}

// ── [Premium FlexGrid v20260630] customHtml-resident 2-D grid for premium .mfp shells ─────────
// Premium forms render via a bespoke customHtml shell (hero/stepper/card + {{field:KEY}} tokens
// inside hand-styled labels). To give them the PDF-style 2-D grid WHILE KEEPING the chrome + label
// styling, the grid lives INSIDE customHtml: each step panel ([data-step] that holds field tokens)
// becomes a .mf-flexgrid, and each field-bearing child is wrapped in a .mf-flexgrid-item carrying
// the field key + --lg/md/sm placement vars. C# renders customHtml verbatim and the client rebuilds
// from the same customHtml, so there is NO SSR↔rebuild parity gap and NO C#/renderer change needed.

/** Build the cross-breakpoint placement style for a premium flexgrid item (1-based CSS vars). */
function _premItemStyle(x: number, y: number, w: number, h: number): string {
  const lg = `--lg-x:${x};--lg-y:${y};--lg-w:${w};--lg-h:${h}`;
  const md = `--md-x:${x};--md-y:${y};--md-w:${w};--md-h:${h}`;
  const sm = `--sm-x:1;--sm-y:${y};--sm-w:24;--sm-h:${h}`; // mobile = full-width stack
  return `${lg};${md};${sm}`;
}

/** Convert a premium customHtml shell into a 2-D grid: wrap each step panel's field-bearing children
 *  in .mf-flexgrid-item (full-width by default; the host then drags/resizes), keeping ALL chrome and
 *  the bespoke labels intact. Idempotent (returns unchanged once gridded). Pure string transform on
 *  the authored customHtml (preserves {{field:KEY}} tokens — they are plain text to the parser). */
function wrapPremiumStepsIntoFlexGrid(html: string): string {
  if (!html || /data-mf-flexgrid/.test(html)) return html;
  let doc: Document;
  try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch { return html; }
  const panels = (Array.prototype.slice.call(doc.querySelectorAll('[data-step]')) as HTMLElement[])
    .filter((p) => /\{\{field:/.test(p.innerHTML));
  if (!panels.length) return html;
  panels.forEach((panel) => {
    panel.classList.add('mf-flexgrid');
    panel.setAttribute('data-mf-flexgrid', '1');
    panel.style.setProperty('--mf-grid-cols', '24');
    panel.style.setProperty('--mf-grid-gap', '12');
    panel.style.setProperty('--mf-grid-rh', '64');
    let y = 1; // 1-based row
    const kids = Array.prototype.slice.call(panel.children) as HTMLElement[];
    kids.forEach((el) => {
      const m = el.innerHTML.match(/\{\{field:([a-zA-Z0-9_\-]+)\}\}/);
      const item = doc.createElement('div');
      item.className = 'mf-flexgrid-item';
      item.setAttribute('style', _premItemStyle(1, y, 24, 1)); // full-width default
      if (m) item.setAttribute('data-mf-fg-key', m[1]);
      else item.setAttribute('data-mf-fg-deco', '1'); // heading / decorative — full-width, not draggable
      panel.insertBefore(item, el);
      item.appendChild(el);
      y++;
    });
  });
  const root = doc.querySelector('.mfp') as HTMLElement | null;
  return root ? root.outerHTML : doc.body.innerHTML;
}

/** Rewrite per-field placement vars into an already-gridded premium customHtml (drag/resize persist).
 *  Matches each .mf-flexgrid-item by data-mf-fg-key and updates its --lg/md/sm vars. p is 0-based. */
function applyPremiumPlacements(html: string, map: Record<string, { x: number; y: number; w: number; h: number }>): string {
  if (!html) return html;
  let doc: Document;
  try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch { return html; }
  const esc = (s: string) => (typeof (window as any).CSS !== 'undefined' && (window as any).CSS.escape) ? (window as any).CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
  let changed = false;
  Object.keys(map).forEach((key) => {
    const item = doc.querySelector('.mf-flexgrid-item[data-mf-fg-key="' + esc(key) + '"]') as HTMLElement | null;
    if (!item) return;
    const p = map[key];
    item.setAttribute('style', _premItemStyle(
      Math.max(0, Math.min(23, p.x)) + 1,
      Math.max(0, p.y) + 1,
      Math.max(1, Math.min(24, p.w)),
      Math.max(1, Math.min(12, p.h)),
    ));
    changed = true;
  });
  if (!changed) return html;
  const root = doc.querySelector('.mfp') as HTMLElement | null;
  return root ? root.outerHTML : doc.body.innerHTML;
}

/** Premium-native form (.mfp with [data-step] field panels, not yet gridded) → offer "convert to
 *  grid" that wraps each step's fields into a flexgrid on save, keeping the premium look. */
function maybeAddPremiumGridConvert(root: HTMLElement): void {
  if (document.getElementById('mf-fge-convert-premium')) return;
  if (root.querySelector('.mf-flexgrid[data-mf-flexgrid]')) return; // already gridded
  const panels = Array.prototype.slice.call(root.querySelectorAll('[data-step]')) as HTMLElement[];
  const hasFieldPanels = panels.some((p) => !!p.querySelector('.mf-field-group, input, select, textarea'));
  if (!hasFieldPanels) return;
  const btn = document.createElement('button');
  btn.id = 'mf-fge-convert-premium';
  btn.type = 'button';
  btn.className = 'mf-ie-gridbtn';
  btn.innerHTML = '<i class="fas fa-table-cells-large"></i> ' + t('ie.convert_grid_premium');
  btn.title = t('ie.convert_grid_premium_title');
  btn.addEventListener('click', () => {
    STATE.pendingPremiumGridConvert = true;
    markDirty();
    setPill('<i class="fas fa-table-cells-large"></i> ' + t('ie.grid_premium_ready'), 'is-dirty');
    btn.disabled = true;
  });
  document.body.appendChild(btn);
}

interface RowInfo {
  rowEl: HTMLElement; colIndex: number; spans: number[];
  rowKey: string | null;        // schema Row key (persist via columns[].span)
}

/** Resolve the resize context of a field inside a .mf-row-column schema Row (columns[].span). */
function rowFieldInfo(fg: HTMLElement): RowInfo | null {
  const rowCol = fg.closest('.mf-row-column') as HTMLElement | null;
  const rowEl = rowCol && (rowCol.parentElement as HTMLElement | null);
  if (!rowCol || !rowEl) return null;
  const cols = Array.prototype.filter.call(rowEl.children, (c: Element) => c.classList && c.classList.contains('mf-row-column')) as HTMLElement[];
  const colIndex = cols.indexOf(rowCol);
  if (colIndex < 0 || cols.length < 2) return null; // only multi-column rows are resizable
  const spans = parseRowSpans(rowEl, cols.length);
  // Anchor by THIS field's own key. A premium Row renders from a schema Row whose
  // grid-template-columns is GENERATED from columns[].span at render time (it is NOT in the
  // customHtml — the customHtml only holds the {{field:rowKey}} token). So we persist by finding
  // the schema Row that CONTAINS this field key and rewriting its column spans — robust whether
  // or not the rendered DOM exposes the Row wrapper's data-key.
  const anchorKey = fg.getAttribute('data-key') || '';
  if (!anchorKey) return null;
  return { rowEl, colIndex, spans, rowKey: anchorKey };
}

/** Read the row's column spans from its inline grid-template-columns (the renderer emits "6fr 6fr"). */
function parseRowSpans(rowEl: HTMLElement, colCount: number): number[] {
  const st = rowEl.getAttribute('style') || '';
  const m = st.match(/grid-template-columns:\s*([^;]+)/i);
  if (m) {
    const parts = m[1].trim().split(/\s+/).map((p) => parseFloat(p)).filter((n) => isFinite(n) && n > 0);
    if (parts.length === colCount) return parts;
  }
  const each = Math.max(1, Math.round(12 / colCount));
  return new Array(colCount).fill(each);
}

function addRowResizeHandle(fg: HTMLElement, info: RowInfo): void {
  // No handle on the LAST column (it has no right-neighbour to trade span with).
  if (info.colIndex >= info.spans.length - 1) { fg.classList.remove('mf-fre-field'); return; }
  const h = document.createElement('div');
  h.className = 'mf-fre-resize';
  h.title = t('ie.drag_col_ratio');
  h.addEventListener('mousedown', (e) => startRowResize(e as MouseEvent, fg, info));
  fg.appendChild(h);
}

function startRowResize(e: MouseEvent, fg: HTMLElement, info: RowInfo): void {
  e.preventDefault(); e.stopPropagation();
  const rowRect = info.rowEl.getBoundingClientRect();
  const left = fg.getBoundingClientRect().left;
  const i = info.colIndex;
  const j = i + 1; // trade span with the next column
  const pairTotal = info.spans[i] + info.spans[j];
  fg.classList.add('mf-fre-resizing');
  showGridOverlay(info.rowEl);
  let nextSpans = info.spans.slice();
  const onMove = (ev: MouseEvent) => {
    const widthPx = Math.max(20, ev.clientX - left);
    let span = Math.round((widthPx / (rowRect.width || 1)) * 12);
    if (ev.altKey) span = Math.max(1, Math.min(pairTotal - 1, Math.round((widthPx / (rowRect.width || 1)) * 12)));
    span = Math.max(1, Math.min(pairTotal - 1, span));
    const s = info.spans.slice();
    s[i] = span; s[j] = pairTotal - span;
    nextSpans = s;
    info.rowEl.style.gridTemplateColumns = s.map((x) => x + 'fr').join(' ');
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    fg.classList.remove('mf-fre-resizing');
    hideGridOverlay();
    if (info.rowKey) STATE.pendingRowSpan[info.rowKey] = nextSpans;
    markDirty();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/** Apply Row column spans. `map` is keyed by a MEMBER field key (the anchor field that was
 *  resized) → the new full spans array. Finds the Row whose columns contain that field key and
 *  rewrites its columns[].span. Walks nested Rows. Never drops/duplicates a field. */
function applyRowSpans(fields: any[], map: Record<string, number[]>): void {
  const anchors = Object.keys(map);
  (fields || []).forEach((f: any) => {
    if (!f) return;
    const cols = f.columns || f.Columns;
    if (Array.isArray(cols)) {
      anchors.forEach((anchorKey) => {
        const spans = map[anchorKey];
        if (!Array.isArray(spans) || spans.length !== cols.length) return;
        const inThisRow = cols.some((c: any) => (((c && (c.fields || c.Fields)) || []) as any[])
          .some((x: any) => x && (x.key || x.Key) === anchorKey));
        if (inThisRow) spans.forEach((s, i) => { if (cols[i]) { cols[i].span = s; if (cols[i].Span !== undefined) cols[i].Span = s; } });
      });
      cols.forEach((c: any) => applyRowSpans((c && (c.fields || c.Fields)) || [], map));
    }
  });
}

function addResizeHandle(fg: HTMLElement): void {
  const h = document.createElement('div');
  h.className = 'mf-fre-resize';
  h.title = t('ie.drag_width');
  h.addEventListener('mousedown', (e) => startResize(e, fg));
  fg.appendChild(h);
}

function startResize(e: MouseEvent, fg: HTMLElement): void {
  e.preventDefault(); e.stopPropagation();
  const track = (fg.parentElement as HTMLElement) || fg;
  const trackW = track.getBoundingClientRect().width || 1;
  const left = fg.getBoundingClientRect().left;
  fg.classList.add('mf-fre-resizing');
  showGridOverlay(track);
  let lastCss = '';
  const onMove = (ev: MouseEvent) => {
    const widthPx = Math.max(20, ev.clientX - left);
    const snapped = snapWidth(widthPx / trackW);          // Alt bypasses snap → free preview
    const css = ev.altKey ? (Math.round((widthPx / trackW) * 100) + '%') : snapped.css;
    fg.setAttribute('data-width', css);
    lastCss = ev.altKey ? snapped.css : css;              // persist a SUPPORTED width even on Alt
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    fg.classList.remove('mf-fre-resizing');
    hideGridOverlay();
    if (lastCss) {
      fg.setAttribute('data-width', lastCss);
      const key = fg.getAttribute('data-key') || '';
      if (key) { STATE.pendingLayout[key] = lastCss; markDirty(); }
    }
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function addDragHandle(fg: HTMLElement): void {
  const h = document.createElement('div');
  h.className = 'mf-fre-drag';
  h.title = t('ie.drag_reorder');
  h.innerHTML = '<i class="fas fa-up-down-left-right"></i>';
  h.addEventListener('mousedown', (e) => startDrag(e, fg));
  fg.appendChild(h);
}

function startDrag(e: MouseEvent, fg: HTMLElement): void {
  e.preventDefault(); e.stopPropagation();
  const container = (fg.parentElement as HTMLElement) || fg;
  const sibs = () => Array.prototype.filter.call(container.children, (c: HTMLElement) =>
    c.classList && c.classList.contains('mf-field-group') && c.getAttribute('data-key')) as HTMLElement[];
  fg.classList.add('mf-fre-dragging');
  const onMove = (ev: MouseEvent) => {
    const others = sibs().filter((s) => s !== fg);
    let before: HTMLElement | null = null;
    for (const s of others) {
      const r = s.getBoundingClientRect();
      if (ev.clientY < r.top + r.height / 2) { before = s; break; }
    }
    if (before) container.insertBefore(fg, before); else container.appendChild(fg);
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    fg.classList.remove('mf-fre-dragging');
    STATE.pendingOrder = sibs().map((s) => s.getAttribute('data-key') || '').filter(Boolean);
    markDirty();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function showGridOverlay(track: HTMLElement): void {
  let ov = Array.prototype.find.call(track.children, (c: Element) => c.classList && c.classList.contains('mf-fre-grid')) as HTMLElement | undefined;
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'mf-fre-grid';
    for (let i = 0; i < 12; i++) ov.appendChild(document.createElement('span'));
    if (getComputedStyle(track).position === 'static') track.style.position = 'relative';
    track.insertBefore(ov, track.firstChild);
  }
  ov.style.display = 'grid';
}
function hideGridOverlay(): void {
  Array.prototype.forEach.call(document.querySelectorAll('.mf-fre-grid'), (o: HTMLElement) => { o.style.display = 'none'; });
}

/** Set field.width by key (walks Rows/columns so nested standalone keys also resolve). */
function applyFieldWidths(fields: any[], map: Record<string, string>): void {
  (fields || []).forEach((f: any) => {
    if (!f) return;
    const k = f.key || f.Key;
    if (k && Object.prototype.hasOwnProperty.call(map, k)) { f.width = map[k]; if (f.Width !== undefined) f.Width = map[k]; }
    const cols = f.columns || f.Columns;
    if (Array.isArray(cols)) cols.forEach((c: any) => applyFieldWidths((c && (c.fields || c.Fields)) || [], map));
  });
}

/** [FlexGrid] Set field.placement by key (PDF-grid 2-D placement). Mirrors applyFieldWidths. */
function applyFieldPlacements(fields: any[], map: Record<string, any>): void {
  (fields || []).forEach((f: any) => {
    if (!f) return;
    const k = f.key || f.Key;
    if (k && Object.prototype.hasOwnProperty.call(map, k)) f.placement = map[k];
    const cols = f.columns || f.Columns;
    if (Array.isArray(cols)) cols.forEach((c: any) => applyFieldPlacements((c && (c.fields || c.Fields)) || [], map));
  });
}

/** Reorder the TOP-LEVEL schema.fields to match the DOM key order, but ONLY for keys present in
 *  `order`. Fields not in `order` (Sections, Rows, hidden) keep their relative position — we
 *  splice the reordered subset back into their original slots, so nothing is dropped. */
function reorderTopLevelFields(schema: any, order: string[]): void {
  const fields = schema.fields || schema.Fields;
  if (!Array.isArray(fields) || !order || !order.length) return;
  const orderSet = new Set(order);
  const slots: number[] = [];
  fields.forEach((f: any, i: number) => { const k = f && (f.key || f.Key); if (k && orderSet.has(k)) slots.push(i); });
  if (slots.length < 2) return;
  const byKey: Record<string, any> = {};
  fields.forEach((f: any) => { const k = f && (f.key || f.Key); if (k) byKey[k] = f; });
  const reordered = order.map((k) => byKey[k]).filter(Boolean);
  if (reordered.length !== slots.length) return; // key mismatch → skip (safety: never lose a field)
  slots.forEach((slotIdx, i) => { fields[slotIdx] = reordered[i]; });
}

// ── public init (called by the renderer AFTER it finishes rendering) ─────────
export function initInlineEdit(cfg: InlineEditConfig): void {
  // [InlineEdit→Builder 20260630] Activate ONLY inside the builder Design preview (config.isPreview).
  // The public ?view=form&edit=true path is retired (unstable double-stepper/border + DB-clobber risk);
  // isInlineEditContext() is kept exported for reference but no longer gates activation.
  if (!cfg.isPreview) return;
  STATE.cfg = cfg;
  const root = cfg.container || document.querySelector('[id^="mf-form-"], .mf-form, .mfp') as HTMLElement | null;
  if (!root) return;
  injectStyle();
  const n = scanAndTag(root as HTMLElement);
  let fre = 0;
  let blk = 0;
  try { fre = enableFieldLayoutEdit(root as HTMLElement); } catch (_e) { /* layout edit is additive — never block text edit */ }
  try { enableImageEdit(root as HTMLElement); } catch (_e) { /* image edit is additive */ }
  try { blk = enableBlockActions(root as HTMLElement); } catch (_e) { /* block action menu is additive */ }
  // eslint-disable-next-line no-console
  console.log('[mf-inline-edit] v20260629-11 — ' + n + ' editable strings + ' + fre + ' resizable/draggable fields + ' + blk + ' block menus tagged (host edit-mode).');
  showHint(n);
}

function showHint(n: number): void {
  if (!n) return;
  let hint = document.getElementById('mf-ie-hint');
  if (hint) return;
  hint = document.createElement('div');
  hint.id = 'mf-ie-hint';
  hint.className = 'mf-ie-hint';
  hint.innerHTML = '<i class="fas fa-i-cursor"></i> ' + escapeHtml(t('ie.edit_mode_hint'));
  document.body.appendChild(hint);
  setTimeout(() => { if (hint && hint.parentNode) hint.style.opacity = '0'; }, 6000);
}

function injectStyle(): void {
  if (document.getElementById('mf-ie-style')) return;
  const s = document.createElement('style');
  s.id = 'mf-ie-style';
  s.textContent =
    '.mf-ie-editable{outline:1px dashed rgba(124,58,237,.35);outline-offset:2px;border-radius:4px;cursor:text;transition:outline-color .15s,background .15s;}' +
    '.mf-ie-editable:hover{outline-color:rgba(124,58,237,.8);background:rgba(124,58,237,.06);}' +
    '.mf-ie-editable.mf-ie-active{outline:2px solid #7c3aed;background:rgba(124,58,237,.1);}' +
    '.mf-ie-savepill{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:none;align-items:center;gap:8px;padding:11px 18px;border:0;border-radius:999px;background:#7c3aed;color:#fff;font-weight:700;font-size:14px;box-shadow:0 8px 24px rgba(124,58,237,.4);cursor:pointer;font-family:inherit;}' +
    '.mf-ie-savepill.is-dirty{display:inline-flex;}' +
    '.mf-ie-savepill.is-saving{display:inline-flex;background:#6d28d9;opacity:.85;}' +
    '.mf-ie-savepill.is-saved{display:inline-flex;background:#16a34a;}' +
    '.mf-ie-savepill.is-error{display:inline-flex;background:#dc2626;}' +
    '.mf-ie-hint{position:fixed;left:50%;transform:translateX(-50%);bottom:20px;z-index:2147482000;background:#0f172a;color:#e2e8f0;padding:9px 16px;border-radius:999px;font-size:13px;box-shadow:0 6px 18px rgba(0,0,0,.3);transition:opacity .6s;}' +
    // ── visual field resize/drag (host edit-mode) ──
    '.mf-fre-field{position:relative;}' +
    '.mf-fre-field:hover{outline:1px dashed rgba(37,99,235,.35);outline-offset:3px;}' +
    '.mf-fre-resize{position:absolute;top:0;right:-6px;width:12px;height:100%;cursor:ew-resize;z-index:30;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s;}' +
    '.mf-fre-resize::before{content:"";width:4px;height:34px;border-radius:3px;background:#2563eb;box-shadow:0 0 0 2px rgba(255,255,255,.8);}' +
    '.mf-fre-field:hover .mf-fre-resize,.mf-fre-resizing .mf-fre-resize{opacity:.9;}' +
    '.mf-fre-resize:hover{opacity:1;}' +
    '.mf-fre-drag{position:absolute;top:2px;left:-2px;width:22px;height:22px;border-radius:6px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:grab;z-index:31;opacity:0;transition:opacity .15s;box-shadow:0 2px 6px rgba(37,99,235,.4);}' +
    '.mf-fre-field:hover .mf-fre-drag{opacity:.92;}' +
    '.mf-fre-drag:active{cursor:grabbing;}' +
    '.mf-fre-dragging{opacity:.55;outline:2px solid #2563eb;}' +
    '.mf-fre-resizing{outline:2px solid #2563eb;outline-offset:2px;}' +
    '.mf-fre-grid{position:absolute;inset:0;z-index:0;display:none;grid-template-columns:repeat(12,1fr);gap:0;pointer-events:none;}' +
    '.mf-fre-grid>span{border-left:1px dashed rgba(37,99,235,.28);}' +
    '.mf-fre-grid>span:last-child{border-right:1px dashed rgba(37,99,235,.28);}' +
    '.mf-fre-field>*:not(.mf-fre-resize):not(.mf-fre-drag){position:relative;z-index:1;}' +
    // [PDF-grid / FlexGrid editor v20260629] 2-D grid cell handles (drag move + SE resize).
    '.mf-flexgrid-item.mf-fge-item{position:relative;}' +
    '.mf-flexgrid-item.mf-fge-item:hover{outline:1px dashed rgba(37,99,235,.45);outline-offset:2px;}' +
    '.mf-fge-item:hover .mf-fre-drag{opacity:.92;}' +
    '.mf-fge-resize{position:absolute;right:-5px;bottom:-5px;width:16px;height:16px;cursor:nwse-resize;z-index:32;background:#2563eb;border:2px solid #fff;border-radius:4px;box-shadow:0 1px 4px rgba(37,99,235,.5);opacity:0;transition:opacity .15s;}' +
    '.mf-fge-item:hover .mf-fge-resize,.mf-fre-resizing .mf-fge-resize{opacity:.95;}' +
    '.mf-ie-gridbtn{position:fixed;right:16px;bottom:64px;z-index:99998;background:#7c3aed;color:#fff;border:none;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(124,58,237,.4);}' +
    '.mf-ie-gridbtn:hover{background:#6d28d9;}' +
    // ── image swap (img + background-image) ──
    '.mf-ie-img-editable{cursor:pointer;outline:2px dashed transparent;outline-offset:2px;transition:outline-color .15s;}' +
    '.mf-ie-img-editable:hover{outline-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.2);}' +
    '.mf-ie-bg-editable{cursor:pointer;transition:outline-color .15s;}' +
    '.mf-ie-bg-editable:hover{outline:2px dashed #2563eb!important;outline-offset:-2px;}' +
    '.mf-ie-style-trigger{position:fixed;z-index:2147483551;width:28px;height:28px;border-radius:8px;border:1px solid #dbe3ef;background:#fff;color:#4f46e5;box-shadow:0 6px 18px rgba(15,23,42,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;padding:0;}' +
    '.mf-ie-style-trigger:hover{background:#eef2ff;}' +
    '.mf-ie-hero-panel{position:fixed;z-index:2147483550;width:280px;background:#fff;border:1px solid #dbe3ef;border-radius:12px;box-shadow:0 18px 46px rgba(15,23,42,.24);padding:10px;font-family:Inter,Segoe UI,system-ui,sans-serif;color:#0f172a;}' +
    '.mf-ie-hero-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;font-size:13px;font-weight:800;}' +
    '.mf-ie-hero-panel-head span{display:inline-flex;align-items:center;gap:7px;}' +
    '.mf-ie-hero-panel-head button{border:0;background:transparent;color:#64748b;font-size:20px;line-height:1;cursor:pointer;padding:0 2px;}' +
    '.mf-ie-hero-panel label{display:flex;flex-direction:column;gap:4px;margin:7px 0;font-size:11px;font-weight:700;color:#475569;}' +
    '.mf-ie-hero-panel input,.mf-ie-hero-panel select{width:100%;min-width:0;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font:600 12px/1.2 Inter,Segoe UI,system-ui,sans-serif;box-sizing:border-box;}' +
    '.mf-ie-hero-panel input.is-invalid{border-color:#ef4444!important;box-shadow:0 0 0 2px rgba(239,68,68,.14);}' +
    '.mf-ie-hero-panel input[type=color]{height:32px;padding:2px;}' +
    '.mf-ie-hero-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;}' +
    '.mf-ie-hero-row--color{grid-template-columns:74px 1fr;}' +
    '.mf-ie-panel-primary{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;border:0;border-radius:9px;background:#2563eb;color:#fff;font:800 12px/1 Inter,Segoe UI,system-ui,sans-serif;padding:9px 10px;cursor:pointer;}' +
    '.mf-ie-panel-primary:hover{background:#1d4ed8;}' +
    '.mf-ie-panel-secondary{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid #cbd5e1;border-radius:9px;background:#f8fafc;color:#0f172a;font:800 12px/1 Inter,Segoe UI,system-ui,sans-serif;padding:8px 10px;cursor:pointer;}' +
    '.mf-ie-panel-secondary:hover{border-color:#2563eb;color:#1d4ed8;background:#eff6ff;}' +
    '.mf-ie-img-btn{position:fixed;z-index:2147483700;display:inline-flex;align-items:center;gap:6px;border:0;border-radius:8px;background:rgba(37,99,235,.94);color:#fff;font:800 11px/1 Inter,Segoe UI,system-ui,sans-serif;padding:7px 9px;cursor:pointer;pointer-events:auto;box-shadow:0 8px 18px rgba(15,23,42,.24);}' +
    '.mf-ie-img-btn:hover{background:#1d4ed8;}' +
    '.mf-ie-bg-editable:hover::after{content:"\\f03e  ' + cssContent(t('ie.change_bg')) + '";font-family:"Font Awesome 6 Free","FontAwesome",inherit;font-weight:900;position:absolute;top:8px;left:8px;z-index:40;background:rgba(37,99,235,.92);color:#fff;font-size:11px;padding:3px 8px;border-radius:6px;pointer-events:none;}' +
    // ── built-in image gallery modal ──
    '.mf-ie-gallery-backdrop{position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;}' +
    '.mf-ie-gallery-shell{width:min(820px,96vw);max-height:88vh;display:flex;flex-direction:column;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.4);overflow:hidden;font-family:inherit;}' +
    '.mf-ie-gallery-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #e2e8f0;}' +
    '.mf-ie-gallery-title{font-weight:700;color:#0f172a;display:flex;align-items:center;gap:7px;}' +
    '.mf-ie-gallery-search{flex:1;min-width:60px;border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px;font:inherit;}' +
    '.mf-ie-gallery-upload{display:inline-flex;align-items:center;gap:6px;background:#2563eb;color:#fff;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;}' +
    '.mf-ie-gallery-url{border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;padding:7px 10px;font:inherit;cursor:pointer;}' +
    '.mf-ie-gallery-close{border:0;background:transparent;font-size:24px;line-height:1;color:#64748b;cursor:pointer;padding:0 4px;}' +
    '.mf-ie-gallery-body{padding:14px;overflow:auto;}' +
    '.mf-ie-gallery-loading,.mf-ie-gallery-empty{color:#64748b;padding:30px;text-align:center;}' +
    '.mf-ie-gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;}' +
    '.mf-ie-gallery-card{border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:6px;cursor:pointer;display:flex;flex-direction:column;gap:6px;font:inherit;}' +
    '.mf-ie-gallery-card:hover{border-color:#2563eb;box-shadow:0 4px 12px rgba(37,99,235,.18);}' +
    '.mf-ie-gallery-thumb{display:block;height:96px;border-radius:6px;overflow:hidden;background:#f1f5f9;}' +
    '.mf-ie-gallery-thumb img{width:100%;height:100%;object-fit:cover;}' +
    '.mf-ie-gallery-name{font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    // ── per-block action menu (header/steps/section) ──
    '.mf-ieblk{position:relative;}' +
    '.mf-ieblk-btn{position:absolute;top:6px;right:6px;z-index:42;width:26px;height:26px;border:0;border-radius:7px;background:rgba(37,99,235,.92);color:#fff;font-size:12px;cursor:pointer;opacity:0;transition:opacity .15s;box-shadow:0 2px 6px rgba(37,99,235,.4);}' +
    '.mf-ieblk:hover>.mf-ieblk-btn{opacity:1;}' +
    '.mf-ieblk-hidden{opacity:.4!important;outline:2px dashed #ef4444!important;outline-offset:-2px;position:relative;}' +
    '.mf-ieblk-hidden::before{content:"' + cssContent(t('ie.hidden_preview')) + '";position:absolute;top:6px;left:6px;z-index:41;background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;pointer-events:none;}' +
    '.mf-ieblk-menu{position:fixed;z-index:2147483600;min-width:180px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.22);padding:6px;font-family:inherit;}' +
    '.mf-ieblk-menu-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;padding:4px 8px;}' +
    '.mf-ieblk-menu-item{display:flex;align-items:center;gap:9px;width:100%;border:0;background:transparent;text-align:left;padding:8px 10px;border-radius:7px;font-size:13px;color:#1e293b;cursor:pointer;}' +
    '.mf-ieblk-menu-item:hover{background:#f1f5f9;}' +
    '.mf-ieblk-menu-item i{width:16px;text-align:center;color:#2563eb;}';
  document.head.appendChild(s);
}

export const INLINE_EDIT_BADGE = 'InlineEdit v20260629-11';
