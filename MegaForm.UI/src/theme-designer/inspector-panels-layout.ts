export function canHandleLayoutPanelProp(prop: string): boolean {
  return [
    'background-color',
    'border-radius',
    'padding',
    'margin',
    'opacity',
    'border',
    'box-shadow',
    'width',
    'height'
  ].indexOf(String(prop || '')) >= 0;
}

function parseN(v: string): number {
  return parseFloat(String(v || '0').replace(/[^0-9.-]/g, '')) || 0;
}

export function buildLayoutPanelControl(cfg: any, val: string, onChange: (nv: string) => void, ctx: any): HTMLDivElement | null {
  if (!cfg || !val) return null;
  if (cfg.prop === 'background-color' && (val === 'rgba(0, 0, 0, 0)' || val === 'transparent')) return null;
  if (cfg.prop === 'border' && val.includes('0px')) return null;
  if (cfg.prop === 'box-shadow' && val === 'none') return null;

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
