/**
 * MegaForm Layout Designer v2 — Umbraco-style typed block designer.
 *
 * Output bundle: Assets/js/megaform-layout-designer.js
 * Entry:         window.MFLayoutDesigner.open({ widget, initialHtml, ... })
 *
 * v2 redesign goals:
 *   - Admin never writes raw HTML by default; instead they pick a template
 *     and tweak typed properties on each block (Title text, Image URL,
 *     Background color, etc.).
 *   - 5 quick-start templates (Magazine / Table / Card row / Timeline /
 *     Blank) shown on first open to skip the empty-canvas paralysis.
 *   - Typed block library with thumbnails in the left tray.
 *   - Inline auto-generated inspector form on the right.
 *   - Advanced HTML disclosure for power users; non-empty advancedHtml
 *     replaces the serialized block HTML on save.
 *
 * State round-trip: serialized HTML embeds `<!-- mf:ld-v2 {...} -->` JSON
 * comment so we can rehydrate typed state on reopen. The body uses the
 * existing v1 `<!-- mf:zone -->` / `<!-- mf:block -->` markers so the
 * widget's `splitBackToFields` runtime continues to work unchanged.
 *
 * Badge: LayoutDesigner v20260528-v2-01
 */

import { openPopup, type PopupHandle } from './shared';
import { mountWidgetConfigPanel } from './shared/widget-config-panel';
import { renderWelcome } from './layout/welcome';
import { createTrayV2 } from './layout/tray-v2';
import { createCanvasV2 } from './layout/canvas-v2';
import { createInspectorV2 } from './layout/inspector-v2';
import { injectStylesV2 } from './layout/styles-v2';
import { fetchMockRows } from './layout/mock-data';
import {
  emptyState,
  serializeStateToHtml,
  tryParseV2,
  tryHydrateLegacyZones,
  type DesignerStateV2,
} from './layout/serialize-v2';
import { cloneTemplate } from './layout/templates-v2';
import { findBlockDefV2 } from './layout/blocks-v2';
import type {
  LayoutDesignerOpts,
  LayoutZoneId,
  SqlPreviewResult,
} from './layout/types';

const BADGE = 'LayoutDesigner v20260529-02';
if (typeof window !== 'undefined') {
  (window as any).__MF_LAYOUT_DESIGNER_BADGE__ = BADGE;
}

export function open(opts: LayoutDesignerOpts): void {
  injectStylesV2();

  const initialHtml = String(opts.initialHtml || '').trim();
  const parsedV2 = tryParseV2(initialHtml);
  // [v20260529-02] Try v2 marker first; if absent, try to hydrate legacy
  // `<!-- mf:zone -->` template HTML (e.g. forms the AI assistant created
  // by emitting widgetProps.rowTemplate / wrapperTemplate / headerTemplate
  // directly) so the rows zone shows the existing content as a raw-html
  // block instead of opening empty. Only fall back to advancedHtml as a
  // last resort, so the canvas surfaces what the form already has.
  const hydrated = parsedV2 ? null : tryHydrateLegacyZones(initialHtml);
  const state: DesignerStateV2 = parsedV2 || hydrated || emptyState();
  if (!parsedV2 && !hydrated && initialHtml) {
    state.advancedHtml = initialHtml;
  }

  let selectedUid: string | null = null;
  let mockRows: Record<string, any>[] = [];
  let mockCols: string[] = [];
  let mockError = '';

  const mockMeta = {
    portalId: String(opts.portalId ?? 0),
    formId: String(opts.formId ?? 0),
    viewName: opts.fieldKey || 'Demo View',
    page: '1',
    pageCount: '5',
    rowsOnPage: '10',
    totalRows: '50',
  };

  // ── Build shell ──────────────────────────────────────────────────────────
  const shell = document.createElement('div');
  shell.className = 'mfldv2-shell';

  // Placeholder for tray/canvas/inspector (filled when showing designer)
  const trayHost   = document.createElement('div');
  const mainHost   = document.createElement('div');
  mainHost.className = 'mfldv2-main';
  const inspHost   = document.createElement('div');

  shell.appendChild(trayHost);
  shell.appendChild(mainHost);
  shell.appendChild(inspHost);

  // Toolbar + canvas slot
  const toolbar = document.createElement('div');
  toolbar.className = 'mfldv2-toolbar';
  toolbar.innerHTML = `
    <span class="mfldv2-toolbar-title">
      <i class="fa fa-th"></i> Layout Designer
      <span class="mfldv2-toolbar-title-tag">v2</span>
    </span>
    <button type="button" class="mfldv2-btn is-ghost" data-act="welcome"><i class="fa fa-arrow-left"></i> Change template</button>
    <button type="button" class="mfldv2-btn is-ghost" data-act="reload-mock"><i class="fa fa-sync"></i> Reload sample</button>
  `;
  mainHost.appendChild(toolbar);

  const canvasSlot = document.createElement('div');
  canvasSlot.style.flex = '1';
  canvasSlot.style.minHeight = '0';
  canvasSlot.style.overflow = 'hidden';
  canvasSlot.style.display = 'flex';
  canvasSlot.style.flexDirection = 'column';
  mainHost.appendChild(canvasSlot);

  const mockbar = document.createElement('div');
  mockbar.className = 'mfldv2-mockbar';
  mockbar.textContent = 'Đang tải dữ liệu mẫu…';
  mainHost.appendChild(mockbar);

  toolbar.querySelector('[data-act="welcome"]')?.addEventListener('click', () => {
    if (anyBlocks() && !confirm('Changing the template will clear current blocks. Continue?')) return;
    selectedUid = null;
    state.layout = { header: [], rows: [], pager: [], empty: [] };
    state.templateKey = '';
    state.advancedHtml = '';
    showWelcome();
  });
  toolbar.querySelector('[data-act="reload-mock"]')?.addEventListener('click', () => loadMock());

  // Persistent canvas/tray/inspector handles (created lazily)
  let canvasHandle: ReturnType<typeof createCanvasV2> | null = null;
  let inspectorHandle: ReturnType<typeof createInspectorV2> | null = null;
  let trayHandle: ReturnType<typeof createTrayV2> | null = null;

  // ── Popup ────────────────────────────────────────────────────────────────
  const popup: PopupHandle = openPopup({
    title: opts.widget === 'data-repeater' ? 'DataRepeater Layout Designer' : 'Dynamic Label Layout Designer',
    subtitle: 'Pick a template, drag blocks, tweak properties. No HTML required.',
    body: shell,
    width: '1440px',
    saveLabel: 'Apply HTML',
    onSave: async () => {
      const finalHtml = serializeStateToHtml(state);
      if (opts.onApply) {
        try { opts.onApply(finalHtml); } catch { /* ignore */ }
      }
      return true;
    },
  });

  (window as any).__MF_LAYOUT_DESIGNER_POPUP__ = popup;

  // Initial routing: welcome vs designer
  if (anyBlocks() || (state.advancedHtml && state.advancedHtml.trim())) {
    showDesigner();
  } else {
    showWelcome();
  }
  void loadMock();

  // ─────────────────────────────────────────────────────────────────────────
  //  Welcome screen
  // ─────────────────────────────────────────────────────────────────────────

  function showWelcome(): void {
    canvasSlot.innerHTML = '';
    trayHost.style.display = 'none';
    inspHost.style.display = 'none';
    toolbar.style.display = 'none';
    mockbar.style.display = 'none';
    shell.classList.add('is-welcome');

    renderWelcome({
      host: canvasSlot,
      onPick: (templateKey) => {
        const tpl = cloneTemplate(templateKey);
        if (tpl) {
          state.layout = tpl.layout;
          state.templateKey = tpl.key;
          state.advancedHtml = '';
        }
        showDesigner();
      },
      onImport: () => {
        const html = window.prompt(
          'Paste existing HTML (Advanced mode). Leave blank to cancel.',
          state.advancedHtml || ''
        );
        if (html == null) return;
        state.advancedHtml = html;
        state.templateKey = '';
        showDesigner();
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Designer screen
  // ─────────────────────────────────────────────────────────────────────────

  function showDesigner(): void {
    trayHost.style.display = '';
    inspHost.style.display = '';
    toolbar.style.display = '';
    mockbar.style.display = '';
    shell.classList.remove('is-welcome');
    canvasSlot.innerHTML = '';

    // Build canvas
    canvasHandle = createCanvasV2({
      state,
      mockRows: () => mockRows,
      mockMeta: () => mockMeta,
      selectedUid: () => selectedUid,
      onSelect: (uid) => {
        selectedUid = uid;
        inspectorHandle?.render();
      },
      onChange: () => {
        canvasHandle?.render();
        inspectorHandle?.render();
      },
    });
    canvasSlot.appendChild(canvasHandle.el);

    // Tray
    trayHost.innerHTML = '';
    trayHandle = createTrayV2({
      host: trayHost,
      onAddToZone: (blockKey, zoneHint) => {
        const def = findBlockDefV2(blockKey);
        if (!def) return;
        const targetZone: LayoutZoneId =
          (zoneHint === 'header' || zoneHint === 'rows' || zoneHint === 'pager' || zoneHint === 'empty')
            ? zoneHint
            : (def.zone === 'any' ? 'header' : def.zone);
        const props: Record<string, any> = {};
        def.props.forEach((p) => { props[p.key] = p.default; });
        const newInst = {
          uid: `bi_${Date.now().toString(36)}_${Math.floor(Math.random()*9999).toString(36)}`,
          blockKey,
          props,
        };
        state.layout[targetZone] = [...(state.layout[targetZone] || []), newInst];
        selectedUid = newInst.uid;
        canvasHandle?.render();
        inspectorHandle?.render();
      },
    });

    // Inspector
    inspHost.innerHTML = '';
    inspectorHandle = createInspectorV2({
      host: inspHost,
      state,
      selectedUid: () => selectedUid,
      onChange: () => {
        canvasHandle?.render();
      },
      onAdvancedHtmlChange: (html) => {
        state.advancedHtml = html;
      },
    });
    inspHost.appendChild(inspectorHandle.el);

    // [v20260529-01] Umbraco-style "AI Configuration" panel — must mount
    // AFTER inspHost.innerHTML reset above, otherwise it gets wiped.
    // Inserts before inspectorHandle.el so it's pinned at the top of the
    // right rail. Shows every widgetProp the AI assistant set on this field.
    try {
      mountWidgetConfigPanel({
        host: inspHost,
        fieldKey: opts.fieldKey,
        title: 'AI Configuration · ' + (opts.fieldKey || 'this field'),
      });
    } catch { /* standalone test page without builder state — ignore */ }

    canvasHandle.render();
    inspectorHandle.render();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Mock data
  // ─────────────────────────────────────────────────────────────────────────

  async function loadMock(): Promise<void> {
    const scope = `${opts.widget}:${opts.formId || 0}:${opts.fieldKey || ''}`;
    mockbar.classList.remove('is-error');
    mockbar.textContent = 'Loading sample data…';
    let result: SqlPreviewResult;
    try {
      result = await fetchMockRows(scope, opts.sqlPreview, 5);
    } catch (err) {
      result = { columns: [], rows: [], error: err instanceof Error ? err.message : String(err) };
    }
    mockRows = result.rows || [];
    mockCols = result.columns || [];
    mockError = result.error || '';
    if (mockError) {
      mockbar.classList.add('is-error');
      mockbar.textContent = 'Sample data error: ' + mockError;
    } else {
      mockbar.innerHTML =
        '<span><strong>' + mockRows.length + '</strong> sample rows · ' +
        '<strong>' + mockCols.length + '</strong> columns — ' +
        (mockCols.slice(0, 4).join(', ') || 'no columns') + '</span>';
    }
    canvasHandle?.render();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────────────────────

  function anyBlocks(): boolean {
    return (['header','rows','pager','empty'] as LayoutZoneId[]).some(
      (z) => (state.layout[z] || []).length > 0
    );
  }
}

(function bootstrap() {
  (window as any).MFLayoutDesigner = { open, badge: BADGE };
})();

export const badge = BADGE;
