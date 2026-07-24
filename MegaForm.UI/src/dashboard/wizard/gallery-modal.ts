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
import { WizardTemplate, templatesState, loadTemplates, resetTemplates, wizardTemplateFromJson } from './templates';
import { RemoteTemplate, loadRemoteTemplates, loadRemoteTemplateDoc, installRemoteTemplate, resetRemoteCache } from './remote-gallery';
import { buildTemplateThumbnail, openTemplatePreview, ensurePreviewCss, fitThumbFrames } from './gallery-preview';

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
  .mfwg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
  .mfwg-card{text-align:left;border:1px solid #e5e7eb;border-radius:14px;background:#fff;padding:0;cursor:pointer;overflow:hidden;transition:all .15s;display:block;position:relative}
  .mfwg-card:hover{border-color:#c7d2fe;box-shadow:0 12px 26px rgba(15,23,42,.1);transform:translateY(-2px)}
  .mfwg-card:focus-visible{outline:2px solid #818cf8;outline-offset:2px}
  .mfwg-thumb{height:220px;background:linear-gradient(135deg,#eef2ff,#faf5ff);display:flex;align-items:center;justify-content:center;color:#6366f1;font-size:30px;position:relative;overflow:hidden}
  /* [CardTitle 2026-07-24] Cards were thumbnail-only — pretty, but you could not tell what any
     of them WAS without hovering into the preview. Name + one meta line, always visible. */
  .mfwg-cap{padding:10px 12px 11px;border-top:1px solid #f1f5f9;background:#fff}
  .mfwg-cap b{display:block;font-size:13px;font-weight:700;color:#0f172a;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mfwg-cap span{display:block;margin-top:3px;font-size:11px;font-weight:600;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mfwg-card.mfwg-locked .mfwg-cap b{color:#64748b}
  .mfwg-cap .mfwg-tag{display:inline-flex;align-items:center;gap:4px;color:#7c3aed}
  .mfwg-lock{position:absolute;top:9px;right:9px;z-index:3;width:28px;height:28px;border-radius:999px;background:rgba(15,23,42,.72);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px}
  .mfwg-thumb-ov{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,rgba(15,23,42,.04) 0%,rgba(15,23,42,.34) 100%);opacity:0;transition:opacity .16s}
  .mfwg-card:hover .mfwg-thumb-ov,.mfwg-card:focus-within .mfwg-thumb-ov{opacity:1}
  .mfwg-peek{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;padding:0;border:0;border-radius:999px;cursor:pointer;color:#0f172a;background:rgba(255,255,255,.96);font-weight:700;font-size:13px;box-shadow:0 10px 26px rgba(15,23,42,.22);transform:translateY(6px);transition:transform .16s}
  .mfwg-card:hover .mfwg-peek,.mfwg-card:focus-within .mfwg-peek{transform:translateY(0)}
  .mfwg-peek:hover{background:#fff}
  .mfwg-empty{color:#94a3b8;font-size:13px;text-align:center;padding:48px 0}
  .mfwg-ft{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid #f1f5f9;background:#fafbff}
  .mfwg-import{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 16px;border:1px dashed #c7d2fe;border-radius:10px;background:#fff;color:#4338ca;font-weight:700;font-size:13px;cursor:pointer}
  .mfwg-import:hover{background:#eef2ff}
  .mfwg-ft .mfwg-hint{font-size:12px;color:#94a3b8}
  /* [GalleryRepo v20260724] source switch (Installed | Online gallery) */
  .mfwg-sources{padding-bottom:0;border-bottom:0;gap:8px}
  .mfwg-source{display:inline-flex;align-items:center;gap:7px;padding:6px 15px;font-weight:700}
  .mfwg-source.on{background:linear-gradient(135deg,#6366f1,#8b5cf6);border-color:transparent;color:#fff}
  .mfwg-badge-have{position:absolute;top:9px;left:9px;z-index:3;width:26px;height:26px;border-radius:999px;background:rgba(5,150,105,.95);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px}
  .mfwg-card.mfwg-busy{opacity:.6;pointer-events:none}
  .mfwg-card.mfwg-busy .mfwg-thumb::after{content:'';position:absolute;inset:0;background:rgba(15,23,42,.25)}
  `;
  document.head.appendChild(s);
}

function catLabel(c: string): string { return c ? c.charAt(0).toUpperCase() + c.slice(1) : 'General'; }

/** Card caption: the template's name plus one line of context. Without it a card is an
 *  unlabelled picture and you have to open the preview to find out what it is. */
function cardCaption(title: string, meta: string): HTMLElement {
  const name = (title || '').trim() || wt('wiz.gallery.untitled', 'Untitled template');
  return h('div', { class: 'mfwg-cap' }, [
    h('b', { title: name }, name),
    h('span', null, meta),
  ]);
}

/** "Events · 20 fields" — the field count is dropped when unknown (0). */
function metaLine(category: string, fieldCount: number, extra?: string): string {
  const bits = [catLabel((category || 'general').toLowerCase())];
  if (fieldCount > 0) bits.push(wt('wiz.gallery.n_fields', '{n} fields', { n: fieldCount }));
  if (extra) bits.push(extra);
  return bits.join(' · ');
}

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
  // [GalleryRepo v20260724] Two sources in ONE gallery: what's installed locally, and the
  // online catalog. Sharing the grid means the online source inherits category chips,
  // search, live thumbnails and the preview modal instead of being a bare list.
  let source: 'installed' | 'online' = 'installed';
  let remote: RemoteTemplate[] = [];
  let remoteState: 'idle' | 'loading' | 'ok' | 'trial' | 'error' = 'idle';
  let remoteOffline = false;
  // [TrialBrowse 2026-07-24] The catalog IS listed on a trial install — browsing the designs is
  // the whole point of a shop window. Only installing is refused ('trial' state below is the
  // legacy all-or-nothing gate, kept for older servers).
  let remoteBrowseOnly = false;

  const grid = h('div', { class: 'mfwg-grid' });
  const cats = h('div', { class: 'mfwg-cats' });
  const sourceTabs = h('div', { class: 'mfwg-cats mfwg-sources' });
  const searchInput = h('input', { type: 'text', placeholder: wt('wiz.gallery.search_ph', 'Search templates…'), 'aria-label': wt('wiz.gallery.search_ph', 'Search templates…') }) as HTMLInputElement;

  const ov = h('div', { class: 'mfwg-ov', id: 'mfw-gallery-ov' }, [
    h('div', { class: 'mfwg-modal', onclick: (e: any) => e.stopPropagation() }, [
      h('div', { class: 'mfwg-hd' }, [
        h('div', { class: 'mfwg-logo' }, [icon('fa-layer-group')]),
        h('h3', null, [document.createTextNode(wt('wiz.gallery.title', 'Template Gallery'))]),
        h('div', { class: 'mfwg-search' }, [icon('fa-search'), searchInput]),
        h('button', { class: 'mfwg-x', title: wt('wiz.gallery.close', 'Close'), onclick: close }, [icon('fa-times')]),
      ]),
      sourceTabs,
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

  function renderSources(): void {
    sourceTabs.innerHTML = '';
    const tab = (key: 'installed' | 'online', label: string, ico: string) =>
      h('button', {
        class: 'mfwg-cat mfwg-source' + (source === key ? ' on' : ''),
        onclick: () => {
          if (source === key) return;
          source = key; activeCat = 'all';
          renderSources(); renderCats(); renderGrid();
          if (key === 'online' && remoteState === 'idle') fetchRemote();
        },
      }, [icon(ico), document.createTextNode(' ' + label)]);
    sourceTabs.appendChild(tab('installed', wt('wiz.gallery.src_installed', 'Installed'), 'fa-box-open'));
    sourceTabs.appendChild(tab('online', wt('wiz.gallery.src_online', 'Online gallery'), 'fa-cloud-arrow-down'));
    if (source === 'online' && remoteState === 'ok') {
      const n = remote.filter((t) => !t.installed).length;
      const hint = remoteBrowseOnly
        ? wt('wiz.gallery.online_browse', 'Preview only — a paid license unlocks installing')
        : (n ? wt('wiz.gallery.online_count', '{n} available to install', { n }) : wt('wiz.gallery.online_all', 'All installed'));
      sourceTabs.appendChild(h('span', { class: 'mfwg-hint', style: 'margin-left:auto;align-self:center' }, hint));
    }
  }

  function fetchRemote(): void {
    remoteState = 'loading'; renderGrid();
    loadRemoteTemplates().then((res) => {
      if (!res.ok && res.trial) { remoteState = 'trial'; }   // legacy server: whole listing gated
      else if (!res.ok) { remoteState = 'error'; }
      else { remoteState = 'ok'; remote = res.templates; remoteOffline = !!res.offline; remoteBrowseOnly = !!res.trial; }
      renderSources(); renderCats(); renderGrid();
    });
  }

  function renderCats(): void {
    const uniq = source === 'online'
      ? Array.from(new Set(remote.map((t) => (t.category || 'general').toLowerCase())))
      : Array.from(new Set(templatesState().list.map((t) => (t.category || 'general').toLowerCase())));
    cats.innerHTML = '';
    ['all', ...uniq.sort()].forEach((c) => {
      cats.appendChild(h('button', { class: 'mfwg-cat' + (activeCat === c ? ' on' : ''), onclick: () => { activeCat = c; renderCats(); renderGrid(); } }, c === 'all' ? wt('wiz.gallery.all', 'All templates') : catLabel(c)));
    });
  }

  /** Online card: same shell as a local card, but the thumbnail is filled in once the
   *  template document arrives, and the primary action installs instead of picking.
   *  On a trial install the card is READ-ONLY — the design is visible, the download is not. */
  function renderOnlineCard(t: RemoteTemplate): HTMLElement {
    const previewLabel = wt('wiz.gallery.preview', 'Preview');
    const locked = remoteBrowseOnly && !t.installed;
    const thumb = h('div', {
      class: 'mfwg-thumb mfwg-thumb-live',
      style: 'background:' + thumbGradient(t.category) + (locked ? ';filter:grayscale(.35)' : ''),
    });
    thumb.appendChild(h('div', { class: 'mfwg-empty', style: 'padding:0;color:rgba(255,255,255,.85)' }, [icon('fa-spinner fa-spin')]));

    const card = h('div', { class: 'mfwg-card' + (locked ? ' mfwg-locked' : ''), role: 'button', tabindex: '0' }, [
      thumb,
      cardCaption(t.title, metaLine(t.category, Number((t as any).fieldCount) || 0,
        t.installed ? wt('wiz.remote.installed', 'Installed')
          : (locked ? trialLockBadge() : undefined))),
    ]);

    // The fetched document, kept so a card click can preview without refetching.
    let loadedDoc: WizardTemplate | null = null;
    const docFor = (_slug: string) => loadedDoc;

    // Real thumbnail: fetch the document (server verifies it) and reuse the very same
    // renderer the installed cards use, so online and local look identical.
    loadRemoteTemplateDoc(t.slug).then((tpl) => {
      loadedDoc = tpl;
      thumb.innerHTML = '';
      const html = tpl ? buildTemplateThumbnail(tpl) : '';
      if (html) { thumb.innerHTML = html; fitThumbFrames(thumb); }
      else thumb.appendChild(icon(t.icon && t.icon.indexOf('fa-') === 0 ? t.icon : 'fa-wand-magic-sparkles'));
      addOverlay(tpl);
    });

    const doInstall = () => {
      // Trial: looking is free, keeping is not. The install endpoint refuses this too — the
      // client short-circuit exists so the user gets the Upgrade CTA instead of an error toast.
      if (locked) {
        showTrialUpgrade({
          title: wt('wiz.remote.trial_title', 'Online gallery is a premium feature'),
          message: wt('wiz.remote.trial_msg', 'Downloading templates from the online gallery needs a paid license. Upgrade to unlock it.'),
        });
        return;
      }
      if (t.installed) { wizardToast(wt('wiz.remote.already', 'Already installed')); return; }
      card.classList.add('mfwg-busy');
      wizardToast(wt('wiz.remote.installing', 'Installing…'));
      installRemoteTemplate(t.slug).then((res) => {
        card.classList.remove('mfwg-busy');
        if (res.trial) {
          showTrialUpgrade({
            title: wt('wiz.remote.trial_title', 'Online gallery is a premium feature'),
            message: wt('wiz.remote.trial_msg', 'Downloading templates from the online gallery needs a paid license. Upgrade to unlock it.'),
          });
          return;
        }
        if (!res.ok) { wizardToast(wt('wiz.remote.failed', 'Install failed') + ': ' + (res.error || ''), 'error'); return; }
        const art = res.assetsInstalled ? ' (' + res.assetsInstalled + ' ' + wt('wiz.remote.images', 'images') + ')' : '';
        wizardToast(wt('wiz.remote.done', 'Template installed') + ': ' + (t.title || t.slug) + art);
        if (res.assetsError) wizardToast(wt('wiz.remote.art_failed', 'Template installed, but its images could not be downloaded.'), 'error');
        // Refresh the local catalog so the new template shows under "Installed".
        resetTemplates();
        loadTemplates(() => { renderSources(); renderGrid(); });
      });
    };

    function addOverlay(tpl: WizardTemplate | null): void {
      if (t.installed) thumb.appendChild(h('span', { class: 'mfwg-badge-have', title: wt('wiz.remote.installed', 'Installed') }, [icon('fa-circle-check')]));
      // Locked still previews — that is the point of browse-only. The badge says why the card
      // will not install, it does not take the look away.
      if (locked) thumb.appendChild(h('span', { class: 'mfwg-lock', title: trialLockBadge(), 'aria-hidden': 'true' }, [icon('fa-lock')]));
      thumb.appendChild(h('div', { class: 'mfwg-thumb-ov' }, [
        h('button', {
          type: 'button', class: 'mfwg-peek', title: previewLabel, 'aria-label': previewLabel,
          onclick: (e: any) => {
            e.stopPropagation();
            if (tpl) openTemplatePreview(tpl, doInstall);
            else wizardToast(wt('wiz.remote.no_preview', 'Preview is unavailable for this template.'), 'error');
          },
        }, [icon('fa-eye')]),
      ]));
    }

    // [TrialBrowse 2026-07-24] On a browse-only install, clicking the CARD opens the preview —
    // the upgrade prompt lives on "Use this template" inside it. Nagging on the first click
    // meant a trial user could never actually look at what they were being sold.
    const onCardClick = () => {
      if (!locked) { doInstall(); return; }
      const tpl = docFor(t.slug);
      if (tpl) openTemplatePreview(tpl, doInstall);
      else wizardToast(wt('wiz.remote.no_preview', 'Preview is unavailable for this template.'), 'error');
    };
    card.addEventListener('click', onCardClick);
    card.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(); } });
    return card;
  }

  function renderGrid(): void {
    const st = templatesState();
    grid.innerHTML = '';

    if (source === 'online') {
      const note = (msg: string, spin?: boolean) => grid.appendChild(h('div', { class: 'mfwg-empty' }, spin ? [icon('fa-spinner fa-spin'), document.createTextNode(' ' + msg)] : msg));
      if (remoteState === 'loading' || remoteState === 'idle') { note(wt('wiz.remote.loading', 'Contacting the gallery…'), true); return; }
      if (remoteState === 'trial') { note(wt('wiz.remote.trial_msg', 'Downloading templates from the online gallery needs a paid license. Upgrade to unlock it.')); return; }
      if (remoteState === 'error') { note(wt('wiz.remote.unavailable', 'The online gallery is unreachable right now. Try again later.')); return; }
      if (remoteOffline) grid.appendChild(h('div', { class: 'mfwg-empty', style: 'grid-column:1/-1;padding:10px 0' }, wt('wiz.remote.offline', 'The gallery is unreachable — showing the last list fetched earlier.')));
      const rq = query.trim().toLowerCase();
      const ritems = remote.filter((t) => {
        if (activeCat !== 'all' && (t.category || 'general').toLowerCase() !== activeCat) return false;
        if (rq && !((t.title || '') + ' ' + (t.description || '') + ' ' + (t.category || '')).toLowerCase().includes(rq)) return false;
        return true;
      });
      if (!ritems.length) { note(wt('wiz.gallery.no_match', 'No templates match your search.')); return; }
      ritems.forEach((t) => grid.appendChild(renderOnlineCard(t)));
      return;
    }

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
      // [TrialBrowse 2026-07-24] Clicking a locked card opens the PREVIEW, not the upgrade
      // prompt — you have to be able to see the design you are being asked to pay for.
      // `pick` (the upgrade prompt when locked) stays on "Use this template" inside it.
      const activate = locked ? () => openTemplatePreview(t, pick) : pick;
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
      if (locked) thumb.appendChild(h('span', { class: 'mfwg-lock', title: trialLockBadge(), 'aria-hidden': 'true' }, [icon('fa-lock')]));
      // [TrialBrowse 2026-07-24] A locked card can still be PREVIEWED — same rule as the online
      // tab. Previously the eye button also fired the Upgrade CTA, so a trial user could never
      // see what they were being asked to pay for. "Use this template" inside the preview is
      // still `pick`, which is the upgrade prompt when locked.
      thumb.appendChild(h('div', { class: 'mfwg-thumb-ov' }, [
        h('button', { type: 'button', class: 'mfwg-peek', title: previewLabel, 'aria-label': previewLabel, onclick: (e: any) => { e.stopPropagation(); openTemplatePreview(t, pick); } }, [icon('fa-eye')]),
      ]));
      grid.appendChild(h('div', {
        class: 'mfwg-card' + (locked ? ' mfwg-locked' : ''), role: 'button', tabindex: '0', onclick: activate,
        onkeydown: (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } },
      }, [
        thumb,
        cardCaption(t.title, metaLine(t.category, t.fieldCount, locked ? trialLockBadge() : undefined)),
      ]));
    });
    // Size every live thumbnail to its card now that the grid is laid out.
    fitThumbFrames(grid);
  }

  searchInput.addEventListener('input', () => { query = searchInput.value; renderGrid(); });
  document.body.appendChild(ov);
  renderSources(); renderCats(); renderGrid();
  // Ensure the catalog is loading; repaint when it lands.
  if (templatesState().status === 'idle' || templatesState().status === 'loading') {
    loadTemplates(() => { renderCats(); renderGrid(); });
  }
  setTimeout(() => { try { searchInput.focus(); } catch { /* */ } }, 0);
}

function stripBom(s: string): string { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

/** Open a file picker for a MegaForm export .json and hand back a WizardTemplate. */
/** Turns raw JSON text into a wizard template, or complains in the user's own words. */
function loadFromText(text: string, onLoaded: (t: WizardTemplate) => void): void {
  let raw: any;
  try { raw = JSON.parse(stripBom(text)); }
  catch { wizardToast(wt('wiz.import_invalid', 'That file is not valid JSON.'), 'error'); return; }
  const t = wizardTemplateFromJson(raw);
  if (!t) { wizardToast(wt('wiz.import_nofields', 'No form fields found in that JSON — export a form/template from MegaForm.'), 'error'); return; }
  onLoaded(t);
}

/**
 * One click, one file picker — the direct path, and the one people expect.
 *
 * It has a failure mode worth knowing about: when the browser is driven over the DevTools protocol
 * (an automation or AI extension attached to the tab), file choosers are intercepted, the native
 * dialog never appears, and this button looks dead with nothing in the console. That is what
 * openImportJsonPaste is for — see the "paste JSON" link beside the button.
 */
export function openImportJson(onLoaded: (t: WizardTemplate) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    if (!f) { cleanup(); return; }
    const reader = new FileReader();
    reader.onload = () => { cleanup(); loadFromText(String(reader.result || ''), onLoaded); };
    reader.onerror = () => { cleanup(); wizardToast(wt('wiz.import_read_err', 'Could not read that file.'), 'error'); };
    reader.readAsText(f);
  });
  function cleanup(): void { try { input.remove(); } catch { /* */ } }
  document.body.appendChild(input);
  input.click();
}

/** The escape hatch: choose a file, drop one, or paste the JSON — none of which needs a native dialog. */
export function openImportJsonPaste(onLoaded: (t: WizardTemplate) => void): void {
  openImportJsonDialog({
    t: (key, fallback) => wt(key, fallback),
    onText: (text) => loadFromText(text, onLoaded),
  });
}
