/* ============================================================
   MegaForm Builder — Canvas Module  (TypeScript source)
   File: megaform-builder-canvas.ts
   Compiled to: Assets/js/builder/megaform-builder-canvas.js
   Depends on: megaform-builder-core.js (MegaFormBuilder global)

   BUG FIXES in this version:
   #1 — Plugin icons: normalize "fa-xxx" → "fas fa-xxx"
   ============================================================ */

import { MegaFormBuilder } from './core';
import SortableModule from 'sortablejs';
// [Fidelity v20260616] Shared cell sizing so the canvas composite preview matches the runtime
// (fraction widths 1/4·1/2·full, flex shares) — single source in renderer/helpers.
import { compositeCellStyle } from '../renderer/helpers';
// [2026-06-27 #2 Steps-in-builder] Surface the custom-shell wizard's step structure
// (which lives only in customHtml, invisible to the schema-driven canvas).
import { fieldStepMap } from '@shared/custom-html-insert';
// MegaFormBuilder is a global defined by megaform-builder-core.js

(function () {
    'use strict';

    const B = MegaFormBuilder;
    const LABEL_RULE_BADGE = 'BuilderLabelRules v20260403-05';
    const DROP_WRAP_BADGE = 'BuilderDropWrap v20260403-07';
    let sortableInstance: any = null;
    let rowColSortables: any[] = [];
    let flexGridSortables: any[] = [];

    function initModule(): void {
        (B as any)._builderLabelRulesBadge = LABEL_RULE_BADGE;
        (B as any)._builderDropWrapBadge = DROP_WRAP_BADGE;
        (B as any)._builderDropFixBadge = DROP_WRAP_BADGE;
        // [PluginPreload v20260525-01] Server-side BuildAssetManifest only
        // emits <script> tags for widget plugins matching CURRENT schema field
        // types. For a brand-new form (no fields yet) the page therefore loads
        // ZERO widget plugins → palette only shows the 2 core widgets, and
        // picking a Templates Gallery item that contains PdfForm/DataRepeater
        // /etc. lands a field whose runtime script is missing → blank canvas.
        // Fix: preload the full plugin set on Builder init so any later schema
        // change (template apply, manual add) finds its plugin already
        // registered. Idempotent — skips scripts already present in the page.
        ensureAllPluginsLoaded();
        initPaletteClick();
        initPaletteSearch();
        initPaletteTabs(); // calls populatePluginPalette() internally
        initPaletteDrag(); // Must be after palette content is ready
        initThemeModeBridge(); // [ThemeMode v20260602-B48] Webflow-style theme tab
    }

    // =========================================================
    //  [ThemeMode v20260602-B48] Canvas Theme Mode
    //  ---------------------------------------------------------
    //  When the right-rail "Theme Designer" tab is active, the canvas
    //  behaves like a runtime preview:
    //    * Drag handles, +Add Field prompts, and per-field action buttons
    //      are hidden via the body.state-theme-mode CSS class.
    //    * Clicking a field card no longer SELECTS that field for property
    //      editing. Instead it scrolls the right-rail Theme panel to the
    //      section that styles that field type (input vs button vs choice
    //      etc.) and briefly flashes that section yellow so the eye locks
    //      onto the relevant control — Webflow-style "click element → jump
    //      to its style group".
    //  Author B is expected to fire two CustomEvents from the THEME tab
    //  link in dom.ts createRightTabs() / properties-patch.ts activateTab():
    //    window.dispatchEvent(new CustomEvent('mf:theme-tab-activated'))
    //    window.dispatchEvent(new CustomEvent('mf:theme-tab-deactivated'))
    //  Author B is also expected to tag the four Theme panel sections with
    //  data-mf-theme-anchor="input|button|choice|date|phone|section|form"
    //  so we can scroll-into-view by attribute. Fallback when the anchor
    //  isn't present yet: best-effort selector lookup on common labels.
    // =========================================================
    function initThemeModeBridge(): void {
        (window as any).__MF_THEME_MODE_BADGE__ = 'CanvasThemeMode v20260602-B50';
        try {
            window.addEventListener('mf:theme-tab-activated', enterThemeMode as EventListener);
            window.addEventListener('mf:theme-tab-deactivated', exitThemeMode as EventListener);
        } catch (_e) { /* SSR / older browsers — ignore */ }
    }

    function enterThemeMode(): void {
        if (document.body.classList.contains('state-theme-mode')) return;
        document.body.classList.add('state-theme-mode');
        (B.state as any)._themeMode = true;
        // Drop current field selection so the right rail is free to show
        // the Theme panels without the Field-Properties panel fighting it.
        try {
            if (B.state.selectedFieldIndex >= 0) {
                B.state.selectedFieldIndex = -1;
                B.state._rowFieldRef = null;
                document.querySelectorAll<HTMLElement>('.mf-canvas-field, .mf-canvas-row')
                    .forEach(el => el.classList.remove('mf-selected'));
            }
        } catch (_e) { /* defensive */ }
        // [B67] User constraint: "form o chinh giua khong thay doi khi bat
        // qua lai 2 che do" — the center canvas must stay put when toggling
        // Build/Design. The B50 ThemePreviewFrame mounted a runtime iframe
        // INSTEAD of the existing FlexGrid canvas — that swap is exactly
        // what the user doesn't want. We keep the canvas in place; the body
        // .state-theme-mode class + B49 dressed-down CSS already hide all
        // builder chrome (drag handles, field-type badges, etc.) so the
        // canvas reads like a clean live preview without the iframe swap.
        //
        // The iframe path is retained as opt-in via ?themeIframe=1 query so
        // future sessions can A/B without reverting the code.
        // [B70-DesignModeLivePreview] Always use runtime iframe preview in
        // Design mode so the center canvas renders the EXACT live form.
        // The ?themeIframe=1 opt-in is retired; the old native-canvas path
        // is preserved behind ?themeIframe=0 for emergency fallback only.
        var useIframe = true;
        try {
            var sp = new URLSearchParams(String(window.location.search || ''));
            if (sp.get('themeIframe') === '0') useIframe = false;
        } catch (_e) { /* defensive */ }
        if (useIframe) {
            try { document.documentElement.setAttribute('data-mf-theme-iframe', '1'); } catch (_e) {}
            try { mountThemePreviewFrame(); } catch (_e) { /* defensive */ }
        } else {
            try { document.documentElement.removeAttribute('data-mf-theme-iframe'); } catch (_e) {}
        }
    }

    function exitThemeMode(): void {
        if (!document.body.classList.contains('state-theme-mode')) return;
        // [ThemePreviewFrame v20260602-B50] Tear iframe down BEFORE removing
        // the body class — order matters because unmount un-hides the
        // original children, and the CSS guard relies on state-theme-mode
        // still being present to keep them hidden until the iframe is gone.
        try { unmountThemePreviewFrame(); } catch (_e) { /* defensive */ }
        document.body.classList.remove('state-theme-mode');
        (B.state as any)._themeMode = false;
    }

    // =========================================================
    //  [ThemePreviewFrame v20260602-B50]
    //  Runtime preview iframe inside #mf-canvas-dropzone
    //  ---------------------------------------------------------
    //  When THEME tab activates, we hide every existing child of
    //  the canvas dropzone (tagging each one with data-mf-builder-
    //  hidden="1" so we know exactly what to un-hide on exit) and
    //  drop a same-origin iframe whose src is the runtime URL
    //  /xx?mfFormId=N&theme-preview=1&_=<ts>. The runtime renderer
    //  inside that iframe consumes customHtml + customCss + the
    //  saved theme settings exactly the way the public page does,
    //  so what designers see in the canvas matches the live form.
    //
    //  We deliberately use an iframe (not a same-document mount)
    //  to keep Builder chrome CSS fully isolated from the runtime
    //  form. The iframe is same-origin, so the parent can still
    //  reach into iframe.contentDocument later if we add a live
    //  theme-CSS bridge (postMessage handshake) in a follow-up.
    // =========================================================
    function resolveThemePreviewFormId(): number {
        // [B52 Bug H] Probe MULTIPLE casings + URL patterns.
        // User reported "Save form first" placeholder appears on EXISTING
        // saved forms because previous resolver only checked formId (camel),
        // missed FormId (Pascal) on schema + URL param `mfFormId` (capitalized M).
        function num(v: any): number {
            if (v == null) return 0;
            var n = parseInt(String(v), 10);
            return (isFinite(n) && n > 0) ? n : 0;
        }
        try {
            const stateAny = (B && B.state) as any;
            if (stateAny) {
                const sch = stateAny.schema || {};
                var fid = num(sch.formId) || num(sch.FormId) || num(sch.formID)
                        || num(stateAny.formId) || num(stateAny.FormId) || num(stateAny.formID);
                if (fid > 0) return fid;
            }
            const globalAny = (window as any).MegaFormBuilder;
            if (globalAny && globalAny.state) {
                const gSch = globalAny.state.schema || {};
                var gfid = num(gSch.formId) || num(gSch.FormId) || num(gSch.formID)
                         || num(globalAny.state.formId) || num(globalAny.state.FormId);
                if (gfid > 0) return gfid;
            }
            // URL query params — case-insensitive scan for any *formid* variant
            const sp = new URLSearchParams(String(window.location.search || ''));
            var qfid = 0;
            sp.forEach(function (v, k) {
                if (qfid > 0) return;
                var kl = String(k || '').toLowerCase();
                if (kl === 'formid' || kl === 'mfformid' || kl === 'form_id' || kl === 'fid') {
                    qfid = num(v);
                }
            });
            if (qfid > 0) return qfid;
            // URL hash params (e.g. #mf-builder?formId=N or #mf-builder?mfFormId=N)
            const h = String(window.location.hash || '').replace(/^#[^?]*\??/, '');
            if (h) {
                const hp = new URLSearchParams(h);
                var hfid = 0;
                hp.forEach(function (v, k) {
                    if (hfid > 0) return;
                    var kl = String(k || '').toLowerCase();
                    if (kl === 'formid' || kl === 'mfformid') hfid = num(v);
                });
                if (hfid > 0) return hfid;
            }
        } catch (_e) { /* defensive */ }
        return 0;
    }

    function buildThemePreviewUrl(formId: number): string {
        // [B52] Legacy URL-src approach kept for fallback. Default mount path
        // now uses buildThemePreviewSrcdoc() which inlines the schema so the
        // iframe shows ONLY the form, no DNN/Oqtane page chrome.
        const platform = (window as any).__MF_PLATFORM__ || {};
        const base: string = String(platform.runtimeBaseUrl || platform.siteRoot || '');
        const path = '/xx?mfFormId=' + encodeURIComponent(String(formId))
            + '&theme-preview=1&_=' + Date.now();
        if (!base) return path;
        return (base.replace(/\/+$/, '')) + path;
    }

    function getPlatformAssetBase(): string {
        // [B52] DNN: /DesktopModules/MegaForm/Assets vs Oqtane: /Modules/MegaForm
        var w = window as any;
        if (w.__MF_ASSET_BASE__) return String(w.__MF_ASSET_BASE__).replace(/\/+$/, '');
        var pf = (w.__MF_PLATFORM__ || {}) as any;
        if (pf.assetBase) return String(pf.assetBase).replace(/\/+$/, '');
        var platform = String(pf.platform || '').toLowerCase();
        if (platform === 'oqtane' || w.Oqtane || w.__OQTANE__) return '/Modules/MegaForm';
        if (document.querySelector('[data-mf-platform="oqtane"]')) return '/Modules/MegaForm';
        return '/DesktopModules/MegaForm/Assets';
    }

    function getPreviewApiBase(): string {
        // Reuse B51 platform-aware base for runtime renderer config.
        var w = window as any;
        if (w.__MF_API_BASE__) return String(w.__MF_API_BASE__).replace(/\/+$/, '');
        var pf = (w.__MF_PLATFORM__ || {}) as any;
        if (pf.apiBase) return String(pf.apiBase).replace(/\/+$/, '');
        var platform = String(pf.platform || '').toLowerCase();
        if (platform === 'oqtane' || w.Oqtane || w.__OQTANE__) return '/api/MegaForm';
        return '/DesktopModules/MegaForm/API';
    }

    function buildThemePreviewSrcdoc(formId: number): string {
        // [B52] Build full inline HTML document. Iframe srcdoc same-origin
        // inherits parent origin so postMessage live-css bridge from B50
        // (theme-tab-adapter.ts ↔ this iframe) still works.
        // Pattern adapted from src/theme-designer/index.ts rebuildPreview() ~L1271-1384.
        var assetBase = getPlatformAssetBase();
        var apiBase = getPreviewApiBase();
        var origin = (window.location.origin || '').replace(/\/+$/, '');
        var stateAny = (B && B.state) as any;
        var schema = (stateAny && stateAny.schema) ? stateAny.schema : { fields: [], settings: {} };
        var settings: any = schema.settings || {};
        // Serialize defensively — strip closing </script> sequences from JSON
        function esc(s: string): string {
            return String(s).replace(/<\//g, '<\\/');
        }
        var schemaJson = esc(JSON.stringify(schema || { fields: [], settings: {} }));
        var settingsJson = esc(JSON.stringify(settings || {}));
        var themePayload = JSON.stringify({
            _kind: 'MegaFormThemePatch',
            theme: settings.theme || 'default',
            cssOverrides: settings.cssOverrides || {},
            customCss: settings.customCss || ''
        });
        var titleJson = esc(JSON.stringify(schema.title || ''));
        var descriptionJson = esc(JSON.stringify(schema.description || ''));
        var submitJson = esc(JSON.stringify(schema.submitButtonText || 'Submit'));

        // ── [B57 FIX] Build the srcdoc body as a flat array of string
        // chunks and `.join('')` at the end. Earlier B50/B56 revisions
        // interleaved `//` line comments BETWEEN `+` string-concat
        // operators (e.g. `+ '...'  // explanatory note  + '...'`). Vite's
        // dead-code-elimination/minify pass treated the comment as a void
        // expression, turning `'a' + (void) + 'b'` → `'a' + undefined + 'b'`
        // → the literal string `"NaN..."`. That corrupted the shipped
        // bundle: the inline bootstrap inside the iframe srcdoc contained
        // `NaNvar s=...` which is a SyntaxError → the DOMContentLoaded
        // handler that calls MegaFormRenderer.init never registered →
        // `#mf-mount` stayed empty. Joining a string[] avoids the
        // comment-as-operand trap entirely; explanatory notes live on
        // their own lines as statement-level `//` comments.
        var renderInit =
            'window.__CFG={formId:' + Number(formId) +
            ',container:"#mf-mount",schema:' + schemaJson +
            ',settingsJson:' + settingsJson +
            ',themeJson:' + esc(themePayload) +
            ',title:' + titleJson +
            ',description:' + descriptionJson +
            ',submitButtonText:' + submitJson +
            ',isPreview:true' +
            ',apiBaseUrl:' + esc(JSON.stringify(apiBase)) +
            '};';

        // Bootstrap script — kept as a single template literal so the
        // bundler cannot misread inline comments as operands. Wires the
        // postMessage listener FIRST (so parent's first CSS push isn't
        // dropped), then on DOMContentLoaded calls MegaFormRenderer.init
        // and posts `mf-theme-preview-ready` back to the parent.
        // ── [B58 InspectPicker — explanation, OUTSIDE bootstrap concat] ──
        // The parent (theme-left-rail.ts) posts mf-theme-inspect-mode
        // {on:true|false} when the user toggles "Pick element". When ON we
        // add body class mf-inspect-on (CSS sets crosshair + hover outline)
        // and bind a one-shot mousedown that:
        //   1. computes a chain-style selector from the clicked node
        //      up to body / mf-form / mf-form-wrapper / mf-mount
        //   2. samples the top ~30 most-relevant computed styles
        //   3. postMessages {type:"mf-theme-inspect-pick", selector,
        //      breadcrumb, styles} back to parent
        //   4. auto-turns inspect mode OFF (parent will too).
        // NOTE: inline `//` comments BETWEEN `+`-concat fragments inside the
        // bootstrap literal trigger the Vite NaN-injection bug documented in
        // the B57 FIX block above. Keep ALL bootstrap explanation here.
        var bootstrap =
            '(function(){' +
                'var __mfInspectOn=false;' +
                'var __mfInspectHandler=null;' +
                'var __mfParentOrigin=window.location.origin;try{if(document.referrer)__mfParentOrigin=new URL(document.referrer).origin;}catch(_eOrigin){}' +
                'var INSPECT_KEYS=["display","position","width","height","min-width","min-height","max-width","max-height","margin","padding","border","border-radius","background","background-color","background-image","color","font-family","font-size","font-weight","line-height","letter-spacing","text-align","box-shadow","outline","opacity","overflow","flex","gap","grid-template-columns","transition","cursor","z-index"];' +
                'function __mfInspectSelector(el){' +
                    'try{' +
                        'var parts=[];var cur=el;var stop=0;' +
                        'while(cur&&cur.nodeType===1&&stop<8){' +
                            'var tag=String(cur.tagName||"").toLowerCase();' +
                            'var seg=tag;' +
                            'if(cur.id){seg=tag+"#"+cur.id;parts.unshift(seg);break;}' +
                            'var cls=String(cur.className||"").split(/\\s+/).filter(function(c){return c&&c.indexOf("mf-")===0;}).slice(0,3);' +
                            'if(cls.length)seg=tag+"."+cls.join(".");' +
                            'parts.unshift(seg);' +
                            'if(tag==="body"||tag==="html")break;' +
                            'cur=cur.parentNode;stop++;' +
                        '}' +
                        'return parts.join(" > ");' +
                    '}catch(_e){return"(unknown)";}' +
                '}' +
                'function __mfInspectBreadcrumb(el){' +
                    'try{' +
                        'var crumbs=[];var cur=el;var stop=0;' +
                        'while(cur&&cur.nodeType===1&&stop<8){' +
                            'var tag=String(cur.tagName||"").toLowerCase();' +
                            'var label=tag;' +
                            'if(cur.id)label=tag+"#"+cur.id;' +
                            'else{' +
                                'var cls=String(cur.className||"").split(/\\s+/).filter(function(c){return c&&c.indexOf("mf-")===0;})[0];' +
                                'if(cls)label=tag+"."+cls;' +
                            '}' +
                            'crumbs.unshift(label);' +
                            'if(tag==="body"||tag==="html")break;' +
                            'cur=cur.parentNode;stop++;' +
                        '}' +
                        'return crumbs;' +
                    '}catch(_e){return[];}' +
                '}' +
                'function __mfInspectStyles(el){' +
                    'var out={};' +
                    'try{' +
                        'var cs=window.getComputedStyle(el);' +
                        'for(var i=0;i<INSPECT_KEYS.length;i++){' +
                            'var k=INSPECT_KEYS[i];' +
                            'var v=cs.getPropertyValue(k);' +
                            'if(v&&String(v).trim())out[k]=String(v).trim();' +
                        '}' +
                    '}catch(_e){}' +
                    'return out;' +
                '}' +
                'function __mfInspectOff(){' +
                    'if(!__mfInspectOn)return;' +
                    '__mfInspectOn=false;' +
                    'try{document.body.classList.remove("mf-inspect-on");}catch(_e){}' +
                    'if(__mfInspectHandler){' +
                        'try{document.removeEventListener("mousedown",__mfInspectHandler,true);}catch(_e){}' +
                        '__mfInspectHandler=null;' +
                    '}' +
                '}' +
                'function __mfInspectOn_(){' +
                    'if(__mfInspectOn)return;' +
                    '__mfInspectOn=true;' +
                    'try{document.body.classList.add("mf-inspect-on");}catch(_e){}' +
                    '__mfInspectHandler=function(ev){' +
                        'try{' +
                            'ev.preventDefault();ev.stopPropagation();' +
                            'var t=ev.target;' +
                            'if(!t||t.nodeType!==1)return;' +
                            'var sel=__mfInspectSelector(t);' +
                            'var crumbs=__mfInspectBreadcrumb(t);' +
                            'var styles=__mfInspectStyles(t);' +
                            'try{window.parent.postMessage({type:"mf-theme-inspect-pick",selector:sel,breadcrumb:crumbs,styles:styles},__mfParentOrigin);}catch(_e2){}' +
                        '}finally{__mfInspectOff();}' +
                    '};' +
                    'try{document.addEventListener("mousedown",__mfInspectHandler,true);}catch(_e){}' +
                '}' +
                'try{' +
                    'var __mfInsCss=document.createElement("style");' +
                    '__mfInsCss.id="mf-inspect-css";' +
                    '__mfInsCss.textContent="body.mf-inspect-on,body.mf-inspect-on *{cursor:crosshair !important}body.mf-inspect-on *:hover{outline:1px dashed #6366f1 !important;outline-offset:1px !important;background:rgba(99,102,241,0.05) !important}";' +
                    'document.head.appendChild(__mfInsCss);' +
                '}catch(_e){}' +
                'try{' +
                    'window.addEventListener("message",function(e){' +
                        'if(e.source!==window.parent||e.origin!==__mfParentOrigin)return;' +
                        'var d=e&&e.data;if(!d)return;' +
                        'if(d.type==="mf-theme-live-css"){' +
                            'var s=document.getElementById("mf-theme-live-preview");' +
                            'if(!s){s=document.createElement("style");s.id="mf-theme-live-preview";document.head.appendChild(s);}' +
                            's.textContent=String(d.css||"");' +
                            'return;' +
                        '}' +
                        'if(d.type==="mf-theme-live-class"){' +
                            'var id=String(d.themeId||"default");' +
                            'var roots=[document.body,document.getElementById("mf-mount")];' +
                            'var wrappers=document.querySelectorAll(".mf-form-wrapper");' +
                            'for(var i=0;i<wrappers.length;i++){roots.push(wrappers[i]);}' +
                            'for(var j=0;j<roots.length;j++){' +
                                'var n=roots[j];if(!n||!n.classList)continue;' +
                                'var stale=[];n.classList.forEach(function(c){if(c.indexOf("mf-theme-")===0)stale.push(c);});' +
                                'for(var k=0;k<stale.length;k++){n.classList.remove(stale[k]);}' +
                                'if(id&&id!=="default")n.classList.add("mf-theme-"+id);' +
                            '}' +
                            'return;' +
                        '}' +
                        'if(d.type==="mf-theme-inspect-mode"){' +
                            'if(d.on)__mfInspectOn_();else __mfInspectOff();' +
                            'return;' +
                        '}' +
                        'if(d.type==="mf-theme-inspect-edit"){' +
                            'try{' +
                                'var sel=String(d.selector||"");' +
                                'var key=String(d.cssKey||"");' +
                                'var val=String(d.cssValue==null?"":d.cssValue);' +
                                'if(!sel||!key)return;' +
                                'var camel=key.replace(/-([a-z])/g,function(_m,c){return c.toUpperCase();});' +
                                'var nodes=null;' +
                                'try{nodes=document.querySelectorAll(sel);}catch(_eSel){nodes=null;}' +
                                'if(nodes&&nodes.length){' +
                                    'for(var ii=0;ii<nodes.length;ii++){' +
                                        'var el=nodes[ii];' +
                                        'if(!el||!el.style)continue;' +
                                        // [2026-07-02 FIX] Apply with !important priority. The inspector is an
                                        // explicit override tool; premium template CSS often uses !important, so a
                                        // plain inline style (no priority) was silently overridden → edits looked dead.
                                        'try{el.style.setProperty(key,val,"important");}catch(_eApply){' +
                                            'try{el.style[camel]=val;}catch(_eFallback){}' +
                                        '}' +
                                    '}' +
                                '}' +
                                'if(d.themeVar){' +
                                    'try{document.documentElement.style.setProperty(String(d.themeVar),val);}catch(_eVar){}' +
                                '}' +
                            '}catch(_eEdit){}' +
                            'return;' +
                        '}' +
                    '},false);' +
                '}catch(_e){}' +
                'function announceReady(){try{window.parent.postMessage({type:"mf-theme-preview-ready"},__mfParentOrigin);}catch(_e){}}' +
                'function doInit(){' +
                    'try{if(window.MegaFormRenderer&&typeof window.MegaFormRenderer.init==="function"){window.MegaFormRenderer.init(window.__CFG);}}catch(e){try{console.error("[mf-theme-preview] renderer init failed",e);}catch(_){}}' +
                    'announceReady();' +
                '}' +
                'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",doInit);}' +
                'else{doInit();}' +
            '}());';

        var parts: string[] = [
            '<!DOCTYPE html><html><head><meta charset="utf-8">',
            '<link rel="stylesheet" href="' + origin + assetBase + '/css/megaform.css">',
            '<link rel="stylesheet" href="' + origin + assetBase + '/css/plugins/megaform-widgets-builtin.css">',
            '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">',
            '<style id="mf-theme-live-preview"></style>',
            // [B58 FormWidthParity] Force the iframe form wrapper to use the
            // full canvas viewport instead of inheriting --mf-form-max-width:
            // 960px from megaform.css (which is narrower than the 24px-padded
            // dropzone container, leaving an unsightly gap on the right edge).
            // body uses 100% width with no max; the form wrapper / mf-form-
            // inner / mf-form get max-width:1200px so they grow to fill the
            // available space but still cap on ultra-wide canvases. Padding
            // is 0 so the iframe's own 24px dropzone padding owns the breath
            // around the form, matching the live runtime URL.
            // [B65 BuilderCanvasNeutral + B65b DesktopGridForced]
            // (1) Neutral page bg so dark presets don't black out canvas.
            // (2) Form wrapper white with soft border + shadow.
            // (3) FORCE FlexGrid items to always use --lg-* placements regardless
            //     of iframe viewport width. The iframe is typically ~500-700px
            //     wide (inside builder canvas) — narrower than the 1024px lg
            //     breakpoint in megaform.css, so without this override the
            //     renderer falls back to --md-*/--sm-* defaults (full-width
            //     stack) and 2-col forms appear collapsed. User feedback compared
            //     builder THEME view vs runtime /xx?formid=N and wanted parity.
            // [B65n] Iframe styling now MATCHES runtime form (/xx?formid=N).
            // Previously B65 forced wrapper as a white card with border+shadow,
            // and forced inner/form bg to #fff which OVERROTE the theme's
            // --mf-form-bg variable — so preset colors picked from the right
            // pane never propagated to the form CARD (only to text inputs).
            // Now: wrapper is the page-bg surround (24px padding), .mf-form
            // is the white card using var(--mf-form-bg) so presets paint it,
            // submit button uses var(--mf-primary) so it goes green on
            // Nature Green / orange on Warm Sunset / etc.
            '<style>html,body{margin:0;padding:0;width:100%;max-width:none;overflow-x:hidden;}' +
              'body{background:#f5f7fa !important;}' +
              // [P1-5] max-width consumes --mf-form-max-width (Layout tab control) with
              // the old hardcoded value as FALLBACK, so the Layout > Max width select
              // (posted as `--mf-form-max-width:100%` etc. via live-css) actually
              // resizes the form; unset = unchanged legacy parity behaviour.
              '.mf-form-wrapper{max-width:var(--mf-form-max-width,1200px) !important;width:100% !important;min-width:0 !important;margin-left:auto !important;margin-right:auto !important;padding:12px 8px !important;background:transparent !important;border:0 !important;box-shadow:none !important;border-radius:0 !important;box-sizing:border-box !important;}' +
              '.mf-form-inner{max-width:var(--mf-form-max-width,none) !important;width:100% !important;min-width:0 !important;background:transparent !important;}' +
              '#mf-mount{width:100%;max-width:none;min-width:0;}' +
              // Submit button — force var(--mf-primary) so preset colours win.
              '.mf-submit-btn,.mf-form-actions button[type=submit],.mfp-submit{background:var(--mf-btn-bg,var(--mf-primary,#4f46e5)) !important;color:var(--mf-btn-color,var(--mf-color-text-inverse,#fff)) !important;border:0 !important;padding:10px 28px !important;border-radius:6px !important;}' +
              // [B65p] Submit button width + alignment driven by classes on .mf-form-actions
              '.mf-form-actions{display:flex !important;gap:10px !important;}' +
              '.mf-form-actions.mf-submit-align-left{justify-content:flex-start !important;}' +
              '.mf-form-actions.mf-submit-align-center{justify-content:center !important;}' +
              '.mf-form-actions.mf-submit-align-right{justify-content:flex-end !important;}' +
              '.mf-form-actions.mf-submit-fullwidth .mf-submit-btn,.mf-form-actions.mf-submit-fullwidth button[type=submit]{width:100% !important;flex:1 !important;}' +
              '.mf-form-actions.mf-submit-variant-outline .mf-submit-btn,.mf-form-actions.mf-submit-variant-outline button[type=submit]{background:transparent !important;color:var(--mf-btn-bg,var(--mf-primary,#4f46e5)) !important;border:1px solid var(--mf-btn-bg,var(--mf-primary,#4f46e5)) !important;}' +
              '.mf-form-actions.mf-submit-variant-ghost .mf-submit-btn,.mf-form-actions.mf-submit-variant-ghost button[type=submit]{background:transparent !important;color:var(--mf-btn-bg,var(--mf-primary,#4f46e5)) !important;border:0 !important;box-shadow:none !important;}' +
              // [B65w] Form display style variants applied to .mf-form-wrapper
              '.mf-form-wrapper.mf-style-radius-square,.mf-form-wrapper.mf-style-radius-square .mf-form{border-radius:0 !important;}' +
              '.mf-form-wrapper.mf-style-radius-rounded,.mf-form-wrapper.mf-style-radius-rounded .mf-form{border-radius:var(--mf-form-radius,8px) !important;}' +
              '.mf-form-wrapper.mf-style-radius-pill,.mf-form-wrapper.mf-style-radius-pill .mf-form{border-radius:16px !important;}' +
              '.mf-form-wrapper.mf-style-input-square input,.mf-form-wrapper.mf-style-input-square textarea,.mf-form-wrapper.mf-style-input-square select{border-radius:0 !important;}' +
              '.mf-form-wrapper.mf-style-input-rounded input,.mf-form-wrapper.mf-style-input-rounded textarea,.mf-form-wrapper.mf-style-input-rounded select,.mf-form-wrapper.mf-style-input-rounded button.mf-input{border-radius:var(--mf-input-radius,6px) !important;}' +
              '.mf-form-wrapper.mf-style-input-pill input:not([type=checkbox]):not([type=radio]),.mf-form-wrapper.mf-style-input-pill textarea,.mf-form-wrapper.mf-style-input-pill select{border-radius:999px !important;}' +
              '.mf-form-wrapper.mf-style-shadow-none .mf-form{box-shadow:none !important;}' +
              '.mf-form-wrapper.mf-style-shadow-soft .mf-form{box-shadow:0 1px 3px rgba(15,23,42,.08) !important;}' +
              '.mf-form-wrapper.mf-style-shadow-medium .mf-form{box-shadow:0 6px 18px rgba(15,23,42,.10) !important;}' +
              '.mf-form-wrapper.mf-style-shadow-large .mf-form{box-shadow:0 18px 48px rgba(15,23,42,.16) !important;}' +
              '.mf-form-wrapper.mf-style-border-none .mf-form{border:0 !important;}' +
              '.mf-form-wrapper.mf-style-border-hairline .mf-form{border:1px solid #e4e4e7 !important;}' +
              '.mf-form-wrapper.mf-style-border-prominent .mf-form{border:2px solid #cbd5e1 !important;}' +
              '.mf-form{width:100% !important;max-width:var(--mf-form-max-width,none) !important;}' +
              // [B65z-2] QR Code widget always renders as a top-right corner
              // overlay. Make .mf-form-wrapper a positioning context so the
              // .mf-qr-corner (position:absolute) anchors correctly. Hide the
              // standard label/input chrome when the field-group wraps a QR.
              '.mf-form-wrapper{position:relative !important;}' +
              '.mf-field-group[data-type="QRCode"]{position:absolute !important;top:8px !important;right:8px !important;width:auto !important;margin:0 !important;padding:0 !important;}' +
              '.mf-field-group[data-type="QRCode"] > label,.mf-field-group[data-type="QRCode"] > .mf-label,.mf-field-group[data-type="QRCode"] > .mf-field-error,.mf-field-group[data-type="QRCode"] > input,.mf-field-group[data-type="QRCode"] > .mf-input{display:none !important;}' +
              '.mf-field-group[data-type="QRCode"] .mf-qr-corner{position:static !important;}' +
              // [B65t] At narrow iframe widths force EVERY item to full-width
              // with auto-flow so conflicting --lg-y placements in user schemas
              // (Appointment + Long Text both at y=299 etc.) stack cleanly
              // instead of overlapping as garbled "Appp Texxtent" labels.
              // grid-auto-flow:dense helps the renderer pack items normally
              // when iframe is wide enough to honour --lg-*.
              '@media (min-width:768px) and (max-width:1023px){.mf-flexgrid{grid-auto-flow:dense !important;}.mf-flexgrid-item{grid-column:var(--lg-x,1)/span var(--lg-w,12) !important;grid-row:var(--lg-y,auto)/span var(--lg-h,1) !important;}}' +
              '@media (max-width:767px){.mf-flexgrid{grid-auto-flow:row !important;}.mf-flexgrid-item{grid-column:1 / -1 !important;grid-row:auto !important;}}' +
              '@media (max-width:767px){.mf-flexgrid-item{grid-column:var(--lg-x,1)/span var(--lg-w,12) !important;grid-row:var(--lg-y,auto)/span var(--lg-h,1) !important;}}' +
            '</style>',
            '</head><body>',
            '<div id="mf-mount"></div>',
            '<script>', renderInit, '<\/script>',
            '<script src="' + origin + assetBase + '/js/megaform-renderer.js?v=20260609-B107"><\/script>',
            '<script>', bootstrap, '<\/script>',
            '</body></html>'
        ];
        return parts.join('');
    }

    function mountThemePreviewFrame(): void {
        const dropzone = document.getElementById('mf-canvas-dropzone');
        if (!dropzone) return;

        // ── [B50 Author C — edge case #6, tab race] ──
        // activate → deactivate → activate fired in quick succession can
        // leave a half-torn frame attached. Force a full tear before each
        // mount so we never inherit stale state. unmountThemePreviewFrame
        // is itself idempotent so this is cheap when there's nothing to
        // remove.
        unmountThemePreviewFrame();

        // ── [B50 Author C — edge case #3, enter→exit→enter] ──
        // Wipe any leftover placeholder + restore display on previously-
        // hidden builder children before re-hiding. Otherwise a 2nd entry
        // double-hides (saves prev-display='none') and unmount restores
        // the wrong value, leaving the canvas blank when user exits.
        clearThemePreviewPlaceholder();
        restoreBuilderChildrenFromHide(dropzone);

        const formId = resolveThemePreviewFormId();

        // Hide every direct child currently inside the dropzone so the
        // iframe is the only visible content. We tag each hidden node
        // with data-mf-builder-hidden="1" so the unmount step can
        // restore display:'' surgically (instead of blasting inline
        // styles off everything in the canvas).
        const kids = Array.prototype.slice.call(dropzone.children) as HTMLElement[];
        for (const kid of kids) {
            if (kid.classList && kid.classList.contains('mf-theme-preview-frame')) continue;
            if (kid.classList && kid.classList.contains('mf-theme-preview-placeholder')) continue;
            kid.setAttribute('data-mf-builder-hidden', '1');
            // Stash the previous inline display so we can restore it
            // even when the original was something exotic (e.g. 'flex').
            kid.setAttribute('data-mf-builder-prev-display', kid.style.display || '');
            kid.style.display = 'none';
        }

        if (false && !formId) {
            // ── [B50 Author C — edge case #1, unsaved form] ──
            // Brand-new draft, never saved. /xx?mfFormId=0 would 404 so
            // we never open the iframe at all — show the friendly Save-first
            // placeholder instead. Children remain hidden so the user sees
            // ONLY the placeholder while in theme mode, exactly as if the
            // iframe were there.
            showThemePreviewPlaceholder(
                'Save the form first to see the live preview here. ' +
                '(File → Save or Ctrl+S)',
                'unsaved'
            );
            return;
        }

        // ── [B50 Author C — edge case #5, unsaved schema changes] ──
        // Iframe will load the LAST SAVED schema. Warn the user via a
        // toast so they understand why what they see may differ from
        // their in-progress edits. Toast (not blocking) — they may
        // genuinely want to compare saved-vs-live theme.
        try {
            if (isSchemaDirtyForPreview()) {
                notifyPreviewToast(
                    'Unsaved changes — preview shows the last saved schema. ' +
                    'Click Save to refresh.'
                );
            }
        } catch (_e) { /* defensive */ }

        const frame = document.createElement('iframe');
        frame.className = 'mf-theme-preview-frame';
        frame.id = 'mf-builder-preview-frame';
        frame.setAttribute('title', 'MegaForm theme preview');
        frame.setAttribute('data-mf-theme-preview', '1');
        // The CSS in megaform-builder-ts.css sets width/height/border —
        // keep this attribute set anyway as a fallback for any UA that
        // ignores the stylesheet.
        (frame as any).frameBorder = '0';

        // ── [B50 Author C — edge case #2, iframe load failure] ──
        // The browser dispatches `error` on the iframe only for the
        // initial document fetch; navigation errors inside the iframe
        // (404 from /xx?mfFormId=N when the form id was just deleted)
        // hit `load` with about:blank-style empty body. We listen for
        // both and probe the loaded document — if it ended up empty or
        // declared an HTTP error in its <title>, swap in the error
        // placeholder. Stays defensive: any access exception (cross-
        // origin race during navigation) falls through silently.
        var loadTimeoutHandle: number | null = null;
        const onLoaded = function () {
            try {
                if (loadTimeoutHandle !== null) {
                    window.clearTimeout(loadTimeoutHandle);
                    loadTimeoutHandle = null;
                }
                const doc = frame.contentDocument;
                if (!doc) return; // cross-origin or still loading
                const bodyTxt = String((doc.body && doc.body.textContent || '')).trim();
                // Heuristic: truly empty body means the load resolved to
                // about:blank-equivalent (network failure under SPA chrome,
                // or the server returned an empty 404 page). The runtime
                // renderer ALWAYS injects the form wrapper, so a non-empty
                // body is a successful load. Title-text checks were too
                // eager — they false-positive on forms whose title text
                // legitimately contains 'error'.
                if (bodyTxt.length === 0) {
                    showThemePreviewLoadError();
                }
            } catch (_e) { /* defensive */ }
        };
        const onErrored = function () {
            if (loadTimeoutHandle !== null) {
                window.clearTimeout(loadTimeoutHandle);
                loadTimeoutHandle = null;
            }
            showThemePreviewLoadError();
        };
        try {
            frame.addEventListener('load', onLoaded);
            frame.addEventListener('error', onErrored);
            // Watchdog: 12s without a `load` event → assume the network is
            // dead and swap in the error placeholder. The runtime renderer
            // is usually well under 2s on a warm cache, so 12s is safe.
            loadTimeoutHandle = window.setTimeout(function () {
                loadTimeoutHandle = null;
                try {
                    // Only swap if no successful load already replaced it.
                    if (!hasThemePreviewPlaceholder()) {
                        showThemePreviewLoadError();
                    }
                } catch (_e2) { /* defensive */ }
            }, 12000);
        } catch (_e) { /* defensive */ }

        // [B52] srcdoc inline schema — no DNN page chrome.
        // Falls back to URL src only if srcdoc generation fails.
        try {
            frame.srcdoc = buildThemePreviewSrcdoc(formId);
        } catch (e) {
            try { console.warn('[mf-theme-preview] srcdoc build failed, falling back to URL src', e); } catch (_) {}
            frame.src = buildThemePreviewUrl(formId);
        }
        dropzone.appendChild(frame);
        (B.state as any)._themePreviewFrame = frame;
    }

    function unmountThemePreviewFrame(): void {
        const ref = (B.state as any)._themePreviewFrame as HTMLIFrameElement | null;
        if (ref && ref.parentNode) {
            try { ref.parentNode.removeChild(ref); } catch (_e) { /* defensive */ }
        }
        (B.state as any)._themePreviewFrame = null;

        // ── [B50 Author C] also dispose any orphan iframes that were
        // never tracked in state (defensive against double-mount races).
        const dropzone = document.getElementById('mf-canvas-dropzone');
        if (!dropzone) return;
        const orphans = dropzone.querySelectorAll<HTMLElement>(
            'iframe.mf-theme-preview-frame, iframe[data-mf-theme-preview="1"]'
        );
        orphans.forEach(function (el) {
            if (el.parentNode) try { el.parentNode.removeChild(el); } catch (_e) {}
        });

        // ── [B50 Author C] clear any placeholder we may have rendered
        // instead of the iframe (unsaved-form / error states).
        clearThemePreviewPlaceholder();

        // Un-hide everything we hid during mount. Restoring the saved
        // previous-display value means flex/grid/etc. containers come
        // back exactly as they were.
        restoreBuilderChildrenFromHide(dropzone);
    }

    /**
     * Restore display on every node we tagged with data-mf-builder-hidden.
     * Extracted so both unmount AND the edge-case re-entry guard can call
     * it without code duplication. Idempotent.
     */
    function restoreBuilderChildrenFromHide(dropzone: HTMLElement): void {
        const hidden = dropzone.querySelectorAll<HTMLElement>('[data-mf-builder-hidden="1"]');
        hidden.forEach(el => {
            const prev = el.getAttribute('data-mf-builder-prev-display') || '';
            el.style.display = prev;
            el.removeAttribute('data-mf-builder-hidden');
            el.removeAttribute('data-mf-builder-prev-display');
        });
    }

    // =========================================================
    //  [B50 Author C] Theme-preview edge-case helpers
    //  ---------------------------------------------------------
    //  Covers the 7 defensive paths around mountThemePreviewFrame:
    //    #1 Unsaved form (formId === 0/null) → placeholder
    //    #2 Iframe load failure (404/network) → placeholder
    //    #3 Enter→Exit→Enter cycles → idempotent teardown
    //    #4 Long forms → handled by CSS (min-height + scrolling=yes)
    //    #5 Unsaved schema changes → toast (not blocking)
    //    #6 Tab race (activate→deactivate quickly) → idempotent
    //    #7 Refresh button overlay → click handler dispatches refresh
    // =========================================================

    /** Did the user edit the schema since the last save? Best-effort heuristic. */
    function isSchemaDirtyForPreview(): boolean {
        try {
            return !!(B.state && (B.state as any).isDirty);
        } catch (_e) { return false; }
    }

    /** Lightweight HTML escape used by the placeholder messages. */
    function escapeHtmlForPreview(s: string): string {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /**
     * Show the friendly placeholder inside #mf-canvas-dropzone. Idempotent —
     * a second call updates the message instead of stacking placeholders.
     * The mountThemePreviewFrame() path calls this directly for the
     * unsaved-form case; iframe error handlers call it for load failure.
     *
     * kind = 'unsaved' | 'error' | 'info' — drives the icon glyph.
     */
    function showThemePreviewPlaceholder(message: string, kind?: string): HTMLElement | null {
        const dropzone = document.getElementById('mf-canvas-dropzone');
        if (!dropzone) return null;

        const k = String(kind || 'info').toLowerCase();
        const icon =
            k === 'unsaved' ? 'fa-floppy-disk'
          : k === 'error'   ? 'fa-triangle-exclamation'
          :                   'fa-pen-ruler';

        // Dedupe — update existing rather than stacking.
        const existing = dropzone.querySelector<HTMLElement>('.mf-theme-preview-placeholder');
        if (existing) {
            existing.setAttribute('data-mf-kind', k);
            const msgEl = existing.querySelector<HTMLElement>('.mf-theme-preview-msg');
            if (msgEl) msgEl.innerHTML = escapeHtmlForPreview(message);
            const iconEl = existing.querySelector<HTMLElement>('.mf-theme-preview-icon i');
            if (iconEl) iconEl.className = 'fas ' + icon;
            return existing;
        }

        const ph = document.createElement('div');
        ph.className = 'mf-theme-preview-placeholder';
        ph.setAttribute('data-mf-kind', k);
        ph.setAttribute('data-mf-author', 'C-B50');
        ph.innerHTML =
            '<div class="mf-theme-preview-icon"><i class="fas ' + icon + '"></i></div>' +
            '<div class="mf-theme-preview-msg">' + escapeHtmlForPreview(message) + '</div>' +
            '<button type="button" class="mf-theme-preview-refresh" ' +
                    'title="Refresh preview"><i class="fas fa-rotate-right"></i> Refresh</button>';

        // Edge case #7 — refresh button overlay
        try {
            const btn = ph.querySelector('.mf-theme-preview-refresh') as HTMLElement | null;
            if (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault(); e.stopPropagation();
                    requestThemePreviewRefresh();
                });
            }
        } catch (_e) { /* defensive */ }

        dropzone.appendChild(ph);
        return ph;
    }

    function hasThemePreviewPlaceholder(): boolean {
        const dropzone = document.getElementById('mf-canvas-dropzone');
        return !!(dropzone && dropzone.querySelector('.mf-theme-preview-placeholder'));
    }

    function clearThemePreviewPlaceholder(): void {
        const dropzone = document.getElementById('mf-canvas-dropzone');
        if (!dropzone) return;
        const nodes = dropzone.querySelectorAll('.mf-theme-preview-placeholder');
        nodes.forEach(function (n) {
            if (n.parentNode) try { n.parentNode.removeChild(n); } catch (_e) {}
        });
    }

    /** Edge case #2/#7 — force a fresh remount of the iframe. */
    function requestThemePreviewRefresh(): void {
        try {
            // Drop the placeholder first so the mount path isn't shadowed.
            clearThemePreviewPlaceholder();
            // Only remount if we're still in theme mode — otherwise the
            // user already left the tab and we'd be force-entering a stale
            // mode.
            if (document.body.classList.contains('state-theme-mode')) {
                mountThemePreviewFrame();
            }
            window.dispatchEvent(new CustomEvent('mf:theme-preview-refresh'));
        } catch (_e) { /* defensive */ }
    }

    /** Toast helper that prefers B.showToast and falls back to console. */
    function notifyPreviewToast(msg: string): void {
        try {
            if (B && (B as any).showToast) {
                (B as any).showToast(msg, 'warning');
                return;
            }
        } catch (_e) { /* defensive */ }
        try { console.warn('[ThemePreview]', msg); } catch (_e2) {}
    }

    /** Edge case #2 — public hook the iframe `onerror`/`load`-empty handler calls. */
    function showThemePreviewLoadError(): void {
        // Detach the iframe before swapping in the placeholder so the
        // dropzone has room. Use a soft removal — the previously-hidden
        // builder children stay hidden so the placeholder is the only
        // visible content (matches the unsaved-form behavior).
        const ref = (B.state as any)._themePreviewFrame as HTMLIFrameElement | null;
        if (ref && ref.parentNode) {
            try { ref.parentNode.removeChild(ref); } catch (_e) { /* defensive */ }
        }
        (B.state as any)._themePreviewFrame = null;
        const dropzone = document.getElementById('mf-canvas-dropzone');
        if (dropzone) restoreBuilderChildrenFromHide(dropzone);
        clearThemePreviewPlaceholder();
    }

    // Expose the public surface so other modules can hook in without
    // import cycles. All entries are idempotent.
    try {
        (window as any).MFCanvasThemePreview = {
            mount:            mountThemePreviewFrame,
            unmount:          unmountThemePreviewFrame,
            showPlaceholder:  showThemePreviewPlaceholder,
            clearPlaceholder: clearThemePreviewPlaceholder,
            hasPlaceholder:   hasThemePreviewPlaceholder,
            showLoadError:    showThemePreviewLoadError,
            requestRefresh:   requestThemePreviewRefresh,
            isDirty:          isSchemaDirtyForPreview,
            badge:            'CanvasThemePreview v20260602-B50'
        };
    } catch (_e) { /* SSR — ignore */ }

    // External load-error hook — Author B's theme-tab-adapter can fire
    // this when its own probe (CSS bridge handshake) detects a dead
    // iframe.
    try {
        window.addEventListener('mf:theme-preview-load-error', function () {
            showThemePreviewLoadError();
        } as EventListener);
    } catch (_e) { /* defensive */ }

    /** Map a MegaForm field type → right-rail Theme panel anchor key. */
    function themeAnchorForType(type: string): string {
        const t = String(type || '').toLowerCase();
        if (t === 'submit' || t === 'button') return 'button';
        if (t === 'radio' || t === 'checkbox' || t === 'select' || t === 'imagechoice' || t === 'rating' || t === 'ratingsuite') return 'choice';
        if (t === 'date' || t === 'datetime' || t === 'time' || t === 'appointment') return 'date';
        if (t === 'phone' || t === 'phonepro') return 'phone';
        if (t === 'textarea' || t === 'richtext') return 'textarea';
        if (t === 'section' || t === 'html' || t === 'row' || t === 'flexgrid') return 'section';
        // Email / Number / Text / Url / File / etc. all style as <input>.
        return 'input';
    }

    /** Find the best-matching Theme panel section for an anchor key. */
    function findThemePanelSection(anchor: string): HTMLElement | null {
        // Preferred: explicit data attribute Author B wires up.
        let el = document.querySelector<HTMLElement>(
            `#mf-tab-theme [data-mf-theme-anchor="${anchor}"]`
        );
        if (el) return el;
        // Forward-compat fallback while Author B is still wiring anchors:
        // try common section headings inside the THEME tab.
        const FALLBACK_LABELS: Record<string, string[]> = {
            'input':    ['input', 'text field', 'fields'],
            'button':   ['button', 'submit'],
            'choice':   ['choice', 'radio', 'checkbox', 'select'],
            'date':     ['date', 'time'],
            'phone':    ['phone'],
            'textarea': ['textarea', 'multi-line'],
            'section':  ['section', 'layout', 'spacing'],
            'form':     ['form', 'background', 'page']
        };
        const labels = FALLBACK_LABELS[anchor] || [anchor];
        const themeRoot = document.getElementById('mf-tab-theme');
        if (!themeRoot) return null;
        const headings = themeRoot.querySelectorAll<HTMLElement>('h1,h2,h3,h4,.td-section-title,.mf-prop-group-title,legend');
        for (const h of Array.prototype.slice.call(headings) as HTMLElement[]) {
            const txt = (h.textContent || '').trim().toLowerCase();
            if (!txt) continue;
            for (const lbl of labels) {
                if (txt.indexOf(lbl) >= 0) {
                    return (h.closest('.td-section, .mf-prop-group, fieldset, section') as HTMLElement) || h;
                }
            }
        }
        return null;
    }

    /** Scroll a panel section into view and yellow-flash for 400ms. */
    function flashThemeSection(section: HTMLElement): void {
        try {
            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_e) {
            section.scrollIntoView();
        }
        section.classList.add('mf-theme-flash');
        window.setTimeout(() => section.classList.remove('mf-theme-flash'), 420);
    }

    /**
     * Public hook used by the click handlers in renderFieldOnCanvas /
     * renderRowOnCanvas / renderFlexGridOnCanvas / row-field clicks.
     * Returns TRUE when theme-mode handled the click and the caller MUST
     * abort its default selectField() path; FALSE otherwise.
     */
    function handleThemeModeClick(field: any): boolean {
        if (!document.body.classList.contains('state-theme-mode')) return false;
        if (!field) return true; // theme mode active but no field — swallow click
        const anchor = themeAnchorForType(field.type);
        const section = findThemePanelSection(anchor);
        if (section) flashThemeSection(section);
        return true;
    }

    /** Canonical list of widget plugin filenames (under Assets/js/plugins/). */
    const WIDGET_PLUGIN_FILES = [
        'megaform-widget-appointment.js',
        'megaform-widget-advanced-file.js',
        'megaform-widget-calculator.js',
        'megaform-widget-captcha.js',
        'megaform-widget-content-slider.js',
        'megaform-widget-data-repeater.js',
        'megaform-widget-draw-on-image.js',
        'megaform-widget-geolocation.js',
        // [2026-07-01] megaform-widget-golf-scorecard.js removed from palette force-load — Golf Scorecard retired from the Widgets palette.
        'megaform-widget-grid-repeater.js',
        'megaform-widget-image-choice.js',
        // [2026-06-15] megaform-widget-infinite-list.js removed — InfiniteList retired.
        'megaform-widget-payment-unified.js',
        'megaform-widget-paypal.js',
        'megaform-widget-pdf-form.js',
        // [2026-06-15] megaform-widget-phone-pro.js removed — Phone Pro retired; use Composite Phone.
        'megaform-widget-qrcode.js',
        'megaform-widget-rating-suite.js',
        'megaform-widget-dynamic-label.js',
        // [2026-06-15] megaform-widget-repeater.js removed — Repeater (Repeating List) retired; use Grid Repeater.
        'megaform-widget-rich-text.js',
        'megaform-widget-signature.js',
        'megaform-widget-stripe.js',
        // [v20260530-15] megaform-widget-subform.js removed — retired widget.
        'megaform-widget-video-embed.js',
        // [Map B42] OSM-backed Map widget; CSS inlined in render() like QRCode.
        'megaform-widget-map.js'
    ];
    const WIDGET_PLUGIN_CACHE_BUST = '20260617-15';

    /**
     * Inject any plugin <script> tags missing from the page. Cheap idempotent
     * check on document.scripts; new tags load asynchronously and self-register
     * via window.MegaFormWidgets.register, so the palette retry loop in
     * initPaletteTabs picks them up automatically once they execute.
     */
    function ensureAllPluginsLoaded(): void {
        // Runtime-visible badge — survives esbuild minification so we can
        // verify the deployed bundle actually contains this version. Check
        // via `window.__MF_PLUGIN_PRELOAD_BADGE__` in the browser console.
        (window as any).__MF_PLUGIN_PRELOAD_BADGE__ = 'PluginPreload v20260525-01';
        const platform = (window as any).__MF_PLATFORM__ || {};
        let assetsBase: string = String(platform.assetsBaseUrl || platform.assetsBase || '');
        if (!assetsBase) {
            // Best-effort fallback: derive from any existing megaform script src.
            const scripts = Array.prototype.slice.call(document.scripts) as HTMLScriptElement[];
            for (const s of scripts) {
                const m = (s.src || '').match(/^(.*\/Assets\/)/i) || (s.src || '').match(/^(.*\/megaform\/)/i);
                if (m) { assetsBase = m[1]; break; }
            }
        }
        if (!assetsBase) assetsBase = '/DesktopModules/MegaForm/Assets/';
        if (!/\/$/.test(assetsBase)) assetsBase += '/';

        const existing = new Set<string>();
        const all = Array.prototype.slice.call(document.scripts) as HTMLScriptElement[];
        for (const s of all) {
            const src = (s.src || '').split('?')[0];
            const idx = src.lastIndexOf('/');
            if (idx >= 0) existing.add(src.substring(idx + 1).toLowerCase());
        }

        for (const file of WIDGET_PLUGIN_FILES) {
            if (existing.has(file.toLowerCase())) continue;
            const tag = document.createElement('script');
            tag.src = assetsBase + 'js/plugins/' + file + '?v=' + WIDGET_PLUGIN_CACHE_BUST;
            tag.async = false; // preserve registration order
            tag.dataset['mfPreload'] = '1';
            document.head.appendChild(tag);
        }
    }

    // =========================================================
    //  PALETTE TABS
    // =========================================================
    function initPaletteTabs(): void {
        const tabs = document.querySelectorAll<HTMLElement>('.mf-ptab');
        tabs.forEach(tab => {
            tab.addEventListener('click', function (this: HTMLElement, e: Event) {
                e.preventDefault();
                const cat = this.getAttribute('data-cat');
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                document.querySelectorAll<HTMLElement>('.mf-palette-cat').forEach(p => p.style.display = 'none');
                const target = document.getElementById('mf-pcat-' + cat);
                if (target) target.style.display = '';
            });
        });
        populatePluginPalette();

        // [PaletteRaceFix v20260506-05] Race-condition fix.
        // Old behaviour: cleared the timer the first time `count > 0`, so a NEW
        // form (where some plugin scripts arrive AFTER the first non-zero count)
        // was stuck at 2 widgets while a published-and-reopened form (where
        // every plugin had loaded by the time canvas init ran) showed all of
        // them. New behaviour: keep re-populating until the count has been
        // stable for 5 consecutive checks (≈750 ms) — covers slow plugin loads
        // without blocking forever.
        let _paletteRetries = 0;
        let _paletteLastCount = -1;
        let _paletteStableTicks = 0;
        const MAX_TICKS = 80; // 80 × 150 ms = 12 s hard cap
        // [PaletteDeterminism v20260701-01] Widget plugin <script>s load async & independently
        // (separate js/plugins/*.js files force-injected by ensureAllPluginsLoaded). The old
        // "settle after 5 stable ticks (~750ms)" exit could fire BEFORE a slow-loading plugin
        // registered, so the palette showed a DIFFERENT SUBSET (and therefore different sorted
        // order) on each reload. Fix: repaint on every count change AND keep polling to the hard
        // cap so the FINAL paint always contains every registered plugin — deterministic & complete
        // every load. Order is already stable via the localeCompare sort in populatePluginPalette().
        const _paletteTimer = setInterval(() => {
            _paletteRetries++;
            if (typeof MegaFormWidgets === 'undefined' || !MegaFormWidgets.getAllPlugins) {
                if (_paletteRetries > MAX_TICKS) clearInterval(_paletteTimer);
                return;
            }
            const p = MegaFormWidgets.getAllPlugins();
            const count = Object.keys(p).filter(k => k !== 'StripePayment' && k !== 'PayPalPayment').length;
            if (count !== _paletteLastCount) {
                _paletteLastCount = count;
                _paletteStableTicks = 0;
                if (count > 0) populatePluginPalette();
            } else {
                _paletteStableTicks++;
            }
            // Only STOP at the hard cap. By then every force-loaded plugin script has executed,
            // so the last paint is complete. Do NOT clear early on stability (that caused the
            // missing-widget / shifting-order flakiness).
            if (_paletteRetries > MAX_TICKS) {
                clearInterval(_paletteTimer);
                if (count > 0) populatePluginPalette();
            }
        }, 150);
    }

    // ─────────────────────────────────────────────────────────
    //  BUG #1 FIX: Normalize plugin icon class
    //  Plugins store meta.icon as "fa-calendar-check" (no prefix)
    //  but Font Awesome 6 requires "fas fa-calendar-check".
    //  Rule: if value starts with "fa-" → prepend "fas ".
    //        if value already starts with "fas/far/fab " → use as-is.
    //        otherwise → fall through as-is (custom class).
    // ─────────────────────────────────────────────────────────
    function normalizeIcon(raw: string): string {
        if (!raw) return 'fas fa-puzzle-piece';
        if (/^fa[brs]\s/.test(raw)) return raw;      // already has prefix
        if (/^fa-/.test(raw))       return 'fas ' + raw; // missing prefix
        return raw;                                    // unknown format, pass through
    }

    function populatePluginPalette(): void {
        if (typeof MegaFormWidgets === 'undefined' || !MegaFormWidgets.getAllPlugins) return;
        const plugins = MegaFormWidgets.getAllPlugins();
        const hiddenLegacyTypes = new Set(['StripePayment', 'PayPalPayment', 'Likert', 'NPS', 'GolfScorecard']);
        const preferredOrder = ['Payment'];
        const keys = Object.keys(plugins)
            .filter(typeName => !hiddenLegacyTypes.has(typeName))
            .sort((a, b) => {
                const ai = preferredOrder.indexOf(a);
                const bi = preferredOrder.indexOf(b);
                if (ai !== -1 || bi !== -1) {
                    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                }
                return a.localeCompare(b);
            });
        if (keys.length === 0) return;

        // Show plugins tab
        const tabBtn = document.getElementById('mf-ptab-plugins');
        if (tabBtn) tabBtn.style.display = '';

        const container = document.getElementById('mf-plugin-palette');
        if (!container) return;
        container.innerHTML = '';

        keys.forEach(typeName => {
            const plugin = plugins[typeName];
            const meta   = plugin.meta || {};
            const isUnifiedPayment = typeName === 'Payment';

            // FIX #1: normalize icon so every palette item gets a visible icon
            const icon  = normalizeIcon(isUnifiedPayment ? 'fa-credit-card' : meta.icon);
            const label = B.getLocalizedControlLabel ? B.getLocalizedControlLabel(typeName, isUnifiedPayment ? 'Payment' : (meta.label || typeName)) : (isUnifiedPayment ? 'Payment' : (meta.label || typeName));

            // Register in fieldTypes so createFieldFromTemplate works
            if (!B.fieldTypes[typeName]) {
                B.fieldTypes[typeName] = {
                    icon: icon.replace(/^fa[brs]\s/, ''),
                    label,
                    hasOptions: false
                };
            }

            // Plugin color: use meta.color or cycle through palette.
            // [B83b-LeftPaletteWidgetsParity] Curated per-widget color map to match
            // mock's vivid hue per widget type. Falls back to meta.color, then to a
            // deterministic cycle over the palette for unknowns.
            const widgetColorMap: Record<string, string> = {
                Payment: '#10b981',           // emerald — mock Payment
                FileUpload: '#2563eb',        // blue — mock File Upload
                Signature: '#9333ea',         // purple — mock Signature (Pro)
                Rating: '#d97706',            // amber — mock Rating
                ImageChoice: '#db2777',       // pink — mock Image Choice
                Address: '#dc2626',           // red — mock Address
                // [2026-06-15] PhoneNumberPro/PhonePro retired; use Composite Phone.
                DateTime: '#ea580c',          // orange — mock Date & Time
                DateTimePicker: '#ea580c',
                Html: '#475569',              // slate — mock HTML Block
                HtmlBlock: '#475569',
                RichText: '#4f46e5',          // indigo — mock Rich Text
                Webhook: '#0891b2',           // cyan — mock Webhook (Advanced)
                Custom: '#7c3aed',            // violet — mock Custom Widget
                CustomWidget: '#7c3aed',
                // Production-specific widgets not in mock — assigned distinct hues
                Appointment: '#0ea5e9',       // sky
                Calculator: '#0f766e',        // teal-700
                Captcha: '#6366f1',           // indigo-500
                ContentSlider: '#f59e0b',     // amber-500
                DataGrid: '#7c3aed',          // violet
                DataRepeater: '#0ea5e9',      // sky
                DrawOnImage: '#ec4899',       // pink
                DynamicLabel: '#8b5cf6',      // violet-400
                Geolocation: '#ef4444',       // red-500
                GolfScorecard: '#16a34a',     // green-600
                GridRepeater: '#0891b2',      // cyan
                Map: '#dc2626',               // red-600
                MultiColumnCombo: '#06b6d4',  // cyan-500
                QRCode: '#475569',            // slate
                Razor: '#7c3aed',             // violet
                TermsPrivacy: '#0ea5e9',      // sky
                UserTemplate: '#9333ea',      // purple
                Video: '#ef4444',             // red
            };
            const cyclePalette = ['#3498db','#2ecc71','#9b59b6','#f39c12','#1abc9c','#e67e22','#e91e63','#00bcd4','#ff5722','#607d8b','#8bc34a','#e74c3c'];
            const pluginColor = isUnifiedPayment
                ? widgetColorMap.Payment
                : (widgetColorMap[typeName] || (meta as any).color || cyclePalette[keys.indexOf(typeName) % cyclePalette.length]);
            // 6-digit hex → append "1a" (~10% alpha) for the tinted chip background;
            // non-hex colors fall back to a plain light slate-100.
            const tileBg = /^#[0-9a-fA-F]{6}$/.test(pluginColor) ? (pluginColor + '1a') : '#f1f5f9';
            const tileVars = `--mf-tile-bg:${tileBg};--mf-tile-fg:${pluginColor}`;

            // Badge support — mock shows Pro / Advanced / Custom corner pills on
            // some widgets. Read optional plugin.meta.badge ('Pro'|'Advanced'|'Custom').
            const badgeText = (meta as any).badge || ((widgetColorMap as any).__badges ? (widgetColorMap as any).__badges[typeName] : '') ||
                (typeName === 'Signature' || typeName === 'Payment' || typeName === 'Razor' ? 'Pro' :
                 typeName === 'Webhook' || typeName === 'DataGrid' || typeName === 'DataRepeater' ? 'Advanced' :
                 typeName === 'Custom' || typeName === 'CustomWidget' || typeName === 'UserTemplate' ? 'Custom' : '');
            const badgeHtml = badgeText ? `<span class="mf-pi-badge mf-pi-badge-${badgeText.toLowerCase()}">${badgeText}</span>` : '';

            const item = document.createElement('div');
            item.className = 'mf-palette-item' + (isUnifiedPayment ? ' mf-palette-item-payment' : '');
            item.setAttribute('data-type', typeName);
            item.setAttribute('style', tileVars);
            item.setAttribute('title', label);
            item.setAttribute('aria-label', label);
            item.setAttribute('data-builder-label-badge', LABEL_RULE_BADGE);
            item.innerHTML = isUnifiedPayment
                // FIX: show only brand icons (no text) so badges fit inside the compact 2-col palette card
                ? `${badgeHtml}<span class="mf-pi-icon"><i class="${icon}"></i></span><span class="mf-pi-label">${label}</span><span class="mf-pi-badges"><i class="fab fa-stripe-s mf-pi-b-stripe" title="Stripe"></i><i class="fab fa-paypal mf-pi-b-paypal" title="PayPal"></i></span>`
                : `${badgeHtml}<span class="mf-pi-icon"><i class="${icon}"></i></span><span class="mf-pi-label">${label}</span>`;

            item.addEventListener('click', () => {
                if (_paletteDragging) return;
                const template: any = { type: typeName, label };
                if ((meta as any).defaultWidth) template.width = String((meta as any).defaultWidth || '100%');
                if ((meta as any).defaultCssClass) template.cssClass = String((meta as any).defaultCssClass || '');
                if (isUnifiedPayment) {
                    template.required = true;
                    template.widgetProps = {
                        provider: 'both',
                        requiredPaid: true,
                        title: 'Complete payment',
                        description: 'Pay securely by card or PayPal to finish your submission.',
                        amountLabel: 'Amount due',
                        payLabel: 'Pay by card',
                        accentColor: '#4f46e5'
                    };
                }
                const newField = B.createFieldFromTemplate(template);
                B.state.schema.fields.push(newField);
                B.state.isDirty = true;
                B.state.selectedFieldIndex = B.state.schema.fields.length - 1;
                if (B.syncSchemaToHtmlImmediate) {
                    B.syncSchemaToHtmlImmediate(buildCustomHtmlInsertOptions('palette-click-add', newField, B.state.schema.fields.length - 1));
                }
                render();
                B.callModule('properties', 'showProps', [newField]);
            });

            container.appendChild(item);
        });
    }

    // =========================================================
    //  PALETTE — Click to add
    // =========================================================
    function initPaletteClick(): void {
        document.querySelectorAll<HTMLElement>('.mf-palette-item').forEach(item => {
            item.addEventListener('click', function (this: HTMLElement) {
                if (_paletteDragging) return;
                const type = this.getAttribute('data-type');
                if (type && B.fieldTypes[type]) {
                    const newField = B.createFieldFromTemplate({ type, label: B.fieldTypes[type].label });
                    B.state.schema.fields.push(newField);
                    B.state.isDirty = true;
                    B.state.selectedFieldIndex = B.state.schema.fields.length - 1;
                    if (B.syncSchemaToHtmlImmediate) {
                        B.syncSchemaToHtmlImmediate(buildCustomHtmlInsertOptions('palette-click-add', newField, B.state.schema.fields.length - 1));
                    }
                    render();
                    B.callModule('properties', 'showProps', [newField]);
                }
            });
        });
    }

    // =========================================================
    //  CANVAS — sync index attributes after Sortable reorder
    // =========================================================
    function syncCanvasIndexes(canvas: HTMLElement): void {
        // Chỉ cập nhật top-level canvas items (không lấy .mf-row-field bên trong Row)
        // Bug cũ: querySelectorAll('.mf-canvas-field') lấy cả .mf-row-field vào
        // → các field sau Row bị gán index sai → click field A hiện data của field B
        canvas.querySelectorAll<HTMLElement>(':scope > .mf-canvas-item').forEach((el, i) => {
            el.setAttribute('data-index', String(i));
            const dupBtn = el.querySelector<HTMLElement>(':scope > .mf-duplicate-field, .mf-canvas-field-actions .mf-duplicate-field');
            const delBtn = el.querySelector<HTMLElement>(':scope > .mf-delete-field, .mf-canvas-field-actions .mf-delete-field');
            const editBtn = el.querySelector<HTMLElement>(':scope > .mf-edit-field, .mf-canvas-field-actions .mf-edit-field');
            if (dupBtn) dupBtn.setAttribute('data-index', String(i));
            if (delBtn) delBtn.setAttribute('data-index', String(i));
            if (editBtn) editBtn.setAttribute('data-index', String(i));
            el.classList.toggle('mf-selected', i === B.state.selectedFieldIndex);
        });
    }

    function getEvtIndex(evt: any, which: 'old' | 'new'): number {
        const keyPreferred = which === 'old' ? 'oldDraggableIndex' : 'newDraggableIndex';
        const keyFallback = which === 'old' ? 'oldIndex' : 'newIndex';
        const preferred = evt && typeof evt[keyPreferred] === 'number' ? evt[keyPreferred] : -1;
        if (preferred >= 0) return preferred;
        const fallback = evt && typeof evt[keyFallback] === 'number' ? evt[keyFallback] : -1;
        return fallback >= 0 ? fallback : 0;
    }

    function getCanvasInsertIndexFromDom(container: HTMLElement, item: HTMLElement | null): number {
        if (!container || !item) return 0;
        let index = 0;
        const children = Array.prototype.slice.call(container.children) as HTMLElement[];
        for (const child of children) {
            if (child === item) break;
            if (child.classList && child.classList.contains('mf-canvas-item')) index++;
        }
        return index;
    }

    function getCanvasNewIndex(evt: any, container: HTMLElement): number {
        const item = evt && evt.item ? evt.item as HTMLElement : null;
        if (item && item.parentElement === container) return getCanvasInsertIndexFromDom(container, item);
        return getEvtIndex(evt, 'new');
    }

    function canInjectTokenForField(field: any): boolean {
        if (!field) return false;
        const type = String(field.type || '');
        return !!field.key && type !== 'Section' && type !== 'Html' && type !== 'Hidden';
    }

    function buildCustomHtmlInsertOptions(reason: string, field: any, topLevelIndex: number): any {
        const options: any = { reason };
        if (!field || !field.key) return options;
        options.insertKey = String(field.key || '');
        const list = (B.state && B.state.schema && Array.isArray(B.state.schema.fields)) ? B.state.schema.fields : [];
        if (!list.length) return options;

        for (let i = topLevelIndex - 1; i >= 0; i--) {
            const prev = list[i];
            if (!canInjectTokenForField(prev)) continue;
            if (String(prev.key || '') === options.insertKey) continue;
            options.insertAfterKey = String(prev.key || '');
            return options;
        }

        for (let i = topLevelIndex + 1; i < list.length; i++) {
            const next = list[i];
            if (!canInjectTokenForField(next)) continue;
            if (String(next.key || '') === options.insertKey) continue;
            options.insertBeforeKey = String(next.key || '');
            return options;
        }

        return options;
    }

    function isInsideRowColumns(evt: any): boolean {
        const related = evt && evt.related ? evt.related as HTMLElement : null;
        const target = evt && evt.originalEvent && evt.originalEvent.target
            ? evt.originalEvent.target as HTMLElement
            : null;
        const toEl = evt && evt.to ? evt.to as HTMLElement : null;
        const nodes = [related, target, toEl];
        for (const node of nodes) {
            if (!node) continue;
            if (node.classList && node.classList.contains('mf-row-col')) return true;
            if (node.classList && node.classList.contains('mf-row-field')) return true;
            if (typeof node.closest === 'function') {
                if (node.closest('.mf-row-col')) return true;
                if (node.closest('.mf-row-field')) return true;
            }
        }
        return false;
    }

    // =========================================================
    //  PALETTE SEARCH
    // =========================================================
    function initPaletteSearch(): void {
        const input = B.el(B.EL.fieldSearch) as HTMLInputElement | null;
        if (!input) return;
        input.addEventListener('input', function (this: HTMLInputElement) {
            const q = this.value.toLowerCase();
            document.querySelectorAll<HTMLElement>('.mf-palette-item').forEach(item => {
                item.style.display = item.textContent!.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
            });
        });
    }

    // =========================================================
    //  PALETTE DRAG
    // =========================================================
    let paletteSortables: any[] = [];
    let _paletteDragging = false;
    let _paletteDragEndTimer = 0;
    let _builderDragCleanupBound = false;

    function countSchemaFields(fields: any[]): number {
        if (!Array.isArray(fields)) return 0;
        let total = 0;
        fields.forEach((field: any) => {
            if (!field) return;
            total++;
            if (field.type === 'Row' && Array.isArray(field.columns)) {
                field.columns.forEach((col: any) => {
                    total += countSchemaFields(col && Array.isArray(col.fields) ? col.fields : []);
                });
            } else if (field.type === 'FlexGrid' && Array.isArray(field.items)) {
                total += field.items.filter((item: any) => item && item.field).length;
            }
        });
        return total;
    }

    function handlePalettePointerEnd(): void {
        if (_paletteDragging) finishPaletteDragging();
    }

    function setPaletteDragging(active: boolean): void {
        if (_paletteDragEndTimer) {
            window.clearTimeout(_paletteDragEndTimer);
            _paletteDragEndTimer = 0;
        }
        _paletteDragging = active;
        document.body.classList.toggle('mf-palette-dragging', active);
        document.getElementById('mf-canvas-dropzone')?.classList.toggle('mf-palette-dragging', active);
        setBuilderDragging(active);
        if (active) {
            document.addEventListener('mouseup', handlePalettePointerEnd, true);
            document.addEventListener('touchend', handlePalettePointerEnd, true);
            document.addEventListener('drop', handlePalettePointerEnd, true);
        } else {
            document.removeEventListener('mouseup', handlePalettePointerEnd, true);
            document.removeEventListener('touchend', handlePalettePointerEnd, true);
            document.removeEventListener('drop', handlePalettePointerEnd, true);
        }
    }

    function finishPaletteDragging(delay = 100): void {
        // Clear block-mode immediately so the post-drop render() shows full previews
        // (the palette-dragging dim-state still lifts on the small timer below).
        setBuilderDragging(false);
        if (_paletteDragEndTimer) window.clearTimeout(_paletteDragEndTimer);
        _paletteDragEndTimer = window.setTimeout(() => {
            _paletteDragEndTimer = 0;
            setPaletteDragging(false);
        }, delay);
    }

    function handleBuilderDragCleanup(): void {
        window.setTimeout(() => setBuilderDragging(false), 0);
    }

    // Track active drag state for Sortable ghost/cleanup only. The canvas no longer
    // collapses fields into title-only placeholders while dragging.
    function setBuilderDragging(active: boolean): void {
        document.body.classList.toggle('mf-builder-dragging', active);
        document.getElementById('mf-canvas-dropzone')?.classList.toggle('mf-builder-dragging', active);
        if (active && !_builderDragCleanupBound) {
            _builderDragCleanupBound = true;
            document.addEventListener('mouseup', handleBuilderDragCleanup, true);
            document.addEventListener('touchend', handleBuilderDragCleanup, true);
            document.addEventListener('drop', handleBuilderDragCleanup, true);
            document.addEventListener('dragend', handleBuilderDragCleanup, true);
            window.addEventListener('blur', handleBuilderDragCleanup, true);
        } else if (!active && _builderDragCleanupBound) {
            _builderDragCleanupBound = false;
            document.removeEventListener('mouseup', handleBuilderDragCleanup, true);
            document.removeEventListener('touchend', handleBuilderDragCleanup, true);
            document.removeEventListener('drop', handleBuilderDragCleanup, true);
            document.removeEventListener('dragend', handleBuilderDragCleanup, true);
            window.removeEventListener('blur', handleBuilderDragCleanup, true);
        }
    }

    function isTopLevelCanvasDrag(el: HTMLElement | null): boolean {
        return !!el && el.classList.contains('mf-canvas-item') && !el.classList.contains('mf-row-field');
    }

    function getSortableCtor(): any {
        const bundledSortable = SortableModule as any;
        if (bundledSortable) return bundledSortable.default || bundledSortable;
        try {
            if (typeof Sortable !== 'undefined') return Sortable;
        } catch (_e) { /* fallback below */ }
        return (window as any).Sortable || null;
    }

    function getPaletteDropTarget(clientX: number, clientY: number): HTMLElement | null {
        const nodes = document.elementsFromPoint(clientX, clientY) as HTMLElement[];
        for (const node of nodes) {
            if (!node || typeof node.closest !== 'function') continue;
            if (node.closest('.sortable-fallback, .sortable-drag, .mf-palette-drag-fallback-ghost')) continue;
            const target = node.closest<HTMLElement>('.mf-row-col, .mf-flexgrid-canvas, #mf-canvas-fields, #mf-canvas-dropzone, .mf-form-wrapper');
            if (target) return target;
        }
        return null;
    }

    function addPaletteTypeAtDrop(type: string, clientX: number, clientY: number): boolean {
        if (!type || !B.fieldTypes[type]) return false;
        if (type === 'Row') return false;

        const target = getPaletteDropTarget(clientX, clientY);
        if (!target || target.closest('.mf-panel-left')) return false;

        const flexGrid = target.closest<HTMLElement>('.mf-flexgrid-canvas');
        if (flexGrid && typeof insertFlexGridItemAt === 'function') {
            const gridIndex = parseInt(flexGrid.getAttribute('data-grid-index') || '-1', 10);
            const gridField = B.state.schema.fields[gridIndex];
            const cfg = gridField && gridField.gridConfig || {};
            const cols = Number(cfg.cols) > 0 ? Number(cfg.cols) : 12;
            const rh = Number(cfg.rowHeight) > 0 ? Number(cfg.rowHeight) : 64;
            const gap = Number(cfg.gap) >= 0 ? Number(cfg.gap) : 12;
            const rect = flexGrid.getBoundingClientRect();
            const colPx = Math.max(8, (rect.width - (cols - 1) * gap) / cols);
            const snapX = Math.max(0, Math.min(cols - 1, Math.floor((clientX - rect.left) / (colPx + gap))));
            const snapY = Math.max(0, Math.floor((clientY - rect.top) / (rh + gap)));
            insertFlexGridItemAt(gridIndex, type, snapX, snapY);
            return true;
        }

        const rowCol = target.closest<HTMLElement>('.mf-row-col');
        if (rowCol) {
            const rowIndex = parseInt(rowCol.getAttribute('data-row-index') || '-1', 10);
            const colIndex = parseInt(rowCol.getAttribute('data-col-index') || '-1', 10);
            const row = B.state.schema.fields[rowIndex];
            if (!row || row.type !== 'Row' || !row.columns || !row.columns[colIndex]) return false;
            if (!row.columns[colIndex].fields) row.columns[colIndex].fields = [];
            const newField = B.createFieldFromTemplate({ type, label: B.fieldTypes[type].label });
            const insertAt = row.columns[colIndex].fields.length;
            row.columns[colIndex].fields.push(newField);
            B.state.selectedFieldIndex = -1;
            B.state._rowFieldRef = { rowIndex, colIndex, fieldIndex: insertAt };
            B.state.isDirty = true;
            if (B.syncSchemaToHtmlImmediate) {
                B.syncSchemaToHtmlImmediate(buildCustomHtmlInsertOptions('palette-fallback-row-drop', newField, rowIndex));
            }
            render();
            window.setTimeout(() => selectRowField(rowIndex, colIndex, insertAt), 0);
            return true;
        }

        if (target.closest('#mf-canvas-fields, #mf-canvas-dropzone, .mf-form-wrapper')) {
            const newField = B.createFieldFromTemplate({ type, label: B.fieldTypes[type].label });
            B.state.schema.fields.push(newField);
            B.state.selectedFieldIndex = B.state.schema.fields.length - 1;
            B.state._rowFieldRef = null;
            B.state.isDirty = true;
            if (B.syncSchemaToHtmlImmediate) {
                B.syncSchemaToHtmlImmediate(buildCustomHtmlInsertOptions('palette-fallback-canvas-drop', newField, B.state.schema.fields.length - 1));
            }
            render();
            B.callModule('properties', 'showProps', [newField]);
            return true;
        }

        return false;
    }

    function attachPalettePointerFallback(item: HTMLElement): void {
        if ((item as any).__mfPalettePointerFallback) return;
        (item as any).__mfPalettePointerFallback = true;

        item.addEventListener('pointerdown', (startEv: PointerEvent) => {
            if (startEv.button !== 0) return;
            const type = item.getAttribute('data-type') || '';
            if (!type || !B.fieldTypes[type]) return;

            const startX = startEv.clientX;
            const startY = startEv.clientY;
            const startTotal = countSchemaFields(B.state.schema.fields || []);
            let moved = false;
            let lastX = startX;
            let lastY = startY;
            let ghost: HTMLElement | null = null;

            const moveGhost = () => {
                if (!ghost) return;
                ghost.style.transform = `translate(${lastX + 12}px, ${lastY + 12}px)`;
            };
            const ensureGhost = () => {
                if (ghost) return;
                ghost = item.cloneNode(true) as HTMLElement;
                ghost.classList.add('mf-palette-drag-fallback-ghost');
                ghost.style.width = item.getBoundingClientRect().width + 'px';
                document.body.appendChild(ghost);
                moveGhost();
            };
            const cleanup = () => {
                document.removeEventListener('pointermove', onMove, true);
                document.removeEventListener('pointerup', onUp, true);
                document.removeEventListener('pointercancel', onCancel, true);
                if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
                ghost = null;
            };
            const onCancel = () => {
                cleanup();
                finishPaletteDragging();
            };
            const onMove = (moveEv: PointerEvent) => {
                lastX = moveEv.clientX;
                lastY = moveEv.clientY;
                if (!moved) {
                    const dx = lastX - startX;
                    const dy = lastY - startY;
                    moved = Math.sqrt(dx * dx + dy * dy) > 8;
                    if (moved) setPaletteDragging(true);
                }
                if (moved) {
                    if (document.querySelector('.sortable-fallback, .sortable-drag')) {
                        if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
                        ghost = null;
                    } else {
                        ensureGhost();
                        moveGhost();
                    }
                }
            };
            const onUp = (upEv: PointerEvent) => {
                lastX = upEv.clientX;
                lastY = upEv.clientY;
                cleanup();
                if (!moved) return;
                window.setTimeout(() => {
                    const currentTotal = countSchemaFields(B.state.schema.fields || []);
                    if (currentTotal === startTotal) addPaletteTypeAtDrop(type, lastX, lastY);
                    finishPaletteDragging();
                }, 160);
            };

            document.addEventListener('pointermove', onMove, true);
            document.addEventListener('pointerup', onUp, true);
            document.addEventListener('pointercancel', onCancel, true);
        });
    }

    function initPaletteDrag(): void {
        paletteSortables.forEach(s => { try { s.destroy(); } catch (e) {} });
        paletteSortables = [];

        document.querySelectorAll<HTMLElement>('.mf-field-palette').forEach(palette => {
            palette.querySelectorAll<HTMLElement>('.mf-palette-item').forEach(attachPalettePointerFallback);
            const SortableCtor = getSortableCtor();
            if (!SortableCtor) return;
            const s = new SortableCtor(palette, {
                group:     { name: 'mf-palette', pull: 'clone', put: false },
                sort:      false,
                draggable: '.mf-palette-item',
                ghostClass:'mf-sortable-ghost',
                animation: 150,
                forceFallback: true,
                fallbackOnBody: true,
                onStart:   () => { setPaletteDragging(true); },
                onEnd:     () => { finishPaletteDragging(); }
            });
            paletteSortables.push(s);
        });
    }

    // =========================================================
    //  RENDER CANVAS
    // =========================================================
    const ROW_LAYOUTS = [
        { label: '1',       cols: [12] },
        { label: '2',       cols: [6, 6] },
        { label: '3',       cols: [4, 4, 4] },
        { label: '2/3+1/3', cols: [8, 4] },
        { label: '1/3+2/3', cols: [4, 8] },
        { label: '4',       cols: [3, 3, 3, 3] },
        { label: '1/4+3/4', cols: [3, 9] },
        { label: '3/4+1/4', cols: [9, 3] }
    ];

    function render(): void {
        const container = B.el(B.EL.canvasFields) as HTMLElement | null;
        const emptyState = B.el(B.EL.emptyState) as HTMLElement | null;
        if (!container) return;

        const scrollTop = container.scrollTop;
        container.innerHTML = '';
        if ((B as any).syncFormActionEditorsFromSchema) (B as any).syncFormActionEditorsFromSchema();

        // Custom HTML indicator
        const s = B.state.schema.settings || {};
        const hasCustomHtml = !!(s.customHtml && s.customHtml.trim());

        if (hasCustomHtml) {
            if (B.syncSchemaToHtmlImmediate) {
                try { B.syncSchemaToHtmlImmediate({ reason: 'canvas-render', refreshEditors: false }); } catch (_syncErr) {}
            }
            // When HTML template is active: hide the dropzone placeholder entirely,
            // show only the purple indicator banner — no empty drop area visible.
            if (emptyState) emptyState.style.display = 'none';
            const dropzone = document.getElementById('mf-canvas-dropzone');
            if (dropzone) dropzone.style.minHeight = '0';

            const indicator = document.createElement('div');
            indicator.className = 'mf-custom-html-banner';
            // [2026-06-18] The banner now carries a dedicated "Edit HTML" button that opens the
            // rich HTML Designer popup directly (via the delegated [data-mf-open-html-designer]
            // handler in properties.ts). Clicking the banner BACKGROUND still opens Preview.
            indicator.innerHTML =
                '<span class="mf-chb-label"><i class="fas fa-code"></i> Custom HTML Active — live sync on</span>' +
                '<button type="button" class="mf-chb-edit" data-mf-open-html-designer ' +
                    'title="Open the HTML Designer (edit content tokens, images, layout)">' +
                    '<i class="fas fa-pen-to-square"></i> Edit HTML' +
                '</button>';
            indicator.addEventListener('click', (ev) => {
                // The Edit button is handled by the delegated capture-phase listener (which
                // stops propagation); this guard is belt-and-suspenders in case it isn't ready.
                const t = ev.target as HTMLElement;
                if (t && t.closest && t.closest('[data-mf-open-html-designer]')) return;
                B.callModule('toolbar', 'preview');
            });
            container.appendChild(indicator);
        } else {
            // Restore dropzone height when switching back
            const dropzone = document.getElementById('mf-canvas-dropzone');
            if (dropzone) dropzone.style.minHeight = '';
        }

        const isCanvasEmpty = B.state.schema.fields.length === 0;
        container.classList.toggle('mf-canvas-fields-empty', isCanvasEmpty && !hasCustomHtml);

        if (isCanvasEmpty) {
            if (!hasCustomHtml && emptyState) emptyState.style.display = '';
            container.scrollTop = scrollTop;
            initMainSortable(container);
            initRowSortables(container);
            initFlexGridSortables(container);
            B.callModule('properties', 'hideProps');
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        container.classList.remove('mf-canvas-fields-empty');

        // [2026-06-27 #2 Steps-in-builder] For a custom-shell WIZARD form, step membership
        // lives only in customHtml (the data-step panels) — invisible to this schema-driven
        // canvas. Parse it (prefix-agnostic, works for au/bg/ey/fi) and drop a "Step N · Title"
        // divider before the first field of each step, so the builder shows the wizard's pages.
        const wizardStepMap = hasCustomHtml ? fieldStepMap(String(s.customHtml || s.CustomHtml || '')) : {};
        const hasWizardSteps = Object.keys(wizardStepMap).length > 0;
        let lastStepOrdinal = -1;

        B.state.schema.fields.forEach((field: any, index: number) => {
            if (hasWizardSteps) {
                const step = wizardStepMap[String(field.key)];
                if (step && step.ordinal !== lastStepOrdinal) {
                    container.appendChild(makeStepDivider(step.ordinal, step.label));
                    lastStepOrdinal = step.ordinal;
                }
            }
            if (field.type === 'Row') {
                container.appendChild(renderRowOnCanvas(field, index));
            } else if (field.type === 'FlexGrid') {
                container.appendChild(renderFlexGridOnCanvas(field, index));
            } else {
                container.appendChild(renderFieldOnCanvas(field, index));
            }
        });

        container.scrollTop = scrollTop;
        initMainSortable(container);
        initRowSortables(container);
        initFlexGridSortables(container);
    }

    // ── Normal field card ──
    // ─── Compute which fields are logic SOURCE or TARGET from rules ───
    function getLogicMap(): { sources: Record<string,string[]>, targets: Record<string,string[]> } {
        const rules: any[] = (B.state.schema?.settings?.rules) || [];
        const sources: Record<string,string[]> = {};  // fieldKey → rule names[]
        const targets: Record<string,string[]> = {};  // fieldKey → rule names[]

        function collectNodes(node: any, ruleName: string) {
            if (!node) return;
            if (node.type === 'rule' && node.field) {
                if (!sources[node.field]) sources[node.field] = [];
                if (!sources[node.field].includes(ruleName)) sources[node.field].push(ruleName);
            }
            if (node.children) node.children.forEach((c: any) => collectNodes(c, ruleName));
        }

        rules.forEach(rule => {
            const rn = rule.name || rule.id;
            collectNodes(rule.when, rn);
            [...(rule.then || []), ...(rule.else || [])].forEach((a: any) => {
                if (a.target) {
                    if (!targets[a.target]) targets[a.target] = [];
                    if (!targets[a.target].includes(rn)) targets[a.target].push(rn);
                }
            });
        });
        return { sources, targets };
    }

    // [2026-06-27 #2] A read-only "Step N · Title" divider shown before each wizard step's
    // fields. NOT a .mf-canvas-item, so it is ignored by SortableJS draggable selection and
    // by the index math (syncCanvasIndexes / getCanvasInsertIndexFromDom count only
    // .mf-canvas-item) — it can't perturb reorder. Inline-styled (no CSS-build dependency).
    function makeStepDivider(ordinal: number, label: string): HTMLElement {
        const d = document.createElement('div');
        d.className = 'mf-canvas-step-divider';
        d.setAttribute('data-step-ordinal', String(ordinal));
        d.setAttribute('contenteditable', 'false');
        d.style.cssText = 'display:flex;align-items:center;gap:10px;margin:18px 2px 8px;user-select:none;pointer-events:none;';
        const safe = B.escHtml ? B.escHtml(String(label || '')) : String(label || '').replace(/[<>&]/g, '');
        d.innerHTML =
            '<span style="display:inline-flex;align-items:center;gap:7px;padding:4px 12px;border-radius:999px;' +
            'background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:700;font-size:11px;letter-spacing:.04em;white-space:nowrap;">' +
            '<i class="fas fa-layer-group" style="font-size:10px;"></i> STEP ' + ordinal + '</span>' +
            '<span style="font-weight:600;font-size:13px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safe + '</span>' +
            '<span style="flex:1;height:1px;background:linear-gradient(90deg,#e2e8f0,transparent);"></span>';
        return d;
    }

    function renderFieldOnCanvas(field: any, index: number): HTMLElement {
        const div = document.createElement('div');
        div.className = 'mf-canvas-item mf-canvas-field' + (index === B.state.selectedFieldIndex ? ' mf-selected' : '');
        div.setAttribute('data-index', String(index));
        div.setAttribute('data-type', field.type);
        div.setAttribute('data-key', field.key);

        // ── Page-break sections need distinct styling in the canvas ──
        const isPageBreak = field.type === 'Section' && !!field.properties?.pageBreak;
        if (isPageBreak) div.classList.add('mf-page-break-section');

        const ft = B.fieldTypes[field.type] || { icon: 'fa-question', label: field.type, color: '#64748b' };
        const chipFg = ft.color || '#64748b';
        const chipBg = /^#[0-9a-fA-F]{6}$/.test(chipFg) ? (chipFg + '1a') : '#f1f5f9';

        let html = '';

        // ── Hover-only field controls ─────────────────────────────
        html += '<span class="mf-drag-handle" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>';
        html += '<span class="mf-canvas-field-actions mf-field-actions-left">';
        // [HoverEditAction 20260617] Settings/edit action — opens the widget's drop-in
        // designer (for widget fields that have one) and selects the field so the right
        // rail Field Properties syncs. See openFieldSettings().
        html += `<button class="mf-canvas-action-btn mf-edit-field" data-index="${index}" title="Edit settings"><i class="fas fa-sliders-h"></i></button>`;
        html += `<button class="mf-canvas-action-btn mf-duplicate-field" data-index="${index}" title="Duplicate"><i class="far fa-copy"></i></button>`;
        html += `<button class="mf-canvas-action-btn mf-delete-field" data-index="${index}" title="Delete"><i class="fas fa-trash-alt"></i></button>`;
        html += '</span>';

        // ── Field body: icon chip + preview ───────────────────────
        // Canvas keeps full field previews in build mode; no title-only drag placeholder.
        html += '<div class="mf-field-body">';
        html += `<div class="mf-field-icon-chip" style="--chip-bg:${chipBg};--chip-fg:${chipFg}"><i class="fas ${ft.icon}"></i></div>`;
        html += '<div class="mf-field-content">';

        // ── Logic badges (JotForm-style) ──────────────────────────
        const lmap = getLogicMap();
        const isSource  = lmap.sources[field.key];   // field controls other fields
        const isTarget  = lmap.targets[field.key];   // field is shown/hidden by rules
        const hasShowIf = !!field.showIf;

        if (isSource && isSource.length) {
            const tip = `Controls: ${isSource.join(', ')}`;
            html += `<span class="mf-logic-badge mf-logic-source" title="${tip}" data-logic-key="${field.key}">` +
                    `<i class="fas fa-bolt"></i> ${isSource.length} rule${isSource.length>1?'s':''}</span>`;
        }
        if (isTarget && isTarget.length) {
            const tip = `Controlled by: ${isTarget.join(', ')}`;
            html += `<span class="mf-logic-badge mf-logic-target" title="${tip}" data-logic-key="${field.key}">` +
                    `<i class="fas fa-eye"></i> conditional</span>`;
        }
        if (hasShowIf && !isTarget) {
            html += `<span class="mf-logic-badge mf-logic-showif" title="Has show/hide condition"><i class="fas fa-code-branch"></i> show if</span>`;
        }

        html += renderFieldPreview(field);
        html += '</div></div>';
        div.innerHTML = html;
        attachInlineLabelEditor(div, function () { return B.state.schema.fields[index]; });

        // Click on logic badge → jump to Rules tab
        div.querySelectorAll && setTimeout(() => {
            div.querySelectorAll<HTMLElement>('.mf-logic-badge').forEach(badge => {
                badge.addEventListener('click', (e: MouseEvent) => {
                    e.stopPropagation();
                    // Activate Rules tab
                    document.querySelectorAll('.mf-right-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.mf-right-tab-content').forEach(t => (t as HTMLElement).style.display = 'none');
                    const ruleLink = document.getElementById('mf-tab-link-rules');
                    const ruleTab  = document.getElementById('mf-tab-rules');
                    if (ruleLink) ruleLink.classList.add('active');
                    if (ruleTab)  ruleTab.style.display = '';
                    // Reload rules panel
                    if (B.callModule) B.callModule('rule-builder-ui', 'refresh');
                });
            });
        }, 0);

        div.addEventListener('click', function (this: HTMLElement, e: MouseEvent) {
            if ((e.target as HTMLElement).closest('.mf-drag-handle')) return;
            const ci = parseInt(this.getAttribute('data-index')!);
            // [ThemeMode v20260602-B48] Intercept BEFORE select / dup / del so
            // hidden action buttons can't accidentally fire and so the click
            // jumps to the right-rail Theme section instead of selecting.
            if (handleThemeModeClick(B.state.schema.fields[ci])) return;
            if ((e.target as HTMLElement).closest('.mf-edit-field'))      { openFieldSettings(ci, this); return; }
            if ((e.target as HTMLElement).closest('.mf-duplicate-field')) { duplicateField(ci); return; }
            if ((e.target as HTMLElement).closest('.mf-delete-field'))    { deleteField(ci);    return; }
            selectField(ci);
        });

        return div;
    }

    // [HoverEditAction 20260617] Edit-icon click: select the field (so the right-rail
    // Field Properties syncs) AND, for widget fields that ship a unified Designer
    // launcher (Razor / DataGrid / DataRepeater / DynamicLabel / Map / Video / UserTemplate
    // — their buttons all carry a `*-launcher` class injected into the card), open that
    // drop-in designer. Plain fields just select. Defensive throughout.
    function openFieldSettings(index: number, cardEl?: HTMLElement | null): void {
        try { selectField(index); } catch (_e) { /* defensive */ }
        try {
            var card = (cardEl as HTMLElement) || document.querySelector('.mf-canvas-item[data-index="' + index + '"]') as HTMLElement | null;
            if (card) {
                var launcher = card.querySelector('button[class*="-launcher"]') as HTMLElement | null;
                if (launcher) { launcher.click(); return; }
            }
        } catch (_e) { /* defensive */ }
        // No widget designer — make sure the right rail shows this field's settings.
        try { if (B.callModule) B.callModule('properties', 'showProps', [B.state.schema.fields[index]]); } catch (_e) { /* defensive */ }
    }

    // ── Row container with columns ──
    function renderRowOnCanvas(field: any, index: number): HTMLElement {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'mf-canvas-item mf-canvas-row' + (index === B.state.selectedFieldIndex ? ' mf-selected' : '');
        rowDiv.setAttribute('data-index', String(index));
        rowDiv.setAttribute('data-type', 'Row');
        rowDiv.setAttribute('data-key', field.key);

        const header = document.createElement('div');
        header.className = 'mf-row-header';
        header.innerHTML =
            '<span class="mf-drag-handle" title="Drag row"><i class="fas fa-grip-vertical"></i></span>' +
            '<span class="mf-row-label"><i class="fas fa-columns"></i> Row</span>' +
            '<span class="mf-row-layout-picker"></span>' +
            '<span class="mf-canvas-field-actions">' +
            // [FlexGrid P6 v20260601-B21] Convert Row → FlexGrid migration
            `<button class="mf-canvas-action-btn mf-row-to-flexgrid" data-row-idx="${index}" title="Convert to Flex Grid (preserves layout)"><i class="fas fa-th"></i></button>` +
            `<button class="mf-canvas-action-btn mf-duplicate-field" data-index="${index}" title="Duplicate Row"><i class="far fa-copy"></i></button>` +
            `<button class="mf-canvas-action-btn mf-delete-field" data-index="${index}" title="Delete Row"><i class="fas fa-trash-alt"></i></button>` +
            '</span>';

        const picker = header.querySelector<HTMLElement>('.mf-row-layout-picker')!;
        ROW_LAYOUTS.forEach(layout => {
            const btn = document.createElement('button');
            btn.className = 'mf-row-layout-btn';
            btn.title = layout.label;
            let blocks = '';
            layout.cols.forEach(span => {
                const pct = Math.round(span / 12 * 100);
                blocks += `<span style="width:${pct}%;height:10px;background:#6366f1;border-radius:2px;opacity:.6;"></span>`;
            });
            btn.innerHTML = `<span style="display:flex;gap:1px;width:40px;">${blocks}</span>`;
            const currentSpans = field.columns.map((c: any) => c.span);
            if (JSON.stringify(currentSpans) === JSON.stringify(layout.cols)) btn.classList.add('active');
            btn.addEventListener('click', (e: Event) => { e.stopPropagation(); changeRowLayout(index, layout.cols); });
            picker.appendChild(btn);
        });

        rowDiv.appendChild(header);

        header.addEventListener('click', function (e: MouseEvent) {
            if ((e.target as HTMLElement).closest('.mf-drag-handle') || (e.target as HTMLElement).closest('.mf-row-layout-btn')) return;
            const ci = parseInt(rowDiv.getAttribute('data-index')!);
            // [ThemeMode v20260602-B48] Row → section anchor in Theme panel.
            if (handleThemeModeClick(B.state.schema.fields[ci])) return;
            if ((e.target as HTMLElement).closest('.mf-row-to-flexgrid')) { migrateRowToFlexGrid(ci); return; }
            if ((e.target as HTMLElement).closest('.mf-duplicate-field')) { duplicateField(ci); return; }
            if ((e.target as HTMLElement).closest('.mf-delete-field'))    { deleteField(ci);    return; }
            selectField(ci);
        });

        const grid = document.createElement('div');
        grid.className = 'mf-row-grid';
        grid.style.gridTemplateColumns = field.columns.map((c: any) => c.span + 'fr').join(' ');

        field.columns.forEach((col: any, colIdx: number) => {
            const colDiv = document.createElement('div');
            colDiv.className = 'mf-row-col';
            colDiv.setAttribute('data-row-index', String(index));
            colDiv.setAttribute('data-col-index', String(colIdx));

            if (!col.fields || col.fields.length === 0) {
                colDiv.innerHTML = '<div class="mf-row-col-empty"><i class="fas fa-plus"></i><span>Drop field</span></div>';
            } else {
                col.fields.forEach((cf: any, cfIdx: number) => {
                    const cfDiv = document.createElement('div');
                    cfDiv.className = 'mf-canvas-field mf-row-field';
                    cfDiv.setAttribute('data-row-index', String(index));
                    cfDiv.setAttribute('data-col-index', String(colIdx));
                    cfDiv.setAttribute('data-field-index', String(cfIdx));
                    cfDiv.setAttribute('data-key', cf.key);
                    cfDiv.setAttribute('data-type', cf.type);

                    let cfHtml = '<span class="mf-drag-handle mf-row-field-handle" title="Drag"><i class="fas fa-grip-vertical"></i></span>';
                    cfHtml += '<span class="mf-canvas-field-actions">';
                    cfHtml += `<button class="mf-canvas-action-btn mf-duplicate-field" data-row-index="${index}" data-col-index="${colIdx}" data-field-index="${cfIdx}" title="Duplicate"><i class="far fa-copy"></i></button>`;
                    cfHtml += `<button class="mf-canvas-action-btn mf-delete-field" data-row-index="${index}" data-col-index="${colIdx}" data-field-index="${cfIdx}" title="Delete"><i class="fas fa-trash-alt"></i></button>`;
                    cfHtml += '</span>';
                    cfHtml += renderFieldPreview(cf);
                    cfDiv.innerHTML = cfHtml;
                    attachInlineLabelEditor(cfDiv, function () {
                        var row = B.state.schema.fields[index];
                        return row && row.columns && row.columns[colIdx] && row.columns[colIdx].fields ? row.columns[colIdx].fields[cfIdx] : null;
                    }, function () { selectRowField(index, colIdx, cfIdx); });

                    cfDiv.addEventListener('click', (e: MouseEvent) => {
                        if ((e.target as HTMLElement).closest('.mf-drag-handle')) return;
                        // [ThemeMode v20260602-B48] Row-child field → theme anchor.
                        if (handleThemeModeClick(cf)) return;
                        const btn = (e.target as HTMLElement).closest('.mf-canvas-action-btn') as HTMLElement | null;
                        if (btn) {
                            const rIdx = parseInt(btn.getAttribute('data-row-index') || '0');
                            const cIdx = parseInt(btn.getAttribute('data-col-index') || '0');
                            const fIdx = parseInt(btn.getAttribute('data-field-index') || '0');
                            if (btn.classList.contains('mf-duplicate-field')) { duplicateRowField(rIdx, cIdx, fIdx); return; }
                            if (btn.classList.contains('mf-delete-field'))    { deleteRowField(rIdx, cIdx, fIdx);    return; }
                        }
                        selectRowField(index, colIdx, cfIdx);
                    });

                    colDiv.appendChild(cfDiv);
                });
            }
            grid.appendChild(colDiv);
        });

        rowDiv.appendChild(grid);
        return rowDiv;
    }

    // ── [FlexGrid P2 v20260601-B17] Builder canvas FlexGrid render ──
    // Shows a 12-col CSS Grid placeholder with each item card stacked at its
    // placement coordinates. Each cell is a drop-target via SortableJS so
    // admins can drag widgets from the LAYOUT/WIDGETS palette into a cell.
    function renderFlexGridOnCanvas(field: any, index: number): HTMLElement {
        const div = document.createElement('div');
        div.className = 'mf-canvas-item mf-canvas-flexgrid' + (index === B.state.selectedFieldIndex ? ' mf-selected' : '');
        div.setAttribute('data-index', String(index));
        div.setAttribute('data-type', 'FlexGrid');
        div.setAttribute('data-key', field.key);

        const header = document.createElement('div');
        header.className = 'mf-flexgrid-canvas-head';
        const cfg = field.gridConfig || {};
        const cols = Number(cfg.cols) > 0 ? Number(cfg.cols) : 12;
        const rh = Number(cfg.rowHeight) > 0 ? Number(cfg.rowHeight) : 64;
        const gap = Number(cfg.gap) >= 0 ? Number(cfg.gap) : 12;
        // [FlexGrid P4 v20260601-B19] Responsive breakpoint tabs. The selected
        // breakpoint drives which placement object (lg/md/sm) the resize
        // handles modify AND which CSS vars the canvas displays.
        const activeBp = (B.state as any)._flexGridBreakpoint || 'lg';
        header.innerHTML =
            '<span class="mf-drag-handle" title="Move"><i class="fas fa-grip-vertical"></i></span>' +
            '<strong>FlexGrid</strong>' +
            '<span class="mf-flexgrid-meta">' + cols + ' col · ' + rh + 'px row · ' + gap + 'px gap</span>' +
            '<div class="mf-fg-bp-tabs" data-bp-tabs>' +
              '<button type="button" data-bp="lg" class="mf-fg-bp-btn' + (activeBp === 'lg' ? ' is-active' : '') + '" title="Desktop ≥1024px"><i class="fas fa-desktop"></i></button>' +
              '<button type="button" data-bp="md" class="mf-fg-bp-btn' + (activeBp === 'md' ? ' is-active' : '') + '" title="Tablet 768-1023px"><i class="fas fa-tablet-alt"></i></button>' +
              '<button type="button" data-bp="sm" class="mf-fg-bp-btn' + (activeBp === 'sm' ? ' is-active' : '') + '" title="Mobile <768px"><i class="fas fa-mobile-alt"></i></button>' +
            '</div>' +
            '<button type="button" class="mf-flexgrid-add-btn" data-action="add-item" title="Add field"><i class="fas fa-plus"></i> Add</button>' +
            '<button type="button" class="mf-duplicate-field" title="Duplicate"><i class="fas fa-copy"></i></button>' +
            '<button type="button" class="mf-delete-field" title="Delete"><i class="fas fa-trash"></i></button>';
        div.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'mf-flexgrid mf-flexgrid-canvas';
        grid.style.setProperty('--mf-grid-cols', String(cols));
        grid.style.setProperty('--mf-grid-rh', rh + 'px');
        grid.style.setProperty('--mf-grid-gap', gap + 'px');
        grid.setAttribute('data-grid-index', String(index));

        const items = Array.isArray(field.items) ? field.items : [];
        items.forEach((it: any, itemIdx: number) => {
            if (!it || !it.field) return;
            // [FlexGrid P4 v20260601-B19] Canvas displays the ACTIVE breakpoint
            // (lg/md/sm) by writing its placement values into --lg-* (the CSS
            // rule always reads --lg-*). At runtime on the public form, real
            // media queries swap to --md-*/--sm-*. In Builder there is no
            // viewport simulation so we just remap the active bp → --lg-*.
            // [FlexGridLayoutParity v20260603-B60] BUG FIX — runtime media queries
            // in megaform.css swap to --md-*/--sm-* at 768-1023px and <768px. The
            // builder canvas is typically ≤1023px wide because left + right panels
            // eat ~512px from a 1440px screen. Without --md-*/--sm-* set, the
            // media query fallback (var(--md-x,1) / span var(--md-w,12)) forces
            // every cell to 1/span 12 → vertical stack → DOES NOT MATCH RUNTIME.
            // Fix: mirror --lg-* to --md-* and --sm-* so the canvas always shows
            // the active-breakpoint layout regardless of canvas pixel width. This
            // gives the user a true "what you see is what you publish" preview.
            const lg = (it.placement && it.placement[activeBp]) || (it.placement && it.placement.lg) || { x: 0, y: itemIdx, w: cols, h: 1 };
            const cell = document.createElement('div');
            cell.className = 'mf-flexgrid-item';
            cell.setAttribute('data-item-id', String(it.id || ('item-' + itemIdx)));
            cell.setAttribute('data-item-index', String(itemIdx));
            const cssX = String(Math.max(0, Math.min(cols - 1, Number(lg.x) || 0)) + 1);
            const cssY = String(Math.max(0, Number(lg.y) || 0) + 1);
            const cssW = String(Math.max(1, Math.min(cols, Number(lg.w) || cols)));
            const cssH = String(Math.max(1, Math.min(12, Number(lg.h) || 1)));
            cell.style.setProperty('--lg-x', cssX);
            cell.style.setProperty('--lg-y', cssY);
            cell.style.setProperty('--lg-w', cssW);
            cell.style.setProperty('--lg-h', cssH);
            // Mirror to md/sm so narrow-canvas media queries don't fall back to
            // 1/span 12 defaults. Builder always shows the ACTIVE breakpoint's
            // layout; viewport-based media queries are runtime-only concerns.
            cell.style.setProperty('--md-x', cssX);
            cell.style.setProperty('--md-y', cssY);
            cell.style.setProperty('--md-w', cssW);
            cell.style.setProperty('--md-h', cssH);
            cell.style.setProperty('--sm-x', cssX);
            cell.style.setProperty('--sm-y', cssY);
            cell.style.setProperty('--sm-w', cssW);
            cell.style.setProperty('--sm-h', cssH);

            const type = it.field.type || 'Text';
            // [FlexGrid P5-redux v20260601-B24] Top bar (grip + type badge)
            // then preview body below — same as Row's mf-row-field layout.
            const preview = renderFieldPreview(it.field);
            cell.innerHTML =
                '<div class="mf-flexgrid-item-topbar">' +
                  '<span class="mf-flexgrid-item-grip mf-drag-handle" title="Drag to move or reorder"><i class="fas fa-grip-vertical"></i></span>' +
                  '<span class="mf-flexgrid-item-type">' + type + '</span>' +
                '</div>' +
                '<div class="mf-flexgrid-item-preview">' + preview + '</div>' +
                '<button type="button" class="mf-flexgrid-item-remove" data-item-remove="' + itemIdx + '" title="Remove"><i class="fas fa-times"></i></button>' +
                // [FlexGrid P3 v20260601-B18] Three resize handles:
                //   .e = right edge → width only (snap to cols)
                //   .s = bottom edge → height only (snap to row-height)
                //   .se = corner → both
                '<span class="mf-fg-handle mf-fg-handle-e"  data-resize="e"  title="Drag to resize width"></span>' +
                '<span class="mf-fg-handle mf-fg-handle-s"  data-resize="s"  title="Drag to resize height"></span>' +
                '<span class="mf-fg-handle mf-fg-handle-se" data-resize="se" title="Drag to resize"></span>';
            grid.appendChild(cell);
        });

        if (items.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'mf-flexgrid-empty';
            hint.innerHTML = '<i class="fas fa-plus-circle"></i> Click <strong>Add</strong> in header to insert your first field';
            grid.appendChild(hint);
        }

        div.appendChild(grid);

        // Click: Add button → quick add field
        const addBtn = header.querySelector('[data-action="add-item"]') as HTMLElement | null;
        if (addBtn) {
            addBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                openFlexGridAddPicker(index);
            });
        }
        // Click: remove individual item
        grid.querySelectorAll('[data-item-remove]').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const idx = parseInt((btn as HTMLElement).getAttribute('data-item-remove') || '-1', 10);
                if (idx >= 0) removeFlexGridItem(index, idx);
            });
        });
        // Click: select cell → focus field for inspector
        grid.querySelectorAll('.mf-flexgrid-item').forEach((cell, i) => {
            cell.addEventListener('click', (ev) => {
                if ((ev.target as HTMLElement).closest('[data-item-remove]')) return;
                ev.stopPropagation();
                // [ThemeMode v20260602-B48] FlexGrid cell → theme anchor.
                const cellItem = items && items[i];
                if (cellItem && cellItem.field && handleThemeModeClick(cellItem.field)) return;
                selectFlexGridItem(index, i);
            });
        });
        // Click anywhere else on the grid frame → select the grid itself
        div.addEventListener('click', (ev) => {
            if ((ev.target as HTMLElement).closest('.mf-drag-handle, .mf-duplicate-field, .mf-delete-field, [data-item-remove], [data-action="add-item"], .mf-flexgrid-item, .mf-fg-handle')) return;
            // [ThemeMode v20260602-B48] Grid frame click → form/section anchor.
            if (handleThemeModeClick(field)) return;
            B.state.selectedFieldIndex = index;
            B.state._rowFieldRef = null;
            render();
        });

        // [FlexGrid P3 v20260601-B18] Wire resize handles. Tracking is done on
        // the host grid because each cell's snap math needs the cells' actual
        // pixel width = (host width - gap*(cols-1)) / cols.
        grid.querySelectorAll('.mf-fg-handle').forEach((handle) => {
            handle.addEventListener('mousedown', (ev) => {
                const e = ev as MouseEvent;
                e.preventDefault(); e.stopPropagation();
                const cell = (handle as HTMLElement).closest('.mf-flexgrid-item') as HTMLElement | null;
                if (!cell) return;
                const itemIdx = parseInt(cell.getAttribute('data-item-index') || '-1', 10);
                if (itemIdx < 0) return;
                const dir = (handle as HTMLElement).getAttribute('data-resize') || 'se';
                startFlexGridResize(index, itemIdx, dir, e, grid);
            });
        });

        // [FlexGrid P5 v20260601-B20] Drop palette item INTO this grid →
        // create field + place at snapped (x,y). Sortable.js already drives
        // the canvas drag, but it gives the GRID itself (top-level item) — not
        // a cell within. These native dragover/drop listeners run alongside
        // Sortable and intercept palette items before they bubble up.
        grid.addEventListener('dragover', (ev) => {
            const dt = (ev as DragEvent).dataTransfer;
            // Sortable sets text/plain to its own marker; palette items
            // have data-type. Either way, allow drop visually.
            ev.preventDefault();
            if (dt) dt.dropEffect = 'copy';
            grid.classList.add('mf-fg-dropzone-hover');
        });
        grid.addEventListener('dragleave', (ev) => {
            const e = ev as DragEvent;
            // Only clear hover when leaving the GRID, not its inner cells
            if (e.target === grid) grid.classList.remove('mf-fg-dropzone-hover');
        });
        grid.addEventListener('drop', (ev) => {
            const e = ev as DragEvent;
            e.preventDefault();
            grid.classList.remove('mf-fg-dropzone-hover');
            // Pull the dragged element from Sortable's "Sortable.active"
            const SortableGlobal = (window as any).Sortable;
            const dragged = SortableGlobal?.active?.lastPullMode === false
                ? null
                : (SortableGlobal?.dragged || document.querySelector('.sortable-chosen, .mf-palette-item.sortable-chosen'));
            const paletteEl = dragged as HTMLElement | null;
            if (!paletteEl || !paletteEl.classList?.contains('mf-palette-item')) return;
            const newType = paletteEl.getAttribute('data-type');
            if (!newType || newType === 'Row') return;  // refuse nested rows
            // Snap coords
            const rect = grid.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            const totalGap = (cols - 1) * gap;
            const colPx = Math.max(8, (rect.width - totalGap) / cols);
            const snapX = Math.max(0, Math.min(cols - 1, Math.floor(localX / (colPx + gap))));
            const snapY = Math.max(0, Math.floor(localY / (rh + gap)));
            insertFlexGridItemAt(index, newType, snapX, snapY);
        });
        // Sortable's onAdd doesn't fire on raw drop into a non-Sortable list,
        // and it will sometimes drop a clone elsewhere. Defensive: if Sortable
        // inserted a clone into the grid DOM, remove it (we already added the
        // schema item in our drop handler).
        const observer = new MutationObserver(() => {
            grid.querySelectorAll('.mf-palette-item').forEach(el => el.remove());
        });
        observer.observe(grid, { childList: true });
        // (No teardown needed — observer dies with the DOM on next render.)
        // Duplicate / Delete header buttons
        const dup = header.querySelector('.mf-duplicate-field') as HTMLElement | null;
        if (dup) dup.addEventListener('click', (ev) => { ev.stopPropagation(); duplicateField(index); });
        const del = header.querySelector('.mf-delete-field') as HTMLElement | null;
        if (del) del.addEventListener('click', (ev) => { ev.stopPropagation(); deleteField(index); });

        // [FlexGrid P4 v20260601-B19] Breakpoint tab clicks
        header.querySelectorAll('.mf-fg-bp-btn').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const bp = (btn as HTMLElement).getAttribute('data-bp') || 'lg';
                (B.state as any)._flexGridBreakpoint = bp;
                render();
            });
        });

        return div;
    }

    function openFlexGridAddPicker(gridIndex: number): void {
        // Tiny inline modal: pick field type + key + label
        const overlay = document.createElement('div');
        overlay.className = 'mf-modal-overlay';
        overlay.innerHTML =
            '<div class="mf-modal" style="max-width:380px;padding:18px 22px">' +
              '<h4 style="margin:0 0 12px;font-size:15px">Add field to FlexGrid</h4>' +
              '<label style="display:block;font-size:12px;margin-bottom:4px">Field type</label>' +
              '<select id="mf-fg-add-type" class="mf-input" style="margin-bottom:10px">' +
                '<option value="Text">Text</option>' +
                '<option value="Email">Email</option>' +
                '<option value="Phone">Phone</option>' +
                '<option value="Number">Number</option>' +
                '<option value="Date">Date</option>' +
                '<option value="Textarea">Textarea</option>' +
                '<option value="Select">Dropdown</option>' +
              '</select>' +
              '<label style="display:block;font-size:12px;margin-bottom:4px">Field key</label>' +
              '<input id="mf-fg-add-key" type="text" class="mf-input" placeholder="e.g. customer_name" style="margin-bottom:10px">' +
              '<label style="display:block;font-size:12px;margin-bottom:4px">Label</label>' +
              '<input id="mf-fg-add-label" type="text" class="mf-input" placeholder="e.g. Customer Name" style="margin-bottom:14px">' +
              '<div style="display:flex;gap:8px;justify-content:flex-end">' +
                '<button type="button" id="mf-fg-add-cancel" class="mf-btn mf-btn-ghost mf-btn-sm">Cancel</button>' +
                '<button type="button" id="mf-fg-add-ok" class="mf-btn mf-btn-primary mf-btn-sm">Add</button>' +
              '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        (overlay.querySelector('#mf-fg-add-cancel') as HTMLElement).onclick = close;
        overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
        (overlay.querySelector('#mf-fg-add-ok') as HTMLElement).onclick = () => {
            const type  = (overlay.querySelector('#mf-fg-add-type')  as HTMLSelectElement).value;
            const key   = ((overlay.querySelector('#mf-fg-add-key')   as HTMLInputElement).value || '').trim();
            const label = ((overlay.querySelector('#mf-fg-add-label') as HTMLInputElement).value || '').trim();
            if (!key) { alert('Field key required'); return; }
            addFlexGridItem(gridIndex, { type, key, label: label || key });
            close();
        };
    }

    // [FlexGrid P5 v20260601-B20] Insert a fresh field at snapped (x,y).
    // Default width = 6 (half-row) for non-textarea, 12 for textarea.
    function insertFlexGridItemAt(gridIndex: number, type: string, snapX: number, snapY: number): void {
        const grid = B.state.schema.fields[gridIndex];
        if (!grid || grid.type !== 'FlexGrid') return;
        if (!Array.isArray(grid.items)) grid.items = [];
        const cols = (grid.gridConfig && grid.gridConfig.cols) || 12;
        const defaultW = type === 'Textarea' ? cols : Math.min(6, cols);
        const w = Math.min(defaultW, cols - snapX);
        const meta = B.fieldTypes[type] || { label: type };
        const baseField = B.createFieldFromTemplate({ type, label: meta.label });
        grid.items.push({
            id: 'fg-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            field: baseField,
            placement: {
                lg: { x: snapX, y: snapY, w: w, h: 1 },
                md: { x: snapX, y: snapY, w: w, h: 1 },
                sm: { x: 0,     y: snapY, w: cols, h: 1 },
            },
        });
        B.state.isDirty = true;
        if (B.syncSchemaToHtmlImmediate) B.syncSchemaToHtmlImmediate({ reason: 'flexgrid-drop' });
        render();
    }

    function addFlexGridItem(gridIndex: number, fieldSpec: { type: string; key: string; label: string }): void {
        const grid = B.state.schema.fields[gridIndex];
        if (!grid || grid.type !== 'FlexGrid') return;
        if (!Array.isArray(grid.items)) grid.items = [];
        const cols = (grid.gridConfig && grid.gridConfig.cols) || 12;
        // Auto-place: next row, full width (admin can resize after).
        const nextY = grid.items.reduce((mx: number, it: any) => {
            const lg = it.placement && it.placement.lg;
            if (!lg) return mx;
            return Math.max(mx, (Number(lg.y) || 0) + (Number(lg.h) || 1));
        }, 0);
        const itemId = 'fg-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        grid.items.push({
            id: itemId,
            field: {
                key:   fieldSpec.key,
                type:  fieldSpec.type,
                label: fieldSpec.label,
                required: false,
                properties: {},
                validation: {},
                options: fieldSpec.type === 'Select' ? [{ value: 'a', label: 'Option A' }, { value: 'b', label: 'Option B' }] : [],
            },
            placement: {
                lg: { x: 0, y: nextY, w: cols, h: 1 },
                md: { x: 0, y: nextY, w: cols, h: 1 },
                sm: { x: 0, y: nextY, w: cols, h: 1 },
            },
        });
        B.state.isDirty = true;
        if (B.syncSchemaToHtmlImmediate) B.syncSchemaToHtmlImmediate({ reason: 'flexgrid-add-item' });
        render();
    }

    function removeFlexGridItem(gridIndex: number, itemIndex: number): void {
        const grid = B.state.schema.fields[gridIndex];
        if (!grid || grid.type !== 'FlexGrid' || !Array.isArray(grid.items)) return;
        grid.items.splice(itemIndex, 1);
        B.state.isDirty = true;
        if (B.syncSchemaToHtmlImmediate) B.syncSchemaToHtmlImmediate({ reason: 'flexgrid-remove-item' });
        render();
    }

    function selectFlexGridItem(gridIndex: number, itemIndex: number): void {
        const grid = B.state.schema.fields[gridIndex];
        if (!grid || grid.type !== 'FlexGrid' || !Array.isArray(grid.items)) return;
        const item = grid.items[itemIndex];
        if (!item || !item.field) return;
        // Reuse the row-ref state so the properties panel finds the nested field.
        B.state.selectedFieldIndex = -1;
        B.state._rowFieldRef = null;
        // Use a dedicated FlexGrid ref so getActiveField can resolve it.
        (B.state as any)._flexGridRef = { gridIndex, itemIndex };
        if (B.callModule) B.callModule('properties', 'showProps', [item.field]);
        render();
    }

    // [FlexGrid P3 v20260601-B18 + P4 v20260601-B19] Resize with snap-to-grid.
    // P4: writes to the ACTIVE breakpoint (lg/md/sm) instead of always lg.
    function startFlexGridResize(gridIndex: number, itemIdx: number, dir: string, startEv: MouseEvent, hostGrid: HTMLElement): void {
        const grid = B.state.schema.fields[gridIndex];
        if (!grid || grid.type !== 'FlexGrid' || !Array.isArray(grid.items)) return;
        const item = grid.items[itemIdx];
        if (!item) return;
        if (!item.placement) item.placement = {};
        const bp = (B.state as any)._flexGridBreakpoint || 'lg';
        if (!item.placement[bp]) item.placement[bp] = Object.assign({}, item.placement.lg || { x: 0, y: itemIdx, w: 12, h: 1 });
        const cfg = grid.gridConfig || {};
        const cols = Number(cfg.cols) > 0 ? Number(cfg.cols) : 12;
        const rh = Number(cfg.rowHeight) > 0 ? Number(cfg.rowHeight) : 64;
        const gap = Number(cfg.gap) >= 0 ? Number(cfg.gap) : 12;

        const rect = hostGrid.getBoundingClientRect();
        const totalGap = (cols - 1) * gap;
        const colPx = Math.max(8, (rect.width - totalGap) / cols);
        const startW = Number(item.placement[bp].w) || cols;
        const startH = Number(item.placement[bp].h) || 1;
        const startX = startEv.clientX;
        const startY = startEv.clientY;

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            let newW = startW;
            let newH = startH;
            if (dir === 'e' || dir === 'se') {
                const dCol = Math.round(dx / (colPx + gap));
                newW = Math.max(1, Math.min(cols - (Number(item.placement[bp].x) || 0), startW + dCol));
            }
            if (dir === 's' || dir === 'se') {
                const dRow = Math.round(dy / (rh + gap));
                newH = Math.max(1, Math.min(12, startH + dRow));
            }
            if (item.placement[bp].w !== newW || item.placement[bp].h !== newH) {
                item.placement[bp].w = newW;
                item.placement[bp].h = newH;
                const cellEl = hostGrid.querySelector('.mf-flexgrid-item[data-item-index="' + itemIdx + '"]') as HTMLElement | null;
                if (cellEl) {
                    cellEl.style.setProperty('--lg-w', String(newW));
                    cellEl.style.setProperty('--lg-h', String(newH));
                }
            }
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            B.state.isDirty = true;
            if (B.syncSchemaToHtmlImmediate) B.syncSchemaToHtmlImmediate({ reason: 'flexgrid-resize' });
            render();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // [FlexGrid P6 v20260601-B21] Convert a legacy Row to FlexGrid in-place.
    // Mapping rules:
    //   - Row.columns[i].span (in 12-col fr units) → item's lg.w
    //   - Item's lg.x  = sum of preceding columns' spans
    //   - Multiple fields inside the same column stack vertically
    //     (lg.y increments). Visual: like the public render.
    //   - sm placement = full-width stack (every field gets a new row)
    //   - md placement mirrors lg (no narrowing on tablet)
    function migrateRowToFlexGrid(rowIndex: number): void {
        const row = B.state.schema.fields[rowIndex];
        if (!row || row.type !== 'Row' || !Array.isArray(row.columns)) return;
        if (!confirm('Convert this Row to a FlexGrid?\n\nLayout is preserved. The original Row will be replaced with a FlexGrid that holds the same fields in the same column positions. This is reversible only by manual edit.')) return;

        const cols = 12;
        const newItems: any[] = [];
        let xCursor = 0;
        let smY = 0;
        row.columns.forEach((col: any) => {
            const span = Math.max(1, Math.min(cols - xCursor, Number(col.span) || 6));
            let lgY = 0;
            (col.fields || []).forEach((nestedField: any) => {
                if (!nestedField || nestedField.type === 'Row') return;  // refuse double-nest
                newItems.push({
                    id: 'fg-mig-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                    field: nestedField,
                    placement: {
                        lg: { x: xCursor, y: lgY, w: span, h: 1 },
                        md: { x: xCursor, y: lgY, w: span, h: 1 },
                        sm: { x: 0, y: smY, w: cols, h: 1 },
                    },
                });
                lgY++;
                smY++;
            });
            xCursor += span;
        });

        const newGrid: any = {
            key: row.key + '_grid',
            type: 'FlexGrid',
            label: row.label || 'Converted FlexGrid',
            gridConfig: { cols: 12, rowHeight: 64, gap: 12 },
            items: newItems,
            properties: {},
            validation: {},
            options: [],
            width: '100%',
        };
        B.state.schema.fields[rowIndex] = newGrid;
        B.state.isDirty = true;
        if (B.syncSchemaToHtmlImmediate) B.syncSchemaToHtmlImmediate({ reason: 'row-to-flexgrid' });
        B.showToast?.('Converted Row → FlexGrid (' + newItems.length + ' items)', 'success');
        render();
    }

    // ── End FlexGrid P2/P3/P5/P6 ──

    function changeRowLayout(rowIndex: number, newSpans: number[]): void {
        const row = B.state.schema.fields[rowIndex];
        if (!row || row.type !== 'Row') return;
        const allFields: any[] = [];
        row.columns.forEach((col: any) => { if (col.fields) allFields.push(...col.fields); });
        const newCols = newSpans.map((span: number) => ({ span, fields: [] as any[] }));
        allFields.forEach((f: any, i: number) => { newCols[i % newCols.length].fields.push(f); });
        row.columns = newCols;
        B.state.isDirty = true;
        render();
    }

    function removeFieldFromRow(rowIndex: number, colIndex: number, fieldIndex: number): void {
        const row = B.state.schema.fields[rowIndex];
        if (!row || row.type !== 'Row') return;
        const removed = row.columns[colIndex].fields.splice(fieldIndex, 1)[0];
        if (removed) B.state.schema.fields.splice(rowIndex + 1, 0, removed);
        B.state.isDirty = true;
        B.state.selectedFieldIndex = -1;
        B.state._rowFieldRef = null;
        if (B.syncSchemaToHtmlImmediate) B.syncSchemaToHtmlImmediate({ reason: 'remove-field-from-row' });
        B.callModule('properties', 'hideProps');
        render();
    }

    function duplicateRowField(rowIndex: number, colIndex: number, fieldIndex: number): void {
        const row = B.state.schema.fields[rowIndex];
        if (!row || row.type !== 'Row') return;
        const original = row.columns[colIndex].fields[fieldIndex];
        if (!original) return;
        const copy = duplicateFieldTreeWithNewKeys(original);
        row.columns[colIndex].fields.splice(fieldIndex + 1, 0, copy);
        B.state._rowFieldRef = { rowIndex, colIndex, fieldIndex: fieldIndex + 1 };
        B.state.isDirty = true;
        if (B.syncSchemaToHtmlImmediate) {
            B.syncSchemaToHtmlImmediate({
                reason: 'duplicate-row-field',
                insertKey: copy.key,
                insertAfterKey: original && original.key ? original.key : ''
            });
        }
        render();
        B.callModule('properties', 'showProps', [copy]);
    }

    function deleteRowField(rowIndex: number, colIndex: number, fieldIndex: number): void {
        if (!confirm('Delete this field?')) return;
        const row = B.state.schema.fields[rowIndex];
        if (!row || row.type !== 'Row') return;
        const target = row.columns[colIndex].fields[fieldIndex];
        const removedKeys = collectFieldKeysRecursive(target);
        row.columns[colIndex].fields.splice(fieldIndex, 1);
        B.state.selectedFieldIndex = -1;
        B.state._rowFieldRef = null;
        B.state.isDirty = true;
        if (B.syncSchemaToHtmlImmediate) B.syncSchemaToHtmlImmediate({ reason: 'delete-row-field', removeKeys: removedKeys });
        B.callModule('properties', 'hideProps');
        render();
    }

    function selectRowField(rowIndex: number, colIndex: number, fieldIndex: number): void {
        const row = B.state.schema.fields[rowIndex];
        if (!row || row.type !== 'Row') return;
        const field = row.columns[colIndex].fields[fieldIndex];
        if (!field) return;
        B.state.selectedFieldIndex = -1;
        B.state._rowFieldRef = { rowIndex, colIndex, fieldIndex };
        document.querySelectorAll<HTMLElement>('.mf-canvas-field, .mf-canvas-row').forEach(el => el.classList.remove('mf-selected'));
        const sel = document.querySelector<HTMLElement>(
            `.mf-row-field[data-row-index="${rowIndex}"][data-col-index="${colIndex}"][data-field-index="${fieldIndex}"]`
        );
        if (sel) sel.classList.add('mf-selected');
        B.callModule('properties', 'showProps', [field]);
    }

    // ── Main canvas Sortable ──
    function lockCanvasItemDragSize(el: HTMLElement | null | undefined, source?: HTMLElement | null): void {
        if (!el || !el.classList) return;
        const isTopLevelRow = el.classList.contains('mf-canvas-row');
        const isTopLevelField = el.classList.contains('mf-canvas-field') && !el.classList.contains('mf-row-field');
        const isRowField = el.classList.contains('mf-row-field');
        if (!isTopLevelRow && !isTopLevelField && !isRowField) return;
        const src = source || el;
        const rect = src.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;
        let cloneClass = 'mf-canvas-item-drag-clone';
        if (isTopLevelRow) cloneClass = 'mf-row-drag-clone';
        else if (isRowField) cloneClass = 'mf-row-field-drag-clone';
        el.classList.add(cloneClass);
        el.style.setProperty('--mf-canvas-item-drag-width', Math.round(rect.width) + 'px');
        el.style.width = Math.round(rect.width) + 'px';
        el.style.minWidth = Math.round(rect.width) + 'px';
        el.style.maxWidth = 'none';
        if (rect.height > 0) {
            el.style.minHeight = Math.round(rect.height) + 'px';
        }
    }

    function clearCanvasItemDragSize(el: HTMLElement | null | undefined): void {
        if (!el || !el.classList) return;
        el.classList.remove('mf-row-drag-clone');
        el.classList.remove('mf-canvas-item-drag-clone');
        el.classList.remove('mf-row-field-drag-clone');
        el.style.removeProperty('--mf-canvas-item-drag-width');
        el.style.removeProperty('width');
        el.style.removeProperty('min-width');
        el.style.removeProperty('max-width');
        el.style.removeProperty('min-height');
    }

    function initMainSortable(container: HTMLElement): void {
        if (sortableInstance) { try { sortableInstance.destroy(); } catch (e) {} }
        const SortableCtor = getSortableCtor();
        if (!SortableCtor || typeof SortableCtor !== 'function') {
            container.removeAttribute('data-mf-sortable-ready');
            return;
        }
        try {
            sortableInstance = new SortableCtor(container, {
                // [DragPerf 2026-06-18] 200ms easing recomputes a transition curve on
                // every swap; 140ms keeps the reorder feel snappy without thrash. The
                // big smoothness win is the lighter GPU-composited clone (CSS) + the
                // gentler scroll tuning below (56/14 caused edge-scroll jitter).
                animation:  140,
                ghostClass: 'mf-sortable-ghost',
                chosenClass: 'mf-sortable-chosen',
                dragClass: 'mf-sortable-drag',
                fallbackClass: 'mf-sortable-fallback',
                handle:     '.mf-drag-handle, .mf-canvas-row, .mf-canvas-field',
                draggable:  '.mf-canvas-item,.mf-palette-item',
                filter:     '.mf-canvas-empty-state, .mf-row-field, .mf-canvas-action-btn, button, input, textarea, select, [contenteditable="true"]',
                forceFallback: true,
                fallbackOnBody: true,
                fallbackTolerance: 5,
                touchStartThreshold: 4,
                swapThreshold: 0.35,
                invertSwap: true,
                emptyInsertThreshold: 48,
                scroll: true,
                scrollSensitivity: 40,
                scrollSpeed: 10,
                direction: 'vertical',
                onClone(evt: any) {
                    lockCanvasItemDragSize(evt && evt.clone ? evt.clone as HTMLElement : null, evt && evt.item ? evt.item as HTMLElement : null);
                },
                onStart(evt: any) {
                    lockCanvasItemDragSize(evt && evt.item ? evt.item as HTMLElement : null);
                    // Keep row columns quiet while sorting top-level blocks; row columns only
                    // accept palette/row-field drags through their own sortable instance.
                    container.querySelectorAll<HTMLElement>('.mf-row-col').forEach((c) => c.classList.remove('mf-row-col-droppable'));
                    setBuilderDragging(true);
                },
                group:      {
                    name: 'mf-canvas',
                    pull: true,
                    put(to: any, from: any, dragEl: HTMLElement, evt?: any) {
                        const target = evt && evt.target ? evt.target as HTMLElement : null;
                        const related = evt && evt.related ? evt.related as HTMLElement : null;
                        const nodes = [target, related];
                        for (const node of nodes) {
                            if (!node) continue;
                            if (node.classList && node.classList.contains('mf-row-col')) return false;
                            if (typeof node.closest === 'function' && node.closest('.mf-row-col')) return false;
                        }
                        return true;
                    }
                },
                onAdd(evt: any) {
                    const el = evt.item as HTMLElement;
                    if (el.classList.contains('mf-palette-item')) {
                        finishPaletteDragging();
                        const type = el.getAttribute('data-type');
                        if (type && B.fieldTypes[type]) {
                            const newField = B.createFieldFromTemplate({ type, label: B.fieldTypes[type].label });
                            const newPos = getCanvasNewIndex(evt, container);
                            B.state.schema.fields.splice(newPos, 0, newField);
                            B.state.isDirty = true;
                            B.state.selectedFieldIndex = newPos;
                            if (B.syncSchemaToHtmlImmediate) {
                                B.syncSchemaToHtmlImmediate(buildCustomHtmlInsertOptions('palette-add', newField, newPos));
                            }
                            render();
                            B.callModule('properties', 'showProps', [newField]);
                        } else {
                            el.parentNode?.removeChild(el);
                        }
                        return;
                    }
                    if (el.classList.contains('mf-row-field')) {
                        const srcRI = parseInt(el.getAttribute('data-row-index')!);
                        const srcCI = parseInt(el.getAttribute('data-col-index')!);
                        const srcFI = parseInt(el.getAttribute('data-field-index')!);
                        const srcRow = B.state.schema.fields[srcRI];
                        let movedField: any = null;
                        let movedIndex = -1;
                        if (srcRow?.type === 'Row' && srcRow.columns[srcCI]) {
                            movedField = srcRow.columns[srcCI].fields.splice(srcFI, 1)[0];
                            if (movedField) {
                                const newPos = getCanvasNewIndex(evt, container);
                                B.state.schema.fields.splice(newPos, 0, movedField);
                                movedIndex = newPos;
                            }
                        }
                        B.state.isDirty = true;
                        if (movedField && B.syncSchemaToHtmlImmediate) {
                            B.syncSchemaToHtmlImmediate(buildCustomHtmlInsertOptions('row-field-to-canvas', movedField, movedIndex));
                        }
                        render();
                    }
                },
                onEnd(evt: any) {
                    clearCanvasItemDragSize(evt && evt.item ? evt.item as HTMLElement : null);
                    clearCanvasItemDragSize(evt && evt.clone ? evt.clone as HTMLElement : null);
                    container.querySelectorAll<HTMLElement>('.mf-row-col-droppable').forEach((c) => c.classList.remove('mf-row-col-droppable'));
                    setBuilderDragging(false);   // restore full previews (must run before the early-returns below)
                    if (evt.from !== evt.to) return;
                    const oldPos = getEvtIndex(evt, 'old');
                    const newPos = getCanvasNewIndex(evt, container);
                    if (oldPos === newPos) return;
                    const moved = B.state.schema.fields.splice(oldPos, 1)[0];
                    B.state.schema.fields.splice(newPos, 0, moved);
                    if (B.state.selectedFieldIndex === oldPos) B.state.selectedFieldIndex = newPos;
                    B.state.isDirty = true;
                    syncCanvasIndexes(container);
                    // [2026-06-28 D1] For a custom-shell form, render order = customHtml token order,
                    // NOT schema order. A bare schema reorder therefore had NO effect on the rendered
                    // form (the user's "drag does nothing" bug). Push the new order into customHtml by
                    // moving each field wrapper (reorder:true), so render + theme preview follow the drag.
                    if (B.syncSchemaToHtmlImmediate) {
                        try { B.syncSchemaToHtmlImmediate({ reason: 'canvas-reorder', reorder: true, refreshEditors: true }); } catch (_reErr) {}
                    }
                    // Refresh properties nếu đang có field được chọn
                    if (B.state.selectedFieldIndex >= 0) {
                        const sel = B.state.schema.fields[B.state.selectedFieldIndex];
                        if (sel) B.callModule('properties', 'showProps', [sel]);
                    }
                }
            });
            container.setAttribute('data-mf-sortable-ready', '1');
        } catch (e) { console.warn('MegaForm: Sortable init error', e); }
    }

    // ── Row column Sortables ──
    function initRowSortables(container: HTMLElement): void {
        const SortableCtor = getSortableCtor();
        if (!SortableCtor || typeof SortableCtor !== 'function') return;
        rowColSortables.forEach(s => { try { s.destroy(); } catch (e) {} });
        rowColSortables = [];

        container.querySelectorAll<HTMLElement>('.mf-row-col').forEach(colEl => {
            const readTarget = (_evt: any) => ({
                toEl: colEl,
                targetRI: parseInt(colEl.getAttribute('data-row-index') || '-1', 10),
                targetCI: parseInt(colEl.getAttribute('data-col-index') || '-1', 10)
            });
            const clearEmptyPlaceholder = (host: HTMLElement) => {
                host.querySelectorAll('.mf-row-col-empty').forEach(node => node.parentNode?.removeChild(node));
            };
            const s = new SortableCtor(colEl, {
                animation:  150,
                ghostClass: 'mf-sortable-ghost',
                chosenClass: 'mf-sortable-chosen',
                dragClass: 'mf-sortable-drag',
                fallbackClass: 'mf-sortable-fallback',
                handle:     '.mf-drag-handle, .mf-row-field',
                draggable:  '.mf-row-field,.mf-canvas-item,.mf-canvas-field,.mf-palette-item',
                filter:     '.mf-canvas-action-btn, button, input, textarea, select, [contenteditable="true"]',
                fallbackOnBody: true,
                forceFallback: true,
                fallbackTolerance: 5,
                touchStartThreshold: 4,
                emptyInsertThreshold: 28,
                swapThreshold: 0.65,
                invertSwap: true,
                scroll: true,
                scrollSensitivity: 48,
                scrollSpeed: 12,
                onClone(evt: any) {
                    lockCanvasItemDragSize(evt && evt.clone ? evt.clone as HTMLElement : null, evt && evt.item ? evt.item as HTMLElement : null);
                },
                onStart(evt: any) {
                    lockCanvasItemDragSize(evt && evt.item ? evt.item as HTMLElement : null);
                    setBuilderDragging(true);
                },
                group: {
                    name: 'row-cols',
                    pull: true,
                    put(_to: any, _from: any, dragEl: HTMLElement) {
                        if (dragEl.classList.contains('mf-palette-item')) return true;
                        if (dragEl.classList.contains('mf-canvas-row')) return false;
                        if (isTopLevelCanvasDrag(dragEl)) return false;
                        if (dragEl.classList.contains('mf-canvas-field')) return false;
                        if (dragEl.classList.contains('mf-row-field')) return true;
                        return false;
                    }
                },
                onMove(evt: any) {
                    const dragged = evt && evt.dragged ? evt.dragged as HTMLElement : null;
                    if (dragged && dragged.classList.contains('mf-canvas-row')) return false;
                    if (isTopLevelCanvasDrag(dragged)) return false;
                    if (dragged && dragged.classList.contains('mf-palette-item') && dragged.getAttribute('data-type') === 'Row') return false;
                    const related = evt && evt.related ? evt.related as HTMLElement : null;
                    if (related && related.classList.contains('mf-row-col-empty')) return 1;
                    return true;
                },
                onUnchoose() {
                    colEl.classList.remove('mf-row-col-droppable', 'mf-row-col-dragover');
                    setBuilderDragging(false);
                },
                onEnd(evt: any) {
                    clearCanvasItemDragSize(evt && evt.item ? evt.item as HTMLElement : null);
                    clearCanvasItemDragSize(evt && evt.clone ? evt.clone as HTMLElement : null);
                    colEl.classList.remove('mf-row-col-droppable', 'mf-row-col-dragover');
                    setBuilderDragging(false);
                    if (evt.from !== evt.to) return;
                    const { targetRI, targetCI } = readTarget(evt);
                    const row = B.state.schema.fields[targetRI];
                    if (!row?.columns[targetCI]) return;
                    const oldPos = getEvtIndex(evt, 'old');
                    const newPos = getEvtIndex(evt, 'new');
                    if (oldPos === newPos) return;
                    const moved = row.columns[targetCI].fields.splice(oldPos, 1)[0];
                    row.columns[targetCI].fields.splice(newPos, 0, moved);
                    B.state.isDirty = true;
                    render();
                },
                onAdd(evt: any) {
                    const el = evt.item as HTMLElement;
                    if (el?.classList.contains('mf-palette-item')) finishPaletteDragging();
                    const { toEl, targetRI, targetCI } = readTarget(evt);
                    clearEmptyPlaceholder(toEl);
                    const row = B.state.schema.fields[targetRI];
                    if (!row || row.type !== 'Row' || !row.columns[targetCI]) { render(); return; }

                    let movedField: any;
                    let insertedRef: { rowIndex: number; colIndex: number; fieldIndex: number } | null = null;

                    if (el.classList.contains('mf-palette-item')) {
                        const type = el.getAttribute('data-type');
                        if (type === 'Row') {
                            B.showToast('Cannot nest rows inside rows', 'error');
                            movedField = null;
                        } else if (type && B.fieldTypes[type]) {
                            movedField = B.createFieldFromTemplate({ type, label: B.fieldTypes[type].label });
                        }
                    } else if (el.classList.contains('mf-row-field')) {
                        const srcRI = parseInt(el.getAttribute('data-row-index') || '-1', 10);
                        const srcCI = parseInt(el.getAttribute('data-col-index') || '-1', 10);
                        const srcFI = parseInt(el.getAttribute('data-field-index') || '-1', 10);
                        const srcRow = B.state.schema.fields[srcRI];
                        if (srcRow?.type === 'Row' && srcRow.columns?.[srcCI]?.fields) {
                            movedField = srcRow.columns[srcCI].fields.splice(srcFI, 1)[0];
                        }
                    } else if (el.classList.contains('mf-canvas-item') || el.classList.contains('mf-canvas-field')) {
                        if (isTopLevelCanvasDrag(el)) {
                            B.showToast('Sort fields on the main canvas; add new fields to rows from the palette.', 'info');
                            render();
                            return;
                        }
                        const mainIdx = parseInt(el.getAttribute('data-index') || '-1', 10);
                        const mainField = B.state.schema.fields[mainIdx];
                        if (mainField?.type === 'Row') {
                            B.showToast('Cannot nest rows inside rows', 'error');
                            B.state.isDirty = true;
                            render();
                            return;
                        }
                        movedField = B.state.schema.fields.splice(mainIdx, 1)[0];
                    }

                    if (movedField) {
                        if (!row.columns[targetCI].fields) row.columns[targetCI].fields = [];
                        const newPos = getEvtIndex(evt, 'new');
                        const insertAt = Math.max(0, Math.min(newPos, row.columns[targetCI].fields.length));
                        row.columns[targetCI].fields.splice(insertAt, 0, movedField);
                        B.state.selectedFieldIndex = -1;
                        B.state._rowFieldRef = { rowIndex: targetRI, colIndex: targetCI, fieldIndex: insertAt };
                        insertedRef = { rowIndex: targetRI, colIndex: targetCI, fieldIndex: insertAt };
                    }
                    B.state.isDirty = true;
                    render();
                    if (insertedRef) {
                        window.setTimeout(() => {
                            selectRowField(insertedRef!.rowIndex, insertedRef!.colIndex, insertedRef!.fieldIndex);
                        }, 0);
                    }
                }
            });
            ['dragenter', 'dragover'].forEach(name => {
                colEl.addEventListener(name, () => colEl.classList.add('mf-row-col-dragover'));
            });
            ['dragleave', 'drop'].forEach(name => {
                colEl.addEventListener(name, () => colEl.classList.remove('mf-row-col-dragover'));
            });
            colEl.setAttribute('data-mf-row-sortable-ready', '1');
            rowColSortables.push(s);
        });
    }

    // [FlexGrid P5-redux v20260601-B23] Make each FlexGrid container a
    // Sortable drop target so palette items can be dragged INTO it (and
    // existing cells can be reordered). Mirrors initRowSortables but maps
    // the drop into the grid's items[] with snapped placement.
    function initFlexGridSortables(container: HTMLElement): void {
        const SortableCtor = getSortableCtor();
        if (!SortableCtor) return;
        flexGridSortables.forEach(s => { try { s.destroy(); } catch (e) {} });
        flexGridSortables = [];

        container.querySelectorAll<HTMLElement>('.mf-flexgrid.mf-flexgrid-canvas').forEach(gridEl => {
            const gridIndex = parseInt(gridEl.getAttribute('data-grid-index') || '-1', 10);
            if (gridIndex < 0) return;
            const gridField = B.state.schema.fields[gridIndex];
            if (!gridField || gridField.type !== 'FlexGrid') return;
            const cfg = gridField.gridConfig || {};
            const cols = Number(cfg.cols) > 0 ? Number(cfg.cols) : 12;
            const rh   = Number(cfg.rowHeight) > 0 ? Number(cfg.rowHeight) : 64;
            const gap  = Number(cfg.gap) >= 0 ? Number(cfg.gap) : 12;

            const s = new SortableCtor(gridEl, {
                animation: 150,
                ghostClass: 'mf-sortable-ghost',
                handle: '.mf-drag-handle, .mf-flexgrid-item-grip',
                draggable: '.mf-flexgrid-item,.mf-palette-item',
                fallbackOnBody: true,
                forceFallback: true,
                emptyInsertThreshold: 28,
                group: {
                    name: 'mf-canvas',  // same name as initMainSortable → palette items flow here
                    pull: true,
                    put(_to: any, _from: any, dragEl: HTMLElement) {
                        if (dragEl.classList.contains('mf-palette-item')) {
                            const type = dragEl.getAttribute('data-type');
                            return type !== 'Row' && type !== 'FlexGrid';   // no nested grids/rows
                        }
                        if (dragEl.classList.contains('mf-flexgrid-item')) return true;
                        return false;
                    },
                },
                onStart() {
                    gridEl.classList.add('mf-fg-dropzone-hover');
                },
                onUnchoose() {
                    gridEl.classList.remove('mf-fg-dropzone-hover');
                },
                onAdd(evt: any) {
                    const el = evt.item as HTMLElement;
                    if (el?.classList.contains('mf-palette-item')) finishPaletteDragging();
                    gridEl.classList.remove('mf-fg-dropzone-hover');
                    // QA hook
                    (window as any).__mfFlexGridLastOnAdd = {
                        when: Date.now(),
                        itemClass: el?.className || '',
                        itemType: el?.getAttribute?.('data-type') || '',
                    };
                    if (!el) return;
                    if (el.classList.contains('mf-palette-item')) {
                        const newType = el.getAttribute('data-type');
                        if (!newType || newType === 'Row' || newType === 'FlexGrid') {
                            el.parentNode?.removeChild(el);
                            return;
                        }
                        // Snap drop coord → (x,y) cell.
                        const rect = gridEl.getBoundingClientRect();
                        const localX = (evt.originalEvent?.clientX || rect.left) - rect.left;
                        const localY = (evt.originalEvent?.clientY || rect.top) - rect.top;
                        const colPx = Math.max(8, (rect.width - (cols - 1) * gap) / cols);
                        const snapX = Math.max(0, Math.min(cols - 1, Math.floor(localX / (colPx + gap))));
                        const snapY = Math.max(0, Math.floor(localY / (rh + gap)));
                        el.parentNode?.removeChild(el);  // remove the cloned palette DOM
                        insertFlexGridItemAt(gridIndex, newType, snapX, snapY);
                        return;
                    }
                    if (el.classList.contains('mf-flexgrid-item')) {
                        // [FlexGrid P5-redux v20260601-B24] Intra-grid move:
                        // when an existing cell is dragged to a new position,
                        // update its placement to the snapped drop coord on
                        // the active breakpoint.
                        const movedIdx = parseInt(el.getAttribute('data-item-index') || '-1', 10);
                        el.parentNode?.removeChild(el);
                        if (movedIdx < 0) { render(); return; }
                        const movedItem = gridField.items?.[movedIdx];
                        if (!movedItem) { render(); return; }
                        const rect2 = gridEl.getBoundingClientRect();
                        const lx2 = (evt.originalEvent?.clientX || rect2.left) - rect2.left;
                        const ly2 = (evt.originalEvent?.clientY || rect2.top) - rect2.top;
                        const colPx2 = Math.max(8, (rect2.width - (cols - 1) * gap) / cols);
                        const sx = Math.max(0, Math.min(cols - 1, Math.floor(lx2 / (colPx2 + gap))));
                        const sy = Math.max(0, Math.floor(ly2 / (rh + gap)));
                        const activeBp = (B.state as any)._flexGridBreakpoint || 'lg';
                        if (!movedItem.placement) movedItem.placement = {};
                        if (!movedItem.placement[activeBp]) movedItem.placement[activeBp] = { x: 0, y: 0, w: 6, h: 1 };
                        const curW = Number(movedItem.placement[activeBp].w) || 6;
                        const newW = Math.max(1, Math.min(cols - sx, curW));
                        movedItem.placement[activeBp].x = sx;
                        movedItem.placement[activeBp].y = sy;
                        movedItem.placement[activeBp].w = newW;
                        B.state.isDirty = true;
                        if (B.syncSchemaToHtmlImmediate) B.syncSchemaToHtmlImmediate({ reason: 'flexgrid-intra-move' });
                        render();
                    }
                },
                onEnd() {
                    gridEl.classList.remove('mf-fg-dropzone-hover');
                },
            });
            // Visual dropzone hint on dragenter from outside.
            ['dragenter', 'dragover'].forEach(name => {
                gridEl.addEventListener(name, () => gridEl.classList.add('mf-fg-dropzone-hover'));
            });
            ['dragleave', 'drop'].forEach(name => {
                gridEl.addEventListener(name, () => gridEl.classList.remove('mf-fg-dropzone-hover'));
            });
            flexGridSortables.push(s);
        });
    }


    function refreshSelectedFieldProps(): void {
        if (B.state.selectedFieldIndex < 0) return;
        const field = B.state.schema.fields[B.state.selectedFieldIndex];
        if (field) B.callModule('properties', 'showProps', [field]);
    }

    function attachInlineTextEditor(host: HTMLElement, selector: string, fieldProp: string, inputClass: string, isTextarea: boolean, afterCommit?: () => void): void {
        const wrap = host.querySelector<HTMLElement>(selector);
        if (!wrap) return;
        const textEl = wrap.querySelector<HTMLElement>('[data-inline-text]');
        const editBtn = wrap.querySelector<HTMLElement>('[data-inline-edit]');
        const beginEdit = (ev?: Event) => {
            if (ev) {
                ev.preventDefault();
                ev.stopPropagation();
            }
            if (wrap.classList.contains('is-editing')) return;
            const field = (host as any).__mfGetField ? (host as any).__mfGetField() : null;
            if (!field) return;
            const current = field[fieldProp] == null ? '' : String(field[fieldProp]);
            wrap.classList.add('is-editing');
            if (textEl) textEl.style.display = 'none';
            if (editBtn) editBtn.style.display = 'none';
            const input = document.createElement(isTextarea ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement;
            if (!isTextarea) (input as HTMLInputElement).type = 'text';
            input.className = inputClass;
            input.value = current;
            wrap.appendChild(input);
            window.setTimeout(() => { input.focus(); input.select && input.select(); }, 0);
            let isFinishing = false;
            const finish = (commit: boolean) => {
                if (isFinishing || !wrap.classList.contains('is-editing')) return;
                isFinishing = true;
                try {
                    if (commit) {
                        field[fieldProp] = input.value;
                        B.state.isDirty = true;
                    }
                    if (input.parentNode === wrap) wrap.removeChild(input);
                    else if (input.parentNode) input.parentNode.removeChild(input);
                } catch (_err) {}
                if (textEl) textEl.style.display = '';
                if (editBtn) editBtn.style.display = '';
                wrap.classList.remove('is-editing');
                render();
                refreshSelectedFieldProps();
                if (afterCommit) afterCommit();
            };
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                e.stopPropagation();
                if (!isTextarea && e.key === 'Enter') finish(true);
                else if (e.key === 'Escape') finish(false);
                else if (isTextarea && (e.ctrlKey || e.metaKey) && e.key === 'Enter') finish(true);
            });
            input.addEventListener('click', e => e.stopPropagation());
            input.addEventListener('mousedown', e => e.stopPropagation());
            input.addEventListener('blur', () => window.setTimeout(() => finish(true), 0));
        };
        [wrap, textEl, editBtn].forEach(el => {
            if (!el) return;
            el.addEventListener('click', beginEdit);
            el.addEventListener('mousedown', e => e.stopPropagation());
        });
    }

    function attachInlineLabelEditor(host: HTMLElement, getField: () => any, afterCommit?: () => void): void {
        (host as any).__mfGetField = getField;
        attachInlineTextEditor(host, '.mf-field-preview-label', 'label', 'mf-inline-label-input', false, afterCommit);
        attachInlineTextEditor(host, '.mf-field-preview-input[data-inline-placeholder]', 'placeholder', 'mf-inline-placeholder-input', false, afterCommit);
        attachInlineTextEditor(host, '.mf-field-placeholder-hint[data-inline-placeholder]', 'placeholder', 'mf-inline-placeholder-input', false, afterCommit);
    }

    function getPlaceholderText(field: any, fallback?: string): string {
        const raw = field && field.placeholder != null ? String(field.placeholder).trim() : '';
        if (raw) return raw;
        return fallback || '';
    }

    function renderPlaceholderHint(field: any, fallback?: string): string {
        const text = getPlaceholderText(field, fallback);
        if (!text) return '';
        return `<div class="mf-field-placeholder-hint" data-inline-placeholder="1" style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;border:1px dashed #dbe4f0;border-radius:10px;background:#f8fbff;color:#64748b;font-size:12px;line-height:1.45;">
            <i class="fas fa-circle-info" style="color:#94a3b8;"></i>
            <span class="mf-inline-placeholder-text" data-inline-text style="flex:1;min-width:0;">${B.escHtml(text)}</span>
            <button type="button" class="mf-inline-placeholder-edit" data-inline-edit aria-label="Edit placeholder" style="border:0;background:transparent;color:#64748b;cursor:pointer;padding:0;flex:0 0 auto;"><i class="fas fa-i-cursor"></i></button>
        </div>`;
    }

    // =========================================================
    //  FIELD PREVIEW
    // =========================================================
    function getSectionStepNumber(field: any): number {
        const fields = B.state.schema?.fields || [];
        const idx = fields.indexOf(field);
        if (idx < 0) return 1;
        let step = 1;
        for (let i = 0; i <= idx; i++) {
            if (fields[i].type === 'Section' && fields[i].properties?.pageBreak) step++;
        }
        return step;
    }

    function renderFieldPreview(field: any): string {
        if (field.type === 'Section') {
            const isPageBreak = !!field.properties?.pageBreak;
            const badge = isPageBreak
                ? `<span class="mf-page-break-badge"><i class="fas fa-columns"></i> Page Break — Step ${getSectionStepNumber(field)}</span>`
                : '';
            return `<div class="mf-section-preview${isPageBreak ? ' is-page-break' : ''}"><strong>${B.escHtml(field.label)}</strong>${badge}</div>`;
        }
        if (field.type === 'Html')    return '<div class="mf-html-preview"><i class="fas fa-code"></i> HTML Block</div>';
        if (field.type === 'Hidden')  return `<div class="mf-hidden-preview"><i class="fas fa-eye-slash"></i> Hidden: ${B.escHtml(field.key)}</div>`;

        // ── builderPreview from FieldPlugin registry ──────────────
        const R = (window as any).MFFieldPlugins;
        if (R) {
            const plugin = R.get(field.type);
            if (plugin && plugin.builderPreview) {
                try {
                    return '<div class="mf-widget-builder-preview">' + plugin.builderPreview() + '</div>' + renderPlaceholderHint(field);
                } catch(e) {}
            }
        }

        const rawLabel = field.label == null ? '' : String(field.label);
        const safeLabel = rawLabel ? B.escHtml(rawLabel) : '&nbsp;';
        let html = `<div class="mf-field-preview-label${rawLabel ? '' : ' is-empty'}"><span class="mf-inline-label-text">${safeLabel}</span><button type="button" class="mf-inline-label-edit" aria-label="Edit label"><i class="fas fa-pen"></i></button>`;
        if (field.required) html += ' <span class="mf-req">*</span>';
        html += '</div>';

        switch (field.type) {
            case 'Textarea':
                html += `<div class="mf-field-preview-input mf-preview-textarea" data-inline-placeholder="1"><span class="mf-inline-placeholder-text" data-inline-text>${B.escHtml(field.placeholder || 'Enter text...')}</span><button type="button" class="mf-inline-placeholder-edit" data-inline-edit aria-label="Edit placeholder"><i class="fas fa-i-cursor"></i></button></div>`;
                break;
            case 'Select': {
                const opt0 = field.options && field.options.length > 0 ? B.escHtml(field.options[0].label) : 'Select...';
                const variant = String((field.properties && (field.properties.selectVariant || field.properties.variant)) || '').toLowerCase();
                if (variant === 'multi-select' || variant === 'multiselect') {
                    html += `<div class="mf-field-preview-input mf-preview-select"><span class="mf-preview-chip">${opt0}</span><span class="mf-preview-chip">${B.escHtml((field.options && field.options[1] && field.options[1].label) || 'Option 2')}</span><i class="fas fa-tags"></i></div>`;
                } else if (variant === 'multi-column' || variant === 'multicolumn') {
                    html += `<div class="mf-field-preview-input mf-preview-select"><span class="mf-inline-placeholder-text">${B.escHtml(field.placeholder || 'Search...')}</span><i class="fas fa-table"></i></div>`;
                } else {
                    html += `<div class="mf-field-preview-input mf-preview-select" data-inline-placeholder="1"><span class="mf-inline-placeholder-text" data-inline-text>${B.escHtml(field.placeholder || opt0)}</span><button type="button" class="mf-inline-placeholder-edit" data-inline-edit aria-label="Edit placeholder"><i class="fas fa-i-cursor"></i></button><i class="fas fa-caret-down"></i></div>`;
                }
                break;
            }
            case 'MultiSelect': {
                const opt0 = field.options && field.options.length > 0 ? B.escHtml(field.options[0].label) : 'Option 1';
                html += `<div class="mf-field-preview-input mf-preview-select"><span class="mf-preview-chip">${opt0}</span><span class="mf-preview-chip">${B.escHtml((field.options && field.options[1] && field.options[1].label) || 'Option 2')}</span><i class="fas fa-tags"></i></div>`;
                break;
            }
            case 'Date':
                html += `<div class="mf-field-preview-input" data-inline-placeholder="1"><span class="mf-inline-placeholder-text" data-inline-text>${B.escHtml(getPlaceholderText(field, 'Select date...'))}</span><button type="button" class="mf-inline-placeholder-edit" data-inline-edit aria-label="Edit placeholder"><i class="fas fa-i-cursor"></i></button><i class="fas fa-calendar-alt"></i></div>`;
                break;
            case 'Radio':
            case 'Checkbox':
            case 'Chips':
            case 'Cards': {
                const icon = field.type === 'Radio' ? 'fa-circle' : field.type === 'Chips' ? 'fa-tag' : 'fa-square';
                const rawOptionCount = Array.isArray(field.options) ? field.options.length : 0;
                const parsedCols = parseInt(field.optionColumns, 10);
                const previewCols = parsedCols > 1 ? Math.min(Math.max(parsedCols, 1), 4) : (rawOptionCount >= 8 ? 3 : rawOptionCount >= 5 ? 2 : 1);
                html += `<div class="mf-preview-options${previewCols > 1 ? ' mf-preview-options-cols-' + previewCols : ''}">`;
                (field.options || []).slice(0, 6).forEach((opt: any) => {
                    html += `<label class="mf-preview-option"><i class="far ${icon}"></i> <span>${B.escHtml(opt.label)}</span></label>`;
                });
                if (field.options && field.options.length > 6) html += `<small class="mf-preview-more">+${field.options.length - 6} more</small>`;
                html += '</div>';
                html += renderPlaceholderHint(field);
                break;
            }
            case 'File':
                html += `<div class="mf-preview-file"><i class="fas fa-cloud-upload-alt"></i> <span>${B.escHtml(getPlaceholderText(field, 'Click or drag to upload'))}</span></div>`;
                break;
            case 'Rating':
                {
                    const style = String((field.widgetProps && field.widgetProps.ratingStyle) || 'star').toLowerCase();
                    const preview = style === 'emoji' ? '&#9785; &#9785; &#9786; &#9786; &#9786;' :
                        style === 'heart' ? '&#9829;&#9829;&#9829;&#9829;&#9825;' :
                        style === 'thumbs' ? '&#128077; &#128078;' :
                        '&#9733;&#9733;&#9733;&#9733;&#9734;';
                    html += '<div class="mf-preview-rating mf-preview-rating-' + B.escHtml(style) + '">' + preview + '</div>';
                }
                html += renderPlaceholderHint(field);
                break;
            case 'Signature':
                html += `<div class="mf-preview-signature"><i class="fas fa-pen-nib"></i> ${B.escHtml(getPlaceholderText(field, 'Sign here'))}</div>`;
                break;
            case 'Razor': {
                // Inline canvas preview: call the plugin's render() to drop
                // the .mfw-razor-wrap element + schedule bind() so the slot
                // fetches the real HTML from the server. Idempotent — the
                // plugin marks each wrap with __mfRazorBound so canvas
                // re-renders don't re-fetch.
                const W: any = (window as any).MegaFormWidgets;
                const plug = W && W.getPlugin ? W.getPlugin('Razor') : null;
                if (plug && typeof plug.render === 'function') {
                    html += String(plug.render(field, B.state.formId || 0) || '');
                    setTimeout(function () {
                        try { if (plug && typeof plug.bind === 'function') plug.bind(B.state.formId || 0); }
                        catch (_e) { /* ignore */ }
                    }, 0);
                } else {
                    const tplName = (field.widgetProps && (field.widgetProps.templateName || field.widgetProps.template)) || 'SqlTablePivot';
                    html += `<div class="mf-preview-widget" style="padding:10px 14px;background:#faf5ff;border:1px dashed #c4b5fd;border-radius:8px;color:#6d28d9;font-size:13px"><i class="fa-solid fa-code"></i> Razor template: <strong>${B.escHtml(tplName)}</strong> <small style="color:#94a3b8;margin-left:6px">(plugin not loaded — preview in form view)</small></div>`;
                }
                break;
            }
            case 'Composite': {
                // [B172] Render the REAL per-preset sub-input layout (phone =
                // country/area/number/ext, address rows, dob d/m/y, …) so the
                // builder canvas matches what the runtime form shows — was a
                // generic "Composite Widget" box before. The whole preview is
                // pointer-events:none (the "interaction mask", Umbraco-style) so a
                // click selects/drags the composite as ONE unit instead of focusing
                // a sub-input; per-part editing happens in the Composite Designer.
                const partsResolver = (window as any).MFCompositeParts;
                let parts: any[] = [];
                try { parts = (typeof partsResolver === 'function' ? partsResolver(field) : (field.widgetProps && field.widgetProps.parts)) || []; } catch (_e) { parts = []; }
                const preset = String((field.widgetProps && field.widgetProps.preset) || field.preset || '');
                if (!parts.length) {
                    html += `<div class="mf-field-preview-input mf-composite-preview-empty" style="pointer-events:none"><i class="fas fa-object-group"></i> Composite${preset ? ' · ' + B.escHtml(preset) : ' (no preset)'}</div>`;
                    html += renderPlaceholderHint(field);
                    break;
                }
                // [Fidelity v20260616] Match the RUNTIME layout exactly: group parts into rows by
                // their `row` index (address = Street / Apt / City|State|Zip), size each cell with
                // the SHARED compositeCellStyle (fraction + flex widths), put the sub-label BELOW
                // the box (Gravity-style, like the form), and render any literal `sep` ("/" for DOB,
                // ":" for Time) OUTSIDE the box between cells. Was: all parts crammed into one row
                // with a width calc that broke on fraction tokens.
                const visible = parts.filter((p: any) => p && !p.hidden);
                const rowMap: Record<number, string[]> = {};
                const rowOrder: number[] = [];
                visible.forEach((p: any) => {
                    const r = (p.row != null) ? p.row : 0;
                    if (!rowMap[r]) { rowMap[r] = []; rowOrder.push(r); }
                    const cap = B.escHtml(String(p.sublabel || p.label || ''));
                    const ph  = B.escHtml(String(p.placeholder || p.def || ''));
                    const t = String(p.type || '').toLowerCase();
                    const isSelect = t === 'select';
                    const isCountry = t === 'country';
                    const inner = isCountry
                        ? `<span class="mf-comp-prev-ph">${ph || '+1'}</span><i class="fas fa-caret-down"></i>`
                        : isSelect
                          ? `<span class="mf-comp-prev-ph">${ph || cap || 'Select'}</span><i class="fas fa-caret-down"></i>`
                          : `<span class="mf-comp-prev-ph">${ph}</span>`;
                    const cell = `<div class="mf-comp-prev-cell" style="${compositeCellStyle(p)};display:flex;flex-direction:column;gap:3px;">`
                          + `<div class="mf-comp-prev-box${(isSelect || isCountry) ? ' is-select' : ''}">${inner}</div>`
                          + (cap ? `<span class="mf-comp-prev-sub">${cap}</span>` : '')
                          + `</div>`;
                    const sep = p.sep
                        ? `<span class="mf-comp-prev-sep" aria-hidden="true" style="align-self:flex-start;display:flex;align-items:center;height:34px;padding:0 1px;color:#64748b;font-weight:700;">${B.escHtml(String(p.sep))}</span>`
                        : '';
                    rowMap[r].push(cell + sep);
                });
                const rowsHtml = rowOrder.map((r) => `<div class="mf-comp-prev-row" style="display:flex;gap:8px;align-items:flex-start;">${rowMap[r].join('')}</div>`).join('');
                const orient = String((field.widgetProps && field.widgetProps.orient) || 'horizontal').toLowerCase() === 'vertical' ? 'vertical' : 'horizontal';
                // Inline pointer-events:none = the interaction mask. It cascades to the
                // whole subtree so clicks/drag fall through to the field card (select +
                // open the Composite Designer) instead of landing on a sub-input cell.
                // align-items:stretch OVERRIDES the legacy `.mf-composite-preview{align-items:flex-end}`
                // (a single-row leftover) — without it the new row stack collapses to content width and
                // hugs the right. Stretch → rows fill the card → flex cells (street/city) fill correctly.
                html += `<div class="mf-composite-preview mf-comp-orient-${orient}" data-preset="${B.escHtml(preset)}" style="pointer-events:none;display:flex;flex-direction:column;align-items:stretch;gap:6px;">${rowsHtml}</div>`;
                html += renderPlaceholderHint(field);
                break;
            }
            default: {
                if (typeof MegaFormWidgets !== 'undefined' && MegaFormWidgets.getPluginMeta) {
                    const meta = MegaFormWidgets.getPluginMeta(field.type);
                    if (meta) {
                        html += '<div class="mf-preview-widget"><div style="display:flex;align-items:center;gap:6px;padding:6px 0;color:#64748b;font-size:11px">';
                        if (meta.icon) html += `<i class="${normalizeIcon(meta.icon)}"></i>`;
                        const widgetLabel = B.getLocalizedControlLabel ? B.getLocalizedControlLabel(field.type, meta.label || field.type) : (meta.label || field.type);
                        html += `${widgetLabel} Widget</div></div>`;
                        html += renderPlaceholderHint(field);
                        break;
                    }
                }
                html += `<div class="mf-field-preview-input" data-inline-placeholder="1"><span class="mf-inline-placeholder-text" data-inline-text>${B.escHtml(field.placeholder || '')}</span><button type="button" class="mf-inline-placeholder-edit" data-inline-edit aria-label="Edit placeholder"><i class="fas fa-i-cursor"></i></button></div>`;
            }
        }
        return html;
    }

    function refreshInteractions(): void {
        const container = B.el(B.EL.canvasFields) as HTMLElement | null;
        setPaletteDragging(false);
        initPaletteDrag();
        if (container) {
            initMainSortable(container);
            initRowSortables(container);
        }
    }

    // =========================================================
    //  FIELD ACTIONS
    // =========================================================
    function selectField(index: number): void {
        B.state.selectedFieldIndex = index;
        B.state._rowFieldRef = null;
        render();
        B.callModule('properties', 'showProps', [B.state.schema.fields[index]]);
        // [2026-06-10] Selecting a control/widget on the canvas auto-expands its
        // Field Properties accordion on the right pane so the user sees the
        // properties immediately (no extra click). Defer one frame so showProps
        // has populated #mf-field-props before the accordion moves it.
        try { setTimeout(function () { try { (window as any).MFDesignOpenField && (window as any).MFDesignOpenField(); } catch (_e) { /* */ } }, 0); } catch (_e) { /* */ }
    }

    function duplicateFieldTreeWithNewKeys(field: any): any {
        const copy = JSON.parse(JSON.stringify(field || {}));
        function rekey(node: any): any {
            if (!node || typeof node !== 'object') return node;
            node.key = B.generateFieldKey(node.type || 'field');
            if (node.type === 'Row' && Array.isArray(node.columns)) {
                node.columns.forEach((col: any) => {
                    if (!col || !Array.isArray(col.fields)) return;
                    col.fields = col.fields.map((child: any) => rekey(child));
                });
            }
            return node;
        }
        return rekey(copy);
    }

    function duplicateField(index: number): void {
        const original = B.state.schema.fields[index];
        const copy = duplicateFieldTreeWithNewKeys(original);
        B.state.schema.fields.splice(index + 1, 0, copy);
        B.state.selectedFieldIndex = index + 1;
        B.state._rowFieldRef = null;
        B.state.isDirty = true;
        if (B.syncSchemaToHtmlImmediate) {
            B.syncSchemaToHtmlImmediate({
                reason: 'duplicate-field',
                insertKey: copy.key,
                insertAfterKey: original && original.key ? original.key : ''
            });
        }
        render();
        B.callModule('properties', 'showProps', [copy]);
    }

    /**
     * [RecursiveRowDelete v20260506-07] When the field being deleted is a Row,
     * cascade-collect every nested key in field.columns[].fields[] so the
     * sync layer also drops the orphan inputs (previously they stayed in
     * formData/HTML, then re-rendered with no parent → ghost controls).
     */
    function collectFieldKeysRecursive(field: any): string[] {
        if (!field) return [];
        const out: string[] = [];
        if (field.key) out.push(field.key);
        if (Array.isArray(field.columns)) {
            for (const col of field.columns) {
                if (!col || !Array.isArray(col.fields)) continue;
                for (const child of col.fields) {
                    out.push(...collectFieldKeysRecursive(child));
                }
            }
        }
        // Also handle subform-style nested children if present
        if (Array.isArray(field.fields)) {
            for (const child of field.fields) out.push(...collectFieldKeysRecursive(child));
        }
        return out;
    }

    function deleteField(index: number): void {
        if (!confirm('Delete this field?')) return;
        const target = B.state.schema.fields[index];
        const removedKeys = collectFieldKeysRecursive(target);
        (window as any).__MF_RECURSIVE_DELETE_BADGE__ = 'RecursiveRowDelete v20260506-07';
        B.state.schema.fields.splice(index, 1);
        B.state.selectedFieldIndex = -1;
        B.state._rowFieldRef = null;
        B.state.isDirty = true;
        if (B.syncSchemaToHtmlImmediate) B.syncSchemaToHtmlImmediate({ reason: 'delete-field', removeKeys: removedKeys });
        B.callModule('properties', 'hideProps');
        render();
    }

    B.registerModule('canvas', {
        init: initModule, render, refreshInteractions, selectField, duplicateField, deleteField, removeFieldFromRow, duplicateRowField, deleteRowField,
        // [PaletteRaceFix v20260506-05] Public hook: templates.ts calls this after
        // applyTemplate so the palette catches any plugins that registered late
        // (e.g. PdfForm's bundle is the last script to load on a fresh page).
        refreshPalette: populatePluginPalette
    });
})();

export {};
