// wf-types.ts — TypeScript interfaces for the workflow builder
// Imported by all other wf-* modules.

export type AnyObj = { [key: string]: any };

export type ConditionOperator =
  'equals' | 'notEquals' |
  'contains' | 'notContains' |
  'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual' |
  'isEmpty' | 'isNotEmpty' |
  'startsWith' | 'endsWith' |
  'in' | 'notIn';

export interface FieldOption { label: string; value: string; }
export interface ColumnDef { span: number; fields: FormSchemaField[]; Span?: number; Fields?: FormSchemaField[]; }
export interface FormSchemaField {
  key: string; type: string; label: string; required: boolean;
  placeholder: string; helpText: string; defaultValue: string;
  options: FieldOption[]; validation: AnyObj; width: string;
  htmlContent: string; fileSettings: AnyObj; showIf: AnyObj;
  widgetProps: AnyObj; prefillParam: string; properties: AnyObj;
  columns?: ColumnDef[]; pageIndex?: number; readOnly?: boolean;
  Key?: string; Type?: string; Label?: string;
}
export interface FormSchema {
  fields: FormSchemaField[];
  settings?: AnyObj;
  pages?: AnyObj[];
  [k: string]: any;
}
export interface ConditionRule {
  fieldKey: string; operator: ConditionOperator; value: string; valueType: string;
}
export interface ConditionGroup { logic: string; rules: ConditionRule[]; }
export interface WorkflowVariable { key: string; type: string; defaultValue: string; description: string; }
export interface IMFWorkflowRF {
  _state: AnyObj;
  init: (formId: number, apiBase: string) => void;
  open: (overlay: HTMLElement, schema: FormSchema, workflowDef: any) => void;
  close: () => void;
}
