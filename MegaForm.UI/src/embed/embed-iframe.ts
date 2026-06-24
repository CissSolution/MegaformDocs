import { buildHostedFormUrl } from "@shared/platform-host";

const VERSION = '2.2.1';
const AUTO_RESIZE_BADGE = 'Iframe resize v20260401-01';
const EMBED_ROUTE_BADGE = 'EmbedHost v20260406-05';
const RESIZE_MESSAGE_TYPE = 'mf:resize';
if (typeof window !== 'undefined') { (window as any).__MF_IFRAME_RESIZE_BADGE__ = AUTO_RESIZE_BADGE; (window as any).__MF_EMBED_HOST_BADGE__ = EMBED_ROUTE_BADGE; }
const EMBED_CLASS = 'mf-script-embed';
const STYLE_ID = 'mf-script-embed-style';

type ContainerRef = string | HTMLElement;

export interface EmbedOptions {
  formId: number;
  server?: string;
  container?: ContainerRef;
  width?: number | string;
  height?: number | string;
  minHeight?: number | string;
  radius?: number | string;
  scrolling?: 'auto' | 'yes' | 'no';
  autoResize?: boolean;
  frameTitle?: string;
  theme?: string;
  viewUrl?: string;
  embedUrl?: string;
  embedPath?: string;
}

export interface EmbedFrameRecord {
  iframe: HTMLIFrameElement;
  formId: number;
  minHeight: number;
  autoResize: boolean;
}

declare global {
  interface Window {
    MegaFormEmbed?: typeof MegaFormEmbed;
    __MegaFormEmbedFrames?: EmbedFrameRecord[];
    __MegaFormEmbedMessageBound?: boolean;
  }
}

function normalizeServer(server: string | undefined | null): string {
  return String(server || '').replace(/\/+$/, '');
}

function toPixelValue(value: number | string | undefined, fallback: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return `${trimmed}px`;
    return trimmed;
  }
  return `${fallback}px`;
}

function toPixelNumber(value: number | string | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d+(?:\.\d+)?)/);
    if (match) return Math.max(0, Math.round(parseFloat(match[1])));
  }
  return fallback;
}

export function getCandidateScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="megaform-embed"]'));
}

function getCurrentScript(formId?: number): HTMLScriptElement | null {
  const current = document.currentScript as HTMLScriptElement | null;
  if (current?.src && current.src.includes('megaform-embed')) return current;

  const scripts = getCandidateScripts();
  if (typeof formId === 'number') {
    const exact = scripts.find(s => parseInt(s.getAttribute('data-form-id') || '', 10) === formId);
    if (exact) return exact;
  }

  return scripts[scripts.length - 1] || null;
}

function resolveServerFromScript(script: HTMLScriptElement | null): string {
  if (!script?.src) return '';
  const src = script.src;
  const patterns = [
    /\/megaform\/js\/megaform-embed\.js(?:\?.*)?$/i,
    /\/DesktopModules\/MegaForm\/Assets\/js\/megaform-embed\.js(?:\?.*)?$/i,
    /\/Modules\/MegaForm\/js\/megaform-embed\.js(?:\?.*)?$/i,
    /\/js\/megaform-embed\.js(?:\?.*)?$/i,
  ];
  for (const pattern of patterns) {
    if (pattern.test(src)) return src.replace(pattern, '');
  }
  try {
    const url = new URL(src, window.location.href);
    return url.origin;
  } catch {
    return '';
  }
}

function resolveServer(explicitServer: string | undefined, formId?: number): string {
  const direct = normalizeServer(explicitServer);
  if (direct) return direct;

  const script = getCurrentScript(formId);
  const fromAttr = normalizeServer(script?.getAttribute('data-server'));
  if (fromAttr) return fromAttr;

  return normalizeServer(resolveServerFromScript(script));
}

function resolveContainer(ref: ContainerRef | undefined, formId: number): HTMLElement {
  const containerRef = ref || `#megaform-${formId}`;
  let el = typeof containerRef === 'string'
    ? document.querySelector<HTMLElement>(containerRef)
    : containerRef;

  if (!el) {
    el = document.createElement('div');
    el.id = `megaform-${formId}`;
    const scriptEl = getCurrentScript(formId);
    if (scriptEl?.parentNode) scriptEl.parentNode.insertBefore(el, scriptEl);
    else document.body.appendChild(el);
  }

  return el;
}

function ensureBaseStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    `.${EMBED_CLASS}{position:relative;width:100%;max-width:100%;margin:0 auto;overflow:hidden;}`,
    `.${EMBED_CLASS} iframe{display:block;width:100%;max-width:100%;border:0;background:transparent;}`,
    `.${EMBED_CLASS}[data-loading="true"]::before{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(248,250,252,.92));}`,
    `.${EMBED_CLASS}[data-loading="true"]::after{content:"Loading form…";position:absolute;top:24px;left:50%;transform:translateX(-50%);font:600 14px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#64748b;}`,
  ].join('\n');
  document.head.appendChild(style);
}

function resolveEmbedHostScriptInfo(formId?: number): { platform: string; assetsBaseUrl: string; apiBase: string } | null {
  const script = getCurrentScript(formId);
  const src = String(script?.src || '');
  if (!src) return null;
  try {
    const url = new URL(src, window.location.href);
    if (/\/DesktopModules\/MegaForm\/Assets\/js\/megaform-embed\.js(?:\?.*)?$/i.test(url.pathname)) {
      return { platform: 'dnn', assetsBaseUrl: new URL('/DesktopModules/MegaForm/Assets/', url.origin).toString(), apiBase: new URL('/DesktopModules/MegaForm/API/', url.origin).toString() };
    }
    if (/\/Modules\/MegaForm\/js\/megaform-embed\.js(?:\?.*)?$/i.test(url.pathname)) {
      return { platform: 'oqtane', assetsBaseUrl: new URL('/Modules/MegaForm/', url.origin).toString(), apiBase: new URL('/api/MegaForm/', url.origin).toString() };
    }
  } catch {
    return null;
  }
  return null;
}

function buildEmbedUrl(server: string, opts: EmbedOptions): string {
  const root = normalizeServer(server);
  const explicit = normalizeServer(opts.embedUrl || opts.embedPath);
  if (explicit) {
    const explicitUrl = new URL(explicit, window.location.href);
    explicitUrl.searchParams.set('embedSource', 'script');
    explicitUrl.searchParams.set('v', VERSION);
    return explicitUrl.toString();
  }

  const info = resolveEmbedHostScriptInfo(opts.formId);
  if (info && (info.platform === 'dnn' || info.platform === 'oqtane')) {
    const baseUrl = String(opts.viewUrl || root || window.location.href || '/').trim();
    const hosted = new URL(buildHostedFormUrl(baseUrl, opts.formId, true, opts.theme), window.location.href);
    hosted.searchParams.set('embedSource', 'script');
    hosted.searchParams.set('v', VERSION);
    void EMBED_ROUTE_BADGE;
    return hosted.toString();
  }

  const base = new URL(`${root}/f/${opts.formId}/embed`, window.location.href);
  if (opts.theme) base.searchParams.set('theme', opts.theme);
  base.searchParams.set('embedSource', 'script');
  base.searchParams.set('v', VERSION);
  void EMBED_ROUTE_BADGE;
  return base.toString();
}

function getRegistry(): EmbedFrameRecord[] {
  if (!window.__MegaFormEmbedFrames) window.__MegaFormEmbedFrames = [];
  return window.__MegaFormEmbedFrames;
}

function bindMessageHandler(): void {
  if (window.__MegaFormEmbedMessageBound) return;
  window.__MegaFormEmbedMessageBound = true;

  window.addEventListener('message', (event: MessageEvent) => {
    void AUTO_RESIZE_BADGE;
    let data = event.data as { type?: string; height?: number; formId?: number } | string | null;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return; }
    }
    if (!data || (data as any).type !== RESIZE_MESSAGE_TYPE) return;

    const registry = getRegistry();
    registry.forEach(record => {
      if (event.source !== record.iframe.contentWindow) return;
      if (typeof data.formId === 'number' && data.formId !== record.formId) return;
      if (!record.autoResize) return;

      const nextHeight = Math.max(record.minHeight, Math.round(Number(data.height) || 0));
      if (nextHeight > 0) {
        record.iframe.style.height = `${nextHeight}px`;
        record.iframe.setAttribute('height', String(nextHeight));
        const host = record.iframe.parentElement;
        if (host) {
          host.dataset.loading = 'false';
          host.style.minHeight = `${nextHeight}px`;
        }
      }
    });
  });
}

function applyHostSizing(container: HTMLElement, opts: EmbedOptions, minHeight: number): void {
  const width = typeof opts.width === 'number' ? `${opts.width}px` : String(opts.width || '100%').trim();
  const radius = toPixelValue(opts.radius, 12);
  container.style.width = '100%';
  container.style.maxWidth = '100%';
  container.style.minHeight = `${minHeight}px`;
  container.style.margin = '0 auto';
  container.style.borderRadius = radius;
  container.style.overflow = 'hidden';

  if (width) {
    if (/^\d+$/.test(width) || /(px|rem|em|vw|vh)$/i.test(width)) {
      container.style.maxWidth = /^\d+$/.test(width) ? `${width}px` : width;
    } else if (/%$/i.test(width)) {
      container.style.width = width;
      container.style.maxWidth = '100%';
    } else {
      container.style.maxWidth = width;
    }
  }
}

function mountIframe(container: HTMLElement, opts: EmbedOptions, url: string, minHeight: number): HTMLIFrameElement {
  ensureBaseStyles();
  container.classList.add(EMBED_CLASS);
  container.dataset.loading = 'true';
  container.innerHTML = '';
  applyHostSizing(container, opts, minHeight);

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.title = opts.frameTitle || `MegaForm ${opts.formId}`;
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('marginheight', '0');
  iframe.setAttribute('marginwidth', '0');
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('allow', 'payment *; clipboard-write');
  iframe.setAttribute('allowpaymentrequest', 'true');
  iframe.scrolling = opts.scrolling || 'no';
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.background = 'transparent';
  iframe.style.borderRadius = toPixelValue(opts.radius, 12);
  iframe.style.height = toPixelValue(opts.height, minHeight);
  iframe.style.minHeight = `${minHeight}px`;

  iframe.addEventListener('load', () => {
    if (container.dataset.loading !== 'false') container.dataset.loading = 'false';
  });

  container.appendChild(iframe);
  return iframe;
}

const MegaFormEmbed = {
  render(opts: EmbedOptions): void {
    if (!opts || !Number.isFinite(Number(opts.formId))) {
      throw new Error('MegaFormEmbed.render requires a valid formId.');
    }

    const formId = Number(opts.formId);
    const server = resolveServer(opts.server, formId);
    if (!server) {
      throw new Error('MegaFormEmbed could not resolve the server URL. Pass data-server or opts.server.');
    }

    const container = resolveContainer(opts.container, formId);
    const minHeight = toPixelNumber(opts.minHeight ?? opts.height, 640);
    const runtimeOptions = { ...opts, formId };
    const iframe = mountIframe(container, runtimeOptions, buildEmbedUrl(server, runtimeOptions), minHeight);

    const registry = getRegistry();
    const autoResize = opts.autoResize !== false;
    const nextRecord: EmbedFrameRecord = { iframe, formId, minHeight, autoResize };
    const existingIndex = registry.findIndex(r => r.iframe === iframe || (r.formId === formId && r.iframe.parentElement === container));
    if (existingIndex >= 0) registry.splice(existingIndex, 1, nextRecord);
    else registry.push(nextRecord);

    bindMessageHandler();
  },
};

export default MegaFormEmbed;
