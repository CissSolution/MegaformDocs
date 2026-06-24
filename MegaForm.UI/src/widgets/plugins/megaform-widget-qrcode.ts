/**
 * MegaForm QR Code Corner Widget — TypeScript Source
 *
 * Compile: tsc --project MegaForm.UI/src/widgets/plugins/tsconfig.json
 * Output:  Assets/js/plugins/megaform-widget-qrcode.js
 *
 * Purpose:
 *  - display-only widget
 *  - renders as a compact QR trigger pinned at the top-right corner of the form
 *  - hover (desktop) / click (touch) opens a larger QR popup for mobile scan
 *  - QR encodes the current form Renderer Host URL (?formid=<formId>)
 *
 * Minimal-change design:
 *  - standalone plugin JS
 *  - zero external dependencies
 *  - inline CSS injection (no extra CSS file required)
 */
(function (global: any) {
  'use strict';

  // [restore 20260617-15] Re-adds the center-logo feature that was lost when this widget
  // reverted to v20260419-14 (it had shipped in v20260603-02).
  // [QRDefaultLogo 20260617-16] Center logo is now ON BY DEFAULT for every QR (a built-in
  // brand mark); override with logoUrl, or set logoUrl='none' to disable. EC level 'H' is
  // used whenever a logo is present so the code stays scannable behind it.
  var BADGE = 'QRCodeCorner v20260617-16';

  var MegaFormWidgets = global.MegaFormWidgets = global.MegaFormWidgets || {
    _registry: {} as Record<string, any>,
    register: function (name: string, widget: any) { this._registry[name] = widget; }
  };

  interface QRCodeProps {
    size: number;
    label: string;
    showUrl: boolean;
    urlOverride: string;
    errorLevel: 'L' | 'M' | 'Q' | 'H';
    quietZone: number;
    darkColor: string;
    lightColor: string;
    showCopyButton: boolean;
    copyButtonLabel: string;
    triggerLabel: string;
    logoUrl: string;
    logoSize: number;
    logoPadding: number;
    logoShape: 'rounded' | 'circle' | 'square';
  }

  interface QRWrapEl extends HTMLElement {
    __mfQrBound?: boolean;
    __mfQrPinned?: boolean;
    __mfQrUrl?: string;
  }

  var defaults: QRCodeProps = {
    size: 176,
    label: 'Scan QR code to open on mobile',
    showUrl: false,
    urlOverride: '',
    errorLevel: 'M',
    quietZone: 4,
    darkColor: '#111111',
    lightColor: '#ffffff',
    showCopyButton: true,
    copyButtonLabel: 'Copy link',
    triggerLabel: 'QR',
    logoUrl: '',
    logoSize: 22,
    logoPadding: 8,
    logoShape: 'rounded'
  };

  // [QRDefaultLogo 20260617] Center logo is now ON by default for every QR (per request).
  // A self-contained data-URI SVG (no external dependency) keeps it always-available; a
  // form can override with its own logoUrl, or opt OUT by setting logoUrl to 'none'/'off'.
  var DEFAULT_LOGO_SVG =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>" +
    "<rect width='40' height='40' rx='10' fill='#4f46e5'/>" +
    "<g fill='#ffffff'>" +
    "<rect x='12' y='12' width='6' height='6' rx='1.5'/>" +
    "<rect x='22' y='12' width='6' height='6' rx='1.5'/>" +
    "<rect x='12' y='22' width='6' height='6' rx='1.5'/>" +
    "<rect x='23' y='23' width='4' height='4' rx='1'/>" +
    "</g></svg>";
  var DEFAULT_LOGO = 'data:image/svg+xml,' + encodeURIComponent(DEFAULT_LOGO_SVG);

  // Resolve the logo a QR should actually draw: explicit URL wins; 'none'/'off' disables
  // the logo; anything else (incl. unset) falls back to the default brand mark.
  function effectiveLogo(props: QRCodeProps): string {
    var lu = String((props && props.logoUrl) || '').trim();
    if (lu.toLowerCase() === 'none' || lu.toLowerCase() === 'off') return '';
    return lu || DEFAULT_LOGO;
  }

  function esc(v: any): string {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getProps(widgetProps: any): QRCodeProps {
    var wp = widgetProps || {};
    var size = Number(wp.size);
    if (!isFinite(size)) size = defaults.size;
    var logoSize = Number(wp.logoSize);
    if (!isFinite(logoSize)) logoSize = defaults.logoSize;
    var logoPadding = Number(wp.logoPadding);
    if (!isFinite(logoPadding)) logoPadding = defaults.logoPadding;
    var logoShape = String(wp.logoShape || defaults.logoShape).toLowerCase();
    return {
      size: Math.max(120, Math.min(280, size || defaults.size)),
      label: String(wp.label != null ? wp.label : defaults.label),
      showUrl: wp.showUrl === true || wp.showUrl === 'true',
      urlOverride: String(wp.urlOverride || ''),
      errorLevel: (['L','M','Q','H'].indexOf(wp.errorLevel) >= 0 ? wp.errorLevel : defaults.errorLevel) as any,
      quietZone: Math.max(0, Math.min(10, Number(wp.quietZone) || defaults.quietZone)),
      darkColor: String(wp.darkColor || defaults.darkColor),
      lightColor: String(wp.lightColor || defaults.lightColor),
      showCopyButton: wp.showCopyButton !== false && wp.showCopyButton !== 'false',
      copyButtonLabel: String(wp.copyButtonLabel || defaults.copyButtonLabel),
      triggerLabel: String(wp.triggerLabel || defaults.triggerLabel),
      logoUrl: String(wp.logoUrl || ''),
      logoSize: Math.max(10, Math.min(34, logoSize || defaults.logoSize)),
      logoPadding: Math.max(0, Math.min(18, logoPadding || defaults.logoPadding)),
      logoShape: (logoShape === 'circle' || logoShape === 'square' ? logoShape : 'rounded') as any
    };
  }

  function resolveQrUrl(props: QRCodeProps, formId: number): string {
    if (props.urlOverride && props.urlOverride.trim()) {
      return props.urlOverride.trim().replace(/\{formId\}/gi, String(formId));
    }

    try {
      var p = global.__MF_PLATFORM__ || {};
      var rendererHostUrl = String(p.rendererHostUrl || '').trim();
      if (!rendererHostUrl) {
        var hostEl = document.getElementById('mf-dnn-host');
        if (hostEl) rendererHostUrl = String(hostEl.getAttribute('data-renderer-host-url') || '').trim();
      }
      if (rendererHostUrl) {
        var base = new URL(rendererHostUrl, window.location.origin);
        ['formId','formid','mfFormId','embed','configure','new'].forEach(function (k) { base.searchParams.delete(k); });
        base.hash = '';
        if (formId > 0) base.searchParams.set('formid', String(formId));
        return base.toString();
      }
    } catch (_e) { }

    try {
      var cur = new URL(window.location.href);
      cur.hash = '';
      ['embed','configure','new'].forEach(function (k) { cur.searchParams.delete(k); });
      if (formId > 0) cur.searchParams.set('formid', String(formId));
      return cur.toString();
    } catch (_e2) { }

    return window.location.href || '/';
  }

  function render(field: any, formId: number): string {
    var props = getProps(field && field.widgetProps);
    var uid = 'mf-qr-' + esc(field && field.key || 'qr') + '-' + esc(formId);
    var propsJson = esc(JSON.stringify({
      size: props.size,
      label: props.label,
      showUrl: props.showUrl,
      urlOverride: props.urlOverride,
      errorLevel: props.errorLevel,
      quietZone: props.quietZone,
      darkColor: props.darkColor,
      lightColor: props.lightColor,
      showCopyButton: props.showCopyButton,
      copyButtonLabel: props.copyButtonLabel,
      triggerLabel: props.triggerLabel,
      logoUrl: props.logoUrl,
      logoSize: props.logoSize,
      logoPadding: props.logoPadding,
      logoShape: props.logoShape
    }));

    var qrIcon =
      '<svg class="mf-qr-corner-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
        '<rect x="1" y="1" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<rect x="3" y="3" width="3" height="3"/>' +
        '<rect x="12" y="1" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<rect x="14" y="3" width="3" height="3"/>' +
        '<rect x="1" y="12" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<rect x="3" y="14" width="3" height="3"/>' +
        '<rect x="12" y="12" width="2" height="2"/><rect x="15" y="12" width="2" height="2"/>' +
        '<rect x="18" y="12" width="2" height="2"/><rect x="12" y="15" width="2" height="2"/>' +
        '<rect x="15" y="15" width="2" height="2"/><rect x="12" y="18" width="2" height="2"/>' +
        '<rect x="15" y="18" width="5" height="2"/>' +
      '</svg>';

    var copyBtn = props.showCopyButton
      ? '<button type="button" class="mf-qr-corner-copy" data-qr-copy="1">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
            '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
          '</svg>' + esc(props.copyButtonLabel) + '</button>'
      : '';

    var urlNote = props.showUrl ? '<div class="mf-qr-corner-url" data-qr-url-display="1"></div>' : '';

    return '' +
      '<div class="mf-qr-corner" id="' + uid + '" data-formid="' + esc(formId) + '" data-props="' + propsJson + '">' +
        '<button type="button" class="mf-qr-corner-trigger" aria-haspopup="true" aria-expanded="false" title="Show QR code">' +
          qrIcon + '<span class="mf-qr-corner-trigger-text">' + esc(props.triggerLabel) + '</span>' +
        '</button>' +
        '<div class="mf-qr-corner-popup" role="tooltip" aria-hidden="true">' +
          '<div class="mf-qr-corner-canvas-wrap">' +
            '<canvas class="mf-qr-corner-canvas" width="' + esc(props.size) + '" height="' + esc(props.size) + '"></canvas>' +
            '<div class="mf-qr-corner-boot"><span class="mf-qr-corner-spinner"></span></div>' +
          '</div>' +
          '<div class="mf-qr-corner-label">' + esc(props.label) + '</div>' +
          urlNote +
          copyBtn +
        '</div>' +
      '</div>';
  }

  function bind(formId: number): void {
    var wraps = Array.prototype.slice.call(document.querySelectorAll('.mf-qr-corner[data-formid="' + String(formId) + '"]')) as QRWrapEl[];
    if (!wraps.length) return;

    var preferred = wraps[0];
    for (var i = 0; i < wraps.length; i++) {
      if (String(wraps[i].getAttribute('data-mf-auto-qr') || '') === '1') {
        preferred = wraps[i];
        break;
      }
    }

    wraps.forEach(function (wrap) {
      if (wrap.__mfQrBound) return;
      wrap.__mfQrBound = true;

      if (wrap !== preferred) {
        hideFieldShell(wrap);
        return;
      }

      pinToFormCorner(wrap, formId);
      bootQr(wrap);
      bindTrigger(wrap);
    });
  }

  function hideFieldShell(wrap: HTMLElement): void {
    try {
      var shell = wrap.closest('.mf-field-group') as HTMLElement | null;
      if (shell) shell.style.display = 'none';
      else wrap.style.display = 'none';
    } catch (_e) {
      wrap.style.display = 'none';
    }
  }

  function pinToFormCorner(wrap: QRWrapEl, formId: number): void {
    if (wrap.__mfQrPinned) return;
    wrap.__mfQrPinned = true;

    var shell = wrap.closest('.mf-field-group') as HTMLElement | null;
    var form = document.getElementById('mf-form-' + formId) as HTMLElement | null;
    var wrapper = form
      || (wrap.closest('.mf-form') as HTMLElement | null)
      || (wrap.closest('.mf-form-inner') as HTMLElement | null)
      || (document.querySelector('#mf-form-wrapper-' + formId + ' .mf-form') as HTMLElement | null)
      || (document.querySelector('#mf-form-wrapper-' + formId + ' .mf-form-inner') as HTMLElement | null)
      || (wrap.closest('.mfp-body') as HTMLElement | null)
      || (document.getElementById('mf-form-wrapper-' + formId) as HTMLElement | null)
      || (wrap.closest('.mf-form-wrapper') as HTMLElement | null);

    if (!wrapper) return;
    try {
      var pos = window.getComputedStyle(wrapper).position;
      if (!pos || pos === 'static') wrapper.style.position = 'relative';
    } catch (_e) {
      wrapper.style.position = 'relative';
    }

    wrapper.appendChild(wrap);
    if (shell) {
      shell.style.display = 'none';
      shell.setAttribute('data-mf-qr-hidden', '1');
    }
  }

  function bootQr(wrap: QRWrapEl): void {
    var formId = Number(wrap.getAttribute('data-formid') || 0);
    var p: any = {};
    try { p = JSON.parse(wrap.getAttribute('data-props') || '{}'); } catch (_e) { }
    var props = getProps(p);
    var url = resolveQrUrl(props, formId);
    wrap.__mfQrUrl = url;

    var urlDisplay = wrap.querySelector('[data-qr-url-display]') as HTMLElement;
    if (urlDisplay) urlDisplay.textContent = url;

    var canvas = wrap.querySelector('.mf-qr-corner-canvas') as HTMLCanvasElement;
    var bootEl = wrap.querySelector('.mf-qr-corner-boot') as HTMLElement;
    if (!canvas) return;

    try {
      // When a center logo is present (default-on), force 'H' error-correction so the QR
      // survives the ~22% area the logo covers; otherwise honour the configured level.
      var matrix = generateQRMatrix(url, effectiveLogo(props) ? 'H' : props.errorLevel, props.quietZone);
      drawQRToCanvas(canvas, matrix, props.darkColor, props.lightColor);
      drawLogoToCanvas(canvas, props, function () {
        if (bootEl) bootEl.style.display = 'none';
        canvas.style.display = 'block';
      });
    } catch (e) {
      if (bootEl) bootEl.innerHTML = '<span style="color:#ef4444;font-size:11px">QR error</span>';
      try { console.warn('[MegaFormQRCodeCorner] QR generation failed:', e); } catch (_e2) { }
    }
  }

  function bindTrigger(wrap: QRWrapEl): void {
    var trigger = wrap.querySelector('.mf-qr-corner-trigger') as HTMLButtonElement;
    var popup = wrap.querySelector('.mf-qr-corner-popup') as HTMLElement;
    if (!trigger || !popup) return;

    var isOpen = false;
    var hideTimer: any = null;
    var isTouchDevice = false;

    function open(): void {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      if (isOpen) return;
      isOpen = true;
      popup.classList.add('is-open');
      popup.setAttribute('aria-hidden', 'false');
      trigger.setAttribute('aria-expanded', 'true');
      adjustPopupPosition(wrap, popup);
    }
    function close(): void {
      isOpen = false;
      popup.classList.remove('is-open');
      popup.setAttribute('aria-hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
    }
    function scheduleClose(): void {
      hideTimer = setTimeout(close, 160);
    }

    wrap.addEventListener('mouseenter', function () { if (!isTouchDevice) open(); });
    wrap.addEventListener('mouseleave', function () { if (!isTouchDevice) scheduleClose(); });
    trigger.addEventListener('touchstart', function () { isTouchDevice = true; }, { passive: true } as any);
    trigger.addEventListener('click', function (e) {
      if (!isTouchDevice) return;
      e.preventDefault();
      if (isOpen) close(); else open();
    });

    document.addEventListener('click', function (e) {
      if (!isTouchDevice || !isOpen) return;
      if (!wrap.contains(e.target as Node)) close();
    });
    document.addEventListener('keydown', function (e) {
      if ((e as KeyboardEvent).key === 'Escape' && isOpen) close();
    });

    var copyBtn = popup.querySelector('[data-qr-copy]') as HTMLButtonElement;
    if (copyBtn) {
      copyBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var url = wrap.__mfQrUrl || window.location.href;
        var abs = url.indexOf('http') === 0 ? url : (window.location.origin + url);
        tryCopy(abs, copyBtn);
      });
    }
  }

  function adjustPopupPosition(wrap: HTMLElement, popup: HTMLElement): void {
    try {
      popup.classList.remove('is-left-aligned');
      var rect = popup.getBoundingClientRect();
      if (rect.left < 8) popup.classList.add('is-left-aligned');
    } catch (_e) { }
  }

  function tryCopy(text: string, btn: HTMLButtonElement): void {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { flashCopy(btn); }, function () { fallbackCopy(text, btn); });
      } else {
        fallbackCopy(text, btn);
      }
    } catch (_e) {
      fallbackCopy(text, btn);
    }
  }

  function flashCopy(btn: HTMLButtonElement): void {
    var orig = btn.textContent || '';
    btn.textContent = 'Copied!';
    btn.setAttribute('data-copied', '1');
    setTimeout(function () {
      btn.textContent = orig;
      btn.removeAttribute('data-copied');
    }, 1800);
  }

  function fallbackCopy(text: string, btn: HTMLButtonElement): void {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      flashCopy(btn);
    } catch (_e) { }
  }

  function collect(): undefined { return undefined; }
  function validate(): boolean { return true; }

  function renderProperties(container: HTMLElement, field: any, onChange: (field: any) => void): void {
    var props = getProps(field && field.widgetProps);
    field.widgetProps = props;
    container.innerHTML = '' +
      '<div class="mfw-qr-settings">' +
        '<div class="mf-widget-settings-badge-wrap"><span class="mf-widget-settings-badge">' + esc(BADGE) + '</span></div>' +
        '<label class="mfw-prop-row"><span class="mfw-prop-label">QR size</span><input type="number" min="120" max="280" step="4" data-prop="size" value="' + esc(props.size) + '"></label>' +
        '<label class="mfw-prop-row"><span class="mfw-prop-label">Popup caption</span><input type="text" data-prop="label" value="' + esc(props.label) + '"></label>' +
        '<label class="mfw-prop-row"><span class="mfw-prop-label">URL override</span><input type="text" data-prop="urlOverride" value="' + esc(props.urlOverride) + '" placeholder="Leave empty to use Renderer Host URL"></label>' +
        '<label class="mfw-prop-row"><span class="mfw-prop-label">Trigger text</span><input type="text" data-prop="triggerLabel" value="' + esc(props.triggerLabel) + '"></label>' +
        '<div class="mfw-prop-row mfw-qr-logo-row">' +
          '<span class="mfw-prop-label">Center logo</span>' +
          '<input type="text" data-prop="logoUrl" value="' + esc(props.logoUrl) + '" placeholder="Default brand logo (type a URL to override, or \'none\' to disable)">' +
          '<div class="mfw-qr-logo-actions">' +
            '<input type="file" accept="image/*" data-qr-logo-file style="display:none">' +
            '<button type="button" class="mfw-qr-logo-pick" data-qr-logo-pick>Choose logo</button>' +
            '<button type="button" class="mfw-qr-logo-clear" data-qr-logo-clear>Clear</button>' +
          '</div>' +
          '<div class="mfw-qr-logo-preview" data-qr-logo-preview>' + (String(props.logoUrl || '').toLowerCase() === 'none' ? '<span>Logo disabled</span>' : '<img src="' + esc(props.logoUrl || DEFAULT_LOGO) + '" alt="QR logo preview">') + '</div>' +
        '</div>' +
        '<label class="mfw-prop-row"><span class="mfw-prop-label">Logo size (%)</span><input type="number" min="10" max="34" step="1" data-prop="logoSize" value="' + esc(props.logoSize) + '"></label>' +
        '<label class="mfw-prop-row"><span class="mfw-prop-label">Logo padding (px)</span><input type="number" min="0" max="18" step="1" data-prop="logoPadding" value="' + esc(props.logoPadding) + '"></label>' +
        '<label class="mfw-prop-row"><span class="mfw-prop-label">Logo shape</span><select data-prop="logoShape">' +
          '<option value="rounded"' + (props.logoShape === 'rounded' ? ' selected' : '') + '>Rounded square</option>' +
          '<option value="circle"' + (props.logoShape === 'circle' ? ' selected' : '') + '>Circle</option>' +
          '<option value="square"' + (props.logoShape === 'square' ? ' selected' : '') + '>Square</option>' +
        '</select></label>' +
        '<label class="mfw-prop-check"><input type="checkbox" data-prop="showCopyButton"' + (props.showCopyButton ? ' checked' : '') + '> Show copy link button</label>' +
        '<label class="mfw-prop-check"><input type="checkbox" data-prop="showUrl"' + (props.showUrl ? ' checked' : '') + '> Show resolved URL</label>' +
      '</div>';

    var controls = container.querySelectorAll('[data-prop]');
    function pushChange(): void {
      var next: any = Object.assign({}, props);
      for (var i = 0; i < controls.length; i++) {
        var el = controls[i] as HTMLInputElement;
        var name = el.getAttribute('data-prop') || '';
        if (!name) continue;
        if (el.type === 'checkbox') next[name] = !!el.checked;
        else if (name === 'size' || name === 'logoSize' || name === 'logoPadding') next[name] = Number(el.value || (props as any)[name]) || (props as any)[name];
        else next[name] = el.value;
      }
      field.widgetProps = getProps(next);
      renderLogoPreview();
      if (typeof onChange === 'function') onChange(field);
    }
    for (var j = 0; j < controls.length; j++) {
      controls[j].addEventListener('input', pushChange);
      controls[j].addEventListener('change', pushChange);
    }

    var logoInput = container.querySelector('[data-prop="logoUrl"]') as HTMLInputElement | null;
    var fileInput = container.querySelector('[data-qr-logo-file]') as HTMLInputElement | null;
    var pickBtn = container.querySelector('[data-qr-logo-pick]') as HTMLButtonElement | null;
    var clearBtn = container.querySelector('[data-qr-logo-clear]') as HTMLButtonElement | null;
    var preview = container.querySelector('[data-qr-logo-preview]') as HTMLElement | null;
    function renderLogoPreview(): void {
      if (!preview) return;
      var value = logoInput ? String(logoInput.value || '').trim() : '';
      preview.innerHTML = value ? '<img src="' + esc(value) + '" alt="QR logo preview">' : '<span>No logo selected</span>';
    }
    if (pickBtn && fileInput) {
      pickBtn.addEventListener('click', function () { fileInput!.click(); });
      fileInput.addEventListener('change', function () {
        var file = fileInput!.files && fileInput!.files[0];
        if (!file || !logoInput) return;
        if (!/^image\//i.test(file.type || '')) return;
        var reader = new FileReader();
        reader.onload = function () { logoInput!.value = String(reader.result || ''); pushChange(); };
        reader.readAsDataURL(file);
      });
    }
    if (clearBtn && logoInput) {
      clearBtn.addEventListener('click', function () {
        logoInput!.value = '';
        if (fileInput) fileInput.value = '';
        pushChange();
      });
    }
    renderLogoPreview();
  }

  var CSS_INJECTED = false;
  function injectCss(): void {
    if (CSS_INJECTED || typeof document === 'undefined') return;
    CSS_INJECTED = true;
    var id = 'mf-qr-corner-styles';
    if (document.getElementById(id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = [
      '.mf-qr-corner{position:absolute;top:10px;right:10px;z-index:12;font-family:"Inter",system-ui,sans-serif;display:inline-block;}',
      '.mf-qr-corner-trigger{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:34px;height:34px;padding:0 8px;border:1px solid rgba(15,23,42,.16);background:rgba(255,255,255,.96);color:#4b5563;border-radius:10px;box-shadow:0 6px 18px rgba(15,23,42,.08);cursor:pointer;line-height:1;font-weight:700;font-size:11px;transition:background .15s,border-color .15s,box-shadow .15s;}',
      '.mf-qr-corner-trigger:hover{background:#fff;border-color:rgba(15,23,42,.28);box-shadow:0 10px 24px rgba(15,23,42,.14);}',
      '.mf-qr-corner-icon{width:18px;height:18px;flex:0 0 auto;}',
      '.mf-qr-corner-trigger-text{display:none;}',
      '.mf-qr-corner-popup{position:absolute;top:calc(100% + 10px);right:0;background:#fff;border:1px solid rgba(15,23,42,.10);border-radius:16px;box-shadow:0 16px 48px rgba(15,23,42,.18),0 2px 8px rgba(15,23,42,.08);padding:14px;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:196px;opacity:0;pointer-events:none;transform:translateY(-6px);transition:opacity .16s ease,transform .16s ease;}',
      '.mf-qr-corner-popup.is-open{opacity:1;pointer-events:auto;transform:translateY(0);}',
      '.mf-qr-corner-popup.is-left-aligned{right:auto;left:0;}',
      '.mf-qr-corner-canvas-wrap{position:relative;display:inline-block;}',
      '.mf-qr-corner-canvas{display:block;border-radius:6px;background:#fff;}',
      '.mf-qr-corner-boot{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.92);border-radius:6px;}',
      '.mf-qr-corner-spinner{width:20px;height:20px;border:2px solid #e5e7eb;border-top-color:#6b7280;border-radius:50%;animation:mf-qr-corner-spin .7s linear infinite;}',
      '@keyframes mf-qr-corner-spin{to{transform:rotate(360deg)}}',
      '.mf-qr-corner-label{font-size:12px;font-weight:500;color:#4b5563;text-align:center;max-width:200px;line-height:1.4;}',
      '.mf-qr-corner-url{font-size:9px;color:#94a3b8;word-break:break-all;max-width:190px;text-align:center;}',
      '.mf-qr-corner-copy{display:inline-flex;align-items:center;gap:6px;border:1px solid #dbe4f0;background:#f8fafc;color:#111827;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;transition:background .12s,border-color .12s;}',
      '.mf-qr-corner-copy:hover{background:#f1f5f9;border-color:#94a3b8;}',
      '.mf-qr-corner-copy[data-copied]{background:#dcfce7;border-color:#86efac;color:#166534;}',
      '.mfw-qr-logo-row{display:grid;gap:8px;}',
      '.mfw-qr-logo-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
      '.mfw-qr-logo-pick,.mfw-qr-logo-clear{border:1px solid #dbe4f0;background:#fff;color:#111827;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;}',
      '.mfw-qr-logo-pick:hover,.mfw-qr-logo-clear:hover{background:#f8fafc;border-color:#94a3b8;}',
      '.mfw-qr-logo-preview{min-height:40px;border:1px dashed #cbd5e1;border-radius:8px;background:#f8fafc;display:flex;align-items:center;gap:8px;padding:7px 8px;font-size:12px;color:#64748b;}',
      '.mfw-qr-logo-preview img{width:32px;height:32px;object-fit:contain;border-radius:6px;background:#fff;box-shadow:0 0 0 1px rgba(15,23,42,.08);}',
      '@media (max-width: 767px){.mf-qr-corner{top:8px;right:8px}.mf-qr-corner-trigger{min-width:32px;height:32px;padding:0 7px}.mf-qr-corner-popup{padding:12px;min-width:176px;}}'
    ].join('');
    (document.head || document.body).appendChild(style);
  }

  injectCss();

  MegaFormWidgets.register('QRCode', {
    meta: {
      icon: 'fa-qrcode',
      label: 'QR Code • ' + BADGE,
      category: 'widgets',
      color: '#6b7280',
      defaultWidth: '100%'
    },
    defaults: defaults,
    render: render,
    bind: bind,
    collect: collect,
    validate: validate,
    renderProperties: renderProperties,
    renderPropertiesPanel: renderProperties,
    renderBuilderPanel: renderProperties
  });


  // QR code generator — vendored stable engine (Kazuhiko Arase via qrcode-terminal)
  // MIT license preserved in vendored source comments above.
// vendored from qrcode-terminal/QRErrorCorrectLevel.js
var QRErrorCorrectLevel = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};

// vendored from qrcode-terminal/QRMode.js
var QRMode = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};

// vendored from qrcode-terminal/QRMaskPattern.js
var QRMaskPattern = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};

// vendored from qrcode-terminal/QRMath.js
var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}


// vendored from qrcode-terminal/QRPolynomial.js

function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		// recursive call
		return new QRPolynomial(num, 0).mod(e);
	}
};


// vendored from qrcode-terminal/QRBitBuffer.js
function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};


// vendored from qrcode-terminal/QR8bitByte.js

function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			// not JIS ...
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};


// vendored from qrcode-terminal/QRRSBlock.js

function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [

	// L
	// M
	// Q
	// H

	// 1
	[1, 26, 19],
	[1, 26, 16],
	[1, 26, 13],
	[1, 26, 9],
	
	// 2
	[1, 44, 34],
	[1, 44, 28],
	[1, 44, 22],
	[1, 44, 16],

	// 3
	[1, 70, 55],
	[1, 70, 44],
	[2, 35, 17],
	[2, 35, 13],

	// 4		
	[1, 100, 80],
	[2, 50, 32],
	[2, 50, 24],
	[4, 25, 9],
	
	// 5
	[1, 134, 108],
	[2, 67, 43],
	[2, 33, 15, 2, 34, 16],
	[2, 33, 11, 2, 34, 12],
	
	// 6
	[2, 86, 68],
	[4, 43, 27],
	[4, 43, 19],
	[4, 43, 15],
	
	// 7		
	[2, 98, 78],
	[4, 49, 31],
	[2, 32, 14, 4, 33, 15],
	[4, 39, 13, 1, 40, 14],
	
	// 8
	[2, 121, 97],
	[2, 60, 38, 2, 61, 39],
	[4, 40, 18, 2, 41, 19],
	[4, 40, 14, 2, 41, 15],
	
	// 9
	[2, 146, 116],
	[3, 58, 36, 2, 59, 37],
	[4, 36, 16, 4, 37, 17],
	[4, 36, 12, 4, 37, 13],
	
	// 10		
	[2, 86, 68, 2, 87, 69],
	[4, 69, 43, 1, 70, 44],
	[6, 43, 19, 2, 44, 20],
	[6, 43, 15, 2, 44, 16],

	// 11
	[4, 101, 81],
	[1, 80, 50, 4, 81, 51],
	[4, 50, 22, 4, 51, 23],
	[3, 36, 12, 8, 37, 13],

	// 12
	[2, 116, 92, 2, 117, 93],
	[6, 58, 36, 2, 59, 37],
	[4, 46, 20, 6, 47, 21],
	[7, 42, 14, 4, 43, 15],

	// 13
	[4, 133, 107],
	[8, 59, 37, 1, 60, 38],
	[8, 44, 20, 4, 45, 21],
	[12, 33, 11, 4, 34, 12],

	// 14
	[3, 145, 115, 1, 146, 116],
	[4, 64, 40, 5, 65, 41],
	[11, 36, 16, 5, 37, 17],
	[11, 36, 12, 5, 37, 13],

	// 15
	[5, 109, 87, 1, 110, 88],
	[5, 65, 41, 5, 66, 42],
	[5, 54, 24, 7, 55, 25],
	[11, 36, 12],

	// 16
	[5, 122, 98, 1, 123, 99],
	[7, 73, 45, 3, 74, 46],
	[15, 43, 19, 2, 44, 20],
	[3, 45, 15, 13, 46, 16],

	// 17
	[1, 135, 107, 5, 136, 108],
	[10, 74, 46, 1, 75, 47],
	[1, 50, 22, 15, 51, 23],
	[2, 42, 14, 17, 43, 15],

	// 18
	[5, 150, 120, 1, 151, 121],
	[9, 69, 43, 4, 70, 44],
	[17, 50, 22, 1, 51, 23],
	[2, 42, 14, 19, 43, 15],

	// 19
	[3, 141, 113, 4, 142, 114],
	[3, 70, 44, 11, 71, 45],
	[17, 47, 21, 4, 48, 22],
	[9, 39, 13, 16, 40, 14],

	// 20
	[3, 135, 107, 5, 136, 108],
	[3, 67, 41, 13, 68, 42],
	[15, 54, 24, 5, 55, 25],
	[15, 43, 15, 10, 44, 16],

	// 21
	[4, 144, 116, 4, 145, 117],
	[17, 68, 42],
	[17, 50, 22, 6, 51, 23],
	[19, 46, 16, 6, 47, 17],

	// 22
	[2, 139, 111, 7, 140, 112],
	[17, 74, 46],
	[7, 54, 24, 16, 55, 25],
	[34, 37, 13],

	// 23
	[4, 151, 121, 5, 152, 122],
	[4, 75, 47, 14, 76, 48],
	[11, 54, 24, 14, 55, 25],
	[16, 45, 15, 14, 46, 16],

	// 24
	[6, 147, 117, 4, 148, 118],
	[6, 73, 45, 14, 74, 46],
	[11, 54, 24, 16, 55, 25],
	[30, 46, 16, 2, 47, 17],

	// 25
	[8, 132, 106, 4, 133, 107],
	[8, 75, 47, 13, 76, 48],
	[7, 54, 24, 22, 55, 25],
	[22, 45, 15, 13, 46, 16],

	// 26
	[10, 142, 114, 2, 143, 115],
	[19, 74, 46, 4, 75, 47],
	[28, 50, 22, 6, 51, 23],
	[33, 46, 16, 4, 47, 17],

	// 27
	[8, 152, 122, 4, 153, 123],
	[22, 73, 45, 3, 74, 46],
	[8, 53, 23, 26, 54, 24],
	[12, 45, 15, 28, 46, 16],

	// 28
	[3, 147, 117, 10, 148, 118],
	[3, 73, 45, 23, 74, 46],
	[4, 54, 24, 31, 55, 25],
	[11, 45, 15, 31, 46, 16],

	// 29
	[7, 146, 116, 7, 147, 117],
	[21, 73, 45, 7, 74, 46],
	[1, 53, 23, 37, 54, 24],
	[19, 45, 15, 26, 46, 16],

	// 30
	[5, 145, 115, 10, 146, 116],
	[19, 75, 47, 10, 76, 48],
	[15, 54, 24, 25, 55, 25],
	[23, 45, 15, 25, 46, 16],

	// 31
	[13, 145, 115, 3, 146, 116],
	[2, 74, 46, 29, 75, 47],
	[42, 54, 24, 1, 55, 25],
	[23, 45, 15, 28, 46, 16],

	// 32
	[17, 145, 115],
	[10, 74, 46, 23, 75, 47],
	[10, 54, 24, 35, 55, 25],
	[19, 45, 15, 35, 46, 16],

	// 33
	[17, 145, 115, 1, 146, 116],
	[14, 74, 46, 21, 75, 47],
	[29, 54, 24, 19, 55, 25],
	[11, 45, 15, 46, 46, 16],

	// 34
	[13, 145, 115, 6, 146, 116],
	[14, 74, 46, 23, 75, 47],
	[44, 54, 24, 7, 55, 25],
	[59, 46, 16, 1, 47, 17],

	// 35
	[12, 151, 121, 7, 152, 122],
	[12, 75, 47, 26, 76, 48],
	[39, 54, 24, 14, 55, 25],
	[22, 45, 15, 41, 46, 16],

	// 36
	[6, 151, 121, 14, 152, 122],
	[6, 75, 47, 34, 76, 48],
	[46, 54, 24, 10, 55, 25],
	[2, 45, 15, 64, 46, 16],

	// 37
	[17, 152, 122, 4, 153, 123],
	[29, 74, 46, 14, 75, 47],
	[49, 54, 24, 10, 55, 25],
	[24, 45, 15, 46, 46, 16],

	// 38
	[4, 152, 122, 18, 153, 123],
	[13, 74, 46, 32, 75, 47],
	[48, 54, 24, 14, 55, 25],
	[42, 45, 15, 32, 46, 16],

	// 39
	[20, 147, 117, 4, 148, 118],
	[40, 75, 47, 7, 76, 48],
	[43, 54, 24, 22, 55, 25],
	[10, 45, 15, 67, 46, 16],

	// 40
	[19, 148, 118, 6, 149, 119],
	[18, 75, 47, 31, 76, 48],
	[34, 54, 24, 34, 55, 25],
	[20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}

	var length = rsBlock.length / 3;
	
	var list = [];
	
	for (var i = 0; i < length; i++) {

		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];

		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {

	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default :
		return undefined;
	}
};


// vendored from qrcode-terminal/QRUtil.js

var QRUtil = {

    PATTERN_POSITION_TABLE : [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],        
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {

        var digit = 0;

        while (data !== 0) {
            digit++;
            data >>>= 1;
        }

        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        
        switch (maskPattern) {
            
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;

        default :
            throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {

        var a = new QRPolynomial([1], 0);

        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }

        return a;
    },

    getLengthInBits : function(mode, type) {

        if (1 <= type && type < 10) {

            // 1 - 9

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 27) {

            // 10 - 26

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 41) {

            // 27 - 40

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default :
                throw new Error("mode:" + mode);
            }

        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        
        // LEVEL1
        
        for (row = 0; row < moduleCount; row++) {

            for (col = 0; col < moduleCount; col++) {

                var sameCount = 0;
                var dark = qrCode.isDark(row, col);

                for (var r = -1; r <= 1; r++) {

                    if (row + r < 0 || moduleCount <= row + r) {
                        continue;
                    }

                    for (var c = -1; c <= 1; c++) {

                        if (col + c < 0 || moduleCount <= col + c) {
                            continue;
                        }

                        if (r === 0 && c === 0) {
                            continue;
                        }

                        if (dark === qrCode.isDark(row + r, col + c) ) {
                            sameCount++;
                        }
                    }
                }

                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        // LEVEL2

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        // LEVEL3

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }

        // LEVEL4
        
        var darkCount = 0;

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) {
                    darkCount++;
                }
            }
        }
        
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;

        return lostPoint;       
    }

};


// vendored from qrcode-terminal/index.js
//---------------------------------------------------------------------
// QRCode for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//   http://www.opensource.org/licenses/mit-license.php
//
// The word "QR Code" is registered trademark of 
// DENSO WAVE INCORPORATED
//   http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------
// Modified to work in node for this project (and some refactoring)
//---------------------------------------------------------------------


function QRCodeLib(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCodeLib.prototype = {
	
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		// Calculate automatically typeNumber if provided is < 1
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber < 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = typeNumber;
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			
			this.modules[row] = new Array(this.moduleCount);
			
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;//(col + row) % 3;
			}
		}
	
		this.setupPositionProbePattern(0, 0);
		this.setupPositionProbePattern(this.moduleCount - 7, 0);
		this.setupPositionProbePattern(0, this.moduleCount - 7);
		this.setupPositionAdjustPattern();
		this.setupTimingPattern();
		this.setupTypeInfo(test, maskPattern);
		
		if (this.typeNumber >= 7) {
			this.setupTypeNumber(test);
		}
	
		if (this.dataCache === null) {
			this.dataCache = QRCodeLib.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		
		for (var r = -1; r <= 7; r++) {
			
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			
			for (var c = -1; c <= 7; c++) {
				
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
	
		var minLostPoint = 0;
		var pattern = 0;
	
		for (var i = 0; i < 8; i++) {
			
			this.makeImpl(true, i);
	
			var lostPoint = QRUtil.getLostPoint(this);
	
			if (i === 0 || minLostPoint >  lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
	
		return pattern;
	},
	
	createMovieClip : function(target_mc, instance_name, depth) {
	
		var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
		var cs = 1;
	
		this.make();

		for (var row = 0; row < this.modules.length; row++) {
			
			var y = row * cs;
			
			for (var col = 0; col < this.modules[row].length; col++) {
	
				var x = col * cs;
				var dark = this.modules[row][col];
			
				if (dark) {
					qr_mc.beginFill(0, 100);
					qr_mc.moveTo(x, y);
					qr_mc.lineTo(x + cs, y);
					qr_mc.lineTo(x + cs, y + cs);
					qr_mc.lineTo(x, y + cs);
					qr_mc.endFill();
				}
			}
		}
		
		return qr_mc;
	},

	setupTimingPattern : function() {
		
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) {
				continue;
			}
			this.modules[r][6] = (r % 2 === 0);
		}
	
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) {
				continue;
			}
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
	
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		
		for (var i = 0; i < pos.length; i++) {
		
			for (var j = 0; j < pos.length; j++) {
			
				var row = pos[i];
				var col = pos[j];
				
				if (this.modules[row][col] !== null) {
					continue;
				}
				
				for (var r = -2; r <= 2; r++) {
				
					for (var c = -2; c <= 2; c++) {
					
						if (Math.abs(r) === 2 || 
                            Math.abs(c) === 2 ||
                            (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
	
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
	
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
	
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
	
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
	
		// vertical		
		for (var v = 0; v < 15; v++) {
	
			mod = (!test && ( (bits >> v) & 1) === 1);
	
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
	
		// horizontal
		for (var h = 0; h < 15; h++) {
	
			mod = (!test && ( (bits >> h) & 1) === 1);
			
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
	
		// fixed module
		this.modules[this.moduleCount - 8][8] = (!test);
	
	},
	
	mapData : function(data, maskPattern) {
		
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
	
			if (col === 6) col--;
	
			while (true) {
	
				for (var c = 0; c < 2; c++) {
					
					if (this.modules[row][col - c] === null) {
						
						var dark = false;
	
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
	
						var mask = QRUtil.getMask(maskPattern, row, col - c);
	
						if (mask) {
							dark = !dark;
						}
						
						this.modules[row][col - c] = dark;
						bitIndex--;
	
						if (bitIndex === -1) {
							byteIndex++;
							bitIndex = 7;
						}
					}
				}
								
				row += inc;
	
				if (row < 0 || this.moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
		
	}

};

QRCodeLib.PAD0 = 0xEC;
QRCodeLib.PAD1 = 0x11;

QRCodeLib.createData = function(typeNumber, errorCorrectLevel, dataList) {
	
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	// calc num max data.
	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + 
            buffer.getLengthInBits() + 
            ">" +  
            totalDataCount * 8 + 
            ")");
	}

	// end code
	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	// padding
	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	// padding
	while (true) {
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCodeLib.PAD0, 8);
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCodeLib.PAD1, 8);
	}

	return QRCodeLib.createBytes(buffer, rsBlocks);
};

QRCodeLib.createBytes = function(buffer, rsBlocks) {

	var offset = 0;
	
	var maxDcCount = 0;
	var maxEcCount = 0;
	
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {

		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;

		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		
		dcdata[r] = new Array(dcCount);
		
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);

		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}

	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;

};


  function addQuietZone(matrix: number[][], quietZone: number): number[][] {
    if (!quietZone || quietZone < 1) return matrix;
    var size = matrix.length;
    var ns = size + quietZone * 2;
    var out: number[][] = [];
    for (var r = 0; r < ns; r++) {
      out[r] = [];
      for (var c = 0; c < ns; c++) out[r][c] = 0;
    }
    for (var i = 0; i < size; i++) {
      for (var j = 0; j < size; j++) out[i + quietZone][j + quietZone] = matrix[i][j];
    }
    return out;
  }

  function generateQRMatrix(data: string, ecLevel: string, quietZone: number): number[][] {
    var level = QRErrorCorrectLevel.M;
    switch (ecLevel) {
      case 'L': level = QRErrorCorrectLevel.L; break;
      case 'Q': level = QRErrorCorrectLevel.Q; break;
      case 'H': level = QRErrorCorrectLevel.H; break;
      default: level = QRErrorCorrectLevel.M; break;
    }
    var qr = new QRCodeLib(0, level);
    qr.addData(String(data || ''));
    qr.make();
    var count = qr.getModuleCount();
    var matrix: number[][] = [];
    for (var row = 0; row < count; row++) {
      matrix[row] = [];
      for (var col = 0; col < count; col++) matrix[row][col] = qr.isDark(row, col) ? 1 : 0;
    }
    return addQuietZone(matrix, quietZone);
  }

  function drawQRToCanvas(canvas: HTMLCanvasElement, matrix: number[][], darkColor: string, lightColor: string): void {
    var n = matrix.length;
    var size = canvas.width;
    var moduleSize = size / n;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = darkColor;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (matrix[r][c]) {
          var x = Math.round(c * moduleSize);
          var y = Math.round(r * moduleSize);
          var w = Math.ceil((c + 1) * moduleSize) - x;
          var h = Math.ceil((r + 1) * moduleSize) - y;
          ctx.fillRect(x, y, w, h);
        }
      }
    }
  }

  function roundedRect(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
    r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // [restore 20260617-15] Draws the opt-in center logo over the QR matrix: a white
  // rounded/circle/square plate (with soft shadow) then the clipped logo image. Fail-soft —
  // a missing/slow logo never blocks the QR (onerror + 3s timeout both call done()).
  function drawLogoToCanvas(canvas: HTMLCanvasElement, props: QRCodeProps, done: () => void): void {
    var logoUrl = effectiveLogo(props);
    if (!logoUrl) { done(); return; }
    var ctx = canvas.getContext('2d');
    if (!ctx) { done(); return; }
    var img = new Image();
    var finished = false;
    function finish(): void {
      if (finished) return;
      finished = true;
      done();
    }
    img.onload = function () {
      try {
        var size = canvas.width;
        var logoSize = Math.round(size * (props.logoSize / 100));
        var pad = Number(props.logoPadding || 0);
        var boxSize = logoSize + pad * 2;
        var boxX = Math.round((size - boxSize) / 2);
        var boxY = Math.round((size - boxSize) / 2);
        var logoX = boxX + pad;
        var logoY = boxY + pad;
        var radius = props.logoShape === 'circle' ? boxSize / 2 : (props.logoShape === 'square' ? 0 : Math.max(6, Math.round(boxSize * 0.18)));
        ctx.save();
        ctx.shadowColor = 'rgba(15,23,42,.12)';
        ctx.shadowBlur = Math.max(2, Math.round(size * 0.018));
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#ffffff';
        if (props.logoShape === 'circle') {
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, boxSize / 2, 0, Math.PI * 2);
          ctx.closePath();
        } else {
          roundedRect(ctx, boxX, boxY, boxSize, boxSize, radius);
        }
        ctx.fill();
        ctx.restore();
        ctx.save();
        if (props.logoShape === 'circle') {
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, logoSize / 2, 0, Math.PI * 2);
          ctx.closePath();
        } else {
          roundedRect(ctx, logoX, logoY, logoSize, logoSize, props.logoShape === 'square' ? 0 : Math.max(4, Math.round(logoSize * 0.16)));
        }
        ctx.clip();
        ctx.drawImage(img, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      } catch (e) {
        try { console.warn('[MegaFormQRCodeCorner] Logo draw failed:', e); } catch (_e) { }
      }
      finish();
    };
    img.onerror = function () {
      try { console.warn('[MegaFormQRCodeCorner] Logo image failed to load:', logoUrl); } catch (_e) { }
      finish();
    };
    img.src = logoUrl;
    setTimeout(finish, 3000);
  }

})(typeof window !== 'undefined' ? window : globalThis);
