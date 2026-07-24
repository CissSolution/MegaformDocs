// ============================================================
// MegaForm antiforgery (CSRF) token injector — Oqtane host.
// ------------------------------------------------------------
// [SecFix 2026-07-04 P1-1/P1-10/P1-12]
// Oqtane renders the ASP.NET Core antiforgery REQUEST token as a hidden
//   <input name="__RequestVerificationToken" value="CfDJ8…">
// and validates it under the header `X-XSRF-TOKEN-HEADER` (the paired cookie
// `X-XSRF-TOKEN-COOKIE` is HttpOnly and rides automatically with credentials).
// MegaForm's admin controllers used to carry class-level [IgnoreAntiforgeryToken]
// so their POSTs never needed the token. As those attributes are removed (or the
// action gains [ValidateAntiForgeryToken]), Oqtane's global antiforgery re-arms on
// unsafe methods — so every same-origin mutating request must now carry the header.
//
// Rather than editing ~20 scattered fetch/XHR sites (and risking a missed one that
// then 400s), we install ONE same-origin chokepoint that adds `X-XSRF-TOKEN-HEADER`
// to any same-origin POST/PUT/DELETE/PATCH when the token exists and the header is
// not already present. It NEVER modifies the body and is wrapped in try/catch so it
// can never break a request.
//
// Safety across hosts:
//   • Oqtane  → token input present → header added → validation passes.
//   • ASP.NET Core Web (JWT) → no token input → no-op.
//   • DNN     → adds an extra header DNN ignores (DNN uses `RequestVerificationToken`).
//   • Blazor framework fetches already carry the header → "add if absent" skips them.
//   • Public Submit/Render keep [IgnoreAntiforgeryToken]; the extra header is ignored.

const HEADER = 'X-XSRF-TOKEN-HEADER';
const UNSAFE = /^(POST|PUT|DELETE|PATCH)$/i;

// ── [ShellPlatform v20260714-01] DNN branch ──────────────────────────────────
// This file is the ONE place the UI is allowed to know how a host authenticates a
// mutating request. It used to know only Oqtane, so every DNN-bound POST written in
// shared feature code (SubmissionsShell's "Send to Inbox", the settings popup, …) either
// carried hand-rolled DNN header logic or — more often — silently 401'd. DNN validates
// `RequestVerificationToken` and resolves the module from `ModuleId`/`TabId`, so the
// chokepoint now adds those too. Feature code stays platform-agnostic: it just fetches.
const DNN_TOKEN_HEADER = 'RequestVerificationToken';

// [IframeToken 20260724] The builder Design-preview renders the form in a same-origin IFRAME.
// Inside it there is NO antiforgery <input> and NO jQuery/ServicesFramework — those live on the
// PARENT builder page. So a mutating fetch made from the iframe (uploadMfImage in inline-edit)
// found an empty token and 401'd. Walk window → parent → top (same-origin only) so the iframe
// borrows the host page's token. Guarded by try/catch: a cross-origin parent throws on access
// and is silently skipped, and on a normal top-level page the first window already has it.
function sameOriginWindows(): Window[] {
  const out: Window[] = [];
  try {
    let w: Window | null = window;
    for (let i = 0; i < 4 && w; i++) {
      // touching w.document throws for a cross-origin frame → that ancestor is skipped
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      try { void w.document; out.push(w); } catch { /* cross-origin ancestor */ }
      if (w === w.parent) break;
      w = w.parent;
    }
    const top = window.top;
    if (top && out.indexOf(top) === -1) { try { void top.document; out.push(top); } catch { /* cross-origin top */ } }
  } catch { /* no window hierarchy */ }
  return out.length ? out : [window];
}

function readToken(): string {
  for (const w of sameOriginWindows()) {
    try {
      const el = w.document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null;
      if (el && el.value) return el.value;
    } catch { /* try next window */ }
  }
  return '';
}

function isDnnHost(): boolean {
  for (const w of sameOriginWindows()) {
    try {
      const p = (w as any).__MF_PLATFORM__;
      if (String((p && p.platform) || '').toLowerCase() === 'dnn') return true;
    } catch { /* try next window */ }
  }
  return false;
}

/**
 * DNN's antiforgery token, straight from its own ServicesFramework.
 *
 * Deliberately NOT sending ModuleId/TabId: DNN cross-checks those headers against the
 * alias-resolved portal and 400s on child-portal subpath aliases ([v20260527-04]). The server
 * side therefore must not authorize off request headers either — MegaForm's DNN endpoints
 * resolve the actor from UserInfo (see ModuleStyleController.IsPortalAdmin / WorkflowInboxController),
 * which is both safer and what lets this chokepoint stay this small.
 */
function dnnToken(): string {
  // Walk same-origin window → parent → top: the iframe preview has no ServicesFramework, the
  // host builder page does. First window that yields a token wins.
  for (const win of sameOriginWindows()) {
    try {
      const w = win as any;
      const platform = w.__MF_PLATFORM__ || {};
      const moduleId = Number(platform.moduleId || platform.instanceId || 0) || 0;
      const sf = w.jQuery && w.jQuery.ServicesFramework ? w.jQuery.ServicesFramework(moduleId) : null;
      const tok = sf ? String(sf.getAntiForgeryValue() || '') : '';
      if (tok) return tok;
    } catch { /* try next window */ }
  }
  return '';
}

// [IframeToken 20260724] A srcdoc iframe (the builder Design preview) has
// location.href === "about:srcdoc" and origin === "null" — an invalid URL base that makes
// `new URL(relativeUrl, href)` throw, so isSameOrigin() returned false and the token was
// never attached. Resolve against, and compare to, the nearest REAL same-origin ancestor.
function realBaseHref(): string {
  for (const w of sameOriginWindows()) {
    try { const h = w.location && w.location.href; if (h && h.indexOf('about:') !== 0) return h; } catch { /* next */ }
  }
  return '';
}
function pageOrigin(): string {
  for (const w of sameOriginWindows()) {
    try { const o = w.location && w.location.origin; if (o && o !== 'null') return o; } catch { /* next */ }
  }
  return '';
}
function isSameOrigin(url: string): boolean {
  try {
    const base = realBaseHref();
    const origin = pageOrigin();
    if (!base || !origin) return false;
    return new URL(url, base).origin === origin;
  } catch {
    return false;
  }
}

export function installMegaFormAntiforgery(): void {
  if (typeof window === 'undefined' || (window as any).__mfAntiforgeryInstalled) return;
  (window as any).__mfAntiforgeryInstalled = true;

  // ── window.fetch ──
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      try {
        const isReq = typeof Request !== 'undefined' && input instanceof Request;
        const method = String((init && init.method) || (isReq ? (input as Request).method : 'GET') || 'GET');
        const url = isReq ? (input as Request).url : String(input);
        if (UNSAFE.test(method) && isSameOrigin(url)) {
          const token = readToken();
          const dnn = isDnnHost() ? dnnToken() : '';
          if (token || dnn) {
            const headers = new Headers((init && init.headers) || (isReq ? (input as Request).headers : undefined));
            let touched = false;
            if (token && !headers.has(HEADER)) { headers.set(HEADER, token); touched = true; }
            if (dnn && !headers.has(DNN_TOKEN_HEADER)) { headers.set(DNN_TOKEN_HEADER, dnn); touched = true; }
            if (touched) init = { ...(init || {}), headers };
          }
        }
      } catch {
        /* never break fetch */
      }
      return origFetch.call(this, input as RequestInfo, init);
    };
  }

  // ── XMLHttpRequest (a few sites use XHR directly) ──
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
      (this as any).__mfMethod = method;
      (this as any).__mfUrl = String(url);
      (this as any).__mfHeaders = null; // reset the per-request header ledger
      // eslint-disable-next-line prefer-spread
      return (origOpen as any).apply(this, [method, url, ...rest]);
    };
    // Record header names the CALLER sets so we never add a SECOND copy of the
    // antiforgery header. XHR.setRequestHeader APPENDS on a repeat call for the
    // same name ("a, b" per spec) — and a comma-joined RequestVerificationToken
    // fails DNN's ValidateAntiForgeryToken → a false 401. The builder's Save
    // (toolbar.ts applySaveHeaders) sets its own token, so without this guard the
    // header below duplicated it and every Save 401'd. This mirrors the fetch
    // path's `!headers.has(...)` "add if absent" contract.
    XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
      try {
        const led = (this as any).__mfHeaders || ((this as any).__mfHeaders = {});
        led[String(name).toLowerCase()] = true;
      } catch { /* never break xhr */ }
      return origSetHeader.call(this, name, value);
    };
    const alreadySet = (xhr: XMLHttpRequest, name: string): boolean => {
      try { return !!((xhr as any).__mfHeaders && (xhr as any).__mfHeaders[name.toLowerCase()]); }
      catch { return false; }
    };
    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      try {
        const method = String((this as any).__mfMethod || 'GET');
        const url = String((this as any).__mfUrl || '');
        if (UNSAFE.test(method) && isSameOrigin(url)) {
          const token = readToken();
          if (token && !alreadySet(this, HEADER)) {
            try { this.setRequestHeader(HEADER, token); } catch { /* header phase passed */ }
          }
          if (isDnnHost()) {
            const dnn = dnnToken();
            if (dnn && !alreadySet(this, DNN_TOKEN_HEADER)) {
              try { this.setRequestHeader(DNN_TOKEN_HEADER, dnn); } catch { /* header phase passed */ }
            }
          }
        }
      } catch {
        /* never break xhr */
      }
      return origSend.call(this, body ?? null);
    };
  } catch {
    /* environment without XHR patching — fetch path still covers most calls */
  }
}

// Self-install on import: idempotent + safe on every host (no-op without the token input).
installMegaFormAntiforgery();
