import { getEmbedFormUrl, getPublicFormUrl, resolveAssetUrl } from '@shared/platform-host';

type EmbedModalOptions = {
  formId: number;
  formTitle: string;
  viewUrl?: string;
};

type ShareLink = {
  key: string;
  label: string;
  href: string;
  icon: string;
  className?: string;
};

const IFRAME_RESIZE_BADGE = 'Iframe resize v20260410-02';
const EMBED_MODAL_RENDERER_BADGE = 'EmbedModalRendererHost v20260406-01';
if (typeof window !== 'undefined') (window as any).__MF_EMBED_MODAL_RENDERER_BADGE__ = EMBED_MODAL_RENDERER_BADGE;
if (typeof window !== 'undefined') (window as any).__MF_IFRAME_RESIZE_BADGE__ = IFRAME_RESIZE_BADGE;

function getIframeSnippet(viewUrl: string, formId: number, formTitle: string, width: string, height: number, radius: number): string {
  const wrapperId = `megaform-iframe-wrap-${formId}`;
  const frameId = `megaform-iframe-${formId}`;
  return `<div id="${wrapperId}" style="width:${escapeAttr(width)};max-width:100%;margin:0 auto;overflow:hidden;border-radius:${radius}px;">
  <iframe id="${frameId}"
    src="${embedUrl}"
    frameborder="0"
    width="100%"
    height="${height}"
    scrolling="no"
    style="display:block;width:100%;min-height:${height}px;height:${height}px;border:none;border-radius:${radius}px;overflow:hidden;background:transparent;"
    allowtransparency="true"
    loading="lazy"
    title="${escapeAttr(formTitle)}">
  </iframe>
</div>
<script>
(function(){
  var BADGE = '${IFRAME_RESIZE_BADGE}';
  var frame = document.getElementById('${frameId}');
  var wrap = document.getElementById('${wrapperId}');
  if (!frame) return;
  function applyHeight(next){
    var n = Math.max(${height}, Math.round(Number(next) || 0));
    if (!n) return;
    frame.style.height = n + 'px';
    frame.style.minHeight = n + 'px';
    frame.setAttribute('height', String(n));
    if (wrap) wrap.style.minHeight = n + 'px';
  }
  function onMessage(event){
    var data = event && event.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { return; } }
    if (!data || data.type !== 'mf:resize') return;
    if (data.formId && Number(data.formId) !== ${formId}) return;
    if (event.source && frame.contentWindow && event.source !== frame.contentWindow) return;
    applyHeight(data.height);
  }
  window.addEventListener('message', onMessage, false);
  frame.addEventListener('load', function(){ applyHeight(${height}); });
  void BADGE;
})();
<\/script>`;
}

const ICONS: Record<string, string> = {
  x: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  file: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  checkSm: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  externalLink: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
  codeEmbed: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  share: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>`,
  link: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  size: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-2-2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="m8 12 4-4 4 4"/><path d="m8 12 4 4 4-4"/></svg>`,
  facebook: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.6 1.6-1.6h1.7V4.8c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.2V11H8v3h2.4v8h3.1Z"/></svg>`,
  linkedin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.94 8.5a1.72 1.72 0 1 1 0-3.44 1.72 1.72 0 0 1 0 3.44ZM8.4 20H5.48V9.7H8.4V20Zm10.12 0h-2.9v-5.01c0-1.2-.02-2.74-1.67-2.74-1.67 0-1.92 1.3-1.92 2.65V20H9.13V9.7h2.78v1.4h.04c.39-.73 1.33-1.5 2.75-1.5 2.94 0 3.48 1.94 3.48 4.45V20Z"/></svg>`,
  mail: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  whatsapp: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 14.2c-.2-.1-1.3-.7-1.5-.8s-.4-.1-.6.1-.7.8-.8.9-.3.2-.5.1c-1.3-.6-2.1-1.1-3-2.5-.2-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.2.2-.3.2-.5s0-.3-.1-.5c-.1-.1-.6-1.5-.9-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.1s.9 2.3 1 2.5c.1.2 1.8 2.8 4.3 3.9.6.3 1 .4 1.4.6.6.2 1.1.2 1.6.1.5-.1 1.3-.5 1.5-1 .2-.5.2-1 .1-1.1-.1-.1-.3-.2-.5-.3Z"/><path d="M20.1 3.9A10 10 0 0 0 4.4 16.3L3 21l4.8-1.3A10 10 0 1 0 20.1 3.9ZM12 20a8 8 0 0 1-4.1-1.1l-.3-.2-2.8.8.8-2.7-.2-.3A8 8 0 1 1 12 20Z"/></svg>`,
  native: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v14"/></svg>`
};

function icon(name: string): string { return ICONS[name] || ''; }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] { const node = document.createElement(tag); if (cls) node.className = cls; if (html !== undefined) node.innerHTML = html; return node; }
function div(cls?: string, html?: string): HTMLDivElement { return el('div', cls, html); }
function mk(parent: HTMLElement, ...children: (HTMLElement | Node)[]): HTMLElement { children.forEach(c => parent.appendChild(c)); return parent; }
function field(label: string, inp: HTMLElement, hint?: string): HTMLElement {
  const w = div('mf-field');
  const lbl = el('label', 'mf-field-lbl') as HTMLLabelElement;
  lbl.textContent = label;
  mk(w, lbl, inp);
  if (hint) w.appendChild(div('mf-field-hint', hint));
  return w;
}
function copyText(text: string, btn?: HTMLButtonElement | null, label = 'Copy'): void {
  navigator.clipboard?.writeText(text);
  if (!btn) return;
  btn.innerHTML = `${icon('checkSm')} Copied!`;
  window.setTimeout(() => { btn.innerHTML = `${icon('copy')} ${label}`; }, 2000);
}
function escapeAttr(text: string): string { return String(text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

function buildShareLinks(viewUrl: string, formTitle: string): ShareLink[] {
  const encodedUrl = encodeURIComponent(viewUrl);
  const encodedTitle = encodeURIComponent(formTitle);
  const encodedText = encodeURIComponent(`${formTitle} ${viewUrl}`);
  return [
    { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, icon: icon('facebook'), className: 'is-facebook' },
    { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, icon: icon('linkedin'), className: 'is-linkedin' },
    { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${encodedText}`, icon: icon('whatsapp'), className: 'is-whatsapp' },
    { key: 'email', label: 'Email', href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`, icon: icon('mail'), className: 'is-email' },
  ];
}

export function openDashboardEmbedModal(opts: EmbedModalOptions): void {
  document.getElementById('mf-modal-overlay')?.remove();

  const origin = window.location.origin;
  const formId = opts.formId;
  const formTitle = opts.formTitle;
  const viewUrl = new URL(getPublicFormUrl(formId, false, opts.viewUrl), origin).toString();
  const embedUrl = new URL(getEmbedFormUrl(formId, opts.viewUrl), origin).toString();
  const apiBase = `${origin}/api/MegaForm/`;
  const embedPath = getEmbedFormUrl(formId);

  const iframeState = {
    widthPreset: 'standard',
    width: '100%',
    height: '640',
    borderRadius: '12'
  };

  function normalizeIframeState(preset: string): void {
    if (preset === 'compact') {
      iframeState.width = '100%'; iframeState.height = '480'; iframeState.borderRadius = '10';
    } else if (preset === 'standard') {
      iframeState.width = '100%'; iframeState.height = '640'; iframeState.borderRadius = '12';
    } else if (preset === 'tall') {
      iframeState.width = '100%'; iframeState.height = '880'; iframeState.borderRadius = '12';
    } else if (preset === 'wide') {
      iframeState.width = '960'; iframeState.height = '720'; iframeState.borderRadius = '12';
    }
  }

  function getIframeCode(): string {
    const width = String(iframeState.width || '100%').trim();
    const height = Math.max(320, parseInt(String(iframeState.height || '640'), 10) || 640);
    const radius = Math.max(0, parseInt(String(iframeState.borderRadius || '12'), 10) || 0);
    const wrId = `megaform-iframe-wrap-${formId}`;
    const frId = `megaform-iframe-${formId}`;
    return `<div id="${wrId}" style="width:${escapeAttr(width)};max-width:100%;margin:0 auto;overflow:hidden;border-radius:${radius}px;">\n  <iframe id="${frId}"\n    src="${embedUrl}"\n    frameborder="0"\n    width="100%"\n    height="${height}"\n    scrolling="no"\n    style="display:block;width:100%;min-height:${height}px;height:${height}px;border:none;border-radius:${radius}px;overflow:hidden;background:transparent;"\n    allowtransparency="true"\n    loading="lazy"\n    title="${escapeAttr(formTitle)}">\n  </iframe>\n</div>\n<script>\n(function(){\n  var BADGE = '${IFRAME_RESIZE_BADGE}';\n  var frame = document.getElementById('${frId}');\n  var wrap = document.getElementById('${wrId}');\n  if (!frame) return;\n  function applyHeight(next){\n    var n = Math.max(${height}, Math.round(Number(next) || 0));\n    if (!n) return;\n    frame.style.height = n + 'px';\n    frame.style.minHeight = n + 'px';\n    frame.setAttribute('height', String(n));\n    if (wrap) wrap.style.minHeight = n + 'px';\n  }\n  function onMessage(e){\n    var d = e && e.data;\n    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }\n    if (!d || d.type !== 'mf:resize') return;\n    if (d.formId && Number(d.formId) !== ${formId}) return;\n    if (e.source && frame.contentWindow && e.source !== frame.contentWindow) return;\n    applyHeight(d.height);\n  }\n  window.addEventListener('message', onMessage, false);\n  frame.addEventListener('load', function(){ applyHeight(${height}); });\n  void BADGE;\n})();\n<\/script>`;
  }

  function getScriptCode(): string {
    const width = String(iframeState.width || '100%').trim();
    const height = Math.max(320, parseInt(String(iframeState.height || '640'), 10) || 640);
    const radius = Math.max(0, parseInt(String(iframeState.borderRadius || '12'), 10) || 0);
    return `<div id="megaform-${formId}"></div>
<script src="${origin}${resolveAssetUrl('js/megaform-embed.js')}"
  data-form-id="${formId}"
  data-server="${origin}"
  data-api-base="${apiBase}"
  data-width="${escapeAttr(width)}"
  data-height="${height}"
  data-min-height="${height}"
  data-radius="${radius}"
  data-auto-resize="true"
  data-view-url="${viewUrl}"
  data-embed-url="${embedUrl}"
  data-embed-path="${escapeAttr(embedPath)}">
<\/script>`;
  }

  const ov = div('mf-modal-overlay');
  ov.id = 'mf-modal-overlay';
  ov.style.zIndex = '200001';
  const box = div('mf-modal');
  box.style.maxWidth = '760px';

  const hd = div('mf-modal-hd');
  const hIcon = div('mf-modal-hd-icon'); hIcon.innerHTML = icon('codeEmbed');
  const hTitle = div('mf-modal-hd-title'); hTitle.textContent = 'Embed & Share';
  const closeBtn = el('button', 'mf-modal-close') as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.innerHTML = icon('x');
  closeBtn.onclick = () => ov.remove();
  mk(hd, hIcon, hTitle, closeBtn);

  const body = div('mf-modal-body');
  const inner = div('mf-modal-inner');

  const pill = div('mf-embed-pill');
  pill.innerHTML = `${icon('file')} <strong>${formTitle}</strong>`;
  inner.appendChild(pill);

  const sharePill = div('mf-embed-meta-grid');
  const publicItem = div('mf-embed-meta-item'); publicItem.innerHTML = `${icon('link')} <span>Public form link ready</span>`;
  const iframeItem = div('mf-embed-meta-item'); iframeItem.innerHTML = `${icon('size')} <span>Script and iframe now auto-resize vertically</span>`;
  const shareItem = div('mf-embed-meta-item'); shareItem.innerHTML = `${icon('share')} <span>Native share + branded social buttons</span>`;
  mk(sharePill, publicItem, iframeItem, shareItem);
  inner.appendChild(sharePill);

  const linkRow = div('mf-embed-link-row');
  const linkInp = el('input', 'mf-input mf-embed-url-inp') as HTMLInputElement;
  linkInp.value = viewUrl;
  linkInp.readOnly = true;
  const copyLinkBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
  copyLinkBtn.type = 'button';
  copyLinkBtn.innerHTML = `${icon('copy')} Copy`;
  copyLinkBtn.onclick = () => copyText(viewUrl, copyLinkBtn, 'Copy');
  const viewBtn = el('a', 'mf-btn mf-btn-primary mf-btn-sm') as HTMLAnchorElement;
  viewBtn.href = viewUrl;
  viewBtn.target = '_blank';
  viewBtn.rel = 'noopener noreferrer';
  viewBtn.innerHTML = `${icon('externalLink')} Open`;
  mk(linkRow, linkInp, copyLinkBtn, viewBtn);
  inner.appendChild(field('Public URL', linkRow));

  const tabBar = div('mf-embed-tabs');
  const tabScript = el('button', 'mf-embed-tab is-active') as HTMLButtonElement; tabScript.type = 'button'; tabScript.textContent = 'Script Tag';
  const tabIframe = el('button', 'mf-embed-tab') as HTMLButtonElement; tabIframe.type = 'button'; tabIframe.textContent = 'iFrame';
  const tabShare = el('button', 'mf-embed-tab') as HTMLButtonElement; tabShare.type = 'button'; tabShare.textContent = 'Share';
  mk(tabBar, tabScript, tabIframe, tabShare);
  inner.appendChild(tabBar);

  function createCodePanel(getCode: () => string, id: string): { wrap: HTMLElement; refresh: () => void } {
    const wrap = div('mf-embed-code-wrap'); wrap.id = id;
    const pre = el('pre', 'mf-embed-pre') as HTMLPreElement;
    const cpBtn = el('button', 'mf-embed-copy-btn') as HTMLButtonElement;
    cpBtn.type = 'button';
    cpBtn.innerHTML = `${icon('copy')} Copy Code`;
    cpBtn.onclick = () => copyText(getCode(), cpBtn, 'Copy Code');
    mk(wrap, pre, cpBtn);
    function refresh(): void { pre.textContent = getCode(); }
    refresh();
    return { wrap, refresh };
  }

  const scriptPanel = createCodePanel(getScriptCode, 'mf-panel-script');

  const iframeSettingsWrap = div('mf-embed-settings-grid');
  const presetSel = el('select', 'mf-input') as HTMLSelectElement;
  [
    { value: 'compact', label: 'Compact · 100% × 480px' },
    { value: 'standard', label: 'Standard · 100% × 640px' },
    { value: 'tall', label: 'Tall · 100% × 880px' },
    { value: 'wide', label: 'Wide · 960px × 720px' },
    { value: 'custom', label: 'Custom size' }
  ].forEach(item => {
    const opt = el('option') as HTMLOptionElement;
    opt.value = item.value; opt.textContent = item.label;
    if (item.value === iframeState.widthPreset) opt.selected = true;
    presetSel.appendChild(opt);
  });
  const widthInp = el('input', 'mf-input') as HTMLInputElement; widthInp.type = 'text'; widthInp.value = iframeState.width; widthInp.placeholder = '100% or 960';
  const heightInp = el('input', 'mf-input') as HTMLInputElement; heightInp.type = 'number'; heightInp.min = '320'; heightInp.step = '20'; heightInp.value = iframeState.height;
  const radiusInp = el('input', 'mf-input') as HTMLInputElement; radiusInp.type = 'number'; radiusInp.min = '0'; radiusInp.step = '1'; radiusInp.value = iframeState.borderRadius;
  iframeSettingsWrap.appendChild(field('Preset', presetSel));
  iframeSettingsWrap.appendChild(field('Width', widthInp, 'Use 100% for responsive embeds or a fixed width like 960.'));
  iframeSettingsWrap.appendChild(field('Height (px)', heightInp, 'Applies to both iframe and script-generated iframe.'));
  iframeSettingsWrap.appendChild(field('Corner radius (px)', radiusInp));

  const iframePanel = div('mf-embed-panel-stack'); iframePanel.id = 'mf-panel-iframe'; iframePanel.style.display = 'none';
  const iframeHint = div('mf-embed-hint', 'Choose a preset or custom dimensions, then copy the generated embed code. The iframe snippet now includes an auto-height bridge to avoid vertical scrollbars.');
  const iframeCodePanel = createCodePanel(getIframeCode, 'mf-panel-iframe-code');
  mk(iframePanel, iframeSettingsWrap, iframeHint, iframeCodePanel.wrap);

  function syncEmbedSizingFromInputs(): void {
    iframeState.widthPreset = presetSel.value;
    iframeState.width = widthInp.value || '100%';
    iframeState.height = heightInp.value || '640';
    iframeState.borderRadius = radiusInp.value || '12';
    iframeCodePanel.refresh();
    scriptPanel.refresh();
  }

  presetSel.addEventListener('change', () => {
    iframeState.widthPreset = presetSel.value;
    if (presetSel.value !== 'custom') {
      normalizeIframeState(presetSel.value);
      widthInp.value = iframeState.width;
      heightInp.value = iframeState.height;
      radiusInp.value = iframeState.borderRadius;
    }
    syncEmbedSizingFromInputs();
  });
  [widthInp, heightInp, radiusInp].forEach(inp => inp.addEventListener('input', () => { presetSel.value = 'custom'; syncEmbedSizingFromInputs(); }));

  const sharePanel = div('mf-embed-share-grid'); sharePanel.id = 'mf-panel-share'; sharePanel.style.display = 'none';

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const nativeBtn = el('button', 'mf-embed-share-btn is-native') as HTMLButtonElement;
    nativeBtn.type = 'button';
    nativeBtn.innerHTML = `<span class="mf-embed-share-logo">${icon('native')}</span><span class="mf-embed-share-text">Share via device</span>`;
    nativeBtn.onclick = async () => {
      try { await navigator.share({ title: formTitle, text: formTitle, url: viewUrl }); } catch { /* user cancelled */ }
    };
    sharePanel.appendChild(nativeBtn);
  }

  buildShareLinks(viewUrl, formTitle).forEach(item => {
    const a = el('a', `mf-embed-share-btn ${item.className || ''}`.trim()) as HTMLAnchorElement;
    a.href = item.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML = `<span class="mf-embed-share-logo">${item.icon}</span><span class="mf-embed-share-text">${item.label}</span>`;
    sharePanel.appendChild(a);
  });

  const copyShareWrap = div('mf-embed-share-copy');
  const copyShareBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
  copyShareBtn.type = 'button';
  copyShareBtn.innerHTML = `${icon('share')} Copy public link`;
  copyShareBtn.onclick = () => copyText(viewUrl, copyShareBtn, 'Copy public link');
  const emailBtn = el('a', 'mf-btn mf-btn-primary mf-btn-sm') as HTMLAnchorElement;
  emailBtn.href = `mailto:?subject=${encodeURIComponent(formTitle)}&body=${encodeURIComponent(viewUrl)}`;
  emailBtn.innerHTML = `${icon('mail')} Email link`;
  mk(copyShareWrap, copyShareBtn, emailBtn);
  sharePanel.appendChild(copyShareWrap);
  sharePanel.appendChild(div('mf-embed-share-note', 'Tip: for richer Facebook and LinkedIn previews, make sure the page URL returns Open Graph tags.'));

  tabScript.onclick = () => { tabScript.classList.add('is-active'); tabIframe.classList.remove('is-active'); tabShare.classList.remove('is-active'); scriptPanel.wrap.style.display = ''; iframePanel.style.display = 'none'; sharePanel.style.display = 'none'; };
  tabIframe.onclick = () => { tabIframe.classList.add('is-active'); tabScript.classList.remove('is-active'); tabShare.classList.remove('is-active'); scriptPanel.wrap.style.display = 'none'; iframePanel.style.display = ''; sharePanel.style.display = 'none'; iframeCodePanel.refresh(); };
  tabShare.onclick = () => { tabShare.classList.add('is-active'); tabScript.classList.remove('is-active'); tabIframe.classList.remove('is-active'); scriptPanel.wrap.style.display = 'none'; iframePanel.style.display = 'none'; sharePanel.style.display = ''; };

  inner.appendChild(scriptPanel.wrap);
  inner.appendChild(iframePanel);
  inner.appendChild(sharePanel);
  inner.appendChild(div('mf-embed-hint', 'Protected forms can still be embedded and shared. Script embeds now honor the selected width, height, and radius presets too.'));

  const footer = div('mf-modal-footer');
  const closeFooter = el('button', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
  closeFooter.type = 'button'; closeFooter.textContent = 'Close'; closeFooter.onclick = () => ov.remove();
  footer.appendChild(closeFooter);
  inner.appendChild(footer);

  body.appendChild(inner);
  mk(box, hd, body);
  ov.appendChild(box);
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', esc); } });
}
