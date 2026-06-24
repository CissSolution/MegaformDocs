export function canHandleMediaPanelProp(prop: string): boolean {
  return String(prop || '') === 'background-image';
}

export function buildMediaPanelControl(cfg: any, val: string, onChange: (nv: string) => void, ctx: any): HTMLDivElement | null {
  if (!cfg || cfg.prop !== 'background-image') return null;
  var d = document.createElement('div');
  d.className = 'mfi-ctrl';
  var bgUrl = String(ctx && typeof ctx.extractBgUrl === 'function' ? ctx.extractBgUrl(val) : '');
  var safeUrl = bgUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  var preview = bgUrl
    ? '<div class="mfi-bg-preview" style="background-image:url(&quot;' + safeUrl + '&quot;)"></div>'
    : '<div class="mfi-bg-preview mfi-bg-preview-empty">No image</div>';
  d.innerHTML = '<div class="mfi-row"><span class="mfi-lbl">'+cfg.label+'</span><button type="button" class="mfi-bg-clear">Remove</button></div>'
    + preview
    + '<div class="mfi-bg-url-wrap"><input type="text" class="mfi-txt mfi-bg-url" placeholder="https://..." value="'+safeUrl+'"></div>'
    + '<div class="mfi-bg-actions"><button type="button" class="mfi-bg-apply">Apply image</button><button type="button" class="mfi-bg-prompt">Paste URL</button></div>'
    + '<div class="mfi-orig">was: <code>' + (val === 'none' ? 'none' : String(val || '').substring(0,120)) + '</code></div>';

  var urlInput = d.querySelector('.mfi-bg-url') as HTMLInputElement | null;
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
    onChange(typeof ctx.buildBgImageValue === 'function' ? ctx.buildBgImageValue(next) : (next ? 'url("' + next.replace(/"/g, '\"') + '")' : 'none'));
    syncPreview(next);
  }

  if (applyBtn && urlInput) applyBtn.addEventListener('click', function(){ applyUrl(urlInput.value); });
  if (clearBtn && urlInput) clearBtn.addEventListener('click', function(){ urlInput.value = ''; applyUrl(''); });
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
