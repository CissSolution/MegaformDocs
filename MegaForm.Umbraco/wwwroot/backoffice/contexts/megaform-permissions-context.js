/**
 * MegaForm permission context for the Umbraco 17 Bellissima backoffice.
 *
 * Loads the current user's effective MegaForm permissions from the server once
 * and exposes synchronous helpers to check coarse and granular permissions.
 */

const UMB_AUTH_TOKEN_KEY = 'umb:userAuthTokenResponse';

/**
 * The backoffice auth context, handed over by whichever MegaForm element mounts first.
 *
 * Umbraco 17 keeps the OIDC access token in MEMORY — measured: after a successful login both
 * localStorage and sessionStorage hold no token entry at all (only umb:appLanguage). So the
 * storage reader below returns null on every modern site, mfFetch silently degrades to a
 * cookie-only call, and every MegaForm backoffice screen then depends on the UMB_UCONTEXT
 * cookie. That cookie times out long before the SPA session does, and the API answers a
 * cookie-less call with a REDIRECT to the login page — which is where
 * "Unexpected token '<', "<!DOCTYPE"... is not valid JSON" comes from.
 */
let _authContext = null;
let _resolveAuthReady;
const _authReady = new Promise((resolve) => { _resolveAuthReady = resolve; });

/**
 * Registers the backoffice auth context so every mfFetch in this bundle can attach a fresh
 * bearer token. Elements call this from their UMB_AUTH_CONTEXT subscription.
 * @param {{ getLatestToken?: () => Promise<string|undefined> }} authContext
 */
export function setMegaFormAuthContext(authContext) {
  if (!authContext) return;
  _authContext = authContext;
  _resolveAuthReady?.();
}

/**
 * Reads the Umbraco backoffice bearer token stored by Bellissima.
 * Kept as a fallback for older backoffice versions that persisted the token.
 * @returns {string|null}
 */
export function getUmbracoBearerToken() {
  try {
    const raw = localStorage.getItem(UMB_AUTH_TOKEN_KEY) ?? sessionStorage.getItem(UMB_AUTH_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token || null;
  } catch (e) {
    return null;
  }
}

/**
 * The token to send, preferring the live auth context over any persisted copy.
 * Never throws: without a token the request still goes out on the cookie, which is what
 * every MegaForm screen did before this helper existed.
 * @returns {Promise<string|null>}
 */
async function getCurrentToken() {
  // Extension conditions and entity actions can fire before any MegaForm element has mounted
  // and handed the context over. Give that a brief moment rather than sending the first call
  // — the permission load that decides which menu items exist — without a token; never block
  // for long, since falling back to the cookie is exactly the old behaviour.
  if (!_authContext) {
    await Promise.race([_authReady, new Promise((resolve) => setTimeout(resolve, 750))]);
  }

  try {
    const token = await _authContext?.getLatestToken?.();
    if (token) return token;
  } catch (e) {
    // fall through to the storage fallback
  }
  return getUmbracoBearerToken();
}

/**
 * Wrapper around fetch that injects the Umbraco bearer token into MegaForm API calls.
 * Falls back to plain fetch when no token is available.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function mfFetch(url, options = {}) {
  const token = await getCurrentToken();
  if (token) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return fetch(url, options);
}

/**
 * Calls a MegaForm API endpoint and returns parsed JSON.
 *
 * Why this exists: the MegaForm API endpoints are guarded by the "MegaFormApi" policy,
 * which challenges with a REDIRECT to the backoffice login page rather than a 401.
 * fetch() follows that redirect by default, so a caller that only sends the backoffice
 * cookie — which lapses long before the SPA's bearer token does — receives the login
 * page with status 200 and then dies inside response.json() with
 * "Unexpected token '<', "<!DOCTYPE"... is not valid JSON". That message names the
 * symptom and hides the cause, which reads as a broken endpoint.
 *
 * Sending the bearer token (which Bellissima keeps fresh) is the fix; detecting the HTML
 * answer and saying "session expired" is the safety net for when it is missing too.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
export async function mfFetchJson(url, options = {}) {
  const response = await mfFetch(url, {
    credentials: 'include',
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
  });

  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (!contentType.toLowerCase().includes('json')) {
    throw new Error('not signed in — reload the backoffice and try again');
  }

  return response.json();
}

/**
 * Derives the same deterministic GUID that the server uses for an integer form id.
 * Keep in sync with MegaFormGranularPermission.GetEntityKey in C#.
 * @param {string} nameSpace
 * @param {string} name
 */
function deriveGuid(nameSpace, name) {
  // UUIDv5 derivation using SHA-1. Must match GuidUtility.Derive in C#.
  const namespaceBytes = new TextEncoder().encode(nameSpace);
  const nameBytes = new TextEncoder().encode(name);
  const combined = new Uint8Array(namespaceBytes.length + nameBytes.length);
  combined.set(namespaceBytes, 0);
  combined.set(nameBytes, namespaceBytes.length);

  // We cannot synchronously compute SHA-1 in pure JS without importing a library.
  // Instead, the server exposes /PermissionsForForm which already resolves the
  // entity key. This helper is intentionally not used for granular checks; use
  // hasForForm() / loadForForm() which call the server.
  return null;
}

export class MegaFormPermissionsContext {
  constructor() {
    this._set = {
      hasSectionAccess: false,
      isAdmin: false,
      globalPermissions: [],
      granularPermissions: {},
    };
    this._ready = false;
    this._promise = null;
    /** @type {Map<number, { ready: boolean, allowed: Set<string> }>} */
    this._formCache = new Map();
  }

  /**
   * Loads global permissions from the server. Safe to call multiple times; cached after first success.
   * @returns {Promise<void>}
   */
  load() {
    if (this._promise) return this._promise;

    this._promise = mfFetchJson('/umbraco/MegaForm/MegaFormApi/CurrentPermissions')
      .then((data) => {
        this._set = {
          hasSectionAccess: !!data.hasSectionAccess,
          isAdmin: !!data.isAdmin,
          globalPermissions: Array.isArray(data.globalPermissions) ? data.globalPermissions : [],
          granularPermissions: data.granularPermissions && typeof data.granularPermissions === 'object'
            ? data.granularPermissions
            : {},
        };
        this._ready = true;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[MegaForm.Permissions] Failed to load permissions', err);

        // Do not keep a failed result. This runs from an extension condition during app boot,
        // which can be before the auth context exists (or before the user has signed in at
        // all); caching that one failure would leave every permission false for the rest of
        // the session, so the MegaForm menu items simply never appear and nothing says why.
        this._promise = null;
        this._ready = true;
        this._set = {
          hasSectionAccess: false,
          isAdmin: false,
          globalPermissions: [],
          granularPermissions: {},
        };
      });

    return this._promise;
  }

  /**
   * Loads effective permissions for a specific form and caches them.
   * @param {number} formId
   * @returns {Promise<{ ready: boolean, allowed: Set<string> }>}
   */
  async loadForForm(formId) {
    if (this._formCache.has(formId)) {
      return this._formCache.get(formId);
    }

    const entry = { ready: false, allowed: new Set() };
    this._formCache.set(formId, entry);

    try {
      const response = await mfFetch(`/umbraco/MegaForm/MegaFormApi/PermissionsForForm?formId=${formId}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const globals = Array.isArray(data.globalPermissions) ? data.globalPermissions : [];
      const granular = data.granularPermissions && typeof data.granularPermissions === 'object'
        ? data.granularPermissions
        : {};

      globals.forEach((p) => entry.allowed.add(p.toLowerCase()));
      Object.values(granular).forEach((arr) => {
        if (Array.isArray(arr)) {
          arr.forEach((p) => entry.allowed.add(p.toLowerCase()));
        }
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[MegaForm.Permissions] Failed to load permissions for form ${formId}`, err);
    } finally {
      entry.ready = true;
    }

    return entry;
  }

  get ready() {
    return this._ready;
  }

  get hasSectionAccess() {
    return this._set.hasSectionAccess;
  }

  get isAdmin() {
    return this._set.isAdmin;
  }

  /**
   * Returns true if the user has a global (coarse) permission identifier.
   * @param {string} permission
   */
  has(permission) {
    if (!this._set.hasSectionAccess) return false;
    if (this._set.isAdmin) return true;
    return this._set.globalPermissions.some(
      (p) => p.localeCompare(permission, undefined, { sensitivity: 'base' }) === 0
    );
  }

  /**
   * Returns true if the user has the permission for the given form.
   * Falls back to the global permission when no granular entry exists.
   * Triggers a server fetch on first call; subsequent calls use the cache.
   * @param {string} permission
   * @param {number} formId
   * @returns {Promise<boolean>}
   */
  async hasForForm(permission, formId) {
    if (!this._set.hasSectionAccess) return false;
    if (this._set.isAdmin) return true;
    if (this.has(permission)) return true;

    const entry = await this.loadForForm(formId);
    return entry.allowed.has(permission.toLowerCase());
  }
}

/** Singleton instance shared across all MegaForm backoffice elements. */
export const megaFormPermissions = new MegaFormPermissionsContext();

// Start loading as soon as the module is imported.
megaFormPermissions.load();
