/**
 * MegaForm Builder Loader — Cross-Platform Bootstrap
 * ====================================================
 * Single entry point for ALL platforms: Oqtane, DNN, ASP Core.
 *
 * Each platform only needs to:
 *   1. Render: <div id="mf-builder-root" data-form-id="N" data-platform="oqtane|dnn|aspcore" ...>
 *   2. Load ONE script: megaform-builder-loader.js  (this file, compiled)
 *
 * This loader handles EVERYTHING else:
 *   ✅ Resolves base URL from its own <script src> — works on any path
 *   ✅ Injects all required CSS (shell, builder, themes, widgets, all plugins)
 *   ✅ Moves #mf-builder-root to direct child of <body> (escapes Oqtane modal, DNN wrappers)
 *   ✅ Hides all other body siblings (nav, header, Oqtane chrome, DNN PersonaBar)
 *   ✅ Loads megaform-builder.js bundle — which self-bootstraps from dataset
 */

(function () {
    'use strict';

    const BUILDER_PREVIEW_CSS_BADGE = 'BuilderPreviewCss v20260422-01';
    const BUILDER_PERMISSIONS_BADGE = 'BuilderPermissions v20260424-01';
    const BUILDER_PDF_FORM_LOAD_BADGE = 'BuilderPdfFormLoad v20260505-01';
    const BUILDER_BUNDLE_VERSION = '20260623-B243';
    if (typeof window !== 'undefined') {
        (window as any).__MF_BUILDER_PREVIEW_CSS_BADGE__ = BUILDER_PREVIEW_CSS_BADGE;
        (window as any).__MF_BUILDER_PERMISSIONS_BADGE__ = BUILDER_PERMISSIONS_BADGE;
        (window as any).__MF_BUILDER_PDF_FORM_BADGE__ = BUILDER_PDF_FORM_LOAD_BADGE;
    }

    // ── 1. Resolve base URL from THIS script's src ─────────────────────────
    // Works regardless of platform install path:
    //   Oqtane:   /Modules/MegaForm/js/megaform-builder-loader.js
    //   DNN:      /DesktopModules/MegaForm/Assets/js/megaform-builder-loader.js
    //   ASP Core: /megaform/js/megaform-builder-loader.js
    function getBaseUrl(): string {
        const el = (document.currentScript as HTMLScriptElement | null) ||
            ((): HTMLScriptElement | null => {
                const scripts = document.querySelectorAll<HTMLScriptElement>(
                    'script[src*="megaform-builder-loader"]'
                );
                return scripts[scripts.length - 1] || null;
            })();

        if (!el?.src) return '/';
        // Strip "/js/megaform-builder-loader.js" and any "?v=xxx" to get the module root
        // e.g. "http://localhost:5000/Modules/MegaForm/js/megaform-builder-loader.js?v=1"
        //   → "http://localhost:5000/Modules/MegaForm/"
        return el.src.replace(/\/js\/megaform-builder-loader\.js[^/]*$/, '/');
    }

    const BASE = getBaseUrl();
    const CSS  = BASE + 'css/';
    const JS   = BASE + 'js/';

    // ── 2. CSS manifest — all files builder needs ──────────────────────────
    // Mirrors exactly what DNN's FormView.ascx.cs registers in builder mode.
    // Add new CSS files here; every platform benefits automatically.
    const BUILDER_CSS: string[] = [
        CSS + 'megaform.css',
        // [B155] version the builder SHELL css too — it carries the windowed-topbar fix
        // and was previously fetched unversioned (browser served a stale cached copy).
        CSS + 'megaform-builder-shell.css?v=' + BUILDER_BUNDLE_VERSION,
        CSS + 'megaform-builder.css?v=' + BUILDER_BUNDLE_VERSION,
        // [B87] version the builder-ts CSS so layout/tab fixes bust the cache.
        CSS + 'megaform-builder-ts.css?v=' + BUILDER_BUNDLE_VERSION,
        CSS + 'megaform-themes.css',
        CSS + 'megaform-widgets.css',
        // plugins — inject all; unused ones add negligible KB
        CSS + 'plugins/megaform-widgets-builtin.css',
        CSS + 'plugins/megaform-widget-advanced-file.css',
        CSS + 'plugins/megaform-widget-calculator.css',
        CSS + 'plugins/megaform-widget-draw-on-image.css',
        CSS + 'plugins/megaform-widget-grid-repeater.css',
        // [2026-06-15] megaform-widget-infinite-list.css removed — InfiniteList retired.
        CSS + 'plugins/megaform-widget-payment.css',
        CSS + 'plugins/megaform-widget-paypal.css',
        // [2026-06-15] megaform-widget-phone-pro.css removed — Phone Pro retired; use Composite Phone.
        CSS + 'plugins/megaform-widget-pdf-form.css',
        CSS + 'plugins/megaform-widget-rating-suite.css',
        CSS + 'plugins/megaform-widget-dynamic-label.css',
        CSS + 'plugins/megaform-widget-razor.css',
        // [2026-06-15] megaform-widget-repeater.css removed — Repeater (Repeating List) retired; use Grid Repeater.
        CSS + 'plugins/megaform-widget-rich-text.css',
        CSS + 'plugins/megaform-widget-signature.css',
        CSS + 'plugins/megaform-widget-stripe.css',
        CSS + 'plugins/megaform-widget-video-embed.css',
        CSS + 'plugins/megaform-widget-data-repeater.css',
        CSS + 'plugins/megaform-widget-golf-scorecard.css',
        // [v20260530-15] megaform-widget-subform.css removed — widget retired
        // because DataGrid (inline + modal modes) covers the same use case
        // and the codebase had three nearly-identical "repeating row" widgets
        // (Subform / DataGrid / GridRepeater). Live DB has 0 forms using
        // type:"Subform" so deletion is safe.
    ];

    // ── 3. External CSS (fonts, icons) — CDN, platform-agnostic ──────────
    const EXTERNAL_CSS: string[] = [
        'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap',
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
    ];

    // ── 4. Inject CSS (skip if already loaded) ────────────────────────────
    function injectCss(urls: string[]): void {
        const existing = new Set(
            Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
                .map(l => l.href.split('?')[0])
        );
        const frag = document.createDocumentFragment();
        for (const url of urls) {
            const bare = (url.startsWith('http') ? url : location.origin + url).split('?')[0];
            if (existing.has(bare)) continue;
            const link = document.createElement('link');
            link.rel  = 'stylesheet';
            link.href = url;
            frag.appendChild(link);
        }
        document.head.appendChild(frag);
    }

    // ── 5. Fullscreen takeover — same technique as DNN FormView.ascx ──────
    // [TakeoverRaceFix v20260501-12] Shared cross-takeover cancellation. The pump
    // (1.2s retry) and MutationObserver (4s) used to leak past navigation: the
    // user navigated to another MegaForm shell within that window, the leftover
    // observer fired on the new page's body and re-injected display:none!important
    // onto the new shell root → BLANK. Now every takeover (Dashboard/Builder/
    // Submissions) cooperates through window.__mfTakeoverCtx — a new takeover
    // cancels the prior one, and the host's CleanupScript can cancel from C#.
    const OQTANE_FULLSCREEN_BADGE = 'OqtaneFullscreenHost v20260501-12';
    const INLINE_SUPPRESS_BADGE = 'InlineBuilderLiveFormSuppress v20260623-B243';

    function fullscreenTakeover(root: HTMLElement): HTMLElement {
        const platform = String(root.dataset.platform || '').toLowerCase();
        const isOqtane = platform === 'oqtane';

        function getHoistedRoot(): HTMLElement {
            if (!isOqtane) return root;
            const existing = document.querySelector<HTMLElement>('#mf-builder-root[data-mf-hoisted="1"]');
            if (existing) return existing;
            if (root.parentElement === document.body) return root;

            const clone = root.cloneNode(false) as HTMLElement;
            clone.id = 'mf-builder-root';
            clone.setAttribute('data-mf-hoisted', '1');
            clone.setAttribute('data-loader-badge', OQTANE_FULLSCREEN_BADGE);
            root.id = 'mf-builder-root-origin';
            root.setAttribute('aria-hidden', 'true');
            root.style.cssText += ';display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;';
            document.body.appendChild(clone);
            return clone;
        }

        const fullscreenRoot = getHoistedRoot();
        fullscreenRoot.setAttribute('data-loader-badge', OQTANE_FULLSCREEN_BADGE);

        // Apply inline style so it covers everything before CSS files load
        fullscreenRoot.style.cssText =
            'position:fixed!important;top:0!important;left:0!important;' +
            'right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;' +
            'max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;' +
            'z-index:2147483000!important;background:#f8fafc!important;overflow:hidden!important;border-radius:0!important;box-shadow:none!important;';

        function ensureFullscreenStyle(): void {
            let style = document.getElementById('mf-builder-fullscreen-style') as HTMLStyleElement | null;
            if (!style) {
                style = document.createElement('style');
                style.id = 'mf-builder-fullscreen-style';
                document.head.appendChild(style);
            }
            style.textContent = ''
                + 'html.mf-builder-open,body.mf-builder-open{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#f8fafc!important;}'
                + 'body.mf-builder-open>#mf-builder-root{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;z-index:2147483000!important;background:#f8fafc!important;overflow:hidden!important;border-radius:0!important;box-shadow:none!important;}'
                + 'body.mf-builder-open>*:not(#mf-builder-root):not(script):not(style):not(link):not([data-mf-overlay]){display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;}'
                + (isOqtane
                    ? 'html.mf-builder-open .modal,html.mf-builder-open .offcanvas,html.mf-builder-open .popup,html.mf-builder-open .dialog,body.mf-builder-open .modal,body.mf-builder-open .offcanvas,body.mf-builder-open .popup,body.mf-builder-open .dialog{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;}'
                    : '');
        }

        function hideChrome(): void {
            // [TakeoverRaceFix v20260501-12] Bail if a newer takeover or cleanup
            // has cancelled us. Reads from the shared global because pump/observer
            // closures hold a stale ctx reference once a new takeover overwrites it.
            const cur = (window as any).__mfTakeoverCtx;
            if (cur && cur.cancelled) return;
            document.documentElement.classList.add('mf-builder-open');
            document.body.classList.add('mf-builder-open');
            document.body.setAttribute('data-mf-builder-open', '1');
            document.body.style.cssText += ';margin:0!important;padding:0!important;overflow:hidden!important;background:#f8fafc!important;';
            document.documentElement.style.cssText += ';margin:0!important;padding:0!important;overflow:hidden!important;background:#f8fafc!important;';
            document.querySelectorAll<HTMLElement>('body > *').forEach(el => {
                if (el === fullscreenRoot) return;
                // [OverlayHostFix v20260501-01] Skip MegaForm's own floating overlays
                // (preview modal, toasts, file pickers, ZIP upload progress) — they're
                // attached to <body> for fixed positioning and have data-mf-overlay='1'.
                // Without this they get hidden by the chrome-hide rules and become invisible.
                if (el.hasAttribute && el.hasAttribute('data-mf-overlay')) return;
                if (el === root) {
                    el.style.cssText += ';display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;';
                    return;
                }
                el.style.cssText += ';display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;';
            });
        }

        ensureFullscreenStyle();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', hideChrome, { once: true });
        } else {
            hideChrome();
        }

        // [TakeoverRaceFix v20260501-12] Cancel any prior takeover (Dashboard,
        // Submissions, or a previous Builder mount) so its observer/pump cannot
        // re-inject display:none onto this page's children. Then register our
        // own ctx so the next page's takeover (or host CleanupScript) can stop
        // ours. All three MegaForm shells use the SAME global name to coordinate.
        const w = window as any;
        if (w.__mfTakeoverCtx) {
            const prev = w.__mfTakeoverCtx;
            prev.cancelled = true;
            try { prev.observer && prev.observer.disconnect(); } catch (_e) { /* noop */ }
            try { prev.pumpTimer && clearTimeout(prev.pumpTimer); } catch (_e) { /* noop */ }
            try { prev.disconnectTimer && clearTimeout(prev.disconnectTimer); } catch (_e) { /* noop */ }
        }
        const ctx = w.__mfTakeoverCtx = {
            cancelled: false,
            observer: null as MutationObserver | null,
            pumpTimer: 0 as number,
            disconnectTimer: 0 as number,
        };

        // Oqtane/Blazor can re-insert shell nodes after initial render. Re-apply a few times
        // and observe body children so the builder stays truly fullscreen like DNN.
        let retries = 0;
        const pump = () => {
            if (ctx.cancelled) return;
            hideChrome();
            if (++retries < 10) ctx.pumpTimer = window.setTimeout(pump, 120);
        };
        ctx.pumpTimer = window.setTimeout(pump, 0);

        if (typeof MutationObserver !== 'undefined') {
            try {
                ctx.observer = new MutationObserver(() => {
                    if (ctx.cancelled) return;
                    hideChrome();
                });
                ctx.observer.observe(document.body, { childList: true });
                ctx.disconnectTimer = window.setTimeout(() => {
                    try { ctx.observer && ctx.observer.disconnect(); } catch (_e) { /* noop */ }
                }, 4000);
            } catch (_e) { /* noop */ }
        }

        // [TakeoverRaceFix v20260501-12] Expose cleanup so Blazor hosts (Oqtane
        // Builder.razor) can run it on LocationChanged. Without this, body keeps
        // .mf-builder-open + the inline display:none on every sibling, so the next
        // SPA-rendered page is BLANK (CSS rule hides everything that is not
        // #mf-builder-root, which no longer exists). Web/DNN do full page reloads
        // so they don't need this — but it's harmless if called there too.
        (window as any).__mfBuilderCleanup = function () {
            try {
                const c = (window as any).__mfTakeoverCtx;
                if (c) {
                    c.cancelled = true;
                    try { c.observer && c.observer.disconnect(); } catch (_e) { /* noop */ }
                    try { c.pumpTimer && clearTimeout(c.pumpTimer); } catch (_e) { /* noop */ }
                    try { c.disconnectTimer && clearTimeout(c.disconnectTimer); } catch (_e) { /* noop */ }
                    c.observer = null; c.pumpTimer = 0; c.disconnectTimer = 0;
                }
                document.documentElement.classList.remove('mf-builder-open');
                document.body.classList.remove('mf-builder-open');
                document.body.removeAttribute('data-mf-builder-open');
                document.documentElement.style.cssText = document.documentElement.style.cssText
                    .replace(/margin\s*:[^;]*!important;?/gi, '')
                    .replace(/padding\s*:[^;]*!important;?/gi, '')
                    .replace(/overflow\s*:[^;]*!important;?/gi, '')
                    .replace(/background\s*:[^;]*!important;?/gi, '');
                document.body.style.cssText = document.body.style.cssText
                    .replace(/margin\s*:[^;]*!important;?/gi, '')
                    .replace(/padding\s*:[^;]*!important;?/gi, '')
                    .replace(/overflow\s*:[^;]*!important;?/gi, '')
                    .replace(/background\s*:[^;]*!important;?/gi, '');
                const clone = document.querySelector('#mf-builder-root[data-mf-hoisted="1"]') as HTMLElement | null;
                if (clone) clone.remove();
                const origin = document.getElementById('mf-builder-root-origin');
                if (origin) {
                    origin.id = 'mf-builder-root';
                    origin.removeAttribute('aria-hidden');
                    origin.style.cssText = origin.style.cssText
                        .replace(/display\s*:[^;]*!important;?/gi, '')
                        .replace(/visibility\s*:[^;]*!important;?/gi, '')
                        .replace(/opacity\s*:[^;]*!important;?/gi, '')
                        .replace(/pointer-events\s*:[^;]*!important;?/gi, '');
                }
                Array.prototype.forEach.call(document.body.children, function (el: Element) {
                    const h = el as HTMLElement;
                    h.style.cssText = h.style.cssText
                        .replace(/display\s*:[^;]*!important;?/gi, '')
                        .replace(/visibility\s*:[^;]*!important;?/gi, '')
                        .replace(/opacity\s*:[^;]*!important;?/gi, '')
                        .replace(/pointer-events\s*:[^;]*!important;?/gi, '');
                });
                const fs = document.getElementById('mf-builder-fullscreen-style');
                if (fs) fs.remove();
            } catch (_e) { /* noop */ }
        };

        // [SyncCleanupOnNav v20260501-13] Run cleanup SYNCHRONOUSLY on any link
        // click that navigates away. Fixes blank-page race on Oqtane: the
        // Builder.razor OnLocationChanged hook fires cleanup via async
        // Js.InvokeVoidAsync, but Blazor's enhanced-nav has already swapped the
        // DOM by the time eval runs → __mfBuilderCleanup is gone, body keeps
        // .mf-builder-open + inline display:none on every sibling → BLANK.
        // Capture-phase listener catches the click BEFORE navigation starts.
        try {
            const w2 = window as any;
            if (!w2.__mfBuilderNavCleanupHook) {
                w2.__mfBuilderNavCleanupHook = true;
                document.addEventListener('click', function (e) {
                    try {
                        if (!document.body.classList.contains('mf-builder-open')) return;
                        const tgt = e.target as Element | null;
                        if (!tgt) return;
                        const a = tgt.closest && (tgt.closest('a') as HTMLAnchorElement | null);
                        if (!a) return;
                        // Skip anchors that don't actually navigate (download, target=_blank,
                        // hash-only, mailto/tel, modifier keys).
                        if (a.target === '_blank' || a.hasAttribute('download')) return;
                        const href = a.getAttribute('href') || '';
                        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
                        if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).shiftKey || (e as MouseEvent).altKey) return;
                        if ((e as MouseEvent).button !== 0) return;
                        // Same-origin navigation — run cleanup synchronously now.
                        if (typeof w2.__mfBuilderCleanup === 'function') {
                            try { w2.__mfBuilderCleanup(); } catch (_err) { /* noop */ }
                        }
                    } catch (_err) { /* noop */ }
                }, true);  // capture
            }
        } catch (_e) { /* noop */ }

        return fullscreenRoot;
    }

    function installInlineBuilderLiveFormSuppression(root: HTMLElement): void {
        const w = window as any;
        const previousCtx = w.__mfInlineBuilderSuppressCtx;
        if (previousCtx && typeof previousCtx.cleanup === 'function') {
            try { previousCtx.cleanup(); } catch (_e) { /* noop */ }
        }

        const suppressed: Array<{ el: HTMLElement; style: string | null; ariaHidden: string | null }> = [];
        const suppressedStyles: Array<{ el: HTMLStyleElement; media: string | null }> = [];
        const seen = new WeakSet<HTMLElement>();
        const seenStyle = new WeakSet<HTMLStyleElement>();
        const previousCleanup = (typeof w.__mfBuilderCleanup === 'function' && !(w.__mfBuilderCleanup as any).__mfInlineSuppressCleanup)
            ? w.__mfBuilderCleanup
            : null;

        function remember(el: HTMLElement): void {
            if (seen.has(el)) return;
            seen.add(el);
            suppressed.push({
                el,
                style: el.getAttribute('style'),
                ariaHidden: el.getAttribute('aria-hidden'),
            });
        }

        function suppressElement(el: HTMLElement): void {
            if (!el || root.contains(el)) return;
            if (el.hasAttribute && el.hasAttribute('data-mf-overlay')) return;
            remember(el);
            el.setAttribute('data-mf-builder-suppressed-live-form', INLINE_SUPPRESS_BADGE);
            el.setAttribute('aria-hidden', 'true');
            el.style.cssText += ';display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;';
        }

        function suppressCustomCss(wrapper: HTMLElement): void {
            // If the builder itself renders a custom preview in the root, keep the CSS alive for it.
            if (root.querySelector('.mf-form-wrapper.mf-custom-html-mode')) return;
            const rawId = wrapper.id || '';
            const match = rawId.match(/^mf-form-wrapper-(\d+)$/);
            const formId = match ? match[1] : (wrapper.getAttribute('data-form-id') || wrapper.getAttribute('data-mf-form-id') || '');
            if (!formId) return;
            const style = document.getElementById('mf-custom-css-' + formId) as HTMLStyleElement | null;
            if (!style || seenStyle.has(style)) return;
            seenStyle.add(style);
            suppressedStyles.push({
                el: style,
                media: style.getAttribute('media'),
            });
            style.setAttribute('data-mf-builder-suppressed-style', INLINE_SUPPRESS_BADGE);
            style.setAttribute('media', 'not all');
        }

        function scan(): void {
            if (!document.body || !document.body.contains(root)) return;
            document.querySelectorAll<HTMLElement>('.mf-form-wrapper').forEach(wrapper => {
                if (root.contains(wrapper)) return;
                suppressElement(wrapper.closest<HTMLElement>('.megaform-module') || wrapper);
                suppressCustomCss(wrapper);
            });
        }

        const ctx = {
            observer: null as MutationObserver | null,
            cleanup: function () { /* replaced below */ },
        };

        ctx.cleanup = function () {
            try { ctx.observer && ctx.observer.disconnect(); } catch (_e) { /* noop */ }
            ctx.observer = null;
            suppressed.forEach(item => {
                try {
                    if (item.style == null) item.el.removeAttribute('style');
                    else item.el.setAttribute('style', item.style);
                    if (item.ariaHidden == null) item.el.removeAttribute('aria-hidden');
                    else item.el.setAttribute('aria-hidden', item.ariaHidden);
                    item.el.removeAttribute('data-mf-builder-suppressed-live-form');
                } catch (_e) { /* noop */ }
            });
            suppressedStyles.forEach(item => {
                try {
                    if (item.media == null) item.el.removeAttribute('media');
                    else item.el.setAttribute('media', item.media);
                    item.el.removeAttribute('data-mf-builder-suppressed-style');
                } catch (_e) { /* noop */ }
            });
            if (w.__mfInlineBuilderSuppressCtx === ctx) w.__mfInlineBuilderSuppressCtx = null;
        };

        w.__mfInlineBuilderSuppressCtx = ctx;
        const chainedCleanup = function () {
            ctx.cleanup();
            if (previousCleanup) {
                try { previousCleanup(); } catch (_e) { /* noop */ }
            }
        };
        (chainedCleanup as any).__mfInlineSuppressCleanup = true;
        w.__mfBuilderCleanup = chainedCleanup;

        scan();
        if (typeof MutationObserver !== 'undefined') {
            try {
                ctx.observer = new MutationObserver(scan);
                ctx.observer.observe(document.body, { childList: true, subtree: true });
            } catch (_e) { /* noop */ }
        }
        window.setTimeout(scan, 0);
        window.setTimeout(scan, 250);
        window.setTimeout(scan, 1000);
    }

    // ── 5. Plugin JS — must load BEFORE builder bundle ────────────────────
    // DNN loads these via ClientResourceManager (auto-scan js/plugins/).
    // Web loads them explicitly in Builder.cshtml.
    // Loader handles it for Oqtane (and any platform using loader).
    // Order matters:
    //   1. Sortable.min.js — global library the canvas + palette init reads as
    //      `new Sortable(...)`. Without this loaded BEFORE the builder bundle
    //      initialises, drag-drop in the builder is broken (no draggable field
    //      cards, can't drop into canvas). DNN loads it via ClientResourceManager,
    //      Web via Builder.cshtml; Oqtane needs the loader to provide it.
    //      Badge: BuilderSortableLoad v20260502-06
    //   2. megaform-widgets.js — base widget registry.
    //   3. individual widget plugins — register into MegaFormWidgets.
    const PLUGIN_JS: string[] = [
        JS + 'Sortable.min.js',
        JS + 'megaform-widgets.js',
        JS + 'plugins/megaform-widget-signature.js',
        JS + 'plugins/megaform-widget-rich-text.js',
        // [2026-06-15] megaform-widget-repeater.js removed — Repeater (Repeating List) retired; Grid Repeater covers it.
        JS + 'plugins/megaform-widget-advanced-file.js',
        JS + 'plugins/megaform-widget-calculator.js',
        JS + 'plugins/megaform-widget-rating-suite.js',
        JS + 'plugins/megaform-widget-dynamic-label.js',
        JS + 'plugins/megaform-widget-razor.js',
        JS + 'plugins/megaform-razor-studio.js',
        JS + 'plugins/megaform-widget-appointment.js',
        JS + 'plugins/megaform-widget-geolocation.js',
        JS + 'plugins/megaform-widget-image-choice.js',
        JS + 'plugins/megaform-widget-payment-unified.js',
        JS + 'plugins/megaform-widget-stripe.js',
        JS + 'plugins/megaform-widget-paypal.js',
        // [2026-06-15] megaform-widget-infinite-list.js removed — InfiniteList retired.
        JS + 'plugins/megaform-widget-draw-on-image.js',
        JS + 'plugins/megaform-widget-video-embed.js',
        JS + 'plugins/megaform-widget-grid-repeater.js',
        // [2026-06-15] megaform-widget-phone-pro.js removed — Phone Pro retired; use Composite Phone.
        JS + 'plugins/megaform-widget-pdf-form.js',
        JS + 'plugins/megaform-widget-content-slider.js',
        JS + 'plugins/megaform-widget-qrcode.js',
        JS + 'plugins/megaform-widget-data-repeater.js',
        JS + 'plugins/megaform-widget-golf-scorecard.js',
        // [v20260530-15] megaform-widget-subform.js removed — retired widget.
        JS + 'plugins/megaform-widget-captcha.js',
        // [Map B42 v20260602] OpenStreetMap-backed Map widget. CSS is inlined
        // in the render() output (mirrors QRCode pattern) so no .css entry.
        JS + 'plugins/megaform-widget-map.js',
        // [AiAssistantOqtaneLoad v20260601-B27] AI Form Assistant chatbot —
        // on DNN this is loaded by FormView.ascx.cs (RegisterScript with V).
        // Oqtane has no equivalent ASCX hook, so the loader must include it
        // here. The script self-gates on __MF_PLATFORM__.ai?.enabled — if
        // dev.lock is missing the floating chat button stays hidden.
        JS + 'megaform-ai-form-assistant.js?v=' + BUILDER_BUNDLE_VERSION,
        // [WorkflowReactFlowLoad v20260502-10] Workflow ReactFlow bundle —
        // exposes window.MFWorkflowRF, used by the FLOW tab. The bundle self-
        // loads its React/ReactDOM/ReactFlow runtime deps from its own folder
        // (Assets/js/builder/) on first init. Without this script tag the
        // FLOW tab shows "Opening canvas…" forever and dom.ts logs
        // "[MF-Workflow] MFWorkflowRF vẫn undefined sau 5 lần retry."
        // DNN/Web load this via cshtml/ascx — Oqtane needs the loader.
        JS + 'builder/megaform-workflow-reactflow.js?v=' + BUILDER_BUNDLE_VERSION,
    ];

    // ── 6. Load scripts sequentially (order guaranteed) ──────────────────
    function loadScriptsSequential(urls: string[], onAllDone: () => void): void {
        const existing = new Set(
            Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))
                .map(s => s.src.split('?')[0])
        );
        const toLoad = urls.filter(u => {
            const bare = (u.startsWith('http') ? u : location.origin + u).split('?')[0];
            return !existing.has(bare);
        });
        if (toLoad.length === 0) { onAllDone(); return; }

        let idx = 0;
        function next(): void {
            if (idx >= toLoad.length) { onAllDone(); return; }
            const s = document.createElement('script');
            s.src = toLoad[idx++];
            s.onload = next;
            s.onerror = () => {
                console.warn('[MF-Loader] Failed to load plugin:', s.src);
                next(); // continue even if one plugin fails
            };
            document.head.appendChild(s);
        }
        next();
    }
    // The bundle reads dataset from #mf-builder-root and self-bootstraps.
    // No need to call MegaFormBuilder.init() — dom.ts handles everything.
    function ensureDesignPreviewToolbar(): void {
        const badge = 'DesignCenterCanvasToolbar v20260608-B92';
        const eyeIcon = '<svg class="mf-preview-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:#71717a;display:block"><path d="M2.06 12.35a1 1 0 0 1 0-.7A12 12 0 0 1 12 5a12 12 0 0 1 9.94 6.65 1 1 0 0 1 0 .7A12 12 0 0 1 12 19a12 12 0 0 1-9.94-6.65Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        const refreshIcon = '<svg class="mf-preview-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M3 21v-5h5"></path><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M16 8h5V3"></path></svg>';
        const fullscreenIcon = '<svg class="mf-preview-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M15 3h6v6"></path><path d="m21 3-7 7"></path><path d="m3 21 7-7"></path><path d="M9 21H3v-6"></path></svg>';
        (window as any).__MF_DESIGN_CENTER_CANVAS_BADGE__ = badge;

        let attempts = 0;
        const pump = () => {
            attempts += 1;
            try {
                const center = document.querySelector<HTMLElement>('.mf-panel-center');
                const dropzone = document.getElementById('mf-canvas-dropzone');
                if (center && dropzone && !center.querySelector('.mf-preview-toolbar')) {
                    const toolbar = document.createElement('div');
                    toolbar.className = 'mf-preview-toolbar';
                    toolbar.setAttribute('aria-label', 'Live Preview controls');
                    toolbar.setAttribute('data-mf-center-canvas-badge', badge);
                    toolbar.innerHTML = ''
                        + '<div class="mf-preview-toolbar-left">'
                        + eyeIcon
                        + '<span class="mf-preview-toolbar-title">Live Preview</span>'
                        + '<span class="mf-preview-state-badge">Default State</span>'
                        + '</div>'
                        + '<div class="mf-preview-toolbar-actions">'
                        + '<button type="button" class="mf-preview-toolbar-btn" data-mf-preview-action="refresh">' + refreshIcon + '<span>Refresh</span></button>'
                        + '<button type="button" class="mf-preview-toolbar-btn" data-mf-preview-action="fullscreen">' + fullscreenIcon + '<span>Fullscreen</span></button>'
                        + '<span class="mf-preview-mode-badge">Light Mode</span>'
                        + '</div>';
                    center.insertBefore(toolbar, dropzone);
                    return;
                }
            } catch (_e) { /* noop */ }
            if (attempts < 48) window.setTimeout(pump, 125);
        };

        pump();
    }

    function loadBuilderBundle(root: HTMLElement): void {
        const bundleUrl = JS + 'bundles/megaform-builder.js?v=' + BUILDER_BUNDLE_VERSION;

        // ★ FIX: Set window.__MF_PLATFORM__ BEFORE the bundle script tag is
        //   appended (scripts execute async after append, so this runs first).
        //   gallery.ts → getPlatformName() reads __MF_PLATFORM__.platform.
        //   Without this, it falls back to 'aspcore' → fetches /dev.lock &
        //   /demo.lock on every page load, returning 404/503 on Oqtane.
        const platform = (root.dataset.platform || 'aspcore').toLowerCase();
        const apiBase  = root.dataset.apiBase  || '/api/MegaForm/';
        const existing = (window as any).__MF_PLATFORM__;
        if (!existing || !existing.platform) {
            (window as any).__MF_PLATFORM__ = {
                ...(existing || {}),
                platform,
                apiBase,
                moduleId : parseInt(root.dataset.moduleId || '0', 10) || 0,
            };
        }

        // Already loaded (e.g. SPA navigation back to builder)
        if (typeof (window as any).MegaFormBuilder !== 'undefined') {
            // dom.ts already ran; if user navigated back, re-init
            const MFB = (window as any).MegaFormBuilder;
            if (typeof MFB.reInit === 'function') {
                MFB.reInit();
            }
            ensureDesignPreviewToolbar();
            return;
        }

        const s = document.createElement('script');
        s.src = bundleUrl;
        s.onload = () => {
            ensureDesignPreviewToolbar();
        };
        s.onerror = () => {
            root.innerHTML =
                `<p style="color:red;padding:2rem;font-family:system-ui">
                    ❌ Failed to load MegaForm builder bundle.<br>
                    <small>Expected: <code>${bundleUrl}</code></small>
                </p>`;
        };
        document.head.appendChild(s);
    }

    // ── 8. MAIN ───────────────────────────────────────────────────────────
    function boot(): void {
        const w = window as any;

        // [BuilderLoaderReentryFix v20260613-B156] Multiple Blazor renders and both
        // Index.razor + BuilderView.razor can append this script. Without a guard,
        // every execution re-injects CSS, re-hoists #mf-builder-root, re-runs the
        // fullscreen pump/observer, and re-loads megaform-builder.js — duplicating
        // plugin registrations and eventually freezing the tab.
        if (w.__mfBuilderLoaderRan === true) {
            console.log('[MF-Loader] Already executed; skipping duplicate boot.');
            return;
        }

        // [NoRootRetryFix v20260613-B160] Set the "ran" guard ONLY once #mf-builder-root
        // is actually present. The loader is a page Resource on EVERY MegaForm page, so it
        // also executes on form/dashboard pages (and during the brief Blazor render window
        // before BuilderView mounts the root) where the root does NOT yet exist. Previously
        // the flag was set BEFORE the root check → that early no-root run "used up" the
        // guard, and the real boot (after the root mounts / on ?mfpanel=builder) was then
        // skipped as a "duplicate" → builder rendered BLANK. By deferring the flag until the
        // root exists, a no-root run is a no-op that lets a later real run boot, while a
        // second run AFTER a successful boot is still correctly short-circuited.
        const root = document.getElementById('mf-builder-root') as HTMLElement | null;
        if (!root) {
            // [P2 noise fix] The loader is a Resource on EVERY MegaForm page, so a
            // no-root execution is normal (form/dashboard pages + the pre-mount
            // render window). Warn ONCE at debug level instead of spamming the
            // console on every page. A later real run (when the root mounts) still
            // boots — the "ran" guard is only set once the root exists (B160).
            if (!w.__mfLoaderNoRootWarned) {
                w.__mfLoaderNoRootWarned = true;
                console.debug('[MF-Loader] #mf-builder-root not present on this page; loader idle until a builder page mounts the root.');
            }
            return;
        }
        w.__mfBuilderLoaderRan = true;

        // Extra guard: if the builder bundle has already been loaded/registered,
        // only re-init (mirrors the check in loadBuilderBundle).
        if (typeof w.MegaFormBuilder !== 'undefined' && typeof w.MegaFormBuilder.reInit === 'function') {
            console.log('[MF-Loader] Builder bundle already present; reInit only.');
            w.MegaFormBuilder.reInit();
            return;
        }

        // Step 1: inject all CSS immediately
        injectCss([...EXTERNAL_CSS, ...BUILDER_CSS]);

        // Step 2: escape any CMS modal/wrapper, cover full screen — UNLESS the host renders
        // the builder INLINE (data-fullscreen-host="false", set by Index.razor when the Oqtane
        // surface is inline). Inline = render in place inside #mf-builder-root (which lives in
        // the module pane); the surface's Fullscreen toggle still lets the user zoom to
        // full-screen (is-fs), and the inline CSS bounds the builder height. [Inline 2026-06-12]
        const wantInline = String(root.getAttribute('data-fullscreen-host') || '').toLowerCase() === 'false';
        const fullscreenRoot = wantInline ? root : fullscreenTakeover(root);
        if (wantInline) installInlineBuilderLiveFormSuppression(fullscreenRoot);

        // Step 3: load plugins sequentially, THEN load builder bundle
        // Plugins must register into MegaFormWidgets BEFORE bundle initialises the palette
        loadScriptsSequential(PLUGIN_JS, () => {
            loadBuilderBundle(fullscreenRoot);
        });
    }

    // Run as soon as possible — don't wait for DOMContentLoaded
    // because <script> at end of body fires after DOM is ready anyway,
    // and waiting adds unnecessary latency.
    boot();

})();

export {};
