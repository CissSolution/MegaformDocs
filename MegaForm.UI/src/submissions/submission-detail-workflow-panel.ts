import { h } from '@shared/dom';
import type {
  SubmissionAvailableActionInfo,
  SubmissionDetailInfo,
  WorkflowTaskInfo,
} from '@core/types';

export interface SubmissionWorkflowActionRequest {
  action: 'claim' | 'approve' | 'reject' | 'forward';
  taskId: string;
  comment: string;
  internalReference: string;
  relatedLink: string;
  evidenceNotes: string;
  targetUser?: string;
  data: Record<string, unknown>;
  task: WorkflowTaskInfo | null;
}

export interface SubmissionWorkflowActionResult {
  ok?: boolean;
  message?: string;
}

export interface SubmissionWorkflowActionController {
  preferredAction?: string | null;
  onAction?: (request: SubmissionWorkflowActionRequest) => Promise<SubmissionWorkflowActionResult | void>;
  onActionCompleted?: (
    request: SubmissionWorkflowActionRequest,
    result: SubmissionWorkflowActionResult,
  ) => Promise<void> | void;
}

interface NormalizedAction {
  key: SubmissionWorkflowActionRequest['action'];
  label: string;
  title: string;
  tone: 'danger' | 'info' | 'neutral' | 'success';
  taskId: string;
  requiresComment: boolean;
}

export function renderSubmissionWorkflowPanel(
  detail: SubmissionDetailInfo,
  controller?: SubmissionWorkflowActionController | null,
): HTMLElement | null {
  const workflow = detail.workflowDetail;
  if (!workflow?.hasWorkflow) return null;

  const availableActions = normalizeActions(detail.submission.availableActions || []);
  const activeWorkflowActions = availableActions.filter((action) =>
    action.key === 'claim' || action.key === 'approve' || action.key === 'reject' || action.key === 'forward',
  );

  const primaryTask = resolvePrimaryTask(detail, activeWorkflowActions);
  const hasDecisionSurface = !!primaryTask || activeWorkflowActions.length > 0;
  if (!hasDecisionSurface && !workflow.transparency) return null;

  const root = h('section', { class: 'mf-wf-panel' });
  const header = h('div', { class: 'mf-wf-panel-head' });
  const heading = h('div', { class: 'mf-wf-panel-copy' },
    h('div', { class: 'mf-wf-panel-kicker' }, 'BPMN 2.0 decision surface'),
    h('h4', { class: 'mf-wf-panel-title' }, 'Workflow Decision'),
    h('p', { class: 'mf-wf-panel-text' },
      primaryTask
        ? `Current step "${primaryTask.nodeLabel || primaryTask.nodeId || 'Approval'}". Approve/reject follows the configured BPMN path automatically.`
        : 'This submission is attached to a workflow. Role-based actions appear here when a task becomes visible to you.',
    ),
  );
  const statePill = h('div', { class: 'mf-wf-panel-state' }, [
    workflow.transparency?.activeNodeLabel || primaryTask?.nodeLabel || 'Workflow',
    detail.submission.status || 'Submitted',
  ].filter(Boolean).join(' / '));
  header.appendChild(heading);
  header.appendChild(statePill);
  root.appendChild(header);

  const facts = h('div', { class: 'mf-wf-facts' });
  facts.appendChild(buildFactCard('Current step', workflow.transparency?.activeNodeLabel || primaryTask?.nodeLabel || '—'));
  facts.appendChild(buildFactCard('Assigned to', primaryTask?.assignedDisplayName || primaryTask?.assignedUserName || 'Role queue'));
  facts.appendChild(buildFactCard('Candidate roles', (primaryTask?.candidateRoles || []).join(', ') || '—'));
  facts.appendChild(buildFactCard('Candidate users', (primaryTask?.candidateUsers || []).join(', ') || '—'));
  root.appendChild(facts);

  if (!activeWorkflowActions.length) {
    root.appendChild(h('div', { class: 'mf-wf-panel-note' },
      'You can review the workflow state here, but no executable BPMN action is assigned to your current role on this submission.',
    ));
    return root;
  }

  const form = h('div', { class: 'mf-wf-form' });
  const comment = h('textarea', {
    class: 'mf-wf-textarea',
    rows: '4',
    placeholder: 'Approval note, rejection reason, or handoff context...',
  }) as HTMLTextAreaElement;
  const internalReference = h('input', {
    type: 'text',
    class: 'mf-wf-input',
    placeholder: 'Internal document id / record no.',
  }) as HTMLInputElement;
  const relatedLink = h('input', {
    type: 'url',
    class: 'mf-wf-input',
    placeholder: 'Relevant URL / SharePoint / internal document link',
  }) as HTMLInputElement;
  const evidenceNotes = h('textarea', {
    class: 'mf-wf-textarea mf-wf-textarea-compact',
    rows: '3',
    placeholder: 'Supporting evidence, extra file references, attachment notes...',
  }) as HTMLTextAreaElement;

  form.appendChild(buildFieldBlock('Decision note', comment));
  const inlineFields = h('div', { class: 'mf-wf-inline-fields' });
  inlineFields.appendChild(buildFieldBlock('Internal reference', internalReference));
  inlineFields.appendChild(buildFieldBlock('Related link', relatedLink));
  form.appendChild(inlineFields);
  form.appendChild(buildFieldBlock('Supporting documents / attachment notes', evidenceNotes));

  const forwardAction = activeWorkflowActions.find((action) => action.key === 'forward');
  let forwardTargetInput: HTMLInputElement | null = null;
  if (forwardAction) {
    forwardTargetInput = h('input', {
      type: 'text',
      class: 'mf-wf-input',
      placeholder: 'username, email, or role:RoleName',
    }) as HTMLInputElement;
    form.appendChild(buildFieldBlock('Forward to user or role', forwardTargetInput));
  }

  form.appendChild(h('div', { class: 'mf-wf-panel-help' },
    'Approve and reject continue along the BPMN route already defined in the workflow builder. This panel keeps the decision trail, related links, and document references with the submission review.',
  ));

  const feedback = h('div', { class: 'mf-wf-feedback', style: 'display:none' }) as HTMLElement;
  const actionsRow = h('div', { class: 'mf-wf-actions' });
  let busy = false;
  const actionButtons: HTMLButtonElement[] = [];

  activeWorkflowActions.forEach((action) => {
    const button = h('button', {
      type: 'button',
      class: `mf-wf-btn mf-wf-btn-${action.tone}`,
      title: action.title || action.label,
    }, action.label) as HTMLButtonElement;
    button.dataset.workflowAction = action.key;
    button.addEventListener('click', () => {
      if (busy) return;
      void runAction(action);
    });
    actionButtons.push(button);
    actionsRow.appendChild(button);
  });

  form.appendChild(feedback);
  form.appendChild(actionsRow);
  root.appendChild(form);

  const preferred = String(controller?.preferredAction || '').trim().toLowerCase();
  if (preferred) {
    window.setTimeout(() => {
      const target = actionButtons.find((button) => button.dataset.workflowAction === preferred);
      if (target) target.focus();
    }, 40);
  }

  return root;

  async function runAction(action: NormalizedAction): Promise<void> {
    const plainComment = String(comment.value || '').trim();
    if (action.key === 'reject' && action.requiresComment && !plainComment) {
      showFeedback('This BPMN step requires a rejection reason.', true);
      comment.focus();
      return;
    }

    const targetUser = action.key === 'forward'
      ? String(forwardTargetInput?.value || '').trim()
      : '';
    if (action.key === 'forward' && !targetUser) {
      showFeedback('Enter a username, email, or role:RoleName to forward this task.', true);
      forwardTargetInput?.focus();
      return;
    }

    if (!controller?.onAction) {
      showFeedback('This surface is read-only here.', true);
      return;
    }

    const payload = buildActionPayload(plainComment, internalReference.value, relatedLink.value, evidenceNotes.value);
    const request: SubmissionWorkflowActionRequest = {
      action: action.key,
      taskId: action.taskId || primaryTask?.taskId || detail.submission.activeTaskId || '',
      comment: payload.comment,
      internalReference: payload.internalReference,
      relatedLink: payload.relatedLink,
      evidenceNotes: payload.evidenceNotes,
      targetUser: targetUser || undefined,
      data: {
        approval: {
          internalReference: payload.internalReference,
          relatedLink: payload.relatedLink,
          evidenceNotes: payload.evidenceNotes,
        },
      },
      task: primaryTask,
    };

    busy = true;
    actionButtons.forEach((button) => { button.disabled = true; });
    showFeedback('Submitting workflow action...', false);

    try {
      const rawResult = await controller.onAction(request);
      const result: SubmissionWorkflowActionResult = rawResult && typeof rawResult === 'object'
        ? rawResult
        : { ok: true, message: '' };
      if (result.ok === false) {
        showFeedback(result.message || 'Workflow action failed.', true);
        return;
      }
      showFeedback(result.message || `${action.label} completed.`, false);
      await controller.onActionCompleted?.(request, result);
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : String(error || 'Workflow action failed.'), true);
    } finally {
      busy = false;
      actionButtons.forEach((button) => { button.disabled = false; });
    }
  }

  function showFeedback(message: string, isError: boolean): void {
    if (!message.trim()) {
      feedback.style.display = 'none';
      feedback.textContent = '';
      feedback.className = 'mf-wf-feedback';
      return;
    }
    feedback.style.display = '';
    feedback.textContent = message;
    feedback.className = `mf-wf-feedback${isError ? ' is-error' : ' is-success'}`;
  }
}

function buildFactCard(label: string, value: string): HTMLElement {
  return h('div', { class: 'mf-wf-fact' },
    h('span', { class: 'mf-wf-fact-label' }, label),
    h('strong', { class: 'mf-wf-fact-value' }, value || '—'),
  );
}

function buildFieldBlock(label: string, control: HTMLElement): HTMLElement {
  return h('label', { class: 'mf-wf-field' },
    h('span', { class: 'mf-wf-field-label' }, label),
    control,
  );
}

function buildActionPayload(
  comment: string,
  internalReference: string,
  relatedLink: string,
  evidenceNotes: string,
): {
  comment: string;
  internalReference: string;
  relatedLink: string;
  evidenceNotes: string;
} {
  const internalRef = String(internalReference || '').trim();
  const link = String(relatedLink || '').trim();
  const evidence = String(evidenceNotes || '').trim();
  const sections: string[] = [];
  if (comment.trim()) sections.push(comment.trim());
  const detailLines: string[] = [];
  if (internalRef) detailLines.push(`Internal ref: ${internalRef}`);
  if (link) detailLines.push(`Related link: ${link}`);
  if (evidence) detailLines.push(`Supporting docs: ${evidence}`);
  if (detailLines.length) sections.push(detailLines.join('\n'));
  return {
    comment: sections.join('\n\n').trim(),
    internalReference: internalRef,
    relatedLink: link,
    evidenceNotes: evidence,
  };
}

function normalizeActions(raw: SubmissionAvailableActionInfo[]): NormalizedAction[] {
  return (Array.isArray(raw) ? raw : [])
    .map((entry) => {
      const key = String(entry?.key || '').trim().toLowerCase();
      if (key !== 'claim' && key !== 'approve' && key !== 'reject' && key !== 'forward') return null;
      const tone = normalizeTone(entry?.tone);
      return {
        key,
        label: String(entry?.label || key),
        title: String(entry?.title || entry?.label || key),
        tone,
        taskId: String(entry?.taskId || '').trim(),
        requiresComment: !!entry?.requiresComment,
      } as NormalizedAction;
    })
    .filter((entry): entry is NormalizedAction => !!entry);
}

function normalizeTone(value: unknown): NormalizedAction['tone'] {
  const tone = String(value || '').trim().toLowerCase();
  if (tone === 'danger' || tone === 'success' || tone === 'info') return tone;
  return 'neutral';
}

function resolvePrimaryTask(detail: SubmissionDetailInfo, actions: NormalizedAction[]): WorkflowTaskInfo | null {
  const workflow = detail.workflowDetail;
  const tasks = Array.isArray(workflow?.workflowTasks) ? workflow?.workflowTasks : [];
  const taskIdHints = [
    ...actions.map((action) => action.taskId).filter(Boolean),
    String(detail.submission.activeTaskId || '').trim(),
    String(workflow?.workflowCase?.activeTaskId || '').trim(),
    String(workflow?.transparency?.activeTaskId || '').trim(),
  ].filter(Boolean);

  for (const taskId of taskIdHints) {
    const match = tasks.find((task) => String(task.taskId || '').trim() === taskId);
    if (match) return match;
  }

  return tasks.find((task) => {
    const status = Number(task.status || 0);
    return status === 1 || status === 2;
  }) || tasks[0] || null;
}

