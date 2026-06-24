/**
 * MegaForm Map Widget — TypeScript Source
 *
 * Compile: tsc --project MegaForm.UI/src/widgets/plugins/tsconfig.json
 * Output:  Assets/js/plugins/megaform-widget-map.js
 *
 * Purpose:
 *  - DISPLAY-ONLY map widget (no GPS capture — see Geolocation widget for that)
 *  - Renders an <iframe> wrapping OpenStreetMap's static embed
 *      https://www.openstreetmap.org/export/embed.html?bbox=...&marker=lat,lng
 *    so we never need an API key.
 *  - Pair with the popup designer (src/builder/map-designer.ts) which adds a
 *    Nominatim address picker, zoom slider, and live preview.
 *
 * Design notes:
 *  - bbox is computed client-side from lat/lng + zoom. We pick a tile width
 *    in degrees that decreases by a factor of 2 per zoom level (standard slippy
 *    map math) and scale the height to approximate the rendered aspect ratio
 *    so the marker stays visually centred regardless of widget height.
 *  - Marker color is informational only — OSM's embed renders a fixed red pin.
 *    We surface the color in a tiny chip below the map so the author can theme
 *    surrounding chrome to match.
 *  - bind() is a noop: the iframe is fully static once the src is set, so we
 *    don't need any post-render JS hooks.
 */
(function (global: any) {
  'use strict';

  var BADGE = 'Map v20260602-B46';

  var MegaFormWidgets = global.MegaFormWidgets = global.MegaFormWidgets || {
    _registry: {} as Record<string, any>,
    register: function (name: string, widget: any) { this._registry[name] = widget; }
  };

  interface MapProps {
    lat: number;
    lng: number;
    zoom: number;
    label: string;
    height: string;
    width: string;
    markerColor: string;
  }

  var defaults: MapProps = {
    lat: 21.0285,           // Hà Nội — sensible default
    lng: 105.8542,
    zoom: 13,
    label: '',
    height: '300px',
    width: '100%',
    markerColor: '#d97706'
  };

  function esc(v: any): string {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function clamp(n: number, lo: number, hi: number): number {
    if (!isFinite(n)) return lo;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function toNum(v: any, fallback: number): number {
    var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v));
    return isFinite(n) ? n : fallback;
  }

  function normalizeHeight(v: any, fallback: string): string {
    var s = String(v == null ? '' : v).trim();
    if (!s) return fallback;
    if (/^\d+$/.test(s)) return s + 'px';
    if (/^\d+(\.\d+)?(px|rem|em|vh|%)$/i.test(s)) return s;
    return fallback;
  }

  function normalizeWidth(v: any, fallback: string): string {
    var s = String(v == null ? '' : v).trim();
    if (!s) return fallback;
    if (/^\d+$/.test(s)) return s + 'px';
    if (/^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/i.test(s)) return s;
    return fallback;
  }

  function getProps(widgetProps: any): MapProps {
    var wp = widgetProps || {};
    return {
      lat: clamp(toNum(wp.lat, defaults.lat), -85, 85),
      lng: clamp(toNum(wp.lng, defaults.lng), -180, 180),
      zoom: Math.round(clamp(toNum(wp.zoom, defaults.zoom), 1, 18)),
      label: String(wp.label == null ? '' : wp.label),
      height: normalizeHeight(wp.height, defaults.height),
      width: normalizeWidth(wp.width, defaults.width),
      markerColor: /^#[0-9a-fA-F]{3,8}$/.test(String(wp.markerColor || '')) ? String(wp.markerColor) : defaults.markerColor
    };
  }

  /**
   * Compute a bbox (minLon, minLat, maxLon, maxLat) centred on lat/lng that
   * approximates the visible area at the given zoom level. Width-in-degrees
   * halves per zoom step (slippy-tile convention). Height is scaled by cos(lat)
   * to keep the visual aspect ratio reasonable near the poles.
   */
  function computeBbox(lat: number, lng: number, zoom: number): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
    // At zoom 0 the world is 360deg wide. At zoom Z, one tile spans 360/2^Z deg.
    // We pick ~2 tiles of width so the marker has comfortable surrounding context.
    var widthDeg = 360 / Math.pow(2, zoom);
    var heightDeg = widthDeg * 0.6;  // ~3:5 aspect-ish; iframe height defaults to ~300px
    // Don't let bbox cross the antimeridian for simplicity — OSM clamps anyway.
    var minLon = clamp(lng - widthDeg / 2, -180, 180);
    var maxLon = clamp(lng + widthDeg / 2, -180, 180);
    var minLat = clamp(lat - heightDeg / 2, -85, 85);
    var maxLat = clamp(lat + heightDeg / 2, -85, 85);
    return { minLon: minLon, minLat: minLat, maxLon: maxLon, maxLat: maxLat };
  }

  function buildOsmSrc(props: MapProps): string {
    var box = computeBbox(props.lat, props.lng, props.zoom);
    var bbox = [box.minLon, box.minLat, box.maxLon, box.maxLat]
      .map(function (n) { return n.toFixed(6); })
      .join(',');
    var marker = props.lat.toFixed(6) + ',' + props.lng.toFixed(6);
    return 'https://www.openstreetmap.org/export/embed.html'
      + '?bbox=' + encodeURIComponent(bbox)
      + '&layer=mapnik'
      + '&marker=' + encodeURIComponent(marker);
  }

  function buildLargerLink(props: MapProps): string {
    return 'https://www.openstreetmap.org/?mlat='
      + props.lat.toFixed(6)
      + '&mlon=' + props.lng.toFixed(6)
      + '#map=' + props.zoom + '/' + props.lat.toFixed(5) + '/' + props.lng.toFixed(5);
  }

  function render(field: any, formId: number): string {
    var props = getProps(field && field.widgetProps);
    var uid = 'mf-map-' + esc(field && field.key || 'map') + '-' + esc(formId);
    var src = buildOsmSrc(props);
    var bigger = buildLargerLink(props);

    var labelHtml = props.label
      ? '<div class="mf-map-label" style="font-size:12px;font-weight:600;color:#0f172a;margin:0 0 6px;">' + esc(props.label) + '</div>'
      : '';

    // Pin readout — small badge ABOVE the map (no longer competes with the
    // "View larger map" link in a horizontal flex row).
    var pinBadgeHtml = ''
      + '<div class="mfw-map-pin-badge" style="display:inline-flex;align-items:center;gap:6px;margin:0 0 4px;padding:2px 8px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;font-size:11px;color:#475569;line-height:1.4;">'
      +   '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + esc(props.markerColor) + ';box-shadow:0 0 0 2px rgba(255,255,255,.9),0 1px 2px rgba(15,23,42,.3);"></span>'
      +   '<span>Pin: ' + props.lat.toFixed(5) + ', ' + props.lng.toFixed(5) + '</span>'
      + '</div>';

    // Footer strip BELOW the iframe wrap — just the "View larger map" link.
    var footerHtml = ''
      + '<div class="mfw-map-footer" style="margin-top:4px;font-size:11px;color:#64748b;line-height:1.4;text-align:right;">'
      +   '<a href="' + esc(bigger) + '" target="_blank" rel="noopener" style="color:#1d4ed8;text-decoration:none;">View larger map &rarr;</a>'
      + '</div>';

    return ''
      + '<div class="mf-map-widget" id="' + uid + '" data-badge="' + esc(BADGE) + '" data-formid="' + esc(formId) + '"'
      +     ' style="position:relative;overflow:hidden;max-width:100%;width:' + esc(props.width) + ';">'
      +   labelHtml
      +   pinBadgeHtml
      +   '<div class="mfw-map-iframe-wrap" style="position:relative;overflow:hidden;border-radius:6px;border:1px solid #e2e8f0;width:' + esc(props.width) + ';max-width:100%;height:' + esc(props.height) + ';background:#eef2f7;">'
      +     '<iframe class="mf-map-frame"'
      +       ' src="' + esc(src) + '"'
      +       ' style="width:100%;height:100%;border:0;display:block;"'
      +       ' loading="lazy" referrerpolicy="no-referrer-when-downgrade"'
      +       ' title="Map for ' + esc(props.label || (props.lat + ',' + props.lng)) + '"'
      +     '></iframe>'
      +   '</div>'
      +   footerHtml
      + '</div>';
  }

  // bind is a noop — the iframe is fully static once src is assigned.
  function bind(_formId: number): void { /* no-op */ }

  function collect(): undefined { return undefined; }
  function validate(): boolean { return true; }

  function renderProperties(container: HTMLElement, field: any, onChange: (field: any) => void): void {
    var props = getProps(field && field.widgetProps);
    field.widgetProps = props;

    container.innerHTML = ''
      + '<div class="mfw-map-settings">'
      +   '<div class="mf-widget-settings-badge-wrap"><span class="mf-widget-settings-badge">' + esc(BADGE) + '</span></div>'
      +   '<label class="mfw-prop-row"><span class="mfw-prop-label">Latitude</span><input type="number" step="0.000001" min="-85" max="85" data-prop="lat" value="' + esc(props.lat) + '"></label>'
      +   '<label class="mfw-prop-row"><span class="mfw-prop-label">Longitude</span><input type="number" step="0.000001" min="-180" max="180" data-prop="lng" value="' + esc(props.lng) + '"></label>'
      +   '<label class="mfw-prop-row"><span class="mfw-prop-label">Zoom (1-18)</span><input type="number" min="1" max="18" step="1" data-prop="zoom" value="' + esc(props.zoom) + '"></label>'
      +   '<label class="mfw-prop-row"><span class="mfw-prop-label">Label / caption</span><input type="text" data-prop="label" value="' + esc(props.label) + '" placeholder="Optional"></label>'
      +   '<label class="mfw-prop-row"><span class="mfw-prop-label">Height</span><input type="text" data-prop="height" value="' + esc(props.height) + '" placeholder="300px"></label>'
      +   '<label class="mfw-prop-row"><span class="mfw-prop-label">Width</span><input type="text" data-prop="width" value="' + esc(props.width) + '" placeholder="100%"></label>'
      +   '<label class="mfw-prop-row"><span class="mfw-prop-label">Marker color</span><input type="color" data-prop="markerColor" value="' + esc(props.markerColor) + '"></label>'
      +   '<div class="mfw-prop-hint" style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.4;">'
      +     'Tip: click <strong>&#x1F5FA;&#xFE0F; Edit Location</strong> on the field card to pick an address visually (Nominatim geocoder).'
      +   '</div>'
      + '</div>';

    var controls = container.querySelectorAll('[data-prop]');
    function pushChange(): void {
      var next: any = Object.assign({}, props);
      for (var i = 0; i < controls.length; i++) {
        var el = controls[i] as HTMLInputElement;
        var name = el.getAttribute('data-prop') || '';
        if (!name) continue;
        if (name === 'lat' || name === 'lng') next[name] = parseFloat(el.value || '0') || 0;
        else if (name === 'zoom') next[name] = parseInt(el.value || '13', 10) || 13;
        else next[name] = el.value;
      }
      field.widgetProps = getProps(next);
      if (typeof onChange === 'function') onChange(field);
    }
    for (var j = 0; j < controls.length; j++) {
      controls[j].addEventListener('input', pushChange);
      controls[j].addEventListener('change', pushChange);
    }
  }

  MegaFormWidgets.register('Map', {
    meta: {
      icon: 'fa-map-location-dot',
      // [B58 CleanLabel] Strip "- v20260602-B*" build badge from the user-
      // facing palette tile. Internal BADGE retained on __MFMapWidget.badge
      // for diagnostics; the palette only sees the clean display string.
      label: 'Map (OSM)',
      category: 'widgets',
      color: '#10b981',
      defaultWidth: '100%'
    },
    defaults: defaults,
    render: render,
    bind: bind,
    collect: collect,
    validate: validate,
    renderProperties: renderProperties,
    renderPropertiesPanel: renderProperties,
    renderBuilderPanel: renderProperties
  });

  // Expose helpers so the popup designer can reuse the same bbox/iframe math.
  global.__MFMapWidget = {
    badge: BADGE,
    getProps: getProps,
    buildOsmSrc: buildOsmSrc,
    buildLargerLink: buildLargerLink,
    computeBbox: computeBbox
  };

})(typeof window !== 'undefined' ? window : globalThis);
