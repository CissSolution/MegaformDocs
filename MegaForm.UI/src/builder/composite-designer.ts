// ============================================================
// MegaForm Builder — Composite Controls Designer (v20260615-B168)
// File: src/builder/composite-designer.ts
//
// One modal to configure a Composite field's sub-inputs the way the
// WPForms/Gravity admin does — ported from the localhost:3001 mock
// (components/form-builder/composite-admin-panel.tsx) onto MegaForm's
// shared `mf-token-designer-*` shell so it matches Slider / ImageChoice
// / Map / Video designers (chung giao diện nhất quán).
//
// Per part: show/hide, type (text/email/tel/number/date/select/textarea/
// password/url), column width (fractions or raw), sub-label, placeholder,
// default, validation (required / min / max / regex), select options,
// reorder (up/down) + delete + add. Live Preview tab mirrors the runtime.
//
// Writes field.widgetProps.parts[] in the EXACT shape the renderer reads
// (src/renderer/helpers.ts CompositePart) — additive, nothing else touched.
// ============================================================
// @ts-nocheck
'use strict';

import { addressPartsForScheme } from '../renderer/composite-address';
// [Composite Registry v20260616] Single source — seed parts from COMPOSITE_PRESETS and list
// presets from COMPOSITE_PRESET_META (was a local PRESETS/DIAL_CODES mirror that could drift).
import { COMPOSITE_PRESETS, COMPOSITE_DIAL_CODES, compositePresetKeys, compositePresetLabel, compositePartLabel } from '../renderer/helpers';
import { wt } from './designer-i18n';

(function () {
  if ((window as any).__MFCompositeDesignerLoaded) return;
  (window as any).__MFCompositeDesignerLoaded = true;

  // NOTE: do NOT early-return when MegaFormBuilder isn't defined yet — module load
  // order is not guaranteed, and bailing here would mean MFCompositeDesigner never
  // registers. Resolve the builder lazily inside open() (always defined by the time
  // the inline launcher button is clicked).
  function getB(): any { return (window as any).MegaFormBuilder || {}; }

  // ── Component CSS (self-injected so it ships with megaform-builder.js on every
  //    platform; reuses the shared mf-token-designer-* shell for the chrome). ──────
  (function injectCss() {
    if (document.getElementById('mf-composite-designer-css')) return;
    var st = document.createElement('style');
    st.id = 'mf-composite-designer-css';
    st.textContent =
      // Shared-shell chrome — scoped to THIS modal so it renders correctly even where
      // megaform-builder.css (the canonical mf-token-designer-* rules) isn't loaded,
      // and never collides with the other designers' modals.
      '#mf-composite-designer-modal.mf-token-designer-backdrop{position:fixed;inset:0;z-index:100020;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;}' +
      '#mf-composite-designer-modal .mf-token-designer-shell{display:flex;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 30px 80px rgba(15,23,42,.45);max-height:min(90vh,800px);overflow:hidden;font-family:Inter,system-ui,sans-serif;}' +
      '#mf-composite-designer-modal .mf-token-designer-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e2e8f0;}' +
      '#mf-composite-designer-modal .mf-token-designer-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;color:#0f172a;}' +
      '#mf-composite-designer-modal .mf-token-designer-title i{color:#6366f1;}' +
      '#mf-composite-designer-modal .mf-token-designer-badge{font-size:10px;font-weight:600;color:#6366f1;background:#eef2ff;border-radius:6px;padding:2px 7px;}' +
      '#mf-composite-designer-modal .mf-token-designer-close{appearance:none;border:0;background:transparent;font-size:22px;line-height:1;color:#94a3b8;cursor:pointer;width:32px;height:32px;border-radius:8px;}' +
      '#mf-composite-designer-modal .mf-token-designer-close:hover{background:#f1f5f9;color:#0f172a;}' +
      '#mf-composite-designer-modal .mf-token-designer-tabs{display:flex;gap:4px;padding:0 18px;border-bottom:1px solid #e2e8f0;background:#fff;}' +
      '#mf-composite-designer-modal .mf-token-designer-tab{appearance:none;background:transparent;border:0;padding:10px 14px;font-size:12px;font-weight:600;color:#64748b;cursor:pointer;display:flex;align-items:center;gap:6px;border-bottom:2px solid transparent;margin-bottom:-1px;}' +
      '#mf-composite-designer-modal .mf-token-designer-tab:hover{color:#0f172a;}' +
      '#mf-composite-designer-modal .mf-token-designer-tab.active{color:#0f172a;border-bottom-color:#6366f1;}' +
      '#mf-composite-designer-modal .mf-token-designer-count{background:#e2e8f0;color:#475569;border-radius:999px;font-size:10px;font-weight:700;padding:1px 7px;}' +
      '#mf-composite-designer-modal .mf-token-designer-tab.active .mf-token-designer-count{background:#6366f1;color:#fff;}' +
      '#mf-composite-designer-modal .mf-token-designer-body{padding:16px 18px;overflow-y:auto;flex:1;min-height:120px;}' +
      '#mf-composite-designer-modal .mf-token-designer-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;border-top:1px solid #e2e8f0;background:#f8fafc;}' +
      '#mf-composite-designer-modal .mf-token-designer-foot-hint{font-size:11px;color:#94a3b8;}' +
      '#mf-composite-designer-modal .mf-token-designer-foot-hint kbd,#mf-composite-designer-modal .mf-token-designer-foot-hint code{background:#e2e8f0;border-radius:4px;padding:0 4px;font-size:11px;}' +
      '#mf-composite-designer-modal .mf-token-designer-empty{font-size:12px;color:#94a3b8;padding:16px;text-align:center;border:1px dashed #e2e8f0;border-radius:10px;}' +
      '#mf-composite-designer-modal .mf-builder-btn{appearance:none;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:7px 12px;cursor:pointer;}' +
      '#mf-composite-designer-modal .mf-builder-btn:hover{background:#f1f5f9;}' +
      '#mf-composite-designer-modal .mf-token-designer-done{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;}' +
      '.mf-composite-designer-shell{width:min(880px,100%);}' +
      '.mf-comp-des-layout{padding:14px 18px;border-bottom:1px solid #e2e8f0;background:#f8fafc;}' +
      '.mf-comp-des-lb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;}' +
      '.mf-comp-des-lb-cell label{display:block;font-size:11px;font-weight:600;color:#475569;margin:0 0 3px;}' +
      '.mf-comp-des-sel{width:100%;height:34px;padding:0 8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font-size:13px;color:#0f172a;}' +
      '.mf-comp-des-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;}' +
      '.mf-comp-des-toolbar-hint{font-size:11px;color:#94a3b8;flex:1;min-width:140px;}' +
      '.mf-comp-des-list{display:flex;flex-direction:column;gap:8px;}' +
      '.mf-comp-des-part{border:1px solid #e2e8f0;border-radius:10px;background:#fff;overflow:hidden;}' +
      '.mf-comp-des-part.is-hidden{border-style:dashed;background:#f8fafc;opacity:.72;}' +
      '.mf-comp-des-part-head{display:flex;align-items:center;gap:8px;padding:9px 12px;}' +
      '.mf-comp-des-grip{color:#cbd5e1;cursor:grab;font-size:13px;}' +
      '.mf-comp-des-part-name{flex:1;min-width:0;font-weight:600;font-size:13px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.mf-comp-des-pill{font-size:10px;font-weight:600;border-radius:5px;padding:2px 7px;white-space:nowrap;text-transform:capitalize;}' +
      '.mf-comp-des-pill-type{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;}' +
      '.mf-comp-des-pill-w{background:#eef2ff;color:#4338ca;}' +
      '.mf-comp-des-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;border-radius:999px;padding:2px 9px;cursor:pointer;border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;}' +
      '.mf-comp-des-badge i{font-size:8px;}' +
      '.mf-comp-des-badge.is-on{background:#eef2ff;color:#4338ca;border-color:#c7d2fe;}' +
      '.mf-comp-des-icon{appearance:none;border:0;background:transparent;color:#94a3b8;cursor:pointer;width:26px;height:26px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;}' +
      '.mf-comp-des-icon:hover{background:#f1f5f9;color:#0f172a;}' +
      '.mf-comp-des-icon.is-on{color:#6366f1;background:#eef2ff;}' +
      '.mf-comp-des-icon:disabled{opacity:.25;cursor:default;}' +
      '.mf-comp-des-icon.mf-comp-des-del:hover{color:#dc2626;background:#fef2f2;}' +
      '.mf-comp-des-move{display:flex;flex-direction:column;}' +
      '.mf-comp-des-move .mf-comp-des-icon{width:22px;height:16px;font-size:10px;}' +
      '.mf-comp-des-part-body{border-top:1px solid #e2e8f0;background:#f8fafc;padding:12px;}' +
      '.mf-comp-des-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;}' +
      '.mf-comp-des-fld label{display:block;font-size:11px;font-weight:600;color:#475569;margin:0 0 3px;}' +
      '.mf-comp-des-in{width:100%;height:32px;padding:0 8px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;font-size:12px;color:#0f172a;}' +
      'textarea.mf-comp-des-in{height:auto;padding:6px 8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}' +
      '.mf-comp-des-opts{margin-top:4px;}' +
      '.mf-comp-des-sub-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:14px 0 6px;}' +
      '.mf-comp-des-hint{font-weight:400;text-transform:none;letter-spacing:0;color:#94a3b8;}' +
      '.mf-comp-des-hint code,.mf-comp-des-preview-note code{background:#eef2ff;color:#4338ca;border-radius:4px;padding:0 4px;font-size:11px;}' +
      '.mf-comp-des-preview-wrap{display:flex;flex-direction:column;gap:8px;}' +
      '.mf-comp-des-preview-cap{font-size:11px;font-weight:700;letter-spacing:.06em;color:#94a3b8;margin:0;}' +
      '.mf-comp-des-preview-card{border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:16px;}' +
      '.mf-comp-des-preview-label{display:block;font-size:14px;font-weight:600;color:#0f172a;}' +
      '.mf-comp-des-preview-note{font-size:11px;color:#94a3b8;margin:0;}' +
      '.mf-comp-des-preview-card .mf-input{height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;width:100%;background:#fff;}' +
      '.mf-comp-des-preview-card textarea.mf-input{height:auto;padding:6px 10px;}' +
      '.mf-comp-des-preview-card .mf-composite-sub{font-size:11px;color:#64748b;}' +
      '.mf-comp-des-preview-card .mf-composite-req{color:#dc2626;}';
    (document.head || document.documentElement).appendChild(st);
  })();

  // ── Builder-local mirrors (renderer stays authoritative; these only seed the
  //    editor, identical to field-plugins/_index.ts). ───────────────────────────
  // [Composite Registry v20260616] Reuse the single source instead of a local copy.
  var DIAL_CODES = COMPOSITE_DIAL_CODES;
  // [Composite Registry v20260616] ⚠️ DEAD — presetParts() now reads the single source
  // COMPOSITE_PRESETS (renderer/helpers). Do NOT extend; add presets in helpers.
  var PRESETS: any = {
    phone: [
      // [Composite v1.4] Reuse the rich flag country-picker instead of a plain dial-code <select>.
      { key: 'country', label: 'Country code', sublabel: 'Code', placeholder: '+1', width: '116px', def: '+1', type: 'country' },
      { key: 'area', label: 'Area code', sublabel: 'Area', placeholder: 'Area', width: '74px', maxLength: 4 },
      { key: 'number', label: 'Phone number', sublabel: 'Number', placeholder: 'Phone number', flex: 1, required: true },
      { key: 'ext', label: 'Extension', sublabel: 'Ext', placeholder: 'Ext', width: '74px' }
    ],
    name: [
      { key: 'first', label: 'First name', sublabel: 'First', placeholder: 'First name', flex: 1, required: true },
      { key: 'last', label: 'Last name', sublabel: 'Last', placeholder: 'Last name', flex: 1, required: true }
    ],
    // [Composite v1.4] New presets: SSN, full name, DOB, time, confirm email/password.
    ssn: [
      { key: 'ssn', label: 'Social Security Number', sublabel: 'SSN', placeholder: '___-__-____', width: 'full', type: 'tel', mask: '###-##-####', maxLength: 11, inputMode: 'numeric', pattern: '^\\d{3}-\\d{2}-\\d{4}$', patternMsg: 'Enter a valid 9-digit SSN', required: true }
    ],
    name_plus: [
      { key: 'prefix', label: 'Prefix', sublabel: 'Prefix', placeholder: 'Prefix', width: '90px', type: 'select', options: [{ value: '', label: '—' }, { value: 'Mr', label: 'Mr' }, { value: 'Mrs', label: 'Mrs' }, { value: 'Ms', label: 'Ms' }, { value: 'Dr', label: 'Dr' }, { value: 'Prof', label: 'Prof' }] },
      { key: 'first', label: 'First name', sublabel: 'First', placeholder: 'First name', flex: 1, required: true },
      { key: 'middle', label: 'Middle name', sublabel: 'Middle', placeholder: 'Middle', width: '90px' },
      { key: 'last', label: 'Last name', sublabel: 'Last', placeholder: 'Last name', flex: 1, required: true },
      { key: 'suffix', label: 'Suffix', sublabel: 'Suffix', placeholder: 'Suffix', width: '90px', type: 'select', options: [{ value: '', label: '—' }, { value: 'Jr', label: 'Jr' }, { value: 'Sr', label: 'Sr' }, { value: 'II', label: 'II' }, { value: 'III', label: 'III' }] }
    ],
    dob: (function () {
      var thisYear = new Date().getFullYear();
      var years: any[] = [{ value: '', label: 'Year' }];
      for (var y = thisYear; y >= thisYear - 120; y--) years.push({ value: String(y), label: String(y) });
      var days: any[] = [{ value: '', label: 'Day' }];
      for (var d = 1; d <= 31; d++) days.push({ value: String(d), label: String(d) });
      var months: any[] = [
        { value: '', label: 'Month' },
        { value: '1', label: 'January' }, { value: '2', label: 'February' },
        { value: '3', label: 'March' }, { value: '4', label: 'April' },
        { value: '5', label: 'May' }, { value: '6', label: 'June' },
        { value: '7', label: 'July' }, { value: '8', label: 'August' },
        { value: '9', label: 'September' }, { value: '10', label: 'October' },
        { value: '11', label: 'November' }, { value: '12', label: 'December' }
      ];
      return [
        { key: 'day', label: 'Day', sublabel: 'Day', placeholder: 'Day', width: '80px', type: 'select', options: days },
        { key: 'month', label: 'Month', sublabel: 'Month', placeholder: 'Month', width: '110px', type: 'select', options: months },
        { key: 'year', label: 'Year', sublabel: 'Year', placeholder: 'Year', width: '100px', type: 'select', options: years, dateAge: true, minAge: 0, maxAge: 120 }
      ];
    })(),
    time: [
      { key: 'hour', label: 'Hour', sublabel: 'Hour', placeholder: 'Hour', width: '80px', type: 'select', options: [{ value: '', label: '—' }].concat(Array.from({ length: 12 }, function (_: any, i: number) { return { value: String(i + 1), label: String(i + 1) }; })) },
      { key: 'minute', label: 'Minute', sublabel: 'Minute', placeholder: 'Minute', width: '80px', type: 'select', options: [{ value: '', label: '—' }].concat(Array.from({ length: 60 }, function (_: any, i: number) { return { value: ('0' + i).slice(-2), label: ('0' + i).slice(-2) }; })) },
      { key: 'ampm', label: 'AM/PM', sublabel: 'AM/PM', placeholder: 'AM/PM', width: '80px', type: 'select', options: [{ value: '', label: '—' }, { value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }] }
    ],
    email_confirm: [
      { key: 'email', label: 'Email', sublabel: 'Email', placeholder: 'Email', flex: 1, type: 'email', required: true },
      { key: 'email_confirm', label: 'Confirm Email', sublabel: 'Confirm', placeholder: 'Confirm email', flex: 1, type: 'email', required: true, matchKey: 'email', matchMsg: 'Emails do not match' }
    ],
    password_confirm: [
      { key: 'password', label: 'Password', sublabel: 'Password', placeholder: 'Password', flex: 1, type: 'password', required: true },
      { key: 'password_confirm', label: 'Confirm Password', sublabel: 'Confirm', placeholder: 'Confirm password', flex: 1, type: 'password', required: true, matchKey: 'password', matchMsg: 'Passwords do not match' }
    ]
  };

  var FIELD_TYPES = ['text', 'email', 'tel', 'number', 'date', 'select', 'textarea', 'password', 'url', 'country'];
  // value → friendly label. Fraction tokens map to flex-basis %, 'auto' grows to fill,
  // 'custom' reveals a raw width box (px / %).
  var WIDTHS = [
    { value: 'auto', label: wt('des.comp.autoGrow', 'Auto (grow)') },
    { value: '1/6', label: '16% · 1/6' },
    { value: '1/5', label: '20% · 1/5' },
    { value: '1/4', label: '25% · 1/4' },
    { value: '1/3', label: '33% · 1/3' },
    { value: '1/2', label: '50% · 1/2' },
    { value: '2/3', label: '67% · 2/3' },
    { value: '3/4', label: '75% · 3/4' },
    { value: 'full', label: '100% · Full' },
    { value: 'custom', label: wt('des.comp.customPxPercent', 'Custom (px/%)') }
  ];
  var FRACTIONS: any = { '1/6': 16.6667, '1/5': 20, '1/4': 25, '1/3': 33.3333, '2/5': 40, '1/2': 50, '3/5': 60, '2/3': 66.6667, '3/4': 75, '4/5': 80, 'full': 100, '1/1': 100 };

  // B-free escapers so they never depend on builder load order.
  function esc(s: any) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function escA(s: any) { return esc(s); }
  function clone(o: any) { try { return JSON.parse(JSON.stringify(o)); } catch (_e) { return o; } }

  function presetParts(wp: any): any[] {
    var preset = String(wp.preset || 'name');
    if (preset === 'address') return addressPartsForScheme(wp.addressScheme || 'us').map(clone);
    // [Composite Registry v20260616] Single source: renderer/helpers COMPOSITE_PRESETS.
    var entry: any = COMPOSITE_PRESETS[preset] || COMPOSITE_PRESETS.name;
    return ((entry && entry.parts) ? entry.parts : []).map(clone);
  }
  function effectiveParts(field: any): any[] {
    var wp = field.widgetProps || {};
    if (Array.isArray(wp.parts) && wp.parts.length) return wp.parts.map(clone);
    return presetParts(wp);
  }

  // current width control value for a part
  function widthValueOf(p: any): string {
    if (p.flex) return 'auto';
    var w = p.width ? String(p.width).trim() : '';
    if (!w) return 'auto';
    if (Object.prototype.hasOwnProperty.call(FRACTIONS, w)) return w;
    return 'custom';
  }
  function widthLabelOf(p: any): string {
    var v = widthValueOf(p);
    if (v === 'auto') return wt('des.comp.autoShort', 'Auto');
    if (v === 'custom') return String(p.width || '');
    if (Object.prototype.hasOwnProperty.call(FRACTIONS, v)) return Math.round(FRACTIONS[v]) + '%';
    return v;
  }
  function cellStyle(p: any): string {
    if (p.flex) return 'flex:' + p.flex + ' 1 0;min-width:0;';
    var w = p.width ? String(p.width).trim() : '';
    if (w) {
      if (Object.prototype.hasOwnProperty.call(FRACTIONS, w)) return 'flex:0 1 calc(' + FRACTIONS[w] + '% - 6px);min-width:0;';
      return 'flex:0 0 ' + w + ';width:' + w + ';min-width:0;';
    }
    return 'flex:1 1 0;min-width:0;';
  }
  function partTitle(p: any): string {
    return p.label || p.sublabel || (p.key ? (p.key.charAt(0).toUpperCase() + p.key.slice(1).replace(/[_-]+/g, ' ')) : wt('des.comp.fieldFallback', 'Field'));
  }
  function inputType(t: string): string {
    switch (t) { case 'email': return 'email'; case 'number': return 'number'; case 'tel': return 'tel'; case 'date': return 'date'; case 'password': return 'password'; case 'url': return 'url'; default: return 'text'; }
  }
  function uniqueKey(parts: any[], base: string): string {
    var k = base, i = 1;
    var has = function (kk: string) { return parts.some(function (p: any) { return p.key === kk; }); };
    while (has(k)) { k = base + '_' + (++i); }
    return k;
  }

  function open(field: any, onClose?: () => void) {
    var B: any = getB();
    if (!field || field.type !== 'Composite') {
      B.showToast && B.showToast(wt('des.comp.onlyInputFields', 'Input Designer only works for Input fields'), 'error');
      return;
    }
    var wp = field.widgetProps = field.widgetProps || {};
    if (typeof wp.preset !== 'string') wp.preset = 'name';
    if (typeof wp.nav !== 'string') wp.nav = 'roving';
    if (typeof wp.orient !== 'string') wp.orient = (wp.preset === 'address' ? 'both' : 'horizontal');
    if (typeof wp.labelPos !== 'string') wp.labelPos = 'bottom';

    // Working copy — only written back to wp.parts on an actual edit (so opening +
    // closing without changes never mutates the schema).
    var parts: any[] = effectiveParts(field);
    var openRows: any = {};   // partIndex → expanded settings open?

    var existing = document.getElementById('mf-composite-designer-modal');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var modal = document.createElement('div');
    modal.id = 'mf-composite-designer-modal';
    modal.className = 'mf-token-designer-backdrop';
    modal.setAttribute('data-mf-overlay', '1');
    modal.innerHTML =
      '<div class="mf-token-designer-shell mf-composite-designer-shell" role="dialog" aria-label="' + wt('des.comp.inputDesigner', 'Input Designer') + '">' +
        '<div class="mf-token-designer-head">' +
          '<div class="mf-token-designer-title">' +
            '<i class="fas fa-object-group"></i>' +
            '<span>' + wt('des.comp.inputDesigner', 'Input Designer') + '</span>' +
            '<span class="mf-token-designer-badge">v20260615-B168</span>' +
          '</div>' +
          '<button type="button" class="mf-token-designer-close" aria-label="' + wt('des.comp.close', 'Close') + '">&times;</button>' +
        '</div>' +
        '<div class="mf-comp-des-layout" id="mf-comp-des-layout"></div>' +
        '<div class="mf-token-designer-tabs">' +
          '<button type="button" class="mf-token-designer-tab active" data-tab="parts"><i class="fas fa-list"></i> ' + wt('des.comp.parts', 'Parts') + ' <span class="mf-token-designer-count" id="mf-comp-des-count">0</span></button>' +
          '<button type="button" class="mf-token-designer-tab" data-tab="preview"><i class="fas fa-eye"></i> ' + wt('des.comp.livePreview', 'Live Preview') + '</button>' +
        '</div>' +
        '<div class="mf-token-designer-body">' +
          '<div class="mf-token-designer-pane" data-pane="parts"></div>' +
          '<div class="mf-token-designer-pane" data-pane="preview" style="display:none"></div>' +
        '</div>' +
        '<div class="mf-token-designer-foot">' +
          '<div class="mf-token-designer-foot-hint"><i class="fas fa-info-circle"></i> ' + wt('des.comp.footHintPre', 'One field, several sub-inputs, submitted as a single value. Press') + ' <kbd>Esc</kbd> ' + wt('des.comp.footHintPost', 'to close.') + '</div>' +
          '<button type="button" class="mf-builder-btn mf-token-designer-done"><i class="fas fa-check"></i> ' + wt('des.comp.done', 'Done') + '</button>' +
        '</div>' +
      '</div>';

    var mount: HTMLElement = (document.getElementById('mf-builder-root') || document.body) as HTMLElement;
    mount.appendChild(modal);

    function close() {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      document.removeEventListener('keydown', onEsc);
      if (typeof onClose === 'function') onClose();
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    modal.querySelector('.mf-token-designer-close')!.addEventListener('click', close);
    modal.querySelector('.mf-token-designer-done')!.addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    var paneParts = modal.querySelector('[data-pane="parts"]') as HTMLElement;
    var panePreview = modal.querySelector('[data-pane="preview"]') as HTMLElement;
    var countBadge = modal.querySelector('#mf-comp-des-count') as HTMLElement;
    var layoutBar = modal.querySelector('#mf-comp-des-layout') as HTMLElement;

    Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-tab'), function (t: HTMLElement) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-tab'), function (x: HTMLElement) { x.classList.remove('active'); });
        t.classList.add('active');
        var name = t.getAttribute('data-tab');
        Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-pane'), function (p: HTMLElement) {
          (p as any).style.display = (p.getAttribute('data-pane') === name) ? '' : 'none';
        });
        if (name === 'preview') renderPreview();
      });
    });

    // Persist the working parts into the field + refresh the canvas. Marks dirty.
    function commit() {
      wp.parts = parts.map(clone);
      B.state.isDirty = true;
      try { B.callModule('canvas', 'render'); } catch (_e) { /* noop */ }
    }
    function refreshCount() { countBadge.textContent = String(parts.length); }

    // ── Layout & behavior bar (preset / address scheme / keyboard / arrows) ───────
    function renderLayoutBar() {
      var isAddr = String(wp.preset) === 'address';
      layoutBar.innerHTML =
        '<div class="mf-comp-des-lb-grid">' +
          '<div class="mf-comp-des-lb-cell">' +
            '<label>' + wt('des.comp.preset', 'Preset') + '</label>' +
            '<select class="mf-comp-des-sel" data-lb="preset">' +
              // [Composite Registry v20260616] Generated from the single source so new presets appear.
              compositePresetKeys().map(function (k) { return '<option value="' + k + '"' + (wp.preset === k ? ' selected' : '') + '>' + esc(compositePresetLabel(k)) + '</option>'; }).join('') +
            '</select>' +
          '</div>' +
          (isAddr
            ? '<div class="mf-comp-des-lb-cell"><label>' + wt('des.comp.addressFormat', 'Address format') + '</label>' +
              '<select class="mf-comp-des-sel" data-lb="scheme">' +
                '<option value="us"' + (wp.addressScheme === 'us' || !wp.addressScheme ? ' selected' : '') + '>🇺🇸 ' + wt('des.comp.addrUs', 'United States') + '</option>' +
                '<option value="intl"' + (wp.addressScheme === 'intl' ? ' selected' : '') + '>🌍 ' + wt('des.comp.addrIntl', 'International') + '</option>' +
                '<option value="canada"' + (wp.addressScheme === 'canada' ? ' selected' : '') + '>🇨🇦 ' + wt('des.comp.addrCanada', 'Canada') + '</option>' +
                '<option value="uk"' + (wp.addressScheme === 'uk' ? ' selected' : '') + '>🇬🇧 ' + wt('des.comp.addrUk', 'UK / Australia') + '</option>' +
              '</select></div>'
            : '') +
          '<div class="mf-comp-des-lb-cell"><label>' + wt('des.comp.keyboard', 'Keyboard') + '</label>' +
            '<select class="mf-comp-des-sel" data-lb="nav">' +
              '<option value="roving"' + (wp.nav !== 'tab' ? ' selected' : '') + '>' + wt('des.comp.arrowOneTab', 'Arrow keys · one tab stop') + '</option>' +
              '<option value="tab"' + (wp.nav === 'tab' ? ' selected' : '') + '>' + wt('des.comp.tabBetween', 'Tab between parts') + '</option>' +
            '</select></div>' +
          '<div class="mf-comp-des-lb-cell"><label>' + wt('des.comp.arrowDirection', 'Arrow direction') + '</label>' +
            '<select class="mf-comp-des-sel" data-lb="orient">' +
              '<option value="horizontal"' + (wp.orient === 'horizontal' ? ' selected' : '') + '>' + wt('des.comp.horizontal', 'Horizontal') + ' &larr; &rarr;</option>' +
              '<option value="vertical"' + (wp.orient === 'vertical' ? ' selected' : '') + '>' + wt('des.comp.vertical', 'Vertical') + ' &uarr; &darr;</option>' +
              '<option value="both"' + (wp.orient === 'both' ? ' selected' : '') + '>' + wt('des.comp.bothGrid', 'Both (grid)') + '</option>' +
            '</select></div>' +
          '<div class="mf-comp-des-lb-cell"><label>' + wt('des.comp.partLabels', 'Part labels') + '</label>' +
            '<select class="mf-comp-des-sel" data-lb="labelPos">' +
              '<option value="bottom"' + (wp.labelPos !== 'top' && wp.labelPos !== 'hidden' ? ' selected' : '') + '>' + wt('des.comp.belowBox', 'Below the box') + '</option>' +
              '<option value="top"' + (wp.labelPos === 'top' ? ' selected' : '') + '>' + wt('des.comp.aboveBox', 'Above the box') + '</option>' +
              '<option value="hidden"' + (wp.labelPos === 'hidden' ? ' selected' : '') + '>' + wt('des.comp.hiddenPlaceholderOnly', 'Hidden (placeholder only)') + '</option>' +
            '</select></div>' +
        '</div>';

      Array.prototype.forEach.call(layoutBar.querySelectorAll('[data-lb]'), function (sel: any) {
        sel.addEventListener('change', function () {
          var key = sel.getAttribute('data-lb');
          if (key === 'preset') {
            wp.preset = sel.value;
            if (wp.preset === 'address' && !wp.addressScheme) wp.addressScheme = 'us';
            wp.orient = (wp.preset === 'address' ? 'both' : 'horizontal');
            parts = presetParts(wp);            // adopt the new preset's parts
            openRows = {};
            commit(); renderAll();
          } else if (key === 'scheme') {
            wp.addressScheme = sel.value;
            parts = presetParts(wp);
            openRows = {};
            commit(); renderAll();
          } else if (key === 'nav') {
            wp.nav = sel.value; B.state.isDirty = true; try { B.callModule('canvas', 'render'); } catch (_e) {}
          } else if (key === 'orient') {
            wp.orient = sel.value; B.state.isDirty = true; try { B.callModule('canvas', 'render'); } catch (_e) {}
          } else if (key === 'labelPos') {
            wp.labelPos = sel.value; B.state.isDirty = true; renderPreview(); try { B.callModule('canvas', 'render'); } catch (_e) {}
          }
        });
      });
    }

    // ── Parts pane ────────────────────────────────────────────────────────────
    function renderParts() {
      paneParts.innerHTML = '';

      var toolbar = document.createElement('div');
      toolbar.className = 'mf-comp-des-toolbar';
      toolbar.innerHTML =
        '<button type="button" class="mf-builder-btn mf-comp-des-add"><i class="fas fa-plus"></i> ' + wt('des.comp.addPart', 'Add Part') + '</button>' +
        '<button type="button" class="mf-builder-btn mf-comp-des-reset" title="' + wt('des.comp.resetTitle', 'Discard customisations, reload the preset/scheme defaults') + '"><i class="fas fa-undo"></i> ' + wt('des.comp.resetToPreset', 'Reset to preset') + '</button>' +
        '<span class="mf-comp-des-toolbar-hint">' + wt('des.comp.toolbarHint', 'Drag-free reorder with the arrows. Hidden parts stay in the config but never render.') + '</span>';
      paneParts.appendChild(toolbar);

      var list = document.createElement('div');
      list.className = 'mf-comp-des-list';
      paneParts.appendChild(list);

      toolbar.querySelector('.mf-comp-des-add')!.addEventListener('click', function () {
        var k = uniqueKey(parts, 'field');
        parts.push({ key: k, label: wt('des.comp.newField', 'New Field'), sublabel: '', placeholder: '', type: 'text', width: '1/2', required: false });
        openRows[parts.length - 1] = true;
        commit(); renderParts(); refreshCount();
      });
      toolbar.querySelector('.mf-comp-des-reset')!.addEventListener('click', function () {
        parts = presetParts(wp);
        openRows = {};
        delete wp.parts;            // back to renderer-authoritative preset
        B.state.isDirty = true; try { B.callModule('canvas', 'render'); } catch (_e) {}
        renderParts(); refreshCount();
      });

      if (!parts.length) {
        var empty = document.createElement('div');
        empty.className = 'mf-token-designer-empty';
        empty.innerHTML = '<i class="fas fa-circle-info"></i> ' + wt('des.comp.emptyPre', 'No parts. Click') + ' <strong>' + wt('des.comp.addPart', 'Add Part') + '</strong> ' + wt('des.comp.emptyPost', 'to create the first sub-input.');
        list.appendChild(empty);
        return;
      }

      parts.forEach(function (p: any, idx: number) {
        list.appendChild(renderPartRow(p, idx));
      });
    }

    function renderPartRow(p: any, idx: number): HTMLElement {
      var row = document.createElement('div');
      row.className = 'mf-comp-des-part' + (p.hidden ? ' is-hidden' : '');
      var isSel = p.type === 'select';
      var isOpen = !!openRows[idx];

      row.innerHTML =
        '<div class="mf-comp-des-part-head">' +
          '<span class="mf-comp-des-grip"><i class="fas fa-grip-vertical"></i></span>' +
          '<span class="mf-comp-des-part-name">' + esc(partTitle(p)) + '</span>' +
          '<span class="mf-comp-des-pill mf-comp-des-pill-type">' + esc(p.type || 'text') + '</span>' +
          '<span class="mf-comp-des-pill mf-comp-des-pill-w">' + esc(widthLabelOf(p)) + '</span>' +
          '<button type="button" class="mf-comp-des-badge ' + (p.required ? 'is-on' : '') + '" data-act="req" title="' + wt('des.comp.toggleRequired', 'Toggle required') + '">' +
            '<i class="fas ' + (p.required ? 'fa-check' : 'fa-circle') + '"></i> ' + wt('des.comp.required', 'Required') + '</button>' +
          '<button type="button" class="mf-comp-des-icon" data-act="vis" title="' + (p.hidden ? wt('des.comp.show', 'Show') : wt('des.comp.hide', 'Hide')) + '"><i class="fas ' + (p.hidden ? 'fa-eye-slash' : 'fa-eye') + '"></i></button>' +
          '<span class="mf-comp-des-move">' +
            '<button type="button" class="mf-comp-des-icon" data-act="up" ' + (idx === 0 ? 'disabled' : '') + ' title="' + wt('des.comp.moveUp', 'Move up') + '"><i class="fas fa-chevron-up"></i></button>' +
            '<button type="button" class="mf-comp-des-icon" data-act="down" ' + (idx === parts.length - 1 ? 'disabled' : '') + ' title="' + wt('des.comp.moveDown', 'Move down') + '"><i class="fas fa-chevron-down"></i></button>' +
          '</span>' +
          '<button type="button" class="mf-comp-des-icon ' + (isOpen ? 'is-on' : '') + '" data-act="gear" title="' + wt('des.comp.configure', 'Configure') + '"><i class="fas fa-sliders-h"></i></button>' +
          '<button type="button" class="mf-comp-des-icon mf-comp-des-del" data-act="del" title="' + wt('des.comp.remove', 'Remove') + '"><i class="fas fa-trash"></i></button>' +
        '</div>' +
        (isOpen ? renderPartBody(p, idx) : '');

      // header actions
      function rerenderRow() {
        var fresh = renderPartRow(p, idx);
        row.parentNode!.replaceChild(fresh, row);
      }
      row.querySelector('[data-act="req"]')!.addEventListener('click', function () { p.required = !p.required; commit(); rerenderRow(); });
      row.querySelector('[data-act="vis"]')!.addEventListener('click', function () { p.hidden = !p.hidden; if (!p.hidden) delete p.hidden; commit(); rerenderRow(); });
      var upB = row.querySelector('[data-act="up"]') as HTMLButtonElement; if (upB) upB.addEventListener('click', function () { if (idx > 0) { var t = parts[idx - 1]; parts[idx - 1] = parts[idx]; parts[idx] = t; openRows = {}; commit(); renderParts(); } });
      var dnB = row.querySelector('[data-act="down"]') as HTMLButtonElement; if (dnB) dnB.addEventListener('click', function () { if (idx < parts.length - 1) { var t = parts[idx + 1]; parts[idx + 1] = parts[idx]; parts[idx] = t; openRows = {}; commit(); renderParts(); } });
      row.querySelector('[data-act="gear"]')!.addEventListener('click', function () { openRows[idx] = !openRows[idx]; rerenderRow(); });
      row.querySelector('[data-act="del"]')!.addEventListener('click', function () {
        parts.splice(idx, 1); openRows = {}; commit(); renderParts(); refreshCount();
      });

      if (isOpen) bindPartBody(row, p, idx, rerenderRow);
      return row;
    }

    function renderPartBody(p: any, idx: number): string {
      var isSel = p.type === 'select';
      var wv = widthValueOf(p);
      var typeOpts = FIELD_TYPES.map(function (t) { return '<option value="' + t + '"' + (p.type === t || (!p.type && t === 'text') ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>'; }).join('');
      var widthOpts = WIDTHS.map(function (w) { return '<option value="' + w.value + '"' + (wv === w.value ? ' selected' : '') + '>' + w.label + '</option>'; }).join('');
      var optsTxt = isSel && Array.isArray(p.options) ? p.options.map(function (o: any) { return (o.value != null ? o.value : o) + (o && o.label ? (' | ' + o.label) : ''); }).join('\n') : '';

      return '<div class="mf-comp-des-part-body">' +
        '<div class="mf-comp-des-grid">' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.labelA11y', 'Label (a11y)') + '</label><input class="mf-comp-des-in" data-f="label" value="' + escA(p.label || '') + '" placeholder="' + escA(wt('des.comp.phFirstName', 'First Name')) + '"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.sublabelHint', 'Sub-label (hint)') + '</label><input class="mf-comp-des-in" data-f="sublabel" value="' + escA(p.sublabel || '') + '" placeholder="' + escA(wt('des.comp.phFirst', 'First')) + '"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.keyFieldName', 'Key (field name)') + '</label><input class="mf-comp-des-in" data-f="key" value="' + escA(p.key || '') + '" placeholder="' + escA(wt('des.comp.phFirstLower', 'first')) + '"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.placeholder', 'Placeholder') + '</label><input class="mf-comp-des-in" data-f="placeholder" value="' + escA(p.placeholder || '') + '" placeholder="' + escA(wt('des.comp.phTypeHere', 'Type here…')) + '"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.type', 'Type') + '</label><select class="mf-comp-des-in" data-f="type">' + typeOpts + '</select></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.columnWidth', 'Column width') + '</label><select class="mf-comp-des-in" data-f="width">' + widthOpts + '</select></div>' +
          '<div class="mf-comp-des-fld" data-custom-width style="display:' + (wv === 'custom' ? '' : 'none') + ';"><label>' + wt('des.comp.customWidth', 'Custom width') + '</label><input class="mf-comp-des-in" data-f="widthRaw" value="' + escA(wv === 'custom' ? (p.width || '') : '') + '" placeholder="' + escA(wt('des.comp.phCustomWidth', '96px or 30%')) + '"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.defaultValue', 'Default value') + '</label><input class="mf-comp-des-in" data-f="def" value="' + escA(p.def || '') + '" placeholder="' + escA(wt('des.comp.phOptional', '(optional)')) + '"></div>' +
        '</div>' +
        '<div class="mf-comp-des-sub-title">' + wt('des.comp.validation', 'Validation') + '</div>' +
        '<div class="mf-comp-des-grid">' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.minLength', 'Min length') + '</label><input class="mf-comp-des-in" type="number" min="0" data-f="minLength" value="' + (p.minLength != null ? p.minLength : '') + '" placeholder="—"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.maxLength', 'Max length') + '</label><input class="mf-comp-des-in" type="number" min="0" data-f="maxLength" value="' + (p.maxLength != null ? p.maxLength : '') + '" placeholder="—"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.regexPattern', 'Regex pattern') + '</label><input class="mf-comp-des-in" data-f="pattern" value="' + escA(p.pattern || '') + '" placeholder="^[A-Za-z]+$"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.patternMessage', 'Pattern message') + '</label><input class="mf-comp-des-in" data-f="patternMsg" value="' + escA(p.patternMsg || '') + '" placeholder="' + escA(wt('des.comp.phLettersOnly', 'Letters only')) + '"></div>' +
        '</div>' +
        '<div class="mf-comp-des-grid">' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.mask', 'Mask') + ' <span class="mf-comp-des-hint">' + wt('des.comp.maskHint', '(# digit, A letter, * alnum)') + '</span></label><input class="mf-comp-des-in" data-f="mask" value="' + escA(p.mask || '') + '" placeholder="###-##-####"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.inputModeLabel', 'Input mode') + '</label><input class="mf-comp-des-in" data-f="inputMode" value="' + escA(p.inputMode || '') + '" placeholder="numeric / tel"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.minValue', 'Min value') + '</label><input class="mf-comp-des-in" type="number" data-f="min" value="' + (p.min != null ? p.min : '') + '" placeholder="—"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.maxValue', 'Max value') + '</label><input class="mf-comp-des-in" type="number" data-f="max" value="' + (p.max != null ? p.max : '') + '" placeholder="—"></div>' +
        '</div>' +
        '<div class="mf-comp-des-sub-title">' + wt('des.comp.crossPartMatch', 'Cross-part match') + '</div>' +
        '<div class="mf-comp-des-grid">' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.matchSiblingKey', 'Match sibling key') + '</label><input class="mf-comp-des-in" data-f="matchKey" value="' + escA(p.matchKey || '') + '" placeholder="' + escA(wt('des.comp.phEgEmail', 'e.g. email')) + '"></div>' +
          '<div class="mf-comp-des-fld"><label>' + wt('des.comp.mismatchMessage', 'Mismatch message') + '</label><input class="mf-comp-des-in" data-f="matchMsg" value="' + escA(p.matchMsg || '') + '" placeholder="' + escA(wt('des.comp.phDoesNotMatch', 'Does not match')) + '"></div>' +
        '</div>' +
        (isSel
          ? '<div class="mf-comp-des-sub-title">' + wt('des.comp.options', 'Options') + ' <span class="mf-comp-des-hint">' + wt('des.comp.optionsHint', 'one per line:') + ' <code>value | Label</code></span></div>' +
            '<textarea class="mf-comp-des-in mf-comp-des-opts" data-f="options" rows="4" placeholder="' + escA(wt('des.comp.optionsPlaceholder', 'us | United States\nca | Canada')) + '">' + esc(optsTxt) + '</textarea>'
          : '') +
        '</div>';
    }

    function bindPartBody(row: HTMLElement, p: any, idx: number, rerenderRow: () => void) {
      var body = row.querySelector('.mf-comp-des-part-body') as HTMLElement;
      if (!body) return;
      function get(f: string) { return body.querySelector('[data-f="' + f + '"]') as any; }

      var headFields = ['label', 'sublabel', 'key', 'type', 'width', 'required'];
      function applyAndMaybeRerenderHead(touchedHead: boolean) {
        commit();
        if (touchedHead) rerenderRow();    // header pills/title depend on these
      }

      // Text-ish fields commit live; key is slugified.
      ['label', 'sublabel', 'placeholder', 'def', 'pattern', 'patternMsg'].forEach(function (f) {
        var el = get(f); if (!el) return;
        el.addEventListener('input', function () { p[f] = el.value || ''; if (!p[f]) delete p[f]; if (f === 'label' || f === 'sublabel') { commit(); var nm = row.querySelector('.mf-comp-des-part-name'); if (nm) nm.textContent = partTitle(p); } else commit(); });
      });
      var keyEl = get('key');
      if (keyEl) keyEl.addEventListener('input', function () {
        var v = String(keyEl.value || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
        keyEl.value = v; p.key = v; commit();
        var nm = row.querySelector('.mf-comp-des-part-name'); if (nm) nm.textContent = partTitle(p);
      });

      ['minLength', 'maxLength'].forEach(function (f) {
        var el = get(f); if (!el) return;
        el.addEventListener('input', function () { var n = parseInt(el.value, 10); if (el.value === '' || isNaN(n) || n <= 0) delete p[f]; else p[f] = n; commit(); });
      });

      // [Composite v1.4] mask / inputMode / numeric bounds / cross-part match
      ['mask', 'inputMode', 'matchKey', 'matchMsg'].forEach(function (f) {
        var el = get(f); if (!el) return;
        el.addEventListener('input', function () { var v = String(el.value || '').trim(); if (v) p[f] = v; else delete p[f]; commit(); });
      });
      ['min', 'max'].forEach(function (f) {
        var el = get(f); if (!el) return;
        el.addEventListener('input', function () { var n = parseFloat(el.value); if (el.value === '' || isNaN(n)) delete p[f]; else p[f] = n; commit(); });
      });

      var typeEl = get('type');
      if (typeEl) typeEl.addEventListener('change', function () {
        p.type = typeEl.value;
        if (p.type === 'select') { if (!Array.isArray(p.options) || !p.options.length) p.options = [{ value: 'option_1', label: 'Option 1' }, { value: 'option_2', label: 'Option 2' }]; }
        else { delete p.options; }
        if (p.type === 'text') delete p.type;     // text is the implicit default
        openRows[idx] = true; commit(); rerenderRow();
      });

      var widthEl = get('width');
      if (widthEl) widthEl.addEventListener('change', function () {
        var v = widthEl.value;
        var customWrap = body.querySelector('[data-custom-width]') as HTMLElement;
        if (v === 'auto') { p.flex = 1; delete p.width; if (customWrap) customWrap.style.display = 'none'; }
        else if (v === 'custom') { delete p.flex; if (customWrap) customWrap.style.display = ''; if (!p.width || Object.prototype.hasOwnProperty.call(FRACTIONS, String(p.width))) p.width = ''; }
        else { delete p.flex; p.width = v; if (customWrap) customWrap.style.display = 'none'; }
        commit();
        var pill = row.querySelector('.mf-comp-des-pill-w'); if (pill) pill.textContent = widthLabelOf(p);
      });
      var widthRawEl = get('widthRaw');
      if (widthRawEl) widthRawEl.addEventListener('input', function () { delete p.flex; p.width = String(widthRawEl.value || '').trim(); commit(); var pill = row.querySelector('.mf-comp-des-pill-w'); if (pill) pill.textContent = widthLabelOf(p); });

      var optsEl = get('options');
      if (optsEl) optsEl.addEventListener('input', function () {
        var raw = String(optsEl.value || '');
        p.options = raw.split('\n').map(function (l: string) { return l.trim(); }).filter(Boolean).map(function (l: string) {
          var seg = l.split('|'); var v = (seg[0] || '').trim(); var lab = (seg[1] || '').trim();
          return lab ? { value: v, label: lab } : { value: v };
        });
        commit();
      });
    }

    // ── Live preview (mirrors runtime markup + classes) ─────────────────────────
    function renderPreview() {
      var vis = parts.filter(function (p: any) { return !p.hidden; });
      var groups: any = {}; var order: number[] = [];
      vis.forEach(function (p: any) { var r = (p.row == null ? 0 : p.row); if (!groups[r]) { groups[r] = []; order.push(r); } groups[r].push(p); });

      function cell(p: any): string {
        var ctrl;
        var st = 'width:100%;min-width:0;';
        if (p.type === 'country') {
          ctrl = '<button type="button" class="mf-input" style="' + st + 'text-align:left;">🇺🇸</button>'; // [B268] flag-only compact trigger
        } else if (p.type === 'select') {
          var opts = (Array.isArray(p.options) ? p.options : []).map(function (o: any) { var ov = o && o.value != null ? o.value : o; var ol = o && o.label != null ? o.label : ov; return '<option value="' + escA(ov) + '">' + esc(ol) + '</option>'; }).join('');
          ctrl = '<select class="mf-input" style="' + st + '">' + opts + '</select>';
        } else if (p.type === 'textarea') {
          ctrl = '<textarea class="mf-input" rows="2" style="' + st + '" placeholder="' + escA(p.placeholder || '') + '"></textarea>';
        } else {
          ctrl = '<input type="' + inputType(p.type || 'text') + '" class="mf-input" style="' + st + '" placeholder="' + escA(p.placeholder || '') + '" value="' + escA(p.def || '') + '">';
        }
        var lp = String(wp.labelPos || 'bottom');
        // [BUG3 fix 20260701] Mirror the runtime: fall back to the accessible label when a part has
        // no explicit sublabel, so the 'Full Name' (name) preset shows First/Last labels above the
        // box under labelPos='top' (was: empty sublabel => no label rendered for either part).
        var subTxt = (p.sublabel != null && String(p.sublabel) !== '') ? String(p.sublabel) : (lp !== 'hidden' ? compositePartLabel(p) : '');
        var sub = (lp !== 'hidden' && (subTxt || p.required)) ? '<small class="mf-composite-sub mf-composite-sub--' + (lp === 'top' ? 'top' : 'bottom') + '">' + esc(subTxt) + (p.required ? ' <span class="mf-composite-req">*</span>' : '') + '</small>' : '';
        var sepHtml = p.sep ? '<span class="mf-composite-sep" aria-hidden="true" style="align-self:flex-start;display:flex;align-items:center;height:38px;padding:0 2px;color:#64748b;font-weight:700;">' + esc(String(p.sep)) + '</span>' : '';
        var inner = lp === 'top' ? (sub + ctrl) : (ctrl + sub);
        return '<div class="mf-composite-cell" style="' + cellStyle(p) + '">' + inner + '</div>' + sepHtml;
      }

      var rows = order.map(function (r) { return '<div class="mf-composite-row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;">' + groups[r].map(cell).join('') + '</div>'; }).join('');
      panePreview.innerHTML =
        '<div class="mf-comp-des-preview-wrap">' +
          '<p class="mf-comp-des-preview-cap">' + wt('des.comp.livePreviewCaption', 'LIVE PREVIEW') + '</p>' +
          '<div class="mf-comp-des-preview-card">' +
            '<label class="mf-comp-des-preview-label">' + esc(field.label || wt('des.comp.compositeField', 'Composite Field')) + (field.required ? ' <span class="mf-composite-req">*</span>' : '') + '</label>' +
            '<div class="mf-composite" style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">' + (rows || '<em style="color:#94a3b8;font-size:13px;">' + wt('des.comp.allPartsHidden', 'All parts hidden.') + '</em>') + '</div>' +
          '</div>' +
          '<p class="mf-comp-des-preview-note"><i class="fas fa-info-circle"></i> ' + wt('des.comp.submittedNoteA', 'Submitted as one combined value via a hidden') + ' <code>' + esc(field.key || 'field') + '</code> ' + wt('des.comp.submittedNoteB', 'input.') + '</p>' +
        '</div>';
    }

    // [Composite Designer v20260616] Re-render the Live Preview too, so changing Preset /
    // Address-format instantly reshapes the preview below (not just the Parts list).
    function renderAll() { renderLayoutBar(); renderParts(); refreshCount(); renderPreview(); }
    renderAll();
  }

  (window as any).MFCompositeDesigner = { open: open };
})();
