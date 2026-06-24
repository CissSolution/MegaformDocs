// ============================================================
// DNN Platform Adapter
// Handles DNN-specific auth (ServicesFramework), URL patterns
// ============================================================

import type { PlatformAdapter, ApiClient, InitContext } from '@core/platform';
import type {
  FormInfo, SubmissionDetailInfo, SubmissionInfo, ModuleViewConfig,
  FormViewInfo, FieldMeta, PagedResult
} from '@core/types';
import { getPlatformRoute } from '@shared/platform-host';
import { normalizeSubmissionDetailResponse, normalizeSubmissionInfo } from './submission-detail';

const DNN_ADAPTER_FORMS_BADGE = 'DnnAdapterForms v20260527-04-portalid-query';
if (typeof window !== 'undefined') { (window as any).__MF_DNN_ADAPTER_FORMS_BADGE__ = DNN_ADAPTER_FORMS_BADGE; }

declare const jQuery: {
  ServicesFramework(moduleId: number): {
    getAntiForgeryValue(): string;
    getTabId(): string;
    getModuleId(): string;
  };
};

/**
 * Resolve the active portalId for an API request.
 * Order: __MF_PLATFORM__.portalId (rendered by the host) → DNN inline config →
 * 0 (the root portal default).
 * We carry portalId on the URL as `?portalId=N` rather than in a header so
 * DNN's framework doesn't cross-validate it against the alias-resolved portal
 * (which 400s for child-portal subpath aliases like `/megaf` — see
 * https://github.com/dnnsoftware/Dnn.Platform / "Specified page is not in this
 * site").
 */
function getDnnPortalId(): number {
  try {
    const w = (typeof window !== 'undefined' ? window : null) as unknown as Record<string, unknown> | null;
    const platform = (w && w['__MF_PLATFORM__']) as Record<string, unknown> | undefined;
    const raw = platform && (platform['portalId'] ?? platform['PortalId']);
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
    if (isFinite(n) && n >= 0) return n;
  } catch { /* swallow */ }
  return 0;
}

/** Append `?portalId=N` (or `&portalId=N`) so server uses the caller's portal. */
function withPortalId(url: string): string {
  if (/[?&]portalId=/i.test(url)) return url;
  const sep = url.indexOf('?') >= 0 ? '&' : '?';
  return url + sep + 'portalId=' + getDnnPortalId();
}

/**
 * DNN auth headers. We deliberately DO NOT set `TabId` / `ModuleId` headers.
 * DNN's framework cross-checks those against the alias-resolved portal and
 * rejects with 400 "Specified page is not in this site" whenever the page
 * lives in a child-portal subpath alias (e.g. /megaf) but the API URL is
 * root-relative (/DesktopModules/MegaForm/API/...). The server reads
 * `portalId`, `moduleId`, `tabId` from the URL query string instead via
 * withPortalId() and per-endpoint params.
 */
function getDnnHeaders(_instanceId: number): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  try {
    if (typeof jQuery !== 'undefined' && jQuery.ServicesFramework) {
      const sf = jQuery.ServicesFramework(_instanceId);
      const token = sf.getAntiForgeryValue();
      if (token) headers['RequestVerificationToken'] = token;
    }
  } catch { /* swallow */ }
  return headers;
}

class DnnApiClient implements ApiClient {
  constructor(
    private apiBase: string,
    private instanceId: number
  ) {}

  private async request<T>(endpoint: string, opts?: RequestInit): Promise<T> {
    const headers = getDnnHeaders(this.instanceId);
    const url = withPortalId(this.apiBase + endpoint);
    const res = await fetch(url, {
      ...opts,
      headers: { ...headers, ...opts?.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[MegaForm API] ${res.status} ${res.statusText}`, { url, body: body.substring(0, 200) });
      throw new Error(`API ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }

  private normForm(f: Record<string, unknown>): FormInfo {
    return {
      formId: (f['FormId'] ?? f['formId'] ?? 0) as number,
      moduleId: (f['ModuleId'] ?? f['moduleId'] ?? 0) as number,
      portalId: (f['PortalId'] ?? f['portalId'] ?? 0) as number,
      title: (f['Title'] ?? f['title'] ?? '') as string,
      description: (f['Description'] ?? f['description'] ?? '') as string,
      schemaJson: (f['SchemaJson'] ?? f['schemaJson'] ?? '{}') as string,
      settingsJson: (f['SettingsJson'] ?? f['settingsJson'] ?? '{}') as string,
      themeJson: (f['ThemeJson'] ?? f['themeJson'] ?? '') as string,
      status: ((f['Status'] ?? f['status'] ?? 'Draft') as FormInfo['status']),
      submitButtonText: (f['SubmitButtonText'] ?? f['submitButtonText'] ?? 'Submit') as string,
      successMessage: (f['SuccessMessage'] ?? f['successMessage'] ?? '') as string,
      redirectUrl: (f['RedirectUrl'] ?? f['redirectUrl'] ?? '') as string,
      maxSubmissions: (f['MaxSubmissions'] ?? f['maxSubmissions'] ?? null) as number | null,
      expiresOnUtc: (f['ExpiresOnUtc'] ?? f['expiresOnUtc'] ?? null) as string | null,
      requireAuth: !!(f['RequireAuth'] ?? f['requireAuth']),
      enableCaptcha: !!(f['EnableCaptcha'] ?? f['enableCaptcha']),
      enableSaveResume: !!(f['EnableSaveResume'] ?? f['enableSaveResume']),
      webhookUrl: (f['WebhookUrl'] ?? f['webhookUrl'] ?? '') as string,
      notifyEmails: (f['NotifyEmails'] ?? f['notifyEmails'] ?? '') as string,
      autoresponderEnabled: !!(f['AutoresponderEnabled'] ?? f['autoresponderEnabled']),
      autoresponderEmailField: (f['AutoresponderEmailField'] ?? f['autoresponderEmailField'] ?? '') as string,
      autoresponderSubject: (f['AutoresponderSubject'] ?? f['autoresponderSubject'] ?? '') as string,
      autoresponderBody: (f['AutoresponderBody'] ?? f['autoresponderBody'] ?? '') as string,
      createdByUserId: (f['CreatedByUserId'] ?? f['createdByUserId'] ?? 0) as number,
      createdOnUtc: (f['CreatedOnUtc'] ?? f['createdOnUtc'] ?? '') as string,
      updatedByUserId: (f['UpdatedByUserId'] ?? f['updatedByUserId'] ?? null) as number | null,
      updatedOnUtc: (f['UpdatedOnUtc'] ?? f['updatedOnUtc'] ?? null) as string | null,
      appScope: (f['AppScope'] ?? f['appScope'] ?? '') as string,
      submissionCount: (f['SubmissionCount'] ?? f['submissionCount'] ?? f['TotalSubmissions'] ?? f['totalSubmissions'] ?? 0) as number,
    };
  }

  // Forms
  getForm = async (formId: number) => {
    const raw = await this.request<Record<string, unknown>>(`Form/Get?formId=${formId}`);
    return this.normForm(raw || {});
  };

  listForms = async (_parentId?: number) => {
    const raw = await this.request<Record<string, unknown>[]>('Form/ListAll');
    void DNN_ADAPTER_FORMS_BADGE;
    return (raw || []).map((f) => this.normForm(f || {})).filter((f) => f.formId > 0);
  };

  saveForm = (form: Partial<FormInfo>) =>
    this.request<{ formId: number }>('Form/Save', {
      method: 'POST', body: JSON.stringify(form),
    });

  deleteForm = (formId: number) =>
    this.request<void>(`Form/Delete?formId=${formId}`, { method: 'POST' });

  getFormStats = (formId: number) =>
    this.request<{ totalSubmissions: number }>(`Form/Stats?formId=${formId}`);

  duplicateForm = (formId: number) =>
    this.request<{ formId: number }>(`Form/Duplicate?formId=${formId}`, { method: 'POST' });

  saveWorkflow = (formId: number, workflow: any) =>
    this.request<void>('Workflow/Save', {
      method: 'POST', body: JSON.stringify({ formId, workflow }),
    });

  // Submissions
  getSubmissions = async (formId: number, opts?: {
    status?: string; search?: string; pageIndex?: number; pageSize?: number; dateFrom?: string; dateTo?: string;
  }): Promise<PagedResult<SubmissionInfo>> => {
    const p = new URLSearchParams();
    p.set('formId', String(formId > 0 ? formId : 0));
    if (opts?.status) p.set('status', opts.status);
    if (opts?.search) p.set('search', opts.search);
    if (opts?.pageIndex != null) p.set('pageIndex', String(opts.pageIndex));
    if (opts?.pageSize != null) p.set('pageSize', String(opts.pageSize));
    if (opts?.dateFrom) p.set('dateFrom', opts.dateFrom);
    if (opts?.dateTo) p.set('dateTo', opts.dateTo);
    const raw = await this.request<{ items: Record<string, unknown>[]; totalCount: number; pageIndex: number; pageSize: number }>(`Submissions/List?${p}`);
    return {
      items: (raw.items || []).map((s) => normalizeSubmissionInfo(s)),
      totalCount: raw.totalCount,
      pageIndex: raw.pageIndex,
      pageSize: raw.pageSize,
    };
  };

  getSubmission = async (submissionId: number): Promise<SubmissionInfo> => {
    const detail = await this.getSubmissionDetail(submissionId);
    return detail.submission;
  };

  getSubmissionDetail = async (submissionId: number): Promise<SubmissionDetailInfo> =>
    normalizeSubmissionDetailResponse(await this.request<unknown>(`Submissions/Get?submissionId=${submissionId}`));

  updateSubmissionStatus = (submissionId: number, status: string) =>
    this.request<void>(`Submissions/UpdateStatus?submissionId=${submissionId}&status=${status}`, {
      method: 'POST',
      body: '{}',
    });

  updateSubmissionData = (submissionId: number, data: Record<string, unknown>) =>
    this.request<void>(`Submissions/UpdateData?submissionId=${submissionId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });

  deleteSubmission = (submissionId: number) =>
    this.request<void>(`Submissions/Delete?submissionId=${submissionId}`, {
      method: 'POST',
      body: '{}',
    });

  bulkDeleteSubmissions = (ids: number[]) =>
    this.request<void>('Submissions/BulkDelete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });

  exportSubmissions = async (formId: number, format = 'json') => {
    const res = await fetch(this.apiBase + `Submissions/Export?formId=${formId}&format=${format}`, {
      headers: getDnnHeaders(this.instanceId),
    });
    return res.blob();
  };

  // Module Config
  getModuleConfig = (instanceId: number) =>
    this.request<{
      configured: boolean;
      forms: Array<{ formId: number; title: string; status: string }>;
      config: ModuleViewConfig | null;
      fields?: FieldMeta[];
    }>(`ModuleConfig/Get?moduleId=${instanceId}`);

  saveModuleConfig = (config: {
    moduleId: number; formId: number; viewType: string;
    viewConfig: string; cssClass?: string; cacheMinutes?: number; permissions?: string;
  }) =>
    this.request<void>('ModuleConfig/Save', {
      method: 'POST', body: JSON.stringify(config),
    });

  // Fields
  getFields = (formId: number) =>
    this.request<{ fields: FieldMeta[] }>(`ModuleConfig/Fields?formId=${formId}`);

  // Views
  getFormViews = async (formId: number): Promise<FormViewInfo[]> => {
    const raw = await this.request<{ views: FormViewInfo[] }>(`Phase2/GetViewConfigs?formId=${formId}`);
    return raw?.views ?? [];
  };

  saveFormView = (view: Partial<FormViewInfo>) =>
    this.request<{ viewId: number }>('Phase2/SaveViewConfig', {
      method: 'POST', body: JSON.stringify(view),
    });

  deleteFormView = (viewId: number) =>
    this.request<void>(`Phase2/DeleteViewConfig?viewId=${viewId}`, { method: 'POST' });

  // Schema (public)
  getSchema = (formId: number) =>
    this.request<{
      formId: number; title: string; description: string;
      schema: string; submitButtonText: string;
      enableCaptcha: boolean; themeJson: string;
    }>(`Submit/Schema?formId=${formId}`);

  // Submit (public)
  submit = (formId: number, data: Record<string, unknown>) =>
    this.request<{ success: boolean; submissionId?: number; error?: string }>('Submit/Post', {
      method: 'POST', body: JSON.stringify({ formId, data }),
    });
}

export function createDnnAdapter(ctx: InitContext): PlatformAdapter {
  const api = new DnnApiClient(ctx.apiBase, ctx.instanceId);

  return {
    platform: 'dnn',
    api,

    navigateTo(path: string) {
      window.location.href = path;
    },

    showToast(message: string, type: 'success' | 'error' | 'info') {
      // DNN doesn't have a built-in toast — use simple alert or custom
      const div = document.createElement('div');
      div.className = `mf-toast mf-toast-${type}`;
      div.textContent = message;
      document.body.appendChild(div);
      setTimeout(() => div.remove(), 3000);
    },

    getUrl(view: 'builder' | 'submissions' | 'settings', formId?: number) {
      switch (view) {
        case 'builder': return getPlatformRoute('builder', formId);
        case 'submissions': return getPlatformRoute('submissions', formId);
        case 'settings': return getPlatformRoute('settings');
        default: return getPlatformRoute('dashboard');
      }
    },

    getCurrentUser() {
      return {
        userId: 0,  // Resolved server-side
        userName: '',
        isAdmin: ctx.isAdmin,
      };
    },
  };
}
