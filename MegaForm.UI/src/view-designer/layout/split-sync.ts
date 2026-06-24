/**
 * Layout Designer — anchor-comment parser and serializer.
 *
 * The Visual canvas operates on a LayoutTree, but the canonical persisted
 * value is the raw HTML string. We mark block boundaries with comments:
 *
 *   <!-- mf:zone name="rows" loop="true" -->
 *     <!-- mf:block id="row-1" type="table-row" columns="3" -->
 *       <tr><td>{{row:TabName}}</td></tr>
 *     <!-- /mf:block -->
 *   <!-- /mf:zone -->
 *
 * Anything outside these markers is preserved as `manualPrefix` /
 * `manualSuffix` / zone `interstitials` and never rewritten. This is the
 * "don't clobber hand-tuned HTML" rule — power users editing the Code
 * pane outside anchors keep their work.
 */

import type {
  BlockInstance,
  LayoutTree,
  LayoutZone,
  LayoutZoneId,
  ParseResult,
} from './types';

const ZONE_OPEN_RE = /<!--\s*mf:zone\s+([^>]*?)-->/g;
const ZONE_CLOSE_RE = /<!--\s*\/mf:zone\s*-->/g;
const BLOCK_OPEN_RE = /<!--\s*mf:block\s+([^>]*?)-->/g;
const BLOCK_CLOSE_RE = /<!--\s*\/mf:block\s*-->/g;

let uidCounter = 1;
function nextUid(): string { return 'b' + (uidCounter++).toString(36); }

const ZONE_IDS: LayoutZoneId[] = ['header', 'rows', 'pager', 'empty'];

export function emptyTree(): LayoutTree {
  return {
    zones: {
      header: emptyZone('header', false),
      rows:   emptyZone('rows',   true),
      pager:  emptyZone('pager',  false),
      empty:  emptyZone('empty',  false),
    },
    manualPrefix: '',
    manualSuffix: '',
  };
}

function emptyZone(id: LayoutZoneId, loop: boolean): LayoutZone {
  return { id, loop, blocks: [], interstitials: [''] };
}

// ────────────────────────────────────────────────────────────────────────────
//  Attribute parser — accepts both quote styles, no escape handling needed
//  because the HTML is already a comment payload (no nested quotes).
// ────────────────────────────────────────────────────────────────────────────

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out[m[1]] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
  }
  return out;
}

function attrsToString(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .filter(([k, v]) => k && v != null)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join(' ');
}

// ────────────────────────────────────────────────────────────────────────────
//  Parse HTML → LayoutTree
// ────────────────────────────────────────────────────────────────────────────

export function parseHtmlToTree(html: string): ParseResult {
  uidCounter = 1;
  const warnings: string[] = [];
  const tree = emptyTree();

  if (!html || !html.trim()) {
    return { ok: true, tree, warnings };
  }

  // Find first zone marker — text before is manualPrefix
  const firstZoneOpen = findFirst(html, /<!--\s*mf:zone\s/);
  if (firstZoneOpen < 0) {
    // No zones — everything is manualPrefix; Visual will be read-only.
    tree.manualPrefix = html;
    warnings.push('No <!-- mf:zone --> markers found. Visual mode is read-only.');
    return { ok: true, tree, warnings };
  }

  tree.manualPrefix = html.slice(0, firstZoneOpen);

  let cursor = firstZoneOpen;
  while (cursor < html.length) {
    ZONE_OPEN_RE.lastIndex = cursor;
    const zoneOpen = ZONE_OPEN_RE.exec(html);
    if (!zoneOpen || zoneOpen.index !== cursor) {
      // Text between zones is treated as manualSuffix only at end; mid
      // gaps get appended to next zone's manualPrefix? Keep simple:
      // anything outside zones after first zone goes into manualSuffix at
      // the very end.
      break;
    }
    const openEnd = ZONE_OPEN_RE.lastIndex;
    const attrs = parseAttrs(zoneOpen[1]);
    const zoneIdRaw = String(attrs['name'] || '').trim().toLowerCase();
    const zoneId = (ZONE_IDS.includes(zoneIdRaw as LayoutZoneId) ? zoneIdRaw : 'rows') as LayoutZoneId;
    const loop = attrs['loop'] === 'true';
    if (zoneIdRaw && !ZONE_IDS.includes(zoneIdRaw as LayoutZoneId)) {
      warnings.push(`Unknown zone "${zoneIdRaw}" — treated as rows.`);
    }

    // Find matching </mf:zone>
    ZONE_CLOSE_RE.lastIndex = openEnd;
    const zoneClose = ZONE_CLOSE_RE.exec(html);
    if (!zoneClose) {
      warnings.push(`Zone "${zoneId}" missing closing tag — rest of doc absorbed.`);
      tree.zones[zoneId] = parseZoneBody(zoneId, loop, html.slice(openEnd));
      cursor = html.length;
      break;
    }
    const body = html.slice(openEnd, zoneClose.index);
    tree.zones[zoneId] = parseZoneBody(zoneId, loop, body);
    cursor = zoneClose.index + zoneClose[0].length;
  }

  if (cursor < html.length) {
    tree.manualSuffix = html.slice(cursor);
  }

  return { ok: true, tree, warnings };
}

function parseZoneBody(id: LayoutZoneId, loop: boolean, body: string): LayoutZone {
  const blocks: BlockInstance[] = [];
  const interstitials: string[] = [];

  let cursor = 0;
  BLOCK_OPEN_RE.lastIndex = 0;
  while (cursor < body.length) {
    BLOCK_OPEN_RE.lastIndex = cursor;
    const blockOpen = BLOCK_OPEN_RE.exec(body);
    if (!blockOpen) {
      interstitials.push(body.slice(cursor));
      break;
    }
    interstitials.push(body.slice(cursor, blockOpen.index));
    const openEnd = BLOCK_OPEN_RE.lastIndex;
    const attrs = parseAttrs(blockOpen[1]);
    const blockKey = String(attrs['type'] || '').trim();
    delete attrs['type'];
    BLOCK_CLOSE_RE.lastIndex = openEnd;
    const blockClose = BLOCK_CLOSE_RE.exec(body);
    if (!blockClose) {
      blocks.push({ uid: nextUid(), blockKey, attrs, innerHtml: body.slice(openEnd) });
      cursor = body.length;
      break;
    }
    const inner = body.slice(openEnd, blockClose.index);
    blocks.push({ uid: nextUid(), blockKey, attrs, innerHtml: inner });
    cursor = blockClose.index + blockClose[0].length;
  }

  if (interstitials.length === blocks.length) interstitials.push('');
  return { id, loop, blocks, interstitials };
}

// ────────────────────────────────────────────────────────────────────────────
//  Serialize LayoutTree → HTML
// ────────────────────────────────────────────────────────────────────────────

export function serializeTreeToHtml(tree: LayoutTree): string {
  const parts: string[] = [];
  if (tree.manualPrefix) parts.push(tree.manualPrefix);
  for (const id of ZONE_IDS) {
    const zone = tree.zones[id];
    if (!zone || (!zone.blocks.length && !zoneHasInterstitialContent(zone))) continue;
    parts.push(serializeZone(zone));
  }
  if (tree.manualSuffix) parts.push(tree.manualSuffix);
  return parts.join('');
}

function zoneHasInterstitialContent(zone: LayoutZone): boolean {
  return zone.interstitials.some((segment) => segment && segment.trim().length > 0);
}

function serializeZone(zone: LayoutZone): string {
  const opener = `<!-- mf:zone name="${zone.id}"${zone.loop ? ' loop="true"' : ''} -->`;
  const closer = '<!-- /mf:zone -->';
  const inner: string[] = [];
  for (let i = 0; i < zone.blocks.length; i += 1) {
    inner.push(zone.interstitials[i] || '');
    inner.push(serializeBlock(zone.blocks[i]));
  }
  inner.push(zone.interstitials[zone.blocks.length] || '');
  return `${opener}\n${inner.join('')}\n${closer}\n`;
}

function serializeBlock(block: BlockInstance): string {
  const attrsRaw = { type: block.blockKey, ...block.attrs };
  const opener = `<!-- mf:block ${attrsToString(attrsRaw)} -->`;
  const closer = '<!-- /mf:block -->';
  return `${opener}${block.innerHtml}${closer}`;
}

function findFirst(text: string, re: RegExp): number {
  const m = re.exec(text);
  return m ? m.index : -1;
}

// Test helper exported so layout-designer can wrap blocks added through the
// tray into a fresh BlockInstance with anchor wiring.
export function newBlockInstance(blockKey: string, html: string, attrs: Record<string, string> = {}): BlockInstance {
  return { uid: nextUid(), blockKey, attrs, innerHtml: html };
}
