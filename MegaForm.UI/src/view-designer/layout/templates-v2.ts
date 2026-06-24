/**
 * Layout Designer v2 — Quick-Start Templates
 *
 * Each template is a pre-configured set of BlockInstanceV2 entries that
 * auto-populate the canvas zones when the user picks it on the welcome
 * screen. Admin starts from a working layout instead of an empty canvas,
 * then tweaks props inline.
 *
 * Inspired by Umbraco Block Grid "starter kits" — the user picks a visual
 * pattern (Magazine, Table, Card, Timeline) before touching individual
 * blocks.
 */

import type { LayoutZoneId } from './types';
import { defaultPropsFor } from './blocks-v2';

export interface BlockInstanceV2 {
  uid: string;                     // runtime-only id
  blockKey: string;                // references BUILTIN_BLOCKS_V2
  props: Record<string, any>;      // typed props (matches PropDef[] schema)
}

export interface LayoutTemplateV2 {
  key: string;
  label: string;
  description: string;
  thumbnailSvg: string;            // small svg preview, 200x130
  /** Pre-filled instances per zone. */
  layout: Record<LayoutZoneId, BlockInstanceV2[]>;
}

let uidSeq = 0;
const nextUid = () => `bi_${Date.now().toString(36)}_${(++uidSeq).toString(36)}`;

function inst(blockKey: string, overrides: Record<string, any> = {}): BlockInstanceV2 {
  return {
    uid: nextUid(),
    blockKey,
    props: { ...defaultPropsFor(blockKey), ...overrides },
  };
}

// ───────────────────────────────────────────────────────────────────────
//  Template 1: Magazine grid
// ───────────────────────────────────────────────────────────────────────

const magazineGrid: LayoutTemplateV2 = {
  key: 'magazine-grid',
  label: 'Magazine grid',
  description: 'Big title + 3-column cards with images. Great for blog / portfolio / product lists.',
  thumbnailSvg: `<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="130" fill="#f8fafc"/>
    <rect x="8" y="8" width="120" height="14" rx="2" fill="#6366f1"/>
    <rect x="132" y="10" width="60" height="10" rx="2" fill="#cbd5e1"/>
    <g fill="#fff" stroke="#e2e8f0">
      <rect x="8"  y="32" width="58" height="86" rx="6"/>
      <rect x="72" y="32" width="58" height="86" rx="6"/>
      <rect x="136" y="32" width="56" height="86" rx="6"/>
    </g>
    <g fill="#c7d2fe">
      <rect x="13" y="37" width="48" height="32" rx="3"/>
      <rect x="77" y="37" width="48" height="32" rx="3"/>
      <rect x="141" y="37" width="46" height="32" rx="3"/>
    </g>
    <g fill="#94a3b8">
      <rect x="13" y="74" width="40" height="6" rx="1"/>
      <rect x="13" y="84" width="48" height="4" rx="1"/>
      <rect x="13" y="91" width="44" height="4" rx="1"/>
      <rect x="77" y="74" width="40" height="6" rx="1"/>
      <rect x="77" y="84" width="48" height="4" rx="1"/>
      <rect x="141" y="74" width="38" height="6" rx="1"/>
      <rect x="141" y="84" width="46" height="4" rx="1"/>
    </g>
  </svg>`,
  layout: {
    header: [
      inst('page-title', { title: 'Latest news', subtitle: 'Portal {{meta:portalId}}', size: 'lg' }),
      inst('search-bar', { placeholder: 'Search posts…' }),
    ],
    rows: [
      inst('card-item', {
        imageToken: '{{row:CoverUrl}}',
        titleToken: '{{row:Title}}',
        bodyToken:  '{{row:Summary}}',
        linkToken:  '?slug={{row:Slug}}',
      }),
    ],
    pager: [
      inst('pager-numeric'),
    ],
    empty: [
      inst('empty-friendly', { title: 'No posts yet', message: 'Come back later or adjust your filters.' }),
    ],
  },
};

// ───────────────────────────────────────────────────────────────────────
//  Template 2: Table list (admin grid)
// ───────────────────────────────────────────────────────────────────────

const tableList: LayoutTemplateV2 = {
  key: 'table-list',
  label: 'Table list',
  description: 'Classic 3-column table + action bar + numeric pager. Great for admin dashboards.',
  thumbnailSvg: `<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="130" fill="#f8fafc"/>
    <rect x="8" y="8" width="80" height="12" rx="2" fill="#0f172a"/>
    <rect x="140" y="8" width="52" height="14" rx="3" fill="#6366f1"/>
    <rect x="8" y="30" width="184" height="14" rx="2" fill="#e2e8f0"/>
    <g fill="#fff" stroke="#e2e8f0">
      <rect x="8"  y="48" width="184" height="14"/>
      <rect x="8"  y="64" width="184" height="14"/>
      <rect x="8"  y="80" width="184" height="14"/>
      <rect x="8"  y="96" width="184" height="14"/>
    </g>
    <g fill="#94a3b8">
      <rect x="14" y="33" width="32" height="6" rx="1"/>
      <rect x="74" y="33" width="32" height="6" rx="1"/>
      <rect x="134" y="33" width="32" height="6" rx="1"/>
      <rect x="14" y="51" width="40" height="5" rx="1"/>
      <rect x="74" y="51" width="50" height="5" rx="1"/>
      <rect x="134" y="51" width="36" height="5" rx="1"/>
      <rect x="14" y="67" width="36" height="5" rx="1"/>
      <rect x="74" y="67" width="44" height="5" rx="1"/>
      <rect x="14" y="83" width="42" height="5" rx="1"/>
      <rect x="74" y="83" width="40" height="5" rx="1"/>
      <rect x="14" y="99" width="38" height="5" rx="1"/>
      <rect x="74" y="99" width="48" height="5" rx="1"/>
    </g>
    <g fill="#cbd5e1">
      <rect x="76" y="118" width="48" height="6" rx="2"/>
    </g>
  </svg>`,
  layout: {
    header: [
      inst('page-title', { title: 'Data table', subtitle: '', size: 'md' }),
      inst('action-bar', { primaryText: '+ Add new', secondaryText: 'Export CSV', align: 'right' }),
    ],
    rows: [
      inst('table-row'),
    ],
    pager: [
      inst('pager-info'),
      inst('pager-numeric'),
    ],
    empty: [
      inst('empty-friendly', { title: 'Empty table', message: 'No matching data found.' }),
    ],
  },
};

// ───────────────────────────────────────────────────────────────────────
//  Template 3: Card row (compact list)
// ───────────────────────────────────────────────────────────────────────

const cardRow: LayoutTemplateV2 = {
  key: 'card-row',
  label: 'Media list',
  description: 'Horizontal thumbnail + content rows. Great for post lists, profiles.',
  thumbnailSvg: `<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="130" fill="#f8fafc"/>
    <rect x="8" y="8" width="100" height="12" rx="2" fill="#0f172a"/>
    <g fill="#fff" stroke="#e2e8f0">
      <rect x="8"  y="28" width="184" height="28" rx="6"/>
      <rect x="8"  y="60" width="184" height="28" rx="6"/>
      <rect x="8"  y="92" width="184" height="28" rx="6"/>
    </g>
    <g fill="#c7d2fe">
      <rect x="14" y="32" width="30" height="20" rx="3"/>
      <rect x="14" y="64" width="30" height="20" rx="3"/>
      <rect x="14" y="96" width="30" height="20" rx="3"/>
    </g>
    <g fill="#94a3b8">
      <rect x="52" y="34" width="80" height="6" rx="1"/>
      <rect x="52" y="44" width="120" height="4" rx="1"/>
      <rect x="52" y="66" width="70" height="6" rx="1"/>
      <rect x="52" y="76" width="110" height="4" rx="1"/>
      <rect x="52" y="98" width="90" height="6" rx="1"/>
      <rect x="52" y="108" width="100" height="4" rx="1"/>
    </g>
  </svg>`,
  layout: {
    header: [
      inst('page-title', { title: 'Posts', subtitle: '', size: 'md' }),
      inst('filter-pills', { paramName: 'category', pillsCsv: 'All|\nNew|new\nFeatured|hot' }),
    ],
    rows: [
      inst('media-row'),
    ],
    pager: [
      inst('pager-info'),
    ],
    empty: [
      inst('empty-friendly', { title: 'No posts yet' }),
    ],
  },
};

// ───────────────────────────────────────────────────────────────────────
//  Template 4: Timeline
// ───────────────────────────────────────────────────────────────────────

const timeline: LayoutTemplateV2 = {
  key: 'timeline',
  label: 'Timeline',
  description: 'Date on the left + content on the right. Great for blogs and activity logs.',
  thumbnailSvg: `<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="130" fill="#f8fafc"/>
    <rect x="8" y="8" width="120" height="14" rx="2" fill="#0f172a"/>
    <g fill="#fff" stroke="#e2e8f0">
      <rect x="8"  y="30" width="184" height="26" rx="6"/>
      <rect x="8"  y="60" width="184" height="26" rx="6"/>
      <rect x="8"  y="90" width="184" height="26" rx="6"/>
    </g>
    <g fill="#a78bfa">
      <rect x="14" y="36" width="32" height="6" rx="1"/>
      <rect x="14" y="66" width="32" height="6" rx="1"/>
      <rect x="14" y="96" width="32" height="6" rx="1"/>
    </g>
    <g fill="#0f172a">
      <rect x="54" y="36" width="84" height="6" rx="1"/>
      <rect x="54" y="66" width="100" height="6" rx="1"/>
      <rect x="54" y="96" width="76" height="6" rx="1"/>
    </g>
    <g fill="#94a3b8">
      <rect x="54" y="46" width="120" height="4" rx="1"/>
      <rect x="54" y="76" width="130" height="4" rx="1"/>
      <rect x="54" y="106" width="110" height="4" rx="1"/>
    </g>
  </svg>`,
  layout: {
    header: [
      inst('page-title', { title: 'Recent activity', subtitle: 'Updated over time', size: 'lg' }),
    ],
    rows: [
      inst('timeline-item'),
    ],
    pager: [
      inst('pager-numeric'),
    ],
    empty: [
      inst('empty-friendly', { title: 'No activity', message: 'No events in this time range.' }),
    ],
  },
};

// ───────────────────────────────────────────────────────────────────────
//  Blank template — start from scratch
// ───────────────────────────────────────────────────────────────────────

const blank: LayoutTemplateV2 = {
  key: 'blank',
  label: 'Blank',
  description: 'Start from an empty canvas. Drag blocks in yourself.',
  thumbnailSvg: `<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="130" fill="#f8fafc"/>
    <rect x="20" y="20" width="160" height="90" rx="6" fill="#fff" stroke="#cbd5e1" stroke-dasharray="4 4"/>
    <text x="100" y="70" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#94a3b8">Drag blocks here</text>
  </svg>`,
  layout: {
    header: [],
    rows: [],
    pager: [],
    empty: [],
  },
};

// ───────────────────────────────────────────────────────────────────────
//  Registry
// ───────────────────────────────────────────────────────────────────────

export const STARTER_TEMPLATES: LayoutTemplateV2[] = [
  magazineGrid,
  tableList,
  cardRow,
  timeline,
  blank,
];

export function findTemplateV2(key: string): LayoutTemplateV2 | null {
  return STARTER_TEMPLATES.find((t) => t.key === key) || null;
}

/** Deep-clone a template so each invocation starts with fresh BlockInstanceV2 uids. */
export function cloneTemplate(key: string): LayoutTemplateV2 | null {
  const def = findTemplateV2(key);
  if (!def) return null;
  return {
    ...def,
    layout: {
      header: def.layout.header.map((b) => ({ ...b, uid: nextUid(), props: { ...b.props } })),
      rows:   def.layout.rows.map((b)   => ({ ...b, uid: nextUid(), props: { ...b.props } })),
      pager:  def.layout.pager.map((b)  => ({ ...b, uid: nextUid(), props: { ...b.props } })),
      empty:  def.layout.empty.map((b)  => ({ ...b, uid: nextUid(), props: { ...b.props } })),
    },
  };
}
