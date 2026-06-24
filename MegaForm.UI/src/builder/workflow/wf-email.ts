// wf-email.ts — SendEmail node helpers extracted from workflow/index.ts

import { buttonProps } from './wf-dom-guards';

function stopEmailPanelBubble(e: any): void {
  if (!e) return;
  if (e.stopPropagation) e.stopPropagation();
}

function mergeGuardProps(props?: any): any {
  var next = Object.assign({}, props || {});
  var cls = String(next.className || '').trim();
  next.className = (cls ? cls + ' ' : '') + 'nodrag nopan nowheel';
  next.onPointerDown = function (e: any) { stopEmailPanelBubble(e); if (props && props.onPointerDown) props.onPointerDown(e); };
  next.onMouseDown = function (e: any) { stopEmailPanelBubble(e); if (props && props.onMouseDown) props.onMouseDown(e); };
  next.onClick = function (e: any) { stopEmailPanelBubble(e); if (props && props.onClick) props.onClick(e); };
  next.onDoubleClick = function (e: any) { stopEmailPanelBubble(e); if (props && props.onDoubleClick) props.onDoubleClick(e); };
  next.onWheel = function (e: any) { stopEmailPanelBubble(e); if (props && props.onWheel) props.onWheel(e); };
  next.onTouchStart = function (e: any) { stopEmailPanelBubble(e); if (props && props.onTouchStart) props.onTouchStart(e); };
  return next;
}

function renderEmailTokenBoard(ctx: any): any {
  var h = ctx.h;
  var sourceTokens = ctx.getSchemaSourceTokenOptions();
  var fieldTokens = sourceTokens.filter(function (x: any) { return x.kind === 'field'; }).map(function (x: any) { return { token: x.value, title: x.label }; });
  var variableTokens = sourceTokens.filter(function (x: any) { return x.kind === 'variable'; }).map(function (x: any) { return { token: x.value, title: x.label }; });
  if (!fieldTokens.length && !variableTokens.length) return null;
  function copyToken(token: string): void {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(token);
        return;
      }
    } catch (_err) {}
    try {
      var ta = document.createElement('textarea');
      ta.value = token;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return;
    } catch (_err2) {}
    try { window.prompt('Copy token:', token); } catch (_err3) {}
  }
  function tokenChip(item: any, cls?: string): any {
    return h('div', mergeGuardProps({ key: item.token, className: 'mf-rf-tokenboard__chip' + (cls ? ' ' + cls : '') }),
      h('button', buttonProps({ className: 'mf-rf-tokenboard__token', title: item.title, onClick: function () { copyToken(item.token); } }), item.token),
      h('button', buttonProps({ className: 'mf-rf-tokenboard__copy', title: 'Copy token', onClick: function () { copyToken(item.token); } }), 'Copy')
    );
  }
  return h('div', mergeGuardProps({ className: 'mf-rf-helper-card', style: { marginTop: 10, marginBottom: 12 } }),
    h('strong', null, 'Available tokens'),
    h('div', { style: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 8 } }, 'Copy a token once, then paste it into To, Cc, Reply-To, Subject, or Body.'),
    fieldTokens.length ? h('div', null,
      h('div', { className: 'mf-rf-picker__section-label', style: { marginBottom: 6 } }, 'Form fields'),
      h('div', mergeGuardProps({ className: 'mf-rf-tokenboard' }), fieldTokens.map(function (item: any) { return tokenChip(item); }))
    ) : null,
    variableTokens.length ? h('div', { style: { marginTop: fieldTokens.length ? 8 : 0 } },
      h('div', { className: 'mf-rf-picker__section-label', style: { marginBottom: 6 } }, 'Workflow variables'),
      h('div', mergeGuardProps({ className: 'mf-rf-tokenboard' }), variableTokens.map(function (item: any) { return tokenChip(item, 'mf-rf-tokenboard__chip--sys'); }))
    ) : null
  );
}

export function renderSendEmailConfig(ctx: any): any {
  var h = ctx.h;
  var config = ctx.config || {};
  var setConfig = ctx.setConfig;
  var showPreview = !!ctx.showPreview;
  var setShowPreview = ctx.setShowPreview;
  var getSchemaSourceTokenOptions = ctx.getSchemaSourceTokenOptions;
  var renderSimpleTokensHtml = ctx.renderSimpleTokensHtml;
  var FieldInsertButton = ctx.FieldInsertButton;

  var toVal = String(config.to || '');
  var ccVal = String(config.cc || '');
  var replyToVal = String(config.replyTo || '');
  var subjectVal = String(config.subject || '');
  var bodyVal = String(config.body || '');
  var emailBadge = 'Email setting v20260331-07';

  function patchEmail(next: any): void {
    setConfig(Object.assign({}, config, next));
  }
  function applyEmailSample(kind: string): void {
    if (kind === 'confirmation') {
      patchEmail({
        subject: subjectVal || 'We received your submission',
        body: bodyVal || '<p>Hello <strong>{{field.full_name}}</strong>,</p><p>Thanks for your submission. We will review it and email <strong>{{field.work_email}}</strong> with the next steps.</p>',
        replyTo: replyToVal || ''
      });
      return;
    }
    if (kind === 'internal-alert') {
      patchEmail({
        to: toVal || 'ops@example.com',
        subject: subjectVal || 'New submission: {{field.full_name}}',
        body: bodyVal || '<p>A new submission is ready for review.</p><ul><li>Name: {{field.full_name}}</li><li>Email: {{field.work_email}}</li><li>Route: {{variable.route}}</li></ul>',
        cc: ccVal || ''
      });
    }
  }
  function insertFormatting(wrap: string): void {
    var ta = document.getElementById('mf-wf-email-body') as HTMLTextAreaElement | null;
    if (!ta) return;
    var s = ta.selectionStart || 0;
    var e2 = ta.selectionEnd || 0;
    var sel = ta.value.substring(s, e2);
    var newVal = ta.value.substring(0, s) + wrap + sel + wrap + ta.value.substring(e2);
    patchEmail({ body: newVal });
    setTimeout(function(){ if (ta){ ta.focus(); ta.setSelectionRange(s + wrap.length, e2 + wrap.length); } }, 0);
  }
  function insertSnippet(text: string): void {
    var ta = document.getElementById('mf-wf-email-body') as HTMLTextAreaElement | null;
    var pos = ta ? (ta.selectionStart || 0) : bodyVal.length;
    var newVal = bodyVal.substring(0, pos) + text + bodyVal.substring(pos);
    patchEmail({ body: newVal });
  }

  if (showPreview) {
    return h('div', mergeGuardProps({ className: 'mf-rf-email-preview-panel' }),
      h('div', mergeGuardProps({ className: 'mf-rf-email-preview-panel__header' }),
        h('div', { className: 'mf-rf-email-preview-panel__subject' }, subjectVal || '(no subject)'),
        h('button', buttonProps({ className: 'mf-rf-email-preview-toggle is-active', onClick: function(){ setShowPreview(false); } }),
          h('svg', { width:13, height:13, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, h('circle', { cx:12, cy:12, r:10 }), h('path', { d:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z' }), h('circle', { cx:12, cy:12, r:3 })),
          ' Preview'
        )
      ),
      h('div', mergeGuardProps({ className: 'mf-rf-email-preview-panel__meta' }),
        h('span', { className: 'mf-rf-email-preview-panel__label' }, 'To:'),
        h('span', { className: 'mf-rf-email-preview-panel__value' }, toVal || '—')
      ),
      h('div', mergeGuardProps({ className: 'mf-rf-email-preview-panel__meta' }),
        h('span', { className: 'mf-rf-email-preview-panel__label' }, 'Subject:'),
        h('span', { className: 'mf-rf-email-preview-panel__value' }, subjectVal || '—')
      ),
      h('div', mergeGuardProps({ className: 'mf-rf-email-preview-panel__body', dangerouslySetInnerHTML: { __html: renderSimpleTokensHtml(bodyVal) || '<em style="color:#94a3b8">No body yet.</em>' } })),
      h('div', { style: { marginTop: 10, textAlign: 'right' } },
        h('span', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: 700 } }, emailBadge)
      )
    );
  }

  return h('div', mergeGuardProps({ className: 'mf-rf-email-compose' }),
    h('div', mergeGuardProps({ className: 'mf-rf-helper-card', style: { marginBottom: 12 } }),
      h('strong', null, 'Email template'),
      h('div', null, 'Use form-field tokens and workflow variables in To, Subject, and Body.'),
      h('div', mergeGuardProps({ style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 } }),
        h('button', buttonProps({ className: 'mf-rf-cfg-btn', onClick: function(){ applyEmailSample('confirmation'); } }), 'Sample: Confirmation'),
        h('button', buttonProps({ className: 'mf-rf-cfg-btn', onClick: function(){ applyEmailSample('internal-alert'); } }), 'Sample: Internal Alert')
      )
    ),
    renderEmailTokenBoard({ h: h, getSchemaSourceTokenOptions: getSchemaSourceTokenOptions }),
    h('div', mergeGuardProps({ className: 'mf-rf-email-compose__header' }),
      h('span', { className: 'mf-rf-email-compose__title' }, 'EMAIL TEMPLATE'),
      h('button', buttonProps({ className: 'mf-rf-email-preview-toggle', onClick: function(){ setShowPreview(true); } }),
        h('svg', { width:13, height:13, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, h('circle', { cx:12, cy:12, r:10 }), h('path', { d:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z' }), h('circle', { cx:12, cy:12, r:3 })),
        ' Preview'
      )
    ),
    h('div', mergeGuardProps({ className: 'mf-rf-email-row' }),
      h('span', { className: 'mf-rf-email-row__label' }, 'To:'),
      h('div', mergeGuardProps({ className: 'mf-rf-email-row__input-wrap' }),
        h('input', mergeGuardProps({ className: 'mf-rf-email-row__input', id: 'mf-wf-email-to', placeholder: '{{field.work_email}}', value: toVal, onChange: function(e: any){ patchEmail({ to: e.target.value }); } })),
        h(FieldInsertButton, { targetId: 'mf-wf-email-to' })
      )
    ),
    h('div', mergeGuardProps({ className: 'mf-rf-email-row' }),
      h('span', { className: 'mf-rf-email-row__label' }, 'Cc:'),
      h('div', mergeGuardProps({ className: 'mf-rf-email-row__input-wrap' }),
        h('input', mergeGuardProps({ className: 'mf-rf-email-row__input', id: 'mf-wf-email-cc', placeholder: '{{field.manager_email}}', value: ccVal, onChange: function(e: any){ patchEmail({ cc: e.target.value }); } })),
        h(FieldInsertButton, { targetId: 'mf-wf-email-cc' })
      )
    ),
    h('div', mergeGuardProps({ className: 'mf-rf-email-row' }),
      h('span', { className: 'mf-rf-email-row__label' }, 'Reply-To:'),
      h('div', mergeGuardProps({ className: 'mf-rf-email-row__input-wrap' }),
        h('input', mergeGuardProps({ className: 'mf-rf-email-row__input', id: 'mf-wf-email-replyto', placeholder: 'support@example.com', value: replyToVal, onChange: function(e: any){ patchEmail({ replyTo: e.target.value }); } })),
        h(FieldInsertButton, { targetId: 'mf-wf-email-replyto' })
      )
    ),
    h('div', mergeGuardProps({ className: 'mf-rf-email-row' }),
      h('span', { className: 'mf-rf-email-row__label' }, 'Subject:'),
      h('div', mergeGuardProps({ className: 'mf-rf-email-row__input-wrap' }),
        h('input', mergeGuardProps({ className: 'mf-rf-email-row__input', id: 'mf-wf-email-subject', placeholder: 'Your request has been submitted', value: subjectVal, onChange: function(e: any){ patchEmail({ subject: e.target.value }); } })),
        h(FieldInsertButton, { targetId: 'mf-wf-email-subject' })
      )
    ),
    h('div', mergeGuardProps({ className: 'mf-rf-email-toolbar' }),
      h('button', buttonProps({ className:'mf-rf-email-tb-btn', title:'Insert token braces', onClick: function(){ insertSnippet('{{field.}}'); } }), h('span', { style:{fontFamily:'monospace',fontWeight:700,fontSize:12} }, 'T')),
      h('button', buttonProps({ className:'mf-rf-email-tb-btn', title:'Bold', onClick: function(){ insertFormatting('<strong>'); } }), h('b', null, 'B')),
      h('button', buttonProps({ className:'mf-rf-email-tb-btn', title:'Italic', onClick: function(){ insertFormatting('<em>'); } }), h('i', null, 'I')),
      h('button', buttonProps({ className:'mf-rf-email-tb-btn', title:'List', onClick: function(){ insertSnippet('\n- item\n- item\n'); } }),
        h('svg', { width:13, height:13, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, h('line', { x1:9, y1:6, x2:20, y2:6 }), h('line', { x1:9, y1:12, x2:20, y2:12 }), h('line', { x1:9, y1:18, x2:20, y2:18 }), h('circle', { cx:4, cy:6, r:1 }), h('circle', { cx:4, cy:12, r:1 }), h('circle', { cx:4, cy:18, r:1 }))
      ),
      h('button', buttonProps({ className:'mf-rf-email-tb-btn', title:'Link', onClick: function(){ insertSnippet('<a href="#">link</a>'); } }),
        h('svg', { width:13, height:13, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, h('path', { d:'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }), h('path', { d:'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }))
      ),
      h(FieldInsertButton, { targetId: 'mf-wf-email-body' })
    ),
    h('textarea', mergeGuardProps({ id: 'mf-wf-email-body', className: 'mf-rf-email-body', placeholder: 'Hi {{field.full_name}},\n\nThank you for your submission...\n\nBest regards,\nThe Team', value: bodyVal, rows: 14, onChange: function(e: any){ patchEmail({ body: e.target.value }); } }))
    , h('div', { style: { marginTop: 10, textAlign: 'right' } },
      h('span', { className: 'mf-rf-helper-badge', style: { display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: 700 } }, emailBadge)
    )
  );
}
