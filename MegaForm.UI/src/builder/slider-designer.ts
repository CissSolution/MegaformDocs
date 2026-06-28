// ============================================================
// MegaForm Builder — Content Slider Designer (v20260601-B27)
// File: src/builder/slider-designer.ts
//
// Modal popup that lets the author manage every slide of a
// ContentSlider field in one place — pick slider style, edit
// per-slide text fields, upload images or pick from the
// shared image gallery (powered by MFTokenDesigner helpers).
// ============================================================
// @ts-nocheck
'use strict';

(function () {
  if ((window as any).__MFSliderDesignerLoaded) return;
  (window as any).__MFSliderDesignerLoaded = true;

  var B: any = (window as any).MegaFormBuilder;
  if (!B) return;

  // 3 ready-made templates the author picks from — each drives `data-style`
  // on the rendered widget (see megaform-widget-content-slider.ts). Pick once,
  // edit the slides, done — no markup to write by hand.
  var STYLES = [
    { id: 'overlay', label: 'Overlay', desc: 'Full-bleed photo with the title, caption and dots floating on top. Bold, editorial, swipe-first. Ken Burns zoom + autoplay.', icon: 'fa-image' },
    { id: 'card',    label: 'Card',    desc: 'Photo on top, caption panel below with dots + a counter. Clean and easy to read.', icon: 'fa-id-card' },
    { id: 'cards',   label: 'Cards',   desc: 'A row of product cards that scrolls 1–3 at a time. Great for catalogues and showcases.', icon: 'fa-th-large' }
  ];

  // Tiny inline-styled mock of each template so the picker reads as a visual
  // gallery (the designer ships no dedicated CSS for these tiles).
  function stylePreviewHtml(id: string): string {
    var ACCENT = '#0ea5e9';
    if (id === 'card') {
      return '<div style="display:flex;flex-direction:column;width:100%;height:100%;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;background:#fff;">' +
        '<div style="flex:1;background:linear-gradient(135deg,#94a3b8,#cbd5e1);"></div>' +
        '<div style="padding:6px 7px;background:#fff;">' +
          '<div style="width:62%;height:6px;border-radius:3px;background:#334155;"></div>' +
          '<div style="width:84%;height:4px;border-radius:3px;background:#cbd5e1;margin-top:4px;"></div>' +
          '<div style="display:flex;gap:3px;margin-top:6px;align-items:center;"><span style="width:12px;height:4px;border-radius:3px;background:' + ACCENT + ';"></span><span style="width:4px;height:4px;border-radius:3px;background:#cbd5e1;"></span><span style="width:4px;height:4px;border-radius:3px;background:#cbd5e1;"></span></div>' +
        '</div>' +
      '</div>';
    }
    if (id === 'cards') {
      var card = '<div style="flex:1;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0;background:#fff;display:flex;flex-direction:column;">' +
          '<div style="height:54%;background:linear-gradient(135deg,#94a3b8,#cbd5e1);"></div>' +
          '<div style="padding:4px;"><div style="width:80%;height:4px;border-radius:2px;background:#334155;"></div><div style="width:55%;height:3px;border-radius:2px;background:#cbd5e1;margin-top:3px;"></div></div>' +
        '</div>';
      return '<div style="display:flex;gap:5px;width:100%;height:100%;align-items:stretch;padding:2px;">' + card + card + card + '</div>';
    }
    // overlay (default)
    return '<div style="position:relative;width:100%;height:100%;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;background:linear-gradient(135deg,#64748b,#94a3b8);">' +
      '<span style="position:absolute;left:6px;top:6px;padding:1px 6px;border-radius:999px;background:' + ACCENT + ';color:#fff;font-size:8px;font-weight:700;">Badge</span>' +
      '<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.85),rgba(0,0,0,0) 70%);"></div>' +
      '<div style="position:absolute;left:7px;bottom:14px;"><div style="width:70px;height:6px;border-radius:3px;background:#fff;"></div><div style="width:96px;height:4px;border-radius:3px;background:rgba(255,255,255,.7);margin-top:4px;"></div></div>' +
      '<div style="position:absolute;left:50%;transform:translateX(-50%);bottom:5px;display:flex;gap:3px;align-items:center;padding:3px 6px;border-radius:999px;background:rgba(0,0,0,.3);"><span style="width:12px;height:4px;border-radius:3px;background:#fff;"></span><span style="width:4px;height:4px;border-radius:3px;background:rgba(255,255,255,.6);"></span><span style="width:4px;height:4px;border-radius:3px;background:rgba(255,255,255,.6);"></span></div>' +
    '</div>';
  }

  function uploadImage(file: File): Promise<string> {
    var td: any = (window as any).MFTokenDesigner;
    if (td && td.uploadImage) return td.uploadImage(file);
    return Promise.reject(new Error('Upload helper missing'));
  }
  function openGalleryPicker(onPick: (url: string) => void) {
    var td: any = (window as any).MFTokenDesigner;
    if (td && td.openGalleryPicker) td.openGalleryPicker(onPick);
    else B.showToast('Gallery helper missing', 'error');
  }

  function ensureItems(field: any): any[] {
    if (!field.widgetProps) field.widgetProps = {};
    if (!Array.isArray(field.widgetProps.items)) field.widgetProps.items = [];
    return field.widgetProps.items;
  }

  function open(field: any, onClose?: () => void) {
    if (!field || field.type !== 'ContentSlider') {
      B.showToast && B.showToast('Slider Designer only works for ContentSlider', 'error');
      return;
    }
    var wp = field.widgetProps = field.widgetProps || {};
    if (!Array.isArray(wp.items)) wp.items = [];
    if (typeof wp.style !== 'string') wp.style = 'overlay';
    // fold retired style ids (fade/minimal/kenburns) into the closest template
    if (wp.style === 'fade' || wp.style === 'minimal' || wp.style === 'kenburns') wp.style = 'overlay';
    if (typeof wp.radius !== 'number') wp.radius = 18;
    if (typeof wp.height !== 'number') wp.height = (wp.style === 'card' ? 176 : (wp.style === 'cards' ? 240 : 224));
    if (typeof wp.interval !== 'number') wp.interval = 4000;
    if (typeof wp.autoplay !== 'boolean') wp.autoplay = true;
    if (wp.imageFit !== 'contain' && wp.imageFit !== 'cover') wp.imageFit = 'cover';

    var existing = document.getElementById('mf-slider-designer-modal');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var modal = document.createElement('div');
    modal.id = 'mf-slider-designer-modal';
    modal.className = 'mf-token-designer-backdrop';
    modal.setAttribute('data-mf-overlay', '1'); // [B30] survive Builder fullscreen takeover
    modal.innerHTML =
      '<div class="mf-token-designer-shell mf-slider-designer-shell" role="dialog" aria-label="Slider Designer">' +
        '<div class="mf-token-designer-head">' +
          '<div class="mf-token-designer-title">' +
            '<i class="fas fa-images"></i>' +
            '<span>Slider Designer</span>' +
            '<span class="mf-token-designer-badge">v20260601-B27</span>' +
          '</div>' +
          '<button type="button" class="mf-token-designer-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="mf-token-designer-tabs">' +
          '<button type="button" class="mf-token-designer-tab active" data-tab="style"><i class="fas fa-palette"></i> Style</button>' +
          '<button type="button" class="mf-token-designer-tab" data-tab="slides"><i class="fas fa-images"></i> Slides <span class="mf-token-designer-count" id="mf-slider-designer-count">0</span></button>' +
          '<button type="button" class="mf-token-designer-tab" data-tab="settings"><i class="fas fa-sliders-h"></i> Settings</button>' +
        '</div>' +
        '<div class="mf-token-designer-body">' +
          '<div class="mf-token-designer-pane" data-pane="style"></div>' +
          '<div class="mf-token-designer-pane" data-pane="slides" style="display:none"></div>' +
          '<div class="mf-token-designer-pane" data-pane="settings" style="display:none"></div>' +
        '</div>' +
        '<div class="mf-token-designer-foot">' +
          '<div class="mf-token-designer-foot-hint"><i class="fas fa-info-circle"></i> Changes save into the field. Press <kbd>Esc</kbd> to close.</div>' +
          '<button type="button" class="mf-builder-btn mf-token-designer-done"><i class="fas fa-check"></i> Done</button>' +
        '</div>' +
      '</div>';
    // [B31] mount inside Builder shell to dodge fullscreen-takeover
    var __mt: HTMLElement = (document.getElementById('mf-builder-root') || document.body) as HTMLElement;
    __mt.appendChild(modal);

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

    // Tabs
    Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-tab'), function (t: HTMLElement) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-tab'), function (x: HTMLElement) { x.classList.remove('active'); });
        t.classList.add('active');
        var name = t.getAttribute('data-tab');
        Array.prototype.forEach.call(modal.querySelectorAll('.mf-token-designer-pane'), function (p: HTMLElement) {
          (p as any).style.display = (p.getAttribute('data-pane') === name) ? '' : 'none';
        });
      });
    });

    var paneStyle = modal.querySelector('[data-pane="style"]') as HTMLElement;
    var paneSlides = modal.querySelector('[data-pane="slides"]') as HTMLElement;
    var paneSettings = modal.querySelector('[data-pane="settings"]') as HTMLElement;
    var countBadge = modal.querySelector('#mf-slider-designer-count') as HTMLElement;

    function refreshCount() { countBadge.textContent = String((wp.items || []).length); }

    // ── Style pane ────────────────────────────────────────────
    function renderStylePane() {
      paneStyle.innerHTML = '';
      var grid = document.createElement('div');
      grid.className = 'mf-slider-designer-style-grid';
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;';
      STYLES.forEach(function (s) {
        var active = wp.style === s.id;
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'mf-slider-designer-style-card' + (active ? ' is-active' : '');
        card.setAttribute('data-style-id', s.id);
        card.style.cssText = 'display:flex;flex-direction:column;gap:8px;text-align:left;padding:10px;border-radius:14px;cursor:pointer;background:#fff;border:1.5px solid ' + (active ? '#0ea5e9' : '#e2e8f0') + ';box-shadow:' + (active ? '0 8px 22px -12px rgba(14,165,233,.5)' : 'none') + ';transition:border-color .15s ease, box-shadow .15s ease;';
        card.innerHTML =
          '<div class="mf-slider-designer-style-preview" style="height:86px;border-radius:10px;overflow:hidden;background:#f1f5f9;">' + stylePreviewHtml(s.id) + '</div>' +
          '<div class="mf-slider-designer-style-label" style="font-weight:800;font-size:13px;color:#0f172a;display:flex;align-items:center;gap:6px;">' +
            '<i class="fas ' + s.icon + '" style="color:#0ea5e9;"></i>' + B.escHtml(s.label) +
            (active ? '<span style="margin-left:auto;color:#0ea5e9;font-size:12px;"><i class="fas fa-check-circle"></i></span>' : '') +
          '</div>' +
          '<div class="mf-slider-designer-style-desc" style="font-size:11px;line-height:1.45;color:#64748b;">' + B.escHtml(s.desc) + '</div>';
        card.addEventListener('click', function () {
          wp.style = s.id;
          B.state.isDirty = true;
          renderStylePane();
        });
        grid.appendChild(card);
      });
      var hint = document.createElement('div');
      hint.style.cssText = 'margin-top:12px;font-size:11px;color:#64748b;display:flex;align-items:center;gap:6px;';
      hint.innerHTML = '<i class="fas fa-circle-info"></i> Pick a template, then add your photos in the <strong>Slides</strong> tab. The form preview updates when you press Done.';
      paneStyle.appendChild(grid);
      paneStyle.appendChild(hint);
    }

    // ── Slides pane ───────────────────────────────────────────
    function renderSlidesPane() {
      paneSlides.innerHTML = '';
      var items = ensureItems(field);

      var toolbar = document.createElement('div');
      toolbar.className = 'mf-slider-designer-toolbar';
      toolbar.innerHTML =
        '<button type="button" class="mf-builder-btn mf-slider-designer-add"><i class="fas fa-plus"></i> Add slide</button>' +
        '<span class="mf-slider-designer-toolbar-hint">Reorder by dragging the grip. Cards auto-update on save.</span>';
      paneSlides.appendChild(toolbar);

      var list = document.createElement('div');
      list.className = 'mf-slider-designer-slides';
      paneSlides.appendChild(list);

      function rerender() { renderSlidesPane(); refreshCount(); }

      toolbar.querySelector('.mf-slider-designer-add')!.addEventListener('click', function () {
        items.push({ imageUrl: '', title: 'New slide', description: '', badge: '', meta: '' });
        B.state.isDirty = true;
        rerender();
      });

      if (!items.length) {
        var empty = document.createElement('div');
        empty.className = 'mf-token-designer-empty';
        empty.innerHTML = '<i class="fas fa-circle-info"></i> No slides yet. Click <strong>Add slide</strong> to create the first one.';
        list.appendChild(empty);
        return;
      }

      items.forEach(function (it: any, idx: number) {
        var row = document.createElement('div');
        row.className = 'mf-token-row mf-slider-designer-row';
        row.innerHTML =
          '<div class="mf-slider-designer-row-head">' +
            '<span class="mf-slider-designer-grip" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>' +
            '<span class="mf-slider-designer-row-label">Slide ' + (idx + 1) + '</span>' +
            '<div class="mf-slider-designer-row-actions">' +
              '<button type="button" class="mf-builder-btn mf-slider-designer-up" title="Move up" ' + (idx === 0 ? 'disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
              '<button type="button" class="mf-builder-btn mf-slider-designer-down" title="Move down" ' + (idx === items.length - 1 ? 'disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
              '<button type="button" class="mf-builder-btn mf-slider-designer-remove" title="Remove"><i class="fas fa-trash"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="mf-slider-designer-row-body">' +
            '<div class="mf-token-image-preview mf-slider-designer-thumb">' +
              (it.imageUrl
                ? '<img src="' + B.escAttr(it.imageUrl) + '" alt="" onerror="this.style.opacity=.25"/>'
                : '<span class="mf-token-image-empty"><i class="fas fa-image"></i><br>no image</span>') +
            '</div>' +
            '<div class="mf-slider-designer-row-fields">' +
              '<div class="mf-token-image-buttons" style="margin-bottom:6px">' +
                '<button type="button" class="mf-builder-btn mf-slider-designer-upload"><i class="fas fa-cloud-upload-alt"></i> Upload</button>' +
                '<button type="button" class="mf-builder-btn mf-slider-designer-gallery"><i class="fas fa-images"></i> Gallery</button>' +
              '</div>' +
              '<label class="mf-slider-designer-mini-label">Image URL</label>' +
              '<input type="text" class="mf-token-row-input mf-slider-designer-url" value="' + B.escAttr(it.imageUrl || '') + '" placeholder="https://… or /Portals/0/MegaForm/Images/…"/>' +
              '<div class="mf-slider-designer-grid2">' +
                '<div><label class="mf-slider-designer-mini-label">Title</label><input type="text" class="mf-token-row-input mf-slider-designer-title" value="' + B.escAttr(it.title || '') + '"/></div>' +
                '<div><label class="mf-slider-designer-mini-label">Badge</label><input type="text" class="mf-token-row-input mf-slider-designer-badge" value="' + B.escAttr(it.badge || '') + '" placeholder="NEW / SALE"/></div>' +
              '</div>' +
              '<label class="mf-slider-designer-mini-label">Description</label>' +
              '<textarea class="mf-token-row-input mf-slider-designer-desc" rows="2">' + B.escHtml(it.description || '') + '</textarea>' +
              '<label class="mf-slider-designer-mini-label">Meta / Price</label>' +
              '<input type="text" class="mf-token-row-input mf-slider-designer-meta" value="' + B.escAttr(it.meta || '') + '" placeholder="$29.99"/>' +
            '</div>' +
          '</div>';
        list.appendChild(row);

        var thumb = row.querySelector('.mf-slider-designer-thumb') as HTMLElement;
        var urlInp = row.querySelector('.mf-slider-designer-url') as HTMLInputElement;
        var titleInp = row.querySelector('.mf-slider-designer-title') as HTMLInputElement;
        var descInp = row.querySelector('.mf-slider-designer-desc') as HTMLTextAreaElement;
        var badgeInp = row.querySelector('.mf-slider-designer-badge') as HTMLInputElement;
        var metaInp = row.querySelector('.mf-slider-designer-meta') as HTMLInputElement;
        var btnUpload = row.querySelector('.mf-slider-designer-upload') as HTMLButtonElement;
        var btnGallery = row.querySelector('.mf-slider-designer-gallery') as HTMLButtonElement;
        var btnUp = row.querySelector('.mf-slider-designer-up') as HTMLButtonElement;
        var btnDown = row.querySelector('.mf-slider-designer-down') as HTMLButtonElement;
        var btnRemove = row.querySelector('.mf-slider-designer-remove') as HTMLButtonElement;

        function setUrl(u: string) {
          it.imageUrl = u;
          urlInp.value = u;
          thumb.innerHTML = u
            ? '<img src="' + B.escAttr(u) + '" alt="" onerror="this.style.opacity=.25"/>'
            : '<span class="mf-token-image-empty"><i class="fas fa-image"></i><br>no image</span>';
          B.state.isDirty = true;
        }

        urlInp.addEventListener('input', function () { setUrl(urlInp.value); });
        titleInp.addEventListener('input', function () { it.title = titleInp.value; B.state.isDirty = true; });
        descInp.addEventListener('input', function () { it.description = descInp.value; B.state.isDirty = true; });
        badgeInp.addEventListener('input', function () { it.badge = badgeInp.value; B.state.isDirty = true; });
        metaInp.addEventListener('input', function () { it.meta = metaInp.value; B.state.isDirty = true; });

        btnUpload.addEventListener('click', function () {
          var inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = 'image/*';
          inp.addEventListener('change', function () {
            var f = inp.files && inp.files[0]; if (!f) return;
            btnUpload.disabled = true;
            var oldHtml = btnUpload.innerHTML;
            btnUpload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…';
            uploadImage(f)
              .then(function (u: string) {
                setUrl(u);
                if (B.toast) B.toast('Image uploaded', 'success');
                else if (B.showToast) B.showToast('Image uploaded', 'success');
              })
              .catch(function (err: any) {
                var msg = (err && err.message) || String(err);
                if (B.showToast) B.showToast('Upload failed: ' + msg, 'error'); else alert('Upload failed: ' + msg);
              })
              .then(function () { btnUpload.disabled = false; btnUpload.innerHTML = oldHtml; });
          });
          inp.click();
        });
        btnGallery.addEventListener('click', function () {
          openGalleryPicker(function (u) { setUrl(u); });
        });
        btnUp.addEventListener('click', function () {
          if (idx <= 0) return;
          var prev = items[idx - 1];
          items[idx - 1] = items[idx];
          items[idx] = prev;
          B.state.isDirty = true;
          rerender();
        });
        btnDown.addEventListener('click', function () {
          if (idx >= items.length - 1) return;
          var next = items[idx + 1];
          items[idx + 1] = items[idx];
          items[idx] = next;
          B.state.isDirty = true;
          rerender();
        });
        btnRemove.addEventListener('click', function () {
          if (!confirm('Remove this slide?')) return;
          items.splice(idx, 1);
          B.state.isDirty = true;
          rerender();
        });
      });
    }

    // ── Settings pane ─────────────────────────────────────────
    function renderSettingsPane() {
      paneSettings.innerHTML = '';
      var grid = document.createElement('div');
      grid.className = 'mf-slider-designer-settings-grid';
      grid.innerHTML =
        '<div class="mf-token-row">' +
          '<label class="mf-token-row-label">Height (px)</label>' +
          '<input type="number" min="120" max="640" step="20" class="mf-token-row-input mf-slider-s-height" value="' + Number(wp.height || 240) + '"/>' +
        '</div>' +
        '<div class="mf-token-row">' +
          '<label class="mf-token-row-label">Corner radius (px)</label>' +
          '<input type="number" min="0" max="48" step="2" class="mf-token-row-input mf-slider-s-radius" value="' + Number(wp.radius != null ? wp.radius : 18) + '"/>' +
        '</div>' +
        '<div class="mf-token-row">' +
          '<label class="mf-token-row-label">Image fit</label>' +
          '<select class="mf-token-row-input mf-slider-s-fit">' +
            '<option value="cover"' + (wp.imageFit === 'cover' ? ' selected' : '') + '>Cover (crop to fill)</option>' +
            '<option value="contain"' + (wp.imageFit === 'contain' ? ' selected' : '') + '>Contain (fit inside)</option>' +
          '</select>' +
        '</div>' +
        '<div class="mf-token-row">' +
          '<label class="mf-token-row-label">' +
            '<input type="checkbox" class="mf-slider-s-autoplay"' + (wp.autoplay ? ' checked' : '') + ' style="margin-right:6px"/> Autoplay' +
          '</label>' +
          '<label class="mf-slider-designer-mini-label" style="margin-top:8px">Interval (ms)</label>' +
          '<input type="number" min="1500" max="12000" step="500" class="mf-token-row-input mf-slider-s-interval" value="' + Number(wp.interval || 4000) + '"/>' +
        '</div>';
      paneSettings.appendChild(grid);
      (grid.querySelector('.mf-slider-s-height') as HTMLInputElement).addEventListener('input', function (e: any) {
        wp.height = Math.max(120, Math.min(640, Number(e.target.value) || 240)); B.state.isDirty = true;
      });
      (grid.querySelector('.mf-slider-s-radius') as HTMLInputElement).addEventListener('input', function (e: any) {
        wp.radius = Math.max(0, Math.min(48, Number(e.target.value) || 0)); B.state.isDirty = true;
      });
      (grid.querySelector('.mf-slider-s-fit') as HTMLSelectElement).addEventListener('change', function (e: any) {
        wp.imageFit = e.target.value === 'contain' ? 'contain' : 'cover'; B.state.isDirty = true;
      });
      (grid.querySelector('.mf-slider-s-autoplay') as HTMLInputElement).addEventListener('change', function (e: any) {
        wp.autoplay = !!e.target.checked; B.state.isDirty = true;
      });
      (grid.querySelector('.mf-slider-s-interval') as HTMLInputElement).addEventListener('input', function (e: any) {
        wp.interval = Math.max(1500, Math.min(12000, Number(e.target.value) || 4000)); B.state.isDirty = true;
      });
    }

    renderStylePane();
    renderSlidesPane();
    renderSettingsPane();
    refreshCount();
  }

  (window as any).MFSliderDesigner = { open: open };
})();
