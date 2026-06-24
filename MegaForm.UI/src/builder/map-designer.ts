// ============================================================
// MegaForm Builder - Map Designer popup (v20260602-B42)
// File: src/builder/map-designer.ts
//
// Modal popup that lets the author pick a location for a Map
// field WITHOUT typing raw lat/lng. Features:
//   - Address text input + Find button -> Nominatim geocoder
//     (https://nominatim.openstreetmap.org, NO API key required).
//   - Manual lat/lng inputs.
//   - Zoom slider (1-18) with numeric badge.
//   - Live preview iframe (OpenStreetMap embed) that re-renders
//     on every change, debounced ~250ms so we don't hammer OSM.
//   - Apply button writes { lat, lng, zoom, label, markerColor }
//     onto field.widgetProps and triggers a canvas re-render.
//
// Follows the same shell as src/builder/slider-designer.ts so the
// CSS classes (mf-token-designer-backdrop / shell / head / body /
// foot) already exist in megaform-builder-ts.css. We mount inside
// #mf-builder-root with data-mf-overlay="1" to survive the Oqtane
// fullscreen takeover (same trick as Slider/Token designers).
// ============================================================
// @ts-nocheck
'use strict';

(function () {
  if ((window as any).__MFMapDesignerLoaded) return;
  (window as any).__MFMapDesignerLoaded = true;

  var B: any = (window as any).MegaFormBuilder;
  if (!B) return;

  function clamp(n: number, lo: number, hi: number): number {
    if (!isFinite(n)) return lo;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function buildBbox(lat: number, lng: number, zoom: number): string {
    var helpers: any = (window as any).__MFMapWidget;
    if (helpers && typeof helpers.computeBbox === 'function') {
      var box = helpers.computeBbox(lat, lng, zoom);
      return [box.minLon, box.minLat, box.maxLon, box.maxLat]
        .map(function (n: number) { return n.toFixed(6); }).join(',');
    }
    // Fallback math if the widget plugin script has not loaded yet.
    var widthDeg = 360 / Math.pow(2, zoom);
    var heightDeg = widthDeg * 0.6;
    return [
      (lng - widthDeg / 2).toFixed(6),
      (lat - heightDeg / 2).toFixed(6),
      (lng + widthDeg / 2).toFixed(6),
      (lat + heightDeg / 2).toFixed(6)
    ].join(',');
  }

  function buildSrc(lat: number, lng: number, zoom: number): string {
    var helpers: any = (window as any).__MFMapWidget;
    if (helpers && typeof helpers.buildOsmSrc === 'function') {
      return helpers.buildOsmSrc({ lat: lat, lng: lng, zoom: zoom });
    }
    return 'https://www.openstreetmap.org/export/embed.html'
      + '?bbox=' + encodeURIComponent(buildBbox(lat, lng, zoom))
      + '&layer=mapnik'
      + '&marker=' + encodeURIComponent(lat.toFixed(6) + ',' + lng.toFixed(6));
  }

  function geocodeAddress(query: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
    var trimmed = String(query || '').trim();
    if (!trimmed) return Promise.resolve(null);
    var url = 'https://nominatim.openstreetmap.org/search'
      + '?format=json&limit=1&addressdetails=0'
      + '&q=' + encodeURIComponent(trimmed);
    // Nominatim's usage policy asks for a descriptive User-Agent or Referer.
    // Browsers always send Referer so we're polite by default; we also keep
    // requests sparse (debounced + manual "Find" button only).
    return fetch(url, { headers: { 'Accept': 'application/json' } as any })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows: any[]) {
        if (!Array.isArray(rows) || !rows.length) return null;
        var top = rows[0];
        var lat = parseFloat(top.lat);
        var lng = parseFloat(top.lon);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return { lat: lat, lng: lng, displayName: String(top.display_name || trimmed) };
      });
  }

  function open(field: any, onClose?: () => void) {
    if (!field || field.type !== 'Map') {
      if (B.showToast) B.showToast('Map Designer only works for Map fields', 'error');
      return;
    }
    var wp = field.widgetProps = field.widgetProps || {};
    // Seed sensible defaults so the designer is never blank on first open.
    if (!isFinite(parseFloat(wp.lat as any))) wp.lat = 21.0285;
    if (!isFinite(parseFloat(wp.lng as any))) wp.lng = 105.8542;
    if (!isFinite(parseInt(wp.zoom as any, 10))) wp.zoom = 13;
    if (typeof wp.label !== 'string') wp.label = '';
    if (typeof wp.height !== 'string' || !wp.height) wp.height = '300px';
    if (typeof wp.markerColor !== 'string' || !wp.markerColor) wp.markerColor = '#d97706';

    // Draft buffer — Apply commits, Cancel discards.
    var draft = {
      lat: clamp(parseFloat(wp.lat as any), -85, 85),
      lng: clamp(parseFloat(wp.lng as any), -180, 180),
      zoom: clamp(parseInt(wp.zoom as any, 10), 1, 18),
      label: String(wp.label || ''),
      height: String(wp.height || '300px'),
      markerColor: String(wp.markerColor || '#d97706')
    };

    var existing = document.getElementById('mf-map-designer-modal');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var modal = document.createElement('div');
    modal.id = 'mf-map-designer-modal';
    modal.className = 'mf-token-designer-backdrop';
    modal.setAttribute('data-mf-overlay', '1');
    modal.innerHTML =
      '<div class="mf-token-designer-shell mf-map-designer-shell" role="dialog" aria-label="Map Designer" style="max-width:960px;width:96vw;">' +
        '<div class="mf-token-designer-head">' +
          '<div class="mf-token-designer-title">' +
            '<i class="fas fa-map-location-dot"></i>' +
            '<span>Map Designer</span>' +
            '<span class="mf-token-designer-badge">v20260602-B42</span>' +
          '</div>' +
          '<button type="button" class="mf-token-designer-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="mf-token-designer-body" style="padding:14px 16px;">' +
          '<div class="mf-map-designer-grid" style="display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:16px;align-items:start;">' +

            // ── Left column: controls ─────────────────────────
            '<div class="mf-map-designer-controls" style="display:flex;flex-direction:column;gap:12px;">' +
              '<div class="mf-token-row">' +
                '<label class="mf-token-row-label" style="font-weight:600;">Search address (Nominatim)</label>' +
                '<div style="display:flex;gap:6px;">' +
                  '<input type="text" class="mf-token-row-input mf-map-d-addr" placeholder="123 Main St, City, Country" style="flex:1;"/>' +
                  '<button type="button" class="mf-builder-btn mf-map-d-find" title="Geocode via OpenStreetMap Nominatim (no API key)"><i class="fas fa-search-location"></i> Find</button>' +
                '</div>' +
                '<div class="mf-map-d-addr-status" style="margin-top:6px;font-size:11px;color:#64748b;min-height:14px;"></div>' +
              '</div>' +

              '<div class="mf-token-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
                '<div>' +
                  '<label class="mf-token-row-label" style="font-weight:600;">Latitude</label>' +
                  '<input type="number" step="0.000001" min="-85" max="85" class="mf-token-row-input mf-map-d-lat" value="' + draft.lat + '"/>' +
                '</div>' +
                '<div>' +
                  '<label class="mf-token-row-label" style="font-weight:600;">Longitude</label>' +
                  '<input type="number" step="0.000001" min="-180" max="180" class="mf-token-row-input mf-map-d-lng" value="' + draft.lng + '"/>' +
                '</div>' +
              '</div>' +

              '<div class="mf-token-row">' +
                '<label class="mf-token-row-label" style="font-weight:600;display:flex;justify-content:space-between;align-items:center;">' +
                  '<span>Zoom</span>' +
                  '<span class="mf-map-d-zoom-badge" style="background:#0f172a;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">' + draft.zoom + '</span>' +
                '</label>' +
                '<input type="range" min="1" max="18" step="1" class="mf-map-d-zoom" value="' + draft.zoom + '" style="width:100%;"/>' +
                '<div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:2px;"><span>1 World</span><span>10 City</span><span>18 Street</span></div>' +
              '</div>' +

              '<div class="mf-token-row">' +
                '<label class="mf-token-row-label" style="font-weight:600;">Label / caption</label>' +
                '<input type="text" class="mf-token-row-input mf-map-d-label" value="' + (B.escAttr ? B.escAttr(draft.label) : draft.label) + '" placeholder="Optional title shown above the map"/>' +
              '</div>' +

              '<div class="mf-token-row" style="display:grid;grid-template-columns:1fr 110px;gap:8px;">' +
                '<div>' +
                  '<label class="mf-token-row-label" style="font-weight:600;">Height</label>' +
                  '<input type="text" class="mf-token-row-input mf-map-d-height" value="' + (B.escAttr ? B.escAttr(draft.height) : draft.height) + '" placeholder="300px"/>' +
                '</div>' +
                '<div>' +
                  '<label class="mf-token-row-label" style="font-weight:600;">Pin color</label>' +
                  '<input type="color" class="mf-token-row-input mf-map-d-color" value="' + draft.markerColor + '" style="height:38px;padding:2px;"/>' +
                '</div>' +
              '</div>' +

              '<div style="font-size:11px;color:#64748b;line-height:1.5;background:#f1f5f9;border-radius:8px;padding:8px 10px;">' +
                '<strong>About this designer:</strong><br>' +
                'Uses OpenStreetMap + Nominatim geocoder. No API key, no quota signup. ' +
                'Be considerate: avoid burst-geocoding (one search per click). ' +
                'For high-traffic production sites, consider self-hosting Nominatim.' +
              '</div>' +
            '</div>' +

            // ── Right column: live preview ────────────────────
            '<div class="mf-map-designer-preview" style="display:flex;flex-direction:column;gap:8px;min-height:380px;">' +
              '<div style="font-size:12px;font-weight:600;color:#0f172a;display:flex;align-items:center;gap:6px;">' +
                '<i class="fas fa-eye" style="color:#10b981;"></i> Live preview' +
                '<span class="mf-map-d-preview-coords" style="margin-left:auto;font-family:Consolas,Menlo,monospace;font-size:11px;color:#64748b;font-weight:500;"></span>' +
              '</div>' +
              '<div class="mf-map-d-frame-wrap" style="position:relative;width:100%;flex:1;min-height:380px;border:1px solid #dbe4f0;border-radius:10px;overflow:hidden;background:#eef2f7;">' +
                '<iframe class="mf-map-d-frame" style="width:100%;height:100%;border:0;display:block;" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map preview"></iframe>' +
                '<div class="mf-map-d-pin-chip" style="position:absolute;left:10px;bottom:10px;background:rgba(255,255,255,.95);border:1px solid rgba(15,23,42,.12);border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600;color:#0f172a;display:inline-flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(15,23,42,.15);">' +
                  '<span class="mf-map-d-pin-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + draft.markerColor + ';box-shadow:0 0 0 2px rgba(255,255,255,.9),0 1px 3px rgba(15,23,42,.4);"></span>' +
                  '<span class="mf-map-d-pin-text">Pin</span>' +
                '</div>' +
              '</div>' +
            '</div>' +

          '</div>' +
        '</div>' +
        '<div class="mf-token-designer-foot">' +
          '<div class="mf-token-designer-foot-hint"><i class="fas fa-info-circle"></i> Apply writes back to the field. Press <kbd>Esc</kbd> to close.</div>' +
          '<button type="button" class="mf-builder-btn mf-map-d-cancel" style="margin-right:8px;">Cancel</button>' +
          '<button type="button" class="mf-builder-btn mf-token-designer-done mf-map-d-apply" style="background:#10b981;color:#fff;border-color:#059669;"><i class="fas fa-check"></i> Apply</button>' +
        '</div>' +
      '</div>';

    var mountTarget: HTMLElement = (document.getElementById('mf-builder-root') || document.body) as HTMLElement;
    mountTarget.appendChild(modal);

    var addrInp = modal.querySelector('.mf-map-d-addr') as HTMLInputElement;
    var addrBtn = modal.querySelector('.mf-map-d-find') as HTMLButtonElement;
    var addrStatus = modal.querySelector('.mf-map-d-addr-status') as HTMLElement;
    var latInp  = modal.querySelector('.mf-map-d-lat') as HTMLInputElement;
    var lngInp  = modal.querySelector('.mf-map-d-lng') as HTMLInputElement;
    var zoomInp = modal.querySelector('.mf-map-d-zoom') as HTMLInputElement;
    var zoomBadge = modal.querySelector('.mf-map-d-zoom-badge') as HTMLElement;
    var labelInp = modal.querySelector('.mf-map-d-label') as HTMLInputElement;
    var heightInp = modal.querySelector('.mf-map-d-height') as HTMLInputElement;
    var colorInp = modal.querySelector('.mf-map-d-color') as HTMLInputElement;
    var frame   = modal.querySelector('.mf-map-d-frame') as HTMLIFrameElement;
    var coords  = modal.querySelector('.mf-map-d-preview-coords') as HTMLElement;
    var pinDot  = modal.querySelector('.mf-map-d-pin-dot') as HTMLElement;

    // Debounced preview updater so dragging the slider doesn't spam OSM.
    var previewTimer: any = null;
    function schedulePreview() {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(updatePreview, 250);
    }
    function updatePreview() {
      var lat = clamp(parseFloat(latInp.value) || 0, -85, 85);
      var lng = clamp(parseFloat(lngInp.value) || 0, -180, 180);
      var zoom = clamp(parseInt(zoomInp.value, 10) || 13, 1, 18);
      draft.lat = lat; draft.lng = lng; draft.zoom = zoom;
      draft.label = labelInp.value;
      draft.height = heightInp.value || '300px';
      draft.markerColor = colorInp.value || '#d97706';
      zoomBadge.textContent = String(zoom);
      coords.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5) + ' @ z' + zoom;
      pinDot.style.background = draft.markerColor;
      // Setting iframe.src reloads OSM; setting via attribute keeps history clean.
      frame.setAttribute('src', buildSrc(lat, lng, zoom));
    }

    // Wire up input listeners
    latInp.addEventListener('input', schedulePreview);
    lngInp.addEventListener('input', schedulePreview);
    labelInp.addEventListener('input', function () { draft.label = labelInp.value; });
    heightInp.addEventListener('input', function () { draft.height = heightInp.value; });
    colorInp.addEventListener('input', function () {
      draft.markerColor = colorInp.value;
      pinDot.style.background = draft.markerColor;
    });
    zoomInp.addEventListener('input', function () {
      zoomBadge.textContent = String(zoomInp.value);
      schedulePreview();
    });

    // Find button -> geocode
    function runFind() {
      var q = addrInp.value.trim();
      if (!q) { addrStatus.textContent = 'Enter an address first.'; addrStatus.style.color = '#b45309'; return; }
      addrBtn.disabled = true;
      var origBtnHtml = addrBtn.innerHTML;
      addrBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Looking up...';
      addrStatus.textContent = 'Searching OpenStreetMap...';
      addrStatus.style.color = '#64748b';
      geocodeAddress(q)
        .then(function (hit) {
          if (!hit) {
            addrStatus.textContent = 'No matching address found. Try a more specific query.';
            addrStatus.style.color = '#b45309';
            return;
          }
          latInp.value = hit.lat.toFixed(6);
          lngInp.value = hit.lng.toFixed(6);
          addrStatus.innerHTML = '<i class="fas fa-check" style="color:#10b981;"></i> ' +
            (hit.displayName.length > 80 ? hit.displayName.substring(0, 80) + '...' : hit.displayName);
          addrStatus.style.color = '#0f172a';
          updatePreview();
        })
        .catch(function (err) {
          addrStatus.textContent = 'Geocoder error: ' + (err && err.message ? err.message : String(err));
          addrStatus.style.color = '#dc2626';
        })
        .then(function () {
          addrBtn.disabled = false;
          addrBtn.innerHTML = origBtnHtml;
        });
    }
    addrBtn.addEventListener('click', runFind);
    addrInp.addEventListener('keydown', function (e: KeyboardEvent) {
      if (e.key === 'Enter') { e.preventDefault(); runFind(); }
    });

    // Close / Cancel / Apply
    function close() {
      if (previewTimer) clearTimeout(previewTimer);
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      document.removeEventListener('keydown', onEsc);
      if (typeof onClose === 'function') onClose();
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);

    (modal.querySelector('.mf-token-designer-close') as HTMLButtonElement).addEventListener('click', close);
    (modal.querySelector('.mf-map-d-cancel') as HTMLButtonElement).addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    (modal.querySelector('.mf-map-d-apply') as HTMLButtonElement).addEventListener('click', function () {
      // Commit draft -> widgetProps
      field.widgetProps = field.widgetProps || {};
      field.widgetProps.lat = draft.lat;
      field.widgetProps.lng = draft.lng;
      field.widgetProps.zoom = draft.zoom;
      field.widgetProps.label = draft.label;
      field.widgetProps.height = draft.height;
      field.widgetProps.markerColor = draft.markerColor;
      try {
        if (B.state) B.state.isDirty = true;
        if (typeof B.markDirty === 'function') B.markDirty();
        if (B.callModule) {
          try { B.callModule('canvas', 'render', []); } catch (_) {}
          try { B.callModule('properties', 'showProps', [field]); } catch (_) {}
        }
        if (B.showToast) B.showToast('Map updated', 'success');
      } catch (_) { /* ignore */ }
      close();
    });

    // First paint
    updatePreview();
  }

  (window as any).MFMapDesigner = { open: open };
})();
