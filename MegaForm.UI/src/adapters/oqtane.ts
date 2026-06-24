// ============================================================
// Oqtane Platform Adapter
// Uses Oqtane REST endpoints but keeps the same UI contract as other platforms.
// ============================================================

import type { PlatformAdapter, ApiClient, InitContext } from '@core/platform';
import type { FormInfo, SubmissionDetailInfo, SubmissionInfo, ModuleViewConfig, FormViewInfo, FieldMeta, PagedResult } from '@core/types';
import { normalizeSubmissionDetailResponse, normalizeSubmissionInfo } from './submission-detail';

function getHeaders(extra?: Record<string, string>): Record<string, string> {
  return { 'Content-Type': 'application/json', ...(extra || {}) };
}

class OqtaneApiClient implements ApiClient {
  constructor(private readonly apiBase: string) {}

  private async request<T>(endpoint: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(this.apiBase + endpoint, {
      ...opts,
      headers: getHeaders(opts?.headers as Record<string, string>),
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  // [OqFormCasing v20260501-03] System.Text.Json (Oqtane default) serializes
  // FormDto with PascalCase property names. The TS UI reads camelCase. Without
  // normalization the dashboard sees 0 forms. Mirror the DNN adapter pattern.
  private normForm(f: Record<string, unknown>): FormInfo {
    return {
      formId:           (f['FormId']           ?? f['formId']           ?? 0) as number,
      moduleId:         (f['ModuleId']         ?? f['moduleId']         ?? 0) as number,
      portalId:         (f['SiteId']           ?? f['siteId']           ?? f['PortalId'] ?? f['portalId'] ?? 0) as number,
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

  getForm = async (formId: number): Promise<FormInfo> => {
    const raw = await this.request<Record<string, unknown>>(`Form/${formId}`);
    return this.normForm(raw || {});
  };
  listForms = async (parentId?: number): Promise<FormInfo[]> => {
    const raw = await this.request<Record<string, unknown>[]>(`Form/List?moduleId=${parentId || 0}`);
    return (raw || []).map((f) => this.normForm(f || {})).filter((f) => f.formId > 0);
  };
  saveForm = (form: Partial<FormInfo>) => this.request<{ formId: number }>('Form', { method: 'POST', body: JSON.stringify(form) });
  deleteForm = (formId: number) => this.request<void>(`Form/${formId}`, { method: 'DELETE' });
  getFormStats = (formId: number) => this.request<{ totalSubmissions: number }>(`Form/${formId}/Stats`);
  duplicateForm = (formId: number) => this.request<{ formId: number }>(`Form/${formId}/Duplicate`, { method: 'POST' });
  saveWorkflow = (formId: number, workflow: any) => this.request<void>('Form/Workflow/Save', { method: 'POST', body: JSON.stringify({ formId, workflow }) });

  getSubmissions = async (formId: number, opts?: { status?: string; search?: string; pageIndex?: number; pageSize?: number; dateFrom?: string; dateTo?: string; }): Promise<PagedResult<SubmissionInfo>> => {
    const p = new URLSearchParams();
    if (formId > 0) p.set('formId', String(formId));
    if (opts?.status) p.set('status', opts.status);
    if (opts?.search) p.set('search', opts.search);
    if (opts?.pageIndex != null) p.set('pageIndex', String(opts.pageIndex));
    if (opts?.pageSize != null) p.set('pageSize', String(opts.pageSize));
    if (opts?.dateFrom) p.set('dateFrom', opts.dateFrom);
    if (opts?.dateTo) p.set('dateTo', opts.dateTo);
    // The Submissions endpoint serialises PascalCase (Items/TotalCount/...) while
    // other endpoints use camelCase — accept BOTH so the list isn't silently empty.
    const raw = await this.request<any>(`Submissions?${p}`);
    const items = (raw.items ?? raw.Items ?? (raw as any).data ?? []) as Record<string, unknown>[];
    return {
      items: (items || []).map((entry) => normalizeSubmissionInfo(entry)),
      totalCount: raw.totalCount ?? raw.TotalCount ?? raw.total ?? 0,
      pageIndex: raw.pageIndex ?? raw.PageIndex ?? raw.page ?? 0,
      pageSize: raw.pageSize ?? raw.PageSize ?? opts?.pageSize ?? 25,
    };
  };

  getSubmission = async (submissionId: number): Promise<SubmissionInfo> => {
    const detail = await this.getSubmissionDetail(submissionId);
    return detail.submission;
  };

  getSubmissionDetail = async (submissionId: number): Promise<SubmissionDetailInfo> =>
    normalizeSubmissionDetailResponse(await this.request<unknown>(`Submissions/${submissionId}`));

  updateSubmissionStatus = (submissionId: number, status: string) =>
    this.request<void>(`Submissions/${submissionId}/Status`, { method: 'POST', body: JSON.stringify({ status }) });
  updateSubmissionData = (submissionId: number, data: Record<string, unknown>) =>
    this.request<void>(`Submissions/UpdateData?submissionId=${submissionId}`, { method: 'POST', body: JSON.stringify(data) });
  deleteSubmission = (submissionId: number) => this.request<void>(`Submissions/${submissionId}`, { method: 'DELETE' });
  bulkDeleteSubmissions = async (ids: number[]) => { for (const id of ids) await this.deleteSubmission(id); };
  exportSubmissions = async (formId: number, format = 'json') => {
    const res = await fetch(this.apiBase + `Submissions/Export?formId=${formId}&format=${format}`, { headers: getHeaders(), credentials: 'include' });
    return res.blob();
  };

  getModuleConfig = (instanceId: number) => this.request<any>(`ModuleConfig/${instanceId}`);
  saveModuleConfig = (config: any) => this.request<void>('ModuleConfig', { method: 'POST', body: JSON.stringify(config) });
  getFields = (formId: number) => this.request<{ fields: FieldMeta[] }>(`ModuleConfig/${formId}/Fields`);
  getFormViews = async (formId: number): Promise<FormViewInfo[]> => { const raw = await this.request<{ views: FormViewInfo[] }>(`Phase2/GetViewConfigs?formId=${formId}`); return raw?.views ?? []; };
  saveFormView = (view: Partial<FormViewInfo>) => this.request<{ viewId: number }>('Phase2/SaveViewConfig', { method: 'POST', body: JSON.stringify(view) });
  deleteFormView = (viewId: number) => this.request<void>(`Phase2/DeleteViewConfig?viewId=${viewId}`, { method: 'POST' });
  getSchema = (formId: number) => this.request<any>(`Schema/${formId}`);
  submit = (formId: number, data: Record<string, unknown>) => this.request<any>('Submit', { method: 'POST', body: JSON.stringify({ formId, data }) });
}

export function createOqtaneAdapter(ctx: InitContext): PlatformAdapter {
  const api = new OqtaneApiClient(ctx.apiBase);
  return {
    platform: 'oqtane',
    api,
    navigateTo(path: string) { window.location.href = path; },
    showToast(message: string) { console.log('[MegaForm][Oqtane]', message); },
    getUrl(view: 'builder' | 'submissions' | 'settings', formId?: number) {
      switch (view) {
        case 'builder': return getPlatformRoute('builder', formId);
        case 'submissions': return getPlatformRoute('submissions', formId);
        case 'settings': return getPlatformRoute('settings');
        default: return getPlatformRoute('dashboard');
      }
    },
    getCurrentUser() { return { userId: 0, userName: '', isAdmin: ctx.isAdmin }; }
  };
}
