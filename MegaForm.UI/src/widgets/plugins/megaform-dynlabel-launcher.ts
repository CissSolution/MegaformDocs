// ============================================================
// MegaForm DynamicLabel — Unified Designer Launcher (v20260603-B53)
// File: src/widgets/plugins/megaform-dynlabel-launcher.ts
//
// [B53 hard cutover — entry consolidation]
// Side-effect module. Injects the SOLE entry-point button labelled
// "🧬 Open Unified Designer" on every DynamicLabel field card in the
// Builder canvas. Selectors covered:
//   .mf-canvas-field[data-type="DynamicLabel"]
//   .mf-field-group[data-type="DynamicLabel"]
//
// The legacy "Layout Designer" button (.mfdl-layout-launcher) has been
// REMOVED — see megaform-widget-dynamic-label.ts header. The Layout
// Designer surface now lives INSIDE the unified shell as the Templates
// → Presets sub-tab via mountDynLabelTemplates().
//
// On click it opens the openUnifiedDesigner() shell with three tabs:
//   • Current Settings (auto-prepended)
//   • Data            (auto-prepended — owns SQL config now)
//   • Templates       (mountDynLabelTemplates — Templates · Rendering ·
//                       Display · Presets)
//
// The launcher still dispatches a "mf:dynlabel-designer-opening" custom
// event so any inline-properties listener can dispose its state when
// the unified popup opens.
// ============================================================
// @ts-nocheck
'use strict';

import { openUnifiedDesigner, buildCurrentSettingsTab, buildDataTab } from '../../view-designer/shared/unified-shell';
import { mountDynLabelTemplates } from './megaform-dynlabel-adapter';

(function () {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

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
    if (/[?&]mfpanel=builder/.test(s)) return true;   // builder opened via Dashboard (?mfpanel=builder)
    return false;
  }

  var WIDGET_TYPE = 'DynamicLabel';
  var BTN_CLASS   = 'mfdl-unified-launcher';
  var INJECTED    = 'mfdlUnifiedInjected';
  var BTN_LABEL   = '🧬 Open Unified Designer';

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

    // ── User-decision signal: let any future listener know the unified
    //    shell is taking over so it can dispose its inline panel state.
    //    For v1 nothing listens — see TODO[B40+] in module header.
    try {
      document.dispatchEvent(new CustomEvent('mf:dynlabel-designer-opening', {
        detail: { fieldKey: field.key || '', source: 'unified-launcher' }
      }));
    } catch (_) {}

    openUnifiedDesigner({
      widget: 'dynlabel',
      title: 'DynamicLabel Designer',
      badge: 'v20260602 · dynlabel',
      currentProps: JSON.parse(JSON.stringify(wp || {})),
      tabs: [
        {
          id: 'templates',
          label: 'Templates',
          icon: 'fas fa-file-code',
          render: function (host, ctx) {
            // Stash the api handle so the shell can ask for its draft on Apply.
            (host as any).__mfDynLabelTabApi = mountDynLabelTemplates(host, ctx);
          },
          getDraft: function () {
            // The shell calls getDraft per-tab; we look up the api handle
            // saved on the rendered pane root.
            var pane = document.querySelector('.mf-unified-designer-pane[data-pane-id="templates"]') as HTMLElement | null;
            var api = pane && (pane as any).__mfDynLabelTabApi;
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
          try { console.error('[mf-dynlabel-launcher] apply failed', e); } catch (_) {}
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
    btn.title = 'Open the unified Widget Designer — Current Settings + Data + Templates in one shell.';
    btn.innerHTML = BTN_LABEL;
    btn.style.cssText = 'background:#0ea5e9;color:#fff;border:0;padding:5px 11px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;margin-left:6px;line-height:1.3';
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var key = card.getAttribute('data-key') || '';
      var field = findField(key);
      openDesigner(field);
    });

    // [B53 hard cutover] The legacy .mfdl-layout-launcher button no longer
    // ships, so this is now the sole entry-point. Place before
    // .mf-canvas-field-actions (the standard slot for header-row buttons
    // on the field card).
    var actions = card.querySelector('.mf-canvas-field-actions');
    if (actions && actions.parentNode) {
      actions.parentNode.insertBefore(btn, actions);
    } else {
      card.appendChild(btn);
    }
  }

  function scan() {
    // [B39-fix] DynamicLabel canvas card uses .mf-field-group wrapper, not
    // .mf-canvas-field — accept BOTH so the launcher injects on every demo
    // form (verified 2026-06-02 against form 266 which has 3 DynLabel cards).
    var cards = document.querySelectorAll(
      '.mf-canvas-field[data-type="' + WIDGET_TYPE + '"], ' +
      '.mf-field-group[data-type="' + WIDGET_TYPE + '"]'
    );
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
