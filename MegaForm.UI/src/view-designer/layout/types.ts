/**
 * Layout Designer — shared types for DataRepeater + DynamicLabel
 *
 * The Layout Designer is a section-based visual canvas that lets admins
 * compose multi-row SQL widget HTML by dragging block presets into 3 zones
 * (header / rows / pager) plus an empty-state slot, while keeping a 2-way
 * code view for power users.
 *
 * Single source of truth: the HTML string. The block tree is metadata
 * computed by parsing `<!-- mf:block id type -->` anchor comments. If the
 * user edits HTML manually outside of an anchor we surface it as
 * "manualHtml" and refuse to drop blocks into that region — Visual still
 * renders but is read-only for those segments. This prevents the designer
 * from clobbering hand-tuned HTML.
 *
 * Badge: LayoutDesigner v20260528-15
 */

export type LayoutWidgetKind = 'data-repeater' | 'dynamic-label';

export type LayoutZoneId = 'header' | 'rows' | 'pager' | 'empty';

export interface LayoutDesignerOpts {
  widget: LayoutWidgetKind;
  initialHtml?: string;
  sqlPreview?: SqlPreviewSource;        // resolves mock data
  portalId?: number;                    // for custom-block API scope
  apiBase?: string;                     // /api/MegaForm or /api/MegaFormPopup
  formId?: number;
  fieldKey?: string;                    // owning field — used to scope cache
  onApply?: (html: string) => void;
}

export interface SqlPreviewSource {
  // The designer asks the host for top-N rows when the user opens the
  // Preview tab. Host returns a result set already resolved against the
  // widget's connection / query / params, so the designer stays decoupled
  // from how each widget executes SQL.
  fetchTopRows: (n: number) => Promise<SqlPreviewResult>;
}

export interface SqlPreviewResult {
  columns: string[];
  rows: Record<string, any>[];
  error?: string;
}

// ════════════════════════════════════════════════════════════════════════════
//  Block catalog
// ════════════════════════════════════════════════════════════════════════════

export interface BlockDef {
  key: string;                  // unique id, e.g. 'page-title' or custom:42
  label: string;                // tray display
  category: BlockCategory;
  zone: LayoutZoneId | 'any';   // which zone this block belongs to
  iconSvg?: string;
  helpText?: string;
  // The HTML the block emits when dropped, wrapped in an anchor comment by
  // the canvas. May contain {{row:*}} / {{qs:*}} / {{meta:*}} tokens — the
  // listview runtime resolves them. Inside the canvas we render with mock
  // data so the admin sees realistic output.
  html: string;
  // Optional editable properties surfaced when the block is selected.
  props?: BlockPropDef[];
  // Custom blocks carry portal scope so we know where to PUT/DELETE.
  origin?: 'builtin' | 'custom';
  id?: number;                  // server-side id for custom blocks
}

export type BlockCategory =
  | 'header'
  | 'row'
  | 'pager'
  | 'empty'
  | 'media'
  | 'navigation'
  | 'custom';

export interface BlockPropDef {
  key: string;                  // attribute name on the anchor, e.g. 'columns'
  label: string;
  type: 'text' | 'number' | 'token' | 'css-class' | 'select';
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string;
}

// ════════════════════════════════════════════════════════════════════════════
//  Anchor-comment parsed model
// ════════════════════════════════════════════════════════════════════════════

export interface LayoutTree {
  zones: Record<LayoutZoneId, LayoutZone>;
  // Hand-written HTML outside any zone (legacy templates). When present
  // we DO NOT auto-rewrite — Visual mode renders it as a frozen segment.
  manualPrefix?: string;
  manualSuffix?: string;
}

export interface LayoutZone {
  id: LayoutZoneId;
  loop: boolean;                // true only for 'rows'
  blocks: BlockInstance[];
  // Raw inner HTML between anchor blocks, indexed by position.
  // index i = HTML before blocks[i]; index blocks.length = trailing.
  interstitials: string[];
}

export interface BlockInstance {
  uid: string;                  // runtime-only, regenerated on load
  blockKey: string;             // refers to BlockDef.key
  attrs: Record<string, string>;
  // Inner HTML override — when the user edits the rendered block on canvas,
  // we capture the new innerHTML here so subsequent Visual renders preserve
  // their edits.
  innerHtml: string;
}

export interface ParseResult {
  ok: boolean;
  tree: LayoutTree;
  warnings: string[];
}

// ════════════════════════════════════════════════════════════════════════════
//  Designer state — single source of truth held by the popup
// ════════════════════════════════════════════════════════════════════════════

export type ViewMode = 'visual' | 'split' | 'code';

export interface DesignerState {
  widget: LayoutWidgetKind;
  html: string;                 // canonical — what we persist
  tree: LayoutTree;             // derived from html
  mode: ViewMode;
  mockRows: Record<string, any>[];
  mockCols: string[];
  mockError: string;
  selectedBlockUid: string | null;
  dirty: boolean;
}
