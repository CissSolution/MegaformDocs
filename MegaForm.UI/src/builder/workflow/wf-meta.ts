// wf-meta.ts — NODE_META registry and palette group arrays
import type { AnyObj } from './wf-types';

// BPMN 2.0 subset mapping used by the executable MegaForm workflow editor.
// We keep MegaForm's runtime node ids, but present them with BPMN terminology
// so business users understand what kind of process element they are editing.
export var NODE_META: AnyObj = {
  // Supported — have real backend executors
  FormField:    { icon: '□',  label: 'Form Data',             zone: 'nav',    accent: '#6366f1', bg: '#eef2ff', border: '#a5b4fc' },
  Condition:    { icon: '◇',  label: 'Exclusive Gateway',    zone: 'nav',    accent: '#8b5cf6', bg: '#f5f3ff', border: '#c4b5fd' },
  Switch:       { icon: '⇉',  label: 'Multi-way Gateway',    zone: 'nav',    accent: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
  SetVariable:  { icon: 'SV', label: 'Script Task',          zone: 'action', accent: '#0ea5e9', bg: '#e0f2fe', border: '#7dd3fc' },
  Webhook:      { icon: 'API',label: 'Service Task',         zone: 'action', accent: '#0ea5e9', bg: '#e0f2fe', border: '#7dd3fc' },
  SendEmail:    { icon: '✉',  label: 'Send Task',            zone: 'action', accent: '#10b981', bg: '#ecfdf5', border: '#6ee7b7' },
  Calculate:    { icon: 'Σ',  label: 'Business Rule Task',   zone: 'action', accent: '#ec4899', bg: '#fdf2f8', border: '#f9a8d4' },
  Approval:     { icon: 'UT', label: 'User Task',            zone: 'action', accent: '#ca8a04', bg: '#fefce8', border: '#fde047' },
  Database:     { icon: 'DB', label: 'Service Task (DB)',    zone: 'action', accent: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
  GoogleSheets: { icon: 'GS', label: 'Service Task (Sheet)', zone: 'action', accent: '#16a34a', bg: '#ecfdf5', border: '#86efac' },
  End:          { icon: '◉',  label: 'End Event',            zone: 'action', accent: '#ef4444', bg: '#fee2e2', border: '#fca5a5' },

  // Future / advanced — keep meta for rendering saved flows
  Fork:        { icon: '∥', label: 'Parallel Gateway', zone: 'action', accent: '#f59e0b', bg: '#fffbeb', border: '#fcd34d' },
  Join:        { icon: '⋈', label: 'Parallel Join',    zone: 'action', accent: '#f59e0b', bg: '#fffbeb', border: '#fcd34d' },
  Filter:      { icon: '△', label: 'Conditional Gate', zone: 'nav',   accent: '#f59e0b', bg: '#fffbeb', border: '#fcd34d' },
  Loop:        { icon: '↺', label: 'Loop Activity',    zone: 'action', accent: '#0ea5e9', bg: '#e0f2fe', border: '#7dd3fc' },
  WebhookIn:   { icon: '⚡',label: 'Message Start',    zone: 'nav',    accent: '#0ea5e9', bg: '#e0f2fe', border: '#7dd3fc' },
  FormSubmit:  { icon: '▶', label: 'Form Start',       zone: 'nav',    accent: '#6366f1', bg: '#eef2ff', border: '#a5b4fc' },
  Schedule:    { icon: '⏰',label: 'Timer Start',      zone: 'nav',    accent: '#8b5cf6', bg: '#f5f3ff', border: '#c4b5fd' },
  Manual:      { icon: '▷', label: 'Manual Start',     zone: 'nav',    accent: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
  Slack:       { icon: '💬',label: 'Slack',            zone: 'action', accent: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  Calendar:    { icon: '📆',label: 'Calendar',         zone: 'action', accent: '#059669', bg: '#ecfdf5', border: '#6ee7b7' }
};

// Only supported nodes (with real executors) appear on the palette.
export var TRIGGER_TYPES: string[] = [];
export var NAV_TYPES: string[] = ['Condition'];
export var LOGIC_TYPES: string[] = ['Calculate', 'SetVariable'];
export var ACTION_TYPES: string[] = ['Approval', 'SendEmail', 'Webhook', 'Database', 'GoogleSheets', 'End'];
export var INTEGRATION_TYPES: string[] = [];

export var WORKFLOW_BUILD_TAG = 'MF240423-APPROVAL-SPLIT';
export var WORKFLOW_VERSION_TAG = 'v3.3-bpmn2';
