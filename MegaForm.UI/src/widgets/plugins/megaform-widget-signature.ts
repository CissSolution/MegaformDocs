/**
 * MegaForm Widget: E-Signature — TypeScript canonical source
 *
 * Compile: tsc --project MegaForm.UI/src/widgets/plugins/tsconfig.json
 * Output:  Assets/js/plugins/megaform-widget-signature.js
 *
 * 1:1 migration of the legacy hand-written JS at Assets/js/plugins/megaform-widget-signature.js
 * so the widget joins the canonical TS family (qrcode, content-slider, subform, etc.).
 * Behavior preserved exactly — only added type annotations and module surface.
 *
 * Badge: SignatureWidgetTS v20260502-05
 *  - Compact styling (CSS reduces canvas height + cleaner border)
 *  - Pen-icon placeholder shown on empty canvas (.is-empty class), removed on first stroke
 *  - Submission view + print rules handled in megaform-widget-signature.css
 */
(function () {
    'use strict';

    var W: any = (window as any).MegaFormWidgets;
    var BADGE = 'SignatureWidgetTS v20260502-05';
    if (typeof window !== 'undefined') (window as any).__MF_SIGNATURE_WIDGET_BADGE__ = BADGE;

    interface SigState {
        canvas: HTMLCanvasElement;
        ctx: CanvasRenderingContext2D;
        drawing: boolean;
        hasDrawn: boolean;
        hidden: HTMLInputElement;
        wrap: HTMLElement;
        penColor: string;
        penWidth: number;
        dpr: number;
        w: number;
        h: number;
        _inited?: boolean;
    }

    function esc(s: any): string {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    var instances: Record<string, SigState> = {};

    function initCanvas(state: SigState): void {
        var canvas = state.canvas;
        var dpr = window.devicePixelRatio || 1;
        var w = canvas.offsetWidth || canvas.clientWidth || 400;
        var h = canvas.offsetHeight || canvas.clientHeight || 160;
        if (w < 10) w = 400; // hidden page fallback
        if (h < 10) h = 160;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        var ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        state.ctx = ctx;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        state.dpr = dpr;
        state.w = w;
        state.h = h;
        state._inited = true;
    }

    function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
        var rect = canvas.getBoundingClientRect();
        var src: any = (e as TouchEvent).touches ? (e as TouchEvent).touches[0] : (e as MouseEvent);
        // Scale mouse coords to match canvas CSS size (not physical pixels)
        var scaleX = (canvas.offsetWidth || rect.width) / rect.width;
        var scaleY = (canvas.offsetHeight || rect.height) / rect.height;
        return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
    }

    function saveData(state: SigState): void {
        if (!state.hasDrawn) {
            state.hidden.value = '';
            return;
        }
        // Export at display resolution (not HiDPI)
        var tmp = document.createElement('canvas');
        tmp.width = state.w;
        tmp.height = state.h;
        var tctx = tmp.getContext('2d')!;
        tctx.drawImage(state.canvas, 0, 0, state.w, state.h);
        state.hidden.value = tmp.toDataURL('image/png');
        // Timestamp
        var tsEl = state.wrap.querySelector('.mfw-sig-ts');
        if (tsEl) tsEl.textContent = 'Signed: ' + new Date().toLocaleString();
    }

    function clearSig(state: SigState): void {
        state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
        state.hasDrawn = false;
        state.hidden.value = '';
        var tsEl = state.wrap.querySelector('.mfw-sig-ts');
        if (tsEl) tsEl.textContent = '';
        // [SignatureWidgetTS v20260502-05] restore pen-icon placeholder
        try { state.canvas.classList.add('is-empty'); } catch (_e1) {}
        try { state.wrap.classList.remove('is-signed'); } catch (_e2) {}
    }

    // ---------- Plugin Registration ----------
    W.register('Signature', {
        meta: { label: 'E-Signature', icon: 'fa-signature', category: 'advanced' },
        defaults: { penColor: '#1a1a2e', penWidth: 2.5, bgColor: '#ffffff', height: 160, showTimestamp: true, typedMode: true, placeholderText: 'Sign here', clearText: 'Clear', undoText: 'Undo' },
        properties: [
            { key: 'penColor', label: 'Pen Color', type: 'color', default: '#1a1a2e' },
            { key: 'penWidth', label: 'Pen Width', type: 'number', default: 2.5 },
            { key: 'bgColor', label: 'Background', type: 'color', default: '#ffffff' },
            { key: 'height', label: 'Canvas Height (px)', type: 'number', default: 160 },
            { key: 'placeholderText', label: 'Placeholder Text', type: 'text', default: 'Sign here' },
            { key: 'clearText', label: 'Clear Button Text', type: 'text', default: 'Clear' },
            { key: 'undoText', label: 'Undo Button Text', type: 'text', default: 'Undo' },
            { key: 'showTimestamp', label: 'Show Timestamp', type: 'checkbox', default: true },
            { key: 'typedMode', label: 'Allow Typed Signature', type: 'checkbox', default: true }
        ],
        render: function (field: any, formId: number, val: any): string {
            var id = 'mf-' + formId + '-' + field.key;
            var wp = field.widgetProps || {};
            var h = parseInt(wp.height) || 160;
            var typed = wp.typedMode !== false;
            var showTs = wp.showTimestamp !== false;
            var html = '<div class="mfw-sig-wrap" id="' + id + '-wrap" data-field-key="' + esc(field.key) + '">';
            // Tabs: Draw | Type
            if (typed) {
                html += '<div class="mfw-sig-tabs">' +
                    '<button type="button" class="mfw-sig-tab active" data-mode="draw">✏️ Draw</button>' +
                    '<button type="button" class="mfw-sig-tab" data-mode="type">⌨️ Type</button></div>';
            }
            // Draw mode
            // [SignatureWidgetTS v20260502-05] Add canvas .is-empty + placeholder
            // (pen icon + "Sign here" hint) shown until first stroke.
            html += '<div class="mfw-sig-draw-area" id="' + id + '-draw">' +
                '<canvas id="' + id + '-canvas" class="mfw-sig-canvas is-empty" style="height:' + h + 'px;background:' + esc(wp.bgColor || '#fff') + '"></canvas>' +
                '<div class="mfw-sig-placeholder" aria-hidden="true">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>' +
                '<span>' + esc(wp.placeholderText || 'Sign here') + '</span>' +
                '</div>' +
                '<div class="mfw-sig-actions">' +
                '<button type="button" class="mfw-sig-clear" data-id="' + id + '">✕ Clear</button>' +
                (showTs ? '<span class="mfw-sig-ts" id="' + id + '-ts"></span>' : '') +
                '</div></div>';
            // Type mode
            if (typed) {
                html += '<div class="mfw-sig-type-area" id="' + id + '-type" style="display:none;">' +
                    '<input type="text" class="mfw-sig-typed-input" id="' + id + '-typed" placeholder="Type your name..." maxlength="100">' +
                    '<div class="mfw-sig-typed-preview" id="' + id + '-preview"></div></div>';
            }
            html += '<input type="hidden" name="' + field.key + '" id="' + id + '" value="' + esc(val || '') + '">';
            html += '<div class="mf-field-error" id="mf-err-' + field.key + '"></div></div>';
            return html;
        },
        bind: function (formId: number): void {
            var nodeList = document.querySelectorAll('.mfw-sig-wrap');
            for (var wi = 0; wi < nodeList.length; wi++) {
                var wrap = nodeList[wi] as HTMLElement;
                var canvas = wrap.querySelector('.mfw-sig-canvas') as HTMLCanvasElement | null;
                if (!canvas || (canvas as any)._sigBound) continue;
                (canvas as any)._sigBound = true;
                var hidden = wrap.querySelector('input[type="hidden"]') as HTMLInputElement;
                var fieldKey = wrap.getAttribute('data-field-key') || '';
                var id = 'mf-' + formId + '-' + fieldKey;
                var ctx = canvas.getContext('2d')!;
                var state: SigState = {
                    canvas: canvas,
                    ctx: ctx,
                    drawing: false,
                    hasDrawn: false,
                    hidden: hidden,
                    wrap: wrap,
                    penColor: '#1a1a2e',
                    penWidth: 2.5,
                    dpr: 1,
                    w: 400,
                    h: 160
                };
                initCanvas(state);
                instances[id] = state;

                // Re-init when canvas becomes visible (multi-page form)
                if (typeof IntersectionObserver !== 'undefined') {
                    (function (st: SigState, cv: HTMLCanvasElement, hi: HTMLInputElement) {
                        var obs = new IntersectionObserver(function (entries: IntersectionObserverEntry[]) {
                            if (entries[0].isIntersecting && cv.offsetWidth > 10) {
                                var oldW = st.w;
                                initCanvas(st);
                                // Restore drawing if size changed
                                if (oldW !== st.w && hi.value && hi.value.indexOf('data:') === 0) {
                                    var rimg = new Image();
                                    rimg.onload = function () { st.ctx.drawImage(rimg, 0, 0, st.w, st.h); st.hasDrawn = true; };
                                    rimg.src = hi.value;
                                }
                            }
                        }, { threshold: 0.1 });
                        obs.observe(cv);
                    })(state, canvas, hidden);
                }
                // Restore existing
                if (hidden.value && hidden.value.indexOf('data:') === 0) {
                    (function (st: SigState, cv: HTMLCanvasElement, wr: HTMLElement) {
                        var img_1 = new Image();
                        img_1.onload = function () {
                            st.ctx.drawImage(img_1, 0, 0, st.w, st.h);
                            st.hasDrawn = true;
                            // [SignatureWidgetTS v20260502-05] hide placeholder when value restored
                            try { cv.classList.remove('is-empty'); } catch (_e1) {}
                            try { wr.classList.add('is-signed'); } catch (_e2) {}
                        };
                        img_1.src = st.hidden.value;
                    })(state, canvas, wrap);
                }
                // Drawing events — IIFE captures `state`, `ctx`, `canvas`, `wrap` per iteration
                (function (st: SigState, c: HTMLCanvasElement, cx: CanvasRenderingContext2D, wr: HTMLElement) {
                    function startDraw(e: any): void {
                        e.preventDefault();
                        st.drawing = true;
                        var p = getPos(e, c);
                        cx.beginPath();
                        cx.moveTo(p.x, p.y);
                    }
                    function moveDraw(e: any): void {
                        if (!st.drawing) return;
                        e.preventDefault();
                        var p = getPos(e, c);
                        cx.strokeStyle = st.penColor;
                        cx.lineWidth = st.penWidth;
                        cx.lineCap = 'round';
                        cx.lineJoin = 'round';
                        cx.lineTo(p.x, p.y);
                        cx.stroke();
                        cx.beginPath();
                        cx.moveTo(p.x, p.y);
                        if (!st.hasDrawn) {
                            // [SignatureWidgetTS v20260502-05] hide placeholder on first stroke
                            try { c.classList.remove('is-empty'); } catch (_e1) {}
                            try { wr.classList.add('is-signed'); } catch (_e2) {}
                        }
                        st.hasDrawn = true;
                    }
                    function endDraw(): void {
                        if (st.drawing) {
                            st.drawing = false;
                            saveData(st);
                        }
                    }
                    c.addEventListener('mousedown', startDraw);
                    c.addEventListener('mousemove', moveDraw);
                    c.addEventListener('mouseup', endDraw);
                    c.addEventListener('mouseleave', endDraw);
                    c.addEventListener('touchstart', startDraw, { passive: false });
                    c.addEventListener('touchmove', moveDraw, { passive: false });
                    c.addEventListener('touchend', endDraw);
                    // Clear button
                    var clearBtn = wr.querySelector('.mfw-sig-clear');
                    if (clearBtn) clearBtn.addEventListener('click', function () { clearSig(st); });
                    // Tab switching
                    var tabs = wr.querySelectorAll('.mfw-sig-tab');
                    for (var ti = 0; ti < tabs.length; ti++) {
                        (function (tab: Element) {
                            tab.addEventListener('click', function () {
                                var allTabs = wr.querySelectorAll('.mfw-sig-tab');
                                for (var aj = 0; aj < allTabs.length; aj++) allTabs[aj].classList.remove('active');
                                tab.classList.add('active');
                                var mode = tab.getAttribute('data-mode');
                                var drawEl = wr.querySelector('.mfw-sig-draw-area') as HTMLElement | null;
                                var typeEl = wr.querySelector('.mfw-sig-type-area') as HTMLElement | null;
                                if (drawEl) drawEl.style.display = mode === 'draw' ? '' : 'none';
                                if (typeEl) typeEl.style.display = mode === 'type' ? '' : 'none';
                            });
                        })(tabs[ti]);
                    }
                    // Typed signature
                    var typedInput = wr.querySelector('.mfw-sig-typed-input') as HTMLInputElement | null;
                    var preview = wr.querySelector('.mfw-sig-typed-preview') as HTMLElement | null;
                    if (typedInput && preview) {
                        typedInput.addEventListener('input', function () {
                            var name = typedInput!.value.trim();
                            preview!.textContent = name;
                            if (name) {
                                // Render typed signature to canvas → PNG
                                var tc = document.createElement('canvas');
                                tc.width = st.w;
                                tc.height = st.h;
                                var tctx = tc.getContext('2d')!;
                                tctx.fillStyle = '#ffffff';
                                tctx.fillRect(0, 0, tc.width, tc.height);
                                tctx.font = "italic 36px 'Dancing Script', 'Brush Script MT', cursive";
                                tctx.fillStyle = st.penColor;
                                tctx.textAlign = 'center';
                                tctx.textBaseline = 'middle';
                                tctx.fillText(name, tc.width / 2, tc.height / 2);
                                st.hidden.value = tc.toDataURL('image/png');
                            } else {
                                st.hidden.value = '';
                            }
                        });
                    }
                    // Resize handling
                    var resizeTimer: number;
                    window.addEventListener('resize', function () {
                        clearTimeout(resizeTimer);
                        resizeTimer = window.setTimeout(function () { initCanvas(st); }, 200);
                    });
                })(state, canvas, ctx, wrap);
            }
        },
        collect: function (key: string, container: HTMLElement): string {
            var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
            return el ? el.value : '';
        },
        validate: function (key: string, container: HTMLElement): boolean {
            var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
            return !!(el && el.value);
        }
    });
})();
