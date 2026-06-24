import { buildRequestHeaders, getPermissionsContext, withOqtaneAuthQuery } from './context';
import type { PermissionRule, PermissionsCatalogResponse } from './types';

// [PermissionsApiCaseFix v20260430-12]
// DNN's older WebApi stack serializes responses in PascalCase ({Permissions, Catalog,
// {Principals, PermissionTypes, Scopes, ...}}) while Web/Oqtane use camelCase. The
// TS client reads lowercase property names, so PascalCase responses arrive as
// `undefined` → empty dropdowns + "No principals available". This normalizer maps
// both casings down to lowercase so the rest of the editor only deals with one shape.
function pick<T = any>(obj: any, ...keys: string[]): T | undefined {
  if (obj == null) return undefined;
  for (var i = 0; i < keys.length; i += 1) {
    var k = keys[i];
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function normalizePrincipal(p: any): any {
  if (!p) return p;
  return {
    principalType: pick<string>(p, 'principalType', 'PrincipalType') || '',
    principalId:   pick<string>(p, 'principalId',   'PrincipalId')   || '',
    displayName:   pick<string>(p, 'displayName',   'DisplayName')   || '',
    description:   pick<string>(p, 'description',   'Description')   || '',
    roleName:      pick<string>(p, 'roleName',      'RoleName')      || '',
    userId:        pick<number>(p, 'userId',        'UserId')        || null,
    isSpecial:     !!pick(p, 'isSpecial', 'IsSpecial'),
    isRole:        !!pick(p, 'isRole',    'IsRole'),
    isUser:        !!pick(p, 'isUser',    'IsUser'),
    isCurrentUser: !!pick(p, 'isCurrentUser', 'IsCurrentUser')
  };
}

function normalizeDefinition(d: any): any {
  if (!d) return d;
  return {
    key:           pick<string>(d, 'key',           'Key')           || '',
    label:         pick<string>(d, 'label',         'Label')         || '',
    description:   pick<string>(d, 'description',   'Description')   || '',
    supportsScope: !!pick(d, 'supportsScope', 'SupportsScope'),
    defaultScope:  pick<string>(d, 'defaultScope',  'DefaultScope')  || 'all'
  };
}

function normalizeScope(s: any): any {
  if (!s) return s;
  return {
    key:         pick<string>(s, 'key',         'Key')         || '',
    label:       pick<string>(s, 'label',       'Label')       || '',
    description: pick<string>(s, 'description', 'Description') || ''
  };
}

function normalizeCatalog(c: any): any {
  if (!c) return null;
  return {
    formId:          pick<number>(c, 'formId',          'FormId') || 0,
    badge:           pick<string>(c, 'badge',           'Badge') || '',
    currentUser:     pick(c,         'currentUser',     'CurrentUser') || null,
    permissionTypes: (pick<any[]>(c, 'permissionTypes', 'PermissionTypes') || []).map(normalizeDefinition),
    scopes:          (pick<any[]>(c, 'scopes',          'Scopes') || []).map(normalizeScope),
    principals:      (pick<any[]>(c, 'principals',      'Principals') || []).map(normalizePrincipal)
  };
}

function normalizeRulePayload(r: any): any {
  if (!r) return r;
  return {
    permissionId:      pick<number>(r, 'permissionId',      'PermissionId')      || 0,
    formId:            pick<number>(r, 'formId',            'FormId')            || 0,
    permissionType:    pick<string>(r, 'permissionType',    'PermissionType')    || '',
    principalType:     pick<string>(r, 'principalType',     'PrincipalType')     || '',
    principalId:       pick<string>(r, 'principalId',       'PrincipalId')       || '',
    roleName:          pick<string>(r, 'roleName',          'RoleName')          || '',
    userId:            pick<number>(r, 'userId',            'UserId')            || null,
    scope:             pick<string>(r, 'scope',             'Scope')             || 'all',
    isGranted:         pick<boolean>(r, 'isGranted',        'IsGranted') !== false,
    fieldRestrictions: pick<string>(r, 'fieldRestrictions', 'FieldRestrictions') || ''
  };
}

function normalizeResponse(payload: any): PermissionsCatalogResponse {
  return {
    permissions: (pick<any[]>(payload, 'permissions', 'Permissions') || []).map(normalizeRulePayload),
    catalog:     normalizeCatalog(pick(payload, 'catalog', 'Catalog'))
  } as any;
}

function ensureOk(response: Response): Response {
  if (!response.ok) {
    throw new Error('Permissions request failed (' + response.status + ')');
  }
  return response;
}

function getCatalogUrl(formId: number): string {
  const ctx = getPermissionsContext();
  return withOqtaneAuthQuery(ctx.apiBase + 'Permissions/Catalog?formId=' + encodeURIComponent(String(formId)), ctx);
}

function getSaveUrl(): string {
  const ctx = getPermissionsContext();
  return withOqtaneAuthQuery(ctx.apiBase + 'Permissions/Save', ctx);
}

export async function fetchPermissionsCatalog(formId: number): Promise<PermissionsCatalogResponse> {
  const ctx = getPermissionsContext();
  const response = await fetch(getCatalogUrl(formId), {
    method: 'GET',
    headers: buildRequestHeaders(ctx, false),
    credentials: 'include'
  }).then(ensureOk);
  const payload = await response.json();
  return normalizeResponse(payload);
}

export async function savePermissionsCatalog(formId: number, permissions: PermissionRule[]): Promise<PermissionsCatalogResponse | { success: boolean; permissions: PermissionRule[] }> {
  const ctx = getPermissionsContext();
  const response = await fetch(getSaveUrl(), {
    method: 'POST',
    headers: buildRequestHeaders(ctx, true),
    credentials: 'include',
    body: JSON.stringify({ formId, permissions })
  }).then(ensureOk);
  const payload = await response.json();
  // Save endpoint may return either {success, permissions} or full {permissions, catalog} shape
  if (payload && (pick(payload, 'catalog', 'Catalog') !== undefined)) return normalizeResponse(payload);
  return {
    success: !!pick(payload, 'success', 'Success'),
    permissions: (pick<any[]>(payload, 'permissions', 'Permissions') || []).map(normalizeRulePayload)
  } as any;
}

