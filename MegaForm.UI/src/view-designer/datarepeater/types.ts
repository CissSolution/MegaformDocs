export interface DataRepeaterDesignerOpts {
  initialJson?: string;
  /** [v20260529-01] Field key — when provided the designer mounts the
   *  "AI Configuration" panel at the top, showing every widgetProp on
   *  this field so the admin can verify/edit AI-set values. */
  fieldKey?: string;
  onApply?: (json: string) => void;
}

export interface PresetEntry {
  key: string;
  label: string;
  description: string;
  preset: Record<string, any>;
}

export interface RepeaterDraft {
  dataSource: string;
  connectionKey: string;
  databaseType: string;
  masterQuery: string;
  masterTemplate: string;
  pageSize: number;
  refreshInterval: number;
  emptyMessage: string;
  cssClass: string;
  maxRows: number;
  allowExportCsv: boolean;
  allowExportPdf: boolean;
  chartType: string;
  chartLabelCol: string;
  chartValueCol: string;
  queryDependsOn: string;
  reloadOnParamChange: boolean;
  groupByCol: string;
  golfMode: boolean;
  detail1Query: string;
  detail1Template: string;
  detail1TriggerCol: string;
  detail1Placement: string;
  detail2Query: string;
  detail2Template: string;
  detail2TriggerCol: string;
  detail2Placement: string;
  detail3Query: string;
  detail3Template: string;
  detail3TriggerCol: string;
  detail3Placement: string;
  filter1Label: string;
  filter1Type: string;
  filter1Query: string;
  filter1Param: string;
  filter2Label: string;
  filter2Type: string;
  filter2Query: string;
  filter2Param: string;
  extras: Record<string, any>;
}

export type FlatDraftKey = Exclude<keyof RepeaterDraft, 'extras'>;

export interface DraftSummaryItem {
  label: string;
  value: string;
}
