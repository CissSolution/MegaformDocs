// ============================================================
// Config Panel — main component
// Tabs: Form Designer | View Settings | Advanced
// ============================================================

import { h, clear, delegate, $, $$ } from '@shared/dom';
import { parseJson } from '@shared/utils';
import { renderViewSettings } from './ViewSettings';
import type { PlatformAdapter, InitContext } from '@core/platform';
import type { FieldMeta, ViewType } from '@core/types';

interface ConfigState {
  selectedFormId: number;
  selectedViewType: ViewType;
  viewConfigJson: string;
  cssClass: string;
  cacheMinutes: number;
  permissions: string;
  fields: FieldMeta[];
  forms: Array<{ formId: number; title: string; status: string }>;
}

export function mountConfigPanel(root: HTMLElement, adapter: PlatformAdapter, ctx: InitContext): void {
  const api = adapter.api;
  const state: ConfigState = {
    selectedFormId: ctx.formId || 0,
    selectedViewType: (ctx.viewType as ViewType) || 'submit',
    viewConfigJson: '{}',
    cssClass: '',
    cacheMinutes: 0,
    permissions: 'all',
    fields: [],
    forms: [],
  };

  // Load initial data
  async function loadConfig(): Promise<void> {
    try {
      const raw = await api.getModuleConfig(ctx.instanceId);
      // API returns PascalCase — normalize to camelCase
      state.forms = (raw.forms || []).map((f: any) => ({
        formId: f.formId ?? f.FormId,
        title: f.title ?? f.Title ?? 'Untitled',
        status: f.status ?? f.Status ?? 'Draft',
      }));
      const cfg = raw.config as any;
      if (raw.configured && cfg) {
        state.selectedFormId = cfg.formId ?? cfg.FormId;
        state.selectedViewType = (cfg.viewType ?? cfg.ViewType ?? 'submit') as ViewType;
        state.viewConfigJson = cfg.viewConfigJson ?? cfg.ViewConfigJson ?? '{}';
        state.cssClass = cfg.cssClass ?? cfg.CssClass ?? '';
        state.cacheMinutes = cfg.cacheMinutes ?? cfg.CacheMinutes ?? 0;
        state.fields = (raw.fields || []).map((f: any) => ({
          key: f.key ?? f.Key, label: f.label ?? f.Label, type: f.type ?? f.Type,
        }));
      }
      renderPanel();
    } catch (err) {
      root.innerHTML = '<div class="mf-cfg-notice" style="border-color:#fca5a5;background:#fef2f2;color:#991b1b;">' +
        '<i class="fas fa-exclamation-triangle"></i> Failed to load configuration. Check API connection.</div>';
      console.error('Config load error:', err);
    }
  }

  async function loadFields(formId: number): Promise<void> {
    try {
      const data = await api.getFields(formId);
      state.fields = data.fields || [];
    } catch { state.fields = []; }
  }

  function renderPanel(): void {
    clear(root);

    // Header
    const header = h('div', { class: 'mf-config-header' },
      h('div', { class: 'mf-config-title' },
        h('i', { class: 'fas fa-cogs' }), ' MegaForm Configuration',
      ),
      h('div', { class: 'mf-config-actions' },
        h('button', { type: 'button', class: 'mf-cfg-btn mf-cfg-btn-primary', id: 'mf-ts-save' },
          h('i', { class: 'fas fa-save' }), ' Save Configuration'),
        h('button', { type: 'button', class: 'mf-cfg-btn', id: 'mf-ts-preview' },
          h('i', { class: 'fas fa-eye' }), ' Preview'),
        h('button', { type: 'button', class: 'mf-cfg-btn', onclick: (e: Event) => {
          e.preventDefault(); e.stopPropagation();
          const url = window.location.pathname;
          window.location.href = url;
        }},
          h('i', { class: 'fas fa-external-link-alt' }), ' View Form'),
        h('button', { type: 'button', class: 'mf-cfg-btn mf-cfg-btn-danger', id: 'mf-ts-reset',
          title: 'Delete all forms for this module and reset configuration',
          onclick: async (e: Event) => {
            e.preventDefault(); e.stopPropagation();
            if (state.forms.length === 0) {
              adapter.showToast('No forms to delete.', 'error');
              return;
            }
            const formList = state.forms.map(f => `  • ${f.title} (ID: ${f.formId})`).join('\n');
            if (!confirm(`⚠️ Delete ALL ${state.forms.length} form(s) for this module?\n\n${formList}\n\nThis will permanently delete these forms and all their submissions. This cannot be undone!`)) return;
            const btn = e.target as HTMLButtonElement;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            let deleted = 0;
            for (const f of state.forms) {
              try {
                await api.deleteForm(f.formId);
                deleted++;
                console.log('[MegaForm] Deleted form:', f.formId, f.title);
              } catch (err) {
                console.error('[MegaForm] Failed to delete form:', f.formId, err);
              }
            }
            adapter.showToast(`Deleted ${deleted} form(s). Reloading...`, 'success');
            state.forms = [];
            state.selectedFormId = 0;
            state.fields = [];
            setTimeout(() => window.location.reload(), 800);
          },
        },
          h('i', { class: 'fas fa-trash-alt' }), ' Reset All Forms'),
      ),
    );

    // Tabs
    const tabs = h('div', { class: 'mf-config-tabs' },
      h('button', { type: 'button', class: 'mf-cfg-tab active', 'data-tab': 'designer' },
        h('i', { class: 'fas fa-drafting-compass' }), ' Form Designer'),
      h('button', { type: 'button', class: 'mf-cfg-tab', 'data-tab': 'view' },
        h('i', { class: 'fas fa-columns' }), ' View Settings'),
      h('button', { type: 'button', class: 'mf-cfg-tab', 'data-tab': 'advanced' },
        h('i', { class: 'fas fa-sliders-h' }), ' Advanced'),
    );

    // Tab contents
    const tabDesigner = h('div', { class: 'mf-cfg-content active', id: 'mf-ts-tab-designer' });
    const tabView = h('div', { class: 'mf-cfg-content', id: 'mf-ts-tab-view' });
    const tabAdvanced = h('div', { class: 'mf-cfg-content', id: 'mf-ts-tab-advanced' });

    const body = h('div', { class: 'mf-config-body' },
      tabs, tabDesigner, tabView, tabAdvanced);
    const panel = h('div', { class: 'mf-config-panel' }, header, body);
    root.appendChild(panel);

    // ── Tab: Form Designer ──
    renderDesignerTab();

    // ── Tab: View Settings ──
    renderViewTab();

    // ── Tab: Advanced ──
    renderAdvancedTab();

    // ── Tab switching ──
    delegate(tabs, 'click', '.mf-cfg-tab', (_e, el) => {
      const tab = el.getAttribute('data-tab') || '';
      activateTab(tab);
    });

    // ── Save ──
    const saveBtn = $('#mf-ts-save', root);
    if (saveBtn) {
      saveBtn.addEventListener('click', handleSave);
    }

    // ── Preview ──
    const previewBtn = $('#mf-ts-preview', root);
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        if (!state.selectedFormId) {
          adapter.showToast('Please select a form first.', 'error');
          return;
        }
        // Inline preview — scroll to preview area
        const previewArea = $('#mf-ts-preview-area', root);
        if (previewArea) {
          previewArea.style.display = '';
          previewArea.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;">' +
            '<i class="fas fa-spinner fa-spin"></i> Loading preview...</div>';
          // Load form schema and render preview
          api.getSchema(state.selectedFormId).then(schema => {
            previewArea.innerHTML = '<div class="mf-cfg-preview-frame">' +
              '<div class="mf-cfg-preview-header"><i class="fas fa-eye"></i> Live Preview</div>' +
              '<div id="mf-ts-preview-render" style="padding:16px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 8px 8px;"></div></div>';
            // Dispatch event for legacy renderer to pick up
            const evt = new CustomEvent('megaform:preview', {
              detail: { containerId: 'mf-ts-preview-render', schema: schema.schema, formId: schema.formId }
            });
            document.dispatchEvent(evt);
          }).catch(() => {
            previewArea.innerHTML = '<div style="padding:20px;color:#991b1b;">Preview failed — form may not be published yet.</div>';
          });
          previewArea.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    function renderDesignerTab(): void {
      clear(tabDesigner);

      // Form selector
      const formSelect = h('select', { class: 'mf-cfg-input', id: 'mf-ts-form-select' }) as HTMLSelectElement;
      formSelect.appendChild(h('option', { value: '' }, '— Choose a form —'));
      state.forms.forEach(f => {
        const opt = h('option', { value: String(f.formId) },
          `${f.title}${f.status !== 'Published' ? ` [${f.status}]` : ''}`) as HTMLOptionElement;
        if (f.formId === state.selectedFormId) opt.selected = true;
        formSelect.appendChild(opt);
      });

      formSelect.addEventListener('change', async () => {
        state.selectedFormId = parseInt(formSelect.value) || 0;
        if (state.selectedFormId) {
          await loadFields(state.selectedFormId);
          renderViewTab();
        }
      });

      // Auto-load fields for pre-selected form (from saved config)
      if (state.selectedFormId && formSelect.value === String(state.selectedFormId)) {
        loadFields(state.selectedFormId).then(() => renderViewTab());
      }

      // Builder container — loads inline
      const builderContainer = h('div', { id: 'mf-inline-builder', style: 'display:none;' });

      const openBuilderBtn = h('button', {
        type: 'button',
        class: 'mf-cfg-btn mf-cfg-btn-primary',
        style: 'display:inline-flex;align-items:center;gap:6px;',
        onclick: async (e: Event) => {
          e.preventDefault(); e.stopPropagation();
          if (!state.selectedFormId) { alert('Please select a form first'); return; }
          try {
            const form = await adapter.api.getForm(state.selectedFormId);
            builderContainer.style.display = '';
            builderContainer.innerHTML = '';
            // Call builder via global API (separate bundle)
            const initBuilder = (window as any).MegaForm?.initBuilder;
            if (!initBuilder) {
              alert('Builder bundle not loaded. Add megaform-builder.js to the page.');
              return;
            }
            // Set data attributes for builder entry point
            builderContainer.dataset.platform = ctx.platform;
            builderContainer.dataset.instanceId = String(ctx.instanceId);
            builderContainer.dataset.apiBase = ctx.apiBase;
            builderContainer.dataset.formId = String(state.selectedFormId);
            builderContainer.dataset.schema = (form as any).SchemaJson || (form as any).schemaJson || '{}';
            builderContainer.dataset.returnUrl = '';
            initBuilder(builderContainer);
            formArea.style.display = 'none';
          } catch (err) {
            console.error('Builder load error:', err);
            alert('Failed to load builder: ' + (err as Error).message);
          }
        },
      }, h('i', { class: 'fas fa-drafting-compass' }), ' Open Form Builder');

      // Submissions container
      const subsContainer = h('div', { id: 'mf-inline-subs', style: 'display:none;' });

      const openSubsBtn = h('button', {
        type: 'button',
        class: 'mf-cfg-btn',
        style: 'display:inline-flex;align-items:center;gap:6px;',
        onclick: (e: Event) => {
          e.preventDefault(); e.stopPropagation();
          if (!state.selectedFormId) { alert('Please select a form first'); return; }
          const initSubs = (window as any).MegaForm?.initSubmissions;
          if (!initSubs) { alert('Views bundle not loaded.'); return; }
          subsContainer.style.display = '';
          subsContainer.innerHTML = '';
          subsContainer.dataset.platform = ctx.platform;
          subsContainer.dataset.instanceId = String(ctx.instanceId);
          subsContainer.dataset.apiBase = ctx.apiBase;
          subsContainer.dataset.formId = String(state.selectedFormId);
          initSubs(subsContainer);
          builderContainer.style.display = 'none';
          builderContainer.innerHTML = '';
          formArea.style.display = 'none';
        },
      }, h('i', { class: 'fas fa-inbox' }), ' View Submissions');

      const closeInlineBtn = h('button', {
        type: 'button',
        class: 'mf-cfg-btn',
        style: 'display:inline-flex;align-items:center;gap:6px;',
        onclick: (e: Event) => {
          e.preventDefault(); e.stopPropagation();
          builderContainer.style.display = 'none';
          builderContainer.innerHTML = '';
          subsContainer.style.display = 'none';
          subsContainer.innerHTML = '';
          formArea.style.display = '';
        },
      }, h('i', { class: 'fas fa-arrow-left' }), ' Back to Config');

      const formArea = h('div', { class: 'mf-cfg-section' },
        h('div', { class: 'mf-cfg-form-select' },
          h('label', null, 'Select Form'),
          formSelect,
        ),
        h('div', { style: 'margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;' },
          openBuilderBtn,
          openSubsBtn,
          closeInlineBtn,
        ),
        h('div', { class: 'mf-cfg-notice', style: 'margin-top:16px;' },
          h('i', { class: 'fas fa-info-circle' }),
          ' Select a form, then open the Builder or Submissions viewer.',
        ),
      );

      tabDesigner.appendChild(formArea);
      tabDesigner.appendChild(builderContainer);
      tabDesigner.appendChild(subsContainer);
    }

    function renderViewTab(): void {
      clear(tabView);
      if (state.fields.length === 0 && state.selectedFormId > 0) {
        tabView.innerHTML = '<div class="mf-cfg-notice"><i class="fas fa-info-circle"></i> Loading fields...</div>';
        loadFields(state.selectedFormId).then(() => {
          clear(tabView);
          doRenderViewSettings();
        });
      } else {
        doRenderViewSettings();
      }
    }

    function doRenderViewSettings(): void {
      if (state.fields.length === 0) {
        tabView.innerHTML = '<div class="mf-cfg-notice"><i class="fas fa-info-circle"></i> ' +
          'Select a form in the "Form Designer" tab first to configure view settings.</div>';
        return;
      }
      renderViewSettings({
        container: tabView,
        fields: state.fields,
        initialViewType: state.selectedViewType,
        initialConfig: state.viewConfigJson,
        onChange: (vt, cfg) => {
          state.selectedViewType = vt;
          state.viewConfigJson = cfg;
        },
      });
    }

    function renderAdvancedTab(): void {
      clear(tabAdvanced);
      tabAdvanced.appendChild(
        h('div', { class: 'mf-cfg-section' },
          h('div', { class: 'mf-cfg-row' },
            h('label', null, 'CSS Class'),
            h('input', { type: 'text', class: 'mf-cfg-input', id: 'mf-ts-css-class',
              placeholder: 'e.g. my-custom-form', value: state.cssClass }),
          ),
          h('div', { class: 'mf-cfg-row' },
            h('label', null, 'Cache (minutes)'),
            h('input', { type: 'number', class: 'mf-cfg-input', id: 'mf-ts-cache',
              value: String(state.cacheMinutes), min: '0', max: '1440' }),
            h('small', { style: 'color:#94a3b8;' }, '0 = no cache'),
          ),
          h('div', { class: 'mf-cfg-row' },
            h('label', null, 'Permissions'),
            (() => {
              const sel = h('select', { class: 'mf-cfg-input', id: 'mf-ts-perms' }) as HTMLSelectElement;
              sel.innerHTML = '<option value="all">Everyone (Public)</option>' +
                '<option value="auth">Authenticated Users Only</option>' +
                '<option value="admin">Admins Only</option>';
              if (state.permissions) sel.value = state.permissions;
              return sel;
            })(),
          ),
        )
      );
      // Preview area
      tabAdvanced.appendChild(
        h('div', { id: 'mf-ts-preview-area', style: 'display:none;margin-top:20px;' })
      );
    }

    function activateTab(tab: string): void {
      const allTabs = $$('.mf-cfg-tab', root);
      const allContents = $$('.mf-cfg-content', root);
      allTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tab));
      allContents.forEach(c => c.classList.toggle('active', c.id === `mf-ts-tab-${tab}`));
    }

    async function handleSave(): Promise<void> {
      if (!state.selectedFormId) {
        adapter.showToast('Please select a form first.', 'error');
        return;
      }

      const btn = $('#mf-ts-save', root) as HTMLButtonElement;
      if (!btn) return;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

      // Collect view config from ViewSettings component
      const viewContainer = tabView as unknown as Record<string, unknown>;
      if (typeof viewContainer._collectConfig === 'function') {
        const collected = (viewContainer._collectConfig as () => { viewType: string; config: string })();
        state.selectedViewType = collected.viewType as ViewType;
        state.viewConfigJson = collected.config;
      }

      // Collect advanced settings
      const cssEl = $('#mf-ts-css-class', root) as HTMLInputElement;
      const cacheEl = $('#mf-ts-cache', root) as HTMLInputElement;
      const permsEl = $('#mf-ts-perms', root) as HTMLSelectElement;
      state.cssClass = cssEl?.value || '';
      state.cacheMinutes = parseInt(cacheEl?.value || '0') || 0;
      state.permissions = permsEl?.value || 'all';

      try {
        console.log('[MegaForm] Saving config:', {
          moduleId: ctx.instanceId,
          formId: state.selectedFormId,
          viewType: state.selectedViewType,
        });
        await api.saveModuleConfig({
          moduleId: ctx.instanceId,
          formId: state.selectedFormId,
          viewType: state.selectedViewType,
          viewConfig: state.viewConfigJson,
          cssClass: state.cssClass,
          cacheMinutes: state.cacheMinutes,
          permissions: JSON.stringify({ access: state.permissions }),
        });

        btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        adapter.showToast('Configuration saved!', 'success');
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Configuration';
        adapter.showToast('Save failed. Please try again.', 'error');
        console.error('Save error:', err);
      }
    }
  }

  // Kick off
  root.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b;">' +
    '<i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Loading configuration...</div>';
  loadConfig();
}
