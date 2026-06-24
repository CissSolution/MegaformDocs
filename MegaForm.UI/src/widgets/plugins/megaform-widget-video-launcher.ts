// ============================================================
// MegaForm — Video Embed Designer Launcher (v20260602-B42)
// File: src/widgets/plugins/megaform-widget-video-launcher.ts
//
// Side-effect module. Injects a "🎬 Edit Video" button on every
// VideoEmbed field card in the Builder canvas. Click → opens
// the MFVideoDesigner popup (src/builder/video-designer.ts)
// with the field's current widgetProps.videoUrl as initialUrl.
//
// On Apply the returned BuildResult is written back to the
// field's widgetProps:
//   • videoUrl       = result.url
//   • provider       = result.kind  (youtube|vimeo|loom|auto)
//   • embedUrl       = result.embedSrc   (precomputed embed src)
//   • embedHtml      = result.embedHtml  (full <iframe> snippet)
//   • videoId        = result.videoId
//   • autoplay       = result.params.autoplay
//   • showControls   = result.params.controls
//   • startSeconds   = result.params.start
//   • endSeconds     = result.params.end
//
// The runtime plugin (megaform-widget-video-embed.js) keeps
// reading videoUrl / autoplay / showControls exactly as before,
// so this launcher is additive — runtime behavior unchanged.
// ============================================================
// @ts-nocheck
'use strict';

(function () {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if ((window as any).__MFVideoLauncherLoaded) return;
  (window as any).__MFVideoLauncherLoaded = true;

  // [VisualQA-B45] Builder-only gate. The .mf-field-group / .mf-canvas-field
  // selectors match BOTH the Builder canvas AND the runtime form view —
  // without this gate, the "Open Unified Designer" / "Edit Video" / etc.
  // buttons leak into the customer-facing rendered form. We bail unless we
  // can detect the Builder shell.
  function isBuilderMode(): boolean {
    // [VisualQA-B45-fix2c] URL-based gate — see razor-launcher for context.
    if (typeof window === 'undefined' || !window.location) return false;
    var h = String(window.location.hash || '').toLowerCase();
    if (h.indexOf('#mf-builder') === 0) return true;
    var s = String(window.location.search || '').toLowerCase();
    if (/[?&]mfformid=/.test(s)) return true;
    return false;
  }

  var WIDGET_TYPE = 'VideoEmbed';
  var BTN_CLASS   = 'mfvd-launcher';
  var INJECTED    = 'mfvdInjected';
  var BTN_LABEL   = '🎬 Edit Video'; // 🎬

  function findField(key: string): any {
    var B = (window as any).MegaFormBuilder;
    var fields = B && B.state && B.state.schema && B.state.schema.fields
      ? B.state.schema.fields : [];
    function walk(list: any[]): any {
      for (var i = 0; i < list.length; i++) {
        var f = list[i]; if (!f) continue;
        if (f.key === key) return f;
        if (f.type === 'Row' && f.columns) {
          for (var ci = 0; ci < f.columns.length; ci++) {
            var col = f.columns[ci];
            if (col && col.fields) {
              var hit = walk(col.fields);
              if (hit) return hit;
            }
          }
        }
      }
      return null;
    }
    return walk(fields);
  }

  function openDesigner(field: any) {
    var D: any = (window as any).MFVideoDesigner;
    var B: any = (window as any).MegaFormBuilder;
    if (!D || typeof D.open !== 'function') {
      try { alert('Video Designer not loaded yet.'); } catch (_) {}
      return;
    }
    if (!field) {
      try { alert('Field not found in builder state.'); } catch (_) {}
      return;
    }
    var wp = field.widgetProps = field.widgetProps || {};

    D.open({
      initialUrl: typeof wp.videoUrl === 'string' ? wp.videoUrl : '',
      autoplay:   wp.autoplay === true,
      mute:       wp.mute === true,
      controls:   wp.showControls !== false,
      start:      typeof wp.startSeconds === 'number' ? wp.startSeconds : 0,
      end:        typeof wp.endSeconds   === 'number' ? wp.endSeconds   : 0,
      onApply: function (r: any) {
        if (!r) return;
        wp.videoUrl     = r.url;
        wp.provider     = r.kind === 'unknown' ? 'auto' : r.kind;
        wp.embedUrl     = r.embedSrc;
        wp.embedHtml    = r.embedHtml;
        wp.videoId      = r.videoId;
        if (r.params) {
          wp.autoplay      = !!r.params.autoplay;
          wp.mute          = !!r.params.mute;
          wp.showControls  = !!r.params.controls;
          wp.startSeconds  = Number(r.params.start) || 0;
          wp.endSeconds    = Number(r.params.end)   || 0;
        }
        if (B && B.state) B.state.isDirty = true;
        if (B && typeof B.markDirty === 'function') { try { B.markDirty(); } catch (_) {} }
        if (B && typeof B.callModule === 'function') {
          try { B.callModule('canvas', 'render', []); } catch (_) {}
          try { B.callModule('properties', 'showProps', [field]); } catch (_) {}
        }
      }
    });
  }

  function inject(card: HTMLElement) {
    if (!card || (card as any).dataset[INJECTED] === '1') return;
    (card as any).dataset[INJECTED] = '1';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_CLASS;
    btn.title = 'Open the Video Embed Designer — paste a YouTube / Vimeo / Loom URL, tune params, get embed code.';
    btn.innerHTML = BTN_LABEL;
    btn.style.cssText =
      'background:#0ea5e9;color:#fff;border:0;padding:5px 11px;border-radius:6px;' +
      'cursor:pointer;font-size:11px;font-weight:600;margin-left:6px;line-height:1.3';

    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var key = card.getAttribute('data-key') || '';
      var field = findField(key);
      openDesigner(field);
    });

    var actions = card.querySelector('.mf-canvas-field-actions');
    if (actions && actions.parentNode) {
      actions.parentNode.insertBefore(btn, actions);
    } else {
      card.appendChild(btn);
    }
  }

  function scan() {
    var cards = document.querySelectorAll('.mf-canvas-field[data-type="' + WIDGET_TYPE + '"]');
    for (var i = 0; i < cards.length; i++) inject(cards[i] as HTMLElement);
  }

  function bootstrap() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scan);
    } else {
      scan();
    }
    if (typeof MutationObserver !== 'undefined') {
      try {
        new MutationObserver(function () { scan(); })
          .observe(document.body, { childList: true, subtree: true });
      } catch (_) { /* ignore */ }
    }
  }

  if (!isBuilderMode()) {
    // Re-check after DOMContentLoaded in case the launcher runs before the
    // Builder shell mounts. If still not builder, give up silently.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        if (isBuilderMode()) bootstrap();
      });
    }
    return;
  }
  bootstrap();
})();
