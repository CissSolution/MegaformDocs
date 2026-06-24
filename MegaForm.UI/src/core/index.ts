// ============================================================
// MegaForm Main Entry — reads root element, bootstraps adapter + UI
// ============================================================

import type { Platform, InitContext, PlatformAdapter } from '@core/platform';
import { createDnnAdapter } from '@adapters/dnn';
import { createAspCoreAdapter } from '@adapters/aspcore';
import { createOqtaneAdapter } from '@adapters/oqtane';

/** Global adapter reference — set after init */
let _adapter: PlatformAdapter | null = null;

/** Get the active platform adapter */
export function getAdapter(): PlatformAdapter {
  if (!_adapter) throw new Error('MegaForm not initialized. Call MegaForm.init(el) first.');
  return _adapter;
}

/** Read InitContext from data-* attributes on root element */
export function readContext(el: HTMLElement): InitContext {
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

/** Create platform adapter based on context */
export function createAdapter(ctx: InitContext): PlatformAdapter {
  switch (ctx.platform) {
    case 'dnn':
      return createDnnAdapter(ctx);
    case 'aspcore':
    case 'standalone':
      return createAspCoreAdapter(ctx);
    case 'oqtane':
      return createOqtaneAdapter(ctx);
    case 'umbraco':
      return createAspCoreAdapter(ctx); // same REST API
    default:
      return createDnnAdapter(ctx);
  }
}

/**
 * Initialize MegaForm on a root element.
 * Reads data-* attributes, creates platform adapter, mounts UI.
 *
 * Usage:
 *   <div id="mf-root" data-platform="dnn" data-instance-id="123" ...></div>
 *   <script>MegaForm.init(document.getElementById('mf-root'));</script>
 */
export function init(el: HTMLElement | null): void {
  if (!el) {
    console.warn('MegaForm.init: no root element provided');
    return;
  }

  const ctx = readContext(el);
  _adapter = createAdapter(ctx);

  console.log(`[MegaForm] Initialized: platform=${ctx.platform}, instanceId=${ctx.instanceId}, viewType=${ctx.viewType}`);

  // Mount appropriate UI based on context
  // This will be expanded as Config Panel and Views are built
  el.innerHTML = `<div class="mf-loading">MegaForm loading...</div>`;
}

// Expose globally — MERGE, never overwrite
if (typeof window !== 'undefined') {
  const w = window as Record<string, unknown>;
  if (!w.MegaForm) w.MegaForm = {};
  (w.MegaForm as Record<string, unknown>).init = init;
  (w.MegaForm as Record<string, unknown>).getAdapter = getAdapter;
}
