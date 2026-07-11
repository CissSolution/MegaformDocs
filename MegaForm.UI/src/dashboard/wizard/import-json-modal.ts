/**
 * MegaForm Wizard — Import JSON dialog
 *
 * Why this exists: "Import JSON" used to be a hidden <input type=file> that we clicked for the
 * user. That works in an ordinary browser, but the native file dialog never appears when the
 * browser is being driven over the DevTools protocol (an AI/automation extension attached to the
 * tab intercepts file choosers) — the button then looks completely dead, with no error anywhere.
 *
 * So the file picker is no longer the only way in. This dialog offers three, and every one of them
 * works with no native dialog at all:
 *   - a REAL file input the user clicks themselves,
 *   - drag a .json file onto the panel,
 *   - paste the JSON text.
 *
 * Badge: WizardImportDialog v20260711-01
 */

export interface ImportDialogOptions {
  /** Called with the raw JSON text once the user supplies it by any of the three routes. */
  onText: (text: string, sourceName: string) => void;
  t: (key: string, fallback: string) => string;
}

export function openImportJsonDialog(opts: ImportDialogOptions): void {
  const t = opts.t;
  document.getElementById('mfw-import-dlg')?.remove();

  const back = document.createElement('div');
  back.id = 'mfw-import-dlg';
  // The wizard's own overlay sits at 2147483646. Anything below that is painted UNDER it: the
  // dialog would be visible through the translucent backdrop but every click would land on the
  // wizard instead — the exact failure this dialog exists to fix.
  back.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px';

  back.innerHTML = `
    <div style="background:#fff;border-radius:14px;width:100%;max-width:560px;padding:20px 22px;box-shadow:0 24px 60px rgba(0,0,0,.35)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h3 style="margin:0;font-size:16px">${esc(t('wiz.import.title', 'Import a MegaForm JSON'))}</h3>
        <button type="button" data-close style="border:0;background:#f1f5f9;border-radius:6px;padding:6px 12px;cursor:pointer">${esc(t('wiz.import.close', 'Close'))}</button>
      </div>
      <p style="margin:0 0 14px;font-size:12px;color:#64748b">${esc(t('wiz.import.hint', 'Choose a file, drop one here, or paste the JSON — whichever works for you.'))}</p>

      <div data-drop style="border:2px dashed #c7d2fe;border-radius:10px;padding:18px;text-align:center;background:#f8fafc;margin-bottom:12px">
        <input type="file" data-file accept=".json,application/json" style="font-size:13px" />
        <div style="font-size:11px;color:#94a3b8;margin-top:8px">${esc(t('wiz.import.drop', '…or drag a .json file onto this panel'))}</div>
      </div>

      <textarea data-paste rows="7" placeholder='${esc(t('wiz.import.paste', '…or paste the JSON here'))}'
        style="width:100%;box-sizing:border-box;font-family:Consolas,monospace;font-size:12px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;resize:vertical"></textarea>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:10px">
        <span data-msg style="font-size:12px;color:#b91c1c"></span>
        <button type="button" data-ok style="background:#6366f1;color:#fff;border:0;border-radius:8px;padding:8px 18px;font-weight:600;cursor:pointer">${esc(t('wiz.import.load', 'Load'))}</button>
      </div>
    </div>`;

  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-close]')!.addEventListener('click', close);

  const msg = back.querySelector('[data-msg]') as HTMLElement;
  const paste = back.querySelector('[data-paste]') as HTMLTextAreaElement;
  const fileInput = back.querySelector('[data-file]') as HTMLInputElement;
  const drop = back.querySelector('[data-drop]') as HTMLElement;

  const deliver = (text: string, name: string) => {
    if (!text || !text.trim()) {
      msg.textContent = t('wiz.import.empty', 'Nothing to import yet.');
      return;
    }
    close();
    opts.onText(text, name);
  };

  const readFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => deliver(String(reader.result || ''), f.name);
    reader.onerror = () => { msg.textContent = t('wiz.import.read_err', 'Could not read that file.'); };
    reader.readAsText(f);
  };

  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) readFile(f);
  });

  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.style.background = '#eef2ff';
  }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.style.background = '#f8fafc';
  }));
  drop.addEventListener('drop', (e: DragEvent) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) readFile(f);
  });

  back.querySelector('[data-ok]')!.addEventListener('click', () => deliver(paste.value, 'pasted JSON'));

  document.body.appendChild(back);
  setTimeout(() => { try { paste.focus(); } catch { /* focus is a nicety */ } }, 30);
}

function esc(s: string): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}
