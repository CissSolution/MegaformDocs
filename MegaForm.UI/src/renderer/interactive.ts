// ============================================================
// Interactive Elements — rating stars, file upload, signatures
// ============================================================

import type { RendererConfig } from './helpers';
import { esc, COMPOSITE_PRESETS } from './helpers';
import { bindCountryPickers } from './country-picker';
import { bindMasks } from './mask';
// Use the renderer bundle's OWN embedded @i18n instance — window.MegaFormI18n is
// volatile (the last-loaded bundle overwrites it, sometimes with an unloaded
// instance), which left the date-picker buttons English even after the catalog
// loaded. The embedded copy auto-boots + loads the catalog and stays stable.
import { t as embT, getLocale as embGetLocale } from '@i18n';

/** Bind all interactive element handlers */
export function bindInteractiveElements(config: RendererConfig): void {
  bindDateTimePickers();
  bindCalendarDatePickers();
  bindMultiSelects();
  bindMultiColumnComboBoxes();
  bindRatingStars();
  bindFileUploads(config);
  bindSignaturePads();
  bindCountryPickers();   // [Composite v1.4] flag dropdown parts (must run with/after composites)
  bindMasks();        // [Fix v20260616] format-as-you-type for [data-mf-mask] (SSN ###-##-####).
                      // Was imported but NEVER called (lost in the April-revert) → masks didn't
                      // format → the masked value then failed its own pattern. MUST run BEFORE
                      // bindComposites so the combined hidden value reads the masked text.
  bindComposites();   // [Composite v1]
}

// [Composite v1 2026-06-14] Combine sub-inputs → the hidden canonical value
// (name=key, found in the field-group) on every edit. Self-contained, idempotent.
// ADDITIVE — does not touch any existing field/widget binding.
//
// [Composite a11y v2 2026-06-15] WAI-ARIA composite-widget keyboard model. The
// `.mf-composite` group is ONE tab stop (roving tabindex: exactly one part is
// tabbable) and arrow keys rove between the sub-inputs — so a screen-reader user
// flows Area → Number → Ext with the arrow keys instead of hitting a tab stop on
// every box. Hybrid per part type so we never break in-field editing:
//   • text part  → arrow at the caret EDGE moves to the adjacent part (mid-text the
//     caret moves normally); Backspace in an empty/start caret jumps back; auto-tab
//     on maxLength still advances. Home/End stay native (Ctrl+Home/End = first/last).
//   • select part → Left/Right move between parts; Up/Down stay native (change value).
// nav='tab' on the group opts out entirely (legacy: every part a natural tab stop).
function bindComposites(): void {
  document.querySelectorAll<HTMLElement>('.mf-composite').forEach((wrap) => {
    if ((wrap as any).__mfCompositeBound) return;
    (wrap as any).__mfCompositeBound = true;
    const preset = wrap.getAttribute('data-preset') || '';
    const def = (COMPOSITE_PRESETS as any)[preset];
    const nav = wrap.getAttribute('data-mf-nav') || 'roving';
    const orient = wrap.getAttribute('data-mf-orient') || 'horizontal';
    // horizontal → Left/Right (caret-aware); vertical → Up/Down (always-move);
    // both (multi-row address grid) → Left/Right caret-aware AND Up/Down always-move.
    const horiz = orient !== 'vertical';
    const vert = orient === 'vertical' || orient === 'both';
    const group = wrap.closest('.mf-field-group') || wrap.parentElement;
    const hidden = (group ? group.querySelector('input[type="hidden"]') : null) as HTMLInputElement | null;
    const partEls = Array.from(wrap.querySelectorAll<HTMLInputElement>('[data-mf-part]'));

    const recompute = () => {
      const v: Record<string, string> = {};
      partEls.forEach((el) => { v[el.getAttribute('data-mf-part') || ''] = el.value; });
      const combined = def?.combine ? def.combine(v) : partEls.map((e) => e.value).filter(Boolean).join(' ');
      if (hidden && hidden.value !== combined) {
        hidden.value = combined;
        try { hidden.dispatchEvent(new Event('input', { bubbles: true })); } catch { /* old browser */ }
      }
    };

    // Roving tabindex: keep exactly one part tabbable so Tab in/out treats the group
    // as a single stop. Updated on focus (click/tab-in) and on every arrow move.
    const roving = nav === 'roving';
    const setActive = (idx: number) => {
      if (!roving) return;
      partEls.forEach((e, i) => { try { e.tabIndex = i === idx ? 0 : -1; } catch { /* noop */ } });
    };
    const focusPart = (idx: number, caretEnd: boolean) => {
      if (idx < 0 || idx >= partEls.length) return;
      setActive(idx);
      const el = partEls[idx];
      try { el.focus(); } catch { /* noop */ }
      if (caretEnd && el.tagName === 'INPUT') {
        const L = el.value.length;
        try { el.setSelectionRange(L, L); } catch { /* input type w/o text selection */ }
      }
    };
    const atStart = (el: HTMLInputElement) => { try { return el.selectionStart === 0 && el.selectionEnd === 0; } catch { return true; } };
    const atEnd = (el: HTMLInputElement) => { try { return el.selectionStart === el.value.length && el.selectionEnd === el.value.length; } catch { return true; } };

    partEls.forEach((el, idx) => {
      el.addEventListener('input', () => {
        el.classList.remove('mf-error');   // [Composite v1.3] clear per-part error on edit
        recompute();
        const ml = parseInt(el.getAttribute('maxlength') || '0', 10);
        if (ml && el.value.length >= ml && idx < partEls.length - 1) focusPart(idx + 1, false);
      });
      el.addEventListener('change', () => { el.classList.remove('mf-error'); recompute(); });
      if (!roving) return;
      el.addEventListener('focus', () => setActive(idx));
      el.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.altKey || ev.metaKey) return;            // don't fight native shortcuts
        if (el.tagName === 'SELECT') {
          // Up/Down stay native (cycle the option); Left/Right rove between parts.
          if (ev.key === 'ArrowRight' && idx < partEls.length - 1) { ev.preventDefault(); focusPart(idx + 1, true); }
          else if (ev.key === 'ArrowLeft' && idx > 0) { ev.preventDefault(); focusPart(idx - 1, true); }
          return;
        }
        if (horiz && ev.key === 'ArrowRight') {
          if (atEnd(el) && idx < partEls.length - 1) { ev.preventDefault(); focusPart(idx + 1, true); }
        } else if (horiz && ev.key === 'ArrowLeft') {
          if (atStart(el) && idx > 0) { ev.preventDefault(); focusPart(idx - 1, true); }
        } else if (vert && ev.key === 'ArrowDown') {
          if (idx < partEls.length - 1) { ev.preventDefault(); focusPart(idx + 1, true); }
        } else if (vert && ev.key === 'ArrowUp') {
          if (idx > 0) { ev.preventDefault(); focusPart(idx - 1, true); }
        } else if (ev.key === 'Backspace') {
          if ((el.value === '' || atStart(el)) && idx > 0) { ev.preventDefault(); focusPart(idx - 1, true); }
        } else if (ev.key === 'Home' && ev.ctrlKey) {
          ev.preventDefault(); focusPart(0, false);
        } else if (ev.key === 'End' && ev.ctrlKey) {
          ev.preventDefault(); focusPart(partEls.length - 1, true);
        }
      });
    });
    // No initial recompute — preserve any saved value in the hidden input until the
    // user edits a part (prefill-split is a later phase).
  });
}

type DateTimePickerState = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  ampm: 'AM' | 'PM';
};

const MF_DTP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// [i18n] Date-picker localization. The calendar month header, weekday columns
// and month list were hardcoded English; derive them from Intl in the active
// locale so a French/German/… form shows "juin 2026", "DI LU MA…", etc.
function dtpLocale(): string {
  try { const l = embGetLocale(); if (l && l !== 'en-US') return l; } catch { /* embedded n/a */ }
  try { const I = (window as any).MegaFormI18n; if (I && typeof I.getLocale === 'function') { const l = I.getLocale(); if (l) return l; } } catch { /* no i18n */ }
  return 'en-US';
}
function dtpT(key: string, fallback: string): string {
  try { const v = embT(key); if (v && v !== key) return String(v); } catch { /* embedded n/a */ }
  try { const I = (window as any).MegaFormI18n; if (I && typeof I.t === 'function') { const v = I.t(key); if (v && v !== key) return String(v); } } catch { /* no i18n */ }
  return fallback;
}
// Pick the calendar/picker button label. The server (inputs.ts / FormView) bakes
// the ENGLISH default into data-label-* (e.g. data-label-today="Today") whenever
// the field has no custom override — which would shadow i18n. So a dataset value
// equal to the English default is treated as "no override" and we use the
// localized i18n string instead; only a genuinely custom value is kept verbatim.
function pickLabel(dsVal: string | undefined, englishDefault: string, key: string): string {
  const loc = dtpT(key, englishDefault);
  if (!dsVal || dsVal === englishDefault) return loc;
  return dsVal;
}
function markDatePopoverHost(root: HTMLElement): void {
  const wrapper = root.closest<HTMLElement>('.mf-form-wrapper');
  if (!wrapper) return;
  wrapper.classList.add('mf-has-date-popover');
  let node: HTMLElement | null = root;
  while (node && node !== wrapper) {
    node.classList.add('mf-date-popover-host');
    node = node.parentElement;
  }
}

// [DatePopoverOverflowLift v20260705] Premium template cards pin `.mfp{overflow:hidden!important}` at
// specificity (0,5,0), which BEATS the (0,3,0) `.mf-has-date-popover .mf-date-popover-host{overflow:visible}`
// stylesheet override → the calendar/picker panel is clipped at the card's rounded bottom edge. When the
// picker opens (root gains .is-open), set INLINE `overflow:visible !important` on each ancestor up to the
// form wrapper — an inline !important beats any stylesheet !important, so the clip is lifted regardless of
// template specificity — then restore on close. No re-parenting: the panel's own click / outside-click
// handlers are untouched. Standard forms already render correctly; this only unclips the premium case.
function attachDatePopoverLift(root: HTMLElement): void {
  const wrapper = root.closest<HTMLElement>('.mf-form-wrapper');
  if (!wrapper || (root as any).__mfPopoverLift) return;
  (root as any).__mfPopoverLift = true;
  const lift = (on: boolean): void => {
    let node: HTMLElement | null = root;
    for (let guard = 0; node && guard < 24; guard++) {
      if (on) node.style.setProperty('overflow', 'visible', 'important');
      else node.style.removeProperty('overflow');
      if (node === wrapper) break;
      node = node.parentElement;
    }
  };
  let wasOpen = false;
  const obs = new MutationObserver(() => {
    const isOpen = root.classList.contains('is-open');
    if (isOpen === wasOpen) return;
    wasOpen = isOpen;
    lift(isOpen);
  });
  obs.observe(root, { attributes: true, attributeFilter: ['class'] });
}
// Localized month names (long for the calendar title/list, short for columns).
function dtpMonthNames(locale: string, style: 'long' | 'short'): string[] {
  try {
    const f = new Intl.DateTimeFormat(locale, { month: style });
    return Array.from({ length: 12 }, (_, i) => f.format(new Date(2021, i, 15)));
  } catch { return style === 'short' ? MF_DTP_MONTHS.slice() : ['January','February','March','April','May','June','July','August','September','October','November','December']; }
}
// Localized weekday column headers, Sunday-first (the grid is Sunday-indexed),
// 2-letter uppercase to match the existing SU/MO/… look.
function dtpWeekdayNames(locale: string): string[] {
  try {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // 2021-08-01 was a Sunday → 7 consecutive days = Sun..Sat.
    const short = Array.from({ length: 7 }, (_, i) => f.format(new Date(2021, 7, 1 + i)).replace(/\.$/, ''));
    // Latin "SU MO TU…" look: 2-letter uppercase. But for non-Latin scripts (Arabic,
    // etc.) every short name shares a prefix (e.g. "الـ"), so a 2-char slice collapses
    // all columns to the same string — only apply it when it stays unambiguous.
    const twoChar = short.map((s) => s.slice(0, 2).toUpperCase());
    return new Set(twoChar).size === 7 ? twoChar : short;
  } catch { return ['SU','MO','TU','WE','TH','FR','SA']; }
}
function dtpMonthShort(idx: number): string {
  try { const v = dtpMonthNames(dtpLocale(), 'short')[idx]; if (v) return v; } catch { /* fallback */ }
  return MF_DTP_MONTHS[idx] || '';
}

function bindDateTimePickers(): void {
  document.querySelectorAll<HTMLElement>('.mf-dtp[data-mf-dtp="1"]').forEach(root => {
    if (root.dataset.mfDtpBound === '1') return;
    root.dataset.mfDtpBound = '1';

    const hidden = root.querySelector<HTMLInputElement>('.mf-dtp-hidden');
    const trigger = root.querySelector<HTMLButtonElement>('.mf-dtp-trigger');
    const valueEl = root.querySelector<HTMLElement>('.mf-dtp-value');
    const panel = root.querySelector<HTMLElement>('.mf-dtp-panel');
    if (!hidden || !trigger || !valueEl || !panel) return;
    markDatePopoverHost(root);
    attachDatePopoverLift(root);

    const mode = normalizeDateMode(root.dataset.mode);
    const timeFormat = root.dataset.timeFormat === '12h' ? '12h' : '24h';
    const minuteStep = Math.max(1, Math.min(30, parseInt(root.dataset.minuteStep || '1', 10) || 1));
    const placeholder = root.dataset.placeholder || 'Select date...';
    const labels = {
      apply: pickLabel(root.dataset.labelApply, 'Apply', 'form.dtp_apply'),
      clear: pickLabel(root.dataset.labelClear, 'Clear', 'form.dtp_clear'),
      today: pickLabel(root.dataset.labelToday, 'Today', 'form.dtp_today'),
      day: pickLabel(root.dataset.labelDay, 'Day', 'form.dtp_day'),
      month: pickLabel(root.dataset.labelMonth, 'Month', 'form.dtp_month'),
      year: pickLabel(root.dataset.labelYear, 'Year', 'form.dtp_year'),
      hour: pickLabel(root.dataset.labelHour, 'Hour', 'form.dtp_hour'),
      minute: pickLabel(root.dataset.labelMinute, 'Minute', 'form.dtp_minute'),
      ampm: root.dataset.labelAmpm || 'AM/PM',
    };
    let state = parseDateValue(hidden.value || root.dataset.value || '', mode, timeFormat);

    const setDisplay = () => {
      const text = hidden.value ? formatDateDisplay(state, mode, timeFormat) : placeholder;
      valueEl.textContent = text;
      root.classList.toggle('is-empty', !hidden.value);
    };

    const commit = (nextValue: string) => {
      hidden.value = nextValue;
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
      setDisplay();
    };

    const close = () => {
      root.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    };

    const renderPanel = () => {
      panel.innerHTML = buildDateTimePanel(state, mode, timeFormat, minuteStep, labels);
      panel.querySelectorAll<HTMLButtonElement>('.mf-dtp-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const part = btn.dataset.part || '';
          const raw = btn.dataset.value || '';
          updateDateState(state, part, raw, mode, timeFormat);
          renderPanel();
        });
      });
      panel.querySelector<HTMLButtonElement>('[data-action="clear"]')?.addEventListener('click', () => {
        commit('');
        close();
      });
      panel.querySelector<HTMLButtonElement>('[data-action="today"]')?.addEventListener('click', () => {
        state = dateToState(new Date(), timeFormat);
        renderPanel();
      });
      panel.querySelector<HTMLButtonElement>('[data-action="apply"]')?.addEventListener('click', () => {
        normalizeDay(state);
        commit(formatDateOutput(state, mode, timeFormat));
        close();
      });
      scrollSelectedDateColumns(panel);
    };

    const open = () => {
      if (trigger.disabled || root.dataset.disabled === 'true' || root.dataset.readonly === 'true') return;
      closeOtherPickers(root, '.mf-cal.is-open, .mf-dtp.is-open, .mf-ms.is-open, .mf-mccb.is-open');
      if (!hidden.value) state = parseDateValue('', mode, timeFormat);
      renderPanel();
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      scrollSelectedDateColumns(panel);
    };

    trigger.addEventListener('click', e => {
      e.preventDefault();
      root.classList.contains('is-open') ? close() : open();
    });
    trigger.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        open();
      } else if (e.key === 'Escape') {
        close();
      }
    });
    document.addEventListener('mousedown', e => {
      if (!root.contains(e.target as Node)) close();
    });

    if (hidden.value) state = parseDateValue(hidden.value, mode, timeFormat);
    setDisplay();
  });
}

function scrollSelectedDateColumns(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLElement>('.mf-dtp-column').forEach(column => {
    const selected = column.querySelector<HTMLElement>('.mf-dtp-option.is-selected');
    const scroller = selected?.closest<HTMLElement>('.mf-dtp-scroll');
    if (!selected || !scroller) return;
    scroller.scrollTop = selected.offsetTop - (scroller.clientHeight / 2) + (selected.offsetHeight / 2);
  });
}

function normalizeDateMode(mode?: string): 'date-only' | 'date-time' | 'month-year' {
  const raw = String(mode || '').toLowerCase();
  if (raw === 'date-time' || raw === 'datetime') return 'date-time';
  if (raw === 'month-year' || raw === 'monthyear') return 'month-year';
  return 'date-only';
}

function dateToState(date: Date, timeFormat: '12h' | '24h'): DateTimePickerState {
  let hour = date.getHours();
  const ampm: 'AM' | 'PM' = hour >= 12 ? 'PM' : 'AM';
  if (timeFormat === '12h') hour = hour % 12 || 12;
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour,
    minute: date.getMinutes(),
    ampm,
  };
}

function parseDateValue(value: string, mode: 'date-only' | 'date-time' | 'month-year', timeFormat: '12h' | '24h'): DateTimePickerState {
  const now = dateToState(new Date(), timeFormat);
  const match = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T(\d{2}):(\d{2}))?/);
  if (!match) return now;
  const hour24 = match[4] != null ? parseInt(match[4], 10) : now.hour;
  const minute = match[5] != null ? parseInt(match[5], 10) : 0;
  const ampm: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const hour = timeFormat === '12h' ? (hour24 % 12 || 12) : hour24;
  const parsed = {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: mode === 'month-year' ? 1 : parseInt(match[3] || '1', 10),
    hour,
    minute,
    ampm,
  };
  normalizeDay(parsed);
  return parsed;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function normalizeDay(state: DateTimePickerState): void {
  state.month = Math.max(1, Math.min(12, state.month));
  state.day = Math.max(1, Math.min(daysInMonth(state.year, state.month), state.day));
}

function formatDateOutput(state: DateTimePickerState, mode: 'date-only' | 'date-time' | 'month-year', timeFormat: '12h' | '24h'): string {
  normalizeDay(state);
  const date = `${state.year}-${padDatePart(state.month)}-${padDatePart(state.day)}`;
  if (mode === 'month-year') return `${state.year}-${padDatePart(state.month)}`;
  if (mode === 'date-only') return date;
  let hour = state.hour;
  if (timeFormat === '12h') {
    hour = state.ampm === 'PM' ? (state.hour % 12) + 12 : state.hour % 12;
  }
  return `${date}T${padDatePart(hour)}:${padDatePart(state.minute)}:00`;
}

function formatDateDisplay(state: DateTimePickerState, mode: 'date-only' | 'date-time' | 'month-year', timeFormat: '12h' | '24h'): string {
  normalizeDay(state);
  if (mode === 'month-year') return `${dtpMonthShort(state.month - 1)} ${state.year}`;
  const date = `${dtpMonthShort(state.month - 1)} ${state.day}, ${state.year}`;
  if (mode === 'date-only') return date;
  const hour = timeFormat === '12h' ? `${state.hour}:${padDatePart(state.minute)} ${state.ampm}` : `${padDatePart(state.hour)}:${padDatePart(state.minute)}`;
  return `${date} ${hour}`;
}

function buildDateTimePanel(
  state: DateTimePickerState,
  mode: 'date-only' | 'date-time' | 'month-year',
  timeFormat: '12h' | '24h',
  minuteStep: number,
  labels: Record<string, string>,
): string {
  const nowYear = new Date().getFullYear();
  const years = Array.from({ length: 21 }, (_, i) => nowYear - 10 + i);
  const days = Array.from({ length: daysInMonth(state.year, state.month) }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const hours = timeFormat === '12h'
    ? Array.from({ length: 12 }, (_, i) => i + 1)
    : Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep).filter(v => v < 60);

  let h = `<div class="mf-dtp-columns">`;
  if (mode !== 'month-year') h += buildDateColumn(labels.day, 'day', days, state.day, v => padDatePart(v));
  h += buildDateColumn(labels.month, 'month', months, state.month, v => dtpMonthShort(v - 1));
  h += buildDateColumn(labels.year, 'year', years, state.year, v => String(v));
  if (mode === 'date-time') {
    h += buildDateColumn(labels.hour, 'hour', hours, state.hour, v => padDatePart(v));
    h += buildDateColumn(labels.minute, 'minute', minutes, state.minute, v => padDatePart(v));
    if (timeFormat === '12h') h += buildDateColumn(labels.ampm, 'ampm', ['AM', 'PM'], state.ampm, v => String(v));
  }
  h += `</div>`;
  h += `<div class="mf-dtp-actions">` +
    `<button type="button" class="mf-dtp-action" data-action="clear">${esc(labels.clear)}</button>` +
    `<button type="button" class="mf-dtp-action" data-action="today">${esc(labels.today)}</button>` +
    `<button type="button" class="mf-dtp-action mf-dtp-apply" data-action="apply">${esc(labels.apply)}</button>` +
  `</div>`;
  return h;
}

function buildDateColumn<T extends string | number>(label: string, part: string, items: T[], current: T, display: (value: T) => string): string {
  let h = `<div class="mf-dtp-column"><div class="mf-dtp-column-label">${esc(label)}</div><div class="mf-dtp-scroll">`;
  items.forEach(item => {
    const selected = String(item) === String(current);
    h += `<button type="button" class="mf-dtp-option${selected ? ' is-selected' : ''}" data-part="${esc(part)}" data-value="${esc(String(item))}" role="option" aria-selected="${selected ? 'true' : 'false'}">${esc(display(item))}</button>`;
  });
  return h + `</div></div>`;
}

function updateDateState(state: DateTimePickerState, part: string, value: string, mode: 'date-only' | 'date-time' | 'month-year', timeFormat: '12h' | '24h'): void {
  if (part === 'ampm') {
    state.ampm = value === 'PM' ? 'PM' : 'AM';
    return;
  }
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return;
  if (part === 'day') state.day = parsed;
  if (part === 'month') state.month = parsed;
  if (part === 'year') state.year = parsed;
  if (part === 'hour') state.hour = parsed;
  if (part === 'minute') state.minute = parsed;
  if (mode !== 'month-year') normalizeDay(state);
  if (timeFormat === '24h') state.ampm = state.hour >= 12 ? 'PM' : 'AM';
}

function parseDataList<T>(raw: string | undefined, fallback: T): T {
  try {
    if (!raw) return fallback;
    const text = raw.charAt(0) === '%' ? decodeURIComponent(raw) : raw;
    return JSON.parse(text) as T;
  } catch (_e) {
    return fallback;
  }
}

function splitCsv(value: string): string[] {
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}

function dispatchInputChange(input: HTMLInputElement): void {
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function closeOtherPickers(current: HTMLElement, selector: string): void {
  document.querySelectorAll<HTMLElement>(selector).forEach(root => {
    if (root === current) return;
    root.classList.remove('is-open');
    root.querySelector<HTMLElement>('[aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
  });
}

function bindCalendarDatePickers(): void {
  document.querySelectorAll<HTMLElement>('.mf-cal[data-mf-cal="1"]').forEach(root => {
    if (root.dataset.mfCalBound === '1') return;
    root.dataset.mfCalBound = '1';

    const hidden = root.querySelector<HTMLInputElement>('.mf-cal-hidden');
    const trigger = root.querySelector<HTMLButtonElement>('.mf-cal-trigger');
    const valueEl = root.querySelector<HTMLElement>('.mf-cal-value');
    const panel = root.querySelector<HTMLElement>('.mf-cal-panel');
    if (!hidden || !trigger || !valueEl || !panel) return;
    markDatePopoverHost(root);
    attachDatePopoverLift(root);

    const mode = normalizeDateMode(root.dataset.mode);
    const placeholder = root.dataset.placeholder || 'Select a date';
    // [i18n] Use the form author's explicit custom names if provided, otherwise
    // derive localized names from Intl for the active locale (not English).
    const _loc = dtpLocale();
    const _wd = root.dataset.weekdays;
    const weekdays = (_wd && _wd !== 'SU,MO,TU,WE,TH,FR,SA')
      ? String(_wd).split(',').map(s => s.trim()).filter(Boolean)
      : dtpWeekdayNames(_loc);
    const _mo = root.dataset.months;
    const months = (_mo && !/^January,February,/.test(_mo))
      ? String(_mo).split(',').map(s => s.trim()).filter(Boolean)
      : dtpMonthNames(_loc, 'long');
    // [i18n] Recompute the action labels each time the panel renders — the i18n
    // catalog loads ASYNC after this setup runs, so capturing them once here would
    // freeze the English fallback. Intl-derived months/weekdays above are sync so
    // they're fine to capture once.
    const getLabels = () => ({
      apply: pickLabel(root.dataset.labelApply, 'Apply', 'form.dtp_apply'),
      clear: pickLabel(root.dataset.labelClear, 'Clear', 'form.dtp_clear'),
      today: pickLabel(root.dataset.labelToday, 'Today', 'form.dtp_today'),
      previous: pickLabel(root.dataset.labelPrev, 'Previous month', 'form.dtp_prev'),
      next: pickLabel(root.dataset.labelNext, 'Next month', 'form.dtp_next'),
      time: pickLabel(root.dataset.labelTime, 'Time:', 'form.dtp_time'),
    });
    let state = parseDateValue(hidden.value || root.dataset.value || '', mode, '24h');
    let viewYear = state.year;
    let viewMonth = state.month;

    const display = () => {
      if (!hidden.value) {
        valueEl.textContent = placeholder;
        root.classList.add('is-empty');
        return;
      }
      const date = new Date(state.year, state.month - 1, state.day, state.hour, state.minute);
      valueEl.textContent = mode === 'month-year'
        ? `${months[state.month - 1] || padDatePart(state.month)} ${state.year}`
        : mode === 'date-time'
        ? date.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
      root.classList.remove('is-empty');
    };

    const commit = (next: string) => {
      hidden.value = next;
      dispatchInputChange(hidden);
      display();
    };

    const close = () => {
      root.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    };

    const renderPanel = () => {
      const labels = getLabels(); // fresh each render so late-loaded i18n applies
      let h = `<div class="mf-cal-header">` +
        `<button type="button" class="mf-cal-nav" data-action="prev" aria-label="${esc(labels.previous)}">&lsaquo;</button>` +
        `<div class="mf-cal-title">${mode === 'month-year' ? viewYear : `${esc(months[viewMonth - 1] || String(viewMonth))} ${viewYear}`}</div>` +
        `<button type="button" class="mf-cal-nav" data-action="next" aria-label="${esc(labels.next)}">&rsaquo;</button>` +
        `</div>`;
      if (mode === 'month-year') {
        const today = new Date();
        h += `<div class="mf-cal-month-grid">`;
        months.slice(0, 12).forEach((monthName, index) => {
          const monthValue = index + 1;
          const selected = monthValue === state.month && viewYear === state.year;
          const isToday = monthValue === today.getMonth() + 1 && viewYear === today.getFullYear();
          h += `<button type="button" class="mf-cal-month${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}" data-month="${monthValue}">${esc(monthName)}</button>`;
        });
        h += `</div>`;
      } else {
        const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay();
        const days = daysInMonth(viewYear, viewMonth);
        h += `<div class="mf-cal-grid mf-cal-weekdays">`;
        weekdays.slice(0, 7).forEach(day => { h += `<div>${esc(day)}</div>`; });
        h += `</div><div class="mf-cal-grid mf-cal-days">`;
        for (let i = 0; i < firstDay; i++) h += `<span class="mf-cal-day is-empty"></span>`;
        const today = new Date();
        for (let d = 1; d <= days; d++) {
          const selected = d === state.day && viewMonth === state.month && viewYear === state.year;
          const isToday = d === today.getDate() && viewMonth === today.getMonth() + 1 && viewYear === today.getFullYear();
          h += `<button type="button" class="mf-cal-day${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}" data-day="${d}">${d}</button>`;
        }
        h += `</div>`;
      }
      if (mode === 'date-time') {
        h += `<div class="mf-cal-time"><label>${esc(labels.time)}</label>` +
          `<input type="number" min="0" max="23" data-time-part="hour" value="${padDatePart(state.hour)}" aria-label="Hour">` +
          `<span>:</span>` +
          `<input type="number" min="0" max="59" data-time-part="minute" value="${padDatePart(state.minute)}" aria-label="Minute">` +
          `</div>`;
      }
      // [DatePickerNoApply v20260628] Apply is only needed for date-TIME mode (confirm the time
      // after picking a day). For date-only / month-year, clicking a day/month commits + closes
      // immediately, so the Apply button is dropped.
      h += `<div class="mf-cal-actions">` +
        `<button type="button" class="mf-cal-action" data-action="today">${esc(labels.today)}</button>` +
        `<button type="button" class="mf-cal-action" data-action="clear">${esc(labels.clear)}</button>` +
        (mode === 'date-time' ? `<button type="button" class="mf-cal-action mf-cal-apply" data-action="apply">${esc(labels.apply)}</button>` : '') +
        `</div>`;
      panel.innerHTML = h;
    };

    const open = () => {
      if (trigger.disabled || root.dataset.disabled === 'true' || root.dataset.readonly === 'true') return;
      closeOtherPickers(root, '.mf-cal.is-open, .mf-dtp.is-open, .mf-ms.is-open, .mf-mccb.is-open');
      state = parseDateValue(hidden.value || root.dataset.value || '', mode, '24h');
      viewYear = state.year;
      viewMonth = state.month;
      renderPanel();
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    };

    trigger.addEventListener('click', e => {
      e.preventDefault();
      root.classList.contains('is-open') ? close() : open();
    });
    panel.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      const month = target.closest<HTMLButtonElement>('[data-month]');
      if (month) {
        state.year = viewYear;
        state.month = parseInt(month.dataset.month || '1', 10) || 1;
        state.day = 1;
        normalizeDay(state);
        // month-year picker has no day step → commit + close on the month click (no Apply).
        if (mode === 'month-year') { commit(formatDateOutput(state, mode, '24h')); close(); }
        else renderPanel();
        return;
      }
      const day = target.closest<HTMLButtonElement>('[data-day]');
      if (day) {
        state.year = viewYear;
        state.month = viewMonth;
        state.day = parseInt(day.dataset.day || '1', 10) || 1;
        normalizeDay(state);
        // [DatePickerNoApply] date-only → commit + close on the day click (no Apply step). date-time
        // keeps the panel open so the user can still set the time, then confirms with Apply.
        if (mode === 'date-time') renderPanel();
        else { commit(formatDateOutput(state, mode, '24h')); close(); }
        return;
      }
      const action = target.closest<HTMLButtonElement>('[data-action]');
      if (!action) return;
      const act = action.dataset.action;
      if (act === 'prev') {
        if (mode === 'month-year') {
          viewYear -= 1;
        } else {
          viewMonth -= 1;
          if (viewMonth < 1) { viewMonth = 12; viewYear -= 1; }
        }
        renderPanel();
      } else if (act === 'next') {
        if (mode === 'month-year') {
          viewYear += 1;
        } else {
          viewMonth += 1;
          if (viewMonth > 12) { viewMonth = 1; viewYear += 1; }
        }
        renderPanel();
      } else if (act === 'today') {
        state = dateToState(new Date(), '24h');
        viewYear = state.year; viewMonth = state.month;
        renderPanel();
      } else if (act === 'clear') {
        commit('');
        close();
      } else if (act === 'apply') {
        normalizeDay(state);
        commit(formatDateOutput(state, mode, '24h'));
        close();
      }
    });
    panel.addEventListener('input', e => {
      const input = (e.target as HTMLElement).closest<HTMLInputElement>('[data-time-part]');
      if (!input) return;
      const value = Math.max(0, parseInt(input.value || '0', 10) || 0);
      if (input.dataset.timePart === 'hour') state.hour = Math.min(23, value);
      if (input.dataset.timePart === 'minute') state.minute = Math.min(59, value);
    });
    document.addEventListener('mousedown', e => {
      if (!root.contains(e.target as Node)) close();
    });
    display();
  });
}

function bindMultiSelects(): void {
  document.querySelectorAll<HTMLElement>('.mf-ms[data-mf-ms="1"]').forEach(root => {
    if (root.dataset.mfMsBound === '1') return;
    root.dataset.mfMsBound = '1';
    const hidden = root.querySelector<HTMLInputElement>('.mf-ms-hidden');
    const trigger = root.querySelector<HTMLButtonElement>('.mf-ms-trigger');
    const tags = root.querySelector<HTMLElement>('.mf-ms-tags');
    const panel = root.querySelector<HTMLElement>('.mf-ms-panel');
    if (!hidden || !trigger || !tags || !panel) return;

    const getOptions = () => parseDataList<Array<{ value: string; label: string }>>(root.dataset.options, []);
    const maxTags = Math.max(0, parseInt(root.dataset.maxTags || '0', 10) || 0);
    const placeholder = pickLabel(root.dataset.placeholder, 'Select options...', 'form.select_options');
    const searchable = root.dataset.searchable !== 'false';
    const clearable = root.dataset.clearable !== 'false';
    let search = '';

    const selectedValues = () => splitCsv(hidden.value);
    const renderValue = () => {
      const selected = selectedValues();
      const options = getOptions();
      if (!selected.length) {
        tags.innerHTML = `<span class="mf-ms-placeholder">${esc(placeholder)}</span>`;
      } else {
        tags.innerHTML = selected.map(value => {
          const opt = options.find(o => String(o.value) === String(value));
          const label = opt ? opt.label : value;
          return `<span class="mf-ms-tag" data-value="${esc(value)}"><span>${esc(label)}</span>` +
            (root.dataset.readonly === 'true' ? '' : `<button type="button" class="mf-ms-remove" data-remove="${esc(value)}" aria-label="Remove ${esc(label)}">&times;</button>`) +
            `</span>`;
        }).join('');
      }
      root.classList.toggle('is-empty', !selected.length);
    };

    const renderPanel = () => {
      const selected = selectedValues();
      const options = getOptions().filter(opt => !selected.includes(String(opt.value)));
      const filtered = search
        ? options.filter(opt => String(opt.label).toLowerCase().includes(search.toLowerCase()))
        : options;
      let h = searchable ? `<div class="mf-ms-search-wrap"><input class="mf-ms-search" type="text" value="${esc(search)}" placeholder="${esc(pickLabel(root.dataset.searchPlaceholder, 'Search...', 'form.search'))}" aria-label="Search options"></div>` : '';
      if (!filtered.length) {
        h += `<div class="mf-ms-empty">${esc(search ? `${pickLabel(root.dataset.noMatch, 'No options match', 'form.no_options_match')} "${search}"` : pickLabel(root.dataset.noOptions, 'All options selected', 'form.all_options_selected'))}</div>`;
      } else {
        h += `<ul class="mf-ms-options">`;
        filtered.forEach(opt => {
          const disabled = maxTags > 0 && selected.length >= maxTags;
          h += `<li><button type="button" class="mf-ms-option" data-value="${esc(opt.value)}" role="option"${disabled ? ' disabled' : ''}>${esc(opt.label)}</button></li>`;
        });
        h += `</ul>`;
      }
      panel.innerHTML = h;
      panel.querySelector<HTMLInputElement>('.mf-ms-search')?.focus();
    };

    const setSelected = (values: string[]) => {
      hidden.value = values.join(',');
      dispatchInputChange(hidden);
      renderValue();
      renderPanel();
    };

    const close = () => {
      root.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      search = '';
    };
    const open = () => {
      if (trigger.disabled || root.dataset.disabled === 'true' || root.dataset.readonly === 'true') return;
      if (maxTags > 0 && selectedValues().length >= maxTags) return;
      closeOtherPickers(root, '.mf-cal.is-open, .mf-dtp.is-open, .mf-ms.is-open, .mf-mccb.is-open');
      renderPanel();
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    };

    trigger.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      const remove = t.closest<HTMLButtonElement>('[data-remove]');
      if (remove) {
        e.preventDefault(); e.stopPropagation();
        setSelected(selectedValues().filter(v => v !== remove.dataset.remove));
        return;
      }
      if (t.closest('.mf-ms-clear')) {
        if (clearable && selectedValues().length) {
          e.preventDefault(); e.stopPropagation();
          setSelected([]);
        }
        return;
      }
      e.preventDefault();
      root.classList.contains('is-open') ? close() : open();
    });
    panel.addEventListener('input', e => {
      const input = (e.target as HTMLElement).closest<HTMLInputElement>('.mf-ms-search');
      if (!input) return;
      search = input.value || '';
      renderPanel();
    });
    panel.addEventListener('click', e => {
      const opt = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-value]');
      if (!opt || opt.disabled) return;
      const current = selectedValues();
      if (maxTags > 0 && current.length >= maxTags) return;
      const next = current.concat(String(opt.dataset.value || ''));
      setSelected(next);
      if (maxTags > 0 && next.length >= maxTags) close();
    });
    document.addEventListener('mousedown', e => {
      if (!root.contains(e.target as Node)) close();
    });
    root.addEventListener('mf:options-updated', () => {
      renderValue();
      if (root.classList.contains('is-open')) renderPanel();
    });
    renderValue();
  });
}

function bindMultiColumnComboBoxes(): void {
  document.querySelectorAll<HTMLElement>('.mf-mccb[data-mf-mccb="1"]').forEach(root => {
    if (root.dataset.mfMccbBound === '1') return;
    root.dataset.mfMccbBound = '1';
    const hidden = root.querySelector<HTMLInputElement>('.mf-mccb-hidden');
    const trigger = root.querySelector<HTMLButtonElement>('.mf-mccb-trigger');
    const valueEl = root.querySelector<HTMLElement>('.mf-mccb-value');
    const panel = root.querySelector<HTMLElement>('.mf-mccb-panel');
    if (!hidden || !trigger || !valueEl || !panel) return;
    const getOptions = () => parseDataList<Array<Record<string, string>>>(root.dataset.options, []);
    const getColumns = () => parseDataList<Array<{ key: string; label: string; width?: string }>>(root.dataset.columns, []);
    const displayKey = root.dataset.displayKey || 'label';
    const searchable = root.dataset.searchable !== 'false';
    let search = '';

    const selectedOption = () => getOptions().find(o => String(o.id ?? o.value) === String(hidden.value || ''));
    const renderValue = () => {
      const opt = selectedOption();
      valueEl.innerHTML = opt ? esc(String(opt[displayKey] ?? opt.label ?? opt.value ?? '')) : `<span class="mf-mccb-placeholder">${esc(pickLabel(root.dataset.placeholder, 'Select an option...', 'form.select_an_option'))}</span>`;
      root.classList.toggle('is-empty', !opt);
    };
    const renderPanel = () => {
      const cols = getColumns();
      const all = getOptions();
      const filtered = search
        ? all.filter(opt => cols.some(col => String(opt[col.key] ?? '').toLowerCase().includes(search.toLowerCase())))
        : all;
      let h = searchable ? `<div class="mf-mccb-search-wrap"><input class="mf-mccb-search" type="text" value="${esc(search)}" placeholder="${esc(pickLabel(root.dataset.searchPlaceholder, 'Search...', 'form.search'))}" aria-label="Search options"></div>` : '';
      h += `<div class="mf-mccb-table-head" role="row">`;
      cols.forEach(col => { h += `<div style="width:${esc(col.width || `${Math.floor(100 / Math.max(cols.length, 1))}%`)}">${esc(col.label || col.key)}</div>`; });
      h += `</div>`;
      if (!filtered.length) {
        h += `<div class="mf-mccb-empty">${esc(search ? `${pickLabel(root.dataset.noMatch, 'No options match', 'form.no_options_match')} "${search}"` : pickLabel(root.dataset.noOptions, 'No options available', 'form.no_options_available'))}</div>`;
      } else {
        h += `<ul class="mf-mccb-options">`;
        filtered.forEach(opt => {
          const value = String(opt.id ?? opt.value ?? '');
          h += `<li><button type="button" class="mf-mccb-option${String(hidden.value) === value ? ' is-selected' : ''}" data-value="${esc(value)}" role="option" aria-selected="${String(hidden.value) === value ? 'true' : 'false'}">`;
          cols.forEach(col => { h += `<span style="width:${esc(col.width || `${Math.floor(100 / Math.max(cols.length, 1))}%`)}">${esc(String(opt[col.key] ?? ''))}</span>`; });
          h += `</button></li>`;
        });
        h += `</ul>`;
      }
      panel.innerHTML = h;
      panel.querySelector<HTMLInputElement>('.mf-mccb-search')?.focus();
    };
    const close = () => {
      root.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      search = '';
    };
    const open = () => {
      if (trigger.disabled || root.dataset.disabled === 'true' || root.dataset.readonly === 'true') return;
      closeOtherPickers(root, '.mf-cal.is-open, .mf-dtp.is-open, .mf-ms.is-open, .mf-mccb.is-open');
      renderPanel();
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    };
    trigger.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      if (t.closest('.mf-mccb-clear')) {
        e.preventDefault(); e.stopPropagation();
        hidden.value = '';
        dispatchInputChange(hidden);
        renderValue();
        renderPanel();
        return;
      }
      e.preventDefault();
      root.classList.contains('is-open') ? close() : open();
    });
    panel.addEventListener('input', e => {
      const input = (e.target as HTMLElement).closest<HTMLInputElement>('.mf-mccb-search');
      if (!input) return;
      search = input.value || '';
      renderPanel();
    });
    panel.addEventListener('click', e => {
      const opt = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-value]');
      if (!opt) return;
      hidden.value = String(opt.dataset.value || '');
      dispatchInputChange(hidden);
      renderValue();
      close();
    });
    document.addEventListener('mousedown', e => {
      if (!root.contains(e.target as Node)) close();
    });
    root.addEventListener('mf:options-updated', () => {
      renderValue();
      if (root.classList.contains('is-open')) renderPanel();
    });
    renderValue();
  });
}

function bindRatingStars(): void {
  document.querySelectorAll<HTMLElement>('.mf-rating .mf-rating-item, .mf-rating .mf-star').forEach(star => {
    star.addEventListener('click', function (this: HTMLElement) {
      const root = this.closest<HTMLElement>('.mf-rating');
      if (!root || root.getAttribute('aria-disabled') === 'true') return;
      const val = this.getAttribute('data-val') || '';
      const hidden = root.querySelector<HTMLInputElement>('input[type="hidden"]');
      if (hidden) hidden.value = val;
      root.setAttribute('data-value', val);

      const style = root.getAttribute('data-style') || 'star';
      root.querySelectorAll<HTMLElement>('.mf-rating-item, .mf-star').forEach(s => {
        if (style === 'thumbs') {
          s.classList.toggle('is-active', s.getAttribute('data-val') === val);
          return;
        }
        const sv = parseInt(s.getAttribute('data-val') || '0', 10);
        s.classList.toggle('is-active', sv <= parseInt(val, 10));
        s.style.color = '';
      });

      const value = root.querySelector<HTMLElement>('.mf-rating-value');
      if (value) value.textContent = style === 'thumbs' ? val : `${val} ${dtpT('form.out_of_5', 'out of 5')}`;
    });
  });
}

function bindFileUploads(config: RendererConfig): void {
  document.querySelectorAll<HTMLElement>('.mf-file-dropzone').forEach(zone => {
    const input = zone.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) return;

    const fieldKey = input.name || '';
    let fieldCfg: any = null;
    config.schema?.fields?.forEach(f => { if (f.key === fieldKey) fieldCfg = f; });
    const fs = fieldCfg?.fileSettings || {};
    const maxSizeBytes = (fs.maxSizeMB || 10) * 1024 * 1024;
    let allowedTypes = fs.allowedTypes || fs.allowedExtensions || '';
    if (Array.isArray(allowedTypes)) allowedTypes = allowedTypes.join(',');

    zone.addEventListener('click', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.mf-file-remove')) return;
      input.click();
    });
    zone.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); zone.classList.add('mf-file-dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('mf-file-dragover'));
    zone.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      zone.classList.remove('mf-file-dragover');
      if (e.dataTransfer?.files.length) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change'));
      }
    });

    input.addEventListener('change', function () {
      const list = zone.querySelector<HTMLElement>('.mf-file-list');
      const errEl = fieldKey ? document.getElementById(`mf-err-${fieldKey}`) : null;
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      if (list) list.innerHTML = '';
      const errors: string[] = [];

      Array.from(this.files || []).forEach((f, index) => {
        if (f.size > maxSizeBytes) {
          errors.push(`${f.name} exceeds ${fs.maxSizeMB || 10}MB limit`);
          return;
        }
        if (allowedTypes) {
          const ext = '.' + f.name.split('.').pop()!.toLowerCase();
          const allowed = (allowedTypes as string).toLowerCase().split(',').map(s => s.trim());
          if (allowed.length > 0 && allowed[0] && !allowed.includes(ext)) {
            errors.push(`${f.name}: type not allowed. Accepted: ${allowedTypes}`);
            return;
          }
        }
        if (list) {
          const ext = (f.name.split('.').pop() || 'file').toUpperCase();
          list.innerHTML += `<div class="mf-file-item mf-file-item-success" data-index="${index}">` +
            `<span class="mf-file-type-icon">${esc(ext.slice(0, 3))}</span>` +
            `<span class="mf-file-meta"><span class="mf-file-name">${esc(f.name)}</span><span class="mf-file-size">${(f.size / 1024).toFixed(1)} KB</span></span>` +
            `<span class="mf-file-status" aria-label="Ready">&#10003;</span>` +
            `<button type="button" class="mf-file-remove" aria-label="Remove file">&#215;</button>` +
          `</div>`;
        }
      });

      if (errors.length > 0) {
        input.value = '';
        if (list) list.innerHTML = '';
        if (errEl) { errEl.textContent = errors.join('; '); errEl.style.display = ''; }
      }
    });

    zone.addEventListener('click', (e: MouseEvent) => {
      const remove = (e.target as HTMLElement).closest<HTMLButtonElement>('.mf-file-remove');
      if (!remove) return;
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      const list = zone.querySelector<HTMLElement>('.mf-file-list');
      if (list) list.innerHTML = '';
    });
  });
}

function bindFileUploadsLegacy(config: RendererConfig): void {
  document.querySelectorAll<HTMLElement>('.mf-file-dropzone').forEach(zone => {
    const input = zone.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) return;

    const fieldKey = input.name || '';
    let fieldCfg: any = null;
    config.schema?.fields?.forEach(f => { if (f.key === fieldKey) fieldCfg = f; });
    const fs = fieldCfg?.fileSettings || {};
    const maxSizeBytes = (fs.maxSizeMB || 10) * 1024 * 1024;
    let allowedTypes = fs.allowedTypes || fs.allowedExtensions || '';
    if (Array.isArray(allowedTypes)) allowedTypes = allowedTypes.join(',');

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); zone.classList.add('mf-file-dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('mf-file-dragover'));
    zone.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      zone.classList.remove('mf-file-dragover');
      if (e.dataTransfer?.files.length) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change'));
      }
    });

    input.addEventListener('change', function () {
      const list = zone.querySelector<HTMLElement>('.mf-file-list');
      const errEl = fieldKey ? document.getElementById(`mf-err-${fieldKey}`) : null;
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      if (list) list.innerHTML = '';
      const errors: string[] = [];

      Array.from(this.files || []).forEach(f => {
        if (f.size > maxSizeBytes) {
          errors.push(`${f.name} exceeds ${fs.maxSizeMB || 10}MB limit`);
          return;
        }
        if (allowedTypes) {
          const ext = '.' + f.name.split('.').pop()!.toLowerCase();
          const allowed = (allowedTypes as string).toLowerCase().split(',').map(s => s.trim());
          if (allowed.length > 0 && allowed[0] && !allowed.includes(ext)) {
            errors.push(`${f.name}: type not allowed. Accepted: ${allowedTypes}`);
            return;
          }
        }
        if (list) list.innerHTML += `<div class="mf-file-item"><span>📎 ${esc(f.name)} (${(f.size / 1024).toFixed(1)} KB)</span></div>`;
      });

      if (errors.length > 0) {
        input.value = '';
        if (list) list.innerHTML = '';
        if (errEl) { errEl.textContent = errors.join('; '); errEl.style.display = ''; }
      }
    });
  });
}

function bindSignaturePads(): void {
  document.querySelectorAll<HTMLButtonElement>('.mf-sig-clear').forEach(btn => {
    const canvasId = btn.getAttribute('data-canvas')!;
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let drawing = false;
    const wrapper = canvas.closest<HTMLElement>('.mf-signature-field');
    const hiddenInput = wrapper?.querySelector<HTMLInputElement>('input[type="hidden"]');
    // [SignaturePlaceholder v20260502-07] Toggle .mf-signature-empty on the
    // wrapper to hide the pen-icon hint once user starts drawing, restore on
    // clear. Wrapper is the .mf-signature-field div around the canvas.
    const markDrawn = () => { if (wrapper) wrapper.classList.remove('mf-signature-empty'); };
    const markEmpty = () => { if (wrapper) wrapper.classList.add('mf-signature-empty'); };

    function resizeCanvas(): void {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width === width && canvas.height === height) return;
      const snapshot = canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL('image/png') : '';
      canvas.width = width;
      canvas.height = height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
      if (snapshot) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
          saveSignatureData();
        };
        img.src = snapshot;
      }
    }

    function getPoint(clientX: number, clientY: number): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width / Math.max(window.devicePixelRatio || 1, 1) : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height / Math.max(window.devicePixelRatio || 1, 1) : 1;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    }

    function saveSignatureData(): void {
      if (!hiddenInput) return;
      const blank = document.createElement('canvas');
      blank.width = canvas.width;
      blank.height = canvas.height;
      hiddenInput.value = canvas.toDataURL() === blank.toDataURL() ? '' : canvas.toDataURL('image/png');
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      resizeCanvas();
      drawing = true;
      markDrawn();  // hide placeholder on first stroke
      const p = getPoint(e.clientX, e.clientY);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    });
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (!drawing) return;
      const p = getPoint(e.clientX, e.clientY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    canvas.addEventListener('mouseup', () => { drawing = false; saveSignatureData(); });
    canvas.addEventListener('mouseleave', () => { if (drawing) { drawing = false; saveSignatureData(); } });

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      resizeCanvas();
      drawing = true;
      markDrawn();  // hide placeholder on first touch stroke
      const t = e.touches[0];
      const p = getPoint(t.clientX, t.clientY);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      if (!drawing) return;
      const t = e.touches[0];
      const p = getPoint(t.clientX, t.clientY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }, { passive: false });
    canvas.addEventListener('touchend', () => { drawing = false; saveSignatureData(); });

    btn.addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (hiddenInput) hiddenInput.value = '';
      markEmpty();  // restore placeholder when cleared
    });
  });
}
