// /src/widgets/pdf-form-builder/renderer/PdfFormBuilderRenderer.ts — v6
//
// v6 changes:
//   - snapEnabled defaults to FALSE — fields drop at the EXACT click point.
//     Snap is opt-in via toolbar checkbox.
//   - Field's TOP-LEFT corner = exact click coordinates.
//     Default field size from PALETTE_DEFAULTS (no longer snapped to grid).
//   - System font picker in toolbar: font applied to all text-bearing fields.
//   - Refresh fields when font changes (calls bindOverlays again).

import type { AnyField, FieldKind, ImageState, PdfFormBuilderProps, SignatureState } from '../types';
import { PdfRenderer } from './PdfRenderer';
import { FieldOverlay } from './FieldOverlay';
import { FieldClipboard } from './FieldClipboard';

const VERSION = 'PdfFormBuilder v20260708-7';
const PDF_LIB_CDN = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';

declare global { interface Window { PDFLib?: any; } }

let pdfLibLoadingPromise: Promise<any> | null = null;
function loadPdfLib(): Promise<any> {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (pdfLibLoadingPromise) return pdfLibLoadingPromise;
  pdfLibLoadingPromise = new Promise<any>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDF_LIB_CDN;
    s.onload = () => window.PDFLib ? resolve(window.PDFLib) : reject(new Error('pdf-lib failed'));
    s.onerror = () => reject(new Error('pdf-lib script error'));
    document.head.appendChild(s);
  });
  return pdfLibLoadingPromise;
}

const DEFAULT_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const FONT_OPTIONS = [
  { label: 'System Default', value: DEFAULT_FONT },
  { label: 'Arial',          value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica',      value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Times New Roman',value: '"Times New Roman", Times, serif' },
  { label: 'Georgia',        value: 'Georgia, "Times New Roman", serif' },
  { label: 'Courier New',    value: '"Courier New", Courier, monospace' },
  { label: 'Verdana',        value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS',   value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: 'Tahoma',         value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Comic Sans MS',  value: '"Comic Sans MS", cursive' },
];

const PALETTE: { kind: FieldKind; label: string; icon: string; default: any }[] = [
  { kind: 'label',    label: 'Label',     icon: '𝗔', default: { width: 96, height: 24, fontSize: 12, content: 'Label' } },
  { kind: 'whiteout', label: 'Whiteout',  icon: '⬜', default: { width: 96, height: 24 } },
  { kind: 'text',     label: 'Text',      icon: '⌨', default: { width: 144, height: 24, fontSize: 12 } },
  { kind: 'textarea', label: 'Textarea',  icon: '☰', default: { width: 200, height: 64, fontSize: 12 } },
  { kind: 'checkbox', label: 'Checkbox',  icon: '☑', default: { width: 16, height: 16 } },
  { kind: 'radio',    label: 'Radio',     icon: '◉', default: { width: 16, height: 16, group: 'g1' } },
  { kind: 'dropdown', label: 'Dropdown',  icon: '▾', default: { width: 144, height: 24, fontSize: 12, options: [{ label: 'Option 1', value: 'opt1' }] } },
  { kind: 'date',     label: 'Date',      icon: '📅', default: { width: 120, height: 24 } },
  { kind: 'number',   label: 'Number',    icon: '#',  default: { width: 100, height: 24 } },
  { kind: 'signature',label: 'Signature', icon: '✒', default: { width: 200, height: 48 } },
  { kind: 'image',    label: 'Image',     icon: '🖼', default: { width: 160, height: 120 } },
];

function snapTo(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

export class PdfFormBuilderRenderer {
  private host: HTMLElement;
  private props: PdfFormBuilderProps;
  private pdfRenderer: PdfRenderer | null = null;
  private overlays = new Map<number, FieldOverlay>();

  private fields: AnyField[];
  private fillValues: Record<string, any> = {};
  private sigStates: Record<string, SignatureState> = {};
  private imgStates: Record<string, ImageState> = {};
  private pdfBytes: Uint8Array | null = null;

  private zoom: number;
  private mode: 'edit' | 'preview' | 'fill';
  private rootEl: HTMLElement | null = null;
  private viewportEl: HTMLElement | null = null;
  private pendingPaletteKind: FieldKind | null = null;

  private showGrid = true;
  private snapEnabled = false;        // ★ v6: default OFF
  private gridSize = 8;
  private systemFont: string;          // ★ v6
  // [FieldClipboard v20260708-1] selection tracked here so copy/paste knows
  // which field is active; clipboard listeners attach in mount().
  private selectedId: string | null = null;
  private clipboard: FieldClipboard | null = null;

  constructor(host: HTMLElement, props: PdfFormBuilderProps) {
    this.host = host;
    this.props = props;
    this.fields = JSON.parse(JSON.stringify(props.fields || []));
    this.zoom = props.defaultZoom || 1.0;
    this.mode = props.mode || 'edit';
    this.showGrid = props.showGrid !== false;
    // v6: snap default OFF unless explicitly enabled
    this.snapEnabled = props.snapEnabled === true;
    this.gridSize = props.gridSize || 8;
    this.systemFont = props.systemFont || DEFAULT_FONT;
  }

  public async mount(): Promise<void> {
    this.host.innerHTML = '';
    if (!document.querySelector('meta[name="viewport"]')) {
      const m = document.createElement('meta');
      m.name = 'viewport';
      m.content = 'width=device-width, initial-scale=1, user-scalable=yes';
      document.head.appendChild(m);
    }
    this.rootEl = document.createElement('div');
    this.rootEl.className = 'pfb-root pfb-' + this.mode + ' ' + (this.props.cssClass || '');
    this.rootEl.dataset.version = VERSION;
    this.host.appendChild(this.rootEl);

    if (this.shouldShowToolbar()) this.renderToolbar();
    if (this.mode === 'edit') this.renderPalette();

    // [FieldClipboard v20260708-1] Ctrl+C / Ctrl+V / Ctrl+D on placed fields.
    // Attached in every mode (mode can switch at runtime); acts in edit only.
    if (!this.clipboard) {
      this.clipboard = new FieldClipboard(this);
      this.clipboard.attach();
    }

    this.viewportEl = document.createElement('div');
    this.viewportEl.className = 'pfb-viewport';
    this.rootEl.appendChild(this.viewportEl);

    // Hand-drag pan + Ctrl+wheel zoom — works in all modes (edit/preview/fill).
    // Pan: hold Space (or middle-mouse) and drag the viewport. Skipped when
    // a palette tool is selected or when clicking inside an editable field.
    this.attachViewportPanZoom(this.viewportEl);

    if (!this.props.pdfUrl && !this.props.pdfBase64) {
      this.viewportEl.innerHTML = '<div class="pfb-empty">' + (this.props.emptyMessage || 'No PDF source provided.') + '</div>';
      return;
    }

    if (this.props.pdfBase64) {
      this.pdfBytes = this.base64ToUint8(this.props.pdfBase64);
    } else if (this.props.pdfUrl) {
      try {
        const resp = await fetch(this.props.pdfUrl);
        this.pdfBytes = new Uint8Array(await resp.arrayBuffer());
      } catch (e) {
        console.warn('Could not pre-fetch PDF bytes', e);
      }
    }

    const source = this.pdfBytes ? { data: this.pdfBytes.slice() } : { url: this.props.pdfUrl };

    this.pdfRenderer = new PdfRenderer({
      source,
      containerEl: this.viewportEl,
      zoom: this.zoom,
      showGrid: this.showGrid && this.mode === 'edit',
      gridSize: this.gridSize,
      onPagesReady: () => this.bindOverlays(),
      onError: (err) => { this.viewportEl!.innerHTML = '<div class="pfb-error">PDF load error: ' + err.message + '</div>'; },
    });
    await this.pdfRenderer.load();
    await this.pdfRenderer.render();
  }

  private shouldShowToolbar(): boolean {
    if (typeof this.props.showToolbar === 'boolean') return this.props.showToolbar;
    return true;
  }

  private renderToolbar(): void {
    const bar = document.createElement('div');
    bar.className = 'pfb-toolbar pfb-toolbar-' + this.mode;
    const isEdit = this.mode === 'edit';
    const fontOpts = FONT_OPTIONS.map(o =>
      '<option value=' + JSON.stringify(o.value) + (o.value === this.systemFont ? ' selected' : '') + '>' + o.label + '</option>'
    ).join('');

    // [NoPostback v20260506-10] Every <button> needs type="button" — without
    // it, browsers default to type="submit" inside a <form>, so toolbar
    // clicks (zoom +/−, Fit, Download PDF, etc.) submit the form and cause
    // a postback / lost state. Required for runtime fill mode where the PDF
    // widget renders inside the host form.
    const editOnlyHtml = isEdit
      ? '  <select class="pfb-font-select" title="System font for all text fields">' + fontOpts + '</select>'
      + '  <label class="pfb-grid-toggle"><input type="checkbox" class="pfb-grid-toggle-in" ' + (this.showGrid ? 'checked' : '') + '> Grid</label>'
      + '  <label class="pfb-grid-toggle"><input type="checkbox" class="pfb-snap-toggle-in" ' + (this.snapEnabled ? 'checked' : '') + '> Snap</label>'
      + '  <input type="number" class="pfb-grid-size" min="2" max="50" step="1" value="' + this.gridSize + '" title="Grid size">'
      + '  <select class="pfb-btn pfb-mode-sel" title="Switch view mode" style="padding-right:24px">'
      + '    <option value="edit"' + (this.mode === 'edit' ? ' selected' : '') + '>Edit</option>'
      + '    <option value="preview"' + (this.mode === 'preview' ? ' selected' : '') + '>Preview</option>'
      + '    <option value="fill"' + (this.mode === 'fill' ? ' selected' : '') + '>Fill</option>'
      + '  </select>'
      + '  <button type="button" class="pfb-btn pfb-export-json" title="Export field layout as JSON">JSON</button>'
      : '';

    // ── Always-on controls (zoom + download) — visible to end-users in fill mode too ──
    bar.innerHTML = ''
      + '<button type="button" class="pfb-mobile-toggle">⚙ Tools</button>'
      + '<span style="flex:1"></span>'
      + '<div class="pfb-toolbar-extra">'
      + editOnlyHtml
      + '  <button type="button" class="pfb-btn pfb-zoom-out" title="Zoom out (Ctrl+−)">−</button>'
      + '  <span class="pfb-zoom-label">' + Math.round(this.zoom * 100) + '%</span>'
      + '  <button type="button" class="pfb-btn pfb-zoom-in" title="Zoom in (Ctrl++)">+</button>'
      + '  <button type="button" class="pfb-btn pfb-zoom-fit" title="Fit page width">Fit</button>'
      + '  <button type="button" class="pfb-btn pfb-btn-success pfb-export-pdf" title="Download a copy of the filled PDF">📥 Download PDF</button>'
      + '</div>';
    this.rootEl!.appendChild(bar);

    const mobileToggle = bar.querySelector('.pfb-mobile-toggle') as HTMLButtonElement;
    const extra = bar.querySelector('.pfb-toolbar-extra') as HTMLElement;
    mobileToggle.addEventListener('click', () => extra.classList.toggle('open'));

    // Edit-only event wiring — guard each lookup so missing controls don't blow up
    if (isEdit) {
      const fontSel = bar.querySelector('.pfb-font-select') as HTMLSelectElement | null;
      const gridIn  = bar.querySelector('.pfb-grid-toggle-in') as HTMLInputElement | null;
      const snapIn  = bar.querySelector('.pfb-snap-toggle-in') as HTMLInputElement | null;
      const sizeIn  = bar.querySelector('.pfb-grid-size') as HTMLInputElement | null;
      const modeSel = bar.querySelector('.pfb-mode-sel') as HTMLSelectElement | null;
      const jsonBtn = bar.querySelector('.pfb-export-json') as HTMLButtonElement | null;

      if (fontSel) fontSel.addEventListener('change', () => {
        this.systemFont = fontSel.value;
        this.redrawAllFields();
      });
      if (gridIn) gridIn.addEventListener('change', () => {
        this.showGrid = gridIn.checked;
        if (this.pdfRenderer) this.pdfRenderer.setGridVisible(this.showGrid && this.mode === 'edit');
      });
      if (snapIn) snapIn.addEventListener('change', () => { this.snapEnabled = snapIn.checked; });
      if (sizeIn) sizeIn.addEventListener('change', () => {
        this.gridSize = Math.max(2, Math.min(50, +sizeIn.value || 8));
        if (this.pdfRenderer) this.pdfRenderer.setGridSize(this.gridSize);
      });
      if (modeSel) modeSel.addEventListener('change', () => {
        this.mode = modeSel.value as any;
        this.rootEl!.classList.remove('pfb-edit', 'pfb-fill', 'pfb-preview');
        this.rootEl!.classList.add('pfb-' + this.mode);
        if (this.pdfRenderer) this.pdfRenderer.setGridVisible(this.showGrid && this.mode === 'edit');
        this.redrawAllFields();
      });
      if (jsonBtn) jsonBtn.addEventListener('click', () => this.exportJson());
    }

    // Always-on
    bar.querySelector('.pfb-zoom-out')!.addEventListener('click', () => this.setZoom(Math.max(0.4, +(this.zoom - 0.1).toFixed(2))));
    bar.querySelector('.pfb-zoom-in')!.addEventListener('click', () => this.setZoom(Math.min(3.0, +(this.zoom + 0.1).toFixed(2))));
    bar.querySelector('.pfb-zoom-fit')!.addEventListener('click', () => this.fitToWidth());
    bar.querySelector('.pfb-export-pdf')!.addEventListener('click', () => this.exportFilledPdf());
  }

  private renderPalette(): void {
    const pal = document.createElement('div');
    pal.className = 'pfb-palette';
    PALETTE.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'pfb-tool';
      btn.dataset.kind = p.kind;
      btn.innerHTML = '<span style="font-size:14px">' + p.icon + '</span><span>' + p.label + '</span>';
      btn.addEventListener('click', () => {
        this.pendingPaletteKind = this.pendingPaletteKind === p.kind ? null : p.kind;
        Array.from(pal.querySelectorAll('.pfb-tool')).forEach(b => b.classList.remove('active'));
        if (this.pendingPaletteKind) btn.classList.add('active');
        if (this.viewportEl) this.viewportEl.style.cursor = this.pendingPaletteKind ? 'crosshair' : '';
        // [CursorGhost v20260507-12] Attach a small floating preview that
        // follows the mouse pointer so admins know exactly what they are
        // about to drop on the PDF. Detaches automatically on click-to-drop
        // (handled in the overlay click handler that nulls pendingPaletteKind)
        // OR when admin clicks the same palette button again to cancel.
        if (this.pendingPaletteKind) this.attachCursorGhost(p);
        else this.detachCursorGhost();
      });
      pal.appendChild(btn);
    });
    this.rootEl!.appendChild(pal);
  }

  private bindOverlays(): void {
    if (!this.pdfRenderer) return;
    this.overlays.clear();
    this.pdfRenderer.pageInfos.forEach(pi => {
      const overlay = this.pdfRenderer!.getOverlay(pi.pageNumber);
      if (!overlay) return;
      const fo = new FieldOverlay(overlay, pi.cssScale, {
        getMode: () => this.mode,
        getFillValue: (id) => this.fillValues[id],
        getSignatureState: (id) => this.sigStates[id],
        getImageState: (id) => this.imgStates[id],
        getSnapEnabled: () => this.snapEnabled,
        getGridSize: () => this.gridSize,
        getSystemFont: () => this.systemFont,    // ★ v6
        onSelect: (id) => this.selectField(id),
        onChange: (id, patch) => this.patchField(id, patch),
        onDelete: (id) => this.deleteField(id),
        onValueChange: (id, v) => {
          this.fillValues[id] = v;
          this.persistFillValues();
          // [PdfRequiredHighlight v20260507-17] Clear the red invalid ring as
          // soon as the user starts typing in a previously-flagged field.
          const el = document.querySelector('[data-field-id="' + id + '"]');
          if (el) el.classList.remove('pfb-field-invalid');
        },
        onSignatureChange: (id, sig) => {
          if (sig) this.sigStates[id] = sig; else delete this.sigStates[id];
          this.refreshField(id);
        },
        onImageChange: (id, im) => {
          if (im) this.imgStates[id] = im; else delete this.imgStates[id];
          this.refreshField(id);
        },
      });
      this.overlays.set(pi.pageNumber, fo);

      if (this.mode === 'edit') {
        overlay.addEventListener('click', (ev) => {
          if (!this.pendingPaletteKind) {
            if ((ev.target as HTMLElement) === overlay) this.deselectAll();
            return;
          }
          if ((ev.target as HTMLElement) !== overlay) return;
          const rect = overlay.getBoundingClientRect();
          const xPx = ev.clientX - rect.left;
          const yPx = ev.clientY - rect.top;
          const scale = pi.cssScale;
          const def = PALETTE.find(p => p.kind === this.pendingPaletteKind)!;
          // ★ v6: TOP-LEFT corner of field = EXACT click point.
          // Snap is opt-in; default OFF.
          let x = xPx / scale;
          let y = yPx / scale;
          if (this.snapEnabled && !ev.altKey) {
            x = snapTo(x, this.gridSize);
            y = snapTo(y, this.gridSize);
          }
          // [AutoNameField v20260507-15] Auto-assign a friendly name + label
          // counted by kind (text_1, text_2, checkbox_1, ...) so admin doesn't
          // have to type one in the right pane every time. Falls back to the
          // raw id for the data key if admin clears the name.
          const kind = this.pendingPaletteKind;
          const seq = this.fields.filter(f => f && f.kind === kind).length + 1;
          const autoName  = String(kind) + '_' + seq;
          const autoLabel = String(kind).charAt(0).toUpperCase() + String(kind).slice(1) + ' ' + seq;
          const newField: AnyField = Object.assign({
            id: 'fld_' + Math.random().toString(36).slice(2, 10),
            kind: kind,
            page: pi.pageNumber,
            x, y,
            width: 100, height: 24,
            name:  autoName,
            label: autoLabel
          }, def.default) as AnyField;
          (window as any).__MF_PDF_AUTONAME_BADGE__ = 'AutoNameField v20260507-15';
          // Don't snap dimensions — keep palette default sizes pixel-perfect
          this.fields.push(newField);
          fo.renderField(newField);
          this.pendingPaletteKind = null;
          if (this.viewportEl) this.viewportEl.style.cursor = '';
          Array.from(this.rootEl!.querySelectorAll('.pfb-tool')).forEach(b => (b as HTMLElement).classList.remove('active'));
          this.detachCursorGhost();
          // Auto-select the newly dropped field so the right sidebar opens.
          this.selectField(newField.id);
        });
      }
    });
    this.fields.forEach(f => {
      const fo = this.overlays.get(f.page);
      if (fo) fo.renderField(f);
    });
  }

  private refreshField(id: string): void {
    const f = this.fields.find(x => x.id === id);
    if (!f) return;
    const oldEl = document.querySelector('[data-field-id="' + id + '"]');
    if (oldEl) oldEl.remove();
    const fo = this.overlays.get(f.page);
    if (fo) fo.renderField(f);
  }

  private deselectAll(): void {
    this.selectedId = null;
    this.overlays.forEach(fo => fo.select(null));
  }

  /**
   * [PatchFieldPublic v20260506-08] Made public so the field properties
   * sidebar in the MegaForm widget adapter can patch field metadata
   * (name/label/required/options/etc.) and re-render in place. Original
   * private patchField() (no re-render) is preserved as the geometry-only
   * path used by drag/resize via FieldOverlay → onChange.
   */
  public patchField(id: string, patch: Partial<AnyField>): void {
    const idx = this.fields.findIndex(f => f.id === id);
    if (idx < 0) return;
    this.fields[idx] = Object.assign({}, this.fields[idx], patch);
    // Re-render the affected field so the new content (placeholder/label
    // text, dropdown options, etc.) shows immediately.
    this.refreshField(id);
  }

  private deleteField(id: string): void {
    this.fields = this.fields.filter(f => f.id !== id);
    delete this.sigStates[id]; delete this.imgStates[id]; delete this.fillValues[id];
    this.overlays.forEach(fo => fo.removeField(id));
    if (this.selectedId === id) this.selectedId = null;
  }

  /** Public delete (used by adapter sidebar Delete button). */
  public deleteFieldPublic(id: string): void {
    this.deleteField(id);
  }

  private selectField(id: string): void {
    this.selectedId = id;
    // Pass fireCallback=false so propagating the selection across overlays
    // doesn't re-enter onSelect → infinite loop.
    this.overlays.forEach(fo => fo.select(id, false));
    document.dispatchEvent(new CustomEvent('pfb:select', { detail: { id, field: this.fields.find(f => f.id === id) } }));
  }

  private redrawAllFields(): void {
    this.overlays.forEach(fo => fo.clear());
    this.fields.forEach(f => {
      const fo = this.overlays.get(f.page);
      if (fo) fo.renderField(f);
    });
  }

  public async setZoom(z: number): Promise<void> {
    this.zoom = z;
    const lbl = this.rootEl!.querySelector('.pfb-zoom-label');
    if (lbl) lbl.textContent = Math.round(z * 100) + '%';
    if (this.pdfRenderer) {
      await this.pdfRenderer.setZoom(z);
      this.bindOverlays();
    }
  }

  private fitToWidth(): void {
    if (!this.pdfRenderer || !this.viewportEl) return;
    const first = this.pdfRenderer.pageInfos[0];
    if (!first) return;
    const targetW = this.viewportEl.clientWidth - 24;
    const z = targetW / first.width;
    this.setZoom(Math.max(0.4, Math.min(3, +z.toFixed(2))));
  }

  private exportJson(): void {
    const payload = { fields: this.fields, font: this.systemFont, version: 6, generatedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pdf-form-fields.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 200);
  }

  /**
   * Build the filled PDF bytes (no download).
   * Returns null if the PDF source isn't loaded yet.
   * Used by both the toolbar Download button and the auto-upload-on-submit
   * flow in the MegaForm widget adapter.
   */
  public async generateFilledPdfBytes(): Promise<Uint8Array | null> {
    if (!this.pdfBytes) return null;
    const PDFLib = await loadPdfLib();
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdfDoc = await PDFDocument.load(this.pdfBytes.slice());
    const family = (this.systemFont || '').toLowerCase();
    let fontKey = StandardFonts.Helvetica;
    if (family.includes('times')) fontKey = StandardFonts.TimesRoman;
    else if (family.includes('courier')) fontKey = StandardFonts.Courier;
    const helv = await pdfDoc.embedFont(fontKey);
    const pages = pdfDoc.getPages();
    await this._drawFieldsOntoPages(pages, helv, rgb, pdfDoc);
    return await pdfDoc.save();
  }

  /** Export filled PDF — picks pdf-lib StandardFont closest to the chosen system font. */
  public async exportFilledPdf(): Promise<void> {
    if (!this.pdfBytes) { alert('PDF source not available for export.'); return; }
    const btn = this.rootEl!.querySelector('.pfb-export-pdf') as HTMLButtonElement;
    let oldText = '';
    if (btn) { oldText = btn.textContent || ''; btn.disabled = true; btn.textContent = '⏳ Generating...'; }
    try {
      const out = await this.generateFilledPdfBytes();
      if (!out) { alert('PDF source not available.'); return; }
      const blob = new Blob([out], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'filled-form.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 500);
    } catch (e: any) {
      console.error('exportFilledPdf error', e);
      alert('Export failed: ' + (e.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldText; }
    }
  }

  /** Draw all fields onto the pdf-lib pages. Internal helper. */
  private async _drawFieldsOntoPages(pages: any[], helv: any, rgb: any, pdfDoc: any): Promise<void> {
      for (const f of this.fields) {
        const page = pages[f.page - 1];
        if (!page) continue;
        const { height: ph } = page.getSize();
        const pdfX = f.x;
        const pdfYBottom = ph - f.y - f.height;
        const v = this.fillValues[f.id];
        switch (f.kind) {
          case 'whiteout':
            page.drawRectangle({ x: pdfX, y: pdfYBottom, width: f.width, height: f.height, color: rgb(1, 1, 1) });
            break;
          case 'label':
            if ((f as any).content) {
              page.drawText(String((f as any).content), {
                x: pdfX + 2, y: pdfYBottom + (f.height - (f.fontSize || 12)) / 2,
                size: f.fontSize || 12, font: helv, color: rgb(0, 0, 0),
              });
            }
            break;
          case 'text': case 'number': case 'date':
            if (v) {
              page.drawText(String(v), {
                x: pdfX + 2, y: pdfYBottom + (f.height - (f.fontSize || 12)) / 2,
                size: f.fontSize || 12, font: helv, color: rgb(0, 0, 0), maxWidth: f.width - 4,
              });
            }
            break;
          case 'textarea':
            if (v) {
              const lines = String(v).split('\n');
              const lh = (f.fontSize || 12) * 1.2;
              lines.forEach((ln, i) => {
                page.drawText(ln, {
                  x: pdfX + 2, y: pdfYBottom + f.height - lh * (i + 1),
                  size: f.fontSize || 12, font: helv, color: rgb(0, 0, 0), maxWidth: f.width - 4,
                });
              });
            }
            break;
          case 'checkbox':
            page.drawRectangle({ x: pdfX, y: pdfYBottom, width: f.width, height: f.height, borderColor: rgb(0, 0, 0), borderWidth: 0.6 });
            if (v) {
              page.drawLine({ start: { x: pdfX + 2, y: pdfYBottom + 2 }, end: { x: pdfX + f.width - 2, y: pdfYBottom + f.height - 2 }, thickness: 1.5, color: rgb(0, 0, 0) });
              page.drawLine({ start: { x: pdfX + f.width - 2, y: pdfYBottom + 2 }, end: { x: pdfX + 2, y: pdfYBottom + f.height - 2 }, thickness: 1.5, color: rgb(0, 0, 0) });
            }
            break;
          case 'radio':
            page.drawCircle({ x: pdfX + f.width / 2, y: pdfYBottom + f.height / 2, size: Math.min(f.width, f.height) / 2 - 1, borderColor: rgb(0, 0, 0), borderWidth: 0.6 });
            if (v && v === (f as any).value) {
              page.drawCircle({ x: pdfX + f.width / 2, y: pdfYBottom + f.height / 2, size: Math.min(f.width, f.height) / 4, color: rgb(0, 0, 0) });
            }
            break;
          case 'dropdown':
            if (v) {
              const opt = ((f as any).options || []).find((o: any) => o.value === v);
              const txt = opt ? opt.label : v;
              page.drawText(String(txt), {
                x: pdfX + 2, y: pdfYBottom + (f.height - (f.fontSize || 12)) / 2,
                size: f.fontSize || 12, font: helv, color: rgb(0, 0, 0),
              });
            }
            break;
          case 'signature':
          case 'image': {
            const obj = f.kind === 'signature' ? this.sigStates[f.id] : this.imgStates[f.id];
            if (obj && obj.dataUrl) {
              const isJpeg = (f.kind === 'image' && (obj as ImageState).mimeType === 'image/jpeg')
                          || obj.dataUrl.startsWith('data:image/jpeg');
              const bytes = this.base64ToUint8(obj.dataUrl.split(',')[1]);
              const pdfImg = isJpeg ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
              const aspect = obj.naturalW / obj.naturalH;
              const fieldAspect = f.width / f.height;
              let baseW: number, baseH: number;
              if (aspect > fieldAspect) { baseW = f.width; baseH = baseW / aspect; }
              else { baseH = f.height; baseW = baseH * aspect; }
              const sw = baseW * (obj.scale || 1);
              const sh = baseH * (obj.scale || 1);
              const sx = pdfX + (obj.offsetX || 0);
              const syTopUI = f.y + (obj.offsetY || 0);
              const syBot = ph - syTopUI - sh;
              page.drawImage(pdfImg, { x: sx, y: syBot, width: sw, height: sh });
            }
            break;
          }
        }
      }
  }

  private persistFillValues(): void {
    if (this.props.outputFieldKey && (window as any).MegaForm && (window as any).MegaForm.setFieldValue) {
      try {
        const payload = {
          values: this.fillValues,
          signatures: this.sigStates,
          images: this.imgStates,
          font: this.systemFont,
        };
        (window as any).MegaForm.setFieldValue(this.props.outputFieldKey, JSON.stringify(payload));
      } catch {}
    }
  }

  private base64ToUint8(b64: string): Uint8Array {
    const clean = b64.replace(/^data:.*;base64,/, '');
    const bin = atob(clean);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  /**
   * Hand-drag pan + Ctrl+wheel zoom on the viewport.
   *
   * Pan triggers:
   *   - Hold Space and drag with left mouse (Sejda/Photoshop convention)
   *   - OR middle mouse button drag
   *   - OR right mouse button drag (no context menu while panning)
   *   Skipped when a palette tool is armed (would interfere with click-to-place)
   *   or when the click target is an editable field input.
   *
   * Wheel zoom triggers:
   *   - Ctrl + wheel up/down → zoom in/out by 0.1
   *   - Plain wheel keeps native scroll behaviour
   */
  private attachViewportPanZoom(vp: HTMLElement): void {
    let spaceDown = false;
    let panning = false;
    let startX = 0, startY = 0, startScrollX = 0, startScrollY = 0;
    let prevCursor = '';

    const isEditableTarget = (t: EventTarget | null): boolean => {
      if (!t || !(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return true;
      if (t.isContentEditable) return true;
      // Resize handle on a field
      if (t.classList && t.classList.contains('pfb-resize')) return true;
      return false;
    };

    // Space-key tracking — only when viewport is hovered/focused
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.code !== 'Space') return;
      if (isEditableTarget(document.activeElement)) return;
      if (!spaceDown) {
        spaceDown = true;
        vp.style.cursor = 'grab';
      }
      ev.preventDefault();
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.code !== 'Space') return;
      spaceDown = false;
      if (!panning) vp.style.cursor = prevCursor || '';
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Mouse pan: Space+left, OR middle mouse, OR right mouse
    vp.addEventListener('mousedown', (ev: MouseEvent) => {
      if (this.pendingPaletteKind) return;
      if (isEditableTarget(ev.target)) return;
      const useSpaceLeft = spaceDown && ev.button === 0;
      const useMiddle    = ev.button === 1;
      const useRight     = ev.button === 2;
      if (!useSpaceLeft && !useMiddle && !useRight) return;
      ev.preventDefault();
      panning = true;
      startX = ev.clientX; startY = ev.clientY;
      startScrollX = vp.scrollLeft; startScrollY = vp.scrollTop;
      prevCursor = vp.style.cursor;
      vp.style.cursor = 'grabbing';
      const onMove = (e: MouseEvent) => {
        if (!panning) return;
        vp.scrollLeft = startScrollX - (e.clientX - startX);
        vp.scrollTop  = startScrollY - (e.clientY - startY);
      };
      const onUp = () => {
        panning = false;
        vp.style.cursor = spaceDown ? 'grab' : (prevCursor || '');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // Suppress browser context menu while right-mouse pan is active
    vp.addEventListener('contextmenu', (ev) => {
      if (panning) { ev.preventDefault(); return; }
      // Also suppress when Space is held (about-to-pan affordance)
      if (spaceDown) { ev.preventDefault(); }
    });

    // Touch pan: 1-finger drag when no palette tool is armed and no editable target
    let touchPanning = false;
    let touchStartX = 0, touchStartY = 0, touchStartSL = 0, touchStartST = 0;
    vp.addEventListener('touchstart', (ev: TouchEvent) => {
      if (this.pendingPaletteKind) return;
      if (ev.touches.length !== 1) return;
      if (isEditableTarget(ev.target)) return;
      const t = ev.touches[0];
      // Don't capture taps inside fields (drag handle has its own touchstart)
      const el = ev.target as HTMLElement;
      if (el && el.closest && el.closest('.pfb-field')) return;
      touchPanning = true;
      touchStartX = t.clientX; touchStartY = t.clientY;
      touchStartSL = vp.scrollLeft; touchStartST = vp.scrollTop;
    }, { passive: true });
    vp.addEventListener('touchmove', (ev: TouchEvent) => {
      if (!touchPanning || ev.touches.length !== 1) return;
      const t = ev.touches[0];
      vp.scrollLeft = touchStartSL - (t.clientX - touchStartX);
      vp.scrollTop  = touchStartST - (t.clientY - touchStartY);
    }, { passive: true });
    vp.addEventListener('touchend', () => { touchPanning = false; });

    // Ctrl + wheel = zoom; plain wheel = native scroll
    vp.addEventListener('wheel', (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const dir = ev.deltaY < 0 ? 1 : -1;
      const next = Math.max(0.4, Math.min(3.0, +(this.zoom + dir * 0.1).toFixed(2)));
      if (next !== this.zoom) this.setZoom(next);
    }, { passive: false });
  }

  // [CursorGhost v20260507-12] Floating chip that previews the picked
  // palette tool next to the mouse pointer (Sejda / Adobe-style "armed
  // tool" feedback). Removed when user drops the field, hits Escape, or
  // re-clicks the palette button to cancel.
  private _ghostEl: HTMLElement | null = null;
  private _ghostMouseHandler: ((ev: MouseEvent) => void) | null = null;
  private _ghostKeyHandler: ((ev: KeyboardEvent) => void) | null = null;

  private attachCursorGhost(p: { kind: FieldKind; label: string; icon: string }): void {
    this.detachCursorGhost();
    // [CursorGhost v20260507-20] Append to <html> (documentElement) instead of
    // <body>, and position via transform (translate3d) instead of top/left.
    // Both changes make the ghost immune to ancestor transforms — DNN/Oqtane
    // skins sometimes apply `transform`/`filter` to body or a wrapper, which
    // makes `position:fixed` resolve relative to that ancestor (not viewport)
    // → the ghost sticks at viewport (0,0) and stops following the cursor.
    (window as any).__MF_PDF_CURSOR_GHOST_BADGE__ = 'CursorGhost v20260507-20';
    const ghost = document.createElement('div');
    ghost.className = 'pfb-cursor-ghost';
    ghost.setAttribute('data-mf-overlay', '1');
    ghost.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;'
      + 'background:#1e293b;color:#fff;border-radius:6px;padding:5px 9px;font-size:12px;'
      + 'font-weight:600;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
      + 'box-shadow:0 6px 18px rgba(15,23,42,.35);display:inline-flex;align-items:center;'
      + 'gap:6px;transform:translate3d(-9999px,-9999px,0);will-change:transform;'
      + 'transition:opacity .12s ease;opacity:0';
    ghost.innerHTML =
      '<span style="font-size:14px">' + (p.icon || '+') + '</span>' +
      '<span>' + (p.label || p.kind) + '</span>' +
      '<span style="opacity:.6;font-size:10px;font-weight:500">click to drop · Esc to cancel</span>';
    (document.documentElement || document.body).appendChild(ghost);
    requestAnimationFrame(() => { ghost.style.opacity = '1'; });

    this._ghostEl = ghost;
    this._ghostMouseHandler = (ev: MouseEvent) => {
      if (!this._ghostEl) return;
      // Use transform — won't trigger reflow & is immune to ancestor positioning.
      this._ghostEl.style.transform = 'translate3d(' + ev.clientX + 'px,' + ev.clientY + 'px,0)';
    };
    this._ghostKeyHandler = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      this.pendingPaletteKind = null;
      if (this.viewportEl) this.viewportEl.style.cursor = '';
      if (this.rootEl) Array.from(this.rootEl.querySelectorAll('.pfb-tool')).forEach(b => (b as HTMLElement).classList.remove('active'));
      this.detachCursorGhost();
    };
    document.addEventListener('mousemove', this._ghostMouseHandler, true);
    document.addEventListener('keydown',   this._ghostKeyHandler,   true);
  }

  private detachCursorGhost(): void {
    if (this._ghostEl) { this._ghostEl.remove(); this._ghostEl = null; }
    if (this._ghostMouseHandler) { document.removeEventListener('mousemove', this._ghostMouseHandler, true); this._ghostMouseHandler = null; }
    if (this._ghostKeyHandler)   { document.removeEventListener('keydown',   this._ghostKeyHandler,   true); this._ghostKeyHandler   = null; }
  }

  public destroy(): void {
    this.detachCursorGhost();
    if (this.clipboard) { this.clipboard.detach(); this.clipboard = null; }
    if (this.pdfRenderer) this.pdfRenderer.destroy();
    this.host.innerHTML = '';
    this.overlays.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // [FieldClipboard v20260708-1] ClipboardHost implementation — copy/paste/
  // duplicate of placed fields (Ctrl+C / Ctrl+V / Ctrl+D + sidebar button).
  // ═══════════════════════════════════════════════════════════════════════

  public isEditMode(): boolean { return this.mode === 'edit'; }
  public getRootEl(): HTMLElement | null { return this.rootEl; }
  public getSelectedFieldId(): string | null { return this.selectedId; }

  public getFieldSnapshot(id: string): AnyField | null {
    const f = this.fields.find(x => x.id === id);
    return f ? JSON.parse(JSON.stringify(f)) : null;
  }

  /** Map a viewport point to { page, x, y } in PDF units, or null if the
   *  point isn't over any rendered page overlay. */
  public clientPointToPage(clientX: number, clientY: number): { page: number; x: number; y: number } | null {
    if (!this.pdfRenderer) return null;
    for (const pi of this.pdfRenderer.pageInfos) {
      const overlay = this.pdfRenderer.getOverlay(pi.pageNumber);
      if (!overlay) continue;
      const r = overlay.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      const scale = pi.cssScale || 1;
      return { page: pi.pageNumber, x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
    }
    return null;
  }

  /** Clone `src` (new id + unique name/label) and place its top-left at
   *  (x, y) on `page`, clamped inside the page. Selects the clone. */
  public addClonedField(src: AnyField, page: number, x: number, y: number): string | null {
    if (!src || !src.kind) return null;
    const clone: AnyField = JSON.parse(JSON.stringify(src));
    clone.id = 'fld_' + Math.random().toString(36).slice(2, 10);
    clone.page = page;

    // Unique data key: strip a trailing _N from the source name, then pick
    // the first free suffix. Label mirrors the same numbering.
    const names = new Set(this.fields.map(f => String((f as any).name || '')));
    const baseName = String((src as any).name || src.kind).replace(/_\d+$/, '');
    let n = 2;
    while (names.has(baseName + '_' + n)) n++;
    (clone as any).name = baseName + '_' + n;
    const baseLabel = String((src as any).label || '').replace(/\s+\d+$/, '');
    if (baseLabel) (clone as any).label = baseLabel + ' ' + n;

    // Clamp inside the page so a paste near an edge stays reachable.
    const pi = this.pdfRenderer ? this.pdfRenderer.pageInfos.find(p => p.pageNumber === page) : null;
    if (pi) {
      clone.x = Math.max(0, Math.min(x, pi.width - clone.width));
      clone.y = Math.max(0, Math.min(y, pi.height - clone.height));
    } else {
      clone.x = Math.max(0, x);
      clone.y = Math.max(0, y);
    }

    this.fields.push(clone);
    const fo = this.overlays.get(page);
    if (fo) fo.renderField(clone);
    this.selectField(clone.id);
    // Bubble a change so the host adapter's hidden-input sync (which listens
    // for input/change/click on the widget wrap) picks up the new layout.
    if (this.rootEl) this.rootEl.dispatchEvent(new Event('change', { bubbles: true }));
    return clone.id;
  }

  /** Paste `src` at a viewport point (palette-drop convention: point = the
   *  clone's top-left). Falls back to source position + 16px offset. */
  public pasteFieldAt(src: AnyField, point: { clientX: number; clientY: number } | null): string | null {
    const target = point ? this.clientPointToPage(point.clientX, point.clientY) : null;
    if (target) return this.addClonedField(src, target.page, target.x, target.y);
    return this.addClonedField(src, src.page || 1, (src.x || 0) + 16, (src.y || 0) + 16);
  }

  /** Duplicate an existing field in place (+16px offset). Returns new id. */
  public duplicateField(id: string): string | null {
    const src = this.fields.find(f => f.id === id);
    if (!src) return null;
    return this.addClonedField(src, src.page, (src.x || 0) + 16, (src.y || 0) + 16);
  }

  public getFields(): AnyField[] { return JSON.parse(JSON.stringify(this.fields)); }
  public getFillValues(): Record<string, any> { return JSON.parse(JSON.stringify(this.fillValues)); }
  public getSignatureStates(): Record<string, SignatureState> { return JSON.parse(JSON.stringify(this.sigStates)); }
  public getImageStates(): Record<string, ImageState> { return JSON.parse(JSON.stringify(this.imgStates)); }
  public getSystemFont(): string { return this.systemFont; }
  public setSystemFont(f: string): void { this.systemFont = f; this.redrawAllFields(); }

  /**
   * [PdfRequiredValidation v20260507-17] Inspect required fields and return
   * structured issues — used by the host plugin's submit hook to abort + show
   * inline UX (vs. the renderer's plain "Required field 'xxx' is empty" text).
   * Returns: array of { id, kind, label, message }. Empty array = OK to submit.
   * Friendly label resolution: explicit field.label → field.name → "PDF Field N (kind)".
   */
  public getValidationIssues(): Array<{ id: string; kind: string; label: string; message: string }> {
    const issues: Array<{ id: string; kind: string; label: string; message: string }> = [];
    let pdfFieldOrdinal = 0;
    for (const f of this.fields) {
      pdfFieldOrdinal++;
      if (!f || !f.required) continue;
      const friendlyLabel = String(f.label || f.name || ('PDF Field ' + pdfFieldOrdinal + ' (' + f.kind + ')')).trim();
      if (f.kind === 'signature') {
        const sig = this.sigStates[f.id];
        if (!sig || !sig.dataUrl) issues.push({ id: f.id, kind: f.kind, label: friendlyLabel, message: 'Please sign "' + friendlyLabel + '"' });
        continue;
      }
      if (f.kind === 'image') {
        const img = this.imgStates[f.id];
        if (!img || !img.dataUrl) issues.push({ id: f.id, kind: f.kind, label: friendlyLabel, message: 'Please attach an image for "' + friendlyLabel + '"' });
        continue;
      }
      if (f.kind === 'checkbox') {
        if (!this.fillValues[f.id]) issues.push({ id: f.id, kind: f.kind, label: friendlyLabel, message: 'Please tick "' + friendlyLabel + '"' });
        continue;
      }
      const v = this.fillValues[f.id];
      if (v == null || String(v).trim() === '') {
        issues.push({ id: f.id, kind: f.kind, label: friendlyLabel, message: 'Please fill "' + friendlyLabel + '"' });
      }
    }
    return issues;
  }

  /**
   * [PdfRequiredHighlight v20260507-17] Toggle a red invalid ring around each
   * given field id and scroll the first into view. Pass an empty array to
   * clear all highlights. The CSS rule `.pfb-field.pfb-field-invalid` is
   * injected by injectInvalidStyles() (called from the host) and uses
   * outline+box-shadow so it never affects layout.
   */
  public highlightInvalidFields(ids: string[]): void {
    const idSet = new Set(ids);
    document.querySelectorAll('.pfb-field').forEach((el) => {
      const fid = (el as HTMLElement).dataset.fieldId || '';
      el.classList.toggle('pfb-field-invalid', idSet.has(fid));
    });
    if (ids.length > 0) {
      const firstEl = document.querySelector('[data-field-id="' + ids[0] + '"]') as HTMLElement | null;
      if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * [SetModePublic v20260507-15] Lightweight mode toggle for the adapter's
   * Preview button — flip rootEl class + redraw fields without re-mounting
   * the heavy PDF.js renderer. Avoids the freeze + lost state of a full
   * destroy/re-mount roundtrip.
   */
  public setMode(next: 'edit' | 'preview' | 'fill'): void {
    if (!next || next === this.mode) return;
    this.mode = next;
    this.detachCursorGhost();
    this.pendingPaletteKind = null;
    if (this.rootEl) {
      this.rootEl.classList.remove('pfb-edit', 'pfb-fill', 'pfb-preview');
      this.rootEl.classList.add('pfb-' + next);
      const sel = this.rootEl.querySelector('.pfb-mode-sel') as HTMLSelectElement | null;
      if (sel) sel.value = next;
    }
    if (this.pdfRenderer) this.pdfRenderer.setGridVisible(this.showGrid && next === 'edit');
    this.redrawAllFields();
  }
}

(window as any).PdfFormBuilderRenderer = PdfFormBuilderRenderer;
(window as any).__PdfFormBuilderVersion = VERSION;
