// /src/widgets/pdf-form-builder/renderer/FieldOverlay.ts — v6
//
// v6 changes:
//   - applyContent() now uses a .pfb-content <div> for edit/preview modes and a real
//     <input>/<select>/<textarea> for fill mode. Both share the SAME CSS rules
//     (padding 2px 4px, line-height 1.2, font inherited) so glyphs land at IDENTICAL
//     positions in both modes — no more vertical/horizontal jitter.
//   - Inline `style.padding`, `style.fontSize`, etc. removed from input/textarea/select.
//     CSS handles them via the universal `.pfb-field > input/select/textarea` rule.
//   - Font is set on the wrapper (.pfb-field) via inline style; children inherit.

import type { AnyField, ImageState, SignatureState } from '../types';

const EMPTY_LABELS: Record<string, string> = {
  label: 'Label', whiteout: 'Whiteout', text: 'Text', textarea: 'Textarea',
  dropdown: 'Dropdown', date: 'Date', number: 'Number',
  signature: 'Sign here', image: 'Image',
};

export interface FieldOverlayCallbacks {
  onSelect?: (id: string) => void;
  onChange?: (id: string, patch: Partial<AnyField>) => void;
  onDelete?: (id: string) => void;
  onValueChange?: (id: string, value: any) => void;
  onSignatureChange?: (id: string, sig: SignatureState | null) => void;
  onImageChange?: (id: string, img: ImageState | null) => void;
  getMode: () => 'edit' | 'preview' | 'fill';
  getFillValue?: (id: string) => any;
  getSignatureState?: (id: string) => SignatureState | undefined;
  getImageState?: (id: string) => ImageState | undefined;
  getSnapEnabled: () => boolean;
  getGridSize: () => number;
  getSystemFont: () => string;     // ★ v6: global font for all text fields
}

function snapTo(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

function isFieldEmpty(field: AnyField, cb: FieldOverlayCallbacks): boolean {
  switch (field.kind) {
    case 'label':    return !((field as any).content);
    case 'whiteout': return false;
    case 'checkbox':
    case 'radio':    return !((cb.getFillValue && cb.getFillValue(field.id)));
    case 'signature':return !((cb.getSignatureState && cb.getSignatureState(field.id)));
    case 'image':    return !((cb.getImageState && cb.getImageState(field.id)));
    default:         return !((cb.getFillValue && cb.getFillValue(field.id)));
  }
}

function isTextLike(kind: string): boolean {
  return kind === 'text' || kind === 'textarea' || kind === 'date' ||
         kind === 'number' || kind === 'dropdown' || kind === 'label';
}

export class FieldOverlay {
  private overlay: HTMLElement;
  private cssScale: number;
  private cb: FieldOverlayCallbacks;
  private elements = new Map<string, HTMLElement>();
  private selectedId: string | null = null;

  constructor(overlay: HTMLElement, cssScale: number, cb: FieldOverlayCallbacks) {
    this.overlay = overlay;
    this.cssScale = cssScale;
    this.cb = cb;
  }

  public setScale(s: number): void {
    this.cssScale = s;
    this.elements.forEach((el) => {
      const f = (el as any).__field as AnyField;
      this.applyGeometry(el, f);
    });
  }

  public renderField(field: AnyField): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'pfb-field pfb-field-' + field.kind;
    wrap.dataset.fieldId = field.id;
    (wrap as any).__field = field;
    wrap.style.position = 'absolute';
    wrap.style.boxSizing = 'border-box';

    // ★ v6: apply font on wrapper so all children inherit it
    if (isTextLike(field.kind) || field.kind === 'signature' || field.kind === 'image') {
      wrap.style.fontFamily = field.fontFamily || this.cb.getSystemFont();
    }

    // [SwatchApply v20260507-15] textColor / borderColor must paint on the
    // wrapper for ALL kinds. Previously textColor was only applied inside
    // the Label branch in applyContent → swatches in the left pane appeared
    // to do nothing. borderColor was never honoured at all.
    if (field.textColor)   wrap.style.color           = field.textColor;
    if (field.borderColor) wrap.style.borderColor     = field.borderColor;
    if (field.borderColor) wrap.style.outline         = '1.5px solid ' + field.borderColor;
    if (field.borderColor) wrap.style.outlineOffset   = '-1.5px';
    if (field.bgColor)     wrap.style.backgroundColor = field.bgColor;

    const mode = this.cb.getMode();
    const empty = isFieldEmpty(field, this.cb);
    if ((mode === 'edit' || mode === 'fill') && empty) {
      wrap.classList.add('is-empty');
    }
    if (mode === 'edit' && empty) {
      wrap.dataset.emptyLabel = EMPTY_LABELS[field.kind] || field.kind;
    }

    this.applyGeometry(wrap, field);
    this.applyContent(wrap, field);

    if (mode === 'edit') {
      wrap.style.cursor = 'move';
      this.attachDragResize(wrap, field);
      wrap.addEventListener('click', (ev) => { ev.stopPropagation(); this.select(field.id); });
    }

    this.overlay.appendChild(wrap);
    this.elements.set(field.id, wrap);
    return wrap;
  }

  private applyGeometry(el: HTMLElement, field: AnyField): void {
    el.style.left = (field.x * this.cssScale) + 'px';
    el.style.top = (field.y * this.cssScale) + 'px';
    el.style.width = (field.width * this.cssScale) + 'px';
    el.style.height = (field.height * this.cssScale) + 'px';
  }

  private applyContent(el: HTMLElement, field: AnyField): void {
    el.innerHTML = '';
    const mode = this.cb.getMode();
    const fontSize = (field.fontSize || 12) * this.cssScale;

    // ★ v6: font-size on wrapper, inherited by .pfb-content + input/select/textarea
    if (isTextLike(field.kind)) el.style.fontSize = fontSize + 'px';

    switch (field.kind) {
      case 'label': {
        const c = document.createElement('div');
        c.className = 'pfb-content';
        c.textContent = (field as any).content || 'Label';
        c.style.color = field.textColor || '#000';
        el.appendChild(c);
        break;
      }
      case 'whiteout':
        el.style.background = '#fff';
        break;
      case 'text':
      case 'number':
      case 'date':
        if (mode === 'fill') {
          const inp = document.createElement('input');
          inp.type = field.kind === 'number' ? 'number' : (field.kind === 'date' ? 'date' : 'text');
          inp.placeholder = field.placeholder || '';
          inp.value = (this.cb.getFillValue && this.cb.getFillValue(field.id)) || field.defaultValue || '';
          if (field.kind === 'number') inp.inputMode = 'numeric';
          // ★ v6: NO inline styles — universal CSS handles padding/font/line-height
          inp.addEventListener('input', () => {
            this.cb.onValueChange && this.cb.onValueChange(field.id, inp.value);
            el.classList.toggle('is-empty', !inp.value);
          });
          el.appendChild(inp);
        } else {
          const c = document.createElement('div');
          c.className = 'pfb-content';
          if (mode === 'preview') {
            const v = this.cb.getFillValue && this.cb.getFillValue(field.id);
            if (v) { c.textContent = String(v); c.style.color = '#000'; }
          } else {
            // edit
            c.textContent = field.placeholder || (field.kind === 'date' ? 'mm/dd/yyyy' : '');
          }
          el.appendChild(c);
        }
        break;
      case 'textarea':
        if (mode === 'fill') {
          const ta = document.createElement('textarea');
          ta.placeholder = field.placeholder || '';
          ta.value = (this.cb.getFillValue && this.cb.getFillValue(field.id)) || field.defaultValue || '';
          ta.addEventListener('input', () => {
            this.cb.onValueChange && this.cb.onValueChange(field.id, ta.value);
            el.classList.toggle('is-empty', !ta.value);
          });
          el.appendChild(ta);
        } else {
          const c = document.createElement('div');
          c.className = 'pfb-content';
          if (mode === 'preview') {
            const v = this.cb.getFillValue && this.cb.getFillValue(field.id);
            if (v) { c.textContent = String(v); c.style.color = '#000'; }
          } else {
            c.textContent = field.placeholder || '';
          }
          el.appendChild(c);
        }
        break;
      case 'checkbox': {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        Object.assign(cb.style, { width: '100%', height: '100%', margin: '0' });
        if (mode !== 'fill') cb.disabled = true;
        if (mode !== 'edit') cb.checked = !!((this.cb.getFillValue && this.cb.getFillValue(field.id)));
        if (mode === 'fill') cb.addEventListener('change', () => {
          this.cb.onValueChange && this.cb.onValueChange(field.id, cb.checked);
          el.classList.toggle('is-empty', !cb.checked);
        });
        el.appendChild(cb);
        break;
      }
      case 'radio': {
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = (field as any).group || ('group_' + field.id);
        Object.assign(r.style, { width: '100%', height: '100%', margin: '0' });
        if (mode !== 'fill') r.disabled = true;
        if (mode !== 'edit') r.checked = (this.cb.getFillValue && this.cb.getFillValue(field.id) === (field as any).value);
        if (mode === 'fill') r.addEventListener('change', () => {
          this.cb.onValueChange && this.cb.onValueChange(field.id, (field as any).value);
          el.classList.toggle('is-empty', false);
        });
        el.appendChild(r);
        break;
      }
      case 'dropdown': {
        if (mode === 'fill') {
          const sel = document.createElement('select');
          const opts = (field as any).options || [{ label: 'Option 1', value: 'opt1' }];
          opts.forEach((o: any) => {
            const opt = document.createElement('option');
            opt.value = o.value; opt.textContent = o.label;
            sel.appendChild(opt);
          });
          sel.value = (this.cb.getFillValue && this.cb.getFillValue(field.id)) || '';
          sel.addEventListener('change', () => {
            this.cb.onValueChange && this.cb.onValueChange(field.id, sel.value);
            el.classList.toggle('is-empty', !sel.value);
          });
          el.appendChild(sel);
        } else {
          const c = document.createElement('div');
          c.className = 'pfb-content';
          if (mode === 'preview') {
            const v = this.cb.getFillValue && this.cb.getFillValue(field.id);
            if (v) {
              const opt = ((field as any).options || []).find((o: any) => o.value === v);
              c.textContent = opt ? opt.label : v;
              c.style.color = '#000';
            }
          } else {
            const first = ((field as any).options || [])[0];
            c.textContent = first ? first.label : '';
          }
          el.appendChild(c);
        }
        break;
      }
      case 'signature': {
        const sig = this.cb.getSignatureState && this.cb.getSignatureState(field.id);
        if (sig && sig.dataUrl) {
          this.renderImageInField(el, field, sig);
          if (mode === 'fill') {
            el.style.cursor = 'pointer';
            el.title = 'Click to redraw signature';
            el.addEventListener('click', (ev) => { ev.stopPropagation(); this.openSignaturePad(field); });
          }
        } else {
          const c = document.createElement('div');
          c.className = 'pfb-content';
          c.style.justifyContent = 'center';
          if (mode === 'fill') {
            c.textContent = '✒ Click to sign';
            el.appendChild(c);
            el.addEventListener('click', () => this.openSignaturePad(field));
          } else if (mode === 'edit') {
            c.style.color = '#7a5c00';
            c.textContent = '';
            el.appendChild(c);
          }
        }
        break;
      }
      case 'image': {
        const img = this.cb.getImageState && this.cb.getImageState(field.id);
        if (img && img.dataUrl) {
          this.renderImageInField(el, field, img);
          if (mode === 'fill' || mode === 'edit') {
            el.style.cursor = 'pointer';
            el.title = 'Click to replace image';
            el.addEventListener('click', (ev) => { ev.stopPropagation(); this.openImagePicker(field); });
          }
        } else {
          const c = document.createElement('div');
          c.className = 'pfb-content';
          c.style.justifyContent = 'center';
          if (mode === 'fill') {
            c.textContent = '🖼 Click to add image';
            el.appendChild(c);
            el.addEventListener('click', () => this.openImagePicker(field));
          } else if (mode === 'edit') {
            c.style.color = '#5d3a78';
            c.textContent = '';
            el.appendChild(c);
            el.addEventListener('dblclick', (ev) => { ev.stopPropagation(); this.openImagePicker(field); });
          }
        }
        break;
      }
    }

    if (mode === 'edit') this.addResizeHandles(el);
  }

  private renderImageInField(el: HTMLElement, field: AnyField, sig: SignatureState | ImageState): void {
    const img = document.createElement('img');
    img.src = sig.dataUrl;
    img.draggable = false;
    const fieldRatio = field.width / field.height;
    const sigRatio = sig.naturalW / sig.naturalH;
    let baseW: number, baseH: number;
    if (sigRatio > fieldRatio) { baseW = field.width; baseH = baseW / sigRatio; }
    else { baseH = field.height; baseW = baseH * sigRatio; }
    const sw = baseW * (sig.scale || 1);
    const sh = baseH * (sig.scale || 1);
    Object.assign(img.style, {
      position: 'absolute',
      left: ((sig.offsetX || 0) * this.cssScale) + 'px',
      top: ((sig.offsetY || 0) * this.cssScale) + 'px',
      width: (sw * this.cssScale) + 'px',
      height: (sh * this.cssScale) + 'px',
      objectFit: 'contain',
      pointerEvents: 'none',
    });
    el.style.overflow = 'visible';
    el.appendChild(img);
  }

  private addResizeHandles(el: HTMLElement): void {
    ['nw', 'ne', 'sw', 'se'].forEach(corner => {
      const h = document.createElement('div');
      h.className = 'pfb-resize pfb-resize-' + corner;
      h.dataset.corner = corner;
      el.appendChild(h);
    });
  }

  private attachDragResize(el: HTMLElement, field: AnyField): void {
    let startX = 0, startY = 0, startField: AnyField, dragMode: 'move' | 'resize' = 'move', corner = '';
    const start = (clientX: number, clientY: number, target: HTMLElement): boolean => {
      const tag = target.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return false;
      if (target.classList.contains('pfb-resize')) {
        dragMode = 'resize';
        corner = target.dataset.corner || 'se';
      } else dragMode = 'move';
      startX = clientX; startY = clientY;
      startField = JSON.parse(JSON.stringify((el as any).__field));
      return true;
    };
    const move = (clientX: number, clientY: number, alt: boolean): void => {
      const dx = (clientX - startX) / this.cssScale;
      const dy = (clientY - startY) / this.cssScale;
      const f = JSON.parse(JSON.stringify(startField));
      const snap = this.cb.getSnapEnabled() && !alt;
      const grid = this.cb.getGridSize();
      const minDim = 6;
      if (dragMode === 'move') {
        f.x = Math.max(0, startField.x + dx);
        f.y = Math.max(0, startField.y + dy);
        if (snap) { f.x = snapTo(f.x, grid); f.y = snapTo(f.y, grid); }
      } else {
        let nW = startField.width, nH = startField.height, nX = startField.x, nY = startField.y;
        if (corner.includes('e')) nW = Math.max(minDim, startField.width + dx);
        if (corner.includes('s')) nH = Math.max(minDim, startField.height + dy);
        if (corner.includes('w')) { nW = Math.max(minDim, startField.width - dx); nX = startField.x + dx; }
        if (corner.includes('n')) { nH = Math.max(minDim, startField.height - dy); nY = startField.y + dy; }
        if (snap) {
          if (corner.includes('e')) nW = snapTo(nW, grid);
          if (corner.includes('s')) nH = snapTo(nH, grid);
          if (corner.includes('w')) { const right = startField.x + startField.width; nX = snapTo(nX, grid); nW = right - nX; }
          if (corner.includes('n')) { const bottom = startField.y + startField.height; nY = snapTo(nY, grid); nH = bottom - nY; }
        }
        f.x = Math.max(0, nX); f.y = Math.max(0, nY);
        f.width = Math.max(minDim, nW); f.height = Math.max(minDim, nH);
      }
      (el as any).__field = f;
      this.applyGeometry(el, f);
    };
    const finish = () => {
      const f = (el as any).__field as AnyField;
      // [FieldClipboard v20260708-1] Plain clicks (no actual move/resize) must
      // NOT fire onChange: the host's patchField → refreshField REPLACES the
      // element mid-gesture, so the browser retargets the follow-up `click` to
      // the overlay (the original element is detached) → the overlay handler
      // ran deselectAll() and selection never stuck. Only report real changes.
      if (f.x === startField.x && f.y === startField.y
          && f.width === startField.width && f.height === startField.height) return;
      if (this.cb.onChange) this.cb.onChange(f.id, { x: f.x, y: f.y, width: f.width, height: f.height });
    };

    el.addEventListener('mousedown', (ev) => {
      if (!start(ev.clientX, ev.clientY, ev.target as HTMLElement)) return;
      ev.preventDefault(); ev.stopPropagation();
      // [FieldClipboard v20260708-1] Select on mousedown (Sejda/Adobe
      // convention) so the selection survives even when a drag follows, and
      // so Ctrl+C always has a current field regardless of click retargeting.
      this.select(field.id);
      const onMove = (e: MouseEvent) => move(e.clientX, e.clientY, e.altKey);
      const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); finish(); };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    el.addEventListener('touchstart', (ev) => {
      if (ev.touches.length !== 1) return;
      const t = ev.touches[0];
      if (!start(t.clientX, t.clientY, ev.target as HTMLElement)) return;
      ev.preventDefault(); ev.stopPropagation();
      const onMove = (e: TouchEvent) => {
        if (e.touches.length === 1) {
          const tt = e.touches[0];
          move(tt.clientX, tt.clientY, false);
          e.preventDefault();
        }
      };
      const onEnd = () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); finish(); };
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    }, { passive: false });
  }

  /**
   * Update visual selection state. `fireCallback` controls whether the
   * onSelect callback is invoked — set to false when the renderer propagates
   * a selection across overlays (otherwise we get infinite recursion:
   * selectField → fo.select → cb.onSelect → selectField → …).
   */
  public select(id: string | null, fireCallback: boolean = true): void {
    if (this.selectedId) {
      const prev = this.elements.get(this.selectedId);
      if (prev) prev.classList.remove('pfb-selected');
    }
    this.selectedId = id;
    if (id) {
      const cur = this.elements.get(id);
      if (cur) cur.classList.add('pfb-selected');
      if (fireCallback && this.cb.onSelect) this.cb.onSelect(id);
    }
  }

  public removeField(id: string): void {
    const el = this.elements.get(id);
    if (el) el.remove();
    this.elements.delete(id);
  }

  public clear(): void {
    this.elements.forEach(el => el.remove());
    this.elements.clear();
    this.selectedId = null;
  }

  // === Signature pad (unchanged from v5) ===
  private openSignaturePad(field: AnyField): void {
    const bg = document.createElement('div');
    bg.className = 'sig-modal-bg';
    bg.innerHTML = '<div class="sig-modal"><h3>Draw your signature</h3><p style="font-size:12px;color:#666;margin:0 0 10px">Sign in the box. Aspect ratio preserved.</p><canvas width="500" height="180"></canvas><div class="sig-actions"><button type="button" class="pfb-btn sig-clear">Clear</button><button type="button" class="pfb-btn sig-cancel">Cancel</button><button type="button" class="pfb-btn pfb-btn-primary sig-next">Next: Adjust</button></div></div>';
    document.body.appendChild(bg);
    const cv = bg.querySelector('canvas') as HTMLCanvasElement;
    const cx = cv.getContext('2d')!;
    cx.lineWidth = 2.4; cx.strokeStyle = '#000'; cx.lineCap = 'round'; cx.lineJoin = 'round';
    let drawing = false, lx = 0, ly = 0, hasDrawn = false;
    let bb = { minX: cv.width, minY: cv.height, maxX: 0, maxY: 0 };
    const track = (x: number, y: number) => { if (x < bb.minX) bb.minX = x; if (y < bb.minY) bb.minY = y; if (x > bb.maxX) bb.maxX = x; if (y > bb.maxY) bb.maxY = y; };
    const begin = (x: number, y: number) => { drawing = true; lx = x; ly = y; hasDrawn = true; track(x, y); };
    const draw = (x: number, y: number) => { if (!drawing) return; cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(x, y); cx.stroke(); track(x, y); lx = x; ly = y; };
    const stop = () => { drawing = false; };
    const getPos = (e: MouseEvent | Touch): [number, number] => {
      const r = cv.getBoundingClientRect();
      const sx = cv.width / r.width, sy = cv.height / r.height;
      return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy];
    };
    cv.onmousedown = (e) => { const [x, y] = getPos(e); begin(x, y); };
    cv.onmousemove = (e) => { const [x, y] = getPos(e); draw(x, y); };
    window.addEventListener('mouseup', stop);
    cv.addEventListener('touchstart', (e) => { e.preventDefault(); const [x, y] = getPos(e.touches[0]); begin(x, y); }, { passive: false });
    cv.addEventListener('touchmove',  (e) => { e.preventDefault(); const [x, y] = getPos(e.touches[0]); draw(x, y); }, { passive: false });
    cv.addEventListener('touchend', stop);
    (bg.querySelector('.sig-clear') as HTMLButtonElement).onclick = () => { cx.clearRect(0, 0, cv.width, cv.height); hasDrawn = false; bb = { minX: cv.width, minY: cv.height, maxX: 0, maxY: 0 }; };
    (bg.querySelector('.sig-cancel') as HTMLButtonElement).onclick = () => bg.remove();
    (bg.querySelector('.sig-next') as HTMLButtonElement).onclick = () => {
      if (!hasDrawn) { alert('Please sign first'); return; }
      const pad = 8;
      const minX = Math.max(0, bb.minX - pad), minY = Math.max(0, bb.minY - pad);
      const maxX = Math.min(cv.width, bb.maxX + pad), maxY = Math.min(cv.height, bb.maxY + pad);
      const cw = Math.max(20, maxX - minX), ch = Math.max(20, maxY - minY);
      const crop = document.createElement('canvas'); crop.width = cw; crop.height = ch;
      crop.getContext('2d')!.drawImage(cv, minX, minY, cw, ch, 0, 0, cw, ch);
      const dataUrl = crop.toDataURL('image/png');
      bg.remove();
      this.openAdjust(field, dataUrl, cw, ch, 'signature', 'image/png');
    };
  }

  private openImagePicker(field: AnyField): void {
    const bg = document.createElement('div');
    bg.className = 'img-modal-bg';
    bg.innerHTML = '<div class="img-modal"><h3>Add image to PDF</h3><p style="font-size:12px;color:#666;margin:0 0 10px">Choose PNG or JPEG. Aspect ratio preserved.</p>'
      + '<input type="file" accept="image/png,image/jpeg" class="img-input" style="display:block;margin-bottom:8px">'
      + '<img class="img-preview" alt="preview" style="display:none">'
      + '<div class="img-actions"><button type="button" class="pfb-btn img-cancel">Cancel</button><button type="button" class="pfb-btn pfb-btn-primary img-next" disabled>Next: Adjust</button></div></div>';
    document.body.appendChild(bg);
    const inp = bg.querySelector('.img-input') as HTMLInputElement;
    const prev = bg.querySelector('.img-preview') as HTMLImageElement;
    const next = bg.querySelector('.img-next') as HTMLButtonElement;
    let dataUrl: string | null = null, naturalW = 0, naturalH = 0;
    let mimeType: 'image/png' | 'image/jpeg' = 'image/png';
    inp.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
      mimeType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
      const r = new FileReader();
      r.onload = () => {
        dataUrl = r.result as string;
        const im = new Image();
        im.onload = () => {
          naturalW = im.naturalWidth; naturalH = im.naturalHeight;
          prev.src = dataUrl!; prev.style.display = 'block';
          next.disabled = false;
        };
        im.src = dataUrl;
      };
      r.readAsDataURL(file);
    };
    (bg.querySelector('.img-cancel') as HTMLButtonElement).onclick = () => bg.remove();
    next.onclick = () => {
      if (!dataUrl) return;
      bg.remove();
      this.openAdjust(field, dataUrl, naturalW, naturalH, 'image', mimeType);
    };
  }

  private openAdjust(field: AnyField, dataUrl: string, naturalW: number, naturalH: number, kind: 'signature' | 'image', mimeType: 'image/png' | 'image/jpeg'): void {
    const bg = document.createElement('div');
    bg.className = 'sig-adjust-bg';
    const stageScale = Math.min(480 / field.width, 280 / field.height, 4);
    const stageW = field.width * stageScale;
    const stageH = field.height * stageScale;
    const aspect = naturalW / naturalH;
    const fieldAspect = field.width / field.height;
    let sigW: number, sigH: number;
    if (aspect > fieldAspect) { sigW = field.width; sigH = sigW / aspect; }
    else { sigH = field.height; sigW = sigH * aspect; }
    let scale = 1.0;
    let offX = (field.width - sigW) / 2;
    let offY = (field.height - sigH) / 2;
    const targetCls = kind === 'image' ? 'image' : '';
    const labelObj = kind === 'image' ? 'image' : 'signature';
    const labelObjC = kind === 'image' ? 'Image' : 'Signature';
    bg.innerHTML = '<div class="sig-adjust-modal">'
      + '<h3>Position your ' + labelObj + '</h3>'
      + '<p style="font-size:12px;color:#666;margin:0 0 10px">Drag to move. Slide to scale. Aspect ratio always preserved.</p>'
      + '<div class="sig-adjust-stage" style="width:' + (stageW + 24) + 'px;height:' + (stageH + 24) + 'px;padding:12px"></div>'
      + '<div class="sig-adjust-controls"><label>Scale:</label><input type="range" class="adj-scale" min="0.2" max="3" step="0.05" value="1"><span class="adj-scale-val" style="min-width:42px">100%</span></div>'
      + '<div class="sig-adjust-controls"><button type="button" class="pfb-btn adj-fit">Fit to box</button><button type="button" class="pfb-btn adj-center">Center</button><button type="button" class="pfb-btn adj-redraw">' + (kind === 'image' ? 'Choose other' : 'Redraw') + '</button></div>'
      + '<div class="sig-adjust-controls" style="justify-content:flex-end"><button type="button" class="pfb-btn adj-cancel">Cancel</button><button type="button" class="pfb-btn pfb-btn-primary adj-save">Place ' + labelObjC + '</button></div></div>';
    document.body.appendChild(bg);
    const stage = bg.querySelector('.sig-adjust-stage') as HTMLElement;
    const target = document.createElement('div');
    target.className = 'sig-adjust-target ' + targetCls;
    Object.assign(target.style, { left: '12px', top: '12px', width: stageW + 'px', height: stageH + 'px' });
    stage.appendChild(target);
    const img = document.createElement('img');
    img.className = 'sig-adjust-img';
    img.src = dataUrl;
    img.draggable = false;
    stage.appendChild(img);
    const refresh = () => {
      img.style.width = (sigW * scale * stageScale) + 'px';
      img.style.height = (sigH * scale * stageScale) + 'px';
      img.style.left = (12 + offX * stageScale) + 'px';
      img.style.top = (12 + offY * stageScale) + 'px';
    };
    refresh();
    let dragging = false, dx = 0, dy = 0;
    const startDrag = (cx: number, cy: number) => { dragging = true; dx = cx; dy = cy; };
    const moveDrag = (cx: number, cy: number) => {
      if (!dragging) return;
      offX += (cx - dx) / stageScale;
      offY += (cy - dy) / stageScale;
      dx = cx; dy = cy;
      refresh();
    };
    const endDrag = () => { dragging = false; };
    img.onmousedown = (e) => { startDrag(e.clientX, e.clientY); e.preventDefault(); };
    const onMv = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
    const onUp = () => endDrag();
    window.addEventListener('mousemove', onMv);
    window.addEventListener('mouseup', onUp);
    img.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.touches[0]; startDrag(t.clientX, t.clientY); }, { passive: false });
    img.addEventListener('touchmove',  (e) => { e.preventDefault(); const t = e.touches[0]; moveDrag(t.clientX, t.clientY); }, { passive: false });
    img.addEventListener('touchend', endDrag);
    const scaleInp = bg.querySelector('.adj-scale') as HTMLInputElement;
    const scaleLbl = bg.querySelector('.adj-scale-val') as HTMLSpanElement;
    scaleInp.oninput = () => {
      const oldW = sigW * scale, oldH = sigH * scale;
      scale = parseFloat(scaleInp.value);
      const newW = sigW * scale, newH = sigH * scale;
      offX += (oldW - newW) / 2;
      offY += (oldH - newH) / 2;
      scaleLbl.textContent = Math.round(scale * 100) + '%';
      refresh();
    };
    const cleanup = () => {
      window.removeEventListener('mousemove', onMv);
      window.removeEventListener('mouseup', onUp);
      bg.remove();
    };
    (bg.querySelector('.adj-fit') as HTMLButtonElement).onclick = () => {
      scale = 1.0;
      offX = (field.width - sigW) / 2;
      offY = (field.height - sigH) / 2;
      scaleInp.value = '1'; scaleLbl.textContent = '100%';
      refresh();
    };
    (bg.querySelector('.adj-center') as HTMLButtonElement).onclick = () => {
      offX = (field.width - sigW * scale) / 2;
      offY = (field.height - sigH * scale) / 2;
      refresh();
    };
    (bg.querySelector('.adj-redraw') as HTMLButtonElement).onclick = () => {
      cleanup();
      if (kind === 'signature') this.openSignaturePad(field);
      else this.openImagePicker(field);
    };
    (bg.querySelector('.adj-cancel') as HTMLButtonElement).onclick = cleanup;
    (bg.querySelector('.adj-save') as HTMLButtonElement).onclick = () => {
      if (kind === 'signature') {
        const sig: SignatureState = { dataUrl, naturalW, naturalH, offsetX: offX, offsetY: offY, scale };
        if (this.cb.onSignatureChange) this.cb.onSignatureChange(field.id, sig);
      } else {
        const im: ImageState = { dataUrl, naturalW, naturalH, offsetX: offX, offsetY: offY, scale, mimeType };
        if (this.cb.onImageChange) this.cb.onImageChange(field.id, im);
      }
      cleanup();
    };
  }
}
