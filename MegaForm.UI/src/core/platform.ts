// ============================================================
// Platform Adapter — abstracts platform-specific API & auth
// Each platform (DNN, Oqtane, Umbraco) provides its own implementation.
// ============================================================

import type {
  FormInfo, SubmissionInfo, ModuleViewConfig,
  FormViewInfo, FieldMeta, PagedResult
} from './types';

export type Platform = 'dnn' | 'oqtane' | 'umbraco' | 'standalone';

/**
 * Context passed to MegaForm.init() from the host page.
 * Read from data-* attributes on the root element.
 */
export interface InitContext {
  platform: Platform;
  instanceId: number;    // ModuleId (DNN/Oqtane) or ContentId (Umbraco)
  formId: number;
  apiBase: string;
  isAdmin: boolean;
  viewType: string;
  config: string;        // JSON string of view config
}

/**
 * Platform-agnostic API client interface.
 * All server calls go through this — adapters handle auth headers.
 */
export interface ApiClient {
  // Forms
  getForm(formId: number): Promise<FormInfo>;
  listForms(parentId?: number): Promise<FormInfo[]>;
  saveForm(form: Partial<FormInfo>): Promise<{ formId: number }>;
  deleteForm(formId: number): Promise<void>;
  getFormStats(formId: number): Promise<{ totalSubmissions: number }>;
  duplicateForm(formId: number): Promise<{ formId: number }>;
  saveWorkflow?(formId: number, workflow: any): Promise<void>;

  // Submissions
  getSubmissions(formId: number, opts?: {
    status?: string; search?: string;
    pageIndex?: number; pageSize?: number;
    /** [SourcePicker v20260716] auto|json|sql — server-side source routing; trust only the response echo. */
    source?: string;
  }): Promise<PagedResult<SubmissionInfo>>;
  getSubmission(submissionId: number): Promise<SubmissionInfo>;
  updateSubmissionStatus(submissionId: number, status: string): Promise<void>;
  updateSubmissionData?(submissionId: number, data: Record<string, unknown>): Promise<void>;
  deleteSubmission(submissionId: number): Promise<void>;
  bulkDeleteSubmissions?(ids: number[]): Promise<void>;
  exportSubmissions(formId: number, format?: string): Promise<Blob>;

  // Module/Instance Config
  getModuleConfig(instanceId: number): Promise<{
    configured: boolean;
    forms: Array<{ formId: number; title: string; status: string }>;
    config: ModuleViewConfig | null;
    fields?: FieldMeta[];
  }>;
  saveModuleConfig(config: {
    moduleId: number;
    formId: number;
    viewType: string;
    viewConfig: string;
    cssClass?: string;
    cacheMinutes?: number;
    permissions?: string;
  }): Promise<void>;

  // Fields
  getFields(formId: number): Promise<{ fields: FieldMeta[] }>;

  // Views
  getFormViews(formId: number): Promise<FormViewInfo[]>;
  saveFormView(view: Partial<FormViewInfo>): Promise<{ viewId: number }>;
  deleteFormView(viewId: number): Promise<void>;

  // Schema (public endpoint for form rendering)
  getSchema(formId: number): Promise<{
    formId: number; title: string; description: string;
    schema: string; submitButtonText: string;
    enableCaptcha: boolean; themeJson: string;
  }>;

  // Submit (public endpoint)
  submit(formId: number, data: Record<string, unknown>): Promise<{
    success: boolean; submissionId?: number; error?: string;
  }>;
}

/**
 * Platform adapter — created by each platform's init script.
 */
export interface PlatformAdapter {
  readonly platform: Platform;
  readonly api: ApiClient;

  /** Navigate within the platform (e.g., to builder page) */
  navigateTo(path: string): void;

  /** Show toast/notification using platform's UI */
  showToast(message: string, type: 'success' | 'error' | 'info'): void;

  /** Get URL for a specific view (builder, submissions, etc.) */
  getUrl(view: 'builder' | 'submissions' | 'settings', formId?: number): string;

  /** Current user info */
  getCurrentUser(): { userId: number; userName: string; isAdmin: boolean };
}
