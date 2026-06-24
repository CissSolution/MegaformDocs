// ============================================================
// MegaForm Submissions — Entry Point
// ============================================================

import { clear } from '@shared/dom';
import { createAdapter, readContext } from '@core/index';
import { loadLocale, detectLocale, setDir, resolveI18nBase } from '@i18n';
import type { InitContext, Platform, PlatformAdapter } from '@core/platform';
import { initSubsState, type SubsConfig, type SubmissionFormOption } from './state';
import { SUBMISSION_FILE_LINKS_BADGE } from './file-links';
import { SUBMISSION_SIGNATURE_DATA_BADGE } from './signature-data';
import {
  SUBMISSION_DETAIL_MODAL_BADGE,
  showSubmissionModal,
  type SubmissionModalDisplayOptions,
} from './SubmissionModal';
import {
  SUBMISSION_DETAIL_SHELL_BADGE,
  renderSubmissionDetailShell,
  type SubmissionDetailShellOptions,
} from './submission-detail-shell';
import type { SubmissionWorkflowActionController } from './submission-detail-workflow-panel';
import { SUBMISSION_FLOW_WORKSPACE_BADGE } from './submission-detail-flow-tab';
import { SUBMISSION_FLOW_CANVAS_BADGE } from './submission-flow-canvas';
import { renderSubmissions } from './SubmissionsShell';
import type { FormField, SubmissionDetailInfo, SubmissionInfo } from '@core/types';

const SUBMISSIONS_INIT_BADGE = 'SubmissionsInit v20260507-17';
if (typeof window !== 'undefined') {
  (window as any).__MF_SUBMISSIONS_INIT_BADGE__ = SUBMISSIONS_INIT_BADGE;
  (window as any).__MF_SUBMISSION_FILE_LINKS_BADGE__ = SUBMISSION_FILE_LINKS_BADGE;
  (window as any).__MF_SUBMISSION_SIGNATURE_DATA_BADGE__ = SUBMISSION_SIGNATURE_DATA_BADGE;
  (window as any).__MF_SUBMISSION_DETAIL_MODAL_BADGE__ = SUBMISSION_DETAIL_MODAL_BADGE;
  (window as any).__MF_SUBMISSION_DETAIL_SHELL_BADGE__ = SUBMISSION_DETAIL_SHELL_BADGE;
  (window as any).__MF_SUBMISSION_FLOW_WORKSPACE_BADGE__ = SUBMISSION_FLOW_WORKSPACE_BADGE;
  (window as any).__MF_SUBMISSION_FLOW_CANVAS_BADGE__ = SUBMISSION_FLOW_CANVAS_BADGE;
}

function initSubmissions(rootEl: HTMLElement, mountEl?: HTMLElement): void {
  const ctx = readContext(rootEl);
  const adapter = createAdapter(ctx);

  const config: SubsConfig = {
    formId: parseInt(rootEl.dataset.formId || '0', 10),
    moduleId: ctx.instanceId,
    apiBase: ctx.apiBase,
    formTitle: rootEl.dataset.formTitle || '',
    hideHostChrome: rootEl.dataset.hideHostChrome === 'true',
  };

  const formsStr = rootEl.dataset.forms || '';
  if (formsStr) {
    try {
      const rawForms = JSON.parse(formsStr) as Array<Record<string, unknown>>;
      config.forms = (rawForms || []).map((f) => ({
        formId: Number.parseInt(String((f as any).formId ?? (f as any).FormId ?? '0'), 10) || 0,
        title: String((f as any).title ?? (f as any).Title ?? '').trim(),
        status: String((f as any).status ?? (f as any).Status ?? '').trim(),
        schemaJson: String((f as any).schemaJson ?? (f as any).SchemaJson ?? '').trim(),
      })).filter((f) => f.formId > 0);
    } catch {}
  }


  // [SubmissionsUrlFormLock v20260507-17] If the URL carries `?mfFormId=N` the
  // page must lock to that form (use its schema, hide the "All forms" option as
  // the active selection). Previously the host's `data-form-id` always won, so
  // navigating to `?mfFormId=165#mf-submissions` would still show "All forms".
  try {
    const url = new URL(window.location.href);
    const hash = String(url.hash || '').toLowerCase();
    // Accept both ?mfFormId=N (DNN hash route) and ?formId=N (Oqtane panel route,
    // emitted by the dashboard "View submissions" link → ?mfpanel=submissions&formId=N).
    const shellFormId = Number.parseInt(String(url.searchParams.get('mfFormId') || url.searchParams.get('formId') || '0'), 10) || 0;
    if (shellFormId > 0) {
      config.formId = shellFormId;
    } else if (ctx.platform === 'dnn' && hash.startsWith('#mf-submissions')) {
      config.formId = 0;
      config.formTitle = 'All Submissions';
    }
  } catch {}

  const schemaStr = rootEl.dataset.schema || '';
  if (schemaStr) {
    try { config.schema = JSON.parse(schemaStr); } catch {}
  }

  const matchingForm = (config.forms || []).find(f => f.formId === config.formId);
  if (matchingForm?.schemaJson) {
    try { config.schema = JSON.parse(matchingForm.schemaJson); } catch {}
    if (!config.formTitle) config.formTitle = matchingForm.title || config.formTitle;
  }

  initSubsState(config);

  // [i18n] Load the page-locale catalog before first paint so wrapped chrome
  // translates (English fallback if it fails). ?mflocale → root culture → detect.
  void (async () => {
    try {
      // detectLocale() = ?mflocale → sticky persisted → host culture →
      // data-mf-locale → navigator, so a switcher pick wins over the en-US default.
      const loc = detectLocale();
      setDir(loc);
      if (loc && loc !== 'en-US') {
        // resolveI18nBase() is platform-correct (DNN static assets vs Oqtane endpoint).
        await loadLocale(loc, resolveI18nBase());
      }
    } catch { /* English fallback */ }
    renderSubmissions(mountEl || rootEl, adapter, rootEl);
  })();
}

if (typeof window !== 'undefined') {
  (window as any).MegaForm = (window as any).MegaForm || {};
  (window as any).MegaForm.initSubmissions = initSubmissions;
  (window as any).MegaForm.renderSubmissionDetailShell = (
    mountEl: HTMLElement,
    submission: SubmissionDetailInfo | SubmissionInfo,
    options?: SubmissionDetailGlobalOptions,
  ) => {
    const target = mountEl;
    const adapter = resolveAdapter(options);
    const shell = renderSubmissionDetailShell({
      submission,
      adapter: adapter || undefined,
      fallbackFields: options?.fallbackFields || [],
      initialTab: options?.initialTab,
      mode: options?.mode || 'embedded',
      readOnly: options?.readOnly !== undefined ? options.readOnly : !adapter,
      onSaved: options?.onSaved,
    });
    clear(target);
    target.appendChild(shell.root);
    return shell;
  };
  (window as any).MegaForm.openSubmissionDetailModal = (
    parent: HTMLElement | null,
    submission: SubmissionDetailInfo | SubmissionInfo,
    options?: SubmissionDetailGlobalOptions,
  ) => {
    const adapter = resolveAdapter(options);
    showSubmissionModal(
      parent || document.body,
      submission,
      adapter,
      options?.onClose || (() => {}),
      options?.submissionList,
      {
        initialTab: options?.initialTab,
        readOnly: options?.readOnly,
        workflowActions: options?.workflowActions || null,
      },
    );
  };

  // [SubmissionsAutoMount v20260609-B103] Self-mount any #mf-submissions-root the
  // host renders, regardless of script load order (eager Resource vs late Blazor
  // render). Guarded by dataset.mfMounted so the Blazor poll-boot in
  // SubmissionsView.razor and this observer never double-init the same root.
  const autoMountSubmissions = (): void => {
    document.querySelectorAll<HTMLElement>('#mf-submissions-root[data-shell-mode]').forEach((root) => {
      if (root.dataset.mfMounted) return;
      root.dataset.mfMounted = '1';
      try { initSubmissions(root); } catch (e) { console.error('autoMount initSubmissions failed', e); }
    });
  };
  const startAutoMount = (): void => {
    autoMountSubmissions();
    try {
      const obs = new MutationObserver(() => autoMountSubmissions());
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 15000);
    } catch { /* observer optional */ }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAutoMount);
  else startAutoMount();
}

export { initSubmissions };

interface SubmissionDetailGlobalOptions {
  adapter?: PlatformAdapter;
  platform?: Platform;
  apiBase?: string;
  instanceId?: number;
  formId?: number;
  fallbackFields?: FormField[];
  initialTab?: SubmissionDetailShellOptions['initialTab'];
  mode?: SubmissionDetailShellOptions['mode'];
  readOnly?: boolean;
  onSaved?: () => void;
  onClose?: () => void;
  submissionList?: Array<SubmissionDetailInfo | SubmissionInfo>;
  workflowActions?: SubmissionWorkflowActionController | null;
}

function resolveAdapter(options?: SubmissionDetailGlobalOptions): PlatformAdapter | null {
  if (options?.adapter) return options.adapter;
  if (!options?.apiBase || !options?.instanceId) return null;

  const ctx: InitContext = {
    platform: (options.platform || 'dnn') as Platform,
    instanceId: options.instanceId,
    formId: options.formId || 0,
    apiBase: options.apiBase,
    isAdmin: false,
    viewType: '',
    config: '{}',
  };
  return createAdapter(ctx);
}
