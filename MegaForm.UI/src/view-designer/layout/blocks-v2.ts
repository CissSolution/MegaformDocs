/**
 * Layout Designer v2 — Typed Block Library
 *
 * Each block is a typed PropDef[] schema + a renderHtml(props) function.
 * The Designer never asks the admin to write raw HTML — instead it shows
 * an auto-generated form (Title text, Image URL, Background color, etc.)
 * derived from the block's PropDef list, and rebuilds the HTML on every
 * property change.
 *
 * Raw HTML is still available behind an "Advanced HTML" toggle for power
 * users, but it's no longer the default editing surface.
 *
 * This file replaces blocks-builtin.ts. Old anchor-comment grammar stays
 * compatible: each block emits {{row:X}} / {{qs:X}} / {{meta:X}} tokens
 * the runtime listview engine already understands.
 */

import type { LayoutZoneId } from './types';

export type PropType = 'text' | 'textarea' | 'number' | 'url' | 'image' | 'color' | 'select' | 'token' | 'check' | 'icon';

export interface PropDef {
  key: string;
  label: string;
  type: PropType;
  default: any;
  help?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  tokens?: string[];          // suggested tokens for `token` editor
  group?: string;             // visual grouping in inspector form
  showWhen?: (props: any) => boolean;
}

export interface BlockDefV2 {
  key: string;
  label: string;
  category: 'header' | 'row' | 'pager' | 'empty';
  zone: LayoutZoneId | 'any';
  icon: string;               // unicode/emoji or FA class
  iconColor?: string;
  description?: string;
  props: PropDef[];
  /** Render block HTML from current props (tokens NOT resolved — runtime does that). */
  renderHtml: (props: Record<string, any>) => string;
  /** Thumbnail HTML rendered with default props + sample row, ~120x60 in tray. */
  thumbnail?: (props: Record<string, any>) => string;
}

// ───────────────────────────────────────────────────────────────────────
//  HEADER blocks
// ───────────────────────────────────────────────────────────────────────

const pageTitle: BlockDefV2 = {
  key: 'page-title',
  label: 'Page title',
  category: 'header',
  zone: 'header',
  icon: 'fa-heading',
  iconColor: '#6366f1',
  description: 'H1 title + portal/search subline.',
  props: [
    { key: 'title',     label: 'Title',         type: 'text',     default: '{{meta:viewName}}',       tokens: ['{{meta:viewName}}', '{{meta:portalId}}'], help: 'Supports meta:viewName / qs:search tokens.' },
    { key: 'subtitle',  label: 'Subline',       type: 'text',     default: 'Portal {{meta:portalId}}', tokens: ['{{meta:portalId}}', '{{qs:search}}'] },
    { key: 'align',     label: 'Align',         type: 'select',   default: 'left', options: [{value:'left',label:'Left'},{value:'center',label:'Center'},{value:'right',label:'Right'}] },
    { key: 'size',      label: 'Font size',     type: 'select',   default: 'lg', options: [{value:'md',label:'Medium'},{value:'lg',label:'Large'},{value:'xl',label:'Huge'}] },
  ],
  renderHtml: (p) => {
    const sizeMap: any = { md: '18px', lg: '24px', xl: '32px' };
    return `<h1 class="mf-grid-title" style="text-align:${p.align};font-size:${sizeMap[p.size]||'24px'};margin:0 0 6px;">${p.title || ''}${p.subtitle ? ` <span class="mf-grid-portal-hint" style="font-size:12px;color:#94a3b8;font-weight:400;margin-left:8px;">${p.subtitle}</span>` : ''}</h1>`;
  },
};

const searchBar: BlockDefV2 = {
  key: 'search-bar',
  label: 'Search box',
  category: 'header',
  zone: 'header',
  icon: 'fa-search',
  iconColor: '#0ea5e9',
  description: 'GET form, submit to filter SQL via ?search=…',
  props: [
    { key: 'placeholder',  label: 'Placeholder',     type: 'text', default: 'Search…' },
    { key: 'buttonText',   label: 'Button text',     type: 'text', default: 'Search' },
    { key: 'paramName',    label: 'Query param name', type: 'text', default: 'search', help: 'SQL receives this value as :search.' },
  ],
  renderHtml: (p) => `<form class="mf-grid-search" method="get" role="search" style="display:flex;gap:6px;">
  <input type="search" name="${p.paramName}" value="{{qs:${p.paramName}}}" placeholder="${p.placeholder}" class="mf-grid-search-input" style="flex:1;padding:7px 11px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;" />
  <button type="submit" class="mf-grid-search-btn" style="padding:7px 16px;border:0;background:#6366f1;color:#fff;border-radius:8px;font-weight:600;cursor:pointer;">${p.buttonText}</button>
</form>`,
};

const actionBar: BlockDefV2 = {
  key: 'action-bar',
  label: 'Action bar',
  category: 'header',
  zone: 'header',
  icon: 'fa-bolt',
  iconColor: '#f59e0b',
  description: '2 buttons: Add + Export CSV; links are customizable.',
  props: [
    { key: 'primaryText',  label: 'Primary button',         type: 'text', default: '+ Add new' },
    { key: 'primaryHref',  label: 'Primary link',           type: 'url',  default: '?action=add' },
    { key: 'secondaryText',label: 'Secondary button',       type: 'text', default: 'Export CSV' },
    { key: 'secondaryHref',label: 'Secondary link',         type: 'url',  default: '?export=csv' },
    { key: 'align',        label: 'Align',                  type: 'select', default: 'right', options: [{value:'left',label:'Left'},{value:'center',label:'Center'},{value:'right',label:'Right'}] },
  ],
  renderHtml: (p) => `<div class="mf-grid-actions" style="display:flex;gap:8px;justify-content:${p.align==='center'?'center':p.align==='left'?'flex-start':'flex-end'};">
  <a class="mf-grid-btn mf-grid-btn-primary" href="${p.primaryHref}" style="padding:7px 14px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">${p.primaryText}</a>
  <a class="mf-grid-btn" href="${p.secondaryHref}" style="padding:7px 14px;border:1px solid #cbd5e1;color:#1f2a44;border-radius:8px;text-decoration:none;font-size:13px;">${p.secondaryText}</a>
</div>`,
};

const filterPills: BlockDefV2 = {
  key: 'filter-pills',
  label: 'Quick filters',
  category: 'header',
  zone: 'header',
  icon: 'fa-filter',
  iconColor: '#a855f7',
  description: '3-5 pill filters; each pill is a link with a query param.',
  props: [
    { key: 'paramName', label: 'Query param name', type: 'text', default: 'status' },
    { key: 'pillsCsv',  label: 'Pills (label|value per line)', type: 'textarea', default: 'All|\nActive|active\nDraft|draft', help: 'Each line: Label|value. Empty value = clear filter.' },
  ],
  renderHtml: (p) => {
    const pills = String(p.pillsCsv || '').split(/\r?\n/).filter(Boolean).map(line => {
      const [label, value] = line.split('|');
      const v = String(value || '').trim();
      const l = String(label || '').trim();
      return `<a class="mf-grid-pill" href="?${p.paramName}=${encodeURIComponent(v)}" style="padding:5px 12px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;color:#475569;font-size:12px;text-decoration:none;">${l}</a>`;
    }).join('');
    return `<div class="mf-grid-filters" style="display:flex;gap:6px;flex-wrap:wrap;">${pills}</div>`;
  },
};

// ───────────────────────────────────────────────────────────────────────
//  ROW blocks (looped per SQL row)
// ───────────────────────────────────────────────────────────────────────

const tableRow: BlockDefV2 = {
  key: 'table-row',
  label: 'Table row',
  category: 'row',
  zone: 'rows',
  icon: 'fa-grip-lines',
  iconColor: '#0ea5e9',
  description: 'One <tr> inside a classic table.',
  props: [
    { key: 'col1Label', label: 'Col 1 — header',  type: 'text', default: 'Tab Name', group: 'Column 1' },
    { key: 'col1Token', label: 'Col 1 — token',   type: 'token', default: '{{row:TabName}}', group: 'Column 1', tokens: ['{{row:TabName}}','{{row:Title}}','{{row:TabID}}'] },
    { key: 'col1Link',  label: 'Col 1 — link to', type: 'url',  default: '?id={{row:TabID}}', group: 'Column 1' },
    { key: 'col2Label', label: 'Col 2 — header',  type: 'text', default: 'Title', group: 'Column 2' },
    { key: 'col2Token', label: 'Col 2 — token',   type: 'token', default: '{{row:Title}}', group: 'Column 2' },
    { key: 'col3Label', label: 'Col 3 — header',  type: 'text', default: 'Parent', group: 'Column 3' },
    { key: 'col3Token', label: 'Col 3 — token',   type: 'token', default: '{{row:ParentId}}', group: 'Column 3' },
  ],
  renderHtml: (p) => `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${p.col1Link ? `<a href="${p.col1Link}" style="color:#6366f1;text-decoration:none;">${p.col1Token}</a>` : p.col1Token}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;">${p.col2Token}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#94a3b8;">${p.col3Token}</td>
</tr>`,
};

const cardItem: BlockDefV2 = {
  key: 'card-item',
  label: 'Card',
  category: 'row',
  zone: 'rows',
  icon: 'fa-id-card',
  iconColor: '#f97316',
  description: 'Card row with image + title + description.',
  props: [
    { key: 'imageToken', label: 'Image (URL token)', type: 'token', default: 'https://source.unsplash.com/random/400x240/?{{row:TabName}}', tokens: ['{{row:TabName}}'] },
    { key: 'titleToken', label: 'Title',             type: 'token', default: '{{row:TabName}}' },
    { key: 'bodyToken',  label: 'Body',              type: 'token', default: '{{row:Title}}' },
    { key: 'linkToken',  label: 'Link href',         type: 'url',   default: '?id={{row:TabID}}' },
    { key: 'cssClass',   label: 'CSS class',         type: 'text',  default: '' },
  ],
  renderHtml: (p) => `<article class="mf-grid-card ${p.cssClass}" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;transition:all .2s;">
  <img src="${p.imageToken}" alt="" style="width:100%;height:140px;object-fit:cover;display:block;" />
  <div style="padding:14px;">
    <h3 style="margin:0 0 6px;font-size:15px;font-weight:600;"><a href="${p.linkToken}" style="color:#0f172a;text-decoration:none;">${p.titleToken}</a></h3>
    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">${p.bodyToken}</p>
  </div>
</article>`,
};

const listItem: BlockDefV2 = {
  key: 'list-item',
  label: 'List item',
  category: 'row',
  zone: 'rows',
  icon: 'fa-list',
  iconColor: '#10b981',
  description: 'Flat list row, one line per row.',
  props: [
    { key: 'mainToken', label: 'Main text', type: 'token', default: '{{row:TabName}}' },
    { key: 'metaToken', label: 'Meta text', type: 'token', default: '{{row:Title}}' },
    { key: 'linkToken', label: 'Link',      type: 'url',   default: '?id={{row:TabID}}' },
  ],
  renderHtml: (p) => `<li style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px dashed #e2e8f0;list-style:none;">
  <a href="${p.linkToken}" style="font-weight:600;color:#0f172a;text-decoration:none;">${p.mainToken}</a>
  <span style="font-size:12px;color:#94a3b8;">${p.metaToken}</span>
</li>`,
};

const mediaRow: BlockDefV2 = {
  key: 'media-row',
  label: 'Media row',
  category: 'row',
  zone: 'rows',
  icon: 'fa-image',
  iconColor: '#ec4899',
  description: 'Flex row: thumbnail on the left + content on the right.',
  props: [
    { key: 'imageToken', label: 'Image URL', type: 'token', default: 'https://source.unsplash.com/random/100x70/?{{row:TabName}}' },
    { key: 'titleToken', label: 'Title',     type: 'token', default: '{{row:TabName}}' },
    { key: 'bodyToken',  label: 'Body',      type: 'token', default: '{{row:Title}}' },
    { key: 'linkToken',  label: 'Link',      type: 'url',   default: '?id={{row:TabID}}' },
  ],
  renderHtml: (p) => `<div style="display:flex;gap:14px;padding:12px 0;border-bottom:1px solid #f1f5f9;">
  <img src="${p.imageToken}" alt="" style="width:90px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;" />
  <div style="flex:1;min-width:0;">
    <a href="${p.linkToken}" style="display:block;font-weight:600;color:#0f172a;text-decoration:none;margin-bottom:4px;">${p.titleToken}</a>
    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.45;">${p.bodyToken}</p>
  </div>
</div>`,
};

const timelineItem: BlockDefV2 = {
  key: 'timeline-item',
  label: 'Timeline item',
  category: 'row',
  zone: 'rows',
  icon: 'fa-clock',
  iconColor: '#8b5cf6',
  description: 'Date column on the left + content on the right (blog-timeline style).',
  props: [
    { key: 'dateToken',  label: 'Date token', type: 'token', default: '{{row:PublishDate}}' },
    { key: 'titleToken', label: 'Title',      type: 'token', default: '{{row:TabName}}' },
    { key: 'bodyToken',  label: 'Body',       type: 'token', default: '{{row:Title}}' },
    { key: 'linkToken',  label: 'Link',       type: 'url',   default: '?id={{row:TabID}}' },
  ],
  renderHtml: (p) => `<article style="display:grid;grid-template-columns:120px 1fr;gap:18px;padding:14px;border-radius:10px;background:#fff;border:1px solid #e2e8f0;margin-bottom:10px;">
  <div style="font-size:13px;color:#94a3b8;font-weight:600;">${p.dateToken}</div>
  <div>
    <h3 style="margin:0 0 6px;font-size:16px;"><a href="${p.linkToken}" style="color:#0f172a;text-decoration:none;">${p.titleToken}</a></h3>
    <p style="margin:0;font-size:13px;color:#64748b;">${p.bodyToken}</p>
  </div>
</article>`,
};

// ───────────────────────────────────────────────────────────────────────
//  PAGER blocks
// ───────────────────────────────────────────────────────────────────────

const pagerNumeric: BlockDefV2 = {
  key: 'pager-numeric',
  label: 'Numeric pager',
  category: 'pager',
  zone: 'pager',
  icon: 'fa-list-ol',
  iconColor: '#64748b',
  description: 'Numeric pager — listview runtime fills the page numbers.',
  props: [
    { key: 'prevLabel', label: 'Previous label', type: 'text', default: '‹ Previous' },
    { key: 'nextLabel', label: 'Next label',     type: 'text', default: 'Next ›' },
  ],
  renderHtml: (p) => `<nav class="mf-grid-pager mf-grid-pager-numeric" data-mf-pager="numeric" style="display:flex;justify-content:center;gap:8px;padding:14px;">
  <span data-mf-pager-prev>${p.prevLabel}</span>
  <span data-mf-pager-pages></span>
  <span data-mf-pager-next>${p.nextLabel}</span>
</nav>`,
};

const pagerInfo: BlockDefV2 = {
  key: 'pager-info',
  label: 'Pager X / Y',
  category: 'pager',
  zone: 'pager',
  icon: 'fa-info-circle',
  iconColor: '#64748b',
  description: 'Text-only: "Showing 10/256 rows · page 1/5".',
  props: [
    { key: 'template', label: 'Display template', type: 'token',
      default: 'Showing {{meta:rowsOnPage}}/{{meta:totalRows}} rows · page {{meta:page}}/{{meta:pageCount}}',
      help: 'Tokens: {{meta:rowsOnPage}}, {{meta:totalRows}}, {{meta:page}}, {{meta:pageCount}}' },
  ],
  renderHtml: (p) => `<div class="mf-grid-pager-info" style="font-size:13px;color:#64748b;padding:10px 14px;text-align:center;">${p.template}</div>`,
};

const pagerPageSize: BlockDefV2 = {
  key: 'pager-pagesize',
  label: 'Page size selector',
  category: 'pager',
  zone: 'pager',
  icon: 'fa-sort-numeric-up',
  iconColor: '#64748b',
  description: 'Dropdown that changes ?size= → reloads with new pageSize.',
  props: [
    { key: 'label',   label: 'Label',         type: 'text', default: 'Page size:' },
    { key: 'options', label: 'Options (CSV)', type: 'text', default: '10,25,50,100' },
  ],
  renderHtml: (p) => {
    const opts = String(p.options || '').split(',').map(o => `<option value="${o.trim()}">${o.trim()}</option>`).join('');
    return `<form class="mf-grid-pagesize" method="get" style="padding:10px;text-align:center;">
  <label style="font-size:13px;color:#475569;">${p.label}
    <select name="size" onchange="this.form.submit()" style="padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;margin-left:6px;">${opts}</select>
  </label>
</form>`;
  },
};

// ───────────────────────────────────────────────────────────────────────
//  RAW HTML — fallback block used when hydrating legacy zone HTML
//  (no v2 marker). One raw-html block per zone preserves the existing
//  template visually inside the canvas so the admin can see / tweak it
//  instead of finding the rows zone "empty".
// ───────────────────────────────────────────────────────────────────────

const rawHtml: BlockDefV2 = {
  key: 'raw-html',
  label: 'Raw HTML',
  category: 'row',
  zone: 'any',
  icon: 'fa-code',
  iconColor: '#475569',
  description: 'Hand-written HTML (imported from existing template). Edit inline.',
  props: [
    { key: 'html', label: 'HTML', type: 'textarea', default: '',
      help: 'Verbatim HTML emitted into this zone. Supports {{row:X}}, {{meta:X}}, {{qs:X}} tokens.' },
  ],
  renderHtml: (p) => String(p.html || ''),
};

// ───────────────────────────────────────────────────────────────────────
//  EMPTY-STATE blocks
// ───────────────────────────────────────────────────────────────────────

const emptyFriendly: BlockDefV2 = {
  key: 'empty-friendly',
  label: 'Friendly empty state',
  category: 'empty',
  zone: 'empty',
  icon: 'fa-inbox',
  iconColor: '#94a3b8',
  description: 'Empty state shown when SQL returns 0 rows.',
  props: [
    { key: 'title',       label: 'Title',                type: 'text',     default: 'No data yet' },
    { key: 'message',     label: 'Message',              type: 'textarea', default: 'Try clearing the filter or adding a new record to show it here.' },
    { key: 'actionLabel', label: 'Button (optional)',    type: 'text', default: '' },
    { key: 'actionHref',  label: 'Button link',          type: 'url', default: '?clear=1' },
  ],
  renderHtml: (p) => `<div class="mf-grid-empty" style="text-align:center;padding:40px 20px;color:#64748b;">
  <p style="font-size:16px;font-weight:600;color:#475569;margin:0 0 8px;">${p.title}</p>
  <p style="font-size:13px;margin:0 0 14px;">${p.message}</p>
  ${p.actionLabel ? `<a href="${p.actionHref}" style="display:inline-block;padding:8px 18px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">${p.actionLabel}</a>` : ''}
</div>`,
};

// ───────────────────────────────────────────────────────────────────────
//  Registry + helpers
// ───────────────────────────────────────────────────────────────────────

export const BUILTIN_BLOCKS_V2: BlockDefV2[] = [
  // Header
  pageTitle, searchBar, actionBar, filterPills,
  // Rows
  tableRow, cardItem, listItem, mediaRow, timelineItem,
  // Pager
  pagerNumeric, pagerInfo, pagerPageSize,
  // Empty
  emptyFriendly,
  // Fallback (used by legacy hydrator — not in tray by default)
  rawHtml,
];

export function findBlockDefV2(key: string): BlockDefV2 | null {
  return BUILTIN_BLOCKS_V2.find((b) => b.key === key) || null;
}

export function defaultPropsFor(blockKey: string): Record<string, any> {
  const def = findBlockDefV2(blockKey);
  if (!def) return {};
  const out: Record<string, any> = {};
  def.props.forEach((p) => { out[p.key] = p.default; });
  return out;
}

export function renderBlockHtml(blockKey: string, props: Record<string, any>): string {
  const def = findBlockDefV2(blockKey);
  if (!def) return '';
  return def.renderHtml(props || {});
}
