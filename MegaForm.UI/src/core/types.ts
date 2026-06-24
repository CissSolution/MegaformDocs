// ============================================================
// MegaForm Core Types
// Mirrors MegaForm.Core/Models — keep in sync!
// ============================================================

// ── Form ──

export interface FormInfo {
  formId: number;
  moduleId: number;
  portalId: number;
  title: string;
  description: string;
  schemaJson: string;
  settingsJson: string;
  themeJson: string;
  status: 'Draft' | 'Published' | 'Archived';
  submitButtonText: string;
  successMessage: string;
  redirectUrl: string;
  maxSubmissions: number | null;
  expiresOnUtc: string | null;
  requireAuth: boolean;
  enableCaptcha: boolean;
  enableSaveResume: boolean;
  webhookUrl: string;
  notifyEmails: string;
  autoresponderEnabled: boolean;
  autoresponderEmailField: string;
  autoresponderSubject: string;
  autoresponderBody: string;
  createdByUserId: number;
  createdOnUtc: string;
  updatedByUserId: number | null;
  updatedOnUtc: string | null;
  appScope: string;
  submissionCount: number;
}

// ── Schema ──

export interface FormSchema {
  fields: FormField[];
  settings?: SchemaSettings;
  customScripts?: Record<string, string>;
  CustomScripts?: Record<string, string>;
}

export interface FormField {
  key: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  readOnly?: boolean;
  defaultValue?: string;
  cssClass?: string;
  width?: string;
  prefillParam?: string;
  validations?: FieldValidation[];
  validation?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  conditions?: FieldCondition[];
  showIf?: { operator: string; conditions: Array<{ fieldKey: string; operator: string; value: string }> } | null;
  // Row type
  columns?: RowColumn[];
  // Select/Radio/Checkbox
  options?: FieldOption[];
  optionColumns?: number;
  optionDisplay?: 'default' | 'chips' | 'cards' | string;
  allowOptionHtml?: boolean;
  // Composite types (FullName, Address)
  subfields?: FormField[];
  // Html block
  htmlContent?: string;
  // File upload
  fileSettings?: { maxSizeMB?: number; maxFiles?: number; allowedExtensions?: string[] };
  // Widget type
  widgetType?: string;
  widgetConfig?: Record<string, unknown>;
  widgetProps?: Record<string, unknown>;
}

export type FieldType =
  | 'Text' | 'Textarea' | 'Email' | 'Number' | 'Date' | 'Phone' | 'Url'
  | 'Select' | 'Radio' | 'Checkbox'
  | 'File' | 'Rating' | 'Signature' | 'RichText'
  | 'FullName' | 'Address'
  | 'Html' | 'Section' | 'Hidden'
  | 'Row'
  | 'UniqueId' | 'Captcha'
  | 'Widget'
  | string;  // Allow custom widget types

export interface RowColumn {
  span: number;        // grid span (1-12)
  fields: FormField[];
}

export interface FieldOption {
  label: string;
  value: string;
  description?: string;
  desc?: string;
  subLabel?: string;
  meta?: string;
  icon?: string;
  badge?: string;
  richHtml?: string;
  labelHtml?: string;
  html?: string;
  allowHtml?: boolean;
}

export interface FieldValidation {
  type: 'minLength' | 'maxLength' | 'min' | 'max' | 'pattern' | 'custom';
  value: string | number;
  message?: string;
}

export interface FieldCondition {
  field: string;       // key of the controlling field
  operator: 'equals' | 'notEquals' | 'contains' | 'isEmpty' | 'isNotEmpty'
    | 'greaterThan' | 'lessThan';
  value: string;
  action: 'show' | 'hide' | 'require' | 'unrequire';
}

export interface SchemaSettings {
  multiPage?: boolean;
  customHtml?: string;
  customCss?: string;
  customContent?: Record<string, string>;
  customScripts?: Record<string, string>;
  honeypotFieldName?: string;
  defaultLanguage?: string;
  supportedLanguages?: string[];
  [key: string]: unknown;
}

// ── Submission ──

export interface SubmissionInfo {
  submissionId: number;
  formId: number;
  dataJson: string;
  ipAddress: string;
  userAgent: string;
  userId: number | null;
  status: string;
  isSpam: boolean;
  spamScore: number | null;
  submittedOnUtc: string;
  readOnUtc: string | null;
  modifiedOnUtc: string | null;
  modifiedByUserId: number | null;
  formTitle?: string;
  summaryText?: string;
}

export type SubmissionData = Record<string, unknown>;

// ── View Config ──

export type ViewType = 'submit' | 'list' | 'card' | 'detail' | 'continuous';

export interface ModuleViewConfig {
  configId: number;
  moduleId: number;
  formId: number;
  viewType: ViewType;
  viewConfigJson: string;
  cssClass: string;
  cacheMinutes: number;
  permissionsJson: string;
}

export interface ListViewConfig {
  columns: string[];
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  filterable: boolean;
  searchable: boolean;
  searchFields?: string[];
  filters?: ViewFilter[];
  actions?: string[];
}

export interface CardViewConfig {
  cardColumns: number;
  titleField: string;
  excerptField: string;
  imageField: string;
  categoryField: string;
  pageSize: number;
  linkToView?: string;
}

export interface DetailViewConfig {
  fields: string[];
  relatedView?: string;
}

export interface ContinuousViewConfig {
  titleField: string;
  subtitleField: string;
  fields: string[];
}

export interface ViewFilter {
  field: string;
  operator: string;
  value: string;
}

// ── Form View (named views stored in DB) ──

export interface FormViewInfo {
  viewId: number;
  formId: number;
  viewKey: string;
  viewType: string;
  viewName: string;
  isDefault: boolean;
  sortOrder: number;
  configJson: string;
  customHtml: string;
  customCss: string;
  permissionsJson: string;
  createdOnUtc: string;
}

// ── Template ──

export interface FormTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  fields: FormField[];
  submitButtonText: string;
  customHtml: string;
  customCss: string;
  settings?: Record<string, unknown>;
  rules?: any[];
  workflow?: any;
}

// ── Field Metadata (flattened, for config UI) ──

export interface FieldMeta {
  key: string;
  label: string;
  type: string;
}

// ── Paged Result ──

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
}
