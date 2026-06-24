import { getPlatformHostConfig } from '@shared/platform-host';

export interface PermissionsContext {
  formId: number;
  platform: string;
  apiBase: string;
  moduleId: number;
  siteId: number;
  aliasId: number;
  tabId: number;
  bearerToken: string;
  servicesFramework: any;
}

function parsePositiveInt(value: any): number {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getBuilderRoot(): HTMLElement | null {
  return document.getElementById('mf-builder-root') as HTMLElement | null;
}

function getServicesFramework(): any {
  const builderCfg = (window as any).MegaFormBuilder && (window as any).MegaFormBuilder._config;
  if (builderCfg && builderCfg.servicesFramework) return builderCfg.servicesFramework;
  if ((window as any).WebSF) return (window as any).WebSF;
  return null;
}

function normalizeApiBase(apiBase?: string): string {
  const raw = String(apiBase || '/api/MegaForm/').trim() || '/api/MegaForm/';
  return raw.endsWith('/') ? raw : raw + '/';
}

function getBearerToken(): string {
  const hostToken = (window as any).__MF_PLATFORM__ && (window as any).__MF_PLATFORM__.authToken;
  return String(hostToken || (window as any).__MF_TOKEN || '').trim();
}

export function getPermissionsContext(): PermissionsContext {
  const cfg = getPlatformHostConfig();
  const root = getBuilderRoot();
  const ds = root ? root.dataset : ({} as DOMStringMap);
  return {
    formId: parsePositiveInt(ds.formId || (window as any).FORM_ID || cfg.formId),
    platform: String((cfg.platform || ds.platform || 'aspcore')).toLowerCase(),
    apiBase: normalizeApiBase(cfg.apiBase || ds.apiBase),
    moduleId: parsePositiveInt(ds.moduleId || cfg.moduleId),
    siteId: parsePositiveInt(ds.siteId || ds.portalId || cfg.portalId),
    aliasId: parsePositiveInt(ds.aliasId || ''),
    tabId: parsePositiveInt(ds.tabId || cfg.tabId),
    bearerToken: getBearerToken(),
    servicesFramework: getServicesFramework(),
  };
}

export function withOqtaneAuthQuery(url: string, ctx: PermissionsContext): string {
  if (!ctx || ctx.platform !== 'oqtane') return url;
  const qs: string[] = [];
  if (ctx.moduleId > 0) qs.push('authmoduleid=' + encodeURIComponent(String(ctx.moduleId)));
  if (ctx.siteId > 0) qs.push('authsiteid=' + encodeURIComponent(String(ctx.siteId)));
  if (!qs.length) return url;
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
}

export function buildRequestHeaders(ctx: PermissionsContext, includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers['Content-Type'] = 'application/json';

  if (ctx.platform === 'dnn' && ctx.servicesFramework) {
    headers['ModuleId'] = String(ctx.moduleId || 0);
    headers['TabId'] = String(ctx.tabId || 0);
    try {
      const token = ctx.servicesFramework.getAntiForgeryValue && ctx.servicesFramework.getAntiForgeryValue();
      if (token) headers['RequestVerificationToken'] = String(token);
    } catch (_error) { }
    return headers;
  }

  headers['X-Requested-With'] = 'XMLHttpRequest';
  if (ctx.bearerToken) headers['Authorization'] = 'Bearer ' + ctx.bearerToken;

  if (ctx.platform === 'oqtane') {
    if (ctx.moduleId > 0) headers['X-OQTANE-MODULEID'] = String(ctx.moduleId);
    if (ctx.siteId > 0) headers['X-OQTANE-SITEID'] = String(ctx.siteId);
    if (ctx.aliasId > 0) headers['X-OQTANE-ALIASID'] = String(ctx.aliasId);
  }

  return headers;
}

