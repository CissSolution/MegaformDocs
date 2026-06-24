// /src/widgets/pdf-form-builder/index.ts
// MegaForm plugin contract adapter for the v6 PDF Form Builder.
//
// Replaces the old single-file `megaform-widget-pdf-form.ts`.
// Same widget type name `PdfForm` so existing form schemas are compatible.
//
// What this file does:
//   1. Imports v6 multi-file builder (renderer + types + styles)
//   2. Adapts to MegaForm plugin contract: render/bind/collect/validate
//   3. Bridges widgetProps → PdfFormBuilderProps
//   4. Hooks fillValues sync → hidden input on submit
//   5. Provides admin upload entry-point (Builder properties calls
//      window.MFPdfForm.uploadAdminPdf(file) → POST → returns URL → setting pdfUrl)
//
// Mode resolution:
//   - In Builder canvas (admin designing) → mode='edit' (drag-drop palette enabled)
//   - In runtime/RederHost (end-user filling) → mode='fill'
//   - Toolbar lets admin/user toggle between Edit/Preview/Fill at runtime

import './styles.css';
import { PdfFormBuilderRenderer } from './renderer/PdfFormBuilderRenderer';
import './builder/PdfFormBuilderConfig';

const BADGE = 'PdfForm v20260602-B40';
const ADMIN_UPLOAD_PATH = 'PdfForm/UploadTemplate'; // admin upload (template)
const SUBMIT_UPLOAD_PATH = 'Upload/File';           // end-user upload (filled PDF)

(function () {
  'use strict';

  interface FieldLike {
    key?: string;
    type?: string;
    widgetProps?: Record<string, any>;
  }

  interface AdapterProps {
    pdfUrl: string;
    pdfBase64: string;
    fields: any[];
    mode: 'edit' | 'preview' | 'fill';
    systemFont: string;
    defaultZoom: number;
    showToolbar: boolean;
    showZoomControls: boolean;
    showPageBar: boolean;
    showGrid: boolean;
    snapEnabled: boolean;
    gridSize: number;
    cssClass: string;
    emptyMessage: string;
    // [PdfKeyNav v20260602-B40] When the viewer is focused, arrow keys move
    // between pages. `wrapPages=true` loops past last → first (and first → last).
    wrapPages: boolean;
  }

  const defaults: AdapterProps = {
    pdfUrl: '',
    pdfBase64: '',
    fields: [],
    mode: 'fill',
    systemFont: '',
    defaultZoom: 1.0,
    showToolbar: true,
    showZoomControls: true,
    showPageBar: true,
    showGrid: true,
    snapEnabled: false,
    gridSize: 8,
    cssClass: '',
    emptyMessage: 'Open the Builder to upload a PDF and place fields.',
    wrapPages: false
  };

  // Builder properties panel — kept minimal. The drag-drop layout +
  // PDF upload + field placement is done inside the popup designer
  // (click 📄 Open PDF Form Builder on the canvas card).
  const properties = [
    { key: 'pdfUrl',          label: 'PDF URL (set via designer)', type: 'text',
      help: 'Click "Open PDF Form Builder" on the canvas to upload PDF and place fields.' },
    { key: 'mode',            label: 'Runtime mode', type: 'select', options: [
      { label: 'Fill (end-user fills)', value: 'fill' },
      { label: 'Preview (read-only)',   value: 'preview' }
    ] },
    { key: 'defaultZoom',     label: 'Default Zoom', type: 'number', min: 0.4, max: 3.0, step: 0.1 },
    { key: 'wrapPages',       label: 'Loop pages with arrow keys', type: 'checkbox',
      help: 'When the PDF viewer is focused, ArrowRight/PageDown moves to the next page and ArrowLeft/PageUp goes back. Enable to wrap from the last page back to the first (and vice versa).' },
    { key: 'cssClass',        label: 'Extra CSS class', type: 'text' },
    { key: 'emptyMessage',    label: 'Empty message',   type: 'text' }
  ];

  const instances = new Map<string, PdfFormBuilderRenderer>();

  function getProps(field: FieldLike): AdapterProps {
    const wp = field.widgetProps || {};
    const merged: any = {};
    for (const k in defaults) (merged as any)[k] = (defaults as any)[k];
    for (const k in wp) {
      if ((wp as any)[k] !== undefined && (wp as any)[k] !== null) (merged as any)[k] = (wp as any)[k];
    }
    return merged as AdapterProps;
  }

  function escAttr(v: any): string {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function instanceKey(formId: number, fieldKey: string): string {
    return formId + '|' + fieldKey;
  }

  function findFieldInSchema(formId: number, fieldKey: string): FieldLike | null {
    // Try MegaForm runtime state in several known shapes
    const winAny = window as any;
    const candidates: any[] = [
      winAny.MegaFormRenderer && winAny.MegaFormRenderer.getState && winAny.MegaFormRenderer.getState(formId),
      winAny.MegaFormBuilder && winAny.MegaFormBuilder.state,
      winAny.__megaformState && winAny.__megaformState[formId],
    ];
    for (const st of candidates) {
      if (!st) continue;
      const schema = st.schema || st;
      const fields = (schema && schema.fields) || [];
      for (const f of fields) {
        if (f && f.key === fieldKey) return f;
      }
    }
    return null;
  }

  function parseExistingValue(raw: string): { values: any; signatures: any; images: any; fields?: any[]; font?: string } {
    if (!raw) return { values: {}, signatures: {}, images: {} };
    try {
      const parsed = JSON.parse(raw);
      return {
        values:     parsed.values     || {},
        signatures: parsed.signatures || {},
        images:     parsed.images     || {},
        fields:     parsed.fields     || undefined,
        font:       parsed.font       || undefined
      };
    } catch {
      return { values: {}, signatures: {}, images: {} };
    }
  }

  function render(field: FieldLike, formId: number, existingValue?: string): string {
    const id = 'mf-pdf-' + formId + '-' + (field.key || '');
    // Embed widgetProps as a data-attr so bind() doesn't depend on global
    // state lookups. Same pattern DataRepeater uses (data-mfdr-props).
    let propsJson = '{}';
    try { propsJson = JSON.stringify(field.widgetProps || {}); } catch { /* keep default */ }
    return ''
      + '<div class="mfw-pdf-form" id="' + escAttr(id) + '"'
      + ' data-field-key="' + escAttr(field.key || '') + '"'
      + ' data-form-id="'   + escAttr(formId) + '"'
      + ' data-pdf-badge="' + escAttr(BADGE) + '"'
      + ' data-mfpdf-props="' + escAttr(propsJson) + '">'
      + '<input type="hidden" name="' + escAttr(field.key || '') + '" id="' + escAttr(id + '-value') + '" value="' + escAttr(existingValue || '') + '">'
      + '<div class="mfw-pdf-host"></div>'
      + '</div>';
  }

  function bind(formId: number): void {
    const wraps = document.querySelectorAll('.mfw-pdf-form[data-form-id="' + String(formId) + '"]');
    wraps.forEach(function (wrapEl) {
      const wrap = wrapEl as HTMLElement;
      const key = wrap.getAttribute('data-field-key') || '';
      if (!key) return;

      // Avoid double-mount
      const ikey = instanceKey(formId, key);
      if (instances.has(ikey)) return;

      const host = wrap.querySelector('.mfw-pdf-host') as HTMLElement;
      const hidden = wrap.querySelector('input[type="hidden"]') as HTMLInputElement;
      if (!host || !hidden) return;

      // PRIMARY: read widgetProps from data-mfpdf-props attribute (embedded by render()).
      // FALLBACK: lookup runtime/builder state if attr missing.
      let field: FieldLike = { key: key, widgetProps: {} };
      const dataPropsAttr = wrap.getAttribute('data-mfpdf-props');
      if (dataPropsAttr) {
        try { field.widgetProps = JSON.parse(dataPropsAttr); } catch { /* ignore */ }
      }
      if (!field.widgetProps || Object.keys(field.widgetProps).length === 0) {
        const lookup = findFieldInSchema(formId, key);
        if (lookup) field = lookup;
      }
      const props = getProps(field);

      // Parse existing submission value
      const existing = parseExistingValue(hidden.value || '');
      // Schema fields in widgetProps are the canvas layout; existing.fields override
      // only if they exist (lets re-fills preserve same layout the admin saved)
      const fieldsLayout = (existing.fields && existing.fields.length) ? existing.fields : (props.fields || []);
      const fontPref = existing.font || props.systemFont || undefined;

      // [CombinedToolbar v20260506-11] In runtime fill/preview mode we don't
      // show the renderer's own toolbar — the sticky top bar (injected below)
      // takes over with combined Submit + zoom + Download PDF, saving space.
      const isFillRuntime = props.mode === 'fill' || props.mode === 'preview';
      const showToolbarFlag = isFillRuntime ? false : props.showToolbar;

      const renderer = new PdfFormBuilderRenderer(host, {
        pdfUrl: props.pdfUrl || undefined,
        pdfBase64: props.pdfBase64 || undefined,
        fields: fieldsLayout,
        mode: props.mode,
        systemFont: fontPref,
        defaultZoom: props.defaultZoom,
        showToolbar: showToolbarFlag,
        showZoomControls: props.showZoomControls,
        showPageBar: props.showPageBar,
        showGrid: props.showGrid,
        snapEnabled: props.snapEnabled,
        gridSize: props.gridSize,
        cssClass: props.cssClass,
        emptyMessage: props.emptyMessage
      });

      // Seed initial fillValues / signatures / images BEFORE mount paints inputs
      (renderer as any).fillValues = existing.values;
      (renderer as any).sigStates  = existing.signatures;
      (renderer as any).imgStates  = existing.images;

      renderer.mount();
      instances.set(ikey, renderer);

      // Sync helper — read full state from renderer + write JSON to hidden input
      function syncToHidden(): void {
        try {
          const payload = {
            badge: BADGE,
            values:     renderer.getFillValues(),
            signatures: renderer.getSignatureStates(),
            images:     renderer.getImageStates(),
            font:       renderer.getSystemFont(),
            fields:     renderer.getFields()
          };
          hidden.value = JSON.stringify(payload);
        } catch (err) {
          // swallow
        }
      }

      // Capture all interaction events at the host level (fill, edit, font change, etc.)
      ['input', 'change', 'click', 'mouseup', 'touchend'].forEach(function (evt) {
        host.addEventListener(evt, syncToHidden, true);
      });

      // Initial sync (in case existing values restored)
      syncToHidden();

      // ── Auto-upload filled PDF on form submit ──
      // Find parent <form> and intercept its submit so we can upload the
      // generated PDF first, then resume submission. Each PdfForm field on
      // the page registers ONE listener per form (idempotent via flag).
      hookFormSubmit(formId, key, wrap, hidden, renderer);

      // [CombinedToolbar v20260506-11] One sticky bar with Submit + zoom +
      // Download PDF (replaces old 2 separate bars). Also hides the host
      // form's bottom Submit button (PDF widget owns submission UX now).
      injectStickyTopSubmit(formId, wrap, renderer);
      hideHostFormBottomSubmit(formId);

      // [PdfKeyNav v20260602-B40] Arrow-key page navigation + native Ctrl+C
      // copy-from-selection. Listener attaches to the wrap so it only fires
      // when the user is interacting with this widget — never hijacks keys
      // typed into other fields elsewhere on the form.
      attachArrowKeyNavigation(wrap, renderer, !!props.wrapPages);
    });
  }

  /**
   * [PdfKeyNav v20260602-B40] Arrow-key page navigation for the PDF viewer.
   *
   *   ArrowRight / PageDown / Space     → next page
   *   ArrowLeft  / PageUp  / Shift+Space → previous page
   *   Home                              → first page
   *   End                               → last page
   *
   * Behaviour:
   *   - Listens on the widget wrap (tabindex=0) so other form fields keep
   *     receiving normal key events.
   *   - Ignores key events whose target is an editable element (input /
   *     textarea / select / contenteditable) so users can still type inside
   *     fillable PDF fields rendered by the overlay.
   *   - Does NOT preventDefault on Ctrl/Meta-modified keys. Native Ctrl+C
   *     copies the current text-layer selection via the browser default.
   *   - When `wrapPages` is true, advancing past the last page loops to the
   *     first; going back from the first wraps to the last.
   *   - Uses scrollIntoView with `behavior: 'smooth'` so the transition
   *     is visible without redrawing PDF canvases (PdfRenderer keeps each
   *     page mounted, so we just scroll the viewport).
   */
  function attachArrowKeyNavigation(
    wrap: HTMLElement,
    renderer: PdfFormBuilderRenderer,
    wrapPages: boolean
  ): void {
    if ((wrap as any).__mfPdfKeyNavBound) return;
    (wrap as any).__mfPdfKeyNavBound = true;
    (window as any).__MF_PDF_KEYNAV_BADGE__ = 'PdfKeyNav v20260602-B40';

    // Make the wrap focusable so it can capture key events. Without
    // tabindex, focus would fall through to body and we'd never see
    // the keypress on this element.
    if (!wrap.hasAttribute('tabindex')) wrap.setAttribute('tabindex', '0');
    wrap.style.outline = wrap.style.outline || 'none';

    function getPageWrappers(): HTMLElement[] {
      // Prefer renderer-owned wrappers when accessible; fall back to DOM.
      const pdfR: any = (renderer as any).pdfRenderer;
      if (pdfR && Array.isArray(pdfR.pageWrappers) && pdfR.pageWrappers.length) {
        return pdfR.pageWrappers as HTMLElement[];
      }
      return Array.prototype.slice.call(wrap.querySelectorAll('.pfb-page')) as HTMLElement[];
    }

    function currentPageIndex(pages: HTMLElement[]): number {
      // Pick the page whose center is closest to the viewport's vertical
      // middle. Works for both the in-document and full-screen modes.
      if (!pages.length) return -1;
      const winMid = (window.innerHeight || document.documentElement.clientHeight) / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < pages.length; i++) {
        const rect = pages[i].getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const d = Math.abs(mid - winMid);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      return bestIdx;
    }

    function scrollToPage(pages: HTMLElement[], idx: number): void {
      if (idx < 0 || idx >= pages.length) return;
      try {
        pages[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        pages[idx].scrollIntoView();
      }
    }

    function isEditableTarget(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null;
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if ((el as any).isContentEditable) return true;
      return false;
    }

    wrap.addEventListener('keydown', function (ev: KeyboardEvent) {
      // Never swallow copy/cut/paste/select-all. The PDF.js text layer (when
      // present) supports selection, so Ctrl+C falls through to the browser.
      if (ev.ctrlKey || ev.metaKey) return;
      if (isEditableTarget(ev.target)) return;

      const key = ev.key;
      const isNext =
        key === 'ArrowRight' || key === 'PageDown' ||
        (key === ' ' && !ev.shiftKey);
      const isPrev =
        key === 'ArrowLeft' || key === 'PageUp' ||
        (key === ' ' && ev.shiftKey);
      const isHome = key === 'Home';
      const isEnd  = key === 'End';

      if (!isNext && !isPrev && !isHome && !isEnd) return;

      const pages = getPageWrappers();
      if (!pages.length) return;

      const cur = currentPageIndex(pages);
      let target = cur;

      if (isHome) target = 0;
      else if (isEnd) target = pages.length - 1;
      else if (isNext) {
        target = cur + 1;
        if (target >= pages.length) target = wrapPages ? 0 : pages.length - 1;
      } else if (isPrev) {
        target = cur - 1;
        if (target < 0) target = wrapPages ? pages.length - 1 : 0;
      }

      if (target === cur) {
        // Already at the boundary and wrap disabled — let arrow keys do
        // their normal scroll-by-line within the viewport. Don't block.
        if (!wrapPages && (isNext || isPrev)) return;
      }

      ev.preventDefault();
      scrollToPage(pages, target);
    });

    // Auto-focus on first click inside the viewer so the user doesn't have
    // to Tab to the widget before arrow keys work.
    wrap.addEventListener('mousedown', function (ev: MouseEvent) {
      if (isEditableTarget(ev.target)) return;
      // Defer focus so the original click target (e.g. a field overlay)
      // still receives its own focus/blur before we steal it.
      setTimeout(function () {
        try { wrap.focus({ preventScroll: true } as any); } catch { wrap.focus(); }
      }, 0);
    });
  }

  /**
   * [CombinedToolbar v20260506-11] Single sticky bar replacing the old
   * Submit-only sticky + renderer toolbar combo. Saves vertical space and
   * keeps every PDF action one tap away. Buttons:
   *   - Submit (delegates to host #mf-btn-submit-FID, preserving auto-upload hook)
   *   - Zoom out / zoom level / zoom in / Fit (calls renderer methods)
   *   - Download PDF (calls renderer.exportFilledPdf)
   */
  function injectStickyTopSubmit(formId: number, wrap: HTMLElement, renderer: PdfFormBuilderRenderer): void {
    if (wrap.querySelector('.mfw-pdf-sticky-submit')) return;
    const bar = document.createElement('div');
    bar.className = 'mfw-pdf-sticky-submit';
    bar.style.cssText = 'position:sticky;top:0;z-index:50;background:linear-gradient(180deg,#fff 0%,#f8fafc 100%);border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;box-shadow:0 2px 8px rgba(15,23,42,.08)';
    bar.innerHTML =
      // [PdfFormToolbar v20260516-04] Removed left-side "PDF Form — fill, then submit" label;
      // the zoom controls now hug the left edge and Download/Submit are pushed right with margin-left:auto.
        '<button type="button" class="mfw-pdf-zoom-out" title="Zoom out" style="background:#fff;border:1px solid #cbd5e1;border-radius:4px;padding:6px 10px;cursor:pointer;font-size:13px;min-width:32px">−</button>'
      + '<span class="mfw-pdf-zoom-label" style="font-size:12px;color:#475569;min-width:42px;text-align:center;font-weight:500">100%</span>'
      + '<button type="button" class="mfw-pdf-zoom-in" title="Zoom in" style="background:#fff;border:1px solid #cbd5e1;border-radius:4px;padding:6px 10px;cursor:pointer;font-size:13px;min-width:32px">+</button>'
      + '<button type="button" class="mfw-pdf-zoom-fit" title="Fit page width" style="background:#fff;border:1px solid #cbd5e1;border-radius:4px;padding:6px 10px;cursor:pointer;font-size:12px">Fit</button>'
      + '<button type="button" class="mfw-pdf-fs" title="Toggle full screen" style="background:#fff;border:1px solid #cbd5e1;border-radius:4px;padding:6px 10px;cursor:pointer;font-size:13px;min-width:32px" aria-label="Full screen">⛶</button>'
      + '<button type="button" class="mfw-pdf-download" title="Download a copy of the filled PDF" style="margin-left:auto;background:#16a34a;color:#fff;border:0;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px">'
      + '<i class="fas fa-download"></i> PDF</button>'
      + '<button type="button" class="mfw-pdf-sticky-submit-btn" style="background:#2563eb;color:#fff;border:0;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px">'
      + '<i class="fas fa-paper-plane"></i> Submit'
      + '</button>';
    wrap.insertBefore(bar, wrap.firstChild);

    const submitBtn = bar.querySelector('.mfw-pdf-sticky-submit-btn') as HTMLButtonElement;
    const zoomOut   = bar.querySelector('.mfw-pdf-zoom-out')         as HTMLButtonElement;
    const zoomIn    = bar.querySelector('.mfw-pdf-zoom-in')          as HTMLButtonElement;
    const zoomFit   = bar.querySelector('.mfw-pdf-zoom-fit')         as HTMLButtonElement;
    const zoomLbl   = bar.querySelector('.mfw-pdf-zoom-label')       as HTMLElement;
    const dlBtn     = bar.querySelector('.mfw-pdf-download')         as HTMLButtonElement;
    const fsBtn     = bar.querySelector('.mfw-pdf-fs')               as HTMLButtonElement;

    submitBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      const hostBtn = document.getElementById('mf-btn-submit-' + formId) as HTMLButtonElement | null;
      if (hostBtn) hostBtn.click();
    });

    function syncZoomLabel(): void {
      const z = (renderer as any).zoom || 1;
      zoomLbl.textContent = Math.round(z * 100) + '%';
    }
    zoomOut.addEventListener('click', function (ev) {
      ev.preventDefault();
      const z = (renderer as any).zoom || 1;
      const next = Math.max(0.4, +(z - 0.1).toFixed(2));
      renderer.setZoom(next).then(syncZoomLabel);
    });
    zoomIn.addEventListener('click', function (ev) {
      ev.preventDefault();
      const z = (renderer as any).zoom || 1;
      const next = Math.min(3.0, +(z + 0.1).toFixed(2));
      renderer.setZoom(next).then(syncZoomLabel);
    });
    zoomFit.addEventListener('click', function (ev) {
      ev.preventDefault();
      // PdfFormBuilderRenderer.fitToWidth is private — fallback: compute via setZoom
      const pages = (renderer as any).pdfRenderer && (renderer as any).pdfRenderer.pageInfos;
      const viewportEl = (renderer as any).viewportEl as HTMLElement | undefined;
      if (!pages || !pages.length || !viewportEl) return;
      const targetW = viewportEl.clientWidth - 24;
      const z = targetW / pages[0].width;
      const next = Math.max(0.4, Math.min(3.0, +z.toFixed(2)));
      renderer.setZoom(next).then(syncZoomLabel);
    });
    dlBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      renderer.exportFilledPdf();
    });
    if (fsBtn) {
      // [PdfRuntimeFullscreen v20260507-19] Toggle fullscreen on the PDF
      // widget wrapper using the browser Fullscreen API. Mirror the icon
      // state so the user knows whether they're entering or exiting.
      fsBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        const docAny = document as any;
        const elAny  = wrap as any;
        const inFs = docAny.fullscreenElement || docAny.webkitFullscreenElement || docAny.msFullscreenElement;
        if (inFs) {
          const exit = docAny.exitFullscreen || docAny.webkitExitFullscreen || docAny.msExitFullscreen;
          if (exit) exit.call(docAny);
          fsBtn.innerHTML = '⛶';
          fsBtn.title = 'Toggle full screen';
        } else {
          const req = elAny.requestFullscreen || elAny.webkitRequestFullscreen || elAny.msRequestFullscreen;
          if (req) {
            req.call(elAny);
            fsBtn.innerHTML = '⛶';
            fsBtn.title = 'Exit full screen';
          }
        }
      });
      document.addEventListener('fullscreenchange', function () {
        const docAny = document as any;
        const inFs = docAny.fullscreenElement || docAny.webkitFullscreenElement || docAny.msFullscreenElement;
        fsBtn.title = inFs ? 'Exit full screen' : 'Toggle full screen';
      });
      (window as any).__MF_PDF_RUNTIME_FS_BADGE__ = 'PdfRuntimeFullscreen v20260507-19';
    }
    syncZoomLabel();

    (window as any).__MF_PDF_STICKY_SUBMIT_BADGE__ = 'CombinedToolbar v20260507-19';
  }

  /**
   * Inject CSS that hides the host form's bottom Submit button when this
   * PDF widget owns the submission UX. We don't disable the button (the
   * sticky bar's Submit click delegates to it), just make it visually gone.
   */
  // [PdfRequiredHookValidation v20260507-17] CSS for the invalid-required ring
  // used by renderer.highlightInvalidFields(). Injected once per page; uses
  // outline + box-shadow so it never affects layout / overlay positions.
  function injectInvalidFieldStyles(): void {
    const styleId = 'mfw-pdf-invalid-styles';
    if (document.getElementById(styleId)) return;
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = ''
      + '.pfb-field.pfb-field-invalid{outline:2px dashed #dc2626 !important;outline-offset:2px;'
      +   'box-shadow:0 0 0 4px rgba(220,38,38,0.15) !important;animation:pfb-invalid-pulse 1.4s ease-out 2;}'
      + '@keyframes pfb-invalid-pulse{0%{box-shadow:0 0 0 0 rgba(220,38,38,0.55)}100%{box-shadow:0 0 0 12px rgba(220,38,38,0)}}';
    document.head.appendChild(s);
    (window as any).__MF_PDF_INVALID_STYLE_BADGE__ = 'PdfInvalidStyle v20260507-17';
  }

  function hideHostFormBottomSubmit(formId: number): void {
    const styleId = 'mfw-pdf-hide-host-submit-' + formId;
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = ''
      + '#mf-btn-submit-' + formId + '{display:none !important;}'
      + '.mf-form-actions:has(#mf-btn-submit-' + formId + '):not(:has(.mf-btn:not([id^="mf-btn-submit-"]):not([style*="display:none"]))){display:none !important;}';
    document.head.appendChild(style);
  }

  /**
   * [SubmitButtonHook v20260506-08] The MegaForm renderer wires the Submit
   * button as <button type="button"> + click handler that calls doSubmit()
   * directly — it NEVER fires a native form 'submit' event. So listening on
   * `form.addEventListener('submit', …)` (the v20260506-04 implementation)
   * silently never fires. Fix: hook the button's click in the CAPTURE phase
   * so we run BEFORE the renderer's bubble-phase handler, do the PDF upload
   * asynchronously, then re-fire the click with a bypass flag so the
   * renderer's handler runs normally and sees the merged payload.
   */
  function hookFormSubmit(
    formId: number,
    fieldKey: string,
    wrap: HTMLElement,
    hidden: HTMLInputElement,
    renderer: PdfFormBuilderRenderer
  ): void {
    const btn = document.getElementById('mf-btn-submit-' + formId) as HTMLButtonElement | null;
    if (!btn) {
      // Submit button not in DOM yet — retry briefly (renderer may be late)
      let tries = 0;
      const t = setInterval(() => {
        const b = document.getElementById('mf-btn-submit-' + formId) as HTMLButtonElement | null;
        if (b || ++tries > 40) {
          clearInterval(t);
          if (b) hookFormSubmit(formId, fieldKey, wrap, hidden, renderer);
        }
      }, 150);
      return;
    }

    const listenerFlag = '__mfPdfHookBtn_' + fieldKey;
    if ((btn as any)[listenerFlag]) return;
    (btn as any)[listenerFlag] = true;
    (window as any).__MF_PDF_SUBMIT_HOOK_BADGE__ = 'SubmitButtonHook v20260506-08';

    let bypass = false;
    let busy = false;

    // [PdfRequiredHookValidation v20260507-17] Inject CSS for the invalid ring
    // once per page (idempotent). Highlights any required field flagged below.
    injectInvalidFieldStyles();

    btn.addEventListener('click', async function (ev: Event) {
      if (bypass) { bypass = false; return; }       // 2nd pass — let through
      if (busy) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }

      ev.preventDefault();
      ev.stopImmediatePropagation();                // block renderer's bubble click handler

      // Inline status indicator
      let status = wrap.querySelector('.mfw-pdf-submit-status') as HTMLElement | null;
      if (!status) {
        status = document.createElement('div');
        status.className = 'mfw-pdf-submit-status';
        status.style.cssText = 'margin:8px 0;padding:8px 12px;border-radius:4px;font-size:13px;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe';
        wrap.insertBefore(status, wrap.firstChild);
      }

      // [PdfRequiredHookValidation v20260507-17] Pre-flight required-field
      // check. If any required field is empty, abort early — show inline
      // banner + outline the missing fields in red, scroll to first one.
      // Never bypass / never re-fire the click → renderer's bubble handler is
      // also blocked (stopImmediatePropagation above) so the ugly raw "Required
      // field 'xxx' is empty." text never appears under the widget.
      try {
        const issues = renderer.getValidationIssues ? renderer.getValidationIssues() : [];
        if (issues && issues.length > 0) {
          const ids = issues.map((i: { id: string }) => i.id);
          renderer.highlightInvalidFields(ids);
          const first = issues[0];
          const more = issues.length > 1 ? ' (+' + (issues.length - 1) + ' more)' : '';
          status.textContent = '⚠ ' + first.message + more;
          status.style.background = '#fef2f2';
          status.style.color      = '#991b1b';
          status.style.border     = '1px solid #fecaca';
          // Also clear the renderer's mf-err-{key} text in case it ever fires later.
          const errEl = document.getElementById('mf-err-' + fieldKey);
          if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
          return; // abort — busy stays false, user fixes + clicks again
        } else {
          renderer.highlightInvalidFields([]);
        }
      } catch (validationErr) {
        console.warn('[MegaForm.PdfForm] validation error (continuing):', validationErr);
      }

      busy = true;
      status.style.background = '#eff6ff'; status.style.color = '#1e40af'; status.style.border = '1px solid #bfdbfe';
      status.textContent = '⏳ Generating filled PDF…';

      // [PdfErrorUx v20260506-11] Friendlier status messages — no raw HTTP /
      // server JSON dumps in the user-facing banner. Keep technical detail in
      // console.warn for admins debugging via DevTools.
      try {
        const pdfBytes = await renderer.generateFilledPdfBytes();
        if (pdfBytes) {
          status.textContent = '⏳ Uploading filled PDF…';
          const baseName = 'filled-' + Date.now() + '.pdf';
          const result = await uploadFilledPdf(formId, fieldKey, pdfBytes, baseName);
          if (!result.ok) {
            console.warn('[MegaForm.PdfForm] upload failed:', result.error);
            status.textContent = '⚠ Could not save PDF copy to the server — your form values will still be submitted.';
            status.style.background = '#fef3c7'; status.style.color = '#854d0e'; status.style.border = '1px solid #fde68a';
          } else if (result.file) {
            let payload: any = {};
            try { payload = JSON.parse(hidden.value || '{}'); } catch {}
            payload.pdfFile = result.file;
            hidden.value = JSON.stringify(payload);
            status.textContent = '✓ PDF saved — submitting…';
            status.style.background = '#dcfce7'; status.style.color = '#166534'; status.style.border = '1px solid #bbf7d0';
          }
        } else {
          status.textContent = '⚠ PDF preview not ready — submitting your form values now.';
          status.style.background = '#fef3c7'; status.style.color = '#854d0e'; status.style.border = '1px solid #fde68a';
        }
      } catch (err: any) {
        console.warn('[MegaForm.PdfForm] generate error:', err);
        status.textContent = '⚠ Could not build PDF copy — your form values will still be submitted.';
        status.style.background = '#fef3c7'; status.style.color = '#854d0e'; status.style.border = '1px solid #fde68a';
      } finally {
        busy = false;
        bypass = true;
        // Re-fire the click — bypass guard lets it through, renderer's
        // bubble-phase handler picks it up and runs doSubmit() with the
        // updated hidden-input payload (incl. pdfFile metadata).
        btn.click();
      }
    }, true /* CAPTURE PHASE — runs BEFORE renderer's bubble-phase click handler */);
  }

  /** POST a generated PDF blob to /Upload/File as the form-field's file attachment. */
  async function uploadFilledPdf(formId: number, fieldKey: string, pdfBytes: Uint8Array, fileName: string): Promise<{ ok: boolean; file?: any; error?: string }> {
    const fd = new FormData();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    fd.append('file', blob, fileName);
    fd.append('formId', String(formId));
    fd.append('fieldKey', fieldKey);
    try {
      const resp = await fetch(getApiBase() + SUBMIT_UPLOAD_PATH, { method: 'POST', body: fd, credentials: 'include' });
      if (!resp.ok) {
        const text = await resp.text();
        return { ok: false, error: 'HTTP ' + resp.status + ': ' + text.substring(0, 200) };
      }
      const data = await resp.json();
      return {
        ok: true, file: {
          fileName:    data.fileName    || fileName,
          fileSize:    data.fileSize    || pdfBytes.length,
          fileUrl:     data.fileUrl     || '',
          tempPath:    data.tempPath    || '',
          storedIn:    data.storedIn    || '',
          contentType: data.contentType || 'application/pdf'
        }
      };
    } catch (err: any) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  }

  function collect(key: string, container: HTMLElement): string {
    const inp = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
    return inp ? inp.value : '';
  }

  function validate(key: string, container: HTMLElement): boolean | string {
    // [PdfRequiredFriendly v20260507-17] When the renderer is attached we let
    // the click-hook handle the UX (inline status + highlight + abort BEFORE
    // PDF gen), so this fallback only runs if the renderer's hook never fired.
    // In that case still surface a friendly first-error message — never raw IDs.
    (window as any).__MF_PDF_VALIDATE_BADGE__ = 'PdfRequiredFriendly v20260507-17';
    const inp = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
    if (!inp || !inp.value) return true;
    try {
      const parsed = JSON.parse(inp.value);
      const fields = parsed.fields || [];
      const values = parsed.values || {};
      const sigs   = parsed.signatures || {};
      const imgs   = parsed.images || {};
      let ordinal = 0;
      for (const f of fields) {
        ordinal++;
        if (!f || !f.required) continue;
        const friendly = String(f.label || f.name || ('PDF Field ' + ordinal + ' (' + f.kind + ')')).trim();
        if (f.kind === 'signature' && !sigs[f.id]) return 'Please sign "' + friendly + '"';
        if (f.kind === 'image'     && !imgs[f.id]) return 'Please attach an image for "' + friendly + '"';
        if (f.kind === 'checkbox'  && !values[f.id]) return 'Please tick "' + friendly + '"';
        if (f.kind !== 'signature' && f.kind !== 'image' && f.kind !== 'checkbox' && !values[f.id]) {
          return 'Please fill "' + friendly + '"';
        }
      }
      return true;
    } catch {
      return true;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN UPLOAD HELPER (Path B — Upload via URL)
  // Builder properties panel calls window.MFPdfForm.uploadAdminPdf(file).
  // ═══════════════════════════════════════════════════════════════════════════

  function getApiBase(): string {
    const winAny = window as any;
    if (winAny.MFUtil && typeof winAny.MFUtil.getApiBase === 'function') {
      return String(winAny.MFUtil.getApiBase()).replace(/\/?$/, '/');
    }
    if (winAny.__MF_PLATFORM__ && winAny.__MF_PLATFORM__.apiBase) {
      return String(winAny.__MF_PLATFORM__.apiBase).replace(/\/?$/, '/');
    }
    // [B51] Platform-aware fallback
    const pf = winAny.__MF_PLATFORM__ || {};
    const platform = String(pf.platform || '').toLowerCase();
    if (platform === 'oqtane' || winAny.Oqtane || winAny.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
      return '/api/MegaForm/';
    }
    return '/DesktopModules/MegaForm/API/';
  }

  async function uploadAdminPdf(file: File): Promise<{ ok: boolean; url?: string; error?: string }> {
    if (!file || file.type !== 'application/pdf') {
      return { ok: false, error: 'Please select a PDF file.' };
    }
    const fd = new FormData();
    fd.append('file', file, file.name);
    try {
      const resp = await fetch(getApiBase() + ADMIN_UPLOAD_PATH, { method: 'POST', body: fd, credentials: 'include' });
      if (!resp.ok) {
        const text = await resp.text();
        return { ok: false, error: 'HTTP ' + resp.status + ': ' + text.substring(0, 200) };
      }
      const data = await resp.json();
      const url = data.fileUrl || data.url || data.FileUrl || '';
      if (!url) return { ok: false, error: 'Server did not return a URL.' };
      return { ok: true, url: url };
    } catch (err: any) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  function doRegister(W: any): void {
    W.register('PdfForm', {
      meta: { label: 'PDF Form', icon: 'fa-file-pdf', category: 'advanced', canonical: true },
      defaults: defaults,
      properties: properties,
      render: render,
      bind: bind,
      collect: collect,
      validate: validate
    });
    console.log('[MegaForm] ' + BADGE + ' registered.');
  }

  const W = (window as any).MegaFormWidgets;
  if (W && typeof W.register === 'function') {
    doRegister(W);
  } else {
    console.warn('[MegaForm] ' + BADGE + ': MegaFormWidgets not ready — deferred registration.');
    const handle = setInterval(function () {
      const W2 = (window as any).MegaFormWidgets;
      if (W2 && typeof W2.register === 'function') {
        clearInterval(handle);
        doRegister(W2);
      }
    }, 200);
    setTimeout(function () { clearInterval(handle); }, 10000);
  }

  // Expose for verification + Builder upload button
  (window as any).__MF_PDF_FORM_BADGE__ = BADGE;
  (window as any).MFPdfForm = {
    badge: BADGE,
    uploadAdminPdf: uploadAdminPdf,
    PdfFormBuilderRenderer: PdfFormBuilderRenderer,
    openDesigner: openDesigner
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILDER CANVAS LAUNCHER — inject "Open PDF Form Builder" button into
  // each .mf-canvas-field[data-type="PdfForm"] card. Click → fullscreen popup
  // with the v6 PdfFormBuilderRenderer in mode='edit', plus an Upload PDF
  // button in the popup header. On Save, write fields + pdfUrl back into
  // field.widgetProps and refresh the Properties panel.
  // ═══════════════════════════════════════════════════════════════════════════

  function findBuilderField(key: string): any {
    const B = (window as any).MegaFormBuilder;
    const fields = B && B.state && B.state.schema && B.state.schema.fields ? B.state.schema.fields : [];
    function walk(arr: any[]): any {
      for (const f of arr) {
        if (!f) continue;
        if (f.key === key) return f;
        if (f.type === 'Row' && f.columns) {
          for (const col of f.columns) {
            if (col && col.fields) {
              const found = walk(col.fields);
              if (found) return found;
            }
          }
        }
      }
      return null;
    }
    return walk(fields);
  }

  function openDesigner(field: any, onSave: (newProps: any) => void): void {
    const initialProps: any = field && field.widgetProps ? field.widgetProps : {};

    // Build modal overlay (full-screen, on top of Builder)
    const overlay = document.createElement('div');
    overlay.className = 'mfpdf-designer-overlay';
    overlay.setAttribute('data-mf-overlay', '1');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(15,23,42,0.78)',
      zIndex: '2147483647', display: 'flex', flexDirection: 'column',
      padding: '16px', boxSizing: 'border-box'
    });

    // Header bar
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', gap: '10px',
      background: '#1e293b', color: '#fff', padding: '10px 16px',
      borderRadius: '8px 8px 0 0', flexShrink: '0'
    });
    // [DesignerHeaderV2 v20260507-15] Header now includes Preview (toggle
     // mode=preview to see live result) + Fullscreen toggle (browser FS API).
    header.innerHTML = '' +
      '<span style="font-size:18px">📄</span>' +
      '<strong style="font-size:15px">PDF Form Builder</strong>' +
      '<span style="opacity:.6;font-size:12px;margin-left:6px">' + escAttr(BADGE) + '</span>' +
      '<span style="flex:1"></span>' +
      '<input type="file" accept="application/pdf,.pdf" class="mfpdf-upload-input" style="display:none">' +
      '<button type="button" class="mfpdf-btn mfpdf-upload-btn" style="background:#0ea5e9;color:#fff;border:0;padding:8px 14px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600">📤 Upload PDF</button>' +
      '<button type="button" class="mfpdf-btn mfpdf-preview-btn" title="Toggle preview — see how the filled form looks" style="background:#a855f7;color:#fff;border:0;padding:8px 14px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600">👁 Preview</button>' +
      '<button type="button" class="mfpdf-btn mfpdf-fullscreen-btn" title="Toggle full screen" style="background:#475569;color:#fff;border:0;padding:8px 12px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600">⛶ Full screen</button>' +
      '<span class="mfpdf-status" style="font-size:12px;opacity:.85;min-width:60px;text-align:right"></span>' +
      '<button type="button" class="mfpdf-btn mfpdf-save-btn" style="background:#22c55e;color:#fff;border:0;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600">💾 Save &amp; Close</button>' +
      '<button type="button" class="mfpdf-btn mfpdf-cancel-btn" style="background:#475569;color:#fff;border:0;padding:8px 12px;border-radius:4px;cursor:pointer;font-size:13px">✕ Cancel</button>';
    overlay.appendChild(header);

    // [ThreePaneLayout v20260507-12] Sejda-style 3-pane: left Style hints,
    // center PDF + drop zone, right Field Properties (existing). Adds a
    // body-level PDF dropzone (drag .pdf from filesystem → upload helper).
    const bodyWrap = document.createElement('div');
    Object.assign(bodyWrap.style, {
      flex: '1', display: 'flex', minHeight: '0', borderRadius: '0 0 8px 8px',
      overflow: 'hidden', background: '#fff'
    });
    overlay.appendChild(bodyWrap);

    // ── LEFT PANE: Style + tips ────────────────────────────────────────
    const leftPane = document.createElement('div');
    leftPane.className = 'mfpdf-style-sidebar';
    Object.assign(leftPane.style, {
      width: '210px', flexShrink: '0', background: '#f8fafc',
      borderRight: '1px solid #e2e8f0', overflow: 'auto', padding: '14px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '13px'
    });
    // [LeftStylePane v20260507-14] Sejda-style left panel with Text Style
    // (font size + 7 text color swatches) + Stroke (8 stroke color swatches).
    // Swatches act on the currently-selected field via renderer.patchField.
    // When no field is selected → swatches greyed out + hint shown.
    const TEXT_COLORS   = ['#000000','#1e293b','#475569','#64748b','#94a3b8','#ffffff','#dc2626'];
    const STROKE_COLORS = ['#dc2626','#f97316','#facc15','#22c55e','#06b6d4','#3b82f6','#a855f7','#ec4899','#000000','#475569','#94a3b8','#cbd5e1','#ffffff'];
    function swatchHtml(colors: string[], cls: string): string {
      return colors.map(function (c) {
        return '<button type="button" class="' + cls + '" data-color="' + c + '" title="' + c + '" style="width:22px;height:22px;border-radius:50%;border:1px solid #cbd5e1;background:' + c + ';cursor:pointer;padding:0"></button>';
      }).join('');
    }

    leftPane.innerHTML = ''
      + '<h4 style="margin:0 0 8px;font-size:13px;color:#0f172a;font-weight:700">Text Style</h4>'
      + '<div class="mfpdf-style-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:10px">'
      + '  <label style="display:block;font-size:11px;color:#475569;margin-bottom:4px;font-weight:600">Font size</label>'
      + '  <select class="mfpdf-style-fontsize" style="width:100%;padding:5px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:13px">'
      +     '<option value="">— default —</option>'
      +     '<option value="8">8</option><option value="10">10</option><option value="12" selected>12</option>'
      +     '<option value="14">14</option><option value="16">16</option><option value="18">18</option><option value="22">22</option><option value="28">28</option>'
      + '  </select>'
      + '  <label style="display:block;font-size:11px;color:#475569;margin:10px 0 6px;font-weight:600">Text color</label>'
      + '  <div class="mfpdf-style-textcolor-row" style="display:flex;flex-wrap:wrap;gap:5px">' + swatchHtml(TEXT_COLORS, 'mfpdf-text-color-swatch') + '</div>'
      + '</div>'
      + '<h4 style="margin:14px 0 8px;font-size:13px;color:#0f172a;font-weight:700">Stroke</h4>'
      + '<div class="mfpdf-style-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:10px">'
      + '  <label style="display:block;font-size:11px;color:#475569;margin:0 0 6px;font-weight:600">Border color</label>'
      // [SwatchAlignFix v20260507-15] flex-wrap (not 7-col grid) so 13 swatches
      // wrap evenly without one item spilling outside the parent card.
      + '  <div class="mfpdf-style-stroke-row" style="display:flex;flex-wrap:wrap;gap:5px">' + swatchHtml(STROKE_COLORS, 'mfpdf-stroke-color-swatch') + '</div>'
      + '</div>'
      + '<div class="mfpdf-style-emptyhint" style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:10px;font-size:11px;color:#854d0e;line-height:1.45">'
      + '  <strong style="display:block;margin-bottom:4px">Tip</strong>'
      + '  Pick a tool from the palette above the PDF, then click on the page to drop. Click any field to apply the swatches above. Drag a PDF file onto the canvas to replace.'
      + '</div>';
    (window as any).__MF_PDF_LEFT_STYLE_BADGE__ = 'LeftStylePane v20260507-14';
    bodyWrap.appendChild(leftPane);

    // ── CENTER: PDF host with drop zone ────────────────────────────────
    const body = document.createElement('div');
    body.className = 'mfpdf-body';
    Object.assign(body.style, {
      flex: '1', overflow: 'auto', padding: '12px', minWidth: '0',
      position: 'relative'
    });
    bodyWrap.appendChild(body);

    // Drop overlay (shown only while dragging a file over body)
    const dropZone = document.createElement('div');
    dropZone.className = 'mfpdf-dropzone';
    dropZone.style.cssText = 'position:absolute;inset:8px;border:3px dashed #2563eb;border-radius:10px;'
      + 'background:rgba(239,246,255,0.92);display:none;align-items:center;justify-content:center;'
      + 'z-index:100;color:#1e40af;font:600 16px/1.4 "Segoe UI",system-ui,sans-serif;text-align:center;'
      + 'pointer-events:none';
    dropZone.innerHTML = '<div><div style="font-size:42px">📥</div><div>Drop PDF here to upload</div></div>';
    body.appendChild(dropZone);

    // ── RIGHT PANE: Field properties (existing) ────────────────────────
    const sidebar = document.createElement('div');
    sidebar.className = 'mfpdf-props-sidebar';
    Object.assign(sidebar.style, {
      width: '280px', flexShrink: '0', background: '#f8fafc',
      borderLeft: '1px solid #e2e8f0', overflow: 'auto', padding: '14px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '13px'
    });
    sidebar.innerHTML = '<div class="mfpdf-props-empty" style="color:#64748b;text-align:center;margin-top:40px"><i style="font-size:32px;opacity:.3">☰</i><p style="margin:10px 0 0;font-size:12px">Click a field on the PDF to edit its name, label, and properties.</p></div>';
    bodyWrap.appendChild(sidebar);

    document.body.appendChild(overlay);

    // Mount PdfFormBuilderRenderer in mode=edit
    const renderer = new PdfFormBuilderRenderer(body, {
      pdfUrl: initialProps.pdfUrl || undefined,
      pdfBase64: initialProps.pdfBase64 || undefined,
      fields: initialProps.fields || [],
      mode: 'edit',
      systemFont: initialProps.systemFont || undefined,
      defaultZoom: initialProps.defaultZoom || 1.0,
      showToolbar: true,
      showGrid: true,
      snapEnabled: !!initialProps.snapEnabled,
      gridSize: initialProps.gridSize || 8,
      cssClass: initialProps.cssClass || '',
      emptyMessage: 'Click 📤 Upload PDF above to load a PDF, then drag fields from the palette.'
    });
    renderer.mount();

    // [FieldPropsSidebar v20260507-14] Track currently-selected field id so
    // the LEFT pane swatches know which field to patch on click. Updated
    // on every showFieldInSidebar (= every pfb:select / body-click fallback).
    let _selectedFieldId: string | null = null;

    function showFieldInSidebar(f: any): void {
      if (!f) {
        sidebar.innerHTML = '<div class="mfpdf-props-empty" style="color:#64748b;text-align:center;margin-top:40px"><p style="margin:10px 0 0;font-size:12px">No field selected.</p></div>';
        _selectedFieldId = null;
        return;
      }
      sidebar.innerHTML = renderFieldPropsForm(f);
      const r: PdfFormBuilderRenderer = (overlay as any).__renderer || renderer;
      wireFieldPropsForm(sidebar, f, r);
      _selectedFieldId = String(f.id || '');
      (window as any).__MF_PDF_FIELD_PROPS_BADGE__ = 'FieldPropsSidebar v20260507-14';
    }

    // ── Left-pane swatch + font-size wiring ────────────────────────────
    function getSelectedField(): any | null {
      if (!_selectedFieldId) return null;
      const r: PdfFormBuilderRenderer = (overlay as any).__renderer || renderer;
      return r.getFields().find((f: any) => f.id === _selectedFieldId) || null;
    }
    function patchSelected(patch: any): boolean {
      const id = _selectedFieldId; if (!id) return false;
      const r: PdfFormBuilderRenderer = (overlay as any).__renderer || renderer;
      r.patchField(id, patch);
      return true;
    }
    const fontSel = leftPane.querySelector('.mfpdf-style-fontsize') as HTMLSelectElement | null;
    if (fontSel) {
      fontSel.addEventListener('change', () => {
        const v = parseInt(fontSel.value || '0', 10);
        if (!v) return;
        if (!patchSelected({ fontSize: v })) {
          alert('Click a field on the PDF first, then change its font size.');
        }
      });
    }
    leftPane.querySelectorAll<HTMLButtonElement>('.mfpdf-text-color-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        const c = sw.getAttribute('data-color') || '';
        if (!patchSelected({ textColor: c })) {
          alert('Click a field on the PDF first, then pick a text color.');
        }
      });
    });
    leftPane.querySelectorAll<HTMLButtonElement>('.mfpdf-stroke-color-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        const c = sw.getAttribute('data-color') || '';
        if (!patchSelected({ borderColor: c })) {
          alert('Click a field on the PDF first, then pick a border color.');
        }
      });
    });
    const onSelectHandler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {};
      showFieldInSidebar(detail.field);
    };
    document.addEventListener('pfb:select', onSelectHandler);
    (overlay as any).__pfbSelectHandler = onSelectHandler;

    // Fallback: any click inside body that lands on a .pfb-field element
    // resolves the field id from data-field-id and shows the sidebar form.
    // Captures both mousedown-without-drag AND mouseup-after-tiny-drag cases.
    function bodyClickFallback(ev: Event): void {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const fieldEl = target.closest('.pfb-field') as HTMLElement | null;
      if (!fieldEl) return;
      const id = fieldEl.dataset.fieldId || (fieldEl as any).dataset['fieldId'];
      if (!id) return;
      const r: PdfFormBuilderRenderer = (overlay as any).__renderer || renderer;
      const f = r.getFields().find((x: any) => x.id === id);
      if (f) showFieldInSidebar(f);
    }
    body.addEventListener('mouseup', bodyClickFallback, true);
    body.addEventListener('click', bodyClickFallback, true);
    (overlay as any).__bodyClickFallback = bodyClickFallback;

    // Wire Upload PDF button — uploads to admin endpoint, then re-mounts renderer
    const uploadInput = header.querySelector('.mfpdf-upload-input') as HTMLInputElement;
    const uploadBtn   = header.querySelector('.mfpdf-upload-btn') as HTMLButtonElement;
    const statusEl    = header.querySelector('.mfpdf-status') as HTMLElement;
    let currentPdfUrl: string = initialProps.pdfUrl || '';

    // [PdfDropZone v20260507-12] One helper for both the Upload button +
    // body-level drag-drop. Re-mounts the renderer with the freshly uploaded
    // PDF URL and preserves any fields the admin already placed.
    async function ingestPdfFile(file: File): Promise<void> {
      if (!file) return;
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        alert('Please drop a PDF file (.pdf).'); return;
      }
      statusEl.textContent = 'Uploading…';
      statusEl.style.color = '#fbbf24';
      const result = await uploadAdminPdf(file);
      if (!result.ok || !result.url) {
        statusEl.textContent = 'Upload failed';
        statusEl.style.color = '#f87171';
        alert('Upload failed: ' + (result.error || 'unknown error'));
        return;
      }
      currentPdfUrl = result.url;
      statusEl.textContent = '✓ Uploaded';
      statusEl.style.color = '#86efac';
      const liveR: PdfFormBuilderRenderer = (overlay as any).__renderer || renderer;
      const keepFields = liveR.getFields();
      const keepFont = liveR.getSystemFont();
      liveR.destroy();
      const r2 = new PdfFormBuilderRenderer(body, {
        pdfUrl: currentPdfUrl,
        fields: keepFields,
        mode: 'edit',
        systemFont: keepFont,
        defaultZoom: initialProps.defaultZoom || 1.0,
        showToolbar: true,
        showGrid: true,
        snapEnabled: !!initialProps.snapEnabled,
        gridSize: initialProps.gridSize || 8
      });
      r2.mount();
      // Re-add the dropzone (renderer.destroy cleared host innerHTML)
      body.appendChild(dropZone);
      (overlay as any).__renderer = r2;
    }

    uploadBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files && uploadInput.files[0];
      if (file) await ingestPdfFile(file);
    });

    // Body-level drag-drop: show dropZone overlay while PDF dragged in,
    // call ingestPdfFile on drop. Stop event propagation so browser
    // doesn't navigate to the file.
    let dragDepth = 0;
    body.addEventListener('dragenter', (ev: DragEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      dragDepth++;
      dropZone.style.display = 'flex';
    });
    body.addEventListener('dragover',  (ev: DragEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
    });
    body.addEventListener('dragleave', (ev: DragEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dropZone.style.display = 'none';
    });
    body.addEventListener('drop',      async (ev: DragEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      dragDepth = 0;
      dropZone.style.display = 'none';
      const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (file) await ingestPdfFile(file);
    });

    // Avoid the default-was-navigate-to-file fallback if user misses dropZone.
    overlay.addEventListener('dragover', (ev) => ev.preventDefault());
    overlay.addEventListener('drop',     (ev) => ev.preventDefault());

    (overlay as any).__renderer = renderer;

    // [DesignerHeaderV2 v20260507-15] Preview button — toggle renderer mode
    // edit ↔ preview so admin sees the form as the end-user will. Uses the
    // existing renderer.setMode pathway (preserves fields, just re-renders).
    const previewBtn = header.querySelector('.mfpdf-preview-btn') as HTMLButtonElement;
    let _isPreview = false;
    previewBtn.addEventListener('click', () => {
      _isPreview = !_isPreview;
      const r: any = (overlay as any).__renderer || renderer;
      if (typeof r.setMode === 'function') {
        r.setMode(_isPreview ? 'fill' : 'edit');
      } else {
        // Fallback: re-mount renderer with new mode (older builds)
        const keep = r.getFields(); const font = r.getSystemFont();
        r.destroy();
        const r2 = new PdfFormBuilderRenderer(body, {
          pdfUrl: currentPdfUrl || initialProps.pdfUrl, fields: keep,
          mode: _isPreview ? 'fill' : 'edit', systemFont: font,
          defaultZoom: initialProps.defaultZoom || 1.0, showToolbar: true,
          showGrid: !_isPreview, snapEnabled: !!initialProps.snapEnabled,
          gridSize: initialProps.gridSize || 8
        });
        r2.mount();
        body.appendChild(dropZone);
        (overlay as any).__renderer = r2;
      }
      previewBtn.style.background = _isPreview ? '#16a34a' : '#a855f7';
      previewBtn.innerHTML = _isPreview ? '✏ Back to edit' : '👁 Preview';
    });

    // [DesignerHeaderV2 v20260507-15] Fullscreen toggle — uses browser
    // Fullscreen API on the overlay element.
    const fsBtn = header.querySelector('.mfpdf-fullscreen-btn') as HTMLButtonElement;
    fsBtn.addEventListener('click', () => {
      const docAny: any = document;
      const elAny: any = overlay;
      const isFs = docAny.fullscreenElement || docAny.webkitFullscreenElement || docAny.msFullscreenElement;
      if (isFs) {
        const exit = docAny.exitFullscreen || docAny.webkitExitFullscreen || docAny.msExitFullscreen;
        if (exit) exit.call(docAny);
        fsBtn.innerHTML = '⛶ Full screen';
      } else {
        const req = elAny.requestFullscreen || elAny.webkitRequestFullscreen || elAny.msRequestFullscreen;
        if (req) req.call(elAny);
        fsBtn.innerHTML = '⊠ Exit full screen';
      }
    });

    // Save & Close
    const saveBtn = header.querySelector('.mfpdf-save-btn') as HTMLButtonElement;
    saveBtn.addEventListener('click', () => {
      const r: PdfFormBuilderRenderer = (overlay as any).__renderer || renderer;
      const newProps = Object.assign({}, initialProps, {
        pdfUrl: currentPdfUrl || initialProps.pdfUrl || '',
        pdfBase64: '', // explicitly clear base64 once URL is set
        fields: r.getFields(),
        systemFont: r.getSystemFont() || initialProps.systemFont || ''
      });
      onSave(newProps);
      cleanup();
    });

    // Cancel
    const cancelBtn = header.querySelector('.mfpdf-cancel-btn') as HTMLButtonElement;
    cancelBtn.addEventListener('click', () => {
      if (confirm('Discard changes and close the designer?')) cleanup();
    });

    // ESC closes (with confirm)
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') { ev.preventDefault(); cancelBtn.click(); }
    }
    window.addEventListener('keydown', onKey);

    function cleanup(): void {
      window.removeEventListener('keydown', onKey);
      const handler = (overlay as any).__pfbSelectHandler;
      if (handler) document.removeEventListener('pfb:select', handler);
      try { ((overlay as any).__renderer || renderer).destroy(); } catch {}
      overlay.remove();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // [FieldPropsSidebar v20260506-08] Render + wire the field properties form
  // shown in the right sidebar of the PDF Form Builder popup. Lets admin set
  // friendly Name + Label + Required + kind-specific props (label content,
  // dropdown/radio options, radio group). Without this UI, drag-drop fields
  // had only auto-generated IDs (`fld_xxxxxx`) so submission viewer showed
  // raw IDs as column labels — the user complaint that triggered this fix.
  // ═══════════════════════════════════════════════════════════════════════════

  function renderFieldPropsForm(f: any): string {
    const kind = String(f.kind || 'text');
    const safeId = escAttr(f.id || '');
    const safeName = escAttr(f.name || '');
    const safeLabel = escAttr(f.label || '');
    const safePh = escAttr(f.placeholder || '');

    let html = ''
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:600">' + escAttr(kind) + '</span></div>'
      + '<label style="display:block;font-size:11px;color:#475569;margin:8px 0 4px;font-weight:600">Field name (data key)</label>'
      + '<input type="text" data-mfpdf-prop="name" value="' + safeName + '" placeholder="e.g. full_name" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:13px;font-family:monospace;box-sizing:border-box">'
      + '<div style="font-size:10px;color:#94a3b8;margin:4px 0 8px">Stored in submission as <code>' + safeName + '</code>. Falls back to <code>' + safeId + '</code> if blank.</div>'
      + '<label style="display:block;font-size:11px;color:#475569;margin:8px 0 4px;font-weight:600">Display label</label>'
      + '<input type="text" data-mfpdf-prop="label" value="' + safeLabel + '" placeholder="e.g. Full Name" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:13px;box-sizing:border-box">';

    if (kind === 'text' || kind === 'textarea' || kind === 'date' || kind === 'number') {
      html += '<label style="display:block;font-size:11px;color:#475569;margin:8px 0 4px;font-weight:600">Placeholder</label>'
        + '<input type="text" data-mfpdf-prop="placeholder" value="' + safePh + '" placeholder="Hint text…" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:13px;box-sizing:border-box">';
    }

    if (kind === 'label') {
      html += '<label style="display:block;font-size:11px;color:#475569;margin:8px 0 4px;font-weight:600">Static text content</label>'
        + '<textarea data-mfpdf-prop="content" rows="3" placeholder="Static label content…" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:13px;box-sizing:border-box;resize:vertical">' + escAttr(f.content || '') + '</textarea>';
    }

    if (kind === 'radio') {
      const safeGroup = escAttr(f.group || 'g1');
      const safeValue = escAttr(f.value || '');
      html += '<label style="display:block;font-size:11px;color:#475569;margin:8px 0 4px;font-weight:600">Radio group (shared name)</label>'
        + '<input type="text" data-mfpdf-prop="group" value="' + safeGroup + '" placeholder="e.g. gender" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:13px;font-family:monospace;box-sizing:border-box">'
        + '<label style="display:block;font-size:11px;color:#475569;margin:8px 0 4px;font-weight:600">Value when selected</label>'
        + '<input type="text" data-mfpdf-prop="value" value="' + safeValue + '" placeholder="e.g. male" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:13px;box-sizing:border-box">';
    }

    if (kind === 'dropdown') {
      const opts: any[] = Array.isArray(f.options) ? f.options : [];
      const optsText = opts.map(o => (o.label || '') + '|' + (o.value || '')).join('\n');
      html += '<label style="display:block;font-size:11px;color:#475569;margin:8px 0 4px;font-weight:600">Options (one per line, format: <code>Label|value</code>)</label>'
        + '<textarea data-mfpdf-prop="optionsRaw" rows="4" placeholder="Option 1|opt1\nOption 2|opt2" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;font-family:monospace;box-sizing:border-box;resize:vertical">' + escAttr(optsText) + '</textarea>';
    }

    html += '<label style="display:flex;align-items:center;gap:6px;margin:12px 0;font-size:13px;color:#334155;cursor:pointer">'
      + '<input type="checkbox" data-mfpdf-prop="required" ' + (f.required ? 'checked' : '') + '> Required'
      + '</label>';

    html += '<hr style="border:0;border-top:1px solid #e2e8f0;margin:14px 0">'
      + '<div style="font-size:10px;color:#94a3b8;margin-bottom:8px">Position: x=' + Math.round(f.x || 0) + ', y=' + Math.round(f.y || 0) + ', w=' + Math.round(f.width || 0) + ', h=' + Math.round(f.height || 0) + '</div>'
      + '<button type="button" data-mfpdf-prop="delete" style="width:100%;background:#dc2626;color:#fff;border:0;padding:8px 12px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600">🗑 Delete this field</button>';

    return html;
  }

  function wireFieldPropsForm(sidebar: HTMLElement, f: any, renderer: PdfFormBuilderRenderer): void {
    const id = String(f.id || '');
    if (!id) return;

    // Patch on every input change — live updates so user sees the result.
    const inputs = sidebar.querySelectorAll('[data-mfpdf-prop]');
    inputs.forEach(el => {
      const prop = (el as HTMLElement).getAttribute('data-mfpdf-prop') || '';
      const handler = () => {
        const patch: any = {};
        if (prop === 'required') {
          patch.required = (el as HTMLInputElement).checked;
        } else if (prop === 'optionsRaw') {
          // Parse "Label|value" lines into options[]
          const raw = (el as HTMLTextAreaElement).value || '';
          const opts = raw.split('\n').map(line => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            const i = trimmed.indexOf('|');
            if (i < 0) return { label: trimmed, value: trimmed };
            return { label: trimmed.substring(0, i).trim(), value: trimmed.substring(i + 1).trim() };
          }).filter(x => !!x);
          patch.options = opts;
        } else if (prop === 'delete') {
          // Handled separately as click below
          return;
        } else {
          patch[prop] = (el as HTMLInputElement).value;
        }
        renderer.patchField(id, patch);
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });

    const delBtn = sidebar.querySelector('[data-mfpdf-prop="delete"]') as HTMLButtonElement | null;
    if (delBtn) delBtn.addEventListener('click', () => {
      if (confirm('Delete this field?')) {
        renderer.deleteFieldPublic(id);
        sidebar.innerHTML = '<div class="mfpdf-props-empty" style="color:#64748b;text-align:center;margin-top:40px"><p style="margin:10px 0 0;font-size:12px">Field deleted. Click another field to edit it.</p></div>';
      }
    });
  }

  if (typeof document !== 'undefined') {
    (function injectBuilderLaunchers() {
      const WIDGET_TYPE = 'PdfForm';
      const BTN_CLASS   = 'mfpdf-card-designer-launcher';
      const INJECTED_FLAG = 'mfpdfLauncherInjected';

      function inject(card: HTMLElement) {
        if (!card || (card as any).dataset[INJECTED_FLAG] === '1') return;
        (card as any).dataset[INJECTED_FLAG] = '1';

        // [LauncherTopBar v20260507-14] Wrap launcher in a sticky top bar
        // inside the card so it sits ABOVE the placeholder (per request).
        // Bar also shows a small chip "PDF: <filename> · N fields" when a
        // PDF has been picked, giving admins instant feedback that the
        // widget already has content without opening the designer.
        const topBar = document.createElement('div');
        topBar.className = 'mfpdf-card-topbar';
        topBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;'
          + 'background:#f1f5f9;border-bottom:1px solid #e2e8f0;border-radius:6px 6px 0 0;'
          + 'margin:-8px -8px 8px';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = BTN_CLASS;
        btn.title = 'Open PDF Form Builder — upload a PDF and place form fields';
        btn.innerHTML = '📄 Open PDF Form Builder';
        btn.style.cssText = 'background:#0ea5e9;color:#fff;border:0;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;line-height:1.3';

        const stateChip = document.createElement('span');
        stateChip.className = 'mfpdf-card-state';
        stateChip.style.cssText = 'font-size:11px;color:#475569;font-weight:500';

        function refreshStateChip(): void {
          const key = card.getAttribute('data-key') || '';
          const field = findBuilderField(key);
          const wp = (field && field.widgetProps) || {};
          const url = String(wp.pdfUrl || '');
          const fields = Array.isArray(wp.fields) ? wp.fields : [];
          if (url) {
            const fname = url.split('/').pop() || 'pdf';
            stateChip.innerHTML = '<span style="color:#0f766e">📎 ' + escAttr(fname) + '</span>'
              + ' · <span style="color:#64748b">' + fields.length + ' field' + (fields.length === 1 ? '' : 's') + '</span>';
          } else {
            stateChip.innerHTML = '<span style="color:#94a3b8">No PDF uploaded yet — click the button to start →</span>';
          }
        }
        refreshStateChip();

        btn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          const key = card.getAttribute('data-key') || '';
          const field = findBuilderField(key);
          if (!field) {
            alert('Could not locate this PdfForm field in the schema.');
            return;
          }
          openDesigner(field, function (newProps) {
            field.widgetProps = newProps;
            const B = (window as any).MegaFormBuilder;
            if (B && B.state) B.state.isDirty = true;
            try {
              if (B && B.callModule) {
                B.callModule('properties', 'showProps', [field]);
              }
            } catch (err) {
              console.warn('[mfpdf-launcher] showProps threw:', err);
            }
            // Refresh the chip + try to refresh inline preview if any
            refreshStateChip();
          });
        });

        topBar.appendChild(btn);
        topBar.appendChild(stateChip);
        // Insert as the FIRST child of the card so it sits at the top.
        card.insertBefore(topBar, card.firstChild);
        (window as any).__MF_PDF_LAUNCHER_TOPBAR_BADGE__ = 'LauncherTopBar v20260507-14';
      }

      function scan() {
        const cards = document.querySelectorAll('.mf-canvas-field[data-type="' + WIDGET_TYPE + '"]');
        for (let i = 0; i < cards.length; i++) inject(cards[i] as HTMLElement);
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scan);
      } else {
        scan();
      }
      if (typeof MutationObserver !== 'undefined') {
        try {
          new MutationObserver(function () { scan(); }).observe(document.body, { childList: true, subtree: true });
        } catch (_) { /* ignore */ }
      }
    })();
  }
})();
