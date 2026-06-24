import { MegaFormBuilder } from './core';

(function () {
  'use strict';

  var B = MegaFormBuilder;
  var bound = false;

  function ensureSettings(): any {
    if (!B.state.schema.settings) B.state.schema.settings = {};
    var s = B.state.schema.settings as any;
    if (!s.customUrl) s.customUrl = {};
    if (!s.googleAnalytics) s.googleAnalytics = {};
    var cu = s.customUrl;
    if (cu.Enabled == null && cu.enabled == null) cu.enabled = false;
    cu.url = cu.url || cu.Url || '';
    cu.method = cu.method || cu.Method || 'POST';
    if (cu.IncludeMetadata == null && cu.includeMetadata == null) cu.includeMetadata = true;
    if (!cu.headers || typeof cu.headers !== 'object') cu.headers = {};

    var ga = s.googleAnalytics;
    if (ga.Enabled == null && ga.enabled == null) ga.enabled = false;
    ga.trackingId = ga.trackingId || ga.TrackingId || '';
    ga.eventCategory = ga.eventCategory || ga.EventCategory || 'Form';
    ga.eventAction = ga.eventAction || ga.EventAction || 'Submit';
    ga.eventLabel = ga.eventLabel || ga.EventLabel || '';
    if (ga.eventValue == null && ga.EventValue == null) ga.eventValue = 0;
    return s;
  }

  function getEl(id: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
    return document.getElementById(id) as any;
  }

  function val(id: string, fallback?: string): string {
    var el = getEl(id);
    return el ? (el.value || '') : (fallback || '');
  }

  function checked(id: string, fallback?: boolean): boolean {
    var el = document.getElementById(id) as HTMLInputElement | null;
    return el ? !!el.checked : !!fallback;
  }

  function setText(id: string, value: any): void {
    var el = getEl(id);
    if (el) el.value = value == null ? '' : String(value);
  }

  function setCheck(id: string, value: any): void {
    var el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.checked = !!value;
  }

  function setSelect(id: string, value: any): void {
    var el = getEl(id) as HTMLSelectElement | null;
    if (el) el.value = value == null ? '' : String(value);
  }

  function readFromUi(): void {
    var s = ensureSettings();
    s.customUrl.enabled = checked('mf-setting-customurl-on', false);
    s.customUrl.url = val('mf-setting-customurl-url');
    s.customUrl.method = val('mf-setting-customurl-method', 'POST');
    s.customUrl.includeMetadata = checked('mf-setting-customurl-meta', true);

    s.googleAnalytics.enabled = checked('mf-setting-ga-on', false);
    s.googleAnalytics.trackingId = val('mf-setting-ga-trackingid');
    s.googleAnalytics.eventCategory = val('mf-setting-ga-category', 'Form');
    s.googleAnalytics.eventAction = val('mf-setting-ga-action', 'Submit');
    s.googleAnalytics.eventLabel = val('mf-setting-ga-label');
    s.googleAnalytics.eventValue = Math.max(0, parseInt(val('mf-setting-ga-value', '0'), 10) || 0);
    B.state.isDirty = true;
  }

  function syncFromSchema(): void {
    ensureSettings();
    var s = B.state.schema.settings as any;
    var cu = s.customUrl || {};
    setCheck('mf-setting-customurl-on', cu.enabled !== false && cu.Enabled !== false ? !!cu.enabled || !!cu.Enabled : false);
    setText('mf-setting-customurl-url', cu.url || cu.Url || '');
    setSelect('mf-setting-customurl-method', cu.method || cu.Method || 'POST');
    setCheck('mf-setting-customurl-meta', cu.includeMetadata !== false && cu.IncludeMetadata !== false);

    var ga = s.googleAnalytics || {};
    setCheck('mf-setting-ga-on', ga.enabled !== false && ga.Enabled !== false ? !!ga.enabled || !!ga.Enabled : false);
    setText('mf-setting-ga-trackingid', ga.trackingId || ga.TrackingId || '');
    setText('mf-setting-ga-category', ga.eventCategory || ga.EventCategory || 'Form');
    setText('mf-setting-ga-action', ga.eventAction || ga.EventAction || 'Submit');
    setText('mf-setting-ga-label', ga.eventLabel || ga.EventLabel || '');
    setText('mf-setting-ga-value', ga.eventValue == null && ga.EventValue == null ? 0 : (ga.eventValue || ga.EventValue || 0));
  }

  function bindUi(): void {
    if (bound) return;
    bound = true;

    [
      'mf-setting-customurl-url', 'mf-setting-customurl-method',
      'mf-setting-ga-trackingid', 'mf-setting-ga-category', 'mf-setting-ga-action',
      'mf-setting-ga-label', 'mf-setting-ga-value'
    ].forEach(function (id) {
      var el = getEl(id);
      if (el) el.addEventListener('input', readFromUi);
    });

    [
      'mf-setting-customurl-on', 'mf-setting-customurl-meta', 'mf-setting-ga-on'
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', readFromUi);
    });

    ['mf-setting-customurl-method'].forEach(function (id) {
      var el = getEl(id);
      if (el) el.addEventListener('change', readFromUi);
    });
  }

  B.registerModule('integration-settings', {
    init: function () {
      bindUi();
      syncFromSchema();
    },
    syncFromSchema: syncFromSchema,
    readFromUi: readFromUi
  });
})();

export {};