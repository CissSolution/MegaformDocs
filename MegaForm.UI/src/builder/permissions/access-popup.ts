// [AccessPopup v20260711] The Permissions matrix (7 permission columns) and the Field-visibility table
// are far too wide for the builder's narrow right rail — columns get clipped and unreachable. This opens
// the whole Access editor in a large centered modal so everything is visible at once.
//
// It MOVES the existing #mf-perm-editor and #mf-perm-fieldvis-group nodes into the modal rather than
// cloning them, so all the existing render passes (which target those elements by id) and the delegated
// handlers keep working unchanged; on close it moves them back to exactly where they were.
//
// The overlay is portaled to <body> with a max z-index, mirroring the proven fullscreen-toggle button —
// a lower z-index would sink beneath a .mf-oq-surface.is-fs surface (z 10000), the documented trap.

const OVERLAY_ID = 'mf-perm-popup-overlay';
const Z = 2147483000; // just under the fs-toggle (…3600) so that stays clickable if both ever coexist

interface Anchor {
  el: HTMLElement;
  parent: HTMLElement;
  next: Node | null;
}

let anchors: Anchor[] = [];

export function isAccessPopupOpen(): boolean {
  return !!document.getElementById(OVERLAY_ID);
}

function capture(id: string): Anchor | null {
  const el = document.getElementById(id) as HTMLElement | null;
  if (!el || !el.parentElement) return null;
  return { el, parent: el.parentElement, next: el.nextSibling };
}

export function closeAccessPopup(): void {
  const overlay = document.getElementById(OVERLAY_ID);
  // Return the moved nodes to their original slots before the overlay is removed, else they'd be
  // destroyed with it.
  for (const a of anchors) {
    if (a.next && a.next.parentNode === a.parent) a.parent.insertBefore(a.el, a.next);
    else a.parent.appendChild(a.el);
  }
  anchors = [];
  if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);
  document.removeEventListener('keydown', onKey);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeAccessPopup();
}

export function openAccessPopup(): void {
  if (isAccessPopupOpen()) return;

  const editor = capture('mf-perm-editor');
  const fieldvis = capture('mf-perm-fieldvis-group');
  if (!editor) return; // nothing to show yet (form not saved / catalog not loaded)

  anchors = [editor];
  if (fieldvis) anchors.push(fieldvis);

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('style',
    'position:fixed;inset:0;z-index:' + Z + ';background:rgba(15,23,42,.55);' +
    'display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;overflow:auto;');
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeAccessPopup(); });

  const modal = document.createElement('div');
  modal.setAttribute('style',
    'background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.35);' +
    'width:min(1080px,96vw);max-height:calc(100vh - 64px);display:flex;flex-direction:column;overflow:hidden;');

  const header = document.createElement('div');
  header.setAttribute('style',
    'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;' +
    'border-bottom:1px solid #e2e8f0;background:#f8fafc;flex:0 0 auto;');
  header.innerHTML =
    '<div style="font-weight:600;color:#0f172a;font-size:14px;display:inline-flex;align-items:center;gap:8px">' +
      '<i class="fas fa-user-shield" style="color:#7c3aed"></i> Permissions &amp; Access</div>';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'mf-builder-btn';
  closeBtn.innerHTML = '<i class="fas fa-times"></i> Close';
  closeBtn.setAttribute('style', 'cursor:pointer');
  closeBtn.addEventListener('click', closeAccessPopup);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.setAttribute('style', 'padding:18px;overflow:auto;flex:1 1 auto;');
  for (const a of anchors) body.appendChild(a.el); // move the live editor nodes in

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
}
