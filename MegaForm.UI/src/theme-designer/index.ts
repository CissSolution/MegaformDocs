import { ThemeDesignerTemplateTree } from './inspector-structure-template-tree';
import { ThemeDesignerElementStylePanel } from './inspector-elements-panel';
import { TD_TEMPLATE_CSS_MATCH_BADGE, TD_TEMPLATE_TREE_BADGE, TD_TEMPLATE_TREE_SYNC_BADGE, buildTemplateStructure } from './inspector-structure-template-shared';
import { getPlatformRoute, getReturnUrl, resolveAssetUrl } from '@shared/platform-host';
interface ThemePreset {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  tertiary: string;
  categories: string[];
  popular?: boolean;
}

interface ThemePayload {
  _kind: 'MegaFormThemePatch';
  theme: string;
  cssOverrides: Record<string, string>;
  customCss: string;
}

interface SaveThemePayload {
  themeJson: string;
  mergedFullCss: string;
  mergedNonVarCss: string;
  vars: Record<string, string>;
  theme: string;
}

interface PreviewSchema {
  fields?: unknown[];
  settings?: Record<string, unknown>;
  title?: string;
  description?: string;
  submitButtonText?: string;
  customCss?: string;
  CustomCss?: string;
  theme?: string;
  Theme?: string;
  [key: string]: unknown;
}

interface PreviewConfig {
  formId: number;
  container: string;
  schema: PreviewSchema;
  title: string;
  description: string;
  submitButtonText: string;
  isPreview: boolean;
  apiBaseUrl: string;
}

interface FormGetResponse {
  title?: string;
  Title?: string;
  formName?: string;
  FormName?: string;
  description?: string;
  Description?: string;
  submitButtonText?: string;
  SubmitButtonText?: string;
  schemaJson?: string;
  SchemaJson?: string;
  settingsJson?: string;
  SettingsJson?: string;
  themeJson?: string;
  ThemeJson?: string;
  [key: string]: unknown;
}

interface SaveDebugViewModel {
  saveStatus: string;
  saveResponseText: string;
  verifyStatus: string;
  verifyThemeJson: string;
  verifySchemaCustomCss: string;
  verifySettingsCustomCss: string;
}

interface CssRuleModel {
  raw: string[];
  rawSet: Record<string, true>;
  scopes: string[];
  scopeMap: Record<string, CssScopeModel>;
}

interface CssScopeModel {
  selectors: string[];
  selectorMap: Record<string, CssSelectorModel>;
}

interface CssSelectorModel {
  props: string[];
  propMap: Record<string, string>;
}

interface ThemeRuntimeApi {
  refresh: () => void;
  apply: () => Promise<void>;
  updateTheme: () => Promise<void>;
  getCustomCss: () => string;
  setCustomCss: (css: string) => string;
  setCssOverrides: (vars: Record<string, string>) => Record<string, string>;
  setDirty: (dirty: boolean) => void;
  getInternalState: () => {
    theme: string;
    cssOverrides: Record<string, string>;
    customCss: string;
    dirty: boolean;
  };
  setThemeState: (next: {
    theme?: string;
    cssOverrides?: Record<string, string>;
    customCss?: string;
    dirty?: boolean;
  }) => {
    theme: string;
    cssOverrides: Record<string, string>;
    customCss: string;
  };
  notifyInspectorChanged: () => void;
  applyCssVar: (name: string, value: string) => Record<string, string>;
  applyStyleOverride: (selector: string, prop: string, value: string, cssText?: string) => {
    selector: string;
    prop: string;
    value: string;
  };
  downloadThemeJson: () => void;
  downloadBuilderJson: () => void;
  getInitialInspectorOverrides?: () => Record<string, Record<string, string>>;
  __dirty?: boolean;
  __tdLiveCssVars?: Record<string, string>;
  __tdLiveCustomCss?: string;
  __tdLastSavedThemeJson?: string;
  __tdLastSavedThemeCss?: string;
  __originalGetCustomCss?: () => string;
}

declare global {
  interface Window {
    MFThemeDesigner?: ThemeRuntimeApi;
    __MFI?: {
      readVars?: (doc: Document) => Record<string, string>;
      exportCustomCss?: () => string;
      importCustomCss?: (cssText: string, doc?: Document) => void;
      commitBaseCss?: (cssText: string, doc?: Document) => void;
      getThemePayload?: () => { cssVars: Record<string, string>; customCss: string };
      focusNodeById?: (nodeId: string) => boolean;
      getSelectedNodeId?: () => string;
      getSelectedSelector?: () => string;
    };
    MegaFormRenderer?: {
      init?: (cfg: PreviewConfig) => void;
    };
  }
}

const LEFT_PANEL_WIDTH = 288;
const RIGHT_PANEL_WIDTH = 320;
const FONT_OPTIONS = [
  'Inter',
  'Georgia',
  'Roboto',
  'Nunito',
  'Playfair Display',
  'Open Sans',
  'Lato',
  'Merriweather',
];
const PALETTE_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b', '#374151', '#1f2937', '#ffffff',
  '#f9fafb', '#f5f5f4',
];
const BUILD_MARKER = 'TD-20260414-07';
const BUILD_DEBUG_TEXT = `TD ${BUILD_MARKER} • TI 14-07`;
const THEME_BACK_ROUTE_BADGE = 'ThemeBackRoute v20260412-04';
const TD_CSS_HYDRATE_BADGE = 'TDCssHydrate v20260412-05';
const TD_PREVIEW_SETTINGS_CARRY_BADGE = 'TDPreviewSettingsCarry v20260412-05';
const TD_SAVE_CSS_STABLE_BADGE = 'TDSaveCssStable v20260412-06';
const TD_SAVE_CSS_NO_REBUILD_BADGE = 'TDSaveCssNoRebuild v20260412-06';
const TD_ONLOAD_IMPORT_BADGE = 'TDOnloadImport v20260413-01';
const TD_LIVE_CSS_RETAIN_BADGE = 'TDLiveCssRetain v20260413-02';
const TD_REMOVE_SAVE_BTN_BADGE = 'TDRemoveSaveBtn v20260413-03';
const TD_REMOVE_DOWNLOAD_BTNS_BADGE = 'TDRemoveDownloadBtns v20260413-04';
const TD_INSPECTOR_SEED_BADGE = 'TDInspectorSeed v20260413-05';
const TD_SYNC_TO_BUILDER_BADGE = 'TDSyncToBuilder v20260413-06';
const TD_FORM_WIDTH_UI_BADGE = 'TDFormWidthUI v20260413-11';
const TD_FORM_WIDTH_SAVE_BADGE = 'TDFormWidthSave v20260413-11';

function getPreviewAssetVersion(): string {
  try {
    const w = window as any;
    const pf = (w.__MF_PLATFORM__ || {}) as Record<string, unknown>;
    const direct = w.__MF_ASSET_VERSION__ || pf.assetVersion || pf.AssetVersion || pf.assetsVersion || pf.resourceVersion;
    if (direct) return String(direct);

    const scripts = Array.from(document.scripts || []) as HTMLScriptElement[];
    for (const script of scripts) {
      const src = String(script?.src || '');
      if (!src) continue;
      const isMegaFormAsset =
        src.includes('/Modules/MegaForm/') ||
        src.includes('/DesktopModules/MegaForm/') ||
        src.includes('megaform-');
      if (!isMegaFormAsset) continue;
      try {
        const url = new URL(src, window.location.href);
        const version = url.searchParams.get('v');
        if (version) return version;
      } catch (_error) {
        // Ignore malformed script src values.
      }
    }
  } catch (_error) {
    // Defensive fallback for unusual host shells.
  }
  return '20260704-B361';
}

function resolvePreviewAssetUrl(relativePath: string): string {
  const raw = `${window.location.origin}${resolveAssetUrl(relativePath)}`;
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}v=${encodeURIComponent(getPreviewAssetVersion())}`;
}

if (typeof window !== 'undefined') {
  (window as any).__MF_THEME_BACK_ROUTE_BADGE__ = THEME_BACK_ROUTE_BADGE;
  (window as any).__MF_TD_CSS_HYDRATE_BADGE__ = TD_CSS_HYDRATE_BADGE;
  (window as any).__MF_TD_PREVIEW_SETTINGS_CARRY_BADGE__ = TD_PREVIEW_SETTINGS_CARRY_BADGE;
  (window as any).__MF_TD_SAVE_CSS_STABLE_BADGE__ = TD_SAVE_CSS_STABLE_BADGE;
  (window as any).__MF_TD_SAVE_CSS_NO_REBUILD_BADGE__ = TD_SAVE_CSS_NO_REBUILD_BADGE;
  (window as any).__MF_TD_ONLOAD_IMPORT_BADGE__ = TD_ONLOAD_IMPORT_BADGE;
  (window as any).__MF_TD_LIVE_CSS_RETAIN_BADGE__ = TD_LIVE_CSS_RETAIN_BADGE;
  (window as any).__MF_TD_REMOVE_SAVE_BTN_BADGE__ = TD_REMOVE_SAVE_BTN_BADGE;
  (window as any).__MF_TD_REMOVE_DOWNLOAD_BTNS_BADGE__ = TD_REMOVE_DOWNLOAD_BTNS_BADGE;
  (window as any).__MF_TD_INSPECTOR_SEED_BADGE__ = TD_INSPECTOR_SEED_BADGE;
  (window as any).__MF_TD_SYNC_TO_BUILDER_BADGE__ = TD_SYNC_TO_BUILDER_BADGE;
  (window as any).__MF_TD_FORM_WIDTH_UI_BADGE__ = TD_FORM_WIDTH_UI_BADGE;
  (window as any).__MF_TD_FORM_WIDTH_SAVE_BADGE__ = TD_FORM_WIDTH_SAVE_BADGE;
  (window as any).__MF_TD_STRUCTURE_TREE_BADGE__ = TD_TEMPLATE_TREE_BADGE;
  (window as any).__MF_TD_INSPECT_TREE_SYNC_BADGE__ = TD_TEMPLATE_TREE_SYNC_BADGE;
  (window as any).__MF_TD_INSPECT_CSS_RULES_BADGE__ = TD_TEMPLATE_CSS_MATCH_BADGE;
}

const PRESETS: ThemePreset[] = [
  { id: 'default', name: 'Default', primary: '#3b82f6', secondary: '#eff6ff', tertiary: '#e0f2fe', categories: ['popular', 'modern'] },
  { id: 'modern-blue', name: 'Modern Blue', primary: '#667eea', secondary: '#764ba2', tertiary: '#e8e8ff', categories: ['popular', 'modern'] },
  { id: 'warm-sunset', name: 'Warm Sunset', primary: '#ff6b35', secondary: '#ffd4bc', tertiary: '#fff8f0', categories: ['warm', 'popular'] },
  { id: 'dark-elegance', name: 'Dark Elegance', primary: '#e94560', secondary: '#1a1a2e', tertiary: '#16213e', categories: ['dark', 'elegant'] },
  { id: 'nature-green', name: 'Nature Green', primary: '#2d8a4e', secondary: '#c8e6c9', tertiary: '#f0f7f0', categories: ['nature'] },
  { id: 'flat-material', name: 'Material', primary: '#1976d2', secondary: '#e3f2fd', tertiary: '#fafafa', categories: ['modern'] },
  { id: 'classic-formal', name: 'Classic Formal', primary: '#8b4513', secondary: '#d5c7b5', tertiary: '#f8f4ef', categories: ['elegant', 'warm'] },
  { id: 'playful', name: 'Playful', primary: '#ff6b6b', secondary: '#ffd3d3', tertiary: '#ffecd2', categories: ['warm'] },
  { id: 'healthcare', name: 'Healthcare', primary: '#0077b6', secondary: '#b5d4e8', tertiary: '#f0f8ff', categories: ['minimal', 'modern'] },
  { id: 'executive', name: 'Executive', primary: '#c9a84c', secondary: '#2a2a2a', tertiary: '#1c1c1c', categories: ['dark', 'elegant'] },
  { id: 'tech-startup', name: 'Tech Startup', primary: '#38ef7d', secondary: '#141432', tertiary: '#0a0a23', categories: ['modern', 'dark'] },
  { id: 'minimal', name: 'Minimal', primary: '#1a1a1a', secondary: '#f8f8f8', tertiary: '#ffffff', categories: ['minimal', 'popular'] },
];

class ThemeDesignerApp {
  private readonly root: HTMLElement;
  private readonly formId: number;
  private readonly apiBase: string;
  private readonly returnUrl: string;

  private schema: PreviewSchema = { fields: [], settings: {} };
  private formTitle = 'Untitled Form';
  private formDescription = '';
  private submitButtonText = 'Submit';

  private currentTheme = 'default';
  private currentBaseCss = '';
  private loadedResolvedSettings: Record<string, unknown> = {};
  private dirty = false;

  private hue = 220;
  private saturation = 71;
  private brightness = 53;
  private hex = '3B82F6';
  private darkMode = false;

  private leftCollapsed = false;
  private rightCollapsed = false;
  private activeLeftTab = 'presets';
  private activeRightTab = 'colors';
  private activePresetFilter = 'all';
  private presetSearch = '';
  private presetListMode: 'grid' | 'list' = 'grid';
  private recentColors: string[] = [];
  private formWidthMode: 'default' | 'custom' | 'percent' | 'full' = 'default';
  private lastCustomFormWidth = 960;
  private structureTree: ThemeDesignerTemplateTree | null = null;
  private elementStylePanel: ThemeDesignerElementStylePanel | null = null;

  private draggingCanvas = false;
  private draggingHue = false;

  private readonly saveDebug: SaveDebugViewModel = {
    saveStatus: "waiting",
    saveResponseText: "",
    verifyStatus: "waiting",
    verifyThemeJson: "",
    verifySchemaCustomCss: "",
    verifySettingsCustomCss: "",
  };

  constructor(root: HTMLElement) {
    this.root = root;
    this.formId = Number.parseInt(root.dataset.formId || '0', 10) || 0;
    this.apiBase = (root.dataset.apiBase || '/api/MegaForm/').replace(/\/?$/, '/');
    this.returnUrl = root.dataset.returnUrl || getReturnUrl('/admin');
  }

  start(): void {
    this.bindWindowHeightBridge();
    this.ensureFormWidthControls();
    this.ensureStructureControls();
    this.bindStaticUi();
    this.initStructureTree();
    this.renderPaletteGrid();
    this.renderPresetList();
    this.renderTintGrid();
    this.populateFontSelect();
    this.syncPanelTriggers();
    this.installDebugMarker();
    this.ensureSaveDebugPanel();
    this.renderSaveDebugPanel();
    this.applyHexColor('3B82F6', true);
    this.installRuntimeApi();
    void this.loadForm();
  }

  private installDebugMarker(): void {
    this.root.dataset.tdBuild = BUILD_MARKER;
    document.documentElement.setAttribute('data-td-build', BUILD_MARKER);
    const globalWindow = window as Window & Record<string, unknown>;
    globalWindow.__MF_THEME_DESIGNER_BUILD = BUILD_MARKER;
    const badge = this.byId<HTMLElement>('td-debug-badge');
    if (badge) {
      badge.textContent = BUILD_DEBUG_TEXT;
      badge.title = `Theme Designer bundle marker: ${BUILD_MARKER} • ${TD_ONLOAD_IMPORT_BADGE} • ${TD_LIVE_CSS_RETAIN_BADGE} • ${TD_REMOVE_SAVE_BTN_BADGE} • ${TD_REMOVE_DOWNLOAD_BTNS_BADGE} • ${TD_INSPECTOR_SEED_BADGE} • ${TD_SYNC_TO_BUILDER_BADGE} • ${TD_FORM_WIDTH_UI_BADGE} • ${TD_FORM_WIDTH_SAVE_BADGE} • ${TD_TEMPLATE_TREE_BADGE} • ${TD_TEMPLATE_TREE_SYNC_BADGE} • ${TD_TEMPLATE_CSS_MATCH_BADGE}`;
    }
    console.info(`[TD] build marker ${BUILD_MARKER}`);
  }

  private bindWindowHeightBridge(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { type?: string; h?: number } | undefined;
      if (!data || data.type !== 'td-h' || !data.h) return;
      const frame = this.byId<HTMLIFrameElement>('td-preview-frame');
      if (!frame) return;
      const nextHeight = Math.max(300, Math.ceil(data.h));
      const currentHeight = Number.parseInt(frame.style.height || '0', 10) || 0;
      if (Math.abs(nextHeight - currentHeight) > 1) {
        frame.style.height = `${nextHeight}px`;
      }
    });
  }

  private bindStaticUi(): void {
    this.bindLeftTabs();
    this.bindRightTabs();
    this.bindDeviceButtons();
    this.bindPanelCollapseButtons();
    this.bindColorCanvas();
    this.bindColorRows();
    this.bindFormWidthControls();
    this.bindVariableControls();
    this.bindPresetSearchAndFilter();
    this.bindActionButtons();
    this.bindElementGroups();
    this.initElementStylePanel();
  }


  private ensureFormWidthControls(): void {
    const spacePanel = this.root.querySelector<HTMLElement>('.td-tab-panel[data-panel="space"]');
    if (!spacePanel || spacePanel.querySelector('#td-form-width-section')) return;
    const firstSection = spacePanel.querySelector<HTMLElement>('.td-section');
    const divider = document.createElement('div');
    divider.className = 'td-divider';
    divider.id = 'td-form-width-divider';
    const section = document.createElement('div');
    section.className = 'td-section';
    section.id = 'td-form-width-section';
    section.dataset.badge = TD_FORM_WIDTH_UI_BADGE;
    section.innerHTML = `
      <div class="td-section-head"><div class="td-section-title">Form Width</div><span class="td-inline-badge">${TD_FORM_WIDTH_UI_BADGE}</span></div>
      <div class="td-filter-pills" style="padding:0 0 8px;">
        <button type="button" class="td-pill td-form-width-preset active" data-width-mode="default">Default</button>
        <button type="button" class="td-pill td-form-width-preset" data-width-mode="percent">100%</button>
        <button type="button" class="td-pill td-form-width-preset" data-width-mode="full">Full width</button>
      </div>
      <div class="td-sld-row" data-width-slider="true">
        <div class="td-sld-hd"><span>Custom max width</span><span class="td-sld-val">960px</span></div>
        <input id="td-form-width-slider" class="td-slider" type="range" min="320" max="1600" step="20" value="960" data-var="--mf-form-max-width" data-unit="px" />
      </div>
      <div style="font-size:11px;color:var(--td-muted-fg);line-height:1.45;">
        100% keeps page padding. Full width also removes side padding around the form.
      </div>`;
    if (firstSection) {
      spacePanel.insertBefore(section, firstSection);
      spacePanel.insertBefore(divider, firstSection);
    } else {
      spacePanel.prepend(divider);
      spacePanel.prepend(section);
    }
  }

  private ensureStructureControls(): void {
    const tabs = this.root.querySelector<HTMLElement>('.td-left-tabs');
    if (tabs && !tabs.querySelector('.td-left-tab[data-tab="structure"]')) {
      const button = document.createElement('button');
      button.className = 'td-left-tab';
      button.type = 'button';
      button.dataset.tab = 'structure';
      button.innerHTML = '<i class="fas fa-sitemap"></i><span>Structure</span>';
      tabs.appendChild(button);
    }

    const panelLeft = this.root.querySelector<HTMLElement>('#td-panel-left');
    if (panelLeft && !panelLeft.querySelector('#td-left-structure')) {
      const panel = document.createElement('div');
      panel.className = 'td-panel-inner td-structure-panel';
      panel.id = 'td-left-structure';
      panel.style.display = 'none';
      panelLeft.appendChild(panel);
    }
  }

  private initStructureTree(): void {
    this.structureTree = new ThemeDesignerTemplateTree({
      root: this.root,
      getTemplateHtml: () => this.getCurrentCustomHtml(),
      getPreviewDocument: () => this.getPreviewDocument(),
      focusTemplatePath: (templatePath: string) => Boolean((window as any).__MFI?.focusTemplatePath?.(templatePath)),
      getBaseCss: () => this.currentBaseCss || '',
      getInspectorCss: () => this.getInspectorCss(),
    });
    this.structureTree.bind();
  }

  private initElementStylePanel(): void {
    this.elementStylePanel = new ThemeDesignerElementStylePanel({
      root: this.root,
      getPreviewDocument: () => this.getPreviewDocument(),
    });
    this.elementStylePanel.bind();
  }

  private bindFormWidthControls(): void {
    this.queryAll<HTMLElement>('.td-form-width-preset[data-width-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = (button.dataset.widthMode || 'default') as 'default' | 'percent' | 'full';
        this.applyFormWidthPreset(mode);
      });
    });
    this.syncFormWidthControls();
  }

  private bindLeftTabs(): void {
    this.queryAll<HTMLElement>('.td-left-tab').forEach((button) => {
      button.addEventListener('click', () => {
        this.activeLeftTab = button.dataset.tab || 'presets';
        this.syncLeftTabState();
        if (this.activeLeftTab === 'structure') this.structureTree?.refreshSoon();
      });
    });
    this.syncLeftTabState();
  }

  private bindRightTabs(): void {
    this.queryAll<HTMLElement>('.td-right-tab').forEach((button) => {
      button.addEventListener('click', () => {
        this.activeRightTab = button.dataset.tab || 'colors';
        this.syncRightTabState();
      });
    });
    this.syncRightTabState();
  }

  private bindDeviceButtons(): void {
    this.queryAll<HTMLElement>('.td-device-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const device = button.dataset.device || 'desktop';
        const viewport = this.byId<HTMLElement>('td-preview-viewport');
        if (viewport) viewport.dataset.device = device;
        this.queryAll<HTMLElement>('.td-device-btn').forEach((node) => {
          node.classList.toggle('active', node.dataset.device === device);
        });
      });
    });
  }

  private bindPanelCollapseButtons(): void {
    this.byId('td-left-trigger')?.addEventListener('click', () => {
      this.leftCollapsed = !this.leftCollapsed;
      this.byId('td-panel-left')?.classList.toggle('td-collapsed', this.leftCollapsed);
      this.syncPanelTriggers();
    });

    this.byId('td-right-trigger')?.addEventListener('click', () => {
      this.rightCollapsed = !this.rightCollapsed;
      this.byId('td-panel-right')?.classList.toggle('td-collapsed', this.rightCollapsed);
      this.syncPanelTriggers();
    });
  }

  private bindColorCanvas(): void {
    const canvasWrap = this.byId<HTMLDivElement>('td-canvas-wrap');
    const canvas = this.byId<HTMLCanvasElement>('td-canvas');
    const hueWrap = this.byId<HTMLDivElement>('td-hue-wrap');
    const hexInput = this.byId<HTMLInputElement>('td-hex-input');
    const rgbInputs = {
      r: this.byId<HTMLInputElement>('td-r-input'),
      g: this.byId<HTMLInputElement>('td-g-input'),
      b: this.byId<HTMLInputElement>('td-b-input'),
    };

    if (canvasWrap && canvas) {
      const resizeCanvas = (): void => {
        canvas.width = canvasWrap.offsetWidth;
        canvas.height = canvasWrap.offsetHeight;
        this.renderCanvasSpectrum();
        this.syncColorThumbs();
      };
      resizeCanvas();
      new ResizeObserver(resizeCanvas).observe(canvasWrap);

      const readPoint = (clientX: number, clientY: number): { x: number; y: number } => {
        const rect = canvasWrap.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        return { x, y };
      };

      const updateFromCanvasPointer = (clientX: number, clientY: number): void => {
        const point = readPoint(clientX, clientY);
        this.saturation = Math.round(point.x * 100);
        this.brightness = Math.round((1 - point.y) * 100);
        const [r, g, b] = this.hsvToRgb(this.hue, this.saturation, this.brightness);
        this.applyHexColor(this.rgbToHex(r, g, b), false);
      };

      canvasWrap.addEventListener('mousedown', (event) => {
        this.draggingCanvas = true;
        updateFromCanvasPointer(event.clientX, event.clientY);
      });

      document.addEventListener('mousemove', (event) => {
        if (!this.draggingCanvas) return;
        updateFromCanvasPointer(event.clientX, event.clientY);
      });

      document.addEventListener('mouseup', () => {
        this.draggingCanvas = false;
      });
    }

    if (hueWrap) {
      const readHue = (clientX: number): number => {
        const rect = hueWrap.getBoundingClientRect();
        const percent = (clientX - rect.left) / rect.width;
        return Math.max(0, Math.min(360, Math.round(percent * 360)));
      };

      const updateFromHuePointer = (clientX: number): void => {
        this.hue = readHue(clientX);
        const [r, g, b] = this.hsvToRgb(this.hue, this.saturation, this.brightness);
        this.applyHexColor(this.rgbToHex(r, g, b), true);
      };

      hueWrap.addEventListener('mousedown', (event) => {
        this.draggingHue = true;
        updateFromHuePointer(event.clientX);
      });

      document.addEventListener('mousemove', (event) => {
        if (!this.draggingHue) return;
        updateFromHuePointer(event.clientX);
      });

      document.addEventListener('mouseup', () => {
        this.draggingHue = false;
      });
    }

    hexInput?.addEventListener('change', () => {
      this.applyHexColor(hexInput.value, true);
    });
    hexInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.applyHexColor(hexInput.value, true);
      }
    });

    Object.values(rgbInputs).forEach((input) => {
      input?.addEventListener('change', () => {
        const r = Number.parseInt(rgbInputs.r?.value || '0', 10) || 0;
        const g = Number.parseInt(rgbInputs.g?.value || '0', 10) || 0;
        const b = Number.parseInt(rgbInputs.b?.value || '0', 10) || 0;
        this.applyHexColor(this.rgbToHex(r, g, b), true);
      });
    });
  }

  private bindColorRows(): void {
    this.queryAll<HTMLElement>('.td-clr-row[data-var]').forEach((row) => {
      const variableName = row.dataset.var;
      const colorInput = row.querySelector<HTMLInputElement>('input[type="color"]');
      const valueNode = row.querySelector<HTMLSpanElement>('span');
      if (!variableName || !colorInput) return;

      colorInput.addEventListener('input', () => {
        const value = colorInput.value;
        if (valueNode) valueNode.textContent = value;
        this.setCssVar(variableName, value);
      });
    });
  }

  private bindVariableControls(): void {
    this.queryAll<HTMLInputElement>('.td-slider[data-var]').forEach((input) => {
      input.addEventListener('input', () => {
        const variableName = input.dataset.var;
        if (!variableName) return;
        const unit = input.dataset.unit || 'px';
        const value = `${input.value}${unit}`;
        const valueNode = input.closest('.td-sld-row')?.querySelector<HTMLElement>('.td-sld-val');
        if (valueNode) valueNode.textContent = value;
        if (variableName === '--mf-form-max-width') {
          const numeric = Number.parseFloat(input.value || '');
          if (Number.isFinite(numeric)) this.lastCustomFormWidth = numeric;
          this.formWidthMode = numeric === 960 ? 'default' : 'custom';
          this.setCssVar(variableName, value);
          this.syncFormWidthControls();
          return;
        }
        if (variableName === '--mf-btn-padding-y') {
          this.setCssVar('--mf-btn-padding', `${input.value}px 32px`);
          return;
        }
        if (variableName === '--mf-form-padding-y' || variableName === '--mf-form-padding-x') {
          const padY = this.getCompositeSliderValue('--mf-form-padding-y', 32);
          const padX = this.getCompositeSliderValue('--mf-form-padding-x', 40);
          this.setCssVar('--mf-form-padding', `${padY}px ${padX}px`);
          return;
        }
        this.setCssVar(variableName, value);
      });
    });

    this.queryAll<HTMLSelectElement>('.td-var-select[data-var]').forEach((select) => {
      select.addEventListener('change', () => {
        const variableName = select.dataset.var;
        if (!variableName) return;
        this.setCssVar(variableName, select.value);
      });
    });

    this.queryAll<HTMLInputElement>('.td-effect-toggle[data-var]').forEach((toggle) => {
      toggle.addEventListener('change', () => {
        const variableName = toggle.dataset.var;
        if (!variableName) return;
        const onValue = toggle.dataset.on || '1';
        const offValue = toggle.dataset.off || '0';
        this.setCssVar(variableName, toggle.checked ? onValue : offValue);
      });
    });

    this.byId<HTMLSelectElement>('td-font-select')?.addEventListener('change', (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      this.setCssVar('--mf-font-family', `'${value}',system-ui,sans-serif`);
      const previewText = this.byId<HTMLElement>('td-font-preview-text');
      if (previewText) previewText.style.fontFamily = value;
    });
  }

  private bindPresetSearchAndFilter(): void {
    this.byId<HTMLInputElement>('td-preset-search')?.addEventListener('input', (event) => {
      this.presetSearch = (event.currentTarget as HTMLInputElement).value.trim().toLowerCase();
      this.renderPresetList();
    });

    this.queryAll<HTMLElement>('.td-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        this.activePresetFilter = pill.dataset.filter || 'all';
        this.queryAll<HTMLElement>('.td-pill').forEach((node) => {
          node.classList.toggle('active', node === pill);
        });
        this.renderPresetList();
      });
    });

    this.byId('td-view-grid')?.addEventListener('click', () => {
      this.presetListMode = 'grid';
      this.syncPresetViewMode();
    });

    this.byId('td-view-list')?.addEventListener('click', () => {
      this.presetListMode = 'list';
      this.syncPresetViewMode();
    });
  }

  private bindActionButtons(): void {
    this.byId('td-dark-btn')?.addEventListener('click', () => {
      this.darkMode = !this.darkMode;
      const darkButton = this.byId('td-dark-btn');
      if (darkButton) {
        darkButton.innerHTML = this.darkMode
          ? '<i class="fas fa-sun"></i>'
          : '<i class="fas fa-moon"></i>';
      }

      if (this.darkMode) {
        this.setCssVar('--mf-page-bg', '#18181b');
        this.setCssVar('--mf-form-bg', '#27272a');
        this.setCssVar('--mf-color-text', '#fafafa');
      } else {
        this.removeCssVar('--mf-page-bg');
        this.removeCssVar('--mf-form-bg');
        this.removeCssVar('--mf-color-text');
      }
    });

    this.byId('td-refresh-btn')?.addEventListener('click', () => {
      void this.refreshFromServer();
    });

    this.byId('td-apply-btn')?.addEventListener('click', () => {
      void this.saveTheme('Theme updated!');
    });

    this.byId('td-new-preset-btn')?.addEventListener('click', () => {
      this.toast('Custom presets coming soon!');
    });

    this.byId('td-back-btn')?.addEventListener('click', () => {
      if (this.dirty && !window.confirm('Unsaved changes. Leave anyway?')) return;
      // BUG FIX: getPlatformRoute('builder', formId) appends ?formId=N via addQuery,
      // which produces /Home/formId/24?formId=24#mf-builder when the page URL happened
      // to contain /formId/24 (DNN routing) at the time __MF_PLATFORM__.builderUrl was set.
      // For DNN hash routing, formId is managed server-side (data-form-id attribute),
      // NOT via URL params. Navigate to the clean builderUrl from __MF_PLATFORM__,
      // which earlyBootstrap now sets correctly using data-return-url as the base.
      const mfp = window.__MF_PLATFORM__ as Record<string, unknown> | undefined;
      const platform = String((mfp?.platform as string) || '').toLowerCase();
      let backUrl: string;
      if (platform === 'dnn') {
        // Theme designer on DNN runs inside the hash-overlay admin host, not the
        // fullscreen configure=1 builder shell. Returning to the builder must keep
        // the selected shell form via ?mfFormId=N, otherwise server falls back to
        // module-config/default form after leaving #mf-theme.
        const base = String((mfp?.returnUrl as string) || window.location.pathname || '/').split('?')[0].split('#')[0] || '/';
        const currentFormId = Number(this.formId || Number((mfp?.formId as number) || 0) || 0);
        backUrl = currentFormId > 0
          ? (base + '?mfFormId=' + encodeURIComponent(String(currentFormId)) + '#mf-builder')
          : (base + '#mf-builder');
        void THEME_BACK_ROUTE_BADGE;
      } else {
        backUrl = getPlatformRoute('builder', this.formId || undefined);
      }
      window.location.href = backUrl;
    });
  }

  private bindElementGroups(): void {
    this.queryAll<HTMLElement>('.td-elem-group-hd').forEach((button) => {
      button.addEventListener('click', () => {
        const group = button.dataset.group;
        if (!group) return;
        const panel = this.byId<HTMLElement>(`td-group-${group}`);
        const isOpen = button.classList.toggle('open');
        const icon = button.querySelector<HTMLElement>('.td-group-chevron');
        if (panel) panel.style.display = isOpen ? '' : 'none';
        if (icon) icon.className = `fas ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'} td-group-chevron`;
      });
    });
  }

  private syncLeftTabState(): void {
    this.queryAll<HTMLElement>('.td-left-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === this.activeLeftTab);
    });

    this.toggleDisplay('td-left-presets', this.activeLeftTab === 'presets');
    this.toggleDisplay('td-left-elements', this.activeLeftTab === 'elements');
    this.toggleDisplay('td-left-palette', this.activeLeftTab === 'palette');
    this.toggleDisplay('td-left-structure', this.activeLeftTab === 'structure');
  }

  private syncRightTabState(): void {
    this.queryAll<HTMLElement>('.td-right-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === this.activeRightTab);
    });

    this.queryAll<HTMLElement>('.td-tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === this.activeRightTab);
    });
  }

  private syncPanelTriggers(): void {
    const leftTrigger = this.byId<HTMLElement>('td-left-trigger');
    const leftChevron = this.byId<HTMLElement>('td-left-chevron');
    if (leftTrigger) leftTrigger.style.left = `${this.leftCollapsed ? 0 : LEFT_PANEL_WIDTH}px`;
    if (leftChevron) leftChevron.className = `fas ${this.leftCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`;

    const rightTrigger = this.byId<HTMLElement>('td-right-trigger');
    const rightChevron = this.byId<HTMLElement>('td-right-chevron');
    if (rightTrigger) rightTrigger.style.right = `${this.rightCollapsed ? 0 : RIGHT_PANEL_WIDTH}px`;
    if (rightChevron) rightChevron.className = `fas ${this.rightCollapsed ? 'fa-chevron-left' : 'fa-chevron-right'}`;
  }

  private renderPresetList(): void {
    const list = this.byId<HTMLElement>('td-preset-list');
    const count = this.byId<HTMLElement>('td-presets-count');
    if (!list) return;

    const filtered = PRESETS.filter((preset) => {
      const matchesSearch = !this.presetSearch || preset.name.toLowerCase().includes(this.presetSearch);
      const matchesFilter = this.activePresetFilter === 'all'
        || preset.categories.includes(this.activePresetFilter)
        || (this.activePresetFilter === 'popular' && !!preset.popular);
      return matchesSearch && matchesFilter;
    });

    list.classList.toggle('td-presets-listmode', this.presetListMode === 'list');
    list.innerHTML = filtered.map((preset) => {
      const activeClass = preset.id === this.currentTheme ? ' active' : '';
      const tags = preset.categories.slice(0, 2).map((tag) => `<span class="td-preset-tag">${tag}</span>`).join('');
      return `
        <button class="td-preset-item${activeClass}" data-preset="${preset.id}" type="button">
          <div class="td-preset-preview">
            <span style="background:${preset.primary}"></span>
            <span style="background:${preset.secondary}"></span>
            <span style="background:${preset.tertiary}"></span>
          </div>
          <div class="td-preset-meta">
            <div class="td-preset-name">${preset.name}</div>
            <div class="td-preset-tags">${tags}</div>
          </div>
        </button>`;
    }).join('');

    if (count) {
      count.textContent = `${filtered.length} theme${filtered.length === 1 ? '' : 's'}`;
    }

    list.querySelectorAll<HTMLElement>('.td-preset-item').forEach((button) => {
      button.addEventListener('click', () => {
        const presetId = button.dataset.preset;
        if (!presetId) return;
        this.selectPreset(presetId);
      });
    });

    this.syncPresetViewMode();
  }

  private syncPresetViewMode(): void {
    this.byId('td-view-grid')?.classList.toggle('active', this.presetListMode === 'grid');
    this.byId('td-view-list')?.classList.toggle('active', this.presetListMode === 'list');
    this.byId('td-preset-list')?.classList.toggle('td-presets-listmode', this.presetListMode === 'list');
  }

  private selectPreset(presetId: string): void {
    const preset = PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    this.currentTheme = preset.id;
    this.clearCssVars();
    this.applyHexColor(preset.primary, true);
    this.rememberRecentColor(preset.primary);
    this.renderPresetList();
    this.rebuildPreview();
    this.setDirty(true);
  }

  private renderPaletteGrid(): void {
    const paletteGrid = this.byId<HTMLElement>('td-palette-grid');
    if (!paletteGrid) return;

    paletteGrid.innerHTML = PALETTE_COLORS.map((hex) => {
      return `<button class="td-palette-color" type="button" style="background:${hex}" data-hex="${hex}"></button>`;
    }).join('');

    paletteGrid.querySelectorAll<HTMLElement>('.td-palette-color').forEach((button) => {
      button.addEventListener('click', () => {
        const hex = button.dataset.hex;
        if (!hex) return;
        this.applyHexColor(hex, true);
      });
    });

    this.renderRecentSwatches();
  }

  private renderRecentSwatches(): void {
    const wrap = this.byId<HTMLElement>('td-recent-swatches');
    if (!wrap) return;

    wrap.innerHTML = this.recentColors.map((hex) => {
      return `<button class="td-recent-swatch" type="button" style="background:${hex}" data-hex="${hex}" title="${hex}"></button>`;
    }).join('');

    wrap.querySelectorAll<HTMLElement>('.td-recent-swatch').forEach((button) => {
      button.addEventListener('click', () => {
        const hex = button.dataset.hex;
        if (hex) this.applyHexColor(hex, true);
      });
    });
  }

  private renderTintGrid(): void {
    const tintGrid = this.byId<HTMLElement>('td-tints-grid');
    if (!tintGrid) return;

    tintGrid.innerHTML = this.buildTintScale(`#${this.hex}`).map((entry) => {
      return `
        <button class="td-tint-row" type="button" data-hex="${entry.hex}">
          <span class="td-tint-num">${entry.name}</span>
          <div class="td-tint-swatch" style="background:${entry.hex}"></div>
          <span class="td-tint-val">${entry.hex}</span>
        </button>`;
    }).join('');

    tintGrid.querySelectorAll<HTMLElement>('.td-tint-row').forEach((button) => {
      button.addEventListener('click', () => {
        const hex = button.dataset.hex;
        if (hex) this.applyHexColor(hex, true);
      });
    });
  }

  private populateFontSelect(): void {
    const select = this.byId<HTMLSelectElement>('td-font-select');
    if (!select) return;

    select.innerHTML = FONT_OPTIONS.map((font) => `<option value="${font}">${font}</option>`).join('');
  }

  private applyHexColor(value: string, redrawCanvas: boolean): void {
    const normalized = value.replace('#', '').trim().toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(normalized)) return;

    this.hex = normalized;
    const [r, g, b] = this.hexToRgb(`#${normalized}`);
    const [nextHue, nextSat, nextBri] = this.rgbToHsv(r, g, b);
    this.hue = nextHue;
    this.saturation = nextSat;
    this.brightness = nextBri;

    if (redrawCanvas) {
      this.renderCanvasSpectrum();
    }
    this.syncColorThumbs();
    this.syncColorInputs();
    this.renderTintGrid();

    const primaryHex = `#${normalized}`;
    const hoverHex = this.scaleColor(primaryHex, 0.82);
    this.setCssVar('--mf-primary', primaryHex, false);
    this.setCssVar('--mf-primary-hover', hoverHex, false);
    this.setCssVar('--mf-primary-text', '#ffffff', false);
    this.setCssVar('--mf-primary-gradient', `linear-gradient(135deg,${primaryHex},${this.rotateHue(primaryHex, 30)})`, false);
    this.setCssVar('--mf-input-focus-border', primaryHex, false);
    this.setCssVar('--mf-check-color', primaryHex, false);
    this.setCssVar('--mf-progress-fill', primaryHex, false);
    this.flushLiveVarsToPreview();
    this.setDirty(true);
    this.rememberRecentColor(primaryHex);
  }

  private syncColorInputs(): void {
    const hexInput = this.byId<HTMLInputElement>('td-hex-input');
    const swatch = this.byId<HTMLElement>('td-color-swatch');
    const [r, g, b] = this.hexToRgb(`#${this.hex}`);

    if (hexInput) hexInput.value = this.hex;
    if (swatch) swatch.style.background = `#${this.hex}`;
    this.byId<HTMLInputElement>('td-r-input')?.setAttribute('value', String(r));
    this.byId<HTMLInputElement>('td-g-input')?.setAttribute('value', String(g));
    this.byId<HTMLInputElement>('td-b-input')?.setAttribute('value', String(b));
    if (this.byId<HTMLInputElement>('td-r-input')) this.byId<HTMLInputElement>('td-r-input')!.value = String(r);
    if (this.byId<HTMLInputElement>('td-g-input')) this.byId<HTMLInputElement>('td-g-input')!.value = String(g);
    if (this.byId<HTMLInputElement>('td-b-input')) this.byId<HTMLInputElement>('td-b-input')!.value = String(b);
  }

  private renderCanvasSpectrum(): void {
    const canvas = this.byId<HTMLCanvasElement>('td-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = `hsl(${this.hue},100%,50%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const whiteGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    whiteGradient.addColorStop(0, 'rgba(255,255,255,1)');
    whiteGradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = whiteGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const blackGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    blackGradient.addColorStop(0, 'rgba(0,0,0,0)');
    blackGradient.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = blackGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private syncColorThumbs(): void {
    const canvasWrap = this.byId<HTMLElement>('td-canvas-wrap');
    const canvasCursor = this.byId<HTMLElement>('td-canvas-cursor');
    const hueWrap = this.byId<HTMLElement>('td-hue-wrap');
    const hueThumb = this.byId<HTMLElement>('td-hue-thumb');

    if (canvasWrap && canvasCursor) {
      canvasCursor.style.left = `${(this.saturation / 100) * canvasWrap.offsetWidth}px`;
      canvasCursor.style.top = `${(1 - this.brightness / 100) * canvasWrap.offsetHeight}px`;
    }
    if (hueWrap && hueThumb) {
      hueThumb.style.left = `${(this.hue / 360) * hueWrap.offsetWidth}px`;
    }
  }

  private async refreshFromServer(): Promise<void> {
    console.info(`[TD] refreshFromServer -> Form/Get (${BUILD_MARKER}) formId=${this.formId}`);
    await this.loadForm(true);
  }

  private async loadForm(forceServer = false): Promise<void> {
    if (!this.formId) {
      this.rebuildPreview();
      return;
    }

    try {
      const url = `${this.apiBase}Form/Get?formId=${this.formId}&moduleId=0&portalId=0${forceServer ? `&_=${Date.now()}` : ''}`;
      console.info(`[TD] loadForm -> ${forceServer ? 'server refresh' : 'initial load'} (${BUILD_MARKER})`, url);
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      const data = (await response.json()) as FormGetResponse;
      console.info(`[TD] loadForm <- response (${BUILD_MARKER})`, {
        hasThemeJson: Boolean(this.pickString(data, ['themeJson', 'ThemeJson'])),
        hasSchemaJson: Boolean(this.pickString(data, ['schemaJson', 'SchemaJson'])),
        hasSettingsJson: Boolean(this.pickString(data, ['settingsJson', 'SettingsJson'])),
      });

      this.formTitle = this.pickString(data, ['title', 'Title', 'formName', 'FormName']) || 'Untitled Form';
      this.formDescription = this.pickString(data, ['description', 'Description']) || '';
      this.submitButtonText = this.pickString(data, ['submitButtonText', 'SubmitButtonText']) || 'Submit';
      const nameNode = this.byId<HTMLElement>('td-form-name');
      if (nameNode) nameNode.textContent = this.formTitle;

      this.resetLoadedThemeState();

      let parsedThemePayload: Partial<ThemePayload> | null = null;
      const themeJson = this.pickString(data, ['themeJson', 'ThemeJson']);
      if (themeJson) {
        try {
          parsedThemePayload = JSON.parse(themeJson) as Partial<ThemePayload>;
          // Cold-load precedence must match renderer: settings/schema customCss win.
          // Keep theme + cssOverrides from themeJson, but use themeJson.customCss only as
          // last fallback when resolved settings/schema do not provide customCss.
          this.applyThemePayload(parsedThemePayload, false);
        } catch (error) {
          console.warn('ThemeDesigner: failed to parse themeJson', error);
        }
      }

      const schemaJson = this.pickString(data, ['schemaJson', 'SchemaJson']);
      if (schemaJson && schemaJson.trim()) {
        try {
          this.schema = JSON.parse(schemaJson) as PreviewSchema;
        } catch (error) {
          console.warn('ThemeDesigner: failed to parse schemaJson', error);
          this.schema = { fields: [], settings: {} };
        }
      } else {
        this.schema = data as PreviewSchema;
      }

      this.hydrateThemeStateFromSchema(this.schema, true);

      const settingsJson = this.pickString(data, ['settingsJson', 'SettingsJson']);
      if (settingsJson && settingsJson.trim()) {
        try {
          const parsedSettings = JSON.parse(settingsJson) as Record<string, unknown>;
          this.storeResolvedSettings(parsedSettings);
          this.hydrateThemeStateFromSettings(parsedSettings, true);
        } catch (error) {
          console.warn('ThemeDesigner: failed to parse settingsJson', error);
          this.storeResolvedSettings(this.schema?.settings as Record<string, unknown> | undefined);
        }
      } else {
        this.storeResolvedSettings(this.schema?.settings as Record<string, unknown> | undefined);
      }

      if ((!this.currentBaseCss || !this.currentBaseCss.trim()) && parsedThemePayload) {
        this.applyThemePayload(parsedThemePayload, true);
      }

      this.syncAuthoritativeThemeStateToSchema();
      console.info(`[TD] loadForm hydrate css precedence (${BUILD_MARKER})`, {
        cssHydrateBadge: TD_CSS_HYDRATE_BADGE,
        previewSettingsCarryBadge: TD_PREVIEW_SETTINGS_CARRY_BADGE,
        hasResolvedSettings: Boolean(Object.keys(this.loadedResolvedSettings || {}).length),
        currentBaseCssLength: (this.currentBaseCss || '').length,
        theme: this.currentTheme,
      });

      this.setLiveCustomCss('');
      const preset = PRESETS.find((item) => item.id === this.currentTheme);
      const livePrimary = this.getLiveCssVars()['--mf-primary'];
      if (livePrimary) {
        this.applyHexColor(livePrimary, true);
      } else if (preset) {
        this.applyHexColor(preset.primary, true);
      }

      this.syncRightPanelFromVars();
      this.renderPresetList();
      this.rebuildPreview();
      this.setDirty(false);
    } catch (error) {
      console.warn('ThemeDesigner: load failed', error);
      this.schema = { fields: [], settings: {} };
      this.rebuildPreview();
    }
  }


  private pickString(source: Record<string, unknown> | null | undefined, keys: string[]): string {
    if (!source) return '';
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return '';
  }

  private resetLoadedThemeState(): void {
    this.currentTheme = 'default';
    this.currentBaseCss = '';
    this.loadedResolvedSettings = {};
    this.setLiveCssVars({});
    this.setLiveCustomCss('');
  }

  private applyThemePayload(payload: Partial<ThemePayload> | null | undefined, applyCustomCss = true): void {
    if (!payload || typeof payload !== 'object') return;

    if (typeof payload.theme === 'string' && payload.theme.trim()) {
      this.currentTheme = payload.theme.trim();
    }

    if (payload.cssOverrides && typeof payload.cssOverrides === 'object') {
      this.setLiveCssVars({ ...(payload.cssOverrides as Record<string, string>) });
    }

    const parsedCustomCss = typeof payload.customCss === 'string'
      ? payload.customCss
      : typeof (payload as Record<string, unknown>).CustomCss === 'string'
        ? String((payload as Record<string, unknown>).CustomCss)
        : '';

    if (applyCustomCss && parsedCustomCss) {
      this.currentBaseCss = parsedCustomCss;
    }
  }

  private hydrateThemeStateFromSchema(schema: PreviewSchema | null | undefined, preferExisting = false): void {
    if (!schema || typeof schema !== 'object') return;

    const schemaTheme = this.pickString(schema as Record<string, unknown>, ['theme', 'Theme']);
    this.applyThemeIdValue(schemaTheme, preferExisting);

    const schemaCustomCss = this.pickString(schema as Record<string, unknown>, ['customCss', 'CustomCss']);
    this.applyCustomCssValue(schemaCustomCss, preferExisting);

    const settings = schema.settings;
    if (settings && typeof settings === 'object') {
      this.hydrateThemeStateFromSettings(settings as Record<string, unknown>, preferExisting);
    }
  }

  private hydrateThemeStateFromSettings(settings: Record<string, unknown> | null | undefined, preferExisting = false): void {
    if (!settings || typeof settings !== 'object') return;

    const themeId = this.pickString(settings, ['theme', 'Theme']);
    this.applyThemeIdValue(themeId, preferExisting);

    const customCss = this.pickString(settings, ['customCss', 'CustomCss']);
    this.applyCustomCssValue(customCss, preferExisting);

    const rawOverrides = settings.themeCssOverrides;
    if (rawOverrides && typeof rawOverrides === 'object') {
      const nextVars: Record<string, string> = {};
      Object.entries(rawOverrides as Record<string, unknown>).forEach(([key, value]) => {
        if (typeof value === 'string') nextVars[key] = value;
      });
      this.applyCssOverridesValue(nextVars, preferExisting);
    }
  }

  private applyThemeIdValue(themeId: string, preferExisting = false): void {
    const next = String(themeId || '').trim();
    if (!next) return;
    if (preferExisting && this.currentTheme && this.currentTheme !== 'default') return;
    this.currentTheme = next;
  }

  private applyCustomCssValue(customCss: string, preferExisting = false): void {
    const next = String(customCss || '').trim();
    if (!next) return;
    if (preferExisting && this.currentBaseCss && this.currentBaseCss.trim()) return;
    this.currentBaseCss = next;
  }

  private applyCssOverridesValue(nextVars: Record<string, string>, preferExisting = false): void {
    const incoming = Object.entries(nextVars || {}).reduce<Record<string, string>>((acc, [key, value]) => {
      if (key && typeof value === 'string' && value !== '') acc[key] = value;
      return acc;
    }, {});
    if (!Object.keys(incoming).length) return;

    const current = this.getLiveCssVars();
    const merged = preferExisting
      ? { ...incoming, ...current }
      : { ...current, ...incoming };
    this.setLiveCssVars(merged);
  }

  private storeResolvedSettings(settings: Record<string, unknown> | null | undefined): void {
    this.loadedResolvedSettings = settings && typeof settings === 'object'
      ? this.deepClone(settings) as Record<string, unknown>
      : {};
  }

  private syncAuthoritativeThemeStateToSchema(): void {
    this.schema = this.schema || { fields: [], settings: {} };
    this.schema.settings = this.schema.settings || {};

    const overrides = this.getLiveCssVars();
    this.schema.settings.theme = this.currentTheme;
    this.schema.settings.Theme = this.currentTheme;
    this.schema.settings.themeCssOverrides = { ...overrides };
    (this.schema.settings as Record<string, unknown>).ThemeCssOverrides = { ...overrides };
    this.schema.settings.customCss = this.currentBaseCss || '';
    this.schema.settings.CustomCss = this.currentBaseCss || '';
    this.schema.customCss = this.currentBaseCss || '';
    this.schema.CustomCss = this.currentBaseCss || '';
    this.schema.theme = this.currentTheme;
    this.schema.Theme = this.currentTheme;
  }

  private getCurrentCustomHtml(): string {
    const settings = (this.schema && this.schema.settings && typeof this.schema.settings === 'object')
      ? this.schema.settings as Record<string, unknown>
      : {};
    return String(
      settings.customHtml
      || settings.CustomHtml
      || this.schema?.customHtml
      || this.schema?.CustomHtml
      || (this.loadedResolvedSettings && (this.loadedResolvedSettings.customHtml || this.loadedResolvedSettings.CustomHtml))
      || ''
    );
  }

  private buildSchemaForPreview(): PreviewSchema {
    const preview = this.deepClone(this.schema || { fields: [], settings: {} }) as PreviewSchema;
    preview.settings = preview.settings || {};
    const rawCustomHtml = this.getCurrentCustomHtml();
    if (rawCustomHtml && rawCustomHtml.trim()) {
      const built = buildTemplateStructure(rawCustomHtml);
      const instrumented = String(built.instrumentedHtml || rawCustomHtml);
      preview.settings.customHtml = instrumented;
      preview.settings.CustomHtml = instrumented;
      preview.customHtml = instrumented;
      preview.CustomHtml = instrumented;
    }
    return preview;
  }

  private buildResolvedSettingsForPreview(customHtmlOverride?: string): Record<string, unknown> {
    const base = this.loadedResolvedSettings && typeof this.loadedResolvedSettings === 'object'
      ? this.deepClone(this.loadedResolvedSettings) as Record<string, unknown>
      : {};
    base.theme = this.currentTheme;
    base.Theme = this.currentTheme;
    base.themeCssOverrides = { ...this.getLiveCssVars() };
    base.ThemeCssOverrides = { ...this.getLiveCssVars() };
    base.customCss = this.currentBaseCss || '';
    base.CustomCss = this.currentBaseCss || '';
    const html = String(customHtmlOverride || this.getCurrentCustomHtml() || '');
    if (html.trim()) {
      base.customHtml = html;
      base.CustomHtml = html;
    }
    return base;
  }

  private rebuildPreview(): void {
    const frame = this.byId<HTMLIFrameElement>('td-preview-frame');
    const loading = this.byId<HTMLElement>('td-preview-loading');
    if (!frame) return;

    if (loading) loading.classList.remove('hidden');

    const previewSchema = this.buildSchemaForPreview();
    const previewCustomHtml = String((previewSchema.settings as Record<string, unknown> | undefined)?.customHtml || (previewSchema.settings as Record<string, unknown> | undefined)?.CustomHtml || previewSchema.customHtml || previewSchema.CustomHtml || '');
    const schemaJson = JSON.stringify(previewSchema || { fields: [], settings: {} });
    const titleJson = JSON.stringify(previewSchema.title || this.formTitle || '');
    const descriptionJson = JSON.stringify(previewSchema.description || this.formDescription || '');
    const submitJson = JSON.stringify(previewSchema.submitButtonText || this.submitButtonText || 'Submit');
    const varsCss = this.buildVarCss(this.getLiveCssVars());
    const mergedCss = this.buildMergedPieces().mergedFullCss;
    const themeStylesheet = this.currentTheme !== 'default'
      ? `<link rel="stylesheet" href="${resolvePreviewAssetUrl('css/megaform-themes.css')}">`
      : '';
    const escapedCss = mergedCss.replace(/<\//g, '<\\/');

    frame.onload = () => {
      if (loading) loading.classList.add('hidden');
      const previewDoc = this.getPreviewDocument();
      this.flushLiveStateToPreview();
      // FIX TDOnloadImport v20260413-01: always use importCustomCss (NOT commitBaseCss)
      // in frame.onload. commitBaseCss clears r.overrides={} and r.cssVars={} which
      // wipes any inspector changes made before this iframe reload — causing CSS to be
      // missing from the next Save payload. importCustomCss only updates r.importedCss.
      if (window.__MFI?.importCustomCss) {
        try {
          window.__MFI.importCustomCss(this.currentBaseCss || '', previewDoc || undefined);
        } catch (error) {
          console.warn('[TD] preview importCustomCss failed', error);
        }
      }
      this.structureTree?.refreshSoon();
    };

    // Preview/live parity v20260414-04:
    // preview must use the same renderer path, same customCss, and same DOM shape as live.
    // Only data-mfi-template-path instrumentation is allowed; no extra preview shell wrappers.
    const themePayloadJson = JSON.stringify({
      _kind: 'MegaFormThemePatch',
      theme: this.currentTheme,
      cssOverrides: this.getLiveCssVars(),
      customCss: this.currentBaseCss || '',
    });
    const settingsForPreview = this.buildResolvedSettingsForPreview(previewCustomHtml);
    const settingsPreviewJson = JSON.stringify(settingsForPreview);

    frame.srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${resolvePreviewAssetUrl('css/megaform.css')}">
<link rel="stylesheet" href="${resolvePreviewAssetUrl('css/megaform-widgets.css')}">
${themeStylesheet}
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style id="td-preview-shell-style">
  body{margin:0;padding:0;background:transparent;}
</style>
<style id="td-preview-base-style">${[varsCss, escapedCss].filter(Boolean).join('\n')}</style>
</head>
<body>
<div id="mf-mount"></div>
<script>
window.__CFG={
  formId:${this.formId || 999},
  container:'#mf-mount',
  schema:${schemaJson},
  settingsJson:${settingsPreviewJson},
  themeJson:${themePayloadJson},
  title:${titleJson},
  description:${descriptionJson},
  submitButtonText:${submitJson},
  isPreview:true,
  apiBaseUrl:${JSON.stringify(this.apiBase)}
};
<\/script>
<script src="${resolvePreviewAssetUrl('js/megaform-widgets.js')}"><\/script>
<script src="${resolvePreviewAssetUrl('js/megaform-renderer.js')}"><\/script>
<script>
document.addEventListener('DOMContentLoaded',function(){
  if (typeof MegaFormRenderer !== 'undefined' && MegaFormRenderer && typeof MegaFormRenderer.init === 'function') {
    MegaFormRenderer.init(window.__CFG);
  }
  var root=document.getElementById('mf-mount');
  var lastH=0;
  var rafId=0;
  function getTarget(){return root&&root.firstElementChild?root.firstElementChild:(root||document.body);}
  function sendHNow(){
    rafId=0;
    var target=getTarget();
    if(!target)return;
    var rectH=target.getBoundingClientRect?target.getBoundingClientRect().height:0;
    var h=Math.max(300,Math.ceil(rectH||target.scrollHeight||document.body.scrollHeight||document.documentElement.scrollHeight||0));
    if(Math.abs(h-lastH)>1){
      lastH=h;
      var targetOrigin=window.location.origin;
      try{if(document.referrer)targetOrigin=new URL(document.referrer).origin;}catch(_originErr){}
      window.parent.postMessage({type:'td-h',h:h},targetOrigin);
    }
  }
  function queueSendH(){
    if(rafId)cancelAnimationFrame(rafId);
    rafId=requestAnimationFrame(sendHNow);
  }
  queueSendH();
  if(root&&typeof ResizeObserver!=='undefined')new ResizeObserver(queueSendH).observe(root);
  window.addEventListener('load',queueSendH);
  setTimeout(queueSendH,300);
  setTimeout(queueSendH,900);
});
<\/script>
</body>
</html>`;
  }

  private installRuntimeApi(): void {
    const api: ThemeRuntimeApi = {
      refresh: () => {
        void this.refreshFromServer();
      },
      apply: async () => {
        await this.saveTheme('Theme updated!');
      },
      updateTheme: async () => {
        await this.saveTheme('Theme updated!');
      },
      getCustomCss: () => this.currentBaseCss || '',
      setCustomCss: (css: string) => {
        this.currentBaseCss = String(css || '');
        // Also update schema so rebuildPreview (Refresh) renders with merged CSS.
        // Without this, renderer reads old schema.settings.customCss and injects
        // stale CSS into mf-custom-css-N which overrides the merged base.
        if (this.schema) {
          this.schema.settings = this.schema.settings || {};
          this.schema.settings.customCss = this.currentBaseCss;
          this.schema.settings.CustomCss = this.currentBaseCss;
          this.schema.customCss = this.currentBaseCss;
          this.schema.CustomCss = this.currentBaseCss;
        }
        this.applyCurrentBaseCssToPreview();
        this.setDirty(true);
        return this.currentBaseCss;
      },
      setCssOverrides: (vars: Record<string, string>) => {
        this.setLiveCssVars({ ...(vars || {}) });
        // Use lightweight flush — do NOT call commitLiveStateIntoBaseCss.
        this.flushLiveVarsToPreview();
        return this.getAuthoritativeLiveCssVars();
      },
      setDirty: (dirty: boolean) => {
        this.setDirty(dirty);
      },
      getInternalState: () => ({
        theme: this.currentTheme,
        cssOverrides: { ...this.getLiveCssVars() },
        customCss: this.currentBaseCss || '',
        dirty: this.dirty,
      }),
      setThemeState: (next) => {
        if (next.theme) {
          this.currentTheme = next.theme;
          this.renderPresetList();
        }
        if (next.cssOverrides) {
          this.setLiveCssVars({ ...next.cssOverrides });
          this.syncRightPanelFromVars();
        }
        if (typeof next.customCss === 'string') {
          this.currentBaseCss = next.customCss;
        }
        if (typeof next.dirty === 'boolean') {
          this.setDirty(next.dirty);
        }
        this.flushLiveStateToPreview();
        return {
          theme: this.currentTheme,
          cssOverrides: { ...this.getLiveCssVars() },
          customCss: this.currentBaseCss || '',
        };
      },
      notifyInspectorChanged: () => {
        this.mergeInspectorIntoBase();
        this.setDirty(true);
      },
      applyCssVar: (name, value) => {
        // Use setCssVar(flush=false) then lightweight flush.
        // Do NOT call commitLiveStateIntoBaseCss — that clears inspector overrides.
        this.setCssVar(name, value, false);
        this.flushLiveVarsToPreview();
        this.setDirty(true);
        return this.getAuthoritativeLiveCssVars();
      },
      applyStyleOverride: (selector, prop, value, cssText) => {
        // Design intent: write the merged CSS directly into the real base CSS layer
        // (td-preview-base-style), not a temporary overlay like mfi-lo.
        // This lets the user see the final computed CSS live and verify it's correct.
        // Save then just persists this already-computed currentBaseCss.
        //
        // We do NOT call commitLiveStateIntoBaseCss() because that calls
        // syncRightPanelFromVars() which fires input events → setCssVar →
        // flushLiveVarsToPreview → commitLiveStateIntoBaseCss → infinite loop.
        //
        // Inspector self-seeds from currentBaseCss.inspector block on first action
        // (via getInitialInspectorOverrides API) so cssText already contains the
        // full accumulated state — prior session + new change. No merge needed here.
        const css = typeof cssText === 'string' ? cssText : this.getInspectorCss();
        this.setLiveCustomCss(css);
        this.mergeInspectorIntoBase();
        this.setDirty(true);
        this.debugApplyOverride(selector, prop, value);
        return { selector, prop, value };
      },
      downloadThemeJson: () => {
        this.downloadThemeJson();
      },
      downloadBuilderJson: () => {
        this.downloadBuilderJson();
      },
      // TDInspectorSeed v20260413-05: Inspector instances call this on first action
      // to seed their state.overrides from the existing inspector block in currentBaseCss.
      // This ensures prior-session changes (color, font-size, bg-image etc.) are preserved
      // when a new change is made — the full accumulated state flows through exportCustomCss().
      getInitialInspectorOverrides: () => {
        return this.parseInspectorBlockToOverrides(this.extractExistingInspectorCss());
      },
    };

    window.MFThemeDesigner = api;
  }


  private getManagedFormWidthCss(): string {
    if (this.formWidthMode !== 'full') return '';
    return [
      '.mf-form-wrapper{padding-left:0!important;padding-right:0!important;}',
      '.mf-form-inner{max-width:100%!important;}',
    ].join('\n');
  }

  private hasManagedFullWidthBlock(css: string | undefined): boolean {
    const blockId = `${TD_FORM_WIDTH_SAVE_BADGE}:layout`;
    return String(css || '').includes(`/* ${blockId}:start */`);
  }

  private syncFormWidthControls(): void {
    const slider = this.byId<HTMLInputElement>('td-form-width-slider');
    const valueNode = slider?.closest('.td-sld-row')?.querySelector<HTMLElement>('.td-sld-val');
    const current = String(this.getAuthoritativeLiveCssVars()['--mf-form-max-width'] || '').trim();
    const numeric = Number.parseFloat(current);
    if (Number.isFinite(numeric)) {
      this.lastCustomFormWidth = numeric;
      if (slider) slider.value = String(Math.max(320, Math.min(1600, Math.round(numeric / 20) * 20)));
    } else if (slider) {
      slider.value = String(this.lastCustomFormWidth);
    }

    if (this.formWidthMode === 'full') {
      if (valueNode) valueNode.textContent = 'Full width';
    } else if (this.formWidthMode === 'percent') {
      if (valueNode) valueNode.textContent = '100%';
    } else if (valueNode) {
      valueNode.textContent = current || `${this.lastCustomFormWidth}px`;
    }

    this.queryAll<HTMLElement>('.td-form-width-preset[data-width-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.widthMode === this.formWidthMode || (this.formWidthMode === 'default' && button.dataset.widthMode === 'default'));
    });
  }

  private applyFormWidthPreset(mode: 'default' | 'percent' | 'full'): void {
    this.formWidthMode = mode;
    if (mode === 'default') {
      this.removeCssVar('--mf-form-max-width');
      this.syncFormWidthControls();
      return;
    }
    this.setCssVar('--mf-form-max-width', '100%', false);
    this.flushLiveVarsToPreview();
    this.setDirty(true);
    this.syncFormWidthControls();
  }

  private inferFormWidthMode(vars: Record<string, string>): 'default' | 'custom' | 'percent' | 'full' {
    if (this.hasManagedFullWidthBlock(this.currentBaseCss) || (this.formWidthMode === 'full' && String(vars['--mf-form-max-width'] || '').trim() === '100%')) {
      return 'full';
    }
    const current = String(vars['--mf-form-max-width'] || '').trim();
    if (!current) return 'default';
    if (current === '100%') return 'percent';
    const numeric = Number.parseFloat(current);
    if (Number.isFinite(numeric)) {
      this.lastCustomFormWidth = numeric;
      return numeric === 960 ? 'default' : 'custom';
    }
    return 'default';
  }

  private getLiveCssVars(): Record<string, string> {
    if (!window.MFThemeDesigner?.__tdLiveCssVars) {
      if (window.__MFI?.readVars) {
        const doc = this.getPreviewDocument();
        if (doc) {
          window.MFThemeDesigner = window.MFThemeDesigner || ({} as ThemeRuntimeApi);
          window.MFThemeDesigner.__tdLiveCssVars = { ...(window.__MFI.readVars(doc) || {}) };
        }
      }
    }
    return window.MFThemeDesigner?.__tdLiveCssVars || {};
  }

  private setLiveCssVars(next: Record<string, string>): void {
    window.MFThemeDesigner = window.MFThemeDesigner || ({} as ThemeRuntimeApi);
    window.MFThemeDesigner.__tdLiveCssVars = { ...next };
  }

  private getLiveCustomCss(): string {
    return String(window.MFThemeDesigner?.__tdLiveCustomCss || '');
  }

  private setLiveCustomCss(css: string): void {
    window.MFThemeDesigner = window.MFThemeDesigner || ({} as ThemeRuntimeApi);
    window.MFThemeDesigner.__tdLiveCustomCss = String(css || '');
  }

  private getDomLiveCssVars(): Record<string, string> {
    try {
      const doc = this.getPreviewDocument();
      if (!doc || !window.__MFI?.readVars) return {};
      return { ...(window.__MFI.readVars(doc) || {}) };
    } catch {
      return {};
    }
  }

  private getAuthoritativeLiveCssVars(): Record<string, string> {
    const domVars = this.getDomLiveCssVars();
    const liveVars = this.getLiveCssVars();
    let internalVars: Record<string, string> = {};
    try {
      const internalState = window.MFThemeDesigner?.getInternalState?.();
      if (internalState?.cssOverrides && typeof internalState.cssOverrides === 'object') {
        internalVars = { ...(internalState.cssOverrides as Record<string, string>) };
      }
    } catch {
      internalVars = {};
    }
    return { ...domVars, ...liveVars, ...internalVars };
  }

  private extractFontSelectValue(fontValue: string | undefined): string {
    const raw = String(fontValue || '').trim();
    if (!raw) return '';
    const first = raw.split(',')[0] || raw;
    return first.replace(/^['\"]+|['\"]+$/g, '').trim();
  }

  private getCompositeSliderValue(variableName: string, fallback: number): number {
    const input = document.querySelector<HTMLInputElement>(`.td-slider[data-var="${variableName}"]`);
    const numeric = Number.parseFloat(String(input?.value || ''));
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  private parseSpacingPair(value: string | undefined, fallbackY: number, fallbackX: number): { y: number; x: number } {
    const raw = String(value || '').trim();
    if (!raw) return { y: fallbackY, x: fallbackX };
    const parts = raw.split(/\s+/).map((part) => Number.parseFloat(part)).filter((part) => Number.isFinite(part));
    if (parts.length <= 0) return { y: fallbackY, x: fallbackX };
    if (parts.length === 1) return { y: parts[0], x: parts[0] };
    return { y: parts[0], x: parts[1] };
  }

  private setCssVar(name: string, value: string, flush = true): void {
    const next = { ...this.getLiveCssVars(), [name]: value };
    this.setLiveCssVars(next);
    if (flush) {
      this.flushLiveVarsToPreview();
      this.setDirty(true);
    }
  }

  private removeCssVar(name: string): void {
    const next = { ...this.getLiveCssVars() };
    delete next[name];
    this.setLiveCssVars(next);
    this.flushLiveVarsToPreview();
    this.setDirty(true);
  }

  private clearCssVars(): void {
    this.setLiveCssVars({});
    this.syncRightPanelFromVars();
  }

  private syncRightPanelFromVars(): void {
    const vars = this.getAuthoritativeLiveCssVars();

    this.queryAll<HTMLElement>('.td-clr-row[data-var]').forEach((row) => {
      const variableName = row.dataset.var;
      const input = row.querySelector<HTMLInputElement>('input[type="color"]');
      const span = row.querySelector<HTMLSpanElement>('span');
      if (!variableName || !input) return;
      const current = vars[variableName];
      if (current && current.startsWith('#')) {
        input.value = current.slice(0, 7);
        if (span) span.textContent = current.slice(0, 7);
      }
    });

    this.queryAll<HTMLInputElement>('.td-slider[data-var]').forEach((input) => {
      const variableName = input.dataset.var;
      if (!variableName) return;
      const valueNode = input.closest('.td-sld-row')?.querySelector<HTMLElement>('.td-sld-val');
      if (variableName === '--mf-form-max-width') {
        this.formWidthMode = this.inferFormWidthMode(vars);
        this.syncFormWidthControls();
        return;
      }
      if (variableName === '--mf-form-padding-y' || variableName === '--mf-form-padding-x') {
        const currentPadding = vars['--mf-form-padding'];
        const pair = this.parseSpacingPair(currentPadding, 32, 40);
        const nextValue = variableName === '--mf-form-padding-y' ? pair.y : pair.x;
        input.value = String(nextValue);
        if (valueNode) valueNode.textContent = `${nextValue}px`;
        return;
      }
      const current = vars[variableName];
      if (!current) return;
      const numeric = Number.parseFloat(current);
      if (!Number.isNaN(numeric)) {
        input.value = String(numeric);
        if (valueNode) valueNode.textContent = current;
      }
    });

    this.queryAll<HTMLSelectElement>('.td-var-select[data-var]').forEach((select) => {
      const variableName = select.dataset.var;
      if (!variableName) return;
      const current = vars[variableName];
      if (current) select.value = current;
    });

    this.queryAll<HTMLInputElement>('.td-effect-toggle[data-var]').forEach((toggle) => {
      const variableName = toggle.dataset.var;
      if (!variableName) return;
      const current = vars[variableName];
      if (!current) return;
      toggle.checked = current !== 'none' && current !== toggle.dataset.off;
    });

    const fontSelect = this.byId<HTMLSelectElement>('td-font-select');
    if (fontSelect) {
      const currentFont = this.extractFontSelectValue(vars['--mf-font-family']);
      if (currentFont) fontSelect.value = currentFont;
      const previewText = this.byId<HTMLElement>('td-font-preview-text');
      if (previewText && currentFont) previewText.style.fontFamily = currentFont;
    }

    this.formWidthMode = this.inferFormWidthMode(vars);
    this.syncFormWidthControls();
  }

  private flushLiveVarsToPreview(): void {
    // Write CSS vars live directly to td-live-overrides in the iframe.
    // This is lightweight — no CSS merge, no buildMergedPieces, no srcdoc reload.
    // Calling commitLiveStateIntoBaseCss here caused an infinite rebuild loop:
    //   flushLiveVarsToPreview → commitLiveStateIntoBaseCss → applyCurrentBaseCssToPreview
    //   → commitBaseCss(mfi) → clears state.overrides → inspector CSS gone.
    const doc = this.getPreviewDocument();
    if (!doc?.head) return;
    const vars = this.getAuthoritativeLiveCssVars();
    const keys = Object.keys(vars).filter((k) => k && vars[k] != null && vars[k] !== '');
    const decl = keys.map((k) => `${k}:${vars[k]}`).join(';');
    const style = this.ensureStyleTag(doc, 'td-live-overrides');
    style.textContent = decl
      ? `:root{${decl}}.mf-form-wrapper{${decl}}.mfp{${decl}}[class*="mf-theme-"]{${decl}}`
      : '';
    this.ensureStyleTag(doc, 'td-live-layout-overrides').textContent = this.getManagedFormWidthCss();
  }

  private flushLiveCustomCssToPreview(): void {
    // Write inspector CSS directly to mfi-lo in the iframe.
    // Avoid commitLiveStateIntoBaseCss which clears state.overrides.
    const doc = this.getPreviewDocument();
    if (!doc?.head) return;
    const css = this.getLiveCustomCss() || this.getInspectorCss();
    const style = this.ensureStyleTag(doc, 'mfi-lo');
    style.textContent = css;
  }

  private flushLiveStateToPreview(): void {
    this.applyCurrentBaseCssToPreview();
    this.flushLiveVarsToPreview();
  }

  private applyCurrentBaseCssToPreview(): void {
    const doc = this.getPreviewDocument();
    if (!doc?.head) return;

    // Write merged base CSS into td-preview-base-style.
    const style = this.ensureStyleTag(doc, 'td-preview-base-style');
    style.textContent = this.currentBaseCss || '';

    // Do NOT clear mfi-lo — inspector owns that style tag and manages it.
    // Clearing it here would erase live inspector overrides.
    // Do NOT call commitBaseCss/importCustomCss here — commitBaseCss resets
    // state.overrides = {} which kills live CSS preview.
    // commitBaseCss is only called from frame.onload (rebuildPreview) where
    // a full srcdoc reload has already wiped everything clean.
  }

  // Merge inspector overrides into currentBaseCss (for Save) and show live preview.
  // currentBaseCss is updated so Save writes merged CSS to schema.settings.customCss.
  // On Refresh, rebuildPreview uses schema → renderer injects mf-custom-css-* correctly.
  // mfi-lo here is only for live preview during editing (before Save/Refresh).
  private mergeInspectorIntoBase(): void {
    const pieces = this.buildMergedPieces();
    this.currentBaseCss = pieces.mergedFullCss || '';
    const inspectorCss = this.getLiveCustomCss() || this.getInspectorCss();
    // FIX TDLiveCssRetain v20260413-02: do NOT clear liveCustomCss here.
    // buildMergedPieces() inside saveTheme needs liveCustomCss to rebuild the
    // inspector block. Clearing it here caused: strip(currentBaseCss) removes
    // the baked-in inspector block, but getLiveCustomCss()='' && getInspectorCss()=''
    // (wrong __MFI instance when two inspector scripts load), so mergedFullCss was
    // sent to server WITHOUT inspector CSS → save persists wrong CSS.
    const doc = this.getPreviewDocument();
    if (doc?.head) {
      // Write merged base CSS (inspector overrides baked in, but !important stripped by parser)
      this.ensureStyleTag(doc, 'td-preview-base-style').textContent = this.currentBaseCss;
      // Write inspector overrides WITH !important into mfi-lo, appended last in <head>
      // so they win cascade over mf-custom-css-* tags that load between them.
      const mfiLo = this.ensureStyleTag(doc, 'mfi-lo');
      // Re-append to end of head to ensure it comes after mf-custom-css-* tags
      doc.head.appendChild(mfiLo);
      mfiLo.textContent = inspectorCss;
      // Clear live vars overlay since vars are now baked into currentBaseCss
      const liveOverrides = doc.getElementById('td-live-overrides') as HTMLStyleElement | null;
      if (liveOverrides) liveOverrides.textContent = '';
      // Update inspector's importedCss so next reload starts from merged state.
      // IMPORTANT: use importCustomCss NOT commitBaseCss.
      // commitBaseCss also calls clearTransientStyles which wipes td-live-overrides,
      // killing any CSS vars set by the right panel (Primary Color etc).
      if (window.__MFI?.importCustomCss) {
        try { window.__MFI.importCustomCss(this.currentBaseCss, doc); } catch { /* ignore */ }
      }
    }
  }

  private commitLiveStateIntoBaseCss(reason: string): string {
    const pieces = this.buildMergedPieces();
    this.currentBaseCss = pieces.mergedFullCss || '';
    // Reset live vars/CSS — they've been merged into currentBaseCss
    this.setLiveCssVars({});
    this.setLiveCustomCss('');
    // Write merged CSS directly into td-preview-base-style without touching
    // mfi-lo (inspector owns it) or calling commitBaseCss (resets overrides).
    const doc = this.getPreviewDocument();
    if (doc?.head) {
      const style = this.ensureStyleTag(doc, 'td-preview-base-style');
      style.textContent = this.currentBaseCss || '';
      // Clear td-live-overrides since vars are now baked into currentBaseCss
      const liveVarStyle = doc.getElementById('td-live-overrides') as HTMLStyleElement | null;
      if (liveVarStyle) liveVarStyle.textContent = '';
      // Re-tell inspector about new base CSS so it can re-render mfi-lo on reload.
      // Use importCustomCss NOT commitBaseCss — commitBaseCss clears td-live-overrides.
      if (window.__MFI?.importCustomCss) {
        try { window.__MFI.importCustomCss(this.currentBaseCss || '', doc); } catch { /* ignore */ }
      }
    }
    this.syncRightPanelFromVars();
    this.setDirty(true);
    console.info(`[TD] currentBaseCss recomputed (${BUILD_MARKER})`, {
      reason,
      currentBaseCssLength: this.currentBaseCss.length,
    });
    return this.currentBaseCss;
  }

  private ensureStyleTag(doc: Document, id: string): HTMLStyleElement {
    let style = doc.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = id;
      doc.head.appendChild(style);
    }
    return style;
  }

  private getPreviewDocument(): Document | null {
    const frame = this.byId<HTMLIFrameElement>('td-preview-frame');
    if (!frame) return null;
    try {
      return frame.contentDocument || frame.contentWindow?.document || null;
    } catch {
      return null;
    }
  }

  private setDirty(nextDirty: boolean): void {
    this.dirty = nextDirty;
    this.root.dataset.tdDirty = nextDirty ? '1' : '0';
    if (window.MFThemeDesigner) {
      window.MFThemeDesigner.__dirty = nextDirty;
    }
    const badge = this.byId<HTMLElement>('td-saved-badge');
    if (!badge) return;
    badge.textContent = nextDirty ? 'Unsaved' : 'Saved';
    badge.style.background = nextDirty ? '#fef9c3' : '#f0fdf4';
    badge.style.borderColor = nextDirty ? '#fde68a' : '#bbf7d0';
    badge.style.color = nextDirty ? '#92400e' : '#16a34a';
  }

  private getInspectorCss(): string {
    try {
      return String(window.__MFI?.exportCustomCss?.() || '');
    } catch {
      return '';
    }
  }

  private buildThemeObject(): ThemePayload {
    const pieces = this.buildMergedPieces();
    return {
      _kind: 'MegaFormThemePatch',
      theme: this.currentTheme,
      cssOverrides: pieces.vars,
      customCss: pieces.mergedFullCss,
    };
  }

  private buildBuilderJson(): PreviewSchema {
    const schema = this.deepClone(this.schema || { fields: [], settings: {} }) as PreviewSchema;
    schema.settings = schema.settings || {};

    const mergedCss = this.buildMergedPieces().mergedFullCss;
    schema.settings.theme = this.currentTheme;
    schema.settings.Theme = this.currentTheme;
    schema.settings.customCss = mergedCss;
    schema.settings.CustomCss = mergedCss;
    schema.customCss = mergedCss;
    schema.CustomCss = mergedCss;
    schema.theme = this.currentTheme;
    schema.Theme = this.currentTheme;

    if (!schema.title && this.formTitle) schema.title = this.formTitle;
    if (!schema.description && this.formDescription) schema.description = this.formDescription;
    if (!schema.submitButtonText && this.submitButtonText) schema.submitButtonText = this.submitButtonText;
    return schema;
  }

  private getThemePayloadForSave(): SaveThemePayload {
    const pieces = this.buildMergedPieces();
    return {
      themeJson: JSON.stringify(this.buildThemeObject()),
      mergedFullCss: pieces.mergedFullCss,
      mergedNonVarCss: pieces.mergedNonVarCss,
      vars: pieces.vars,
      theme: this.currentTheme,
    };
  }

  private async saveTheme(successMessage: string): Promise<void> {
    if (!this.formId) {
      this.toast('No form loaded', 'error');
      return;
    }

    const payload = this.getThemePayloadForSave();
    try {
      console.info(`[TD] saveTheme -> SaveTheme (${BUILD_MARKER})`, {
        formId: this.formId,
        theme: payload.theme,
        vars: Object.keys(payload.vars || {}).length,
        mergedFullCssLength: (payload.mergedFullCss || '').length,
      });

      // BUG FIX: Add DNN antiforgery headers when running inside a DNN host.
      // Without RequestVerificationToken + TabId + ModuleId, the DNN WebAPI
      // antiforgery middleware returns 400/403 → save fails → setDirty(false)
      // is never reached → back button shows "Unsaved changes" warning even
      // though the user believes the save succeeded.
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      };
      try {
        const mfp = window.__MF_PLATFORM__ as Record<string, unknown> | undefined;
        const platform = String((mfp?.platform as string) || '').toLowerCase();
        // Resolve moduleId: prefer __MF_PLATFORM__, fallback to mf-dnn-host el,
        // then any [data-module-id] in DOM (covers cross-form ?formid=N rendering).
        const moduleId = (mfp?.moduleId as number) || Number.parseInt(
          (document.getElementById('mf-dnn-host') as HTMLElement | null)?.dataset.moduleId ||
          (document.querySelector('[data-module-id]') as HTMLElement | null)?.dataset.moduleId || '0', 10
        ) || 0;
        const jq = (window as Window & { jQuery?: { ServicesFramework?: (id: number) => { getAntiForgeryValue: () => string; getTabId: () => string; getModuleId: () => string } } }).jQuery;
        // Apply DNN auth headers when platform is dnn OR jQuery SF is available (DOM fallback).
        // Fixes: SaveTheme 400 when form is viewed via cross-form ?formid=N URL where
        // __MF_PLATFORM__.platform may not be set to 'dnn' (Important Note #TD-savefix).
        if ((platform === 'dnn' || jq?.ServicesFramework) && moduleId && jq?.ServicesFramework) {
          const sf = jq.ServicesFramework(moduleId);
          headers.RequestVerificationToken = sf.getAntiForgeryValue();
          headers.TabId = sf.getTabId();
          headers.ModuleId = sf.getModuleId();
        }
      } catch (headerErr) {
        console.warn('[TD] saveTheme: could not add DNN auth headers', headerErr);
      }

      const response = await fetch(`${this.apiBase}Form/SaveTheme`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          FormId: this.formId,
          ThemeJson: payload.themeJson,
          SchemaCustomCss: payload.mergedFullCss,
          ThemeId: payload.theme,
          CssOverrides: payload.vars,
        }),
      });
      const responseText = await response.text();
      let responseJson: unknown = null;
      try {
        responseJson = responseText ? JSON.parse(responseText) : null;
      } catch (error) {
        console.warn(`[TD] saveTheme response JSON parse failed (${BUILD_MARKER})`, error);
      }

      this.saveDebug.saveStatus = `POST ${response.status} ${response.ok ? 'OK' : 'FAIL'}`;
      this.saveDebug.saveResponseText = this.shortenDebugText(responseText || '[empty response body]');
      this.renderSaveDebugPanel();
      console.info(`[TD] saveTheme response (${BUILD_MARKER})`, {
        status: response.status,
        ok: response.ok,
        body: responseJson ?? responseText,
      });

      if (!response.ok) {
        console.warn(`[TD] saveTheme failed (${BUILD_MARKER})`, response.status, responseText);
        await this.verifySavedThemeRoundTrip();
        this.toast(`Save failed: ${response.status}`, 'error');
        return;
      }

      this.currentBaseCss = payload.mergedFullCss || this.currentBaseCss || '';
      console.info(`[TD] saveTheme success (${BUILD_MARKER})`, {
        mergedFullCssLength: (payload.mergedFullCss || '').length,
        vars: Object.keys(payload.vars || {}).length,
      });
      // FIX TDLiveCssRetain v20260413-02: only overwrite liveCustomCss from __MFI
      // if __MFI actually has content. When two inspector scripts load (DNN cdv vs
      // no-cdv URLs), window.__MFI may be the instance with empty r.overrides, so
      // getInspectorCss() returns ''. Clearing liveCustomCss here would cause the
      // next buildMergedPieces (e.g. a second Save) to strip the inspector block
      // with nothing to replace it → inspector CSS silently disappears.
      const freshInspectorCss = this.getInspectorCss();
      if (freshInspectorCss) this.setLiveCustomCss(freshInspectorCss);
      this.setLiveCssVars({ ...(payload.vars || {}) });

      this.schema.settings = this.schema.settings || {};
      this.schema.settings.theme = payload.theme;
      this.schema.settings.Theme = payload.theme;
      this.schema.settings.customCss = payload.mergedFullCss;
      this.schema.settings.CustomCss = payload.mergedFullCss;
      this.schema.customCss = payload.mergedFullCss;
      this.schema.CustomCss = payload.mergedFullCss;
      this.schema.theme = payload.theme;
      this.schema.Theme = payload.theme;

      // FIX TDSyncToBuilder v20260413-06:
      // DNN uses hash routing (#mf-theme ↔ #mf-builder) — no page reload between
      // Theme Designer and Form Builder. MegaFormBuilder.state.schema was loaded
      // once at page load from data-schema-json (server-rendered). If user returns
      // to Builder and clicks Save/Publish without this fix, Builder would send
      // the OLD customCss, overwriting the Theme Designer's saved CSS.
      // Fix: directly patch Builder's in-memory schema.settings.customCss and also
      // update data-theme-json so buildPayload uses the correct ThemeJson.
      try {
        const fb = (window as any).MegaFormBuilder;
        if (fb?.state?.schema) {
          if (!fb.state.schema.settings) fb.state.schema.settings = {};
          fb.state.schema.settings.customCss = payload.mergedFullCss;
          fb.state.schema.settings.CustomCss = payload.mergedFullCss;
          fb.state.schema.settings.theme = payload.theme;
          fb.state.schema.settings.Theme = payload.theme;
          fb.state.schema.customCss = payload.mergedFullCss;
          fb.state.schema.CustomCss = payload.mergedFullCss;
          // Update data-theme-json so toolbar.ts buildPayload reads correct ThemeJson
          const builderRoot = document.getElementById('mf-builder-root');
          if (builderRoot) builderRoot.setAttribute('data-theme-json', payload.themeJson);
          console.info(`[TD] TDSyncToBuilder: synced CSS+ThemeJson to MegaFormBuilder state (${BUILD_MARKER})`);
        }
      } catch (fbErr) {
        console.warn('[TD] TDSyncToBuilder: could not sync to builder state', fbErr);
      }

      if (window.MFThemeDesigner) {
        if (typeof window.MFThemeDesigner.__originalGetCustomCss !== 'function') {
          window.MFThemeDesigner.__originalGetCustomCss = () => this.currentBaseCss || '';
        }
        window.MFThemeDesigner.__tdLastSavedThemeJson = payload.themeJson;
        window.MFThemeDesigner.__tdLastSavedThemeCss = payload.mergedFullCss;
        if (typeof window.MFThemeDesigner.setThemeState === 'function') {
          window.MFThemeDesigner.setThemeState({
            theme: payload.theme,
            cssOverrides: { ...(payload.vars || {}) },
            customCss: payload.mergedFullCss || '',
            dirty: false,
          });
        }
      }

      this.flushLiveStateToPreview();
      this.syncRightPanelFromVars();
      this.setDirty(false);
      await this.verifySavedThemeRoundTrip();
      this.toast(successMessage, 'success');
    } catch {
      this.toast('Network error', 'error');
    }
  }


  private ensureSaveDebugPanel(): void {
    if (this.byId('td-save-debug-panel')) return;
    const scroll = this.root.querySelector('.td-right-scroll');
    if (!scroll) return;

    const panel = document.createElement('details');
    panel.className = 'td-save-debug-panel';
    panel.id = 'td-save-debug-panel';
    panel.open = true;

    const summary = document.createElement('summary');
    summary.textContent = 'Save / Refresh debug';
    panel.appendChild(summary);

    const grid = document.createElement('div');
    grid.className = 'td-save-debug-grid';

    const fields: Array<[string, string, 'status' | 'pre']> = [
      ['SaveTheme response', 'td-save-debug-save-status', 'status'],
      ['SaveTheme body', 'td-save-debug-save-body', 'pre'],
      ['Form/Get verify', 'td-save-debug-verify-status', 'status'],
      ['ThemeJson', 'td-save-debug-theme-json', 'pre'],
      ['SchemaJson.settings.customCss', 'td-save-debug-schema-css', 'pre'],
      ['SettingsJson.customCss', 'td-save-debug-settings-css', 'pre'],
    ];

    fields.forEach(([labelText, id, type]) => {
      const wrap = document.createElement('div');
      wrap.className = 'td-save-debug-field';

      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = labelText;
      wrap.appendChild(label);

      const value = document.createElement(type === 'status' ? 'div' : 'pre');
      value.id = id;
      value.className = type === 'status' ? 'td-save-debug-status' : 'td-save-debug-pre';
      value.textContent = type === 'status' ? 'waiting' : '';
      wrap.appendChild(value);

      grid.appendChild(wrap);
    });

    panel.appendChild(grid);
    scroll.appendChild(panel);
  }

  private renderSaveDebugPanel(): void {
    this.ensureSaveDebugPanel();
    const setText = (id: string, value: string): void => {
      const node = this.byId<HTMLElement>(id);
      if (node) node.textContent = value || '';
    };

    setText('td-save-debug-save-status', this.saveDebug.saveStatus || 'waiting');
    setText('td-save-debug-save-body', this.saveDebug.saveResponseText || '');
    setText('td-save-debug-verify-status', this.saveDebug.verifyStatus || 'waiting');
    setText('td-save-debug-theme-json', this.saveDebug.verifyThemeJson || '');
    setText('td-save-debug-schema-css', this.saveDebug.verifySchemaCustomCss || '');
    setText('td-save-debug-settings-css', this.saveDebug.verifySettingsCustomCss || '');
  }

  private shortenDebugText(text: string, maxLength = 2400): string {
    const raw = String(text || '');
    if (raw.length <= maxLength) return raw;
    return `${raw.slice(0, maxLength)}
… [truncated ${raw.length - maxLength} chars]`;
  }

  private async verifySavedThemeRoundTrip(): Promise<void> {
    if (!this.formId) {
      this.saveDebug.verifyStatus = 'no form id';
      this.renderSaveDebugPanel();
      return;
    }

    try {
      const url = `${this.apiBase}Form/Get?formId=${this.formId}&moduleId=0&portalId=0&_=${Date.now()}`;
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      const responseText = await response.text();
      let data: Record<string, unknown> | null = null;
      try {
        data = responseText ? JSON.parse(responseText) as Record<string, unknown> : null;
      } catch (error) {
        console.warn(`[TD] verify Form/Get JSON parse failed (${BUILD_MARKER})`, error);
      }

      this.saveDebug.verifyStatus = `GET ${response.status} ${response.ok ? 'OK' : 'FAIL'}`;

      if (!data) {
        this.saveDebug.verifyThemeJson = this.shortenDebugText(responseText || '[non-json response]');
        this.saveDebug.verifySchemaCustomCss = '';
        this.saveDebug.verifySettingsCustomCss = '';
        this.renderSaveDebugPanel();
        console.info(`[TD] verify Form/Get (${BUILD_MARKER})`, {
          status: response.status,
          ok: response.ok,
          raw: responseText,
        });
        return;
      }

      const themeJson = this.pickString(data, ['themeJson', 'ThemeJson']);
      let schemaCustomCss = '';
      let settingsCustomCss = '';

      const schemaJson = this.pickString(data, ['schemaJson', 'SchemaJson']);
      if (schemaJson) {
        try {
          const schema = JSON.parse(schemaJson) as PreviewSchema;
          schemaCustomCss = this.pickString(schema as Record<string, unknown>, ['customCss', 'CustomCss']);
          const nestedSettings = schema?.settings;
          if (!schemaCustomCss && nestedSettings && typeof nestedSettings === 'object') {
            schemaCustomCss = this.pickString(nestedSettings as Record<string, unknown>, ['customCss', 'CustomCss']);
          }
        } catch (error) {
          console.warn(`[TD] verify schemaJson parse failed (${BUILD_MARKER})`, error);
          schemaCustomCss = `[schemaJson parse failed] ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      const settingsJson = this.pickString(data, ['settingsJson', 'SettingsJson']);
      if (settingsJson) {
        try {
          const settings = JSON.parse(settingsJson) as Record<string, unknown>;
          settingsCustomCss = this.pickString(settings, ['customCss', 'CustomCss']);
        } catch (error) {
          console.warn(`[TD] verify settingsJson parse failed (${BUILD_MARKER})`, error);
          settingsCustomCss = `[settingsJson parse failed] ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      this.saveDebug.verifyThemeJson = this.shortenDebugText(themeJson || '[empty]');
      this.saveDebug.verifySchemaCustomCss = this.shortenDebugText(schemaCustomCss || '[empty]');
      this.saveDebug.verifySettingsCustomCss = this.shortenDebugText(settingsCustomCss || '[empty]');
      this.renderSaveDebugPanel();

      console.info(`[TD] verify Form/Get (${BUILD_MARKER})`, {
        status: response.status,
        ok: response.ok,
        themeJsonLength: themeJson.length,
        schemaCustomCssLength: schemaCustomCss.length,
        settingsCustomCssLength: settingsCustomCss.length,
      });
    } catch (error) {
      console.warn(`[TD] verify Form/Get failed (${BUILD_MARKER})`, error);
      this.saveDebug.verifyStatus = `error: ${error instanceof Error ? error.message : String(error)}`;
      this.saveDebug.verifyThemeJson = '';
      this.saveDebug.verifySchemaCustomCss = '';
      this.saveDebug.verifySettingsCustomCss = '';
      this.renderSaveDebugPanel();
    }
  }

  private downloadThemeJson(): void {
    const json = JSON.stringify(this.buildThemeObject(), null, 2);
    this.downloadText(`theme-patch-${this.formId || 'preview'}.json`, json, 'application/json;charset=utf-8');
  }

  private downloadBuilderJson(): void {
    const json = JSON.stringify(this.buildBuilderJson(), null, 2);
    this.downloadText(`gallery-theme-${this.formId || 'preview'}.json`, json, 'application/json;charset=utf-8');
  }

  private downloadText(filename: string, text: string, mime: string): void {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  private escapeRegExp(value: string): string {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private composeCssSections(parts: string[]): string {
    return parts
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  // Extract only the content between inspector block markers from currentBaseCss.
  private extractExistingInspectorCss(): string {
    const blockId = `${TD_SAVE_CSS_STABLE_BADGE}:inspector`;
    const startTag = `/* ${blockId}:start */`;
    const endTag = `/* ${blockId}:end */`;
    const css = this.currentBaseCss || '';
    const start = css.indexOf(startTag);
    const end = css.indexOf(endTag);
    if (start < 0 || end <= start) return '';
    return css.substring(start + startTag.length, end).trim();
  }

  // Parse inspector CSS "selector{prop:val !important}" into {selector:{prop:val}} map.
  // Used by getInitialInspectorOverrides so inspector instances self-seed state.overrides
  // with prior-session changes on their first user action.
  private parseInspectorBlockToOverrides(css: string): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    if (!css) return result;
    const ruleRegex = /([^{*@]+?)\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRegex.exec(css)) !== null) {
      const selector = m[1].trim();
      if (!selector) continue;
      const props: Record<string, string> = {};
      m[2].split(';').forEach((decl) => {
        const ci = decl.indexOf(':');
        if (ci < 0) return;
        const prop = decl.substring(0, ci).trim();
        const val = decl.substring(ci + 1).replace(/!important/gi, '').trim();
        if (prop && val) props[prop] = val;
      });
      if (Object.keys(props).length) {
        result[selector] = { ...(result[selector] || {}), ...props };
      }
    }
    return result;
  }

  private buildDesignerGeneratedBlock(kind: 'vars' | 'layout' | 'inspector', css: string): string {
    const body = String(css || '').trim();
    if (!body) return '';
    const blockId = `${TD_SAVE_CSS_STABLE_BADGE}:${kind}`;
    return `/* ${blockId}:start */\n${body}\n/* ${blockId}:end */`;
  }

  private stripDesignerGeneratedBlocks(css: string): string {
    let next = String(css || '');
    (['vars', 'layout', 'inspector'] as const).forEach((kind) => {
      const blockId = `${TD_SAVE_CSS_STABLE_BADGE}:${kind}`;
      const start = this.escapeRegExp(`/* ${blockId}:start */`);
      const end = this.escapeRegExp(`/* ${blockId}:end */`);
      next = next.replace(new RegExp(`${start}[\\s\\S]*?${end}`, 'g'), '');
    });
    return next.replace(/\n{3,}/g, '\n\n').trim();
  }

  private buildMergedPieces(): { vars: Record<string, string>; mergedNonVarCss: string; mergedFullCss: string } {
    const vars = { ...this.getAuthoritativeLiveCssVars() };
    const inspectorCss = String(this.getLiveCustomCss() || this.getInspectorCss() || '').trim();
    const preservedBaseCss = this.stripDesignerGeneratedBlocks(this.currentBaseCss || '');
    const varCss = this.buildVarCss(vars);
    const layoutCss = this.getManagedFormWidthCss();
    const varsBlock = this.buildDesignerGeneratedBlock('vars', varCss);
    const layoutBlock = this.buildDesignerGeneratedBlock('layout', layoutCss);
    const inspectorBlock = this.buildDesignerGeneratedBlock('inspector', inspectorCss);
    const mergedNonVarCss = this.composeCssSections([preservedBaseCss, layoutBlock, inspectorBlock]);
    const mergedFullCss = this.composeCssSections([preservedBaseCss, varsBlock, layoutBlock, inspectorBlock]);
    console.info(`[TD] buildMergedPieces (${BUILD_MARKER})`, {
      saveCssStableBadge: TD_SAVE_CSS_STABLE_BADGE,
      saveCssNoRebuildBadge: TD_SAVE_CSS_NO_REBUILD_BADGE,
      currentBaseCssLength: (this.currentBaseCss || '').length,
      preservedBaseCssLength: preservedBaseCss.length,
      liveCustomCssLength: (this.getLiveCustomCss() || '').length,
      inspectorCssLength: (this.getInspectorCss() || '').length,
      vars: Object.keys(vars).length,
      formWidthMode: this.formWidthMode,
      formWidthSaveBadge: TD_FORM_WIDTH_SAVE_BADGE,
      mergedFullCssLength: mergedFullCss.length,
    });
    return { vars, mergedNonVarCss, mergedFullCss };
  }

  private buildVarCss(vars: Record<string, string>): string {
    const keys = Object.keys(vars).filter((key) => key && vars[key] != null && vars[key] !== '');
    if (!keys.length) return '';
    const declarations = keys.map((key) => `${key}:${vars[key]}`).join(';');
    return `:root{${declarations}}\n.mf-form-wrapper{${declarations}}\n.mfp{${declarations}}\n[class*="mf-theme-"]{${declarations}}`;
  }

  private createCssModel(): CssRuleModel {
    return { raw: [], rawSet: {}, scopes: [], scopeMap: {} };
  }

  private ensureScope(model: CssRuleModel, scope: string): CssScopeModel {
    const key = scope || '';
    if (!model.scopeMap[key]) {
      model.scopeMap[key] = { selectors: [], selectorMap: {} };
      model.scopes.push(key);
    }
    return model.scopeMap[key];
  }

  private ensureSelector(scope: CssScopeModel, selector: string): CssSelectorModel {
    if (!scope.selectorMap[selector]) {
      scope.selectorMap[selector] = { props: [], propMap: {} };
      scope.selectors.push(selector);
    }
    return scope.selectorMap[selector];
  }

  private addDecl(model: CssRuleModel, scope: string, selector: string, prop: string, value: string): void {
    if (!selector || !prop || value == null || value === '') return;
    const scopeModel = this.ensureScope(model, scope);
    const selectorModel = this.ensureSelector(scopeModel, selector);
    if (selectorModel.propMap[prop] == null) selectorModel.props.push(prop);
    selectorModel.propMap[prop] = value;
  }

  private addRaw(model: CssRuleModel, cssText: string): void {
    const text = String(cssText || '').trim();
    if (!text || model.rawSet[text]) return;
    model.rawSet[text] = true;
    model.raw.push(text);
  }

  private walkRules(rules: CSSRuleList | undefined, scope: string, model: CssRuleModel): void {
    if (!rules) return;
    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index];
      if (!rule) continue;

      const typedRule = rule as CSSStyleRule & CSSMediaRule & CSSSupportsRule;
      if (rule.type === CSSRule.STYLE_RULE && typedRule.selectorText) {
        for (let propertyIndex = 0; propertyIndex < typedRule.style.length; propertyIndex += 1) {
          const property = typedRule.style[propertyIndex];
          const value = typedRule.style.getPropertyValue(property).trim();
          const priority = typedRule.style.getPropertyPriority(property);
          this.addDecl(model, scope, typedRule.selectorText, property, priority ? `${value} !important` : value);
        }
        continue;
      }

      const nestedRules = 'cssRules' in typedRule ? typedRule.cssRules : undefined;
      if (nestedRules && nestedRules.length) {
        let prelude = '';
        if (rule.type === CSSRule.MEDIA_RULE && typedRule.conditionText) {
          prelude = `@media ${typedRule.conditionText}`;
        } else if (rule.type === CSSRule.SUPPORTS_RULE && typedRule.conditionText) {
          prelude = `@supports ${typedRule.conditionText}`;
        } else if (rule.cssText.includes('{')) {
          prelude = rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
        }
        this.walkRules(nestedRules, prelude || scope, model);
        continue;
      }

      if (rule.cssText) {
        this.addRaw(model, rule.cssText);
      }
    }
  }

  private parseCssIntoModel(text: string, model: CssRuleModel): void {
    const css = String(text || '').trim();
    if (!css) return;

    const style = document.createElement('style');
    style.setAttribute('data-td-merge', '1');
    style.textContent = css;
    document.head.appendChild(style);
    try {
      if (!style.sheet) {
        this.addRaw(model, css);
        return;
      }
      this.walkRules(style.sheet.cssRules, '', model);
    } catch {
      this.addRaw(model, css);
    } finally {
      style.remove();
    }
  }

  private buildCss(model: CssRuleModel, options: { includeVarProps?: boolean }): string {
    const includeVarProps = options.includeVarProps !== false;
    const output: string[] = [];

    model.raw.forEach((raw) => output.push(raw));
    model.scopes.forEach((scope) => {
      const scopeModel = model.scopeMap[scope];
      if (!scopeModel) return;

      const innerBlocks: string[] = [];
      scopeModel.selectors.forEach((selector) => {
        const selectorModel = scopeModel.selectorMap[selector];
        if (!selectorModel) return;
        const props: string[] = [];
        selectorModel.props.forEach((prop) => {
          if (!includeVarProps && prop.startsWith('--mf-')) return;
          const value = selectorModel.propMap[prop];
          if (value == null || value === '') return;
          props.push(`  ${prop}: ${value};`);
        });
        if (!props.length) return;
        innerBlocks.push(`${selector} {\n${props.join('\n')}\n}`);
      });

      if (!innerBlocks.length) return;
      output.push(scope ? `${scope} {\n${innerBlocks.join('\n')}\n}` : innerBlocks.join('\n'));
    });

    return output.join('\n\n').trim();
  }

  private buildTintScale(baseHex: string): Array<{ name: number; hex: string }> {
    const [r, g, b] = this.hexToRgb(baseHex);
    const mixes = [
      { name: 50, mix: 0.95 },
      { name: 100, mix: 0.9 },
      { name: 200, mix: 0.75 },
      { name: 300, mix: 0.6 },
      { name: 400, mix: 0.4 },
      { name: 500, mix: 0 },
      { name: 600, mix: -0.15 },
      { name: 700, mix: -0.3 },
      { name: 800, mix: -0.45 },
      { name: 900, mix: -0.6 },
    ];

    return mixes.map(({ name, mix }) => {
      let nextR = r;
      let nextG = g;
      let nextB = b;
      if (mix > 0) {
        nextR = Math.round(r + (255 - r) * mix);
        nextG = Math.round(g + (255 - g) * mix);
        nextB = Math.round(b + (255 - b) * mix);
      } else if (mix < 0) {
        const factor = 1 + mix;
        nextR = Math.round(r * factor);
        nextG = Math.round(g * factor);
        nextB = Math.round(b * factor);
      }
      return { name, hex: `#${this.rgbToHex(nextR, nextG, nextB)}` };
    });
  }

  private rotateHue(hex: string, degrees: number): string {
    const [r, g, b] = this.hexToRgb(hex);
    const [h, s, v] = this.rgbToHsv(r, g, b);
    const [nextR, nextG, nextB] = this.hsvToRgb((h + degrees) % 360, s, v);
    return `#${this.rgbToHex(nextR, nextG, nextB)}`;
  }

  private scaleColor(hex: string, factor: number): string {
    const [r, g, b] = this.hexToRgb(hex);
    return `#${this.rgbToHex(
      Math.max(0, Math.min(255, Math.round(r * factor))),
      Math.max(0, Math.min(255, Math.round(g * factor))),
      Math.max(0, Math.min(255, Math.round(b * factor))),
    )}`;
  }

  private hexToRgb(hex: string): [number, number, number] {
    let value = hex.replace('#', '').trim();
    if (value.length === 3) {
      value = value.split('').map((char) => `${char}${char}`).join('');
    }
    const numeric = Number.parseInt(value, 16);
    return [
      (numeric >> 16) & 255,
      (numeric >> 8) & 255,
      numeric & 255,
    ];
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const toPart = (value: number): string => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0').toUpperCase();
    return `${toPart(r)}${toPart(g)}${toPart(b)}`;
  }

  private rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;

    let hue = 0;
    const saturation = max === 0 ? 0 : delta / max;
    const value = max;

    if (delta !== 0) {
      if (max === red) {
        hue = ((green - blue) / delta) % 6;
      } else if (max === green) {
        hue = (blue - red) / delta + 2;
      } else {
        hue = (red - green) / delta + 4;
      }
      hue = Math.round(hue * 60);
      if (hue < 0) hue += 360;
    }

    return [hue, Math.round(saturation * 100), Math.round(value * 100)];
  }

  private hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const saturation = s / 100;
    const value = v / 100;
    const chroma = value * saturation;
    const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
    const m = value - chroma;

    let red = 0;
    let green = 0;
    let blue = 0;

    if (h < 60) {
      red = chroma; green = x;
    } else if (h < 120) {
      red = x; green = chroma;
    } else if (h < 180) {
      green = chroma; blue = x;
    } else if (h < 240) {
      green = x; blue = chroma;
    } else if (h < 300) {
      red = x; blue = chroma;
    } else {
      red = chroma; blue = x;
    }

    return [
      Math.round((red + m) * 255),
      Math.round((green + m) * 255),
      Math.round((blue + m) * 255),
    ];
  }

  private rememberRecentColor(hex: string): void {
    const normalized = hex.startsWith('#') ? hex : `#${hex}`;
    this.recentColors = [normalized, ...this.recentColors.filter((item) => item !== normalized)].slice(0, 8);
    this.renderRecentSwatches();
  }

  private toast(message: string, type: 'success' | 'error' = 'success'): void {
    const toast = document.createElement('div');
    toast.className = `td-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    window.setTimeout(() => {
      toast.classList.remove('show');
      window.setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  private debugApplyOverride(selector: string, prop: string, value: string): void {
    const doc = this.getPreviewDocument();
    let matches = 0;
    let computed = '';
    try {
      if (doc) {
        matches = doc.querySelectorAll(selector).length;
        const first = doc.querySelector(selector);
        if (first) {
          computed = doc.defaultView?.getComputedStyle(first).getPropertyValue(prop) || '';
        }
      }
    } catch (error) {
      console.warn('[TD] applyStyleOverride match error', error);
    }
    console.log('[TD] applyStyleOverride', selector, prop, value, 'matches=', matches, 'computed=', computed, 'liveCssLen=', this.getLiveCustomCss().length, 'inspectorCssLen=', this.getInspectorCss().length, 'baseCssLen=', (this.currentBaseCss || '').length);
  }

  private byId<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
  }

  private queryAll<T extends Element>(selector: string): T[] {
    return Array.from(document.querySelectorAll(selector)) as T[];
  }

  private toggleDisplay(id: string, visible: boolean): void {
    const element = this.byId<HTMLElement>(id);
    if (element) element.style.display = visible ? '' : 'none';
  }

  private deepClone<T>(value: T): T {
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }
}

function renderBootError(error: unknown): void {
  const root = document.getElementById('td-root');
  if (!root) return;
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown Theme Designer error');
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:24px;font-family:Inter,system-ui,sans-serif;">
      <div style="max-width:760px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.08);padding:24px 24px 20px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="width:44px;height:44px;border-radius:12px;background:#fee2e2;color:#b91c1c;display:flex;align-items:center;justify-content:center;font-size:20px;">!</div>
          <div>
            <div style="font-size:20px;font-weight:700;color:#0f172a;">Theme Designer failed to start</div>
            <div style="font-size:13px;color:#64748b;margin-top:4px;">The Vite bundle loaded, but bootstrapping hit a runtime error. Build: ${BUILD_MARKER}</div>
          </div>
        </div>
        <div style="font-size:13px;line-height:1.55;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;white-space:pre-wrap;word-break:break-word;">${message}</div>
      </div>
    </div>`;
}

function bootThemeDesigner(): void {
  const root = document.getElementById('td-root');
  if (!root) return;
  new ThemeDesignerApp(root).start();
}

try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootThemeDesigner, { once: true });
  } else {
    bootThemeDesigner();
  }
} catch (error) {
  console.error('[MegaForm.ThemeDesigner] boot failed', error);
  renderBootError(error);
}
