import { h } from '@shared/dom';
import { createWorkflowInboxApi } from './api';
import { createWorkflowInboxState } from './state';
import { renderTaskList } from './task-list';
import { renderTaskDetail } from './task-detail';
import type { WorkflowInboxConfig, WorkflowInboxTask } from './types';

const WORKFLOW_INBOX_BADGE = 'WorkflowInboxTs v20260511-03';

interface WorkflowInboxDomRefs {
  feedback: HTMLElement | null;
  myTaskCount: HTMLElement | null;
  roleTaskCount: HTMLElement | null;
  myTaskList: HTMLElement | null;
  roleTaskList: HTMLElement | null;
  taskDetail: HTMLElement | null;
  refreshButton: HTMLButtonElement | null;
}

export function initWorkflowInbox(root: HTMLElement): void {
  if (root.dataset.mfWorkflowInboxBooted === '1') return;
  root.dataset.mfWorkflowInboxBooted = '1';
  const config = readConfig(root);
  const api = createWorkflowInboxApi(config);
  const state = createWorkflowInboxState(config.initialTaskId);
  const refs = readRefs();

  if (typeof window !== 'undefined') {
    (window as any).__MF_WORKFLOW_INBOX_BADGE__ = WORKFLOW_INBOX_BADGE;
  }

  refs.refreshButton?.addEventListener('click', () => {
    void loadInbox(true);
  });

  void loadInbox(true);

  async function loadInbox(resetSelection: boolean): Promise<void> {
    setBusy(true);
    showFeedback(null, '');
    renderLoadingState('Loading your task inbox...');

    try {
      state.inbox = await api.getInbox(0, 100);
      if (resetSelection || !taskExists(state.selectedTaskId)) {
        state.selectedTaskId = config.initialTaskId || firstTaskId();
      }
      renderInbox();
      if (state.selectedTaskId) {
        await loadTask(state.selectedTaskId);
      } else {
        state.selectedTaskDetail = null;
        state.selectedSubmissionDetail = null;
        renderDetail();
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error || 'Request failed.');
      showFeedback('error', state.error);
      renderLoadingState('Unable to load the inbox.');
    } finally {
      setBusy(false);
    }
  }

  async function loadTask(taskId: string): Promise<void> {
    if (!taskId) return;
    state.selectedTaskId = taskId;
    renderInbox();
    renderDetailLoading();

    try {
      const taskDetail = await api.getTask(taskId);
      const submissionId = taskDetail.task.submissionId;
      state.selectedSubmissionDetail = submissionId > 0
        ? await api.getSubmissionDetail(submissionId)
        : null;
      state.selectedTaskDetail = taskDetail;
      renderDetail();
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error || 'Unable to load task detail right now.');
      showFeedback('error', state.error);
      if (refs.taskDetail) {
        refs.taskDetail.innerHTML = `<div class="mf-dnn-empty">${escapeHtml(state.error)}</div>`;
      }
    }
  }

  function renderInbox(): void {
    const myTasks = filteredTasks(state.inbox?.myTasks || [], config.formId);
    const roleQueue = filteredTasks(state.inbox?.roleQueue || [], config.formId);
    if (refs.myTaskCount) refs.myTaskCount.textContent = String(myTasks.length);
    if (refs.roleTaskCount) refs.roleTaskCount.textContent = String(roleQueue.length);
    if (refs.myTaskList) renderTaskList(refs.myTaskList, myTasks, state.selectedTaskId, 'my', (taskId) => void loadTask(taskId));
    if (refs.roleTaskList) renderTaskList(refs.roleTaskList, roleQueue, state.selectedTaskId, 'role', (taskId) => void loadTask(taskId));
  }

  function renderDetailLoading(): void {
    if (!refs.taskDetail) return;
    refs.taskDetail.innerHTML = '<div class="mf-dnn-detail-loading"><i class="fas fa-spinner fa-spin"></i><br><br>Loading task detail...</div>';
  }

  function renderDetail(): void {
    if (!refs.taskDetail) return;
      renderTaskDetail(refs.taskDetail, {
        detail: state.selectedTaskDetail,
        submissionDetail: state.selectedSubmissionDetail,
        onClaim: (taskId, comment) => submitAction(() => api.claim(taskId, comment), 'Task claimed.'),
        onApprove: (taskId, comment, data) => submitAction(() => api.approve(taskId, comment, data), 'Task approved.'),
        onReject: (taskId, comment, data) => submitAction(() => api.reject(taskId, comment, data), 'Task rejected.'),
        onForward: (taskId, targetUser, comment, data) => submitAction(() => api.forward(taskId, targetUser, comment, data), 'Task forwarded.'),
        onActionCompleted: () => loadInbox(false),
      });
    }

  async function submitAction(action: () => Promise<void>, successMessage: string): Promise<void> {
    setBusy(true);
    showFeedback(null, '');
    try {
      await action();
      showFeedback('success', successMessage);
      await loadInbox(false);
    } catch (error) {
      showFeedback('error', error instanceof Error ? error.message : String(error || 'Action failed.'));
    } finally {
      setBusy(false);
    }
  }

  function setBusy(isBusy: boolean): void {
    state.busy = isBusy;
    if (refs.refreshButton) refs.refreshButton.disabled = isBusy;
    refs.taskDetail?.querySelectorAll('button').forEach((button) => {
      (button as HTMLButtonElement).disabled = isBusy;
    });
  }

  function renderLoadingState(message: string): void {
    if (refs.myTaskList) refs.myTaskList.innerHTML = `<div class="mf-dnn-empty">${escapeHtml(message)}</div>`;
    if (refs.roleTaskList) refs.roleTaskList.innerHTML = '<div class="mf-dnn-empty">Loading role queue...</div>';
    if (refs.taskDetail) refs.taskDetail.innerHTML = '<div class="mf-dnn-empty">Select a task from the inbox to inspect workflow history and take action.</div>';
  }

  function showFeedback(kind: 'success' | 'error' | null, message: string): void {
    if (!refs.feedback) return;
    if (!message) {
      refs.feedback.style.display = 'none';
      refs.feedback.className = 'mf-dnn-task-feedback';
      refs.feedback.textContent = '';
      return;
    }
    refs.feedback.style.display = '';
    refs.feedback.className = `mf-dnn-task-feedback ${kind === 'error' ? 'is-error' : 'is-success'}`;
    refs.feedback.textContent = message;
  }

  function taskExists(taskId: string): boolean {
    if (!taskId) return false;
    return filteredTasks(state.inbox?.myTasks || [], config.formId).some((task) => task.taskId === taskId)
      || filteredTasks(state.inbox?.roleQueue || [], config.formId).some((task) => task.taskId === taskId);
  }

  function firstTaskId(): string {
    const myTasks = filteredTasks(state.inbox?.myTasks || [], config.formId);
    if (myTasks.length) return myTasks[0].taskId;
    const roleQueue = filteredTasks(state.inbox?.roleQueue || [], config.formId);
    return roleQueue.length ? roleQueue[0].taskId : '';
  }
}

function readConfig(root: HTMLElement): WorkflowInboxConfig {
  // [B51] Platform-aware fallback bases when [data-*] attributes are absent.
  const _w = window as any;
  const _pf = _w.__MF_PLATFORM__ || {};
  const _platform = String(_pf.platform || root.dataset.platform || '').toLowerCase();
  const _isOq = _platform === 'oqtane' || !!_w.Oqtane || !!_w.__OQTANE__ || !!document.querySelector('[data-mf-platform="oqtane"]');
  const _defWf = _isOq ? '/api/MegaForm/Workflow/' : '/DesktopModules/MegaForm/API/Workflow/';
  const _defApi = _isOq ? '/api/MegaForm/' : '/DesktopModules/MegaForm/API/';
  return {
    moduleId: parseInt(root.dataset.moduleId || '0', 10) || 0,
    tabId: parseInt(root.dataset.tabId || '0', 10) || 0,
    apiBase: root.dataset.apiBase || _defWf,
    submissionsApiBase: root.dataset.submissionsApiBase || _defApi,
    formId: parseInt(root.dataset.formId || '0', 10) || 0,
    initialTaskId: root.dataset.initialTaskId || '',
  };
}

function readRefs(): WorkflowInboxDomRefs {
  return {
    feedback: document.getElementById('mf-task-feedback'),
    myTaskCount: document.getElementById('mf-my-task-count'),
    roleTaskCount: document.getElementById('mf-role-task-count'),
    myTaskList: document.getElementById('mf-my-task-list'),
    roleTaskList: document.getElementById('mf-role-task-list'),
    taskDetail: document.getElementById('mf-task-detail'),
    refreshButton: document.getElementById('mf-task-refresh') as HTMLButtonElement | null,
  };
}

function filteredTasks(tasks: WorkflowInboxTask[], formId: number): WorkflowInboxTask[] {
  const scoped = !formId ? tasks.slice() : tasks.filter((task) => task.formId === formId);
  return scoped.sort(compareWorkflowTasks);
}

function escapeHtml(value: string): string {
  return h('div', null, value).innerHTML;
}

function compareWorkflowTasks(a: WorkflowInboxTask, b: WorkflowInboxTask): number {
  return compareIsoDesc(a.createdAt, b.createdAt)
    || compareIsoDesc(a.dueAt, b.dueAt)
    || b.submissionId - a.submissionId
    || String(a.taskId || '').localeCompare(String(b.taskId || ''));
}

function compareIsoDesc(left?: string | null, right?: string | null): number {
  const leftTime = parseIso(left);
  const rightTime = parseIso(right);
  return rightTime - leftTime;
}

function parseIso(value?: string | null): number {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

if (typeof window !== 'undefined') {
  (window as any).MegaForm = (window as any).MegaForm || {};
  (window as any).MegaForm.initWorkflowInbox = initWorkflowInbox;
}
