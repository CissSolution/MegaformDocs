(function (global: any) {
  'use strict';

  var BADGE = 'MfpContentSlider v20260414-03';

  interface AnyObj { [key: string]: any; }
  interface SliderItem {
    imageUrl: string;
    title: string;
    description: string;
    badge: string;
    meta: string;
    alt: string;
  }
  interface SliderProps {
    height: number;
    autoplay: boolean;
    interval: number;
    imageFit: string;
    items: SliderItem[];
  }

  var MegaFormWidgets = global.MegaFormWidgets = global.MegaFormWidgets || {
    _registry: {} as Record<string, any>,
    register: function (name: string, widget: any) { this._registry[name] = widget; }
  };

  function escHtml(v: any): string {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escAttr(v: any): string { return escHtml(v); }
  function safeJson(v: any): any {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(String(v)); } catch (_err) { return null; }
  }
  function toBool(v: any, fallback: boolean): boolean {
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === '1' || v === 1) return true;
    if (v === 'false' || v === '0' || v === 0) return false;
    return fallback;
  }
  function toNum(v: any, fallback: number): number {
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }
  function toText(v: any, fallback?: string): string {
    var out = String(v == null ? '' : v).trim();
    return out !== '' ? out : String(fallback == null ? '' : fallback);
  }
  function cssEscape(value: string): string {
    return String(value || '').replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }
  function fmtId(formId: number, key: string): string {
    var mf = global.MFUtil || {};
    if (mf && typeof mf.fmtId === 'function') return mf.fmtId(formId, key);
    return 'mf-' + formId + '-' + key;
  }
  function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

  function defaultItems(): SliderItem[] {
    return [
      {
        imageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=900&q=80',
        title: 'iPhone 16 Pro Max',
        description: 'Flagship phone with premium camera system and titanium design.',
        badge: 'Hot',
        meta: '34,990,000₫',
        alt: 'iPhone 16 Pro Max'
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80',
        title: 'MacBook Pro M4',
        description: 'Powerful laptop for creators and professionals.',
        badge: 'New',
        meta: '52,990,000₫',
        alt: 'MacBook Pro M4'
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=900&q=80',
        title: 'iPad Pro M4',
        description: 'Ultra-thin tablet with vibrant display and pro performance.',
        badge: '',
        meta: '28,990,000₫',
        alt: 'iPad Pro M4'
      }
    ];
  }

  function defaults(): SliderProps {
    return {
      height: 240,
      autoplay: true,
      interval: 4000,
      imageFit: 'cover',
      items: defaultItems()
    };
  }

  function normalizeItem(raw: any): SliderItem {
    raw = raw || {};
    return {
      imageUrl: toText(raw.imageUrl || raw.image || raw.src || ''),
      title: toText(raw.title || raw.name || 'Slide item'),
      description: toText(raw.description || raw.desc || ''),
      badge: toText(raw.badge || ''),
      meta: toText(raw.meta || raw.price || raw.subtitle || ''),
      alt: toText(raw.alt || raw.title || raw.name || 'Slide image')
    };
  }

  function mergeProps(field: AnyObj): SliderProps {
    var src = (field && field.widgetProps) || {};
    var d = defaults();
    var items = Array.isArray(src.items) ? src.items : d.items;
    var normalizedItems = items.map(normalizeItem).filter(function (it: SliderItem) {
      return !!(it.imageUrl || it.title || it.description || it.meta || it.badge);
    });
    if (!normalizedItems.length) normalizedItems.push.apply(normalizedItems, defaultItems());
    return {
      height: Math.max(120, Math.min(640, toNum(src.height, d.height))),
      autoplay: toBool(src.autoplay, d.autoplay),
      interval: Math.max(1500, Math.min(12000, toNum(src.interval, d.interval))),
      imageFit: toText(src.imageFit, d.imageFit) === 'contain' ? 'contain' : 'cover',
      items: normalizedItems
    };
  }

  function visibleCardsForViewport(): number {
    var w = window.innerWidth || 1280;
    if (w <= 560) return 1;
    if (w <= 920) return 2;
    return 3;
  }

  function render(field: AnyObj, formId: number): string {
    var props = mergeProps(field);
    var rootId = fmtId(formId, field.key || 'content_slider') + '-slider';
    var shellStyle = '--mfp-slider-height:' + props.height + 'px;--mfp-slider-fit:' + props.imageFit + ';';
    var html = '';
    html += '<div class="mfw-content-slider mfp-slider-widget"';
    html += ' id="' + escAttr(rootId) + '"';
    html += ' data-field-key="' + escAttr(field.key || '') + '"';
    html += ' data-autoplay="' + (props.autoplay ? '1' : '0') + '"';
    html += ' data-interval="' + escAttr(props.interval) + '"';
    html += ' style="' + escAttr(shellStyle) + '">';
    html += '<div class="mfp-slider-shell">';
    html += '<button type="button" class="mfp-slider-nav mfp-slider-prev" aria-label="Previous slide">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    html += '</button>';
    html += '<div class="mfp-slider-viewport">';
    html += '<div class="mfp-slider-track">';
    for (var i = 0; i < props.items.length; i++) {
      var item = props.items[i];
      html += '<article class="mfp-slider-card" data-slide-index="' + i + '">';
      html += '<div class="mfp-slider-media">';
      if (item.imageUrl) {
        html += '<img class="mfp-slider-image" src="' + escAttr(item.imageUrl) + '" alt="' + escAttr(item.alt || item.title || 'Slide image') + '" loading="lazy">';
      } else {
        html += '<div class="mfp-slider-image mfp-slider-image-placeholder"></div>';
      }
      if (item.badge) html += '<span class="mfp-slider-badge">' + escHtml(item.badge) + '</span>';
      html += '</div>';
      html += '<div class="mfp-slider-info">';
      if (item.title) html += '<h3 class="mfp-slider-title">' + escHtml(item.title) + '</h3>';
      if (item.description) html += '<p class="mfp-slider-description">' + escHtml(item.description) + '</p>';
      if (item.meta) html += '<div class="mfp-slider-meta">' + escHtml(item.meta) + '</div>';
      html += '</div>';
      html += '</article>';
    }
    html += '</div></div>';
    html += '<button type="button" class="mfp-slider-nav mfp-slider-next" aria-label="Next slide">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    html += '</button>';
    html += '</div>';
    html += '<div class="mfp-slider-dots" data-visible-cards="' + visibleCardsForViewport() + '"></div>';
    html += '</div>';
    return html + '</div>';
  }

  function bind(formId: number): void {
    var selector = '.mfw-content-slider[id^="' + cssEscape(fmtId(formId, '')) + '"]';
    var roots = document.querySelectorAll(selector);
    for (var i = 0; i < roots.length; i++) setupSlider(roots[i] as HTMLElement & AnyObj);
  }

  function setupSlider(root: HTMLElement & AnyObj): void {
    if (!root || root._mfpSliderBound) return;
    root._mfpSliderBound = true;

    var viewport = root.querySelector('.mfp-slider-viewport') as HTMLElement | null;
    var track = root.querySelector('.mfp-slider-track') as HTMLElement | null;
    var cards = root.querySelectorAll('.mfp-slider-card');
    var prevBtn = root.querySelector('.mfp-slider-prev') as HTMLButtonElement | null;
    var nextBtn = root.querySelector('.mfp-slider-next') as HTMLButtonElement | null;
    var dotsWrap = root.querySelector('.mfp-slider-dots') as HTMLElement | null;
    if (!viewport || !track || !cards.length) return;

    var current = 0;
    var timer: any = null;
    var touchStart = 0;

    function visibleCards(): number {
      var width = root.getBoundingClientRect().width || window.innerWidth || 1280;
      if (width <= 560) return 1;
      if (width <= 920) return 2;
      return 3;
    }

    function maxIndex(): number {
      return Math.max(0, cards.length - visibleCards());
    }

    function stepWidth(): number {
      if (!cards.length) return 0;
      var first = cards[0] as HTMLElement;
      var styles = window.getComputedStyle(track);
      var gap = parseFloat((styles as any).columnGap || styles.gap || '16') || 16;
      return first.getBoundingClientRect().width + gap;
    }

    function ensureDots(): void {
      if (!dotsWrap) return;
      var needed = maxIndex() + 1;
      if (needed < 1) needed = 1;
      var existing = dotsWrap.querySelectorAll('.mfp-slider-dot');
      if (existing.length === needed) {
        updateDots();
        return;
      }
      dotsWrap.innerHTML = '';
      for (var di = 0; di < needed; di++) {
        (function (dotIndex: number) {
          var dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'mfp-slider-dot' + (dotIndex === current ? ' is-active' : '');
          dot.setAttribute('aria-label', 'Go to slide ' + (dotIndex + 1));
          dot.addEventListener('click', function () { goTo(dotIndex, true); });
          dotsWrap.appendChild(dot);
        })(di);
      }
    }

    function updateDots(): void {
      if (!dotsWrap) return;
      var dots = dotsWrap.querySelectorAll('.mfp-slider-dot');
      for (var j = 0; j < dots.length; j++) {
        dots[j].classList.toggle('is-active', j === current);
      }
    }

    function renderState(): void {
      var max = maxIndex();
      if (current > max) current = max;
      if (current < 0) current = 0;
      var step = stepWidth();
      track.style.transform = 'translateX(-' + (current * step) + 'px)';
      ensureDots();
      updateDots();
      root.setAttribute('data-current-index', String(current));
    }

    function goTo(index: number, restart: boolean): void {
      current = index;
      renderState();
      if (restart) startAuto();
    }
    function next(restart: boolean): void {
      var max = maxIndex();
      current = current >= max ? 0 : current + 1;
      renderState();
      if (restart) startAuto();
    }
    function prev(restart: boolean): void {
      var max = maxIndex();
      current = current <= 0 ? max : current - 1;
      renderState();
      if (restart) startAuto();
    }
    function stopAuto(): void { if (timer) { window.clearInterval(timer); timer = null; } }
    function startAuto(): void {
      stopAuto();
      if (root.getAttribute('data-autoplay') !== '1') return;
      var interval = Math.max(1500, Number(root.getAttribute('data-interval') || '4000') || 4000);
      timer = window.setInterval(function () { next(false); }, interval);
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { prev(true); });
    if (nextBtn) nextBtn.addEventListener('click', function () { next(true); });
    root.addEventListener('mouseenter', stopAuto);
    root.addEventListener('mouseleave', startAuto);
    track.addEventListener('touchstart', function (e: any) {
      if (!e.touches || !e.touches.length) return;
      touchStart = e.touches[0].clientX;
      stopAuto();
    }, { passive: true });
    track.addEventListener('touchend', function (e: any) {
      if (!e.changedTouches || !e.changedTouches.length) return;
      var diff = touchStart - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) {
        if (diff > 0) next(false);
        else prev(false);
      }
      startAuto();
    }, { passive: true });
    window.addEventListener('resize', renderState);

    window.setTimeout(renderState, 0);
    window.setTimeout(renderState, 120);
    startAuto();
  }

  function collect(): string { return ''; }
  function validate(): boolean { return true; }

  function ensureProps(field: AnyObj): SliderProps {
    field.widgetProps = mergeProps(field);
    return field.widgetProps as SliderProps;
  }

  function renderProperties(body: HTMLElement, field: AnyObj, onChange: () => void): void {
    var props = ensureProps(field);
    body.innerHTML = '';

    var html = '';
    html += '<div class="mfw-slider-builder">';
    html += '<div class="mf-widget-settings-badge-wrap"><span class="mf-widget-settings-badge">' + escHtml(BADGE) + '</span></div>';
    html += '<div class="mfw-prop-row"><span class="mfw-prop-label">Height</span>';
    html += '<div class="mfw-slider-inline">';
    html += '<input type="range" min="120" max="640" step="10" data-slider-height-range value="' + escAttr(props.height) + '">';
    html += '<input type="number" min="120" max="640" step="10" data-slider-height-number value="' + escAttr(props.height) + '">';
    html += '<span class="mfw-slider-unit">px</span>';
    html += '</div></div>';
    html += '<label class="mfw-prop-toggle"><input type="checkbox" data-slider-autoplay' + (props.autoplay ? ' checked' : '') + '><span>Autoplay</span></label>';
    html += '<label class="mfw-prop-row"><span class="mfw-prop-label">Autoplay interval</span><input type="number" min="1500" max="12000" step="250" data-slider-interval value="' + escAttr(props.interval) + '"></label>';
    html += '<label class="mfw-prop-row"><span class="mfw-prop-label">Image fit</span><select data-slider-fit>';
    html += '<option value="cover"' + (props.imageFit === 'cover' ? ' selected' : '') + '>Cover</option>';
    html += '<option value="contain"' + (props.imageFit === 'contain' ? ' selected' : '') + '>Contain</option>';
    html += '</select></label>';
    html += '<div class="mfw-slider-items-head"><span>Slides</span><button type="button" class="mfw-slider-add" data-slider-add>+ Add slide</button></div>';
    for (var i = 0; i < props.items.length; i++) {
      var item = props.items[i];
      html += '<div class="mfw-slider-item" data-item-index="' + i + '">';
      html += '<div class="mfw-slider-item-head"><strong>Slide ' + (i + 1) + '</strong><button type="button" class="mfw-slider-remove" data-slider-remove="' + i + '">Remove</button></div>';
      html += '<label class="mfw-prop-row"><span class="mfw-prop-label">Image URL</span><input type="text" data-item-prop="imageUrl" data-item-index="' + i + '" value="' + escAttr(item.imageUrl) + '"></label>';
      html += '<label class="mfw-prop-row"><span class="mfw-prop-label">Title</span><input type="text" data-item-prop="title" data-item-index="' + i + '" value="' + escAttr(item.title) + '"></label>';
      html += '<label class="mfw-prop-row mfw-prop-col"><span class="mfw-prop-label">Description</span><textarea rows="3" data-item-prop="description" data-item-index="' + i + '">' + escHtml(item.description) + '</textarea></label>';
      html += '<label class="mfw-prop-row"><span class="mfw-prop-label">Badge</span><input type="text" data-item-prop="badge" data-item-index="' + i + '" value="' + escAttr(item.badge) + '"></label>';
      html += '<label class="mfw-prop-row"><span class="mfw-prop-label">Meta</span><input type="text" data-item-prop="meta" data-item-index="' + i + '" value="' + escAttr(item.meta) + '"></label>';
      html += '</div>';
    }
    html += '</div>';
    body.innerHTML = html;

    var syncHeight = function (value: number): void {
      props.height = Math.max(120, Math.min(640, value || defaults().height));
      field.widgetProps.height = props.height;
      var range = body.querySelector('[data-slider-height-range]') as HTMLInputElement | null;
      var number = body.querySelector('[data-slider-height-number]') as HTMLInputElement | null;
      if (range) range.value = String(props.height);
      if (number) number.value = String(props.height);
      onChange();
    };

    var rangeEl = body.querySelector('[data-slider-height-range]') as HTMLInputElement | null;
    var numberEl = body.querySelector('[data-slider-height-number]') as HTMLInputElement | null;
    if (rangeEl) rangeEl.addEventListener('input', function () { syncHeight(Number(rangeEl.value || props.height)); });
    if (numberEl) numberEl.addEventListener('input', function () { syncHeight(Number(numberEl.value || props.height)); });

    var autoplayEl = body.querySelector('[data-slider-autoplay]') as HTMLInputElement | null;
    if (autoplayEl) autoplayEl.addEventListener('change', function () { field.widgetProps.autoplay = !!autoplayEl.checked; onChange(); });
    var intervalEl = body.querySelector('[data-slider-interval]') as HTMLInputElement | null;
    if (intervalEl) intervalEl.addEventListener('input', function () { field.widgetProps.interval = Math.max(1500, Number(intervalEl.value || props.interval) || props.interval); onChange(); });
    var fitEl = body.querySelector('[data-slider-fit]') as HTMLSelectElement | null;
    if (fitEl) fitEl.addEventListener('change', function () { field.widgetProps.imageFit = fitEl.value === 'contain' ? 'contain' : 'cover'; onChange(); });

    var addBtn = body.querySelector('[data-slider-add]') as HTMLButtonElement | null;
    if (addBtn) addBtn.addEventListener('click', function () {
      field.widgetProps.items.push(normalizeItem({ title: 'New slide', description: '', imageUrl: '', badge: '', meta: '' }));
      renderProperties(body, field, onChange);
      onChange();
    });

    var removeBtns = body.querySelectorAll('[data-slider-remove]');
    for (var ri = 0; ri < removeBtns.length; ri++) {
      (removeBtns[ri] as HTMLButtonElement).addEventListener('click', function () {
        var idx = Number(this.getAttribute('data-slider-remove') || '-1');
        if (idx < 0) return;
        field.widgetProps.items.splice(idx, 1);
        if (!field.widgetProps.items.length) field.widgetProps.items = defaultItems();
        renderProperties(body, field, onChange);
        onChange();
      });
    }

    var propInputs = body.querySelectorAll('[data-item-prop]');
    for (var pi = 0; pi < propInputs.length; pi++) {
      (function (input: HTMLInputElement | HTMLTextAreaElement) {
        var evt = input.tagName === 'TEXTAREA' ? 'input' : 'input';
        input.addEventListener(evt, function () {
          var idx = Number(input.getAttribute('data-item-index') || '-1');
          var key = String(input.getAttribute('data-item-prop') || '');
          if (idx < 0 || !key || !field.widgetProps.items[idx]) return;
          field.widgetProps.items[idx][key] = input.value;
          onChange();
        });
      })(propInputs[pi] as any);
    }
  }

  MegaFormWidgets.register('ContentSlider', {
    meta: {
      icon: 'fa-images',
      label: 'Content Slider • ' + BADGE,
      category: 'widgets',
      color: '#0ea5e9',
      defaultWidth: '100%'
    },
    defaults: defaults(),
    render: render,
    bind: bind,
    collect: collect,
    validate: validate,
    renderProperties: renderProperties
  });

  global.__MF_CONTENT_SLIDER_BADGE = BADGE;
})(typeof window !== 'undefined' ? window : this);
