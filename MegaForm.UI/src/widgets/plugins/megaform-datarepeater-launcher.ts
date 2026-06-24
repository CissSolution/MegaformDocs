// ============================================================
// MegaForm DataRepeater — Unified Designer Launcher (v20260602-B40 step 4)
// File: src/widgets/plugins/megaform-datarepeater-launcher.ts
//
// Side-effect module. Injects a NEW button labelled
// "🧬 Open Unified Designer" on every DataRepeater field card in the
// Builder canvas. Sits RIGHT NEXT TO the existing "🧱 Open Designer"
// (Layout Designer) button so admins see:
//     [🧱 Open Designer] [🧬 Open Unified Designer]
//
// SELECTORS (both supported — matches DynLabel B39 pattern):
//   .mf-canvas-field[data-type="DataRepeater"]
//   .mf-field-group[data-type="DataRepeater"]
//
// On click it opens openUnifiedDesigner() with three tabs:
//   • Current Settings (auto-prepended by the shell)
//   • Data            (auto-prepended — owns SQL config per Q5)
//   • Config          (mountDataRepeaterConfig — 5 sub-tabs:
//                       Columns · Filters · Detail · Templates · Display)
//
// IMPORT STRATEGY — eager (NOT lazy):
//   The task spec mentioned a lazy `await import('./megaform-datarepeater-adapter')`
//   inside the tab's render() callback, falling back to eager if that
//   caused UnifiedTabSpec issues. We chose EAGER because:
//     1. UnifiedTabSpec.render is declared as a synchronous void function
//        in unified-shell.ts (line 53). Returning a Promise from render
//        would make the shell render an empty pane and never await it.
//     2. The DynamicLabel launcher (B39 step 3) uses eager import and is
//        the closest precedent; following it keeps the four shipped
//        launchers (Razor / DynLabel / GridRepeater / DataRepeater) shape-
//        identical for review + maintenance.
//     3. The adapter is small (~480 LOC) and tree-shakes into the same
//        builder bundle anyway; lazy-loading saves us nothing measurable
//        once the user opens the Builder.
//   The index.ts edit therefore imports the adapter EAGERLY before the
//   launcher (parity with B39 step 3).
//
// [B58 hard cutover follow-through]: The legacy "🧱 Open Designer" button
//   injector inside megaform-widget-data-repeater.ts has been gated off, so
//   this Unified Designer launcher is now the SOLE entry-point on
//   DataRepeater field cards — matching the Razor / DynamicLabel cutover.
//   Layout Designer + DataRepeater Designer surfaces still live INSIDE the
//   unified shell as the Config tab.
// ============================================================
// @ts-nocheck
'use strict';

import { openUnifiedDesigner } from '../../view-designer/shared/unified-shell';
import { mountDataRepeaterConfig } from './megaform-datarepeater-adapter';

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

  var WIDGET_TYPE = 'DataRepeater';
  var BTN_CLASS   = 'mfdr-unified-launcher';
  var INJECTED    = 'mfdrUnifiedInjected';
  var BTN_LABEL   = '🧬 Open Unified Designer';
  var LEGACY_BTN_SELECTOR = '.mfdr-card-designer-launcher';

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
    //    For v1 nothing listens (parity with B39 dynlabel-launcher).
    try {
      document.dispatchEvent(new CustomEvent('mf:datarepeater-designer-opening', {
        detail: { fieldKey: field.key || '', source: 'unified-launcher' }
      }));
    } catch (_) {}

    openUnifiedDesigner({
      widget: 'datarepeater',
      title: 'DataRepeater Designer',
      badge: 'v20260602 · datarepeater',
      currentProps: JSON.parse(JSON.stringify(wp || {})),
      tabs: [
        {
          id: 'config',
          label: 'Config',
          icon: 'fas fa-table',
          render: function (host, ctx) {
            // Stash the api handle so the shell can ask for its draft on Apply.
            (host as any).__mfDataRepeaterTabApi = mountDataRepeaterConfig(host, ctx);
          },
          getDraft: function () {
            // The shell calls getDraft per-tab; we look up the api handle
            // saved on the rendered pane root.
            var pane = document.querySelector('.mf-unified-designer-pane[data-pane-id="config"]') as HTMLElement | null;
            var api = pane && (pane as any).__mfDataRepeaterTabApi;
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
          try { console.error('[mf-datarepeater-launcher] apply failed', e); } catch (_) {}
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
    btn.title = 'Open the unified Widget Designer — Current Settings + Data + Config (Columns / Filters / Detail / Templates / Display).';
    btn.innerHTML = BTN_LABEL;
    btn.style.cssText = 'background:#0ea5e9;color:#fff;border:0;padding:5px 11px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;margin-left:6px;line-height:1.3';
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var key = card.getAttribute('data-key') || '';
      var field = findField(key);
      openDesigner(field);
    });

    // Place the new button next to the existing Layout Designer button
    // (.mfdr-card-designer-launcher) so the row reads:
    //   Layout Designer · Unified Designer
    // Falls back to before .mf-canvas-field-actions, matching the legacy
    // injector contract from megaform-widget-data-repeater.ts:1874-1879.
    var legacy = card.querySelector(LEGACY_BTN_SELECTOR);
    if (legacy && legacy.parentNode) {
      legacy.parentNode.insertBefore(btn, legacy.nextSibling);
      return;
    }
    var actions = card.querySelector('.mf-canvas-field-actions');
    if (actions && actions.parentNode) {
      actions.parentNode.insertBefore(btn, actions);
    } else {
      card.appendChild(btn);
    }
  }

  function scan() {
    // Accept BOTH .mf-canvas-field and .mf-field-group wrappers (B39-fix
    // pattern from dynlabel-launcher). The scout report noted DataRepeater
    // canvas uses .mf-canvas-field only, but supporting both is harmless
    // and future-proofs against the same dual-selector quirk that hit
    // DynamicLabel.
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
