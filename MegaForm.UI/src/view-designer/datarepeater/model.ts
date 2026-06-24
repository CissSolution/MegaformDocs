import type { DraftSummaryItem, FlatDraftKey, RepeaterDraft } from './types';

const PLACEMENT_DEFAULT = 'after';

export const FLAT_KEYS: FlatDraftKey[] = [
  'dataSource',
  'connectionKey',
  'databaseType',
  'masterQuery',
  'masterTemplate',
  'pageSize',
  'refreshInterval',
  'emptyMessage',
  'cssClass',
  'maxRows',
  'allowExportCsv',
  'allowExportPdf',
  'chartType',
  'chartLabelCol',
  'chartValueCol',
  'queryDependsOn',
  'reloadOnParamChange',
  'groupByCol',
  'golfMode',
  'detail1Query',
  'detail1Template',
  'detail1TriggerCol',
  'detail1Placement',
  'detail2Query',
  'detail2Template',
  'detail2TriggerCol',
  'detail2Placement',
  'detail3Query',
  'detail3Template',
  'detail3TriggerCol',
  'detail3Placement',
  'filter1Label',
  'filter1Type',
  'filter1Query',
  'filter1Param',
  'filter2Label',
  'filter2Type',
  'filter2Query',
  'filter2Param',
];

const OBJECT_KEYS = new Set<string>([...FLAT_KEYS, 'detailLevels', 'filters']);

export const DEFAULT_DRAFT: Omit<RepeaterDraft, 'extras'> = {
  dataSource: 'sql',
  connectionKey: 'DashboardDatabase',
  databaseType: '',
  masterQuery: '',
  masterTemplate: '',
  pageSize: 50,
  refreshInterval: 0,
  emptyMessage: 'No data found.',
  cssClass: '',
  maxRows: 1000,
  allowExportCsv: false,
  allowExportPdf: false,
  chartType: '',
  chartLabelCol: '',
  chartValueCol: '',
  queryDependsOn: '',
  reloadOnParamChange: true,
  groupByCol: '',
  golfMode: false,
  detail1Query: '',
  detail1Template: '',
  detail1TriggerCol: '',
  detail1Placement: '',
  detail2Query: '',
  detail2Template: '',
  detail2TriggerCol: '',
  detail2Placement: '',
  detail3Query: '',
  detail3Template: '',
  detail3TriggerCol: '',
  detail3Placement: '',
  filter1Label: '',
  filter1Type: '',
  filter1Query: '',
  filter1Param: '',
  filter2Label: '',
  filter2Type: '',
  filter2Query: '',
  filter2Param: '',
};

export function createDefaultDraft(): RepeaterDraft {
  return {
    ...DEFAULT_DRAFT,
    extras: {},
  };
}

export function cloneDraft(draft: RepeaterDraft): RepeaterDraft {
  return JSON.parse(JSON.stringify(draft)) as RepeaterDraft;
}

export function parseConfigJson(initialJson?: string): RepeaterDraft {
  const raw = String(initialJson || '').trim();
  if (!raw) return createDefaultDraft();
  try {
    const parsed = JSON.parse(raw);
    return parseConfigObject(parsed);
  } catch {
    return createDefaultDraft();
  }
}

export function parseConfigObject(source: any): RepeaterDraft {
  const draft = createDefaultDraft();
  if (!source || typeof source !== 'object') return draft;

  for (const key of FLAT_KEYS) {
    const current = (DEFAULT_DRAFT as any)[key];
    const value = source[key];
    if (typeof current === 'boolean') {
      (draft as any)[key] = toBoolean(value, current);
    } else if (typeof current === 'number') {
      (draft as any)[key] = toNumber(value, current);
    } else {
      (draft as any)[key] = value == null ? current : String(value);
    }
  }

  const detailLevels = Array.isArray(source.detailLevels) ? source.detailLevels : [];
  for (let index = 1; index <= 3; index += 1) {
    const hasFlatLevel = hasAnyValue(
      (draft as any)[`detail${index}Query`],
      (draft as any)[`detail${index}Template`],
      (draft as any)[`detail${index}TriggerCol`],
      (draft as any)[`detail${index}Placement`],
    );
    if (hasFlatLevel) continue;
    const level = detailLevels[index - 1];
    if (!level || typeof level !== 'object') continue;
    (draft as any)[`detail${index}Query`] = String(level.query || '');
    (draft as any)[`detail${index}Template`] = String(level.template || '');
    (draft as any)[`detail${index}TriggerCol`] = String(level.triggerCol || '');
    (draft as any)[`detail${index}Placement`] = String(level.placement || '');
  }

  const filters = Array.isArray(source.filters) ? source.filters : [];
  for (let index = 1; index <= 2; index += 1) {
    const hasFlatFilter = hasAnyValue(
      (draft as any)[`filter${index}Label`],
      (draft as any)[`filter${index}Type`],
      (draft as any)[`filter${index}Query`],
      (draft as any)[`filter${index}Param`],
    );
    if (hasFlatFilter) continue;
    const filter = filters[index - 1];
    if (!filter || typeof filter !== 'object') continue;
    (draft as any)[`filter${index}Label`] = String(filter.label || '');
    (draft as any)[`filter${index}Type`] = String(filter.filterType || '');
    (draft as any)[`filter${index}Query`] = String(filter.query || '');
    (draft as any)[`filter${index}Param`] = String(filter.paramName || '');
  }

  draft.extras = {};
  for (const [key, value] of Object.entries(source)) {
    if (!OBJECT_KEYS.has(key)) draft.extras[key] = value;
  }
  return draft;
}

export function serializeDraft(draft: RepeaterDraft): Record<string, any> {
  const output: Record<string, any> = cloneObject(draft.extras);

  for (const key of FLAT_KEYS) output[key] = (draft as any)[key];

  const detailLevels: any[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const query = String((draft as any)[`detail${index}Query`] || '').trim();
    const template = String((draft as any)[`detail${index}Template`] || '').trim();
    const triggerCol = String((draft as any)[`detail${index}TriggerCol`] || '').trim();
    const placement = String((draft as any)[`detail${index}Placement`] || '').trim();
    if (!hasAnyValue(query, template, triggerCol, placement)) continue;
    detailLevels.push({
      query,
      template,
      triggerCol,
      placement: placement || PLACEMENT_DEFAULT,
    });
  }

  const filters: any[] = [];
  for (let index = 1; index <= 2; index += 1) {
    const label = String((draft as any)[`filter${index}Label`] || '').trim();
    const filterType = String((draft as any)[`filter${index}Type`] || '').trim();
    const query = String((draft as any)[`filter${index}Query`] || '').trim();
    const paramName = String((draft as any)[`filter${index}Param`] || '').trim();
    if (!hasAnyValue(label, filterType, query, paramName)) continue;
    filters.push({
      key: `filter${index}`,
      label: label || `Filter ${index}`,
      filterType,
      query,
      paramName,
    });
  }

  output.detailLevels = detailLevels;
  output.filters = filters;
  return output;
}

export function stringifyDraft(draft: RepeaterDraft): string {
  return JSON.stringify(serializeDraft(draft), null, 2);
}

export function validateConfigJson(json: string): { ok: true; draft: RepeaterDraft } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json || '{}');
    return { ok: true, draft: parseConfigObject(parsed) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function buildSummary(draft: RepeaterDraft): DraftSummaryItem[] {
  return [
    { label: 'Source', value: draft.dataSource === 'storedproc' ? 'Stored proc' : 'SQL query' },
    { label: 'Paging', value: draft.pageSize > 0 ? `${draft.pageSize}/page` : 'All rows' },
    { label: 'Details', value: String(countActiveDetails(draft)) },
    { label: 'Filters', value: String(countActiveFilters(draft)) },
    { label: 'Chart', value: draft.chartType ? draft.chartType : 'Off' },
  ];
}

export function countActiveDetails(draft: RepeaterDraft): number {
  let count = 0;
  for (let index = 1; index <= 3; index += 1) {
    if (hasAnyValue(
      (draft as any)[`detail${index}Query`],
      (draft as any)[`detail${index}Template`],
      (draft as any)[`detail${index}TriggerCol`],
      (draft as any)[`detail${index}Placement`],
    )) {
      count += 1;
    }
  }
  return count;
}

export function countActiveFilters(draft: RepeaterDraft): number {
  let count = 0;
  for (let index = 1; index <= 2; index += 1) {
    if (hasAnyValue(
      (draft as any)[`filter${index}Label`],
      (draft as any)[`filter${index}Type`],
      (draft as any)[`filter${index}Query`],
      (draft as any)[`filter${index}Param`],
    )) {
      count += 1;
    }
  }
  return count;
}

function toBoolean(value: any, fallback: boolean): boolean {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const lowered = String(value).trim().toLowerCase();
  if (!lowered) return fallback;
  return lowered === 'true' || lowered === '1' || lowered === 'yes' || lowered === 'on';
}

function toNumber(value: any, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function hasAnyValue(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => String(value || '').trim().length > 0);
}

function cloneObject<T extends Record<string, any>>(value: T): T {
  return JSON.parse(JSON.stringify(value || {})) as T;
}
