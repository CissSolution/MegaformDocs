import { buildLayoutPanelControl, canHandleLayoutPanelProp } from './inspector-panels-layout';
import { buildMediaPanelControl, canHandleMediaPanelProp } from './inspector-panels-media';
import { buildContentPanelControl, canHandleContentPanelProp } from './inspector-panels-content';
import { buildDivPanelControl, canHandleDivPanelProp, getDivPanelBadge } from './inspector-panels-div';
import { getStructureClass, getStructureLabel, MFI_SELECTION_EVENT } from './inspector-structure-shared';

/**
 * MegaForm Theme Inspector v5
 *
 * ROOT CAUSE FIX: iframe has pointer-events:auto → outer document mousemove never fires.
 * SOLUTION: set frame.style.pointerEvents='none' on activate, restore on deactivate.
 *           Then outer document receives all mousemove events.
 *           Use elementFromPoint(x,y) with translated coords to detect iframe elements.
 *
 * Modes:
 *   🟣 PURPLE = mf/mfp class element → CSS Var controls
 *   🩵 TEAL   = any inner element    → Live computed CSS → !important override
 */
(function () {
  'use strict';

  var INSPECTOR_BUILD_MARKER = 'TI 14-07';

  var OUTER_DIV_SELECTOR_BADGE = 'Sel 14-07';
  var OUTER_DIV_LIVE_BADGE = 'Live 14-07';

  var MF_ROOTS = new Set([
    'mfp','mfp-page','mf-form-wrapper','mfp-card','mfp-card-header','mfp-card-body',
    'mfp-hero','mfp-hero-overlay','mfp-section','mfp-section-title','mfp-body',
    'mfp-actions','mfp-rdf','mf-form','mf-form-inner','mf-form-title','mf-form-description',
    'mf-section-break','mf-section-title','mf-html-block',
    'mf-field-group','mf-fields-container','mf-row','mf-field-label',
    'mf-field-sublabel','mf-field-help','mf-field-error','mf-required',
    'mf-input','mf-select','mf-textarea','mf-option-item','mf-option-group',
    'mf-file-dropzone','mf-btn-submit','mf-btn-prev','mf-btn-next','mf-btn',
    'mf-form-actions','mf-progress-bar','mf-loading','mf-success-message',
    'mf-error-message','mf-ref-number',
  ]);

  var LIVE_PROPS = [
    { prop:'color',               label:'Text Color',          type:'color' },
    { prop:'background-color',    label:'Background',          type:'color' },
    { prop:'background-image',    label:'BG Image',            type:'text' },
    { prop:'background-repeat',   label:'BG Repeat',           type:'sel',   o:['repeat','no-repeat','repeat-x','repeat-y','round','space'] },
    { prop:'background-size',     label:'BG Size',             type:'text' },
    { prop:'background-position', label:'BG Position',         type:'text' },
    { prop:'font-size',           label:'Font Size',           type:'range', min:8,   max:96,  u:'px' },
    { prop:'font-weight',         label:'Font Weight',         type:'sel',   o:['100','200','300','400','500','600','700','800','900'] },
    { prop:'font-family',         label:'Font Family',         type:'font' },
    { prop:'font-style',          label:'Font Style',          type:'sel',   o:['normal','italic','oblique'] },
    { prop:'text-transform',      label:'Text Transform',      type:'sel',   o:['none','uppercase','lowercase','capitalize'] },
    { prop:'text-align',          label:'Text Align',          type:'sel',   o:['left','center','right','justify'] },
    { prop:'letter-spacing',      label:'Letter Spacing',      type:'range', min:-5,  max:20,  s:0.5, u:'px' },
    { prop:'line-height',         label:'Line Height',         type:'range', min:0.8, max:4,   s:0.05,u:'' },
    { prop:'border-radius',       label:'Corner Radius',       type:'range', min:0,   max:64,  u:'px' },
    { prop:'padding-top',         label:'Padding Top',         type:'range', min:0,   max:96,  u:'px' },
    { prop:'padding-right',       label:'Padding Right',       type:'range', min:0,   max:96,  u:'px' },
    { prop:'padding-bottom',      label:'Padding Bottom',      type:'range', min:0,   max:96,  u:'px' },
    { prop:'padding-left',        label:'Padding Left',        type:'range', min:0,   max:96,  u:'px' },
    { prop:'gap',                 label:'Gap',                 type:'range', min:0,   max:64,  u:'px' },
    { prop:'row-gap',             label:'Row Gap',             type:'range', min:0,   max:96,  u:'px' },
    { prop:'column-gap',          label:'Column Gap',          type:'range', min:0,   max:96,  u:'px' },
    { prop:'margin-bottom',       label:'Bottom Gap',          type:'range', min:0,   max:96,  u:'px' },
    { prop:'padding',             label:'Padding',             type:'text' },
    { prop:'margin',              label:'Margin',              type:'text' },
    { prop:'opacity',             label:'Opacity',             type:'range', min:0,   max:1,   s:0.05,u:'' },
    { prop:'border',              label:'Border',              type:'text' },
    { prop:'box-shadow',          label:'Box Shadow',          type:'text' },
    { prop:'width',               label:'Width',               type:'text' },
    { prop:'height',              label:'Height',              type:'text' },
  ];

  var FONTS = ['Inter','Roboto','Open Sans','Lato','Poppins','Montserrat','Nunito',
               'DM Sans','Source Serif Pro','Playfair Display','Merriweather',
               'JetBrains Mono','Fira Code','Space Grotesk','Plus Jakarta Sans'];

  var state = { active:false, pinned:false, lastEl:null, selectedEl:null, cssVars:{}, overrides:{}, selectedSelector:'', importedCss:'', _seeded: false };
  var mfiCounter = 0;
  function dbg(){
    try { console.log.apply(console, ['[MFI]'].concat([].slice.call(arguments))); } catch(e) {}
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function getMfCls(el) {
    if (!el || !el.classList) return null;
    for (var c of el.classList) { if (MF_ROOTS.has(c)) return c; }
    return null;
  }
  function isInsideMf(el) {
    for (var n = el; n && n.tagName !== 'BODY'; n = n.parentElement) {
      if (getMfCls(n)) return true;
    }
    return false;
  }
  function getNearestMfAnc(el) {
    for (var n = el; n && n.tagName !== 'BODY'; n = n.parentElement) {
      var c = getMfCls(n); if (c) return { el:n, cls:c };
    }
    return null;
  }
  function ensureId(el) {
    if (!el.dataset.mfiId) el.dataset.mfiId = String(++mfiCounter);
    return el.dataset.mfiId;
  }

  function getNodeId(el) {
    try { return el && el.getAttribute ? (el.getAttribute('data-mfi-node-id') || '') : ''; } catch(e) { return ''; }
  }

  function getTemplatePath(el) {
    try {
      for (var n = el; n && n.tagName !== 'BODY'; n = n.parentElement) {
        var path = n && n.getAttribute ? (n.getAttribute('data-mfi-template-path') || '') : '';
        if (path) return path;
      }
    } catch(e) {}
    return '';
  }

  function getTemplateNode(el) {
    try {
      for (var n = el; n && n.tagName !== 'BODY'; n = n.parentElement) {
        if (n && n.getAttribute && n.getAttribute('data-mfi-template-path')) return n;
      }
    } catch(e) {}
    return null;
  }

  function dispatchSelection(el, isLive) {
    try {
      if (!el) return;
      document.dispatchEvent(new CustomEvent(MFI_SELECTION_EVENT, {
        detail: {
          nodeId: getNodeId(el),
          templatePath: getTemplatePath(el),
          selector: String(state.selectedSelector || ''),
          label: getStructureLabel(el),
          isLive: !!isLive,
          tagName: el.tagName ? el.tagName.toLowerCase() : '',
          className: getStructureClass(el) || (el.classList && el.classList[0]) || '',
        }
      }));
    } catch(e) {}
  }

  /**
   * Build a CSS selector that targets ONLY this specific element instance,
   * not all elements with the same tag/class.
   *
   * Strategy (in order of preference):
   * 1. Element has its own id  → use #id (most specific, zero ambiguity)
   * 2. Element has data-mfi-id → use [data-mfi-id="N"] (assigned by us)
   * 3. Walk up to nearest MegaForm ancestor and build nth-child path
   *    e.g.  .mf-field-group:nth-child(3) > .mf-field-label
   *
   * This prevents background-image set on one .mf-field-label leaking to
   * ALL .mf-field-label elements in the form.
   */
  function uniqueSelector(el, doc) {
    if (!el) return '';
    if (el.id && !el.id.startsWith('mfi-') && !el.id.startsWith('mf-form-') && !/^mf-[a-z]+-\d+$/.test(el.id)) {
      return '#' + CSS.escape(el.id);
    }

    var wrapper = null;
    try {
      wrapper = doc ? (doc.querySelector('[id^="mf-form-wrapper"]') || doc.querySelector('.mf-form-wrapper')) : null;
    } catch (e) { wrapper = null; }
    if (!wrapper) {
      var cls0 = el.classList && el.classList[0] ? ('.' + el.classList[0]) : '';
      return el.tagName.toLowerCase() + cls0;
    }

    if (el === wrapper) return '[id^="mf-form-wrapper"], .mf-form-wrapper';

    var segments = [];
    var node = el;
    while (node && node !== wrapper && node !== doc.body) {
      var tag = node.tagName.toLowerCase();
      var preferredClass = getMfCls(node) || getStructureClass(node) || (node.classList && node.classList[0]) || '';
      var clsPart = preferredClass ? ('.' + preferredClass) : '';
      var parent = node.parentElement;
      var nthPart = '';
      if (parent && parent !== doc.body) {
        var sameTagSiblings = Array.prototype.filter.call(parent.children || [], function(c) {
          return c && c.tagName === node.tagName;
        });
        if (sameTagSiblings.length > 1) {
          var idx = sameTagSiblings.indexOf(node);
          nthPart = idx >= 0 ? ':nth-of-type(' + (idx + 1) + ')' : '';
        }
      }
      segments.unshift(tag + clsPart + nthPart);
      node = parent;
    }

    if (!segments.length) return '[id^="mf-form-wrapper"], .mf-form-wrapper';
    var joined = segments.join(' > ');
    return '[id^="mf-form-wrapper"] > ' + joined + ', .mf-form-wrapper > ' + joined;
  }
  function parseN(v) { return parseFloat((v||'0').replace(/[^0-9.-]/g,'')) || 0; }
  function rgb2hex(v) {
    var m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return '';
    return '#' + ((1<<24)|(+m[1]<<16)|(+m[2]<<8)|+m[3]).toString(16).slice(1).toUpperCase();
  }
  function toHex(v) {
    v = (v||'').trim();
    if (v.startsWith('#')) return v.substring(0,7);
    if (v.startsWith('rgb')) { var h = rgb2hex(v); return h||'#888888'; }
    return '#888888';
  }

  function extractBgUrl(v) {
    v = String(v || '').trim();
    if (!v || v === 'none') return '';
    var m = v.match(/url\((['"]?)(.*?)\1\)/i);
    return m && m[2] ? m[2] : '';
  }
  function buildBgImageValue(url) {
    url = String(url || '').trim();
    if (!url) return 'none';
    return 'url("' + url.replace(/"/g, '\\"') + '")';
  }
  function getCS(el, prop, doc) {
    try { return doc.defaultView.getComputedStyle(el).getPropertyValue(prop).trim(); }
    catch(e) { return ''; }
  }
  function rootAwareSelector(baseSel) {
    baseSel = String(baseSel || '').trim();
    if (!baseSel) return '';
    if (baseSel.indexOf('[id^="mf-form-wrapper"]') === 0 || baseSel.indexOf('.mf-form-wrapper') === 0) return baseSel;
    var parts = baseSel.split(',').map(function(part) { return String(part || '').trim(); }).filter(Boolean);
    if (!parts.length) return '';
    return parts.map(function(part) {
      return '[id^="mf-form-wrapper"] ' + part + ', .mf-form-wrapper ' + part;
    }).join(', ');
  }

  function prefersCustomCssMode(el, isLiveHint) {
    if (!el || !el.tagName) return !!isLiveHint;
    if (isLiveHint) return true;
    var tag = String(el.tagName || '').toUpperCase();
    if (tag !== 'DIV') return false;
    if (getTemplatePath(el)) return true;
    if (getMfCls(el)) return true;
    return isInsideMf(el);
  }

  // ── Apply live !important override via persistent CSS selector ──────
  function renderOverrideCss() {
    return Object.entries(state.overrides).map(function(e) {
      var selector = String(e[0] || '').trim();
      if (!selector) return '';
      var decl = Object.entries(e[1] || {}).map(function(kv) {
        return kv[0] + ':' + kv[1] + ' !important';
      }).join(';');
      return selector + '{' + decl + '}';
    }).filter(Boolean).join('\n');
  }

  function exportCustomCss() {
    return renderOverrideCss();
  }

  function clearTransientStyles(doc) {
    if (!doc || !doc.head) return;
    try {
      var live = doc.getElementById('mfi-lo');
      if (live) live.textContent = '';
      var varsStyle = doc.getElementById('td-live-overrides');
      if (varsStyle) varsStyle.textContent = '';
    } catch (e) { dbg('clearTransientStyles error', e); }
  }

  function importCustomCss(cssText, doc) {
    try {
      var text = String(cssText || '').trim();
      state.importedCss = text;
      state._seeded = false; // TDInspectorSeed: reset so next action re-seeds from new base
      dbg('importCustomCss stored raw css', text.length, 'live selectors=', Object.keys(state.overrides || {}).length);
    } catch(e) { dbg('importCustomCss error', e); }
  }

  function commitBaseCss(cssText, doc) {
    try {
      state.importedCss = String(cssText || '').trim();
      state.overrides = {};
      state.cssVars = {};
      clearTransientStyles(doc);
      dbg('commitBaseCss stored raw css', state.importedCss.length, 'live selectors=', Object.keys(state.overrides || {}).length);
    } catch (e) { dbg('commitBaseCss error', e); }
  }


  // TDInspectorSeed v20260413-05: Populate state.overrides from prior-session inspector CSS
  // baked into currentBaseCss. TD exposes getInitialInspectorOverrides() which parses the
  // inspector block back into {selector:{prop:val}} so this session's state.overrides starts
  // with all previously saved overrides. Handles any number of inspector instances (DNN
  // loads the same script with different cdv= cache params — both instances self-seed).
  function seedFromTD() {
    if (state._seeded) return;
    state._seeded = true;
    try {
      var td = window.MFThemeDesigner;
      if (!td || typeof td.getInitialInspectorOverrides !== 'function') return;
      var io = td.getInitialInspectorOverrides();
      if (!io || typeof io !== 'object') return;
      Object.keys(io).forEach(function(sel) {
        if (!state.overrides[sel]) state.overrides[sel] = {};
        var props = io[sel];
        if (props && typeof props === 'object') {
          Object.assign(state.overrides[sel], props);
        }
      });
      dbg('seedFromTD seeded selectors=', Object.keys(state.overrides).length);
    } catch(e) { dbg('seedFromTD error', e); }
  }

  function applyOverride(selector, doc, prop, val) {
    seedFromTD(); // ensure prior-session overrides are loaded before accumulating
    selector = String(selector || '').trim();
    if (!selector) return;
    if (!state.overrides[selector]) state.overrides[selector] = {};
    state.overrides[selector][prop] = val;
    var matches = [];
    var computed = '';
    try {
      matches = Array.prototype.slice.call(doc.querySelectorAll(selector));
      if (matches[0]) computed = getCS(matches[0], prop, doc);
    } catch (e) { dbg('applyOverride match error', e); }
    dbg('applyOverride', selector, prop, val, 'matches=', matches.length, 'computed=', computed, 'cssLen=', renderOverrideCss().length, 'ownerOk=', true);
    var td = window.MFThemeDesigner;
    if (td && typeof td.applyStyleOverride === 'function') td.applyStyleOverride(selector, prop, val, exportCustomCss());
  }

  function removeOverride(selector, doc, prop) {
    seedFromTD(); // ensure prior-session overrides are loaded before removing
    selector = String(selector || '').trim();
    if (!selector) return;
    if (state.overrides[selector] && Object.prototype.hasOwnProperty.call(state.overrides[selector], prop)) {
      delete state.overrides[selector][prop];
      if (!Object.keys(state.overrides[selector]).length) delete state.overrides[selector];
    }
    dbg('removeOverride', selector, prop, 'cssLen=', renderOverrideCss().length);
    var td = window.MFThemeDesigner;
    if (td && typeof td.applyStyleOverride === 'function') td.applyStyleOverride(selector, prop, '', exportCustomCss());
  }

  // ── Apply CSS var to root ────────────────────────────────────────────
  function applyCssVar(name, val, doc) {
    state.cssVars[name] = val;
    dbg('applyCssVar', name, val);
    var td = window.MFThemeDesigner;
    if (td && typeof td.applyCssVar === 'function') {
      td.applyCssVar(name, val);
      return;
    }
    try {
      var s = doc.getElementById('td-live-overrides');
      if (!s) { s = doc.createElement('style'); s.id='td-live-overrides'; doc.head.appendChild(s); }
      var e = Object.entries(state.cssVars).map(function(kv){ return kv[0]+':'+kv[1]; }).join(';');
      s.textContent = ':root{'+e+'}[id^="mf-form-wrapper"]{'+e+'}.mf-form-wrapper{'+e+'}.mfp{'+e+'}';
      var w = doc.querySelector('[id^="mf-form-wrapper"]')||doc.querySelector('.mf-form-wrapper')||doc.querySelector('.mfp');
      if (w) w.style.setProperty(name, val);
    } catch(e) { dbg('applyCssVar fallback error', e); }
  }


  // ── Read CSS vars ────────────────────────────────────────────────────
  function readVars(doc) {
    var vars = {};
    try {
      Array.from(doc.styleSheets).forEach(function(ss) {
        try { Array.from(ss.cssRules).forEach(function(r) {
          if (!r.selectorText) return;
          if (!r.selectorText.includes(':root') && !r.selectorText.includes('mf-form-wrapper')) return;
          // Use getPropertyValue (not cssText regex) to correctly read values with commas
          // e.g. rgba(0, 0, 0, 0.1) and linear-gradient(...)
          for (var j = 0; j < r.style.length; j++) {
            var prop = r.style[j];
            if (prop && prop.startsWith('--mf')) {
              vars[prop] = r.style.getPropertyValue(prop).trim();
            }
          }
        }); } catch(e) {}
      });
      var ovr = doc.getElementById('td-live-overrides');
      if (ovr) (ovr.textContent.match(/--mf[\w-]*:\s*[^;]+/g)||[]).forEach(function(m) {
        var i = m.indexOf(':'); vars[m.substring(0,i).trim()] = m.substring(i+1).trim();
      });
    } catch(e) {}
    return vars;
  }

  // ── Build control widget ─────────────────────────────────────────────

  function buildCtrl(el, doc, cfg) {
    var val = getCS(el, cfg.prop, doc);
    var isDiv = !!(el && el.tagName && String(el.tagName).toUpperCase() === 'DIV');

    function onChange(nv) { applyOverride(state.selectedSelector, doc, cfg.prop, nv); }
    var ctx = {
      FONTS: FONTS,
      toHex: toHex,
      extractBgUrl: extractBgUrl,
      buildBgImageValue: buildBgImageValue,
      removeOverride: function(prop) { removeOverride(state.selectedSelector, doc, prop); }
    };

    if (isDiv && canHandleDivPanelProp(cfg.prop)) {
      return buildDivPanelControl(cfg, val, onChange, ctx);
    }

    if (!val) return null;
    if (canHandleMediaPanelProp(cfg.prop)) {
      return buildMediaPanelControl(cfg, val, onChange, ctx);
    }
    if (canHandleContentPanelProp(cfg.prop)) {
      return buildContentPanelControl(cfg, val, onChange, ctx);
    }
    if (canHandleLayoutPanelProp(cfg.prop)) {
      return buildLayoutPanelControl(cfg, val, onChange, ctx);
    }
    return null;
  }

  // ── Overlay in iframe ────────────────────────────────────────────────
  function ensureOverlay(doc) {
    if (doc.getElementById('mfi-ov')) return;
    var ov=doc.createElement('div'); ov.id='mfi-ov';
    ov.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483000;display:none;border-radius:3px;';
    doc.body.appendChild(ov);
    var tt=doc.createElement('div'); tt.id='mfi-tt';
    tt.style.cssText = 'position:fixed;z-index:2147483001;pointer-events:none;display:none;border-radius:5px;font-size:11px;font-weight:600;padding:4px 10px;white-space:nowrap;font-family:Inter,system-ui,sans-serif;box-shadow:0 3px 10px rgba(0,0,0,.4);';
    doc.body.appendChild(tt);
    var sb=doc.createElement('div'); sb.id='mfi-sb';
    sb.style.cssText = 'position:fixed;z-index:2147483001;pointer-events:none;display:none;font-size:10px;font-family:monospace;padding:2px 8px;border-radius:0 0 5px 5px;color:#fff;';
    doc.body.appendChild(sb);
  }

  function updateOverlay(el, doc, isLive) {
    var ov=doc.getElementById('mfi-ov'), tt=doc.getElementById('mfi-tt'), sb=doc.getElementById('mfi-sb');
    if (!ov||!tt||!sb) return;
    var r = el.getBoundingClientRect();
    var color = isLive ? '#0891b2' : '#7c3aed';
    var bg    = isLive ? 'rgba(8,145,178,0.07)' : 'rgba(109,40,217,0.07)';
    ov.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483000;border:2px solid '+color+';background:'+bg
      +';border-radius:3px;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;display:block;';
    var ttBg = isLive ? '#164e63' : '#1e1b4b', ttTop = Math.max(4, r.top-30);
    var lbl = getStructureLabel(el);
    tt.style.cssText = 'position:fixed;z-index:2147483001;pointer-events:none;background:'+ttBg
      +';color:#e0f7ff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:5px;white-space:nowrap;'
      +'font-family:Inter,system-ui,sans-serif;box-shadow:0 3px 10px rgba(0,0,0,.4);left:'+r.left+'px;top:'+ttTop+'px;display:block;';
    tt.textContent = lbl;
    sb.style.cssText = 'position:fixed;z-index:2147483001;pointer-events:none;background:'+color
      +';color:#fff;font-size:10px;font-family:monospace;padding:2px 8px;border-radius:0 0 5px 5px;'
      +'white-space:nowrap;left:'+r.left+'px;top:'+r.top+'px;display:block;';
    sb.textContent = '.'+lbl;
  }

  function hideOv(doc) {
    try { ['mfi-ov','mfi-tt','mfi-sb'].forEach(function(id){ var e=doc.getElementById(id); if(e)e.style.display='none'; }); }
    catch(e) {}
  }


  function renderSelectionPanel(el, doc, forceSelect, options) {
    var panel = document.getElementById('mfi-panel');
    if (!panel) return;
    if (state.pinned && !forceSelect) return;
    if (el === state.lastEl && !forceSelect && !options) return;
    state.lastEl = el;

    var tag = el.tagName.toLowerCase();
    var customCssMode = options && options.forceCustomCssMode ? true : prefersCustomCssMode(el, false);
    var label = (options && options.label) || (customCssMode ? getStructureLabel(el) : ('.' + (getMfCls(el) || 'node')));
    var icon  = (options && options.icon) || ({h1:'🔤',h2:'🔤',h3:'📌',h4:'📌',p:'📝',span:'📝',div:'📦',img:'🖼',a:'🔗',button:'🔘',input:'✏️',label:'🏷',i:'✨',strong:'💪',em:'📋'}[tag]||'🔲');
    var sel = (options && options.selector) || '';
    if (!sel) {
      if (customCssMode) {
        sel = uniqueSelector(el, doc);
      } else {
        var mfCls = getMfCls(el);
        var cls0  = Array.from(el.classList)[0];
        var mfTarget = mfCls || getStructureClass(el) || cls0 || '';
        var baseSel = mfTarget ? (tag + '.' + mfTarget) : tag;
        sel = rootAwareSelector(baseSel);
      }
    }

    var badge = customCssMode ? '<span class="mfi-badge-live">Live CSS</span>' : '<span class="mfi-badge-var">CSS Vars</span>';
    var divBadge = (options && options.badge)
      ? '<span class="mfi-badge-build">' + options.badge + '</span>'
      : (tag === 'div' ? '<span class="mfi-badge-build">'+getDivPanelBadge()+'</span>' : '');
    var hint  = (options && options.hint) || (customCssMode ? ('saved CSS • ' + OUTER_DIV_SELECTOR_BADGE + ' • ' + OUTER_DIV_LIVE_BADGE) : 'css vars');
    state.selectedSelector = sel;
    dispatchSelection(el, customCssMode);

    panel.innerHTML =
      '<div class="mfi-ph"><span class="mfi-pi">'+icon+'</span><span class="mfi-pt">'+label+'</span>'+badge+divBadge+
      '<button class="mfi-pin" id="mfi-pin-btn">📌</button>'+
      '<button class="mfi-cls" id="mfi-cls-btn">✕</button></div>'+
      '<div class="mfi-selector-box"><code class="mfi-selector">'+sel.substring(0,120)+'</code>'+
      '<span class="mfi-selector-hint">'+hint+'</span></div>'+
      '<div class="mfi-ctrls" id="mfi-ctrls"></div>'+
      ((tag === 'div' && !(options && options.badge)) ? '<div class="mfi-build-foot">'+getDivPanelBadge()+' • div panel active</div>' : '');

    document.getElementById('mfi-cls-btn').onclick = function() { state.pinned=false; state.selectedEl=null; hidePanel(); deactivate(); };
    document.getElementById('mfi-pin-btn').onclick = function() {
      state.pinned = !state.pinned;
      if (!state.pinned) state.selectedEl = null;
      document.getElementById('mfi-pin-btn').classList.toggle('pinned', state.pinned);
    };

    var ctrls = panel.querySelector('#mfi-ctrls');
    var any = false;
    LIVE_PROPS.forEach(function(cfg) {
      var c = buildCtrl(el, doc, cfg);
      if (c) { ctrls.appendChild(c); any = true; }
    });
    if (!any) ctrls.innerHTML = '<div class="mfi-empty">No visual CSS found. Try a parent element.</div>';

    var pinBtn = document.getElementById('mfi-pin-btn');
    if (pinBtn) pinBtn.classList.toggle('pinned', state.pinned);
    panel.style.display = 'block';
    var sc=document.querySelector('.td-right-scroll'), tb=document.querySelector('.td-right-tabs');
    if(sc) sc.style.display='none'; if(tb) tb.style.opacity='0.3';
  }

  function showSharedSelectorPanel(el, doc, options, forceSelect) {
    renderSelectionPanel(el, doc, forceSelect, {
      selector: rootAwareSelector(String(options && options.selector || '')),
      label: String(options && options.label || getStructureLabel(el)),
      icon: String(options && options.icon || '🎛️'),
      hint: String(options && options.hint || 'all matching controls in this form'),
      badge: String(options && options.badge || ''),
      forceCustomCssMode: true,
    });
  }

  // ── Show inspector panel ─────────────────────────────────────────────
  function showPanel(el, doc, isLive, forceSelect) {
    renderSelectionPanel(el, doc, forceSelect, null);
  }

  function hidePanel() {
    var p = document.getElementById('mfi-panel');
    if (p) p.style.display = 'none';
    var sc=document.querySelector('.td-right-scroll'), tb=document.querySelector('.td-right-tabs');
    if(sc) sc.style.display=''; if(tb) tb.style.opacity='';
  }

  // ── KEY FIX: disable iframe pointer-events so outer mousemove fires ──
  function disableFramePE() {
    var f = document.getElementById('td-preview-frame');
    if (f) { f._mfiOrigPE = f.style.pointerEvents; f.style.pointerEvents = 'none'; }
  }
  function restoreFramePE() {
    var f = document.getElementById('td-preview-frame');
    if (f) f.style.pointerEvents = f._mfiOrigPE || '';
  }

  // ── Main mouse tracking on outer document ────────────────────────────
  function startTracking() {
    if (document._mfiML) return;
    document._mfiML = function(e) {
      if (!state.active) return;
      if (state.pinned && state.selectedEl) return;
      var frame = document.getElementById('td-preview-frame');
      if (!frame) return;
      var fb = frame.getBoundingClientRect();
      var x = e.clientX - fb.left, y = e.clientY - fb.top;
      try {
        var doc = frame.contentDocument || frame.contentWindow.document;
        if (!doc || !doc.body) return;
        ensureOverlay(doc);
        if (x<0||y<0||x>fb.width||y>fb.height) { hideOv(doc); return; }
        var el = doc.elementFromPoint(x, y);
        if (!el) { hideOv(doc); return; }
        var templateNode = getTemplateNode(el);
        if (templateNode) el = templateNode;
        var mfCls   = getMfCls(el);
        var inside  = !mfCls && (templateNode ? true : isInsideMf(el));
        if (!mfCls && !inside) { hideOv(doc); return; }
        var isLive = !mfCls && inside;
        updateOverlay(el, doc, isLive);
        showPanel(el, doc, isLive);
      } catch(err) {}
    };
    document.addEventListener('mousemove', document._mfiML, true);

    // Click to pin
    document._mfiCL = function(e) {
      if (!state.active) return;
      var frame = document.getElementById('td-preview-frame');
      if (!frame) return;
      var fb = frame.getBoundingClientRect();
      var x = e.clientX-fb.left, y = e.clientY-fb.top;
      if (x<0||y<0||x>fb.width||y>fb.height) return;
      try {
        var doc = frame.contentDocument || frame.contentWindow.document;
        if (!doc || !doc.body) return;
        ensureOverlay(doc);
        var el = doc.elementFromPoint(x, y);
        if (!el) { hideOv(doc); return; }
        var templateNode = getTemplateNode(el);
        if (templateNode) el = templateNode;
        var mfCls = getMfCls(el);
        var inside = !mfCls && (templateNode ? true : isInsideMf(el));
        if (!mfCls && !inside) { hideOv(doc); return; }
        var isLive = !mfCls && inside;
        e.preventDefault();
        e.stopPropagation();
        state.pinned = true;
        state.selectedEl = el;
        state.lastEl = null;
        updateOverlay(el, doc, isLive);
        showPanel(el, doc, isLive, true);
      } catch(err) {}
    };
    document.addEventListener('click', document._mfiCL, true);
  }

  function stopTracking() {
    if (document._mfiML) { document.removeEventListener('mousemove', document._mfiML, true); document._mfiML = null; }
    if (document._mfiCL) { document.removeEventListener('click', document._mfiCL, true); document._mfiCL = null; }
  }

  function focusElement(el, doc, pin) {
    if (!el || !doc) return false;
    ensureOverlay(doc);
    var templateNode = getTemplateNode(el);
    if (templateNode) el = templateNode;
    var mfCls = getMfCls(el);
    var inside = !mfCls && (templateNode ? true : isInsideMf(el));
    if (!mfCls && !inside) return false;
    var isLive = !mfCls && inside;
    state.pinned = pin !== false;
    state.selectedEl = el;
    state.lastEl = null;
    updateOverlay(el, doc, isLive);
    showPanel(el, doc, isLive, true);
    return true;
  }

  function focusNodeById(nodeId) {
    try {
      var frame = document.getElementById('td-preview-frame');
      if (!frame) return false;
      var doc = frame.contentDocument || frame.contentWindow.document;
      if (!doc) return false;
      var safe = String(nodeId || '').replace(/"/g, '\"');
      var el = doc.querySelector('[data-mfi-node-id="' + safe + '"]');
      if (!el) return false;
      return focusElement(el, doc, true);
    } catch(err) { return false; }
  }

  function focusTemplatePath(templatePath) {
    try {
      var frame = document.getElementById('td-preview-frame');
      if (!frame) return false;
      var doc = frame.contentDocument || frame.contentWindow.document;
      if (!doc) return false;
      var safe = String(templatePath || '').replace(/\"/g, '\\"');
      var el = doc.querySelector('[data-mfi-template-path="' + safe + '"]');
      if (!el) return false;
      return focusElement(el, doc, true);
    } catch(err) { return false; }
  }

  // ── Activate / Deactivate ────────────────────────────────────────────
  function activate() {
    state.active = true; state.pinned = false; state.lastEl = null; state.selectedEl = null;
    disableFramePE();   // ← THE FIX
    startTracking();
    try { ensureOverlay(document.getElementById('td-preview-frame').contentDocument); } catch(e){}
    updateToggleBtn(true);
  }

  function deactivate() {
    state.active = false; state.pinned = false; state.lastEl = null; state.selectedEl = null;
    stopTracking();
    restoreFramePE();   // ← restore pointer-events
    try { hideOv(document.getElementById('td-preview-frame').contentDocument); } catch(e){}
    hidePanel();
    updateToggleBtn(false);
  }

  function updateToggleBtn(on) {
    var btn = document.getElementById('mfi-toggle');
    if (!btn) return;
    btn.classList.toggle('on', on);
    btn.innerHTML = on ? '<i class="fas fa-crosshairs"></i> Inspecting...' : '<i class="fas fa-crosshairs"></i> Inspect';
  }

  // ── Wire existing right-panel controls ───────────────────────────────
  function parseFontSelectValue(fontValue) {
    var raw = String(fontValue || '').trim();
    if (!raw) return '';
    var first = raw.split(',')[0] || raw;
    return first.replace(/^['\"]+|['\"]+$/g, '').trim();
  }

  function wireControls() {
    function getCurrentDoc() {
      var frame = document.getElementById('td-preview-frame');
      return frame ? (frame.contentDocument || frame.contentWindow.document) : null;
    }

    var doc = getCurrentDoc();
    var vars = doc ? readVars(doc) : {};
    try {
      var td = window.MFThemeDesigner;
      if (doc && td && typeof td.getCustomCss === 'function') importCustomCss(td.getCustomCss(), doc);
    } catch(e) {}

    document.querySelectorAll('.td-slider[data-var]').forEach(function(sl) {
      var vn=sl.dataset.var, u=sl.dataset.unit||'', row=sl.closest('.td-sld-row'), vEl=row&&row.querySelector('.td-sld-val'), cur=vars[vn];
      if (cur) { var n=parseFloat(cur); if(!isNaN(n)){sl.value=String(n);if(vEl)vEl.textContent=cur;} }
      if (sl._mfiW) return;
      sl._mfiW = true;
      sl.addEventListener('input', function(e) {
        var liveDoc = getCurrentDoc();
        var v=e.target.value+u;
        if(vEl)vEl.textContent=v;
        if(liveDoc)applyCssVar(vn,v,liveDoc);
      });
    });
    document.querySelectorAll('.td-var-select[data-var]').forEach(function(sel) {
      var vn=sel.dataset.var, cur=vars[vn];
      if(cur)sel.value=cur;
      if (sel._mfiW) return;
      sel._mfiW=true;
      sel.addEventListener('change', function(e) {
        var liveDoc = getCurrentDoc();
        if(liveDoc)applyCssVar(vn,e.target.value,liveDoc);
      });
    });
    document.querySelectorAll('.td-clr-row[data-var]').forEach(function(row) {
      var vn=row.dataset.var, ci=row.querySelector('input[type="color"]'), sp=row.querySelector('span'), cur=vars[vn];
      if (cur&&cur.startsWith('#')&&ci){ci.value=cur.substring(0,7);if(sp)sp.textContent=cur.substring(0,7);}
      if (row._mfiW) return;
      row._mfiW=true;
      if (ci) ci.addEventListener('input', function(e) {
        var liveDoc = getCurrentDoc();
        if(sp)sp.textContent=e.target.value;
        if(liveDoc)applyCssVar(vn,e.target.value,liveDoc);
      });
    });
    document.querySelectorAll('.td-effect-toggle').forEach(function(tog) {
      var vn=tog.dataset.var, cur=vars[vn];
      if (cur) tog.checked=(cur!=='none'&&cur!==tog.dataset.off);
      if (tog._mfiW) return;
      tog._mfiW=true;
      tog.addEventListener('change', function(e) {
        var liveDoc = getCurrentDoc();
        if(liveDoc)applyCssVar(vn,e.target.checked?e.target.dataset.on:e.target.dataset.off,liveDoc);
      });
    });
    var fs = document.getElementById('td-font-select');
    if (fs) {
      var currentFont = parseFontSelectValue(vars['--mf-font-family']);
      if (currentFont) fs.value = currentFont;
      if (!fs._mfiW) {
        fs._mfiW=true;
        fs.addEventListener('change', function(e) {
          var liveDoc = getCurrentDoc();
          if(liveDoc)applyCssVar('--mf-font-family',"'"+e.target.value+"', system-ui, sans-serif",liveDoc);
        });
      }
    }
  }

  // ── Styles ───────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('mfi-css')) return;
    var s = document.createElement('style'); s.id = 'mfi-css';
    s.textContent = [
      '#mfi-panel{display:none;position:absolute;inset:0;z-index:50;background:#fff;overflow-y:auto;padding:0}',
      '#mfi-panel::-webkit-scrollbar{width:4px}#mfi-panel::-webkit-scrollbar-thumb{background:#d4d4d8;border-radius:2px}',
      '.mfi-ph{display:flex;align-items:flex-start;flex-wrap:wrap;gap:6px;padding:9px 12px;position:sticky;top:0;z-index:5;background:linear-gradient(135deg,#ede9fe,#ddd6fe);border-bottom:1px solid #c4b5fd}',
      '.mfi-pi{font-size:16px;flex-shrink:0}',
      '.mfi-pt{font-size:12px;font-weight:700;color:#4c1d95;flex:1 1 120px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.mfi-badge-var,.mfi-badge-live{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#fff;padding:2px 7px;border-radius:99px;flex-shrink:0;max-width:100%;white-space:nowrap}',
      '.mfi-badge-var{background:#7c3aed}.mfi-badge-live{background:#0891b2}.mfi-badge-build{font-size:9px;font-weight:700;letter-spacing:.02em;color:#0f172a;background:#fde68a;padding:2px 7px;border-radius:99px;flex-shrink:0;max-width:100%;white-space:nowrap}',
      '.mfi-pin,.mfi-cls{border:none;background:rgba(124,58,237,.1);color:#a78bfa;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}',
      '.mfi-pin.pinned{background:#7c3aed;color:#fff}.mfi-cls:hover{background:#ef4444;color:#fff}',
      '.mfi-bg-preview{height:88px;border-radius:10px;border:1px solid #dbe1ef;background:#0f172a center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px;margin:8px 0 10px}.mfi-bg-preview-empty{background-image:none!important;background:#f8fafc}.mfi-bg-url-wrap{margin-bottom:8px}.mfi-bg-actions{display:flex;gap:8px;flex-wrap:wrap}.mfi-bg-actions button,.mfi-bg-clear{border:1px solid #dbe1ef;background:#fff;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:600;color:#334155;cursor:pointer}.mfi-bg-actions button:hover,.mfi-bg-clear:hover{border-color:#c7d2fe;color:#4338ca}.mfi-bg-clear{padding:6px 10px}',
      '.mfi-selector-box{display:block;padding:6px 12px;background:#f5f3ff;border-bottom:1px solid #ede9fe;overflow:hidden}',
      '.mfi-selector{display:block;font-size:10px;font-family:monospace;color:#7c3aed;font-weight:600;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.35}.mfi-selector-hint{display:block;margin-top:4px;font-size:9px;color:#a78bfa;white-space:normal;overflow-wrap:anywhere;word-break:break-word}',
      '.mfi-ctrls{padding:8px;display:flex;flex-direction:column;gap:6px}',
      '.mfi-ctrl{background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px;transition:border-color .12s,box-shadow .12s}',
      '.mfi-ctrl:hover{border-color:#a78bfa;box-shadow:0 0 0 2px rgba(167,139,250,.1)}',
      '.mfi-row{display:flex;align-items:center;justify-content:space-between;gap:6px}',
      '.mfi-lbl{font-size:11px;font-weight:500;color:#52525b;flex:1;white-space:nowrap}',
      '.mfi-orig{font-size:9px;color:#94a3b8;margin-top:3px}.mfi-orig code{font-family:monospace;font-size:9px}',
      '.mfi-empty{padding:16px;text-align:center;color:#94a3b8;font-size:12px}',
      '.mfi-clr-wrap{display:flex;align-items:center;gap:5px;border:1px solid #e4e4e7;border-radius:6px;padding:2px 7px 2px 2px;background:#fff}.mfi-clr-wrap:hover{border-color:#a78bfa}',
      '.mfi-clr{width:22px;height:22px;border-radius:4px;border:none;padding:0;cursor:pointer;flex-shrink:0}',
      '.mfi-hex{font-size:10px;font-family:monospace;font-weight:700;color:#3f3f46;min-width:52px}',
      '.mfi-rv{font-size:11px;font-weight:700;color:#6d28d9;background:#ede9fe;padding:1px 8px;border-radius:4px;font-family:monospace;min-width:38px;text-align:center;flex-shrink:0}',
      '.mfi-range{width:100%;height:4px;border-radius:2px;margin-top:5px;-webkit-appearance:none;appearance:none;outline:none;cursor:pointer;background:linear-gradient(to right,#7c3aed,#ddd6fe)}',
      '.mfi-range::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#7c3aed;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25);cursor:pointer}',
      '.mfi-sel,.mfi-fsel{height:26px;border:1px solid #e4e4e7;border-radius:6px;padding:0 6px;font-size:11px;background:#fff;color:#09090b;outline:none;cursor:pointer;max-width:155px}',
      '.mfi-sel:focus,.mfi-fsel:focus{border-color:#7c3aed}',
      '.mfi-txt{height:26px;border:1px solid #e4e4e7;border-radius:6px;padding:0 8px;font-size:11px;background:#fff;color:#09090b;outline:none;font-family:monospace;flex:1;min-width:0;max-width:185px}',
      '.mfi-txt:focus{border-color:#7c3aed}',
      '.mfi-status{display:inline-flex;align-items:center;justify-content:center;min-width:52px;height:20px;padding:0 8px;border-radius:999px;background:#dcfce7;color:#166534;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.mfi-status.off{background:#e5e7eb;color:#6b7280}',
      '.mfi-mini-btn{border:1px solid #dbe1ef;background:#fff;border-radius:8px;padding:6px 9px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;white-space:nowrap}.mfi-mini-btn:hover{border-color:#c7d2fe;color:#4338ca}',
      '.mfi-div-color-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}',
      '.mfi-div-sel{max-width:none;flex:1;min-width:0}',
      '.mfi-ctrl-div{border-color:#fde68a;background:#fffbeb}',
      '.mfi-build-foot{padding:8px 12px 10px;border-top:1px solid #fde68a;background:#fffbeb;color:#92400e;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}',
      '#mfi-toggle{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 12px;border-radius:7px;border:1px solid #ddd6fe;background:#ede9fe;color:#6d28d9;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:inherit}',
      '#mfi-toggle.on{background:#7c3aed;border-color:#7c3aed;color:#fff}',
      '#mfi-toggle:hover:not(.on){background:#ddd6fe}#mfi-toggle.on:hover{background:#6d28d9}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function createPanel() {
    if (document.getElementById('mfi-panel')) return;
    var rp = document.getElementById('td-panel-right');
    if (!rp) return;
    rp.style.position = 'relative';
    var p = document.createElement('div'); p.id = 'mfi-panel'; rp.appendChild(p);
  }

  function createToggleBtn() {
    if (document.getElementById('mfi-toggle')) return;
    var topbar = document.querySelector('.td-preview-topbar-right');
    if (!topbar) return;
    var sep = document.createElement('span');
    sep.style.cssText = 'width:1px;height:14px;background:#e4e4e7;margin:0 4px;display:inline-block;flex-shrink:0;';
    topbar.insertBefore(sep, topbar.firstChild);
    var btn = document.createElement('button'); btn.id = 'mfi-toggle';
    btn.innerHTML = '<i class="fas fa-crosshairs"></i> Inspect';
    btn.title = 'Hover any element to inspect and edit its styles';
    topbar.insertBefore(btn, topbar.firstChild);
    btn.addEventListener('click', function() { state.active ? deactivate() : activate(); });
  }

  function reInjectIntoFrame(doc) {
    if (!doc || !doc.head) return;
    try {
      // After Refresh, the renderer injects mf-custom-css-* from schema.settings.customCss
      // which already contains the merged CSS set by setCustomCss() after Save.
      // No need to re-inject mfi-lo — just re-apply live CSS vars if any.
      if (Object.keys(state.cssVars || {}).length > 0) {
        var varsStyle = doc.getElementById('td-live-overrides');
        if (!varsStyle) { varsStyle = doc.createElement('style'); varsStyle.id = 'td-live-overrides'; doc.head.appendChild(varsStyle); }
        var decl = Object.entries(state.cssVars).map(function(kv){ return kv[0] + ':' + kv[1]; }).join(';');
        varsStyle.textContent = decl ? ':root{' + decl + '}[id^="mf-form-wrapper"]{' + decl + '}.mf-form-wrapper{' + decl + '}.mfp{' + decl + '}' : '';
      }
      dbg('reInjectIntoFrame cssVars=', Object.keys(state.cssVars || {}).length);
    } catch (e) { dbg('reInjectIntoFrame error', e); }
  }

  function watchIframeReload() {
    var frame = document.getElementById('td-preview-frame');
    if (!frame) return;
    frame.addEventListener('load', function() {
      dbg('frame reload');
      state.lastEl = null;
      if (state.active) {
        try { ensureOverlay(frame.contentDocument); } catch(e){}
        disableFramePE();
      }
      setTimeout(function(){
        try {
          var iDoc = frame.contentDocument || frame.contentWindow.document;
          reInjectIntoFrame(iDoc);
        } catch(e) { dbg('frame reload reinject error', e); }
      }, 120);
      setTimeout(wireControls, 300);
    });
  }


  function init() {
    try { window.__MF_THEME_INSPECTOR_BUILD = INSPECTOR_BUILD_MARKER; } catch (e) {}
    injectStyles(); createPanel(); createToggleBtn();
    wireControls(); watchIframeReload();
    document.querySelectorAll('.td-right-tab').forEach(function(t) {
      t.addEventListener('click', function() { setTimeout(wireControls, 150); });
    });
    console.log('[MFI v5] Inspector ready. pointer-events fix applied. build=' + INSPECTOR_BUILD_MARKER);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 300);

  window.__MFI = { activate, deactivate, state, applyCssVar, readVars, exportCustomCss: exportCustomCss, importCustomCss: importCustomCss, commitBaseCss: commitBaseCss, buildMarker: INSPECTOR_BUILD_MARKER, focusNodeById: focusNodeById, focusTemplatePath: focusTemplatePath, focusElement: function(el){ try { var frame = document.getElementById('td-preview-frame'); var doc = frame ? (frame.contentDocument || frame.contentWindow.document) : null; return focusElement(el, doc, true); } catch(err) { return false; } }, focusSharedSelector: function(options){ try { var frame = document.getElementById('td-preview-frame'); var doc = frame ? (frame.contentDocument || frame.contentWindow.document) : null; var sampleEl = options && options.sampleElement ? options.sampleElement : (doc && options && options.selector ? doc.querySelector(String(options.selector)) : null); if (!doc || !sampleEl) return false; state.selectedEl = sampleEl; ensureOverlay(doc); updateOverlay(sampleEl, doc, true); showSharedSelectorPanel(sampleEl, doc, options || {}, true); return true; } catch(err) { return false; } }, getSelectedNodeId: function(){ return getNodeId(state.selectedEl); }, getSelectedTemplatePath: function(){ return getTemplatePath(state.selectedEl); }, getSelectedSelector: function(){ return String(state.selectedSelector || ''); }, getThemePayload: function(){ return { cssVars: Object.assign({}, state.cssVars), customCss: exportCustomCss() }; } };
})();
