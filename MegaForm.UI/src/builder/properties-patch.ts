/* ============================================================
   MegaForm Builder — Properties Module: activateTab patch  (TS source)
   File: megaform-builder-properties-patch.ts
   Compiled to: Assets/js/builder/megaform-builder-properties-patch.js
   Load AFTER megaform-builder-properties.js

   BUG #3 FIX (properties side):
   The activateTab() inside megaform-builder-properties.js only
   knows about 7 tabs (field/widget/settings/html/ai/embed/rules).
   When Print or Workflow tab is open and user clicks Field/Settings,
   the Print/Workflow pane stays visible behind the Field pane.

   This patch replaces the module's internal activateTab with a
   version that hides ALL 9 tab panes, including print and workflow.
   ============================================================ */

import { MegaFormBuilder } from './core';
(function () {
    'use strict';

    // All tab panes that exist in Builder.cshtml right panel
    // [v20260529-01] Added 'db' — without it, the DB tab pane stayed visible
    // when the user switched back to FIELD/SETTINGS/etc., so two tabs looked
    // active simultaneously.
    // [ThemeTab v20260602-B48] Added 'theme' — the new 10th right-rail tab
    // hosting inline Theme Designer (Colors/Type/Space/Effects + presets).
    const ALL_TAB_PANES = [
        'field', 'widget', 'settings', 'html', 'theme', 'ai', 'db', 'embed', 'rules', 'perms', 'workflow', 'print'
    ] as const;

    type TabName = typeof ALL_TAB_PANES[number];

    // Badge set immediately so we know patch module loaded even before panel exists
    if (typeof window !== 'undefined') (window as any).__MF_TAB_ACTIVATE_PATCH_BADGE__ = 'TabActivatePatch v20260430-08';

    function patchActivateTab(): void {
        // Strategy: add a global delegated click handler on .mf-right-tab[data-tab]
        // in CAPTURE phase that calls preventDefault + hides ALL panes + shows target.
        // Works for all 10 tabs (the 7 known + perms/workflow/print) which the legacy
        // properties.js handler doesn't cover — its skipping caused <a href="#"> default
        // navigation on Access/Flow/Print → Blazor Server router → page reset to /.

        const panel = document.getElementById('mf-panel-right');
        if (!panel) {
            // Panel not built yet — retry. Builder dom.ts builds it asynchronously.
            setTimeout(patchActivateTab, 200);
            return;
        }

        if (panel.dataset.mfTabPatchApplied === '1') return; // idempotent
        panel.dataset.mfTabPatchApplied = '1';

        // [B65o] Design Studio = INLINE ACCORDION (no popup). Click an
        // accordion head: move the source tab body (mf-field-props /
        // mf-tab-settings / mf-tab-html) into that item's body container,
        // expand it, close any other open item. Source bodies are stashed
        // back to their original parents when collapsing so other code that
        // queries them by id still resolves them.
        panel.addEventListener('click', function (e: MouseEvent) {
            const target = e.target as HTMLElement;
            const head = target.closest<HTMLElement>('[data-mf-design-toggle]');
            if (!head) return;
            const which = head.getAttribute('data-mf-design-toggle') || 'field';
            e.preventDefault();
            e.stopPropagation();
            toggleAccordion(which);
        }, true);

        function getAccordionSource(which: string): HTMLElement | null {
            const id = which === 'field' ? 'mf-field-props'
                     : which === 'settings' ? 'mf-tab-settings'
                     : which === 'html' ? 'mf-tab-html'
                     : 'mf-tab-' + which;
            return document.getElementById(id);
        }

        function collapseAllAccordions(): void {
            const launcher = document.getElementById('mf-design-launcher');
            if (!launcher) return;
            const heads = launcher.querySelectorAll<HTMLElement>('[data-mf-design-toggle]');
            heads.forEach((h) => {
                const item = h.closest<HTMLElement>('.mf-design-acc-item');
                if (item) item.classList.remove('expanded');
                h.setAttribute('aria-expanded', 'false');
            });
            // Restore each source back to its original parent.
            const bodies = launcher.querySelectorAll<HTMLElement>('[data-mf-acc-body]');
            bodies.forEach((b) => {
                const child = b.firstChild as HTMLElement | null;
                if (!child) return;
                const orig = (child as any).__mfAccOriginalParent as HTMLElement | undefined;
                const origNext = (child as any).__mfAccOriginalNext as Node | undefined;
                const origDisplay = (child as any).__mfAccOriginalDisplay as string | undefined;
                if (orig) {
                    if (origNext && orig.contains(origNext)) orig.insertBefore(child, origNext);
                    else orig.appendChild(child);
                }
                if (origDisplay !== undefined) child.style.display = origDisplay;
                delete (child as any).__mfAccOriginalParent;
                delete (child as any).__mfAccOriginalNext;
                delete (child as any).__mfAccOriginalDisplay;
            });
        }

        function toggleAccordion(which: string): void {
            const launcher = document.getElementById('mf-design-launcher');
            if (!launcher) return;
            const item = launcher.querySelector<HTMLElement>('[data-mf-acc-id="' + which + '"]');
            const head = launcher.querySelector<HTMLElement>('[data-mf-design-toggle="' + which + '"]');
            const body = launcher.querySelector<HTMLElement>('[data-mf-acc-body="' + which + '"]');
            if (!item || !head || !body) return;
            const isOpen = item.classList.contains('expanded');
            collapseAllAccordions();
            if (isOpen) return; // toggle off
            const source = getAccordionSource(which);
            if (!source) return;
            // Stash original location to restore on collapse
            const origParent = source.parentElement;
            const origNext = source.nextSibling;
            const origDisplay = source.style.display;
            (source as any).__mfAccOriginalParent = origParent;
            (source as any).__mfAccOriginalNext = origNext;
            (source as any).__mfAccOriginalDisplay = origDisplay;
            source.style.display = '';
            body.appendChild(source);
            item.classList.add('expanded');
            head.setAttribute('aria-expanded', 'true');
            try { item.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch { /* noop */ }
        }
        // [B87] Ensure-open (not toggle): opens an accordion item if it isn't
        // already expanded. Used to keep Field Properties open by default and
        // whenever a field is selected, so the user never has to click to expand.
        function ensureAccordionOpen(which: string): void {
            const launcher = document.getElementById('mf-design-launcher');
            if (!launcher) return;
            const item = launcher.querySelector<HTMLElement>('[data-mf-acc-id="' + which + '"]');
            if (item && item.classList.contains('expanded')) return; // already open
            toggleAccordion(which);
        }
        // Expose for click-on-canvas → auto-open Field accordion logic if any
        try { (window as any).MFDesignToggle = toggleAccordion; } catch { /* noop */ }
        try { (window as any).MFDesignOpenField = function () { ensureAccordionOpen('field'); }; } catch { /* noop */ }
        // [B87] Field Properties expanded by default.
        try { ensureAccordionOpen('field'); } catch { /* noop */ }

        panel.addEventListener('click', function (e: MouseEvent) {
            const target = e.target as HTMLElement;
            const link = target.closest<HTMLElement>('.mf-right-tab[data-tab]');
            if (!link) return;

            const tabName = link.getAttribute('data-tab');
            if (!tabName) return;

            // CRITICAL: tabs are <a href="#"> — without preventDefault, browser navigates
            // to "#" → Blazor Server router intercepts → page reset to /. The legacy
            // properties.js handler covers 7 tabs (field/widget/settings/html/ai/embed/rules)
            // and calls preventDefault for those. ACCESS / FLOW / PRINT (perms/workflow/print)
            // were not in that list → click cascaded to default nav → blank page.
            // Always preventDefault here so all 10 tabs work consistently.
            // NOTE: do NOT stopPropagation — Workflow / Print tabs have their own bubble-phase
            // lazy-init listeners (in dom.ts ~1073, 1114) that need to fire on first click.
            e.preventDefault();

            // Hide ALL panes (including print and workflow which properties.js misses)
            ALL_TAB_PANES.forEach(t => {
                const pane = document.getElementById('mf-tab-' + t);
                if (pane) pane.style.display = 'none';
            });

            // Show the target pane
            const targetPane = document.getElementById('mf-tab-' + tabName);
            if (targetPane) targetPane.style.display = '';

            // Update active class on all links
            panel.querySelectorAll<HTMLElement>('.mf-right-tab[data-tab]').forEach(l => {
                l.classList.toggle('active', l.getAttribute('data-tab') === tabName);
            });
        }, true); // capture phase: runs before properties.js bubbling handler

        // [B65e Evoq toggle + HTML editor wiring] runs once per panel
        wireEvoqToggles();
        wireHtmlEditors();
        // [B65p] Submit button appearance live-preview wiring
        wireSubmitAppearance();
        // [B65w] Form display style live-preview wiring (corners + shadow + border)
        wireFormStyle();
    }

    function wireFormStyle(): void {
        const radius = document.getElementById('mf-setting-form-radius') as HTMLSelectElement | null;
        const inputRadius = document.getElementById('mf-setting-input-radius') as HTMLSelectElement | null;
        const shadow = document.getElementById('mf-setting-form-shadow') as HTMLSelectElement | null;
        const border = document.getElementById('mf-setting-form-border') as HTMLSelectElement | null;
        const pad = document.getElementById('mf-setting-form-pad') as HTMLSelectElement | null;
        if (!radius && !inputRadius && !shadow && !border && !pad) return;
        // [2026-06-13] load saved "Form edge padding" into the select
        try {
            const B0: any = (window as any).MegaFormBuilder;
            const ds0 = B0 && B0.state && B0.state.schema && B0.state.schema.settings && (B0.state.schema.settings.displayStyle || B0.state.schema.settings.DisplayStyle);
            if (pad && ds0 && ds0.pad) pad.value = ds0.pad;
        } catch { /* defensive */ }
        // [B83k-DisplayStyleDefaultBugFix] When the host admin loads a page that
        // hosts a published form (e.g. /Home/<form-slug>), the builder bundle
        // boots its admin overlay and brings these Form Settings SELECTs along —
        // pre-selected to the historical defaults (radius=rounded, shadow=soft,
        // border=hairline). The original sync() unconditionally ADDED the
        // corresponding mf-style-* classes onto every .mf-form-wrapper on the
        // page, which painted an outer card chrome (1px slate border + soft
        // shadow + 8px radius) ON TOP of the form's own customHtml shell —
        // producing the "double card" the user reported. Now we only paint when
        // either (a) the schema has an explicit displayStyle saved, or (b) the
        // admin actively changed one of the SELECTs in THIS session.
        let userTouched = false;
        function hasExplicitDisplayStyle(): boolean {
            const B = (window as any).MegaFormBuilder;
            const stt = B && B.state && B.state.schema && B.state.schema.settings;
            const ds  = stt && (stt.displayStyle || stt.DisplayStyle);
            return !!(ds && (ds.radius || ds.inputRadius || ds.shadow || ds.border));
        }
        function applyClasses(target: Element | null | undefined): void {
            if (!target) return;
            const cl = (target as HTMLElement).classList;
            // Remove previous variants
            ['mf-style-radius-square','mf-style-radius-rounded','mf-style-radius-pill',
             'mf-style-input-square','mf-style-input-rounded','mf-style-input-pill',
             'mf-style-shadow-none','mf-style-shadow-soft','mf-style-shadow-medium','mf-style-shadow-large',
             'mf-style-border-none','mf-style-border-hairline','mf-style-border-prominent'].forEach(c => cl.remove(c));
            // [2026-06-13] Form edge padding (mobile) — NOT gated by the B83k double-card
            // guard: it only sets a CSS var for edge spacing, never card chrome, so it's
            // safe to reflect on every form. Default "comfortable" matches the CSS default.
            ['mf-style-pad-compact','mf-style-pad-comfortable','mf-style-pad-spacious'].forEach(c => cl.remove(c));
            const pv = pad ? pad.value : '';
            if (pv && pv !== 'comfortable') cl.add('mf-style-pad-' + pv);
            // [B83k] Skip apply when no explicit intent — keeps customHtml forms
            // from inheriting outer card chrome they don't want.
            if (!userTouched && !hasExplicitDisplayStyle()) return;
            const rv = radius ? radius.value : 'rounded';
            const iv = inputRadius ? inputRadius.value : 'rounded';
            const sv = shadow ? shadow.value : 'soft';
            const bv = border ? border.value : 'hairline';
            cl.add('mf-style-radius-' + (rv || 'rounded'));
            cl.add('mf-style-input-' + (iv || 'rounded'));
            cl.add('mf-style-shadow-' + (sv || 'soft'));
            cl.add('mf-style-border-' + (bv || 'hairline'));
        }
        function sync(): void {
            document.querySelectorAll('.mf-form-wrapper').forEach(applyClasses);
            const iframe = document.querySelector<HTMLIFrameElement>('.mf-theme-preview-frame');
            try {
                const doc = iframe && iframe.contentDocument;
                if (doc) doc.querySelectorAll('.mf-form-wrapper').forEach(applyClasses);
            } catch { /* cross-frame */ }
        }
        [radius, inputRadius, shadow, border].forEach((el) => {
            if (el) el.addEventListener('change', function () { userTouched = true; sync(); });
        });
        if (pad) pad.addEventListener('change', function () {
            try {
                const B0: any = (window as any).MegaFormBuilder;
                if (B0 && B0.state && B0.state.schema) {
                    const stt = B0.state.schema.settings || (B0.state.schema.settings = {});
                    const ds = stt.displayStyle || (stt.displayStyle = {});
                    ds.pad = pad.value;
                    B0.state.isDirty = true;
                }
            } catch { /* defensive */ }
            sync();
        });
        sync();
        window.addEventListener('message', function (ev) {
            const d = ev && ev.data;
            if (d && d.type === 'mf-theme-preview-ready') setTimeout(sync, 80);
        });
    }

    function wireSubmitAppearance(): void {
        const fullW = document.getElementById('mf-setting-submit-fullwidth') as HTMLInputElement | null;
        const align = document.getElementById('mf-setting-submit-align') as HTMLSelectElement | null;
        const variant = document.getElementById('mf-setting-submit-variant') as HTMLSelectElement | null;
        if (!fullW && !align && !variant) return;
        function applyToFormActions(target: Element | null | undefined): void {
            if (!target) return;
            const cl = (target as HTMLElement).classList;
            cl.remove('mf-submit-fullwidth', 'mf-submit-align-left', 'mf-submit-align-center', 'mf-submit-align-right', 'mf-submit-variant-primary', 'mf-submit-variant-outline', 'mf-submit-variant-ghost');
            if (fullW && fullW.checked) cl.add('mf-submit-fullwidth');
            const alignVal = align ? align.value : 'left';
            cl.add('mf-submit-align-' + (alignVal || 'left'));
            const varVal = variant ? variant.value : 'primary';
            cl.add('mf-submit-variant-' + (varVal || 'primary'));
        }
        function sync(): void {
            // Apply to all .mf-form-actions in current document AND inside iframe preview if present.
            document.querySelectorAll('.mf-form-actions').forEach(applyToFormActions);
            const iframe = document.querySelector<HTMLIFrameElement>('.mf-theme-preview-frame, iframe#mf-builder-preview-frame');
            try {
                const doc = iframe && iframe.contentDocument;
                if (doc) doc.querySelectorAll('.mf-form-actions').forEach(applyToFormActions);
            } catch { /* cross-frame guard */ }
        }
        [fullW, align, variant].forEach((el) => { if (el) el.addEventListener('change', sync); });
        sync();
        // Also reapply when iframe announces ready
        window.addEventListener('message', function (ev) {
            const d = ev && ev.data;
            if (d && d.type === 'mf-theme-preview-ready') setTimeout(sync, 80);
        });
    }

    function wireEvoqToggles(): void {
        const inputs = document.querySelectorAll<HTMLInputElement>('.mf-evoq-toggle-input');
        inputs.forEach((input) => {
            if ((input as any).__mfEvoqWired) return;
            (input as any).__mfEvoqWired = true;
            const card = input.closest<HTMLElement>('.mf-evoq-card');
            const labelEl = input.parentElement
                ? input.parentElement.querySelector<HTMLElement>('.mf-evoq-toggle-label')
                : null;
            const sync = (): void => {
                if (!card) return;
                card.classList.toggle('is-off', !input.checked);
                if (labelEl) labelEl.textContent = input.checked ? 'On' : 'Off';
            };
            input.addEventListener('change', sync);
            sync();
        });
    }

    // [B65v] Last-focused HTML editor area + saved selection range. The token
    // chip handler (capture phase below) inserts at the saved range so the
    // user can tap a chip without first re-clicking the editor.
    let lastFocusedArea: HTMLElement | null = null;
    let lastFocusedRange: Range | null = null;

    function wireHtmlEditors(): void {
        const editors = document.querySelectorAll<HTMLElement>('.mf-html-editor');
        editors.forEach((editor) => {
            if ((editor as any).__mfHtmlWired) return;
            (editor as any).__mfHtmlWired = true;
            const targetId = editor.getAttribute('data-mf-html-editor-for') || '';
            const targetEl = targetId ? document.getElementById(targetId) as HTMLTextAreaElement | null : null;
            const area = editor.querySelector<HTMLElement>('.mf-html-editor-area');
            const toolbar = editor.querySelector<HTMLElement>('.mf-html-editor-toolbar');
            if (!area) return;
            // Seed from existing textarea value
            if (targetEl && targetEl.value) {
                area.innerHTML = targetEl.value;
            }
            const syncOut = (): void => {
                if (!targetEl) return;
                targetEl.value = area.innerHTML.trim();
                try { targetEl.dispatchEvent(new Event('input', { bubbles: true })); } catch { /* noop */ }
                try { targetEl.dispatchEvent(new Event('change', { bubbles: true })); } catch { /* noop */ }
            };
            area.addEventListener('input', syncOut);
            area.addEventListener('blur', syncOut);
            // [B65v] Track focus + selection so a later token-chip click can
            // insert at the right caret position.
            area.addEventListener('focus', () => { lastFocusedArea = area; });
            area.addEventListener('keyup', () => {
                if (document.activeElement !== area) return;
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const r = sel.getRangeAt(0);
                    if (area.contains(r.commonAncestorContainer)) {
                        lastFocusedArea = area;
                        lastFocusedRange = r.cloneRange();
                    }
                }
            });
            area.addEventListener('mouseup', () => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const r = sel.getRangeAt(0);
                    if (area.contains(r.commonAncestorContainer)) {
                        lastFocusedArea = area;
                        lastFocusedRange = r.cloneRange();
                    }
                }
            });
            if (toolbar) {
                toolbar.addEventListener('mousedown', (e: MouseEvent) => {
                    const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-mf-html-cmd]');
                    if (!btn) return;
                    e.preventDefault(); // keep selection in the editor area
                    area.focus();
                    const raw = btn.getAttribute('data-mf-html-cmd') || '';
                    const parts = raw.split(':');
                    const cmd = parts[0];
                    let arg: string | undefined = parts[1];
                    if (cmd === 'createLink') {
                        const url = window.prompt('Enter URL', 'https://');
                        if (!url) return;
                        arg = url;
                    }
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (document as any).execCommand(cmd, false, arg);
                    } catch { /* noop */ }
                    syncOut();
                });
            }
        });
        wireTokenChipsForHtmlEditor();
    }

    // [B65v] Capture-phase token-chip handler. Existing post-submit-settings.ts
    // bubble handler still writes the token to the hidden textarea (for the
    // legacy textarea path). We also need to insert the token into the
    // VISIBLE contenteditable HTML editor at the last-saved caret position so
    // the user sees their click reflected immediately.
    function wireTokenChipsForHtmlEditor(): void {
        if ((document as any).__mfTokenChipCaptureWired) return;
        (document as any).__mfTokenChipCaptureWired = true;
        document.addEventListener('mousedown', (ev: MouseEvent) => {
            const chip = (ev.target as HTMLElement).closest<HTMLElement>('.mf-ps-token, [data-mf-token], [data-token]');
            if (!chip) return;
            // Prevent the chip from stealing focus so the editor selection
            // we cached on the previous mouseup remains usable.
            ev.preventDefault();
        }, true);
        document.addEventListener('click', (ev: MouseEvent) => {
            const chip = (ev.target as HTMLElement).closest<HTMLElement>('.mf-ps-token, [data-mf-token], [data-token]');
            if (!chip) return;
            const token = chip.getAttribute('data-token')
                       || chip.getAttribute('data-mf-token')
                       || (chip.textContent || '').trim();
            if (!token) return;
            const area = lastFocusedArea && lastFocusedArea.isConnected ? lastFocusedArea : null;
            if (!area) return; // no editor focused → let the legacy textarea path handle it
            ev.preventDefault();
            ev.stopPropagation();
            area.focus();
            // Restore the saved range if any, otherwise insert at end of area.
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                if (lastFocusedRange && area.contains(lastFocusedRange.commonAncestorContainer)) {
                    sel.addRange(lastFocusedRange);
                } else {
                    const endRange = document.createRange();
                    endRange.selectNodeContents(area);
                    endRange.collapse(false);
                    sel.addRange(endRange);
                }
            }
            // Insert the token text. execCommand is deprecated but still the
            // most widely-supported caret-preserving insertion path.
            let inserted = false;
            try { inserted = (document as any).execCommand('insertText', false, token); } catch { inserted = false; }
            if (!inserted && sel && sel.rangeCount > 0) {
                const r = sel.getRangeAt(0);
                r.deleteContents();
                r.insertNode(document.createTextNode(token));
                r.collapse(false);
            }
            // Re-save the new caret position
            if (sel && sel.rangeCount > 0) lastFocusedRange = sel.getRangeAt(0).cloneRange();
            // Trigger the editor's input handler so hidden textarea + listeners fire
            try { area.dispatchEvent(new Event('input', { bubbles: true })); } catch { /* noop */ }
        }, true);
    }

    function waitAndPatch(): void {
        if (typeof MegaFormBuilder === 'undefined') {
            setTimeout(waitAndPatch, 100);
            return;
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', patchActivateTab);
        } else {
            patchActivateTab();
        }
    }

    waitAndPatch();
})();

export {};
