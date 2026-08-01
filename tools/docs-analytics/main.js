/*
 * Page-view beacon for the DocFX documentation site.
 *
 * Install: copy this file into the docs repo as templates/analytics/public/main.js and add the
 * folder to docfx.json —  "template": [ "default", "modern", "templates/analytics" ]
 * (DocFX's modern template loads <template>/public/main.js as its entry script.)
 *
 * Where the numbers go: each view is one submission of the "Docs Reader Events" form in the
 * MegaForm database on the endpoint below — your own database, readable from the Submissions
 * and Report screens. GitHub Pages exposes no server log, so a JS beacon is the only option
 * available; an ad blocker can still refuse it, and no client-side counter is exact.
 *
 * Cost: a submission is roughly a dozen SQL rows once index, typed and field rows are counted.
 * Fine for a documentation site; if this ever needs to carry real traffic, move it onto the
 * MF_AppEvents / MF_AppEntityStats tables in CLAUDE_PROPOSAL_20260731_APP_EVENTS_AND_STATS.md,
 * where a view is one row plus an atomic counter bump.
 *
 * ── BLOCKED: the cross-origin preflight is never answered ────────────────────────────────
 * This beacon cannot reach the endpoint from a browser yet, and neither can any other
 * cross-site embed that posts JSON. Measured on megaclean008 (2026-08-01):
 *
 *   POST  application/json   from curl   -> 200, and the submission is stored
 *   OPTIONS preflight        from curl   -> 200 "Allow: OPTIONS, TRACE, GET, HEAD, POST"
 *                                           with NO Access-Control-* headers
 *   POST  application/json   from a page -> TypeError: Failed to fetch (preflight rejected)
 *
 * A Content-Type of application/json makes the request non-simple, so the browser preflights.
 * IIS's own OPTIONSVerbHandler answers that OPTIONS before the DNN route runs, so
 * SubmitController.PostOptions() — which does add the headers — never executes. The two
 * preflight-free content types do not help either: text/plain returns 500 and
 * application/x-www-form-urlencoded returns 400, because the action model-binds [FromBody] JObject.
 *
 * Worth knowing: MegaFormCorsHandler exists in MegaForm.DNN/WebApi but is registered nowhere —
 * it has never run. Fixing this properly means answering OPTIONS before IIS does (a route
 * message handler, or an OPTIONSVerbHandler removal in the site's web.config) and is a change
 * to the public submit path, so it wants its own review rather than riding along with a beacon.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://dnndefender.com/DesktopModules/MegaForm/API/Submit/Post';
  var FORM_ID = 0;              // set to the "Docs Reader Events" form id before deploying
  var DEDUPE_MINUTES = 30;      // one view per page per visitor per window

  if (!FORM_ID) return;         // not configured yet — stay silent rather than 400 every load

  var LS_VISITOR = 'mf_docs_visitor';
  var LS_SEEN = 'mf_docs_seen';

  function store() {
    // Private-mode Safari throws on write; treat storage as absent rather than break the page.
    try {
      var t = '__mf' + Date.now();
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return window.localStorage;
    } catch (e) { return null; }
  }

  function visitorKey(ls) {
    if (!ls) return '';
    var v = ls.getItem(LS_VISITOR);
    if (!v) {
      v = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
      ls.setItem(LS_VISITOR, v);
    }
    return v;
  }

  /** True when this page has not been counted for this visitor inside the window. */
  function firstViewInWindow(ls, path) {
    if (!ls) return true;
    var now = Date.now();
    var seen;
    try { seen = JSON.parse(ls.getItem(LS_SEEN) || '{}'); } catch (e) { seen = {}; }

    var cutoff = now - DEDUPE_MINUTES * 60 * 1000;
    for (var k in seen) { if (seen[k] < cutoff) delete seen[k]; }

    if (seen[path]) { ls.setItem(LS_SEEN, JSON.stringify(seen)); return false; }
    seen[path] = now;
    ls.setItem(LS_SEEN, JSON.stringify(seen));
    return true;
  }

  function send() {
    var ls = store();
    // Pathname only. A query string on a docs page is usually a search term, and that is the
    // visitor's business.
    var path = window.location.pathname || '/';
    if (!firstViewInWindow(ls, path)) return;

    var referrer = '';
    try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch (e) { referrer = ''; }
    if (referrer === window.location.origin) referrer = '';   // internal navigation is not a source

    var payload = JSON.stringify({
      formId: FORM_ID,
      submissionTime: 0,
      data: {
        page_path: path,
        visitor_key: visitorKey(ls),
        referrer: referrer,
        event_type: 'view'
      }
    });

    // sendBeacon survives the page being closed, but it cannot set Content-Type: application/json
    // (only a few CORS-safelisted types), and the endpoint model-binds JSON. So fetch with
    // keepalive is the primary path and sendBeacon is not used at all.
    try {
      window.fetch(ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })['catch'](function () { /* analytics must never surface an error to a reader */ });
    } catch (e) { /* ignore */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', send);
  } else {
    send();
  }
})();
