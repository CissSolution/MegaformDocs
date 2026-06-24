/**
 * MegaForm Print Settings UI
 * Activates in the "Print" tab of the Builder right panel.
 *
 * - Toggle print layout on/off
 * - Configure: page size, orientation, header, logo, org info
 * - QR code settings
 * - Signature areas (add/remove)
 * - Section + field style
 * - Footer settings
 * - Preview button → opens /f/{id}/print in new tab
 *
 * Reads/writes to MegaFormBuilder's settingsJson under settings.printSettings
 */

(function (MFPrint) {
  'use strict';

  // ── Defaults ─────────────────────────────────────────────────────────────
  var DEFAULTS = {
    enabled:          false,
    pageSize:         'A4',
    orientation:      'portrait',
    headerEnabled:    true,
    logoUrl:          '',
    logoPosition:     'left',
    logoMaxHeightPx:  60,
    orgName:          '',
    orgAddress:       '',
    orgPhone:         '',
    orgEmail:         '',
    orgWebsite:       '',
    headerAccentColor: '#6366f1',
    headerTextColor:  '#1e293b',
    printTitle:       '',
    printSubtitle:    '',
    footerEnabled:    true,
    footerText:       '',
    footerShowPageNumbers: true,
    footerShowDate:   true,
    qrCodeEnabled:    false,
    qrCodeUrl:        '',
    qrCodeLabel:      'Fill online',
    qrCodePosition:   'header-right',
    qrCodeSizePx:     80,
    signatureAreas:   [],
    sectionStyle:     'filled-bar',
    fieldLineStyle:   'underline',
    fieldFontSizePt:  10,
    showDateField:    true,
    showRefNumber:    false,
    refNumberLabel:   'Ref #',
    showPhotoPlaceholder: false,
    photoPlaceholderLabel: 'Photo',
    photoPlaceholderSizePx: 100,
    marginsMm: { top: 15, right: 15, bottom: 15, left: 15 },
  };

  // ── Init ─────────────────────────────────────────────────────────────────
  MFPrint.init = function (containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var state = getSettings();
    container.innerHTML = buildHtml(state);
    bindEvents(container, state);
  };

  // ── Get/Set settings from Builder ────────────────────────────────────────
  function getSettings() {
    var settings = {};
    try {
      var builder = window.MegaFormBuilder;
      if (builder && builder.getSettings) {
        var raw = builder.getSettings();
        settings = (raw && raw.printSettings) || {};
      }
    } catch (e) {}
    return Object.assign({}, DEFAULTS, settings);
  }

  function saveSettings(state) {
    try {
      var builder = window.MegaFormBuilder;
      if (builder && builder.updateSettings) {
        builder.updateSettings({ printSettings: state });
        return;
      }
      // Fallback: save directly via API
      // BUG FIX 1: apiBase already IS the DNN API base (/DesktopModules/MegaForm/API/).
      // Prepending '/api/MegaForm/' duplicated the prefix → wrong URL on DNN.
      // BUG FIX 2: no DNN auth headers → 401 on [DnnAuthorize] endpoints.
      var formId = parseInt((document.getElementById('mf-builder-form-id') || {}).value) || 0;
      var apiBase = (document.getElementById('mf-builder-api-url') || {}).value || '';
      if (!formId || !apiBase) return;
      var _psfHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        var _pplt = (window as any).__MF_PLATFORM__?.platform || (window as any).PLATFORM || 'aspcore';
        var _pmid = (window as any).__MF_PLATFORM__?.moduleId || (window as any).MODULE_ID || 0;
        if (String(_pplt).toLowerCase() === 'dnn' && _pmid > 0) {
          var _pjq = (window as any).jQuery || (window as any).$;
          var _psf = _pjq && _pjq.ServicesFramework && _pjq.ServicesFramework(_pmid);
          if (_psf && _psf.getAntiForgeryValue()) {
            _psfHeaders['RequestVerificationToken'] = _psf.getAntiForgeryValue();
            _psfHeaders['TabId']    = String(_psf.getTabId ? _psf.getTabId() : 0);
            _psfHeaders['ModuleId'] = String(_psf.getModuleId ? _psf.getModuleId() : _pmid);
          }
        }
      } catch (_) {}
      // Use apiBase directly (already points to the correct platform API root)
      var cleanApi = apiBase.replace(/\/?$/, '/');
      fetch(cleanApi + 'Form/SavePrintSettings', {
        method: 'POST',
        headers: _psfHeaders,
        body: JSON.stringify({ formId: formId, printSettings: state }),
      }).catch(function() {});
    } catch (e) {}
  }

  // ── HTML Builder ─────────────────────────────────────────────────────────
  function buildHtml(s) {
    return '<div class="mf-print-ui" style="padding:14px;overflow-y:auto;height:100%;font-family:inherit">'

      // Toggle
      + section('Print Layout',
        toggle('mf-print-enabled', 'Enable Print-Ready Layout', s.enabled)
        + '<p style="font-size:11px;color:#64748b;margin-top:4px">Renders an A4/Letter printable version at <code>/f/{id}/print</code></p>'
      )

      // Page
      + section('Page', true,
        row2(
          field('Page Size', select('mf-print-pageSize', ['A4','Letter','Legal','A5'], s.pageSize)),
          field('Orientation', select('mf-print-orientation', ['portrait','landscape'], s.orientation))
        )
        + row4('Margins (mm)',
          numInput('mf-print-margin-top',    s.marginsMm.top,    'Top'),
          numInput('mf-print-margin-right',  s.marginsMm.right,  'Right'),
          numInput('mf-print-margin-bottom', s.marginsMm.bottom, 'Bottom'),
          numInput('mf-print-margin-left',   s.marginsMm.left,   'Left')
        )
      )

      // Header
      + section('Header / Banner', true,
        toggle('mf-print-headerEnabled', 'Show header banner', s.headerEnabled)
        + '<div id="mf-print-header-fields">'
        + row2(
            field('Accent Color', colorInput('mf-print-headerAccentColor', s.headerAccentColor)),
            field('Text Color',   colorInput('mf-print-headerTextColor',   s.headerTextColor))
          )
        + field('Logo URL', textInput('mf-print-logoUrl', s.logoUrl, 'https://... or base64'))
        + row2(
            field('Logo Position', select('mf-print-logoPosition', ['left','right','center'], s.logoPosition)),
            field('Logo Height (px)', numInput('mf-print-logoMaxHeightPx', s.logoMaxHeightPx))
          )
        + field('Organisation Name',    textInput('mf-print-orgName',    s.orgName))
        + field('Address',              textInput('mf-print-orgAddress', s.orgAddress))
        + row2(
            field('Phone', textInput('mf-print-orgPhone', s.orgPhone)),
            field('Email', textInput('mf-print-orgEmail', s.orgEmail))
          )
        + field('Website',             textInput('mf-print-orgWebsite', s.orgWebsite))
        + field('Print Title (override)', textInput('mf-print-printTitle', s.printTitle, 'Defaults to form title'))
        + field('Print Subtitle',        textInput('mf-print-printSubtitle', s.printSubtitle))
        + '</div>'
      )

      // QR Code
      + section('QR Code', true,
        toggle('mf-print-qrCodeEnabled', 'Include QR Code', s.qrCodeEnabled)
        + '<div id="mf-print-qr-fields">'
        + field('URL (blank = online form URL)', textInput('mf-print-qrCodeUrl', s.qrCodeUrl, '/f/{id} auto'))
        + row2(
            field('Label',    textInput('mf-print-qrCodeLabel',    s.qrCodeLabel)),
            field('Size (px)', numInput('mf-print-qrCodeSizePx',   s.qrCodeSizePx))
          )
        + field('Position', select('mf-print-qrCodePosition',
            ['header-right','header-left','footer-right','footer-left'], s.qrCodePosition))
        + '</div>'
      )

      // Signature Areas
      + section('Signature Areas', true,
        '<div id="mf-print-sig-list">' + buildSigList(s.signatureAreas) + '</div>'
        + '<button class="mf-print-add-btn" id="mf-print-add-sig">+ Add Signature Area</button>'
      )

      // Layout
      + section('Layout & Style', true,
        row2(
          field('Section Header Style', select('mf-print-sectionStyle',
            ['filled-bar','underline','plain'], s.sectionStyle)),
          field('Field Line Style', select('mf-print-fieldLineStyle',
            ['underline','box','none'], s.fieldLineStyle))
        )
        + field('Field Font Size (pt)', numInput('mf-print-fieldFontSizePt', s.fieldFontSizePt))
      )

      // Optional elements
      + section('Optional Elements', true,
        toggle('mf-print-showDateField', 'Date field (top row)',   s.showDateField)
        + toggle('mf-print-showRefNumber', 'Ref # field (top row)', s.showRefNumber)
        + field('Ref # Label', textInput('mf-print-refNumberLabel', s.refNumberLabel))
        + toggle('mf-print-showPhotoPlaceholder', 'Photo placeholder (registration)',
            s.showPhotoPlaceholder)
        + '<div id="mf-print-photo-fields">'
        + row2(
            field('Photo Label', textInput('mf-print-photoPlaceholderLabel', s.photoPlaceholderLabel)),
            field('Size (px)',   numInput('mf-print-photoPlaceholderSizePx', s.photoPlaceholderSizePx))
          )
        + '</div>'
      )

      // Footer
      + section('Footer', true,
        toggle('mf-print-footerEnabled', 'Show footer', s.footerEnabled)
        + '<div id="mf-print-footer-fields">'
        + field('Footer Text', textInput('mf-print-footerText', s.footerText, 'e.g. Confidential'))
        + toggle('mf-print-footerShowPageNumbers', 'Show page numbers', s.footerShowPageNumbers)
        + toggle('mf-print-footerShowDate',        'Show print date',   s.footerShowDate)
        + '</div>'
      )

      // Action buttons
      + '<div style="margin-top:16px;display:flex;gap:8px">'
      + '<button class="mf-print-save-btn" id="mf-print-save">💾 Save</button>'
      + '<button class="mf-print-preview-btn" id="mf-print-preview">👁 Preview</button>'
      + '</div>'

      + '</div>'; // mf-print-ui
  }

  function buildSigList(areas) {
    if (!areas || !areas.length)
      return '<p style="font-size:11px;color:#94a3b8;margin-bottom:8px">No signature areas yet.</p>';
    return areas.map(function (a, i) {
      return '<div class="mf-print-sig-item" data-index="' + i + '">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
        + '<span style="font-weight:600;font-size:12px">Signature ' + (i + 1) + '</span>'
        + '<button class="mf-print-del-sig" data-index="' + i + '" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px">✕</button>'
        + '</div>'
        + field('Label', textInput('mf-print-sig-label-' + i, a.label || 'Signature'))
        + field('Sub Label', textInput('mf-print-sig-sublabel-' + i, a.subLabel || ''))
        + field('Width (CSS)', textInput('mf-print-sig-width-' + i, a.width || '50%', '50% | 100%'))
        + toggle('mf-print-sig-showName-' + i, 'Name line', a.showName !== false)
        + toggle('mf-print-sig-showDate-' + i, 'Date line', a.showDate !== false)
        + '</div>';
    }).join('');
  }

  // ── Event binding ────────────────────────────────────────────────────────
  function bindEvents(container, state) {
    // Add signature
    document.getElementById('mf-print-add-sig').onclick = function () {
      state.signatureAreas = state.signatureAreas || [];
      state.signatureAreas.push({ label: 'Signature', subLabel: '', width: '50%', showName: true, showDate: true });
      document.getElementById('mf-print-sig-list').innerHTML = buildSigList(state.signatureAreas);
      bindSigDelete(state);
    };
    bindSigDelete(state);

    // Save
    document.getElementById('mf-print-save').onclick = function () {
      collectState(state);
      saveSettings(state);
      showToast('Print settings saved ✓');
    };

    // Preview
    document.getElementById('mf-print-preview').onclick = function () {
      var formId = parseInt((document.getElementById('mf-builder-form-id') || {}).value) || 0;
      if (!formId) { alert('Save the form first to preview print layout.'); return; }
      // Save first then open
      collectState(state);
      saveSettings(state);
      setTimeout(function () {
        window.open('/f/' + formId + '/print', '_blank');
      }, 600);
    };

    // Conditional visibility: header fields
    var hToggle = document.getElementById('mf-print-headerEnabled');
    if (hToggle) {
      hToggle.onchange = function () {
        var el = document.getElementById('mf-print-header-fields');
        if (el) el.style.display = this.checked ? '' : 'none';
      };
      if (!state.headerEnabled) {
        var hf = document.getElementById('mf-print-header-fields');
        if (hf) hf.style.display = 'none';
      }
    }

    // QR conditional
    condShow('mf-print-qrCodeEnabled', 'mf-print-qr-fields', state.qrCodeEnabled);
    condShow('mf-print-footerEnabled',  'mf-print-footer-fields', state.footerEnabled);
    condShow('mf-print-showPhotoPlaceholder', 'mf-print-photo-fields', state.showPhotoPlaceholder);
  }

  function bindSigDelete(state) {
    var btns = document.querySelectorAll('.mf-print-del-sig');
    btns.forEach(function (btn) {
      btn.onclick = function () {
        var idx = parseInt(this.dataset.index);
        state.signatureAreas.splice(idx, 1);
        document.getElementById('mf-print-sig-list').innerHTML = buildSigList(state.signatureAreas);
        bindSigDelete(state);
      };
    });
  }

  function condShow(toggleId, fieldId, initial) {
    var toggle = document.getElementById(toggleId);
    var fields = document.getElementById(fieldId);
    if (!toggle || !fields) return;
    fields.style.display = initial ? '' : 'none';
    toggle.onchange = function () { fields.style.display = this.checked ? '' : 'none'; };
  }

  // ── Collect state from DOM ───────────────────────────────────────────────
  function collectState(state) {
    function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
    function chk(id) { var e = document.getElementById(id); return e ? e.checked : false; }
    function num(id) { var v = parseInt(val(id)); return isNaN(v) ? 0 : v; }

    state.enabled              = chk('mf-print-enabled');
    state.pageSize             = val('mf-print-pageSize');
    state.orientation          = val('mf-print-orientation');
    state.headerEnabled        = chk('mf-print-headerEnabled');
    state.logoUrl              = val('mf-print-logoUrl');
    state.logoPosition         = val('mf-print-logoPosition');
    state.logoMaxHeightPx      = num('mf-print-logoMaxHeightPx');
    state.orgName              = val('mf-print-orgName');
    state.orgAddress           = val('mf-print-orgAddress');
    state.orgPhone             = val('mf-print-orgPhone');
    state.orgEmail             = val('mf-print-orgEmail');
    state.orgWebsite           = val('mf-print-orgWebsite');
    state.headerAccentColor    = val('mf-print-headerAccentColor');
    state.headerTextColor      = val('mf-print-headerTextColor');
    state.printTitle           = val('mf-print-printTitle');
    state.printSubtitle        = val('mf-print-printSubtitle');
    state.footerEnabled        = chk('mf-print-footerEnabled');
    state.footerText           = val('mf-print-footerText');
    state.footerShowPageNumbers = chk('mf-print-footerShowPageNumbers');
    state.footerShowDate       = chk('mf-print-footerShowDate');
    state.qrCodeEnabled        = chk('mf-print-qrCodeEnabled');
    state.qrCodeUrl            = val('mf-print-qrCodeUrl');
    state.qrCodeLabel          = val('mf-print-qrCodeLabel');
    state.qrCodePosition       = val('mf-print-qrCodePosition');
    state.qrCodeSizePx         = num('mf-print-qrCodeSizePx');
    state.sectionStyle         = val('mf-print-sectionStyle');
    state.fieldLineStyle       = val('mf-print-fieldLineStyle');
    state.fieldFontSizePt      = num('mf-print-fieldFontSizePt');
    state.showDateField        = chk('mf-print-showDateField');
    state.showRefNumber        = chk('mf-print-showRefNumber');
    state.refNumberLabel       = val('mf-print-refNumberLabel');
    state.showPhotoPlaceholder = chk('mf-print-showPhotoPlaceholder');
    state.photoPlaceholderLabel = val('mf-print-photoPlaceholderLabel');
    state.photoPlaceholderSizePx = num('mf-print-photoPlaceholderSizePx');
    state.marginsMm = {
      top:    num('mf-print-margin-top'),
      right:  num('mf-print-margin-right'),
      bottom: num('mf-print-margin-bottom'),
      left:   num('mf-print-margin-left'),
    };

    // Signature areas
    var areas = state.signatureAreas || [];
    for (var i = 0; i < areas.length; i++) {
      areas[i].label    = val('mf-print-sig-label-'    + i);
      areas[i].subLabel = val('mf-print-sig-sublabel-' + i);
      areas[i].width    = val('mf-print-sig-width-'    + i);
      areas[i].showName = chk('mf-print-sig-showName-' + i);
      areas[i].showDate = chk('mf-print-sig-showDate-' + i);
    }
    state.signatureAreas = areas;
  }

  // ── HTML helpers ─────────────────────────────────────────────────────────
  function section(title, collapsible, body) {
    if (typeof collapsible === 'string') { body = collapsible; collapsible = false; }
    return '<div class="mf-print-section">'
      + '<div class="mf-print-section-title">' + title + '</div>'
      + '<div class="mf-print-section-body">' + (body || '') + '</div>'
      + '</div>';
  }

  function toggle(id, label, checked) {
    return '<label class="mf-print-toggle" style="margin-bottom:8px">'
      + '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '/>'
      + '<span>' + label + '</span>'
      + '</label>';
  }

  function field(label, input) {
    return '<div class="mf-print-field">'
      + '<label class="mf-print-label">' + label + '</label>'
      + input
      + '</div>';
  }

  function row2(a, b) {
    return '<div style="display:flex;gap:10px">'
      + '<div style="flex:1">' + a + '</div>'
      + '<div style="flex:1">' + b + '</div>'
      + '</div>';
  }

  function row4(label, a, b, c, d) {
    return '<div class="mf-print-field"><label class="mf-print-label">' + label + '</label>'
      + '<div style="display:flex;gap:6px">'
      + '<div style="flex:1">' + a + '</div>'
      + '<div style="flex:1">' + b + '</div>'
      + '<div style="flex:1">' + c + '</div>'
      + '<div style="flex:1">' + d + '</div>'
      + '</div></div>';
  }

  function textInput(id, val, placeholder) {
    return '<input class="mf-print-input" type="text" id="' + id + '" value="' + esc(val || '') + '"'
      + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '/>';
  }

  function numInput(id, val, placeholder) {
    return '<input class="mf-print-input" type="number" id="' + id + '" value="' + (val || 0) + '"'
      + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + ' style="width:100%"/>';
  }

  function colorInput(id, val) {
    return '<div style="display:flex;gap:6px;align-items:center">'
      + '<input type="color" id="' + id + '-picker" value="' + esc(val || '#000000') + '" style="width:32px;height:28px;padding:0;border:1px solid #e2e8f0;border-radius:4px;cursor:pointer"'
      + ' oninput="document.getElementById(\'' + id + '\').value=this.value"/>'
      + '<input class="mf-print-input" type="text" id="' + id + '" value="' + esc(val || '') + '"'
      + ' oninput="document.getElementById(\'' + id + '-picker\').value=this.value" style="width:80px"/>'
      + '</div>';
  }

  function select(id, options, val) {
    return '<select class="mf-print-input" id="' + id + '">'
      + options.map(function (o) {
          return '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('')
      + '</select>';
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function showToast(msg) {
    var t = document.getElementById('mf-toast') || document.createElement('div');
    t.id = 'mf-toast';
    if (!t.parentNode) document.body.appendChild(t);
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:8px 18px;border-radius:20px;background:#f0fdf4;color:#166534;border:1px solid #86efac;font-size:13px;font-weight:500;z-index:9999;opacity:1;transition:opacity .3s';
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.style.opacity = '0'; }, 2500);
  }

  // ── CSS injection ─────────────────────────────────────────────────────────
  MFPrint.injectStyles = function () {
    if (document.getElementById('mf-print-ui-styles')) return;
    var style = document.createElement('style');
    style.id = 'mf-print-ui-styles';
    style.textContent = `
.mf-print-ui { font-size: 12px; }
.mf-print-section { margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.mf-print-section-title {
  background: #f8fafc;
  padding: 7px 12px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}
.mf-print-section-body { padding: 12px; }
.mf-print-field { margin-bottom: 10px; }
.mf-print-label { display: block; font-size: 10px; font-weight: 600; color: #64748b; margin-bottom: 3px; text-transform: uppercase; letter-spacing: .04em; }
.mf-print-input {
  display: block; width: 100%; box-sizing: border-box;
  padding: 6px 8px; border: 1.5px solid #e2e8f0; border-radius: 6px;
  font-size: 12px; color: #1e293b; background: #fff; transition: border-color .15s;
}
.mf-print-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.1); }
.mf-print-toggle { display: flex; align-items: center; gap: 7px; cursor: pointer; margin-bottom: 8px; font-size: 12px; color: #374151; }
.mf-print-sig-item {
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 7px; padding: 10px; margin-bottom: 8px;
}
.mf-print-add-btn {
  padding: 6px 12px; border-radius: 7px; border: 1.5px dashed #6366f1; background: #eef2ff;
  color: #6366f1; font-size: 12px; font-weight: 600; cursor: pointer; width: 100%; margin-top: 4px;
}
.mf-print-add-btn:hover { background: #e0e7ff; }
.mf-print-save-btn {
  flex: 1; padding: 8px 14px; border-radius: 7px; background: #6366f1; color: #fff;
  border: none; font-size: 12px; font-weight: 600; cursor: pointer;
}
.mf-print-preview-btn {
  flex: 1; padding: 8px 14px; border-radius: 7px; background: #fff; color: #6366f1;
  border: 1.5px solid #6366f1; font-size: 12px; font-weight: 600; cursor: pointer;
}
.mf-print-save-btn:hover, .mf-print-preview-btn:hover { opacity: .85; }
`;
    document.head.appendChild(style);
  };

})(window.MFPrintSettings = window.MFPrintSettings || {});

export {};
