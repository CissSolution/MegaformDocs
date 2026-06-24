export type ColumnType = 'text' | 'email' | 'number' | 'tel' | 'date' | 'select' | 'checkbox' | 'textarea';
export type GridRepeaterDataMode = 'manual' | 'sql';
export type GridRepeaterQueryType = 'sql' | 'storedproc';
export type GridRepeaterOptionsSource = 'static' | 'sql';

export interface GridRepeaterSelectOption {
  value: string;
  label: string;
}

export interface GridRepeaterColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  required?: boolean;
  placeholder?: string;
  width?: string;
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<string | GridRepeaterSelectOption>;
  optionsSource?: GridRepeaterOptionsSource;
  optionsType?: GridRepeaterQueryType;
  optionsConnectionKey?: string;
  optionsDatabaseType?: string;
  optionsSql?: string;
  optionsDependsOn?: string[] | string;
  optionsReloadOnChange?: boolean;
  readOnly?: boolean;
  hideInHeader?: boolean;
}

export interface GridRepeaterProps {
  columns: GridRepeaterColumnDef[];
  minRows: number;
  maxRows: number;
  allowReorder: boolean;
  allowDuplicateRows: boolean;
  addRowLabel: string;
  emptyMessage: string;
  layout: 'grid' | string;
  readOnlyMode: boolean;
  dataMode: GridRepeaterDataMode;
  connectionKey: string;
  databaseType: string;
  dataSource: GridRepeaterQueryType;
  masterQuery: string;
  queryDependsOn: string;
  reloadOnParamChange: boolean;
  pageSize: number;
  displayPreset: 'table' | 'cards' | 'grid';
  headerTemplate: string;
  rowTemplate: string;
  customCss: string;
  pagerPrevLabel: string;
  pagerNextLabel: string;
  pagerSummaryTemplate: string;
  pagerTemplate: string;
}

export interface GridRepeaterDesignerOpts {
  initialJson?: string;
  onApply?: (json: string) => void;
}
