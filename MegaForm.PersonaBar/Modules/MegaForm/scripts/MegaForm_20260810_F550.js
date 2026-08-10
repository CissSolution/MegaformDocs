// [PersonaBar v20260810-F550] The panel HOSTS the dashboard SPA.
//
// Until now every button here handed the admin off to a page that has a MegaForm module on it,
// and with no such page the buttons were disabled: "Add a MegaForm module to a page first."
// The owner's requirement is the opposite - after install, MegaForm has to be usable from the
// Persona Bar with no module anywhere. So the panel loads the same two assets /mfqa-admin loads
// (Assets/js/megaform-dashboard.js + Assets/css/megaform-admin-shell.css) and mounts the
// dashboard into #mf-dashboard-root inside this panel. The old URLs stay as the fallback for
// "open it in its own tab", which is also what happens if the bundle cannot be loaded.
//
// What makes this work, measured on 2026-08-10 (tools/browser-qa/pb-module-context-probe.mjs,
// 23 endpoints x 6 context variants from inside this very iframe):
//   - Sending NO module context is what the panel must do. 21 of 22 real endpoints answer 200.
//   - A tabid of 0 makes DNN 404 every call; a ModuleId/TabId header pair of 0 makes it 400.
//     Zero is not a neutral value, so nothing here invents one.
//   - Antiforgery already works: shared/antiforgery.ts walks window -> parent -> top and the DNN
//     page behind the panel carries the token, even though this frame does not.
//   - The one surface that genuinely needs a module is the workflow designer
//     ([DnnModuleAuthorize] -> 401 without one). It still opens in a tab.
//
// Persona Bar module contract (util.js loadTempl): this file is AMD-loaded as
// Modules/MegaForm/scripts/MegaForm.js next to Modules/MegaForm/MegaForm.html and
// Modules/MegaForm/css/MegaForm.css, and must return { init, load }.
//   init(wrapper, utility, params, callback) - first open
//   load(params, callback)                   - every re-open (module stays resident)
//
// All text renders through t(key, fallback): English lives here as the fallback, the
// translations come from App_LocalResources/MegaForm.resx via utility.resx.MegaForm.
'use strict';

define(['jquery'], function ($) {

    var utility, $panel;
    var state = { pageIndex: 0, pageSize: 20, search: '', status: '', hasMore: false, hasHostPage: false,
                  sortBy: null, sortDir: 'desc' };
    var searchTimer = null;

    // The dashboard SPA, hosted in this panel.
    var ASSETS = '/DesktopModules/MegaForm/Assets/';
    var API_BASE = '/DesktopModules/MegaForm/API/';
    var DASH_V = '?v=20260810-F550';
    var dash = { portalId: 0, loading: false, mounted: false, shown: false,
                 dashboardUrl: '', newFormUrl: '' };

    function t(key, fallback) {
        var table = utility && utility.resx ? utility.resx.MegaForm : null;
        return (table && (table[key] || table[key + '.Text'])) ? (table[key] || table[key + '.Text']) : fallback;
    }

    function service(method, params, success) {
        utility.sf.moduleRoot = 'personaBar';
        utility.sf.controller = 'MegaForm';
        utility.sf.get(method, params || {}, success, function (xhr) {
            showAlert(apiErrorMessage(xhr, t('LoadFailed', 'MegaForm could not load. Check the DNN event log for details.')));
        });
    }

    function apiErrorMessage(xhr, fallback) {
        if (xhr && xhr.status === 401) return t('NotAllowed', 'You are not allowed to use MegaForm here. Sign in as an administrator and try again.');
        if (xhr && xhr.status === 403) return t('NotAllowed', 'You are not allowed to use MegaForm here. Sign in as an administrator and try again.');
        if (xhr && xhr.responseJSON && xhr.responseJSON.Message) return xhr.responseJSON.Message;
        if (xhr && xhr.responseText) {
            try {
                var body = JSON.parse(xhr.responseText);
                if (body && body.Message) return body.Message;
            } catch (ignore) { }
        }
        return fallback;
    }

    function showAlert(message) {
        $panel.find('.mf-pb-alert').text(message).removeClass('mf-pb-hidden');
    }

    function clearAlert() {
        $panel.find('.mf-pb-alert').addClass('mf-pb-hidden').removeClass('is-success').text('');
    }

    // Localises every [data-mf-resx] node once, leaving the authored English in place
    // when a key has no translation.
    function localise() {
        $panel.find('[data-mf-resx]').each(function () {
            var $el = $(this);
            $el.text(t($el.data('mf-resx'), $el.text()));
        });
        var $search = $panel.find('.mf-pb-search');
        $search.attr('placeholder', t('SearchPlaceholder', $search.attr('placeholder')));
    }

    function formatDate(value) {
        if (!value) return '—';
        var d = new Date(value);
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    }

    function loadSummary() {
        service('GetDashboard', {}, function (data) {
            clearAlert();
            $panel.find('[data-mf-stat="forms"]').text(data.forms);
            $panel.find('[data-mf-stat="publishedForms"]').text(data.publishedForms);
            $panel.find('[data-mf-stat="submissions"]').text(data.submissions);
            $panel.find('[data-mf-stat="lastSubmission"]').text(formatDate(data.lastSubmissionUtc));

            state.hasHostPage = !!data.hasHostPage;
            dash.portalId = Number(data.portalId) || 0;
            dash.dashboardUrl = data.dashboardUrl || '';
            dash.newFormUrl = data.newFormUrl || '';
            dash.summary = data;

            // [PbHostsDashboard v20260810-F550] These two used to be bindJump() - navigate the top
            // window to a page carrying a MegaForm module, or be disabled when the portal has
            // none. They now mount the dashboard here instead, so neither depends on a module
            // existing. hasHostPage is still read: it is what decides whether the per-row Edit /
            // Submissions links (real DNN module controls) have anywhere to go.
            $panel.find('.mf-pb-dashboard').off('click.megaform').removeClass('mf-pb-disabled')
                .attr('title', '').on('click.megaform', function (e) {
                    e.preventDefault();
                    showDashboard(false);
                });
            $panel.find('.mf-pb-new').off('click.megaform').removeClass('mf-pb-disabled')
                .attr('title', '').on('click.megaform', function (e) {
                    e.preventDefault();
                    showDashboard(true);
                });
        });
    }

    // ── the dashboard SPA, mounted inside the panel ──────────────────────────
    // Loading order matters: megaform-dashboard.js reads window.__MF_PLATFORM__ as it parses
    // (that is why FormView.ascx emits it inline instead of via ClientResourceManager), so the
    // config is published BEFORE the <script> tag is appended.
    function publishPlatformConfig() {
        var cfg = {
            platform: 'dnn',
            apiBase: API_BASE,
            assetsBaseUrl: ASSETS,
            portalId: dash.portalId,
            siteId: dash.portalId,
            // 0 means "no module", which every call site already tests for with `> 0` before it
            // adds a parameter. It must stay 0 rather than being invented: measured, a real-looking
            // tabid the panel does not own is worse than none at all.
            moduleId: 0,
            instanceId: 0,
            tabId: 0,
            returnUrl: ''
        };
        try { window.__MF_PLATFORM__ = $.extend({}, window.__MF_PLATFORM__ || {}, cfg); }
        catch (e) { window.__MF_PLATFORM__ = cfg; }

        var root = document.getElementById('mf-dashboard-root');
        if (root) {
            root.setAttribute('data-portal-id', String(dash.portalId));
            root.setAttribute('data-api-base', API_BASE);
        }
        return root;
    }

    // [PbDashPayload v20260810-F550] The dashboard's home screen reads its first payload from the
    // root's data-dashboard attribute - on a DNN page FormView.ascx bakes it in server-side
    // (BuildDashboardJson). Mounted here there is no such page, and measured on 2026-08-10 the SPA
    // does NOT fetch it: without this the panel showed a correct shell with an EMPTY home screen
    // (statTiles 0, tableRows 0).
    //
    // Nothing here is invented. Every number comes from the panel's own two API calls, which read
    // the same portal-scoped tables the server-side builder reads. What it cannot supply is
    // recentSubmissions and appDefinitions - the panel API does not return them - so those go out
    // as empty arrays rather than as guesses, and the home screen shows no "recent submissions"
    // card. Lifting BuildDashboardJson out of FormView.ascx.cs into a service both hosts call is
    // the real fix; this is the honest version of it that needs no new server surface.
    function buildDashboardPayload(items) {
        var s = dash.summary || {};
        var forms = Number(s.forms) || 0;
        var published = Number(s.publishedForms) || 0;
        var submissions = Number(s.submissions) || 0;
        var list = items || [];

        function ymdhm(v) {
            if (!v) return '';
            var d = new Date(v);
            if (isNaN(d.getTime())) return '';
            function p(n) { return (n < 10 ? '0' : '') + n; }
            return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
                   ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        }

        return {
            counts: { forms: forms, submissions: submissions },
            stats: [
                { label: t('StatForms', 'Forms'), value: forms,
                  meta: published + ' ' + t('MetaPublished', 'published'), icon: 'fa-regular fa-file-lines' },
                { label: t('StatSubmissions', 'Submissions'), value: submissions,
                  meta: formatDate(s.lastSubmissionUtc), icon: 'fa-regular fa-message' },
                { label: t('StatShowing', 'Showing'), value: list.length,
                  meta: t('MetaFirstPage', 'first page of the list'), icon: 'fa-solid fa-pen-ruler' },
                { label: t('StatPlatform', 'Platform'), value: 'DNN',
                  meta: t('MetaPersonaBar', 'Persona Bar'), icon: 'fa-solid fa-database' }
            ],
            recentForms: list.map(function (i) {
                return {
                    formId: i.formId,
                    title: i.title || ('Form #' + i.formId),
                    status: i.status || 'Draft',
                    fields: Number(i.fields) || 0,
                    submissions: Number(i.submissions) || 0,
                    modified: ymdhm(i.modifiedUtc),
                    appScope: '', appKey: '', appName: '', appIcon: '', appColor: '', appDescription: '',
                    viewUrl: ''
                };
            }),
            appDefinitions: [],
            lockedFormIds: [],
            recentSubmissions: []
        };
    }

    // The list the panel is holding is one page of 20; the home screen wants more than that, so
    // the payload is built from its own read rather than from whatever the table happens to show.
    function withDashboardRows(next) {
        service('GetForms', { searchTerm: '', status: '', pageIndex: 0, pageSize: 50, sortBy: '', sortDir: '' },
            function (data) { next((data && data.items) || []); });
    }

    function loadDashboardAssets(done) {
        if (!document.getElementById('mf-pb-dash-css')) {
            var link = document.createElement('link');
            link.id = 'mf-pb-dash-css';
            link.rel = 'stylesheet';
            link.href = ASSETS + 'css/megaform-admin-shell.css' + DASH_V;
            document.head.appendChild(link);
        }
        if (window.MegaForm && typeof window.MegaForm.initDashboard === 'function') { done(); return; }
        if (document.getElementById('mf-pb-dash-js')) {
            // Already in flight from an earlier click: wait for it rather than adding a second tag.
            var waited = 0;
            var poll = window.setInterval(function () {
                if (window.MegaForm && typeof window.MegaForm.initDashboard === 'function') {
                    window.clearInterval(poll); done();
                } else if ((waited += 200) > 20000) {
                    window.clearInterval(poll); done(new Error('timeout'));
                }
            }, 200);
            return;
        }
        var s = document.createElement('script');
        s.id = 'mf-pb-dash-js';
        s.src = ASSETS + 'js/megaform-dashboard.js' + DASH_V;
        s.onload = function () { done(); };
        s.onerror = function () { done(new Error('failed to load ' + s.src)); };
        document.head.appendChild(s);
    }

    // Hides the form list without destroying it: coming back is instant and keeps the page,
    // search term and sort the admin had.
    function setListVisible(on) {
        $panel.find('.mf-pb-stats, .mf-pb-toolbar, .mf-pb-table-wrap, .mf-pb-pager')
            .toggleClass('mf-pb-hidden', !on);
        $panel.find('.mf-pb-dashhost').toggleClass('mf-pb-hidden', on);
        $panel.find('.mf-pb-back').toggleClass('mf-pb-hidden', on);
        $panel.find('.mf-pb-dashboard').toggleClass('mf-pb-hidden', !on);
        dash.shown = !on;
        widenPanelForDashboard(!on);
        if (on) { applyDensity(); }   // back to the list: re-measure at the restored width
    }

    function showList() {
        setListVisible(true);
        loadSummary();
        loadForms();
    }

    function openWizard(tries) {
        var w = window.MegaFormWizard;
        if (w && typeof w.open === 'function') { w.open(); return; }
        if (tries > 0) { window.setTimeout(function () { openWizard(tries - 1); }, 200); return; }
        showAlert(t('WizardMissing', 'The form wizard did not load. Open the dashboard in its own tab and try again.'));
    }

    function showDashboard(withWizard) {
        clearAlert();
        setListVisible(false);
        if (dash.mounted) { if (withWizard) openWizard(10); return; }
        if (dash.loading) { return; }
        dash.loading = true;

        var root = publishPlatformConfig();
        if (!root) { dash.loading = false; fallbackToTab(withWizard); return; }

        withDashboardRows(function (rows) {
            try { root.setAttribute('data-dashboard', JSON.stringify(buildDashboardPayload(rows))); }
            catch (e) { /* the shell still mounts; the home screen is just bare */ }
            mountDashboard(root, withWizard);
        });
    }

    function mountDashboard(root, withWizard) {
        loadDashboardAssets(function (err) {
            dash.loading = false;
            var init = window.MegaForm && window.MegaForm.initDashboard;
            if (err || typeof init !== 'function') {
                // Never leave the admin looking at an empty panel: hand off to the page-hosted
                // dashboard, which is exactly what this panel did before F550.
                setListVisible(true);
                fallbackToTab(withWizard);
                return;
            }
            try {
                $(root).find('.mf-pb-dashboot').remove();
                init(root);
                dash.mounted = true;
                wireDashboardChrome();
                if (withWizard) openWizard(10);
            } catch (e) {
                setListVisible(true);
                fallbackToTab(withWizard);
            }
        });
    }

    // The SPA's own header has Close / Refresh buttons that assume a page of its own: Close
    // follows returnUrl and Refresh reloads the document, which here is the Persona Bar frame.
    // Both are re-pointed at the panel.
    function wireDashboardChrome() {
        var $host = $panel.find('.mf-pb-dashhost');
        $host.off('click.mfdash').on('click.mfdash', '.mf-hd-close', function (e) {
            e.preventDefault();
            showList();
        });
        $host.on('click.mfdash', '.mf-hd-refresh', function (e) {
            e.preventDefault();
            // initDashboard renames the element to #mf-dash-root, so a re-mount has to look for
            // both. Refresh re-reads the payload too, or it would repaint the same numbers.
            var root = document.getElementById('mf-dash-root') || document.getElementById('mf-dashboard-root');
            var init = window.MegaForm && window.MegaForm.initDashboard;
            if (!root || typeof init !== 'function') { return; }
            loadSummary();
            withDashboardRows(function (rows) {
                try { root.setAttribute('data-dashboard', JSON.stringify(buildDashboardPayload(rows))); } catch (err) { /* keep the old payload */ }
                root.innerHTML = '';
                init(root);
                wireDashboardChrome();
            });
        });
    }

    function fallbackToTab(withWizard) {
        var url = withWizard ? (dash.newFormUrl || dash.dashboardUrl) : dash.dashboardUrl;
        if (url) { window.top.location.href = url; return; }
        showAlert(t('DashboardUnavailable',
            'The dashboard could not be loaded here, and this portal has no page with a MegaForm module to fall back to.'));
    }

    function bindJump($el, url, disabledTitle) {
        $el.off('click.megaform');
        if (url) {
            $el.removeClass('mf-pb-disabled').attr('title', '').on('click.megaform', function (e) {
                e.preventDefault();
                // The Persona Bar runs in an iframe; navigating window.top takes the
                // whole page to the builder instead of loading DNN inside the panel.
                window.top.location.href = url;
            });
        } else {
            $el.addClass('mf-pb-disabled').attr('title', disabledTitle).on('click.megaform', function (e) {
                e.preventDefault();
                showAlert(disabledTitle);
            });
        }
    }

    // ── panel-width density ──────────────────────────────────────────────────
    // The Persona Bar host sets the panel width (about 860 desktop, 700 tablet), so a viewport
    // media query answers the wrong question - which is how a 720px table ended up scrolling
    // 22px inside a 698px wrapper. Measure the wrapper.
    // DNN gives a panel 500px in its view-ipad mode, which a 390px phone cannot hold next to the
    // 80px rail. Shrink our own panel to what is actually available; never widen it, so a desktop
    // panel keeps exactly the width DNN chose.
    // [PbWideForDashboard v20260810-F550] The panel DNN hands us is about 860px. The form list was
    // built for that; the dashboard shell was built for a page, and at 860 its forms table
    // collapses - the name column overlaps its own header (measured, screenshot qa-out/pb-dash).
    // So the dashboard view takes the whole width beside the rail and gives it back on the way
    // out. Nothing is scaled or zoomed: it is the same panel, just not artificially narrow.
    function widenPanelForDashboard(on) {
        var host = $panel.closest('.socialpanel')[0] || $panel.find('.socialpanel')[0];
        if (!host) { return; }
        var header = $panel.find('.socialpanelheader')[0];
        var placeholder = host.parentNode ? host.parentNode.querySelector('.socialpanel-placeholder') : null;
        if (on) {
            var rail = document.getElementById('personabar');
            var room = Math.max(320, (document.documentElement.clientWidth || 0) - (rail ? rail.offsetWidth : 80));
            host.classList.add('mf-pb-wide');
            host.style.width = room + 'px';
            host.style.right = '0px';
            if (header) { header.style.width = 'auto'; header.style.left = '0px'; header.style.right = '0px'; }
            if (placeholder) { placeholder.style.width = room + 'px'; }
        } else {
            host.classList.remove('mf-pb-wide');
            host.style.width = '';
            host.style.right = '';
            if (header) { header.style.width = ''; header.style.left = ''; header.style.right = ''; }
            if (placeholder) { placeholder.style.width = ''; }
        }
    }

    function fitPanelWidth() {
        var host = $panel.closest('.socialpanel')[0] || $panel.find('.socialpanel')[0];
        if (!host) { return; }
        // While the dashboard is showing, the width is ours, not the density heuristic's.
        if (host.classList.contains('mf-pb-wide')) { return; }
        var available = document.documentElement.clientWidth || 0;
        var rail = document.getElementById('personabar');
        var railWidth = rail ? rail.offsetWidth : 80;
        if (!available) { return; }
        var room = Math.max(280, available - railWidth);
        // The header is position:absolute at 500px and the placeholder DNN puts next to the panel
        // is 501px, so shrinking the panel alone still left the document 580px wide on a phone.
        var header = $panel.find('.socialpanelheader')[0];
        var placeholder = host.parentNode ? host.parentNode.querySelector('.socialpanel-placeholder') : null;

        if (host.offsetWidth > room) {
            host.style.width = room + 'px';
            host.style.right = '0px';
            host.classList.add('mf-pb-fitted');
            if (header) { header.style.width = 'auto'; header.style.left = '0px'; header.style.right = '0px'; }
            if (placeholder) { placeholder.style.width = room + 'px'; }
        } else if (host.classList.contains('mf-pb-fitted') && room >= 500) {
            host.style.width = '';
            host.style.right = '';
            host.classList.remove('mf-pb-fitted');
            if (header) { header.style.width = ''; header.style.left = ''; header.style.right = ''; }
            if (placeholder) { placeholder.style.width = ''; }
        }
    }

    function applyDensity() {
        fitPanelWidth();
        var wrap = $panel.find('.mf-pb-table-wrap')[0];
        var body = $panel.find('#megaform-bodyPanel')[0] || $panel.find('.mf-pb-body')[0];
        if (!wrap || !body) { return; }
        var w = wrap.clientWidth || 0;
        var name = w >= 780 ? 'mf-pb-w-lg' : (w >= 620 ? 'mf-pb-w-md' : 'mf-pb-w-sm');
        if (body.getAttribute('data-mf-w') === name) { return; }
        body.setAttribute('data-mf-w', name);
        body.className = body.className.replace(/\s*mf-pb-w-(lg|md|sm)/g, '') + ' ' + name;
    }

    function watchDensity() {
        applyDensity();
        var wrap = $panel.find('.mf-pb-table-wrap')[0];
        if (wrap && typeof ResizeObserver === 'function') {
            new ResizeObserver(applyDensity).observe(wrap);
        }
        $(window).on('resize.megaform', applyDensity);
    }

    function loadForms() {
        service('GetForms', {
            searchTerm: state.search,
            status: state.status,
            pageIndex: state.pageIndex,
            pageSize: state.pageSize,
            sortBy: state.sortBy || '',
            sortDir: state.sortBy ? state.sortDir : ''
        }, function (data) {
            clearAlert();
            state.hasMore = !!data.hasMore;
            // Paint the arrows from what the server echoed, not from what we asked for: if a
            // sort was rejected, the header must say so by going back to neutral.
            paintSortHeaders(data.sortBy || null, data.sortDir || 'desc');
            renderRows(data.items || []);
            renderPager(data.items ? data.items.length : 0);
            $panel.find('.mf-pb-table-wrap').scrollTop(0);
            applyDensity();   // a scrollbar appearing changes the wrapper's clientWidth
        });
    }

    function renderRows(items) {
        var $rows = $panel.find('.mf-pb-rows').empty();
        $panel.find('.mf-pb-empty').toggleClass('mf-pb-hidden', items.length > 0);

        items.forEach(function (item) {
            // Built with .text() on every field: a form title is author-supplied and must
            // never reach the panel as markup.
            var $tr = $('<tr />');
            var $title = $('<td class="mf-pb-title" />');
            $('<span class="mf-pb-formtitle" />').text(item.title).appendTo($title);
            $('<span class="mf-pb-badge" />')
                .addClass('mf-pb-badge-' + String(item.status).toLowerCase())
                .text(item.status).appendTo($title);
            $('<span class="mf-pb-formid" />').text('#' + item.formId).appendTo($title);

            // The meta line carries whatever the current width has dropped from the row. It is
            // always rendered and CSS decides whether it shows, so no re-render is needed when
            // the panel is resized.
            var meta = [];
            meta.push(item.fields + ' ' + t('MetaFields', 'fields'));
            meta.push(item.submissions + ' ' + t('MetaSubmissions', 'subs'));
            var when = formatDate(item.modifiedUtc);
            if (when) { meta.push(when); }
            $('<span class="mf-pb-meta" />').text(meta.join(' \u00b7 ')).appendTo($title);
            $title.appendTo($tr);

            $('<td class="mf-pb-num" />').text(item.fields).appendTo($tr);
            $('<td class="mf-pb-num" />').text(item.submissions).appendTo($tr);
            $('<td class="mf-pb-modified" />').text(formatDate(item.modifiedUtc)).appendTo($tr);

            var $actions = $('<td class="mf-pb-actions-col" />');
            appendAction($actions, t('Edit', 'Edit'), item.builderUrl);
            appendAction($actions, t('Submissions', 'Submissions'), item.submissionsUrl);
            $('<a href="#" class="mf-pb-action mf-pb-addto" />')
                .text(currentTabId() > 0
                    ? t('AddToCurrentPage', 'Add to current page')
                    : t('AddToPage', 'Add to page'))
                .on('click', function (e) { e.preventDefault(); openDropPicker(item, $(this)); })
                .appendTo($actions);
            $actions.appendTo($tr);

            $tr.appendTo($rows);
        });
    }

    function appendAction($cell, label, url) {
        var $a = $('<a href="#" class="mf-pb-action" />').text(label).appendTo($cell);
        bindJump($a, url, t('NoHostPage', 'Add a MegaForm module to a page first - the builder opens inside it.'));
    }


    // ── Add to page ──────────────────────────────────────────────────────────
    // A form cannot be dragged from here onto a pane: the panel is an iframe overlay that
    // covers the page while it is open, and DNN's drag-to-pane lives in the Edit Bar. Picking
    // the page and letting the server place the module reaches the same end state.
    var pageCache = null;

    /// The page behind the panel. DNN publishes it on the host page as sf_tabId (the same value
    /// the services framework sends), so no guessing and no extra request. Returns 0 when it
    /// cannot be read - callers must then keep the old "pick a page" behaviour.
    function currentTabId() {
        try {
            var top = window.top;
            if (top && top.dnn && typeof top.dnn.getVar === 'function') {
                var fromVar = parseInt(top.dnn.getVar('sf_tabId'), 10);
                if (fromVar > 0) { return fromVar; }
            }
            if (top && top.location && top.location.search) {
                var m = /[?&]tabid=(\d+)/i.exec(top.location.search);
                if (m) { return parseInt(m[1], 10) || 0; }
            }
        } catch (e) { /* different origin or no host page: fall back to the picker */ }
        return 0;
    }

    function currentPageFallback(tabId) {
        var name = t('CurrentPage', 'Current page');
        var path = '';
        try {
            name = (window.top.document.title || name).replace(/\s*\|.*$/, '').trim() || name;
            path = window.top.location.pathname || '';
        } catch (e) { /* keep the generic label */ }
        return { tabId: tabId, name: name, path: path };
    }

    function closeDropPicker() {
        $(document.body).find('.mf-pb-drop').remove();
        $(document).off('click.mfdrop');
    }

    function openDropPicker(item, $anchor) {
        closeDropPicker();

        var $box = $(
            '<div class="mf-pb-drop">' +
            '  <h4></h4><p></p>' +
            '  <div class="mf-pb-drop-label"></div>' +
            '  <input type="search" class="mf-pb-pagesearch" autocomplete="off" />' +
            '  <div class="mf-pb-pagelist"></div>' +
            '  <div class="mf-pb-drop-label"></div>' +
            '  <select class="mf-pb-pane">' +
            '    <option value="ContentPane">ContentPane</option>' +
            '    <option value="LeftPane">LeftPane</option>' +
            '    <option value="RightPane">RightPane</option>' +
            '    <option value="BottomPane">BottomPane</option>' +
            '  </select>' +
            '  <div class="mf-pb-drop-actions">' +
            '    <button type="button" class="mf-pb-cancel dnn-ui-common-button small"></button>' +
            '    <button type="button" class="mf-pb-confirm dnn-ui-common-button small" role="primary" disabled></button>' +
            '  </div>' +
            '</div>');

        var here = currentTabId();
        $box.find('h4').text(here > 0
            ? t('AddToCurrentPageTitle', 'Add this form to the page you are on')
            : t('AddToPageTitle', 'Add this form to a page'));
        $box.find('p').text(item.title);
        $box.find('.mf-pb-drop-label').eq(0).text(t('TargetPage', 'Target page'));
        $box.find('.mf-pb-drop-label').eq(1).text(t('TargetPane', 'Target pane'));
        $box.find('.mf-pb-pagesearch').attr('placeholder', t('SearchPages', 'Search pages'));
        $box.find('.mf-pb-cancel').text(t('Cancel', 'Cancel'));
        $box.find('.mf-pb-confirm').text(t('Add', 'Add'));

        // The Persona Bar content lives in an iframe. Keeping the picker at document-body level
        // avoids host panel clipping and stale wrapper offsets after DNN reloads the view.
        $box.appendTo(document.body);
        positionDropPicker($box, $anchor);

        var chosen = null;
        function selectPage(p, $b) {
            chosen = p;
            $box.find('.mf-pb-pagelist button').removeClass('is-active');
            $b.addClass('is-active');
            $box.find('.mf-pb-confirm').prop('disabled', false);
        }

        function renderPages(list) {
            var $list = $box.find('.mf-pb-pagelist').empty();
            chosen = null;
            $box.find('.mf-pb-confirm').prop('disabled', true);
            if (!list.length) {
                $('<div style="padding:10px;font-size:12px" />')
                    .text(t('NoPages', 'No pages match.')).appendTo($list);
                positionDropPicker($box, $anchor);
                return;
            }
            // The current page goes first and starts selected, so "Add to current page" is one
            // click. It is still only a default: every other page is right underneath it.
            var ordered = list.slice();
            if (here > 0) {
                var atIndex = -1;
                for (var i = 0; i < ordered.length; i++) {
                    if (Number(ordered[i].tabId) === here) { atIndex = i; break; }
                }
                // Not in the list means the page list was capped or filtered - synthesise the
                // entry rather than silently dropping the current page.
                var currentEntry = atIndex >= 0 ? ordered.splice(atIndex, 1)[0] : currentPageFallback(here);
                ordered.unshift(currentEntry);
            }

            ordered.forEach(function (p) {
                var isHere = here > 0 && Number(p.tabId) === here;
                var $b = $('<button type="button" />');
                if (isHere) { $b.addClass('is-current'); }
                $('<span />').text(p.name).appendTo($b);
                if (isHere) {
                    $('<span class="mf-pb-here" />').text(t('CurrentPageBadge', 'you are here')).appendTo($b);
                }
                if (p.path && p.path !== p.name) $('<span class="mf-pb-pagepath" />').text(p.path).appendTo($b);
                $b.on('click', function () {
                    selectPage(p, $b);
                });
                $b.appendTo($list);
                if (!chosen) selectPage(p, $b);
            });
            positionDropPicker($box, $anchor);
        }

        function loadPages(term) {
            if (pageCache && !term) { renderPages(pageCache); return; }
            service('GetPages', { searchTerm: term || '' }, function (data) {
                var list = (data && data.pages) || [];
                if (!term) pageCache = list;
                renderPages(list);
            });
        }
        loadPages('');

        var timer = null;
        $box.find('.mf-pb-pagesearch').on('input', function () {
            var v = $(this).val();
            window.clearTimeout(timer);
            timer = window.setTimeout(function () { loadPages(v); }, 250);
        });

        $box.find('.mf-pb-cancel').on('click', closeDropPicker);
        $box.find('.mf-pb-confirm').on('click', function () {
            if (!chosen) return;
            var pane = $box.find('.mf-pb-pane').val();
            $(this).prop('disabled', true).text(t('Adding', 'Adding…'));
            utility.sf.moduleRoot = 'personaBar';
            utility.sf.controller = 'MegaForm';
            utility.sf.post('AddToPage', { formId: item.formId, tabId: chosen.tabId, pane: pane },
                function (res) {
                    closeDropPicker();
                    showSuccess(item.title, chosen.name, res && res.pageUrl);
                },
                function (xhr) {
                    closeDropPicker();
                    showAlert(apiErrorMessage(xhr, t('AddFailed', 'MegaForm could not add the form to that page.')));
                });
        });

        // Clicking anywhere else dismisses it, but not the click that opened it.
        window.setTimeout(function () {
            $(document).on('click.mfdrop', function (e) {
                if (!$(e.target).closest('.mf-pb-drop, .mf-pb-addto').length) closeDropPicker();
            });
        }, 0);
    }

    function positionDropPicker($box, $anchor) {
        var a = $anchor[0].getBoundingClientRect();
        var boxW = $box.outerWidth() || 340;
        var boxH = $box.outerHeight() || 260;
        var gap = 6;
        var vw = window.innerWidth || document.documentElement.clientWidth || 900;
        var vh = window.innerHeight || document.documentElement.clientHeight || 650;
        var top = a.bottom + gap;
        if (top + boxH > vh - 8 && a.top - boxH - gap > 8) top = a.top - boxH - gap;
        var left = a.right - boxW;
        left = Math.max(8, Math.min(left, vw - boxW - 8));
        top = Math.max(8, Math.min(top, vh - boxH - 8));
        $box.css({ top: Math.round(top), left: Math.round(left) });
    }

    function showSuccess(formTitle, pageName, url) {
        var $a = $panel.find('.mf-pb-alert').empty().addClass('is-success').removeClass('mf-pb-hidden');
        $('<span />').text(formTitle + ' → ' + pageName + '. ').appendTo($a);
        if (url) {
            $('<a />').attr('href', '#').text(t('OpenPage', 'Open the page'))
                .on('click', function (e) { e.preventDefault(); window.top.location.href = url; })
                .appendTo($a);
        }
    }

    function renderPager(count) {
        var from = count === 0 ? 0 : (state.pageIndex * state.pageSize) + 1;
        var to = (state.pageIndex * state.pageSize) + count;
        $panel.find('.mf-pb-pageinfo').text(
            count === 0 ? t('NoResults', 'No results') :
                t('Page', 'Page') + ' ' + (state.pageIndex + 1) + ' | ' + from + '-' + to
        );
        $panel.find('.mf-pb-prev').prop('disabled', state.pageIndex === 0);
        $panel.find('.mf-pb-next').prop('disabled', !state.hasMore);
    }

    // ── sorting ──────────────────────────────────────────────────────────────
    // Server-side, because the panel holds 20 rows of a portal that has hundreds: sorting what
    // is on screen would reorder one page and call the job done.
    function paintSortHeaders(sortBy, sortDir) {
        $panel.find('.mf-pb-table th[data-mf-sort]').each(function () {
            var th = $(this);
            var key = th.attr('data-mf-sort');
            var on = sortBy && key === sortBy;
            th.attr('aria-sort', on ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
        });
    }

    function wireSorting() {
        $panel.find('.mf-pb-table th[data-mf-sort] .mf-pb-sort').on('click', function () {
            var key = $(this).closest('th').attr('data-mf-sort');
            if (!key) { return; }
            if (state.sortBy === key) {
                state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortBy = key;
                // Text reads best A->Z; a date or a count reads best largest/newest first.
                state.sortDir = key === 'title' ? 'asc' : 'desc';
            }
            state.pageIndex = 0;     // a new order means page 1, or the rows make no sense
            loadForms();
        });
    }

    function wireEvents() {
        $panel.find('.mf-pb-search').on('input', function () {
            var value = $(this).val();
            // Debounced so a server-capped list still feels like a typeahead instead of
            // firing a query per keystroke.
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(function () {
                state.search = value;
                state.pageIndex = 0;
                loadForms();
            }, 300);
        });

        $panel.find('.mf-pb-status').on('change', function () {
            state.status = $(this).val();
            state.pageIndex = 0;
            loadForms();
        });

        $panel.find('.mf-pb-prev').on('click', function () {
            if (state.pageIndex === 0) return;
            state.pageIndex--;
            loadForms();
        });

        $panel.find('.mf-pb-next').on('click', function () {
            if (!state.hasMore) return;
            state.pageIndex++;
            loadForms();
        });
    }

    var init = function (wrapper, util, params, callback) {
        utility = util;
        $panel = $(wrapper);

        localise();
        wireEvents();
        wireSorting();
        watchDensity();
        $panel.find('.mf-pb-back').on('click', function (e) { e.preventDefault(); showList(); });
        loadSummary();
        loadForms();

        if (typeof callback === 'function') callback();
    };

    var load = function (params, callback) {
        // Re-opening the panel should show what changed while it was closed - unless the admin
        // left it on the dashboard, in which case reloading the list underneath would throw away
        // whatever they were in the middle of.
        if (!dash.shown) {
            loadSummary();
            loadForms();
        }
        if (typeof callback === 'function') callback();
    };

    return { init: init, load: load };
});
