/**
 * MegaForm Umbraco Host Bootstrap
 * ================================
 * Bellissima (Umbraco 14+) stores the backoffice OpenID Connect token response
 * in localStorage under `umb:userAuthTokenResponse`. The shared Vite/TS admin
 * surfaces (dashboard, builder, submissions, languages) run inside an iframe
 * that points to `umbraco/MegaForm/*` pages. Those pages are served anonymously
 * so the iframe can load without relying on cookie forwarding; this script runs
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

const STORAGE_KEY = 'umb:userAuthTokenResponse';
const API_PATH_PATTERNS = ['/api/megaform/', '/umbraco/megaform/megaformapi/'];

function readUmbToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: UmbTokenResponse = JSON.parse(raw);
    return parsed.access_token || null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[MegaForm Umbraco Host] Failed to read Umbraco auth token from localStorage.', e);
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
  const token = readUmbToken();
  if (token) {
    (window as any).__MF_TOKEN = token;
  }
}

function installFetchInterceptor(): void {
  const originalFetch = window.fetch;

  window.fetch = function (
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

    const token = readUmbToken();
    if (!token) {
      return originalFetch.call(window, input, init);
    }

    // Merge headers, preserving any existing Authorization set by the bundle.
    const mergedInit: RequestInit = { ...init };
    const headers = new Headers(mergedInit.headers);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    mergedInit.headers = headers;

    return originalFetch.call(window, input, mergedInit);
  };
}

installTokenGlobal();
installFetchInterceptor();
