// ============================================================
// ASP Core Platform Adapter
// Auth: DevBypass (dev) / JWT Bearer (prod) — no ServicesFramework
// API base: /api/MegaForm/
// ============================================================

import type { PlatformAdapter, ApiClient, InitContext } from '@core/platform';
import type {
  FormInfo, SubmissionDetailInfo, SubmissionInfo, ModuleViewConfig,
  FormViewInfo, FieldMeta, PagedResult,
} from '@core/types';
import { normalizeSubmissionDetailResponse, normalizeSubmissionInfo } from './submission-detail';

// ── Auth token helpers ────────────────────────────────────

/** Try to get Bearer token from window (injected by auth layer) */
function getBearerToken(): string | null {
  return (window as any).__MF_TOKEN || null;
}

/** Get ASP Core request headers — no ServicesFramework dependency */
function getHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getBearerToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return { ...headers, ...extra };
}

// ── API Client ────────────────────────────────────────────

class AspCoreApiClient implements ApiClient {
  constructor(private readonly apiBase: string) {}

  private async request<T>(endpoint: string, opts?: RequestInit): Promise<T> {
    const url = this.apiBase + endpoint;
    const res = await fetch(url, {
      ...opts,
      headers: getHeaders(opts?.headers as Record<string, string>),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  // [WebFormCasing v20260501-05] ASP Core uses System.Text.Json (PascalCase by
  // default). Without normalization, listForms returns objects whose .formId is
  // undefined, so Dashboard's filter (f.formId > 0) drops every form and shows
  // "0 forms". Mirror Oqtane/DNN normForm() pattern — tolerant of both casings.
  private normForm(f: Record<string, unknown>): FormInfo {
    return {
      formId:           (f['FormId']           ?? f['formId']           ?? 0) as number,
      moduleId:         (f['ModuleId']         ?? f['moduleId']         ?? 0) as number,
      portalId:         (f['PortalId']         ?? f['portalId']         ?? f['SiteId'] ?? f['siteId'] ?? 0) as number,
      title:            (f['Title']            ?? f['title']            ?? '') as string,
      description:      (f['Description']      ?? f['description']      ?? '') as string,
      schemaJson:       (f['SchemaJson']       ?? f['schemaJson']       ?? '{}') as string,
      settingsJson:     (f['SettingsJson']     ?? f['settingsJson']     ?? '{}') as string,
      themeJson:        (f['ThemeJson']        ?? f['themeJson']        ?? '') as string,
      status:           ((f['Status']          ?? f['status']           ?? 'Draft') as FormInfo['status']),
      submitButtonText: (f['SubmitButtonText'] ?? f['submitButtonText'] ?? 'Submit') as string,
      successMessage:   (f['SuccessMessage']   ?? f['successMessage']   ?? '') as string,
      redirectUrl:      (f['RedirectUrl']      ?? f['redirectUrl']      ?? '') as string,
      maxSubmissions:   (f['MaxSubmissions']   ?? f['maxSubmissions']   ?? null) as number | null,
      expiresOnUtc:     (f['ExpiresOnUtc']     ?? f['expiresOnUtc']     ?? null) as string | null,
      requireAuth:      !!(f['RequireAuth']    ?? f['requireAuth']),
      enableCaptcha:    !!(f['EnableCaptcha']  ?? f['enableCaptcha']),
      enableSaveResume: !!(f['EnableSaveResume']??f['enableSaveResume']),
      webhookUrl:       (f['WebhookUrl']       ?? f['webhookUrl']       ?? '') as string,
      notifyEmails:     (f['NotifyEmails']     ?? f['notifyEmails']     ?? '') as string,
      autoresponderEnabled:    !!(f['AutoresponderEnabled']    ?? f['autoresponderEnabled']),
      autoresponderEmailField: (f['AutoresponderEmailField']   ?? f['autoresponderEmailField']   ?? '') as string,
      autoresponderSubject:    (f['AutoresponderSubject']      ?? f['autoresponderSubject']      ?? '') as string,
      autoresponderBody:       (f['AutoresponderBody']         ?? f['autoresponderBody']         ?? '') as string,
      createdByUserId:  (f['CreatedByUserId']  ?? f['createdByUserId']  ?? 0) as number,
      createdOnUtc:     (f['CreatedOnUtc']     ?? f['createdOnUtc']     ?? '') as string,
      updatedByUserId:  (f['UpdatedByUserId']  ?? f['updatedByUserId']  ?? null) as number | null,
      updatedOnUtc:     (f['UpdatedOnUtc']     ?? f['updatedOnUtc']     ?? null) as string | null,
      appScope:         (f['AppScope']         ?? f['appScope']         ?? '') as string,
      submissionCount:  (f['SubmissionCount']  ?? f['submissionCount']  ?? f['TotalSubmissions'] ?? f['totalSubmissions'] ?? 0) as number,
    };
  }

  // ── Forms ──
  getForm = async (formId: number): Promise<FormInfo> => {
    const raw = await this.request<Record<string, unknown>>(`Form/Get?formId=${formId}`);
    return this.normForm(raw || {});
  };

  listForms = async (_parentId?: number): Promise<FormInfo[]> => {
    const raw = await this.request<Record<string, unknown>[]>('Form/ListAll');
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

  // ── Submissions ──
  getSubmissions = async (formId: number, opts?: {
    status?: string; search?: string; pageIndex?: number; pageSize?: number; dateFrom?: string; dateTo?: string;
  }): Promise<PagedResult<SubmissionInfo>> => {
    const p = new URLSearchParams();
    if (formId > 0) p.set('formId', String(formId));
    if (opts?.status)    p.set('status',    opts.status);
    if (opts?.search)    p.set('search',    opts.search);
    if (opts?.pageIndex != null) p.set('pageIndex', String(opts.pageIndex));
    if (opts?.pageSize  != null) p.set('pageSize',  String(opts.pageSize));
    if (opts?.dateFrom) p.set('dateFrom', opts.dateFrom);
    if (opts?.dateTo) p.set('dateTo', opts.dateTo);
    const raw = await this.request<{
      items: Record<string, unknown>[]; totalCount: number;
      pageIndex: number; pageSize: number;
    }>(`Submissions/List?${p}`);
    return {
      items: (raw.items || []).map((s) => normalizeSubmissionInfo(s)),
      totalCount: raw.totalCount,
      pageIndex:  raw.pageIndex,
      pageSize:   raw.pageSize,
    };
  };

  getSubmission = async (submissionId: number): Promise<SubmissionInfo> => {
    const detail = await this.getSubmissionDetail(submissionId);
    return detail.submission;
  };

  getSubmissionDetail = async (submissionId: number): Promise<SubmissionDetailInfo> =>
    normalizeSubmissionDetailResponse(await this.request<unknown>(`Submissions/Get?submissionId=${submissionId}`));

  updateSubmissionStatus = (submissionId: number, status: string) =>
    this.request<void>(
      `Submissions/UpdateStatus?submissionId=${submissionId}&status=${status}`,
      { method: 'POST', body: '{}' }
    );

  updateSubmissionData = (submissionId: number, data: Record<string, unknown>) =>
    this.request<void>(`Submissions/UpdateData?submissionId=${submissionId}`,
      { method: 'POST', body: JSON.stringify(data) }
    );

  deleteSubmission = (submissionId: number) =>
    this.request<void>(`Submissions/Delete?submissionId=${submissionId}`,
      { method: 'POST', body: '{}' }
    );

  bulkDeleteSubmissions = (ids: number[]) =>
    this.request<void>('Submissions/BulkDelete',
      { method: 'POST', body: JSON.stringify({ ids }) }
    );

  exportSubmissions = async (formId: number, format = 'json') => {
    const res = await fetch(this.apiBase + `Submissions/Export?formId=${formId}&format=${format}`, {
      headers: getHeaders(),
    });
    return res.blob();
  };

  // ── Module Config ──
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
    this.request<void>('ModuleConfig/Save',
      { method: 'POST', body: JSON.stringify(config) }
    );

  getFields = (formId: number) =>
    this.request<{ fields: FieldMeta[] }>(`ModuleConfig/Fields?formId=${formId}`);

  // ── Views ──
  getFormViews = async (formId: number): Promise<FormViewInfo[]> => {
    const raw = await this.request<{ views: FormViewInfo[] }>(
      `Phase2/GetViewConfigs?formId=${formId}`
    );
    return raw?.views ?? [];
  };

  saveFormView = (view: Partial<FormViewInfo>) =>
    this.request<{ viewId: number }>('Phase2/SaveViewConfig',
      { method: 'POST', body: JSON.stringify(view) }
    );

  deleteFormView = (viewId: number) =>
    this.request<void>(`Phase2/DeleteViewConfig?viewId=${viewId}`, { method: 'POST' });

  // ── Schema / Submit ──
  getSchema = (formId: number) =>
    this.request<{
      formId: number; title: string; description: string;
      schema: string; submitButtonText: string;
      enableCaptcha: boolean; themeJson: string;
    }>(`Submit/Schema?formId=${formId}`);

  submit = (formId: number, data: Record<string, unknown>) =>
    this.request<{ success: boolean; submissionId?: number; error?: string }>('Submit/Post',
      { method: 'POST', body: JSON.stringify({ formId, data }) }
    );
}

// ── Toast ─────────────────────────────────────────────────

let _toastContainer: HTMLElement | null = null;

function getToastContainer(): HTMLElement {
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'mf-toast-container';
    _toastContainer.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none';
    document.body.appendChild(_toastContainer);
  }
  return _toastContainer;
}

function showToast(message: string, type: 'success' | 'error' | 'info'): void {
  const colors: Record<string, string> = {
    success: '#059669', error: '#dc2626', info: '#6366f1',
  };
  const icons: Record<string, string> = {
    success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle',
  };
  const toast = document.createElement('div');
  toast.style.cssText =
    `background:${colors[type]};color:#fff;padding:10px 16px;border-radius:8px;` +
    `font:500 .82rem/1.4 system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.18);` +
    `display:flex;align-items:center;gap:8px;pointer-events:auto;` +
    `transform:translateX(120%);transition:transform .2s;max-width:320px;`;
  toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${message}</span>`;
  getToastContainer().appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// ── Adapter factory ───────────────────────────────────────

export function createAspCoreAdapter(ctx: InitContext): PlatformAdapter {
  const api = new AspCoreApiClient(ctx.apiBase);

  return {
    platform: 'standalone',
    api,

    navigateTo(path: string) {
      window.location.href = path;
    },

    showToast,

    getUrl(view: 'builder' | 'submissions' | 'settings', formId?: number) {
      if (ctx.platform === 'umbraco') {
        switch (view) {
          case 'builder':     return formId ? `/umbraco/MegaForm/Builder/${formId}` : '/umbraco/MegaForm/Builder';
          case 'submissions': return formId ? `/umbraco/MegaForm/Submissions?formId=${formId}` : '/umbraco/MegaForm/Submissions';
          case 'settings':    return '/umbraco/MegaForm/Admin#settings';
          default:            return '/umbraco/MegaForm/Admin';
        }
      }
      switch (view) {
        case 'builder':     return formId ? `/admin/builder?formId=${formId}` : '/admin/builder';
        case 'submissions': return formId ? `/admin/submissions?formId=${formId}` : '/admin/submissions';
        case 'settings':    return '/admin/settings';
        default:            return '/admin';
      }
    },

    getCurrentUser() {
      return { userId: 0, userName: '', isAdmin: ctx.isAdmin };
    },
  };
}
