export function canHandleContentPanelProp(prop: string): boolean {
  return [
    'color',
    'font-size',
    'font-weight',
    'font-family',
    'font-style',
    'text-transform',
    'text-align',
    'letter-spacing',
    'line-height'
  ].indexOf(String(prop || '')) >= 0;
}

function parseN(v: string): number {
  return parseFloat(String(v || '0').replace(/[^0-9.-]/g, '')) || 0;
}

export function buildContentPanelControl(cfg: any, val: string, onChange: (nv: string) => void, ctx: any): HTMLDivElement | null {
  if (!cfg || !val) return null;
  var d = document.createElement('div');
  d.className = 'mfi-ctrl';

  if (cfg.type === 'color') {
    var hex = String(ctx && typeof ctx.toHex === 'function' ? ctx.toHex(val) : '#888888');
    d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span>'
      +'<div class="mfi-clr-wrap"><input type="color" class="mfi-clr" value="'+hex+'">'
      +'<span class="mfi-hex">'+hex+'</span></div></div>'
      +'<div class="mfi-orig">was: <code>'+val.substring(0,40)+'</code></div>';
    var inp = d.querySelector('input') as HTMLInputElement | null;
    var hexEl = d.querySelector('.mfi-hex') as HTMLElement | null;
    if (inp) {
      inp.addEventListener('input', function(e) {
        var next = (e.target as HTMLInputElement).value;
        if (hexEl) hexEl.textContent = next;
        onChange(next);
      });
    }
    return d;
  }

  if (cfg.type === 'range') {
    var num = parseN(val);
    d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span>'
      +'<span class="mfi-rv">'+val+'</span></div>'
      +'<input type="range" class="mfi-range" min="'+cfg.min+'" max="'+cfg.max+'" step="'+(cfg.s || 1)+'" value="'+num+'">'
      +'<div class="mfi-orig">was: <code>'+val+'</code></div>';
    var ri = d.querySelector('input[type=range]') as HTMLInputElement | null;
    var rv = d.querySelector('.mfi-rv') as HTMLElement | null;
    if (ri) {
      ri.addEventListener('input', function(e) {
        var next = (e.target as HTMLInputElement).value + (cfg.u || '');
        if (rv) rv.textContent = next;
        onChange(next);
      });
    }
    return d;
  }

  if (cfg.type === 'sel') {
    var opts = (cfg.o || []).map(function(o: string){ return '<option value="'+o+'"'+(val.includes(o)?' selected':'')+'>'+o+'</option>'; }).join('');
    d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span>'
      +'<select class="mfi-sel">'+opts+'</select></div>'
      +'<div class="mfi-orig">was: <code>'+val.substring(0,40)+'</code></div>';
    var sel = d.querySelector('select') as HTMLSelectElement | null;
    if (sel) sel.addEventListener('change', function(e) { onChange((e.target as HTMLSelectElement).value); });
    return d;
  }

  if (cfg.type === 'font') {
    var fonts = Array.isArray(ctx && ctx.FONTS) ? ctx.FONTS : [];
    var opts = fonts.map(function(f: string){ return '<option value="'+f+'"'+(val.includes(f)?' selected':'')+'>'+f+'</option>'; }).join('');
    d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span>'
      +'<select class="mfi-sel mfi-fsel">'+opts+'</select></div>'
      +'<div class="mfi-orig">was: <code>'+val.substring(0,40)+'</code></div>';
    var select = d.querySelector('select') as HTMLSelectElement | null;
    if (select) {
      select.addEventListener('change', function(e) {
        var f = (e.target as HTMLSelectElement).value;
        onChange("'"+f+"', sans-serif");
        try {
          var frame = document.getElementById('td-preview-frame') as HTMLIFrameElement | null;
          var fd = frame ? (frame.contentDocument || frame.contentWindow?.document || null) : null;
          if (fd && !fd.querySelector('link[data-mfi-font="'+f+'"]')) {
            var lnk = fd.createElement('link');
            lnk.rel = 'stylesheet';
            lnk.setAttribute('data-mfi-font', f);
            lnk.href = 'https://fonts.googleapis.com/css2?family='+encodeURIComponent(f)+':wght@400;500;600;700&display=swap';
            fd.head.appendChild(lnk);
          }
        } catch (e2) {}
      });
    }
    return d;
  }

  d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span>'
    +'<input type="text" class="mfi-txt" value="'+(val || '').replace(/"/g,'&quot;')+'"></div>'
    +'<div class="mfi-orig">was: <code>'+val.substring(0,60)+'</code></div>';
  var ti = d.querySelector('input') as HTMLInputElement | null;
  if (ti) {
    ['change','blur'].forEach(function(ev) {
      ti.addEventListener(ev, function(e) { onChange((e.target as HTMLInputElement).value); });
    });
    ti.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onChange(ti.value);
      }
    });
  }
  return d;
}
