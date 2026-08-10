// [PersonaBar v20260809-B421] Compact viewport-safe MegaForm panel controller.
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

            // Builder and Submissions are DNN module controls: they need a page that
            // hosts the MegaForm module. Without one there is no URL to send the admin
            // to, so the buttons are disabled rather than pointed at a 404.
            bindJump($panel.find('.mf-pb-new'), data.newFormUrl,
                t('NoHostPage', 'Add a MegaForm module to a page first - the builder opens inside it.'));
            bindJump($panel.find('.mf-pb-dashboard'), data.dashboardUrl,
                t('NoHostPage', 'Add a MegaForm module to a page first - the builder opens inside it.'));
        });
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
    function fitPanelWidth() {
        var host = $panel.closest('.socialpanel')[0] || $panel.find('.socialpanel')[0];
        if (!host) { return; }
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
                .text(t('AddToPage', 'Add to page'))
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

        $box.find('h4').text(t('AddToPageTitle', 'Add this form to a page'));
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
            list.forEach(function (p) {
                var $b = $('<button type="button" />');
                $('<span />').text(p.name).appendTo($b);
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
        loadSummary();
        loadForms();

        if (typeof callback === 'function') callback();
    };

    var load = function (params, callback) {
        // Re-opening the panel should show what changed while it was closed.
        loadSummary();
        loadForms();
        if (typeof callback === 'function') callback();
    };

    return { init: init, load: load };
});
