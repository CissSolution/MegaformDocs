// My Inbox — task detail drawer (right-side Sheet). Shows the submission data
// (reusing the global SubmissionDetailShell when present), the workflow history,
// and an action panel (approve / reject / forward / claim) wired to the API.
import type { WorkflowInboxApi } from '../workflow-inbox/api';
import type { WorkflowInboxTask, WorkflowInboxTaskAction } from '../workflow-inbox/types';
import { div, span, btn, mk, ic, relativeTime, prettyStatus, T } from './ui';

const ACTION_VERB: Record<number, [string, string]> = {
  1: ['inbox.verb_created', 'created the task'],
  2: ['inbox.verb_claimed', 'claimed the task'],
  3: ['inbox.verb_approved', 'approved'],
  4: ['inbox.verb_rejected', 'rejected'],
  5: ['inbox.verb_forwarded', 'forwarded'],
  6: ['inbox.verb_commented', 'commented'],
};

const STATUS_COMPLETED = 3; // WorkflowTaskStatus.Completed

export interface TaskDrawerOptions {
  api: WorkflowInboxApi;
  task: WorkflowInboxTask;
  focus: 'forward' | 'reject' | null;
  formTitle: string;
  onToast: (kind: 'success' | 'error', message: string) => void;
  onDone: () => void;
}

export function openTaskDrawer(opts: TaskDrawerOptions): void {
  const { api, task } = opts;
  const isOpen = task.status !== STATUS_COMPLETED;

  const backdrop = div('mf-mi-sheet-backdrop');
  const panel = div('mf-mi-sheet');
  let busy = false;

  function close(): void {
    panel.classList.add('is-leaving');
    backdrop.classList.add('is-leaving');
    setTimeout(() => { backdrop.remove(); }, 220);
  }

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  // Header
  const hd = div('mf-mi-sheet-hd');
  const hdText = div('mf-mi-sheet-hd-text');
  hdText.appendChild(span('mf-mi-sheet-title', opts.formTitle));
  hdText.appendChild(span('mf-mi-sheet-sub', `${T('inbox.submission_n', 'Submission #{id}', { id: task.submissionId })} · ${task.nodeLabel || prettyStatus(task.nodeId)}`));
  const closeBtn = btn('mf-mi-sheet-close', ic('x', 18), close);
  mk(hd, hdText, closeBtn);

  // Body
  const body = div('mf-mi-sheet-body');
  const actionMount = div('mf-mi-sheet-section');
  const dataMount = div('mf-mi-sheet-section');
  const historyMount = div('mf-mi-sheet-section');
  mk(body, actionMount, dataMount, historyMount);

  if (isOpen) actionMount.appendChild(buildActionPanel());
  dataMount.appendChild(sectionTitle(T('inbox.section_submission', 'Submission'), 'file'));
  const dataLoading = div('mf-mi-sheet-loading', T('inbox.loading_submission', 'Loading submission…'));
  dataMount.appendChild(dataLoading);
  historyMount.appendChild(sectionTitle(T('inbox.section_workflow_history', 'Workflow history'), 'clock'));
  const histLoading = div('mf-mi-sheet-loading', T('inbox.loading_history', 'Loading history…'));
  historyMount.appendChild(histLoading);

  mk(panel, hd, body);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => { backdrop.classList.add('is-shown'); panel.classList.add('is-shown'); });

  // Lazy-load submission detail + workflow history.
  void loadSubmission();
  void loadHistory();

  if (opts.focus === 'forward') {
    setTimeout(() => { const i = panel.querySelector('.mf-mi-fwd-input') as HTMLInputElement; if (i) i.focus(); }, 260);
  }

  async function loadSubmission(): Promise<void> {
    try {
      const detail = await api.getSubmissionDetail(task.submissionId);
      dataLoading.remove();
      const shellHost = div('mf-mi-sub-shell');
      const g = (window as any).MegaForm;
      if (g && typeof g.renderSubmissionDetailShell === 'function') {
        try {
          g.renderSubmissionDetailShell(shellHost, detail, { readOnly: true, mode: 'embedded', initialTab: 'data' });
          dataMount.appendChild(shellHost);
          return;
        } catch { /* fall through to simple fields */ }
      }
      dataMount.appendChild(buildSimpleFields(detail));
    } catch (e) {
      dataLoading.textContent = T('inbox.err_load_submission', 'Unable to load submission data.');
    }
  }

  async function loadHistory(): Promise<void> {
    try {
      const detail = await api.getTask(task.taskId);
      histLoading.remove();
      const actions = (detail.actions || []).slice().sort((a, b) => parseIso(b.createdAt) - parseIso(a.createdAt));
      if (!actions.length) {
        historyMount.appendChild(div('mf-mi-sheet-muted', T('inbox.no_history', 'No history yet.')));
        return;
      }
      const timeline = div('mf-mi-timeline');
      actions.forEach((a) => timeline.appendChild(buildHistoryItem(a)));
      historyMount.appendChild(timeline);
    } catch {
      histLoading.textContent = T('inbox.err_load_history', 'Unable to load history.');
    }
  }

  function buildActionPanel(): HTMLElement {
    const panelEl = div('mf-mi-action-panel');
    panelEl.appendChild(sectionTitle(T('inbox.take_action', 'Take action'), 'check'));

    const comment = document.createElement('textarea');
    comment.className = 'mf-mi-comment';
    comment.placeholder = T('inbox.comment_placeholder', 'Add a comment (required for reject)…');
    comment.rows = 2;
    panelEl.appendChild(comment);

    const row = div('mf-mi-action-row');
    const approve = btn('mf-btn mf-btn-sm mf-mi-btn-approve', `${ic('check', 14)} ${T('inbox.approve', 'Approve')}`, () =>
      run(() => api.approve(task.taskId, comment.value.trim(), {}), T('inbox.toast_approved', 'Task approved.')));
    const reject = btn('mf-btn mf-btn-sm mf-mi-btn-reject', `${ic('x', 14)} ${T('inbox.reject', 'Reject')}`, () => {
      if (task.commentRequiredOnReject && !comment.value.trim()) { comment.focus(); opts.onToast('error', T('inbox.err_comment_required', 'A comment is required to reject.')); return; }
      run(() => api.reject(task.taskId, comment.value.trim(), {}), T('inbox.toast_rejected', 'Task rejected.'));
    });
    mk(row, approve, reject);
    panelEl.appendChild(row);

    if (task.allowForward || task.status !== STATUS_COMPLETED) {
      const fwd = div('mf-mi-fwd');
      const fInput = document.createElement('input');
      fInput.type = 'text'; fInput.className = 'mf-mi-fwd-input'; fInput.placeholder = T('inbox.forward_placeholder', 'Forward to (username)…');
      const fBtn = btn('mf-btn mf-btn-outline mf-btn-sm mf-mi-btn-fwd', `${ic('forward', 14)} ${T('inbox.forward', 'Forward')}`, () => {
        const target = fInput.value.trim();
        if (!target) { fInput.focus(); opts.onToast('error', T('inbox.err_forward_target', 'Enter a username to forward to.')); return; }
        run(() => api.forward(task.taskId, target, comment.value.trim(), {}), T('inbox.toast_forwarded', 'Forwarded to {target}.', { target }));
      });
      mk(fwd, fInput, fBtn);
      panelEl.appendChild(fwd);
    }

    if (task.status === 1 /* Pending */) {
      const claim = btn('mf-btn mf-btn-outline mf-btn-sm mf-mi-btn-claim', `${ic('hand', 14)} ${T('inbox.claim_task', 'Claim this task')}`, () =>
        run(() => api.claim(task.taskId, comment.value.trim()), T('inbox.toast_claimed', 'Task claimed.')));
      panelEl.appendChild(claim);
    }

    return panelEl;
  }

  async function run(action: () => Promise<void>, successMsg: string): Promise<void> {
    if (busy) return;
    busy = true;
    panel.querySelectorAll('button, textarea, input').forEach((n) => (n as HTMLButtonElement).disabled = true);
    try {
      await action();
      opts.onToast('success', successMsg);
      close();
      opts.onDone();
    } catch (e) {
      busy = false;
      panel.querySelectorAll('button, textarea, input').forEach((n) => (n as HTMLButtonElement).disabled = false);
      opts.onToast('error', e instanceof Error ? e.message : T('inbox.err_action_failed', 'Action failed.'));
    }
  }
}

function sectionTitle(text: string, icon: string): HTMLElement {
  const t = div('mf-mi-sheet-section-title');
  t.innerHTML = `${ic(icon, 15)} <span>${text}</span>`;
  return t;
}

function buildHistoryItem(a: WorkflowInboxTaskAction): HTMLElement {
  const item = div('mf-mi-tl-item');
  const dot = div('mf-mi-tl-dot mf-mi-tl-' + toneFor(a.actionType));
  const content = div('mf-mi-tl-content');
  const who = a.actorDisplayName || a.actorUserName || T('inbox.someone', 'Someone');
  const vb = ACTION_VERB[a.actionType];
  const verb = vb ? T(vb[0], vb[1]) : T('inbox.verb_updated', 'updated');
  const head = div('mf-mi-tl-head');
  head.innerHTML = `<strong></strong> ${verb}${a.targetUser ? ` ${T('inbox.connector_to', 'to')} <strong class="mf-mi-tl-target"></strong>` : ''}`;
  (head.querySelector('strong') as HTMLElement).textContent = who;
  const tgt = head.querySelector('.mf-mi-tl-target') as HTMLElement | null;
  if (tgt) tgt.textContent = a.targetUser;
  content.appendChild(head);
  content.appendChild(span('mf-mi-tl-time', relativeTime(a.createdAt)));
  if (a.comment) {
    const c = div('mf-mi-tl-comment');
    c.textContent = a.comment;
    content.appendChild(c);
  }
  mk(item, dot, content);
  return item;
}

function toneFor(actionType: number): string {
  if (actionType === 3) return 'ok';
  if (actionType === 4) return 'bad';
  if (actionType === 5) return 'fwd';
  if (actionType === 2) return 'claim';
  return 'neutral';
}

function buildSimpleFields(detail: any): HTMLElement {
  const wrap = div('mf-mi-fields');
  const data = (detail && (detail.dataJson || detail.DataJson || detail.data || detail.values)) || {};
  let obj: Record<string, unknown> = {};
  if (typeof data === 'string') { try { obj = JSON.parse(data); } catch { obj = {}; } }
  else if (data && typeof data === 'object') obj = data as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] != null && String(obj[k]).trim() !== '');
  if (!keys.length) { wrap.appendChild(div('mf-mi-sheet-muted', T('inbox.no_field_data', 'No field data.'))); return wrap; }
  keys.slice(0, 40).forEach((k) => {
    const r = div('mf-mi-field');
    r.appendChild(span('mf-mi-field-k', prettyStatus(k)));
    const v = obj[k];
    r.appendChild(span('mf-mi-field-v', typeof v === 'object' ? JSON.stringify(v) : String(v)));
    wrap.appendChild(r);
  });
  return wrap;
}

function parseIso(value?: string | null): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}
