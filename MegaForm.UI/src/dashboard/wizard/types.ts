// [2026-06-27 Form Creation Wizard] Data model + static config. Ported from the v0 mock
// (mega-form-admin-redesign components/form-builder-wizard.tsx). The wizard is a thin
// creation front-end: it accumulates WizardData, then transform.ts emits a MegaForm
// save-DTO that the EXISTING builder loads fully populated. No backend change (the 3
// new Publish flags + closeDate ride in SettingsJson, a free-form blob).

// Update state. rerender:false = data-only (used by text inputs so they keep focus —
// vanilla has no React reconciliation; a full step re-render would blur the input).
export type SetFn = (patch: Partial<WizardData>, opts?: { rerender?: boolean }) => void;

export interface WizardField { id: string; type: string; label: string; required: boolean; }
export interface FormPage { id: string; title: string; fields: WizardField[]; }
export interface ApprovalNode { id: string; role: string; name: string; type: 'approve' | 'review' | 'notify'; required: boolean; }

export interface WizardData {
  // 1 — Setup
  formName: string; formDescription: string; category: string; template: string | null;
  // 2 — Fields
  isMultiStep: boolean; fields: WizardField[]; formPages: FormPage[]; showProgressBar: boolean;
  // 3 — Workflow
  approvalEnabled: boolean; approvalNodes: ApprovalNode[]; notifySubmitter: boolean; deadlineDays: string;
  // 4 — Design
  theme: string; primaryColor: string; accentColor: string; fontStyle: string; roundness: string;
  // 5 — Publish
  accessLevel: 'public' | 'authenticated' | 'restricted';
  allowAnonymous: boolean; collectEmail: boolean; limitOneResponse: boolean; closeDate: string;
}

export function defaultWizardData(): WizardData {
  return {
    formName: '', formDescription: '', category: '', template: null,
    isMultiStep: false, fields: [], formPages: [{ id: 'page-1', title: 'Step 1', fields: [] }], showProgressBar: true,
    approvalEnabled: false, approvalNodes: [], notifySubmitter: true, deadlineDays: '3',
    theme: 'clean', primaryColor: '#3b82f6', accentColor: '#8b5cf6', fontStyle: 'inter', roundness: 'md',
    accessLevel: 'public', allowAnonymous: true, collectEmail: false, limitOneResponse: false, closeDate: '',
  };
}

export interface WizardStepMeta { key: string; label: string; desc: string; icon: string; }
export const WIZARD_STEPS: WizardStepMeta[] = [
  { key: 'setup',    label: 'Setup',    desc: 'Name & template',     icon: 'fa-file-lines' },
  { key: 'fields',   label: 'Fields',   desc: 'Add form fields',     icon: 'fa-layer-group' },
  { key: 'workflow', label: 'Workflow', desc: 'Approval chain',      icon: 'fa-code-branch' },
  { key: 'design',   label: 'Design',   desc: 'Colors & typography', icon: 'fa-palette' },
  { key: 'publish',  label: 'Publish',  desc: 'Access & sharing',    icon: 'fa-upload' },
];

// Palette: mock label → MegaForm field type + icon.
export interface FieldTypeMeta { type: string; mfType: string; label: string; icon: string; }
export const FIELD_TYPES: FieldTypeMeta[] = [
  { type: 'text',     mfType: 'Text',     label: 'Short Text', icon: 'fa-font' },
  { type: 'textarea', mfType: 'Textarea', label: 'Long Text',  icon: 'fa-align-left' },
  { type: 'email',    mfType: 'Email',    label: 'Email',      icon: 'fa-envelope' },
  { type: 'phone',    mfType: 'Phone',    label: 'Phone',      icon: 'fa-phone' },
  { type: 'number',   mfType: 'Number',   label: 'Number',     icon: 'fa-hashtag' },
  { type: 'dropdown', mfType: 'Select',   label: 'Dropdown',   icon: 'fa-list' },
  { type: 'checkbox', mfType: 'Checkbox', label: 'Checkbox',   icon: 'fa-square-check' },
  { type: 'date',     mfType: 'Date',     label: 'Date',       icon: 'fa-calendar' },
  { type: 'rating',   mfType: 'Rating',   label: 'Rating',     icon: 'fa-star' },
  { type: 'fullname', mfType: 'Row',      label: 'Full Name',  icon: 'fa-user' },
];
export const fieldMeta = (type: string): FieldTypeMeta => FIELD_TYPES.find(f => f.type === type) || FIELD_TYPES[0];

// 8 presets → [primary, ink/dark, surface] + the closest MegaForm preset id.
export interface ThemeMeta { id: string; label: string; colors: [string, string, string]; mfPreset: string; }
export const THEMES: ThemeMeta[] = [
  { id: 'clean',    label: 'Clean',    colors: ['#3b82f6', '#ffffff', '#f8fafc'], mfPreset: 'default' },
  { id: 'ocean',    label: 'Ocean',    colors: ['#0ea5e9', '#0c4a6e', '#f0f9ff'], mfPreset: 'ocean' },
  { id: 'forest',   label: 'Forest',   colors: ['#22c55e', '#14532d', '#f0fdf4'], mfPreset: 'forest' },
  { id: 'sunset',   label: 'Sunset',   colors: ['#f97316', '#7c2d12', '#fff7ed'], mfPreset: 'sunset' },
  { id: 'midnight', label: 'Midnight', colors: ['#6366f1', '#1e1b4b', '#eef2ff'], mfPreset: 'midnight' },
  { id: 'rose',     label: 'Rose',     colors: ['#ec4899', '#831843', '#fdf2f8'], mfPreset: 'rose' },
  { id: 'slate',    label: 'Slate',    colors: ['#64748b', '#0f172a', '#f8fafc'], mfPreset: 'slate' },
  { id: 'violet',   label: 'Violet',   colors: ['#8b5cf6', '#2e1065', '#f5f3ff'], mfPreset: 'lavender' },
];
export const themeMeta = (id: string): ThemeMeta => THEMES.find(t => t.id === id) || THEMES[0];

export const FONT_STYLES = [
  { id: 'inter', label: 'Inter',     stack: "'Inter', system-ui, sans-serif", css: 'sans-serif' },
  { id: 'geist', label: 'Geist',     stack: "'Geist', 'DM Sans', system-ui, sans-serif", css: 'sans-serif' },
  { id: 'mono',  label: 'Monospace', stack: "'IBM Plex Mono', ui-monospace, monospace", css: 'monospace' },
  { id: 'serif', label: 'Serif',     stack: "'Playfair Display', Georgia, serif", css: 'serif' },
];
export const fontStack = (id: string): string => (FONT_STYLES.find(f => f.id === id) || FONT_STYLES[0]).stack;

// Corner style → radius px applied to form/input/button.
export const ROUNDNESS = [
  { id: 'none', label: 'Sharp',   px: 0 },
  { id: 'sm',   label: 'Slight',  px: 5 },
  { id: 'md',   label: 'Default', px: 10 },
  { id: 'lg',   label: 'Rounded', px: 18 },
  { id: 'full', label: 'Pill',    px: 50 },
];
export const roundnessPx = (id: string): number => (ROUNDNESS.find(r => r.id === id) || ROUNDNESS[2]).px;

export const APPROVAL_ROLES = [
  'Direct Manager', 'Department Head', 'HR Manager', 'Finance Controller',
  'IT Administrator', 'Legal Counsel', 'CEO / Executive', 'Custom Role',
];

export const CATEGORIES = [
  { id: 'hr', label: 'HR & People', icon: 'fa-users' },
  { id: 'it', label: 'IT & Support', icon: 'fa-gear' },
  { id: 'finance', label: 'Finance', icon: 'fa-chart-column' },
  { id: 'operations', label: 'Operations', icon: 'fa-briefcase' },
  { id: 'education', label: 'Education', icon: 'fa-graduation-cap' },
  { id: 'customer', label: 'Customer', icon: 'fa-heart' },
  { id: 'ecommerce', label: 'E-commerce', icon: 'fa-cart-shopping' },
  { id: 'other', label: 'Other', icon: 'fa-globe' },
];

// Lightweight starter templates (field sets) — id 'blank' = empty.
export const TEMPLATES: Array<{ id: string; label: string; desc: string; icon: string; badge?: string; fieldTypes: string[] }> = [
  { id: 'blank',   label: 'Blank Form',    desc: 'Start from scratch',     icon: 'fa-file', fieldTypes: [] },
  { id: 'contact', label: 'Contact Form',  desc: 'Name, email, message',   icon: 'fa-envelope', badge: 'Popular', fieldTypes: ['fullname', 'email', 'phone', 'textarea'] },
  { id: 'leave',   label: 'Leave Request', desc: 'Employee leave request', icon: 'fa-calendar', badge: 'Popular', fieldTypes: ['fullname', 'email', 'date', 'date', 'dropdown', 'textarea'] },
  { id: 'support', label: 'Support Ticket', desc: 'Issue tracking',        icon: 'fa-gear', fieldTypes: ['fullname', 'email', 'dropdown', 'textarea', 'rating'] },
  { id: 'survey',  label: 'Feedback Survey', desc: 'NPS & open questions', icon: 'fa-star', fieldTypes: ['rating', 'dropdown', 'textarea'] },
];
