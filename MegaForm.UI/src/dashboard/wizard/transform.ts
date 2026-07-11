// [2026-06-27] Map WizardData → MegaForm save-DTO. This IS the "provide everything to the
// builder" contract: the produced SchemaJson/SettingsJson/ThemeJson/WorkflowJson make the
// existing builder open fully populated. Multi-step → Section pageBreak (the clean standard
// model). No backend change — Publish flags + closeDate ride in SettingsJson.
import { WizardData, WizardField, themeMeta, fontStack, roundnessPx, FONT_STYLES } from './types';
import { mfField, buildFieldFromCatalog, catalogLabel } from './field-catalog';
import { syncFieldPlaceholders } from '@shared/custom-html-insert';
import { migratePremiumWizardSchemaToNative } from '@shared/premium-native-migration';
import { applyDefaultPureGridShell } from '../ai-form-creator';
import { applyPremiumStepDetailsToFields, applyPremiumStepDetailsToHtml } from './premium-steps';

function slug(s: string, used: Set<string>): string {
  let base = String(s || 'field').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
  let key = base, i = 2;
  while (used.has(key)) key = base + '_' + (i++);
  used.add(key);
  return key;
}

// One WizardField → one builder-safe MegaForm field, via the full field catalog
// (Full Name → Composite preset 'name'; Short/Long Text → Composite 'text'/'textarea';
// Dropdown → Select; File/Signature/Rating/Date/… → their real types).
function buildField(f: WizardField, used: Set<string>): any {
  const key = slug(f.label || f.type, used);
  const built = buildFieldFromCatalog(f.type, key, f.label || catalogLabel(f.type), f.required);
  if (built) return built;
  // Unknown key fallback → a plain short-text Composite.
  return mfField('Composite', key, f.label || 'Field', f.required, { widgetProps: { preset: 'text' } });
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

// PREMIUM (custom-shell) emit: keep template styling/scripts, but patch editable step copy
// and field placeholders before the native migration builds Section.pageBreak pages.
function premiumDto(data: WizardData, ctx: WizardSaveCtx): any {
  const t = data.templateRecord || {};
  const settings: any = JSON.parse(JSON.stringify(t.settings || {}));
  // Edited working copy (③ add/remove) if present, else the template's fields. Strip the
  // UI-only __step marker before emit.
  const srcFields = Array.isArray(data.premiumFields) ? data.premiumFields : (Array.isArray(t.fields) ? t.fields : []);
  const fields = JSON.parse(JSON.stringify(srcFields));
  fields.forEach((f: any) => { if (f && f.__step != null) delete f.__step; });
  applyPremiumStepDetailsToFields(fields, data.premiumStepDetails);
  // Reconcile the custom-shell layout so add/remove reflects in the premium HTML before the
  // native migration turns data-step wizard structure into schema Section.pageBreak.
  if (typeof settings.customHtml === 'string' && settings.customHtml) {
    settings.customHtml = applyPremiumStepDetailsToHtml(settings.customHtml, data.premiumStepDetails);
    settings.customHtml = syncFieldPlaceholders(settings.customHtml, fields);
  }
  // Layer Publish options (additive — no style clobber).
  settings.accessLevel = data.accessLevel;
  settings.allowAnonymous = !!data.allowAnonymous;
  settings.collectEmail = !!data.collectEmail;
  settings.limitOneResponse = !!data.limitOneResponse;
  settings.closeDate = data.closeDate || '';
  settings.createdViaWizard = true;
  settings.createdFromTemplateId = t.id || '';

  const schema = { version: '1.0', fields, settings };
  migratePremiumWizardSchemaToNative(schema);
  const requireAuth = data.accessLevel === 'authenticated' || data.accessLevel === 'restricted';
  const workflowJson = buildWorkflow(data);
  const theme = typeof settings.theme === 'string' ? settings.theme : '';
  const rules = Array.isArray(settings.rules) ? settings.rules : [];

  return {
    FormId: 0,
    PreserveModuleBindingOnSave: true,
    ModuleId: ctx.moduleId || 0,
    SiteId: ctx.siteId || 0,
    Title: data.formName || t.title || 'Untitled Form',
    Description: data.formDescription || t.description || '',
    SchemaJson: JSON.stringify(schema),
    SettingsJson: JSON.stringify(settings),
    ThemeJson: JSON.stringify({ theme, customCss: settings.customCss || '' }),
    Status: 'Draft',
    SubmitButtonText: t.submitButtonText || 'Submit',
    SuccessMessage: t.successMessage || 'Thank you! Your submission has been received.',
    RequireAuth: requireAuth,
    EnableCaptcha: false,
    EnableSaveResume: false,
    RulesJson: JSON.stringify(rules),
    WorkflowJson: workflowJson || (settings.workflowTemplate ? JSON.stringify(settings.workflowTemplate) : ''),
    ExpiresOnUtc: data.closeDate ? new Date(data.closeDate).toISOString() : null,
  };
}

export function wizardToDto(data: WizardData, ctx: WizardSaveCtx): any {
  if (data.templateIsPremium && data.templateRecord) return premiumDto(data, ctx);

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
  // ⭐ Wrap single-page forms in the SAME clean "pure-grid" card the AI creator emits, so a
  // wizard-built STANDARD form looks premium (one flat card, no "card thừa") and is
  // structurally identical to AI output — WITHOUT being a premium template. Internally a no-op
  // for multi-step (multiPage)/pageBreak/custom-shell forms (they keep the standard renderer).
  applyDefaultPureGridShell(schema);
  const requireAuth = data.accessLevel === 'authenticated' || data.accessLevel === 'restricted';
  const workflowJson = buildWorkflow(data);
  const finalTheme = typeof settings.theme === 'string' ? settings.theme : mfTheme;

  return {
    FormId: 0,
    PreserveModuleBindingOnSave: true,
    ModuleId: ctx.moduleId || 0,
    SiteId: ctx.siteId || 0,
    Title: data.formName || 'Untitled Form',
    Description: data.formDescription || '',
    SchemaJson: JSON.stringify(schema),
    SettingsJson: JSON.stringify(settings),
    ThemeJson: JSON.stringify({ theme: finalTheme, customCss: settings.customCss || '', cssOverrides }),
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
