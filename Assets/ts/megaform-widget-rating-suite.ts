/**
 * MegaForm Widget: Rating Suite
 * Badge: RatingSuite v20260402-13
 *
 * Canonical TS source for Star Rating / Likert / NPS.
 * Build output: Assets/js/plugins/megaform-widget-rating-suite.js
 */

declare const MegaFormWidgets: {
  register(type: string, plugin: any): void;
};

(function () {
  "use strict";

  var W = MegaFormWidgets;
  var BADGE = "RatingSuite v20260402-13";

  function esc(s: any): string {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function tr(key: string, fallback: string, params?: Record<string, string | number>): string {
    try {
      var i18n = (window as any).MegaFormI18n;
      if (i18n && typeof i18n.t === 'function') {
        var out = i18n.t(key, params || {});
        if (out && out !== key) return String(out);
      }
    } catch (_err) { }
    var raw = fallback;
    if (params) {
      Object.keys(params).forEach(function (name) { raw = raw.replace(new RegExp('\\{' + name + '\\}', 'g'), String((params as any)[name] == null ? '' : (params as any)[name])); });
    }
    return raw;
  }

  W.register("Rating", {
    meta: { label: "Star Rating", icon: "fa-star", category: "advanced" },
    defaults: { maxStars: 5, style: "stars", showLabels: true, labelLow: tr("widget.rating.low", "Poor"), labelHigh: tr("widget.rating.high", "Excellent"), allowHalf: false, color: "#fbbf24", size: 32 },
    properties: [
      { key: "maxStars", label: "Max Stars • RatingSuite v20260402-10", type: "number", default: 5 },
      { key: "style", label: "Style", type: "select", options: [{ label: "★ Stars", value: "stars" }, { label: "😀 Emoji", value: "emoji" }, { label: "👍 Thumbs", value: "thumbs" }, { label: "♥ Hearts", value: "hearts" }], default: "stars" },
      { key: "showLabels", label: "Show Low / High Labels", type: "checkbox", default: true },
      { key: "labelLow", label: "Low Label", type: "text", default: "Poor" },
      { key: "labelHigh", label: "High Label", type: "text", default: "Excellent" },
      { key: "color", label: "Active Color", type: "color", default: "#fbbf24" },
      { key: "size", label: "Size (px)", type: "number", default: 32 }
    ],
    render: function (field: any, formId: any, val: any) {
      var id = "mf-" + formId + "-" + field.key;
      var wp = field.widgetProps || {};
      var max = wp.maxStars || 5;
      var style = wp.style || "stars";
      var size = wp.size || 32;
      var color = wp.color || "#fbbf24";
      var showLabels = wp.showLabels !== false;
      var current = parseInt(val || "0", 10) || 0;
      var icons: any = {
        stars: ["☆", "★"],
        emoji: ["😐", "😊"],
        thumbs: ["👎", "👍"],
        hearts: ["♡", "♥"]
      };
      var emojiScale = ["😡", "😟", "😐", "🙂", "😊", "😃", "🤩", "💯", "🔥", "🏆"];
      var pair = icons[style] || icons.stars;
      var html = '<div class="mfw-rating-wrap" id="' + id + '-wrap" data-field-key="' + esc(field.key) + '" data-badge="' + esc(BADGE) + '">';
      if (field.label) html += '<div class="mfw-rating-field-label">' + esc(field.label) + '</div>';
      if (showLabels) html += '<div class="mfw-rating-labels"><span>' + esc(wp.labelLow || tr("widget.rating.low", "Poor")) + '</span><span>' + esc(wp.labelHigh || tr("widget.rating.high", "Excellent")) + '</span></div>';
      html += '<div class="mfw-rating-items" data-max="' + max + '" data-style="' + style + '" data-color="' + esc(color) + '">';
      for (var i = 1; i <= max; i++) {
        var filled = i <= current;
        var icon = style === "emoji" ? emojiScale[Math.min(i - 1, emojiScale.length - 1)] : (filled ? pair[1] : pair[0]);
        html += '<span class="mfw-rating-item' + (filled ? ' active' : '') + '" data-val="' + i + '" tabindex="0" style="font-size:' + size + 'px;color:' + (filled ? color : '#d0d5dd') + ';cursor:pointer;">' + icon + '</span>';
      }
      html += '</div>';
      html += '<div class="mfw-rating-value" id="' + id + '-display">' + (current > 0 ? esc(tr('widget.rating.value', 'Selected rating: {value}/{max}', { value: current, max: max })) : '') + '</div>';
      html += '<input type="hidden" name="' + field.key + '" id="' + id + '" value="' + (val || '') + '">';
      html += '<div class="mf-field-error" id="mf-err-' + field.key + '"></div></div>';
      return html;
    },
    bind: function (_formId: any) {
      Array.prototype.forEach.call(document.querySelectorAll('.mfw-rating-wrap'), function (wrap: any) {
        var items = wrap.querySelector('.mfw-rating-items');
        if (!items || items._ratBound) return;
        items._ratBound = true;
        var hidden = wrap.querySelector('input[type="hidden"]');
        var display = wrap.querySelector('.mfw-rating-value');
        var max = parseInt(items.getAttribute('data-max') || '5', 10);
        var style = items.getAttribute('data-style') || 'stars';
        var color = items.getAttribute('data-color') || '#fbbf24';
        Array.prototype.forEach.call(items.querySelectorAll('.mfw-rating-item'), function (item: any) {
          item.addEventListener('mouseenter', function () {
            var val = parseInt(item.getAttribute('data-val') || '0', 10);
            highlightStars(items, val);
          });
          item.addEventListener('click', function () {
            var val = parseInt(item.getAttribute('data-val') || '0', 10);
            hidden.value = String(val);
            if (display) display.textContent = tr('widget.rating.value', 'Selected rating: {value}/{max}', { value: val, max: max });
            setStars(items, val, style, color);
          });
          item.addEventListener('keydown', function (ev: KeyboardEvent) {
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            ev.preventDefault();
            item.click();
          });
        });
        items.addEventListener('mouseleave', function () {
          var cur = parseInt(hidden.value || '0', 10);
          setStars(items, cur, style, color);
        });
      });
    },
    collect: function (key: string, container: Element) {
      var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
      return el ? el.value : '';
    },
    validate: function (key: string, container: Element) {
      var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
      return !!(el && el.value && parseInt(el.value, 10) > 0);
    }
  });

  function setStars(container: Element, val: number, style: string, color: string): void {
    Array.prototype.forEach.call(container.querySelectorAll('.mfw-rating-item'), function (item: any) {
      var iv = parseInt(item.getAttribute('data-val') || '0', 10);
      var filled = iv <= val;
      item.classList.toggle('active', filled);
      item.style.opacity = '1';
      item.style.color = filled ? color : '#d0d5dd';
      if (style !== 'emoji') {
        if (style === 'stars') item.textContent = filled ? '★' : '☆';
        else if (style === 'thumbs') item.textContent = filled ? '👍' : '👎';
        else if (style === 'hearts') item.textContent = filled ? '♥' : '♡';
      }
    });
  }

  function highlightStars(container: Element, val: number): void {
    Array.prototype.forEach.call(container.querySelectorAll('.mfw-rating-item'), function (item: any) {
      var iv = parseInt(item.getAttribute('data-val') || '0', 10);
      item.style.opacity = iv <= val ? '1' : '0.42';
    });
  }

  W.register("Likert", {
    meta: { label: "Likert Scale", icon: "fa-th", category: "advanced" },
    defaults: {
      rows: [{ key: "q1", label: tr("widget.likert.quality_of_service", "Quality of service") }, { key: "q2", label: tr("widget.likert.value_for_money", "Value for money") }, { key: "q3", label: tr("widget.likert.would_recommend", "Would recommend") }],
      columns: [tr("widget.likert.strongly_disagree", "Strongly Disagree"), tr("widget.likert.disagree", "Disagree"), tr("widget.likert.neutral", "Neutral"), tr("widget.likert.agree", "Agree"), tr("widget.likert.strongly_agree", "Strongly Agree")],
      style: "radio"
    },
    properties: [
      { key: "style", label: "Style • RatingSuite v20260402-10", type: "select", options: [{ label: "Radio", value: "radio" }, { label: "Buttons", value: "buttons" }], default: "radio" }
    ],
    render: function (field: any, formId: any, val: any) {
      var id = "mf-" + formId + "-" + field.key;
      var wp = field.widgetProps || {};
      var rows = wp.rows || [{ key: "q1", label: tr("widget.likert.question_1", "Question 1") }];
      var columns = wp.columns || ["1", "2", "3", "4", "5"];
      var values: any = {};
      try { values = JSON.parse(val || '{}'); } catch (_err) { values = {}; }
      var html = '<div class="mfw-likert-wrap" id="' + id + '-wrap" data-field-key="' + esc(field.key) + '">';
      if (field.label) html += '<div class="mfw-likert-field-label">' + esc(field.label) + '</div>';
      html += '<div class="mfw-likert-scroll"><table class="mfw-likert-table"><thead><tr><th></th>';
      columns.forEach(function (col: string) { html += '<th class="mfw-likert-col-header">' + esc(col) + '</th>'; });
      html += '</tr></thead><tbody>';
      rows.forEach(function (row: any) {
        html += '<tr><td class="mfw-likert-row-label">' + esc(row.label) + '</td>';
        columns.forEach(function (_col: string, ci: number) {
          var checked = values[row.key] === String(ci + 1) ? ' checked' : '';
          html += '<td class="mfw-likert-cell"><input type="radio" name="' + id + '_' + esc(row.key) + '" value="' + (ci + 1) + '" data-row="' + esc(row.key) + '"' + checked + '></td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      html += '<input type="hidden" name="' + field.key + '" id="' + id + '" value="' + esc(val || '{}') + '">';
      html += '<div class="mf-field-error" id="mf-err-' + field.key + '"></div></div>';
      return html;
    },
    bind: function (_formId: any) {
      Array.prototype.forEach.call(document.querySelectorAll('.mfw-likert-wrap'), function (wrap: any) {
        if (wrap._likBound) return;
        wrap._likBound = true;
        var hidden = wrap.querySelector('input[type="hidden"]');
        Array.prototype.forEach.call(wrap.querySelectorAll('input[type="radio"]'), function (radio: any) {
          radio.addEventListener('change', function () {
            var data: any = {};
            Array.prototype.forEach.call(wrap.querySelectorAll('input[type="radio"]:checked'), function (r: any) {
              data[r.getAttribute('data-row') || ''] = r.value;
            });
            hidden.value = JSON.stringify(data);
          });
        });
      });
    },
    collect: function (key: string, container: Element) {
      var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
      return el ? el.value : '{}';
    },
    validate: function (key: string, container: Element) {
      var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
      if (!el) return false;
      try { var d = JSON.parse(el.value || '{}'); return Object.keys(d).length > 0; }
      catch (_err) { return false; }
    }
  });

  W.register("NPS", {
    meta: { label: "NPS Score", icon: "fa-chart-bar", category: "advanced" },
    defaults: { question: tr("widget.nps.question", "How likely are you to recommend us?"), showLabels: true },
    properties: [
      { key: "question", label: "Question • RatingSuite v20260402-13", type: "text", default: "How likely are you to recommend us?" },
      { key: "showLabels", label: "Show Labels", type: "checkbox", default: true }
    ],
    render: function (field: any, formId: any, val: any) {
      var id = "mf-" + formId + "-" + field.key;
      var wp = field.widgetProps || {};
      var question = wp.question || tr("widget.nps.question", "How likely are you to recommend us?");
      var current = parseInt(val || '-1', 10);
      var html = '<div class="mfw-nps-wrap" id="' + id + '-wrap" data-field-key="' + esc(field.key) + '">';
      if (field.label) html += '<div class="mfw-likert-field-label">' + esc(field.label) + '</div>';
      html += '<div class="mfw-nps-question">' + esc(question) + '</div>';
      html += '<div class="mfw-nps-scale">';
      for (var i = 0; i <= 10; i++) {
        var cls = 'mfw-nps-btn';
        if (i === current) cls += ' selected';
        if (i <= 6) cls += ' detractor'; else if (i <= 8) cls += ' passive'; else cls += ' promoter';
        html += '<button type="button" class="' + cls + '" data-val="' + i + '">' + i + '</button>';
      }
      html += '</div>';
      if (wp.showLabels !== false) html += '<div class="mfw-nps-labels"><span>' + esc(tr('widget.nps.not_likely', 'Not at all likely')) + '</span><span>' + esc(tr('widget.nps.extremely_likely', 'Extremely likely')) + '</span></div>';
      html += '<div class="mfw-nps-feedback" id="' + id + '-feedback"></div>';
      html += '<input type="hidden" name="' + field.key + '" id="' + id + '" value="' + (val || '') + '">';
      html += '<div class="mf-field-error" id="mf-err-' + field.key + '"></div></div>';
      return html;
    },
    bind: function (_formId: any) {
      Array.prototype.forEach.call(document.querySelectorAll('.mfw-nps-wrap'), function (wrap: any) {
        if (wrap._npsBound) return;
        wrap._npsBound = true;
        var hidden = wrap.querySelector('input[type="hidden"]');
        var feedback = wrap.querySelector('.mfw-nps-feedback');
        Array.prototype.forEach.call(wrap.querySelectorAll('.mfw-nps-btn'), function (btn: any) {
          btn.addEventListener('click', function () {
            Array.prototype.forEach.call(wrap.querySelectorAll('.mfw-nps-btn'), function (b: any) { b.classList.remove('selected'); });
            btn.classList.add('selected');
            var val = btn.getAttribute('data-val') || '0';
            hidden.value = val;
            var n = parseInt(val, 10);
            if (feedback) {
              if (n <= 6) feedback.textContent = '😟 ' + tr('widget.nps.feedback.detractor', "We're sorry to hear that. How can we improve?");
              else if (n <= 8) feedback.textContent = '🙂 ' + tr('widget.nps.feedback.passive', 'Thanks! What would make it a 10?');
              else feedback.textContent = '🎉 ' + tr('widget.nps.feedback.promoter', "Amazing! We're glad you love us!");
              feedback.className = 'mfw-nps-feedback ' + (n <= 6 ? 'detractor' : n <= 8 ? 'passive' : 'promoter');
            }
          });
        });
      });
    },
    collect: function (key: string, container: Element) {
      var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
      return el ? el.value : '';
    },
    validate: function (key: string, container: Element) {
      var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
      return !!(el && el.value !== '');
    }
  });
})();
