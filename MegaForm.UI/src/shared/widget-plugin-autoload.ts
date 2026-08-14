// ============================================================
// Widget plugin autoloader (client-side) — v20260628-01
// File: src/shared/widget-plugin-autoload.ts
//
// PROBLEM it solves: a form's widget plugin <script>s are added to the page by
// the SERVER asset manifest (MegaFormController.BuildAssetManifest), computed
// from the form being served. In some contexts the page does NOT carry the
// plugin script for a widget the rendered form actually uses:
//   - the ?formid= admin OVERRIDE renders an ARBITRARY form, but the page's
//     manifest was built for the module's CONFIGURED form;
//   - inline admin render / fast-embed-off / some embeds.
// When MegaFormWidgets has no handler for the field type, the renderer falls
// back to a plain <input type="text"> (renderer/inputs.ts default case) — i.e.
// a ContentSlider / Signature / Rating etc. shows as an empty text box.
//
// FIX: detect those unregistered widget types from the schema, inject their
// plugin <script>s on demand (they self-register via MegaFormWidgets.register),
// and let the renderer re-run once they are ready. Maps mirror the C# switch.
// ============================================================

// Field type (lowercased) -> plugin filename under <base>/js/plugins/.
// Retired plugins (repeater, phone-pro, subform, infinite-list) are intentionally
// omitted so we never wait on a 404. Keep in sync with builder/canvas.ts
// WIDGET_PLUGIN_FILES + MegaFormController.BuildAssetManifest.
export const WIDGET_TYPE_TO_PLUGIN: Record<string, string> = {
  signature: 'megaform-widget-signature.js',
  calculator: 'megaform-widget-calculator.js',
  rating: 'megaform-widget-rating-suite.js',
  likert: 'megaform-widget-rating-suite.js',
  nps: 'megaform-widget-rating-suite.js',
  opinionscale: 'megaform-widget-rating-suite.js',
  ranking: 'megaform-widget-rating-suite.js',
  imagechoice: 'megaform-widget-image-choice.js',
  advancedfile: 'megaform-widget-advanced-file.js',
  richtext: 'megaform-widget-rich-text.js',
  paypal: 'megaform-widget-paypal.js',
  stripe: 'megaform-widget-stripe.js',
  payment: 'megaform-widget-payment-unified.js',
  paymentsummary: 'megaform-widget-payment-unified.js',
  square: 'megaform-widget-payment-unified.js',
  appointment: 'megaform-widget-appointment.js',
  geolocation: 'megaform-widget-geolocation.js',
  productlineitems: 'megaform-widget-product-line-items.js',
  drawonimage: 'megaform-widget-draw-on-image.js',
  videoembed: 'megaform-widget-video-embed.js',
  gridrepeater: 'megaform-widget-grid-repeater.js',
  pdfform: 'megaform-widget-pdf-form.js',
  captcha: 'megaform-widget-captcha.js',
  qrcode: 'megaform-widget-qrcode.js',
  qr: 'megaform-widget-qrcode.js',
  datarepeater: 'megaform-widget-data-repeater.js',
  golfscorecard: 'megaform-widget-golf-scorecard.js',
  contentslider: 'megaform-widget-content-slider.js',
  map: 'megaform-widget-map.js',
  dynamiclabel: 'megaform-widget-dynamic-label.js',
  // [B310 CatalogReconcile] previously missing → AI-catalog types that fell back to a text box.
  datagrid: 'megaform-widget-datagrid.js',
  razor: 'megaform-widget-razor.js',
  // Legacy payment field types (older wizard tiles). The unified payment plugin self-registers
  // 'StripePayment'/'PayPalPayment' aliases so these dispatch + force their provider.
  stripepayment: 'megaform-widget-payment-unified.js',
  paypalpayment: 'megaform-widget-payment-unified.js',
};

/** Resolve the `<base>/js/plugins/` directory + the `?v=` cache stamp by
 *  reusing an existing MegaForm script on the page (works for Oqtane
 *  `/Modules/MegaForm/js/…` and DNN `/DesktopModules/MegaForm/Assets/js/…`). */
function pluginsDirAndBust(): { dir: string; bust: string } {
  const scripts = Array.prototype.slice.call(document.scripts) as HTMLScriptElement[];
  let dir = '';
  let bust = '';
  for (const s of scripts) {
    const src = s.src || '';
    if (!/megaform/i.test(src)) continue;
    if (!dir) { const m = src.match(/^(.*\/js\/)/i); if (m) dir = m[1] + 'plugins/'; }
    if (!bust) { const m = src.match(/[?&]v=([^&]+)/); if (m) bust = m[1]; }
    if (dir && bust) break;
  }
  if (!dir) {
    const platform = (window as any).__MF_PLATFORM__ || {};
    let base = String(platform.assetsBaseUrl || platform.assetsBase || '/DesktopModules/MegaForm/Assets/');
    if (!/\/$/.test(base)) base += '/';
    dir = base + 'js/plugins/';
  }
  return { dir, bust: bust || '1' };
}

export function isWidgetTypeRegistered(type: string): boolean {
  const W = (window as any).MegaFormWidgets;
  return !!(W && W.widgetTypes && type && W.widgetTypes[type]);
}

/** Walk the schema (incl. Row/Section columns) and return the widget field types
 *  that HAVE a plugin file but are NOT registered on the page yet. */
export function collectUnloadedWidgetTypes(fields: any[]): string[] {
  const out: string[] = [];
  const seen: Record<string, boolean> = {};
  (function walk(arr: any[]): void {
    (arr || []).forEach((f: any) => {
      if (!f) return;
      const t = String(f.type || f.Type || '');
      if (t && WIDGET_TYPE_TO_PLUGIN[t.toLowerCase()] && !isWidgetTypeRegistered(t) && !seen[t]) {
        seen[t] = true; out.push(t);
      }
      const cols = f.columns || f.Columns;
      if (Array.isArray(cols)) cols.forEach((c: any) => walk((c && (c.fields || c.Fields)) || []));
    });
  })(fields);
  return out;
}

/** Inject the plugin <script> for each given type (idempotent; ordered load). */
export function injectWidgetPlugins(types: string[]): void {
  if (!types || !types.length) return;
  const { dir, bust } = pluginsDirAndBust();
  const existing: Record<string, boolean> = {};
  Array.prototype.slice.call(document.scripts).forEach((s: HTMLScriptElement) => {
    const src = (s.src || '').split('?')[0];
    const i = src.lastIndexOf('/');
    if (i >= 0) existing[src.substring(i + 1).toLowerCase()] = true;
  });
  const files: Record<string, boolean> = {};
  types.forEach((t) => { const f = WIDGET_TYPE_TO_PLUGIN[t.toLowerCase()]; if (f) files[f] = true; });
  Object.keys(files).forEach((file) => {
    if (existing[file.toLowerCase()]) return;
    const tag = document.createElement('script');
    tag.src = dir + file + '?v=' + bust;
    tag.async = false; // preserve registration order
    tag.setAttribute('data-mf-autoload', '1');
    document.head.appendChild(tag);
  });
}

export const WIDGET_PLUGIN_AUTOLOAD_BADGE = 'WidgetPluginAutoload v20260628-01';
