// [2026-06-27] POST the wizard DTO to SaveForm, then return the builder URL to open the
// new form fully populated. Reuses @shared/platform-host. The Oqtane builder surface is
// reached via `?mfpanel=builder&formId=N` (verified on :5000 — `/builder?formId=` 404s).
import { getPlatformHostConfig } from '@shared/platform-host';
import { WizardSaveCtx } from './transform';

export function wizardCtx(): WizardSaveCtx {
  const cfg: any = getPlatformHostConfig() || {};
  let moduleId = Number(cfg.moduleId || 0);
  let siteId = Number(cfg.siteId || cfg.portalId || 0);
  // Fallback: recover from #mf-dashboard-root data-* (matches ai-form-creator platformCfg()).
  try {
    const root = document.getElementById('mf-dashboard-root') || document.querySelector('[data-mf-module-id]');
    if (root) {
      if (!moduleId) moduleId = Number(root.getAttribute('data-mf-module-id') || root.getAttribute('data-module-id') || 0);
      if (!siteId) siteId = Number(root.getAttribute('data-mf-site-id') || root.getAttribute('data-site-id') || 0);
    }
  } catch { /* ignore */ }
  return { moduleId, siteId };
}

function saveUrl(): string {
  const cfg: any = getPlatformHostConfig() || {};
  const platform = String(cfg.platform || '').toLowerCase();
  const base = cfg.apiBase || '/api/MegaForm/';
  let url = platform === 'oqtane' ? base + 'Form' : base + 'Form/Save';
  const ctx = wizardCtx();
  if (platform === 'oqtane') {
    const qs: string[] = [];
    if (ctx.moduleId > 0) qs.push('authmoduleid=' + ctx.moduleId);
    if (ctx.siteId > 0) qs.push('authsiteid=' + ctx.siteId);
    if (qs.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
  } else if (platform === 'dnn') {
    const pid = Number(cfg.portalId != null ? cfg.portalId : 0) || 0;
    url += (url.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + pid;
  }
  return url;
}

function saveHeaders(): Record<string, string> {
  const cfg: any = getPlatformHostConfig() || {};
  const platform = String(cfg.platform || '').toLowerCase();
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
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

export async function postWizardForm(dto: any): Promise<{ ok: boolean; formId?: number; status: number; text: string }> {
  try {
    const r = await fetch(saveUrl(), { method: 'POST', credentials: 'same-origin', headers: saveHeaders(), body: JSON.stringify(dto) });
    const text = await r.text();
    let formId = 0;
    try { const j = JSON.parse(text); formId = Number(j.formId || j.FormId || 0); } catch { /* */ }
    return { ok: r.ok && formId > 0, formId, status: r.status, text: text.slice(0, 300) };
  } catch (e: any) {
    return { ok: false, status: 0, text: 'fetch-throw: ' + String(e && e.message || e) };
  }
}

export function builderUrlFor(formId: number): string {
  try {
    const url = new URL(window.location.href);
    url.search = ''; url.hash = '';
    url.searchParams.set('mfpanel', 'builder');
    url.searchParams.set('formId', String(formId));
    return url.pathname + url.search;
  } catch {
    return (window.location.pathname || '/') + '?mfpanel=builder&formId=' + formId;
  }
}
