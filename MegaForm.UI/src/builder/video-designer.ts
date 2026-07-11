// ============================================================
// MegaForm Builder — Video Embed Designer (v20260602-B42)
// File: src/builder/video-designer.ts
//
// Modal popup that translates a pasted video URL
// (YouTube / Vimeo / Loom) into a proper <iframe> embed
// snippet. The author can toggle autoplay / mute / controls
// and pick start/end timestamps; the popup builds the embed
// URL + HTML and hands the result back via onApply.
//
// Reuses the Token Designer modal shell so the styling,
// backdrop, ESC handler, mount-target trick and badge are
// all consistent with slider-designer / imagechoice-designer.
//
// Public surface:
//   window.MFVideoDesigner.open({ initialUrl, onApply })
//
// onApply receives:
//   {
//     url,                        // raw URL as typed
//     embedHtml,                  // ready-to-paste <iframe ...></iframe>
//     kind,                       // 'youtube' | 'vimeo' | 'loom' | 'unknown'
//     videoId,                    // parsed ID (string|null)
//     params: {
//       autoplay, mute, controls, start, end
//     }
//   }
// ============================================================
// @ts-nocheck
'use strict';

import { wt } from './designer-i18n';

(function () {
  if ((window as any).__MFVideoDesignerLoaded) return;
  (window as any).__MFVideoDesignerLoaded = true;

  var B: any = (window as any).MegaFormBuilder;

  // ── URL parsing helpers ───────────────────────────────────────
  function detectKind(url: string): 'youtube' | 'vimeo' | 'loom' | 'unknown' {
    var u = String(url || '').trim().toLowerCase();
    if (!u) return 'unknown';
    if (/(?:youtube\.com|youtu\.be)/.test(u)) return 'youtube';
    if (/vimeo\.com/.test(u)) return 'vimeo';
    if (/loom\.com/.test(u)) return 'loom';
    return 'unknown';
  }

  function parseYouTubeId(url: string): string | null {
    var s = String(url || '').trim();
    // youtu.be/<id>
    var m = s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
    if (m) return m[1];
    // youtube.com/watch?v=<id>
    m = s.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);
    if (m) return m[1];
    // youtube.com/embed/<id>
    m = s.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i);
    if (m) return m[1];
    // youtube.com/shorts/<id>
    m = s.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i);
    if (m) return m[1];
    return null;
  }

  function parseVimeoId(url: string): string | null {
    var s = String(url || '').trim();
    var m = s.match(/vimeo\.com\/(?:video\/)?(\d{6,})/i);
    if (m) return m[1];
    // player.vimeo.com/video/<id>
    m = s.match(/player\.vimeo\.com\/video\/(\d{6,})/i);
    if (m) return m[1];
    return null;
  }

  function parseLoomId(url: string): string | null {
    var s = String(url || '').trim();
    var m = s.match(/loom\.com\/share\/([A-Za-z0-9]{6,})/i);
    if (m) return m[1];
    m = s.match(/loom\.com\/embed\/([A-Za-z0-9]{6,})/i);
    if (m) return m[1];
    return null;
  }

  interface VideoParams {
    autoplay: boolean;
    mute: boolean;
    controls: boolean;
    start: number;   // seconds, 0 = none
    end: number;     // seconds, 0 = none
  }

  interface BuildResult {
    url: string;
    embedSrc: string;     // src= attribute value
    embedHtml: string;    // full <iframe ...></iframe>
    kind: 'youtube' | 'vimeo' | 'loom' | 'unknown';
    videoId: string | null;
    params: VideoParams;
  }

  function buildResult(rawUrl: string, p: VideoParams): BuildResult {
    var kind = detectKind(rawUrl);
    var id: string | null = null;
    var src = '';

    if (kind === 'youtube') {
      id = parseYouTubeId(rawUrl);
      if (id) {
        var qs: string[] = [
          'autoplay=' + (p.autoplay ? '1' : '0'),
          'mute=' + (p.mute || p.autoplay ? '1' : '0'),
          'controls=' + (p.controls ? '1' : '0'),
          'rel=0',
          'playsinline=1'
        ];
        if (p.start > 0) qs.push('start=' + Math.floor(p.start));
        if (p.end   > 0) qs.push('end='   + Math.floor(p.end));
        src = 'https://www.youtube.com/embed/' + id + '?' + qs.join('&');
      }
    } else if (kind === 'vimeo') {
      id = parseVimeoId(rawUrl);
      if (id) {
        var vq: string[] = [
          'autoplay=' + (p.autoplay ? '1' : '0'),
          'muted=' + (p.mute || p.autoplay ? '1' : '0'),
          'controls=' + (p.controls ? '1' : '0')
        ];
        var frag = '';
        if (p.start > 0) frag = '#t=' + Math.floor(p.start) + 's';
        src = 'https://player.vimeo.com/video/' + id + '?' + vq.join('&') + frag;
      }
    } else if (kind === 'loom') {
      id = parseLoomId(rawUrl);
      if (id) {
        // Loom embed has fewer knobs — autoplay supported, start ts via t=
        var lq: string[] = [];
        if (p.autoplay) lq.push('autoplay=1');
        if (p.mute)     lq.push('muted=1');
        if (!p.controls) lq.push('hide_owner=true');
        if (p.start > 0) lq.push('t=' + Math.floor(p.start) + 's');
        src = 'https://www.loom.com/embed/' + id + (lq.length ? '?' + lq.join('&') : '');
      }
    }

    var embedHtml = '';
    if (src) {
      embedHtml = '<iframe src="' + src + '"' +
        ' width="640" height="360"' +
        ' frameborder="0"' +
        ' allow="autoplay; fullscreen; picture-in-picture"' +
        ' allowfullscreen' +
        '></iframe>';
    }

    return {
      url: rawUrl,
      embedSrc: src,
      embedHtml: embedHtml,
      kind: kind,
      videoId: id,
      params: p
    };
  }

  // ── Mount target (mirrors token-designer [B31]) ───────────────
  function getMountTarget(): HTMLElement {
    return (document.getElementById('mf-builder-root')
      || document.querySelector('#mf-builder-root[data-mf-hoisted="1"]')
      || document.body) as HTMLElement;
  }

  function escAttr(s: any): string {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function escHtml(s: any): string {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Public open() ─────────────────────────────────────────────
  function open(opts: any) {
    opts = opts || {};
    var initialUrl: string = typeof opts.initialUrl === 'string' ? opts.initialUrl : '';
    var onApply: (r: BuildResult) => void = typeof opts.onApply === 'function' ? opts.onApply : function () {};

    var state: VideoParams = {
      autoplay: opts.autoplay === true,
      mute:     opts.mute     === true,
      controls: opts.controls !== false, // default ON
      start:    typeof opts.start === 'number' ? opts.start : 0,
      end:      typeof opts.end   === 'number' ? opts.end   : 0
    };
    var rawUrl = initialUrl;

    // Wipe any prior instance
    var prior = document.getElementById('mf-video-designer-modal');
    if (prior && prior.parentNode) prior.parentNode.removeChild(prior);

    var modal = document.createElement('div');
    modal.id = 'mf-video-designer-modal';
    modal.className = 'mf-token-designer-backdrop';
    modal.setAttribute('data-mf-overlay', '1'); // [B30] survive Builder fullscreen takeover
    modal.innerHTML =
      '<div class="mf-token-designer-shell mf-video-designer-shell" role="dialog" aria-label="' + wt('des.video.title', 'Video Embed Designer') + '" style="max-width:880px">' +
        '<div class="mf-token-designer-head">' +
          '<div class="mf-token-designer-title">' +
            '<i class="fas fa-video"></i>' +
            '<span>' + wt('des.video.title', 'Video Embed Designer') + '</span>' +
            '<span class="mf-token-designer-badge">v20260602-B42</span>' +
          '</div>' +
          '<button type="button" class="mf-token-designer-close" aria-label="' + wt('des.video.close', 'Close') + '">&times;</button>' +
        '</div>' +
        '<div class="mf-token-designer-tabs">' +
          '<button type="button" class="mf-token-designer-tab active" data-tab="url"><i class="fas fa-link"></i> ' + wt('des.video.tabUrl', 'URL') + '</button>' +
          '<button type="button" class="mf-token-designer-tab" data-tab="params"><i class="fas fa-sliders-h"></i> ' + wt('des.video.tabParams', 'Params') + '</button>' +
          '<button type="button" class="mf-token-designer-tab" data-tab="preview"><i class="fas fa-play-circle"></i> ' + wt('des.video.tabPreview', 'Preview') + '</button>' +
        '</div>' +
        '<div class="mf-token-designer-body">' +
          '<div class="mf-token-designer-pane" data-pane="url"></div>' +
          '<div class="mf-token-designer-pane" data-pane="params" style="display:none"></div>' +
          '<div class="mf-token-designer-pane" data-pane="preview" style="display:none"></div>' +
        '</div>' +
        '<div class="mf-token-designer-foot">' +
          '<div class="mf-token-designer-foot-hint"><i class="fas fa-info-circle"></i> ' + wt('des.video.footHintBefore', 'Paste any YouTube, Vimeo or Loom link. Press') + ' <kbd>Esc</kbd> ' + wt('des.video.footHintAfter', 'to cancel.') + '</div>' +
          '<button type="button" class="mf-builder-btn mf-video-designer-cancel" style="margin-right:6px"><i class="fas fa-times"></i> ' + wt('des.video.cancel', 'Cancel') + '</button>' +
          '<button type="button" class="mf-builder-btn mf-video-designer-apply" style="background:#0ea5e9;color:#fff"><i class="fas fa-check"></i> ' + wt('des.video.apply', 'Apply') + '</button>' +
        '</div>' +
      '</div>';

    getMountTarget().appendChild(modal);

    function close() {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    modal.querySelector('.mf-token-designer-close')!.addEventListener('click', close);
    modal.querySelector('.mf-video-designer-cancel')!.addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    // Tab switching
    Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-tab'), function (t: HTMLElement) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-tab'), function (x: HTMLElement) { x.classList.remove('active'); });
        t.classList.add('active');
        var name = t.getAttribute('data-tab');
        Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-pane'), function (p: HTMLElement) {
          (p as any).style.display = (p.getAttribute('data-pane') === name) ? '' : 'none';
        });
        if (name === 'preview') renderPreview();
      });
    });

    var paneUrl     = modal.querySelector('[data-pane="url"]')     as HTMLElement;
    var paneParams  = modal.querySelector('[data-pane="params"]')  as HTMLElement;
    var panePreview = modal.querySelector('[data-pane="preview"]') as HTMLElement;

    // ── URL pane ──────────────────────────────────────────────
    paneUrl.innerHTML =
      '<div class="mf-token-row">' +
        '<label class="mf-token-row-label" style="font-weight:600">' + wt('des.video.videoUrl', 'Video URL') + '</label>' +
        '<input type="text" class="mf-token-row-input mf-video-designer-url" ' +
          'placeholder="https://youtu.be/dQw4w9WgXcQ  ·  https://vimeo.com/123456789  ·  https://loom.com/share/abc123" ' +
          'value="' + escAttr(rawUrl) + '" ' +
          'style="font-family:Menlo,Consolas,monospace;font-size:13px"/>' +
        '<div class="mf-video-designer-detect" style="margin-top:10px;display:flex;align-items:center;gap:10px;font-size:13px">' +
          '<span class="mf-video-designer-kind">…</span>' +
          '<span class="mf-video-designer-id" style="color:#64748b;font-family:Menlo,Consolas,monospace"></span>' +
        '</div>' +
      '</div>' +
      '<div class="mf-token-row" style="margin-top:14px">' +
        '<label class="mf-token-row-label" style="font-weight:600">' + wt('des.video.supportedSources', 'Supported sources') + '</label>' +
        '<ul style="font-size:12px;color:#64748b;line-height:1.7;margin:6px 0 0 18px;padding:0">' +
          '<li><strong>YouTube</strong> — youtube.com/watch?v=ID · youtu.be/ID · youtube.com/embed/ID · youtube.com/shorts/ID</li>' +
          '<li><strong>Vimeo</strong> — vimeo.com/ID · player.vimeo.com/video/ID</li>' +
          '<li><strong>Loom</strong> — loom.com/share/ID · loom.com/embed/ID</li>' +
        '</ul>' +
      '</div>';

    var urlInput  = paneUrl.querySelector('.mf-video-designer-url')  as HTMLInputElement;
    var kindBadge = paneUrl.querySelector('.mf-video-designer-kind') as HTMLElement;
    var idLabel   = paneUrl.querySelector('.mf-video-designer-id')   as HTMLElement;

    function paintKind() {
      var k = detectKind(rawUrl);
      var id: string | null = null;
      var ok = false;
      var label = wt('des.video.noUrl', 'No URL');
      var color = '#9ca3af';
      if (k === 'youtube') { id = parseYouTubeId(rawUrl); label = 'YouTube'; color = '#dc2626'; ok = !!id; }
      else if (k === 'vimeo') { id = parseVimeoId(rawUrl); label = 'Vimeo'; color = '#1ab7ea'; ok = !!id; }
      else if (k === 'loom')  { id = parseLoomId(rawUrl);  label = 'Loom';  color = '#625df5'; ok = !!id; }
      else if (rawUrl) { label = wt('des.video.unknownSource', 'Unknown source'); color = '#f59e0b'; }

      var check = ok
        ? '<i class="fas fa-check-circle" style="color:#16a34a"></i> '
        : (rawUrl ? '<i class="fas fa-exclamation-triangle" style="color:#f59e0b"></i> ' : '<i class="fas fa-circle" style="color:#cbd5e1"></i> ');
      kindBadge.innerHTML = check + '<strong style="color:' + color + '">' + escHtml(label) + '</strong>' +
        (ok ? ' <span style="color:#16a34a;font-weight:600">— ' + wt('des.video.detected', 'detected') + '</span>' : '');
      idLabel.textContent = id ? ('id: ' + id) : '';
    }
    urlInput.addEventListener('input', function () {
      rawUrl = urlInput.value;
      paintKind();
    });
    paintKind();

    // ── Params pane ───────────────────────────────────────────
    paneParams.innerHTML =
      '<div class="mf-video-designer-params" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
        '<label class="mf-token-row" style="display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer">' +
          '<input type="checkbox" class="mf-vd-autoplay"' + (state.autoplay ? ' checked' : '') + '>' +
          '<span><i class="fas fa-play" style="color:#0ea5e9"></i> ' + wt('des.video.autoplay', 'Autoplay') + '</span>' +
        '</label>' +
        '<label class="mf-token-row" style="display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer">' +
          '<input type="checkbox" class="mf-vd-mute"' + (state.mute ? ' checked' : '') + '>' +
          '<span><i class="fas fa-volume-mute" style="color:#0ea5e9"></i> ' + wt('des.video.startMuted', 'Start muted') + '</span>' +
        '</label>' +
        '<label class="mf-token-row" style="display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer">' +
          '<input type="checkbox" class="mf-vd-controls"' + (state.controls ? ' checked' : '') + '>' +
          '<span><i class="fas fa-sliders-h" style="color:#0ea5e9"></i> ' + wt('des.video.showControls', 'Show controls') + '</span>' +
        '</label>' +
        '<div></div>' +
        '<div class="mf-token-row">' +
          '<label class="mf-token-row-label">' + wt('des.video.startSeconds', 'Start (seconds)') + '</label>' +
          '<input type="number" min="0" step="1" class="mf-token-row-input mf-vd-start" value="' + Number(state.start) + '"/>' +
          '<input type="range" min="0" max="600" step="1" class="mf-vd-start-range" value="' + Number(state.start) + '" style="width:100%;margin-top:6px"/>' +
        '</div>' +
        '<div class="mf-token-row">' +
          '<label class="mf-token-row-label">' + wt('des.video.endSeconds', 'End (seconds, 0 = none)') + '</label>' +
          '<input type="number" min="0" step="1" class="mf-token-row-input mf-vd-end" value="' + Number(state.end) + '"/>' +
          '<input type="range" min="0" max="600" step="1" class="mf-vd-end-range" value="' + Number(state.end) + '" style="width:100%;margin-top:6px"/>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:14px;font-size:12px;color:#64748b">' +
        '<i class="fas fa-info-circle"></i> ' + wt('des.video.paramsNote', 'Note: Loom honors autoplay + start; end-time clipping is only supported on YouTube. Autoplaying videos are muted automatically by browsers.') +
      '</div>';

    var cbAutoplay = paneParams.querySelector('.mf-vd-autoplay') as HTMLInputElement;
    var cbMute     = paneParams.querySelector('.mf-vd-mute')     as HTMLInputElement;
    var cbControls = paneParams.querySelector('.mf-vd-controls') as HTMLInputElement;
    var inStart    = paneParams.querySelector('.mf-vd-start')    as HTMLInputElement;
    var inEnd      = paneParams.querySelector('.mf-vd-end')      as HTMLInputElement;
    var rgStart    = paneParams.querySelector('.mf-vd-start-range') as HTMLInputElement;
    var rgEnd      = paneParams.querySelector('.mf-vd-end-range')   as HTMLInputElement;

    cbAutoplay.addEventListener('change', function () { state.autoplay = !!cbAutoplay.checked; });
    cbMute    .addEventListener('change', function () { state.mute     = !!cbMute.checked; });
    cbControls.addEventListener('change', function () { state.controls = !!cbControls.checked; });
    inStart.addEventListener('input', function () {
      state.start = Math.max(0, Number(inStart.value) || 0);
      rgStart.value = String(state.start);
    });
    inEnd.addEventListener('input', function () {
      state.end = Math.max(0, Number(inEnd.value) || 0);
      rgEnd.value = String(state.end);
    });
    rgStart.addEventListener('input', function () {
      state.start = Math.max(0, Number(rgStart.value) || 0);
      inStart.value = String(state.start);
    });
    rgEnd.addEventListener('input', function () {
      state.end = Math.max(0, Number(rgEnd.value) || 0);
      inEnd.value = String(state.end);
    });

    // ── Preview pane ──────────────────────────────────────────
    function renderPreview() {
      var r = buildResult(rawUrl, state);
      panePreview.innerHTML = '';
      var shell = document.createElement('div');
      shell.style.cssText = 'display:flex;flex-direction:column;gap:14px';

      var box = document.createElement('div');
      box.style.cssText = 'position:relative;width:100%;padding-top:56.25%;background:#0f172a;border-radius:10px;overflow:hidden;box-shadow:0 6px 20px rgba(15,23,42,.18)';
      if (r.embedSrc) {
        var ifr = document.createElement('iframe');
        ifr.src = r.embedSrc;
        ifr.setAttribute('frameborder', '0');
        ifr.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
        ifr.setAttribute('allowfullscreen', 'true');
        ifr.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
        box.appendChild(ifr);
      } else {
        var empty = document.createElement('div');
        empty.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:14px;text-align:center;padding:20px';
        empty.innerHTML = '<div><i class="fas fa-video-slash" style="font-size:36px;display:block;margin-bottom:10px;color:#475569"></i>' +
          (rawUrl ? wt('des.video.parseError', 'Couldn\'t parse a video ID from this URL.') : wt('des.video.pastePrompt', 'Paste a URL on the first tab to see the preview.')) +
          '</div>';
        box.appendChild(empty);
      }
      shell.appendChild(box);

      var meta = document.createElement('div');
      meta.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;font-size:12px';
      function chip(text: string, bg: string, fg: string) {
        return '<span style="background:' + bg + ';color:' + fg + ';padding:3px 9px;border-radius:99px;font-weight:600">' + escHtml(text) + '</span>';
      }
      var chips: string[] = [];
      chips.push(chip(r.kind.toUpperCase(), r.kind === 'youtube' ? '#fee2e2' : r.kind === 'vimeo' ? '#cffafe' : r.kind === 'loom' ? '#ede9fe' : '#fef3c7',
                                              r.kind === 'youtube' ? '#dc2626' : r.kind === 'vimeo' ? '#0e7490' : r.kind === 'loom' ? '#5b21b6' : '#92400e'));
      if (r.videoId) chips.push(chip('id: ' + r.videoId, '#f1f5f9', '#475569'));
      if (state.autoplay) chips.push(chip('autoplay', '#dcfce7', '#15803d'));
      if (state.mute)     chips.push(chip('muted',    '#dcfce7', '#15803d'));
      if (state.controls) chips.push(chip('controls', '#e0f2fe', '#0369a1'));
      if (state.start > 0) chips.push(chip('start ' + state.start + 's', '#e0e7ff', '#3730a3'));
      if (state.end   > 0) chips.push(chip('end '   + state.end   + 's', '#e0e7ff', '#3730a3'));
      meta.innerHTML = chips.join('');
      shell.appendChild(meta);

      var srcRow = document.createElement('div');
      srcRow.innerHTML =
        '<div style="font-weight:600;font-size:12px;color:#475569;margin-bottom:4px">' + wt('des.video.embedHtml', 'Embed HTML') + '</div>' +
        '<textarea readonly rows="3" style="width:100%;font-family:Menlo,Consolas,monospace;font-size:11px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;color:#0f172a;resize:vertical">' +
          escHtml(r.embedHtml || wt('des.video.noEmbedCode', '— no embed code available —')) +
        '</textarea>';
      shell.appendChild(srcRow);

      panePreview.appendChild(shell);
    }

    // ── Apply ─────────────────────────────────────────────────
    modal.querySelector('.mf-video-designer-apply')!.addEventListener('click', function () {
      var r = buildResult(rawUrl, state);
      if (!r.videoId) {
        if (B && B.showToast) B.showToast(wt('des.video.noValidUrlToast', 'No valid video URL — please paste a YouTube / Vimeo / Loom link first.'), 'error');
        else { try { alert(wt('des.video.noValidUrlAlert', 'No valid video URL.')); } catch (_) {} }
        return;
      }
      try { onApply(r); } catch (e: any) { try { console.error('[mf-video-designer] onApply failed', e); } catch (_) {} }
      if (B && B.showToast) B.showToast(wt('des.video.appliedToast', 'Video embed applied'), 'success');
      close();
    });
  }

  (window as any).MFVideoDesigner = {
    open: open,
    // Re-export pure helpers in case downstream code wants them
    detectKind: detectKind,
    parseYouTubeId: parseYouTubeId,
    parseVimeoId: parseVimeoId,
    parseLoomId: parseLoomId,
    buildResult: buildResult
  };
})();
