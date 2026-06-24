/**
 * Layout Designer v2 — state ↔ HTML serializer
 *
 * The widget's persisted value is still a single HTML string (so existing
 * splitBackToFields / parseHtmlToTree / runtime listview engine keep
 * working). For v2 we round-trip a structured state by embedding a JSON
 * snapshot as a leading comment block:
 *
 *   <!-- mf:ld-v2 {"layout":{...},"advancedHtml":""} -->
 *   <!-- mf:zone name="header" -->
 *     <!-- mf:block id="b1" type="page-title" -->...rendered html...<!-- /mf:block -->
 *   <!-- /mf:zone -->
 *   ...
 *
 * On reload we look for the leading `mf:ld-v2` comment. If present we
 * rehydrate the typed state. If absent (legacy v1 templates / hand-edited
 * HTML) we return null and the caller shows the welcome screen.
 *
 * For runtime rendering, the rows-zone HTML is wrapped by the existing
 * listview engine's row-loop machinery (it scans <!-- mf:zone name="rows"
 * loop="true" --> and repeats the inner block per row).
 */

import type { LayoutZoneId } from './types';
import type { BlockInstanceV2 } from './templates-v2';
import { renderBlockHtml } from './blocks-v2';

const ZONE_IDS: LayoutZoneId[] = ['header', 'rows', 'pager', 'empty'];

export interface DesignerStateV2 {
  layout: Record<LayoutZoneId, BlockInstanceV2[]>;
  /** Optional power-user override; when non-empty, replaces serialized HTML. */
  advancedHtml?: string;
  templateKey?: string;
}

export function emptyState(): DesignerStateV2 {
  return {
    layout: { header: [], rows: [], pager: [], empty: [] },
    advancedHtml: '',
    templateKey: '',
  };
}

// ───────────────────────────────────────────────────────────────────────
//  Serialize: state → HTML
// ───────────────────────────────────────────────────────────────────────

export function serializeStateToHtml(state: DesignerStateV2): string {
  if (state.advancedHtml && state.advancedHtml.trim()) {
    return wrapWithStateComment(state, state.advancedHtml);
  }

  const parts: string[] = [];
  ZONE_IDS.forEach((zoneId) => {
    const blocks = state.layout[zoneId] || [];
    const loop = zoneId === 'rows' ? ' loop="true"' : '';
    parts.push(`<!-- mf:zone name="${zoneId}"${loop} -->`);
    blocks.forEach((b) => {
      const html = renderBlockHtml(b.blockKey, b.props);
      parts.push(`<!-- mf:block id="${b.uid}" type="${escapeAttr(b.blockKey)}" -->${html}<!-- /mf:block -->`);
    });
    parts.push(`<!-- /mf:zone -->`);
  });

  return wrapWithStateComment(state, parts.join('\n'));
}

function wrapWithStateComment(state: DesignerStateV2, body: string): string {
  // The state JSON lets us round-trip on next open. We strip rendered HTML
  // from each block before serializing — only blockKey + props matter.
  const slim = {
    templateKey: state.templateKey || '',
    layout: ZONE_IDS.reduce((acc, z) => {
      acc[z] = (state.layout[z] || []).map((b) => ({ uid: b.uid, blockKey: b.blockKey, props: b.props }));
      return acc;
    }, {} as Record<string, any>),
    advancedHtml: state.advancedHtml || '',
  };
  const json = JSON.stringify(slim).replace(/-->/g, '--&gt;'); // belt-and-braces
  return `<!-- mf:ld-v2 ${json} -->\n${body}`;
}

// ───────────────────────────────────────────────────────────────────────
//  Deserialize: HTML → state (or null when no v2 marker)
// ───────────────────────────────────────────────────────────────────────

const LD_V2_RE = /<!--\s*mf:ld-v2\s+(\{[\s\S]*?\})\s*-->/;

export function tryParseV2(html: string): DesignerStateV2 | null {
  const m = LD_V2_RE.exec(html || '');
  if (!m) return null;
  try {
    const raw = m[1].replace(/--&gt;/g, '-->');
    const obj = JSON.parse(raw);
    const out: DesignerStateV2 = {
      layout: { header: [], rows: [], pager: [], empty: [] },
      advancedHtml: String(obj.advancedHtml || ''),
      templateKey: String(obj.templateKey || ''),
    };
    ZONE_IDS.forEach((z) => {
      const arr = Array.isArray(obj.layout?.[z]) ? obj.layout[z] : [];
      out.layout[z] = arr.map((b: any, i: number) => ({
        uid: String(b.uid || `bi_${z}_${i}_${Date.now().toString(36)}`),
        blockKey: String(b.blockKey || ''),
        props: typeof b.props === 'object' && b.props ? b.props : {},
      })).filter((b: BlockInstanceV2) => !!b.blockKey);
    });
    return out;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────
//  Legacy hydrator — when no `mf:ld-v2` marker exists but the input has
//  legacy `<!-- mf:zone -->` markers (e.g. forms created by the AI
//  assistant or v1 designer), parse those zones and surface the existing
//  template content as a single `raw-html` block per zone. Otherwise the
//  rows canvas would silently appear empty and the admin would believe
//  nothing was there to design.
// ───────────────────────────────────────────────────────────────────────

const LEGACY_ZONE_RE  = /<!--\s*mf:zone\s+([^>]*?)-->([\s\S]*?)<!--\s*\/mf:zone\s*-->/g;
const LEGACY_BLOCK_RE = /<!--\s*mf:block[^>]*?-->([\s\S]*?)<!--\s*\/mf:block\s*-->/g;

export function tryHydrateLegacyZones(html: string): DesignerStateV2 | null {
  const src = String(html || '');
  if (!/<!--\s*mf:zone\s/.test(src)) return null;
  const out: DesignerStateV2 = {
    layout: { header: [], rows: [], pager: [], empty: [] },
    advancedHtml: '',
    templateKey: '',
  };
  LEGACY_ZONE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let hydrated = false;
  while ((m = LEGACY_ZONE_RE.exec(src)) !== null) {
    const attrs = m[1] || '';
    const body  = m[2] || '';
    const nameMatch = /name\s*=\s*"([^"]+)"/.exec(attrs);
    if (!nameMatch) continue;
    const name = nameMatch[1].toLowerCase() as LayoutZoneId;
    if (!ZONE_IDS.includes(name)) continue;
    // Concatenate inner block bodies; if none, fall back to raw body text.
    let inner = '';
    LEGACY_BLOCK_RE.lastIndex = 0;
    let bm: RegExpExecArray | null;
    while ((bm = LEGACY_BLOCK_RE.exec(body)) !== null) inner += bm[1];
    if (!inner) inner = body.trim();
    if (!inner.trim()) continue;
    out.layout[name].push({
      uid: `bi_legacy_${name}_${Date.now().toString(36)}_${Math.floor(Math.random()*9999).toString(36)}`,
      blockKey: 'raw-html',
      props: { html: inner },
    });
    hydrated = true;
  }
  return hydrated ? out : null;
}

// ───────────────────────────────────────────────────────────────────────
//  Mock-data token resolver — for Visual canvas preview only
// ───────────────────────────────────────────────────────────────────────

const TOKEN_RE_VISUAL = /\{\{\s*(row|meta|qs)\s*:\s*([a-zA-Z0-9_-]+)\s*\}\}/g;

/** Resolve {{row:X}} / {{meta:X}} / {{qs:X}} against mock data — Visual canvas only.
 *  Attribute-aware: when a token sits inside src="..." / href="..." / url(...)
 *  we return a placeholder string instead of HTML markup so the attribute
 *  stays parseable. Otherwise missing values render as a muted placeholder. */
export function resolveMockTokens(html: string, row: Record<string, any>, meta: Record<string, any>): string {
  const src = String(html || '');
  // Track attribute context per match by scanning a small window before each match.
  return src.replace(TOKEN_RE_VISUAL, (_m, ns, key, offset: number) => {
    const inAttr = isInsideAttribute(src, offset);
    let value: any;
    if (ns === 'row')  value = row[key];
    else if (ns === 'meta') value = meta[key];
    else value = '';
    if (value != null && value !== '') return String(value);
    if (inAttr) {
      // Placeholder appropriate for URL-like attributes
      if (ns === 'row' && /url|img|src|href|cover|photo|avatar/i.test(key)) {
        return `https://placehold.co/400x240/eef2ff/6366f1?text=${encodeURIComponent(key)}`;
      }
      return `[${key}]`;
    }
    return `<em style="color:#cbd5e1;font-style:normal;">[${key}]</em>`;
  });
}

function isInsideAttribute(src: string, offset: number): boolean {
  // Walk back from offset; if we hit a `"` before any `>`, we're inside an attr value.
  for (let i = offset - 1; i >= 0 && offset - i < 200; i--) {
    const c = src.charCodeAt(i);
    if (c === 62 /* > */) return false;
    if (c === 34 /* " */ || c === 39 /* ' */) {
      // Check what's before the quote — should be `=` after optional whitespace
      let j = i - 1;
      while (j >= 0 && (src.charCodeAt(j) === 32 || src.charCodeAt(j) === 9)) j--;
      return j >= 0 && src.charCodeAt(j) === 61 /* = */;
    }
  }
  return false;
}

function escapeAttr(s: string): string {
  return String(s || '').replace(/"/g, '&quot;');
}
