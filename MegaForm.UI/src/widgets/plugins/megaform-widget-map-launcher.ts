// ============================================================
// MegaForm Map - Designer Launcher (v20260602-B42)
// File: src/widgets/plugins/megaform-widget-map-launcher.ts
//
// Side-effect module. Injects a "Edit Location" button on every
// Map field card in the Builder canvas (selector:
//   .mf-canvas-field[data-type="Map"]).
//
// On click it looks up the field in MegaFormBuilder.state.schema
// and opens window.MFMapDesigner.open(field). The designer is a
// popup defined in src/builder/map-designer.ts which lets the
// author search an address (Nominatim), tweak lat/lng/zoom, and
// preview the OSM iframe live before applying.
//
// Mirrors the inject + scan + MutationObserver pattern used by
// megaform-widget-dynamic-label.ts's Layout Designer launcher.
// ============================================================
// @ts-nocheck
'use strict';

(function () {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if ((window as any).__MFMapLauncherLoaded) return;
  (window as any).__MFMapLauncherLoaded = true;

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

  var WIDGET_TYPE = 'Map';
  var BTN_CLASS = 'mfmap-edit-launcher';
  var INJECTED = 'mfmapEditInjected';
  var BTN_LABEL = '\u{1F5FA}\u{FE0F} Edit Location';

  function findField(key: string): any {
    var B = (window as any).MegaFormBuilder;
    var fields = B && B.state && B.state.schema && B.state.schema.fields ? B.state.schema.fields : [];
    function walk(list: any[]): any {
      for (var i = 0; i < list.length; i++) {
        var f = list[i]; if (!f) continue;
        if (f.key === key) return f;
        if (f.type === 'Row' && f.columns) {
          for (var ci = 0; ci < f.columns.length; ci++) {
            var col = f.columns[ci];
            if (col && col.fields) { var hit = walk(col.fields); if (hit) return hit; }
          }
        }
      }
      return null;
    }
    return walk(fields);
  }

  function openDesigner(field: any) {
    var d = (window as any).MFMapDesigner;
    if (!d || typeof d.open !== 'function') {
      try { alert('Map Designer bundle not loaded yet. Reload the Builder and try again.'); } catch (_) {}
      return;
    }
    d.open(field, function () {
      // Re-render canvas so the card updates with the new lat/lng/zoom.
      try {
        var B = (window as any).MegaFormBuilder;
        if (B && B.callModule) {
          try { B.callModule('canvas', 'render', []); } catch (_) {}
        }
      } catch (_) { /* ignore */ }
    });
  }

  function inject(card: HTMLElement) {
    if (!card || (card as any).dataset[INJECTED] === '1') return;
    (card as any).dataset[INJECTED] = '1';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_CLASS;
    btn.title = 'Open Map Designer (address search, zoom slider, live preview)';
    btn.innerHTML = BTN_LABEL;
    btn.style.cssText = 'background:#10b981;color:#fff;border:0;padding:5px 11px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;margin-left:8px;line-height:1.3;';
    btn.addEventListener('mouseenter', function () { btn.style.background = '#059669'; });
    btn.addEventListener('mouseleave', function () { btn.style.background = '#10b981'; });

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var key = card.getAttribute('data-key') || '';
      var field = findField(key);
      if (!field) { try { alert('Field not found in builder state.'); } catch (_) {} return; }
      openDesigner(field);
    });

    // Insert before the canvas-field-actions cluster so the button sits with
    // the existing edit/delete chrome rather than on its own row.
    var actions = card.querySelector('.mf-canvas-field-actions');
    if (actions && actions.parentNode) actions.parentNode.insertBefore(btn, actions);
    else card.appendChild(btn);
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
