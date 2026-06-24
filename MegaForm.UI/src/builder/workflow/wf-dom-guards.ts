// wf-dom-guards.ts — shared workflow panel event guards + safe button props

export function isInteractiveWorkflowTarget(target: any): boolean {
  if (!target) return false;
  var tag = String(target.tagName || '');
  if (target.isContentEditable) return true;
  if (/^(INPUT|TEXTAREA|SELECT|OPTION|BUTTON|A|LABEL)$/i.test(tag)) return true;
  if (typeof target.closest === 'function') {
    return !!target.closest(
      'button, a, input, textarea, select, option, label, [contenteditable="true"], '
      + '.mf-rf-picker__menu, .mf-rf-picker, '
      + '.mf-rf-sidepanel__collapse, .mf-rf-sidepanel__peek, .mf-rf-sidepanel__peek-tab, '
      + '.mf-rf-cfg-btn, .mf-rf-cfg-check, .mf-rf-radio, '
      + '.mf-rf-tb-btn, .mf-rf-tb-icon-btn, .mf-rf-testrun__close, '
      + '.mf-rf-email-compose, .mf-rf-email-row, .mf-rf-email-row__input, .mf-rf-email-row__input-wrap, '
      + '.mf-rf-email-toolbar, .mf-rf-email-tb-btn, .mf-rf-email-body, '
      + '.mf-rf-email-preview-panel, .mf-rf-email-preview-toggle, .mf-rf-tokenboard, .mf-rf-tokenboard__chip, '
      + '.mf-rf-tokenboard__token, .mf-rf-tokenboard__copy'
    );
  }
  return false;
}

export function swallowWorkflowPanelEvent(e: any): void {
  if (!e) return;
  var target = e.target as any;
  if (isInteractiveWorkflowTarget(target)) return;
  if (e.stopPropagation) e.stopPropagation();
}

export function buttonProps(extra?: any): any {
  return Object.assign({ type: 'button' }, extra || {});
}
