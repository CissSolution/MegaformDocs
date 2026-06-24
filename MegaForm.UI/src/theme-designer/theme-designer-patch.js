(function(){
  'use strict';
  var root = document.getElementById('td-root');
  if (!root) return;

  var formId = parseInt(root.dataset.formId || '0', 10) || 0;
  var apiBase = (root.dataset.apiBase || '/api/MegaForm/').replace(/\/?$/, '/');
  var currentBaseCss = '';
  var returnUrl = root.dataset.returnUrl || '/admin';

  function byId(id){ return document.getElementById(id); }
  function safeJson(v, fallback){ try { return JSON.parse(v); } catch(e){ return fallback; } }
  function deepClone(v){ return safeJson(JSON.stringify(v), v); }
  function markSaved(saved){
    var badge = byId('td-saved-badge');
    if (!badge) return;
    badge.textContent = saved ? 'Saved' : 'Unsaved';
    badge.style.background = saved ? '#f0fdf4' : '#fef9c3';
    badge.style.borderColor = saved ? '#bbf7d0' : '#fde68a';
    badge.style.color = saved ? '#16a34a' : '#92400e';
  }

  function setDirty(isDirty){
    root.dataset.tdPatchDirty = isDirty ? '1' : '0';
    if (window.MFThemeDesigner) window.MFThemeDesigner.__tdPatchDirty = !!isDirty;
    markSaved(!isDirty);
  }
  function isDirty(){
    return root.dataset.tdPatchDirty === '1';
  }
  function toast(msg, type){
    var n = document.createElement('div');
    n.className = 'td-toast ' + (type || 'success');
    n.textContent = msg;
    document.body.appendChild(n);
    requestAnimationFrame(function(){ n.classList.add('show'); });
    setTimeout(function(){ n.classList.remove('show'); setTimeout(function(){ n.remove(); }, 300); }, 2600);
  }
  function getFrame(){ return byId('td-preview-frame'); }
  function getDoc(){
    var frame = getFrame();
    if (!frame) return null;
    try { return frame.contentDocument || frame.contentWindow.document; } catch(e){ return null; }
  }
  function getCfg(){
    try {
      var frame = getFrame();
      return frame && frame.contentWindow ? frame.contentWindow.__CFG || null : null;
    } catch (e) { return null; }
  }
  function getActiveTheme(){
    var active = document.querySelector('.td-preset-item.active');
    if (active && active.getAttribute('data-preset')) return active.getAttribute('data-preset');
    return 'default';
  }
  function getOriginalBaseCss(){
    try {
      if (window.MFThemeDesigner && typeof window.MFThemeDesigner.__originalGetCustomCss === 'function') return String(window.MFThemeDesigner.__originalGetCustomCss() || '');
      if (window.MFThemeDesigner && typeof window.MFThemeDesigner.getCustomCss === 'function') return String(window.MFThemeDesigner.getCustomCss() || '');
    } catch (e) {}
    return '';
  }
  function getLiveVars(){
    var domVars = {};
    try {
      var doc = getDoc();
      if (doc && window.__MFI && typeof window.__MFI.readVars === 'function') domVars = window.__MFI.readVars(doc) || {};
    } catch (e) {}
    var coreVars = {};
    try {
      if (window.MFThemeDesigner && typeof window.MFThemeDesigner.getInternalState === 'function') {
        var st = window.MFThemeDesigner.getInternalState() || {};
        if (st.cssOverrides && typeof st.cssOverrides === 'object') coreVars = st.cssOverrides;
      }
    } catch (e) {}
    return Object.assign({}, domVars, coreVars);
  }
  function getInspectorCss(){
    try {
      if (window.__MFI && typeof window.__MFI.exportCustomCss === 'function') return String(window.__MFI.exportCustomCss() || '');
    } catch (e) {}
    return '';
  }
  function buildVarCss(vars){
    var keys = Object.keys(vars || {}).filter(function(k){ return !!k && vars[k] !== '' && vars[k] != null; });
    if (!keys.length) return '';
    var decl = keys.map(function(k){ return k + ':' + vars[k]; }).join(';');
    return ':root{' + decl + '}\n.mf-form-wrapper{' + decl + '}\n.mfp{' + decl + '}\n[class*="mf-theme-"]{' + decl + '}';
  }
  function createModel(){ return { raw: [], rawSet: {}, scopes: [], scopeMap: {} }; }
  function ensureScope(model, scope){
    scope = scope || '';
    if (!model.scopeMap[scope]) {
      model.scopeMap[scope] = { selectors: [], selectorMap: {} };
      model.scopes.push(scope);
    }
    return model.scopeMap[scope];
  }
  function ensureSelector(scopeObj, selector){
    if (!scopeObj.selectorMap[selector]) {
      scopeObj.selectorMap[selector] = { props: [], propMap: {} };
      scopeObj.selectors.push(selector);
    }
    return scopeObj.selectorMap[selector];
  }
  function addDecl(model, scope, selector, prop, value){
    if (!selector || !prop || value == null || value === '') return;
    var scopeObj = ensureScope(model, scope);
    var selectorObj = ensureSelector(scopeObj, selector);
    if (selectorObj.propMap[prop] == null) selectorObj.props.push(prop);
    selectorObj.propMap[prop] = value;
  }
  function addRaw(model, cssText){
    cssText = String(cssText || '').trim();
    if (!cssText || model.rawSet[cssText]) return;
    model.rawSet[cssText] = true;
    model.raw.push(cssText);
  }
  function parseCssIntoModel(text, model){
    text = String(text || '').trim();
    if (!text) return;
    var style = document.createElement('style');
    style.setAttribute('data-td-merge', '1');
    style.textContent = text;
    document.head.appendChild(style);
    try {
      var sheet = style.sheet;
      if (!sheet) { addRaw(model, text); return; }
      walkRules(sheet.cssRules, '', model);
    } catch (e) {
      addRaw(model, text);
    } finally {
      style.remove();
    }
  }
  function walkRules(rules, scope, model){
    if (!rules) return;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule) continue;
      if (rule.type === 1 && rule.selectorText) {
        for (var j = 0; j < rule.style.length; j++) {
          var prop = rule.style[j];
          var val = rule.style.getPropertyValue(prop).trim();
          var pri = rule.style.getPropertyPriority(prop);
          if (pri) val += ' !important';
          addDecl(model, scope, rule.selectorText, prop, val);
        }
      } else if (rule.cssRules && rule.cssRules.length) {
        var prelude = '';
        if (rule.conditionText && rule.type === 4) prelude = '@media ' + rule.conditionText;
        else if (rule.conditionText && rule.type === 12) prelude = '@supports ' + rule.conditionText;
        else if (rule.cssText && rule.cssText.indexOf('{') > -1) prelude = rule.cssText.substring(0, rule.cssText.indexOf('{')).trim();
        walkRules(rule.cssRules, prelude || scope, model);
      } else if (rule.cssText) {
        addRaw(model, rule.cssText);
      }
    }
  }
  function buildCss(model, options){
    options = options || {};
    var includeVarProps = options.includeVarProps !== false;
    var out = [];
    model.raw.forEach(function(r){ out.push(r); });
    model.scopes.forEach(function(scope){
      var scopeObj = model.scopeMap[scope];
      if (!scopeObj) return;
      var inner = [];
      scopeObj.selectors.forEach(function(selector){
        var selObj = scopeObj.selectorMap[selector];
        if (!selObj) return;
        var props = [];
        selObj.props.forEach(function(prop){
          if (!includeVarProps && String(prop).indexOf('--mf-') === 0) return;
          var value = selObj.propMap[prop];
          if (value == null || value === '') return;
          props.push('  ' + prop + ': ' + value + ';');
        });
        if (!props.length) return;
        inner.push(selector + ' {\n' + props.join('\n') + '\n}');
      });
      if (!inner.length) return;
      if (scope) out.push(scope + ' {\n' + inner.join('\n') + '\n}');
      else out.push(inner.join('\n'));
    });
    return out.join('\n\n').trim();
  }
  function buildMergedPieces(){
    var vars = getLiveVars();
    var base = currentBaseCss != null ? currentBaseCss : getOriginalBaseCss();
    var inspector = getInspectorCss();
    var model = createModel();
    parseCssIntoModel(base, model);
    parseCssIntoModel(inspector, model);
    var mergedNonVarCss = buildCss(model, { includeVarProps: false });
    var varCss = buildVarCss(vars);
    var mergedFullCss = [varCss, mergedNonVarCss].filter(Boolean).join('\n\n').trim();
    return { vars: vars, mergedNonVarCss: mergedNonVarCss, mergedFullCss: mergedFullCss };
  }
  function buildThemeObject(downloadMode){
    var pieces = buildMergedPieces();
    return downloadMode
      ? { _kind: 'MegaFormThemePatch', theme: getActiveTheme(), cssOverrides: pieces.vars, customCss: pieces.mergedFullCss }
      : { _kind: 'MegaFormThemePatch', theme: getActiveTheme(), cssOverrides: pieces.vars, customCss: pieces.mergedFullCss };
  }
  function getThemePayloadForSave(){
    var pieces = buildMergedPieces();
    return {
      themeJson: JSON.stringify({ _kind: 'MegaFormThemePatch', theme: getActiveTheme(), cssOverrides: pieces.vars, customCss: pieces.mergedFullCss }),
      mergedFullCss: pieces.mergedFullCss,
      mergedNonVarCss: pieces.mergedNonVarCss,
      vars: pieces.vars,
      theme: getActiveTheme()
    };
  }
  function downloadText(filename, text, mime){
    var blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
  }
  function buildBuilderJson(){
    var cfg = getCfg();
    var schema = cfg && cfg.schema ? deepClone(cfg.schema) : { fields: [], settings: {} };
    schema.settings = schema.settings || {};
    var merged = buildMergedPieces().mergedFullCss;
    schema.settings.theme = getActiveTheme();
    schema.settings.Theme = getActiveTheme();
    schema.settings.customCss = merged;
    schema.settings.CustomCss = merged;
    schema.customCss = merged;
    schema.CustomCss = merged;
    schema.theme = getActiveTheme();
    schema.Theme = getActiveTheme();
    if (cfg) {
      if (!schema.title && cfg.title) schema.title = cfg.title;
      if (!schema.description && cfg.description) schema.description = cfg.description;
      if (!schema.submitButtonText && cfg.submitButtonText) schema.submitButtonText = cfg.submitButtonText;
    }
    return schema;
  }
  async function saveTheme(label){
    if (!formId) { toast('No form loaded', 'error'); return; }
    var payload = getThemePayloadForSave();
    try {
      var resp = await fetch(apiBase + 'Form/SaveTheme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ FormId: formId, ThemeJson: payload.themeJson, SchemaCustomCss: payload.mergedFullCss, ThemeId: payload.theme, CssOverrides: payload.vars })
      });
      if (!resp.ok) {
        toast('Save failed: ' + resp.status, 'error');
        return;
      }
      currentBaseCss = payload.mergedFullCss || payload.mergedNonVarCss || currentBaseCss || '';
      var cfg = getCfg();
      if (cfg && cfg.schema) {
        cfg.schema.settings = cfg.schema.settings || {};
        cfg.schema.settings.theme = payload.theme;
        cfg.schema.settings.Theme = payload.theme;
        cfg.schema.settings.customCss = payload.mergedFullCss;
        cfg.schema.settings.CustomCss = payload.mergedFullCss;
        cfg.schema.customCss = payload.mergedFullCss;
        cfg.schema.CustomCss = payload.mergedFullCss;
      }
      if (window.MFThemeDesigner) {
        window.MFThemeDesigner.getCustomCss = function(){ return currentBaseCss || ''; };
        window.MFThemeDesigner.__tdLastSavedThemeJson = payload.themeJson;
        window.MFThemeDesigner.__tdLastSavedThemeCss = payload.mergedFullCss;
        // CRITICAL: sync the CORE's this.currentBaseCss so Refresh uses the merged CSS.
        // Without this, core.rebuildPreview() uses stale this.currentBaseCss (no inspector overrides).
        if (typeof window.MFThemeDesigner.setCustomCss === 'function') {
          window.MFThemeDesigner.setCustomCss(currentBaseCss);
        }
        // Commit inspector: bake state.overrides into importedCss, clear overrides.
        // Now inspector state is clean: next Refresh starts fresh from saved base CSS.
        if (window.__MFI && typeof window.__MFI.commitBaseCss === 'function') {
          var iDoc = getDoc();
          if (iDoc) window.__MFI.commitBaseCss(currentBaseCss, iDoc);
        } else if (window.__MFI && typeof window.__MFI.importCustomCss === 'function') {
          var iDoc = getDoc();
          if (iDoc) window.__MFI.importCustomCss(currentBaseCss, iDoc);
        }
      }
      setDirty(false);
      toast(label || 'Theme updated!', 'success');
    } catch (e) {
      toast('Network error', 'error');
    }
  }
  function wireButton(id, handler){
    var btn = byId(id);
    if (!btn || btn.dataset.tdPatchWired === '1') return;
    btn.dataset.tdPatchWired = '1';
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      handler(e);
    }, true);
  }
  function injectButtonsIfMissing(){
    var right = document.querySelector('.td-topbar-right');
    if (!right) return;
    if (!byId('td-download-theme-btn')) {
      var b1 = document.createElement('button');
      b1.className = 'td-btn';
      b1.id = 'td-download-theme-btn';
      b1.innerHTML = '<i class="fas fa-file-arrow-down"></i> Download Theme Patch JSON';
      right.insertBefore(b1, byId('td-apply-btn') || null);
    }
    if (!byId('td-download-builder-btn')) {
      var b2 = document.createElement('button');
      b2.className = 'td-btn';
      b2.id = 'td-download-builder-btn';
      b2.innerHTML = '<i class="fas fa-download"></i> Download Gallery JSON';
      right.insertBefore(b2, byId('td-apply-btn') || null);
    }
    var applyBtn = byId('td-apply-btn');
    if (applyBtn) applyBtn.innerHTML = '<i class="fas fa-check"></i> Update Theme';
  }
  function wireAll(){
    if (!window.MFThemeDesigner) return false;
    injectButtonsIfMissing();
    if (typeof window.MFThemeDesigner.__originalGetCustomCss !== 'function' && typeof window.MFThemeDesigner.getCustomCss === 'function') {
      window.MFThemeDesigner.__originalGetCustomCss = window.MFThemeDesigner.getCustomCss.bind(window.MFThemeDesigner);
    }
    if (currentBaseCss === '') currentBaseCss = getOriginalBaseCss();
    window.MFThemeDesigner.getCustomCss = function(){ return currentBaseCss || getOriginalBaseCss(); };
    window.MFThemeDesigner.downloadThemeJson = function(){
      var json = JSON.stringify(buildThemeObject(true), null, 2);
      var name = 'theme-patch-' + (formId || 'preview') + '.json';
      downloadText(name, json, 'application/json;charset=utf-8');
    };
    window.MFThemeDesigner.downloadBuilderJson = function(){
      var builder = buildBuilderJson();
      var json = JSON.stringify(builder, null, 2);
      var name = 'gallery-theme-' + (formId || 'preview') + '.json';
      downloadText(name, json, 'application/json;charset=utf-8');
    };
    window.MFThemeDesigner.updateTheme = function(){ return saveTheme('Theme updated!'); };
    wireButton('td-save-btn', function(){ saveTheme('Theme saved!'); });
    wireButton('td-apply-btn', function(){ saveTheme('Theme updated!'); });
    wireButton('td-download-theme-btn', function(){ window.MFThemeDesigner.downloadThemeJson(); });
    wireButton('td-download-builder-btn', function(){ window.MFThemeDesigner.downloadBuilderJson(); });
    wireButton('td-back-btn', function(){
      if (isDirty() && !window.confirm('Unsaved changes. Leave anyway?')) return;
      window.location.href = returnUrl + (formId ? '/builder?formId=' + formId : '');
    });
    return true;
  }
  function markUnsavedOnEdit(){
    if (root.dataset.tdPatchDirty === '1') return;
    root.dataset.tdPatchDirty = '1';
    ['input','change','click'].forEach(function(evt){
      document.addEventListener(evt, function(ev){
        var t = ev.target;
        if (!t) return;
        if (t.closest && (t.closest('#mfi-panel') || t.closest('.td-panel-right') || t.closest('.td-panel-left'))) setDirty(true);
      }, true);
    });
  }
  function init(){
    markUnsavedOnEdit();
    setDirty(false);
    window.addEventListener('beforeunload', function(e){
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });
    if (wireAll()) return;
    var tries = 0;
    var timer = setInterval(function(){
      tries += 1;
      if (wireAll() || tries > 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
