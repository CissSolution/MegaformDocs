// ============================================================
// [AssetUrlPlatform fix 2026-07-24] Rewrite module image URLs to the CURRENT platform.
//
// A premium template hard-codes its artwork by absolute URL, and the two platforms mount the
// module's images at different paths:
//
//   DNN     /DesktopModules/MegaForm/Assets/img/<rel>
//   Oqtane  /Modules/MegaForm/img/<rel>          (also Web / Umbraco)
//
// A template authored on one platform therefore renders with a DEAD hero on the other — the
// <img> 404s and you get an empty panel where the photo should be, which also makes the
// design's text/overlay colours read wrong against the fallback background. This became
// obvious once the online gallery started serving one shared set of templates to both.
//
// The publisher already normalises either spelling when it bundles artwork
// (tools/gallery/build-gallery.mjs IMG_URL_RE), so the files are always installed under the
// right root — only the URL baked into the template's HTML/CSS needs translating at render
// time. That is what this does: one regex, both directions, driven by where the module's own
// script was actually loaded from.
// ============================================================

const DNN_BASE = '/DesktopModules/MegaForm/Assets/img/';
const DEFAULT_BASE = '/Modules/MegaForm/img/';

// Matches either platform's image root, so the rewrite is direction-agnostic.
const ANY_IMG_BASE = /\/(?:DesktopModules\/MegaForm\/Assets\/img|Modules\/MegaForm\/img)\//gi;

let _cached: string | null = null;

/**
 * The image root this install actually serves from, detected from the module's own loaded
 * script tag (the one thing guaranteed to be correct for the current platform).
 */
export function moduleImageBase(): string {
  if (_cached) return _cached;
  try {
    const srcs = Array.from(document.querySelectorAll('script[src]')).map((s) => (s as HTMLScriptElement).src || '');
    if (srcs.some((u) => /\/DesktopModules\/MegaForm\/Assets\/js\//i.test(u))) { _cached = DNN_BASE; return _cached; }
    if (srcs.some((u) => /\/Modules\/MegaForm\/js\//i.test(u))) { _cached = DEFAULT_BASE; return _cached; }
    // Fall back to the platform flag when the bundle was inlined rather than linked.
    const platform = String((window as any).__MF_PLATFORM__?.platform || '').toLowerCase();
    _cached = platform === 'dnn' ? DNN_BASE : DEFAULT_BASE;
    return _cached;
  } catch {
    return DEFAULT_BASE;
  }
}

/** Rewrite every module image URL in `text` to this platform's root. Safe on null/empty. */
export function rewriteModuleAssetUrls(text: string | null | undefined): string {
  const s = String(text || '');
  if (!s) return s;
  // Cheap bail-out: most standard forms carry no module artwork at all.
  if (s.indexOf('/MegaForm/') < 0) return s;
  const base = moduleImageBase();
  ANY_IMG_BASE.lastIndex = 0;
  return s.replace(ANY_IMG_BASE, base);
}

/** In-place rewrite of a schema's customHtml/customCss. Returns the same object. */
export function rewriteSettingsAssetUrls(settings: any): any {
  if (!settings || typeof settings !== 'object') return settings;
  if (typeof settings.customHtml === 'string') settings.customHtml = rewriteModuleAssetUrls(settings.customHtml);
  if (typeof settings.customCss === 'string') settings.customCss = rewriteModuleAssetUrls(settings.customCss);
  return settings;
}
