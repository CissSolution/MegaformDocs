// ============================================================
// MegaForm Widget Runtime — Plugin Registry + Dispatch
// All widgets are loaded as plugins from /Assets/js/plugins/.
// This file provides the typed registry + dispatch API.
// ============================================================

import type { FormField } from '@core/types';

export const WIDGET_REGISTRY_BADGE = 'WidgetRegistry v20260409-01';

function normalizeFieldForWidgetRender(field: FormField): FormField {
  const next: any = Object.assign({}, field || {});
  const rootPlaceholder = next && next.placeholder != null ? String(next.placeholder) : '';
  const props = Object.assign({}, next.widgetProps || {});
  if ((props.placeholder == null || String(props.placeholder) === '') && rootPlaceholder !== '') {
    props.placeholder = rootPlaceholder;
  }
  next.widgetProps = props;
  return next as FormField;
}

/** Plugin interface that each widget must implement */
export interface WidgetPlugin {
  /** Render the widget HTML for the form */
  render(field: FormField, formId: number, existingValue?: string): string;
  /** Bind interactive events after render */
  bind?(formId: number): void;
  /** Collect the widget's current value */
  collect?(key: string, container: HTMLElement): unknown;
  /** Validate the widget — return true/null=valid, false/string=error */
  validate?(key: string, container: HTMLElement): boolean | string | null;
  /** Default widgetProps for new fields */
  defaults?: Record<string, unknown>;
  /** Property definitions for the builder properties panel */
  properties?: Array<{ key: string; label: string; type: string; options?: Array<{ label: string; value: string }> }>;
  /** Metadata about the widget */
  meta?: { icon?: string; label?: string; category?: string };
}

// ── Plugin Registry ──
const plugins: Record<string, WidgetPlugin> = {};
const widgetTypes: Record<string, boolean> = {};

/** Register a widget plugin */
export function register(typeName: string, plugin: WidgetPlugin): void {
  if (!typeName || !plugin || !plugin.render) {
    console.error('MegaFormWidgets.register: invalid plugin', typeName);
    return;
  }
  const existing: any = plugins[typeName] || null;
  const incomingCanonical = !!((plugin as any)?.meta && (plugin as any).meta.canonical);
  const existingCanonical = !!(existing?.meta && existing.meta.canonical);
  if (typeName === 'Payment' && existing) {
    if (existingCanonical && !incomingCanonical) {
      console.warn('MegaFormWidgets.register: skipped duplicate Payment plugin (canonical already registered)');
      return;
    }
    if (!existingCanonical && incomingCanonical) {
      console.warn('MegaFormWidgets.register: replacing legacy Payment plugin with canonical unified Payment');
    } else if (!incomingCanonical) {
      console.warn('MegaFormWidgets.register: skipped duplicate Payment plugin');
      return;
    }
  }
  plugins[typeName] = plugin;
  widgetTypes[typeName] = true;
  console.log(`MegaFormWidgets: registered plugin "${typeName}"`);
}

/** Check if a type is a widget */
export function isWidget(type: string): boolean {
  return !!widgetTypes[type];
}

/** Render a widget field to HTML */
export function renderWidget(field: FormField, formId: number, existingValue?: string): string {
  const normalized = normalizeFieldForWidgetRender(field);
  const p = plugins[normalized.type];
  if (p?.render) return p.render(normalized, formId, existingValue);
  return `<div style="padding:12px;background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;font-size:13px;color:#92400e;">` +
    `<strong>Widget "${field.type || '?'}"</strong> — plugin not installed.</div>`;
}

/** Bind widget interactivity after form renders */
export function bindWidgets(formId: number): void {
  for (const t in plugins) {
    if (plugins[t].bind) {
      try { plugins[t].bind!(formId); }
      catch (e) { console.error(`MegaFormWidgets: bind error in "${t}":`, e); }
    }
  }
}

/** Collect a widget's current value */
export function collectWidgetValue(key: string, type: string, container: HTMLElement): unknown {
  const p = plugins[type];
  return p?.collect ? p.collect(key, container) : '';
}

/** Validate a widget field */
export function validateWidget(key: string, type: string, container: HTMLElement): boolean | string | null {
  const p = plugins[type];
  return p?.validate ? p.validate(key, container) : true;
}

/** Get a plugin by type */
export function getPlugin(typeName: string): WidgetPlugin | null {
  return plugins[typeName] || null;
}

/** Get default widgetProps for a type */
export function getPluginDefaults(typeName: string): Record<string, unknown> | null {
  const p = plugins[typeName];
  return p?.defaults ? JSON.parse(JSON.stringify(p.defaults)) : null;
}

/** Get property definitions for builder */
export function getPluginProperties(typeName: string): WidgetPlugin['properties'] | null {
  return plugins[typeName]?.properties ?? null;
}

/** Get plugin metadata */
export function getPluginMeta(typeName: string): WidgetPlugin['meta'] | null {
  return plugins[typeName]?.meta ?? null;
}

/** Get all registered plugins */
export function getAllPlugins(): Record<string, WidgetPlugin> { return plugins; }

// ── Public API object (for backward compat with legacy plugins) ──
const MegaFormWidgets = {
  widgetTypes,
  renderWidget,
  bindWidgets,
  collectWidgetValue,
  validateWidget,
  register,
  getPlugin,
  getPluginDefaults,
  getPluginProperties,
  getPluginMeta,
  getAllPlugins,
  isWidget,
};

export default MegaFormWidgets;

// Expose globally so legacy JS plugins can register via MegaFormWidgets.register(...)
if (typeof window !== 'undefined') {
  (window as any).MegaFormWidgets = MegaFormWidgets;
  (window as any).__MF_WIDGET_REGISTRY_BADGE = WIDGET_REGISTRY_BADGE;
}
