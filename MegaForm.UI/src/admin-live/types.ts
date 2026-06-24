// ============================================================
// MegaForm Admin Live Style Editor — Types
// ============================================================

export interface ThemePreset {
  key: string;
  name: string;
  primaryColor: string;
  bgColor: string;
}

// target: which element receives the CSS variable
// 'wrapper' = .mf-form-wrapper (default)
// 'inner'   = .mf-form-inner  (e.g. max-width must go here)
export type ControlTarget = 'wrapper' | 'inner';

export type ControlType = 'color' | 'range' | 'text' | 'select' | 'shadow' | 'font';

export interface ControlDef {
  var: string;
  label: string;
  type: ControlType;
  target?: ControlTarget;  // defaults to 'wrapper'
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: Array<{ label: string; value: string }>;
  hint?: string;
}

export type PaneId = 'theme' | 'layout' | 'typography' | 'inputs' | 'button' | 'css';

export interface ControlGroup {
  pane: PaneId;
  title: string;
  controls: ControlDef[];
}

export interface StyleState {
  themeClass: string;
  cssVars: Record<string, string>;
  innerVars: Record<string, string>;   // vars on .mf-form-inner
  extraClass: string;
  inspectorState?: string;
}

export interface SaveStylePayload {
  formId: number;
  moduleId: number;
  themeClass: string;
  cssOverride: string;
  extraClass: string;
}

export interface InspectTarget {
  label: string;
  pane: PaneId;
  vars: string[];
  scrollToVar?: string;
}

export interface InspectSelection {
  element: HTMLElement;
  target: InspectTarget;
}
