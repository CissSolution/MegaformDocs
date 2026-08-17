/**
 * MegaForm Umbraco Host Bootstrap
 * ================================
 * Bellissima (Umbraco 14+) stores the backoffice access token in a cookie
 * named `umbAccessToken`. The shared Vite/TS admin surfaces (dashboard,
 * builder, submissions, languages) run inside an iframe that points to
 * `umbraco/MegaForm/*` pages. Those pages are served anonymously so the
 * iframe can load without relying on cookie forwarding; this script runs
 * FIRST in every host page and:
 *
 *   1. Publishes `window.__MF_TOKEN` from the Umbraco access token so bundles
 *      that already read it (builder, submissions, AI widgets) authenticate.
 *   2. Installs a fetch interceptor that injects `Authorization: Bearer <token>`
 *      for all MegaForm API calls (covers dashboard and languages which use
 *      plain fetch with `credentials: 'same-origin'`).
 *
 * This is the ONLY Umbraco-specific JS shim; the rest of the admin UI is the
 * shared MegaForm.UI TypeScript codebase.
 */

interface UmbTokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

const LOCAL_STORAGE_KEY = 'umb:userAuthTokenResponse';
const ACCESS_TOKEN_COOKIE_NAME = 'umbAccessToken';
const API_PATH_PATTERNS = ['/api/megaform/', '/umbraco/megaform/megaformapi/'];

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function readUmbToken(): string | null {
  // Umbraco 17+ stores the access token in the `umbAccessToken` cookie.
  const cookieToken = readCookie(ACCESS_TOKEN_COOKIE_NAME);
  if (cookieToken) return cookieToken;

  // Fallback for older Umbraco versions that stored it in localStorage.
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed: UmbTokenResponse = JSON.parse(raw);
    return parsed.access_token || null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[MegaForm Umbraco Host] Failed to read Umbraco auth token.', e);
    return null;
  }
}

function isMegaFormApiUrl(url: string): boolean {
  // [SecFix SEC-09 2026-07-21] Never substring-match: a cross-origin URL like
  // `https://evil.example/?q=/api/MegaForm/` would otherwise leak the bearer
  // token. Require same origin + pathname prefix (mirrors the DNN reference
  // implementation in Assets/js/megaform-admin-live.js).
  try {
    const parsed = new URL(url, location.href);
    if (parsed.origin !== location.origin) return false;
    const path = parsed.pathname.toLowerCase();
    return API_PATH_PATTERNS.some((pattern) => path.indexOf(pattern) === 0);
  } catch {
    return false;
  }
}

function installTokenGlobal(): void {
  const token = readUmbToken() || (window as any).__MF_TOKEN;
  // Only publish something a bundle can actually authenticate with; a Data Protection
  // cookie blob under this name is what several screens were sending as a bearer.
  if (isUsableBearer(token)) {
    (window as any).__MF_TOKEN = token;
  } else if ((window as any).__MF_TOKEN && !isUsableBearer((window as any).__MF_TOKEN)) {
    (window as any).__MF_TOKEN = '';
  }
}

// ── Token bridge to the backoffice document ────────────────────────────────────
// [TokenBridge 2026-08-17] readUmbToken() above finds nothing on Umbraco 17: the
// `umbAccessToken` cookie is httpOnly, so script cannot read it, and Bellissima keeps the
// real token in MEMORY in the backoffice document. Every screen in this frame therefore ran
// on the backoffice cookie alone — which lapses about half an hour in, after which the API
// answers with the login PAGE and the screen reports «Unexpected token '<', "<!DOCTYPE"».
// Photographed on the Entries screen of form 202.
//
// The frame is same-origin with the backoffice, so it can ask for the token instead:
// megaform-workspace-view.js answers megaform:request-token with the live one.
let bridgedToken: string | null = null;
let tokenWaiter: Promise<string | null> | null = null;

function requestTokenFromParent(force = false): Promise<string | null> {
  if (bridgedToken && !force) return Promise.resolve(bridgedToken);
  if (tokenWaiter && !force) return tokenWaiter;
  if (window.parent === window) return Promise.resolve(null);

  tokenWaiter = new Promise<string | null>((resolve) => {
    let settled = false;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin) return;
      const data: any = event.data;
      if (!data || data.type !== 'megaform:token') return;
      window.removeEventListener('message', onMessage);
      settled = true;
      bridgedToken = isUsableBearer(data.token) ? data.token : null;
      if (bridgedToken) (window as any).__MF_TOKEN = bridgedToken;
      resolve(bridgedToken);
    };
    window.addEventListener('message', onMessage);
    try {
      window.parent.postMessage({ type: 'megaform:request-token' }, location.origin);
    } catch {
      /* different document policy — fall through to the timeout */
    }
    // Never hang a page load on this: without an answer the request still goes out on the
    // cookie, which is exactly what every screen did before the bridge existed.
    window.setTimeout(() => {
      if (settled) return;
      window.removeEventListener('message', onMessage);
      resolve(bridgedToken);
    }, 1500);
  }).finally(() => { tokenWaiter = null; });

  return tokenWaiter;
}

/**
 * Is this string usable as a bearer token?
 *
 * The host page prints `window.__MF_TOKEN` from ViewBag.MegaFormAccessToken, and on this
 * build that value is an ASP.NET Core Data Protection blob — the protected COOKIE payload,
 * which begins "CfDJ8". It is not a bearer: sending it produced a 302 to the login page on
 * exactly the endpoint that answered 200 to the token the backoffice holds. Captured from
 * the wire: `Bearer CfDJ8DoQzTXyk…` from the frame, 302; the backoffice's own token, 200.
 * A stale-looking credential is worse than none, because it is sent and rejected.
 */
function isUsableBearer(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  const value = token.trim();
  if (!value) return false;
  return !value.startsWith('CfDJ8');
}

/** True when a response is the login page rather than the JSON the caller asked for. */
function looksLikeLoginPage(response: Response): boolean {
  if (response.status === 401 || response.status === 403) return true;
  // A redirect the fetch could not follow surfaces as status 0 / "opaqueredirect"; that is
  // the challenge too, and treating it as a normal answer is what left the screen showing a
  // JSON parse error with no retry.
  if (response.status === 0 || response.type === 'opaqueredirect') return true;
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (response.redirected && type.indexOf('json') < 0) return true;
  return response.ok && type.indexOf('html') >= 0;
}

function installFetchInterceptor(): void {
  const originalFetch = window.fetch;

  const send = (input: RequestInfo | URL, init: RequestInit | undefined, token: string | null) => {
    if (!token) return originalFetch.call(window, input, init);
    // Merge headers, preserving any existing Authorization set by the bundle.
    const mergedInit: RequestInit = { ...init };
    const headers = new Headers(mergedInit.headers);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    mergedInit.headers = headers;
    return originalFetch.call(window, input, mergedInit);
  };

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let url: string;
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof Request) {
      url = input.url;
    } else {
      url = input.toString();
    }

    if (!isMegaFormApiUrl(url)) {
      return originalFetch.call(window, input, init);
    }

    // Precedence matters. The host page prints window.__MF_TOKEN at RENDER time, so on a
    // page that has been open a while that copy is stale — and a stale bearer is worse than
    // none: it is sent, rejected, and the screen reports a JSON parse error. Measured on the
    // Entries screen: the frame's call carried Authorization and still answered 302 while
    // the same endpoint answered 200 to the token the backoffice holds right now. So: the
    // live bridged token first, the page's copy second, the storage/cookie fallbacks last.
    let token: string | null = bridgedToken;
    if (!token && tokenWaiter) token = await tokenWaiter;
    if (!token) token = await requestTokenFromParent();
    if (!isUsableBearer(token)) {
      const fallback = (window as any).__MF_TOKEN || readUmbToken();
      token = isUsableBearer(fallback) ? fallback : null;
    }

    const response = await send(input, init, token);

    // A MegaForm API call that comes back as the login page means the credential was stale.
    // Ask the parent for a fresh token — it has one, the frame just had an old copy — and
    // replay the call once. Without this the screen shows the JSON parse error and the only
    // way out is a full reload.
    if (looksLikeLoginPage(response) && window.parent !== window) {
      const fresh = await requestTokenFromParent(true);
      if (fresh && fresh !== token) return send(input, init, fresh);
    }
    return response;
  };
}

installTokenGlobal();
installFetchInterceptor();
// Warm the bridge so the first screen paint already has a token to send.
requestTokenFromParent();
