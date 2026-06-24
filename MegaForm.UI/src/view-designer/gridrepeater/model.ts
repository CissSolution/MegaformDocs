import type { ColumnType, GridRepeaterColumnDef, GridRepeaterProps } from './types';

const DEFAULT_PAGER_TEMPLATE = [
  '<div class="mfgr-pager-shell">',
  '  <div class="mfgr-pager-meta">{{summary}}</div>',
  '  <div class="mfgr-pager-actions">{{prevButton}}{{nextButton}}</div>',
  '</div>',
].join('\n');

const TABLE_DEFAULT_CSS = [
  '.mfgr-wrap[data-preset="table"] .mfgr-header-row{background:linear-gradient(180deg,#f8fbff 0%,#eef4ff 100%)}',
  '.mfgr-wrap[data-preset="table"] .mfgr-th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#475569}',
  '.mfgr-wrap[data-preset="table"] .mfgr-row:hover .mfgr-row-inner{background:#f8fbff}',
  '.mfgr-wrap[data-preset="table"] .mfgr-cell{padding:10px 12px}',
  '.mfgr-wrap[data-preset="table"] .mfgr-pager-summary{font-weight:700;color:#334155}',
].join('\n');

const CARD_DEFAULT_CSS = [
  '.mfgr-wrap[data-preset="cards"] .mfgr-header{display:none}',
  '.mfgr-wrap[data-preset="cards"] .mfgr-body{border:0;background:transparent;display:grid;grid-template-columns:1fr;gap:14px}',
  '.mfgr-wrap[data-preset="cards"] .mfgr-row{border:0}',
  '.mfgr-wrap[data-preset="cards"] .mfgr-card{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(240px,.8fr);gap:14px;padding:16px;border:1px solid #dbe4f0;border-radius:16px;background:#fff;box-shadow:0 8px 22px rgba(15,23,42,.05)}',
  '.mfgr-wrap[data-preset="cards"] .mfgr-card-main,.mfgr-wrap[data-preset="cards"] .mfgr-card-meta,.mfgr-wrap[data-preset="cards"] .mfgr-card-controls{display:flex;flex-direction:column;gap:10px}',
  '.mfgr-wrap[data-preset="cards"] .mfgr-card-actions{display:flex;justify-content:flex-end;align-items:flex-start}',
  '.mfgr-wrap[data-preset="cards"] .mfgr-cell{padding:0;border:0}',
].join('\n');

const GRID_DEFAULT_CSS = [
  '.mfgr-wrap[data-preset="grid"] .mfgr-header{display:none}',
  '.mfgr-wrap[data-preset="grid"] .mfgr-body{border:0;background:transparent;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}',
  '.mfgr-wrap[data-preset="grid"] .mfgr-row{border:0}',
  '.mfgr-wrap[data-preset="grid"] .mfgr-grid-card{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid #dbe4f0;border-radius:16px;background:linear-gradient(180deg,#fff,#f8fafc)}',
  '.mfgr-wrap[data-preset="grid"] .mfgr-grid-head,.mfgr-wrap[data-preset="grid"] .mfgr-grid-body{display:flex;flex-direction:column;gap:10px}',
  '.mfgr-wrap[data-preset="grid"] .mfgr-grid-foot{display:flex;justify-content:flex-end}',
  '.mfgr-wrap[data-preset="grid"] .mfgr-cell{padding:0;border:0}',
].join('\n');

export const DEFAULTS: GridRepeaterProps = {
  columns: [],
  minRows: 0,
  maxRows: 50,
  allowReorder: true,
  allowDuplicateRows: false,
  addRowLabel: '+ Add Row',
  emptyMessage: 'No rows yet. Click Add Row to begin.',
  layout: 'grid',
  readOnlyMode: false,
  dataMode: 'manual',
  connectionKey: 'DashboardDatabase',
  databaseType: '',
  dataSource: 'sql',
  masterQuery: '',
  queryDependsOn: '',
  reloadOnParamChange: true,
  pageSize: 200,
  displayPreset: 'table',
  headerTemplate: '',
  rowTemplate: '',
  customCss: TABLE_DEFAULT_CSS,
  pagerPrevLabel: 'Prev',
  pagerNextLabel: 'Next',
  pagerSummaryTemplate: 'Page {page} / {pages} / {count} rows',
  pagerTemplate: DEFAULT_PAGER_TEMPLATE,
};

export function parseJson(json?: string): GridRepeaterProps {
  if (!json) return cloneProps(DEFAULTS);
  try {
    return normalizeProps(JSON.parse(json));
  } catch {
    return cloneProps(DEFAULTS);
  }
}

export function stringifyProps(props: GridRepeaterProps): string {
  return JSON.stringify(normalizeProps(props), null, 2);
}

export function cloneProps(props: GridRepeaterProps): GridRepeaterProps {
  return normalizeProps(JSON.parse(JSON.stringify(props || DEFAULTS)));
}

export function validateJson(json: string): { ok: boolean; error: string } {
  try {
    normalizeProps(JSON.parse(json || '{}'));
    return { ok: true, error: '' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function normalizeProps(input: any): GridRepeaterProps {
  const raw = (input && typeof input === 'object') ? input : {};
  const props: GridRepeaterProps = {
    ...DEFAULTS,
    ...raw,
    columns: Array.isArray(raw.columns) ? raw.columns.map(normalizeColumn).filter(Boolean) : [],
    minRows: normalizeNumber(raw.minRows, DEFAULTS.minRows, 0),
    maxRows: normalizeNumber(raw.maxRows, DEFAULTS.maxRows, 0),
    addRowLabel: String(raw.addRowLabel || DEFAULTS.addRowLabel),
    emptyMessage: String(raw.emptyMessage || DEFAULTS.emptyMessage),
    layout: String(raw.layout || DEFAULTS.layout),
    readOnlyMode: !!raw.readOnlyMode,
    dataMode: raw.dataMode === 'sql' ? 'sql' : 'manual',
    connectionKey: String(raw.connectionKey || DEFAULTS.connectionKey),
    databaseType: String(raw.databaseType || DEFAULTS.databaseType),
    dataSource: raw.dataSource === 'storedproc' ? 'storedproc' : 'sql',
    masterQuery: String(raw.masterQuery || ''),
    queryDependsOn: String(raw.queryDependsOn || ''),
    reloadOnParamChange: raw.reloadOnParamChange !== false,
    pageSize: normalizeNumber(raw.pageSize, DEFAULTS.pageSize, 1),
    displayPreset: raw.displayPreset === 'cards' || raw.displayPreset === 'grid' ? raw.displayPreset : 'table',
    headerTemplate: String(raw.headerTemplate || ''),
    rowTemplate: String(raw.rowTemplate || ''),
    customCss: String(raw.customCss || ''),
    pagerPrevLabel: String(raw.pagerPrevLabel || DEFAULTS.pagerPrevLabel),
    pagerNextLabel: String(raw.pagerNextLabel || DEFAULTS.pagerNextLabel),
    pagerSummaryTemplate: String(raw.pagerSummaryTemplate || DEFAULTS.pagerSummaryTemplate),
    pagerTemplate: String(raw.pagerTemplate || ''),
  };

  if (props.maxRows < props.minRows) props.maxRows = props.minRows;
  const missingPresentation = !String(props.headerTemplate || '').trim()
    && !String(props.rowTemplate || '').trim()
    && !String(props.customCss || '').trim();
  const missingPager = !String(props.pagerTemplate || '').trim();
  if (missingPresentation || missingPager) {
    applyPresetDefaults(props, props.displayPreset);
  }
  expandLegacyDefaultTemplates(props);
  return props;
}

export function applyTemplatePreset(props: GridRepeaterProps, preset: 'table' | 'cards' | 'grid'): GridRepeaterProps {
  const next = cloneProps(props);
  applyPresetDefaults(next, preset, true);
  return next;
}

export function buildDefaultHeaderTemplate(props: GridRepeaterProps): string {
  const cells = props.columns.map((col) => {
    const classes = ['mfgr-th'];
    if (col.hideInHeader) classes.push('mfgr-th-hidden');
    const body = col.hideInHeader ? '' : `{{label:${col.key}}}`;
    return `  <div class="${classes.join(' ')}">${body}</div>`;
  });
  if (!props.readOnlyMode) {
    cells.push('  <div class="mfgr-th mfgr-th-actions">{{actionsLabel}}</div>');
  }
  return [
    '<div class="mfgr-header-row" style="grid-template-columns:{{gridColumns}}">',
    ...cells,
    '</div>',
  ].join('\n');
}

export function buildDefaultRowTemplate(props: GridRepeaterProps): string {
  const cells = props.columns.map((col) => `  {{cell:${col.key}}}`);
  if (!props.readOnlyMode) {
    cells.push('  <div class="mfgr-cell mfgr-cell-actions-wrap">{{actions}}</div>');
  }
  return [
    '<div class="mfgr-row-inner" style="grid-template-columns:{{gridColumns}}">',
    ...cells,
    '</div>',
  ].join('\n');
}

export function buildDefaultPagerTemplate(): string {
  return DEFAULT_PAGER_TEMPLATE;
}

export function buildPresetCss(preset: 'table' | 'cards' | 'grid'): string {
  if (preset === 'cards') return CARD_DEFAULT_CSS;
  if (preset === 'grid') return GRID_DEFAULT_CSS;
  return TABLE_DEFAULT_CSS;
}

export function normalizeColumn(input: any): GridRepeaterColumnDef {
  const raw = (input && typeof input === 'object') ? input : {};
  const type = normalizeType(raw.type);
  return {
    key: String(raw.key || slugify(String(raw.label || 'column'))),
    label: String(raw.label || 'Column'),
    type,
    required: !!raw.required,
    placeholder: raw.placeholder == null ? '' : String(raw.placeholder),
    width: raw.width == null || raw.width === '' ? '1fr' : String(raw.width),
    defaultValue: normalizeDefaultValue(type, raw.defaultValue),
    min: raw.min == null || String(raw.min) === '' ? undefined : Number(raw.min),
    max: raw.max == null || String(raw.max) === '' ? undefined : Number(raw.max),
    step: raw.step == null || String(raw.step) === '' ? undefined : Number(raw.step),
    options: normalizeOptions(raw.options),
    optionsSource: String(raw.optionsSource || '').toLowerCase() === 'sql' ? 'sql' : 'static',
    optionsType: String(raw.optionsType || '').toLowerCase() === 'storedproc' ? 'storedproc' : 'sql',
    optionsConnectionKey: String(raw.optionsConnectionKey || ''),
    optionsDatabaseType: String(raw.optionsDatabaseType || ''),
    optionsSql: String(raw.optionsSql || ''),
    optionsDependsOn: normalizeDependsOn(raw.optionsDependsOn),
    optionsReloadOnChange: raw.optionsReloadOnChange !== false,
    readOnly: !!raw.readOnly,
    hideInHeader: !!raw.hideInHeader,
  };
}

export function parseOptionsTextarea(value: string): Array<string | { value: string; label: string }> {
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (trimmed.includes('|')) {
      const [label, val] = trimmed.split('|');
      return { label: label.trim(), value: String(val ?? label).trim() };
    }
    return trimmed;
  }).filter(Boolean) as Array<string | { value: string; label: string }>;
}

export function optionsToTextarea(options?: Array<string | { value: string; label: string }>): string {
  return (options || []).map((opt) => {
    if (typeof opt === 'string') return opt;
    return `${opt.label}|${opt.value}`;
  }).join('\n');
}

export function titleCase(value: string): string {
  return String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);
}

export function uniqueColumnLabel(base: string, columns: GridRepeaterColumnDef[]): string {
  let out = base;
  let i = 2;
  while (columns.some((col) => col.label === out)) out = `${base} ${i++}`;
  return out;
}

export function uniqueColumnKey(base: string, columns: GridRepeaterColumnDef[]): string {
  let out = base;
  let i = 2;
  while (columns.some((col) => col.key === out)) out = `${base}_${i++}`;
  return out;
}

export function createColumn(type: ColumnType, columns: GridRepeaterColumnDef[]): GridRepeaterColumnDef {
  const baseLabel = titleCase(type);
  return normalizeColumn({
    label: uniqueColumnLabel(baseLabel, columns),
    key: uniqueColumnKey(slugify(baseLabel), columns),
    type,
    width: '1fr',
    required: false,
    placeholder: type === 'checkbox' || type === 'date' || type === 'select' ? '' : `Enter ${baseLabel.toLowerCase()}`,
    defaultValue: type === 'checkbox' ? false : (type === 'number' ? null : ''),
    options: type === 'select' ? ['Option 1', 'Option 2'] : [],
    optionsSource: 'static',
    optionsType: 'sql',
    optionsConnectionKey: type === 'select' ? 'DashboardDatabase' : '',
    optionsDatabaseType: '',
    optionsSql: '',
    optionsDependsOn: [],
    optionsReloadOnChange: true,
  });
}

function normalizeType(value: any): ColumnType {
  const type = String(value || 'text').toLowerCase();
  switch (type) {
    case 'email':
    case 'number':
    case 'tel':
    case 'date':
    case 'select':
    case 'checkbox':
    case 'textarea':
      return type;
    default:
      return 'text';
  }
}

function normalizeOptions(options: any): Array<string | { value: string; label: string }> {
  if (!Array.isArray(options)) return [];
  return options.map((opt) => {
    if (typeof opt === 'string') return opt;
    if (opt && typeof opt === 'object') return { value: String(opt.value ?? ''), label: String(opt.label ?? opt.value ?? '') };
    return null;
  }).filter(Boolean) as Array<string | { value: string; label: string }>;
}

function normalizeDependsOn(value: any): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((x) => String(x || '').trim()).filter(Boolean);
  return [];
}

function applyPresetDefaults(props: GridRepeaterProps, preset: 'table' | 'cards' | 'grid', force = false): void {
  props.displayPreset = preset;
  if (preset === 'table') {
    if (force || !String(props.headerTemplate || '').trim()) props.headerTemplate = buildDefaultHeaderTemplate(props);
    if (force || !String(props.rowTemplate || '').trim()) props.rowTemplate = buildDefaultRowTemplate(props);
    if (force || !String(props.customCss || '').trim()) props.customCss = TABLE_DEFAULT_CSS;
  } else if (preset === 'cards') {
    if (force || !String(props.headerTemplate || '').trim()) props.headerTemplate = '';
    if (force || !String(props.rowTemplate || '').trim()) {
      props.rowTemplate = [
        '<article class="mfgr-card">',
        '  <div class="mfgr-card-main">{{cell:tabName}}</div>',
        '  <div class="mfgr-card-meta">{{cell:tabId}}{{cell:tabPath}}{{cell:tabLevel}}</div>',
        '  <div class="mfgr-card-controls">{{cell:include}}{{cell:note}}</div>',
        '  <div class="mfgr-card-actions">{{actions}}</div>',
        '</article>'
      ].join('\n');
    }
    if (force || !String(props.customCss || '').trim()) props.customCss = CARD_DEFAULT_CSS;
  } else {
    if (force || !String(props.headerTemplate || '').trim()) props.headerTemplate = '';
    if (force || !String(props.rowTemplate || '').trim()) {
      props.rowTemplate = [
        '<article class="mfgr-grid-card">',
        '  <header class="mfgr-grid-head">{{cell:tabName}}{{cell:tabId}}</header>',
        '  <div class="mfgr-grid-body">{{cell:tabPath}}{{cell:tabLevel}}{{cell:include}}{{cell:note}}</div>',
        '  <footer class="mfgr-grid-foot">{{actions}}</footer>',
        '</article>'
      ].join('\n');
    }
    if (force || !String(props.customCss || '').trim()) props.customCss = GRID_DEFAULT_CSS;
  }

  if (force || !String(props.pagerTemplate || '').trim()) {
    props.pagerTemplate = DEFAULT_PAGER_TEMPLATE;
  }
}

function expandLegacyDefaultTemplates(props: GridRepeaterProps): void {
  const header = String(props.headerTemplate || '').trim();
  const row = String(props.rowTemplate || '').trim();
  if (!header || /^\{\{\s*defaultHeader\s*\}\}$/i.test(header)) {
    props.headerTemplate = buildDefaultHeaderTemplate(props);
  }
  if (!row || /^\{\{\s*defaultRow\s*\}\}$/i.test(row)) {
    props.rowTemplate = buildDefaultRowTemplate(props);
  }
  if (!String(props.pagerTemplate || '').trim()) {
    props.pagerTemplate = DEFAULT_PAGER_TEMPLATE;
  }
}

function normalizeDefaultValue(type: ColumnType, value: any): any {
  if (value == null) {
    if (type === 'checkbox') return false;
    return type === 'number' ? null : '';
  }
  if (type === 'checkbox') return !!value;
  if (type === 'number') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return String(value);
}

function normalizeNumber(value: any, fallback: number, min: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(num, min);
}

function slugify(input: string): string {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]+/g, '')
    .replace(/[\s\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'column';
}
