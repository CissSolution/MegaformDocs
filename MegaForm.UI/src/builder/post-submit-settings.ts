import { MegaFormBuilder } from './core';

(function () {
  'use strict';

  var B = MegaFormBuilder;
  var bound = false;
  var tokenTargetId = 'mf-setting-success-msg';

  function ensureSettings(): any {
    if (!B.state.schema.settings) B.state.schema.settings = {};
    var s = B.state.schema.settings as any;
    var root = (B.state && B.state.schema) ? (B.state.schema as any) : {};
    if (!s.postSubmitExperience) s.postSubmitExperience = {};
    var ps = s.postSubmitExperience;
    if (ps.Enabled == null && ps.enabled == null) ps.enabled = true;
    ps.mode = ps.mode || ps.Mode || 'rich';
    ps.title = ps.title || ps.Title || 'Submission received';
    ps.message = ps.message || ps.Message || s.successMessage || s.SuccessMessage || 'Thank you. We have received your submission.';
    if (ps.showSubmissionId == null && ps.ShowSubmissionId == null) ps.showSubmissionId = true;
    ps.submissionIdLabel = ps.submissionIdLabel || ps.SubmissionIdLabel || 'Submission ID';
    if (ps.showAnswerSummary == null && ps.ShowAnswerSummary == null) ps.showAnswerSummary = false;
    ps.answerSummaryTitle = ps.answerSummaryTitle || ps.AnswerSummaryTitle || 'Your answers';
    if (ps.hideEmptyAnswers == null && ps.HideEmptyAnswers == null) ps.hideEmptyAnswers = true;
    if (ps.allowFillAgain == null && ps.AllowFillAgain == null) ps.allowFillAgain = true;
    ps.fillAgainLabel = ps.fillAgainLabel || ps.FillAgainLabel || 'Submit another response';
    ps.redirectUrl = ps.redirectUrl || ps.RedirectUrl || s.redirectUrl || s.RedirectUrl || '';
    if (ps.redirectDelaySeconds == null && ps.RedirectDelaySeconds == null) ps.redirectDelaySeconds = 5;
    ps.redirectNotice = ps.redirectNotice || ps.RedirectNotice || 'Redirecting shortly…';
    if (ps.reviewBeforeSubmit == null && ps.ReviewBeforeSubmit == null) ps.reviewBeforeSubmit = false;
    ps.reviewTitle = ps.reviewTitle || ps.ReviewTitle || 'Review your answers';
    var btns = ps.buttons || ps.Buttons || [];
    if (!Array.isArray(btns)) btns = [];
    while (btns.length < 2) btns.push({ label: '', url: '', variant: btns.length === 0 ? 'primary' : 'secondary', newTab: false });
    ps.buttons = btns;
    return ps;
  }

  function getEl(id: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
    return document.getElementById(id) as any;
  }

  function val(id: string, fallback?: string): string {
    var el = getEl(id);
    return el ? (el.value || '') : (fallback || '');
  }

  function checked(id: string, fallback?: boolean): boolean {
    var el = document.getElementById(id) as HTMLInputElement | null;
    return el ? !!el.checked : !!fallback;
  }

  function setText(id: string, value: any): void {
    var el = getEl(id);
    if (el) el.value = value == null ? '' : String(value);
  }

  function setCheck(id: string, value: any): void {
    var el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.checked = !!value;
  }

  function getTokenList(): Array<{ label: string; token: string; hint?: string }> {
    var base = [
      { label: 'Submission ID', token: '{{submission:id}}', hint: 'Unique reference number' },
      { label: 'Form title', token: '{{form:title}}', hint: 'Current form title' },
      { label: 'Form description', token: '{{form:description}}', hint: 'Current form description' },
      { label: 'Current URL', token: '{{submission:url}}', hint: 'Current page URL' }
    ];
    try {
      var fields = B.getFieldList ? B.getFieldList(null) : [];
      (fields || []).forEach(function (f: any) {
        base.push({
          label: (f.label || f.key || 'Field') + ' · ' + (f.type || 'Text'),
          token: '{{field:' + f.key + '}}',
          hint: 'Submitted answer'
        });
      });
    } catch (_) { /* noop */ }
    return base;
  }

  function escapeHtml(value: string): string {
    return (value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderTokens(): void {
    var box = document.getElementById('mf-post-submit-token-list');
    if (!box) return;
    var html = getTokenList().map(function (x) {
      return '<button type="button" class="mf-ps-token" data-token="' + escapeHtml(x.token) + '" ' +
        'style="border:1px solid #dbeafe;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:4px 8px;font-size:11px;cursor:pointer">' +
        escapeHtml(x.token) + '</button>';
    }).join('');
    box.innerHTML = html;
    box.querySelectorAll<HTMLElement>('.mf-ps-token').forEach(function (btn) {
      btn.addEventListener('click', function () {
        insertToken((btn.getAttribute('data-token') || '').replace(/&quot;/g, '"'));
      });
    });
  }

  function insertToken(token: string): void {
    var el = getEl(tokenTargetId) as any;
    if (!el) return;
    var start = typeof el.selectionStart === 'number' ? el.selectionStart : (el.value || '').length;
    var end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
    var before = (el.value || '').slice(0, start);
    var after = (el.value || '').slice(end);
    el.value = before + token + after;
    var pos = start + token.length;
    try { el.setSelectionRange(pos, pos); } catch (_) { /* noop */ }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
  }

  function syncModeUi(mode: string): void {
    var delayWrap = document.getElementById('mf-setting-redirect-delay-wrap') as HTMLElement | null;
    var redUrl = document.getElementById('mf-setting-redirect') as HTMLElement | null;
    var redNotice = document.getElementById('mf-setting-redirect-notice') as HTMLElement | null;
    var summaryTitle = document.getElementById('mf-setting-answer-summary-title') as HTMLElement | null;
    var submissionLabel = document.getElementById('mf-setting-submission-id-label') as HTMLElement | null;
    var showSummary = checked('mf-setting-show-answer-summary');
    var showSubId = checked('mf-setting-show-submission-id');
    if (delayWrap) delayWrap.style.display = mode === 'redirect-timed' ? '' : 'none';
    if (redUrl) redUrl.closest('.form-group')!.style.display = mode === 'rich' ? '' : '';
    if (redNotice) redNotice.closest('.form-group')!.style.display = mode === 'redirect-timed' ? '' : 'none';
    if (summaryTitle) summaryTitle.closest('.form-group')!.style.display = showSummary ? '' : 'none';
    if (submissionLabel) submissionLabel.closest('.form-group')!.style.display = showSubId ? '' : 'none';
  }

  function readFromUi(): any {
    var ps = ensureSettings();
    ps.mode = val('mf-setting-post-submit-mode', 'rich') || 'rich';
    ps.title = val('mf-setting-success-title', 'Submission received');
    ps.message = val('mf-setting-success-msg', 'Thank you. We have received your submission.');
    ps.redirectUrl = val('mf-setting-redirect');
    ps.redirectDelaySeconds = Math.max(0, Math.min(120, parseInt(val('mf-setting-redirect-delay', '5'), 10) || 0));
    ps.redirectNotice = val('mf-setting-redirect-notice', 'Redirecting shortly…');
    ps.reviewBeforeSubmit = checked('mf-setting-review-before-submit', false);
    ps.reviewTitle = val('mf-setting-review-title', 'Review your answers');
    ps.showSubmissionId = checked('mf-setting-show-submission-id', true);
    ps.submissionIdLabel = val('mf-setting-submission-id-label', 'Submission ID');
    ps.showAnswerSummary = checked('mf-setting-show-answer-summary', false);
    ps.answerSummaryTitle = val('mf-setting-answer-summary-title', 'Your answers');
    ps.hideEmptyAnswers = checked('mf-setting-hide-empty-answers', true);
    ps.allowFillAgain = checked('mf-setting-fill-again', true);
    ps.fillAgainLabel = val('mf-setting-fill-again-label', 'Submit another response');
    ps.buttons = [
      {
        label: val('mf-setting-cta1-label'),
        url: val('mf-setting-cta1-url'),
        variant: 'primary',
        newTab: checked('mf-setting-cta1-newtab', false)
      },
      {
        label: val('mf-setting-cta2-label'),
        url: val('mf-setting-cta2-url'),
        variant: 'secondary',
        newTab: checked('mf-setting-cta2-newtab', false)
      }
    ];
    B.state.isDirty = true;
    syncModeUi(ps.mode);
    return ps;
  }

  function syncFromSchema(): void {
    var ps = ensureSettings();
    setText('mf-setting-post-submit-mode', ps.mode || 'rich');
    setText('mf-setting-success-title', ps.title || 'Submission received');
    setText('mf-setting-success-msg', ps.message || 'Thank you. We have received your submission.');
    setText('mf-setting-redirect', ps.redirectUrl || '');
    setText('mf-setting-redirect-delay', ps.redirectDelaySeconds == null ? 5 : ps.redirectDelaySeconds);
    setText('mf-setting-redirect-notice', ps.redirectNotice || 'Redirecting shortly…');
    setCheck('mf-setting-review-before-submit', !!ps.reviewBeforeSubmit);
    setText('mf-setting-review-title', ps.reviewTitle || 'Review your answers');
    setCheck('mf-setting-show-submission-id', ps.showSubmissionId !== false);
    setText('mf-setting-submission-id-label', ps.submissionIdLabel || 'Submission ID');
    setCheck('mf-setting-show-answer-summary', !!ps.showAnswerSummary);
    setText('mf-setting-answer-summary-title', ps.answerSummaryTitle || 'Your answers');
    setCheck('mf-setting-hide-empty-answers', ps.hideEmptyAnswers !== false);
    setCheck('mf-setting-fill-again', ps.allowFillAgain !== false);
    setText('mf-setting-fill-again-label', ps.fillAgainLabel || 'Submit another response');

    var btns = ps.buttons || [];
    setText('mf-setting-cta1-label', (btns[0] && btns[0].label) || '');
    setText('mf-setting-cta1-url', (btns[0] && btns[0].url) || '');
    setCheck('mf-setting-cta1-newtab', !!(btns[0] && btns[0].newTab));
    setText('mf-setting-cta2-label', (btns[1] && btns[1].label) || '');
    setText('mf-setting-cta2-url', (btns[1] && btns[1].url) || '');
    setCheck('mf-setting-cta2-newtab', !!(btns[1] && btns[1].newTab));

    renderTokens();
    syncModeUi(ps.mode || 'rich');
  }

  function bindUi(): void {
    if (bound) return;
    bound = true;

    [
      'mf-setting-post-submit-mode', 'mf-setting-success-title', 'mf-setting-success-msg', 'mf-setting-redirect',
      'mf-setting-redirect-delay', 'mf-setting-redirect-notice', 'mf-setting-review-title',
      'mf-setting-submission-id-label',
      'mf-setting-answer-summary-title', 'mf-setting-fill-again-label', 'mf-setting-cta1-label',
      'mf-setting-cta1-url', 'mf-setting-cta2-label', 'mf-setting-cta2-url'
    ].forEach(function (id) {
      var el = getEl(id);
      if (el) {
        el.addEventListener('input', readFromUi);
        el.addEventListener('focus', function () { tokenTargetId = id; });
      }
    });

    [
      'mf-setting-review-before-submit',
      'mf-setting-show-submission-id', 'mf-setting-show-answer-summary', 'mf-setting-hide-empty-answers',
      'mf-setting-fill-again', 'mf-setting-cta1-newtab', 'mf-setting-cta2-newtab'
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', readFromUi);
    });

    var modeEl = document.getElementById('mf-setting-post-submit-mode');
    if (modeEl) modeEl.addEventListener('change', readFromUi);
  }

  function getConfig(): any {
    return readFromUi();
  }

  B.registerModule('post-submit-settings', {
    init: function () {
      bindUi();
      syncFromSchema();
    },
    syncFromSchema: syncFromSchema,
    getConfig: getConfig
  });
})();

export {};
