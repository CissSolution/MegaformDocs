/**
 * MegaForm Theme Inspector v4 — AUTO-DETECT MODE
 *
 * Core idea: NO hardcoded element maps or CSS var maps.
 * When hovering any element inside an mf/mfp container:
 *   1. Read getComputedStyle() for all visual properties
 *   2. Generate live controls showing real current values
 *   3. On change → assign data-mfi-id, inject !important CSS rule
 *   4. Works for ANY element: h1, h2, p, span, icon, input, etc.
 *
 * Two modes in one panel:
 *   MODE A (CSS Vars) — hover mf/mfp root containers → edit CSS vars
 *   MODE B (Live CSS)  — hover ANY child element   → edit computed styles directly
 */
(function () {
  'use strict';

  // ── Recognise MF root containers (for CSS var mode) ────────────────
  var MF_ROOTS = new Set([
    'mfp','mfp-page','mf-form-wrapper','mfp-card','mfp-card-header','mfp-card-body',
    'mf-std-page','mf-std-card','mf-std-accent-bar','mf-std-header','mf-std-title','mf-std-desc','mf-std-body','mf-std-footer',
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

  // CSS var map for root containers (kept from v3)
  var CSS_VAR_MAP = {
    'mfp':                { label:'Page Wrapper',    icon:'🌐', vars:['--mf-page-bg','--mf-font-family','--mf-font-size-base','--mf-color-text'] },
    'mfp-page':           { label:'Page Container',  icon:'📄', vars:['--mf-page-bg','--mf-font-family'] },
    'mf-form-wrapper':    { label:'Form Wrapper',    icon:'📄', vars:['--mf-page-bg','--mf-font-family','--mf-font-size-base','--mf-color-text','--mf-primary'] },
    'mfp-hero':           { label:'Hero Image',      icon:'🖼',  vars:['--mf-hero-height','--mf-hero-overlay-color','--mf-hero-overlay-opacity'] },
    'mfp-hero-overlay':   { label:'Hero Overlay',    icon:'🎨', vars:['--mf-hero-overlay-color','--mf-hero-overlay-opacity'] },
    'mfp-card':           { label:'Form Card',       icon:'🗂',  vars:['--mf-form-bg','--mf-form-radius','--mf-form-shadow','--mf-form-border'] },
    'mfp-card-header':    { label:'Card Header',     icon:'📋', vars:['--mf-form-bg','--mf-title-color','--mf-title-font-size','--mf-title-align'] },
    'mfp-card-body':      { label:'Card Body',       icon:'📝', vars:['--mf-form-bg','--mf-form-padding','--mf-field-gap'] },
    'mf-form':            { label:'Form Card',       icon:'🗂',  vars:['--mf-form-bg','--mf-form-shadow','--mf-form-radius','--mf-form-border','--mf-form-padding'] },
    'mfp-section':        { label:'mfp Section',     icon:'📦', vars:['--mf-section-bg','--mf-section-border-color','--mf-section-title-color','--mf-section-title-size'] },
    'mfp-section-title':  { label:'Section Title',   icon:'📌', vars:['--mf-section-title-color','--mf-section-title-size'] },
    'mf-section-break':   { label:'Section Divider', icon:'➖', vars:['--mf-section-border-color','--mf-section-bg','--mf-section-title-color'] },
    'mf-section-title':   { label:'Section Title',   icon:'📌', vars:['--mf-section-title-size','--mf-section-title-color'] },
    'mf-field-label':     { label:'Field Label',     icon:'🏷',  vars:['--mf-label-color','--mf-label-font-size','--mf-label-font-weight','--mf-label-margin-bottom'] },
    'mf-field-sublabel':  { label:'Sublabel',        icon:'💬', vars:['--mf-sublabel-font-size','--mf-sublabel-color'] },
    'mf-field-help':      { label:'Help Text',       icon:'💬', vars:['--mf-help-font-size','--mf-help-color'] },
    'mf-input':           { label:'Input Field',     icon:'✏️',  vars:['--mf-input-bg','--mf-input-color','--mf-input-border','--mf-input-radius','--mf-input-font-size','--mf-input-padding','--mf-input-focus-border'] },
    'mf-select':          { label:'Select',          icon:'🔽', vars:['--mf-input-bg','--mf-input-color','--mf-input-border','--mf-input-radius'] },
    'mf-textarea':        { label:'Textarea',        icon:'📃', vars:['--mf-input-bg','--mf-input-color','--mf-input-border','--mf-input-radius','--mf-input-font-size'] },
    'mf-option-item':     { label:'Checkbox/Radio',  icon:'☑️',  vars:['--mf-check-color','--mf-check-size','--mf-color-text'] },
    'mf-file-dropzone':   { label:'File Upload',     icon:'📁', vars:['--mf-file-bg','--mf-file-border','--mf-file-hover-bg'] },
    'mf-btn-submit':      { label:'Submit Button',   icon:'🔘', vars:['--mf-btn-bg','--mf-btn-color','--mf-btn-radius','--mf-btn-font-size','--mf-btn-font-weight','--mf-btn-shadow'] },
    'mf-btn-prev':        { label:'Prev Button',     icon:'◀️',  vars:['--mf-btn-radius','--mf-btn-bg','--mf-btn-color'] },
    'mf-btn-next':        { label:'Next Button',     icon:'▶️',  vars:['--mf-btn-radius','--mf-btn-bg','--mf-btn-color'] },
    'mf-progress-bar':    { label:'Progress Bar',    icon:'📊', vars:['--mf-progress-fill','--mf-progress-bg','--mf-progress-height'] },
    'mf-success-message': { label:'Success Message', icon:'✅', vars:['--mf-success-color','--mf-success-bg'] },
    'mf-error-message':   { label:'Error Alert',     icon:'❌', vars:['--mf-required-color','--mf-input-error-border'] },
  };

  // CSS var metadata (used by CSS var mode)
  var VAR_META = {
    '--mf-primary':             { t:'color', l:'Primary Color' },
    '--mf-page-bg':             { t:'color', l:'Page Background' },
    '--mf-form-bg':             { t:'color', l:'Form Background' },
    '--mf-form-radius':         { t:'range', l:'Form Radius',    min:0, max:40, u:'px' },
    '--mf-form-shadow':         { t:'text',  l:'Form Shadow' },
    '--mf-form-border':         { t:'text',  l:'Form Border' },
    '--mf-form-padding':        { t:'text',  l:'Form Padding' },
    '--mf-form-max-width':      { t:'text',  l:'Form Max Width' },
    '--mf-hero-height':         { t:'range', l:'Hero Height',    min:80, max:500, u:'px' },
    '--mf-hero-overlay-color':  { t:'color', l:'Hero Overlay Color' },
    '--mf-hero-overlay-opacity':{ t:'range', l:'Overlay Opacity', min:0, max:1, s:0.05, u:'' },
    '--mf-font-family':         { t:'font',  l:'Font Family' },
    '--mf-font-size-base':      { t:'range', l:'Base Font Size', min:12, max:22, u:'px' },
    '--mf-color-text':          { t:'color', l:'Body Text Color' },
    '--mf-color-text-muted':    { t:'color', l:'Muted Text Color' },
    '--mf-title-color':         { t:'color', l:'Title Color' },
    '--mf-title-font-size':     { t:'range', l:'Title Size',     min:14, max:60, u:'px' },
    '--mf-title-font-weight':   { t:'sel',   l:'Title Weight',   o:['400','500','600','700','800'] },
    '--mf-title-align':         { t:'sel',   l:'Title Align',    o:['left','center','right'] },
    '--mf-desc-font-size':      { t:'range', l:'Desc Size',      min:11, max:20, u:'px' },
    '--mf-desc-color':          { t:'color', l:'Desc Color' },
    '--mf-label-color':         { t:'color', l:'Label Color' },
    '--mf-label-font-size':     { t:'range', l:'Label Size',     min:10, max:18, u:'px' },
    '--mf-label-font-weight':   { t:'sel',   l:'Label Weight',   o:['400','500','600','700'] },
    '--mf-label-margin-bottom': { t:'range', l:'Label Gap',      min:2, max:20, u:'px' },
    '--mf-sublabel-color':      { t:'color', l:'Sublabel Color' },
    '--mf-sublabel-font-size':  { t:'range', l:'Sublabel Size',  min:10, max:16, u:'px' },
    '--mf-help-color':          { t:'color', l:'Help Color' },
    '--mf-help-font-size':      { t:'range', l:'Help Size',      min:10, max:16, u:'px' },
    '--mf-required-color':      { t:'color', l:'Required * Color' },
    '--mf-input-bg':            { t:'color', l:'Input Background' },
    '--mf-input-color':         { t:'color', l:'Input Text' },
    '--mf-input-border':        { t:'text',  l:'Input Border' },
    '--mf-input-radius':        { t:'range', l:'Input Radius',   min:0, max:24, u:'px' },
    '--mf-input-font-size':     { t:'range', l:'Input Font Size',min:11, max:20, u:'px' },
    '--mf-input-padding':       { t:'text',  l:'Input Padding' },
    '--mf-input-focus-border':  { t:'color', l:'Focus Border' },
    '--mf-check-color':         { t:'color', l:'Check Color' },
    '--mf-check-size':          { t:'range', l:'Check Size',     min:12, max:28, u:'px' },
    '--mf-section-bg':          { t:'color', l:'Section Background' },
    '--mf-section-border-color':{ t:'color', l:'Section Border' },
    '--mf-section-title-color': { t:'color', l:'Section Title Color' },
    '--mf-section-title-size':  { t:'range', l:'Section Title Size', min:11, max:28, u:'px' },
    '--mf-field-gap':           { t:'range', l:'Field Gap',      min:4, max:56, u:'px' },
    '--mf-file-bg':             { t:'color', l:'Dropzone BG' },
    '--mf-file-border':         { t:'color', l:'Dropzone Border' },
    '--mf-file-hover-bg':       { t:'color', l:'Dropzone Hover BG' },
    '--mf-btn-bg':              { t:'color', l:'Button BG' },
    '--mf-btn-bg-hover':        { t:'color', l:'Button BG Hover' },
    '--mf-btn-color':           { t:'color', l:'Button Text' },
    '--mf-btn-radius':          { t:'range', l:'Button Radius',  min:0, max:50, u:'px' },
    '--mf-btn-font-size':       { t:'range', l:'Button Font Size',min:12, max:20, u:'px' },
    '--mf-btn-font-weight':     { t:'sel',   l:'Button Weight',  o:['400','500','600','700'] },
    '--mf-btn-shadow':          { t:'text',  l:'Button Shadow' },
    '--mf-progress-fill':       { t:'color', l:'Progress Fill' },
    '--mf-progress-bg':         { t:'color', l:'Progress Track' },
    '--mf-progress-height':     { t:'range', l:'Progress Height',min:2, max:16, u:'px' },
    '--mf-success-color':       { t:'color', l:'Success Color' },
    '--mf-success-bg':          { t:'color', l:'Success BG' },
  };

  var FONTS = ['Inter','Roboto','Open Sans','Lato','Poppins','Montserrat','Nunito',
               'DM Sans','Source Serif Pro','Playfair Display','Merriweather',
               'JetBrains Mono','Fira Code','Space Grotesk','Plus Jakarta Sans'];

  // Visual CSS properties we care about for live mode
  var LIVE_PROPS = [
    { prop:'color',            label:'Text Color',      type:'color' },
    { prop:'background-color', label:'Background',      type:'color' },
    { prop:'font-size',        label:'Font Size',       type:'range', min:8, max:96, u:'px' },
    { prop:'font-weight',      label:'Font Weight',     type:'sel',   o:['100','200','300','400','500','600','700','800','900'] },
    { prop:'font-family',      label:'Font Family',     type:'font' },
    { prop:'font-style',       label:'Font Style',      type:'sel',   o:['normal','italic','oblique'] },
    { prop:'text-transform',   label:'Text Transform',  type:'sel',   o:['none','uppercase','lowercase','capitalize'] },
    { prop:'text-align',       label:'Text Align',      type:'sel',   o:['left','center','right','justify'] },
    { prop:'text-decoration',  label:'Decoration',      type:'sel',   o:['none','underline','line-through','overline'] },
    { prop:'letter-spacing',   label:'Letter Spacing',  type:'range', min:-5, max:20, s:0.5, u:'px' },
    { prop:'line-height',      label:'Line Height',     type:'range', min:0.8, max:4, s:0.05, u:'' },
    { prop:'border-radius',    label:'Border Radius',   type:'range', min:0, max:50, u:'px' },
    { prop:'padding',          label:'Padding',         type:'text' },
    { prop:'margin',           label:'Margin',          type:'text' },
    { prop:'opacity',          label:'Opacity',         type:'range', min:0, max:1, s:0.05, u:'' },
    { prop:'border',           label:'Border',          type:'text' },
    { prop:'box-shadow',       label:'Box Shadow',      type:'text' },
    { prop:'width',            label:'Width',           type:'text' },
    { prop:'height',           label:'Height',          type:'text' },
    { prop:'max-width',        label:'Max Width',       type:'text' },
    { prop:'display',          label:'Display',         type:'sel',   o:['block','flex','inline','inline-block','grid','none'] },
    { prop:'gap',              label:'Gap',             type:'range', min:0, max:80, u:'px' },
    { prop:'background-image', label:'BG Image',        type:'text' },
    { prop:'object-fit',       label:'Object Fit',      type:'sel',   o:['fill','contain','cover','none','scale-down'] },
  ];

  // ── State ─────────────────────────────────────────────────────────
  var state = {
    active: false,
    mode: 'auto',       // 'auto' = smart detect, 'cssvar' = force var mode, 'live' = force live
    pinned: false,
    lastEl: null,
    cssVars: {},        // current CSS var snapshot
    overrides: {},      // mfi-id → { prop: value } for live overrides
    nextId: 1,
  };

  // ── MF class detection ─────────────────────────────────────────────
  function getMfClass(el) {
    if (!el || !el.classList) return null;
    for (var c of el.classList) {
      if (MF_ROOTS.has(c)) return c;
    }
    return null;
  }

  function isInsideMf(el) {
    for (var n = el; n && n.tagName !== 'BODY'; n = n.parentElement) {
      if (getMfClass(n)) return true;
    }
    return false;
  }

  function getNearestMfAncestor(el) {
    for (var n = el; n && n.tagName !== 'BODY'; n = n.parentElement) {
      var c = getMfClass(n);
      if (c) return { el: n, cls: c };
    }
    return null;
  }

  // ── Generate unique CSS selector for live overrides ────────────────
  var mfiCounter = 0;
  function ensureMfiId(el) {
    if (!el.dataset.mfiId) {
      el.dataset.mfiId = String(++mfiCounter);
    }
    return el.dataset.mfiId;
  }

  function buildLiveSelector(el) {
    var id = ensureMfiId(el);
    return '[data-mfi-id="' + id + '"]';
  }

  // ── Apply live CSS override ─────────────────────────────────────────
  function getOverrideStyleEl(doc) {
    var s = doc.getElementById('mfi-live-overrides');
    if (!s) {
      s = doc.createElement('style');
      s.id = 'mfi-live-overrides';
      doc.head.appendChild(s);
    }
    return s;
  }

  function applyLiveProp(el, doc, prop, value) {
    var id = ensureMfiId(el);
    if (!state.overrides[id]) state.overrides[id] = {};
    state.overrides[id][prop] = value;

    // Build full override stylesheet
    var rules = Object.entries(state.overrides).map(function(entry) {
      var eid = entry[0], props = entry[1];
      var decl = Object.entries(props).map(function(kv) {
        return kv[0] + ':' + kv[1] + ' !important';
      }).join(';');
      return '[data-mfi-id="' + eid + '"]{' + decl + '}';
    }).join('\n');

    var s = getOverrideStyleEl(doc);
    s.textContent = rules;
  }

  // ── Apply CSS var override ─────────────────────────────────────────
  function applyCssVar(name, value, doc) {
    state.cssVars[name] = value;

    // Delegate to MFThemeDesigner if available
    var td = window.MFThemeDesigner;
    if (td && td.applyOverride) { td.applyOverride(name, value); return; }

    // Fallback
    var frame = document.getElementById('td-preview-frame');
    if (!frame) return;
    try {
      var s = doc.getElementById('td-live-overrides');
      if (!s) { s = doc.createElement('style'); s.id='td-live-overrides'; doc.head.appendChild(s); }
      var entries = Object.entries(state.cssVars).map(function(kv) { return kv[0]+':'+kv[1]; }).join(';');
      s.textContent = ':root{'+entries+'}.mf-form-wrapper{'+entries+'}.mfp{'+entries+'}';
      var w = doc.querySelector('.mf-form-wrapper') || doc.querySelector('.mfp');
      if (w) w.style.setProperty(name, value);
    } catch(e) {}
  }

  // ── Read CSS vars from iframe ──────────────────────────────────────
  function readVarsFromIframe(doc) {
    var vars = {};
    try {
      Array.from(doc.styleSheets).forEach(function(ss) {
        try {
          Array.from(ss.cssRules).forEach(function(r) {
            if (!r.selectorText) return;
            if (!r.selectorText.includes(':root') && !r.selectorText.includes('mf-form-wrapper')) return;
            (r.cssText.match(/--mf[\w-]*:\s*[^;,}]+/g)||[]).forEach(function(m) {
              var i = m.indexOf(':');
              vars[m.substring(0,i).trim()] = m.substring(i+1).trim();
            });
          });
        } catch(e){}
      });
      var ovr = doc.getElementById('td-live-overrides');
      if (ovr) {
        (ovr.textContent.match(/--mf[\w-]*:\s*[^;]+/g)||[]).forEach(function(m) {
          var i = m.indexOf(':');
          vars[m.substring(0,i).trim()] = m.substring(i+1).trim();
        });
      }
    } catch(e){}
    return vars;
  }

  // ── Get element's computed value for a property ────────────────────
  function getComputedVal(el, prop, doc) {
    try {
      var cs = doc.defaultView.getComputedStyle(el);
      return cs.getPropertyValue(prop).trim();
    } catch(e) { return ''; }
  }

  // ── Convert rgb(...) to hex ────────────────────────────────────────
  function rgbToHex(rgb) {
    var m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return '';
    var r=parseInt(m[1]), g=parseInt(m[2]), b=parseInt(m[3]);
    return '#' + ((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1).toUpperCase();
  }

  function toDisplayHex(val) {
    if (!val) return '#888888';
    if (val.startsWith('#')) return val.substring(0,7);
    if (val.startsWith('rgb')) { var h=rgbToHex(val); return h||'#888888'; }
    return '#888888';
  }

  function parseNum(v) { return parseFloat((v||'0').replace(/[^0-9.-]/g,''))||0; }

  // ── Build a live-mode control widget ──────────────────────────────
  function buildLiveControl(el, doc, cfg) {
    var val = getComputedVal(el, cfg.prop, doc);
    if (!val || val === 'normal' && cfg.type === 'text') return null;
    // Skip transparent backgrounds in live mode (too noisy)
    if (cfg.prop === 'background-color' && val === 'rgba(0, 0, 0, 0)') return null;
    if (cfg.prop === 'border' && val.includes('0px')) return null;
    if (cfg.prop === 'box-shadow' && val === 'none') return null;
    if (cfg.prop === 'background-image' && val === 'none') return null;
    if (cfg.prop === 'text-decoration' && val.includes('none')) return null;

    var d = document.createElement('div');
    d.className = 'mfi-ctrl';
    d.dataset.prop = cfg.prop;

    function onChange(newVal) {
      applyLiveProp(el, doc, cfg.prop, newVal);
    }

    if (cfg.type === 'color') {
      var hex = toDisplayHex(val);
      d.innerHTML = '<div class="mfi-row">'
        +'<span class="mfi-lbl">'+cfg.label+'</span>'
        +'<div class="mfi-clr-wrap"><input type="color" class="mfi-clr" value="'+hex+'">'
        +'<span class="mfi-hex">'+hex+'</span></div></div>'
        +'<div class="mfi-orig">was: <code>'+val.substring(0,40)+'</code></div>';
      var inp = d.querySelector('input'), hexEl = d.querySelector('.mfi-hex');
      inp.addEventListener('input', function(e) { hexEl.textContent=e.target.value; onChange(e.target.value); });

    } else if (cfg.type === 'range') {
      var num = parseNum(val);
      d.innerHTML = '<div class="mfi-row">'
        +'<span class="mfi-lbl">'+cfg.label+'</span>'
        +'<span class="mfi-rv">'+val+'</span></div>'
        +'<input type="range" class="mfi-range" min="'+cfg.min+'" max="'+cfg.max+'" step="'+(cfg.s||1)+'" value="'+num+'">'
        +'<div class="mfi-orig">was: <code>'+val+'</code></div>';
      var ri = d.querySelector('input[type=range]'), rv = d.querySelector('.mfi-rv');
      ri.addEventListener('input', function(e) {
        var v = e.target.value+(cfg.u||''); rv.textContent=v; onChange(v);
      });

    } else if (cfg.type === 'sel') {
      var opts = cfg.o.map(function(o) {
        return '<option value="'+o+'"'+(val.includes(o)?' selected':'')+'>'+o+'</option>';
      }).join('');
      d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span>'
        +'<select class="mfi-sel">'+opts+'</select></div>'
        +'<div class="mfi-orig">was: <code>'+val.substring(0,40)+'</code></div>';
      d.querySelector('select').addEventListener('change', function(e) { onChange(e.target.value); });

    } else if (cfg.type === 'font') {
      var opts = FONTS.map(function(f) {
        return '<option value="'+f+'"'+(val.includes(f)?' selected':'')+'>'+f+'</option>';
      }).join('');
      d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span>'
        +'<select class="mfi-sel mfi-fsel">'+opts+'</select></div>'
        +'<div class="mfi-orig">was: <code>'+val.substring(0,50)+'</code></div>';
      d.querySelector('select').addEventListener('change', function(e) {
        var f = e.target.value;
        onChange("'"+f+"', sans-serif");
        // Load font into iframe
        try {
          var fdoc = document.getElementById('td-preview-frame').contentDocument;
          if (!fdoc.querySelector('link[data-mfi-font="'+f+'"]')) {
            var lnk=fdoc.createElement('link'); lnk.rel='stylesheet';
            lnk.setAttribute('data-mfi-font',f);
            lnk.href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(f)+':wght@400;500;600;700&display=swap';
            fdoc.head.appendChild(lnk);
          }
        } catch(e){}
      });

    } else { // text
      d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span>'
        +'<input type="text" class="mfi-txt" value="'+(val||'').replace(/"/g,'&quot;')+'"></div>'
        +'<div class="mfi-orig">was: <code>'+val.substring(0,60)+'</code></div>';
      var ti = d.querySelector('input');
      ['change','blur'].forEach(function(ev) {
        ti.addEventListener(ev, function(e) { onChange(e.target.value); });
      });
    }

    return d;
  }

  // ── Build CSS var control widget ───────────────────────────────────
  function buildVarControl(varName, currentVal, doc) {
    var meta = VAR_META[varName];
    if (!meta) meta = { t:'text', l:varName.replace('--mf-','').replace(/-/g,' ') };
    var val = (currentVal||'').trim();
    var d = document.createElement('div');
    d.className = 'mfi-ctrl';

    function onChange(v) { applyCssVar(varName, v, doc); }

    if (meta.t === 'color') {
      var hex = toDisplayHex(val);
      d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+meta.l+'</span>'
        +'<div class="mfi-clr-wrap"><input type="color" class="mfi-clr" value="'+hex+'">'
        +'<span class="mfi-hex">'+hex.toUpperCase()+'</span></div></div>';
      var inp=d.querySelector('input'), hexEl=d.querySelector('.mfi-hex');
      inp.addEventListener('input', function(e) { hexEl.textContent=e.target.value.toUpperCase(); onChange(e.target.value); });
    } else if (meta.t === 'range') {
      var num=parseNum(val), step=meta.s||1, dv=val||(num+(meta.u||''));
      d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+meta.l+'</span><span class="mfi-rv">'+dv+'</span></div>'
        +'<input type="range" class="mfi-range" min="'+meta.min+'" max="'+meta.max+'" step="'+step+'" value="'+num+'">';
      var ri=d.querySelector('input[type=range]'), rv=d.querySelector('.mfi-rv');
      ri.addEventListener('input', function(e) { var v=e.target.value+(meta.u||''); rv.textContent=v; onChange(v); });
    } else if (meta.t === 'sel') {
      var opts=(meta.o||[]).map(function(o){return'<option value="'+o+'"'+(val===o?' selected':'')+'>'+o+'</option>';}).join('');
      d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+meta.l+'</span><select class="mfi-sel">'+opts+'</select></div>';
      d.querySelector('select').addEventListener('change', function(e){onChange(e.target.value);});
    } else if (meta.t === 'font') {
      var opts=FONTS.map(function(f){return'<option value="'+f+'"'+(val.includes(f)?' selected':'')+'>'+f+'</option>';}).join('');
      d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+meta.l+'</span><select class="mfi-sel mfi-fsel">'+opts+'</select></div>';
      d.querySelector('select').addEventListener('change', function(e){
        var f=e.target.value; onChange("'"+f+"', sans-serif");
        try{var fdoc=document.getElementById('td-preview-frame').contentDocument;if(!fdoc.querySelector('link[data-mfi-font="'+f+'"]')){var lnk=fdoc.createElement('link');lnk.rel='stylesheet';lnk.setAttribute('data-mfi-font',f);lnk.href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(f)+':wght@400;500;600;700&display=swap';fdoc.head.appendChild(lnk);}}catch(e){}
      });
    } else {
      d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+meta.l+'</span>'
        +'<input type="text" class="mfi-txt" value="'+(val||'').replace(/"/g,'&quot;')+'"></div>';
      var ti=d.querySelector('input');
      ['change','blur'].forEach(function(ev){ti.addEventListener(ev,function(e){onChange(e.target.value);});});
    }
    return d;
  }

  // ── Get element tag + class name for display ───────────────────────
  function getElemLabel(el) {
    var tag = el.tagName.toLowerCase();
    var mfCls = getMfClass(el);
    if (mfCls) return mfCls;
    var cls = Array.from(el.classList).slice(0,2).join('.');
    return cls ? tag+'.'+cls : tag;
  }

  function getElemIcon(el) {
    var tag = el.tagName.toLowerCase();
    var icons = { h1:'🔤', h2:'🔤', h3:'📌', h4:'📌', p:'📝', span:'📝', div:'📦',
                  img:'🖼', a:'🔗', button:'🔘', input:'✏️', textarea:'📃', select:'🔽',
                  label:'🏷', ul:'📋', li:'•', i:'✨', svg:'🎨', form:'📋' };
    return icons[tag] || '🔲';
  }

  // ── Show panel ─────────────────────────────────────────────────────
  function showPanel(el, doc, isLiveMode) {
    var panel = document.getElementById('mfi-panel');
    if (!panel || state.pinned) return;

    var mfCls = getMfClass(el);
    var elemLabel, elemIcon, elemSelector;

    if (isLiveMode) {
      // Live element mode
      elemLabel = getElemLabel(el);
      elemIcon = getElemIcon(el);
      var mfAnc = getNearestMfAncestor(el);
      elemSelector = (mfAnc ? '.'+mfAnc.cls+' ' : '') + el.tagName.toLowerCase()
        + (el.id ? '#'+el.id : '')
        + (el.className ? '.'+Array.from(el.classList).slice(0,2).join('.') : '');
    } else {
      // CSS var mode for mf root element
      var info = CSS_VAR_MAP[mfCls] || { label: mfCls, icon:'🔲', vars:[] };
      elemLabel = info.label;
      elemIcon = info.icon;
      elemSelector = '.'+mfCls;
    }

    var modeBadge = isLiveMode
      ? '<span class="mfi-badge-live">Live CSS</span>'
      : '<span class="mfi-badge-var">CSS Vars</span>';

    panel.innerHTML =
      '<div class="mfi-ph">'
        +'<span class="mfi-pi">'+elemIcon+'</span>'
        +'<span class="mfi-pt">'+elemLabel+'</span>'
        +modeBadge
        +'<button class="mfi-pin" id="mfi-pin-btn" title="Pin (P)">📌</button>'
        +'<button class="mfi-cls" id="mfi-cls-btn">✕</button>'
      +'</div>'
      +'<div class="mfi-selector-box">'
        +'<code class="mfi-selector">'+elemSelector.substring(0,60)+'</code>'
        +(isLiveMode ? '<span class="mfi-selector-hint">computed →  !important</span>' : '<span class="mfi-selector-hint">CSS vars</span>')
      +'</div>'
      +'<div class="mfi-ctrls" id="mfi-ctrls"></div>';

    document.getElementById('mfi-cls-btn').onclick = function() { state.pinned=false; hidePanel(); deactivate(); };
    document.getElementById('mfi-pin-btn').onclick = function() {
      state.pinned = !state.pinned;
      document.getElementById('mfi-pin-btn').classList.toggle('pinned', state.pinned);
    };

    var ctrls = panel.querySelector('#mfi-ctrls');

    if (isLiveMode) {
      // Auto-detect all visual properties with non-default values
      var hasControls = false;
      LIVE_PROPS.forEach(function(cfg) {
        var c = buildLiveControl(el, doc, cfg);
        if (c) { ctrls.appendChild(c); hasControls = true; }
      });
      if (!hasControls) {
        ctrls.innerHTML = '<div class="mfi-empty">No visual properties detected on this element. Try hovering a parent.</div>';
      }
    } else {
      // CSS var mode
      var allVars = readVarsFromIframe(doc);
      state.cssVars = allVars;
      var info = CSS_VAR_MAP[mfCls] || { vars:[] };
      info.vars.forEach(function(v) {
        var c = buildVarControl(v, allVars[v], doc);
        if (c) ctrls.appendChild(c);
      });
    }

    panel.style.display = 'block';
    var scroll = document.querySelector('.td-right-scroll');
    var tabs = document.querySelector('.td-right-tabs');
    if (scroll) scroll.style.display = 'none';
    if (tabs) tabs.style.opacity = '0.3';
  }

  function hidePanel() {
    var p = document.getElementById('mfi-panel');
    if (p) p.style.display = 'none';
    var scroll = document.querySelector('.td-right-scroll');
    var tabs = document.querySelector('.td-right-tabs');
    if (scroll) scroll.style.display = '';
    if (tabs) tabs.style.opacity = '';
  }

  // ── Outer-page mouse tracking (works with srcdoc iframes) ──────────
  function startOuterTracking() {
    if (document._mfiOuterListener) return;
    document._mfiOuterListener = function(e) {
      if (!state.active) return;
      var frame = document.getElementById('td-preview-frame');
      if (!frame) return;
      var fr = frame.getBoundingClientRect();
      var x = e.clientX - fr.left;
      var y = e.clientY - fr.top;
      try {
        var doc = frame.contentDocument || frame.contentWindow.document;
        if (!doc || !doc.body) return;

        var ov=doc.getElementById('mfi-ov'), tt=doc.getElementById('mfi-tt'), sb=doc.getElementById('mfi-sb');
        if (!ov || !tt || !sb) { injectOverlayDOM(doc); return; }

        if (x < 0 || y < 0 || x > fr.width || y > fr.height) {
          ov.style.display='none'; tt.style.display='none'; sb.style.display='none'; return;
        }

        var el = doc.elementFromPoint(x, y);
        if (!el || el === state.lastEl) return;
        state.lastEl = el;

        // Decide mode: mf root element → CSS var mode, child → live mode
        var mfCls = getMfClass(el);
        var isLiveMode = !mfCls && isInsideMf(el);
        if (!mfCls && !isLiveMode) {
          ov.style.display='none'; tt.style.display='none'; sb.style.display='none'; return;
        }

        var r = el.getBoundingClientRect();
        // Overlay color: purple for CSS var mode, teal for live mode
        var color = isLiveMode ? '#0891b2' : '#7c3aed';
        var bgColor = isLiveMode ? 'rgba(8,145,178,0.06)' : 'rgba(109,40,217,0.06)';
        ov.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483000;border:2px solid '+color+';background:'+bgColor+';border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,0.1);left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;display:block;';

        // Tooltip
        var label = isLiveMode ? getElemIcon(el)+' '+getElemLabel(el)+' ↗ live' : (CSS_VAR_MAP[mfCls] ? CSS_VAR_MAP[mfCls].icon+' '+CSS_VAR_MAP[mfCls].label : '⚡ '+mfCls);
        var ttBg = isLiveMode ? '#164e63' : '#1e1b4b';
        var ttTop = Math.max(4, r.top - 30);
        tt.style.cssText = 'position:fixed;z-index:2147483001;pointer-events:none;background:'+ttBg+';color:#e0f7ff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:5px;white-space:nowrap;font-family:Inter,system-ui,sans-serif;letter-spacing:.03em;box-shadow:0 3px 10px rgba(0,0,0,.4);left:'+r.left+'px;top:'+ttTop+'px;display:block;';
        tt.textContent = label;

        // Selector badge
        var selText = isLiveMode ? el.tagName.toLowerCase() + (Array.from(el.classList).length ? '.'+Array.from(el.classList)[0] : '') : '.'+mfCls;
        sb.style.cssText = 'position:fixed;z-index:2147483001;pointer-events:none;background:'+color+';color:#fff;font-size:10px;font-family:monospace;padding:2px 8px;border-radius:0 0 5px 5px;white-space:nowrap;left:'+r.left+'px;top:'+r.top+'px;display:block;';
        sb.textContent = selText;

        showPanel(el, doc, isLiveMode);
      } catch(err) { /* ignore */ }
    };
    document.addEventListener('mousemove', document._mfiOuterListener, true);
  }

  function stopOuterTracking() {
    if (document._mfiOuterListener) {
      document.removeEventListener('mousemove', document._mfiOuterListener, true);
      document._mfiOuterListener = null;
    }
  }

  // ── Inject overlay DOM into iframe ─────────────────────────────────
  function injectOverlayDOM(doc) {
    if (doc.getElementById('mfi-ov')) return;
    var ov = doc.createElement('div'); ov.id='mfi-ov';
    ov.style.cssText='position:fixed;pointer-events:none;z-index:2147483000;display:none;border-radius:3px;';
    doc.body.appendChild(ov);
    var tt = doc.createElement('div'); tt.id='mfi-tt';
    tt.style.cssText='position:fixed;z-index:2147483001;pointer-events:none;display:none;border-radius:5px;';
    doc.body.appendChild(tt);
    var sb = doc.createElement('div'); sb.id='mfi-sb';
    sb.style.cssText='position:fixed;z-index:2147483001;pointer-events:none;display:none;';
    doc.body.appendChild(sb);
  }

  // ── Click to pin ───────────────────────────────────────────────────
  function setupClickPin(doc) {
    doc.addEventListener('click', function(e) {
      if (!state.active) return;
      e.preventDefault(); e.stopPropagation();
      state.pinned = true;
      var pb = document.getElementById('mfi-pin-btn');
      if (pb) pb.classList.add('pinned');
    }, true);
  }

  // ── Activate / deactivate ──────────────────────────────────────────
  function activate() {
    state.active = true; state.pinned = false;
    var frame = document.getElementById('td-preview-frame');
    try {
      var doc = frame.contentDocument || frame.contentWindow.document;
      injectOverlayDOM(doc);
      setupClickPin(doc);
    } catch(e){}
    startOuterTracking();
    updateToggleBtn(true);
  }

  function deactivate() {
    state.active = false; state.pinned = false; state.lastEl = null;
    stopOuterTracking();
    try {
      var doc = document.getElementById('td-preview-frame').contentDocument;
      ['mfi-ov','mfi-tt','mfi-sb'].forEach(function(id){
        var el=doc.getElementById(id); if(el)el.style.display='none';
      });
    } catch(e){}
    hidePanel();
    updateToggleBtn(false);
  }

  function updateToggleBtn(on) {
    var btn = document.getElementById('mfi-toggle');
    if (!btn) return;
    btn.classList.toggle('on', on);
    btn.innerHTML = on ? '<i class="fas fa-crosshairs"></i> Inspecting...' : '<i class="fas fa-crosshairs"></i> Inspect';
  }

  // ── Wire existing right-panel controls ────────────────────────────
  function wireExistingControls() {
    var frame = document.getElementById('td-preview-frame');
    var doc = frame ? (frame.contentDocument || frame.contentWindow.document) : null;
    var vars = doc ? readVarsFromIframe(doc) : {};

    document.querySelectorAll('.td-slider[data-var]').forEach(function(sl) {
      if (sl._mfiW) return; sl._mfiW = true;
      var vn=sl.dataset.var, u=sl.dataset.unit||'';
      var row=sl.closest('.td-sld-row'), valEl=row&&row.querySelector('.td-sld-val');
      var cur=vars[vn]; if(cur){var n=parseFloat(cur);if(!isNaN(n)){sl.value=String(n);if(valEl)valEl.textContent=cur;}}
      sl.addEventListener('input',function(e){var v=e.target.value+u;if(valEl)valEl.textContent=v;if(doc)applyCssVar(vn,v,doc);});
    });
    document.querySelectorAll('.td-var-select[data-var]').forEach(function(sel){
      if(sel._mfiW)return;sel._mfiW=true;var vn=sel.dataset.var,cur=vars[vn];if(cur)sel.value=cur;
      sel.addEventListener('change',function(e){if(doc)applyCssVar(vn,e.target.value,doc);});
    });
    document.querySelectorAll('.td-clr-row[data-var]').forEach(function(row){
      if(row._mfiW)return;row._mfiW=true;var vn=row.dataset.var,ci=row.querySelector('input[type="color"]'),sp=row.querySelector('span'),cur=vars[vn];
      if(cur&&cur.startsWith('#')&&ci){ci.value=cur.substring(0,7);if(sp)sp.textContent=cur.substring(0,7);}
      if(ci)ci.addEventListener('input',function(e){if(sp)sp.textContent=e.target.value;if(doc)applyCssVar(vn,e.target.value,doc);});
    });
    document.querySelectorAll('.td-effect-toggle').forEach(function(tog){
      if(tog._mfiW)return;tog._mfiW=true;var vn=tog.dataset.var,cur=vars[vn];
      if(cur)tog.checked=(cur!=='none'&&cur!==tog.dataset.off);
      tog.addEventListener('change',function(e){if(doc)applyCssVar(vn,e.target.checked?e.target.dataset.on:e.target.dataset.off,doc);});
    });
    var fontSel=document.getElementById('td-font-select');
    if(fontSel&&!fontSel._mfiW){fontSel._mfiW=true;
      fontSel.addEventListener('change',function(e){if(doc)applyCssVar('--mf-font-family',"'"+e.target.value+"', sans-serif",doc);});
    }
  }

  // ── CSS Styles ─────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('mfi-css')) return;
    var s = document.createElement('style'); s.id='mfi-css';
    s.textContent = [
      '#mfi-panel{display:none;position:absolute;inset:0;z-index:50;background:#fff;overflow-y:auto;padding:0}',
      '#mfi-panel::-webkit-scrollbar{width:4px}#mfi-panel::-webkit-scrollbar-thumb{background:#d4d4d8;border-radius:2px}',
      /* header */
      '.mfi-ph{display:flex;align-items:center;gap:6px;padding:9px 12px;position:sticky;top:0;z-index:5;background:linear-gradient(135deg,#ede9fe,#ddd6fe);border-bottom:1px solid #c4b5fd}',
      '.mfi-pi{font-size:16px;flex-shrink:0}',
      '.mfi-pt{font-size:12px;font-weight:700;color:#4c1d95;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.mfi-badge-var{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:#7c3aed;color:#fff;padding:2px 7px;border-radius:99px;flex-shrink:0}',
      '.mfi-badge-live{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:#0891b2;color:#fff;padding:2px 7px;border-radius:99px;flex-shrink:0}',
      '.mfi-pin,.mfi-cls{border:none;background:rgba(124,58,237,.1);color:#a78bfa;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}',
      '.mfi-pin.pinned{background:#7c3aed;color:#fff}.mfi-cls:hover{background:#ef4444;color:#fff}',
      '.mfi-selector-box{display:flex;align-items:center;justify-content:space-between;padding:5px 12px;background:#f5f3ff;border-bottom:1px solid #ede9fe}',
      '.mfi-selector{font-size:10px;font-family:monospace;color:#7c3aed;font-weight:600}',
      '.mfi-selector-hint{font-size:9px;color:#a78bfa;flex-shrink:0}',
      /* controls */
      '.mfi-ctrls{padding:8px;display:flex;flex-direction:column;gap:6px}',
      '.mfi-ctrl{background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px;transition:border-color .12s,box-shadow .12s}',
      '.mfi-ctrl:hover{border-color:#a78bfa;box-shadow:0 0 0 2px rgba(167,139,250,.1)}',
      '.mfi-row{display:flex;align-items:center;justify-content:space-between;gap:6px}',
      '.mfi-lbl{font-size:11px;font-weight:500;color:#52525b;flex:1;white-space:nowrap}',
      '.mfi-orig{font-size:9px;color:#94a3b8;margin-top:3px;line-height:1.3}',
      '.mfi-orig code{font-family:monospace;font-size:9px}',
      '.mfi-empty{padding:16px;text-align:center;color:#94a3b8;font-size:12px}',
      /* color */
      '.mfi-clr-wrap{display:flex;align-items:center;gap:5px;border:1px solid #e4e4e7;border-radius:6px;padding:2px 7px 2px 2px;background:#fff}',
      '.mfi-clr-wrap:hover{border-color:#a78bfa}',
      '.mfi-clr{width:22px;height:22px;border-radius:4px;border:none;padding:0;cursor:pointer;flex-shrink:0}',
      '.mfi-hex{font-size:10px;font-family:monospace;font-weight:700;color:#3f3f46;min-width:52px}',
      /* range */
      '.mfi-rv{font-size:11px;font-weight:700;color:#6d28d9;background:#ede9fe;padding:1px 8px;border-radius:4px;font-family:monospace;min-width:38px;text-align:center;flex-shrink:0}',
      '.mfi-range{width:100%;height:4px;border-radius:2px;margin-top:5px;-webkit-appearance:none;appearance:none;outline:none;cursor:pointer;background:linear-gradient(to right,#7c3aed,#ddd6fe)}',
      '.mfi-range::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#7c3aed;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25);cursor:pointer}',
      /* select / text */
      '.mfi-sel,.mfi-fsel{height:26px;border:1px solid #e4e4e7;border-radius:6px;padding:0 6px;font-size:11px;background:#fff;color:#09090b;outline:none;cursor:pointer;max-width:155px}',
      '.mfi-sel:focus,.mfi-fsel:focus{border-color:#7c3aed}',
      '.mfi-txt{height:26px;border:1px solid #e4e4e7;border-radius:6px;padding:0 8px;font-size:11px;background:#fff;color:#09090b;outline:none;font-family:monospace;flex:1;min-width:0;max-width:185px}',
      '.mfi-txt:focus{border-color:#7c3aed}',
      /* toggle button */
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
    var p = document.createElement('div'); p.id='mfi-panel'; rp.appendChild(p);
  }

  function createToggleBtn() {
    if (document.getElementById('mfi-toggle')) return;
    var topbar = document.querySelector('.td-preview-topbar-right');
    if (!topbar) return;
    var sep = document.createElement('span');
    sep.style.cssText='width:1px;height:14px;background:#e4e4e7;margin:0 4px;display:inline-block;flex-shrink:0;';
    topbar.insertBefore(sep, topbar.firstChild);
    var btn = document.createElement('button'); btn.id='mfi-toggle';
    btn.innerHTML='<i class="fas fa-crosshairs"></i> Inspect';
    btn.title='Hover any element inside the form to edit its styles';
    topbar.insertBefore(btn, topbar.firstChild);
    btn.addEventListener('click', function() { state.active ? deactivate() : activate(); });
  }

  function watchIframeReload() {
    var frame = document.getElementById('td-preview-frame');
    if (!frame) return;
    frame.addEventListener('load', function() {
      state.lastEl = null;
      state.overrides = {}; // clear overrides on reload
      if (state.active) {
        try { injectOverlayDOM(frame.contentDocument); setupClickPin(frame.contentDocument); } catch(e){}
      }
      setTimeout(wireExistingControls, 300);
    });
  }

  function watchRightTabs() {
    document.querySelectorAll('.td-right-tab').forEach(function(t) {
      t.addEventListener('click', function() { setTimeout(wireExistingControls, 150); });
    });
  }

  function init() {
    injectStyles();
    createPanel();
    createToggleBtn();
    wireExistingControls();
    watchIframeReload();
    watchRightTabs();
    console.log('[MFI v4] Auto-detect inspector ready. Purple = CSS vars, Teal = live computed styles');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 300);

  window.__MFI = {
    activate, deactivate, state,
    applyLiveProp, applyCssVar,
    readVars: readVarsFromIframe,
  };
})();
