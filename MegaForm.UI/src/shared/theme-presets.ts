export type MegaFormThemePresetBadge = '' | 'Pro' | 'New';
export type MegaFormThemePresetStyle = 'light' | 'dark';

export interface MegaFormThemePreset {
  id: string;
  name: string;
  colors: [string, string, string, string];
  badge: MegaFormThemePresetBadge;
  category: string;
  categories: string[];
  style: MegaFormThemePresetStyle;
  popular: boolean;
}

/**
 * Canonical user-facing preset catalog.
 *
 * Settings, the Builder Design rail, the embedded Theme Adapter, and the
 * standalone Theme Designer must all render this same list. Keep legacy
 * preset ids in LEGACY_MEGAFORM_THEME_PRESETS for existing saved forms, but
 * do not mix them back into the current picker.
 */
export const MEGAFORM_THEME_PRESETS: MegaFormThemePreset[] = [
  { id: 'default',  name: 'Default',  colors: ['#3b82f6', '#1e293b', '#f8fafc', '#e2e8f0'], badge: '',    category: 'minimal', style: 'light', popular: true,  categories: ['minimal', 'popular', 'modern'] },
  { id: 'ocean',    name: 'Ocean',    colors: ['#0ea5e9', '#0c4a6e', '#f0f9ff', '#bae6fd'], badge: '',    category: 'nature',  style: 'light', popular: true,  categories: ['nature', 'popular', 'modern'] },
  { id: 'forest',   name: 'Forest',   colors: ['#22c55e', '#14532d', '#f0fdf4', '#bbf7d0'], badge: '',    category: 'nature',  style: 'light', popular: false, categories: ['nature'] },
  { id: 'sunset',   name: 'Sunset',   colors: ['#f97316', '#7c2d12', '#fff7ed', '#fed7aa'], badge: '',    category: 'warm',    style: 'light', popular: false, categories: ['warm'] },
  { id: 'lavender', name: 'Lavender', colors: ['#a855f7', '#581c87', '#faf5ff', '#e9d5ff'], badge: '',    category: 'elegant', style: 'light', popular: true,  categories: ['elegant', 'popular'] },
  { id: 'midnight', name: 'Midnight', colors: ['#6366f1', '#1e1b4b', '#eef2ff', '#c7d2fe'], badge: 'Pro', category: 'dark',    style: 'dark',  popular: true,  categories: ['dark', 'popular', 'elegant'] },
  { id: 'rose',     name: 'Rose',     colors: ['#ec4899', '#831843', '#fdf2f8', '#fbcfe8'], badge: 'Pro', category: 'elegant', style: 'light', popular: false, categories: ['elegant', 'warm'] },
  { id: 'amber',    name: 'Amber',    colors: ['#f59e0b', '#78350f', '#fffbeb', '#fde68a'], badge: '',    category: 'warm',    style: 'light', popular: false, categories: ['warm'] },
  { id: 'slate',    name: 'Slate',    colors: ['#64748b', '#0f172a', '#f8fafc', '#cbd5e1'], badge: '',    category: 'minimal', style: 'light', popular: true,  categories: ['minimal', 'popular'] },
  { id: 'emerald',  name: 'Emerald',  colors: ['#10b981', '#064e3b', '#ecfdf5', '#a7f3d0'], badge: 'Pro', category: 'nature',  style: 'light', popular: false, categories: ['nature'] },
  { id: 'coral',    name: 'Coral',    colors: ['#fb7185', '#881337', '#fff1f2', '#fecdd3'], badge: 'New', category: 'warm',    style: 'light', popular: false, categories: ['warm'] },
  { id: 'cyber',    name: 'Cyber',    colors: ['#22d3ee', '#164e63', '#ecfeff', '#a5f3fc'], badge: 'New', category: 'modern',  style: 'dark',  popular: true,  categories: ['modern', 'dark', 'popular'] },
  { id: 'carbon',   name: 'Carbon',   colors: ['#18181b', '#3f3f46', '#27272a', '#52525b'], badge: 'Pro', category: 'dark',    style: 'dark',  popular: true,  categories: ['dark', 'popular', 'minimal'] },
  { id: 'arctic',   name: 'Arctic',   colors: ['#0891b2', '#155e75', '#ecfeff', '#cffafe'], badge: '',    category: 'minimal', style: 'light', popular: false, categories: ['minimal', 'nature'] },
  { id: 'berry',    name: 'Berry',    colors: ['#c026d3', '#701a75', '#fdf4ff', '#f5d0fe'], badge: 'New', category: 'elegant', style: 'light', popular: false, categories: ['elegant'] },
  { id: 'earth',    name: 'Earth',    colors: ['#a16207', '#713f12', '#fefce8', '#fef08a'], badge: '',    category: 'nature',  style: 'light', popular: false, categories: ['nature', 'warm'] },
];

/**
 * Read-only compatibility lookup for forms saved before the 16-preset catalog.
 * These ids remain recognized so opening an old form never silently resets it.
 */
export const LEGACY_MEGAFORM_THEME_PRESETS: MegaFormThemePreset[] = [
  { id: 'modern-blue',    name: 'Modern Blue',    colors: ['#667eea', '#1e293b', '#f5f3ff', '#c4b5fd'], badge: '', category: 'modern',  style: 'light', popular: false, categories: ['modern'] },
  { id: 'warm-sunset',    name: 'Warm Sunset',    colors: ['#ff6b35', '#7c2d12', '#fff8f0', '#ffd4bc'], badge: '', category: 'warm',    style: 'light', popular: false, categories: ['warm'] },
  { id: 'dark-elegance',  name: 'Dark Elegance',  colors: ['#e94560', '#f8fafc', '#1a1a2e', '#334155'], badge: '', category: 'dark',    style: 'dark',  popular: false, categories: ['dark', 'elegant'] },
  { id: 'nature-green',   name: 'Nature Green',   colors: ['#2d8a4e', '#14532d', '#f0f7f0', '#c8e6c9'], badge: '', category: 'nature',  style: 'light', popular: false, categories: ['nature'] },
  { id: 'flat-material',  name: 'Material',        colors: ['#1976d2', '#1e293b', '#fafafa', '#bfdbfe'], badge: '', category: 'modern',  style: 'light', popular: false, categories: ['modern'] },
  { id: 'classic-formal', name: 'Classic Formal', colors: ['#8b4513', '#3f2d20', '#f8f4ef', '#d5c7b5'], badge: '', category: 'elegant', style: 'light', popular: false, categories: ['elegant', 'warm'] },
  { id: 'playful',        name: 'Playful',        colors: ['#ff6b6b', '#7f1d1d', '#ffecd2', '#ffd3d3'], badge: '', category: 'warm',    style: 'light', popular: false, categories: ['warm'] },
  { id: 'healthcare',     name: 'Healthcare',     colors: ['#0077b6', '#0c4a6e', '#f0f8ff', '#b5d4e8'], badge: '', category: 'minimal', style: 'light', popular: false, categories: ['minimal', 'modern'] },
  { id: 'executive',      name: 'Executive',      colors: ['#c9a84c', '#f8fafc', '#1c1c1c', '#4b5563'], badge: '', category: 'dark',    style: 'dark',  popular: false, categories: ['dark', 'elegant'] },
  { id: 'tech-startup',   name: 'Tech Startup',   colors: ['#38ef7d', '#f8fafc', '#0a0a23', '#334155'], badge: '', category: 'modern',  style: 'dark',  popular: false, categories: ['modern', 'dark'] },
  { id: 'minimal',        name: 'Minimal',        colors: ['#1a1a1a', '#1a1a1a', '#ffffff', '#d4d4d8'], badge: '', category: 'minimal', style: 'light', popular: false, categories: ['minimal'] },
];

export const MEGAFORM_THEME_PRESET_COLOR_VAR_KEYS = [
  '--mf-primary', '--mf-primary-hover', '--mf-primary-light', '--mf-primary-text',
  '--mf-btn-bg', '--mf-btn-bg-hover', '--mf-btn-hover-bg',
  '--mf-input-focus-border', '--mf-check-color', '--mf-progress-fill',
  '--mf-btn-color', '--mf-btn-text', '--mf-color-text-inverse',
  '--mf-secondary', '--mf-text', '--mf-title-color', '--mf-label-color',
  '--mf-form-bg', '--mf-input-bg', '--mf-page-bg',
  '--mf-border', '--mf-input-border', '--mf-input-border-color',
  '--mf-preset-primary', '--mf-preset-text', '--mf-preset-surface',
  '--mf-preset-accent', '--mf-preset-border', '--mf-preset-bg',
  '--mf-preset-on-primary',
] as const;

function darkenHex(hex: string, amount: number): string {
  let value = String(hex || '').trim().replace(/^#/, '');
  if (value.length === 3) value = value.split('').map((ch) => ch + ch).join('');
  if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
  const factor = Math.max(0, Math.min(1, 1 - amount));
  const channel = (index: number) => Math.round(parseInt(value.slice(index, index + 2), 16) * factor);
  const out = (n: number) => n.toString(16).padStart(2, '0');
  return '#' + out(channel(0)) + out(channel(2)) + out(channel(4));
}

/**
 * One palette expansion shared by every settings/designer surface.
 * The border swatch is darkened slightly so pale preset borders remain visible
 * against their tinted input background.
 */
export function buildMegaFormThemePresetVars(preset: Pick<MegaFormThemePreset, 'colors'>): Record<string, string> {
  const primary = preset.colors[0] || '#3b82f6';
  const text = preset.colors[1] || '#1e293b';
  const surface = preset.colors[2] || '#ffffff';
  const accent = preset.colors[3] || primary;
  const border = darkenHex(accent, 0.14);
  const white = '#ffffff';
  return {
    '--mf-primary': primary,
    '--mf-primary-hover': primary,
    '--mf-primary-light': primary + '26',
    '--mf-primary-text': white,
    '--mf-btn-bg': primary,
    '--mf-btn-bg-hover': primary,
    '--mf-btn-hover-bg': primary,
    '--mf-input-focus-border': primary,
    '--mf-check-color': primary,
    '--mf-progress-fill': primary,
    '--mf-btn-color': white,
    '--mf-btn-text': white,
    '--mf-color-text-inverse': white,
    '--mf-secondary': text,
    '--mf-text': text,
    '--mf-title-color': text,
    '--mf-label-color': text,
    '--mf-form-bg': surface,
    '--mf-input-bg': surface,
    '--mf-page-bg': surface,
    '--mf-border': border,
    '--mf-input-border': '1px solid ' + border,
    '--mf-input-border-color': border,
    '--mf-preset-primary': primary,
    '--mf-preset-text': text,
    '--mf-preset-surface': surface,
    '--mf-preset-accent': accent,
    '--mf-preset-border': accent,
    '--mf-preset-bg': surface,
    '--mf-preset-on-primary': white,
  };
}

export function getMegaFormThemePreset(id: string, includeLegacy = true): MegaFormThemePreset | undefined {
  const key = String(id || '').trim();
  const current = MEGAFORM_THEME_PRESETS.find((preset) => preset.id === key);
  if (current || !includeLegacy) return current;
  return LEGACY_MEGAFORM_THEME_PRESETS.find((preset) => preset.id === key);
}
