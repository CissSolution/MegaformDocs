/**
 * MegaForm AI Form Assistant — admin settings panel.
 *
 * Provides a dedicated, full-size config page (vs the small modal embedded
 * inside the chat bubble). Mounts into any container with
 * `data-mf-ai-settings="1"` — Web/Razor admin pages can drop a div with
 * that attribute and the bundle fills it in.
 *
 * Persists to the server side via the AiAssistant DefaultConfig endpoint
 * (DNN ResolveTargetPortalId or Oqtane site setting) instead of (just)
 * localStorage so the value applies to every browser on the site.
 *
 * Exposes window.MFAI_Settings = { mount(hostId), saveToServer(cfg) }.
 */

import type { AIConfig, MfAiApi } from './providers';
import { t as i18nT } from '@i18n';

const SETTINGS_BADGE = 'MfAiSettings v20260527-05';

// [i18n] Localize the AI settings panel chrome (embedded catalog → global → English).
function T(key: string, fallback: string): string {
  try { const v = i18nT(key); if (v && v !== key) return String(v); } catch { /* embedded n/a */ }
  try { const I = (window as any).MegaFormI18n; if (I && typeof I.t === 'function') { const v = I.t(key); if (v && v !== key) return String(v); } } catch { /* global n/a */ }
  return fallback;
}

function getApi(): MfAiApi | null {
  return (window as any).MF_AI || null;
}

function esc(s: string): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function aiAssistantDefaultConfigUrl(): string {
  const w = window as any;
  const pf = (w.__MF_PLATFORM__ || {}) as any;
  const platform = String(pf.platform || '').toLowerCase();
  // [B51] Robust Oqtane detection so providers IIFE fires correct URL even
  // when __MF_PLATFORM__ AddHeadContent hasn't been read yet at script load.
  const isOqtane = (platform === 'oqtane')
    || !!w.Oqtane
    || !!w.__OQTANE__
    || !!document.querySelector('[data-mf-platform="oqtane"]');
  if (isOqtane) return '/api/AiAssistant/DefaultConfig';
  const apiBase = String(pf.apiBase || '/DesktopModules/MegaForm/API/').replace(/\/?$/, '/');
  return apiBase + 'AiAssistant/DefaultConfig';
}

function withPortalIdQuery(url: string): string {
  if (/[?&]portalId=/i.test(url)) return url;
  const pf = ((window as any).__MF_PLATFORM__ || {}) as any;
  const platform = String(pf.platform || '').toLowerCase();
  if (platform === 'oqtane') return url;
  const raw = pf.portalId !== undefined ? pf.portalId : pf.PortalId;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '0' : raw), 10);
  const pid = isFinite(n) && n >= 0 ? n : 0;
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + pid;
}

function antiForgeryToken(): string {
  try {
    const sf = (window as any).jQuery?.ServicesFramework?.(0);
    if (sf && typeof sf.getAntiForgeryValue === 'function') {
      return String(sf.getAntiForgeryValue() || '');
    }
  } catch { /* ignore */ }
  return '';
}

async function saveToServer(cfg: AIConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = antiForgeryToken();
    if (token) headers['RequestVerificationToken'] = token;
    const r = await fetch(withPortalIdQuery(aiAssistantDefaultConfigUrl()), {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        apiKey: cfg.apiKey || '',
      }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { ok: false, message: 'HTTP ' + r.status + ' ' + txt.slice(0, 200) };
    }
    return { ok: true, message: 'Saved to server.' };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

function renderPanelHtml(): string {
  return [
    '<section class="mf-ai-admin-panel" style="background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:18px 20px;max-width:680px;font:13px/1.5 system-ui,-apple-system,sans-serif;color:#0f172a;">',
    '<header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">',
    '<h3 style="margin:0;font-size:16px;">' + esc(T('ai.settings_title', 'AI Form Assistant — Site defaults')) + '</h3>',
    '<span style="font-size:11px;color:#64748b;">' + esc(SETTINGS_BADGE) + '</span>',
    '</header>',
    '<p style="margin:0 0 14px;color:#475569;font-size:12px;">' + esc(T('ai.settings_help', 'These defaults are shared across every admin on this site. Each browser may still override via the cog icon inside the AI chat bubble. The API key is encrypted at rest and only returned to administrators.')) + '</p>',
    '<div id="mf-ai-admin-form-host"></div>',
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;">',
    '  <div id="mf-ai-admin-status" style="font-size:12px;"></div>',
    '  <div style="display:flex;gap:6px;">',
    '    <button type="button" id="mf-ai-admin-test" style="padding:8px 14px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer;">' + esc(T('ai.settings_test', 'Test connection')) + '</button>',
    '    <button type="button" id="mf-ai-admin-save-local" style="padding:8px 14px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer;" title="' + esc(T('ai.settings_save_local_tip', 'Apply only to this browser')) + '">' + esc(T('ai.settings_save_local', 'Save (local)')) + '</button>',
    '    <button type="button" id="mf-ai-admin-save-server" style="padding:8px 14px;background:#4f46e5;color:#fff;border:0;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;" title="' + esc(T('ai.settings_save_site_tip', 'Persist on the server for every admin on this site')) + '">' + esc(T('ai.settings_save_site', 'Save to site')) + '</button>',
    '  </div>',
    '</div>',
    '</section>',
  ].join('');
}

export function mountSettingsPanel(host: HTMLElement): void {
  const api = getApi();
  if (!api) {
    host.innerHTML = '<div style="color:#dc2626;font-size:12px;">' + esc(T('ai.lib_not_loaded_short', 'AI library not loaded.')) + '</div>';
    return;
  }
  host.innerHTML = renderPanelHtml();
  const formHost = host.querySelector('#mf-ai-admin-form-host') as HTMLElement | null;
  const statusEl = host.querySelector('#mf-ai-admin-status') as HTMLElement | null;
  if (!formHost || !statusEl) return;

  formHost.innerHTML = api.renderSettingsHTML();
  api.wireSettings({});

  // Repurpose the inner Save button label so it doesn't compete with our header
  // buttons (renderSettingsHTML emits its own Save button inside the panel).
  const innerSave = host.querySelector('#mf-ai-save-btn') as HTMLButtonElement | null;
  if (innerSave) innerSave.style.display = 'none';
  const innerTest = host.querySelector('#mf-ai-test-btn') as HTMLButtonElement | null;
  if (innerTest) innerTest.style.display = 'none';

  function readForm(): AIConfig {
    const sel = host.querySelector('#mf-ai-provider') as HTMLSelectElement | null;
    const baseEl = host.querySelector('#mf-ai-base') as HTMLInputElement | null;
    const keyEl = host.querySelector('#mf-ai-key') as HTMLInputElement | null;
    const modelEl = host.querySelector('#mf-ai-model') as HTMLInputElement | null;
    return {
      provider: sel ? sel.value : 'openai',
      baseUrl: baseEl ? baseEl.value : '',
      apiKey: keyEl ? keyEl.value : '',
      model: modelEl ? modelEl.value : '',
    };
  }

  function setStatus(msg: string, ok: boolean): void {
    statusEl!.textContent = msg;
    statusEl!.style.color = ok ? '#16a34a' : '#dc2626';
  }

  host.querySelector('#mf-ai-admin-save-local')?.addEventListener('click', () => {
    const cfg = readForm();
    api!.setConfig(cfg);
    setStatus(T('ai.settings_saved_local', 'Saved to this browser only.'), true);
  });
  host.querySelector('#mf-ai-admin-save-server')?.addEventListener('click', async () => {
    const cfg = readForm();
    api!.setConfig(cfg);
    setStatus(T('ai.settings_saving', 'Saving to server…'), true);
    const r = await saveToServer(cfg);
    setStatus(r.message, r.ok);
  });
  host.querySelector('#mf-ai-admin-test')?.addEventListener('click', async () => {
    const cfg = readForm();
    api!.setConfig(cfg);
    setStatus(T('ai.settings_testing', 'Testing…'), true);
    const r = await api!.test();
    setStatus(r.message, r.ok);
  });
}

function autoMount(): void {
  const hosts = document.querySelectorAll('[data-mf-ai-settings]');
  hosts.forEach((el) => {
    if (el.getAttribute('data-mf-ai-settings-ready') === '1') return;
    el.setAttribute('data-mf-ai-settings-ready', '1');
    mountSettingsPanel(el as HTMLElement);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount);
} else {
  autoMount();
}

(window as any).MFAI_Settings = { mount: mountSettingsPanel, saveToServer, badge: SETTINGS_BADGE };
(window as any).__MFAI_SETTINGS_BADGE__ = SETTINGS_BADGE;
