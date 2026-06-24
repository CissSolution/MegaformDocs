/**
 * Layout Designer — block catalog merging built-in + custom (per-portal).
 *
 * Custom blocks are persisted server-side via the Designer/SaveBlock API.
 * The catalog merges them with the built-in library in one flat list,
 * preserving category groupings used by tray.ts.
 */

import { BUILTIN_BLOCKS } from './blocks-builtin';
import type { BlockDef, BlockCategory } from './types';

let customCache: BlockDef[] = [];
let customFetched = false;

function getApiBase(): string {
  const w = window as any;
  if (typeof w.__MF_API_BASE__ === 'string' && w.__MF_API_BASE__) return w.__MF_API_BASE__;
  return '/api/MegaForm';
}

function getPlatform(): any {
  const w = window as any;
  return (w && w.__MF_PLATFORM__) || {};
}

function withPortalId(url: string, portalIdOverride?: number): string {
  try {
    const platform = getPlatform();
    const portalId = portalIdOverride ?? platform.portalId ?? 0;
    if (!portalId) return url;
    const u = new URL(url, window.location.origin);
    if (!u.searchParams.has('portalId')) u.searchParams.set('portalId', String(portalId));
    return u.toString();
  } catch { return url; }
}

function headers(): Record<string, string> {
  const platform = getPlatform();
  const out: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  const token = platform.requestVerificationToken
    || (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value;
  if (token) out['RequestVerificationToken'] = token;
  return out;
}

export async function loadCustomBlocks(portalId?: number, force = false): Promise<BlockDef[]> {
  if (customFetched && !force) return customCache;
  try {
    const url = withPortalId(`${getApiBase()}/Designer/Blocks`, portalId);
    const r = await fetch(url, { credentials: 'same-origin', headers: headers() });
    if (!r.ok) { customCache = []; customFetched = true; return customCache; }
    const data = await r.json().catch(() => null) as any;
    const list = Array.isArray(data) ? data : (data?.blocks || data?.Blocks || []);
    customCache = (list as any[]).map(normalizeCustomBlock).filter(Boolean) as BlockDef[];
  } catch {
    customCache = [];
  }
  customFetched = true;
  return customCache;
}

function normalizeCustomBlock(raw: any): BlockDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const key = String(raw.key ?? raw.Key ?? '').trim();
  const html = String(raw.html ?? raw.Html ?? raw.htmlSnippet ?? raw.HtmlSnippet ?? '');
  if (!key || !html) return null;
  const cat = String(raw.category ?? raw.Category ?? 'custom').toLowerCase();
  return {
    key: `custom:${key}`,
    label: String(raw.name ?? raw.Name ?? key),
    category: (cat as BlockCategory) || 'custom',
    zone: (String(raw.zone ?? raw.Zone ?? 'any') as any) || 'any',
    helpText: String(raw.help ?? raw.Help ?? ''),
    html,
    origin: 'custom',
    id: Number(raw.id ?? raw.Id ?? 0) || undefined,
  };
}

export async function saveCustomBlock(payload: SaveCustomBlockInput, portalId?: number): Promise<BlockDef | null> {
  try {
    const url = withPortalId(`${getApiBase()}/Designer/SaveBlock`, portalId);
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    const def = normalizeCustomBlock(data);
    if (def) {
      customFetched = false; // force reload next time
    }
    return def;
  } catch { return null; }
}

export async function deleteCustomBlock(id: number, portalId?: number): Promise<boolean> {
  if (!id) return false;
  try {
    const url = withPortalId(`${getApiBase()}/Designer/DeleteBlock?id=${encodeURIComponent(String(id))}`, portalId);
    const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: headers() });
    if (r.ok) { customFetched = false; return true; }
    return false;
  } catch { return false; }
}

export interface SaveCustomBlockInput {
  key: string;          // user-visible key (slug)
  name: string;
  category: BlockCategory;
  zone: string;
  html: string;
  help?: string;
}

export function getAllBlocks(): BlockDef[] {
  return [...BUILTIN_BLOCKS, ...customCache];
}

export function findBlock(key: string): BlockDef | null {
  return getAllBlocks().find((b) => b.key === key) || null;
}
