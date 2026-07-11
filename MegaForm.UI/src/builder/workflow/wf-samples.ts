// wf-samples.ts — Ten starter workflows that run on ANY form schema.
//
// The old presets chained one Form Data node into another ("Full Name → Tab 1 → …"),
// which reads as nonsense: a workflow does not "flow" from one answer to the next.
// These samples model what a workflow actually is — one trigger, then work.
//
// Schema-agnostic rules every sample here follows:
//   1. Exactly ONE FormField node, the trigger, labelled "Form submitted". It binds to the
//      form's first field purely so the runtime has an anchor; it never branches on it.
//   2. Nothing else references a field key unless the field was FOUND by hint. When a form
//      has no email/amount field, the sample degrades to a literal placeholder instead of
//      emitting a dangling {{token}}.
//   3. Branching happens on workflow VARIABLES (declared in the definition) or on Approval
//      outcome handles ('approved' / 'rejected') — never on a field that may not exist.
//
// Node types must stay inside the set the config panel knows how to render:
//   FormField · Condition · Calculate · SendEmail · Webhook · Approval · Database
//   · GoogleSheets · Fork · Join · End      (Switch and Loop are retired.)

export var WORKFLOW_SAMPLES_BADGE = 'WorkflowSamples v20260710-01';

export interface SampleField { key: string; type: string; label: string; }
export interface SampleSchema { fields?: SampleField[]; pages?: any[]; }

interface Ctx {
  firstFieldKey: string;
  emailToken: string;   // "{{email}}" or a literal fallback address
  nameToken: string;    // "{{full_name}}" or "there"
  numberField: string;  // key of a numeric field, or ''
}

// ── field discovery ──────────────────────────────────────────────────────────

function norm(v: string): string {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findField(schema: SampleSchema, hints: string[], types?: string[]): SampleField | null {
  var fields = (schema && schema.fields) || [];
  var i: number, j: number;
  if (types && types.length) {
    for (i = 0; i < fields.length; i++) {
      for (j = 0; j < types.length; j++) {
        if (norm(fields[i].type) === norm(types[j])) return fields[i];
      }
    }
  }
  for (i = 0; i < hints.length; i++) {
    var hint = norm(hints[i]);
    if (!hint) continue;
    for (j = 0; j < fields.length; j++) {
      if (norm(fields[j].key).indexOf(hint) >= 0 || norm(fields[j].label).indexOf(hint) >= 0) return fields[j];
    }
  }
  return null;
}

// Layout / non-answer elements. Anchoring a trigger or a gateway on one of these is what
// produced gateways like "Tab 1 is not empty" — a section can never be empty or filled.
var LAYOUT_TYPES = ['section', 'html', 'row', 'column', 'divider', 'heading', 'uniqueid', 'captcha'];

function isAnswerField(f: SampleField): boolean {
  return LAYOUT_TYPES.indexOf(norm(f.type).replace(/\s/g, '')) < 0;
}

function buildCtx(schema: SampleSchema): Ctx {
  var all = (schema && schema.fields) || [];
  var fields = all.filter(isAnswerField);
  if (!fields.length) fields = all;
  var email = findField(schema, ['email', 'e mail', 'mail'], ['Email', 'EmailConfirm']);
  var name = findField(schema, ['full name', 'name', 'fullname'], ['FullName']);
  var num = findField(schema, ['amount', 'total', 'quantity', 'score', 'price'], ['Number', 'Currency']);
  if (num && !isAnswerField(num)) num = null;
  return {
    firstFieldKey: fields.length ? fields[0].key : '',
    emailToken: email ? '{{' + email.key + '}}' : 'submitter@example.com',
    nameToken: name ? '{{' + name.key + '}}' : 'there',
    numberField: num ? num.key : ''
  };
}

// ── node/edge builders ───────────────────────────────────────────────────────

function node(id: string, type: string, label: string, x: number, y: number, config: any): any {
  var navTypes = ['FormField', 'Condition'];
  return {
    id: id, type: type, label: label,
    zoneType: navTypes.indexOf(type) >= 0 ? 'Navigation' : 'Action',
    position: { x: x, y: y },
    config: config || {}
  };
}

function edge(id: string, from: string, to: string, handle?: string, label?: string): any {
  return {
    id: id, sourceNodeId: from, targetNodeId: to,
    sourceHandle: handle || 'default', targetHandle: 'in', label: label || ''
  };
}

function trigger(ctx: Ctx): any {
  // The single anchor node. isPageNode=false + the form's first field key keeps the runtime
  // happy without pretending the workflow "reads" that field.
  return node('n-start', 'FormField', 'Form submitted', 60, 220, {
    fieldKey: ctx.firstFieldKey, isPageNode: false
  });
}

function endNode(id: string, label: string, x: number, y: number): any {
  return node(id, 'End', label, x, y, { endType: 'Success' });
}

function email(id: string, label: string, x: number, y: number, to: string, subject: string, body: string): any {
  return node(id, 'SendEmail', label, x, y, { to: to, subject: subject, body: body, fromName: 'MegaForm' });
}

function def(startId: string, variables: any[], nodes: any[], edges: any[]): any {
  return { version: '1.0.0', startNodeId: startId, variables: variables || [], nodes: nodes, edges: edges };
}

// ── the ten samples ──────────────────────────────────────────────────────────

var BUILDERS: { [key: string]: (ctx: Ctx) => any } = {

  'notify-admin': function (ctx) {
    return def('n-start', [], [
      trigger(ctx),
      email('n-mail', 'Notify the team', 320, 220, 'team@example.com',
        'New submission received',
        '<p>A new submission just arrived.</p><p>Open the Submissions panel to review it.</p>'),
      endNode('n-end', 'Done', 580, 220)
    ], [edge('e1', 'n-start', 'n-mail'), edge('e2', 'n-mail', 'n-end')]);
  },

  'autoresponder': function (ctx) {
    return def('n-start', [], [
      trigger(ctx),
      email('n-mail', 'Thank the submitter', 320, 220, ctx.emailToken,
        'We received your submission',
        '<p>Hi ' + ctx.nameToken + ',</p><p>Thank you — we have received your submission and will be in touch shortly.</p>'),
      endNode('n-end', 'Done', 580, 220)
    ], [edge('e1', 'n-start', 'n-mail'), edge('e2', 'n-mail', 'n-end')]);
  },

  'crm-sync': function (ctx) {
    return def('n-start', [], [
      trigger(ctx),
      node('n-hook', 'Webhook', 'Push to CRM', 320, 220, {
        url: 'https://crm.example.com/api/leads',
        method: 'POST',
        headers: '{"Content-Type":"application/json"}',
        body: '{"source":"megaform","submissionId":"{{submissionId}}"}'
      }),
      endNode('n-end', 'Done', 580, 220)
    ], [edge('e1', 'n-start', 'n-hook'), edge('e2', 'n-hook', 'n-end')]);
  },

  'single-approval': function (ctx) {
    return def('n-start', [], [
      trigger(ctx),
      node('n-appr', 'Approval', 'Manager review', 300, 220, {
        candidateRoles: ['Reviewer'], candidateUsers: [], dueInHours: 48,
        approvedSubmissionStatus: 'approved', rejectedSubmissionStatus: 'rejected'
      }),
      email('n-ok', 'Tell them it is approved', 560, 130, ctx.emailToken,
        'Your submission was approved',
        '<p>Hi ' + ctx.nameToken + ',</p><p>Good news — your submission has been approved.</p>'),
      email('n-no', 'Tell them it was declined', 560, 320, ctx.emailToken,
        'Your submission was not approved',
        '<p>Hi ' + ctx.nameToken + ',</p><p>Thank you for your time. Unfortunately we cannot proceed this time.</p>'),
      endNode('n-end', 'Done', 820, 220)
    ], [
      edge('e1', 'n-start', 'n-appr'),
      edge('e2', 'n-appr', 'n-ok', 'approved', 'Approved'),
      edge('e3', 'n-appr', 'n-no', 'rejected', 'Rejected'),
      edge('e4', 'n-ok', 'n-end'),
      edge('e5', 'n-no', 'n-end')
    ]);
  },

  // Names ONE person instead of a role. The engine hands the task straight to them — it lands in
  // their inbox already assigned, with no Claim step, and they are emailed. Name a role (or several
  // users) instead and the task goes back to being a queue anyone eligible can claim.
  'assign-to-person': function (ctx) {
    return def('n-start', [], [
      trigger(ctx),
      node('n-appr', 'Approval', 'Review by a named person', 300, 220, {
        candidateRoles: [], candidateUsers: ['host'], dueInHours: 48,
        approvedSubmissionStatus: 'approved', rejectedSubmissionStatus: 'rejected'
      }),
      email('n-ok', 'Tell them it is approved', 560, 130, ctx.emailToken,
        'Your submission was approved',
        '<p>Hi ' + ctx.nameToken + ',</p><p>Good news — your submission has been approved.</p>'),
      email('n-no', 'Tell them it was declined', 560, 320, ctx.emailToken,
        'Your submission was not approved',
        '<p>Hi ' + ctx.nameToken + ',</p><p>Thank you for your time. Unfortunately we cannot proceed this time.</p>'),
      endNode('n-end', 'Done', 820, 220)
    ], [
      edge('e1', 'n-start', 'n-appr'),
      edge('e2', 'n-appr', 'n-ok', 'approved', 'Approved'),
      edge('e3', 'n-appr', 'n-no', 'rejected', 'Rejected'),
      edge('e4', 'n-ok', 'n-end'),
      edge('e5', 'n-no', 'n-end')
    ]);
  },

  'two-step-approval': function (ctx) {
    return def('n-start', [], [
      trigger(ctx),
      node('n-mgr', 'Approval', 'Step 1 — Manager', 290, 220, {
        candidateRoles: ['Manager'], candidateUsers: [], dueInHours: 24,
        approvedSubmissionStatus: 'manager-approved', rejectedSubmissionStatus: 'rejected'
      }),
      node('n-fin', 'Approval', 'Step 2 — Finance', 540, 130, {
        candidateRoles: ['Finance'], candidateUsers: [], dueInHours: 48,
        approvedSubmissionStatus: 'approved', rejectedSubmissionStatus: 'rejected'
      }),
      email('n-no', 'Notify the submitter', 540, 340, ctx.emailToken,
        'Your request was declined',
        '<p>Hi ' + ctx.nameToken + ',</p><p>Your request was reviewed and declined.</p>'),
      endNode('n-end', 'Done', 820, 220)
    ], [
      edge('e1', 'n-start', 'n-mgr'),
      edge('e2', 'n-mgr', 'n-fin', 'approved', 'Approved'),
      edge('e3', 'n-mgr', 'n-no', 'rejected', 'Rejected'),
      edge('e4', 'n-fin', 'n-end', 'approved', 'Approved'),
      edge('e5', 'n-fin', 'n-no', 'rejected', 'Rejected'),
      edge('e6', 'n-no', 'n-end')
    ]);
  },

  'score-and-route': function (ctx) {
    // The Exclusive Gateway can only bind to a FORM FIELD — it cannot read a workflow
    // variable. So the gate compares a real field: a numeric one when the form has it,
    // otherwise "the first field has an answer". The `score` variable still exists and the
    // Business Rule Task writes it, which is what a per-form override can later tune.
    var hasNumber = !!ctx.numberField;
    var gateField = hasNumber ? ctx.numberField : ctx.firstFieldKey;
    var gateRule = hasNumber
      ? { fieldKey: gateField, operator: 'greaterThan', value: '50', valueType: 'literal' }
      : { fieldKey: gateField, operator: 'isNotEmpty', value: '', valueType: 'literal' };
    var gateLabel = hasNumber ? 'Above the threshold?' : 'Has a response?';
    var scoreExpr = hasNumber ? '{{' + ctx.numberField + '}}' : '50';

    return def('n-start', [
      { key: 'score', type: 'Number', defaultValue: '0', description: 'Routing score' }
    ], [
      trigger(ctx),
      node('n-calc', 'Calculate', 'Compute score', 300, 220, {
        targetVariable: 'score', expression: scoreExpr
      }),
      node('n-gate', 'Condition', gateLabel, 540, 220, {
        conditionGroups: [{ logic: 'and', rules: [gateRule] }],
        trueLabel: 'High', falseLabel: 'Low'
      }),
      email('n-hot', 'Alert sales', 800, 130, 'sales@example.com',
        'High-value submission',
        '<p>A submission scored 50 or above. Please follow up today.</p>'),
      email('n-cold', 'Queue for review', 800, 330, 'ops@example.com',
        'Submission queued for review',
        '<p>A low-scoring submission was queued for manual review.</p>'),
      endNode('n-end', 'Done', 1060, 220)
    ], [
      edge('e1', 'n-start', 'n-calc'),
      edge('e2', 'n-calc', 'n-gate'),
      edge('e3', 'n-gate', 'n-hot', 'true', 'High'),
      edge('e4', 'n-gate', 'n-cold', 'false', 'Low'),
      edge('e5', 'n-hot', 'n-end'),
      edge('e6', 'n-cold', 'n-end')
    ]);
  },

  'save-to-database': function (ctx) {
    return def('n-start', [], [
      trigger(ctx),
      node('n-db', 'Database', 'Insert into your table', 320, 220, {
        connectionMode: 'named', connectionName: 'DashboardDatabase',
        databaseType: 'SqlServer', operation: 'Insert',
        tableName: '', fieldMappings: {}
      }),
      endNode('n-end', 'Done', 600, 220)
    ], [edge('e1', 'n-start', 'n-db'), edge('e2', 'n-db', 'n-end')]);
  },

  'append-to-sheet': function (ctx) {
    return def('n-start', [], [
      trigger(ctx),
      node('n-sheet', 'GoogleSheets', 'Append a row', 320, 220, {
        spreadsheetId: '', sheetName: 'Sheet1', operation: 'Append'
      }),
      endNode('n-end', 'Done', 600, 220)
    ], [edge('e1', 'n-start', 'n-sheet'), edge('e2', 'n-sheet', 'n-end')]);
  },

  'parallel-notify': function (ctx) {
    return def('n-start', [], [
      trigger(ctx),
      node('n-fork', 'Fork', 'Do both at once', 290, 220, {}),
      email('n-mail', 'Email the team', 540, 130, 'team@example.com',
        'New submission', '<p>A new submission arrived.</p>'),
      node('n-hook', 'Webhook', 'Notify Slack', 540, 330, {
        url: 'https://hooks.slack.com/services/REPLACE/ME',
        method: 'POST', headers: '{"Content-Type":"application/json"}',
        body: '{"text":"New submission received"}'
      }),
      node('n-join', 'Join', 'Wait for both', 800, 220, { strategy: 'WaitAll' }),
      endNode('n-end', 'Done', 1040, 220)
    ], [
      edge('e1', 'n-start', 'n-fork'),
      edge('e2', 'n-fork', 'n-mail'),
      edge('e3', 'n-fork', 'n-hook'),
      edge('e4', 'n-mail', 'n-join'),
      edge('e5', 'n-hook', 'n-join'),
      edge('e6', 'n-join', 'n-end')
    ]);
  },

  'approval-with-escalation': function (ctx) {
    return def('n-start', [], [
      trigger(ctx),
      node('n-appr', 'Approval', 'Review (48h SLA)', 300, 220, {
        candidateRoles: ['Reviewer'], candidateUsers: [], dueInHours: 48,
        approvedSubmissionStatus: 'approved', rejectedSubmissionStatus: 'rejected'
      }),
      email('n-esc', 'Escalate to the manager', 560, 330, 'manager@example.com',
        'Approval overdue',
        '<p>A submission has been waiting for review beyond its 48-hour SLA.</p>'),
      email('n-ok', 'Confirm to the submitter', 560, 120, ctx.emailToken,
        'Your submission was approved',
        '<p>Hi ' + ctx.nameToken + ',</p><p>Your submission has been approved.</p>'),
      endNode('n-end', 'Done', 820, 220)
    ], [
      edge('e1', 'n-start', 'n-appr'),
      edge('e2', 'n-appr', 'n-ok', 'approved', 'Approved'),
      edge('e3', 'n-appr', 'n-esc', 'rejected', 'Rejected / overdue'),
      edge('e4', 'n-ok', 'n-end'),
      edge('e5', 'n-esc', 'n-end')
    ]);
  }
};

// ── public catalogue ─────────────────────────────────────────────────────────

export var SAMPLE_PRESETS: Array<{ key: string; label: string; title: string; summary: string; details: string[] }> = [
  {
    key: 'notify-admin', label: 'Notify the team',
    title: 'Notify the team',
    summary: 'The simplest useful workflow: every submission emails your team.',
    details: [
      'Trigger: any submission on this form.',
      'Action: one email to a fixed internal address.',
      'Field dependencies: none — works on any form.',
      'Change the recipient in the Send Task node before applying.'
    ]
  },
  {
    key: 'autoresponder', label: 'Thank-you autoresponder',
    title: 'Thank-you autoresponder',
    summary: 'Emails the submitter a confirmation as soon as they submit.',
    details: [
      'Trigger: any submission.',
      'Action: one email to the submitter.',
      'Field dependencies: uses your email field if the form has one, otherwise a placeholder you edit.',
      'Good default for contact, enquiry, and registration forms.'
    ]
  },
  {
    key: 'crm-sync', label: 'Push to an external API',
    title: 'Push to an external API',
    summary: 'Sends every submission to an external endpoint (CRM, ERP, Zapier).',
    details: [
      'Trigger: any submission.',
      'Action: one HTTP POST with a JSON body.',
      'Field dependencies: none.',
      'Replace the URL and body before applying. External hosts pass through SsrfGuard.'
    ]
  },
  {
    key: 'single-approval', label: 'Single approval',
    title: 'Single approval',
    summary: 'One reviewer approves or rejects; the submitter is told either way.',
    details: [
      'Trigger: any submission. The process pauses at the User Task.',
      'Branching: on the approval outcome, not on a form field.',
      'Field dependencies: uses your email field for the notice, if present.',
      'Assign the Reviewer role in the User Task before applying.'
    ]
  },
  {
    key: 'assign-to-person', label: 'Assign to one person',
    title: 'Assign to one person',
    summary: 'The task is handed to a named user: it arrives in their inbox already assigned, and they are emailed.',
    details: [
      'Trigger: any submission.',
      'Put ONE username in "Candidate users" — the task is assigned to them directly, with no Claim step.',
      'Name a role, or more than one user, and it becomes a queue that anyone eligible can claim instead.',
      'The assignee is emailed when the task is created (an SMTP host must be configured).'
    ]
  },
  {
    key: 'two-step-approval', label: 'Two-step approval',
    title: 'Two-step approval',
    summary: 'Manager approves first, then Finance. A rejection at either step ends the flow.',
    details: [
      'Trigger: any submission.',
      'Branching: two sequential User Tasks, each with approved / rejected handles.',
      'Field dependencies: email field for the rejection notice, if present.',
      'Each step assigns by ROLE, so anyone in that role can claim it. Put a single username in "Candidate users" on a step to hand it to that person instead.',
      'Classic shape for purchase requests, leave, and expense forms.'
    ]
  },
  {
    key: 'score-and-route', label: 'Score and route',
    title: 'Score and route',
    summary: 'Writes a score, then routes high-value submissions to sales and the rest to review.',
    details: [
      'Trigger: any submission.',
      'Branching: an Exclusive Gateway on a real field — a numeric one when the form has it, otherwise "has a response".',
      'Field dependencies: discovered from your schema, so the gateway is always bound to something that exists.',
      'The score variable is written by the Business Rule Task and can be tuned per form from the Workflow library.'
    ]
  },
  {
    key: 'save-to-database', label: 'Save to your SQL table',
    title: 'Save to your SQL table',
    summary: 'Inserts one row into a table on a named connection.',
    details: [
      'Trigger: any submission.',
      'Action: a Service Task (DB) insert.',
      'Field dependencies: none until you choose a table and map columns.',
      'Pick the connection, table, and column mapping in the node before applying.'
    ]
  },
  {
    key: 'append-to-sheet', label: 'Append to Google Sheets',
    title: 'Append to Google Sheets',
    summary: 'Appends one row per submission to a spreadsheet.',
    details: [
      'Trigger: any submission.',
      'Action: a Service Task (Sheet) append.',
      'Field dependencies: none.',
      'Connect Google Sheets and set the spreadsheet id before applying.'
    ]
  },
  {
    key: 'parallel-notify', label: 'Notify two systems at once',
    title: 'Notify two systems at once',
    summary: 'Fans out to an email and a webhook in parallel, then joins.',
    details: [
      'Trigger: any submission.',
      'Branching: a Parallel Gateway runs both branches, a Parallel Join waits for both.',
      'Field dependencies: none.',
      'Use when two systems must both be told and neither should block the other.'
    ]
  },
  {
    key: 'approval-with-escalation', label: 'Approval with SLA escalation',
    title: 'Approval with SLA escalation',
    summary: 'A 48-hour review task; overdue or rejected work escalates to a manager.',
    details: [
      'Trigger: any submission.',
      'Branching: the approved handle confirms to the submitter; the other handle escalates.',
      'Field dependencies: email field for the confirmation, if present.',
      'Adjust the SLA in "Due in hours" on the User Task.'
    ]
  }
];

export function buildSamplePreset(key: string, schema: SampleSchema): any {
  var builder = BUILDERS[key] || BUILDERS['notify-admin'];
  return builder(buildCtx(schema || {}));
}

export function getSampleMeta(key: string): any {
  var i: number;
  for (i = 0; i < SAMPLE_PRESETS.length; i++) {
    if (SAMPLE_PRESETS[i].key === key) return SAMPLE_PRESETS[i];
  }
  return SAMPLE_PRESETS[0];
}

/**
 * Conservative replacement for autoMapWorkflowToSchema.
 *
 * The old mapper rewrote `node.label` to a field label and reassigned `fieldKey` on EVERY
 * Condition rule. That is what produced graphs like "Full Name → Tab 1 → gateway": the
 * trigger got renamed to a field, and a condition on a workflow variable was silently
 * rebound to an unrelated answer.
 *
 * This one only repairs what is actually broken on the target form:
 *   - a FormField node whose fieldKey does not exist here is re-pointed at a real field;
 *   - a Condition rule whose left side is neither an existing field NOR a declared workflow
 *     variable is re-pointed at a real field;
 *   - labels are never touched, and a rule already bound to a variable is left alone.
 */
export function reconcileWorkflowToSchema(def: any, schema: SampleSchema): any {
  if (!def || typeof def !== 'object') return def;
  var fields = (schema && schema.fields) || [];
  if (!fields.length) return def;

  var fieldKeys: { [k: string]: boolean } = {};
  fields.forEach(function (f) { fieldKeys[String(f.key || '').toLowerCase()] = true; });

  var varKeys: { [k: string]: boolean } = {};
  ((def.variables || []) as any[]).forEach(function (v) {
    if (v && v.key) varKeys[String(v.key).toLowerCase()] = true;
  });

  function exists(key: string): boolean {
    var k = String(key || '').toLowerCase();
    return !!k && !!fieldKeys[k];
  }
  function isVariable(key: string): boolean {
    var k = String(key || '').toLowerCase();
    return !!k && !!varKeys[k];
  }
  function repair(hint: string): string {
    var found = findField(schema, [hint], []);
    return (found || fields[0]).key;
  }

  (def.nodes || []).forEach(function (n: any) {
    if (!n) return;
    if (!n.config) n.config = {};

    if (n.type === 'FormField' && !exists(n.config.fieldKey)) {
      n.config.fieldKey = repair(n.config.fieldKey || n.label || '');
      n.config.isPageNode = false;
    }

    if (n.type === 'Condition') {
      ((n.config.conditionGroups || []) as any[]).forEach(function (g) {
        ((g && g.rules) || []).forEach(function (rule: any) {
          if (!rule) return;
          if (exists(rule.fieldKey) || isVariable(rule.fieldKey)) return;
          rule.fieldKey = repair(rule.fieldKey || '');
        });
      });
    }
  });

  return def;
}
