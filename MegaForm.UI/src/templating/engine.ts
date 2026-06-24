// ============================================================
// MegaForm Templating - Shared template renderer
//
// Supports:
//   - {{source:key}}
//   - {{source:key|format=yyyy-MM-dd}}
//   - <mf-repeat each="item in source:key">...</mf-repeat>
//
// This keeps template parsing host-agnostic so DNN and Oqtane both rely on
// the same browser-side rendering rules.
// ============================================================

import { escapeForToken, formatValue, LookUpEngine, type ILookUp } from './lookup';

const TOKEN_RX = /\{\{\s*([a-zA-Z0-9_-]+)\s*:\s*([^}|]+?)(?:\|format\s*=\s*([^}]+?))?\s*\}\}/g;
const EACH_ATTR_RX = /\beach\s*=\s*(['"])([\s\S]*?)\1/i;
const EACH_EXPR_RX = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s+in\s+(.+)$/;

interface RepeatBlock {
  start: number;
  end: number;
  openTag: string;
  inner: string;
}

interface SourceExpression {
  sourceName: string;
  keyPath: string;
}

interface RepeatExpression extends SourceExpression {
  itemName: string;
}

interface RepeatState {
  index: number;
  total: number;
}

export const TEMPLATE_ENGINE_BADGE = 'TemplateEngine v20260508-09';
if (typeof window !== 'undefined') (window as any).__MF_TEMPLATE_ENGINE_BADGE__ = TEMPLATE_ENGINE_BADGE;

export function renderTemplateWithLookups(template: string, engine: LookUpEngine): string {
  if (!template) return '';
  const afterRepeats = renderRepeats(template, engine);
  return afterRepeats.replace(TOKEN_RX, (full, sourceName: string, keyPath: string, rawFormat?: string) => {
    const source = String(sourceName || '').trim();
    if (!engine.has(source)) return full;
    const key = String(keyPath || '').trim();
    const format = normalizeFormat(rawFormat);
    return engine.resolve(source, key, format);
  });
}

function renderRepeats(template: string, engine: LookUpEngine): string {
  let output = template;
  for (;;) {
    const block = findNextRepeatBlock(output);
    if (!block) return output;
    const rendered = renderRepeatBlock(block, engine);
    output = output.slice(0, block.start) + rendered + output.slice(block.end);
  }
}

function renderRepeatBlock(block: RepeatBlock, engine: LookUpEngine): string {
  const parsed = parseRepeatExpression(block.openTag);
  if (!parsed) return '';
  const rawItems = engine.resolveRaw(parsed.sourceName, parsed.keyPath);
  const items = normalizeCollection(rawItems);
  if (!items.length) return '';

  return items.map((item, index) => {
    const child = engine.fork([
      createRepeatItemLookUp(parsed.itemName, item),
      createRepeatMetaLookUp(index, items.length),
    ]);
    return renderTemplateWithLookups(block.inner, child);
  }).join('');
}

function parseRepeatExpression(openTag: string): RepeatExpression | null {
  const attrMatch = EACH_ATTR_RX.exec(openTag);
  if (!attrMatch) return null;
  const expr = String(attrMatch[2] || '').trim();
  const match = EACH_EXPR_RX.exec(expr);
  if (!match) return null;
  const itemName = String(match[1] || '').trim();
  const sourceExpr = parseSourceExpression(match[2] || '');
  if (!itemName || !sourceExpr) return null;
  return { itemName, ...sourceExpr };
}

function parseSourceExpression(expr: string): SourceExpression | null {
  const trimmed = String(expr || '').trim();
  if (!trimmed) return null;
  const colon = trimmed.indexOf(':');
  if (colon < 0) return { sourceName: trimmed, keyPath: '' };
  return {
    sourceName: trimmed.slice(0, colon).trim(),
    keyPath: trimmed.slice(colon + 1).trim(),
  };
}

function normalizeFormat(rawFormat?: string): string | undefined {
  const trimmed = String(rawFormat || '').trim();
  if (!trimmed) return undefined;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === 'string') return [];
  if (typeof value === 'object') {
    const iterable = value as { [Symbol.iterator]?: () => Iterator<unknown> };
    if (typeof iterable[Symbol.iterator] === 'function') return Array.from(iterable as Iterable<unknown>);
  }
  return [];
}

function createRepeatItemLookUp(name: string, item: unknown): ILookUp {
  return {
    name,
    get(key, format) {
      const value = resolveRepeatItemValue(item, key);
      return renderRepeatTokenValue(value, format);
    },
    getRaw(key) {
      return resolveRepeatItemValue(item, key);
    },
  };
}

function createRepeatMetaLookUp(index: number, total: number): ILookUp {
  const state: RepeatState = { index, total };
  return {
    name: 'repeat',
    get(key, format) {
      const value = resolveRepeatMetaValue(state, key);
      return renderRepeatTokenValue(value, format);
    },
    getRaw(key) {
      return resolveRepeatMetaValue(state, key);
    },
  };
}

function resolveRepeatItemValue(item: unknown, keyPath: string): unknown {
  const path = String(keyPath || '').trim();
  if (!path || path.toLowerCase() === 'value' || path.toLowerCase() === 'item') return item;
  return resolvePath(item, splitKeyPath(path));
}

function resolveRepeatMetaValue(state: RepeatState, key: string): string | number {
  switch (String(key || '').trim().toLowerCase()) {
    case 'index': return state.index;
    case 'index1': return state.index + 1;
    case 'count': return state.total;
    case 'alternator2': return state.index % 2;
    case 'alternator3': return state.index % 3;
    case 'alternator4': return state.index % 4;
    case 'alternator5': return state.index % 5;
    case 'isfirst': return state.index === 0 ? 'First' : '';
    case 'islast': return state.index === state.total - 1 ? 'Last' : '';
    default: return '';
  }
}

function stringifyRepeatValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((entry) => stringifyRepeatValue(entry)).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function renderRepeatTokenValue(value: unknown, format?: string): string {
  if (value == null) return '';
  if (Array.isArray(value)) return escapeForToken(value.map((entry) => stringifyRepeatValue(entry)).filter(Boolean).join(', '));
  if (typeof value === 'object' && !(value instanceof Date)) return escapeForToken(stringifyRepeatValue(value));
  return escapeForToken(formatValue(value, format));
}

function splitKeyPath(keyPath: string): string[] {
  return String(keyPath || '')
    .split(':')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function resolvePath(value: unknown, segments: string[]): unknown {
  let current: unknown = value;
  for (const segment of segments) {
    current = readPathSegment(current, segment);
    if (current == null) return current;
  }
  return current;
}

function readPathSegment(value: unknown, segment: string): unknown {
  if (value == null || !segment) return undefined;
  if (Array.isArray(value) && /^[0-9]+$/.test(segment)) {
    const index = parseInt(segment, 10);
    return index >= 0 && index < value.length ? value[index] : undefined;
  }
  if (typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, segment)) return record[segment];
  const lowered = segment.toLowerCase();
  const match = Object.keys(record).find((key) => key.toLowerCase() === lowered);
  return match ? record[match] : undefined;
}

function findNextRepeatBlock(template: string): RepeatBlock | null {
  const lower = template.toLowerCase();
  const stack: Array<{ start: number; tagEnd: number; openTag: string }> = [];
  let cursor = 0;

  while (cursor < template.length) {
    const openIdx = lower.indexOf('<mf-repeat', cursor);
    const closeIdx = lower.indexOf('</mf-repeat', cursor);

    if (openIdx < 0 && closeIdx < 0) return null;

    if (openIdx >= 0 && (closeIdx < 0 || openIdx < closeIdx)) {
      const tagEnd = findTagEnd(template, openIdx);
      if (tagEnd < 0) return null;
      stack.push({
        start: openIdx,
        tagEnd,
        openTag: template.slice(openIdx, tagEnd + 1),
      });
      cursor = tagEnd + 1;
      continue;
    }

    const closeEnd = lower.indexOf('>', closeIdx);
    if (closeEnd < 0) return null;
    const open = stack.pop();
    if (!open) {
      cursor = closeEnd + 1;
      continue;
    }
    return {
      start: open.start,
      end: closeEnd + 1,
      openTag: open.openTag,
      inner: template.slice(open.tagEnd + 1, closeIdx),
    };
  }

  return null;
}

function findTagEnd(template: string, start: number): number {
  let quote = '';
  for (let i = start; i < template.length; i++) {
    const ch = template[i];
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i;
  }
  return -1;
}
