// /src/widgets/pdf-form-builder/renderer/FieldClipboard.ts
// [FieldClipboard v20260708-1] Copy / paste / duplicate for placed PDF fields.
//
// Why: admins fine-tune ONE control's size (e.g. a text box sized to the
// PDF's ruled line), then need the SAME control at many spots. Before this,
// every palette drop was a fresh default that had to be resized again.
//
// UX (edit mode only):
//   Ctrl/Cmd+C  copy the selected field (size / font / colors / options)
//   Ctrl/Cmd+V  paste a clone with the mouse position as its TOP-LEFT corner
//               (same convention as palette click-to-drop); repeated pastes
//               without moving the mouse cascade +14px so clones never stack
//   Ctrl/Cmd+D  duplicate the selected field in place (+16px offset)
//   Sidebar "⧉ Duplicate" button = same as Ctrl+D (discoverable path)
//
// The clipboard value lives on window (not on the instance) so it survives
// the designer's re-mount cycles (Upload PDF / Preview toggle destroy and
// recreate the renderer) and works across widget instances on one page.

import type { AnyField } from '../types';

const CLIP_KEY = '__MF_PDF_FIELD_CLIPBOARD__';
const BADGE = 'FieldClipboard v20260708-1';

/** The subset of PdfFormBuilderRenderer the clipboard needs. */
export interface ClipboardHost {
  isEditMode(): boolean;
  getRootEl(): HTMLElement | null;
  getSelectedFieldId(): string | null;
  getFieldSnapshot(id: string): AnyField | null;
  /** Paste `src` as a new field; `point` = viewport coords for the clone's
   *  top-left, or null to fall back to source-position + offset. */
  pasteFieldAt(src: AnyField, point: { clientX: number; clientY: number } | null): string | null;
  duplicateField(id: string): string | null;
}

export class FieldClipboard {
  private host: ClipboardHost;
  private lastMouse = { x: 0, y: 0 };
  private lastPastePoint: { x: number; y: number } | null = null;
  private pasteCascade = 0;

  private onKeyDown = (ev: KeyboardEvent) => this.handleKey(ev);
  private onMouseMove = (ev: MouseEvent) => {
    this.lastMouse.x = ev.clientX;
    this.lastMouse.y = ev.clientY;
  };

  constructor(host: ClipboardHost) {
    this.host = host;
  }

  public attach(): void {
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('mousemove', this.onMouseMove, true);
    (window as any).__MF_PDF_CLIPBOARD_BADGE__ = BADGE;
  }

  public detach(): void {
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('mousemove', this.onMouseMove, true);
  }

  private isEditableTarget(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if ((el as any).isContentEditable) return true;
    return false;
  }

  private pointerInside(): boolean {
    const root = this.host.getRootEl();
    if (!root || !root.isConnected) return false;
    const r = root.getBoundingClientRect();
    return this.lastMouse.x >= r.left && this.lastMouse.x <= r.right
        && this.lastMouse.y >= r.top  && this.lastMouse.y <= r.bottom;
  }

  private handleKey(ev: KeyboardEvent): void {
    if (!this.host.isEditMode()) return;
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    const k = (ev.key || '').toLowerCase();
    if (k !== 'c' && k !== 'v' && k !== 'd') return;
    // Typing inside a field's input / the sidebar / dropdown editor → native copy-paste.
    if (this.isEditableTarget(ev.target)) return;
    // A real text selection (e.g. in the PDF text layer) → let the browser copy it.
    const sel = window.getSelection();
    if (k === 'c' && sel && !sel.isCollapsed && String(sel).trim()) return;

    const selectedId = this.host.getSelectedFieldId();

    if (k === 'c') {
      if (!selectedId) return;
      const snap = this.host.getFieldSnapshot(selectedId);
      if (!snap) return;
      (window as any)[CLIP_KEY] = snap;
      this.pasteCascade = 0;
      this.lastPastePoint = null;
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    if (k === 'd') {
      if (!selectedId) return;
      ev.preventDefault();       // block the browser's bookmark dialog
      ev.stopPropagation();
      this.host.duplicateField(selectedId);
      return;
    }

    // k === 'v' — paste
    const clip = (window as any)[CLIP_KEY] as AnyField | undefined;
    if (!clip || !clip.kind) return;
    const inside = this.pointerInside();
    // Not hovering this widget and nothing selected in it → not ours to handle.
    if (!inside && !selectedId) return;
    ev.preventDefault();
    ev.stopPropagation();

    // Repeated pastes at an unmoved mouse cascade so clones never stack exactly.
    if (this.lastPastePoint
        && Math.abs(this.lastMouse.x - this.lastPastePoint.x) < 3
        && Math.abs(this.lastMouse.y - this.lastPastePoint.y) < 3) {
      this.pasteCascade++;
    } else {
      this.pasteCascade = 0;
    }
    this.lastPastePoint = { x: this.lastMouse.x, y: this.lastMouse.y };
    const off = this.pasteCascade * 14;

    this.host.pasteFieldAt(
      clip,
      inside ? { clientX: this.lastMouse.x + off, clientY: this.lastMouse.y + off } : null
    );
  }
}
