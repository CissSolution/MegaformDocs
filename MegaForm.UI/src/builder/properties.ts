/* ============================================================
   MegaForm Builder — Properties Module
   File: megaform-builder-properties.js
   Depends on: megaform-builder-core.js
   ============================================================ */
import { MegaFormBuilder } from './core';
import { ensureFieldSettingsBadge, getActiveField, hasActiveFieldSelection } from './field-settings';
(function () {
    'use strict';
    var B = MegaFormBuilder;
    var currentField: any = null;  // field đang được chọn
    function initModule() {
        bindPropertyInputs();
        bindOptionButtons();
        bindDeleteButton();
        bindTabSwitching();
        bindPanelExpand();
        bindPanelCollapse();
        bindRightPanelResize();
        populateHtmlEditors();
        if (B.ensureBuilderVersionBadge) B.ensureBuilderVersionBadge();
        populateSettingsTab();   // init theme grid on load
    }
    function bindRightPanelResize() {
        var panel = document.getElementById('mf-panel-right') as HTMLElement | null;
        var handle = document.getElementById('mf-right-resizer') as HTMLElement | null;
        if (!panel || !handle) return;
        var root = document.documentElement;
        var storageKey = 'mf:right-panel-width';
        var dragging = false;
        var startX = 0;
        var startW = 0;
        function getBounds() {
            // [2026-06-10] min lowered to 300 so dragging can both narrow AND
            // widen the inspector (its CSS default is ~340px); max stays generous.
            return {
                min: 300,
                max: Math.max(720, Math.min(1240, Math.round(window.innerWidth * 0.78)))
            };
        }
        function applyWidth(next: number) {
            var bounds = getBounds();
            var width = Math.max(bounds.min, Math.min(bounds.max, Math.round(next)));
            root.style.setProperty('--mf-right-panel-width', width + 'px');
            root.style.setProperty('--mf-right-panel-expanded-width', Math.min(window.innerWidth - 32, width + 260) + 'px');
            panel.style.width = width + 'px';
            panel.style.minWidth = width + 'px';
            panel.style.maxWidth = width + 'px';
            handle.setAttribute('aria-valuenow', String(width));
            try { localStorage.setItem(storageKey, String(width)); } catch (_e) {}
        }
        function onMove(ev: PointerEvent | MouseEvent) {
            if (!dragging) return;
            var clientX = typeof (ev as any).clientX === 'number' ? (ev as any).clientX : startX;
            var delta = startX - clientX;
            applyWidth(startW + delta);
            document.body.classList.add('mf-resizing-right-panel');
        }
        function stop(ev?: Event) {
            if (!dragging) return;
            dragging = false;
            document.body.classList.remove('mf-resizing-right-panel');
            window.removeEventListener('pointermove', onMove as any, true);
            window.removeEventListener('pointerup', stop as any, true);
            window.removeEventListener('mousemove', onMove as any, true);
            window.removeEventListener('mouseup', stop as any, true);
            if (ev && (ev.target as any) && (ev.target as any).releasePointerCapture && (handle as any)._mfPointerId != null) {
                try { (ev.target as any).releasePointerCapture((handle as any)._mfPointerId); } catch (_e) {}
            }
            (handle as any)._mfPointerId = null;
        }
        try {
            var saved = localStorage.getItem(storageKey);
            if (saved) applyWidth(parseInt(saved, 10));
        } catch (_e) {}
        window.addEventListener('resize', function () {
            applyWidth(panel.getBoundingClientRect().width || parseInt(getComputedStyle(panel).width, 10) || getBounds().min);
        });
        handle.addEventListener('pointerdown', function(ev: PointerEvent) {
            ev.preventDefault();
            ev.stopPropagation();
            dragging = true;
            startX = ev.clientX;
            startW = panel.getBoundingClientRect().width;
            (handle as any)._mfPointerId = ev.pointerId;
            try { handle.setPointerCapture(ev.pointerId); } catch (_e) {}
            document.body.classList.add('mf-resizing-right-panel');
            window.addEventListener('pointermove', onMove as any, true);
            window.addEventListener('pointerup', stop as any, true);
        }, true);
        handle.addEventListener('mousedown', function(ev: MouseEvent) {
            if ((window as any).PointerEvent) return;
            ev.preventDefault();
            ev.stopPropagation();
            dragging = true;
            startX = ev.clientX;
            startW = panel.getBoundingClientRect().width;
            document.body.classList.add('mf-resizing-right-panel');
            window.addEventListener('mousemove', onMove as any, true);
            window.addEventListener('mouseup', stop as any, true);
        }, true);
    }
    // =========================================================
    //  LEFT & RIGHT PANEL FLY-IN / FLY-OUT
    // =========================================================
    function bindPanelCollapse() {
        // [B110] Deduplicate collapse listeners — panels.ts already wires these.
        // We keep this as a no-op safety net; real wiring lives in panels.ts.
        // Left panel
        var leftPanel = document.getElementById('mf-panel-left');
        var leftCollapseBtn = document.getElementById('mf-left-collapse-btn');
        var leftOpenBtn = document.getElementById('mf-left-open-btn');
        if (leftCollapseBtn && leftPanel && !leftCollapseBtn.dataset.mfCollapseWired) {
            leftCollapseBtn.dataset.mfCollapseWired = '1';
            leftCollapseBtn.addEventListener('click', function(e) {
                e.preventDefault();
                leftPanel.classList.add('mf-collapsed');
                if (leftOpenBtn) leftOpenBtn.style.display = '';
            });
        }
        if (leftOpenBtn && leftPanel && !leftOpenBtn.dataset.mfCollapseWired) {
            leftOpenBtn.dataset.mfCollapseWired = '1';
            leftOpenBtn.addEventListener('click', function(e) {
                e.preventDefault();
                leftPanel.classList.remove('mf-collapsed');
                leftOpenBtn.style.display = 'none';
            });
        }
        // Right panel
        var rightPanel = document.getElementById('mf-panel-right');
        var rightCollapseBtn = document.getElementById('mf-right-collapse-btn');
        var rightOpenBtn = document.getElementById('mf-right-open-btn');
        if (rightCollapseBtn && rightPanel && !rightCollapseBtn.dataset.mfCollapseWired) {
            rightCollapseBtn.dataset.mfCollapseWired = '1';
            rightCollapseBtn.addEventListener('click', function(e) {
                e.preventDefault();
                rightPanel.classList.add('mf-collapsed');
                if (rightOpenBtn) rightOpenBtn.style.display = '';
            });
        }
        if (rightOpenBtn && rightPanel && !rightOpenBtn.dataset.mfCollapseWired) {
            rightOpenBtn.dataset.mfCollapseWired = '1';
            rightOpenBtn.addEventListener('click', function(e) {
                e.preventDefault();
                rightPanel.classList.remove('mf-collapsed');
                rightOpenBtn.style.display = 'none';
            });
        }
    }

    function ensureSqlOptionsHelpStyles() {
        if (document.getElementById('mf-sql-options-help-style')) return;
        var style = document.createElement('style');
        style.id = 'mf-sql-options-help-style';
        style.textContent = '' +
            '.mf-sql-help{position:fixed;inset:0;z-index:200000;display:flex;align-items:center;justify-content:center;}' +
            '.mf-sql-help__backdrop{position:absolute;inset:0;background:rgba(15,23,42,.52);}' +
            '.mf-sql-help__dialog{position:relative;z-index:1;width:min(920px,calc(100vw - 32px));max-height:min(82vh,860px);overflow:auto;background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.35);border:1px solid #dbeafe;}' +
            '.mf-sql-help__head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px 14px;border-bottom:1px solid #e2e8f0;background:linear-gradient(180deg,#f8fbff,#ffffff);}' +
            '.mf-sql-help__title{margin:0;font-size:20px;font-weight:800;color:#0f172a;}' +
            '.mf-sql-help__sub{margin:6px 0 0;font-size:13px;line-height:1.5;color:#64748b;}' +
            '.mf-sql-help__close{border:0;background:transparent;font-size:24px;line-height:1;color:#64748b;cursor:pointer;padding:2px 4px;}' +
            '.mf-sql-help__body{padding:18px 20px 22px;display:grid;gap:14px;}' +
            '.mf-sql-help__card{border:1px solid #dbeafe;border-radius:14px;background:#f8fbff;padding:14px 16px;}' +
            '.mf-sql-help__card h4{margin:0 0 8px;font-size:14px;font-weight:800;color:#0f172a;}' +
            '.mf-sql-help__card p{margin:0 0 8px;font-size:13px;line-height:1.6;color:#334155;}' +
            '.mf-sql-help__card ul{margin:8px 0 0;padding-left:18px;color:#334155;font-size:13px;line-height:1.7;}' +
            '.mf-sql-help__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}' +
            '.mf-sql-help__code{display:block;background:#0f172a;color:#e2e8f0;border-radius:12px;padding:12px 14px;font:12px/1.6 Consolas,Menlo,monospace;white-space:pre-wrap;word-break:break-word;margin-top:8px;}' +
            '.mf-sql-help__pill{display:inline-flex;align-items:center;gap:6px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;margin:0 8px 8px 0;}' +
            '@media (max-width: 820px){.mf-sql-help__grid{grid-template-columns:1fr;}}';
        document.head.appendChild(style);
    }

    function closeSqlOptionsHelpModal() {
        var host = document.getElementById('mf-sql-options-help');
        if (host && host.parentNode) host.parentNode.removeChild(host);
    }

    function showSqlOptionsHelpModal() {
        ensureSqlOptionsHelpStyles();
        closeSqlOptionsHelpModal();
        var host = document.createElement('div');
        host.id = 'mf-sql-options-help';
        host.className = 'mf-sql-help';
        host.innerHTML = '' +
            '<div class="mf-sql-help__backdrop" data-close="1"></div>' +
            '<div class="mf-sql-help__dialog" role="dialog" aria-modal="true" aria-labelledby="mf-sql-help-title">' +
              '<div class="mf-sql-help__head">' +
                '<div>' +
                  '<h3 id="mf-sql-help-title" class="mf-sql-help__title">SQL Options Help</h3>' +
                  '<p class="mf-sql-help__sub">Use this for <strong>Select</strong>, <strong>Radio</strong>, and <strong>Checkbox</strong> fields when choices should come from a database instead of a static list.</p>' +
                '</div>' +
                '<button type="button" class="mf-sql-help__close" aria-label="Close" data-close="1">&times;</button>' +
              '</div>' +
              '<div class="mf-sql-help__body">' +
                '<div class="mf-sql-help__card">' +
                  '<h4>What the two modes mean</h4>' +
                  '<span class="mf-sql-help__pill">Static</span><span class="mf-sql-help__pill">Manual options you type once</span>' +
                  '<span class="mf-sql-help__pill">SQL</span><span class="mf-sql-help__pill">Options loaded at render time from the database</span>' +
                  '<p>Switch to <strong>From SQL query (dynamic)</strong> when the option list changes by year, department, portal, event, customer, or any other data-driven condition.</p>' +
                '</div>' +
                '<div class="mf-sql-help__grid">' +
                  '<div class="mf-sql-help__card">' +
                    '<h4>Basic SQL query</h4>' +
                    '<p>The first column becomes <strong>value</strong>. The second column becomes <strong>label</strong>. If only one column is returned, it is used for both.</p>' +
                    '<code class="mf-sql-help__code">SELECT EventId, EventName\nFROM MegaForm_Sample_Events\nORDER BY EventName</code>' +
                  '</div>' +
                  '<div class="mf-sql-help__card">' +
                    '<h4>Stored procedure</h4>' +
                    '<p>Choose <strong>Stored procedure</strong> in Query type, then enter the procedure name. It must return at least one column.</p>' +
                    '<code class="mf-sql-help__code">usp_MegaForm_EventOptions</code>' +
                  '</div>' +
                '</div>' +
                '<div class="mf-sql-help__grid">' +
                  '<div class="mf-sql-help__card">' +
                    '<h4>Cascading from other form fields</h4>' +
                    '<p>Use <strong>Depends on</strong> when the option list should react to values from other fields on the same form.</p>' +
                    '<ul>' +
                      '<li>Example Depends on: <code>year, region</code></li>' +
                      '<li>Then your SQL can use <code>:year</code> and <code>:region</code></li>' +
                      '<li>When those parent fields change, this control re-fetches options automatically</li>' +
                    '</ul>' +
                    '<code class="mf-sql-help__code">SELECT EventId, EventName\nFROM Events\nWHERE EventYear = :year\n  AND RegionCode = :region\nORDER BY EventName</code>' +
                  '</div>' +
                  '<div class="mf-sql-help__card">' +
                    '<h4>Query string values</h4>' +
                    '<p>Runtime also accepts values from the page URL. This is useful when the form is embedded in a page filtered by route or query string.</p>' +
                    '<ul>' +
                      '<li>URL example: <code>?year=2026&amp;region=APAC</code></li>' +
                      '<li>Those values are available to SQL as <code>:year</code> and <code>:region</code></li>' +
                      '<li>You can combine query string + Depends on + chosen filter values together</li>' +
                    '</ul>' +
                  '</div>' +
                '</div>' +
                '<div class="mf-sql-help__grid">' +
                  '<div class="mf-sql-help__card">' +
                    '<h4>Testing in the builder</h4>' +
                    '<ul>' +
                      '<li>Save the form first before using <strong>Test (preview options)</strong></li>' +
                      '<li>The builder asks the server for the saved schema, not the unsaved textarea only</li>' +
                      '<li>The preview shows the first rows returned, so you can confirm value/label mapping</li>' +
                    '</ul>' +
                  '</div>' +
                  '<div class="mf-sql-help__card">' +
                    '<h4>When to choose which control</h4>' +
                    '<ul>' +
                      '<li><strong>Select</strong>: long lists, compact UI</li>' +
                      '<li><strong>Radio</strong>: a few mutually exclusive choices</li>' +
                      '<li><strong>Checkbox</strong>: multiple selectable choices from SQL</li>' +
                    '</ul>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>';
        document.body.appendChild(host);
        host.addEventListener('click', function (ev) {
            var target = ev.target as HTMLElement | null;
            if (target && target.getAttribute('data-close') === '1') closeSqlOptionsHelpModal();
        });
        document.addEventListener('keydown', function onEsc(ev) {
            if (ev.key === 'Escape') {
                closeSqlOptionsHelpModal();
                document.removeEventListener('keydown', onEsc, true);
            }
        }, true);
    }
    function ensureWidgetHelpStyles() {
        if (document.getElementById('mf-widget-help-style')) return;
        ensureSqlOptionsHelpStyles();
        var style = document.createElement('style');
        style.id = 'mf-widget-help-style';
        style.textContent = '' +
            '.mfw-prop-help-launch{margin:0 0 12px;}' +
            '.mfw-prop-help-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.06);}' +
            '.mfw-prop-help-btn:hover{background:#dbeafe;border-color:#93c5fd;color:#1e40af;}' +
            '.mfw-prop-help-btn:focus{outline:2px solid rgba(59,130,246,.35);outline-offset:2px;}' +
            '.mf-widget-help .mf-sql-help__dialog{width:min(980px,calc(100vw - 32px));}' +
            '.mf-widget-help .mf-sql-help__body{display:block;}' +
            '.mf-widget-help .mf-sql-help__body details{margin:10px 0;}' +
            '.mf-widget-help .mf-sql-help__body code{background:#f1f5f9;border-radius:5px;padding:1px 4px;color:#0f172a;}' +
            '.mf-widget-help .mf-sql-help__body pre code,.mf-widget-help .mf-sql-help__body pre{background:#0f172a;color:#e2e8f0;}';
        document.head.appendChild(style);
    }

    function closeWidgetHelpModal() {
        var host = document.getElementById('mf-widget-help-modal');
        if (host && host.parentNode) host.parentNode.removeChild(host);
    }

    function showWidgetHelpModal(title: string, html: string, sub?: string) {
        ensureWidgetHelpStyles();
        closeWidgetHelpModal();
        var host = document.createElement('div');
        host.id = 'mf-widget-help-modal';
        host.className = 'mf-sql-help mf-widget-help';
        host.innerHTML = '' +
            '<div class="mf-sql-help__backdrop" data-close="1"></div>' +
            '<div class="mf-sql-help__dialog" role="dialog" aria-modal="true" aria-labelledby="mf-widget-help-title">' +
              '<div class="mf-sql-help__head">' +
                '<div>' +
                  '<h3 id="mf-widget-help-title" class="mf-sql-help__title">' + B.escHtml(title || 'Widget Help') + '</h3>' +
                  (sub ? '<p class="mf-sql-help__sub">' + B.escHtml(sub) + '</p>' : '') +
                '</div>' +
                '<button type="button" class="mf-sql-help__close" aria-label="Close" data-close="1">&times;</button>' +
              '</div>' +
              '<div class="mf-sql-help__body">' + String(html || '') + '</div>' +
            '</div>';
        document.body.appendChild(host);
        host.addEventListener('click', function (ev) {
            var target = ev.target as HTMLElement | null;
            if (target && target.getAttribute('data-close') === '1') closeWidgetHelpModal();
        });
        document.addEventListener('keydown', function onEsc(ev) {
            if (ev.key === 'Escape') {
                closeWidgetHelpModal();
                document.removeEventListener('keydown', onEsc, true);
            }
        }, true);
    }
    // =========================================================
    //  FLYOUT EXPAND / COLLAPSE
    // =========================================================
    var panelExpanded = false;
    function bindPanelExpand() {
        var btn = document.getElementById('mf-panel-expand-btn');
        var panel = document.getElementById('mf-panel-right');
        var backdrop = document.getElementById('mf-flyout-backdrop');
        var icon = document.getElementById('mf-expand-icon');
        if (!btn || !panel) return;
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            togglePanel();
        });
        if (backdrop) {
            backdrop.addEventListener('click', function() {
                if (panelExpanded) togglePanel();
            });
        }
        function togglePanel() {
            panelExpanded = !panelExpanded;
            panel.classList.toggle('mf-expanded', panelExpanded);
            if (backdrop) backdrop.classList.toggle('active', panelExpanded);
            if (icon) {
                icon.className = panelExpanded ? 'fas fa-compress-arrows-alt' : 'fas fa-expand-arrows-alt';
            }
        }
    }
    function autoExpandPanel(shouldExpand) {
        var panel = document.getElementById('mf-panel-right');
        var backdrop = document.getElementById('mf-flyout-backdrop');
        var icon = document.getElementById('mf-expand-icon');
        if (!panel) return;
        if (shouldExpand && !panelExpanded) {
            panelExpanded = true;
            panel.classList.add('mf-expanded');
            if (backdrop) backdrop.classList.add('active');
            if (icon) icon.className = 'fas fa-compress-arrows-alt';
        } else if (!shouldExpand && panelExpanded) {
            panelExpanded = false;
            panel.classList.remove('mf-expanded');
            if (backdrop) backdrop.classList.remove('active');
            if (icon) icon.className = 'fas fa-expand-arrows-alt';
        }
    }
    // =========================================================
    //  TAB SWITCHING (Field / Settings / HTML)
    // =========================================================
    function bindTabSwitching() {
        var tabMap = {
            'field': B.EL.tabLinkField,
            'widget': B.EL.tabLinkWidget,
            'settings': B.EL.tabLinkSettings,
            'html': B.EL.tabLinkHtml,
            'ai': B.EL.tabLinkAi,
            'embed': B.EL.tabLinkEmbed
        };
        Object.keys(tabMap).forEach(function(t) {
            var link = B.el(tabMap[t]);
            if (link) {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    activateTab(t);
                });
            }
        });
        // Rules tab — may have duplicate id, wire all instances
        document.querySelectorAll('#mf-tab-link-rules').forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                activateTab('rules');
            });
        });
    }
    function activateTab(tab) {
        var links = [
            { id: B.EL.tabLinkField, tab: 'field' },
            { id: B.EL.tabLinkWidget, tab: 'widget' },
            { id: B.EL.tabLinkSettings, tab: 'settings' },
            { id: B.EL.tabLinkHtml, tab: 'html' },
            { id: B.EL.tabLinkAi, tab: 'ai' },
            { id: B.EL.tabLinkEmbed, tab: 'embed' },
            { id: B.EL.tabLinkRules, tab: 'rules' }
        ];
        var panes = [
            { id: B.EL.tabField, tab: 'field' },
            { id: B.EL.tabWidget, tab: 'widget' },
            { id: B.EL.tabSettings, tab: 'settings' },
            { id: B.EL.tabHtml, tab: 'html' },
            { id: B.EL.tabAi, tab: 'ai' },
            { id: B.EL.tabEmbed, tab: 'embed' },
            { id: B.EL.tabRules, tab: 'rules' }
        ];
        links.forEach(function(l) {
            var el = B.el(l.id);
            if (el) el.classList.toggle('active', l.tab === tab);
        });
        panes.forEach(function(p) {
            var el = B.el(p.id);
            if (el) el.style.display = p.tab === tab ? '' : 'none';
        });
        // When switching to Settings tab, populate theme grid
        if (tab === 'settings') {
            populateSettingsTab();
        }
        // When switching to HTML tab, populate editors and show field keys
        if (tab === 'html') {
            populateHtmlEditors();
        }
        // When switching to AI tab, populate prompt + auto-expand
        if (tab === 'ai') {
            populateAiTab();
            autoExpandPanel(true);
        }
        // When switching to Embed tab, bind copy buttons
        if (tab === 'embed') {
            bindEmbedCopyButtons();
        }
        // When switching to Rules tab, expand panel + trigger rule builder render
        if (tab === 'rules') {
            autoExpandPanel(true);
            setTimeout(function() {
                B.callModule('rule-builder-ui', 'refresh');
            }, 50);
        }
        // Collapse when going back to Field/Settings
        if (tab === 'field' || tab === 'settings' || tab === 'widget') {
            autoExpandPanel(false);
        }
    }
    function bindEmbedCopyButtons() {
        document.querySelectorAll('.mf-copy-btn').forEach(function(btn) {
            if (btn._mfBound) return;
            btn._mfBound = true;
            btn.addEventListener('click', function() {
                var targetId = this.getAttribute('data-target');
                var target = document.getElementById(targetId);
                if (target) {
                    var text = target.value || target.textContent;
                    copyToClipboard(text, 'Copied to clipboard!');
                }
            });
        });
    }
    function ensureAiVisualStyles() {
        if (document.getElementById('mf-ai-visual-styles')) return;
        var style = document.createElement('style');
        style.id = 'mf-ai-visual-styles';
        style.textContent = '' +
            '.mf-ai-style-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}' +
            '.mf-ai-style-shell{background:linear-gradient(180deg,#ffffff,#f8fafc);border:1px solid #e2e8f0;box-shadow:0 10px 26px rgba(15,23,42,.05);}' +
            '.mf-ai-scard{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:8px;min-height:122px;padding:14px 12px 12px;border-radius:16px;border:1px solid #e2e8f0;background:linear-gradient(180deg,#ffffff,#f8fafc);cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;overflow:hidden;text-align:center;}' +
            '.mf-ai-scard:before{content:"";position:absolute;inset:0 0 auto 0;height:4px;background:var(--mf-ai-grad,linear-gradient(135deg,#6366f1,#8b5cf6));opacity:.95;}' +
            '.mf-ai-scard:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(15,23,42,.12);border-color:#c7d2fe;}' +
            '.mf-ai-scard.is-selected{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.16),0 16px 30px rgba(99,102,241,.12);transform:translateY(-2px);}' +
            '.mf-ai-scard-icon{width:50px;height:50px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:24px;background:var(--mf-ai-grad,linear-gradient(135deg,#6366f1,#8b5cf6));box-shadow:0 10px 18px rgba(15,23,42,.14);color:#fff;}' +
            '.mf-ai-scard-title{font-size:12px;font-weight:700;color:#0f172a;line-height:1.25;}' +
            '.mf-ai-scard-text{font-size:10.5px;line-height:1.45;color:#64748b;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}' +
            '.mf-ai-scard-tip{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;color:#6366f1;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:3px 7px;}' +
            '@media (max-width:1100px){.mf-ai-style-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}' +
            '@media (max-width:720px){.mf-ai-style-grid{grid-template-columns:1fr;}}';
        document.head.appendChild(style);
    }
    /* ---------------------------------------------------------
       AI DESIGN TAB — Style Library + Prompt Builder
       16 premium design styles like JotForm AI
       --------------------------------------------------------- */
    var AI_STYLES = [
        { id:'minimal', icon:'◻️', name:'Minimal Clean', blurb:'Whitespace-first, editorial, ultra-light.', tip:'Editorial', colors:['#f8fafc','#334155'],
          prompt:'Ultra-minimal design. White background, generous whitespace (48-64px padding). Typography-only hierarchy using size and weight. Input fields: border-bottom only, no full borders. One accent color for required markers and focus. Submit: outlined rectangle, no gradient. Max-width 560px centered. Zero shadows, zero gradients, zero decorations.' },
        { id:'corporate', icon:'🏢', name:'Corporate', blurb:'Trustworthy business look with sharp structure.', tip:'Professional', colors:['#1e3a5f','#3b82f6'],
          prompt:'Professional corporate form. Navy (#1e3a5f) header bar with white title. Clean white card body with subtle box-shadow. Blue (#3b82f6) accent for focus states and buttons. 2-column grid where appropriate. Modern sans-serif typography. Solid blue submit button.' },
        { id:'soft-ui', icon:'☁️', name:'Soft UI', blurb:'Pillowy surfaces and gentle depth.', tip:'Calm', colors:['#f1f5f9','#6366f1'],
          prompt:'Soft UI / Neumorphism. Light gray background (#f0f0f3). Cards with soft double shadow (light + dark) creating embossed look. Inputs: inset soft shadows. Rounded corners (12-16px) everywhere. Indigo (#6366f1) accent. Submit button with raised soft shadow. Gentle, tactile feel. No hard borders.' },
        { id:'glass', icon:'💎', name:'Glass', blurb:'Translucent card with premium glow.', tip:'Trendy', colors:['#667eea','#764ba2'],
          prompt:'Glassmorphism. Gradient background (purple to blue). 2-3 large blurred circle shapes in background via ::before/::after. Form card: rgba(255,255,255,0.15), backdrop-filter:blur(20px), 1px rgba white border, border-radius:24px. Inputs: semi-transparent backgrounds. White text on dark areas. Gradient submit button.' },
        { id:'dark', icon:'🌙', name:'Dark Mode', blurb:'Elegant dark palette with crisp contrast.', tip:'Modern', colors:['#0f172a','#6366f1'],
          prompt:'Elegant dark theme. Background #0f172a. Card surface #1e293b. Text #e2e8f0. Inputs: dark bg #0f172a, 1px #334155 border, focus glow in indigo. Indigo (#6366f1) accent. No neon effects, just refined dark palette. Submit: indigo background. Clean and readable.' },
        { id:'gradient', icon:'🌈', name:'Gradient Hero', blurb:'Marketing-style hero with vibrant energy.', tip:'Bold', colors:['#6366f1','#ec4899'],
          prompt:'SaaS landing page style. Bold gradient hero section (purple to pink). White rounded card (border-radius:20px, subtle shadow) below hero for fields. 2-column grid for short fields. Gradient submit button matching hero. Clean modern feel.' },
        { id:'nature', icon:'🌿', name:'Nature', blurb:'Organic greens with relaxed spacing.', tip:'Organic', colors:['#2d6a4f','#d8f3dc'],
          prompt:'Organic nature theme. Soft sage/cream background. Forest green (#2d6a4f) accents. Warm earth tones. Large border-radius (20px). Generous spacing. Green submit button, pill shape. Calm and inviting.' },
        { id:'material', icon:'📱', name:'Material', blurb:'Structured system style with clean rhythm.', tip:'System', colors:['#1976d2','#42a5f5'],
          prompt:'Material Design 3. Elevated card with layered shadow. Primary blue (#1976d2) header. Outlined inputs with floating-label style. 8px grid spacing. Pill-shaped submit button (border-radius:20px). Surface/on-surface color tokens.' },
        { id:'japanese', icon:'🏯', name:'Zen', blurb:'Quiet, restrained, refined composition.', tip:'Minimal', colors:['#4a4a4a','#c9b8a8'],
          prompt:'Japanese Zen aesthetic. Muted earth tones: warm gray, beige, charcoal. Extreme negative space (48px+ padding). Minimal 1px borders. No decorations. Quiet refinement. Serif title, sans-serif body. Charcoal submit button, simple rectangle.' },
        { id:'pdf-doc', icon:'📄', name:'Document', blurb:'Formal paper-like layout for serious intake.', tip:'Formal', colors:['#2c3e50','#95a5a6'],
          prompt:'Formal document/PDF style. White paper background with subtle page border. Header line and small uppercase section labels. Serif headings optional. Inputs resemble official form fields. Black/gray palette with disciplined spacing. Print-friendly aesthetic.' },
        { id:'luxury', icon:'✨', name:'Luxury', blurb:'Editorial elegance with rich contrast.', tip:'Premium', colors:['#111827','#d4af37'],
          prompt:'Luxury brand aesthetic. Deep charcoal/black background accents and warm gold highlight (#d4af37). Spacious layout. Thin elegant borders. Sophisticated serif heading paired with clean sans-serif body. Minimal but premium. Gold outline submit button.' },
        { id:'playful', icon:'🎈', name:'Playful', blurb:'Friendly rounded forms with cheerful color.', tip:'Friendly', colors:['#f97316','#facc15'],
          prompt:'Playful modern design. Bright but curated palette using orange, yellow, and coral accents. Rounded cards (20px), soft shadow, fun icon accents, but still professional. Great for family, education, and community forms.' },
        { id:'healthcare', icon:'🩺', name:'Healthcare', blurb:'Clinical, calm, and easy to scan.', tip:'Trust', colors:['#0f766e','#5eead4'],
          prompt:'Healthcare intake aesthetic. Clean teal and white palette. High readability, strong labels, subtle section dividers. Soft rounded card with reassuring tone. Emphasis on clarity, accessibility, and trust.' },
        { id:'event', icon:'🎟️', name:'Event', blurb:'Energetic registration layout with emphasis.', tip:'Event', colors:['#7c3aed','#ec4899'],
          prompt:'Modern event registration design. Dynamic accent color bars, slightly bolder typography, lively section headers, and clear CTA. White form surface over vibrant branded top area. Great hierarchy for packages/options.' },
        { id:'mono', icon:'⚫', name:'Monochrome', blurb:'Sharp black-and-white editorial system.', tip:'Clean', colors:['#111111','#71717a'],
          prompt:'Monochrome editorial style. Strict black/white/gray palette. Bold typography hierarchy. Strong spacing rhythm. Thin borders, no gradients. Clean and premium, similar to modern fashion/editorial websites.' },
        { id:'coastal', icon:'🌊', name:'Coastal', blurb:'Fresh airy palette with relaxed resort feel.', tip:'Fresh', colors:['#0077b6','#90e0ef'],
          prompt:'Airy coastal aesthetic. White/sand form card. Teal (#0077b6) accents. Relaxed generous spacing. Coral (#fb923c) subtle accent touches.' }
    ];
    var selectedAiStyle = null;
    function populateAiTab() {
        ensureAiVisualStyles();
        var grid = document.getElementById('mf-ai-style-grid');
        var aiPrompt = document.getElementById('mf-ai-prompt');
        if (grid && !grid._mfRendered) {
            grid._mfRendered = true;
            var html = '';
            AI_STYLES.forEach(function(s) {
                var tooltip = (s.name || '') + ' — ' + (s.blurb || '');
                html += '<button type="button" class="mf-ai-scard" data-style="' + s.id + '" title="' + tooltip.replace(/"/g, '&quot;') + '" style="--mf-ai-grad:linear-gradient(135deg,' + s.colors[0] + ',' + s.colors[1] + ')">';
                html += '<span class="mf-ai-scard-icon" aria-hidden="true">' + s.icon + '</span>';
                html += '<span class="mf-ai-scard-title">' + s.name + '</span>';
                html += '<span class="mf-ai-scard-text">' + (s.blurb || '') + '</span>';
                html += '<span class="mf-ai-scard-tip"><i class="fas fa-star"></i>' + (s.tip || 'Style') + '</span>';
                html += '</button>';
            });
            grid.innerHTML = html;
            grid.querySelectorAll('.mf-ai-scard').forEach(function(card) {
                card.addEventListener('click', function() {
                    grid.querySelectorAll('.mf-ai-scard').forEach(function(c) {
                        c.classList.remove('is-selected');
                        c.setAttribute('aria-pressed', 'false');
                    });
                    card.classList.add('is-selected');
                    card.setAttribute('aria-pressed', 'true');
                    selectedAiStyle = card.getAttribute('data-style');
                });
            });
        }
        var genBtn = document.getElementById('mf-ai-generate-prompt-btn');
        if (genBtn && !genBtn._mfBound) {
            genBtn._mfBound = true;
            genBtn.addEventListener('click', function() {
                if (!B.state.schema.fields || B.state.schema.fields.length === 0) {
                    B.showToast('Add fields first!', 'error'); return;
                }
                if (!selectedAiStyle) {
                    B.showToast('Select a design style first!', 'error'); return;
                }
                if (aiPrompt) {
                    aiPrompt.value = buildAiPrompt(selectedAiStyle);
                    B.showToast('Prompt generated! Click Copy.', 'success');
                }
            });
        }
        var copyBtn = document.getElementById('mf-copy-prompt-btn');
        if (copyBtn && !copyBtn._mfBound) {
            copyBtn._mfBound = true;
            copyBtn.addEventListener('click', function() {
                if (!aiPrompt || !aiPrompt.value.trim()) { B.showToast('Generate prompt first!', 'error'); return; }
                copyToClipboard(aiPrompt.value, 'Prompt copied! Paste into ChatGPT or Claude.');
            });
        }
        var copyHtmlBtn = document.getElementById('mf-copy-html-btn');
        if (copyHtmlBtn && !copyHtmlBtn._mfBound) {
            copyHtmlBtn._mfBound = true;
            copyHtmlBtn.addEventListener('click', function() {
                var he = document.getElementById('mf-custom-html-editor');
                var ce = document.getElementById('mf-custom-css-editor');
                copyToClipboard('<!-- HTML -->\n' + (he ? he.value : '') + '\n\n/* CSS */\n' + (ce ? ce.value : ''), 'HTML + CSS copied!');
            });
        }
    }
    /* ---------------------------------------------------------
       BUILD AI PROMPT
       --------------------------------------------------------- */
    function getFlattenedAiFields(fields) {
        var dataFields = [];
        (fields || []).forEach(function(f) {
            if (!f) return;
            if (f.type === 'Row' && f.columns) {
                f.columns.forEach(function(col) {
                    (col.fields || []).forEach(function(cf) {
                        if (cf && cf.type !== 'Hidden' && cf.type !== 'Html') dataFields.push(cf);
                    });
                });
            } else if (f.type === 'Section') {
                dataFields.push(f);
            } else if (f.type !== 'Hidden' && f.type !== 'Html' && f.type !== 'Row') {
                dataFields.push(f);
            }
        });
        return dataFields;
    }
    function inferAiFormArchetype(title, desc, fields) {
        var hay = ((title || '') + ' ' + (desc || '') + ' ' + (fields || []).map(function(f) { return (f.label || '') + ' ' + (f.type || ''); }).join(' ')).toLowerCase();
        if (/patient|medical|health|clinic|doctor|insurance|symptom|allerg/i.test(hay)) return 'healthcare';
        if (/event|ticket|attendee|conference|seminar|workshop|rsvp/i.test(hay)) return 'event';
        if (/job|career|resume|cv|employment|position|applicant/i.test(hay)) return 'job application';
        if (/booking|reservation|schedule|appointment|check.?in|check.?out|travel/i.test(hay)) return 'booking';
        if (/feedback|review|rating|survey|satisfaction/i.test(hay)) return 'feedback';
        if (/contact|lead|quote|enquiry|inquiry|message/i.test(hay)) return 'contact';
        if (/payment|billing|checkout|donation|purchase|order/i.test(hay)) return 'payment';
        return 'professional intake';
    }
    function getAiFieldGroups(fields) {
        var groups = {
            name: [],
            contact: [],
            profile: [],
            dates: [],
            choices: [],
            longText: [],
            uploads: [],
            other: []
        };
        (fields || []).forEach(function(f) {
            if (!f || f.type === 'Section') return;
            var key = String(f.key || '').toLowerCase();
            var label = String(f.label || '').toLowerCase();
            var type = String(f.type || '').toLowerCase();
            var token = '{{field:' + f.key + '}}';
            if (/first.?name|last.?name|full.?name|name/.test(key + ' ' + label)) groups.name.push(token);
            else if (/email|phone|mobile|contact|website|company/.test(key + ' ' + label)) groups.contact.push(token);
            else if (/date|birth|dob|time/.test(key + ' ' + label) || /date|time/.test(type)) groups.dates.push(token);
            else if (/radio|dropdown|select|checkbox|choice/.test(type)) groups.choices.push(token);
            else if (/textarea|paragraph|message|notes|comment|description/.test(type + ' ' + key + ' ' + label)) groups.longText.push(token);
            else if (/upload|file|image|signature/.test(type + ' ' + key + ' ' + label)) groups.uploads.push(token);
            else if (/gender|city|state|country|address|zip|postal|age|department|role/.test(key + ' ' + label)) groups.profile.push(token);
            else groups.other.push(token);
        });
        return groups;
    }
    function getAiLayoutHints(groups) {
        var hints = [];
        if ((groups.name || []).length >= 2) hints.push('- Put name fields on the same row when space allows: ' + groups.name.slice(0, 3).join(', '));
        if ((groups.contact || []).length >= 2) hints.push('- Put contact fields together in a balanced 2-column row: ' + groups.contact.slice(0, 4).join(', '));
        if ((groups.profile || []).length >= 2) hints.push('- Group compact profile fields into short rows for rhythm: ' + groups.profile.slice(0, 4).join(', '));
        if ((groups.dates || []).length >= 1) hints.push('- Date/time fields should align neatly with other compact fields: ' + groups.dates.slice(0, 3).join(', '));
        if ((groups.choices || []).length >= 1) hints.push('- Choice fields should have breathing room and clear selection styling: ' + groups.choices.slice(0, 3).join(', '));
        if ((groups.longText || []).length >= 1) hints.push('- Long text fields should span full width near the bottom: ' + groups.longText.slice(0, 2).join(', '));
        if ((groups.uploads || []).length >= 1) hints.push('- Upload/signature widgets should be full width and visually distinct: ' + groups.uploads.slice(0, 2).join(', '));
        if (!hints.length) hints.push('- Use a clean 1-2 column responsive layout with strong spacing rhythm.');
        return hints;
    }
    function buildAiPrompt(styleId) {
        var fields = B.state.schema.fields || [];
        var title = B.getVal(B.EL.canvasTitle) || 'My Form';
        var desc = B.getVal(B.EL.canvasDescription) || '';
        var submitText = B.getVal(B.EL.submitBtnText) || 'Submit';
        var style = null;
        AI_STYLES.forEach(function(s) { if (s.id === styleId) style = s; });
        if (!style) style = AI_STYLES[0];
        var dataFields = getFlattenedAiFields(fields);
        var archetype = inferAiFormArchetype(title, desc, dataFields);
        var groups = getAiFieldGroups(dataFields);
        var layoutHints = getAiLayoutHints(groups);
        var fieldList = dataFields.map(function(f) {
            if (f.type === 'Section') {
                return '\n[Section: ' + (f.label || 'Untitled') + ']';
            }
            var info = '- {{field:' + f.key + '}} — ' + (f.label || f.key) + ' (' + f.type + ')';
            if (f.required) info += ' *required';
            if (f.placeholder) info += ' placeholder="' + String(f.placeholder).replace(/"/g, '\\"') + '"';
            return info;
        }).join('\n');
        var p = [];
        p.push('You are a world-class web form designer. Create a stunning, production-quality HTML + CSS layout for MegaForm.');
        p.push('');
        p.push('NON-NEGOTIABLE MEGAFORM RULES:');
        p.push('1. Keep EVERY {{field:key}} placeholder EXACTLY as written. Never rewrite, rename, split, omit, or alter any placeholder.');
        p.push('2. Output exactly TWO blocks with these headings: --- HTML --- and --- CSS ---');
        p.push('3. Do NOT output explanations, markdown fences, comments, JavaScript, JSON, or any extra text outside those two blocks.');
        p.push('4. Do NOT use <form> tags. The system already provides submission behavior. Use <div class="mfp"> as the root.');
        p.push('5. This is FULL CUSTOM CONTENT mode. Your HTML must render the complete visible form content, including hero/header/title/description/section framing inside .mfp.');
        p.push('6. For editable form text, render the heading using {{form:title}}, the description using {{form:description}}, and the submit button label using {{form:submit}}. Do NOT hardcode the current title, description, or button label.');
        p.push('7. CSS must be self-contained and safe inside CMS shells such as DNN and Oqtane. Prefix every selector with .mfp or a descendant of .mfp.');
        p.push('8. Never style global tags or host containers: do NOT target html, body, :root, * by itself, form, .container, .row, .col, .table, .card, .btn, .rz-*, .mud-*, .oqtane-*, or any host theme selector.');
        p.push('9. Include a small local reset scoped only inside .mfp, for example box-sizing, image max-width, button/font inheritance, and heading/paragraph margin normalization.');
        p.push('10. The result must render correctly when MegaForm injects real inputs into the placeholders.');
        p.push('11. No JavaScript, no external libraries, no remote fonts, no dependencies, no inline SVG data URIs.');
        p.push('12. Fully responsive: desktop may use 2 columns for compact fields, but under 600px everything must stack to one column with comfortable spacing.');
        p.push('13. Style these selectors beautifully inside the scoped CSS: input, textarea, select, .mf-field-label, .mf-required, .mf-field-error.');
        p.push('14. Preserve accessibility and readability: high contrast, visible focus states, comfortable tap targets, clear labels, sensible spacing.');
        p.push('15. Avoid generic AI-looking output. The design should feel premium, deliberate, distinctive, and varied — similar in quality to excellent Jotform showcase forms.');
        p.push('');
        p.push('CREATIVE DIRECTION:');
        p.push('- Form archetype: ' + archetype + '.');
        p.push('- Visual style family: ' + style.name + '.');
        p.push('- Style brief: ' + style.prompt);
        // If the user has selected a preset CSS theme, mention it for consistency
        var _schema_theme = (B.state.schema.settings && B.state.schema.settings.theme) || 'default';
        if (_schema_theme && _schema_theme !== 'default') {
            p.push('- Note: this form also uses the "' + _schema_theme + '" preset CSS theme class (mf-theme-' + _schema_theme + '). If your custom HTML does not use .mfp wrapper isolation, your CSS may interact with the preset theme. You may choose to complement or intentionally override the preset theme colors.');
        }
        p.push('- Create a clearly different composition for this style, not just a color swap. Vary layout rhythm, hero treatment, section framing, spacing, surface treatment, border language, and button presentation.');
        p.push('- Make the result feel polished, modern, and premium, with strong hierarchy and balanced whitespace.');
        p.push('- Every style should look like a different designer made it.');
        p.push('');
        p.push('LAYOUT RULES:');
        layoutHints.forEach(function(h) { p.push(h); });
        p.push('- Build a visually attractive top section inside .mfp using {{form:title}} and {{form:description}} so the builder can edit them later.');
        p.push('- Use clean groups/sections with visual rhythm.');
        p.push('- Keep wide text areas, messages, notes, consent groups, and upload areas full width.');
        p.push('- Short fields such as name, email, phone, date, dropdowns, and number fields may share rows on desktop if balanced.');
        p.push('- Use elegant card, panel, editorial, split-layout, or premium SaaS framing as appropriate to the chosen style.');
        p.push('- Ensure the final result still looks excellent even when labels or placeholders are slightly longer.');
        p.push('');
        p.push('FORM CONTEXT:');
        p.push('- Current title value: ' + title);
        if (desc) p.push('- Current description value: ' + desc);
        p.push('- Current submit button text: ' + submitText);
        p.push('- IMPORTANT: In the HTML, render those using {{form:title}}, {{form:description}}, and {{form:submit}} instead of hardcoded text.');
        p.push('');
        p.push('FIELDS:');
        p.push(fieldList);
        p.push('');
        p.push('QUALITY BAR:');
        p.push('- Premium SaaS quality, not boilerplate.');
        p.push('- Responsive and render-safe for MegaForm.');
        p.push('- Strong CSS isolation from DNN, Oqtane, Bootstrap, and host theme styles.');
        p.push('- Elegant spacing, refined typography, and beautiful alignment.');
        p.push('- Every placeholder must remain exactly intact and appear once in the HTML.');
        p.push('- Return one cohesive, ready-to-render design.');
        return p.join('\n');
    }
    // =========================================================
    //  HTML TAB — Editors, Generate, Preview
    // =========================================================
    // =========================================================
    //  SETTINGS TAB — Theme Selector + Label Position
    // =========================================================
    var _settingsInited = false;
    // 12 themes matching megaform-themes.css + 1 default
    var THEMES = [
        { id:'default',        name:'Default',       desc:'Clean professional',      colors:['#ffffff','#3b82f6'],  dark:false },
        { id:'minimal',        name:'Minimal',        desc:'Borderless, ultra-clean', colors:['#ffffff','#1a1a1a'],  dark:false },
        { id:'modern-blue',    name:'Modern Blue',    desc:'Bold corporate gradient', colors:['#667eea','#764ba2'],  dark:false },
        { id:'warm-sunset',    name:'Warm Sunset',    desc:'Friendly orange tones',   colors:['#ff6b35','#ffd4bc'],  dark:false },
        { id:'dark-elegance',  name:'Dark Elegance',  desc:'Refined dark palette',    colors:['#1a1a2e','#e94560'],  dark:true  },
        { id:'nature-green',   name:'Nature Green',   desc:'Eco, organic feel',       colors:['#2d8a4e','#c8e6c9'],  dark:false },
        { id:'flat-material',  name:'Material',       desc:'Google Material inspired',colors:['#1976d2','#e3f2fd'],  dark:false },
        { id:'classic-formal', name:'Classic',        desc:'Traditional / formal',    colors:['#8b4513','#f8f4ef'],  dark:false },
        { id:'playful',        name:'Playful',        desc:'Rounded, colorful, fun',  colors:['#ff6b6b','#ffecd2'],  dark:false },
        { id:'healthcare',     name:'Healthcare',     desc:'Clinical, calm, trusted', colors:['#0077b6','#f0f8ff'],  dark:false },
        { id:'executive',      name:'Executive',      desc:'Premium, luxury gold',    colors:['#c9a84c','#2a2a2a'],  dark:true  },
        { id:'tech-startup',   name:'Tech Startup',   desc:'Dark SaaS / neon accent', colors:['#38ef7d','#141432'], dark:true  },
    ];
    function populateSettingsTab() {
        if (_settingsInited) { syncThemeFromSchema(); return; }
        _settingsInited = true;
        // ── Theme Grid ─────────────────────────────────────────
        var grid = document.getElementById('mf-theme-grid');
        if (grid) {
            var html = '';
            THEMES.forEach(function(t) {
                var c0 = t.colors[0], c1 = t.colors[1];
                html += '<div class="mf-theme-card" data-theme="' + t.id + '" title="' + t.name + ' — ' + t.desc + '">';
                // Swatch: split diagonal showing 2 colors
                html += '<div class="mf-theme-swatch" style="background:linear-gradient(135deg,' + c0 + ' 50%,' + c1 + ' 50%)">';
                html += '<div class="mf-theme-check"><i class="fas fa-check"></i></div>';
                html += '</div>';
                html += '<div class="mf-theme-name">' + t.name + '</div>';
                html += '</div>';
            });
            grid.innerHTML = html;
            // Bind click
            grid.querySelectorAll<HTMLElement>('.mf-theme-card').forEach(function(card) {
                card.addEventListener('click', function() {
                    var themeId = card.getAttribute('data-theme') || 'default';
                    selectTheme(themeId);
                });
            });
        }
        // ── Label position change ────────────────────────────────
        var labelPos = document.getElementById('mf-setting-label-pos') as HTMLSelectElement | null;
        if (labelPos) {
            labelPos.addEventListener('change', function() {
                if (!B.state.schema.settings) B.state.schema.settings = {};
                B.state.schema.settings.labelPosition = this.value;
                B.state.isDirty = true;
            });
        }
        // ── [LighterChrome v20260602-B46] Form card chrome change ──
        var chromeSel = document.getElementById('mf-setting-chrome') as HTMLSelectElement | null;
        if (chromeSel) {
            chromeSel.addEventListener('change', function() {
                if (!B.state.schema.settings) B.state.schema.settings = {};
                var val = String(this.value || '').toLowerCase();
                if (val === 'flat' || val === 'card' || val === 'none') {
                    B.state.schema.settings.chrome = val;
                } else {
                    delete B.state.schema.settings.chrome;
                }
                // Strip legacy useCard so renderer picks the new chrome key cleanly.
                if (Object.prototype.hasOwnProperty.call(B.state.schema.settings, 'useCard')) {
                    delete B.state.schema.settings.useCard;
                }
                B.state.isDirty = true;
            });
        }
        // ── Clear button ────────────────────────────────────────
        var clearBtn = document.getElementById('mf-theme-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function(e) {
                e.preventDefault();
                selectTheme('default');
            });
        }
        // Sync current state
        syncThemeFromSchema();
    }
    function selectTheme(themeId: string) {
        if (!B.state.schema.settings) B.state.schema.settings = {};
        B.state.schema.settings.theme = themeId;
        B.state.isDirty = true;
        // Update UI
        document.querySelectorAll<HTMLElement>('.mf-theme-card').forEach(function(c) {
            c.classList.toggle('active', c.getAttribute('data-theme') === themeId);
        });
        // Info bar
        var info = document.getElementById('mf-theme-info');
        var infoText = document.getElementById('mf-theme-info-text');
        var t = THEMES.find(function(x) { return x.id === themeId; });
        if (info && infoText) {
            if (!t || themeId === 'default') {
                info.style.display = 'none';
            } else {
                infoText.textContent = 'Theme "' + t.name + '" selected — applies to published form view';
                info.style.display = '';
            }
        }
        // Preview: apply theme class to canvas for visual feedback
        var canvas = document.querySelector<HTMLElement>('.mf-canvas-dropzone');
        if (canvas) {
            // Remove all mf-theme-* classes
            canvas.className = canvas.className.replace(/\bmf-theme-[\w-]+\b/g, '').trim();
            if (themeId && themeId !== 'default') {
                canvas.classList.add('mf-theme-preview');
                canvas.setAttribute('data-theme', themeId);
            } else {
                canvas.removeAttribute('data-theme');
            }
        }
        B.showToast(t && themeId !== 'default'
            ? '"' + t.name + '" theme applied!'
            : 'Theme reset to default', 'success');
    }
    function syncThemeFromSchema() {
        var settings = B.state.schema.settings || {};
        var themeId = settings.theme || 'default';
        var labelPos = settings.labelPosition || 'top';
        // Sync theme cards
        document.querySelectorAll<HTMLElement>('.mf-theme-card').forEach(function(c) {
            c.classList.toggle('active', c.getAttribute('data-theme') === themeId);
        });
        // Sync label position
        var labelEl = document.getElementById('mf-setting-label-pos') as HTMLSelectElement | null;
        if (labelEl) labelEl.value = labelPos;
        // [LighterChrome v20260602-B46] Sync form-card chrome — backward-compat
        // for legacy `settings.useCard` (true → 'card', false → 'none').
        var chromeEl = document.getElementById('mf-setting-chrome') as HTMLSelectElement | null;
        if (chromeEl) {
            var chromeVal = String((settings as any).chrome || '').toLowerCase();
            if (!chromeVal && Object.prototype.hasOwnProperty.call(settings, 'useCard')) {
                chromeVal = (settings as any).useCard === false ? 'none' : 'card';
            }
            if (chromeVal !== 'flat' && chromeVal !== 'card' && chromeVal !== 'none') chromeVal = '';
            chromeEl.value = chromeVal;
        }
        // Sync info bar
        var info = document.getElementById('mf-theme-info');
        var infoText = document.getElementById('mf-theme-info-text');
        var t = THEMES.find(function(x) { return x.id === themeId; });
        if (info && infoText) {
            if (!t || themeId === 'default') {
                info.style.display = 'none';
            } else {
                infoText.textContent = 'Theme "' + t.name + '" — applies to published form view';
                info.style.display = '';
            }
        }
    }
    // Expose selectTheme globally so other modules (AI) can call it
    (window as any).MFSelectTheme = selectTheme;

    function parseContentTokenKeys(html: string): string[] {
        var seen: Record<string, boolean> = {};
        var keys: string[] = [];
        String(html || '').replace(/\{\{content:([a-zA-Z0-9_-]+)\}\}/g, function (_m, key) {
            if (!seen[key]) {
                seen[key] = true;
                keys.push(key);
            }
            return _m;
        });
        return keys;
    }
    function parseScriptTokenKeys(html: string): string[] {
        var seen: Record<string, boolean> = {};
        var keys: string[] = [];
        String(html || '').replace(/\{\{script:([a-zA-Z0-9_-]+)\}\}/g, function (_m, key) {
            if (!seen[key]) {
                seen[key] = true;
                keys.push(key);
            }
            return _m;
        });
        return keys;
    }
    function ensureCustomContentSettings(settings: any): Record<string, string> {
        if (!settings.customContent || typeof settings.customContent !== 'object') {
            settings.customContent = settings.CustomContent && typeof settings.CustomContent === 'object'
                ? settings.CustomContent
                : {};
        }
        return settings.customContent as Record<string, string>;
    }
    function syncCustomContentKeysFromHtml(settings: any, html: string): string[] {
        var keys = parseContentTokenKeys(html);
        var content = ensureCustomContentSettings(settings);
        var next: Record<string, string> = {};
        keys.forEach(function (key) { next[key] = String(content[key] || ''); });
        settings.customContent = next;
        return keys;
    }
    function ensureSchemaCustomScripts(schema: any): Record<string, string> {
        if (!schema.customScripts || typeof schema.customScripts !== 'object') {
            if (schema.CustomScripts && typeof schema.CustomScripts === 'object') schema.customScripts = schema.CustomScripts;
            else if (schema.settings && (schema.settings.customScripts || schema.settings.CustomScripts) && typeof (schema.settings.customScripts || schema.settings.CustomScripts) === 'object') schema.customScripts = schema.settings.customScripts || schema.settings.CustomScripts;
            else schema.customScripts = {};
        }
        schema.CustomScripts = schema.customScripts;
        return schema.customScripts as Record<string, string>;
    }
    function syncCustomScriptKeysFromHtml(schema: any, html: string): string[] {
        var keys = parseScriptTokenKeys(html);
        var scripts = ensureSchemaCustomScripts(schema);
        var next: Record<string, string> = {};
        keys.forEach(function (key) { next[key] = String(scripts[key] || ''); });
        schema.customScripts = next;
        schema.CustomScripts = next;
        return keys;
    }
    function renderCustomContentTokenEditor(html: string) {
        var host = document.getElementById('mf-html-content-tokens');
        if (!host) return;
        if (!B.state.schema.settings) B.state.schema.settings = {};
        var settings = B.state.schema.settings;
        var keys = syncCustomContentKeysFromHtml(settings, html);
        var content = ensureCustomContentSettings(settings);
        host.innerHTML = '';
        if (!keys.length) {
            host.innerHTML = '<div style="font-size:11px;color:#94a3b8">No <code>{{content:*}}</code> tokens found in Custom HTML.</div>';
            return;
        }
        var table = document.createElement('div');
        table.style.display = 'grid';
        table.style.gap = '8px';
        keys.forEach(function (key) {
            var row = document.createElement('div');
            row.style.border = '1px solid #e2e8f0';
            row.style.borderRadius = '10px';
            row.style.background = '#fff';
            row.style.padding = '10px';
            row.style.display = 'grid';
            row.style.gap = '6px';

            var label = document.createElement('div');
            label.style.fontSize = '11px';
            label.style.fontWeight = '700';
            label.style.color = '#334155';
            label.textContent = key;

            var token = document.createElement('div');
            token.style.fontSize = '10px';
            token.style.color = '#94a3b8';
            token.innerHTML = '<code>{{content:' + B.escHtml(key) + '}}</code>';

            var inputEl = document.createElement('textarea');
            inputEl.className = 'mf-code-editor';
            inputEl.rows = 2;
            inputEl.style.minHeight = '52px';
            inputEl.style.fontFamily = 'inherit';
            inputEl.placeholder = 'Editable content for ' + key;
            inputEl.value = String(content[key] || '');
            inputEl.addEventListener('input', function () {
                var cc = ensureCustomContentSettings(settings);
                cc[key] = inputEl.value;
                B.state.isDirty = true;
            });

            row.appendChild(label);
            row.appendChild(token);
            row.appendChild(inputEl);
            table.appendChild(row);
        });
        host.appendChild(table);
    }

    function renderCustomScriptTokenEditor(html: string) {
        var host = document.getElementById('mf-html-script-tokens');
        if (!host) return;
        var schema = B.state.schema || {};
        var keys = syncCustomScriptKeysFromHtml(schema, html);
        var scripts = ensureSchemaCustomScripts(schema);
        host.innerHTML = '';
        if (!keys.length) {
            host.innerHTML = '<div style="font-size:11px;color:#94a3b8">No <code>{{script:*}}</code> tokens found in Custom HTML.</div>';
            return;
        }
        var table = document.createElement('div');
        table.style.display = 'grid';
        table.style.gap = '8px';
        keys.forEach(function (key) {
            var row = document.createElement('div');
            row.style.border = '1px solid #e2e8f0';
            row.style.borderRadius = '10px';
            row.style.background = '#fff';
            row.style.padding = '10px';
            row.style.display = 'grid';
            row.style.gap = '6px';

            var label = document.createElement('div');
            label.style.fontSize = '11px';
            label.style.fontWeight = '700';
            label.style.color = '#334155';
            label.textContent = key;

            var token = document.createElement('div');
            token.style.fontSize = '10px';
            token.style.color = '#94a3b8';
            token.innerHTML = '<code>{{script:' + B.escHtml(key) + '}}</code>';

            var note = document.createElement('div');
            note.style.fontSize = '10px';
            note.style.color = '#64748b';
            note.textContent = 'Recommended entry: (function(root, ctx){ ... })(window.__mfCurrentScriptRoot, window.__mfScriptContext);';

            var inputEl = document.createElement('textarea');
            inputEl.className = 'mf-code-editor';
            inputEl.rows = 7;
            inputEl.style.minHeight = '128px';
            inputEl.placeholder = '(function(root, ctx){\n  if (!root) return;\n})(window.__mfCurrentScriptRoot, window.__mfScriptContext);';
            inputEl.value = String(scripts[key] || '');
            inputEl.addEventListener('input', function () {
                var ss = ensureSchemaCustomScripts(schema);
                ss[key] = inputEl.value;
                schema.CustomScripts = schema.customScripts;
                B.state.isDirty = true;
            });
            inputEl.addEventListener('keydown', handleTabKey);

            row.appendChild(label);
            row.appendChild(token);
            row.appendChild(note);
            row.appendChild(inputEl);
            table.appendChild(row);
        });
        host.appendChild(table);
    }

    // [2026-06-18] Single robust entry point for opening the rich HTML Designer (Token
    // Designer modal). Used by BOTH the "Custom HTML editor" button and the canvas
    // "Custom HTML Active" banner (via delegation). Resolves window.MFTokenDesigner lazily;
    // if it isn't up yet, falls back to revealing the raw HTML editor so the author is
    // never stuck. Idempotent — does nothing if the designer modal is already open.
    function openHtmlDesigner() {
        if (document.querySelector('.mf-token-designer-backdrop')) return; // already open
        var td: any = (window as any).MFTokenDesigner;
        if (td && typeof td.open === 'function') {
            try { td.open(); return; } catch (_e) { /* fall through to fallback */ }
        }
        // Fallback: expand the Custom HTML accordion + focus the raw editor.
        try {
            var head: any = document.querySelector('[data-mf-design-toggle="html"]');
            if (head && head.getAttribute('aria-expanded') !== 'true') head.click();
            var ed: any = document.getElementById('mf-custom-html-editor');
            if (ed) { if (ed.scrollIntoView) ed.scrollIntoView({ block: 'center' }); ed.focus(); }
        } catch (_e2) { /* noop */ }
        if (B.showToast) B.showToast('HTML editor opened below — rich Designer still loading, try again in a moment.', 'info');
    }

    function populateHtmlEditors() {
        var htmlEditor = document.getElementById('mf-custom-html-editor');
        var cssEditor = document.getElementById('mf-custom-css-editor');
        var keysDiv = document.getElementById('mf-html-field-keys');
        if (!htmlEditor) return;
        if (!B.state.schema.settings) B.state.schema.settings = {};
        var s = B.state.schema.settings;
        htmlEditor.value = s.customHtml || s.CustomHtml || '';
        if (cssEditor) cssEditor.value = s.customCss || s.CustomCss || '';
        // Field keys reference
        if (keysDiv && B.state.schema.fields) {
            var flatList = [];
            B.state.schema.fields.forEach(function(f) {
                if (f.type === 'Row' && f.columns) {
                    f.columns.forEach(function(col) {
                        (col.fields || []).forEach(function(cf) { flatList.push(cf); });
                    });
                } else {
                    flatList.push(f);
                }
            });
            var refs = [
                '<code style="background:#e0f2fe;padding:2px 6px;border-radius:4px;font-size:11px;">{{form:title}}</code> <span style="color:#64748b;font-size:10px;">editable form title</span>',
                '<code style="background:#e0f2fe;padding:2px 6px;border-radius:4px;font-size:11px;">{{form:description}}</code> <span style="color:#64748b;font-size:10px;">editable form description</span>',
                '<code style="background:#e0f2fe;padding:2px 6px;border-radius:4px;font-size:11px;">{{form:submit}}</code> <span style="color:#64748b;font-size:10px;">editable submit label</span>',
                '<code style="background:#dcfce7;padding:2px 6px;border-radius:4px;font-size:11px;">{{content:any_key}}</code> <span style="color:#64748b;font-size:10px;">editable template content</span>',
                '<code style="background:#ede9fe;padding:2px 6px;border-radius:4px;font-size:11px;">{{script:any_key}}</code> <span style="color:#64748b;font-size:10px;">managed runtime script token</span>'
            ];
            keysDiv.innerHTML = refs.concat(flatList.filter(function(f) {
                return f.type !== 'Hidden' && f.type !== 'Section' && f.type !== 'Html';
            }).map(function(f) {
                return '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:11px;">{{field:' + f.key + '}}</code> <span style="color:#cbd5e1;font-size:10px;">' + (f.type || 'Text') + '</span>';
            })).join('<br>');
        }
        renderCustomContentTokenEditor(htmlEditor.value || '');
        renderCustomScriptTokenEditor(htmlEditor.value || '');
        if (!htmlEditor._mfBound) {
            htmlEditor._mfBound = true;
            htmlEditor.addEventListener('input', function() {
                if (!B.state.schema.settings) B.state.schema.settings = {};
                B.state.schema.settings.customHtml = htmlEditor.value;
                B.state.schema.settings.CustomHtml = htmlEditor.value;
                renderCustomContentTokenEditor(htmlEditor.value);
                renderCustomScriptTokenEditor(htmlEditor.value);
                B.state.isDirty = true;
                if (B.scheduleHtmlEditorSync) B.scheduleHtmlEditorSync();
            });
            htmlEditor.addEventListener('blur', function() {
                if (B.syncCustomHtmlBidirectional) B.syncCustomHtmlBidirectional({ reason: 'html-editor-blur' });
                B.callModule('canvas', 'render');
            });
            htmlEditor.addEventListener('keydown', handleTabKey);
        }
        if (cssEditor && !cssEditor._mfBound) {
            cssEditor._mfBound = true;
            cssEditor.addEventListener('input', function() {
                if (!B.state.schema.settings) B.state.schema.settings = {};
                B.state.schema.settings.customCss = cssEditor.value;
                B.state.isDirty = true;
            });
            cssEditor.addEventListener('keydown', handleTabKey);
        }
        var genBtn = document.getElementById('mf-html-generate-btn');
        if (genBtn && !genBtn._mfBound) {
            genBtn._mfBound = true;
            genBtn.addEventListener('click', function() {
                var generated = generateHtmlAndCssFromFields();
                htmlEditor.value = generated.html;
                if (cssEditor) cssEditor.value = generated.css;
                if (!B.state.schema.settings) B.state.schema.settings = {};
                B.state.schema.settings.customHtml = generated.html;
                B.state.schema.settings.CustomHtml = generated.html;
                B.state.schema.settings.customCss = generated.css;
                B.state.schema.settings.CustomCss = generated.css;
                renderCustomContentTokenEditor(generated.html);
                renderCustomScriptTokenEditor(generated.html);
                if (B.syncCustomHtmlBidirectional) B.syncCustomHtmlBidirectional({ reason: 'html-generate' });
                B.state.isDirty = true;
                B.showToast('Default HTML + CSS generated from ' + B.state.schema.fields.length + ' fields', 'success');
            });
        }
        var clearBtn = document.getElementById('mf-html-clear-btn');
        if (clearBtn && !clearBtn._mfBound) {
            clearBtn._mfBound = true;
            clearBtn.addEventListener('click', function() {
                if (!confirm('Clear custom HTML? Form will auto-render fields instead.')) return;
                htmlEditor.value = '';
                if (cssEditor) cssEditor.value = '';
                if (!B.state.schema.settings) B.state.schema.settings = {};
                B.state.schema.settings.customHtml = '';
                B.state.schema.settings.CustomHtml = '';
                B.state.schema.settings.customCss = '';
                B.state.schema.settings.CustomCss = '';
                renderCustomContentTokenEditor('');
                renderCustomScriptTokenEditor('');
                B.state.isDirty = true;
                B.showToast('Custom HTML cleared', 'success');
            });
        }
        var previewBtn = document.getElementById('mf-html-preview-btn');
        if (previewBtn && !previewBtn._mfBound) {
            previewBtn._mfBound = true;
            previewBtn.addEventListener('click', function() { B.callModule('toolbar', 'preview'); });
        }
        // [2026-06-18 robust] Token Designer popup — opened via a SINGLE document-level
        // DELEGATED listener (set up once) instead of an id-bound handler. The
        // "Custom HTML editor" button (#mf-open-token-designer) lives inside the Design
        // Studio accordion whose body is moved/re-rendered between tabs, and the canvas
        // "Custom HTML Active" banner exposes its own [data-mf-open-html-designer] trigger —
        // delegation makes EVERY such trigger work regardless of timing/re-render/dup ids.
        // Capture phase + stopPropagation so the banner's own preview-click never also fires.
        if (!(document as any)._mfHtmlDesignerDelegated) {
            (document as any)._mfHtmlDesignerDelegated = true;
            document.addEventListener('click', function (ev: any) {
                var tgt = ev && ev.target;
                var trig = tgt && tgt.closest ? tgt.closest('#mf-open-token-designer, [data-mf-open-html-designer]') : null;
                if (!trig) return;
                ev.preventDefault();
                ev.stopPropagation();
                openHtmlDesigner();
            }, true);
        }
        // Re-render inline token list whenever the designer commits changes
        if (!(document as any)._mfTokensListener) {
            (document as any)._mfTokensListener = true;
            document.addEventListener('mf:tokens-changed', function () {
                var h = (B.state.schema.settings || {}).customHtml || '';
                renderCustomContentTokenEditor(h);
                renderCustomScriptTokenEditor(h);
            });
        }
    }
    function generateHtmlAndCssFromFields() {
        return {
            html: generateHtmlFromFields(),
            css: generateCssFromFields()
        };
    }
    function generateHtmlFromFields() {
        var fields = B.state.schema.fields || [];
        if (fields.length === 0) return '';
        var lines = [];
        lines.push('<div class="mf-generated-default-shell">');
        lines.push('  <div class="mfp mfp-default mf-generated-default">');
        lines.push('    <div class="mfp-default-header">');
        lines.push('      <h1>{{form:title}}</h1>');
        lines.push('      <p>{{form:description}}</p>');
        lines.push('    </div>');
        lines.push('    <div class="mfp-default-body">');
        var i = 0;
        while (i < fields.length) {
            var f = fields[i];
            if (f.type === 'Section') {
                if (f.properties && f.properties.pageBreak) {
                    lines.push('      {{field:' + B.escHtml(f.key || '') + '}}');
                } else {
                    lines.push('      <div class="mf-custom-section"><h3>' + B.escHtml(f.label) + '</h3></div>');
                }
                i++; continue;
            }
            if (f.type === 'Html') { lines.push('      {{field:' + f.key + '}}'); i++; continue; }
            if (f.type === 'Hidden') { i++; continue; }
            if (f.type === 'Row' && f.columns) {
                var colTemplate = f.columns.map(function(c) { return 'minmax(0, ' + (c.span || 6) + 'fr)'; }).join(' ');
                lines.push('      <div class="mf-custom-row" style="grid-template-columns:' + colTemplate + ';">');
                f.columns.forEach(function(col) {
                    lines.push('        <div class="mf-custom-col">');
                    (col.fields || []).forEach(function(cf) {
                        if (cf.type === 'Hidden') return;
                        if (cf.type === 'Section') {
                            if (cf.properties && cf.properties.pageBreak) {
                                lines.push('          {{field:' + B.escHtml(cf.key || '') + '}}');
                            } else {
                                lines.push('          <div class="mf-custom-section"><h3>' + B.escHtml(cf.label) + '</h3></div>');
                            }
                        } else if (cf.type === 'Html') {
                            lines.push('          {{field:' + cf.key + '}}');
                        } else {
                            lines.push('          <div class="mf-custom-field">{{field:' + cf.key + '}}</div>');
                        }
                    });
                    lines.push('        </div>');
                });
                lines.push('      </div>');
                i++; continue;
            }
            var nextF = (i + 1 < fields.length) ? fields[i + 1] : null;
            var isHalf = f.width === '50%';
            var nextIsHalf = nextF && nextF.width === '50%' && nextF.type !== 'Section' && nextF.type !== 'Html' && nextF.type !== 'Hidden' && nextF.type !== 'Row';
            if (isHalf && nextIsHalf) {
                lines.push('      <div class="mf-custom-row" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);">');
                lines.push('        <div class="mf-custom-field">{{field:' + f.key + '}}</div>');
                lines.push('        <div class="mf-custom-field">{{field:' + nextF.key + '}}</div>');
                lines.push('      </div>');
                i += 2;
            } else {
                lines.push('      <div class="mf-custom-field mf-custom-full">{{field:' + f.key + '}}</div>');
                i++;
            }
        }
        lines.push('      <div class="mfp-actions mf-custom-actions">');
        lines.push('        <button type="submit">{{form:submit}}</button>');
        lines.push('      </div>');
        lines.push('    </div>');
        lines.push('    <div class="mf-generated-default-powered">Powered by <strong>MegaForm</strong></div>');
        lines.push('  </div>');
        lines.push('</div>');
        return lines.join('\n');
    }
    function generateCssFromFields() {
        return [
            '/* Auto-generated by MegaForm Builder: renderer-aligned HTML + CSS baseline */',
            '.mf-generated-default-shell {',
            '  width: 100%;',
            '  min-height: calc(100vh - 48px);',
            '  display: flex;',
            '  justify-content: center;',
            '  padding: 24px 16px;',
            '  background: var(--mf-page-bg, #f5f5f5);',
            '  background-image: var(--mf-page-bg-image, none);',
            '  background-size: cover;',
            '  background-position: center;',
            '  box-sizing: border-box;',
            '}',
            '.mfp.mfp-default.mf-generated-default {',
            '  width: 100%;',
            '  max-width: var(--mf-form-max-width, 960px);',
            '  margin: 0 auto;',
            '  padding: 0;',
            '  background: var(--mf-form-bg, #ffffff);',
            '  border: var(--mf-form-border, none);',
            '  border-radius: var(--mf-form-radius, 8px);',
            '  overflow: hidden;',
            '  box-shadow: var(--mf-form-shadow, 0 1px 6px rgba(0,0,0,0.1));',
            '  font-family: var(--mf-font-family, "Inter", system-ui, sans-serif);',
            '}',
            '.mf-generated-default .mfp-default-header {',
            '  padding: 28px 32px 20px;',
            '  border-bottom: 1px solid var(--mf-section-border-color, #e5e7eb);',
            '  margin: 0;',
            '}',
            '.mf-generated-default .mfp-default-header h1 {',
            '  margin: 0 0 8px 0;',
            '  font-size: var(--mf-title-font-size, 24px);',
            '  font-weight: var(--mf-title-font-weight, 700);',
            '  color: var(--mf-title-color, #1a1a2e);',
            '  text-align: var(--mf-title-align, left);',
            '}',
            '.mf-generated-default .mfp-default-header p {',
            '  margin: 0;',
            '  font-size: var(--mf-desc-font-size, 14px);',
            '  color: var(--mf-desc-color, #666666);',
            '  text-align: var(--mf-title-align, left);',
            '}',
            '.mf-generated-default .mfp-default-body {',
            '  padding: var(--mf-form-padding, 32px 40px);',
            '  background: var(--mf-form-bg, #ffffff);',
            '}',
            '.mf-generated-default .mf-custom-row {',
            '  display: grid;',
            '  gap: var(--mf-field-gap, 20px);',
            '  width: 100%;',
            '  min-width: 0;',
            '  margin-bottom: var(--mf-field-gap, 20px);',
            '}',
            '.mf-generated-default .mf-custom-col,',
            '.mf-generated-default .mf-custom-field {',
            '  min-width: 0;',
            '}',
            '.mf-generated-default .mf-custom-full {',
            '  margin-bottom: var(--mf-field-gap, 20px);',
            '}',
            '.mf-generated-default .mf-field-group {',
            '  margin: 0;',
            '  width: 100%;',
            '}',
            '.mf-generated-default .mf-field-label {',
            '  display: block;',
            '  margin: 0 0 var(--mf-label-margin-bottom, 6px) 0;',
            '  font-size: var(--mf-label-font-size, 14px);',
            '  font-weight: var(--mf-label-font-weight, 600);',
            '  color: var(--mf-label-color, #333333);',
            '}',
            '.mf-generated-default .mf-input,',
            '.mf-generated-default .mf-select,',
            '.mf-generated-default .mf-textarea {',
            '  width: 100%;',
            '  box-sizing: border-box;',
            '}',
            '.mf-generated-default .mf-textarea {',
            '  min-height: 100px;',
            '}',
            '.mf-generated-default .mf-option-group {',
            '  width: 100%;',
            '}',
            '.mf-generated-default .mf-custom-section {',
            '  padding-top: 4px;',
            '  margin-bottom: 18px;',
            '  border-top: 1px solid var(--mf-section-border-color, #e5e7eb);',
            '}',
            '.mf-generated-default .mf-custom-section h3 {',
            '  margin: 14px 0 0 0;',
            '  font-size: var(--mf-section-title-size, 18px);',
            '  color: var(--mf-section-title-color, #1a1a2e);',
            '}',
            '.mf-generated-default .mf-custom-actions {',
            '  display: flex;',
            '  justify-content: flex-start;',
            '  align-items: center;',
            '  gap: 12px;',
            '  margin-top: 8px;',
            '  padding-top: 20px;',
            '  border-top: 1px solid var(--mf-section-border-color, #e5e7eb);',
            '}',
            '.mf-generated-default .mf-custom-actions > button[type="submit"] {',
            '  appearance: none;',
            '  border: none;',
            '  display: inline-flex;',
            '  align-items: center;',
            '  justify-content: center;',
            '  cursor: pointer;',
            '  background: var(--mf-btn-bg, var(--mf-primary, #4a90d9));',
            '  color: var(--mf-btn-color, var(--mf-primary-text, #ffffff));',
            '  border-radius: var(--mf-btn-radius, 6px);',
            '  padding: var(--mf-btn-padding, 12px 32px);',
            '  font-size: var(--mf-btn-font-size, 16px);',
            '  font-weight: var(--mf-btn-font-weight, 600);',
            '  box-shadow: var(--mf-btn-shadow, 0 2px 4px rgba(0,0,0,0.1));',
            '}',
            '.mf-generated-default .mf-custom-actions > button[type="submit"]:hover {',
            '  background: var(--mf-btn-bg-hover, var(--mf-primary-hover, #3a7bc8));',
            '}',
            '.mf-generated-default .mf-custom-actions > button[type="submit"]:focus {',
            '  outline: none;',
            '  box-shadow: var(--mf-btn-shadow, 0 2px 4px rgba(0,0,0,0.1)), 0 0 0 3px rgba(74, 144, 217, 0.15);',
            '}',
            '.mf-generated-default-powered {',
            '  border-top: 1px solid #eceff4;',
            '  background: var(--mf-form-bg, #ffffff);',
            '  padding: 12px 18px;',
            '  text-align: center;',
            '  font-size: 12px;',
            '  color: #94a3b8;',
            '}',
            '.mf-generated-default-powered strong {',
            '  color: var(--mf-primary, #4a90d9);',
            '  font-weight: 700;',
            '}',
            '.mf-generated-default .mf-help-text {',
            '  color: var(--mf-help-color, #888888);',
            '  font-size: var(--mf-help-font-size, 12px);',
            '}',
            '@media (max-width: 768px) {',
            '  .mf-generated-default-shell {',
            '    min-height: auto;',
            '    padding: 16px 12px;',
            '  }',
            '  .mf-generated-default .mfp-default-header {',
            '    padding: 22px 18px 18px;',
            '  }',
            '  .mf-generated-default .mfp-default-body {',
            '    padding: 20px 18px;',
            '  }',
            '  .mf-generated-default .mf-custom-row {',
            '    grid-template-columns: 1fr !important;',
            '  }',
            '  .mf-generated-default .mf-custom-actions {',
            '    flex-direction: column;',
            '    align-items: stretch;',
            '  }',
            '  .mf-generated-default .mf-custom-actions > button[type="submit"] {',
            '    width: 100%;',
            '  }',
            '}',
            ''
        ].join('\n');
    }
    // HTML tab removed — always auto-render
    function handleTabKey(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            var s = this.selectionStart;
            this.value = this.value.substring(0, s) + '  ' + this.value.substring(this.selectionEnd);
            this.selectionStart = this.selectionEnd = s + 2;
        }
    }
    function copyToClipboard(text, msg) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(function() { B.showToast(msg, 'success'); });
        } else {
            var ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            B.showToast(msg, 'success');
        }
    }
    // =========================================================
    //  GENERATE HTML FROM FIELDS
    // =========================================================
    // =========================================================
    //  SHOW / HIDE PROPERTIES
    // =========================================================
    // =========================================================
    //  SHOW / HIDE PROPERTIES  — driven by FieldPlugin registry
    //  Không còn if/else per field type ở đây.
    //  Để thay đổi groups của 1 field: sửa field-plugins/_index.ts
    // =========================================================
    var PROP_ACCORDION_BADGE = 'BuilderPropAccordion v20260527-04';
    try { (window as any).__MF_BUILDER_PROP_ACCORDION_BADGE__ = PROP_ACCORDION_BADGE; } catch (_badgeErr) {}

    function getPropAccordionHeading(group) {
        if (!group) return null;
        for (var i = 0; i < group.children.length; i++) {
            var child = group.children[i];
            if (child && child.tagName && String(child.tagName).toUpperCase() === 'H6') return child;
        }
        return null;
    }

    function getPropAccordionKey(group) {
        var id = group && group.id ? group.id : '';
        var title = group ? String(group.getAttribute('data-mf-prop-accordion-title') || '') : '';
        if (!title) {
            var heading = getPropAccordionHeading(group);
            title = heading ? String(heading.textContent || '').trim().replace(/\s+/g, '-') : 'section';
        }
        return 'MegaForm.Builder.FieldPropAccordion.' + (id || title || 'section');
    }

    function setPropAccordionOpen(group, isOpen, persist) {
        if (!group) return;
        group.classList.toggle('mf-prop-acc-open', !!isOpen);
        group.classList.toggle('mf-prop-acc-collapsed', !isOpen);
        var toggle = group.querySelector('.mf-prop-accordion-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (persist) {
            try {
                window.sessionStorage.setItem(getPropAccordionKey(group), isOpen ? 'open' : 'collapsed');
            } catch (_storageErr) {}
        }
    }

    function enhancePropertyAccordions(root) {
        var host = root || document.getElementById('mf-field-props');
        if (!host) return;
        var groups = host.querySelectorAll('.mf-prop-group');
        groups.forEach(function(group) {
            var heading = getPropAccordionHeading(group);
            if (!heading) return;
            var titleText = String(group.getAttribute('data-mf-prop-accordion-title') || heading.textContent || 'Section').trim();
            if (!group.getAttribute('data-mf-prop-accordion-title')) {
                group.setAttribute('data-mf-prop-accordion-title', titleText);
            }
            if (group.getAttribute('data-mf-prop-accordion-ready') !== '1') {
                var body = document.createElement('div');
                body.className = 'mf-prop-accordion-body';
                var nodes = Array.prototype.slice.call(group.childNodes);
                nodes.forEach(function(node) {
                    if (node !== heading) body.appendChild(node);
                });
                var toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'mf-prop-accordion-toggle';
                toggle.setAttribute('aria-expanded', 'false');
                toggle.innerHTML = '<span class="mf-prop-accordion-title">' + heading.innerHTML + '</span>' +
                    '<span class="mf-prop-accordion-chevron" aria-hidden="true"><i class="fas fa-chevron-down"></i></span>';
                heading.innerHTML = '';
                heading.appendChild(toggle);
                group.appendChild(body);
                group.classList.add('mf-prop-accordion');
                group.setAttribute('data-mf-prop-accordion-ready', '1');
                // [v20260527-04] Make the entire heading row clickable (not just
                // the inner button) so click on padding/title text also toggles.
                // The button click stops propagation to avoid double-toggle.
                toggle.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    setPropAccordionOpen(group, group.classList.contains('mf-prop-acc-collapsed'), true);
                });
                heading.style.cursor = 'pointer';
                heading.addEventListener('click', function(e) {
                    // Only trigger when click target isn't the inner button (button has its own listener).
                    if (e.target && (e.target as Element).closest && (e.target as Element).closest('.mf-prop-accordion-toggle')) return;
                    e.preventDefault();
                    setPropAccordionOpen(group, group.classList.contains('mf-prop-acc-collapsed'), true);
                });
            }
            var saved = null;
            try { saved = window.sessionStorage.getItem(getPropAccordionKey(group)); } catch (_readErr) {}
            setPropAccordionOpen(group, saved === 'open', false);
        });
    }

    function showProps(field) {
        var panel = B.el(B.EL.fieldProps);
        var noSel = B.el(B.EL.noFieldSelected);
        if (panel) panel.style.display = '';
        if (noSel) noSel.style.display = 'none';
        activateTab('field');
        // [B87] Auto-expand the Field Properties accordion so selecting a field
        // always reveals its props without an extra click.
        try { if ((window as any).MFDesignOpenField) (window as any).MFDesignOpenField(); } catch (e) { /* noop */ }
        // ── Header: icon + label ────────────────────────────
        var ft = B.fieldTypes[field.type] || { icon: 'fa-puzzle-piece', label: field.type };
        var typeLabel = B.el(B.EL.propFieldTypeLabel);
        var shownTypeLabel = B.getLocalizedControlLabel ? B.getLocalizedControlLabel(field.type, ft.label || field.type) : (ft.label || field.type);
        if (typeLabel) typeLabel.innerHTML = '<i class="fas ' + ft.icon + '"></i> ' + shownTypeLabel;
        currentField = field;
        // ── Lấy groups từ registry ──────────────────────────
        var R = (window as any).MFFieldPlugins;
        var groups = R ? R.getSettingsGroups(field.type) : null;
        // Row type (groups rỗng) → ẩn tất cả và thoát
        if (groups && groups.length === 0) {
            hideAllGroups();
            return;
        }
        // ── Ẩn tất cả trước, rồi chỉ hiện nhóm được khai báo
        hideAllGroups();
        if (groups) {
            groups.forEach(function(g) {
                switch (g) {
                    case 'general':    B.toggle('mf-prop-general-group', true); break;
                    case 'options':    B.toggle('mf-prop-options-group', true); break;
                    case 'validation': B.toggle('mf-prop-validation-group', true); break;
                    case 'file':       B.toggle('mf-prop-file-group', true); break;
                    case 'html':       B.toggle('mf-prop-html-group', true); break;
                    case 'uniqueid':   B.toggle('mf-prop-uniqueid-group', true); break;
                    case 'condition':  B.toggle('mf-prop-condition-group', true); break;
                    case 'pagebreak':  B.toggle('mf-prop-pagebreak-group', true); break;
                }
            });
        }
        // ── Populate standard inputs ────────────────────────
        var staleRatingStyle = document.getElementById('mf-prop-rating-style-wrap');
        if (staleRatingStyle && field.type !== 'Rating') staleRatingStyle.remove();
        var staleDateVariant = document.getElementById('mf-prop-date-variant-wrap');
        if (staleDateVariant && field.type !== 'Date') staleDateVariant.remove();
        var staleSelectVariant = document.getElementById('mf-prop-select-variant-wrap');
        if (staleSelectVariant && field.type !== 'Select' && field.type !== 'MultiSelect') staleSelectVariant.remove();
        var staleComposite = document.getElementById('mf-prop-composite-wrap');
        if (staleComposite && field.type !== 'Composite') staleComposite.remove();
        B.setVal('mf-prop-key',         field.key);
        B.setVal('mf-prop-label',       field.label);
        B.setVal('mf-prop-placeholder', field.placeholder);
        B.setVal('mf-prop-helptext',    field.helpText);
        B.setVal('mf-prop-default',     field.defaultValue);
        B.setVal('mf-prop-css',         field.cssClass);
        B.setVal('mf-prop-width',       field.width || '100%');
        // [B46] Height + Rows population.
        B.setVal('mf-prop-height',      field.height || '');
        B.setVal('mf-prop-rows',        field.rows != null ? String(field.rows) : '');
        // Rows wrap visible only for Textarea; Height wrap visible for any input-like field.
        var isTextarea = field.type === 'Textarea';
        var heightAppliesTo = ['Text','Email','Number','Phone','Url','Textarea','Select'];
        B.toggle('mf-prop-height-wrap', heightAppliesTo.indexOf(String(field.type)) >= 0);
        B.toggle('mf-prop-rows-wrap',   isTextarea);
        B.setChecked('mf-prop-required', field.required);
        B.setChecked('mf-prop-readonly', field.readOnly);
        B.setVal('mf-prop-prefill',     field.prefillParam);
        // ── Populate validation ─────────────────────────────
        var v = field.validation || {};
        B.setVal('mf-prop-minlength',  v.minLength    || '');
        B.setVal('mf-prop-maxlength',  v.maxLength    || '');
        B.setVal('mf-prop-min',        v.min          || '');
        B.setVal('mf-prop-max',        v.max          || '');
        B.setVal('mf-prop-pattern',    v.pattern      || '');
        B.setVal('mf-prop-custom-msg', v.customMessage || '');
        // ── Conditional logic ───────────────────────────────
        B.setChecked('mf-prop-has-condition', !!field.showIf);
        B.toggle('mf-condition-builder', !!field.showIf);
        if (field.showIf) renderConditionBuilder(field);
        // ── Logic Summary (Rules that affect this field) ────
        renderLogicSummary(field);
        // ── Options (Select/Radio/Checkbox) ─────────────────
        if (ft.hasOptions) {
            renderOptionsEditor(field.options || []);
            var isChoiceField = field.type === 'Radio' || field.type === 'Checkbox';
            var choiceProps = field.properties || {};
            B.toggle('mf-prop-option-style-wrap', isChoiceField);
            B.toggle('mf-prop-option-columns-wrap', isChoiceField);
            B.setVal('mf-prop-option-display', String(field.optionDisplay || choiceProps.optionDisplay || 'default'));
            B.setChecked('mf-prop-option-richhtml', field.allowOptionHtml === true || choiceProps.allowOptionHtml === true);
            B.setVal('mf-prop-option-columns', field.optionColumns ? String(field.optionColumns) : '');
            // ── Options source (Static vs SQL) — FieldOptionsUi v20260516-02 (cascading) ──
            var fp = field.properties || (field.properties = {});
            var src = String(fp.optionsSource || 'static').toLowerCase() === 'sql' ? 'sql' : 'static';
            var optType = String(fp.optionsType || 'sql').toLowerCase();
            if (optType !== 'storedproc' && optType !== 'sproc') optType = 'sql';
            var depRaw = fp.optionsDependsOn;
            var depCsv = Array.isArray(depRaw) ? depRaw.join(', ') : String(depRaw || '');
            B.setVal('mf-prop-options-source', src);
            B.setVal('mf-prop-options-type',   optType);
            B.setVal('mf-prop-options-conn',   String(fp.optionsConnectionKey || ''));
            B.setVal('mf-prop-options-dbtype', String(fp.optionsDatabaseType  || ''));
            B.setVal('mf-prop-options-sql',    String(fp.optionsSql           || ''));
            B.setVal('mf-prop-options-depends', depCsv);
            var sqlLbl = document.getElementById('mf-prop-options-sql-label');
            if (sqlLbl) sqlLbl.textContent = optType === 'storedproc' ? 'Stored procedure name' : 'SQL query';
            B.toggle('mf-prop-options-static-wrap', src === 'static');
            B.toggle('mf-prop-options-sql-wrap',    src === 'sql');
        } else {
            B.toggle('mf-prop-option-style-wrap', false);
            B.toggle('mf-prop-option-columns-wrap', false);
            B.setVal('mf-prop-option-columns', '');
        }
        // ── Delegate onSelect sang plugin ───────────────────
        // Vd: UniqueId, Html, Section, Captcha...
        var container = document.getElementById('mf-field-props');
        if (R && container) R.dispatchSelect(field, container);
        // ── Widget settings — render TRONG Field tab (không còn tab riêng) ──
        var isWidget = typeof MegaFormWidgets !== 'undefined' &&
                       MegaFormWidgets.widgetTypes && MegaFormWidgets.widgetTypes[field.type];
        // [B54] Treat MultiColumnCombo + Appointment as widgets even if the
        // widgetTypes lookup races the plugin script (some Oqtane render
        // paths load the plugin async after the builder boot). The plugin
        // properties[] array is the authoritative source for the form.
        if (!isWidget && typeof MegaFormWidgets !== 'undefined' && typeof MegaFormWidgets.getPlugin === 'function') {
            try {
                var maybePlugin = MegaFormWidgets.getPlugin(field.type);
                if (maybePlugin) isWidget = true;
            } catch (_e) { /* swallow */ }
        }
        // Ẩn widget tab link hoàn toàn (đã merge vào Field tab)
        var widgetTabLink = B.el(B.EL.tabLinkWidget);
        if (widgetTabLink) widgetTabLink.style.display = 'none';
        // Hiện widget group trong Field tab, render nội dung vào đó
        B.toggle('mf-prop-widget-group', isWidget);
        if (isWidget) {
            renderWidgetPropsEditor(field, 'mf-prop-widget-body');
        }
        ensureFieldSettingsBadge('mf-field-props', field);
        enhancePropertyAccordions(document.getElementById('mf-field-props'));
    }
    // Ẩn tất cả standard groups
    function hideAllGroups() {
        var ALL_GROUPS = [
            'mf-prop-general-group',
            'mf-prop-options-group',
            'mf-prop-validation-group',
            'mf-prop-file-group',
            'mf-prop-html-group',
            'mf-prop-uniqueid-group',
            'mf-prop-condition-group',
            'mf-prop-pagebreak-group',
            'mf-prop-widget-group',
        ];
        ALL_GROUPS.forEach(function(id) { B.toggle(id, false); });
    }
    // =========================================================
    //  WIDGET PROPERTIES EDITOR — dynamic per-type
    // =========================================================
    function renderWidgetPropsEditor(field, bodyId) {
        var body = document.getElementById(bodyId || 'mf-prop-widget-body');
        if (!body) return;
        if (!field.widgetProps) field.widgetProps = {};
        body.innerHTML = '';
        if (typeof MegaFormWidgets === 'undefined' || !MegaFormWidgets.getPlugin) return;
        var plugin = MegaFormWidgets.getPlugin(field.type);
        if (!plugin) return;
        var onChange = function() {
            B.state.isDirty = true;
            B.callModule('canvas', 'render');
        };
        // [B27] Widget-specific designer popups — Slider + ImageChoice both
        // get a top "Open Designer" button injected AFTER the auto-render
        // writes innerHTML. The button opens a modal designer that wraps the
        // shared image upload + gallery helpers from MFTokenDesigner.
        var DESIGNERS: any = {
            'ContentSlider': { label: 'Open Slider Designer',       global: 'MFSliderDesigner',      btnId: 'mf-open-slider-designer' },
            'ImageChoice':   { label: 'Open Image Choice Designer', global: 'MFImageChoiceDesigner', btnId: 'mf-open-ic-designer' }
        };
        var designerSpec = DESIGNERS[field.type];
        if (designerSpec) {
            var injectDesignerBtn = function () {
                var openBtn = document.createElement('button');
                openBtn.type = 'button';
                openBtn.className = 'mf-builder-btn';
                openBtn.style.cssText = 'width:100%;margin-bottom:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;font-weight:600';
                openBtn.innerHTML = '<i class="fas fa-paint-roller"></i> ' + designerSpec.label;
                openBtn.id = designerSpec.btnId;
                openBtn.addEventListener('click', function () {
                    var sd: any = (window as any)[designerSpec.global];
                    if (sd && typeof sd.open === 'function') {
                        sd.open(field, function () {
                            renderWidgetPropsEditor(field, bodyId);
                            B.state.isDirty = true;
                            B.callModule('canvas', 'render');
                        });
                    } else B.showToast(designerSpec.label.replace('Open ', '') + ' not loaded', 'error');
                });
                body.insertBefore(openBtn, body.firstChild);
            };
            setTimeout(injectDesignerBtn, 0);
        }
        // 1. Plugin has a custom full-UI renderer (renderProperties, renderPropertiesPanel, or renderBuilderPanel)
        var customRender = plugin.renderProperties || plugin.renderPropertiesPanel || plugin.renderBuilderPanel;
        if (typeof customRender === 'function') {
            try {
                customRender(body, field, onChange);
            } catch(e) {
                console.error('Plugin renderProperties error:', e);
                body.innerHTML = '<div style="color:#ef4444;font-size:12px;padding:8px;">Error loading widget settings</div>';
            }
            return;
        }
        // 2. Auto-generate UI from plugin.properties[] array
        if (plugin.properties && plugin.properties.length) {
            var wp = field.widgetProps;
            var html = '<div class="mfw-auto-props">';
            var pluginBadge = '';
            if (B.extractVersionBadge) {
                pluginBadge = B.extractVersionBadge((plugin.meta && plugin.meta.label) || '');
            }
            if (!pluginBadge && plugin.properties && plugin.properties.length && B.extractVersionBadge) {
                plugin.properties.some(function(pp) {
                    var candidate = B.extractVersionBadge(pp && pp.label ? pp.label : '');
                    if (candidate) { pluginBadge = candidate; return true; }
                    return false;
                });
            }
            if (pluginBadge) {
                html += '<div class="mf-widget-settings-badge-wrap"><span class="mf-widget-settings-badge">' + B.escHtml(pluginBadge) + '</span></div>';
            }
            plugin.properties.forEach(function(prop) {
                var inputHtml = '';
                var propType = prop.type || 'text';
                if (propType === 'help' || propType === 'info') {
                    var helpButtonLabel = prop.buttonLabel || prop.label || 'Open help';
                    var helpKey = B.escAttr(String(prop.key || ''));
                    // [v20260527-04] Render Help button + inline Sample preset picker
                    // when the property defines `samples: [{label, apply:{...}}, ...]`.
                    // Apply merges all keys in the preset onto field.widgetProps and
                    // re-renders the panel so the user sees every setting filled in.
                    var samples = Array.isArray((prop as any).samples) ? (prop as any).samples : [];
                    html += '<div class="mfw-prop-help-launch" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
                        '<button type="button" class="mfw-prop-help-btn" data-help-prop="' + helpKey + '">' +
                        '<i class="fas fa-circle-info" aria-hidden="true"></i><span>' + B.escHtml(helpButtonLabel) + '</span>' +
                        '</button>';
                    if (samples.length) {
                        html += '<div class="mfw-prop-sample-picker" data-sample-host="' + helpKey + '" style="display:flex;gap:6px;align-items:center;flex:1;min-width:220px;">' +
                            '<select data-sample-select="' + helpKey + '" style="flex:1;min-width:0;font-size:12px;padding:6px 8px;border:1px solid #cbd5f5;border-radius:6px;">' +
                            '<option value="">— Pick a sample to apply —</option>';
                        samples.forEach(function(s, idx) {
                            var lbl = String((s && s.label) || ('Sample ' + (idx + 1)));
                            html += '<option value="' + idx + '">' + B.escHtml(lbl) + '</option>';
                        });
                        html += '</select>' +
                            '<button type="button" class="mfw-prop-sample-apply" data-sample-apply="' + helpKey + '" ' +
                            'style="font-size:12px;padding:6px 10px;border:0;border-radius:6px;background:#4f46e5;color:#fff;cursor:pointer;font-weight:600;">' +
                            'Apply sample</button>' +
                            '</div>';
                    }
                    html += '</div>';
                    return;
                }
                var val = wp[prop.key] !== undefined ? wp[prop.key] : prop.default;
                var propLabel = B.stripVersionBadge ? B.stripVersionBadge(prop.label) : prop.label;
                if (propType === 'checkbox') {
                    inputHtml = '<label class="mfw-prop-toggle">' +
                        '<input type="checkbox" data-prop="' + prop.key + '"' + (val ? ' checked' : '') + '>' +
                        '<span>' + B.escHtml(propLabel) + '</span></label>';
                } else if (propType === 'select' && prop.options) {
                    inputHtml = '<label class="mfw-prop-row"><span class="mfw-prop-label">' + B.escHtml(propLabel) + '</span>' +
                        '<select data-prop="' + prop.key + '">';
                    prop.options.forEach(function(o) {
                        var ov = typeof o === 'string' ? o : o.value;
                        var ol = typeof o === 'string' ? o : o.label;
                        inputHtml += '<option value="' + B.escAttr(ov) + '"' + (String(val) === String(ov) ? ' selected' : '') + '>' + B.escHtml(ol) + '</option>';
                    });
                    inputHtml += '</select></label>';
                } else if (propType === 'color') {
                    inputHtml = '<label class="mfw-prop-row"><span class="mfw-prop-label">' + B.escHtml(propLabel) + '</span>' +
                        '<input type="color" data-prop="' + prop.key + '" value="' + B.escAttr(String(val || '#000000')) + '"></label>';
                } else if (propType === 'number') {
                    inputHtml = '<label class="mfw-prop-row"><span class="mfw-prop-label">' + B.escHtml(propLabel) + '</span>' +
                        '<input type="number" data-prop="' + prop.key + '" value="' + B.escAttr(String(val !== undefined ? val : '')) + '"' +
                        (prop.min !== undefined ? ' min="' + prop.min + '"' : '') +
                        (prop.max !== undefined ? ' max="' + prop.max + '"' : '') +
                        (prop.step !== undefined ? ' step="' + prop.step + '"' : '') + '></label>';
                } else if (propType === 'textarea') {
                    // [PropTextareaJson v20260430-11] Arrays/objects must serialize as JSON, not "[object Object]"
                    var displayVal = (val !== null && typeof val === 'object')
                        ? JSON.stringify(val, null, 2)
                        : String(val == null ? '' : val);
                    inputHtml = '<label class="mfw-prop-row mfw-prop-col"><span class="mfw-prop-label">' + B.escHtml(propLabel) + '</span>' +
                        '<textarea data-prop="' + prop.key + '" rows="6" spellcheck="false" style="font-family:ui-monospace,monospace;font-size:12px">' + B.escHtml(displayVal) + '</textarea></label>';
                } else {
                    inputHtml = '<label class="mfw-prop-row"><span class="mfw-prop-label">' + B.escHtml(propLabel) + '</span>' +
                        '<input type="text" data-prop="' + prop.key + '" value="' + B.escAttr(String(val !== undefined ? val : '')) + '"></label>';
                }
                html += inputHtml;
            });
            html += '</div>';
            body.innerHTML = html;
            body.querySelectorAll('[data-help-prop]').forEach(function(el) {
                el.addEventListener('click', function(e) {
                    e.preventDefault();
                    var key = el.getAttribute('data-help-prop');
                    var helpProp = plugin.properties.find(function(p) { return String(p.key || '') === String(key || ''); });
                    if (!helpProp) return;
                    var helpHtml = helpProp.html
                        ? String(helpProp.html)
                        : B.escHtml(String(helpProp.text || helpProp.label || '')).replace(/\n/g, '<br>');
                    var helpTitle = B.stripVersionBadge ? B.stripVersionBadge(helpProp.label || 'Widget Help') : (helpProp.label || 'Widget Help');
                    showWidgetHelpModal(helpTitle, helpHtml, helpProp.description || helpProp.subTitle || '');
                });
            });
            // [v20260527-04] Apply sample preset: merge preset.apply onto
            // field.widgetProps and re-render the widget settings panel so
            // every textarea/select reflects the new values.
            body.querySelectorAll('[data-sample-apply]').forEach(function(applyBtn) {
                applyBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    var key = applyBtn.getAttribute('data-sample-apply');
                    var selector = 'select[data-sample-select="' + key + '"]';
                    var picker = body.querySelector(selector) as HTMLSelectElement | null;
                    if (!picker || picker.value === '') {
                        try { (window as any).alert && (window as any).alert('Pick a sample first, then click Apply.'); } catch (_) {}
                        return;
                    }
                    var idx = parseInt(picker.value, 10);
                    var helpProp = plugin.properties.find(function(p) { return String(p.key || '') === String(key || ''); });
                    var samples = (helpProp && Array.isArray((helpProp as any).samples)) ? (helpProp as any).samples : [];
                    var preset = (idx >= 0 && idx < samples.length) ? samples[idx] : null;
                    if (!preset || !preset.apply) return;
                    field.widgetProps = field.widgetProps || {};
                    Object.keys(preset.apply).forEach(function(propKey) {
                        field.widgetProps[propKey] = preset.apply[propKey];
                    });
                    // Re-render widget settings panel so user sees every textarea/select fill in.
                    renderWidgetPropsEditor(field, bodyId);
                    onChange();
                });
            });
            // Bind all inputs
            body.querySelectorAll('[data-prop]').forEach(function(el) {
                var evt = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
                el.addEventListener(evt, function() {
                    var key = el.getAttribute('data-prop');
                    var newVal = el.type === 'checkbox' ? el.checked : el.value;
                    // coerce number
                    var propDef = plugin.properties.find(function(p) { return p.key === key; });
                    if (propDef && propDef.type === 'number') newVal = el.value === '' ? '' : Number(el.value);
                    // [PropTextareaJson v20260430-11] textarea may carry JSON — try to parse so widget gets array/object
                    if (propDef && propDef.type === 'textarea' && el.tagName === 'TEXTAREA') {
                        var trimmed = String(newVal).trim();
                        if (trimmed.length && (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{')) {
                            try { newVal = JSON.parse(trimmed); } catch (_e) { /* keep raw text while user types/fixes */ }
                        }
                    }
                    field.widgetProps[key] = newVal;
                    onChange();
                });
            });
            return;
        }
        body.innerHTML = '<div style="color:#94a3b8;font-size:12px;padding:8px;text-align:center;">No settings available for this widget</div>';
    }
    function hideProps() {
        var panel = B.el(B.EL.fieldProps);
        var noSel = B.el(B.EL.noFieldSelected);
        if (panel) panel.style.display = 'none';
        if (noSel) noSel.style.display = '';
        // Widget tab đã merge vào Field tab — chỉ cần ẩn widget group
        var wNoSel = document.getElementById('mf-widget-no-selection');
        var wProps = document.getElementById('mf-widget-props');
        if (wNoSel) wNoSel.style.display = '';
        if (wProps) wProps.style.display = 'none';
    }
    // =========================================================
    //  PROPERTY INPUT BINDING
    // =========================================================
    function bindPropertyInputs() {
        var propMap = {
            'mf-prop-key': 'key',
            'mf-prop-label': 'label',
            'mf-prop-placeholder': 'placeholder',
            'mf-prop-helptext': 'helpText',
            'mf-prop-default': 'defaultValue',
            'mf-prop-css': 'cssClass',
            'mf-prop-prefill': 'prefillParam'
        };
        // [B87] Auto-derive the field key from the label until the user edits the
        // key manually (matches Typeform/Jotform). Helpers:
        function slugifyFieldKey(s: string): string {
            return String(s || '').toLowerCase().trim()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .replace(/_{2,}/g, '_')
                .slice(0, 60);
        }
        function keyLooksAuto(k: string): boolean {
            k = String(k || '');
            if (!k) return true;
            // auto-generated pattern e.g. text_3_ks2u / email_5_ab12 / shorttext_2
            return /^[a-z]+_\d+(_[a-z0-9]+)?$/i.test(k);
        }
        function uniqueFieldKey(base: string, selfField: any): string {
            if (!base) return base;
            var used: Record<string, number> = {};
            function walk(list: any[]): void {
                (list || []).forEach(function (ff: any) {
                    if (!ff || ff === selfField) return;
                    if (ff.key) used[String(ff.key).toLowerCase()] = 1;
                    if (Array.isArray(ff.columns)) ff.columns.forEach(function (c: any) { if (c && Array.isArray(c.fields)) walk(c.fields); });
                });
            }
            try { walk((B as any).state && (B as any).state.schema && (B as any).state.schema.fields); } catch (e) { /* noop */ }
            if (!used[base]) return base;
            var n = 2; while (used[base + '_' + n]) n++; return base + '_' + n;
        }
        function applyKeyRename(f: any, keyInputEl: any, oldKey: string, newKey: string): void {
            if (!newKey || oldKey === newKey) return;
            f.key = newKey;
            if (keyInputEl) keyInputEl.value = newKey;
            B.state.isDirty = true;
            if (B.syncSchemaToHtmlImmediate) B.syncSchemaToHtmlImmediate({ reason: 'field-key-rename', renameMap: { oldKey: oldKey, newKey: newKey } });
            B.callModule('properties', 'refreshHtmlEditors');
        }
        Object.keys(propMap).forEach(function (elId) {
            var input = B.el(elId);
            if (!input) return;
            input.addEventListener('input', function () {
                if (hasActiveFieldSelection(currentField)) {
                    var f = getActiveField(currentField);
                    if (!f) return;
                    if (elId === 'mf-prop-key') {
                        f.keyEdited = true; // user took manual control of the key → stop auto-deriving
                        var oldKey = String(f.key || '');
                        var newKey = String(this.value || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
                        if (!newKey) return;
                        applyKeyRename(f, this, oldKey, newKey);
                    } else {
                        f[propMap[elId]] = this.value;
                        B.state.isDirty = true;
                        // [B87] Label changed → derive the key if the user hasn't set one.
                        if (elId === 'mf-prop-label' && !f.keyEdited && keyLooksAuto(f.key)) {
                            var derived = uniqueFieldKey(slugifyFieldKey(this.value), f);
                            if (derived) applyKeyRename(f, B.el('mf-prop-key'), String(f.key || ''), derived);
                        }
                    }
                    B.callModule('canvas', 'render');
                }
            });
        });
        // Width
        var widthEl = B.el('mf-prop-width');
        if (widthEl) {
            widthEl.addEventListener('change', function () {
                if (hasActiveFieldSelection(currentField)) {
                    var f = getActiveField(currentField);
                    if (!f) return;
                    f.width = this.value;
                    B.state.isDirty = true;
                    B.callModule('canvas', 'render');
                }
            });
        }
        // [B46] Height — auto-suffix bare numbers with px, accept any CSS unit, blank = default.
        var heightEl = B.el('mf-prop-height');
        if (heightEl) {
            var commitHeight = function () {
                if (!hasActiveFieldSelection(currentField)) return;
                var f = getActiveField(currentField);
                if (!f) return;
                var raw = String(heightEl.value || '').trim();
                if (!raw) {
                    delete f.height;
                } else {
                    f.height = /^\d+(\.\d+)?$/.test(raw) ? raw + 'px' : raw;
                }
                B.state.isDirty = true;
                B.callModule('canvas', 'render');
            };
            heightEl.addEventListener('change', commitHeight);
            heightEl.addEventListener('blur', commitHeight);
        }
        // [B46] Rows (Textarea only) — integer, blank = default.
        var rowsEl = B.el('mf-prop-rows');
        if (rowsEl) {
            rowsEl.addEventListener('input', function () {
                if (!hasActiveFieldSelection(currentField)) return;
                var f = getActiveField(currentField);
                if (!f) return;
                var v = String(this.value || '').trim();
                if (!v) {
                    delete f.rows;
                } else {
                    var n = parseInt(v, 10);
                    if (!isNaN(n) && n > 0) f.rows = n;
                }
                B.state.isDirty = true;
                B.callModule('canvas', 'render');
            });
        }
        // Required
        var reqEl = B.el('mf-prop-required');
        if (reqEl) {
            reqEl.addEventListener('change', function () {
                if (hasActiveFieldSelection(currentField)) {
                    var f = getActiveField(currentField);
                    if (!f) return;
                    f.required = this.checked;
                    B.state.isDirty = true;
                    B.callModule('canvas', 'render');
                }
            });
        }
        // Readonly
        var roEl = B.el('mf-prop-readonly');
        if (roEl) {
            roEl.addEventListener('change', function () {
                if (hasActiveFieldSelection(currentField)) {
                    var f = getActiveField(currentField);
                    if (!f) return;
                    f.readOnly = this.checked;
                    B.state.isDirty = true;
                }
            });
        }
        // Option columns (Radio / Checkbox)
        var optionColsEl = document.getElementById('mf-prop-option-columns') as HTMLSelectElement | null;
        if (optionColsEl) {
            optionColsEl.addEventListener('change', function () {
                if (!hasActiveFieldSelection(currentField)) return;
                var f = getActiveField(currentField);
                if (!f || (f.type !== 'Radio' && f.type !== 'Checkbox')) return;
                var parsed = parseInt(this.value, 10);
                if (parsed > 0) f.optionColumns = parsed;
                else delete f.optionColumns;
                B.state.isDirty = true;
                B.callModule('canvas', 'render');
            });
        }
        var optionDisplayEl = document.getElementById('mf-prop-option-display') as HTMLSelectElement | null;
        if (optionDisplayEl) {
            optionDisplayEl.addEventListener('change', function () {
                if (!hasActiveFieldSelection(currentField)) return;
                var f = getActiveField(currentField);
                if (!f || (f.type !== 'Radio' && f.type !== 'Checkbox')) return;
                var next = String(this.value || 'default');
                f.properties = f.properties || {};
                if (next === 'default') {
                    delete f.optionDisplay;
                    delete f.properties.optionDisplay;
                } else {
                    f.optionDisplay = next;
                    f.properties.optionDisplay = next;
                }
                B.state.isDirty = true;
                B.callModule('canvas', 'render');
            });
        }
        var optionHtmlEl = document.getElementById('mf-prop-option-richhtml') as HTMLInputElement | null;
        if (optionHtmlEl) {
            optionHtmlEl.addEventListener('change', function () {
                if (!hasActiveFieldSelection(currentField)) return;
                var f = getActiveField(currentField);
                if (!f || (f.type !== 'Radio' && f.type !== 'Checkbox')) return;
                f.properties = f.properties || {};
                if (this.checked) {
                    f.allowOptionHtml = true;
                    f.properties.allowOptionHtml = true;
                } else {
                    delete f.allowOptionHtml;
                    delete f.properties.allowOptionHtml;
                }
                B.state.isDirty = true;
                B.callModule('canvas', 'render');
            });
        }
        // Validation fields
        ['minLength', 'maxLength', 'min', 'max', 'pattern', 'customMessage'].forEach(function (prop) {
            var elId = 'mf-prop-' + prop.toLowerCase().replace('message', '-msg').replace('length', 'length');
            var input = B.el(elId);
            if (!input) return;
            var syncValidation = function () {
                if (hasActiveFieldSelection(currentField)) {
                    var f = getActiveField(currentField);
                    if (!f) return;
                    if (!f.validation) f.validation = {};
                    var val = (input as any).value;
                    if (prop === 'min' || prop === 'max') val = val ? parseFloat(val) : null;
                    else if (prop === 'minLength' || prop === 'maxLength') val = val ? parseInt(val, 10) : null;
                    else val = val || null;
                    f.validation[prop] = val;
                    B.state.isDirty = true;
                }
            };
            input.addEventListener('input', syncValidation);
            input.addEventListener('change', syncValidation);
        });
        // HTML / Section content
        var htmlEl = B.el('mf-prop-html-content');
        if (htmlEl) {
            htmlEl.addEventListener('input', function () {
                if (hasActiveFieldSelection(currentField)) {
                    var f = getActiveField(currentField);
                    if (!f) return;
                    if (f.type === 'Html') f.htmlContent = this.value;
                    else f.label = this.value;
                    B.state.isDirty = true;
                    B.callModule('canvas', 'render');
                }
            });
        }
        // Conditional logic toggle
        var condEl = B.el('mf-prop-has-condition');
        if (condEl) {
            condEl.addEventListener('change', function () {
                B.toggle('mf-condition-builder', this.checked);
                if (hasActiveFieldSelection(currentField)) {
                    var f = getActiveField(currentField);
                    if (!f) return;
                    f.showIf = this.checked ? { operator: 'And', conditions: [] } : null;
                    B.state.isDirty = true;
                    if (this.checked) renderConditionBuilder(f);
                    B.callModule('canvas', 'render');
                }
            });
        }
        // Add condition rule button
        var addCondBtn = document.getElementById('mf-add-condition');
        if (addCondBtn) {
            addCondBtn.addEventListener('click', function() {
                if (!hasActiveFieldSelection(currentField)) return;
                var f = getActiveField(currentField);
                if (!f) return;
                if (!f.showIf) f.showIf = { operator: 'And', conditions: [] };
                f.showIf.conditions.push({ fieldKey: '', operator: 'Equals', value: '' });
                B.state.isDirty = true;
                renderConditionBuilder(f);
            });
        }
        // Condition operator (AND/OR)
        var condOpEl = document.getElementById('mf-condition-operator');
        if (condOpEl) {
            condOpEl.addEventListener('change', function() {
                if (!hasActiveFieldSelection(currentField)) return;
                var f = getActiveField(currentField);
                if (!f) return;
                if (f.showIf) f.showIf.operator = this.value;
                B.state.isDirty = true;
            });
        }
        // Page break checkbox (for Section fields)
        var pbEl = document.getElementById('mf-prop-pagebreak');
        if (pbEl) {
            pbEl.addEventListener('change', function() {
                if (!hasActiveFieldSelection(currentField)) return;
                var f = getActiveField(currentField);
                if (!f) return;
                if (!f.properties) f.properties = {};
                f.properties.pageBreak = this.checked;
                B.state.isDirty = true;
                B.callModule('canvas', 'render');
            });
        }
        // Multi-page toggle in settings
        var mpEl = document.getElementById('mf-setting-multi-page');
        if (mpEl) {
            mpEl.addEventListener('change', function() {
                if (!B.state.schema.settings) B.state.schema.settings = {};
                B.state.schema.settings.multiPage = this.checked;
                B.state.isDirty = true;
                var hint = document.getElementById('mf-multipage-hint');
                if (hint) hint.style.display = this.checked ? '' : 'none';
            });
        }
        // Display Only toggle in settings
        var doEl = document.getElementById('mf-setting-display-only');
        if (doEl) {
            doEl.addEventListener('change', function() {
                if (!B.state.schema.settings) B.state.schema.settings = {};
                B.state.schema.settings.displayOnly = this.checked;
                B.state.isDirty = true;
            });
        }
        // [HideHeader v20260501-02] Hide Form Header toggle
        var hhEl = document.getElementById('mf-setting-hide-header');
        if (hhEl) {
            hhEl.addEventListener('change', function() {
                if (!B.state.schema.settings) B.state.schema.settings = {};
                B.state.schema.settings.hideHeader = this.checked;
                B.state.isDirty = true;
            });
        }
        // ── Field options source: Static vs SQL (FieldOptionsUi v20260430-01) ──
        function _selectedFieldProps() {
            // [NestedFieldFix v20260601-B12] Top-level `B.state.schema.fields[idx]`
            // returns the Row container when the selected field is INSIDE a Row,
            // so SQL edits got saved to the Row's properties (silently ignored
            // at render time) instead of the actual field's properties.
            // Use getActiveField() which honors B.state._rowFieldRef for nested.
            var f = getActiveField(currentField);
            if (!f) return null;
            if (!f.properties) f.properties = {};
            return f.properties;
        }
        var optsSrc = document.getElementById('mf-prop-options-source') as HTMLSelectElement|null;
        if (optsSrc) {
            optsSrc.addEventListener('change', function() {
                // Toggle UI visibility ALWAYS (even if no field selected) — this is presentation,
                // not data state. Prevents the bug where SQL panel never appears because
                // _selectedFieldProps() returned null.
                var src = this.value === 'sql' ? 'sql' : 'static';
                B.toggle('mf-prop-options-static-wrap', src === 'static');
                B.toggle('mf-prop-options-sql-wrap',    src === 'sql');
                var p = _selectedFieldProps(); if (!p) return;
                p.optionsSource = src;
                // [SqlConnDefault v20260519-04] When user picks SQL, auto-fill the
                // Connection name (= server's default alias) if empty. Before this,
                // builder accepted a blank value → server silently returned [].
                if (src === 'sql' && !String(p.optionsConnectionKey || '').trim()) {
                    var fallback = 'DashboardDatabase';
                    p.optionsConnectionKey = fallback;
                    var connInp = document.getElementById('mf-prop-options-conn') as HTMLInputElement|null;
                    if (connInp && !connInp.value.trim()) connInp.value = fallback;
                }
                B.state.isDirty = true;
            });
        }
        var optsHelp = document.getElementById('mf-prop-options-help');
        if (optsHelp) {
            optsHelp.addEventListener('click', function(e) {
                e.preventDefault();
                showSqlOptionsHelpModal();
            });
        }
        var optsConn = document.getElementById('mf-prop-options-conn') as HTMLInputElement|null;
        if (optsConn) optsConn.addEventListener('input', function() {
            var p = _selectedFieldProps(); if (!p) return;
            p.optionsConnectionKey = this.value; B.state.isDirty = true;
        });
        var optsDb = document.getElementById('mf-prop-options-dbtype') as HTMLSelectElement|null;
        if (optsDb) optsDb.addEventListener('change', function() {
            var p = _selectedFieldProps(); if (!p) return;
            p.optionsDatabaseType = this.value; B.state.isDirty = true;
        });
        var optsSql = document.getElementById('mf-prop-options-sql') as HTMLTextAreaElement|null;
        if (optsSql) optsSql.addEventListener('input', function() {
            var p = _selectedFieldProps(); if (!p) return;
            p.optionsSql = this.value; B.state.isDirty = true;
        });
        // FieldOptionsUi v20260516-02: Query type (sql vs storedproc)
        var optsType = document.getElementById('mf-prop-options-type') as HTMLSelectElement|null;
        if (optsType) optsType.addEventListener('change', function() {
            var t = (this.value === 'storedproc' || this.value === 'sproc') ? 'storedproc' : 'sql';
            var sqlLbl = document.getElementById('mf-prop-options-sql-label');
            if (sqlLbl) sqlLbl.textContent = t === 'storedproc' ? 'Stored procedure name' : 'SQL query';
            var p = _selectedFieldProps(); if (!p) return;
            p.optionsType = t; B.state.isDirty = true;
        });
        // FieldOptionsUi v20260516-02: Depends-on parent field keys (cascading)
        var optsDep = document.getElementById('mf-prop-options-depends') as HTMLInputElement|null;
        if (optsDep) optsDep.addEventListener('input', function() {
            var p = _selectedFieldProps(); if (!p) return;
            var arr = String(this.value || '')
                .split(',')
                .map(function(s) { return s.trim(); })
                .filter(function(s) { return s.length > 0; });
            if (arr.length) {
                p.optionsDependsOn = arr;
                p.optionsReloadOnChange = true;
            } else {
                delete p.optionsDependsOn;
                delete p.optionsReloadOnChange;
            }
            B.state.isDirty = true;
        });
        // ── Settings → Database INSERT panel (FormDatabaseInsertUi v20260430-01) ──
        function _ensureDbInsert() {
            if (!B.state.schema.settings) B.state.schema.settings = {};
            if (!B.state.schema.settings.databaseInsert) B.state.schema.settings.databaseInsert = { enabled: false, connectionKey: '', databaseType: '', insertSql: '', parameterMapping: {} };
            return B.state.schema.settings.databaseInsert;
        }
        var dbiEnabled = document.getElementById('mf-setting-db-insert-enabled') as HTMLInputElement|null;
        if (dbiEnabled) dbiEnabled.addEventListener('change', function() {
            var c = _ensureDbInsert(); c.enabled = this.checked; B.state.isDirty = true;
            B.toggle('mf-setting-db-insert-body', this.checked);
        });
        var dbiConn = document.getElementById('mf-setting-db-insert-conn') as HTMLInputElement|null;
        if (dbiConn) dbiConn.addEventListener('input', function() {
            _ensureDbInsert().connectionKey = this.value; B.state.isDirty = true;
        });
        var dbiDb = document.getElementById('mf-setting-db-insert-dbtype') as HTMLSelectElement|null;
        if (dbiDb) dbiDb.addEventListener('change', function() {
            _ensureDbInsert().databaseType = this.value; B.state.isDirty = true;
        });
        var dbiSql = document.getElementById('mf-setting-db-insert-sql') as HTMLTextAreaElement|null;
        if (dbiSql) dbiSql.addEventListener('input', function() {
            _ensureDbInsert().insertSql = this.value; B.state.isDirty = true;
        });

        // ── Field chips (click to insert :token into INSERT SQL) ─────────
        function _flatFieldKeys(): string[] {
            var keys: string[] = [];
            function walk(items: any[]) {
                if (!Array.isArray(items)) return;
                for (var i = 0; i < items.length; i++) {
                    var f = items[i];
                    if (!f) continue;
                    if (f.type === 'Row' && Array.isArray(f.columns)) {
                        for (var j = 0; j < f.columns.length; j++) walk(f.columns[j].fields || []);
                        continue;
                    }
                    if (f.key && ['Section', 'Hidden', 'Html'].indexOf(f.type) === -1) keys.push(f.key);
                }
            }
            try { walk((B.state && B.state.schema && B.state.schema.fields) || []); } catch(_e) {}
            return keys;
        }
        function _renderFieldChips() {
            try {
                var host = document.getElementById('mf-setting-db-insert-fields');
                if (!host) return;
                var keys = _flatFieldKeys();
                if (!keys.length) { host.innerHTML = '<span style="color:#94a3b8">No fields yet — add fields first.</span>'; return; }
                host.innerHTML = keys.map(function(k){
                    return '<button type="button" class="mf-dbi-chip" data-key="' + k + '" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;border-radius:999px;padding:2px 10px;font-family:Consolas,Menlo,monospace;font-size:11px;cursor:pointer">:'+k+'</button>';
                }).join('');
                host.querySelectorAll('.mf-dbi-chip').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        var ta = document.getElementById('mf-setting-db-insert-sql') as HTMLTextAreaElement | null;
                        if (!ta) return;
                        var token = ':' + (this as HTMLElement).getAttribute('data-key');
                        var start = ta.selectionStart || ta.value.length;
                        var end   = ta.selectionEnd   || ta.value.length;
                        ta.value = ta.value.substring(0, start) + token + ta.value.substring(end);
                        ta.focus();
                        ta.selectionStart = ta.selectionEnd = start + token.length;
                        _ensureDbInsert().insertSql = ta.value; B.state.isDirty = true;
                    });
                });
            } catch(_e) { /* swallow render errors so the change handler never silently breaks */ }
        }
        // NO MutationObserver — caused infinite loop (change → _renderFieldChips → innerHTML change → observer fires again).
        // Render chips on demand: when user toggles enable checkbox, and on initial load (hydrateSettingsPanel will call window.MFRenderDbInsertChips).
        if (dbiEnabled) dbiEnabled.addEventListener('change', function() { if (this.checked) _renderFieldChips(); });
        // Expose chip renderer so core.ts hydrateSettingsPanel can call it after form load
        (window as any).MFRenderDbInsertChips = _renderFieldChips;

        // ── Sample SQL generator ────────────────────────────────
        var dbiSample = document.getElementById('mf-setting-db-insert-sample');
        if (dbiSample) dbiSample.addEventListener('click', function() {
            var keys = _flatFieldKeys();
            if (!keys.length) { alert('Add at least one field first.'); return; }
            var cols = keys.map(function(k){ return _toPascal(k); }).join(', ');
            var params = keys.map(function(k){ return ':' + k; }).join(', ');
            var sample = 'INSERT INTO YourTable (' + cols + ')\nVALUES (' + params + ')';
            var ta = document.getElementById('mf-setting-db-insert-sql') as HTMLTextAreaElement | null;
            if (ta) { ta.value = sample; _ensureDbInsert().insertSql = sample; B.state.isDirty = true; }
        });
        function _toPascal(k: string): string {
            return String(k || '').split(/[_\s-]+/).map(function(w){ return w ? w.charAt(0).toUpperCase()+w.slice(1) : ''; }).join('');
        }

        // ── Test INSERT (transaction rollback) ──────────────────
        // Server returns PascalCase JSON (ASP.NET default for Newtonsoft); read both casings.
        function _pick(obj: any, ...keys: string[]): any {
            for (var i = 0; i < keys.length; i++) {
                var v = obj && obj[keys[i]];
                if (v !== undefined && v !== null && v !== '') return v;
            }
            return undefined;
        }
        function _resolveFormId(): number {
            try {
                var cfgId = B.state && B.state.config && B.state.config.formId;
                if (cfgId && parseInt(String(cfgId), 10) > 0) return parseInt(String(cfgId), 10);
                var rootEl = document.getElementById('mf-builder-root');
                var attr = rootEl && rootEl.getAttribute('data-form-id');
                if (attr && parseInt(attr, 10) > 0) return parseInt(attr, 10);
            } catch (_e) {}
            return 0;
        }
        var dbiTest = document.getElementById('mf-setting-db-insert-test');
        if (dbiTest) dbiTest.addEventListener('click', async function() {
            var resultEl = document.getElementById('mf-setting-db-insert-result') as HTMLElement | null;
            if (!resultEl) return;
            resultEl.style.display = ''; resultEl.style.color = '#94a3b8'; resultEl.textContent = 'Running test…';
            var c = _ensureDbInsert();
            var keys = _flatFieldKeys();
            var sampleData: Record<string, any> = {};
            keys.forEach(function(k){ sampleData[k] = '__test_' + k; });
            try {
                var platform = String(((window as any).__MF_PLATFORM__ || {}).platform || '').toLowerCase();
                var url = platform === 'dnn' ? '/DesktopModules/MegaForm/API/Submit/TestInsert' : '/api/MegaForm/Field/TestInsert';
                var body = { connectionKey: c.connectionKey || '', databaseType: c.databaseType || '', insertSql: c.insertSql || '', parameterMapping: c.parameterMapping || {}, sampleData: sampleData };
                var headers: Record<string,string> = { 'Content-Type': 'application/json' };
                var token = ((window as any).__MF_PLATFORM__ || {}).authToken;
                if (token && platform === 'oqtane') headers['Authorization'] = 'Bearer ' + token;
                var r = await fetch(url, { method: 'POST', headers: headers, credentials: 'same-origin', body: JSON.stringify(body) });
                var raw = await r.text();
                var data: any = null; try { data = raw ? JSON.parse(raw) : null; } catch (_e) {}
                if (!data) { resultEl.style.color = '#fca5a5'; resultEl.textContent = 'HTTP ' + r.status + (raw ? ' — ' + raw.slice(0, 200) : ' — empty body'); return; }
                var success = !!_pick(data, 'success', 'Success');
                var msg     = _pick(data, 'message', 'Message');
                var err     = _pick(data, 'error', 'Error');
                var pcount  = _pick(data, 'parameterCount', 'ParameterCount');
                var pnames  = _pick(data, 'parameterNames', 'ParameterNames') || [];
                var unbound = _pick(data, 'unboundParameters', 'UnboundParameters') || [];
                var rows    = _pick(data, 'rowsAffected', 'RowsAffected');
                var lines: string[] = [];
                lines.push((success ? '✅ ' : '❌ ') + (msg || err || ('HTTP ' + r.status)));
                if (typeof pcount !== 'undefined') lines.push('Params detected: ' + pcount + ' [' + pnames.join(', ') + ']');
                if (Array.isArray(unbound) && unbound.length) lines.push('⚠ Unbound (no matching field): ' + unbound.join(', '));
                if (typeof rows !== 'undefined') lines.push('Rows affected (then rolled back): ' + rows);
                resultEl.style.color = success ? '#86efac' : '#fca5a5';
                resultEl.textContent = lines.join('\n');
            } catch (e: any) {
                resultEl.style.color = '#fca5a5';
                resultEl.textContent = 'Error: ' + (e && e.message ? e.message : String(e));
            }
        });

        // ── Test SQL Options (preview) ─────────────────────────
        var optsTest = document.getElementById('mf-prop-options-test');
        if (optsTest) optsTest.addEventListener('click', async function() {
            var resultEl = document.getElementById('mf-prop-options-result') as HTMLElement | null;
            if (!resultEl) return;
            resultEl.style.display = ''; resultEl.style.color = '#94a3b8'; resultEl.textContent = 'Fetching…';
            // [NestedFieldFix v20260601-B12] Use getActiveField so nested fields
            // (inside Row containers) are reachable, not just top-level fields.
            var f = getActiveField(currentField);
            var fieldKey = f && f.key ? f.key : '';
            var formId = _resolveFormId();
            if (!fieldKey) { resultEl.style.color = '#fca5a5'; resultEl.textContent = 'Select a field first (its "key" is required).'; return; }
            if (!formId)   { resultEl.style.color = '#fca5a5'; resultEl.textContent = 'Save form first (formId not set yet).'; return; }
            try {
                var platform = String(((window as any).__MF_PLATFORM__ || {}).platform || '').toLowerCase();
                var url = platform === 'dnn'
                    ? '/DesktopModules/MegaForm/API/Submit/FieldOptions?formId=' + formId + '&fieldKey=' + encodeURIComponent(fieldKey)
                    : '/api/MegaForm/Field/Options?formId=' + formId + '&fieldKey=' + encodeURIComponent(fieldKey);
                var headers: Record<string,string> = {};
                var token = ((window as any).__MF_PLATFORM__ || {}).authToken;
                if (token && platform === 'oqtane') headers['Authorization'] = 'Bearer ' + token;
                var r = await fetch(url, { credentials: 'same-origin', headers: headers });
                var raw = await r.text();
                if (!r.ok) { resultEl.style.color = '#fca5a5'; resultEl.textContent = 'HTTP ' + r.status + (raw ? ' — ' + raw.slice(0,200) : ''); return; }
                var arr: any = null; try { arr = raw ? JSON.parse(raw) : null; } catch (_e) {}
                if (!Array.isArray(arr)) { resultEl.style.color = '#fca5a5'; resultEl.textContent = 'Server returned non-array: ' + (raw ? raw.slice(0,200) : 'empty'); return; }
                if (!arr.length) { resultEl.style.color = '#fcd34d'; resultEl.textContent = '0 rows. Make sure: (1) form is SAVED, (2) field has optionsSource=sql + valid SQL, (3) connection key resolves on server.'; return; }
                var head = '✅ ' + arr.length + ' option(s) loaded. First 10:';
                var rows = arr.slice(0, 10).map(function(o: any){ return '  ' + (o.value ?? o.Value) + '  →  ' + (o.label ?? o.Label); });
                resultEl.style.color = '#86efac';
                resultEl.textContent = [head].concat(rows).join('\n');
            } catch (e: any) {
                resultEl.style.color = '#fca5a5';
                resultEl.textContent = 'Error: ' + (e && e.message ? e.message : String(e));
            }
        });

        // ── Plugin-specific bindings ─────────────────────────────
        // Delegate sang plugin.onBind() — không hardcode per-type ở đây
        // Mỗi lần showProps() gọi, bindPropertyInputs vẫn chạy 1 lần.
        // Plugin tự bind vào DOM trong onBind/onSelect của nó.
        // (UniqueId bind đã chuyển sang field-plugins/_index.ts)
    }
    // =========================================================
    //  LOGIC SUMMARY — hiển thị rule nào đang ảnh hưởng field
    // =========================================================
    function renderLogicSummary(field) {
        var el = document.getElementById('mf-prop-logic-summary');
        if (!el) return;
        var rules = (B.state.schema && B.state.schema.settings && B.state.schema.settings.rules) || [];
        if (!rules.length) { el.style.display = 'none'; return; }
        // Tìm rules mà field là SOURCE (WHEN condition)
        var sourceRules: any[] = [];
        // Tìm rules mà field là TARGET (THEN/ELSE action)
        var targetRules: any[] = [];
        function checkNode(node, rule) {
            if (!node) return;
            if (node.type === 'rule' && node.field === field.key) sourceRules.push(rule);
            if (node.children) node.children.forEach(c => checkNode(c, rule));
        }
        rules.forEach(function(rule) {
            checkNode(rule.when, rule);
            var allActions = (rule.then || []).concat(rule.else || []);
            allActions.forEach(function(a) {
                if (a.target === field.key) targetRules.push(rule);
            });
        });
        // Deduplicate
        sourceRules = sourceRules.filter((r, i, a) => a.indexOf(r) === i);
        targetRules = targetRules.filter((r, i, a) => a.indexOf(r) === i);
        if (!sourceRules.length && !targetRules.length && !field.showIf) {
            el.style.display = 'none';
            return;
        }
        el.style.display = '';
        var html = '';
        if (sourceRules.length) {
            html += '<div class="mf-logic-summary-row mf-logic-summary-source">' +
                    '<span class="mf-lsr-icon"><i class="fas fa-bolt"></i></span>' +
                    '<div class="mf-lsr-body">' +
                    '<div class="mf-lsr-title">Controls ' + sourceRules.length + ' rule' + (sourceRules.length>1?'s':'') + '</div>' +
                    '<div class="mf-lsr-items">' +
                    sourceRules.map(r => `<span class="mf-lsr-pill mf-lsr-pill-source" data-rule-id="${r.id}">${B.escHtml(r.name)}</span>`).join('') +
                    '</div></div></div>';
        }
        if (targetRules.length) {
            html += '<div class="mf-logic-summary-row mf-logic-summary-target">' +
                    '<span class="mf-lsr-icon"><i class="fas fa-eye"></i></span>' +
                    '<div class="mf-lsr-body">' +
                    '<div class="mf-lsr-title">Controlled by ' + targetRules.length + ' rule' + (targetRules.length>1?'s':'') + '</div>' +
                    '<div class="mf-lsr-items">' +
                    targetRules.map(r => `<span class="mf-lsr-pill mf-lsr-pill-target" data-rule-id="${r.id}">${B.escHtml(r.name)}</span>`).join('') +
                    '</div></div></div>';
        }
        if (field.showIf) {
            var condCount = (field.showIf.conditions || []).length;
            html += '<div class="mf-logic-summary-row mf-logic-summary-showif">' +
                    '<span class="mf-lsr-icon"><i class="fas fa-code-branch"></i></span>' +
                    '<div class="mf-lsr-body">' +
                    '<div class="mf-lsr-title">Show-if condition (' + condCount + ' condition' + (condCount>1?'s':'') + ')</div>' +
                    '</div></div>';
        }
        el.innerHTML = html;
        // Click pill → jump to Rules tab
        el.querySelectorAll('[data-rule-id]').forEach(function(pill) {
            (pill as HTMLElement).style.cursor = 'pointer';
            pill.addEventListener('click', function() {
                var ruleId = (pill as HTMLElement).getAttribute('data-rule-id');
                // Activate Rules tab
                document.querySelectorAll('.mf-right-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.mf-right-tab-content').forEach(t => ((t as HTMLElement).style.display = 'none'));
                var rl = document.getElementById('mf-tab-link-rules');
                var rt = document.getElementById('mf-tab-rules');
                if (rl) rl.classList.add('active');
                if (rt) rt.style.display = '';
                // Re-render rules, then select the relevant rule
                if (B.callModule) {
                    B.callModule('rule-builder-ui', 'refresh');
                    // Find and select rule by id
                    setTimeout(function() {
                        var idx = rules.findIndex(r => r.id === ruleId);
                        if (idx >= 0 && (window as any).MegaFormRuleBuilderUI) {
                            (window as any).MegaFormRuleBuilderUI.selectRule(idx);
                        }
                    }, 100);
                }
            });
        });
    }
    // =========================================================
    //  CONDITION BUILDER — renders rule rows
    // =========================================================
    function renderConditionBuilder(field) {
        var list = document.getElementById('mf-conditions-list');
        if (!list || !field.showIf) return;
        list.innerHTML = '';
        var opEl = document.getElementById('mf-condition-operator');
        if (opEl) opEl.value = field.showIf.operator || 'And';
        // Get all OTHER fields for dropdown
        var otherFields = B.state.schema.fields.filter(function(f) {
            return f.key !== field.key && f.type !== 'Html' && f.type !== 'Section' && f.type !== 'Hidden';
        });
        (field.showIf.conditions || []).forEach(function(cond, ci) {
            var row = document.createElement('div');
            row.className = 'mf-cond-row';
            // Field selector
            var fieldSel = '<select class="form-control form-control-sm mf-cond-field" data-ci="'+ci+'">';
            fieldSel += '<option value="">Select field...</option>';
            otherFields.forEach(function(f) {
                fieldSel += '<option value="'+f.key+'"'+(cond.fieldKey===f.key?' selected':'')+'>'+B.escHtml(f.label||f.key)+'</option>';
            });
            fieldSel += '</select>';
            // Operator selector
            var opSel = '<select class="form-control form-control-sm mf-cond-op" data-ci="'+ci+'">';
            ['Equals','NotEquals','Contains','NotContains','StartsWith','EndsWith','GreaterThan','LessThan','GreaterOrEqual','LessOrEqual','IsEmpty','IsNotEmpty','In','NotIn'].forEach(function(op) {
                opSel += '<option value="'+op+'"'+(cond.operator===op?' selected':'')+'>'+op.replace(/([A-Z])/g,' $1').trim()+'</option>';
            });
            opSel += '</select>';
            // Value input — if selected field has options, show dropdown; else text
            var valHtml = '';
            var selField = otherFields.find(function(f) { return f.key === cond.fieldKey; });
            if (selField && selField.options && selField.options.length > 0) {
                valHtml = '<select class="form-control form-control-sm mf-cond-val" data-ci="'+ci+'">';
                valHtml += '<option value="">Any value</option>';
                selField.options.forEach(function(o) {
                    valHtml += '<option value="'+B.escAttr(o.value)+'"'+(cond.value===o.value?' selected':'')+'>'+B.escHtml(o.label)+'</option>';
                });
                valHtml += '</select>';
            } else {
                valHtml = '<input type="text" class="form-control form-control-sm mf-cond-val" data-ci="'+ci+'" value="'+B.escAttr(cond.value||'')+'" placeholder="Value">';
            }
            // Delete button
            var delBtn = '<button type="button" class="btn btn-sm btn-link text-danger mf-cond-del" data-ci="'+ci+'" title="Remove"><i class="fas fa-times"></i></button>';
            row.innerHTML = '<div class="mf-cond-grid">' + fieldSel + opSel + valHtml + delBtn + '</div>';
            list.appendChild(row);
        });
        // Bind condition row events
        list.querySelectorAll('.mf-cond-field').forEach(function(el) {
            el.addEventListener('change', function() {
                var ci = parseInt(this.dataset.ci);
                field.showIf.conditions[ci].fieldKey = this.value;
                field.showIf.conditions[ci].value = ''; // reset
                B.state.isDirty = true;
                renderConditionBuilder(field); // re-render to update value dropdown
            });
        });
        list.querySelectorAll('.mf-cond-op').forEach(function(el) {
            el.addEventListener('change', function() {
                field.showIf.conditions[parseInt(this.dataset.ci)].operator = this.value;
                B.state.isDirty = true;
            });
        });
        list.querySelectorAll('.mf-cond-val').forEach(function(el) {
            el.addEventListener('change', function() {
                field.showIf.conditions[parseInt(this.dataset.ci)].value = this.value;
                B.state.isDirty = true;
            });
        });
        list.querySelectorAll('.mf-cond-del').forEach(function(el) {
            el.addEventListener('click', function() {
                field.showIf.conditions.splice(parseInt(this.dataset.ci), 1);
                B.state.isDirty = true;
                renderConditionBuilder(field);
            });
        });
    }
    // =========================================================
    //  OPTIONS EDITOR (Select, Radio, Checkbox)
    // =========================================================
    function renderOptionsEditor(options) {
        var container = B.el(B.EL.propOptionsList);
        if (!container) return;
        container.innerHTML = '';
        options.forEach(function (opt, i) {
            var row = document.createElement('div');
            row.className = 'mf-option-row';
            row.innerHTML =
                '<div class="mf-option-main">' +
                    '<span class="mf-option-drag"><i class="fas fa-grip-vertical"></i></span>' +
                    '<input type="text" class="mf-opt-label" value="' + B.escAttr(opt.label) + '" placeholder="Label" data-index="' + i + '" />' +
                    '<input type="text" class="mf-opt-value" value="' + B.escAttr(opt.value) + '" placeholder="Value" data-index="' + i + '" />' +
                    '<button type="button" class="mf-option-remove" data-index="' + i + '" title="Remove"><i class="fas fa-times"></i></button>' +
                '</div>' +
                '<div class="mf-option-extra">' +
                    '<input type="text" class="mf-opt-icon" value="' + B.escAttr(opt.icon || '') + '" placeholder="Icon / HTML icon" data-index="' + i + '" />' +
                    '<input type="text" class="mf-opt-meta" value="' + B.escAttr(opt.meta || '') + '" placeholder="Meta (location, short note)" data-index="' + i + '" />' +
                    '<input type="text" class="mf-opt-description" value="' + B.escAttr(opt.description || opt.desc || opt.subLabel || '') + '" placeholder="Description" data-index="' + i + '" />' +
                    '<input type="text" class="mf-opt-badge" value="' + B.escAttr(opt.badge || '') + '" placeholder="Badge" data-index="' + i + '" />' +
                    '<textarea class="mf-opt-richhtml" rows="2" placeholder="Rich HTML label override (optional)" data-index="' + i + '">' + B.escHtml(opt.richHtml || opt.labelHtml || opt.html || '') + '</textarea>' +
                '</div>';
            container.appendChild(row);
        });
        function bindOptionExtra(selector, prop, renderCanvas) {
            container.querySelectorAll(selector).forEach(function (input) {
                input.addEventListener('change', function () {
                    var idx = parseInt(this.getAttribute('data-index'));
                    var f = getActiveField(currentField);
                    if (f && f.options && f.options[idx]) {
                        var val = this.value;
                        if (val === '') delete f.options[idx][prop];
                        else f.options[idx][prop] = val;
                        B.state.isDirty = true;
                        if (renderCanvas) B.callModule('canvas', 'render');
                    }
                });
            });
        }
        // Bind label/value changes
        container.querySelectorAll('.mf-opt-label').forEach(function (input) {
            input.addEventListener('change', function () {
                var idx = parseInt(this.getAttribute('data-index'));
                var f = getActiveField(currentField);
                if (f && f.options && f.options[idx]) {
                    f.options[idx].label = this.value;
                    var valInput = container.querySelector('.mf-opt-value[data-index="' + idx + '"]');
                    if (valInput && !valInput.value) {
                        valInput.value = this.value.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                        f.options[idx].value = valInput.value;
                    }
                    B.state.isDirty = true;
                    B.callModule('canvas', 'render');
                }
            });
        });
        container.querySelectorAll('.mf-opt-value').forEach(function (input) {
            input.addEventListener('change', function () {
                var idx = parseInt(this.getAttribute('data-index'));
                var f = getActiveField(currentField);
                if (f && f.options && f.options[idx]) {
                    f.options[idx].value = this.value;
                    B.state.isDirty = true;
                }
            });
        });
        bindOptionExtra('.mf-opt-icon', 'icon', true);
        bindOptionExtra('.mf-opt-meta', 'meta', true);
        bindOptionExtra('.mf-opt-description', 'description', true);
        bindOptionExtra('.mf-opt-badge', 'badge', true);
        bindOptionExtra('.mf-opt-richhtml', 'richHtml', true);
        container.querySelectorAll('.mf-option-remove').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var idx = parseInt(this.getAttribute('data-index'));
                var f = getActiveField(currentField);
                if (f && f.options) {
                    f.options.splice(idx, 1);
                    B.state.isDirty = true;
                    renderOptionsEditor(f.options);
                    B.callModule('canvas', 'render');
                }
            });
        });
    }
    function bindOptionButtons() {
        var addBtn = B.el(B.EL.addOptionBtn);
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                var f = getActiveField(currentField);
                if (!f) return;
                if (!f.options) f.options = [];
                var n = f.options.length + 1;
                f.options.push({ label: 'Option ' + n, value: 'option_' + n });
                B.state.isDirty = true;
                renderOptionsEditor(f.options);
                B.callModule('canvas', 'render');
            });
        }
        bindOptionPresetApply();
    }

    // [RichCardPresets 2026-06-19] Ready-made rich-card / chip starter templates for
    // Select/Radio/Checkbox. "Apply" replaces the options with the template AND sets the
    // Choice Display + Allow-HTML + Columns so the admin gets a styled set in one click.
    var OPTION_PRESETS: Record<string, any> = {
        pricing: { display: 'cards', allowHtml: false, columns: '3', options: [
            { label: 'Basic', value: 'basic', meta: 'For individuals', badge: '$9/mo', description: '1 project · community support' },
            { label: 'Pro', value: 'pro', icon: '⭐', meta: 'Most popular', badge: '$29/mo', description: '10 projects · priority support' },
            { label: 'Enterprise', value: 'enterprise', meta: 'For teams', badge: '$99/mo', description: 'Unlimited · SSO · SLA' },
        ] },
        plans: { display: 'cards', allowHtml: false, columns: '', options: [
            { label: 'Starter', value: 'starter', icon: '🚀', badge: 'Free', description: 'Get going with the essentials' },
            { label: 'Growth', value: 'growth', icon: '📈', badge: 'Popular', description: 'Everything you need to scale' },
            { label: 'Scale', value: 'scale', icon: '🏆', badge: 'Best value', description: 'Advanced controls & support' },
        ] },
        features: { display: 'cards', allowHtml: false, columns: '2', options: [
            { label: 'Fast', value: 'fast', icon: '⚡', description: 'Lightning-quick performance' },
            { label: 'Secure', value: 'secure', icon: '🔒', description: 'Encrypted end to end' },
            { label: 'Reliable', value: 'reliable', icon: '🛡️', description: '99.9% uptime SLA' },
            { label: 'Friendly', value: 'friendly', icon: '😊', description: 'Human support, 24/7' },
        ] },
        yesno: { display: 'cards', allowHtml: false, columns: '2', options: [
            { label: 'Yes', value: 'yes', icon: '✅', description: 'Sounds good to me' },
            { label: 'No', value: 'no', icon: '❌', description: 'Not right now' },
        ] },
        rating: { display: 'cards', allowHtml: false, columns: '', options: [
            { label: 'Love it', value: '5', icon: '😍' }, { label: 'Good', value: '4', icon: '🙂' },
            { label: 'Okay', value: '3', icon: '😐' }, { label: 'Meh', value: '2', icon: '🙁' }, { label: 'Bad', value: '1', icon: '😠' },
        ] },
        interests: { display: 'chips', allowHtml: false, columns: '', options: [
            { label: 'Music', value: 'music', icon: '🎵' }, { label: 'Sports', value: 'sports', icon: '⚽' },
            { label: 'Travel', value: 'travel', icon: '✈️' }, { label: 'Food', value: 'food', icon: '🍜' },
            { label: 'Tech', value: 'tech', icon: '💻' }, { label: 'Art', value: 'art', icon: '🎨' },
        ] },
        sizes: { display: 'chips', allowHtml: false, columns: '', options: [
            { label: 'S', value: 's' }, { label: 'M', value: 'm' }, { label: 'L', value: 'l' }, { label: 'XL', value: 'xl' }, { label: 'XXL', value: 'xxl' },
        ] },
        richhtml: { display: 'cards', allowHtml: true, columns: '', options: [
            { label: 'Standard shipping', value: 'standard', badge: 'Free', richHtml: '<strong>Standard</strong> <span class="muted">3–5 business days</span><br><small>Free over $50</small>' },
            { label: 'Express shipping', value: 'express', badge: '$12', richHtml: '<strong>Express</strong> <span class="muted">1–2 business days</span><br><small>Tracked &amp; insured</small>' },
        ] },
    };

    function bindOptionPresetApply() {
        var btn = document.getElementById('mf-apply-option-preset');
        var sel = document.getElementById('mf-prop-option-preset') as HTMLSelectElement | null;
        if (!btn || !sel || (btn as any)._mfPresetBound) return;
        (btn as any)._mfPresetBound = true;
        btn.addEventListener('click', function () {
            var f = getActiveField(currentField);
            if (!f) return;
            var preset = OPTION_PRESETS[sel!.value];
            if (!preset) { if (B.showToast) B.showToast('Pick a sample template first', 'info'); return; }
            f.options = preset.options.map(function (o: any) { return JSON.parse(JSON.stringify(o)); });
            if (!f.properties) f.properties = {};
            if (preset.display && preset.display !== 'default') { f.optionDisplay = preset.display; f.properties.optionDisplay = preset.display; }
            else { delete f.optionDisplay; delete f.properties.optionDisplay; }
            if (preset.allowHtml) { f.allowOptionHtml = true; f.properties.allowOptionHtml = true; }
            else { delete f.allowOptionHtml; delete f.properties.allowOptionHtml; }
            if (preset.columns) { f.optionColumns = preset.columns; } else { delete f.optionColumns; }
            B.state.isDirty = true;
            if (B.setVal) { B.setVal('mf-prop-option-display', preset.display || 'default'); B.setVal('mf-prop-option-columns', preset.columns || ''); }
            if (B.setChecked) B.setChecked('mf-prop-option-richhtml', !!preset.allowHtml);
            renderOptionsEditor(f.options);
            B.callModule('canvas', 'render');
            if (B.showToast) B.showToast('Applied "' + sel!.options[sel!.selectedIndex].text + '"', 'success');
        });
    }

    function bindDeleteButton() {
        var btn = B.el(B.EL.deleteFieldBtn);
        if (btn) {
            btn.addEventListener('click', function () {
                var rowRef = B.state._rowFieldRef || null;
                if (rowRef && typeof rowRef.rowIndex === 'number' && typeof rowRef.colIndex === 'number' && typeof rowRef.fieldIndex === 'number' && B.state.selectedFieldIndex < 0) {
                    B.callModule('canvas', 'removeFieldFromRow', [rowRef.rowIndex, rowRef.colIndex, rowRef.fieldIndex]);
                    return;
                }
                if (typeof B.state.selectedFieldIndex === 'number' && B.state.selectedFieldIndex >= 0) {
                    B.callModule('canvas', 'deleteField', [B.state.selectedFieldIndex]);
                }
            });
        }
    }
    // Register
    B.registerModule('properties', {
        init: initModule,
        showProps: showProps,
        hideProps: hideProps,
        refreshHtmlEditors: populateHtmlEditors
    });
})();
export {};
