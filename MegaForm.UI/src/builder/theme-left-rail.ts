/* ─────────────────────────────────────────────────────────────────────
   MegaForm Builder — Left-Rail Theme Utility Tools (B56)
   File:   src/builder/theme-left-rail.ts
   Author: B (B56 — Restore LEFT panel with utility tools that COMPLEMENT
                  the right-rail Theme inspector, not duplicate it)

   PURPOSE
   ───────
   The Builder LEFT rail normally shows the field palette
   (BASIC | LAYOUT | WIDGETS). When the user activates the THEME tab on
   the RIGHT rail (added by Author A), the LEFT rail swaps content to
   utility tools that the right rail does NOT offer:

       IMAGES | FONTS | INSPECT | STRUCTURE

   B53 mistakenly hid the entire left rail in theme mode (display:none),
   and the prior pane content (PRESETS / ELEMENTS / COLORS / STRUCTURE)
   was a duplicate of the right-rail inspector. B56 restores the swap
   pattern from pre-B53 but with FRESH content focused on free-form
   utility tools (image upload + gallery picker delegating to Token
   Designer, font preview chooser, DOM element picker / inspector, and
   a custom-HTML structure tree).

   DECOUPLING
   ──────────
   This module does NOT import Author A's tab code. Instead it listens
   to two CustomEvents on `document` / `window`:
       'mf:theme-tab-activated'    →  showThemeLeftRail()
       'mf:theme-tab-deactivated'  →  showPaletteLeftRail()
   Author A only has to fire these events from the activateTab() hook.

   COMPLEMENT (NOT DUPLICATE)
   ──────────────────────────
   The right rail OWNS presets, color swatches, element-specific
   inspectors and the customCss / HTML textareas. The left rail offers:
     - IMAGES   : Upload + Gallery picker (Token Designer helpers reused
                  via window.MFTokenDesigner). Picked URL fires the
                  CustomEvent 'mf:theme-image-pick' AND sets
                  --mf-form-bg-image via MFThemeTabAdapter (live preview).
     - FONTS    : 8 reference font tiles, each rendered with the actual
                  font family so the user previews "Inter", "Playfair",
                  "Roboto Mono", etc. Click fires 'mf:theme-font-pick'
                  and sets --mf-font-family.
     - INSPECT  : "Pick element" toggle. Activates body.mf-theme-inspect-mode
                  → iframe shows crosshair cursor. Iframe posts back the
                  clicked selector + computed style sample, displayed in
                  the left rail as a breadcrumb + key/value list. Fires
                  'mf:theme-inspect-element'.
     - STRUCTURE: Lazy-imports ThemeDesignerTemplateTree mounted against
                  the current customHtml draft. Fires 'mf:theme-structure-focus'
                  on node click. (Carry-over from pre-B53 since this DOES
                  add value the right rail lacks — visual tree of nested
                  customHtml regions.)

   ANIMATION
   ─────────
   Fade-out → swap → fade-in via canonical `--mf-input-transition`.

   STATE
   ─────
   The original palette HTML is captured ONCE on first swap so plugin-
   injected widgets are preserved verbatim on restore.
   ───────────────────────────────────────────────────────────────────── */

import { ThemeDesignerTemplateTree } from '../theme-designer/inspector-structure-template-tree';

/* ── 1. Module-scoped state ────────────────────────────────────────── */

type LeftRailMode = 'palette' | 'theme';
// [B68] Mock-aligned: visible tabs are Presets / Elements / Colors. Legacy
// images / fonts / inspect / structure types stay in the union so any
// existing event listeners or saved-state restore paths still type-check
// against the same enum; switchTab() routes them to the matching pane.
type ThemeUtilityTab = 'presets' | 'elements' | 'colors' | 'images' | 'fonts' | 'inspect' | 'structure';

interface ThemeLeftRailState {
  /** snapshot of `.mf-panel-left` innerHTML BEFORE first swap */
  paletteHtmlSnapshot: string | null;
  /** snapshot of the original `id` on the panel (always `mf-panel-left`) */
  paletteIdSnapshot: string | null;
  /** lazy-mounted structure tree (mounted only on first STRUCTURE click) */
  structureTree: ThemeDesignerTemplateTree | null;
  /** currently visible left-rail mode */
  mode: LeftRailMode;
  /** currently active sub-tab inside the utility nav */
  activeTab: ThemeUtilityTab;
  /** Inspect-mode flag (body class echoes this) */
  inspectModeOn: boolean;
  /** Last URL chosen from the gallery / upload */
  lastImageUrl: string;
  /** Last font picked from the FONTS tab */
  lastFontFamily: string;
  /** Last selector that was picked via INSPECT — used for live edits */
  lastPickedSelector: string;
  /** Snapshot of the last picked element's computed styles */
  lastPickedStyles: Record<string, string>;
}

const state: ThemeLeftRailState = {
  paletteHtmlSnapshot: null,
  paletteIdSnapshot: null,
  structureTree: null,
  mode: 'palette',
  activeTab: 'presets',
  inspectModeOn: false,
  lastImageUrl: '',
  lastFontFamily: '',
  lastPickedSelector: '',
  lastPickedStyles: {},
};

/* ── 2a. Theme-var map ────────────────────────────────────────────── */

/**
 * Map of CSS property → :root design-token CSS variable. When a user edits
 * one of these in the INSPECT pane, ALSO update the :root var so the change
 * propagates across the whole form (and other elements sharing the token).
 *
 * Keys are normalized to lowercase kebab-case (matches the keys returned by
 * INSPECT_KEYS in canvas.ts bootstrap).
 */
const THEME_VAR_MAP: Record<string, string> = {
  'color':            '--mf-primary',
  'background-color': '--mf-form-bg',
  'background':       '--mf-form-bg',
  'background-image': '--mf-form-bg-image',
  'font-family':      '--mf-font-family',
  'font-size':        '--mf-font-size',
  'font-weight':      '--mf-font-weight',
  'line-height':      '--mf-line-height',
  'letter-spacing':   '--mf-letter-spacing',
  'border-radius':    '--mf-border-radius',
  'box-shadow':       '--mf-shadow',
};

/* ── 2. Reference data ─────────────────────────────────────────────── */

/**
 * 8 reference fonts that ship with most browsers / Google Fonts loader.
 * Each tile renders its own name using the font itself so the user can
 * preview the typography before picking.
 */
const REFERENCE_FONTS: Array<{ id: string; label: string; family: string; category: string }> = [
  { id: 'system',    label: 'System UI',  family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', category: 'Sans' },
  { id: 'inter',     label: 'Inter',      family: '"Inter", "Helvetica Neue", Arial, sans-serif',            category: 'Sans' },
  { id: 'roboto',    label: 'Roboto',     family: '"Roboto", Arial, sans-serif',                             category: 'Sans' },
  { id: 'opensans',  label: 'Open Sans',  family: '"Open Sans", Arial, sans-serif',                          category: 'Sans' },
  { id: 'playfair',  label: 'Playfair',   family: '"Playfair Display", Georgia, serif',                      category: 'Serif' },
  { id: 'merriwthr', label: 'Merriweather',family:'"Merriweather", Georgia, serif',                          category: 'Serif' },
  { id: 'mono',      label: 'Roboto Mono',family: '"Roboto Mono", "Courier New", monospace',                 category: 'Mono' },
  { id: 'poppins',   label: 'Poppins',    family: '"Poppins", "Segoe UI", sans-serif',                       category: 'Sans' },
];

/* ── 3. PUBLIC API ────────────────────────────────────────────────── */

/**
 * Swap the LEFT rail to the Theme Utility Tools view.
 *
 * B56: Restored the swap pattern (pre-B53 behaviour) but with NEW content
 * (IMAGES | FONTS | INSPECT | STRUCTURE) that complements the right rail
 * instead of duplicating its presets / colors / elements panes.
 *
 * Idempotent — calling twice in a row is a no-op.
 */
export function showThemeLeftRail(): void {
  const panel = getLeftPanel();
  if (!panel) return;
  if (state.mode === 'theme') return;

  // Snapshot original HTML ONCE so plugin widgets are preserved on restore.
  if (state.paletteHtmlSnapshot === null) {
    state.paletteHtmlSnapshot = panel.innerHTML;
    state.paletteIdSnapshot   = panel.id;
  }

  // Make sure the panel is visible (B53 may have hidden it).
  panel.style.display = '';
  panel.removeAttribute('data-mf-theme-rail-hidden');

  fadeSwap(panel, () => {
    panel.innerHTML = renderUtilityNavHtml();
    panel.setAttribute('data-mf-theme-rail-mode', 'utility');
    wireUtilityNav(panel);
  });

  ensureInspectCssInstalled();
  state.mode = 'theme';
}

/**
 * Restore the LEFT rail's original palette HTML on exit from Theme mode.
 */
export function showPaletteLeftRail(): void {
  const panel = getLeftPanel();
  if (!panel) return;
  if (state.mode === 'palette') return;
  if (state.paletteHtmlSnapshot === null) return;

  // Turn off inspect mode if it was left on.
  setInspectMode(false);

  fadeSwap(panel, () => {
    panel.innerHTML = state.paletteHtmlSnapshot as string;
    if (state.paletteIdSnapshot) panel.id = state.paletteIdSnapshot;
    panel.removeAttribute('data-mf-theme-rail-mode');
    panel.style.display = '';
    rebindPaletteTabs();
  });

  state.mode = 'palette';
}

/* ── 4. EVENT WIRING (decoupling bridge) ──────────────────────────── */

function installEventBridge(): void {
  if ((window as any).__MF_THEME_LEFT_RAIL_BRIDGE__) return;
  (window as any).__MF_THEME_LEFT_RAIL_BRIDGE__ = true;

  // Listen on BOTH window AND document so either dispatcher works.
  document.addEventListener('mf:theme-tab-activated',   () => showThemeLeftRail());
  document.addEventListener('mf:theme-tab-deactivated', () => showPaletteLeftRail());
  window.addEventListener('mf:theme-tab-activated',     () => showThemeLeftRail());
  window.addEventListener('mf:theme-tab-deactivated',   () => showPaletteLeftRail());

  // INSPECT-MODE iframe handshake: the iframe posts the clicked selector
  // back here. We render the result inside the INSPECT pane.
  window.addEventListener('message', (e: MessageEvent) => {
    const d: any = e && e.data;
    if (!d) return;
    if (d.type === 'mf-theme-inspect-pick') {
      renderInspectPick(d.selector || '', d.breadcrumb || [], d.styles || {});
    }
  }, false);

  // [2026-07-02] The CSS picker's Pick button now lives on the RIGHT-rail Inspector sub-tab.
  // The inspect engine (crosshair handshake + one-shot pick) still lives here, so the right
  // rail asks us to toggle it via this decoupled event. setInspectMode() echoes the state
  // back on 'mf:theme-inspect-mode' so the right Pick button can sync its label.
  document.addEventListener('mf:theme-request-inspect-mode', (e: Event) => {
    const on = !!((e as CustomEvent).detail && (e as CustomEvent).detail.on);
    setInspectMode(on);
  });
}

installEventBridge();

/* ── 5. RENDERING — utility nav shell ─────────────────────────────── */

function renderUtilityNavHtml(): string {
  const t = state.activeTab;
  // [B68] Default to 'presets' if a legacy tab value is restored from state
  // (legacy = images / fonts / inspect / structure). The 3 new tabs are the
  // mock-aligned surfaces; legacy panes still render below for any caller
  // that needs them via state restore, but the visible strip only shows the
  // new three.
  // [2026-07-02] Elements + Colors tabs removed (unfinished / unused). Only Presets
  // remains on the left; the CSS picker + inspector now live on the RIGHT rail's
  // Inspector sub-tab. The elements/colors panes stay mounted (hidden) so any legacy
  // wireup keeps type-checking, but they are never shown.
  const visibleTabs: ThemeUtilityTab[] = ['presets'];
  const safeActive: ThemeUtilityTab = (visibleTabs.indexOf(t) >= 0 ? t : 'presets');
  return (
    '<div class="mf-panel-header">' +
      '<div class="mf-panel-header-top">' +
        '<h4 class="mf-elements-title" style="display:flex;align-items:center;gap:8px;margin:0">' +
          '<i class="fas fa-palette" style="color:#8b5cf6"></i> Design Tools' +
        '</h4>' +
        '<a href="#" id="mf-left-collapse-btn" class="mf-close-btn" title="Close">&#x2715;</a>' +
      '</div>' +
    '</div>' +

    // [B68] Utility-nav strip — 3 tabs matching the mock at
    // localhost:3000/builder?mode=design (Presets / Elements / Colors).
    '<div class="mf-palette-tabs mf-theme-nav-tabs" role="tablist">' +
      navTab('presets',  'Presets',  safeActive === 'presets') +
    '</div>' +

    // Body — one container per visible tab; only the active one shows.
    // Legacy panes still mounted as hidden divs so any external query that
    // expects them (e.g. INSPECT iframe handshake) keeps working.
    '<div class="mf-panel-body">' +
      '<div class="mf-palette-cat mf-theme-pane" id="mf-tlr-pane-presets"'  + paneVis('presets',  safeActive) + '>' + renderPresetsPane()  + '</div>' +
      // [2026-07-02] Elements + Colors panes hidden (tabs removed). Kept mounted for
      // backward-compat wireup only; the picker/inspector now lives on the right rail.
      '<div class="mf-palette-cat mf-theme-pane" id="mf-tlr-pane-elements" style="display:none">' + renderElementsPane() + '</div>' +
      '<div class="mf-palette-cat mf-theme-pane" id="mf-tlr-pane-colors"   style="display:none">' + renderColorsPane()   + '</div>' +
      // Legacy hidden panes — kept for backward compat (INSPECT iframe handshake, etc.).
      '<div class="mf-palette-cat mf-theme-pane" id="mf-tlr-pane-images"    style="display:none">' + renderImagesPane()    + '</div>' +
      '<div class="mf-palette-cat mf-theme-pane" id="mf-tlr-pane-fonts"     style="display:none">' + renderFontsPane()     + '</div>' +
      '<div class="mf-palette-cat mf-theme-pane" id="mf-tlr-pane-inspect"   style="display:none">' + renderInspectPane()   + '</div>' +
      '<div class="mf-palette-cat mf-theme-pane" id="mf-tlr-pane-structure" style="display:none">' + renderStructurePane() + '</div>' +
    '</div>'
  );
}

/* ── 5e. Pane: PRESETS (B76 — ported 1:1 from the user's VERCEL mock at
 *           E:/DNNDEFENDER.../VERCEL_mega_form-admin-redesign/components/
 *           theme-designer/theme-designer-body.tsx ─────────────────────
 * Mock parity:
 *   - 16 presets (Default, Ocean, Forest, Sunset, Lavender, Midnight Pro,
 *     Rose Pro, Amber, Slate, Emerald Pro, Coral New, Cyber New, Carbon Pro,
 *     Arctic, Berry New, Earth) — each carries 4 swatch colors + badge +
 *     category + popular flag
 *   - 8 category chips with icons (All / Popular / Minimal / Nature / Warm /
 *     Dark / Elegant / Modern)
 *   - Search input with pipette icon
 *   - Grid/list view-mode toggle
 *   - Live "N themes" count bar
 * Each tile click delegates to MFThemeTabAdapter.setPreset(id) so
 * persistence + canvas + right rail stay in lock-step. */
function renderPresetsPane(): string {
  // 16 mock-aligned presets. Each has 4-color swatch (matching mock's c1/c2/c3/c4
  // gradient strip), category + popular flag for filter, optional badge.
  var presets: Array<{ id: string; name: string; colors: string[]; badge: string; category: string; style: string; popular: boolean }> = [
    { id: 'default',  name: 'Default',  colors: ['#3b82f6','#1e293b','#f8fafc','#e2e8f0'], badge: '',    category: 'minimal', style: 'light', popular: true  },
    { id: 'ocean',    name: 'Ocean',    colors: ['#0ea5e9','#0c4a6e','#f0f9ff','#bae6fd'], badge: '',    category: 'nature',  style: 'light', popular: true  },
    { id: 'forest',   name: 'Forest',   colors: ['#22c55e','#14532d','#f0fdf4','#bbf7d0'], badge: '',    category: 'nature',  style: 'light', popular: false },
    { id: 'sunset',   name: 'Sunset',   colors: ['#f97316','#7c2d12','#fff7ed','#fed7aa'], badge: '',    category: 'warm',    style: 'light', popular: false },
    { id: 'lavender', name: 'Lavender', colors: ['#a855f7','#581c87','#faf5ff','#e9d5ff'], badge: '',    category: 'elegant', style: 'light', popular: true  },
    { id: 'midnight', name: 'Midnight', colors: ['#6366f1','#1e1b4b','#eef2ff','#c7d2fe'], badge: 'Pro', category: 'dark',    style: 'dark',  popular: true  },
    { id: 'rose',     name: 'Rose',     colors: ['#ec4899','#831843','#fdf2f8','#fbcfe8'], badge: 'Pro', category: 'elegant', style: 'light', popular: false },
    { id: 'amber',    name: 'Amber',    colors: ['#f59e0b','#78350f','#fffbeb','#fde68a'], badge: '',    category: 'warm',    style: 'light', popular: false },
    { id: 'slate',    name: 'Slate',    colors: ['#64748b','#0f172a','#f8fafc','#cbd5e1'], badge: '',    category: 'minimal', style: 'light', popular: true  },
    { id: 'emerald',  name: 'Emerald',  colors: ['#10b981','#064e3b','#ecfdf5','#a7f3d0'], badge: 'Pro', category: 'nature',  style: 'light', popular: false },
    { id: 'coral',    name: 'Coral',    colors: ['#fb7185','#881337','#fff1f2','#fecdd3'], badge: 'New', category: 'warm',    style: 'light', popular: false },
    { id: 'cyber',    name: 'Cyber',    colors: ['#22d3ee','#164e63','#ecfeff','#a5f3fc'], badge: 'New', category: 'modern',  style: 'dark',  popular: true  },
    { id: 'carbon',   name: 'Carbon',   colors: ['#18181b','#3f3f46','#27272a','#52525b'], badge: 'Pro', category: 'dark',    style: 'dark',  popular: true  },
    { id: 'arctic',   name: 'Arctic',   colors: ['#0891b2','#155e75','#ecfeff','#cffafe'], badge: '',    category: 'minimal', style: 'light', popular: false },
    { id: 'berry',    name: 'Berry',    colors: ['#c026d3','#701a75','#fdf4ff','#f5d0fe'], badge: 'New', category: 'elegant', style: 'light', popular: false },
    { id: 'earth',    name: 'Earth',    colors: ['#a16207','#713f12','#fefce8','#fef08a'], badge: '',    category: 'nature',  style: 'light', popular: false },
  ];

  // 8 category chips with FontAwesome icons (lucide-react equivalents)
  var categories: Array<{ id: string; label: string; icon: string }> = [
    { id: 'all',     label: 'All',     icon: 'fa-th-large' },
    { id: 'popular', label: 'Popular', icon: 'fa-star'     },
    { id: 'minimal', label: 'Minimal', icon: 'fa-square'   },
    { id: 'nature',  label: 'Nature',  icon: 'fa-leaf'     },
    { id: 'warm',    label: 'Warm',    icon: 'fa-sun'      },
    { id: 'dark',    label: 'Dark',    icon: 'fa-moon'     },
    { id: 'elegant', label: 'Elegant', icon: 'fa-gem'      },
    { id: 'modern',  label: 'Modern',  icon: 'fa-bolt'     },
  ];

  var chipHtml = categories.map(function (c) {
    return '<button type="button" class="mf-tlr-chip' + (c.id === 'all' ? ' active' : '') + '" data-chip="' + escapeAttr(c.id) + '">' +
      '<i class="fas ' + c.icon + '"></i>' +
      '<span>' + escapeHtml(c.label) + '</span>' +
    '</button>';
  }).join('');

  // Build tile HTML. Each preset gets data-* attrs so filter can read tags
  // without re-querying the array. Badge pill rendered top-right.
  var tiles = presets.map(function (p) {
    var swatches = p.colors.map(function (hex) {
      return '<span style="background:' + escapeAttr(hex) + '"></span>';
    }).join('');
    var badgeHtml = p.badge
      ? '<span class="mf-tlr-preset-badge mf-tlr-preset-badge-' + escapeAttr(p.badge.toLowerCase()) + '">' + escapeHtml(p.badge) + '</span>'
      : '';
    var tagAttr = (p.popular ? 'popular ' : '') + p.category;
    return (
      '<button type="button" class="mf-tlr-preset-tile" data-preset-id="' + escapeAttr(p.id) + '" data-preset-category="' + escapeAttr(p.category) + '" data-preset-popular="' + (p.popular ? '1' : '0') + '" data-preset-tags="' + escapeAttr(tagAttr) + '" data-preset-name="' + escapeAttr(p.name.toLowerCase()) + '" data-preset-c1="' + escapeAttr(p.colors[0] || '#6366f1') + '" data-preset-c2="' + escapeAttr(p.colors[1] || '#1e293b') + '" data-preset-c3="' + escapeAttr(p.colors[2] || '#f8fafc') + '" data-preset-c4="' + escapeAttr(p.colors[3] || '#e2e8f0') + '" title="' + escapeAttr(p.name) + '">' +
        '<div class="mf-tlr-preset-swatches">' + swatches + '</div>' +
        '<div class="mf-tlr-preset-check"><i class="fas fa-check"></i></div>' +
        '<div class="mf-tlr-preset-footer">' +
          '<span class="mf-tlr-preset-name">' + escapeHtml(p.name) + '</span>' +
          badgeHtml +
        '</div>' +
      '</button>'
    );
  }).join('');

  return (
    // [Mock parity] Header row: Search input (pipette icon) + grid/list toggle
    '<div class="mf-tlr-presets-pane">' +
      '<div class="mf-tlr-presets-search-row">' +
        '<div class="mf-tlr-search-wrap">' +
          '<i class="fas fa-eye-dropper mf-tlr-search-icon"></i>' +
          '<input type="search" class="mf-tlr-preset-search" id="mf-tlr-preset-search" placeholder="Search themes..." autocomplete="off"/>' +
        '</div>' +
        '<div class="mf-tlr-view-toggle" id="mf-tlr-view-toggle" role="group" aria-label="View mode">' +
          '<button type="button" class="mf-tlr-view-btn is-active" data-view="grid" title="Grid view"><i class="fas fa-th"></i></button>' +
          '<button type="button" class="mf-tlr-view-btn" data-view="list" title="List view"><i class="fas fa-list"></i></button>' +
        '</div>' +
      '</div>' +

      // [Mock parity] Category chip strip — 2-row wrap, 4 per row
      '<div class="mf-tlr-chip-strip" id="mf-tlr-chip-strip">' + chipHtml + '</div>' +

      // [Mock parity] "N themes" live count bar
      '<div class="mf-tlr-presets-count-bar">' +
        '<span class="mf-tlr-presets-count" id="mf-tlr-presets-count">' + presets.length + ' themes</span>' +
      '</div>' +

      // [Mock parity] Tile grid (toggles to .is-list when list view active)
      '<div class="mf-tlr-preset-grid" id="mf-tlr-preset-grid">' + tiles + '</div>' +
    '</div>'
  );
}

/* ── 5f. Pane: ELEMENTS (B68) ─────────────────────────────────────────
 * Lightweight chooser — clicking an element label highlights the
 * matching node on the canvas and scrolls the right-rail Theme panel to
 * the relevant section. For B68 we ship the chooser; deep wiring to the
 * right rail focus follows in B69. */
function renderElementsPane(): string {
  // [B76 mock parity] 14 form-control types, each with FontAwesome icon
  // (lucide-react equivalent), category, and target CSS selector for the
  // form preview. Click → setSelectedElement(id) → emits mf:theme-element-
  // picked which the right-rail Inspector tab consumes.
  var elements: Array<{ key: string; label: string; icon: string; category: string; selector: string }> = [
    { key: 'text-input',   label: 'Text Input',       icon: 'fa-i-cursor',         category: 'inputs',  selector: 'input[type=text], input[type=email], input[type=url], .mf-input' },
    { key: 'textarea',     label: 'Text Area',        icon: 'fa-align-left',       category: 'inputs',  selector: 'textarea, .mf-textarea' },
    { key: 'select',       label: 'Select/Dropdown',  icon: 'fa-chevron-down',     category: 'inputs',  selector: 'select, .mf-select' },
    { key: 'checkbox',     label: 'Checkbox',         icon: 'fa-check-square',     category: 'choices', selector: 'input[type=checkbox], .mf-checkbox' },
    { key: 'radio',        label: 'Radio Button',     icon: 'fa-circle-dot',       category: 'choices', selector: 'input[type=radio], .mf-radio' },
    { key: 'toggle',       label: 'Toggle Switch',    icon: 'fa-toggle-on',        category: 'choices', selector: '.mf-toggle, .mf-evoq-toggle' },
    { key: 'button',       label: 'Button',           icon: 'fa-mouse-pointer',    category: 'actions', selector: 'button, .mf-btn, button[type=submit]' },
    { key: 'date-picker',  label: 'Date Picker',      icon: 'fa-calendar',         category: 'inputs',  selector: 'input[type=date], .mf-date-picker' },
    { key: 'file-upload',  label: 'File Upload',      icon: 'fa-file-upload',      category: 'inputs',  selector: 'input[type=file], .mf-file-upload' },
    { key: 'rating',       label: 'Rating',           icon: 'fa-star',             category: 'special', selector: '.mf-rating, .mf-rating-suite' },
    { key: 'label',        label: 'Label',            icon: 'fa-font',             category: 'layout',  selector: 'label, .mf-label' },
    { key: 'heading',      label: 'Heading',          icon: 'fa-heading',          category: 'layout',  selector: 'h1, h2, h3, .mf-form-title' },
    { key: 'divider',      label: 'Divider',          icon: 'fa-minus',            category: 'layout',  selector: 'hr, .mf-divider' },
    { key: 'card',         label: 'Card/Section',     icon: 'fa-credit-card',      category: 'layout',  selector: '.mf-form, .mf-section' },
  ];
  var rows = elements.map(function (el) {
    return (
      '<button type="button" class="mf-tlr-element-row" data-element-key="' + escapeAttr(el.key) + '" data-element-category="' + escapeAttr(el.category) + '" data-element-sel="' + escapeAttr(el.selector) + '">' +
        '<span class="mf-tlr-element-icon"><i class="fas ' + el.icon + '"></i></span>' +
        '<span class="mf-tlr-element-name">' + escapeHtml(el.label) + '</span>' +
      '</button>'
    );
  }).join('');
  return (
    '<div class="mf-tlr-elements-pane">' +
      '<div class="mf-tlr-elements-hint">Select a form element to inspect and style.</div>' +
      '<div class="mf-tlr-element-list" id="mf-tlr-element-list">' + rows + '</div>' +
    '</div>'
  );
}

/* ── 5g. Pane: COLORS (B73) ───────────────────────────────────────────
 * Mock-aligned Colors tab: Color Palette with Pick button, Quick Colors
 * grid, Brand Colors expandable, Surface Colors. CSS picker lives here.
 * When user picks an element, detected styles populate the Inspector
 * sub-tab in the right-rail Theme Designer instead of cluttering left. */
function renderColorsPane(): string {
  // [B76 mock parity] 5 expandable color categories sourced from the user's
  // VERCEL mock theme-designer-body.tsx. Each category is a Collapsible in
  // the mock; here we use a button + display:none body. expandedCategory
  // state controls which one is open (default = 'brand' to mirror mock).
  type ColorEntry = { key: string; label: string; value: string; description: string };
  type ColorCategory = { id: string; name: string; icon: string; defaultOpen?: boolean; colors: ColorEntry[] };
  var categories: ColorCategory[] = [
    {
      id: 'brand', name: 'Brand Colors', icon: 'fa-magic', defaultOpen: true,
      colors: [
        { key: 'primary',       label: 'Primary',       value: '#3b82f6', description: 'Main action color' },
        { key: 'primary-hover', label: 'Primary Hover', value: '#2563eb', description: 'Hover state' },
        { key: 'primary-light', label: 'Primary Light', value: '#dbeafe', description: 'Light variant' },
        { key: 'secondary',     label: 'Secondary',     value: '#64748b', description: 'Secondary actions' },
        { key: 'accent',        label: 'Accent',        value: '#8b5cf6', description: 'Highlight elements' },
      ],
    },
    {
      id: 'surface', name: 'Surface Colors', icon: 'fa-layer-group',
      colors: [
        { key: 'background',    label: 'Background',    value: '#ffffff', description: 'Page background' },
        { key: 'surface',       label: 'Surface',       value: '#f8fafc', description: 'Card backgrounds' },
        { key: 'surface-raised',label: 'Surface Raised',value: '#f1f5f9', description: 'Elevated surfaces' },
        { key: 'border',        label: 'Border',        value: '#e2e8f0', description: 'Default borders' },
        { key: 'border-focus',  label: 'Border Focus',  value: '#3b82f6', description: 'Focus state' },
      ],
    },
    {
      id: 'text', name: 'Text Colors', icon: 'fa-font',
      colors: [
        { key: 'text-primary',   label: 'Text Primary',   value: '#0f172a', description: 'Headings & body' },
        { key: 'text-secondary', label: 'Text Secondary', value: '#475569', description: 'Subtext & meta' },
        { key: 'text-muted',     label: 'Text Muted',     value: '#94a3b8', description: 'Disabled / hints' },
        { key: 'text-inverse',   label: 'Text Inverse',   value: '#ffffff', description: 'Text on dark surfaces' },
      ],
    },
    {
      id: 'semantic', name: 'Semantic Colors', icon: 'fa-circle-dot',
      colors: [
        { key: 'success', label: 'Success', value: '#22c55e', description: 'Confirmation states' },
        { key: 'warning', label: 'Warning', value: '#f59e0b', description: 'Caution states' },
        { key: 'error',   label: 'Error',   value: '#ef4444', description: 'Destructive / error' },
        { key: 'info',    label: 'Info',    value: '#0ea5e9', description: 'Informational' },
      ],
    },
    {
      id: 'form-states', name: 'Form States', icon: 'fa-toggle-on',
      colors: [
        { key: 'state-default',  label: 'Default',  value: '#e2e8f0', description: 'Idle input border' },
        { key: 'state-hover',    label: 'Hover',    value: '#cbd5e1', description: 'Hover input border' },
        { key: 'state-focus',    label: 'Focus',    value: '#3b82f6', description: 'Active focus ring' },
        { key: 'state-disabled', label: 'Disabled', value: '#f1f5f9', description: 'Disabled fill' },
        { key: 'state-error',    label: 'Error',    value: '#ef4444', description: 'Invalid border' },
      ],
    },
  ];

  // [Mock parity] Quick Colors — 16 hex values, 2 rows of 8 (size-6 swatches)
  var quickColors = [
    '#ef4444','#f97316','#f59e0b','#eab308',
    '#84cc16','#22c55e','#10b981','#14b8a6',
    '#06b6d4','#0ea5e9','#3b82f6','#6366f1',
    '#8b5cf6','#a855f7','#d946ef','#ec4899',
  ];
  var quickGrid = quickColors.map(function (c) {
    return '<button type="button" class="mf-tlr-swatch mf-tlr-quick-swatch" data-swatch="' + escapeAttr(c) + '" style="background:' + escapeAttr(c) + '" title="' + escapeAttr(c) + '">' +
      '<span class="mf-tlr-sr-only">' + escapeHtml(c) + '</span>' +
    '</button>';
  }).join('');

  // Build each expandable category section
  var categoryHtml = categories.map(function (cat) {
    var open = !!cat.defaultOpen;
    var rows = cat.colors.map(function (col) {
      return (
        '<button type="button" class="mf-tlr-color-row-item" data-color-key="' + escapeAttr(col.key) + '" data-color-value="' + escapeAttr(col.value) + '">' +
          '<span class="mf-tlr-color-swatch" style="background:' + escapeAttr(col.value) + '"></span>' +
          '<span class="mf-tlr-color-info">' +
            '<span class="mf-tlr-color-name">' + escapeHtml(col.label) + '</span>' +
            '<span class="mf-tlr-color-desc">' + escapeHtml(col.description) + '</span>' +
          '</span>' +
          '<span class="mf-tlr-color-hex">' + escapeHtml(col.value) + '</span>' +
        '</button>'
      );
    }).join('');
    return (
      '<div class="mf-tlr-color-category' + (open ? ' is-open' : '') + '" data-cat-id="' + escapeAttr(cat.id) + '">' +
        '<button type="button" class="mf-tlr-color-cat-header" data-expand="cat-' + escapeAttr(cat.id) + '">' +
          '<i class="fas ' + cat.icon + ' mf-tlr-cat-icon"></i>' +
          '<span class="mf-tlr-cat-name">' + escapeHtml(cat.name) + '</span>' +
          '<span class="mf-tlr-cat-count">' + cat.colors.length + '</span>' +
          '<i class="fas fa-chevron-down mf-tlr-cat-chevron"></i>' +
        '</button>' +
        '<div class="mf-tlr-color-cat-body" id="mf-tlr-cat-' + escapeAttr(cat.id) + '-body"' +
          (open ? '' : ' style="display:none"') + '>' + rows + '</div>' +
      '</div>'
    );
  }).join('');

  return (
    '<div class="mf-tlr-colors-pane">' +
      // [Mock parity] COLOR PALETTE header with Pick eyedropper button
      '<div class="mf-tlr-pane-header">' +
        '<span class="mf-tlr-pane-title">COLOR PALETTE</span>' +
        '<button type="button" class="mf-tlr-pick-btn" id="mf-tlr-pick-btn" title="Click then pick any element on the form preview to inspect its CSS">' +
          '<i class="fas fa-eye-dropper"></i><span>Pick</span>' +
        '</button>' +
      '</div>' +

      // [Mock parity] QUICK COLORS section + Edit button
      '<div class="mf-tlr-sub-section">' +
        '<div class="mf-tlr-sub-header">' +
          '<span class="mf-tlr-sub-title">QUICK COLORS</span>' +
          '<button type="button" class="mf-tlr-edit-btn" id="mf-tlr-edit-quick" title="Customize quick colors">Edit</button>' +
        '</div>' +
        '<div class="mf-tlr-quick-grid" id="mf-tlr-swatch-grid">' + quickGrid + '</div>' +
      '</div>' +

      // [Mock parity] 5 expandable color category sections
      '<div class="mf-tlr-color-categories">' + categoryHtml + '</div>' +
    '</div>'
  );
}

function brandColorRow(key: string, label: string, hex: string, desc: string): string {
  return (
    '<div class="mf-tlr-brand-row" data-brand-key="' + escapeAttr(key) + '">' +
      '<div class="mf-tlr-brand-swatch" style="background:' + escapeAttr(hex) + '"></div>' +
      '<div class="mf-tlr-brand-info">' +
        '<div class="mf-tlr-brand-name">' + escapeHtml(label) + '</div>' +
        '<div class="mf-tlr-brand-desc">' + escapeHtml(desc) + '</div>' +
      '</div>' +
      '<div class="mf-tlr-brand-hex">' + escapeHtml(hex) + '</div>' +
    '</div>'
  );
}

// [P1-3 recheck] The left-rail Colors pane rows render with HARDCODED default
// values and were never re-synced, so after choosing a preset the panel still
// showed Default blue (#3b82f6/#2563eb/...). Map each row's data-color-key to the
// authoritative live{} CSS var and repaint the swatch + hex text. Called after a
// preset apply (and on Colors-tab open) so the panel reflects the real theme.
function updateColorsPaneFromLive(live: Record<string, string> | null | undefined): void {
  if (!live) return;
  var MAP: Record<string, string[]> = {
    'primary':        ['--mf-primary'],
    'primary-hover':  ['--mf-primary-hover', '--mf-btn-bg-hover', '--mf-btn-hover-bg'],
    'primary-light':  ['--mf-primary-light'],
    'secondary':      ['--mf-secondary'],
    'background':     ['--mf-page-bg', '--mf-form-bg'],
    'surface':        ['--mf-form-bg'],
    'surface-raised': ['--mf-section-bg'],
    'border':         ['--mf-border', '--mf-input-border-color'],
    'border-focus':   ['--mf-input-focus-border'],
    'text-primary':   ['--mf-title-color', '--mf-color-text', '--mf-text'],
    'text-secondary': ['--mf-label-color', '--mf-color-text-muted'],
    'text-muted':     ['--mf-color-text-muted'],
    'text-inverse':   ['--mf-color-text-inverse', '--mf-btn-color'],
    'state-default':  ['--mf-input-border-color', '--mf-border'],
    'state-focus':    ['--mf-input-focus-border'],
    'state-disabled': ['--mf-input-disabled-bg'],
  };
  try {
    var pane = document.getElementById('mf-tlr-pane-colors');
    if (!pane) return;
    var pick = function (vars: string[]): string {
      for (var i = 0; i < vars.length; i++) { var v = live[vars[i]]; if (v) return String(v); }
      return '';
    };
    pane.querySelectorAll<HTMLElement>('.mf-tlr-color-row-item').forEach(function (row) {
      var key = row.getAttribute('data-color-key') || '';
      var vars = MAP[key];
      if (!vars) return;
      var val = pick(vars);
      if (!val) return;
      var sw = row.querySelector<HTMLElement>('.mf-tlr-color-swatch');
      var hex = row.querySelector<HTMLElement>('.mf-tlr-color-hex');
      if (sw) sw.style.background = val;
      // Trim an 8-digit #rrggbbaa (e.g. --mf-primary-light) to #rrggbb for the label.
      if (hex) hex.textContent = (/^#[0-9a-fA-F]{8}$/.test(val) ? val.slice(0, 7) : val);
      row.setAttribute('data-color-value', val);
    });
  } catch (_e) { /* defensive */ }
}

function navTab(id: ThemeUtilityTab, label: string, active: boolean): string {
  // [B76 mock parity] Icons mirror the lucide-react choices in the mock:
  //   Presets  → GalleryHorizontal (closest FA: fa-images)
  //   Elements → Component         (closest FA: fa-puzzle-piece)
  //   Colors   → Palette           (FA equivalent: fa-palette)
  var icon = id === 'presets'  ? 'fa-th-large'       :
             id === 'elements' ? 'fa-cubes'          :
             id === 'colors'   ? 'fa-palette'        : 'fa-square';
  return (
    '<a href="#" class="mf-ptab mf-tlr-tab' + (active ? ' active' : '') + '" data-tlr-tab="' + id + '" role="tab" aria-selected="' + (active ? 'true' : 'false') + '">' +
      '<i class="fas ' + icon + ' mf-tlr-tab-icon"></i>' +
      '<span class="mf-tlr-tab-label">' + label + '</span>' +
    '</a>'
  );
}

function paneVis(id: ThemeUtilityTab, active: ThemeUtilityTab): string {
  return active === id ? '' : ' style="display:none"';
}

/* ── 5a. Pane: IMAGES ─────────────────────────────────────────────── */

function renderImagesPane(): string {
  const last = state.lastImageUrl
    ? '<div class="mf-tlr-img-current"><img src="' + escapeAttr(state.lastImageUrl) + '" alt="current"/>' +
      '<div class="mf-tlr-img-meta">' + escapeHtml(state.lastImageUrl) + '</div></div>'
    : '<div class="mf-tlr-empty">No image selected yet.</div>';

  return (
    '<div class="mf-tlr-section">' +
      '<div class="mf-tlr-section-hd">Background &amp; Assets</div>' +
      '<div class="mf-tlr-section-sub">' +
        'Upload a new image or pick from the gallery. Sets ' +
        '<code>--mf-form-bg-image</code> on the form.' +
      '</div>' +

      '<div class="mf-tlr-img-actions">' +
        '<button type="button" class="mf-tlr-btn mf-tlr-btn-primary" id="mf-tlr-img-upload">' +
          '<i class="fas fa-cloud-arrow-up"></i> Upload' +
        '</button>' +
        '<button type="button" class="mf-tlr-btn" id="mf-tlr-img-gallery">' +
          '<i class="fas fa-images"></i> Gallery' +
        '</button>' +
        '<input type="file" id="mf-tlr-img-file" accept="image/*" style="display:none"/>' +
      '</div>' +

      '<div class="mf-tlr-img-current-wrap" id="mf-tlr-img-current-wrap">' + last + '</div>' +

      '<div class="mf-tlr-img-apply-row">' +
        '<button type="button" class="mf-tlr-btn mf-tlr-btn-ghost" id="mf-tlr-img-clear">' +
          '<i class="fas fa-xmark"></i> Remove background' +
        '</button>' +
      '</div>' +
    '</div>'
  );
}

/* ── 5b. Pane: FONTS ──────────────────────────────────────────────── */

function renderFontsPane(): string {
  const tiles = REFERENCE_FONTS.map((f) => {
    const isActive = state.lastFontFamily === f.family;
    return (
      '<button type="button" class="mf-tlr-font-tile' + (isActive ? ' active' : '') + '"' +
        ' data-font-id="' + f.id + '"' +
        ' data-font-family="' + escapeAttr(f.family) + '"' +
        ' title="' + escapeAttr(f.family) + '">' +
        '<div class="mf-tlr-font-preview" style="font-family:' + escapeAttr(f.family) + '">Aa</div>' +
        '<div class="mf-tlr-font-name" style="font-family:' + escapeAttr(f.family) + '">' + escapeHtml(f.label) + '</div>' +
        '<div class="mf-tlr-font-cat">' + escapeHtml(f.category) + '</div>' +
      '</button>'
    );
  }).join('');

  return (
    '<div class="mf-tlr-section">' +
      '<div class="mf-tlr-section-hd">Reference Fonts <span class="mf-tlr-count">' + REFERENCE_FONTS.length + '</span></div>' +
      '<div class="mf-tlr-section-sub">' +
        'Click a tile to set <code>--mf-font-family</code>. Right rail has size + weight controls.' +
      '</div>' +
      '<div class="mf-tlr-font-grid">' + tiles + '</div>' +
    '</div>'
  );
}

/* ── 5c. Pane: INSPECT ────────────────────────────────────────────── */

function renderInspectPane(): string {
  return (
    '<div class="mf-tlr-section">' +
      '<div class="mf-tlr-section-hd">Element Inspector</div>' +
      '<div class="mf-tlr-section-sub">' +
        'Click an element on the form preview to inspect its computed styles.' +
      '</div>' +

      '<div class="mf-tlr-inspect-actions">' +
        '<button type="button" class="mf-tlr-btn mf-tlr-btn-primary" id="mf-tlr-inspect-toggle" aria-pressed="false">' +
          '<i class="fas fa-crosshairs"></i> <span class="mf-tlr-inspect-label">Pick element</span>' +
        '</button>' +
        '<button type="button" class="mf-tlr-btn mf-tlr-btn-ghost" id="mf-tlr-inspect-clear" title="Clear pick">' +
          '<i class="fas fa-broom"></i>' +
        '</button>' +
      '</div>' +

      '<div class="mf-tlr-inspect-result" id="mf-tlr-inspect-result">' +
        '<div class="mf-tlr-empty">No element picked yet.</div>' +
      '</div>' +
    '</div>'
  );
}

/* ── 5d. Pane: STRUCTURE ──────────────────────────────────────────── */

function renderStructurePane(): string {
  return (
    '<div class="mf-tlr-section">' +
      '<div class="mf-tlr-section-hd">Custom HTML Structure</div>' +
      '<div class="mf-tlr-section-sub">Tree view of the rendered form. Click a node to focus its styles.</div>' +
      '<div id="td-structure-tree" class="mf-tlr-structure-tree">' +
        '<div class="td-structure-empty mf-tlr-empty">Loading structure tree…</div>' +
      '</div>' +
      '<div id="td-structure-css-match" class="mf-tlr-structure-css" style="display:none"></div>' +
    '</div>'
  );
}

/* ── 5h. WIRING for the new B68 panes (Presets / Elements / Colors) ── */

function wirePresetsPane(panel: HTMLElement): void {
  var search    = panel.querySelector<HTMLInputElement>('#mf-tlr-preset-search');
  var grid      = panel.querySelector<HTMLElement>('#mf-tlr-preset-grid');
  var chipStrip = panel.querySelector<HTMLElement>('#mf-tlr-chip-strip');
  var viewBar   = panel.querySelector<HTMLElement>('#mf-tlr-view-toggle');
  var countEl   = panel.querySelector<HTMLElement>('#mf-tlr-presets-count');

  // [Mock parity] filter rules:
  //   chip "all"     → show all
  //   chip "popular" → tile.data-preset-popular === '1'
  //   chip "<cat>"   → tile.data-preset-category === '<cat>'
  //   search         → case-insensitive name substring match
  // After filter, update the live "N themes" count bar.
  function filterTiles(): void {
    if (!grid) return;
    var q = search ? (search.value || '').trim().toLowerCase() : '';
    var activeChip = chipStrip
      ? (chipStrip.querySelector<HTMLElement>('.mf-tlr-chip.active')?.getAttribute('data-chip') || 'all')
      : 'all';
    var shown = 0;
    grid.querySelectorAll<HTMLElement>('.mf-tlr-preset-tile').forEach(function (tile) {
      var name = (tile.getAttribute('data-preset-name') || '').toLowerCase();
      var cat  = (tile.getAttribute('data-preset-category') || '').toLowerCase();
      var pop  = tile.getAttribute('data-preset-popular') === '1';
      var matchesSearch = !q || name.indexOf(q) >= 0;
      var matchesChip   = activeChip === 'all'
                         || (activeChip === 'popular' ? pop : cat === activeChip);
      var visible = matchesSearch && matchesChip;
      tile.style.display = visible ? '' : 'none';
      if (visible) shown++;
    });
    if (countEl) countEl.textContent = shown + ' theme' + (shown === 1 ? '' : 's');
  }

  if (search) search.addEventListener('input', filterTiles);
  if (chipStrip) {
    chipStrip.addEventListener('click', function (ev) {
      var target = ev.target as HTMLElement;
      var chip = target && (target.closest ? target.closest('.mf-tlr-chip') : null) as HTMLElement | null;
      if (!chip) return;
      ev.preventDefault();
      chipStrip.querySelectorAll<HTMLElement>('.mf-tlr-chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      filterTiles();
    });
  }
  // [Mock parity] Grid/list view toggle — flips .is-list class on the grid;
  // CSS handles the actual layout swap (2-col tile grid vs. stacked rows).
  if (viewBar && grid) {
    viewBar.addEventListener('click', function (ev) {
      var target = ev.target as HTMLElement;
      var btn = target && (target.closest ? target.closest('.mf-tlr-view-btn') : null) as HTMLElement | null;
      if (!btn) return;
      ev.preventDefault();
      var view = btn.getAttribute('data-view') || 'grid';
      viewBar!.querySelectorAll<HTMLElement>('.mf-tlr-view-btn').forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      grid!.classList.toggle('is-list', view === 'list');
    });
  }

  if (grid) {
    grid.addEventListener('click', function (ev) {
      var target = ev.target as HTMLElement;
      var tile = target && (target.closest ? target.closest('.mf-tlr-preset-tile') : null) as HTMLElement | null;
      if (!tile) return;
      ev.preventDefault();
      var id = tile.getAttribute('data-preset-id') || '';
      if (!id) return;
      // [B78] Read swatch colors stored on the tile so we can ALWAYS push
      // explicit CSS vars to the iframe even if the adapter's internal
      // PRESETS array doesn't recognise the mock-aligned id (forest /
      // ocean / coral / cyber / berry / earth aren't in the legacy 12-entry
      // adapter PRESETS list). Without this fallback, clicking a new mock
      // preset on a form with no theme would leave the form unchanged.
      var c1 = tile.getAttribute('data-preset-c1') || '';
      var c2 = tile.getAttribute('data-preset-c2') || '';
      var c3 = tile.getAttribute('data-preset-c3') || '';
      var c4 = tile.getAttribute('data-preset-c4') || '';
      // [P1-4] Darken a hex toward black by `amt` (0..1) so light preset border
      // colors keep an accessible boundary against tinted (e.g. Sunset cream) inputs.
      var darkenHex = function (hex: string, amt: number): string {
        var h = String(hex || '').trim().replace(/^#/, '');
        if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
        var f = Math.max(0, Math.min(1, 1 - amt));
        var ch = function (i: number) { return Math.round(parseInt(h.slice(i, i + 2), 16) * f); };
        var hx = function (n: number) { var s = n.toString(16); return s.length === 1 ? '0' + s : s; };
        return '#' + hx(ch(0)) + hx(ch(2)) + hx(ch(4));
      };
      try {
        var adapter = (window as any).MFThemeTabAdapter;
        var presetVars: Record<string, string> = {};
        if (c1) {
          presetVars['--mf-primary'] = c1;
          presetVars['--mf-primary-hover'] = c1;
          presetVars['--mf-primary-light'] = c1 + '26';
          presetVars['--mf-input-focus-border'] = c1;
          presetVars['--mf-check-color'] = c1;
          presetVars['--mf-progress-fill'] = c1;
          presetVars['--mf-btn-bg'] = c1;
          presetVars['--mf-btn-bg-hover'] = c1;
          presetVars['--mf-btn-hover-bg'] = c1;
          presetVars['--mf-color-text-inverse'] = '#ffffff';
          presetVars['--mf-btn-color'] = '#ffffff';
          presetVars['--mf-btn-text'] = '#ffffff';
        }
        if (c2) {
          presetVars['--mf-secondary'] = c2;
          presetVars['--mf-title-color'] = c2;
          presetVars['--mf-text'] = c2;
          presetVars['--mf-label-color'] = c2;
        }
        if (c3) {
          presetVars['--mf-form-bg'] = c3;
          presetVars['--mf-input-bg'] = c3;
        }
        if (c4) {
          var c4b = darkenHex(c4, 0.14);
          presetVars['--mf-border'] = c4b;
          // [P1-4] megaform.css consumes --mf-input-border as a SHORTHAND
          // ("1px solid #..."), applied via `border: var(--mf-input-border)`.
          // Feeding a BARE color collapses border-style→none → invisible border.
          // Emit a valid shorthand, and also feed the canonical color token that
          // the Colors panel (--mf-input-border-color) and runtime both read.
          presetVars['--mf-input-border'] = '1px solid ' + c4b;
          presetVars['--mf-input-border-color'] = c4b;
        }
        if (adapter && typeof adapter.applyPresetVars === 'function') {
          adapter.applyPresetVars(id, presetVars);
        } else if (adapter && typeof adapter.setPreset === 'function') {
          adapter.setPreset(id);
        } else {
          window.dispatchEvent(new CustomEvent('mf:theme-preset-changed', { detail: { themeId: id } }));
        }
        // [B78] Belt-and-braces: explicitly set the cascade of vars that
        // the runtime form actually consumes, using THIS tile's swatch.
        // setVar runs flushPreview() so the iframe sees the change without
        // a reload. Safe for both standard forms and customHtml forms (B71
        // element-level overrides catch hardcoded customCss values).
        if (!(adapter && typeof adapter.applyPresetVars === 'function') && adapter && typeof adapter.setVar === 'function') {
          if (c1) {
            adapter.setVar('--mf-primary', c1);
            adapter.setVar('--mf-primary-hover', c1);
            adapter.setVar('--mf-primary-light', c1 + '26');
            adapter.setVar('--mf-input-focus-border', c1);
            adapter.setVar('--mf-check-color', c1);
            adapter.setVar('--mf-progress-fill', c1);
            adapter.setVar('--mf-btn-bg', c1);
            adapter.setVar('--mf-btn-bg-hover', c1);
            adapter.setVar('--mf-btn-hover-bg', c1);
            adapter.setVar('--mf-color-text-inverse', '#ffffff');
            adapter.setVar('--mf-btn-color', '#ffffff');
            adapter.setVar('--mf-btn-text', '#ffffff');
          }
          if (c2) {
            adapter.setVar('--mf-secondary', c2);
            adapter.setVar('--mf-title-color', c2);
            adapter.setVar('--mf-text', c2);
            adapter.setVar('--mf-label-color', c2);
          }
          if (c3) {
            adapter.setVar('--mf-form-bg', c3);
            adapter.setVar('--mf-input-bg', c3);
          }
          if (c4) {
            var c4d = darkenHex(c4, 0.14);
            adapter.setVar('--mf-border', c4d);
            adapter.setVar('--mf-input-border', '1px solid ' + c4d);
            adapter.setVar('--mf-input-border-color', c4d);
          }
        }
      } catch (_e) { /* defensive */ }
      grid!.querySelectorAll<HTMLElement>('.mf-tlr-preset-tile.active').forEach(function (t) { t.classList.remove('active'); });
      tile.classList.add('active');
      // [P1-3 recheck] Repaint the left-rail Colors pane from the authoritative
      // merged theme state (falls back to this tile's presetVars) so the panel
      // no longer shows stale Default blue after a preset.
      try {
        var _st = (window as any).MFThemeTabAdapter;
        var _ov = (_st && typeof _st.getState === 'function' && _st.getState().cssOverrides) || presetVars;
        updateColorsPaneFromLive(_ov);
      } catch (_eC) { /* defensive */ }
    });
  }
}

function wireElementsPane(panel: HTMLElement): void {
  var list = panel.querySelector<HTMLElement>('#mf-tlr-element-list');
  if (!list) return;
  list.addEventListener('click', function (ev) {
    var target = ev.target as HTMLElement;
    var row = target && (target.closest ? target.closest('.mf-tlr-element-row') : null) as HTMLElement | null;
    if (!row) return;
    ev.preventDefault();
    var key = row.getAttribute('data-element-key') || '';
    var sel = row.getAttribute('data-element-sel') || '';
    list!.querySelectorAll<HTMLElement>('.mf-tlr-element-row.active').forEach(function (r) { r.classList.remove('active'); });
    row.classList.add('active');
    // Emit a window event so the right rail / canvas can react. Wired in B69.
    try {
      window.dispatchEvent(new CustomEvent('mf:theme-element-picked', {
        detail: { key: key, selector: sel },
      }));
    } catch (_e) { /* defensive */ }
  });
}

function wireColorsPane(panel: HTMLElement): void {
  // [B76 mock parity] Map every color category key to its target CSS var.
  // Brand keys → primary palette; Surface keys → background/border;
  // Text keys → text colors; Semantic keys → status colors; Form-state keys
  // → input border / focus / disabled visual states.
  var keyToVar: Record<string, string> = {
    // Brand
    'primary':        '--mf-primary',
    'primary-hover':  '--mf-primary-hover',
    'primary-light':  '--mf-primary-light',
    'secondary':      '--mf-secondary',
    'accent':         '--mf-accent',
    // Surface
    'background':     '--mf-page-bg',
    'surface':        '--mf-form-bg',
    'surface-raised': '--mf-section-bg',
    'border':         '--mf-input-border',
    'border-focus':   '--mf-input-focus-border',
    // Text
    'text-primary':   '--mf-color-text',
    'text-secondary': '--mf-color-text-light',
    'text-muted':     '--mf-color-text-muted',
    'text-inverse':   '--mf-color-text-inverse',
    // Semantic
    'success':        '--mf-color-success',
    'warning':        '--mf-color-warning',
    'error':          '--mf-color-error',
    'info':           '--mf-color-info',
    // Form states
    'state-default':  '--mf-input-border',
    'state-hover':    '--mf-input-hover-border',
    'state-focus':    '--mf-input-focus-border',
    'state-disabled': '--mf-input-disabled-bg',
    'state-error':    '--mf-color-error',
  };

  function applyVar(varName: string, hex: string): void {
    var v = String(hex || '').trim();
    if (v && v.charAt(0) !== '#') v = '#' + v;
    if (!/^#[0-9a-f]{6}$/i.test(v)) return;
    try {
      var adapter = (window as any).MFThemeTabAdapter;
      if (adapter && typeof adapter.setVar === 'function') {
        adapter.setVar(varName, v);
      } else {
        document.documentElement.style.setProperty(varName, v);
      }
    } catch (_e) { /* defensive */ }
  }

  // [Mock parity] Pick eyedropper button — toggles inspect mode so user can
  // click any element in the form preview to inspect its CSS in the right
  // rail Inspector sub-tab. Visual feedback: button .is-active + label
  // changes Pick ⇄ Picking…
  var pickBtn = panel.querySelector<HTMLElement>('#mf-tlr-pick-btn');
  if (pickBtn) {
    pickBtn.addEventListener('click', function () {
      setInspectMode(!state.inspectModeOn);
      pickBtn.classList.toggle('is-active', state.inspectModeOn);
      pickBtn.classList.toggle('active',    state.inspectModeOn); // back-compat
      var lbl = pickBtn.querySelector('span');
      if (lbl) lbl.textContent = state.inspectModeOn ? 'Picking…' : 'Pick';
    });
  }

  // [Mock parity] QUICK COLORS — 16 swatches that map to --mf-primary
  var swatchGrid = panel.querySelector<HTMLElement>('#mf-tlr-swatch-grid');
  if (swatchGrid) {
    swatchGrid.addEventListener('click', function (ev) {
      var target = ev.target as HTMLElement;
      var sw = target && (target.closest ? target.closest('.mf-tlr-quick-swatch') : null) as HTMLElement | null;
      if (!sw) return;
      ev.preventDefault();
      var c = sw.getAttribute('data-swatch') || '';
      if (c) applyVar('--mf-primary', c);
    });
  }

  // [Mock parity] Expandable color categories (5 of them: Brand / Surface /
  // Text / Semantic / Form States). Each header has data-expand="cat-<id>"
  // and the body has id="mf-tlr-cat-<id>-body".
  panel.querySelectorAll<HTMLElement>('[data-expand]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.getAttribute('data-expand');
      var body = targetId ? document.getElementById('mf-tlr-' + targetId + '-body') : null;
      var chevron = btn.querySelector<HTMLElement>('.mf-tlr-cat-chevron, .mf-tlr-expand-icon');
      if (body) {
        var isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : '';
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
        var catContainer = btn.closest('.mf-tlr-color-category');
        if (catContainer) catContainer.classList.toggle('is-open', !isOpen);
      }
    });
  });

  // [Mock parity] Color row clicks — each row carries data-color-key +
  // data-color-value. Click writes the value into the matching CSS var.
  panel.querySelectorAll<HTMLElement>('.mf-tlr-color-row-item').forEach(function (row) {
    row.addEventListener('click', function (ev) {
      ev.preventDefault();
      var key   = row.getAttribute('data-color-key')   || '';
      var value = row.getAttribute('data-color-value') || '';
      if (!key || !value) return;
      var varName = keyToVar[key] || '--mf-primary';
      applyVar(varName, value);
      // [B78] Visible-effect fallback: many of the named role vars
      // (--mf-accent, --mf-secondary, --mf-color-success, --mf-text-muted,
      // etc.) aren't consumed by the published runtime CSS, so editing
      // them is invisible to the user. To make every brand-color click
      // produce a visible change, ALSO push the value into the canonical
      // --mf-primary cascade when key === 'primary' OR is a primary
      // variant (primary-hover / primary-light), and ALWAYS apply the
      // explicit value back as a secondary signal so the iframe re-flushes.
      if (key === 'primary' || key === 'primary-hover' || key === 'primary-light') {
        applyVar('--mf-primary', value);
        applyVar('--mf-input-focus-border', value);
        applyVar('--mf-check-color', value);
        applyVar('--mf-btn-bg', value);
        applyVar('--mf-btn-hover-bg', value);
      }
      // Highlight active row inside its own category (allow one active per
      // category since semantic colors aren't mutually exclusive).
      var cat = row.closest('.mf-tlr-color-category');
      if (cat) {
        cat.querySelectorAll<HTMLElement>('.mf-tlr-color-row-item.is-active').forEach(function (r) { r.classList.remove('is-active'); });
      }
      row.classList.add('is-active');
    });
  });

  // [Mock parity] "Edit" button on Quick Colors header — placeholder hook
  // that future B77+ work will wire to a settings popover (let user pick
  // which 16 colors live in the strip). For now, no-op + console log.
  var editQuick = panel.querySelector<HTMLElement>('#mf-tlr-edit-quick');
  if (editQuick) {
    editQuick.addEventListener('click', function () {
      try { console.info('[B76] Edit Quick Colors — popover wiring deferred to B77+'); } catch (_e) {}
    });
  }
}

function rgbToHex(rgb: string): string | null {
  if (!rgb) return null;
  if (rgb.charAt(0) === '#') return rgb;
  var m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  var r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
  return '#' + [r, g, b].map(function (x) {
    var h = Math.max(0, Math.min(255, x)).toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('');
}

/* ── 6. WIRING ────────────────────────────────────────────────────── */

function wireUtilityNav(panel: HTMLElement): void {
  // Tab strip → switch panes
  panel.querySelectorAll<HTMLElement>('.mf-tlr-tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const id = tab.dataset.tlrTab as ThemeUtilityTab;
      if (!id) return;
      switchTab(panel, id);
    });
  });

  wireImagesPane(panel);
  wireFontsPane(panel);
  wireInspectPane(panel);
  // [B68] Wire the new mock-aligned panes (Presets / Elements / Colors)
  wirePresetsPane(panel);
  wireElementsPane(panel);
  wireColorsPane(panel);

  // Collapse button — wiring lives in panels.ts; skip if already wired.
  const collapseBtn = panel.querySelector<HTMLElement>('#mf-left-collapse-btn');
  if (collapseBtn && !(collapseBtn as any).dataset?.mfCollapseWired) {
    (collapseBtn as any).dataset.mfCollapseWired = '1';
    collapseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const leftPanel = document.getElementById('mf-panel-left');
      const openBtn = document.getElementById('mf-left-open-btn') as HTMLAnchorElement | null;
      if (leftPanel) {
        leftPanel.classList.remove('mf-expanded');
        leftPanel.classList.add('mf-collapsed');
        if (openBtn) openBtn.style.display = 'flex';
      }
    });
  }

  // Lazy-mount structure tree if user lands on STRUCTURE first.
  if (state.activeTab === 'structure') {
    mountStructureTree(panel);
  }
}

function switchTab(panel: HTMLElement, id: ThemeUtilityTab): void {
  state.activeTab = id;

  panel.querySelectorAll<HTMLElement>('.mf-tlr-tab').forEach((t) => {
    const isActive = t.dataset.tlrTab === id;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  panel.querySelectorAll<HTMLElement>('.mf-theme-pane').forEach((p) => {
    p.style.display = p.id === ('mf-tlr-pane-' + id) ? '' : 'none';
  });

  if (id === 'structure') mountStructureTree(panel);
  // [P1-3 recheck] When the Colors pane is shown, reflect the current theme so it
  // never displays stale defaults (covers themes loaded from schema before any click).
  if (id === 'colors') {
    try {
      var _a = (window as any).MFThemeTabAdapter;
      if (_a && typeof _a.getState === 'function') updateColorsPaneFromLive(_a.getState().cssOverrides);
    } catch (_e) { /* defensive */ }
  }
}

/* ── 6a. Wire: IMAGES pane ─────────────────────────────────────────── */

function wireImagesPane(panel: HTMLElement): void {
  const uploadBtn = panel.querySelector<HTMLElement>('#mf-tlr-img-upload');
  const galleryBtn = panel.querySelector<HTMLElement>('#mf-tlr-img-gallery');
  const fileInput  = panel.querySelector<HTMLInputElement>('#mf-tlr-img-file');
  const clearBtn   = panel.querySelector<HTMLElement>('#mf-tlr-img-clear');

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const td: any = (window as any).MFTokenDesigner;
      if (!td || typeof td.uploadImage !== 'function') {
        // eslint-disable-next-line no-console
        console.warn('[ThemeLeftRail] MFTokenDesigner.uploadImage unavailable');
        return;
      }
      const before = uploadBtn.innerHTML;
      uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…';
      uploadBtn.setAttribute('aria-busy', 'true');
      td.uploadImage(file)
        .then((url: string) => {
          uploadBtn.innerHTML = before;
          uploadBtn.removeAttribute('aria-busy');
          fileInput.value = '';
          applyImagePick(url);
        })
        .catch((err: any) => {
          uploadBtn.innerHTML = before;
          uploadBtn.removeAttribute('aria-busy');
          // eslint-disable-next-line no-console
          console.warn('[ThemeLeftRail] upload failed', err);
        });
    });
  }

  if (galleryBtn) {
    galleryBtn.addEventListener('click', () => {
      const td: any = (window as any).MFTokenDesigner;
      if (!td || typeof td.openGalleryPicker !== 'function') {
        // eslint-disable-next-line no-console
        console.warn('[ThemeLeftRail] MFTokenDesigner.openGalleryPicker unavailable');
        return;
      }
      td.openGalleryPicker((url: string) => {
        if (!url) return;
        applyImagePick(url);
      });
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.lastImageUrl = '';
      refreshImagesPane();
      document.dispatchEvent(new CustomEvent('mf:theme-image-pick', { detail: { url: '', cleared: true } }));
      const ta: any = (window as any).MFThemeTabAdapter;
      // Right rail does not yet expose setVar publicly; bypass by setting
      // the CSS variable inline as a fallback so the canvas preview reacts.
      document.documentElement.style.setProperty('--mf-form-bg-image', 'none');
      // If the right rail later exposes setVar, prefer it.
      if (ta && typeof ta.setVar === 'function') {
        try { ta.setVar('--mf-form-bg-image', ''); } catch { /* noop */ }
      }
    });
  }
}

function applyImagePick(url: string): void {
  state.lastImageUrl = url;
  refreshImagesPane();

  // Fire decoupling event so the right rail (or any listener) can react.
  document.dispatchEvent(new CustomEvent('mf:theme-image-pick', { detail: { url } }));

  // Drive the CSS var so the canvas preview updates immediately even
  // before the right rail is wired to listen.
  const cssVal = 'url("' + url + '")';
  document.documentElement.style.setProperty('--mf-form-bg-image', cssVal);

  const ta: any = (window as any).MFThemeTabAdapter;
  if (ta && typeof ta.setVar === 'function') {
    try { ta.setVar('--mf-form-bg-image', cssVal); } catch { /* noop */ }
  }
}

function refreshImagesPane(): void {
  const wrap = document.getElementById('mf-tlr-img-current-wrap');
  if (!wrap) return;
  wrap.innerHTML = state.lastImageUrl
    ? '<div class="mf-tlr-img-current"><img src="' + escapeAttr(state.lastImageUrl) + '" alt="current"/>' +
      '<div class="mf-tlr-img-meta">' + escapeHtml(state.lastImageUrl) + '</div></div>'
    : '<div class="mf-tlr-empty">No image selected yet.</div>';
}

/* ── 6b. Wire: FONTS pane ──────────────────────────────────────────── */

function wireFontsPane(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLElement>('.mf-tlr-font-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const family = tile.dataset.fontFamily || '';
      const id = tile.dataset.fontId || '';
      if (!family) return;

      state.lastFontFamily = family;
      panel.querySelectorAll('.mf-tlr-font-tile').forEach((b) => b.classList.remove('active'));
      tile.classList.add('active');

      // Decoupling event
      document.dispatchEvent(new CustomEvent('mf:theme-font-pick', { detail: { id, family } }));

      // Drive the CSS var live
      document.documentElement.style.setProperty('--mf-font-family', family);
      const ta: any = (window as any).MFThemeTabAdapter;
      if (ta && typeof ta.setVar === 'function') {
        try { ta.setVar('--mf-font-family', family); } catch { /* noop */ }
      }
    });
  });
}

/* ── 6c. Wire: INSPECT pane ────────────────────────────────────────── */

function wireInspectPane(panel: HTMLElement): void {
  const toggleBtn = panel.querySelector<HTMLElement>('#mf-tlr-inspect-toggle');
  const clearBtn  = panel.querySelector<HTMLElement>('#mf-tlr-inspect-clear');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      setInspectMode(!state.inspectModeOn);
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.lastPickedSelector = '';
      state.lastPickedStyles   = {};
      const result = document.getElementById('mf-tlr-inspect-result');
      if (result) result.innerHTML = '<div class="mf-tlr-empty">No element picked yet.</div>';
    });
  }
}

function setInspectMode(on: boolean): void {
  state.inspectModeOn = on;
  document.body.classList.toggle('mf-theme-inspect-mode', on);

  // Update toggle button visual state
  const btn = document.getElementById('mf-tlr-inspect-toggle');
  const lbl = btn ? btn.querySelector<HTMLElement>('.mf-tlr-inspect-label') : null;
  if (btn) {
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (lbl) {
    lbl.textContent = on ? 'Picking… click an element' : 'Pick element';
  }

  // Tell the preview iframe to enter / leave inspect mode so it can
  // intercept clicks and bubble back the selector.
  try {
    const frame = document.querySelector('.mf-theme-preview-frame') as HTMLIFrameElement | null;
    if (frame && frame.contentWindow) {
      let targetOrigin = window.location.origin;
      try {
        const src = frame.getAttribute('src') || '';
        if (src && src.indexOf('about:') !== 0) targetOrigin = new URL(src, window.location.href).origin;
      } catch { /* defensive */ }
      frame.contentWindow.postMessage({ type: 'mf-theme-inspect-mode', on }, targetOrigin);
    }
  } catch { /* defensive */ }

  // Emit a public event so the right rail / iframe can react too. bubbles:true so both
  // window- and document-registered listeners receive it (see mf:theme-inspect-element fix).
  document.dispatchEvent(new CustomEvent('mf:theme-inspect-mode', { bubbles: true, detail: { on } }));
}

function getPreviewFrameTargetOrigin(frame: HTMLIFrameElement): string {
  try {
    const src = frame.getAttribute('src') || '';
    if (src && src.indexOf('about:') !== 0) return new URL(src, window.location.href).origin;
  } catch { /* defensive */ }
  return window.location.origin;
}

function renderInspectPick(selector: string, breadcrumb: string[], styles: Record<string, string>): void {
  // [B73] Instead of rendering in the left-rail INSPECT pane, send detected
  // styles to the right-rail Theme Designer Inspector sub-tab so the user
  // gets a spacious, organized editing surface with categorized CSS props.
  state.lastPickedSelector = String(selector || '');
  state.lastPickedStyles   = { ...(styles || {}) };

  // Dispatch event so theme-tab-adapter can open the Inspector sub-tab.
  // [2026-07-02 FIX] bubbles:true is REQUIRED — the adapter listens on `window`, and a
  // non-bubbling event dispatched on `document` never reaches window bubble-phase listeners.
  // This is why the CSS picker silently "did nothing" (the pick message arrived but the
  // right-rail Inspector never populated).
  document.dispatchEvent(new CustomEvent('mf:theme-inspect-element', {
    bubbles: true,
    detail: { selector, breadcrumb, styles },
  }));

  // Also keep a lightweight summary in the left-rail Colors tab (if visible)
  const colorsPane = document.getElementById('mf-tlr-pane-colors');
  if (colorsPane) {
    const pickBtn = colorsPane.querySelector<HTMLElement>('#mf-tlr-pick-btn');
    if (pickBtn) {
      pickBtn.classList.remove('active');
      var lbl = pickBtn.querySelector('span') || pickBtn;
      if (lbl) lbl.textContent = 'Pick';
    }
  }

  // Auto-disable inspect mode after a pick (one-shot UX).
  setInspectMode(false);
}

/* ── 6c.1. Wire: live-edit inputs inside INSPECT result ─────────────── */

function wireInspectStyleInputs(host: HTMLElement): void {
  const inputs = host.querySelectorAll<HTMLInputElement>('.mf-tlr-style-val-input');
  let debounceTimer: number | null = null;

  inputs.forEach((input) => {
    /* live preview on input — debounced */
    input.addEventListener('input', () => {
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        commitStyleEdit(input);
        debounceTimer = null;
      }, 120);
    });

    /* commit on blur / Enter for explicit confirmation */
    input.addEventListener('blur',  () => commitStyleEdit(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitStyleEdit(input);
        input.blur();
      }
    });
  });
}

function commitStyleEdit(input: HTMLInputElement): void {
  const cssKey = input.dataset.cssKey || '';
  const cssVal = input.value || '';
  const selector = state.lastPickedSelector;
  if (!cssKey || !selector) return;

  postEditToIframe(selector, cssKey, cssVal);

  /* Refresh state snapshot so re-edits read the latest value */
  state.lastPickedStyles[cssKey] = cssVal;

  /* Visual nudge — flash the row briefly so the user sees the commit */
  const row = input.closest<HTMLElement>('.mf-tlr-style-row');
  if (row) {
    row.classList.add('mf-tlr-style-flash');
    window.setTimeout(() => row.classList.remove('mf-tlr-style-flash'), 350);
  }
}

function postEditToIframe(selector: string, cssKey: string, cssValue: string): void {
  /* (C) Mirror the change to :root theme var so the whole form picks it up
     when the CSS property maps to a known token. */
  const themeVar = THEME_VAR_MAP[cssKey];

  try {
    const frame = document.querySelector('.mf-theme-preview-frame') as HTMLIFrameElement | null;
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({
        type: 'mf-theme-inspect-edit',
        selector,
        cssKey,
        cssValue,
        themeVar: themeVar || null,
      }, getPreviewFrameTargetOrigin(frame));
    }
  } catch { /* defensive */ }

  /* Also drive the parent :root var so live styles outside the iframe
     (e.g. preview shell chrome) react. */
  if (themeVar) {
    try {
      document.documentElement.style.setProperty(themeVar, cssValue);
      const ta: any = (window as any).MFThemeTabAdapter;
      if (ta && typeof ta.setVar === 'function') {
        try { ta.setVar(themeVar, cssValue); } catch { /* noop */ }
      }
    } catch { /* defensive */ }
  }

  /* Public event for telemetry / right-rail listeners. */
  document.dispatchEvent(new CustomEvent('mf:theme-inspect-edit', {
    detail: { selector, cssKey, cssValue, themeVar: themeVar || null },
  }));
}

/* ── 7. STRUCTURE TREE — lazy mount ───────────────────────────────── */

/**
 * Read customHtml from the builder draft. Tries both casings.
 * Returns trimmed string (may be empty).
 */
function readDraftCustomHtml(): string {
  try {
    const w: any = window;
    const draft = w.MFBuilder?.getDraft?.() || w.MegaFormBuilder?.getDraft?.();
    const html = draft?.settings?.customHtml || draft?.settings?.CustomHtml || '';
    return String(html || '').trim();
  } catch { return ''; }
}

/**
 * Resolve the live preview iframe document.
 * Returns null if the iframe is not mounted or cross-origin (it should
 * never be cross-origin because we use srcdoc).
 */
function getPreviewIframeDoc(): Document | null {
  try {
    const frame = document.querySelector('.mf-theme-preview-frame') as HTMLIFrameElement | null;
    if (!frame) return null;
    return frame.contentDocument || (frame.contentWindow && frame.contentWindow.document) || null;
  } catch { return null; }
}

/**
 * Generate a CSS selector that uniquely identifies an element inside the
 * iframe. Same shape as the iframe's own __mfInspectSelector helper so the
 * iframe receiver (mf-theme-inspect-edit) can re-target the element on
 * subsequent edits.
 */
function buildIframeSelector(el: HTMLElement): string {
  try {
    const parts: string[] = [];
    let cur: HTMLElement | null = el;
    let stop = 0;
    while (cur && cur.nodeType === 1 && stop < 8) {
      const tag = String(cur.tagName || '').toLowerCase();
      let seg = tag;
      if (cur.id) {
        parts.unshift(tag + '#' + cur.id);
        break;
      }
      const cls = String(cur.className || '').split(/\s+/).filter((c) => !!c && c.indexOf('mf-') === 0).slice(0, 3);
      if (cls.length) seg = tag + '.' + cls.join('.');
      parts.unshift(seg);
      if (tag === 'body' || tag === 'html') break;
      cur = cur.parentElement;
      stop++;
    }
    return parts.join(' > ');
  } catch { return '(unknown)'; }
}

/**
 * Build a short visible label for a DOM node in the iframe tree, e.g.
 * `div.mf-form-wrapper` or `input#email`.
 */
function buildIframeLabel(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return tag + '#' + el.id;
  const cls = String(el.className || '').split(/\s+/).filter((c) => !!c).slice(0, 2);
  if (cls.length) return tag + '.' + cls.join('.');
  return tag;
}

/**
 * Decide if a node from the iframe is interesting enough to surface in the
 * tree. Criteria:
 *   1. Tag is part of MegaForm chrome (has any `mf-*` class), OR
 *   2. Node has an `id`, OR
 *   3. Node has a non-zero visible bounding box and is a semantic tag.
 */
function isInterestingIframeNode(el: HTMLElement): boolean {
  try {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'meta' || tag === 'link' || tag === 'br') return false;

    const cls = String(el.className || '');
    if (/\bmf-/.test(cls)) return true;
    if (el.id) return true;

    // Visible bounding box check (for non-mf nodes inside customHtml).
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const SEMANTIC = ['form','section','header','footer','main','aside','article','nav',
        'figure','figcaption','details','summary','label','fieldset','legend',
        'ul','ol','li','table','thead','tbody','tfoot','tr','td','th',
        'h1','h2','h3','h4','h5','h6','p','a','img','input','textarea','select','button'];
      if (SEMANTIC.indexOf(tag) >= 0) return true;
    }
    return false;
  } catch { return false; }
}

/**
 * Recursive helper that walks the iframe DOM and renders a collapsible
 * tree to HTML. Each tree node has `data-mf-iframe-selector` for the
 * click handler.
 */
interface IframeNodeView {
  selector: string;
  label: string;
  cls: string;
  childrenHtml: string;
}

function walkIframeNode(el: HTMLElement, depth: number, maxDepth: number): IframeNodeView | null {
  if (!isInterestingIframeNode(el)) {
    // Still descend in case interesting children exist.
    if (depth >= maxDepth) return null;
    const kids: string[] = [];
    const children = el.children;
    for (let i = 0; i < children.length && i < 200; i++) {
      const child = children[i];
      if (!child || (child as Element).nodeType !== 1 || !(child as Element).tagName) continue;
      const view = walkIframeNode(child, depth + 1, maxDepth);
      if (view) kids.push(renderIframeNodeHtml(view));
    }
    if (!kids.length) return null;
    // Return a synthetic pass-through wrapper so the visible tree skips
    // boring intermediates but preserves hierarchy of interesting kids.
    return {
      selector: buildIframeSelector(el),
      label: buildIframeLabel(el),
      cls: el.className ? String(el.className).split(/\s+/)[0] : '',
      childrenHtml: kids.join(''),
    };
  }

  const view: IframeNodeView = {
    selector: buildIframeSelector(el),
    label: buildIframeLabel(el),
    cls: el.className ? String(el.className).split(/\s+/)[0] : '',
    childrenHtml: '',
  };

  if (depth < maxDepth) {
    const kids: string[] = [];
    const children = el.children;
    for (let i = 0; i < children.length && i < 200; i++) {
      const child = children[i];
      if (!child || (child as Element).nodeType !== 1 || !(child as Element).tagName) continue;
      const childView = walkIframeNode(child, depth + 1, maxDepth);
      if (childView) kids.push(renderIframeNodeHtml(childView));
    }
    view.childrenHtml = kids.join('');
  }
  return view;
}

function renderIframeNodeHtml(view: IframeNodeView): string {
  const classChip = view.cls ? '<span class="td-structure-class">.' + escapeHtml(view.cls) + '</span>' : '';
  const children = view.childrenHtml
    ? '<div class="td-structure-children">' + view.childrenHtml + '</div>'
    : '';
  return (
    '<div class="td-structure-node" data-mf-iframe-wrap="1">' +
      '<button type="button" class="td-structure-item mf-tlr-iframe-node"' +
        ' data-mf-iframe-selector="' + escapeAttr(view.selector) + '"' +
        ' title="' + escapeAttr(view.selector) + '">' +
        '<span class="td-structure-label">' + escapeHtml(view.label) + '</span>' +
        classChip +
      '</button>' +
      children +
    '</div>'
  );
}

/**
 * Auto-generated DOM-tree fallback used when customHtml is empty.
 *
 * Walks `iframe.contentDocument.body` and surfaces nodes that either carry
 * a `mf-*` class, have an `id`, or have a non-zero visible bounding box and
 * a semantic tag. Click any node → routes through the inspect picker flow
 * (computes selector + computed styles, posts to iframe to enter inspect
 * state, renders inside the INSPECT pane via the existing receiver).
 */
function buildIframeFallbackTree(): string {
  const doc = getPreviewIframeDoc();
  if (!doc || !doc.body) return '';
  const roots: string[] = [];
  const topChildren = doc.body.children;
  for (let i = 0; i < topChildren.length && i < 50; i++) {
    const child = topChildren[i];
    if (!child || (child as Element).nodeType !== 1 || !(child as Element).tagName) continue;
    const view = walkIframeNode(child as HTMLElement, 0, 8);
    if (view) roots.push(renderIframeNodeHtml(view));
  }
  if (!roots.length) return '';
  return '<div class="td-structure-root mf-tlr-iframe-tree">' + roots.join('') + '</div>';
}

/**
 * Wire click handlers on the iframe-fallback tree nodes. Clicking a node
 * routes through the inspect picker flow:
 *   1. Find the matching element in the iframe via the stored selector.
 *   2. Read its computed styles for INSPECT_KEYS.
 *   3. Call renderInspectPick(...) the same way the iframe picker callback
 *      would, so the INSPECT pane lights up with the keys/values + the
 *      live edit inputs (free re-use of the picker UI).
 *   4. Switch the user to the INSPECT tab so they see the result.
 */
const IFRAME_INSPECT_KEYS = [
  'display','position','width','height','min-width','min-height','max-width','max-height',
  'margin','padding','border','border-radius','background','background-color','background-image',
  'color','font-family','font-size','font-weight','line-height','letter-spacing','text-align',
  'box-shadow','outline','opacity','overflow','flex','gap','grid-template-columns','transition',
  'cursor','z-index',
];

function readIframeNodeStyles(el: HTMLElement, win: Window): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const cs = win.getComputedStyle(el);
    for (const k of IFRAME_INSPECT_KEYS) {
      const v = cs.getPropertyValue(k);
      if (v && String(v).trim()) out[k] = String(v).trim();
    }
  } catch { /* noop */ }
  return out;
}

function buildIframeBreadcrumb(el: HTMLElement): string[] {
  const crumbs: string[] = [];
  let cur: HTMLElement | null = el;
  let stop = 0;
  while (cur && cur.nodeType === 1 && stop < 8) {
    const tag = String(cur.tagName || '').toLowerCase();
    let label = tag;
    if (cur.id) label = tag + '#' + cur.id;
    else {
      const cls = String(cur.className || '').split(/\s+/).filter((c) => !!c && c.indexOf('mf-') === 0)[0];
      if (cls) label = tag + '.' + cls;
    }
    crumbs.unshift(label);
    if (tag === 'body' || tag === 'html') break;
    cur = cur.parentElement;
    stop++;
  }
  return crumbs;
}

function wireIframeFallbackTree(panel: HTMLElement): void {
  const treeBox = panel.querySelector<HTMLElement>('#td-structure-tree');
  if (!treeBox) return;
  treeBox.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const btn = target?.closest<HTMLElement>('.mf-tlr-iframe-node[data-mf-iframe-selector]');
    if (!btn) return;
    event.preventDefault();

    const selector = btn.getAttribute('data-mf-iframe-selector') || '';
    if (!selector) return;

    // Mark selection visually.
    treeBox.querySelectorAll<HTMLElement>('.mf-tlr-iframe-node.active').forEach((n) => n.classList.remove('active'));
    btn.classList.add('active');

    // Resolve the live element in the iframe and re-use the inspect picker
    // rendering so the INSPECT pane lights up with editable rows.
    const frame = document.querySelector('.mf-theme-preview-frame') as HTMLIFrameElement | null;
    const doc = frame?.contentDocument || frame?.contentWindow?.document || null;
    const win = frame?.contentWindow || null;
    if (!doc || !win) {
      // Defensive — should not happen because we just rendered from this doc.
      return;
    }

    let el: HTMLElement | null = null;
    try { el = doc.querySelector<HTMLElement>(selector); } catch { el = null; }
    if (!el) return;

    const styles = readIframeNodeStyles(el, win as Window);
    const crumbs = buildIframeBreadcrumb(el);

    // Switch to INSPECT tab so the user sees the resulting key/value rows.
    switchTab(panel, 'inspect');

    // Re-use the existing picker renderer for parity with the click-to-pick
    // flow (live edit inputs, theme-var badges, postMessage on change, etc).
    renderInspectPick(selector, crumbs, styles);
  });
}

function mountStructureTree(panel: HTMLElement): void {
  const treeBox = panel.querySelector<HTMLElement>('#td-structure-tree');

  // 1. Try the original customHtml-backed tree first.
  const customHtml = readDraftCustomHtml();

  if (customHtml) {
    if (state.structureTree) {
      state.structureTree.refresh();
      return;
    }

    try {
      const tree = new ThemeDesignerTemplateTree({
        root: panel,
        getTemplateHtml: () => readDraftCustomHtml(),
        getPreviewDocument: () => getPreviewIframeDoc() || document,
        focusTemplatePath: (templatePath: string) => {
          document.dispatchEvent(new CustomEvent('mf:theme-structure-focus', { detail: { templatePath } }));
          return true;
        },
        getBaseCss:      () => '',
        getInspectorCss: () => '',
      });
      tree.bind();
      tree.refresh();
      state.structureTree = tree;
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ThemeLeftRail] customHtml structure tree mount failed; falling back to iframe scan', err);
      // Drop through to the iframe fallback below.
    }
  }

  // 2. Fallback: build a tree directly from the rendered iframe DOM. This
  //    keeps STRUCTURE useful for forms that DON'T set customHtml (e.g.
  //    standard schema-rendered forms like form 333), where the previous
  //    behaviour was a dead "No customHtml structure found" message.
  if (!treeBox) return;

  // [B64b-StructureRetryAggressive] Poll fast + MutationObserver on iframe body
  // so STRUCTURE always picks up content the moment it lands, instead of
  // dying with "Preview not ready". The retry self-cancels when treeBox is
  // removed (tab switch) so it cannot leak. We also re-fetch the iframe doc
  // on each attempt because the iframe re-loads on theme switch.
  let attempts = 0;
  const MAX_ATTEMPTS = 40;
  let mo: MutationObserver | null = null;
  const cleanup = (): void => { if (mo) { try { mo.disconnect(); } catch { /* noop */ } mo = null; } };
  const tryRender = (): void => {
    if (!treeBox || !treeBox.isConnected) { cleanup(); return; }
    let html = '';
    try { html = buildIframeFallbackTree(); } catch { html = ''; }
    if (html) {
      treeBox.innerHTML = html;
      wireIframeFallbackTree(panel);
      cleanup();
      return;
    }
    attempts++;
    if (attempts === 1) {
      treeBox.innerHTML =
        '<div class="td-structure-empty mf-tlr-empty">Loading iframe structure…</div>';
      // Attach observer once on first miss so any iframe mutation fires retry
      try {
        const doc = getPreviewIframeDoc();
        const target: Node | null = doc ? (doc.getElementById('mf-mount') || doc.body) : null;
        if (target) {
          mo = new MutationObserver(() => { tryRender(); });
          mo.observe(target, { childList: true, subtree: true });
        }
      } catch { /* noop */ }
    }
    if (attempts >= MAX_ATTEMPTS) {
      treeBox.innerHTML =
        '<div class="td-structure-empty mf-tlr-empty">Preview not ready yet. Click STRUCTURE again after the form preview finishes loading.</div>';
      cleanup();
      return;
    }
    setTimeout(tryRender, 250);
  };
  tryRender();
}

/* ── 8. CSS — installed once per session ──────────────────────────── */

/**
 * Install minimal styling once. Most rules use existing palette classes;
 * we add only the bits unique to the utility tools (font tiles, image
 * card, inspect breadcrumb, crosshair cursor for inspect mode).
 */
function ensureInspectCssInstalled(): void {
  if (document.getElementById('mf-theme-left-rail-css')) return;
  const css =
    /* shared utility-tool layout ─────────────────────────────────── */
    '.mf-tlr-section{padding:8px 12px}' +
    '.mf-tlr-section-hd{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#475569;margin:4px 0 6px;display:flex;align-items:center;gap:6px}' +
    '.mf-tlr-section-sub{font-size:11px;color:#64748b;margin-bottom:10px;line-height:1.45}' +
    '.mf-tlr-section-sub code{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:10px}' +
    '.mf-tlr-count{display:inline-block;background:#e0e7ff;color:#4338ca;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:600}' +
    '.mf-tlr-empty{padding:10px;font-size:12px;color:#94a3b8;text-align:center;border:1px dashed #e2e8f0;border-radius:6px;background:#f8fafc}' +

    /* buttons ────────────────────────────────────────────────────── */
    '.mf-tlr-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;font-size:12px;cursor:pointer;transition:all .15s}' +
    '.mf-tlr-btn:hover{border-color:#8b5cf6;color:#6d28d9}' +
    '.mf-tlr-btn-primary{background:#8b5cf6;color:#fff;border-color:#8b5cf6}' +
    '.mf-tlr-btn-primary:hover{background:#7c3aed;color:#fff}' +
    '.mf-tlr-btn-ghost{background:transparent;border-color:#e2e8f0;color:#64748b}' +
    '.mf-tlr-btn.active{background:#ede9fe;color:#6d28d9;border-color:#8b5cf6}' +

    /* IMAGES pane ────────────────────────────────────────────────── */
    '.mf-tlr-img-actions{display:flex;gap:6px;margin-bottom:10px}' +
    '.mf-tlr-img-current{border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;background:#fff}' +
    '.mf-tlr-img-current img{display:block;width:100%;max-height:160px;object-fit:cover;background:#f8fafc}' +
    '.mf-tlr-img-meta{padding:6px 8px;font-size:10px;color:#64748b;border-top:1px solid #f1f5f9;word-break:break-all}' +
    '.mf-tlr-img-apply-row{margin-top:8px;display:flex;justify-content:flex-end}' +

    /* FONTS pane ─────────────────────────────────────────────────── */
    '.mf-tlr-font-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}' +
    '.mf-tlr-font-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 8px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;transition:all .15s;min-height:96px;text-align:center}' +
    '.mf-tlr-font-tile:hover{border-color:#8b5cf6;background:#faf5ff;transform:translateY(-1px)}' +
    '.mf-tlr-font-tile.active{border-color:#8b5cf6;background:#ede9fe;box-shadow:0 0 0 2px rgba(139,92,246,.18)}' +
    '.mf-tlr-font-preview{font-size:28px;line-height:1;font-weight:600;color:#0f172a}' +
    '.mf-tlr-font-name{margin-top:6px;font-size:12px;color:#334155;font-weight:500}' +
    '.mf-tlr-font-cat{margin-top:2px;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}' +

    /* INSPECT pane ───────────────────────────────────────────────── */
    '.mf-tlr-inspect-actions{display:flex;gap:6px;margin-bottom:10px}' +
    '#mf-tlr-inspect-toggle{flex:1;justify-content:center}' +
    '.mf-tlr-inspect-result{border:1px solid #e2e8f0;border-radius:6px;background:#fff;padding:8px;min-height:120px;max-height:280px;overflow-y:auto}' +
    '.mf-tlr-inspect-sel{font-family:Consolas,Menlo,monospace;font-size:11px;color:#0f172a;background:#f1f5f9;padding:4px 6px;border-radius:4px;margin-bottom:6px;word-break:break-all}' +
    '.mf-tlr-inspect-crumbs{font-size:10px;color:#64748b;margin-bottom:8px;line-height:1.6}' +
    '.mf-tlr-crumb{display:inline-block;background:#eef2ff;color:#4338ca;padding:1px 5px;border-radius:3px;margin:1px}' +
    '.mf-tlr-crumb-sep{color:#cbd5e1;margin:0 2px}' +
    '.mf-tlr-inspect-styles{border-top:1px solid #f1f5f9;padding-top:6px}' +
    '.mf-tlr-inspect-hint{font-size:10px;color:#64748b;margin:4px 0 8px;font-style:italic}' +
    '.mf-tlr-style-row{display:flex;align-items:center;gap:6px;padding:3px 0;font-size:10px;border-bottom:1px solid #f8fafc;transition:background .2s}' +
    '.mf-tlr-style-key{color:#64748b;font-family:Consolas,Menlo,monospace;flex:0 0 40%;word-break:break-all;display:flex;align-items:center;gap:4px}' +
    '.mf-tlr-style-val{color:#0f172a;font-family:Consolas,Menlo,monospace;flex:1;word-break:break-all;text-align:right}' +
    '.mf-tlr-style-val-input{flex:1;min-width:0;border:1px solid #e2e8f0;border-radius:4px;padding:3px 6px;font-family:Consolas,Menlo,monospace;font-size:10px;color:#0f172a;background:#fff;text-align:right;outline:none;transition:border-color .15s,box-shadow .15s}' +
    '.mf-tlr-style-val-input:hover{border-color:#cbd5e1}' +
    '.mf-tlr-style-val-input:focus{border-color:#8b5cf6;box-shadow:0 0 0 2px rgba(139,92,246,.15);text-align:left}' +
    '.mf-tlr-style-themed{display:inline-block;background:#ede9fe;color:#6d28d9;border-radius:3px;padding:0 4px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}' +
    '.mf-tlr-style-flash{background:#fef3c7}' +

    /* INSPECT MODE — crosshair on the preview iframe ──────────────── */
    'body.mf-theme-inspect-mode iframe.mf-theme-preview-frame{cursor:crosshair !important}' +
    'body.mf-theme-inspect-mode .mf-theme-preview-frame{outline:2px dashed #8b5cf6;outline-offset:-2px}' +

    /* STRUCTURE pane ──────────────────────────────────────────────── */
    '.mf-tlr-structure-tree{min-height:120px;max-height:380px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;background:#fff;padding:6px}' +
    /* Fallback tree styling (iframe-DOM scan when customHtml is empty).
       These mirror megaform-theme-designer.css `.td-structure-*` so the
       tree renders identically inside the builder shell, where the full
       designer CSS bundle is NOT loaded. */
    '.td-structure-root{display:flex;flex-direction:column;gap:4px}' +
    '.td-structure-node{display:flex;flex-direction:column;gap:4px}' +
    '.td-structure-children{display:flex;flex-direction:column;gap:4px;padding-left:12px;border-left:1px dashed #e2e8f0;margin-left:8px;margin-top:4px}' +
    '.td-structure-item{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;border:1px solid #e2e8f0;border-radius:6px;background:#fff;padding:5px 7px;font-size:11px;color:#334155;cursor:pointer;transition:border-color .12s,background .12s,box-shadow .12s}' +
    '.td-structure-item:hover{border-color:#8b5cf6;background:#faf5ff;color:#6d28d9}' +
    '.td-structure-item.active{border-color:#8b5cf6;background:#f5f3ff;color:#6d28d9;box-shadow:0 0 0 2px rgba(139,92,246,.18)}' +
    '.td-structure-label{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}' +
    '.td-structure-class{flex-shrink:0;padding:1px 6px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:10px;font-weight:600;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Menlo,Consolas,monospace}' +
    '.td-structure-empty{padding:10px;font-size:11px;color:#94a3b8;text-align:center;font-style:italic}';

  const style = document.createElement('style');
  style.id = 'mf-theme-left-rail-css';
  style.textContent = css;
  document.head.appendChild(style);
}

/* ── 9. ANIMATION ────────────────────────────────────────────────── */

/**
 * Fade-out (100 ms) → mutate content → fade-in via canonical
 * `--mf-input-transition` token. Matches the pre-B53 cross-fade rhythm.
 */
function fadeSwap(panel: HTMLElement, mutate: () => void): void {
  const prevTransition = panel.style.transition;

  panel.style.transition = 'opacity 100ms ease-in-out';
  panel.style.opacity    = '0';

  window.setTimeout(() => {
    mutate();
    void panel.offsetHeight; // force reflow
    panel.style.transition = 'opacity var(--mf-input-transition, 0.15s ease-in-out)';
    panel.style.opacity    = '1';
    window.setTimeout(() => {
      panel.style.transition = prevTransition;
    }, 160);
  }, 105);
}

/* ── 10. RE-BINDING PALETTE TABS AFTER RESTORE ───────────────────── */

/**
 * After restoring the palette HTML snapshot, the original click handlers
 * bound in canvas.ts initPaletteTabs() point at GC'd nodes. Re-bind
 * inline so BASIC | LAYOUT | WIDGETS works again — no changes needed
 * in canvas.ts.
 */
function rebindPaletteTabs(): void {
  const tabs = document.querySelectorAll<HTMLElement>('.mf-ptab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', function (this: HTMLElement, e: Event) {
      e.preventDefault();
      const cat = this.getAttribute('data-cat');
      tabs.forEach((t) => t.classList.remove('active'));
      this.classList.add('active');
      document.querySelectorAll<HTMLElement>('.mf-palette-cat').forEach((p) => { p.style.display = 'none'; });
      const target = document.getElementById('mf-pcat-' + cat);
      if (target) target.style.display = '';
    });
  });
}

/* ── 11. UTILITIES ───────────────────────────────────────────────── */

function getLeftPanel(): HTMLElement | null {
  return document.getElementById('mf-panel-left');
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/* ── 12. DEBUG / BUILD MARKER ────────────────────────────────────── */

const THEME_LEFT_RAIL_BADGE = 'ThemeLeftRail v20260604-B73-MockAligned';
if (typeof window !== 'undefined') {
  (window as any).__MF_THEME_LEFT_RAIL_BADGE__ = THEME_LEFT_RAIL_BADGE;
}
