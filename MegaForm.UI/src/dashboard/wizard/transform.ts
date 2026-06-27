// [2026-06-27] Map WizardData → MegaForm save-DTO. This IS the "provide everything to the
// builder" contract: the produced SchemaJson/SettingsJson/ThemeJson/WorkflowJson make the
// existing builder open fully populated. Multi-step → Section pageBreak (the clean standard
// model). No backend change — Publish flags + closeDate ride in SettingsJson.
import { WizardData, WizardField, fieldMeta, themeMeta, fontStack, roundnessPx, FONT_STYLES } from './types';

function slug(s: string, used: Set<string>): string {
  let base = String(s || 'field').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
  let key = base, i = 2;
  while (used.has(key)) key = base + '_' + (i++);
  used.add(key);
  return key;
}

// Canonical MegaForm field — backfill arrays/objects so the builder never .map()s undefined.
function mfField(type: string, key: string, label: string, required: boolean, extra?: any): any {
  return Object.assign({
    key, type, label, required: !!required,
    placeholder: '', helpText: '', defaultValue: '', cssClass: '', width: '100%',
    readOnly: false, prefillParam: '', validation: {}, options: [], showIf: null,
    htmlContent: '', fileSettings: null, properties: {},
  }, extra || {});
}

function optionList(label: string): any[] {
  return ['Option 1', 'Option 2', 'Option 3'].map(o => ({ label: o, value: o.toLowerCase().replace(/\s+/g, '_') }));
}

// One WizardField → one MegaForm field (Full Name → a 2-column Row of first/last name).
function buildField(f: WizardField, used: Set<string>): any {
  const meta = fieldMeta(f.type);
  const mfType = meta.mfType;
  if (f.type === 'fullname') {
    const rowKey = slug(f.label || 'name', used);
    const first = mfField('Text', slug('first_name', used), 'First name', f.required, { placeholder: 'Jane' });
    const last = mfField('Text', slug('last_name', used), 'Last name', f.required, { placeholder: 'Doe' });
    return mfField('Row', rowKey, f.label || 'Full Name', false, {
      columns: [{ span: 6, fields: [first] }, { span: 6, fields: [last] }],
    });
  }
  const key = slug(f.label || f.type, used);
  const extra: any = {};
  if (mfType === 'Select' || mfType === 'Radio' || mfType === 'MultiSelect') extra.options = optionList(f.label);
  if (mfType === 'Textarea') extra.placeholder = 'Enter your answer...';
  return mfField(mfType, key, f.label || meta.label, f.required, extra);
}

function hasEmail(fields: any[]): boolean {
  return JSON.stringify(fields).indexOf('"type":"Email"') >= 0;
}

// Build the schema.fields array (single or multi-step with Section pageBreaks).
function buildFields(data: WizardData, used: Set<string>): any[] {
  const out: any[] = [];
  if (data.isMultiStep) {
    data.formPages.forEach((page, i) => {
      if (i > 0) out.push(mfField('Section', slug('section_' + (page.title || ('step' + (i + 1))), used), page.title || ('Step ' + (i + 1)), false, { properties: { pageBreak: true } }));
      for (const f of page.fields) out.push(buildField(f, used));
    });
  } else {
    for (const f of data.fields) out.push(buildField(f, used));
  }
  // collectEmail = "auto-add email field" — append one if the form has none.
  if (data.collectEmail && !hasEmail(out)) out.push(mfField('Email', slug('email', used), 'Email address', true, { placeholder: 'you@example.com' }));
  return out;
}

function buildCssOverrides(data: WizardData): Record<string, string> {
  const r = roundnessPx(data.roundness);
  return {
    '--mf-primary': data.primaryColor,
    '--mf-c1': data.accentColor,
    '--mf-font-family': fontStack(data.fontStyle),
    '--mf-form-radius': r + 'px',
    '--mf-input-radius': Math.min(r, 24) + 'px',
    '--mf-btn-radius': r + 'px',
  };
}

// WorkflowJson — N Approval nodes in series + End (v1 simple mapping; see handoff 4c).
function buildWorkflow(data: WizardData): string {
  if (!data.approvalEnabled || !data.approvalNodes.length) return '';
  const now = Date.now();
  const days = parseInt(data.deadlineDays, 10);
  const dueInHours = isFinite(days) && days > 0 ? days * 24 : 72;
  const nodes: any[] = [];
  const edges: any[] = [];
  data.approvalNodes.forEach((n, i) => {
    const id = 'approval-' + (i + 1);
    nodes.push({
      id, type: 'Approval', label: n.role + (n.name ? ' — ' + n.name : ''),
      position: { x: 140, y: 120 + i * 190 }, zoneType: 'Action',
      config: {
        candidateRoles: n.role && n.role !== 'Custom Role' ? [n.role] : [],
        candidateUsers: n.name ? [n.name] : [],
        allowClaim: true, allowForward: true, allowReassign: true, commentRequiredOnReject: false,
        dueInHours, pendingSubmissionStatus: 'pending_approval', approvedSubmissionStatus: 'approved', rejectedSubmissionStatus: 'rejected',
        notifyOnCreate: true, notifyOnForward: true,
        wizardActionType: n.type, wizardRequired: n.required,    // preserved for later refinement
      },
    });
  });
  const endId = 'end-1';
  nodes.push({ id: endId, type: 'End', label: 'Done', position: { x: 140, y: 120 + nodes.length * 190 }, zoneType: 'Action', config: { endType: 'Success', message: 'Your submission has been approved.' } });
  for (let i = 0; i < data.approvalNodes.length; i++) {
    const src = 'approval-' + (i + 1);
    const tgt = i < data.approvalNodes.length - 1 ? 'approval-' + (i + 2) : endId;
    edges.push({ id: 'edge-' + (i + 1), sourceNodeId: src, targetNodeId: tgt, sourceHandle: 'approved', targetHandle: 'input', label: 'Approved' });
  }
  return JSON.stringify({
    id: 'wf-' + now, formId: 0, name: (data.formName || 'Form') + ' Workflow', version: '1.0.0',
    startNodeId: nodes[0].id, nodes, edges, variables: [],
    settings: { executionTimeoutSeconds: 300, dryRun: false, enableExecutionLog: true, notifySubmitterOnStatusChange: data.notifySubmitter },
  });
}

export interface WizardSaveCtx { moduleId: number; siteId: number; }

export function wizardToDto(data: WizardData, ctx: WizardSaveCtx): any {
  const used = new Set<string>();
  const fields = buildFields(data, used);
  const cssOverrides = buildCssOverrides(data);
  const mfTheme = themeMeta(data.theme).mfPreset;

  const settings: any = {
    theme: mfTheme,
    cssOverrides,
    themeCssOverrides: cssOverrides,
    multiPage: !!data.isMultiStep,
    showProgressBar: !!data.showProgressBar,
    // Publish (no backend column needed — settings is a free-form blob)
    accessLevel: data.accessLevel,
    allowAnonymous: !!data.allowAnonymous,
    collectEmail: !!data.collectEmail,
    limitOneResponse: !!data.limitOneResponse,
    closeDate: data.closeDate || '',
    createdViaWizard: true,
  };

  const schema = { version: '1.0', fields, settings };
  const requireAuth = data.accessLevel === 'authenticated' || data.accessLevel === 'restricted';
  const workflowJson = buildWorkflow(data);

  return {
    FormId: 0,
    PreserveModuleBindingOnSave: true,
    ModuleId: ctx.moduleId || 0,
    SiteId: ctx.siteId || 0,
    Title: data.formName || 'Untitled Form',
    Description: data.formDescription || '',
    SchemaJson: JSON.stringify(schema),
    SettingsJson: JSON.stringify(settings),
    ThemeJson: JSON.stringify({ theme: mfTheme, cssOverrides }),
    Status: 'Draft',
    SubmitButtonText: 'Submit',
    SuccessMessage: 'Thank you! Your submission has been received.',
    RequireAuth: requireAuth,
    EnableCaptcha: false,
    EnableSaveResume: false,
    RulesJson: '[]',
    WorkflowJson: workflowJson,
    ExpiresOnUtc: data.closeDate ? new Date(data.closeDate).toISOString() : null,
  };
}
