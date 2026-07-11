(function () {
  'use strict';

  type AnyObj = any;
  var SEARCH_ID = 'tpl-search-input';
  var STATE: AnyObj = { templates: null, query: '' };
  var SEARCH_BADGE = 'GallerySearchMultiCategory v20260419-04';
  try { (window as AnyObj).__MF_GALLERY_SEARCH_BADGE__ = SEARCH_BADGE; } catch (_e) {}

  function boot(): void {
    waitForGallery(function () {
      injectStyles();
      ensureSearchUi();
      bindSearch();
    });
  }

  function waitForGallery(done: Function): void {
    var tries = 0;
    var timer = window.setInterval(function () {
      tries++;
      var grid = document.getElementById('tpl-grid');
      var header = document.querySelector('.tpl-hd') as HTMLElement | null;
      if (grid && header) {
        window.clearInterval(timer);
        done();
      }
      if (tries > 100) window.clearInterval(timer);
    }, 120);
  }

  function injectStyles(): void {
    if (document.getElementById('tpl-search-styles')) return;
    var style = document.createElement('style');
    style.id = 'tpl-search-styles';
    style.textContent = [
      '.tpl-search-wrap{width:100%;max-width:520px;margin:.9rem auto 1.1rem;position:relative;}',
      '.tpl-search-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:13px;color:#94a3b8;pointer-events:none;}',
      '.tpl-search-input{width:100%;height:44px;border:1px solid #dbe2ea;border-radius:999px;background:#fff;padding:0 44px 0 40px;font:500 14px/1 var(--font);color:#0f172a;box-shadow:0 8px 24px rgba(15,23,42,.05);}',
      '.tpl-search-input:focus{outline:none;border-color:#818cf8;box-shadow:0 0 0 4px rgba(99,102,241,.12),0 8px 24px rgba(15,23,42,.06);}',
      '.tpl-search-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:none;border-radius:999px;background:transparent;color:#94a3b8;cursor:pointer;display:none;}',
      '.tpl-search-wrap.has-value .tpl-search-clear{display:inline-flex;align-items:center;justify-content:center;}',
      '.tpl-search-empty{grid-column:1/-1;padding:28px;border:1px dashed #cbd5e1;border-radius:18px;background:#fff;color:#64748b;text-align:center;font-size:14px;}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureSearchUi(): void {
    if (document.getElementById(SEARCH_ID)) return;
    var header = document.querySelector('.tpl-hd') as HTMLElement | null;
    if (!header) return;

    var wrap = document.createElement('div');
    wrap.className = 'tpl-search-wrap';
    wrap.innerHTML = [
      '<span class="tpl-search-icon"><i class="fa-solid fa-magnifying-glass"></i></span>',
      '<input id="' + SEARCH_ID + '" class="tpl-search-input" type="search" placeholder="Search templates by name, file, or category…" autocomplete="off" title="' + SEARCH_BADGE + '">',
      '<button type="button" class="tpl-search-clear" aria-label="Clear search"><i class="fa-solid fa-xmark"></i></button>'
    ].join('');

    var stats = document.getElementById('tpl-gallery-stats');
    if (stats && stats.parentElement === header) header.insertBefore(wrap, stats);
    else header.appendChild(wrap);

    var clear = wrap.querySelector('.tpl-search-clear') as HTMLButtonElement | null;
    if (clear) {
      clear.addEventListener('click', function () {
        var input = document.getElementById(SEARCH_ID) as HTMLInputElement | null;
        if (!input) return;
        input.value = '';
        STATE.query = '';
        STATE.templates = null;
        wrap.classList.remove('has-value');
        restoreDefaultGallery();
      });
    }
  }

  function bindSearch(): void {
    var input = document.getElementById(SEARCH_ID) as HTMLInputElement | null;
    var wrap = input ? input.parentElement as HTMLElement : null;
    if (!input || !wrap) return;
    input.addEventListener('input', function () {
      STATE.query = (input.value || '').trim().toLowerCase();
      wrap.classList.toggle('has-value', !!STATE.query);
      if (!STATE.query) {
        restoreDefaultGallery();
        return;
      }
      runSearch(STATE.query);
    });
  }

  async function runSearch(query: string): Promise<void> {
    STATE.templates = await loadTemplates();
    var list = (STATE.templates || []).filter(function (tpl: AnyObj) {
      var hay = [
        tpl.title,
        tpl.description,
        tpl.category,
        (tpl.categories || []).join(' | '),
        tpl.fileName,
        tpl.relativePath,
        tpl.folder,
        tpl.id
      ].join(' | ').toLowerCase();
      return hay.indexOf(query) >= 0;
    });
    renderSearchResults(list, query);
  }

  function getApiBase(): string {
    var base = (window as AnyObj).API_BASE
      || (window as AnyObj).__MF_PLATFORM__?.apiBase
      || '/api/MegaForm/';
    return String(base).replace(/\/?$/, '/');
  }

  function getDnnAuthHeaders(): Record<string, string> {
    var platform = (window as AnyObj).__MF_PLATFORM__?.platform
      || (window as AnyObj).PLATFORM
      || '';
    if (String(platform).toLowerCase() !== 'dnn') return {};
    try {
      var moduleId = (window as AnyObj).__MF_PLATFORM__?.moduleId
        || (window as AnyObj).MODULE_ID || 0;
      var sf = (window as AnyObj).jQuery?.ServicesFramework?.(moduleId)
        || (window as AnyObj).WebSF;
      if (!sf) return {};
      var token = typeof sf.getAntiForgeryValue === 'function' ? sf.getAntiForgeryValue() : '';
      if (!token) return {};
      return {
        'RequestVerificationToken': token,
        'TabId': String(typeof sf.getTabId === 'function' ? sf.getTabId() : ((window as AnyObj).TAB_ID || 0)),
        'ModuleId': String(typeof sf.getModuleId === 'function' ? sf.getModuleId() : ((window as AnyObj).MODULE_ID || moduleId || 0))
      };
    } catch (_e) {
      return {};
    }
  }


  function normalizeCategories(rawCategories: any, rawCategory?: any): string[] {
    var list: string[] = [];
    if (Array.isArray(rawCategories)) {
      rawCategories.forEach(function (value: any) {
        var normalized = String(value || '').trim().toLowerCase();
        if (normalized && list.indexOf(normalized) === -1) list.push(normalized);
      });
    }
    var primary = String(rawCategory || '').trim().toLowerCase();
    if (primary && list.indexOf(primary) === -1) list.unshift(primary);
    if (!list.length) list.push('general');
    return list;
  }

  async function loadTemplates(): Promise<AnyObj[]> {
    var out: AnyObj[] = [];

    // 1) Current presets already in the builder/gallery runtime
    try {
      var mfb = (window as AnyObj).MegaFormBuilder;
      if (mfb && typeof mfb.callModule === 'function') {
        var presets = mfb.callModule('templates', 'getAllPresets') || {};
        Object.keys(presets).forEach(function (id) {
          var tpl = presets[id] || {};
          out.push(normalizeTemplate(id, tpl));
        });
      }
    } catch (_e) {}

    // 2) Existing DOM cards already shown in gallery (fallback when API auth races on DNN)
    try {
      document.querySelectorAll('#tpl-grid .tpl-card[data-tpl]').forEach(function (node: Element) {
        var el = node as HTMLElement;
        var id = String(el.getAttribute('data-tpl') || '');
        if (!id) return;
        var title = String((el.querySelector('.tpl-title') as HTMLElement | null)?.textContent || id).trim();
        var description = String((el.querySelector('.tpl-desc') as HTMLElement | null)?.textContent || '').trim();
        var category = String((el.querySelector('.tpl-cat-tag') as HTMLElement | null)?.textContent || 'general').trim().toLowerCase();
        var fileName = String(el.getAttribute('data-filename') || '').trim();
        out.push({ id: id, title: title, description: description, category: category, categories: [category], fileName: fileName, fields: [] });
      });
    } catch (_e) {}

    // 3) Server list for full folder coverage
    try {
      var res = await fetch(getApiBase() + 'BuilderTemplates/List', {
        credentials: 'same-origin',
        headers: getDnnAuthHeaders()
      });
      if (res.ok) {
        var items = await res.json();
        if (Array.isArray(items)) {
          items.forEach(function (tpl: AnyObj) {
            out.push(normalizeTemplate(String(tpl.id || tpl.slug || tpl.title || tpl.fileName || 'uploaded-template'), tpl));
          });
        }
      }
    } catch (_e) {}

    var seen: AnyObj = {};
    return out.filter(function (tpl) {
      var key = String((tpl && (tpl.id || tpl.fileName || tpl.title)) || '').toLowerCase();
      if (!key) return false;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function normalizeTemplate(id: string, tpl: AnyObj): AnyObj {
    return {
      id: id,
      title: tpl.title || tpl.Title || id,
      description: tpl.description || tpl.Description || '',
      category: normalizeCategories(tpl.categories || tpl.Categories, tpl.category || tpl.Category)[0],
      categories: normalizeCategories(tpl.categories || tpl.Categories, tpl.category || tpl.Category),
      icon: tpl.icon || tpl.Icon || '✦',
      fields: Array.isArray(tpl.fields || tpl.Fields) ? (tpl.fields || tpl.Fields) : [],
      fileName: tpl.fileName || tpl.FileName || '',
      relativePath: tpl.relativePath || tpl.RelativePath || '',
      folder: tpl.folder || tpl.Folder || ''
    };
  }

  function renderSearchResults(list: AnyObj[], query: string): void {
    var grid = document.getElementById('tpl-grid');
    if (!grid) return;
    var pagination = document.getElementById('tpl-pagination');
    if (pagination) pagination.style.display = 'none';
    var filters = document.getElementById('tpl-filters');
    if (filters) filters.style.opacity = '0.55';
    updateStats(list.length, query);

    if (!list.length) {
      grid.innerHTML = '<div class="tpl-search-empty">No templates found for “' + escHtml(query) + '”.</div>';
      return;
    }

    grid.innerHTML = list.map(function (tpl) { return buildCardHtml(tpl); }).join('');
    bindCardActions(grid, list);
  }

  function bindCardActions(grid: HTMLElement, list: AnyObj[]): void {
    grid.querySelectorAll('.tpl-card').forEach(function (card: Element) {
      var id = (card as HTMLElement).getAttribute('data-tpl') || '';
      card.addEventListener('dblclick', function () { openTemplate(id); });
      card.addEventListener('click', function (e: Event) {
        var target = e.target as HTMLElement;
        if (target && target.closest('.tpl-use-overlay-btn')) {
          e.stopPropagation();
          openTemplate(id);
        }
      });
    });
  }

  function openTemplate(id: string): void {
    var fn = (window as AnyObj).enterBuilder;
    if (typeof fn === 'function') fn(id === 'blank' ? undefined : id);
  }

  function restoreDefaultGallery(): void {
    var filters = document.getElementById('tpl-filters');
    if (filters) filters.style.opacity = '';
    var pagination = document.getElementById('tpl-pagination');
    if (pagination) pagination.style.display = '';
    updateStats(null, '');
    var active = document.querySelector('#tpl-filters .tpl-cat.active') as HTMLElement | null;
    if (active) active.click();
  }

  function updateStats(total: number | null, query: string): void {
    var stats = document.getElementById('tpl-gallery-stats');
    if (!stats) return;
    if (total == null || !query) {
      var grid = document.getElementById('tpl-grid');
      var cards = grid ? grid.querySelectorAll('.tpl-card').length : 0;
      stats.textContent = cards + ' template' + (cards === 1 ? '' : 's') + ' available';
      return;
    }
    stats.textContent = total + ' result' + (total === 1 ? '' : 's') + ' for “' + query + '”';
  }

  function buildCardHtml(tpl: AnyObj): string {
    var fc = tpl.fields && tpl.fields.length ? tpl.fields.length : 0;
    var catLabel = tpl.category ? tpl.category.charAt(0).toUpperCase() + tpl.category.slice(1) : 'General';
    var grad = gradientFor(tpl.category || 'general');
    var sourceBadge = String(tpl.id || '').indexOf('file-') === 0 ? '<span class="tpl-source-badge">uploaded</span>' : '';
    var fileChip = tpl.fileName ? '<div class="tpl-filename-chip" title="' + escAttr(tpl.fileName) + '">' + escHtml(tpl.fileName) + '</div>' : '';
    // Lucide-style catalog names (compass / sparkles / globe-2) aren't glyphs → neutral FA glyph,
    // never raw text. fa-* passes through; emoji/symbols render as-is (matches gallery cardHTML).
    var iconRaw = String(tpl.icon || '');
    var iconHtml = iconRaw.indexOf('fa-') === 0
      ? '<i class="fa-solid ' + escAttr(iconRaw) + '"></i>'
      : /^[a-z][a-z0-9-]*$/.test(iconRaw)
        ? '<i class="fa-solid fa-file-lines"></i>'
        : escHtml(iconRaw || '✦');
    return [
      '<div class="tpl-card" data-tpl="', escAttr(tpl.id), '">',
      '<div class="tpl-thumb" style="background:', escAttr(grad), '">',
      sourceBadge,
      '<div class="tpl-hero-icon">', iconHtml, '</div>',
      '<div class="tpl-thumb-surface"></div>',
      '<div class="tpl-thumb-overlay"><button class="tpl-use-overlay-btn">Use Template →</button></div>',
      '</div>',
      '<div class="tpl-info">',
      '<div class="tpl-title-row"><div class="tpl-title">', escHtml(tpl.title || tpl.id), '</div></div>',
      '<div class="tpl-desc">', escHtml(tpl.description || ''), '</div>',
      '<div class="tpl-meta"><span class="tpl-field-count">', String(fc), ' fields</span><span class="tpl-cat-tag">', escHtml(catLabel), '</span></div>',
      fileChip,
      '</div></div>'
    ].join('');
  }

  function gradientFor(cat: string): string {
    var map: AnyObj = {
      general: 'linear-gradient(135deg,#5b8def,#7c3aed)',
      hr: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
      healthcare: 'linear-gradient(135deg,#10b981,#0ea5e9)',
      events: 'linear-gradient(135deg,#8b5cf6,#ec4899)',
      survey: 'linear-gradient(135deg,#f59e0b,#ef4444)',
      finance: 'linear-gradient(135deg,#14b8a6,#3b82f6)',
      education: 'linear-gradient(135deg,#f97316,#ec4899)'
    };
    return map[cat] || map.general;
  }

  function escHtml(v: any): string {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(v: any): string {
    return escHtml(v).replace(/'/g, '&#39;');
  }

  boot();
})();
