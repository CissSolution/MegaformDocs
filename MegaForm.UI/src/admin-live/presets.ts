// ============================================================
// MegaForm Admin Live Style Editor — Presets & Control Definitions
// ============================================================

import type { ThemePreset, ControlGroup } from './types';

export const THEME_PRESETS: ThemePreset[] = [
  { key: '',                       name: 'Default',      primaryColor: '#4a90d9', bgColor: '#f5f5f5' },
  { key: 'mf-theme-minimal',       name: 'Minimal',      primaryColor: '#1a1a1a', bgColor: '#ffffff' },
  { key: 'mf-theme-modern-blue',   name: 'Modern Blue',  primaryColor: '#667eea', bgColor: '#667eea' },
  { key: 'mf-theme-warm-sunset',   name: 'Warm Sunset',  primaryColor: '#ff6b35', bgColor: '#fff8f0' },
  { key: 'mf-theme-dark-elegance', name: 'Dark',         primaryColor: '#e94560', bgColor: '#0f0f0f' },
  { key: 'mf-theme-nature-green',  name: 'Nature',       primaryColor: '#2d8a4e', bgColor: '#f0f7f0' },
  { key: 'mf-theme-flat-material', name: 'Material',     primaryColor: '#1976d2', bgColor: '#fafafa' },
  { key: 'mf-theme-classic-formal',name: 'Classic',      primaryColor: '#1a237e', bgColor: '#fafaf8' },
  { key: 'mf-theme-executive',     name: 'Executive',    primaryColor: '#b8860b', bgColor: '#f9f7f4' },
  { key: 'mf-theme-healthcare',    name: 'Healthcare',   primaryColor: '#00796b', bgColor: '#f5faf9' },
  { key: 'mf-theme-tech-startup',  name: 'Tech',         primaryColor: '#6d28d9', bgColor: '#faf9ff' },
  { key: 'mf-theme-playful',       name: 'Playful',      primaryColor: '#f43f5e', bgColor: '#fff5f6' },
];

export const FONT_FAMILIES: Array<{ label: string; value: string; url?: string }> = [
  { label: 'System Default',    value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { label: 'Georgia (Serif)',   value: "Georgia, 'Times New Roman', serif" },
  { label: 'Inter',             value: "'Inter', sans-serif",            url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
  { label: 'DM Sans',           value: "'DM Sans', sans-serif",          url: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap' },
  { label: 'Plus Jakarta Sans', value: "'Plus Jakarta Sans', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap' },
  { label: 'Nunito',            value: "'Nunito', sans-serif",            url: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap' },
  { label: 'Outfit',            value: "'Outfit', sans-serif",            url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap' },
  { label: 'Poppins',           value: "'Poppins', sans-serif",           url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap' },
  { label: 'Raleway',           value: "'Raleway', sans-serif",           url: 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap' },
  { label: 'Playfair Display',  value: "'Playfair Display', serif",       url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap' },
  { label: 'Cormorant Garamond',value: "'Cormorant Garamond', serif",     url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap' },
  { label: 'Libre Baskerville', value: "'Libre Baskerville', serif",      url: 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap' },
  { label: 'Merriweather',      value: "'Merriweather', serif",           url: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap' },
  { label: 'Montserrat',        value: "'Montserrat', sans-serif",        url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap' },
  { label: 'Josefin Sans',      value: "'Josefin Sans', sans-serif",      url: 'https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;600;700&display=swap' },
  { label: 'IBM Plex Sans',     value: "'IBM Plex Sans', sans-serif",     url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap' },
  { label: 'Space Grotesk',     value: "'Space Grotesk', sans-serif",     url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap' },
];

const loadedFonts = new Set<string>();
export function ensureFontLoaded(url: string): void {
  if (!url || loadedFonts.has(url)) return;
  loadedFonts.add(url);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

export const CONTROL_GROUPS: ControlGroup[] = [
  {
    pane: 'layout',
    title: 'Container & Spacing',
    controls: [
      { var: '--mf-form-max-width', label: 'Form Max Width',     type: 'range',  min: 320, max: 1600, step: 20, unit: 'px', target: 'inner', hint: 'Giới hạn bởi chiều rộng container DNN' },
      { var: '--mf-form-radius',    label: 'Form Corner Radius', type: 'range',  min: 0,   max: 40,   step: 1,  unit: 'px' },
      { var: '--mf-form-padding',   label: 'Form Padding',       type: 'text',   hint: 'e.g. 32px 40px' },
      { var: '--mf-field-gap',      label: 'Field Gap',          type: 'range',  min: 4,   max: 60,   step: 2,  unit: 'px' },
      { var: '--mf-line-height',    label: 'Line Height',        type: 'range',  min: 1.0, max: 2.0,  step: 0.05, unit: '' },
    ],
  },
  {
    pane: 'layout',
    title: 'Colors & Shadows',
    controls: [
      { var: '--mf-page-bg',      label: 'Page Background',    type: 'color' },
      { var: '--mf-form-bg',      label: 'Form Background',    type: 'color' },
      { var: '--mf-bg',           label: 'Inner Background',   type: 'color' },
      { var: '--mf-border',       label: 'Border Color',       type: 'color' },
      { var: '--mf-form-border',  label: 'Form Border',        type: 'text',  hint: 'e.g. 1px solid #e2e8f0' },
      { var: '--mf-form-shadow',  label: 'Form Shadow',        type: 'shadow' },
      { var: '--mf-page-bg-image',label: 'Page BG Image',      type: 'text',  hint: 'CSS background-image value' },
    ],
  },
  {
    pane: 'layout',
    title: 'Section Breaks',
    controls: [
      { var: '--mf-section-bg',           label: 'Section Background', type: 'color' },
      { var: '--mf-section-border-color', label: 'Section Border',     type: 'color' },
      { var: '--mf-section-padding',      label: 'Section Padding',    type: 'text', hint: 'e.g. 16px 0' },
    ],
  },
  {
    pane: 'typography',
    title: 'Font Family',
    controls: [
      { var: '--mf-font-family', label: 'Form Font', type: 'font' },
    ],
  },
  {
    pane: 'typography',
    title: 'Body Text',
    controls: [
      { var: '--mf-font-size-base',   label: 'Base Font Size',     type: 'range',  min: 12, max: 22, step: 1, unit: 'px' },
      { var: '--mf-color-text',       label: 'Body Text Color',    type: 'color' },
      { var: '--mf-color-text-light', label: 'Light Text',         type: 'color' },
      { var: '--mf-color-text-muted', label: 'Muted Text',         type: 'color' },
      { var: '--mf-text',             label: 'Alt Text Color',     type: 'color' },
      { var: '--mf-muted',            label: 'Muted Alt',          type: 'color' },
    ],
  },
  {
    pane: 'typography',
    title: 'Form Title',
    controls: [
      { var: '--mf-title-font-size',   label: 'Title Size',        type: 'range',  min: 14, max: 60, step: 1, unit: 'px' },
      { var: '--mf-title-color',       label: 'Title Color',       type: 'color' },
      { var: '--mf-title-font-weight', label: 'Title Weight',      type: 'select',
        options: [{ label: '400', value: '400' },{ label: '600', value: '600' },{ label: '700', value: '700' },{ label: '800', value: '800' }],
      },
      { var: '--mf-title-align',       label: 'Title Align',       type: 'select',
        options: [{ label: 'Left', value: 'left' },{ label: 'Center', value: 'center' },{ label: 'Right', value: 'right' }],
      },
    ],
  },
  {
    pane: 'typography',
    title: 'Labels & Help Text',
    controls: [
      { var: '--mf-label-font-size',     label: 'Label Size',         type: 'range',  min: 10, max: 20, step: 1, unit: 'px' },
      { var: '--mf-label-color',         label: 'Label Color',        type: 'color' },
      { var: '--mf-label-font-weight',   label: 'Label Weight',       type: 'select',
        options: [{ label: '400', value: '400' },{ label: '500', value: '500' },{ label: '600', value: '600' },{ label: '700', value: '700' }],
      },
      { var: '--mf-label-margin-bottom', label: 'Label Margin',       type: 'range',  min: 0, max: 20, step: 1, unit: 'px' },
      { var: '--mf-desc-font-size',      label: 'Description Size',   type: 'range',  min: 10, max: 18, step: 1, unit: 'px' },
      { var: '--mf-desc-color',          label: 'Description Color',  type: 'color' },
      { var: '--mf-help-font-size',      label: 'Help Text Size',     type: 'range',  min: 10, max: 16, step: 1, unit: 'px' },
      { var: '--mf-help-color',          label: 'Help Text Color',    type: 'color' },
      { var: '--mf-sublabel-font-size',  label: 'Sublabel Size',      type: 'range',  min: 10, max: 16, step: 1, unit: 'px' },
      { var: '--mf-sublabel-color',      label: 'Sublabel Color',     type: 'color' },
      { var: '--mf-section-title-size',  label: 'Section Title Size', type: 'range',  min: 12, max: 32, step: 1, unit: 'px' },
      { var: '--mf-section-title-color', label: 'Section Title Color',type: 'color' },
      { var: '--mf-required-color',      label: 'Required (*)',       type: 'color' },
    ],
  },
  {
    pane: 'inputs',
    title: 'Input Fields',
    controls: [
      { var: '--mf-input-bg',           label: 'Background',         type: 'color' },
      { var: '--mf-input-color',        label: 'Text Color',         type: 'color' },
      { var: '--mf-input-placeholder',  label: 'Placeholder Color',  type: 'color' },
      { var: '--mf-input-border',       label: 'Border',             type: 'text',  hint: 'e.g. 1px solid #d0d5dd' },
      { var: '--mf-input-radius',       label: 'Corner Radius',      type: 'range', min: 0, max: 24, step: 1, unit: 'px' },
      { var: '--mf-input-padding',      label: 'Padding',            type: 'text',  hint: 'e.g. 10px 14px' },
      { var: '--mf-input-font-size',    label: 'Font Size',          type: 'range', min: 12, max: 20, step: 1, unit: 'px' },
      { var: '--mf-input-focus-border', label: 'Focus Border Color', type: 'color' },
      { var: '--mf-input-focus-shadow', label: 'Focus Shadow',       type: 'shadow' },
      { var: '--mf-input-error-border', label: 'Error Color',        type: 'color' },
      { var: '--mf-input-disabled-bg',  label: 'Disabled Background',type: 'color' },
    ],
  },
  {
    pane: 'inputs',
    title: 'Checkboxes & Radios',
    controls: [
      { var: '--mf-check-color',  label: 'Check/Radio Color', type: 'color' },
      { var: '--mf-check-size',   label: 'Check Size',        type: 'range', min: 14, max: 30, step: 1, unit: 'px' },
      { var: '--mf-check-radius', label: 'Checkbox Radius',   type: 'range', min: 0,  max: 8,  step: 1, unit: 'px' },
    ],
  },
  {
    pane: 'inputs',
    title: 'File Upload Zone',
    controls: [
      { var: '--mf-file-bg',       label: 'Dropzone Background', type: 'color' },
      { var: '--mf-file-border',   label: 'Dropzone Border',     type: 'text', hint: 'e.g. 2px dashed #d0d5dd' },
      { var: '--mf-file-hover-bg', label: 'Dropzone Hover BG',  type: 'color' },
    ],
  },
  {
    pane: 'button',
    title: 'Primary Color',
    controls: [
      { var: '--mf-primary',       label: 'Primary',        type: 'color' },
      { var: '--mf-primary-hover', label: 'Primary Hover',  type: 'color' },
      { var: '--mf-primary-text',  label: 'Primary Text',   type: 'color' },
      { var: '--mf-c1',            label: 'Accent Color',   type: 'color' },
      { var: '--mf-c1-h',          label: 'Accent Hover',   type: 'color' },
      { var: '--mf-c1-lt',         label: 'Accent Light',   type: 'color' },
    ],
  },
  {
    pane: 'button',
    title: 'Submit Button',
    controls: [
      { var: '--mf-btn-bg',          label: 'Button Background', type: 'color' },
      { var: '--mf-btn-bg-hover',    label: 'Button Hover BG',   type: 'color' },
      { var: '--mf-btn-color',       label: 'Button Text Color', type: 'color' },
      { var: '--mf-btn-radius',      label: 'Corner Radius',     type: 'range', min: 0, max: 50, step: 1, unit: 'px' },
      { var: '--mf-btn-padding',     label: 'Padding',           type: 'text',  hint: 'e.g. 12px 32px' },
      { var: '--mf-btn-font-size',   label: 'Font Size',         type: 'range', min: 12, max: 24, step: 1, unit: 'px' },
      { var: '--mf-btn-font-weight', label: 'Font Weight',       type: 'select',
        options: [{ label: '400', value: '400' },{ label: '500', value: '500' },{ label: '600', value: '600' },{ label: '700', value: '700' }],
      },
      { var: '--mf-btn-shadow',      label: 'Button Shadow',     type: 'shadow' },
      { var: '--mf-btn-width',       label: 'Button Width',      type: 'select',
        options: [{ label: 'Auto', value: 'auto' },{ label: 'Full Width', value: '100%' }],
      },
    ],
  },
  {
    pane: 'button',
    title: 'Progress Bar',
    controls: [
      { var: '--mf-progress-fill',   label: 'Progress Fill',      type: 'color' },
      { var: '--mf-progress-bg',     label: 'Progress Background',type: 'color' },
      { var: '--mf-progress-height', label: 'Progress Height',    type: 'range', min: 2, max: 16, step: 1, unit: 'px' },
      { var: '--mf-progress-radius', label: 'Progress Radius',    type: 'range', min: 0, max: 10, step: 1, unit: 'px' },
    ],
  },
];

export const ALL_VARS: string[] = CONTROL_GROUPS.flatMap(g => g.controls.map(c => c.var));
