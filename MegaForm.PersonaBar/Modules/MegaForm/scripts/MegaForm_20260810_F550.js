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

    // ── the other MegaForm surfaces, also hosted in the panel ────────────────
    // [PbNoPopOut v20260810-F550b] Owner: stop popping out MegaForm's separate screens. On DNN the
    // dashboard's own links (getDashboardShellRouteScoped) are PAGE urls - `?mfFormId=N#mf-builder`
    // against the module's page - so inside the panel they would either navigate the iframe to
    // nowhere or throw the admin back out to a page. Each surface is its own bundle with the same
    // mount contract the DNN host uses (dnn-host/index.ts bootSubmissions/bootMyInbox): a root
    // carrying data-platform + data-mf-api-base, then window.MegaForm.init<Surface>(root).
    //
    // Every one of them keeps the old URL as a fallback: if a bundle does not load, or does not
    // register its init, the panel opens the page it used to open instead of showing nothing.
    // ── the admin asset set ─────────────────────────────────────────────────
    // MEASURED, not guessed (tools/browser-qa/pb-page-asset-truth.mjs, 2026-08-10): the DNN admin
    // page does NOT register a per-surface asset set. It registers ONE set - 33 stylesheets and
    // ~48 scripts - and every admin surface renders inside it. Believing otherwise is what shipped
    // a submissions screen with no CSS at all: the panel mounted the bundle and loaded nothing
    // else, so the surface came up as raw HTML (default link blue rgb(0,0,238), sidebar 1320px
    // wide instead of 256). The bug hid from QA because the harness clicked "Open dashboard"
    // first, and THAT path did load megaform-admin-shell.css.
    //
    // This list mirrors FormView.ascx.cs. It is hand-maintained, so
    // tools/browser-qa/pb-surface-visual-qa.mjs proves each surface is STYLED from a COLD panel, and
    // real page loads and fails on any sheet the panel is missing - drift becomes a test failure
    // rather than a screenshot nobody opened.
    var FONT_AWESOME = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';

    var ADMIN_CSS = [
        'css/megaform.css', 'css/megaform-themes.css', 'css/megaform-widgets.css', 'css/megaform-views.css',
        'css/megaform-admin-shell.css', 'css/megaform-builder-shell.css', 'css/megaform-builder.css',
        'css/megaform-builder-ts.css', 'css/megaform-submissions-ts.css', 'css/megaform-my-inbox-ts.css',
        'css/plugins/megaform-widgets-builtin.css',
        'css/plugins/megaform-widget-advanced-file.css', 'css/plugins/megaform-widget-calculator.css',
        'css/plugins/megaform-widget-data-repeater.css', 'css/plugins/megaform-widget-draw-on-image.css',
        'css/plugins/megaform-widget-dynamic-label.css', 'css/plugins/megaform-widget-golf-scorecard.css',
        'css/plugins/megaform-widget-grid-repeater.css', 'css/plugins/megaform-widget-infinite-list.css',
        'css/plugins/megaform-widget-payment.css', 'css/plugins/megaform-widget-paypal.css',
        'css/plugins/megaform-widget-pdf-form.css', 'css/plugins/megaform-widget-phone-pro.css',
        'css/plugins/megaform-widget-product-line-items.css', 'css/plugins/megaform-widget-rating-suite.css',
        'css/plugins/megaform-widget-razor.css', 'css/plugins/megaform-widget-repeater.css',
        'css/plugins/megaform-widget-rich-text.css', 'css/plugins/megaform-widget-signature.css',
        'css/plugins/megaform-widget-stripe.css', 'css/plugins/megaform-widget-subform.css',
        'css/plugins/megaform-widget-video-embed.css'
    ];

    // Order matters for these: the widget registry and the renderer publish globals the surface
    // bundles expect to already exist.
    var ADMIN_JS_CORE = [
        'js/megaform-i18n.js', 'js/megaform-widgets.js', 'js/plugins/types.js',
        'js/megaform-renderer.js', 'js/megaform-rule-engine.js', 'js/megaform-views.js',
        'js/Sortable.min.js'
    ];

    var ADMIN_JS_PLUGINS = [
        'js/plugins/megaform-razor-studio.js', 'js/plugins/megaform-widget-advanced-file.js',
        'js/plugins/megaform-widget-appointment.js', 'js/plugins/megaform-widget-calculator.js',
        'js/plugins/megaform-widget-captcha.js', 'js/plugins/megaform-widget-qrcode.js',
        'js/plugins/megaform-widget-content-slider.js', 'js/plugins/megaform-widget-datagrid.js',
        'js/plugins/megaform-widget-datagrid-sql.js', 'js/plugins/megaform-widget-datagrid-studio.js',
        'js/plugins/megaform-widget-data-repeater.js', 'js/plugins/megaform-widget-draw-on-image.js',
        'js/plugins/megaform-widget-dynamic-label.js', 'js/plugins/megaform-widget-geolocation.js',
        'js/plugins/megaform-widget-golf-scorecard.js', 'js/plugins/megaform-widget-grid-repeater.js',
        'js/plugins/megaform-widget-image-choice.js', 'js/plugins/megaform-widget-infinite-list.js',
        'js/plugins/megaform-widget-map.js', 'js/plugins/megaform-widget-payment-unified.js',
        'js/plugins/megaform-widget-paypal.js', 'js/plugins/megaform-widget-pdf-form.js',
        'js/plugins/megaform-widget-phone-pro.js', 'js/plugins/megaform-widget-rating-suite.js',
        'js/plugins/megaform-widget-razor.js', 'js/plugins/megaform-widget-repeater.js',
        'js/plugins/megaform-widget-rich-text.js', 'js/plugins/megaform-widget-signature.js',
        'js/plugins/megaform-widget-stripe.js', 'js/plugins/megaform-widget-terms-privacy.js',
        'js/plugins/megaform-widget-video-embed.js', 'js/plugins/widget-advanced-file.js',
        'js/plugins/widget-repeater.js', 'js/plugins/widget-signature.js'
    ];

    var SURFACES = {
        dashboard:   { js: ['js/megaform-dashboard.js'],   init: 'initDashboard',   rootId: 'mf-dashboard-root' },
        submissions: { js: ['js/megaform-submissions.js'], init: 'initSubmissions', rootId: 'mf-submissions-root' },
        myinbox:     { js: ['js/megaform-my-inbox.js'],    init: 'initMyInbox',     rootId: 'mf-myinbox-root' },
        languages:   { js: ['js/megaform-languages.js'],   init: 'initLanguages',   rootId: 'mf-languages-root' },
        // ReactFlow FIRST: dnn-host injects it ahead of the builder bundle with async=false because
        // the bundle expects its globals to already be there. Getting this backwards is a race that
        // only shows up on a cold cache.
        builder:     { js: ['js/builder/megaform-workflow-reactflow.js', 'js/bundles/megaform-builder.js',
                            'js/megaform-template-gallery-search.js'],
                       init: 'initBuilder', rootId: 'mf-builder-root' }
    };

    // Cache stamps as the DNN page uses them. Stamping everything with the panel's own version
    // forks the cache and re-downloads ~3 MB the page already holds.
    var V_DEFAULT = '?v=20260729-B417';
    var V_ADMIN   = '?v=20260809-B421';
    var V_BUILDER = '?v=20260726-B416-StepCanvasActions';
    var VERSION_OF = {
        'css/megaform-admin-shell.css': V_ADMIN,
        'js/megaform-dashboard.js': V_ADMIN,
        'js/bundles/megaform-builder.js': V_BUILDER,
        'js/builder/megaform-workflow-reactflow.js': V_BUILDER,
        'js/Sortable.min.js': ''     // DNN registers it bare; keep the same cache key
    };
    function stampFor(file) {
        return VERSION_OF.hasOwnProperty(file) ? VERSION_OF[file] : V_DEFAULT;
    }

    // Stylesheets go in on the FIRST surface open and stay: they are what makes any of this look
    // like MegaForm rather than a 1995 document.
    var adminCssLoaded = false;
    function ensureAdminCss() {
        if (adminCssLoaded) { return; }
        adminCssLoaded = true;
        loadCssHref('mf-pb-css-fa', FONT_AWESOME);
        ADMIN_CSS.forEach(loadCssOnce);
    }

    function loadCssHref(id, href) {
        if (document.getElementById(id)) { return; }
        var link = document.createElement('link');
        link.id = id; link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    function loadCssOnce(file) {
        loadCssHref('mf-pb-css-' + file.replace(/[^a-z0-9]/gi, ''), ASSETS + file + stampFor(file));
    }

    // Every admin surface needs the same stylesheets and the same core/plugin scripts, so this
    // runs once and every surface after the first is just its own bundle.
    var adminJsLoaded = false;
    function ensureAdminAssets(done) {
        ensureAdminCss();
        if (adminJsLoaded) { done(); return; }
        loadChain(ADMIN_JS_CORE.concat(ADMIN_JS_PLUGINS), function (err) {
            // A missing widget plugin is not worth blocking a screen for; the surface bundles do
            // not depend on any single one. Anything fatal shows up in the surface's own init.
            adminJsLoaded = true;
            done(err && /megaform-i18n|megaform-widgets\.js|megaform-renderer|Sortable/.test(String(err.message)) ? err : undefined);
        });
    }

    function loadScriptOnce(file, done) {
        var id = 'mf-pb-js-' + file.replace(/[^a-z0-9]/gi, '');
        var existing = document.getElementById(id);
        if (existing) {
            if (existing.getAttribute('data-loaded') === '1') { done(); return; }
            var waited = 0;
            var poll = window.setInterval(function () {
                if (existing.getAttribute('data-loaded') === '1') { window.clearInterval(poll); done(); }
                else if ((waited += 200) > 30000) { window.clearInterval(poll); done(new Error('timeout ' + file)); }
            }, 200);
            return;
        }
        var s = document.createElement('script');
        s.id = id;
        s.src = ASSETS + file + stampFor(file);
        s.onload = function () { s.setAttribute('data-loaded', '1'); done(); };
        s.onerror = function () { done(new Error('failed to load ' + s.src)); };
        document.head.appendChild(s);
    }

    // Surface bundles can register their init a tick or two after onload (the builder is the worst
    // offender - dnn-host polls it 80 times at 150ms). Waiting is cheaper than a false fallback.
    function whenInitReady(name, tries, done) {
        var fn = window.MegaForm && window.MegaForm[name];
        if (typeof fn === 'function') { done(fn); return; }
        if (tries <= 0) { done(null); return; }
        window.setTimeout(function () { whenInitReady(name, tries - 1, done); }, 150);
    }

    function loadChain(files, done) {
        var i = 0;
        (function next(err) {
            if (err) { done(err); return; }
            if (i >= files.length) { done(); return; }
            loadScriptOnce(files[i++], next);
        })();
    }

    function openSurfaceInPanel(kind, formId, fallbackUrl) {
        var spec = SURFACES[kind];
        if (!spec) { if (fallbackUrl) window.top.location.href = fallbackUrl; return; }
        clearAlert();
        setListVisible(false);
        publishPlatformConfig();

        var $host = $panel.find('.mf-pb-dashhost');
        $host.empty();
        var root = document.createElement('div');
        root.id = spec.rootId;
        root.setAttribute('data-platform', 'dnn');
        root.setAttribute('data-mf-api-base', API_BASE);
        root.setAttribute('data-api-base', API_BASE);
        root.setAttribute('data-assets-base', ASSETS);
        root.setAttribute('data-portal-id', String(dash.portalId));
        root.setAttribute('data-form-id', String(formId || 0));
        root.setAttribute('data-is-new', 'false');
        var boot = document.createElement('div');
        boot.className = 'mf-pb-dashboot';
        boot.textContent = t('LoadingDashboard', 'Loading the dashboard…');
        root.appendChild(boot);
        $host[0].appendChild(root);
        dash.mounted = false;    // the dashboard is no longer what is in the host

        ensureAdminAssets(function (assetErr) {
        loadChain(assetErr ? [] : spec.js, function (err) {
            if (err || assetErr) { surfaceFailed(fallbackUrl); return; }
            whenInitReady(spec.init, 40, function (init) {
                if (!init) { surfaceFailed(fallbackUrl); return; }
                try {
                    $(root).find('.mf-pb-dashboot').remove();
                    init(root);
                    wireDashboardChrome();
                } catch (e) {
                    surfaceFailed(fallbackUrl);
                }
            });
        });
        });
    }

    function surfaceFailed(fallbackUrl) {
        setListVisible(true);
        if (fallbackUrl) { window.top.location.href = fallbackUrl; return; }
        showAlert(t('SurfaceUnavailable', 'That screen could not be opened inside the panel.'));
    }

    // The dashboard's own links are page urls. Inside the panel they are intercepted and turned
    // into an in-panel mount, so nothing ever leaves the Persona Bar.
    function surfaceFromHref(href) {
        var h = String(href || '');
        var kind = h.indexOf('#mf-builder') >= 0 ? 'builder'
                 : h.indexOf('#mf-submissions') >= 0 ? 'submissions'
                 : h.indexOf('#mf-myinbox') >= 0 ? 'myinbox'
                 : h.indexOf('#mf-languages') >= 0 ? 'languages'
                 : h.indexOf('#mf-dashboard') >= 0 ? 'dashboard' : null;
        if (!kind) return null;
        var m = /[?&]mfFormId=(\d+)/i.exec(h);
        return { kind: kind, formId: m ? parseInt(m[1], 10) : 0 };
    }

    // The dashboard goes through the same asset path as every other surface now. It used to load
    // megaform-admin-shell.css on its own, which is precisely why the missing-CSS bug on the OTHER
    // surfaces stayed invisible whenever the dashboard had been opened first.
    function loadDashboardAssets(done) {
        ensureAdminAssets(function (assetErr) {
            if (assetErr) { done(assetErr); return; }
            if (window.MegaForm && typeof window.MegaForm.initDashboard === 'function') { done(); return; }
            loadChain(SURFACES.dashboard.js, done);
        });
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
        if (on) { applyDensity(); }   // back to the list: re-measure the columns at this width
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
                // dashboard, which is exactly what this panel did before F550. Logged loudly:
                // a silent hand-off looks identical to "the panel decided to navigate for no
                // reason", which cost a whole QA round to diagnose.
                try { console.error('[mf-pb] dashboard fallback err=' + (err && err.message) + ' init=' + (typeof init)); } catch (ignore) { }
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
                try { console.error('[mf-pb] initDashboard threw: ' + (e && e.message) + '\n' + (e && e.stack)); } catch (ignore) { }
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
        wireSurfaceLinkInterceptor();
    }

    // [PbCaptureLinks v20260810-F550c] Any link that would take the admin to one of MegaForm's own
    // page-hosted screens is served here instead. Anything else (a live form preview, a real site
    // page) still opens in the top window, because that is genuinely somewhere else.
    //
    // CAPTURE phase, deliberately. A delegated jQuery handler on the host is a BUBBLE handler and
    // it never fired: the dashboard attaches its own listener to those sidebar links and calls
    // stopPropagation(), so the event died before it reached the host - while the browser still
    // performed the default navigation. Measured: clicking "My Inbox" navigated the panel iframe to
    // /DesktopModules/admin/Dnn.PersonaBar/index.html#mf-myinbox (the SPA builds that href from
    // location.pathname, which inside the panel IS the Persona Bar shell), reloading the entire
    // Persona Bar and dumping the admin back at an empty panel. Capture runs before any of that.
    function wireSurfaceLinkInterceptor() {
        var host = $panel.find('.mf-pb-dashhost')[0];
        if (!host || host.getAttribute('data-mf-intercept') === '1') { return; }
        host.setAttribute('data-mf-intercept', '1');
        host.addEventListener('click', function (e) {
            var node = e.target;
            var a = null;
            while (node && node !== host) {
                if (node.tagName === 'A' && node.getAttribute('href')) { a = node; break; }
                node = node.parentNode;
            }
            if (!a) { return; }
            var target = surfaceFromHref(a.getAttribute('href'));
            if (!target) { return; }
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) { e.stopImmediatePropagation(); }
            if (target.kind === 'dashboard') { dash.mounted = false; showDashboard(false); return; }
            openSurfaceInPanel(target.kind, target.formId, null);
        }, true);
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
    // [PbFullWidth v20260810-F550b] The panel DNN hands us is about 860px, which left a dead strip
    // of page showing beside it and collapsed the dashboard's forms table (the name column
    // overlapped its own header). Owner: make it full screen. So the MegaForm panel takes the
    // whole width beside the rail from the moment it opens - list AND dashboard - and stays there.
    // Nothing is scaled or zoomed; it is the same panel, just not artificially narrow.
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
            // [PbNoPopOut v20260810-F550b] Edit and Submissions used to send the admin to a DNN
            // page carrying the module. They now open inside the panel; the old URL is passed
            // along only as the fallback for when the bundle cannot mount.
            appendSurfaceAction($actions, t('Edit', 'Edit'), 'builder', item.formId, item.builderUrl);
            appendSurfaceAction($actions, t('Submissions', 'Submissions'), 'submissions', item.formId, item.submissionsUrl);
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

    // Opens the surface inside the panel. No longer disabled when the portal has no page with a
    // MegaForm module: not needing one is the whole point.
    function appendSurfaceAction($cell, label, kind, formId, fallbackUrl) {
        $('<a href="#" class="mf-pb-action" />').text(label)
            .on('click', function (e) { e.preventDefault(); openSurfaceInPanel(kind, formId, fallbackUrl || null); })
            .appendTo($cell);
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
        widenPanelForDashboard(true);   // full screen from the first paint, list included
        watchDensity();
        $(window).on('resize.megaformwide', function () { widenPanelForDashboard(true); });
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
