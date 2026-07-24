// [GalleryRepo v20260724] Online source for the Template Gallery.
//
// Premium templates (and their artwork) are served from the gallery repository rather
// than shipped in the package. This module is the DATA layer for that source: it lists
// what the repo offers, lazily fetches a single template so the gallery can render a
// REAL thumbnail/preview (rather than making the user install blind), and installs.
//
// The browser never talks to the repository: every call goes through the host, which
// downloads, sha256-verifies and validates server-side. The repo URL is deliberately
// NOT surfaced in the UI — it is an implementation detail of where the catalog lives.
import { getPlatformHostConfig } from '@shared/platform-host';
import { wizardCtx } from './save';
import { WizardTemplate, wizardTemplateFromJson } from './templates';

export interface RemoteTemplate {
  slug: string;
  title: string;
  description: string;
  category: string;
  categories?: string[];
  icon?: string;
  version: string;
  sizeBytes: number;
  assetsSizeBytes?: number;
  installed: boolean;
}

export interface RemoteListResult {
  ok: boolean;
  /** [TrialBrowse 2026-07-24] Browse-only: the catalog IS returned, but installing is refused.
   *  (A 402 here means an older server that gated the whole listing — then `ok` is false too.) */
  trial?: boolean;
  offline?: boolean;
  error?: string;
  templates: RemoteTemplate[];
}

// Same base + auth shape the wizard already uses for BuilderTemplates/List, so DNN and
// Oqtane share one code path (the server routes use the same suffix on both).
function apiUrl(action: string, query?: string): string {
  const cfg: any = getPlatformHostConfig() || {};
  const platform = String(cfg.platform || '').toLowerCase();
  const base = cfg.apiBase || '/api/MegaForm/';
  let url = base + 'BuilderTemplates/' + action;
  const qs: string[] = [];
  const ctx = wizardCtx();
  if (platform === 'oqtane') {
    if (ctx.moduleId > 0) qs.push('authmoduleid=' + ctx.moduleId);
    if (ctx.siteId > 0) qs.push('authsiteid=' + ctx.siteId);
  } else if (platform === 'dnn') {
    qs.push('portalId=' + (Number(cfg.portalId != null ? cfg.portalId : 0) || 0));
  }
  if (query) qs.push(query);
  if (qs.length) url += '?' + qs.join('&');
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
    } catch { /* server rejects and we surface a message */ }
  }
  return hd;
}

let _cache: RemoteListResult | null = null;

/** Lists the online catalog. Cached for the lifetime of the page; pass force to refetch. */
export async function loadRemoteTemplates(force?: boolean): Promise<RemoteListResult> {
  if (_cache && !force) return _cache;
  try {
    const r = await fetch(apiUrl('RemoteGalleryList'), { method: 'GET', credentials: 'same-origin', headers: authHeaders(false) });
    // 402 = a server old enough to gate the whole listing. Newer servers return the catalog
    // with trial:true so a trial install can still browse it.
    if (r.status === 402) { _cache = { ok: false, trial: true, templates: [] }; return _cache; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    _cache = {
      ok: true,
      trial: !!j.trial,
      offline: !!j.offline,
      templates: Array.isArray(j.templates) ? j.templates : [],
    };
    return _cache;
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'unreachable', templates: [] };
  }
}

export function markRemoteInstalled(slug: string): void {
  if (!_cache) return;
  const t = _cache.templates.find((x) => x.slug === slug);
  if (t) t.installed = true;
}

export function resetRemoteCache(): void { _cache = null; }

// ── per-template document (for real thumbnails + preview) ────────────────────
const _docs = new Map<string, WizardTemplate | null>();
const _inflight = new Map<string, Promise<WizardTemplate | null>>();

/**
 * Fetches ONE template document and converts it with the same helper used for an
 * uploaded .json, so the gallery can build a genuine thumbnail/preview. Results are
 * memoised (including failures as null) so scrolling never refetches.
 */
export function loadRemoteTemplateDoc(slug: string): Promise<WizardTemplate | null> {
  if (_docs.has(slug)) return Promise.resolve(_docs.get(slug) || null);
  const existing = _inflight.get(slug);
  if (existing) return existing;

  const p = fetch(apiUrl('RemoteGalleryPreview', 'slug=' + encodeURIComponent(slug)), {
    method: 'GET', credentials: 'same-origin', headers: authHeaders(false),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((doc) => {
      const tpl = doc ? wizardTemplateFromJson(doc) : null;
      _docs.set(slug, tpl);
      return tpl;
    })
    .catch(() => { _docs.set(slug, null); return null; })
    .finally(() => { _inflight.delete(slug); });

  _inflight.set(slug, p);
  return p;
}

export interface InstallResult {
  ok: boolean;
  trial?: boolean;
  error?: string;
  assetsInstalled?: number;
  assetsError?: string;
}

export async function installRemoteTemplate(slug: string): Promise<InstallResult> {
  try {
    const r = await fetch(apiUrl('RemoteGalleryInstall'), {
      method: 'POST', credentials: 'same-origin',
      headers: authHeaders(true), body: JSON.stringify({ slug }),
    });
    if (r.status === 402) return { ok: false, trial: true };
    const j = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: (j && j.message) || ('HTTP ' + r.status) };
    markRemoteInstalled(slug);
    return { ok: true, assetsInstalled: j && j.assetsInstalled, assetsError: j && j.assetsError };
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'install failed' };
  }
}
