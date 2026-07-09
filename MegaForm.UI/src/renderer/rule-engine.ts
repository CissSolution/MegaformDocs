// ============================================================
// Shared Rule Engine (browser side)
// Mirrors MegaForm.Core.Services.SharedRuleEngine
// ============================================================

export type RuleSourceType = 'field' | 'role' | 'permission' | 'query' | 'user'
  | 'Field' | 'Role' | 'Permission' | 'Query' | 'User';

export interface RuleCondition {
  sourceType?: RuleSourceType;
  key?: string;
  field?: string;
  fieldKey?: string;
  condition?: string;
  operator?: string;
  value?: string;
}

export interface RuleGroup {
  operator?: 'And' | 'Or' | 'and' | 'or' | string;
  conditions?: RuleCondition[];
  rules?: RuleCondition[];
}

export interface BrowserRuleContext {
  roles: string[];
  permissions: string[];
  query: Record<string, string>;
  user: Record<string, unknown>;
}

export type FieldResolver = (key: string) => string | string[] | null | undefined;

function toStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(v => String(v ?? '')).filter(Boolean);
  if (value instanceof Set) return Array.from(value).map(v => String(v ?? '')).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [String(value)];
}

function firstArray(...values: unknown[]): string[] {
  for (const value of values) {
    const arr = toStringArray(value);
    if (arr.length) return arr;
  }
  return [];
}

function getByPath(root: any, key: string): unknown {
  if (!root || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(root, key)) return root[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(root)) {
    if (k.toLowerCase() === lower) return root[k];
  }
  if (!key.includes('.')) return undefined;
  return key.split('.').reduce((cur, part) => {
    if (cur == null) return undefined;
    return getByPath(cur, part) as any;
  }, root);
}

export function getBrowserRuleContext(): BrowserRuleContext {
  const w = window as any;
  const platform = w.__MF_PLATFORM__ || {};
  const explicit = w.__MF_RULE_CONTEXT__ || platform.ruleContext || {};
  const user = explicit.user || platform.user || platform.currentUser || platform.auth || {};
  const query: Record<string, string> = { ...(explicit.query || platform.query || {}) };

  try {
    const params = new URLSearchParams(window.location.search || '');
    params.forEach((value, key) => {
      if (query[key] == null) query[key] = value;
    });
  } catch { /* URLSearchParams unavailable is harmless */ }

  const roles = firstArray(
    explicit.roles,
    user.roles,
    user.Roles,
    platform.roles,
    platform.userRoles,
    platform.roleNames,
  );

  const permissions = firstArray(
    explicit.permissions,
    user.permissions,
    user.Permissions,
    platform.permissions,
    platform.userPermissions,
  );

  return { roles, permissions, query, user: user || {} };
}

function normalizeSource(source: unknown): string {
  const raw = String(source || 'field').trim().toLowerCase();
  if (raw === 'roles') return 'role';
  if (raw === 'permissions') return 'permission';
  if (raw === 'querystring') return 'query';
  return raw || 'field';
}

function normalizeOperator(cond: RuleCondition): string {
  return String(cond.operator || cond.condition || 'Equals').trim();
}

function normalizeConditions(group: RuleGroup | null | undefined): RuleCondition[] {
  if (!group) return [];
  if (Array.isArray(group.conditions) && group.conditions.length) return group.conditions;
  if (Array.isArray(group.rules) && group.rules.length) return group.rules;
  return [];
}

function splitTargets(value: string): string[] {
  const items = String(value || '').split(',').map(v => v.trim()).filter(Boolean);
  return items.length ? items : [''];
}

function equalsAny(values: string[], target: string, wildcard = true): boolean {
  if (wildcard && values.some(v => v === '*')) return true;
  const targets = splitTargets(target).map(v => v.toLowerCase());
  return values.some(v => targets.includes(String(v || '').toLowerCase()));
}

function includesValue(value: string, target: string): boolean {
  return String(value || '').toLowerCase().includes(String(target || '').toLowerCase());
}

function compareNumbers(values: string[], target: string, fn: (a: number, b: number) => boolean): boolean {
  const nt = Number.parseFloat(target);
  if (Number.isNaN(nt)) return false;
  return values.some(value => {
    const nv = Number.parseFloat(value);
    return !Number.isNaN(nv) && fn(nv, nt);
  });
}

function resolveUserValue(key: string, user: Record<string, unknown>, roles: string[]): string[] {
  const k = key.toLowerCase();
  if (k === 'id' || k === 'userid' || k === 'user_id') return toStringArray(getByPath(user, 'userId') ?? getByPath(user, 'id'));
  if (k === 'username' || k === 'user' || k === 'name') return toStringArray(getByPath(user, 'userName') ?? getByPath(user, 'username') ?? getByPath(user, 'name'));
  if (k === 'displayname' || k === 'fullname') return toStringArray(getByPath(user, 'displayName') ?? getByPath(user, 'fullName'));
  if (k === 'email' || k === 'emailaddress') return toStringArray(getByPath(user, 'email') ?? getByPath(user, 'emailAddress'));
  if (k === 'isauthenticated' || k === 'authenticated') return [String(!!(getByPath(user, 'isAuthenticated') ?? getByPath(user, 'authenticated')))];
  if (k === 'isadmin' || k === 'admin') return [String(!!(getByPath(user, 'isAdmin') ?? getByPath(user, 'admin')))];
  if (k === 'issuperuser' || k === 'superuser' || k === 'host') return [String(!!(getByPath(user, 'isSuperUser') ?? getByPath(user, 'superUser') ?? getByPath(user, 'host')))];
  if (k === 'role' || k === 'roles') return roles;
  return toStringArray(getByPath(user, key));
}

function resolveValues(cond: RuleCondition, context: BrowserRuleContext, resolveField: FieldResolver): string[] {
  const source = normalizeSource(cond.sourceType);
  const key = String(cond.key || cond.fieldKey || cond.field || '').trim();

  if (source === 'role') return context.roles;
  if (source === 'permission') {
    const admin = resolveUserValue('isAdmin', context.user, context.roles)[0] === 'true'
      || resolveUserValue('isSuperUser', context.user, context.roles)[0] === 'true';
    return admin ? [...context.permissions, '*'] : context.permissions;
  }
  if (source === 'query') return toStringArray(context.query[key] ?? '');
  if (source === 'user') return resolveUserValue(key, context.user, context.roles);

  return toStringArray(resolveField(key));
}

export function evaluateRuleCondition(cond: RuleCondition, resolveField: FieldResolver, context = getBrowserRuleContext()): boolean {
  const source = normalizeSource(cond.sourceType);
  const key = String(cond.key || cond.fieldKey || cond.field || '').trim();
  const target = String(cond.value ?? (source === 'role' || source === 'permission' ? key : ''));
  const values = resolveValues(cond, context, resolveField);
  const op = normalizeOperator(cond);

  switch (op) {
    case 'Equals': return equalsAny(values, target);
    case 'NotEquals': return !equalsAny(values, target);
    case 'Contains': return values.some(v => v === '*' || includesValue(v, target));
    case 'NotContains': return !values.some(v => includesValue(v, target));
    case 'StartsWith': return values.some(v => String(v || '').toLowerCase().startsWith(target.toLowerCase()));
    case 'EndsWith': return values.some(v => String(v || '').toLowerCase().endsWith(target.toLowerCase()));
    case 'GreaterThan': return compareNumbers(values, target, (a, b) => a > b);
    case 'LessThan': return compareNumbers(values, target, (a, b) => a < b);
    case 'GreaterOrEqual': return compareNumbers(values, target, (a, b) => a >= b);
    case 'LessOrEqual': return compareNumbers(values, target, (a, b) => a <= b);
    case 'IsEmpty': return values.length === 0 || values.every(v => !String(v || '').trim());
    case 'IsNotEmpty': return values.some(v => !!String(v || '').trim());
    case 'In': return equalsAny(values, target);
    case 'NotIn': return !equalsAny(values, target);
    default: return true;
  }
}

export function evaluateRuleGroup(group: RuleGroup | null | undefined, resolveField: FieldResolver, context = getBrowserRuleContext()): boolean {
  const conditions = normalizeConditions(group);
  if (!conditions.length) return true;

  const results = conditions.map(cond => evaluateRuleCondition(cond, resolveField, context));
  return String(group?.operator || 'And').toLowerCase() === 'or'
    ? results.some(Boolean)
    : results.every(Boolean);
}

if (typeof window !== 'undefined') {
  (window as any).MegaFormRuleEngine = {
    evaluateRuleGroup,
    evaluateRuleCondition,
    getBrowserRuleContext,
  };
}
