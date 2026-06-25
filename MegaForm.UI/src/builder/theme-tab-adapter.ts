/* ============================================================
   MegaForm Builder — Theme Tab Adapter
   File: src/builder/theme-tab-adapter.ts

   [ThemeTab v20260602-B49b]
   Inline Theme Designer panels mounted INSIDE the right-rail
   "Theme Designer" tab (Builder dom.ts #mf-tab-theme), so the
   user no longer has to leave the Builder to restyle their form.

   B49 adds the 5th sub-tab "Custom" with two textareas:
     - Custom CSS — appended to form stylesheet at runtime
     - Custom HTML Wrapper — wraps form with {{form}} placeholder
   Both persist into settings.customCss / settings.customHtml,
   matching the standalone Theme Designer save schema.

   B49b adds the 6th sub-tab "HTML" with:
     - "Use Custom HTML Template" toggle (settings.useCustomHtml)
     - Full custom template textarea using {{field:key}} placeholders
       — the runtime renderer swaps the auto-generated field layout for
         this template when the toggle is ON
     - Click-to-insert field-key reference list scraped from
       state.schema.fields (covers Row columns + FlexGrid items)
     - Preview button opening /xx?formid=N in a new tab
   The legacy "Custom HTML Wrapper" textarea in CSS sub-tab and the new
   "Full Custom HTML Template" textarea in HTML sub-tab share the same
   settings.customHtml backing state — keystroke mirroring keeps them
   in lockstep when the user switches sub-tabs mid-edit.

   What this module does:
     1. registerThemeAdapter() — side-effect singleton install on
        window.MFThemeTabAdapter so dom.ts can call activate /
        deactivate without an explicit import.
     2. activateThemeTab() — mount the four panels (Colors / Type /
        Space / Effects) inside the supplied container, hydrate
        from state.schema.settings (theme + cssOverrides + customCss
        + themeJson), and start listening for control changes.
     3. deactivateThemeTab() — flush pending edits back to schema,
        notify canvas to re-render, remove change listeners.

   Storage model (matches Theme Designer SaveTheme payload):
       state.schema.settings.theme         — preset id (string)
       state.schema.settings.cssOverrides  — Record<string,string>
                                             (--mf-* CSS var dict)
       state.schema.settings.customCss     — compiled CSS string
       state.schema.settings.themeJson     — JSON {_kind, theme,
                                             cssOverrides, customCss}

   Live preview: a <style id="mf-builder-theme-overrides"> tag is
   appended to <head>. It writes the active --mf-* vars onto
   #mf-canvas-dropzone .mf-form-wrapper so the builder canvas
   updates instantly without an iframe round-trip.

   Bridge events to canvas.ts (initThemeModeBridge):
       window dispatch 'mf:theme-tab-activated'
       window dispatch 'mf:theme-tab-deactivated'
   The dispatching is the caller's job (dom.ts wires the click) —
   this module accepts being called by either side.
   ============================================================ */

import { MegaFormBuilder } from './core';

(function () {
    'use strict';

    if (typeof window !== 'undefined') {
        // [B56 FIX C] badge bump — Visual QA Right-rail Theme tools.
        //   Fixes the entire chain: user input → setVar → flushPreview →
        //   iframe receives message → form actually changes.
        //   Root causes patched in B56:
        //   (1) buildOverridesCss() split into canvas + iframe variants —
        //       iframe selectors target ":root, body, .mf-form-wrapper,
        //       .mf-form, .mf-form-inner, #mf-mount" because the iframe
        //       document does NOT contain #mf-canvas-dropzone.
        //   (2) customCss un-scoped for iframe (the bogus
        //       "#mf-canvas-dropzone {}" prefix is stripped).
        //   (3) Preset clicks now request iframe srcdoc rebuild via
        //       canvas re-render bridge (so theme-class CSS that lives
        //       in megaform-themes.css picks up).
        //   (4) Apply + Reset force canvas re-render AND flushPreview so
        //       the iframe sees both class + CSS + raw HTML.
        //   (5) Toggle event ('change') now dispatches through the same
        //       onInputDelegated path that handles 'input'.
        (window as any).__MF_THEME_TAB_ADAPTER_BADGE__ = 'ThemeTabAdapter v20260622-B232';
    }

    var B = MegaFormBuilder;

    // ── Module state (singleton — one Theme tab per Builder) ─────────
    var activeContainer: HTMLElement | null = null;
    var changeListenersBound = false;
    var lastInjectedCss = '';
    var live: Record<string, string> = {};
    var currentTheme = 'default';
    var currentCustomCss = '';
    var currentCustomHtml = '';
    var currentUseCustomHtml = false;
    // [B269] Page-theme inheritance (inline embeds only). Persisted as plain settings
    // booleans (not CSS vars); the server turns them into the .mf-inherit-type wrapper class
    // (typography) and injected scoped --mf-* borrow vars (colours). Effect is only visible on
    // the published inline page (the builder preview has no real host skin to inherit from).
    var currentInheritType = false;
    var currentInheritColors = false;

    var THEME_STYLE_TAG_ID = 'mf-builder-theme-overrides';

    // ── 12 presets — must stay in sync with theme-designer/index.ts ──
    interface ThemePreset {
        id: string;
        name: string;
        primary: string;
        secondary: string;
        tertiary: string;
    }
    var PRESETS: ThemePreset[] = [
        { id: 'default',         name: 'Default',         primary: '#3b82f6', secondary: '#eff6ff', tertiary: '#e0f2fe' },
        { id: 'modern-blue',     name: 'Modern Blue',     primary: '#667eea', secondary: '#764ba2', tertiary: '#e8e8ff' },
        { id: 'warm-sunset',     name: 'Warm Sunset',     primary: '#ff6b35', secondary: '#ffd4bc', tertiary: '#fff8f0' },
        { id: 'dark-elegance',   name: 'Dark Elegance',   primary: '#e94560', secondary: '#1a1a2e', tertiary: '#16213e' },
        { id: 'nature-green',    name: 'Nature Green',    primary: '#2d8a4e', secondary: '#c8e6c9', tertiary: '#f0f7f0' },
        { id: 'flat-material',   name: 'Material',        primary: '#1976d2', secondary: '#e3f2fd', tertiary: '#fafafa' },
        { id: 'classic-formal',  name: 'Classic Formal',  primary: '#8b4513', secondary: '#d5c7b5', tertiary: '#f8f4ef' },
        { id: 'playful',         name: 'Playful',         primary: '#ff6b6b', secondary: '#ffd3d3', tertiary: '#ffecd2' },
        { id: 'healthcare',      name: 'Healthcare',      primary: '#0077b6', secondary: '#b5d4e8', tertiary: '#f0f8ff' },
        { id: 'executive',       name: 'Executive',       primary: '#c9a84c', secondary: '#2a2a2a', tertiary: '#1c1c1c' },
        { id: 'tech-startup',    name: 'Tech Startup',    primary: '#38ef7d', secondary: '#141432', tertiary: '#0a0a23' },
        { id: 'minimal',         name: 'Minimal',         primary: '#1a1a1a', secondary: '#f8f8f8', tertiary: '#ffffff' }
    ];

    var FONT_OPTIONS = [
        'Inter', 'Georgia', 'Roboto', 'Nunito', 'Playfair Display',
        'Open Sans', 'Lato', 'Merriweather'
    ];

    function fontStackForFamily(family: string): string {
        var clean = String(family || 'Inter').replace(/['"]/g, '').trim() || 'Inter';
        var serif = /georgia|merriweather|playfair/i.test(clean);
        return "'" + clean + "', " + (serif ? 'Georgia, serif' : 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
    }

    var KNOWN_PREMIUM_VAR_PREFIXES = ['mfp', 'au', 'bg', 'fr', 'it', 'aur', 'nola', 'hw', 'ey'];

    function pickThemeVar(vars: Record<string, string>, names: string[], fallback?: string): string {
        for (var i = 0; i < names.length; i++) {
            var value = vars[names[i]];
            if (value != null && String(value).trim() !== '') return String(value);
        }
        return fallback || '';
    }

    function putThemeAlias(out: Record<string, string>, source: Record<string, string>, name: string, value: string): void {
        if (!name || !value || source[name] != null || out[name] != null) return;
        out[name] = value;
    }

    function detectPremiumVarPrefixes(templateText: string): string[] {
        var found: Record<string, true> = {};
        KNOWN_PREMIUM_VAR_PREFIXES.forEach(function (prefix) { found[prefix] = true; });
        var text = String(templateText || '');
        var re = /--([a-z][a-z0-9]{1,14})-[a-z0-9_-]+/gi;
        var match: RegExpExecArray | null;
        while ((match = re.exec(text))) {
            var prefix = String(match[1] || '').toLowerCase();
            if (!prefix || prefix === 'mf') continue;
            found[prefix] = true;
        }
        return Object.keys(found);
    }

    function buildPremiumThemeAliasVars(vars: Record<string, string>, templateText: string): Record<string, string> {
        var out: Record<string, string> = {};
        var primary = pickThemeVar(vars, ['--mf-primary', '--mf-btn-bg', '--primary', '--mfp-primary']);
        var primaryHover = pickThemeVar(vars, ['--mf-primary-hover', '--mf-btn-hover-bg', '--mf-btn-bg-hover'], primary);
        var primaryLight = pickThemeVar(vars, ['--mf-primary-light', '--mf-accent', '--accent', '--muted'], primary);
        var pageBg = pickThemeVar(vars, ['--mf-page-bg', '--background']);
        var formBg = pickThemeVar(vars, ['--mf-form-bg', '--mf-input-bg', '--card', '--background'], pageBg);
        var foreground = pickThemeVar(vars, ['--mf-text', '--mf-color-text', '--foreground', '--mfp-text']);
        var mutedText = pickThemeVar(vars, ['--mf-color-text-muted', '--mf-help-color', '--mf-label-color', '--muted-foreground'], foreground);
        var titleText = pickThemeVar(vars, ['--mf-title-color', '--mf-section-title', '--mf-text', '--mf-color-text'], foreground);
        var labelText = pickThemeVar(vars, ['--mf-label-color', '--mf-color-text', '--mf-text'], foreground);
        var border = pickThemeVar(vars, ['--mf-input-border-color', '--mf-border', '--mf-section-border', '--border', '--mfp-border']);
        var inputBg = pickThemeVar(vars, ['--mf-input-bg', '--input', '--card'], formBg);
        var inputText = pickThemeVar(vars, ['--mf-input-text', '--mf-text', '--mf-color-text'], foreground);
        var buttonText = pickThemeVar(vars, ['--mf-btn-color', '--mf-btn-text', '--mf-color-text-inverse', '--primary-foreground'], '#ffffff');
        var formRadius = pickThemeVar(vars, ['--mf-form-radius', '--radius']);
        var inputRadius = pickThemeVar(vars, ['--mf-input-radius'], formRadius);
        var formShadow = pickThemeVar(vars, ['--mf-form-shadow', '--shadow']);
        var transition = pickThemeVar(vars, ['--mf-transition-duration'], '200ms');

        if (!primary && !formBg && !foreground && !border) return out;

        putThemeAlias(out, vars, '--mf-primary', primary);
        putThemeAlias(out, vars, '--mf-primary-hover', primaryHover);
        putThemeAlias(out, vars, '--mf-primary-light', primaryLight);
        putThemeAlias(out, vars, '--mf-form-bg', formBg);
        putThemeAlias(out, vars, '--mf-input-bg', inputBg);
        putThemeAlias(out, vars, '--mf-text', foreground);
        putThemeAlias(out, vars, '--mf-color-text', foreground);
        putThemeAlias(out, vars, '--mf-color-text-muted', mutedText);
        putThemeAlias(out, vars, '--mf-title-color', titleText);
        putThemeAlias(out, vars, '--mf-label-color', labelText);
        putThemeAlias(out, vars, '--mf-input-text', inputText);
        putThemeAlias(out, vars, '--mf-border', border);
        putThemeAlias(out, vars, '--mf-input-border-color', border);
        putThemeAlias(out, vars, '--mf-btn-bg', primary);
        putThemeAlias(out, vars, '--mf-btn-bg-hover', primaryHover);
        putThemeAlias(out, vars, '--mf-btn-hover-bg', primaryHover);
        putThemeAlias(out, vars, '--mf-btn-color', buttonText);
        putThemeAlias(out, vars, '--mf-btn-text', buttonText);
        putThemeAlias(out, vars, '--mf-color-text-inverse', buttonText);

        putThemeAlias(out, vars, '--background', pageBg || formBg);
        putThemeAlias(out, vars, '--foreground', foreground);
        putThemeAlias(out, vars, '--card', formBg || pageBg);
        putThemeAlias(out, vars, '--card-foreground', foreground);
        putThemeAlias(out, vars, '--primary', primary);
        putThemeAlias(out, vars, '--primary-foreground', buttonText);
        putThemeAlias(out, vars, '--secondary', inputBg || formBg);
        putThemeAlias(out, vars, '--secondary-foreground', foreground);
        putThemeAlias(out, vars, '--muted', primaryLight || inputBg || formBg);
        putThemeAlias(out, vars, '--muted-foreground', mutedText);
        putThemeAlias(out, vars, '--accent', primaryLight || primary);
        putThemeAlias(out, vars, '--accent-foreground', foreground);
        putThemeAlias(out, vars, '--border', border);
        putThemeAlias(out, vars, '--input', inputBg || formBg);
        putThemeAlias(out, vars, '--ring', primary);
        putThemeAlias(out, vars, '--radius', formRadius);

        putThemeAlias(out, vars, '--mfp-primary', primary);
        putThemeAlias(out, vars, '--mfp-primary-dark', primaryHover);
        putThemeAlias(out, vars, '--mfp-accent', primaryLight || primary);
        putThemeAlias(out, vars, '--mfp-bg', pageBg || formBg);
        putThemeAlias(out, vars, '--mfp-card-bg', formBg || pageBg);
        putThemeAlias(out, vars, '--mfp-text', foreground);
        putThemeAlias(out, vars, '--mfp-text-muted', mutedText);
        putThemeAlias(out, vars, '--mfp-border', border);
        putThemeAlias(out, vars, '--mfp-border-focus', primary);
        putThemeAlias(out, vars, '--mfp-section', mutedText);
        putThemeAlias(out, vars, '--mfp-radius', formRadius);
        putThemeAlias(out, vars, '--mfp-input-radius', inputRadius);
        putThemeAlias(out, vars, '--mfp-shadow', formShadow);

        putThemeAlias(out, vars, '--au-primary', primary);
        putThemeAlias(out, vars, '--au-primary-d', primaryHover);
        putThemeAlias(out, vars, '--au-soft', primaryLight || inputBg || formBg);
        putThemeAlias(out, vars, '--au-ink', foreground);
        putThemeAlias(out, vars, '--au-sub', mutedText);
        putThemeAlias(out, vars, '--au-border', border);
        putThemeAlias(out, vars, '--au-surface', formBg || pageBg);

        putThemeAlias(out, vars, '--ink', foreground);
        putThemeAlias(out, vars, '--paper', formBg || pageBg);
        putThemeAlias(out, vars, '--surface', formBg || pageBg);
        putThemeAlias(out, vars, '--surface-2', inputBg || formBg);
        putThemeAlias(out, vars, '--line', border);
        putThemeAlias(out, vars, '--shadow', formShadow);
        putThemeAlias(out, vars, '--transition', transition);

        detectPremiumVarPrefixes(templateText).forEach(function (prefix) {
            var base = '--' + prefix + '-';
            putThemeAlias(out, vars, base + 'primary', primary);
            putThemeAlias(out, vars, base + 'primary-dark', primaryHover);
            putThemeAlias(out, vars, base + 'primary-hover', primaryHover);
            putThemeAlias(out, vars, base + 'accent', primaryLight || primary);
            putThemeAlias(out, vars, base + 'bg', pageBg || formBg);
            putThemeAlias(out, vars, base + 'background', pageBg || formBg);
            putThemeAlias(out, vars, base + 'surface', formBg || pageBg);
            putThemeAlias(out, vars, base + 'card', formBg || pageBg);
            putThemeAlias(out, vars, base + 'card-bg', formBg || pageBg);
            putThemeAlias(out, vars, base + 'paper', formBg || pageBg);
            putThemeAlias(out, vars, base + 'input-bg', inputBg || formBg);
            putThemeAlias(out, vars, base + 'ink', foreground);
            putThemeAlias(out, vars, base + 'text', foreground);
            putThemeAlias(out, vars, base + 'foreground', foreground);
            putThemeAlias(out, vars, base + 'muted', mutedText);
            putThemeAlias(out, vars, base + 'sub', mutedText);
            putThemeAlias(out, vars, base + 'border', border);
            putThemeAlias(out, vars, base + 'line', border);
            putThemeAlias(out, vars, base + 'radius', formRadius);
            putThemeAlias(out, vars, base + 'input-radius', inputRadius);
            putThemeAlias(out, vars, base + 'shadow', formShadow);
        });

        return out;
    }

    function getEffectiveLiveVars(): Record<string, string> {
        return Object.assign(
            {},
            buildPremiumThemeAliasVars(live, String(currentCustomCss || '') + '\n' + String(currentCustomHtml || '')),
            live
        );
    }

    // ── B49: Device preview state (desktop/tablet/mobile). Drives the
    //         #mf-canvas-dropzone wrapper max-width so the user sees
    //         responsive layout without leaving the Builder. Port of
    //         the topbar device-group from ThemeDesignerHost.html. ────
    type DeviceKind = 'desktop' | 'tablet' | 'mobile';
    var currentDevice: DeviceKind = 'desktop';
    var DEVICE_WIDTHS: Record<DeviceKind, string> = {
        desktop: '100%',
        tablet:  '768px',
        mobile:  '375px'
    };
    // [P1-1/P1-2] Real RENDER widths for the Design-mode preview iframe. The form
    // lives inside the iframe document, so we render it at a true device width and
    // then `zoom`-fit the (often narrow) center column. Desktop=1280 guarantees the
    // form's >=1024px multi-column layout shows instead of the mobile stack the old
    // ~612px frame forced; tablet/mobile expose their real reflow.
    var DEVICE_RENDER_WIDTHS: Record<DeviceKind, number> = {
        desktop: 1280,
        tablet:  820,
        mobile:  390
    };

    // ── B49: Hex → RGB + 12-step tint generator (port of buildTintScale
    //         in theme-designer/index.ts:880-897). Used in Colors panel
    //         to render a tint strip below the Primary picker. ────────
    function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
        var h = String(hex || '').trim().replace(/^#/, '');
        if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
        if (!/^[0-9a-f]{6}$/i.test(h)) return null;
        return {
            r: parseInt(h.substr(0, 2), 16),
            g: parseInt(h.substr(2, 2), 16),
            b: parseInt(h.substr(4, 2), 16)
        };
    }
    function rgbToHex(r: number, g: number, b: number): string {
        var to2 = function (n: number) {
            var v = Math.max(0, Math.min(255, Math.round(n))).toString(16);
            return v.length === 1 ? '0' + v : v;
        };
        return '#' + to2(r) + to2(g) + to2(b);
    }
    /** Generate 50/100/200/.../900 tint scale from a base hex. */
    function buildTintScale(baseHex: string): Array<{ step: number; hex: string }> {
        var rgb = hexToRgb(baseHex) || { r: 59, g: 130, b: 246 };
        var steps = [
            { step: 50,  mix: 0.95 }, { step: 100, mix: 0.88 },
            { step: 200, mix: 0.72 }, { step: 300, mix: 0.55 },
            { step: 400, mix: 0.30 }, { step: 500, mix: 0.00 },
            { step: 600, mix: -0.12 }, { step: 700, mix: -0.24 },
            { step: 800, mix: -0.38 }, { step: 900, mix: -0.50 }
        ];
        return steps.map(function (s) {
            var t = s.mix;
            var r: number, g: number, b: number;
            if (t > 0) {
                // mix toward white
                r = rgb.r + (255 - rgb.r) * t;
                g = rgb.g + (255 - rgb.g) * t;
                b = rgb.b + (255 - rgb.b) * t;
            } else if (t < 0) {
                // mix toward black (k = 1 + t, since t is negative)
                var k = 1 + t;
                r = rgb.r * k;
                g = rgb.g * k;
                b = rgb.b * k;
            } else {
                r = rgb.r; g = rgb.g; b = rgb.b;
            }
            return { step: s.step, hex: rgbToHex(r, g, b) };
        });
    }

    // ── Hydration: pull state from B.state.schema.settings ────────────
    function getSettings(): any {
        if (!B.state.schema) B.state.schema = { fields: [], settings: {} };
        if (!B.state.schema.settings) B.state.schema.settings = {};
        return B.state.schema.settings;
    }

    function getCurrentFormId(): string {
        try {
            var stAny: any = B.state || {};
            var raw = (stAny.config && (stAny.config.formId || stAny.config.FormId)) ||
                stAny.formId || stAny.FormId ||
                ((document.getElementById('mf-builder-form-id') as HTMLInputElement | null)?.value) ||
                (window as any).FORM_ID ||
                '';
            var id = parseInt(String(raw || ''), 10) || 0;
            return id > 0 ? String(id) : '';
        } catch (_e) {
            return '';
        }
    }

    function loadFromSchema(): void {
        var s = getSettings();
        currentTheme = String(s.theme || s.Theme || 'default');
        currentCustomCss = String(s.customCss || s.CustomCss || '');
        currentCustomHtml = String(s.customHtml || s.CustomHtml || '');
        // useCustomHtml: explicit flag, OR auto-derived from non-empty customHtml
        // for back-compat with forms that have a template but no toggle saved yet.
        if (typeof s.useCustomHtml === 'boolean')      currentUseCustomHtml = s.useCustomHtml;
        else if (typeof s.UseCustomHtml === 'boolean') currentUseCustomHtml = s.UseCustomHtml;
        else                                            currentUseCustomHtml = !!(currentCustomHtml && currentCustomHtml.trim());
        // [B269] page-theme inheritance flags (default off → forms unchanged).
        currentInheritType   = (s.inheritPageTypography === true) || (s.InheritPageTypography === true);
        currentInheritColors = (s.inheritPageColors === true)     || (s.InheritPageColors === true);
        live = {};

        // Precedence: themeJson.cssOverrides → settings.cssOverrides
        // (themeJson loses to settings because settings may have been edited
        //  later by other Builder panels, e.g. the existing theme picker).
        try {
            var rawTj = s.themeJson || s.ThemeJson;
            if (rawTj && typeof rawTj === 'string') rawTj = JSON.parse(rawTj);
            if (rawTj && typeof rawTj === 'object') {
                var co = rawTj.cssOverrides || rawTj.CssOverrides || rawTj.themeCssOverrides || rawTj.ThemeCssOverrides;
                if (co && typeof co === 'object') {
                    Object.keys(co).forEach(function (k) {
                        if (typeof co[k] === 'string') live[k] = String(co[k]);
                    });
                }
                if (!currentCustomCss && typeof rawTj.customCss === 'string') {
                    currentCustomCss = rawTj.customCss;
                }
                if (typeof rawTj.theme === 'string' && currentTheme === 'default') {
                    currentTheme = rawTj.theme;
                }
            }
        } catch (_e) { /* malformed json — ignore */ }

        var savedOverrides = s.cssOverrides || s.CssOverrides || s.themeCssOverrides || s.ThemeCssOverrides;
        if (savedOverrides && typeof savedOverrides === 'object') {
            Object.keys(savedOverrides).forEach(function (k) {
                if (typeof savedOverrides[k] === 'string') live[k] = String(savedOverrides[k]);
            });
        }
    }

    function persistToSchema(): void {
        var s = getSettings();
        s.theme = currentTheme;
        s.cssOverrides = Object.assign({}, live);
        s.themeCssOverrides = Object.assign({}, live);
        if (currentCustomCss != null) {
            s.customCss = currentCustomCss;
            s.CustomCss = currentCustomCss;
        }
        if (currentCustomHtml != null) {
            // If the toggle is off, persist empty string so the runtime
            // renderer falls back to the auto-generated field layout.
            var htmlToPersist = currentUseCustomHtml ? currentCustomHtml : '';
            s.customHtml = htmlToPersist;
            s.CustomHtml = htmlToPersist;
        }
        s.useCustomHtml = !!currentUseCustomHtml;
        s.UseCustomHtml = !!currentUseCustomHtml;
        // [B269] page-theme inheritance booleans (server → wrapper class + scoped borrow vars).
        s.inheritPageTypography = !!currentInheritType;
        s.InheritPageTypography = !!currentInheritType;
        s.inheritPageColors = !!currentInheritColors;
        s.InheritPageColors = !!currentInheritColors;
        var themeObj = {
            _kind: 'MegaFormThemePatch',
            theme: currentTheme,
            cssOverrides: Object.assign({}, live),
            customCss: currentCustomCss || '',
            customHtml: currentUseCustomHtml ? (currentCustomHtml || '') : '',
            useCustomHtml: !!currentUseCustomHtml
        };
        try {
            s.themeJson = JSON.stringify(themeObj);
        } catch (_e) { /* circular shouldn't happen here */ }

        try { B.state.isDirty = true; } catch (_e) { /* defensive */ }
    }

    // ── Live preview CSS builders ─────────────────────────────────────
    // [B56 FIX 1] Split into canvas + iframe variants. The original
    // single-variant function scoped every rule under #mf-canvas-dropzone
    // which DOES NOT EXIST inside the runtime preview iframe (iframe DOM
    // is body > #mf-mount > .mf-form-wrapper). Posting that CSS to the
    // iframe led to "no effect" — selectors matched zero elements.
    //
    // buildCanvasOverridesCss()  → injected into parent <head> as
    //   <style id="mf-builder-theme-overrides">. Scoped to builder canvas
    //   so the user's edits do NOT leak into Builder chrome.
    //
    // buildIframeOverridesCss()  → posted to iframe via 'mf-theme-live-css'
    //   message. Selectors target the iframe's actual DOM:
    //     :root → CSS custom properties cascade everywhere
    //     body, #mf-mount, .mf-form-wrapper, .mf-form, .mf-form-inner →
    //       direct hooks so any element-level overrides (e.g. background,
    //       padding) take effect on the runtime form node.
    //   customCss is appended raw — no #mf-canvas-dropzone prefix — so
    //   the user's hand-written .mf-form / .mf-input rules apply.
    // ------------------------------------------------------------------
    function buildDeclarations(): string[] {
        var declarations: string[] = [];
        var vars = getEffectiveLiveVars();
        Object.keys(vars).forEach(function (name) {
            var val = vars[name];
            if (val == null || val === '') return;
            declarations.push('  ' + name + ': ' + String(val) + ' !important;');
        });
        return declarations;
    }

    function buildCanvasOverridesCss(): string {
        var rules: string[] = [];
        var declarations = buildDeclarations();
        if (declarations.length > 0) {
            var fid = getCurrentFormId();
            var idSelectors = fid ? (
                '#mf-canvas-dropzone #mf-form-wrapper-' + fid + ',' +
                '#mf-canvas-dropzone #mf-form-wrapper-' + fid + ' .mf-form,' +
                '#mf-canvas-dropzone #mf-form-wrapper-' + fid + ' .mf-form-inner,' +
                '#mf-canvas-dropzone #mf-form-wrapper-' + fid + ' .mfp,' +
                '#mf-canvas-dropzone #mf-form-wrapper-' + fid + ' .mfp[class*="mfp-"],' +
                '#mf-canvas-dropzone #mf-form-wrapper-' + fid + ' .mfp.mfp-australia,'
            ) : '';
            // Cover the builder canvas wrappers.
            rules.push(
                idSelectors +
                '#mf-canvas-dropzone .mf-form-wrapper,' +
                '#mf-canvas-dropzone .mf-form,' +
                '#mf-canvas-dropzone .mf-form-inner,' +
                '#mf-canvas-dropzone .mfp,' +
                '#mf-canvas-dropzone .mfp[class*="mfp-"],' +
                '#mf-canvas-dropzone .mfp.mfp-australia,' +
                '#mf-canvas-dropzone .mfp-card,' +
                '#mf-canvas-dropzone .fr-card,' +
                '#mf-canvas-fields,' +
                '#mf-canvas-dropzone {\n' + declarations.join('\n') + '\n}'
            );
        }
        if (currentCustomCss && currentCustomCss.trim()) {
            // Scope the user's customCss to the canvas so it never leaks
            // into the Builder chrome (toolbar / left rail / right rail).
            rules.push(
                '/* customCss (scoped) */\n#mf-canvas-dropzone {}\n' +
                currentCustomCss
            );
        }
        rules.push(buildPremiumShellEdgeGuardCss('#mf-canvas-dropzone '));
        return rules.join('\n\n');
    }

    function buildIframeOverridesCss(): string {
        var rules: string[] = [];
        var declarations = buildDeclarations();
        if (declarations.length > 0) {
            var fid = getCurrentFormId();
            var idSelectors = fid ? (
                '#mf-form-wrapper-' + fid + ',' +
                '#mf-form-wrapper-' + fid + ' .mf-form,' +
                '#mf-form-wrapper-' + fid + ' .mf-form-inner,' +
                '#mf-form-wrapper-' + fid + ' .mfp,' +
                '#mf-form-wrapper-' + fid + ' .mfp[class*="mfp-"],' +
                '#mf-form-wrapper-' + fid + ' .mfp.mfp-australia,'
            ) : '';
            // [B56 FIX 1] Match the iframe DOM. :root + body covers any
            // var-consumer at any depth, while #mf-mount/.mf-form-wrapper/
            // .mf-form/.mf-form-inner give us element-level hooks for any
            // direct property like background, padding, font-family.
            rules.push(
                idSelectors +
                ':root,' +
                'body,' +
                '#mf-mount,' +
                '.mf-form-wrapper,' +
                '.mf-form,' +
                '.mf-form-inner,' +
                '.mfp,' +
                '.mfp[class*="mfp-"],' +
                '.mfp.mfp-australia,' +
                '.mfp-card,' +
                '.fr-card {\n' + declarations.join('\n') + '\n}'
            );
        }
        if (currentCustomCss && currentCustomCss.trim()) {
            // [B56 FIX 2] customCss un-scoped — the user expects to write
            // .mf-form, .mf-input etc. and have them apply inside the form.
            // No bogus prefix here.
            rules.push('/* customCss (iframe raw) */\n' + currentCustomCss);
        }
        rules.push(buildPremiumShellEdgeGuardCss(''));
        // [B71] Element-level overrides emitted AFTER customCss so user
        // slider edits always win against themes that hardcode values
        // (e.g. Halloween customCss has `border-radius:14px` on .mfp-submit;
        // without this block, dragging --mf-btn-radius does nothing).
        var elementOverrides = buildElementLevelOverrides();
        if (elementOverrides) {
            rules.push('/* [B71] element-level var overrides */\n' + elementOverrides);
        }
        // [P1-5] Grid Settings > Columns. Only "1" is honoured as a true single-
        // column stack: the FlexGrid uses a fixed 12-track grid with per-field
        // --lg-w spans, which can't be faithfully re-binned to 2/3 columns, so
        // those keep the form's native layout. High-specificity (#mf-mount + 2
        // classes) + !important beats the srcdoc parity media rules regardless of
        // source order, forcing every field to a full-width row.
        if (live['--mf-form-columns'] === '1') {
            rules.push(
                '/* [P1-5] single-column layout */\n' +
                '#mf-mount .mf-flexgrid > .mf-flexgrid-item,\n' +
                '.mf-form-wrapper .mf-flexgrid > .mf-flexgrid-item {\n' +
                '  grid-column: 1 / -1 !important;\n' +
                '  grid-row: auto !important;\n' +
                '}'
            );
        }
        return rules.join('\n\n');
    }

    function buildPremiumShellEdgeGuardCss(scopePrefix: string): string {
        var prefix = scopePrefix || '';
        var wrapper = prefix + '.mf-form-wrapper';
        var shell = wrapper + ' .mfp[class*="mfp-"]';
        return [
            '/* PremiumShellEdgeGuard v20260623-B239 */',
            wrapper + ':not(.mf-style-border-none):not(.mf-style-border-hairline):not(.mf-style-border-prominent) .mfp[class*="mfp-"] {\n' +
            '  --mfp-shell-border: var(--aur-border, var(--au-border, var(--fr-border, var(--bg-border, var(--it-border, var(--nola-border, var(--hw-border, var(--ey-border, var(--mf-input-border-color, var(--mf-border, var(--mfp-border, var(--border, #e2e8f0))))))))))));\n' +
            '  border: 1px solid var(--mfp-shell-border) !important;\n' +
            '}',
            wrapper + ':not(.mf-style-radius-square):not(.mf-style-radius-rounded):not(.mf-style-radius-pill) .mfp[class*="mfp-"] {\n' +
            '  border-radius: var(--mf-form-radius, var(--mfp-radius, var(--aur-radius, 8px))) !important;\n' +
            '  background-clip: padding-box !important;\n' +
            '}',
            shell + ',' +
            shell + ' > .mfp-container {\n' +
            '  overflow: visible !important;\n' +
            '}',
            shell + ' > .mfp-container {\n' +
            '  box-sizing: border-box !important;\n' +
            '  border: 1px solid transparent !important;\n' +
            '}',
            shell + ' > .mfp-card,' +
            shell + ' > .mfp-container > .mfp-card,' +
            shell + ' > .fr-card,' +
            shell + ' > .mfp-container > .fr-card {\n' +
            '  background-clip: padding-box !important;\n' +
            '}'
        ].join('\n');
    }

    function buildElementLevelOverrides(): string {
        var rules: string[] = [];
        var vars = getEffectiveLiveVars();
        var fid = getCurrentFormId();
        // Submit button + variant button selectors (covers .mfp-submit,
        // .mf-submit, button[type=submit], .mf-form-actions button).
        var btnDecls: string[] = [];
        if (vars['--mf-btn-radius'])       btnDecls.push('border-radius: var(--mf-btn-radius) !important;');
        if (vars['--mf-btn-font-size'])    btnDecls.push('font-size: var(--mf-btn-font-size) !important;');
        if (vars['--mf-btn-font-weight'])  btnDecls.push('font-weight: var(--mf-btn-font-weight) !important;');
        if (vars['--mf-btn-padding-y'])    btnDecls.push('padding-top: var(--mf-btn-padding-y) !important;\n  padding-bottom: var(--mf-btn-padding-y) !important;');
        if (vars['--mf-btn-shadow'])       btnDecls.push('box-shadow: var(--mf-btn-shadow) !important;');
        if (vars['--mf-font-family'])      btnDecls.push('font-family: var(--mf-font-family) !important;');
        if (vars['--mf-btn-bg'] || vars['--mf-primary']) {
            btnDecls.push('background: var(--mf-btn-bg, var(--mf-primary)) !important;');
        }
        if (vars['--mf-btn-color'] || vars['--mf-btn-text'] || vars['--mf-color-text-inverse']) {
            btnDecls.push('color: var(--mf-btn-color, var(--mf-btn-text, var(--mf-color-text-inverse, #ffffff))) !important;');
        }
        if (btnDecls.length > 0) {
            rules.push(
                '.mf-form-wrapper button[type="submit"],' +
                '.mf-form-wrapper .mf-submit,' +
                '.mf-form-wrapper .mfp-submit,' +
                '.mf-form-wrapper .mf-btn-submit,' +
                '.mf-form-wrapper .mf-submit-btn,' +
                '.mf-form-wrapper .mfp-actions button[type="submit"],' +
                '.mf-form-wrapper .mf-btn-primary,' +
                '.mf-form-wrapper .mf-form-actions button {\n  ' +
                btnDecls.join('\n  ') + '\n}'
            );
            if (fid) {
                rules.push(
                    '#mf-form-wrapper-' + fid + ' button[type="submit"],' +
                    '#mf-form-wrapper-' + fid + ' .mf-submit,' +
                    '#mf-form-wrapper-' + fid + ' .mfp-submit,' +
                    '#mf-form-wrapper-' + fid + ' .mf-btn-submit,' +
                    '#mf-form-wrapper-' + fid + ' .mf-submit-btn,' +
                    '#mf-form-wrapper-' + fid + ' .mfp-actions button[type="submit"],' +
                    '#mf-form-wrapper-' + fid + ' .mf-btn-primary,' +
                    '#mf-form-wrapper-' + fid + ' .mf-form-actions button {\n  ' +
                    btnDecls.join('\n  ') + '\n}'
                );
            }
        }
        // Inputs + textareas + selects
        var inDecls: string[] = [];
        if (vars['--mf-input-radius'])       inDecls.push('border-radius: var(--mf-input-radius) !important;');
        if (vars['--mf-input-bg'])           inDecls.push('background-color: var(--mf-input-bg) !important;');
        if (vars['--mf-input-border'])       inDecls.push('border: var(--mf-input-border) !important;');
        if (vars['--mf-input-border-color']) inDecls.push('border-color: var(--mf-input-border-color) !important;');
        if (vars['--mf-input-text'] || vars['--mf-text']) inDecls.push('color: var(--mf-input-text, var(--mf-text)) !important;');
        if (vars['--mf-font-family'])        inDecls.push('font-family: var(--mf-font-family) !important;');
        if (vars['--mf-input-font-size'])    inDecls.push('font-size: var(--mf-input-font-size) !important;');
        if (inDecls.length > 0) {
            rules.push(
                '.mf-form-wrapper .mf-input,' +
                '.mf-form-wrapper .mf-cal-trigger,' +
                '.mf-form-wrapper .mf-textarea,' +
                '.mf-form-wrapper .mf-select,' +
                '.mf-form-wrapper input[type="text"],' +
                '.mf-form-wrapper input[type="email"],' +
                '.mf-form-wrapper input[type="tel"],' +
                '.mf-form-wrapper input[type="number"],' +
                '.mf-form-wrapper input[type="url"],' +
                '.mf-form-wrapper button.mf-input,' +
                '.mf-form-wrapper textarea,' +
                '.mf-form-wrapper select {\n  ' +
                inDecls.join('\n  ') + '\n}'
            );
            if (fid) {
                rules.push(
                    '#mf-form-wrapper-' + fid + ' .mf-input,' +
                    '#mf-form-wrapper-' + fid + ' .mf-cal-trigger,' +
                    '#mf-form-wrapper-' + fid + ' .mf-textarea,' +
                    '#mf-form-wrapper-' + fid + ' .mf-select,' +
                    '#mf-form-wrapper-' + fid + ' input[type="text"],' +
                    '#mf-form-wrapper-' + fid + ' input[type="email"],' +
                    '#mf-form-wrapper-' + fid + ' input[type="tel"],' +
                    '#mf-form-wrapper-' + fid + ' input[type="number"],' +
                    '#mf-form-wrapper-' + fid + ' input[type="url"],' +
                    '#mf-form-wrapper-' + fid + ' button.mf-input,' +
                    '#mf-form-wrapper-' + fid + ' textarea,' +
                    '#mf-form-wrapper-' + fid + ' select {\n  ' +
                    inDecls.join('\n  ') + '\n}'
                );
            }
        }
        // Form card / wrapper container
        var formDecls: string[] = [];
        if (vars['--mf-form-bg'])     formDecls.push('background: var(--mf-form-bg) !important;');
        if (vars['--mf-form-radius']) formDecls.push('border-radius: var(--mf-form-radius) !important;');
        if (vars['--mf-form-shadow']) formDecls.push('box-shadow: var(--mf-form-shadow) !important;');
        if (vars['--mf-form-padding']) formDecls.push('padding: var(--mf-form-padding) !important;');
        if (vars['--mf-form-max-width']) formDecls.push('max-width: var(--mf-form-max-width) !important;\n  width: 100% !important;');
        if (formDecls.length > 0) {
            rules.push(
                '.mf-form-wrapper > .mf-form,' +
                '.mf-form-wrapper .mfp,' +
                '.mf-form-wrapper .mfp-card,' +
                '.mf-form-wrapper .fr-card {\n  ' +
                formDecls.join('\n  ') + '\n}'
            );
            if (fid) {
                rules.push(
                    '#mf-form-wrapper-' + fid + ' > .mf-form,' +
                    '#mf-form-wrapper-' + fid + ' .mfp,' +
                    '#mf-form-wrapper-' + fid + ' .mfp[class*="mfp-"],' +
                    '#mf-form-wrapper-' + fid + ' .mfp.mfp-australia,' +
                    '#mf-form-wrapper-' + fid + ' .mfp-card,' +
                    '#mf-form-wrapper-' + fid + ' .fr-card {\n  ' +
                    formDecls.join('\n  ') + '\n}'
                );
            }
        }
        // Typography on shell text, labels, inputs, and headings.
        var bodyDecls: string[] = [];
        if (vars['--mf-font-family'])      bodyDecls.push('font-family: var(--mf-font-family) !important;');
        if (vars['--mf-font-size-base'])   bodyDecls.push('font-size: var(--mf-font-size-base) !important;');
        if (vars['--mf-line-height'])      bodyDecls.push('line-height: var(--mf-line-height) !important;');
        if (vars['--mf-letter-spacing'])   bodyDecls.push('letter-spacing: var(--mf-letter-spacing) !important;');
        if (bodyDecls.length > 0) {
            rules.push(
                '.mf-form-wrapper,' +
                '.mf-form-wrapper .mfp,' +
                '.mf-form-wrapper .mf-form,' +
                '.mf-form-wrapper p,' +
                '.mf-form-wrapper label,' +
                '.mf-form-wrapper .mf-field-label,' +
                '.mf-form-wrapper input,' +
                '.mf-form-wrapper textarea,' +
                '.mf-form-wrapper select,' +
                '.mf-form-wrapper button {\n  ' +
                bodyDecls.join('\n  ') + '\n}'
            );
            if (fid) {
                rules.push(
                    '#mf-form-wrapper-' + fid + ',' +
                    '#mf-form-wrapper-' + fid + ' .mfp,' +
                    '#mf-form-wrapper-' + fid + ' .mf-form,' +
                    '#mf-form-wrapper-' + fid + ' p,' +
                    '#mf-form-wrapper-' + fid + ' label,' +
                    '#mf-form-wrapper-' + fid + ' .mf-field-label,' +
                    '#mf-form-wrapper-' + fid + ' input,' +
                    '#mf-form-wrapper-' + fid + ' textarea,' +
                    '#mf-form-wrapper-' + fid + ' select,' +
                    '#mf-form-wrapper-' + fid + ' button {\n  ' +
                    bodyDecls.join('\n  ') + '\n}'
                );
            }
        }
        var headingDecls: string[] = [];
        if (vars['--mf-title-font-size'])  headingDecls.push('font-size: var(--mf-title-font-size) !important;');
        if (vars['--mf-heading-font'])     headingDecls.push('font-family: var(--mf-heading-font) !important;');
        if (vars['--mf-heading-weight'])   headingDecls.push('font-weight: var(--mf-heading-weight) !important;');
        if (vars['--mf-title-color'] || vars['--mf-text']) headingDecls.push('color: var(--mf-title-color, var(--mf-text)) !important;');
        if (headingDecls.length > 0) {
            rules.push(
                '.mf-form-wrapper h1,' +
                '.mf-form-wrapper h2,' +
                '.mf-form-wrapper h3,' +
                '.mf-form-wrapper .mf-form-title,' +
                '.mf-form-wrapper .mfp-form-title,' +
                '.mf-form-wrapper .au-brand-tx strong,' +
                '.mf-form-wrapper .au-section-title {\n  ' +
                headingDecls.join('\n  ') + '\n}'
            );
            if (fid) {
                rules.push(
                    '#mf-form-wrapper-' + fid + ' h1,' +
                    '#mf-form-wrapper-' + fid + ' h2,' +
                    '#mf-form-wrapper-' + fid + ' h3,' +
                    '#mf-form-wrapper-' + fid + ' .mf-form-title,' +
                    '#mf-form-wrapper-' + fid + ' .mfp-form-title,' +
                    '#mf-form-wrapper-' + fid + ' .au-brand-tx strong,' +
                    '#mf-form-wrapper-' + fid + ' .au-section-title {\n  ' +
                    headingDecls.join('\n  ') + '\n}'
                );
            }
        }
        return rules.join('\n\n');
    }

    // Back-compat alias so other modules / hooks that import
    // buildOverridesCss still resolve (we expose the canvas variant
    // because that was the original semantic — what the parent <head>
    // injects).
    function buildOverridesCss(): string {
        return buildCanvasOverridesCss();
    }

    // ── B50: Live theme propagation to standalone preview iframe ──────
    // The runtime renderer (loaded inside the iframe srcdoc) listens for
    // postMessage 'mf-theme-live-css' and re-injects the CSS into its
    // own <style id="mf-theme-live-preview"> tag without reloading.
    //
    // [B56 FIX 1] Accept an explicit CSS argument so callers can pass
    // the iframe-scoped variant. If a caller passes the canvas-scoped
    // variant by accident we still rewrite #mf-canvas-dropzone → empty
    // so something matches in the iframe DOM.
    // ------------------------------------------------------------------
    function postCssToPreviewFrame(css: string): void {
        try {
            var frame = document.querySelector('.mf-theme-preview-frame') as HTMLIFrameElement | null;
            if (!frame || !frame.contentWindow) return;
            // [B56 FIX 1b] Belt-and-braces: if the caller hands us canvas-
            // scoped CSS, strip the #mf-canvas-dropzone prefix so selectors
            // can still match the iframe document tree.
            var safeCss = String(css || '');
            if (safeCss.indexOf('#mf-canvas-dropzone') !== -1) {
                safeCss = safeCss.replace(/#mf-canvas-dropzone\s+/g, '')
                                 .replace(/#mf-canvas-dropzone\s*\{\}/g, '')
                                 .replace(/#mf-canvas-dropzone\s*,?\s*/g, '');
            }
            frame.contentWindow.postMessage({ type: 'mf-theme-live-css', css: safeCss }, '*');
        } catch (_e) { /* defensive */ }
    }

    // [B56 FIX 3] Tell the iframe to apply / clear the preset theme class.
    // The runtime renderer applies CSS class names to .mf-form-wrapper —
    // we mirror that here so preset clicks light up megaform-themes.css
    // rules instantly.
    function postThemeClassToPreviewFrame(themeId: string): void {
        try {
            var frame = document.querySelector('.mf-theme-preview-frame') as HTMLIFrameElement | null;
            if (!frame || !frame.contentWindow) return;
            frame.contentWindow.postMessage({
                type: 'mf-theme-live-class',
                themeId: String(themeId || 'default')
            }, '*');
        } catch (_e) { /* defensive */ }
    }

    // Listen for the iframe announcing it is ready, then push the current
    // CSS so the very first paint reflects uncommitted theme state.
    if (typeof window !== 'undefined' && !(window as any).__MF_THEME_PREVIEW_READY_BOUND__) {
        (window as any).__MF_THEME_PREVIEW_READY_BOUND__ = true;
        window.addEventListener('message', function (e: MessageEvent) {
            try {
                var d: any = e && e.data;
                if (!d || d.type !== 'mf-theme-preview-ready') return;
                // [B56 FIX 1] Post the iframe-scoped variant — not the
                // canvas variant — so selectors actually match.
                postCssToPreviewFrame(buildIframeOverridesCss());
                postThemeClassToPreviewFrame(currentTheme);
                // [P1-1/P1-2] Size the freshly-mounted frame for the current device.
                try { applyDevicePreview(); } catch (_eDev) { /* defensive */ }
            } catch (_e) { /* defensive */ }
        }, false);
    }

    function flushPreview(): void {
        // [B56 FIX 1] Build TWO CSS variants — canvas for parent <head>,
        // iframe for postMessage. Canvas wins the lastInjectedCss cache
        // check (no DOM thrash) but iframe always re-posts on flush so
        // the runtime preview tracks every keystroke.
        var canvasCss = buildCanvasOverridesCss();
        var iframeCss = buildIframeOverridesCss();
        if (canvasCss !== lastInjectedCss) {
            var tag = document.getElementById(THEME_STYLE_TAG_ID) as HTMLStyleElement | null;
            if (!tag) {
                tag = document.createElement('style');
                tag.id = THEME_STYLE_TAG_ID;
                tag.setAttribute('data-mf-theme-tab', 'ThemeTabAdapter v20260603-B56');
                document.head.appendChild(tag);
            }
            tag.textContent = canvasCss;
            lastInjectedCss = canvasCss;
        }

        // [B56 FIX 1] Always post the iframe variant — the runtime
        // renderer iframe expects an un-canvas-scoped ruleset.
        postCssToPreviewFrame(iframeCss);

        // Also apply the preset class to the canvas wrapper so any
        // mf-theme-<id> CSS in megaform-themes.css shows up immediately.
        try {
            var dz = document.getElementById('mf-canvas-dropzone');
            if (dz) {
                var oldClasses: string[] = [];
                dz.classList.forEach(function (c) {
                    if (c.indexOf('mf-theme-') === 0) oldClasses.push(c);
                });
                oldClasses.forEach(function (c) { dz.classList.remove(c); });
                if (currentTheme && currentTheme !== 'default') {
                    dz.classList.add('mf-theme-' + currentTheme);
                }
            }
        } catch (_e) { /* defensive */ }

        // [B56 FIX 3] Mirror the preset class to the iframe so megaform-
        // themes.css rules (.mf-theme-<id> .mf-form-wrapper { ... }) light
        // up without a srcdoc rebuild. Only sent when the iframe is alive.
        postThemeClassToPreviewFrame(currentTheme);
    }

    function removePreview(): void {
        // Keep the style tag — the changes are still part of state.schema and
        // we want the canvas to keep showing them after the tab is closed.
        // Just stop touching it. Caller can call clearPreview() to wipe.
    }

    // ── HTML builders for the four right-pane panels ──────────────────
    function escAttr(s: string): string {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function buildPresetGrid(): string {
        var out = '<div class="mf-theme-presets" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">';
        PRESETS.forEach(function (p) {
            var active = p.id === currentTheme;
            var swatch =
                '<div style="display:flex;height:24px;border-radius:4px;overflow:hidden;margin-bottom:6px">' +
                  '<span style="flex:1;background:' + p.primary + '"></span>' +
                  '<span style="flex:1;background:' + p.secondary + '"></span>' +
                  '<span style="flex:1;background:' + p.tertiary + '"></span>' +
                '</div>';
            // [B59] Emit .active class on the active tile so external CSS /
            // smoke probes can target `.mf-theme-preset.active` directly.
            out +=
                '<button type="button" class="mf-theme-preset' + (active ? ' active' : '') + '" data-preset="' + escAttr(p.id) + '" ' +
                'style="text-align:left;padding:8px;border:1px solid ' + (active ? '#6366f1' : '#e2e8f0') +
                ';border-radius:8px;background:' + (active ? '#eef2ff' : '#fff') + ';cursor:pointer;font-size:11px;font-weight:600;color:#1e293b">' +
                  swatch + escAttr(p.name) +
                '</button>';
        });
        out += '</div>';
        return out;
    }

    function colorRow(varName: string, label: string, fallback: string): string {
        var current = live[varName] || fallback;
        return (
            '<div class="td-clr-row" data-mf-theme-var="' + escAttr(varName) + '" ' +
                 'style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0">' +
              '<label style="margin:0;font-size:12px;color:#334155">' + escAttr(label) + '</label>' +
              '<div style="display:flex;align-items:center;gap:6px">' +
                '<input type="color" value="' + escAttr(current) + '" ' +
                       'data-mf-theme-color="' + escAttr(varName) + '" ' +
                       'style="width:28px;height:28px;border:1px solid #cbd5e1;border-radius:4px;padding:0;cursor:pointer">' +
                '<span class="mf-theme-color-val" style="font-family:Consolas,Menlo,monospace;font-size:11px;color:#64748b">' +
                  escAttr(current) +
                '</span>' +
              '</div>' +
            '</div>'
        );
    }

    function sliderRow(varName: string, label: string, min: number, max: number, fallback: number, unit: string): string {
        var rawVal = live[varName] || (fallback + unit);
        var numericMatch = /^-?\d+(?:\.\d+)?/.exec(String(rawVal));
        var num = numericMatch ? parseFloat(numericMatch[0]) : fallback;
        return (
            '<div class="td-sld-row" data-mf-theme-var="' + escAttr(varName) + '" style="margin:8px 0">' +
              '<div class="td-sld-hd" style="display:flex;justify-content:space-between;margin-bottom:4px">' +
                '<span style="font-size:12px;color:#334155">' + escAttr(label) + '</span>' +
                '<span class="td-sld-val" style="font-size:11px;color:#64748b">' + escAttr(num + unit) + '</span>' +
              '</div>' +
              '<input type="range" min="' + min + '" max="' + max + '" value="' + num + '" ' +
                     'class="td-slider" data-mf-theme-slider="' + escAttr(varName) + '" ' +
                     'data-mf-theme-unit="' + escAttr(unit) + '" ' +
                     'style="width:100%">' +
            '</div>'
        );
    }

    function toggleRow(varName: string, label: string, onValue: string, offValue: string, defaultOn: boolean): string {
        var currentVal = live[varName];
        var isOn = currentVal == null ? defaultOn : (currentVal === onValue);
        return (
            '<div class="td-tog-row" data-mf-theme-var="' + escAttr(varName) + '" ' +
                 'style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">' +
              '<span style="font-size:12px;color:#334155">' + escAttr(label) + '</span>' +
              '<label class="td-toggle" style="position:relative;display:inline-block;cursor:pointer">' +
                '<input type="checkbox" data-mf-theme-toggle="' + escAttr(varName) + '" ' +
                       'data-mf-theme-on="' + escAttr(onValue) + '" ' +
                       'data-mf-theme-off="' + escAttr(offValue) + '" ' +
                       (isOn ? 'checked' : '') + '>' +
              '</label>' +
            '</div>'
        );
    }

    function selectRow(varName: string, label: string, options: Array<{ v: string; l: string }>, fallback: string): string {
        var current = live[varName] || fallback;
        var optsHtml = options.map(function (o) {
            return '<option value="' + escAttr(o.v) + '"' + (o.v === current ? ' selected' : '') + '>' + escAttr(o.l) + '</option>';
        }).join('');
        return (
            '<div class="td-sld-row" data-mf-theme-var="' + escAttr(varName) + '" style="margin:8px 0">' +
              '<div style="font-size:12px;color:#334155;margin-bottom:4px">' + escAttr(label) + '</div>' +
              '<select class="form-control form-control-sm" data-mf-theme-select="' + escAttr(varName) + '">' +
                optsHtml +
              '</select>' +
            '</div>'
        );
    }

    // ── B49: Tint strip below Primary picker. Auto-rebuilt every time
    //         the primary color changes (see flushPrimaryTints below).
    //         Click a chip to copy its hex to the clipboard. ──────────
    function buildTintStripHtml(baseHex: string): string {
        var scale = buildTintScale(baseHex);
        var chips = scale.map(function (t) {
            // Darker tints get white labels; lighter get dark labels.
            var isDark = t.step >= 500;
            var label = String(t.step);
            return (
                '<button type="button" class="mf-theme-tint-chip" ' +
                'data-mf-theme-tint="' + escAttr(t.hex) + '" ' +
                'title="' + escAttr(t.hex) + ' (click to copy)" ' +
                'style="flex:1;display:flex;align-items:center;justify-content:center;' +
                'height:28px;border:none;cursor:pointer;font-size:9px;font-weight:700;' +
                'background:' + escAttr(t.hex) + ';color:' + (isDark ? '#fff' : '#0f172a') + ';' +
                'padding:0;letter-spacing:.05em">' + label + '</button>'
            );
        }).join('');
        return (
            '<div class="mf-theme-tints-wrap" data-mf-theme-tints-for="--mf-primary" ' +
                 'style="margin:6px 0 0;padding:0">' +
              '<div style="font-size:10px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Color Tints</div>' +
              '<div class="mf-theme-tint-strip" ' +
                   'style="display:flex;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0">' +
                chips +
              '</div>' +
            '</div>'
        );
    }

    // ── B49: Primary row with HEX text input + color picker side-by-
    //         side. Port of #td-hex-input from the standalone designer
    //         (theme-designer/index.ts colorRow + HEX field).  ────────
    function primaryRowHtml(): string {
        var current = live['--mf-primary'] || '#3b82f6';
        return (
            '<div class="td-clr-row" data-mf-theme-var="--mf-primary" ' +
                 'style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0">' +
              '<label style="margin:0;font-size:12px;color:#334155;flex-shrink:0">Primary</label>' +
              '<div style="display:flex;align-items:center;gap:6px;flex:1;justify-content:flex-end">' +
                '<input type="text" class="mf-theme-hex-input" maxlength="7" ' +
                       'data-mf-theme-hex="--mf-primary" value="' + escAttr(current) + '" ' +
                       'placeholder="#3b82f6" ' +
                       'style="width:80px;font-family:Consolas,Menlo,monospace;font-size:11px;' +
                       'padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;text-transform:uppercase">' +
                '<input type="color" value="' + escAttr(current) + '" ' +
                       'data-mf-theme-color="--mf-primary" ' +
                       'style="width:28px;height:28px;border:1px solid #cbd5e1;border-radius:4px;padding:0;cursor:pointer">' +
              '</div>' +
            '</div>' +
            '<div id="mf-theme-tints-host">' + buildTintStripHtml(current) + '</div>'
        );
    }

    function panelColorsHtml(): string {
        return (
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="form" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Form Backgrounds</h6>' +
              colorRow('--mf-page-bg',   'Page background', '#f5f5f5') +
              colorRow('--mf-form-bg',   'Form card',       '#ffffff') +
              colorRow('--mf-sidebar-bg','Sidebar',         '#f8fafc') +
            '</div>' +
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="input" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Primary &amp; Cascade</h6>' +
              primaryRowHtml() +
              colorRow('--mf-input-focus-border', 'Input focus',     '#3b82f6') +
              colorRow('--mf-check-color',        'Checkbox',        '#3b82f6') +
              colorRow('--mf-progress-fill',      'Progress bar',    '#3b82f6') +
            '</div>' +
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="section" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Text Colors</h6>' +
              colorRow('--mf-color-text',         'Body text',  '#1a1a2e') +
              colorRow('--mf-color-text-muted',   'Muted text', '#718096') +
              colorRow('--mf-title-color',        'Title',      '#1a1a2e') +
              colorRow('--mf-label-color',        'Labels',     '#2d3748') +
              colorRow('--mf-help-color',         'Help text',  '#64748b') +
              colorRow('--mf-required-color',     'Required *', '#dc2626') +
            '</div>' +
            // B49: Element-specific Input Colors (port of "Input Colors"
            //      section from ThemeDesignerHost.html lines 287-291)
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="input" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Input Colors</h6>' +
              colorRow('--mf-input-bg',           'Input background',  '#ffffff') +
              colorRow('--mf-input-border-color', 'Input border',      '#e2e8f0') +
              colorRow('--mf-input-text',         'Input text',        '#1a1a2e') +
              colorRow('--mf-input-disabled-bg',  'Disabled bg',       '#f1f5f9') +
            '</div>' +
            // B49: Element-specific Section & Progress (port of section
            //      block from ThemeDesignerHost.html lines 293-298)
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="section" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Section &amp; Progress</h6>' +
              colorRow('--mf-section-bg',         'Section bg',     '#f8fafc') +
              colorRow('--mf-section-border',     'Section border', '#e2e8f0') +
              colorRow('--mf-section-title',      'Section title',  '#0f172a') +
              colorRow('--mf-progress-bg',        'Progress bg',    '#e2e8f0') +
            '</div>' +
            // B49: Element-specific Buttons (port of button colors)
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="button" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Buttons</h6>' +
              colorRow('--mf-btn-bg',             'Button bg',     '#3b82f6') +
              colorRow('--mf-btn-text',           'Button text',   '#ffffff') +
              colorRow('--mf-btn-hover-bg',       'Hover bg',      '#2563eb') +
              colorRow('--mf-btn-secondary-bg',   'Secondary bg',  '#f1f5f9') +
              colorRow('--mf-btn-secondary-text', 'Secondary txt', '#0f172a') +
            '</div>' +
            // B49: File Upload (dropzone)
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="form" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">File Upload</h6>' +
              colorRow('--mf-dropzone-bg',       'Dropzone bg',     '#f8fafc') +
              colorRow('--mf-dropzone-border',   'Dropzone border', '#cbd5e1') +
              colorRow('--mf-dropzone-hover-bg', 'Hover bg',        '#eff6ff') +
            '</div>'
            // TODO[B50+] Color Harmony (Analogous / Triadic / Split)
            //   — Pro feature, deferred. Live in left-rail per scout.
            // TODO[B50+] 2D color canvas + hue slider — HEX input covers
            //   90% of need. Defer until users demand visual picker.
        );
    }

    // ── B49: Live font preview box. Renders "The quick brown fox..."
    //         + sample paragraph in the currently-selected font so the
    //         user knows what they're picking before applying. Port of
    //         #td-font-preview-box from ThemeDesignerHost.html. ───────
    function fontPreviewHtml(selectedFont: string): string {
        var stack = "'" + selectedFont + "',system-ui,sans-serif";
        return (
            '<div id="mf-theme-font-preview" class="mf-theme-font-preview" ' +
                 'style="margin:8px 0 0;padding:12px 14px;border:1px solid #e2e8f0;border-radius:8px;' +
                 'background:#fafbfc;font-family:' + escAttr(stack) + '">' +
              '<div style="font-size:20px;font-weight:600;color:#0f172a;line-height:1.3;margin-bottom:4px">' +
                'The quick brown fox' +
              '</div>' +
              '<div style="font-size:13px;color:#475569;line-height:1.5">' +
                'jumps over the lazy dog. 0123456789' +
              '</div>' +
            '</div>'
        );
    }

    function panelTypeHtml(): string {
        var currentFont = live['--mf-font-family'] || "'Inter',system-ui,sans-serif";
        var fontMatch = /'([^']+)'/.exec(currentFont);
        var selectedFont = fontMatch ? fontMatch[1] : 'Inter';
        var fontOpts = FONT_OPTIONS.map(function (f) {
            var sel = (f === selectedFont) ? ' selected' : '';
            return '<option value="' + escAttr(f) + '"' + sel + '>' + escAttr(f) + '</option>';
        }).join('');
        return (
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="form" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Font Family</h6>' +
              '<select class="form-control form-control-sm" data-mf-theme-font="1">' + fontOpts + '</select>' +
              fontPreviewHtml(selectedFont) +
            '</div>' +
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="form" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Title</h6>' +
              sliderRow('--mf-title-font-size', 'Size', 14, 56, 24, 'px') +
              // B49: title alignment (port of standalone Title.Align select)
              selectRow('--mf-title-text-align', 'Align',
                [{ v: 'left',   l: 'Left' },
                 { v: 'center', l: 'Center' },
                 { v: 'right',  l: 'Right' }], 'left') +
            '</div>' +
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="input" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Labels &amp; Inputs</h6>' +
              sliderRow('--mf-label-font-size', 'Label size', 10, 20, 14, 'px') +
              sliderRow('--mf-input-font-size', 'Input size', 10, 22, 15, 'px') +
              selectRow('--mf-label-font-weight', 'Label weight',
                [{ v: '400', l: 'Regular' }, { v: '500', l: 'Medium' },
                 { v: '600', l: 'Semibold' }, { v: '700', l: 'Bold' }], '500') +
            '</div>' +
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="button" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Buttons</h6>' +
              sliderRow('--mf-btn-font-size', 'Button size', 10, 24, 16, 'px') +
              selectRow('--mf-btn-font-weight', 'Button weight',
                [{ v: '400', l: 'Regular' }, { v: '500', l: 'Medium' },
                 { v: '600', l: 'Semibold' }, { v: '700', l: 'Bold' }], '600') +
            '</div>'
            // TODO[B50+] Custom font upload (browser-installed picker only
            //   for now; standalone has fa-upload button next to select)
        );
    }

    function panelSpaceHtml(): string {
        return (
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="form" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Form Card</h6>' +
              sliderRow('--mf-form-radius',    'Corner radius',   0,  32, 12, 'px') +
              sliderRow('--mf-form-padding-y', 'Form padding Y',  0,  72, 32, 'px') +
              sliderRow('--mf-form-padding-x', 'Form padding X',  0,  96, 40, 'px') +
              sliderRow('--mf-form-max-width', 'Form max width', 320, 1600, 720, 'px') +
            '</div>' +
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="input" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Fields &amp; Inputs</h6>' +
              sliderRow('--mf-field-gap',       'Field / row gap',   4, 48, 20, 'px') +
              sliderRow('--mf-input-radius',    'Input radius',      0, 32,  8, 'px') +
              sliderRow('--mf-input-padding-y', 'Input padding Y',   4, 28, 12, 'px') +
            '</div>' +
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="button" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Buttons</h6>' +
              sliderRow('--mf-btn-radius',    'Button radius',    0, 50,  8, 'px') +
              sliderRow('--mf-btn-padding-y', 'Button padding Y', 6, 32, 14, 'px') +
            '</div>'
        );
    }

    function panelEffectsHtml(): string {
        return (
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="form" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Shadows</h6>' +
              toggleRow('--mf-form-shadow',         'Form card shadow', '0 4px 24px rgba(0,0,0,.1)',    'none', true) +
              toggleRow('--mf-input-focus-shadow',  'Input focus glow', '0 0 0 3px rgba(59,130,246,.18)','none', true) +
              toggleRow('--mf-btn-shadow',          'Button shadow',    '0 4px 14px rgba(59,130,246,.35)','none', true) +
            '</div>' +
            '<div class="mf-theme-panel-section" data-mf-theme-anchor="form" style="margin-bottom:16px">' +
              '<h6 style="font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Borders</h6>' +
              toggleRow('--mf-form-border',          'Form card border', '1px solid #e2e8f0', 'none',               false) +
              toggleRow('--mf-input-border-toggle',  'Input borders',    '1px solid #e2e8f0', '1px solid transparent', true) +
            '</div>'
        );
    }

    function panelCustomHtml(): string {
        // Default placeholder text shown when the textarea is empty.
        var cssPlaceholder =
            '/* Add custom CSS here. Applies to form runtime. */\n' +
            '.mf-form { /* your styles */ }\n' +
            '.mf-input { /* override input style */ }';
        var htmlPlaceholder =
            '<div class=\'my-wrapper\'>\n' +
            '  {{form}}\n' +
            '</div>';
        return (
            '<div class="td-tab-panel" data-panel="custom">' +
              '<div class="td-section" style="margin-bottom:16px">' +
                '<label class="td-label" style="display:block;font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">Custom CSS</label>' +
                '<textarea id="mf-theme-custom-css" class="td-textarea-code" rows="12" ' +
                          'data-mf-theme-customcss="1" ' +
                          'placeholder="' + escAttr(cssPlaceholder) + '" ' +
                          'spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off">' +
                  escAttr(currentCustomCss || '') +
                '</textarea>' +
                '<div class="td-help" style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.45">' +
                  'CSS written here is appended to the form’s stylesheet at runtime. Use --mf-* variables to override theme tokens.' +
                '</div>' +
              '</div>' +
              '<div class="td-section" style="margin-bottom:16px">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px">' +
                  '<label class="td-label" style="display:block;font-size:12px;font-weight:700;color:#475569;margin:0;text-transform:uppercase;letter-spacing:.04em">Custom HTML Wrapper</label>' +
                  '<label style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#475569;cursor:pointer">' +
                    '<input type="checkbox" data-mf-theme-usehtml="1" ' + (currentUseCustomHtml ? 'checked' : '') + ' ' +
                           'style="accent-color:#6366f1;cursor:pointer">' +
                    '<span>Enable wrapper</span>' +
                  '</label>' +
                '</div>' +
                '<textarea id="mf-theme-custom-html" class="td-textarea-code" rows="8" ' +
                          'data-mf-theme-customhtml="1" ' +
                          'placeholder="' + escAttr(htmlPlaceholder) + '" ' +
                          'spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off">' +
                  escAttr(currentCustomHtml || '') +
                '</textarea>' +
                '<div class="td-help" style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.45">' +
                  'HTML wraps the form output. Use {{form}} placeholder for the form fields. Toggle off to fall back to the auto-generated layout without losing your template.' +
                '</div>' +
              '</div>' +
            '</div>'
        );
    }

    // ── B49b: Helper — collect available field keys from the form schema
    //         so the HTML tab can render a click-to-insert reference list. ─
    function collectFieldKeys(): Array<{ key: string; label: string; type: string }> {
        var out: Array<{ key: string; label: string; type: string }> = [];
        try {
            var schema: any = B.state && B.state.schema;
            var fields: any[] = (schema && Array.isArray(schema.fields)) ? schema.fields : [];
            var pushField = function (f: any): void {
                if (!f || !f.key) return;
                out.push({
                    key:   String(f.key),
                    label: String(f.label || f.title || f.key),
                    type:  String(f.type || 'Text')
                });
            };
            fields.forEach(function (f: any) {
                pushField(f);
                // Row -> columns -> nested fields
                if (f && f.type === 'Row' && Array.isArray(f.columns)) {
                    f.columns.forEach(function (col: any) {
                        ((col && col.fields) || []).forEach(function (cf: any) { pushField(cf); });
                    });
                }
                // FlexGrid items
                if (f && Array.isArray(f.items)) {
                    f.items.forEach(function (it: any) {
                        if (it && it.field) pushField(it.field);
                        else pushField(it);
                    });
                }
            });
        } catch (_e) { /* defensive */ }
        return out;
    }

    function buildFieldKeyReferenceHtml(): string {
        var keys = collectFieldKeys();
        if (keys.length === 0) {
            return (
                '<div style="font-size:11px;color:#94a3b8;font-style:italic;padding:8px;border:1px dashed #cbd5e1;border-radius:6px;background:#f8fafc;text-align:center">' +
                  'No fields yet — add fields in the Layout tab, then return here to insert tokens.' +
                '</div>'
            );
        }
        var rows = keys.map(function (k) {
            var token = '{{field:' + k.key + '}}';
            return (
                '<button type="button" class="mf-theme-fkey-chip" ' +
                        'data-mf-theme-insert-token="' + escAttr(token) + '" ' +
                        'title="Click to insert ' + escAttr(token) + ' into the template" ' +
                        'style="display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;text-align:left;margin-bottom:4px;transition:all .12s">' +
                  '<span style="flex:1;min-width:0">' +
                    '<span style="display:block;font-family:Consolas,Menlo,monospace;color:#6366f1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escAttr(token) + '</span>' +
                    '<span style="display:block;font-size:10px;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escAttr(k.label) + '</span>' +
                  '</span>' +
                  '<span style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;padding:2px 6px;border:1px solid #e2e8f0;border-radius:9999px;flex-shrink:0">' + escAttr(k.type) + '</span>' +
                '</button>'
            );
        }).join('');
        return (
            '<div class="mf-theme-fkey-list" style="max-height:280px;overflow-y:auto;padding:4px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc">' +
              rows +
            '</div>'
        );
    }

    // ── B49b: HTML sub-tab — dedicated "Full Custom HTML Template" editor.
    //         Distinct from the CSS textarea in the CUSTOM sub-tab and from
    //         the per-section "Custom HTML Wrapper" toggle. Lets the user
    //         replace the auto-generated form layout with their own HTML
    //         (wedding invitation style), using {{field:key}} placeholders. ─
    function panelHtmlTemplate(): string {
        var htmlPlaceholder =
            '<div class=\'wedding-card\'>\n' +
            '  <h1>Save the Date</h1>\n' +
            '  <p>Bride: {{field:bride_name}}</p>\n' +
            '  <p>Groom: {{field:groom_name}}</p>\n' +
            '  <p>Date: {{field:wedding_date}}</p>\n' +
            '</div>';
        var formId = '';
        try {
            var stAny: any = B.state || {};
            var schAny: any = stAny.schema || {};
            formId = String(
                stAny.formId || stAny.FormId ||
                schAny.id    || schAny.Id    ||
                ''
            );
        } catch (_e) { /* defensive */ }
        var previewHref = formId ? ('/xx?formid=' + encodeURIComponent(formId)) : '#';
        var previewAttrs = formId
            ? 'href="' + escAttr(previewHref) + '" target="_blank" rel="noopener"'
            : 'href="#" onclick="event.preventDefault();return false" aria-disabled="true"';
        return (
            '<div class="td-tab-panel" data-panel="html">' +

              // ── Section 1: Use Custom HTML toggle ──────────────────
              '<div class="td-section" style="margin-bottom:14px;padding:10px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px">' +
                '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin:0">' +
                  '<input type="checkbox" data-mf-theme-usecustomhtml="1" ' +
                         (currentUseCustomHtml ? 'checked' : '') + ' ' +
                         'style="width:18px;height:18px;cursor:pointer;accent-color:#6366f1">' +
                  '<span style="flex:1">' +
                    '<span style="display:block;font-size:13px;font-weight:700;color:#0c4a6e">Use Custom HTML Template</span>' +
                    '<span style="display:block;font-size:11px;color:#0369a1;margin-top:2px">When ON, the renderer uses your template below instead of the auto-generated field layout.</span>' +
                  '</span>' +
                '</label>' +
              '</div>' +

              // ── Section 2: Template editor textarea ────────────────
              '<div class="td-section" style="margin-bottom:14px">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">' +
                  '<label class="td-label" style="display:block;font-size:12px;font-weight:700;color:#475569;margin:0;text-transform:uppercase;letter-spacing:.04em">Full Custom HTML Template</label>' +
                  '<a ' + previewAttrs + ' class="mf-theme-html-preview-btn" ' +
                       'style="font-size:11px;padding:4px 10px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none;display:inline-flex;align-items:center;gap:4px' +
                       (formId ? '' : ';opacity:.4;cursor:not-allowed;pointer-events:none') + '">' +
                    '<i class="fas fa-external-link-alt"></i> Preview' +
                  '</a>' +
                '</div>' +
                '<textarea id="mf-theme-html-template" class="td-textarea-code" rows="12" ' +
                          'data-mf-theme-htmltemplate="1" ' +
                          'placeholder="' + escAttr(htmlPlaceholder) + '" ' +
                          'spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" ' +
                          'style="width:100%;min-height:220px;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.45;padding:10px;border:1px solid #cbd5e1;border-radius:6px;background:#0f172a;color:#e2e8f0;resize:vertical">' +
                  escAttr(currentCustomHtml || '') +
                '</textarea>' +
                '<div class="td-help" style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.45">' +
                  'Use <code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;color:#6366f1">{{field:key}}</code> placeholders to inject form fields anywhere in your HTML. The Preview button opens the live form in a new tab.' +
                '</div>' +
              '</div>' +

              // ── Section 3: Field key reference list ────────────────
              '<div class="td-section" style="margin-bottom:8px">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">' +
                  '<label class="td-label" style="display:block;font-size:12px;font-weight:700;color:#475569;margin:0;text-transform:uppercase;letter-spacing:.04em">Available Field Keys</label>' +
                  '<span style="font-size:10px;color:#94a3b8">click to insert</span>' +
                '</div>' +
                buildFieldKeyReferenceHtml() +
              '</div>' +

            '</div>'
        );
    }

    // ── B49: Device preview switcher. Three small icon buttons mounted
    //         in the toolbar (desktop/tablet/mobile). On click we set
    //         currentDevice and resize the canvas wrapper via
    //         applyDevicePreview(). Also dispatches a window event
    //         'mf:theme-device-change' so other Builder panels (status
    //         bar, etc.) can react. ────────────────────────────────────
    function buildDeviceToggleHtml(): string {
        var devices: Array<{ id: DeviceKind; icon: string; label: string }> = [
            { id: 'desktop', icon: 'fa-desktop',       label: 'Desktop preview' },
            { id: 'tablet',  icon: 'fa-tablet-screen-button', label: 'Tablet preview' },
            { id: 'mobile',  icon: 'fa-mobile-screen', label: 'Mobile preview' }
        ];
        var btns = devices.map(function (d) {
            var isActive = (d.id === currentDevice);
            return (
                '<button type="button" class="mf-theme-device-btn" ' +
                'data-mf-theme-device="' + escAttr(d.id) + '" ' +
                'title="' + escAttr(d.label) + '" ' +
                'style="padding:4px 8px;border:1px solid ' + (isActive ? '#6366f1' : '#e2e8f0') + ';' +
                'border-radius:4px;background:' + (isActive ? '#eef2ff' : '#fff') + ';' +
                'color:' + (isActive ? '#4f46e5' : '#64748b') + ';cursor:pointer;font-size:11px">' +
                '<i class="fas ' + escAttr(d.icon) + '"></i>' +
                '</button>'
            );
        }).join('');
        return (
            '<div class="mf-theme-device-group" id="mf-theme-device-group" ' +
                 'style="display:inline-flex;gap:4px;margin-right:6px">' +
              btns +
            '</div>'
        );
    }

    function applyDevicePreview(): void {
        try {
            var dz = document.getElementById('mf-canvas-dropzone');
            if (!dz) return;
            // Apply via data-attr so canvas.ts CSS rules can also hook in.
            dz.setAttribute('data-mf-theme-device', currentDevice);

            // ── Design mode: the live form is INSIDE the preview iframe (its
            //    .mf-form-wrapper is in the iframe's own document, unreachable from
            //    here). The iframe element is therefore the only resizable target.
            //    Render it at a real device width and `zoom`-fit the center column.
            var frame = dz.querySelector('#mf-builder-preview-frame, .mf-theme-preview-frame') as HTMLElement | null;
            if (frame) {
                var pad = 48; // [B91] design dropzone horizontal padding (24px * 2)
                var availW = Math.max(320, (dz.clientWidth || 0) - pad);
                // Desktop adapts to the column: when there's room (≥1024 after a panel
                // collapse) it renders 1:1 and crisp; when cramped it renders at the
                // 1024 desktop breakpoint and zooms to fit (more legible than a fixed
                // 1280). Tablet/mobile use their real device widths.
                var renderW = currentDevice === 'desktop'
                    ? Math.max(availW, 1024)
                    : (DEVICE_RENDER_WIDTHS[currentDevice] || 1280);
                var availH = Math.max(420, (dz.clientHeight || 0) - pad);
                var z = renderW > availW ? (availW / renderW) : 1;
                frame.style.width = renderW + 'px';
                frame.style.maxWidth = 'none';
                // `zoom` shrinks the LAYOUT box too (Chromium/Safari/Firefox 126+),
                // so the scaled iframe fits the column with NO overflow/scrollbar —
                // unlike transform:scale which leaves the unscaled box behind.
                (frame.style as any).zoom = z < 1 ? String(Math.round(z * 1000) / 1000) : '';
                // Fill the column height so the preview reads like a page, not a card;
                // the iframe scrolls internally for tall forms.
                frame.style.height = Math.round((z < 1 ? availH / z : availH)) + 'px';
                frame.style.minHeight = '0';
                frame.style.marginLeft = 'auto';
                frame.style.marginRight = 'auto';
                frame.style.transition = 'width .18s ease';
                frame.setAttribute('data-mf-device', currentDevice);
            }

            // ── Build / no-iframe path (native FlexGrid canvas): the form wrapper
            //    IS a real dropzone descendant, so resize it directly.
            var width = DEVICE_WIDTHS[currentDevice] || '100%';
            var wrap = dz.querySelector('.mf-form-wrapper') as HTMLElement | null;
            if (wrap) {
                wrap.style.maxWidth = width;
                wrap.style.marginLeft = 'auto';
                wrap.style.marginRight = 'auto';
                wrap.style.transition = 'max-width 0.18s ease';
            }
            var form = dz.querySelector('.mf-form') as HTMLElement | null;
            if (form && !wrap) {
                form.style.maxWidth = width;
                form.style.marginLeft = 'auto';
                form.style.marginRight = 'auto';
                form.style.transition = 'max-width 0.18s ease';
            }
            window.dispatchEvent(new CustomEvent('mf:theme-device-change', {
                detail: { device: currentDevice, width: width }
            }));
        } catch (_e) { /* defensive */ }
    }

    // [P1-1/P1-2] Re-fit the device preview whenever the available width changes —
    // window resize OR a side-panel collapse/expand (so collapsing a panel gives a
    // bigger, crisper preview). A ResizeObserver on the dropzone catches BOTH; the
    // window listener is a belt-and-braces fallback. Bound once.
    var _mfDevRz: any = null;
    var _mfRefit = function () {
        if (_mfDevRz) clearTimeout(_mfDevRz);
        _mfDevRz = setTimeout(function () {
            try { if (document.body.classList.contains('state-theme-mode')) applyDevicePreview(); } catch (_e) { /* defensive */ }
        }, 90);
    };
    if (typeof window !== 'undefined' && !(window as any).__MF_THEME_DEVICE_RESIZE_BOUND__) {
        (window as any).__MF_THEME_DEVICE_RESIZE_BOUND__ = true;
        window.addEventListener('resize', _mfRefit);
        try {
            if (typeof (window as any).ResizeObserver === 'function') {
                var _ro = new (window as any).ResizeObserver(function () { _mfRefit(); });
                (window as any).__MF_THEME_DEVICE_RO__ = _ro;
                // Observe the dropzone once it exists (it may mount after this runs).
                var _attachRo = function () {
                    var dz = document.getElementById('mf-canvas-dropzone');
                    if (dz) { try { _ro.observe(dz); } catch (_e) { /* */ } }
                };
                _attachRo();
                window.addEventListener('mf:theme-tab-activated', _attachRo);
            }
        } catch (_e) { /* defensive */ }
    }

    function repaintDeviceGroup(): void {
        if (!activeContainer) return;
        var group = activeContainer.querySelector('#mf-theme-device-group') as HTMLElement | null;
        if (group) group.outerHTML = buildDeviceToggleHtml();
    }

    // [B70] Right-rail restructure: Global / Inputs / Buttons / Layout
    // [B77 mock parity] Build a fontFamily select bound to --mf-font-family
    // (mock uses "Heading Font" + "Body Font" — we expose both as selects).
    function fontSelectHtml(varName: string, label: string, fallback: string): string {
        var current = live[varName] || fallback;
        var opts = FONT_OPTIONS.map(function (f) {
            return '<option value="' + escAttr(f) + '"' + (current.indexOf(f) >= 0 ? ' selected' : '') + '>' + escAttr(f) + '</option>';
        }).join('');
        return (
            '<div class="td-sld-row" data-mf-theme-var="' + escAttr(varName) + '" style="margin:6px 0 12px">' +
              '<div style="font-size:11px;font-weight:600;color:#334155;margin-bottom:4px">' + escAttr(label) + '</div>' +
              '<select class="form-control form-control-sm mf-tr-font-select" data-mf-theme-select="' + escAttr(varName) + '">' + opts + '</select>' +
            '</div>'
        );
    }

    // [B77 mock parity] Shape preset cards row (Rounded / Pill / Sharp / Soft).
    // Click sets componentStyle via data-mf-theme-shape — the existing
    // wireup handles --mf-form-radius update. Same primitive used by Layout
    // tab's Form Card section.
    function shapeCardsHtml(activeShape?: string): string {
        var shapes = [
            { id: 'rounded', label: 'Rounded', radius: '4px'   },
            { id: 'pill',    label: 'Pill',    radius: '999px' },
            { id: 'sharp',   label: 'Sharp',   radius: '0'     },
            { id: 'soft',    label: 'Soft',    radius: '10px'  },
        ];
        var html = shapes.map(function (s) {
            var act = s.id === (activeShape || 'rounded');
            return (
                '<button type="button" class="mf-tr-shape-card' + (act ? ' is-active' : '') + '" data-mf-theme-shape="' + escAttr(s.id) + '">' +
                  '<div class="mf-tr-shape-preview" style="border-radius:' + s.radius + '"></div>' +
                  '<span class="mf-tr-shape-label">' + escAttr(s.label) + '</span>' +
                '</button>'
            );
        }).join('');
        return '<div class="mf-tr-shape-cards">' + html + '</div>';
    }

    // [B77 mock parity] Shadow preset row (None / XS / SM / MD / LG / XL).
    // Click sets --mf-form-shadow + --mf-btn-shadow.
    function shadowPresetsHtml(activeShadow?: string): string {
        var presets = [
            { id: 'none', label: 'None', val: 'none' },
            { id: 'xs',   label: 'XS',   val: '0 1px 2px rgba(0,0,0,0.05)' },
            { id: 'sm',   label: 'SM',   val: '0 2px 4px rgba(0,0,0,0.06)' },
            { id: 'md',   label: 'MD',   val: '0 4px 8px rgba(0,0,0,0.10)' },
            { id: 'lg',   label: 'LG',   val: '0 8px 16px rgba(0,0,0,0.12)' },
            { id: 'xl',   label: 'XL',   val: '0 16px 32px rgba(0,0,0,0.16)' },
        ];
        var html = presets.map(function (p) {
            var act = p.id === (activeShadow || 'md');
            return (
                '<button type="button" class="mf-tr-shadow-card' + (act ? ' is-active' : '') + '" data-mf-theme-shadow-preset="' + escAttr(p.id) + '" data-mf-theme-shadow-val="' + escAttr(p.val) + '">' +
                  '<div class="mf-tr-shadow-preview" style="box-shadow:' + p.val + '"></div>' +
                  '<span class="mf-tr-shadow-label">' + escAttr(p.label) + '</span>' +
                '</button>'
            );
        }).join('');
        return '<div class="mf-tr-shadow-cards">' + html + '</div>';
    }

    // [B77 mock parity] Numeric quad inputs for X / Y / Blur / Spread.
    function shadowQuadHtml(): string {
        var fields = [
            { id: 'x',      label: 'X Offset', def: '0' },
            { id: 'y',      label: 'Y Offset', def: '4' },
            { id: 'blur',   label: 'Blur',     def: '6' },
            { id: 'spread', label: 'Spread',   def: '0' },
        ];
        return (
            '<div class="mf-tr-shadow-quad">' +
              fields.map(function (f) {
                  return (
                      '<div class="mf-tr-quad-cell">' +
                        '<input type="number" class="mf-tr-quad-input" data-mf-theme-shadow-axis="' + escAttr(f.id) + '" value="' + escAttr(f.def) + '"/>' +
                        '<span class="mf-tr-quad-label">' + escAttr(f.label) + '</span>' +
                      '</div>'
                  );
              }).join('') +
            '</div>'
        );
    }

    // [B77 mock parity — Global tab]
    // Typography (Heading Font + Body Font + Base Size + Line Height + Letter Spacing)
    // Border Radius (4 shape cards + Custom Radius slider)
    // Shadows (6 preset row + 4 quad inputs)
    // Transitions (Enable toggle + Duration slider + Easing select)
    function activeShapeFromLive(): string {
        var form = String(live['--mf-form-radius'] || '').trim();
        var input = String(live['--mf-input-radius'] || '').trim();
        if (form === '0px' || input === '0px') return 'sharp';
        if (input === '999px') return 'pill';
        if (form === '16px' || input === '10px') return 'soft';
        return 'rounded';
    }

    function activeShadowFromLive(): string {
        var val = String(live['--mf-form-shadow'] || '').toLowerCase();
        if (!val || val === 'none') return val === 'none' ? 'none' : 'md';
        if (val.indexOf('16px 32px') >= 0) return 'xl';
        if (val.indexOf('8px 16px') >= 0) return 'lg';
        if (val.indexOf('4px 8px') >= 0) return 'md';
        if (val.indexOf('2px 4px') >= 0) return 'sm';
        if (val.indexOf('1px 2px') >= 0) return 'xs';
        return 'md';
    }

    // [B269/B272] "Page integration" — two source switches (Typography / Color) that let an
    // inline-embedded form borrow the host skin's font / primary colour. Available on EVERY form
    // type (standard, AI custom-HTML, premium .mfp) — it is an opt-in, reversible author choice, so
    // there is no form on which it is blocked (AI forms also use customHtml, so gating on that was
    // wrong). The selects persist plain booleans via onInputDelegated (data-mf-theme-inherit),
    // NOT CSS vars.
    function pageInheritSectionHtml(): string {
        var opt = function (v: string, l: string, on: boolean): string {
            return '<option value="' + v + '"' + (on ? ' selected' : '') + '>' + l + '</option>';
        };
        var row = function (kind: string, label: string, pageLabel: string, on: boolean): string {
            return (
                '<div class="td-sld-row" style="margin:8px 0">' +
                  '<div style="font-size:12px;color:#334155;margin-bottom:4px">' + escAttr(label) + '</div>' +
                  '<select class="form-control form-control-sm" data-mf-theme-inherit="' + escAttr(kind) + '">' +
                    opt('theme', 'MegaForm theme', !on) +
                    opt('page', pageLabel, on) +
                  '</select>' +
                '</div>'
            );
        };
        return (
            '<div class="mf-tr-section" data-mf-theme-anchor="form">' +
              '<div class="mf-tr-section-head"><i class="fas fa-link mf-tr-section-icon" style="color:#0ea5e9"></i><span>Page integration</span></div>' +
              '<div style="font-size:10px;color:#94a3b8;margin:-2px 0 6px;line-height:1.45">Only when the form is embedded <b>inline</b> in an Oqtane/DNN page — borrows the host skin\'s font / primary colour. No effect inside an iframe embed; visible on the published page (preview here is approximate).</div>' +
              row('type', 'Typography source', 'Inherit from page', currentInheritType) +
              row('colors', 'Color source', 'Borrow from page', currentInheritColors) +
            '</div>'
        );
    }

    // [B271] Reorg: the commonly-used groups (Page integration → Typography → Border Radius) stay
    // up top; the decorative / rarely-touched groups (Shadows, Transitions) move DOWN into the
    // collapsible "Advanced" block alongside Custom CSS / HTML, so the default Global view is clean.
    // All these knobs use document-delegated handlers (data-mf-theme-*), so nesting them inside the
    // collapsed body keeps every handler working.
    function panelShadowsHtml(): string {
        return (
            '<div class="mf-tr-section" data-mf-theme-anchor="form">' +
              '<div class="mf-tr-section-head"><i class="fas fa-layer-group mf-tr-section-icon" style="color:#d97706"></i><span>Shadows</span></div>' +
              shadowPresetsHtml(activeShadowFromLive()) +
              shadowQuadHtml() +
            '</div>'
        );
    }
    function panelTransitionsHtml(): string {
        return (
            '<div class="mf-tr-section" data-mf-theme-anchor="form">' +
              '<div class="mf-tr-section-head"><i class="fas fa-bolt mf-tr-section-icon" style="color:#7c3aed"></i><span>Transitions</span></div>' +
              // [B272] Enable-transitions toggle + Easing select removed — dead vars (0 consumers).
              // Duration kept: the renderer reads --mf-transition-duration (renderer/index.ts:448).
              sliderRow('--mf-transition-duration', 'Duration', 0, 500, 200, 'ms') +
            '</div>'
        );
    }

    function panelGlobalHtml(): string {
        var divider = '<div style="margin:12px 0;border-top:1px solid #e2e8f0"></div>';
        return (
            pageInheritSectionHtml() +
            '<div class="mf-tr-section" data-mf-theme-anchor="form">' +
              '<div class="mf-tr-section-head"><i class="fas fa-font mf-tr-section-icon" style="color:#2563eb"></i><span>Typography</span></div>' +
              // [B272] Heading weight + Letter spacing removed — dead vars (0 consumers anywhere).
              fontSelectHtml('--mf-heading-font', 'Heading Font', 'Inter') +
              fontSelectHtml('--mf-font-family', 'Body Font', 'Inter') +
              sliderRow('--mf-font-size-base', 'Base size',     12,    20,    16,   'px') +
              sliderRow('--mf-line-height',    'Line height',   1,     2,     1.5,  '')   +
            '</div>' +
            '<div class="mf-tr-section" data-mf-theme-anchor="form">' +
              '<div class="mf-tr-section-head"><i class="fas fa-square mf-tr-section-icon" style="color:#059669"></i><span>Border Radius</span></div>' +
              shapeCardsHtml(activeShapeFromLive()) +
              sliderRow('--mf-form-radius', 'Custom radius', 0, 24, 8, 'px') +
            '</div>' +
            '<div class="mf-theme-advanced-wrap" style="margin-top:8px">' +
              '<button type="button" data-mf-theme-advanced-toggle class="mf-tr-advanced-toggle">' +
                '<span><i class="fas fa-sliders-h" style="margin-right:6px;color:#6366f1"></i>Advanced — Effects, CSS &amp; HTML</span>' +
                '<i class="fas fa-chevron-down" style="font-size:10px;color:#94a3b8"></i>' +
              '</button>' +
              '<div class="mf-theme-advanced-body" style="display:none;padding-top:10px">' +
                panelShadowsHtml() +
                panelTransitionsHtml() +
                divider +
                panelCustomHtml() +
                divider +
                panelHtmlTemplate() +
              '</div>' +
            '</div>'
        );
    }

    // [B77 mock parity — Inputs tab]
    //   Input Dimensions (Height + Padding X)
    //   Label Styles    (Size + Weight + Required Asterisk + Floating Labels)
    //   Helper Text     (Size + Show Character Count)
    //   Borders & Focus (Border Width + Focus Ring Width + Focus Ring Offset)
    //   Placeholder     (Color + Italic Style)
    function panelInputsHtml(): string {
        return (
            '<div class="mf-tr-section" data-mf-theme-anchor="input">' +
              '<div class="mf-tr-section-head"><i class="fas fa-i-cursor mf-tr-section-icon" style="color:#2563eb"></i><span>Input Dimensions</span></div>' +
              sliderRow('--mf-input-height',    'Height',          32, 56, 40, 'px') +
              sliderRow('--mf-input-padding-x', 'Horizontal padding', 8, 20, 12, 'px') +
            '</div>' +
            '<div class="mf-tr-section" data-mf-theme-anchor="input">' +
              '<div class="mf-tr-section-head"><i class="fas fa-font mf-tr-section-icon" style="color:#7c3aed"></i><span>Label Styles</span></div>' +
              sliderRow('--mf-label-font-size', 'Font size', 11, 16, 14, 'px') +
              selectRow('--mf-label-font-weight', 'Font weight',
                [{ v: '400', l: 'Regular' }, { v: '500', l: 'Medium' }, { v: '600', l: 'Semibold' }, { v: '700', l: 'Bold' }], '500') +
              toggleRow('--mf-label-required-asterisk', 'Required asterisk', 'on', 'off', true) +
              toggleRow('--mf-label-floating',          'Floating labels',   'on', 'off', false) +
            '</div>' +
            '<div class="mf-tr-section" data-mf-theme-anchor="input">' +
              '<div class="mf-tr-section-head"><i class="fas fa-info-circle mf-tr-section-icon" style="color:#0891b2"></i><span>Helper Text</span></div>' +
              sliderRow('--mf-help-font-size', 'Font size', 10, 14, 12, 'px') +
              toggleRow('--mf-help-char-count', 'Show character count', 'on', 'off', false) +
            '</div>' +
            '<div class="mf-tr-section" data-mf-theme-anchor="input">' +
              '<div class="mf-tr-section-head"><i class="fas fa-border-style mf-tr-section-icon" style="color:#059669"></i><span>Borders &amp; Focus</span></div>' +
              sliderRow('--mf-input-border-width',     'Border width',      0, 3, 1, 'px') +
              sliderRow('--mf-input-focus-ring-width', 'Focus ring width',  1, 4, 2, 'px') +
              sliderRow('--mf-input-focus-ring-offset','Focus ring offset', 0, 4, 2, 'px') +
              colorRow('--mf-input-border-color', 'Border color', '#e2e8f0') +
              colorRow('--mf-input-focus-border', 'Focus color',  '#3b82f6') +
            '</div>' +
            '<div class="mf-tr-section" data-mf-theme-anchor="input">' +
              '<div class="mf-tr-section-head"><i class="fas fa-paragraph mf-tr-section-icon" style="color:#64748b"></i><span>Placeholder</span></div>' +
              colorRow('--mf-input-placeholder-color', 'Color', '#94a3b8') +
              toggleRow('--mf-input-placeholder-italic', 'Italic style', 'italic', 'normal', false) +
            '</div>'
        );
    }

    // [B77 mock parity — Buttons tab]
    //   Button Dimensions (Height + Padding X)
    //   Typography        (Font Size + Weight + Uppercase)
    //   Button Variants   (Primary / Secondary / Outline / Ghost / Destructive — color rows + radius/padding)
    //   Icons             (Show + Position + Size)
    //   Loading State     (Indicator + Disable on Loading)
    function panelButtonsHtml(): string {
        var variants = [
            { id: 'primary',     label: 'Primary',     varBg: '--mf-btn-bg',           varTxt: '--mf-btn-text',           defBg: '#3b82f6', defTxt: '#ffffff' },
            { id: 'secondary',   label: 'Secondary',   varBg: '--mf-btn-secondary-bg', varTxt: '--mf-btn-secondary-text', defBg: '#f1f5f9', defTxt: '#0f172a' },
            { id: 'outline',     label: 'Outline',     varBg: '--mf-btn-outline-border', varTxt: '--mf-btn-outline-text', defBg: '#e2e8f0', defTxt: '#475569' },
            { id: 'ghost',       label: 'Ghost',       varBg: '--mf-btn-ghost-hover-bg', varTxt: '--mf-btn-ghost-text',   defBg: '#f8fafc', defTxt: '#475569' },
            { id: 'destructive', label: 'Destructive', varBg: '--mf-btn-destructive-bg', varTxt: '--mf-btn-destructive-text', defBg: '#dc2626', defTxt: '#ffffff' },
        ];
        var variantRows = variants.map(function (v) {
            return (
                '<div class="mf-tr-variant-row" data-variant-id="' + escAttr(v.id) + '">' +
                  '<div class="mf-tr-variant-info">' +
                    '<div class="mf-tr-variant-preview" style="background:' + escAttr(live[v.varBg] || v.defBg) + ';color:' + escAttr(live[v.varTxt] || v.defTxt) + '">Aa</div>' +
                    '<span class="mf-tr-variant-name">' + escAttr(v.label) + '</span>' +
                  '</div>' +
                  '<input type="color" value="' + escAttr(live[v.varBg] || v.defBg) + '" data-mf-theme-color="' + escAttr(v.varBg) + '" title="' + escAttr(v.label) + ' background"/>' +
                '</div>'
            );
        }).join('');
        return (
            '<div class="mf-tr-section" data-mf-theme-anchor="button">' +
              '<div class="mf-tr-section-head"><i class="fas fa-arrows-alt-h mf-tr-section-icon" style="color:#2563eb"></i><span>Button Dimensions</span></div>' +
              sliderRow('--mf-btn-height',    'Height',          32, 56, 40, 'px') +
              sliderRow('--mf-btn-padding-x', 'Horizontal padding', 12, 32, 16, 'px') +
            '</div>' +
            '<div class="mf-tr-section" data-mf-theme-anchor="button">' +
              '<div class="mf-tr-section-head"><i class="fas fa-font mf-tr-section-icon" style="color:#7c3aed"></i><span>Typography</span></div>' +
              sliderRow('--mf-btn-font-size', 'Font size', 12, 18, 14, 'px') +
              selectRow('--mf-btn-font-weight', 'Font weight',
                [{ v: '400', l: 'Regular' }, { v: '500', l: 'Medium' }, { v: '600', l: 'Semibold' }, { v: '700', l: 'Bold' }], '500') +
              toggleRow('--mf-btn-text-transform', 'Uppercase text', 'uppercase', 'none', false) +
            '</div>' +
            '<div class="mf-tr-section" data-mf-theme-anchor="button">' +
              '<div class="mf-tr-section-head"><i class="fas fa-palette mf-tr-section-icon" style="color:#db2777"></i><span>Button Variants</span></div>' +
              '<div class="mf-tr-variants-list">' + variantRows + '</div>' +
              sliderRow('--mf-btn-radius',    'Radius',    0, 50,  8, 'px') +
              sliderRow('--mf-btn-padding-y', 'Padding Y', 6, 32, 14, 'px') +
              toggleRow('--mf-btn-shadow',    'Shadow',    '0 4px 14px rgba(59,130,246,.35)','none', true) +
            '</div>' +
            '<div class="mf-tr-section" data-mf-theme-anchor="button">' +
              '<div class="mf-tr-section-head"><i class="fas fa-icons mf-tr-section-icon" style="color:#0891b2"></i><span>Icons</span></div>' +
              toggleRow('--mf-btn-icon-show', 'Show icons', 'inline-flex', 'none', true) +
              selectRow('--mf-btn-icon-position', 'Icon position',
                [{ v: 'left',  l: 'Left'  }, { v: 'right', l: 'Right' }], 'left') +
              sliderRow('--mf-btn-icon-size', 'Icon size', 12, 24, 16, 'px') +
            '</div>' +
            '<div class="mf-tr-section" data-mf-theme-anchor="button">' +
              '<div class="mf-tr-section-head"><i class="fas fa-spinner mf-tr-section-icon" style="color:#059669"></i><span>Loading State</span></div>' +
              selectRow('--mf-btn-loading-indicator', 'Loading indicator',
                [{ v: 'spinner', l: 'Spinner' }, { v: 'dots', l: 'Dots' }, { v: 'pulse', l: 'Pulse' }], 'spinner') +
              toggleRow('--mf-btn-loading-disabled', 'Disable on loading', 'on', 'off', true) +
            '</div>'
        );
    }

    // [B77 mock parity — Layout tab]
    //   Spacing             (Linked toggle + Base unit + Form padding + Field gap + Section gap)
    //   Form Container      (Max width + Alignment + Border + Shadow)
    //   Grid Settings       (Columns + Column gap + Responsive)
    //   Header & Footer     (Show header / footer / sticky footer)
    //   Responsive Breakpoints (read-only info + Configure button)
    // [ThemeTabTrim v20260624] Layout panel rebuilt to ONLY expose controls whose CSS
    // variables are actually consumed by megaform.css on the rendered form (verified via
    // the public /render path). Dead knobs were removed so every visible control has a
    // real, immediate effect on the center canvas + the saved/published form:
    //   • Form padding  → --mf-form-padding (composed from -y by composeCompositeVars; .mf-form{padding})
    //   • Field gap     → --mf-field-gap (.mf-flexgrid margin-bottom + field groups)
    //   • Max width     → --mf-form-max-width (.mf-form-inner{max-width})
    //   • Show border   → --mf-form-border  (.mf-form{border})   [repointed from dead --mf-form-border-show]
    //   • Show shadow   → --mf-form-shadow  (.mf-form{box-shadow})[repointed from dead --mf-form-shadow-show]
    //   • Columns (1)   → forced single-column stack (buildIframeOverridesCss); auto/2/3 = native
    //   • Column gap    → --mf-grid-gap     (.mf-flexgrid{gap})  [repointed from dead --mf-form-column-gap]
    // Removed (no CSS consumer / no effect): Base unit, Section gap + link, Alignment,
    // Responsive-columns toggle, Header/Footer/Sticky toggles, Responsive-info block.
    // NOTE: --mf-form-border / --mf-form-shadow / --mf-form-padding target the STANDARD form
    // card (.mf-form). On premium / custom-HTML forms that card is intentionally stripped
    // (the .mfp shell is the visual frame) — there Max width + Field gap remain the effective
    // layout knobs, which is the correct behaviour for those templates.
    function panelLayoutHtml(): string {
        return (
            '<div class="mf-tr-section" data-mf-theme-anchor="form">' +
              '<div class="mf-tr-section-head">' +
                '<i class="fas fa-arrows-alt mf-tr-section-icon" style="color:#2563eb"></i>' +
                '<span style="flex:1">Spacing</span>' +
              '</div>' +
              sliderRow('--mf-form-padding-y',  'Form padding',  12, 48, 24, 'px') +
              sliderRow('--mf-field-gap',      'Field gap',      8,  32, 16, 'px') +
            '</div>' +
            '<div class="mf-tr-section" data-mf-theme-anchor="form">' +
              '<div class="mf-tr-section-head"><i class="fas fa-square-full mf-tr-section-icon" style="color:#059669"></i><span>Form Container</span></div>' +
              selectRow('--mf-form-max-width', 'Max width',
                [{ v: '480px', l: '480px (Narrow)' }, { v: '640px', l: '640px (Default)' }, { v: '768px', l: '768px (Wide)' }, { v: '100%', l: 'Full width' }], '640px') +
              toggleRow('--mf-form-border', 'Show border', '1px solid #e2e8f0', 'none', true) +
              toggleRow('--mf-form-shadow', 'Show shadow', '0 4px 24px rgba(0,0,0,.1)', 'none', true) +
            '</div>' +
            '<div class="mf-tr-section" data-mf-theme-anchor="form">' +
              '<div class="mf-tr-section-head"><i class="fas fa-th mf-tr-section-icon" style="color:#7c3aed"></i><span>Grid Settings</span></div>' +
              // [P1-5] Default = 'auto' (the form's native per-field span layout) so
              // the displayed value matches what the preview actually shows. Only
              // '1 column' is wired to force a true single-column stack (see
              // buildIframeOverridesCss); 2/3 fall back to the native layout.
              selectRow('--mf-form-columns', 'Columns',
                [{ v: 'auto', l: 'Auto (default)' }, { v: '1', l: '1 column' }, { v: '2', l: '2 columns' }, { v: '3', l: '3 columns' }], 'auto') +
              sliderRow('--mf-grid-gap', 'Column gap', 8, 32, 16, 'px') +
            '</div>'
        );
    }

    // [B73] Inspector sub-tab — populated by CSS picker from left-rail Colors tab.
    // Shows detected CSS properties organized by category with live-editable inputs.
    var _inspectorState: { selector: string; styles: Record<string, string> } = { selector: '', styles: {} };

    function panelInspectorHtml(): string {
        return (
            '<div class="mf-theme-panel-section" style="margin-bottom:16px">' +
              '<div id="mf-theme-inspector-empty" style="padding:24px 12px;text-align:center;color:#94a3b8;font-size:12px">' +
                '<i class="fas fa-crosshairs" style="font-size:24px;display:block;margin-bottom:10px;opacity:.5"></i>' +
                'Click <b>Pick</b> in the left Colors panel, then click any element on the form preview to inspect its styles here.' +
              '</div>' +
              '<div id="mf-theme-inspector-content" style="display:none">' +
                '<div style="font-family:Consolas,Menlo,monospace;font-size:11px;color:#0f172a;background:#f1f5f9;padding:6px 8px;border-radius:6px;margin-bottom:10px;word-break:break-all" id="mf-theme-inspector-sel"></div>' +
                '<div id="mf-theme-inspector-crumbs" style="font-size:10px;color:#64748b;margin-bottom:12px"></div>' +
                '<div id="mf-theme-inspector-categories"></div>' +
              '</div>' +
            '</div>'
        );
    }

    function openInspectorSubtab(): void {
        if (!activeContainer) return;
        var sub = activeContainer.querySelector<HTMLElement>('[data-mf-theme-subtab="inspector"]');
        if (sub) {
            activeContainer.querySelectorAll<HTMLElement>('[data-mf-theme-subtab]').forEach(function (b) {
                var isActive = (b.getAttribute('data-mf-theme-subtab') === 'inspector');
                b.classList.toggle('active', isActive);
                b.style.color = isActive ? '#0f172a' : '#64748b';
                b.style.borderBottomColor = isActive ? '#6366f1' : 'transparent';
            });
            activeContainer.querySelectorAll<HTMLElement>('[data-mf-theme-panel]').forEach(function (p2) {
                p2.style.display = (p2.getAttribute('data-mf-theme-panel') === 'inspector') ? '' : 'none';
            });
        }
    }

    function populateInspectorPanel(selector: string, breadcrumb: string[], styles: Record<string, string>): void {
        if (!activeContainer) return;
        _inspectorState = { selector: selector, styles: { ...(styles || {}) } };

        var emptyEl = activeContainer.querySelector<HTMLElement>('#mf-theme-inspector-empty');
        var contentEl = activeContainer.querySelector<HTMLElement>('#mf-theme-inspector-content');
        var selEl = activeContainer.querySelector<HTMLElement>('#mf-theme-inspector-sel');
        var crumbsEl = activeContainer.querySelector<HTMLElement>('#mf-theme-inspector-crumbs');
        var catEl = activeContainer.querySelector<HTMLElement>('#mf-theme-inspector-categories');

        if (emptyEl) emptyEl.style.display = 'none';
        if (contentEl) contentEl.style.display = '';
        if (selEl) selEl.textContent = selector || '(unknown)';

        if (crumbsEl) {
            var crumbs = (breadcrumb && breadcrumb.length ? breadcrumb : [selector || 'unknown'])
                .map(function (c: string) { return '<span style="display:inline-block;background:#eef2ff;color:#4338ca;padding:1px 5px;border-radius:3px;margin:1px;font-size:10px">' + escHtml(c) + '</span>'; })
                .join('<span style="color:#cbd5e1;margin:0 2px">›</span>');
            crumbsEl.innerHTML = crumbs;
        }

        // Categorize styles for organized display
        var cats: Record<string, string[]> = {
            'Typography': ['font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-decoration','text-transform','color'],
            'Layout': ['display','position','width','height','min-width','min-height','max-width','max-height','margin','padding','top','left','right','bottom','overflow','z-index'],
            'Background': ['background','background-color','background-image','background-size','background-position','background-repeat','opacity'],
            'Border': ['border','border-radius','border-top','border-right','border-bottom','border-left','border-color','border-width','border-style','outline','box-shadow'],
            'Flex/Grid': ['flex','flex-direction','flex-wrap','justify-content','align-items','align-content','gap','grid-template-columns','grid-template-rows'],
            'Other': []
        };
        var assigned: Record<string, boolean> = {};
        var catHtml = '';

        Object.keys(cats).forEach(function (catName: string) {
            var keys = cats[catName];
            var rows: string[] = [];
            keys.forEach(function (k: string) {
                if (styles[k] !== undefined) {
                    assigned[k] = true;
                    rows.push(inspectorRowHtml(k, styles[k]));
                }
            });
            if (rows.length) {
                catHtml += '<div style="margin-bottom:14px">' +
                  '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin:0 0 6px">' + escHtml(catName) + '</div>' +
                  '<div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">' + rows.join('') + '</div>' +
                '</div>';
            }
        });

        // Collect uncategorized
        var otherRows: string[] = [];
        Object.keys(styles).forEach(function (k: string) {
            if (!assigned[k]) otherRows.push(inspectorRowHtml(k, styles[k]));
        });
        if (otherRows.length) {
            catHtml += '<div style="margin-bottom:14px">' +
              '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin:0 0 6px">Other</div>' +
              '<div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">' + otherRows.join('') + '</div>' +
            '</div>';
        }

        if (catEl) catEl.innerHTML = catHtml;
        openInspectorSubtab();
        wireInspectorInputs();
    }

    function inspectorRowHtml(key: string, val: string): string {
        var isThemed = Object.prototype.hasOwnProperty.call({
            'color':'--mf-primary','background-color':'--mf-form-bg','background':'--mf-form-bg',
            'background-image':'--mf-form-bg-image','font-family':'--mf-font-family','font-size':'--mf-font-size',
            'font-weight':'--mf-font-weight','line-height':'--mf-line-height','letter-spacing':'--mf-letter-spacing',
            'border-radius':'--mf-border-radius','box-shadow':'--mf-shadow'
        }, key);
        var badge = isThemed ? '<span style="display:inline-block;background:#ede9fe;color:#6d28d9;border-radius:3px;padding:0 4px;font-size:8px;font-weight:700;text-transform:uppercase;margin-left:4px">var</span>' : '';
        return (
            '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:11px;border-bottom:1px solid #f1f5f9;background:#fff;transition:background .2s" class="mf-theme-inspector-row" data-inspector-key="' + escAttr(key) + '">' +
              '<div style="color:#64748b;font-family:Consolas,Menlo,monospace;flex:0 0 45%;word-break:break-all;display:flex;align-items:center">' + escHtml(key) + badge + '</div>' +
              '<input type="text" data-inspector-input="1" data-inspector-key="' + escAttr(key) + '" value="' + escAttr(String(val || '')) + '" spellcheck="false" autocomplete="off" ' +
                'style="flex:1;min-width:0;border:1px solid #e2e8f0;border-radius:4px;padding:4px 8px;font-family:Consolas,Menlo,monospace;font-size:11px;color:#0f172a;background:#fff;text-align:right;outline:none;transition:border-color .15s,box-shadow .15s" />' +
            '</div>'
        );
    }

    function wireInspectorInputs(): void {
        if (!activeContainer) return;
        var inputs = activeContainer.querySelectorAll<HTMLInputElement>('[data-inspector-input]');
        var debounceTimer: number | null = null;
        inputs.forEach(function (input: HTMLInputElement) {
            input.addEventListener('input', function () {
                if (debounceTimer !== null) window.clearTimeout(debounceTimer);
                debounceTimer = window.setTimeout(function () {
                    commitInspectorEdit(input);
                    debounceTimer = null;
                }, 120);
            });
            input.addEventListener('blur', function () { commitInspectorEdit(input); });
            input.addEventListener('keydown', function (e: KeyboardEvent) {
                if (e.key === 'Enter') { e.preventDefault(); commitInspectorEdit(input); input.blur(); }
            });
        });
    }

    function commitInspectorEdit(input: HTMLInputElement): void {
        var cssKey = input.dataset.inspectorKey || '';
        var cssVal = input.value || '';
        var selector = _inspectorState.selector;
        if (!cssKey || !selector) return;
        // Post to iframe
        try {
            var frame = document.querySelector('.mf-theme-preview-frame') as HTMLIFrameElement | null;
            if (frame && frame.contentWindow) {
                frame.contentWindow.postMessage({
                    type: 'mf-theme-inspect-edit',
                    selector: selector,
                    cssKey: cssKey,
                    cssValue: cssVal,
                    themeVar: null
                }, '*');
            }
        } catch { /* defensive */ }
        // Update theme var if mapped
        var varMap: Record<string, string> = {
            'color':'--mf-primary','background-color':'--mf-form-bg','background':'--mf-form-bg',
            'background-image':'--mf-form-bg-image','font-family':'--mf-font-family','font-size':'--mf-font-size',
            'font-weight':'--mf-font-weight','line-height':'--mf-line-height','letter-spacing':'--mf-letter-spacing',
            'border-radius':'--mf-border-radius','box-shadow':'--mf-shadow'
        };
        var themeVar = varMap[cssKey];
        if (themeVar) {
            try {
                document.documentElement.style.setProperty(themeVar, cssVal);
                var ta: any = (window as any).MFThemeTabAdapter;
                if (ta && typeof ta.setVar === 'function') {
                    try { ta.setVar(themeVar, cssVal); } catch { /* noop */ }
                }
            } catch { /* defensive */ }
        }
        // Visual flash
        var row = input.closest<HTMLElement>('.mf-theme-inspector-row');
        if (row) {
            row.style.background = '#fef3c7';
            window.setTimeout(function () { row.style.background = ''; }, 350);
        }
    }

    function escHtml(s: string): string {
        return String(s).replace(/[&<>"']/g, function (c: string) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string);
        });
    }
    function escAttr(s: string): string {
        return escHtml(s);
    }

    function buildShellHtml(): string {
        return (
            '<div class="mf-theme-shell" data-mf-theme-tab="ThemeTabAdapter v20260604-B73" ' +
                 'style="display:flex;flex-direction:column;height:100%;font-family:Inter,system-ui,sans-serif">' +
              // [B65] Removed duplicate device toggle (already in top builder bar).
              // Reset/Apply kept — theme-specific actions distinct from top-bar undo.
              '<div class="mf-theme-toolbar" style="padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
                '<i class="fas fa-palette" style="color:#6366f1"></i>' +
                '<strong style="font-size:13px;color:#0f172a">Theme Designer</strong>' +
                '<span style="flex:1"></span>' +
                '<button type="button" class="mf-builder-btn" data-mf-theme-action="reset" ' +
                  'style="font-size:11px;padding:4px 10px"><i class="fas fa-undo"></i> Reset</button>' +
                '<button type="button" class="mf-builder-btn" data-mf-theme-action="apply" ' +
                  'style="font-size:11px;padding:4px 12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none">' +
                  '<i class="fas fa-check"></i> Apply' +
                '</button>' +
              '</div>' +
              '<div class="mf-theme-tabs" style="display:flex;border-bottom:1px solid #e2e8f0;background:#fff">' +
                // [ThemeTabTrim v20260624] Inputs + Buttons sub-tabs removed per spec — most of
                // their vars are stripped on themed forms / hard-coded, so they were non-functional.
                // Only Global + Layout (styling that actually applies) + Inspector are kept.
                '<button type="button" class="mf-theme-subtab active" data-mf-theme-subtab="global"   style="flex:1;padding:8px;border:none;background:transparent;font-size:11px;font-weight:600;color:#0f172a;border-bottom:2px solid #6366f1;cursor:pointer"><i class="fas fa-globe"></i> Global</button>' +
                '<button type="button" class="mf-theme-subtab" data-mf-theme-subtab="layout"           style="flex:1;padding:8px;border:none;background:transparent;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid transparent;cursor:pointer"><i class="fas fa-table-columns"></i> Layout</button>' +
                '<button type="button" class="mf-theme-subtab" data-mf-theme-subtab="inspector"        style="flex:1;padding:8px;border:none;background:transparent;font-size:11px;font-weight:600;color:#64748b;border-bottom:2px solid transparent;cursor:pointer"><i class="fas fa-crosshairs"></i> Inspector</button>' +
              '</div>' +
              '<div class="mf-theme-body" style="flex:1;overflow-y:auto;padding:14px 16px;background:#fff">' +
                '<div class="mf-theme-subpanel" data-mf-theme-panel="global"    style="">'          + panelGlobalHtml()    + '</div>' +
                '<div class="mf-theme-subpanel" data-mf-theme-panel="layout"    style="display:none">' + panelLayoutHtml()    + '</div>' +
                '<div class="mf-theme-subpanel" data-mf-theme-panel="inspector" style="display:none">' + panelInspectorHtml() + '</div>' +
              '</div>' +
            '</div>'
        );
    }

    // ── Change handler (delegated) ────────────────────────────────────
    function writeLiveVar(name: string, value: string): void {
        if (value == null || value === '') {
            delete live[name];
        } else {
            live[name] = String(value);
        }
    }

    function setVar(name: string, value: string): void {
        writeLiveVar(name, value);
        persistToSchema();
        flushPreview();
    }

    function setVars(vars: Record<string, string>): void {
        Object.keys(vars || {}).forEach(function (name) {
            writeLiveVar(name, vars[name]);
        });
        persistToSchema();
        flushPreview();
    }

    function onClickDelegated(e: Event): void {
        var t = e.target as HTMLElement;
        if (!t || !activeContainer || !activeContainer.contains(t)) return;

        // Preset click
        // [B56 FIX 4] Preset switching changes theme class + base palette
        // + (sometimes) preset-bundled customCss. Just posting CSS is not
        // enough — the runtime renderer captures cssOverrides + theme from
        // settings at boot, so we need a srcdoc rebuild to pick up the
        // new preset cleanly. The lightweight class-postMessage handles
        // 90% of the case (megaform-themes.css rules), and the canvas
        // re-render via dispatched event handles the remaining 10%.
        var presetBtn = t.closest('[data-preset]') as HTMLElement | null;
        if (presetBtn) {
            e.preventDefault();
            var id = presetBtn.getAttribute('data-preset') || 'default';
            currentTheme = id;
            // [B59 preset-active-class] Visually mark the clicked tile right
            // away by toggling .mf-theme-preset.active — this gives instant
            // feedback BEFORE the grid re-renders below, and is also the
            // contract the user-facing spec calls out.
            try {
                var allTiles = activeContainer.querySelectorAll('.mf-theme-preset');
                for (var ai = 0; ai < allTiles.length; ai++) {
                    (allTiles[ai] as HTMLElement).classList.remove('active');
                }
                presetBtn.classList.add('active');
            } catch (_e) { /* defensive */ }
            // [B59] Delegate the heavy lift (live var write + persist +
            // flushPreview + canvas re-render) to the canonical
            // MFThemeTabAdapter.setPreset() API so any external caller hitting
            // window.MFThemeTabAdapter.setPreset(id) follows the SAME path.
            try {
                var apiHandle = (window as any).MFThemeTabAdapter;
                if (apiHandle && typeof apiHandle.setPreset === 'function') {
                    apiHandle.setPreset(id);
                }
            } catch (_e) { /* fall through to inline path below */ }
            // Find preset and seed primary color into live overrides so the
            // canvas updates even before megaform-themes.css loads.
            var p = PRESETS.filter(function (x) { return x.id === id; })[0];
            if (p) {
                live['--mf-primary'] = p.primary;
                // [B56 FIX 4] Also cascade into the controls that follow
                // primary so the iframe sees the full palette swap.
                live['--mf-input-focus-border'] = p.primary;
                live['--mf-check-color']        = p.primary;
                live['--mf-progress-fill']      = p.primary;
            }
            persistToSchema();
            flushPreview();
            // Repaint preset cards to show new active state
            var grid = activeContainer.querySelector('#mf-theme-tab-presets') as HTMLElement | null;
            if (grid) grid.innerHTML = buildPresetGrid();
            // B49: refresh HEX input + tint strip to match new preset primary
            if (p) refreshPrimaryAuxControls(p.primary);

            // [B56 FIX 4] Fire dedicated preset-changed event so canvas.ts
            // listeners can rebuild srcdoc (covers preset-bundled customCss
            // + theme class wiring that lives in the runtime renderer).
            try {
                window.dispatchEvent(new CustomEvent('mf:theme-preset-changed', {
                    detail: { themeId: id, primary: p ? p.primary : '' }
                }));
            } catch (_e) { /* defensive */ }

            // [B56 FIX 4] Belt-and-braces canvas re-render so the iframe
            // srcdoc is rebuilt with the new settings.theme. This is the
            // ONLY way preset-bundled CSS lights up reliably on first click.
            try {
                if (B.callModule) B.callModule('canvas', 'render');
            } catch (_e) { /* defensive */ }
            return;
        }

        // Subtab click
        var sub = t.closest('[data-mf-theme-subtab]') as HTMLElement | null;
        if (sub) {
            e.preventDefault();
            var which = sub.getAttribute('data-mf-theme-subtab') || 'colors';
            activeContainer.querySelectorAll<HTMLElement>('[data-mf-theme-subtab]').forEach(function (b) {
                var isActive = (b.getAttribute('data-mf-theme-subtab') === which);
                b.classList.toggle('active', isActive);
                b.style.color = isActive ? '#0f172a' : '#64748b';
                b.style.borderBottomColor = isActive ? '#6366f1' : 'transparent';
            });
            activeContainer.querySelectorAll<HTMLElement>('[data-mf-theme-panel]').forEach(function (p2) {
                p2.style.display = (p2.getAttribute('data-mf-theme-panel') === which) ? '' : 'none';
            });
            return;
        }

        // [B73] Font chip click
        var fontChip = t.closest('[data-mf-theme-font-chip]') as HTMLElement | null;
        if (fontChip) {
            e.preventDefault();
            var family = fontChip.getAttribute('data-mf-theme-font-chip') || 'Inter';
            setVar('--mf-font-family', "'" + family + "',system-ui,sans-serif");
            // Update chip visuals
            activeContainer.querySelectorAll<HTMLElement>('[data-mf-theme-font-chip]').forEach(function (chip) {
                var isSel = chip.getAttribute('data-mf-theme-font-chip') === family;
                chip.style.borderColor = isSel ? '#6366f1' : '#e2e8f0';
                chip.style.background = isSel ? '#eef2ff' : '#fff';
                chip.style.color = isSel ? '#4338ca' : '#334155';
                chip.classList.toggle('active', isSel);
            });
            // Update preview
            var prev = activeContainer.querySelector('#mf-theme-font-preview') as HTMLElement | null;
            if (prev) prev.style.fontFamily = "'" + family + "',system-ui,sans-serif";
            return;
        }

        // [B73 + B79] Border-radius shape card click. CASCADES to all three
        // radius scopes (form / input / button) AND writes the persistent
        // .mf-style-radius-{X} class to the form-wrapper so the choice
        // survives save + reload (runtime CSS in megaform.css matches the
        // class to a border-radius value).
        var shapeCard = t.closest('[data-mf-theme-shape]') as HTMLElement | null;
        if (shapeCard) {
            e.preventDefault();
            var shape = shapeCard.getAttribute('data-mf-theme-shape') || '';
            // Map mock shape ids → form / input / button radius triples.
            // Pill = 16px form card (soft round), 999px inputs/buttons.
            var radiusMap: Record<string, { form: string; input: string; btn: string; classSuffix: string }> = {
                'rounded': { form: '8px',  input: '6px',   btn: '6px',   classSuffix: 'rounded' },
                'pill':    { form: '16px', input: '999px', btn: '999px', classSuffix: 'pill'    },
                'sharp':   { form: '0px',  input: '0px',   btn: '0px',   classSuffix: 'square'  },
                'soft':    { form: '16px', input: '10px',  btn: '12px',  classSuffix: 'rounded' },
            };
            var entry = radiusMap[shape];
            if (entry) {
                setVars({
                    '--mf-form-radius': entry.form,
                    '--mf-input-radius': entry.input,
                    '--mf-btn-radius': entry.btn
                });
                // [B79] Also mirror onto the persistent style class on the
                // wrapper so the runtime view (which doesn't reload the
                // iframe srcdoc) honours the choice via the new megaform.css
                // .mf-style-radius-* rules.
                try {
                    var wrappers: HTMLElement[] = [];
                    var dz = document.getElementById('mf-canvas-dropzone');
                    if (dz) dz.querySelectorAll<HTMLElement>('.mf-form-wrapper').forEach(function (w) { wrappers.push(w); });
                    var iframe = document.querySelector('.mf-theme-preview-frame') as HTMLIFrameElement | null;
                    if (iframe && iframe.contentDocument) {
                        iframe.contentDocument.querySelectorAll<HTMLElement>('.mf-form-wrapper').forEach(function (w) { wrappers.push(w); });
                    }
                    wrappers.forEach(function (w) {
                        w.classList.remove('mf-style-radius-square', 'mf-style-radius-rounded', 'mf-style-radius-pill');
                        w.classList.add('mf-style-radius-' + entry.classSuffix);
                    });
                    // [B79] Persist into schema.settings.displayStyle so Save
                    // → reload roundtrips. Walk current settings, mutate, no
                    // reassign in case other listeners hold the same ref.
                    var sch = (B && B.state && B.state.schema) ? (B.state.schema as any) : null;
                    if (sch) {
                        var stt = sch.settings || sch.Settings || (sch.settings = {});
                        var ds  = stt.displayStyle || stt.DisplayStyle || (stt.displayStyle = {});
                        ds.radius      = entry.classSuffix;
                        ds.inputRadius = entry.classSuffix;
                    }
                } catch (_e) { /* defensive */ }
                // Update visuals on the shape-card row
                activeContainer.querySelectorAll<HTMLElement>('[data-mf-theme-shape]').forEach(function (c) {
                    c.classList.toggle('active',    c.getAttribute('data-mf-theme-shape') === shape);
                    c.classList.toggle('is-active', c.getAttribute('data-mf-theme-shape') === shape);
                });
                // Sync the matching slider so the numeric badge tracks
                var sld = activeContainer.querySelector('[data-mf-theme-slider="--mf-form-radius"]') as HTMLInputElement | null;
                if (sld) sld.value = String(parseInt(entry.form, 10) || 0);
                var sldRow = activeContainer.querySelector('[data-mf-theme-var="--mf-form-radius"] .td-sld-val') as HTMLElement | null;
                if (sldRow) sldRow.textContent = entry.form;
            }
            return;
        }

        var shadowCard = t.closest('[data-mf-theme-shadow-preset]') as HTMLElement | null;
        if (shadowCard) {
            e.preventDefault();
            var preset = shadowCard.getAttribute('data-mf-theme-shadow-preset') || 'md';
            var shadowVal = shadowCard.getAttribute('data-mf-theme-shadow-val') || '0 4px 8px rgba(0,0,0,0.10)';
            var shadowClassMap: Record<string, string> = {
                none: 'none',
                xs: 'soft',
                sm: 'soft',
                md: 'medium',
                lg: 'medium',
                xl: 'large'
            };
            setVars({
                '--mf-form-shadow': shadowVal,
                '--mf-btn-shadow': shadowVal
            });
            try {
                var schS = (B && B.state && B.state.schema) ? (B.state.schema as any) : null;
                if (schS) {
                    var stS = schS.settings || schS.Settings || (schS.settings = {});
                    var dsS = stS.displayStyle || stS.DisplayStyle || (stS.displayStyle = {});
                    dsS.shadow = shadowClassMap[preset] || 'medium';
                }
            } catch (_eDs) { /* defensive */ }
            activeContainer.querySelectorAll<HTMLElement>('[data-mf-theme-shadow-preset]').forEach(function (c) {
                var isActive = c.getAttribute('data-mf-theme-shadow-preset') === preset;
                c.classList.toggle('active', isActive);
                c.classList.toggle('is-active', isActive);
            });
            var nums = /(-?\d+)px\s+(-?\d+)px\s+(-?\d+)px(?:\s+(-?\d+)px)?/i.exec(shadowVal);
            if (nums) {
                var axes: Record<string, string> = { x: nums[1], y: nums[2], blur: nums[3], spread: nums[4] || '0' };
                Object.keys(axes).forEach(function (axis) {
                    var input = activeContainer!.querySelector('[data-mf-theme-shadow-axis="' + axis + '"]') as HTMLInputElement | null;
                    if (input) input.value = axes[axis];
                });
            }
            return;
        }

        // B70: Advanced (CSS/HTML) toggle inside Global tab
        var advToggle = t.closest('[data-mf-theme-advanced-toggle]') as HTMLElement | null;
        if (advToggle) {
            e.preventDefault();
            var wrap = advToggle.closest('.mf-theme-advanced-wrap') as HTMLElement | null;
            if (wrap) {
                var body = wrap.querySelector('.mf-theme-advanced-body') as HTMLElement | null;
                var icon = advToggle.querySelector('.fa-chevron-down, .fa-chevron-up') as HTMLElement | null;
                if (body) {
                    var isOpen = body.style.display !== 'none';
                    body.style.display = isOpen ? 'none' : '';
                    if (icon) icon.className = isOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
                }
            }
            return;
        }

        // B49: Device toggle click (desktop/tablet/mobile in toolbar)
        var devBtn = t.closest('[data-mf-theme-device]') as HTMLElement | null;
        if (devBtn) {
            e.preventDefault();
            var dev = (devBtn.getAttribute('data-mf-theme-device') || 'desktop') as DeviceKind;
            if (dev === 'tablet' || dev === 'mobile' || dev === 'desktop') {
                currentDevice = dev;
                applyDevicePreview();
                repaintDeviceGroup();
            }
            return;
        }

        // B49: Tint chip click — copy hex to clipboard so user can paste
        //      into any color row. Falls back to setting --mf-primary if
        //      clipboard API blocked.
        var tintBtn = t.closest('[data-mf-theme-tint]') as HTMLElement | null;
        if (tintBtn) {
            e.preventDefault();
            var tHex = tintBtn.getAttribute('data-mf-theme-tint') || '';
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(tHex);
                    notifyToast('Copied ' + tHex + ' to clipboard');
                } else {
                    // Fallback: write directly to --mf-primary
                    setVar('--mf-primary', tHex);
                    notifyToast('Set primary to ' + tHex);
                }
            } catch (_e) {
                setVar('--mf-primary', tHex);
            }
            return;
        }

        // Action buttons
        var action = t.closest('[data-mf-theme-action]') as HTMLElement | null;
        if (action) {
            e.preventDefault();
            var a = action.getAttribute('data-mf-theme-action');
            if (a === 'reset') resetAll();
            else if (a === 'apply') applyAndSave();
            return;
        }

        // B49b: Field-key chip in HTML sub-tab — insert {{field:key}} into
        // the HTML template textarea at the current cursor position.
        var chip = t.closest('[data-mf-theme-insert-token]') as HTMLElement | null;
        if (chip) {
            e.preventDefault();
            var token = chip.getAttribute('data-mf-theme-insert-token') || '';
            if (!token || !activeContainer) return;
            var ta = activeContainer.querySelector('#mf-theme-html-template') as HTMLTextAreaElement | null;
            if (!ta) return;
            var start = ta.selectionStart || 0;
            var end   = ta.selectionEnd   || 0;
            var before = ta.value.substring(0, start);
            var after  = ta.value.substring(end);
            ta.value = before + token + after;
            ta.focus();
            var caret = start + token.length;
            try { ta.setSelectionRange(caret, caret); } catch (_e) { /* old browsers */ }
            // Push the change through the normal pipeline so live + mirror sync.
            currentCustomHtml = ta.value;
            if (currentCustomHtml.trim()) currentUseCustomHtml = true;
            persistToSchema();
            var mirrorTa = activeContainer.querySelector('[data-mf-theme-customhtml]') as HTMLTextAreaElement | null;
            if (mirrorTa && mirrorTa.value !== currentCustomHtml) mirrorTa.value = currentCustomHtml;
            var togHtml = activeContainer.querySelector('[data-mf-theme-usecustomhtml]') as HTMLInputElement | null;
            if (togHtml) togHtml.checked = currentUseCustomHtml;
            var togWrap = activeContainer.querySelector('[data-mf-theme-usehtml]') as HTMLInputElement | null;
            if (togWrap) togWrap.checked = currentUseCustomHtml;
            return;
        }
    }

    function onInputDelegated(e: Event): void {
        var t = e.target as HTMLElement;
        if (!t || !activeContainer || !activeContainer.contains(t)) return;

        // Color picker
        var colorVar = t.getAttribute('data-mf-theme-color');
        if (colorVar) {
            var hex = (t as HTMLInputElement).value;
            setVar(colorVar, hex);
            var row = t.closest('[data-mf-theme-var]');
            if (row) {
                var label = row.querySelector('.mf-theme-color-val') as HTMLElement | null;
                if (label) label.textContent = hex;
            }
            // Primary cascade — keep parity with Theme Designer setCssVar behavior.
            if (colorVar === '--mf-primary') {
                live['--mf-input-focus-border'] = hex;
                live['--mf-check-color']        = hex;
                live['--mf-progress-fill']      = hex;
                persistToSchema();
                flushPreview();
                // B49: refresh tint strip + sync HEX input
                refreshPrimaryAuxControls(hex);
            }
            return;
        }

        // B49: HEX text input (paired with Primary picker)
        var hexVar = t.getAttribute('data-mf-theme-hex');
        if (hexVar) {
            var raw = String((t as HTMLInputElement).value || '').trim();
            // Auto-prepend # if user typed bare 6-char code
            if (raw && raw.charAt(0) !== '#') raw = '#' + raw;
            // Only commit when it parses as a valid hex
            if (/^#[0-9a-f]{6}$/i.test(raw)) {
                setVar(hexVar, raw);
                if (hexVar === '--mf-primary') {
                    live['--mf-input-focus-border'] = raw;
                    live['--mf-check-color']        = raw;
                    live['--mf-progress-fill']      = raw;
                    persistToSchema();
                    flushPreview();
                    refreshPrimaryAuxControls(raw);
                }
            }
            return;
        }

        // Slider
        var sliderVar = t.getAttribute('data-mf-theme-slider');
        if (sliderVar) {
            var unit = t.getAttribute('data-mf-theme-unit') || 'px';
            var num = (t as HTMLInputElement).value;
            setVar(sliderVar, num + unit);
            var sRow = t.closest('[data-mf-theme-var]');
            if (sRow) {
                var v = sRow.querySelector('.td-sld-val') as HTMLElement | null;
                if (v) v.textContent = num + unit;
            }
            // Compose form-padding from -y + -x and btn-padding from -y.
            composeCompositeVars();
            return;
        }

        // Toggle
        var toggleVar = t.getAttribute('data-mf-theme-toggle');
        if (toggleVar) {
            var onVal  = t.getAttribute('data-mf-theme-on')  || '';
            var offVal = t.getAttribute('data-mf-theme-off') || 'none';
            setVar(toggleVar, (t as HTMLInputElement).checked ? onVal : offVal);
            return;
        }

        // [B269] Page-integration source switch (Typography / Color). Persists a plain boolean,
        // not a CSS var — the server turns it into the wrapper class / scoped borrow vars at render.
        var inheritKind = t.getAttribute('data-mf-theme-inherit');
        if (inheritKind) {
            var inheritOn = ((t as HTMLSelectElement).value === 'page');
            if (inheritKind === 'type') currentInheritType = inheritOn;
            else if (inheritKind === 'colors') currentInheritColors = inheritOn;
            persistToSchema();
            flushPreview();
            return;
        }

        // Select dropdown
        var selectVar = t.getAttribute('data-mf-theme-select');
        if (selectVar) {
            var selectValue = (t as HTMLInputElement).value;
            if (selectVar === '--mf-font-family' || selectVar === '--mf-heading-font') {
                selectValue = fontStackForFamily(selectValue);
            }
            setVar(selectVar, selectValue);
            if (selectVar === '--mf-font-family' && activeContainer) {
                var prevBox = activeContainer.querySelector('#mf-theme-font-preview') as HTMLElement | null;
                if (prevBox) prevBox.style.fontFamily = selectValue;
            }
            return;
        }

        // Font select
        if (t.getAttribute('data-mf-theme-font')) {
            var family = (t as HTMLInputElement).value;
            setVar('--mf-font-family', "'" + family + "',system-ui,sans-serif");
            // B49: refresh font preview box to show new typeface live
            if (activeContainer) {
                var prev = activeContainer.querySelector('#mf-theme-font-preview') as HTMLElement | null;
                if (prev) prev.style.fontFamily = "'" + family + "',system-ui,sans-serif";
            }
            return;
        }

        // Custom CSS textarea — port of standalone Theme Designer customCss pipeline.
        if (t.getAttribute('data-mf-theme-customcss')) {
            currentCustomCss = (t as HTMLTextAreaElement).value || '';
            persistToSchema();
            flushPreview();
            return;
        }

        // Custom HTML wrapper textarea — saved alongside customCss for runtime
        // form rendering (e.g. <div class="my-wrapper">{{form}}</div>).
        if (t.getAttribute('data-mf-theme-customhtml')) {
            currentCustomHtml = (t as HTMLTextAreaElement).value || '';
            if (currentCustomHtml.trim()) currentUseCustomHtml = true;
            persistToSchema();
            if (activeContainer) {
                var togEl = activeContainer.querySelector('[data-mf-theme-usehtml]') as HTMLInputElement | null;
                if (togEl && togEl.checked !== currentUseCustomHtml) togEl.checked = currentUseCustomHtml;
            }
            return;
        }

        // Custom HTML wrapper enable toggle (data-mf-theme-usehtml).
        if (t.getAttribute('data-mf-theme-usehtml')) {
            currentUseCustomHtml = !!(t as HTMLInputElement).checked;
            persistToSchema();
            // Mirror to the new HTML-tab toggle so both stay in sync.
            if (activeContainer) {
                var mirrorTog = activeContainer.querySelector('[data-mf-theme-usecustomhtml]') as HTMLInputElement | null;
                if (mirrorTog && mirrorTog !== t) mirrorTog.checked = currentUseCustomHtml;
            }
            return;
        }

        // B49b: HTML-tab "Use Custom HTML Template" toggle. Same backing
        // state (currentUseCustomHtml) as the wrapper toggle in CSS sub-tab.
        if (t.getAttribute('data-mf-theme-usecustomhtml')) {
            currentUseCustomHtml = !!(t as HTMLInputElement).checked;
            persistToSchema();
            // Mirror to the legacy CSS-tab wrapper toggle so both stay in sync.
            if (activeContainer) {
                var mirrorWrap = activeContainer.querySelector('[data-mf-theme-usehtml]') as HTMLInputElement | null;
                if (mirrorWrap && mirrorWrap !== t) mirrorWrap.checked = currentUseCustomHtml;
            }
            return;
        }

        // B49b: HTML-tab "Full Custom HTML Template" textarea. Shares the
        // same currentCustomHtml state as the legacy textarea so a single
        // value is persisted. Mirror keystrokes so both textareas show the
        // same content if the user flips sub-tabs mid-edit.
        if (t.getAttribute('data-mf-theme-htmltemplate')) {
            currentCustomHtml = (t as HTMLTextAreaElement).value || '';
            persistToSchema();
            if (activeContainer) {
                var mirrorTa = activeContainer.querySelector('[data-mf-theme-customhtml]') as HTMLTextAreaElement | null;
                if (mirrorTa && mirrorTa !== t && mirrorTa.value !== currentCustomHtml) {
                    mirrorTa.value = currentCustomHtml;
                }
            }
            return;
        }
    }

    function composeCompositeVars(): void {
        var py = live['--mf-form-padding-y'];
        var px = live['--mf-form-padding-x'];
        if (py || px) {
            live['--mf-form-padding'] = (py || '32px') + ' ' + (px || '40px');
        }
        var bpy = live['--mf-btn-padding-y'];
        if (bpy) {
            live['--mf-btn-padding'] = bpy + ' 32px';
        }
        persistToSchema();
        flushPreview();
    }

    /**
     * B49: Keep the HEX text input + tint strip in sync whenever
     *      --mf-primary changes from EITHER the color picker, the HEX
     *      input itself, a tint chip click, or a preset card.
     */
    function refreshPrimaryAuxControls(hex: string): void {
        if (!activeContainer) return;
        // Sync the HEX text input
        var hexInput = activeContainer.querySelector('[data-mf-theme-hex="--mf-primary"]') as HTMLInputElement | null;
        if (hexInput && hexInput.value.toLowerCase() !== hex.toLowerCase()) {
            hexInput.value = hex.toUpperCase();
        }
        // Sync the picker (in case change came via HEX input or chip)
        var picker = activeContainer.querySelector('[data-mf-theme-color="--mf-primary"]') as HTMLInputElement | null;
        if (picker && picker.value.toLowerCase() !== hex.toLowerCase()) {
            picker.value = hex;
        }
        // Rebuild tint strip with new base
        var tintHost = activeContainer.querySelector('#mf-theme-tints-host') as HTMLElement | null;
        if (tintHost) tintHost.innerHTML = buildTintStripHtml(hex);
    }

    /**
     * [P1-3] Re-sync EVERY visible right-rail control from the current live{}
     * map. Applying a preset only mutated live{}; the color pickers / HEX inputs
     * / value spans / selects were rendered once at panel-build time, so without
     * this they keep showing stale defaults (e.g. blue) after a preset click.
     * Assigning .value programmatically does NOT fire input/change, so this never
     * re-enters the delegated listeners (no feedback loop).
     */
    function refreshAllColorControls(): void {
        if (!activeContainer) return;
        try {
            var isHex = function (v: string) { return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v); };
            // Color pickers + their adjacent hex value span (.mf-theme-color-val)
            var pickers = activeContainer.querySelectorAll('input[data-mf-theme-color]');
            Array.prototype.forEach.call(pickers, function (el: HTMLInputElement) {
                var name = el.getAttribute('data-mf-theme-color') || '';
                var val = live[name];
                if (val == null || val === '') return;
                if (isHex(val)) el.value = val;
                var row = el.closest ? el.closest('.td-clr-row') : null;
                var span = row ? row.querySelector('.mf-theme-color-val') : null;
                if (span) span.textContent = val;
            });
            // HEX text inputs (Primary etc.)
            var hexes = activeContainer.querySelectorAll('input[data-mf-theme-hex]');
            Array.prototype.forEach.call(hexes, function (el: HTMLInputElement) {
                var name = el.getAttribute('data-mf-theme-hex') || '';
                var val = live[name];
                if (val != null && val !== '') el.value = String(val).toUpperCase();
            });
            // Selects (Max width, Columns, fonts)
            var selects = activeContainer.querySelectorAll('select[data-mf-theme-select]');
            Array.prototype.forEach.call(selects, function (el: HTMLSelectElement) {
                var name = el.getAttribute('data-mf-theme-select') || '';
                var val = live[name];
                if (val != null && val !== '') {
                    if (name === '--mf-font-family' || name === '--mf-heading-font') {
                        var matched = FONT_OPTIONS.filter(function (f) { return String(val).indexOf(f) >= 0; })[0];
                        el.value = matched || String(val);
                    } else {
                        el.value = String(val);
                    }
                }
            });
            // Primary HEX/picker/tint strip
            if (live['--mf-primary']) refreshPrimaryAuxControls(live['--mf-primary']);
        } catch (_e) { /* defensive */ }
    }

    function bindListeners(): void {
        if (changeListenersBound) return;
        document.addEventListener('click', onClickDelegated, true);
        document.addEventListener('input', onInputDelegated, true);
        document.addEventListener('change', onInputDelegated, true);
        changeListenersBound = true;
    }

    function unbindListeners(): void {
        if (!changeListenersBound) return;
        document.removeEventListener('click', onClickDelegated, true);
        document.removeEventListener('input', onInputDelegated, true);
        document.removeEventListener('change', onInputDelegated, true);
        changeListenersBound = false;
    }

    // ── Actions ───────────────────────────────────────────────────────
    // [B56 FIX 5+6] Both Reset and Apply force a canvas re-render so the
    // iframe srcdoc gets rebuilt from the freshly-persisted schema. Order
    // matters: persist → flush (canvas + iframe-postMessage) → re-render
    // (rebuilds iframe srcdoc with persisted state). Reset additionally
    // rebuilds the right-rail shell so the controls themselves reset.
    function resetAll(): void {
        live = {};
        currentTheme = 'default';
        currentCustomCss = '';
        currentCustomHtml = '';
        currentUseCustomHtml = false;
        persistToSchema();
        // Invalidate cache so flushPreview actually rewrites the empty
        // canvas <style> tag (lastInjectedCss equality short-circuit).
        lastInjectedCss = '__force_reset__';
        flushPreview();
        if (activeContainer) {
            activeContainer.innerHTML = buildShellHtml();
        }
        // [B56 FIX 6] Notify any preset listener that the theme is back
        // to default so canvas.ts can drop class + reload iframe.
        try {
            window.dispatchEvent(new CustomEvent('mf:theme-preset-changed', {
                detail: { themeId: 'default', primary: '' }
            }));
        } catch (_e) { /* defensive */ }
        try {
            if (B.callModule) B.callModule('canvas', 'render');
        } catch (_e) { /* defensive */ }
        notifyToast('Theme reset to default');
    }

    function applyAndSave(): void {
        persistToSchema();
        // [B56 FIX 5] Force the iframe to pick up the now-persisted state
        // — bypass the cache short-circuit so the post-message fires.
        lastInjectedCss = '__force_apply__';
        flushPreview();
        try {
            if (B.callModule) B.callModule('canvas', 'render');
        } catch (_e) { /* defensive */ }
        notifyToast('Theme applied — Save the form to persist');
    }

    function notifyToast(msg: string): void {
        try {
            if (B.showToast) B.showToast(msg, 'success');
        } catch (_e) { /* defensive */ }
    }

    // ── Public API ────────────────────────────────────────────────────
    function activateThemeTab(container?: HTMLElement | null): void {
        var host = container || (document.getElementById('mf-tab-theme') as HTMLElement | null);
        if (!host) {
            console.warn('[ThemeTabAdapter] host #mf-tab-theme missing');
            return;
        }
        activeContainer = host;
        loadFromSchema();
        host.innerHTML = buildShellHtml();
        bindListeners();
        flushPreview();
        // B49: apply current device preview width (defaults to desktop)
        applyDevicePreview();
        // Bridge to canvas theme-mode (hides drag handles, etc.)
        try {
            window.dispatchEvent(new CustomEvent('mf:theme-tab-activated'));
        } catch (_e) { /* IE11-free */ }

        // [B73] Listen for CSS picker results from left-rail Colors tab
        try {
            window.addEventListener('mf:theme-inspect-element', function (ev: Event) {
                var d = (ev as CustomEvent).detail;
                if (d && d.selector) {
                    populateInspectorPanel(d.selector, d.breadcrumb || [], d.styles || {});
                }
            });
        } catch (_e) { /* defensive */ }
    }

    function deactivateThemeTab(): void {
        // Persist any pending edits one last time so unsaved changes go into
        // state.schema before the caller flips to another tab.
        persistToSchema();
        // Live preview stays on so the canvas reflects what the user just set.
        unbindListeners();
        // B49: reset device preview so canvas returns to full width when
        //      user leaves theme mode. Don't reset currentDevice itself —
        //      user may come back to the same device they were on.
        try {
            var dz = document.getElementById('mf-canvas-dropzone');
            if (dz) {
                dz.removeAttribute('data-mf-theme-device');
                var wrap = dz.querySelector('.mf-form-wrapper') as HTMLElement | null;
                if (wrap) { wrap.style.maxWidth = ''; }
                var form = dz.querySelector('.mf-form') as HTMLElement | null;
                if (form) { form.style.maxWidth = ''; }
                // [P1-1/P1-2] Clear the device-frame zoom/width sizing on exit.
                var frame = dz.querySelector('#mf-builder-preview-frame, .mf-theme-preview-frame') as HTMLElement | null;
                if (frame) {
                    frame.style.width = '';
                    frame.style.maxWidth = '';
                    (frame.style as any).zoom = '';
                    frame.style.height = '';
                    frame.style.minHeight = '';
                    frame.style.marginLeft = '';
                    frame.style.marginRight = '';
                }
            }
        } catch (_e) { /* defensive */ }
        activeContainer = null;

        // ── [B50 Author C — clean exit] ──
        // Synchronously dispose the runtime preview iframe + placeholder
        // BEFORE firing the deactivate event. This ordering guards against
        // the activate→deactivate race: if the user clicks THEME and
        // immediately clicks SETTINGS, the canvas's enterThemeMode handler
        // may still be in-flight. By tearing down here first we ensure
        // that even if canvas's deactivated-listener races behind us, the
        // iframe is already gone and the second tear-down is a cheap no-op.
        try {
            var canvasApi = (window as any).MFCanvasThemePreview;
            if (canvasApi && typeof canvasApi.unmount === 'function') {
                canvasApi.unmount();
            }
        } catch (_e) { /* defensive */ }

        try {
            window.dispatchEvent(new CustomEvent('mf:theme-tab-deactivated'));
        } catch (_e) { /* defensive */ }
        // Trigger canvas re-render so user sees applied theme in builder.
        try {
            if (B.callModule) B.callModule('canvas', 'render');
        } catch (_e) { /* defensive */ }
    }

    function clearPreview(): void {
        var tag = document.getElementById(THEME_STYLE_TAG_ID);
        if (tag && tag.parentNode) tag.parentNode.removeChild(tag);
        lastInjectedCss = '';
    }

    // ── Register singleton + Module Registry ─────────────────────────
    // [B56 FIX] Expose setVar / setCustomCss / setCustomHtml so the left-
    // rail utility tools (font picker, color picker, image upload, raw
    // CSS / HTML textareas, DOM inspector) can drive the right-rail
    // theme state without DOM hacks. Also expose flushPreview so a caller
    // can force the iframe to re-pick-up state after batch edits.
    var api = {
        activate:   activateThemeTab,
        deactivate: deactivateThemeTab,
        reset:      resetAll,
        apply:      applyAndSave,
        clear:      clearPreview,
        // Inspection helpers for QA + tests
        // B49: expose device + tints helper in state for QA + tests
        getState:   function () { return { theme: currentTheme, cssOverrides: Object.assign({}, live), customCss: currentCustomCss, customHtml: currentCustomHtml, useCustomHtml: currentUseCustomHtml, device: currentDevice }; },
        setDevice:  function (d: DeviceKind) { if (d === 'desktop' || d === 'tablet' || d === 'mobile') { currentDevice = d; applyDevicePreview(); repaintDeviceGroup(); } },
        buildTints: function (hex: string) { return buildTintScale(hex); },
        // [B56] Programmatic write-throughs for external rails / tools.
        setVar:        function (name: string, value: string) { setVar(name, value); },
        setCustomCss:  function (css: string) {
            currentCustomCss = String(css || '');
            persistToSchema();
            flushPreview();
        },
        setCustomHtml: function (html: string, useHtml?: boolean) {
            currentCustomHtml = String(html || '');
            if (typeof useHtml === 'boolean') currentUseCustomHtml = useHtml;
            else if (currentCustomHtml.trim()) currentUseCustomHtml = true;
            persistToSchema();
            flushPreview();
        },
        setPreset:     function (themeId: string) {
            currentTheme = String(themeId || 'default');
            var p = PRESETS.filter(function (x) { return x.id === currentTheme; })[0];
            if (p) {
                live['--mf-primary']            = p.primary;
                live['--mf-btn-bg']             = p.primary;
                live['--mf-btn-bg-hover']       = p.primary;
                live['--mf-input-focus-border'] = p.primary;
                live['--mf-check-color']        = p.primary;
                live['--mf-progress-fill']      = p.primary;
            }
            persistToSchema();
            flushPreview();
            try {
                window.dispatchEvent(new CustomEvent('mf:theme-preset-changed', {
                    detail: { themeId: currentTheme, primary: p ? p.primary : '' }
                }));
            } catch (_e) { /* defensive */ }
            try { if (B.callModule) B.callModule('canvas', 'render'); } catch (_e) { /* defensive */ }
        },
        applyPresetVars: function (themeId: string, vars: Record<string, string>) {
            currentTheme = String(themeId || 'default');
            if (vars && typeof vars === 'object') {
                Object.keys(vars).forEach(function (k) {
                    var v = vars[k];
                    if (v == null || v === '') return;
                    live[k] = String(v);
                });
            }
            persistToSchema();
            // [P1-3] Push the new palette back into the visible right-rail controls
            // so the Colors panel reflects the preset instead of stale defaults.
            refreshAllColorControls();
            try {
                window.dispatchEvent(new CustomEvent('mf:theme-preset-changed', {
                    detail: {
                        themeId: currentTheme,
                        primary: live['--mf-primary'] || live['--mf-btn-bg'] || '',
                        cssOverrides: Object.assign({}, live)
                    }
                }));
            } catch (_e) { /* defensive */ }
            try { if (B.callModule) B.callModule('canvas', 'render'); } catch (_e) { /* defensive */ }
            flushPreview();
            setTimeout(function () { flushPreview(); }, 0);
            setTimeout(function () { flushPreview(); }, 120);
        },
        flushPreview: function () { flushPreview(); }
    };
    (window as any).MFThemeTabAdapter = api;

    try {
        if (B && B.registerModule) {
            B.registerModule('theme-tab-adapter', api);
        }
    } catch (_e) { /* core may not expose registerModule on this build */ }

    // Re-flush preview on canvas re-renders so the inline preview survives.
    try {
        window.addEventListener('mf:canvas-rendered', function () { flushPreview(); });
    } catch (_e) { /* defensive */ }
})();

export {};
