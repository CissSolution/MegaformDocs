const DIV_PANEL_BADGE = 'DIV 14-06';
const DIV_WIDTH_SLIDER_BADGE = 'W 14-06';

export function getDivPanelBadge(): string {
  return DIV_PANEL_BADGE;
}

export function canHandleDivPanelProp(prop: string): boolean {
  return [
    'background-color',
    'background-image',
    'background-repeat',
    'background-size',
    'background-position',
    'border-radius',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'gap',
    'row-gap',
    'column-gap',
    'margin-bottom',
    'opacity',
    'color',
    'font-size',
    'font-family',
    'font-weight',
    'width'
  ].indexOf(String(prop || '')) >= 0;
}

function parseN(v: string): number {
  return parseFloat(String(v || '0').replace(/[^0-9.-]/g, '')) || 0;
}

function escapeAttr(v: string): string {
  return String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function isMeaningful(prop: string, val: string): boolean {
  var next = String(val || '').trim().toLowerCase();
  if (!next) return false;
  if (prop === 'background-image') return next !== 'none';
  if (prop === 'background-color') return next !== 'transparent' && next !== 'rgba(0, 0, 0, 0)' && next !== 'rgba(0,0,0,0)';
  if (prop === 'background-repeat') return next !== 'repeat';
  if (prop === 'background-size') return next !== 'auto';
  if (prop === 'background-position') return next !== '0% 0%' && next !== 'left top';
  if (prop === 'border-radius') return parseN(next) > 0;
  if (prop === 'padding-top' || prop === 'padding-right' || prop === 'padding-bottom' || prop === 'padding-left') return parseN(next) > 0;
  if (prop === 'gap' || prop === 'row-gap' || prop === 'column-gap' || prop === 'margin-bottom') return parseN(next) > 0;
  if (prop === 'opacity') return Math.abs(parseN(next) - 1) > 0.001;
  if (prop === 'font-size') return next !== '16px';
  if (prop === 'font-weight') return next !== '400';
  if (prop === 'width') return parseN(next) > 0;
  return true;
}

function removeWithStatus(ctx: any, prop: string, statusEl?: HTMLElement | null): void {
  if (ctx && typeof ctx.removeOverride === 'function') ctx.removeOverride(prop);
  if (statusEl) {
    statusEl.textContent = 'not set';
    statusEl.classList.add('off');
  }
}

function setStatus(statusEl: HTMLElement | null, prop: string, val: string): void {
  if (!statusEl) return;
  var on = isMeaningful(prop, val);
  statusEl.textContent = on ? 'set' : 'not set';
  statusEl.classList.toggle('off', !on);
}

export function buildDivPanelControl(cfg: any, val: string, onChange: (nv: string) => void, ctx: any): HTMLDivElement | null {
  if (!cfg || !cfg.prop) return null;

  var d = document.createElement('div');
  d.className = 'mfi-ctrl mfi-ctrl-div';
  d.setAttribute('data-div-prop', String(cfg.prop));

  var currentVal = String(val || '').trim();
  var safeVal = escapeAttr(currentVal);
  var statusText = isMeaningful(cfg.prop, currentVal) ? 'set' : 'not set';
  var statusClass = isMeaningful(cfg.prop, currentVal) ? 'mfi-status' : 'mfi-status off';

  if (cfg.prop === 'width') {
    var widthPx = Math.max(120, Math.min(1600, parseN(currentVal || '480px') || 480));
    d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span><span class="'+statusClass+'">'+statusText+'</span></div>'
      + '<div class="mfi-row"><span class="mfi-rv">'+escapeAttr(currentVal || (widthPx + 'px'))+'</span><button type="button" class="mfi-mini-btn mfi-clear-btn">Remove</button></div>'
      + '<input type="range" class="mfi-range" min="120" max="1600" step="4" value="'+widthPx+'">'
      + '<div class="mfi-row" style="margin-top:6px;gap:8px;align-items:center;"><input type="text" class="mfi-txt mfi-width-txt" value="'+escapeAttr(currentVal || (widthPx + 'px'))+'" placeholder="472px / 100% / auto"><button type="button" class="mfi-mini-btn mfi-width-apply">Apply</button></div>'
      + '<div class="mfi-orig">div panel • '+DIV_PANEL_BADGE+' • '+DIV_WIDTH_SLIDER_BADGE+' • was: <code>'+escapeAttr(currentVal || 'auto')+'</code></div>';
    var widthRange = d.querySelector('input[type=range]') as HTMLInputElement | null;
    var widthVal = d.querySelector('.mfi-rv') as HTMLElement | null;
    var widthStatus = d.querySelector('.mfi-status') as HTMLElement | null;
    var widthText = d.querySelector('.mfi-width-txt') as HTMLInputElement | null;
    var widthApply = d.querySelector('.mfi-width-apply') as HTMLButtonElement | null;
    var widthClear = d.querySelector('.mfi-clear-btn') as HTMLButtonElement | null;
    function applyWidth(nextRaw: string): void {
      var next = String(nextRaw || '').trim();
      if (!next) {
        removeWithStatus(ctx, cfg.prop, widthStatus);
        if (widthVal) widthVal.textContent = 'auto';
        return;
      }
      setStatus(widthStatus, cfg.prop, next);
      if (widthVal) widthVal.textContent = next;
      if (widthText) widthText.value = next;
      onChange(next);
    }
    if (widthRange) widthRange.addEventListener('input', function(e) {
      var next = String((e.target as HTMLInputElement).value || '').trim() + 'px';
      applyWidth(next);
    });
    if (widthApply && widthText) widthApply.addEventListener('click', function(){ applyWidth(widthText.value); });
    if (widthText) widthText.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); applyWidth(widthText.value); } });
    if (widthClear) widthClear.addEventListener('click', function(){ if (widthText) widthText.value = ''; removeWithStatus(ctx, cfg.prop, widthStatus); if (widthVal) widthVal.textContent = 'auto'; });
    return d;
  }

  if (cfg.prop === 'background-image') {
    var bgUrl = String(ctx && typeof ctx.extractBgUrl === 'function' ? ctx.extractBgUrl(currentVal) : '');
    var safeUrl = escapeAttr(bgUrl);
    var preview = bgUrl
      ? '<div class="mfi-bg-preview" style="background-image:url(&quot;' + safeUrl + '&quot;)"></div>'
      : '<div class="mfi-bg-preview mfi-bg-preview-empty">No image</div>';
    d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span><span class="'+statusClass+'">'+statusText+'</span></div>'
      + preview
      + '<div class="mfi-bg-url-wrap"><input type="text" class="mfi-txt mfi-bg-url" placeholder="https://..." value="'+safeUrl+'"></div>'
      + '<div class="mfi-bg-actions"><button type="button" class="mfi-mini-btn mfi-bg-apply">Apply</button><button type="button" class="mfi-mini-btn mfi-bg-prompt">Paste URL</button><button type="button" class="mfi-mini-btn mfi-bg-clear">Remove</button></div>'
      + '<div class="mfi-orig">div panel • '+DIV_PANEL_BADGE+' • was: <code>' + (currentVal === 'none' ? 'none' : escapeAttr(currentVal.substring(0,120))) + '</code></div>';

    var urlInput = d.querySelector('.mfi-bg-url') as HTMLInputElement | null;
    var statusEl = d.querySelector('.mfi-status') as HTMLElement | null;
    var applyBtn = d.querySelector('.mfi-bg-apply') as HTMLButtonElement | null;
    var clearBtn = d.querySelector('.mfi-bg-clear') as HTMLButtonElement | null;
    var promptBtn = d.querySelector('.mfi-bg-prompt') as HTMLButtonElement | null;

    function syncPreview(url: string): void {
      var prev = d.querySelector('.mfi-bg-preview') as HTMLElement | null;
      if (!prev) return;
      if (url) {
        prev.classList.remove('mfi-bg-preview-empty');
        prev.style.backgroundImage = typeof ctx.buildBgImageValue === 'function' ? ctx.buildBgImageValue(url) : 'url("' + url + '")';
        prev.textContent = '';
      } else {
        prev.classList.add('mfi-bg-preview-empty');
        prev.style.backgroundImage = 'none';
        prev.textContent = 'No image';
      }
    }

    function applyUrl(url: string): void {
      var next = String(url || '').trim();
      var cssValue = typeof ctx.buildBgImageValue === 'function'
        ? ctx.buildBgImageValue(next)
        : (next ? 'url("' + next.replace(/"/g, '\\"') + '")' : 'none');
      onChange(cssValue);
      setStatus(statusEl, cfg.prop, cssValue);
      syncPreview(next);
    }

    if (applyBtn && urlInput) applyBtn.addEventListener('click', function(){ applyUrl(urlInput.value); });
    if (clearBtn && urlInput) clearBtn.addEventListener('click', function(){ urlInput.value = ''; syncPreview(''); removeWithStatus(ctx, cfg.prop, statusEl); });
    if (promptBtn && urlInput) {
      promptBtn.addEventListener('click', function(){
        var next = window.prompt('Background image URL', urlInput.value || bgUrl || '');
        if (next == null) return;
        urlInput.value = next;
        applyUrl(next);
      });
    }
    if (urlInput) {
      urlInput.addEventListener('keydown', function(e){
        if (e.key === 'Enter') {
          e.preventDefault();
          applyUrl(urlInput.value);
        }
      });
    }
    return d;
  }

  if (cfg.prop === 'background-repeat') {
    var repeatVal = currentVal || 'repeat';
    d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span><span class="'+statusClass+'">'+statusText+'</span></div>'
      + '<div class="mfi-row"><select class="mfi-sel mfi-div-sel"><option value="repeat"'+(repeatVal === 'repeat' ? ' selected' : '')+'>repeat</option><option value="no-repeat"'+(repeatVal === 'no-repeat' ? ' selected' : '')+'>no-repeat</option><option value="repeat-x"'+(repeatVal === 'repeat-x' ? ' selected' : '')+'>repeat-x</option><option value="repeat-y"'+(repeatVal === 'repeat-y' ? ' selected' : '')+'>repeat-y</option><option value="round"'+(repeatVal === 'round' ? ' selected' : '')+'>round</option><option value="space"'+(repeatVal === 'space' ? ' selected' : '')+'>space</option></select><button type="button" class="mfi-mini-btn mfi-clear-btn">Remove</button></div>'
      + '<div class="mfi-orig">div panel • '+DIV_PANEL_BADGE+' • was: <code>'+escapeAttr(currentVal || 'repeat')+'</code></div>';
    var repeatSel = d.querySelector('select') as HTMLSelectElement | null;
    var repeatStatus = d.querySelector('.mfi-status') as HTMLElement | null;
    var repeatClear = d.querySelector('.mfi-clear-btn') as HTMLButtonElement | null;
    if (repeatSel) repeatSel.addEventListener('change', function(e) { var next = (e.target as HTMLSelectElement).value; setStatus(repeatStatus, cfg.prop, next); onChange(next); });
    if (repeatClear) repeatClear.addEventListener('click', function(){ removeWithStatus(ctx, cfg.prop, repeatStatus); });
    return d;
  }

  if (cfg.prop === 'background-size' || cfg.prop === 'background-position') {
    var placeholder = cfg.prop === 'background-size' ? 'cover / contain / 100% auto' : 'center center / top left';
    d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span><span class="'+statusClass+'">'+statusText+'</span></div>'
      + '<div class="mfi-row"><input type="text" class="mfi-txt" placeholder="'+placeholder+'" value="'+safeVal+'"><button type="button" class="mfi-mini-btn mfi-apply-btn">Apply</button><button type="button" class="mfi-mini-btn mfi-clear-btn">Remove</button></div>'
      + '<div class="mfi-orig">div panel • '+DIV_PANEL_BADGE+' • was: <code>'+escapeAttr(currentVal || (cfg.prop === 'background-size' ? 'auto' : '0% 0%'))+'</code></div>';
    var bgText = d.querySelector('input') as HTMLInputElement | null;
    var bgStatus = d.querySelector('.mfi-status') as HTMLElement | null;
    var bgApply = d.querySelector('.mfi-apply-btn') as HTMLButtonElement | null;
    var bgClear = d.querySelector('.mfi-clear-btn') as HTMLButtonElement | null;
    function applyBgText(): void {
      if (!bgText) return;
      var next = String(bgText.value || '').trim();
      if (!next) {
        removeWithStatus(ctx, cfg.prop, bgStatus);
        return;
      }
      setStatus(bgStatus, cfg.prop, next);
      onChange(next);
    }
    if (bgApply) bgApply.addEventListener('click', applyBgText);
    if (bgClear) bgClear.addEventListener('click', function(){ if (bgText) bgText.value = ''; removeWithStatus(ctx, cfg.prop, bgStatus); });
    if (bgText) bgText.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); applyBgText(); } });
    return d;
  }

  if (cfg.type === 'color') {
    var hex = String(ctx && typeof ctx.toHex === 'function' ? ctx.toHex(currentVal || '#888888') : '#888888');
    d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span><span class="'+statusClass+'">'+statusText+'</span></div>'
      + '<div class="mfi-div-color-row"><div class="mfi-clr-wrap"><input type="color" class="mfi-clr" value="'+hex+'"><span class="mfi-hex">'+hex+'</span></div><button type="button" class="mfi-mini-btn mfi-transparent-btn">Transparent</button><button type="button" class="mfi-mini-btn mfi-clear-btn">Remove</button></div>'
      + '<div class="mfi-orig">div panel • '+DIV_PANEL_BADGE+' • was: <code>'+escapeAttr(currentVal || 'transparent')+'</code></div>';
    var clr = d.querySelector('input[type=color]') as HTMLInputElement | null;
    var hexEl = d.querySelector('.mfi-hex') as HTMLElement | null;
    var statusEl2 = d.querySelector('.mfi-status') as HTMLElement | null;
    var transparentBtn = d.querySelector('.mfi-transparent-btn') as HTMLButtonElement | null;
    var clearBtn2 = d.querySelector('.mfi-clear-btn') as HTMLButtonElement | null;
    if (clr) {
      clr.addEventListener('input', function(e) {
        var next = (e.target as HTMLInputElement).value;
        if (hexEl) hexEl.textContent = next;
        setStatus(statusEl2, cfg.prop, next);
        onChange(next);
      });
    }
    if (transparentBtn) transparentBtn.addEventListener('click', function(){ setStatus(statusEl2, cfg.prop, 'transparent'); onChange('transparent'); });
    if (clearBtn2) clearBtn2.addEventListener('click', function(){ removeWithStatus(ctx, cfg.prop, statusEl2); });
    return d;
  }

  if (cfg.type === 'range') {
    var num = parseN(currentVal || (cfg.prop === 'opacity' ? '1' : cfg.prop === 'font-size' ? '16px' : '0px'));
    d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span><span class="'+statusClass+'">'+statusText+'</span></div>'
      + '<div class="mfi-row"><span class="mfi-rv">'+(currentVal || (num + (cfg.u || '')))+'</span><button type="button" class="mfi-mini-btn mfi-clear-btn">Remove</button></div>'
      + '<input type="range" class="mfi-range" min="'+cfg.min+'" max="'+cfg.max+'" step="'+(cfg.s || 1)+'" value="'+num+'">'
      + '<div class="mfi-orig">div panel • '+DIV_PANEL_BADGE+' • was: <code>'+escapeAttr(currentVal || 'default')+'</code></div>';
    var ri = d.querySelector('input[type=range]') as HTMLInputElement | null;
    var rv = d.querySelector('.mfi-rv') as HTMLElement | null;
    var rangeStatus = d.querySelector('.mfi-status') as HTMLElement | null;
    var rangeClear = d.querySelector('.mfi-clear-btn') as HTMLButtonElement | null;
    if (ri) {
      ri.addEventListener('input', function(e) {
        var next = (e.target as HTMLInputElement).value + (cfg.u || '');
        if (rv) rv.textContent = next;
        setStatus(rangeStatus, cfg.prop, next);
        onChange(next);
      });
    }
    if (rangeClear) rangeClear.addEventListener('click', function(){ removeWithStatus(ctx, cfg.prop, rangeStatus); });
    return d;
  }

  if (cfg.type === 'sel' || cfg.type === 'font') {
    var opts = [] as string[];
    if (cfg.type === 'font') {
      var fonts = Array.isArray(ctx && ctx.FONTS) ? ctx.FONTS : [];
      opts = fonts.map(function(f: string){ return '<option value="'+escapeAttr(f)+'"'+(currentVal.indexOf(f) >= 0 ? ' selected' : '')+'>'+f+'</option>'; });
    } else {
      opts = (cfg.o || []).map(function(o: string){ return '<option value="'+escapeAttr(o)+'"'+(currentVal.indexOf(o) >= 0 ? ' selected' : '')+'>'+o+'</option>'; });
    }
    d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span><span class="'+statusClass+'">'+statusText+'</span></div>'
      + '<div class="mfi-row"><select class="mfi-sel mfi-div-sel">'+opts.join('')+'</select><button type="button" class="mfi-mini-btn mfi-clear-btn">Remove</button></div>'
      + '<div class="mfi-orig">div panel • '+DIV_PANEL_BADGE+' • was: <code>'+escapeAttr(currentVal || 'default')+'</code></div>';
    var sel = d.querySelector('select') as HTMLSelectElement | null;
    var statusEl3 = d.querySelector('.mfi-status') as HTMLElement | null;
    var clearBtn3 = d.querySelector('.mfi-clear-btn') as HTMLButtonElement | null;
    if (sel) {
      sel.addEventListener('change', function(e) {
        var next = (e.target as HTMLSelectElement).value;
        if (cfg.type === 'font') {
          next = "'" + next + "', sans-serif";
          try {
            var frame = document.getElementById('td-preview-frame') as HTMLIFrameElement | null;
            var fd = frame ? (frame.contentDocument || frame.contentWindow?.document || null) : null;
            var fontName = (e.target as HTMLSelectElement).value;
            if (fd && !fd.querySelector('link[data-mfi-font="'+fontName+'"]')) {
              var lnk = fd.createElement('link');
              lnk.rel = 'stylesheet';
              lnk.setAttribute('data-mfi-font', fontName);
              lnk.href = 'https://fonts.googleapis.com/css2?family='+encodeURIComponent(fontName)+':wght@400;500;600;700&display=swap';
              fd.head.appendChild(lnk);
            }
          } catch (e2) {}
        }
        setStatus(statusEl3, cfg.prop, next);
        onChange(next);
      });
    }
    if (clearBtn3) clearBtn3.addEventListener('click', function(){ removeWithStatus(ctx, cfg.prop, statusEl3); });
    return d;
  }

  d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span><span class="'+statusClass+'">'+statusText+'</span></div>'
    + '<div class="mfi-row"><input type="text" class="mfi-txt" value="'+safeVal+'"><button type="button" class="mfi-mini-btn mfi-apply-btn">Apply</button><button type="button" class="mfi-mini-btn mfi-clear-btn">Remove</button></div>'
    + '<div class="mfi-orig">div panel • '+DIV_PANEL_BADGE+' • was: <code>'+escapeAttr(currentVal || 'default')+'</code></div>';
  var ti = d.querySelector('input') as HTMLInputElement | null;
  var statusEl4 = d.querySelector('.mfi-status') as HTMLElement | null;
  var applyBtn2 = d.querySelector('.mfi-apply-btn') as HTMLButtonElement | null;
  var clearBtn4 = d.querySelector('.mfi-clear-btn') as HTMLButtonElement | null;
  function applyTextValue(): void {
    if (!ti) return;
    var next = String(ti.value || '').trim();
    if (!next) {
      removeWithStatus(ctx, cfg.prop, statusEl4);
      return;
    }
    setStatus(statusEl4, cfg.prop, next);
    onChange(next);
  }
  if (applyBtn2) applyBtn2.addEventListener('click', applyTextValue);
  if (clearBtn4) clearBtn4.addEventListener('click', function(){ if (ti) ti.value = ''; removeWithStatus(ctx, cfg.prop, statusEl4); });
  if (ti) {
    ti.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyTextValue();
      }
    });
  }
  return d;
}
