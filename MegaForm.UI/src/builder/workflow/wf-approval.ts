// wf-approval.ts -- Approval node config panel.
// Canonical split for Approval node UI in workflow builder.

import { APPROVAL_PANEL_BADGE, approvalListToText, normalizeApprovalConfig } from './wf-approval-config';
import { renderPrincipalPicker, WF_PRINCIPAL_PICKER_BADGE } from './wf-principal-picker';

function onTextListChange(setConfig: any, config: any, key: string, value: any): void {
  // Accepts either a textarea string OR an array (from the principal picker).
  // normalizeApprovalConfig -> normalizeApprovalList handles both shapes.
  var patch: any = {};
  patch[key] = value;
  setConfig(normalizeApprovalConfig(Object.assign({}, config, patch)));
}

function onBooleanChange(setConfig: any, config: any, key: string, value: boolean): void {
  var patch: any = {};
  patch[key] = value;
  setConfig(normalizeApprovalConfig(Object.assign({}, config, patch)));
}

function onTextChange(setConfig: any, config: any, key: string, value: string): void {
  var patch: any = {};
  patch[key] = value;
  setConfig(normalizeApprovalConfig(Object.assign({}, config, patch)));
}

export function renderApprovalConfig(ctx: any): any {
  var h = ctx.h;
  var R = ctx.R;
  var cfgField = ctx.cfgField;
  var config = normalizeApprovalConfig(ctx.config || {});
  var setConfig = ctx.setConfig;

  return h(R.Fragment, null,
    h('div', { className: 'mf-rf-helper-card', 'data-wf-approval-badge': APPROVAL_PANEL_BADGE },
      h('strong', null, 'BPMN user task / approval'),
      h('div', null, 'The process pauses here until an assigned user or candidate role claims the task and records approve or reject.'),
      h('div', { style: { marginTop: 6, fontSize: 11, color: '#7c3aed', fontWeight: 700 } }, APPROVAL_PANEL_BADGE)
    ),
    cfgField('Candidate roles (swimlanes)',
      ctx.formId > 0
        ? renderPrincipalPicker({
            h: h, R: R, formId: ctx.formId, kind: 'role',
            value: config.candidateRoles,
            onChange: function (next: string[]) { onTextListChange(setConfig, config, 'candidateRoles', next as any); }
          })
        : h('textarea', {
            className: 'mf-rf-cfg-input mf-rf-cfg-textarea',
            rows: 4,
            placeholder: 'Reviewer\nLegal',
            value: approvalListToText(config.candidateRoles),
            onChange: function (e: any) { onTextListChange(setConfig, config, 'candidateRoles', e.target.value); }
          })
    ),
    cfgField('Candidate users (assignees)',
      ctx.formId > 0
        ? renderPrincipalPicker({
            h: h, R: R, formId: ctx.formId, kind: 'user',
            value: config.candidateUsers,
            onChange: function (next: string[]) { onTextListChange(setConfig, config, 'candidateUsers', next as any); }
          })
        : h('textarea', {
            className: 'mf-rf-cfg-input mf-rf-cfg-textarea',
            rows: 3,
            placeholder: 'reviewer@example.com\nlegal@example.com',
            value: approvalListToText(config.candidateUsers),
            onChange: function (e: any) { onTextListChange(setConfig, config, 'candidateUsers', e.target.value); }
          })
    ),
    cfgField('Due in hours', h('input', {
      type: 'number',
      min: 0,
      max: 720,
      className: 'mf-rf-cfg-input',
      value: config.dueInHours || 0,
      onChange: function (e: any) { onTextChange(setConfig, config, 'dueInHours', e.target.value); }
    })),
    cfgField('Pending submission status', h('input', {
      className: 'mf-rf-cfg-input',
      value: config.pendingSubmissionStatus || 'pending_approval',
      onChange: function (e: any) { onTextChange(setConfig, config, 'pendingSubmissionStatus', e.target.value); }
    })),
    cfgField('Approved submission status', h('input', {
      className: 'mf-rf-cfg-input',
      value: config.approvedSubmissionStatus || 'approved',
      onChange: function (e: any) { onTextChange(setConfig, config, 'approvedSubmissionStatus', e.target.value); }
    })),
    cfgField('Rejected submission status', h('input', {
      className: 'mf-rf-cfg-input',
      value: config.rejectedSubmissionStatus || 'rejected',
      onChange: function (e: any) { onTextChange(setConfig, config, 'rejectedSubmissionStatus', e.target.value); }
    })),
    h('label', { className: 'mf-rf-cfg-check' },
      h('input', {
        type: 'checkbox',
        checked: !!config.allowClaim,
        onChange: function (e: any) { onBooleanChange(setConfig, config, 'allowClaim', !!e.target.checked); }
      }),
      h('span', null, 'Allow claim from role queue')
    ),
    h('label', { className: 'mf-rf-cfg-check' },
      h('input', {
        type: 'checkbox',
        checked: !!config.allowForward,
        onChange: function (e: any) { onBooleanChange(setConfig, config, 'allowForward', !!e.target.checked); }
      }),
      h('span', null, 'Allow forward to another user')
    ),
    h('label', { className: 'mf-rf-cfg-check' },
      h('input', {
        type: 'checkbox',
        checked: !!config.allowReassign,
        onChange: function (e: any) { onBooleanChange(setConfig, config, 'allowReassign', !!e.target.checked); }
      }),
      h('span', null, 'Allow reassignment')
    ),
    h('label', { className: 'mf-rf-cfg-check' },
      h('input', {
        type: 'checkbox',
        checked: !!config.commentRequiredOnReject,
        onChange: function (e: any) { onBooleanChange(setConfig, config, 'commentRequiredOnReject', !!e.target.checked); }
      }),
      h('span', null, 'Require a comment when rejecting')
    ),
    h('div', { className: 'mf-rf-helper-card', style: { marginTop: 12 } },
      h('strong', null, 'Email notifications'),
      h('div', null, 'Optional emails sent when this task is created or forwarded.')
    ),
    h('label', { className: 'mf-rf-cfg-check' },
      h('input', {
        type: 'checkbox',
        checked: !!config.notifyOnCreate,
        onChange: function (e: any) { onBooleanChange(setConfig, config, 'notifyOnCreate', !!e.target.checked); }
      }),
      h('span', null, 'Notify candidates when task is created')
    ),
    cfgField('Create notification subject', h('input', {
      className: 'mf-rf-cfg-input',
      value: config.notifyCreateSubject || '',
      placeholder: 'Leave blank for default',
      onChange: function (e: any) { onTextChange(setConfig, config, 'notifyCreateSubject', e.target.value); }
    })),
    cfgField('Create notification body', h('textarea', {
      className: 'mf-rf-cfg-input mf-rf-cfg-textarea',
      rows: 4,
      value: config.notifyCreateBody || '',
      placeholder: 'Leave blank for default. Tokens: {{field.key}}, {{role.RoleName}}, {{user.username}}, {{submission.id}}, {{form.id}}',
      onChange: function (e: any) { onTextChange(setConfig, config, 'notifyCreateBody', e.target.value); }
    })),
    h('label', { className: 'mf-rf-cfg-check' },
      h('input', {
        type: 'checkbox',
        checked: !!config.notifyOnForward,
        onChange: function (e: any) { onBooleanChange(setConfig, config, 'notifyOnForward', !!e.target.checked); }
      }),
      h('span', null, 'Notify target user/role when task is forwarded')
    ),
    cfgField('Forward notification subject', h('input', {
      className: 'mf-rf-cfg-input',
      value: config.notifyForwardSubject || '',
      placeholder: 'Leave blank for default',
      onChange: function (e: any) { onTextChange(setConfig, config, 'notifyForwardSubject', e.target.value); }
    })),
    cfgField('Forward notification body', h('textarea', {
      className: 'mf-rf-cfg-input mf-rf-cfg-textarea',
      rows: 4,
      value: config.notifyForwardBody || '',
      placeholder: 'Leave blank for default. Tokens: {{field.key}}, {{role.RoleName}}, {{user.username}}, {{submission.id}}, {{form.id}}',
      onChange: function (e: any) { onTextChange(setConfig, config, 'notifyForwardBody', e.target.value); }
    }))
  );
}
