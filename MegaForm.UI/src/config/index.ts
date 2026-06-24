// ============================================================
// MegaForm Config — Entry Point
// Mounts Config Panel or delegates to view rendering
// ============================================================

import type { Platform, InitContext, PlatformAdapter } from '@core/platform';
import { createDnnAdapter } from '@adapters/dnn';
import { mountConfigPanel } from './ConfigPanel';

/** Read InitContext from data-* attributes on root element */
function readContext(el: HTMLElement): InitContext {
  const platform = (el.dataset.platform || 'dnn') as Platform;
  // [B51] Platform-aware default apiBase when [data-api-base] is absent.
  const defaultApiBase = String(platform).toLowerCase() === 'oqtane'
    ? '/api/MegaForm/'
    : '/DesktopModules/MegaForm/API/';
  return {
    platform,
    instanceId: parseInt(el.dataset.instanceId || el.dataset.moduleId || '0', 10),
    formId: parseInt(el.dataset.formId || '0', 10),
    apiBase: el.dataset.apiBase || defaultApiBase,
    isAdmin: el.dataset.isAdmin === 'true',
    viewType: el.dataset.viewType || '',
    config: el.dataset.config || '{}',
  };
}

function createAdapter(ctx: InitContext): PlatformAdapter {
  switch (ctx.platform) {
    case 'dnn': return createDnnAdapter(ctx);
    default: return createDnnAdapter(ctx);
  }
}

/**
 * Initialize MegaForm Config Panel on a root element.
 * Called by the host page when showing configuration UI.
 */
function initConfig(el: HTMLElement | null): void {
  if (!el) {
    console.warn('[MegaForm] Config: no root element');
    return;
  }

  const ctx = readContext(el);
  const adapter = createAdapter(ctx);

  console.log(`[MegaForm] Config Panel: platform=${ctx.platform}, instanceId=${ctx.instanceId}`);
  mountConfigPanel(el, adapter, ctx);
}

// Expose globally
if (typeof window !== 'undefined') {
  const w = window as Record<string, unknown>;
  if (!w.MegaForm) w.MegaForm = {};
  (w.MegaForm as Record<string, unknown>).initConfig = initConfig;
}

export { initConfig };
