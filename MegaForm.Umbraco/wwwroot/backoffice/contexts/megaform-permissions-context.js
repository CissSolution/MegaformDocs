/**
 * MegaForm permission context for the Umbraco 14+ Bellissima backoffice.
 *
 * Loads the current user's effective MegaForm permissions from the server once
 * and exposes synchronous helpers to check coarse and granular permissions.
 */

const UMB_AUTH_TOKEN_KEY = 'umb:userAuthTokenResponse';

/**
 * Reads the Umbraco backoffice bearer token stored by Bellissima.
 * @returns {string|null}
 */
export function getUmbracoBearerToken() {
  try {
    const raw = localStorage.getItem(UMB_AUTH_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token || null;
  } catch (e) {
    return null;
  }
}

/**
 * Wrapper around fetch that injects the Umbraco bearer token into MegaForm API calls.
 * Falls back to plain fetch when no token is available.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export function mfFetch(url, options = {}) {
  const token = getUmbracoBearerToken();
  if (token) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return fetch(url, options);
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

    this._promise = mfFetch('/umbraco/MegaForm/MegaFormApi/CurrentPermissions', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
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
