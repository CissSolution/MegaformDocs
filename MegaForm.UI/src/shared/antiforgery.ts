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

function readToken(): string {
  try {
    const el = document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null;
    return (el && el.value) || '';
  } catch {
    return '';
  }
}

function isDnnHost(): boolean {
  try {
    const p = (window as any).__MF_PLATFORM__;
    return String((p && p.platform) || '').toLowerCase() === 'dnn';
  } catch { return false; }
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
  try {
    const w = window as any;
    const platform = w.__MF_PLATFORM__ || {};
    const moduleId = Number(platform.moduleId || platform.instanceId || 0) || 0;
    const sf = w.jQuery && w.jQuery.ServicesFramework ? w.jQuery.ServicesFramework(moduleId) : null;
    return sf ? String(sf.getAntiForgeryValue() || '') : '';
  } catch { return ''; }
}

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
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
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
      (this as any).__mfMethod = method;
      (this as any).__mfUrl = String(url);
      // eslint-disable-next-line prefer-spread
      return (origOpen as any).apply(this, [method, url, ...rest]);
    };
    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      try {
        const method = String((this as any).__mfMethod || 'GET');
        const url = String((this as any).__mfUrl || '');
        if (UNSAFE.test(method) && isSameOrigin(url)) {
          const token = readToken();
          if (token) {
            try { this.setRequestHeader(HEADER, token); } catch { /* header phase passed */ }
          }
          if (isDnnHost()) {
            const dnn = dnnToken();
            if (dnn) { try { this.setRequestHeader(DNN_TOKEN_HEADER, dnn); } catch { /* header phase passed */ } }
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
