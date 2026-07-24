// [GalleryRepo v20260724] "Browse online" panel for the Template Gallery.
//
// Premium templates (and their artwork) no longer ship inside the module package —
// they live in a static gallery repository (GitHub Pages). This panel lists what the
// repo offers and installs a chosen template into the LOCAL catalog via the server
// (the browser never talks to the repo: the host fetches + sha256-verifies it).
//
// Licensed feature: the server answers 402 on a trial install, and we surface the
// existing Upgrade CTA rather than a raw HTTP error.
import { h, icon, wt, wizardToast } from './ui';
import { getPlatformHostConfig } from '@shared/platform-host';
import { showTrialUpgrade } from '@shared/trial';
import { wizardCtx } from './save';

export interface RemoteTemplate {
  slug: string;
  title: string;
  description: string;
  category: string;
  version: string;
  sizeBytes: number;
  assetsSizeBytes?: number;
  installed: boolean;
}

// Same base + auth shape the wizard already uses for BuilderTemplates/List, so DNN and
// Oqtane share one code path (the server routes were aligned to the same suffix).
function apiUrl(action: string): string {
  const cfg: any = getPlatformHostConfig() || {};
  const platform = String(cfg.platform || '').toLowerCase();
  const base = cfg.apiBase || '/api/MegaForm/';
  let url = base + 'BuilderTemplates/' + action;
  const ctx = wizardCtx();
  if (platform === 'oqtane') {
    const qs: string[] = [];
    if (ctx.moduleId > 0) qs.push('authmoduleid=' + ctx.moduleId);
    if (ctx.siteId > 0) qs.push('authsiteid=' + ctx.siteId);
    if (qs.length) url += '?' + qs.join('&');
  } else if (platform === 'dnn') {
    url += '?portalId=' + (Number(cfg.portalId != null ? cfg.portalId : 0) || 0);
  }
  return url;
}

function authHeaders(json: boolean): Record<string, string> {
  const cfg: any = getPlatformHostConfig() || {};
  const platform = String(cfg.platform || '').toLowerCase();
  const hd: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  if (json) hd['Content-Type'] = 'application/json';
  if (platform === 'oqtane') {
    const bearer = (window as any).__MF_TOKEN;
    if (bearer) hd['Authorization'] = 'Bearer ' + bearer;
    const ctx = wizardCtx();
    if (ctx.moduleId > 0) hd['X-OQTANE-MODULEID'] = String(ctx.moduleId);
    if (ctx.siteId > 0) hd['X-OQTANE-SITEID'] = String(ctx.siteId);
    if (Number(cfg.aliasId || 0) > 0) hd['X-OQTANE-ALIASID'] = String(cfg.aliasId);
  } else if (platform === 'dnn') {
    try {
      const sf = (window as any).jQuery?.ServicesFramework?.(cfg.instanceId || cfg.moduleId || 0);
      if (sf) hd['RequestVerificationToken'] = sf.getAntiForgeryValue();
    } catch { /* token stays absent; the server will reject and we surface a message */ }
  }
  return hd;
}

function kb(n: number): string {
  if (!n) return '';
  return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
}

let cssDone = false;
function ensureCss(): void {
  if (cssDone || document.getElementById('mfrg-style')) { cssDone = true; return; }
  cssDone = true;
  const s = document.createElement('style');
  s.id = 'mfrg-style';
  s.textContent = `
  .mfrg-ov{position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Inter',system-ui,sans-serif}
  .mfrg-modal{width:min(880px,96vw);height:min(680px,90vh);background:#fff;border-radius:16px;box-shadow:0 30px 80px rgba(15,23,42,.4);display:flex;flex-direction:column;overflow:hidden}
  .mfrg-hd{display:flex;align-items:center;gap:12px;padding:15px 20px;border-bottom:1px solid #eef2f6}
  .mfrg-hd h3{margin:0;font-size:16px;font-weight:800;color:#0f172a}
  .mfrg-src{font-size:11px;color:#94a3b8;margin-left:auto;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mfrg-x{width:34px;height:34px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#64748b;cursor:pointer}
  .mfrg-body{flex:1;overflow-y:auto;padding:14px 20px}
  .mfrg-row{display:flex;align-items:center;gap:12px;padding:11px 12px;border:1px solid #e5e7eb;border-radius:11px;margin-bottom:9px}
  .mfrg-row h4{margin:0 0 2px;font-size:14px;font-weight:700;color:#0f172a}
  .mfrg-row p{margin:0;font-size:12px;color:#64748b;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .mfrg-meta{font-size:11px;color:#94a3b8;margin-top:3px}
  .mfrg-grow{flex:1;min-width:0}
  .mfrg-btn{flex:0 0 auto;height:34px;padding:0 14px;border:0;border-radius:9px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:700;font-size:12px;cursor:pointer}
  .mfrg-btn[disabled]{opacity:.55;cursor:default}
  .mfrg-have{flex:0 0 auto;font-size:12px;font-weight:700;color:#059669;display:inline-flex;align-items:center;gap:6px}
  .mfrg-note{color:#94a3b8;font-size:13px;text-align:center;padding:40px 12px;line-height:1.6}
  .mfrg-warn{margin:0 0 12px;padding:9px 12px;border-radius:9px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px}
  `;
  document.head.appendChild(s);
}

/** Opens the online gallery. onInstalled fires after a successful install so the caller
 *  can refresh its local catalog. */
export function openRemoteGallery(onInstalled?: () => void): void {
  ensureCss();
  if (document.getElementById('mfrg-ov')) return;

  const body = h('div', { class: 'mfrg-body' });
  const srcLabel = h('span', { class: 'mfrg-src' });
  const ov = h('div', { class: 'mfrg-ov', id: 'mfrg-ov' }, [
    h('div', { class: 'mfrg-modal', onclick: (e: any) => e.stopPropagation() }, [
      h('div', { class: 'mfrg-hd' }, [
        icon('fa-cloud-arrow-down'),
        h('h3', null, [document.createTextNode(wt('wiz.remote.title', 'Online template gallery'))]),
        srcLabel,
        h('button', { class: 'mfrg-x', title: wt('wiz.gallery.close', 'Close'), onclick: close }, [icon('fa-times')]),
      ]),
      body,
    ]),
  ]);
  ov.addEventListener('click', close);
  function close(): void { try { ov.remove(); } catch { /* */ } document.removeEventListener('keydown', onKey, true); }
  function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(ov);

  function note(msg: string): void { body.innerHTML = ''; body.appendChild(h('div', { class: 'mfrg-note' }, msg)); }

  note(wt('wiz.remote.loading', 'Contacting the gallery…'));

  fetch(apiUrl('RemoteGalleryList'), { method: 'GET', credentials: 'same-origin', headers: authHeaders(false) })
    .then(async (r) => {
      if (r.status === 402) {
        close();
        showTrialUpgrade({
          title: wt('wiz.remote.trial_title', 'Online gallery is a premium feature'),
          message: wt('wiz.remote.trial_msg', 'Downloading templates from the online gallery needs a paid license. Upgrade to unlock it.'),
        });
        return null;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then((data: any) => {
      if (!data) return;
      srcLabel.textContent = String(data.repoUrl || '');
      const list: RemoteTemplate[] = Array.isArray(data.templates) ? data.templates : [];
      render(list, !!data.offline);
    })
    .catch(() => note(wt('wiz.remote.unavailable', 'The online gallery is unreachable right now. Check the gallery URL setting, or try again later.')));

  function render(list: RemoteTemplate[], offline: boolean): void {
    body.innerHTML = '';
    if (offline) {
      body.appendChild(h('div', { class: 'mfrg-warn' }, wt('wiz.remote.offline', 'The gallery is unreachable — showing the last list fetched earlier.')));
    }
    if (!list.length) { note(wt('wiz.remote.empty', 'The gallery has no templates yet.')); return; }

    list.forEach((t) => {
      const btn = h('button', { class: 'mfrg-btn' }, wt('wiz.remote.install', 'Install')) as HTMLButtonElement;
      const right = t.installed
        ? h('span', { class: 'mfrg-have' }, [icon('fa-circle-check'), document.createTextNode(wt('wiz.remote.installed', 'Installed'))])
        : btn;

      const totalBytes = (t.sizeBytes || 0) + (t.assetsSizeBytes || 0);
      const meta = [t.category, t.version ? 'v' + t.version : '', kb(totalBytes)].filter(Boolean).join(' · ');

      body.appendChild(h('div', { class: 'mfrg-row' }, [
        h('div', { class: 'mfrg-grow' }, [
          h('h4', null, t.title || t.slug),
          h('p', null, t.description || ''),
          h('div', { class: 'mfrg-meta' }, meta),
        ]),
        right,
      ]));

      if (!t.installed) {
        btn.addEventListener('click', () => {
          btn.disabled = true;
          btn.textContent = wt('wiz.remote.installing', 'Installing…');
          fetch(apiUrl('RemoteGalleryInstall'), {
            method: 'POST', credentials: 'same-origin',
            headers: authHeaders(true), body: JSON.stringify({ slug: t.slug }),
          })
            .then(async (r) => {
              if (r.status === 402) {
                close();
                showTrialUpgrade({
                  title: wt('wiz.remote.trial_title', 'Online gallery is a premium feature'),
                  message: wt('wiz.remote.trial_msg', 'Downloading templates from the online gallery needs a paid license. Upgrade to unlock it.'),
                });
                return null;
              }
              const j = await r.json().catch(() => null);
              if (!r.ok) throw new Error((j && j.message) || ('HTTP ' + r.status));
              return j;
            })
            .then((j: any) => {
              if (!j) return;
              t.installed = true;
              const artNote = j.assetsInstalled ? ' (' + j.assetsInstalled + ' ' + wt('wiz.remote.images', 'images') + ')' : '';
              wizardToast(wt('wiz.remote.done', 'Template installed') + ': ' + (t.title || t.slug) + artNote);
              if (j.assetsError) wizardToast(wt('wiz.remote.art_failed', 'Template installed, but its images could not be downloaded.'));
              render(list, offline);
              if (onInstalled) { try { onInstalled(); } catch { /* */ } }
            })
            .catch((e: any) => {
              btn.disabled = false;
              btn.textContent = wt('wiz.remote.install', 'Install');
              wizardToast(wt('wiz.remote.failed', 'Install failed') + ': ' + (e && e.message ? e.message : ''));
            });
        });
      }
    });
  }
}
