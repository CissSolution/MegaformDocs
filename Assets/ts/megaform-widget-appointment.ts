/**
 * MegaForm Widget: Appointment Scheduler
 * Badge: AppointmentWidget v20260403-02
 *
 * Canonical TS source for the Appointment widget.
 * Build output: Assets/js/plugins/megaform-widget-appointment.js
 */

declare const MegaFormWidgets: {
  register(type: string, plugin: AppointmentPlugin): void;
};
declare namespace MFUtil {
  function esc(s: string | null | undefined): string;
}

interface AppointmentField {
  key: string;
  type: string;
  label?: string;
  required?: boolean;
  widgetProps?: AppointmentProps;
}

interface AppointmentProps {
  displayStyle?: 'calendar' | 'compact';
  compactVisibleDays?: number;
  slotDuration?: number;
  bufferTime?: number;
  startHour?: number;
  endHour?: number;
  maxPerSlot?: number;
  daysAhead?: number;
  excludeWeekends?: boolean;
  excludeDays?: string[];
  timeFormat?: '12h' | '24h';
  timeSlots?: string[];
  availableSlots?: AppointmentAvailability[] | null;
}

interface AppointmentAvailability {
  date: string;
  time: string;
  available?: boolean;
}

interface AppointmentPlugin {
  meta: { label: string; icon: string; category: string };
  badge?: string;
  defaults: AppointmentProps;
  properties: PropertyDef[];
  render(field: AppointmentField, formId: string | number, val: string): string;
  bind(formId: string | number): void;
  collect(key: string, container: Element): string;
  validate(key: string, container: Element): boolean;
}

interface PropertyDef {
  key: string;
  label: string;
  type: string;
  default: any;
  options?: { label: string; value: string }[];
}

interface AppointmentState {
  currentMonth: Date;
  windowStart: Date;
  selectedDate: string;
  selectedTime: string;
}

interface NormalizedSlot {
  value: string;
  label: string;
  available: boolean;
}

(function () {
  "use strict";

  var BADGE = "AppointmentWidget v20260414-10";

  function tr(key: string, fallback: string, params?: Record<string, string | number>): string {
    try {
      var i18n = (window as any).MegaFormI18n || (window as any).MF_I18N;
      if (i18n && typeof i18n.t === "function") return i18n.t(key, params || {}, fallback);
    } catch (_err) { }
    var raw = String(fallback == null ? "" : fallback);
    if (params) Object.keys(params).forEach(function(name) { raw = raw.replace(new RegExp("\\{" + name + "\\}", "g"), String((params as any)[name] == null ? "" : (params as any)[name])); });
    return raw;
  }

  function getLocale(scope?: Element | null): string {
    function pick(value: any): string {
      var raw = String(value == null ? "" : value).trim();
      return raw || "";
    }
    try {
      if (scope && typeof (scope as any).closest === "function") {
        var scopedLocale = (scope as any).closest("[data-mf-locale]");
        if (scopedLocale) {
          var scopedData = pick(scopedLocale.getAttribute("data-mf-locale"));
          if (scopedData) return scopedData;
        }
        var scopedLang = (scope as any).closest("[lang]");
        if (scopedLang) {
          var scopedLangValue = pick((scopedLang as Element).getAttribute("lang"));
          if (scopedLangValue) return scopedLangValue;
        }
      }
    } catch (_scopeErr) { }

    try {
      var htmlData = pick(document.documentElement.getAttribute("data-mf-locale"));
      if (htmlData) return htmlData;
      var bodyData = pick(document.body && document.body.getAttribute("data-mf-locale"));
      if (bodyData) return bodyData;
      var htmlLang = pick(document.documentElement.getAttribute("lang"));
      if (htmlLang) return htmlLang;
      var bodyLang = pick(document.body && document.body.getAttribute("lang"));
      if (bodyLang) return bodyLang;
    } catch (_domErr) { }

    try {
      var i18n = (window as any).MegaFormI18n || (window as any).MF_I18N;
      if (i18n && typeof i18n.getLocale === "function") return String(i18n.getLocale() || "en-US");
      if (i18n && i18n.locale) return String(i18n.locale || "en-US");
    } catch (_err) { }

    try {
      var globalLocale = pick((window as any).MegaFormLocale);
      if (globalLocale) return globalLocale;
    } catch (_globalErr) { }

    try {
      return pick(navigator.language) || "en-US";
    } catch (_navErr) { }
    return "en-US";
  }

  function formatWithLocale(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
    try {
      return new Intl.DateTimeFormat(locale || "en-US", options).format(date);
    } catch (_err) {
      try { return date.toLocaleDateString(locale || "en-US", options); } catch (_dateErr) { }
    }
    return "";
  }

  function getMonthNames(locale: string): string[] {
    var out: string[] = [];
    for (var i = 0; i < 12; i++) out.push(formatWithLocale(new Date(2024, i, 1), locale, { month: "long" }));
    return out;
  }

  function getDayNames(locale: string): string[] {
    var base = new Date(2024, 0, 7);
    var out: string[] = [];
    for (var i = 0; i < 7; i++) out.push(formatWithLocale(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i), locale, { weekday: "short" }));
    return out;
  }

  function esc(s: any): string {
    var str = String(s == null ? "" : s);
    if (typeof MFUtil !== "undefined" && MFUtil && typeof MFUtil.esc === "function") return MFUtil.esc(str);
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  }

  function safeJsonParse(text: string): any {
    try { return JSON.parse(text || "{}"); } catch (_err) { return {}; }
  }

  function safeArray(value: any): any[] {
    return Array.isArray(value) ? value : [];
  }

  function toInt(value: any, fallback: number): number {
    var n = parseInt(String(value), 10);
    return isNaN(n) ? fallback : n;
  }

  function pad(n: number): string { return n < 10 ? "0" + n : String(n); }
  function isoDate(date: Date): string { return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()); }
  function timeValue(hour: number, minute: number): string { return pad(hour) + ":" + pad(minute); }

  function parseIsoDate(text: string): Date | null {
    if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    var parts = text.split("-");
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var day = parseInt(parts[2], 10);
    var d = new Date(year, month, day);
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function todayLocal(): Date {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatCalendarTitle(date: Date, locale: string): string {
    return formatWithLocale(new Date(date.getFullYear(), date.getMonth(), 1), locale, { month: "long", year: "numeric" });
  }

  function formatInputDate(dateText: string, locale: string): string {
    var d = parseIsoDate(dateText);
    return d ? formatWithLocale(d, locale, { year: "numeric", month: "2-digit", day: "2-digit" }) : tr("widget.appointment.date_placeholder", "MM/DD/YYYY");
  }

  function formatTriggerValue(dateText: string, timeText: string, cfg: AppointmentProps, locale: string): string {
    if (!dateText || !timeText) return tr("widget.appointment.date_placeholder", "MM/DD/YYYY");
    var dateLabel = formatInputDate(dateText, locale);
    var timeLabel = formatTimeLabel(timeText, (cfg.timeFormat || "12h"), locale);
    if (!dateLabel) return timeLabel || tr("widget.appointment.date_placeholder", "MM/DD/YYYY");
    if (!timeLabel) return dateLabel;
    return dateLabel + " • " + timeLabel;
  }

  function formatSelectedDate(dateText: string, includeYear: boolean, locale: string): string {
    var d = parseIsoDate(dateText);
    if (!d) return includeYear ? tr("widget.appointment.select_date", "Select a date") : tr("widget.appointment.choose_date", "Choose a date");
    var options: Intl.DateTimeFormatOptions = includeYear
      ? { weekday: "long", month: "long", day: "2-digit", year: "numeric" }
      : { weekday: "long", month: "long", day: "2-digit" };
    return formatWithLocale(d, locale, options);
  }

  function formatTimeLabel(value: string, mode: string, locale: string): string {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return value || "";
    var parts = value.split(":");
    var hour = parseInt(parts[0], 10);
    var minute = parseInt(parts[1], 10);
    var date = new Date(2024, 0, 1, hour, minute, 0, 0);
    var options: Intl.DateTimeFormatOptions = mode === "24h"
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : { hour: "numeric", minute: "2-digit", hour12: true };
    var text2 = formatWithLocale(date, locale, options);
    return text2 || value;
  }

  function getTimezoneLabel(locale: string): string {
    var label = tr("widget.appointment.local_time", "Local time");
    var zone = "";
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (_err) { }
    var now = new Date();
    var time = formatWithLocale(now, locale, { hour: "2-digit", minute: "2-digit" });
    return label + (zone ? ": " + zone : "") + (time ? " (" + time + ")" : "");
  }

  function isWeekend(date: Date): boolean {
    var day = date.getDay();
    return day === 0 || day === 6;
  }

  function normalizeConfig(raw: AppointmentProps): AppointmentProps {
    var cfg = raw || {};
    return {
      displayStyle: cfg.displayStyle === 'compact' ? 'compact' : 'calendar',
      compactVisibleDays: Math.max(3, Math.min(7, toInt((cfg as any).compactVisibleDays, 5))),
      slotDuration: toInt(cfg.slotDuration, 30),
      bufferTime: toInt(cfg.bufferTime, 10),
      startHour: toInt(cfg.startHour, 9),
      endHour: toInt(cfg.endHour, 17),
      maxPerSlot: toInt(cfg.maxPerSlot, 1),
      daysAhead: toInt(cfg.daysAhead, 30),
      excludeWeekends: cfg.excludeWeekends !== false,
      excludeDays: safeArray(cfg.excludeDays),
      timeFormat: cfg.timeFormat === "24h" ? "24h" : "12h",
      timeSlots: safeArray((cfg as any).timeSlots),
      availableSlots: Array.isArray(cfg.availableSlots) ? cfg.availableSlots : null
    };
  }

  function isDateDisabled(date: Date, cfg: AppointmentProps): boolean {
    var today = todayLocal();
    var maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    maxDate.setDate(maxDate.getDate() + (cfg.daysAhead || 30));
    if (date < today) return true;
    if (date > maxDate) return true;
    if (cfg.excludeWeekends && isWeekend(date)) return true;
    var deny = safeArray(cfg.excludeDays);
    return deny.indexOf(isoDate(date)) >= 0;
  }

  function normalizeSlotsForDate(cfg: AppointmentProps, dateText: string, locale: string): NormalizedSlot[] {
    var formatMode = cfg.timeFormat || "12h";
    var slots: NormalizedSlot[] = [];
    var available = Array.isArray(cfg.availableSlots) ? cfg.availableSlots : null;
    if (available && available.length) {
      for (var i = 0; i < available.length; i++) {
        var item = available[i];
        if (!item || item.date !== dateText || !item.time) continue;
        slots.push({
          value: item.time,
          label: formatTimeLabel(item.time, formatMode, locale),
          available: item.available !== false
        });
      }
      return slots;
    }

    var manual = safeArray((cfg as any).timeSlots);
    if (manual.length) {
      for (var j = 0; j < manual.length; j++) {
        var t = String(manual[j] || "").trim();
        if (!t) continue;
        slots.push({ value: t, label: formatTimeLabel(t, formatMode, locale), available: true });
      }
      return slots;
    }

    var slotDuration = cfg.slotDuration || 30;
    var buffer = cfg.bufferTime || 10;
    var hour = cfg.startHour || 9;
    var minute = 0;
    while (hour < (cfg.endHour || 17) || (hour === (cfg.endHour || 17) && minute === 0)) {
      var value = timeValue(hour, minute);
      slots.push({ value: value, label: formatTimeLabel(value, formatMode, locale), available: true });
      minute += slotDuration + buffer;
      while (minute >= 60) {
        minute -= 60;
        hour += 1;
      }
      if (hour > 23) break;
    }
    return slots;
  }

  function buildCalendarHtml(month: Date, cfg: AppointmentProps, selectedDate: string, locale: string): string {
    var year = month.getFullYear();
    var monthIndex = month.getMonth();
    var firstDay = new Date(year, monthIndex, 1).getDay();
    var daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    var html = '<div class="mfw-cal-title">' + esc(formatCalendarTitle(month, locale)) + '</div>';
    html += '<div class="mfw-cal-grid">';
    var dayNames = getDayNames(locale);
    for (var h = 0; h < dayNames.length; h++) html += '<div class="mfw-cal-header">' + dayNames[h] + '</div>';
    for (var e = 0; e < firstDay; e++) html += '<div class="mfw-cal-empty"></div>';

    var today = todayLocal();
    for (var d = 1; d <= daysInMonth; d++) {
      var date = new Date(year, monthIndex, d);
      date.setHours(0, 0, 0, 0);
      var key = isoDate(date);
      var classes = ["mfw-cal-day"];
      if (isDateDisabled(date, cfg)) classes.push("disabled");
      if (key === selectedDate) classes.push("selected");
      if (key === isoDate(today)) classes.push("today");
      html += '<button type="button" class="' + classes.join(" ") + '" data-date="' + key + '"' + (classes.indexOf("disabled") >= 0 ? ' disabled aria-disabled="true"' : "") + '>' + d + '</button>';
    }
    html += '</div>';
    return html;
  }



  function addDays(date: Date, days: number): Date {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function findAvailableDates(cfg: AppointmentProps, start: Date, count: number): Date[] {
    var out: Date[] = [];
    var cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    cursor.setHours(0, 0, 0, 0);
    var safety = 0;
    while (out.length < count && safety < Math.max(90, (cfg.daysAhead || 30) + 60)) {
      if (!isDateDisabled(cursor, cfg)) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      cursor = addDays(cursor, 1);
      safety += 1;
    }
    return out;
  }

  function formatCompactWeekday(date: Date, locale: string): string {
    return formatWithLocale(date, locale, { weekday: 'short' }).replace(/\.$/, '').toUpperCase();
  }

  function buildCompactDaysHtml(cfg: AppointmentProps, startDate: Date, selectedDate: string, locale: string): string {
    var days = findAvailableDates(cfg, startDate, cfg.compactVisibleDays || 5);
    var html = '';
    for (var i = 0; i < days.length; i++) {
      var day = days[i];
      var key = isoDate(day);
      var classes = ['mfw-appt-compact-day'];
      if (key === selectedDate) classes.push('selected');
      html += '<button type="button" class="' + classes.join(' ') + '" data-date="' + key + '">';
      html += '<span class="mfw-appt-compact-dow">' + esc(formatCompactWeekday(day, locale)) + '</span>';
      html += '<span class="mfw-appt-compact-dom">' + esc(formatWithLocale(day, locale, { day: '2-digit' })) + '</span>';
      html += '</button>';
    }
    return html;
  }

  function buildMonthOptions(currentMonth: Date, locale: string): string {
    var html = "";
    for (var i = 0; i < 12; i++) {
      html += '<option value="' + i + '"' + (i === currentMonth.getMonth() ? ' selected' : '') + '>' + getMonthNames(locale)[i] + '</option>';
    }
    return html;
  }

  function buildYearOptions(currentMonth: Date, cfg: AppointmentProps): string {
    var today = todayLocal();
    var maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    maxDate.setDate(maxDate.getDate() + (cfg.daysAhead || 30));
    var startYear = today.getFullYear();
    var endYear = Math.max(startYear, maxDate.getFullYear());
    var html = "";
    for (var y = startYear; y <= endYear; y++) {
      html += '<option value="' + y + '"' + (y === currentMonth.getFullYear() ? ' selected' : '') + '>' + y + '</option>';
    }
    return html;
  }

  function setHiddenValue(hidden: HTMLInputElement | null, state: AppointmentState, cfg: AppointmentProps, locale: string): void {
    if (!hidden) return;
    if (!state.selectedDate || !state.selectedTime) {
      hidden.value = "";
      return;
    }
    hidden.value = JSON.stringify({
      date: state.selectedDate,
      time: state.selectedTime,
      duration: cfg.slotDuration || 30,
      timezone: getTimezoneLabel(locale),
      bookedAt: new Date().toISOString()
    });
  }

  MegaFormWidgets.register("Appointment", {
    meta: { label: "Appointment", icon: "fa-calendar-check", category: "advanced" },
    badge: BADGE,
    defaults: {
      slotDuration: 30,
      bufferTime: 10,
      startHour: 9,
      endHour: 17,
      maxPerSlot: 1,
      daysAhead: 30,
      excludeWeekends: true,
      excludeDays: [],
      timeFormat: "12h",
      availableSlots: null
    },
    properties: [
      { key: "displayStyle", label: "Display Style", type: "select", options: [
        { label: "Calendar + slots", value: "calendar" },
        { label: "Compact days + pills", value: "compact" }
      ], default: "calendar" },
      { key: "compactVisibleDays", label: "Compact Visible Days", type: "number", default: 5 },
      { key: "slotDuration", label: "Slot Duration (min)", type: "number", default: 30 },
      { key: "bufferTime", label: "Buffer Between (min)", type: "number", default: 10 },
      { key: "startHour", label: "Start Hour (0-23)", type: "number", default: 9 },
      { key: "endHour", label: "End Hour (0-23)", type: "number", default: 17 },
      { key: "maxPerSlot", label: "Max Bookings/Slot", type: "number", default: 1 },
      { key: "daysAhead", label: "Days Ahead", type: "number", default: 30 },
      { key: "excludeWeekends", label: "Exclude Weekends", type: "checkbox", default: true },
      { key: "timeFormat", label: "Time Format", type: "select", options: [
        { label: "12h (AM/PM)", value: "12h" },
        { label: "24h", value: "24h" }
      ], default: "12h" }
    ],
    render: function (field: AppointmentField, formId: string | number, val: string): string {
      var id = "mf-" + formId + "-" + field.key;
      var cfg = normalizeConfig(field.widgetProps || {});
      var parsed = safeJsonParse(val || "{}");
      var initialDate = typeof parsed.date === "string" ? parsed.date : "";
      var initialTime = typeof parsed.time === "string" ? parsed.time : "";
      var configJson = esc(JSON.stringify(cfg));
      var html = '';
      html += '<div class="mfw-appt mfw-appt-modern" id="' + id + '-wrap" data-field-key="' + esc(field.key) + '" data-initial-date="' + esc(initialDate) + '" data-initial-time="' + esc(initialTime) + '">';
      html += '  <div class="mfw-appt-shell">';
      html += '    <div class="mfw-appt-trigger">';
      html += '      <div class="mfw-appt-datebar">';
      html += '        <div class="mfw-appt-datevalue" id="' + id + '-datevalue">' + esc(tr('widget.appointment.date_placeholder', 'MM/DD/YYYY')) + '</div>';
      html += '        <button type="button" class="mfw-appt-dateicon" id="' + id + '-today" aria-label="' + esc(tr('widget.appointment.open_calendar', 'Open calendar')) + '">';
      html += '          <span class="mfw-appt-dateicon-glyph">&#128197;</span>';
      html += '        </button>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="mfw-appt-popover" id="' + id + '-popover" hidden>';
      if ((cfg.displayStyle || 'calendar') === 'compact') {
        html += '      <div class="mfw-appt-compact">';
        html += '        <div class="mfw-appt-compact-head">';
        html += '          <button type="button" class="mfw-cal-prev mfw-appt-compact-nav" id="' + id + '-prev" aria-label="' + esc(tr('widget.appointment.previous_days', 'Previous days')) + '">&#8249;</button>';
        html += '          <div class="mfw-appt-compact-days" id="' + id + '-days"></div>';
        html += '          <button type="button" class="mfw-cal-next mfw-appt-compact-nav" id="' + id + '-next" aria-label="' + esc(tr('widget.appointment.next_days', 'Next days')) + '">&#8250;</button>';
        html += '        </div>';
        html += '        <div class="mfw-appt-selected-date mfw-appt-selected-date-hidden" id="' + id + '-seldate"></div>';
        html += '        <div class="mfw-appt-slots mfw-appt-slots-compact" id="' + id + '-slots"></div>';
        html += '        <div class="mfw-appt-no-slots" id="' + id + '-empty">' + esc(tr('widget.appointment.choose_date_prompt', 'Choose a date to see available times.')) + '</div>';
        html += '        <div class="mfw-appt-timezone mfw-appt-timezone-hidden" id="' + id + '-tz"></div>';
        html += '      </div>';
      } else {
        html += '      <div class="mfw-appt-main">';
        html += '        <div class="mfw-appt-panel mfw-appt-panel-left">';
        html += '          <div class="mfw-appt-picker-row">';
        html += '            <select class="mfw-appt-select mfw-appt-month" id="' + id + '-month"></select>';
        html += '            <select class="mfw-appt-select mfw-appt-year" id="' + id + '-year"></select>';
        html += '          </div>';
        html += '          <div class="mfw-appt-calendar" id="' + id + '-cal"></div>';
        html += '        </div>';
        html += '        <div class="mfw-appt-panel mfw-appt-panel-right">';
        html += '        <div class="mfw-appt-right-head">';
        html += '          <div class="mfw-appt-selected-date" id="' + id + '-seldate">' + esc(tr('widget.appointment.choose_date', 'Choose a date')) + '</div>';
        html += '          <div class="mfw-appt-inline-nav">';
        html += '            <button type="button" class="mfw-cal-prev" id="' + id + '-prev" aria-label="' + esc(tr('widget.appointment.previous_month', 'Previous month')) + '">&#8249;</button>';
        html += '            <button type="button" class="mfw-cal-next" id="' + id + '-next" aria-label="' + esc(tr('widget.appointment.next_month', 'Next month')) + '">&#8250;</button>';
        html += '          </div>';
        html += '        </div>';
        html += '        <div class="mfw-appt-slots" id="' + id + '-slots"></div>';
        html += '        <div class="mfw-appt-no-slots" id="' + id + '-empty">' + esc(tr('widget.appointment.choose_date_prompt', 'Choose a date to see available times.')) + '</div>';
        html += '        <div class="mfw-appt-timezone" id="' + id + '-tz"></div>';
        html += '        <div class="mfw-appt-confirm" id="' + id + '-confirm">';
        html += '          <div class="mfw-appt-confirm-title"><span class="mfw-appt-confirm-icon">&#10003;</span><span>' + esc(tr('widget.appointment.selected', 'Selected appointment')) + '</span></div>';
        html += '          <div class="mfw-appt-summary" id="' + id + '-summary"></div>';
        html += '          <button type="button" class="mfw-appt-change" id="' + id + '-change">' + esc(tr('widget.appointment.change_selection', 'Change selection')) + '</button>';
        html += '        </div>';
        html += '        </div>';
        html += '      </div>';
      }
      html += '    </div>';
      html += '  </div>';
      html += '  <script type="application/json" class="mfw-appt-config">' + configJson + '</script>';
      html += '  <input type="hidden" name="' + field.key + '" id="' + id + '" value="' + esc(val || "") + '">';
      html += '  <div class="mf-field-error" id="mf-err-' + field.key + '"></div>';
      html += '</div>';
      return html;
    },
    bind: function (_formId: string | number): void {
      var wraps = document.querySelectorAll('.mfw-appt');
      for (var i = 0; i < wraps.length; i++) {
        var wrap = wraps[i] as any;
        if (wrap._apptBound) continue;
        wrap._apptBound = true;

        var cfgNode = wrap.querySelector('.mfw-appt-config') as HTMLScriptElement | null;
        var hidden = wrap.querySelector('input[type="hidden"]') as HTMLInputElement | null;
        var fieldKey = wrap.getAttribute('data-field-key') || '';
        var initialDate = wrap.getAttribute('data-initial-date') || '';
        var initialTime = wrap.getAttribute('data-initial-time') || '';
        var cfg = normalizeConfig(safeJsonParse(cfgNode ? cfgNode.textContent || '{}' : '{}'));

        var initialDateObj = parseIsoDate(initialDate);
        var state: AppointmentState = {
          currentMonth: initialDateObj ? new Date(initialDateObj.getFullYear(), initialDateObj.getMonth(), 1) : new Date(todayLocal().getFullYear(), todayLocal().getMonth(), 1),
          windowStart: initialDateObj ? new Date(initialDateObj.getFullYear(), initialDateObj.getMonth(), initialDateObj.getDate()) : todayLocal(),
          selectedDate: initialDateObj && !isDateDisabled(initialDateObj, cfg) ? initialDate : '',
          selectedTime: initialTime || ''
        };

        var dateValue = wrap.querySelector('.mfw-appt-datevalue') as HTMLElement | null;
        var monthSelect = wrap.querySelector('.mfw-appt-month') as HTMLSelectElement | null;
        var compactDaysEl = wrap.querySelector('.mfw-appt-compact-days') as HTMLElement | null;
        var yearSelect = wrap.querySelector('.mfw-appt-year') as HTMLSelectElement | null;
        var calEl = wrap.querySelector('.mfw-appt-calendar') as HTMLElement | null;
        var selectedDateEl = wrap.querySelector('.mfw-appt-selected-date') as HTMLElement | null;
        var slotsEl = wrap.querySelector('.mfw-appt-slots') as HTMLElement | null;
        var emptyEl = wrap.querySelector('.mfw-appt-no-slots') as HTMLElement | null;
        var tzEl = wrap.querySelector('.mfw-appt-timezone') as HTMLElement | null;
        var confirmEl = wrap.querySelector('.mfw-appt-confirm') as HTMLElement | null;
        var summaryEl = wrap.querySelector('.mfw-appt-summary') as HTMLElement | null;
        var prevBtn = wrap.querySelector('.mfw-cal-prev') as HTMLButtonElement | null;
        var nextBtn = wrap.querySelector('.mfw-cal-next') as HTMLButtonElement | null;
        var todayBtn = wrap.querySelector('.mfw-appt-dateicon') as HTMLButtonElement | null;
        var changeBtn = wrap.querySelector('.mfw-appt-change') as HTMLButtonElement | null;
        var popover = wrap.querySelector('.mfw-appt-popover') as HTMLElement | null;

        var getWrapLocale = function (): string {
          return getLocale(wrap);
        };

        var isOpen = false;
        var setOpen = function (open: boolean): void {
          isOpen = !!open;
          if (popover) {
            if (isOpen) popover.removeAttribute('hidden');
            else popover.setAttribute('hidden', 'hidden');
          }
          wrap.classList.toggle('is-open', isOpen);
        };

        var syncMonthYear = function (): void {
          var locale = getWrapLocale();
          if (monthSelect) monthSelect.innerHTML = buildMonthOptions(state.currentMonth, locale);
          if (yearSelect) yearSelect.innerHTML = buildYearOptions(state.currentMonth, cfg);
        };

        var syncCalendar = function (): void {
          if (!calEl) return;
          calEl.innerHTML = buildCalendarHtml(state.currentMonth, cfg, state.selectedDate, getWrapLocale());
          var days = calEl.querySelectorAll('.mfw-cal-day');
          for (var d = 0; d < days.length; d++) {
            days[d].addEventListener('click', function (ev) {
              var target = ev.currentTarget as HTMLElement;
              var nextDate = target.getAttribute('data-date') || '';
              if (!nextDate) return;
              state.selectedDate = nextDate;
              state.selectedTime = '';
              var parsed = parseIsoDate(nextDate);
              if (parsed) state.currentMonth = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
              renderAll();
            });
          }
        };

        var syncSlots = function (): void {
          if (!slotsEl || !emptyEl) return;
          var locale = getWrapLocale();
          if (selectedDateEl) selectedDateEl.textContent = state.selectedDate ? formatSelectedDate(state.selectedDate, false, locale) : tr('widget.appointment.choose_date', 'Choose a date');
          var slots = state.selectedDate ? normalizeSlotsForDate(cfg, state.selectedDate, locale) : [];
          if (!state.selectedDate) {
            slotsEl.innerHTML = '';
            emptyEl.style.display = '';
            emptyEl.textContent = tr('widget.appointment.choose_date_prompt', 'Choose a date to see available times.');
          } else if (!slots.length) {
            slotsEl.innerHTML = '';
            emptyEl.style.display = '';
            emptyEl.textContent = tr('widget.appointment.no_slots', 'No time slots available for this day.');
          } else {
            var slotHtml = '';
            for (var s = 0; s < slots.length; s++) {
              var slot = slots[s];
              var cls = ['mfw-appt-slot'];
              if (!slot.available) cls.push('booked');
              if (slot.value === state.selectedTime) cls.push('selected');
              slotHtml += '<button type="button" class="' + cls.join(' ') + '" data-time="' + esc(slot.value) + '"' + (!slot.available ? ' disabled aria-disabled="true"' : '') + '>' + esc(slot.label) + '</button>';
            }
            slotsEl.innerHTML = slotHtml;
            emptyEl.style.display = 'none';
            var slotBtns = slotsEl.querySelectorAll('.mfw-appt-slot:not(.booked)');
            for (var b = 0; b < slotBtns.length; b++) {
              slotBtns[b].addEventListener('click', function (ev) {
                var target = ev.currentTarget as HTMLElement;
                state.selectedTime = target.getAttribute('data-time') || '';
                setHiddenValue(hidden, state, cfg, getWrapLocale());
                renderAll();
                setOpen(false);
              });
            }
          }

          if (state.selectedDate && state.selectedTime && summaryEl && confirmEl) {
            summaryEl.innerHTML = '' +
              '<div class="mfw-appt-summary-row"><span class="mfw-appt-summary-label">' + esc(tr('widget.appointment.date', 'Date')) + '</span><span class="mfw-appt-summary-value">' + esc(formatSelectedDate(state.selectedDate, true, locale)) + '</span></div>' +
              '<div class="mfw-appt-summary-row"><span class="mfw-appt-summary-label">' + esc(tr('widget.appointment.time', 'Time')) + '</span><span class="mfw-appt-summary-value">' + esc(formatTimeLabel(state.selectedTime, cfg.timeFormat || '12h', locale)) + '</span></div>';
            confirmEl.style.display = '';
          } else if (summaryEl && confirmEl) {
            summaryEl.innerHTML = '';
            confirmEl.style.display = 'none';
          }
        };



        var syncCompactDays = function (): void {
          if (!compactDaysEl) return;
          var locale = getWrapLocale();
          var start = state.windowStart || todayLocal();
          compactDaysEl.innerHTML = buildCompactDaysHtml(cfg, start, state.selectedDate, locale);
          var dayBtns = compactDaysEl.querySelectorAll('.mfw-appt-compact-day');
          var firstDate = '';
          var hasSelected = false;
          if (dayBtns.length) {
            firstDate = (dayBtns[0] as HTMLElement).getAttribute('data-date') || '';
          }
          for (var di = 0; di < dayBtns.length; di++) {
            if (((dayBtns[di] as HTMLElement).getAttribute('data-date') || '') === state.selectedDate) { hasSelected = true; break; }
          }
          if ((!state.selectedDate || !hasSelected) && firstDate) {
            if (state.selectedDate !== firstDate) state.selectedTime = '';
            state.selectedDate = firstDate;
          }
          for (var idx = 0; idx < dayBtns.length; idx++) {
            dayBtns[idx].addEventListener('click', function (ev) {
              var target = ev.currentTarget as HTMLElement;
              var nextDate = target.getAttribute('data-date') || '';
              if (!nextDate) return;
              state.selectedDate = nextDate;
              state.selectedTime = '';
              renderAll();
            });
          }
        };

        var renderAll = function (): void {
          var locale = getWrapLocale();
          wrap.setAttribute('data-mf-locale', locale);
          wrap.setAttribute('lang', locale);
          if (dateValue) {
          dateValue.textContent = formatTriggerValue(state.selectedDate, state.selectedTime, cfg, locale);
          dateValue.classList.toggle('is-filled', !!(state.selectedDate && state.selectedTime));
        }
          if (tzEl) tzEl.innerHTML = '<span class="mfw-appt-timezone-icon">&#9716;</span><span>' + esc(getTimezoneLabel(locale)) + '</span>';
          if ((cfg.displayStyle || 'calendar') === 'compact') {
            syncCompactDays();
            syncSlots();
          } else {
            syncMonthYear();
            syncCalendar();
            syncSlots();
          }
          setHiddenValue(hidden, state, cfg, locale);
        };

        if (monthSelect) {
          monthSelect.addEventListener('change', function () {
            state.currentMonth = new Date(state.currentMonth.getFullYear(), parseInt(monthSelect.value, 10), 1);
            renderAll();
          });
        }
        if (yearSelect) {
          yearSelect.addEventListener('change', function () {
            state.currentMonth = new Date(parseInt(yearSelect.value, 10), state.currentMonth.getMonth(), 1);
            renderAll();
          });
        }
        if (prevBtn) {
          prevBtn.addEventListener('click', function () {
            if ((cfg.displayStyle || 'calendar') === 'compact') {
              state.windowStart = addDays(state.windowStart || todayLocal(), -(cfg.compactVisibleDays || 5));
              var today2 = todayLocal();
              if (state.windowStart < today2) state.windowStart = today2;
            } else {
              state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
            }
            renderAll();
          });
        }
        if (nextBtn) {
          nextBtn.addEventListener('click', function () {
            if ((cfg.displayStyle || 'calendar') === 'compact') {
              state.windowStart = addDays(state.windowStart || todayLocal(), (cfg.compactVisibleDays || 5));
            } else {
              state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
            }
            renderAll();
          });
        }
        if (todayBtn) {
          todayBtn.addEventListener('click', function (ev) {
            if (ev) ev.preventDefault();
            var today = todayLocal();
            if (!isOpen) {
              state.currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
              state.windowStart = today;
            }
            setOpen(!isOpen);
            renderAll();
          });
        }
        if (changeBtn) {
          changeBtn.addEventListener('click', function () {
            state.selectedTime = '';
            setHiddenValue(hidden, state, cfg, getWrapLocale());
            setOpen(true);
            renderAll();
          });
        }

        document.addEventListener('click', function (ev) {
          if (!isOpen) return;
          var target = ev.target as Node | null;
          if (target && !wrap.contains(target)) setOpen(false);
        });

        if (!state.selectedDate && hidden && hidden.value) {
          var hiddenData = safeJsonParse(hidden.value);
          if (typeof hiddenData.date === 'string') state.selectedDate = hiddenData.date;
          if (typeof hiddenData.time === 'string') state.selectedTime = hiddenData.time;
        }
        if (state.selectedDate) {
          var selectedDateObj = parseIsoDate(state.selectedDate);
          if (selectedDateObj) state.windowStart = selectedDateObj;
        }

        renderAll();
      }
    },
    collect: function (key: string, container: Element): string {
      var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
      return el ? el.value : '';
    },
    validate: function (key: string, container: Element): boolean {
      var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
      if (!el || !el.value) return false;
      try {
        var data = JSON.parse(el.value);
        return !!(data && data.date && data.time);
      } catch (_err) {
        return false;
      }
    }
  });
})();
