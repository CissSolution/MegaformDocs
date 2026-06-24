// ============================================================
// MegaForm Razor — Unified Designer Launcher (v20260603-B53)
// File: src/widgets/plugins/megaform-razor-launcher.ts
//
// [B53 hard cutover — entry consolidation]
// Side-effect module. Injects the SOLE entry-point button labelled
// "🧬 Open Unified Designer" on every Razor field card in the Builder
// canvas. The legacy "Razor Studio" button (.mfrz-studio-launcher)
// has been REMOVED — see megaform-widget-razor.ts header.
//
// On click it opens the openUnifiedDesigner() shell with three tabs:
//   • Current Settings (auto-prepended)
//   • Data            (auto-prepended — owns SQL config now)
//   • Recipe          (the Razor recipe gallery via mountRazorRecipe;
//                       internally delegates to MFRazorStudio.open())
// ============================================================
// @ts-nocheck
'use strict';

import { openUnifiedDesigner, buildCurrentSettingsTab, buildDataTab } from '../../view-designer/shared/unified-shell';
import { mountRazorRecipe } from './megaform-razor-studio-adapter';

(function () {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  // [VisualQA-B45] Builder-only gate. The .mf-field-group / .mf-canvas-field
  // selectors match BOTH the Builder canvas AND the runtime form view —
  // without this gate, the "Open Unified Designer" / "Edit Video" / etc.
  // buttons leak into the customer-facing rendered form. We bail unless we
  // can detect the Builder shell.
  function isBuilderMode(): boolean {
    // [VisualQA-B45-fix2c] The body.classList state-builder gate (B45-fix2)
    // was unreliable: AcmeMega host briefly adds state-builder during page
    // init even on runtime, then clears it. The launcher IIFE catches that
    // flash and bootstrap() then keeps injecting via MutationObserver.
    //
    // Reliable signal: URL hash '#mf-builder' (or the page is a Builder
    // route — mfFormId query param). Runtime form view uses 'formid' (no
    // hash). This is set deterministically by FormView.ascx.cs based on
    // server-side mode resolution.
    if (typeof window === 'undefined' || !window.location) return false;
    var h = String(window.location.hash || '').toLowerCase();
    if (h.indexOf('#mf-builder') === 0) return true;
    var s = String(window.location.search || '').toLowerCase();
    if (/[?&]mfformid=/.test(s)) return true;
    if (/[?&]mfpanel=builder/.test(s)) return true;   // builder opened via Dashboard (?mfpanel=builder)
    return false;
  }

  var WIDGET_TYPE = 'Razor';
  var BTN_CLASS   = 'mfrz-unified-launcher';
  var INJECTED    = 'mfrzUnifiedInjected';
  var BTN_LABEL   = '🧬 Open Unified Designer'; // 🧬

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
    if (!field) { try { alert('Field not found in builder state.'); } catch (_) {} return; }
    var wp = (field && field.widgetProps) || {};
    var B = (window as any).MegaFormBuilder;

    openUnifiedDesigner({
      widget: 'razor',
      title: 'Razor Widget Designer',
      badge: 'v20260602 · razor',
      currentProps: JSON.parse(JSON.stringify(wp || {})),
      tabs: [
        {
          id: 'recipe',
          label: 'Recipe',
          icon: 'fas fa-cube',
          render: function (host, ctx) {
            // Stash the api handle so the shell can ask for its draft on Apply.
            (host as any).__mfRazorTabApi = mountRazorRecipe(host, ctx);
          },
          getDraft: function () {
            // The shell calls getDraft per-tab; we look up the api handle
            // saved on the rendered pane root.
            var pane = document.querySelector('.mf-unified-designer-pane[data-pane-id="recipe"]') as HTMLElement | null;
            var api = pane && (pane as any).__mfRazorTabApi;
            return api && typeof api.getDraft === 'function' ? api.getDraft() : {};
          }
        }
      ],
      onApply: function (merged) {
        try {
          field.widgetProps = Object.assign({}, field.widgetProps || {}, merged || {});
          if (B && B.state) B.state.isDirty = true;
          if (B && B.callModule) {
            try { B.callModule('canvas', 'render', []); } catch (_) {}
            try { B.callModule('properties', 'showProps', [field]); } catch (_) {}
          }
        } catch (e: any) {
          try { console.error('[mf-razor-launcher] apply failed', e); } catch (_) {}
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
    btn.title = 'Open the unified Widget Designer — Current Settings + Data + Recipe in one shell.';
    btn.innerHTML = BTN_LABEL;
    btn.style.cssText = 'background:#0ea5e9;color:#fff;border:0;padding:5px 11px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;margin-left:6px;line-height:1.3';
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var key = card.getAttribute('data-key') || '';
      var field = findField(key);
      openDesigner(field);
    });

    // [B53 hard cutover] The legacy .mfrz-studio-launcher button no longer ships,
    // so this is now the sole entry-point. Place before .mf-canvas-field-actions
    // (the standard slot for header-row buttons on the field card).
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
        new MutationObserver(function () { scan(); }).observe(document.body, { childList: true, subtree: true });
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
