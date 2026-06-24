// ============================================================
// MegaForm Admin Live Style Editor — Core Class
// ============================================================

import type { PaneId, StyleState, SaveStylePayload, InspectSelection } from './types';
import { getPlatformHostConfig } from '@shared/platform-host';
import { t } from '../i18n';
import { THEME_PRESETS, CONTROL_GROUPS, ALL_VARS, ensureFontLoaded, FONT_FAMILIES } from './presets';
import {
  getCssVar, setCssVar, clearCssVars,
  toHex, collectInlineVars, buildCssOverride, applyVarsMap,
} from './cssUtils';
import { buildShell, buildThemePane, buildControlPane } from './panelBuilder';
import { ElementInspector } from './inspector';
import { LiveCssInspector } from './cssInspector';
import { ensureLiveEditorShellStyles } from './shellStyles';

export class LiveEditor {
  static readonly BADGE = 'LiveEditor v20260407-08'; // shell polish + live selector CSS inspector + plugin sync build pipeline
  private fw!: HTMLElement;        // .mf-form-wrapper
  private fi: HTMLElement | null = null; // .mf-form-inner
  private inspector!: ElementInspector;
  private cssInspector!: LiveCssInspector;
  private maxWidthOverrideStyle: HTMLStyleElement | null = null;
  private saveEndpoint = '/API/MegaForm/ModuleConfig/SaveStyle';
  private apiBase = '/DesktopModules/MegaForm/API/'; // derived from saveEndpoint in init()
  private formId = 0;
  private moduleId = 0;

  /** Build request headers — injects DNN anti-forgery token when running inside DNN.
   *
   * BUG FIX v20260406-03: On the form render page (Default.aspx?formid=N),
   * window.__MF_PLATFORM__ is NOT set — dnn-host.js only sets it when the admin
   * overlay is open. getPlatformHostConfig() therefore returns platform='aspcore'
   * → the DNN SF block is skipped → no antiforgery token → 401.
   *
   * Fix: detect DNN by checking whether jQuery.ServicesFramework exists (it is
   * always injected by DNN into admin pages). If SF is available, use it regardless
   * of __MF_PLATFORM__, falling back to this.moduleId which is read from the
   * data-module-id attribute on the form wrapper DOM element.
   */
  private _buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const moduleId = this.moduleId
        || (getPlatformHostConfig().moduleId as number | undefined)
        || 0;
      const sf = (window as any).jQuery?.ServicesFramework?.(moduleId);
      if (sf) {
        // jQuery.ServicesFramework present → we are inside DNN, inject token
        headers['RequestVerificationToken'] = sf.getAntiForgeryValue();
        headers['TabId']    = String(sf.getTabId());
        headers['ModuleId'] = String(sf.getModuleId());
      }
    } catch { /* non-DNN platform — no headers needed */ }
    return headers;
  }
  private activeThemeKey = '';
  private savedState!: StyleState;

  // ── Init ───────────────────────────────────────────────────

  init(): void {
    const fw = document.querySelector<HTMLElement>('.mf-form-wrapper');
    if (!fw) return;
    this.fw = fw;
    this.fi = fw.querySelector<HTMLElement>('.mf-form-inner');

    this.saveEndpoint = fw.dataset['saveEndpoint'] ?? '/API/MegaForm/ModuleConfig/SaveStyle';
    // Derive apiBase by stripping the last two path segments (controller + action).
    // BUG FIX v20260406-02: the old regex only matched "ModuleConfig/SaveStyle" but
    // FormView.ascx sets data-save-endpoint="/API/MegaForm/Form/SaveStyle", so the
    // regex missed → apiBase remained "/API/MegaForm/Form/SaveStyle" → appending
    // "Form/SaveTheme" produced "/API/MegaForm/Form/SaveStyleForm/SaveTheme" → 404.
    // Fix: remove the last two slash-separated segments regardless of their names.
    // e.g. "/API/MegaForm/Form/SaveStyle"           → "/API/MegaForm/"
    //      "/DesktopModules/MegaForm/API/Form/SaveStyle" → "/DesktopModules/MegaForm/API/"
    // [B51] Platform-aware fallback for apiBase when saveEndpoint cannot
    // be stripped to a base. Honor Oqtane indicators (window.Oqtane,
    // data-mf-platform=oqtane, etc.) so the LiveEditor in Oqtane Builder
    // posts to /api/MegaForm/ instead of /DesktopModules/.
    const _liveW = window as any;
    const _livePf = _liveW.__MF_PLATFORM__ || {};
    const _liveIsOq = String(_livePf.platform || '').toLowerCase() === 'oqtane'
      || !!_liveW.Oqtane
      || !!_liveW.__OQTANE__
      || !!document.querySelector('[data-mf-platform="oqtane"]');
    const _liveDefault = _liveIsOq ? '/api/MegaForm/' : '/DesktopModules/MegaForm/API/';
    this.apiBase = (this.saveEndpoint.replace(/[^/]+\/[^/]+\/?$/, '') || _liveDefault)
      .replace(/\/?$/, '/'); // ensure trailing slash
    this.formId   = parseInt(fw.dataset['formId']   ?? '0', 10);
    this.moduleId = parseInt(
      fw.dataset['moduleId']
        ?? document.body.dataset['moduleId']
        ?? String((window as any).__MF_PLATFORM__?.moduleId ?? 0)
        ?? '0',
      10
    );
    this.activeThemeKey = [...fw.classList].find(c => c.startsWith('mf-theme-')) ?? '';

    // Pre-load any font already applied
    const currentFont = getCssVar(fw, '--mf-font-family');
    if (currentFont) {
      const match = FONT_FAMILIES.find(f => {
        const first = f.value.split(',')[0].replace(/'/g, '').trim().toLowerCase();
        return currentFont.toLowerCase().includes(first);
      });
      if (match?.url) ensureFontLoaded(match.url);
    }

    ensureLiveEditorShellStyles();
    this.cssInspector = new LiveCssInspector(this.fw, () => this.onInspectorChange());
    this.savedState = this.captureState();

    const editUrl = document.querySelector<HTMLAnchorElement>('.mf-cfg-edit-btn')?.href ?? '#';
    document.body.appendChild(buildShell(editUrl));

    // Inspector — nút đã được build sẵn trong panel tab bar (#mf-le-inspect-btn)
    this.inspector = new ElementInspector(this.fw, (selection) => this.handleInspectorSelection(selection));
    // setToggleBtn sau khi DOM render (buildShell đã append rồi)
    setTimeout(() => {
      const btn = document.getElementById('mf-le-inspect-btn');
      if (btn) this.inspector.setToggleBtn(btn);
    }, 0);

    this.renderPane('theme');
    this.updateFooterBadge('theme');
    this.bindEvents();
  }

  // ── Pane rendering ─────────────────────────────────────────

  private renderPane(paneId: PaneId): void {
    const pane = document.getElementById(`mf-le-pane-${paneId}`);
    if (!pane) return;

    if (paneId === 'theme') {
      buildThemePane(pane, this.fw, THEME_PRESETS, this.activeThemeKey);
      this.bindThemePaneEvents(pane);
    } else if (paneId === 'css') {
      this.cssInspector.render(pane);
    } else {
      const groups = CONTROL_GROUPS.filter(g => g.pane === paneId);
      if (groups.length) {
        buildControlPane(pane, groups, this.fw, this.fi);
        this.bindControlPaneEvents(pane, groups);
      }
    }
    this.updateFooterBadge(paneId);
  }

  private refreshAllPanes(): void {
    const panes: PaneId[] = ['theme', 'layout', 'typography', 'inputs', 'button', 'css'];
    panes.forEach(p => this.renderPane(p));
  }

  // ── Events ─────────────────────────────────────────────────

  private bindEvents(): void {
    document.getElementById('mf-le-trigger')?.addEventListener('click', () => this.open());
    document.getElementById('mf-le-close')?.addEventListener('click', () => this.close());
    document.getElementById('mf-le-overlay')?.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); });
    document.getElementById('mf-le-tabs')?.addEventListener('click', (e: Event) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('.mf-le-tab');
      if (tab?.dataset['pane']) this.switchTab(tab.dataset['pane'] as PaneId);
    });
    document.getElementById('mf-le-save')?.addEventListener('click', () => void this.save());
    document.getElementById('mf-le-reset')?.addEventListener('click', () => this.reset());
    document.getElementById('mf-le-export-theme')?.addEventListener('click', () => void this.exportToTheme());
    document.getElementById('mf-le-inspect-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.inspector.toggle();
      const btn = document.getElementById('mf-le-inspect-btn');
      btn?.classList.toggle('active', this.inspector.isActive());
      btn?.setAttribute('aria-pressed', this.inspector.isActive() ? 'true' : 'false');
    });
  }

  private bindThemePaneEvents(pane: HTMLElement): void {
    // Theme swatches
    pane.querySelectorAll<HTMLElement>('.mf-le-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset['theme'] ?? '';
        this.applyTheme(key);
        pane.querySelectorAll('.mf-le-swatch').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        const panes: PaneId[] = ['layout', 'typography', 'inputs', 'button'];
        panes.forEach(p => this.renderPane(p));
      });
    });

    this.bindColorPairs(pane, this.fw);

    // Extra class
    const extraInput = pane.querySelector<HTMLInputElement>('#mf-le-extra-class');
    extraInput?.addEventListener('input', () => {
      const keep = ['mf-form-wrapper'];
      if (this.activeThemeKey) keep.push(this.activeThemeKey);
      const extra = extraInput.value.trim();
      this.fw.className = keep.join(' ') + (extra ? ` ${extra}` : '');
    });
  }

  private bindControlPaneEvents(pane: HTMLElement, groups: typeof CONTROL_GROUPS): void {
    // Build a var→target map for this pane
    const varTargetMap: Record<string, HTMLElement> = {};
    groups.forEach(g => g.controls.forEach(ctrl => {
      varTargetMap[ctrl.var] = ctrl.target === 'inner' && this.fi ? this.fi : this.fw;
    }));

    const targetEl = (varName: string) => varTargetMap[varName] ?? this.fw;

    // Range sliders
    pane.querySelectorAll<HTMLInputElement>('.mf-le-range[data-var]').forEach(input => {
      input.addEventListener('input', () => {
        const unit = input.dataset['unit'] ?? 'px';
        const val = input.value + unit;
        const varName = input.dataset['var']!;
        setCssVar(targetEl(varName), varName, val);
        const rvl = document.getElementById(`mf-le-rvl-${varName.replace(/--/g, '')}`);
        if (rvl) rvl.textContent = val;
        // Live preview: nếu là max-width, override template CSS ngay lập tức
        if (varName === '--mf-form-max-width') this.applyMaxWidthOverride(val);
      });
    });

    // Color pickers + text
    this.bindColorPairs(pane, this.fw, varTargetMap);

    // Selects
    pane.querySelectorAll<HTMLSelectElement>('.mf-le-select[data-var]').forEach(sel => {
      if (sel.classList.contains('mf-le-shadow-preset') || sel.classList.contains('mf-le-font-select')) return;
      sel.addEventListener('change', () => {
        setCssVar(targetEl(sel.dataset['var']!), sel.dataset['var']!, sel.value);
      });
    });

    // Shadow text inputs
    pane.querySelectorAll<HTMLInputElement>('.mf-le-shadow-text[data-var]').forEach(input => {
      input.addEventListener('input', () => {
        setCssVar(targetEl(input.dataset['var']!), input.dataset['var']!, input.value);
      });
    });

    // Plain text inputs
    pane.querySelectorAll<HTMLInputElement>('.mf-le-input[data-var]').forEach(input => {
      if (input.classList.contains('mf-le-shadow-text')) return;
      input.addEventListener('input', () => {
        setCssVar(targetEl(input.dataset['var']!), input.dataset['var']!, input.value);
      });
    });

    // Font selects
    pane.querySelectorAll<HTMLSelectElement>('.mf-le-font-select[data-var]').forEach(sel => {
      sel.addEventListener('change', () => {
        const varName = sel.dataset['var']!;
        const fontValue = sel.value;
        // Load Google Font if needed
        const selected = sel.options[sel.selectedIndex];
        const url = selected?.dataset['url'] ?? '';
        if (url) ensureFontLoaded(url);
        setCssVar(this.fw, varName, fontValue);
        // Update preview
        const safeId = varName.replace(/--/g, '');
        const preview = document.getElementById(`mf-le-fpv-${safeId}`);
        if (preview) preview.style.fontFamily = fontValue;
      });
    });
  }

  private bindColorPairs(
    container: HTMLElement,
    defaultEl: HTMLElement,
    varTargetMap?: Record<string, HTMLElement>,
  ): void {
    const target = (v: string) => varTargetMap?.[v] ?? defaultEl;

    container.querySelectorAll<HTMLInputElement>('.mf-le-color-picker[data-var]').forEach(col => {
      col.addEventListener('input', () => {
        const varName = col.dataset['var']!;
        setCssVar(target(varName), varName, col.value);
        const pairId = col.dataset['pair'] ?? '';
        const txt = document.getElementById(pairId) as HTMLInputElement | null;
        if (txt) txt.value = col.value;
      });
    });

    container.querySelectorAll<HTMLInputElement>('.mf-le-color-text[data-var]').forEach(txt => {
      txt.addEventListener('input', () => {
        const varName = txt.dataset['var']!;
        setCssVar(target(varName), varName, txt.value);
        const pairId = txt.dataset['pair'] ?? '';
        const col = document.getElementById(pairId) as HTMLInputElement | null;
        if (col) { try { col.value = toHex(txt.value); } catch { /* ignore */ } }
      });
    });
  }

  // ── Theme ──────────────────────────────────────────────────

  private applyTheme(themeKey: string): void {
    [...this.fw.classList].forEach(c => { if (c.startsWith('mf-theme-')) this.fw.classList.remove(c); });
    clearCssVars(this.fw, ALL_VARS);
    if (this.fi) clearCssVars(this.fi, ALL_VARS);
    if (themeKey) this.fw.classList.add(themeKey);
    this.activeThemeKey = themeKey;
  }

  // ── Open / Close ───────────────────────────────────────────

  open(): void {
    document.getElementById('mf-le-panel')?.classList.add('open');
    document.getElementById('mf-le-panel')?.setAttribute('aria-hidden', 'false');
    document.getElementById('mf-le-overlay')?.classList.add('open');
    const trigger = document.getElementById('mf-le-trigger');
    trigger?.classList.add('open');
    trigger?.setAttribute('aria-expanded', 'true');
    document.body.style.setProperty('overflow', 'hidden');
  }

  close(): void {
    document.getElementById('mf-le-panel')?.classList.remove('open');
    document.getElementById('mf-le-panel')?.setAttribute('aria-hidden', 'true');
    document.getElementById('mf-le-overlay')?.classList.remove('open');
    const trigger = document.getElementById('mf-le-trigger');
    trigger?.classList.remove('open');
    trigger?.setAttribute('aria-expanded', 'false');
    document.body.style.removeProperty('overflow');
  }

  // ── Tab switch ─────────────────────────────────────────────

  private switchTab(paneId: PaneId): void {
    document.querySelectorAll<HTMLElement>('.mf-le-tab').forEach(tab => {
      const active = tab.dataset['pane'] === paneId;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll<HTMLElement>('.mf-le-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `mf-le-pane-${paneId}`);
    });
    this.renderPane(paneId);
  }

  // ── State ──────────────────────────────────────────────────

  private captureState(): StyleState {
    return {
      themeClass: this.activeThemeKey,
      cssVars:    collectInlineVars(this.fw, ALL_VARS),
      innerVars:  this.fi ? collectInlineVars(this.fi, ALL_VARS) : {},
      extraClass: [...this.fw.classList].filter(c => c !== 'mf-form-wrapper' && !c.startsWith('mf-theme-')).join(' '),
      inspectorState: this.cssInspector.captureSerializedState(),
    };
  }

  // ── Save ───────────────────────────────────────────────────

  async save(): Promise<void> {
    const btn = document.getElementById('mf-le-save') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    try {
      const state = this.captureState();
      const varsCss = buildCssOverride(state.cssVars, state.innerVars);
      const inspectorCss = this.cssInspector.getCustomCssText();
      const cssOverride = [varsCss, inspectorCss].filter(Boolean).join('\n');
      const payload: SaveStylePayload = {
        formId:      this.formId,
        moduleId:    this.moduleId,
        themeClass:  state.themeClass,
        cssOverride,
        extraClass:  state.extraClass,
      };

      const resp = await fetch(this.saveEndpoint, {
        method: 'POST',
        headers: this._buildHeaders(),
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      if (resp.ok) {
        this.savedState = state;
        this.showToast(t('live.saved_ok'), 'success');
      } else {
        this.showToast(`Save failed (${resp.status})`, 'error');
      }
    } catch (err) {
      this.showToast('Network error', 'error');
      console.error('[MegaForm LiveEditor]', err);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save'; }
    }
  }

  // ── Export to Theme ────────────────────────────────────────
  //
  // FEATURE v20260406: Bridge Live Editor state → form ThemeJson.
  //
  // Problem: Live Editor saves to DNN module settings (MegaForm_CssOverride),
  // which is per-module and not portable. Theme Designer saves to form.ThemeJson
  // which is per-form and works everywhere. There was no way to promote Live
  // Editor changes into the form's permanent theme.
  //
  // Fix: POST the current CSS vars to Form/SaveTheme in the same format that
  // Theme Designer uses. The form's ThemeJson is updated so the theme is visible
  // on all pages/modules, not just the one where the Live Editor was used.
  //
  async exportToTheme(): Promise<void> {
    if (!this.formId) {
      this.showToast('No form ID — open a specific form page first', 'error');
      return;
    }
    const btn = document.getElementById('mf-le-export-theme') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
    try {
      const state = this.captureState();
      // Merge wrapper + inner CSS vars into a flat Record<string,string>.
      // innerVars are scoped to .mf-form-inner; we merge them into one dict
      // because Form/SaveTheme.CssOverrides applies to the whole form.
      const vars: Record<string, string> = { ...state.cssVars, ...state.innerVars };
      // Strip empty values so the ThemeJson stays clean
      Object.keys(vars).forEach(k => { if (!vars[k]) delete vars[k]; });

      // ThemeJson format expected by Form/SaveTheme and the renderer:
      // { _kind, theme, cssOverrides, customCss }
      const themeId = (state.themeClass || '').replace(/^mf-theme-/, '') || 'default';
      const inspectorCss = this.cssInspector.getCustomCssText();
      const themeObj = {
        _kind:        'MegaFormThemePatch',
        theme:        themeId,
        cssOverrides: vars,
        customCss:    inspectorCss,
      };

      const payload = {
        FormId:      this.formId,
        ThemeJson:   JSON.stringify(themeObj),
        ThemeId:     themeId,
        CssOverrides: vars,
        SchemaCustomCss: inspectorCss,
      };

      const resp = await fetch(this.apiBase + 'Form/SaveTheme', {
        method:      'POST',
        headers:     this._buildHeaders(),
        body:        JSON.stringify(payload),
        credentials: 'include',
      });

      if (resp.ok) {
        this.showToast('✓ Theme saved to form — applies on all pages', 'success');
      } else {
        const txt = await resp.text().catch(() => '');
        const preview = txt ? txt.substring(0, 120) : `HTTP ${resp.status}`;
        this.showToast(`Export failed: ${preview}`, 'error');
        console.error('[MegaForm LiveEditor] exportToTheme failed', resp.status, txt);
      }
    } catch (err) {
      this.showToast('Network error during export', 'error');
      console.error('[MegaForm LiveEditor] exportToTheme error', err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Export to Theme';
      }
    }
  }

  // ── Reset ──────────────────────────────────────────────────

  reset(): void {
    clearCssVars(this.fw, ALL_VARS);
    if (this.fi) clearCssVars(this.fi, ALL_VARS);
    applyVarsMap(this.fw, this.savedState.cssVars);
    if (this.fi) applyVarsMap(this.fi, this.savedState.innerVars);
    [...this.fw.classList].forEach(c => { if (c.startsWith('mf-theme-')) this.fw.classList.remove(c); });
    if (this.savedState.themeClass) this.fw.classList.add(this.savedState.themeClass);
    this.activeThemeKey = this.savedState.themeClass;
    this.cssInspector.restoreSerializedState(this.savedState.inspectorState || '');
    this.refreshAllPanes();
    this.showToast('Reset to saved state', 'info');
  }

  private handleInspectorSelection(selection: InspectSelection): void {
    this.open();
    this.cssInspector.setSelectedElement(selection.element, selection.target.label);
    this.switchTab('css');
  }

  private onInspectorChange(): void {
    const activePane = document.querySelector<HTMLElement>('.mf-le-pane.active');
    if (activePane?.id === 'mf-le-pane-css') this.cssInspector.render(activePane);
  }

  private updateFooterBadge(paneId: PaneId): void {
    const code = document.getElementById('mf-le-badge-code');
    if (!code) return;
    code.textContent = paneId === 'css' ? LiveCssInspector.BADGE : LiveEditor.BADGE;
  }

  // ── Toast ──────────────────────────────────────────────────

  showToast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const el = document.getElementById('mf-le-toast');
    if (!el) return;
    el.innerHTML = '';
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    const i = document.createElement('i'); i.className = `fas ${icon}`;
    el.appendChild(i);
    el.appendChild(document.createTextNode(' ' + msg));
    el.className = `mf-le-toast mf-le-toast-${type} show`;
    setTimeout(() => el.classList.remove('show'), 3000);
  }
  // ── Max-width live override ───────────────────────────────────────
  applyMaxWidthOverride(val: string): void {
    if (!this.maxWidthOverrideStyle) {
      this.maxWidthOverrideStyle = document.createElement('style');
      this.maxWidthOverrideStyle.id = 'mf-le-maxwidth-override';
      document.head.appendChild(this.maxWidthOverrideStyle);
    }
    this.maxWidthOverrideStyle.textContent =
      `.mf-form-wrapper{--mf-form-max-width:${val}}` +
      `.mf-form-inner,.mf-form-wrapper [class^="mfp"],.mf-form-wrapper [class*=" mfp"]{width:100%!important;max-width:${val}!important;box-sizing:border-box!important}`;
  }

}
