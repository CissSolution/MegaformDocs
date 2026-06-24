// ============================================================
// MegaForm Builder — Image Choice Designer (v20260601-B27)
// File: src/builder/imagechoice-designer.ts
//
// Modal popup that lets the author manage every option of an
// ImageChoice field — per-option image upload / gallery picker,
// label / description / price + global settings (columns,
// multi-select, card style, accent color).
// ============================================================
// @ts-nocheck
'use strict';

(function () {
  if ((window as any).__MFImageChoiceDesignerLoaded) return;
  (window as any).__MFImageChoiceDesignerLoaded = true;

  var B: any = (window as any).MegaFormBuilder;
  if (!B) return;

  var CARD_STYLES = [
    { id: 'bordered', label: 'Bordered', desc: 'Solid border around each card.', icon: 'fa-square' },
    { id: 'shadow',   label: 'Shadow',   desc: 'Soft drop-shadow, no border.',  icon: 'fa-clone' },
    { id: 'minimal',  label: 'Minimal',  desc: 'No border, no shadow.',         icon: 'fa-grip' }
  ];

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

  function ensureOptions(field: any): any[] {
    if (!Array.isArray(field.options)) field.options = [];
    return field.options;
  }
  function slugify(s: string): string {
    return String(s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '_').slice(0, 40) || 'opt';
  }

  function open(field: any, onClose?: () => void) {
    if (!field || field.type !== 'ImageChoice') {
      B.showToast && B.showToast('Image Choice Designer only works for ImageChoice', 'error');
      return;
    }
    var wp = field.widgetProps = field.widgetProps || {};
    if (typeof wp.columns !== 'number' && typeof wp.columns !== 'string') wp.columns = 3;
    if (typeof wp.multiSelect !== 'boolean') wp.multiSelect = false;
    if (typeof wp.showPrice !== 'boolean') wp.showPrice = false;
    if (typeof wp.showDescription !== 'boolean') wp.showDescription = true;
    if (typeof wp.cardStyle !== 'string') wp.cardStyle = 'bordered';
    if (typeof wp.selectedColor !== 'string') wp.selectedColor = '#4f46e5';

    var existing = document.getElementById('mf-ic-designer-modal');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var modal = document.createElement('div');
    modal.id = 'mf-ic-designer-modal';
    modal.className = 'mf-token-designer-backdrop';
    modal.setAttribute('data-mf-overlay', '1'); // [B30] survive Builder fullscreen takeover
    modal.innerHTML =
      '<div class="mf-token-designer-shell mf-slider-designer-shell" role="dialog" aria-label="Image Choice Designer">' +
        '<div class="mf-token-designer-head">' +
          '<div class="mf-token-designer-title">' +
            '<i class="fas fa-th"></i>' +
            '<span>Image Choice Designer</span>' +
            '<span class="mf-token-designer-badge">v20260601-B27</span>' +
          '</div>' +
          '<button type="button" class="mf-token-designer-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="mf-token-designer-tabs">' +
          '<button type="button" class="mf-token-designer-tab active" data-tab="style"><i class="fas fa-palette"></i> Style</button>' +
          '<button type="button" class="mf-token-designer-tab" data-tab="options"><i class="fas fa-images"></i> Options <span class="mf-token-designer-count" id="mf-ic-designer-count">0</span></button>' +
          '<button type="button" class="mf-token-designer-tab" data-tab="settings"><i class="fas fa-sliders-h"></i> Settings</button>' +
        '</div>' +
        '<div class="mf-token-designer-body">' +
          '<div class="mf-token-designer-pane" data-pane="style"></div>' +
          '<div class="mf-token-designer-pane" data-pane="options" style="display:none"></div>' +
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
    var paneOptions = modal.querySelector('[data-pane="options"]') as HTMLElement;
    var paneSettings = modal.querySelector('[data-pane="settings"]') as HTMLElement;
    var countBadge = modal.querySelector('#mf-ic-designer-count') as HTMLElement;
    function refreshCount() { countBadge.textContent = String((field.options || []).length); }

    // ── Style pane ────────────────────────────────────────────
    function renderStylePane() {
      paneStyle.innerHTML = '';
      var grid = document.createElement('div');
      grid.className = 'mf-slider-designer-style-grid';
      CARD_STYLES.forEach(function (s) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'mf-slider-designer-style-card' + (wp.cardStyle === s.id ? ' is-active' : '');
        card.innerHTML =
          '<div class="mf-slider-designer-style-preview mf-ic-preview-' + s.id + '">' +
            '<i class="fas ' + s.icon + '"></i>' +
          '</div>' +
          '<div class="mf-slider-designer-style-label">' + B.escHtml(s.label) + '</div>' +
          '<div class="mf-slider-designer-style-desc">' + B.escHtml(s.desc) + '</div>';
        card.addEventListener('click', function () {
          wp.cardStyle = s.id;
          B.state.isDirty = true;
          Array.prototype.forEach.call(grid.querySelectorAll('.mf-slider-designer-style-card'), function (c: HTMLElement) { c.classList.remove('is-active'); });
          card.classList.add('is-active');
        });
        grid.appendChild(card);
      });
      paneStyle.appendChild(grid);

      var color = document.createElement('div');
      color.className = 'mf-token-row';
      color.style.marginTop = '12px';
      color.innerHTML =
        '<label class="mf-token-row-label">Accent color (selected card)</label>' +
        '<input type="color" class="mf-ic-accent" value="' + B.escAttr(wp.selectedColor || '#4f46e5') + '" style="width:120px;height:36px;border:1px solid #cbd5e1;border-radius:8px;padding:2px"/>';
      paneStyle.appendChild(color);
      (color.querySelector('.mf-ic-accent') as HTMLInputElement).addEventListener('input', function (e: any) {
        wp.selectedColor = e.target.value; B.state.isDirty = true;
      });
    }

    // ── Options pane ──────────────────────────────────────────
    function renderOptionsPane() {
      paneOptions.innerHTML = '';
      var opts = ensureOptions(field);

      var toolbar = document.createElement('div');
      toolbar.className = 'mf-slider-designer-toolbar';
      toolbar.innerHTML =
        '<button type="button" class="mf-builder-btn mf-ic-designer-add"><i class="fas fa-plus"></i> Add option</button>' +
        '<span class="mf-slider-designer-toolbar-hint">Each option becomes a selectable image card on the published form.</span>';
      paneOptions.appendChild(toolbar);

      var list = document.createElement('div');
      list.className = 'mf-slider-designer-slides';
      paneOptions.appendChild(list);

      function rerender() { renderOptionsPane(); refreshCount(); }

      toolbar.querySelector('.mf-ic-designer-add')!.addEventListener('click', function () {
        var n = opts.length + 1;
        opts.push({ value: 'opt' + n, label: 'Option ' + n, image: '', description: '', price: '' });
        B.state.isDirty = true;
        rerender();
      });

      if (!opts.length) {
        var empty = document.createElement('div');
        empty.className = 'mf-token-designer-empty';
        empty.innerHTML = '<i class="fas fa-circle-info"></i> No options yet. Click <strong>Add option</strong> to create the first one.';
        list.appendChild(empty);
        return;
      }

      opts.forEach(function (opt: any, idx: number) {
        var row = document.createElement('div');
        row.className = 'mf-token-row mf-slider-designer-row';
        row.innerHTML =
          '<div class="mf-slider-designer-row-head">' +
            '<span class="mf-slider-designer-grip" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>' +
            '<span class="mf-slider-designer-row-label">Option ' + (idx + 1) + '</span>' +
            '<div class="mf-slider-designer-row-actions">' +
              '<button type="button" class="mf-builder-btn mf-ic-up" title="Move up" ' + (idx === 0 ? 'disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
              '<button type="button" class="mf-builder-btn mf-ic-down" title="Move down" ' + (idx === opts.length - 1 ? 'disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
              '<button type="button" class="mf-builder-btn mf-ic-remove" title="Remove"><i class="fas fa-trash"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="mf-slider-designer-row-body">' +
            '<div class="mf-token-image-preview mf-slider-designer-thumb">' +
              (opt.image
                ? '<img src="' + B.escAttr(opt.image) + '" alt="" onerror="this.style.opacity=.25"/>'
                : '<span class="mf-token-image-empty"><i class="fas fa-image"></i><br>no image</span>') +
            '</div>' +
            '<div class="mf-slider-designer-row-fields">' +
              '<div class="mf-token-image-buttons" style="margin-bottom:6px">' +
                '<button type="button" class="mf-builder-btn mf-ic-upload"><i class="fas fa-cloud-upload-alt"></i> Upload</button>' +
                '<button type="button" class="mf-builder-btn mf-ic-gallery"><i class="fas fa-images"></i> Gallery</button>' +
              '</div>' +
              '<label class="mf-slider-designer-mini-label">Image URL</label>' +
              '<input type="text" class="mf-token-row-input mf-ic-url" value="' + B.escAttr(opt.image || '') + '" placeholder="https://… or /Portals/0/MegaForm/Images/…"/>' +
              '<div class="mf-slider-designer-grid2">' +
                '<div><label class="mf-slider-designer-mini-label">Label</label><input type="text" class="mf-token-row-input mf-ic-label" value="' + B.escAttr(opt.label || '') + '"/></div>' +
                '<div><label class="mf-slider-designer-mini-label">Value (key)</label><input type="text" class="mf-token-row-input mf-ic-value" value="' + B.escAttr(opt.value || '') + '"/></div>' +
              '</div>' +
              '<label class="mf-slider-designer-mini-label">Description</label>' +
              '<textarea class="mf-token-row-input mf-ic-desc" rows="2">' + B.escHtml(opt.description || '') + '</textarea>' +
              '<label class="mf-slider-designer-mini-label">Price (optional, shown if "Show price" is on)</label>' +
              '<input type="text" class="mf-token-row-input mf-ic-price" value="' + B.escAttr(String(opt.price == null ? '' : opt.price)) + '" placeholder="29.99 or $29"/>' +
            '</div>' +
          '</div>';
        list.appendChild(row);

        var thumb = row.querySelector('.mf-slider-designer-thumb') as HTMLElement;
        var urlInp = row.querySelector('.mf-ic-url') as HTMLInputElement;
        var labelInp = row.querySelector('.mf-ic-label') as HTMLInputElement;
        var valueInp = row.querySelector('.mf-ic-value') as HTMLInputElement;
        var descInp = row.querySelector('.mf-ic-desc') as HTMLTextAreaElement;
        var priceInp = row.querySelector('.mf-ic-price') as HTMLInputElement;
        var btnUpload = row.querySelector('.mf-ic-upload') as HTMLButtonElement;
        var btnGallery = row.querySelector('.mf-ic-gallery') as HTMLButtonElement;
        var btnUp = row.querySelector('.mf-ic-up') as HTMLButtonElement;
        var btnDown = row.querySelector('.mf-ic-down') as HTMLButtonElement;
        var btnRemove = row.querySelector('.mf-ic-remove') as HTMLButtonElement;

        function setImg(u: string) {
          opt.image = u;
          urlInp.value = u;
          thumb.innerHTML = u
            ? '<img src="' + B.escAttr(u) + '" alt="" onerror="this.style.opacity=.25"/>'
            : '<span class="mf-token-image-empty"><i class="fas fa-image"></i><br>no image</span>';
          B.state.isDirty = true;
        }
        urlInp.addEventListener('input', function () { setImg(urlInp.value); });
        labelInp.addEventListener('input', function () {
          opt.label = labelInp.value;
          // Auto-fill empty value with slugified label
          if (!opt.value || opt.value === slugify(opt._lastLabel || '')) {
            opt.value = slugify(labelInp.value);
            valueInp.value = opt.value;
          }
          opt._lastLabel = labelInp.value;
          B.state.isDirty = true;
        });
        valueInp.addEventListener('input', function () {
          opt.value = valueInp.value.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
          valueInp.value = opt.value;
          B.state.isDirty = true;
        });
        descInp.addEventListener('input', function () { opt.description = descInp.value; B.state.isDirty = true; });
        priceInp.addEventListener('input', function () {
          var raw = priceInp.value.trim();
          opt.price = raw === '' ? '' : (isFinite(Number(raw)) ? Number(raw) : raw);
          B.state.isDirty = true;
        });
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
                setImg(u);
                if (B.showToast) B.showToast('Image uploaded', 'success');
              })
              .catch(function (err: any) {
                var msg = (err && err.message) || String(err);
                if (B.showToast) B.showToast('Upload failed: ' + msg, 'error'); else alert('Upload failed: ' + msg);
              })
              .then(function () { btnUpload.disabled = false; btnUpload.innerHTML = oldHtml; });
          });
          inp.click();
        });
        btnGallery.addEventListener('click', function () { openGalleryPicker(function (u) { setImg(u); }); });
        btnUp.addEventListener('click', function () {
          if (idx <= 0) return;
          var prev = opts[idx - 1]; opts[idx - 1] = opts[idx]; opts[idx] = prev;
          B.state.isDirty = true; rerender();
        });
        btnDown.addEventListener('click', function () {
          if (idx >= opts.length - 1) return;
          var next = opts[idx + 1]; opts[idx + 1] = opts[idx]; opts[idx] = next;
          B.state.isDirty = true; rerender();
        });
        btnRemove.addEventListener('click', function () {
          if (!confirm('Remove this option?')) return;
          opts.splice(idx, 1); B.state.isDirty = true; rerender();
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
          '<label class="mf-token-row-label">Columns</label>' +
          '<select class="mf-token-row-input mf-ic-s-cols">' +
            '<option value="2"' + (String(wp.columns) === '2' ? ' selected' : '') + '>2 columns</option>' +
            '<option value="3"' + (String(wp.columns) === '3' ? ' selected' : '') + '>3 columns</option>' +
            '<option value="4"' + (String(wp.columns) === '4' ? ' selected' : '') + '>4 columns</option>' +
          '</select>' +
        '</div>' +
        '<div class="mf-token-row">' +
          '<label class="mf-token-row-label">Selection</label>' +
          '<label class="mf-slider-designer-mini-label"><input type="checkbox" class="mf-ic-s-multi"' + (wp.multiSelect ? ' checked' : '') + ' style="margin-right:6px"/> Allow multiple selection</label>' +
        '</div>' +
        '<div class="mf-token-row">' +
          '<label class="mf-token-row-label">Display</label>' +
          '<label class="mf-slider-designer-mini-label"><input type="checkbox" class="mf-ic-s-showdesc"' + (wp.showDescription ? ' checked' : '') + ' style="margin-right:6px"/> Show description under label</label>' +
          '<label class="mf-slider-designer-mini-label"><input type="checkbox" class="mf-ic-s-showprice"' + (wp.showPrice ? ' checked' : '') + ' style="margin-right:6px"/> Show price under description</label>' +
        '</div>';
      paneSettings.appendChild(grid);
      (grid.querySelector('.mf-ic-s-cols') as HTMLSelectElement).addEventListener('change', function (e: any) { wp.columns = e.target.value; B.state.isDirty = true; });
      (grid.querySelector('.mf-ic-s-multi') as HTMLInputElement).addEventListener('change', function (e: any) { wp.multiSelect = !!e.target.checked; B.state.isDirty = true; });
      (grid.querySelector('.mf-ic-s-showdesc') as HTMLInputElement).addEventListener('change', function (e: any) { wp.showDescription = !!e.target.checked; B.state.isDirty = true; });
      (grid.querySelector('.mf-ic-s-showprice') as HTMLInputElement).addEventListener('change', function (e: any) { wp.showPrice = !!e.target.checked; B.state.isDirty = true; });
    }

    renderStylePane();
    renderOptionsPane();
    renderSettingsPane();
    refreshCount();
  }

  (window as any).MFImageChoiceDesigner = { open: open };
})();
