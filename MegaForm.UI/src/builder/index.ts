/* ============================================================
   MegaForm Builder — Vite Bundle Entry Point
   File: src/builder/index.ts

   STRATEGY: All legacy modules are imported in execution order.
   Each module runs as a side effect inside Rollup's shared IIFE
   scope, so var declarations from earlier modules are visible to
   later ones — exactly like separate <script> tags.

   Import order MUST match the original <script> tag order in
   Builder.cshtml / FormEdit.ascx.

   NOT bundled here (kept as separate <script> tags):
     - megaform-widgets.js        (plugin registry, loads before us)
     - plugin scripts             (register into MegaFormWidgets)
     - megaform-renderer.js       (front-end renderer, separate concern)
     - megaform-rule-engine.js    (main/ version, used by renderer too)
     - megaform-workflow-reactflow.js (heavy optional, external deps)
   ============================================================ */

// ── 0. Field Plugin Registry — PHẢI load trước core ──────────────
//    Registry expose window.MFFieldPlugins
//    core.ts dùng fieldTypes, dom.ts dùng renderCategory()
import './field-plugins/_registry';  // singleton registry
import './field-plugins/_index';     // đăng ký tất cả built-in plugins

// ── 1. Core — sets up window.MegaFormBuilder + module registry ──
import './core';
import './html-sync';

// ── 2. Canvas — palette, drag-drop, field rendering ─────────────
import './canvas';

// ── 3. Toolbar — save / publish / preview ───────────────────────
import './toolbar';

// ── 4. Properties — right panel field properties (9 sections) ───
import './properties';

// ── 5. Properties patch — activateTab fix ───────────────────────
import './properties-patch';

// ── 6. Templates — import/export + 6 built-in templates ─────────
import './templates';

// ── 7. Panels — initBuilder, setStatus, initGallery, bootApp ────
import './panels';

// ── 8. Presets — 50 preset form templates ───────────────────────
import './presets';
import './permissions/flag';

// ── 9. Phase2 — views manager + permissions manager ─────────────
import './phase2';

// ── 10. Rule Engine (builder) — rule evaluation logic ───────────
import './rule-engine';

// ── 11. Rule Builder — visual rule tree editor ──────────────────
import './rule-builder';

// ── 12. Rule Builder UI — integrates rule editor into right panel
import './rule-builder-ui';

// ── 13. Workflow Canvas — NOT bundled here ───────────────────────
//    Compiled separately → js/builder/megaform-workflow-reactflow.js
//    Loaded as external script AFTER this bundle (see Builder.cshtml, loader.js, FormEdit.ascx.cs)
//    Build with: npm run build:workflow

// ── 14. Print Settings — print tab UI ───────────────────────────
import './print-settings';

// ── 15. Fields — tab registry (session 210d) ────────────────────
import './fields';

// ── 15b. Theme Tab Adapter — [ThemeTab v20260602-B48] ──────────
//    Installs window.MFThemeTabAdapter and registers a 'theme-tab-adapter'
//    module with B.registerModule. Mounted inline by dom.ts's THEME tab
//    (10th right-rail tab, between HTML and DB). Reads/writes the same
//    settings.theme + cssOverrides + customCss + themeJson keys that the
//    legacy stand-alone Theme Designer (#td-root) uses, so saves are
//    portable across the two surfaces. MUST load BEFORE dom.ts so the
//    THEME tab click handler finds the adapter already installed on
//    window. Side-effect-only import — no symbol used here.
import './theme-tab-adapter';

// ── 15c. Theme Left Rail — [ThemeLeftRail v20260602-B48] ──────
//    Listens for 'mf:theme-tab-activated' / 'mf:theme-tab-deactivated'
//    CustomEvents and swaps left rail content between palette
//    (BASIC/LAYOUT/WIDGETS) and theme nav (PRESETS/ELEMENTS/COLORS/
//    STRUCTURE). Side-effect-only import — installs window event bridge.
import './theme-left-rail';

// ── 16. DOM — generates all builder HTML from #mf-builder-root ──
import './dom';
import './permissions/init';

// ── 17. Gallery — template gallery state manager ────────────────
import './gallery';

// ── 18. Post Submit Experience — rich ending page editor ───────
import './post-submit-settings';

// ── 18a. Integration Settings — Custom URL + Google Analytics ───
import './integration-settings';

// ── 18b. Token Designer — modal popup for HTML tokens + image gallery
import './token-designer';

// ── 18c. Slider + ImageChoice designers — popup editors that reuse the
//        Token Designer image upload + gallery helpers
import './slider-designer';
import './imagechoice-designer';
// [Composite v1.3] Composite Controls designer (Phone / Name / Address sub-inputs)
import './composite-designer';

// ── 19. DB Tables Panel — drag/drop SQL tables → DataGrid ──────
//    Floating FAB "DB" bottom-right of builder. Fetches /Subform/Tables
//    + /Subform/Columns to introspect DashboardDatabase. Adds a Subform
//    (DataGrid) field auto-configured from a table, or drag individual
//    column chips onto canvas to create matching input fields.
import './db-tables-panel';

// ── 20. Razor — Unified Designer adapter + launcher (B39 step 2) ──
//    Wraps the legacy Razor Studio recipe gallery as a UnifiedTabApi
//    factory (adapter) and injects a "🧬 Open Unified Designer" button
//    next to the existing "Razor Studio" launcher on every Razor field
//    card. Adapter must register BEFORE launcher (launcher imports it).
import '../widgets/plugins/megaform-razor-studio-adapter';
import '../widgets/plugins/megaform-razor-launcher';

// ── 21. DynamicLabel — Unified Designer adapter + launcher (B39 step 3) ──
//    Wraps DynamicLabel Templates/Rendering/Display/Presets as a
//    UnifiedTabApi factory (adapter) and injects a "🧬 Open Unified
//    Designer" button on every DynamicLabel field card. Adapter must
//    register BEFORE launcher (launcher imports it). SQL config is
//    owned by the shell's built-in Data tab, not the adapter.
import '../widgets/plugins/megaform-dynlabel-adapter';
import '../widgets/plugins/megaform-dynlabel-launcher';

// ── 22. DataRepeater — Unified Designer adapter + launcher (B40 step 4) ──
//    SQL config owned by built-in Data tab (Q5); adapter owns Columns/
//    Filters/Detail/Templates/Display. Eager adapter import (NOT lazy):
//    UnifiedTabSpec.render is synchronous — see launcher header for the
//    full rationale. Adapter must register BEFORE launcher.
import '../widgets/plugins/megaform-datarepeater-adapter';
import '../widgets/plugins/megaform-datarepeater-launcher';

// ── 23. UserTemplate — BYOM widget plugin (B41 L2) ──
//    Registers a new field type "UserTemplate" that hosts customer
//    .cshtml/.html/.ascx files from Resources/UserTemplates/. Templates
//    discovered via /DesktopModules/MegaForm/API/UserTemplate/List.
import '../widgets/plugins/megaform-widget-user-template';

// ── 24. UserTemplate — Unified Designer Launcher (B41 L3) ──
//    Injects a "🧬 Open Unified Designer" button on every BYOM
//    UserTemplate field card and opens a Source (Monaco) + Params
//    tab pair. Source GET/POST goes to /API/UserTemplate/Source;
//    bind() in the L2 plugin handles runtime /Render hydration.
import '../widgets/plugins/megaform-widget-user-template-launcher';

// ── 26. VideoEmbed — popup designer + canvas launcher (B42) ──
//    Designer must register BEFORE the launcher (the launcher
//    reads window.MFVideoDesigner). The designer turns pasted
//    YouTube / Vimeo / Loom URLs into ready-to-paste <iframe>
//    embed code; the launcher injects a "🎬 Edit Video" button
//    onto every VideoEmbed field card in the Builder canvas.
import './video-designer';
import '../widgets/plugins/megaform-widget-video-launcher';

// ── 27. Map (OpenStreetMap, no API key) — runtime + popup designer + launcher (B42) ──
//    NEW FieldType "Map" for display-only location pinning. Distinct from the
//    Geolocation widget (which captures GPS and may use a Google Maps API key) —
//    Map is read-only chrome built on OSM's keyless embed URL.
//      • megaform-widget-map.ts          — MegaFormWidgets.register("Map", ...)
//                                          renders an OSM iframe; bbox math is
//                                          derived from lat/lng/zoom client-side.
//      • map-designer.ts                  — popup with Nominatim address search,
//                                          zoom slider, color picker, live
//                                          preview iframe. window.MFMapDesigner.
//      • megaform-widget-map-launcher.ts — injects "🗺️ Edit Location" button
//                                          on every Map field card in canvas.
//    Designer must register BEFORE the launcher (launcher reads
//    window.MFMapDesigner). Mirrors the video / slider designer pattern.
import '../widgets/plugins/megaform-widget-map';
import './map-designer';
import '../widgets/plugins/megaform-widget-map-launcher';

// ── 28. Theme route redirect + initial-tab auto-activator (B48, 2026-06-02) ──
//    The standalone #mf-theme route has been retired. Theme Designer now lives
//    inline as a right-rail tab inside the Builder. If a user lands on
//    #mf-theme (deep link, bookmark, legacy nav), rewrite to #mf-builder and
//    stash a sessionStorage flag so dom.ts's activateTab() opens the THEME
//    pane immediately on mount instead of the default 'field' pane.
//    The DNN ASCX shell performs the same redirect server-side; this block
//    is the JS-side fallback for any code path that bypasses the ASCX gate
//    (e.g. Oqtane host, post-mount hash mutations).
(function bootstrapThemeHashRedirect() {
  try {
    if (typeof window === 'undefined') return;
    var hash = String((window.location && window.location.hash) || '').toLowerCase();
    if (hash.indexOf('#mf-theme') === 0) {
      try { sessionStorage.setItem('mf-builder-initial-tab', 'theme'); } catch (_) {}
      try {
        var newUrl = window.location.pathname + (window.location.search || '') + '#mf-builder';
        window.history.replaceState({}, document.title, newUrl);
      } catch (_) {
        try { window.location.hash = '#mf-builder'; } catch (_e) {}
      }
    }
  } catch (_) {}
})();

// ── 29. Initial right-rail tab dispatcher (B48, 2026-06-02) ──
//    Reads sessionStorage('mf-builder-initial-tab') and, on first paint,
//    simulates a click on the matching .mf-right-tab[data-tab=…] link so
//    the properties-patch.ts delegated click handler does the actual tab
//    swap (hides all panes, shows target, toggles active class). Using
//    the existing click pipeline means we don't need to duplicate the
//    show/hide logic here and we automatically inherit any future tabs.
//    The flag is consumed (deleted) after the first successful activation
//    so a later page refresh without the redirect won't sticky-open
//    THEME.
(function bootstrapInitialRightTab() {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    var tabId = '';
    try { tabId = sessionStorage.getItem('mf-builder-initial-tab') || ''; } catch (_) { return; }
    if (!tabId) return;
    var attempts = 0;
    var maxAttempts = 60; // ≈ 60 * 200ms = 12s, covers slow DNN admin-shell init
    function tryActivate() {
      attempts++;
      var link = document.querySelector('.mf-right-tab[data-tab="' + tabId + '"]') as HTMLElement | null;
      if (link) {
        try { sessionStorage.removeItem('mf-builder-initial-tab'); } catch (_) {}
        try { link.click(); } catch (_) {}
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(tryActivate, 200);
      } else {
        // Give up — leave default 'field' tab active. Clear the flag so we
        // don't retry on the next reload.
        try { sessionStorage.removeItem('mf-builder-initial-tab'); } catch (_) {}
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryActivate, { once: true });
    } else {
      setTimeout(tryActivate, 0);
    }
  } catch (_) {}
})();
