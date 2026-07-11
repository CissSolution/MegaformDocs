// ============================================================
// MegaForm Builder — HTML Token Designer (v20260601-B27)
// File: src/builder/token-designer.ts
//
// Opens a modal popup that lets the author edit every
// {{content:*}} token in one place — text tokens via textarea,
// image tokens via input + Upload button + Gallery picker.
//
// Inspired by the CISS.SideMenu ACME settings panel pattern
// (modal overlay, backdrop blur, ESC to close, footer actions).
//
// External assumptions (all already in place):
//   • window.MegaFormBuilder.state.schema.settings.customHtml/customContent
//   • POST api/Upload/Image  → { url }
//   • GET  api/Upload/List   → { items: [{url, fileName, ...}] }
// ============================================================
// @ts-nocheck
'use strict';
import { wt } from './designer-i18n';

(function init() {
  if ((window as any).__MFTokenDesignerLoaded) return;

  var B: any = (window as any).MegaFormBuilder;
  if (!B) {
    // [2026-06-18] Builder not ready at import time — DO NOT bail. Bailing here left
    // window.MFTokenDesigner UNREGISTERED, so the "Custom HTML editor" button (and the
    // canvas "Custom HTML Active" banner trigger) silently failed with "Token Designer
    // not loaded". Retry until MegaFormBuilder exists so registration always happens.
    (window as any).__mfTokenDesignerTries = ((window as any).__mfTokenDesignerTries || 0) + 1;
    if ((window as any).__mfTokenDesignerTries < 200) setTimeout(init, 50);
    return;
  }
  (window as any).__MFTokenDesignerLoaded = true;

  // ── Token-name → "looks like an image field" heuristic ────────────
  // Authors don't have to mark anything; if a key name MATCHES (whole
  // segment match, not substring) any of these tokens we render the rich
  // image control. Substring match would mis-classify e.g. "hero_title"
  // because of "hero" — use \b boundaries (treat '_' and '-' as breaks).
  var IMAGE_HINTS = [
    'image', 'images', 'img', 'logo', 'banner', 'slider', 'slide',
    'background', 'bg', 'photo', 'photos', 'avatar', 'thumb', 'thumbnail',
    'cover', 'icon', 'picture', 'pic', 'wallpaper', 'gallery', 'hero', 'mascot'
  ];
  function isImageToken(key: string): boolean {
    var parts = String(key || '').toLowerCase().split(/[_\-\s]+/).filter(Boolean);
    if (!parts.length) return false;
    for (var i = 0; i < parts.length; i++) {
      if (IMAGE_HINTS.indexOf(parts[i]) !== -1) return true;
    }
    // Also accept if the saved value already looks like an image URL
    try {
      var cur = String(((B.state.schema.settings || {}).customContent || {})[key] || '');
      if (/\.(jpe?g|png|gif|webp|svg|bmp)(\?|$)/i.test(cur)) return true;
    } catch (e) {}
    return false;
  }

  function parseTokenKeys(html: string): string[] {
    var seen: Record<string, boolean> = {};
    var keys: string[] = [];
    String(html || '').replace(/\{\{content:([a-zA-Z0-9_-]+)\}\}/g, function (_m: string, k: string) {
      if (!seen[k]) { seen[k] = true; keys.push(k); }
      return _m;
    });
    return keys;
  }

  // ── Inline <img> detection inside Custom HTML ─────────────────────
  // Authors don't always use {{content:*}} tokens; detect raw <img src>
  // tags so they can be edited from the Image tokens tab without hand-editing HTML.
  function detectInlineImages(html: string): any[] {
    var imgs: any[] = [];
    var re = /<img\b([^>]*)>/gi;
    var m: any;
    while ((m = re.exec(String(html || ''))) !== null) {
      var attrs = m[1];
      var srcM = /\ssrc=(["'])([^"']*)\1/i.exec(attrs);
      var classM = /\sclass=(["'])([^"']*)\1/i.exec(attrs);
      var altM = /\salt=(["'])([^"']*)\1/i.exec(attrs);
      imgs.push({
        kind: 'inline',
        index: imgs.length,
        start: m.index,
        attrBlock: attrs,
        src: srcM ? srcM[2] : '',
        className: classM ? classM[2] : '',
        alt: altM ? altM[2] : ''
      });
    }
    return imgs;
  }

  function setInlineImageSrc(inline: any, newSrc: string) {
    var s = B.state.schema.settings;
    var html = s.customHtml || s.CustomHtml || '';
    var occ = 0;
    var replaced = html.replace(/(<img\b[^>]*?\ssrc=["'])([^"']*)(["'])/gi, function (match, p1, _src, p3) {
      if (occ === inline.index) { occ++; return p1 + newSrc + p3; }
      occ++; return match;
    });
    s.customHtml = s.CustomHtml = replaced;
    inline.src = newSrc;
    B.state.isDirty = true;
    if (B.markDirty) B.markDirty();
    try { B.callModule('canvas', 'render'); } catch (e) {}
  }

  function ensureContent(): Record<string, string> {
    var s = B.state.schema.settings = B.state.schema.settings || {};
    if (!s.customContent || typeof s.customContent !== 'object') {
      s.customContent = s.CustomContent && typeof s.CustomContent === 'object'
        ? s.CustomContent : {};
    }
    return s.customContent;
  }

  function apiBase(): string {
    var w: any = window as any;
    if (w.__MF_PLATFORM__ && w.__MF_PLATFORM__.apiBase) return String(w.__MF_PLATFORM__.apiBase).replace(/\/?$/, '/');
    if (w.API_BASE) return String(w.API_BASE).replace(/\/?$/, '/');
    // [B51] Platform-aware fallback
    var pf = w.__MF_PLATFORM__ || {};
    var platform = String(pf.platform || '').toLowerCase();
    if (platform === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
      return '/api/MegaForm/';
    }
    return '/DesktopModules/MegaForm/API/';
  }

  // [2026-06-12] Mount on document.body — NOT inside #mf-builder-root.
  // Earlier ([B31]) we mounted inside the Builder shell to dodge the fullscreen
  // takeover (which hides body > * lacking data-mf-overlay). But the modal sets
  // data-mf-overlay='1', so the takeover already whitelists it on body. Mounting
  // inside the shell trapped the position:fixed backdrop in the shell's stacking
  // context — it covered the geometry but painted BELOW the page header, so the
  // dim never reached the header and the popup looked half-broken ("vỡ ra cuối
  // trang"). A body child escapes that and dims the whole viewport.
  function getMountTarget(): HTMLElement {
    return document.body;
  }

  // ── Upload one file via /api/Upload/Image, returns the saved URL ──
  function uploadImage(file: File): Promise<string> {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append('file', file, file.name);
      var url = apiBase() + 'Upload/Image';
      var headers: Record<string, string> = {};
      // DNN antiforgery
      try {
        var token = (window as any).ServicesFramework
          ? (window as any).ServicesFramework(-1).getAntiForgeryValue()
          : (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value;
        if (token) headers['RequestVerificationToken'] = token;
      } catch (e) {}
      fetch(url, { method: 'POST', body: fd, headers: headers, credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
          return r.json();
        })
        .then(function (j) {
          if (!j || !j.url) throw new Error(wt('des.shell.uploadNoUrl', 'Upload returned no URL'));
          resolve(j.url);
        })
        .catch(reject);
    });
  }

  // ── Gallery: fetch + cache list of previously uploaded images ─────
  var _galleryCache: any[] | null = null;
  function fetchGallery(force?: boolean): Promise<any[]> {
    if (_galleryCache && !force) return Promise.resolve(_galleryCache);
    var url = apiBase() + 'Upload/List';
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : { items: [] }; })
      .then(function (j) {
        _galleryCache = (j && j.items) || [];
        return _galleryCache;
      })
      .catch(function () { _galleryCache = []; return _galleryCache; });
  }

  // ── Modal scaffolding ────────────────────────────────────────────
  function open() {
    var schema = B.state.schema || {};
    var s = schema.settings = schema.settings || {};
    var html = s.customHtml || s.CustomHtml || '';
    var keys = parseTokenKeys(html);
    var content = ensureContent();
    // Persist any new keys to schema (mirrors syncCustomContentKeysFromHtml)
    var next: Record<string, string> = {};
    keys.forEach(function (k) { next[k] = String(content[k] || ''); });
    s.customContent = next;
    content = next;

    var imageKeys = keys.filter(isImageToken);
    var inlineImages = detectInlineImages(html);
    var mapKey = detectMapToken(keys, content);
    var textKeys = keys.filter(function (k) { return !isImageToken(k) && k !== mapKey; });
    // [Request B] detect sliders → show a "Slides" tab that edits each slide's
    // image + text tokens together (the default view when a slider exists).
    var slideGroups = detectSlideGroups(keys);
    var hasSlides = slideGroups.length > 0;
    var hasMap = !!mapKey;

    var existing = document.getElementById('mf-token-designer-modal');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var modal = document.createElement('div');
    modal.id = 'mf-token-designer-modal';
    modal.className = 'mf-token-designer-backdrop';
    // [B30] Builder loader's fullscreen-takeover hides every body > * that
    // lacks data-mf-overlay. Without this attr the popup is in the DOM but
    // forced display:none by the takeover.
    modal.setAttribute('data-mf-overlay', '1');
    modal.innerHTML =
      '<div class="mf-token-designer-shell" role="dialog" aria-label="' + wt('des.shell.htmlTokenDesigner', 'HTML Token Designer') + '">' +
        '<div class="mf-token-designer-head">' +
          '<div class="mf-token-designer-title">' +
            '<i class="fas fa-paint-roller"></i>' +
            '<span>' + wt('des.shell.htmlTokenDesigner', 'HTML Token Designer') + '</span>' +
            '<span class="mf-token-designer-badge">v20260626-B245</span>' +
          '</div>' +
          '<button type="button" class="mf-token-designer-close" aria-label="' + wt('des.shell.close', 'Close') + '">&times;</button>' +
        '</div>' +
        '<div class="mf-token-designer-tabs">' +
          (hasSlides
            ? '<button type="button" class="mf-token-designer-tab active" data-tab="slides">' +
                '<i class="fas fa-layer-group"></i> ' + wt('des.shell.tabSlides', 'Slides') + ' <span class="mf-token-designer-count">' +
                slideGroups.reduce(function (a: number, g: any) { return a + g.indices.length; }, 0) + '</span>' +
              '</button>'
            : '') +
          '<button type="button" class="mf-token-designer-tab' + (hasSlides ? '' : ' active') + '" data-tab="text">' +
            '<i class="fas fa-font"></i> ' + wt('des.shell.tabTextTokens', 'Text tokens') + ' <span class="mf-token-designer-count">' + textKeys.length + '</span>' +
          '</button>' +
          '<button type="button" class="mf-token-designer-tab" data-tab="image">' +
            '<i class="fas fa-image"></i> ' + wt('des.shell.tabImageTokens', 'Image tokens') + ' <span class="mf-token-designer-count">' + (imageKeys.length + inlineImages.length) + '</span>' +
          '</button>' +
          (hasMap
            ? '<button type="button" class="mf-token-designer-tab" data-tab="map">' +
                '<i class="fas fa-map-location-dot"></i> ' + wt('des.shell.tabMap', 'Map') +
              '</button>'
            : '') +
          '<button type="button" class="mf-token-designer-tab" data-tab="form">' +
            '<i class="fas fa-sliders-h"></i> ' + wt('des.shell.tabFormStrings', 'Form strings') +
          '</button>' +
        '</div>' +
        '<div class="mf-token-designer-body">' +
          (hasSlides ? '<div class="mf-token-designer-pane" data-pane="slides"></div>' : '') +
          '<div class="mf-token-designer-pane" data-pane="text"' + (hasSlides ? ' style="display:none"' : '') + '></div>' +
          '<div class="mf-token-designer-pane" data-pane="image" style="display:none"></div>' +
          (hasMap ? '<div class="mf-token-designer-pane" data-pane="map" style="display:none"></div>' : '') +
          '<div class="mf-token-designer-pane" data-pane="form" style="display:none"></div>' +
        '</div>' +
        '<div class="mf-token-designer-foot">' +
          '<div class="mf-token-designer-foot-hint">' +
            '<i class="fas fa-info-circle"></i> ' + wt('des.shell.footHintPre', 'Changes save into the form schema. Press') + ' <kbd>Esc</kbd> ' + wt('des.shell.footHintPost', 'to close.') +
          '</div>' +
          '<button type="button" class="mf-builder-btn mf-token-designer-done"><i class="fas fa-check"></i> ' + wt('des.shell.done', 'Done') + '</button>' +
        '</div>' +
      '</div>';
    getMountTarget().appendChild(modal);

    // Populate panes
    var paneText = modal.querySelector('[data-pane="text"]') as HTMLElement;
    var paneImage = modal.querySelector('[data-pane="image"]') as HTMLElement;
    var paneForm = modal.querySelector('[data-pane="form"]') as HTMLElement;

    renderTextPane(paneText, textKeys, content);
    renderImagePane(paneImage, imageKeys, content);
    renderFormPane(paneForm, s);
    var paneSlides = modal.querySelector('[data-pane="slides"]') as HTMLElement | null;
    if (paneSlides) renderSlidesPane(paneSlides, content);
    var paneMap = modal.querySelector('[data-pane="map"]') as HTMLElement | null;
    if (paneMap && mapKey) renderMapPane(paneMap, mapKey, content);

    // Tab switching
    Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-tab'), function (t: HTMLElement) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-tab'), function (x: HTMLElement) { x.classList.remove('active'); });
        t.classList.add('active');
        var name = t.getAttribute('data-tab');
        Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-pane'), function (p: HTMLElement) {
          (p as any).style.display = (p.getAttribute('data-pane') === name) ? '' : 'none';
        });
      });
    });

    function close() {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      document.removeEventListener('keydown', onEsc);
      // Re-render the inline editor so the HTML tab reflects changes
      try {
        var ev = new CustomEvent('mf:tokens-changed');
        document.dispatchEvent(ev);
      } catch (e) {}
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    modal.querySelector('.mf-token-designer-close')!.addEventListener('click', close);
    modal.querySelector('.mf-token-designer-done')!.addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
  }

  // ── Render: text-token list (textarea per token) ─────────────────
  function renderTextPane(host: HTMLElement, keys: string[], content: Record<string, string>) {
    host.innerHTML = '';
    if (!keys.length) {
      host.innerHTML = '<div class="mf-token-designer-empty">' +
        '<i class="fas fa-circle-info"></i> ' + wt('des.shell.noTextTokens', 'No text tokens detected.') + ' ' +
        wt('des.shell.addTokenMarkersPre', 'Add') + ' <code>{{content:my_key}}</code> ' + wt('des.shell.addTokenMarkersPost', 'markers inside your Custom HTML.') +
      '</div>';
      return;
    }
    keys.forEach(function (key) {
      var row = document.createElement('div');
      row.className = 'mf-token-row';
      row.innerHTML =
        '<div class="mf-token-row-head">' +
          '<span class="mf-token-row-label">' + B.escHtml(key) + '</span>' +
          '<code class="mf-token-row-tag">{{content:' + B.escHtml(key) + '}}</code>' +
        '</div>';
      var ta = document.createElement('textarea');
      ta.className = 'mf-code-editor mf-token-row-input';
      ta.rows = 2;
      ta.value = String(content[key] || '');
      ta.placeholder = wt('des.shell.editableContentFor', 'Editable content for') + ' ' + key;
      ta.addEventListener('input', function () {
        content[key] = ta.value;
        B.state.isDirty = true;
        if (B.markDirty) B.markDirty();
      });
      row.appendChild(ta);
      host.appendChild(row);
    });
  }

  // ── Render: image-token list (input + Upload + Gallery) ──────────
  // ── [P2 2026-06-13] Slider/repeater image groups — add / remove slides ──
  function escapeRe(s: string): string { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Group image tokens sharing a numeric-index pattern (p1_image, p2_image, …)
  // → a "slider". Returns { prefix, suffix, indices[], max, keyOf(n) }.
  function detectRepeaters(imageKeys: string[]): any[] {
    var groups: Record<string, any> = {};
    imageKeys.forEach(function (key) {
      var m = /^(.*?)(\d+)(.*)$/.exec(key);
      if (!m) return;
      var gk = m[1] + ' ' + m[3];
      if (!groups[gk]) groups[gk] = { prefix: m[1], suffix: m[3], indices: [] };
      groups[gk].indices.push(parseInt(m[2], 10));
    });
    var out: any[] = [];
    Object.keys(groups).forEach(function (gk) {
      var g = groups[gk];
      if (g.indices.length >= 2) {
        g.indices.sort(function (a: number, b: number) { return a - b; });
        g.max = g.indices[g.indices.length - 1];
        g.keyOf = function (n: number) { return g.prefix + n + g.suffix; };
        out.push(g);
      }
    });
    return out;
  }

  function imgTok(key: string): string { return '{{content:' + key + '}}'; }

  // Find the repeating "card" element wrapping exactly one slide's tokens.
  function findCardEl(rootContent: DocumentFragment, token: string, otherTokens: string[]): HTMLElement | null {
    var all = Array.prototype.slice.call(rootContent.querySelectorAll('*')) as HTMLElement[];
    var matches = all.filter(function (e) { return e.outerHTML.indexOf(token) !== -1; });
    if (!matches.length) return null;
    var card = matches[matches.length - 1]; // deepest element holding the token (the <img>)
    while (card.parentElement && (card.parentElement as any) !== rootContent) {
      var p = card.parentElement as HTMLElement;
      var pHtml = p.outerHTML;
      var parentHasOther = otherTokens.some(function (t) { return pHtml.indexOf(t) !== -1; });
      if (parentHasOther) break; // parent holds sibling cards (the grid) → card is the right level
      card = p;
    }
    return card;
  }

  function afterStructureChange(content: Record<string, string>, refresh: () => void) {
    var s = B.state.schema.settings;
    s.customContent = content;
    B.state.isDirty = true;
    if (B.markDirty) B.markDirty();
    try { if (B.syncCustomHtmlBidirectional) B.syncCustomHtmlBidirectional({ reason: 'token-designer-slide' }); } catch (e) {}
    try { B.callModule('canvas', 'render'); } catch (e) {}
    if (refresh) refresh();
  }

  // Clone the highest-index slide, re-index its tokens to max+1, insert it, seed content.
  function addSlide(g: any, content: Record<string, string>, refresh: () => void) {
    var s = B.state.schema.settings = B.state.schema.settings || {};
    var html = s.customHtml || s.CustomHtml || '';
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    var n = g.max;
    var others = g.indices.filter(function (i: number) { return i !== n; }).map(function (i: number) { return imgTok(g.keyOf(i)); });
    var card = findCardEl(tpl.content, imgTok(g.keyOf(n)), others);
    if (!card) { if (B.toast) B.toast(wt('des.shell.cannotLocateClone', 'Could not locate the slide to clone'), 'error'); return; }
    var re = new RegExp('\\{\\{content:' + escapeRe(g.prefix) + n + '(?![0-9])', 'g');
    var cloneHtml = card.outerHTML.replace(re, '{{content:' + g.prefix + (n + 1));
    var holder = document.createElement('template');
    holder.innerHTML = cloneHtml;
    (card.parentNode as Node).insertBefore(holder.content, card.nextSibling);
    s.customHtml = s.CustomHtml = tpl.innerHTML;
    // seed the new slide's tokens: copy from slide n, but blank the image(s) for a fresh pick
    parseTokenKeys(cloneHtml).forEach(function (nk) {
      var srcKey = nk.replace(g.prefix + (n + 1), g.prefix + n);
      content[nk] = isImageToken(nk) ? '' : String(content[srcKey] || '');
    });
    if (B.toast) B.toast(wt('des.shell.slideAdded', 'Slide added'), 'success');
    afterStructureChange(content, refresh);
  }

  // Remove one slide: delete its card element + its tokens from content.
  function removeSlide(g: any, n: number, content: Record<string, string>, refresh: () => void) {
    if (g.indices.length <= 1) { if (B.toast) B.toast(wt('des.shell.sliderNeedsOneImage', 'A slider needs at least one image'), 'error'); return; }
    var s = B.state.schema.settings = B.state.schema.settings || {};
    var html = s.customHtml || s.CustomHtml || '';
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    var others = g.indices.filter(function (i: number) { return i !== n; }).map(function (i: number) { return imgTok(g.keyOf(i)); });
    var card = findCardEl(tpl.content, imgTok(g.keyOf(n)), others);
    if (!card) { if (B.toast) B.toast(wt('des.shell.cannotLocateRemove', 'Could not locate the slide to remove'), 'error'); return; }
    parseTokenKeys(card.outerHTML).forEach(function (k) { delete content[k]; });
    (card.parentNode as Node).removeChild(card);
    s.customHtml = s.CustomHtml = tpl.innerHTML;
    if (B.toast) B.toast(wt('des.shell.slideRemoved', 'Slide removed'), 'success');
    afterStructureChange(content, refresh);
  }

  // ── [Request B 2026-06-13] "Slides" view — manage each slide's image + text
  // tokens TOGETHER as one element (CISS Element-manager pattern), instead of
  // scattering pN_image in the Image tab and pN_name/pN_desc in the Text tab. ──
  function prettyField(name: string): string {
    return String(name || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }).trim();
  }

  // Group tokens of the form <prefix><index>_<field> (e.g. p1_image, p1_name) by
  // prefix; a group with >=2 indices AND at least one image field is a "slider".
  function detectSlideGroups(allKeys: string[]): any[] {
    var byPrefix: Record<string, any> = {};
    allKeys.forEach(function (key) {
      var m = /^(.*?)(\d+)_(.+)$/.exec(key);
      if (!m) return;
      var prefix = m[1], idx = parseInt(m[2], 10), field = m[3];
      if (!byPrefix[prefix]) byPrefix[prefix] = { prefix: prefix, slides: {}, fieldOrder: [], imgField: null };
      var g = byPrefix[prefix];
      if (!g.slides[idx]) g.slides[idx] = {};
      g.slides[idx][field] = key;
      if (g.fieldOrder.indexOf(field) === -1) g.fieldOrder.push(field);
      if (!g.imgField && isImageToken(key)) g.imgField = field;
    });
    var out: any[] = [];
    Object.keys(byPrefix).forEach(function (p) {
      var g = byPrefix[p];
      var indices = Object.keys(g.slides).map(Number).sort(function (a: number, b: number) { return a - b; });
      if (indices.length >= 2 && g.imgField) { g.indices = indices; g.max = indices[indices.length - 1]; out.push(g); }
    });
    return out;
  }

  // ── Map token detection / editing helpers ─────────────────────────
  // Detect a content token that is being used as a map embed URL.
  function detectMapToken(keys: string[], content: Record<string, string>): string | null {
    // 1. Canonical key name used by premium templates
    if (keys.indexOf('map_embed_url') !== -1) return 'map_embed_url';
    // 2. Name heuristic: e.g. google_map_embed, map_url, venue_map, …
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i].toLowerCase();
      if ((k.indexOf('map') !== -1 && (k.indexOf('embed') !== -1 || k.indexOf('url') !== -1 || k.indexOf('src') !== -1)) ||
          (k.indexOf('google') !== -1 && k.indexOf('map') !== -1) ||
          (k.indexOf('venue') !== -1 && k.indexOf('map') !== -1)) {
        return keys[i];
      }
    }
    // 3. Value heuristic: current value looks like a Google Maps embed URL
    for (var i = 0; i < keys.length; i++) {
      var v = String(content[keys[i]] || '');
      if (/https?:\/\/(www\.)?google\.com\/maps\/embed/i.test(v) ||
          /https?:\/\/maps\.google\.com\/maps/i.test(v)) {
        return keys[i];
      }
    }
    return null;
  }

  function parseGoogleMapsEmbedUrl(url: string): { lat: number; lng: number; zoom: number } | null {
    // Simple origin=mfe format: !1s lat,lng !6i zoom
    var m = /!1s(-?\d+\.?\d*),(-?\d+\.?\d*)!6i(\d+)/.exec(url);
    if (m) {
      var lat = parseFloat(m[1]), lng = parseFloat(m[2]), zoom = parseInt(m[3], 10);
      if (isFinite(lat) && isFinite(lng) && isFinite(zoom)) return { lat: lat, lng: lng, zoom: zoom };
    }
    // Standard pb format: !3d lat !2d lng
    var latM = /!3d(-?\d+\.?\d*)/.exec(url);
    var lngM = /!2d(-?\d+\.?\d*)/.exec(url);
    if (latM && lngM) {
      var lat2 = parseFloat(latM[1]), lng2 = parseFloat(lngM[1]);
      var zoomM = /!6i(\d+)/.exec(url);
      var zoom2 = zoomM ? parseInt(zoomM[1], 10) : 10;
      if (isFinite(lat2) && isFinite(lng2) && isFinite(zoom2)) return { lat: lat2, lng: lng2, zoom: zoom2 };
    }
    // q=lat,lng&z=zoom format
    var qm = /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/.exec(url);
    if (qm) {
      var lat3 = parseFloat(qm[1]), lng3 = parseFloat(qm[2]);
      var zm = /[?&]z=(\d+)/.exec(url);
      var zoom3 = zm ? parseInt(zm[1], 10) : 10;
      if (isFinite(lat3) && isFinite(lng3) && isFinite(zoom3)) return { lat: lat3, lng: lng3, zoom: zoom3 };
    }
    return null;
  }

  function buildGoogleMapsEmbedUrl(lat: number, lng: number, zoom: number): string {
    return 'https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s'
      + lat.toFixed(6) + ',' + lng.toFixed(6) + '!6i' + Math.round(clamp(zoom, 1, 20));
  }

  function geocodeAddress(query: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
    var trimmed = String(query || '').trim();
    if (!trimmed) return Promise.resolve(null);
    var url = 'https://nominatim.openstreetmap.org/search'
      + '?format=json&limit=1&addressdetails=0'
      + '&q=' + encodeURIComponent(trimmed);
    return fetch(url, { headers: { 'Accept': 'application/json' } as any })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows: any[]) {
        if (!Array.isArray(rows) || !rows.length) return null;
        var top = rows[0];
        var lat = parseFloat(top.lat);
        var lng = parseFloat(top.lon);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return { lat: lat, lng: lng, displayName: String(top.display_name || trimmed) };
      });
  }

  function clamp(n: number, lo: number, hi: number): number {
    if (!isFinite(n)) return lo;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  // Build the image control (preview + url + Upload/Gallery/Clear) for one token.
  function buildImageField(key: string, fieldName: string, content: Record<string, string>): HTMLElement {
    var wrap = document.createElement('div');
    wrap.className = 'mf-slide-field mf-slide-field-image';
    var cur = String(content[key] || '');
    function prev(u: string) { return u ? '<img src="' + B.escAttr(u) + '" alt="" onerror="this.style.opacity=.25"/>' : '<span class="mf-token-image-empty"><i class="fas fa-image"></i></span>'; }
    wrap.innerHTML =
      '<label class="mf-slide-field-label"><i class="fas fa-image"></i> ' + B.escHtml(prettyField(fieldName)) + '</label>' +
      '<div class="mf-slide-img">' +
        '<div class="mf-slide-img-prev">' + prev(cur) + '</div>' +
        '<div class="mf-slide-img-ctrl">' +
          '<input type="text" class="mf-slide-img-url" value="' + B.escAttr(cur) + '" placeholder="/Portals/0/MegaForm/Images/..."/>' +
          '<div class="mf-slide-img-btns">' +
            '<button type="button" class="mf-builder-btn mf-slide-up"><i class="fas fa-cloud-upload-alt"></i> ' + wt('des.shell.upload', 'Upload') + '</button>' +
            '<button type="button" class="mf-builder-btn mf-slide-gal"><i class="fas fa-images"></i> ' + wt('des.shell.gallery', 'Gallery') + '</button>' +
            '<button type="button" class="mf-builder-btn mf-slide-clr" title="' + wt('des.shell.clear', 'Clear') + '"><i class="fas fa-times"></i></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    var url = wrap.querySelector('.mf-slide-img-url') as HTMLInputElement;
    var box = wrap.querySelector('.mf-slide-img-prev') as HTMLElement;
    function setUrl(u: string) { url.value = u; content[key] = u; B.state.isDirty = true; if (B.markDirty) B.markDirty(); box.innerHTML = prev(u); try { B.callModule('canvas', 'render'); } catch (e) {} }
    url.addEventListener('input', function () { setUrl(url.value); });
    (wrap.querySelector('.mf-slide-up') as HTMLButtonElement).addEventListener('click', function () {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        uploadImage(f).then(function (u) { setUrl(u); if (B.toast) B.toast(wt('des.shell.imageUploaded', 'Image uploaded'), 'success'); _galleryCache = null; })
          .catch(function (err) { if (B.toast) B.toast(wt('des.shell.uploadFailed', 'Upload failed:') + ' ' + (err && err.message || err), 'error'); });
      });
      inp.click();
    });
    (wrap.querySelector('.mf-slide-gal') as HTMLButtonElement).addEventListener('click', function () { openGalleryPicker(function (u) { setUrl(u); }); });
    (wrap.querySelector('.mf-slide-clr') as HTMLButtonElement).addEventListener('click', function () { setUrl(''); });
    return wrap;
  }

  function buildTextField(key: string, fieldName: string, content: Record<string, string>): HTMLElement {
    var wrap = document.createElement('div');
    wrap.className = 'mf-slide-field';
    var lbl = document.createElement('label'); lbl.className = 'mf-slide-field-label'; lbl.textContent = prettyField(fieldName);
    wrap.appendChild(lbl);
    var isLong = /desc|description|text|content|body|detail|summary|para/i.test(fieldName);
    var inp: HTMLTextAreaElement | HTMLInputElement;
    if (isLong) { var ta = document.createElement('textarea'); ta.rows = 2; ta.className = 'mf-slide-text'; inp = ta; }
    else { var ip = document.createElement('input'); ip.type = 'text'; ip.className = 'mf-slide-text'; inp = ip; }
    inp.value = String(content[key] || '');
    inp.placeholder = prettyField(fieldName);
    inp.addEventListener('input', function () { content[key] = inp.value; B.state.isDirty = true; if (B.markDirty) B.markDirty(); try { B.callModule('canvas', 'render'); } catch (e) {} });
    wrap.appendChild(inp);
    return wrap;
  }

  function renderSlidesPane(host: HTMLElement, content: Record<string, string>) {
    host.innerHTML = '';
    function refresh() { renderSlidesPane(host, ensureContent()); }
    var html = String((B.state.schema.settings || {}).customHtml || (B.state.schema.settings || {}).CustomHtml || '');
    var groups = detectSlideGroups(parseTokenKeys(html));
    if (!groups.length) {
      host.innerHTML = '<div class="mf-token-designer-empty"><i class="fas fa-circle-info"></i> ' + wt('des.shell.noSliderDetected', 'No slider detected.') + ' ' +
        wt('des.shell.sliderExplainPre', 'A slider is repeating tokens like') + ' <code>{{content:p1_image}}</code> + <code>{{content:p1_name}}</code>, <code>p2_image</code>… — ' + wt('des.shell.sliderExplainPost', 'each slide is then editable here as one element.') + '</div>';
      return;
    }
    function slideSummary(g: any, idx: number, content: Record<string, string>): string {
      var slide = g.slides[idx] || {};
      var preferred = ['name', 'title', 'heading', 'headline', 'label', 'cat', 'category'];
      for (var i = 0; i < preferred.length; i++) {
        var k = slide[preferred[i]];
        var v = k ? String(content[k] || '').trim() : '';
        if (v) return v;
      }
      for (var j = 0; j < g.fieldOrder.length; j++) {
        var f = g.fieldOrder[j];
        if (f === g.imgField || !slide[f] || isImageToken(slide[f])) continue;
        var vv = String(content[slide[f]] || '').trim();
        if (vv) return vv;
      }
      return wt('des.shell.slideN', 'Slide {n}', { n: idx });
    }

    function imageForSlide(g: any, idx: number, content: Record<string, string>): string {
      var slide = g.slides[idx] || {};
      return g.imgField && slide[g.imgField] ? String(content[slide[g.imgField]] || '') : '';
    }

    groups.forEach(function (g) {
      var imgRep = { prefix: g.prefix, suffix: '_' + g.imgField, indices: g.indices, max: g.max, keyOf: function (n: number) { return g.prefix + n + '_' + g.imgField; } };
      var bar = document.createElement('div');
      bar.className = 'mf-token-slider-bar';
      bar.innerHTML = '<span class="mf-token-slider-label"><i class="fas fa-images"></i> ' + wt('des.shell.slider', 'Slider') + ' <code>' + B.escHtml(g.prefix + 'N') + '</code> · ' + g.indices.length + ' ' + wt('des.shell.slidesSuffix', 'slides') + '</span>' +
        '<button type="button" class="mf-builder-btn mf-token-slider-add"><i class="fas fa-plus"></i> ' + wt('des.shell.addSlide', 'Add slide') + '</button>';
      (bar.querySelector('.mf-token-slider-add') as HTMLButtonElement).addEventListener('click', function () { addSlide(imgRep, content, refresh); });
      var group = document.createElement('div');
      group.className = 'mf-token-slider-group';
      group.appendChild(bar);

      var workbench = document.createElement('div');
      workbench.className = 'mf-slide-workbench';
      group.appendChild(workbench);
      host.appendChild(group);

      var activeIdx = g.indices[0];
      function renderWorkbench(idx: number) {
        if (g.indices.indexOf(idx) === -1) idx = g.indices[0];
        activeIdx = idx;
        workbench.innerHTML = '';

        var nav = document.createElement('div');
        nav.className = 'mf-slide-nav';
        g.indices.forEach(function (navIdx: number) {
          var url = imageForSlide(g, navIdx, content);
          var item = document.createElement('button');
          item.type = 'button';
          item.className = 'mf-slide-nav-item' + (navIdx === activeIdx ? ' is-active' : '');
          item.innerHTML =
            '<span class="mf-slide-nav-thumb">' +
              (url
                ? '<img src="' + B.escAttr(url) + '" alt="" onerror="this.style.opacity=.25"/>'
                : '<i class="fas fa-image"></i>') +
            '</span>' +
            '<span class="mf-slide-nav-copy">' +
              '<strong>' + wt('des.shell.slideN', 'Slide {n}', { n: navIdx }) + '</strong>' +
              '<span>' + B.escHtml(slideSummary(g, navIdx, content)) + '</span>' +
            '</span>';
          item.addEventListener('click', function () { renderWorkbench(navIdx); });
          nav.appendChild(item);
        });
        workbench.appendChild(nav);

        var slide = g.slides[idx];
        var card = document.createElement('div'); card.className = 'mf-slide-card mf-slide-editor';
        var head = document.createElement('div'); head.className = 'mf-slide-card-head';
        head.innerHTML = '<span class="mf-slide-card-title"><i class="fas fa-layer-group"></i> ' + wt('des.shell.slideN', 'Slide {n}', { n: idx }) + '</span>' +
          '<span class="mf-slide-card-token"><code>' + B.escHtml(g.prefix + idx + '_*') + '</code></span>' +
          '<button type="button" class="mf-builder-btn mf-token-slide-remove"><i class="fas fa-trash-alt"></i> ' + wt('des.shell.remove', 'Remove') + '</button>';
        (head.querySelector('.mf-token-slide-remove') as HTMLButtonElement).addEventListener('click', function () { removeSlide(imgRep, idx, content, refresh); });
        card.appendChild(head);
        var body = document.createElement('div'); body.className = 'mf-slide-card-body';
        if (g.imgField && slide[g.imgField]) body.appendChild(buildImageField(slide[g.imgField], g.imgField, content));
        g.fieldOrder.forEach(function (f: string) {
          if (f === g.imgField || !slide[f]) return;
          body.appendChild(isImageToken(slide[f]) ? buildImageField(slide[f], f, content) : buildTextField(slide[f], f, content));
        });
        card.appendChild(body);
        workbench.appendChild(card);
      }
      renderWorkbench(activeIdx);
    });
  }

  function renderImagePane(host: HTMLElement, keys: string[], content: Record<string, string>) {
    host.innerHTML = '';
    // re-render this pane from the CURRENT customHtml (after add/remove slide)
    function refresh() {
      var h2 = String((B.state.schema.settings || {}).customHtml || (B.state.schema.settings || {}).CustomHtml || '');
      renderImagePane(host, parseTokenKeys(h2).filter(isImageToken), ensureContent());
    }
    var html = String((B.state.schema.settings || {}).customHtml || (B.state.schema.settings || {}).CustomHtml || '');
    var inlineImages = detectInlineImages(html);

    // Slider controls: for each repeater group, an "Add image" header
    var repeaters = detectRepeaters(keys);
    var keyToGroup: Record<string, any> = {};
    repeaters.forEach(function (g) {
      g.indices.forEach(function (i: number) { keyToGroup[g.keyOf(i)] = g; });
      var bar = document.createElement('div');
      bar.className = 'mf-token-slider-bar';
      bar.innerHTML =
        '<span class="mf-token-slider-label"><i class="fas fa-images"></i> ' + wt('des.shell.slider', 'Slider') + ' <code>' +
          B.escHtml(g.prefix + 'N' + g.suffix) + '</code> · ' + g.indices.length + ' ' + wt('des.shell.imagesSuffix', 'images') + '</span>' +
        '<button type="button" class="mf-builder-btn mf-token-slider-add"><i class="fas fa-plus"></i> ' + wt('des.shell.addImage', 'Add image') + '</button>';
      var addBtn = bar.querySelector('.mf-token-slider-add') as HTMLButtonElement;
      addBtn.addEventListener('click', function () { addSlide(g, content, refresh); });
      host.appendChild(bar);
    });

    if (!keys.length && !inlineImages.length) {
      host.innerHTML = '<div class="mf-token-designer-empty">' +
        '<i class="fas fa-circle-info"></i> ' + wt('des.shell.noImageTokens', 'No image tokens or inline images detected.') + ' ' +
        wt('des.shell.useImageTokenPre', 'Use') + ' <code>{{content:hero_image}}</code> ' + wt('des.shell.useImageTokenMid', 'tokens, or place a regular') + ' <code>&lt;img src="..."&gt;</code> ' + wt('des.shell.useImageTokenPost', 'in your Custom HTML.') +
      '</div>';
      return;
    }

    keys.forEach(function (key) {
      var row = document.createElement('div');
      row.className = 'mf-token-row mf-token-row-image';
      var curUrl = String(content[key] || '');
      row.innerHTML =
        '<div class="mf-token-row-head">' +
          '<span class="mf-token-row-label"><i class="fas fa-image"></i> ' + B.escHtml(key) + '</span>' +
          '<code class="mf-token-row-tag">{{content:' + B.escHtml(key) + '}}</code>' +
        '</div>' +
        '<div class="mf-token-image-grid">' +
          '<div class="mf-token-image-preview">' +
            (curUrl
              ? '<img src="' + B.escAttr(curUrl) + '" alt="" onerror="this.style.opacity=.25"/>'
              : '<span class="mf-token-image-empty"><i class="fas fa-image"></i><br>' + wt('des.shell.noImage', 'no image') + '</span>') +
          '</div>' +
          '<div class="mf-token-image-controls">' +
            '<input type="text" class="mf-token-image-url" value="' + B.escAttr(curUrl) + '" placeholder="/Portals/0/MegaForm/Images/..."/>' +
            '<div class="mf-token-image-buttons">' +
              '<button type="button" class="mf-builder-btn mf-token-image-upload"><i class="fas fa-cloud-upload-alt"></i> ' + wt('des.shell.upload', 'Upload') + '</button>' +
              '<button type="button" class="mf-builder-btn mf-token-image-gallery"><i class="fas fa-images"></i> ' + wt('des.shell.gallery', 'Gallery') + '</button>' +
              '<button type="button" class="mf-builder-btn mf-token-image-clear" title="' + wt('des.shell.clearUrl', 'Clear URL') + '"><i class="fas fa-times"></i></button>' +
              (keyToGroup[key]
                ? '<button type="button" class="mf-builder-btn mf-token-slide-remove" title="' + wt('des.shell.removeSlideTitle', 'Remove this slide from the slider') + '"><i class="fas fa-trash-alt"></i> ' + wt('des.shell.removeSlide', 'Remove slide') + '</button>'
                : '') +
            '</div>' +
          '</div>' +
        '</div>';
      host.appendChild(row);

      var urlInput = row.querySelector('.mf-token-image-url') as HTMLInputElement;
      var previewBox = row.querySelector('.mf-token-image-preview') as HTMLElement;
      var btnUpload = row.querySelector('.mf-token-image-upload') as HTMLButtonElement;
      var btnGallery = row.querySelector('.mf-token-image-gallery') as HTMLButtonElement;
      var btnClear = row.querySelector('.mf-token-image-clear') as HTMLButtonElement;
      var btnRemoveSlide = row.querySelector('.mf-token-slide-remove') as HTMLButtonElement | null;
      if (btnRemoveSlide) {
        btnRemoveSlide.addEventListener('click', function () {
          var g = keyToGroup[key];
          var m = /(\d+)/.exec(key);
          if (g && m) removeSlide(g, parseInt(m[1], 10), content, refresh);
        });
      }

      function refreshPreview(u: string) {
        previewBox.innerHTML = u
          ? '<img src="' + B.escAttr(u) + '" alt="" onerror="this.style.opacity=.25"/>'
          : '<span class="mf-token-image-empty"><i class="fas fa-image"></i><br>' + wt('des.shell.noImage', 'no image') + '</span>';
      }
      function setUrl(u: string) {
        urlInput.value = u;
        content[key] = u;
        B.state.isDirty = true;
        if (B.markDirty) B.markDirty();
        refreshPreview(u);
      }

      urlInput.addEventListener('input', function () { setUrl(urlInput.value); });

      btnUpload.addEventListener('click', function () {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.addEventListener('change', function () {
          var f = inp.files && inp.files[0];
          if (!f) return;
          btnUpload.disabled = true;
          btnUpload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + wt('des.shell.uploading', 'Uploading…');
          uploadImage(f)
            .then(function (u) {
              setUrl(u);
              if (B.toast) B.toast(wt('des.shell.imageUploaded', 'Image uploaded'), 'success');
              _galleryCache = null; // bust gallery cache so new file shows next time
            })
            .catch(function (err) {
              if (B.toast) B.toast(wt('des.shell.uploadFailed', 'Upload failed:') + ' ' + (err && err.message || err), 'error');
              else alert(wt('des.shell.uploadFailed', 'Upload failed:') + ' ' + (err && err.message || err));
            })
            .then(function () {
              btnUpload.disabled = false;
              btnUpload.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> ' + wt('des.shell.upload', 'Upload');
            });
        });
        inp.click();
      });

      btnGallery.addEventListener('click', function () {
        openGalleryPicker(function (u) { setUrl(u); });
      });

      btnClear.addEventListener('click', function () { setUrl(''); });
    });

    // ── Inline <img> tags that are NOT wrapped in {{content:*}} tokens ──
    if (inlineImages.length) {
      var section = document.createElement('div');
      section.className = 'mf-token-inline-section';
      section.style.marginTop = keys.length ? '18px' : '0';
      section.innerHTML =
        '<div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:10px;display:flex;align-items:center;gap:6px;">' +
          '<i class="fas fa-code"></i> ' + wt('des.shell.inlineImagesInHtml', 'Inline images in Custom HTML') +
        '</div>';
      inlineImages.forEach(function (inline) {
        section.appendChild(buildInlineImageRow(inline));
      });
      host.appendChild(section);
    }

    function buildInlineImageRow(inline: any): HTMLElement {
      var row = document.createElement('div');
      row.className = 'mf-token-row mf-token-row-image';
      var label = inline.className
        ? ('.' + String(inline.className).split(/\s+/)[0])
        : wt('des.shell.inlineImageN', 'Inline image #{n}', { n: inline.index + 1 });
      var curUrl = inline.src;
      row.innerHTML =
        '<div class="mf-token-row-head">' +
          '<span class="mf-token-row-label"><i class="fas fa-image"></i> ' + B.escHtml(label) + '</span>' +
          '<code class="mf-token-row-tag">&lt;img&gt;</code>' +
        '</div>' +
        '<div class="mf-token-image-grid">' +
          '<div class="mf-token-image-preview">' +
            (curUrl
              ? '<img src="' + B.escAttr(curUrl) + '" alt="" onerror="this.style.opacity=.25"/>'
              : '<span class="mf-token-image-empty"><i class="fas fa-image"></i><br>' + wt('des.shell.noImage', 'no image') + '</span>') +
          '</div>' +
          '<div class="mf-token-image-controls">' +
            '<input type="text" class="mf-token-image-url" value="' + B.escAttr(curUrl) + '" placeholder="https://... or /Portals/0/..."/>' +
            '<div class="mf-token-image-buttons">' +
              '<button type="button" class="mf-builder-btn mf-token-image-upload"><i class="fas fa-cloud-upload-alt"></i> ' + wt('des.shell.upload', 'Upload') + '</button>' +
              '<button type="button" class="mf-builder-btn mf-token-image-gallery"><i class="fas fa-images"></i> ' + wt('des.shell.gallery', 'Gallery') + '</button>' +
              '<button type="button" class="mf-builder-btn mf-token-image-clear" title="' + wt('des.shell.clearUrl', 'Clear URL') + '"><i class="fas fa-times"></i></button>' +
            '</div>' +
          '</div>' +
        '</div>';

      var urlInput = row.querySelector('.mf-token-image-url') as HTMLInputElement;
      var previewBox = row.querySelector('.mf-token-image-preview') as HTMLElement;
      var btnUpload = row.querySelector('.mf-token-image-upload') as HTMLButtonElement;
      var btnGallery = row.querySelector('.mf-token-image-gallery') as HTMLButtonElement;
      var btnClear = row.querySelector('.mf-token-image-clear') as HTMLButtonElement;

      function refreshPreview(u: string) {
        previewBox.innerHTML = u
          ? '<img src="' + B.escAttr(u) + '" alt="" onerror="this.style.opacity=.25"/>'
          : '<span class="mf-token-image-empty"><i class="fas fa-image"></i><br>' + wt('des.shell.noImage', 'no image') + '</span>';
      }
      function setUrl(u: string) {
        setInlineImageSrc(inline, u);
        urlInput.value = u;
        refreshPreview(u);
      }

      urlInput.addEventListener('input', function () { setUrl(urlInput.value); });

      btnUpload.addEventListener('click', function () {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.addEventListener('change', function () {
          var f = inp.files && inp.files[0];
          if (!f) return;
          btnUpload.disabled = true;
          btnUpload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + wt('des.shell.uploading', 'Uploading…');
          uploadImage(f)
            .then(function (u) {
              setUrl(u);
              if (B.toast) B.toast(wt('des.shell.imageUploaded', 'Image uploaded'), 'success');
              _galleryCache = null;
            })
            .catch(function (err) {
              if (B.toast) B.toast(wt('des.shell.uploadFailed', 'Upload failed:') + ' ' + (err && err.message || err), 'error');
              else alert(wt('des.shell.uploadFailed', 'Upload failed:') + ' ' + (err && err.message || err));
            })
            .then(function () {
              btnUpload.disabled = false;
              btnUpload.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> ' + wt('des.shell.upload', 'Upload');
            });
        });
        inp.click();
      });

      btnGallery.addEventListener('click', function () {
        openGalleryPicker(function (u) { setUrl(u); });
      });

      btnClear.addEventListener('click', function () { setUrl(''); });
      return row;
    }
  }

  // ── Premium shell strings inside customHtml ─────────────────────
  function tdEsc(s: any): string {
    if (B.escHtml) return B.escHtml(String(s == null ? '' : s));
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function tdEscAttr(s: any): string {
    if (B.escAttr) return B.escAttr(String(s == null ? '' : s));
    return tdEsc(s).replace(/`/g, '&#96;');
  }

  function shellText(el: Element | null): string {
    if (!el) return '';
    var html = String((el as HTMLElement).innerHTML || '').replace(/<br\s*\/?>/gi, '\n');
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return String(tmp.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function setShellText(el: Element | null, value: string) {
    if (!el) return;
    var v = String(value == null ? '' : value);
    var html = String((el as HTMLElement).innerHTML || '');
    if (/<br\s*\/?>/i.test(html) || v.indexOf('\n') >= 0) {
      (el as HTMLElement).innerHTML = tdEsc(v).replace(/\n/g, '<br>');
    } else {
      (el as HTMLElement).textContent = v;
    }
  }

  function customHtmlNow(settings?: any): string {
    var s = settings || (B.state.schema.settings = B.state.schema.settings || {});
    return String(s.customHtml || s.CustomHtml || '');
  }

  function customHtmlDom(settings?: any): HTMLTemplateElement {
    var tpl = document.createElement('template');
    tpl.innerHTML = customHtmlNow(settings);
    return tpl;
  }

  function commitCustomHtml(tpl: HTMLTemplateElement, reason: string) {
    var s = B.state.schema.settings = B.state.schema.settings || {};
    s.customHtml = s.CustomHtml = tpl.innerHTML;
    B.state.isDirty = true;
    if (B.markDirty) B.markDirty();
    try { if (B.syncCustomHtmlBidirectional) B.syncCustomHtmlBidirectional({ reason: reason }); } catch (e) {}
    try { B.callModule('canvas', 'render'); } catch (e) {}
  }

  function hasTemplateToken(el: Element | null): boolean {
    return !!(el && /\{\{(?:field|content|form):/i.test(String((el as HTMLElement).innerHTML || '')));
  }

  function classBlob(el: Element | null): string {
    if (!el) return '';
    var parent = el.parentElement;
    return String((el.getAttribute('class') || '') + ' ' + (parent ? parent.getAttribute('class') || '' : '')).toLowerCase();
  }

  function isStepContentNode(el: Element): boolean {
    return hasTemplateToken(el) || /\b(page|panel|content|body)\b/i.test(String(el.getAttribute('class') || ''));
  }

  function navDataStepNodes(root: ParentNode): Element[] {
    var out: Element[] = [];
    Array.prototype.forEach.call(root.querySelectorAll('[data-step]'), function (el: Element) {
      if (hasTemplateToken(el)) return;
      if (isStepContentNode(el)) return;
      if (el.querySelector('h1,h2,h3')) return;
      out.push(el);
    });
    return out;
  }

  function bgStepNodes(root: ParentNode): Element[] {
    var out: Element[] = [];
    Array.prototype.forEach.call(root.querySelectorAll('.bg-step'), function (el: Element) {
      if (hasTemplateToken(el)) return;
      out.push(el);
    });
    return out;
  }

  function contentStepNodes(root: ParentNode): Element[] {
    var out: Element[] = [];
    Array.prototype.forEach.call(root.querySelectorAll('[data-step]'), function (el: Element) {
      if (hasTemplateToken(el)) out.push(el);
    });
    return out;
  }

  function navLabelNode(el: Element): Element | null {
    return el.querySelector('[class*="step-l"],[class*="step-label"],strong') ||
      Array.prototype.filter.call(el.querySelectorAll('span'), function (s: Element) {
        return !/\bstep-n\b/i.test(String(s.getAttribute('class') || '')) && shellText(s);
      })[0] || null;
  }

  function navSubtitleNode(el: Element): Element | null {
    return el.querySelector('[class*="step-sub"],.ey-step-text span,em') || null;
  }

  function contentTitleNode(el: Element): Element | null {
    return el.querySelector('h1,h2,h3');
  }

  function contentIntroNode(el: Element): Element | null {
    var ps = Array.prototype.slice.call(el.querySelectorAll('p')) as Element[];
    for (var i = 0; i < ps.length; i++) {
      if (!hasTemplateToken(ps[i]) && !ps[i].closest('label') && shellText(ps[i])) return ps[i];
    }
    return null;
  }

  function collectHeaderTargets(root: ParentNode, includeBlank?: boolean): any[] {
    var out: any[] = [];
    Array.prototype.forEach.call(root.querySelectorAll('h1,h2,h3,p,span,strong,em,figcaption,a'), function (el: Element) {
      if (el.closest('svg,[data-step],label,.mf-field-group,.mf-custom-field,.bg-step,.au-preset-menu')) return;
      if (hasTemplateToken(el)) return;
      var text = shellText(el);
      var cls = classBlob(el);
      var tag = String(el.tagName || '').toUpperCase();
      var important = /hero|brand|title|subtitle|tagline|eyebrow|rating|stats|footer|caption|preset|thumb|copy|head|logo|programme|program/.test(cls) ||
        /^H[1-3]$/.test(tag) ||
        !!el.closest('header,aside,footer');
      if (!important) return;
      if (!includeBlank && !text) return;
      if (text.length > 180) return;
      out.push({ el: el, value: text, label: headerTargetLabel(el, out.length), multiline: text.length > 70 || /\n/.test(text) });
    });
    // Disambiguate repeated roles: two "Header button" → "Header button 1", "Header button 2".
    var counts: any = {};
    out.forEach(function (h: any) { counts[h.label] = (counts[h.label] || 0) + 1; });
    var seen: any = {};
    out.forEach(function (h: any) { if (counts[h.label] > 1) { seen[h.label] = (seen[h.label] || 0) + 1; h.label = h.label + ' ' + seen[h.label]; } });
    return out;
  }

  // [B311] Semantic, human-readable role for a header shell string — replaces the old
  // opaque "Header string N". Drives the Token-Designer label + the on-canvas edit chip,
  // so a user editing the premium hero sees "Hero headline" / "Brand title" / "Header
  // button" instead of "Header string 3". Duplicate roles get a 1/2/3 suffix downstream.
  function headerTargetLabel(el: Element, i: number): string {
    var cls = classBlob(el);
    var tag = String(el.tagName || '').toUpperCase();
    var inFooter = !!el.closest('footer,.bg-footer,.au-footer,.ey-footer,[class*="footer"]');
    if (tag === 'A' || /\bbtn\b|\bbutton\b|\bcta\b|pill-link|chip-link/.test(cls)) return wt('des.shell.roleHeaderButton', 'Header button');
    if (/preset-n|preset-name/.test(cls)) return wt('des.shell.roleActivePresetLabel', 'Active preset label');
    if (/\brating\b|\bstars?\b/.test(cls)) return wt('des.shell.roleHeroRating', 'Hero rating');
    if (/\bstat|metric|\bcount\b|\bnumber\b/.test(cls)) return wt('des.shell.roleHeroStat', 'Hero stat');
    if (/badge|eyebrow|kicker|\btag\b/.test(cls)) return wt('des.shell.roleHeroBadge', 'Hero badge');
    if (tag === 'FIGCAPTION' || /caption|thumb/.test(cls)) return wt('des.shell.roleImageCaption', 'Image caption');
    if (inFooter || /footer/.test(cls)) return wt('des.shell.roleFooterText', 'Footer text');
    if (/brand/.test(cls) && (tag === 'P' || tag === 'H1' || tag === 'H2' || /title|name|logo/.test(cls))) return wt('des.shell.roleBrandTitle', 'Brand title');
    if (/brand/.test(cls)) return wt('des.shell.roleBrandSubtitle', 'Brand subtitle');
    if (tag === 'H1') return wt('des.shell.roleHeroHeadline', 'Hero headline');
    if (tag === 'H2' && /hero|head/.test(cls)) return wt('des.shell.roleHeroHeadline', 'Hero headline');
    if (/subtitle|tagline|\blede\b|\blead\b|\bcopy\b|\bsub\b/.test(cls)) return wt('des.shell.roleHeroSubtitle', 'Hero subtitle');
    if (/title|\bhead\b|hero/.test(cls) || tag === 'H2' || tag === 'H3') return wt('des.shell.roleHeroTitle', 'Hero title');
    return wt('des.shell.roleHeaderTextN', 'Header text {n}', { n: i + 1 });
  }

  function mutateShell(locator: any, value: string) {
    var tpl = customHtmlDom();
    var root = tpl.content;
    var target: Element | null = null;
    if (locator.kind === 'header') {
      var headers = collectHeaderTargets(root, true);
      target = headers[locator.index] ? headers[locator.index].el : null;
    } else if (locator.kind === 'navLabel' || locator.kind === 'navSubtitle') {
      var navs = locator.source === 'bg' ? bgStepNodes(root) : navDataStepNodes(root);
      var nav = navs[locator.index];
      target = nav ? (locator.kind === 'navLabel' ? navLabelNode(nav) : navSubtitleNode(nav)) : null;
    } else if (locator.kind === 'contentTitle' || locator.kind === 'contentIntro') {
      var panels = contentStepNodes(root);
      var panel = panels[locator.index];
      target = panel ? (locator.kind === 'contentTitle' ? contentTitleNode(panel) : contentIntroNode(panel)) : null;
    }
    if (!target) return;
    setShellText(target, value);
    commitCustomHtml(tpl, 'token-designer-form-shell');
  }

  function collectShellStringDescriptors(settings: any): any[] {
    var html = customHtmlNow(settings);
    if (!html || html.indexOf('<') < 0) return [];
    var tpl = customHtmlDom(settings);
    var root = tpl.content;
    var out: any[] = [];

    collectHeaderTargets(root, false).forEach(function (hit: any, i: number) {
      out.push({
        group: wt('des.shell.groupHeader', 'Header'),
        label: hit.label,
        tag: 'customHtml',
        value: hit.value,
        multiline: hit.multiline,
        locator: { kind: 'header', index: i }
      });
    });

    var navs = navDataStepNodes(root);
    navs.forEach(function (nav: Element, i: number) {
      var label = navLabelNode(nav);
      var subtitle = navSubtitleNode(nav);
      if (label && shellText(label)) out.push({ group: wt('des.shell.groupStepNavigation', 'Step navigation'), label: wt('des.shell.stepNLabel', 'Step {n} label', { n: i + 1 }), tag: 'data-step', value: shellText(label), locator: { kind: 'navLabel', source: 'data', index: i } });
      if (subtitle && shellText(subtitle)) out.push({ group: wt('des.shell.groupStepNavigation', 'Step navigation'), label: wt('des.shell.stepNSubtitle', 'Step {n} subtitle', { n: i + 1 }), tag: 'data-step', value: shellText(subtitle), locator: { kind: 'navSubtitle', source: 'data', index: i } });
    });

    if (!navs.length) {
      bgStepNodes(root).forEach(function (nav: Element, i: number) {
        var label = nav.querySelector('span');
        var subtitle = nav.querySelector('em');
        if (label && shellText(label)) out.push({ group: wt('des.shell.groupStepNavigation', 'Step navigation'), label: wt('des.shell.stepNLabel', 'Step {n} label', { n: i + 1 }), tag: '.bg-step', value: shellText(label), locator: { kind: 'navLabel', source: 'bg', index: i } });
        if (subtitle && shellText(subtitle)) out.push({ group: wt('des.shell.groupStepNavigation', 'Step navigation'), label: wt('des.shell.stepNSubtitle', 'Step {n} subtitle', { n: i + 1 }), tag: '.bg-step', value: shellText(subtitle), locator: { kind: 'navSubtitle', source: 'bg', index: i } });
      });
    }

    contentStepNodes(root).forEach(function (panel: Element, i: number) {
      var title = contentTitleNode(panel);
      var intro = contentIntroNode(panel);
      if (title && shellText(title)) out.push({ group: wt('des.shell.groupStepContent', 'Step content'), label: wt('des.shell.stepNHeading', 'Step {n} heading', { n: i + 1 }), tag: wt('des.shell.tagPageTitle', 'page title'), value: shellText(title), locator: { kind: 'contentTitle', index: i } });
      if (intro && shellText(intro)) out.push({ group: wt('des.shell.groupStepContent', 'Step content'), label: wt('des.shell.stepNIntro', 'Step {n} intro', { n: i + 1 }), tag: wt('des.shell.tagPageIntro', 'page intro'), value: shellText(intro), multiline: true, locator: { kind: 'contentIntro', index: i } });
    });
    return out;
  }

  // ── Render: form strings (title, description, submit) ───────────
  function renderFormPane(host: HTMLElement, settings: any) {
    host.innerHTML = '';
    var rows: Array<{ key: string; label: string; tag: string; multiline?: boolean }> = [
      { key: 'title',         label: wt('des.shell.formTitle', 'Form title'),         tag: '{{form:title}}' },
      { key: 'description',   label: wt('des.shell.formDescription', 'Form description'),   tag: '{{form:description}}', multiline: true },
      { key: 'submitText',    label: wt('des.shell.submitButtonText', 'Submit button text'), tag: '{{form:submit}}' }
    ];
    rows.forEach(function (def) {
      var row = document.createElement('div');
      row.className = 'mf-token-row';
      row.innerHTML =
        '<div class="mf-token-row-head">' +
          '<span class="mf-token-row-label">' + B.escHtml(def.label) + '</span>' +
          '<code class="mf-token-row-tag">' + B.escHtml(def.tag) + '</code>' +
        '</div>';
      var inputEl: HTMLInputElement | HTMLTextAreaElement;
      if (def.multiline) {
        inputEl = document.createElement('textarea') as HTMLTextAreaElement;
        (inputEl as HTMLTextAreaElement).rows = 3;
      } else {
        inputEl = document.createElement('input') as HTMLInputElement;
        (inputEl as HTMLInputElement).type = 'text';
      }
      inputEl.className = 'mf-code-editor mf-token-row-input';
      var sk = def.key === 'submitText' ? 'submitText' : def.key;
      inputEl.value = String(settings[sk] || settings[sk.charAt(0).toUpperCase() + sk.slice(1)] || '');
      inputEl.addEventListener('input', function () {
        settings[sk] = (inputEl as any).value;
        B.state.isDirty = true;
        if (B.markDirty) B.markDirty();
      });
      row.appendChild(inputEl);
      host.appendChild(row);
    });

    var shellRows = collectShellStringDescriptors(settings);
    if (!shellRows.length) return;

    var section = document.createElement('div');
    section.className = 'mf-token-shell-strings';
    section.style.cssText = 'margin-top:16px;border-top:1px solid #e2e8f0;padding-top:14px;';
    section.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">' +
        '<div style="font-weight:800;font-size:13px;color:#0f172a;display:flex;align-items:center;gap:7px;">' +
          '<i class="fas fa-wand-magic-sparkles" style="color:#7c3aed;"></i> ' + wt('des.shell.premiumShellStrings', 'Premium shell strings') +
        '</div>' +
        '<span class="mf-token-designer-count">' + shellRows.length + '</span>' +
      '</div>';
    host.appendChild(section);

    var currentGroup = '';
    shellRows.forEach(function (def: any) {
      if (def.group !== currentGroup) {
        currentGroup = def.group;
        var group = document.createElement('div');
        group.style.cssText = 'margin:12px 0 7px;font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;';
        group.textContent = currentGroup;
        section.appendChild(group);
      }

      var row = document.createElement('div');
      row.className = 'mf-token-row';
      row.innerHTML =
        '<div class="mf-token-row-head">' +
          '<span class="mf-token-row-label">' + tdEsc(def.label) + '</span>' +
          '<code class="mf-token-row-tag">' + tdEsc(def.tag || 'customHtml') + '</code>' +
        '</div>';

      var inputEl: HTMLInputElement | HTMLTextAreaElement;
      if (def.multiline) {
        inputEl = document.createElement('textarea') as HTMLTextAreaElement;
        (inputEl as HTMLTextAreaElement).rows = 2;
      } else {
        inputEl = document.createElement('input') as HTMLInputElement;
        (inputEl as HTMLInputElement).type = 'text';
      }
      inputEl.className = 'mf-code-editor mf-token-row-input';
      inputEl.value = String(def.value || '');
      inputEl.setAttribute('data-mf-shell-string', tdEscAttr(def.label));
      inputEl.addEventListener('input', function () {
        mutateShell(def.locator, (inputEl as any).value);
      });
      row.appendChild(inputEl);
      section.appendChild(row);
    });
  }

  // ── Render: map editor (when a map_embed_url token is detected) ──
  function renderMapPane(host: HTMLElement, mapKey: string, content: Record<string, string>) {
    host.innerHTML = '';
    var currentUrl = String(content[mapKey] || '');
    var parsed = parseGoogleMapsEmbedUrl(currentUrl);
    var lat = parsed ? parsed.lat : 21.0285;
    var lng = parsed ? parsed.lng : 105.8542;
    var zoom = parsed ? parsed.zoom : 13;

    var wrap = document.createElement('div');
    wrap.className = 'mf-token-map-editor';
    wrap.innerHTML =
      '<div class="mf-token-map-top">' +
        '<div class="mf-token-row">' +
          '<label class="mf-token-row-label">' + wt('des.shell.searchAddress', 'Search address') + '</label>' +
          '<div style="display:flex;gap:6px;">' +
            '<input type="text" class="mf-token-row-input mf-map-search-addr" placeholder="' + wt('des.shell.addressPlaceholder', '123 Main St, City, Country') + '" style="flex:1;"/>' +
            '<button type="button" class="mf-builder-btn mf-map-search-btn"><i class="fas fa-search-location"></i> ' + wt('des.shell.find', 'Find') + '</button>' +
          '</div>' +
          '<div class="mf-map-search-status" style="margin-top:6px;font-size:11px;color:#64748b;min-height:14px;"></div>' +
        '</div>' +
        '<div class="mf-token-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<div><label class="mf-token-row-label">' + wt('des.shell.latitude', 'Latitude') + '</label><input type="number" step="0.000001" min="-85" max="85" class="mf-token-row-input mf-map-lat"/></div>' +
          '<div><label class="mf-token-row-label">' + wt('des.shell.longitude', 'Longitude') + '</label><input type="number" step="0.000001" min="-180" max="180" class="mf-token-row-input mf-map-lng"/></div>' +
        '</div>' +
        '<div class="mf-token-row">' +
          '<label class="mf-token-row-label" style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span>' + wt('des.shell.zoom', 'Zoom') + '</span><span class="mf-map-zoom-badge" style="background:#0f172a;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">' + zoom + '</span>' +
          '</label>' +
          '<input type="range" min="1" max="20" step="1" class="mf-map-zoom" value="' + zoom + '" style="width:100%;"/>' +
          '<div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:2px;"><span>' + wt('des.shell.zoomWorld', 'World') + '</span><span>' + wt('des.shell.zoomCity', 'City') + '</span><span>' + wt('des.shell.zoomStreet', 'Street') + '</span></div>' +
        '</div>' +
        '<div class="mf-token-row">' +
          '<label class="mf-token-row-label">' + wt('des.shell.generatedEmbedUrl', 'Generated embed URL') + '</label>' +
          '<input type="text" class="mf-token-row-input mf-map-url" readonly style="font-size:11px;color:#64748b;background:#f8fafc;"/>' +
        '</div>' +
      '</div>' +
      '<div class="mf-token-map-preview">' +
        '<div style="font-size:12px;font-weight:600;color:#0f172a;display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
          '<i class="fas fa-eye" style="color:#10b981;"></i> ' + wt('des.shell.livePreview', 'Live preview') +
          '<span class="mf-map-preview-coords" style="margin-left:auto;font-family:Consolas,Menlo,monospace;font-size:11px;color:#64748b;font-weight:500;"></span>' +
        '</div>' +
        '<div class="mf-token-map-frame-wrap">' +
          '<iframe class="mf-token-map-frame" style="width:100%;height:100%;border:0;display:block;" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="' + wt('des.shell.mapPreview', 'Map preview') + '"></iframe>' +
        '</div>' +
      '</div>';
    host.appendChild(wrap);

    var addrInp = wrap.querySelector('.mf-map-search-addr') as HTMLInputElement;
    var addrBtn = wrap.querySelector('.mf-map-search-btn') as HTMLButtonElement;
    var addrStatus = wrap.querySelector('.mf-map-search-status') as HTMLElement;
    var latInp = wrap.querySelector('.mf-map-lat') as HTMLInputElement;
    var lngInp = wrap.querySelector('.mf-map-lng') as HTMLInputElement;
    var zoomInp = wrap.querySelector('.mf-map-zoom') as HTMLInputElement;
    var zoomBadge = wrap.querySelector('.mf-map-zoom-badge') as HTMLElement;
    var urlInp = wrap.querySelector('.mf-map-url') as HTMLInputElement;
    var frame = wrap.querySelector('.mf-token-map-frame') as HTMLIFrameElement;
    var coords = wrap.querySelector('.mf-map-preview-coords') as HTMLElement;

    function commit() {
      lat = clamp(parseFloat(latInp.value) || 0, -85, 85);
      lng = clamp(parseFloat(lngInp.value) || 0, -180, 180);
      zoom = clamp(parseInt(zoomInp.value, 10) || 13, 1, 20);
      latInp.value = String(lat);
      lngInp.value = String(lng);
      zoomInp.value = String(zoom);
      zoomBadge.textContent = String(zoom);
      var url = buildGoogleMapsEmbedUrl(lat, lng, zoom);
      urlInp.value = url;
      content[mapKey] = url;
      B.state.isDirty = true;
      if (B.markDirty) B.markDirty();
      coords.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5) + ' @ z' + zoom;
      frame.setAttribute('src', url);
      try { B.callModule('canvas', 'render'); } catch (e) {}
    }

    latInp.value = String(lat);
    lngInp.value = String(lng);
    zoomInp.value = String(zoom);
    urlInp.value = currentUrl || buildGoogleMapsEmbedUrl(lat, lng, zoom);
    frame.setAttribute('src', currentUrl || buildGoogleMapsEmbedUrl(lat, lng, zoom));
    coords.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5) + ' @ z' + zoom;

    var previewTimer: any = null;
    function scheduleCommit() {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(commit, 250);
    }

    latInp.addEventListener('input', scheduleCommit);
    lngInp.addEventListener('input', scheduleCommit);
    zoomInp.addEventListener('input', function () {
      zoomBadge.textContent = zoomInp.value;
      scheduleCommit();
    });

    function runFind() {
      var q = addrInp.value.trim();
      if (!q) { addrStatus.textContent = wt('des.shell.enterAddressFirst', 'Enter an address first.'); addrStatus.style.color = '#b45309'; return; }
      addrBtn.disabled = true;
      var orig = addrBtn.innerHTML;
      addrBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + wt('des.shell.lookingUp', 'Looking up…');
      addrStatus.textContent = wt('des.shell.searchingOsm', 'Searching OpenStreetMap…');
      addrStatus.style.color = '#64748b';
      geocodeAddress(q)
        .then(function (hit) {
          if (!hit) {
            addrStatus.textContent = wt('des.shell.noMatchingAddress', 'No matching address found. Try a more specific query.');
            addrStatus.style.color = '#b45309';
            return;
          }
          latInp.value = hit.lat.toFixed(6);
          lngInp.value = hit.lng.toFixed(6);
          addrStatus.innerHTML = '<i class="fas fa-check" style="color:#10b981;"></i> ' +
            (hit.displayName.length > 80 ? hit.displayName.substring(0, 80) + '…' : hit.displayName);
          addrStatus.style.color = '#0f172a';
          commit();
        })
        .catch(function (err) {
          addrStatus.textContent = wt('des.shell.geocoderError', 'Geocoder error:') + ' ' + (err && err.message ? err.message : String(err));
          addrStatus.style.color = '#dc2626';
        })
        .then(function () {
          addrBtn.disabled = false;
          addrBtn.innerHTML = orig;
        });
    }
    addrBtn.addEventListener('click', runFind);
    addrInp.addEventListener('keydown', function (e: KeyboardEvent) {
      if (e.key === 'Enter') { e.preventDefault(); runFind(); }
    });
  }

  // ── Gallery picker overlay ───────────────────────────────────────
  function openGalleryPicker(onPick: (url: string) => void) {
    var existing = document.getElementById('mf-token-gallery-overlay');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'mf-token-gallery-overlay';
    overlay.className = 'mf-token-gallery-backdrop';
    overlay.setAttribute('data-mf-overlay', '1'); // [B30] survive Builder fullscreen takeover
    overlay.innerHTML =
      '<div class="mf-token-gallery-shell">' +
        '<div class="mf-token-gallery-head">' +
          '<div class="mf-token-gallery-title"><i class="fas fa-images"></i> ' + wt('des.shell.imageGallery', 'Image Gallery') + '</div>' +
          '<input type="search" class="mf-token-gallery-search" placeholder="' + wt('des.shell.filterByFileName', 'Filter by file name…') + '"/>' +
          '<button type="button" class="mf-token-gallery-close" aria-label="' + wt('des.shell.close', 'Close') + '">&times;</button>' +
        '</div>' +
        '<div class="mf-token-gallery-body">' +
          '<div class="mf-token-gallery-loading"><i class="fas fa-spinner fa-spin"></i> ' + wt('des.shell.loadingImages', 'Loading images…') + '</div>' +
        '</div>' +
      '</div>';
    getMountTarget().appendChild(overlay);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    overlay.querySelector('.mf-token-gallery-close')!.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var body = overlay.querySelector('.mf-token-gallery-body') as HTMLElement;
    var searchInput = overlay.querySelector('.mf-token-gallery-search') as HTMLInputElement;
    var _items: any[] = [];

    function renderGrid(filter: string) {
      var q = String(filter || '').toLowerCase();
      var view = !q ? _items : _items.filter(function (it) {
        return String(it.fileName || '').toLowerCase().indexOf(q) !== -1;
      });
      if (!_items.length) {
        body.innerHTML = '<div class="mf-token-designer-empty">' +
          '<i class="fas fa-circle-info"></i> ' + wt('des.shell.noImagesUploadedPre', 'No images uploaded yet. Use the') + ' <strong>' + wt('des.shell.upload', 'Upload') + '</strong> ' + wt('des.shell.noImagesUploadedPost', 'button to add the first one.') +
        '</div>';
        return;
      }
      if (!view.length) {
        body.innerHTML = '<div class="mf-token-designer-empty">' +
          '<i class="fas fa-circle-info"></i> ' + wt('des.shell.noMatchesFor', 'No matches for') + ' "' + B.escHtml(filter) + '".' +
        '</div>';
        return;
      }
      var grid = document.createElement('div');
      grid.className = 'mf-token-gallery-grid';
      view.forEach(function (it) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'mf-token-gallery-card';
        card.title = it.fileName + ' (' + Math.round(it.size / 1024) + ' KB)';
        card.innerHTML =
          '<div class="mf-token-gallery-thumb"><img src="' + B.escAttr(it.url) + '" alt=""/></div>' +
          '<div class="mf-token-gallery-name">' + B.escHtml(it.fileName) + '</div>';
        card.addEventListener('click', function () {
          onPick(it.url);
          close();
        });
        grid.appendChild(card);
      });
      body.innerHTML = '';
      body.appendChild(grid);
    }

    fetchGallery().then(function (items) {
      _items = items || [];
      renderGrid('');
    });

    searchInput.addEventListener('input', function () { renderGrid(searchInput.value); });
  }

  // ── Public API ───────────────────────────────────────────────────
  (window as any).MFTokenDesigner = {
    open: open,
    // Reusable helpers for sibling designers (Slider, ImageChoice, ...)
    uploadImage: uploadImage,
    openGalleryPicker: openGalleryPicker,
    apiBase: apiBase
  };
})();
