// [2026-06-27 ④ real roles/users] Site-level principal catalog for the wizard's
// Workflow step. Fetches the REAL Oqtane/DNN roles + users via
// `GET /api/MegaForm/Permissions/Catalog?formId=0` (the server now returns a
// site-level catalog when formId<=0 — the wizard has no formId yet). Uses the same
// auth context as save.ts (the wizard's POST already authenticates this way).
//
// Degrades gracefully: on any error (e.g. an older server DLL that still 400s on
// formId=0) the cache lands in 'error' state and the Workflow step falls back to the
// static APPROVAL_ROLES suggestion list + freetext — so the wizard always works.
import { getPlatformHostConfig } from '@shared/platform-host';
import { wizardCtx } from './save';

export interface SitePrincipals {
  status: 'idle' | 'loading' | 'ok' | 'error';
  roles: string[];
  users: string[];
}

let _cache: SitePrincipals = { status: 'idle', roles: [], users: [] };
let _promise: Promise<SitePrincipals> | null = null;

function catalogUrl(): string {
  const cfg: any = getPlatformHostConfig() || {};
  const platform = String(cfg.platform || '').toLowerCase();
  const base = cfg.apiBase || '/api/MegaForm/';
  let url = base + 'Permissions/Catalog?formId=0';
  const ctx = wizardCtx();
  if (platform === 'oqtane') {
    if (ctx.moduleId > 0) url += '&authmoduleid=' + ctx.moduleId;
    if (ctx.siteId > 0) url += '&authsiteid=' + ctx.siteId;
  } else if (platform === 'dnn') {
    const pid = Number(cfg.portalId != null ? cfg.portalId : 0) || 0;
    url += '&portalId=' + pid;
  }
  return url;
}

function catalogHeaders(): Record<string, string> {
  const cfg: any = getPlatformHostConfig() || {};
  const platform = String(cfg.platform || '').toLowerCase();
  const h: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  if (platform === 'oqtane') {
    const bearer = (window as any).__MF_TOKEN;
    if (bearer) h['Authorization'] = 'Bearer ' + bearer;
    const ctx = wizardCtx();
    if (ctx.moduleId > 0) h['X-OQTANE-MODULEID'] = String(ctx.moduleId);
    if (ctx.siteId > 0) h['X-OQTANE-SITEID'] = String(ctx.siteId);
    if (Number(cfg.aliasId || 0) > 0) h['X-OQTANE-ALIASID'] = String(cfg.aliasId);
  } else if (platform === 'dnn') {
    try {
      const sf = (window as any).jQuery?.ServicesFramework?.(cfg.instanceId || cfg.moduleId || 0);
      if (sf) h['RequestVerificationToken'] = sf.getAntiForgeryValue();
    } catch { /* */ }
  }
  return h;
}

// Both casings: DNN's older WebApi serializes PascalCase; Web/Oqtane use camelCase.
function pick(obj: any, ...keys: string[]): any {
  if (obj == null) return undefined;
  for (const k of keys) if (obj[k] != null) return obj[k];
  return undefined;
}

function parsePrincipals(payload: any): SitePrincipals {
  const catalog = pick(payload, 'catalog', 'Catalog') || {};
  const principals = pick(catalog, 'principals', 'Principals') || [];
  const roles: string[] = [];
  const users: string[] = [];
  const seenR: Record<string, boolean> = {};
  const seenU: Record<string, boolean> = {};
  for (const p of principals) {
    if (!p) continue;
    const isRole = !!pick(p, 'isRole', 'IsRole');
    const isUser = !!pick(p, 'isUser', 'IsUser');
    if (isRole) {
      // selection key matches wf-principal-picker: roleName || principalId || displayName
      const name = String(pick(p, 'roleName', 'RoleName') || pick(p, 'principalId', 'PrincipalId') || pick(p, 'displayName', 'DisplayName') || '').trim();
      if (name && !seenR[name.toLowerCase()]) { seenR[name.toLowerCase()] = true; roles.push(name); }
    } else if (isUser) {
      const name = String(pick(p, 'displayName', 'DisplayName') || pick(p, 'principalId', 'PrincipalId') || '').trim();
      if (name && !seenU[name.toLowerCase()]) { seenU[name.toLowerCase()] = true; users.push(name); }
    }
  }
  return { status: 'ok', roles, users };
}

/**
 * Load the site catalog once (cached). `onReady` fires when the catalog reaches a
 * terminal state (ok/error) — used by the Workflow step to repaint with real data.
 */
export function loadSiteCatalog(onReady?: () => void): Promise<SitePrincipals> {
  if (_cache.status === 'ok' || _cache.status === 'error') {
    if (onReady) onReady();
    return Promise.resolve(_cache);
  }
  if (_promise) {
    if (onReady) _promise.then(onReady, onReady);
    return _promise;
  }
  _cache = { status: 'loading', roles: [], users: [] };
  _promise = fetch(catalogUrl(), { method: 'GET', credentials: 'same-origin', headers: catalogHeaders() })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((j) => { _cache = parsePrincipals(j); return _cache; })
    .catch(() => { _cache = { status: 'error', roles: [], users: [] }; return _cache; });
  if (onReady) _promise.then(onReady, onReady);
  return _promise;
}

export function siteCatalog(): SitePrincipals { return _cache; }

// Reset on each wizard open so a session that started before the server DLL was
// deployed will retry the (now working) endpoint on the next open.
export function resetSiteCatalog(): void {
  _cache = { status: 'idle', roles: [], users: [] };
  _promise = null;
}
