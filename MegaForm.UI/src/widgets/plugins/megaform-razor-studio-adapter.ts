// ============================================================
// MegaForm Razor Studio — Unified Designer Adapter (v20260602-B39 step 2)
// File: src/widgets/plugins/megaform-razor-studio-adapter.ts
//
// Wraps the existing Recipe gallery + parameter form + live preview
// of the legacy Razor Studio popup as a UnifiedTabApi-compatible
// factory so the new unified-shell can host it as one of its tabs.
//
// SCOPE for v1
//   • NO SQL controls — that surface now lives in the shared Data
//     tab provided by buildDataTab() in unified-shell.ts.
//   • Reuses the existing Recipe pipeline via window.MFRazorStudio
//     because the gallery rendering, RecipeMeta typing, /Render and
//     /Source calls are all locked inside the closure of
//     megaform-razor-studio.ts. Refactoring those helpers out so the
//     adapter can call them in-process is tracked as:
//       TODO[B39 Razor]: refactor renderRecipe / wireConfigEvents /
//         collectFormIntoState / renderLivePreview / ensureCatalog
//         out of the IIFE in megaform-razor-studio.ts so this adapter
//         can drive them directly instead of re-opening the legacy
//         popup as a fallback.
//
// SHIM CONTRACT
//   • mountRazorRecipe(host, ctx) renders an in-tab launcher card.
//   • Clicking the launcher delegates to the legacy
//     window.MFRazorStudio.open() so the user keeps their existing
//     recipe-picking UX while we incrementally migrate.
//   • getDraft() returns whatever the legacy popup last applied via
//     its onApplyProps callback — captured into a local draft slot.
//
// Returned shape mirrors the UnifiedTabApi expected by step-1 docs:
//   { getDraft, setProps, isDirty, destroy }
// ============================================================
// @ts-nocheck
'use strict';

import type {
  UnifiedTabContext,
  UnifiedTabSpec
} from '../../view-designer/shared/unified-shell';

// ── Public shape mirrored from the B38 designs ───────────────
export interface UnifiedTabApi {
  /** Returns the merge slice the tab wants to contribute on Apply. */
  getDraft(): Record<string, any>;
  /** Hydrate the tab UI from a freshly-supplied widgetProps snapshot. */
  setProps(props: Record<string, any>): void;
  /** True when the user has staged a change relative to setProps(). */
  isDirty(): boolean;
  /** Tear down DOM + listeners (called by the host when the shell closes). */
  destroy(): void;
}

function esc(s: any): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function deepClone<T>(v: T): T {
  try { return JSON.parse(JSON.stringify(v)); } catch (_e) { return v; }
}

// ────────────────────────────────────────────────────────────
// Factory — mountRazorRecipe(host, ctx)
// ────────────────────────────────────────────────────────────
export function mountRazorRecipe(
  host: HTMLElement,
  ctx: UnifiedTabContext
): UnifiedTabApi {
  // Snapshot incoming props for dirty tracking + initial UI population.
  var initialProps: Record<string, any> = deepClone(ctx.opts.currentProps || {}) || {};
  var liveProps: Record<string, any> = deepClone(initialProps) || {};
  var draftSlice: Record<string, any> = {};
  var dirty = false;
  var disposed = false;

  function paint() {
    if (disposed) return;
    var wp = liveProps || {};
    var template = String((wp as any).templateName || '');
    var hasOverride = !!(wp as any).razorSource;
    var paramCount = wp.parameters && typeof wp.parameters === 'object'
      ? Object.keys(wp.parameters).length
      : 0;

    host.innerHTML =
      '<div class="mf-ud-razor-tab" style="display:flex;flex-direction:column;gap:12px;padding:4px 2px">' +
        '<div class="mf-ud-razor-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px">' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<i class="fas fa-cube" style="color:#7c3aed;font-size:18px"></i>' +
            '<div style="flex:1">' +
              '<div style="font-size:14px;font-weight:700;color:#0f172a">Recipe template</div>' +
              '<div style="font-size:11px;color:#64748b">Pick a canonical recipe + fill its grouped parameter form.</div>' +
            '</div>' +
            '<button type="button" class="mf-ud-razor-open" style="background:#7c3aed;color:#fff;border:0;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px">' +
              '<span>&#x2728;</span> Open Recipe Picker' +
            '</button>' +
          '</div>' +
          '<div style="font-size:12px;color:#475569;border-top:1px dashed #e2e8f0;padding-top:8px">' +
            '<div><strong>Current template:</strong> ' +
              (template ? '<code style="background:#f1f5f9;padding:1px 8px;border-radius:4px;font-size:11px">' + esc(template) + '</code>' :
                '<em style="color:#94a3b8">(none selected)</em>') +
            '</div>' +
            '<div style="margin-top:4px"><strong>Parameters staged:</strong> ' + paramCount + '</div>' +
            (hasOverride ? '<div style="margin-top:4px;color:#b45309">⚠ Custom .razor override is set (escape hatch).</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="mf-ud-razor-hint" style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;font-size:11px;color:#854d0e;line-height:1.4">' +
          '<strong>Step-2 shim:</strong> The full recipe gallery + parameter form lives in the legacy Razor Studio popup for now. ' +
          'Click <em>Open Recipe Picker</em> to launch it — Apply there will stage the recipe + parameters back into this tab’s draft.' +
        '</div>' +
      '</div>';

    var openBtn = host.querySelector('.mf-ud-razor-open') as HTMLButtonElement | null;
    if (openBtn) {
      openBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        delegateToLegacyStudio();
      });
    }
  }

  function delegateToLegacyStudio() {
    var S: any = (window as any).MFRazorStudio;
    if (!S || typeof S.open !== 'function') {
      try { ctx.toast('Razor Studio bundle not loaded — cannot open recipe picker.', 'error'); } catch (_) {}
      return;
    }
    // TODO[B39 Razor]: refactor renderRecipe / renderRecipeConfigHtml /
    // wireConfigEvents / collectFormIntoState / renderLivePreview out of
    // megaform-razor-studio.ts so we can mount them DIRECTLY into `host`
    // instead of opening the legacy popup. For v1 we delegate as a SHIM.
    S.open({
      fieldKey: '',
      formId: 0,
      currentProps: deepClone(liveProps || {}),
      initialTemplate: String((liveProps as any).templateName || ''),
      onApplyProps: function (newProps: any) {
        var next = newProps && typeof newProps === 'object' ? newProps : {};
        liveProps = deepClone(next);
        draftSlice = deepClone(next);
        dirty = true;
        try {
          ctx.stageDraft(draftSlice);
          ctx.toast('Recipe applied — click Apply at the bottom to commit.', 'success');
        } catch (_) { /* ignore */ }
        paint();
      },
      onPick: function (name: string) {
        // Single-template pick (no full param payload) — record into draft.
        liveProps = liveProps || {};
        (liveProps as any).templateName = String(name || '');
        draftSlice = { templateName: String(name || '') };
        dirty = true;
        try {
          ctx.stageDraft(draftSlice);
          ctx.toast('Template picked — click Apply at the bottom to commit.', 'success');
        } catch (_) { /* ignore */ }
        paint();
      },
      onSaveOverride: function (src: string) {
        liveProps = liveProps || {};
        (liveProps as any).razorSource = String(src || '');
        // razorSource is the escape hatch — surface it but DO NOT clear
        // templateName so the host can decide which wins (existing
        // contract from standalone studio: custom compile path pre-clears
        // templateName itself when onApplyProps fires).
        draftSlice = Object.assign({}, draftSlice, { razorSource: String(src || '') });
        dirty = true;
        try {
          ctx.stageDraft(draftSlice);
          ctx.toast('Custom .razor source staged.', 'success');
        } catch (_) { /* ignore */ }
        paint();
      }
    });
  }

  // ── UnifiedTabApi surface ──────────────────────────────────
  var api: UnifiedTabApi = {
    getDraft: function () { return draftSlice || {}; },
    setProps: function (props) {
      initialProps = deepClone(props || {}) || {};
      liveProps = deepClone(props || {}) || {};
      draftSlice = {};
      dirty = false;
      paint();
    },
    isDirty: function () { return !!dirty; },
    destroy: function () {
      disposed = true;
      try { host.innerHTML = ''; } catch (_) { /* ignore */ }
    }
  };

  paint();
  return api;
}

// ── Convenience: a UnifiedTabSpec wrapper so callers can drop the
//    factory straight into openUnifiedDesigner({ tabs:[…] }).
// ────────────────────────────────────────────────────────────
export function buildRazorRecipeTab(): UnifiedTabSpec {
  var apiHandle: UnifiedTabApi | null = null;
  return {
    id: 'recipe',
    label: 'Recipe',
    icon: 'fas fa-cube',
    getDraft: function () { return apiHandle ? apiHandle.getDraft() : {}; },
    render: function (host, ctx) {
      apiHandle = mountRazorRecipe(host, ctx);
    }
  };
}

// ── Optional: legacy window namespace so non-bundle callers can hit it.
try {
  (window as any).MFRazorRecipeAdapter = {
    mountRazorRecipe: mountRazorRecipe,
    buildRazorRecipeTab: buildRazorRecipeTab
  };
} catch (_e) { /* ignore */ }
