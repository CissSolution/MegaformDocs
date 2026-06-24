/**
 * Layout Designer — token resolution against mock or live SQL data.
 *
 * Tokens supported by the runtime listview engine:
 *   {{row:Column}}     — value from current loop row
 *   {{qs:param}}       — query-string parameter
 *   {{meta:key}}       — module / form metadata
 *
 * The designer renders blocks against the FIRST mock row by default, but
 * row-zone blocks render with each mock row so the admin sees the loop
 * effect. Token misses render as `[Column?]` so issues are visible.
 */

import type { SqlPreviewResult, SqlPreviewSource } from './types';

const TOKEN_RE = /\{\{\s*(row|qs|meta)\s*:\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const DEFAULT_QS: Record<string, string> = {
  page: '1',
  size: '10',
  search: '',
  status: '',
};

const DEFAULT_META: Record<string, string> = {
  portalId: '0',
  formId: '0',
  viewName: 'Demo View',
  page: '1',
  pageCount: '5',
  rowsOnPage: '0',
  totalRows: '0',
};

export function resolveTokens(
  html: string,
  row: Record<string, any> | null,
  qs: Record<string, string> = DEFAULT_QS,
  meta: Record<string, string> = DEFAULT_META,
): string {
  return html.replace(TOKEN_RE, (full, kind, key) => {
    const k = String(key);
    if (kind === 'row') {
      if (!row) return `[${k}?]`;
      const value = row[k];
      if (value == null) return `[${k}?]`;
      return escapeHtml(String(value));
    }
    if (kind === 'qs') return escapeHtml(qs[k] || '');
    if (kind === 'meta') return escapeHtml(meta[k] || '');
    return full;
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ────────────────────────────────────────────────────────────────────────────
//  Mock data — stored per (widget, fieldKey) in localStorage so reopens
//  show the same preview rows.
// ────────────────────────────────────────────────────────────────────────────

const CACHE_KEY = 'mf:layout-designer:mock-cache:v1';

interface CacheShape {
  [scope: string]: SqlPreviewResult & { ts: number };
}

function readCache(): CacheShape {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeCache(c: CacheShape): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota */ }
}

export function getCachedMock(scopeKey: string): SqlPreviewResult | null {
  const c = readCache();
  const hit = c[scopeKey];
  if (!hit) return null;
  return { columns: hit.columns, rows: hit.rows, error: hit.error };
}

export function setCachedMock(scopeKey: string, result: SqlPreviewResult): void {
  const c = readCache();
  c[scopeKey] = { ...result, ts: Date.now() };
  writeCache(c);
}

export async function fetchMockRows(
  scopeKey: string,
  source: SqlPreviewSource | undefined,
  topN: number,
): Promise<SqlPreviewResult> {
  if (source && typeof source.fetchTopRows === 'function') {
    try {
      const result = await source.fetchTopRows(topN);
      if (result && Array.isArray(result.rows) && result.rows.length) {
        setCachedMock(scopeKey, result);
        return result;
      }
      if (result && result.error) return result;
    } catch (err) {
      return { columns: [], rows: [], error: err instanceof Error ? err.message : String(err) };
    }
  }
  const cached = getCachedMock(scopeKey);
  if (cached && cached.rows.length) return cached;
  return staticFallback();
}

function staticFallback(): SqlPreviewResult {
  return {
    columns: ['TabID', 'TabName', 'Title', 'ParentId'],
    rows: [
      { TabID: 21, TabName: 'Home',     Title: 'Trang chủ',        ParentId: 0 },
      { TabID: 22, TabName: 'About',    Title: 'Giới thiệu',       ParentId: 0 },
      { TabID: 23, TabName: 'Services', Title: 'Dịch vụ',          ParentId: 0 },
      { TabID: 24, TabName: 'Blog',     Title: 'Tin tức & bài viết', ParentId: 0 },
      { TabID: 25, TabName: 'Contact',  Title: 'Liên hệ',          ParentId: 0 },
    ],
  };
}
